// Pure mapping for the SYNTHETIC trial (M4.1 Mode A): production timelines → synthetic questions that keep
// only the timing (release offsets, scene kinds, transitions, video durations, clip sizes). Tested by
// synthetic.test.ts: no production text, answer, credit or asset id survives.
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Scene } from '../../shared/scenes';
import { QUESTIONS, type ServerQuestion } from '../../server/content/questions';
import { MEDIA_ASSETS, type MediaAsset } from '../../server/media/registry';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
export type TrialAsset = MediaAsset & { targetBytes: number };

export const ANSWERS = ['THỬ NGHIỆM', 'MẪU THỬ', 'KIỂM TRA', 'GIẢ LẬP', 'TRÌNH DIỄN', 'VẬN HÀNH'];
const FILLER = 'nội dung mẫu dùng để đo tốc độ tải và hiển thị';

/** Neutral text of about the same length as the production text (layout and frame sizes stay similar). */
const filler = (len: number) => {
  let s = '';
  while (s.length < len) s += (s ? ' · ' : '') + FILLER;
  return s.slice(0, Math.max(8, len)).trim();
};

export function synthesize(): { questions: ServerQuestion[]; assets: TrialAsset[] } {
  const prodAssets = new Map(MEDIA_ASSETS.map((a) => [a.id, a]));
  const assets: TrialAsset[] = [];
  const questions = QUESTIONS.map((q, qi): ServerQuestion => {
    const scenes = q.scenes.map((s, si): Scene => {
      const base = { id: `t${si + 1}`, at: s.at, transition: s.transition, durationMs: s.durationMs };
      switch (s.kind) {
        case 'video': {
          const prod = prodAssets.get(s.media.assetId)!;
          const id = `trial-q${qi + 1}-${si + 1}`;
          // Same duration and about the same size as the production clip it stands in for.
          const bytes = statSync(join(ROOT, 'server/media', prod.file)).size;
          assets.push({ id, kind: 'video', file: `${id}.mp4`, mime: 'video/mp4', durationMs: prod.durationMs, targetBytes: bytes });
          return { ...base, kind: 'video', media: { assetId: id }, startMs: s.startMs, endMs: s.endMs, credit: 'Video tổng hợp (mẫu hình kỹ thuật)' };
        }
        case 'text-card':
          return { ...base, kind: 'text-card', heading: s.heading ? filler(s.heading.length) : undefined, body: filler(s.body.length) };
        case 'date':
          return { ...base, kind: 'date', date: '2000 – 2010', label: s.label ? filler(s.label.length) : undefined };
        case 'statistic':
          return { ...base, kind: 'statistic', value: '42', unit: '%', label: filler(s.label.length), source: 'Số liệu tổng hợp' };
        default:
          return { ...base, kind: 'text-card', body: filler(40) };
      }
    });
    return { id: `trial-${qi + 1}`, answer: ANSWERS[qi % ANSWERS.length]!, scenes };
  });
  return { questions, assets };
}
