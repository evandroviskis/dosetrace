# 01 — Onboarding, sign-up and sign-in

> Draft for founder review, written 2026-10-12 from `docs/product/research/07-onboarding-account-premium.md` (main source), `08-platform.md`, `03-reminders.md`, `docs/decisions.md` (Onboarding & auth, Data & privacy, Premium/Auth 2026-10-03 rounds) and `docs/specs/premium-and-auth.md`, `docs/specs/reminder-setup-placement.md`. Code read on `redesign/graduated` @ 4dade55.
> This document shows the **intended** behaviour. Where the code differs today, a **Divergence today** note names the dossier finding (`07 D-18` = `research/07-…md` §6 D-18; `07 Gap 6` = §9 item 6).

---

## 1. Goal

Turn a first-time install into a signed-in account with a complete profile, in the order the founder approved: **value first, account last** (decisions 2026-09-08, 2026-09-29). Also: let a returning user sign in, recover a password, finish a missing profile (build-49 gate, "I need the data"), and confirm they are 18+ — without ever losing what they typed and without ever writing one person's answers into another person's account.

## 2. Actors

| Actor | Role |
|---|---|
| New user | Installs, answers 8 onboarding steps, creates an account (email, Apple or Google). |
| Returning user | Signs in on a new phone / reinstall / after sign-out. |
| Incomplete-profile user | Any account missing one of the 8 required fields (gate since 2020-01-01: nobody grandfathered). |
| Under-18 legacy user | Old account whose stored birth year makes them under 18. |
| Shared-device second person | Uses the same phone after someone else typed onboarding answers. |
| Supabase Auth | Sign-up, sign-in, email confirmation, password reset, `user_metadata`. |
| Apple / Google | Native ID token (iOS Apple, Google both); Android Apple = web OAuth (probe-gated). |
| OS | Notification permission prompt (iOS / Android 13+). |
| Sync engine | Import from cloud after SIGNED_IN (`fullImportFromCloud` when local DB empty). |

## 3. Preconditions

- App installed; fonts loaded; `seenOnboarding` resolved (loading gate, `App.js:786`).
- Network needed for sign-up / sign-in / confirmation / reset; onboarding answers work offline (stash in AsyncStorage `dt_onboarding_data`).
- Root router is the only router (`App.js:291-335`): Recovery → Onboarding / Auth → CompleteProfile → AgeConfirm → Main.

## 4. What may already have happened before

| # | Prior state the user arrives in | How it shows | What the flow must do |
|---|---|---|---|
| P1 | Never opened the app | No stash, no `dt_seen_onboarding` | Start at splash (step 0). |
| P2 | Typed some answers, killed the app | Stash has answers; freshness was memory-only | Reopen onboarding at step 0, or at "Before we begin" with boxes empty when profile + consent are complete (R5). Every typed answer kept except the consent ticks. |
| P3 | Finished onboarding, tapped Create account, killed before submitting | Stash complete, email draft was in memory | Reopen on "Before we begin" (PA-92); the email must be retyped (never stored). |
| P4 | Signed up by email, never opened the confirmation link | Account exists, unconfirmed | Sign in shows "Please confirm your email…" sheet with **Resend** (30 s cooldown). |
| P5 | Opens the confirmation link on a different phone | No PKCE verifier there | Sheet "This link didn't work" variant: "Your email may already be confirmed. Sign in with your email and password." |
| P6 | Already has an account (other phone, older version) | Session absent; cloud data exists | "Already have an account? Sign in" from splash → Auth (Sign in) → import from cloud. |
| P7 | Account created with Apple, now on Android | Apple button on Android only if the server probe passes | Show "Continue with Apple" on Android (founder 2026-10-03 "3 sim"). |
| P8 | Account older than build 49 with missing fields (e.g. no country, no tracking types) | `missingProfileFields != []` | Route to **Finish setup** showing only the missing steps. |
| P9 | Account with a birth year under 18 (old data) | `needsAdultConfirmation` | Route to **Please confirm your age** after the profile gate. |
| P10 | Another person used this phone and left a stash | Stash exists, not fresh | Never written into this person's account; cleared unwritten on SIGNED_IN (PA-71…PA-73). |
| P11 | Password forgotten | — | "Forgot password?" → email → link opens Reset password inside the app (pending ≤ 1 h survives a kill). |
| P12 | Reinstall on iPhone | Keychain session may survive, AsyncStorage empty | Goes straight to Main (or a gate); DB re-imported. (SUSPECTED platform behaviour, `07 §8`.) |
| P13 | Offline at first launch | — | Onboarding works; Create account / Sign in show the network sheet; nothing typed is lost. |
| P14 | Notification permission already denied at OS level | — | "Enable notifications" opens no prompt; flow continues to Create account. |

