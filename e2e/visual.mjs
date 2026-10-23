// Visual / layout regression E2E (M3.3-C). Run `npm run build` first. Local Google Chrome.
//
//   node e2e/visual.mjs
//   OUT=<dir for screenshots and geometry> node e2e/visual.mjs
//
// FIXTURE: short rounds (test-only ROUND_DURATION_MS), as the fullgame `nowinner` scenario. Rounds,
// answers and scores are played through the UI; nothing is seeded. Three rooms on one server:
//   A  default names "Đội 1" … "Đội 5", the M3.3-B plan → 230 · 230 · 120 · 100 · 0 (shared first
//      place, "Đội 3: hạng 3 · 120 điểm")
//   B  40-character custom Vietnamese names (admin rename), a single winner; team 3 behind a local TCP
//      proxy for the "unconfirmed delivery" and "reconnecting" states
//   C  nobody scores (no confetti, neutral title)
// C-1  reveal table: every team-name cell is one line box at 360 and 390 px, long names end in an
//      ellipsis, order · team · answer · result · points visible for all five rows, submission time
//      visible (column on wide screens, secondary line on phones), no horizontal page scroll; on
//      1366 and 1920 px all six columns stay.
// C-2  final title: the score digits and "điểm" share a line box, no single-word last line, font
//      size ≥ 16 px, no horizontal scroll — every team of rooms A and B at 360, 390, 1366, 1920 px.
// C-3  confetti: sampled every animation frame for 6 s on the projector and a phone — no confetti
//      piece is painted above the eyebrow, final title or podium names/scores (hit-testing with
//      pointer events enabled on the pieces for the test only); confetti still visible; hidden with
//      prefers-reduced-motion; absent when nobody scored.
// Prints PASS/FAIL lines.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createProxy } from './lib/netproxy.mjs';
import { adminRoom, joinTeam, sleep, startRound, startServer } from './lib/session.mjs';

const OUT = process.env.OUT ?? null;
if (OUT) mkdirSync(OUT, { recursive: true });
const PW = 'e2e-visual-password';
const PORT = Number(process.env.E2E_VISUAL_PORT ?? 4380);
const ROUND_MS = 15_000;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const ORDER = ['BAO CẤP', 'CÁCH MẠNG THÁNG MƯỜI', 'HỢP TÁC XÃ', 'ĐỔI MỚI', 'WTO', 'PHÁT TRIỂN BỀN VỮNG'];
const WRONG = 'không biết';
const VIEWPORTS = [
  { name: 'phone360', width: 360, height: 740 },
  { name: 'phone390', width: 390, height: 844 },
  { name: 'laptop1366', width: 1366, height: 768 },
  { name: 'projector1920', width: 1920, height: 1080 },
];
const TEAM_VIEWPORTS = [VIEWPORTS[2], VIEWPORTS[1], VIEWPORTS[0], VIEWPORTS[2], VIEWPORTS[1]];
// Realistic long names, each exactly at the 40-character limit (MAX_TEAM_NAME_LENGTH).
const LONG_NAMES = [
  'Chi đoàn Kinh tế Chính trị Mác Lênin K67',
  'Nhóm nghiên cứu Lịch sử Đảng Cộng sản VN',
  'Những người bạn của Hợp tác xã nông thôn',
  'Câu lạc bộ Lý luận Chính trị Sinh viên 3',
  'Tổ 5 — Khoa Luật Kinh tế và Quản trị số!',
];
// Per round: [slot, correct] in submission order (slots not listed do not answer).
const PLAN_A = [
  [[1, true], [2, true], [4, true], [3, false]],
  [[2, true], [1, true], [4, false], [5, false]],
  [[3, true], [2, true], [1, false], [5, false]],
  [[1, true], [4, true], [2, true], [3, false]],
  [[2, true], [1, true], [3, true], [4, false]],
  [[1, true], [3, true], [4, true], [2, true], [5, false]],
];
const PLAN_B = Array.from({ length: 6 }, () => [[2, true], [1, true], [3, true], [4, true], [5, false]]);
const PLAN_C = Array.from({ length: 6 }, () => [[1, false]]);

