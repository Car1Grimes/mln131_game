# Q2 production pilot — review package (M3.2, final)

> Contains the canonical answer (docs only — never imported by client code).
> Branch `feat/m3-media-production`, based on `c263719` (M3.1 rev. 2).
> All measurements: one Mac (Apple Silicon, macOS, Node 23.10, Chrome 155), 2026-10-19, with the
> repository's E2E harness. **Safari/iOS and real classroom Wi-Fi were not tested** — manual tests.

## Approval status

Approved by the reviewer (2026-10-19): c04 at ≈ 816–823 KB as a documented exception; the five
editorial departures (§1); decisive native clue at 45–50 s; recap 50–60 s; silent clips.
Added in finalisation: phone legibility ≥ 16 px (§5), opening-photo rights recheck (§3).

## 1. Montage and timeline (exactly 60 s)

| Scene | At | Kind | Content | Asset |
|---|---|---|---|---|
| a1 | 0 s | video 5 s | Petrograd crowd, winter 1917 (pull-out) · "Mùa đông · một thủ đô phương Bắc" | c02 `r4t8k1mz` |
| a2 | 5 s | date | `1917` · Chiến tranh thế giới đang ở năm thứ tư | native |
| a3 | 10 s | video 6 s | Calendars: 23 tháng 2 (lịch cũ) = 8 tháng 3 (lịch mới) "Petrograd: biểu tình nổ ra" → 2/3 = 15/3 "Petrograd: Sa hoàng thoái vị" | c03 `p9w2c6xe` |
| a4 | 16 s | video 6 s | Palace Square "xuân 1917" → Nevsky "4/7 lịch cũ = 17/7 lịch mới · Nevsky, 1917: biểu tình bị bắn" | c04 `h3n7d5qy` |
| a5 | 22 s | text-card | Petrograd, 1917 (theo lịch cũ): Tháng Hai… Tháng Bảy… Còn một lần nữa… | native |
| a6 | 27 s | date | `6–7/11/1917` · Theo lịch mới · một đêm khởi nghĩa ở Petrograd | native |
| a7 | 33 s | video 6 s | Locator (Petrograd, sông Neva) → Aurora [ẢNH NĂM 2013] "Tối 25/10 lịch cũ = 7/11 lịch mới · Aurora bắn phát súng hiệu" → Winter Palace interior "Sáng 26/10 lịch cũ = 8/11 lịch mới · Cung điện Mùa Đông đã bị chiếm" | c05 `b8j1f4vu` |
| a8 | 39 s | text-card | 26/10/1917 (lịch cũ) = 8/11 (lịch mới) · Hai sắc lệnh đầu tiên… | native |
| **a9** | **45 s** | **date (decisive, native)** | `25/10/1917` · Ngày khởi nghĩa theo lịch Nga thời đó — sự kiện mang tên tháng này | native |
| a10 | 50 s (10 s) | video 7 s + hold | Recap: timeline 23/2 · 4/7 · 25/10 (lịch cũ) with released photos → 1957 USSR stamp | c06 `x2m6s9ka` |

### Approved editorial departures from the rev. 2 storyboard

1. B3: no Nicholas II portrait (the only candidate is a 1927 painting, not a photograph).
2. B4: Palace Square (spring 1917) before the July photo — chronological, and keeps the essential
   July caption ≈ 3 s on late-loading devices.
3. B3 captions "Petrograd: biểu tình nổ ra" / "Petrograd: Sa hoàng thoái vị" (S-Q2-01).
4. B10 recap uses the timeline template (dates already shown) before the stamp.
5. B1 source: the plate from Stinton Jones' 1917 book instead of the Znamensky Square photo.

Finalisation wording changes (legibility, no content change): dates now read "4/7 lịch cũ = 17/7
lịch mới" (no parentheses, same explicit labels); "Quảng trường Cung điện, xuân 1917"; "Aurora bắn
phát súng hiệu"; "Cung điện Mùa Đông đã bị chiếm"; credits shortened to fit one phone line where
text sits low (c03, c06).

## 2. Pipeline, manifests, templates

`media/q2/manifest.json` (timeline, clips, `sourceRules`, `leakPolicy`, `legibility`) ·
`media/sources.json` + `media/sources.lock.json` · `media/templates/stage.html` (photo pan/zoom,
two-calendar date reveal, date reveal, animated timeline, locator map, caption band, status chip,
cross-fade) · `scripts/media/` (`fetch-sources`, `build-clips`, `validate-media`,
`review-frames`, `map`) · instructions: [docs/media-production.md](../media-production.md).

