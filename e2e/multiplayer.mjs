// Multiplayer browser E2E: one admin + five independent players (separate browser contexts),
// against the real Node server serving the production build (run `npm run build` first).
// Uses the locally installed Google Chrome via playwright-core (no browser download).
//   npm run build && npm run e2e          (SHOTS=dir to save screenshots)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT ?? 4310);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'e2e-admin-password';
const ROUND_MS = 15_000;
const SHOTS = process.env.SHOTS ?? null;
const ANSWER_NORM = 'baocap';

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
const dataDir = mkdtempSync(join(tmpdir(), 'hc-e2e-'));
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ADMIN_PASSWORD: PASSWORD, DB_PATH: join(dataDir, 'e2e.sqlite'), ROUND_DURATION_MS: String(ROUND_MS), STATIC_DIR: 'dist' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
const cleanup = () => {
  server.kill('SIGTERM');
  rmSync(dataDir, { recursive: true, force: true });
};
process.on('exit', cleanup);

for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${BASE}/api/health`)).ok) break;
  } catch {
    /* not up yet */
  }
  if (i > 100) {
    console.error('server did not start\n' + serverLog);
    process.exit(1);
  }
  await sleep(100);
}

// ------------------------------------------------------------------ browsers
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true });
const errors = [];
const frames = []; // { who, at, payload }

async function client(who, viewport = { width: 1366, height: 768 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${who}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${who}: ${m.text()}`));
  page.on('request', (r) => {
    if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) errors.push(`${who}: external request ${r.url()}`);
  });
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push({ who, at: Date.now(), payload: String(f.payload) })));
  return { who, page, context };
}
const shot = async (c, name) => SHOTS && c.page.screenshot({ path: `${SHOTS}/${name}.png` });

// ---- admin: login, create room, rename a team, read PINs
const admin = await client('admin', { width: 1920, height: 1080 });
await admin.page.goto(`${BASE}/admin`);
await admin.page.getByTestId('admin-password').fill('wrong-password');
await admin.page.getByRole('button', { name: 'Đăng nhập' }).click();
check('wrong admin password is rejected', await admin.page.getByRole('alert').waitFor({ timeout: 5000 }).then(() => true, () => false));
await admin.page.getByTestId('admin-password').fill(PASSWORD);
await admin.page.getByRole('button', { name: 'Đăng nhập' }).click();
await admin.page.getByTestId('create-room').click();
const code = (await admin.page.getByTestId('room-code').innerText()).trim();
check('room created with a code', /^[A-Z2-9]{6}$/.test(code), code);
await admin.page.getByTestId('rename-1').click();
await admin.page.getByTestId('rename-input-1').fill('Sao Đỏ');
await admin.page.getByRole('button', { name: 'Lưu' }).click();
await admin.page.getByTestId('team-name-1').filter({ hasText: 'Sao Đỏ' }).waitFor();
check('admin renamed team 1', true);
await admin.page.getByTestId('toggle-pins').click();
const pins = [];
for (let i = 1; i <= 5; i++) pins.push(await admin.page.getByTestId(`pin-${i}`).getAttribute('data-pin'));
check('five distinct PINs', new Set(pins).size === 5 && pins.every((p) => /^\d{6}$/.test(p)));
await admin.page.getByTestId('toggle-pins').click();

// ---- five players join from their own browser contexts
const players = [];
for (let i = 0; i < 5; i++) {
  const p = await client(`team${i + 1}`, i === 4 ? { width: 390, height: 844 } : { width: 1366, height: 768 });
  await p.page.goto(`${BASE}/?room=${code}`);
  if (i === 0) {
    await p.page.getByTestId('join-pin').fill('000000');
    await p.page.getByRole('button', { name: 'Vào phòng' }).click();
    check('wrong PIN is rejected', await p.page.getByRole('alert').waitFor({ timeout: 5000 }).then(() => true, () => false));
  }
  await p.page.getByTestId('join-pin').fill(pins[i]);
  await p.page.getByRole('button', { name: 'Vào phòng' }).click();
  await p.page.getByTestId('ready-button').waitFor();
  await p.page.getByTestId('ready-button').click();
  await p.page.getByText('✓ Đội đã sẵn sàng').waitFor();
  players.push(p);
}
check('team 1 sees its admin-assigned name', (await players[0].page.getByTestId('team-name').innerText()).includes('Sao Đỏ'));
await admin.page.getByText('5/5 đội đã kết nối · 5 đội sẵn sàng').waitFor({ timeout: 5000 });
check('admin sees five connected and ready teams', true);
await shot(admin, 'm01-admin-lobby');
await shot(players[4], 'm02-player-lobby-phone');

// ---- start round 1
await admin.page.getByTestId('start-round').click();
await admin.page.getByRole('dialog').getByRole('button', { name: 'Bắt đầu' }).click();
const startedAt = Date.now();
await Promise.all(players.map((p) => p.page.getByTestId('answer-input').waitFor()));
check('all players see the active question', true);

