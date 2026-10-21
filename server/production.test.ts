import { describe, expect, it } from 'vitest';
import { QUESTIONS } from './content/questions';
import { openDb } from './db';
import { GameEngine } from './engine';
import { MediaRegistry } from './media/registry';
import { AUTHORED_ROUND_MS, validateTimeline } from './scenes/validate';
import { fakeTime } from './test-utils';

const registry = new MediaRegistry();
describe('M4.2 production contracts', () => {
  it.each(QUESTIONS)('$id: full slots, release gates and exact deadline', (question) => {
    expect(AUTHORED_ROUND_MS).toBe(40_000);
    expect(validateTimeline(question.scenes, { answer: question.answer, registry, production: true })).toEqual([]);
    const time = fakeTime(), db = openDb(':memory:');
    const engine = new GameEngine(db, { questions: [question], roundDurationMs: 40_000, clock: time.clock, scheduler: time.scheduler });
    try {
      const { room, teams } = engine.createRoom();
      const round = engine.startRound(room.id);
      expect(round.deadline_at - round.started_at).toBe(40_000);
      expect(engine.unreleasableScenes()).toEqual([]);
      for (const scene of question.scenes) {
        if (scene.at > 0) {
          time.advanceTo(round.started_at + scene.at - 1);
          expect(engine.roundView(round).scenes.some((s) => s.id === scene.id)).toBe(false);
          if (scene.kind === 'video') for (const role of ['admin', 'team', 'screen'] as const) {
            expect(engine.authorizeMedia(round.id, scene.media.assetId, { role, roomId: room.id })).toBeNull();
          }
        }
        time.advanceTo(round.started_at + scene.at);
        expect(engine.roundView(round).scenes.at(-1)?.id).toBe(scene.id);
        if (scene.kind === 'video') {
          for (const role of ['admin', 'team', 'screen'] as const) expect(engine.authorizeMedia(round.id, scene.media.assetId, { role, roomId: room.id })?.id).toBe(scene.media.assetId);
          expect(engine.authorizeMedia(round.id, scene.media.assetId, { role: 'team', roomId: 'another-room' })).toBeNull();
        }
      }
      expect(engine.authorizeMedia(round.id, 'h3n7d5qy', { role: 'admin', roomId: null })).toBeNull();
      time.advanceTo(round.deadline_at - 1);
      engine.submit(room.id, teams[0]!.id, 'production-before-deadline', question.answer);
      time.advanceTo(round.deadline_at);
      expect(() => engine.submit(room.id, teams[1]!.id, 'production-at-deadline', question.answer)).toThrow();
      expect(engine.phaseOf(room.id)).toBe('revealed');
    } finally { engine.dispose(); db.close(); }
  });
  it('rejects gaps, overlaps, partial segments and delayed native clues', () => {
    for (const mutate of [
      (s: typeof QUESTIONS[number]['scenes']) => { s[0]!.durationMs!--; },
      (s: typeof QUESTIONS[number]['scenes']) => { s[0]!.durationMs!++; },
      (s: typeof QUESTIONS[number]['scenes']) => { s[6]!.at = 31_000; },
      (s: typeof QUESTIONS[number]['scenes']) => { const v = s[7]!; if (v.kind === 'video') v.endMs = 5_000; },
    ]) {
      const scenes = structuredClone(QUESTIONS[0]!.scenes); mutate(scenes);
      expect(validateTimeline(scenes, { answer: QUESTIONS[0]!.answer, registry, production: true }).length).toBeGreaterThan(0);
    }
  });
  it('retains intentionally short test rounds while validating the full authored timeline', () => {
    const db = openDb(':memory:');
    const time = fakeTime();
    const engine = new GameEngine(db, { questions: QUESTIONS, roundDurationMs: 15_000, clock: time.clock, scheduler: time.scheduler });
    try {
      const { room } = engine.createRoom(), round = engine.startRound(room.id);
      time.advanceTo(round.deadline_at);
      expect(engine.roundView(round).scenes.every((s) => s.at < 15_000)).toBe(true);
    } finally { engine.dispose(); db.close(); }
  });
});
