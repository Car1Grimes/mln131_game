// Presentation & attribution E2E (M3.3-A). Run `npm run build` first. Local Google Chrome.
//
//   node e2e/presentation.mjs                  # everything
//   PART=typography OUT=<dir> node e2e/presentation.mjs   # only the native-scene measurements
//   CPU_THROTTLE=8 PART=typography node e2e/presentation.mjs  # Q4 change sampled at 8× CPU slowdown
//
// Part T — typography & transitions: real 60 s production rounds of Q1, Q3, Q4, Q5, Q6 in parallel
//   rooms; teams at 360×740, 390×844, 1366×768 (plus 360×740 with forced narrow and wide fallback
//   fonts) and a paired projector at 1920×1080. At each dense native scene the rendered stage is
//   measured (font sizes, lines, clipping, heading/body overlap, horizontal scroll, masked-box
//   grouping) and screenshotted. Q4's 11 s change (video → text): no two text layers may be visible
//   at once — in every painted frame and in a frame-rate-independent sweep of the CSS animations.
// Part A — attribution ("Nguồn tư liệu"), security and lifecycle: no credits in any state frame of an
//   active round (admin, team, projector), no attribution endpoint/static file, credits of the closed
//   round only (right question, URLs, licences), safe external links, keyboard use, long URLs on a
//   phone, refresh, reconnect, server restart, return to results, advance clears the panel.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { adminRoom, joinTeam, pairProjector, roundStart, sleep, startRound, startServer } from './lib/session.mjs';

const OUT = process.env.OUT ?? null;
const PART = process.env.PART ?? 'all';
const PW = 'e2e-presentation-password';
const PORT = Number(process.env.E2E_PRESENTATION_PORT ?? 4350);
if (OUT) mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// Dense native scenes under test: question number → [{ id, at }].
const DENSE = {
  1: [{ id: 'h5', at: 26_000 }, { id: 'h7', at: 36_000 }, { id: 'h8', at: 41_000 }, { id: 'h9', at: 45_000 }],
  3: [{ id: 'e7', at: 35_000 }, { id: 'e8', at: 40_000 }, { id: 'e9', at: 45_000 }],
  4: [{ id: 'b3', at: 11_000 }, { id: 'b9', at: 45_000 }],
  5: [{ id: 'f6', at: 28_000 }, { id: 'f9', at: 45_000 }],
  6: [{ id: 'd7', at: 32_000 }, { id: 'd8', at: 38_000 }, { id: 'd9', at: 45_000 }],
};
const VIEWPORTS = [
  { name: 'phone360', width: 360, height: 740 },
  { name: 'phone390', width: 390, height: 844 },
  { name: 'laptop1366', width: 1366, height: 768 },
];
// Extra 360×740 devices with forced font fallbacks: scene text uses system fonts, whose widths differ
// per platform (the Linux fallbacks are wider than macOS's). The first available family of each stack
// is used; the font actually rendered is read back through the DevTools protocol and reported.
const FONT_VARIANTS = [
  { name: 'phone360-narrowfont', stack: "'Arial Narrow', 'Liberation Sans Narrow', 'DejaVu Sans Condensed', 'Roboto Condensed', sans-serif" },
  { name: 'phone360-widefont', stack: "Verdana, 'DejaVu Sans', 'Bitstream Vera Sans', sans-serif" },
  // Synthetic worst case wider than any of the above (+0.05 em tracking on inherited scene text):
  // reproduces the Linux Q3 e7 clip on any platform, so the fix stays guarded on macOS too.
  { name: 'phone360-extrawide', stack: "Verdana, 'DejaVu Sans', 'Bitstream Vera Sans', sans-serif", tracking: '0.05em' },
];
// Expected credits per question (from server/content/attribution.json, read by the server only).
const EXPECT = {
  1: { count: 3, has: ['Myra Siason'], not: ['Dalbéra', 'Adam Jones', 'Bahnfrend', 'Florstein', 'Tycho'] },
  6: { count: 6, has: ['LeRoy Woodson', 'Tycho'], not: ['Myra Siason', 'Dalbéra', 'Windrain'] },
};
const MIN_PX = 16;

