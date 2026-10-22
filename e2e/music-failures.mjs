// Short isolated browser checks for early end, policy rejection, failures and control layout.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { startApp } from '../server/app.ts';
import { FFMPEG } from '../scripts/media/build-clips.mjs';
const out = 'media-build/m43-music/failures-browser'; mkdirSync(out, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'hc-music-failures-'));
let app, browser; const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); assert.ok(ok, name + ': ' + JSON.stringify(detail)); };
try {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100', '-t', '2', '-af', 'volume=0.02', '-c:a', 'libmp3lame', '-b:a', '32k', join(dir, 'lobby.mp3')], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
  copyFileSync(join(dir, 'lobby.mp3'), join(dir, 'question.mp3'));
  app = await startApp({ dbPath: join(dir, 'game.sqlite'), adminPassword: 'music-errors', roundDurationMs: 40000, musicRoot: dir, staticDir: resolve('dist') });
  const { room } = app.engine.createRoom();
  const api = async (path, token, body) => (await fetch(app.url + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json();
  const { token } = await api('/api/admin/login', null, { password: 'music-errors' });
  const { secret } = await api(`/api/admin/rooms/${room.code}/screen-pairing`, token, {});
  browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    window.denyTestAudio = true;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this instanceof HTMLAudioElement && window.denyTestAudio) return Promise.reject(new DOMException('Injected autoplay policy refusal', 'NotAllowedError'));
      return play.call(this);
    };
  });
  const status = s => page.waitForFunction(v => document.querySelector('[data-testid="screen-music-status"]')?.dataset.status === v, s);
  const toggle = () => page.getByTestId('screen-music').click();
  await page.goto(`${app.url}/screen#pair=${secret}`); await page.getByTestId('screen-room-code').waitFor();
  await toggle(); await status('blocked'); check('injected autoplay rejection accurately reported, lobby unaffected', await page.getByTestId('screen-lobby').isVisible());
  await page.evaluate(() => { window.denyTestAudio = false; }); await toggle(); await toggle(); await status('playing');
  check('explicit OFF/ON recovers after permission granted', await page.locator('audio').evaluate(a => !a.paused));
  app.engine.startRound(room.id); await page.getByTestId('screen-play').waitFor(); await status('playing'); await status('ended');
  check('real short MP3 ends silently before deadline without looping', await page.locator('audio').evaluate(a => a.paused && !a.loop) && app.engine.room(room.id).phase === 'active');
  await toggle(); rmSync(join(dir, 'question.mp3')); await toggle(); await status('unavailable');
  check('missing file never interrupts the question', await page.getByTestId('screen-play').isVisible());
  for (const [width, height] of [[1366,768], [1920,1080], [1280,720], [360,740]]) {
    await page.setViewportSize({ width, height });
    // Let Chrome submit the resized surface before geometry/screenshot capture.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await page.evaluate(() => {
      const box = e => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
      const controls = box(document.querySelector('.screen-controls')), stage = box(document.querySelector('.scene-stage')), timer = box(document.querySelector('.screen-timer'));
      const overlap = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const music = box(document.querySelector('.screen-music-control')), code = box(document.querySelector('.topbar-room'));
      return { controls, stage, timer, music, code, bad: overlap(controls,stage) || overlap(controls,timer) || overlap(music,code), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    check(`error control layout ${width}×${height}: no clue/timer/room overlap or horizontal overflow`, !geometry.bad && !geometry.overflow, geometry);
    await page.screenshot({ path: join(out, `missing-${width}.png`) });
  }
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.getByTestId('screen-fullscreen').click();
  check('error control remains usable fullscreen', await page.getByTestId('screen-music').isVisible() && await page.evaluate(() => !!document.fullscreenElement));
  await toggle(); writeFileSync(join(dir, 'question.mp3'), 'invalid generated fixture'); await toggle(); await status('unavailable');
  check('corrupted file failure remains silent while visuals continue', await page.locator('audio').evaluate(a => a.paused) && await page.getByTestId('screen-play').isVisible());
  await toggle();
  check('failure cases create no duplicate players or unhandled errors', await page.locator('audio').count() === 1 && errors.length === 0, errors);

  // ---- Intro effect (M4.3 step 2): isolated app; failures never touch the server-timed intro/visuals.
  const dir2 = mkdtempSync(join(tmpdir(), 'hc-intro-failures-'));
  copyFileSync(join(dir, 'lobby.mp3'), join(dir2, 'lobby.mp3'));
  const app2 = await startApp({ dbPath: join(dir2, 'game.sqlite'), adminPassword: 'intro-errors', roundDurationMs: 6000, musicRoot: dir2, staticDir: resolve('dist') });
  try {
    const { room: room2 } = app2.engine.createRoom();
    const api2 = async (path, token, body) => (await fetch(app2.url + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json();
    const { token: admin2 } = await api2('/api/admin/login', null, { password: 'intro-errors' });
    const { secret: secret2 } = await api2(`/api/admin/rooms/${room2.code}/screen-pairing`, admin2, {});
    const p2 = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors2 = []; p2.on('pageerror', e => errors2.push(String(e)));
    await p2.addInitScript(() => {
      window.denyTestAudio = false;
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (this instanceof HTMLAudioElement && window.denyTestAudio) return Promise.reject(new DOMException('Injected autoplay policy refusal', 'NotAllowedError'));
        return play.call(this);
      };
      window.audioSamples = [];
      setInterval(() => { const a = document.querySelector('audio'); if (a) window.audioSamples.push({ wall: Date.now(), playing: !a.paused, src: a.getAttribute('src') ?? '' }); }, 50);
    });
    const status2 = s => p2.waitForFunction(v => document.querySelector('[data-testid="screen-music-status"]')?.dataset.status === v, s, { timeout: 4000 });
    const toggle2 = () => p2.getByTestId('screen-music').click();
    let delayIntro = 0;
    await p2.route('**/api/screen/rooms/*/music/intro', async route => { if (delayIntro) await new Promise(r => setTimeout(r, delayIntro)); await route.continue().catch(() => {}); });
    await p2.goto(`${app2.url}/screen#pair=${secret2}`); await p2.getByTestId('screen-room-code').waitFor();
    await toggle2(); await status2('playing');
    /** Runs one intro and proves the visuals are unaffected: countdown shown, active exactly at startedAt. */
    const introRound = async (label, during) => {
      const r = app2.engine.startRound(room2.id);
      await p2.getByTestId('question-intro').waitFor();
      await during?.(r);
      if (Date.now() > r.started_at + 500) {
        // The check itself ran past the boundary: the round must already be on screen.
        check(`${label}: intro visuals unaffected; round already started on the server time`, (await p2.getByTestId('screen-play').count()) === 1 && (await p2.getByTestId('question-intro').count()) === 0);
      } else {
        await p2.getByTestId('screen-play').waitFor();
        const late = Date.now() - r.started_at;
        check(`${label}: intro visuals unaffected; round starts on the server time`, late >= 0 && late < 1000, { late });
      }
      await p2.getByTestId('screen-reveal').waitFor({ timeout: 10000 });
      app2.engine.advance(room2.id);
      await p2.getByTestId('screen-waiting').waitFor();
      return r;
    };
    // Missing file (the optional intro.mp3 is absent).
    await introRound('missing intro effect', async () => { await status2('unavailable'); check('missing intro effect reported; countdown continues', await p2.getByTestId('intro-countdown').isVisible()); });
    // Short (2 s) effect: plays once, then silence for the rest of the intro.
    copyFileSync(join(dir, 'lobby.mp3'), join(dir2, 'intro.mp3'));
    await toggle2(); await toggle2(); await new Promise(r => setTimeout(r, 300)); // OFF/ON: preload the replaced file
    await introRound('short intro effect', async (r) => {
      await status2('playing'); await status2('ended');
      check('short intro effect ends in silence before the active start', Date.now() < r.started_at && await p2.locator('audio').evaluate(a => a.paused && !a.loop));
    });
    // Corrupt file: decode error reported, silence.
    writeFileSync(join(dir2, 'intro.mp3'), 'invalid generated fixture');
    await toggle2(); await toggle2(); await new Promise(r => setTimeout(r, 300));
    await introRound('corrupt intro effect', async () => { await status2('unavailable'); check('corrupt intro effect stays silent', await p2.locator('audio').evaluate(a => a.paused)); });
    // Delayed beyond the intro: the late response is discarded, never played over the round.
    copyFileSync(join(dir, 'lobby.mp3'), join(dir2, 'intro.mp3'));
    await toggle2(); // OFF in ready: no preload
    delayIntro = 6500;
    await introRound('delayed intro effect', async (r) => {
      await toggle2(); // ON during the intro: fetch is delayed past the active start
      await p2.waitForFunction(t => Date.now() > t, r.started_at + 2000, { timeout: 9000 });
      const played = await p2.evaluate(start => window.audioSamples.filter(x => x.wall >= start && x.playing).length, r.started_at - 5000);
      check('delayed intro effect never plays late or extends the intro', played === 0, { played });
    });
    delayIntro = 0;
    // Autoplay refusal during the intro.
    await toggle2(); await toggle2(); await new Promise(r => setTimeout(r, 300));
    await p2.evaluate(() => { window.denyTestAudio = true; });
    await introRound('autoplay-blocked intro effect', async () => { await status2('blocked'); check('autoplay refusal during intro reported accurately', await p2.getByTestId('intro-countdown').isVisible()); });
    check('intro failure cases: one player element, no unhandled errors', await p2.locator('audio').count() === 1 && errors2.length === 0, errors2);
    await p2.close();
  } finally { await app2.close(); rmSync(dir2, { recursive: true, force: true }); }
  console.log(`${results.length}/${results.length} checks passed`);
} finally { writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 2)); await browser?.close(); await app?.close(); rmSync(dir, { recursive: true, force: true }); }
