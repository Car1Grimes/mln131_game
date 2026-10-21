// Trial-server isolation test (M4.1, Mode A). Run `npm run build` first.
//
//   node --import tsx e2e/trial-isolation.mjs
//
// Proves that the SYNTHETIC trial server (scripts/trial/trial-server.ts) cannot serve production
// question content, production media or attribution metadata:
//   1. Mode-switch attempts: STATIC_DIR pointed at server/media, server/content or media/ → refused;
//      unrelated "mode" variables (HC_MODE, NODE_ENV, QUESTIONS, MEDIA_ROOT) → ignored, still synthetic;
//      a database written by the PRODUCTION server (open production round) → recovered with synthetic
//      content only, production clips refused (403).
//   2. All six synthetic questions played as real 60 s rounds in parallel rooms (admin, team and
//      projector sockets): every state frame and every downloaded clip is scanned — no production answer,
//      scene text, credit, source/licence URL, creator, asset id or clip bytes (29 MP4 sha256).
//   3. Direct URLs: every production asset id via the media endpoint (403), production file paths and
//      attribution paths over HTTP (SPA index or 404 only).
// Never prints tokens, PINs or passwords.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { io } from 'socket.io-client';
import { QUESTIONS } from '../server/content/questions.ts';
import { MEDIA_ASSETS } from '../server/media/registry.ts';
import { normalizeAnswer } from '../shared/normalize.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const PASSWORD = 'trial-isolation-' + Math.random().toString(36).slice(2) + '-pw';
const PORT = Number(process.env.E2E_TRIAL_PORT ?? 4495);
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'hc-trial-iso-'));
const procs = new Set();
process.on('exit', () => {
  for (const p of procs) p.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
});

