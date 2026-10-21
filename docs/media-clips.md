> M4.2: active clip specifications and slots are in [the frozen storyboard](M4.2-40S-STORYBOARD-PROPOSAL.md). c04 is an unregistered historical artifact; the older production notes below are retained for provenance.

# Video clips — sources, modifications and licence

Clips live in `server/media/clips/` (server-only; served only through the authenticated media
endpoint after their scene is released). They are referenced by opaque ids in
`server/media/registry.ts`.

## c01.mp4 — asset id `v5n4c6tw` (Question 4 prototype, scene `s6`)

| | |
|---|---|
| Content | Slow zoom over a busy market aisle, cross-fading into a container ship at a port |
| Length / format | 10.0 s, 960×540, 24 fps, H.264 Main, yuv420p, no audio, MP4 with faststart, keyframe every 1 s (≈1.09 MB, ≈870 kbit/s) |
| Licence of the clip | **CC BY-SA 4.0** (adaptation of CC BY-SA 4.0 works; share-alike applies) |
| On-screen credit | "Dựng từ ảnh của Bahnfrend và Nathan.cima · CC BY-SA 4.0" (shown with the scene) |

### Source works

1. **"Ben Thanh Market, 2023 (05).jpg"** — Bahnfrend, 2 Nov 2023, own work.
   CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/
   https://commons.wikimedia.org/wiki/File:Ben_Thanh_Market,_2023_(05).jpg
   (local copy: `server/media/clues/q04-01.webp`)
2. **"Container Ship at the Hai Phong International Container Terminal 01.jpg"** — Nathan.cima,
   27 Jul 2022, own work. CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/
   https://commons.wikimedia.org/wiki/File:Container_Ship_at_the_Hai_Phong_International_Container_Terminal_01.jpg
   (local copy: `server/media/clues/q04-02.webp`)

### Modifications

- Each photo scaled to 2560 px wide and centre-cropped to 16:9 (top/bottom trimmed).
- Market: slow zoom-in (Ken Burns) from 1.00× to ≈1.12× over 5.5 s.
- Port: slow zoom-out from 1.12× towards 1.00× over 5.5 s.
- 1 s cross-fade between them at 4.5 s; output scaled to 960×540 and encoded as H.264.
- No other edits (no colour changes, no added text, no audio).

### Re-encoding in M2.3 (same content, smaller file)

Network tests (`e2e/resilience.mjs`) showed the original 3.07 MB encoding (1280×720, 30 fps, CRF 24)
took ≈10 s to download per device at 2.5 Mbit/s, so on congested classroom Wi-Fi the clip appeared
≈10 s after its release at 42 s. It was re-encoded from the same two photos with the same motion:
960×540, 24 fps, CRF 30, `-preset veryslow -tune stillimage` → 1.09 MB (−64 %). Measured results
are in docs/network-resilience.md.

### How it was produced

FFmpeg 6.0 from the npm package `ffmpeg-static` (run from a temporary tools folder; FFmpeg is not a
project dependency and not installed system-wide). Reproducible production is planned for M3.

```bash
ffmpeg -loop 1 -t 5.5 -i server/media/clues/q04-01.webp -loop 1 -t 5.5 -i server/media/clues/q04-02.webp \
  -filter_complex "[0:v]scale=2560:-2,crop=2560:1440,zoompan=z='min(zoom+0.000875,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=132:s=960x540:fps=24,setsar=1[a];[1:v]scale=2560:-2,crop=2560:1440,zoompan=z='if(eq(on,0),1.12,max(zoom-0.000875,1))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=132:s=960x540:fps=24,setsar=1[b];[a][b]xfade=transition=fade:duration=1:offset=4.5,format=yuv420p[v]" \
  -map "[v]" -c:v libx264 -profile:v main -preset veryslow -tune stillimage -crf 30 -g 24 -keyint_min 24 -an -movflags +faststart -t 10 server/media/clips/c01.mp4
```

## Q2 production clips c02–c06 (M3.2)

