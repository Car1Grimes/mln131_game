// HTTPS/WSS deployment smoke test (M4.1, Mode B topology on one machine). Run `npm run build` first.
//
//   CADDY_BIN=/path/to/caddy node --import tsx e2e/deploy-smoke.mjs
//
// Real Caddy with THIS repository's deploy/Caddyfile (local values: https://localhost:8443, `tls
// internal`, own CA in a temp dir — the OS trust store is never touched) in front of the real server
// started the way deploy/hidden-connection.service starts it: its ExecStart command, an
// EnvironmentFile built from deploy/hidden-connection.env.example, and a supervisor with the unit's
// semantics (Restart=on-failure, RestartSec=2). Production question 1 is played over HTTPS/WSS
// (local only, nothing leaves 127.0.0.1).
//
// Checks: TLS verified against Caddy's CA, security headers, HTTP→HTTPS redirect, origin on loopback
// only, no repository files over HTTPS, X-Forwarded-For spoofing through Caddy, admin/team/projector
// Socket.IO over WSS (+ polling fallback), five teams at once, media headers through the proxy (private,
// no-store, no ETag, no compression, Range), a `caddy reload` during the round, SIGKILL mid-round →
// automatic restart → reconnection with the original deadline and the recorded submission, a browser
// over HTTPS/WSS under the CSP, graceful stop without restart, SQLite contents after the stop.
// Never prints tokens, PINs, passwords or answers.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { chromium } from 'playwright-core';
import { io } from 'socket.io-client';
import { QUESTIONS } from '../server/content/questions.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const CADDY = process.env.CADDY_BIN;
if (!CADDY || !existsSync(CADDY)) {
  console.log('NOT RUN: set CADDY_BIN to a Caddy v2 binary (https://caddyserver.com/download)');
  process.exit(2);
}
if (!existsSync(join(ROOT, 'dist/index.html'))) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}
const ORIGIN_PORT = Number(process.env.SMOKE_ORIGIN_PORT ?? 4470);
const HTTPS_PORT = Number(process.env.SMOKE_HTTPS_PORT ?? 8443);
const HTTP_PORT = Number(process.env.SMOKE_HTTP_PORT ?? 8080);
const ADMIN_PORT = Number(process.env.SMOKE_CADDY_ADMIN_PORT ?? 2999);
const SITE = `https://localhost:${HTTPS_PORT}`;
const PASSWORD = 'smoke-' + Math.random().toString(36).slice(2) + '-password';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'hc-smoke-'));
const children = new Set();
process.on('exit', () => {
  for (const c of children) c.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
});

// ------------------------------------------------------------------ origin, as systemd would run it
const unit = readFileSync(join(ROOT, 'deploy/hidden-connection.service'), 'utf8');
const execStart = /^ExecStart=(.+)$/m.exec(unit)[1].trim().split(/\s+/);
const restartSec = Number(/^RestartSec=(\d+)$/m.exec(unit)[1]);
check('unit file: Restart=on-failure, ExecStart runs server/index.ts with tsx', /^Restart=on-failure$/m.test(unit) && execStart.slice(1).join(' ') === '--import tsx server/index.ts', execStart.join(' '));
// EnvironmentFile: the template with this machine's values (systemd syntax: KEY=VALUE, # comments).
const dbPath = join(dir, 'game.sqlite');
const envText = readFileSync(join(ROOT, 'deploy/hidden-connection.env.example'), 'utf8')
  .replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${PASSWORD}`)
  .replace(/^PORT=.*$/m, `PORT=${ORIGIN_PORT}`)
  .replace(/^DB_PATH=.*$/m, `DB_PATH=${dbPath}`)
  .replace(/^STATIC_DIR=.*$/m, `STATIC_DIR=${join(ROOT, 'dist')}`);
writeFileSync(join(dir, 'hidden-connection.env'), envText);
const envFile = Object.fromEntries(
  envText
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
check('env template: loopback origin, TRUST_PROXY=loopback, 40 s rounds', envFile.HOST === '127.0.0.1' && envFile.TRUST_PROXY === 'loopback' && envFile.ROUND_DURATION_MS === '40000');

const supervisor = { starts: 0, exits: [], proc: null, stopping: false, log: '' };
function startOrigin() {
  supervisor.starts++;
  const p = spawn(process.execPath, execStart.slice(1), { cwd: ROOT, env: { PATH: process.env.PATH, ...envFile }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(p);
  p.stdout.on('data', (d) => (supervisor.log += d));
  p.stderr.on('data', (d) => (supervisor.log += d));
  p.on('exit', (code, signal) => {
    children.delete(p);
    supervisor.exits.push({ code, signal, at: Date.now() });
    // Restart=on-failure: restart on a non-zero exit or a signal other than the clean SIGTERM path.
    const failure = signal !== null || code !== 0;
    if (failure && !supervisor.stopping) setTimeout(startOrigin, restartSec * 1000);
  });
  supervisor.proc = p;
}
async function waitFor(fn, timeoutMs, what) {
  const t0 = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* not yet */
    }
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${what}\n${supervisor.log}`);
    await sleep(100);
  }
}
startOrigin();
await waitFor(() => fetch(`http://127.0.0.1:${ORIGIN_PORT}/api/health`).then((r) => r.ok), 15_000, 'origin');

