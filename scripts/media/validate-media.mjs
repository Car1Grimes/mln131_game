// Production-media validation (M3.2). Run with tsx so the server content can be imported:
//
//   node --import tsx scripts/media/validate-media.mjs media/q2/manifest.json
//
// Checks (FAIL = blocking, WARN = reported trade-off):
//   timeline   manifest scenes == server/content/questions.ts timeline; engine validator passes
//   leak       every on-screen string, credit and label: exact normalised answers of ALL questions;
//              semantic leak terms before leakPolicy.until; visible text of sources (stamp) by time
//   sources    each clip only contains sources allowed at its release time (no future clue in an
//              earlier clip); every source is pinned and its staged file matches the sha256
//   credits    every clip credit names each source it uses (and its CC licence when required)
//   files      ffprobe: H.264 Main, yuv420p, 960×540, 24 fps, no audio, duration, no metadata
//              tags, moov before mdat (faststart), sha256 == build report, size budget (WARN)
//   registry   opaque ids, kind/duration match, file resolves inside the media root
//   dist       no media files in dist/ (the answer scan of dist/ is scripts/check-bundle.mjs)
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { QUESTIONS } from '../../server/content/questions.ts';
import { MEDIA_ASSETS, MediaRegistry } from '../../server/media/registry.ts';
import { validateTimeline } from '../../server/scenes/validate.ts';
import { normalizeAnswer } from '../../shared/normalize.ts';
import { clipSources, ffprobe, loadSources, sourceFile } from './build-clips.mjs';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const BUDGET = 600 * 1024;
const manifestPath = resolve(process.argv[2] ?? 'media/q2/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const question = QUESTIONS[manifest.question - 1];
const { lock, meta } = loadSources();
const buildReport = JSON.parse(readFileSync(join(dirname(manifestPath), 'build-report.json'), 'utf8'));
const results = [];
const check = (area, name, ok, detail = '', level = 'FAIL') => {
  const status = ok ? 'PASS' : level;
  results.push({ area, name, status, detail });
  console.log(`${status.padEnd(4)}  [${area}] ${name}${detail ? `  (${detail})` : ''}`);
};

// ------------------------------------------------------------------ timeline
const expected = manifest.scenes.map((s) => {
  const { clip, ...rest } = s;
  if (s.kind !== 'video') return rest;
  return { ...rest, media: { assetId: manifest.clips[clip].assetId }, credit: manifest.clips[clip].credit };
});
const canon = (x) => JSON.stringify(x, Object.keys(x).sort());
const actual = question.scenes;
check('timeline', 'questions.ts timeline equals the manifest', actual.length === expected.length && actual.every((s, i) => canon(s) === canon(expected[i])),
  actual.length === expected.length ? actual.map((s, i) => (canon(s) === canon(expected[i]) ? '' : s.id)).filter(Boolean).join(',') : `${actual.length} vs ${expected.length} scenes`);
const engineErrors = validateTimeline(actual, { answer: question.answer, registry: new MediaRegistry() });
check('timeline', 'engine validateTimeline passes', engineErrors.length === 0, engineErrors.join('; '));
const last = actual[actual.length - 1];
check('timeline', 'timeline covers exactly 60 s (last scene ends at 60 000 ms)', (last.at + (last.durationMs ?? 0)) === manifest.roundMs, `${last.at + (last.durationMs ?? 0)} ms`);
const decisive = actual.find((s) => s.at === manifest.decisiveAt);
check('timeline', 'decisive clue is a native scene released at 45 s', !!decisive && decisive.kind !== 'video' && decisive.kind !== 'image', decisive?.kind);
const recap = actual.find((s) => s.at === 50_000);
check('timeline', 'recap scene released at 50 s', !!recap && recap.kind === 'video');

// ------------------------------------------------------------------ strings
/** Every string a viewer can see, with the time it becomes downloadable/visible. */
const strings = [];
for (const s of manifest.scenes) {
  for (const k of ['date', 'label', 'heading', 'body']) if (s[k]) strings.push({ at: s.at, where: `${s.id}.${k}`, text: s[k] });
  if (s.kind === 'video') {
    const clip = manifest.clips[s.clip];
    strings.push({ at: s.at, where: `${s.id}.credit`, text: clip.credit });
    for (const sh of clip.shots) {
      for (const k of ['title', 'label', 'sub', 'tag']) if (sh[k]) strings.push({ at: s.at, where: `${sh.id}.${k}`, text: sh[k] });
      for (const c of sh.captions ?? []) for (const k of ['date', 'text']) if (c[k]) strings.push({ at: s.at, where: `${sh.id}.caption.${k}`, text: c[k].replace(/\[\[(old|new):(.+?)\]\]/g, '$2') });
      for (const p of sh.pages ?? []) for (const side of [p.left, p.right]) strings.push({ at: s.at, where: `${sh.id}.page`, text: `${side.label} ${side.day} ${side.month}` });
      for (const t of sh.ticks ?? []) strings.push({ at: s.at, where: `${sh.id}.tick`, text: `${t.date} ${t.sub ?? ''}` });
      // Text visible inside source pictures (recorded in media/sources.json), by clip release time.
      for (const id of clipSources(clip)) for (const v of meta[id]?.visibleText ?? []) strings.push({ at: s.at, where: `${sh.id}.pixels(${id})`, text: v, pixels: true });
    }
  }
}
const answers = QUESTIONS.map((q) => ({ id: q.id, n: normalizeAnswer(q.answer) }));
const exactHits = strings.flatMap((s) => answers.filter((a) => normalizeAnswer(s.text).includes(a.n)).map((a) => `${s.where}→${a.id}`));
check('leak', `no exact answer of any question in ${strings.length} on-screen strings`, exactHits.length === 0, exactHits.join(', '));
const fold = (x) => normalizeAnswer(x);
const semHits = strings.filter((s) => s.at < manifest.leakPolicy.until).flatMap((s) => manifest.leakPolicy.terms.filter((t) => fold(s.text).includes(fold(t)) || s.text.toLowerCase().includes(t.toLowerCase())).map((t) => `${s.where}@${s.at}:"${t}"`));
check('leak', `no semantic leak terms before ${manifest.leakPolicy.until} ms`, semHits.length === 0, semHits.join(', '));
const pixelLate = strings.filter((s) => s.pixels && s.at >= manifest.leakPolicy.until).map((s) => `${s.where}@${s.at}`);
if (pixelLate.length) check('leak', 'source text with semantic leak appears only after the decisive clue', true, pixelLate.join(', '));

// ------------------------------------------------------------------ sources
for (const s of manifest.scenes.filter((x) => x.kind === 'video')) {
  const clip = manifest.clips[s.clip];
  const early = clipSources(clip).filter((id) => !(id in manifest.sourceRules) || manifest.sourceRules[id] > s.at);
  check('sources', `${s.clip} (released ${s.at} ms) contains no source authorised later`, early.length === 0, early.join(', '));
  let pinned = true;
  for (const id of clipSources(clip)) {
    try {
      sourceFile(lock, id);
    } catch (e) {
      pinned = false;
      console.log(`      ${e.message}`);
    }
  }
  check('sources', `${s.clip} sources are pinned and match their sha256`, pinned);
  const built = buildReport.clips[s.clip]?.sources?.map((x) => `${x.id}:${x.sha256}`).sort().join() ?? '';
  const now = clipSources(clip).map((id) => `${id}:${lock[id].sha256}`).sort().join();
  check('sources', `${s.clip} was built from the currently pinned sources`, built === now);
  const missing = clipSources(clip).filter((id) => meta[id]?.creditKey && !clip.credit.includes(meta[id].creditKey));
  const licence = clipSources(clip).filter((id) => meta[id]?.creditLicence && !clip.credit.includes(meta[id].creditLicence));
  check('credits', `${s.clip} credit names every source (and CC licence)`, missing.length === 0 && licence.length === 0, [...missing, ...licence.map((x) => `${x}:licence`)].join(', '));
}

// ------------------------------------------------------------------ files
function topAtoms(file) {
  const buf = readFileSync(file);
  const atoms = [];
  for (let off = 0; off + 8 <= buf.length; ) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    if (size === 1) size = Number(buf.readBigUInt64BE(off + 8));
    atoms.push(type);
    if (size < 8) break;
    off += size;
  }
  return atoms;
}
const ALLOWED_TAGS = new Set(['major_brand', 'minor_version', 'compatible_brands']);
for (const [id, clip] of Object.entries(manifest.clips)) {
  const file = join(ROOT, 'server/media', clip.file);
  if (!existsSync(file)) {
    check('files', `${id} exists`, false, clip.file);
    continue;
  }
  const p = ffprobe(file);
  const v = p.streams.find((s) => s.codec_type === 'video');
  const bytes = statSync(file).size;
  const dur = Number(p.format.duration) * 1000;
  check('files', `${id} H.264 Main yuv420p 960×540 24 fps`, v.codec_name === 'h264' && v.profile === 'Main' && v.pix_fmt === 'yuv420p' && v.width === 960 && v.height === 540 && v.r_frame_rate === '24/1', `${v.codec_name} ${v.profile} ${v.pix_fmt} ${v.width}×${v.height} ${v.r_frame_rate}`);
  check('files', `${id} has no audio stream`, p.streams.every((s) => s.codec_type === 'video'));
  check('files', `${id} duration ${clip.durationMs} ms`, Math.abs(dur - clip.durationMs) <= 1000 / 24 + 1, `${Math.round(dur)} ms`);
  // Allowed: container brands, MP4 track defaults, and the version-free codec id written by the
  // muxer in bitexact mode ("Lavc libx264"). The x264 settings SEI is removed at encode time.
  const streamTags = Object.entries(v.tags ?? {}).filter(([k, val]) => !['language', 'handler_name', 'vendor_id'].includes(k) && !(k === 'encoder' && val === 'Lavc libx264'));
  const tags = Object.keys(p.format.tags ?? {}).concat(streamTags.map(([k]) => k));
  const sei = readFileSync(file).includes('x264 - core');
  check('files', `${id} has no x264 settings SEI`, !sei);
  const extraTags = tags.filter((k) => !ALLOWED_TAGS.has(k));
  check('files', `${id} carries no title/comment/encoder metadata`, extraTags.length === 0, extraTags.join(', '));
  const atoms = topAtoms(file);
  check('files', `${id} faststart (moov before mdat)`, atoms.indexOf('moov') > -1 && atoms.indexOf('moov') < atoms.indexOf('mdat'), atoms.join('>'));
  const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
  check('files', `${id} matches the build report (sha256)`, sha === buildReport.clips[id]?.sha256);
  const leg = buildReport.clips[id]?.legibility;
  if (manifest.legibility) check('legibility', `${id} essential text ≥ ${manifest.legibility.minPhonePx} px on a ${manifest.legibility.phoneStageWidthPx} px phone stage, inside the frame, above the credit zone`, !!leg && leg.problems.length === 0 && leg.minPhonePx >= manifest.legibility.minPhonePx && leg.samples > 0, leg ? `min ${leg.minPhonePx} px (${leg.minCssPx} px at 960), ${leg.samples} samples, lowest text bottom ${Math.round(leg.maxBottom)}` : 'no measurement');
  check('files', `${id} size ≤ 600 KB`, bytes <= BUDGET, `${(bytes / 1024).toFixed(0)} KB at CRF ${buildReport.clips[id]?.crf}`, 'WARN');
}

