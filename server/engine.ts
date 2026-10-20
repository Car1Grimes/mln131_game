// Authoritative game engine: an explicit per-room state machine persisted in SQLite.
//
//   lobby ──start──▶ active ──deadline (server)──▶ revealed ──advance──▶ ready ──start──▶ active …
//                                                   revealed ──advance (last question)──▶ finished
//
// The server alone decides timing (deadline from its own clock), submission order (receipt sequence
// assigned inside a SQLite transaction), correctness (computed only when the round closes) and scores.
import { isCorrectAnswer, answerPattern } from '../shared/normalize';
import type { ErrorCode, RoomPhase, RoundReveal, RoundView } from '../shared/protocol';
import { MAX_ANSWER_LENGTH, MAX_TEAM_NAME_LENGTH, TEAM_COUNT } from '../shared/protocol';
import { releasedScenes } from '../shared/scenes';
import { computeStandings, scoreRound, type RoundOutcome, type Standing } from '../shared/scoring';
import { newId, newPins, newRoomCode } from './auth';
import type { ServerQuestion } from './content/questions';
import { MediaRegistry, type MediaAsset } from './media/registry';
import { AUTHORED_ROUND_MS, validateTimeline } from './scenes/validate';
import type { Db, RoomRow, RoundRow, TeamRow } from './db';

export class GameError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface Clock {
  now(): number;
}
export interface Scheduler {
  /** Run `fn` at (or soon after) absolute server time `time`. Returns a cancel function. */
  at(time: number, fn: () => void): () => void;
}

export const systemClock: Clock = { now: () => Date.now() };
/** Node's setTimeout overflows above ~24.8 days (it would fire immediately); long waits are chained. */
const MAX_TIMEOUT_MS = 2_147_483_647;
export const timerScheduler = (clock: Clock = systemClock): Scheduler => ({
  at(time, fn) {
    let handle: ReturnType<typeof setTimeout>;
    const arm = () => {
      const delay = time - clock.now();
      handle = delay > MAX_TIMEOUT_MS ? setTimeout(arm, MAX_TIMEOUT_MS) : setTimeout(fn, Math.max(0, delay));
    };
    arm();
    return () => clearTimeout(handle);
  },
});

export interface EngineOptions {
  questions: readonly ServerQuestion[];
  roundDurationMs: number;
  clock?: Clock;
  scheduler?: Scheduler;
  /** Called after every state change of a room (broadcast hook). */
  onChange?: (roomId: string) => void;
  /** Server-only media registry used by image/video scenes. */
  registry?: MediaRegistry;
  /** Test fixtures only: allow statistic scenes marked `demo`. Never enabled in production. */
  allowDemoStatistics?: boolean;
}

const DEFAULT_TEAM_NAME = (slot: number) => `Đội ${slot}`;

export class GameEngine {
  private readonly clock: Clock;
  private readonly scheduler: Scheduler;
  private readonly timers = new Map<string, (() => void)[]>();
  readonly registry: MediaRegistry;

  constructor(
    private readonly db: Db,
    private readonly opts: EngineOptions,
  ) {
    this.clock = opts.clock ?? systemClock;
    this.scheduler = opts.scheduler ?? timerScheduler(this.clock);
    this.registry = opts.registry ?? new MediaRegistry();
    // Production rounds are 60 s; tests may shorten them, never lengthen them. Timelines are always
    // validated against the authored 60 s round; in a shorter test round, scenes at or after the
    // deadline are simply never released (see roundView / authorizeMedia).
    if (!Number.isInteger(opts.roundDurationMs) || opts.roundDurationMs <= 0 || opts.roundDurationMs > AUTHORED_ROUND_MS) {
      throw new Error(`round duration must be 1..${AUTHORED_ROUND_MS} ms, got ${opts.roundDurationMs}`);
    }
    // Refuse to run with an invalid scene timeline.
    const problems = opts.questions.flatMap((q, i) =>
      validateTimeline(q.scenes, { answer: q.answer, registry: this.registry, allowDemoStatistics: opts.allowDemoStatistics }).map((p) => `question ${i + 1}: ${p}`),
    );
    if (problems.length) throw new Error(`invalid scene timeline:\n  ${problems.join('\n  ')}`);
  }

