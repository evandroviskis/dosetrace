# Handoff — DoseTrace visual identity "Graduated" (design session → cloud, 2026-09-29)

Read this whole file before doing anything. It carries the rules and decisions that live only on
the founder's Mac (Claude's memory, the Grok notes), and says where the rest is in the repo (§2).

## 1. What this work is

A new visual identity ("Graduated") and screen-by-screen layout proposals for the DoseTrace app
(React Native / Expo; an honest dosing journal + pure-math calculator for peptides, TRT and other
compounds). **Design only:** mockup pages (HTML), specs (Markdown), founder decisions. No app
code, no builds, no production data. When a screen is approved, a separate session on `main`
writes its spec checklist and builds it.

## 2. Where everything is — read this first

- Repo: `github.com/evandroviskis/dosetrace`. Design work: branch **`design/hybrid`**, folder
  **`docs/design/`**. The app is `main`.
- **`main` on GitHub = 57b6910** (pushed 2026-09-29 with the founder's OK; it had been 102
  commits behind the Mac). That is the code this design work inspected: the newest CLAUDE.md and
  the registry `docs/review/features.md` (A-29, A-52/A-53/A-54, S-17…S-20) are there. The 1.2.5
  session keeps committing on the Mac, so GitHub's `main` can fall behind again: check
  `git log -1 origin/main` and say how old your copy is when you inventory a screen.
- **Read the rules from main:** `git show origin/main:CLAUDE.md`. The CLAUDE.md on
  `design/hybrid` is an older copy (49 lines shorter).
- `design/hybrid` itself (commits up to c39c428) is an older prototype branch with app code from
  2026-09-27. Ignore its app code; work in `docs/design/`.
- Do not touch `main`. Commit and push `design/hybrid` only when the founder asks.

## 3. Files in `docs/design/`

| File | What it is | Published page (claude.ai artifact) |
|---|---|---|
| `DESIGN.md` | the identity spec: palette, **approved type (§3)**, shapes, honesty lines, forbidden "AI template" tells, founder decisions at the top | — |
| `today-dashboard.html` / `.md` | **current work:** Today tab layout proposal v1 | https://claude.ai/artifact/XidQf4a75nzeySHFeeaeZx |
| `today-journey-findings.md` | real-world journey review of Today on main (logic defects found) | — |
| `journey-dashboard.html` / `.md` | Journey tab (A-52) dashboard proposal v5 — liked by the founder, kept | https://claude.ai/artifact/YK48F9e3hUyQ6PpgtKX1KB |
| `typography-review.html` | type audit of the app + the v4 role scale (now approved) | https://claude.ai/artifact/5Bf6VpoatBJc5dSTHkjgCW |
| `identity-mockups.html` | the v3 skin on main's real Today, Journey, Protocols, site picker | https://claude.ai/artifact/JLL4jgikRs2PDy6QBD7Ac3 |
| `HYBRID-GAP.md` | what of the old `design/hybrid` prototype fits, and merge risk | — |
| `journey-layout.*`, `DESIGN.v*-to-v*.diff` | superseded / history | — |
| `current/*.jpg` | 29 iOS simulator captures of main (account Test03, light + dark): Today, Journey, Protocols, site picker, FoodChat, Curve | — |

## 4. Rules (all apply; the founder's words outrank everything)

**Design session scope:** proposals only; no app code; no EAS build or submit; no production
data; never touch `main`; commit/push `design/hybrid` only on request.

**From CLAUDE.md (main, newest):**
- Orient before acting; verify with evidence, never assume; if you can't check something, say
  "unverified".
- Colors: theme tokens only, both themes checked for every screen, popups and pickers included.
  A control that can't be read in one theme is a bug.
- **No emoji in the UI.** Icons come from the founder's monoline set (`components/FeatureIcon.js`).
- **Copy is verbatim** from `i18n/translations.js`. New copy is marked as new and needs the
  founder's approval in all 6 languages (never strip a language).
- **Never lose user-entered data.** Any change that touches storage must carry old data over.
- **AI hard line / product guardrails:** the app only transcribes or surfaces the user's own
  data. Never recommend a dose, treatment or protocol change; never diagnose or interpret. Show
  estimates as estimates ("Estimated", "Est. level", never "blood level").