const srv = await startServer({ port: PORT, password: PW, roundMs: ROUND_MS });
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function page(who, viewport, origin = srv.base) {
  const context = await browser.newContext({ viewport });
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(`${who}: ${e}`));
  p.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith(srv.base) && !u.startsWith('data:') && !u.startsWith('blob:')) errors.push(`${who}: external request ${u}`);
  });
  return { who, page: p, context, viewport };
}
const shot = async (p, name) => OUT && (await p.screenshot({ path: join(OUT, `${name}.png`) }));

async function setupRoom(key, { names = null, teams = 5, proxySlot = 0 } = {}) {
  const admin = await page(`${key}-admin`, { width: 1400, height: 900 });
  const { code, pins } = await adminRoom(admin.page, srv.base, PW, srv.dbPath, 0);
  if (names) {
    for (let i = 1; i <= 5; i++) {
      await admin.page.getByTestId(`rename-${i}`).click();
      await admin.page.getByTestId(`rename-input-${i}`).fill(names[i - 1]);
      await admin.page.getByTestId(`rename-input-${i}`).press('Enter');
      await admin.page.getByTestId(`team-name-${i}`).filter({ hasText: names[i - 1] }).waitFor();
    }
  }
  await admin.page.getByTestId('projector-create').click();
  const projector = await page(`${key}-projector`, VIEWPORTS[3]);
  await projector.page.goto(await admin.page.getByTestId('projector-link').inputValue());
  await projector.page.getByTestId('screen-room-code').waitFor();
  const tm = [];
  let proxy = null;
  for (let i = 1; i <= teams; i++) {
    let origin = srv.base;
    if (i === proxySlot) {
      proxy = await createProxy(srv.port, {});
      origin = `http://127.0.0.1:${proxy.port}`;
    }
    const t = await page(`${key}-team${i}`, TEAM_VIEWPORTS[i - 1], origin);
    await joinTeam(t.page, origin, code, pins[i - 1]);
    tm.push(t);
  }
  return { key, admin, projector, teams: tm, code, proxy };
}

async function submit(t, text) {
  await t.page.getByTestId('answer-input').fill(text);
  await t.page.getByTestId('answer-submit').click();
}

/** Plays one round for a room; `during(room)` runs after all planned answers are confirmed. */
async function playRound(room, n, plan, { during = null, beforeAnswers = null } = {}) {
  await startRound(room.admin.page);
  await Promise.all(room.teams.map((t) => t.page.getByTestId('answer-input').waitFor()));
  if (beforeAnswers) await beforeAnswers(room);
  for (const [slot, correct] of plan) {
    const t = room.teams[slot - 1];
    await submit(t, correct ? ORDER[n - 1].toLowerCase() : WRONG);
    if (!(room.skipAck && room.skipAck(slot, n))) await t.page.getByTestId('submitted-ack').waitFor({ timeout: 10_000 });
  }
  if (during) await during(room);
  await room.projector.page.getByTestId('screen-reveal').waitFor({ timeout: ROUND_MS + 15_000 });
  await Promise.all(room.teams.map((t) => t.page.getByTestId('my-result').waitFor({ timeout: 15_000 })));
}
async function advance(room, n) {
  await room.admin.page.getByTestId('advance').click();
  if (n < 6) await room.admin.page.getByTestId('start-round').waitFor();
}

// ------------------------------------------------------------------ in-page measurements
/** Reveal table geometry (runs in the browser). */
function measureTable() {
  const table = document.querySelector('.reveal-table');
  if (!table) return null;
  const lines = (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
  };
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && r.left >= -0.5 && r.right <= innerWidth + 0.5;
  };
  const headers = [...table.querySelectorAll('thead th')].filter(visible).map((th) => th.textContent.trim());
  const rows = [...table.querySelectorAll('tbody tr')].map((tr) => {
    const td = [...tr.children];
    const name = tr.querySelector('.cell-name');
    const nameText = tr.querySelector('.cell-name-text') ?? name;
    const timeCol = tr.querySelector('.cell-time');
    const timeSub = tr.querySelector('.cell-time-sub');
    return {
      name: name.textContent.trim(),
      nameLines: lines(nameText),
      nameTruncated: nameText.scrollWidth > nameText.clientWidth + 1 && getComputedStyle(nameText).textOverflow === 'ellipsis',
      nameOverflowsUnclipped: nameText.scrollWidth > nameText.clientWidth + 1 && getComputedStyle(nameText).textOverflow !== 'ellipsis',
      order: visible(td[0]),
      nameVisible: visible(name),
      answer: visible(tr.querySelector('.cell-answer')),
      result: visible(td.at(-2)),
      points: visible(td.at(-1)),
      answered: !tr.querySelector('.cell-answer em'),
      time: (visible(timeCol) && timeCol.textContent.trim()) || (visible(timeSub) && timeSub.textContent.trim()) || (!timeCol && visible(td[3]) && td[3].textContent.trim()) || null,
      height: Math.round(tr.getBoundingClientRect().height),
    };
  });
  const tr = table.getBoundingClientRect();
  return {
    headers,
    rows,
    tableLeft: Math.round(tr.left),
    tableRight: Math.round(tr.right),
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth,
    cells: [...table.querySelectorAll('th, td')].map((c) => {
      const r = c.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    }),
  };
}

