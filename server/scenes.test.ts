import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connectIo, type Socket } from 'socket.io-client';
import type { RoomView, TeamView } from '../shared/protocol';
import { normalizeAnswer } from '../shared/normalize';
import type { Scene } from '../shared/scenes';
import { startApp, type RunningApp } from './app';
import { QUESTIONS, type ServerQuestion } from './content/questions';
import { openDb } from './db';
import { GameEngine } from './engine';
import { MEDIA_ASSETS, MediaRegistry, type MediaAsset } from './media/registry';
import { validateTimeline } from './scenes/validate';
import { fakeTime, startActive } from './test-utils';
import { teamView } from './views';

// ------------------------------------------------------------------ fixtures
const ROUND_MS = 40_000;
const IMG_BYTES = Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 fake-image-bytes');
const VID_BYTES = Buffer.alloc(4096, 7);

let mediaDir: string;
let registry: MediaRegistry;
const ASSETS: MediaAsset[] = [
  { id: 'img-early', kind: 'image', file: 'clues/a.webp', mime: 'image/webp' },
  { id: 'img-late', kind: 'image', file: 'clues/b.webp', mime: 'image/webp' },
  { id: 'vid-clip', kind: 'video', file: 'clips/c.mp4', mime: 'video/mp4', durationMs: 8_000 },
  { id: 'img-other-q', kind: 'image', file: 'clues/c.webp', mime: 'image/webp' },
];

const TIMELINE: Scene[] = [
  { id: 'a', kind: 'image', at: 0, media: { assetId: 'img-early' }, caption: 'Ảnh mở đầu' },
  { id: 'b', kind: 'text-card', at: 10_000, body: 'Một gợi ý bằng chữ', transition: 'slide' },
  { id: 'c', kind: 'image', at: 20_000, media: { assetId: 'img-late' }, transition: 'zoom' },
  { id: 'd', kind: 'video', at: 30_000, media: { assetId: 'vid-clip' }, transition: 'cut' },
  { id: 'e', kind: 'statistic', at: 38_000, value: '42', label: 'Minh hoạ', demo: true },
];
const TEST_QUESTIONS: ServerQuestion[] = [
  { id: 't1', answer: 'BAO CẤP', scenes: TIMELINE },
  { id: 't2', answer: 'WTO', scenes: [{ id: 'z', kind: 'image', at: 0, media: { assetId: 'img-other-q' } }] },
];

beforeEach(() => {
  mediaDir = mkdtempSync(join(tmpdir(), 'hc-media-'));
  mkdirSync(join(mediaDir, 'clues'));
  mkdirSync(join(mediaDir, 'clips'));
  writeFileSync(join(mediaDir, 'clues/a.webp'), IMG_BYTES);
  writeFileSync(join(mediaDir, 'clues/b.webp'), IMG_BYTES);
  writeFileSync(join(mediaDir, 'clues/c.webp'), IMG_BYTES);
  writeFileSync(join(mediaDir, 'clips/c.mp4'), VID_BYTES);
  writeFileSync(join(mediaDir, 'secret.txt'), 'top secret');
  registry = new MediaRegistry(ASSETS, mediaDir);
});
afterEach(() => rmSync(mediaDir, { recursive: true, force: true }));

