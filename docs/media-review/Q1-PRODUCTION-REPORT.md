# Q1 production — review package (M3.2-C3)

> Contains the canonical answer (docs only — never imported by client code).
> Branch `feat/m3-q1-production` from `875cc9e`. Not committed.
> Measurements: one Mac (Apple Silicon, macOS, Node 23.10, Chrome 155), 2026-10-20, repository E2E
> harness. Safari/iOS and real classroom Wi-Fi were **not** tested.

## 1. Montage (60 s)

| Scene | At | Kind | Content | Asset |
|---|---|---|---|---|
| h1 | 0 s | video 10 s | Own illustration: a shop counter with sparse shelves, a queue stepping forward · "Đi mua hàng, thập niên 1980" | c26 `w6n2j8rd` |
| h2 | 10 s | text-card | Một buổi đi mua hàng · Có thứ chỉ cần tiền và xếp hàng. Có thứ — như gạo, đường, vải — còn cần thêm một tờ giấy. | native |
| h3 | 15 s | video 6 s | Photo [ẢNH 2007 · BẢO TÀNG] "Phiếu thực phẩm (bản mẫu)" → own schematic [SƠ ĐỒ MINH HỌA] "Mỗi lần mua: cắt một ô trên tờ phiếu" (rows Đường / Vải / Thực phẩm; squares cut one by one) | c27 `s9b4x1lf` |
| h4 | 21 s | text-card | Theo tiêu chuẩn · Có loại phiếu cấp theo mức lương, chức vụ, cấp bậc lao động; có loại cấp theo độ tuổi. | native |
| h5 | 26 s | text-card | Tờ giấy có giá như tiền · Tem phiếu được in, phát hành và quản lý theo nguyên tắc như tiền giấy. Hàng hóa không được tự do lưu thông giữa các địa phương. | native |
| h6 | 31 s | video 5 s | Own illustration, signboard "MẬU DỊCH QUỐC DOANH", a coupon handed over the counter → "Cửa hàng mậu dịch quốc doanh · chỉ là một kênh phân phối · của cả một cơ chế kinh tế" | c28 `g7m3t5ve` |
| h7 | 36 s | date | `1976 – 1986` · Cả nước vận hành theo cùng một cơ chế kinh tế — ở miền Bắc, kinh tế kế hoạch đã có từ trước 1975 | native |
| h8 | 41 s | text-card | 17/6/1985 · Nghị quyết 25-NQ/TW · Quyết định bãi bỏ chế độ tem phiếu — riêng gạo và vài mặt hàng thiết yếu, nơi còn thiếu hàng vẫn tạm cấp sổ, phiếu. | native |
| **h9** | **45 s** | **text-card (decisive)** | Trích Báo cáo chính trị, Đại hội VI (12/1986) · "…cơ chế tập trung quan liêu, ▢▢▢ ▢▢▢ về căn bản chưa bị xoá bỏ." (the two groups joined by a non-breaking space so the 3+3 shape never splits across lines) | native |
| h10 | 50 s (10 s) | video 7 s + hold | Recap: shop illustration → coupon photo → schematic → `1976 – 1986` "cả nước, cùng một cơ chế kinh tế" (no new information) | c29 `u2k8p6zn` |

Narrative: purchasing and scarcity (0–10) → different goods, different conditions (10–15) → coupons
(15–21) → who received what and how coupons worked (21–31) → state retail as **one channel** of the
mechanism (31–36) → period and North/South difference (36–41) → the 1985 policy decision with its
exception (41–45) → the Party's own phrase, masked (45–50) → recap. The answer is framed as an
economic mechanism, not as poverty, queues or nostalgia.

## 2. Rights-first asset selection

