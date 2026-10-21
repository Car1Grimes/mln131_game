# M2.1 — Scene engine and secure media: data flow

## Before (M1, commit 0586f22)

1. `server/content/questions.ts` held answers plus one `placeholder` scene per question.
2. `GameEngine.startRound` stored `started_at` / `deadline_at` in SQLite and scheduled the close
   timer plus one broadcast per future scene (`scheduleRound`).
3. `views.ts` → `engine.roundView()` → `releasedScenes(timeline, started_at, now)` filtered scenes by
   the server clock; Socket.IO pushed role-specific views on every change.
4. `SceneStage` rendered the last released scene as text. No media was served; clue images sat in
   `server/media/clues/`, unreachable by clients.

## After (M2.1)

```
server/content/questions.ts   timeline per question (Q4: prototype montage)          SERVER ONLY
server/media/registry.ts      opaque asset id → file under server/media              SERVER ONLY
server/scenes/validate.ts     timeline validation (engine refuses to start if invalid)
        │
GameEngine.startRound ──► SQLite rounds(started_at, deadline_at)
        │  scheduleRound: one timer per future scene → releaseScene(roundId, releaseAt)
        │     (re-checks: same round still open, server clock ≥ releaseAt; else re-arm / ignore)
        ▼
views.ts → roundView(): releasedScenes(timeline, started_at, min(now, deadline−1))
        │  Socket.IO 'state' (role-specific)  — clients only ever see released scenes
        ▼
SceneStage (client)
   ├─ text / date / statistic / placeholder: rendered from the released scene data
   └─ image / video: MediaCache.fetch(GET /api/rounds/:roundId/media/:assetId, Bearer token)
                      → Blob → object URL (revoked on round change / unmount)
                              ▲
GET /api/rounds/:roundId/media/:assetId (server/app.ts)
   session? ─no→ 401
   engine.authorizeMedia(roundId, assetId, session):
      round exists · team session in that room · asset belongs to a scene of THIS round's
      question · scene released by the SERVER clock (or round closed)  ─any no→ 403 (uniform)
   registry.resolveFile (realpath inside media root) → sendFile with private no-store headers,
   nosniff, range support (video)
```

### Timing
- The server clock alone releases scenes. Clients never unlock a scene themselves.
- Clients estimate the server-clock offset (`shared/timesync.ts`, `useRoom`) only to position video
  playback: `videoPositionMs(scene, serverNow)`, corrected when drift exceeds 0.35 s.
- A newly released scene loads in a hidden layer while the previous one stays visible; it is shown
  (with its transition) once ready. A slow load shows "Đang tải…", a failed load a neutral fallback.
- Refresh / late join: the view contains exactly the scenes released so far; the stage shows the
  latest one and aligns video to the server timeline. Restart: `recover()` re-arms release timers
  from the stored `started_at`; deadlines and offsets never change.
- Production rounds are 40 s; `ROUND_DURATION_MS` may only be shortened (1–40 000 ms, enforced at
  startup). Timelines are always validated against the authored 40 s round; in a shorter test round,
  scenes at or after the deadline are never released (views and media both cap at the deadline, also
  after the round closes) and the server logs how many will be skipped.
- Statistics must cite a source. Demo (fictional) statistics are rejected for production content;
  only test fixtures can enable them (`allowDemoStatistics`).
