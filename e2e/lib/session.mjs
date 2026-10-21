// Shared helpers for browser E2E scripts (M3.3-A): server process, admin login, room seeding,
// team join, projector pairing. Each server uses its own temporary database.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

export const ROOT = new URL('../..', import.meta.url).pathname;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = new Set();
const dirs = new Set();
process.on('exit', () => {
  for (const p of procs) p.kill('SIGKILL');
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Starts the built server (dist/) on `port`. Reuse `dbPath` to simulate a restart. */
export async function startServer({ port, password, roundMs = 40_000, dbPath = null }) {
  let dir = null;
  if (!dbPath) {
    dir = mkdtempSync(join(tmpdir(), 'hc-e2e-'));
    dirs.add(dir);
    dbPath = join(dir, 'game.sqlite');
  }
  const proc = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ADMIN_PASSWORD: password, DB_PATH: dbPath, ROUND_DURATION_MS: String(roundMs), STATIC_DIR: 'dist' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  procs.add(proc);
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      /* starting */
    }
    if (i > 150) throw new Error(`server did not start\n${log}`);
    await sleep(100);
  }
  const stop = async (signal = 'SIGTERM') => {
    if (proc.exitCode === null && proc.signalCode === null) {
      proc.kill(signal);
      await new Promise((r) => proc.once('exit', r));
    }
    procs.delete(proc);
  };
  /** Hard crash (no graceful shutdown), as a power cut or killed process would do. */
  const crash = () => stop('SIGKILL');
  return { base, port, dbPath, proc, stop, crash, log: () => log };
}

/** Logs the admin in and creates a room; optionally moves it to question `questionIndex` (0-based). */
export async function adminRoom(admin, base, password, dbPath, questionIndex = 0) {
  await admin.goto(`${base}/admin`);
  await admin.getByTestId('admin-password').fill(password);
  await admin.getByRole('button', { name: 'Đăng nhập' }).click();
  await admin.getByTestId('create-room').click();
  const code = (await admin.getByTestId('room-code').innerText()).trim();
  if (questionIndex > 0) {
    const db = new Database(dbPath);
    db.prepare("UPDATE rooms SET question_index = ?, phase = 'ready' WHERE code = ?").run(questionIndex, code);
    db.close();
    await admin.reload();
  }
  await admin.getByTestId('start-round').filter({ hasText: `Bắt đầu câu ${questionIndex + 1}` }).waitFor();
  await admin.getByTestId('toggle-pins').click();
  const pins = [];
  for (let i = 1; i <= 5; i++) pins.push(await admin.getByTestId(`pin-${i}`).getAttribute('data-pin'));
  return { code, pins };
}

export async function joinTeam(page, base, code, pin) {
  await page.goto(`${base}/?room=${code}`);
  await page.getByTestId('join-pin').fill(pin);
  await page.getByRole('button', { name: 'Vào phòng' }).click();
  await page.getByTestId('ready-button').click();
}

export async function pairProjector(admin, page) {
  await admin.getByTestId('projector-create').click();
  const link = await admin.getByTestId('projector-link').inputValue();
  await page.goto(link);
  await page.getByTestId('screen-room-code').waitFor();
}

export async function startRound(admin) {
  await admin.getByTestId('start-round').click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Bắt đầu' }).click();
}

/** Server start time of the room's current round (from the test's own database). */
export function roundStart(dbPath, code) {
  const db = new Database(dbPath, { readonly: true });
  const r = db.prepare('SELECT r.id, r.started_at FROM rounds r JOIN rooms m ON m.id = r.room_id WHERE m.code = ? ORDER BY r.started_at DESC LIMIT 1').get(code);
  db.close();
  return r;
}
