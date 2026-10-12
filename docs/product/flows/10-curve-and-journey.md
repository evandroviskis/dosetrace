# 10 — Dose accumulation curve and the Journey dashboard

> Draft for founder review, written 2026-10-12 from `docs/product/research/05-curve-journey.md` (main source), `01-protocols.md` (§7.1 history, end/restart), `04-food-reality-progress.md` (food hero, Progress tile), `docs/decisions.md` (Journey dashboard 2026-09-29; Dose accumulation 2026-09-24…2026-10-02; PK model; A-41 last view) and `docs/specs/my-body.md` (MB-4, MB-6), `book-layout.md` (BK-5, BK-6). Code @ 4dade55; curve tests 75 pass (05 §0).
> Shows the **intended** behaviour; **Divergence today** notes cite the dossier.

---

## 1. Goal

**Dose accumulation** is an educational, pure-math estimate of how much of each compound may be present over time, drawn from the protocol's **planned schedule** and **published half-lives** — never a measurement, never advice ("never says 'your level will be'"). It is the flagship Premium feature. **Journey** is the dashboard answering "Is my body responding to what I'm doing, and what do I log today to keep measuring it?": the AI food log card, the Progress tile and the Dose accumulation tile, then "Understand the numbers" / "Sources". The tile, My Body's card and the curve show **the same compound and the same Est. level** (MB-4, decision 2026-09-29).

## 2. Actors

| Actor | Role |
|---|---|
| User (Premium) | Opens the curve, picks compounds, combined total, horizon, a readout date. |
| User (free) | Sees the Premium tag + description; tap → Paywall (Journey) or preview sheet → Paywall (My Body). |
| `serumModel` + `halfLives` + `curveSampling` | Owners of the math: schedule × half-life (Bateman with Tmax for 4 compounds). |
| `curveView` / `curveViewStore` | Remembered view per user, device-local (A-41). |
| `hasPremium` | One entitlement helper. |
| Journey tiles | Progress (`progressTile`) and Dose accumulation (`defaultCurveLevel`). |
| Food card (`FoodLogHero variant journey`) | Today line + 7-day run (flow 07). |

## 3. Preconditions

- Curve: Premium; at least one recon / rtu protocol with a half-life entry, a dose > 0, and a dose unit that converts (mg, mcg, g; IU only for IU-native compounds).
- Journey: signed in; nothing else.

## 4. What may already have happened before

| # | Prior state | What the curve must do |
|---|---|---|
| P1 | Started the compound weeks before installing | Curve estimates from the start date; dashed vertical marker + "Before {date}: estimated from your start date" when the creation day is in the window (A-30 C, approved as built 2026-10-03); with `history_from` nothing before that day. |
| P2 | Ended a protocol last month | Offered "· ended" for 365 days after the end; decays after the end day. |
| P3 | Ended then restarted | Two runs; same-substance runs can form a Combined total; **tile and curve must show the same run** (D1). |
| P4 | Edited the dose mid-cycle | One current dose is applied to every past and future dose (history rewritten) — open founder item F2. |
| P5 | Skipped or missed doses | Still counted (schedule-driven, disclaimer says "planned schedule") — open A-31 / pharmacometrics review. |
| P6 | Oral only | Empty state; orals never named (G6). |
| P7 | Insulin, IGF-1 LR3, Dihexa… (excluded) | Named as "Not charted: … There is no reliable half-life data…". |
| P8 | IU dose of a mass compound | "Not charted: {names}. Edit the dose to mg to chart it (IU for HGH, HCG, HMG and FSH)." |
| P9 | Last opened with only testosterone selected | Reopens exactly so (A-41, founder 2026-10-02); a protocol created later never joins. |
| P10 | Premium lapsed | Curve guard → Paywall; tile Premium tag. |
| P11 | DST change in the last 14 days | Tile and curve must agree (D2). |
| P12 | Signed out and in again on the same phone | Remembered view keyed by local ids → falls back to the newest protocol (D10, SUSPECTED). |

## 5. Happy path

