# What is the keyword? — multiplayer

A real-time classroom gameshow: one admin (quản trò) runs the game, five teams play from their own
devices on the same local network. The Node server is the single authority for answers, timing,
submission order, correctness, scores and progression.

> The original offline single-host version is preserved in git as tag `baseline-local-v1`.

## Rules (M1)

- Six questions per session; a round starts only when the admin presses **Bắt đầu**.
- Each round starts with a **5-second server-timed intro** (question number, a short orientation
  question, a 5 → 1 countdown) on the projector, players and admin; then the round lasts
  **40 seconds, measured by the server**. The intro is not answer time and releases no clue.
- Each team submits **one** answer per round; it cannot be changed. Submitting reveals nothing.
- Correct answers score by **server receipt order**: 1st 50, 2nd 40, 3rd 30, 4th 20, 5th 10.
  Incorrect or missing answers score 0.
- Answers, all submissions, points and the leaderboard are revealed only when the server closes the round.
- Matching ignores case, Vietnamese diacritics (đ = d), spaces, punctuation, `_` and `-`. No synonyms.
- Ties: teams with equal totals share a rank; the ranking supports explicit tie-break rounds
  (and optional correct-count / speed keys) — see `shared/scoring.ts`.

## Requirements

- Node.js 22+ (tested with 23) and npm. `npm install` needs internet once; the game then runs offline
  on the local network.
- Google Chrome for `npm run e2e` (driven through `playwright-core`, no browser download).

## Quick start (local network)

```bash
npm install
npm run build                       # typecheck + client build + answer-leak check
ADMIN_PASSWORD="$(openssl rand -base64 18)" HOST=0.0.0.0 npm start
```

PowerShell: `$env:ADMIN_PASSWORD='<at least 16 random characters>'; $env:HOST='0.0.0.0'; npm start`

The server prints its address (default port **3001**). With `HOST` other than a loopback address, or
with `TRUST_PROXY` set, it refuses to start unless `ADMIN_PASSWORD` is set to at least 16 characters
(not a sample value). On `127.0.0.1` without `ADMIN_PASSWORD` it generates a one-time password and
prints it. Public HTTPS deployment: [docs/M4.1-DEPLOYMENT-PLAN.md](docs/M4.1-DEPLOYMENT-PLAN.md).

1. **Admin:** open `http://<server-ip>:3001/admin`, log in, **Tạo phòng mới**. Rename teams if needed.
   Click **Hiện mã PIN** to read each team's 6-digit PIN privately — do not project the screen while
   PINs are visible.
2. **Teams:** open `http://<server-ip>:3001/?room=<CODE>` (or `/` and type the room code), enter the
   team PIN, then **Xác nhận sẵn sàng**.
3. **Admin:** **Bắt đầu câu 1**. Everyone sees the 5 s intro, then the round begins. The admin sees the countdown and how many teams submitted — never
   the answers or correctness. Results appear automatically at the deadline; **Câu tiếp theo** moves on.

4. **Projector:** on `/admin`, **Mở màn hình máy chiếu** creates a one-time link (valid 5 minutes).
   Open it on the computer connected to the projector (or **Mở cửa sổ máy chiếu** for a second window).
   `/screen` shows the lobby, the montage, the countdown and — only after each round closes — the
   results and leaderboard. It never shows PINs. Click **Toàn màn hình**; sound is off until
   **Bật nhạc** is clicked (see [projector music](docs/M4.3-PROJECTOR-MUSIC.md)); scene videos remain muted. **Thu hồi quyền máy chiếu** disconnects it immediately.

Refreshing or reconnecting restores the exact server state (submission status, remaining time); a
refresh never restarts the timer or the intro countdown. If the server restarts during an intro or a
round, it resumes the original start and deadline from SQLite.

### Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `ADMIN_PASSWORD` | generated per run (loopback only) | Admin login password; required, ≥ 16 characters, when `HOST` is not loopback or `TRUST_PROXY` is set |
| `PORT` | `3001` | HTTP/Socket.IO port |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` to accept devices on the LAN |
| `DB_PATH` | `data/hidden-connection.sqlite` | SQLite database file (persistent) |
| `ROUND_DURATION_MS` | `40000` | Round length (shorter values are for testing) |
| `STATIC_DIR` | `dist` | Built client served by the server |
| `SCREEN_SESSION_TTL_MS` | `21600000` (6 h) | Projector session lifetime (60000 – 604800000; invalid values stop the server) |
| `SCREEN_PAIRING_TTL_MS` | `300000` (5 min) | Projector pairing link lifetime, single use (30000 – 3600000) |
| `TRUST_PROXY` | off | Behind one reverse proxy only: `loopback` (proxy on the same machine) or the proxy's IP/CIDR list; rate limits then use the client IP from `X-Forwarded-For`. `true`, `*` and hop counts are refused |

See `.env.example`. Never commit `.env` or the `data/` folder (both are git-ignored).

## Development

```bash
npm run dev          # server (tsx watch, port 3001) + Vite dev server with API/WebSocket proxy
```

Open the Vite URL (`http://localhost:5173/admin` and `http://localhost:5173/`). Use separate browser
windows or profiles for the admin and each team: sessions are per tab (sessionStorage).

