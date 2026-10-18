import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '../content/questions';
import { createInitialState, getElapsedMs, getScores, transition } from './machine';
import { cluesRevealedAt, pointsForClues } from './rules';
import type { GameAction, GameState } from './types';

const ctx = { questions: QUESTIONS };
const run = (state: GameState, ...actions: GameAction[]) =>
  actions.reduce((s, a) => transition(s, a, ctx), state);

const T0 = 1_000; // arbitrary monotonic start
function startedQuestion(): GameState {
  return run(createInitialState(QUESTIONS.length), { type: 'START_GAME' }, { type: 'START_QUESTION', now: T0 });
}

describe('clue timing boundaries', () => {
  it('reveals clues at 0s, 10s, 20s, 30s', () => {
    expect(cluesRevealedAt(0)).toBe(1);
    expect(cluesRevealedAt(9_999)).toBe(1);
    expect(cluesRevealedAt(10_000)).toBe(2);
    expect(cluesRevealedAt(19_999)).toBe(2);
    expect(cluesRevealedAt(20_000)).toBe(3);
    expect(cluesRevealedAt(29_999)).toBe(3);
    expect(cluesRevealedAt(30_000)).toBe(4);
    expect(cluesRevealedAt(59_999)).toBe(4);
  });

  it('awards 40/30/20/10 by clues revealed', () => {
    expect([1, 2, 3, 4].map(pointsForClues)).toEqual([40, 30, 20, 10]);
  });

  it('stays running at 59.999s and ends with 0 points at exactly 60s', () => {
    const s = startedQuestion();
    expect(run(s, { type: 'TICK', now: T0 + 59_999 }).phase).toBe('running');
    const done = run(s, { type: 'TICK', now: T0 + 60_000 });
    expect(done.phase).toBe('round_complete');
    expect(done.results[0]).toEqual({ outcome: 'timeout', elapsedMs: 60_000 });
    expect(Object.values(getScores(done))).toEqual([0, 0, 0, 0, 0]);
  });

  it('pausing after the deadline resolves as a timeout instead of opening the dialog', () => {
    const s = run(startedQuestion(), { type: 'PAUSE', now: T0 + 61_000 });
    expect(s.phase).toBe('round_complete');
  });
});

describe('pause and resume', () => {
  it('derives elapsed time from the monotonic clock', () => {
    const s = startedQuestion();
    expect(getElapsedMs(s, T0 + 12_345)).toBe(12_345);
  });

  it('pause freezes the clock; resume continues without resetting', () => {
    let s = run(startedQuestion(), { type: 'PAUSE', now: T0 + 15_000 });
    expect(s.phase).toBe('paused_for_answer');
    // Time passing while paused does not count.
    expect(getElapsedMs(s, T0 + 100_000)).toBe(15_000);
    s = run(s, { type: 'TICK', now: T0 + 100_000 });
    expect(s.phase).toBe('paused_for_answer');

    s = run(s, { type: 'RESUME', now: T0 + 100_000 });
    expect(s.phase).toBe('running');
    expect(getElapsedMs(s, T0 + 105_000)).toBe(20_000);
    // Deadline is 60s of active play: 45s more after resuming.
    expect(run(s, { type: 'TICK', now: T0 + 144_999 }).phase).toBe('running');
    expect(run(s, { type: 'TICK', now: T0 + 145_000 }).phase).toBe('round_complete');
  });

  it('accumulates across multiple pauses', () => {
    const s = run(
      startedQuestion(),
      { type: 'PAUSE', now: T0 + 5_000 },
      { type: 'RESUME', now: T0 + 50_000 },
      { type: 'PAUSE', now: T0 + 55_000 },
      { type: 'RESUME', now: T0 + 90_000 },
    );
    expect(getElapsedMs(s, T0 + 90_000)).toBe(10_000);
  });

  it('ignores actions that are invalid for the current phase', () => {
    const ready = run(createInitialState(QUESTIONS.length), { type: 'START_GAME' });
    expect(run(ready, { type: 'PAUSE', now: 0 })).toBe(ready);
    expect(run(ready, { type: 'SUBMIT_ANSWER', teamId: 'team-1', answer: 'BAO CẤP', now: 0 })).toBe(ready);
    const running = startedQuestion();
    expect(run(running, { type: 'START_QUESTION', now: 0 })).toBe(running);
    expect(run(running, { type: 'SUBMIT_ANSWER', teamId: 'team-1', answer: 'BAO CẤP', now: 0 })).toBe(running);
  });
});

