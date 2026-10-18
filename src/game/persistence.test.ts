import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '../content/questions';
import { createInitialState, getElapsedMs, getScores, transition } from './machine';
import { STORAGE_KEY, loadGame, saveGame, toPersistable, type StorageLike } from './persistence';
import type { GameAction, GameState } from './types';

const ctx = { questions: QUESTIONS };
const run = (state: GameState, ...actions: GameAction[]) =>
  actions.reduce((s, a) => transition(s, a, ctx), state);

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const T0 = 5_000;
const started = () =>
  run(createInitialState(QUESTIONS.length), { type: 'START_GAME' }, { type: 'START_QUESTION', now: T0 });

describe('persistence', () => {
  it('returns null when nothing is stored', () => {
    expect(loadGame(memoryStorage(), QUESTIONS.length)).toBeNull();
  });

  it('round-trips a ready state', () => {
    const storage = memoryStorage();
    const s = run(createInitialState(QUESTIONS.length), { type: 'START_GAME' });
    saveGame(storage, s, 0);
    expect(loadGame(storage, QUESTIONS.length)).toEqual(s);
  });

  it('never stores a running clock; a running question restores paused at the saved elapsed time', () => {
    const storage = memoryStorage();
    const s = started();
    saveGame(storage, s, T0 + 23_456);
    expect(storage.data.get(STORAGE_KEY)).not.toContain('runningSince');

    const restored = loadGame(storage, QUESTIONS.length)!;
    expect(restored.phase).toBe('paused_for_answer');
    if (restored.phase !== 'paused_for_answer') throw new Error('unreachable');
    expect(restored.restored).toBe(true);
    // A new session's monotonic clock starts near 0; no extra active time is consumed.
    expect(getElapsedMs(restored, 0)).toBe(23_456);
    expect(getElapsedMs(restored, 999_999)).toBe(23_456);

    // Resuming continues from the saved point using the new session's clock.
    const resumed = run(restored, { type: 'RESUME', now: 100 });
    expect(getElapsedMs(resumed, 100 + 6_544)).toBe(30_000);
  });

  it('restores ineligible teams and scores', () => {
    const storage = memoryStorage();
    const s = run(
      started(),
      { type: 'PAUSE', now: T0 + 1_000 },
      { type: 'SUBMIT_ANSWER', teamId: 'team-2', answer: 'wrong', now: T0 + 2_000 },
    );
    saveGame(storage, s, T0 + 4_000);
    const restored = loadGame(storage, QUESTIONS.length)!;
    if (restored.phase !== 'paused_for_answer') throw new Error('expected paused');
    expect(restored.round.ineligible).toEqual(['team-2']);
    expect(getElapsedMs(restored, 0)).toBe(3_000);
    expect(restored.history).toHaveLength(1);

    const undone = run(restored, { type: 'UNDO' });
    if (undone.phase !== 'paused_for_answer') throw new Error('expected paused');
    expect(undone.round.ineligible).toEqual([]);
  });

  it('restores completed results and derived scores', () => {
    const storage = memoryStorage();
    const s = run(
      started(),
      { type: 'PAUSE', now: T0 + 11_000 },
      { type: 'SUBMIT_ANSWER', teamId: 'team-4', answer: 'Bao Cấp', now: T0 + 12_000 },
    );
    saveGame(storage, s, 0);
    const restored = loadGame(storage, QUESTIONS.length)!;
    expect(restored.phase).toBe('round_complete');
    expect(getScores(restored)['team-4']).toBe(30);
  });

  it('a save at/after the deadline restores as a timed-out question', () => {
    const storage = memoryStorage();
    saveGame(storage, started(), T0 + 75_000);
    const restored = loadGame(storage, QUESTIONS.length)!;
    expect(restored.phase).toBe('round_complete');
    expect(restored.results[0]).toEqual({ outcome: 'timeout', elapsedMs: 60_000 });
  });

  it('toPersistable leaves non-running states untouched', () => {
    const s = run(started(), { type: 'PAUSE', now: T0 + 1 });
    expect(toPersistable(s, 1e9)).toBe(s);
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['wrong version', JSON.stringify({ version: 99, state: {} })],
    ['missing teams', JSON.stringify({ version: 1, state: { phase: 'ready', results: [], questionIndex: 0, history: [] } })],
  ])('ignores corrupt data (%s)', (_label, raw) => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, raw);
    expect(loadGame(storage, QUESTIONS.length)).toBeNull();
  });

  it('rejects a stored running phase and mismatched question counts', () => {
    const storage = memoryStorage();
    const s = run(createInitialState(QUESTIONS.length), { type: 'START_GAME' });
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, state: { ...s, phase: 'running' } }));
    expect(loadGame(storage, QUESTIONS.length)).toBeNull();
    saveGame(storage, s, 0);
    expect(loadGame(storage, QUESTIONS.length + 1)).toBeNull();
  });

  it('survives a throwing storage', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {},
    };
    expect(() => saveGame(throwing, started(), 0)).not.toThrow();
    expect(loadGame(throwing, QUESTIONS.length)).toBeNull();
  });
});
