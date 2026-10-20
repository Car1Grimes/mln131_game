# Q5 production — review package (M3.2-C2)

> Contains the canonical answer (docs only — never imported by client code).
> Branch `feat/m3-q5-production` from `5ee93eb`. Final review corrections (2026-10-20) in §10.
> Measurements: one Mac (Apple Silicon, macOS, Node 23.10, Chrome 155), 2026-10-20, repository E2E
> harness. Safari/iOS and real classroom Wi-Fi were **not** tested.

## 1. Montage (60 s)

| Scene | At | Kind | Content | Asset |
|---|---|---|---|---|
| f1 | 0 s | video 5 s | Rice drying on a Mekong-delta roadside (3.1 s) → coffee beans drying near Đà Lạt — no text | c22 `h8w3n5rk` |
| f2 | 5 s | text-card | Mỗi lô hàng vượt biên giới · đều cần những luật chơi chung giữa các quốc gia. | native |
| f3 | 10 s | date | `30/10/1947` · 23 bên ký một hiệp định chung về thuế quan và thương mại | native |
| f4 | 16 s | video 7 s | Land-only locator "Marrakesh · Ma-rốc" → own card `15/4/1994` · Marrakesh, Ma-rốc · Lễ ký khép lại Vòng đàm phán Uruguay (bắt đầu từ 9/1986) | c23 `p2f7d9xs` |
| f5 | 23 s | date | `1/1/1995` · Một tổ chức mới chính thức hoạt động — trụ sở tại Genève | native |
| f6 | 28 s | date | `4/1/1995` · Đơn xin gia nhập của Việt Nam được tiếp nhận — chỉ vài ngày sau khi tổ chức ra đời | native |
| f7 | 33 s | video 6 s | "Hai mốc Việt Nam – Hoa Kỳ": `13/7/2000` ký hiệp định thương mại · `31/5/2006` ký thỏa thuận mở cửa thị trường → `7/1998 – 10/2006` · 14 phiên họp Ban công tác · hơn 11 năm chuẩn bị gia nhập | c24 `k4j6v1mt` |
| f8 | 39 s | date | `7/11/2006` · Đại hội đồng của tổ chức chấp thuận cho Việt Nam gia nhập | native |
| **f9** | **45 s** | **text-card (decisive)** | Trích thông cáo báo chí 7/11/2006 (đã che tên) · "Viet Nam will become the ▢▢▢'s 150th member…" — Việt Nam trở thành thành viên thứ 150 của ▢▢▢ ngày 11/1/2007. | native |
| f10 | 50 s (10 s) | video 7 s + hold | Recap: rice photo → `1947` 23 bên ký hiệp định → `1994` Marrakesh → `1995 → 2007` Việt Nam · thành viên thứ 150 → world land map, ring on Việt Nam, "Năm 2026: 166 thành viên" (non-essential) | c25 `r9e2y7gc` |

Chronology on screen: GATT signed 1947 (f3) → Marrakesh signing 1994 (f4) → organisation operating
1/1/1995 (f5) → Việt Nam's application received 4/1/1995 (f6) → approval 7/11/2006 (f8, "chấp thuận",
no membership claim) → membership 11/1/2007 (f9, the only membership date). Nothing states or implies
membership on 7/11/2006; f9 shows the approval date as the press-release date and 11/1/2007 as the
membership date.

## 2. Fact verification (primary sources, read 2026-10-20)

wto.org pages blocked the web-fetch tool (HTTP 402) and were read directly with curl.

