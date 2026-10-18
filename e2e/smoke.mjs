// Browser smoke test using the locally installed Google Chrome via playwright-core (no browser download).
// Usage: npm run build && npm run preview   (in another terminal)
//        npm run e2e            # BASE_URL defaults to http://localhost:4173
// Options: SHOTS=dir to save screenshots, CHROME_CHANNEL=msedge|chrome.
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const SHOTS = process.env.SHOTS ?? null;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const norm = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true });

async function newPage(viewport = { width: 1366, height: 768 }, opts = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: opts.reducedMotion ?? 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  page.on('request', (r) => { if (!r.url().startsWith(new URL(BASE).origin) && !r.url().startsWith('data:')) errors.push(`external request: ${r.url()}`); });
  if (opts.seed) {
    // Seed storage before the app boots (once per tab), so the app's own save-on-unload cannot overwrite it.
    await context.addInitScript((seed) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('hidden-connection/game/v1', JSON.stringify(seed));
        sessionStorage.setItem('seeded', '1');
      }
    }, opts.seed);
  }
  // Fully controlled clock: time only moves via runFor (screenshots must not consume game time).
  await page.clock.install({ time: new Date('2026-01-01T09:00:00') });
  await page.goto(BASE);
  await page.clock.pauseAt(new Date('2026-01-01T09:00:01'));
  return { page, context, errors };
}
// animations: 'disabled' jumps CSS animations to their end state (the paused fake clock freezes them otherwise).
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' });
const revealed = (page) => page.locator('.clue.is-revealed').count();
const seconds = (page) => page.locator('.countdown-number').innerText();
const fitsVertically = (page) => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
const fitsHorizontally = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ---------------------------------------------------------------- main flow
{
  const { page, context, errors } = await newPage();
  await shot(page, '01-welcome');
  check('welcome shows title', (await page.locator('.hero-title').innerText()).replace(/\s+/g, ' ').includes('THE HIDDEN CONNECTION'));
  await page.getByRole('button', { name: 'Bắt đầu' }).click();

  const longName = 'Đội Sao Đỏ Rực Rỡ Của Lớp Kinh Tế Chính Trị Mác';
  const inputs = page.locator('.name-fields input');
  await inputs.nth(0).fill(longName);
  check('team name input enforces 40-char limit visibly', (await inputs.nth(0).inputValue()).length === 40);
  await inputs.nth(1).fill('Đội 3');
  check('duplicate team names are flagged', (await page.getByText('Tên này bị trùng').count()) === 2);
  await inputs.nth(1).fill('Ánh Dương');
  await shot(page, '02-setup');
  await page.getByRole('button', { name: 'Vào trò chơi' }).click();

  // Spoiler check on the round intro.
  const introHtml = norm(await page.content());
  check('round intro does not leak the answer', !introHtml.includes('baocap'));
  await shot(page, '03-intro');

  // Double-click Start: the pause guard must swallow the second click.
  await page.getByRole('button', { name: /Bắt đầu câu 1/ }).dblclick();
  check('double-click on Start does not pause', (await page.getByRole('dialog').count()) === 0);
  check('play screen fits 1366×768 without scrolling', await fitsVertically(page));
  check('play screen does not leak the answer', !norm(await page.locator('.stage').innerText()).includes('baocap'));
  check('clue 1 visible at 0s', (await revealed(page)) === 1, `revealed=${await revealed(page)}`);

  for (const [t, expect] of [[9_900, 1], [100, 2], [9_900, 2], [100, 3], [9_900, 3], [100, 4]]) {
    await page.clock.runFor(t);
    const n = await revealed(page);
    check(`clues revealed after +${t}ms = ${expect}`, n === expect, `got ${n}, timer ${await seconds(page)}`);
    if (t === 100) await shot(page, `04-clues-${n}`);
  }
  check('points ladder highlights 10 at 30s', (await page.locator('.ladder-step.is-active .ladder-points').innerText()) === '10');

  // Pause → modal, clock frozen.
  await page.getByRole('button', { name: /TẠM DỪNG/ }).click();
  const dialog = page.getByRole('dialog');
  check('answer dialog opens', await dialog.isVisible());
  check('background is inert while modal open', (await page.locator('.stage').getAttribute('inert')) !== null);
  await page.clock.runFor(20_000);
  check('timer frozen while dialog open', (await seconds(page)) === '30', await seconds(page));
  check('answer input focused', await page.evaluate(() => document.activeElement?.matches('.field-answer input') ?? false));
  await page.keyboard.type('p');
  check('typing "p" in the answer field does not trigger shortcuts', (await page.locator('.field-answer input').inputValue()) === 'p' && (await dialog.count()) === 1);
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  check('Tab focus stays inside the dialog', await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')));
  await page.keyboard.press('Escape');
  check('Escape does not resume the clock', (await dialog.count()) === 1);
  await shot(page, '05-dialog');

  // Wrong answer.
  await dialog.locator('.team-option').nth(0).click();
  await page.locator('.field-answer input').fill('kinh tế thị trường');
  await dialog.getByRole('button', { name: 'Chấm đáp án' }).click();
  check('wrong answer closes dialog', (await page.getByRole('dialog').count()) === 0);
  check('wrong answer feedback shown', await page.locator('.toast-wrong').waitFor({ timeout: 2000 }).then(() => true, () => false));
  check('team marked ineligible', (await page.locator('.mini-row.is-out').count()) === 1);
  check('elapsed not reset after wrong answer', (await seconds(page)) === '30', await seconds(page));
  check('pause guarded right after resume', await page.getByRole('button', { name: /TẠM DỪNG/ }).isDisabled());
  await shot(page, '06-wrong');
  await page.clock.runFor(5_000);
  check('clock resumed after wrong answer', (await seconds(page)) === '25', await seconds(page));

  // Shortcut P opens the dialog; ineligible team is disabled.
  await page.keyboard.press('p');
  check('P shortcut pauses', await page.getByRole('dialog').isVisible());
  check('ineligible team cannot be selected', await page.locator('.team-option input').nth(0).isDisabled());

  // Correct answer.
  await page.locator('.team-option').nth(1).click();
  await page.locator('.field-answer input').fill('bao cap');
  await page.getByRole('button', { name: 'Chấm đáp án' }).click();
  await page.clock.runFor(1_500);
  check('result screen reveals answer', norm(await page.locator('.slots').innerText()) === 'baocap');
  check('result shows +10', (await page.locator('.result-points').innerText()) === '+10');
  await shot(page, '07-result');

  await page.getByRole('button', { name: 'Xem bảng xếp hạng' }).click();
  await page.clock.runFor(2_000);
  check('leaderboard leader is Ánh Dương with 10', (await page.locator('.lb-row.is-first .lb-name').innerText()) === 'Ánh Dương');
  await shot(page, '08-leaderboard');

  await page.getByRole('button', { name: 'Câu tiếp theo' }).click();
  check('confirm before changing question', await page.getByRole('dialog').isVisible());
  await page.getByRole('button', { name: 'Chuyển sang câu 2' }).click();
  check('question 2 intro', (await page.locator('.intro-current').innerText()) === '2');

  // Undo returns to the paused dialog of question 1.
  await page.getByRole('button', { name: 'Hoàn tác' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hoàn tác' }).click();
  check('undo returns to paused Q1 dialog', (await page.getByRole('dialog').count()) === 1 && (await page.locator('.round-label strong').innerText()) === '1');
  check('undo removed points', (await page.locator('.mini-score').allInnerTexts()).every((s) => s === '0'));

  // Resume, run, refresh → restored paused with no extra time.
  await page.getByRole('button', { name: 'Tiếp tục tính giờ' }).click();
  await page.clock.runFor(3_000);
  const before = await seconds(page);
  await page.reload();
  await page.clock.runFor(10_000);
  check('after refresh: restored paused dialog', await page.locator('.notice').isVisible());
  check('after refresh: no extra time consumed', (await seconds(page)) === before, `${before} → ${await seconds(page)}`);
  await shot(page, '09-restored');

  check('no console errors / external requests', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------------------------------------------------------------- all teams wrong, timeout, urgency
{
  const { page, context, errors } = await newPage({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await page.getByRole('button', { name: 'Vào trò chơi' }).click();
  await page.getByRole('button', { name: /Bắt đầu câu 1/ }).click();
  check('play screen fits 1920×1080', await fitsVertically(page));
  for (let i = 0; i < 5; i++) {
    await page.clock.runFor(1_000);
    await page.getByRole('button', { name: /TẠM DỪNG/ }).click();
    await page.locator('.team-option:not(.is-disabled)').first().click();
    await page.locator('.field-answer input').fill('sai');
    await page.getByRole('button', { name: 'Chấm đáp án' }).click();
  }
  await page.clock.runFor(1_000);
  check('pause disabled when all teams are out', await page.getByRole('button', { name: /TẠM DỪNG/ }).isDisabled());
  check('explanation shown when all teams are out', await page.locator('.side-note').isVisible());
  await page.clock.runFor(46_000);
  check('urgency styling under 10s', (await page.locator('.countdown.is-urgent').count()) === 1, await seconds(page));
  await shot(page, '10-urgent-1080p');
  await page.clock.runFor(10_000);
  check('timeout ends question with no points', (await page.locator('.result-team').innerText()) === 'Hết giờ');
  check('no console errors (1080p run)', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------------------------------------------------------------- layout matrix + final podium (seeded state)
const longTeams = [
  'Đội Sao Đỏ Rực Rỡ Của Lớp Kinh Tế Chính',
  'Những Người Bạn Đồng Hành Thế Kỷ Hai Mốt',
  'Ánh Dương',
  'Hợp Tác Xã Nông Nghiệp Kiểu Mới Số Một',
  'Đội 5',
].map((name, i) => ({ id: `team-${i + 1}`, name }));
const correct = (teamId, points) => ({ outcome: 'correct', teamId, points, cluesRevealed: (50 - points) / 10, elapsedMs: 1000, submittedAnswer: 'x' });
const finalState = {
  version: 1,
  state: {
    phase: 'final', teams: longTeams, questionIndex: 5, history: [], lastEvent: null,
    results: [correct('team-2', 40), correct('team-1', 30), correct('team-2', 20), correct('team-4', 40), { outcome: 'timeout', elapsedMs: 60000 }, correct('team-3', 10)],
  },
};
const runningSeed = {
  version: 1,
  state: {
    phase: 'paused_for_answer', teams: longTeams, questionIndex: 1, history: [], lastEvent: null, restored: true,
    round: { accumulatedMs: 31_000, ineligible: ['team-2'] },
    results: [correct('team-2', 40), null, null, null, null, null],
  },
};
for (const vp of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1366, height: 650 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  const tag = `${vp.width}x${vp.height}`;
  for (const [label, seed] of [['play', runningSeed], ['final', finalState]]) {
    const { page, context, errors } = await newPage(vp, { seed });
    if (label === 'play') {
      await shot(page, `20-dialog-${tag}`);
      await page.getByRole('button', { name: 'Tiếp tục tính giờ' }).click();
      await page.clock.runFor(1_000);
    } else {
      await page.clock.runFor(3_000);
    }
    const narrow = vp.width < 900;
    if (!narrow) check(`${label} fits vertically at ${tag}`, await fitsVertically(page));
    check(`${label} has no horizontal overflow at ${tag}`, await fitsHorizontally(page));
    if (label === 'play') {
      const slotsOk = await page.evaluate(() => {
        const box = document.querySelector('.slots')?.getBoundingClientRect();
        return [...document.querySelectorAll('.slot')].every((s) => {
          const r = s.getBoundingClientRect();
          return box && r.right <= box.right + 1 && r.left >= box.left - 1 && r.width >= 16;
        });
      });
      check(`18 letter slots fit on screen at ${tag}`, slotsOk);
      const pauseVisible = await page.getByRole('button', { name: /TẠM DỪNG/ }).isVisible();
      check(`pause button visible at ${tag}`, pauseVisible);
    } else {
      check(`final shows tied/sole champion at ${tag}`, (await page.locator('.final-title').innerText()).includes('Những Người Bạn'));
    }
    await shot(page, `21-${label}-${tag}`);
    check(`no console errors (${label} ${tag})`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
}

// ---------------------------------------------------------------- clue images: all six questions
{
  const teams = Array.from({ length: 5 }, (_, i) => ({ id: `team-${i + 1}`, name: `Đội ${i + 1}` }));
  for (let q = 0; q < 6; q++) {
    const seed = { version: 1, state: { phase: 'ready', teams, questionIndex: q, history: [], lastEvent: null, results: [null, null, null, null, null, null] } };
    for (const vp of q === 0 ? [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }] : [{ width: 1366, height: 768 }]) {
      const tag = `${vp.width}x${vp.height}`;
      const { page, context, errors } = await newPage(vp, { seed });
      await page.getByRole('button', { name: new RegExp(`Bắt đầu câu ${q + 1}`) }).click();
      const counts = [];
      for (const step of [0, 10_000, 10_000, 10_000]) {
        if (step) await page.clock.runFor(step);
        counts.push(await page.locator('.clue-img').count());
      }
      check(`Q${q + 1} images appear one per 10s (${tag})`, counts.join(',') === '1,2,3,4', counts.join(','));
      const imgs = page.locator('.clue-img');
      await page.waitForFunction(() => [...document.querySelectorAll('.clue-img')].every((i) => i.complete), null, { timeout: 5000 }).catch(() => {});
      const loaded = await imgs.evaluateAll((els) => els.map((i) => ({ src: i.getAttribute('src'), w: i.naturalWidth })));
      check(`Q${q + 1} all four images decoded (${tag})`, loaded.length === 4 && loaded.every((l) => l.w > 0), JSON.stringify(loaded));
      check(`Q${q + 1} no placeholder panels (${tag})`, (await page.locator('.clue-placeholder').count()) === 0);
      check(`Q${q + 1} image paths are local (${tag})`, loaded.every((l) => /^clues\/q0\d-0\d\.webp$/.test(l.src ?? '')));
      check(`Q${q + 1} fits without scrolling (${tag})`, await fitsVertically(page));
      await page.getByRole('button', { name: /TẠM DỪNG/ }).click();
      const frozen = await seconds(page);
      await page.clock.runFor(15_000);
      check(`Q${q + 1} timer frozen in dialog (${tag})`, (await seconds(page)) === frozen && frozen === '30', `${frozen} → ${await seconds(page)}`);
      await page.locator('.team-option').nth(0).click();
      await page.locator('.field-answer input').fill(['bao cap', 'cach mang thang muoi', 'hop tac xa', 'doi moi', 'wto', 'phat trien ben vung'][q]);
      await page.getByRole('button', { name: 'Chấm đáp án' }).click();
      await page.clock.runFor(1_500);
      check(`Q${q + 1} correct answer at 4 clues scores +10 (${tag})`, (await page.locator('.result-points').innerText()) === '+10');
      await page.getByRole('button', { name: 'Xem bảng xếp hạng' }).click();
      await page.getByRole('button', { name: 'Xem lại đáp án' }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('.clue-img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 5000 }).then(() => {}, () => {});
      await shot(page, `30-q${q + 1}-result-${tag}`);
      check(`no console errors / external requests (Q${q + 1} ${tag})`, errors.length === 0, errors.join(' | '));
      await context.close();
    }
  }
  // Play screen at 30s for the visual review of each question (no answer shown).
  for (let q = 0; q < 6; q++) {
    const seed = { version: 1, state: { phase: 'ready', teams, questionIndex: q, history: [], lastEvent: null, results: [null, null, null, null, null, null] } };
    const { page, context } = await newPage({ width: 1920, height: 1080 }, { seed });
    await page.getByRole('button', { name: new RegExp(`Bắt đầu câu ${q + 1}`) }).click();
    await page.clock.runFor(30_000);
    await page.waitForFunction(() => [...document.querySelectorAll('.clue-img')].every((i) => i.complete), null, { timeout: 5000 }).catch(() => {});
    await shot(page, `31-q${q + 1}-play-30s-1080p`);
    await context.close();
  }
}

// ---------------------------------------------------------------- image credits on the final screen
{
  const { page, context, errors } = await newPage({ width: 1366, height: 768 }, { seed: finalState });
  await page.getByRole('button', { name: 'Nguồn hình ảnh' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nguồn hình ảnh' });
  check('credits dialog opens from the final screen', await dialog.isVisible());
  check('credits list 24 entries with sources', (await dialog.locator('.credits-items li').count()) === 24 && (await dialog.getByText('Chưa có nguồn').count()) === 0);
  await shot(page, '32-credits');
  await dialog.getByRole('button', { name: 'Đóng' }).click();
  check('credits dialog closes', (await page.getByRole('dialog').count()) === 0);
  check('no console errors (credits)', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------------------------------------------------------------- reduced motion
{
  const { page, context } = await newPage({ width: 1366, height: 768 }, { reducedMotion: 'reduce', seed: finalState });
  check('reduced motion: confetti hidden', !(await page.locator('.confetti').isVisible().catch(() => false)));
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
