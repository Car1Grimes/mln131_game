// Real server-process restart E2E (M2.3). Run `npm run build` first. Uses local Google Chrome.
//  Scenario 1: SIGKILL the server mid-round (Q4 production montage, 60 s), restart on the same SQLite file;
//              admin, five teams and the projector reconnect by themselves.
//  Scenario 2: the deadline passes while the server is down; the restarted server closes the
//              overdue round exactly once (a further restart changes nothing).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { chromium } from 'playwright-core';

const ROOT = new URL('..', import.meta.url).pathname;
const PASSWORD = 'e2e-restart-password';
const SHOTS = process.env.SHOTS ?? null;
if (!existsSync(join(ROOT, 'dist/index.html'))) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}
const results = [];
const metrics = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ restartable server
const tempDirs = [];
const procs = new Set();
process.on('exit', () => {
  for (const p of procs) p.kill('SIGKILL');
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
});
function serverControl(port, roundMs) {
  const dir = mkdtempSync(join(tmpdir(), 'hc-restart-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'game.sqlite');
  const base = `http://127.0.0.1:${port}`;
  let proc = null;
  let log = '';
  return {
    base,
    dbPath,
    log: () => log,
    async start() {
      // One process (no tsx wrapper process), so SIGKILL really kills the server.
      proc = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ADMIN_PASSWORD: PASSWORD, DB_PATH: dbPath, ROUND_DURATION_MS: String(roundMs), STATIC_DIR: 'dist' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      procs.add(proc);
      proc.stdout.on('data', (d) => (log += d));
      proc.stderr.on('data', (d) => (log += d));
      for (let i = 0; ; i++) {
        try {
          if ((await fetch(`${base}/api/health`)).ok) return Date.now();
        } catch {
          /* starting */
        }
        if (i > 150) throw new Error('server did not start\n' + log);
        await sleep(50);
      }
    },
    /** Abrupt crash: no graceful shutdown, no final writes. */
    async kill() {
      const p = proc;
      procs.delete(p);
      p.kill('SIGKILL');
      await new Promise((r) => p.once('exit', r));
    },
  };
}

const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function client(base, who, viewport = { width: 1366, height: 768 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${who}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${who}: ${m.text()}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) errors.push(`${who}: external request ${u}`);
  });
  return { who, page, context };
}
async function setupRoom(srv, questionIndex) {
  const admin = await client(srv.base, 'admin', { width: 1920, height: 1080 });
  await admin.page.goto(`${srv.base}/admin`);
  await admin.page.getByTestId('admin-password').fill(PASSWORD);
  await admin.page.getByRole('button', { name: 'Đăng nhập' }).click();
  await admin.page.getByTestId('create-room').click();
  const code = (await admin.page.getByTestId('room-code').innerText()).trim();
  const db = new Database(srv.dbPath);
  db.prepare("UPDATE rooms SET question_index = ?, phase = 'ready' WHERE code = ?").run(questionIndex, code);
  db.close();
  await admin.page.reload();
  await admin.page.getByTestId('start-round').waitFor();
  await admin.page.getByTestId('toggle-pins').click();
  const pins = [];
  for (let i = 1; i <= 5; i++) pins.push(await admin.page.getByTestId(`pin-${i}`).getAttribute('data-pin'));
  await admin.page.getByTestId('toggle-pins').click();
  await admin.page.getByTestId('projector-create').click();
  const projector = await client(srv.base, 'projector', { width: 1920, height: 1080 });
  await projector.page.goto(await admin.page.getByTestId('projector-link').inputValue());
  await projector.page.getByTestId('screen-room-code').waitFor();
  const players = [];
  for (let i = 0; i < 5; i++) {
    const p = await client(srv.base, `team${i + 1}`);
    await p.page.goto(`${srv.base}/?room=${code}`);
    await p.page.getByTestId('join-pin').fill(pins[i]);
    await p.page.getByRole('button', { name: 'Vào phòng' }).click();
    await p.page.getByTestId('ready-button').click();
    players.push(p);
  }
  await admin.page.getByText('5/5 đội đã kết nối').waitFor();
  return { admin, projector, players, code };
}
async function startRound(admin) {
  await admin.page.getByTestId('start-round').click();
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Bắt đầu' }).click();
}
async function submit(p, text) {
  await p.page.getByTestId('answer-input').fill(text);
  await p.page.getByTestId('answer-submit').click();
  await p.page.getByRole('dialog').getByRole('button', { name: 'Gửi' }).click();
  await p.page.getByTestId('submitted-ack').waitFor();
}
const dbRead = (path, fn) => {
  const db = new Database(path, { readonly: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
};
const roundOf = (path, code) =>
  dbRead(path, (db) => db.prepare('SELECT r.* FROM rounds r JOIN rooms m ON m.id = r.room_id WHERE m.code = ? ORDER BY r.started_at DESC').get(code));
const subsOf = (path, roundId) => dbRead(path, (db) => db.prepare('SELECT team_id, client_submission_id, answer, received_at, seq, is_correct, order_rank, points FROM submissions WHERE round_id = ? ORDER BY seq').all(roundId));
const connected = (p) => p.page.locator('.conn-connected').count();

// ================================================================== Scenario 1
{
  const srv = serverControl(4340, 60_000);
  await srv.start();
  const { admin, projector, players, code } = await setupRoom(srv, 3);
  const teamsBefore = dbRead(srv.dbPath, (db) => db.prepare('SELECT id, slot, name FROM teams ORDER BY slot').all());
  await startRound(admin);
  await Promise.all(players.map((p) => p.page.getByTestId('answer-input').waitFor()));
  const before = roundOf(srv.dbPath, code);
  const at = (ms) => sleep(Math.max(0, before.started_at + ms - Date.now()));

  await at(9_500);
  await submit(players[2], 'đổi mới'); // correct
  await submit(players[0], 'mở cửa'); // wrong
  const subsBefore = subsOf(srv.dbPath, before.id);
  await at(14_000);

  await srv.kill();
  const killedAt = Date.now();
  await players[3].page.locator('.conn-reconnecting').waitFor({ timeout: 10_000 });
  check('clients notice the server is gone (reconnecting state)', true);
  await at(18_500);
  const restartedAt = await srv.start();

  // Every client reconnects by itself (Socket.IO backoff) and restores the authoritative state.
  const recovery = [];
  for (const c of [admin, projector, ...players]) {
    const t0 = Date.now();
    await c.page.locator('.conn-connected').waitFor({ timeout: 15_000 });
    if (c !== admin) await c.page.locator('.scene-stage[data-scene-id]:not([data-scene-id=""])').waitFor({ timeout: 10_000 });
    recovery.push({ who: c.who, ms: Date.now() - restartedAt, waited: Date.now() - t0 });
  }
  metrics.push({ metric: 'reconnect recovery after restart (ms from server ready to view restored)', samples: recovery.map((r) => r.ms) });
  check('all 7 clients reconnected on their own after the restart', recovery.length === 7, `downtime ${restartedAt - killedAt} ms; recovery ${Math.min(...recovery.map((r) => r.ms))}–${Math.max(...recovery.map((r) => r.ms))} ms`);

  const after = roundOf(srv.dbPath, code);
  check('same round id after restart', after.id === before.id);
  check('original startedAt and deadlineAt kept', after.started_at === before.started_at && after.deadline_at === before.deadline_at, `deadline ${after.deadline_at - after.started_at} ms after start`);
  check('round still open after restart', after.closed_at === null);
  check('submissions preserved byte-for-byte', JSON.stringify(subsOf(srv.dbPath, before.id)) === JSON.stringify(subsBefore), `${subsBefore.length} rows`);
  const teamsAfter = dbRead(srv.dbPath, (db) => db.prepare('SELECT id, slot, name FROM teams ORDER BY slot').all());
  check('same room and team identities', JSON.stringify(teamsAfter) === JSON.stringify(teamsBefore));
  await at(20_000);
  // Q4 production timeline (media/q4/manifest.json): the scene shown must be the one released for
  // the current server time — no reset to the first scene, no future scene.
  const Q4_SCENES = [['b1', 0], ['b2', 5_000], ['b3', 11_000], ['b4', 16_000], ['b5', 23_000], ['b6', 28_000]];
  const expectedAt = (ms) => Q4_SCENES.filter(([, a]) => a <= ms).pop()[0];
  const readAt = Date.now() - before.started_at;
  const sceneIds = await Promise.all([projector, ...players].map((p) => p.page.locator('.scene-stage').getAttribute('data-scene-id')));
  const okIds = new Set([expectedAt(readAt), expectedAt(Date.now() - before.started_at)]);
  check(`correct released scene after reconnect (${[...okIds].join('/')} at ${(readAt / 1000).toFixed(1)} s), no timeline reset`, sceneIds.every((id) => okIds.has(id)), sceneIds.join(','));
  check('submitted teams still shown as submitted', (await players[2].page.getByTestId('submitted-ack').count()) === 1 && (await players[0].page.getByTestId('submitted-ack').count()) === 1);
  check('projector session still valid (still paired)', (await projector.page.getByTestId('screen-unpaired').count()) === 0 && (await projector.page.getByTestId('screen-play').count()) === 1);
  check('no premature reveal after restart', (await Promise.all(players.map((p) => p.page.getByTestId('my-result').count()))).every((n) => n === 0));
  if (SHOTS) await projector.page.screenshot({ path: `${SHOTS}/r01-projector-after-restart.png` });

  await at(30_000);
  await submit(players[4], 'ĐỔI MỚI'); // correct, after the restart
  await Promise.all(players.map((p) => p.page.getByTestId('my-result').waitFor({ timeout: 45_000 })));
  const revealDelay = Date.now() - before.deadline_at;
  check('results appear at the original deadline', revealDelay >= -300 && revealDelay < 2_000, `${revealDelay} ms after the original deadline`);
  const final = subsOf(srv.dbPath, before.id);
  const pts = Object.fromEntries(final.map((s) => [s.team_id, s.points]));
  const t = Object.fromEntries(teamsAfter.map((x) => [x.slot, x.id]));
  check('scores: team3 50, team5 40, team1 0 — no extra or duplicate scoring', pts[t[3]] === 50 && pts[t[5]] === 40 && pts[t[1]] === 0 && final.length === 3, JSON.stringify(final.map((s) => [s.answer, s.points])));
  for (const c of [admin, projector, ...players]) await c.context.close();
  await srv.kill();
}

// ================================================================== Scenario 2
{
  const srv = serverControl(4341, 8_000);
  await srv.start();
  const { admin, projector, players, code } = await setupRoom(srv, 5);
  await startRound(admin);
  await Promise.all(players.map((p) => p.page.getByTestId('answer-input').waitFor()));
  const r = roundOf(srv.dbPath, code);
  await submit(players[0], 'phat trien ben vung');
  await submit(players[1], 'Phát triển bền vững');
  await sleep(Math.max(0, r.started_at + 3_000 - Date.now()));
  await srv.kill(); // the old process can never publish these results
  await sleep(Math.max(0, r.deadline_at + 4_000 - Date.now())); // deadline passes while down
  check('round still open in the database while the server is down past the deadline', roundOf(srv.dbPath, code).closed_at === null);
  await srv.start();
  const closed = roundOf(srv.dbPath, code);
  check('restarted server closes the overdue round', closed.closed_at !== null && closed.closed_at >= closed.deadline_at, `closed ${closed.closed_at - closed.deadline_at} ms after deadline`);
  const subs1 = subsOf(srv.dbPath, r.id);
  check('overdue round scored once: 50 / 40', JSON.stringify(subs1.map((s) => s.points)) === '[50,40]');
  await Promise.all(players.map((p) => p.page.getByTestId('my-result').waitFor({ timeout: 20_000 })));
  check('reconnected clients receive the reveal', true);
  await projector.page.getByTestId('screen-reveal').waitFor({ timeout: 20_000 });
  check('projector receives the reveal', true);
  await srv.kill();
  await srv.start(); // another restart must not close or score again
  const again = roundOf(srv.dbPath, code);
  check('a further restart changes nothing (exactly once)', again.closed_at === closed.closed_at && JSON.stringify(subsOf(srv.dbPath, r.id)) === JSON.stringify(subs1));
  for (const c of [admin, projector, ...players]) await c.context.close();
  await srv.kill();
}

// Expected noise: failed requests/sockets while the server process was down.
const expected = errors.filter((e) => /ERR_CONNECTION_REFUSED|WebSocket connection to .* failed|Failed to load resource/.test(e));
const unexpected = errors.filter((e) => !expected.includes(e));
check('no unexpected console errors or external requests', unexpected.length === 0, unexpected.slice(0, 4).join(' | ') || `${expected.length} expected while the server was down`);
console.log('\nMETRICS ' + JSON.stringify(metrics));
await browser.close();
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
