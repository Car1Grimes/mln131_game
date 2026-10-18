// Scoring and ranking. Pure functions shared by the server (authoritative computation) and tests.
// The client only ever *displays* results computed by the server.

/** Points for the 1st..5th correct answer, by authoritative server receipt order. */
export const POINTS_BY_ORDER = [50, 40, 30, 20, 10] as const;

export type RoundKind = 'main' | 'tiebreak';

export interface SubmissionForScoring {
  teamId: string;
  /** Server-assigned receipt sequence within the round (strictly increasing). */
  seq: number;
  correct: boolean;
}

export interface ScoredSubmission {
  teamId: string;
  correct: boolean;
  /** 1-based position among correct submissions; null when incorrect. */
  orderRank: number | null;
  points: number;
}

/**
 * Score one round. Only correct submissions earn points, ranked by server receipt order.
 * Incorrect submissions get 0; teams without a submission are simply absent (0 points).
 */
export function scoreRound(submissions: readonly SubmissionForScoring[]): ScoredSubmission[] {
  const seqs = new Set<number>();
  const teams = new Set<string>();
  for (const s of submissions) {
    if (seqs.has(s.seq)) throw new Error(`duplicate receipt sequence ${s.seq}`);
    if (teams.has(s.teamId)) throw new Error(`team ${s.teamId} has more than one submission`);
    seqs.add(s.seq);
    teams.add(s.teamId);
  }
  const correctInOrder = submissions.filter((s) => s.correct).sort((a, b) => a.seq - b.seq);
  const rankOf = new Map(correctInOrder.map((s, i) => [s.teamId, i + 1]));
  return [...submissions]
    .sort((a, b) => a.seq - b.seq)
    .map((s) => {
      const orderRank = rankOf.get(s.teamId) ?? null;
      return {
        teamId: s.teamId,
        correct: s.correct,
        orderRank,
        points: orderRank === null ? 0 : (POINTS_BY_ORDER[orderRank - 1] ?? 0),
      };
    });
}

export interface RoundOutcome {
  kind: RoundKind;
  results: readonly { teamId: string; correct: boolean; points: number; responseMs: number | null }[];
}

export interface Standing {
  teamId: string;
  name: string;
  /** Points from main rounds: the score shown on the leaderboard. */
  score: number;
  /** Points from tie-break rounds; used only to separate teams tied on `score`. */
  tiebreakScore: number;
  correctCount: number;
  /** Sum of response times of correct main-round answers (available as an optional tie-break key). */
  totalCorrectMs: number;
  /** Competition rank (1, 1, 3, …) after applying the tie-break policy. */
  rank: number;
}

/**
 * Tie-break policy: ordered keys applied after `score`. The default only uses explicit tie-break
 * rounds; 'correctCount' and 'speed' are available if the organisers decide to use them.
 */
export type TiebreakKey = 'tiebreakScore' | 'correctCount' | 'speed';
export const DEFAULT_TIEBREAK: readonly TiebreakKey[] = ['tiebreakScore'];

export function computeStandings(
  teams: readonly { id: string; name: string }[],
  outcomes: readonly RoundOutcome[],
  tiebreak: readonly TiebreakKey[] = DEFAULT_TIEBREAK,
): Standing[] {
  const base = new Map(
    teams.map((t, order) => [t.id, { order, s: { teamId: t.id, name: t.name, score: 0, tiebreakScore: 0, correctCount: 0, totalCorrectMs: 0, rank: 0 } }]),
  );
  for (const o of outcomes) {
    for (const r of o.results) {
      const entry = base.get(r.teamId);
      if (!entry) continue;
      if (o.kind === 'tiebreak') {
        entry.s.tiebreakScore += r.points;
      } else {
        entry.s.score += r.points;
        if (r.correct) {
          entry.s.correctCount += 1;
          entry.s.totalCorrectMs += r.responseMs ?? 0;
        }
      }
    }
  }
  const compare = (a: Standing, b: Standing): number => {
    if (a.score !== b.score) return b.score - a.score;
    for (const key of tiebreak) {
      if (key === 'tiebreakScore' && a.tiebreakScore !== b.tiebreakScore) return b.tiebreakScore - a.tiebreakScore;
      if (key === 'correctCount' && a.correctCount !== b.correctCount) return b.correctCount - a.correctCount;
      if (key === 'speed' && a.totalCorrectMs !== b.totalCorrectMs) return a.totalCorrectMs - b.totalCorrectMs;
    }
    return 0;
  };
  // Stable order for display: equal teams keep their slot order.
  const sorted = [...base.values()].sort((x, y) => compare(x.s, y.s) || x.order - y.order).map((x) => x.s);
  sorted.forEach((s, i) => {
    const prev = sorted[i - 1];
    s.rank = prev && compare(prev, s) === 0 ? prev.rank : i + 1;
  });
  return sorted;
}

/** Teams sharing first place with a positive score: a tie-break round would be needed. */
export function tiedLeaders(standings: readonly Standing[]): Standing[] {
  const leaders = standings.filter((s) => s.rank === 1 && s.score > 0);
  return leaders.length > 1 ? leaders : [];
}

/**
 * Teams on the winner podium: only positive scores, ranks 1–3 (competition ranks, so ties are kept
 * together and can exceed three entries). Zero-point teams never get a podium place; they still
 * appear in the full leaderboard. Empty when nobody has scored.
 */
export function podiumStandings(standings: readonly Standing[]): Standing[] {
  return standings.filter((s) => s.score > 0 && s.rank <= 3);
}
