import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeAnswer } from '../game/normalize';
import { QUESTIONS } from './questions';

const publicDir = fileURLToPath(new URL('../../public', import.meta.url));

describe('question content', () => {
  it('keeps the six canonical answers in order', () => {
    expect(QUESTIONS.map((q) => q.answer)).toEqual([
      'BAO CẤP',
      'CÁCH MẠNG THÁNG MƯỜI',
      'HỢP TÁC XÃ',
      'ĐỔI MỚI',
      'WTO',
      'PHÁT TRIỂN BỀN VỮNG',
    ]);
  });

  it('every clue points to an existing local WebP with a neutral filename', () => {
    QUESTIONS.forEach((q, qi) =>
      q.clues.forEach((clue, ci) => {
        expect(clue.imageSrc).toBe(`clues/q0${qi + 1}-0${ci + 1}.webp`);
        const file = resolve(publicDir, clue.imageSrc!);
        expect(existsSync(file)).toBe(true);
        const head = readFileSync(file).subarray(0, 12).toString('latin1');
        expect(head.startsWith('RIFF') && head.endsWith('WEBP')).toBe(true);
      }),
    );
  });

  it('ships exactly 24 clue images', () => {
    expect(readdirSync(resolve(publicDir, 'clues')).filter((f) => f.endsWith('.webp'))).toHaveLength(24);
  });

  it('every clue has a recorded source', () => {
    for (const q of QUESTIONS) for (const c of q.clues) expect(c.credit?.url).toMatch(/^https:\/\//);
  });

  it('alt text and image paths never contain the answer', () => {
    for (const q of QUESTIONS) {
      const answer = normalizeAnswer(q.answer);
      for (const c of q.clues) {
        expect(normalizeAnswer(c.alt)).not.toContain(answer);
        expect(normalizeAnswer(c.imageSrc ?? '')).not.toContain(answer);
      }
    }
  });
});
