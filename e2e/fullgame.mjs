// Complete-game rehearsal E2E (M3.3-B). Run `npm run build` first. Local Google Chrome.
//
//   node e2e/fullgame.mjs                       # all scenarios
//   SCENARIO=main|restart|rooms|nowinner OUT=<dir for screenshots> node e2e/fullgame.mjs
//
// main      One room, one admin, five teams, one paired projector; Q1 → Q6 as six real 60 s
//           server-authoritative rounds (nothing shortened, no database seeding), then the final
//           leaderboard and podium. Teams and projector reach the server through their own network
//           proxies for controlled disruptions: team 3 offline in Q2, projector reload in Q3, team 4
//           refresh after submitting in Q4, a lost submission acknowledgement in Q5, a frozen
//           (backgrounded) projector tab in Q6. A planned mix of correct, wrong, missing and
//           near-deadline answers produces a tie for first place and a zero-point team. Expected
//           points, totals and ranks are computed HERE from the plan and the server receipt order —
//           never with shared/scoring.ts or the engine.
// restart   Full game with real server-process crashes (SIGKILL) on the same SQLite file: after three
//           completed rounds, and during the active Q4 round.
// rooms     Two concurrent rooms at different progress: no state, media or credits cross over.
// nowinner  Fixture with SHORT rounds (test-only ROUND_DURATION_MS): six rounds nobody scores →
//           neutral final, empty podium.
//
// Prints PASS/FAIL lines and a METRICS JSON line. Answers are typed into the UI only.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { chromium } from 'playwright-core';
import { io as ioClient } from 'socket.io-client';
import { createProxy } from './lib/netproxy.mjs';
import { ROOT, adminRoom, joinTeam, roundStart, sleep, startRound, startServer } from './lib/session.mjs';

const SCENARIO = process.env.SCENARIO ?? 'all';
const OUT = process.env.OUT ?? null;
if (OUT) mkdirSync(OUT, { recursive: true });
const PW = 'e2e-fullgame-password';
const ROUND_MS = 60_000;

const results = [];
const metrics = {};
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const stats = (xs) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  const q = (p) => v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)];
  return { n: v.length, min: Math.round(v[0]), median: Math.round(q(0.5)), p95: Math.round(q(0.95)), max: Math.round(v[v.length - 1]) };
};

// ---------------------------------------------------------------- independent reference data
// Canonical order and answers as the rehearsal expects them (NOT read from server code).
const ORDER = ['BAO CẤP', 'CÁCH MẠNG THÁNG MƯỜI', 'HỢP TÁC XÃ', 'ĐỔI MỚI', 'WTO', 'PHÁT TRIỂN BỀN VỮNG'];
const fold = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const POINTS = [50, 40, 30, 20, 10];
const manifests = [1, 2, 3, 4, 5, 6].map((n) => JSON.parse(readFileSync(join(ROOT, `media/q${n}/manifest.json`), 'utf8')));
const credits = JSON.parse(readFileSync(join(ROOT, 'server/content/attribution.json'), 'utf8')).questions;
// A creator name that only occurs in each question's credits (used to detect cross-question leaks).
const SIGNATURE = Object.fromEntries(
  Object.entries(credits).map(([q, a]) => {
    const others = Object.entries(credits).filter(([o]) => o !== q).flatMap(([, x]) => x.entries.map((e) => e.creator));
    return [q, a.entries.find((e) => e.kind === 'photo' && !others.includes(e.creator))?.creator ?? null];
  }),
);

/** Competition ranking (1, 1, 3) on score, ties keep slot order — implemented here, independently. */
function expectedStandings(totals) {
  const rows = Object.entries(totals).map(([slot, score]) => ({ slot: Number(slot), score })).sort((a, b) => b.score - a.score || a.slot - b.slot);
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1));
  return rows;
}

