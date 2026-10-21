import { describe, expect, it } from 'vitest';
import { normalizeAnswer } from '../shared/normalize';
import { QUESTIONS } from './content/questions';
import { MEDIA_ASSETS } from './media/registry';
import { ANSWERS, synthesize } from '../scripts/trial/synthetic';

// Every human-readable string of the production content (answers, scene texts, credits, sources).
const prodStrings = QUESTIONS.flatMap((q) => [
  q.answer,
  ...q.scenes.flatMap((s) => Object.entries(s).filter(([k, v]) => typeof v === 'string' && !['id', 'kind', 'transition'].includes(k)).map(([, v]) => v as string)),
]).filter((t) => t.length >= 4);

describe('synthetic trial content (Mode A)', () => {
  const { questions, assets } = synthesize();
  const sent = JSON.stringify({ questions: questions.map((q) => q.scenes), assets: assets.map((a) => [a.id, a.file]) });

  it('keeps the production timing: same offsets, kinds, transitions and video durations', () => {
    expect(questions).toHaveLength(QUESTIONS.length);
    questions.forEach((q, i) => {
      const prod = QUESTIONS[i]!.scenes;
      expect(q.scenes.map((s) => [s.at, s.transition, s.kind === 'statistic' || s.kind === 'date' || s.kind === 'video' ? s.kind : 'text'])).toEqual(
        prod.map((s) => [s.at, s.transition, s.kind === 'statistic' || s.kind === 'date' || s.kind === 'video' ? s.kind : 'text']),
      );
    });
    const prodVideo = MEDIA_ASSETS.filter((a) => QUESTIONS.some((q) => q.scenes.some((s) => s.kind === 'video' && s.media.assetId === a.id)));
    expect(assets.reduce((n, a) => n + (a.durationMs ?? 0), 0)).toBe(
      QUESTIONS.flatMap((q) => q.scenes).filter((s) => s.kind === 'video').reduce((n, s) => n + (prodVideo.find((a) => s.kind === 'video' && a.id === s.media.assetId)?.durationMs ?? 0), 0),
    );
  });

  it('contains no production answer, text, credit, source or asset id', () => {
    for (const q of QUESTIONS) expect(normalizeAnswer(sent)).not.toContain(normalizeAnswer(q.answer));
    for (const t of prodStrings) expect(sent, t).not.toContain(t);
    for (const a of MEDIA_ASSETS) {
      expect(sent).not.toContain(a.id);
      expect(sent).not.toContain(a.file);
    }
  });

  it('uses synthetic answers that no synthetic scene reveals', () => {
    questions.forEach((q, i) => {
      expect(q.answer).toBe(ANSWERS[i]);
      expect(normalizeAnswer(JSON.stringify(q.scenes))).not.toContain(normalizeAnswer(q.answer));
    });
  });
});