| Asset | Status | Decision |
|---|---|---|
| q01-01 Philip Jones Griffiths / Magnum | no permission | **replaced** by own shop illustration (c26) |
| q01-02 John Ramsden (queue) | no permission | **replaced** — queue shown inside the illustration; no photo |
| q01-03 Ngôi Sao, uncredited | unknown rights holder, undated | **replaced** by own shop illustration with signboard (c28) |
| TTXVN / newspaper photos | no permission | not used |
| q01-04 Myra Siason, 2007 (specimen coupon display) | CC BY-SA 2.0 — Commons `{{cc-by-sa-2.0}}` + FlickreviewR passed 24/4/2008 (re-read 2026-10-20) | **used** at native resolution (max source scale 0.98), soft but legible as coupon sheets; captioned as a 2007 museum photo of specimens (stamped MẪU) |
| Q4's museum room photo ("Thoi bao cap.jpg") | CC BY-SA 3.0 | not reused (Q1/Q4 separation, DIFFICULTY-REVIEW) |
| Commons/Openverse alternatives | searched 2026-10-20 ("tem phiếu", ration coupon/book, mậu dịch, Hanoi 1980s …) | only NC/ND-licensed Flickr photos found (not adaptable under the project's open-licence rule) or present-day photos of objects with unverifiable context → not used |

No rights holder was contacted. Own illustrations are credited "Tranh minh họa (không phải ảnh tư
liệu)" or "sơ đồ minh họa", and tagged "SƠ ĐỒ MINH HỌA" in frame where they explain a rule; the coupon
schematic has no printed text and is not a facsimile. The museum photo is labelled "ẢNH 2007 · BẢO
TÀNG", never as a 1980s photograph. Its Commons file title contains the canonical answer; it is never
shown (in-round credit: creator + licence only). Visible text in the photo (museum label "Các loại
phiếu thực phẩm từ I đến V, tiêu chuẩn của công nhân viên lao động trực tiếp", "MẪU" stamps) is recorded
in `media/sources.json` and scanned by the validator.

New reusable templates in `media/templates/stage.html` (append-only): `shop` (counter, shelves, queue,
optional signboard and coupon hand-over) and `coupons` (schematic coupon sheet, squares cut one at a
time). Existing templates are unchanged: Q5 was rebuilt from scratch with the extended file and all
four clips came out byte-identical.

## 3. Historical evidence (re-read 2026-10-20)

| Screen | Source | Passage | Result |
|---|---|---|---|
| h8 decision + exception | Nghị quyết 25-NQ/TW, 17/6/1985 (tulieuvankien.dangcongsan.vn) | "Bãi bỏ chế độ tem phiếu. Riêng về gạo (ở một số thành phố và khu công nghiệp lớn có thể cả chất đốt và một vài mặt hàng thực phẩm thiết yếu), ở những nơi Nhà nước chưa đủ lực lượng hàng hoá để bán lẻ bình thường cho mọi nhu cầu thì tạm thời còn cấp sổ hoặc phiếu mua hàng cho công nhân, viên chức." | VERIFIED. Shown as a *decision*; the exception stays on screen; no claim that rationing ended in 1985 and no completion date |
| h9 decisive | Báo cáo chính trị, Đại hội VI (tulieuvankien.dangcongsan.vn) | "Song, cho tới nay, cơ chế tập trung quan liêu, bao cấp về căn bản chưa bị xoá bỏ." | VERIFIED; redacted excerpt ("Trích…", opening elided, answer → ▢▢▢ ▢▢▢) |
| h7 period, North before 1975; h5 no free circulation | Bảo tàng Lịch sử quốc gia | "…no free circulation of goods from one locality to another…"; "Although central planning had been established in the North before 1975, the term … is generally used to refer to Vietnam's economy between early 1976 and late 1986" | VERIFIED |
| h4 allocation criteria; h5 like banknotes; h2 sugar/cloth; c27 one square cut per purchase | Tạp chí Công Thương (Bộ Công Thương), "Hệ thống quản lý và cấp phát tem phiếu thời bao cấp", 27/7/2023 | "Có loại tem phiếu căn cứ theo mức lương, chức vụ, cấp bậc lao động, có loại căn cứ theo độ tuổi nhân khẩu"; "…in, phát hành và quản lý chúng cũng phải tuân thủ các nguyên tắc như đối với tiền giấy"; caption "Phiếu mua đường và tem mua vải. Mỗi lần sử dụng, mậu dịch viên sẽ cắt bỏ một ô trên tờ phiếu…" | VERIFIED (single ministry journal) |
| h2 "Có thứ chỉ cần tiền và xếp hàng" | VnExpress caption (S-Q1-09): vegetables did not need coupons | press caption | stated only as "có thứ" (some goods), not generalised to a category |

Approved restrictions kept: no 13/15 kg quotas; no start year for rationing in the North (h7 says
only "kinh tế kế hoạch đã có từ trước 1975"); policy decision distinguished from implementation.

## 4. Builds, hashes, validation

| Clip | Dur | CRF | Size (bytes) | Size | sha256 |
|---|---|---|---|---|---|
| c26 | 10 s | 24 | 173 013 | 169 KB | `24557ccc67abd4d911f8ba580f9343802875b8e8c6384f365218a90919559773` |
| c27 | 6 s | 24 | 426 353 | 416 KB | `79765af359a95ab4a43a56ed034fcb8e9a9919532c3f321b52d6e919d05df2af` |
| c28 | 5 s | 24 | 129 062 | 126 KB | `da5a3a722c3d192ed8ba3aada51e02b8c4db2de8451131bb47c7ee746b812cae` |
| c29 | 7 s | 24 | 335 689 | 328 KB | `9c92116cf0a32fd718b8793c1f22d9e5964886deec8245078d5adf6ee943383e` |

Round total 1 064 117 bytes (1.01 MB). H.264 Main, yuv420p, 960×540, 24 fps, no audio, no metadata,
faststart. All ≤ 600 KB at CRF 24 (best rung).

- **Reproducibility:** all four clips built twice from scratch — identical (`media/q1/repro-report.json`).
- **Validator Q1:** 80 pass / 0 warn / 0 fail; leak terms for the **whole round** (bao-cấp, bao cap,
  subsidy/subsidies/subsidised/subsidized, subvention) plus every question's exact answer; source
  timing (the photo only from 15 s); credits; format; legibility; late arrival. No exemptions.
- **Extra scan:** clip bytes and all 120 manifest strings — no hit; `dist/` plain grep — no hit.
- **Legibility:** burned-in text 16.8 CSS px on the 336 px phone stage; native text measured earlier at
  360×740 (labels/headings 16.8 px, bodies 18 px).
- **Regression validators:** Q2 97 pass / 2 approved warnings, Q3 117, Q4 80, Q5 80, Q6 98 — 0 fail.
  Q2–Q6 clips, manifests, build reports and `questions.ts` timelines byte-identical to `875cc9e`
  (validation reports differ only in the run timestamp).

## 5. Manual frame review

Sheets: [q1-clips.jpg](q1-clips.jpg), [q1-clips-phone.jpg](q1-clips-phone.jpg),
[q1-round.jpg](q1-round.jpg) (16 live frames, projector 1920×1080 + phone 360×740).

- No answer text in signs, museum labels, source photos, credits, captions or native scenes; the only
  signboard is the own "MẬU DỊCH QUỐC DOANH"; the museum label in the photo is partly cropped and does
  not name the period.
- No future clue in an earlier clip: c26 (0 s) shop without signboard; c27 (15 s) coupons; c28 (31 s)
  signboard + "one channel"; c29 (50 s) only released material.
- Fixed during review: the signboard was wider than the frame ("CỬA HÀNG …" dropped); coupon row labels
  overlapped the sheet (right-aligned, five columns); the masked groups split across lines on the
  projector (non-breaking space).
- Transitions: cross-fades of 250–300 ms; captions appear after the fade.

## 6. Network stress (`HC_QUESTION=1 node e2e/resilience.mjs`; final run)

| Metric | Run A — LAN | Run B — 2.5 Mbit/s + 60 ms ± 80 ms + incidents |
|---|---|---|
| Checks | 30 / 30 (both runs) | |
| Release → receipt (median / max) | 14 / 83 ms | 110 / 141 ms |
| Release → visible (median / max) | 16 / 154 ms | 115 / 1760 ms |
| Clip download, median per clip | c26 53 · c27 33 · c28 19 · c29 20 ms | c26 0.79 · c27 1.58 · c28 0.60 · c29 1.28 s |
| Video drift (median / max) | 239 / 246 ms | 183 / 184 ms |
| Scene spread between clients (max) | 47 ms | 114 ms |
| Redundant fetches · fetch before release | 0 · none | 0 · none |
| Reconnect after abrupt cut · projector catch-up | — | 1.3 s · 4 ms |

Includes future clip 403 / no session 401 / released 200, answer never in page text or state frames
before the deadline, results only after 60 s, refresh + reconnect, offline-across-deadline refusal.

## 7. Full test results

| Command | Result |
|---|---|
| `npm test` | 152 / 152 |
| `npm run typecheck` | pass |
| `npm run build` | pass — check-bundle "3 files, 6 answers, no leaks" |
| `npm run e2e` (multiplayer · scenes · projector · image fixture) | 31/31 · 30/30 · 40/40 · 16/16 |
| `npm run e2e:restart` | 20 / 20 |
| `HC_QUESTION=1 e2e/resilience.mjs` | 30 / 30 |
| Media validators Q1–Q6 | 0 fail |
| Reproducibility | Q1 identical; Q5 rebuilt with the new template file — identical |

Test/harness changes: `e2e/resilience.mjs` gained the Q1 configuration. `e2e/multiplayer.mjs` (which
plays Q1) now accepts **same-origin** `blob:` URLs as non-external — the authenticated clip download
the other suites already accepted; Q1 had no media before. The unused M1 `placeholder()` helper was
removed from `questions.ts` (every question now has a montage). No change to scoring, submissions,
authentication, deadlines, projector security or the database.

## 8. Editorial departures from Rev. 2

1. **B1 + B2 → one 10 s illustrated clip** (no permitted photo of the store hall or queue).
2. **B3:** "Rau quả: chỉ cần xếp hàng. Gạo, thịt, vải…" → "Có thứ chỉ cần tiền và xếp hàng. Có thứ — như
   gạo, đường, vải — …" (meat coupons not in the verified source; vegetables not generalised).
3. **B4:** Siason photo (q01-04, previously rejected as too soft) used at native size + own schematic
   of cutting one square per purchase; no ration-book (sổ) image.
4. **B5:** criteria stated per coupon type ("có loại … có loại …") as in the source, not per person.
5. **B6:** "Hàng hóa bán theo giá Nhà nước định" replaced by the museum's "không được tự do lưu thông
   giữa các địa phương" (the price sentence's source wording contains the answer).
6. **B7:** illustrated shop with signboard + "chỉ là một kênh phân phối của cả một cơ chế kinh tế"
   instead of a dated store photo.
7. **B8:** "từ cuối thập niên 1950" → "kinh tế kế hoạch đã có từ trước 1975" (museum wording; no
   start year).
8. **B9:** "— đến 1989" dropped (secondary source; completion not shown); exception kept.
9. **B10:** heading "Trích Báo cáo chính trị…" (redacted excerpt).
10. **B11:** recap ends on the period card instead of a four-image grid.

## 9. Rights and content uncertainties · lecturer review

- The coupon photo's museum is not named on Flickr/Commons ("Hanoi_Museum"); the caption says only
  "BẢO TÀNG"; the coupons are specimens (MẪU) — their year is not stated, so none is shown.
- The shop and coupon visuals are interpretive illustrations; goods, layout and signboard colours are
  not a reconstruction of a specific shop.
- **Lecturer review suggested:** h8 compression of the exception ("riêng gạo và vài mặt hàng thiết
  yếu, nơi còn thiếu hàng" — the resolution limits the extra goods to some large cities/industrial
  zones and the recipients to workers and employees); h5 second sentence (museum generalisation for
  1976–86); h2 "có thứ chỉ cần tiền và xếp hàng".
- Remaining release blockers (all rounds): no post-round credits screen for full CC BY-SA attribution;
  Safari/iOS and real classroom Wi-Fi untested.