  get questionCount(): number {
    return this.opts.questions.length;
  }

  now(): number {
    return this.clock.now();
  }

  // ------------------------------------------------------------------ rooms & teams

  createRoom(): { room: RoomRow; teams: TeamRow[] } {
    return this.db.transaction(() => {
      let code = newRoomCode();
      for (let i = 0; this.db.roomByCode(code); i++) {
        if (i > 20) throw new Error('could not allocate a room code');
        code = newRoomCode();
      }
      const roomId = newId();
      this.db.insertRoom(roomId, code, 'lobby', this.now());
      newPins(TEAM_COUNT).forEach((pin, i) =>
        this.db.insertTeam({ id: newId(), room_id: roomId, slot: i + 1, name: DEFAULT_TEAM_NAME(i + 1), pin }),
      );
      return { room: this.db.roomById(roomId)!, teams: this.db.teamsByRoom(roomId) };
    });
  }

  room(roomId: string): RoomRow {
    const room = this.db.roomById(roomId);
    if (!room) throw new GameError('not_found', 'room not found');
    return room;
  }

  teams(roomId: string): TeamRow[] {
    return this.db.teamsByRoom(roomId);
  }

  rename(roomId: string, teamId: string, rawName: string): void {
    const room = this.room(roomId);
    if (room.phase === 'active') throw new GameError('wrong_phase', 'cannot rename during a round');
    const name = String(rawName ?? '').trim().slice(0, MAX_TEAM_NAME_LENGTH);
    if (!name) throw new GameError('invalid', 'name is empty');
    if (this.db.renameTeam(roomId, teamId, name) === 0) throw new GameError('not_found', 'team not found');
    this.changed(roomId);
  }

  setReady(roomId: string, teamId: string, ready: boolean): void {
    if (this.db.setReady(roomId, teamId, ready) === 0) throw new GameError('not_found', 'team not found');
    this.changed(roomId);
  }

  // ------------------------------------------------------------------ rounds

  startRound(roomId: string): RoundRow {
    const round = this.db.transaction(() => {
      const room = this.room(roomId);
      if (room.phase !== 'lobby' && room.phase !== 'ready') throw new GameError('wrong_phase', `cannot start from ${room.phase}`);
      if (room.question_index >= this.questionCount) throw new GameError('wrong_phase', 'no more questions');
      const startedAt = this.now();
      const row = {
        id: newId(),
        room_id: roomId,
        question_index: room.question_index,
        kind: 'main' as const,
        started_at: startedAt,
        deadline_at: startedAt + this.opts.roundDurationMs,
      };
      this.db.insertRound(row); // UNIQUE(room, question, kind) prevents a second start of the same question
      this.db.setRoomState(roomId, 'active', room.question_index);
      return this.db.roundById(row.id)!;
    });
    this.scheduleRound(round);
    this.changed(roomId);
    return round;
  }

