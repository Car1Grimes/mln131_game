import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeAnswer } from '../shared/normalize';
import { QUESTIONS } from './content/questions';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceFiles = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const rel = join(dir, name);
    return statSync(join(root, rel)).isDirectory() ? sourceFiles(rel) : /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [rel] : [];
  });

describe('forbidden answer leakage (static)', () => {
  const clientFiles = [...sourceFiles('src'), ...sourceFiles('shared')];

  it('client and shared code never import server modules', () => {
    for (const f of clientFiles) {
      expect(readFileSync(join(root, f), 'utf8'), f).not.toMatch(/from ['"][./]*server\//);
    }
  });

  it('client and shared source files contain no canonical answer', () => {
    for (const f of clientFiles) {
      const text = readFileSync(join(root, f), 'utf8');
      for (const q of QUESTIONS) {
        const n = normalizeAnswer(q.answer);
        if (n.length >= 6) expect(normalizeAnswer(text), `${f} contains ${q.answer}`).not.toContain(n);
        expect(text, f).not.toContain(q.answer);
      }
    }
  });

  it('clue media is not in the public (client-served) folder', () => {
    let publicFiles: string[] = [];
    try {
      publicFiles = readdirSync(join(root, 'public'), { recursive: true }) as string[];
    } catch {
      /* no public folder */
    }
    expect(publicFiles.filter((f) => /\.(webp|jpe?g|png|mp4)$/i.test(f))).toEqual([]);
  });
});