## 5. Happy path

```mermaid
flowchart TD
  A["Install, first launch"] --> B["Splash: Every dose, precisely tracked. / Get started"]
  B --> C["Features: Built for your protocol"]
  C --> D["Goals: What are your goals? (1 or more)"]
  D --> E["Tracking: What are you using? (1 or more)"]
  E --> F["About you: name, birth month + year 1900..now-18, sex, country"]
  F --> G["Your routine: 5-level activity + healthcare provider yes/no"]
  G --> H["Before we begin: tick 4 boxes"]
  H --> I["Never miss a dose"]
  I -->|Enable notifications, iOS| J["OS permission prompt"]
  I -->|Enable notifications, Android| K["OS prompt then Make sure your reminders arrive (items + bar)"]
  I -->|Not now| L["Auth: Create account"]
  J --> L
  K -->|Continue or Set up later| L
  L -->|Apple / Google / email + password + consent ticked| M{"Session returned?"}
  M -->|yes| N["SIGNED_IN: apply fresh stash to missing fields only, import, schedule reminders"]
  M -->|email confirmation on| O["Account created: Open email app / Resend / Wrong address?"]
  O -->|user opens link on this phone| P["Email confirmed sheet, signed in"]
  P --> N
  N --> Q{"Profile complete and adult?"}
  Q -->|yes| R["Main: Today tab"]
  Q -->|missing field| S["Finish setup: only missing steps"]
  Q -->|year under 18| T["Please confirm your age"]
  S --> R
  T --> R
```

## 6. States and transitions

### 6.1 Root route (who sees which screen)

```mermaid
stateDiagram-v2
    [*] --> Loading
    Loading --> PendingWipeCheck: getSession done
    PendingWipeCheck --> Loading: interrupted wipe completed, session re-read
    Loading --> ResetPassword: pending recovery under 1 h
    Loading --> Onboarding: no session and (not seen or stash has answers)
    Loading --> Auth: no session and seen and stash empty
    Loading --> CompleteProfile: session and a required field missing
    Loading --> AgeConfirm: session complete and birth year under 18 and not confirmed
    Loading --> Main: session complete and adult
    Onboarding --> Auth: Create account or Sign in hand-off
    Auth --> Onboarding: Back
    Auth --> AccountCreated: sign-up ok, confirmation required
    AccountCreated --> Auth: Sign in with my account or Wrong address
    AccountCreated --> Main: confirm link opened here, session
    Auth --> CompleteProfile: SIGNED_IN, profile incomplete
    Auth --> AgeConfirm: SIGNED_IN, complete, under 18
    Auth --> Main: SIGNED_IN, complete, adult
    CompleteProfile --> Main: Finish setup saved, USER_UPDATED
    CompleteProfile --> AgeConfirm: USER_UPDATED, year under 18
    CompleteProfile --> CompleteProfileQueued: Finish setup offline
    CompleteProfileQueued --> Main: back online, answers written
    AgeConfirm --> Main: I am 18 or older plus real year saved
    CompleteProfile --> SigningOut: corner Sign out
    AgeConfirm --> SigningOut: Sign out
    SigningOut --> Onboarding: intended sign-out wipe done
    Main --> ResetPassword: reset link for the same account
    Main --> SwitchAsk: reset link for another account
    SwitchAsk --> Main: Cancel
    SwitchAsk --> SigningOut: Sign out and continue
    ResetPassword --> Main: Save new password
    ResetPassword --> Auth: Not now or link expired
```

### 6.2 Pre-account step machine

