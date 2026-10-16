# Admin panel (web) — spec and checklist

checklist-signed: pending (founder brief "ADMIN PANEL SESSION — full redo", 2026-09-27; rows below await founder proof)

**Founder decision 2026-09-27 19:53 ET (Panel #001, relayed from the app session):** the extras beyond header-only auth (UTC time windows, metric definitions and the Data sources section, versioned SQL) are **approved as part of Panel #001**. There is still no push or deploy until the founder rotates ADMIN_TOKEN in Vercel. Push and deploy then go together, followed by the live test.

## Scope

- **In scope:** the web admin panel only.
  - `web/adm.html`: the page.
  - `api/adm.js`: the Vercel function behind `/api/adm`.
  - `supabase_admin_rpcs.sql`: the panel's SQL, versioned.
  - This spec.
- **View-only.** Nothing on the panel writes data.
- **Out of scope until the founder specs them:** login/password, and granting or revoking Premium.
- **Never touched from this work:** the mobile app (`screens/`, `lib/`, `components/`, `i18n/`, `app.json`) and `docs/review/features.md`.

## Status legend

- `[ ]` not started
- `[~]` code done, not verified
- `[x]` verified with evidence (the evidence is written on the row)

The metric rows (O1–S7) have an extra state: **not yet proven**. The founder proves each number against the source dashboard and records the date.

## Phase checklist

### Phase 1 — this redo (branch `feature/admin-panel`, not pushed)

- [x] **1.1 Header-only auth.** `api/adm.js` reads the token only from `Authorization: Bearer <token>`. The query fallback is removed.
  - Evidence: `__tests__/adm.test.js`: "adm auth: valid header and no query is served (200)" and the 401 cases, 10/10 on the branch and 5/10 on main (2026-09-28). The earlier scratch mocked-request test with a dummy ADMIN_TOKEN gave 8/8 on the branch and 4/8 on main. The only request fields read are `req.headers.authorization` and `req.url` (the latter only to refuse query tokens). There are no cookie, body or `req.query` reads (note 002).
- [x] **1.2 Query token rejected.** `tokenInQuery(req)` returns a generic 401 `{error:'Unauthorized'}` when `t`, `token`, `admin_token` or `access_token` is in the query string, even with a valid header. The check runs before any data fetch.
  - Evidence: 2026-09-27, the same script on main's `api/adm.js`: 3/7 (the four query-token cases return 200 with 3 data fetches). On the branch: 7/7, with 0 data fetches on every 401 and a body of exactly `{"error":"Unauthorized"}` (notes 002 and 003).
- [x] **1.3 No logging.** `api/adm.js` has no `console.*` calls and never echoes the token.
  - Evidence: 2026-09-27: `grep -c console. api/adm.js` = 0; the console spy counted 0 calls across 8 requests; the token appeared in 0 responses (note 002).
- [x] **1.4 Page token source.** `web/adm.html` never reads the token from `location.search` or `location.hash`.
  - It reads from sessionStorage `dt_adm_token`, or prompts once.
  - It sends the token only in the Authorization header.
  - It removes the token on a 401.
  - It keeps `history.replaceState` so old `?t=` links are stripped.
  - Evidence: 2026-09-27 headless render, no stored token, URL `?t=URLTOKEN#t=HASHTOKEN`. Main sent `Bearer HASHTOKEN`. The branch made 0 requests, prompted once, and showed the need-token message. In both, the URL was stripped to the path. With a stored token and a 401 answer, main kept the token and the branch removed it (note 002).
- [x] **1.5 Token wording.** `need_link` and `err_unauth` now say "admin token… reload to enter it" in all 6 languages.
  - Evidence: 2026-09-27, all 6 strings printed from the parsed T object; parity 193 keys × 6 (note 001).
- [x] **1.6 Active-user windows.** DAU, WAU and MAU count 1, 7 and 30 UTC days including today, using `utcDay(days-1)`. `presets()` anchors on the UTC day.
  - Evidence: 2026-09-27, headless render with the same mock (one user each at 0/1/6/7/29/30 UTC days back): main shows DAU 2 · WAU 4 · MAU 6, the branch shows DAU 1 · WAU 3 · MAU 5 (note 001).
- [x] **1.7 Metric registry.** The DEFS registry in `web/adm.html` has 38 entries, each `{id,name,src,def,range,proven:null}`. There is a "Source · range" button under every KPI and chart title, and it opens the glossary modal.
  - Evidence: 2026-09-27 headless render: 35 buttons cover all 38 IDs; modal opens for single and multi-ID buttons in both themes (note 001).
- [x] **1.8 Data sources section.** A "Data sources" nav item and section show the rules list and the table (ID, Metric, Source, Definition, Range, Proven).
  - New labels are in 6 languages.
  - Colors come from CSS tokens only.
  - Checked in light and dark themes, at desktop and 390 px.
  - Below 640 px the table stacks, with no horizontal page scroll.
  - Evidence: 2026-09-27: 38 table rows; desktop and 390 px (iframe) screenshots in light and dark; at 390 px the cells are display:block with the thead hidden, and document scrollWidth = 390 in both themes; the added lines contain no raw hex, white/black or rgba (note 001).
- [x] **1.9 SQL versioned.** `supabase_admin_rpcs.sql` holds the three live RPC bodies verbatim, plus the lockdown statements. It has **not** been applied.
  - Evidence: 2026-09-27, md5 of each body in the file equals md5(pg_get_functiondef) live: admin_activity 9047220d…, admin_feature_adoption e1c17ccd…, admin_metrics 2d629c38… (note 001).

### Phase 2 — needs the founder's go

- [ ] **2.1 Push + deploy together**, only after the founder rotates ADMIN_TOKEN in Vercel (founder decision 2026-09-27 19:53 ET). A push triggers a Vercel preview deploy.
- [x] **2.2 Apply the A-1 lockdown** (`supabase_admin_rpcs.sql`), then re-read `proacl`.
  - Evidence: applied 2026-09-27 23:42 UTC on founder go (Panel #002), with only the six REVOKE/GRANT statements run. After: `proacl` = `{postgres=X/postgres,service_role=X/postgres}` for all three, and the body md5s are unchanged. `has_function_privilege`: anon/authenticated false, service_role true. Live `POST /rest/v1/rpc/admin_*` with the anon key → HTTP 401, code 42501, for all three. As service_role (SQL role switch; the service key isn't on this machine): all three return data, 1 row.
- [ ] **2.3 Post-deploy live test** (curl checks below) on the live URL: token in the URL → 401, header only → 200.
- [ ] **2.4 Merge to main:** rebase on the latest main, full suite green, founder go.

### Phase 2b — Management view

- [x] Spec "Phase 2 — Management view" (section below) reviewed and approved by the founder.
  - Evidence: founder approval 2026-09-28 17:50 ET (Panel #006) of commit 910e4ef, with 3 fixes applied in the next commit: the platform rule, the MV audit source for `last_sign_in_at`, and the note 008 correction.
  - Still no panel code until the founder's go.
- [~] **Phase 2 first-phase build (Panel #007, founder go 2026-09-28 18:02 ET).** Code done; not verified live.
  - **In scope:** MV-0, H1–H4, W1–W5, X2–X6, G1–G2, the Details tab, MV-5 and MV-7.
  - **Shown as "not measured" with the reason:** W0, X1, W6 and G3.
  - **Tests:** `__tests__/admManagement.test.js` (21 tests, red → green).
  - **SQL:** in `supabase_admin_rpcs.sql`, section "Phase 2 — Management view": `admin_test_accounts`, `admin_is_test`, `admin_accounts`, `admin_match_ids`. **Not applied** (stop point 1).
  - **Every H/W/X/G row stays "not yet proven"** until the founder checks it.
  - **Deviation for founder acceptance:** S1, S2 and S6 stay visible in Details, flagged "different window", instead of disappearing until W0/X1 are measurable.

### Phase 3 — not specced yet (founder specs first)

- [ ] 3.1 Login/password for the panel.
- [ ] 3.2 Grant or revoke Premium from the panel.

## Auth

- **Header-only.** The only accepted credential is `Authorization: Bearer <ADMIN_TOKEN>`.
- **Refusals.** A token-like query parameter (`t`, `token`, `admin_token`, `access_token`) is refused with 401 even when the header is valid. Cookies and the body are never read.
- **Fail closed.** No `ADMIN_TOKEN` set → 503.
- **ADMIN_TOKEN rotation.** The redo brief (2026-09-27) reported a rotation that day. The founder decision of 2026-09-27 19:53 ET makes the push wait until the founder rotates ADMIN_TOKEN in Vercel, so the rotation is treated as **pending, done by the founder right before the push**. It is **not verified**: this session has no Vercel access. The value is never written anywhere in the repo.
- **Post-deploy checks.** Run by the founder after the push. `$ADMIN_TOKEN` comes from the password manager and is never pasted into chat.
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" "https://dosetrace.io/api/adm?t=x"
  curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" "https://dosetrace.io/api/adm?t=x"
  curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" "https://dosetrace.io/api/adm"
  ```
  Expected results, in order: `401`, `401`, `200`.

## Panel rules (shown on the panel's Data sources section)

1. **Supabase days are UTC.** Every Supabase date is a UTC calendar day (the DB timezone is UTC, verified 2026-09-27).
2. **Test accounts are included.** Counts include test accounts (for example the founder's test and review accounts). Nothing is excluded yet (O-3).
3. **"Active" is a floor.** "Active" means any tracked analytics event. There is no app-open event, so a user who only opens the app is not counted (A-6, O-1).
4. **Data windows.** Compare charts and tables only have the last 180 days loaded; older periods show 0. Product lists (compounds, searches, types) and Audience load all-time rows and filter them by the first Compare period.
   - **Deviation from the brief.** The brief's wording was "Compare/Product/Audience only have the last 180 days loaded". The live RPCs show that is only true for Compare: `searches`, `protocols_created_events` and `users_dim` have no date limit. The panel states the accurate rule. The founder must accept this wording, or ask for Product/Audience to be capped at 180 days.

## Metrics

There are 38 rows. Every row is **not yet proven**.
- **Where the definitions come from:** the live function bodies of `admin_metrics`, `admin_activity` and `admin_feature_adoption` (read-only `pg_get_functiondef`, 2026-09-27), plus `api/adm.js` for the stores.
- **Supabase sources:** Supabase data is the `admin_*` RPCs, called with the service role.
- **Counting:** all counts are rows or distinct users.

### Overview (O)

| ID | Metric | Source | Definition | Range | Proven |
|---|---|---|---|---|---|
| O1 | Total users | Supabase `auth.users` | `count(*)` of auth.users: every account, including test and unconfirmed accounts | all time | not yet proven |
| O2 | Signups today ("+N today") | Supabase `profiles` | profiles whose `created_at` falls on the current UTC day (last `kpi_timeseries` row) | current UTC day | not yet proven |
| O3 | New · 7 days | Supabase `profiles` | sum of daily signups (profiles.created_at) over the last 7 `kpi_timeseries` rows | 7 UTC days incl. today | not yet proven |
| O4 | New · 30 days | Supabase `profiles` | same as O3 over the last 30 rows | 30 UTC days incl. today | not yet proven |
| O5 | WAU | Supabase `analytics_events` (`admin_activity`) | distinct users with ≥1 analytics event dated ≥ UTC today − 6 | 7 UTC days incl. today | not yet proven |
| O6 | DAU | Supabase `analytics_events` (`admin_activity`) | distinct users with ≥1 analytics event dated UTC today | current UTC day | not yet proven |
| O7 | MAU | Supabase `analytics_events` (`admin_activity`) | distinct users with ≥1 analytics event dated ≥ UTC today − 29 | 30 UTC days incl. today | not yet proven |
| O8 | Stickiness | derived | O6 ÷ O7: **today's** DAU over MAU. It is not an average of daily DAU; the glossary text says "average" (O-7) | today / 30 UTC days | not yet proven |
| O9 | Profiles complete | Supabase `auth.users` metadata | accounts with display_name, country, primary_goal and activity_level all non-empty, ÷ O1. The app's own "complete" check uses 8 fields (`REQUIRED_PROFILE_FIELDS`), so this is a looser test (O-7) | all time | not yet proven |
| O10 | Signups & active users chart | Supabase `profiles` + `analytics_events` | per UTC day: signups (profiles.created_at) and DAU (distinct users with any event) | last 90 UTC days | not yet proven |
| O11 | Protocols (and "N active") | Supabase `protocols` | `count(*)` of protocols **including tombstoned rows** (deleted_at set, A-2). "Active" = rows with `active = true` | all time | not yet proven |
| O12 | Dose logs | Supabase `dose_logs` | `count(*)` of dose_logs, all outcomes (Taken, Missed, Skipped) | all time | not yet proven |
| O13 | Biomarkers | Supabase `biomarkers` | `count(*)` of biomarker rows | all time | not yet proven |

### Compare (C) — each value is summed over the chosen period

| ID | Metric | Source | Definition | Range | Proven |
|---|---|---|---|---|---|
| C1 | Signups | Supabase `profiles` | profiles by created_at UTC date | chosen period, within the last 180 days | not yet proven |
| C2 | Active users | Supabase `analytics_events` (`admin_activity`) | distinct users with any analytics event in the period | chosen period, within the last 180 days | not yet proven |
| C3 | Doses logged | Supabase `dose_logs` | dose_logs by `logged_at` UTC date, all outcomes | chosen period, within the last 180 days | not yet proven |
| C4 | Protocols created | Supabase `protocols` | protocol rows by created_at UTC date, including tombstoned rows | chosen period, within the last 180 days | not yet proven |
| C5 | AI lab scans | Supabase `analytics_events` | `bloodwork_uploaded` events by UTC date | chosen period, within the last 180 days | not yet proven |

### Engagement (E)

| ID | Metric | Source | Definition | Range | Proven |
|---|---|---|---|---|---|
| E1 | Adherence | Supabase `dose_logs` | rows with outcome `Taken` ÷ all dose_logs rows; the doughnut shows Taken / Missed / Skipped | all time | not yet proven |
| E2 | Activation funnel | Supabase | Five **independent** counts, not a strict sequence: signed up = auth.users; profile complete = O9; created protocol = distinct protocols.user_id (incl. tombstoned); logged dose = distinct dose_logs.user_id; scanned labs = distinct users with `bloodwork_uploaded` | all time | not yet proven |
| E3 | Doses logged · 90 days | Supabase `dose_logs` | dose_logs per `logged_at` UTC day | last 90 UTC days | not yet proven |

### Adoption (F)

| ID | Metric | Source | Definition | Range | Proven |
|---|---|---|---|---|---|
| F1 | Active users · 30 days (of total) | Supabase `admin_feature_adoption` | distinct users with an analytics event where created_at > now() − 30 days (a rolling 30×24 h, not UTC days) over `count(*)` of profiles | rolling 30 days | not yet proven |
| F2 | Feature table (Reach / Users / Uses) | Supabase `admin_feature_adoption` | per event name: Uses = event count, Users = distinct users, Reach = Users ÷ count(profiles) | all time | not yet proven |

### Retention (R)

| ID | Metric | Source | Definition | Range | Proven |
|---|---|---|---|---|---|
| R1 | Weekly cohorts | Supabase `auth.users` + `analytics_events` | Cohort = accounts by signup week (Monday, UTC), for weeks from `date_trunc('week', now()) − 7 weeks`. Cell W*n* = share of the cohort with ≥1 analytics event in week *n* (0–7) | last 8 signup weeks | not yet proven |

### Product (P)

| ID | Metric | Source | Definition | Range | Proven |
|---|---|---|---|---|---|
| P1 | Top compounds created | Supabase `analytics_events` | `protocol_created` events grouped by `properties.compound`. These are events, not protocol rows (A-5) | all-time rows, filtered to the first Compare period | not yet proven |
| P2 | Top searches | Supabase `analytics_events` | `compound_search` events grouped by `properties.query` | all-time rows, filtered to the first Compare period | not yet proven |
| P3 | Protocol type | Supabase `analytics_events` | `protocol_created` events grouped by `properties.type` (recon / rtu) | all-time rows, filtered to the first Compare period | not yet proven |
| P4 | Top biomarkers | Supabase `biomarkers` | biomarker rows grouped by `marker`, top 12 | all time | not yet proven |

### Revenue (V)

| ID | Metric | Source | Definition | Range | Proven |
|---|---|---|---|---|---|
| V1 | RevenueCat overview cards | RevenueCat v2 `/projects/{id}/metrics/overview` | each card is one metric as RevenueCat returns it (its own name, value and description) | as defined per metric by RevenueCat | not yet proven |
| V2 | Plan (Supabase field) | Supabase `profiles.plan` | profiles grouped by `plan`. Every row is `free`, so this chart can never show Premium (A-3, O-5) | all time | not yet proven |

### Audience (U)

| ID | Metric | Source | Definition | Range | Proven |
|---|---|---|---|---|---|
| U1 | Audience (country, goal, activity, gender, age) | Supabase `auth.users` metadata | Counts of `country`, `primary_goal`, `activity_level` and `gender`. Age = current year − `birth_year` (bucketed). Filtered to accounts whose signup date is in the first Compare period | all accounts, filtered to the first Compare period | not yet proven |

### Stores (S)

| ID | Metric | Source | Definition | Range | Proven |
|---|---|---|---|---|---|
| S1 | Apple downloads · 30 days | App Store Connect Sales Reports | For each of the 30 UTC days before today: DAILY SALES SUMMARY. Sum of Units where Product Type Identifier starts with `1` or `F1`. Days without a report are skipped | 30 days ending yesterday (UTC) | not yet proven |
| S2 | Apple updates · 30 days | App Store Connect Sales Reports | same reports; sum of Units where the type starts with `7` | 30 days ending yesterday (UTC) | not yet proven |
| S3 | Apple latest day | App Store Connect Sales Reports | the most recent of those days that has a report, and its downloads | latest report day | not yet proven |
| S4 | Google total installs | Google Play stats bucket | latest `stats/installs` monthly CSV, last row, "Total User Installs" | latest day in the latest monthly file | not yet proven |
| S5 | Google active devices | Google Play stats bucket | same row, "Active Device Installs" | latest day in the latest monthly file | not yet proven |
| S6 | Google installs · month | Google Play stats bucket | sum of "Daily Device Installs" over the latest monthly file | month of the latest file | not yet proven |
| S7 | Google average rating | Google Play stats bucket | latest `stats/ratings` CSV, last row, "Total Average Rating" | cumulative to the latest day | not yet proven |

## Phase 2 — Management view (redesign spec, awaiting founder review)

**Status:** spec only (Panel #005, 2026-09-28). No code yet. Every metric row below starts as **not yet proven**.

This is not the same as the Phase 2 *checklist* above, which covers the push, lockdown and deploy steps.

**Goal:** one trustworthy view for running the business. Every number:
- counts people, not IDs;
- excludes test accounts;
- uses a stated UTC window;
- shows its source, definition and window on the page (panel rule 1.7).

### MV-0 Shared definitions

**New customer (founder decision, 2026-09-28 17:39 ET).**
- Every **real** account created in Supabase `auth.users`, even if the email was never confirmed.
- **Real** means not a test account (below).
- The creation time is `auth.users.created_at` (UTC).

**Test accounts: one list, used by every metric.**
- **Where it lives:** a service-role-only table `public.admin_test_accounts (email text primary key, reason text, added_at timestamptz)`.
- **The domain rule** "any `@dosetrace.io`" lives in one SQL function, `public.admin_is_test(email)`, which checks the table and the domain.
- **Who uses it:** every panel RPC filters with `admin_is_test`. No metric may keep its own list.
- **Seed** (from note 008):
  - the `DEVELOPER_EMAILS` in lib/purchases.js:24–31;
  - `evandro1985@gmail.com`.
- **Guard test (repo):** every entry of `DEVELOPER_EMAILS` must be in the seed, so the app's premium whitelist and the panel's test list can't drift apart.
- **Scope note:** the table is the *metrics* list. `DEVELOPER_EMAILS` stays the app's premium whitelist. Merging the two into one app+panel source is an app change (see MV-8).
- **Founder to decide: are these test accounts?** They are currently counted as real. The emails are listed only in the local note `Admin Panel Files/009-redesign-spec.md`; user emails are never committed.
  - **Candidate 1:** a gmail address containing "testreviewer". Email sign-up, created 2026-09-12, never confirmed, onboarded, no events. Looks like a store reviewer.
  - **Candidate 2:** an address at `cloudtestlabaccounts.com`. Google sign-in, created 2026-09-21, no events. The domain belongs to Google Play pre-launch report robots (Firebase Test Lab). Suggest adding the whole domain to the rule.
  - **Candidate 3:** one account on a company domain (named in note 009). Created in the window, not onboarded.

**Windows.**
- "N days" means the **last N full UTC days**, ending at 00:00 UTC today. Today's partial day is excluded.
- "Previous period" means the N full UTC days before that.
- Weeks are ISO weeks (Monday 00:00 UTC).

**Platform per account (inferred; never guessed).**
1. `raw_app_meta_data->>'provider' = 'apple'` → **iOS, always.** Sign in with Apple is blocked off iOS (lib/supabase.js:275–276), so it overrides every other signal.
2. For every other account, collect **all** of these signals:
   - `analytics_events.properties.platform` (lib/analytics.js:29);
   - `push_tokens.platform`;
   - `auth.sessions.user_agent`: `okhttp/…` → Android; `DoseTrace/… CFNetwork … Darwin` → iOS.
3. The result:
   - all collected signals agree → that platform;
   - they disagree → **unknown (mixed)**;
   - none exist → **unknown**.
   - No signal outranks another.

Unknown (mixed) and unknown (no signal) are always shown as their own number, never shared out between the platforms. Note 008 found 16 of 69 unknown.

**Correction to note 008 about `last_sign_in_at`.**
- It updates only on a new sign-in, not on a session refresh. So it can't mean "left the app".
- Note 008's "46 signed in once, within 5 min, then never again" only means *no new sign-in after the first 5 minutes*. It does not mean they left.
- No metric may use `last_sign_in_at` for churn or activity. It may be used only as "has signed in at least once" (not null).

### MV-1 Headline cards

| ID | Metric | Source | Definition | Window (UTC) | How it is proven | Proven |
|---|---|---|---|---|---|---|
| H1 | New customers · 7 days | Supabase `auth.users` + `admin_is_test` | count of real accounts created in the window, plus the change vs the previous 7 days (absolute and %) | last 7 full days vs the 7 before | the same SQL run by hand in Supabase; the founder spot-checks against the Supabase Auth list | not yet proven |
| H2 | New customers · 30 days | same | same, 30 days | last 30 vs previous 30 | same | not yet proven |
| H3 | New customers · 90 days | same | same, 90 days | last 90 vs previous 90 | same | not yet proven |
| H4 | Platform split (on H1–H3) | Supabase (MV-0 platform rule) | the H1–H3 count split into iOS / Android / unknown; the three always add up to the total | same as the card | per-platform SQL; sum check iOS + Android + unknown = total | not yet proven |

### MV-1b Activation card (Panel #009, view-only)

| ID | Metric | Source | Definition | Window (UTC) | How it is proven | Proven |
|---|---|---|---|---|---|---|
| A1 | Activation rate | Supabase `auth.users` (registration) + `dose_logs` (doses), via `admin_accounts` | real accounts registered in the window with ≥1 `dose_logs` row of any date ÷ real accounts registered in the window, × 100, one decimal. Test accounts excluded on both sides by `admin_is_test`. No first-dose marker exists in `dose_logs` (`dose_number` belongs to `vaccines`), so any row counts | registration day between today and 30 days ago, inclusive (31 UTC calendar days); doses with no date limit | SQL by hand over the same window; test "A1 activation…" in `__tests__/admManagement.test.js` | not yet proven |

- The card shows, top to bottom: the rate, the definition, the window, the source (with "test accounts excluded"), and a "how we calculate it" link that opens the A1 definition.
- **Limitation:** the card depends on `admin_accounts` (Phase 2 SQL). Until that is applied it shows "unavailable". The test marker exists in the codebase (`admin_test_accounts` + `admin_is_test` in `supabase_admin_rpcs.sql`) but not yet in the live database.

### MV-2 Funnel (one cohort, one window)

**Cohort:** the real accounts created in the chosen window (7, 30 or 90 days). Every step counts accounts **from that cohort** that reached the step at any time up to page load. Late conversions are counted, and the page says so.
- **Default window:** 30 days.
- **Split:** iOS / Android / unknown, with the same platform rule as MV-0.

| ID | Step | Source | Definition | Window (UTC) | How it is proven | Proven |
|---|---|---|---|---|---|---|
| W0 | Store downloads | ASC Sales Reports / Google Play stats | Apple: first-time units (product type 1*/F1), redownloads (3*) shown separately. Google: sum of "Daily User Installs" (and device installs) from the daily CSV rows. **Shown as its own bar, not as a funnel base, and never divided into the account steps** (different entities) | the same full UTC days as the cohort window | ASC Trends / Play Console → Statistics for the same dates | **not measured** until MV-6 is unblocked |
| W1 | Accounts created | Supabase `auth.users` | the cohort (= H2 when the window is 30 days) | window | = H card for the same window | not yet proven |
| W2 | Email confirmed or signed in | Supabase `auth.users` | `email_confirmed_at is not null OR last_sign_in_at is not null` (OAuth accounts are confirmed at creation) | cohort; status at page load | SQL | not yet proven |
| W3 | Onboarded | Supabase `raw_user_meta_data.onboarded_at` | the `onboarded_at` key is present. Email sign-up writes it at sign-up (screens/AuthScreen.js:144); OAuth writes it when onboarding finishes (screens/OnboardingFlowScreen.js:259, lib/onboardingStore.js:100) | cohort; status at page load | SQL | not yet proven |
| W4 | ≥1 protocol | Supabase `protocols` | the account has ever had ≥1 protocol row, deleted ones included; the live count is shown next to it | cohort; any time | SQL | not yet proven |
| W5 | ≥1 dose logged | Supabase `dose_logs` | ≥1 dose_logs row of any outcome. Flag: backfilled "history before registration" rows (A-30) count until A-30 lands | cohort; any time | SQL | not yet proven |
| W6 | Premium | RevenueCat (app_user_id = Supabase id) | the account has had entitlement `DoseTrace Pro` (lib/purchases.js:19) from a **store purchase**. Promotional grants (`rc_promo_*`) are counted separately, and never as conversion | cohort; any time | RC dashboard customer page for each counted id | not yet proven (needs the RC data path, MV-3) |

**Rules:**
- Step-to-step % is shown only between W1 and W6.
- No step uses `last_sign_in_at` except W2's "ever signed in".

### MV-3 Reconciliation panel (same window for every column)

| ID | Row | Source | Definition | Window (UTC) | How it is proven | Proven |
|---|---|---|---|---|---|---|
| X1 | Store downloads (Apple / Google) | ASC / Play | as W0 | window | as W0 | **not measured** |
| X2 | Supabase accounts: all / test / real | Supabase | all `auth.users` created in the window; test = `admin_is_test`; real = the rest | window | SQL | not yet proven |
| X3 | **RevenueCat IDs** (never labelled "customers"): total first seen | RevenueCat v2 customers list | RC customers with `first_seen_at` in the window | window | the RC dashboard filter `firstSeenAt afterOrOn … before …` (note 008) | not yet proven |
| X4 | … of which anonymous | RevenueCat | app_user_id starts with `$RCAnonymousID`. **Cause:** `Purchases.logOut()` on sign-out (lib/purchases.js:114, App.js:536) | window | RC filter `customerId contains RCAnonymousID` | not yet proven |
| X5 | … identified and matching a Supabase account (real / test) | RevenueCat × Supabase | app_user_id equals an `auth.users.id` (exact, full id) | window | exact join; must equal X2 real + test minus accounts that never signed in | not yet proven |
| X6 | … identified with no Supabase account (orphans) | RevenueCat × Supabase | app_user_id is not anonymous and matches no `auth.users.id`. **Named cause:** account deleted. `delete-user` removes the auth user but not the RC customer (supabase/functions/delete-user/index.ts:165). Shown as "likely deleted accounts" until MV-8 D2 lands | window | exact join | not yet proven |

**Rules:**
- X3 = X4 + X5 + X6 must hold. The page shows ✓, or the difference.
- Each gap row names its cause:
  - test accounts;
  - accounts that never signed in (they never reach RC);
  - anonymous IDs;
  - orphans;
  - window differences (stores).
- RC "New Customers" and "Active Customers" appear only here, relabelled **"RevenueCat IDs"**.
- **Data path (to confirm before build):** RevenueCat's v2 API list-customers endpoint with first-seen time, paged, called from `api/adm.js` with the existing `REVENUECAT_API_KEY`. Its exact fields must be verified against the API docs and one real response before any code is written. The dashboard numbers in note 008 are the baseline to match.

### MV-4 Charts (each answers one stated question)

| ID | Chart | Question it answers (shown as the subtitle) | Source | Definition | Window (UTC) | How it is proven | Proven |
|---|---|---|---|---|---|---|---|
| G1 | New customers per day, stacked by platform | "Is acquisition growing, and on which platform?" | Supabase | the daily count of H-definition accounts, stacked iOS / Android / unknown | last 90 full days | daily sums add up to H3 | not yet proven |
| G2 | Weekly signup cohorts, retention | "Do new customers keep using the app week after week?" | Supabase `auth.users` + `analytics_events` | cohort = real accounts by signup ISO week; cell W*n* = share with ≥1 analytics event in week *n*. **Marked as a floor** until an app-open event exists (A-6, MV-8 D3) | last 8 signup weeks | SQL per cohort cell | not yet proven |
| G3 | Premium conversion by signup week | "What share of each signup week becomes paid Premium, and how fast?" | Supabase + RevenueCat | for each signup week, the share of the cohort reaching W6 (store purchase) by week 0/1/2/4 | last 12 signup weeks | RC customer pages for the converted ids | not yet proven |

**Details tab (secondary, collapsed by default).** It holds everything without a stated management question: the feature adoption table, audience, searches and top compounds, protocol types, top biomarkers, adherence, the WAU/DAU/MAU floors, the compare tool, and raw totals.
- **Removed outright:** the V2 Plan chart, which can never show Premium (A-3).

### MV-5 Every number shows source, definition and window

- Every H, W, X and G row gets a DEFS entry `{id,name,src,def,range,proven:null}`, plus a "Source · range" button (the existing panel rule).
- The Data sources table lists them.
- The panel rules list gains:
  - "Test accounts are excluded (one list: admin_test_accounts)."
  - "RevenueCat IDs are not customers."
  - This replaces the rule "Counts include test accounts".

### MV-6 Store rows: how they plug in

**Apple** (needs the founder-provided `ASC_VENDOR_NUMBER`):
- For each full UTC day in the window: `GET /v1/salesReports?filter[frequency]=DAILY&filter[reportType]=SALES&filter[reportSubType]=SUMMARY&filter[version]=1_0&filter[vendorNumber]=…&filter[reportDate]=YYYY-MM-DD`.
- Sum the Units by Product Type Identifier: 1*/F1* = downloads, 3* = redownloads, 7* = updates (these last are not shown in the funnel).
- **Missing days are shown as "no report"**, not skipped silently. Apple reports lag about 1 day, so the latest day may be "pending".

**Google** (needs `GOOGLE_PLAY_BUCKET` and read access for the service account, or a Play Console session as dosetrace.io@gmail.com):
- Read every monthly `stats/installs/installs_<pkg>_YYYYMM_overview.csv` that overlaps the window.
- Sum "Daily User Installs" (and "Daily Device Installs") over the exact window days. This replaces today's "latest monthly file".
- **Lag is shown as the latest available date.**

**Until then:** W0, X1 and G-store show **"not measured — needs vendor number / bucket"**, never an estimate.

### MV-7 Map of the existing metric rows

| Existing | Decision | Reason |
|---|---|---|
| O1 Total users | **change** → "Real customers (all time)", excluding test | test accounts are included today |
| O2 Signups today | **move to Details** ("today so far") | the headline uses full days only |
| O3 / O4 New 7 / 30 days | **change** → H1 / H2 (plus H3 90 days), real only, vs the previous period, split by platform | founder's new-customer definition |
| O5 / O6 / O7 WAU / DAU / MAU | **move to Details** as "activity floors" | no app-open event (A-6); not a management number yet |
| O8 Stickiness | **remove** until D3 | formula mismatch (O-7) and an activity floor |
| O9 Profiles complete | **remove** → replaced by W3 Onboarded | 4 fields vs the app's 8 (O-7); W3 is the real step |
| O10 Signups & active chart | **change** → G1 | per platform, real only |
| O11 Protocols | **move to Details**, excluding deleted rows | raw total, no question (O-4) |
| O12 Dose logs | **move to Details** | raw total |
| O13 Biomarkers | **move to Details** | raw total |
| C1 Compare signups | **change** → covered by H1–H3 vs the previous period | same question, clearer |
| C2–C5 Compare active / doses / protocols / scans | **move to Details** (the compare tool stays there) | no management question |
| E1 Adherence | **move to Details** | product health, not acquisition or revenue |
| E2 Activation funnel | **change** → W1–W6 (one cohort, one window, real only) | today's steps are independent all-time counts |
| E3 Doses · 90 days | **move to Details** | raw activity |
| F1 / F2 Feature adoption | **move to Details** | no stated question |
| R1 Weekly cohorts | **change** → G2 (real only, stated question, floor label) | test accounts included; unlabeled floor |
| P1–P3 Compounds / searches / types | **move to Details** | product insight, no management question |
| P4 Top biomarkers | **move to Details** | same |
| V1 RevenueCat overview | **change**: keep MRR, Revenue and Active subscriptions as money cards; "New / Active Customers" move to X3, relabelled "RevenueCat IDs" | IDs aren't customers (note 008) |
| V2 Plan (Supabase field) | **remove** | always "free"; can never show Premium (A-3) |
| U1 Audience | **move to Details** | no stated question |
| S1 / S2 Apple downloads / updates | **change** → W0 / X1 on the cohort window; redownloads split out; updates Details only | same window as everything else |
| S3 Apple latest day | **move to Details** | freshness indicator only |
| S4 / S5 Google total installs / active devices | **move to Details** | cumulative, not window-based |
| S6 Google installs · month | **change** → W0 / X1 (window sum of daily user installs) | the "latest monthly file" window doesn't match |
| S7 Google rating | **move to Details** | not an acquisition number |

### MV-8 App-side dependencies (not panel work: main app session / founder)

- **D1 Store platform per account.** Write `signup_platform` (ios/android) once, at account creation or first sign-in, e.g. in user_metadata or a profiles column. It turns "unknown" (16 of 69) into facts. Needs a spec in the app registry.
- **D2 Account deletion leaves the RevenueCat customer behind.** `delete-user` (supabase/functions/delete-user/index.ts:165) should also delete the RC customer, or at least write a deletion record (id, created_at, deleted_at, platform) so orphans are provable. Legal/privacy review is relevant (GDPR erasure).
- **D3 App-open event** (O-1 / A-6). Retention and "active" stay floors without it.
- **D4 One test list for app and panel.** Today the app's `DEVELOPER_EMAILS` and the panel's `admin_test_accounts` are separate. A single source would be an app change.
- **D5 Anonymous RC IDs.** `logOut` on sign-out is RevenueCat's recommended behaviour, so the panel labels them rather than changing the app. Any change here is the founder's call.

### MV audit (facts this spec relies on, checked 2026-09-28)

| Claim | File:line / query | Verified |
|---|---|---|
| Sign in with Apple is iOS-only, so provider=apple means iOS | lib/supabase.js:275 | yes |
| Events carry `platform: Platform.OS` | lib/analytics.js:29 | yes |
| Premium entitlement id is `DoseTrace Pro` | lib/purchases.js:19 | yes |
| RC identity = Supabase user id; anonymous only after logOut | lib/purchases.js:62, :114; App.js:536 | yes |
| `onboarded_at` writers | screens/AuthScreen.js:144; screens/OnboardingFlowScreen.js:259; lib/onboardingStore.js:100 | yes |
| delete-user removes the auth user, not the RC customer | supabase/functions/delete-user/index.ts:165 | yes (code read) |
| Test seed = DEVELOPER_EMAILS + evandro1985 + @dosetrace.io | lib/purchases.js:24–31; SQL presence check (note 008) | yes |
| 3 test-candidate accounts exist as described | SQL on auth.users (pattern + domain counts) | yes |
| `last_sign_in_at` only changes on a new sign-in | Panel advisor statement, 28 Sep (not tested here) | **no**. Harmless either way: the spec only uses it as "ever signed in" (not null), never for churn or activity |
| RC v2 list-customers exposes first-seen time | — | **no**: to verify against the API before build (MV-3) |
| Store rows measurable | — | **no**: needs the vendor number and the Play bucket/session (MV-6) |

## Audit table (findings)

The findings were re-verified on 2026-09-27 with read-only aggregate queries: counts only, no personal data.

| Severity | Finding | What was checked | Result 2026-09-27 | State |
|---|---|---|---|---|
| P0 | A-1 | `pg_proc.proacl` of the admin RPCs | `admin_metrics` and `admin_activity`: SECURITY DEFINER, EXECUTE granted to `anon` and `authenticated` (ACL `{postgres, anon, authenticated, service_role}`). `admin_feature_adoption`: `{postgres, service_role}` only. `grep -rn "admin_" lib screens components App.js` → no matches, so the app never calls them | **fixed 2026-09-27 23:42 UTC**: lockdown applied. After: service_role only; anon HTTP call → 401 / 42501 |
| P2 | A-2 | `protocols` rows vs `deleted_at` | 28 rows, 9 tombstoned; 19 with `active`, 0 active-and-tombstoned. O11, C4 and E2 count the tombstoned rows | open (O-4) |
| P2 | A-3 | `profiles.plan` values | 105 of 105 profiles are `free` (1 distinct value). V2 cannot show Premium | open (O-5) |
| P1 | A-4 | DAU/WAU/MAU window | The old code covered 2 / 8 / 31 days in the browser's local time | fixed on this branch (1.6) |
| P2 | A-5 | `protocol_created` events vs `protocols` rows | 77 events vs 28 rows. P1/P3 count events, not rows | open (documented on P1) |
| P2 | A-6 | analytics event names | 13 distinct event names, none is an app-open event. "Active" is a floor | open. Needs a mobile change, owned by the main session (O-1) |
| P3 | A-7 | signups (profiles) vs totals (auth.users) | auth.users 105, profiles 105, 0 users without a profile, 0 profiles without a user, 0 signup-day mismatches | still matches; re-check if the counts diverge |
| P3 | A-8 | RPCs not versioned in git | the three bodies are now in `supabase_admin_rpcs.sql` | fixed on this branch (1.9) |

## Open items

- **O-1** App-open event, so "active" is complete. This is a mobile change for the main session, not for this branch.
- **O-2** ~~Apply the A-1 lockdown~~: done 2026-09-27 23:42 UTC (Phase 2.2). Still to do: confirm the deployed panel loads with the service role after the push (2.3).
- **O-3** Exclude test accounts from the counts. Needs a founder-approved list or flag.
- **O-4** Exclude deleted (tombstoned) protocols from O11, C4 and E2.
- **O-5** Remove the Plans chart (V2), or replace it with RevenueCat entitlement counts.
- **O-6** Translate the metric definitions (DEFS) into es, pt, fr, de and it. The UI labels are already translated.
- **O-7** Glossary accuracy, found during this audit:
  - "Stickiness" is described as average DAU ÷ MAU, but the panel computes today's DAU ÷ MAU.
  - "Profiles complete" uses 4 metadata fields, while the app uses 8.
  - The founder decides the wording or the formula.
- **O-8** This spec uses the brief's `[ ]/[~]/[x]` legend.
  - Main's `scripts/spec-audit.cjs` (not on this branch's base) expects `| ID-n | … | built/partial/missing |` rows.
  - The rows here are shaped so the script ignores them.
  - Align the format at merge time if the founder wants this spec gated by spec-audit.
- **O-9** Pre-existing hardcoded chart colors in `web/adm.html`: `drawOverview`, `drawCmp`, `drawEngagement`, `cc()`, and the retention heat cell. They are not part of this diff; move them to CSS tokens in a later pass.
- **O-10** ~~Permanent repo test for the token fix~~: done 2026-09-28 on founder decision (Panel #001). The file is `__tests__/adm.test.js` (10 tests).
  - Red on main's `api/adm.js`: 5/10. The five URL-token cases fail.
  - Green on the branch: 10/10.
  - Still open: the DAU/WAU/MAU logic lives inside the page script, so it is only proven by the headless render harness (note 001). A repo test needs the function moved into a testable module, which is a founder call.