## 3. Sources, licences and rights uncertainties

| Source | Creator | Date | Original | Licence / evidence | Used in | Changes | In-game credit |
|---|---|---|---|---|---|---|---|
| Plate "Soldiers with Red Flags Leading an Immense Crowd in the Nevsky Prospect" | **photographer unknown**; book by Stinton Jones | taken Feb/Mar 1917 (O.S.); **published London 1917** (Herbert Jenkins Ltd, © MCMXVII), plate facing p. 136 | 2236×1384 (Commons scan of archive.org `russiainrevolut00jone`, UBC Library) | **PD in the US** (pub. 1917; Commons {{PD-US}}). Other jurisdictions **not verified** — see below | c02, c03 (blurred bg), c06 thumb | crop/zoom, blur+darken, thumbnail, caption | "Ảnh in trong sách của S. Jones, London 1917" |
| Nevsky Prospekt, July Days | Viktor Bulla (†1938) | 4/7/1917 lịch cũ = 17/7 | 1828×1188 | PD ({{PD-old-auto-expired}}, deathyear 1938) | c04, c06 thumb | crop/pan, caption | "V. Bulla" |
| May Day at the Winter Palace | Karl Bulla / Museovirasto | 1917 | 6194×4703 TIFF (2560 px rendition) | CC BY 4.0 (Commons {{CC-BY-4.0}}; finna.fi record) | c04 | crop/pan, caption | "K. Bulla/Museovirasto CC BY 4.0" |
| Cruiser Aurora | Florstein (WikiPhoto.Space) | 13/7/2013 | 3700×2451 | CC BY-SA 4.0 (Commons metadata) | c05 | crop/zoom, chip, caption → **c05 is CC BY-SA 4.0** | "Florstein 2013 CC BY-SA 4.0" |
| Winter Palace after the seizure | Yakov Steinberg | 26/10/1917 lịch cũ = 8/11 | 781×600 | PD ({{PD-Russia-expired}}) | c05, c06 thumb | contain 0.9× (no upscaling), backdrop, caption | "Steinberg" |
| USSR stamp 1957 | Post of the USSR (after P. Otsup) | 1957 | 1764×1252 | PD ({{PD-RU-exempt|type=stamps}}) | c06 (≥ 54 s) | contain, slow zoom, caption | "tem Liên Xô 1957" |
| Land polygons 1:50m | Natural Earth v5.1.2 | — | GeoJSON | Public domain (terms of use) | c05 | projection, styling | "bản đồ Natural Earth" |
| Be Vietnam Pro | Be Vietnam Pro Project Authors | — | TTF | SIL OFL 1.1 | baked text | none | — |

**Opening photo — rights analysis (unresolved points documented, not asserted as worldwide PD):**
- **US:** public domain (published 1917) — verified by the publication date.
- **UK (first publication):** probably expired — 1911-Act photographs: 50 years from the negative
  (pre-1957 photos keep that term); unknown authorship: 70 years from making available (1987).
  Residual uncertainty if the photographer were ever identified (EU-term revival rules).
- **Russia (where taken):** not relied on.
- **Vietnam (place of use):** 75 years from first publication for photographic works → expired
  1992, assuming Vietnamese term rules govern (not legal advice).
- The in-game credit was changed to no longer say "phạm vi công cộng" for this photo.
Full record: `media/sources.json` (`rightsAnalysis`).

**Attribution gap (blocker for public distribution, not for classroom use):** the game has **no
post-round credits screen**. Attribution is shown in-round with every clip (scene `credit` field,
readable on phones) and completely in the repository (`media/sources.json`, `docs/media-clips.md`).
CC BY / BY-SA attribution in-round is concise (author + licence); a post-round "Nguồn hình ảnh"
screen with source URLs and licence links is recommended before any public release (UI change —
needs approval).

## 4. Build, validation, reproducibility

Tools: FFmpeg 6.0 (`ffmpeg-static@5.2.0`), FFprobe 4.4, Chrome 155.0.8059.80 (software
rasterisation), Node 23.10. Exact commands: `media/q2/build-report.json`.