// ------------------------------------------------------------------ Caddy with deploy/Caddyfile
const caddyEnv = {
  PATH: process.env.PATH,
  HOME: dir,
  XDG_DATA_HOME: join(dir, 'caddy-data'),
  XDG_CONFIG_HOME: join(dir, 'caddy-config'),
  HC_SITE: SITE,
  HC_TLS: 'tls internal',
  HC_ORIGIN: `127.0.0.1:${ORIGIN_PORT}`,
  HC_HTTP_PORT: String(HTTP_PORT),
  HC_HTTPS_PORT: String(HTTPS_PORT),
  HC_CADDY_ADMIN: `localhost:${ADMIN_PORT}`,
  ACME_EMAIL: 'smoke@invalid.example',
};
const caddyArgs = ['--config', join(ROOT, 'deploy/Caddyfile'), '--adapter', 'caddyfile'];
let caddyLog = '';
const caddy = spawn(CADDY, ['run', ...caddyArgs], { env: caddyEnv, stdio: ['ignore', 'pipe', 'pipe'] });
children.add(caddy);
caddy.stdout.on('data', (d) => (caddyLog += d));
caddy.stderr.on('data', (d) => (caddyLog += d));
const caPath = join(caddyEnv.XDG_DATA_HOME, 'caddy/pki/authorities/local/root.crt');
await waitFor(() => existsSync(caPath), 20_000, 'Caddy local CA');
const ca = readFileSync(caPath);
const agent = new https.Agent({ ca, keepAlive: false });