| Claim (screen) | Source | Passage | Result |
|---|---|---|---|
| 30/10/1947, 23 parties (f3) | WTO, *Understanding the WTO* fact4 | "The group had expanded to 23 by the time the deal was signed on 30 October 1947 … 23 founding members (officially 'contracting parties')" | VERIFIED |
| 15/4/1994 Marrakesh; Uruguay Round launched 9/1986 (c23) | WTO fact5 | "On 15 April 1994, the deal was signed by ministers from most of the 123 participating governments at a meeting in Marrakesh, Morocco"; "They did so in September 1986, in Punta del Este" | VERIFIED |
| 1/1/1995, Geneva (f5) | WTO *Who we are* fact file | "Location: Geneva, Switzerland · Established: 1 January 1995 · Created by: Uruguay Round negotiations (1986-94)" | VERIFIED |
| Application 4/1/1995 (f6) | WTO accession page, Viet Nam | "Application received 04/01/1995 WT/L/1" | VERIFIED — wording changed to "được tiếp nhận" (received), see §5 |
| BTA signed 13/7/2000 (c24) | US Federal Register 66 FR 31407 (proclamation, 12/6/2001) | "…was signed on July 13, 2000, by duly empowered representatives…" | VERIFIED (was PARTIAL) |
| US bilateral market-access agreement 31/5/2006 (c24) | USTR press release 31/5/2006 | "05/31/2006 Ho Chi Minh City – … today formally signed a bilateral market access agreement that is required as part of Vietnam's bid to accede…" | VERIFIED; "final" **not** stated → dropped |
| 14 Working Party meetings 7/1998–10/2006; "over 11 years of preparation" (c24) | Press/455 | "The decision ends over 11 years of preparation … met 14 times between July 1998 and October 2006" | VERIFIED |
| Approval 7/11/2006 (f8) | Press/455 | "The General Council approved Viet Nam's membership on 7 November 2006." | VERIFIED |
| Excerpt (f9) | Press/455 | "Viet Nam will become the WTO’s 150th member 30 days after it has informed the WTO that it has ratified the accession package domestically." | VERIFIED. Shown as a **redacted excerpt**, not a verbatim quotation: organisation name → three boxes, text after "member" elided (…), straight apostrophe; heading says "Trích … (đã che tên)" |
| 150th member, 11/1/2007 (f9) | WTO accession page | "Viet Nam became the WTO's 150th member on 11 January 2007"; notification 12/12/2006 (WT/LET/552) | VERIFIED |
| 166 members in 2026 (c25) | **WTO Annual Report 2026** (9/9/2026, `ar26_e.pdf`); WTO *Who we are*; WTO news 27/7/2026 (Uzbekistan accession still in progress) | AR 2026: "…from the WTO’s 166 members…" (MC14, March 2026); "covering 161 of the WTO’s 166 members" | VERIFIED 2026-10-20; label states its reference year: "Năm 2026: 166 thành viên" |

Omitted as unverified or unnecessary: BTA entry into force (10/12/2001), "28 bilateral partners",
the protocol signing on 7/11/2006, Geneva as the place of the 7/11/2006 meeting (not stated on
Press/455), "final bilateral agreement".

## 3. Rights, sources and reuse conditions

| Source | Creator | Licence (evidence) | Used | Reuse conditions |
|---|---|---|---|---|
| Roadside rice drying, Long Xuyên area, 10/12/2011 | Jean-Pierre Dalbéra | CC BY 2.0 (`{{cc-by-2.0}}` + flickrreview 2013-02-15) | c22, c25 | attribution (author, title/source URL, licence link), indicate changes |
| Coffee beans drying near Đà Lạt, 2015 | P. Hughes (User:Indies1) | CC BY 4.0 (`{{self\|cc-by-4.0}}`) | c22 | same; cropped so a child (T-shirt "SURF") and a house number are out of frame |
| Natural Earth 1:50m land | Natural Earth | Public domain | c23, c25 | none (credited) |
| Be Vietnam Pro | Be Vietnam Pro Project Authors | SIL OFL 1.1 | all | none for rendered output |
| **q05-02** Marrakesh 1994 | © WTO (Flickr stream) | CC BY-SA 2.0 — Commons wikitext re-read 2026-10-20; Flickr page 2026-10-20 shows `creativecommons.org/licenses/by-sa/2.0` | **not used — replaced** | attribution must name "World Trade Organization"/"© WTO" (would reveal the answer in-round; no post-round credits UI yet); share-alike; indicate changes; the Commons description additionally asks that "the WTO is informed" — **no notification sent** (not needed while unused; not sent without approval) |
| q05-03 TTXVN 7/11/2006 | TTXVN | written permission required | not used | — |
| q05-04 official emblem | WTO | protected mark | not used | — |