/** Final title line analysis (runs in the browser). */
function measureTitle(sel) {
  const el = document.querySelector(sel);
  if (!el) return null;
  const words = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const re = /\S+/g;
    for (let m = re.exec(n.data); m; m = re.exec(n.data)) {
      const r = document.createRange();
      r.setStart(n, m.index);
      r.setEnd(n, m.index + m[0].length);
      const rects = [...r.getClientRects()].filter((x) => x.width > 0);
      words.push({ w: m[0], tops: [...new Set(rects.map((x) => Math.round(x.top + x.height / 2)))] });
    }
  }
  const lineOf = (t) => t.tops[t.tops.length - 1];
  const lineKeys = [...new Set(words.flatMap((w) => w.tops))].sort((a, b) => a - b);
  // Merge keys closer than half a line (glyph ascent differences between fonts).
  const fs = parseFloat(getComputedStyle(el).fontSize);
  const merged = [];
  for (const k of lineKeys) if (!merged.length || k - merged[merged.length - 1] > fs * 0.5) merged.push(k);
  const lineIdx = (top) => merged.findIndex((k, i) => top >= k - fs * 0.5 && (i === merged.length - 1 || top < merged[i + 1] - fs * 0.5 + 1));
  const lines = merged.map(() => []);
  for (const w of words) for (const t of w.tops) lines[Math.max(0, lineIdx(t))].push(w.w);
  const diem = words.findLastIndex((w) => w.w === 'điểm');
  const score = diem > 0 ? words[diem - 1] : null;
  const r = el.getBoundingClientRect();
  return {
    text: el.textContent,
    fontSize: fs,
    lines: lines.map((l) => l.join(' ')),
    lastLineWords: lines.at(-1)?.length ?? 0,
    scoreAndUnitTogether: diem < 0 ? null : lineIdx(lineOf(words[diem])) === lineIdx(lineOf(score)) && words[diem].tops.length === 1 && score.tops.length === 1,
    splitWords: words.filter((w) => w.tops.length > 1).map((w) => w.w),
    left: r.left,
    right: r.right,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth,
  };
}

/**
 * Samples every animation frame for `ms`: which confetti pieces intersect the important final-screen
 * text, and whether any of them is painted ABOVE that text (hit-testing; the test enables pointer
 * events on the pieces only for this purpose — rendering is unchanged).
 */
function sampleConfetti(ms) {
  const style = document.createElement('style');
  style.textContent = '.confetti, .confetti span { pointer-events: auto !important; }';
  document.head.appendChild(style);
  const important = () => [...document.querySelectorAll('.final .eyebrow, .final-title, .podium-name, .podium-score')];
  const isPiece = (e) => e.parentElement?.classList.contains('confetti');
  return new Promise((resolve) => {
    const start = performance.now();
    const out = { frames: 0, intersections: 0, onTop: 0, onTopSamples: [], maxVisiblePieces: 0, hasConfetti: !!document.querySelector('.confetti'), confettiDisplay: null };
    const c = document.querySelector('.confetti');
    if (c) out.confettiDisplay = getComputedStyle(c).display;
    const frame = () => {
      out.frames++;
      const pieces = [...document.querySelectorAll('.confetti span')];
      let visible = 0;
      const rects = pieces.map((p) => {
        const r = p.getBoundingClientRect();
        if (r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && parseFloat(getComputedStyle(p).opacity) > 0.05) visible++;
        return r;
      });
      out.maxVisiblePieces = Math.max(out.maxVisiblePieces, visible);
      for (const el of important()) {
        const b = el.getBoundingClientRect();
        rects.forEach((r, i) => {
          const x0 = Math.max(r.left, b.left), x1 = Math.min(r.right, b.right), y0 = Math.max(r.top, b.top), y1 = Math.min(r.bottom, b.bottom);
          if (x1 - x0 < 1 || y1 - y0 < 1) return;
          out.intersections++;
          const stack = document.elementsFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
          const ip = stack.indexOf(pieces[i]);
          const it = stack.findIndex((e) => e === el || el.contains(e));
          if (ip !== -1 && (it === -1 || ip < it)) {
            out.onTop++;
            if (out.onTopSamples.length < 5) out.onTopSamples.push(`${Math.round(performance.now() - start)}ms ${el.className}`);
          }
        });
      }
      if (performance.now() - start < ms) requestAnimationFrame(frame);
      else {
        style.remove();
        resolve(out);
      }
    };
    requestAnimationFrame(frame);
  });
}

