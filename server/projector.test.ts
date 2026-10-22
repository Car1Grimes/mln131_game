import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as connectIo, type Socket } from 'socket.io-client';
import type { AdminView, RoomView, ScreenView } from '../shared/protocol';
import { normalizeAnswer } from '../shared/normalize';
import type { Scene } from '../shared/scenes';
import { startApp, type RunningApp } from './app';
import { hashToken } from './auth';
import type { ServerQuestion } from './content/questions';
import { SCHEMA_VERSION, openDb } from './db';
import { MediaRegistry } from './media/registry';
import { timerScheduler } from './engine';
import { fakeTime, startActive } from './test-utils';

const PASSWORD = 'projector-test-password';
const ROUND_MS = 40_000;
const SESSION_TTL = 3 * 60 * 60_000;
const PAIRING_TTL = 2 * 60_000;

let mediaDir: string;
let registry: MediaRegistry;
const TIMELINE: Scene[] = [
  { id: 'a', kind: 'image', at: 0, media: { assetId: 'img-first' } },
  { id: 'b', kind: 'text-card', at: 10_000, body: 'Gợi ý thứ hai' },
  { id: 'c', kind: 'image', at: 20_000, media: { assetId: 'img-later' } },
];
const QUESTIONS: ServerQuestion[] = [
  { id: 'p1', answer: 'BAO CẤP', scenes: TIMELINE },
  { id: 'p2', answer: 'WTO', scenes: [{ id: 'z', kind: 'text-card', at: 0, body: 'Câu cuối' }] },
];

let app: RunningApp;
let t: ReturnType<typeof fakeTime>;
let sockets: Socket[] = [];

beforeEach(async () => {
  mediaDir = mkdtempSync(join(tmpdir(), 'hc-proj-media-'));
  mkdirSync(join(mediaDir, 'clues'));
  writeFileSync(join(mediaDir, 'clues/a.webp'), 'first-image');
  writeFileSync(join(mediaDir, 'clues/b.webp'), 'later-image');
  registry = new MediaRegistry(
    [
      { id: 'img-first', kind: 'image', file: 'clues/a.webp', mime: 'image/webp' },
      { id: 'img-later', kind: 'image', file: 'clues/b.webp', mime: 'image/webp' },
    ],
    mediaDir,
  );
});
afterEach(async () => {
  sockets.forEach((s) => s.disconnect());
  sockets = [];
  await app?.close();
  rmSync(mediaDir, { recursive: true, force: true });
});

async function boot(dbPath = ':memory:') {
  t = fakeTime();
  app = await startApp({
    dbPath,
    adminPassword: PASSWORD,
    roundDurationMs: ROUND_MS,
    questions: QUESTIONS,
    clock: t.clock,
    scheduler: t.scheduler,
    media: registry,
    staticDir: null,
    screenSessionTtlMs: SESSION_TTL,
    screenPairingTtlMs: PAIRING_TTL,
  });
}

const call = async (method: string, path: string, body?: unknown, token?: string) => {
  const res = await fetch(app.url + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
};

async function setup() {
  const admin = (await call('POST', '/api/admin/login', { password: PASSWORD })).body.token as string;
  const code = (await call('POST', '/api/admin/rooms', {}, admin)).body.code as string;
  const roomId = app.db.roomByCode(code)!.id;
  const pins = app.engine.teams(roomId).map((x) => x.pin);
  const team = (await call('POST', '/api/join', { code, pin: pins[0] })).body.token as string;
  return { admin, code, roomId, pins, team };
}

async function pairScreen(admin: string, code: string) {
  const issued = await call('POST', `/api/admin/rooms/${code}/screen-pairing`, {}, admin);
  expect(issued.status).toBe(201);
  const paired = await call('POST', '/api/screen/pair', { secret: issued.body.secret });
  expect(paired.status).toBe(200);
  return { secret: issued.body.secret as string, token: paired.body.token as string, expiresAt: paired.body.expiresAt as number };
}

type Client = Socket & { states: RoomView[]; latest: () => RoomView };
async function connect(auth: Record<string, string>): Promise<Client> {
  const s = connectIo(app.url, { auth, transports: ['websocket'], forceNew: true, reconnection: false }) as Client;
  s.states = [];
  s.latest = () => s.states[s.states.length - 1]!;
  s.on('state', (v: RoomView) => s.states.push(v));
  sockets.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once('state', () => resolve());
    s.once('connect_error', reject);
  });
  return s;
}
const emit = (s: Socket, event: string, payload: unknown) =>
  new Promise<{ ok: boolean; error?: string }>((resolve) => s.emit(event, payload, resolve));
