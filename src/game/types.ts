export type TeamId = string;

export interface Team {
  id: TeamId;
  name: string;
}

export interface Clue {
  /** Short caption shown on the placeholder panel. */
  label: string;
  /** Local image path (relative to /public). Omit to render a neutral placeholder panel. */
  imageSrc?: string;
  alt: string;
  /** Where the image comes from. Shown only on the image-credits screen, never during play. */
  credit?: ClueCredit;
}

export interface ClueCredit {
  /** Photographer, agency or creator as credited by the source. */
  author: string;
  /** Publication, archive or site name. */
  source: string;
  url: string;
  /** Short usage/accuracy note, e.g. licence or "museum reconstruction". */
  note?: string;
}

export interface Question {
  id: string;
  /** The single canonical answer. Matching is normalized; no synonyms are accepted. */
  answer: string;
  clues: readonly [Clue, Clue, Clue, Clue];
}

export type QuestionResult =
  | {
      outcome: 'correct';
      teamId: TeamId;
      points: number;
      cluesRevealed: number;
      elapsedMs: number;
      submittedAnswer: string;
    }
  | { outcome: 'timeout'; elapsedMs: number };

export type LastEvent =
  | { kind: 'wrong'; teamId: TeamId; answer: string }
  | { kind: 'correct'; teamId: TeamId; points: number }
  | { kind: 'timeout' }
  | { kind: 'undo'; label: string }
  | { kind: 'rejected'; message: string };

/** Progress within the question currently being played. */
export interface RoundProgress {
  /** Active elapsed time accumulated before the current running segment. */
  accumulatedMs: number;
  ineligible: TeamId[];
}

interface BaseState {
  teams: Team[];
  /** One slot per question; null means not yet completed. Scores are derived from this. */
  results: (QuestionResult | null)[];
  questionIndex: number;
  history: HistoryEntry[];
  lastEvent: LastEvent | null;
}

export interface SetupState extends BaseState {
  phase: 'setup';
}
export interface ReadyState extends BaseState {
  phase: 'ready';
}
export interface RunningState extends BaseState {
  phase: 'running';
  round: RoundProgress;
  /** Monotonic timestamp (performance.now()) when the current running segment began. Never persisted. */
  runningSince: number;
}
export interface PausedState extends BaseState {
  phase: 'paused_for_answer';
  round: RoundProgress;
  /** True when this pause was created by restoring after a page refresh. */
  restored: boolean;
}
export interface RoundCompleteState extends BaseState {
  phase: 'round_complete';
}
export interface FinalState extends BaseState {
  phase: 'final';
}

export type GameState =
  | SetupState
  | ReadyState
  | RunningState
  | PausedState
  | RoundCompleteState
  | FinalState;

export type Phase = GameState['phase'];

/** Snapshot taken right before an admin scoring decision, used for undo. */
export interface HistoryEntry {
  label: string;
  snapshot: Omit<PausedState, 'history'>;
}

export type GameAction =
  | { type: 'SET_TEAM_NAME'; teamId: TeamId; name: string }
  | { type: 'START_GAME' }
  | { type: 'START_QUESTION'; now: number }
  | { type: 'TICK'; now: number }
  | { type: 'PAUSE'; now: number }
  | { type: 'RESUME'; now: number }
  | { type: 'SUBMIT_ANSWER'; teamId: TeamId; answer: string; now: number }
  | { type: 'UNDO' }
  | { type: 'GO_TO_QUESTION'; index: number }
  | { type: 'SHOW_FINAL' }
  | { type: 'RESET' };