/** Contrast of each important text against its text-shadow halo, composited on the page background. */
function haloContrast() {
  const parse = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  // Worst case behind the halo: the brightest confetti colour (#ffffff).
  return [...document.querySelectorAll('.final .eyebrow, .final-title, .final-title .gold, .podium-name, .podium-score')].map((el) => {
    const cs = getComputedStyle(el);
    const fg = parse(cs.color).slice(0, 3);
    const m = cs.textShadow.match(/rgba?\([^)]*\)/);
    if (!m) return { cls: el.className, ratio: null };
    const [r, g, b, a = 1] = parse(m[0]);
    const halo = [r, g, b].map((v) => v * a + 255 * (1 - a)); // halo composited over a white piece
    return { cls: el.className, ratio: Math.round(ratio(fg, halo) * 100) / 100 };
  });
}

async function atViewports(t, fn) {
  const out = {};
  for (const vp of VIEWPORTS) {
    await t.page.setViewportSize({ width: vp.width, height: vp.height });
    await sleep(250);
    out[vp.name] = await fn(vp);
  }
  await t.page.setViewportSize(t.viewport);
  return out;
}

// ------------------------------------------------------------------ run
const geometry = { reveal: {}, final: {} };
const A = await setupRoom('A');
const B = await setupRoom('B', { names: LONG_NAMES, proxySlot: 3 });
const C = await setupRoom('C', { teams: 1 });
check('room B: all five custom names are 40 characters (the allowed maximum)', LONG_NAMES.every((n) => n.length === 40), LONG_NAMES.map((n) => n.length).join(','));

// Audit: lobby / waiting with long names (team phone 360 px, admin, projector).
await shot(B.teams[2].page, 'audit-lobby-phone360-longname');
await shot(B.projector.page, 'audit-lobby-projector-longname');
await B.admin.page.setViewportSize({ width: 360, height: 740 });
await shot(B.admin.page, 'audit-admin-phone360-longname');
await B.admin.page.setViewportSize({ width: 1400, height: 900 });
await shot(B.admin.page, 'audit-admin-1400-longname');

