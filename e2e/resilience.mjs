// Network-resilience and performance E2E (M2.3). Run `npm run build` first. Local Google Chrome.
//
// Every team device and the projector reach the server through its own TCP impairment proxy
// (e2e/lib/netproxy.mjs), which delays / throttles / freezes / cuts HTTP *and* WebSocket traffic
// alike. The admin connects directly. Two real 60 s rounds of the selected montage (HC_QUESTION):
//   Run A "LAN"      — no impairment (baseline metrics)
//   Run B "Wi-Fi"    — 60 ms latency + up to 80 ms jitter, 2.5 Mbit/s per device, plus incidents:
//                      frozen network while submitting, refresh while disconnected, abrupt cut,
//                      backgrounded (frozen) projector tab, client clock 5 min ahead, and a
//                      submission sent while offline across the deadline.
// Then the authorised media download is timed at several bandwidths.
// Prints PASS/FAIL lines and a METRICS JSON line. Never logs tokens, PINs or answer texts.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { chromium } from 'playwright-core';
import { createProxy } from './lib/netproxy.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const PASSWORD = 'e2e-resilience-password';
const SHOTS = process.env.SHOTS ?? null;
const ROUND_MS = 60_000;
// Question under test: HC_QUESTION=4 (default), 2 or 6 — all production montages (M3.2). Answer texts are typed into the UI only; they are never logged.
const CONFIG = {
  4: {
    index: 3,
    scenes: [{ id: 'b1', at: 0 }, { id: 'b2', at: 5_000 }, { id: 'b3', at: 11_000 }, { id: 'b4', at: 16_000 }, { id: 'b5', at: 23_000 }, { id: 'b6', at: 28_000 }, { id: 'b7', at: 33_000 }, { id: 'b8', at: 39_000 }, { id: 'b9', at: 45_000 }, { id: 'b10', at: 50_000 }],
    videos: {
      b2: { at: 5_000, ms: 6_000, asset: 'k5v8m7wn' },
      b4: { at: 16_000, ms: 7_000, asset: 'f3t9m6ra' },
      b7: { at: 33_000, ms: 6_000, asset: 'w7c2h4pj' },
      b10: { at: 50_000, ms: 7_000, asset: 'n6d1x8zs' },
    },
    images: [],
    answers: { first: 'đổi mới', variant: 'doi moi', late: 'ĐỔI MỚI' },
    answerNorm: 'doimoi',
    catchUpScene: 'b7',
    samples: [4_200, 7_500, 11_500, 14_000, 17_500, 20_000, 24_000, 29_500, 34_500, 37_000, 40_000, 46_000, 49_000, 51_500, 54_000, 56_000],
    phoneTeam: true,
  },
  6: {
    index: 5,
    scenes: [{ id: 'd1', at: 0 }, { id: 'd2', at: 5_000 }, { id: 'd3', at: 10_000 }, { id: 'd4', at: 16_000 }, { id: 'd5', at: 21_000 }, { id: 'd6', at: 27_000 }, { id: 'd7', at: 32_000 }, { id: 'd8', at: 38_000 }, { id: 'd9', at: 45_000 }, { id: 'd10', at: 50_000 }],
    videos: {
      d1: { at: 0, ms: 5_000, asset: 'g2r7k9vb' },
      d3: { at: 10_000, ms: 6_000, asset: 'y4m1t6qe' },
      d5: { at: 21_000, ms: 6_000, asset: 'u8s3n5ck' },
      d6: { at: 27_000, ms: 5_000, asset: 'j9p4w2fd' },
      d10: { at: 50_000, ms: 7_000, asset: 'e1h6z3lm' },
    },
    images: [],
    answers: { first: 'phát triển bền vững', variant: 'phat trien ben vung', late: 'PHÁT TRIỂN BỀN VỮNG' },
    answerNorm: 'phattrienbenvung',
    catchUpScene: 'd7',
    samples: [4_200, 7_500, 11_500, 14_000, 17_500, 20_000, 23_500, 29_500, 34_500, 37_000, 40_000, 46_000, 49_000, 51_500, 54_000, 56_000],
    phoneTeam: true,
  },
  2: {
    index: 1,
    scenes: [{ id: 'a1', at: 0 }, { id: 'a2', at: 5_000 }, { id: 'a3', at: 10_000 }, { id: 'a4', at: 16_000 }, { id: 'a5', at: 22_000 }, { id: 'a6', at: 27_000 }, { id: 'a7', at: 33_000 }, { id: 'a8', at: 39_000 }, { id: 'a9', at: 45_000 }, { id: 'a10', at: 50_000 }],
    videos: {
      a1: { at: 0, ms: 5_000, asset: 'r4t8k1mz' },
      a3: { at: 10_000, ms: 6_000, asset: 'p9w2c6xe' },
      a4: { at: 16_000, ms: 6_000, asset: 'h3n7d5qy' },
      a7: { at: 33_000, ms: 6_000, asset: 'b8j1f4vu' },
      a10: { at: 50_000, ms: 7_000, asset: 'x2m6s9ka' },
    },
    images: [],
    answers: { first: 'cách mạng tháng mười', variant: 'cach mang thang muoi', late: 'CÁCH MẠNG THÁNG MƯỜI' },
    answerNorm: 'cachmangthangmuoi',
    catchUpScene: 'a7',
    samples: [4_200, 7_500, 11_500, 14_000, 17_500, 20_000, 24_000, 29_500, 34_500, 37_000, 40_000, 46_000, 49_000, 51_500, 54_000, 56_000],
    phoneTeam: true, // team 5 uses a 360×740 phone viewport (smallest supported)
  },
}[process.env.HC_QUESTION ?? '4'];
if (!CONFIG) throw new Error('HC_QUESTION must be 2, 4 or 6');
const SCENES = CONFIG.scenes;
const VIDEO_ASSETS = new Set(Object.values(CONFIG.videos).map((v) => v.asset));
const norm = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
if (!existsSync(join(ROOT, 'dist/index.html'))) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const results = [];
const metrics = {};
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  const q = (p) => v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)];
  const out = { n: v.length, min: Math.round(v[0]), median: Math.round(q(0.5)), max: Math.round(v[v.length - 1]) };
  if (v.length >= 20) out.p95 = Math.round(q(0.95));
  return out;
};

