import { estimateOffset, type TimeSample } from '../../shared/timesync';

export interface MeasureOptions {
  samples?: number;
  /** Local clock (Date.now by default). */
  now?: () => number;
  /** Stop and discard the measurement when this returns false (unmount, socket replaced, offline). */
  isActive?: () => boolean;
}

/**
 * Measures the server-clock offset with a few sequential pings and keeps the lowest-round-trip
 * sample. Returns null when cancelled or when no ping was answered, so a stale or failed
 * measurement can never overwrite a good offset.
 */
export async function measureOffset(
  ping: (t0: number) => Promise<{ server: number } | null>,
  opts: MeasureOptions = {},
): Promise<{ offset: number; rtt: number } | null> {
  const now = opts.now ?? Date.now;
  const active = opts.isActive ?? (() => true);
  const samples: TimeSample[] = [];
  for (let i = 0; i < (opts.samples ?? 5); i++) {
    if (!active()) return null;
    const t0 = now();
    const reply = await ping(t0);
    if (!active()) return null; // the reply arrived after unmount / reconnect: ignore it
    if (reply) samples.push({ t0, server: reply.server, t1: now() });
  }
  return estimateOffset(samples);
}
