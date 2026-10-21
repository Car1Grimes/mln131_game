// Focused real-browser renderer regression. Run after npm run build:
//   node --import tsx e2e/scene-handoff.mjs
// Uses existing production bytes in an isolated test question, never modifies media/content.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { startApp } from '../server/app.ts';
import { MediaRegistry } from '../server/media/registry.ts';

const OUT = process.env.OUT ?? null;
if (OUT) mkdirSync(OUT, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'hc-handoff-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const asset = (id, file, durationMs) => ({ id, kind: 'video', file: `clips/${file}.mp4`, mime: 'video/mp4', durationMs });
const video = (id, at, assetId, transition = 'cut', endMs = 2000) => ({ id, at, kind: 'video', media: { assetId }, transition, endMs });
const scenes = [
  video('v1', 0, 'clip-a'),
  video('v2', 2000, 'clip-b'), // video → video cut
  { id: 'text1', at: 4000, kind: 'text-card', body: 'Một gợi ý bằng chữ.', transition: 'fade' },
  video('v3', 5000, 'clip-a', 'fade'), // native → video; same cached asset
  video('v4', 7000, 'clip-b', 'fade'), // video → video fade
  video('delayed', 9000, 'clip-delayed', 'cut', 3000),
  video('denied', 12000, 'clip-denied', 'cut', 1000),
  video('corrupt', 13000, 'clip-corrupt', 'cut', 1000),
  { id: 'text2', at: 14000, kind: 'text-card', body: 'Gợi ý tiếp theo.', transition: 'cut' },
  video('restore', 15000, 'clip-b', 'fade', 4000),
  { id: 'end', at: 19000, kind: 'text-card', body: 'Kết thúc quan sát.', transition: 'cut' },
];

function instrument() {
  let next = 0;
  const ids = new WeakMap();
  const id = (v) => { if (!ids.has(v)) ids.set(v, ++next); return ids.get(v); };
  const sample = (v) => ({
    id: id(v), scene: v.closest('.scene-layer')?.dataset.layerSceneId,
    role: v.closest('.scene-layer')?.className, ready: v.readyState,
    seeking: v.seeking, time: v.currentTime, paused: v.paused, connected: v.isConnected,
  });
  window.handoff = { frames: [], events: [] };
  for (const event of ['loadeddata', 'canplay', 'seeking', 'seeked', 'emptied', 'pause', 'error']) {
    document.addEventListener(event, (e) => {
      if (e.target instanceof HTMLVideoElement) window.handoff.events.push({ wall: Date.now(), event, ...sample(e.target) });
    }, true);
  }
  const tick = () => {
    const stage = document.querySelector('.scene-stage');
    if (stage) window.handoff.frames.push({ wall: Date.now(), shown: stage.dataset.sceneId,
      videos: [...stage.querySelectorAll('video')].map(sample),
      native: [...stage.querySelectorAll('.scene-text')].map((e) => {
        const layer = e.closest('.scene-layer'), style = getComputedStyle(layer);
        return { text: e.textContent, opacity: Number(style.opacity), hidden: style.visibility === 'hidden' };
      }),
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

let app, browser, activePage;
try {
  app = await startApp({ dbPath: join(dir, 'test.sqlite'), adminPassword: 'local-handoff-test-password',
    roundDurationMs: 20000, staticDir: resolve('dist'),
    questions: [{ id: 'fixture', answer: 'MẪU THỬ', scenes }],
    media: new MediaRegistry([
      asset('clip-a', 'c17', 5000), asset('clip-b', 'c20', 4000),
      asset('clip-delayed', 'c17', 5000), asset('clip-denied', 'c20', 4000), asset('clip-corrupt', 'c20', 4000),
    ]),
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling'] });
  const { room, teams } = app.engine.createRoom();
  const joinRes = await fetch(`${app.url}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: room.code, pin: teams[0].pin }) });
  assert.ok(joinRes.ok);
  const { token } = await joinRes.json();
  const context = await browser.newContext({ viewport: { width: 360, height: 740 },
    reducedMotion: process.env.REDUCED_MOTION === '1' ? 'reduce' : 'no-preference' });
  await context.addInitScript((token) => sessionStorage.setItem('hc.team.token', token), token);
  await context.addInitScript(instrument);
  const page = await context.newPage();
  activePage = page;
  const requests = [], errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    if (/\/media\//.test(r.url())) requests.push({ wall: Date.now(), asset: r.url().split('/').at(-1) });
  });
  await page.route('**/media/clip-delayed', async (route) => { await sleep(1500); await route.continue(); });
  await page.route('**/media/clip-denied', (route) => route.fulfill({ status: 403, body: 'denied' }));
  await page.route('**/media/clip-corrupt', (route) => route.fulfill({ status: 200, contentType: 'video/mp4', body: 'not an MP4' }));
  await page.goto(app.url);
  await page.getByTestId('ready-button').waitFor();
  const round = app.engine.startRound(room.id);
  const at = (ms) => sleep(Math.max(0, round.started_at + ms - Date.now()));
  const shown = (id) => page.locator(`.scene-stage[data-scene-id="${id}"]`).waitFor({ timeout: 4000 });
  const cast = await context.newCDPSession(page), painted = [];
  cast.on('Page.screencastFrame', async (e) => {
    painted.push({ data: e.data, metadata: e.metadata });
    await cast.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
  });
  await shown('v1');
  const stageBox = await page.locator('.scene-stage').boundingBox();
  await cast.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: 360, maxHeight: 740 });
  await page.getByTestId('answer-input').fill('Bản nháp');
  await page.evaluate(() => { window.originalInput = document.querySelector('[data-testid="answer-input"]'); });
  for (const id of ['v2', 'text1', 'v3', 'v4']) await shown(id);
  await at(9900);
  assert.equal(await page.locator('.scene-stage').getAttribute('data-scene-id'), 'v4', 'decoded outgoing frame is held during delayed load');
  await page.locator('.scene-stage[data-scene-id="v4"] .scene-in video').evaluate((v) => { window.heldVideo = v; window.heldTime = v.currentTime; });
  await at(10300);
  assert.ok(await page.evaluate(() => window.heldVideo.isConnected && Math.abs(window.heldVideo.currentTime - window.heldTime) < 0.05));
  await shown('delayed');
  await shown('denied');
  assert.ok(await page.getByTestId('media-fallback').count(), 'HTTP failure renders visible fallback');
  await shown('corrupt');
  assert.ok(await page.getByTestId('media-fallback').count(), 'decode failure renders visible fallback');
  await shown('text2');
  await shown('restore');
  await at(16100);
  assert.ok(await page.evaluate(() => document.querySelector('[data-testid="answer-input"]') === window.originalInput));
  assert.equal(await page.getByTestId('answer-input').inputValue(), 'Bản nháp');
  await cast.send('Page.stopScreencast');
  const trace = await page.evaluate(() => window.handoff);
  await page.reload();
  await shown('restore');
  const position = await page.locator('.scene-in video').evaluate((v) => ({ time: v.currentTime, seeking: v.seeking, ready: v.readyState }));
  const target = Math.min(4, (Date.now() - round.started_at - 15000) / 1000);
  assert.ok(position.ready >= 2 && !position.seeking && Math.abs(position.time - target) < 0.75, 'reload catches up to released video after seek/decode');
  assert.equal(requests.filter((r) => r.asset === 'clip-b').length, 2, 'one new cache after reload');

  // Each released scene owns one video element from hidden loading through its completed exit.
  for (const id of ['v1', 'v2', 'v3', 'v4', 'delayed', 'restore']) {
    const states = trace.frames.flatMap((f) => f.videos.filter((v) => v.scene === id));
    assert.equal(new Set(states.map((v) => v.id)).size, 1, `${id}: no pending/shown/previous remount`);
    const outgoing = states.filter((v) => v.role.includes('scene-exit'));
    assert.ok(outgoing.every((v) => v.ready >= 2 && !v.seeking), `${id}: decoded outgoing frame stays ready`);
    assert.ok(!trace.events.some((e) => e.scene === id && e.role?.includes('scene-exit') && e.event === 'seeking'), `${id}: no outgoing seek`);
  }
  const first = trace.frames.find((f) => f.shown === 'delayed');
  assert.ok(first.wall >= round.started_at + 10500 && first.wall < round.started_at + 12000);
  assert.ok(trace.frames.every((f) => f.native.filter((n) => !n.hidden && n.opacity > 0.05).length <= 1), 'native text layers never collide');
  assert.equal(requests.filter((r) => r.asset === 'clip-a').length, 1, 'repeated released asset uses Blob cache');
  assert.equal(requests.filter((r) => r.asset === 'clip-b' && r.wall < round.started_at + 16100).length, 1, 'outgoing video is never re-fetched');
  for (const r of requests) assert.ok(r.wall >= round.started_at + scenes.find((s) => s.media?.assetId === r.asset).at - 10, 'no unreleased prefetch');

  // Inspect actual compositor captures, not just a readyState snapshot. Restrict the zero-blank
  // classifier to the cut/fade video handoffs; initial/native entrance fades have intentional timing.
  const analysisPage = await browser.newPage();
  const paintMetrics = await analysisPage.evaluate(async ({ painted, stageBox, startedAt }) => {
    const results = [];
    for (const f of painted) {
      const ms = f.metadata.timestamp * 1000 - startedAt;
      if (!((ms > 1800 && ms < 2800) || (ms > 6800 && ms < 8000) || (ms > 8800 && ms < 11500))) continue;
      const img = new Image(); img.src = `data:image/png;base64,${f.data}`; await img.decode();
      const scale = img.width / f.metadata.deviceWidth;
      const canvas = document.createElement('canvas'); canvas.width = 336; canvas.height = 189;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, stageBox.x * scale, (stageBox.y + f.metadata.offsetTop) * scale,
        stageBox.width * scale, stageBox.height * scale, 0, 0, 336, 189);
      const data = ctx.getImageData(0, 0, 336, 189).data;
      let foreground = 0;
      for (let y = 8; y < 130; y++) for (let x = 8; x < 328; x++) {
        const i = (y * 336 + x) * 4; if (data[i] > 90 && data[i + 1] > 75) foreground++;
      }
      results.push({ ms, foreground });
    }
    return { samples: results.length, blank: results.filter((f) => f.foreground < 10), results };
  }, { painted, stageBox, startedAt: round.started_at });
  if (OUT) {
    writeFileSync(join(OUT, 'result.json'), JSON.stringify({ trace, requests, position, paintMetrics, errors }, null, 2));
    for (let i = 0; i < painted.length; i++) writeFileSync(join(OUT, `paint-${String(i).padStart(4, '0')}.png`), Buffer.from(painted[i].data, 'base64'));
  }
  assert.ok(paintMetrics.samples > 30, 'painted-frame coverage exists');
  assert.equal(paintMetrics.blank.length, 0, 'zero background-only painted frames during decoded video handoffs');
  await analysisPage.close();

  assert.deepEqual(errors, []);
  console.log(`PASS: cuts, fades, native/media handoffs, delayed/failed media, stable video identity, cached reuse and reconnect; ${paintMetrics.samples} painted frames, zero blank.`);
} catch (error) {
  if (OUT && activePage && !activePage.isClosed()) {
    writeFileSync(join(OUT, 'failure.json'), JSON.stringify(await activePage.evaluate(() => window.handoff).catch(() => null), null, 2));
    await activePage.screenshot({ path: join(OUT, 'failure.png') }).catch(() => {});
  }
  console.error(error);
  throw error;
} finally {
  if (browser) await browser.close();
  if (app) await app.close();
  rmSync(dir, { recursive: true, force: true });
}
