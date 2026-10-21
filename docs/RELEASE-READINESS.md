> M4.2 supersedes the timing below: production defaults to 40 seconds. Earlier verification results are historical; Step 3B.2 full regression and human playtests are still required. Update explicit `ROUND_DURATION_MS=60000` overrides to `40000` between games. Never resume an old active 60-second room against the new authored content.

# Release readiness — THE HIDDEN CONNECTION (M3.3-C release candidate)

> Prepared on branch `feat/m3-release-candidate` (from `0de630d`), 2026-10-20. **Nothing was deployed.**
> This is a checklist and a register, not an approval. Public HTTPS hosting is M4 and is **not** part
> of this release candidate. Status words: **AUTOMATED VERIFIED** (a test in this repo proves it),
> **MANUAL VERIFIED** (checked by reading code/config or screenshots, no participants),
> **NOT TESTED**.

## 0. Verdict

| Use | Ready? | Conditions |
|---|---|---|
| Classroom, level B (Mac server on a local network you control, own router/hotspot) | **Ready after the level-B device rehearsal** | strong `ADMIN_PASSWORD`; §1 checklist; [CLASSROOM_DRY_RUN.md](CLASSROOM_DRY_RUN.md) run on real phones (NOT RUN); lecturer content sign-off (§5) |
| Public internet / public repository | **NOT READY — blocked** | HTTPS + reverse proxy (M4, §2); rights blockers §4.1; legacy images in git (§4.2); deps upgrade (§3.3) |

## 1. Deployment configuration (current build)

Source of truth: `server/config.ts:18-31`, `server/index.ts`, `.env.example`, README "Configuration".
There is **no `.env` loader**: variables must be exported in the shell (or by the process manager).

| Variable | Required? | Default | Release requirement | Status |
|---|---|---|---|---|
| `ADMIN_PASSWORD` | **yes** (for a real session) | random 9-byte value, **printed to stdout** (loopback only) | set explicitly; ≥ 16 random characters (e.g. `openssl rand -base64 18`). **M4.1:** enforced — with a non-loopback `HOST` or `TRUST_PROXY` set, the server refuses to start without a ≥ 16-character, non-sample password | AUTOMATED VERIFIED (`server/deploy.test.ts`) |
| `HOST` | yes for LAN | `127.0.0.1` | `0.0.0.0` on the classroom LAN; behind a reverse proxy (M4) keep `127.0.0.1` | MANUAL VERIFIED |
| `PORT` | no | `3001` | — (not validated: a non-number fails at listen) | MANUAL VERIFIED |
| `DB_PATH` | no | `data/hidden-connection.sqlite` | on a persistent disk, **outside** any served folder; back up (§1.2) | MANUAL VERIFIED |
| `STATIC_DIR` | no | `dist` | must point at the **built** `dist/` only; never at the repo root or a parent of `data/` | MANUAL VERIFIED |
| `ROUND_DURATION_MS` | no | `40000` | **must stay 40000** in class (shorter values are test fixtures; the server then prints a "TEST round length" warning) | M4.2 default implemented; 40 s fullgame regression pending Step 3B.2 |
| `SCREEN_SESSION_TTL_MS`, `SCREEN_PAIRING_TTL_MS` | no | 6 h, 5 min | **Fixed in M4.1**: validated (bounds; invalid ⇒ refuse to start) and passed to `startApp` ([M4.1-DEPLOYMENT-PLAN §2A](M4.1-DEPLOYMENT-PLAN.md)) | AUTOMATED VERIFIED (`server/deploy.test.ts`) |
| `TRUST_PROXY` (M4.1) | behind a proxy | off | `loopback` behind Caddy/cloudflared on the same machine; `true`/`*`/hop counts refused | AUTOMATED VERIFIED (`server/deploy.test.ts`, `e2e/deploy-smoke.mjs`) |

### 1.1 Secrets, sessions, projector tokens

