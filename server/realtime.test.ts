import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connectIo, type Socket } from 'socket.io-client';
import type { AdminView, ClientToServerEvents, RoomView, ServerToClientEvents, TeamView } from '../shared/protocol';
import { normalizeAnswer } from '../shared/normalize';
import { startApp, type RunningApp } from './app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents> & { states: RoomView[]; latest: () => RoomView };

const PASSWORD = 'test-admin-password';
const ROUND_MS = 2_500;
let app: RunningApp;
let clients: Client[] = [];

beforeEach(async () => {
  app = await startApp({ dbPath: ':memory:', adminPassword: PASSWORD, roundDurationMs: ROUND_MS, authLimit: { attempts: 5, windowMs: 60_000 } });
});
afterEach(async () => {
  clients.forEach((c) => c.disconnect());
  clients = [];
  await app.close();
});

const post = (path: string, body: unknown, token?: string) =>
  fetch(app.url + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

async function adminToken() {
  const res = await post('/api/admin/login', { password: PASSWORD });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

async function connect(auth: Record<string, string>): Promise<Client> {
  const socket = connectIo(app.url, { auth, transports: ['websocket'], forceNew: true, reconnection: false }) as Client;
  socket.states = [];
  socket.latest = () => socket.states[socket.states.length - 1]!;
  socket.on('state', (v) => socket.states.push(v));
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('state', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

const until = async (pred: () => boolean, timeoutMs = 5_000) => {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 15));
  }
};

const emit = <E extends keyof ClientToServerEvents>(s: Client, event: E, payload: unknown) =>
  new Promise<{ ok: boolean; error?: string; receivedAt?: number; duplicate?: boolean }>((resolve) =>
    (s.emit as (e: string, p: unknown, ack: (r: never) => void) => void)(event, payload, resolve),
  );

/** Admin + five joined team sockets. */
async function room() {
  const token = await adminToken();
  const created = await post('/api/admin/rooms', {}, token);
  const { code } = (await created.json()) as { code: string };
  const admin = await connect({ token, roomCode: code });
  const pins = (admin.latest() as AdminView).teams.map((t) => t.pin);
  const teams: Client[] = [];
  const teamTokens: string[] = [];
  for (const pin of pins) {
    const res = await post('/api/join', { code, pin });
    const { token: t } = (await res.json()) as { token: string };
    teamTokens.push(t);
    teams.push(await connect({ token: t }));
  }
  return { code, admin, teams, teamTokens, pins };
}

describe('authentication', () => {
  it('rejects a wrong admin password and rate-limits login attempts', async () => {
    for (let i = 0; i < 5; i++) expect((await post('/api/admin/login', { password: 'nope' })).status).toBe(401);
    expect((await post('/api/admin/login', { password: PASSWORD })).status).toBe(429);
  });

  it('room creation requires an admin session', async () => {
    expect((await post('/api/admin/rooms', {})).status).toBe(401);
    expect((await post('/api/admin/rooms', {}, 'forged-token')).status).toBe(401);
  });

  it('join: wrong code and wrong PIN give the same reply; attempts are rate-limited', async () => {
    const token = await adminToken();
    const { code } = (await (await post('/api/admin/rooms', {}, token)).json()) as { code: string };
    const wrongPin = await post('/api/join', { code, pin: '000000' });
    const wrongCode = await post('/api/join', { code: 'ZZZZZZ', pin: '000000' });
    expect(wrongPin.status).toBe(401);
    expect(await wrongPin.json()).toEqual(await wrongCode.json());
    for (let i = 0; i < 3; i++) await post('/api/join', { code, pin: '111111' });
    expect((await post('/api/join', { code, pin: '222222' })).status).toBe(429);
  });

  it('sockets without a valid session are refused', async () => {
    await expect(connect({ token: 'nope' })).rejects.toThrow(/unauthorized/);
  });

  it('a team token cannot perform admin actions and an admin cannot submit', async () => {
    const { admin, teams } = await room();
    expect(await emit(teams[0]!, 'admin:start', {})).toMatchObject({ ok: false, error: 'forbidden' });
    expect(await emit(teams[0]!, 'admin:rename', { teamId: 'x', name: 'y' })).toMatchObject({ ok: false, error: 'forbidden' });
    expect(await emit(admin, 'team:submit', { roundId: 'any-round-id-1', submissionId: 'admin-submission-1', answer: 'BAO CẤP' })).toMatchObject({ ok: false, error: 'forbidden' });
  });
});

describe('a full round over the network', () => {
  it('concurrent and duplicate submissions, cross-team payloads, no early disclosure, results after timeout', async () => {
    const { admin, teams } = await room();
    const teamIds = (admin.latest() as AdminView).teams.map((t) => t.id);
    for (const t of teams) expect(await emit(t, 'team:ready', { ready: true })).toMatchObject({ ok: true });
    await until(() => (admin.latest() as AdminView).teams.every((t) => t.ready && t.connected));

    expect(await emit(admin, 'admin:start', {})).toMatchObject({ ok: true });
    // The server-timed 5 s intro comes first (M4.3 step 2); the round follows at the server's start time.
    await until(() => teams.every((t) => t.latest().room.phase === 'intro'));
    await until(() => teams.every((t) => t.latest().room.phase === 'active'), 8_000);
    const deadline = (teams[0]!.latest() as TeamView).round!.deadlineAt;
    const roundId = (teams[0]!.latest() as TeamView).round!.id;

    // Team 0 tries to submit as team 1: the payload team id is ignored.
    const cross = await emit(teams[0]!, 'team:submit', { roundId, submissionId: 'cross-team-attempt-1', answer: 'sai', teamId: teamIds[1] });
    expect(cross.ok).toBe(true);
    // Team 0 already submitted (as itself), so a different submission is rejected.
    expect(await emit(teams[0]!, 'team:submit', { roundId, submissionId: 'second-try-team-0', answer: 'BAO CẤP' })).toMatchObject({ ok: false, error: 'already_submitted' });

    // Teams 1..4 fire at the same time; team 2 sends the same submission twice concurrently.
    const answers = ['', 'Bao cấp', 'bao-cap', 'BAOCAP', 'tem phiếu'];
    const results = await Promise.all([
      emit(teams[1]!, 'team:submit', { roundId, submissionId: 'concurrent-team-1', answer: answers[1] }),
      emit(teams[2]!, 'team:submit', { roundId, submissionId: 'concurrent-team-2', answer: answers[2] }),
      emit(teams[2]!, 'team:submit', { roundId, submissionId: 'concurrent-team-2', answer: answers[2] }),
      emit(teams[3]!, 'team:submit', { roundId, submissionId: 'concurrent-team-3', answer: answers[3] }),
      emit(teams[4]!, 'team:submit', { roundId, submissionId: 'concurrent-team-4', answer: answers[4] }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.duplicate)).toHaveLength(1);

    // Neutral acknowledgement only.
    for (const r of results) expect(Object.keys(r).sort()).toEqual(['duplicate', 'ok', 'receivedAt']);
    await until(() => (admin.latest() as AdminView).submittedCount === 5);

    // Refresh: team 2 disconnects and reconnects with its token while the round is running.
    const tokenOf2 = (teams[2]!.auth as { token: string }).token;
    teams[2]!.disconnect();
    const team2b = await connect({ token: tokenOf2 });
    const restored = team2b.latest() as TeamView;
    expect(restored.room.phase).toBe('active');
    expect(restored.me.submission?.answer).toBe('bao-cap');
    expect(restored.round?.deadlineAt).toBe(deadline);

    // Everything sent before the close must be free of answers, correctness and others' answers.
    const canonical = normalizeAnswer('BAO CẤP');
    for (const c of clients) {
      for (const view of c.states.filter((v) => v.room.phase !== 'revealed')) {
        const scrubbed = view.role === 'team' ? { ...view, me: { ...view.me, submission: null } } : view;
        const json = JSON.stringify(scrubbed);
        expect(normalizeAnswer(json)).not.toContain(canonical);
        expect(json).not.toMatch(/"correct"|"points"|"orderRank"|canonicalAnswer|tem phiếu/);
      }
    }

    // Server closes the round at its deadline.
    await until(() => clients.filter((c) => c.connected).every((c) => c.latest().room.phase === 'revealed'), ROUND_MS + 3_000);
    expect(Date.now()).toBeGreaterThanOrEqual(deadline - 50);
    const reveal = (admin.latest() as AdminView).reveal!;
    expect(reveal.canonicalAnswer).toBe('BAO CẤP');
    const by = Object.fromEntries(reveal.submissions.map((s) => [s.teamId, s]));
    expect(by[teamIds[0]!]).toMatchObject({ answer: 'sai', correct: false, points: 0 });
    expect(by[teamIds[4]!]).toMatchObject({ correct: false, points: 0 });
    // Teams 1-3 were correct: points 50/40/30 in their authoritative receipt order.
    const correct = reveal.submissions.filter((s) => s.correct);
    expect(correct.map((s) => s.points)).toEqual([50, 40, 30]);
    expect(new Set(correct.map((s) => s.teamId))).toEqual(new Set([teamIds[1], teamIds[2], teamIds[3]]));
    const order = correct.map((s) => s.responseMs!);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    // Late submission after close is rejected.
    expect(await emit(teams[1]!, 'team:submit', { roundId, submissionId: 'after-close-team1', answer: 'BAO CẤP' })).toMatchObject({ ok: false });
  }, 15_000);

  it('time sync returns the server clock', async () => {
    const { teams } = await room();
    const r = await new Promise<{ t0: number; server: number }>((resolve) => teams[0]!.emit('time:sync', 123, resolve));
    expect(r.t0).toBe(123);
    expect(Math.abs(r.server - Date.now())).toBeLessThan(1_000);
  });

  it('admin sees connected / disconnected states', async () => {
    const { admin, teams } = await room();
    await until(() => (admin.latest() as AdminView).teams.every((t) => t.connected));
    teams[4]!.disconnect();
    await until(() => !(admin.latest() as AdminView).teams[4]!.connected);
  });
});
