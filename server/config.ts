import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ServerConfig {
  port: number;
  host: string;
  /** SQLite file path, or ':memory:' for tests. */
  dbPath: string;
  adminPassword: string;
  roundDurationMs: number;
  /** Serve the built client from this directory (default: dist, if it exists). */
  staticDir: string | null;
  /** Projector sessions expire after this long (default 6 h: one classroom session). */
  screenSessionTtlMs: number;
  /** Projector pairing links expire after this long (default 5 min) and work once. */
  screenPairingTtlMs: number;
  /**
   * Express `trust proxy` value, or false (default). Only set when the server sits behind ONE reverse
   * proxy that overwrites/appends X-Forwarded-For (Caddy, cloudflared): `loopback` when the proxy runs
   * on the same machine, else its exact address(es). Never "trust everything".
   */
  trustProxy: false | string;
  /** True when the server is reachable beyond this machine (non-loopback HOST or behind a proxy). */
  publicFacing: boolean;
}

export class ConfigError extends Error {}

export const TTL_LIMITS = {
  SCREEN_SESSION_TTL_MS: { min: 60_000, max: 7 * 24 * 60 * 60_000 }, // 1 min … 7 days
  SCREEN_PAIRING_TTL_MS: { min: 30_000, max: 60 * 60_000 }, // 30 s … 1 h
} as const;
export const MIN_PUBLIC_PASSWORD_LENGTH = 16;
const PLACEHOLDER_PASSWORDS = new Set(['change-me', 'changeme', 'password', 'admin', 'replace-me']);

function durationMs(env: NodeJS.ProcessEnv, name: keyof typeof TTL_LIMITS, fallback: number): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === '') return fallback;
  const { min, max } = TTL_LIMITS[name];
  const v = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(v) || v < min || v > max) {
    throw new ConfigError(`${name} must be an integer number of milliseconds between ${min} and ${max} (got "${raw}")`);
  }
  return v;
}

const isCidr = (s: string) => {
  const [ip = '', bits, extra] = s.split('/');
  if (extra !== undefined || !isIP(ip)) return false;
  if (bits === undefined) return true;
  const max = isIP(ip) === 4 ? 32 : 128;
  return /^\d+$/.test(bits) && Number(bits) <= max;
};

/**
 * TRUST_PROXY: unset/empty/"off"/"false" → false. Otherwise "loopback" and/or a comma-separated list of
 * IP addresses or CIDR ranges of the proxy. Hop counts and "true"/"*" are refused: with them a client
 * that reaches the origin port directly could choose its own IP via X-Forwarded-For.
 */
export function parseTrustProxy(raw: string | undefined): false | string {
  const v = raw?.trim() ?? '';
  if (v === '' || /^(off|false|no|0)$/i.test(v)) return false;
  const parts = v.split(',').map((p) => p.trim());
  for (const p of parts) {
    if (p !== 'loopback' && !isCidr(p)) {
      throw new ConfigError(`TRUST_PROXY must be "loopback" or the proxy's IP address/CIDR list (got "${p}"); "true", "*" and hop counts are not accepted`);
    }
  }
  return parts.join(', ');
}

export const isLoopbackHost = (host: string) => host === 'localhost' || host === '::1' || /^127\./.test(host);

const inside = (child: string, parent: string) => {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig & { generatedPassword: boolean } {
  const host = env.HOST ?? '127.0.0.1';
  const trustProxy = parseTrustProxy(env.TRUST_PROXY);
  const publicFacing = trustProxy !== false || !isLoopbackHost(host);
  const password = env.ADMIN_PASSWORD || undefined; // empty = unset
  if (publicFacing) {
    // Reachable by other machines: the password must be chosen deliberately (no generated or sample value).
    const why = trustProxy !== false ? 'TRUST_PROXY is set' : `HOST=${host} is not a loopback address`;
    if (!password) throw new ConfigError(`ADMIN_PASSWORD must be set because ${why}`);
    if (password.length < MIN_PUBLIC_PASSWORD_LENGTH || PLACEHOLDER_PASSWORDS.has(password.toLowerCase())) {
      throw new ConfigError(`ADMIN_PASSWORD must be at least ${MIN_PUBLIC_PASSWORD_LENGTH} characters and not a sample value because ${why} (e.g. openssl rand -base64 18)`);
    }
  }
  const dbPath = env.DB_PATH ?? 'data/hidden-connection.sqlite';
  const staticDir = env.STATIC_DIR ?? 'dist';
  // Only the built client may be public: never the database, its WAL/SHM files, or the server code.
  if (staticDir && dbPath !== ':memory:' && inside(dbPath, staticDir)) {
    throw new ConfigError(`DB_PATH (${dbPath}) must not be inside STATIC_DIR (${staticDir})`);
  }
  // …and never the server tree (code, answers, credits, media clips) in either direction, and only a
  // built client: pointing STATIC_DIR at server/media or media/ would publish clips or source metadata.
  const serverDir = fileURLToPath(new URL('.', import.meta.url));
  if (staticDir && (inside(serverDir, staticDir) || inside(staticDir, serverDir))) {
    throw new ConfigError(`STATIC_DIR (${staticDir}) must not contain or be inside the server code`);
  }
  if (staticDir && existsSync(staticDir) && !existsSync(join(staticDir, 'index.html'))) {
    throw new ConfigError(`STATIC_DIR (${staticDir}) must be the built client (no index.html; run npm run build)`);
  }
  return {
    port: Number(env.PORT ?? 3001),
    host,
    dbPath,
    adminPassword: password ?? randomBytes(9).toString('base64url'),
    roundDurationMs: Number(env.ROUND_DURATION_MS ?? 40_000),
    staticDir,
    screenSessionTtlMs: durationMs(env, 'SCREEN_SESSION_TTL_MS', 6 * 60 * 60_000),
    screenPairingTtlMs: durationMs(env, 'SCREEN_PAIRING_TTL_MS', 5 * 60_000),
    trustProxy,
    publicFacing,
    generatedPassword: !password,
  };
}
