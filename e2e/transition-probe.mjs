// Diagnostic (M3.3-A): samples the scene-stage layers every animation frame around a scene change
// and saves screenshots. Usage: OUT=<dir> AT=11000 Q=4 node e2e/transition-probe.mjs
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { adminRoom, joinTeam, roundStart, sleep, startRound, startServer } from './lib/session.mjs';

const OUT = process.env.OUT ?? '.';
const AT = Number(process.env.AT ?? 11_000);
const Q = Number(process.env.Q ?? 4);
const PW = 'probe-password';
const srv = await startServer({ port: 4390, password: PW });
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const admin = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
const { code, pins } = await adminRoom(admin, srv.base, PW, srv.dbPath, Q - 1);
const team = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
await joinTeam(team, srv.base, code, pins[0]);
await startRound(admin);
await team.getByTestId('answer-input').waitFor();
const r = roundStart(srv.dbPath, code);
const at = (ms) => sleep(Math.max(0, r.started_at + ms - Date.now()));
await at(AT - 400);
await team.evaluate(() => {
  window.__samples = [];
  const loop = () => {
    const layers = [...document.querySelectorAll('.scene-stage .scene-layer')].map((l) => {
      const cs = getComputedStyle(l);
      return { cls: l.className.replace('scene-layer ', ''), op: Number(cs.opacity), vis: cs.visibility, bg: cs.backgroundColor, text: (l.innerText || (l.querySelector('video') ? '[video]' : '')).replace(/\s+/g, ' ').slice(0, 40) };
    });
    window.__samples.push({ t: Date.now(), layers });
    if (window.__samples.length < 600) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
for (const dt of [100, 250, 400, 550, 700]) {
  await at(AT + dt);
  await team.screenshot({ path: `${OUT}/t${AT + dt}.png`, clip: { x: 0, y: 0, width: 1366, height: 768 } });
}
await at(AT + 1600);
const samples = await team.evaluate(() => window.__samples);
writeFileSync(`${OUT}/samples.json`, JSON.stringify({ start: r.started_at, samples }, null, 1));
// Frames where two layers with text are both visible (opacity > 0.05).
const overlap = samples.filter((s) => s.layers.filter((l) => l.vis !== 'hidden' && l.op > 0.05 && l.text).length > 1);
const fmt = (s) => `${s.t - r.started_at}ms ` + s.layers.map((l) => `${l.cls}[${l.op.toFixed(2)}${l.vis === 'hidden' ? ',hidden' : ''}] "${l.text}"`).join(' | ');
console.log(`samples ${samples.length}, frames with >1 visible layer: ${overlap.length}`);
for (const s of overlap.filter((_, i) => i % 6 === 0)) console.log('  ' + fmt(s));
await browser.close();
await srv.stop();
process.exit(0);
