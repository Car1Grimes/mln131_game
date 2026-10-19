// Review frames & contact sheets for manual visual review (M3.2).
//
//   node scripts/media/review-frames.mjs media/q2/manifest.json [--shots <dir of e2e screenshots>]
//
// Extracts a frame from every built clip at each shot's midpoint and 0.7 s after every caption
// cue (all internal media cuts), and composes:
//   docs/media-review/q<N>-clips.jpg        frames at 480×270 with time stamps
//   docs/media-review/q<N>-clips-phone.jpg  the same frames at real phone size (measured stage width)
//   docs/media-review/q<N>-round.jpg        (with --shots) projector + phone screenshots of every
//                                           scene taken by the E2E run (SHOTS=…)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { FFMPEG } from './build-clips.mjs';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const args = process.argv.slice(2);
const manifestPath = resolve(args.find((a) => a.endsWith('.json')) ?? 'media/q2/manifest.json');
const shotsDir = args.includes('--shots') ? resolve(args[args.indexOf('--shots') + 1]) : null;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const q = manifest.question;
const work = join(ROOT, 'media-build', `review-q${q}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const outDir = join(ROOT, 'docs/media-review');
mkdirSync(outDir, { recursive: true });

const rows = [];
for (const scene of manifest.scenes.filter((s) => s.kind === 'video')) {
  const clip = manifest.clips[scene.clip];
  const times = new Set();
  for (const sh of clip.shots) {
    times.add(Math.min(clip.durationMs - 120, sh.start + Math.round(sh.dur / 2)));
    for (const c of sh.captions ?? []) times.add(Math.min(clip.durationMs - 120, sh.start + c.at + 700));
    for (const p of sh.pages ?? []) times.add(Math.min(clip.durationMs - 120, sh.start + p.at + 900));
  }
  times.add(clip.durationMs - 120); // last frame (held by the player after the clip ends)
  const frames = [];
  for (const t of [...times].sort((a, b) => a - b)) {
    const png = join(work, `${scene.clip}-${t}.png`);
    const r = spawnSync(FFMPEG, ['-v', 'error', '-y', '-ss', (t / 1000).toFixed(3), '-i', join(ROOT, 'server/media', clip.file), '-frames:v', '1', png]);
    if (r.status !== 0 || !existsSync(png)) throw new Error(`frame ${scene.clip}@${t}: ${r.stderr || 'no frame at this time'}`);
    frames.push({ src: pathToFileURL(png).href, label: `${scene.clip} +${(t / 1000).toFixed(1)} s → round ${((scene.at + t) / 1000).toFixed(1)} s` });
  }
  rows.push({ title: `${scene.id} · ${scene.clip} · released ${scene.at / 1000} s · ${clip.durationMs / 1000} s`, frames });
}

const css = `body{margin:0;padding:24px;background:#0b1020;color:#e8ecf5;font:600 16px system-ui,sans-serif}
h1{font-size:22px;margin:0 0 16px}h2{font-size:17px;margin:22px 0 8px;color:#3ad7ff}
.row{display:flex;flex-wrap:wrap;gap:12px}.f{display:flex;flex-direction:column;gap:4px}.f span{font-size:13px;color:#b8c2d6}
img{display:block;border:1px solid #2a3550}`;
async function sheet(file, title, rowsHtml, width) {
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  // A file:// page may load file:// images; about:blank may not.
  const htmlFile = join(work, `${file.split('/').pop()}.html`);
  writeFileSync(htmlFile, `<!doctype html><meta charset="utf-8"><style>${css}</style><h1>${title}</h1>${rowsHtml}`);
  await page.goto(pathToFileURL(htmlFile).href);
  const bad = await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().then(() => null, () => i.src))));
  if (bad.some(Boolean)) throw new Error(`images failed to decode: ${bad.filter(Boolean).join(", ")}`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 82, fullPage: true });
  await browser.close();
  console.log(file.replace(ROOT + '/', ''));
}
const html = (w) =>
  rows.map((r) => `<h2>${r.title}</h2><div class="row">${r.frames.map((f) => `<div class="f"><img src="${f.src}" width="${w}" height="${Math.round((w * 9) / 16)}"><span>${f.label}</span></div>`).join('')}</div>`).join('');
await sheet(join(outDir, `q${q}-clips.jpg`), `Q${q} clips — internal media cuts (480×270)`, html(480), 2040);
const phoneW = manifest.legibility?.phoneStageWidthPx ?? 336;
await sheet(join(outDir, `q${q}-clips-phone.jpg`), `Q${q} clips at real phone size (stage ${phoneW} px wide on a 360 px phone)`, html(phoneW), 1440);

if (shotsDir && existsSync(shotsDir)) {
  const files = readdirSync(shotsDir).filter((f) => /^A-LAN-(projector|team5)-\d+\.png$/.test(f)).sort();
  const times = [...new Set(files.map((f) => f.match(/-(\d+)\.png$/)[1]))];
  const body = times
    .map((t) => {
      const p = files.find((f) => f.includes('projector') && f.endsWith(`${t}.png`));
      const m = files.find((f) => f.includes('team5') && f.endsWith(`${t}.png`));
      return `<h2>t = ${(Number(t) / 1000).toFixed(1)} s</h2><div class="row">${p ? `<img src="${pathToFileURL(join(shotsDir, p)).href}" width="768">` : ''}${m ? `<img src="${pathToFileURL(join(shotsDir, m)).href}" width="240">` : ''}</div>`;
    })
    .join('');
  await sheet(join(outDir, `q${q}-round.jpg`), `Q${q} live round — projector (1920×1080, scaled) and phone player (360×740)`, body, 1100);
}
