// M4.3 step 2: the server-synchronized 5-second question intro.
//   lobby/ready ──start──▶ intro (5 s) ──▶ active (40 s) ──▶ revealed
// The intro is derived from the persisted round (startedAt in the future), so it survives restarts.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connectIo, type Socket } from 'socket.io-client';
import { normalizeAnswer } from '../shared/normalize';
import { POINTS_BY_ORDER } from '../shared/scoring';
import { INTRO_DURATION_MS, type AdminView, type RoomView, type ScreenView, type TeamView } from '../shared/protocol';
import { startApp, type RunningApp } from './app';
import { QUESTIONS, type ServerQuestion } from './content/questions';
import { openDb, type Db } from './db';
import { GameEngine, GameError } from './engine';
import { fakeTime } from './test-utils';
import { adminView, screenView, teamView } from './views';

const ROUND_MS = 40_000;
const PROMPTS = [
  'Những hình ảnh này gợi đến cơ chế phân phối hàng hóa nào ở Việt Nam trước đây?',
  'Đây là sự kiện lịch sử nào?',
  'Những tư liệu này đề cập đến mô hình tổ chức kinh tế tập thể nào?',
  'Những dấu mốc này gắn với bước chuyển lớn nào của kinh tế Việt Nam?',
  'Các mốc thời gian này liên quan đến tổ chức thương mại quốc tế nào?',
  'Đây là định hướng phát triển nào liên quan đến kinh tế, xã hội và môi trường?',
];
const sid = (n: number | string) => `submission-${n}-xxxxxxxx`;
const presence = { devices: () => 1 };

let dbs: Db[] = [];
let dirs: string[] = [];
afterEach(() => {
  dbs.forEach((d) => {
    try {
      d.close();
    } catch {
      /* already closed */
    }
  });
  dbs = [];
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }));
  dirs = [];
});

function engineOn(dbPath: string, t: ReturnType<typeof fakeTime>, questions: readonly ServerQuestion[] = QUESTIONS) {
  const db = openDb(dbPath);
  dbs.push(db);
  const changes: number[] = [];
  const engine = new GameEngine(db, { questions, roundDurationMs: ROUND_MS, clock: t.clock, scheduler: t.scheduler, onChange: () => changes.push(t.now) });
  return { db, engine, changes };
}
function setup() {
  const t = fakeTime();
  const { db, engine, changes } = engineOn(':memory:', t);
  const { room, teams } = engine.createRoom();
  return { t, db, engine, changes, room, teams };
}
const tmpDb = () => {
  const dir = mkdtempSync(join(tmpdir(), 'hc-intro-'));
  dirs.push(dir);
  return join(dir, 'game.sqlite');
};

describe('orientation content', () => {
  it('stores exactly the six orientation questions server-side, in order', () => {
    expect(QUESTIONS.map((q) => q.prompt)).toEqual(PROMPTS);
  });

  it('no orientation question contains its normalized answer', () => {
    for (const q of QUESTIONS) expect(normalizeAnswer(q.prompt!)).not.toContain(normalizeAnswer(q.answer));
  });

  it('refuses to start with a prompt that contains the answer, or a production question without a prompt', () => {
    const t = fakeTime();
    const leaking = QUESTIONS.map((q, i) => (i === 4 ? { ...q, prompt: 'Tổ chức W.T.O là gì?' } : q));
    expect(() => engineOn(':memory:', t, leaking)).toThrow(/prompt contains the answer/);
    const missing = QUESTIONS.map((q, i) => (i === 0 ? { ...q, prompt: undefined } : q));
    expect(() => engineOn(':memory:', t, missing)).toThrow(/no orientation prompt/);
  });

  it('the intro duration can be shortened for tests but never lengthened', () => {
    const db = openDb(':memory:');
    dbs.push(db);
    for (const bad of [0, -1, 1.5, INTRO_DURATION_MS + 1]) {
      expect(() => new GameEngine(db, { questions: QUESTIONS, roundDurationMs: ROUND_MS, introDurationMs: bad })).toThrow(/intro duration/);
    }
    expect(new GameEngine(db, { questions: QUESTIONS, roundDurationMs: ROUND_MS }).introDurationMs).toBe(5_000);
  });
});

