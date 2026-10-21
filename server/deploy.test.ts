// Deployment configuration (M4.1): TTL wiring and validation, TRUST_PROXY, the public-facing
// password rule, file placement, and the client IP used by the login/join/pairing rate limits when the
// server runs behind one reverse proxy.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startApp, type RunningApp } from './app';
import { ConfigError, loadConfig, parseTrustProxy } from './config';

const ROOT = new URL('..', import.meta.url).pathname;
const STRONG = 'deploy-test-password-0123';

describe('loadConfig: projector TTLs', () => {
  it('defaults to 6 h / 5 min and accepts valid overrides', () => {
    expect(loadConfig({})).toMatchObject({ roundDurationMs: 40_000, screenSessionTtlMs: 21_600_000, screenPairingTtlMs: 300_000 });
    expect(loadConfig({ SCREEN_SESSION_TTL_MS: '7200000', SCREEN_PAIRING_TTL_MS: ' 45000 ' })).toMatchObject({ screenSessionTtlMs: 7_200_000, screenPairingTtlMs: 45_000 });
    expect(loadConfig({ SCREEN_SESSION_TTL_MS: '', SCREEN_PAIRING_TTL_MS: '' })).toMatchObject({ screenSessionTtlMs: 21_600_000, screenPairingTtlMs: 300_000 });
  });
  it.each([
    ['SCREEN_SESSION_TTL_MS', 'abc'],
    ['SCREEN_SESSION_TTL_MS', '0'],
    ['SCREEN_SESSION_TTL_MS', '-60000'],
    ['SCREEN_SESSION_TTL_MS', '59999'],
    ['SCREEN_SESSION_TTL_MS', '604800001'],
    ['SCREEN_SESSION_TTL_MS', '3.6e6'],
    ['SCREEN_PAIRING_TTL_MS', '29999'],
    ['SCREEN_PAIRING_TTL_MS', '3600001'],
    ['SCREEN_PAIRING_TTL_MS', '1e5'],
  ])('refuses %s=%s', (name, value) => {
    expect(() => loadConfig({ [name]: value })).toThrow(ConfigError);
    expect(() => loadConfig({ [name]: value })).toThrow(name);
  });
});

describe('loadConfig: TRUST_PROXY and the public-facing password rule', () => {
  it('parses only explicit proxy addresses', () => {
    for (const off of [undefined, '', 'off', 'false', '0', 'no']) expect(parseTrustProxy(off)).toBe(false);
    expect(parseTrustProxy('loopback')).toBe('loopback');
    expect(parseTrustProxy('10.0.0.5, 192.168.1.0/24,::1')).toBe('10.0.0.5, 192.168.1.0/24, ::1');
    for (const bad of ['true', '*', '1', '2', 'all', '10.0.0.0/33', '300.1.1.1', 'loopback,evil.example']) expect(() => parseTrustProxy(bad)).toThrow(ConfigError);
  });
  it('requires a deliberate admin password when the server is reachable from other machines', () => {
    expect(loadConfig({})).toMatchObject({ publicFacing: false, generatedPassword: true, trustProxy: false });
    expect(loadConfig({ ADMIN_PASSWORD: '' }).generatedPassword).toBe(true); // empty = unset, never an empty password
    expect(loadConfig({ ADMIN_PASSWORD: '' }).adminPassword.length).toBeGreaterThan(8);
    for (const env of [{ HOST: '0.0.0.0' }, { TRUST_PROXY: 'loopback' }, { HOST: '192.168.1.20' }]) {
      expect(() => loadConfig(env)).toThrow(/ADMIN_PASSWORD must be set/);
      expect(() => loadConfig({ ...env, ADMIN_PASSWORD: 'change-me' })).toThrow(/at least 16/);
      expect(() => loadConfig({ ...env, ADMIN_PASSWORD: 'short-password' })).toThrow(/at least 16/);
      expect(loadConfig({ ...env, ADMIN_PASSWORD: STRONG })).toMatchObject({ publicFacing: true, generatedPassword: false, adminPassword: STRONG });
    }
    expect(loadConfig({ HOST: '127.0.0.1', ADMIN_PASSWORD: 'x' }).publicFacing).toBe(false); // local development
  });
  it('keeps the database and the server code out of the public static directory', () => {
    expect(() => loadConfig({ STATIC_DIR: 'dist', DB_PATH: 'dist/game.sqlite' })).toThrow(/DB_PATH/);
    expect(() => loadConfig({ STATIC_DIR: 'data', DB_PATH: 'data/hidden-connection.sqlite' })).toThrow(/DB_PATH/);
    expect(() => loadConfig({ STATIC_DIR: '.', DB_PATH: '/var/lib/hc/game.sqlite' })).toThrow(/server code/);
    // Directories that would publish clips, answers or source/credit metadata as static files.
    for (const dir of ['server', 'server/media', 'server/media/clips', 'server/content']) expect(() => loadConfig({ STATIC_DIR: dir }), dir).toThrow(/server code/);
    for (const dir of ['media', 'media/q1', 'docs', 'e2e']) expect(() => loadConfig({ STATIC_DIR: dir }), dir).toThrow(/built client/);
    expect(() => loadConfig({ STATIC_DIR: 'dist', DB_PATH: 'data/hidden-connection.sqlite' })).not.toThrow();
  });
});

