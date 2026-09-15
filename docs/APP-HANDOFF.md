# DoseTrace — full app handoff

A complete, self-contained overview of what DoseTrace is, how it's built, every
feature, the data/backend architecture, the release pipeline, and what's done vs.
still open. Written so another assistant can understand the whole app with no other
context. (No secrets/keys/credentials are included.)

---

## 1. What DoseTrace is

A **health journal + pure-math dosing calculator** for people self-managing
peptides, TRT/hormones, and GLP-1s. Live on the **Apple App Store** and **Google
Play**. Phone-first mobile app.

**Positioning:** not a social app, not a coach. It's an honest personal record + a
transparent calculator. The differentiator ("the moat") is the **dose-accumulation
/ serum-level curve** — projecting how a compound builds up and clears over time
from the user's own schedule. Main named competitor: "Dose Track."

**Product guardrails (hard rules, never violated):**
- It **never interprets, diagnoses, recommends, or advises**. It records what the
  user enters and does pure math. No drug-interaction checker.
- **AI hard line:** every AI feature may only **transcribe or surface the user's
  own data** — never recommend a treatment/dose/protocol, never diagnose or
  interpret a result. It shows the user's numbers and points to a health
  professional. This is the Apple 1.4.1 / Software-as-a-Medical-Device regulatory
  line and the core legal defense.
- **6 languages**, always kept at parity: English, Spanish, Portuguese, French,
  German, Italian.
- No emoji in the UI — a custom monoline vector icon set is used instead.

---

## 2. Tech stack & architecture

- **React Native 0.81 / Expo SDK 54** (managed workflow, EAS build).
- **Navigation:** React Navigation — a bottom **tab navigator** (5 tabs) inside a
  stack; extra screens (Log, Serum Curve, FAQ, Paywall) are pushed on the stack.
- **Local storage:** on-device **SQLite** (expo-sqlite) is the source of truth for
  the UI; everything is **offline-first**.
- **Cloud:** **Supabase** (Postgres + Auth + Edge Functions). Local SQLite mirrors
  cloud Postgres tables and syncs bidirectionally.
- **Auth:** Supabase Auth — email/password, **Sign in with Google**, **Sign in
  with Apple** (Apple required by Guideline 4.8 because Google is offered). PKCE
  flow; deep links for email confirm + password reset.
- **Payments:** **RevenueCat** (Premium entitlement) — some features are
  Premium-gated.
- **AI:** **Anthropic Claude** (Haiku model) via Supabase Edge Functions — used
  only for transcription/extraction (see §6).
- **i18n:** a single `i18n/translations.js` keyed table across all 6 languages,
  with an automated parity test.
- **Theming:** light + dark, driven by semantic color tokens in `lib/theme.js`
  (screens never hardcode colors); follows the OS or an explicit user choice.
- **Responsive:** phone-first, but every screen renders correctly in landscape and
  on large screens (foldables/tablets) — content is capped to a centered readable
  column (see `lib/responsive.js`).

**Key source directories:**
- `screens/` — top-level screens. `screens/components/` — big embedded sections.
- `components/` — shared UI (the vector icon set).
- `lib/` — all non-UI logic: database, sync, schedule math, dose math, PK/half-life
  data, notifications, theme, purchases, AI clients, etc. Most `lib/*` files are
  pure/CommonJS so they're unit-tested under Node.
- `i18n/` — translations + language context.
- `supabase/functions/` — edge functions.
- `__tests__/` — Node test-runner unit tests (schedule, sync, mappers, dose math,
  nutrition, missed doses, i18n parity, …).

---

## 3. The screens & every feature

### Onboarding & auth (pre-login)
- **Welcome/splash** → **value-first onboarding flow** (`OnboardingFlowScreen`):
  educates on the serum-curve idea, collects profile basics (name, birth year, sex
  at birth, goal, activity) **before** an account exists, stashed locally and
  written to the account right after sign-up.
- **AuthScreen:** sign in / create account (email, Google, Apple). Back navigation
  everywhere.
- **CompleteProfileScreen:** a **hard gate** — any signed-in account missing the
  required profile fields must complete them before reaching the app (e.g. a
  Google/Apple sign-in, or a returning legacy user after an update). Redesigned with
  clear required-field markers, real validation, a month-grid + typed birth year,
  and copy explaining *why* the gate appears.