describe('authoritative intro → active timing', () => {
  it('every question: exactly 5 s intro, then exactly 40 s of answer time (45 s from the start command)', () => {
    const { t, engine, room, teams } = setup();
    for (let q = 0; q < 6; q++) {
      const command = t.now;
      const round = engine.startRound(room.id);
      expect(round.started_at - command).toBe(5_000);
      expect(round.deadline_at - round.started_at).toBe(40_000);
      expect(round.deadline_at - command).toBe(45_000);
      expect(engine.phaseOf(room.id)).toBe('intro');
      const intro = engine.introView(room.id)!;
      expect(intro).toEqual({ questionNumber: q + 1, totalQuestions: 6, prompt: PROMPTS[q], introStartedAt: command, startsAt: round.started_at });

      t.advanceTo(round.started_at - 1);
      expect(engine.phaseOf(room.id)).toBe('intro');
      expect(() => engine.submit(room.id, teams[0]!.id, sid(`${q}-early`), 'x', round.id)).toThrow(/not started/);
      t.advanceTo(round.started_at);
      expect(engine.phaseOf(room.id)).toBe('active');
      expect(engine.introView(room.id)).toBeNull();
      const view = engine.roundView(engine.openRound(room.id)!);
      expect(view.prompt).toBe(PROMPTS[q]);
      expect(view.durationMs).toBe(40_000);
      // The first answer second is the first second after the intro.
      expect(engine.submit(room.id, teams[0]!.id, sid(q), QUESTIONS[q]!.answer, round.id).receivedAt).toBe(round.started_at);
      t.advanceTo(round.deadline_at - 1);
      expect(engine.phaseOf(room.id)).toBe('active');
      t.advanceTo(round.deadline_at);
      expect(engine.phaseOf(room.id)).toBe('revealed');
      engine.advance(room.id);
      t.advance(3_000);
    }
    expect(engine.phaseOf(room.id)).toBe('finished');
  });

  it('the intro→active boundary is pushed to clients exactly at startedAt (no client timer decides it)', () => {
    const { t, engine, room, changes } = setup();
    const round = engine.startRound(room.id);
    const before = changes.length;
    t.advanceTo(round.started_at - 1);
    expect(changes.length).toBe(before);
    t.advanceTo(round.started_at);
    expect(changes.slice(before)).toEqual([round.started_at]);
  });

  it('repeated start commands during the intro and the round are refused; one round only', () => {
    const { t, db, engine, room } = setup();
    const round = engine.startRound(room.id);
    for (const at of [1, 2_500, 4_999]) {
      t.advanceTo(round.started_at - 5_000 + at);
      expect(() => engine.startRound(room.id)).toThrow(/cannot start from intro/);
    }
    t.advanceTo(round.started_at);
    expect(() => engine.startRound(room.id)).toThrow(/cannot start from active/);
    expect(db.roundsByRoom(room.id)).toHaveLength(1);
    expect(db.roundsByRoom(room.id)[0]!.deadline_at).toBe(round.deadline_at);
  });

  it('renaming is refused during the intro', () => {
    const { engine, room, teams } = setup();
    engine.startRound(room.id);
    expect(() => engine.rename(room.id, teams[0]!.id, 'X')).toThrow(/during a round/);
  });
});

