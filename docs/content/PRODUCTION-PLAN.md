# Production Plan — M3.2 (proposal · rev. 2)

> M3.1 produced documentation only. Nothing in this plan has been executed: no downloads, no
> rendering. Rev. 2 incorporates the reviewer findings (rights, leakage, decisive clue at 45 s).

## 1. Missing media & acquisition priority

**P1** = beat cannot be produced without it (no fallback) · **P2** = fallback exists ·
**P3** = enhancement. Rights status per asset: [ASSET-AUDIT](ASSET-AUDIT.md) §3.

| Id | Need | Used in | Candidate source | Expected rights | Priority |
|---|---|---|---|---|---|
| M-Q1-1 | Sharp tem phiếu sheet | Q1-B4 | museum (permission) / own photo of an object / Commons | open licence or permission | P2 (q01-04 small) |
| M-Q1-2 | Sổ mua lương thực page | Q1-B4 | museum / private collection | permission | P3 |
| M-Q1-3 | Dated 1976–86 state-store photo | Q1-B7 | TTXVN / photographers | permission | P2 (native text) |
| M-Q1-4 | Open-licence opener (1975–86 objects) | Q1-B1/B2 fallback | Commons | open licence | P2 |
| M-Q2-1 | PD crowd photo dated Feb/Mar 1917 | Q2-B1 | Commons / LoC | PD | P2 (q02-03 crop) |
| M-Q2-2 | Nicholas II portrait | Q2-B3 | Commons | PD | P3 |
| M-Q2-3 | Winter Palace after capture (Steinberg) | Q2-B7 | Commons | PD | P2 |
| M-Q3-1 | Rochdale Pioneers Museum | Q3-B3 | Commons | CC BY-SA | P1 |
| M-Q3-3 | Icons + comparison cards | Q3-B2, B5 | own | own | P1 |
| M-Q4-1 | 1985 banknotes | Q4-B2 | Commons (check reproduction rules) | PD/rules | P3 |
| M-Q5-1 | Vietnamese export goods | Q5-B1 | Commons / Flickr CC | open licence | P1 |
| M-Q5-2 | World dot map | Q5-B10 | Natural Earth | PD | P1 |
| M-Q6-1 | Vietnamese informal housing vs towers | Q6-B3 | Commons | open licence | P2 (q06-02) |
| M-Q6-2 | Mekong drought/flood | Q6-B5 | Commons / gov press | open licence/permission | P2 (wind farm only) |
| M-Q6-3 | Bạc Liêu wind farm | Q6-B5 | Commons | CC BY-SA 3.0 | P1 |
| M-Q6-4 | SDG colour wheel (official file) | Q6-B9 | un.org | UN guidelines | P2 (own diagram) |
| M-ALL-1 | Base map | Q2, Q3, Q5 | Natural Earth | PD | P1 |
| M-ALL-2 | Be Vietnam Pro | baked text | Google Fonts | OFL | P1 |

Removed in rev. 2: proclamation scan, Hồ Chí Minh portrait, higher-res q05-03.

Acquisition rule: after approval only; into a git-ignored `media-src/` staging folder (add to
`.gitignore` in M3.2) with a JSON sidecar per file (author, URL, licence, date, accessed-on,
permission reference if any).

## 2. Proposed FFmpeg workflow

Reproducible, scripted, one source of truth per clip.

```
media-src/            originals + sidecars (git-ignored, not in dist/)
media-build/clips.json  per clip: inputs, crops, motion, overlay text, duration, credit
scripts/build-clips.mjs reads clips.json → runs FFmpeg → server/media/clips/cNN.mp4 (+ report)
```

- FFmpeg via the npm package `ffmpeg-static` run from a temporary tools folder (as in M2.1) **or**
  a pinned system FFmpeg ≥ 6; record the version in each clip's report.
- **Stills with motion** (T1/T2): `scale=2560:-2,crop=2560:1440` → `zoompan` (≤ 1.15×, d = fps ×
  seconds) → `s=960x540:fps=24` → optional `xfade` between shots (8–12 frames).