| Item | Current behaviour | Status | Release action |
|---|---|---|---|
| Admin password check | SHA-256 + `timingSafeEqual` (`server/auth.ts:20-25`); kept in memory only | MANUAL VERIFIED | — |
| Login brute force | 10 attempts / 5 min per `req.ip` (`server/app.ts`) | AUTOMATED VERIFIED (unit tests; per real client IP behind a proxy since M4.1) | behind a proxy set `TRUST_PROXY=loopback` (M4.1) |
| Session tokens | 32 random bytes; only SHA-256 stored (`server/app.ts:106-110`); client keeps them in `sessionStorage` (no cookies → no cookie flags / CSRF surface) | MANUAL VERIFIED | — |
| Admin/team session lifetime | **no expiry, no logout** (`expires_at = NULL`); only projector sessions can be revoked | MANUAL VERIFIED | acceptable for a one-lesson LAN game: **create a fresh room per class** and stop the server afterwards; M4: add expiry/logout |
| Team PINs | 6 digits (`randomInt`), unique per room; 10 joins / 5 min per IP + 50 / 5 min per room code | AUTOMATED VERIFIED (server tests) | do not project the admin screen while PINs are shown (UI hides them by default) |
| PINs in state frames | only in the admin view (`server/views.ts`); team/projector views are built field by field | AUTOMATED VERIFIED (`server/leak.test.ts`, fullgame frame audits) | — |
| Projector pairing | 32-byte single-use secret in the URL **fragment**, 5 min, hash stored; projector session 6 h, revocable, re-checked on each broadcast | AUTOMATED VERIFIED (`server/projector.test.ts`, `e2e/projector.mjs`) | revoke ("Thu hồi quyền máy chiếu") after class |
| Generated password in logs | `server/index.ts:25` prints it when `ADMIN_PASSWORD` is unset | MANUAL VERIFIED | always set `ADMIN_PASSWORD`; do not keep terminal logs of runs without it |
| Other logging | URL, DB path, round duration; asset id on media errors; `console.error(err)` for unexpected handler errors. **No PIN, token, password or answer is logged**; no request/IP log | MANUAL VERIFIED (all `console.*` in `server/` read) | — |

### 1.2 Database, persistence, backup, recovery

| Item | Status | Procedure |
|---|---|---|
| SQLite in WAL mode, `synchronous=NORMAL`, idempotent migrations (`user_version` 2) | MANUAL VERIFIED | — |
| Persistence across restarts (graceful and SIGKILL, mid-round deadline kept, no double award) | **AUTOMATED VERIFIED** — `npm run e2e:restart`, `fullgame` SCENARIO=restart (SIGKILL after Q3 and during Q4) | — |
| Backup | MANUAL (procedure only) | after class: stop the server, copy `*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`; or online `sqlite3 <db> ".backup 'backups/game-YYYY-MM-DD.sqlite'"` ([CLASSROOM_DRY_RUN.md §5](CLASSROOM_DRY_RUN.md)). Backups contain PINs and answers: keep them off git, off shared drives; delete when grades are recorded |
| Git hygiene | MANUAL VERIFIED | `.gitignore` covers `data/`, `backups/`, `logs/` (added in M4.1), `*.sqlite*`, `*.db*`, `.env*`, `*.log`, `*.pem`, `*.key`, `media-src/`, `media-build/`. Online backup: `npm run backup` (M4.1) |
| Server crash | AUTOMATED VERIFIED (state recovery) / NOT TESTED (supervision) | there is no `uncaughtException` handler and no process supervisor. In class: run in a terminal you watch; if the process dies, run the **same command with the same `DB_PATH`** — rounds, receipts and deadlines resume (`engine.recover()`); devices reconnect by themselves. M4: systemd/launchd/pm2 with restart-on-failure |
| Recovery drill | NOT TESTED by a human | practise once during the level-B rehearsal: Ctrl+C mid-round → restart → check the countdown continues and no score changes |

### 1.3 Exposure of files and client bundle

| Item | Status |
|---|---|
| Only `STATIC_DIR` (`dist/`: `index.html` + 2 hashed assets) is served; SPA fallback excludes `/api` and `/socket.io` | MANUAL VERIFIED (`server/app.ts:254-258`, `ls dist`) |
| `media/`, `media-src/`, `docs/`, `server/content` (answers, credits), `data/` not reachable over HTTP | MANUAL VERIFIED (code) — **not** probed against a running server in M3.3-C |
| Clips only via `/api/rounds/:roundId/media/:assetId`: session required, own room, released scene only, uniform 403, path containment (`server/media/registry.ts`) | AUTOMATED VERIFIED (scenes/projector/fullgame E2E: B 200 / A 403 across rooms; no fetch before release) |
| Client bundle: no canonical answer (6 answers in NFC/NFD/accentless/escaped forms), no source-registry string (80), no media file | AUTOMATED VERIFIED (`scripts/check-bundle.mjs`, every `npm run build`) |
| No credits/answers in any state frame before the deadline | AUTOMATED VERIFIED (fullgame, presentation) |

