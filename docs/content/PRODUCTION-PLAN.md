# Production Plan — M3.2 (proposal)

> M3.1 produced documentation only. Nothing in this plan has been executed. M3.2 starts only
> after the storyboards and the approval items in §8 are signed off.

## 1. Missing media & acquisition priority

Priority: **P1** = a beat cannot be produced without it · **P2** = a fallback exists ·
**P3** = enhancement. "Self" = made in-house (graphics).

| Id | Need | Used in | Candidate source | Licence expectation | Priority |
|---|---|---|---|---|---|
| M-Q1-1 | Sharp photo/scan of a tem phiếu sheet | Q1-B4 | Museum photography with permission; Commons search; own photo of a museum object | CC / permission | P1 |
| M-Q1-2 | Sổ mua lương thực (rice book) page | Q1-B4 | VnExpress 2011 article (copyright), museum, private collection | permission | P2 |
| M-Q1-3 | Dated 1976–86 state-store photo with "MẬU DỊCH QUỐC DOANH" | Q1-B7 | TTXVN archive (permission), Ramsden/Griffiths sets | permission | P2 (fallback q01-03) |
| M-Q2-1 | PD crowd photo dated Feb/Mar 1917 Petrograd | Q2-B1 | Commons / LoC | PD | P2 (fallback q02-03 crop) |
| M-Q2-2 | PD portrait of Nicholas II or abdication manifesto | Q2-B3 | Commons | PD | P2 |
| M-Q2-3 | Winter Palace after capture, 26 Oct (8 Nov) 1917 (Steinberg) | Q2-B7 | Commons (S-Q2-10) | PD | P1 |
| M-Q2-4 | Proclamation "К гражданам России!" scan | Q2-B9 | Commons Milrevkom_proclamation.jpg | PD | P1 |
| M-Q2-5 | Licence-clean portrait of Hồ Chí Minh / Nguyễn Ái Quốc | Q2-B9 | Commons PD (e.g. 1921 Marseille congress photo) — verify | PD | P2 (drop portrait, keep text) |
| M-Q3-1 | Rochdale Pioneers Museum, Toad Lane | Q3-B3 | Commons (Robert Wade 2011 CC BY-SA 2.0; 2017 CC BY-SA 4.0) | CC BY-SA | P1 |
| M-Q3-2 | Second HTX signboard (Con Cuông weaving HTX) | Q3-B10 | Commons CC0 | CC0 | P3 |
| M-Q3-3 | Coin/box/hand icons, comparison table | Q3-B2, B5 | Self | own | P1 |
| M-Q4-1 | 1985 banknotes (old/new) | Q4-B2 | Commons (check State Bank reproduction rules) | PD/permission | P2 |
| M-Q4-2 | Neutral rice-paddy background | Q4-B4 | Commons | CC | P3 |
| M-Q5-1 | Vietnamese export goods close-ups (coffee, garments, rice sacks) | Q5-B1 | Commons / Flickr CC | CC | P1 |
| M-Q5-2 | World map dots (166 members) | Q5-B10 | Natural Earth + WTO member list | PD + facts | P1 |
| M-Q5-3 | Higher-resolution q05-03 | Q5-B8 | TTXVN (permission) | permission | P2 |
| M-Q6-1 | Vietnamese informal housing beside towers | Q6-B3 | Commons | CC | P2 (fallback q06-02) |
| M-Q6-2 | Mekong drought/salinity or flood photo | Q6-B5 | Commons / UNDP / gov press (permission) | CC/permission | P1 |
| M-Q6-3 | Bạc Liêu wind farm | Q6-B5 | Commons (S-Q6-13) | CC BY-SA 3.0 | P1 |
| M-Q6-4 | Text-free SDG colour wheel | Q6-B9 | un.org communications materials | UN guidelines | P1 |
| M-ALL-1 | Locator map base (Natural Earth), dots only | Q2, Q3, Q5 | naturalearthdata.com | PD | P1 |
| M-ALL-2 | Be Vietnam Pro font | all baked text | Google Fonts | OFL | P1 |

Acquisition rule: download **only** P1/P2 items after approval, into a local, git-ignored
`media-src/` staging folder (to be added to `.gitignore` in M3.2), with a JSON sidecar per file
(author, URL, licence, date, accessed-on). Never more than needed per beat.

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
| Native image (WebP) | ≤ 350 KB | |
| Per round | ≤ 3.5 MB | estimates: Q1 2.4 · Q2 2.6 · Q3 2.8 · Q4 2.3 · Q5 2.1 · Q6 2.9 MB |
| Whole game | ≤ 20 MB in `server/media` | none of it in `dist/` |

## 4. Production order (with dependencies)