/** Runs the real entry point (server/index.ts) with `env` until it prints its address or exits. */
function runServer(env: Record<string, string>): Promise<{ code: number | null; out: string; url: string | null; stop: () => void }> {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: ROOT, env: { PATH: process.env.PATH ?? '', STATIC_DIR: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const onData = (d: Buffer) => {
      out += d;
      const m = /server: (http:\/\/\S+)[\s\S]*trust proxy: .*\n/.exec(out); // the last startup line
      if (m) resolve({ code: null, out, url: m[1] ?? null, stop: () => proc.kill('SIGKILL') });
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (code) => resolve({ code, out, url: null, stop: () => {} }));
  });
}

describe('server/index.ts wires the TTLs into the running server', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('a pairing link issued by the running server expires after SCREEN_PAIRING_TTL_MS', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-deploy-'));
    dirs.push(dir);
    const s = await runServer({ PORT: '0', ADMIN_PASSWORD: STRONG, DB_PATH: join(dir, 'g.sqlite'), SCREEN_PAIRING_TTL_MS: '45000', SCREEN_SESSION_TTL_MS: '7200000' });
    try {
      expect(s.url).not.toBeNull();
      expect(s.out).toContain('projector session / pairing TTL: 120 min / 45 s');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const post = (path: string, body: unknown, token?: string): Promise<any> =>
        fetch(s.url + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }).then((r) => r.json());
      const { token } = await post('/api/admin/login', { password: STRONG });
      const { code } = await post('/api/admin/rooms', {}, token);
      const before = Date.now();
      const pairing = await post(`/api/admin/rooms/${code}/screen-pairing`, {}, token);
      expect(pairing.expiresAt - before).toBeGreaterThanOrEqual(45_000 - 50);
      expect(pairing.expiresAt - before).toBeLessThanOrEqual(45_000 + 2_000);
      const screen = await post('/api/screen/pair', { secret: pairing.secret });
      expect(screen.expiresAt - before).toBeGreaterThanOrEqual(7_200_000 - 50);
      expect(screen.expiresAt - before).toBeLessThanOrEqual(7_200_000 + 2_000);
    } finally {
      s.stop();
    }
  });

  it.each([
    [{ SCREEN_PAIRING_TTL_MS: 'soon' }, /SCREEN_PAIRING_TTL_MS must be an integer/],
    [{ TRUST_PROXY: 'true', ADMIN_PASSWORD: STRONG }, /TRUST_PROXY must be/],
    [{ TRUST_PROXY: 'loopback' }, /ADMIN_PASSWORD must be set/],
  ])('refuses to start with %o', async (env, message) => {
    const s = await runServer({ PORT: '0', DB_PATH: ':memory:', ...env });
    expect(s.code).toBe(1);
    expect(s.out).toMatch(message);
    expect(s.out).not.toContain(STRONG);
  });
});

// ------------------------------------------------------------------ reverse proxy and client IPs

/**
 * A minimal reverse proxy for tests. Each front port stands for one client network address
 * (`clientIp`), the way the real proxy would see different devices. mode 'overwrite' replaces any
 * client-sent X-Forwarded-For (Caddy's default); 'append' appends the peer address to it (cloudflared,
 * nginx $proxy_add_x_forwarded_for).
 */
