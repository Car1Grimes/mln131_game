// Scene-engine browser E2E (M2.1): one admin + five players watch the Question 4 prototype montage
// (image, text, date, image, statistic, video) in a real 60-second round served by the Node server.
// Run `npm run build` first. Uses the locally installed Google Chrome via playwright-core.
// Test seeding: the room is moved straight to question 4 in this test's own temporary database.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { chromium } from 'playwright-core';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_SCENES_PORT ?? 4320);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'e2e-scenes-password';
const SHOTS = process.env.SHOTS ?? null;
const ROUND_MS = 60_000;
// Prototype timeline of question 4 (server/content/questions.ts). Asset ids are opaque.
const TIMELINE = [
  { id: 's1', kind: 'image', at: 0 },
  { id: 's2', kind: 'text-card', at: 9_000 },
  { id: 's3', kind: 'date', at: 18_000 },
  { id: 's4', kind: 'image', at: 26_000 },
  { id: 's5', kind: 'statistic', at: 34_000 },
  { id: 's6', kind: 'video', at: 42_000 },
];
const LATE_IMAGE = 'm3q8v1ze'; // released at 26 s
const VIDEO = 'v5n4c6tw'; // released at 42 s
const SYNC_SPREAD_MS = 750; // max difference between players showing the same scene
const RELEASE_LAG_MS = 1_500; // max delay from server release to a player showing it
const VIDEO_TOLERANCE_S = 0.75; // video position vs server timeline

