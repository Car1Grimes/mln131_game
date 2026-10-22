import { mkdtempSync, rmSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM build script without type declarations
import { buildAttribution } from '../scripts/media/attribution.mjs';
import { normalizeAnswer } from '../shared/normalize';
import { attributionFor } from './content/attribution';
import { QUESTIONS } from './content/questions';
import { openDb } from './db';
import { GameEngine } from './engine';
import { fakeTime, startActive } from './test-utils';
import { adminView, screenView, teamView } from './views';

const root = fileURLToPath(new URL('..', import.meta.url));
const presence = { devices: () => 1, screens: () => 1, screenSessions: () => 1 };
const ROUND = 40_000;
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(dbPath = ':memory:', t = fakeTime()) {
  const db = openDb(dbPath);
  const engine = new GameEngine(db, { questions: QUESTIONS, roundDurationMs: ROUND, clock: t.clock, scheduler: t.scheduler });
  return { db, engine, t };
}
const views = (engine: GameEngine, roomId: string, teamId: string) => [adminView(engine, roomId, presence), teamView(engine, roomId, teamId), screenView(engine, roomId, presence)];

describe('attribution data (generated from the production manifests)', () => {
  it('server/content/attribution.json is up to date with the manifests and media/sources.json', () => {
    const fresh = buildAttribution();
    const committed = JSON.parse(readFileSync(join(root, 'server/content/attribution.json'), 'utf8'));
    expect(committed).toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it('every entry is complete: creator, title, licence; CC entries carry source and licence URLs; nothing unresolved', () => {
    for (const q of QUESTIONS) {
      const a = attributionFor(q.id);
      expect(a.entries.length, q.id).toBeGreaterThan(0);
      for (const e of a.entries) {
        expect(e.creator && e.title && e.licence, `${q.id}/${e.id}`).toBeTruthy();
        expect(e.rights, `${q.id}/${e.id}`).not.toBe('unresolved');
        if (e.rights === 'cc') {
          expect(e.sourceUrl, e.id).toMatch(/^https:\/\//);
          expect(e.licenceUrl, e.id).toMatch(/^https:\/\/creativecommons\.org\/licenses\//);
        }
        if (e.kind === 'photo' || e.kind === 'map') expect(e.sourceUrl, e.id).toMatch(/^https:\/\//);
        if (e.rights === 'pd-qualified') expect(e.rightsNote, e.id).toBeTruthy();
        expect(e.usedIn.length, e.id).toBeGreaterThan(0);
      }
      for (const x of a.adaptations) expect(x.licenceUrl).toMatch(/^https:\/\/creativecommons\.org\/licenses\/by-sa\//);
    }
  });

  it('jurisdiction-qualified public-domain sources are never labelled plain public domain', () => {
    const q2 = attributionFor('q2').entries;
    for (const id of ['q2-feb-crowd', 'q2-july-nevsky', 'q2-winter-palace-after', 'q2-stamp-1957']) expect(q2.find((e) => e.id === id)?.rights, id).toBe('pd-qualified');
    expect(attributionFor('q6').entries.find((e) => e.id === 'q6-steel-1972')?.rights).toBe('pd-qualified');
  });

  it("a question's credits never contain the answer of a LATER question (no future-round disclosure)", () => {
    QUESTIONS.forEach((q, i) => {
      const text = normalizeAnswer(decodeURIComponent(JSON.stringify(attributionFor(q.id))));
      for (const later of QUESTIONS.slice(i + 1)) expect(text, `${q.id} credits reveal ${later.id}`).not.toContain(normalizeAnswer(later.answer));
    });
  });
});

describe('attribution reconciliation (independent of the generator)', () => {
  const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
  const registry = read('media/sources.json').sources as { id: string; licence: string; licenceCode: string; kind: string }[];
  const lock = read('media/sources.lock.json').files as Record<string, { sha256: string; file: string; licenceOnAccess: string | null }>;
  type Shot = { source?: string; background?: string; ticks?: { thumb?: string }[]; thumbs?: (string | null)[] };
  const shotSources = (sh: Shot) => [sh.source, sh.background, ...(sh.ticks ?? []).map((t) => t.thumb), ...(sh.thumbs ?? [])].filter((x): x is string => !!x);
  const perQuestion = QUESTIONS.map((q, i) => {
    const m = read(`media/q${i + 1}/manifest.json`);
    const released = m.scenes.filter((s: { kind: string }) => s.kind === 'video').map((s: { clip: string }) => s.clip);
    const used = new Set<string>(released.flatMap((c: string) => (m.clips[c].shots as Shot[]).flatMap(shotSources)));
    const sa = released.filter((c: string) => (m.clips[c].shots as Shot[]).flatMap(shotSources).some((id) => registry.find((r) => r.id === id)?.licenceCode.startsWith('CC-BY-SA')));
    return { q, used, sa, clips: released as string[] };
  });

  it('33 entries = every photo/map source of every released clip (main, composite, recap) + own work + font, per question', () => {
    let total = 0;
    for (const { q, used } of perQuestion) {
      const a = attributionFor(q.id);
      total += a.entries.length;
      const credited = new Set(a.entries.filter((e) => e.kind === 'photo' || e.kind === 'map').map((e) => e.id));
      expect([...credited].sort(), q.id).toEqual([...used].sort());
      expect(a.entries.filter((e) => e.kind === 'own').length, q.id).toBe(1);
      expect(a.entries.filter((e) => e.kind === 'font').length, q.id).toBe(1);
    }
    expect(total).toBe(33);
  });

  it('every credited source is pinned in the lock file; unused registry records are not credited', () => {
    const allUsed = new Set(perQuestion.flatMap((p) => [...p.used]));
    for (const id of allUsed) {
      expect(lock[id]?.sha256, id).toMatch(/^[0-9a-f]{64}$/);
      expect(lock[id]?.file, id).toMatch(/^media-src\//);
    }
    const unused = registry.map((r) => r.id).filter((id) => !allUsed.has(id) && !id.startsWith('font-'));
    expect(unused).toEqual(['q2-mayday-palace', 'q3-rochdale-museum-2011']);
    for (const q of QUESTIONS) for (const id of unused) expect(attributionFor(q.id).entries.some((e) => e.id === id)).toBe(false);
  });

  it('licence codes agree with the recorded licence text and the licence seen at download', () => {
    for (const r of registry) {
      const cc = r.licenceCode.match(/^CC-(BY(?:-SA)?)-(\d\.\d)$/);
      if (cc) {
        const name = `CC ${cc[1]} ${cc[2]}`;
        expect(r.licence, r.id).toContain(name);
        if (lock[r.id]?.licenceOnAccess) expect(lock[r.id]!.licenceOnAccess, r.id).toContain(name);
      } else if (r.licenceCode.startsWith('PD')) {
        expect(r.licence, r.id).toMatch(/public domain/i);
      } else expect(r.licenceCode, r.id).toBe('OFL-1.1');
    }
  });

  it('public domain is shown as worldwide only with worldwide evidence (publisher dedication / author release); all other PD is qualified', () => {
    const plain = new Set(['map-ne-50m-land', 'q6-mumbai-2007']);
    for (const q of QUESTIONS)
      for (const e of attributionFor(q.id).entries) {
        if (e.rights === 'pd') expect(plain.has(e.id), `${e.id} shown as plain public domain`).toBe(true);
        if (e.kind === 'photo' && !plain.has(e.id) && /^PD/.test(registry.find((r) => r.id === e.id)!.licenceCode)) {
          expect(e.rights, e.id).toBe('pd-qualified');
          expect(e.rightsNote, e.id).toBeTruthy();
        }
      }
    const qualified = registry.filter((r) => ['PD-US', 'PD-RU', 'PD-RU-EXEMPT', 'PD-USGOV', 'PD-OLD'].includes(r.licenceCode)).map((r) => r.id).sort();
    expect(qualified).toEqual(['q2-feb-crowd', 'q2-july-nevsky', 'q2-stamp-1957', 'q2-winter-palace-after', 'q6-steel-1972']);
  });

  it('share-alike clips are exactly the released clips that contain BY-SA material; every photo entry states its modifications', () => {
    for (const { q, sa } of perQuestion) {
      const a = attributionFor(q.id);
      expect(a.adaptations.map((x) => x.clip).sort(), q.id).toEqual([...sa].sort());
      for (const e of a.entries.filter((x) => x.kind === 'photo')) expect(e.modifications.at(-1), e.id).toMatch(/H\.264 960×540/);
    }
  });
});

describe('attribution disclosure boundary (views)', () => {
  it('is absent from every role during an active round, present only after close, for that question only', () => {
    const { engine, t } = setup();
    const { room, teams } = engine.createRoom();
    const round = startActive(engine, room.id, t);
    for (const v of views(engine, room.id, teams[0]!.id)) {
      expect(v.reveal, v.role).toBeNull();
      expect(JSON.stringify(v), v.role).not.toMatch(/creativecommons|wikimedia|attribution|Siason/i);
    }
    t.advance(ROUND + 1);
    expect(engine.room(room.id).phase).toBe('revealed');
    for (const v of views(engine, room.id, teams[0]!.id)) {
      expect(v.reveal?.roundId, v.role).toBe(round.id);
      expect(v.reveal?.attribution, v.role).toEqual(attributionFor('q1'));
      // Only Q1 entries: no source of any other question.
      const others = QUESTIONS.slice(1).flatMap((q) => attributionFor(q.id).entries.filter((e) => e.kind === 'photo').map((e) => e.id));
      for (const id of others) expect(JSON.stringify(v.reveal), `${v.role} leaks ${id}`).not.toContain(id);
    }
    engine.dispose();
  });

  it('another room never receives this room’s credits; advance clears them', () => {
    const { engine, t } = setup();
    const a = engine.createRoom();
    const b = engine.createRoom();
    startActive(engine, a.room.id, t);
    t.advance(ROUND + 1);
    for (const v of views(engine, b.room.id, b.teams[0]!.id)) expect(v.reveal, `room B ${v.role}`).toBeNull();
    engine.advance(a.room.id);
    for (const v of views(engine, a.room.id, a.teams[0]!.id)) expect(v.reveal, `after advance ${v.role}`).toBeNull();
    startActive(engine, a.room.id, t);
    for (const v of views(engine, a.room.id, a.teams[0]!.id)) expect(JSON.stringify(v), `Q2 active ${v.role}`).not.toMatch(/creativecommons|wikimedia/);
    t.advance(ROUND + 1);
    for (const v of views(engine, a.room.id, a.teams[0]!.id)) expect(v.reveal?.attribution, v.role).toEqual(attributionFor('q2'));
    engine.dispose();
  });

  it('survives a server restart after the reveal', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-attr-'));
    dirs.push(dir);
    const path = join(dir, 'game.sqlite');
    const t = fakeTime();
    const first = setup(path, t);
    const { room, teams } = first.engine.createRoom();
    startActive(first.engine, room.id, t);
    t.advance(ROUND + 1);
    first.engine.dispose();
    first.db.close();
    const second = setup(path, t);
    second.engine.recover();
    expect(teamView(second.engine, room.id, teams[0]!.id).reveal?.attribution).toEqual(attributionFor('q1'));
    second.engine.dispose();
    second.db.close();
  });
});