```mermaid
stateDiagram-v2
    [*] --> Entry
    Entry --> splash: profile incomplete or no consent in stash
    Entry --> consent: profile complete, consent stored, not fresh (boxes empty)
    Entry --> reminders: profile complete, consent given in this run (Back from Auth)
    splash --> features: Get started
    splash --> AuthSignIn: Already have an account? Sign in
    features --> goal: Continue
    goal --> tracking: Continue, 1 or more goals
    tracking --> about: Continue, 1 or more types
    about --> routine: Continue, name + month + valid year + sex + country
    routine --> consent: Continue, activity + provider
    consent --> reminders: 4 boxes ticked, stash marked fresh
    reminders --> AuthCreate: Not now
    reminders --> AuthCreate: Enable notifications, iOS
    reminders --> setup: Enable notifications answered, Android
    setup --> AuthCreate: Continue or Done or Set up later
    goal --> features: Back
    tracking --> goal: Back
    about --> tracking: Back
    routine --> about: Back
    consent --> routine: Back
    reminders --> consent: Back
    setup --> reminders: Back
```

### 6.3 Stash freshness (shared-device rule, PA-71…73)

```mermaid
stateDiagram-v2
    [*] --> Empty
    Empty --> Stale: Continue on any step (persisted, not fresh)
    Stale --> Fresh: Continue on Before we begin in THIS run
    Fresh --> Stale: app killed (freshness is memory only)
    Fresh --> Written: SIGNED_IN, missing fields filled
    Stale --> Discarded: SIGNED_IN of anyone (never written)
    Fresh --> Kept: SIGNED_IN but write failed or offline
    Kept --> Written: next SIGNED_IN online
    Written --> Empty: stash cleared
    Discarded --> Empty
    Fresh --> Empty: intended sign-out
    Stale --> Empty: intended sign-out
```

### 6.4 Transition table (data-bearing)

| From → To | Trigger | Guard | Writes |
|---|---|---|---|
| any step → next | Continue | `canContinue(step)` | `dt_onboarding_data` (merge, filled keys only; consent true/false every time) |
| consent → reminders | Continue | 4 boxes ticked | stash `consent_accepted`, `consent_date`; in-memory `fresh = true` |
| reminders → setup | Enable notifications (Android) | — | OS permission; `dosetrace_reminder_setup_seen = '1'` |
| reminders → Auth | Not now / Enable (iOS) / setup Continue | — | `dt_seen_onboarding = '1'` |
| Auth → AccountCreated | Create account (email) | email regex, password ≥ 6 (trimmed), consent ticked | `signUp` with `user_metadata = signupMetadata(stash, fresh)`; fresh stash cleared |
| Auth → SIGNED_IN | Apple / Google / Sign in | consent ticked for Apple/Google from Create | session in SecureStore; `applyPendingProfile` fills only missing fields |
| SIGNED_IN → Main | profile complete + adult | — | `initPurchases`, sync engine, cross-account guard, import or sync, reality migration, permission + `syncAllNotifications` + push token |
| CompleteProfile → Main | Finish setup | shown steps answered | `updateUser({data: accountPatch})` — only the shown steps' fields, `activity_scale: 5`, consent only if never recorded |
| AgeConfirm → Main | I'm 18 or older + year | year picked (this year − 18 … 1900) | one merge write `{adult_confirmed_at, birth_year}` |
| ResetPassword → Main | Save new password | match, different from old | isolated client `updateUser({password})`, then main `setSession` |

## 7. Alternative and exception paths

### 7.1 Offline
- Onboarding steps: work fully offline; stash persists every Continue.
- Create account / Sign in / Apple / Google offline: DoseTrace sheet "Connection problem. Check your internet and try again." (`error_network`); typed answers kept; password field cleared on errors.
- **Intended:** Finish setup and the 18+ confirmation may be answered offline — answers are kept on the phone and written when back online; both gates also offer **Sign out anyway** with its confirmation (decision 2026-10-04, dt-council 1.3.0).
  - **Divergence today (07 D-22 area; 07 Gap 6; registry A-94 "Not started"):** both gates show an error sheet and stay locked offline; neither offers "Sign out anyway". An offline user with unsynced rows can be trapped.
- Offline cold start with an expired access token: **intended** the stored session is still the user's; the app must not route to Auth.
  - **Divergence today (07 D-16, SUSPECTED):** `getSession()` may return `{session:null, error}` and App routes to Onboarding/Auth until a later refresh event. Needs a device check (airplane mode, token > 1 h old).