- "Rebuild means replace": no old version left alive as a fallback.
- "Approved → next build": anything the founder approves ships in the next build with open
  scope, unless the founder defers it. Say so if something can't be built well in time.
- Every approved feature gets a numbered acceptance checklist in `docs/specs/` (done by the
  `main` session, not here).
- Commit messages: plain quotes, no backticks.

**How the founder likes to work (from memory):**
- Blunt, no flattery, lead with risks, challenge weak premises. Recommend; don't survey options.
- Every opinion starts from how a feature works and **why it exists**.
- Plain English for the founder. Every answer has two parts: the part for the founder, and a
  numbered double-check note for Grok (the founder's outside reviewer). The Grok folder is on the
  Mac and git-ignored, so in the cloud put the note at the end of the reply. **Next number: 050.**
- Design lessons the founder taught (do not repeat these mistakes):
  - Four Claude-invented "design DNA" menus were all rejected. Don't pitch menus; build from the
    founder's reference: "modern, clean, simple like a Tesla interior but functional", Apple's
    *style*, not its UI.
  - Restraint must never remove information a feature exists to show.
  - Label/value grids read as forms; the dose must read as a **card**; Today keeps its alerts,
    each with Remind me.
  - Don't flatten screens that have a distinct shape into identical cards.
  - The food log is the retention engine (food log → reality check → your goal), a daily habit.

## 5. Decisions so far (dated)

- 2026-09-28 (#036): Graduated is a **skin** with a LAYOUT FREEZE (DESIGN.md §0) — every screen
  keeps main's structure — **except Today** (below). Data blue = Cobalt `#2350D8` (dark
  `#8AA8FF`), blue only for data. Primary action drawn in ink; ink vs Cobalt still formally open.
- 2026-09-28: day counters are text only, no bars or tick strips.
- 2026-09-28/29: Journey becomes a dashboard (A-52, target 1.2.6): food log card on top;
  "Progress" (your numbers + reality check) and "Dose accumulation" (shows the Est. level number,
  not a graph) as two tiles side by side; detail screens behind them. v5: tiles as tall as their
  content, 34 pt numbers, weigh-in date moved off the tile. **Founder 2026-09-29: "I like this
  proposal. Keep this."** Related registry items (on the Mac only): A-53 automatic weigh-in
  snapshots, never paywalled, same-day merge rule approved; A-54 "enter once, used everywhere".
- **2026-09-29: typography approved** (DESIGN.md §3, v4): the phone's system font for reading
  text and controls; Geist for large titles (34/600), big numbers (300; 34 on tiles, 56 as a
  screen's hero) and section titles (22/600); Geist Mono only for measured values; body 17,
  caption 12, tab bar 11 fixed; side-by-side tiles stack from about 130% text size.
- **2026-09-29: Today's layout freeze lifted.** Founder: "No need to stick to the current look of
  the app. Feel free to change locations of the alerts, tomorrow, next 5 days, dose counter and so
  on. I need all the features but I am open to suggestions." The Share my progress card may go
  "for now" (already registered as A-29, target 1.2.6); the "Good morning" greeting need not stay.

## 5b. Process from 2026-09-29 (founder directive, outranks §4 scope lines where they conflict)

"I need to approve screen by screen so I need you to stop at every design, confirm with me, we
make changes and after every approval, we go to the next screen. All that is visible by the user
needs redesign and approval. You commit, build into the simulator and I see the final results."

- One screen at a time. Stop after every proposal and wait for the founder. No next screen
  until he approves the current one in words.
- After approval: implement that screen in the app, then the founder sees it running in the
  simulator (the cloud has no iOS Simulator: implementation can happen here, the simulator run
  happens on the Mac).
- All CLAUDE.md gates still apply to the app work (spec checklist, tests, both themes, dt-council
  and ship-check before any EAS build).

## 5c. Status 2026-09-29 (late)

- **Today v2.1 APPROVED.** Build handoff: `today-build-handoff.md` (Mac session, after 1.2.5).
- **Next screen: My Protocols** (list, protocol detail, add/edit form, its popups). Design it,
  stop, get approval. Builds follow in approval order.

## 6. Current work: Today proposal v2 (published 2026-09-29, waiting for the founder)

The founder answered v1 with a new brief (quoted in `today-dashboard.md`): alerts on top and gone
when none; a tracker with three rings (today / 7 days / 30 days, counting doses so weekly and
monthly shots count); clear dose cards (tap → protocol, Mark taken on Today); Tomorrow and Next 5
days fold; the Dose log moves to My Protocols, which opens on two heroes (Protocols, Dose log);
bolder look (titles 700, numbers 500, ink block). Kept: Taken line, Draw to + syringe, "Due" only.
The AI "why on time" idea went to a 3-reviewer council: all said don't build it (claims risk,
thin peptide PK data, and the curve ignores logged doses, F-051).

Open questions (v2, also on the page): dark ink block inverted or dark; keep week cells; keep
the tracker → Dose log shortcut; streak explanation → Dose log + tips dropped; new words (7 days,
30 days, Nothing due, active, Add a protocol); 30-day ring counts doses, not days; AI explainer
drop or fixed line; register the findings (F4b first).

Timing when approved: after 1.2.5 (S-17, S-20 edit `TodayScreen.js`); absorbs A-29; the My
Protocols heroes need their own registry item. F1 and F6 would corrupt the rings.

## 7. Journey questions still open

Name "Progress" or "Your progress"; the reality check uses the latest weigh-in (A-54); show the
finish controls only from day 14; Est. level counts the planned schedule (a skipped dose still
counts, F-051) — ship the A-07 wording or count Taken only; 0.0 mg for fast-clearing compounds;
food card title "AI food log" or "Food"; Progress full-screen or inside Journey; example curve for
free users; flows that got one tap longer; activity 5 levels vs 4; copy; ink or Cobalt button.

## 8. Found on the way (need registry entries on `main`; the founder routes them)

From `today-journey-findings.md` (read it for file references):
- **F4b (most serious):** "Yes, it's finished" in the "Still going?" window soft-deletes the
  protocol; its whole dose history leaves the Log at once, restorable 7 days, then gone. Violates
  the never-lose-data rule. Verified in code.
- F2: rest days say "No protocols yet" and "0 Protocols" (fixed by the Today layout). Verified.
- F1: a dose logged more than 12 h after its time gets a false "Missed" beside the "Taken".
- F5: skipping one dose of a twice-a-day protocol keeps the wrong button label and its reminder.
- F6: Today does not change date if the app stays open past midnight.
- F4a: the vial prompt's "Protocol finished" does nothing to the protocol.
- Decisions: late/early weekly doses, twice-weekly / as-needed schedules, whether a skip counts
  as handled.

## 9. How the mockup pages work

- Plain HTML with inline CSS/JS, no build step, no libraries. Tokens at `:root` + `.ph.light` /
  `.ph.dark` (phones keep their own theme whatever the page theme); the nine type roles are CSS
  classes `.r-large … .r-tab`, scaled by `--ts` (text size; 1.35 = 135%).
- Each phone state is built by JS functions from a data object. Every element that comes from
  main carries `data-i` = its checklist number; new elements use `N1…`. The coverage line under
  the phones must read that every item is placed, merged or removed on purpose.
- Checks after every edit: (1) extract the `<script>` and parse it with `new Function(js)` in
  Node; (2) render the page and read the coverage line; (3) look at light, dark and 135%. If no
  browser is available, do (1), say the visual check is unverified, and ask the founder to look.
- Publishing: republish to the same artifact URL (read it first if the tool asks). Pages load
  `current/*.jpg` by relative path: include those files when publishing.
- The phones are 390 pt wide; content fits 358 pt; tiles in pairs have 146 pt of text width.

## 10. Cloud environment notes

- No iOS Simulator, no Mac: no new captures and no device checks. Say so when it matters.
- Node is normally on PATH in the cloud (CLAUDE.md's nvm path is for the Mac).
- The founder's memory and Grok folder are not here; this file is the substitute.

## 11. Next steps, in order

1. Read `DESIGN.md`, `today-dashboard.md`, `today-journey-findings.md`, `journey-dashboard.md`.
2. Ask the founder for the Today answers (Q1–Q7). Apply them as Today proposal v2 in
   `today-dashboard.html` (and `.md`); keep the coverage check green; republish the same URL.
3. Ask which screen comes next (My Protocols, the site picker, My Body, Settings). For each:
   inventory main's screen from `origin/main` (say its date), number every item, propose, draw
   light + dark + 135%, fate table, flows, copy, open questions, publish, Grok note.
4. Keep `DESIGN.md` updated with every founder decision, dated.