describe('no disclosure during the intro', () => {
  it('admin, team and projector views carry the same intro and nothing of the round', () => {
    const { t, engine, room, teams } = setup();
    const round = engine.startRound(room.id);
    t.advance(1_234);
    const views: RoomView[] = [adminView(engine, room.id, presence), teamView(engine, room.id, teams[0]!.id), screenView(engine, room.id, presence)];
    for (const v of views) {
      expect(v.room.phase).toBe('intro');
      expect(v.intro).toEqual({ questionNumber: 1, totalQuestions: 6, prompt: PROMPTS[0], introStartedAt: round.started_at - 5_000, startsAt: round.started_at });
      expect(v.round).toBeNull();
      expect(v.reveal).toBeNull();
      const json = JSON.stringify(v);
      expect(json).not.toContain(round.id); // no round id: nothing can be requested for it
      for (const q of QUESTIONS) expect(normalizeAnswer(json)).not.toContain(normalizeAnswer(q.answer));
      for (const p of PROMPTS.slice(1)) expect(json).not.toContain(p); // no future question content
      for (const q of QUESTIONS) for (const s of q.scenes) if (s.kind === 'image' || s.kind === 'video') expect(json).not.toContain(s.media.assetId);
    }
  });

  it('the prompt is released only by the intro, never in lobby/ready views', () => {
    const { t, engine, room, teams } = setup();
    const lobby = JSON.stringify([adminView(engine, room.id, presence), teamView(engine, room.id, teams[0]!.id), screenView(engine, room.id, presence)]);
    for (const p of PROMPTS) expect(lobby).not.toContain(p);
    const r = engine.startRound(room.id);
    t.advanceTo(r.deadline_at);
    const revealed = JSON.stringify([adminView(engine, room.id, presence), teamView(engine, room.id, teams[0]!.id), screenView(engine, room.id, presence)]);
    expect(revealed).toContain(PROMPTS[0]); // the closed Q1 only
    for (const p of PROMPTS.slice(1)) expect(revealed).not.toContain(p);
    engine.advance(room.id);
    const ready = JSON.stringify([adminView(engine, room.id, presence), teamView(engine, room.id, teams[0]!.id), screenView(engine, room.id, presence)]);
    for (const p of PROMPTS) expect(ready).not.toContain(p); // Q2's prompt waits for its intro
  });

  it('the active round keeps the prompt above the scenes and the original release offsets', () => {
    const { t, engine, room } = setup();
    const round = engine.startRound(room.id);
    t.advanceTo(round.started_at);
    const v = screenView(engine, room.id, presence);
    expect(v.intro).toBeNull();
    expect(v.round!.prompt).toBe(PROMPTS[0]);
    expect(v.round!.scenes.map((s) => s.id)).toEqual(['h1']);
    t.advanceTo(round.started_at + 6_000 - 1);
    expect(screenView(engine, room.id, presence).round!.scenes.map((s) => s.id)).toEqual(['h1']);
    t.advanceTo(round.started_at + 6_000);
    expect(screenView(engine, room.id, presence).round!.scenes.map((s) => s.id)).toEqual(['h1', 'h3']);
  });

  it('media of the opening scene is refused until the active round begins, for every role', () => {
    const { t, engine, room, teams } = setup();
    const round = engine.startRound(room.id);
    const first = QUESTIONS[0]!.scenes[0]!;
    if (first.kind !== 'video') throw new Error('Q1 opens with a video');
    const sessions = [
      { role: 'admin' as const, roomId: null },
      { role: 'team' as const, roomId: room.id },
      { role: 'screen' as const, roomId: room.id },
    ];
    for (const s of sessions) expect(engine.authorizeMedia(round.id, first.media.assetId, s)).toBeNull();
    t.advanceTo(round.started_at - 1);
    for (const s of sessions) expect(engine.authorizeMedia(round.id, first.media.assetId, s)).toBeNull();
    t.advanceTo(round.started_at);
    for (const s of sessions) expect(engine.authorizeMedia(round.id, first.media.assetId, s)).not.toBeNull();
    expect(teams).toHaveLength(5);
  });
});

