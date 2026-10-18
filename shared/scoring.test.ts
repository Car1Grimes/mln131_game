import { describe, expect, it } from 'vitest';
import { POINTS_BY_ORDER, computeStandings, scoreRound, tiedLeaders, type RoundOutcome } from './scoring';

const TEAMS = ['t1', 't2', 't3', 't4', 't5'];

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]));
}

describe('scoreRound', () => {
  const perms = permutations(TEAMS);

  it('covers all 120 receipt orders', () => {
    expect(perms).toHaveLength(120);
  });

  it('all correct: points follow server receipt order for every permutation', () => {
    for (const order of perms) {
      const scored = scoreRound(order.map((teamId, i) => ({ teamId, seq: i + 1, correct: true })));
      order.forEach((teamId, i) => {
        const r = scored.find((s) => s.teamId === teamId)!;
        expect(r.orderRank).toBe(i + 1);
        expect(r.points).toBe(POINTS_BY_ORDER[i]);
      });
    }
  });

  it('every permutation × every correctness mask (3840 cases): only correct answers score, in order', () => {
    for (const order of perms) {
      for (let mask = 0; mask < 32; mask++) {
        const subs = order.map((teamId, i) => ({ teamId, seq: i + 1, correct: Boolean(mask & (1 << TEAMS.indexOf(teamId))) }));
        const scored = scoreRound(subs);
        const expectedCorrect = subs.filter((s) => s.correct).map((s) => s.teamId);
        for (const s of scored) {
          const pos = expectedCorrect.indexOf(s.teamId);
          expect(s.orderRank).toBe(pos === -1 ? null : pos + 1);
          expect(s.points).toBe(pos === -1 ? 0 : POINTS_BY_ORDER[pos]);
        }
        expect(scored.reduce((a, s) => a + s.points, 0)).toBe(POINTS_BY_ORDER.slice(0, expectedCorrect.length).reduce((a, b) => a + b, 0));
      }
    }
  });

  it('uses receipt sequence, not array order', () => {
    const scored = scoreRound([
      { teamId: 't1', seq: 9, correct: true },
      { teamId: 't2', seq: 3, correct: true },
    ]);
    expect(scored.find((s) => s.teamId === 't2')!.points).toBe(50);
    expect(scored.find((s) => s.teamId === 't1')!.points).toBe(40);
  });

  it('incorrect answers do not consume a ranking position', () => {
    const scored = scoreRound([
      { teamId: 't1', seq: 1, correct: false },
      { teamId: 't2', seq: 2, correct: true },
    ]);
    expect(scored).toEqual([
      { teamId: 't1', correct: false, orderRank: null, points: 0 },
      { teamId: 't2', correct: true, orderRank: 1, points: 50 },
    ]);
  });

  it('non-submitting teams are simply absent (0 points)', () => {
    const scored = scoreRound([{ teamId: 't3', seq: 1, correct: true }]);
    expect(scored).toHaveLength(1);
  });

  it('rejects duplicate sequences or two submissions from one team', () => {
    expect(() => scoreRound([{ teamId: 't1', seq: 1, correct: true }, { teamId: 't2', seq: 1, correct: true }])).toThrow();
    expect(() => scoreRound([{ teamId: 't1', seq: 1, correct: true }, { teamId: 't1', seq: 2, correct: true }])).toThrow();
  });
});

describe('computeStandings', () => {
  const teams = TEAMS.map((id, i) => ({ id, name: `Đội ${i + 1}` }));
  const round = (results: [string, boolean, number, number | null][], kind: RoundOutcome['kind'] = 'main'): RoundOutcome => ({
    kind,
    results: results.map(([teamId, correct, points, responseMs]) => ({ teamId, correct, points, responseMs })),
  });

  it('sums points across rounds and ranks with shared ranks for ties', () => {
    const s = computeStandings(teams, [
      round([['t1', true, 50, 1000], ['t2', true, 40, 2000]]),
      round([['t2', true, 50, 500], ['t3', true, 40, 900]]),
    ]);
    expect(s.map((x) => [x.teamId, x.score, x.rank])).toEqual([
      ['t2', 90, 1],
      ['t1', 50, 2],
      ['t3', 40, 3],
      ['t4', 0, 4],
      ['t5', 0, 4],
    ]);
  });

  it('flags tied leaders for a tie-break', () => {
    const s = computeStandings(teams, [round([['t1', true, 50, 1000]]), round([['t2', true, 50, 1000]])]);
    expect(tiedLeaders(s).map((x) => x.teamId)).toEqual(['t1', 't2']);
  });

  it('tie-break rounds separate tied teams without changing their score', () => {
    const s = computeStandings(teams, [
      round([['t1', true, 50, 1000]]),
      round([['t2', true, 50, 1000]]),
      round([['t2', true, 50, 300]], 'tiebreak'),
    ]);
    expect(s[0]).toMatchObject({ teamId: 't2', score: 50, tiebreakScore: 50, rank: 1 });
    expect(s[1]).toMatchObject({ teamId: 't1', score: 50, rank: 2 });
    expect(tiedLeaders(s)).toEqual([]);
  });

  it('optional speed / correct-count tie-break keys', () => {
    const outcomes = [round([['t1', true, 50, 3000]]), round([['t2', true, 50, 1000]])];
    expect(computeStandings(teams, outcomes, ['speed'])[0]!.teamId).toBe('t2');
    expect(computeStandings(teams, outcomes, ['correctCount'])[0]!.rank).toBe(1);
    expect(computeStandings(teams, outcomes, ['correctCount'])[1]!.rank).toBe(1);
  });
});