| Command | What it does |
|---|---|
| `npm test` | Unit + integration tests (Vitest): normalization, scoring permutations, engine state machine, deadlines, real Socket.IO server |
| `npm run typecheck` | Client (`tsconfig.json`) and server (`tsconfig.server.json`) |
| `npm run build` | Typecheck, Vite build, then `scripts/check-bundle.mjs` fails if any answer is in `dist/` |
| `npm run e2e` | Browser E2E: 1 admin + 5 players against the built app (run `npm run build` first) |

## Architecture

```
shared/            code used by both sides (no secrets)
  normalize.ts     answer normalization, letter pattern
  scoring.ts       50/40/30/20/10 by receipt order, standings, tie-break policy
  protocol.ts      role-specific views and Socket.IO event types
  scenes.ts        scene model for the future video engine (server-released scenes)
  timesync.ts      server clock offset estimation
server/            Node + Express + Socket.IO + SQLite (better-sqlite3)
  content/questions.ts   SERVER-ONLY canonical answers and scene timelines
  media/registry.ts      SERVER-ONLY opaque asset ids → files (clues/, clips/)
  scenes/validate.ts     timeline validation
  engine.ts        explicit state machine: lobby → active → revealed → ready → … → finished
  db.ts            schema: rooms, teams, rounds, submissions, sessions
  views.ts         the only place state becomes client data (no early disclosure)
  app.ts           HTTP auth endpoints, rate limits, Socket.IO handlers
src/               React client: /admin (AdminApp), /screen (ScreenApp) and / (PlayerApp)
e2e/multiplayer.mjs   browser E2E
scripts/check-bundle.mjs  answer-leak check on the built client
```

### Security boundaries

- Canonical answers exist only in `server/content/questions.ts`; the client never imports server code
  (enforced by a test) and the build fails if any answer form appears in `dist/`.
- During a round, views contain only the answer *shape* (letters per word). The admin sees *whether*
  each team submitted; a team sees its own submission echo. Correctness is computed when the round closes.
- Separate sessions: admin (password) and team (room code + PIN), random 256-bit tokens stored hashed.
  Every Socket.IO action checks the session role; the team id always comes from the session.
- Login and join are rate-limited per IP (and joins per room); wrong code and wrong PIN get the same reply.
- Submissions are atomic and idempotent (client submission id + `UNIQUE(round, team)` in SQLite);
  receipt order is a server sequence number; the deadline is checked against the server clock.

## Scene engine (M2.1)

Each question has a server-only timeline of scenes (image, text card, date, statistic, video clip,
placeholder) with an offset from the round start and an entry transition (cut, fade, slide, zoom).
The server releases scenes on its own clock; clients receive only released scenes and fetch media
through `GET /api/rounds/:roundId/media/:assetId` with their session token (rendered from Blob
URLs). Unreleased, unknown, other-room or other-round media get a uniform 403. Timelines are
validated at startup. Question 4 currently has an engineering prototype montage; the other
questions show a placeholder. Details: [docs/architecture-m2-scenes.md](docs/architecture-m2-scenes.md).

`npm run e2e` runs all browser suites: `e2e/multiplayer.mjs`, `e2e/scenes.mjs` (a real 40 s montage
round with five players; also `npm run e2e:scenes`) and `e2e/projector.mjs` (admin + five players +
projector; also `npm run e2e:projector`). Projector design: [docs/architecture-m22-projector.md](docs/architecture-m22-projector.md).

## Network resilience and classroom readiness (M2.3)

- `npm run e2e:resilience` — admin + 5 teams + projector through per-device TCP impairment proxies
  (latency, jitter, bandwidth, frozen link, cut), plus performance metrics (≈4 min).
- `npm run e2e:restart` — kills the real server process mid-round and after the deadline, restarts it
  on the same SQLite file and checks recovery (≈2.5 min).
- `npm run e2e:all` — every browser suite.
- Results and limits: [docs/network-resilience.md](docs/network-resilience.md).
- Rehearsal on the real classroom Wi-Fi: [docs/CLASSROOM_DRY_RUN.md](docs/CLASSROOM_DRY_RUN.md);
  device checklist: [docs/MANUAL_TEST_CHECKLIST.md](docs/MANUAL_TEST_CHECKLIST.md).
- Plain HTTP on a LAN does not encrypt passwords, PINs or sessions; use a network you control.
  HTTPS for public deployment is planned for M4.

## Content and media

Image sources and accuracy notes: [docs/clue-assets-review.md](docs/clue-assets-review.md). In M1
rounds show a neutral placeholder; the images (some are press/agency photos used with credit for
local teaching) stay server-side and must not be published.
