# Journey layout pass (A-52) — PROPOSAL v2 — SUPERSEDED

> Superseded 2026-09-28 by the dashboard direction: `docs/design/journey-dashboard.md`. Kept as
> input (A-53 merge into Your numbers, form open until the first plan). `journey-layout.html` is
> the old single-scroll mockup and is not updated further.

Status: proposal for founder approval, 2026-09-28 (v2 after founder review of #038). No code, nothing
committed. Baseline: main @ 7ecaf2d. Skin: Graduated v3, ink action by default (primary color still
open). Mockup: `docs/design/journey-layout.html`.

**The question Journey answers:** "Is my body responding to what I'm doing, and what do I log
today to keep measuring it?"

Fates: **STAY** = on screen. **DOWN** = one tap down (where + behind which tap). **MERGE** =
joins another item, all its copy kept. Nothing is deleted except what founder decision A-53 removes
(the manual "Save a snapshot" button).

## Founder decisions applied (2026-09-28)

- **A-53:** a snapshot is saved automatically on every weigh-in; the manual "Save a snapshot" goes
  away; the weigh-in history (latest weigh-ins, trend) lives with Your numbers; "+ Add a past
  weigh-in" stays.
- **First-time users:** the Your numbers form stays OPEN until the first plan exists, then collapses
  (same rule as main today, `numbersOpenEff = !plan`).
- Q1 keep the subtitle · Q3 reminder behind Daily intake is fine · Q4 daily plan collapsed with burn +
  protein as the row value is fine · Q5 keep Log food as primary with no check running · Q6 Dose
  accumulation lower is fine.

## (a) Fate of the 27 items

On screen, top to bottom: 1, 2 · hero (19 + 23 + 22) · 18 · [Your daily plan row, plan state] ·
17 · 5 (+ 6, 15, 24) · 14 · 3 · 16 · 25 · 26 · 27.

| # | Item on main | Fate | Where | Reason |
|---|---|---|---|---|
| 1 | Title "Journey" | STAY | top | Names the tab. |
| 2 | Subtitle | STAY | under the title | The screen's question in one line (Q1: keep). |
| 3 | Dose accumulation card | STAY | row after Your target | A separate tool; lower is fine (Q6). Honesty line kept as its caption. |
| 4 | "What this is" card | DOWN | behind **Understand the numbers**, first entry (and the existing "What this is ▾" toggle in the plan) | Explains the BMR once. |
| 5 | Your numbers header | STAY | first block of "Track your progress"; now holds the weigh-in history | Where you are now and how it has moved: the core of "is it responding". |
| 6 | Metric / Imperial | STAY | right side of the Your numbers header | Unit switch stays one tap. |
| 7 | Weight / Height fields | DOWN* | inside **Your numbers**: open until the first plan exists, then behind **Edit** | Setup; open when it is the only way forward. |
| 8 | Body-fat source pills | DOWN* | same | Setup. |
| 9 | Source hint | DOWN* | same | Travels with #8. |
| 10 | Body fat / Waist fields | DOWN* | same | Setup. |
| 11 | Waist hint | DOWN* | same | Travels with #10. |
| 12 | Activity level header | DOWN* | same | Setup. |
| 13 | 5 activity options | DOWN* | same | Setup. |
| 14 | Your target card | STAY | after Your numbers ("where you are → where you are going", as on main) | The destination of the progress above it. |
| 15 | Estimate prompt | MERGE | into #5, as its caption while no plan exists (sex gate / invalid-input notices use the same slot) | Tells a new user why to fill the open form; same text. |
| 16 | Wellness disclaimer | STAY | footer | Honesty line. |
| 17 | "Track your progress" header | STAY | above Your numbers / Your target / Dose accumulation | Groups the "how is it going" blocks. |
| 18 | Daily intake ▸ | STAY | row under the hero | Today's food detail one tap away. |
| 19 | AI food log card | STAY — **the hero** | first block | The daily action that keeps the measurement going; Log food = primary (Q5). |
| 20 | See how it works | DOWN | behind **Daily intake**, top | Learning aid, used once. |
| 21 | Food-log reminder + switch | DOWN | behind **Daily intake**; still in Settings | Set once (Q3: fine). |
| 22 | 7-day rule line | MERGE | into the hero, under the day scale | The running check's progress. |
| 23 | Reality check row | MERGE | into the hero: status line; its header opens the same panel | One card instead of three; same one tap. |
| 24 | Progress card | MERGE | into #5 as the **weigh-in history**: trend chart (weight + waist, measured points), latest weigh-ins, "Since {date}" delta, "+ Add a past weigh-in". "Save a snapshot" removed (A-53). | History of the numbers belongs with the numbers (A-53). |
| 25 | Understand the numbers | STAY | footer | Method one tap away. |
| 26 | Sources & references | STAY | footer | Sources one tap away. |
| 27 | Tab bar | STAY | bottom | Navigation. |

\* DOWN once a plan exists; open on screen before that.

Totals: STAY 13 (1, 2, 3, 5, 6, 14, 16, 17, 18, 19, 25, 26, 27) · DOWN 10 (4, 7-13, 20, 21) · MERGE 4
(15 → 5, 22 → 19, 23 → 19, 24 → 5). 27/27. Change from v1: #24 was STAY, now MERGE into #5.

### Items in other states

| State | Item | Fate |
|---|---|---|
| Plan exists | "Your daily plan" block (TDEE, protein, Lose/Maintain/Gain, BMI and macro chips, warnings, estimate note) | DOWN behind a **Your daily plan** row (`hy_daily_plan` + Estimated/Measured chip) right under Daily intake; value = daily burn · protein (Q4: fine). |
| Plan exists | "Since {date}: Weight ±x · Waist ±y" line in the plan block | MERGE into the weigh-in history in #5 (it is history). |
| Target set | Target metrics (bar, ETA, basis, healthy-range note) | STAY inside #14. |
| Check expanded | Reality-check panel | Unchanged, opens in place under the hero. |
| Intake open | Totals, check intake, unlogged days, entries | Unchanged, behind #18. |
| Premium / locked | Lock variants of #3, #14, #19, #23 and the history | Unchanged gating (history = today's Premium Progress; see Q-B). |

## (c) Flows: tap path before → after

Counted from landing on Journey; typing not counted. Screen = screenful at rest (390 x 844).
"First-time" = no plan yet (Test03 today); "daily" = plan, target and history exist.

| # | Flow | Before (main) | After | Change |
|---|---|---|---|---|
| F1 | Log food | 1 · screen 3 | 1 · screen 1 | less scroll |
| F2 | Food-log reminder | 1 · screen 3 | Daily intake → switch · 2 (Settings unchanged) | +1 (accepted, Q3) |
| F3 | Set / edit a target | 2 | 2 | same |
| F4 | First entry of your numbers | 0 (form open) | 0 (form open) | same (resolved) |
| F4b | Edit numbers, daily | Your numbers → fields · 1 | Edit → fields · 1 | same |
| F5 | Metric / Imperial | 1 | 1 | same |
| F6 | Body-fat source / activity | first-time 1 · daily 2 | first-time 1 · daily 2 | same (resolved) |
| F7 | Reality-check panel | row · 1 · screen 3-4 | hero header · 1 · screen 1 | less scroll |
| F8 | Save a snapshot | 1 (only with a plan) · screen 4 | **0: automatic on every weigh-in** (A-53) | shorter |
| F9 | Add a past weigh-in | + Add → (date) → Save weigh-in · 2 · screen 4 | same 2, inside Your numbers · screen 2 | same taps, less scroll |
| F10 | Sources | 2 · screen 4 | 2 · screen 3 | same |
| F11 | One explainer | 2 | 2 | same |
| F11b | Read "What this is" | first-time 0 · daily 1 | Understand → What this is · 2 | **+2 / +1 — flagged** |
| F12 | Dose accumulation | 1 · screen 1 | 1 · screen 2-3 | lower (accepted, Q6) |
| F13 | Daily intake detail | 1 | 1 | same |
| F14 | See how it works | 1 | Daily intake → link · 2 | **+1 — flagged** |
| F15 | Lose / Maintain / Gain | 1 (plan visible) | Your daily plan → goal · 2 | +1 (accepted, Q4) |
| F16 | Fix a food entry / mark a day | 2 | 2 | same |
| F17 | Sex gate button | 1 | 1 (in the open form's caption slot) | same (resolved) |
| F18 | See weigh-in history / trend | 0 · screen 4 (Progress card, Premium) | 0 · screen 2 (in Your numbers) | less scroll |
| F19 | Record today's weight (daily) | Your numbers → type → Save a snapshot · 2 | Edit → type · 1 (snapshot automatic) | shorter — **depends on Q-A** |

Still flagged and not yet answered: F11b, F14.

## Copy proposals (founder approval + 6 languages needed)

A-53 makes two existing strings wrong; nothing else needs new words.

| Key | Now (en) | Proposed (en) |
|---|---|---|
| `cal_snap_sub` | "Premium. Save a snapshot each time you run this, then watch weight and waist together. When waist falls while weight stalls, that's the fat loss the scale hides." | "Premium. Every weigh-in is saved here. Watch weight and waist together: when waist falls while weight stalls, that's the fat loss the scale hides." |
| `cal_snap_need_more` | "Save one now, then run this again in a few weeks — two points make a trend." | "Two weigh-ins make a trend." |

`cal_snap_save` ("Save a snapshot") is used only by the removed button (CalculatorSection.js) and can
retire. `cal_snap_saved` ("Snapshot saved") stays: it is also the confirmation after saving a
reality check and a past weigh-in.

## Data note (A-53, for the build, not this proposal)

Every snapshot that exists today must still show in the new history after the update (CLAUDE.md
"never lose user-entered data"). Automatic snapshots write to the same synced `calc_snapshots`
store, never to local-only storage.

## (d) Open questions for the founder

Answered: Q1 subtitle keep · Q3 reminder fine · Q4 daily plan fine · Q5 Log food stays primary ·
Q6 Dose accumulation lower fine. Still open:

- **Q-A (A-53) What counts as a weigh-in?** Proposal: any day you save a changed weight (in Your
  numbers, the reality-check weigh-in, or a past weigh-in) writes that day's snapshot; the last
  value of the day wins. Does a waist- or body-fat-only change also count? This changes data
  behavior, so A-53 needs its own spec checklist and a journey review before it is built.
- **Q-B** Weigh-in history: Premium as Progress is today, or free to see with the trend Premium?
- **Q-C** The two copy proposals above.
- **Q-D** (was Q6 on the page) The hero shows "Reality check" twice because both strings stay
  verbatim; shorten the second later as a copy change?
- **Q-E** F11b ("What this is" +1/+2) and F14 ("See how it works" +1): OK?
- **Q-F** Primary action: ink or Cobalt.

Numbering note: v1 of this file had 7 questions and the v1 page had 8. The extra page question was
the duplicated "Reality check" wording (now Q-D). Nothing was lost; the file numbering (Q6 = Dose
accumulation) is the one the founder answered.
