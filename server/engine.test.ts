import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { QUESTIONS } from './content/questions';
import { openDb, type Db } from './db';
import { GameEngine, GameError, type Scheduler } from './engine';
import { fakeTime, startActive } from './test-utils';
import { adminView, teamView } from './views';

const DURATION = 40_000;
let dbs: Db[] = [];
afterEach(() => {
  dbs.forEach((d) => d.close());
  dbs = [];
});

function setup(dbPath = ':memory:', t = fakeTime()) {
  const db = openDb(dbPath);
  dbs.push(db);
  const changes: string[] = [];
  const engine = new GameEngine(db, {
    questions: QUESTIONS,
    roundDurationMs: DURATION,
    clock: t.clock,
    scheduler: t.scheduler,
    onChange: (id) => changes.push(id),
  });
  const { room, teams } = engine.createRoom();
  return { db, engine, t, room, teams, changes };
}

const sid = (n: number | string) => `submission-${n}-xxxxxxxx`;

describe('room setup', () => {
  it('creates a room with a code and five teams with distinct 6-digit PINs', () => {
    const { room, teams } = setup();
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(teams).toHaveLength(5);
    expect(new Set(teams.map((t) => t.pin)).size).toBe(5);
    teams.forEach((t) => expect(t.pin).toMatch(/^\d{6}$/));
  });

  it('renames teams outside a round only', () => {
    const { engine, room, teams, t } = setup();
    engine.rename(room.id, teams[0]!.id, '  Sao Đỏ  ');
    expect(engine.teams(room.id)[0]!.name).toBe('Sao Đỏ');
    expect(() => engine.rename(room.id, teams[0]!.id, '   ')).toThrow(GameError);
    startActive(engine, room.id, t);
    expect(() => engine.rename(room.id, teams[0]!.id, 'X')).toThrow(/during a round/);
  });
});

describe('state machine', () => {
  it('lobby → active → revealed → ready → … → finished', () => {
    const { engine, room, t } = setup();
    expect(engine.phaseOf(room.id)).toBe('lobby');
    for (let q = 0; q < QUESTIONS.length; q++) {
      startActive(engine, room.id, t);
      expect(engine.phaseOf(room.id)).toBe('active');
      t.advance(DURATION);
      expect(engine.phaseOf(room.id)).toBe('revealed');
      engine.advance(room.id);
      expect(engine.phaseOf(room.id)).toBe(q === QUESTIONS.length - 1 ? 'finished' : 'ready');
    }
    expect(() => engine.startRound(room.id)).toThrow(GameError);
  });

  it('guards transitions', () => {
    const { engine, room, t } = setup();
    expect(() => engine.advance(room.id)).toThrow(/cannot advance/);
    startActive(engine, room.id, t);
    expect(() => engine.startRound(room.id)).toThrow(/cannot start/);
    expect(() => engine.advance(room.id)).toThrow(/cannot advance/);
  });
});

describe('server-side deadline', () => {
  it('accepts at deadline − 1 ms and rejects at the deadline', () => {
    const { engine, room, teams, t } = setup();
    const round = startActive(engine, room.id, t);
    t.advanceTo(round.deadline_at - 1);
    expect(engine.submit(room.id, teams[0]!.id, sid(1), 'bao cap').duplicate).toBe(false);
    t.advanceTo(round.deadline_at);
    expect(() => engine.submit(room.id, teams[1]!.id, sid(2), 'bao cap')).toThrow(/no active round/);
  });

  it('a submission arriving after the deadline is rejected even if the close timer is late', () => {
    const t = fakeTime();
    const lateScheduler: Scheduler = { at: () => () => {} }; // timers never fire
    const db = openDb(':memory:');
    dbs.push(db);
    const engine = new GameEngine(db, { questions: QUESTIONS, roundDurationMs: DURATION, clock: t.clock, scheduler: lateScheduler });
    const { room, teams } = engine.createRoom();
    const round = startActive(engine, room.id, t);
    t.advanceTo(round.deadline_at);
    expect(() => engine.submit(room.id, teams[0]!.id, sid(1), 'BAO CẤP')).toThrow(/deadline passed/);
    // The late submission also closed the round.
    expect(engine.phaseOf(room.id)).toBe('revealed');
    expect(engine.reveal(engine.currentRound(room.id)!).submissions.every((s) => s.answer === null)).toBe(true);
  });

  it('the round closes exactly at the server deadline, never earlier', () => {
    const { engine, room, t } = setup();
    const round = startActive(engine, room.id, t);
    t.advanceTo(round.deadline_at - 1);
    expect(engine.phaseOf(room.id)).toBe('active');
    expect(engine.closeRound(round.id)).toBe(false); // early close attempt is refused
    expect(engine.phaseOf(room.id)).toBe('active');
    t.advanceTo(round.deadline_at);
    expect(engine.phaseOf(room.id)).toBe('revealed');
    expect(engine.closeRound(round.id)).toBe(false); // idempotent
  });
});