  /**
   * Record a team's answer. Atomic and idempotent: retrying with the same submissionId returns the
   * original receipt; a different submission from the same team is rejected. The team id always
   * comes from the authenticated session, never from the payload.
   *
   * `roundId` binds the submission to the round the team answered (required over the network,
   * see app.ts). A submission for a round that is no longer open is NEVER redirected to the current
   * round: it gets its original receipt if that exact submission was recorded, else round_closed.
   */
  submit(
    roomId: string,
    teamId: string,
    submissionId: unknown,
    rawAnswer: unknown,
    roundId?: unknown,
  ): { receivedAt: number; duplicate: boolean } {
    if (typeof submissionId !== 'string' || !/^[\w-]{8,64}$/.test(submissionId)) throw new GameError('invalid', 'bad submission id');
    if (typeof rawAnswer !== 'string') throw new GameError('invalid', 'answer must be text');
    const answer = rawAnswer.trim();
    if (!answer || answer.length > MAX_ANSWER_LENGTH) throw new GameError('invalid', 'answer is empty or too long');

    let closeDue: string | null = null;
    let result: { receivedAt: number; duplicate: boolean };
    try {
    result = this.db.transaction(() => {
      const room = this.room(roomId);
      const round = this.openRound(roomId);
      if (roundId !== undefined) {
        const target = typeof roundId === 'string' ? this.db.roundById(roundId) : undefined;
        if (!target || target.room_id !== roomId) throw new GameError('invalid', 'unknown round');
        if (room.phase !== 'active' || !round || round.id !== target.id) {
          // Stale round (closed, advanced past, or replaced): reconcile only, never re-target.
          const recorded = this.db.submissionByTeam(target.id, teamId);
          if (recorded && recorded.client_submission_id === submissionId) return { receivedAt: recorded.received_at, duplicate: true };
          throw new GameError('round_closed', 'that round is over');
        }
      }
      if (room.phase !== 'active' || !round) {
        // A retry of a submission that *was* recorded (its acknowledgement was lost) gets the original
        // receipt even after the round closed, so the device can reconcile. Nothing new is recorded.
        const last = this.currentRound(roomId);
        const recorded = last ? this.db.submissionByTeam(last.id, teamId) : undefined;
        if (recorded && recorded.client_submission_id === submissionId) return { receivedAt: recorded.received_at, duplicate: true };
        throw new GameError('round_closed', 'no active round');
      }
      if (!this.db.teamById(teamId) || this.db.teamById(teamId)!.room_id !== roomId) throw new GameError('forbidden', 'team not in room');

      const existing = this.db.submissionByTeam(round.id, teamId);
      if (existing) {
        if (existing.client_submission_id === submissionId) return { receivedAt: existing.received_at, duplicate: true };
        throw new GameError('already_submitted', 'this team has already submitted');
      }
      const receivedAt = this.now();
      if (receivedAt >= round.deadline_at) {
        closeDue = round.id;
        throw new GameError('round_closed', 'deadline passed');
      }
      try {
        this.db.insertSubmission({
          id: newId(),
          round_id: round.id,
          team_id: teamId,
          client_submission_id: submissionId,
          answer,
          received_at: receivedAt,
          seq: this.db.nextSeq(round.id),
        });
      } catch (err) {
        if (String((err as { code?: string }).code).startsWith('SQLITE_CONSTRAINT')) {
          throw new GameError('already_submitted', 'this team has already submitted');
        }
        throw err;
      }
      return { receivedAt, duplicate: false };
    });
    } finally {
      // A late submission means the deadline timer has not fired yet: close the round now.
      if (closeDue) this.closeRound(closeDue);
    }
    if (!result.duplicate) this.changed(roomId);
    return result;
  }

  /** Close a round at/after its deadline: compute correctness and points. Idempotent. */
  closeRound(roundId: string): boolean {
    const round = this.db.roundById(roundId);
    if (!round || round.closed_at !== null) return false;
    if (this.now() < round.deadline_at) {
      // Timer fired early (clock skew): try again at the deadline. Never close early.
      this.track(round.room_id, this.scheduler.at(round.deadline_at, () => this.closeRound(roundId)));
      return false;
    }
    const closed = this.db.transaction(() => {
      if (this.db.closeRound(roundId, this.now()) === 0) return false;
      const question = this.opts.questions[round.question_index]!;
      const subs = this.db.submissionsByRound(roundId);
      const scored = scoreRound(subs.map((s) => ({ teamId: s.team_id, seq: s.seq, correct: isCorrectAnswer(s.answer, question.answer) })));
      for (const s of subs) {
        const r = scored.find((x) => x.teamId === s.team_id)!;
        this.db.scoreSubmission(s.id, r.correct, r.orderRank, r.points);
      }
      this.db.setRoomState(round.room_id, 'revealed', round.question_index);
      return true;
    });
    if (closed) {
      this.cancelTimers(round.room_id);
      this.changed(round.room_id);
    }
    return closed;
  }