// ------------------------------------------------------------------ what must never appear
// Folding that keeps word boundaries (normalizeAnswer removes all separators, so it cannot find words).
const fold = (t) => ` ${t.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
const prodAnswers = QUESTIONS.map((q) => normalizeAnswer(q.answer));
const prodAnswerWords = QUESTIONS.map((q) => fold(q.answer));
const prodStrings = new Set();
for (const q of QUESTIONS) {
  for (const s of q.scenes) for (const [k, v] of Object.entries(s)) if (typeof v === 'string' && !['id', 'kind', 'transition'].includes(k) && v.length >= 6) prodStrings.add(v);
  for (const e of q.attribution?.entries ?? []) for (const v of [e.creator, e.title, e.sourceUrl, e.licenceUrl, e.rightsNote, ...e.modifications]) if (typeof v === 'string' && v.length >= 6) prodStrings.add(v);
  for (const a of q.attribution?.adaptations ?? []) for (const v of [a.licenceUrl]) if (v) prodStrings.add(v);
}
const prodIds = MEDIA_ASSETS.map((a) => a.id);
const prodFiles = MEDIA_ASSETS.map((a) => a.file);
const clipsDir = join(ROOT, 'server/media/clips');
const prodHashes = new Set(readdirSync(clipsDir).filter((f) => f.endsWith('.mp4')).map((f) => createHash('sha256').update(readFileSync(join(clipsDir, f))).digest('hex')));
const METADATA = /creativecommons\.org|wikimedia\.org|wikipedia\.org|flickr\.com|"attribution"\s*:\s*\{/i;
/** Production content found in a text (normalised answers as whole words, exact strings, ids, metadata). */
function leaks(text) {
  const found = [];
  const folded = fold(text);
  for (const a of prodAnswerWords) if (folded.includes(a)) found.push(`answer:${a.trim()}`);
  for (const s of prodStrings) if (text.includes(s)) found.push(`text:${s.slice(0, 30)}`);
  for (const id of prodIds) if (text.includes(id)) found.push(`asset:${id}`);
  for (const f of prodFiles) if (text.includes(f)) found.push(`file:${f}`);
  if (METADATA.test(text)) found.push('attribution-metadata');
  return found;
}

// Self-test: the scanner must flag real production content (else a silent scanner would pass).
const selfTest = QUESTIONS.map((q) => [leaks(JSON.stringify(q.scenes)).length, leaks(JSON.stringify(q.attribution ?? {})).length, leaks(`Đáp án: ${q.answer}`).length]);
check('leak scanner self-test: flags the production scenes, credits and answer of every question', selfTest.every(([a, b, c]) => a > 0 && b > 0 && c > 0), selfTest.map((x) => x.join('/')).join(' '));

// ------------------------------------------------------------------ helpers
function runTrial(env, { wait = true } = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['--import', 'tsx', 'scripts/trial/trial-server.ts'], {
      cwd: ROOT,
      env: { PATH: process.env.PATH, HOST: '127.0.0.1', PORT: String(PORT), TRUST_PROXY: 'loopback', ADMIN_PASSWORD: PASSWORD, STATIC_DIR: join(ROOT, 'dist'), ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    procs.add(p);
    let out = '';
    const onData = (d) => {
      out += d;
      if (wait && /trust proxy: .*\n/.test(out)) resolve({ p, out: () => out, code: null });
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('exit', (code) => {
      procs.delete(p);
      resolve({ p, out: () => out, code });
    });
  });
}
const stop = (t) => new Promise((r) => (t.p.exitCode !== null ? r() : (t.p.once('exit', r), t.p.kill('SIGTERM'))));
async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, text: buf.toString('utf8') };
}
const frames = [];
function connect(auth) {
  const s = io(BASE, { auth, transports: ['websocket'], forceNew: true });
  const rec = { s, views: [] };
  s.on('state', (v) => {
    frames.push(JSON.stringify(v));
    rec.views.push(v);
  });
  return rec;
}
const until = async (fn, ms, what) => {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await sleep(50);
  }
};
const ackOf = (rec, event, payload) => new Promise((r) => rec.s.timeout(5000).emit(event, payload, (err, res) => r(err ? { ok: false } : res)));

// ------------------------------------------------------------------ 1. mode-switch attempts
for (const bad of ['server/media', 'server/media/clips', 'server/content', 'media', join(ROOT, 'server')]) {
  const t = await runTrial({ STATIC_DIR: bad, DB_PATH: join(dir, 'refused.sqlite') }, { wait: false });
  check(`trial refuses STATIC_DIR=${bad.replace(ROOT, '<repo>/')}`, t.code === 1 && /configuration error: STATIC_DIR/.test(t.out()), t.out().split('\n')[0]);
}

// A database written by the PRODUCTION server, with an open production round of question 1.
const sharedDb = join(dir, 'shared.sqlite');
const prod = await new Promise((resolve) => {
  const p = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: ROOT, env: { PATH: process.env.PATH, HOST: '127.0.0.1', PORT: String(PORT), ADMIN_PASSWORD: PASSWORD, DB_PATH: sharedDb, STATIC_DIR: join(ROOT, 'dist') }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(p);
  let out = '';
  p.stdout.on('data', (d) => ((out += d), /trust proxy: .*\n/.test(out) && resolve({ p })));
  p.on('exit', () => procs.delete(p));
});
const prodToken = JSON.parse((await api('/api/admin/login', { method: 'POST', body: { password: PASSWORD } })).text).token;
const prodRoom = JSON.parse((await api('/api/admin/rooms', { method: 'POST', token: prodToken })).text).code;
const prodAdmin = connect({ token: prodToken, roomCode: prodRoom });
await until(() => prodAdmin.views.length, 10_000, 'production admin');
const prodPin = prodAdmin.views.at(-1).teams[0].pin;
const prodTeamToken = JSON.parse((await api('/api/join', { method: 'POST', body: { code: prodRoom, pin: prodPin } })).text).token;
await ackOf(prodAdmin, 'admin:start', {});
await until(() => prodAdmin.views.at(-1).round, 5_000, 'production round');
const prodRoundId = prodAdmin.views.at(-1).round.id;
prodAdmin.s.disconnect();
await stop(prod);
frames.length = 0; // production frames are expected to contain production content; start the scan now

const trial = await runTrial({ DB_PATH: sharedDb, HC_MODE: 'production', NODE_ENV: 'production', QUESTIONS: 'production', MEDIA_ROOT: join(ROOT, 'server/media'), CONTENT: 'production' });
check('trial ignores mode variables (HC_MODE, NODE_ENV, QUESTIONS, MEDIA_ROOT, CONTENT) and starts synthetic', /SYNTHETIC TRIAL server \(no production content\)/.test(trial.out()));
const adminToken = JSON.parse((await api('/api/admin/login', { method: 'POST', body: { password: PASSWORD } })).text).token;
// The production room's open round, now recovered by the trial server.
const oldAdmin = connect({ token: adminToken, roomCode: prodRoom });
const oldTeam = connect({ token: prodTeamToken });
await until(() => oldAdmin.views.length && oldTeam.views.length, 10_000, 'recovered room');
const recovered = oldTeam.views.at(-1).round;
check(
  'a production database: the open round is recovered with synthetic scenes only',
  recovered?.id === prodRoundId && recovered.scenes.length > 0 && recovered.scenes.every((s) => /^t\d+$/.test(s.id)) && leaks(JSON.stringify(oldTeam.views)).length === 0,
  `${recovered?.scenes.length} scenes: ${recovered?.scenes.map((s) => s.id).join(',')}`,
);
const prodClipStatus = await Promise.all(prodIds.map((id) => api(`/api/rounds/${prodRoundId}/media/${id}`, { token: prodTeamToken }).then((r) => r.status)));
check(`every production asset id in that production round is refused (${prodIds.length} × 403)`, prodClipStatus.every((s) => s === 403), [...new Set(prodClipStatus)].join(','));
oldAdmin.s.disconnect();
oldTeam.s.disconnect();

// ------------------------------------------------------------------ 2. six synthetic rounds
const media = [];
const rooms = [];
for (let qi = 0; qi < 6; qi++) {
  const code = JSON.parse((await api('/api/admin/rooms', { method: 'POST', token: adminToken })).text).code;
  if (qi > 0) {
    const db = new Database(sharedDb);
    db.prepare("UPDATE rooms SET question_index = ?, phase = 'ready' WHERE code = ?").run(qi, code);
    db.close();
  }
  const admin = connect({ token: adminToken, roomCode: code });
  await until(() => admin.views.length, 10_000, 'admin');
  const pin = admin.views.at(-1).teams[0].pin;
  const teamToken = JSON.parse((await api('/api/join', { method: 'POST', body: { code, pin } })).text).token;
  const team = connect({ token: teamToken });
  const pairing = JSON.parse((await api(`/api/admin/rooms/${code}/screen-pairing`, { method: 'POST', token: adminToken })).text);
  const screen = connect({ token: JSON.parse((await api('/api/screen/pair', { method: 'POST', body: { secret: pairing.secret } })).text).token });
  const seen = new Set();
  team.s.on('state', (v) => {
    for (const s of v.round?.scenes ?? []) {
      if (s.kind !== 'video' || seen.has(s.id)) continue;
      seen.add(s.id);
      media.push(api(`/api/rounds/${v.round.id}/media/${s.media.assetId}`, { token: teamToken }).then((r) => ({ q: qi + 1, scene: s.id, status: r.status, sha: createHash('sha256').update(r.buf).digest('hex'), bytes: r.buf.length, type: r.status })));
    }
  });
  await until(() => team.views.length && screen.views.length, 10_000, 'team and projector');
  rooms.push({ qi, code, admin, team, screen, teamToken });
}
await Promise.all(rooms.map((r) => ackOf(r.admin, 'admin:start', {})));
await until(() => rooms.every((r) => r.team.views.at(-1)?.round), 10_000, 'rounds');
check('six synthetic rounds started (questions 1–6 in parallel rooms)', rooms.every((r, i) => r.team.views.at(-1).round.questionNumber === i + 1));
const roundIds = rooms.map((r) => r.team.views.at(-1).round.id);
// Direct URLs while the rounds run: production asset ids, production paths, attribution paths.
const direct = [];
for (const [i, r] of rooms.entries()) for (const id of prodIds) direct.push(api(`/api/rounds/${roundIds[i]}/media/${id}`, { token: r.teamToken }).then((x) => x.status));
const directStatus = await Promise.all(direct);
check(`every production asset id in every synthetic round is refused (${directStatus.length} × 403)`, directStatus.every((s) => s === 403), [...new Set(directStatus)].join(','));
const indexHtml = readFileSync(join(ROOT, 'dist/index.html'));
const paths = [...prodFiles.map((f) => `/${f}`), ...prodFiles.map((f) => `/server/media/${f}`), ...prodFiles.slice(0, 3).map((f) => `/media/${f}`), '/server/content/attribution.json', '/server/content/questions.ts', '/media/sources.json', '/media/sources.lock.json', '/media/q1/manifest.json', '/media/q1/build-report.json', '/attribution.json', '/api/attribution', '/api/sources', '/api/questions', '/data/trial-media/trial-q1-1.mp4', '/trial-media/trial-q1-1.mp4', '/%2e%2e/server/content/attribution.json'];
const exposed = [];
for (const p of paths) {
  const r = await api(p);
  if (!(r.status === 404 || r.buf.equals(indexHtml))) exposed.push(`${p} ${r.status}`);
}
check(`no production or trial file and no attribution data over plain HTTP (${paths.length} paths: SPA index or 404)`, exposed.length === 0, exposed.join(', '));

await sleep(Math.max(0, rooms[0].team.views.at(-1).round.deadlineAt + 2_500 - Date.now()));
await until(() => rooms.every((r) => r.team.views.at(-1)?.reveal), 20_000, 'reveals');
const downloads = await Promise.all(media);
check('all synthetic clips were served (200) to the teams', downloads.length >= 20 && downloads.every((d) => d.status === 200), `${downloads.length} clips, ${Math.round(downloads.reduce((n, d) => n + d.bytes, 0) / 1024)} KB`);
const sameAsProd = downloads.filter((d) => prodHashes.has(d.sha));
check(`no served clip is byte-identical to any of the ${prodHashes.size} production MP4s`, sameAsProd.length === 0, sameAsProd.map((d) => `Q${d.q} ${d.scene}`).join(', '));
const reveals = rooms.map((r) => r.team.views.at(-1).reveal);
check('results reveal synthetic answers and no attribution (credits null)', reveals.every((x) => x.attribution === null && !prodAnswers.includes(normalizeAnswer(x.canonicalAnswer))), reveals.map((x) => x.canonicalAnswer).join(' / '));
const leaked = frames.flatMap((f) => leaks(f));
check(`no production answer, text, credit, URL, creator, asset id or file name in any of ${frames.length} state frames (admin, team, projector)`, leaked.length === 0, [...new Set(leaked)].slice(0, 5).join(', '));
check('server log mentions no production content and no password', leaks(trial.out()).length === 0 && !trial.out().includes(PASSWORD));

for (const r of rooms) for (const k of ['admin', 'team', 'screen']) r[k].s.disconnect();
await stop(trial);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
