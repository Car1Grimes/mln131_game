import { describe, expect, it } from 'vitest';
import { afterAck, canEditAnswer, parsePending, restoreState, retryDelayMs, startSending, type DeliveryState, deliveryView } from './delivery';

const pending = { roundId: 'round-q1-abcdef', submissionId: 'abc-12345678', answer: 'đổi mới' };

describe('answer delivery state', () => {
  it('acknowledged → accepted; recorded is never claimed from local state', () => {
    expect(afterAck(startSending(pending), { ok: true })).toEqual({ status: 'accepted', pending });
    expect(afterAck(startSending(pending), { ok: true, duplicate: true })).toEqual({ status: 'accepted', pending });
  });

  it('no acknowledgement (offline / timeout) → uncertain, never accepted', () => {
    const s = afterAck(startSending(pending), { ok: false, error: 'offline' });
    expect(s).toEqual({ status: 'uncertain', pending, attempts: 1 });
    expect(canEditAnswer(s, false)).toBe(false); // the answer stays locked: no silent change
  });

  it('retries keep the same submission and back off', () => {
    let s: DeliveryState = startSending(pending);
    const delays: (number | null)[] = [];
    for (let i = 0; i < 6; i++) {
      s = afterAck(s.status === 'uncertain' ? startSending(s.pending, s.attempts) : s, { ok: false, error: 'offline' });
      delays.push(retryDelayMs(s));
      expect(s.status === 'uncertain' && s.pending).toEqual(pending);
    }
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 8_000, 8_000]);
  });

  it('the server deadline is final: round_closed → rejected', () => {
    const s = afterAck(restoreState(pending), { ok: false, error: 'round_closed' });
    expect(s).toEqual({ status: 'rejected', reason: 'round_closed' });
    expect(canEditAnswer(s, false)).toBe(false);
  });

  it('already_submitted means the server holds this team\'s answer (shown from the server view)', () => {
    expect(afterAck(startSending(pending), { ok: false, error: 'already_submitted' }).status).toBe('accepted');
  });

  it('an invalid answer may be re-entered', () => {
    const s = afterAck(startSending(pending), { ok: false, error: 'invalid' });
    expect(s).toEqual({ status: 'rejected', reason: 'invalid' });
    expect(canEditAnswer(s, false)).toBe(true);
  });

  it('a pending answer survives a refresh and resumes as uncertain', () => {
    const restored = restoreState(parsePending(JSON.stringify(pending), pending.roundId));
    expect(restored).toEqual({ status: 'uncertain', pending, attempts: 0 });
    expect(restoreState(parsePending(null, pending.roundId))).toEqual({ status: 'idle' });
    expect(parsePending('{not json', pending.roundId)).toBeNull();
    expect(parsePending(JSON.stringify({ ...pending, answer: '  ' }), pending.roundId)).toBeNull();
  });

  it('nothing is editable once the server has recorded a submission', () => {
    expect(canEditAnswer({ status: 'idle' }, true)).toBe(false);
  });

  it('stale acknowledgements do not change a settled state', () => {
    const rejected: DeliveryState = { status: 'rejected', reason: 'round_closed' };
    expect(afterAck(rejected, { ok: true })).toBe(rejected);
  });
});

describe('what the device shows (deliveryView)', () => {
  const pending = { roundId: 'r1', submissionId: 'sub-12345678', answer: 'x' };
  it('first attempt is "sending"; nothing is shown when idle', () => {
    expect(deliveryView({ status: 'idle' })).toBeNull();
    expect(deliveryView(startSending(pending))).toBe('sending');
  });
  it('after an unacknowledged attempt every retry stays "uncertain" — never back to plain "sending"', () => {
    let s = afterAck(startSending(pending), { ok: false, error: 'offline' });
    expect(deliveryView(s)).toBe('uncertain');
    for (let i = 0; i < 6; i++) {
      // automatic retry (same submission), then another timeout
      s = startSending((s as { pending: typeof pending }).pending, (s as { attempts: number }).attempts);
      expect(deliveryView(s), `retry ${i + 1} in flight`).toBe('uncertain');
      s = afterAck(s, { ok: false, error: 'offline' });
      expect(deliveryView(s), `retry ${i + 1} timed out`).toBe('uncertain');
    }
    expect((s as { pending: typeof pending }).pending.submissionId).toBe('sub-12345678');
  });
  it('a restored (refresh) pending answer is "uncertain" from the start; acceptance and rejection are shown as such', () => {
    expect(deliveryView(restoreState(pending))).toBe('uncertain');
    expect(deliveryView(afterAck(startSending(pending, 2), { ok: true }))).toBe('accepted');
    expect(deliveryView(afterAck(startSending(pending, 2), { ok: false, error: 'round_closed' }))).toBe('rejected');
  });
  it('the view never unlocks the answer: canEditAnswer is unchanged by retries', () => {
    const s = startSending(pending, 3);
    expect(deliveryView(s)).toBe('uncertain');
    expect(canEditAnswer(s, false)).toBe(false);
  });
});

describe('pending answers are bound to their round', () => {
  it('a pending answer of another round is never restored into this round', () => {
    expect(parsePending(JSON.stringify(pending), 'round-q2-xyz123')).toBeNull();
  });
  it('legacy entries without a round id are ignored', () => {
    expect(parsePending(JSON.stringify({ submissionId: 'abc-12345678', answer: 'x' }), pending.roundId)).toBeNull();
  });
  it('retries carry the original round id unchanged', () => {
    const s = afterAck(startSending(pending), { ok: false, error: 'offline' });
    expect(s.status === 'uncertain' && s.pending.roundId).toBe('round-q1-abcdef');
  });
});