### 7.2 App killed
| Killed during | Next launch |
|---|---|
| Any onboarding step | Onboarding reopens (stash has answers); step 0, or "Before we begin" with boxes empty if profile is complete (R5). |
| Android reminder setup step (Android killed the app while the user was in system settings) | Onboarding reopens at "Before we begin", every answer kept except the consent tick (SP-4, Gate B). |
| Create account screen | Back on "Before we begin"; email retyped. |
| After `signUp`, before confirmation | Metadata is already on the account; the confirm link later gives a session. |
| Reset password | Reset password screen comes back for up to 1 h (pending recovery in SecureStore). |
| Apple on Android, mid web flow | PKCE verifier of any pending reset/confirm restored; relaunch with `auth-callback` signs in once. |

### 7.3 Second device / other account
- Same account on a second phone: Sign in → full import; profile already complete → Main directly; Android once-per-phone reminder setup opens from Today (flow 06).
- **A different account signs in on a phone holding another account's local data:** the previous account's local data is discarded (cross-account guard, decision 2026-10-03 privacy over unsynced data). Reminders of the previous account cancelled before import.
- Shared phone, stash typed by person A, person B signs up with Apple: stash not fresh for B → never written to B (PA-71…73).
- **Divergence today (07 D-18; 08 Gap 1):** AI consent (`dosetrace_ai_extraction_consent_v4`) is per device and survives sign-out, so person B inherits person A's AI consent. Ledger rule: "AI consent before every AI call". OPEN — see §12.
- **Divergence today (07 D-7, SUSPECTED):** entitlement cache keys survive sign-out; a short window on SIGNED_IN can read the previous account's cached Premium before `initPurchases` runs.

### 7.4 Timezone / DST / midnight
- Birth year/month only; no time-of-day logic. 18+ test is **year only** (someone born in December of this year − 18 passes while 17; accepted in spec notes; flagged for counsel, `07 Gap 19`).
- `consent_date` and `onboarded_at` are timestamps; no local-day logic depends on them.

### 7.5 Notification tap
- A notification tap that launched the app while signed out: dropped on sign-out; ignored when older than 12 h; held in `pendingNavRef` until `Main` exists (flows 03, 06).

### 7.6 Fold open / closed
- Paywall, sign-in, onboarding, reset password and every sheet stay **one centred column** on the unfolded Fold (BK-11). Fold/unfold never loses typed text (BK-10). No two-page layout in this flow.

### 7.7 Free vs Premium
- No paywall inside onboarding. Every new account starts Free; Premium is decided after SIGNED_IN by RevenueCat (`initPurchases(uid, email)`), developer e-mail list, or cached entitlement (flow 13).
- The onboarding features list shows "Dose accumulation" (Premium) as an Example hero — never as a promise of the user's data.

### 7.8 Notifications choice
- iOS "Enable notifications" → OS prompt → Create account.
- Android "Enable notifications" → OS prompt → **Make sure your reminders arrive** (items + bar only; no schedule or test; "Continue" reads "Done" when all readable items are OK; "Set up later"). Marks setup seen on this phone (SP-4).
- "Not now" → straight to Create account; the setup step is skipped.
- **Intended (SP-4 / SP-5 spirit):** a user who said "Not now" is not asked again until they actually set a reminder time.
  - **Divergence today (03 G25; 07 §8 row "Not now"):** `requestNotificationPermissions()` runs at every signed-in cold start and on SIGNED_IN while not granted, so the OS prompt appears right after sign-in anyway. OPEN — see §12.
  - **Divergence today (03 G26):** Android shows the setup step even after the user denied the OS dialog.

### 7.9 Email confirmation and links
| Link | Behaviour |
|---|---|
| Confirm link on this phone, signed out | Exchange code → sheet "Email confirmed" / "Your email is verified and you are signed in. Welcome to DoseTrace." |
| Confirm link while signed in | Silently remembered; never switches accounts. |
| Confirm link on another phone | "This link didn't work" + "Your email may already be confirmed. Sign in with your email and password." |
| Reset link, same account or nobody signed in | Reset password screen. |
| Reset link for another account while signed in | Sheet "Reset the password of another account?" naming both; "Sign out and continue" runs an intended sign-out **without force** (blocked if unsynced). |
| Each link | Handled once (memory + `dosetrace_links_handled`, last 20). |

