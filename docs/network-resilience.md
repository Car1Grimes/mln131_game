# M2.3 — Network resilience, recovery and performance

All numbers below were measured on 2026-10-19 on one Mac (Apple Silicon, macOS, Node 23.10,
headless Google Chrome via playwright-core): every client runs on the same machine as the server.
They show the behaviour of the software under *simulated* conditions, not of a real classroom
Wi-Fi network (see CLASSROOM_DRY_RUN.md for the real rehearsal).

## How network conditions are simulated

| Tool | Affects HTTP | Affects WebSocket | Used for |
|---|---|---|---|
| `e2e/lib/netproxy.mjs` (TCP proxy, per device) | **yes** | **yes** | latency, jitter, bandwidth limit, frozen link (traffic held), lost replies (server→client dropped), abrupt cut (TCP reset) |
| Chrome DevTools `Page.setWebLifecycleState` | n/a | n/a | backgrounded/frozen tab (timers and rendering stop) |
| Playwright `page.clock.install` | n/a | n/a | client clock 5 min ahead (time keeps flowing) |

- The proxy works at the TCP level, so HTTP requests, media downloads and the Socket.IO WebSocket
  are all delayed/throttled/frozen in exactly the same way. Chrome DevTools network throttling was
  **not** used (its WebSocket coverage was not verified here).
- **True IP packet loss is not simulated.** It needs root-level tools (`dnctl`/`pfctl` require
  `sudo`, unavailable here) and on TCP it surfaces as extra delay/jitter anyway, which *is* covered.
- Bandwidth limits are per device; the six devices do not share one simulated link.

## Failure scenarios and results (automatically verified)

Protocol level — `server/resilience.test.ts` (real HTTP + Socket.IO server, deterministic clock):

| Scenario | Result |
|---|---|
| Disconnect **before** Submit | nothing recorded; submitting after reconnect works |
| Disconnect **immediately after** Submit (packet never arrives) | nothing recorded; retry with the same id records it once |
| Server recorded it but the **acknowledgement is lost** (server→client dropped by the proxy) | recorded once; reconnect shows it as recorded; retry with the same id → `duplicate`, original receipt time |
| Two devices of one team retry the same submission concurrently | one row; same receipt time |
| A different answer after reconnecting | `already_submitted` |
| Reconnect **after the deadline** | unrecorded answer → `round_closed`; a recorded one → original receipt (`duplicate`) |
| Client sends its own timestamps | ignored; the deadline is the server's |
| Admin, 5 teams and projector all drop and reconnect at once mid-round | same round, startedAt, deadline, released scenes and release times; submissions kept; projector still forbidden from `admin:start`; scoring once |

Browser level — `e2e/resilience.mjs` (admin + 5 teams + projector, real 60 s rounds), run B
"congested Wi-Fi" (60 ms latency + up to 80 ms jitter, 2.5 Mbit/s per device):

| Incident | Verified |
|---|---|
| Team's network frozen while submitting | "Chưa xác nhận được…" shown, never "Đã ghi nhận"; answer locked (cannot silently change) |
| Same team **refreshes while still disconnected**, then the network returns | pending answer restored from sessionStorage, retried with the same id, confirmed by the server, recorded once, scored once (+40) |
| Abrupt TCP cut | Socket.IO reconnects by itself in ≈1.8 s |
| Projector tab frozen (backgrounded) for 11 s | on resume shows the current scene within 10 ms; countdown within the 1 s display resolution |
| Team device clock 5 min ahead | countdown identical to the admin's (server deadline + measured offset) |
| Team offline across the deadline, presses Submit while offline | never shown as recorded; not accepted after the deadline; result "Đội chưa nộp" |
| Any time | no submission accepted after the deadline; no early reveal; no external requests; no unexpected console errors |

Real process restart — `e2e/restart.mjs` (server killed with SIGKILL, restarted on the same SQLite file):

| Scenario | Verified |
|---|---|
| Crash at 14 s of a 60 s round, restart at 18.5 s (downtime 4.8 s) | all 7 clients reconnect by themselves; same room/teams/round id/startedAt/deadline; submissions byte-identical; scene s3 shown (no timeline reset); projector still paired; submitting after the restart works; results 0.5 s after the **original** deadline; scores 50/40/0, no duplicates |
| Deadline passes while the server is down | restarted server closes the overdue round (4.3 s after the deadline), scores it once; clients and projector receive the reveal; a further restart changes nothing |

