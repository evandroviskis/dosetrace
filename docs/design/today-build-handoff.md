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
21. Syringe scale (founder 2026-09-29): the drawn syringe on Today, the protocol screen and the
    add/edit steps shows a number every 10 units, starting at 0 (0, 10, 20 … 100 on a 100-unit
    syringe; 0 … 50 and 0 … 30 on the smaller ones). Minor ticks every 2 units, longer every 10,
    unchanged. The enlarged syringe already numbers every 10.
22. Ring math (founder question 2026-09-29, "150%"): each ring is scheduled doses taken ÷ doses
    scheduled in that window (today / last 7 days / last 30 days, counted from the protocol start
    if newer). A dose counts once, against its own schedule: an extra or duplicate "taken" never
    adds, so a ring can never show more than 100% and "{n} of {m}" never has n > m. Add a unit
    test with an extra dose logged.
23. **NEXT MAIN BUILD, not waiting for the redesign (founder 2026-09-30: "Make it fully acceptable
    and approvable. Always a priority.")** App Store 3.1.2 on the paywall. Main already has the
    billing text, Restore, trial eligibility and the store's own prices; add the rest:
    - Two working links under Restore purchases, in the app, all 6 languages:
      "Terms of Use (EULA)" -> https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
      (the same link ASC uses; the licence is Apple's Standard EULA) and "Privacy Policy" ->
      https://dosetrace.io/privacy-policy (the same URL as ASC). Open in an in-app browser.
    - The subscription's title must match what the store shows. ASC's group and products are
      named "DoseTrace Pro" while the app says "Premium": rename the ASC group and both products'
      display names to "DoseTrace Premium" (Annual / Monthly) in every ASC localization (goes to
      review with the next build). The RevenueCat entitlement id "DoseTrace Pro" is internal: leave it.
    - The billed amount stays the biggest price on each card ($59.99 per year, the per-month figure
      smaller); the length (per year / per month) sits next to every price; "Save N%" only from
      the store's real prices; no buy button until prices load.
    - The same links in the Play build (Google Play asks for the same disclosure).
    - Verify: reviewer path on a device, both themes, 135% text, each link opens the right page.
    The Graduated reskin of the paywall itself ships with the redesign.
24. **NEXT MAIN BUILD (founder 2026-09-30: "Blood tests should be limited but vials we need a
    higher cap"; then "Increase the limit to 20 scans total, including vaccines, blood tests and
    vials").** Today extract-bloodwork caps everyone at 3 scans a month (lab reports, vaccine cards
    and vial labels in one bucket) with no Premium awareness on the server, so a paying user gets
    the same 3. New caps, still one shared bucket per month:
    | Plan | Monthly scans (labs + vaccine cards + vials) |
    |---|---|
    | Free | 3 (unchanged; lab reports keep the 1-to-try gate, vaccine cards stay Premium) |
    | Premium | 20 |
    The server must
    know who is Premium: check the RevenueCat entitlement "DoseTrace Pro" for app_user_id =
    the Supabase user id via the RevenueCat REST API (secret key as an Edge Function secret),
    and grant the App Review demo account the same way lib/purchases.js does. If RevenueCat is
    unreachable, use the Premium cap (a real signed-in user never loses a paid feature to an
    outage; spend is still bounded). Months reset on the 1st (UTC, as today). The 429 response
    returns limit + premium so the message names the right number (prototype copy: "You've used
    this month's 3 free scans ... Premium includes 20" / "You've used this month's 20 scans"). Remove every "Unlimited scans / labs /
    bloodwork uploads" and "Pay per upload" string, all 6 languages (paywall, Settings upgrade
    card, Upload bloodwork sheet, My Body scan card, FAQ). The FAQ also stops listing cloud
    backup / sync as Premium. Server + billing change: ship-check Gate B, code review, device
    test as free and as Premium before upload.
25. Premium preview animations (founder approved 2026-09-30): one per Premium feature (accumulation,
    reality check, AI food log, lab scan, lab trends, vaccine scan, protocols, PDF export), ported
    from the prototype's HERO/FX engines (react-native-svg + Reanimated), "Example" tag, Reduce
    Motion = last frame, both themes. Shown from the paywall list and from every locked feature.
    The lab and vaccine preview copy use the rewritten, AI-line-safe text.