for (let n = 1; n <= 6; n++) {
  const bHooks = {};
  if (n === 1) {
    bHooks.beforeAnswers = async (room) => shot(room.teams[2].page, 'audit-play-phone360-longname');
  }
  if (n === 2) {
    // Unconfirmed delivery: team 3's link stalls (connected, nothing gets through) while it submits.
    B.skipAck = (slot, round) => slot === 3 && round === 2;
    bHooks.beforeAnswers = async (room) => room.proxy.set({ frozen: true });
    bHooks.during = async (room) => {
      const t = room.teams[2].page;
      await t.getByTestId('delivery-uncertain').waitFor({ timeout: 9_000 });
      await shot(t, 'audit-unconfirmed-phone360-longname');
      check('audit: unconfirmed delivery state shown with a 40-character team name at 360 px', true);
      room.proxy.set({ frozen: false });
      await t.getByTestId('submitted-ack').waitFor({ timeout: 10_000 });
    };
  }
  if (n === 3) {
    bHooks.during = async (room) => {
      room.proxy.set({ frozen: true });
      room.proxy.cut();
      await room.teams[2].page.locator('.conn-reconnecting').waitFor({ timeout: 10_000 });
      await shot(room.teams[2].page, 'audit-reconnecting-phone360-longname');
      check('audit: reconnecting state shown with a 40-character team name at 360 px', true);
      room.proxy.set({ frozen: false });
      await room.teams[2].page.locator('.conn-connected').waitFor({ timeout: 15_000 });
    };
  }
  await Promise.all([playRound(A, n, PLAN_A[n - 1]), playRound(B, n, PLAN_B[n - 1], bHooks), playRound(C, n, PLAN_C[n - 1])]);

  if (n === 1) {
    await sleep(1_500); // leaderboard count-up settles
    // ---------------- C-1: reveal table
    for (const room of [A, B]) {
      const label = room === A ? 'A (default names)' : 'B (40-character names)';
      for (const [i, t] of room.teams.entries()) {
        if (t.viewport.width > 400) continue;
        await shot(t.page, `reveal-q1-${room.key}-team${i + 1}-${t.viewport.width}`);
      }
      const probe = room.teams[2];
      const m = await atViewports(probe, () => probe.page.evaluate(measureTable));
      geometry.reveal[room.key] = m;
      for (const [vp, g] of Object.entries(m)) {
        const narrow = vp.startsWith('phone');
        const L = `C-1 ${label} @${vp}`;
        check(`${L}: five rows`, g.rows.length === 5);
        check(`${L}: every team name on one line`, g.rows.every((r) => r.nameLines === 1), g.rows.map((r) => `${r.name.slice(0, 12)}…:${r.nameLines}`).join(' · '));
        check(`${L}: no name overflows without an ellipsis`, g.rows.every((r) => !r.nameOverflowsUnclipped));
        if (room === B && narrow) check(`${L}: 40-character names are truncated with an ellipsis`, g.rows.some((r) => r.nameTruncated));
        check(`${L}: order, team, answer, result and points visible in every row`, g.rows.every((r) => r.order && r.nameVisible && r.answer && r.result && r.points));
        check(`${L}: submission time still shown for every answering team`, g.rows.every((r) => !r.answered || r.time));
        check(`${L}: no horizontal page scroll`, g.scrollWidth <= g.innerWidth, `${g.scrollWidth} ≤ ${g.innerWidth}`);
        if (!narrow) check(`${L}: all six columns on wide screens`, g.headers.length === 6 && g.headers.some((h) => /Thời điểm/i.test(h)), g.headers.join('|'));
      }
      await shot(room.projector.page, `reveal-q1-${room.key}-projector`);
      const pm = await room.projector.page.evaluate(measureTable);
      geometry.reveal[`${room.key}-projector`] = pm;
      check(`C-1 ${label} projector 1920: six columns, names on one line, no scroll`, pm.headers.length === 6 && pm.rows.every((r) => r.nameLines === 1) && pm.scrollWidth <= pm.innerWidth);
    }
    // Audit: credits modal on a 360 px phone with a long name in the header.
    const t3 = B.teams[2].page;
    await t3.getByTestId('attribution-open').click();
    await t3.getByTestId('attribution-panel').waitFor();
    await t3.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished))); // modal fade-in
    await shot(t3, 'audit-credits-phone360-longname');
    await t3.getByTestId('attribution-close').click();
  }
  await Promise.all([advance(A, n), advance(B, n), advance(C, n)]);
}

// ---------------- C-3: confetti, measured from the first frames of the final screen
await Promise.all([A, B, C].map((r) => r.projector.page.getByTestId('screen-final').waitFor()));
const [cA, cB, cPhone, cC] = await Promise.all([
  A.projector.page.evaluate(sampleConfetti, 6_000),
  B.projector.page.evaluate(sampleConfetti, 6_000),
  A.teams[2].page.evaluate(sampleConfetti, 6_000),
  C.projector.page.evaluate(sampleConfetti, 1_000),
  // Mid-celebration screenshots (the pieces are falling across the title at ≈ 1.5 s).
  sleep(1_500).then(() => Promise.all([shot(A.projector.page, 'confetti-A-projector-1.5s'), shot(B.projector.page, 'confetti-B-projector-1.5s'), shot(A.teams[2].page, 'confetti-A-phone360-1.5s')])),
]);
for (const [label, s] of [['projector A (shared first place)', cA], ['projector B (single winner, long name)', cB], ['phone 360 A', cPhone]]) {
  check(`C-3 ${label}: no confetti piece painted above the eyebrow, title or podium names/scores`, s.onTop === 0, `${s.frames} frames, ${s.intersections} overlaps, ${s.onTop} on top ${s.onTopSamples.join('; ')}`);
  check(`C-3 ${label}: confetti still visible (celebration kept)`, s.hasConfetti && s.maxVisiblePieces >= 20, `max ${s.maxVisiblePieces} pieces on screen`);
}
check('C-3 room C (nobody scored): no confetti', !cC.hasConfetti);
const contrast = await A.projector.page.evaluate(haloContrast);
check('C-3 final-screen text keeps ≥ 4.5:1 against its halo over the brightest confetti', contrast.every((c) => c.ratio !== null && c.ratio >= 4.5), contrast.map((c) => `${c.cls}:${c.ratio}`).join(' '));
await A.teams[2].page.emulateMedia({ reducedMotion: 'reduce' });
check('C-3 prefers-reduced-motion: confetti hidden', (await A.teams[2].page.evaluate(() => getComputedStyle(document.querySelector('.confetti')).display)) === 'none');
await A.teams[2].page.emulateMedia({ reducedMotion: 'no-preference' });