Built reproducibly by `scripts/media/build-clips.mjs` from `media/q2/manifest.json`; exact FFmpeg
commands, tool versions, CRF attempts and sha256 are in `media/q2/build-report.json`; sources,
licence evidence and access dates in `media/sources.json` / `media/sources.lock.json`. Common
format: 960×540, 24 fps, H.264 Main, yuv420p, no audio, no metadata, faststart, keyframe every 1 s.
Common modifications: crop/pan/zoom (never above source resolution), added Vietnamese caption
bands, cross-fades; nothing else is altered (no colourising, no retouching).

| Clip | Asset id | Sources | Licence of the clip | In-game credit |
|---|---|---|---|---|
| c02 | `r4t8k1mz` | Plate from Stinton Jones, *Russia in Revolution* (London 1917), photographer unknown — PD in the US; other jurisdictions documented in `media/sources.json` | 1917 material + our captions (rights note: see source record) | "Ảnh in trong sách của S. Jones, London 1917" |
| c03 | `p9w2c6xe` | own calendar graphics; the same 1917 plate blurred as background | own work + 1917 material | "Đồ họa · nền: ảnh trong sách S. Jones, 1917" |
| c04 | `h3n7d5qy` | Karl Bulla / Museovirasto (CC BY 4.0); Viktor Bulla (PD) | adaptation of a CC BY 4.0 work: attribution + indication of changes | "Ảnh: K. Bulla/Museovirasto CC BY 4.0; V. Bulla" |
| c05 | `b8j1f4vu` | Natural Earth (PD); Florstein 2013 (CC BY-SA 4.0); Yakov Steinberg (PD) | **CC BY-SA 4.0** (share-alike from the Aurora photo) | "Ảnh: Florstein 2013 CC BY-SA 4.0; Steinberg · bản đồ Natural Earth" |
| c06 | `x2m6s9ka` | Jones plate, V. Bulla, Steinberg (thumbnails); USSR stamp 1957 (PD-RU-exempt) | 1917/1957 material + our graphics | "Ảnh: Jones, Bulla, Steinberg; tem Liên Xô 1957" |

The game has no post-round credits screen yet: full attributions (source URLs, licence links,
changes) live in `media/sources.json` and this file. See docs/media-review/Q2-PILOT-REPORT.md §3.

## Q4 and Q6 production clips c07–c15 (M3.2-B)

Same format and pipeline as Q2. Manifests: `media/q4/manifest.json`, `media/q6/manifest.json`;
build reports, validation reports and reproducibility reports next to them.

| Clip | Asset id | Question / scene | Sources | Licence of the clip | In-game credit |
|---|---|---|---|---|---|
| c07 | `k5v8m7wn` | Q4 b2 (5 s) | Rungbachduong 2006, museum reconstruction (CC BY-SA 3.0) + own date graphic | **CC BY-SA 3.0** adaptation | "Ảnh: Rungbachduong CC BY-SA 3.0 (tái hiện, 2006)" |
| c08 | `f3t9m6ra` | Q4 b4 (16 s) | own timeline graphic (facts: Chỉ thị 100-CT/TW, NQ 25-NQ/TW) | own work | "Đồ họa · nguồn: văn kiện Đảng 1981 và 1985" |
| c09 | `w7c2h4pj` | Q4 b7 (33 s) | own typographic sequence (facts: Đại hội VI archive page) | own work | "Đồ họa · số liệu: tư liệu văn kiện Đảng" |
| c10 | `n6d1x8zs` | Q4 b10 recap (50 s) | own graphic; Bahnfrend 2023, Nathan.cima 2022 (CC BY-SA 4.0) | **CC BY-SA 4.0** adaptation | "Ảnh: Bahnfrend 2023, Nathan.cima 2022 · CC BY-SA 4.0" |
| c11 | `g2r7k9vb` | Q6 d1 (0 s) | LeRoy Woodson / US EPA DOCUMERICA 1972 (PD, US government) | PD material + our caption | "Ảnh: LeRoy Woodson, US EPA (phạm vi công cộng)" |
| c12 | `y4m1t6qe` | Q6 d3 (10 s) | Rudolph A. Furtado 2007 (PD-self) | PD material + our caption | "Ảnh: Rudolph A. Furtado (phạm vi công cộng)" |
| c13 | `u8s3n5ck` | Q6 d5 (21 s) | Sebastian Koppehel 2018 (CC BY 4.0); Tycho 2015 (CC BY-SA 3.0) | **CC BY-SA 3.0** adaptation (share-alike) with CC BY 4.0 attribution | "Ảnh: S. Koppehel CC BY 4.0; Tycho CC BY-SA 3.0" |
| c14 | `j9p4w2fd` | Q6 d6 (27 s) | own three-circle diagram; faint thumbnails of Woodson, Furtado, Tycho | **CC BY-SA 3.0** adaptation (Tycho thumbnail) | "Đồ họa · ảnh nền: Woodson, Furtado, Tycho CC BY-SA 3.0" |
| c15 | `e1h6z3lm` | Q6 d10 recap (50 s) | Woodson, Furtado, Tycho; own diagram | **CC BY-SA 3.0** adaptation | "Ảnh: Woodson, Furtado, Tycho CC BY-SA 3.0 · đồ họa" |