if (!existsSync(join(ROOT, 'dist/index.html'))) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const norm = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ server
const dataDir = mkdtempSync(join(tmpdir(), 'hc-scenes-'));
const dbPath = join(dataDir, 'scenes.sqlite');
const server = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ADMIN_PASSWORD: PASSWORD, DB_PATH: dbPath, ROUND_DURATION_MS: String(ROUND_MS), STATIC_DIR: 'dist' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
process.on('exit', () => {
  server.kill('SIGTERM');
  rmSync(dataDir, { recursive: true, force: true });
});
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${BASE}/api/health`)).ok) break;
  } catch {
    /* starting */
  }
  if (i > 100) {
    console.error('server did not start\n' + serverLog);
    process.exit(1);
  }
  await sleep(100);
}

// ------------------------------------------------------------------ clients
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const sceneLogger = () => {
  // Records when the stage starts showing each scene (local wall clock; all contexts share one machine).
  window.__sceneLog = [];
  const seen = new Set();
  new MutationObserver(() => {
    const el = document.querySelector('.scene-stage');
    const id = el?.getAttribute('data-scene-id');
    if (id && !seen.has(id)) {
      seen.add(id);
      window.__sceneLog.push({ id, kind: el.getAttribute('data-scene-kind'), t: Date.now() });
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-scene-id'] });
};
async function client(who, viewport = { width: 1366, height: 768 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(sceneLogger);
  page.on('pageerror', (e) => errors.push(`${who}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${who}: ${m.text()}`));
  page.on('request', (r) => {
    if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) errors.push(`${who}: external request ${r.url()}`);
  });
  return { who, page, context };
}
const shot = async (c, name) => SHOTS && c.page.screenshot({ path: `${SHOTS}/${name}.png` });

const admin = await client('admin', { width: 1920, height: 1080 });
await admin.page.goto(`${BASE}/admin`);
await admin.page.getByTestId('admin-password').fill(PASSWORD);
await admin.page.getByRole('button', { name: 'Đăng nhập' }).click();
await admin.page.getByTestId('create-room').click();
const code = (await admin.page.getByTestId('room-code').innerText()).trim();

// Seed: jump this test room to question 4 (index 3).
const db = new Database(dbPath);
db.prepare("UPDATE rooms SET question_index = 3, phase = 'ready' WHERE code = ?").run(code);
await admin.page.reload();
await admin.page.getByTestId('start-round').filter({ hasText: 'Bắt đầu câu 4' }).waitFor();
await admin.page.getByTestId('toggle-pins').click();
const pins = [];
for (let i = 1; i <= 5; i++) pins.push(await admin.page.getByTestId(`pin-${i}`).getAttribute('data-pin'));

const players = [];
for (let i = 0; i < 5; i++) {
  const p = await client(`team${i + 1}`, i === 4 ? { width: 390, height: 844 } : { width: 1366, height: 768 });
  await p.page.goto(`${BASE}/?room=${code}`);
  await p.page.getByTestId('join-pin').fill(pins[i]);
  await p.page.getByRole('button', { name: 'Vào phòng' }).click();
  await p.page.getByTestId('ready-button').click();
  players.push(p);
}
await admin.page.getByText('5/5 đội đã kết nối · 5 đội sẵn sàng').waitFor();

await admin.page.getByTestId('start-round').click();
await admin.page.getByRole('dialog').getByRole('button', { name: 'Bắt đầu' }).click();
await Promise.all(players.map((p) => p.page.getByTestId('answer-input').waitFor()));
const round = db.prepare('SELECT r.id, r.started_at FROM rounds r JOIN rooms m ON m.id = r.room_id WHERE m.code = ?').get(code);
const at = (ms) => sleep(Math.max(0, round.started_at + ms - Date.now()));
const teamToken = (p) => p.page.evaluate(() => sessionStorage.getItem('hc.team.token'));
const fetchMedia = (p, assetId, token) =>
  p.page.evaluate(
    async ([rid, aid, tok]) => {
      const r = await fetch(`/api/rounds/${rid}/media/${aid}`, { headers: { authorization: `Bearer ${tok}` }, cache: 'no-store' });
      return { status: r.status, type: r.headers.get('content-type') };
    },
    [round.id, assetId, token],
  );

// ---- scene 1: image
await at(4_000);
const img = await players[0].page.evaluate(() => {
  const el = document.querySelector('.scene-in .scene-img');
  return el ? { w: el.naturalWidth, src: el.getAttribute('src') } : null;
});
check('scene 1 image loaded from an authenticated blob URL', !!img && img.w > 0 && img.src.startsWith('blob:'), JSON.stringify(img));
await shot(players[0], 's01-image');
for (const p of [players[0], admin]) {
  const fits = await p.page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1);
  check(`${p.who}: play screen fits without scrolling (${p.who === 'admin' ? '1920×1080' : '1366×768'})`, fits);
}
const box = await players[0].page.getByTestId('answer-input').boundingBox();
check('answer input fully visible at 1366×768', !!box && box.y + box.height <= 768, box ? `bottom ${Math.round(box.y + box.height)}` : '');

// Unreleased media cannot be fetched (player and admin, valid sessions).
const tok0 = await teamToken(players[0]);
const adminTok = await admin.page.evaluate(() => sessionStorage.getItem('hc.admin.token'));
check('unreleased image refused for a player (403)', (await fetchMedia(players[0], LATE_IMAGE, tok0)).status === 403);
check('unreleased video refused for a player (403)', (await fetchMedia(players[0], VIDEO, tok0)).status === 403);
check('unreleased image refused for the admin (403)', (await fetchMedia(admin, LATE_IMAGE, adminTok)).status === 403);
const allText = async (p) => norm(await p.page.locator('body').innerText());
check('no answer visible on any screen during the montage', (await Promise.all([admin, ...players].map(allText))).every((t) => !t.includes('doimoi')));

// A wrong answer early on.
await players[0].page.getByTestId('answer-input').fill('mở cửa');
await players[0].page.getByTestId('answer-submit').click();
await players[0].page.getByRole('dialog').getByRole('button', { name: 'Gửi' }).click();
await players[0].page.getByTestId('submitted-ack').waitFor();

await at(12_000);
await shot(players[1], 's02-text-card');
await at(21_000);
await shot(players[1], 's03-date');
await at(29_000);
check('scene 4 image released: fetch now allowed (200)', (await fetchMedia(players[0], LATE_IMAGE, tok0)).status === 200);
await shot(players[2], 's04-image');
await shot(admin, 's04-admin');
await at(37_000);
await shot(players[2], 's05-statistic');
check('statistic is labelled as illustrative demo data', (await players[2].page.locator('.scene-demo-badge').count()) === 1);

// ---- scene 6: video
await at(45_000);
const videoState = async (p) =>
  p.page.evaluate(() => {
    const v = document.querySelector('.scene-in video');
    return v ? { t: v.currentTime, paused: v.paused, ready: v.readyState, muted: v.muted, controls: v.controls, src: v.getAttribute('src'), now: Date.now() } : null;
  });
const expectedVideoS = (now) => (now - (round.started_at + 42_000)) / 1000;
for (const p of players.slice(0, 4)) {
  const v = await videoState(p);
  const off = v ? Math.abs(v.t - expectedVideoS(v.now)) : NaN;
  check(`${p.who}: video playing muted, no controls, aligned to server time`, !!v && !v.paused && v.ready >= 2 && v.muted && !v.controls && v.src.startsWith('blob:') && off <= VIDEO_TOLERANCE_S, v ? `pos ${v.t.toFixed(2)}s, off ${off.toFixed(2)}s` : 'no video');
}
await shot(players[3], 's06-video');
await shot(players[4], 's06-video-phone');

// Refresh during the video: progress and position are restored.
await players[1].page.reload();
await players[1].page.locator('.scene-stage[data-scene-id="s6"]').waitFor({ timeout: 8_000 });
await players[1].page.waitForFunction(() => {
  const v = document.querySelector('.scene-in video');
  return v && v.readyState >= 2 && !v.paused;
}, null, { timeout: 8_000 }).catch(() => {});
const after = await videoState(players[1]);
const offAfter = after ? Math.abs(after.t - expectedVideoS(after.now)) : NaN;
check('refresh mid-video restores the current scene and aligned position', !!after && offAfter <= VIDEO_TOLERANCE_S, after ? `pos ${after.t.toFixed(2)}s, off ${offAfter.toFixed(2)}s` : 'no video');
const log1 = await players[1].page.evaluate(() => window.__sceneLog.map((x) => x.id));
check('refreshed player sees only the current scene (no replay of the past, no future)', log1.join(',') === 's6', log1.join(','));

// Correct answer late in the round.
await players[2].page.getByTestId('answer-input').fill('doi moi');
await players[2].page.getByTestId('answer-submit').click();
await players[2].page.getByRole('dialog').getByRole('button', { name: 'Gửi' }).click();
await players[2].page.getByTestId('submitted-ack').waitFor();
check('answer submission still works during the montage', true);
check('no result shown before the deadline', (await players[2].page.getByTestId('my-result').count()) === 0);

// ---- reveal at the server deadline
await Promise.all(players.map((p) => p.page.getByTestId('my-result').waitFor({ timeout: 20_000 })));
const revealedAfter = Date.now() - round.started_at;
check('results only after the 60 s server deadline', revealedAfter >= ROUND_MS - 300, `${revealedAfter} ms`);
check('correct team scored', (await players[2].page.getByTestId('my-result').innerText()).includes('+50'));
check('wrong team scored 0', (await players[0].page.getByTestId('my-result').innerText()).includes('Chưa chính xác'));

// ---- ordering and synchronisation
const logs = await Promise.all(players.map((p) => p.page.evaluate(() => window.__sceneLog)));
const order = TIMELINE.map((s) => s.id).join(',');
for (const [i, log] of logs.entries()) {
  if (i === 1) continue; // refreshed mid-round
  check(`team${i + 1} saw all scenes in order`, log.map((x) => x.id).join(',') === order, log.map((x) => x.id).join(','));
  const kinds = new Set(log.map((x) => x.kind));
  if (i === 0) check('all five media/content scene kinds rendered (placeholder: questions 1-3, 5, 6)', ['image', 'text-card', 'date', 'statistic', 'video'].every((k) => kinds.has(k)), [...kinds].join(','));
}
const synced = [0, 2, 3, 4];
let worstSpread = 0;
let worstLag = 0;
for (const scene of TIMELINE.slice(1)) {
  const times = synced.map((i) => logs[i].find((x) => x.id === scene.id)?.t).filter(Boolean);
  worstSpread = Math.max(worstSpread, Math.max(...times) - Math.min(...times));
  worstLag = Math.max(worstLag, Math.max(...times) - (round.started_at + scene.at));
}
check(`players stay in sync: spread ≤ ${SYNC_SPREAD_MS} ms`, worstSpread <= SYNC_SPREAD_MS, `worst ${worstSpread} ms`);
check(`scenes appear ≤ ${RELEASE_LAG_MS} ms after server release`, worstLag <= RELEASE_LAG_MS && worstLag >= 0, `worst ${worstLag} ms`);

// Expected browser-logged 403s: the 3 deliberate unreleased-media fetches.
const expected403 = errors.filter((e) => /Failed to load resource: .*403/.test(e));
const unexpected = errors.filter((e) => !expected403.includes(e));
check('no console errors or external requests (besides 3 deliberate 403s)', unexpected.length === 0 && expected403.length === 3, unexpected.slice(0, 4).join(' | ') || `${expected403.length} × 403`);

db.close();
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) console.log(serverLog.slice(-1500));
process.exit(failed.length ? 1 : 0);
