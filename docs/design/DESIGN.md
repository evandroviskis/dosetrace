# DoseTrace visual identity: "Graduated"

Status: **PROPOSAL v3, awaiting founder approval** (2026-09-28, after founder feedback #036:
"be more faithful to how the app is laid out today; nobody should have to relearn the app").
Nothing here is applied to any screen until the founder approves it.

Founder decisions since (2026-09-29):
- **Process (2026-09-29, founder):** "All that is visible by the user needs redesign and
  approval." Every screen, popup and picker gets a redesign proposal. One screen at a time:
  propose → founder feedback → changes → founder approval → build it in the app → the founder sees
  it running → only then the next screen. Nothing moves to the next screen without an explicit
  approval. This supersedes the "skin only" layout freeze (§0) for every screen as it comes up.
- **Typography approved:** §3 is the v4 role scale from `typography-review.html` ("keep the
  typography we just approved").
- **Journey:** the dashboard proposal (`journey-dashboard.html`, v5) is liked and kept; its open
  questions are still open.
- **Today:** the layout freeze is lifted for Today (see §0).
- **Today v2 answers (2026-09-29):** alerts on top (gone when none); a tracker with three dose
  rings (today / 7 days / 30 days, doses not days); clear dose cards (whole card opens the
  protocol, Mark taken on the card); Tomorrow and Next 5 days fold; Taken line kept; Draw to +
  syringe approved; only the word "Due". Details: `today-dashboard.md`.
- **My Protocols (2026-09-29):** the Dose log moves there; the tab opens on two heroes,
  Protocols and Dose log under it. The layout freeze is lifted for this change only.
- **Bolder look (2026-09-29, first on Today/My Protocols):** titles 700, big numbers 500 (the
  §3 sizes stay; "weights stop at 600" no longer holds there), and the tracker is a solid ink
  block drawn with the opposite palette.
- **Today v2.1 APPROVED (2026-09-29, founder)** with the recommended answers to every open
  question. Built by the Mac session after 1.2.5: `today-build-handoff.md`.
- **My Protocols part 1 APPROVED (2026-09-29, founder: "Approved so far"):** the list and a
  protocol screen (calculator first, then vial, schedule, dose details, notes; Edit top-right,
  Delete at the bottom), as in `prototype.html`, including the two suggestions it shows:
  "Recently deleted" + Restore at the bottom of the list, and a confirm before New vial /
  New bottle. Today alerts naming one protocol open that protocol (recommended answer, taken as
  approved unless the founder says otherwise).
- **Journey part 1 (dashboard) APPROVED (2026-09-29, founder: "ok, keep going")** with the
  recommended answers: v5 layout unchanged in the new look; name "Progress"; food card stays "AI
  food log"; Est. level ships with the A-07 wording ("based on your planned schedule") and "count
  only Taken doses" goes to the pharmacometrics review as a model change; fast compounds keep 0.0 mg;
  explainers open in place with "What this is" first; its last sentence becomes "Every weigh-in is
  saved, so you can watch the numbers change over time." (new copy); free users see PRO and no number.
- **AI food log rule (2026-09-29, from the founder's test):** nothing the user types is dropped.
  Every food in a message becomes its own entry line, in the user's words and quantity ("2 eggs"
  stays 2 eggs); anything the AI cannot place is kept as a line flagged "estimate · tap to fix".
  Candidate acceptance test for the app's parser (the prototype silently dropped "orange juice").
- **Journey part 2 (Progress) APPROVED (2026-09-29, founder: "Much better. Keep going")**: the
  reordered screen as in `prototype.html` (Progress card with target + "Log today's weight" sheet →
  daily plan → reality check → weigh-ins folded → your numbers folded; form first when empty),
  activity level as a list, one weigh-in updates every number (main's energy math). Recommended
  answers taken: the reality check uses the latest weigh-in (A-54); its result buttons from day 14.
- **Journey Progress reorder (2026-09-29, founder):** order the screen by how often it is needed.
  After numbers exist, "Your numbers" folds away; the reality check sits under Progress and stays
  (weigh in again later); for free users a tap explains it, then the paywall; weigh-ins fold; the
  target stays open; the daily plan sits right under Progress. Design session's proposal (under
  review): Progress card = weight, daily burn, target + ETA, "Log today's weight" → daily plan →
  reality check → weigh-ins (folded) → your numbers (folded). Before any numbers: the form first.
- **Parked (2026-09-29, founder):** every feature gets an explainer animation (why use it,
  benefits, expected results). After the design pass; see HANDOFF §5d. Remind the founder then.
- **My Protocols part 3 APPROVED (2026-09-29, founder: "Ok, keep going")**, so all of My
  Protocols is approved: one DoseTrace sheet replaces the system alerts (pickers keep the iPhone
  wheel inside it; camera and photo library stay system screens); photo choice as a bottom sheet;
  vial-photo errors reuse "Couldn't read that label" and drop the lab-report wording (new copy);
  titles say what happened instead of "Error" (new copy); Delete says it restores from Recently
  deleted (new copy); a protocol with missing dose details keeps main's sentence + "Dose details ›".
- **My Protocols part 2 APPROVED (2026-09-29, founder: "Perfect. Keep going"):** the add/edit
  steps as in `prototype.html`, with the recommended answers: Cancel top-left, Back + Next in the
  footer; live syringe under its fields; discard confirm on Cancel (new copy); a typed name counts
  and Next without a name says "Missing name"; skip-vial text points to Today (+ Add vial) instead
  of the non-existent Vials tab (copy change); wellness goals stay one list as on main.
- **Dose log look APPROVED (2026-09-29, founder):** "I like the dose log without those bars we had
  before. Keep it this way." Plain Taken / Skipped / Missed numbers, no tinted stat boxes (as in
  `prototype.html`).
