// Reproducible clip builder (M3.2).
//
//   npm --prefix media-tools ci                         # once: pinned FFmpeg 6.0 / FFprobe
//   node scripts/media/fetch-sources.mjs                # once: sources → media-src/ (pinned sha256)
//   node scripts/media/build-clips.mjs media/q2/manifest.json [--only c03,c05]
//
// For every clip in the manifest: renders each frame (24 fps) with the HTML templates in
// media/templates/stage.html in headless Chrome (playwright-core, already a dev dependency) at
// 1920×1080, encodes with FFmpeg to 960×540 H.264 (lanczos downscale), and writes
// server/media/<clip.file> plus a build report next to the manifest. A CRF ladder picks the best
// quality that fits the size budget; CRF never goes above CRF_FLOOR (readability), and a clip that
// is still over budget is reported, not crushed.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { landPath } from './map.mjs';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const FPS = 24;
const BUDGET_BYTES = 600 * 1024;
const CRF_LADDER = [24, 26, 28, 30];
const CRF_FLOOR = 30;
export const FFMPEG = process.env.FFMPEG ?? join(ROOT, 'media-tools/node_modules/ffmpeg-static/ffmpeg');
export const FFPROBE = process.env.FFPROBE ?? join(ROOT, `media-tools/node_modules/ffprobe-static/bin/${process.platform}/${process.arch}/ffprobe`);

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const rel = (p) => relative(ROOT, p);

export function loadSources() {
  const lock = JSON.parse(readFileSync(join(ROOT, 'media/sources.lock.json'), 'utf8')).files;
  const meta = Object.fromEntries(JSON.parse(readFileSync(join(ROOT, 'media/sources.json'), 'utf8')).sources.map((s) => [s.id, s]));
  return { lock, meta };
}

/** Verifies a staged source against its pinned hash and returns its absolute path. */
export function sourceFile(lock, id) {
  const entry = lock[id];
  if (!entry) throw new Error(`source ${id} is not in media/sources.lock.json — run fetch-sources.mjs`);
  const file = join(ROOT, entry.file);
  if (!existsSync(file)) throw new Error(`source ${id} missing from staging (${entry.file}) — run fetch-sources.mjs`);
  if (sha256(readFileSync(file)) !== entry.sha256) throw new Error(`source ${id} does not match its pinned sha256`);
  return file;
}

/** Every source a clip draws pixels from. */
export function clipSources(clip) {
  const ids = new Set();
  for (const s of clip.shots) {
    if (s.source) ids.add(s.source);
    if (s.background) ids.add(s.background);
    for (const t of s.ticks ?? []) if (t.thumb) ids.add(t.thumb);
    for (const id of s.thumbs ?? []) if (id) ids.add(id);
  }
  return [...ids];
}

export function ffprobe(file) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

