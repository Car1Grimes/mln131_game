# THE HIDDEN CONNECTION — Editorial Bible (M3.1)

> **Status:** DRAFT for human review. Documentation only — no gameplay, scoring, timing or media
> changes. This folder contains canonical answers: it lives in `docs/` and must never be imported
> by client code (the bundle check in `scripts/check-bundle.mjs` guards `src/`; never copy text
> from here into `src/`).

Related: [ASSET-AUDIT](ASSET-AUDIT.md) · [SOURCE-REGISTER](SOURCE-REGISTER.md) ·
[DIFFICULTY-REVIEW](DIFFICULTY-REVIEW.md) · [PRODUCTION-PLAN](PRODUCTION-PLAN.md) · storyboards
[Q01](Q01-BAO-CAP.md) [Q02](Q02-CACH-MANG-THANG-MUOI.md) [Q03](Q03-HOP-TAC-XA.md)
[Q04](Q04-DOI-MOI.md) [Q05](Q05-WTO.md) [Q06](Q06-PHAT-TRIEN-BEN-VUNG.md)

---

## 1. Concept

Each round is a **60-second documentary teaser** — the cold open of a TV history programme —
whose subject is never named. The montage follows one through-line (an object, a place, a year or
an idea) from an atmospheric, ambiguous opening to a near-decisive closing frame. Students watch
the story *converge*; they are rewarded for connecting clues, not for recognising a single
give-away picture.

| Q | Answer (pattern) | Through-line | Narrative shape |
|---|---|---|---|
| 1 | BAO CẤP `3·3` | One ration book through one day in Hà Nội, early 1980s | Daily life → the rules behind it → the name the Party gave the system |
| 2 | CÁCH MẠNG THÁNG MƯỜI `4·4·5·4` | One city, one year, three uprisings (Petrograd 1917) | Feb → Jul → Oct; calendar flip 25/10 → 7/11; link to Việt Nam |
| 3 | HỢP TÁC XÃ `3·3·2` | One shared purse and one raised hand | Rochdale 1844 → the rule "one member, one vote" → Việt Nam 1958 / 1981 / 2023 |
| 4 | ĐỔI MỚI `3·3` | A turning point | Crisis numbers → early "phá rào" → December 1986 → what changed after |
| 5 | WTO `3` | One seat at a 150-member table | 1947 rules → Marrakesh 1994 → Việt Nam's 11-year path → 11/1/2007 |
| 6 | PHÁT TRIỂN BỀN VỮNG `4·5·3·4` | Three circles that must overlap | Growth → people → planet → 1987 definition → 2030 Agenda |

### The letter pattern is a clue that exists from second 0

The player UI shows the answer's **word/letter pattern** (`answerPattern`, `src/components/LetterSlots.tsx`)
during the whole round. Every difficulty decision in this bible assumes students can see it:

- It eliminates many wrong answers for free (e.g. *CÁCH MẠNG THÁNG TÁM* = `4·4·5·3` ≠ `4·4·5·4`).
- It also creates **pattern-compatible traps** that the montage must actively eliminate:
  BAO CẤP ↔ ĐỔI MỚI (both `3·3`), WTO ↔ IMF / FDI / FTA (all `3`),
  PHÁT TRIỂN BỀN VỮNG ↔ PHÁT TRIỂN BAO TRÙM (both `4·5·3·4`), HỢP TÁC XÃ ↔ HỢP TÁC HÓA (`3·3·3`, near-miss).
