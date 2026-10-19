// Image-scene browser E2E (M3.2-B). Production timelines no longer use native `image` scenes, so this
// test keeps that supported scene kind covered with a CONTROLLED FIXTURE: the real server
// (startApp), the real built client (dist/) and the real authenticated media endpoint, but fixture
// questions and a temporary media root. Production content and canonical answers are not touched.
// Run `npm run build` first; run with tsx:  node --import tsx e2e/image-scenes.mjs
//
// Checks: unreleased image refused (player and admin, 403); no token (401); a team of another room
// (403); an image of another question (403); released images load as authenticated blobs and render
// at their real size; no client fetches an image before its release; no state frame reveals a
// future asset id; refresh restores the current image only.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { chromium } from 'playwright-core';
import { startApp } from '../server/app.ts';
import { MediaRegistry } from '../server/media/registry.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const PASSWORD = 'e2e-images-password';
const ROUND_MS = 24_000;
const EARLY = 'fx-img-early'; // released at 0 s
const LATE = 'fx-img-late'; // released at 12 s
const OTHER_Q = 'fx-img-otherq'; // belongs to question 2 only
if (!existsSync(join(ROOT, 'dist/index.html'))) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ fixture server
const dir = mkdtempSync(join(tmpdir(), 'hc-images-'));
const mediaRoot = join(dir, 'media');
mkdirSync(join(mediaRoot, 'clues'), { recursive: true });
// Two local, already-committed images used purely as test bytes (1662×1080 and 1920×1080 WebP).
copyFileSync(join(ROOT, 'server/media/clues/q02-01.webp'), join(mediaRoot, 'clues/early.webp'));
copyFileSync(join(ROOT, 'server/media/clues/q06-03.webp'), join(mediaRoot, 'clues/late.webp'));
copyFileSync(join(ROOT, 'server/media/clues/q06-01.webp'), join(mediaRoot, 'clues/other.webp'));
const media = new MediaRegistry(
  [
    { id: EARLY, kind: 'image', file: 'clues/early.webp', mime: 'image/webp' },
    { id: LATE, kind: 'image', file: 'clues/late.webp', mime: 'image/webp' },
    { id: OTHER_Q, kind: 'image', file: 'clues/other.webp', mime: 'image/webp' },
  ],
  mediaRoot,
);
const questions = [
  {
    id: 'fx1',
    answer: 'KIỂM THỬ',
    scenes: [
      { id: 'i1', kind: 'image', at: 0, transition: 'fade', media: { assetId: EARLY }, caption: 'Ảnh thử nghiệm 1', credit: 'Fixture' },
      { id: 'i2', kind: 'text-card', at: 6_000, heading: 'Fixture', body: 'Cảnh chữ giữa hai ảnh' },
      { id: 'i3', kind: 'image', at: 12_000, transition: 'zoom', media: { assetId: LATE }, caption: 'Ảnh thử nghiệm 2' },
    ],
  },
  { id: 'fx2', answer: 'MẪU HAI', scenes: [{ id: 'o1', kind: 'image', at: 0, media: { assetId: OTHER_Q } }] },
];
const app = await startApp({ dbPath: join(dir, 'game.sqlite'), adminPassword: PASSWORD, roundDurationMs: ROUND_MS, staticDir: join(ROOT, 'dist'), questions, media });
const BASE = app.url;
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

