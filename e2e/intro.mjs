// M4.3 step 2 browser proof: the server-synchronized 5 s question intro.
// Real production questions and 40 s rounds; 1 admin + 5 players (one on a 360×740 phone) + 1 projector.
// npm run build && node --import tsx e2e/intro.mjs
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { io as connectIo } from 'socket.io-client';
import { startApp } from '../server/app.ts';
import { QUESTIONS } from '../server/content/questions.ts';

const out = process.env.OUT ?? 'media-build/m43-intro/intro-browser';
mkdirSync(out, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'hc-intro-browser-'));
const PASSWORD = 'intro-browser-test';
const SYNC_MS = 750;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const checks = [];
const metrics = {};
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`);
  assert.ok(ok, `${name}: ${JSON.stringify(detail)}`);
};

let app, browser;
const sockets = [];
try {
  app = await startApp({ dbPath: join(dir, 'game.sqlite'), adminPassword: PASSWORD, roundDurationMs: 40_000, staticDir: resolve('dist'), musicRoot: dir });
  const post = async (path, body, token) => {
    const r = await fetch(app.url + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    assert.ok(r.ok, `${path}: ${r.status}`);
    return r.json();
  };
  const { token: admin } = await post('/api/admin/login', { password: PASSWORD });
  const { code } = await post('/api/admin/rooms', {}, admin);
  const room = app.db.roomByCode(code);
  const pins = app.engine.teams(room.id).map((t) => t.pin);
  const teamTokens = [];
  for (const pin of pins) teamTokens.push((await post('/api/join', { code, pin })).token);
  const { secret } = await post(`/api/admin/rooms/${code}/screen-pairing`, {}, admin);

  browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true });
  const errors = [];
  const mediaRequests = [];
  /** A page whose tab session already holds `entries` (sessionStorage), like a signed-in tab. */
  const open = async (who, viewport, url, entries = {}) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
    const page = await context.newPage();
    await page.addInitScript((e) => { for (const [k, v] of Object.entries(e)) sessionStorage.setItem(k, v); }, entries);
    page.on('pageerror', (e) => errors.push(`${who}: ${e}`));
    page.on('request', (r) => { if (r.url().includes('/media/')) mediaRequests.push({ who, url: r.url(), at: Date.now() }); });
    const frames = [];
    page.on('websocket', (ws) => ws.on('framereceived', (f) => { if (typeof f.payload === 'string' && f.payload.startsWith('42["state"')) frames.push({ at: Date.now(), payload: f.payload }); }));
    await page.goto(url);
    return { who, page, context, frames };
  };
  const adminPage = await open('admin', { width: 1366, height: 768 }, `${app.url}/admin`, { 'hc.admin.token': admin, 'hc.admin.room': code });
  const players = [];
  for (let i = 0; i < 5; i++) players.push(await open(`team${i + 1}`, i === 0 ? { width: 360, height: 740 } : { width: 1366, height: 768 }, `${app.url}/`, { 'hc.team.token': teamTokens[i] }));
  const projector = await open('projector', { width: 1920, height: 1080 }, `${app.url}/screen#pair=${secret}`);
  await adminPage.page.getByTestId('start-round').waitFor();
  await Promise.all(players.map((p) => p.page.getByTestId('ready-button').waitFor()));
  await projector.page.getByTestId('screen-lobby').waitFor();
  const all = [adminPage, ...players, projector];

  // Raw clients for protocol-level probes (repeated start, early answers).
  const raw = (auth) => new Promise((resolveSocket, reject) => {
    const s = connectIo(app.url, { auth, transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(s);
    s.once('state', () => resolveSocket(s));
    s.once('connect_error', reject);
  });
  const ack = (s, event, payload) => new Promise((r) => s.emit(event, payload, r));
  const rawAdmin = await raw({ token: admin, roomCode: code });
  const rawTeam = await raw({ token: teamTokens[2] });

  // ---------------------------------------------------------------- Q1 intro
  await adminPage.page.getByTestId('start-round').click();
  const command = Date.now();
  await adminPage.page.getByRole('dialog').getByRole('button', { name: 'Bắt đầu' }).click();
  await Promise.all(all.map((c) => c.page.getByTestId('question-intro').waitFor({ timeout: 3000 })));
  const round = app.engine.openRound(room.id);
  const introStart = round.started_at - 5_000;
  // Each page records (same machine clock) when its active-round UI first appears.
  const ACTIVE_SEL = { admin: '[data-testid="submitted-count"]', projector: '[data-testid="screen-play"]' };
  const watchActive = (c) => c.page.evaluate((sel) => { window.activeAt = null; const tick = () => { if (document.querySelector(sel)) window.activeAt = Date.now(); else requestAnimationFrame(tick); }; tick(); }, ACTIVE_SEL[c.who] ?? '[data-testid="answer-input"]');
  await Promise.all(all.map(watchActive));
  check('the start command opens a 5 s intro, then exactly 40 s of round', introStart >= command - 50 && introStart <= command + 1500 && round.deadline_at - round.started_at === 40_000, { intro: round.started_at - introStart, round: round.deadline_at - round.started_at });
  check('admin, 5 players and projector all show the intro', true);
  check('repeated start command during the intro is refused', (await ack(rawAdmin, 'admin:start', {})).error === 'wrong_phase');
  check('only one round exists', app.db.roundsByRoom(room.id).length === 1);

  // Same countdown everywhere: sample mid-second so a sub-second skew cannot flip the digit.
  const midSecond = () => { const r = (round.started_at - Date.now()) % 1000; return r > 500 ? r - 500 : r + 500; };
  await sleep(midSecond());
  const counts = await Promise.all(all.map((c) => c.page.getByTestId('intro-countdown').getAttribute('data-seconds')));
  const expected = String(Math.ceil((round.started_at - Date.now()) / 1000));
  check('same countdown digit on admin, players and projector', counts.every((x) => x === counts[0]) && Math.abs(Number(counts[0]) - Number(expected)) <= 1, `${counts.join(',')} (server ${expected})`);
  const prompts = await Promise.all(all.map((c) => c.page.getByTestId('intro-prompt').innerText()));
  check('Q1 orientation question shown identically everywhere', prompts.every((p) => p === QUESTIONS[0].prompt), prompts[0]);
  const ui = await Promise.all(all.map((c) => c.page.evaluate(() => ({ input: !!document.querySelector('[data-testid="answer-input"]'), video: document.querySelectorAll('video').length, stage: !!document.querySelector('.scene-stage'), text: document.body.innerText }))));
  check('no answer form, video or scene stage during the intro', ui.every((u) => !u.input && !u.video && !u.stage));
  check('no canonical answer visible during the intro', ui.every((u) => QUESTIONS.every((q) => !norm(u.text).includes(norm(q.answer)))));

  // Early answer and early media are refused by the server.
  const early = await ack(rawTeam, 'team:submit', { roundId: round.id, submissionId: 'early-intro-submission', answer: QUESTIONS[0].answer });
  check('an answer during the intro is refused and not recorded', early.ok === false && early.error === 'wrong_phase' && app.db.submissionsByRound(round.id).length === 0, early);
  const opening = QUESTIONS[0].scenes[0];
  const mediaStatus = (await fetch(`${app.url}/api/rounds/${round.id}/media/${opening.media.assetId}`, { headers: { authorization: `Bearer ${teamTokens[0]}` } })).status;
  check('opening scene media is refused during the intro', mediaStatus === 403, mediaStatus);
  check('no client requested any scene media during the intro', mediaRequests.filter((m) => m.at < round.started_at).length === 0);

  // Late join (a second phone of team 2) sees the remaining seconds, never 5.
  await sleep(Math.max(0, round.started_at - 2_600 - Date.now()));
  const late = await open('team2-late', { width: 360, height: 740 }, `${app.url}/`, { 'hc.team.token': teamTokens[1] });
  await late.page.getByTestId('question-intro').waitFor();
  await watchActive(late);
  const lateSeconds = Number(await late.page.getByTestId('intro-countdown').getAttribute('data-seconds'));
  check('late joiner resumes the remaining countdown (not 5)', lateSeconds <= 3 && lateSeconds >= 1, lateSeconds);

  // Layout during the intro (screenshots) at phone, laptop and projector sizes.
  const geometry = (page) => page.evaluate(() => {
    const box = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
    const overlap = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const controls = box('.screen-controls'), count = box('[data-testid="intro-countdown"]'), prompt = box('[data-testid="intro-prompt"]');
    const inView = (b) => !!b && b.left >= -1 && b.right <= innerWidth + 1;
    return { overflow: document.documentElement.scrollWidth > innerWidth + 1, bad: overlap(controls, count) || overlap(controls, prompt), visible: inView(count) && inView(prompt) };
  });
  for (const [c, name] of [[players[0], 'phone-360'], [players[1], 'laptop-1366'], [projector, 'projector-1920'], [adminPage, 'admin-1366']]) {
    const g = await geometry(c.page);
    check(`intro layout ${name}: visible, no overlap or horizontal overflow`, !g.overflow && !g.bad && g.visible, g);
    await c.page.screenshot({ path: join(out, `intro-${name}.png`) });
  }

  // ---------------------------------------------------------------- intro → active
  const appeared = await Promise.all([...all, late].map(async (c) => {
    await c.page.waitForFunction(() => window.activeAt !== null, null, { timeout: 8000 });
    return c.page.evaluate(() => window.activeAt);
  }));
  const spread = Math.max(...appeared) - Math.min(...appeared);
  const firstLate = Math.min(...appeared) - round.started_at;
  check('active round appears together on all clients, at the server start', spread <= SYNC_MS && firstLate >= 0 && firstLate <= SYNC_MS, { spread, firstAfterStart: firstLate });
  metrics.activationSpreadMs = spread;
  // Scene/state frames before the start contained nothing of the round.
  const leaks = [...all, late].flatMap((c) => c.frames.filter((f) => f.at < round.started_at - 50 && (f.payload.includes(round.id) || f.payload.includes(opening.media.assetId) || f.payload.includes('"scenes"') || QUESTIONS.some((q) => norm(f.payload).includes(norm(q.answer))))));
  check('no round id, scene, media id or answer in any state frame before the start', leaks.length === 0, `${leaks.length} bad frames`);
  check('every intro frame carried no future question prompt', [...all, late].every((c) => c.frames.every((f) => QUESTIONS.slice(1).every((q) => !f.payload.includes(q.prompt)))));

  // Prompt banner above the stage during the round; no overlap with the video at three sizes.
  const banner = (page, stageSel = '.scene-stage') => page.evaluate((sel) => {
    const b = document.querySelector('[data-testid="question-prompt"]')?.getBoundingClientRect();
    const s = document.querySelector(sel)?.getBoundingClientRect();
    const controls = document.querySelector('.screen-controls')?.getBoundingClientRect();
    if (!b || !s) return { missing: true };
    const overlap = (a, c) => !!a && !!c && a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top;
    return { text: document.querySelector('[data-testid="question-prompt"]').textContent, above: b.bottom <= s.top + 0.5, overlapStage: overlap(b, s), overlapControls: overlap(b, controls), stageWidth: Math.round(s.width), stageHeight: Math.round(s.height), stageBottom: Math.round(s.bottom), lines: Math.round(b.height / parseFloat(getComputedStyle(document.querySelector('[data-testid="question-prompt"]')).lineHeight)), overflow: document.documentElement.scrollWidth > innerWidth + 1, vh: innerHeight };
  }, stageSel);
  metrics.banner = {};
  for (const [c, sizes] of [[projector, [[1920, 1080], [1366, 768], [360, 740]]], [players[1], [[1366, 768], [1920, 1080]]], [players[0], [[360, 740]]]]) {
    for (const [width, height] of sizes) {
      await c.page.setViewportSize({ width, height });
      await c.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const g = await banner(c.page);
      metrics.banner[`${c.who}-${width}x${height}`] = g;
      check(`${c.who} ${width}×${height}: prompt above the video, ≤2 lines, no overlap/overflow`, !g.missing && g.text === QUESTIONS[0].prompt && g.above && !g.overlapStage && !g.overlapControls && g.lines <= 2 && !g.overflow, g);
      await c.page.screenshot({ path: join(out, `active-${c.who}-${width}.png`) });
    }
  }
  await projector.page.setViewportSize({ width: 1920, height: 1080 });
  await players[0].page.setViewportSize({ width: 360, height: 740 });
  await players[1].page.setViewportSize({ width: 1366, height: 768 });
  const fit = await projector.page.evaluate(() => { const s = document.querySelector('.scene-stage').getBoundingClientRect(); return s.bottom <= innerHeight && s.top >= 0; });
  check('projector 1920×1080: the whole video frame stays on screen', fit);

  // Answers: first answer second is the first active second; scoring unchanged.
  const answers = [[2, QUESTIONS[0].answer], [0, 'bao cap'], [4, 'sai']];
  for (const [i, text] of answers) {
    const p = players[i].page;
    await p.getByTestId('answer-input').fill(text);
    await p.getByTestId('answer-submit').click();
    await p.getByRole('dialog').getByRole('button', { name: 'Gửi' }).click();
    await p.getByTestId('submitted-ack').waitFor();
  }
  const subs = app.db.submissionsByRound(round.id);
  check('answers recorded only after the active start', subs.length === 3 && subs.every((s) => s.received_at >= round.started_at));
  await projector.page.getByTestId('screen-reveal').waitFor({ timeout: 45_000 });
  const revealedAfter = Date.now() - round.started_at;
  check('reveal 40 s after the active start (45 s after the command), never earlier', revealedAfter >= 40_000 && revealedAfter < 41_500, `${revealedAfter} ms after active start`);
  const pts = app.db.submissionsByRound(round.id).map((s) => [s.team_id, s.points]);
  const teams = app.engine.teams(room.id);
  check('scoring unchanged (receipt order 50/40, wrong 0)', JSON.stringify(pts) === JSON.stringify([[teams[2].id, 50], [teams[0].id, 40], [teams[4].id, 0]]), pts);

  // ---------------------------------------------------------------- Q2 intro: refresh and reconnect
  await adminPage.page.getByTestId('advance').click();
  await adminPage.page.getByTestId('start-round').filter({ hasText: 'Bắt đầu câu 2' }).waitFor();
  await adminPage.page.getByTestId('start-round').click();
  await adminPage.page.getByRole('dialog').getByRole('button', { name: 'Bắt đầu' }).click();
  await projector.page.getByTestId('question-intro').waitFor();
  const q2 = app.engine.openRound(room.id);
  check('Q2 shows its own orientation question', (await projector.page.getByTestId('intro-prompt').innerText()) === QUESTIONS[1].prompt);
  const remainingDigit = () => Math.ceil((q2.started_at - Date.now()) / 1000);
  const midQ2 = async () => { const r = (q2.started_at - Date.now()) % 1000; await sleep(r > 500 ? r - 500 : r + 500); };
  await players[3].context.setOffline(true);
  await players[3].page.locator('.conn-reconnecting').waitFor({ timeout: 3000 });
  await sleep(300);
  await players[3].context.setOffline(false);
  await players[3].page.locator('.conn-connected').waitFor({ timeout: 4000 });
  await midQ2();
  const reconnected = Number(await players[3].page.getByTestId('intro-countdown').getAttribute('data-seconds'));
  const expectReconnect = remainingDigit();
  check('player reconnecting during the intro shows the same remaining countdown', reconnected === expectReconnect && reconnected < 5, `${reconnected} (server ${expectReconnect})`);
  await projector.page.reload();
  await projector.page.getByTestId('question-intro').waitFor({ timeout: 3000 });
  if (q2.started_at - Date.now() > 700) {
    await midQ2();
    const afterRefresh = Number(await projector.page.getByTestId('intro-countdown').getAttribute('data-seconds'));
    const expectRefresh = remainingDigit();
    check('projector refresh during the intro keeps pairing and resumes the remaining countdown', afterRefresh === expectRefresh && afterRefresh < 5 && (await projector.page.getByTestId('screen-unpaired').count()) === 0, `${afterRefresh} (server ${expectRefresh})`);
  } else {
    check('projector refresh during the intro keeps pairing and shows the intro', (await projector.page.getByTestId('screen-unpaired').count()) === 0, 'reloaded within the last 0.7 s');
  }
  check('no new round and unchanged times after refresh/reconnect', app.db.roundsByRoom(room.id).length === 2 && app.db.roundById(q2.id).started_at === q2.started_at && app.db.roundById(q2.id).deadline_at === q2.deadline_at);
  await projector.page.getByTestId('screen-play').waitFor({ timeout: 6000 });
  check('Q2 starts at the original server time after the refresh', Date.now() - q2.started_at < SYNC_MS, `${Date.now() - q2.started_at} ms`);
  check('no unhandled page errors', errors.length === 0, errors.join('; '));
  writeFileSync(join(out, 'evidence.json'), JSON.stringify({ checks, metrics, chrome: browser.version() }, null, 2));
  console.log(`${checks.length}/${checks.length} checks passed`);
} catch (e) {
  writeFileSync(join(out, 'failure.json'), JSON.stringify({ error: String(e), checks, metrics }, null, 2));
  throw e;
} finally {
  sockets.forEach((s) => s.disconnect());
  await browser?.close();
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
}
