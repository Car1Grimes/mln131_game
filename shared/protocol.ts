// Wire protocol between the server and the clients. Views are role-specific projections built by
// the server; nothing here ever carries a canonical answer or correctness before a round closes.
import type { ReleasedScene } from './scenes';
import type { RoundKind, Standing } from './scoring';

export const TEAM_COUNT = 5;

export type RoomPhase = 'lobby' | 'active' | 'revealed' | 'ready' | 'finished';

export interface RoundView {
  id: string;
  kind: RoundKind;
  questionNumber: number;
  totalQuestions: number;
  startedAt: number;
  deadlineAt: number;
  durationMs: number;
  /** Letters per word of the answer (shape only). */
  answerPattern: number[];
  /** Only scenes already released by the server. */
  scenes: ReleasedScene[];
}

export interface RevealedSubmission {
  teamId: string;
  teamName: string;
  answer: string | null;
  correct: boolean;
  orderRank: number | null;
  points: number;
  /** Server receipt time relative to round start. */
  responseMs: number | null;
}

/** Only present after the server has closed the round. */
export interface RoundReveal {
  roundId: string;
  questionNumber: number;
  canonicalAnswer: string;
  submissions: RevealedSubmission[];
  standingsBefore: Standing[];
  standingsAfter: Standing[];
}

export interface RoomSummary {
  code: string;
  phase: RoomPhase;
  /** 0-based index of the current/next question. */
  questionIndex: number;
  totalQuestions: number;
}

export interface AdminTeamView {
  id: string;
  slot: number;
  name: string;
  pin: string;
  ready: boolean;
  connected: boolean;
  devices: number;
  /** Whether the team has submitted in the active round. Never the answer or its correctness. */
  submitted: boolean;
}

export interface AdminView {
  role: 'admin';
  room: RoomSummary;
  /** Projector (screen role) status for this room. */
  projector: { connected: number; activeSessions: number };
  teams: AdminTeamView[];
  round: RoundView | null;
  submittedCount: number;
  reveal: RoundReveal | null;
  standings: Standing[];
  serverNow: number;
}

export interface TeamView {
  role: 'team';
  room: RoomSummary;
  me: {
    id: string;
    name: string;
    ready: boolean;
    /** Own submission in the active/last round: text echo and receipt time only, never correctness. */
    submission: { answer: string; receivedAt: number } | null;
  };
  teams: { id: string; name: string }[];
  round: RoundView | null;
  reveal: RoundReveal | null;
  standings: Standing[];
  serverNow: number;
}

/**
 * Read-only projector view. Never contains PINs, admin data, answers, answer texts, correctness,
 * points of an open round, or which team has submitted (only the aggregate count, so the
 * submission order cannot be followed). After the server closes a round it carries the same
 * RoundReveal everyone receives.
 */
export interface ScreenView {
  role: 'screen';
  room: RoomSummary;
  teams: { id: string; slot: number; name: string; connected: boolean; ready: boolean }[];
  round: RoundView | null;
  submittedCount: number;
  reveal: RoundReveal | null;
  standings: Standing[];
  serverNow: number;
}

export type RoomView = AdminView | TeamView | ScreenView;

// ---- client → server events (all acknowledged) ----

export type Ack<T = object> = (result: ({ ok: true } & T) | { ok: false; error: ErrorCode; message?: string }) => void;

export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'wrong_phase'
  | 'round_closed'
  | 'already_submitted'
  | 'rate_limited';

export interface ClientToServerEvents {
  'time:sync': (t0: number, ack: (r: { t0: number; server: number }) => void) => void;
  'team:ready': (payload: { ready: boolean }, ack: Ack) => void;
  'team:submit': (payload: { submissionId: string; answer: string }, ack: Ack<{ receivedAt: number; duplicate: boolean }>) => void;
  'admin:rename': (payload: { teamId: string; name: string }, ack: Ack) => void;
  'admin:start': (payload: Record<string, never>, ack: Ack) => void;
  'admin:advance': (payload: Record<string, never>, ack: Ack) => void;
}

export interface ServerToClientEvents {
  state: (view: RoomView) => void;
}

export const MAX_ANSWER_LENGTH = 120;
export const MAX_TEAM_NAME_LENGTH = 40;
