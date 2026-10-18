import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '../content/questions';
import { createInitialState, transition } from './machine';
import { computeStandings, winners } from './standings';
import type { GameAction, GameState } from './types';

const ctx = { questions: QUESTIONS };
const run = (state: GameState, ...actions: GameAction[]) => actions.reduce((s, a) => transition(s, a, ctx), state);

function award(state: GameState, q: number, teamId: string, pauseAt: number): GameState {
  return run(
    state,
    { type: 'GO_TO_QUESTION', index: q },
    { type: 'START_QUESTION', now: 0 },
    { type: 'PAUSE', now: pauseAt },
    { type: 'SUBMIT_ANSWER', teamId, answer: QUESTIONS[q]!.answer, now: pauseAt },
  );
}

const ready = () => run(createInitialState(QUESTIONS.length), { type: 'START_GAME' });

describe('computeStandings', () => {
  it('everyone shares rank 1 at the start, in team order', () => {
    const s = computeStandings(ready());
    expect(s.map((x) => x.rank)).toEqual([1, 1, 1, 1, 1]);
    expect(s.map((x) => x.teamId)).toEqual(['team-1', 'team-2', 'team-3', 'team-4', 'team-5']);
    expect(winners(s)).toEqual([]);
  });

  it('ranks by score with competition ranking for ties', () => {
    let st = award(ready(), 0, 'team-3', 1_000); // 40
    st = award(st, 1, 'team-5', 15_000); // 30
    st = award(st, 2, 'team-2', 15_000); // 30
    const s = computeStandings(st);
    expect(s.map((x) => [x.teamId, x.score, x.rank])).toEqual([
      ['team-3', 40, 1],
      ['team-2', 30, 2],
      ['team-5', 30, 2],
      ['team-1', 0, 4],
      ['team-4', 0, 4],
    ]);
    expect(winners(s).map((w) => w.teamId)).toEqual(['team-3']);
  });

  it('can exclude one question to show the standings before it', () => {
    let st = award(ready(), 0, 'team-1', 1_000);
    st = award(st, 1, 'team-2', 1_000);
    const before = computeStandings(st, { excludeQuestion: 1 });
    expect(before.find((x) => x.teamId === 'team-2')?.score).toBe(0);
    expect(before[0]).toMatchObject({ teamId: 'team-1', score: 40, rank: 1 });
  });

  it('reports tied winners', () => {
    let st = award(ready(), 0, 'team-1', 1_000);
    st = award(st, 1, 'team-4', 1_000);
    expect(winners(computeStandings(st)).map((w) => w.teamId)).toEqual(['team-1', 'team-4']);
  });
});
