-- Verbatim M1 schema (commit 0586f22, server/db.ts) used to test the M2.2 migration.

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

