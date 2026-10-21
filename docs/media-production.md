> Current M4.2 timing/specification: [40-second storyboard](M4.2-40S-STORYBOARD-PROPOSAL.md). The Step 3B.1 implementation report records the eight selective renders; earlier reproducibility reports describe historical bytes and do not certify this render pass.

# Media production pipeline (M3.2)

Reproducible, auditable production of the montage clips. Nothing here is part of the app build:
the tools are installed separately, sources live in a git-ignored staging folder, and only the
finished clips are placed in `server/media/clips/` (server-only, never in `dist/`).

## Layout

| Path | Tracked | Purpose |
|---|---|---|
| `media/sources.json` | yes | Source attribution manifest: URL, creator, licence + evidence, source date, context, attribution text, credit key, visible text in the picture |
| `media/sources.lock.json` | yes | Pins every staged file: resolved URL, bytes, sha256, original resolution, licence seen on the access date, access date |
| `media/templates/stage.html` | yes | Reusable visual templates (deterministic HTML/CSS renderer) |
| `media/q2/manifest.json` | yes | Declarative Q2 manifest: the 40 s scene timeline, clip specs, source-timing rules, leak policy |
| `media/q2/build-report.json` | yes | Tool versions, exact FFmpeg commands, CRF ladder attempts, sizes, sha256, ffprobe summary, max source scale |
| `media/q2/validation-report.json` | yes | Last validator run |
| `scripts/media/*.mjs` | yes | `fetch-sources`, `build-clips`, `validate-media`, `review-frames`, `map` |
| `media-tools/package.json` (+ lock) | yes | Pinned FFmpeg 6.0 (`ffmpeg-static@5.2.0`) and FFprobe (`ffprobe-static@3.1.0`) |
| `media-src/` | **no** (git-ignored) | Downloaded originals (photos, map data, fonts) |
| `media-build/` | **no** (git-ignored) | Rendered PNG frames, review frames, logs |
| `server/media/clips/c02–c06.mp4` | yes | Q2 production clips (registered under opaque ids) |
| `docs/media-review/q2-*.jpg` | yes | Contact sheets for manual review |

## Build

```bash
npm --prefix media-tools ci                                   # pinned FFmpeg/FFprobe (once)
node scripts/media/fetch-sources.mjs                          # sources → media-src/, verifies sha256 pins
node scripts/media/build-clips.mjs media/q2/manifest.json     # render + encode all Q2 clips (≈ 8 min)
node --import tsx scripts/media/validate-media.mjs media/q2/manifest.json
node scripts/media/review-frames.mjs media/q2/manifest.json   # contact sheets for manual review
node scripts/media/repro-check.mjs media/q4/manifest.json     # build twice, compare clip sha256
node scripts/media/timeline-ts.mjs media/q4/manifest.json     # print the timeline for questions.ts
node --import tsx scripts/media/attribution.mjs               # per-question credits → server/content/attribution.json
```

**Post-round credits ("Nguồn tư liệu", M3.3-A).** `scripts/media/attribution.mjs` maps every production
clip (scene → clip → shots → sources) to `media/sources.json` and writes the server-only
`server/content/attribution.json` plus `docs/media-review/ATTRIBUTION-COVERAGE.md`. Re-run it after
changing a manifest or a source record (`--check` fails on stale output; a unit test checks it too).
Each source record carries `licenceCode`, `creditName`, optional `title` and `rightsNote`
(jurisdiction-qualified public domain is never shown as plain public domain).

Manifests exist for all six questions (`media/q1` … `media/q6/manifest.json`).

`--only c03,c05` rebuilds selected clips. `FFMPEG`, `FFPROBE` and `CHROME_CHANNEL` override the
tool paths. Wikimedia rate-limits downloads: the fetch script waits (it honours `Retry-After`).

## How a clip is made

1. **Sources** are read from `media-src/` only after their sha256 matches the lock file.
2. **Render:** headless Chrome (playwright-core, an existing dev dependency) loads
   `media/templates/stage.html` with the pinned Be Vietnam Pro fonts and calls
   `HC.render(t)` for each frame (24 fps) at 960×540 CSS / device scale 2 → 1920×1080 PNG.
   Rendering is a pure function of (clip spec, t): no CSS animations or timers. Chrome runs with
   software rasterisation (`--disable-gpu`, fixed sRGB, no LCD text, no hinting): two full builds
   produced bit-identical clips (GPU raster differed slightly between runs).
   Vietnamese text is shaped by Chrome (correct diacritics, no `drawtext` shaping issues).
