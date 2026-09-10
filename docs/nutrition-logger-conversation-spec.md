# AI nutrition logger — conversation spec (LOCKED 2026-09-10)

Founder-validated in a live role-play simulation. This is the source of truth for
the `parse-food` edge-function prompt AND the client conversation logic. Do not
drift from it without the founder's sign-off.

## What it is (positioning)
NOT a calorie counter / food diary / MyFitnessPal. It is a low-friction daily
**intake capture** whose output feeds the calculator's **reality-check** weekly
average. It logs and totals; the user draws conclusions.

## The split (regulatory-critical)
- **The model** only ever returns STRUCTURED JSON — food items + estimates, and an
  optional `clarify` slot-hint. It NEVER returns prose shown to the user, NEVER
  advises, NEVER coaches. (This is the Apple 1.4.1 / SaMD defense and the
  prompt-injection defense in one.)
- **The app** renders all wording — the questions, the confirmations, the
  breakdown, the deflection — from templates, populated by the JSON. The "voice"
  below is app-templated copy, not LLM output.

## Tone (founder: "I loved the tone")
Warm, brief, matter-of-fact. Estimate-framed everywhere: `≈`, ranges, "±10–15%".
Never chatty coaching, never judgmental. Confirmations are short ("Logged —
lunch"). One structured breakdown table per entry + a running day total.

## The goal: capture the WHOLE day without pushing
After each entry, detect which day-slots are still blank and ask about ONE gap at
a time — never a checklist. Slots tracked: **breakfast · lunch · dinner · snacks ·
drinks**.
- Always sweep for **drinks** (most-forgotten calories: coffee, soda, juice,
  alcohol) and **snacks**.
- Ask **forward**: "Any dinner plans, or think that's it for today?" so dinner is
  caught in the evening session or prompts a later check.
- Example nudges (app copy): "Had lunch yet, or is that still coming?" ·
  "Anything to drink through the day — coffee, soda, a beer?" · "Any snacks
  between meals?"
- **One nudge per gap, then drop it.** If the user goes quiet or says "that's
  it / done", stop asking and close the day: "No rush — I'll leave today open in
  case you remember anything."

## Handling vague quantities
Estimate anyway, then flag the vague items for correction ("some rice" → assume ~1
cup, mark it editable). The tap-to-fix row is CORE UX — most estimate error is
portion size, and correcting it is the product, not an afterthought.

## Branded products
Recognize brands when named (e.g. Isopure → zero-carb isolate) — a real value-add.
Accuracy risk: the model can guess a brand's macros wrong; keep it estimate-framed
and correctable, never presented as exact.

## Nutrients surfaced
Calories, Carbs, Protein (founder decision). Fat is captured in the JSON but not
shown in v1.

## Advice deflection (fires on ANY advice-shaped input)
Triggers: "what/how should I eat", "help me lose/gain weight", "burn fat", "is this
healthy", "should I eat less", any request for a plan/target/recommendation.
Response is a FIXED app card (all 6 languages), never model prose:

> DoseTrace doesn't give diet or weight-loss advice. I log and total what you eat —
> for a plan built around your body and health, talk to a doctor or registered
> dietitian.

Then redirect to what IS allowed: keep logging, and open the reality-check (which
shows the user's own intake next to the target THEY set and their actual weight
change — two numbers side by side, user concludes). Never invent a target, never
use an imperative aimed at the user, never link food to any peptide/hormone/dose.

## Day close
When the user is done: a day-summary card (Cal / Carbs / Protein / entry count),
and the line that ties it to the moat: "Your 7-day average builds from days like
this and feeds your reality-check." Reopen-to-edit always available.

## Model output contract (for parse-food)
Return ONLY JSON:
`{ "items": [{ "food", "qty", "unit", "kcal", "protein_g", "carb_g", "fat_g",
"confidence" }], "clarify": string|null, "refusal": true|false }`
- `refusal: true` (with empty items) for any advice-shaped request → app shows the
  fixed deflection.
- `clarify` = at most one short slot/portion question hint the app MAY use.
- No prose, no code fences, no keys beyond these.
