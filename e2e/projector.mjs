// Projector (/screen) browser E2E (M2.2). Run `npm run build` first. Uses local Google Chrome.
//  Part A — real 60 s Question 4 montage round: 1 admin + 5 players + 1 projector.
//  Part B — 6 s test rounds on questions 5–6 to reach the final screen with a tie for first place.
// Test seeding: rooms are moved to a later question directly in each test's own temporary database.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { chromium } from 'playwright-core';

const ROOT = new URL('..', import.meta.url).pathname;
const SHOTS = process.env.SHOTS ?? null;
const PASSWORD = 'e2e-projector-password';
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];
const SYNC_SPREAD_MS = 750;

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

const servers = [];
process.on('exit', () => {
  for (const s of servers) {
    s.proc.kill('SIGTERM');
    rmSync(s.dir, { recursive: true, force: true });
  }
});
async function startServer(port, roundMs) {
  const dir = mkdtempSync(join(tmpdir(), 'hc-proj-e2e-'));
  const dbPath = join(dir, 'game.sqlite');
  const proc = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ADMIN_PASSWORD: PASSWORD, DB_PATH: dbPath, ROUND_DURATION_MS: String(roundMs), STATIC_DIR: 'dist' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  servers.push({ proc, dir });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      /* starting */
    }
    if (i > 100) throw new Error('server did not start\n' + log);
    await sleep(100);
  }
  return { base, dbPath, log: () => log };
}

