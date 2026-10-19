# Classroom dry run (rehearsal procedure)

Goal: play one complete 60-second round on the real classroom network before the presentation,
with the same devices that will be used on the day.

**Security note:** the game runs over plain HTTP on the local network. Passwords, PINs, session
tokens and answers are **not encrypted** in transit; anyone on the same Wi-Fi could observe them.
Use a network you control (your own router or phone hotspot). Public or untrusted networks require
HTTPS, which is planned for M4 — do not deploy this build to the internet.

## Setup

| Role | Device |
|---|---|
| Server + admin | the Mac (Node 22+, this project) |
| Projector | a second browser window on the projector display (extended desktop), or another computer |
| Teams | five phones/laptops on the same Wi-Fi |

## 1. Prepare the Mac (once, with internet)

```bash
cd mln131_game
npm install
npm run build        # must print "check-bundle: OK"
npm test             # optional sanity check
```

## 2. Start the server on the LAN

```bash
ipconfig getifaddr en0          # Mac's Wi-Fi IP, e.g. 192.168.1.23 (try en1 if empty)
ADMIN_PASSWORD='choose-a-strong-password' HOST=0.0.0.0 PORT=3001 npm start
```

- `HOST=0.0.0.0` is required; the default `127.0.0.1` only accepts the Mac itself.
- Keep the Mac awake and plugged in: `caffeinate -dimsu` in a second terminal (Ctrl+C to stop).
- macOS firewall (System Settings → Network → Firewall): if enabled, allow incoming connections for
  `node` when prompted (or add it under Options).

## 3. Check reachability from another device

On a phone on the same Wi-Fi open `http://<Mac IP>:3001/api/health` → `{"ok":true}`.

If it does not load:
- Is the phone really on the same network (not mobile data, not a "Guest" SSID)?
- **Client isolation / AP isolation** (common on school and guest Wi-Fi) blocks device-to-device
  traffic. Use a router or hotspot you control.
- Firewall prompt dismissed? Re-check the firewall settings above.
- VPNs on the Mac or phone can block LAN access.

## 4. Run the rehearsal

1. Mac: open `http://localhost:3001/admin`, log in, **Tạo phòng mới**.
2. Projector: **Mở màn hình máy chiếu** → open the link on the projector display (or **Mở cửa sổ máy
   chiếu** and drag the window to the projector), click **Toàn màn hình**. The admin shows
   "Đã kết nối". Do **not** project the admin window; PINs are hidden by default.
3. Teams: on each device open `http://<Mac IP>:3001/?room=<CODE>`, enter its PIN (read privately
   via **Hiện mã PIN**), **Xác nhận sẵn sàng**. Admin shows 5/5 connected and ready.
4. Admin: **Bắt đầu câu 1**. Check that all devices and the projector show the same countdown and
   scenes.
5. **Disconnect test:** on one team device turn Wi-Fi off for ~10 s, type an answer and press
   Gửi while offline → it must show "Chưa xác nhận được…", never "Đã ghi nhận". Turn Wi-Fi back on
   → within seconds it shows "Đã ghi nhận" (if the deadline has not passed).
6. Let the round run to 0. Results appear on all devices and the projector **only then**.
7. Check the leaderboard on the admin, a team device and the projector: identical scores.
8. Optional: refresh the projector and one team device mid-round → same scene and countdown.

## 5. After the game: back up the results

Stop the server (Ctrl+C), then copy the database (it is in WAL mode, so copy all three files if present):

```bash
mkdir -p backups
cp data/hidden-connection.sqlite* backups/   # .sqlite, .sqlite-wal, .sqlite-shm
```

Or, with the server still running, a consistent online copy:
`sqlite3 data/hidden-connection.sqlite ".backup 'backups/game-$(date +%F).sqlite'"`.

Never commit `data/` or backups to git (they contain PINs and answers; `.gitignore` excludes them).

## Rehearsal record

| Item | Result |
|---|---|
| Date / place / network | |
| Devices (model, OS, browser) | |
| All 5 teams joined | ☐ |
| Projector paired, fullscreen | ☐ |
| Scenes in sync on all screens | ☐ |
| Offline-submission test behaved as described | ☐ |
| Results only after the deadline | ☐ |
| Scores identical everywhere | ☐ |
| Database backed up | ☐ |
| Problems observed | |
