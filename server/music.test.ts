import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { startApp, type RunningApp } from './app';
import { fakeTime } from './test-utils';
import { resolveMusic } from './media/music';

let app: RunningApp, root: string, time: ReturnType<typeof fakeTime>;
async function call(path: string, token?: string, body?: object) {
  return fetch(app.url + path, { method: body ? 'POST' : 'GET', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
}
const data = async (response: Promise<Response>) => (await (await response).json()) as Record<string, string>;
async function room(admin: string) {
  const { code } = await data(call('/api/admin/rooms', admin, {}));
  const id = app.db.roomByCode(code!)!.id;
  const team = await data(call('/api/join', undefined, { code, pin: app.engine.teams(id)[0]!.pin }));
  const { secret } = await data(call(`/api/admin/rooms/${code}/screen-pairing`, admin, {}));
  const { token } = await data(call('/api/screen/pair', undefined, { secret }));
  return { code: code!, id, token: token!, team: team.token as string };
}
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'hc-music-test-')); time = fakeTime();
  // Generated fixture bytes: authorization tests do not depend on a real soundtrack or codec.
  for (const name of ['lobby', 'question']) writeFileSync(join(root, name + '.mp3'), Buffer.from([0x49, 0x44, 0x33, 0, 0, 0]));
  app = await startApp({ dbPath: ':memory:', adminPassword: 'music-test', roundDurationMs: 40000, musicRoot: root, clock: time.clock, scheduler: time.scheduler });
});
afterEach(async () => { await app.close(); rmSync(root, { recursive: true, force: true }); });
it('six rounds enforce projector/room/phase/current-round/deadline gates; no soundtrack prefetch', async () => {
  const { token: admin } = await data(call('/api/admin/login', undefined, { password: 'music-test' }));
  const a = await room(admin!), b = await room(admin!);
  const url = (track: string, id?: string) => `/api/screen/rooms/${a.code}/music/${track}${id ? '?roundId=' + id : ''}`;
  expect((await call(url('lobby'))).status).toBe(401);
  for (const t of [admin, a.team, b.token]) expect((await call(url('lobby'), t)).status).toBe(403);
  const lobby = await call(url('lobby'), a.token); expect(lobby.status).toBe(200); expect(lobby.headers.get('cache-control')).toContain('private, no-store'); expect(lobby.headers.get('content-type')).toContain('audio/mpeg');
  expect((await call(url('question'), a.token)).status).toBe(403);
  for (let q = 1; q <= 6; q++) {
    const r = app.engine.startRound(a.id);
    expect((await call(url('lobby'), a.token)).status).toBe(403);
    expect((await call(url('question'), a.token)).status).toBe(403);
    expect((await call(url('question', 'stale-round'), a.token)).status).toBe(403);
    expect((await call(url('question', r.id), a.token)).status).toBe(200);
    for (const t of [admin, a.team, b.token]) expect((await call(url('question', r.id), t)).status).toBe(403);
    time.advanceTo(r.deadline_at);
    expect((await call(url('question', r.id), a.token)).status).toBe(403);
    expect((await call(url('lobby'), a.token)).status).toBe(403);
    app.engine.advance(a.id);
    expect((await call(url('lobby'), a.token)).status).toBe(q === 6 ? 200 : 403);
  }
  expect((await call(url('arbitrary.mp3'), a.token)).status).toBe(403);
  expect((await call(`/api/screen/rooms/${a.code}/music/%2e%2e%2fquestion.mp3`, a.token)).status).toBe(403);
  await call(`/api/admin/rooms/${a.code}/screen-revoke`, admin, {});
  expect((await call(url('lobby'), a.token)).status).toBe(401);
});
it('optional missing files do not affect startup/game; realpath containment rejects symlinks', async () => {
  rmSync(join(root, 'lobby.mp3')); expect(resolveMusic(root, 'lobby')).toBeNull();
  const outside = join(tmpdir(), 'hc-outside-' + Date.now() + '.mp3'); writeFileSync(outside, 'outside');
  try { symlinkSync(outside, join(root, 'lobby.mp3')); expect(resolveMusic(root, 'lobby')).toBeNull(); } finally { rmSync(outside); }
  const { token: admin } = await data(call('/api/admin/login', undefined, { password: 'music-test' })); const a = await room(admin!);
  expect((await call(`/api/screen/rooms/${a.code}/music/lobby`, a.token)).status).toBe(404);
  expect(app.engine.startRound(a.id).deadline_at - time.now).toBe(40000);
});
it('expired projector session cannot fetch music', async () => {
  const { token: admin } = await data(call('/api/admin/login', undefined, { password: 'music-test' })); const a = await room(admin!);
  time.advance(6 * 60 * 60000);
  expect((await call(`/api/screen/rooms/${a.code}/music/lobby`, a.token)).status).toBe(401);
});
it('deadline denies new fetches even when the close callback has not run', async () => {
  await app.close();
  let now = 100000;
  app = await startApp({ dbPath: ':memory:', adminPassword: 'music-test', roundDurationMs: 40000, musicRoot: root, clock: { now: () => now }, scheduler: { at: () => () => {} } });
  const { token: admin } = await data(call('/api/admin/login', undefined, { password: 'music-test' })); const a = await room(admin!);
  const r = app.engine.startRound(a.id); now = r.deadline_at;
  expect(app.engine.room(a.id).phase).toBe('active');
  expect((await call(`/api/screen/rooms/${a.code}/music/question?roundId=${r.id}`, a.token)).status).toBe(403);
});