### 7.10 Errors (all DoseTrace sheets, never raw server text — PA-64)
Email already registered; incorrect email or password; email not confirmed (+ Resend); too many attempts; weak password; Apple/Google cancelled (stash restored, nothing written); Apple/Google from Create without the consent box ticked ("You must accept the data & privacy terms…").

## 8. What every surface shows

| State | Onboarding / Auth screen | Today | Settings | Notifications | Data on phone |
|---|---|---|---|---|---|
| First launch | Splash: droplet logo, "Every dose, precisely tracked.", **Get started**, "Already have an account? Sign in", language pill | — | — | none scheduled | nothing |
| Mid-onboarding | Progress bar, Back, one **Continue** dimmed until answered | — | — | none | stash `dt_onboarding_data` |
| About you, year < 1900 or > now − 18 | Note "DoseTrace is for adults: enter a year of birth between 1900 and {max}."; Continue dim | — | — | — | — |
| Never miss a dose | **Enable notifications** / **Not now** | — | — | — | — |
| Android setup step | "Make sure your reminders arrive", intro, bar "N of M ready", rows with Turn on / Adjust / Open, **Continue** or **Done**, **Set up later** | — | — | — | `dosetrace_reminder_setup_seen` |
| Create account | Apple (first), Google, email + password, consent row "I agree to the Terms of service and Privacy policy" (ticked only for a fresh stash with consent) | — | — | — | email in memory only |
| Account created (confirm pending) | "Account created" + "We sent a confirmation link to {email}…", Open email app, Resend link (30 s), Wrong address? Go back | — | — | — | stash cleared if fresh |
| Signed in, incomplete profile | Finish setup: only missing steps + "Finish setup" + corner Sign out | not reachable | not reachable | reminders may still fire from earlier sessions | session + imported DB |
| Signed in, under 18 | "Please confirm your age", year wheel (none preselected), **I'm 18 or older**, Download my data, Delete account, Sign out | not reachable | not reachable | as above | — |
| Main | — | Today (empty state "No protocols yet" + **Add a protocol** for a new user) | Profile card filled from onboarding answers | first schedule after first protocol | full DB |
| Reset password | "Set a new password", New / Confirm password, **Save new password**, **Not now** | — | — | — | pending recovery (SecureStore, ≤ 1 h) |

Theme: every screen above uses theme tokens; only the Apple and Google buttons are store-owned surfaces (Apple HIG / Google branding, decision 2026-10-02). Both themes must be checked (Gate A).

## 9. Data written at each step

| Step | Store | Fields | Synced | Survives intended sign-out |
|---|---|---|---|---|
| Language pill | AsyncStorage `dosetrace_language` | code | no | yes (device pref) |
| Each Continue | AsyncStorage `dt_onboarding_data` | goals, tracking_types, display_name, birth_month, birth_year, gender, country, activity_level (5-level), has_provider, consent_accepted/date | no | no (wiped) |
| Before we begin | memory | `fresh = true` | — | — |
| Enable notifications (Android) | AsyncStorage | `dosetrace_reminder_setup_seen = '1'` | no | yes (per phone) |
| Hand-off to Auth | AsyncStorage | `dt_seen_onboarding = '1'` | no | no |
| Create account | Supabase Auth `user_metadata` | all stash fields + `consent_accepted:true`, `consent_date`, `onboarded_at`, `activity_scale:5` | server | yes |
| Apple iOS first sign-in | `user_metadata.display_name` | Apple-provided name (if returned) | server | yes |
| SIGNED_IN | SecureStore | session tokens (chunked) | — | removed |
| SIGNED_IN | `user_metadata` | fresh stash → only missing fields | server | yes |
| SIGNED_IN | AsyncStorage `dosetrace_entitlement_v1:<uid>` | Premium cache with expiry | no | **yes (07 D-7)** |
| SIGNED_IN | Supabase `push_tokens` | expo_token, platform, timezone | server | removed on intended sign-out |
| Finish setup | `user_metadata` | shown steps only, consent if never recorded | server | yes |
| 18+ confirm | `user_metadata` | `adult_confirmed_at`, `birth_year` (one merge write) | server | yes |
| Reset password | Supabase Auth | password; pending recovery discarded | server | — |