const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const frames = [];
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
async function client(base, who, viewport = { width: 1366, height: 768 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(sceneLogger);
  page.on('pageerror', (e) => errors.push(`${who}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${who}: ${m.text()}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) errors.push(`${who}: external request ${u}`);
  });
  if (who === 'projector') page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push({ at: Date.now(), payload: String(f.payload) })));
  return { who, page, context };
}
const shot = async (c, name) => SHOTS && c.page.screenshot({ path: `${SHOTS}/${name}.png` });
const fits = (p) => p.page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1);
async function checkLayouts(p, label) {
  const bad = [];
  for (const vp of VIEWPORTS) {
    await p.page.setViewportSize(vp);
    await sleep(250);
    if (!(await fits(p))) bad.push(`${vp.width}x${vp.height}`);
  }
  await p.page.setViewportSize(VIEWPORTS[0]);
  check(`projector ${label}: no clipping/scroll at 1920×1080, 1366×768, 1280×720`, bad.length === 0, bad.join(', '));
}
async function adminSetup(base, dbPath, questionIndex) {
  const admin = await client(base, 'admin', { width: 1920, height: 1080 });
  await admin.page.goto(`${base}/admin`);
  await admin.page.getByTestId('admin-password').fill(PASSWORD);
  await admin.page.getByRole('button', { name: 'Đăng nhập' }).click();
  await admin.page.getByTestId('create-room').click();
  const code = (await admin.page.getByTestId('room-code').innerText()).trim();
  const db = new Database(dbPath);
  if (questionIndex > 0) {
    db.prepare("UPDATE rooms SET question_index = ?, phase = 'ready' WHERE code = ?").run(questionIndex, code);
    await admin.page.reload();
    await admin.page.getByTestId('start-round').filter({ hasText: `Bắt đầu câu ${questionIndex + 1}` }).waitFor();
  }
  await admin.page.getByTestId('toggle-pins').click();
  const pins = [];
  for (let i = 1; i <= 5; i++) pins.push(await admin.page.getByTestId(`pin-${i}`).getAttribute('data-pin'));
  await admin.page.getByTestId('toggle-pins').click();
  return { admin, code, db, pins };
}
async function pairProjector(base, admin) {
  await admin.page.getByTestId('projector-create').click();
  const link = await admin.page.getByTestId('projector-link').inputValue();
  const projector = await client(base, 'projector', VIEWPORTS[0]);
  await projector.page.goto(link);
  await projector.page.getByTestId('screen-room-code').waitFor();
  return { link, projector };
}
async function joinPlayer(base, code, pin, who) {
  const p = await client(base, who);
  await p.page.goto(`${base}/?room=${code}`);
  await p.page.getByTestId('join-pin').fill(pin);
  await p.page.getByRole('button', { name: 'Vào phòng' }).click();
  await p.page.getByTestId('ready-button').click();
  return p;
}
async function submit(p, text) {
  await p.page.getByTestId('answer-input').fill(text);
  await p.page.getByTestId('answer-submit').click();
  await p.page.getByRole('dialog').getByRole('button', { name: 'Gửi' }).click();
  await p.page.getByTestId('submitted-ack').waitFor();
}

// ================================================================== Part A
{
  const A = await startServer(4330, 60_000);
  const { admin, code, db, pins } = await adminSetup(A.base, A.dbPath, 3);

  // ---- pairing
  const { link, projector } = await pairProjector(A.base, admin);
  check('pairing link carries the secret only in the URL fragment', /\/screen#pair=[\w-]{40,}$/.test(link));
  check('secret removed from the projector URL after pairing', !(await projector.page.evaluate(() => location.href)).includes('pair='));
  const screenToken = await projector.page.evaluate(() => sessionStorage.getItem('hc.screen.token'));
  check('projector holds its own session token, never displayed', !!screenToken && !(await projector.page.content()).includes(screenToken));
  await admin.page.getByTestId('projector-status').filter({ hasText: 'Đã kết nối' }).waitFor();
  check('admin sees the projector connected', true);
  const reuse = await client(A.base, 'reuse');
  await reuse.page.goto(link);
  await reuse.page.getByTestId('screen-unpaired').waitFor();
  check('pairing link cannot be reused', (await reuse.page.getByTestId('screen-unpaired').innerText()).includes('đã dùng'));
  await reuse.context.close();

  // ---- lobby
  const players = [];
  for (let i = 0; i < 5; i++) players.push(await joinPlayer(A.base, code, pins[i], `team${i + 1}`));
  await projector.page.getByText('Sẵn sàng', { exact: true }).nth(4).waitFor({ timeout: 8_000 });
  const lobbyText = await projector.page.locator('body').innerText();
  check('projector lobby: room code, five teams, waiting message', lobbyText.includes(code) && [1, 2, 3, 4, 5].every((n) => lobbyText.includes(`Đội ${n}`)) && lobbyText.includes('Đang chờ quản trò bắt đầu'));
  const html = await projector.page.content();
  check('no team PIN anywhere in the projector page', pins.every((pin) => !html.includes(pin)));
  await shot(projector, 'p01-lobby-1080p');
  await checkLayouts(projector, 'lobby');

  // ---- fullscreen (needs a real click)
  await projector.page.getByTestId('screen-fullscreen').click();
  const fsOn = await projector.page.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 3_000 }).then(() => true, () => false);
  check('fullscreen button enters fullscreen on click', fsOn, fsOn ? '' : 'not available in this headless browser');
  if (fsOn) {
    await projector.page.getByTestId('screen-fullscreen').click();
    await projector.page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 3_000 }).catch(() => {});
  }

  // ---- round
  await admin.page.getByTestId('start-round').click();
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Bắt đầu' }).click();
  await projector.page.getByTestId('screen-play').waitFor();
  const round = db.prepare('SELECT r.id, r.started_at, r.deadline_at FROM rounds r JOIN rooms m ON m.id = r.room_id WHERE m.code = ?').get(code);
  const at = (ms) => sleep(Math.max(0, round.started_at + ms - Date.now()));
  check('projector shows the same round as the players', (await projector.page.locator('.round-label').innerText()).includes('4'));

  await at(4_000);
  const futureStatus = await projector.page.evaluate(
    async ([rid, tok]) => (await fetch(`/api/rounds/${rid}/media/m3q8v1ze`, { headers: { authorization: `Bearer ${tok}` } })).status,
    [round.id, screenToken],
  );
  check('projector cannot fetch unreleased media (403)', futureStatus === 403);
  const img = await projector.page.evaluate(() => document.querySelector('.scene-in .scene-img')?.naturalWidth ?? 0);
  check('projector renders the released image via its own session', img > 0);
  await shot(projector, 'p02-active-image-1080p');

  await submit(players[0], 'mở cửa'); // wrong
  await at(8_000);
  await submit(players[2], 'Đổi mới'); // correct, 1st
  await at(12_000);
  await shot(projector, 'p03-active-text-1080p');
  await checkLayouts(projector, 'active round');
  await at(21_000);
  await shot(projector, 'p04-active-date-1080p');
  await at(30_000);
  await submit(players[1], 'doi moi'); // correct, 2nd
  const priv = norm(await projector.page.locator('body').innerText());
  check('answers stay private on the projector during the round', !priv.includes('doimoi') && !priv.includes('mocua'));
  check('projector shows neutral submission status only', (await projector.page.getByTestId('screen-submitted').innerText()).includes('3/5') && !/Đúng|Sai|\+\d0/.test(await projector.page.locator('main').innerText()));
  const perTeam = await projector.page.evaluate(() => ({
    chips: document.querySelectorAll('.screen-team-status .chip').length,
    text: document.querySelector('.screen-team-status')?.textContent ?? '',
  }));
  check('projector shows only the aggregate count, no per-team submission status', perTeam.chips === 0 && !/nộp|suy nghĩ/i.test(perTeam.text), JSON.stringify(perTeam));
  const adminChips = await admin.page.locator('.mp-team-status .chip-gold').allInnerTexts();
  check('admin still sees per-team submission status', adminChips.length === 3 && adminChips.every((x) => /đã nộp/i.test(x)), adminChips.join(','));
  await at(37_000);
  await shot(projector, 'p05-active-statistic-1080p');

  // Projector refresh mid-round (keep its scene log from before the reload for the sync check).
  const projectorLogBefore = await projector.page.evaluate(() => window.__sceneLog);
  await projector.page.reload();
  await projector.page.getByTestId('screen-play').waitFor();
  const restored = await projector.page.locator('.scene-stage[data-scene-id="s5"]').waitFor({ timeout: 8_000 }).then(() => true, () => false);
  check('projector refresh restores the active round and current scene', restored);

  await at(46_000);
  const v1 = await projector.page.evaluate(() => {
    const v = document.querySelector('.scene-in video');
    return v ? { t: v.currentTime, muted: v.muted, paused: v.paused, now: Date.now() } : null;
  });
  const off = v1 ? Math.abs(v1.t - (v1.now - (round.started_at + 42_000)) / 1000) : NaN;
  check('projector video plays muted by default, aligned to the server timeline', !!v1 && v1.muted && !v1.paused && off <= 0.75, v1 ? `off ${off.toFixed(2)} s` : 'no video');
  await projector.page.getByTestId('screen-audio').click();
  await sleep(300);
  const unmuted = await projector.page.evaluate(() => document.querySelector('.scene-in video')?.muted === false);
  check('audio is enabled only after an explicit click', unmuted && (await projector.page.getByTestId('screen-audio').getAttribute('aria-pressed')) === 'true');
  const playersMuted = await Promise.all(players.slice(0, 4).map((p) => p.page.evaluate(() => document.querySelector('.scene-in video')?.muted ?? true)));
  check('player devices stay muted', playersMuted.every(Boolean));
  await shot(projector, 'p06-active-video-1080p');
  await submit(players[4], 'ĐỔI MỚI'); // correct, 3rd

  // ---- reveal
  await projector.page.getByTestId('screen-reveal').waitFor({ timeout: 20_000 });
  const revealedAt = Date.now();
  check('projector reveals only after the 60 s server deadline', revealedAt >= round.deadline_at - 300, `${revealedAt - round.started_at} ms`);
  await sleep(1_500);
  const revealText = await projector.page.locator('main').innerText();
  check('projector reveal shows the canonical answer', norm(await projector.page.locator('.slots').innerText()) === 'doimoi');
  const lb = (await projector.page.locator('.lb-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  check(
    'projector leaderboard: Đội 3 50, Đội 2 40, Đội 5 30, Đội 1 0, Đội 4 0',
    lb.some((r) => r.includes('Đội 3') && r.endsWith('50')) && lb.some((r) => r.includes('Đội 2') && r.endsWith('40')) && lb.some((r) => r.includes('Đội 5') && r.endsWith('30')),
    lb.join(' | '),
  );
  check('projector reveal lists correct/incorrect and points for all teams', ['Đúng', 'Sai', 'Không nộp', '+50', '+40', '+30'].every((x) => revealText.includes(x)));
  await shot(projector, 'p07-reveal-1080p');
  await checkLayouts(projector, 'reveal');

  // Pre-reveal network frames to the projector: screen role only, no PINs, no answers.
  const early = frames.filter((f) => f.at < revealedAt - 1_500);
  let bad = 0;
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
    const json = JSON.stringify(data[1]);
    if (data[1].role !== 'screen' || pins.some((p) => json.includes(p)) || norm(json).includes('doimoi') || /"correct"|"points"|"answer"|canonicalAnswer/.test(json)) bad++;
  }
  check(`projector received only safe ScreenView frames before the reveal (${early.length} frames)`, bad === 0 && early.length > 5, `${bad} bad`);

  // ---- synchronisation (scene changes seen by projector vs players)
  const playerLogs = await Promise.all(players.map((p) => p.page.evaluate(() => window.__sceneLog)));
  const logs = [projectorLogBefore, ...playerLogs];
  let spread = 0;
  let compared = 0;
  for (const id of ['s2', 's3', 's4']) {
    const times = logs.map((l) => l.find((x) => x.id === id)?.t);
    if (times.some((x) => !x)) continue;
    compared++;
    spread = Math.max(spread, Math.max(...times) - Math.min(...times));
  }
  check(`projector and 5 players change scenes together (≤ ${SYNC_SPREAD_MS} ms)`, compared === 3 && spread <= SYNC_SPREAD_MS, `${compared} scenes compared, worst ${spread} ms`);

  // ---- revoke
  await admin.page.getByTestId('projector-revoke').click();
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Thu hồi' }).click();
  await projector.page.getByTestId('screen-unpaired').waitFor({ timeout: 8_000 });
  check('revoking access disconnects the projector', (await projector.page.getByTestId('screen-unpaired').innerText()).includes('thu hồi'));
  await admin.page.getByTestId('projector-status').filter({ hasText: 'Chưa kết nối' }).waitFor();
  check('admin sees the projector disconnected', true);
  db.close();
  for (const c of [admin, projector, ...players]) await c.context.close();
}

// ================================================================== Part B: final with a tie
{
  const B = await startServer(4331, 6_000);
  const { admin, code, db, pins } = await adminSetup(B.base, B.dbPath, 4);
  const { projector } = await pairProjector(B.base, admin);
  const t1 = await joinPlayer(B.base, code, pins[0], 'teamB1');
  const t2 = await joinPlayer(B.base, code, pins[1], 'teamB2');
  const startRound = async () => {
    await admin.page.getByTestId('start-round').click();
    await admin.page.getByRole('dialog').getByRole('button', { name: 'Bắt đầu' }).click();
    await t1.page.getByTestId('answer-input').waitFor();
    await t2.page.getByTestId('answer-input').waitFor();
  };
  await startRound(); // Q5 (WTO): team 1 first (50), team 2 second (40)
  await submit(t1, 'wto');
  await submit(t2, 'W.T.O');
  await projector.page.getByTestId('screen-reveal').waitFor({ timeout: 15_000 });
  await admin.page.getByTestId('advance').click();
  await startRound(); // Q6: team 2 first (50), team 1 second (40) → 90 : 90
  await submit(t2, 'phat trien ben vung');
  await submit(t1, 'Phát triển bền vững');
  await projector.page.getByTestId('screen-reveal').waitFor({ timeout: 15_000 });
  await admin.page.getByTestId('advance').click();
  await projector.page.getByTestId('screen-final').waitFor();
  await sleep(1_500);
  const title = await projector.page.getByTestId('screen-final-title').innerText();
  check('final screen shows a tie as a tie (no invented winner)', title.includes('Đồng hạng nhất') && title.includes('Đội 1') && title.includes('Đội 2'), title);
  const podiumRanks = await projector.page.locator('.podium-rank').allInnerTexts();
  check('podium: only the two positive-score teams, tied at rank 1', podiumRanks.slice().sort().join(',') === '1,1', podiumRanks.join(','));
  const rest = (await projector.page.getByTestId('final-rest').locator('li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
  check('zero-point teams stay in the full leaderboard, not on the podium', rest.length === 3 && rest.every((x) => x.endsWith(' 0')) && ['Đội 3', 'Đội 4', 'Đội 5'].every((n) => rest.some((x) => x.includes(n))), rest.join(' | '));
  const heights = await projector.page.locator('.podium-col.place-1 .podium-block').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  check('tied first-place teams stand at the same podium height', heights.length === 2 && heights[0] === heights[1], heights.join(','));
  await shot(projector, 'p08-final-tie-1080p');
  await checkLayouts(projector, 'final');

  // ---- Part C: a game where nobody scores → neutral final result, nobody on the podium.
  await admin.page.getByRole('button', { name: 'Chọn phòng khác' }).click();
  await admin.page.getByTestId('create-room').click();
  const code2 = (await admin.page.getByTestId('room-code').innerText()).trim();
  db.prepare("UPDATE rooms SET question_index = 5, phase = 'ready' WHERE code = ?").run(code2);
  await admin.page.reload();
  await admin.page.getByTestId('start-round').filter({ hasText: 'Bắt đầu câu 6' }).waitFor();
  await admin.page.getByTestId('projector-create').click();
  await projector.page.goto(await admin.page.getByTestId('projector-link').inputValue());
  await projector.page.getByTestId('screen-room-code').filter({ hasText: code2 }).waitFor();
  await admin.page.getByTestId('start-round').click();
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Bắt đầu' }).click();
  await projector.page.getByTestId('screen-reveal').waitFor({ timeout: 15_000 });
  await admin.page.getByTestId('advance').click();
  await projector.page.getByTestId('screen-final').waitFor();
  await sleep(800);
  const neutralTitle = await projector.page.getByTestId('screen-final-title').innerText();
  check('all-zero game: neutral result, no winner declared', neutralTitle.includes('Chưa có đội nào ghi điểm') && (await projector.page.getByTestId('podium-empty').count()) === 1 && (await projector.page.locator('.podium-col').count()) === 0, neutralTitle);
  check('all-zero game: no celebration', (await projector.page.locator('.confetti').count()) === 0);
  check('all-zero game: all five teams listed with 0', (await projector.page.getByTestId('final-rest').locator('li').count()) === 5);
  await shot(projector, 'p09-final-all-zero-1080p');
  await checkLayouts(projector, 'all-zero final');
  db.close();
  for (const c of [admin, projector, t1, t2]) await c.context.close();
}

// Expected console noise: 1 deliberate 403 (unreleased media) and the 401 of the reused pairing link.
const expected = errors.filter((e) => /^projector: Failed to load resource: .*403/.test(e) || /^reuse: Failed to load resource: .*401/.test(e));
const unexpected = errors.filter((e) => !expected.includes(e));
check('no unexpected console errors or external requests', unexpected.length === 0, unexpected.slice(0, 5).join(' | ') || `${expected.length} expected`);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