const settle = () => new Promise((r) => setTimeout(r, 60));

// ------------------------------------------------------------------ pairing
describe('projector pairing', () => {
  it('only an admin can issue a pairing link', async () => {
    await boot();
    const { code, team, admin } = await setup();
    expect((await call('POST', `/api/admin/rooms/${code}/screen-pairing`, {})).status).toBe(401);
    expect((await call('POST', `/api/admin/rooms/${code}/screen-pairing`, {}, team)).status).toBe(401);
    const { token: screen } = await pairScreen(admin, code);
    expect((await call('POST', `/api/admin/rooms/${code}/screen-pairing`, {}, screen)).status).toBe(401);
    expect((await call('POST', `/api/admin/rooms/NOPE99/screen-pairing`, {}, admin)).status).toBe(404);
  });

  it('the secret is single-use, high-entropy, and stored only as a hash', async () => {
    await boot();
    const { admin, code } = await setup();
    const { secret, token } = await pairScreen(admin, code);
    expect(secret.length).toBeGreaterThanOrEqual(43); // 32 random bytes, base64url
    expect((await call('POST', '/api/screen/pair', { secret })).status).toBe(401); // second use
    const raw = app.db.raw;
    expect(raw.prepare('SELECT COUNT(*) n FROM screen_pairings WHERE secret_hash = ?').get(secret)).toEqual({ n: 0 });
    expect(raw.prepare('SELECT COUNT(*) n FROM screen_pairings WHERE secret_hash = ?').get(hashToken(secret))).toEqual({ n: 1 });
    expect(raw.prepare('SELECT COUNT(*) n FROM sessions WHERE token_hash = ?').get(token)).toEqual({ n: 0 });
    const session = raw.prepare("SELECT role, team_id, expires_at FROM sessions WHERE token_hash = ?").get(hashToken(token));
    expect(session).toEqual({ role: 'screen', team_id: null, expires_at: t.now + SESSION_TTL });
  });

  it('expired, unknown and malformed secrets are refused alike', async () => {
    await boot();
    const { admin, code } = await setup();
    const issued = await call('POST', `/api/admin/rooms/${code}/screen-pairing`, {}, admin);
    t.advance(PAIRING_TTL);
    const replies = await Promise.all([
      call('POST', '/api/screen/pair', { secret: issued.body.secret }),
      call('POST', '/api/screen/pair', { secret: 'x'.repeat(43) }),
      call('POST', '/api/screen/pair', { secret: '../../etc' }),
      call('POST', '/api/screen/pair', {}),
    ]);
    expect(replies.map((r) => `${r.status} ${JSON.stringify(r.body)}`)).toEqual(Array(4).fill('401 {"error":"unauthorized"}'));
  });

  it('pairing attempts are rate-limited', async () => {
    await boot();
    for (let i = 0; i < 10; i++) await call('POST', '/api/screen/pair', { secret: 'y'.repeat(43) });
    expect((await call('POST', '/api/screen/pair', { secret: 'y'.repeat(43) })).status).toBe(429);
  });
});