**q05-02 decision:** replaced by the approved native fallback (c23: locator + `15/4/1994` date card).
No alternative image was staged. Licence records: `media/sources.json`, `media/sources.lock.json`
(sha256 pins, access date 2026-10-20), `docs/media-clips.md`, SOURCE-REGISTER S-Q5-13/14.

## 4. Builds, hashes, validation

| Clip | Dur | CRF | Size (bytes) | Size | sha256 |
|---|---|---|---|---|---|
| c22 | 5 s | 30 | 557 114 | 544 KB | `67eba4ae2d5b64cbf68f6ce417bce55e65bd6a10d069a50e525a6ca56d9c9e4c` |
| c23 | 7 s | 24 | 214 980 | 210 KB | `ba7b8f9b2f37dad514ba2dd9141885949c02c39e7f604164db2c73a6123d3e04` |
| c24 | 6 s | 24 | 238 256 | 233 KB | `ce4b55b6a497bdcc2292e8878391aaaf0f51195f1ab2c9284d82b5db457bb5a4` |
| c25 | 7 s | 24 | 468 343 | 457 KB | `6f561da32c78bfc43ccf00ec3e5d4c38879e072933264963e4c83abd021ddb86` |

Round total 1 478 693 bytes (1.41 MB). All clips ≤ 600 KB: H.264 Main, yuv420p, 960×540, 24 fps, no
audio stream, no metadata tags, x264 SEI removed, faststart. Max source scale 0.70 (no upscaling).
c22 first came out at 705 KB (moving photos), then 617 KB; fitted by holding both photos static and
giving the costly coffee texture 2.2 s instead of 2.6 s — never above CRF 30.

- **Reproducibility:** all four clips built twice from scratch — identical (`media/q5/repro-report.json`).
- **Validator Q5:** 80 pass / 0 warn / 0 fail. Leak terms checked for the **whole round** (until
  60 000 ms, recap included): W.T.O, W T O, World Trade Organization/Organisation, "world trade",
  Organisation mondiale du commerce, Organización Mundial del Comercio, Tổ chức Thương mại Thế giới,
  "thương mại thế giới", OMC — plus every question's exact answer. One late-arrival exemption: the
  recap's "Năm 2026: 166 thành viên" (undated, non-essential, written reason).
- **Regression validators:** Q2 97 pass / 2 approved warnings, Q3 117, Q4 80, Q6 98 — 0 fail. Q2/Q3/Q4/Q6
  clips and manifests unchanged (only their validation-report timestamps).
- **Extra byte scan** of c22–c25 and all 130 manifest strings for the acronym (any case), the names in
  four languages and "emblem/logo": no hit in any string or metadata. One 3-byte coincidence "bwTO"
  inside the compressed H.264 payload of c23 (offset 183 570, in `mdat`) — encoded entropy, not
  metadata and not a visible pixel; left as is (see §10 for the NAL-level confirmation).
- **Legibility:** burned-in text 16.8 CSS px on the measured 336 px phone stage (c22 has no text).
  Native scenes measured in Chrome at 360×740: date labels and card heading 16.8 px, decisive card body
  18 px, date values 48 px.

## 5. Editorial deviations from Rev. 2

1. **B1:** export goods are shown *drying* (rice, coffee), not *being packed* — no licence-clean packing
   close-up without printed brand/organisation text was found. Static frames (size budget). No port
   or ship; nothing reused from Q4.