Never written: the password anywhere on the phone; the typed email to storage (memory `authDraft` only).

## 10. Rules (with sources)

1. Steps exactly `splash, features, goal, tracking, about, routine, consent, reminders`; no "You're all set" (decision 2026-09-29; `lib/onboardingSteps.js:12`).
2. Continue only when the step is answered (R2, `lib/onboardingSteps.js:44-55`).
3. Birth year 4 digits, 1900…this year − 18 (decision 2026-09-15).
4. Stash: only filled keys; fresh only after "Before we begin" in this run; a non-fresh stash is never written to any account (decision 2026-10-03, PA-71…73).
5. Onboarding answers fill ONLY missing fields, never overwrite a stored value (decision 2026-10-03).
6. Create account always shows the consent row with Terms + Privacy; Apple/Google from Create need it ticked (PA-80).
7. Duplicate sign-up detected by `identities.length === 0` → "Email already registered".
8. Every auth message is a DoseTrace sheet; raw server text never shown (PA-64).
9. Store buttons per Apple HIG / Google branding (decision 2026-10-02).
10. Profile gate: 8 required fields (name, birth month + year, sex male/female, country, goal, activity, tracking, provider); PROFILE_GATE_SINCE 2020-01-01 — "I need the data" (decision 2026-09-09, do not re-litigate).
11. 18+ confirmation asks the real birth year; export and delete stay available (decisions 2026-10-03).
12. `onAuthStateChange` stays synchronous (CLAUDE.md).
13. Google always shows the account chooser; Apple on Android only when the server probe passes; "Continue with Apple" on Android is a founder decision (2026-10-03).
14. Password trimmed on sign-up, sign-in and reset alike (PA-86).

## 11. Divergences today (summary)

| ID | Intended | Today | Source |
|---|---|---|---|
| D01-1 | Gates answerable offline + "Sign out anyway" | Error sheet, no force | decision 2026-10-04; `07 Gap 6` (A-94) |
| D01-2 | Offline cold start keeps a stored session | May route to Auth | `07 D-16` (SUSPECTED) |
| D01-3 | AI consent belongs to the person who gave it | Device-wide, survives sign-out | `07 D-18`, `08 Gap 1` |
| D01-4 | "Not now" respected | OS prompt at first signed-in start | `03 G25`, `07 §8` |
| D01-5 | Android setup step only after the permission was granted (SP-4 "answered") | Shown after a denial too | `03 G26` |
| D01-6 | Google / Apple-on-Android display name used to prefill "About you" | Never read; the `about` step always shows if the stash was not fresh; Apple iOS may overwrite an existing name | `07 D-20` |
| D01-7 | Settings and onboarding validate the same profile rules | Gate checks presence only (a bad stored year or 4-level activity passes) | `07 D-11` |
| D01-8 | Android Apple sign-in live (founder 2026-10-03) | Server setup pending; button hidden by probe | `07 Gap 13`; premium-and-auth.md:104 |
| D01-9 | Onboarding analytics funnel complete | `onboarding_completed` dropped for email sign-ups that need confirmation (no user yet) | `07 Gap 18` |
| D01-10 | Restart after typing answers then "Sign in" lands on Sign in | Lands back on onboarding (stash has answers) | `07 D-14` (by design today — confirm) |

## 12. Open founder questions (real preferences only)

1. **AI consent scope** (`07 D-18`): per device (today) or per account (asked again for each person who signs in; proof stored on the server, A-95)? Recommendation: per account — the consent sends health text to Anthropic and the ledger requires it "before every AI call".
2. **Notification prompt after "Not now"** (`03 G25`): keep the OS prompt at first sign-in, or ask only when the first protocol with a reminder time is saved? Recommendation: ask when the first timed protocol is saved (the moment a reminder means something).
3. **Year-only 18+ test** — keep (spec note) or ask the month too? Counsel item with the GDPR Art. 9 flag.

## 13. Acceptance checks (agent-device QA script)

Conventions for every check: fresh install unless stated; screenshot before every tap; run each check in **light and dark** (Settings → Preferences → Appearance) and read every sheet in both; Portuguese run = choose **PT** on the splash language pill (or Settings → Preferências → Idioma → PT). Never use the founder's main account; email checks use a `+qa` alias of the test account (decisions: "Run test steps yourself").