// ------------------------------------------------------------------ server
const tempDirs = [];
const procs = [];
process.on('exit', () => {
  for (const p of procs) p.kill('SIGKILL');
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
});
async function startServer(port) {
  const dir = mkdtempSync(join(tmpdir(), 'hc-res-e2e-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'game.sqlite');
  const proc = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ADMIN_PASSWORD: PASSWORD, DB_PATH: dbPath, ROUND_DURATION_MS: String(ROUND_MS), STATIC_DIR: 'dist' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  procs.push(proc);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      /* starting */
    }
    if (i > 150) throw new Error('server did not start');
    await sleep(50);
  }
  return { base, port, dbPath };
}

// ------------------------------------------------------------------ clients
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const sceneLogger = () => {
  window.__sceneLog = [];
  const seen = new Set();
  new MutationObserver(() => {
    const id = document.querySelector('.scene-stage')?.getAttribute('data-scene-id');
    if (id && !seen.has(id)) {
      seen.add(id);
      window.__sceneLog.push({ id, t: Date.now() });
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-scene-id'] });
};
async function client(origin, who, opts = {}) {
  const context = await browser.newContext({ viewport: opts.viewport ?? { width: 1366, height: 768 } });
  const page = await context.newPage();
  if (opts.clockAheadMs) {
    // Client clock ahead of the server (time keeps flowing from the skewed start).
    await page.clock.install({ time: Date.now() + opts.clockAheadMs });
  }
  await page.addInitScript(sceneLogger);
  const c = { who, page, context, origin, receipts: {}, frames: [] };
  page.on('pageerror', (e) => errors.push(`${who}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${who}: ${m.text()}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) errors.push(`${who}: external request ${u}`);
  });
  // Client receipt time of each scene: first state frame that lists it (test-process clock).
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => {
      const m = String(f.payload).match(/^42(\[.*)$/s);
      if (!m) return;
      c.frames.push({ t: Date.now(), text: m[1] });
      try {
        const [event, view] = JSON.parse(m[1]);
        if (event !== 'state' || !view?.round) return;
        for (const s of view.round.scenes) if (!(s.id in c.receipts)) c.receipts[s.id] = Date.now();
      } catch {
        /* partial frame */
      }
    }),
  );
  return c;
}
const countdown = async (c) => Number(await c.page.locator('.countdown-number').first().innerText().catch(() => 'NaN'));

async function runRound(label, port, conditions, incidents) {
  const srv = await startServer(port);
  // Admin (direct)
  const admin = await client(srv.base, 'admin', { viewport: { width: 1920, height: 1080 } });
  await admin.page.goto(`${srv.base}/admin`);
  await admin.page.getByTestId('admin-password').fill(PASSWORD);
  await admin.page.getByRole('button', { name: 'Đăng nhập' }).click();
  await admin.page.getByTestId('create-room').click();
  const code = (await admin.page.getByTestId('room-code').innerText()).trim();
  const db = new Database(srv.dbPath);
  db.prepare("UPDATE rooms SET question_index = ?, phase = 'ready' WHERE code = ?").run(CONFIG.index, code);
  await admin.page.reload();
  await admin.page.getByTestId('start-round').waitFor();
  await admin.page.getByTestId('toggle-pins').click();
  const pins = [];
  for (let i = 1; i <= 5; i++) pins.push(await admin.page.getByTestId(`pin-${i}`).getAttribute('data-pin'));
  await admin.page.getByTestId('toggle-pins').click();

  // Projector + teams, each behind its own proxy.
  const proxies = {};
  const via = async (who) => {
    proxies[who] = await createProxy(srv.port, conditions);
    return `http://127.0.0.1:${proxies[who].port}`;
  };
  await admin.page.getByTestId('projector-create').click();
  const link = await admin.page.getByTestId('projector-link').inputValue();
  const pOrigin = await via('projector');
  const projector = await client(pOrigin, 'projector', { viewport: { width: 1920, height: 1080 } });
  await projector.page.goto(link.replace(srv.base, pOrigin));
  await projector.page.getByTestId('screen-room-code').waitFor({ timeout: 20_000 });
  const players = [];
  for (let i = 0; i < 5; i++) {
    const origin = await via(`team${i + 1}`);
    const phone = CONFIG.phoneTeam && i === 4;
    const p = await client(origin, `team${i + 1}`, { clockAheadMs: incidents && i === 3 ? 5 * 60_000 : 0, viewport: phone ? { width: 360, height: 740 } : undefined });
    await p.page.goto(`${origin}/?room=${code}`, { timeout: 30_000 });
    await p.page.getByTestId('join-pin').fill(pins[i]);
    await p.page.getByRole('button', { name: 'Vào phòng' }).click();
    await p.page.getByTestId('ready-button').click();
    players.push(p);
  }
  await admin.page.getByText('5/5 đội đã kết nối').waitFor({ timeout: 20_000 });

  await admin.page.getByTestId('start-round').click();
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Bắt đầu' }).click();
  await Promise.all(players.map((p) => p.page.getByTestId('answer-input').waitFor({ timeout: 20_000 })));
  const round = db.prepare('SELECT r.id, r.started_at, r.deadline_at FROM rounds r JOIN rooms m ON m.id = r.room_id WHERE m.code = ?').get(code);
  const at = (ms) => sleep(Math.max(0, round.started_at + ms - Date.now()));
  const rows = () => db.prepare('SELECT t.slot, s.received_at FROM submissions s JOIN teams t ON t.id = s.team_id WHERE s.round_id = ?').all(round.id);
  const submitUi = async (p, text) => {
    await p.page.getByTestId('answer-input').fill(text);
    await p.page.getByTestId('answer-submit').click();
    await p.page.getByRole('dialog').getByRole('button', { name: 'Gửi' }).click();
  };
  const drift = [];
  const countdownDiffs = [];
  const domLeaks = [];
  // Teams that submit the correct answer during this round (their own text is echoed to them only).
  const submitters = new Set(['team1', ...(incidents ? ['team2', 'team5'] : [])]);
  // Normal-conditions metrics exclude devices that were deliberately impaired in run B:
  // team2 (frozen 6–16 s + reload), team3 (cut at 20 s), projector (frozen tab 25–36 s),
  // and — for in-page timestamps only — team4, whose clock is deliberately 5 min ahead.
  const impaired = new Set(incidents ? ['team2', 'team3', 'projector'] : []);
  const wallClockOk = (who) => !impaired.has(who) && !(incidents && who === 'team4');

  await at(3_000);
  await submitUi(players[0], CONFIG.answers.first);
  await players[0].page.getByTestId('submitted-ack').waitFor({ timeout: 15_000 });

  // Media protection during the round: released clip 200, future clip 403, no token 401.
  {
    const token = await players[0].page.evaluate(() => sessionStorage.getItem('hc.team.token'));
    const vids = Object.values(CONFIG.videos).sort((x, y) => x.at - y.at);
    const future = vids[vids.length - 1];
    const url = (asset) => `${srv.base}/api/rounds/${round.id}/media/${asset}`;
    const auth = { headers: { authorization: `Bearer ${token}` } };
    if (Date.now() < round.started_at + future.at - 1_000) {
      check(`${label}: future clip refused before its release (403)`, (await fetch(url(future.asset), auth)).status === 403);
    }
    check(`${label}: media without a session refused (401)`, (await fetch(url(vids[0].asset))).status === 401);
    if (vids[0].at <= Date.now() - round.started_at) check(`${label}: released clip served to the team (200)`, (await fetch(url(vids[0].asset), auth)).status === 200);
  }

  let reloadDone = null;
  if (incidents) {
    // --- frozen network while submitting, then refresh while still disconnected
    await at(6_000);
    proxies.team2.set({ frozen: true });
    await submitUi(players[1], CONFIG.answers.variant);
    await players[1].page.getByTestId('delivery-uncertain').waitFor({ timeout: 10_000 });
    check(`${label}: no ack → "Chưa xác nhận" shown, never "Đã ghi nhận"`, (await players[1].page.getByTestId('submitted-ack').count()) === 0);
    check(`${label}: the answer stays locked while unconfirmed (no input)`, (await players[1].page.getByTestId('answer-input').count()) === 0);
    await at(13_000);
    reloadDone = players[1].page.reload({ timeout: 60_000 }); // refresh while the network is frozen
    await at(16_000);
    proxies.team2.set({ frozen: false });
    await reloadDone;
    await players[1].page.getByTestId('submitted-ack').waitFor({ timeout: 20_000 });
    check(`${label}: after refresh + reconnect the pending answer is confirmed by the server`, true);
    check(`${label}: recorded exactly once`, rows().filter((r) => r.slot === 2).length === 1);

    // --- abrupt disconnect (TCP reset) and Socket.IO reconnect
    await at(20_000);
    const cutAt = Date.now();
    proxies.team3.cut();
    await players[2].page.locator('.conn-reconnecting').waitFor({ timeout: 10_000 }).catch(() => {});
    await players[2].page.locator('.conn-connected').waitFor({ timeout: 20_000 });
    metrics[`${label}: reconnect after abrupt cut (ms)`] = Date.now() - cutAt;
    check(`${label}: abruptly cut team reconnects by itself`, true, `${Date.now() - cutAt} ms`);

    // --- projector tab backgrounded/frozen (timers and rendering stop), then foregrounded
    await at(25_000);
    const cdp = await projector.context.newCDPSession(projector.page);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await at(36_000);
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    const resumeAt = Date.now();
    await projector.page.locator(`.scene-stage[data-scene-id="${CONFIG.catchUpScene}"]`).waitFor({ timeout: 10_000 });
    metrics[`${label}: projector catch-up after 11 s frozen tab (ms)`] = Date.now() - resumeAt;
    const remaining = await countdown(projector);
    const expected = Math.ceil((round.deadline_at - Date.now()) / 1000);
    check(`${label}: foregrounded projector shows the current scene and countdown`, Math.abs(remaining - expected) <= 1, `${remaining}s vs ${expected}s`);

    // --- client clock 5 min ahead: countdown still follows the server deadline
    await at(38_000);
    const skewed = await countdown(players[3]);
    const ref = await countdown(admin);
    check(`${label}: team with clock 5 min ahead shows the server countdown`, Math.abs(skewed - ref) <= 1, `${skewed}s vs admin ${ref}s`);
  }

  // --- countdown agreement and video drift (all clients)
  for (const t of CONFIG.samples) {
    if (Date.now() > round.started_at + t) continue; // an incident above already passed this time
    await at(t);
    if (t >= 40_000) {
      const values = await Promise.all([admin, projector, ...players].map(countdown));
      const expected = Math.ceil((round.deadline_at - Date.now()) / 1000);
      for (const v of values) if (Number.isFinite(v)) countdownDiffs.push(Math.abs(v - expected));
    }
    for (const c of [projector, ...players]) {
      const text = await c.page.evaluate(() => document.body.innerText).catch(() => '');
      // Teams that typed the answer see their own submission echoed back; that is not a leak.
      if (!submitters.has(c.who) && Date.now() < round.deadline_at - 200 && norm(text).includes(CONFIG.answerNorm)) domLeaks.push(c.who);
    }
    for (const c of [projector, ...players]) {
      const s = await c.page.evaluate(() => {
        const v = document.querySelector('.scene-in video');
        const id = document.querySelector('.scene-stage')?.getAttribute('data-scene-id');
        return v && v.readyState >= 2 ? { t: v.currentTime, now: Date.now(), id } : null;
      });
      const vid = s && CONFIG.videos[s.id];
      // Only while the clip is still playing (afterwards it holds its last frame by design).
      if (vid && wallClockOk(c.who)) {
        const expectedS = (s.now - (round.started_at + vid.at)) / 1000;
        if (expectedS < vid.ms / 1000 - 0.3) drift.push(Math.abs(s.t - expectedS) * 1000);
      }
    }
    if (CONFIG.phoneTeam && !incidents && !('phone (360×740) scene stage width (px)' in metrics)) {
      // Rendered width of the scene stage on the smallest supported phone (360×740): the burned-in
      // text legibility rule in media/q2/manifest.json assumes ≥ 336 px.
      const w = await players[4].page.evaluate(() => document.querySelector('.scene-stage')?.getBoundingClientRect().width ?? null);
      metrics['phone (360×740) scene stage width (px)'] = w;
      check(`${label}: phone scene stage ≥ 336 px wide (legibility assumption)`, w !== null && w >= 336, `${w} px`);
    }
    if (SHOTS && !incidents) {
      await projector.page.screenshot({ path: `${SHOTS}/${label}-projector-${String(t).padStart(5, '0')}.png` });
      await players[4].page.screenshot({ path: `${SHOTS}/${label}-team5-${String(t).padStart(5, '0')}.png` });
    }
  }
  if (SHOTS) await players[4].page.screenshot({ path: `${SHOTS}/${label}-team5-video.png` });
  check(`${label}: answer never in page text before the deadline`, domLeaks.length === 0, domLeaks.join(','));
  check(`${label}: no results shown before the deadline`, (await Promise.all(players.map((p) => p.page.getByTestId('my-result').count()))).every((n) => n === 0) || Date.now() >= round.deadline_at);

  let lateSubmitted = false;
  if (incidents) {
    // --- offline across the deadline: the answer must not be accepted or reported as recorded
    await at(50_000);
    proxies.team5.set({ frozen: true });
    await at(52_000);
    await submitUi(players[4], CONFIG.answers.late);
    lateSubmitted = true;
    await at(58_000);
    check(`${label}: offline submission is not reported as recorded`, (await players[4].page.getByTestId('submitted-ack').count()) === 0);
    await at(63_000);
    proxies.team5.set({ frozen: false });
  }

  // --- reveal
  await Promise.all(players.map((p) => p.page.getByTestId('my-result').waitFor({ timeout: 30_000 })));
  const revealText = await players[0].page.getByTestId('my-result').innerText();
  check(`${label}: team 1 scored first (+50)`, revealText.includes('+50'));
  if (incidents) {
    check(`${label}: team 2 (recovered submission) scored once (+40)`, (await players[1].page.getByTestId('my-result').innerText()).includes('+40'));
    check(`${label}: the offline-across-deadline answer was not accepted`, lateSubmitted && rows().filter((r) => r.slot === 5).length === 0 && (await players[4].page.getByTestId('my-result').innerText()).includes('chưa nộp'));
  }
  check(`${label}: no submissions accepted after the deadline`, rows().every((r) => r.received_at < round.deadline_at));

  // --- metrics
  const logs = await Promise.all([projector, ...players].map((c) => c.page.evaluate(() => window.__sceneLog)));
  const visibleLag = [];
  const receiptLag = [];
  [projector, ...players].forEach((c, i) => {
    for (const s of SCENES.slice(1)) {
      const seen = logs[i].find((x) => x.id === s.id);
      if (seen && wallClockOk(c.who)) visibleLag.push(seen.t - (round.started_at + s.at));
      if (c.receipts[s.id] && !impaired.has(c.who)) receiptLag.push(c.receipts[s.id] - (round.started_at + s.at)); // test-process clock
    }
  });
  const media = (
    await Promise.all(
      [projector, ...players].map((c) =>
        c.page.evaluate(() =>
          performance
            .getEntriesByType('resource')
            .filter((e) => e.name.includes('/media/'))
            .map((e) => ({ asset: e.name.split('/').pop(), ms: e.responseEnd - e.startTime, bytes: e.encodedBodySize, start: performance.timeOrigin + e.startTime })),
        ),
      ),
    )
  ).flat();
  metrics[`${label}: server release → client receipt (ms)`] = stats(receiptLag);
  metrics[`${label}: server release → scene visible (ms)`] = stats(visibleLag);
  for (const m of media) m.kind = VIDEO_ASSETS.has(m.asset) ? 'video' : 'image';
  if (media.some((m) => m.kind === 'image')) metrics[`${label}: image download (ms)`] = stats(media.filter((m) => m.kind === 'image').map((m) => m.ms));
  metrics[`${label}: video download (ms)`] = stats(media.filter((m) => m.kind === 'video').map((m) => m.ms));
  metrics[`${label}: video download per clip (ms)`] = Object.fromEntries([...VIDEO_ASSETS].map((a) => [a, stats(media.filter((m) => m.asset === a).map((m) => m.ms))]));
  metrics[`${label}: video payload per clip (bytes)`] = Object.fromEntries([...VIDEO_ASSETS].map((a) => [a, media.find((m) => m.asset === a)?.bytes ?? null]));
  // No client may start downloading a clip before its scene was released (no preloading).
  const early = media.filter((m) => m.kind === 'video').filter((m) => {
    const v = Object.values(CONFIG.videos).find((x) => x.asset === m.asset);
    return m.start < round.started_at + v.at - 50; // 50 ms tolerance for clock reading
  });
  check(`${label}: no clip fetched before its release time`, early.length === 0, early.map((m) => m.asset).join(','));
  // Answer never present in any WebSocket frame or page text before the deadline.
  const leakFrames = [projector, ...players].filter((c) => !submitters.has(c.who)).flatMap((c) => c.frames.filter((f) => f.t < round.deadline_at - 200 && norm(f.text).includes(CONFIG.answerNorm)).map(() => c.who));
  check(`${label}: no state frame before the deadline contained the answer (projector + ${[projector, ...players].length - 1 - submitters.size} non-submitting teams)`, leakFrames.length === 0, [...new Set(leakFrames)].join(','));
  metrics[`${label}: video drift vs server timeline (ms)`] = stats(drift);
  metrics[`${label}: countdown difference vs server deadline (s)`] = stats(countdownDiffs);
  // Redundant fetches: the same media URL fetched twice by one page (reloaded pages excluded).
  const dupes = await Promise.all(
    [projector, ...players].map((c) =>
      c.page.evaluate(() => {
        const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/media/'));
        return urls.length - new Set(urls).size;
      }),
    ),
  );
  metrics[`${label}: redundant media fetches (all clients)`] = dupes.reduce((a, b) => a + b, 0);

  const sync = SCENES.slice(1).map((s) => {
    const ts = [projector, ...players]
      .map((c, i) => (wallClockOk(c.who) ? logs[i].find((x) => x.id === s.id)?.t : null))
      .filter(Boolean);
    return ts.length > 1 ? Math.max(...ts) - Math.min(...ts) : 0;
  });
  metrics[`${label}: scene spread between clients (ms)`] = stats(sync);

  const result = { srv, db, round, admin, projector, players, proxies, code };
  return result;
}

// One fresh TCP connection per download (agent: false): fetch() keeps sockets alive across the
// short-lived throttling proxies below, and a reused socket to a closed proxy can return stale bytes.
const download = (url, headers) =>
  new Promise((resolve, reject) => {
    http
      .get(url, { headers, agent: false }, (res) => {
        let n = 0;
        res.on('data', (d) => (n += d.length));
        res.on('end', () => (res.statusCode === 200 ? resolve(n) : reject(new Error(`HTTP ${res.statusCode}`))));
      })
      .on('error', reject);
  });

// ================================================================== Run A — LAN
const A = await runRound('A-LAN', 4350, {}, false);
// ================================================================== media under bandwidth limits
{
  // The round is closed now, so every scene of it may be fetched: time the raw download per bandwidth.
  const token = await A.players[0].page.evaluate(() => sessionStorage.getItem('hc.team.token'));
  const rows = [];
  for (const mbps of [1, 2, 5, 10]) {
    const proxy = await createProxy(A.srv.port, { bytesPerSecond: (mbps * 1_000_000) / 8 });
    for (const [kind, asset] of [...[...VIDEO_ASSETS].map((a) => ['video', a]), ...CONFIG.images.slice(-1).map((a) => ['image', a])]) {
      const t0 = Date.now();
      const bytes = await download(`http://127.0.0.1:${proxy.port}/api/rounds/${A.round.id}/media/${asset}`, { authorization: `Bearer ${token}` });
      rows.push({ mbps, kind, bytes, ms: Date.now() - t0 });
    }
    await proxy.close();
  }
  metrics['media download time by per-device bandwidth (single client)'] = rows;
}
for (const c of [A.admin, A.projector, ...A.players]) await c.context.close();
for (const p of Object.values(A.proxies)) await p.close();
A.db.close();

// ================================================================== Run B — congested Wi-Fi + incidents
const B = await runRound('B-WiFi', 4351, { latencyMs: 60, jitterMs: 80, bytesPerSecond: 312_500 }, true);
for (const c of [B.admin, B.projector, ...B.players]) await c.context.close();
for (const p of Object.values(B.proxies)) await p.close();
B.db.close();

// Expected noise: failed loads while a device's network was cut/frozen, deliberate reconnects.
const expected = errors.filter((e) => /Failed to load resource|WebSocket connection to .* failed|ERR_|net::/.test(e));
const unexpected = errors.filter((e) => !expected.includes(e));
check('no unexpected console errors or external requests', unexpected.length === 0, unexpected.slice(0, 4).join(' | ') || `${expected.length} expected network errors`);
console.log('\nMETRICS ' + JSON.stringify(metrics, null, 1));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