- **ResetPasswordScreen:** opened from a password-reset email deep link.

### Tab 1 — Today (`TodayScreen`)
The daily home. Shows due doses (with a progress ring / next-dose), streak &
adherence summary, and **alert cards** (e.g. supply running low, bloodwork due, an
open reality-check weigh-in). Doses are marked Taken/Skipped here; a "mark as taken"
also works from the notification. Derived alerts can be snoozed.

### Tab 2 — Protocols (`ProtocolsScreen`)
Create and manage compounds/protocols. A multi-step **create wizard**:
1. **Type:** reconstituted (lyophilized, mixed with water), ready-to-use (pre-mixed
   vial), or oral (capsule/tablet/liquid).
2. **Compound** (deterministic resolution to a known compound where possible).
3. **Dose & concentration** (with a safety check that the draw volume fits the
   syringe, unit-mismatch guard).
4. **Schedule:** first dose (today/tomorrow) + start date, interval (every day or
   every N days), doses per day (1–3), and the time(s).
5. **Vial** (recon only): date mixed + validity window (BAC water shelf life);
   supply/expiry are derived.
- Supports **comma-decimal** input (EU locales), custom intervals for long TRT
  esters, and a native date picker for the start date.
- **New (next build): past-dose backfill** — if the start date is in the past, on
  save it offers to log every scheduled dose since then as Taken, so adherence +
  history reflect a compound the user started before installing the app (all types).
- **New (next build): phantom-dose fix** — adjusting the dose time no longer spawns
  a spurious second dose when "once a day" is selected (mixing a vial never forces
  an immediate dose; mixing is decoupled from injecting).
- Also here: a **syringe/reconstitution guide** with a zoomable ruler.

### Tab 3 — Journey (`JourneyScreen` → `CalculatorSection`)
The "am I on track" tab and the calculator home. Leads with the **dose-accumulation
/ serum-level curve** card (Premium; the moat). Contains:
- **Energy/protein calculator:** BMR (Mifflin or Katch-McArdle when body fat is
  known), TDEE, protein target, from the user's stats. Cites its sources. Body-fat
  source can be gym/known/unknown; sex-specific BMR is gated on a known profile sex.
- **"Your numbers"** collapsible results, and **saved snapshots** over time
  (weight/waist/LBM/BMR/TDEE) charted (`ProgressChart`).
- **Reality-check:** log a starting weight, then a later weight; with the elapsed
  days + average daily intake it back-computes the real maintenance calories (TDEE)
  and weekly rate — a feedback loop on whether the plan is working. History of
  checks is tracked; an easy "stop reality check" clears it and its reminders.
- **AI nutrition logger** (`NutritionLogger`, Premium after a 3-day free trial):
  a conversational composer — the user types what they ate in natural language, the
  AI extracts foods + estimates (calories / carbs / protein, shown as estimates ~),
  grouped by day with a 7-day average that auto-feeds the reality-check's intake
  input. Corrections route to a tap-to-fix editor (the AI never gives diet advice;
  advice-shaped input hits a fixed "see a professional" card). Offline-first.

### Tab 4 — Body (`BodyScreen`)
The records hub:
- **Bloodwork / biomarkers:** enter lab values (or scan a lab report via AI
  extraction), charted over time (`MarkerChart`), with favorites and per-report
  tags/labels. Export.
