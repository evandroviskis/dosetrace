# Admin panel (web) — spec and checklist

checklist-signed: pending (founder brief "ADMIN PANEL SESSION — full redo", 2026-09-27; rows below await founder proof)

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

- [~] **1.1 Header-only auth.** `api/adm.js` reads the token only from `Authorization: Bearer <token>`. The query fallback is removed.
  - Evidence: note 002, mocked test 8/8.
- [~] **1.2 Query token rejected.** `tokenInQuery(req)` returns a generic 401 `{error:'Unauthorized'}` when `t`, `token`, `admin_token` or `access_token` is in the query string, even with a valid header. The check runs before any data fetch.
  - Evidence: notes 002 and 003. Main's `api/adm.js` scores 3/7 (query tokens return 200 with 3 fetches). The branch scores 7/7, with 0 fetches on every 401.
- [~] **1.3 No logging.** `api/adm.js` has no `console.*` calls and never echoes the token.
  - Evidence: grep in note 002.
- [~] **1.4 Page token source.** `web/adm.html` never reads the token from `location.search` or `location.hash`.
  - It reads from sessionStorage `dt_adm_token`, or prompts once.
  - It sends the token only in the Authorization header.
  - It removes the token on a 401.
  - It keeps `history.replaceState` so old `?t=` links are stripped.
  - Evidence: note 002.
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

- [ ] **2.1 Push** `feature/admin-panel` (this triggers a Vercel preview deploy).
- [ ] **2.2 Apply the A-1 lockdown** (`supabase_admin_rpcs.sql`), then re-read `proacl`.
- [ ] **2.3 Post-deploy curl checks** (below) on the live URL.
- [ ] **2.4 Merge to main:** rebase on the latest main, full suite green, founder go.

### Phase 3 — not specced yet (founder specs first)

- [ ] 3.1 Login/password for the panel.
- [ ] 3.2 Grant or revoke Premium from the panel.

## Auth

- **Header-only.** The only accepted credential is `Authorization: Bearer <ADMIN_TOKEN>`.
- **Refusals.** A token-like query parameter (`t`, `token`, `admin_token`, `access_token`) is refused with 401 even when the header is valid. Cookies and the body are never read.
- **Fail closed.** No `ADMIN_TOKEN` set → 503.
- **ADMIN_TOKEN rotation.** Rotated in Vercel on **2026-09-27**. This is founder-reported and **not verified**: this session has no Vercel access. The value is never written anywhere in the repo.
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

## Audit table (findings)

The findings were re-verified on 2026-09-27 with read-only aggregate queries: counts only, no personal data.

| Severity | Finding | What was checked | Result 2026-09-27 | State |
|---|---|---|---|---|
| P0 | A-1 | `pg_proc.proacl` of the admin RPCs | `admin_metrics` and `admin_activity`: SECURITY DEFINER, EXECUTE granted to `anon` and `authenticated` (ACL `{postgres, anon, authenticated, service_role}`). `admin_feature_adoption`: `{postgres, service_role}` only. `grep -rn "admin_" lib screens components App.js` → no matches, so the app never calls them | open. Fix written in `supabase_admin_rpcs.sql`, **not applied** (O-2) |
| P2 | A-2 | `protocols` rows vs `deleted_at` | 28 rows, 9 tombstoned; 19 with `active`, 0 active-and-tombstoned. O11, C4 and E2 count the tombstoned rows | open (O-4) |
| P2 | A-3 | `profiles.plan` values | 105 of 105 profiles are `free` (1 distinct value). V2 cannot show Premium | open (O-5) |
| P1 | A-4 | DAU/WAU/MAU window | The old code covered 2 / 8 / 31 days in the browser's local time | fixed on this branch (1.6) |
| P2 | A-5 | `protocol_created` events vs `protocols` rows | 77 events vs 28 rows. P1/P3 count events, not rows | open (documented on P1) |
| P2 | A-6 | analytics event names | 13 distinct event names, none is an app-open event. "Active" is a floor | open. Needs a mobile change, owned by the main session (O-1) |
| P3 | A-7 | signups (profiles) vs totals (auth.users) | auth.users 105, profiles 105, 0 users without a profile, 0 profiles without a user, 0 signup-day mismatches | still matches; re-check if the counts diverge |
| P3 | A-8 | RPCs not versioned in git | the three bodies are now in `supabase_admin_rpcs.sql` | fixed on this branch (1.9) |

## Open items

- **O-1** App-open event, so "active" is complete. This is a mobile change for the main session, not for this branch.
- **O-2** Apply the A-1 lockdown (`supabase_admin_rpcs.sql`). Needs the founder's go.
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
- **O-10** Permanent repo tests for the token and DAU fixes, under `__tests__/`. Evolution rule 1 wants the test in the repo, but this brief's allowlist excludes `__tests__/`. Today the failing-then-passing proof runs from a scratch script (notes 001 and 003). Needs the founder's OK to add the file.
