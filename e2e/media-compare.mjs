// Media delivery comparison (M4.1): does progressive playback (<video src=URL>, the browser streams with
// Range requests) show a clip meaningfully sooner than the app's fetch → Blob → <video> pipeline?
// A measurement only: a standalone file server with the production response headers, the same clips,
// one Chrome page, and the same SIMULATED links as the benchmark. The app is not changed or used.
//
//   node e2e/media-compare.mjs            # profiles lan and wifi (resilience Run B: 60 ms ± 80 ms, 2.5 Mbit/s)
//   TRIALS=7 node e2e/media-compare.mjs
//
// Metric per clip: time from "scene released" (the moment the client starts loading) to the first
// frame playing ('playing' event). Blob: fetch + blob + object URL + play. Progressive: src=URL + play.
import { createReadStream, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createProxy } from './lib/netproxy.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const TRIALS = Number(process.env.TRIALS ?? 5);
// Production clips from smallest to largest: c17 78 KB, c26 169 KB, c19 302 KB, c02 594 KB, c04 816 KB.
const CLIPS = (process.env.CLIPS ?? 'c17,c26,c19,c02,c04').split(',');
const PROFILES = { lan: null, wifi: { latencyMs: 60, jitterMs: 80, bytesPerSecond: 312_500 } };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end('<!doctype html><meta charset="utf-8"><video id="v" muted playsinline></video>');
  }
  const m = /^\/clip\/(c\d\d)$/.exec(url.pathname);
  if (!m) return res.writeHead(404).end();
  const file = join(ROOT, 'server/media/clips', `${m[1]}.mp4`);
  const size = statSync(file).size;
  const headers = { 'content-type': 'video/mp4', 'cache-control': 'private, no-store, max-age=0', 'accept-ranges': 'bytes', 'x-content-type-options': 'nosniff' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'content-length': size });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });

const median = (v) => [...v].sort((a, b) => a - b)[Math.floor((v.length - 1) / 2)];
const out = [];
for (const [name, cond] of Object.entries(PROFILES)) {
  for (const clip of CLIPS) {
    const res = { blob: [], progressive: [], progressiveBytesAtPlay: [] };
    for (let i = 0; i < TRIALS; i++) {
      for (const method of i % 2 ? ['progressive', 'blob'] : ['blob', 'progressive']) {
        // A fresh link and a fresh browser context per measurement: no warm connection, no cache.
        const proxy = cond ? await createProxy(port, cond) : null;
        const base = `http://127.0.0.1:${proxy ? proxy.port : port}`;
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto(base + '/');
        const r = await page.evaluate(
          async ({ method, url }) => {
            const v = document.getElementById('v');
            const t0 = performance.now();
            const playing = new Promise((resolve) => v.addEventListener('playing', resolve, { once: true }));
            if (method === 'blob') {
              const resp = await fetch(url, { cache: 'no-store', credentials: 'omit' });
              v.src = URL.createObjectURL(await resp.blob());
            } else v.src = url;
            await v.play();
            await playing;
            const ms = performance.now() - t0;
            const bytes = performance.getEntriesByType('resource').filter((e) => e.name.includes('/clip/')).reduce((n, e) => n + (e.transferSize || 0), 0);
            return { ms, bytes };
          },
          { method, url: `${base}/clip/${clip}?n=${Math.random()}` },
        );
        if (method === 'blob') res.blob.push(r.ms);
        else res.progressive.push(r.ms);
        await ctx.close();
        await proxy?.close();
      }
    }
    const size = statSync(join(ROOT, 'server/media/clips', `${clip}.mp4`)).size;
    const row = { profile: name, clip, kb: Math.round(size / 1024), trials: TRIALS, blobMedianMs: Math.round(median(res.blob)), progressiveMedianMs: Math.round(median(res.progressive)), blobMaxMs: Math.round(Math.max(...res.blob)), progressiveMaxMs: Math.round(Math.max(...res.progressive)) };
    row.savedMedianMs = row.blobMedianMs - row.progressiveMedianMs;
    out.push(row);
    console.log(JSON.stringify(row));
  }
}
await browser.close();
server.close();
console.log('\nMEDIA-COMPARE ' + JSON.stringify(out));
process.exit(0);