/** HTTPS request verified against Caddy's CA. Returns status, headers, body and phase timings (ms). */
function request(path, { method = 'GET', headers = {}, body = null, base = SITE } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const t = {};
    const mod = base.startsWith('https') ? https : http;
    const req = mod.request(base + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, agent: base.startsWith('https') ? agent : undefined }, (res) => {
      t.ttfb = performance.now() - t0;
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), t: { ...t, total: performance.now() - t0 } }));
    });
    req.on('socket', (s) => {
      s.once('connect', () => (t.connect = performance.now() - t0));
      s.once('secureConnect', () => (t.tls = performance.now() - t0));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
const json = async (path, opts) => {
  const r = await request(path, opts);
  return { ...r, data: r.body.length ? JSON.parse(r.body.toString('utf8')) : null };
};
await waitFor(() => request('/api/health').then((r) => r.status === 200), 20_000, 'Caddy HTTPS');

// ------------------------------------------------------------------ HTTPS basics
const health = await json('/api/health');
check('HTTPS /api/health through Caddy, certificate verified against the Caddy CA', health.status === 200 && health.data?.ok === true, `connect ${health.t.connect?.toFixed(1)} ms, TLS ${health.t.tls?.toFixed(1)} ms, total ${health.t.total.toFixed(1)} ms`);
const page = await request('/');
const h = page.headers;
check(
  'security headers on the app page (HSTS, CSP, frame, nosniff, referrer; no Server, no X-Powered-By)',
  /max-age=31536000/.test(h['strict-transport-security'] ?? '') && /default-src 'self'/.test(h['content-security-policy'] ?? '') && /frame-ancestors 'none'/.test(h['content-security-policy'] ?? '') && h['x-frame-options'] === 'DENY' && h['x-content-type-options'] === 'nosniff' && h['referrer-policy'] === 'no-referrer' && !h.server && !h['x-powered-by'],
  `server=${h.server ?? '-'}, x-powered-by=${h['x-powered-by'] ?? '-'}`,
);
const redirect = await request('/admin', { base: `http://localhost:${HTTP_PORT}` });
check('plain HTTP redirects to HTTPS', redirect.status >= 301 && redirect.status <= 308 && (redirect.headers.location ?? '').startsWith('https://'), `${redirect.status} → ${redirect.headers.location}`);
const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
const lanReach = lan
  ? await new Promise((r) => {
      const s = net.connect(ORIGIN_PORT, lan);
      s.once('connect', () => (s.destroy(), r('open')));
      s.once('error', (e) => r(e.code));
    })
  : 'no LAN interface';
check('origin port is not reachable from the network (bound to 127.0.0.1)', lanReach !== 'open', `${lan ?? '-'}:${ORIGIN_PORT} → ${lanReach}`);
const indexHtml = readFileSync(join(ROOT, 'dist/index.html'));
const probes = ['/server/index.ts', '/server/content/questions.ts', '/package.json', '/.env', '/data/hidden-connection.sqlite', '/media/sources.json', '/server/media/clips/c02.mp4', '/deploy/Caddyfile', '/../server/config.ts', '/%2e%2e/server/config.ts'];
const exposed = [];
for (const p of probes) {
  const r = await request(p);
  if (!(r.status === 404 || r.body.equals(indexHtml))) exposed.push(`${p} ${r.status}`);
}
check('no repository, database or media file is served over HTTPS (SPA index or 404 only)', exposed.length === 0, exposed.join(', ') || `${probes.length} paths probed`);

// ------------------------------------------------------------------ admin, rate limit through Caddy
const login = await json('/api/admin/login', { method: 'POST', body: { password: PASSWORD } });
check('admin login over HTTPS', login.status === 200 && typeof login.data?.token === 'string');
const adminToken = login.data.token;
const spoofStatuses = [];
for (let i = 0; i < 11; i++) {
  const r = await request('/api/admin/login', { method: 'POST', body: { password: 'wrong' }, headers: { 'x-forwarded-for': `198.51.100.${i + 1}` } });
  spoofStatuses.push(r.status);
}
check('client-sent X-Forwarded-For through Caddy does not create new rate-limit buckets (10 × 401, then 429)', spoofStatuses.slice(0, 10).every((s) => s === 401) && spoofStatuses[10] === 429, spoofStatuses.join(' '));
const room = await json('/api/admin/rooms', { method: 'POST', headers: { authorization: `Bearer ${adminToken}` } });
const code = room.data.code;

// ------------------------------------------------------------------ Socket.IO over WSS
const sockets = [];
function connect(auth, transports = ['websocket']) {
  const s = io(SITE, { auth, transports, ca, forceNew: true });
  const rec = { s, views: [], connects: [], disconnects: [], transport: null };
  const t0 = performance.now();
  s.on('connect', () => {
    rec.connects.push({ at: Date.now(), ms: performance.now() - t0 });
    rec.transport = s.io.engine.transport.name;
  });
  s.on('disconnect', (reason) => rec.disconnects.push({ at: Date.now(), reason }));
  s.on('state', (v) => rec.views.push({ at: Date.now(), v }));
  sockets.push(rec);
  return rec;
}
const ack = (rec, event, payload) => new Promise((resolve) => rec.s.timeout(5000).emit(event, payload, (err, r) => resolve(err ? { ok: false, error: 'timeout' } : r)));
const admin = connect({ token: adminToken, roomCode: code });
await waitFor(() => admin.views.length > 0, 10_000, 'admin state over WSS');
const pins = admin.views.at(-1).v.teams.map((t) => t.pin);
check('admin Socket.IO over WSS (websocket transport)', admin.transport === 'websocket' && admin.connects.length === 1, `handshake ${admin.connects[0].ms.toFixed(0)} ms`);

const teams = [];
for (let i = 0; i < 5; i++) {
  const j = await json('/api/join', { method: 'POST', body: { code, pin: pins[i] } });
  teams.push({ token: j.data.token });
}
await Promise.all(teams.map((t) => (t.rec = connect({ token: t.token }))));
await waitFor(() => teams.every((t) => t.rec.views.length > 0), 10_000, 'five teams over WSS');
await Promise.all(teams.map((t) => ack(t.rec, 'team:ready', { ready: true })));
await waitFor(() => admin.views.at(-1).v.teams.every((t) => t.connected && t.ready), 5_000, 'admin sees five teams').catch(() => null);
const av = admin.views.at(-1).v;
check('five teams joined over HTTPS and are connected over WSS at the same time', teams.every((t) => t.rec.transport === 'websocket') && av.teams.filter((t) => t.connected).length === 5, `handshakes ${teams.map((t) => t.rec.connects[0].ms.toFixed(0)).join('/')} ms`);
const polling = connect({ token: teams[4].token }, ['polling']);
await waitFor(() => polling.views.length > 0, 10_000, 'polling fallback');
check('HTTP long-polling fallback works through Caddy (a second device of team 5)', polling.transport === 'polling');

const pairing = await json(`/api/admin/rooms/${code}/screen-pairing`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}` } });
const screenSession = await json('/api/screen/pair', { method: 'POST', body: { secret: pairing.data.secret } });
const screen = connect({ token: screenSession.data.token });
await waitFor(() => screen.views.length > 0, 10_000, 'projector over WSS');
check('projector pairing over HTTPS and projector socket over WSS', screen.transport === 'websocket' && screen.views.at(-1).v.role === 'screen' && pairing.data.expiresAt - Date.now() <= 5 * 60_000 + 1_000);

// ------------------------------------------------------------------ browser over HTTPS/WSS under the CSP
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 768 } }); // the Caddy test CA is not in Chrome's store
const bpage = await ctx.newPage();
const consoleErrors = [];
const wsUrls = [];
const mediaRequests = [];
bpage.on('console', (m) => m.type() === 'error' && consoleErrors.push({ at: Date.now(), text: m.text() }));
bpage.on('pageerror', (e) => consoleErrors.push({ at: Date.now(), text: String(e) }));
bpage.on('websocket', (ws) => wsUrls.push(ws.url()));
bpage.on('request', (r) => /\/media\//.test(r.url()) && mediaRequests.push(r.url()));
await bpage.goto(`${SITE}/?room=${code}`);
await bpage.getByTestId('join-pin').fill(pins[1]);
await bpage.getByRole('button', { name: 'Vào phòng' }).click();
await bpage.getByTestId('ready-button').waitFor();

// ------------------------------------------------------------------ the round
const started = await ack(admin, 'admin:start', {});
check('round started over WSS', started.ok === true);
await waitFor(() => teams.every((t) => t.rec.views.at(-1)?.v.round), 5_000, 'round view');
const round = teams[0].rec.views.at(-1).v.round;
const deadline = round.deadlineAt;
const q1 = QUESTIONS[0].scenes;
const firstVideo = q1.find((s) => s.kind === 'video');
const futureVideo = q1.filter((s) => s.kind === 'video' && s.at > 20_000).at(-1);
const mediaUrl = (id) => `/api/rounds/${encodeURIComponent(round.id)}/media/${encodeURIComponent(id)}`;
const m = await request(mediaUrl(firstVideo.media.assetId), { headers: { authorization: `Bearer ${teams[0].token}`, 'accept-encoding': 'gzip, br, zstd' } });
check(
  'released clip through Caddy: 200 video/mp4, private no-store, no ETag/Last-Modified, not compressed',
  m.status === 200 && m.headers['content-type'] === 'video/mp4' && /private/.test(m.headers['cache-control']) && /no-store/.test(m.headers['cache-control']) && !m.headers.etag && !m.headers['last-modified'] && !m.headers['content-encoding'],
  `${m.body.length} B, TTFB ${m.t.ttfb.toFixed(0)} ms, total ${m.t.total.toFixed(0)} ms, cache-control "${m.headers['cache-control']}"`,
);
const ranged = await request(mediaUrl(firstVideo.media.assetId), { headers: { authorization: `Bearer ${teams[0].token}`, range: 'bytes=0-1023' } });
check('Range request through Caddy returns 206 with 1024 bytes', ranged.status === 206 && ranged.body.length === 1024);
check('clip without a session through Caddy: 401', (await request(mediaUrl(firstVideo.media.assetId))).status === 401);
check('not-yet-released clip through Caddy: 403', (await request(mediaUrl(futureVideo.media.assetId), { headers: { authorization: `Bearer ${teams[0].token}` } })).status === 403, `scene at ${futureVideo.at} ms`);

const sub = await ack(teams[0].rec, 'team:submit', { roundId: round.id, submissionId: 'smoke-sub-0001', answer: 'KHÔNG BIẾT' });
check('team submission acknowledged over WSS', sub.ok === true && typeof sub.receivedAt === 'number');

// caddy reload while sockets are open (stream_close_delay keeps them)
const beforeReload = sockets.map((r) => r.disconnects.length);
const reload = await new Promise((resolve) => {
  const p = spawn(CADDY, ['reload', ...caddyArgs, '--address', `localhost:${ADMIN_PORT}`, '--force'], { env: caddyEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  p.on('exit', (c) => resolve({ code: c, out }));
});
await sleep(3_000);
const droppedByReload = sockets.filter((r, i) => r.disconnects.length > beforeReload[i]).length;
check('`caddy reload` during the round keeps every WebSocket open', reload.code === 0 && droppedByReload === 0, `reload exit ${reload.code}, ${droppedByReload} sockets dropped`);

// SIGKILL the origin mid-round → Restart=on-failure after RestartSec → everyone reconnects
await sleep(Math.max(0, round.startedAt + 20_000 - Date.now()));
const killAt = Date.now();
const connectsBefore = sockets.map((r) => r.connects.length);
supervisor.proc.kill('SIGKILL');
await waitFor(() => supervisor.starts >= 2, 10_000, 'automatic restart');
await waitFor(() => sockets.every((r, i) => r.connects.length > connectsBefore[i]), 20_000, 'all sockets reconnected');
const reconnectMs = sockets.map((r) => r.connects.at(-1).at - killAt);
const killWindowEnd = Math.max(...sockets.map((r) => r.connects.at(-1).at)) + 3_000;
await sleep(500);
const after = teams[0].rec.views.at(-1).v;
check(
  `origin SIGKILL mid-round → restarted after ${restartSec} s → all ${sockets.length} sockets reconnect through Caddy`,
  supervisor.exits[0]?.signal === 'SIGKILL' && reconnectMs.every((ms) => ms < 15_000),
  `reconnect after kill: min ${Math.min(...reconnectMs)} ms, max ${Math.max(...reconnectMs)} ms`,
);
check('after the restart: same round, original deadline, the submission is still recorded', after.round?.id === round.id && after.round.deadlineAt === deadline && after.me.submission?.receivedAt === sub.receivedAt);
const resub = await ack(teams[0].rec, 'team:submit', { roundId: round.id, submissionId: 'smoke-sub-0002', answer: 'KHÁC' });
check('a second, different submission of the same team is still refused after the restart', resub.ok === false && resub.error === 'already_submitted', resub.error);

// browser: played the round over wss under the CSP
await waitFor(() => bpage.locator('.scene-stage[data-scene-kind="video"]').count(), 30_000, 'browser video scene').catch(() => null);
const bvideo = await bpage.evaluate(() => document.querySelector('.scene-in video')?.getAttribute('src') ?? null);

// until the deadline: no unexpected disconnects; everyone gets the reveal
await sleep(Math.max(0, deadline + 2_000 - Date.now()));
const unexpected = sockets.map((r) => r.disconnects.filter((d) => d.at < killAt || d.at > killAt + 15_000).length).reduce((a, b) => a + b, 0);
check('no unexpected disconnects over the whole 40 s round (only the deliberate kill)', unexpected === 0, `${unexpected} unexpected`);
const revealed = [...teams.map((t) => t.rec), screen].filter((r) => r.views.at(-1)?.v.reveal?.roundId === round.id).length;
check('the round closes at its deadline and all five teams and the projector receive the results over WSS', revealed === 6, `${revealed}/6`);
// Errors while the origin was deliberately down (Caddy answers 502 to the browser's retries) are expected.
const duringKill = consoleErrors.filter((e) => e.at >= killAt && e.at <= killWindowEnd);
const otherErrors = consoleErrors.filter((e) => (e.at < killAt || e.at > killWindowEnd) && !/Failed to load resource.*(401|403|404)/.test(e.text));
check(
  'browser over HTTPS: WebSocket is wss://, the clip renders from a blob URL, no CSP/console errors outside the deliberate outage',
  wsUrls.length > 0 && wsUrls.every((u) => u.startsWith('wss://')) && !!bvideo?.startsWith('blob:') && otherErrors.length === 0 && !consoleErrors.some((e) => /Content Security Policy/i.test(e.text)),
  `${wsUrls.length} ws (${[...new Set(wsUrls.map((u) => u.split(':')[0]))]}), video src ${bvideo?.slice(0, 5)}, ${duringKill.length} errors during the outage (502), other: ${otherErrors.slice(0, 2).map((e) => e.text).join(' | ') || 'none'}`,
);
const perAsset = mediaRequests.reduce((m2, u) => m2.set(u, (m2.get(u) ?? 0) + 1), new Map());
check('browser downloaded each released clip once (no duplicates, nothing before release)', [...perAsset.values()].every((n) => n === 1), `${perAsset.size} clips, ${mediaRequests.length} requests (a reconnect may legitimately refetch: ${[...perAsset.values()].join(',')})`);
await browser.close();

// ------------------------------------------------------------------ graceful stop, persistence
for (const r of sockets) r.s.disconnect();
supervisor.stopping = true;
supervisor.proc.kill('SIGTERM');
const termAt = Date.now();
const startsBeforeTerm = supervisor.starts;
const exitsBeforeTerm = supervisor.exits.length;
await waitFor(() => supervisor.exits.length > exitsBeforeTerm, 15_000, 'graceful stop').catch((e) => {
  console.log('DIAG open origin connections:\n' + require_('node:child_process').execSync(`lsof -nP -iTCP:${ORIGIN_PORT} || true`).toString());
  throw e;
});
const stopMs = supervisor.exits.at(-1).at - termAt;
await sleep(restartSec * 1000 + 500);
check(
  'SIGTERM: clean exit 0 within the unit\'s TimeoutStopSec, and no restart (Restart=on-failure)',
  supervisor.exits.at(-1).code === 0 && supervisor.starts === startsBeforeTerm && stopMs < 10_000,
  `stopped in ${stopMs} ms; process starts ${supervisor.starts}; exits ${JSON.stringify(supervisor.exits.map(({ code: c, signal }) => [c, signal]))}`,
);
const db = new Database(dbPath, { readonly: true });
const rounds = db.prepare('SELECT deadline_at, closed_at FROM rounds').all();
const subs = db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n;
const roomRow = db.prepare('SELECT phase FROM rooms WHERE code = ?').get(code);
db.close();
check('SQLite after the stop: room, closed round with its original deadline, one submission', roomRow?.phase === 'revealed' && rounds.length === 1 && rounds[0].deadline_at === deadline && rounds[0].closed_at >= deadline && subs === 1, `phase ${roomRow?.phase}, ${rounds.length} round, ${subs} submission`);
check('server log contains no password, token or PIN', !supervisor.log.includes(PASSWORD) && !supervisor.log.includes(adminToken) && pins.every((p) => !supervisor.log.includes(p)) && !caddyLog.includes(adminToken));

caddy.kill('SIGTERM');
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