```mermaid
flowchart TD
  A["Journey tab"] --> B["AI food log card (flow 07)"]
  A --> C["Progress tile (flow 09)"]
  A --> D["Dose accumulation tile"]
  D --> E{"Premium?"}
  E -->|unknown yet| E2["Premium tag shown, a tap now goes to Paywall (D7)"]
  E -->|no| F["Premium tag + description, tap: Paywall source journey_serum"]
  E -->|yes, a charted protocol| G["Tile: dot, name, Est. level number + unit, Estimated chip"]
  G --> H["Tap: Dose accumulation screen (phone push / Fold right page)"]
  H --> I["Restore last view: remembered compounds, Combined, horizon"]
  I --> J["Opening: 2.4 s draw of the past, Now rises, projection dashed, dose ticks"]
  J --> K["Hero Est. level now + Estimated chip, stats Est. level, Half-life, Doses counted"]
  K --> L["Change compounds / Combined / Project ahead +7..+90 d / Estimate on a date"]
  L --> M["Saved view, notify curve changed: Journey tile reloads the same compound"]
```

## 6. States and transitions

### 6.1 Curve screen

```mermaid
stateDiagram-v2
    [*] --> CheckingPremium: focus
    CheckingPremium --> Paywall: not Premium (stack replace, embedded navigate)
    CheckingPremium --> Loading: Premium
    Loading --> Empty: no charted protocol (reasons listed, orals silent today)
    Loading --> Chart: at least one charted
    state Chart {
        [*] --> Intro
        Intro --> Settled: 4.8 s, tap, Reduce Motion, any change
        Settled --> Settled: toggle compound, horizon, combined, readout date
    }
    Chart --> CheckingPremium: refocus
```

### 6.2 Selection and remembered view

```mermaid
stateDiagram-v2
    [*] --> Restore: load view for this user
    Restore --> Remembered: saved ids still charted (first unit only)
    Restore --> DefaultView: nothing valid, newest protocol, Combined on, +7 d
    Remembered --> Single
    DefaultView --> Single
    Single --> Multi: add a same-unit compound
    Multi --> Single: remove until one left
    Single --> Single: remove the last, ignored
    Single --> Single: pick an other-unit compound, it alone
    Multi --> Single: pick an other-unit compound, it alone
    note right of Multi: each change saved per user on the device and the tile follows
```

### 6.3 Window and readout

```mermaid
stateDiagram-v2
    [*] --> Today3d: no readout date, 3 days back
    Today3d --> ChipDate: tap an upcoming dose day or a bloodwork date chip
    ChipDate --> Today3d: tap the same chip again
    Today3d --> Wheel: Other date
    Wheel --> CustomDate: Done
    CustomDate --> Extended: more than 3 days back, window min(365, back + 1)
    ChipDate --> Extended: bloodwork date more than 3 days back
    Extended --> Before365: more than 365 days back, compound rows show a dash, Combined row still a number
    CustomDate --> Future: after the horizon, value from its own schedule, no marker
```

### 6.4 Journey Dose accumulation tile

```mermaid
stateDiagram-v2
    [*] --> Unknown: premium null (tag shown)
    Unknown --> Free: hasPremium false
    Unknown --> PremiumNoData: true, no charted active protocol
    Unknown --> PremiumLevel: true, a level
    PremiumLevel --> PremiumLevel: curve view changed, reload
    Free --> Paywall: tap
    PremiumNoData --> Curve: tap
    PremiumLevel --> Curve: tap
```

## 7. Alternative and exception paths

