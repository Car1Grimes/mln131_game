// Fetches the production sources listed in media/sources.json into the git-ignored staging folder
// media-src/, and pins each file in media/sources.lock.json (resolved URL, size, sha256, original
// resolution, licence seen on the access date). Later runs verify the pins; --update re-pins.
//
//   node scripts/media/fetch-sources.mjs [--only id1,id2] [--update]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const STAGING = join(ROOT, 'media-src');
const MANIFEST = join(ROOT, 'media/sources.json');
const LOCK = join(ROOT, 'media/sources.lock.json');
const UA = { 'User-Agent': 'hidden-connection-classroom-media/1.0 (educational, non-commercial)' };

const args = process.argv.slice(2);
const update = args.includes('--update');
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;

const { sources } = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : { files: {} };
mkdirSync(STAGING, { recursive: true });

async function commonsInfo(title, width) {
  const params = { action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiextmetadatafilter: 'LicenseShortName', format: 'json' };
  if (width) params.iiurlwidth = String(width);
  const res = await fetch('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams(params), { headers: UA });
  const page = Object.values((await res.json()).query.pages)[0];
  if (!page.imageinfo) throw new Error(`${title}: not found on Commons`);
  const ii = page.imageinfo[0];
  // Use the original when the requested width is not smaller than it (no upscaled renditions).
  const useOriginal = !width || width >= ii.width;
  return {
    url: useOriginal ? ii.url : ii.thumburl,
    original: { width: ii.width, height: ii.height, bytes: ii.size },
    licence: ii.extmetadata?.LicenseShortName?.value ?? null,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Wikimedia asks clients to be polite: one request at a time, back off on 429.
async function politeFetch(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.status !== 429 || attempt >= 5) return res;
    const wait = Number(res.headers.get('retry-after')) * 1000 || 5_000 * 2 ** attempt;
    console.log(`wait ${Math.round(wait / 1000)} s (HTTP 429)`);
    await sleep(wait);
  }
}

let failed = false;
for (const s of sources) {
  if (only && !only.has(s.id)) continue;
  const info = s.commons ? await commonsInfo(s.commons, s.fetchWidth) : { url: s.url, original: null, licence: s.licence };
  await sleep(1_500);
  const res = await politeFetch(info.url);
  if (!res.ok) {
    console.error(`FAIL ${s.id}: HTTP ${res.status} ${info.url}`);
    failed = true;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const ext = (extname(new URL(info.url).pathname) || '.bin').toLowerCase();
  const file = `${s.id}${ext === '.tif' ? '.jpg' : ext}`;
  writeFileSync(join(STAGING, file), buf);
  const prev = lock.files[s.id];
  if (prev && prev.sha256 !== sha256 && !update) {
    console.error(`FAIL ${s.id}: sha256 changed (${prev.sha256.slice(0, 12)} → ${sha256.slice(0, 12)}); review and re-run with --update`);
    failed = true;
    continue;
  }
  lock.files[s.id] = {
    file: `media-src/${file}`,
    resolvedUrl: info.url.replace(/[?&]utm_[^&]+/g, ''),
    bytes: buf.length,
    sha256,
    original: info.original,
    licenceOnAccess: info.licence,
    accessed: prev && prev.sha256 === sha256 ? prev.accessed : new Date().toISOString().slice(0, 10),
  };
  console.log(`ok   ${s.id}  ${buf.length} B  ${sha256.slice(0, 12)}  ${info.licence ?? ''}`);
}
writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
process.exit(failed ? 1 : 0);