// ---------------------------------------------------------------- browser instrumentation
let browser;
const allErrors = [];
async function client(who, origin, viewport, opts = {}) {
  const context = await browser.newContext({ viewport, ...opts });
  const page = await context.newPage();
  const c = { who, origin, page, context, frames: [], media: [], mediaStatus: [], errors: [], sceneLog: [] };
  await page.addInitScript(() => {
    window.__sceneLog = [];
    const seen = new Set();
    new MutationObserver(() => {
      const el = document.querySelector('.scene-stage');
      const id = el?.getAttribute('data-scene-id');
      if (id && !seen.has(id)) {
        seen.add(id);
        window.__sceneLog.push({ id, t: Date.now() });
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-scene-id'] });
  });
  page.on('pageerror', (e) => c.errors.push(`pageerror ${e}`));
  page.on('console', (m) => m.type() === 'error' && c.errors.push(m.text()));
  page.on('request', (r) => {
    const u = r.url();
    const m = u.match(/\/api\/rounds\/([^/]+)\/media\/([a-z0-9-]+)/);
    if (m) c.media.push({ t: Date.now(), round: m[1], asset: m[2] });
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith(`blob:${origin}`)) c.errors.push(`external request ${u}`);
  });
  page.on('response', (r) => {
    if (/\/api\/rounds\/[^/]+\/media\//.test(r.url())) c.mediaStatus.push(r.status());
  });
  // The in-page visibility log restarts on reload: callers collect it before reloading.
  c.collectScenes = async () => {
    const log = await page.evaluate(() => window.__sceneLog ?? []).catch(() => []);
    for (const e of log) if (!c.sceneLog.some((x) => x.id === e.id)) c.sceneLog.push(e);
  };
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => {
      if (typeof f.payload !== 'string' || !f.payload.startsWith('42')) return;
      try {
        const [ev, view] = JSON.parse(f.payload.slice(2));
        if (ev === 'state') c.frames.push({ t: Date.now(), view, raw: f.payload });
      } catch {
        /* partial frame */
      }
    }),
  );
  return c;
}
const countdown = async (c) => Number(await c.page.locator('.countdown-number').first().innerText({ timeout: 2_000 }).catch(() => 'NaN'));
async function submitUi(c, text) {
  await c.page.getByTestId('answer-input').fill(text);
  await c.page.getByTestId('answer-submit').click();
  await c.page.getByRole('dialog').getByRole('button', { name: 'Gửi' }).click();
}
const token = (c) => c.page.evaluate(() => sessionStorage.getItem('hc.team.token'));
/** Raw socket emit with a team's own session (out-of-band: what a modified client could send). */
async function rawEmit(base, tok, event, payload) {
  const sock = ioClient(base, { auth: { token: tok }, transports: ['websocket'], reconnection: false, forceNew: true });
  try {
    await new Promise((res, rej) => {
      sock.once('connect', res);
      sock.once('connect_error', rej);
    });
    return await sock.timeout(5_000).emitWithAck(event, payload).catch((e) => ({ ok: false, error: `timeout ${e}` }));
  } finally {
    sock.close();
  }
}

// ---------------------------------------------------------------- round driver
/**
 * Plays one real round. `plan` = [{ slot, at, text, correct, via? }]. `incident(at)` hooks run
 * at their in-round time. Returns the round row and timing data.
 */
async function playRound({ label, n, srv, admin, projector, teams, code, plan, incidents = [], db }) {
  const manifest = manifests[n - 1];
  await startRound(admin.page);
  await Promise.all(teams.map((t) => t.page.getByTestId('answer-input').waitFor({ timeout: 20_000 })));
  const r = roundStart(srv.dbPath, code);
  const round = db().prepare('SELECT id, started_at, deadline_at, question_index FROM rounds WHERE id = ?').get(r.id);
  const at = (ms) => sleep(Math.max(0, round.started_at + ms - Date.now()));
  check(`${label}: question ${n} started (index ${round.question_index}), deadline = start + 60 s`, round.question_index === n - 1 && round.deadline_at - round.started_at === ROUND_MS);
  const events = [
    ...plan.map((p) => ({ at: p.at, run: async () => {
      const t = teams[p.slot - 1];
      await submitUi(t, p.text);
      if (!p.noAckWait) await t.page.getByTestId('submitted-ack').waitFor({ timeout: 15_000 });
    } })),
    ...incidents,
  ].sort((a, b) => a.at - b.at);
  // Samples for sync / blank / drift, merged with the events.
  const samples = [3_000, 8_000, 14_000, 19_000, 26_000, 31_000, 37_000, 43_000, 47_500, 52_000, 56_000];
  const sync = [];
  const drift = [];
  const blanks = [];
  const fallbacks = [];
  const pending = [...events];
  for (const s of samples) {
    while (pending.length && pending[0].at <= s) {
      const e = pending.shift();
      await at(e.at);
      await e.run();
    }
    if (Date.now() > round.started_at + s + 400) continue; // an incident ran past this sample
    await at(s);
    const watch = [projector, ...teams].filter((c) => !c.impairedNow);
    const probes = await Promise.all(
      watch.map((c) =>
        c.page
          .evaluate(() => {
            const st = document.querySelector('.scene-stage');
            const v = st?.querySelector('.scene-in video');
            return { id: st?.getAttribute('data-scene-id') ?? null, fallback: !!document.querySelector('[data-testid="media-fallback"]'), video: v ? { t: v.currentTime, dur: v.duration, paused: v.paused } : null, now: Date.now() };
          })
          .catch(() => null),
      ),
    );
    // Allowed: the newest scene released by now, or the one before it if the newest was released
    // less than 1.5 s ago (still loading / entering).
    const released = manifest.scenes.filter((sc) => sc.at <= s);
    const settled = [...manifest.scenes].reverse().find((sc) => sc.at <= s - 1_500);
    const allowed = new Set(released.filter((sc) => !settled || sc.at >= settled.at).map((sc) => sc.id));
    for (const [i, p] of probes.entries()) {
      if (!p) continue;
      if (!p.id) blanks.push(`${watch[i].who}@${s}`);
      if (p.fallback) fallbacks.push(`${watch[i].who}@${s}`);
      if (allowed.size && !allowed.has(p.id)) sync.push(`${watch[i].who}@${s}: ${p.id} ∉ {${[...allowed]}}`);
      const sc = manifest.scenes.find((x) => x.id === p.id);
      if (p.video && sc?.kind === 'video' && Number.isFinite(p.video.dur)) {
        const exp = (p.now - (round.started_at + sc.at)) / 1000;
        if (exp > 0.8 && exp < p.video.dur - 0.4) drift.push(Math.abs(p.video.t - exp) * 1000);
      }
    }
  }
  while (pending.length) {
    const e = pending.shift();
    await at(e.at);
    await e.run();
  }
  await Promise.all([admin, projector, ...teams].map((c) => c.page.getByTestId(c === projector ? 'screen-reveal' : c === admin ? 'advance' : 'my-result').waitFor({ timeout: 25_000 })));
  return { round, sync, drift, blanks, fallbacks };
}

/** Montage, disclosure and media checks of one finished round (from recorded frames/requests). */
function auditRound({ label, n, round, clients, submitters, visibleAll }) {
  const manifest = manifests[n - 1];
  const assets = Object.fromEntries(manifest.scenes.filter((s) => s.kind === 'video').map((s) => [manifest.clips[s.clip].assetId, s.at]));
  const answer = fold(ORDER[n - 1]);
  const receipt = [];
  const visible = [];
  for (const c of clients) {
    const frames = c.frames.filter((f) => f.view?.round?.id === round.id || (f.t >= round.started_at - 500 && f.t <= round.deadline_at + 15_000));
    // Scene release order and receipt latency (first frame that contains each scene).
    const firstSeen = new Map();
    for (const f of frames) for (const s of f.view?.round?.id === round.id ? f.view.round.scenes : []) if (!firstSeen.has(s.id)) firstSeen.set(s.id, f.t);
    if (c.role !== 'admin') {
      const order = [...firstSeen.keys()];
      const expectedOrder = manifest.scenes.map((s) => s.id);
      check(`${label}: ${c.who} received all ${expectedOrder.length} scenes in production order`, JSON.stringify(order) === JSON.stringify(expectedOrder), order.join(','));
      for (const s of manifest.scenes) {
        const t = firstSeen.get(s.id);
        if (t !== undefined && !c.impaired?.has(n)) receipt.push(t - (round.started_at + s.at));
        if (t !== undefined && t < round.started_at + s.at - 50) check(`${label}: ${c.who} got scene ${s.id} before its release`, false, `${t - round.started_at} ms < ${s.at}`);
      }
    }
    // Nothing protected before the deadline: no reveal, no credits, no canonical answer (a team's
    // own typed answer is echoed only to that team).
    const early = frames.filter((f) => f.t < round.deadline_at - 300);
    const leakReveal = early.filter((f) => f.view?.reveal && f.view.reveal.roundId === round.id);
    const leakCredits = early.filter((f) => /"attribution"\s*:\s*\{|creativecommons\.org|commons\.wikimedia\.org/.test(f.raw));
    const leakAnswer = submitters.has(c.who) ? [] : early.filter((f) => fold(JSON.stringify(f.view?.round ?? {}) + JSON.stringify(f.view?.reveal ?? '')).includes(answer) && f.view?.round?.id === round.id);
    check(`${label}: ${c.who} — no result, credits or answer before the server closed the round`, leakReveal.length + leakCredits.length + leakAnswer.length === 0, `${early.length} frames · reveal ${leakReveal.length} · credits ${leakCredits.length} · answer ${leakAnswer.length}`);
    const late = c.frames.find((f) => f.view?.reveal?.roundId === round.id);
    if (late) check(`${label}: ${c.who} — results arrive only after the deadline`, late.t >= round.deadline_at - 50, `${late.t - round.deadline_at} ms after deadline`);
    // Media: only this question's assets, never before release.
    const reqs = c.media.filter((m) => m.round === round.id);
    const early403 = reqs.filter((m) => !(m.asset in assets) || m.t < round.started_at + assets[m.asset] - 50);
    check(`${label}: ${c.who} — no media requested before its scene was released`, early403.length === 0, `${reqs.length} requests${early403.length ? ` · early ${early403.map((m) => m.asset).join(',')}` : ''}`);
    const dup = reqs.length - new Set(reqs.map((m) => m.asset)).size;
    if (!c.reloaded?.has(n)) check(`${label}: ${c.who} — each clip downloaded at most once`, dup === 0, `${reqs.length} requests, ${dup} duplicates`);
  }
  // Release → visible (scene shown on the stage), projector and teams, unimpaired devices only.
  for (const c of clients.filter((x) => x.role !== 'admin' && !x.impaired?.has(n) && !x.reloaded?.has(n))) {
    for (const s of manifest.scenes) {
      const v = c.sceneLog.find((e) => e.id === s.id);
      if (v) visibleAll.push({ ms: v.t - (round.started_at + s.at), kind: s.kind });
    }
  }
  return { receipt };
}

/** Reads every team's submission and points for one round straight from the test database. */
function dbRound(db, roundId) {
  return db
    .prepare('SELECT t.slot, s.answer, s.received_at, s.seq, s.is_correct, s.points, s.order_rank FROM submissions s JOIN teams t ON t.id = s.team_id WHERE s.round_id = ? ORDER BY s.seq')
    .all(roundId);
}

/** Independent scoring of one round from the plan's intent and the server's receipt order. */
function verifyScoring({ label, n, rows, plan, totals }) {
  const intent = new Map(plan.map((p) => [p.slot, p]));
  check(`${label}: exactly one recorded answer per submitting team (${plan.length})`, rows.length === plan.length && new Set(rows.map((r) => r.slot)).size === rows.length, rows.map((r) => r.slot).join(','));
  check(`${label}: recorded texts are exactly what each team confirmed (immutable)`, rows.every((r) => intent.get(r.slot)?.text.trim() === r.answer));
  const plannedOrder = [...plan].sort((a, b) => a.at - b.at).map((p) => p.slot);
  check(`${label}: server receipt order matches the planned submission order`, JSON.stringify(rows.map((r) => r.slot)) === JSON.stringify(plannedOrder), rows.map((r) => r.slot).join(' → '));
  let k = 0;
  const expected = new Map();
  for (const r of rows) {
    const correct = intent.get(r.slot).correct;
    expected.set(r.slot, correct ? POINTS[k++] ?? 0 : 0);
  }
  const mismatch = rows.filter((r) => r.points !== expected.get(r.slot) || (r.is_correct === 1) !== intent.get(r.slot).correct);
  check(`${label}: correctness and points match the independent calculation`, mismatch.length === 0, rows.map((r) => `T${r.slot}:${r.is_correct ? '✓' : '✗'}${r.points}`).join(' '));
  for (const [slot, p] of expected) totals[slot] += p;
  return expected;
}

/** Standings shown by every device for this reveal must equal the independent cumulative totals. */
function verifyStandings({ label, round, clients, before, after }) {
  const fmt = (st) => st.map((s) => `${s.name}:${s.score}#${s.rank}`).join(' ');
  const exp = (tot) => expectedStandings(tot).map((s) => `Đội ${s.slot}:${s.score}#${s.rank}`).join(' ');
  const seen = [];
  for (const c of clients) {
    const f = [...c.frames].reverse().find((x) => x.view?.reveal?.roundId === round.id);
    if (!f) {
      check(`${label}: ${c.who} received the reveal`, false);
      continue;
    }
    seen.push(`${fmt(f.view.reveal.standingsBefore)} → ${fmt(f.view.reveal.standingsAfter)}`);
  }
  const expected = `${exp(before)} → ${exp(after)}`;
  check(`${label}: standings before/after identical on all ${clients.length} devices and equal to the independent totals`, seen.length === clients.length && seen.every((x) => x === expected), expected);
}

async function inspectCredits({ label, n, c, admin, expectAdvanceClears }) {
  const q = `q${n}`;
  const exp = credits[q];
  await c.page.getByTestId('attribution-open').click();
  const panel = c.page.getByTestId('attribution-panel');
  await panel.waitFor();
  const items = await c.page.getByTestId('attribution-item').count();
  const text = await panel.innerText();
  const own = SIGNATURE[q];
  const foreign = Object.entries(SIGNATURE).filter(([o, name]) => o !== q && name && text.includes(name)).map(([o]) => o);
  const meta = await c.page.getByTestId('attribution-item').evaluateAll((els) =>
    els.map((e) => ({ title: !!e.querySelector('.attribution-title')?.textContent.trim(), author: /Tác giả/.test(e.textContent), licence: /Giấy phép/.test(e.textContent), used: /Xuất hiện/.test(e.textContent) })),
  );
  const underneath = await c.page.evaluate(() => !!document.querySelector('#root [data-testid="my-result"], #root [data-testid="screen-reveal"]') && document.getElementById('root').inert === true);
  check(`${label}: credits on ${c.who} — ${exp.entries.length} entries of Q${n} only, each with title/author/licence/usage; results kept underneath (inert)`, items === exp.entries.length && (!own || text.includes(own)) && foreign.length === 0 && meta.every((m) => m.title && m.author && m.licence && m.used) && underneath, `${items} items${foreign.length ? ` FOREIGN ${foreign}` : ''}`);
  if (expectAdvanceClears) return; // left open on purpose: the admin's advance must remove it
  await c.page.getByTestId('attribution-close').click();
  await panel.waitFor({ state: 'detached' });
  const back = await c.page.evaluate(() => document.getElementById('root').inert === false && !!document.querySelector('[data-testid="my-result"], [data-testid="screen-reveal"]'));
  check(`${label}: closing the credits on ${c.who} returns to the results`, back);
}

// ====================================================================== scenario: main
async function scenarioMain() {
  const label0 = 'MAIN';
  const srv = await startServer({ port: 4361, password: PW });
  const db = () => new Database(srv.dbPath, { readonly: true });
  const admin = await client('admin', srv.base, { width: 1600, height: 1000 });
  admin.role = 'admin';
  const { code, pins } = await adminRoom(admin.page, srv.base, PW, srv.dbPath, 0);
  // Projector and teams each behind their own proxy (no impairment unless an incident sets one).
  const proxies = {};
  const via = async (who) => {
    proxies[who] = await createProxy(srv.port, {});
    return `http://127.0.0.1:${proxies[who].port}`;
  };
  await admin.page.getByTestId('projector-create').click();
  const link = await admin.page.getByTestId('projector-link').inputValue();
  const pOrigin = await via('projector');
  const projector = await client('projector', pOrigin, { width: 1920, height: 1080 });
  projector.role = 'screen';
  await projector.page.goto(link.replace(srv.base, pOrigin));
  await projector.page.getByTestId('screen-room-code').waitFor();
  const VIEWS = [{ width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 360, height: 740 }, { width: 1366, height: 768 }, { width: 390, height: 844 }];
  const teams = [];
  for (let i = 0; i < 5; i++) {
    const origin = await via(`team${i + 1}`);
    const t = await client(`team${i + 1}`, origin, VIEWS[i]);
    t.role = 'team';
    t.impaired = new Set();
    t.reloaded = new Set();
    await joinTeam(t.page, origin, code, pins[i]);
    teams.push(t);
  }
  projector.impaired = new Set();
  projector.reloaded = new Set();
  await admin.page.getByText('5/5 đội đã kết nối · 5 đội sẵn sàng').waitFor({ timeout: 20_000 });
  check(`${label0}: lobby — 5 teams joined and ready, projector paired`, (await admin.page.getByTestId('projector-status').textContent()).includes('Đã kết nối'));
  if (OUT) await projector.page.screenshot({ path: join(OUT, 'lobby-projector.png') });

  const all = [admin, projector, ...teams];
  const totals = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const timeline = [];
  const receiptAll = [];
  const visibleAll = [];
  const driftAll = [];
  const T = (slot) => teams[slot - 1];
  // Plans: [slot, at ms, text, correct]. Mix of correct / wrong / missing / near-deadline answers.
  const P = (rows) => rows.map(([slot, at, text, correct, extra]) => ({ slot, at, text, correct, ...(extra ?? {}) }));
  const ROUNDS = [
    { plan: P([[1, 6_000, 'bao cấp', true], [2, 9_000, 'BAO CAP', true], [3, 12_000, 'tem phiếu', false], [4, 58_300, 'Bao Cấp', true]]) },
    { plan: P([[2, 20_000, 'cách mạng tháng mười', true], [1, 22_000, 'Cach mang thang Muoi', true], [4, 24_000, 'cách mạng tháng hai', false], [5, 26_000, 'cách mạng tháng tám', false]]) },
    { plan: P([[3, 15_000, 'hợp tác xã', true], [1, 18_000, 'hợp tác hóa', false], [2, 25_000, 'HOP TAC XA', true], [5, 58_500, 'hội nông dân', false]]) },
    { plan: P([[1, 12_000, 'đổi mới', true], [4, 14_000, 'Doi Moi', true], [2, 30_000, 'ĐỔI MỚI', true], [3, 33_000, 'mở cửa', false]]) },
    { plan: P([[2, 10_000, 'W.T.O', true, { noAckWait: true }], [1, 18_000, 'wto', true], [3, 20_000, 'WTO', true], [4, 22_000, 'FTA', false]]) },
    { plan: P([[1, 40_000, 'phát triển bền vững', true], [3, 42_000, 'phat trien ben vung', true], [4, 44_000, 'Phát Triển Bền Vững', true], [2, 46_000, 'PHAT TRIEN BEN VUNG', true], [5, 48_000, 'tăng trưởng xanh', false]]) },
  ];
  // Expected final totals from the plan above (by hand): T1 230, T2 230, T3 120, T4 100, T5 0.
  const EXPECTED_FINAL = { 1: 230, 2: 230, 3: 120, 4: 100, 5: 0 };
  let prevRoundId = null;

  for (let n = 1; n <= 6; n++) {
    const label = `${label0} Q${n}`;
    const before = { ...totals };
    const incidents = [];
    const notes = [];
    if (n === 2) {
      // Team 3 loses its network for 12 s (it does not submit this round), then must recover.
      incidents.push({ at: 15_000, run: async () => { proxies.team3.set({ frozen: true }); T(3).impairedNow = true; T(3).impaired.add(2); } });
      incidents.push({ at: 27_000, run: async () => {
        proxies.team3.set({ frozen: false });
        proxies.team3.cut(); // drop the stale connections: the client must reconnect by itself
        await T(3).page.locator('.conn-connected').waitFor({ timeout: 20_000 });
        T(3).impairedNow = false;
        const cd = await countdown(T(3));
        const exp = (timeline.at(-1).deadline - Date.now()) / 1000;
        const sceneT = await T(3).page.locator('.scene-stage').getAttribute('data-scene-id');
        const sceneP = await projector.page.locator('.scene-stage').getAttribute('data-scene-id');
        notes.push(`team3 offline 15–27 s, reconnected; countdown ${cd}`);
        const last = T(3).frames.at(-1)?.view;
        check(`${label}: team 3 back after 12 s offline — same question, same scene as projector, countdown follows the original deadline`, last?.round?.id === timeline.at(-1).id && last?.round?.questionNumber === 2 && sceneT === sceneP && Math.abs(cd - Math.ceil(exp)) <= 1, `${sceneT}/${sceneP}, ${cd}s vs ${Math.ceil(exp)}s`);
      } });
    }
    if (n === 3) {
      incidents.push({ at: 30_000, run: async () => {
        projector.reloaded.add(3);
        projector.impairedNow = true;
        await projector.collectScenes();
        await projector.page.reload();
        await projector.page.locator('.scene-stage[data-scene-id="e5"]').waitFor({ timeout: 10_000 });
        const cd = await countdown(projector);
        const exp = Math.ceil((timeline.at(-1).deadline - Date.now()) / 1000);
        projector.impairedNow = false;
        check(`${label}: projector reloaded mid-round — still paired, current scene e5, countdown on the original deadline`, (await projector.page.getByTestId('screen-unpaired').count()) === 0 && Math.abs(cd - exp) <= 1, `${cd}s vs ${exp}s`);
        notes.push('projector reload at 30 s');
      } });
    }
    if (n === 4) {
      incidents.push({ at: 20_000, run: async () => {
        T(4).reloaded.add(4);
        await T(4).collectScenes();
        await T(4).page.reload();
        await T(4).page.getByTestId('submitted-ack').waitFor({ timeout: 10_000 });
        const rows = dbRound(db(), timeline.at(-1).id).filter((r) => r.slot === 4);
        check(`${label}: team 4 refreshed after submitting — still "recorded", one row, input locked`, rows.length === 1 && (await T(4).page.getByTestId('answer-input').count()) === 0);
        notes.push('team4 refresh after submit at 20 s');
      } });
    }
    if (n === 5) {
      // Lost acknowledgement: team 2's submission reaches the server but nothing comes back.
      incidents.push({ at: 9_500, run: async () => { proxies.team2.set({ dropDownstream: true }); T(2).impairedNow = true; T(2).impaired.add(5); } });
      incidents.push({ at: 13_000, run: async () => {
        const rows = dbRound(db(), timeline.at(-1).id).filter((r) => r.slot === 2);
        const shownRecorded = await T(2).page.getByTestId('submitted-ack').count();
        check(`${label}: ACK lost — server already has team 2's answer, the device does not claim "recorded"`, rows.length === 1 && shownRecorded === 0, `rows ${rows.length}, recorded shown ${shownRecorded}`);
      } });
      incidents.push({ at: 16_000, run: async () => {
        proxies.team2.set({ dropDownstream: false });
        proxies.team2.cut();
        await T(2).page.getByTestId('submitted-ack').waitFor({ timeout: 20_000 });
        T(2).impairedNow = false;
        const rows = dbRound(db(), timeline.at(-1).id).filter((r) => r.slot === 2);
        check(`${label}: after the network returns team 2 is confirmed once, with its original receipt time`, rows.length === 1 && rows[0].received_at - timeline.at(-1).start < 11_000, `received at +${rows[0]?.received_at - timeline.at(-1).start} ms`);
        notes.push('team2 ACK lost 9.5–16 s');
      } });
    }
    if (n === 6) {
      incidents.push({ at: 25_000, run: async () => {
        projector.cdp = await projector.context.newCDPSession(projector.page);
        await projector.cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
        projector.impaired.add(6);
        projector.impairedNow = true;
      } });
      incidents.push({ at: 37_000, run: async () => {
        await projector.cdp.send('Page.setWebLifecycleState', { state: 'active' });
        const t0 = Date.now();
        await projector.page.locator('.scene-stage[data-scene-id="d7"]').waitFor({ timeout: 10_000 });
        projector.impairedNow = false;
        const cd = await countdown(projector);
        const exp = Math.ceil((timeline.at(-1).deadline - Date.now()) / 1000);
        check(`${label}: backgrounded projector (12 s) catches up — scene d7, countdown on the original deadline`, Math.abs(cd - exp) <= 1, `${Date.now() - t0} ms, ${cd}s vs ${exp}s`);
        notes.push('projector frozen 25–37 s');
      } });
    }
    // Immutability / wrong-round probes during the round (out-of-band raw socket with team 1's session).
    incidents.push({ at: 34_000, run: async () => {
      const cur = timeline.at(-1);
      const tok1 = await token(T(1));
      const t1 = ROUNDS[n - 1].plan.find((p) => p.slot === 1);
      if (t1 && t1.at < 34_000) {
        const second = await rawEmit(T(1).origin, tok1, 'team:submit', { roundId: cur.id, submissionId: `probe-${n}-second-answer`, answer: 'đáp án khác' });
        check(`${label}: a second, different answer from team 1 is refused (already_submitted)`, second.ok === false && second.error === 'already_submitted', JSON.stringify(second));
      }
      if (prevRoundId) {
        const stale = await rawEmit(T(5).origin, await token(T(5)), 'team:submit', { roundId: prevRoundId, submissionId: `probe-${n}-stale-round`, answer: ORDER[n - 1] });
        const rows = dbRound(db(), cur.id).filter((r) => r.slot === 5);
        check(`${label}: an answer for the previous round is never applied to this round`, stale.ok === false && stale.error === 'round_closed' && rows.every((r) => r.answer !== ORDER[n - 1]), JSON.stringify(stale));
      }
    } });

    // Wrap the round start so incidents can read the deadline.
    const startedPromise = (async () => {
      const r = await playRound({
        label, n, srv, admin, projector, teams, code, db,
        plan: ROUNDS[n - 1].plan,
        incidents: incidents.map((e) => ({ ...e, run: async () => {
          if (!timeline.at(-1) || timeline.at(-1).n !== n) {
            const rr = roundStart(srv.dbPath, code);
            const row = db().prepare('SELECT id, started_at, deadline_at FROM rounds WHERE id = ?').get(rr.id);
            timeline.push({ n, id: row.id, start: row.started_at, deadline: row.deadline_at });
          }
          await e.run();
        } })),
      });
      return r;
    })();
    const res = await startedPromise;
    if (!timeline.at(-1) || timeline.at(-1).n !== n) timeline.push({ n, id: res.round.id, start: res.round.started_at, deadline: res.round.deadline_at });
    const entry = timeline.at(-1);
    entry.closedAt = db().prepare('SELECT closed_at FROM rounds WHERE id = ?').get(res.round.id).closed_at;
    entry.notes = notes;
    check(`${label}: server closed the round at its deadline (not before)`, entry.closedAt >= entry.deadline && entry.closedAt - entry.deadline < 1_000, `+${entry.closedAt - entry.deadline} ms`);
    check(`${label}: montage — every watched device showed the production scene at each sample; no blank stage; no clip fallback`, res.sync.length === 0 && res.blanks.length === 0 && res.fallbacks.length === 0, [...res.sync, ...res.blanks.map((b) => `blank ${b}`), ...res.fallbacks.map((b) => `fallback ${b}`)].slice(0, 4).join('; '));
    driftAll.push(...res.drift);
    const submitters = new Set(ROUNDS[n - 1].plan.map((p) => `team${p.slot}`));
    for (const c of all) await c.collectScenes();
    const audit = auditRound({ label, n, round: res.round, clients: all, submitters, visibleAll });
    receiptAll.push(...audit.receipt);
    // Decisive at 45 s (native) and recap at 50 s (video), per the production manifest.
    const m = manifests[n - 1];
    const dec = m.scenes.find((s) => s.at === 45_000);
    const rec = m.scenes.find((s) => s.at === 50_000);
    check(`${label}: decisive clue ${dec?.id} is native at 45 s, recap ${rec?.id} is video at 50 s`, dec && dec.kind !== 'video' && rec?.kind === 'video');
    // Scoring (independent) + standings on every device.
    const rows = dbRound(db(), res.round.id);
    const pts = verifyScoring({ label, n, rows, plan: ROUNDS[n - 1].plan, totals });
    entry.points = Object.fromEntries([...pts]);
    verifyStandings({ label, round: res.round, clients: all, before, after: totals });
    // What people SEE: every device's leaderboard settles on the independent after-totals, in order.
    const want = expectedStandings(totals).map((x) => `Đội ${x.slot}:${x.score}`).join(' ');
    const shownBoards = await Promise.all(
      all.map((c) =>
        c.page
          .waitForFunction((w) => [...document.querySelectorAll('#root .lb-row')].sort((a, b) => Number(getComputedStyle(a).getPropertyValue('--pos')) - Number(getComputedStyle(b).getPropertyValue('--pos'))).map((r) => `${r.querySelector('.lb-name').textContent}:${r.querySelector('.lb-score').textContent}`).join(' ') === w, want, { timeout: 6_000 })
          .then(() => true, () => false),
      ),
    );
    check(`${label}: the leaderboard every device displays settles on the independent totals (${want})`, shownBoards.every(Boolean), all.filter((_, i) => !shownBoards[i]).map((c) => c.who).join(','));
    // Reveal UI: each team's own result matches; projector shows the canonical answer of THIS question.
    for (const t of teams) {
      const mine = await t.page.getByTestId('my-result').innerText();
      const p = pts.get(Number(t.who.slice(4)));
      const ok = p === undefined ? /chưa nộp/.test(mine) : p > 0 ? mine.includes(`+${p}`) : /Chưa chính xác/.test(mine);
      if (!ok) check(`${label}: ${t.who} result card`, false, mine.replace(/\s+/g, ' '));
    }
    check(`${label}: every team's result card matches its points`, true);
    const shown = await projector.page.locator('.slots').getAttribute('aria-label');
    check(`${label}: projector reveals "${ORDER[n - 1]}" as answer ${n}`, (shown ?? '').includes(ORDER[n - 1]) && (await projector.page.getByText(`Đáp án câu ${n}`).count()) > 0, shown);
    if (OUT) await projector.page.screenshot({ path: join(OUT, `reveal-q${n}-projector.png`) });
    if (OUT && n === 1) await T(3).page.screenshot({ path: join(OUT, `reveal-q${n}-phone360.png`), fullPage: true });
    // Credits on a phone and on the projector; leave the projector dialog OPEN, then advance.
    await inspectCredits({ label, n, c: T(3) });
    await inspectCredits({ label, n, c: projector, expectAdvanceClears: true });
    prevRoundId = res.round.id;
    await admin.page.getByTestId('advance').click();
    await projector.page.getByTestId('attribution-panel').waitFor({ state: 'detached', timeout: 10_000 });
    check(`${label}: admin advance removed the open credits dialog on the projector`, (await projector.page.evaluate(() => document.getElementById('root').inert)) === false);
  }

  // Final
  await projector.page.getByTestId('screen-final').waitFor({ timeout: 15_000 });
  await sleep(1_500);
  check(`${label0}: exactly six sequential 60 s rounds were played, Q1 → Q6, in one room`, timeline.length === 6 && timeline.every((x, i) => x.n === i + 1 && x.deadline - x.start === ROUND_MS && x.start > (timeline[i - 1]?.closedAt ?? 0)), timeline.map((x) => x.n).join(','));
  check(`${label0}: independent totals equal the hand-computed plan totals`, JSON.stringify(totals) === JSON.stringify(EXPECTED_FINAL), JSON.stringify(totals));
  const finalExp = expectedStandings(totals);
  const title = await projector.page.getByTestId('screen-final-title').innerText();
  check(`${label0}: final title announces the tie for first place (Đội 1 & Đội 2)`, title.includes('Đồng hạng nhất') && title.includes('Đội 1') && title.includes('Đội 2'), title);
  const podium = await projector.page.locator('.podium-col').evaluateAll((cols) => cols.map((c) => c.innerText.replace(/\s+/g, ' ').trim()));
  const podiumRanks = (await projector.page.locator('.podium-rank').allInnerTexts()).sort().join(',');
  check(`${label0}: podium = Đội 1 & Đội 2 (shared rank 1) and Đội 3 (rank 3); zero-point Đội 5 not on it`, podiumRanks === '1,1,3' && podium.some((x) => x.includes('Đội 3')) && !podium.some((x) => x.includes('Đội 5')), `${podiumRanks} · ${podium.join(' | ')}`);
  const rest = (await projector.page.getByTestId('final-rest').locator('li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
  check(`${label0}: Đội 4 (100) and zero-point Đội 5 listed below the podium`, rest.some((x) => x.includes('Đội 4') && x.endsWith('100')) && rest.some((x) => x.includes('Đội 5') && x.endsWith(' 0')), rest.join(' | '));
  const finalFrames = all.map((c) => [...c.frames].reverse().find((f) => f.view?.room?.phase === 'finished'));
  const agree = finalFrames.every((f) => f && JSON.stringify(f.view.standings.map((s) => [s.name, s.score, s.rank])) === JSON.stringify(finalExp.map((s) => [`Đội ${s.slot}`, s.score, s.rank])));
  check(`${label0}: all 7 devices end with the same final standings (independent ranks 1,1,3,4,5)`, agree, finalExp.map((s) => `Đội ${s.slot} ${s.score} #${s.rank}`).join(', '));
  for (const t of teams) {
    const h = await t.page.locator('.final-title').innerText().catch(() => '');
    const e = finalExp.find((s) => `team${s.slot}` === t.who);
    if (!h.includes(`hạng ${e.rank}`) || !h.includes(`${e.score} điểm`)) check(`${label0}: ${t.who} final title`, false, h);
  }
  check(`${label0}: each team's final screen shows its own rank and score`, true);
  if (OUT) {
    await projector.page.screenshot({ path: join(OUT, 'final-projector.png') });
    await T(3).page.screenshot({ path: join(OUT, 'final-phone360.png'), fullPage: true });
  }
  // Errors (the deliberate disconnections produce socket/network errors; anything else fails).
  const unexpected = all.flatMap((c) => c.errors.map((e) => `${c.who}: ${e}`)).filter((e) => !/ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|ERR_EMPTY_RESPONSE|net::ERR|WebSocket|socket\.io|Failed to load resource/i.test(e));
  const badMedia = all.flatMap((c) => c.mediaStatus).filter((st) => st !== 200);
  check(`${label0}: every clip request of the game succeeded (no loading failures)`, badMedia.length === 0 && all.flatMap((c) => c.mediaStatus).length > 0, `${all.flatMap((c) => c.mediaStatus).length} responses, non-200: ${badMedia.join(',') || 'none'}`);
  const vis = visibleAll.filter((x) => x.kind !== 'video').map((x) => x.ms);
  check(`${label0}: native scenes become visible within 1.5 s of release on every unimpaired device`, vis.length > 0 && Math.max(...vis) < 1_500, JSON.stringify(stats(vis)));
  check(`${label0}: no unexpected console errors or external requests on 7 devices`, unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
  metrics.main = {
    timeline: timeline.map((x) => ({ q: x.n, startedAt: new Date(x.start).toISOString(), closedAfterDeadlineMs: x.closedAt - x.deadline, points: x.points, incidents: x.notes })),
    releaseToReceiptMs: stats(receiptAll),
    releaseToVisibleMs: { native: stats(visibleAll.filter((x) => x.kind !== 'video').map((x) => x.ms)), video: stats(visibleAll.filter((x) => x.kind === 'video').map((x) => x.ms)) },
    mediaResponses: Object.fromEntries([...new Set(all.flatMap((c) => c.mediaStatus))].map((st) => [st, all.flatMap((c) => c.mediaStatus).filter((x) => x === st).length])),
    videoDriftMs: stats(driftAll),
    finalTotals: totals,
  };
  for (const p of Object.values(proxies)) await p.close();
  for (const c of all) await c.context.close();
  await srv.stop();
}

// ====================================================================== scenario: restart
async function scenarioRestart() {
  const L = 'RESTART';
  let srv = await startServer({ port: 4362, password: PW });
  const dbPath = srv.dbPath;
  const db = () => new Database(dbPath, { readonly: true });
  const admin = await client('admin', srv.base, { width: 1600, height: 1000 });
  admin.role = 'admin';
  const { code, pins } = await adminRoom(admin.page, srv.base, PW, dbPath, 0);
  await admin.page.getByTestId('projector-create').click();
  const projector = await client('projector', srv.base, { width: 1920, height: 1080 });
  projector.role = 'screen';
  await projector.page.goto(await admin.page.getByTestId('projector-link').inputValue());
  await projector.page.getByTestId('screen-room-code').waitFor();
  const teams = [];
  for (let i = 0; i < 5; i++) {
    const t = await client(`team${i + 1}`, srv.base, i === 2 ? { width: 360, height: 740 } : { width: 1366, height: 768 });
    t.role = 'team';
    await joinTeam(t.page, srv.base, code, pins[i]);
    teams.push(t);
  }
  await admin.page.getByText('5/5 đội đã kết nối').waitFor({ timeout: 20_000 });
  const all = [admin, projector, ...teams];
  const totals = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  // Simple rotating plan: two correct answers and one wrong per round, different winners.
  const plans = ORDER.map((ans, i) => {
    const a = (i % 5) + 1, b = ((i + 2) % 5) + 1, c = ((i + 4) % 5) + 1;
    return [{ slot: a, at: 5_000, text: ans.toLowerCase(), correct: true }, { slot: b, at: 8_000, text: fold(ans), correct: true }, { slot: c, at: 11_000, text: 'không biết', correct: false }];
  });
  const playSimple = async (n) => {
    const res = await playRound({ label: `${L} Q${n}`, n, srv, admin, projector, teams, code, db, plan: plans[n - 1] });
    verifyScoring({ label: `${L} Q${n}`, n, rows: dbRound(db(), res.round.id), plan: plans[n - 1], totals });
    return res;
  };
  const awaitReconnect = async () => {
    for (const c of all) await c.page.locator('.conn-connected, [data-testid="screen-reveal"], [data-testid="advance"]').first().waitFor({ timeout: 30_000 });
  };
  for (let n = 1; n <= 3; n++) {
    await playSimple(n);
    await admin.page.getByTestId('advance').click();
    if (n < 3) await admin.page.getByTestId('start-round').waitFor();
  }
  // Crash 1: after three completed rounds (room is 'ready' for Q4).
  const snapshot = () => JSON.stringify(db().prepare('SELECT r.question_index, r.started_at, r.deadline_at, r.closed_at, s.answer, s.received_at, s.points, s.is_correct, s.order_rank FROM rounds r LEFT JOIN submissions s ON s.round_id = r.id ORDER BY r.question_index, s.seq').all());
  const hist1 = snapshot();
  await srv.crash();
  check(`${L}: server killed (SIGKILL) after Q1–Q3`, true);
  srv = await startServer({ port: 4362, password: PW, dbPath });
  await admin.page.reload();
  await admin.page.getByTestId('start-round').filter({ hasText: 'Bắt đầu câu 4' }).waitFor({ timeout: 30_000 });
  await awaitReconnect();
  check(`${L}: after restart Q1–Q3 results, receipts and points are unchanged`, snapshot() === hist1);
  const scoresAfter1 = JSON.stringify([...projector.frames].reverse().find((f) => f.t > Date.now() - 20_000 && f.view?.standings)?.view.standings.map((s) => [s.name, s.score]));
  check(`${L}: restored standings equal the independent totals after Q3`, scoresAfter1 === JSON.stringify(expectedStandings(totals).map((s) => [`Đội ${s.slot}`, s.score])), scoresAfter1);

  // Q4 with a crash in the middle of the active round.
  const plan4 = plans[3];
  await startRound(admin.page);
  await Promise.all(teams.map((t) => t.page.getByTestId('answer-input').waitFor({ timeout: 20_000 })));
  const r4 = db().prepare('SELECT id, started_at, deadline_at FROM rounds WHERE id = ?').get(roundStart(dbPath, code).id);
  const at = (ms) => sleep(Math.max(0, r4.started_at + ms - Date.now()));
  await at(plan4[0].at);
  await submitUi(teams[plan4[0].slot - 1], plan4[0].text);
  await teams[plan4[0].slot - 1].page.getByTestId('submitted-ack').waitFor();
  await at(15_000);
  await srv.crash();
  await at(22_000);
  srv = await startServer({ port: 4362, password: PW, dbPath });
  const r4b = db().prepare('SELECT deadline_at, closed_at FROM rounds WHERE id = ?').get(r4.id);
  check(`${L}: crash during active Q4 — deadline unchanged after restart, round still open`, r4b.deadline_at === r4.deadline_at && r4b.closed_at === null);
  await awaitReconnect();
  const cd = await countdown(teams[0]);
  const exp = Math.ceil((r4.deadline_at - Date.now()) / 1000);
  check(`${L}: reconnected devices count down to the ORIGINAL deadline`, Math.abs(cd - exp) <= 1, `${cd}s vs ${exp}s`);
  const kept = dbRound(db(), r4.id);
  check(`${L}: the answer accepted before the crash is still recorded once`, kept.length === 1 && kept[0].slot === plan4[0].slot);
  for (const p of plan4.slice(1)) {
    await at(Math.max(p.at, 30_000 + p.at));
    await submitUi(teams[p.slot - 1], p.text);
    await teams[p.slot - 1].page.getByTestId('submitted-ack').waitFor();
  }
  // Retiming of the plan after the crash (later receipts, same order) for the independent check.
  const plan4b = plan4.map((p, i) => ({ ...p, at: i === 0 ? p.at : 30_000 + p.at }));
  await projector.page.getByTestId('screen-reveal').waitFor({ timeout: 45_000 });
  const c4 = db().prepare('SELECT closed_at FROM rounds WHERE id = ?').get(r4.id).closed_at;
  check(`${L}: Q4 closed once, at its original deadline`, c4 >= r4.deadline_at && c4 - r4.deadline_at < 1_000, `+${c4 - r4.deadline_at} ms`);
  verifyScoring({ label: `${L} Q4`, n: 4, rows: dbRound(db(), r4.id), plan: plan4b, totals });
  const pointsQ4 = JSON.stringify(dbRound(db(), r4.id));
  await admin.page.getByTestId('advance').click();
  await admin.page.getByTestId('start-round').waitFor();
  for (let n = 5; n <= 6; n++) {
    await playSimple(n);
    await admin.page.getByTestId('advance').click();
    if (n < 6) await admin.page.getByTestId('start-round').waitFor();
  }
  await projector.page.getByTestId('screen-final').waitFor({ timeout: 15_000 });
  check(`${L}: Q4 points were not awarded twice (unchanged after Q5–Q6)`, JSON.stringify(dbRound(db(), r4.id)) === pointsQ4);
  const final = [...projector.frames].reverse().find((f) => f.view?.room?.phase === 'finished')?.view.standings.map((s) => [s.name, s.score, s.rank]);
  check(`${L}: final leaderboard equals the independent totals`, JSON.stringify(final) === JSON.stringify(expectedStandings(totals).map((s) => [`Đội ${s.slot}`, s.score, s.rank])), JSON.stringify(final));
  // One more restart after the end: nothing changes.
  const end = snapshot();
  await srv.crash();
  srv = await startServer({ port: 4362, password: PW, dbPath });
  await sleep(1_500);
  check(`${L}: a further restart after the final changes nothing`, snapshot() === end);
  const s = new Database(dbPath, { readonly: true });
  check(`${L}: database holds exactly 6 closed rounds for the room`, s.prepare('SELECT COUNT(*) n FROM rounds r JOIN rooms m ON m.id = r.room_id WHERE m.code = ? AND r.closed_at IS NOT NULL').get(code).n === 6);
  metrics.restart = { finalTotals: totals };
  for (const c of all) await c.context.close();
  await srv.stop();
}

// ====================================================================== scenario: rooms
async function scenarioRooms() {
  const L = 'ROOMS';
  const srv = await startServer({ port: 4363, password: PW });
  const db = () => new Database(srv.dbPath, { readonly: true });
  const mk = async (tag) => {
    const admin = await client(`admin${tag}`, srv.base, { width: 1400, height: 900 });
    admin.role = 'admin';
    const { code, pins } = await adminRoom(admin.page, srv.base, PW, srv.dbPath, 0);
    await admin.page.getByTestId('projector-create').click();
    const projector = await client(`projector${tag}`, srv.base, { width: 1280, height: 720 });
    projector.role = 'screen';
    await projector.page.goto(await admin.page.getByTestId('projector-link').inputValue());
    await projector.page.getByTestId('screen-room-code').waitFor();
    const teams = [];
    for (let i = 0; i < 2; i++) {
      const t = await client(`${tag}-team${i + 1}`, srv.base, { width: 390, height: 844 });
      t.role = 'team';
      await joinTeam(t.page, srv.base, code, pins[i]);
      teams.push(t);
    }
    return { tag, admin, projector, teams, code, all: [admin, projector, ...teams] };
  };
  const A = await mk('A');
  const B = await mk('B');
  check(`${L}: two rooms with different codes`, A.code !== B.code, `${A.code} / ${B.code}`);
  const planA1 = [{ slot: 1, at: 6_000, text: 'bao cấp', correct: true }, { slot: 2, at: 9_000, text: 'đổi mới', correct: false }];
  const planB1 = [{ slot: 2, at: 4_000, text: 'BAO CAP', correct: true }, { slot: 1, at: 7_000, text: 'Bao cấp', correct: true }];
  const planA2 = [{ slot: 2, at: 5_000, text: 'cách mạng tháng mười', correct: true }];
  const totA = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const totB = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  // A plays Q1 then Q2; B starts Q1 while A is in its Q1 reveal → different questions at the same time.
  const a1 = await playRound({ label: `${L} A-Q1`, n: 1, srv, admin: A.admin, projector: A.projector, teams: A.teams, code: A.code, db, plan: planA1 });
  verifyScoring({ label: `${L} A-Q1`, n: 1, rows: dbRound(db(), a1.round.id), plan: planA1, totals: totA });
  await A.admin.page.getByTestId('advance').click();
  await A.admin.page.getByTestId('start-round').waitFor();
  const [a2, b1] = await Promise.all([
    playRound({ label: `${L} A-Q2`, n: 2, srv, admin: A.admin, projector: A.projector, teams: A.teams, code: A.code, db, plan: planA2 }),
    (async () => {
      await sleep(15_000);
      return playRound({ label: `${L} B-Q1`, n: 1, srv, admin: B.admin, projector: B.projector, teams: B.teams, code: B.code, db, plan: planB1 });
    })(),
  ]);
  verifyScoring({ label: `${L} A-Q2`, n: 2, rows: dbRound(db(), a2.round.id), plan: planA2, totals: totA });
  verifyScoring({ label: `${L} B-Q1`, n: 1, rows: dbRound(db(), b1.round.id), plan: planB1, totals: totB });
  check(`${L}: independent scoring per room (A: T1 50, T2 50 · B: T2 50, T1 40)`, JSON.stringify(totA) === JSON.stringify({ 1: 50, 2: 50, 3: 0, 4: 0, 5: 0 }) && JSON.stringify(totB) === JSON.stringify({ 1: 40, 2: 50, 3: 0, 4: 0, 5: 0 }));
  // State isolation: no frame of a room mentions the other room's code, round ids or team ids.
  const idsOf = (R) => {
    const ids = new Set([R.code]);
    for (const c of R.all) for (const f of c.frames) {
      if (f.view?.round?.id) ids.add(f.view.round.id);
      for (const t of f.view?.teams ?? []) ids.add(t.id);
    }
    return ids;
  };
  const idsA = idsOf(A);
  const idsB = idsOf(B);
  for (const [X, other, otherIds] of [[A, 'B', idsB], [B, 'A', idsA]]) {
    const crossed = X.all.filter((c) => c.frames.some((f) => [...otherIds].some((id) => f.raw.includes(id))));
    check(`${L}: room ${X.tag} clients never receive room ${other}'s code, rounds or teams`, crossed.length === 0, crossed.map((c) => c.who).join(','));
  }
  // Credits: while A's Q2 was active, B's Q1 credits existed — A must not have received them.
  const aQ2Frames = A.all.flatMap((c) => c.frames.filter((f) => f.view?.round?.id === a2.round.id && f.t < a2.round.deadline_at - 300));
  check(`${L}: room A's active Q2 frames carry no credits (room B was showing Q1 credits)`, aQ2Frames.length > 0 && aQ2Frames.every((f) => !/"attribution"\s*:\s*\{/.test(f.raw)));
  // Protected media across rooms: a released clip of room B's round with room A's sessions.
  const bAsset = manifests[0].clips[manifests[0].scenes.find((s) => s.kind === 'video').clip].assetId;
  const url = `${srv.base}/api/rounds/${b1.round.id}/media/${bAsset}`;
  const tokA = await token(A.teams[0]);
  const scrA = await A.projector.page.evaluate(() => sessionStorage.getItem('hc.screen.token'));
  const own = (await fetch(url, { headers: { authorization: `Bearer ${await token(B.teams[0])}` } })).status;
  const crossTeam = (await fetch(url, { headers: { authorization: `Bearer ${tokA}` } })).status;
  const crossScreen = (await fetch(url, { headers: { authorization: `Bearer ${scrA}` } })).status;
  check(`${L}: room B's clip — B team 200, A team and A projector refused`, own === 200 && !!scrA && crossTeam !== 200 && crossScreen !== 200, `B ${own} · A team ${crossTeam} · A projector ${crossScreen}`);
  // A team session cannot submit into room B's round.
  const forged = await rawEmit(srv.base, tokA, 'team:submit', { roundId: b1.round.id, submissionId: 'forged-cross-room-1', answer: 'bao cấp' });
  check(`${L}: room A team cannot submit to room B's round`, forged.ok === false && dbRound(db(), b1.round.id).length === planB1.length, JSON.stringify(forged));
  // Different credits on screen at the same time: A in Q2 reveal, B in Q1 reveal.
  await A.teams[0].page.getByTestId('attribution-open').click();
  await B.teams[0].page.getByTestId('attribution-open').click();
  const ta = await A.teams[0].page.getByTestId('attribution-panel').innerText();
  const tb = await B.teams[0].page.getByTestId('attribution-panel').innerText();
  check(`${L}: room A shows Q2 credits, room B shows Q1 credits`, ta.includes(SIGNATURE.q2) && !ta.includes(SIGNATURE.q1) && tb.includes(SIGNATURE.q1) && !tb.includes(SIGNATURE.q2));
  for (const c of [...A.all, ...B.all]) await c.context.close();
  await srv.stop();
}

// ====================================================================== scenario: nowinner
async function scenarioNoWinner() {
  const L = 'NOWINNER (fixture: 6 s rounds)';
  const srv = await startServer({ port: 4364, password: PW, roundMs: 6_000 });
  const admin = await client('admin', srv.base, { width: 1400, height: 900 });
  const { code, pins } = await adminRoom(admin.page, srv.base, PW, srv.dbPath, 0);
  await admin.page.getByTestId('projector-create').click();
  const projector = await client('projector', srv.base, { width: 1920, height: 1080 });
  await projector.page.goto(await admin.page.getByTestId('projector-link').inputValue());
  await projector.page.getByTestId('screen-room-code').waitFor();
  const t1 = await client('team1', srv.base, { width: 390, height: 844 });
  await joinTeam(t1.page, srv.base, code, pins[0]);
  for (let n = 1; n <= 6; n++) {
    await startRound(admin.page);
    await t1.page.getByTestId('answer-input').waitFor();
    await submitUi(t1, 'không biết');
    await t1.page.getByTestId('submitted-ack').waitFor();
    await projector.page.getByTestId('screen-reveal').waitFor({ timeout: 15_000 });
    await admin.page.getByTestId('advance').click();
    if (n < 6) await admin.page.getByTestId('start-round').waitFor();
  }
  await projector.page.getByTestId('screen-final').waitFor();
  await sleep(1_000);
  const title = await projector.page.getByTestId('screen-final-title').innerText();
  const podium = await projector.page.locator('.podium-col').count();
  const rest = await projector.page.getByTestId('final-rest').locator('li').count();
  check(`${L}: nobody scored → neutral final, empty podium, all five teams listed with 0`, title.includes('Chưa có đội nào ghi điểm') && podium === 0 && rest === 5, `${title} · podium ${podium} · list ${rest}`);
  if (OUT) await projector.page.screenshot({ path: join(OUT, 'final-nowinner-projector.png') });
  for (const c of [admin, projector, t1]) await c.context.close();
  await srv.stop();
}

// ====================================================================== run
const SCENARIOS = ['main', 'restart', 'rooms', 'nowinner'];
// Minimum number of checks each scenario must produce: a scenario that silently returned early fails.
const MIN_CHECKS = { main: 300, restart: 35, rooms: 20, nowinner: 1 };
if (SCENARIO !== 'all' && !SCENARIOS.includes(SCENARIO)) {
  console.error(`unknown SCENARIO "${SCENARIO}" (all | ${SCENARIOS.join(' | ')})`);
  process.exit(1);
}
browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const t0 = Date.now();
for (const [name, fn] of [['main', scenarioMain], ['restart', scenarioRestart], ['rooms', scenarioRooms], ['nowinner', scenarioNoWinner]]) {
  if (SCENARIO !== 'all' && SCENARIO !== name) continue;
  const s0 = Date.now();
  const before = results.length;
  try {
    await fn();
  } catch (e) {
    check(`${name}: scenario completed without an exception`, false, String(e?.stack ?? e).split('\n').slice(0, 3).join(' | '));
  }
  metrics[`${name}DurationS`] = Math.round((Date.now() - s0) / 1000);
  const produced = results.length - before;
  check(`${name}: scenario ran to completion (${produced} checks ≥ ${MIN_CHECKS[name]})`, produced >= MIN_CHECKS[name]);
}
const ran = SCENARIOS.filter((n) => metrics[`${n}DurationS`] !== undefined);
check(`scenarios run: ${ran.join(', ')}${SCENARIO === 'all' ? ' (all four required)' : ' (single scenario requested)'}`, SCENARIO === 'all' ? ran.length === SCENARIOS.length : ran.length === 1);
await browser.close();
metrics.totalDurationS = Math.round((Date.now() - t0) / 1000);
console.log('METRICS ' + JSON.stringify(metrics));
if (OUT) writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 1));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