| Clip | Frames | CRF | Size | CRF ladder (KB) | sha256 |
|---|---|---|---|---|---|
| c02 | 120 | 28 | 594 KB | 24: 895 · 26: 726 · 28: 594 | `1fbb29a95ca74d579bd51c4bb2276f8304ce65c641b60e1f893c6ddef60e6473` |
| c03 | 144 | 24 | 205 KB | 24: 205 | `6e4cf98f74ed766903b84b0bd0d6214aa18aed2302d78cd92133281cb4fcb6ac` |
| c04 | 144 | 30 | **816 KB** ⚠️ | 24: 1345 · 26: 1141 · 28: 967 · 30: 816 | `383fc944340a709e3bb196be2227870818d341d81b42011e686d4429fbb9363d` |
| c05 | 144 | 28 | 534 KB | 24: 804 · 26: 654 · 28: 534 | `3a4cb5ef476bb6fb8782f54e64d03ae9e4f2154de727ea2c8c0a0e0182143983` |
| c06 | 168 | 30 | 497 KB | 24: 927 · 26: 749 · 28: 606 · 30: 497 | `6338f5665b9fb32bb74ade76f0f24d8002e0e7b6c6fd25c1ce0f6d5c3dae14c8` |
| Round | | | **2.59 MB** (≤ 3.5 MB) | | |

- **Reproducibility:** two complete clean builds → identical sha256 for all five clips.
- **Validator:** 83 pass · 1 warn (c04 size, approved exception) · 0 fail — timeline sync, engine
  validation, exact answers of all 6 questions, semantic leak terms before 45 s, visible source
  text by time, source timing, sha256 pins, credits + CC licences, format/metadata/faststart,
  registry, `dist/`, **legibility** (new).
- **c04 exception:** detailed grainy 1917 prints; CRF 30 is the readability floor. Observed
  arrival on the 2.5 Mbit/s profile: **2.83–3.00 s** (median 2.91 s) vs 0.84–2.19 s for the other
  clips; single client: 6.7 s at 1 Mbit/s, 3.4 s at 2, 1.3 s at 5, 0.7 s at 10 Mbit/s. Mitigation:
  the essential July caption is in the second half of the clip (visible ≈ 3 s on late devices).

## 5. Phone typography (measured)