const srv = await startServer({ port: PORT, password: PW });
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function page(who, viewport, opts = {}) {
  const { font, ...ctxOpts } = opts;
  const context = await browser.newContext({ viewport, ...ctxOpts });
  if (font) {
    await context.addInitScript(({ stack, tracking }) => {
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = `:root { --font-display: ${stack} !important; --font-body: ${stack} !important; }${tracking ? ` .scene-stage { letter-spacing: ${tracking}; }` : ''}`;
        document.head.append(s);
      });
    }, font);
  }
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(`${who}: ${e}`));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource.*40[134]/.test(m.text()) && errors.push(`${who}: ${m.text()}`));
  p.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(srv.base) && !u.startsWith('data:') && !u.startsWith(`blob:${srv.base}`)) errors.push(`${who}: external request ${u}`);
  });
  // Every state frame this page receives (Socket.IO over WebSocket), with its local receipt time.
  p.__frames = [];
  p.on('websocket', (ws) => ws.on('framereceived', (f) => typeof f.payload === 'string' && p.__frames.push({ t: Date.now(), text: f.payload })));
  return { who, page: p, context };
}

/** Measures the visible native scene on a page's stage. Runs in the browser. */
function measureStage() {
  const stage = document.querySelector('.scene-stage');
  const layer = stage?.querySelector('.scene-in');
  if (!stage || !layer) return null;
  const sr = stage.getBoundingClientRect();
  const sel = '.scene-text-heading,.scene-text-body,.scene-date-value,.scene-date-label,.scene-stat-value,.scene-stat-label,.scene-stat-source';
  const items = [...layer.querySelectorAll(sel)].map((e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    const fs = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === 'normal' ? fs * 1.2 : parseFloat(cs.lineHeight);
    return { cls: e.className, text: e.textContent.trim().slice(0, 50), fontPx: fs, lineHeightPx: Math.round(lh * 10) / 10, lines: Math.max(1, Math.round(r.height / lh)), top: r.top, bottom: r.bottom, left: r.left, right: r.right, color: cs.color };
  });
  const clipped = items.filter((i) => i.top < sr.top - 1 || i.bottom > sr.bottom + 1 || i.left < sr.left - 1 || i.right > sr.right + 1).map((i) => i.cls);
  const overlaps = [];
  for (let k = 1; k < items.length; k++) if (items[k].top < items[k - 1].bottom - 1) overlaps.push(`${items[k - 1].cls}/${items[k].cls}`);
  // Masked answer boxes: each group must render on one line; groups of one answer stay together.
  const groups = [];
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  let run = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    let prevEnd = -1;
    for (const m of n.textContent.matchAll(/▢+/g)) {
      // A new answer run starts unless only spaces separate this group from the previous one.
      if (prevEnd < 0 || !/^[\s\u00a0]+$/.test(n.textContent.slice(prevEnd, m.index))) run++;
      prevEnd = m.index + m[0].length;
      const range = document.createRange();
      range.setStart(n, m.index);
      range.setEnd(n, m.index + m[0].length);
      const rects = [...range.getClientRects()].filter((x) => x.width > 0);
      groups.push({ run, len: m[0].length, rects: rects.length, top: Math.round(rects[0]?.top ?? 0) });
    }
  }
  return {
    stage: { width: Math.round(sr.width), height: Math.round(sr.height) },
    items,
    clipped,
    overlaps,
    layerOverflow: layer.scrollHeight > layer.clientHeight + 1 || layer.scrollWidth > layer.clientWidth + 1,
    pageHScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    groups,
    fit: Number(layer.querySelector('.scene-fit')?.dataset.fit ?? 1),
  };
}

/** Font families actually used for the visible scene's text (DevTools protocol), e.g. "Verdana". */
async function renderedFonts(cdp) {
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '.scene-stage .scene-in .scene-fit > *' });
  const names = new Set();
  for (const nodeId of nodeIds) for (const f of (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts) names.add(f.familyName);
  return [...names];
}