| Step | Task | Depends on |
|---|---|---|
| 0 | Approve storyboards + §8 items | — |
| 1 | Close PARTIAL sources used on screen (S-Q1-04/05, S-Q2-09, S-Q3-04 official text, S-Q5-04/06 signing, S-Q6-01 wording) | 0 |
| 2 | Request permissions (TTXVN, museum) — long lead time, start immediately | 0 |
| 3 | Acquire P1 open-licence media + sidecars | 0 |
| 4 | Build tooling: `clips.json` schema, `build-clips.mjs`, checks | 0 |
| 5 | Graphic templates T6–T9 once (shared look) | 4 |
| 6 | **Q3** clips + timeline (priority round, all-open-licence assets) | 1, 3, 5 |
| 7 | **Q6** clips + timeline | 1, 3, 5 |
| 8 | **Q5** clips + timeline (B8 waits for TTXVN or fallback) | 1, 2, 3, 5 |
| 9 | Q1, Q4 (depend most on permissions) | 1, 2, 3, 5 |
| 10 | Q2 | 3, 5 |
| 11 | Write `questions.ts` timelines + registry entries (code change, separate review) | 6–10 |
| 12 | Manual frame review (§6) + validator + bundle check + network test (`e2e/resilience.mjs`) | 11 |
| 13 | Classroom dry run; update DIFFICULTY-REVIEW with real observations | 12 |

## 5. Testing

- Validator (`validateTimeline`) on every timeline — already runs at server start.
- Network: rerun the congested-Wi-Fi profile (2.5 Mbit/s, 6 devices); every clip must be visible
  ≤ 2,5 s after release.
- Devices: projector (1920×1080), 1366×768 laptop, 360×800 phone — screenshot each beat.
- Dry run with uninvolved students (§ Validation plan in DIFFICULTY-REVIEW).

## 6. Manual frame-review checklist (per clip)

1. No answer text in any frame (incl. signs, banners, watermarks, English translations).
2. No *later* clue inside an *earlier* clip.
3. First 1.5 s carries no essential information.
4. Baked text ≥ size rules (Bible §4) and readable on a 360 px phone or duplicated natively.
5. Captions match SOURCE-REGISTER wording; reconstructions labelled.
6. Credits present; CC BY-SA adaptations documented like `docs/media-clips.md`.
7. MP4 metadata empty; file name neutral.

## 7. Technical & editorial risks

| Risk | Impact | Mitigation |
|---|---|---|
| Rights: TTXVN prohibits copying without written consent (q04-04, q05-03); Magnum/Ramsden/press photos not openly licensed | Must remove beats | Request permission early; fallbacks are native text/date scenes; keep the game unpublished |
| WTO emblem / Flickr licence unclear | Q5 final beat | Default to masked-quote final hint |
| Clip download on congested Wi-Fi | Clip appears late; first seconds skipped | ≤ 600 KB, 1.5 s handle, interleave native scenes |
| Validator cannot see burned-in text | Answer leak | §6 manual review; overlays in `clips.json` can be text-checked by the build script with `normalizeAnswer` |
| Vietnamese diacritics in `drawtext` | Broken glyphs | `text_shaping=1` or pre-rendered PNG text |
| Live statistics change (WTO members, World Bank page) | Outdated facts | Record access date; recheck before each semester |
| Cross-round leakage (NQ10 title in Q3, "1986" in Q1/Q6) | Spoils later rounds | Cross-round checks in DIFFICULTY-REVIEW |
| `▢` glyph missing on some phones | Masked phrase unreadable | Test; fallback `_ _ _` |
| Over-difficulty (no team answers) | Frustration | Dry run; adjust beat order, not facts |

## 8. Items requiring approval before video production

See the final report and each storyboard; summarised:

- **A1** Overall concept, 10–11 beats per round, mixed clip/native structure.
- **A2** Masked-phrase final beats (Q1, Q3, Q4, Q5) — acceptable "near-decisive" hints?
- **A3** TTXVN material (q04-04, q05-03): seek written permission, or replace with text beats?
- **A4** q05-02 (WTO Flickr) licence check; credit wording without "WTO".
- **A5** WTO emblem: use (with approval) or keep the masked quote only?
- **A6** Q3-B5 comparison-table wording (lecturer review).
- **A7** Use of non-Vietnamese conceptual images (q06-01 USA, q06-02 Mumbai, Rochdale).
- **A8** Hồ Chí Minh quote in Q2 — only if verified in *Toàn tập*.
- **A9** Silent clips (no audio) for M3.2.
- **A10** Asset decisions (REMOVE q03-02; REPLACE q01-03, q01-04, q05-01, q06-02).
