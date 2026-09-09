# CLAUDE.md — operating contract for DoseTrace

Read this first, every session. These rules exist because they were each broken and cost real time/tokens. The founder should not have to babysit — that is what this file is for.

## Prime directive: ORIENT before you ACT

Before any build, submit, delete, migration, or "it's done" claim:
1. **Read `STATE.md`** (the running ledger of what's done / in flight) before starting related work. Update it as you go, not at the end.
2. **State what you're about to do and exactly what you'll verify** — then do the verification. Keep it to a sentence; don't narrate every step.
3. **Verify with evidence — NEVER assume.** A command's exit code, an `eas submit` "success", a POST returning 2xx — none of these mean the user-visible outcome happened. Check the actual state (API, tests, logs, the live URL). If you can't verify it, say "unverified" — never call it done.

If you catch yourself about to do a second thing before the first is verified, stop and verify the first.

## Rebuild means REPLACE, not bolt-on

When replacing a screen/module/flow: delete the old one in the same change. Never leave the old version alive "as a fallback" — it resurfaces (e.g., the legacy `OnboardingScreen` leaking on sign-out). "I rebuilt X" is false if the old X still ships.

## No emoji in the UI

Emoji in any user-facing screen is a bug. Use `components/FeatureIcon.js` (the founder's vector set). If a glyph is missing, add one to `assets/feature-icons/` + `components/featureIconsData.js` in the same monoline style — don't fall back to an emoji.

## Definition of DONE (per change)

- `npm test` green (the one known failure is `docs/research/bmr-calculator/reference/energy.test.ts` — pre-existing, ignore ONLY that one).
- `npx expo export --platform ios` completes (the authoritative bundle check for anything non-trivial).
- i18n edits keep all 6 languages in parity (the parity test must pass).
- **Auth / session / sync / delete changes** → ship-check GATE B + a code-review pass over the diff + the founder tests on device before any upload. `onAuthStateChange` stays synchronous (no `await`/`supabase.*` inline — it deadlocks the session).
- Before EVERY EAS build: run the **dt-council** skill, then **ship-check**, then build. No build until the founder says go.

## TestFlight / release — the miss that cost the most

`eas submit` uploads the binary to App Store Connect; it does **NOT** put it in front of testers. A build in zero TestFlight groups is invisible. After `eas submit`, always:
1. Add the build to the group — internal all-builds for the founder's own testing, and the **Early Birds** external group (`0980fae5-...`) for the public link.
2. Submit external beta review.
3. **VERIFY via the ASC API** that the build is grouped and the beta review is `WAITING_FOR_REVIEW` with a real `submittedDate`. `/tf-status` does this check.

NEVER tell the founder a build is "on TestFlight" / "delivered" until `/tf-status` confirms it. See the `testflight-release-external` memory for the exact API calls.

## Gotchas that have bitten

- **Node** is only on PATH via nvm — prefix Bash: `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"`.
- **Commit messages**: no backticks in `git commit -m` (shell command-substitutes and silently drops the word). Use plain quotes.
- **Numbers**: dose fields accept comma decimals ("0,5") — `parseDecimal` in `lib/doseMath.js`. Comma-grouped thousands ("5,000 IU") are NOT decimals.
- **Node scripts**: write as `.cjs` (the scratchpad is ESM). Verify JS edits parse with `@babel/parser`.
- **Product guardrails**: honest journal + pure-math calculator only — never interpret, diagnose, recommend, or add a drug-interaction checker. Never strip a language. Never link DoseTrace to EvoxBiolabs (owner is Outcom). Never commit secrets (STATE.md credentials stay out of git).

## Attribution

Commits: `git -c user.name="evandroviskis" -c user.email="jootaerre@gmail.com" commit`, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