Not used: the official UN SDG colour wheel (conditions of the 2023 SDG Guidelines could not be
confirmed for this use — see docs/media-review/Q4-Q6-PRODUCTION-REPORT.md); the TTXVN Đại hội VI
photograph (no permission); 1985 banknote images (reproduction rules not checked).

## Q3 production clips c16–c21 (M3.2-C1)

Manifest `media/q3/manifest.json`; build, validation and reproducibility reports next to it.

| Clip | Asset id | Scene | Sources | Licence of the clip | In-game credit |
|---|---|---|---|---|---|
| c16 | `m4x9t2bh` | e1 (0 s) | Adam Jones 2019, Điện Biên (CC BY-SA 2.0, Flickr review passed 2019-07-19) | **CC BY-SA 2.0** adaptation | "Ảnh: Adam Jones CC BY-SA 2.0" |
| c17 | `v7k3p8cd` | e2 (5 s) | own illustration (pooled capital) | own work | "Đồ họa minh họa" |
| c18 | `s2n6w9qf` | e3 (10 s) | Natural Earth (PD); Rochdale Pioneers Museum, Chemical Engineer 2017 (CC BY-SA 4.0), cropped to the 1844 storefront — the "DELICIOUS COOP TEA" wall advert is never in frame | **CC BY-SA 4.0** adaptation | "Bản đồ: Natural Earth · Ảnh: Chemical Engineer 2017 CC BY-SA 4.0" |
| c19 | `z5r1j7ta` | e5 (21 s) | own comparison cards (facts: Luật Doanh nghiệp VBHN 67/2025, Luật HTX 2023) | own work | "Đồ họa · căn cứ: Luật Doanh nghiệp (VBHN 67/2025), Luật năm 2023" |
| c20 | `l3g8u4yx` | e6 (30 s) | own illustration of equal votes (replaces the commune photo q03-03, no permission) | own work | "Đồ họa minh họa (không phải ảnh tư liệu)" |
| c21 | `o9c5e2kn` | e10 recap (50 s) | own illustration; Adam Jones (CC BY-SA 2.0); Windrain 2022 Bàu Trúc signboard (CC BY-SA 4.0) | **CC BY-SA 4.0** adaptation (incl. CC BY-SA 2.0 material) | "Ảnh: Adam Jones CC BY-SA 2.0; Windrain CC BY-SA 4.0" |

Not used: q03-03 (commune portal photo — no permission), q03-02 (removed in M3.1), the 2011
Rochdale photo by Robert Wade (the "COOP" wall advert dominates the frame).

## Q5 production clips c22–c25 (M3.2-C2)

Manifest `media/q5/manifest.json`; build, validation and reproducibility reports next to it.
No pre-reveal credit, caption or source line names the organisation (validator leak terms cover
the acronym, the English/French/Spanish/Vietnamese names and partial names for the whole 60 s).