  advance(roomId: string): void {
    this.db.transaction(() => {
      const room = this.room(roomId);
      if (room.phase !== 'revealed') throw new GameError('wrong_phase', `cannot advance from ${room.phase}`);
      const next = room.question_index + 1;
      if (next >= this.questionCount) this.db.setRoomState(roomId, 'finished', room.question_index);
      else this.db.setRoomState(roomId, 'ready', next);
    });
    this.changed(roomId);
  }

  /** After a server restart: close overdue rounds, re-arm timers for the rest. Never extends a deadline. */
  recover(): void {
    for (const round of this.db.openRounds()) {
      if (this.now() >= round.deadline_at) this.closeRound(round.id);
      else this.scheduleRound(round);
    }
  }

  /** Scenes that a round of the configured length will never release (test durations only). */
  unreleasableScenes(): { question: number; sceneId: string; at: number }[] {
    return this.opts.questions.flatMap((q, i) =>
      q.scenes.filter((s) => s.at >= this.opts.roundDurationMs).map((s) => ({ question: i + 1, sceneId: s.id, at: s.at })),
    );
  }

  dispose(): void {
    for (const roomId of [...this.timers.keys()]) this.cancelTimers(roomId);
  }

  // ------------------------------------------------------------------ queries

  openRound(roomId: string): RoundRow | null {
    return this.db.roundsByRoom(roomId).find((r) => r.closed_at === null) ?? null;
  }

  /** Round relevant to the current phase: the open round, or the just-closed one while revealed. */
  currentRound(roomId: string): RoundRow | null {
    const room = this.room(roomId);
    if (room.phase === 'active') return this.openRound(roomId);
    if (room.phase === 'revealed' || room.phase === 'finished') {
      const closed = this.db.roundsByRoom(roomId).filter((r) => r.closed_at !== null);
      return closed[closed.length - 1] ?? null;
    }
    return null;
  }

  roundView(round: RoundRow): RoundView {
    const question = this.opts.questions[round.question_index]!;
    // A closed round shows every scene; an open one only those released by the server clock.
    // Never beyond the deadline: scenes outside the round are never released.
    const until = Math.min(round.closed_at ?? this.now(), round.deadline_at - 1);
    return {
      id: round.id,
      kind: round.kind,
      questionNumber: round.question_index + 1,
      totalQuestions: this.questionCount,
      startedAt: round.started_at,
      deadlineAt: round.deadline_at,
      durationMs: round.deadline_at - round.started_at,
      answerPattern: answerPattern(question.answer),
      scenes: releasedScenes(question.scenes, round.started_at, until),
    };
  }

  submittedTeamIds(roundId: string): Set<string> {
    return new Set(this.db.submissionsByRound(roundId).map((s) => s.team_id));
  }

  submissionOf(roundId: string, teamId: string) {
    return this.db.submissionByTeam(roundId, teamId) ?? null;
  }

  standings(roomId: string, opts: { excludeRoundId?: string } = {}): Standing[] {
    const outcomes: RoundOutcome[] = this.db
      .roundsByRoom(roomId)
      .filter((r) => r.closed_at !== null && r.id !== opts.excludeRoundId)
      .map((r) => ({
        kind: r.kind,
        results: this.db.submissionsByRound(r.id).map((s) => ({
          teamId: s.team_id,
          correct: s.is_correct === 1,
          points: s.points ?? 0,
          responseMs: s.received_at - r.started_at,
        })),
      }));
    return computeStandings(this.teams(roomId).map((t) => ({ id: t.id, name: t.name })), outcomes);
  }

