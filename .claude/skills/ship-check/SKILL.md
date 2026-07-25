---
name: ship-check
description: MUST run before declaring any auth/release change "done" or submitting to Apple/Google. A regression gate (tests + diff review) plus App Store / Play requirement-parity and DoseTrace auth invariants. Invoke it whenever the work touches auth, sign-in/out, account/profile/delete, store metadata, screenshots, or a new build/submission.
---

# ship-check — the gate before "done" and before any store submission

Purpose: stop the two failure modes that have cost DoseTrace real time —
(1) fixing one symptom and breaking something else, (2) discovering a store
requirement only after a rejection. Nothing here is optional once the change
touches auth or a release. Work through the gate that applies, top to bottom.

---

## HARD RULE — owner-mandated, non-negotiable (2026-07-24)

These override any impulse to move fast. Token/compute cost is NOT a reason to skip
any of them — the owner has explicitly accepted the cost.

1. **Every change gets extensive testing BEFORE moving to the next step.** No
   stacking a second change on top of an unverified first one.
2. **Every code change means re-testing ALL ins and outs that could be affected**,
   not just the line you touched — full regression of the affected surface
   (auth → sign-in/out/profile/delete/sync/notifications; sync → every screen that
   reads/writes; i18n → all 6 languages). Trace the blast radius and test all of it.
3. **Always ASK the owner to test** — in the iOS Simulator and/or on their physical
   phone(s) — BEFORE any build is uploaded. Especially Apple. Do not upload on your
   own judgment.
4. **No more direct "make it live" App Store submissions.** TestFlight ONLY (and the
   Android internal-testing track) until the owner confirms NO flaws remain. A build
   is promoted to App Store review only after the owner has tested it and said so.

---

## GATE A — Every code change (before you say "done")

1. **One change at a time.** Land and FULLY verify a single fix before starting the
   next. Never batch unrelated fixes into one unreviewed pass. (Hard rule #1.)
2. **Re-test the whole affected surface, not just the fix.** Map the blast radius
   and exercise every in/out it could touch. (Hard rule #2.)
3. **Run the suite:** `npm test` (node --test, all `__tests__/`). It must be green.
4. **Syntax/bundle for anything non-trivial:** `npx expo export --platform ios`
   must complete — this is the authoritative build check.
5. **Review the diff for regressions, not just the fix.** For any auth/session/
   sync/notification change, spawn a code-review agent (pr-review-toolkit:
   code-reviewer / silent-failure-hunter) over `git diff` and ask specifically:
   "what did this change break elsewhere?" Do not self-certify a root-cause fix
   without a second pass.
6. **Name the blast radius.** If a bug has one root cause with several symptoms
   (see the auth deadlock below), fix the root once and list every symptom it
   resolves — don't chase them as separate tickets across turns.
7. **Hand off to the owner to test** in the Simulator and/or on a physical phone
   before ANY build upload. Never upload unilaterally. (Hard rule #3.)

## GATE B — Auth invariants (any sign-in / sign-out / session / profile / delete change)

These are hard-won. Violating one silently breaks multiple flows at once.

- **`onAuthStateChange` MUST be synchronous.** Never `await` or call any
  `supabase.*` method inline in that callback — Supabase holds an internal lock
  while it runs, and inline async work **deadlocks the lock for the whole
  session**. Once poisoned, EVERY later `updateUser` / `getSession` / `signOut`
  hangs forever. Pattern: `setSession(session)` first, then defer all
  side-effects with `setTimeout(() => {...}, 0)`. See `App.js`.
- **Every auth write must be proven to resolve.** After touching auth, manually
  smoke-test all four in a build: sign-in (email + Google + Apple), **edit
  profile → Save closes the screen**, **delete account → app returns to
  welcome**, sign-out → returns to welcome. A "Save that doesn't close the
  screen" == the `await` never resolved == a deadlock.
- **Redirect URLs:** the PKCE client (`flowType:'pkce'`, `detectSessionInUrl:false`)
  needs every redirect allow-listed in Supabase → URL Configuration, or Supabase
  falls back to Site URL (dosetrace.io) and the app never gets the `code`.
  Current allow-list: `dosetrace://`, `dosetrace://reset-password`,
  `dosetrace://confirm-email`, `https://dosetrace.io/auth`.
- **`signOut({ scope: 'local' })`** with a global fallback — avoids a network
  revoke that can stall.

## GATE C — Release path (before ANY App Store / Play submission)

**TestFlight / internal-testing ONLY (Hard rule #4).** No direct "submit to App
Store review" / "make it live" until the owner has installed the build, tested it,
and confirmed NO flaws remain. Order every release this way:

> build → Claude verifies in the Simulator (screenshots to owner) → **TestFlight**
> (iOS) / **internal track** (Android) → **owner tests on their real phone** →
> owner says "clean" → ONLY THEN promote to store review.

Never skip a rung. If the owner hasn't confirmed, the build does not go to review.

**Store-requirement parity** — check BOTH platforms together, they must stay symmetric.

- **Login parity (Apple Guideline 4.8):** if the app offers ANY third-party or
  social login (Google, Facebook, etc.), it MUST also offer **Sign in with
  Apple** on iOS. Adding a social login = add Apple sign-in in the SAME change.
  (This is the miss that cost ~10 builds. Never again.)
- **Apple sign-in prerequisites when shipping it:** `usesAppleSignIn:true` in
  app.json; App ID `io.outcom.dosetrace` has the "Sign In with Apple" capability
  (else EAS build fails signing); Supabase Apple provider Client IDs = the bundle
  ID (native flow, no OAuth secret).
- **EULA** link present in the App Store description (Guideline 3.1.2).
- **Demo account** current and working for review (Guideline 2.1) — appreview@dosetrace.io.
- **Citations** for any health/number claims are real and verifiable (Guideline 1.4.1).
- **Screenshots show the REAL current app** — same tabs, same screens. No
  fabricated mockups. Real captures live on Desktop; Play copies padded to ≤2:1
  with no content cropped. Apple and Google should show the same real images.
- **Versioning:** `appVersionSource:remote` + `autoIncrement` (app.json
  buildNumber is ignored). `eas submit` iOS needs `ascAppId` in eas.json; Android
  `eas submit` is blocked (no Play service account) → manual .aab upload.

## GATE D — DoseTrace product guardrails (never violate)

- **Never interpret, recommend, or diagnose.** It is an honest personal journal +
  pure-math calculator. No advisory language, no "makes dosing safer".
- **Never add a drug-interaction checker.**
- **Never strip any of the 6 languages** (EN/ES/PT/FR/DE/IT). i18n edits stay
  quote-agnostic (mixed `"`/`'` in translations.js); run the i18n parity tests.
- **Never link DoseTrace to EvoxBiolabs** anywhere. Owner is Outcom.
- **Never commit secrets** (STATE.md credentials stay out of git).

---

## When invoked, report back explicitly
State which gate(s) you ran, the `npm test` result, whether the bundle exported,
what the diff-review found, and — for a submission — a checked list of C. If any
item can't be verified from code (dashboard/device state), say so and flag it for
the user or Cowork rather than assuming it's fine.