// ====================================================================== Part T
const typography = [];
let q1Room = null;
async function runRoom(q) {
  const admin = await page(`admin-q${q}`, { width: 1600, height: 1000 });
  const { code, pins } = await adminRoom(admin.page, srv.base, PW, srv.dbPath, q - 1);
  const projector = await page(`projector-q${q}`, { width: 1920, height: 1080 });
  await pairProjector(admin.page, projector.page);
  const teams = [];
  for (let i = 0; i < VIEWPORTS.length; i++) {
    const t = await page(`q${q}-${VIEWPORTS[i].name}`, VIEWPORTS[i]);
    await joinTeam(t.page, srv.base, code, pins[i]);
    teams.push({ ...t, vp: VIEWPORTS[i] });
  }
  // Extra devices of teams 1–3 (several devices per team are allowed); measured only.
  const fontPages = [];
  for (let i = 0; i < FONT_VARIANTS.length; i++) {
    const vp = { name: FONT_VARIANTS[i].name, width: 360, height: 740 };
    const t = await page(`q${q}-${vp.name}`, vp, { font: FONT_VARIANTS[i] });
    await joinTeam(t.page, srv.base, code, pins[i]);
    fontPages.push({ ...t, vp, cdp: await t.context.newCDPSession(t.page) });
  }
  let reduced = null;
  if (q === 4) {
    reduced = await page('q4-reduced-motion', { width: 1366, height: 768 }, { reducedMotion: 'reduce' });
    await joinTeam(reduced.page, srv.base, code, pins[VIEWPORTS.length]);
  }
  return { q, admin, projector, teams, fontPages, code, pins, reduced };
}
async function playRoom(room) {
  const { q, admin, projector, teams, fontPages, code } = room;
  await startRound(admin.page);
  await Promise.all([...teams, ...fontPages].map((t) => t.page.getByTestId('answer-input').waitFor()));
  const r = roundStart(srv.dbPath, code);
  room.round = r;
  const at = (ms) => sleep(Math.max(0, r.started_at + ms - Date.now()));
  // Q4: the 11 s change (video → text) on the laptop, the projector and a reduced-motion device.
  // Two independent records: (1) every animation frame the browser really paints, from 9 s until
  // 1.5 s after b3 first appears (time-bounded, so a slow machine yields fewer frames, never a
  // shorter window; installed early so a late test process still sees the old scene); (2) a
  // deterministic sweep: the moment both layers exist (MutationObserver, before the first paint),
  // their real CSS animations are stepped through their whole timeline in 4 ms steps and the
  // computed opacities read back, then restored — the same task, so nothing is painted. The sweep
  // does not depend on the frame rate, so CPU load cannot hide an overlap between two frames.
  let sampler = null;
  if (q === 4) {
    await at(9_000);
    const pages = [teams[2].page, projector.page, room.reduced.page];
    // CPU_THROTTLE=<n>: the sampled pages run n× slower during the change (DevTools CPU throttling),
    // i.e. a low frame rate. Optional stress mode; the checks are the same.
    if (process.env.CPU_THROTTLE) {
      for (const p of pages) {
        p.__cdp = await p.context().newCDPSession(p);
        await p.__cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU_THROTTLE) });
      }
    }
    await Promise.all(
      pages.map((p) =>
        p.evaluate(() => {
          window.__samples = [];
          window.__sweeps = [];
          const visible = (l) => {
            const cs = getComputedStyle(l);
            return { op: Number(cs.opacity), hidden: cs.visibility === 'hidden', text: !!l.innerText.trim() || !!l.querySelector('video') };
          };
          const stage = document.querySelector('.scene-stage');
          const swept = new Set();
          const sweep = () => {
            const exit = stage.querySelector(':scope > .scene-exit');
            const enter = stage.querySelector(':scope > .scene-in');
            if (!exit || !enter || swept.has(enter)) return;
            swept.add(enter);
            const anims = [exit, enter].flatMap((el) => el.getAnimations());
            const orig = anims.map((a) => a.currentTime ?? 0);
            const end = Math.max(0, ...anims.map((a) => a.effect.getComputedTiming().endTime));
            let steps = 0;
            const overlaps = [];
            const empty = [];
            for (let dt = 0; dt <= end + 40; dt += 4, steps++) {
              anims.forEach((a, i) => (a.currentTime = orig[i] + dt));
              const ls = [exit, enter].map(visible);
              if (ls.filter((l) => !l.hidden && l.op > 0.02 && l.text).length > 1) overlaps.push({ dt, ops: ls.map((l) => l.op) });
              if (ls.every((l) => l.hidden || l.op <= 0.02)) empty.push(dt);
            }
            anims.forEach((a, i) => (a.currentTime = orig[i]));
            window.__sweeps.push({ exit: exit.className, enter: enter.className, anims: anims.map((a) => a.animationName), endMs: end, steps, overlaps, emptyMs: empty.length * 4 });
          };
          new MutationObserver(sweep).observe(stage, { childList: true, attributes: true, attributeFilter: ['class'], subtree: false });
          const t0 = performance.now();
          let seen = null;
          const loop = () => {
            const now = performance.now();
            const layers = [...stage.querySelectorAll(':scope > .scene-layer')].map((l) => ({ cls: l.className, ...visible(l) }));
            window.__samples.push({ t: Date.now(), scene: stage.dataset.sceneId, layers });
            if (seen === null && stage.dataset.sceneId === 'b3') seen = now;
            if ((seen === null || now - seen < 1_500) && now - t0 < 8_000) requestAnimationFrame(loop);
            else window.__samplingDone = true;
          };
          requestAnimationFrame(loop);
        }),
      ),
    );
    sampler = pages;
  }
  for (const s of DENSE[q]) {
    await at(s.at + 1_500);
    for (const c of [...teams, ...fontPages, { ...projector, vp: { name: 'projector1920', width: 1920, height: 1080 } }]) {
      const m = await c.page.evaluate(measureStage);
      const sceneId = await c.page.locator('.scene-stage').getAttribute('data-scene-id');
      typography.push({ q, scene: s.id, shownScene: sceneId, viewport: c.vp.name, fonts: c.cdp ? await renderedFonts(c.cdp) : null, ...m });
      if (OUT) await c.page.locator('.scene-stage').screenshot({ path: join(OUT, `q${q}-${s.id}-${c.vp.name}.png`) });
    }
    if (q === 4 && s.id === 'b3' && sampler) {
      for (const p of sampler) {
        await p.waitForFunction(() => window.__samplingDone, null, { timeout: 15_000 });
        await p.__cdp?.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        const { samples, sweeps } = await p.evaluate(() => ({ samples: window.__samples, sweeps: window.__sweeps }));
        const who = p === room.reduced.page ? 'reduced-motion device' : p === projector.page ? 'projector' : 'laptop';
        const sw = sweeps.find((x) => /scene-t-slide/.test(x.enter));
        const both = samples.filter((x) => x.layers.filter((l) => !l.hidden && l.op > 0.02 && l.text).length > 1);
        // Coverage instead of a frame count: real frames before the change (old scene only) and after
        // it (new scene settled, exit layer gone) must both have been painted and sampled.
        const before = samples.some((x) => x.scene === 'b2' && x.layers.every((l) => !/scene-exit/.test(l.cls)));
        const after = samples.some((x) => x.scene === 'b3' && x.layers.every((l) => !/scene-exit/.test(l.cls)) && x.layers.some((l) => /scene-t-slide/.test(l.cls) && l.op > 0.98));
        const covered = before && after && !!sw && sw.steps >= 10;
        const detail = `${samples.length} real frames (before ${before}, after ${after}), ${both.length} overlapping; sweep ${sw ? `${sw.steps} steps over ${Math.round(sw.endMs)} ms [${sw.anims}], ${sw.overlaps.length} overlapping${sw.overlaps.length ? ` @${sw.overlaps.slice(0, 3).map((o) => `${o.dt}ms ${o.ops}`)}` : ''}` : 'NOT RUN'}`;
        if (p === room.reduced.page) {
          // Reduced motion: the change is instant — the new scene is fully opaque from its first frame.
          const firstNew = samples.find((x) => x.layers.some((l) => /scene-t-slide/.test(l.cls) && l.op > 0.02));
          const op = firstNew?.layers.find((l) => /scene-t-slide/.test(l.cls))?.op;
          check(`Q4 11 s change on ${who}: no overlap (real frames and timeline sweep), new scene fully opaque on its first visible frame`, covered && both.length === 0 && sw.overlaps.length === 0 && op > 0.98, `${detail}, first opacity ${op}`);
          continue;
        }
        const black = samples.filter((x) => x.layers.filter((l) => !l.hidden && l.op > 0.02).length === 0);
        check(`Q4 11 s change on ${who}: never two visible scene layers (real frames and timeline sweep)`, covered && both.length === 0 && sw.overlaps.length === 0, detail);
        check(`Q4 11 s change on ${who}: at most one frame without a visible layer (stage background, no black)`, black.length <= 2 && sw && sw.emptyMs <= 50, `${black.length} empty real frames, ${sw?.emptyMs} ms empty in the sweep`);
      }
    }
  }
  await at(60_500);
  return room;
}

