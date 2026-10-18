# The Hidden Connection

A local, offline classroom gameshow for five teams. One computer, operated by an admin with a mouse,
shown on a projector. No backend, no accounts, no network access at runtime.

## Requirements

- Node.js 18+ and npm (only needed to install and build; the game itself runs fully offline).

## Commands

```bash
npm install        # install dependencies (once, needs network)
npm run dev        # start the dev server, then open the printed http://localhost:5173 URL
npm run build      # typecheck and build to dist/
npm run preview    # serve the built dist/ locally (offline), default http://localhost:4173
npm test           # run unit tests
npm run typecheck  # TypeScript check only
npm run e2e        # browser smoke test (needs `npm run preview` running; uses installed Google Chrome)
```

### Browser smoke test

`e2e/smoke.mjs` drives the locally installed Google Chrome through `playwright-core` (no browser
download) with a controlled clock. It plays setup → round → pause → wrong answer → resume → correct
answer → leaderboard → next round → undo → refresh restore, checks the 10/20/30s clue transitions,
and checks layout at 1920×1080, 1366×768, 1366×650, 1280×720 and 390×844.

```bash
npm run build && npm run preview     # terminal 1
npm run e2e                          # terminal 2
SHOTS=/some/dir npm run e2e          # also save screenshots
BASE_URL=http://localhost:5173/ npm run e2e   # against the dev server
```

### Offline preview

After `npm install` and `npm run build`, the network is no longer needed. Run `npm run preview`
and open the printed local URL (default http://localhost:4173). The built app loads no external
fonts, scripts, or images.

Serve `dist/` through `npm run preview` (or any static server) rather than opening
`dist/index.html` directly; browsers block ES module scripts from `file://` URLs.

## How to play

The interface is in Vietnamese and designed for a 16:9 projector (1920×1080 or 1366×768). Press **F**
or the ⛶ button for fullscreen.

1. **Bắt đầu** on the welcome screen, then name the five teams (max 40 characters; duplicate names
   are flagged) and click **Vào trò chơi**.
2. The round intro shows only the question number. Click **Bắt đầu câu N** to start the 60-second
   active clock. Clues reveal at 0s, 10s, 20s and 30s; the 40/30/20/10 ladder shows the current value.
3. **TẠM DỪNG / TRẢ LỜI** (or key **P**) stops the clock and opens the answer dialog. Pick the team,
   type the answer, click **Chấm đáp án**.
   - Correct: the round-result screen reveals the answer and the points awarded.
   - Incorrect: a red notice appears, that team is marked *Hết lượt* for this question, and the clock
     resumes from the same elapsed time.
   - **Tiếp tục tính giờ** closes the dialog without a ruling. Escape does nothing here, so the
     clock cannot resume by accident.
4. At 60s of active play the question ends with 0 points. If every team is out, the pause button is
   disabled and the clock runs out.
5. Result screen → **Xem bảng xếp hạng** (animated) → **Câu tiếp theo** (asks for confirmation).
   After the last question: **Kết quả chung cuộc** with the top-3 podium.
6. Top bar: question buttons 1–6 (with confirmation), **Hoàn tác** (undo the last ruling, returning
   to the paused answer dialog as it was), **Chơi lại** (reset scores, keep team names).
   Team names can be changed from the round intro (**Đổi tên đội**).

### Keyboard shortcuts

| Key | Action | When |
| --- | --- | --- |
| P | Pause & answer | Clock running, no dialog open |
| F | Toggle fullscreen | No dialog open |

Shortcuts are ignored while typing in any text field and while any dialog is open. Everything is
also available by mouse.

To guard against double-clicks, the pause control is disabled for 0.7 s after the clock starts or
resumes.

Answer matching ignores case, Vietnamese diacritics (đ = d), spaces, punctuation, underscores and
hyphens. Only the canonical answer is accepted, with no synonyms. For example, `bao cap` matches
`BAO CẤP`, but `Tổ chức Thương mại Thế giới` does not match `WTO`.

### Persistence

State is saved to `localStorage` on every change, about once per second while the clock runs, and
when the page closes. After a refresh, a running question comes back **paused** at the saved
elapsed time (no extra time is used). Click **Cancel & resume timer** to continue.
**Reset game** clears scores and results.

## Project structure

```
src/content/questions.ts   question content (answers + clue metadata), separate from logic
src/game/types.ts          typed state machine: setup | ready | running | paused_for_answer | round_complete | final
src/game/machine.ts        pure reducer `transition(state, action, ctx)` and selectors
src/game/rules.ts          timing and scoring constants
src/game/normalize.ts      answer normalization and letter-box layout
src/game/persistence.ts    save/load/validate; freezes the clock for storage
src/game/standings.ts      ranking (competition ranks for ties), derived from results
src/ui/interaction.ts      UI policies: pause double-click guard, typing detection for shortcuts
src/hooks/useGame.ts       React binding: monotonic clock (performance.now), ticking, saving
src/screens/               one presentational component per screen (welcome, setup, intro, play, result, final)
src/components/            presentational building blocks (clue grid, countdown, ladder, dialogs, leaderboard…)
src/App.tsx                wires the state machine to screens; holds view-only state (welcome step, open dialogs)
e2e/smoke.mjs              browser smoke test
```

The timer stores accumulated active time plus the monotonic timestamp when the current running
segment began. Elapsed time is always computed as `accumulated + (now - runningSince)`; the 100 ms
interval only triggers re-renders and the deadline check.

### Clue images

All 24 clue images are stored locally in `public/clues/` as `qNN-MM.webp` (question, clue order) and
referenced from `src/content/questions.ts`. Nothing is loaded from the internet at runtime. Hidden
clues are not rendered, so their images cannot be peeked at early. If a file is missing, the panel
falls back to a neutral placeholder; `npm test` also fails if any of the 24 files is missing.

Sources and accuracy notes: [docs/clue-assets-review.md](docs/clue-assets-review.md) (contact sheet:
[docs/clue-contact-sheet.jpg](docs/clue-contact-sheet.jpg)). In the game, **Nguồn hình ảnh** on the
final screen lists the sources; it is only reachable there so it cannot spoil a round.

The images are for this local classroom activity only. Several are press or agency photos used
with credit, not under an open licence, so do not publish the image collection.
