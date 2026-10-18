import { getElapsedMs } from './machine';
import { QUESTION_DURATION_MS, TEAM_COUNT } from './rules';
import type { GameState, HistoryEntry, QuestionResult, RoundProgress, Team } from './types';

export const STORAGE_KEY = 'hidden-connection/game/v1';
const SCHEMA_VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A state that is safe to store: never contains a running clock (monotonic timestamps do not survive reloads). */
export type PersistedState = Exclude<GameState, { phase: 'running' }>;

interface PersistedEnvelope {
  version: number;
  state: PersistedState;
}

/**
 * Freeze the clock for storage. A running question becomes a paused one at the elapsed time
 * measured right now, so a refresh never consumes additional active time.
 */
export function toPersistable(state: GameState, now: number): PersistedState {
  if (state.phase !== 'running') return state;
  const { runningSince: _runningSince, round, ...rest } = state;
  return {
    ...rest,
    phase: 'paused_for_answer',
    round: { ...round, accumulatedMs: Math.min(getElapsedMs(state, now), QUESTION_DURATION_MS) },
    restored: true,
  };
}

export function saveGame(storage: StorageLike, state: GameState, now: number): void {
  const envelope: PersistedEnvelope = { version: SCHEMA_VERSION, state: toPersistable(state, now) };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Storage full or unavailable: the game keeps working in memory.
  }
}

export function clearGame(storage: StorageLike): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Load and validate a saved game. Returns null when nothing usable is stored. */
export function loadGame(storage: StorageLike, questionCount: number): GameState | null {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== SCHEMA_VERSION) return null;
  const state = parsed.state;
  if (!isValidPersistedState(state, questionCount)) return null;
  return restore(state);
}

/** Bring a stored state into a safe, paused state for the current session. */
export function restore(state: PersistedState): GameState {
  if (state.phase !== 'paused_for_answer') return state;
  if (state.round.accumulatedMs >= QUESTION_DURATION_MS) {
    const results = state.results.slice();
    results[state.questionIndex] = { outcome: 'timeout', elapsedMs: QUESTION_DURATION_MS };
    const { round: _round, restored: _restored, ...rest } = state;
    return { ...rest, phase: 'round_complete', results, lastEvent: { kind: 'timeout' } };
  }
  return { ...state, restored: true };
}

// ---- validation -------------------------------------------------------------

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isFiniteNonNeg(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0;
}

function isTeams(x: unknown): x is Team[] {
  return (
    Array.isArray(x) &&
    x.length === TEAM_COUNT &&
    x.every((t) => isRecord(t) && typeof t.id === 'string' && typeof t.name === 'string') &&
    new Set(x.map((t: Team) => t.id)).size === x.length
  );
}

function isResult(x: unknown, teamIds: Set<string>): x is QuestionResult | null {
  if (x === null) return true;
  if (!isRecord(x)) return false;
  if (x.outcome === 'timeout') return isFiniteNonNeg(x.elapsedMs);
  return (
    x.outcome === 'correct' &&
    typeof x.teamId === 'string' &&
    teamIds.has(x.teamId) &&
    isFiniteNonNeg(x.points) &&
    isFiniteNonNeg(x.cluesRevealed) &&
    isFiniteNonNeg(x.elapsedMs) &&
    typeof x.submittedAnswer === 'string'
  );
}

function isRound(x: unknown, teamIds: Set<string>): x is RoundProgress {
  return (
    isRecord(x) &&
    isFiniteNonNeg(x.accumulatedMs) &&
    Array.isArray(x.ineligible) &&
    x.ineligible.every((id) => typeof id === 'string' && teamIds.has(id))
  );
}

function isBase(x: Record<string, unknown>, questionCount: number): boolean {
  if (!isTeams(x.teams)) return false;
  const teamIds = new Set(x.teams.map((t) => t.id));
  return (
    Array.isArray(x.results) &&
    x.results.length === questionCount &&
    x.results.every((r) => isResult(r, teamIds)) &&
    Number.isInteger(x.questionIndex) &&
    (x.questionIndex as number) >= 0 &&
    (x.questionIndex as number) < questionCount
  );
}

function isPausedSnapshot(x: unknown, questionCount: number): x is HistoryEntry['snapshot'] {
  return (
    isRecord(x) &&
    x.phase === 'paused_for_answer' &&
    isBase(x, questionCount) &&
    isRound(x.round, new Set((x.teams as Team[]).map((t) => t.id)))
  );
}

function isValidPersistedState(x: unknown, questionCount: number): x is PersistedState {
  if (!isRecord(x) || !isBase(x, questionCount)) return false;
  const teamIds = new Set((x.teams as Team[]).map((t) => t.id));
  const historyOk =
    Array.isArray(x.history) &&
    x.history.every(
      (h) => isRecord(h) && typeof h.label === 'string' && isPausedSnapshot(h.snapshot, questionCount),
    );
  if (!historyOk) return false;
  // lastEvent is display-only; drop anything malformed instead of rejecting the save.
  if (!isRecord(x.lastEvent)) x.lastEvent = null;

  switch (x.phase) {
    case 'setup':
    case 'ready':
    case 'final':
      return true;
    case 'round_complete':
      return (x.results as unknown[])[x.questionIndex as number] !== null;
    case 'paused_for_answer':
      return isRound(x.round, teamIds) && (x.results as unknown[])[x.questionIndex as number] === null;
    default:
      return false;
  }
}
