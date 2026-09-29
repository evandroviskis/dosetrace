# design/hybrid vs DESIGN.md ("Graduated"), and merge risk

Measured 2026-09-28 on design/hybrid @ c39c428 against main @ c7def30.

## What already fits (keep)

| Piece | Where | Note |
|---|---|---|
| Geist app-wide via the JSX-runtime font patch | `lib/fonts.js` | Keep as is; add Geist Mono (`@expo-google-fonts/geist-mono`, exists on npm, 0.4.3) for readouts |
| Thin hero number (weight 200, tabular) | `components/ui.js` `BigNumber` | Keep; sizes move to 72-88 |
| Round control with label under it | `ui.js` `RoundAction` | Keep shape; primary fill becomes ink (not `accent`), 60 pt, secondary = hairline outline instead of `card2` fill |
| Hairline label/value strip for vial facts | `ui.js` `FactStrip` | Keep layout; labels to sentence-case caption, values to Geist Mono |
| Color dot for protocol identity | `ui.js` `Dot` | Keep |
| 44 pt segmented control | `ui.js` `Segmented` | Keep; drop `shadowSoft` on the selected segment |
| Tokens-only theme, identical keys in LIGHT/DARK | `lib/theme.js` | Keep the mechanism; values change |
| Charcoal dark ground | `lib/theme.js` DARK `bg #121417` | Close; moves to `#17191B` |
| Body-figure site picker restyle | `screens/components/BodyMapModal.js` | Keep |
| ~~Journey order "daily before setup", reality check as a hero~~ | commits 892662b, c432ada | **Does NOT carry over** under the layout freeze (DESIGN.md §0, founder #036): these commits reorder and merge Journey items. FUTURE UX / A-52 only |

## What must change

| Item | Where / size | Rule broken |
|---|---|---|
| Palette: cool blue-grey `#F4F7FB` + white cards + blue accent | `lib/theme.js` | 9.1, 9.3 |
| Drop shadows | `shadowCard`/`shadowSoft`: 26 uses in 11 files | 9.2 |
| Uppercase letter-spaced labels | `TYPE.label`/`SectionLabel`: 39 uses in 9 files; `textTransform: 'uppercase'`: 13 in 9 | 9.4 |
| `accent` used for buttons, tabs, chips AND data | 248 uses in 21 files, each must be classified as act (the one primary button) or data (scale/curve) | 1 (one moment of color, owned by the data) |
| `Card` primitive puts every section on a white shadowed card | `ui.js` `Card` | split into one `Object` per screen + flat hairline rows |
| Soft-tinted chips and alert fills | `ui.js` `Chip` tones; `TodayScreen.js` `alertTone` (~l.1436) | 9.10, §2.5 semantic color rule |
| Greeting header + progress ring on Today | `TodayScreen.js:865`, `:1442`, ring at `:1457` | 9.5 |
| `CircleButton` on `card` + shadow | `ui.js` | 9.2 |
| "0 of N food days" shown before the check starts | commit 6940c9d | 8 (empty state) |
| Raw hex in screens | 25 hits in 6 files | CLAUDE.md color rule; audit each (fixed surfaces allowed) |
| No graduated-scale component | new | signature element |
| FoodChatScreen, FoodLogHero, FoodEntryEditor never restyled | exist only on main | whole screens to design fresh |

## How far behind main (merge risk: HIGH)

- Fork point: `597ff19` (release 1.2.4). design/hybrid is **9 commits ahead, 77 behind** main.
- Hybrid is a visual rewrite: 18 files, +3,129 / -2,030 lines.
- Main changed 68 files (+7,714 / -1,193) since the fork, including the same screens.
- Dry-run merge (`git merge-tree`): **2 files conflict**, `screens/TodayScreen.js` (5 hunks,
  ~171 lines) and `screens/components/CalculatorSection.js` (7 hunks, ~164 lines).
  `App.js` and `i18n/translations.js` auto-merge (hybrid +186 lines of strings, main +522/-114),
  but a clean text merge is not proof: 6-language parity and the new keys must be re-checked.
- The conflicting files are the ones 1.2.5 is still changing (A-40 pending-from-yesterday and
  markTaken on Today; reality-check calc inputs in CalculatorSection), so the risk grows every day.

**Recommendation (founder decides):** do not merge design/hybrid. After the identity is approved
and 1.2.5 has shipped, branch fresh from main and land it in steps: (1) tokens + primitives +
Geist Mono (`theme.js`, `ui.js`, `fonts.js`, new scale), (2) one screen per session (evolution
rule 3), Today and Journey first. Copy pieces over from hybrid where they fit (table above);
treat hybrid as reference only. Hybrid's 186 lines of new strings are unapproved copy and do not
carry over automatically.
