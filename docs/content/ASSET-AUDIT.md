# Asset Audit — existing 24 clue images + 1 prototype clip (M3.1)

> DRAFT for review. Decisions: **KEEP** (use as is, possibly re-cropped in a clip) ·
> **REWORK** (keep the source, change caption/crop/treatment or position) · **REPLACE** (concept
> stays, find a better photo) · **REMOVE** (concept dropped). Source metadata is in
> `docs/clue-assets.json`; reviewed visually on 2026-10-19 (full files and `docs/clue-contact-sheet.jpg`).
>
> Resolution note: clips are rendered at 960×540. A source ≥ 1200 px wide supports a ≤ 1.25×
> Ken Burns without upscaling; 800 px sources cannot be zoomed at all.

## Summary

| Decision | Count | Slots |
|---|---|---|
| KEEP | 11 | q01-01, q02-01, q02-03, q02-04, q03-01, q03-03, q04-01, q04-02, q04-04, q05-02, q06-01 |
| REWORK | 8 | q01-02, q02-02, q03-04, q04-03, q05-03, q05-04, q06-03, q06-04 |
| REPLACE | 4 | q01-03, q01-04, q05-01, q06-02 |
| REMOVE | 1 | q03-02 |
| Prototype clip `c01.mp4` | REWORK | re-cut to ≤ 6 s for the Q4 "after" beat |

Ownership/reuse: press/agency photos (Magnum via VnExpress, Ramsden, Ngôi Sao, TTXVN, commune
portal) are **not openly licensed**; they are used for a local classroom activity with credit.
That is acceptable only while the game is not distributed publicly — see PRODUCTION-PLAN §7
"Rights risk". Openly licensed works keep their licence terms; clips that adapt CC BY-SA works are
CC BY-SA themselves (documented per clip as in `docs/media-clips.md`).

## Per-asset decisions

### Q1