// ------------------------------------------------------------------ validation
describe('timeline validation', () => {
  const v = (scenes: Scene[], answer = 'BAO CẤP') => validateTimeline(scenes, { answer, registry, roundMs: ROUND_MS, allowDemoStatistics: true });

  it('accepts a valid timeline and every shipped question', () => {
    expect(v(TIMELINE)).toEqual([]);
    const shipped = new MediaRegistry();
    for (const q of QUESTIONS) expect(validateTimeline(q.scenes, { answer: q.answer, registry: shipped }), q.id).toEqual([]);
    expect(shipped.missingFiles()).toEqual([]);
  });

  it.each<[string, Scene[], RegExp]>([
    ['empty', [], /empty/],
    ['first not at 0', [{ id: 'a', kind: 'text-card', at: 5, body: 'x' }], /released at 0/],
    ['duplicate ids', [{ id: 'a', kind: 'text-card', at: 0, body: 'x' }, { id: 'a', kind: 'text-card', at: 5, body: 'y' }], /duplicate id/],
    ['bad id', [{ id: 'Bad Id!', kind: 'text-card', at: 0, body: 'x' }], /invalid id/],
    ['negative / fractional', [{ id: 'a', kind: 'text-card', at: 0, body: 'x' }, { id: 'b', kind: 'text-card', at: 1.5, body: 'y' }], /non-negative integer/],
    ['unsorted', [{ id: 'a', kind: 'text-card', at: 0, body: 'x' }, { id: 'b', kind: 'text-card', at: 9000, body: 'y' }, { id: 'c', kind: 'text-card', at: 5000, body: 'z' }], /strictly increasing/],
    ['same time', [{ id: 'a', kind: 'text-card', at: 0, body: 'x' }, { id: 'b', kind: 'text-card', at: 0, body: 'y' }], /strictly increasing/],
    ['outside the round', [{ id: 'a', kind: 'text-card', at: 0, body: 'x' }, { id: 'b', kind: 'text-card', at: 60_000, body: 'y' }], /outside/],
    ['bad transition', [{ id: 'a', kind: 'text-card', at: 0, body: 'x', transition: 'spin' as never }], /transition/],
    ['bad duration', [{ id: 'a', kind: 'text-card', at: 0, body: 'x', durationMs: 70_000 }], /duration/],
    ['unknown asset', [{ id: 'a', kind: 'image', at: 0, media: { assetId: 'nope-123' } }], /unknown asset/],
    ['asset kind mismatch', [{ id: 'a', kind: 'video', at: 0, media: { assetId: 'img-early' } }], /does not match/],
    ['invalid clip segment', [{ id: 'a', kind: 'video', at: 0, media: { assetId: 'vid-clip' }, startMs: 5000, endMs: 9000 }], /segment/],
    ['clip past round end', [{ id: 'a', kind: 'text-card', at: 0, body: 'x' }, { id: 'b', kind: 'video', at: 35_000, media: { assetId: 'vid-clip' } }], /past the round end/],
    ['statistic without source', [{ id: 'a', kind: 'statistic', at: 0, value: '1', label: 'x' }], /source or demo/],
    ['answer in text', [{ id: 'a', kind: 'text-card', at: 0, body: 'Thời bao-cấp khó khăn' }], /reveals the answer/],
    ['answer in caption', [{ id: 'a', kind: 'image', at: 0, media: { assetId: 'img-early' }, caption: 'BAO CAP' }], /reveals the answer/],
  ])('rejects: %s', (_name, scenes, error) => {
    expect(v(scenes).join('\n')).toMatch(error);
  });

  it('the engine refuses to start with an invalid timeline', () => {
    const db = openDb(':memory:');
    expect(() => new GameEngine(db, { questions: [{ id: 'x', answer: 'WTO', scenes: [] }], roundDurationMs: ROUND_MS, registry })).toThrow(/invalid scene timeline/);
    db.close();
  });

  it('production content may never contain demo (fictional) statistics', () => {
    const demo: Scene[] = [{ id: 'a', kind: 'statistic', at: 0, value: '1', label: 'x', demo: true }];
    expect(validateTimeline(demo, { answer: 'WTO', registry }).join('\n')).toMatch(/not allowed in production/);
    const db = openDb(':memory:');
    expect(() => new GameEngine(db, { questions: [{ id: 'x', answer: 'WTO', scenes: demo }], roundDurationMs: ROUND_MS, registry })).toThrow(/not allowed in production/);
    db.close();
    for (const q of QUESTIONS) {
      for (const sc of q.scenes) {
        if (sc.kind === 'statistic') {
          expect(sc.demo, `${q.id}/${sc.id}`).toBeFalsy();
          expect(sc.source, `${q.id}/${sc.id}`).toBeTruthy();
        }
      }
    }
  });

  it('round duration must be within the authored 40 s', () => {
    const db = openDb(':memory:');
    for (const bad of [0, -1, 40_001, 1.5]) {
      expect(() => new GameEngine(db, { questions: QUESTIONS, roundDurationMs: bad })).toThrow(/round duration/);
    }
    expect(() => new GameEngine(db, { questions: QUESTIONS, roundDurationMs: 15_000 })).not.toThrow();
    db.close();
  });

  it('registry rejects paths escaping the media root and bad ids', () => {
    expect(() => new MediaRegistry([{ id: 'evil-1', kind: 'image', file: '../secret.txt', mime: 'image/png' }], mediaDir)).toThrow(/inside the media root/);
    expect(() => new MediaRegistry([{ id: 'evil-2', kind: 'image', file: '/etc/passwd', mime: 'image/png' }], mediaDir)).toThrow(/inside the media root/);
    expect(() => new MediaRegistry([{ id: 'Bad/ID', kind: 'image', file: 'clues/a.webp', mime: 'image/png' }], mediaDir)).toThrow(/invalid asset id/);
    expect(registry.get('../secret')).toBeUndefined();
  });

  it('shipped asset ids are opaque and contain no answer', () => {
    for (const a of MEDIA_ASSETS) for (const q of QUESTIONS) expect(normalizeAnswer(a.id)).not.toContain(normalizeAnswer(q.answer));
  });
});

