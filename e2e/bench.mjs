// Network performance benchmark (M4.1). Run `npm run build` first for local targets.
//
//   node --import tsx e2e/bench.mjs                          # local server, no impairment ("lan")
//   BENCH_PROFILE=wifi node --import tsx e2e/bench.mjs       # local, every device through its own SIMULATED
//                                                            # weak Wi-Fi link (resilience Run B: 60 ms ± 80 ms, 2.5 Mbit/s)
//   BENCH_TARGET=https://quiz.example.org BENCH_ADMIN_PASSWORD=… node --import tsx e2e/bench.mjs
//                                                            # an existing deployment (creates one room, plays question 1)
//   BENCH_MODE=fairness node --import tsx e2e/bench.mjs      # simultaneous submissions at different simulated delays
//
// Options: BENCH_QUESTION=n (local only, default 1), BENCH_SAMPLES (default 30), BENCH_BROWSER=0 (skip the
// browser scene-visibility probe), BENCH_CA=<root.crt> (custom TLS root, e.g. Caddy's local CA),
// BENCH_LABEL, OUT=<file.json>. Prints min / median / p95 / max / n per metric. Never prints tokens, PINs,
// passwords or answers. A simulated profile is a simulation, not a mobile-network measurement.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import Database from 'better-sqlite3';
import { io } from 'socket.io-client';
import { createProxy } from './lib/netproxy.mjs';
import { sleep, startServer } from './lib/session.mjs';

const env = process.env;
const MODE = env.BENCH_MODE ?? 'session';
const TARGET = env.BENCH_TARGET?.replace(/\/$/, '') ?? null;
const PROFILE = TARGET ? 'external' : MODE === 'fairness' ? 'simulated-delays' : (env.BENCH_PROFILE ?? 'lan');
const PROFILES = { lan: null, wifi: { latencyMs: 60, jitterMs: 80, bytesPerSecond: 312_500 } };
const SAMPLES = Number(env.BENCH_SAMPLES ?? 30);
const QUESTION = Number(env.BENCH_QUESTION ?? 1);
const BROWSER = env.BENCH_BROWSER !== '0';
const CA = env.BENCH_CA ? readFileSync(env.BENCH_CA) : undefined;
const LABEL = env.BENCH_LABEL ?? `${MODE}/${PROFILE}`;
if (!TARGET && MODE !== 'fairness' && !(PROFILE in PROFILES)) throw new Error(`BENCH_PROFILE must be one of ${Object.keys(PROFILES)}`);
if (TARGET && MODE === 'fairness') throw new Error('fairness mode needs the local server (it simulates the per-team delays)');
if (TARGET && !env.BENCH_ADMIN_PASSWORD) throw new Error('BENCH_ADMIN_PASSWORD is required with BENCH_TARGET');

// ------------------------------------------------------------------ statistics
const metrics = {};
const add = (name, v) => Number.isFinite(v) && (metrics[name] ??= []).push(v);
function summary(v) {
  const s = [...v].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
  const r = (x) => Math.round(x * 10) / 10;
  return { n: s.length, min: r(s[0]), median: r(q(0.5)), p95: r(q(0.95)), max: r(s.at(-1)) };
}

// ------------------------------------------------------------------ transport helpers
function agentFor(base, keepAlive) {
  return base.startsWith('https') ? new https.Agent({ keepAlive, ca: CA }) : new http.Agent({ keepAlive });
}
const defaultAgents = new Map();
/** One HTTP(S) request with phase timings (ms from start): connect, tls, ttfb, total; and body size. */
function request(base, path, { method = 'GET', headers = {}, body = null, agent } = {}) {
  if (!agent) {
    if (!defaultAgents.has(base)) defaultAgents.set(base, agentFor(base, true));
    agent = defaultAgents.get(base);
  }
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const t = {};
    const mod = base.startsWith('https') ? https : http;
    const req = mod.request(base + path, { method, agent, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
      t.ttfb = performance.now() - t0;
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body: buf, bytes: buf.length, t: { ...t, total: performance.now() - t0 } });
      });
    });
    req.on('socket', (s) => {
      if (s.connecting === false) return; // reused keep-alive socket
      s.once('connect', () => (t.connect = performance.now() - t0));
      s.once('secureConnect', () => (t.tls = performance.now() - t0));
    });
    req.on('error', reject);
    req.setTimeout(30_000, () => req.destroy(new Error('timeout')));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
