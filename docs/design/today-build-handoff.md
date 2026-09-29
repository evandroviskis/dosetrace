# Today v2.1 — build handoff for the Mac session (approved 2026-09-29)

**Status:** APPROVED by the founder on 2026-09-29 ("Approved", with the design session's
recommended answers to every open question). Build it **after 1.2.5 ships**, on the Mac, from
the Mac's own `main` (GitHub's main was 57b6910 on 2026-09-28 and is behind the Mac).
The founder sees it in the iOS Simulator (light + dark) before anything else happens.

Design source of truth: `docs/design/today-dashboard.html` (published
https://claude.ai/artifact/XidQf4a75nzeySHFeeaeZx) and `docs/design/today-dashboard.md`.
Identity rules: `docs/design/DESIGN.md` (palette, type roles, founder decisions).

Before writing code, per CLAUDE.md: register the items in `docs/review/features.md` with a target
build, write the numbered checklist in `docs/specs/` (draft below) and get it signed, run the
journey-review skill on the changed flow. Every bug below gets a failing test first.

## 1. Decisions (all founder, 2026-09-29)

1. Order: header (date + "Today") → Alerts (gone when none) → Pending from yesterday → tracker
   → AI food log + grace note (only while a reality check runs) → Doses → Tomorrow / Next 5 days
   (folded) → disclaimer. Greeting, Protocols tile, faded cards, share card (A-29) removed.
2. Tracker: one big Today gauge (% + "{n} of {m} today"), two small gauges (7 days, 30 days, % +
   "{n} of {m}"), the week as circles (done / partial / missed / rest dot), flame + streak +
   On fire!, "View history ›" → Dose log (shortcut kept).
3. Tracker block: light theme `#383C41` with the dark-palette tokens inside; dark theme the
   light block `#EEEFEB` with the light-palette tokens inside. Both measured (DESIGN.md).
4. Bolder weights on these screens: titles 700, big numbers 500 (v4 sizes unchanged).
5. Dose card: whole card → that protocol; Skip + Mark taken on the card; outline "Due" tag in the
   attention color (no card outline); Draw to {n} units + the protocol's syringe drawn to scale on
   reconstituted doses with a mixed vial (reuse the Protocols calculator function and its "more
   than your syringe holds" warning, never a second formula); every item main shows stays.
6. Taken line under the cards (tap → times). Tomorrow + Next 5 days in one list, folded, counts.
7. My Protocols opens on two heroes: Protocols (count + names + low-supply line → the existing
   list) and Dose log (Taken / Skipped / Missed + last dose → the Dose log). "+ Add" in the header.
   The streak explanation moves to the top of the Dose log. Empty-state tips removed.
8. No AI adherence explainer (council: regulatory, pharmacometrics, product all said no).

## 2. Ring counting rule (pure function + unit tests)

- Doses, not days: taken ÷ due.
- Today: every dose scheduled today is the denominator (day progress); none scheduled →
  "Nothing due", never 0%.
- 7 / 30 days: rolling windows ending now; a dose counts once its scheduled time has passed;
  window clipped to max(window start, protocol start_date, date added); paused/finished periods
  excluded; rest days never due; as-needed doses excluded.
- A logged dose matches the nearest unmatched scheduled dose within ± half the interval → a late
  weekly dose counts as taken. A skip is not taken.
- Show counts under every %. Ring color is data blue at every value. Replaces `monthAdherence`
  (main's "this month" counted days).
- Build on `expectedDosesOn` / `existedOn` (TodayScreen / lib/schedule.js on main).

## 3. Fix with it (they corrupt the rings) — test first

- **F1** a same-day dose logged > 12 h late gets a false Missed (`lib/missedDoses.js`,
  `lib/pendingYesterday.js`).
- **F6** Today does not re-date on resume or at midnight (add an AppState/midnight listener).
- Register the rest of `today-journey-findings.md` on main (founder approved registering them);
  **F4b** ("Yes, it's finished" hides the protocol's dose history) is the most serious.

## 4. New strings (6 languages — drafts, founder approves the translations)

| key (suggested) | en | es | pt | fr | de | it |
|---|---|---|---|---|---|---|
| today_due | Due | Toca | Agora | À prendre | Fällig | Da prendere |
| today_ring_7d | 7 days | 7 días | 7 dias | 7 jours | 7 Tage | 7 giorni |
| today_ring_30d | 30 days | 30 días | 30 dias | 30 jours | 30 Tage | 30 giorni |
| today_nothing_due | Nothing due | Nada pendiente | Nada pendente | Rien à prendre | Nichts fällig | Niente da prendere |
| protocols_active | active | activos | ativos | actifs | aktiv | attivi |
| today_add_protocol | Add a protocol | Añadir un protocolo | Adicionar um protocolo | Ajouter un protocole | Protokoll hinzufügen | Aggiungi un protocollo |

Retire: greeting keys, `today_streak_monthly`, `today_tip_*`, `today_share_*`, `today_done`,
`today_done_of` (once nothing else uses them).

## 5. Acceptance checklist (draft for docs/specs — founder signs)

1. Alerts render first; with no alert the section (title included) is absent.
2. Pending from yesterday renders under Alerts with S-17 behaviour unchanged.
3. Tracker shows Today / 7 days / 30 days with % and counts computed by the rule in §2 (unit
   tests: rest day, weekly late dose, protocol added mid-window, paused period, dose later today,
   as-needed excluded, skip not taken).
4. Rest day: Today gauge shows "Nothing due", never 0%.
5. Week circles show done / partial / missed / rest for the last 7 days.
6. Tracker "View history" opens the Dose log.
7. AI food log card sits above Doses only while a reality check runs; whole card opens FoodChat.
8. Due doses first, with the "Due" tag; tapping the card opens that protocol; Mark taken / Skip
   work on the card (FX-7 markTaken test and undoBarOverlay test stay green).
9. Reconstituted dose with a mixed vial shows Draw to {n} units + the syringe to scale from the
   same calculator function, with its over-capacity warning.
10. Every item main's card shows is still visible (dose, frequency, time, skipped/partial lines,
    Day X of Y, last site, protocol streak, vial cells + line or + Add vial).
11. Taken line lists today's taken doses; tap shows times.
12. Tomorrow and Next 5 days are folded by default with counts; open shows rows; "{n} more
    scheduled later" stays.
13. Empty state shows "Add a protocol", which opens the add form.
14. My Protocols opens on the two heroes; each opens its screen; "+ Add" still one tap.
15. Dose log shows the streak explanation at its top.
16. Both themes checked on every state above, including every popup Today opens (CLAUDE.md gate);
    tracker colors exactly as §1.3; no hardcoded color outside the deliberate tracker tokens.
17. 135% text: nothing clipped; gauges keep their layout.
18. i18n parity test passes with the 6 new keys.
19. F1 and F6 fixed with failing-then-passing tests.
20. Full test suite green; `npx expo export --platform ios` completes.
