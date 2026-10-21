import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connectIo, type Socket } from 'socket.io-client';
import type { AdminView, RoomView, ScreenView, TeamView } from '../shared/protocol';
import type { Scene } from '../shared/scenes';
import { startApp, type RunningApp } from './app';
import type { ServerQuestion } from './content/questions';
import { MediaRegistry } from './media/registry';
import { fakeTime } from './test-utils';
import { createProxy } from '../e2e/lib/netproxy.mjs';

// Network-failure scenarios at the protocol level (real HTTP + Socket.IO server, real clients,
// deterministic server clock). Browser-level network conditions are covered by e2e/resilience.mjs.

const PASSWORD = 'resilience-test-password';
const ROUND_MS = 40_000;
const TIMELINE: Scene[] = [
  { id: 'a', kind: 'image', at: 0, media: { assetId: 'img-a' } },
  { id: 'b', kind: 'text-card', at: 10_000, body: 'Gợi ý hai' },
  { id: 'c', kind: 'image', at: 20_000, media: { assetId: 'img-c' } },
];
const QUESTIONS: ServerQuestion[] = [
  { id: 'r1', answer: 'BAO CẤP', scenes: TIMELINE },
  { id: 'r2', answer: 'WTO', scenes: [{ id: 'z', kind: 'text-card', at: 0, body: 'Câu hai' }] },
];

let mediaDir: string;
let app: RunningApp;
let t: ReturnType<typeof fakeTime>;
let sockets: Socket[] = [];

beforeEach(async () => {
  mediaDir = mkdtempSync(join(tmpdir(), 'hc-res-'));
  mkdirSync(join(mediaDir, 'clues'));
  writeFileSync(join(mediaDir, 'clues/a.webp'), 'A');
  writeFileSync(join(mediaDir, 'clues/c.webp'), 'C');
  t = fakeTime();
  app = await startApp({
    dbPath: ':memory:',
    adminPassword: PASSWORD,
    roundDurationMs: ROUND_MS,
    questions: QUESTIONS,
    clock: t.clock,
    scheduler: t.scheduler,
    staticDir: null,
    media: new MediaRegistry(
      [
        { id: 'img-a', kind: 'image', file: 'clues/a.webp', mime: 'image/webp' },
        { id: 'img-c', kind: 'image', file: 'clues/c.webp', mime: 'image/webp' },
      ],
      mediaDir,
    ),
  });
});
afterEach(async () => {
  sockets.forEach((s) => s.disconnect());
  sockets = [];
  await app.close();
  rmSync(mediaDir, { recursive: true, force: true });
});

const call = async (path: string, body: unknown, token?: string) =>
  (await (
    await fetch(app.url + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    })
  ).json()) as Record<string, string>;

type Client = Socket & { states: RoomView[]; latest: () => RoomView };
async function connect(auth: Record<string, string>): Promise<Client> {
  const s = connectIo(app.url, { auth, transports: ['websocket'], forceNew: true, reconnection: false }) as Client;
  s.states = [];
  s.latest = () => s.states[s.states.length - 1]!;
  s.on('state', (v: RoomView) => s.states.push(v));
  sockets.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once('state', () => resolve());
    s.once('connect_error', reject);
  });
  return s;
}
type SubmitAck = { ok: boolean; error?: string; receivedAt?: number; duplicate?: boolean };
const submit = (s: Socket, roundId: string, submissionId: string, answer: string) =>
  new Promise<SubmitAck>((resolve) => s.emit('team:submit', { roundId, submissionId, answer }, resolve));
const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));

async function room() {
  const admin = (await call('/api/admin/login', { password: PASSWORD })).token!;
  const code = (await call('/api/admin/rooms', {}, admin)).code!;
  const roomId = app.db.roomByCode(code)!.id;
  const pins = app.engine.teams(roomId).map((x) => x.pin);
  const teamTokens: string[] = [];
  for (const pin of pins) teamTokens.push((await call('/api/join', { code, pin })).token!);
  const secret = (await call(`/api/admin/rooms/${code}/screen-pairing`, {}, admin)).secret!;
  const screenToken = (await call('/api/screen/pair', { secret })).token!;
  return { admin, code, roomId, teamTokens, screenToken };
}
const rowsFor = (roundId: string) => app.db.submissionsByRound(roundId);

