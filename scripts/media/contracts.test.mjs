import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { manifestProblems } from './contracts.mjs';
const read = (q) => JSON.parse(readFileSync(new URL(`../../media/q${q}/manifest.json`, import.meta.url)));
for (let q = 1; q <= 6; q++) test(`Q${q} frozen production structure`, () => assert.deepEqual(manifestProblems(read(q)), []));
for (const [name, mutate] of [
  ['wrong round duration', (m) => { m.roundMs = 60000; }],
  ['missing scene', (m) => { m.scenes.pop(); }],
  ['gap', (m) => { m.scenes[0].durationMs--; }],
  ['overrun', (m) => { m.clips.c19.durationMs = 7000; }],
  ['late decisive clue', (m) => { m.scenes[6].at = 31000; }],
  ['trimmed recap', (m) => { m.scenes[7].endMs = 5000; }],
  ['Q3 text crossfade', (m) => { m.scenes[4].transition = 'fade'; }],
  ['early sign source', (m) => { m.sourceRules['q3-bautruc-sign-2022'] = 30000; }],
  ['shot gap', (m) => { m.clips.c21.shots[1].start = 2400; }],
  ['shot overrun', (m) => { m.clips.c21.shots[2].dur = 3000; }],
  ['cue overrun', (m) => { m.clips.c19.shots[0].lines[0].at = 6000; }],
  ['member cue overrun', (m) => { m.clips.c17.shots[0].stepMs = 5000; }],
]) test(`reject ${name}`, () => { const m = read(3); mutate(m); assert.ok(manifestProblems(m).length); });
test('Q2 thumbnail/stamp cannot be authorized before recap', () => { const m = read(2); m.sourceRules['q2-july-nevsky'] = 14000; assert.ok(manifestProblems(m).length); });