// ------------------------------------------------------------------ server with fake time
let app: RunningApp;
let t: ReturnType<typeof fakeTime>;
let sockets: Socket[] = [];
let dbDir: string;
const PASSWORD = 'scene-test-password';

async function boot(opts: { dbPath?: string; start?: number; ignoreCancel?: boolean; roundMs?: number } = {}) {
  t = fakeTime(opts.start ?? 1_000_000, { ignoreCancel: opts.ignoreCancel });
  app = await startApp({
    dbPath: opts.dbPath ?? ':memory:',
    adminPassword: PASSWORD,
    roundDurationMs: ROUND_MS,
    questions: TEST_QUESTIONS,
    clock: t.clock,
    scheduler: t.scheduler,
    media: registry,
    staticDir: null,
    allowDemoStatistics: true, // the fixture timeline exercises the statistic scene with a demo figure
    ...(opts.roundMs ? { roundDurationMs: opts.roundMs } : {}),
  });
}
afterEach(async () => {
  sockets.forEach((s) => s.disconnect());
  sockets = [];
  await app?.close();
  if (dbDir) rmSync(dbDir, { recursive: true, force: true });
});

const post = async (path: string, body: unknown, token?: string) =>
  (await fetch(app.url + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }).then((r) => r.json())) as Record<string, string>;
const media = (roundId: string, assetId: string, token?: string, headers: Record<string, string> = {}) =>
  fetch(`${app.url}/api/rounds/${roundId}/media/${assetId}`, { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });

async function setupRoom() {
  const admin = (await post('/api/admin/login', { password: PASSWORD })).token!;
  const code = (await post('/api/admin/rooms', {}, admin)).code!;
  const roomId = app.db.roomByCode(code)!.id;
  const pins = app.engine.teams(roomId).map((x) => x.pin);
  const team = (await post('/api/join', { code, pin: pins[0] })).token!;
  return { admin, code, roomId, team, pins };
}