## 2. HTTPS and reverse proxy (requirements for M4 — M4.1 status: items 1–4 and 6 (TTL) prepared and tested locally with Caddy, see [M4.1-DEPLOYMENT-PLAN.md](M4.1-DEPLOYMENT-PLAN.md); not deployed)

The current build is **plain HTTP**: password, PINs, tokens and answers cross the network unencrypted.
Allowed only on a network you control. Do **not** expose it to the internet.

For M4 (public HTTPS), the following are required — none is implemented or tested yet (**NOT TESTED**):

1. TLS terminated by a reverse proxy (Caddy/nginx) with HSTS; server bound to `127.0.0.1`.
2. WebSocket proxying for `/socket.io/` (`Upgrade`/`Connection` headers, read timeout ≥ 120 s) and
   plain proxying for `/api/` (media responses use `Range`; do not buffer or cache them).
3. `app.set('trust proxy', 1)` (or the exact hop count) — **without it every client shares the
   proxy's IP and one student can exhaust the login/join limits for the whole class.**
4. Security headers at the proxy: `Content-Security-Policy` (self only; the app makes no external
   requests — verified by E2E), `X-Frame-Options: DENY`/`frame-ancestors 'none'`, `Referrer-Policy:
   no-referrer` (the projector link carries its secret in the fragment, which is never sent, but keep
   it strict), `X-Content-Type-Options: nosniff`.
5. Optional Socket.IO origin check (low risk today: auth is a handshake token, not a cookie).
6. Session expiry/logout (§1.1) and the TTL wiring defect (§1) fixed.

## 3. Dependency audit (2026-10-20, `npm audit`)

### 3.1 Production dependencies

`npm audit --omit=dev`: **0 vulnerabilities** (express, socket.io, better-sqlite3, react, tsx). AUTOMATED VERIFIED.

### 3.2 Development toolchain (not shipped, not running in class)

6 findings: **2 critical, 1 high, 3 moderate** — unchanged from M2.3 (`docs/network-resilience.md`):

| Package | Severity | Advisory | Reachable in class? |
|---|---|---|---|
| vitest (direct) | critical | GHSA-5xrq-8626-4rwp (UI server file read/exec), GHSA-82fw-gwwq-j7x9 | no — Vitest UI never started |
| tinypool (via vitest) | critical | GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr (prototype-pollution gadgets) | no — needs attacker-controlled worker options |
| vite (direct) | high | GHSA-4w7w-66w2-5vf9, GHSA-fx2h-pf6j-xcff, GHSA-v6wh-96g9-6wx3 | no — dev server only; class serves `dist/` with Express |
| esbuild, @vitest/mocker, vite-node | moderate | GHSA-67mh-4wv8-2f99 etc. | no — only while `npm run dev` runs |

### 3.3 Actions

- Never run `npm run dev` on an untrusted network.
- **Before M4:** upgrade vite (→ current major) and vitest (→ current major) on a branch, run the full
  suite. Patch available in range: socket.io/socket.io-client 4.8.1 → 4.8.x.
- Runtime note: better-sqlite3 11.x crashes vitest workers under Debian's system Node 24 (libnode);
  the suite passes on official Node 23.10 binaries (used for this RC). Pin the Node version used in
  class (README says Node 22+; recommended: the official Node 22 LTS or 23.10 binary).

## 4. Content rights — public-deployment blockers