const roomsT = [];
if (PART === 'all' || PART === 'typography') {
  for (const batch of [[1, 4, 5], [3, 6]]) {
    const rooms = await Promise.all(batch.map(runRoom));
    await Promise.all(rooms.map(playRoom));
    roomsT.push(...rooms);
  }
  // Verdicts.
  for (const m of typography) {
    const where = `Q${m.q} ${m.scene} @ ${m.viewport}`;
    if (!m.items) {
      check(`${where}: scene rendered`, false, 'no stage');
      continue;
    }
    const minPx = Math.min(...m.items.map((i) => i.fontPx));
    const ok = m.shownScene === m.scene && m.clipped.length === 0 && m.overlaps.length === 0 && !m.layerOverflow && !m.pageHScroll && minPx >= MIN_PX && m.groups.every((g) => g.rects === 1) && [...new Set(m.groups.map((g) => g.run))].every((r) => new Set(m.groups.filter((g) => g.run === r).map((g) => g.top)).size === 1);
    check(`${where}: legible, unclipped, no overlap, boxes grouped`, ok, `${m.shownScene !== m.scene ? `SHOWING ${m.shownScene}, ` : ''}${m.fonts ? `fonts ${m.fonts.join('/')}, ` : ''}stage ${m.stage.width}×${m.stage.height}, fit ${m.fit}, min ${minPx.toFixed(1)} px, ${m.items.map((i) => `${i.cls.replace('scene-', '')} ${i.fontPx.toFixed(1)}px×${i.lines}`).join(', ')}${m.clipped.length ? ` CLIPPED ${m.clipped}` : ''}${m.overlaps.length ? ` OVERLAP ${m.overlaps}` : ''}${m.layerOverflow ? ' OVERFLOW' : ''}${m.pageHScroll ? ' HSCROLL' : ''}${m.groups.length ? ` boxes ${m.groups.map((g) => `r${g.run}:${g.len}@${g.top}`).join(' ')}` : ''}`);
  }
  if (OUT) writeFileSync(join(OUT, 'typography.json'), JSON.stringify(typography, null, 1));
  q1Room = roomsT.find((r) => r.q === 1);
}

