import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newId = () => randomBytes(12).toString('base64url');

/** Room codes avoid look-alike characters (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newRoomCode(length = 6): string {
  return Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

/** Distinct 6-digit PINs. */
export function newPins(count: number): string[] {
  const pins = new Set<string>();
  while (pins.size < count) pins.add(String(randomInt(0, 1_000_000)).padStart(6, '0'));
  return [...pins];
}

export function passwordMatches(given: string, expected: string): boolean {
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Fixed-window attempt limiter (in memory). */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records an attempt; returns false when the key is over its limit. */
  attempt(key: string): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  retryAfterMs(key: string): number {
    const entry = this.hits.get(key);
    return entry ? Math.max(0, entry.resetAt - this.now()) : 0;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