- Matching is exact after normalisation; **no synonyms** are accepted (`shared/normalize.ts`). So
  for Q3 "HTX" is *not* an accepted answer and "Tổ chức Thương mại Thế giới" is *not* accepted for
  Q5. A clue that leads students to the right concept but the wrong wording is a failed clue — the
  closing frames must point at the exact canonical wording (see each storyboard's final beat).

---

## 2. Engine constraints → editorial rules

| Engine fact (code) | Editorial consequence |
|---|---|
| Server releases each scene at `at` ms; clients never get future scenes (`shared/scenes.ts`) | A **video asset is released whole**. Anything inside a clip can be downloaded the moment the clip's scene is released. **Never put a later, easier clue inside an earlier clip.** Split the 60 s montage into several short clips; each clip contains only material of its own time window. |
| Media is fetched after release, no preloading; previous scene stays until the new one is ready | Each clip must download fast (see §7). Native text/date/statistic scenes cost no bandwidth: alternate them with clips so slow devices catch up. |
| Video position is aligned to server time (`videoPositionMs`) | A device that finishes loading 1.5 s late **skips the first 1.5 s**. Rule: the first 1.5 s of every clip is an "establishing handle" with no essential information. |
| Players are always muted; projector audio only after an explicit click | **No information may depend on audio.** |
| Validator rejects any text field containing the normalised answer (`server/scenes/validate.ts`) | Captions, credits, statistic labels and **sources** must not contain the answer — including inside publication titles (e.g. a source titled "…thời bao cấp…" fails for Q1; a credit "© WTO" fails for Q5; "Liên minh Hợp tác xã Việt Nam" fails for Q3 → write "Liên minh HTX Việt Nam"). |
| The validator cannot read text burned into video frames | Every clip needs a **manual frame review** for answer text (checklist in PRODUCTION-PLAN §6). |
| Native image scenes are static `object-fit: contain`, transitions 0.6 s (`cut/fade/slide/zoom`) | Pans, zooms, maps, animated timelines and comparisons must be **baked into clips**. Native image scenes are for photos that must be read carefully (e.g. a document). |
| Scene ids and asset ids are neutral | Clip file names `cNN.mp4`, opaque asset ids, `-map_metadata -1` (no title/comment metadata in MP4s). |

### Two kinds of "cut"

- **Media cut** — a cut/dissolve *inside* one clip (e.g. a crop of a photo → a map). Players receive
  it as part of the same asset. Use only between beats that are equally "easy".
- **Scene** — a separate server-released `Scene` (video, image, text-card, date, statistic).
  Every step up in difficulty must be a new Scene.

Each storyboard marks every beat as **SCENE** (new server release) or **CUT** (inside the current clip).

---

## 3. Design language

Documentary, restrained, archival. The archive material is the star; graphics frame it.

- **Palette** (matches the existing app tokens in `src/styles.css`): night navy background
  `#050a17`, ink white, accent cyan (`--cyan`) for dates and numbers, a warm amber for
  "archive / old calendar" labels, and red used only for a single highlight per round.
- **Archival treatment:** keep photos' original tone; no fake sepia, no artificial scratches,
  no colourising of B&W photos. A subtle 4 % vignette is allowed. Never "restore" faces.
- **Reconstructions are labelled** on screen ("tái hiện tại bảo tàng", "ảnh chụp năm 2013").
- **Maps:** flat, neutral, Natural Earth–derived outlines (public domain), no political
  annotations beyond place dots and labels. Vietnamese maps must show Hoàng Sa and Trường Sa if
  the area is in frame — simplest rule: **do not use maps that frame the East Sea**; use dot-only
  world locators or city dots.
- **No AI-generated "historical" imagery.** Illustrative motion graphics (icons, diagrams,
  counters) are allowed and must look like graphics, never like photos.

## 4. Typography

Two families, both already used by the app: the display face (`--font-display`) for titles,
numbers and dates; the body face for captions. Both must render full Vietnamese diacritics; for
baked-in text in clips use **Be Vietnam Pro** (OFL, free) — verify glyph coverage of ư, ơ, ẫ, ỵ.

| Element | Native scene (CSS) | Baked into a 960×540 clip |
|---|---|---|
| Headline / date | Existing `.scene-date-value`, `.scene-text-body` | ≥ 54 px cap height (10 % of frame), max 1 line |
| Supporting line | `.scene-text-heading` / label | ≥ 32 px, max 1 line, ≤ 45 characters |
| Caption / place-date strap | `.scene-caption` | ≥ 26 px, lower-left, on 70 % navy band |
| Credit | `.scene-credit` | ≥ 18 px, lower-right (projector only legibility is acceptable) |

**Phone rule:** the stage on a 360 px-wide phone is ≈ 200 px tall. Anything a student must *read*
goes into a native text/date/statistic scene (responsive CSS), not into video pixels. Baked text is
limited to short straps (place · year) that are also legible at that size (≥ 10 % frame height for
the essential word).

**Copy rules:** Vietnamese, sentence case, ≤ 18 words per card, ≤ 45 characters per baked line,
no exclamation marks, numbers in Vietnamese format (`1.129`, `774,7 %`, dates `dd/mm/yyyy`). Quotes
≤ 25 words, always attributed. Masked words use letter boxes `▢▢▢` matching the answer's pattern
only in the final beat.

## 5. Motion style

- **Camera on stills:** slow Ken Burns, ≤ 1.15× zoom over 5–6 s, one direction per shot,
  movement *towards* the clue detail (a sign, a date, a face). No zoom on a face beyond its
  original resolution (max upscale 1.0× of the source pixels at 960×540 output).
- **Reveal grammar:** detail-first → context. Start tight on an ambiguous detail, pull out to
  reveal what it belongs to. This is how difficulty is staged *inside* one clip without leaking
  a later clue (the full photo is still inside the clip, so the "pull out" must itself belong to
  the clip's difficulty band).
- **Graphics:** line draws (0.4 s), counters (≤ 1.5 s count-up), timeline ticks sliding
  left-to-right, circles that grow from centre. Easing: ease-out cubic. No bounce, no spin.
- **Transitions:** within clips — 8–12-frame dissolves or hard cuts on motion; between Scenes —
  the engine's `cut / fade / slide / zoom`. Use `cut` for rhythm shocks (a number), `fade` for
  time jumps, `slide` for "meanwhile / next", `zoom` for the final hint.
- **Rhythm:** a visual change every 4–7 s (average ≥ 10 changes / minute), never > 8 s static.

## 6. Scene pacing & difficulty progression

| Window | Role | Typical content | Visual tempo |
|---|---|---|---|
| 00–15 s | Atmosphere, ambiguity: ≥ 3 plausible interpretations | Details, crops, textures, a year without context | Slower, 5–6 s shots |
| 15–30 s | Distinctive context and relationships | Places, dates, first relationship between two clues | 4–6 s |
| 30–45 s | Convergence — an attentive student starts recognising it | Defining mechanism, decisive date, comparison | 4–5 s |
| 45–55 s | Strong, identifiable clues | Official terminology (not the answer), the emblematic object | 4–5 s |
| 55–60 s | Near-decisive final hint | A masked phrase with the answer's pattern, an emblem, a definition | One 5 s beat, `zoom` transition |

Every storyboard lists ≥ 3 wrong answers likely before 30 s and the beat that eliminates each.

## 7. Technical media budget (summary — details in PRODUCTION-PLAN)

- Clips: 960×540, 24 fps, H.264 Main, yuv420p, no audio track, `+faststart`, keyframe every 1 s.
- **≤ 600 KB per clip** (≈ 2 s download at 2.5 Mbit/s, the congested-Wi-Fi profile in
  `docs/network-resilience.md`). In practice: photographic Ken Burns clips ≤ 6–7 s; flat
  motion-graphic clips (timelines, Venn, tables) ≤ 10 s. Per-round total ≤ 3.5 MB.
- Max 5 clips per round; the rest are native scenes.

## 8. Rules for historical evidence

1. **Every on-screen fact** (date, figure, quotation, label, photo caption) has an entry in
   [SOURCE-REGISTER](SOURCE-REGISTER.md) with status `VERIFIED` before it is produced. `PARTIAL`
   items need a second source or must be reworded to what the source actually says.
   `UNVERIFIED` items are not produced.
2. **Prefer** official/primary sources (Party document archive, government legal texts, WTO,
   UN), museums and archives, recognised scholarship; news only as support.
3. **Photo captions say only what the source says.** If the year is uncertain, caption the
   decade or "ảnh tư liệu, không rõ năm". Never caption a 1917 crowd as "October" unless the
   archive dates it 25–26 Oct 1917 (O.S.).
4. **Calendars:** Russian 1917 dates are given Old Style first, then New Style:
   "25/10 (7/11/1917)". Explain the 13-day difference once per round.
5. **Reconstructions vs originals:** museum reconstructions, modern photos of historic objects,
   re-enactments and film stills are labelled as such.
6. **No invented statistics, no invented quotations**, no paraphrase presented as a quote. A
   paraphrase is shown without quotation marks.
7. **Distinguish dates of process steps:** approval vs signature vs entry into force (Q5),
   Congress date vs policy implementation (Q4), law passed vs law in force (Q3).
8. **Concept accuracy over mood:** Q1 is a *mechanism*, not "poverty"; Q3 is an *organisation
   type*, not "working together"; Q6 is *three dimensions*, not "green".

## 9. Audio strategy

- Clips are encoded **without audio** (smaller, no autoplay problems, no muted/unmuted drift).
- The projector may later get an optional room-music bed played by the host outside the game
  (not in scope). Nothing in the montage depends on sound.
- If audio is added in a later milestone it must be: one continuous bed per round (not per clip,
  because clips start at server times and would stutter), −23 LUFS, licence-clean, and the
  montage must remain fully understandable muted.

## 10. Reusable visual templates

| ID | Template | Kind | Use |
|---|---|---|---|
| T1 | **Archive push** — still photo, Ken Burns towards a detail, place·year strap | clip | most photo beats |
| T2 | **Detail → reveal** — tight crop dissolves to full frame | clip (one band only) | openings |
| T3 | **Date stamp** — big date, one-line label | native `date` | turning points |
| T4 | **Figure** — big number, label, source | native `statistic` | sourced statistics only |
| T5 | **Headline card** — heading + ≤ 18-word sentence | native `text-card` | context, definitions |
| T6 | **Timeline rail** — horizontal year rail, ticks appear, a cursor travels | clip | Q2, Q4, Q5 |
| T7 | **Split compare** — left/right panels with labels, wipe between | clip | before/after, entity comparison (Q3, Q4) |
| T8 | **Locator** — world/region dot map, city dot pulses, label | clip | Petrograd, Rochdale, Genève, Marrakesh |
| T9 | **Venn build** — three circles appear one by one, centre empty | clip | Q6 |
| T10 | **Masked phrase** — sourced phrase with answer replaced by letter boxes | native `text-card` (boxes as characters `▢`) | final hints Q1, Q3, Q4 |

**Masked phrase rule (T10):** the phrase must be a real, sourced phrase; the boxes must match the
answer's letter pattern exactly; the visible part must not contain the answer.