2. **B4:** q05-02 photo replaced by the approved native fallback (locator + date card); the in-round
   photo credit is therefore gone. Text "Lễ ký khép lại Vòng đàm phán Uruguay (bắt đầu từ 9/1986)".
3. **B6:** "Việt Nam nộp đơn" → "Đơn xin gia nhập của Việt Nam được tiếp nhận" (the WTO record states
   *received* 04/01/1995, not the submission date).
4. **B7:** "thỏa thuận song phương cuối cùng" → "ký thỏa thuận mở cửa thị trường" (USTR does not say
   *final*); the counter reads "hơn 11 năm" (Press/455 "over 11 years"), static — no count-up animation,
   so no transient wrong figure ever appears. Order: two US milestones, then 14 meetings / 11 years.
   Credit names "hồ sơ gia nhập" instead of the 7/11/2006 release (no future date at 33 s).
5. **B8:** "Genève ·" dropped from the label (the meeting place is not stated on Press/455).
6. **B10:** member dots lighting up replaced by a land-only world map with a ring on Việt Nam (no
   per-country data, no borders); recap cards re-show only released facts (1947, 1994, 1995→2007/150th).
7. Scene ids f1–f10; clips c22–c25.

## 6. Leakage and future-clue audit (manual, every frame sheet)

Sheets: [q5-clips.jpg](q5-clips.jpg), [q5-clips-phone.jpg](q5-clips-phone.jpg),
[q5-round.jpg](q5-round.jpg) (live projector 1920×1080 + phone 360×740, every scene).

- No acronym, expansion, translation, emblem, watermark or answer-revealing source name in any frame,
  caption, credit, label or source line during the 60 s; the decisive card shows exactly three boxes in
  both languages (glyph renders on projector and phone).
- Clip contents vs release time: c22 (0 s) photos only; c23 (16 s) map + 1994; c24 (33 s) 2000/2006
  milestones + 14 meetings + 11 years; c25 (50 s) recap of released facts + the non-essential 166.
  No clip carries a later clue (validator `sourceRules` + manual check).
- Fixed during the audit: timeline title wrapping into the rail; count-up briefly showing "hơn 10 năm"
  and wrapping; recap label wrapping off-centre; c24 credit naming the 7/11/2006 release before f8.

## 7. Network stress (`HC_QUESTION=5 node e2e/resilience.mjs`; 1 admin, 5 teams incl. 360×740 phone, projector)

| Metric | Run A — LAN | Run B — 2.5 Mbit/s + 60 ms ± 80 ms + incidents |
|---|---|---|
| Checks | 30 / 30 (both runs) | |
| Release → receipt (median / max) | 18 / 95 ms | 107 / 170 ms |
| Release → visible (median / max) | 27 / 153 ms | 107 / 2069 ms |
| Clip download, median per clip | c22 42 · c23 18 · c24 13 · c25 35 ms | c22 1.99 · c23 0.90 · c24 0.99 · c25 1.74 s |
| Video drift (median / max) | 224 / 349 ms | 190 / 309 ms |
| Scene spread between clients (max) | 31 ms | 81 ms |
| Redundant fetches · fetch before release | 0 · none | 0 · none |
| Reconnect after abrupt cut · projector catch-up | — | 2.3 s · 5 ms |

Includes: exact release order, 60 s deadline, results only after 60 s, answer never in page text or
state frames before the deadline, future clip 403 / no session 401 / released 200 (no cross-room or
early media access), refresh + reconnect, offline-across-deadline submission refused. The decisive
clue is native (no download), so it is never late. c22 (≈ 2 s on throttled Wi-Fi) carries no text. Figures from the final run after the §10 corrections.

## 8. Full test results

