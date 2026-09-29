# Today tab — layout proposal v2.1 (2026-09-29)

Mockup: `docs/design/today-dashboard.html` (published: https://claude.ai/artifact/XidQf4a75nzeySHFeeaeZx).
Light + dark + 135%, Today in 6 states, My Protocols with the two heroes, ring rules, council
verdict, card anatomy, fate table + coverage check (green: 41 items + N1–N9), flows, copy.
Skin: Graduated v3, ink primary action. Type: v4 sizes with bolder weights (below).
Inputs: main @ 57b6910 (2026-09-28 22:52), `today-journey-findings.md`, the founder's answers.
v1 (doses first, counter in the header, main's order) is superseded by the founder's brief below.

## Founder answers (2026-09-29)

- Q1/Q2 → new brief: "Alerts at the top, as it needs to be seen. If no alerts available, alert
  section disappears. Dose tracker with rings, one for doses of the day and another one for days
  of the week completed. All from 0 to 100%. After that, Today section shows doses of the day,
  cards must be clear to read. All info that is currently available visually to the user must keep
  visible. User can click on the card and open protocol or mark as taken from today tab.
  Tomorrow's dose and next 5 days collapsible as this is not 'very important'. Dose log can go to
  protocols tab, under the protocols. Two big heroes, first protocols where user can click and
  open protocols and dose log (history) under protocols." Also: likes Journey v5 at 135%, wants a
  bolder look.
- Rings: "one for the day, one for the week, one for the month, as some doses can be once every
  7 days, once every 15 days or once a month." Wondered about an AI explaining from literature
  why on-time doses matter; unsure, asked for a council view (below).
- Heroes: on the **My Protocols tab** (confirmed).
- Bolder: **heavier numbers + ink blocks** — titles 700, big numbers 500, the tracker is a solid
  ink block.
- Q3 Taken line: **keep**. Q4 Draw to + syringe: **yes**. Q6: **only "Due"**.
- Still open: Q5 (streak explanation → Dose log, tips dropped), Q7 (register the findings).

## Structure, top to bottom

1. Header: date, large title "Today".
2. **Alerts** (the four alerts of main, Remind me) — the section is gone when there are none.
3. **Pending from yesterday** (S-17, unchanged).
4. **Tracker** (dark-grey block in light theme, light block in dark theme): three graduated rings — Today, 7 days, 30 days — each a % with
   "taken / due" under it; the week's day cells; flame + "N days without a miss" + On fire!;
   "View history ›" (tap → Dose log).
5. **AI food log** (only while a reality check runs) + grace note — above the doses (founder
   2026-09-29: "It should come before Today's doses").
6. **Doses** (title): today's cards, due first (an outline "Due" tag). Whole card → the
   protocol; Skip / Mark taken on the card. Every item main shows stays (dose, frequency, time,
   state lines, Draw to + syringe on reconstituted doses, Day X of Y, last site, protocol streak,
   vial cells + line or "+ Add vial"). Then the Taken line, or all caught up, or "No dose
   scheduled today · Next dose", or the empty state + "Add a protocol".
7. **Tomorrow** and **Next 5 days** as folding rows with their count ("4 doses"), closed by default.
8. Disclaimer.

v2.1 craft pass (founder: "looks unfinished"): annotations off by default, device chrome,
one big Today gauge + two small gauges, week as filled/half/empty circles (no dashed boxes),
syringe in a well, outline status tag instead of a black card outline, Taken as a plain row,
Tomorrow + Next 5 days in one list, 26 pt rhythm between blocks.

**My Protocols** opens on two heroes: **Protocols** (count of active protocols, names with
their color dots, the low-supply line; tap → main's list, unchanged) and **Dose log** (Taken /
Skipped / Missed counts from the log's header, last dose; tap → the Dose log, whose top now
carries the streak explanation). "+ Add" stays in the header. New users see main's empty copy.

## Ring rule (with the pharmacometrics reviewer)

Doses, not days: taken ÷ due. Today = day progress over every dose scheduled today ("Nothing
due" when none, never 0%). 7/30 days = rolling windows ending now; a dose counts once its time has
passed; clipped to the later of start date / date added; paused/finished periods and rest days
excluded; a late dose matches its own scheduled dose within half the interval and counts as
taken; a skip is not taken; as-needed doses stay out. Counts always under the %. Ring color is
data blue at every value (no red/green). Change from main: "96% this month" counted days.

## Council on the AI "why on time" explainer (regulatory, pharmacometrics, product)

All three: **don't build it.** Compound-specific "why take it on time" text is a therapeutic claim
(FDA/FTC exposure for research peptides; a dosing instruction under Apple 1.4.1; crosses the AI
hard line). Human PK data for most peptides is thin, so an AI would invent confident claims. It
also found that the Est. level curve is built from the schedule, so a missed dose doesn't change
it (F-051): "a missed dose lowers your level" would be false today. Safe alternatives (not
drawn): one fixed compound-free line; later, after F-051, ring → the user's own curve with missed
doses marked (pure math). Recommendation: drop the AI idea.

## Fate of main's items (41) + new (9)

Removed: 2 greeting · 21 faded cards · 33 share card (A-29). Motion: 41 (drop → Today ring).
Moved/merged: 3 counter → under the Today ring · 4 ring → Today ring · 5 Done → merged ·
6 Protocols tile → My Protocols hero (counts all active) · 7 pending → under Alerts · 8 cards →
after the tracker · 22 streak card → tracker · 23 week dots → tracker · 24 explanation → Dose log
top · 25 View history → tracker + Dose log hero · 26–30 alerts → top · 35/36 → folding rows.
Everything else stays. New: N1 Due · N2 Taken line · N3 Draw to + syringe · N4 Add a protocol ·
N5 7-day ring · N6 30-day ring · N7 fold rows with counts · N8 Protocols hero · N9 Dose log hero.

## Flows that got longer

Open my protocol list: 1 → 2 taps. See tomorrow: + 1 tap (open the fold). The due dose sits under
alerts and the tracker (about half a screen of scroll, vs about two on main). Dose log: 1 tap
from Today (tracker) or 2 via My Protocols.

## Copy

New (6 languages, founder approval): "Due" (approved), "7 days", "30 days", "Nothing due",
"active", "Add a protocol". Existing: Doses (today_doses), Today, Protocols, Dose log, Taken /
Skipped / Missed, empty-state strings, Draw to {n} units, streak explanation (moves).

## Engineering size

TodayScreen layout rebuilt; one new pure window-count function with unit tests for the ring
rule (replaces monthAdherence); My Protocols gets a new first screen in front of the list, plus a
route to the Dose log; ink-block tokens (opposite palette) in `lib/theme.js` for both themes.
Tests: undoBarOverlay + markTaken (FX-7) stay green; i18n parity for 5 new strings; link tests
for L-44 and My Protocols → Dose log. Timing: after 1.2.5 (S-17/S-20 edit TodayScreen now);
absorbs A-29; the My Protocols heroes need their own registry item and checklist. F1 (false
Missed) and F6 (no re-date at midnight) would corrupt the rings: fix before or with them.

## Open questions

1. Decided 2026-09-29: dark theme keeps the light inverted block; light theme uses dark grey
   `#383C41` instead of black.
2. Keep the week's day cells under the rings (the only place that shows which day was missed)?
3. Keep the tracker → Dose log shortcut on Today?
4. Streak explanation → Dose log; empty-state tips dropped: OK? (old Q5)
5. Approve the new words: 7 days, 30 days, Nothing due, active, Add a protocol (+ "Due").
6. The 30-day ring counts doses; main's "this month" counted days. OK?
7. AI explainer: drop, or only the fixed line?
8. Register the journey findings on main now (F4b first)? (old Q7)