function toolVersion(bin) {
  return spawnSync(bin, ['-version'], { encoding: 'utf8' }).stdout.split('\n')[0];
}

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = resolve(args.find((a) => a.endsWith('.json')) ?? 'media/q2/manifest.json');
  const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const { lock } = loadSources();
  const buildDir = join(ROOT, 'media-build', `q${manifest.question}`);
  mkdirSync(buildDir, { recursive: true });

  // Stage page with pinned fonts.
  const stageHtml = readFileSync(join(ROOT, 'media/templates/stage.html'), 'utf8')
    .replace('FONT_BOLD', pathToFileURL(sourceFile(lock, 'font-bevietnampro-bold')).href)
    .replace('FONT_SEMIBOLD', pathToFileURL(sourceFile(lock, 'font-bevietnampro-semibold')).href);
  const stagePath = join(buildDir, 'stage.html');
  writeFileSync(stagePath, stageHtml);

  // Software rasterisation and fixed colour/text settings: GPU raster made ≈ 2 % of frames differ
  // slightly (PSNR ≈ 58 dB) between runs.
  const browser = await chromium.launch({
    channel: process.env.CHROME_CHANNEL ?? 'chrome',
    headless: true,
    args: ['--disable-gpu', '--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'],
  });
  const reportPath = join(dirname(manifestPath), 'build-report.json');
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : { clips: {} };
  Object.assign(report, {
    manifest: rel(manifestPath),
    builtAt: new Date().toISOString(),
    tools: { ffmpeg: toolVersion(FFMPEG), ffprobe: toolVersion(FFPROBE), chrome: browser.version(), node: process.version },
    settings: { fps: FPS, render: '1920×1080 (960×540 CSS, deviceScaleFactor 2)', output: '960×540', budgetBytes: BUDGET_BYTES, crfLadder: CRF_LADDER, crfFloor: CRF_FLOOR },
  });

  for (const [clipId, clip] of Object.entries(manifest.clips)) {
    if (only && !only.has(clipId)) continue;
    const frames = Math.round((clip.durationMs / 1000) * FPS);
    const frameDir = join(buildDir, clipId);
    rmSync(frameDir, { recursive: true, force: true });
    mkdirSync(frameDir, { recursive: true });

    // Resolve sources to verified local files; precompute map geometry.
    const spec = { shots: structuredClone(clip.shots) };
    for (const s of spec.shots) {
      if (s.type === 'photo') s.src = pathToFileURL(sourceFile(lock, s.source)).href;
      if (s.background) s.background = pathToFileURL(sourceFile(lock, s.background)).href;
      for (const t of s.ticks ?? []) if (t.thumb) t.thumb = pathToFileURL(sourceFile(lock, t.thumb)).href;
      if (s.thumbs) s.thumbs = s.thumbs.map((id) => (id ? pathToFileURL(sourceFile(lock, id)).href : null));
      if (s.type === 'locator') Object.assign(s, landPath(sourceFile(lock, s.source), s.bbox, [s.point.lon, s.point.lat], 960, 540));
    }

    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(stagePath).href);
    const fontsOk = await page.evaluate((sp) => window.HC.load(sp), spec);
    if (!fontsOk) throw new Error(`${clipId}: Be Vietnam Pro did not load`);
    const t0 = Date.now();
    for (let i = 0; i < frames; i++) {
      await page.evaluate((t) => window.HC.render(t), (i * 1000) / FPS);
      await page.screenshot({ path: join(frameDir, `${String(i).padStart(4, '0')}.png`), type: 'png' });
    }
    const upscale = await page.evaluate(() => window.HC.report.maxUpscale);

    // Legibility: measure every essential text at each caption/page cue and mid-shot.
    const leg = manifest.legibility;
    const legibility = { samples: 0, minCssPx: Infinity, minPhonePx: null, maxBottom: 0, problems: [] };
    if (leg) {
      const cues = new Set();
      for (const sh of clip.shots) {
        cues.add(sh.start + Math.round(sh.dur / 2));
        for (const c of sh.captions ?? []) cues.add(sh.start + c.at + 600);
        for (const pg of sh.pages ?? []) cues.add(sh.start + pg.at + 800);
        for (const tk of sh.ticks ?? []) cues.add(sh.start + tk.at + 600);
      }
      cues.add(clip.durationMs - 1);
      const scale = leg.phoneStageWidthPx / 960;
      for (const t of [...cues].filter((x) => x >= 0 && x < clip.durationMs).sort((x, y) => x - y)) {
        await page.evaluate((tt) => window.HC.render(tt), t);
        for (const e of await page.evaluate(() => window.HC.measure())) {
          legibility.samples++;
          legibility.minCssPx = Math.min(legibility.minCssPx, e.px);
          legibility.maxBottom = Math.max(legibility.maxBottom, e.bottom);
          const where = `${clipId}@${t}ms "${e.text}"`;
          if (e.px * scale < leg.minPhonePx) legibility.problems.push(`${where}: ${(e.px * scale).toFixed(1)} px on phone`);
          if (e.left < 0 || e.top < 0 || e.right > 960.5 || e.bottom > 540.5) legibility.problems.push(`${where}: outside the frame`);
          if (e.bottom > leg.bottomSafeY) legibility.problems.push(`${where}: bottom ${Math.round(e.bottom)} > ${leg.bottomSafeY} (credit zone)`);
        }
      }
      legibility.minPhonePx = Number((legibility.minCssPx * scale).toFixed(1));
      if (legibility.problems.length) throw new Error(`${clipId}: legibility rule failed:\n  ${legibility.problems.join('\n  ')}`);
    }
    await page.close();
    const overUpscaled = Object.entries(upscale).filter(([, s]) => s > 1.01);
    if (overUpscaled.length) throw new Error(`${clipId}: shots upscaled beyond source resolution: ${JSON.stringify(overUpscaled)}`);

    // Encode with the CRF ladder.
    const out = join(ROOT, 'server/media', clip.file);
    mkdirSync(dirname(out), { recursive: true });
    const attempts = [];
    let chosen = null;
    for (const crf of CRF_LADDER) {
      const cmd = [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-framerate', String(FPS), '-i', join(frameDir, '%04d.png'),
        '-vf', 'scale=960:540:flags=lanczos,format=yuv420p',
        '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'veryslow', '-tune', clip.tune ?? 'stillimage', '-crf', String(crf),
        '-g', String(FPS), '-keyint_min', String(FPS), '-sc_threshold', '0', '-threads', '1',
        '-an', '-map_metadata', '-1', '-metadata:s:v:0', 'encoder=', '-bsf:v', 'filter_units=remove_types=6',
        '-fflags', '+bitexact', '-flags:v', '+bitexact', '-movflags', '+faststart',
        out,
      ];
      const r = spawnSync(FFMPEG, cmd, { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`${clipId}: ffmpeg failed: ${r.stderr}`);
      const bytes = statSync(out).size;
      attempts.push({ crf, bytes, command: ['ffmpeg', ...cmd.map((a) => (a.startsWith(ROOT) ? rel(a) : a))].join(' ') });
      chosen = { crf, bytes };
      if (bytes <= BUDGET_BYTES || crf >= CRF_FLOOR) break;
    }
    const probe = ffprobe(out);
    const v = probe.streams.find((s) => s.codec_type === 'video');
    report.clips[clipId] = {
      assetId: clip.assetId,
      file: `server/media/${clip.file}`,
      frames,
      durationMs: clip.durationMs,
      renderMs: Date.now() - t0,
      crf: chosen.crf,
      bytes: chosen.bytes,
      overBudget: chosen.bytes > BUDGET_BYTES,
      attempts,
      sha256: sha256(readFileSync(out)),
      probe: {
        codec: v.codec_name, profile: v.profile, pix_fmt: v.pix_fmt, width: v.width, height: v.height, r_frame_rate: v.r_frame_rate,
        duration: Number(probe.format.duration), bit_rate: Number(probe.format.bit_rate),
        streams: probe.streams.map((s) => s.codec_type), formatTags: probe.format.tags ?? {},
      },
      maxSourceScale: upscale,
      legibility,
      sources: clipSources(clip).map((id) => ({ id, sha256: lock[id].sha256 })),
    };
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); // after every clip: a later failure keeps earlier entries
    console.log(`${clipId}: ${frames} frames, CRF ${chosen.crf}, ${(chosen.bytes / 1024).toFixed(0)} KB${chosen.bytes > BUDGET_BYTES ? '  OVER BUDGET' : ''}`);
  }
  await browser.close();
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`report: ${rel(reportPath)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.stack);
    process.exit(1);
  });
}