describe('submissions during the intro', () => {
  it('a new answer for the pending round is refused and nothing is recorded', () => {
    const { t, db, engine, room, teams } = setup();
    const round = engine.startRound(room.id);
    t.advance(2_000);
    expect(() => engine.submit(room.id, teams[0]!.id, sid(1), 'BAO CẤP', round.id)).toThrow(GameError);
    expect(() => engine.submit(room.id, teams[0]!.id, sid(1), 'BAO CẤP', round.id)).toThrow(/not started/);
    expect(() => engine.submit(room.id, teams[1]!.id, sid(2), 'BAO CẤP')).toThrow(/not started/);
    expect(db.submissionsByRound(round.id)).toHaveLength(0);
    // The same team can still answer normally once the round starts.
    t.advanceTo(round.started_at);
    expect(engine.submit(room.id, teams[0]!.id, sid(1), 'BAO CẤP', round.id).duplicate).toBe(false);
  });

  it("a lost-ack retry of the previous question reconciles during the next intro; nothing lands in the new round", () => {
    const { t, db, engine, room, teams } = setup();
    const q1 = engine.startRound(room.id);
    t.advanceTo(q1.started_at + 3_000);
    const first = engine.submit(room.id, teams[0]!.id, sid('q1'), 'BAO CẤP', q1.id);
    t.advanceTo(q1.deadline_at);
    engine.advance(room.id);
    const q2 = engine.startRound(room.id);
    t.advance(1_000);
    expect(engine.submit(room.id, teams[0]!.id, sid('q1'), 'BAO CẤP', q1.id)).toEqual({ receivedAt: first.receivedAt, duplicate: true });
    expect(engine.submit(room.id, teams[0]!.id, sid('q1'), 'BAO CẤP')).toEqual({ receivedAt: first.receivedAt, duplicate: true });
    expect(() => engine.submit(room.id, teams[1]!.id, sid('q1-new'), 'BAO CẤP', q1.id)).toThrow(/round is over/);
    expect(db.submissionsByRound(q2.id)).toHaveLength(0);
  });

  it('scoring is unchanged: receipt order from the active start, response time excludes the intro', () => {
    const { t, engine, room, teams } = setup();
    const round = engine.startRound(room.id);
    t.advanceTo(round.started_at + 1_000);
    engine.submit(room.id, teams[2]!.id, sid(3), 'bao cap', round.id);
    t.advance(500);
    engine.submit(room.id, teams[0]!.id, sid(1), 'BAO CẤP', round.id);
    t.advance(500);
    engine.submit(room.id, teams[1]!.id, sid(2), 'sai', round.id);
    t.advanceTo(round.deadline_at);
    const reveal = engine.reveal(engine.currentRound(room.id)!);
    expect(reveal.submissions.map((s) => [s.teamId, s.correct, s.orderRank, s.points, s.responseMs])).toEqual([
      [teams[2]!.id, true, 1, POINTS_BY_ORDER[0], 1_000],
      [teams[0]!.id, true, 2, POINTS_BY_ORDER[1], 1_500],
      [teams[1]!.id, false, null, 0, 2_000],
      [teams[3]!.id, false, null, 0, null],
      [teams[4]!.id, false, null, 0, null],
    ]);
  });
});

describe('server restart', () => {
  it('during the intro: resumes the remaining intro, activates at the original time, never extends the deadline', () => {
    const path = tmpDb();
    const t = fakeTime();
    const first = engineOn(path, t);
    const { room } = first.engine.createRoom();
    const round = first.engine.startRound(room.id);
    t.advance(2_000);
    first.engine.dispose();
    first.db.close();

    const t2 = fakeTime(t.now + 1_000); // the server was down for 1 s
    const second = engineOn(path, t2);
    second.engine.recover();
    expect(second.engine.phaseOf(room.id)).toBe('intro');
    expect(second.engine.introView(room.id)!.startsAt).toBe(round.started_at); // 2 s remaining, not 5
    expect(second.engine.introView(room.id)!.startsAt - t2.now).toBe(2_000);
    expect(() => second.engine.startRound(room.id)).toThrow(/cannot start/);
    t2.advanceTo(round.started_at - 1);
    expect(second.changes).toHaveLength(0);
    t2.advanceTo(round.started_at);
    expect(second.changes).toEqual([round.started_at]);
    expect(second.engine.phaseOf(room.id)).toBe('active');
    const rounds = second.db.roundsByRoom(room.id);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({ id: round.id, started_at: round.started_at, deadline_at: round.deadline_at });
    t2.advanceTo(round.deadline_at);
    expect(second.engine.phaseOf(room.id)).toBe('revealed');
  });

  it('down across the intro boundary: comes back active at the original offsets', () => {
    const path = tmpDb();
    const t = fakeTime();
    const first = engineOn(path, t);
    const { room } = first.engine.createRoom();
    const round = first.engine.startRound(room.id);
    t.advance(4_000);
    first.engine.dispose();
    first.db.close();
    const t2 = fakeTime(round.started_at + 7_000);
    const second = engineOn(path, t2);
    second.engine.recover();
    expect(second.engine.phaseOf(room.id)).toBe('active');
    expect(second.engine.roundView(second.engine.openRound(room.id)!).scenes.map((s) => s.id)).toEqual(['h1', 'h3']);
    expect(second.db.roundById(round.id)!.deadline_at).toBe(round.deadline_at);
  });

  it('during the active round: the original 40 s deadline holds', () => {
    const path = tmpDb();
    const t = fakeTime();
    const first = engineOn(path, t);
    const { room } = first.engine.createRoom();
    const round = first.engine.startRound(room.id);
    t.advanceTo(round.started_at + 20_000);
    first.engine.dispose();
    first.db.close();
    const t2 = fakeTime(t.now + 5_000);
    const second = engineOn(path, t2);
    second.engine.recover();
    expect(second.engine.phaseOf(room.id)).toBe('active');
    t2.advanceTo(round.deadline_at - 1);
    expect(second.engine.phaseOf(room.id)).toBe('active');
    t2.advanceTo(round.deadline_at);
    expect(second.engine.phaseOf(room.id)).toBe('revealed');
  });

  it('down for the whole round: closes on recovery, no new intro or round', () => {
    const path = tmpDb();
    const t = fakeTime();
    const first = engineOn(path, t);
    const { room } = first.engine.createRoom();
    const round = first.engine.startRound(room.id);
    t.advance(1_000);
    first.engine.dispose();
    first.db.close();
    const t2 = fakeTime(round.deadline_at + 60_000);
    const second = engineOn(path, t2);
    second.engine.recover();
    expect(second.engine.phaseOf(room.id)).toBe('revealed');
    expect(second.db.roundsByRoom(room.id)).toHaveLength(1);
  });
});

