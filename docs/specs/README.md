# Specs and acceptance — how "done" is decided

Adopted 2026-09-27 after the food-log AI shipped weaker than the conversation the
founder validated, and every summary called it done. The builder never decides that a
feature matches what the founder approved. The checklist and its evidence do.

## The loop
1. **Spec → checklist.** Every founder-approved feature gets a file here ending in a
   numbered acceptance checklist. Each criterion is ONE testable behavior a person can
   check ("after lunch is logged, the next question is never about lunch"), not an idea.
2. **Founder signs the checklist.** The header line `checklist-signed:` holds the date
   and who signed. Until signed, the audit warns and the feature is not "approved".
3. **Build against it.** Each criterion's row gets a status and real evidence.
4. **Deviations need sign-off.** If a criterion can't be built as written, the row says
   why in `Deviation` and stays open until the founder writes `approved YYYY-MM-DD` there.
   Nothing is quietly simplified.
5. **Independent audit.** The `spec-auditor` agent (dt-council) checks every criterion
   against the running app/code using ONLY the spec, never the builder's summary.
6. **Gate.** `node scripts/spec-audit.cjs` must pass before any build (ship-check Gate S).
7. **Founder acceptance.** He sees the evidence per criterion before the build ships.

## Row format
`| ID | Criterion | Status | Evidence | Deviation |`
- **Status:** `built` · `partial` · `missing`. "Done" means `built` with evidence.
- **Evidence:** an automated test (`__tests__/file.test.js: "test name"`), a simulator or
  device check (`sim 2026-09-27: what was seen`), or a file reference for server rules.
  "I wrote the code" is not evidence.
- **Deviation:** empty, or the reason it differs; `approved YYYY-MM-DD` once the founder
  accepts the deviation.

The audit fails when: a row is `built` without evidence; a row is `partial`/`missing`
without an approved deviation (it is unfinished approved work); or a row is malformed.