| Clip | Asset id | Scene | Sources | Licence of the clip | In-game credit |
|---|---|---|---|---|---|
| c22 | `h8w3n5rk` | f1 (0 s) | Jean-Pierre Dalbéra 2011, roadside rice drying, Mekong delta (CC BY 2.0, Flickr review 2013-02-15); P. Hughes 2015, coffee beans drying near Đà Lạt (CC BY 4.0), cropped to the bean yard (a child and a house number stay out of frame) | **CC BY 4.0** adaptation (incl. CC BY 2.0 material) | "Ảnh: J.-P. Dalbéra CC BY 2.0; P. Hughes CC BY 4.0" |
| c23 | `p2f7d9xs` | f4 (16 s) | Natural Earth land (PD) locator; own date card "15/4/1994 · Marrakesh" — replaces the photo q05-02 | own work + PD data | "Bản đồ: Natural Earth · đồ họa" |
| c24 | `k4j6v1mt` | f7 (33 s) | own timeline/typography (facts: Federal Register 66 FR 31407; USTR 31/5/2006; Press/455) | own work | "Đồ họa · nguồn: USTR (2006); Federal Register (2001); hồ sơ gia nhập" |
| c25 | `r9e2y7gc` | f10 recap (50 s) | Dalbéra rice photo (CC BY 2.0); own recap cards; Natural Earth world land map (PD, no borders) | **CC BY 2.0** adaptation | "Ảnh: J.-P. Dalbéra CC BY 2.0 · bản đồ: Natural Earth · đồ họa" |

Modifications: crop/scale (never above source resolution, max 0.70 source px per output px), static
hold, cross-fade; no colour edits, no audio, no metadata. Full attribution (author, source URL,
licence link, changes) for the post-round credits: `media/sources.json`.

Not used: q05-02 Marrakesh 1994 photo (CC BY-SA 2.0, attribution "© WTO" would reveal the answer
in-round and the WTO notification has not been sent), q05-03 (TTXVN, no permission), q05-04 (official
emblem), the "Sewist Vietnam" photo (market scene, personality-rights tag).

## Q1 production clips c26–c29 (M3.2-C3)

Manifest `media/q1/manifest.json`; build, validation and reproducibility reports next to it.
No permission-restricted photo is used: q01-01 (Magnum), q01-02 (Ramsden), q01-03 (Ngôi Sao) and
TTXVN images are replaced by own illustrations (credited "Tranh minh họa (không phải ảnh tư liệu)" /
"sơ đồ minh họa") and one openly licensed museum photo.

| Clip | Asset id | Scene | Sources | Licence of the clip | In-game credit |
|---|---|---|---|---|---|
| c26 | `w6n2j8rd` | h1 (0 s, 10 s) | own illustration (`shop` template): sparse shelves, queue | own work | "Tranh minh họa (không phải ảnh tư liệu)" |
| c27 | `s9b4x1lf` | h3 (15 s) | Myra Siason 2007, specimen food coupons in a Hà Nội museum (CC BY-SA 2.0, FlickreviewR passed 2008-04-24), native resolution, crop/pan; own coupon schematic (`coupons` template) | **CC BY-SA 2.0** adaptation | "Ảnh: Myra Siason 2007 CC BY-SA 2.0 · sơ đồ minh họa" |
| c28 | `g7m3t5ve` | h6 (31 s) | own illustration with signboard "MẬU DỊCH QUỐC DOANH"; own typography | own work | "Tranh minh họa (không phải ảnh tư liệu)" |
| c29 | `u2k8p6zn` | h10 recap (50 s) | c26 illustration, Siason photo (CC BY-SA 2.0), c27 schematic, period card | **CC BY-SA 2.0** adaptation | "Ảnh: Myra Siason 2007 CC BY-SA 2.0 · tranh, sơ đồ minh họa" |

The Commons file title of the coupon photo contains the canonical answer; it is never shown (only
creator and licence are credited in-round; file names are not exposed). Full attribution for the
post-round credits: `media/sources.json`.