**F01-01 — Splash and language**
- Do: launch fresh install.
- Expect EN: "Every dose, precisely tracked.", button **Get started**, link "Already have an account? Sign in".
- Expect PT (tap language pill → PT): "Cada dose, com precisão.", **Começar**, "Já tem uma conta? Entrar".

**F01-02 — Continue stays dim until answered**
- Do: Get started → Continue on Features → on Goals tap nothing.
- Expect: Continue dimmed; title "What are your goals?" / PT "Quais são os seus objetivos?". Tap one goal → Continue enabled.

**F01-03 — Tracking step**
- Expect title "What are you using?" / PT "O que você está usando?"; options Peptides / Hormones / GLP-1 / Oral supplements (PT Peptídeos / Hormônios / GLP-1 / Suplementos orais).

**F01-04 — Adults-only year**
- Do: About you → type birth year = current year − 17.
- Expect: note "DoseTrace is for adults: enter a year of birth between 1900 and {current − 18}." / PT "O DoseTrace é para adultos: informe um ano de nascimento entre 1900 e {…}."; Continue dim. Type a valid year + name + month + sex + country → Continue enabled.

**F01-05 — Your routine**
- Expect title "Your routine" / "Sua rotina"; 5 activity levels ("Desk job, little or no exercise" … "Very high — physical job + daily training" / PT "Trabalho sentado, pouco ou nenhum exercício" … "Muito alto — trabalho físico + treino diário"); provider "Do you work with a healthcare provider?" / "Você é acompanhado por um profissional de saúde?" Yes/No.

**F01-06 — Before we begin needs all 4 ticks**
- Expect title "Before we begin" / "Antes de começar"; 4 rows: "Not a medical device", "Estimates, not advice", "AI only when you use it", "Your privacy" (PT "Não é um dispositivo médico", "Estimativas, não aconselhamento", "IA só quando você usa", "Sua privacidade"). Continue enabled only with all 4 ticked. The AI row names Anthropic and the AI food log.

**F01-07 — Kill mid-onboarding keeps answers**
- Do: fill through Your routine, kill the app, relaunch.
- Expect: onboarding (not Auth); step 0; walking forward shows every answer prefilled. When profile + consent were complete before the kill: opens on "Before we begin" with all 4 boxes **empty**.

**F01-08 — iOS: Enable notifications**
- Do: Never miss a dose ("Nunca perca uma dose") → **Enable notifications** ("Ativar notificações").
- Expect: iOS permission prompt; after answering → Create account screen. No setup step on iPhone.

**F01-09 — Android: setup step after Enable**
- Do (Android): Enable notifications → allow.
- Expect: "Make sure your reminders arrive" / "Garanta que seus lembretes cheguem"; bar "N of M ready" / "N de M prontos"; rows Notifications, Alarms & reminders, Battery, Pause app activity if unused (Samsung: "Manage app if unused", plus Deep sleeping apps with **Open** and **I checked**); buttons **Continue** (reads **Done** when all readable rows OK) and **Set up later** / "Configurar depois". No "Next reminder" and no test button.
- Then: tap Alarms & reminders → Turn on → Android screen → enable → Back. Expect the row OK and the bar +1 without reopening.

**F01-10 — Android: Not now skips setup**
- Do: Not now / "Agora não".
- Expect: straight to Create account; later Today opens the setup screen once only after a protocol with a reminder time exists (flow 06, SP-5).

**F01-11 — Create account consent row**
- Expect: Apple button first, Google second (store artwork, both themes), email + password fields with show-password eye, row "I agree to the Terms of service and Privacy policy" / "Concordo com os Termos de uso e a Política de privacidade" — ticked because this run passed Before we begin.
- Untick it → tap Continue with Google → sheet "You must accept the data & privacy terms to create an account." / "Você precisa aceitar os termos de dados e privacidade para criar uma conta."; nothing written.

**F01-12 — Email validation sheets**
- Do: Create account with "abc" → sheet "Please enter a valid email address." / "Digite um e-mail válido."; with 5-char password → "Password must be at least 6 characters." / "A senha deve ter pelo menos 6 caracteres."

