# Manual test checklist (real devices)

None of these were run on physical devices yet. Tick each item and record device model, OS and
browser version. Server started as in CLASSROOM_DRY_RUN.md.

## Safari on macOS (projector or admin)

- [ ] `/admin`: login, create room, **Mở màn hình máy chiếu**, **Sao chép** copies the link (HTTP fallback)
- [ ] `/screen` from the link: pairs; the `#pair=` part disappears from the address bar
- [ ] **Toàn màn hình** enters/leaves fullscreen
- [ ] Image scenes load; the video clip plays muted, aligned with a team device (±0.5 s)
- [ ] **Bật nhạc** after a click: music status reflects playing/loading/missing/blocked; scene videos stay muted. Follow [the projector audio checklist](M4.3-PROJECTOR-MUSIC.md) (lobby, intro effect, question).
- [ ] Reveal, animated leaderboard and final podium render correctly
- [ ] Refresh `/screen` mid-round → same scene and countdown

## Safari on iPhone (team device)

- [ ] Join with room code + PIN; ready button
- [ ] Layout fits portrait and landscape; letter slots readable; no horizontal scroll
- [ ] Video plays inline and muted without tapping (no fullscreen takeover)
- [ ] Submit: confirm dialog → "Đã ghi nhận…"
- [ ] Airplane mode on → submit → "Chưa xác nhận được…" (never "Đã ghi nhận"); airplane mode off → confirmed
- [ ] Lock the phone 20 s mid-round, unlock → reconnects; countdown and scene correct
- [ ] Switch to another app and back → same
- [ ] Private browsing tab works (session lasts while the tab is open)
- [ ] iOS < 16 (if available): letter slots still visible (fixed-size fallback)

## Chrome on Android (team device)

- [ ] Join, ready, submit, reveal, final screen
- [ ] Wi-Fi off/on during submission (as above)
- [ ] Screen off 20 s → reconnects correctly
- [ ] Video plays muted inline

## Classroom projector / external display

- [ ] Extended desktop; `/screen` window on the projector display; fullscreen
- [ ] Readable from the back row: countdown, scene text, letter slots, leaderboard
- [ ] 1920×1080, 1366×768 and 1280×720 projector modes: nothing cut off
- [ ] Colours/contrast acceptable on the actual projector (dark theme)
- [ ] Admin window stays on the laptop screen; PINs never shown on the projector
- [ ] Revoke projector access from `/admin` → projector shows the "thu hồi" message

## Network

- [ ] All five team devices reach `http://<Mac IP>:3001` (no client isolation)
- [ ] One full 60 s round with all devices: scenes change together
- [ ] Server restart test (Ctrl+C, `npm start` again within ~10 s mid-round): devices reconnect, round continues with the original deadline
