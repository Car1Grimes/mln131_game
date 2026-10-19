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