describe('disconnect during answer submission', () => {
  it('disconnect before submit: nothing recorded; the team can submit after reconnecting', async () => {
    const r = await room();
    const round = app.engine.startRound(r.roomId);
    const s1 = await connect({ token: r.teamTokens[0]! });
    s1.disconnect();
    expect(rowsFor(round.id)).toHaveLength(0);
    const s2 = await connect({ token: r.teamTokens[0]! });
    expect((await submit(s2, round.id, 'sub-before-0001', 'bao cap')).ok).toBe(true);
    expect(rowsFor(round.id)).toHaveLength(1);
  });

  it('disconnect immediately after Submit: the packet may never arrive — nothing is recorded, the retry records it once', async () => {
    const r = await room();
    const round = app.engine.startRound(r.roomId);
    const s1 = await connect({ token: r.teamTokens[0]! });
    let acked = false;
    s1.emit('team:submit', { roundId: round.id, submissionId: 'sub-lostsend-01', answer: 'BAO CẤP' }, () => (acked = true));
    s1.disconnect(); // dropped before delivery
    await settle();
    expect(acked).toBe(false);
    expect(rowsFor(round.id)).toHaveLength(0); // the client must treat this as *unconfirmed*, not recorded
    const s2 = await connect({ token: r.teamTokens[0]! });
    expect(await submit(s2, round.id, 'sub-lostsend-01', 'BAO CẤP')).toMatchObject({ ok: true, duplicate: false });
    expect(rowsFor(round.id)).toHaveLength(1);
  });

  it('acknowledgement lost: the server recorded it once; the retry with the same id is a duplicate', async () => {
    const r = await room();
    const round = app.engine.startRound(r.roomId);
    t.advance(3_000);
    // Route this device through a proxy so the server→client direction can be cut precisely.
    const proxy = await createProxy(Number(new URL(app.url).port));
    const s1 = connectIo(`http://127.0.0.1:${proxy.port}`, { auth: { token: r.teamTokens[1]! }, transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(s1);
    await new Promise((resolve) => s1.once('state', resolve));
    proxy.set({ dropDownstream: true }); // replies (incl. the ack) are lost from now on
    let acked = false;
    s1.emit('team:submit', { roundId: round.id, submissionId: 'sub-acklost-001', answer: 'BAO CẤP' }, () => (acked = true));
    for (let i = 0; i < 50 && rowsFor(round.id).length === 0; i++) await settle(20);
    await settle();
    expect(acked).toBe(false);
    proxy.cut();
    await proxy.close();
    const rows = rowsFor(round.id);
    expect(rows).toHaveLength(1);
    const receivedAt = rows[0]!.received_at;

    // Refresh / reconnect: the view already shows the recorded submission (confirmed by the server).
    t.advance(5_000);
    const s2 = await connect({ token: r.teamTokens[1]! });
    expect((s2.latest() as TeamView).me.submission).toEqual({ answer: 'BAO CẤP', receivedAt });
    // The client still retries its pending submission: same id → duplicate, original receipt time.
    expect(await submit(s2, round.id, 'sub-acklost-001', 'BAO CẤP')).toEqual({ ok: true, receivedAt, duplicate: true });
    // Trying a different answer after reconnecting is refused.
    expect(await submit(s2, round.id, 'sub-acklost-002', 'tem phiếu')).toMatchObject({ ok: false, error: 'already_submitted' });
    expect(rowsFor(round.id)).toHaveLength(1);
  });

  it('two devices of the same team retry the same submission concurrently: recorded once', async () => {
    const r = await room();
    const round = app.engine.startRound(r.roomId);
    const [d1, d2] = await Promise.all([connect({ token: r.teamTokens[2]! }), connect({ token: r.teamTokens[2]! })]);
    const acks = await Promise.all([submit(d1, round.id, 'sub-twodev-0001', 'bao cap'), submit(d2, round.id, 'sub-twodev-0001', 'bao cap'), submit(d1, round.id, 'sub-twodev-0001', 'bao cap')]);
    expect(acks.every((a) => a.ok)).toBe(true);
    expect(acks.filter((a) => a.duplicate)).toHaveLength(2);
    expect(new Set(acks.map((a) => a.receivedAt)).size).toBe(1);
    expect(rowsFor(round.id)).toHaveLength(1);
  });

  it('reconnecting after the deadline: an unrecorded answer is refused; a recorded one is confirmed', async () => {
    const r = await room();
    const round = app.engine.startRound(r.roomId);
    const recorder = await connect({ token: r.teamTokens[0]! });
    expect((await submit(recorder, round.id, 'sub-recorded-01', 'BAO CẤP')).ok).toBe(true);
    recorder.disconnect();
    t.advanceTo(round.deadline_at + 15_000); // both devices were offline across the deadline
    const late = await connect({ token: r.teamTokens[3]! });
    expect(await submit(late, round.id, 'sub-late-000001', 'BAO CẤP')).toMatchObject({ ok: false, error: 'round_closed' });
    const back = await connect({ token: r.teamTokens[0]! });
    const retry = await submit(back, round.id, 'sub-recorded-01', 'BAO CẤP');
    expect(retry).toMatchObject({ ok: true, duplicate: true });
    expect(rowsFor(round.id)).toHaveLength(1);
    // Scoring unchanged and not duplicated.
    const reveal = (back.latest() as TeamView).reveal!;
    expect(reveal.submissions.filter((s) => s.points > 0).map((s) => s.points)).toEqual([50]);
  });

  it('no client clock or payload can extend the deadline', async () => {
    const r = await room();
    const round = app.engine.startRound(r.roomId);
    const s = await connect({ token: r.teamTokens[4]! });
    t.advanceTo(round.deadline_at);
    const ack = await new Promise<{ ok: boolean; error?: string }>((resolve) =>
      s.emit('team:submit', { roundId: round.id, submissionId: 'sub-clienttime1', answer: 'BAO CẤP', clientTime: round.started_at + 1_000, receivedAt: 1 }, resolve),
    );
    expect(ack).toMatchObject({ ok: false });
    expect(rowsFor(round.id)).toHaveLength(0);
  });
});

describe('many clients reconnecting at once', () => {
  it('admin, five teams and the projector all reconnect mid-round: same round, deadline and scenes; nothing leaks', async () => {
    const r = await room();
    const round = app.engine.startRound(r.roomId);
    const all = async () => [
      await connect({ token: r.admin, roomCode: r.code }),
      ...(await Promise.all(r.teamTokens.map((token) => connect({ token })))),
      await connect({ token: r.screenToken }),
    ];
    const first = await all();
    t.advanceTo(round.started_at + 12_000);
    expect((await submit(first[1]!, round.id, 'sub-mass-00001', 'bao cap')).ok).toBe(true);
    expect((await submit(first[2]!, round.id, 'sub-mass-00002', 'sai')).ok).toBe(true);
    await settle();
    const before = (first[6]!.latest() as ScreenView).round!;

    for (const s of first) s.disconnect(); // everyone drops at the same time (e.g. Wi-Fi blip)
    t.advanceTo(round.started_at + 21_000); // scene c released while everybody was offline
    const second = await all(); // and everyone comes back at once

    for (const s of second) {
      const v = s.latest();
      expect(v.round!.id).toBe(round.id);
      expect(v.round!.startedAt).toBe(round.started_at);
      expect(v.round!.deadlineAt).toBe(round.deadline_at);
      expect(v.round!.scenes.map((x) => x.id)).toEqual(['a', 'b', 'c']);
      expect(v.reveal).toBeNull();
    }
    // Release times never change across reconnects.
    const after = (second[6]!.latest() as ScreenView).round!;
    expect(after.scenes.slice(0, 2).map((x) => x.releasedAt)).toEqual(before.scenes.map((x) => x.releasedAt));
    // Submissions stayed submitted; the projector only sees the count; the admin the flags.
    expect((second[1]!.latest() as TeamView).me.submission?.answer).toBe('bao cap');
    expect((second[6]!.latest() as ScreenView).submittedCount).toBe(2);
    expect((second[0]!.latest() as AdminView).teams.filter((x) => x.submitted)).toHaveLength(2);
    // The projector still has no admin privileges after reconnecting.
    const forbidden = await new Promise<{ ok: boolean; error?: string }>((resolve) => second[6]!.emit('admin:start', {}, resolve));
    expect(forbidden).toEqual({ ok: false, error: 'forbidden' });
    // No future media is reachable for anyone (scene c is released, nothing beyond exists).
    const status = (await fetch(`${app.url}/api/rounds/${round.id}/media/img-a`, { headers: { authorization: `Bearer ${r.screenToken}` } })).status;
    expect(status).toBe(200);

    t.advanceTo(round.deadline_at);
    await settle();
    const reveal = (second[3]!.latest() as TeamView).reveal!;
    expect(reveal.submissions.filter((s) => s.points > 0)).toHaveLength(1);
    expect(rowsFor(round.id)).toHaveLength(2);
  });
});

describe('submissions are bound to their original round (stale-round retries)', () => {
  /** Q1 runs to its deadline and the admin advances and starts Q2. */
  async function q1ThenQ2(r: Awaited<ReturnType<typeof room>>) {
    const q1 = app.engine.startRound(r.roomId);
    return {
      q1,
      startQ2: () => {
        t.advanceTo(q1.deadline_at);
        app.engine.advance(r.roomId);
        t.advance(5_000);
        return app.engine.startRound(r.roomId);
      },
    };
  }

  it('CRITICAL: an offline Q1 answer retried after Q2 started is never recorded for Q2', async () => {
    const r = await room();
    const { q1, startQ2 } = await q1ThenQ2(r);
    // The team confirmed a Q1 answer while offline: nothing reached the server.
    const q2 = startQ2();
    const s = await connect({ token: r.teamTokens[0]! });
    // The device reconnects and retries its pending Q1 answer immediately (before re-rendering Q2).
    expect(await submit(s, q1.id, 'sub-q1-offline-1', 'BAO CẤP')).toMatchObject({ ok: false, error: 'round_closed' });
    expect(rowsFor(q2.id)).toHaveLength(0);
    expect(rowsFor(q1.id)).toHaveLength(0);
    // The team can still answer Q2 normally.
    expect(await submit(s, q2.id, 'sub-q2-answer-1', 'wto')).toMatchObject({ ok: true, duplicate: false });
    expect(rowsFor(q2.id)).toHaveLength(1);
  });

  it('Q1 accepted with a lost ack, then Q2 starts: the retry reconciles to Q1 and touches nothing in Q2', async () => {
    const r = await room();
    const { q1, startQ2 } = await q1ThenQ2(r);
    const s1 = await connect({ token: r.teamTokens[1]! });
    const first = await submit(s1, q1.id, 'sub-q1-recorded1', 'BAO CẤP');
    s1.disconnect(); // pretend this ack was lost
    const q2 = startQ2();
    const s2 = await connect({ token: r.teamTokens[1]! });
    expect(await submit(s2, q1.id, 'sub-q1-recorded1', 'BAO CẤP')).toEqual({ ok: true, receivedAt: first.receivedAt, duplicate: true });
    expect(rowsFor(q2.id)).toHaveLength(0);
    expect(rowsFor(q1.id)).toHaveLength(1);
    expect(app.engine.standings(r.roomId).find((x) => x.score > 0)?.score).toBe(50); // scored once, in Q1
  });

  it('retry after closure (revealed) and after the admin advanced (ready): stale, never re-targeted', async () => {
    const r = await room();
    const q1 = app.engine.startRound(r.roomId);
    const s = await connect({ token: r.teamTokens[2]! });
    t.advanceTo(q1.deadline_at);
    expect(app.engine.phaseOf(r.roomId)).toBe('revealed');
    expect(await submit(s, q1.id, 'sub-closed-00001', 'BAO CẤP')).toMatchObject({ ok: false, error: 'round_closed' });
    app.engine.advance(r.roomId);
    expect(app.engine.phaseOf(r.roomId)).toBe('ready');
    expect(await submit(s, q1.id, 'sub-closed-00001', 'BAO CẤP')).toMatchObject({ ok: false, error: 'round_closed' });
    expect(rowsFor(q1.id)).toHaveLength(0);
  });

  it('two devices of one team: a stale Q1 retry from device A cannot replace device B\'s Q2 answer', async () => {
    const r = await room();
    const { q1, startQ2 } = await q1ThenQ2(r);
    const q2 = startQ2();
    const [a, b] = await Promise.all([connect({ token: r.teamTokens[3]! }), connect({ token: r.teamTokens[3]! })]);
    expect((await submit(b, q2.id, 'sub-devb-q2-0001', 'wto')).ok).toBe(true);
    expect(await submit(a, q1.id, 'sub-deva-q1-0001', 'BAO CẤP')).toMatchObject({ ok: false, error: 'round_closed' });
    expect(rowsFor(q2.id).map((x) => x.client_submission_id)).toEqual(['sub-devb-q2-0001']);
    // And device A cannot add a second Q2 answer either.
    expect(await submit(a, q2.id, 'sub-deva-q2-0001', 'khác')).toMatchObject({ ok: false, error: 'already_submitted' });
  });

  it('missing, malformed, unknown or other-room round ids are rejected', async () => {
    const r = await room();
    const other = await room();
    const q1 = app.engine.startRound(r.roomId);
    const otherRound = app.engine.startRound(other.roomId);
    const s = await connect({ token: r.teamTokens[0]! });
    const raw = (payload: object) => new Promise<SubmitAck>((resolve) => s.emit('team:submit', payload, resolve));
    expect(await raw({ submissionId: 'sub-noround-0001', answer: 'BAO CẤP' })).toMatchObject({ ok: false, error: 'invalid' });
    expect(await raw({ roundId: 42, submissionId: 'sub-noround-0002', answer: 'BAO CẤP' })).toMatchObject({ ok: false, error: 'invalid' });
    expect(await submit(s, 'does-not-exist-round', 'sub-noround-0003', 'BAO CẤP')).toMatchObject({ ok: false, error: 'invalid' });
    expect(await submit(s, otherRound.id, 'sub-noround-0004', 'BAO CẤP')).toMatchObject({ ok: false, error: 'invalid' });
    expect(rowsFor(q1.id)).toHaveLength(0);
    expect(rowsFor(otherRound.id)).toHaveLength(0);
  });
});

describe('stale-round retries across a server restart', () => {
  it('after a restart, a pending Q1 answer is still never recorded for Q2; a recorded one reconciles', async () => {
    const { mkdtempSync: mk, rmSync: rm } = await import('node:fs');
    const { openDb } = await import('./db');
    const { GameEngine } = await import('./engine');
    const dir = mk(join(tmpdir(), 'hc-stale-'));
    try {
      const path = join(dir, 'g.sqlite');
      const reg = new MediaRegistry(
        [
          { id: 'img-a', kind: 'image', file: 'clues/a.webp', mime: 'image/webp' },
          { id: 'img-c', kind: 'image', file: 'clues/c.webp', mime: 'image/webp' },
        ],
        mediaDir,
      );
      const time = fakeTime();
      const db1 = openDb(path);
      const e1 = new GameEngine(db1, { questions: QUESTIONS, roundDurationMs: ROUND_MS, registry: reg, clock: time.clock, scheduler: time.scheduler });
      const { room: rm1, teams } = e1.createRoom();
      const q1 = e1.startRound(rm1.id);
      const recorded = e1.submit(rm1.id, teams[0]!.id, 'sub-before-crash', 'BAO CẤP', q1.id);
      time.advanceTo(q1.deadline_at);
      e1.advance(rm1.id);
      const q2 = e1.startRound(rm1.id);
      e1.dispose();
      db1.close();

      const db2 = openDb(path); // restart
      const e2 = new GameEngine(db2, { questions: QUESTIONS, roundDurationMs: ROUND_MS, registry: reg, clock: time.clock, scheduler: time.scheduler });
      e2.recover();
      expect(() => e2.submit(rm1.id, teams[1]!.id, 'sub-offline-q1-1', 'BAO CẤP', q1.id)).toThrow(/that round is over/);
      expect(e2.submit(rm1.id, teams[0]!.id, 'sub-before-crash', 'BAO CẤP', q1.id)).toEqual({ receivedAt: recorded.receivedAt, duplicate: true });
      expect(db2.submissionsByRound(q2.id)).toHaveLength(0);
      expect(db2.submissionsByRound(q1.id)).toHaveLength(1);
      e2.dispose();
      db2.close();
    } finally {
      rm(dir, { recursive: true, force: true });
    }
  });
});