describe('answers, scoring and eligibility', () => {
  it('correct answer with 1 clue scores 40 and ends the question', () => {
    const s = run(
      startedQuestion(),
      { type: 'PAUSE', now: T0 + 3_000 },
      { type: 'SUBMIT_ANSWER', teamId: 'team-2', answer: 'bao cap', now: T0 + 9_000 },
    );
    expect(s.phase).toBe('round_complete');
    expect(getScores(s)['team-2']).toBe(40);
    expect(s.results[0]).toMatchObject({ outcome: 'correct', teamId: 'team-2', points: 40, cluesRevealed: 1 });
  });

  it.each([
    [9_999, 40],
    [10_000, 30],
    [20_000, 20],
    [30_000, 10],
    [59_000, 10],
  ])('points are based on clues revealed at pause time (%ims → %i)', (pauseAt, points) => {
    const s = run(
      startedQuestion(),
      { type: 'PAUSE', now: T0 + pauseAt },
      // Submitting much later must not change the score: the clock is stopped.
      { type: 'SUBMIT_ANSWER', teamId: 'team-1', answer: 'BAO CẤP', now: T0 + 500_000 },
    );
    expect(getScores(s)['team-1']).toBe(points);
  });

  it('wrong answer marks team ineligible and resumes without resetting elapsed time', () => {
    let s = run(
      startedQuestion(),
      { type: 'PAUSE', now: T0 + 12_000 },
      { type: 'SUBMIT_ANSWER', teamId: 'team-3', answer: 'kinh tế', now: T0 + 40_000 },
    );
    expect(s.phase).toBe('running');
    if (s.phase !== 'running') throw new Error('unreachable');
    expect(s.round.ineligible).toEqual(['team-3']);
    expect(getElapsedMs(s, T0 + 40_000)).toBe(12_000);
    expect(s.lastEvent).toEqual({ kind: 'wrong', teamId: 'team-3', answer: 'kinh tế' });
    expect(Object.values(getScores(s))).toEqual([0, 0, 0, 0, 0]);

    // The ineligible team cannot answer again in this question.
    s = run(s, { type: 'PAUSE', now: T0 + 45_000 });
    const rejected = run(s, { type: 'SUBMIT_ANSWER', teamId: 'team-3', answer: 'BAO CẤP', now: T0 + 46_000 });
    expect(rejected.phase).toBe('paused_for_answer');
    expect(rejected.lastEvent?.kind).toBe('rejected');
    expect(getScores(rejected)['team-3']).toBe(0);

    // Another team can still answer; 17s elapsed → 2 clues → 30 points.
    const ok = run(s, { type: 'SUBMIT_ANSWER', teamId: 'team-4', answer: 'BAO CẤP', now: T0 + 46_000 });
    expect(getScores(ok)['team-4']).toBe(30);
  });

  it('eligibility resets for the next question', () => {
    let s = run(
      startedQuestion(),
      { type: 'PAUSE', now: T0 + 1_000 },
      { type: 'SUBMIT_ANSWER', teamId: 'team-1', answer: 'sai', now: T0 + 2_000 },
      { type: 'PAUSE', now: T0 + 3_000 },
      { type: 'SUBMIT_ANSWER', teamId: 'team-2', answer: 'BAO CAP', now: T0 + 4_000 },
      { type: 'GO_TO_QUESTION', index: 1 },
      { type: 'START_QUESTION', now: T0 + 10_000 },
      { type: 'PAUSE', now: T0 + 11_000 },
    );
    if (s.phase !== 'paused_for_answer') throw new Error('expected paused');
    expect(s.round.ineligible).toEqual([]);
    s = run(s, { type: 'SUBMIT_ANSWER', teamId: 'team-1', answer: 'cach mang thang muoi', now: T0 + 12_000 });
    expect(getScores(s)).toMatchObject({ 'team-1': 40, 'team-2': 40 });
  });

  it('rejects empty answers without changing eligibility', () => {
    const s = run(
      startedQuestion(),
      { type: 'PAUSE', now: T0 + 1_000 },
      { type: 'SUBMIT_ANSWER', teamId: 'team-1', answer: '   ', now: T0 + 2_000 },
    );
    expect(s.phase).toBe('paused_for_answer');
    if (s.phase === 'paused_for_answer') expect(s.round.ineligible).toEqual([]);
  });
});