- **Vaccines** (`VaccinesSection`): a personal vaccine log (name, date, next due,
  manufacturer, lot, dose #, provider, location).
- **Body map** (`BodyMapModal`): pick/track injection sites (rotation).
- Full-screen **Serum Curve** (`SerumCurveScreen`, pushed from here / Journey): the
  detailed multi-compound accumulation chart (see §5).

### Tab 5 — Settings (`SettingsScreen`)
Profile editing, theme, language, time format, account management (**sign out**,
**delete account** with full data erasure), the demo/legal links, FAQ, paywall
entry. Consent management for AI features.

### Log (`LogScreen`, pushed)
Full dose history as a sectioned list (by day), filterable (All/Taken/Skipped/
Missed). Missed doses are auto-materialized (a slot 12h+ past unlogged becomes an
editable "Missed"). Tapping a row lets the user correct the outcome or the injection
site.

### Paywall (`PaywallScreen`) & FAQ (`FAQScreen`)
Premium plans (RevenueCat) and a help/FAQ screen.

---

## 4. Data model & sync engine

**Local SQLite tables** (each mirrors a cloud Postgres table, all synced): 
`protocols`, `vials`, `dose_logs`, `biomarkers`, `vaccines`, `food_logs`,
`reality_checks`, `calc_snapshots`.

Every synced row carries: `id` (local), `remote_id` (cloud UUID), `user_id`,
`created_at`, `updated_at`, `sync_status` (`pending` | `synced` | `deleted`).

**Sync engine** (`lib/syncCore.js`, pure & unit-tested; `lib/sync.js` is the
Supabase adapter; `lib/syncMappers.js` maps local rows → cloud payloads;
`lib/schema.js` is the canonical DDL):
- Offline-first: writes go to SQLite immediately as `pending`; a background sync
  pushes then pulls.
- **Push:** pending rows are inserted/updated in the cloud; **deletes are soft
  (tombstones)** — `sync_status='deleted'` is pushed as a cloud delete, then the
  local row is purged. Deletions win over edits (no resurrection).
- **Pull:** a per-user, cloud-time watermark fetches only newer rows; local rows
  with pending changes aren't overwritten.
- **Full import** on first launch / new device.
- **Cross-account safety:** local data is wiped on an **intentional** sign-out, and
  on sign-in a **user-switch guard** wipes any data belonging to a different user
  (one account's data never bleeds into another on a shared device). A *spurious*
  sign-out (expired token) keeps the data (it's cloud-backed and re-syncs) — this is
  the "never lose user data" fix (see §8).

**Supabase Auth `user_metadata`** (per-user, not a synced table) holds a few
things: profile fields (name, birth year, sex, country, goal, activity), consent
flags, calculator inputs (`calc_inputs`), the open reality-check weigh-in
(`calc_reality_open`), bloodwork favorites/tags, and a one-time migration flag. The
health *history* lists (reality checks, calculator snapshots) were **moved out of
metadata into synced tables** for durability.

**RLS:** every cloud table is owner-only (`auth.uid() = user_id`) on
select/insert/update/**delete**.

---

## 5. The serum-curve / PK model
`lib/halfLives.js` holds ~74+ compounds with published half-lives and evidence
tiers. `SerumCurveScreen` draws a single-exponential decay/accumulation curve. It is
**schedule-driven** — doses come from the protocol's `start_date` + interval +
doses-per-day (not from hand-logged doses), so the curve reflects the plan. Supports
multi-compound overlay on a shared scale, an auto-grouped "combined total" per
active substance (esters of the same hormone), a selectable projection horizon, an
mg y-axis, and cross-referencing blood-draw dates. **The model is sex-neutral** and
must stay so until per-compound sex-stratified data exists (no global fudge factor).

---

## 6. AI features (all transcription/extraction only)
Three Supabase **Edge Functions**, each calling Anthropic Claude (Haiku), each
enforcing the AI hard line:
- **`extract-bloodwork`** — reads a photo/PDF of a lab report and returns
  structured biomarker values for the user to review before saving. Never
  interprets.
- **`parse-food`** — extraction-only: turns a natural-language meal into structured
  food items + calorie/macro estimates. Enforces a per-day quota (counted before the
  model call), refuses advice-shaped input, logs no raw text.
- **`delete-user`** — full account + data deletion (GDPR erasure).
- **Vial-label scan** (prefill a protocol from a photo of a vial label) is a
  review-before-save flow with its own small monthly quota.

All AI results are **reviewed by the user before they're saved**; the app never
acts on them automatically.

---

## 7. Build & release pipeline
- **EAS remote versioning** (`autoIncrement`): the build number is minted by EAS,
  not app.json. Marketing version `1.2.0` currently.
- **iOS:** `eas build` → `eas submit` to App Store Connect → the build appears in
  the internal TestFlight group for the founder; going to the **external "Early
  Birds"** public link requires adding it to that group + submitting beta review
  (verified via the ASC API — a helper script, `/tf-status`). App Store *review*
  submission is a separate, deliberate step after device testing.
- **Android:** `eas build` → `eas submit` to the **Play internal** track (service
  account). Production is promoted from there.
- **Pre-build gates (every build):** a "dt-council" (a panel of role-specialist
  reviews) + a "ship-check" (regression + auth-invariant + store-parity checklist),
  then the founder gives the go. Nothing goes to store review until the founder
  device-tests and says it's clean.
- **Local iOS native build is blocked** on the current Mac (toolchain), so
  screenshots/verification come from an **EAS simulator build** run in the iOS
  Simulator, or the founder's device.

---

## 8. Current state — what's built

**On TestFlight/Play internal now (build "54", v1.2.0, branch `feat/wellness-rework`)
— awaiting founder device test before any external/store push:**
- 5-tab structure with the Journey tab (calculator + curve + AI nutrition logger).
- **Full landscape / large-screen (foldable/tablet) support** — portrait lock
  removed; every screen renders as a centered readable column on wide viewports;
  charts + modals sized to the column; safe-area tracks rotation.
- **AI nutrition logger** (conversational, extraction-only, feeds the reality-check).
- **Profile-gate redesign** + "why you're seeing this" explanation.
- **Data-safety overhaul** (the big recent theme, triggered by a real data-loss
  incident where an in-progress reality-check was wiped on update):
  - The reality-check weigh-in is now **cloud-backed** (was device-only).
  - Calculator **history moved from `user_metadata` into synced tables**
    (`reality_checks`, `calc_snapshots`) — appends are single-row inserts, so a
    stale write can't truncate history; one-time non-destructive migration of old
    data, gated on a durable flag.
  - Standing rule added: **user-entered data must survive updates / screen rebuilds
    / re-auth / sync** — durable synced storage is the default.

**On the branch, committed, queued for the NEXT build (not yet built):**
- **SIGNED_OUT wipe-guard:** the destructive local wipe now fires only on an
  intentional sign-out, never on a spurious/expired-session one (with the sign-in
  user-switch guard preserving cross-account safety).
- **Phantom second-dose fix** in the protocol create wizard.
- **Past-dose backfill** when a protocol's start date is in the past.

---

## 9. What's left / open

**Before any external TestFlight or store-review promotion:**
- **Founder device testing** of the current build — especially the update-survival
  test (enter data on the old build → update → confirm nothing is lost), the
  clear-then-relaunch test, sign-out/in, and the landscape/fold pass — then promote.
- **Store screenshots** are stale (pre-redesign, no Journey tab). New captures of
  the current app are needed for Apple (6.9" / 1320×2868), Google Play, and the
  marketing website. (In progress via the iOS Simulator on a populated demo
  account.)
- **App Store App-Privacy + Play Data-safety labels** must declare health data +
  AI processing (Anthropic) as applicable.
- **Legal:** a lawyer should sign off on the **GDPR Article 9** (special-category
  health data) hard profile gate, and confirm the Anthropic data-processing terms
  cover free-text meal/label input.
- **RevenueCat** products (annual/lifetime) attached & verified; the "3-day free
  trial then Premium" wording matches configured products.
- Google Play large-screen "quality" declaration once the landscape work is
  verified (unlocks tablet/foldable discoverability) — but don't claim it until
  verified on a real device.
- **Supabase Point-in-Time Recovery / backups** (a dashboard/billing action) as a
  data safety net.

**Roadmap / deferred (not committed):**
- Move bloodwork favorites/tags off `user_metadata` into tables too (currently
  cloud-backed but not truncation-proof).
- A logo/brand refresh so app, Apple, Google, and website all match; and a broader
  icon-system pass (a more distinctive AI mark, unified chevron/back/close glyphs).
- The serum-curve PK model's deeper redesign (a Vd/CL engine, per-compound
  modifiers) — evidence-gated, future.
- A 1-year early-adopter Premium offer (deliberately parked by the founder).
- Personal target lines, compare-across-labs, timeline correlation, travel PDF/QR,
  a "what-if" simulate mode.

---

## 10. Non-negotiable rules (for anyone building on this)
- Never make the app interpret/diagnose/recommend; AI only surfaces the user's own
  data (Apple 1.4.1 / SaMD line).
- Never lose user-entered data across updates/screens/re-auth/sync.
- Keep all 6 languages at parity; never strip one.
- No emoji in the UI (use the vector icon set).
- `onAuthStateChange` must stay synchronous (no inline awaits / Supabase calls) —
  inline async work there deadlocks the whole session.
- Verify color/contrast in both light & dark before every build.
- Every build goes through the review gates, then the founder's go, then
  TestFlight/internal, then device test, then store review — never skip a rung.
