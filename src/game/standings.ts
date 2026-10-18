import { teamName } from './machine';
import type { GameState, TeamId } from './types';

export interface Standing {
  teamId: TeamId;
  name: string;
  score: number;
  /** Competition ranking: tied scores share a rank (1, 1, 3, …). */
  rank: number;
}

/**
 * Ranked standings derived from question results (the single source of truth for scores).
 * `excludeQuestion` gives the standings as they were before that question's result.
 */
export function computeStandings(state: GameState, opts: { excludeQuestion?: number } = {}): Standing[] {
  const scores = new Map<TeamId, number>(state.teams.map((t) => [t.id, 0]));
  state.results.forEach((result, i) => {
    if (i === opts.excludeQuestion || result?.outcome !== 'correct') return;
    if (scores.has(result.teamId)) scores.set(result.teamId, (scores.get(result.teamId) ?? 0) + result.points);
  });
  // Stable sort keeps the original team order for ties.
  const sorted = state.teams
    .map((t) => ({ teamId: t.id, name: teamName(state, t.id), score: scores.get(t.id) ?? 0 }))
    .sort((a, b) => b.score - a.score);
  return sorted.map((s, i) => {
    const firstWithScore = sorted.findIndex((x) => x.score === s.score);
    return { ...s, rank: (firstWithScore === -1 ? i : firstWithScore) + 1 };
  });
}

/** Teams sharing first place with a positive score. Empty when nobody has scored. */
export function winners(standings: Standing[]): Standing[] {
  return standings.filter((s) => s.rank === 1 && s.score > 0);
}
