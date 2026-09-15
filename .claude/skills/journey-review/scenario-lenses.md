# Scenario lenses & explicit questions

Apply the RELEVANT lenses to a flow — don't mechanically multiply every combination.
For a substantive flow, produce ≥3 distinct realistic scenarios, and ALWAYS include
an "already-underway" one when the activity can precede app adoption.

## Ordinary-variation lenses
1. **Timing / entry state** — starting *now* vs **arriving with the activity already
   underway** (started days/weeks ago, mid-vial, mid-cycle, already took today's
   dose). ← the lens that caught the founder's tirzepatide miss. Always apply it.
2. **Completeness of info** — has everything vs missing a value they can't reasonably
   know (exact concentration, mix date, expiry, lab units). Does the flow force a
   guess, block them, or fabricate a value?
3. **Interruption & return** — starts, backgrounds/loses signal, returns later;
   partial entry; app killed mid-flow.
4. **Correction** — made a mistake (wrong dose/date/type/time); can they fix it in
   place, or must they delete and recreate everything?
5. **Change over time** — dose changed, switched ester, paused then resumed,
   restarted a new vial, changed schedule.
6. **Cross-feature effects** — what this action does to related records: dose
   history/adherence, the accumulation curve, reminders, supply/expiry, the
   reality-check intake, summaries, exports.
7. **Population variants** — new user vs returning/legacy user after an update; free
   vs premium; a locale with long strings (DE/PT) or comma decimals; offline;
   light/dark; landscape/foldable; a second device / re-auth.
8. **Truthfulness** — can the user represent their real situation WITHOUT entering
   something false or using a workaround?

## Explicit questions (ask every one for a substantive flow)
- What common situation does this default or restriction **exclude**?
- Can the user complete their intention **without entering something false**?
- Are we requiring information they **can't reasonably know**?
- Does **missing information get converted into an unsupported factual claim**
  (e.g. a fabricated dose date that then drives the curve/adherence)?
- Can they **correct a mistake** without deleting and recreating everything?
- Does the action have **understandable consequences elsewhere** (curve, adherence,
  reminders, supply)?
- Is the restriction backed by an **explicit product decision**, or just an
  implementation default nobody chose?
- Are we proposing a **proportionate correction**, or inventing a broader product?

## DoseTrace-specific prompts (domain lenses)
- **Pharmacist lens:** are quantity, concentration, volume, and units unambiguous?
  Can a real label be represented (mg vs mcg, mg/mL, IU, per-mL vs per-vial)?
- **PK/clinical lens:** does a value the user enters (or one the app assumes, like a
  start date) silently drive the accumulation curve or adherence as if it were fact?
- **Behavior/routine lens:** does the flow fit a real dosing routine — prep now /
  inject later, multiple vials, travel, a missed or doubled day?
- **Onboarding/support lens:** time-to-value, confusing wording, anything that would
  generate a support question or force a manual.

## Anti-patterns to avoid in the review itself
- Don't treat existing behavior as proof the requirement is correct.
- Don't invent numeric prevalence ("80% of users…") — label assumptions.
- Don't expand scope: the smallest adequate fix, not a redesign.
- Don't claim the UI was tested if only code was read.