**F01-13 — Email sign-up with confirmation**
- Do: valid new `+qa` email, password ≥ 6, Create account.
- Expect: "Account created" / "Conta criada"; "We sent a confirmation link to {email}…"; buttons "Open email app" / "Abrir app de e-mail", "Resend link" / "Reenviar link" (disabled 30 s after tap; then "Confirmation link sent again"), "Wrong address? Go back" / "Endereço errado? Voltar".
- Data: Supabase user exists with `user_metadata` = onboarding answers (check via the admin tooling, read-only).

**F01-14 — Confirm link on this phone**
- Do: open the confirmation email link on the same phone.
- Expect: sheet "Email confirmed" / "E-mail confirmado" + "Your email is verified and you are signed in. Welcome to DoseTrace."; lands on Today empty state "No protocols yet" / "Nenhum protocolo ainda" + **Add a protocol** / "Adicionar protocolo".

**F01-15 — Existing email**
- Do: Create account with an existing email.
- Expect: "Email already registered" / "E-mail já cadastrado" + the "Sign in with your password, or with Apple or Google…" body; password field cleared.

**F01-16 — Sign in, unconfirmed**
- Do: sign in with the unconfirmed account.
- Expect: "Please confirm your email address before signing in — check your inbox…" / "Confirme seu e-mail antes de entrar…" with Resend.

**F01-17 — Wrong password**
- Expect: "Incorrect email or password." / "E-mail ou senha incorretos." (DoseTrace sheet, no native alert).

**F01-18 — Forgot password**
- Do: Sign in → type email → "Forgot password?" / "Esqueceu a senha?".
- Expect: "Reset link sent" / "Link enviado" + "If an account exists for {email}, we sent it a password reset link…". Open the link on this phone → "Set a new password" / "Crie uma nova senha"; save → "Password updated" / "Senha atualizada" + "You're signed in with your new password." / "Você entrou com sua nova senha."
- Kill on the Reset screen and relaunch within 1 h → the Reset screen returns. Tap **Not now** → leaves without changing anything.

**F01-19 — Reset link for another account**
- Setup: signed in as Test03; open a reset link for the `+qa` account.
- Expect: "Reset the password of another account?" / "Redefinir a senha de outra conta?" naming both addresses; "Sign out and continue" / "Sair e continuar"; with unsynced rows (airplane mode + a dose logged) → not signed out, sheet "Some changes on this phone aren't backed up yet, so DoseTrace didn't sign you out…".

**F01-20 — Finish setup shows only missing steps**
- Setup: test account with `country` removed (admin, test account only).
- Expect after sign-in: Finish setup with only "About you" (prefilled except country) and the finish step "Finish setup" / "Concluir configuração" + "Save your details and start tracking."; corner **Sign out**. Saving → Today.
- Intended offline (D01-1): in airplane mode Finish setup saves locally and enters Main; reconnect → the field appears in Settings → Edit profile. **Today this fails** — record it as the divergence.

**F01-21 — 18+ confirmation**
- Setup: test account with birth_year = current year − 16, no `adult_confirmed_at`.
- Expect: "Please confirm your age" / "Confirme sua idade"; body names the stored year; year wheel with nothing chosen; **I'm 18 or older** / "Tenho 18 anos ou mais" disabled until a year is picked; "Download my data", "Delete account", "Sign out" present. Confirm with a valid year → Today; Settings → Edit profile shows the new year.

**F01-22 — Shared device: stale stash is never written**
- Do: fresh install; fill onboarding to "Before we begin" without ticking; kill; relaunch; tap "Already have an account? Sign in"; sign in as Test03.
- Expect: Test03's profile unchanged (name/country not replaced by the typed ones); stash cleared.

**F01-23 — Sign in imports the account**
- Do: fresh install → splash → "Already have an account? Sign in" → Test03.
- Expect: Today shows Test03's protocols within the first sync; My Protocols list complete; no onboarding steps shown.

**F01-24 — Fold: one centred column**
- Do (unfolded Fold): run F01-01…F01-13.
- Expect: every screen a centred column; fold/unfold mid-step keeps typed name and selection; no right page.

**F01-25 — Both themes on every sheet**
- For each sheet raised in F01-11…F01-21: text readable in light and dark (no white-on-white); Apple button black-on-white in light / white-on-black in dark per HIG.