### 7.1 Math (published, honest)
- Charted only recon / rtu with a half-life entry and a convertible dose; blends split by their common ratio into "Blend · Component (est.)" lines (KLOW 50/10/10/10, GLOW 50/10/10, Wolverine 1/1).
- Doses from the schedule (`expectedDosesOn`), placed at fixed local hours (1/day at 12:00; 2/day 06 and 18; 3/day 06, 12, 18), snapped to a 6 h grid; calendar-day stepping (A-101b, the 25 h fall-back day counted once).
- Level = Σ dose × f(Δt): exponential, or Bateman with Tmax for Semaglutide, Testosterone Cypionate, Testosterone Undecanoate, Sustanon 250. Look-back max(16 days, days in the shown window + 2, 6 × t½) capped 600 days (`serumModel.js:94-99`; an earlier readout date widens the shown window and so the look-back).
- Units: mg except IU-native (HGH, HCG, HMG, FSH; HGH mg→IU × 3); one unit per chart.
- Sex-neutral: no sex / weight / body-fat input (decision 2026-09-09; never a global sex fudge).
- **Divergence today (05 D6, G9):** the fixed 12:00 dose hour is never disclosed; a 22:00 dose counts 10 h early in "Est. level · now" (decisive for t½ < 6 h compounds). → DL-31 (doses at the user's times; pharmacometrician check).
- **Divergence today (05 D5, G5; A-96):** "Doses counted" counts only the visible window while the level uses doses back to 6 half-lives.
- **Divergence today (05 G8; verification 05 O-2):** copy still says "log doses to see your curve" / "compound amounts you logged" although the model is schedule-driven. Two more live strings say the same in all 6 languages: `paywall_hero_sub` ("Dose-accumulation curves from your own log…", `PaywallScreen.js:278`) and `settings_premium_feat_1` ("Dose accumulation curve from your own log", `SettingsScreen.js:642`) — contradicts AD-19 (planned schedule).
- **Divergence today (05 G6):** orals are dropped before the "not charted" reasons, so they are silently absent although the screen promises compounds are "named on screen, never dropped silently".
- **Divergence today (05 G7):** `substance_boldenone` missing in all 6 languages (a Boldenone Combined total would show the raw key).
- **Divergence today (05 G10):** decision 2026-09-18 / 2026-09-24 (decisions.md:205) says blend components are dashed "(est.)" lines; the code draws them like any compound (solid past, dashed future). **OPEN-18 (1)** (was DL-32) whether the as-built style replaces the founder's dashed-line decision is not decided: it overrides his own visual line, so it goes on the A-97 deviation list with a picture (as built vs dashed) for his pick — not a logic decision.

### 7.2 Tile = curve (MB-4)
- **Intended:** tile, My Body card and the curve show the same compound and number.
  - **Divergence today (05 D1, script-verified):** the curve offers active + ended protocols, the tile/My Body only active → after End/Restart the curve can open on the ended run (68.53 mg) while the tile shows the new run (10.04 mg).
  - **Divergence today (05 D2, script-verified):** for up to 14 days after a DST change the tile (14-day grid) and the curve (3-day grid) snap doses 1 h apart → BPC-157 0.5 mg daily, New York 2026-11-06 12:30: tile 0.0625 mg vs curve 0.25 mg; 2027-03-19 tile 0.0 mg (at 250 mcg the same moment gives 0.031 vs 0.125). It also runs the other way: at 11:30 the tile shows a dose the curve does not have yet (250 mcg: tile 0.125 vs curve 0.0 mg). Equal again about 14 days after the change (verification 05, D2 table).
  - **Divergence today (05 D3):** on the Fold, My Body's left card does not follow a curve change on its right page until refocus (no 'curve' listener). My Body also never reloads on a sync pull (no `addSyncListener`; verification 05 O-4).
  - **Divergence today (05 D4):** picker rows name blend components without the blend ("BPC-157" vs "Wolverine · BPC-157 (est.)").
  - **Divergence today (05 G11):** the planned second fallback "compound of the most recent Taken dose" before the newest protocol was not built (no decision dropping it).

### 7.3 Premium gating
- Curve guard on every focus; tiles ask on focus. Journey `premium` starts unknown and reads as free.
  - **Divergence today (05 D7, by design):** a Premium user who taps before the answer lands on the Paywall ("You already have Premium").
- Free: Journey tile → Paywall (`journey_serum`, no preview sheet); My Body card → preview sheet "See your compound build up" → Paywall (MB-6); Dose log "Curve" → Paywall (`log_serum`); direct → replace with Paywall (`serum_direct`).
- **Divergence today (05 G12; A-98):** a Journey tile tap fires no analytics event.

### 7.4 Offline / killed / second device
- The curve is computed locally from SQLite; works offline; the premium check falls back to the cached entitlement (future expiry = Premium).
- The remembered view is device-local per user and not synced (decision 2026-10-02) → a second phone opens on its own last view.
- **SUSPECTED (05 D10):** after sign-out / sign-in on the same phone the view falls back (local ids change).

### 7.5 Timezone / DST / midnight
- All dose times are local wall-clock; travel shifts the whole series. DST: see D2. **Divergence today (05 E19):** a curve left open keeps "now" frozen until something changes; the tile recomputes on focus or curve change.

### 7.6 Notification tap
- No notification opens the curve.

### 7.7 Fold
- Journey book: left = dashboard; right = Progress by default; the food card opens the chat on the right; the Dose accumulation tile opens the curve on the right for Premium (Paywall full screen for free) (BK-5). Losing Premium while the curve is on the right clears the selection. Folding with the curve open pushes it; unfolding a pushed curve moves it to the right page. Embedded screens never goBack / replace (BK-22).

### 7.8 Free vs Premium (summary)
| Surface | Free | Premium |
|---|---|---|
| Journey tile | "Premium" tag + "See how your doses may add up over time…" | dot, name, "Est. level", number + unit, "Estimated" |
| My Body card | tag + lock, preview sheet | same as Journey (same compound and number) |
| Dose log "Curve" | Paywall | curve |
| Onboarding / Paywall | example curve labelled "Example" | — |

### 7.9 Journey dashboard
- Order (approved 2026-09-29): header "Journey" + "Track how your body is actually responding."; AI food log card full width; Progress and Dose accumulation tiles side by side (stack at ≥ 130 % text); "Understand the numbers" and "Sources & references" folds.
- Not on Journey: adherence (Today, Dose log, report) and labs (My Body).

## 8. What every surface shows

| State | Curve screen | Journey tile | My Body card | Dose log button |
|---|---|---|---|---|
| Free | Paywall | Premium tag + description | tag + lock, preview sheet | → Paywall |
| Premium, nothing charted | "No compatible protocols" / "Nenhum protocolo compatível" + reasons | chevron + description | description | → curve (empty) |
| Premium, one compound | hero "Est. level · now" 56 pt + "Estimated"; stats Est. level / Half-life / Doses counted; chart solid past, dashed shaded future, dose ticks; disclaimer | name + Est. level | same as tile (intended) | → curve |
| Several compounds | hero row per series; legend with tier, level, t½; Combined toggle if same substance | first remembered compound | same | — |
| Ended protocol selected | label "· ended"; decays | not shown (intended: same as curve) | — | — |
| Declared history in window | dashed marker "Before {date}: estimated from your start date" | — | — | — |
| Readout date chosen | dashed marker + date + dots; "Estimate on a date" card with values side by side (never compared to a lab value) | — | — | — |
| Future start | level 0; projection only if inside the horizon; nothing drawn if beyond | 0 | — | — |

## 9. Data written at each step

| Step | Store | Write |
|---|---|---|
| Change compounds / Combined / horizon | AsyncStorage `dosetrace_curve_view_{userId}` `{selectedIds, showCombined, futureDays}` (read → merge → write, never on open) | not synced (decision) |
| Readout date | none (never remembered) | — |
| Change | event `notifyDataChanged('curve')` | Journey reloads |
| Analytics | Body / Log `viewed('serum_curve')`; Journey none (G12) | anonymous |
| Nothing else | the curve reads `protocols`, `biomarkers.report_date` (chips); never `dose_logs` | — |

## 10. Rules (with sources)

R1–R6 which protocols are charted (recon/rtu, blends, exclusions, ended ≤ 365 d). R7–R9 units. R10–R16 schedule-driven doses, fixed slots, calendar stepping, look-back, history_from. R17–R25 math, ticks, labels. R26–R30 window (3 days default) and horizon (7 default; 7/14/30/60/90). R31–R36 styling (solid past, dashed projection, ink Combined, estimated marker, readout marker, opening motion with Reduce Motion). R37–R40 remembered view. R41–R43 Premium. R44–R47 disclaimers and honesty. R48–R51 PK hard lines (no interpretation, sex-neutral, insulins excluded, never "your level will be"). R52–R54 Journey tiles. (`05 §4`.)

## 11. Divergences today (summary)

| ID | Intended | Today | Source | DV |
|---|---|---|---|---|
| D10-1 | Tile / My Body / curve same compound after end/restart | Curve may open the ended run | `05 D1, G1` | DV-067 |
| D10-2 | Same number across DST | 14 d vs 3 d grid differ | `05 D2, G2` | DV-068 |
| D10-3 | My Body card follows a curve change on the Fold | Stale until refocus | `05 D3, G3` | DV-152 |
| D10-4 | Picker names blend components with the blend | Component only | `05 D4, G4` | DV-153 |
| D10-5 | Doses counted = doses in the estimate | Window only | `05 D5` (A-96) | DV-096 |
| D10-6 | Fixed dose hour disclosed | Not disclosed | `05 D6, G9` (DL-31) | DV-069 |
| D10-7 | Orals named as not charted | Silent | `05 G6` | DV-155 |
| D10-8 | Boldenone substance name ×6 | Missing key | `05 G7` | DV-070 |
| D10-9 | Copy says "planned schedule" everywhere | "log doses", "you logged"; Paywall hero and Settings Premium line "from your own log" | `05 G8`; verification 05 O-2 | DV-071 |
| D10-10 | Journey tile tap counted | No event | `05 G12` (A-98) | DV-105 |
| D10-11 | Readout > 365 days back explained, every row the same | Dash, no explanation; the Combined row still prints a computed number | `05 G16`; verification 05 O-3 (`SerumCurveScreen.js:1021` vs `:1031`) | DV-158 |

## 12. Founder questions (canonical IDs — `docs/product/OPEN-DECISIONS.md`)

Reconciled 2026-10-12: every question this flow raised has one canonical ID in `OPEN-DECISIONS.md` — **OPEN-xx** waits for the founder (asked in the one Portuguese round there), **AD-xx** is already decided by the ledger or a signed spec, **DL-xx** is decided by product logic (recorded in `docs/decisions.md`; the founder may override). DV-xxx is the defect row in `DIVERGENCES.md`.

- **DL-31 — Fixed dose hour** (D10-6). Decided by logic: the curve places doses at the user's own reminder times (fixed hours only without times), with a pharmacometrician check. → DV-069.
- **OPEN-10 — Dose edits apply forward only (F2).** Waits for the founder. → DV-005.
- **OPEN-11 — Missed / skipped doses lower the curve (A-31).** Waits for the founder. → DV-072.
- **OPEN-18 (1)** (was DL-32) — Blend lines.** Not decided: the as-built style (solid past / dashed future like any compound) versus the founder's own line decisions.md:205 (dashed "(est.)" component lines). decisions.md:209 does not mention blends, so it cannot override :205; the item goes on the A-97 deviation list with a picture (as built | dashed) for the founder's pick. → DV-156.

## 13. Acceptance checks (agent-device QA script)

Account Test03 with a temporary Premium promo; protocols **Testosterone Cypionate** (rtu 100 mg weekly), **BPC-157** (recon daily 250 mcg), **Zinc** (oral). Light and dark; PT via Settings → Preferências → Idioma. Screenshot before every tap.

**F10-01 — Journey order**
- Expect: "Journey" / "Evolução" + "Track how your body is actually responding." / "Acompanhe como seu corpo está realmente respondendo."; AI food log card; tiles "Progress" / "Progresso" and "Dose accumulation" / "Acúmulo de doses" side by side; "Understand the numbers" / "Entenda os números"; "Sources & references" / "Fontes e referências".

**F10-02 — Free tile**
- Setup: no Premium.
- Expect: tile "Premium" tag + "See how your doses may add up over time, from your planned schedule and published half-lives. A math estimate — never a measurement."; tap → Paywall.

**F10-03 — Premium tile = curve number**
- Expect: tile dot + "Testosterone Cypionate" + "Est. level" / "Nível est." + number + "mg" + "Estimated" / "Estimado". Tap → the curve hero "Est. level · now" / "Nível est. · agora" shows the same number (same decimals).

**F10-04 — Opening and honesty**
- Expect: past draws in, "Now" / "Agora" line, dashed shaded projection, dose ticks under the axis; axis "−3d · Now · +7d" (PT "−3d · Agora · +7d"); source card with tier "Clinical data" / "Dados clínicos" and the Tmax note; disclaimer at the bottom mentions "your planned schedule". With Reduce Motion: final frame at once.

**F10-05 — Remembered view**
- Do: picker "Choose compounds" / "Escolher compostos" → keep only BPC-157 → Done; horizon +30; leave; reopen.
- Expect: BPC-157 only, +30; Journey tile now shows BPC-157's Est. level.

**F10-06 — Unit rule**
- Setup: an HGH protocol in IU.
- Do: add HGH while Testosterone (mg) is selected.
- Expect: the selection becomes HGH alone (one unit per chart).

**F10-07 — Not charted lines**
- Setup: an IU dose on a mass compound; an Insulin protocol.
- Expect: "Not charted: {names}. Edit the dose to mg to chart it (IU for HGH, HCG, HMG and FSH)." and "Not charted: Insulin… There is no reliable half-life data for these compounds."; Zinc (oral): intended named; today silent — record D10-7.

**F10-08 — Combined total**
- Setup: two testosterone esters.
- Expect: toggle "Show combined total" / "Mostrar total combinado"; an ink line "Combined total" / "Total combinado"; hint says it is a rough sum, not active-hormone mass.

**F10-09 — Estimate on a date**
- Do: "Estimate on a date" / "Estimativa em uma data" → a bloodwork chip "{date} · bloodwork" (requires a lab in My Body) → marker on the chart and values side by side; tap again → cleared. "Other date" / "Outra data" → wheel → a date 400 days back → every compound row "—".
- Also (Combined, verification 05 O-3): with two testosterone esters and "Show combined total" on, pick a date 400 days back. Expect (intended): the Combined row also shows "—". Today it prints a computed number (`SerumCurveScreen.js:1031`) — record (D10-11).

**F10-10 — Declared history marker**
- Setup: Testosterone Cypionate created today with start 42 days ago and "Yes, same dose" (flow 02).
- Do: Estimate on a date → a date 2 days before today (still inside the default 3-day window; the marker already shows without it).
- Expect: dashed marker + "Before {date}: estimated from your start date" ({date} = the creation day, today) / "Antes de {date}: estimado a partir da data de início".

**F10-11 — End and restart (D1 check)**
- Do: End Testosterone (flow 05), Restart (New vial), open the curve.
- Expect (intended): curve and tile on the same run. Record today's values for both.

**F10-12 — DST (D2 check)**
- Setup: device zone America/New_York; date 2026-11-06 12:30; BPC-157 daily 250 mcg (the account fixture above).
- Expect (intended): tile = curve. Today: tile 0.031 vs curve 0.125 mg (labels "0.0" / "0.1") — record. (With a 0.5 mg fixture: 0.0625 vs 0.25.)
- Also (reverse gap): same zone and date at 11:30. Expect (intended): tile = curve. Today: tile 0.125 vs curve 0.0 mg (the tile counts a dose the curve does not have yet) — record.
- Also (end of the gap): 2026-11-15 12:30. Expect: tile = curve = 0.125 mg.

**F10-13 — Premium lost**
- Do: end the promo; open Journey; tap the tile.
- Expect: Paywall; reopening the curve directly replaces it with the Paywall.

**F10-14 — Fold**
- Do (unfolded Fold): Journey → Dose accumulation tile.
- Expect: the curve on the right page, no back row; change selection → the left tile updates at once. My Body → card → curve right; change → intended left card updates (record D10-3). Fold → curve pushed with back; unfold → back on the right page.

**F10-15 — Both themes**
- Chart lines (protocol colours ≥ 3:1), data blue single line, well-coloured future zone, ticks, chips, picker sheet, date wheel, Paywall entry: readable in light and dark.