| Slot | Content | Accuracy | Clue value | Projector/phone | Early-reveal risk | Decision |
|---|---|---|---|---|---|---|
| q01-01 | Griffiths, B&W hall of a state department store, Hà Nội, near-empty cases | Year disputed 1980 vs 1985 (Saigoneer vs VnExpress) — both inside the period | Excellent atmospheric opener: emptiness, high ceilings; ambiguous alone | 1200 px; fine at 960×540, ≤ 1.2× zoom | Low | **KEEP** — caption "Hà Nội, thập niên 1980"; never a single year. Magnum copyright: classroom-only. |
| q01-02 | Ramsden, queue for vegetables at shop no. 85 | 1980–83 (photographer's posting); source caption says vegetables did **not** need coupons | Strong "queue" image; the "no coupon needed" fact is a nice nuance | 1660 px | Medium (queues ⇒ shortage, not yet the mechanism) | **REWORK** — crop out the book-gutter line at ~70 % width (use left 65 % as a 16:9 crop; still ≥ 1000 px); caption "Hà Nội, đầu thập niên 1980". Do not claim the queue is for rationed goods. |
| q01-03 | Crowd in front of "MẬU DỊCH QUỐC DOANH" sign | Undated, uncredited, probably late 1950s–60s North | The sign is valuable, but a pre-1975 image misdates the period most students associate with the answer | 1000 px, grainy, likely upscaled | Medium | **REPLACE** with a dated 1975–1986 shopfront/counter of a state store (candidate sources: Bảo tàng Lịch sử Quốc gia exhibition 2012 press photos; TTXVN archive). Fallback: keep with caption "Ảnh tư liệu, không rõ năm" — and never date-stamp it 1976–1986. |
| q01-04 | Phone photo of coupon sheets in a museum case, bilingual label | Authentic objects, museum display (2007) | Concept-critical (tem phiếu) | **Soft/blurred**; label text half-legible; poor on projector | Low (label says "phiếu thực phẩm", not the answer) | **REPLACE** with a sharp photo/scan of tem phiếu **and** a sổ mua lương thực (rice book). Needed for beats Q1-B5/B6. |

### Q2

| Slot | Content | Accuracy | Clue value | Projector/phone | Early-reveal risk | Decision |
|---|---|---|---|---|---|---|
| q02-01 | Bulla, Nevsky Prospekt shooting | July Days, 4 (17) July 1917 | Perfect "July" beat in the Feb→Jul→Oct structure | 1662 px, high contrast | Low | **KEEP** — caption "Petrograd, 4/7/1917 (lịch cũ)". Never "October". |
| q02-02 | Cruiser Aurora on the Neva | Modern photo (2013) of the preserved ship | Strong but recognisable symbol | 1630 px | High if shown before 30 s | **REWORK** — use only in 30–45 s band; caption "Tuần dương hạm Aurora — ảnh chụp năm 2013". Prefer an additional PD 1917-era photo of the ship if found (see missing media M2-3). |
| q02-03 | May Day demonstration at the Winter Palace | Spring 1917 (date: see SOURCE-REGISTER Q2-03; Russia still on the Julian calendar) | Shows the Winter Palace in a *non-October* moment: good misdirection and setting | 1422 px | Low | **KEEP** — caption "Quảng trường Cung điện, mùa xuân 1917". Never "October". |
| q02-04 | 1957 USSR stamp "40 лет Великого Октября", Lenin | Authentic stamp (PD) | Final hint for students who can read the Cyrillic "Октября" or recognise the iconography | 1522 px | High (by design) | **KEEP** for 55–60 s only. |

### Q3

| Slot | Content | Accuracy | Clue value | Projector/phone | Early-reveal risk | Decision |
|---|---|---|---|---|---|---|
| q03-01 | Farmers transplanting rice, Điện Biên, 2019 | Fine | Generic — good for 0–5 s ambiguity only; it shows *working together*, which is exactly the misconception to correct | 1440 px | None | **KEEP** as the opening detail shot (tight crop on hands). |
| q03-02 | Combine harvester, Philippines | Not Vietnam; shared machinery ≠ cooperative | Weak & misleading | — | — | **REMOVE.** |
| q03-03 | Members raising hands at an HTX members' congress, Lê Lợi, Hưng Yên, 22/4/2026 | Contemporary, well documented | **Core concept image** (democratic control) | 1440 px; faces of private citizens, official commune publication | Medium (could read as any meeting) | **KEEP** for the "one member, one vote" beat (Q3-B6). |
| q03-04 | Shopfront "HTX GỐM CHĂM BÀU TRÚC" | Real cooperative, Ninh Thuận | Near-decisive ("HTX") | 1440 px; sign legible on projector, borderline on phones | High (by design) | **REWORK** — staged reveal inside the final clip: crop on pottery → sign enters frame at 55 s. |

### Q4

| Slot | Content | Accuracy | Clue value | Projector/phone | Early-reveal risk | Decision |
|---|---|---|---|---|---|---|
| q04-01 | Bến Thành market 2023 | Fine | "After" beat | 1618 px | Low | **KEEP** (inside reworked c01). |
| q04-02 | Container ship, Hải Phòng 2022 | Fine | "After" beat | 1620 px | Low | **KEEP** (Q4 only; Q5 must not reuse this port — prevents "same answer" confusion). |
| q04-03 | 1980s living room, museum reconstruction (VME, 2006) | Reconstruction | "Before" beat; overlaps Q1 imagery (deliberate trap) | 1440 px | Low | **REWORK** — strap must read "tái hiện tại Bảo tàng Dân tộc học (2006)". Use for ≤ 4 s. |
| q04-04 | Đại hội VI hall, "ĐẠI HỘI VI" lettering (TTXVN) | Filed by TTXVN under Đại hội VI | Convergence beat | 1700 px | Medium–high (Congress VI ⇒ ĐỔI MỚI for prepared students) | **KEEP** in the 30–45 s band; slow push to "ĐẠI HỘI VI". **Rights:** the TTXVN page says "Cấm sao chép dưới mọi hình thức nếu không có sự chấp thuận bằng văn bản" — needs written permission (approval A3); fallback: date card + text only. |
| c01.mp4 | Market → port, 10 s | CC BY-SA adaptation | "After" | 1.09 MB | Low | **REWORK** — re-render 6 s, ≤ 600 KB. |

### Q5

| Slot | Content | Accuracy | Clue value | Projector/phone | Early-reveal risk | Decision |
|---|---|---|---|---|---|---|
| q05-01 | Port of Oakland aerial | Fine but US; visually close to q04-02 | Generic "trade" | 1728 px | None | **REPLACE** with a non-port opener (e.g. close-up of an HS-code customs label / tariff schedule page, or Vietnamese export goods — coffee, garments, rice sacks) to avoid "same as Q4" confusion. Fallback: keep, crop to containers only. |
| q05-02 | Marrakesh 1994, "URUGUAY ROUND 94 · MARRAKECH" banners | WTO Flickr, correct event | Excellent 15–30 s clue (needs knowledge to connect) | 1593 px | Medium | **KEEP** (pending licence check). The Commons page states CC BY-SA 2.0, but the licence on the original WTO Flickr page could not be verified in M3.1 — check by hand before production. Credit must **not** contain the string "WTO" (validator) → "© World Trade Organization". Do not name the speaker. |
| q05-03 | Lamy & Trương Đình Tuyển with accession protocol, 7/11/2006 | Correct (approval & signature, Geneva) | Strong 45–55 s clue | **800×546, low-res**; WTO globes blurred | Medium–high | **REWORK** — try to obtain a higher-resolution version (TTXVN or WTO photo gallery); show as a native image scene (no zoom). Keep the blur. **Rights:** TTXVN, same restriction as q04-04 (A3). |
| q05-04 | WTO globe emblem, no lettering | Official emblem | Final hint | vector-like | High (by design) | **REWORK → optional.** WTO treats its emblem as protected (it has objected to logo misuse; terms page currently 404). Default final hint is now a masked quote from WTO Press/455; the emblem is used only if approved (A5), as a wipe-in without distortion or recolouring. |

### Q6

| Slot | Content | Accuracy | Clue value | Projector/phone | Early-reveal risk | Decision |
|---|---|---|---|---|---|---|
| q06-01 | US steel works, red smoke, 1972 (EPA DOCUMERICA) | Fine (PD) | Opening: growth vs pollution | 1595 px | None | **KEEP** (strap "Hoa Kỳ, 1972" — it is a global problem). |
| q06-02 | Shacks facing high-rises, Mumbai 2007 | Fine but not Vietnamese | Social-inequality dimension | 1440 px | None | **REPLACE (preferred)** with a Vietnamese or regional image of informal housing beside new towers; fallback keep with strap "Mumbai, Ấn Độ, 2007". |
| q06-03 | Wind + solar on a former landfill, Hamburg 2018 | Fine | "Repair" image | 1920 px | Low | **REWORK** — keep as one shot, add a Vietnamese renewable image (Bạc Liêu wind farm) for national relevance. |
| q06-04 | Venn "Kinh tế / Xã hội / Môi trường" with "?" | Derivative of CC BY 4.0 SVG | Concept-critical; near-decisive | Thin text, white background clashes with the dark stage | High | **REWORK** — redraw as our own animated T9 Venn build (no attribution dependency), dark theme, used at 30–36 s **without** the centre label, and at 50–55 s with the "?" centre. |

## Text-in-image checks (manual, because the validator cannot read pixels)

| Asset | Readable text | Reveals answer? |
|---|---|---|
| q01-03 | "MẬU DỊCH QUỐC DOANH" | No (related term) |
| q01-04 | "phiếu thực phẩm", "Food stuff coupons" | No |
| q02-04 | "40 ЛЕТ ВЕЛИКОГО ОКТЯБРЯ" | Russian translation of a near-synonym — final beat only |
| q03-04 | "HTX GỐM CHĂM BÀU TRÚC" | Abbreviation — final beat only |
| q04-04 | "ĐẠI HỘI VI" | No |
| q05-02 | "URUGUAY ROUND 94 MARRAKECH" | No |
| q05-03 | TTXVN watermark | No (emblems blurred) |
| q06-04 | "Kinh tế, Xã hội, Môi trường" | No — but the redraw must never add a centre label |

## Missing media (summary — prioritised list in PRODUCTION-PLAN §1)

Q1: sharp tem phiếu + sổ gạo scan; dated 1976–86 state-store photo; (optional) Đại hội VI document page.
Q2: PD photo of Smolny / Red Guards Oct 1917; PD 1917 Aurora photo; Lenin "К гражданам России!" proclamation scan; Petrograd locator map.
Q3: Rochdale Toad Lane store (historic or museum photo); 1958–60 North Vietnam cooperative photo (dated); work-point book (sổ chấm công) image if available; Luật HTX 2023 cover page.
Q4: 1980s price/inflation document (e.g., currency of the 1985 change); rice-export 1989 photo or a dated newspaper page.
Q5: opener of Vietnamese export goods; Centre William Rappard exterior (Geneva); WTO General Council 7/11/2006 photo at higher resolution.
Q6: Vietnamese renewable energy; Mekong Delta saline intrusion / drought; Vietnamese inequality image; SDG colour wheel (no text).
