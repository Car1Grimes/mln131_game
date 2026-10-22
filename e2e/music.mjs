// Projector-only music proof. Six real40s production rounds; generated tones, never real music.
// npm run build && node --import tsx e2e/music.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { startApp } from '../server/app.ts';
import { FFMPEG } from '../scripts/media/build-clips.mjs';

const out = process.env.OUT ?? 'media-build/m43-music/browser'; mkdirSync(out, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'hc-music-browser-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const checks = [], metrics = [], errors = []; let browser, app;
const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); assert.ok(ok, name + ': ' + detail); };
try {
  // Intro effect deliberately longer than the 5 s intro: it must be cut at the server's active start.
  for (const [track, seconds, frequency] of [['lobby', 2, 220], ['intro', 7, 550], ['question', 45, 330]]) {
    const result = spawnSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=44100`, '-t', String(seconds), '-af', 'volume=0.02', '-c:a', 'libmp3lame', '-b:a', '32k', join(dir, `${track}.mp3`)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  app = await startApp({ dbPath: join(dir, 'game.sqlite'), adminPassword: 'music-browser-test', roundDurationMs: 40000, musicRoot: dir, staticDir: resolve('dist') });
  const call = async (path, token, body) => {
    const r = await fetch(app.url + path, { method: body ? 'POST' : 'GET', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    assert.ok(r.ok, `${path}: ${r.status}`); return r.json();
  };
  const { token: admin } = await call('/api/admin/login', null, { password: 'music-browser-test' });
  const { code } = await call('/api/admin/rooms', admin, {}); const room = app.db.roomByCode(code);
  const { secret } = await call(`/api/admin/rooms/${code}/screen-pairing`, admin, {});
  // No autoplay-policy bypass flag: exercise the real desktop click activation path.
  browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
  const requests = []; page.on('request', r => { if (r.url().includes('/music/')) requests.push({ url: r.url(), at: Date.now() }); });
  await page.addInitScript(() => {
    window.musicTrace = [];
    for (const event of ['play', 'playing', 'pause', 'seeking', 'seeked', 'ended', 'error', 'emptied']) document.addEventListener(event, e => {
      if (e.target instanceof HTMLAudioElement) window.musicTrace.push({ event, wall: Date.now(), src: e.target.currentSrc, time: e.target.currentTime, phase: document.querySelector('.screen-app')?.dataset.phase });
    }, true);
    window.musicSamples = [];
    setInterval(() => {
      const a = document.querySelector('audio'); if (a) window.musicSamples.push({ wall: Date.now(), paused: a.paused, time: a.currentTime, phase: document.querySelector('.screen-app')?.dataset.phase, src: a.currentSrc });
    }, 50);
  });
  let dropStates = false;
  await page.routeWebSocket('**/socket.io/**', ws => {
    const server = ws.connectToServer();
    server.onMessage(message => { if (!dropStates || !String(message).startsWith('42["state"')) ws.send(message); });
  });
  let delayFirst = true;
  await page.route('**/api/rounds/*/media/*', async route => { if (delayFirst) { delayFirst = false; await sleep(1400); } await route.continue(); });
  let questionRequest = 0;
  await page.route('**/api/screen/rooms/*/music/question?*', async route => {
    questionRequest++;
    const q = app.engine.room(room.id).question_index + 1;
    if (q === 1) await sleep(600);
    if (q === 5 && questionRequest === 1) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"music_unavailable"}' });
    if (q === 6 && questionRequest === 1) return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: 'corrupted generated fixture' });
    await route.continue();
  });
  const toggle = () => page.getByTestId('screen-music').click();
  const status = value => page.waitForFunction(v => document.querySelector('[data-testid="screen-music-status"]')?.dataset.status === v, value);
  const audio = () => page.locator('audio').evaluate(a => ({ time: a.currentTime, paused: a.paused, src: a.getAttribute('src') ?? '', currentSrc: a.currentSrc, loop: a.loop }));
  const silent = async label => { const a = await audio(); check(label, a.paused && !a.src, JSON.stringify(a)); };
  await page.goto(`${app.url}/screen#pair=${secret}`); await page.getByTestId('screen-room-code').waitFor();
  check('default OFF makes zero music requests', requests.length === 0 && (await page.getByTestId('screen-music').getAttribute('aria-pressed')) === 'false');
  await toggle(); await status('playing'); check('lobby loop enabled', (await audio()).loop);
  await sleep(2400); check('short generated lobby track loops', !(await audio()).paused && (await audio()).time < 2.1);
  await page.evaluate(() => { window.originalMusicElement = document.querySelector('audio'); });
  const traces = [];
  for (let q = 1; q <= 6; q++) {
    questionRequest = 0;
    const command = Date.now();
    const r = app.engine.startRound(room.id);
    const at = async ms => { const wait = r.started_at + ms - Date.now(); if (wait > 0) await sleep(wait); };
    // Intro: server-timed 5 s preparation; lobby stops, the generic effect plays once, no question audio.
    await page.getByTestId('question-intro').waitFor();
    check(`Q${q} intro starts 5 s before the 40 s round`, r.started_at - command >= 4_990 && r.started_at - command <= 5_010 && r.deadline_at - r.started_at === 40_000);
    await page.waitForFunction(() => { const a = document.querySelector('audio'); return !a.loop && !!a.getAttribute('src') && !a.paused; }, null, { timeout: 3000 });
    await status('playing');
    const introAudio = await audio();
    const introSrc = introAudio.src;
    check(`Q${q} intro effect plays once (not looped), lobby stopped`, !introAudio.loop && !!introSrc && (await page.locator('audio').count()) === 1);
    check(`Q${q} intro uses the preloaded generic effect (no request after the start command)`, requests.filter(x => x.url.includes('/music/intro') && x.at >= command).length === 0);
    check(`Q${q} no question audio or scene requested during the intro`, questionRequest === 0 && (await page.locator('video').count()) === 0);
    await page.getByTestId('screen-play').waitFor();
    await sleep(300);
    const lingering = await page.evaluate(({ src, start }) => window.musicSamples.filter(x => x.src === src && !x.paused && x.wall > start + 150).length, { src: introSrc, start: r.started_at });
    check(`Q${q} 7 s intro effect stopped at the active start (no overlap with question music)`, lingering === 0 && (await audio()).src !== introSrc, `${lingering} late samples`);
    if (q === 1) {
      await sleep(400);
      check('delayed first video does not start question music behind lobby/neutral stage', questionRequest === 0 && (await audio()).paused);
    }
    if (q === 5 || q === 6) {
      await status('unavailable'); check(`Q${q} audio failure leaves gameplay active`, await page.getByTestId('screen-play').isVisible());
      await toggle(); await toggle();
    }
    await status('playing');
    let a = await audio(); let elapsed = (Date.now() - r.started_at) / 1000;
    check(`Q${q} uses same unlooped track, aligned to authoritative start`, !a.loop && Math.abs(a.time - elapsed) < 0.65, `${a.time.toFixed(3)}s / ${elapsed.toFixed(3)}s`);
    if (q === 1) check('delayed soundtrack seeks forward rather than starting at zero', a.time >= 1.4);
    if (q === 2) {
      await at(2500); await toggle(); await silent('active OFF immediately silent'); await toggle(); await status('playing');
      check('active ON resumes current server position', (await audio()).time >= 2.3);
    }
    if (q === 3) {
      await context.setOffline(true); await page.waitForFunction(() => document.querySelector('.conn-reconnecting'));
      await silent('disconnect silences soundtrack'); await sleep(800); await context.setOffline(false); await status('playing');
      check('reconnect aligns current round', Math.abs((await audio()).time - (Date.now() - r.started_at) / 1000) < 0.65);
    }
    if (q === 4) {
      traces.push(await page.evaluate(() => ({ events: window.musicTrace, samples: window.musicSamples })));
      await page.reload(); await page.getByTestId('screen-play').waitFor(); await silent('refresh defaults OFF and retains pairing'); await toggle(); await status('playing');
      check('refresh + explicit ON aligns rather than restarting', Math.abs((await audio()).time - (Date.now() - r.started_at) / 1000) < 0.65);
      await page.evaluate(() => { window.originalMusicElement = document.querySelector('audio'); });
    }
    a = await audio(); const src = a.src; const count = requests.length;
    await at(11000);
    check(`Q${q} scene promotions do not reload/restart music`, (await audio()).src === src && requests.length === count && (await audio()).time > 10);
    check(`Q${q} exactly one persistent player; videos stay muted`, await page.evaluate(() => document.querySelectorAll('audio').length === 1 && document.querySelector('audio') === window.originalMusicElement && [...document.querySelectorAll('video')].every(v => v.muted)));
    if (q === 6) { await at(39500); dropStates = true; }
    await at(40000);
    await page.waitForFunction(() => { const a = document.querySelector('audio'); return a.paused && !a.getAttribute('src'); }, null, { timeout: 1000 });
    metrics.push({ q, stoppedObservedAfterDeadlineMs: Date.now() - r.deadline_at, musicRequests: questionRequest });
    if (q === 6) {
      check('local deadline silences even with closing room state withheld', await page.locator('.screen-app').getAttribute('data-phase') === 'active');
      dropStates = false;
      // Emit fresh authoritative state without changing game logic or the deadline.
      app.engine.rename(room.id, app.engine.teams(room.id)[0].id, 'Đội 1');
    }
    await page.getByTestId('screen-reveal').waitFor(); await silent(`Q${q} revealed/result silent`);
    await toggle(); await toggle(); await silent(`Q${q} OFF/ON in revealed stays silent`);
    app.engine.advance(room.id);
    if (q < 6) {
      await page.getByTestId('screen-waiting').waitFor(); await silent(`Q${q} ready silent; lobby never resumes`);
      const before = requests.length; await toggle(); await toggle(); await sleep(300);
      const fetched = requests.slice(before).map(x => new URL(x.url).pathname.split('/').pop());
      check('ready ON never prefetches lobby/question soundtrack (only the generic intro effect)', fetched.every(x => x === 'intro') && fetched.length <= 1, fetched.join(','));
    }
  }
  await page.getByTestId('screen-final').waitFor(); await status('playing');
  check('finished restarts looping lobby at beginning', (await audio()).loop && (await audio()).time < 1);
  await page.screenshot({ path: join(out, 'finished-laptop.png') });
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.getByTestId('screen-fullscreen').click();
  check('music control remains available fullscreen', await page.getByTestId('screen-music').isVisible());
  await toggle(); await silent('final OFF immediately silent'); await page.screenshot({ path: join(out, 'finished-projector.png') });
  traces.push(await page.evaluate(() => ({ events: window.musicTrace, samples: window.musicSamples })));
  // No direct server-side directory, public audio route or bundle exposure.
  const direct = await fetch(app.url + '/server/media/music/question.mp3');
  check('audio directory is not publicly served', !(await direct.arrayBuffer()).byteLength || !direct.headers.get('content-type')?.startsWith('audio/'));
  check('no unhandled page errors', errors.length === 0, errors.join(';'));
  writeFileSync(join(out, 'evidence.json'), JSON.stringify({ checks, metrics, requests, traces, errors, chrome: browser.version(), fixtureSizes: { lobby: readFileSync(join(dir, 'lobby.mp3')).length, intro: readFileSync(join(dir, 'intro.mp3')).length, question: readFileSync(join(dir, 'question.mp3')).length } }, null, 2));
  console.log(`${checks.length}/${checks.length} checks passed`);
} catch (e) {
  writeFileSync(join(out, 'failure.json'), JSON.stringify({ error: String(e), checks, metrics, errors }, null, 2)); throw e;
} finally { await browser?.close(); await app?.close(); rmSync(dir, { recursive: true, force: true }); }