// ====================================================================== Part A
if (PART === 'all' || PART === 'attribution') {
  if (!q1Room) {
    q1Room = await runRoom(1);
    await playRoom(q1Room);
  }
  const { admin, projector, teams } = q1Room;
  const phone = teams[0];
  const all = [admin, projector, ...teams];
  const deadline = q1Room.round.started_at + 60_000;
  // A. Active round: no credits in any state frame before the deadline (all roles). (The neutral
  // in-round scene credit, e.g. "Ảnh: Myra Siason 2007 CC BY-SA 2.0", is approved content; the
  // post-round credits are the attribution object with source and licence URLs.)
  const CREDITS = /"attribution"\s*:\s*\{|creativecommons\.org|commons\.wikimedia\.org|Thay đổi|modifications/;
  for (const c of all) {
    const early = c.page.__frames.filter((f) => f.t < deadline - 300 && CREDITS.test(f.text));
    check(`A: ${c.who} received no credits during the active round`, c.page.__frames.length > 0 && early.length === 0, `${c.page.__frames.length} frames, ${early.length} with credits`);
  }
  for (const path of ['/media/sources.json', '/sources.json', '/attribution.json', '/server/content/attribution.json', '/api/attribution', '/api/sources', '/content/attribution.json']) {
    const res = await fetch(srv.base + path);
    const body = await res.text();
    check(`A: no public attribution data at ${path}`, !/creativecommons|wikimedia|Siason/.test(body) && (res.status === 404 || /<div id="root">|<!doctype html>/i.test(body)), `HTTP ${res.status}${res.status === 200 ? ' (SPA index only)' : ''}`);
  }
  // B. After the server-confirmed reveal.
  for (const c of all) {
    const btn = c.page.getByTestId('attribution-open');
    await btn.waitFor({ timeout: 10_000 });
    const after = c.page.__frames.filter((f) => f.t >= deadline - 300 && /"attribution"\s*:\s*\{/.test(f.text));
    check(`B: ${c.who} receives the credits only after the deadline`, after.length > 0);
  }
  for (const c of [phone, projector, admin]) {
    await c.page.getByTestId('attribution-open').click();
    const panel = c.page.getByTestId('attribution-panel');
    await panel.waitFor();
    const text = await panel.innerText();
    const items = await c.page.getByTestId('attribution-item').count();
    const exp = EXPECT[1];
    check(`B: ${c.who} shows Q1 credits only (${items} entries)`, items === exp.count && exp.has.every((h) => text.includes(h)) && exp.not.every((n) => !text.includes(n)));
    const links = await panel.locator('a').evaluateAll((as) => as.map((a) => ({ href: a.href, target: a.target, rel: a.rel })));
    check(`B/E: ${c.who} links are http(s), open in a new tab with noopener noreferrer`, links.length >= 3 && links.every((l) => /^https:\/\//.test(l.href) && l.target === '_blank' && /noopener/.test(l.rel) && /noreferrer/.test(l.rel)), `${links.length} links`);
    check(`B: ${c.who} shows source URL and licence (CC BY-SA 2.0 + link)`, /commons\.wikimedia\.org/.test(text) && links.some((l) => l.href === 'https://creativecommons.org/licenses/by-sa/2.0/') && /Thay đổi/.test(text));
    await c.page.waitForFunction(() => [...document.querySelectorAll('.modal, .modal-backdrop')].every((e) => e.getAnimations().every((an) => an.playState === 'finished')));
    const onTop = await c.page.evaluate(() => {
      const r = document.querySelector('.modal').getBoundingClientRect();
      return [[0.5, 0.2], [0.5, 0.5], [0.5, 0.85]].every(([x, y]) => !!document.elementFromPoint(r.left + r.width * x, r.top + r.height * y)?.closest('.modal'));
    });
    check(`E: ${c.who} dialog is on top of the results (hit-test)`, onTop);
    if (OUT) await c.page.screenshot({ path: join(OUT, `attribution-q1-${c.who}.png`) });
  }
  // E. Phone: long URLs wrap, no horizontal scroll inside the dialog or the page.
  const wide = await phone.page.evaluate(() => {
    const m = document.querySelector('.modal');
    return { modal: m.scrollWidth - m.clientWidth, page: document.documentElement.scrollWidth - window.innerWidth };
  });
  check('E: phone dialog has no horizontal overflow with long URLs', wide.modal <= 1 && wide.page <= 1, JSON.stringify(wide));
  // E. Dialog semantics and isolation (phone): role, modal flag, accessible name, inert background,
  //    Tab never leaves the dialog, the long list scrolls and the bottom button is reachable.
  const a11y = await phone.page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const label = d && document.getElementById(d.getAttribute('aria-labelledby') ?? '')?.textContent;
    const root = document.getElementById('root');
    const opener = document.querySelector('[data-testid="attribution-open"]');
    opener?.focus();
    const stolen = document.activeElement === opener;
    return { role: !!d, modal: d?.getAttribute('aria-modal'), label, rootInert: root?.inert === true, dialogOutsideRoot: !!d && !root?.contains(d), stolen };
  });
  check('E: dialog has role="dialog", aria-modal="true" and an accessible name', a11y.role && a11y.modal === 'true' && /Nguồn tư liệu · Câu 1/.test(a11y.label ?? ''), JSON.stringify(a11y));
  check('E: background is inert while the dialog is open (background button cannot take focus)', a11y.rootInert && a11y.dialogOutsideRoot && !a11y.stolen);
  let escaped = 0;
  for (let i = 0; i < 25; i++) {
    await phone.page.keyboard.press(i % 5 === 4 ? 'Shift+Tab' : 'Tab');
    if (!(await phone.page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))) escaped++;
  }
  check('E: 25 Tab/Shift+Tab presses never move focus outside the dialog', escaped === 0, `${escaped} escapes`);
  const scroll = await phone.page.evaluate(() => {
    const m = document.querySelector('.modal');
    const before = { sh: m.scrollHeight, ch: m.clientHeight };
    m.scrollTop = m.scrollHeight;
    const btn = document.querySelector('[data-testid="attribution-close"]').getBoundingClientRect();
    const ok = btn.bottom <= window.innerHeight && btn.top >= 0;
    m.scrollTop = 0;
    return { ...before, bottomButtonReachable: ok };
  });
  check('E: long credits scroll inside the dialog on a 360 px phone; the bottom close button is reachable', scroll.sh > scroll.ch && scroll.bottomButtonReachable, JSON.stringify(scroll));
  await phone.page.getByTestId('attribution-close-top').focus();
  await phone.page.keyboard.press('Enter');
  await phone.page.getByTestId('attribution-panel').waitFor({ state: 'detached' });
  const afterClose = await phone.page.evaluate(() => document.getElementById('root')?.inert === false);
  check('E: the top close button works from the keyboard and removes inert from the app', afterClose);
  await phone.page.getByTestId('attribution-open').click();
  await phone.page.getByTestId('attribution-panel').waitFor();
  // E. Keyboard: focus starts in the dialog, Tab reaches links, Escape returns to the results.
  const kb = phone.page;
  const focused = await kb.evaluate(() => (document.activeElement?.matches('.modal') && document.querySelector('.modal').scrollTop === 0 ? 'dialog-top' : document.activeElement?.className));
  await kb.keyboard.press('Tab');
  const tabbed = await kb.evaluate(() => (document.activeElement?.closest('.modal') ? document.activeElement.tagName : 'outside'));
  await kb.keyboard.press('Escape');
  await kb.getByTestId('attribution-panel').waitFor({ state: 'detached' });
  await kb.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'attribution-open', null, { timeout: 2_000 }).catch(() => {});
  const back = await kb.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  check('E: keyboard — dialog opens at the top with focus inside, Tab stays inside, Escape returns focus to the opener', focused === 'dialog-top' && tabbed !== 'outside' && back === 'attribution-open', `${focused} → ${tabbed} → ${back}`);
  check('D: closing the credits returns to the results (table and leaderboard visible)', await kb.getByTestId('my-result').isVisible());
  // C. Role isolation: the projector never receives PINs or per-team submission data before the reveal;
  //    teams of this room never receive another room's credits.
  const screenEarly = projector.page.__frames.filter((f) => f.t < deadline - 300 && /"pin"|"submitted":true|"answer":"/.test(f.text));
  check('C: projector frames during the round carry no PINs, submission flags or answers', screenEarly.length === 0);
  const otherCredits = roomsT.filter((r) => r.q !== 1).flatMap((r) => r.q === 6 ? ['LeRoy Woodson'] : r.q === 5 ? ['Dalbéra'] : r.q === 4 ? ['Bahnfrend'] : ['Adam Jones']);
  const crossRoom = [phone, projector, admin].filter((c) => c.page.__frames.some((f) => otherCredits.some((n) => f.text.includes(n))));
  check("C: Q1 room clients never receive other rooms' credits", otherCredits.length === 0 || crossRoom.length === 0, crossRoom.map((c) => c.who).join(','));
  const q6 = roomsT.find((r) => r.q === 6);
  if (q6) {
    const p6 = q6.teams[0].page;
    await p6.getByTestId('attribution-open').click();
    const t6 = await p6.getByTestId('attribution-panel').innerText();
    const n6 = await p6.getByTestId('attribution-item').count();
    const w6 = await p6.evaluate(() => document.querySelector('.modal').scrollWidth - document.querySelector('.modal').clientWidth);
    check('B/E: Q6 room shows its own credits (long titles wrap on a 360 px phone)', n6 === EXPECT[6].count && EXPECT[6].has.every((h) => t6.includes(h)) && EXPECT[6].not.every((n) => !t6.includes(n)) && w6 <= 1, `${n6} entries, overflow ${w6}`);
    await p6.waitForFunction(() => [...document.querySelectorAll('.modal, .modal-backdrop')].every((e) => e.getAnimations().every((an) => an.playState === 'finished')));
    const top6 = await p6.evaluate(() => {
      const r = document.querySelector('.modal').getBoundingClientRect();
      return !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.modal');
    });
    check('E: Q6 phone dialog is on top of the results (hit-test)', top6);
    if (OUT) await p6.screenshot({ path: join(OUT, 'attribution-q6-phone360.png') });
    await p6.getByTestId('attribution-close').click();
  }
  // D. Lifecycle: refresh, reconnect, restart, advance.
  await phone.page.reload();
  await phone.page.getByTestId('attribution-open').waitFor();
  await phone.page.getByTestId('attribution-open').click();
  check('D: after refresh during the reveal the credits are available', (await phone.page.getByTestId('attribution-item').count()) === 3);
  await phone.page.getByTestId('attribution-close').click();
  await phone.context.setOffline(true);
  await sleep(1_500);
  await phone.context.setOffline(false);
  await phone.page.getByText('Đã kết nối').first().waitFor({ timeout: 15_000 }).catch(() => {});
  await phone.page.getByTestId('attribution-open').click();
  check('D: after reconnect during the reveal the credits are available', (await phone.page.getByTestId('attribution-item').count()) === 3);
  await phone.page.getByTestId('attribution-close').click();
  // Restart: stop the server, start a new one on the same database, reload the clients.
  await srv.stop();
  const srv2 = await startServer({ port: PORT, password: PW, dbPath: srv.dbPath });
  await Promise.all([phone.page.reload(), projector.page.reload(), admin.page.reload()]);
  for (const c of [phone, projector, admin]) {
    await c.page.getByTestId('attribution-open').waitFor({ timeout: 15_000 });
  }
  await projector.page.getByTestId('attribution-open').click();
  check('D: after a server restart the credits of the closed round are restored (projector)', (await projector.page.getByTestId('attribution-item').count()) === 3);
  // Leave the panel OPEN on the projector, then advance: it must disappear with the reveal.
  await admin.page.getByTestId('advance').click();
  await admin.page.getByTestId('start-round').waitFor();
  await projector.page.getByTestId('attribution-panel').waitFor({ state: 'detached', timeout: 10_000 });
  check('D: advancing to the next question closes the open credits on the projector', (await projector.page.getByTestId('attribution-open').count()) === 0);
  await startRound(admin.page);
  await phone.page.getByTestId('answer-input').waitFor();
  const q2Start = roundStart(srv.dbPath, q1Room.code).started_at;
  await sleep(6_000);
  const leakNext = [phone, projector, admin].filter((c) => c.page.__frames.some((f) => f.t >= q2Start + 200 && CREDITS.test(f.text)));
  check('D: the next active round (Q2) carries no credits in any role', leakNext.length === 0 && (await phone.page.getByTestId('attribution-open').count()) === 0, leakNext.map((c) => c.who).join(','));
  await srv2.stop();
}

const unexpected = errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::ERR|WebSocket connection|socket\.io/i.test(e));
check('no unexpected console errors or external requests', unexpected.length === 0, unexpected.slice(0, 4).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