// ------------------------------------------------------------------ clients
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true });
const errors = [];
async function client(who, viewport = { width: 1366, height: 768 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const c = { who, page, context, frames: [] };
  page.on('pageerror', (e) => errors.push(`${who}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${who}: ${m.text()}`));
  page.on('websocket', (ws) => ws.on('framereceived', (f) => c.frames.push({ t: Date.now(), text: String(f.payload) })));
  return c;
}
const admin = await client('admin', { width: 1920, height: 1080 });
await admin.page.goto(`${BASE}/admin`);
await admin.page.getByTestId('admin-password').fill(PASSWORD);
await admin.page.getByRole('button', { name: 'Đăng nhập' }).click();

async function newRoom() {
  await admin.page.getByTestId('create-room').click();
  const code = (await admin.page.getByTestId('room-code').innerText()).trim();
  await admin.page.getByTestId('toggle-pins').click();
  const pins = [];
  for (let i = 1; i <= 2; i++) pins.push(await admin.page.getByTestId(`pin-${i}`).getAttribute('data-pin'));
  await admin.page.getByTestId('toggle-pins').click();
  return { code, pins };
}
async function joinTeam(code, pin, who, viewport) {
  const p = await client(who, viewport);
  await p.page.goto(`${BASE}/?room=${code}`);
  await p.page.getByTestId('join-pin').fill(pin);
  await p.page.getByRole('button', { name: 'Vào phòng' }).click();
  await p.page.getByTestId('ready-button').click();
  return p;
}

// Room B (a different room; its team must never see room A's media).
const roomB = await newRoom();
const outsider = await joinTeam(roomB.code, roomB.pins[0], 'roomB-team1');
await admin.page.getByRole('button', { name: 'Chọn phòng khác' }).click();
// Room A plays fixture question 1.
const roomA = await newRoom();
const p1 = await joinTeam(roomA.code, roomA.pins[0], 'roomA-team1');
const p2 = await joinTeam(roomA.code, roomA.pins[1], 'roomA-team2', { width: 360, height: 740 });
await admin.page.getByTestId('start-round').click();
await admin.page.getByRole('dialog').getByRole('button', { name: 'Bắt đầu' }).click();
await Promise.all([p1, p2].map((p) => p.page.getByTestId('answer-input').waitFor()));
const ro = new Database(join(dir, 'game.sqlite'), { readonly: true });
const round = ro.prepare('SELECT r.id, r.started_at FROM rounds r JOIN rooms m ON m.id = r.room_id WHERE m.code = ?').get(roomA.code);
ro.close();
const at = (ms) => sleep(Math.max(0, round.started_at + ms - Date.now()));
const token = (c, key) => c.page.evaluate((k) => sessionStorage.getItem(k), key);
const status = async (assetId, tok) =>
  (await fetch(`${BASE}/api/rounds/${round.id}/media/${assetId}`, tok ? { headers: { authorization: `Bearer ${tok}` } } : {})).status;

// ---- before the late image is released
await at(3_000);
const tA = await token(p1, 'hc.team.token');
const tAdmin = await token(admin, 'hc.admin.token');
const tB = await token(outsider, 'hc.team.token');
check('released image served to a team of this room (200)', (await status(EARLY, tA)) === 200);
check('unreleased image refused for a player (403)', (await status(LATE, tA)) === 403);
check('unreleased image refused for the admin (403)', (await status(LATE, tAdmin)) === 403);
check('media without a session refused (401)', (await status(EARLY, null)) === 401);
check('team of another room refused even for a released image (403)', (await status(EARLY, tB)) === 403);
check("another question's image refused in this round (403)", (await status(OTHER_Q, tA)) === 403);
const img1 = await p1.page.evaluate(() => {
  const el = document.querySelector('.scene-in .scene-img');
  return el ? { w: el.naturalWidth, h: el.naturalHeight, src: el.getAttribute('src'), caption: document.querySelector('.scene-in .scene-caption')?.innerText ?? '' } : null;
});
check('browser renders the released image from an authenticated blob URL at full size', !!img1 && img1.src.startsWith('blob:') && img1.w === 1662 && img1.h === 1080 && img1.caption.includes('Ảnh thử nghiệm 1'), JSON.stringify(img1));
const phone = await p2.page.evaluate(() => {
  const el = document.querySelector('.scene-in .scene-img');
  const r = el?.getBoundingClientRect();
  return el ? { w: el.naturalWidth, shownW: Math.round(r.width), inView: r.right <= window.innerWidth + 1 } : null;
});
check('image renders on a 360×740 phone inside the viewport', !!phone && phone.w > 0 && phone.inView, JSON.stringify(phone));

// ---- after release
await at(14_000);
check('late image served after its release (200)', (await status(LATE, tA)) === 200);
const img3 = await p1.page.evaluate(() => {
  const el = document.querySelector('.scene-stage');
  const im = document.querySelector('.scene-in .scene-img');
  return { id: el?.getAttribute('data-scene-id'), w: im?.naturalWidth ?? 0, blob: (im?.getAttribute('src') ?? '').startsWith('blob:') };
});
check('browser shows the late image (i3) once released', img3.id === 'i3' && img3.w === 1920 && img3.blob, JSON.stringify(img3));
await p2.page.reload();
await p2.page.locator('.scene-stage[data-scene-id="i3"]').waitFor({ timeout: 8_000 });
const afterReload = await p2.page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/media/')).map((e) => e.name.split('/').pop()));
check('refresh restores only the current image (no replay of earlier media)', afterReload.length === 1 && afterReload[0] === LATE, afterReload.join(','));

// ---- leakage
const fetchedEarly = await p1.page.evaluate(
  ([start, lateId]) => performance.getEntriesByType('resource').filter((e) => e.name.endsWith(lateId) && performance.timeOrigin + e.startTime < start + 12_000 - 50).length,
  [round.started_at, LATE],
);
check('no client fetched the late image before its release', fetchedEarly === 0);
const leaked = [p1, p2, outsider].flatMap((c) => c.frames.filter((f) => f.t < round.started_at + 12_000 - 200 && (f.text.includes(LATE) || f.text.includes(OTHER_Q))).map(() => c.who));
check('no state frame before the release mentioned a future or foreign asset id', leaked.length === 0, [...new Set(leaked)].join(','));
const outsiderFrames = outsider.frames.some((f) => f.text.includes(EARLY) || f.text.includes(LATE));
check("the other room's team never received this round's asset ids", !outsiderFrames);

// ---- round end
await p1.page.getByTestId('my-result').waitFor({ timeout: ROUND_MS + 10_000 });
check('results only after the deadline', Date.now() - round.started_at >= ROUND_MS - 300);

const expected = errors.filter((e) => /Failed to load resource/.test(e));
const unexpected = errors.filter((e) => !expected.includes(e));
check('no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
await browser.close();
await app.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