- **Add steps, no placeholder sentence (2026-09-29, founder):** the dose-step result (syringe /
  serving) sits under the fields it depends on and appears only once it can be computed; no
  "Complete your dose details…" line in its place.
- **Tracker block colors (2026-09-29, founder):** dark theme = the light inverted block ("the
  dark version looks good"); light theme = dark grey `#383C41`, not black ("less aggressive").
  Measured on it: text 9.97, secondary 6.56, captions 4.93, data blue `#8AA8FF` 4.83, ticks 3.44.
- **AI "why on-time dosing matters" explainer (2026-09-29):** council (regulatory,
  pharmacometrics, product) says do not build it; founder decision pending.

Mockups: `docs/design/identity-mockups.html`: main's real Today, Journey, My Protocols and site
picker (simulator captures in `docs/design/current/`, Test03, light + dark) beside the same
screens in Graduated, primary action in ink and in Cobalt.

**Open decision for the founder:** primary action ink or Cobalt (§1 rule 1). Cobalt is the data
color (founder #036); Azure is dropped.

## 0. LAYOUT FREEZE (hard rule, above everything else in this file)

Founder directive 2026-09-28 (#036). This redesign is a **skin**, not a new layout.

- Every screen keeps its current structure, section order, item positions, tabs, buttons and
  flows **exactly as on main** (baseline: main @ a7d8275). No item moves, disappears, merges,
  collapses or goes "one tap down". Nothing new is added except a graduated drawing of a value
  the element already shows.
- **Copy is frozen too.** Every string stays as it is in `i18n/translations.js`, in all 6
  languages. Case changes done by style (an uppercase header shown in sentence case) are skin;
  changing words is not.
- Graduated may change only: palette, type (Geist + Geist Mono readouts), surfaces (no shadows;
  raised / well / hairline), component shapes (capsule buttons, outline pills, plain icons without
  tiles), icon style, the graduated scale where a value is already shown (dial, syringe, vial
  cells, day ticks), contrast, and hierarchy **within** each existing element.
- Proof per screen: a numbered list of every item on main in order, and the Graduated version
  must show the same items in the same order. Any exception is a bug.
- Rules marked **FUTURE UX** below (§1 rules 2-4, §6, §8 and the marked items in §9) describe
  a later layout project. They are **not part of this redesign** and need their own founder
  approval, spec and journey review.
- **Exception, Today (founder 2026-09-29):** "No need to stick to the current look of the app.
  Feel free to change locations of the alerts, tomorrow, next 5 days, dose counter and so on. I
  need all the features." Items on Today may move, merge or go one tap down, but **every feature
  stays reachable**; the Share my progress card may go "for now" and the greeting need not stay.
  Proof for Today is a fate table (every item on main → where it lives now), not the same-order
  list. Copy stays verbatim unless a change is marked and approved.

## 1. The idea in one line

DoseTrace should feel like a **measuring instrument**, not a wellness app. The look comes from
the object the user actually holds: a U-100 syringe barrel, a vial label, a lab scale readout.
Its signature element is the **graduated scale**: the syringe barrel with the dose drawn in
blue, and the day scale of a reality check.

Rule 1 is the skin and applies now. Rules 2-4 are **FUTURE UX** (they move or merge items, so
§0 keeps them out of this redesign).

1. **Blue is owned by the data.** Cobalt fills scales, dials, curves and vial cells, big and
   solid. It is never a tab, chip, background, link or decoration.
   *Primary action, pending founder choice:*
   - **Variant A, ink (recommended):** the primary button of each element is ink.
   - **Variant B, Cobalt:** the primary button is Cobalt too. Louder brand; blue then means
     "data or the main action", nothing else.
2. *(FUTURE UX)* **One object per screen.** One raised surface: the thing you act on. Under the
   freeze every existing card stays a card; the skin only removes shadows and tints.
3. *(FUTURE UX)* **One question, one hero.** Each screen answers one question with at most 3
   numbers; every other value one tap down. Under the freeze, only the existing big number of an
   element gets stronger type (Today's 80% ring, the syringe's "Draw to").
4. *(FUTURE UX)* **Few, big rows.** 2-4 rows under the object, one label and one value each.

## 2. Palette

Neutrals are a green-grey "bench" grey: not the cool blue-grey of the AI template, not cream.
All text pairs below were measured (WCAG ratio).

### 2.1 Light (default; designed first)

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `ground` | `#DDE0DB` | screen background | - |
| `raised` | `#FFFFFF` | the ONE object per screen | 1.33 vs ground |
| `well` | `#EEF0EC` | inset areas **inside the raised object only** (inputs, segmented track) | - |
| `line` | `#C3C7C0` | hairlines, row dividers, outline controls | 1.71 vs raised |
| `tick` | `#71766F` | unfilled scale ticks, stubs (graphic) | 3.5 ground / 4.6 raised / 4.1 well |
| `ink` | `#111315` | hero numbers, values, primary text, ink action | 14.0 ground / 18.6 raised |
| `ink2` | `#454A4F` | row labels, sentences | 6.7 ground |
| `ink3` | `#53585D` | captions, units, eyebrow | 5.4 ground / 6.3 well |
| `onInk` | `#FFFFFF` | on the ink button | 18.6 |
| `data` | see §2.3 | scale fill, curve, marker | |
| `onData` | `#FFFFFF` | ticks inside the blue fill; text on a blue button | 6.2-6.5 |
| `attention` | `#7E4A00` | expiring, low supply, due soon | 5.5 ground |
| `risk` | `#9E1F19` | missed, overdue, out of supply | 5.9 ground |
| `ok` | `#17623F` | taken, done | 5.5 ground |

### 2.2 Dark (charcoal, never pitch black)

| Token | Hex | Contrast |
|---|---|---|
| `ground` | `#121416` | - |
| `raised` | `#282B30` | 1.30 vs ground |
| `well` | `#1D2024` | inset inside raised |
| `line` | `#3C4147` | 1.79 vs ground |
| `tick` | `#747A7F` | 4.3 ground / 3.3 raised / 3.8 well |
| `ink` | `#EEEFEB` | 16.0 ground / 12.3 raised |
| `ink2` | `#B5B9B4` | 9.3 ground |
| `ink3` | `#9A9F9A` | 6.9 ground / 5.3 raised |
| `onInk` | `#121416` | |
| `onData` | `#0F1114` | 8.0-8.2 on the dark blues |
| `attention` / `risk` / `ok` | `#E3A54E` / `#F08A80` / `#62C597` | 7.3-8.7 ground |

The raised step is visible without a border or shadow in both themes (v1 was 1.10 light /
1.13 dark, too faint; v2 is 1.33 / 1.30).

### 2.3 Blue: Cobalt (founder #036)

| Token | Light | Dark | Contrast |
|---|---|---|---|
| `data` | `#2350D8` | `#8AA8FF` | white on light fill 6.5:1; dark fill 8.0:1 on ground |

Bolder than the current app blue (`#185FA5`). Azure (`#0A5FBE` / `#5FAEF7`) was the other v2
option and is dropped. The app icon/logo rebrand (parked) should use the same blue.

### 2.4 Protocol colors

The user's protocol color is shown **only as a dot** (9 pt) or as the curve it labels. Never as
a fill, tinted background or icon tile.

### 2.5 Semantic color rule

`attention`, `risk` and `ok` color **dots, ticks and short status words**, never surfaces. An
alert is a flat row on the ground: dot, one line of ink text, `+N` for more, a round Remind me.

## 3. Type

**APPROVED by the founder 2026-09-29** (v4, from `typography-review.html`). Nine roles, tied to
the iOS text styles so they follow the phone's text size. Reading text and controls use the
phone's own font (San Francisco on iOS, Roboto on Android); Geist is for titles and big numbers;
Geist Mono only for measured values.

| Role | Face | Size / weight | Used for |
|---|---|---|---|
| Large title | Geist | 34 / 41, 600, tracking -0.02em | screen titles (Today, Journey, Progress) |
| Display number | Geist | 300, tracking -0.03em; 34 on tiles, 56 as a screen's hero | the big number of a tile or screen |
| Title | Geist | 22 / 28, 600 | section titles on a detail screen |
| Headline | System | 17 / 22, 600 | card and tile titles, compound names |
| Body | System | 17 / 22, 400 | facts, rows, links, buttons |
| Value | Geist Mono | 15-17, 500, tabular | measured values only (amounts, weights, kcal) |
| Secondary | System | 15 / 20, 400 | sentences under a fact, subtitles, pills |
| Footnote | System | 13 / 18, 400 | hints, field labels, disclaimers |
| Caption | System | 12 / 16, 500 | labels above numbers, chips; 11 only in the tab bar (fixed size) |

- **Contrast inside each element is the point.** The element's own big number clearly outranks
  everything else in that element. Values are `ink`; labels are `ink2`; captions `ink3`. Never
  grey-on-grey at the same weight.
- Every role scales with the phone's text size (the tab bar keeps 11 and uses the Large Content
  Viewer). Side-by-side tiles stack from about 130% text size.
- Sentences are never in mono; a number inside a sentence keeps the sentence's font with tabular
  digits, and only a measured value inside it may switch to mono.
- **Geist Mono is new** (`@expo-google-fonts/geist-mono`, weights 400 + 500 only). Load only the
  weights used.
- Units are lowercase, in mono, `ink3`: `250 mcg`, `10 units`.
- Weights stop at 600 for text. **No uppercase letter-spaced labels.**

## 4. Spacing and grid

- 4-pt base. Steps: 4, 8, 12, 16, 20, 24, 32, 48.
- Screen gutter 16, plus 4 inside rows (20 to text). Inside the raised object: 20.
- Rows: min height 68, hairline between, no fill.
- *(FUTURE UX)* The object sits within the first screenful (iPhone 390 x 844). Under the freeze
  spacing stays close to main's so every item stays where users expect it.

## 5. Component shapes

| Component | Shape |
|---|---|
| Card (every card that exists on main) | radius 20, `raised` fill, **no border, no shadow, no tint** (the blue-tinted "What this is" / AI food log boxes become plain cards) |
| Raised object *(FUTURE UX)* | radius 24; the single object per screen |
| Well | radius 14-16, `well` fill: inputs, segmented tracks, rule/notes boxes |
| Progress ring | stays a ring, drawn as a graduated dial (50 ticks, done share in `data`), the % beside it in Geist 52/300 |
| Week day cells | same 7 cells; done day = `data` fill with check, today = `ink` outline, rest = `well` |
| Doses left / remaining | the existing text plus vial cells (one cell per dose, remaining in `data`) |
| Day counts (day 1 of 21, 0 of 7) | **text only, no bars or tick strips** (founder 2026-09-28: day counters are not important data; nobody loses anything by not seeing them). Graduated drawings are only for real values: syringe units, doses left, the weigh-in trend |
| Body figure (site picker) | one smooth outline on the app's 100 x 220 site grid, `well` fill, `tick` stroke, themed in both modes; dots at `lib/injectionSites.js` coordinates; available = outline ring, selected = `data` dot, longest unused = dashed `data` ring |
| Selection (pills, options, Front/Back) | selected = 1.5 px `ink` outline on `raised`; unselected = 1 px `line` outline |
| Switch | on = `ink` track |
| Disabled button | `well` fill, `ink3` text, dashed `line` border: readable, clearly inactive |
| Primary action | a 60 pt circle in the control row, or a 54 pt capsule; fill = `ink` (A) or `data` (B) |
| Secondary action | 60 pt circle / 54 pt capsule with a 1 px `line` outline, or an underlined text button |
| Object footer | full-width hairline row inside the object (`Vial · 12 of 20 left ›`) for the detail link |
| Row | label left, one mono value right, chevron; 68 pt |
| Syringe scale | the protocol's own `syringe_size` barrel (default 100 units), drawn to scale: dose as solid `data` fill, `onData` ticks inside it, stopper and rod in `ink`, 3-4 axis numbers |
| Day scale | one bar per day: full food day = solid `data` bar, today = `data` outline, missed = short `tick` stub, future = small `tick` stub |
| Status | a dot + a word. At most ONE per object |
| Input | `well`, radius 16, height 72, value Geist 36/300, unit in mono |
| Tab bar | flat on `ground`, hairline top, active = `ink` + 600, inactive = `ink3`. Never blue |
| Icons | the founder's monoline set (`components/FeatureIcon.js`), stroke only |

## 6. Hierarchy and data budget — FUTURE UX (not part of this redesign, see §0)

1. **One hero per screen**, max 3 numbers, max 1 sentence (<= 90 characters in English).
2. **One primary action per screen.** Two filled buttons on one screen is a bug.
3. **Visible-value budget: about 10 per filled screen.** A visible value is any number, date,
   time, amount, site or data status the user has to read. One scale's axis counts as 1; labels,
   buttons and honesty tags count as 0. Count them in every design review (v1 Today was 23,
   v2 is 10; v1 Journey was 24, v2 is 8).
4. **2-4 rows under the object**, one label and one value each. No two-value rows, no lists of
   meals, no stat strips.
5. **Daily before one-time.** Setup ("Your numbers") leaves the page body: a round button in
   the header after first entry.
6. **Detail is one tap down**: vial facts behind the object footer, site behind the Site
   control, the rest of the day behind a row, method behind "How this is calculated", sources
   behind "Sources".
7. **Alerts stay on Today**, above the object, as one flat row (the most urgent) with `+N`.
8. **The due dose is the object**: compound, time, units to draw (hero), dose amount, the syringe
   drawn to scale, the Log/Snooze/Site/Note controls, and one vial line linking to all vial facts
   (size, concentration, doses left, mix date and window, box expiry).

## 7. Honesty lines (non-negotiable)

- Every estimated number carries the word **estimate** in its own row or caption (`Testosterone
  in body · estimate, not a blood level`; `Today's food · estimate`).
- The method and sources are **one tap away** on every screen that shows an estimate.
- Estimates are drawn as a line or fill in `data`; values the user measured are drawn as points.
  Projections are dashed.
- No recommendation, no good/bad color on a health value (weight change is `ink`, not green),
  no suggested dose change. Color describes schedule and supply, not the body.

## 8. Empty-state rule — FUTURE UX (not part of this redesign, see §0)

An empty screen shows **one question and one action**. Nothing else competes.

- Never a disabled primary button, `-`/`—`, `0 of N`, `Nothing yet`, or an empty chart.
- A feature whose prerequisite is missing does not render; at most one `Next:` line.
- Max one sentence of explanation.
- The empty state uses the same raised object in the same place as the filled state.

## 9. Forbidden: the "AI template" tells

**[skin]** = removed by this redesign. **[FUTURE UX]** = a layout tell that the freeze (§0)
keeps for now; it is fixed only in the later layout project.

1. **[skin]** Cool blue-grey background; cards floating on shadows.
2. **[skin]** Drop shadows (`shadowCard`, `shadowSoft`).
3. **[skin]** Blue on tabs, chips, links, selections or tinted callouts. Blue = data (and, in
   Variant B, the primary action).
4. **[skin]** Uppercase, letter-spaced section labels (shown in sentence case; the words stay).
5. **[FUTURE UX]** Greeting header + progress ring as the Today hero. The freeze keeps both;
   the skin redraws the ring as a graduated dial.
6. **[FUTURE UX]** Explanatory paragraphs on the surface; a subtitle under every screen title.
7. **[skin]** Icon-in-a-rounded-square tiles. The icon stays in place; the tile goes.
8. **[skin]** Rounded pill progress bars. Use the graduated scale.
9. **[FUTURE UX]** Equal-weight stat tile grids; rows with two or more values.
10. **[skin]** Soft-tinted status chips (outline tags instead). *[FUTURE UX]* more than one status
    per object.
11. **[skin]** Left accent-stripe cards, gradients, glow, glassmorphism.
12. **[skin]** Emoji, cute illustrations, pastel fills. The existing `ai_spark` icon stays (freeze)
    but is drawn as a plain monoline glyph; replacing it is FUTURE UX.
13. **[FUTURE UX]** Dead states: disabled buttons, `—`, `0 of 7`, `Nothing logged yet`. The skin
    only makes them readable (disabled = well + ink3, not faded blue).
14. **[skin]** Pure black dark mode; fixed light surfaces in dark mode (the body figure on main).
15. **[FUTURE UX]** Centered-everything layouts.
16. **[skin]** Same-weight grey on grey inside an element.
17. **[FUTURE UX]** Data scatter: more than ~10 visible values on a screen.

## 10. Mapping to `lib/theme.js` (for when it is applied)

| Existing key | Becomes | Note |
|---|---|---|
| `bg` | `ground` | |
| `card` | `raised` | only the one object per screen may use it |
| `card2` | `well` | only inside the object |
| `border` | `line` | |
| `text` / `textMuted` / `textSubtle`+`textFaint` | `ink` / `ink2` / `ink3` | `textFaint` retires |
| `accent` | split: `act` (ink or data, per §1) for the one button, `data` for charts | the 248 `accent` uses on hybrid must each be classified |
| `accentText` | `onInk` / `onData` | |
| `accentSoft`, `accentSoftText`, `*Soft`, `*SoftText` | retire | tinted surfaces are forbidden |
| `warning` / `danger` / `success` | `attention` / `risk` / `ok` | |
| `shadowCard`, `shadowSoft`, `ringTrack` | retire | |
| new | `tick`, `data`, `onData`, `act` | |

Deliberately fixed surfaces (toast, share-card export, brand marks, protocol palette) keep their
own colors per CLAUDE.md, and must still be checked in both themes.