describe('undo', () => {
  it('undoes a correct-answer award back to the paused dialog state', () => {
    const paused = run(startedQuestion(), { type: 'PAUSE', now: T0 + 22_000 });
    const scored = run(paused, { type: 'SUBMIT_ANSWER', teamId: 'team-5', answer: 'BAO CẤP', now: T0 + 30_000 });
    expect(getScores(scored)['team-5']).toBe(20);

    const undone = run(scored, { type: 'UNDO' });
    expect(undone.phase).toBe('paused_for_answer');
    expect(getScores(undone)['team-5']).toBe(0);
    expect(undone.results[0]).toBeNull();
    expect(getElapsedMs(undone, 0)).toBe(22_000);
    expect(undone.history).toHaveLength(0);
  });

  it('wrong ruling undo restores the team to eligible', () => {
    const s = run(
      startedQuestion(),
      { type: 'PAUSE', now: T0 + 5_000 },
      { type: 'SUBMIT_ANSWER', teamId: 'team-1', answer: 'nope', now: T0 + 6_000 },
      { type: 'UNDO' },
    );
    expect(s.phase).toBe('paused_for_answer');
    if (s.phase === 'paused_for_answer') expect(s.round.ineligible).toEqual([]);
  });

  it('does nothing with empty history', () => {
    const s = startedQuestion();
    expect(run(s, { type: 'UNDO' })).toBe(s);
  });
});

describe('question navigation, final and reset', () => {
  it('changing question mid-play discards progress and opens the target as ready', () => {
    const s = run(startedQuestion(), { type: 'GO_TO_QUESTION', index: 3 });
    expect(s.phase).toBe('ready');
    expect(s.questionIndex).toBe(3);
    expect(s.results[0]).toBeNull();
  });

  it('a completed question reopens as round_complete (cannot be replayed)', () => {
    const s = run(
      startedQuestion(),
      { type: 'TICK', now: T0 + 60_000 },
      { type: 'GO_TO_QUESTION', index: 1 },
      { type: 'GO_TO_QUESTION', index: 0 },
    );
    expect(s.phase).toBe('round_complete');
  });

  it('rejects out-of-range question indexes', () => {
    const s = startedQuestion();
    expect(run(s, { type: 'GO_TO_QUESTION', index: 6 })).toBe(s);
    expect(run(s, { type: 'GO_TO_QUESTION', index: -1 })).toBe(s);
  });

  it('team names are editable in setup and trimmed/defaulted on start', () => {
    const s = run(
      createInitialState(QUESTIONS.length),
      { type: 'SET_TEAM_NAME', teamId: 'team-1', name: '  Sao Đỏ  ' },
      { type: 'SET_TEAM_NAME', teamId: 'team-2', name: '   ' },
      { type: 'START_GAME' },
    );
    expect(s.teams[0]?.name).toBe('Sao Đỏ');
    expect(s.teams[1]?.name).toBe('Đội 2');
  });

  it('reaches final and reset keeps team names but clears scores', () => {
    let s = run(
      startedQuestion(),
      { type: 'PAUSE', now: T0 + 1 },
      { type: 'SUBMIT_ANSWER', teamId: 'team-1', answer: 'BAO CẤP', now: T0 + 2 },
      { type: 'SHOW_FINAL' },
    );
    expect(s.phase).toBe('final');
    s = run(s, { type: 'RESET' });
    expect(s.phase).toBe('setup');
    expect(getScores(s)['team-1']).toBe(0);
    expect(s.teams).toHaveLength(5);
  });
});

describe('regressions found in browser QA (Checkpoint B)', () => {
  it('PAUSE is ignored once every team is ineligible; the clock runs out normally', () => {
    let s = startedQuestion();
    for (const [i, team] of s.teams.entries()) {
      s = run(
        s,
        { type: 'PAUSE', now: T0 + 1_000 * (i + 1) },
        { type: 'SUBMIT_ANSWER', teamId: team.id, answer: 'sai', now: T0 + 1_000 * (i + 1) },
      );
    }
    expect(s.phase).toBe('running');
    const afterPause = run(s, { type: 'PAUSE', now: T0 + 20_000 });
    expect(afterPause).toBe(s);
    expect(getElapsedMs(afterPause, T0 + 20_000)).toBe(20_000);
    const ended = run(s, { type: 'TICK', now: T0 + 60_000 });
    expect(ended.phase).toBe('round_complete');
    expect(ended.results[0]).toEqual({ outcome: 'timeout', elapsedMs: 60_000 });
  });

  it('a pause attempted after the deadline still times out even with no eligible teams', () => {
    let s = startedQuestion();
    for (const team of s.teams) {
      s = run(s, { type: 'PAUSE', now: T0 + 1_000 }, { type: 'SUBMIT_ANSWER', teamId: team.id, answer: 'x', now: T0 + 1_000 });
    }
    expect(run(s, { type: 'PAUSE', now: T0 + 61_000 }).phase).toBe('round_complete');
  });

  it('team names longer than the limit are truncated, not rejected', () => {
    const long = 'Đội Sao Đỏ Rực Rỡ Của Lớp Kinh Tế Chính Trị Mác Lênin';
    const s = run(createInitialState(QUESTIONS.length), { type: 'SET_TEAM_NAME', teamId: 'team-1', name: long });
    expect(s.teams[0]?.name).toBe(long.slice(0, 40));
  });
});