describe('scene release on the server clock', () => {
  it('releases each scene exactly at its offset (t−1 ms hidden, t visible)', async () => {
    await boot();
    const { roomId } = await setupRoom();
    const round = startActive(app.engine, roomId, t);
    const sceneIds = () => app.engine.roundView(app.engine.openRound(roomId)!).scenes.map((s) => s.id);
    expect(sceneIds()).toEqual(['a']);
    t.advanceTo(round.started_at + 10_000 - 1);
    expect(sceneIds()).toEqual(['a']);
    t.advanceTo(round.started_at + 10_000);
    expect(sceneIds()).toEqual(['a', 'b']);
    t.advanceTo(round.started_at + 38_000);
    expect(sceneIds()).toEqual(['a', 'b', 'c', 'd', 'e']);
    const released = app.engine.roundView(app.engine.openRound(roomId)!).scenes;
    expect(released.map((s) => s.releasedAt)).toEqual([0, 10_000, 20_000, 30_000, 38_000].map((x) => round.started_at + x));
  });

  it('pushes a fresh view to clients at each release time', async () => {
    await boot();
    const { roomId, team } = await setupRoom();
    const s = connectIo(app.url, { auth: { token: team }, transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(s);
    const views: TeamView[] = [];
    s.on('state', (v: RoomView) => views.push(v as TeamView));
    await new Promise((r) => s.once('state', r));
    const round = startActive(app.engine, roomId, t);
    t.advanceTo(round.started_at + 20_000);
    await new Promise((r) => setTimeout(r, 100));
    const seen = views.filter((v) => v.round).map((v) => v.round!.scenes.map((x) => x.id).join(','));
    expect(seen).toContain('a');
    expect(seen).toContain('a,b');
    expect(seen).toContain('a,b,c');
  });

  it('a stale timer cannot push into a later round', () => {
    // Manual scheduler: we decide which timers fire, and when.
    let now = 1_000_000;
    const tasks: { at: number; fn: () => void }[] = [];
    const db = openDb(':memory:');
    const changes: number[] = [];
    const engine = new GameEngine(db, {
      questions: TEST_QUESTIONS,
      roundDurationMs: ROUND_MS,
      registry,
      allowDemoStatistics: true,
      clock: { now: () => now },
      scheduler: { at: (at, fn) => (tasks.push({ at, fn }), () => {}) }, // cancellation ignored on purpose
      onChange: () => changes.push(now),
    });
    const { room } = engine.createRoom();
    const r1 = engine.startRound(room.id);
    now = r1.started_at; // end of the intro (its activation timer is deliberately not run either)
    const r1SceneTimers = tasks.filter((x) => x.at < r1.deadline_at); // Q1 intro→active + release timers, never run so far
    expect(r1SceneTimers.length).toBe(5);
    now = r1.deadline_at;
    engine.closeRound(r1.id);
    engine.advance(room.id);
    now += 5_000;
    const r2 = engine.startRound(room.id);
    const before = changes.length;
    now = r2.started_at + 39_000; // well past every Q1 offset, Q2 still open
    for (const task of r1SceneTimers) task.fn(); // stale Q1 timers fire during Q2
    expect(changes.length).toBe(before); // no broadcasts caused by Q1 timers
    expect(engine.roundView(engine.openRound(room.id)!).scenes.map((x) => x.id)).toEqual(['z']);
    expect(engine.phaseOf(room.id)).toBe('active');
    db.close();
  });

  it('a release timer firing early is re-armed and never releases ahead of time', () => {
    let now = 1_000_000;
    const tasks: { at: number; fn: () => void }[] = [];
    const db = openDb(':memory:');
    const changes: number[] = [];
    const engine = new GameEngine(db, {
      questions: TEST_QUESTIONS,
      roundDurationMs: ROUND_MS,
      registry,
      allowDemoStatistics: true,
      clock: { now: () => now },
      scheduler: { at: (at, fn) => (tasks.push({ at, fn }), () => {}) },
      onChange: () => changes.push(now),
    });
    const { room } = engine.createRoom();
    const r = engine.startRound(room.id);
    now = r.started_at; // end of the intro
    const first = tasks.find((x) => x.at === r.started_at + 10_000)!;
    const n = tasks.length;
    now = first.at - 3; // timer fires 3 ms early (clock skew)
    first.fn();
    expect(changes.filter((c) => c === now)).toHaveLength(0);
    expect(tasks.length).toBe(n + 1); // re-armed
    expect(engine.roundView(engine.openRound(room.id)!).scenes.map((x) => x.id)).toEqual(['a']);
    db.close();
  });

  it('a late-joining client receives only released scenes', async () => {
    await boot();
    const { roomId, code, pins } = await setupRoom();
    const round = startActive(app.engine, roomId, t);
    t.advanceTo(round.started_at + 21_000);
    const late = (await post('/api/join', { code, pin: pins[3] })).token!;
    const s = connectIo(app.url, { auth: { token: late }, transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(s);
    const v = (await new Promise((r) => s.once('state', r))) as TeamView;
    expect(v.round!.scenes.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    const json = JSON.stringify(v);
    expect(json).not.toContain('vid-clip');
    expect(json).not.toContain('Minh hoạ');
  });

  it('views never carry future scenes, their assets or the answer', async () => {
    await boot();
    const { roomId } = await setupRoom();
    const round = startActive(app.engine, roomId, t);
    const teamId = app.engine.teams(roomId)[0]!.id;
    for (const at of [0, 9_999, 19_999, 29_999, 37_999]) {
      t.advanceTo(round.started_at + at);
      const json = JSON.stringify(teamView(app.engine, roomId, teamId));
      const future = TIMELINE.filter((s) => s.at > at);
      for (const f of future) {
        expect(json).not.toContain(`"id":"${f.id}"`);
        if ('media' in f) expect(json).not.toContain(f.media.assetId);
      }
      expect(normalizeAnswer(json)).not.toContain('baocap');
    }
  });

  it('a shorter test round never releases scenes at/after its deadline (views and media), even after close', async () => {
    await boot({ roundMs: 25_000 });
    expect(app.engine.unreleasableScenes().map((x) => x.sceneId)).toEqual(['d', 'e']);
    const { roomId, team } = await setupRoom();
    const round = startActive(app.engine, roomId, t);
    const ids = () => app.engine.roundView(app.engine.currentRound(roomId)!).scenes.map((x) => x.id);
    t.advanceTo(round.deadline_at - 1);
    expect(ids()).toEqual(['a', 'b', 'c']);
    t.advanceTo(round.deadline_at + 30_000); // closes at the deadline; time keeps moving
    expect(app.engine.phaseOf(roomId)).toBe('revealed');
    expect(ids()).toEqual(['a', 'b', 'c']);
    expect((await media(round.id, 'img-late', team)).status).toBe(200); // released before the deadline
    expect((await media(round.id, 'vid-clip', team)).status).toBe(403); // scene at 30 s never released
  });

  it('server restart keeps the original timeline', async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'hc-restart-'));
    const dbPath = join(dbDir, 'g.sqlite');
    await boot({ dbPath });
    const { roomId } = await setupRoom();
    const round = startActive(app.engine, roomId, t);
    t.advanceTo(round.started_at + 12_000);
    await app.close();

    await boot({ dbPath, start: round.started_at + 25_000 }); // "restart" 13 s later
    const ids = () => app.engine.roundView(app.engine.openRound(roomId)!).scenes.map((s) => s.id);
    expect(ids()).toEqual(['a', 'b', 'c']);
    expect(app.engine.openRound(roomId)!.deadline_at).toBe(round.deadline_at);
    t.advanceTo(round.started_at + 30_000);
    expect(ids()).toEqual(['a', 'b', 'c', 'd']);
    t.advanceTo(round.deadline_at);
    expect(app.engine.phaseOf(roomId)).toBe('revealed');
  });
});

describe('authenticated media endpoint', () => {
  it('requires a session', async () => {
    await boot();
    const { roomId } = await setupRoom();
    const round = startActive(app.engine, roomId, t);
    expect((await media(round.id, 'img-early')).status).toBe(401);
    expect((await media(round.id, 'img-early', 'forged-token')).status).toBe(401);
  });

  it('serves a released image with private no-store headers', async () => {
    await boot();
    const { roomId, team } = await setupRoom();
    const round = startActive(app.engine, roomId, t);
    const res = await media(round.id, 'img-early', team);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('etag')).toBeNull();
    expect(Buffer.from(await res.arrayBuffer())).toEqual(IMG_BYTES);
  });

  it('refuses an unreleased image until its exact release time (t−1 / t), for teams and admin alike', async () => {
    await boot();
    const { roomId, team, admin } = await setupRoom();
    const round = startActive(app.engine, roomId, t);
    t.advanceTo(round.started_at + 20_000 - 1);
    const early = await media(round.id, 'img-late', team);
    expect(early.status).toBe(403);
    expect(await early.json()).toEqual({ error: 'forbidden' });
    expect((await media(round.id, 'img-late', admin)).status).toBe(403);
    t.advanceTo(round.started_at + 20_000);
    expect((await media(round.id, 'img-late', team)).status).toBe(200);
    expect((await media(round.id, 'img-late', admin)).status).toBe(200);
  });

  it('unknown, unreleased, cross-round and malformed requests all get the same 403', async () => {
    await boot();
    const { roomId, team } = await setupRoom();
    const round = startActive(app.engine, roomId, t);
    const bodies = await Promise.all(
      [
        media(round.id, 'img-late', team), // not yet released
        media(round.id, 'does-not-exist', team), // unknown asset
        media(round.id, 'img-other-q', team), // asset of another question (cross-round)
        media('nonexistentround1', 'img-early', team), // unknown round
        media(round.id, 'IMG_EARLY', team), // malformed id
      ].map(async (p) => {
        const r = await p;
        return `${r.status} ${await r.text()}`;
      }),
    );
    expect(new Set(bodies)).toEqual(new Set(['403 {"error":"forbidden"}']));
  });

  it('rejects path traversal without exposing files', async () => {
    await boot();
    const { roomId, team } = await setupRoom();
    const round = startActive(app.engine, roomId, t);
    for (const evil of ['..%2Fsecret.txt', '..%2F..%2Fdb.ts', '%2e%2e%2fsecret.txt', 'clues%2Fa.webp', '..', '...']) {
      const res = await fetch(`${app.url}/api/rounds/${round.id}/media/${evil}`, { headers: { authorization: `Bearer ${team}` } });
      expect([403, 404]).toContain(res.status);
      const text = await res.text();
      expect(text).not.toContain('top secret');
      expect(text).not.toContain(mediaDir);
    }
  });

  it('a team cannot fetch media of a round in another room', async () => {
    await boot();
    const a = await setupRoom();
    const b = await setupRoom();
    const roundA = startActive(app.engine, a.roomId, t);
    startActive(app.engine, b.roomId, t);
    expect((await media(roundA.id, 'img-early', a.team)).status).toBe(200);
    expect((await media(roundA.id, 'img-early', b.team)).status).toBe(403);
  });

  it('serves video with range support once released', async () => {
    await boot();
    const { roomId, team } = await setupRoom();
    const round = startActive(app.engine, roomId, t);
    t.advanceTo(round.started_at + 29_999);
    expect((await media(round.id, 'vid-clip', team)).status).toBe(403);
    t.advanceTo(round.started_at + 30_000);
    const full = await media(round.id, 'vid-clip', team);
    expect(full.status).toBe(200);
    expect(full.headers.get('content-type')).toBe('video/mp4');
    expect((await full.arrayBuffer()).byteLength).toBe(VID_BYTES.length);
    const part = await media(round.id, 'vid-clip', team, { range: 'bytes=0-99' });
    expect(part.status).toBe(206);
    expect((await part.arrayBuffer()).byteLength).toBe(100);
  });

  it('after the round closes, all of its scenes stay viewable (review); the next round starts hidden again', async () => {
    await boot();
    const { roomId, team } = await setupRoom();
    const r1 = startActive(app.engine, roomId, t);
    t.advanceTo(r1.deadline_at);
    expect(app.engine.phaseOf(roomId)).toBe('revealed');
    expect((await media(r1.id, 'img-late', team)).status).toBe(200);
    expect((await media(r1.id, 'vid-clip', team)).status).toBe(200);
  });

  it('there is no public media path', async () => {
    await boot();
    for (const path of ['/clues/a.webp', '/media/clues/a.webp', '/server/media/clues/a.webp', '/api/media/img-early']) {
      const res = await fetch(app.url + path);
      expect(res.headers.get('content-type') ?? '').not.toMatch(/^image|^video/);
    }
  });
});

describe('scoring and submissions are unchanged by scenes', () => {
  it('a full round with scenes still scores 50/40 by receipt order', async () => {
    await boot();
    const { roomId } = await setupRoom();
    const [x, y] = app.engine.teams(roomId);
    startActive(app.engine, roomId, t);
    t.advance(25_000);
    app.engine.submit(roomId, y!.id, 'sub-yyyyyyyy', 'bao cap');
    t.advance(1_000);
    app.engine.submit(roomId, x!.id, 'sub-xxxxxxxx', 'BAO CẤP');
    t.advance(ROUND_MS);
    const reveal = app.engine.reveal(app.engine.currentRound(roomId)!);
    expect(reveal.submissions.filter((s) => s.correct).map((s) => [s.teamId, s.points])).toEqual([
      [y!.id, 50],
      [x!.id, 40],
    ]);
  });
});