3. **Guard:** the renderer reports the largest source-to-output scale of every photo shot; the
   build fails if any photo would be upscaled beyond its source resolution at 960×540.
4. **Encode** (exact command in the build report):
   `-vf scale=960:540:flags=lanczos,format=yuv420p -c:v libx264 -profile:v main -preset veryslow
   -tune stillimage|animation -crf N -g 24 -keyint_min 24 -sc_threshold 0 -threads 1 -an
   -map_metadata -1 -metadata:s:v:0 encoder= -bsf:v filter_units=remove_types=6 -fflags +bitexact
   -flags:v +bitexact -movflags +faststart`
   (no audio, no metadata, x264 settings SEI removed, keyframe every second, faststart).
5. **Size:** CRF ladder 24 → 26 → 28 → 30 picks the best quality within 600 KB. CRF 30 is the
   readability floor: a clip still over budget at CRF 30 is kept and **reported**, not crushed.

## Templates (`media/templates/stage.html`)

| Template | Use |
|---|---|
| `photo` | Historical-photo pan/zoom (cover or contain + blurred backdrop), focal-point easing |
| `calendar` | Date reveal with two calendars (lịch cũ = lịch mới), pages flip in |
| `date` | Large date reveal with a label |
| `timeline` | Animated rail with thumbnail ticks, or wide text-only ticks (date / label / note) |
| `venn` | Three circles (Kinh tế · Xã hội · Môi trường) appear, slide together into the overlap, centre pulses; optional faint photo fill. Own design, not derived from any logo |
| `typo` | Typographic sequence: stacked lines revealed in turn, optional count-up number (`{n}`) |
| `pool` | Members drop coins into one shared box; the coins pile up (pooled capital) |
| `assembly` | Members with unequal coin stacks each raise one hand → "1 phiếu" each (equal votes) |
| `locator` | Land-only locator map (Natural Earth, no borders) with pulsing dot |
| `shop` | Own flat illustration of a shop counter: sparse shelves, clerk, a queue that steps forward, optional signboard (`title`) and a coupon handed over the counter |
| `coupons` | Own schematic coupon sheet: labelled rows of plain coupons (no printed text — never a facsimile); squares are cut off one at a time (`cuts`) |
| captions | Documentary caption band: date line (`[[old:…]]` amber, `[[new:…]]` cyan) + text line |
| `tag` | Status chip (ẢNH NĂM 2013, TÁI HIỆN…) |
| `in: {type:'fade'}` | Photo transition (cross-fade) between shots |

Captions sit at the top of the frame (the game overlays the credit at the bottom; on phones it
wraps to 2–3 lines). **Legibility rule (build-enforced, `legibility` in the manifest):** on a 360×740
phone the stage measures 336 px (×0.35); every essential text must render ≥ 16 CSS px there, i.e.
≥ 46 px at 960×540 — production uses 48 px (16.8 px on the phone) — must stay inside the frame and
above y = 420. The build measures each text at every caption cue and fails otherwise. Check
`docs/media-review/q2-clips-phone.jpg`.

## Safety rules enforced by the validator

- The timeline in `server/content/questions.ts` must equal the manifest.
- No exact answer of any question in any on-screen string, credit or label.
- No semantic leak term (manifest `leakPolicy`) before the decisive clue, including text visible
  inside source pictures (`visibleText` in `media/sources.json`).
- A clip may only contain sources whose `sourceRules` time ≤ the clip's release time: no future
  clue inside an earlier, already-downloadable clip.
- Every clip credit names each source (and its CC licence).
- Files: H.264 Main / yuv420p / 960×540 / 24 fps, no audio, faststart, no metadata, sha256 equals
  the build report.
- Network: WARN when a clip's estimated arrival at 2.5 Mbit/s exceeds 2.2 s; FAIL when an
  essential caption (default; `essential: false` for lead-ins and location straps) would be visible
  for less than 1.5 s on a device that receives the clip that late (playback is aligned to server
  time, so late devices skip the start of a clip).
- Legibility (build-enforced, see above).
- Manual frame review is still mandatory (contact sheets): the validator cannot judge pixels.