async function submit(p, text) {
  await p.page.getByTestId('answer-input').fill(text);
  await p.page.getByTestId('answer-submit').click();
  await p.page.getByRole('dialog').getByRole('button', { name: 'Gửi' }).click();
  await p.page.getByTestId('submitted-ack').waitFor();
}
// Different submission times: team3 ✓, team1 ✓, team5 ✗, team2 ✓, team4 does not submit.
const plan = [
  [2, 'bao cap', 1000],
  [0, 'BAO CẤP', 2000],
  [4, 'tem phiếu', 3000],
  [1, 'Bao-Cấp', 4000],
];
for (const [idx, text, at] of plan) {
  await sleep(Math.max(0, startedAt + at - Date.now()));
  await submit(players[idx], text);
}
await admin.page.getByTestId('submitted-count').filter({ hasText: '4/5' }).waitFor({ timeout: 5000 });
check('admin sees 4/5 submitted (no answers shown)', !norm(await admin.page.locator('main').innerText()).includes(ANSWER_NORM));
await shot(admin, 'm03-admin-active');
await shot(players[0], 'm04-player-submitted');

// No early disclosure in any page text (own echo excluded for submitting teams).
for (const p of [admin, players[3], players[4]]) {
  check(`${p.who}: no answer visible during the round`, !norm(await p.page.locator('body').innerText()).includes(ANSWER_NORM));
}
for (const p of players) {
  const text = await p.page.locator('body').innerText();
  check(`${p.who}: no correctness/points shown during the round`, !/Chính xác|Chưa chính xác|\+50|\+40|\+30/.test(text));
}

// Refresh a submitted player: submission status survives, timer is not restarted.
const timerBefore = Number(await players[0].page.locator('.countdown-number').innerText());
await players[0].page.reload();
await players[0].page.getByTestId('submitted-ack').waitFor();
const timerAfter = Number(await players[0].page.locator('.countdown-number').innerText());
check('refresh keeps the submitted state', (await players[0].page.getByTestId('answer-input').count()) === 0);
check('refresh does not restart the timer', timerAfter <= timerBefore && timerAfter < 60, `${timerBefore} → ${timerAfter}`);

// ---- wait for the server to close the round
await Promise.all(players.map((p) => p.page.getByTestId('my-result').waitFor({ timeout: ROUND_MS + 10_000 })));
const revealedAt = Date.now();
check('results appear only after the server deadline', revealedAt - startedAt >= ROUND_MS - 500, `${revealedAt - startedAt} ms`);

// Network frames received before the reveal must not contain the answer or correctness.
const early = frames.filter((f) => f.at < revealedAt - 1500);
let leaks = 0;
for (const f of early) {
  const m = f.payload.match(/^\d+(\[.*)$/s);
  if (!m) continue;
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    continue;
  }
  if (data[0] !== 'state') continue;
  const view = data[1];
  if (view.room.phase === 'revealed' || view.room.phase === 'finished') continue;
  if (view.role === 'team') view.me.submission = null;
  const json = JSON.stringify(view);
  if (norm(json).includes(ANSWER_NORM) || /"correct"|"points"|"orderRank"|canonicalAnswer/.test(json)) leaks++;
}
check(`no answer or correctness in ${early.length} pre-reveal network frames`, leaks === 0 && early.length > 10, `${leaks} leaks`);

// ---- results
const expected = [
  [2, '+50'],
  [0, '+40'],
  [1, '+30'],
  [4, 'Chưa chính xác'],
  [3, 'Đội chưa nộp'],
];
for (const [idx, text] of expected) {
  const shown = await players[idx].page.getByTestId('my-result').innerText();
  check(`team${idx + 1} result: ${text}`, shown.includes(text), shown.replace(/\s+/g, ' '));
}
const standings = (await admin.page.getByTestId('standings').locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
check(
  'admin leaderboard: Đội 3 50, Sao Đỏ 40, Đội 2 30, others 0',
  standings[0].includes('Đội 3') && standings[0].endsWith('50') && standings[1].includes('Sao Đỏ') && standings[1].endsWith('40') && standings[2].includes('Đội 2') && standings[2].endsWith('30') && standings.slice(3).every((s) => s.endsWith('0')),
  standings.join(' | '),
);
check('canonical answer revealed to players', norm(await players[3].page.locator('.slots').innerText()) === ANSWER_NORM);
await sleep(1200);
await shot(admin, 'm05-admin-revealed');
await shot(players[2], 'm06-player-revealed');
await shot(players[4], 'm07-player-revealed-phone');

// ---- refresh after reveal, then advance
await players[3].page.reload();
await players[3].page.getByTestId('my-result').waitFor();
check('refresh after reveal restores results', true);
await admin.page.getByTestId('advance').click();
await Promise.all(players.map((p) => p.page.getByTestId('waiting-text').filter({ hasText: 'câu 2' }).waitFor({ timeout: 5000 })));
check('admin advanced: players wait for question 2', true);
await shot(players[0], 'm08-player-ready-q2');

// The two deliberate wrong-credential attempts above each log one HTTP 401 in the browser console.
const expected401 = errors.filter((e) => /^(admin|team1): Failed to load resource: .*401/.test(e));
const unexpected = errors.filter((e) => !expected401.includes(e));
check('no console errors or external requests (besides the 2 deliberate 401s)', unexpected.length === 0 && expected401.length === 2, unexpected.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) console.log(serverLog.slice(-2000));
process.exit(failed.length ? 1 : 0);