| Command | Result |
|---|---|
| `npm test` | 152 / 152 |
| `npm run typecheck` | pass |
| `npm run build` | pass — check-bundle "3 files, 6 answers, no leaks" |
| `npm run e2e` (multiplayer · scenes · projector · image fixture) | 31/31 · 30/30 · 40/40 · 16/16 |
| `npm run e2e:restart` | 20 / 20 |
| `HC_QUESTION=5 e2e/resilience.mjs` | 30 / 30 |
| Media validators Q2 · Q3 · Q4 · Q5 · Q6 | 0 fail (97+2 approved warn · 117 · 80 · 80 · 98) |
| Reproducibility double build (Q5) | identical |

Test change: `e2e/resilience.mjs` gained the Q5 configuration (no other test changed).

## 9. Remaining blockers for public deployment

1. **Post-round credits screen** (all rounds): in-round credits name author and licence but not the
   source URL, licence link or changes; CC BY/BY-SA require these "reasonably" — provide the
   "Nguồn hình ảnh" screen from `media/sources.json` (must appear only after the server-confirmed
   reveal, since some entries name answers).
2. **166-member figure:** labelled "Năm 2026"; recheck before each semester — Uzbekistan aims to join in
   2026. A new member in 2026 would need a label/count update and a c25 rebuild (non-essential figure).
3. **Safari/iOS and real classroom Wi-Fi** not tested.
4. **Editorial/lecturer review** of the Vietnamese wording (§5 deviations), especially f6 and c24.
5. q05-02, q05-03 and the emblem remain unused; no WTO notification or TTXVN request was sent. Using
   q05-02 later would need the post-round credits (item 1) plus the requested WTO notification.

## 10. Final review corrections (2026-10-20)

1. **Press/455 excerpt.** Re-read the official release: "The General Council approved Viet Nam’s
   membership on 7 November 2006. Viet Nam will become the WTO’s 150th member 30 days after it has
   informed the WTO that it has ratified the accession package domestically." The card is a **redacted
   excerpt**, not a verbatim quotation (name → ▢▢▢, remainder elided with "…", straight apostrophe). The
   heading now says so: "Trích thông cáo báo chí 7/11/2006 (đã che tên)" (native text only, no clip
   rebuilt). The complete answer exists only in `server/content/questions.ts`: check-bundle finds no
   answer in `dist/` (plain grep of `dist/` for the acronym and "World Trade": no match), and the
   resilience test confirms no state frame or page text contains it before the deadline.
2. **Recap label** "Ngày nay: 166 thành viên" → **"Năm 2026: 166 thành viên"**; source register S-Q5-09
   cites the WTO Annual Report 2026 (published 9/9/2026, PDF sha256 `d01a9d98…1474`). Only c25 was
   rebuilt (new hash above); c22–c24 rebuilt byte-identical.
3. **"bwTO" bytes in c23** (offset 183 570, unchanged — clip not re-encoded). File layout: `ftyp`
   [0–32) · `moov` [32–2298) · `free` · `mdat` [2306–214980). Walking the length-prefixed H.264 NAL
   units through `mdat` ends exactly at its end and finds only slice NALs (161 non-IDR, 7 IDR; no SEI,
   no user data). The bytes lie inside a 27 078-byte **IDR slice** NAL (starting at 158 642): CABAC
   entropy-coded picture data — not metadata, not rendered content, not application data.
4. **Contact sheets re-inspected** after the changes: [q5-clips.jpg](q5-clips.jpg),
   [q5-clips-phone.jpg](q5-clips-phone.jpg), [q5-round.jpg](q5-round.jpg) (all 18 live frames, projector +
   phone). Photos match their recorded context and licences; no hidden text or branding (the coffee
   crop excludes the child's "SURF" T-shirt and the house number); all text readable at phone size;
   decisive card shows two groups of exactly three boxes; no later clue in an earlier clip; nothing
   reveals the answer before the reveal.
5. **Other rounds:** Q2/Q3/Q4/Q6 clips, manifests, build reports and `questions.ts` timelines are
   byte-identical to `5ee93eb`; their validation reports differ only in the run timestamp.