- **Graphics** (T6, T7, T8, T9): rendered as PNG sequences or SVG→PNG frames (e.g. a small
  Node script with `@resvg/resvg-js`, or hand-made in a design tool and exported), then encoded
  with `-tune animation`.
- **Text overlays:** `drawtext` with `fontfile=BeVietnamPro-SemiBold.ttf`, `text_shaping=1`
  (requires FFmpeg built with libharfbuzz — check; otherwise pre-render text as PNG).
- **Encoding (all clips):**
  `-c:v libx264 -profile:v main -pix_fmt yuv420p -preset veryslow -crf 30 (stills: -tune stillimage)
  -g 24 -keyint_min 24 -an -movflags +faststart -map_metadata -1 -metadata title= -metadata comment=`
- **Post-encode checks** (automated in the script): duration (ffprobe) = declared `durationMs`;
  size ≤ 600 KB (otherwise CRF +2 and retry, max CRF 34); no audio stream; no metadata tags;
  first 1.5 s contains no text overlay (from clips.json).
- **Native scenes** (text/date/statistic/image) need no FFmpeg; images are converted to WebP
  (`cwebp -q 82`, long side ≤ 1920 px) as in M2.

## 3. File size targets

| Item | Target | Note |
|---|---|---|
| Photographic clip | ≤ 600 KB, ≤ 6–7 s | c01 was 1.09 MB / 10 s at CRF 30 → ≈ 110 KB/s |
| Graphic clip | ≤ 400 KB, ≤ 10 s | flat colours compress 3–5× better |
| Reprise clip (T11, 50–60 s) | ≤ 600 KB: ≈ 6–7 s motion, then the final frame holds until 60 s (scene `endMs` < `durationMs`) | released while teams type; late loading only delays the recap |
| Native image (WebP) | ≤ 350 KB | |
| Per round | ≤ 3.5 MB | estimates: Q1 2.4 · Q2 2.5 · Q3 2.7 · Q4 2.1 · Q5 2.0 · Q6 2.8 MB |
| Whole game | ≤ 20 MB in `server/media` | none of it in `dist/` |

## 4. Rights workflow (before any production)

1. For each asset with status NO/COND in ASSET-AUDIT, record the decision: request permission,
   meet licence conditions, or use the fallback. Classroom use is not an exemption.
2. **Permission requests** (long lead time — start first): TTXVN (q04-04, q05-03 — optional,
   fallbacks already designed), Magnum (q01-01), John Ramsden (q01-02), xã Lê Lợi portal (q03-03),
   museum for tem phiếu/sổ gạo (M-Q1-1/2).
