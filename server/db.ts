import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RoomPhase } from '../shared/protocol';
import type { RoundKind } from '../shared/scoring';

export interface RoomRow {
  id: string;
  code: string;
  phase: RoomPhase;
  question_index: number;
  created_at: number;
}
export interface TeamRow {
  id: string;
  room_id: string;
  slot: number;
  name: string;
  pin: string;
  ready: number;
}
export interface RoundRow {
  id: string;
  room_id: string;
  question_index: number;
  kind: RoundKind;
  started_at: number;
  deadline_at: number;
  closed_at: number | null;
}
export interface SubmissionRow {
  id: string;
  round_id: string;
  team_id: string;
  client_submission_id: string;
  answer: string;
  received_at: number;
  seq: number;
  is_correct: number | null;
  order_rank: number | null;
  points: number | null;
}
export interface SessionRow {
  token_hash: string;
  role: 'admin' | 'team';
  room_id: string | null;
  team_id: string | null;
  created_at: number;
}

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  phase TEXT NOT NULL CHECK (phase IN ('lobby','active','revealed','ready','finished')),
  question_index INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  ready INTEGER NOT NULL DEFAULT 0,
  UNIQUE (room_id, slot),
  UNIQUE (room_id, pin)
);
CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'main' CHECK (kind IN ('main','tiebreak')),
  started_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL,
  closed_at INTEGER,
  UNIQUE (room_id, question_index, kind)
);
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  client_submission_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  is_correct INTEGER,
  order_rank INTEGER,
  points INTEGER,
  UNIQUE (round_id, team_id),
  UNIQUE (round_id, seq)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin','team')),
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
`;

export type Db = ReturnType<typeof openDb>;

export function openDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(SCHEMA);

  const q = {
    insertRoom: db.prepare('INSERT INTO rooms (id, code, phase, question_index, created_at) VALUES (?, ?, ?, 0, ?)'),
    roomById: db.prepare('SELECT * FROM rooms WHERE id = ?'),
    roomByCode: db.prepare('SELECT * FROM rooms WHERE code = ?'),
    listRooms: db.prepare('SELECT * FROM rooms ORDER BY created_at DESC LIMIT 20'),
    setRoomState: db.prepare('UPDATE rooms SET phase = ?, question_index = ? WHERE id = ?'),
    insertTeam: db.prepare('INSERT INTO teams (id, room_id, slot, name, pin, ready) VALUES (?, ?, ?, ?, ?, 0)'),
    teamsByRoom: db.prepare('SELECT * FROM teams WHERE room_id = ? ORDER BY slot'),
    teamById: db.prepare('SELECT * FROM teams WHERE id = ?'),
    teamByPin: db.prepare('SELECT * FROM teams WHERE room_id = ? AND pin = ?'),
    renameTeam: db.prepare('UPDATE teams SET name = ? WHERE id = ? AND room_id = ?'),
    setReady: db.prepare('UPDATE teams SET ready = ? WHERE id = ? AND room_id = ?'),
    insertRound: db.prepare('INSERT INTO rounds (id, room_id, question_index, kind, started_at, deadline_at) VALUES (?, ?, ?, ?, ?, ?)'),
    roundById: db.prepare('SELECT * FROM rounds WHERE id = ?'),
    roundsByRoom: db.prepare('SELECT * FROM rounds WHERE room_id = ? ORDER BY started_at'),
    openRounds: db.prepare('SELECT * FROM rounds WHERE closed_at IS NULL'),
    closeRound: db.prepare('UPDATE rounds SET closed_at = ? WHERE id = ? AND closed_at IS NULL'),
    insertSubmission: db.prepare(
      'INSERT INTO submissions (id, round_id, team_id, client_submission_id, answer, received_at, seq) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ),
    submissionsByRound: db.prepare('SELECT * FROM submissions WHERE round_id = ? ORDER BY seq'),
    submissionByTeam: db.prepare('SELECT * FROM submissions WHERE round_id = ? AND team_id = ?'),
    nextSeq: db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM submissions WHERE round_id = ?'),
    scoreSubmission: db.prepare('UPDATE submissions SET is_correct = ?, order_rank = ?, points = ? WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, role, room_id, team_id, created_at) VALUES (?, ?, ?, ?, ?)'),
    sessionByHash: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
  };

  return {
    raw: db,
    transaction: <T>(fn: () => T): T => db.transaction(fn)(),
    insertRoom: (id: string, code: string, phase: RoomPhase, now: number) => q.insertRoom.run(id, code, phase, now),
    roomById: (id: string) => q.roomById.get(id) as RoomRow | undefined,
    roomByCode: (code: string) => q.roomByCode.get(code) as RoomRow | undefined,
    listRooms: () => q.listRooms.all() as RoomRow[],
    setRoomState: (id: string, phase: RoomPhase, questionIndex: number) => q.setRoomState.run(phase, questionIndex, id),
    insertTeam: (t: Omit<TeamRow, 'ready'>) => q.insertTeam.run(t.id, t.room_id, t.slot, t.name, t.pin),
    teamsByRoom: (roomId: string) => q.teamsByRoom.all(roomId) as TeamRow[],
    teamById: (id: string) => q.teamById.get(id) as TeamRow | undefined,
    teamByPin: (roomId: string, pin: string) => q.teamByPin.get(roomId, pin) as TeamRow | undefined,
    renameTeam: (roomId: string, teamId: string, name: string) => q.renameTeam.run(name, teamId, roomId).changes,
    setReady: (roomId: string, teamId: string, ready: boolean) => q.setReady.run(ready ? 1 : 0, teamId, roomId).changes,
    insertRound: (r: Omit<RoundRow, 'closed_at'>) => q.insertRound.run(r.id, r.room_id, r.question_index, r.kind, r.started_at, r.deadline_at),
    roundById: (id: string) => q.roundById.get(id) as RoundRow | undefined,
    roundsByRoom: (roomId: string) => q.roundsByRoom.all(roomId) as RoundRow[],
    openRounds: () => q.openRounds.all() as RoundRow[],
    closeRound: (id: string, now: number) => q.closeRound.run(now, id).changes,
    insertSubmission: (s: Omit<SubmissionRow, 'is_correct' | 'order_rank' | 'points'>) =>
      q.insertSubmission.run(s.id, s.round_id, s.team_id, s.client_submission_id, s.answer, s.received_at, s.seq),
    submissionsByRound: (roundId: string) => q.submissionsByRound.all(roundId) as SubmissionRow[],
    submissionByTeam: (roundId: string, teamId: string) => q.submissionByTeam.get(roundId, teamId) as SubmissionRow | undefined,
    nextSeq: (roundId: string) => (q.nextSeq.get(roundId) as { next: number }).next,
    scoreSubmission: (id: string, correct: boolean, orderRank: number | null, points: number) =>
      q.scoreSubmission.run(correct ? 1 : 0, orderRank, points, id),
    insertSession: (s: SessionRow) => q.insertSession.run(s.token_hash, s.role, s.room_id, s.team_id, s.created_at),
    sessionByHash: (hash: string) => q.sessionByHash.get(hash) as SessionRow | undefined,
    close: () => db.close(),
  };
}
