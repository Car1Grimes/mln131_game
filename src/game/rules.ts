export const TEAM_COUNT = 5;
export const QUESTION_DURATION_MS = 60_000;
export const CLUE_INTERVAL_MS = 10_000;
export const CLUE_COUNT = 4;
/** Points indexed by (number of clues revealed - 1). */
export const POINTS_BY_CLUES = [40, 30, 20, 10] as const;
export const MAX_HISTORY = 50;
export const MAX_TEAM_NAME_LENGTH = 40;

/** Clue #1 at 0s, #2 at 10s, #3 at 20s, #4 at 30s. */
export function cluesRevealedAt(elapsedMs: number): number {
  if (!(elapsedMs > 0)) return 1;
  return Math.min(CLUE_COUNT, Math.floor(elapsedMs / CLUE_INTERVAL_MS) + 1);
}

export function pointsForClues(cluesRevealed: number): number {
  return POINTS_BY_CLUES[cluesRevealed - 1] ?? 0;
}

export function isTimeUp(elapsedMs: number): boolean {
  return elapsedMs >= QUESTION_DURATION_MS;
}

export function remainingMs(elapsedMs: number): number {
  return Math.max(0, QUESTION_DURATION_MS - elapsedMs);
}

export function defaultTeamName(index: number): string {
  return `Đội ${index + 1}`;
}