3. **WTO notification** for q05-02 (Commons: "attribution is given to the WTO and the WTO is
   informed") — send before release; keep a copy.
4. **UN SDG Guidelines PDF**: read and record the rule on displaying the wheel unaltered in an
   educational game; otherwise use the own-diagram fallback.
5. **Post-round credits** ("Nguồn hình ảnh"): full attribution for every asset (author, source URL,
   licence + link, changes made), the UN disclaimer + link, "© WTO" for q05-02. In-round credits use
   the neutral forms defined in each storyboard.
6. CC BY-SA adaptations (clips containing CC BY-SA photos) are released under CC BY-SA and
   documented like `docs/media-clips.md`.

## 5. Production order (with dependencies)

| Step | Task | Depends on |
|---|---|---|
| 0 | Final approval of storyboards + §9 items | — |
| 1 | Rights workflow §4 (start permission requests immediately) | 0 |
| 2 | Close remaining PARTIAL on-screen sources (S-Q3-14 state-enterprise wording, S-Q6-01 exact English sentence, S-Q6-11 guidelines PDF, S-Q5-04 BTA official page) | 0 |
| 3 | Acquire P1/P2 open-licence media + sidecars | 0 |
| 4 | Tooling: `clips.json` schema, `build-clips.mjs`, automated checks (incl. text leakage on overlay strings) | 0 |
| 5 | Graphic templates T6–T9, T11 | 4 |
| 6 | **Q3** (after lecturer checklist) | 2, 3, 5 |
| 7 | **Q6** | 2, 3, 5 |
| 8 | **Q5** (after WTO notification) | 1, 3, 5 |
| 9 | Q4 (no blockers) | 3, 5 |
| 10 | Q1 (permissions or fallbacks) | 1, 3, 5 |
| 11 | Q2 | 3, 5 |
| 12 | Timelines in `questions.ts` + registry (separate code review) | 6–11 |
| 13 | Manual frame review §7 + validator + bundle check + network test | 12 |
| 14 | Classroom dry run; update DIFFICULTY-REVIEW with observations | 13 |

## 6. Testing

- `validateTimeline` on every timeline (runs at server start).
- Network: congested-Wi-Fi profile (2.5 Mbit/s, 6 devices) — every clip visible ≤ 2,5 s after
  release; decisive beats are native (no download) so the 45 s clue is never late.
- Devices: projector (1920×1080), 1366×768 laptop, 360×800 phone — screenshot each beat.
- Dry run with uninvolved students.

## 7. Manual frame-review checklist (per clip)

1. No answer text, **expansion, translation, abbreviation or partial answer word** in any frame
   before 45 s (Bible §12): signs, banners, watermarks, documents, packaging.
2. No *later* clue inside an *earlier* clip; reprise contains only released material plus the
   documented non-essential confirmation.
3. First 1.5 s carries no essential information.
4. Baked text meets size rules and is readable on a 360 px phone or duplicated natively.
5. Captions match SOURCE-REGISTER wording; reconstructions labelled; Russian dates labelled lịch cũ/lịch mới.
6. In-round credits neutral; full credits post-round; CC BY-SA adaptations documented.
7. MP4 metadata empty; file name and asset id neutral.

## 8. Technical & editorial risks

| Risk | Impact | Mitigation |
|---|---|---|
| Permissions not granted (Magnum, Ramsden, commune, TTXVN) | weaker visuals | fallbacks designed; no round depends on them |
| WTO / UN conditions not met | rights breach | notification + guidelines check before release; fallbacks |
| Clip download on congested Wi-Fi | late clip | ≤ 600 KB, 1.5 s handle, decisive beats native |
| Validator cannot see pixels or semantics | leakage | §7 review; scripted semantic check on overlay strings |
| Vietnamese diacritics in `drawtext` | broken glyphs | `text_shaping=1` or pre-rendered text |
| Live statistics change (WTO members, World Bank page) | outdated facts | access dates; recheck each semester |
| `▢` glyph missing on some phones | unreadable masked phrase | test; fallback `_ _ _` |
| Difficulty mis-calibrated | frustration / too easy | dry run; adjust order, not facts |

## 9. Items requiring approval before production

- **A1** Rev. 2 timing model: decisive native beat at 45 s + 50–60 s reprise (all rounds).
- **A2** Masked/decisive beats: Q1 phrase, Q2 Old-Style date, Q3 law title + "HTX", Q4 phrase,
  Q5 Press/455 quote, Q6 SDG wheel.
- **A3** Permission requests vs fallbacks: q01-01, q01-02, q03-03 (TTXVN images now optional).
- **A4** q05-02: neutral in-round credit + full post-round credit + WTO notification.
- **A5** Q3 lecturer checklist (especially the state-enterprise card).
- **A6** Q6: official wheel (after guidelines check) or own diagram.
- **A7** Non-Vietnamese conceptual images (q06-01 USA, q06-02 Mumbai fallback, Rochdale).
- **A8** Silent clips.

## 10. Can M3.2 start?

Yes, **partially**: tooling (step 4–5), open-licence acquisition and Q2/Q4/Q6 production can
start once A1, A2, A6–A8 are approved. Q3 waits for the lecturer checklist (A5); Q5 for the WTO
notification (A4) or its fallback; Q1 uses fallbacks unless permissions arrive (A3).