Full per-asset register: [M3.3-C-REVIEW.md §7](M3.3-C-REVIEW.md#7-copyright-and-content-audit).
Attribution is **not** permission. No external rights request was made (none authorised).

### 4.1 Assets in the six montages that block **public** deployment until resolved

| Asset | Used in | Decision | What is missing |
|---|---|---|---|
| q2-feb-crowd (1917 book plate, photographer unknown) | Q2 a1, a3, a10 | REQUIRES EVIDENCE | basis outside the US (anonymous-work term / publication date) |
| q2-winter-palace-after (Steinberg) | Q2 a7, a10 | REQUIRES EVIDENCE | death year and first publication |
| q2-july-nevsky (V. Bulla, d. 1938) | Q2 a4, a10 | REQUIRES EVIDENCE | independent death-date source |
| q2-stamp-1957 (after an Otsup photo) | Q2 a10 | REQUIRES EVIDENCE | status of the underlying photograph |
| q6-steel-1972 (US EPA DOCUMERICA) | Q6 d1, d6, d10 | REQUIRES EVIDENCE | basis outside the US (NARA record) |
| q1-coupons-museum-2007 | Q1 h3, h10 | REQUIRES EVIDENCE | status of the depicted coupons/museum display |
| q4-room-reconstruction | Q4 b2 | REQUIRES EVIDENCE | museum exhibit-design rights |
| Quotations of official texts / WTO Press/455 | Q1, Q3, Q4, Q5, Q6 | REQUIRES EVIDENCE | recorded legal basis (official-text exclusion or short quotation) |
| Own graphics inside BY-SA clips (c05, c07, c10, c13–c15, c18, c21, c27, c29) | several | REQUIRES EVIDENCE | the team's explicit licence declaration (share-alike obliges BY-SA for these clips; credits currently say "no licence claimed") |

A **REQUIRES EVIDENCE** item is not removed and not replaced: it needs the named fact documented
before public deployment, or an explicit risk acceptance by the responsible lecturer. In a closed
classroom session these items are lower risk, but the editorial bible states classroom use is not an
exemption.

### 4.2 Material in the repository that must not be published (REPLACE/REMOVE BEFORE PUBLIC DEPLOYMENT)

| Item | Problem |
|---|---|
| `server/media/clues/*.webp` (24 legacy clue images, tracked in git) | include q01-01 (© Magnum, all rights reserved, no permission), q01-02 (Ramsden), q01-03 (unknown rights), q03-03 (commune portal, identifiable people), q04-04 and q05-03 (© TTXVN, written permission required), q05-04 (WTO emblem). Not served by the game (not in `server/media/registry.ts`) and not in `dist/`, but present in git history |
| `docs/clue-contact-sheet.jpg` | contact sheet of the same images |

These do **not** block the classroom server (never served). They **block making the repository or
any archive of it public** (the remote `github.com/Car1Grimes/mln131_game` — visibility not verified).
Removal from the working tree is not enough; history rewrite or a fresh public repo is a human
decision. Not changed in M3.3-C (no silent removal).

### 4.3 Content decision needed (lecturer)

- **Q5 recap map (c25, 50–57 s)**: a world land map framing 30°W–200°E, which includes the East Sea,
  without Hoàng Sa / Trường Sa markers; the editorial bible (`docs/content/M3-EDITORIAL-BIBLE.md`
  §3 Maps) says *do not use maps that frame the East Sea*. Evidence: `docs/media-review/q5-clips.jpg`
  (last row). Decision for the lecturer: accept (world-scale locator, no borders) or re-render
  (media change → new validation). **Not changed** in M3.3-C (no media regeneration).

## 5. Pre-class checklist (level B)

| # | Step | Status |
|---|---|---|
| 1 | `npm ci`, `npm run build` prints `check-bundle: OK` | AUTOMATED VERIFIED on this RC |
| 2 | `npm test`, `npm run e2e:all` green on the release machine | AUTOMATED VERIFIED on a Linux machine (see M3.3-C-REVIEW §9); re-run on the class Mac |
| 3 | Strong `ADMIN_PASSWORD`, `HOST=0.0.0.0`, `ROUND_DURATION_MS` unset/40000, `DB_PATH` on local disk | manual |
| 4 | Own router/hotspot; no client isolation; `/api/health` reachable from a phone | NOT TESTED |
| 5 | Level-B rehearsal ([CLASSROOM_DRY_RUN.md](CLASSROOM_DRY_RUN.md)) incl. offline-submit test and an iPhone + an Android | **NOT RUN** |
| 6 | Display font check on Android: the app uses system fonts only; Android lacks the display stack (Bahnschrift / Avenir Next Condensed / Roboto Condensed / Arial Narrow) and falls back to a wider font — check scene text on a real Android phone (on a Linux font set one Q3 statistic source line clips at 360 px, see M3.3-C-REVIEW §9) | **NOT TESTED** on devices |
| 7 | Human playtest with thresholds ([PLAYTEST-PROTOCOL.md §8](PLAYTEST-PROTOCOL.md)) | **NOT RUN** |
| 8 | Lecturer sign-off on the six montages (M3.3-C-REVIEW §7.4) and on §4.3 | **NOT DONE** |
| 9 | After class: backup DB, stop server, revoke projector, delete backups after grading | manual |
