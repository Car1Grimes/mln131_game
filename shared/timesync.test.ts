import { describe, expect, it } from 'vitest';
import { estimateOffset, remainingMs } from './timesync';

describe('time sync', () => {
  it('picks the sample with the smallest round trip', () => {
    const r = estimateOffset([
      { t0: 1000, server: 6000, t1: 1400 }, // rtt 400
      { t0: 2000, server: 7040, t1: 2080 }, // rtt 80 -> offset 5000
    ]);
    expect(r).toEqual({ offset: 5000, rtt: 80 });
  });

  it('ignores negative round trips and handles no samples', () => {
    expect(estimateOffset([{ t0: 10, server: 0, t1: 5 }])).toBeNull();
    expect(estimateOffset([])).toBeNull();
  });

  it('remaining time uses the server deadline and offset', () => {
    expect(remainingMs(70_000, 1_000, 59_000)).toBe(10_000);
    expect(remainingMs(70_000, 20_000, 59_000)).toBe(0);
  });
});