describe('submissions', () => {
  it('one submission per team; idempotent retry with the same id; other ids rejected', () => {
    const { engine, room, teams, t } = setup();
    startActive(engine, room.id, t);
    t.advance(5_000);
    const first = engine.submit(room.id, teams[0]!.id, sid('a'), 'sai');
    t.advance(1_000);
    const retry = engine.submit(room.id, teams[0]!.id, sid('a'), 'something else');
    expect(retry).toEqual({ receivedAt: first.receivedAt, duplicate: true });
    expect(() => engine.submit(room.id, teams[0]!.id, sid('b'), 'BAO CẤP')).toThrow(/already submitted/);
    t.advance(DURATION);
    const reveal = engine.reveal(engine.currentRound(room.id)!);
    expect(reveal.submissions.find((s) => s.teamId === teams[0]!.id)).toMatchObject({ answer: 'sai', correct: false, points: 0 });
  });

  it('rejects invalid payloads', () => {
    const { engine, room, teams, t } = setup();
    startActive(engine, room.id, t);
    expect(() => engine.submit(room.id, teams[0]!.id, 'short', 'x')).toThrow(/submission id/);
    expect(() => engine.submit(room.id, teams[0]!.id, sid(1), '   ')).toThrow(/empty/);
    expect(() => engine.submit(room.id, teams[0]!.id, sid(1), 'x'.repeat(121))).toThrow(/too long/);
    expect(() => engine.submit(room.id, teams[0]!.id, sid(1), 42 as unknown as string)).toThrow(/text/);
  });

  it('rejects a team id from another room', () => {
    const a = setup();
    const otherRoom = a.engine.createRoom();
    startActive(a.engine, a.room.id, a.t);
    expect(() => a.engine.submit(a.room.id, otherRoom.teams[0]!.id, sid(1), 'BAO CẤP')).toThrow(/not in room/);
  });

  it('rejects submissions outside an active round', () => {
    const { engine, room, teams } = setup();
    expect(() => engine.submit(room.id, teams[0]!.id, sid(1), 'BAO CẤP')).toThrow(/no active round/);
  });

  it('scores by receipt order; incorrect and missing submissions get 0', () => {
    const { engine, room, teams, t } = setup();
    startActive(engine, room.id, t);
    const [a, b, c, d] = teams;
    t.advance(1_000);
    engine.submit(room.id, c!.id, sid('c'), 'bao-cap');
    t.advance(1_000);
    engine.submit(room.id, a!.id, sid('a'), 'Bao Cấp');
    t.advance(1_000);
    engine.submit(room.id, d!.id, sid('d'), 'tem phiếu');
    t.advance(1_000);
    engine.submit(room.id, b!.id, sid('b'), 'BAOCAP');
    t.advance(DURATION);
    const reveal = engine.reveal(engine.currentRound(room.id)!);
    const by = (id: string) => reveal.submissions.find((s) => s.teamId === id)!;
    expect(by(c!.id)).toMatchObject({ points: 50, orderRank: 1, correct: true, responseMs: 1_000 });
    expect(by(a!.id)).toMatchObject({ points: 40, orderRank: 2 });
    expect(by(b!.id)).toMatchObject({ points: 30, orderRank: 3 });
    expect(by(d!.id)).toMatchObject({ points: 0, orderRank: null, correct: false });
    expect(by(teams[4]!.id)).toMatchObject({ answer: null, points: 0 });
    expect(reveal.canonicalAnswer).toBe('BAO CẤP');
    expect(reveal.standingsAfter[0]).toMatchObject({ teamId: c!.id, score: 50, rank: 1 });
    expect(reveal.standingsBefore.every((s) => s.score === 0)).toBe(true);
  });

  it('back-to-back submissions in the same millisecond keep strict receipt order', () => {
    const { engine, room, teams, t } = setup();
    startActive(engine, room.id, t);
    t.advance(2_000);
    for (const team of [...teams].reverse()) engine.submit(room.id, team.id, sid(team.slot), 'BAO CẤP');
    t.advance(DURATION);
    const reveal = engine.reveal(engine.currentRound(room.id)!);
    expect(reveal.submissions.map((s) => s.teamId)).toEqual([...teams].reverse().map((x) => x.id));
    expect(reveal.submissions.map((s) => s.points)).toEqual([50, 40, 30, 20, 10]);
  });
});