  /** Full results of a closed round. Throws for an open round: nothing is revealed early. */
  reveal(round: RoundRow): RoundReveal {
    if (round.closed_at === null) throw new GameError('wrong_phase', 'round is still open');
    const teams = this.teams(round.room_id);
    const subs = new Map(this.db.submissionsByRound(round.id).map((s) => [s.team_id, s]));
    return {
      roundId: round.id,
      questionNumber: round.question_index + 1,
      canonicalAnswer: this.opts.questions[round.question_index]!.answer,
      submissions: teams
        .map((t) => {
          const s = subs.get(t.id);
          return {
            teamId: t.id,
            teamName: t.name,
            answer: s?.answer ?? null,
            correct: s?.is_correct === 1,
            orderRank: s?.order_rank ?? null,
            points: s?.points ?? 0,
            responseMs: s ? s.received_at - round.started_at : null,
          };
        })
        .sort((a, b) => (a.orderRank ?? 99) - (b.orderRank ?? 99) || (a.responseMs ?? Infinity) - (b.responseMs ?? Infinity)),
      standingsBefore: this.standings(round.room_id, { excludeRoundId: round.id }),
      standingsAfter: this.standings(round.room_id),
      // Only this question's credits, and only here (a closed round): never during play.
      attribution: this.opts.questions[round.question_index]!.attribution ?? null,
    };
  }

  /**
   * Media authorisation (admin, team and screen alike). Returns the asset only if: the round exists, the session may view its room,
   * the asset belongs to a scene of *this* round's question, and that scene has been released by the
   * server clock (or the round is closed). Every failure returns null so callers answer uniformly.
   */
  authorizeMedia(roundId: string, assetId: string, session: { role: 'admin' | 'team' | 'screen'; roomId: string | null }): MediaAsset | null {
    const round = this.db.roundById(roundId);
    if (!round) return null;
    // Team and projector sessions are bound to one room; admin sessions may view any room.
    if (session.role !== 'admin' && session.roomId !== round.room_id) return null;
    const question = this.opts.questions[round.question_index];
    const scene = question?.scenes.find((s) => (s.kind === 'image' || s.kind === 'video') && s.media.assetId === assetId);
    if (!scene) return null;
    const releasedUntil = round.closed_at ?? this.now();
    const releaseAt = round.started_at + scene.at;
    if (releaseAt > releasedUntil || releaseAt >= round.deadline_at) return null;
    return this.registry.get(assetId) ?? null;
  }

  phaseOf(roomId: string): RoomPhase {
    return this.room(roomId).phase;
  }

  // ------------------------------------------------------------------ internals

  private scheduleRound(round: RoundRow): void {
    const question = this.opts.questions[round.question_index]!;
    // Push newly released scenes to clients exactly when the server releases them.
    for (const scene of question.scenes) {
      const releaseAt = round.started_at + scene.at;
      // Scenes are only ever released inside the round; already-released ones need no timer.
      if (scene.at > 0 && releaseAt < round.deadline_at && releaseAt > this.now()) {
        this.track(round.room_id, this.scheduler.at(releaseAt, () => this.releaseScene(round.id, releaseAt)));
      }
    }
    this.track(round.room_id, this.scheduler.at(round.deadline_at, () => this.closeRound(round.id)));
  }

  /**
   * Timer callback for a scene release. The release itself is implicit (views filter by the server
   * clock); this pushes the new view. A stale timer can never affect another or a later round.
   */
  private releaseScene(roundId: string, releaseAt: number): void {
    const round = this.db.roundById(roundId);
    if (!round || round.closed_at !== null || this.openRound(round.room_id)?.id !== roundId) return;
    if (this.now() < releaseAt) {
      this.track(round.room_id, this.scheduler.at(releaseAt, () => this.releaseScene(roundId, releaseAt)));
      return;
    }
    this.changed(round.room_id);
  }

  private track(roomId: string, cancel: () => void): void {
    const list = this.timers.get(roomId) ?? [];
    list.push(cancel);
    this.timers.set(roomId, list);
  }

  private cancelTimers(roomId: string): void {
    for (const cancel of this.timers.get(roomId) ?? []) cancel();
    this.timers.delete(roomId);
  }

  private changed(roomId: string): void {
    this.opts.onChange?.(roomId);
  }
}