async function proxy(targetPort: number, clientIps: string[], mode: 'overwrite' | 'append') {
  const servers = await Promise.all(
    clientIps.map(
      (clientIp) =>
        new Promise<http.Server>((resolve) => {
          const srv = http.createServer((req, res) => {
            const prior = req.headers['x-forwarded-for'];
            const xff = mode === 'append' && prior ? `${prior}, ${clientIp}` : clientIp;
            const up = http.request({ host: '127.0.0.1', port: targetPort, method: req.method, path: req.url, headers: { ...req.headers, 'x-forwarded-for': xff } }, (r) => {
              res.writeHead(r.statusCode ?? 502, r.headers);
              r.pipe(res);
            });
            req.pipe(up);
          });
          srv.listen(0, '127.0.0.1', () => resolve(srv));
        }),
    ),
  );
  return {
    urls: servers.map((s) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`) as [string, ...string[]] & string[],
    close: () => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))),
  };
}

const LIMIT = 3;
const login = (base: string, spoof?: string) =>
  fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json', ...(spoof ? { 'x-forwarded-for': spoof } : {}) }, body: JSON.stringify({ password: 'wrong-password' }) }).then((r) => r.status);
const joinRoom = (base: string, i: number, spoof?: string) =>
  fetch(`${base}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json', ...(spoof ? { 'x-forwarded-for': spoof } : {}) }, body: JSON.stringify({ code: `ROOM${i % 10}A`, pin: '000000' }) }).then((r) => r.status);
const pair = (base: string, spoof?: string) =>
  fetch(`${base}/api/screen/pair`, { method: 'POST', headers: { 'content-type': 'application/json', ...(spoof ? { 'x-forwarded-for': spoof } : {}) }, body: JSON.stringify({ secret: 'x'.repeat(43) }) }).then((r) => r.status);
const spoofed = (i: number) => `198.51.100.${i % 250}`;

describe('rate limits behind one reverse proxy', () => {
  let app: RunningApp;
  let px: Awaited<ReturnType<typeof proxy>> | null = null;
  afterEach(async () => {
    await px?.close();
    px = null;
    await app?.close();
  });
  const start = (trustProxy: false | string, host = '127.0.0.1') =>
    startApp({ dbPath: ':memory:', adminPassword: STRONG, roundDurationMs: 40_000, authLimit: { attempts: LIMIT, windowMs: 60_000 }, trustProxy }, 0, host);

  it('trust proxy = loopback: each real client IP has its own login, join and pairing budget', async () => {
    app = await start('loopback');
    px = await proxy(app.port, ['203.0.113.10', '203.0.113.11', '2001:db8::12'], 'overwrite');
    const [a, b, c] = px.urls as [string, string, string];
    for (let i = 0; i < LIMIT; i++) expect(await Promise.all([login(a), login(b), login(c)])).toEqual([401, 401, 401]);
    expect(await login(a)).toBe(429); // A is over its own limit …
    expect(await Promise.all([login(b), login(c)])).toEqual([429, 429]); // … B and C too, each after LIMIT attempts
    for (let i = 0; i < LIMIT; i++) expect(await Promise.all([joinRoom(a, i), joinRoom(b, i)])).toEqual([401, 401]);
    expect(await joinRoom(a, 99)).toBe(429);
    for (let i = 0; i < LIMIT; i++) expect(await pair(c)).toBe(401);
    expect(await pair(c)).toBe(429);
    expect(await pair(a)).toBe(401); // A's pairing budget is untouched by C
  });

  it('trust proxy off (default) behind a proxy: every client shares the proxy IP (why TRUST_PROXY exists)', async () => {
    app = await start(false);
    px = await proxy(app.port, ['203.0.113.10', '203.0.113.11'], 'overwrite');
    const [a, b] = px.urls as [string, string];
    for (let i = 0; i < LIMIT; i++) expect(await login(a)).toBe(401);
    expect(await login(b)).toBe(429); // B is locked out by A's attempts
  });

  it('a client-sent X-Forwarded-For through the proxy cannot buy new attempts (overwrite and append proxies)', async () => {
    for (const mode of ['overwrite', 'append'] as const) {
      app = await start('loopback');
      px = await proxy(app.port, ['203.0.113.20'], mode);
      const a = px.urls[0];
      const statuses = [];
      for (let i = 0; i < LIMIT + 3; i++) statuses.push(await login(a, spoofed(i)));
      expect(statuses, mode).toEqual([...Array(LIMIT).fill(401), 429, 429, 429]);
      const joins = [];
      for (let i = 0; i < LIMIT + 2; i++) joins.push(await joinRoom(a, i, `${spoofed(i)}, ${spoofed(i + 1)}`));
      expect(joins, mode).toEqual([...Array(LIMIT).fill(401), 429, 429]);
      await px.close();
      px = null;
      await app.close();
    }
    app = await start('loopback'); // for afterEach
  });

  it('direct requests to the origin with a spoofed X-Forwarded-For cannot bypass the limit (trust proxy off)', async () => {
    app = await start(false);
    const statuses = [];
    for (let i = 0; i < LIMIT + 2; i++) statuses.push(await login(`http://127.0.0.1:${app.port}`, spoofed(i)));
    expect(statuses).toEqual([...Array(LIMIT).fill(401), 429, 429]);
  });

  // The origin should listen on 127.0.0.1 only; this covers a misconfigured HOST=0.0.0.0 with the proxy
  // trusted: a device reaching the origin port over the network is not a trusted proxy.
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  it.skipIf(!lan)('direct requests from a non-loopback address with a spoofed header are not trusted (trust proxy = loopback)', async () => {
    app = await start('loopback', '0.0.0.0');
    const statuses = [];
    for (let i = 0; i < LIMIT + 2; i++) statuses.push(await login(`http://${lan}:${app.port}`, spoofed(i)));
    expect(statuses).toEqual([...Array(LIMIT).fill(401), 429, 429]);
  });
});