describe('no disclosure before the round closes', () => {
  it('reveal() refuses an open round', () => {
    const { engine, room, t } = setup();
    const round = startActive(engine, room.id, t);
    expect(() => engine.reveal(round)).toThrow(/still open/);
  });

  it('admin and team views during an active round contain no answer, correctness or other answers', () => {
    const { engine, room, teams, t } = setup();
    startActive(engine, room.id, t);
    t.advance(1_000);
    engine.submit(room.id, teams[0]!.id, sid(1), 'BAO CẤP'); // correct
    engine.submit(room.id, teams[1]!.id, sid(2), 'đáp án sai của đội hai'); // wrong
    const admin = adminView(engine, room.id, { devices: () => 1 });
    const adminJson = JSON.stringify(admin);
    expect(admin.reveal).toBeNull();
    expect(admin.submittedCount).toBe(2);
    expect(adminJson).not.toMatch(/bao ?c[aấ]p/i);
    expect(adminJson).not.toContain('đáp án sai');
    expect(adminJson).not.toMatch(/"correct"|"points"|"orderRank"|canonicalAnswer/);

    // The team that answered correctly sees only its own echo, nothing about correctness.
    const own = teamView(engine, room.id, teams[0]!.id);
    expect(own.reveal).toBeNull();
    expect(own.me.submission?.answer).toBe('BAO CẤP');
    const { me: _me, ...rest } = own;
    expect(JSON.stringify(rest)).not.toMatch(/bao ?c[aấ]p/i);
    expect(JSON.stringify(own)).not.toMatch(/"correct"|"points"|"orderRank"|canonicalAnswer/);

    // Another team sees neither the answer nor other teams' submissions.
    const other = JSON.stringify(teamView(engine, room.id, teams[2]!.id));
    expect(other).not.toMatch(/bao ?c[aấ]p/i);
    expect(other).not.toContain('đáp án sai');
  });

  it('after close, everyone gets the answer and results', () => {
    const { engine, room, teams, t } = setup();
    startActive(engine, room.id, t);
    t.advance(DURATION);
    expect(teamView(engine, room.id, teams[3]!.id).reveal?.canonicalAnswer).toBe('BAO CẤP');
  });
});

describe('restart and refresh', () => {
  it('a server restart re-arms the original deadline (never restarts the timer)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-'));
    try {
      const path = join(dir, 'game.sqlite');
      const t = fakeTime();
      const first = setup(path, t);
      const round = startActive(first.engine, first.room.id, t);
      t.advance(20_000);
      first.engine.submit(first.room.id, first.teams[0]!.id, sid(1), 'BAO CẤP');
      first.engine.dispose();

      // "Restart": a new engine on the same database file, 10 s later.
      const t2 = fakeTime(t.now + 10_000);
      const db2 = openDb(path);
      dbs.push(db2);
      const engine2 = new GameEngine(db2, { questions: QUESTIONS, roundDurationMs: DURATION, clock: t2.clock, scheduler: t2.scheduler });
      engine2.recover();
      expect(engine2.openRound(first.room.id)?.deadline_at).toBe(round.deadline_at);
      expect(() => engine2.submit(first.room.id, first.teams[0]!.id, sid(2), 'x')).toThrow(/already submitted/);
      t2.advanceTo(round.deadline_at - 1);
      expect(engine2.phaseOf(first.room.id)).toBe('active');
      t2.advanceTo(round.deadline_at);
      expect(engine2.phaseOf(first.room.id)).toBe('revealed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('recovery closes rounds whose deadline passed while the server was down', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-'));
    try {
      const path = join(dir, 'game.sqlite');
      const t = fakeTime();
      const first = setup(path, t);
      startActive(first.engine, first.room.id, t);
      first.engine.dispose();
      const t2 = fakeTime(t.now + DURATION + 5_000);
      const db2 = openDb(path);
      dbs.push(db2);
      const engine2 = new GameEngine(db2, { questions: QUESTIONS, roundDurationMs: DURATION, clock: t2.clock, scheduler: t2.scheduler });
      engine2.recover();
      expect(engine2.phaseOf(first.room.id)).toBe('revealed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('views are pure reads: building them repeatedly (refresh) never changes the deadline', () => {
    const { engine, room, teams, t } = setup();
    const round = startActive(engine, room.id, t);
    for (let i = 0; i < 5; i++) {
      t.advance(1_000);
      expect(teamView(engine, room.id, teams[0]!.id).round?.deadlineAt).toBe(round.deadline_at);
    }
  });
});
