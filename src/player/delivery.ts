// Answer delivery state for a team device on an unreliable network. Pure functions, unit-tested.
//
// Rules:
// - Once the team confirms an answer, its text and submission id are locked (and persisted per
//   round), so every retry is the *same* idempotent submission. The answer cannot silently change.
// - "Recorded" is only ever shown when the server's view contains the team's submission
//   (TeamView.me.submission). A missing acknowledgement is reported as *unconfirmed*, never as recorded.
// - The client never decides the deadline: retries continue until the server accepts or rejects.

export interface PendingSubmission {
  /** The round this answer was given for. Sent with every attempt; the server never re-targets it. */
  roundId: string;
  submissionId: string;
  answer: string;
}

export type DeliveryState =
  | { status: 'idle' }
  | { status: 'sending'; pending: PendingSubmission; attempts: number }
  /** No acknowledgement (offline / timeout): delivery unknown; will be retried with the same id. */
  | { status: 'uncertain'; pending: PendingSubmission; attempts: number }
  /** The server acknowledged; its view (with the recorded submission) normally arrives first. */
  | { status: 'accepted'; pending: PendingSubmission }
  | { status: 'rejected'; reason: 'round_closed' | 'invalid' };

export type SubmitAck = { ok: true; duplicate?: boolean } | { ok: false; error: string };

export const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000];

/** `attempts` = how many earlier attempts went unacknowledged (drives the retry backoff). */
export function startSending(pending: PendingSubmission, attempts = 0): DeliveryState {
  return { status: 'sending', pending, attempts };
}

/** Next state after an acknowledgement (or its absence) for the current pending submission. */
export function afterAck(state: DeliveryState, ack: SubmitAck): DeliveryState {
  if (state.status !== 'sending' && state.status !== 'uncertain') return state;
  const pending = state.pending;
  const attempts = state.attempts + 1;
  if (ack.ok) return { status: 'accepted', pending };
  switch (ack.error) {
    case 'offline':
    case 'rate_limited':
      return { status: 'uncertain', pending, attempts };
    case 'round_closed':
      return { status: 'rejected', reason: 'round_closed' };
    case 'already_submitted':
      // A different submission of this team is recorded: the server view will show it.
      return { status: 'accepted', pending };
    default:
      return { status: 'rejected', reason: 'invalid' };
  }
}

/** Delay before the next automatic retry of an uncertain submission (while connected). */
export function retryDelayMs(state: DeliveryState): number | null {
  if (state.status !== 'uncertain') return null;
  return RETRY_BACKOFF_MS[Math.min(state.attempts - 1, RETRY_BACKOFF_MS.length - 1)] ?? 8_000;
}

/** Restores a persisted pending submission (e.g. after a refresh while offline). */
export function restoreState(pending: PendingSubmission | null): DeliveryState {
  return pending ? { status: 'uncertain', pending, attempts: 0 } : { status: 'idle' };
}

/** Parses a stored pending answer; only accepted for the given round (stale or legacy entries are ignored). */
export function parsePending(raw: string | null, roundId: string): PendingSubmission | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<PendingSubmission>;
    return p.roundId === roundId && typeof p.submissionId === 'string' && typeof p.answer === 'string' && p.answer.trim()
      ? { roundId: p.roundId, submissionId: p.submissionId, answer: p.answer }
      : null;
  } catch {
    return null;
  }
}

/**
 * What the device shows for a delivery state. Once an attempt went unacknowledged, every automatic
 * retry is still *unconfirmed* ("Chưa xác nhận được … Đang gửi lại…"): showing "Đang gửi" again
 * during a retry would hide that nothing is confirmed (on a stalled link the warning then only
 * flashed for 1 s between retries). Only the very first attempt is shown as "sending".
 */
export type DeliveryView = 'sending' | 'uncertain' | 'accepted' | 'rejected' | null;
export function deliveryView(state: DeliveryState): DeliveryView {
  switch (state.status) {
    case 'idle':
      return null;
    case 'sending':
      return state.attempts > 0 ? 'uncertain' : 'sending';
    default:
      return state.status;
  }
}

/** The answer input may only be used when nothing is pending and nothing is recorded. */
export function canEditAnswer(state: DeliveryState, recorded: boolean): boolean {
  return !recorded && (state.status === 'idle' || (state.status === 'rejected' && state.reason === 'invalid'));
}
