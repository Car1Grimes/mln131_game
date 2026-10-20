# Student playtest protocol (M3.3-B)

> Status: **NOT RUN** — no participants have taken part yet. Automated browsers cannot replace this
> test: it measures *human* recognition, reading speed and confusion. Record results in a copy of
> [PLAYTEST-RESULTS-TEMPLATE.md](PLAYTEST-RESULTS-TEMPLATE.md); never invent or estimate entries.
>
> This document is for the facilitator. It contains the answers — do not show it to participants.

## 1. Purpose

1. Does each question become recognisable at the intended time (first plausible ≈ 25–35 s,
   decisive clue at 45 s, 10–15 s left to type)?
2. Which hints are understood, ignored or misleading?
3. Is all text readable on the participants' own phones and on the projector?
4. Are the controls (join, ready, answer, confirm, "Nguồn tư liệu") clear?
5. Does any question feel unfair?

**Focus: Q3 (HỢP TÁC XÃ), Q5 (WTO), Q6 (PHÁT TRIỂN BỀN VỮNG)** — the rounds with the most abstract or
foreign-language clues.

## 2. Participants

- 5–15 students who have **not** seen the game, the storyboards or the media. Same course level as
  the target class. Students who helped build the game cannot participate.
- Ideally 5 teams of 1–3 students (one device per team), plus 2–3 individual observers.
- Participation is voluntary; record only a participant code (P01, P02 …), never names, student IDs
  or contact details. Ask for verbal consent to note answers and timings; delete raw notes after the
  results are summarised.

## 3. Setup (facilitator)

- Use the procedure in [CLASSROOM_DRY_RUN.md](CLASSROOM_DRY_RUN.md), level **B** (physical devices on
  a local network you control). The game is plain HTTP until M4 — do not use a public network.
- Fresh room; the projector paired and in full screen; volume off (clips are silent).
- Participants use **their own phones** (note model and browser in the sheet); at least one iPhone
  (Safari) and one Android (Chrome) if available.
- One observer per 2 teams with a stopwatch or the observation sheet; one facilitator runs the admin.
- Do not explain the questions or hint at answers. Explain only the rules: one answer per team per
  round, confirm before sending, faster correct answers score more.

## 4. Procedure (≈ 25 minutes)

1. **Join (3 min).** Teams join with room code + PIN, press "Xác nhận sẵn sàng". Observers note any
   hesitation or help needed (control clarity).
2. **Rounds Q1 → Q6 (6 × ~2.5 min).** Admin starts each round. During the 60 s:
   - Each observer notes, per team, the **second at which the team first says a plausible answer
     aloud** and the **second they press Gửi** (the countdown on the projector is the reference:
     second = 60 − countdown).
   - Note what the team says when they change their mind ("ah, it's …") and which hint triggered it.
   - Do not intervene unless a device fails.
3. **After each reveal (≈ 30 s).** Ask each team: "Which hint gave it away? Was any hint misleading?
   Could you read everything?" Optionally one team opens **Nguồn tư liệu** on its phone: note whether
   they find the button and the way back.
4. **Final (2 min).** Show the podium. Hand out the per-participant sheet (section B of the template).
5. **Debrief (5 min).** Open questions: hardest round, most unfair round, anything confusing.

## 5. What to observe per round

| Question | Intended first plausible | Decisive (45 s) | Watch for |
|---|---|---|---|
| Q1 BAO CẤP | ~26–31 s (coupon rules, "giá như tiền") | Đại hội VI phrase, ▢▢▢ ▢▢▢ | guesses TEM PHIẾU / ĐỔI MỚI; is the shop illustration understood as an illustration? |
| Q2 CÁCH MẠNG THÁNG MƯỜI | ~27 s (Petrograd, 6–7/11) | Old-Style date 25/10/1917 | confusion lịch cũ / lịch mới |
| **Q3 HỢP TÁC XÃ** | ~20–31 s (one member one vote) | law title ▢▢▢ ▢▢▢ ▢▢ + "HTX" | Is the Rochdale (UK) context distracting? Is the comparison-card sequence too fast to read? Guesses CÔNG TY / HỘI |
| Q4 ĐỔI MỚI | ~23–28 s (Đại hội VI) | "▢▢▢ ▢▢▢ tư duy" | guesses BAO CẤP (shared 3·3 pattern) |
| **Q5 WTO** | ~23–28 s (1/1/1995, Genève) | redacted Press/455 quote, ▢▢▢ | English quote readable? Do students know GATT? Guesses FTA / IMF / ASEAN; does the export-goods opener mislead? |
| **Q6 PHÁT TRIỂN BỀN VỮNG** | ~32–38 s (Brundtland definition, Agenda 2030) | Quyết định 622 title, 4·5·3·4 boxes | guesses TĂNG TRƯỞNG XANH / KINH TẾ XANH; is the 4-word answer typed in time? |

## 6. Measures (all recorded by hand; leave empty if not observed)

- Guessed answer(s) and final submitted text (as typed).
- Second of first recognition (said aloud) and second of submission → typing/confirm time.
- Hints understood / ignored / misleading (scene codes from section 5 or a short description).
- Readability: phone model + browser; any text the participant could not read; projector distance.
- Control confusion: join, ready, answer, confirm dialog, results, Nguồn tư liệu.
- Fairness rating per round (1 = very unfair … 5 = fair) and why.

## 7. Decision rules after the playtest

- A round where **no team** recognises the answer before 50 s, or where most teams cannot type it
  before 60 s → candidate for an earlier or clearer hint (content change → new media/editorial review,
  never during a live game).
- A hint reported as misleading by ≥ 2 teams → editorial review of that scene.
- Any unreadable text on a participant's phone → record model/browser; fix before the class.
- Never change facts to make a round easier; change order or emphasis only (DIFFICULTY-REVIEW rule).

## 8. Data handling

Store the completed results file in `docs/playtest/` (anonymous codes only). Do not commit photos of
participants, names, or the database of the playtest session (it contains PINs and answers).
