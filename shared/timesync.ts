// Server-time synchronisation (NTP-style). The client sends its local time t0, the server replies
// with its clock, the client records arrival t1. offset = server - (t0 + t1) / 2.
// The sample with the smallest round trip is the most trustworthy.

export interface TimeSample {
  t0: number;
  server: number;
  t1: number;
}

export function estimateOffset(samples: readonly TimeSample[]): { offset: number; rtt: number } | null {
  let best: { offset: number; rtt: number } | null = null;
  for (const s of samples) {
    const rtt = s.t1 - s.t0;
    if (!(rtt >= 0)) continue;
    const offset = s.server - (s.t0 + s.t1) / 2;
    if (!best || rtt < best.rtt) best = { offset, rtt };
  }
  return best;
}

/** Remaining time of a round as seen by a client with a known clock offset. */
export function remainingMs(deadlineAt: number, clientNow: number, offset: number): number {
  return Math.max(0, deadlineAt - (clientNow + offset));
}