Reconnect recovery after a restart (ms from "server ready" to each client showing the restored view):
2293, 2577, 2580, 4875, 4879, 4882, 4885 (n = 7; Socket.IO's default reconnect backoff dominates).

## Performance (1 admin, 5 teams, projector)

"Release" = authoritative server release time (round start + offset). Receipt = first WebSocket
frame containing the scene (test-process clock). Visible = the stage switched to the scene
(including media download/decoding). Devices deliberately disturbed in run B are excluded from its
"normal" figures (team 2, team 3, projector; team 4 for in-page timestamps because of its clock skew).
p95 is only given for n ≥ 20.

| Metric | A — LAN (no impairment) | B — congested Wi-Fi |
|---|---|---|
| release → receipt (ms) | n=30 · min 4 · median 8 · p95 21 · max 21 | n=15 · min 77 · median 106 · max 145 |
| release → visible (ms) | n=30 · min 2 · median 8 · p95 214 · max 215 | n=10 · min 76 · median 144 · max 3 939 (the video scene) |
| scene spread between clients (ms) | n=5 · max 4 | n=5 · max 120 |
| image download (ms, 153 KB) | n=12 · median 24 · max 30 | n=9 · median 669 · max 702 |
| video download (ms) | n=6 · median 21 · max 21 | n=5 · median 3 655 · max 3 765 |
| video drift vs server timeline (ms) | n=18 · min 294 · median 297 · max 298 | n=6 · min 121 · median 121 · max 206 |
| countdown vs server deadline | ≤ 1 s (display resolution is 1 s) | ≤ 1 s |
| redundant media fetches | 0 | 0 |

Video drift stays below the client's correction threshold (0.35 s): the player only seeks when the
drift exceeds it. An earlier identical LAN run measured 42–67 ms; the ≈0.3 s seen here is a constant
start-up offset of that run.

### The 3 MB prototype clip was too large → re-encoded (the one justified improvement)

| Per-device bandwidth | original c01.mp4 (3 067 447 B) | re-encoded c01.mp4 (1 089 761 B) |
|---|---|---|
| 1 Mbit/s | — | 8.8 s |
| 2 Mbit/s | 12.3 s | 4.4 s |
| 5 Mbit/s | 4.9 s | 1.8 s |
| 10 Mbit/s | 2.5 s | 0.9 s |
| Run B (2.5 Mbit/s, 6 devices) | ≈10.0 s → video visible ≈10 s late, no playback sampled before 49 s | 3.7 s |

Same photos and motion; 960×540, 24 fps, CRF 30 (`docs/media-clips.md`). Media authorisation,
release times and the deadline are unchanged; nothing is preloaded. On links below ≈2 Mbit/s the
clip still arrives several seconds late — the previous scene stays visible with "Đang tải…", and
playback then starts at the correct timeline position.

## Client-side fixes made in M2.3

- **Answer delivery** (`src/player/delivery.ts`, `PlayerApp`): the confirmed answer is locked and
  persisted per round with its submission id; unacknowledged sends are shown as *unconfirmed* and
  retried automatically (1/2/4/8 s backoff, same id); "Đã ghi nhận" only appears when the server's
  view contains the submission.
- **Round binding**: `team:submit` must carry the `roundId` the answer was given for (validated by
  the server). A pending answer is stored with its round and is never restored into another round.
  An answer for a round that is no longer open is **never applied to the current round**: it gets
  its original receipt if exactly that submission was recorded (`duplicate`), otherwise
  `round_closed`. Before this fix, a Q1 answer retried right after reconnecting into Q2 could be
  recorded as the team's Q2 answer (confirmed by a mutation test). Covered for: reconnect after Q2
  started, lost ack then Q2, retry after closure / after advancing, two devices of one team, server
  restart, missing/unknown/other-room round ids.
- **Clock sync** (`src/net/clockSync.ts`): measurements are cancellable; a stale reply after
  unmount/reconnect is discarded; the offset is re-measured when a tab becomes visible again.
- **StrictMode**: sockets connect on the next tick, so React's double mount in development no longer
  opens and immediately closes a WebSocket (dev-mode smoke run: no warnings on `/`, `/admin`, `/screen`).
- **CSS**: letter slots fall back to a fixed size where container query units are unsupported
  (Safari/iOS < 16).

## Browser compatibility review (code review — not device-tested)

| Feature | Status |
|---|---|
| H.264 Main MP4, faststart | supported by Safari/iOS and Chrome/Android |
| Blob URL video/image | supported; Blob MIME type comes from the response (`video/mp4`) |
| Muted autoplay + `playsInline` | set on every clue video (players always muted) |
| Fullscreen API | button only shown when `requestFullscreen` exists (absent on iPhone Safari for page elements) |
| Clipboard | `navigator.clipboard` needs HTTPS; on `http://<LAN IP>` the admin falls back to select + `execCommand('copy')` |
| `crypto.randomUUID` | needs a secure context; on plain-HTTP LAN the code falls back to a time+random id (accepted by the server) |
| sessionStorage | wrapped in try/catch; per-tab sessions survive refresh |
| WebSocket reconnect | Socket.IO auto-reconnect; iOS suspends sockets in background tabs → reconnect + clock re-sync on return |
| Layout | 390 px wide tested in Chrome; `100dvh`/`aspect-ratio` need Safari ≥ 15.4 |

WebKit/Safari were **not** run automatically: Playwright's WebKit build is not Safari, and installing
it was not justified for this checkpoint. See MANUAL_TEST_CHECKLIST.md.

## Dependency audit (`npm audit`, 2026-10-19)

Before: 11 (2 critical, 3 high, 6 moderate). `npm audit fix` (no `--force`) updated only the lockfile:
express 4.22.3, body-parser 1.20.8, path-to-regexp 0.1.13, qs 6.16.1, tsx 4.23.15. All tests pass.

After: 6, all in the **development-only** vite/vitest toolchain, each fix requires a major upgrade:

| Package | Severity | Type | Exploitability here |
|---|---|---|---|
| vitest (+ tinypool, @vitest/mocker, vite-node) | critical | dev, direct/transitive | Vitest UI server is never started; tinypool gadget needs attacker-controlled worker options; mocker issue needs malicious test code. Not reachable at runtime. |
| vite | high | dev, direct | dev-server only (path traversal in deps `.map`, Windows `fs.deny` bypass, launch-editor on Windows). The classroom server serves the built `dist/` with Express; Vite is not running. |
| esbuild ≤ 0.24.2 | moderate | dev, transitive | lets websites read responses from a running esbuild dev server; only relevant while `npm run dev` runs. |

Deferred: upgrading vite → 6+/8 and vitest → 3+ (breaking). Recommended before any public
deployment (M4), with the test suite as the safety net. Do not run `npm run dev` on an untrusted network.

## Not verified automatically

- Real Wi-Fi (shared airtime, roaming, captive portals, client isolation), real packet loss.
- Safari on macOS/iOS, Chrome on Android, physical projectors and external displays.
- Hours-long sessions, laptop sleep on the server.