const json = async (base, path, opts) => {
  const r = await request(base, path, opts);
  return { ...r, data: r.body.length ? JSON.parse(r.body.toString('utf8')) : null };
};
function socket(base, auth) {
  const s = io(base, { auth, transports: ['websocket', 'polling'], ca: CA, forceNew: true });
  const rec = { s, views: [], connects: [], t0: performance.now() };
  s.on('connect', () => {
    rec.connects.push({ at: performance.now(), wall: Date.now() });
    rec.transport = s.io.engine.transport.name;
    s.io.engine.once('upgrade', (tr) => (rec.transport = tr.name));
  });
  return rec;
}
const ack = (rec, event, payload, timeout = 10_000) =>
  new Promise((resolve) => {
    const t0 = performance.now();
    rec.s.timeout(timeout).emit(event, payload, (err, r) => resolve({ ...(err ? { ok: false, error: 'timeout' } : r), rtt: performance.now() - t0 }));
  });
const until = async (fn, ms, what) => {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await sleep(20);
  }
};

/** time:sync samples: RTT, and the offset (server − local) of the lowest-RTT sample. */
async function clockSync(rec, n) {
  let best = null;
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    const p0 = performance.now();
    const r = await ack(rec, 'time:sync', t0);
    const rtt = performance.now() - p0;
    add('socket_rtt_time_sync_ms', rtt);
    if (r.server && (!best || rtt < best.rtt)) best = { rtt, offset: r.server - (t0 + rtt / 2) };
  }
  rec.offset = best?.offset ?? 0;
  rec.offsetUncertainty = (best?.rtt ?? 0) / 2;
}

// ------------------------------------------------------------------ environment
const PASSWORD = env.BENCH_ADMIN_PASSWORD ?? 'bench-local-password-0123';
let srv = null;
let base;
if (TARGET) base = TARGET;
else {
  srv = await startServer({ port: Number(env.BENCH_PORT ?? 4480), password: PASSWORD, roundMs: MODE === 'fairness' ? 15_000 : 60_000 });
  base = srv.base;
}
const proxies = [];
/** Base URL for one device: its own impairment proxy for simulated profiles, else the server. */
async function deviceBase(cond = PROFILES[PROFILE]) {
  if (TARGET || !cond) return base;
  const p = await createProxy(srv.port, cond);
  proxies.push(p);
  return `http://127.0.0.1:${p.port}`;
}
async function setupRoom(questionIndex = 0) {
  const login = await json(base, '/api/admin/login', { method: 'POST', body: { password: PASSWORD } });
  if (login.status !== 200) throw new Error(`admin login failed (${login.status})`);
  const token = login.data.token;
  const { code } = (await json(base, '/api/admin/rooms', { method: 'POST', headers: { authorization: `Bearer ${token}` } })).data;
  if (questionIndex > 0) {
    const db = new Database(srv.dbPath);
    db.prepare("UPDATE rooms SET question_index = ?, phase = 'ready' WHERE code = ?").run(questionIndex, code);
    db.close();
  }
  const admin = socket(base, { token, roomCode: code });
  admin.s.on('state', (v) => admin.views.push(v));
  await until(() => admin.views.length > 0, 15_000, 'admin state');
  return { token, code, admin, pins: admin.views.at(-1).teams.map((t) => t.pin) };
}
async function joinTeams(code, pins, bases) {
  const teams = [];
  for (let i = 0; i < pins.length; i++) {
    const j = await json(bases[i], '/api/join', { method: 'POST', body: { code, pin: pins[i] } });
    if (j.status !== 200) throw new Error(`join failed (${j.status})`);
    teams.push({ i, base: bases[i], token: j.data.token, agent: agentFor(bases[i], true) });
  }
  return teams;
}

const report = { label: LABEL, mode: MODE, profile: PROFILE, target: TARGET ? new URL(TARGET).host : 'local', at: new Date().toISOString(), notes: [] };

