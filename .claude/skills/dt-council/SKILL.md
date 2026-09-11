---
name: dt-council
description: Run the DT Council — DoseTrace's 10-role agent panel that reviews a change set before an EAS build and returns one GO/GO-WITH-CHANGES/HOLD decision brief. Runs before EVERY build (standing rule), or on request via /dt-council. The founder has the final word. ("DT council", distinct from the generic council.)
---

# DT Council

DoseTrace's pre-build strategic gate — the "dt council" (distinct from any generic
council). It stacks ON TOP of `ship-check` (the technical/store gate):
**dt council first (should we build this, and is it right), then ship-check (can it ship
cleanly), then build.** The council advises; the founder decides.

## When to run — MANDATORY before every build
- Run this BEFORE every EAS build, unprompted, as a hard standing rule. Do not run
  `eas build` (or promote a build) until the council has reported and the founder has given
  the go. Skipping it to save tokens is not allowed.
- On request: `/dt-council`.
- Not for trivial turns (status checks, one-line non-build fixes). This is a per-build gate,
  not a per-message one. If a build is genuinely trivial, still run it — the panel will
  mostly return "no concerns", which is the correct, cheap outcome.

## Step 1 — Assemble the brief (you, the chair)
Write one short shared brief the whole panel receives:
- **Goal + app intent**: from memory (operating-style, onboarding-and-flagship,
  design-dna-direction, product guardrails). One paragraph.
- **Change set / release notes**: `git log` + `git diff` since the last build (or the
  branch's committed state). Summarize what actually changed, factually.
- **Open decisions**: anything the founder is weighing this build.

## Step 2 — Convene the panel (parallel)
Dispatch all ten role agents in ONE message (parallel, background), each with the shared
brief plus "review through your lens only; stay silent if this build doesn't touch your
area": product-manager, ux-designer, ui-brand-designer, senior-engineer, backend-engineer,
qa-engineer, release-engineer, growth-marketer, regulatory-privacy, pharmacometrician.
Wait for all to report.

## Step 3 — Chair the synthesis (you)
Do NOT dump ten reports. Produce ONE decision brief:
- **VERDICT**: GO · GO-WITH-CHANGES · HOLD
- **Blocking issues** (anything a role marked "block") — each with who raised it and the fix
- **Real disagreements** — where roles conflict, state both sides and your call as chair
- **Questions the founder must answer** before building (deduped, ranked)
- **Top 2-3 ideas** worth considering (the best, not everything suggested)
- **What to explicitly NOT do** this build
Kill redundancy. Five roles saying "fine" is one line. Signal over volume — a council that
writes essays gets ignored.

## Step 4 — Hand the decision to the founder
Present the brief. Ask for the call. The founder's word is final — if he overrides a
concern, note it and proceed. Do not build until he says go. Then run `ship-check`, then build.

## Rules
- No flattery, no reflexive agreement — the whole panel operates blunt (see the
  operating-style memory). Surface bad ideas as bad, with reasons.
- Relevance-gate hard: most builds won't touch PK, regulatory, or brand — those roles should
  usually return one line.
- The council never ships anything itself and never promotes to store review — that stays
  the founder's explicit decision after on-device testing.
