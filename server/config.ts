import { randomBytes } from 'node:crypto';

export interface ServerConfig {
  port: number;
  host: string;
  /** SQLite file path, or ':memory:' for tests. */
  dbPath: string;
  adminPassword: string;
  roundDurationMs: number;
  /** Serve the built client from this directory (default: dist, if it exists). */
  staticDir: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig & { generatedPassword: boolean } {
  const generated = !env.ADMIN_PASSWORD;
  return {
    port: Number(env.PORT ?? 3001),
    host: env.HOST ?? '127.0.0.1',
    dbPath: env.DB_PATH ?? 'data/hidden-connection.sqlite',
    adminPassword: env.ADMIN_PASSWORD ?? randomBytes(9).toString('base64url'),
    roundDurationMs: Number(env.ROUND_DURATION_MS ?? 60_000),
    staticDir: env.STATIC_DIR ?? 'dist',
    generatedPassword: generated,
  };
}
