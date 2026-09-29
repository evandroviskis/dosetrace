# Today tab — layout proposal v1 (2026-09-29)

Mockup: `docs/design/today-dashboard.html` (light + dark, 6 states, 135% text, fate table,
coverage check). Skin: Graduated v3, ink primary action. Type: the approved v4 roles (DESIGN.md §3).
Inputs: inventory of main's Today (main @ 57b6910) and the journey review
(`today-journey-findings.md`).

## Founder brief (2026-09-29)

"No need to stick to the current look of the app. Feel free to change locations of the alerts,
tomorrow, next 5 days, dose counter and so on. I need all the features but I am open to
suggestions. Keep the typography we just approved. Share my progress card may be extinct for now.
The good morning at the top also does not need to stay."

## The idea

Today answers one question: **what do I take now, and is today on track?** One change of order:
today's doses move from 6th place to the top, and the counter joins them in the header.
Everything else keeps main's relative order, tighter: streak → alerts → food log → Tomorrow →
Next 5 days → disclaimer. Nobody has to relearn where things are; the dose is just first.

## Structure, top to bottom

1. **Header:** "Today" (large title) + the date. On the right, the counter "4 / 5 doses" with a
   dial of one segment per dose due today (replaces the greeting line, the ring, the "80%" and
   the Done tile). Hidden when nothing is due.
2. **Pending from yesterday** (S-17 rule, unchanged).
3. **Dose cards** for today, due and late first ("Due" with an attention dot), then later today.
   Card: dot, name, dose (mono) · frequency, time + ›, status, state line (skipped / partial),
   *suggestion:* "Draw to {n} units" + the protocol's syringe drawn to scale (reconstituted only),
   footnotes (Day X of Y on older protocols, last site, the protocol's streak), vial footer
   (vial cells + "Mixed … · n doses remaining · n days left", or "+ Add vial"), Skip + Mark taken.
4. **Taken** (new): one line with the names of today's taken doses; tap to open it with times.
   Or "You're all caught up for today" when all are taken; "No dose scheduled today · Next dose:
   {date}" when protocols exist but none is due; the empty state (+ "Add a protocol") with none.
5. **Streak card** (flame, count, month %, On fire!, week cells, View history → Dose log).
6. **Alerts** (one grouped card; the same four alerts and Remind me options as main).
7. **AI food log** (while a reality check runs, FL-43): the same card as Journey, whole card →
   FoodChat; free-days/grace note under it.
8. **Tomorrow** and **Next 5 days** as rows (same buckets as main), "{count} more scheduled later".
9. Disclaimer.

## Fate of every item on main (41) + new (4)

Stays: 1 date · 7 pending · 9 card top row · 10 protocol streak (as text) · 11 Day X of Y ·
12 last site · 13 vial line · 14 + Add vial · 15 Skip · 16 Mark taken · 17 skipped line ·
18 partial line · 20 all caught up · 22 streak card · 23 week dots (graduated) · 25 View history ·
26–30 alerts + Remind me · 31 food hero (Journey's card) · 32 grace note · 34 empty state ·
35 Tomorrow · 36 Next 5 days · 37 more later · 38 disclaimer · 39 tab bar · 40 Undo bar.
Moved: 3 counter (header) · 8 today's cards (to the top) · 19 "No dose scheduled today" (from each
card to the section) · 24 streak explanation (top of the Dose log) · 41 drop flight (to the dial).
Merged: 4 ring + % → dial · 5 Done tile → counter.
Removed: 2 greeting (founder) · 6 Protocols tile (counts only protocols due today; 0 on rest days)
· 21 faded cards (→ rows) · 33 share toggle + card (A-29, founder 2026-09-27).
New: N1 "Due" · N2 Taken line · N3 Draw to + syringe (suggestion) · N4 Add a protocol.
Pop-ups unchanged by this layout (skin later): site picker (S-20), new-vial prompt, "Still
going?", skip confirm, pending prompt, remove-reminder confirm, errors.

## Flows (from landing on Today)

| Task | Main | Proposal |
|---|---|---|
| Log the dose due now | scroll ~2 screens + 1 | 1, no scroll |
| "Did I take X today?" | find it faded under Tomorrow | Taken line, first screen |
| Skip | scroll + Skip + confirm | Skip + confirm |
| Dose history | streak card, 1 | same |
| New user's first protocol | tab bar → + Add, 2 | Add a protocol, 1 |
| Everything else (pending, site, Undo, snooze, food, protocol) | — | same taps |

## Copy

New (6 languages, founder approval): **"Due"**, **"Add a protocol"**. Reused in new places:
"Today" (tab name), "{done} / {total} doses", "No dose scheduled today · Next dose: {date}",
"Taken", "Draw to {n} units" (Protocols calculator). Moved: the streak explanation → Dose log.
Everything else word for word.

## Engineering size

One screen rebuilt (TodayScreen.js layout/styles), no new route, no data change; the Dose log
gets the explanation. Due = `isDoseDue` (computed, unused on main); Taken line = today's logs
(already loaded); same next-dose buckets; the dial takes the ring's animation hooks (fills from
zero each visit — founder's ring rule — and receives the drop). "Add a protocol" needs one
navigation param. Draw to (if approved) reuses the Protocols calculator function and its
"more than your syringe holds" warning. Removed code: greeting, %, tiles, faded cards, tips,
share toggle/card (A-29; its 15 hardcoded colors go). Vial expiry colors → tokens.
Tests: undoBarOverlay + markTaken (FX-7) read TodayScreen's source and must stay green; i18n
parity for 2 keys; L-44 (Today → destinations) gets link tests when rebuilt.
Timing: after 1.2.5 (S-17 and S-20 edit TodayScreen now); absorbs A-29; A-44/A-45/A-46 land in
the Alerts card defined here.

## Open questions

1. Doses first, then main's order: OK?
2. Counter in the header with a dial; drop "80%" and the Protocols tile?
3. The Taken line: keep?
4. Suggestion N3, Draw to + syringe on reconstituted doses: want it?
5. Streak explanation → Dose log; empty-state tips dropped: OK?
6. One new word "Due" (for due and late), or "Due" and "Late"?
7. The journey findings: register on main now? F4b ("Yes, it's finished" hides the history)
   first.