await shot(A.projector.page, 'final-A-projector');
await shot(B.projector.page, 'final-B-projector');
await shot(C.projector.page, 'final-C-nowinner-projector');
const cTitle = await C.projector.page.getByTestId('screen-final-title').innerText();
check('no-winner final unchanged: neutral title, empty podium', cTitle.includes('Chưa có đội nào ghi điểm') && (await C.projector.page.getByTestId('podium-empty').count()) === 1, cTitle);
const aTitle = (await A.projector.page.getByTestId('screen-final-title').innerText()).replace(/\s+/g, ' ');
check('shared first place on the projector: "Đồng hạng nhất: Đội 1 & Đội 2"', /Đồng hạng nhất: Đội 1 & Đội 2/.test(aTitle), aTitle);

// ---------------- C-2: final title on every team page, four viewports
const EXPECT_A = { 1: [1, 230], 2: [1, 230], 3: [3, 120], 4: [4, 100], 5: [5, 0] };
for (const room of [A, B]) {
  for (const [i, t] of room.teams.entries()) {
    const slot = i + 1;
    if (t.viewport.width < 400) await shot(t.page, `final-${room.key}-team${slot}-${t.viewport.width}`);
    const m = await atViewports(t, async (vp) => {
      const g = await t.page.evaluate(measureTitle, '.final-title');
      if (room === A && slot === 3 && vp.width < 400) await shot(t.page, `final-A-team3-${vp.name}`);
      return g;
    });
    geometry.final[`${room.key}-team${slot}`] = m;
    for (const [vp, g] of Object.entries(m)) {
      const L = `C-2 ${room.key} team ${slot} @${vp}`;
      if (room === A) check(`${L}: title text`, g.text.replace(/\s+/g, ' ') === `Đội ${slot}: hạng ${EXPECT_A[slot][0]} · ${EXPECT_A[slot][1]} điểm`, g.text);
      check(`${L}: score and "điểm" on the same line`, g.scoreAndUnitTogether === true, g.lines.join(' ⏎ '));
      check(`${L}: no single-word last line`, g.lines.length === 1 || g.lastLineWords >= 2, g.lines.join(' ⏎ '));
      check(`${L}: font size ≥ 16 px, inside the viewport, no horizontal scroll`, g.fontSize >= 16 && g.left >= 0 && g.right <= g.innerWidth + 0.5 && g.scrollWidth <= g.innerWidth, `${g.fontSize}px`);
    }
  }
}
for (const room of [A, B]) {
  const m = await atViewports(room.projector, () => room.projector.page.evaluate(measureTitle, '.final-title'));
  for (const [vp, g] of Object.entries(m)) check(`C-2 projector ${room.key} @${vp}: no single-word last line, ≥ 16 px, no scroll`, (g.lines.length === 1 || g.lastLineWords >= 2) && g.fontSize >= 16 && g.scrollWidth <= g.innerWidth, g.lines.join(' ⏎ '));
}
// Audit: final screens on phones with long names.
await shot(B.teams[2].page, 'audit-final-phone360-longname');

if (OUT) writeFileSync(join(OUT, 'geometry.json'), JSON.stringify(geometry, null, 1));
check('no page errors or external requests', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
await B.proxy?.close();
await srv.stop();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