// ------------------------------------------------------------------ authorization
describe('projector authorization', () => {
  it('receives only ScreenView, scoped to its own room (handshake room code ignored)', async () => {
    await boot();
    const a = await setup();
    const b = await setup();
    const { token } = await pairScreen(a.admin, a.code);
    const screen = await connect({ token, roomCode: b.code });
    await settle();
    expect(screen.states.every((v) => v.role === 'screen')).toBe(true);
    expect(screen.latest().room.code).toBe(a.code);
  });

  it('may not perform any admin or team action over Socket.IO', async () => {
    await boot();
    const { admin, code, roomId } = await setup();
    const { token } = await pairScreen(admin, code);
    const screen = await connect({ token });
    const teamId = app.engine.teams(roomId)[0]!.id;
    for (const [event, payload] of [
      ['admin:start', {}],
      ['admin:advance', {}],
      ['admin:rename', { teamId, name: 'Hacked' }],
      ['team:ready', { ready: true }],
      ['team:submit', { roundId: 'any-round-id-1', submissionId: 'screen-submission-1', answer: 'BAO CẤP' }],
    ] as const) {
      expect(await emit(screen, event, payload), event).toMatchObject({ ok: false, error: 'forbidden' });
    }
    expect(app.engine.phaseOf(roomId)).toBe('lobby');
    expect(app.engine.teams(roomId)[0]!.name).toBe('Đội 1');
  });

  it('may not use admin HTTP endpoints', async () => {
    await boot();
    const { admin, code } = await setup();
    const { token } = await pairScreen(admin, code);
    expect((await call('POST', '/api/admin/rooms', {}, token)).status).toBe(401);
    expect((await call('GET', '/api/admin/rooms', undefined, token)).status).toBe(401);
    expect((await call('POST', `/api/admin/rooms/${code}/screen-revoke`, {}, token)).status).toBe(401);
  });

  it('ScreenView never contains PINs, and no answers / correctness / points before the reveal', async () => {
    await boot();
    const { admin, code, roomId, pins } = await setup();
    const { token } = await pairScreen(admin, code);
    const screen = await connect({ token });
    startActive(app.engine, roomId, t);
    const teams = app.engine.teams(roomId);
    t.advance(2_000);
    app.engine.submit(roomId, teams[0]!.id, 'sub-aaaaaaaa', 'BAO CẤP');
    app.engine.submit(roomId, teams[1]!.id, 'sub-bbbbbbbb', 'đáp án bí mật');
    await settle();
    for (const v of screen.states) {
      const json = JSON.stringify(v);
      for (const pin of pins) expect(json).not.toContain(pin);
      expect(json).not.toMatch(/"pin"/);
      expect(normalizeAnswer(json)).not.toContain('baocap');
      expect(json).not.toContain('đáp án bí mật');
      expect(json).not.toMatch(/"correct"|"points"|"orderRank"|canonicalAnswer|"answer"/);
      expect(json).not.toMatch(/"submitted"\s*:/); // no per-team submission status at all
    }
    const active = screen.latest() as ScreenView;
    expect(active.submittedCount).toBe(2); // aggregate only
    for (const team of active.teams) expect(Object.keys(team).sort()).toEqual(['connected', 'id', 'name', 'ready', 'slot']);
  });

  it('the admin still sees each team\'s submission status', async () => {
    await boot();
    const { admin, code, roomId } = await setup();
    const adminSock = await connect({ token: admin, roomCode: code });
    startActive(app.engine, roomId, t);
    app.engine.submit(roomId, app.engine.teams(roomId)[2]!.id, 'sub-cccccccc', 'x');
    await settle();
    const v = adminSock.latest() as AdminView;
    expect(v.teams.map((x) => x.submitted)).toEqual([false, false, true, false, false]);
  });

  it('gets scene releases as they occur, results only after close, and a correct leaderboard', async () => {
    await boot();
    const { admin, code, roomId } = await setup();
    const { token } = await pairScreen(admin, code);
    const screen = await connect({ token });
    const adminSock = await connect({ token: admin, roomCode: code });
    const round = startActive(app.engine, roomId, t);
    const [x, y] = app.engine.teams(roomId);
    const ids = () => (screen.latest() as ScreenView).round?.scenes.map((s) => s.id).join(',');
    await settle();
    expect(ids()).toBe('a');
    t.advanceTo(round.started_at + 10_000);
    await settle();
    expect(ids()).toBe('a,b');
    app.engine.submit(roomId, y!.id, 'sub-yyyyyyyy', 'bao cap');
    t.advance(1_000);
    app.engine.submit(roomId, x!.id, 'sub-xxxxxxxx', 'BAO CẤP');
    t.advanceTo(round.started_at + 20_000);
    await settle();
    expect(ids()).toBe('a,b,c');
    expect((screen.latest() as ScreenView).reveal).toBeNull();
    t.advanceTo(round.deadline_at);
    await settle();
    const v = screen.latest() as ScreenView;
    expect(v.room.phase).toBe('revealed');
    expect(v.reveal!.canonicalAnswer).toBe('BAO CẤP');
    expect(v.reveal!.submissions.filter((s) => s.correct).map((s) => [s.teamId, s.points])).toEqual([
      [y!.id, 50],
      [x!.id, 40],
    ]);
    expect(v.standings.map((s) => [s.teamId, s.score, s.rank]).slice(0, 2)).toEqual([
      [y!.id, 50, 1],
      [x!.id, 40, 2],
    ]);
    expect(v.standings).toEqual((adminSock.latest() as AdminView).standings);
  });

  it('refresh / reconnect restores the same round, deadline and released scenes', async () => {
    await boot();
    const { admin, code, roomId } = await setup();
    const { token } = await pairScreen(admin, code);
    const first = await connect({ token });
    const round = startActive(app.engine, roomId, t);
    t.advanceTo(round.started_at + 12_000);
    await settle();
    first.disconnect();
    const again = await connect({ token });
    const v = again.latest() as ScreenView;
    expect(v.round!.id).toBe(round.id);
    expect(v.round!.deadlineAt).toBe(round.deadline_at);
    expect(v.round!.startedAt).toBe(round.started_at);
    expect(v.round!.scenes.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('admin sees projector connected / disconnected', async () => {
    await boot();
    const { admin, code } = await setup();
    const adminSock = await connect({ token: admin, roomCode: code });
    expect((adminSock.latest() as AdminView).projector).toEqual({ connected: 0, activeSessions: 0 });
    const { token } = await pairScreen(admin, code);
    const screen = await connect({ token });
    await settle();
    expect((adminSock.latest() as AdminView).projector).toEqual({ connected: 1, activeSessions: 1 });
    screen.disconnect();
    await settle();
    expect((adminSock.latest() as AdminView).projector.connected).toBe(0);
  });
});

// ------------------------------------------------------------------ media
describe('projector media access', () => {
  const media = (roundId: string, assetId: string, token: string) =>
    fetch(`${app.url}/api/rounds/${roundId}/media/${assetId}`, { headers: { authorization: `Bearer ${token}` } });

  it('released media of its room only; never future media or other rooms', async () => {
    await boot();
    const a = await setup();
    const b = await setup();
    const { token } = await pairScreen(a.admin, a.code);
    const roundA = startActive(app.engine, a.roomId, t);
    const roundB = startActive(app.engine, b.roomId, t);
    expect((await media(roundA.id, 'img-first', token)).status).toBe(200);
    expect((await media(roundA.id, 'img-later', token)).status).toBe(403); // future scene
    expect((await media(roundB.id, 'img-first', token)).status).toBe(403); // other room
    t.advanceTo(roundA.started_at + 20_000);
    const later = await media(roundA.id, 'img-later', token);
    expect(later.status).toBe(200);
    expect(later.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });

  it('expired projector sessions lose media access', async () => {
    await boot();
    const { admin, code, roomId } = await setup();
    const { token } = await pairScreen(admin, code);
    const round = startActive(app.engine, roomId, t);
    expect((await media(round.id, 'img-first', token)).status).toBe(200);
    t.advance(SESSION_TTL);
    expect((await media(round.id, 'img-first', token)).status).toBe(401);
  });
});

describe('revocation and expiry', () => {
  it('revoking disconnects the projector, invalidates its token and pending links', async () => {
    await boot();
    const { admin, code, roomId } = await setup();
    const { token } = await pairScreen(admin, code);
    const pending = (await call('POST', `/api/admin/rooms/${code}/screen-pairing`, {}, admin)).body.secret as string;
    const screen = await connect({ token });
    const round = startActive(app.engine, roomId, t);
    const gone = new Promise((r) => screen.once('disconnect', r));
    const r = await call('POST', `/api/admin/rooms/${code}/screen-revoke`, {}, admin);
    expect(r.body.revoked).toBe(1);
    await gone;
    await expect(connect({ token })).rejects.toThrow(/unauthorized/);
    expect((await fetch(`${app.url}/api/rounds/${round.id}/media/img-first`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
    expect((await call('POST', '/api/screen/pair', { secret: pending })).status).toBe(401);
    // A fresh link still works after revocation.
    const fresh = await pairScreen(admin, code);
    expect((await connect({ token: fresh.token })).latest().role).toBe('screen');
  });

  it('an expired session is dropped at the next broadcast and cannot reconnect', async () => {
    await boot();
    const { admin, code, roomId } = await setup();
    const { token } = await pairScreen(admin, code);
    const screen = await connect({ token });
    t.advance(SESSION_TTL);
    const gone = new Promise((r) => screen.once('disconnect', r));
    app.engine.setReady(roomId, app.engine.teams(roomId)[0]!.id, true); // any state change broadcasts
    await gone;
    await expect(connect({ token })).rejects.toThrow(/unauthorized/);
  });

  it('an idle projector is disconnected exactly at its expiry, without any room activity', async () => {
    await boot();
    const { admin, code } = await setup();
    const { token, expiresAt } = await pairScreen(admin, code);
    const adminSock = await connect({ token: admin, roomCode: code });
    const screen = await connect({ token });
    let disconnected = false;
    screen.on('disconnect', () => (disconnected = true));
    const statesBefore = adminSock.states.length;
    t.advanceTo(expiresAt - 1);
    await settle();
    expect(disconnected).toBe(false);
    t.advanceTo(expiresAt); // no engine action, no broadcast trigger: only the expiry timer
    await settle();
    expect(disconnected).toBe(true);
    expect((adminSock.latest() as AdminView).projector.connected).toBe(0);
    expect(adminSock.states.length).toBeGreaterThan(statesBefore); // admin told by the disconnect
    await expect(connect({ token })).rejects.toThrow(/unauthorized/);
  });

  it('the expiry timer is cancelled when the projector disconnects first', async () => {
    await boot();
    const { admin, code } = await setup();
    const { token } = await pairScreen(admin, code);
    const before = t.pending();
    const screen = await connect({ token });
    expect(t.pending()).toBe(before + 1);
    screen.disconnect();
    await settle();
    expect(t.pending()).toBe(before);
  });

  it('a revoked projector is not kept alive by its expiry timer', async () => {
    await boot();
    const { admin, code } = await setup();
    const { token } = await pairScreen(admin, code);
    const screen = await connect({ token });
    const gone = new Promise((r) => screen.once('disconnect', r));
    await call('POST', `/api/admin/rooms/${code}/screen-revoke`, {}, admin);
    await gone;
    await settle();
    t.advance(SESSION_TTL); // the cancelled expiry timer must not throw or reconnect anything
    await expect(connect({ token })).rejects.toThrow(/unauthorized/);
  });

  it('admin and team sessions are unaffected (no expiry)', async () => {
    await boot();
    const { admin, code, team } = await setup();
    t.advance(SESSION_TTL * 10);
    expect((await call('GET', '/api/admin/rooms', undefined, admin)).status).toBe(200);
    expect((await connect({ token: team })).latest().role).toBe('team');
    expect((await connect({ token: admin, roomCode: code })).latest().role).toBe('admin');
  });
});

// ------------------------------------------------------------------ migration
describe('database migration from M1', () => {
  const m1Schema = readFileSync(fileURLToPath(new URL('./fixtures/m1-schema.sql', import.meta.url)), 'utf8');

  function makeM1Db(path: string) {
    const db = new Database(path);
    db.exec(m1Schema);
    db.prepare("INSERT INTO rooms VALUES ('room1','ABCDEF','revealed',0,1000)").run();
    for (let i = 1; i <= 5; i++) db.prepare('INSERT INTO teams VALUES (?,?,?,?,?,1)').run(`team${i}`, 'room1', i, `Đội ${i}`, `11111${i}`);
    db.prepare("INSERT INTO rounds VALUES ('round1','room1',0,'main',2000,62000,62000)").run();
    db.prepare("INSERT INTO submissions VALUES ('s1','round1','team2','cid-1','BAO CẤP',3000,1,1,1,50)").run();
    db.prepare("INSERT INTO sessions VALUES (?, 'admin', NULL, NULL, 1000)").run(hashToken('m1-admin-token'));
    db.prepare("INSERT INTO sessions VALUES (?, 'team', 'room1', 'team2', 1000)").run(hashToken('m1-team-token'));
    expect(() => db.prepare("INSERT INTO sessions VALUES ('x', 'screen', 'room1', NULL, 1)").run()).toThrow(/CHECK/);
    expect(db.pragma('user_version', { simple: true })).toBe(0);
    db.close();
  }

  it('upgrades an M1 database in place, keeps all data, and is idempotent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-m1-'));
    const path = join(dir, 'm1.sqlite');
    try {
      makeM1Db(path);
      for (let run = 0; run < 2; run++) {
        const db = openDb(path);
        expect(db.schemaVersion()).toBe(SCHEMA_VERSION);
        expect(db.roomByCode('ABCDEF')?.phase).toBe('revealed');
        expect(db.teamsByRoom('room1')).toHaveLength(5);
        expect(db.submissionsByRound('round1')).toMatchObject([{ team_id: 'team2', answer: 'BAO CẤP', points: 50 }]);
        expect(db.sessionByHash(hashToken('m1-team-token'))).toMatchObject({ role: 'team', team_id: 'team2', expires_at: null, revoked_at: null });
        expect(db.raw.pragma('foreign_key_check')).toEqual([]);
        db.close();
      }
      // Screen sessions are now allowed, with the same integrity rules.
      const db = openDb(path);
      db.insertSession({ token_hash: 'h1', role: 'screen', room_id: 'room1', team_id: null, created_at: 1, expires_at: 99 });
      expect(() => db.insertSession({ token_hash: 'h2', role: 'screen', room_id: 'room1', team_id: null, created_at: 1 })).toThrow(/CHECK/);
      db.close();

      // The upgraded database serves the old M1 sessions through the real app.
      await boot(path);
      expect((await call('GET', '/api/admin/rooms', undefined, 'm1-admin-token')).status).toBe(200);
      const teamSock = await connect({ token: 'm1-team-token' });
      expect(teamSock.latest().role).toBe('team');
      expect(teamSock.latest().standings[0]).toMatchObject({ teamId: 'team2', score: 50 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('timer scheduler', () => {
  it('never fires early for delays beyond Node\'s setTimeout limit (~24.8 days)', () => {
    vi.useFakeTimers();
    try {
      let fired = false;
      const start = Date.now();
      const sched = timerScheduler({ now: () => Date.now() });
      const MAX = 2_147_483_647;
      sched.at(start + MAX + 5_000, () => (fired = true));
      vi.advanceTimersByTime(10);
      expect(fired).toBe(false); // a naive setTimeout would overflow and fire at once
      vi.advanceTimersByTime(MAX);
      expect(fired).toBe(false);
      vi.advanceTimersByTime(5_000);
      expect(fired).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