- Rendered scene stage on a 360×740 phone: **336 px** wide (measured in the E2E run; scale 0.35).
- Rule (build-enforced): every essential burned-in text ≥ **16 CSS px** at that size, inside the
  frame, and above y = 420 (clear of the game's credit line).
- Result: all essential text is **48 px at 960×540 = 16.8 CSS px on the phone** (captions, date
  lines, status chip, calendar labels and months, map labels, timeline dates and labels); calendar
  day numbers 120 px (42 px on phone). Samples measured: c02 3 · c03 42 · c04 8 · c05 14 · c06 25;
  lowest essential text bottom: 382 (c03), 390 (c06).
- Captions sit at the top of the frame; long dates were rewritten compactly instead of shrinking.
- Contact sheet at real phone size: [q2-clips-phone.jpg](q2-clips-phone.jpg).

## 6. Manual frame-by-frame review (final clips)

Sheets: [q2-clips.jpg](q2-clips.jpg) (every shot and caption cue), [q2-clips-phone.jpg](q2-clips-phone.jpg)
(336 px), [q2-round.jpg](q2-round.jpg) (live projector + phone, whole round).

- **No answer or giveaway before round closure:** no "cách mạng", "tháng Mười", "October",
  translation or abbreviation in any frame, caption, credit or label before 45 s; Cyrillic
  "ОКТЯБРЯ" only on the stamp in the recap (≥ 54 s; partly covered by the caption; supplementary).
  Unrelated visible text: "Ростелеком" sign behind the Aurora; May Day banner illegible.
- **No hidden future clue in an early clip:** c02 contains only the opening photo; c03 only that
  photo (blurred) + graphics; c04 May/July; c05 map/Aurora/palace; c06 only released material +
  stamp (validator `sources` rules + visual check).
- **Julian/Gregorian:** 23/2 = 8/3, 2/3 = 15/3, 4/7 = 17/7, 25/10 = 7/11, 26/10 = 8/11 (13-day
  offset in 1917), every pair labelled lịch cũ / lịch mới; native cards a6, a8, a9 consistent.
- **Labels:** the 2013 Aurora photo carries "ẢNH NĂM 2013"; all other photographs are 1917
  originals (no reconstruction); the Winter Palace photo caption matches its archive description.
- **Attributions:** each clip's in-round credit names every source (validator) and CC licences;
  see §3 for the post-round gap.

## 7. Timing / bandwidth (final run, `HC_QUESTION=2`, 1 admin + 5 teams + projector)

| Metric | Run A — LAN | Run B — congested Wi-Fi + incidents |
|---|---|---|
| Server release → client receipt (median / max) | 41 / 568 ms¹ | 115 / 150 ms |
| Server release → scene visible (median / max) | 21 / 1318 ms¹ | 137 / 3118 ms² |
| Clip download median: c02 / c03 / c04 / c05 / c06 | 83 / 52 / 86 / 299 / 28 ms | 2.15 / 0.87 / **2.91** / 2.00 / 1.81 s |
| Video drift vs server timeline (median / max) | 145 / 342 ms (n = 58) | 91 / 273 ms (n = 4)³ |
| Countdown vs server deadline | ≤ 1 s | ≤ 1 s |
| Scene spread between clients (median / max) | 22 / 552 ms¹ | 62 / 163 ms |
| Redundant media fetches · clips fetched before release | 0 · none | 0 · none |
| Reconnect after abrupt cut · projector catch-up after 11 s frozen tab | – | 1.8 s · 3 ms |

¹ This LAN run had outliers while the machine was busy (it ran right after two full software-
rendered builds); four earlier LAN runs had max receipt 19–151 ms and max visible 107–296 ms.
² = download time of the largest clip (c04); the previous scene stays visible meanwhile.
³ Few samples on Wi-Fi (most instants fell during downloads or on deliberately impaired devices).
Drift < 350 ms is within the player's correction threshold.

## 8. Regression tests (final artefacts)

| Command | Result |
|---|---|
| `npm test` | 152 / 152 |
| `npm run typecheck` | pass |
| `npm run build` (incl. `check-bundle`) | pass — "3 files, 6 answers, no leaks" |
| `npm run e2e` (multiplayer · scenes · projector) | 31/31 · 29/29 · 40/40 |
| `npm run e2e:resilience` (Q4) | 27 / 27 |
| `npm run e2e:restart` | 20 / 20 |
| `HC_QUESTION=2 node e2e/resilience.mjs` | 30 / 30 (incl. phone stage ≥ 336 px) |
| `validate-media.mjs` (Q2) | 83 pass · 1 warn · 0 fail |

Harness-only changes: `e2e/resilience.mjs` parameterised by `HC_QUESTION` (Q4 default), new checks
(media 401/403/200, no early fetch, no answer in page text / state frames before the deadline,
no results before 60 s, phone stage width), per-clip metrics; fixed two pre-existing harness bugs
(`netproxy` chunk reordering; socket reuse in the bandwidth measurement).

## 9. Remaining risks and blockers

| Item | Severity | Status |
|---|---|---|
| No post-round credits screen (full CC attribution with links) | blocker for public distribution only | needs a UI change + approval |
| Opening photo: photographer unknown; PD verified for the US only | low residual | documented in `media/sources.json` |
| c04 816 KB (≈ 2.9 s on 2.5 Mbit/s; 6.7 s at 1 Mbit/s) | accepted exception | documented |
| Safari/iOS playback, autoplay, object URLs | unknown | manual test required |
| Real classroom Wi-Fi (shared AP) | unknown | manual test required |
| Wikimedia rate limits on re-fetch (10-minute Retry-After seen) | operational | sha256 pins; keep `media-src/` |
| Bit-reproducibility tied to Chrome + FFmpeg versions | operational | versions recorded |

## 10. Proposed changes before producing Q4 and Q6

1. Keep the build-enforced legibility rule (≥ 16 px at 336 px, bottom-safe zone) for all rounds.
2. Validator rule: essential captions visible ≥ 3 s in the window [3 s, clip end] (late loading).
3. Holds + cross-fades rather than continuous zooms on grainy archival photos (size budget).
4. WARN when estimated arrival at 2.5 Mbit/s exceeds 2.2 s.
5. Q6: add a `venn` template; keep the SDG wheel as a native static image (unaltered).
6. Decide on the post-round credits screen before any public release.