// ====================================================================== session benchmark
async function sessionBench() {
  const bases = await Promise.all([0, 1, 2, 3, 4].map(() => deviceBase()));
  // 1. HTTPS/HTTP connection setup (fresh connection per request).
  for (let i = 0; i < SAMPLES; i++) {
    const r = await request(bases[i % 5], '/api/health', { agent: agentFor(bases[i % 5], false) });
    add('http_tcp_connect_ms', r.t.connect);
    if (r.t.tls) add('https_tls_ready_ms', r.t.tls);
    add('http_health_total_fresh_conn_ms', r.t.total);
  }
  const room = await setupRoom(TARGET ? 0 : QUESTION - 1);
  const teams = await joinTeams(room.code, room.pins, bases);
  // 2. WebSocket + Socket.IO handshake (connect() → 'connect'), extra samples on fresh sockets.
  for (const t of teams) {
    t.rec = socket(t.base, { token: t.token });
    t.rec.s.on('state', (v) => onState(t, v));
  }
  await until(() => teams.every((t) => t.rec.connects.length), 20_000, 'team sockets');
  for (const t of teams) add('socket_handshake_ms', t.rec.connects[0].at - t.rec.t0);
  for (let i = 0; i < SAMPLES - 5; i++) {
    const t = teams[i % 5];
    const extra = socket(t.base, { token: t.token });
    await until(() => extra.connects.length, 20_000, 'extra handshake');
    add('socket_handshake_ms', extra.connects[0].at - extra.t0);
    extra.s.disconnect();
  }
  // 3. Socket.IO RTT via time:sync (the app's own clock sync).
  await Promise.all(teams.map((t) => clockSync(t.rec, SAMPLES)));
  report.clockOffsetUncertaintyMs = summary(teams.map((t) => t.rec.offsetUncertainty));

  // 4. Browser: a second device of team 1 records when each scene becomes visible.
  let browser = null;
  let bpage = null;
  const browserMedia = [];
  if (BROWSER) {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ channel: env.CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const ctx = await browser.newContext({ ignoreHTTPSErrors: !!CA, viewport: { width: 390, height: 844 } });
    bpage = await ctx.newPage();
    bpage.on('requestfinished', async (r) => {
      if (!/\/media\//.test(r.url())) return;
      const sizes = await r.sizes().catch(() => null);
      const timing = r.timing();
      browserMedia.push({ asset: r.url().split('/').at(-1), bytes: sizes?.responseBodySize ?? null, ms: timing.responseEnd });
    });
    const bbase = await deviceBase();
    await bpage.goto(`${bbase}/?room=${room.code}`);
    await bpage.getByTestId('join-pin').fill(room.pins[0]);
    await bpage.getByRole('button', { name: 'Vào phòng' }).click();
    await bpage.getByTestId('ready-button').waitFor({ timeout: 30_000 });
    await bpage.evaluate(() => {
      window.__visible = [];
      new MutationObserver(() => {
        const id = document.querySelector('.scene-stage')?.dataset.sceneId;
        if (id && window.__visible.at(-1)?.id !== id) window.__visible.push({ id, t: Date.now() });
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-scene-id'], childList: true });
    });
  }

  // 5. The round.
  const started = await ack(room.admin, 'admin:start', {});
  if (!started.ok) throw new Error(`start failed: ${started.error}`);
  await until(() => teams.every((t) => t.round), 15_000, 'round view');
  const round = teams[0].round;
  report.round = { questionNumber: round.questionNumber, durationMs: round.durationMs };
  // Simultaneous submission of a dummy answer at 30 s, then idempotent retries of the same submission
  // (same server path as a first submission minus the insert) for more ACK samples.
  const submitAt = round.startedAt + 30_000 - teams[0].rec.offset;
  await sleep(Math.max(0, submitAt - Date.now()));
  const first = await Promise.all(teams.map((t) => ack(t.rec, 'team:submit', { roundId: round.id, submissionId: `bench-${round.id}-${t.i}`, answer: 'BENCH' })));
  first.forEach((r) => add('submit_ack_rtt_first_ms', r.rtt));
  report.simultaneousSubmit = first.map((r, i) => ({ team: i + 1, ok: r.ok, ackMs: Math.round(r.rtt), receivedAtMinusSendMs: r.receivedAt ? Math.round(r.receivedAt - (submitAt + teams[i].rec.offset)) : null }));
  for (let k = 0; k < Math.ceil(SAMPLES / 5); k++) {
    const again = await Promise.all(teams.map((t) => ack(t.rec, 'team:submit', { roundId: round.id, submissionId: `bench-${round.id}-${t.i}`, answer: 'BENCH' })));
    again.forEach((r) => r.ok && r.duplicate && add('submit_ack_rtt_retry_ms', r.rtt));
  }
  await until(() => teams.every((t) => t.reveal), round.deadlineAt - Date.now() + 20_000, 'reveal');
  await sleep(1_500); // let the last media downloads finish
  if (bpage) {
    const visible = await bpage.evaluate(() => window.__visible);
    const releasedAt = new Map(teams[0].round.scenes.map((s) => [s.id, s]));
    for (const v of visible) {
      const s = releasedAt.get(v.id);
      if (!s) continue;
      add(s.kind === 'video' ? 'scene_release_to_visible_video_ms' : 'scene_release_to_visible_native_ms', v.t + teams[0].rec.offset - s.releasedAt);
    }
    const perAsset = browserMedia.reduce((m, x) => m.set(x.asset, (m.get(x.asset) ?? 0) + 1), new Map());
    report.browserMedia = { requests: browserMedia.length, distinctClips: perAsset.size, duplicates: [...perAsset.values()].filter((n) => n > 1).length, bytes: browserMedia.reduce((n, x) => n + (x.bytes ?? 0), 0) };
    await browser.close();
  }
  // 6. Reconnect after a dropped transport (the app's Socket.IO defaults: first retry after 0.5–1.5 s).
  for (let k = 0; k < Math.max(1, Math.ceil(SAMPLES / 10)); k++) {
    await Promise.all(
      teams.map(async (t) => {
        const n = t.rec.connects.length;
        const views = t.views;
        const t0 = performance.now();
        t.rec.s.io.engine.close();
        await until(() => t.rec.connects.length > n, 30_000, 'reconnect');
        add('reconnect_to_connected_ms', t.rec.connects.at(-1).at - t0);
        await until(() => t.views > views, 30_000, 'state after reconnect');
        add('reconnect_to_state_ms', t.lastStateAt - t0);
      }),
    );
  }
  report.mediaBytesPerTeam = teams.map((t) => t.mediaBytes ?? 0);
  report.socketTransports = teams.map((t) => t.rec.transport);
  report.socketUrlScheme = new URL(teams[0].base).protocol === 'https:' ? 'wss' : 'ws';
  for (const t of teams) t.rec.s.disconnect();
  room.admin.s.disconnect();
}

/** Per-team state handler: event latency, scene receipt, media download, reveal receipt. */
function onState(t, v) {
  const local = Date.now();
  t.views = (t.views ?? 0) + 1;
  t.lastStateAt = performance.now();
  if (t.rec.offset === undefined) return; // before clock sync
  const serverAt = local + t.rec.offset;
  add('server_emit_to_client_receipt_ms', serverAt - v.serverNow);
  if (v.round) {
    t.round = v.round;
    t.seen ??= new Set();
    for (const s of v.round.scenes) {
      if (t.seen.has(s.id)) continue;
      t.seen.add(s.id);
      if (v.reveal) continue; // a closed round shows every scene at once: not a release
      add('scene_release_to_client_receipt_ms', serverAt - s.releasedAt);
      if (s.kind === 'video') void download(t, v.round.id, s);
    }
  }
  if (v.reveal && !t.reveal && t.round) {
    t.reveal = true;
    add('deadline_to_results_receipt_ms', serverAt - t.round.deadlineAt);
  }
}
async function download(t, roundId, scene) {
  const path = `/api/rounds/${encodeURIComponent(roundId)}/media/${encodeURIComponent(scene.media.assetId)}`;
  const r = await request(t.base, path, { headers: { authorization: `Bearer ${t.token}` }, agent: t.agent });
  if (r.status !== 200) return void report.notes.push(`media ${r.status}`);
  report.mediaHeaders ??= { 'cache-control': r.headers['cache-control'], 'content-encoding': r.headers['content-encoding'] ?? null, 'cf-cache-status': r.headers['cf-cache-status'] ?? null, etag: r.headers.etag ?? null };
  add('mp4_ttfb_ms', r.t.ttfb);
  add('mp4_download_total_ms', r.t.total);
  add('mp4_bytes', r.bytes);
  add('mp4_throughput_mbit_s', (r.bytes * 8) / 1000 / r.t.total);
  add('scene_release_to_mp4_downloaded_ms', Date.now() + t.rec.offset - scene.releasedAt);
  t.mediaBytes = (t.mediaBytes ?? 0) + r.bytes;
}

// ====================================================================== fairness benchmark
// Five teams on simulated links with fixed one-way delays submit at the same instant; the server's
// receipt order decides the answer order (unchanged rule). Then the slowest team submits earlier by
// a head start, to show how much head start a delay costs.
const FAIR_DELAYS = [0, 25, 50, 100, 200]; // one-way, per direction, ms
const FAIR_TRIALS = Number(env.BENCH_FAIR_TRIALS ?? 6);
async function fairnessBench() {
  const bases = await Promise.all(FAIR_DELAYS.map((d) => deviceBase({ latencyMs: d, jitterMs: 0, bytesPerSecond: 0 })));
  const scenarios = [
    { name: 'simultaneous', lead: () => 0 },
    { name: 'team5 (200 ms) sends 150 ms earlier', lead: (i) => (i === 4 ? 150 : 0) },
    { name: 'team5 (200 ms) sends 250 ms earlier', lead: (i) => (i === 4 ? 250 : 0) },
  ];
  report.fairness = { delaysMs: FAIR_DELAYS, scenarios: [] };
  for (const sc of scenarios) {
    const orders = [];
    const recv = FAIR_DELAYS.map(() => []);
    const acks = FAIR_DELAYS.map(() => []);
    let trial = 0;
    while (trial < FAIR_TRIALS) {
      const room = await setupRoom();
      const teams = await joinTeams(room.code, room.pins, bases);
      for (const t of teams) {
        t.rec = socket(t.base, { token: t.token });
        t.rec.s.on('state', (v) => (t.view = v));
      }
      await until(() => teams.every((t) => t.rec.connects.length), 20_000, 'sockets');
      await Promise.all(teams.map((t) => clockSync(t.rec, 5)));
      for (let q = 0; q < 6 && trial < FAIR_TRIALS; q++, trial++) {
        if (q > 0) {
          await until(() => room.admin.views.at(-1).room.phase === 'revealed', 30_000, 'revealed');
          await ack(room.admin, 'admin:advance', {});
        }
        await ack(room.admin, 'admin:start', {});
        await until(() => teams.every((t) => t.view?.round && t.view.room.phase === 'active' && t.view.round.questionNumber === q + 1), 10_000, 'round');
        const roundId = teams[0].view.round.id;
        const T = Date.now() + 400;
        const res = await Promise.all(
          teams.map(async (t) => {
            await sleep(Math.max(0, T - sc.lead(t.i) - Date.now()));
            const sent = Date.now();
            const r = await ack(t.rec, 'team:submit', { roundId, submissionId: `fair-${roundId}-${t.i}`, answer: 'BENCH' });
            return { team: t.i, sent, ...r };
          }),
        );
        res.forEach((r) => {
          recv[r.team].push(r.receivedAt - (r.sent + teams[r.team].rec.offset));
          acks[r.team].push(r.rtt);
        });
        orders.push(
          [...res]
            .sort((a, b) => a.receivedAt - b.receivedAt)
            .map((r) => r.team + 1)
            .join(''),
        );
      }
      for (const t of teams) t.rec.s.disconnect();
      room.admin.s.disconnect();
    }
    const firstPlace = FAIR_DELAYS.map((_, i) => orders.filter((o) => o[0] === String(i + 1)).length);
    report.fairness.scenarios.push({
      name: sc.name,
      trials: orders.length,
      orders: [...new Set(orders)].map((o) => `${o} ×${orders.filter((x) => x === o).length}`),
      firstPlaceCount: firstPlace,
      perTeam: FAIR_DELAYS.map((d, i) => ({ oneWayMs: d, sendToReceipt: summary(recv[i]), ackRtt: summary(acks[i]) })),
    });
  }
}

// ====================================================================== run
try {
  if (MODE === 'fairness') await fairnessBench();
  else await sessionBench();
} finally {
  for (const p of proxies) await p.close();
  await srv?.stop();
}
report.metrics = Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, summary(v)]));
const pad = (s, n) => String(s).padEnd(n);
console.log(`\nBENCH ${LABEL}  (${report.target}, ${report.at})`);
if (report.metrics && Object.keys(report.metrics).length) {
  console.log(pad('metric', 40) + pad('n', 6) + pad('min', 9) + pad('median', 9) + pad('p95', 9) + 'max');
  for (const [k, s] of Object.entries(report.metrics)) console.log(pad(k, 40) + pad(s.n, 6) + pad(s.min, 9) + pad(s.median, 9) + pad(s.p95, 9) + s.max);
}
if (report.simultaneousSubmit) console.log('simultaneous submit at 30 s:', JSON.stringify(report.simultaneousSubmit));
if (report.browserMedia) console.log('browser media:', JSON.stringify(report.browserMedia));
if (report.socketTransports) console.log(`socket transports: ${report.socketTransports.join(',')} over ${report.socketUrlScheme}; media headers: ${JSON.stringify(report.mediaHeaders)}`);
if (report.fairness) for (const s of report.fairness.scenarios) console.log(`fairness — ${s.name}: orders ${s.orders.join(', ')}; first place per team ${s.firstPlaceCount}; median send→receipt ${s.perTeam.map((p) => p.sendToReceipt.median).join('/')} ms`);
if (env.OUT) writeFileSync(env.OUT, JSON.stringify(report, null, 1));
process.exit(0);