// ------------------------------------------------------------------ registry
const registry = new MediaRegistry();
for (const [id, clip] of Object.entries(manifest.clips)) {
  const a = MEDIA_ASSETS.find((x) => x.id === clip.assetId);
  check('registry', `${id} registered as ${clip.assetId} (video, ${clip.durationMs} ms, ${clip.file})`, !!a && a.kind === 'video' && a.durationMs === clip.durationMs && a.file === clip.file && !!registry.resolveFile(a));
  check('registry', `${id} asset id is opaque`, /^[a-z0-9]{8}$/.test(clip.assetId) && !answers.some((x) => normalizeAnswer(clip.assetId).includes(x.n)) && !/c0\d|q\d/.test(clip.assetId));
}

// ------------------------------------------------------------------ dist
const dist = join(ROOT, 'dist');
if (existsSync(dist)) {
  const media = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(mp4|webm|webp|jpe?g|png|tif)$/i.test(n)) media.push(relative(ROOT, p));
    }
  };
  walk(dist);
  check('dist', 'no media files in dist/', media.length === 0, media.join(', '));
} else check('dist', 'dist/ not built yet (run npm run build)', true, 'skipped', 'WARN');

const out = join(dirname(manifestPath), 'validation-report.json');
writeFileSync(out, JSON.stringify({ manifest: relative(ROOT, manifestPath), at: new Date().toISOString(), results }, null, 2) + '\n');
const fails = results.filter((r) => r.status === 'FAIL').length;
const warns = results.filter((r) => r.status === 'WARN').length;
console.log(`\n${results.length - fails - warns} pass, ${warns} warn, ${fails} fail — ${relative(ROOT, out)}`);
process.exit(fails ? 1 : 0);
