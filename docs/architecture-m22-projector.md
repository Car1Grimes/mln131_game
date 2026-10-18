# M2.2 — Secure projector view (`/screen`)

Three roles, three routes: the host uses `/admin`, teams use `/`, the classroom sees `/screen`.

## Pairing and session

```
/admin  "Mở màn hình máy chiếu"
   POST /api/admin/rooms/:code/screen-pairing      (admin session required)
     → 256-bit random secret; server stores sha256(secret), room, expires_at (5 min), used_at
     ← { secret, expiresAt } → admin builds  <origin>/screen#pair=<secret>
        (fragment: never sent to the server in requests, Referer or logs)
/screen
   reads #pair, immediately removes it from the URL (history.replaceState), then
   POST /api/screen/pair { secret }                 (rate-limited per IP)
     → atomically marks the pairing used (single use, unexpired), creates a 'screen' session:
       role='screen', room_id, expires_at = now + 6 h, token stored only as sha256
     ← { token, roomCode, expiresAt }  token kept in sessionStorage, never displayed
   Socket.IO handshake auth { token } → role 'screen', room from the session (handshake room ignored)
/admin  "Thu hồi quyền máy chiếu"
   POST /api/admin/rooms/:code/screen-revoke → revoked_at on all screen sessions of the room,
   pending pairings invalidated, projector sockets disconnected.
```

- Every request/handshake checks `revoked_at IS NULL` and `expires_at > now`.
- Proactive expiry: each projector socket gets one server-side timer at its session's `expires_at`
  (same clock/scheduler as the game engine; re-armed if it fires early, cancelled on disconnect), so
  an idle room cannot keep an expired projector connected. No polling. Revocation disconnects
  immediately; broadcasts also re-check validity as a second safeguard.
- Admin and team sessions keep `expires_at = NULL` (unchanged behaviour).
- Lifetimes: `SCREEN_SESSION_TTL_MS` (default 6 h), `SCREEN_PAIRING_TTL_MS` (default 5 min).

## Authorization

| Capability | admin | team | screen |
|---|---|---|---|
| Room state | AdminView (incl. PINs) | own TeamView | **ScreenView** (own room only) |
| Start / advance / rename | ✓ | – | – |
| Ready / submit | – | ✓ | – |
| Admin HTTP API, pairing, revoke | ✓ | – | – |
| Released media | any room | own room | own room |

Mutations are checked on the server (`handle(needRole)` in `server/app.ts`); the projector UI simply
has no controls for them.

`ScreenView` (`server/views.ts`, built field by field, never from AdminView): room summary, team
names/slots/connected/ready, only the *aggregate* number of teams that submitted during an open round
(never which team, so the submission order cannot be followed on the projector), the round metadata
with released scenes and the answer letter pattern, standings of closed rounds, and the RoundReveal
only after the server closes the round. No PINs, answers, answer texts, correctness, ordering or
points before the reveal. The admin keeps per-team submission status.

Final results: only teams with a positive score stand on the podium (`podiumStandings`, competition
ranks so ties share a place and height); zero-point teams are listed in the full leaderboard. If
nobody scored, a neutral result is shown and no winner is declared.

## Database migration (v0 → v2)

`openDb()` runs an idempotent migration on every start (`PRAGMA user_version` 2):
the M1 `sessions` table (CHECK role IN ('admin','team')) is rebuilt in one transaction with the
'screen' role, `expires_at`, `revoked_at` and a CHECK that screen sessions are room-bound and
expiring; rows are copied unchanged; `foreign_key_check` must pass. `screen_pairings` is created.
Tested against the verbatim M1 schema (`server/fixtures/m1-schema.sql`).