// ------------------------------------------------------------------ over the network
describe('synchronized intro over Socket.IO and the music endpoint', () => {
  const PASSWORD = 'intro-test-password';
  let app: RunningApp;
  let t: ReturnType<typeof fakeTime>;
  let root: string;
  let sockets: Socket[] = [];

  beforeEach(async () => {
    t = fakeTime();
    root = mkdtempSync(join(tmpdir(), 'hc-intro-music-'));
    for (const name of ['lobby', 'intro', 'question']) writeFileSync(join(root, name + '.mp3'), Buffer.from([0x49, 0x44, 0x33, 0, 0, 0]));
    app = await startApp({ dbPath: ':memory:', adminPassword: PASSWORD, roundDurationMs: ROUND_MS, musicRoot: root, clock: t.clock, scheduler: t.scheduler });
  });
  afterEach(async () => {
    sockets.forEach((s) => s.disconnect());
    sockets = [];
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await fetch(app.url + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };
  type Client = Socket & { states: RoomView[]; latest: () => RoomView };
  const connect = async (auth: Record<string, string>): Promise<Client> => {
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
  };
  const settle = () => new Promise((r) => setTimeout(r, 60));
  const emit = <T,>(s: Socket, event: string, payload: unknown) => new Promise<T>((resolve) => s.emit(event, payload, resolve));

  async function room() {
    const admin = (await call('POST', '/api/admin/login', { password: PASSWORD })).body.token as string;
    const code = (await call('POST', '/api/admin/rooms', {}, admin)).body.code as string;
    const roomId = app.db.roomByCode(code)!.id;
    const pins = app.engine.teams(roomId).map((x) => x.pin);
    const teams = await Promise.all(pins.map(async (pin) => (await call('POST', '/api/join', { code, pin })).body.token as string));
    const secret = (await call('POST', `/api/admin/rooms/${code}/screen-pairing`, {}, admin)).body.secret;
    const screen = (await call('POST', '/api/screen/pair', { secret })).body.token as string;
    return { admin, code, roomId, teams, screen };
  }

  it('five players, admin and projector enter the same intro and leave it together; repeated starts are refused', async () => {
    const r = await room();
    const admin = await connect({ token: r.admin, roomCode: r.code });
    const players = await Promise.all(r.teams.map((token) => connect({ token })));
    const screen = await connect({ token: r.screen });
    const command = t.now;
    expect(await emit(admin, 'admin:start', {})).toEqual({ ok: true });
    expect(await emit(admin, 'admin:start', {})).toMatchObject({ ok: false, error: 'wrong_phase' });
    await settle();
    const all = [admin, ...players, screen];
    for (const c of all) {
      const v = c.latest();
      expect(v.room.phase).toBe('intro');
      expect(v.intro).toEqual({ questionNumber: 1, totalQuestions: 6, prompt: PROMPTS[0], introStartedAt: command, startsAt: command + 5_000 });
      expect(v.round).toBeNull();
    }
    expect(app.db.roundsByRoom(r.roomId)).toHaveLength(1);

    // Answers during the intro are refused for every player; nothing is recorded.
    const roundId = app.db.roundsByRoom(r.roomId)[0]!.id;
    for (const [i, p] of players.entries()) expect(await emit(p, 'team:submit', { roundId, submissionId: sid(`intro-${i}`), answer: 'BAO CẤP' })).toMatchObject({ ok: false, error: 'wrong_phase' });
    expect(app.db.submissionsByRound(roundId)).toHaveLength(0);

    // Late join at 3 s: the remaining 2 s, never a restart from five.
    t.advance(3_000);
    const late = await connect({ token: r.teams[0]! });
    expect((late.latest() as TeamView).intro!.startsAt - (late.latest() as TeamView).serverNow).toBe(2_000);
    const lateScreen = await connect({ token: r.screen });
    expect((lateScreen.latest() as ScreenView).intro!.startsAt).toBe(command + 5_000);

    await settle(); // let the late joiners' presence broadcasts arrive first
    const counts = all.map((c) => c.states.length);
    t.advanceTo(command + 5_000);
    await settle();
    all.forEach((c, i) => {
      expect(c.states.length).toBe(counts[i]! + 1); // exactly one push at the boundary
      const v = c.latest();
      expect(v.room.phase).toBe('active');
      expect(v.intro).toBeNull();
      expect(v.round).toMatchObject({ id: roundId, startedAt: command + 5_000, deadlineAt: command + 45_000, durationMs: 40_000, prompt: PROMPTS[0] });
      expect(v.round!.scenes.map((s) => s.id)).toEqual(['h1']);
    });
    expect(await emit(players[0]!, 'team:submit', { roundId, submissionId: sid('ok'), answer: 'BAO CẤP' })).toMatchObject({ ok: true, receivedAt: command + 5_000 });
    expect((admin.latest() as AdminView).submittedCount).toBe(1);
  });

  it('a projector reconnecting during the intro gets the same remaining countdown', async () => {
    const r = await room();
    const admin = await connect({ token: r.admin, roomCode: r.code });
    await emit(admin, 'admin:start', {});
    const startsAt = t.now + 5_000;
    t.advance(1_500);
    const a = await connect({ token: r.screen });
    a.disconnect();
    t.advance(2_000);
    const b = await connect({ token: r.screen });
    const v = b.latest() as ScreenView;
    expect(v.intro!.startsAt).toBe(startsAt);
    expect(v.intro!.startsAt - v.serverNow).toBe(1_500);
  });

  it('intro track: projector only, lobby/ready/intro only; question track and scene media refused during the intro', async () => {
    const r = await room();
    const other = await room();
    const url = (track: string, id?: string) => `/api/screen/rooms/${r.code}/music/${track}${id ? '?roundId=' + id : ''}`;
    const get = (path: string, token?: string) => fetch(app.url + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    expect((await get(url('intro'))).status).toBe(401);
    for (const token of [r.admin, r.teams[0]!, other.screen]) expect((await get(url('intro'), token)).status).toBe(403);
    const lobby = await get(url('intro'), r.screen); // preload while waiting: generic, question-independent
    expect(lobby.status).toBe(200);
    expect(lobby.headers.get('content-type')).toContain('audio/mpeg');
    expect(lobby.headers.get('cache-control')).toContain('private, no-store');

    for (let q = 0; q < 6; q++) {
      const round = app.engine.startRound(r.roomId);
      t.advance(1_000);
      expect((await get(url('intro'), r.screen)).status).toBe(200);
      expect((await get(url('lobby'), r.screen)).status).toBe(403);
      expect((await get(url('question', round.id), r.screen)).status).toBe(403);
      const opening = QUESTIONS[q]!.scenes.find((s) => s.kind === 'image' || s.kind === 'video');
      if (opening && (opening.kind === 'image' || opening.kind === 'video')) {
        for (const token of [r.admin, r.teams[0]!, r.screen]) {
          expect((await get(`/api/rounds/${round.id}/media/${opening.media.assetId}`, token)).status).toBe(403);
        }
      }
      t.advanceTo(round.started_at);
      expect((await get(url('intro'), r.screen)).status).toBe(403);
      expect((await get(url('question', round.id), r.screen)).status).toBe(200);
      t.advanceTo(round.deadline_at);
      expect((await get(url('intro'), r.screen)).status).toBe(403);
      app.engine.advance(r.roomId);
      expect((await get(url('intro'), r.screen)).status).toBe(q === 5 ? 403 : 200); // ready: yes; finished: no
    }
    rmSync(join(root, 'intro.mp3'));
    expect((await get(`/api/screen/rooms/${other.code}/music/intro`, other.screen)).status).toBe(404); // optional file
  });
});
