# Journey as a dashboard (A-52) — PROPOSAL v2

Status: proposal for founder approval, 2026-09-28 (v2 after the founder's decisions on the reality
check and on "Track your progress"). No code, nothing committed, main untouched. Baseline: main @
57b6910 (app code as 7ecaf2d). Skin: Graduated v3, ink by default (Q-F open).
Mockups: `docs/design/journey-dashboard.html`.

**The question Journey answers:** "Is my body responding to what I'm doing, and what do I log
today to keep measuring it?"

## Founder decisions applied (2026-09-28)

- **Reality check lives inside Your numbers.** It is the method that turns the numbers from
  estimated into measured ("to get closer to reality"). No Reality check card, screen or hero.
- **Your numbers + Reality check = the progress feature**, and "Track your progress" gets another
  name. Proposal: **Progress** (card and screen title). It is one word and already exists in all 6
  languages (`cal_snap_title`, the old Progress card's title), so no new copy; "Track your progress"
  (`cal_track_title`) retires. "Your numbers" stays as the section where you enter your numbers.
  The name is the founder's call (Q-N).
- **No day bars.** The 21-day bars and day counters are not important data; they go, and so does the
  7-tick food-day strip. Graduated scales stay only where they carry a real value (syringe units,
  doses left, the weigh-in trend).
- Earlier: keep the subtitle; weigh-ins and history free; snapshots automatic (A-53); enter once,
  used everywhere (A-54); form open until the first plan.

## 1. Structure

**Dashboard (Journey tab)**, My Body's hub pattern in the Graduated skin, three cards, no group
headers:

1. Header: **Journey** + "Track how your body is actually responding."
2. **AI food log** card: today ("Today: {n} items · ~{kcal} kcal" / "Nothing logged yet today") and,
   while a check runs, "{n} of 7 days in a row" (text). Tap → **FoodChat** (existing).
3. **Progress** card = the hero, two numbers: **Weight** (latest weigh-in, "−3.4 kg since Aug 31")
   and **Daily burn (TDEE)** with **Estimated** or **Measured**. Tap → **Progress** screen.
   Tiles (v5, founder 2026-09-29 "lots of empty space"): no fixed height, 34 pt numbers, Daily burn
   and Est. level on the same line across the pair. The weigh-in dots and the check's
   "In progress · weigh in {date}" line live only on the Progress screen (and in the reminder);
   putting the date back on the tile costs one line.
4. **Dose accumulation** tile (founder 2026-09-29: the number, not a graph): the compound it opens on
   (§5) and its current estimated level, labelled **"Est. level"** (`curve_current_level`, the Curve
   screen's own label and number) with the "Estimated" chip. Never "blood level": it is a model from
   the doses, not a measurement. Tap → **Accumulation Curve** (existing).
5. Footer: Understand the numbers ▸ · Sources & references ▸ (expand in place).

**Progress screen** (the one new route), top to bottom:

1. Title **Progress**.
2. **Hero:** Weight (large) and Daily burn (large) with Estimated / Measured and its source line
   (formula · BMR, or "Measured from your reality check · estimate N"); under both, "Since {date}:
   Weight ±x · Waist ±y".
3. **Your numbers:** header with Metric / Imperial; Weight, Body fat, Waist fields (every settled
   change is a weigh-in, A-53; the only place the screen asks for a weight); then Setup (height,
   body-fat source + hint, activity; sex/age only if unknown), open until the first plan exists,
   then one row behind **Edit**.
4. **Reality check** (how Daily burn becomes Measured), by state:
   - *Not run yet:* the one-line why ("Three numbers you already know reveal your ACTUAL
     maintenance…"), start day (today or up to 7 days back), "Log today & set my reminder" using the
     latest weigh-in (A-54), the reminder hint, the food-log line.
   - *Running:* "In progress · weigh in {date}", the start weigh-in (① kg · date), the 7-day rule line
     while the food run is short, "Your reality check so far ▸" (run, totals, days with nothing
     logged), the Food-log reminder switch, Start over · Stop reality check. From day 14, when a result
     is possible: "Use my food log", "See my actual maintenance" (Q-B).
   - *Result:* the number moves up into the hero as **Measured**; the section keeps the rate, the
     vs-estimate line, "What's likely going on", "Save this check", "Weigh in again in {n} days",
     "Your checks over time".
5. **Weigh-ins:** trend chart (weight + waist, measured points), newest five, "Show ▸",
   "+ Add a past weigh-in".
6. **Your target:** bar, ETA, basis, healthy range.
7. **Your daily plan:** protein, Lose / Maintain / Gain, BMI and macro chips, warnings, "What this is
   ▾", estimate note (daily burn is in the hero, not repeated) · wellness disclaimer.
8. Understand the numbers · Sources & references.

**FoodChat (existing):** unchanged except "See how it works" under its first message.

**Where the Journey food logger goes (NutritionLogger.js):** entries + fix → FoodChat (already there)
· today's line → the AI food log card · check intake, run rule, totals, days with nothing logged,
reminder switch → Progress › Reality check · See how it works → FoodChat.

## 2. Fate of the 27 items

| # | Item on main | Lives in | Exactly where |
|---|---|---|---|
| 1 | Title "Journey" | Dashboard | header |
| 2 | Subtitle | Dashboard | header |
| 3 | Dose accumulation | Dashboard card | card 3 → Curve on the chosen compound (§5) |
| 4 | "What this is" | Progress + footer | "What this is ▾" in Your daily plan; first entry of Understand the numbers |
| 5 | Your numbers header | Progress screen | the section where you enter your numbers (header of Weigh in + Setup) |
| 6 | Metric / Imperial | Progress screen | Your numbers header, right |
| 7 | Weight / Height | Progress screen | weight in Your numbers fields; height in Setup |
| 8 | Body-fat source | Progress screen | Setup |
| 9 | Source hint | Progress screen | Setup, under 8 |
| 10 | Body fat / Waist | Progress screen | Your numbers fields (A-53) |
| 11 | Waist hint | Progress screen | under the waist field |
| 12 | Activity header | Progress screen | Setup (A-54 flag) |
| 13 | Activity options | Progress screen | Setup |
| 14 | Your target | Progress screen | after Weigh-ins |
| 15 | Estimate prompt | Dashboard card + screen | Progress card empty text; top of the open form |
| 16 | Wellness disclaimer | Progress screen | under Your daily plan |
| 17 | Track your progress | Dashboard card + screen (merge) | renamed: the card and screen title **Progress** (Q-N); the old header retires |
| 18 | Daily intake ▸ | Dashboard card (merge) | merged into the AI food log card; detail: entries → FoodChat, intake/totals/unlogged days → Progress › Reality check |
| 19 | AI food log card | Dashboard card | card 1 → FoodChat |
| 20 | See how it works | FoodChat | under the first message |
| 21 | Food-log reminder | Progress screen | Reality check section (Settings unchanged) |
| 22 | 7-day rule line | Progress screen | Reality check section, while the food run is short |
| 23 | Reality check row | Progress screen | Reality check section with its status and weigh-in date (off the tile since v5); its result = the hero's and the tile's Measured daily burn |
| 24 | Progress card | Progress screen | Weigh-ins: trend + list + "+ Add a past weigh-in"; its title now names the whole screen; Save a snapshot removed (A-53) |
| 25 | Understand the numbers | Footer + Progress | dashboard footer; bottom of Progress |
| 26 | Sources & references | Footer + Progress | same |
| 27 | Tab bar | Dashboard | Progress opens over it (Q4) |

27/27 placed; nothing deleted except what the founder removed (Save a snapshot, the day bars).

## 3. Flows: tap path before → after

From landing on Journey; typing not counted.

| # | Flow | Before (main) | After | Change |
|---|---|---|---|---|
| F1 | Log food | 1 (screen 3) | AI food log card · 1 | same, no scroll |
| F2 | Food-log reminder | 1 | Progress → switch · 2 | **+1** |
| F3 | Set / edit a target | 2 | 3 | **+1** |
| F4 | First entry of your numbers | 0 | card → form open · 1 | **+1** |
| F5 | Metric / Imperial | 1 | 2 | **+1** |
| F6 | Body-fat source / activity | first 1 · daily 2 | first 2 · daily 3 | **+1** |
| F7 | See the reality check | row · 1 (screen 3-4) | Progress card · 1 | same |
| F7b | Start the check | row → button · 2 + type weight | card → button · 2, weight from the latest weigh-in | same, no typing |
| F7c | Finish the check | 4 | card → Use my food log → See my actual maintenance → Save this check · 4 | same |
| F8 | Save a snapshot | 1 | 0 (automatic) | shorter |
| F9 | Add a past weigh-in | 2 | 3 | **+1** |
| F10 | Sources | 2 | 2 | same |
| F11 | One explainer | 2 | 2 | same |
| F11b | Read "What this is" | first 0 · daily 1 | 2 | **+2 / +1** |
| F12 | Dose accumulation | 1, newest protocol | 1, chosen compound | same; saves the picker |
| F13 | Today's food entries | 1 | 1 (FoodChat) | same |
| F13b | Totals / check intake | 1 | card → "Your reality check so far" · 2 | **+1** |
| F14 | See how it works | 1 | 2 | **+1** |
| F15 | Lose / Maintain / Gain | 1 | 2 | **+1** |
| F16 | Fix a food entry | 2 | 2 | same |
| F16b | Mark a day not recorded | 2 | 3 | **+1** |
| F17 | Sex gate | 1 | 0 if in the profile; else 2 | shorter / +1 if unset |
| F18 | Weigh-in history / trend | 0 (screen 4, Premium) | 1 (free) | **+1**, now free |
| F19 | Record today's weight | 2 | 1 (auto) | shorter |
| F20 | See daily burn | 0 | **0 — on the Progress card** | same |
| F21 | Today's reality-check alert | 2 | 1 (lands on Progress) | shorter |
| F22 | Check / check-in notification | 2 | 1 (Progress) | shorter |

Longer: F2, F3, F4, F5, F6, F9, F11b, F13b, F14, F15, F16b, F18 (+1 each; F11b +2 first-time), F17
only when sex is unknown. Shorter: F8, F19, F21, F22, F12 when not the newest.

## 4. Empty state per card (existing strings)

| Card | Empty text | Tap |
|---|---|---|
| AI food log | "Nothing logged yet today"; locked: `nutri_hero_locked` / `nutri_hero_locked_premium` | FoodChat (locked → Paywall) |
| Progress | "Enter your weight and body fat (or height, age and sex) to see your estimate." | Progress, form open |
| Dose accumulation | `body_card_dosing_desc`; free: PRO | Curve (free → preview / Paywall, Q5) |

Inside Progress, the Reality check section before any weigh-in shows only its one-line why and
"Not run yet — tap to start" (`cal_rc_sb_run`); starting needs a weigh-in first.

## 5. Dose accumulation: opening compound (A-41 + founder rule)

Open on (1) the compound last viewed (saved per user) if still active and charted; else (2) the
compound of the most recent dose marked Taken; else (3) the first active protocol (today). Blend = all
its components; one unit per chart. Code: pure helper `initialSelection()` (tests first) used in
`SerumCurveScreen.fetchData` (:283-288); `toggle()` (:310-320) saves the selection; one small query
for the newest Taken dose next to `getTakenLogsSince` (lib/database.js:265). **Both tabs:** keep the
card in Journey and My Body (one screen, one compound).

**The tile's number.** The Curve screen computes "Est. level" inline (`SerumCurveScreen.js` ~372-410:
the protocol's scheduled doses from `expectedDosesOn`, each × `amountFraction(entry, hours since
dose)`, summed at "now"). Move that into one pure lib function (e.g. `estimatedLevelNow(protocol,
now)`) used by both the screen and the tile, so they always show the same number; test: the tile value
equals the screen's "Est. level" for the same fixtures (single compound, blend component, fast
compound, IU compound excluded).

**Honesty limits the tile makes more visible** (already registered): the estimate follows the
**planned schedule**, not the doses marked Taken, so a skipped dose still counts; and past dates use the
protocol's current dose (F-051, journey-review F2/F3). **A-07** (reword the disclaimer to "based on your
planned schedule", 6 languages) should ship with this tile, or the estimate should count only Taken
doses (a model change: pharmacometrician review + founder decision) — Q-L. Fast compounds (TB-500,
BPC-157) read about 0.0 mg between doses, as the Curve screen does today (`curve_fast_note`) — Q-M.

## 6. New copy (founder approval, 6 languages)

| Key | Proposal (en) | Why |
|---|---|---|
| reuse `cal_snap_title` | **Progress** as the card and screen title | the progress feature's name (Q-N); no new strings |
| retire `cal_track_title` | ("Track your progress") | replaced by the card title |
| new | **Weigh-ins** | history heading (A-53) |
| new (replaces `cal_snap_need_more`) | **Two weigh-ins make a trend.** | the old line says "Save one now…" |
| edit `nutri_no_check` | "Start a reality check — what you log during it becomes its intake." | drops "in the calculator" |
| edit `pw_prem_reality`, `paywall_feat_6` | **Reality check** (was "… & progress tracking") | history and trend are free |
| retire | `cal_snap_save`, `cal_snap_sub`, `cal_snap_need_more` | button gone ("Snapshot saved" stays) |
| optional | **Food** as the food card title | Q2 |

## 7. Premium and A-54

Premium, unchanged from main: the Accumulation Curve; the AI food log after the free days; the
reality check after the trial (Stop always reachable); the measured ETA line. Free (changed): the
Progress screen, weigh-ins, history, trend, past weigh-ins.

A-54: current weight = latest weigh-in everywhere (card, hero, plan, target, both reality-check
weigh-ins); sex and age from the profile; units from the Your numbers header. **The reality check no
longer asks for a weight**: start and finish use the latest weigh-in (Q-A). Still asks: the 5-level
activity (profile has 4 levels, A-54 later); age only if `birth_year` is missing.

## 8. Engineering size

**Routes:** 1 new (`Progress`); reused `FoodChat`, `SerumCurve`. No new tables.

**Out of CalculatorSection.js:** numbers form, target, daily plan, reality-check panel, Progress, learn
+ sources → the Progress screen (the reality check as one section component); shared state and loaders
→ a store with pure selectors (latest weigh-in, change since start, burn + source, check status,
today's food) so the dashboard never mounts the calculator. NutritionLogger.js splits (§1); FoodLogHero
gets a compact card variant; JourneyScreen.js becomes the dashboard; Today's alert and the two
notifications land on Progress. The Curve's "Est. level" math moves into lib and is shared with the
Dose accumulation tile (§5).

**Size:** A-52 ≈ 3.5 sessions (store + selectors; Progress screen incl. the reality-check section;
logger split; dashboard + navigation + deep links + FoodChat link), plus A-41 ≈ 0.5, A-53 ≈ 1, A-54 ≈ 1
(already in the 1.2.6 registry).

**Risks:** state shared across two screens (flush the 900 ms input save on leave); reality-check logic
is the most tested surface (move UI only); the reality check reading the latest weigh-in changes a flow
(tests + journey review); landing links need app-map tests; paywall copy; both themes.

## 9. Open questions

- **Q-N** Name of the progress card and screen: **Progress** (existing, recommended), or "Your
  progress" (new, 6 languages)?
- **Q-A** The reality check uses the latest weigh-in for its start and final weight instead of its own
  "Weight today" / "Weight now" fields (A-54). OK?
- **Q-B** Show "Use my food log" and "See my actual maintenance" only from day 14, when a result is
  possible (today they show from day 1 and return "too short")? Behavior change: journey review.
- **Q-C** The copy in §6.
- **Q2** Food card title: "AI food log" or "Food"?
- **Q4** Progress full-screen with the tab bar hidden, or inside the Journey tab?
- **Q5** Free users on the Journey Dose accumulation card: the example curve first, like My Body?
- **Q6** Accept the +1 flows: F2, F3, F4, F5, F6, F9, F11b, F13b, F14, F15, F16b, F18?
- **Q-L** The tile's Est. level follows the planned schedule (a skipped dose still counts). Ship A-07's
  wording with it, or change the estimate to count only doses marked Taken?
- **Q-M** Fast compounds show about 0.0 mg between doses (same as the Curve screen). Keep?
- **Q7** Activity 5 levels vs the profile's 4 (A-54, later).
- **Q-F** Ink or Cobalt for the primary action.

Resolved: Q1 (reality check inside Your numbers → Progress), Q3 (daily burn on the card),
"Track your progress" header (becomes the Progress card).
