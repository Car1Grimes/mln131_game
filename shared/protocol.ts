// Wire protocol between the server and the clients. Views are role-specific projections built by
// the server; nothing here ever carries a canonical answer or correctness before a round closes.
import type { ReleasedScene } from './scenes';
import type { RoundKind, Standing } from './scoring';

export const TEAM_COUNT = 5;

/**
 * `intro` is the 5-second preparation before a round. It is derived by the server (see engine.ts):
 * the round is created at the start command with its active start (`startedAt`) 5 s in the future.
 */
export type RoomPhase = 'lobby' | 'intro' | 'active' | 'revealed' | 'ready' | 'finished';

/** Server-authoritative preparation time between the start command and the active round. */
export const INTRO_DURATION_MS = 5_000;

/**
 * Public preparation for the round that is about to begin. Only present while the room is in `intro`:
 * no round id, scene, answer shape or media reference — only the orientation question.
 */
export interface IntroView {
  questionNumber: number;
  totalQuestions: number;
  /** Topic-orienting question of this round (never the answer). */
  prompt: string;
  /** Server time the intro began (the start command). */
  introStartedAt: number;
  /** Server time the active round begins (= RoundView.startedAt). */
  startsAt: number;
}

export interface RoundView {
  id: string;
  kind: RoundKind;
  questionNumber: number;
  totalQuestions: number;
  /** Topic-orienting question, shown above the scene stage during the round. */
  prompt: string;
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

/** Where a source appears in the round (scene release offset and the clip it is in). */
export interface AttributionUse {
  sceneId: string;
  atMs: number;
  clip: string;
}

/**
 * One credited source of a closed round ("Nguồn tư liệu"). Built server-side from the production
 * manifests and the source registry; sent only inside a RoundReveal.
 */
export interface AttributionEntry {
  id: string;
  kind: 'photo' | 'map' | 'font' | 'own';
  creator: string;
  title: string;
  sourceUrl: string | null;
  licence: string;
  licenceUrl: string | null;
  /** 'pd-qualified' = public domain only in a named jurisdiction (never shown as worldwide PD). */
  rights: 'cc' | 'pd' | 'pd-qualified' | 'open-font' | 'own' | 'unresolved';
  rightsNote: string | null;
  modifications: string[];
  usedIn: AttributionUse[];
}

export interface RoundAttribution {
  entries: AttributionEntry[];
  /** Clips that are share-alike adaptations, with the licence they are released under. */
  adaptations: { clip: string; sceneId: string; atMs: number; licence: string; licenceUrl: string }[];
}

/** Only present after the server has closed the round. */
export interface RoundReveal {
  roundId: string;
  questionNumber: number;
  canonicalAnswer: string;
  submissions: RevealedSubmission[];
  standingsBefore: Standing[];
  standingsAfter: Standing[];
  /** Credits of THIS question's media only (never other questions'); null for content without media. */
  attribution: RoundAttribution | null;
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
  /** Only during the intro phase. */
  intro: IntroView | null;
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
  /** Only during the intro phase. */
  intro: IntroView | null;
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
  /** Only during the intro phase. */
  intro: IntroView | null;
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
  /** `roundId` = the round this answer belongs to; the server never applies it to another round. */
  'team:submit': (payload: { roundId: string; submissionId: string; answer: string }, ack: Ack<{ receivedAt: number; duplicate: boolean }>) => void;
  'admin:rename': (payload: { teamId: string; name: string }, ack: Ack) => void;
  'admin:start': (payload: Record<string, never>, ack: Ack) => void;
  'admin:advance': (payload: Record<string, never>, ack: Ack) => void;
}

export interface ServerToClientEvents {
  state: (view: RoomView) => void;
}

export const MAX_ANSWER_LENGTH = 120;
export const MAX_TEAM_NAME_LENGTH = 40;
