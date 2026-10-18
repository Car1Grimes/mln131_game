import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '../content/questions';
import { createInitialState, transition } from '../game/machine';
import type { GameAction, GameState } from '../game/types';
import { PAUSE_GUARD_MS, isTypingTarget, pauseAvailability } from './interaction';

const ctx = { questions: QUESTIONS };
const run = (state: GameState, ...actions: GameAction[]) => actions.reduce((s, a) => transition(s, a, ctx), state);
const T0 = 10_000;
const running = () =>
  run(createInitialState(QUESTIONS.length), { type: 'START_GAME' }, { type: 'START_QUESTION', now: T0 });

describe('pauseAvailability (double-click guard)', () => {
  it('is guarded right after the clock starts, then available', () => {
    const s = running();
    expect(pauseAvailability(s, T0)).toBe('guarded');
    expect(pauseAvailability(s, T0 + PAUSE_GUARD_MS - 1)).toBe('guarded');
    expect(pauseAvailability(s, T0 + PAUSE_GUARD_MS)).toBe('available');
  });

  it('is guarded again right after a wrong answer resumes the clock', () => {
    const s = run(
      running(),
      { type: 'PAUSE', now: T0 + 5_000 },
      { type: 'SUBMIT_ANSWER', teamId: 'team-1', answer: 'sai', now: T0 + 9_000 },
    );
    expect(pauseAvailability(s, T0 + 9_100)).toBe('guarded');
    expect(pauseAvailability(s, T0 + 9_000 + PAUSE_GUARD_MS)).toBe('available');
  });

  it('reports when no team can answer', () => {
    let s = running();
    for (const [i, team] of s.teams.entries()) {
      s = run(
        s,
        { type: 'PAUSE', now: T0 + 1_000 * (i + 1) },
        { type: 'SUBMIT_ANSWER', teamId: team.id, answer: 'sai', now: T0 + 1_000 * (i + 1) },
      );
    }
    expect(s.phase).toBe('running');
    expect(pauseAvailability(s, T0 + 20_000)).toBe('no_eligible_team');
  });

  it('is not_running outside the running phase', () => {
    expect(pauseAvailability(createInitialState(6), 0)).toBe('not_running');
  });
});

describe('isTypingTarget', () => {
  it('detects form fields', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
