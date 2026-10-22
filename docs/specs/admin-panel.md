# Admin panel (web) — spec and checklist

checklist-signed: pending (founder brief "ADMIN PANEL SESSION — full redo", 2026-09-27; rows below await founder proof)

**Founder decision 2026-09-27 19:53 ET (Panel #001, relayed from the app session):** the extras beyond header-only auth (UTC time windows, metric definitions and the Data sources section, versioned SQL) are **approved as part of Panel #001**. There is still no push or deploy until the founder rotates ADMIN_TOKEN in Vercel. Push and deploy then go together, followed by the live test.

## Scope

- **In scope:** the web admin panel only.
  - `web/adm.html`: the page.
  - `api/adm.js`: the Vercel function behind `/api/adm`.
  - `supabase_admin_rpcs.sql`: the panel's SQL, versioned.
  - This spec.
- **Writes:** only what Phase 2d and Phase 3 (signed 2026-10-21) allow, behind the 3.1 login.
- **Login, Premium, Users tab, AI helper:** specified in Phase 3 below.
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

- [x] **2.1 Push + deploy together.** Done twice: 2026-09-28 (1023661, main fast-forward) and **2026-10-16 (branch rebased onto origin/main b05621f, main fast-forwarded to 08b2809; Vercel Production deployment 7130782298 success; live /adm sha = commit sha).**
- [x] **2.2 Apply the A-1 lockdown** (`supabase_admin_rpcs.sql`), then re-read `proacl`.
  - Evidence: applied 2026-09-27 23:42 UTC on founder go (Panel #002), with only the six REVOKE/GRANT statements run. After: `proacl` = `{postgres=X/postgres,service_role=X/postgres}` for all three, and the body md5s are unchanged. `has_function_privilege`: anon/authenticated false, service_role true. Live `POST /rest/v1/rpc/admin_*` with the anon key → HTTP 401, code 42501, for all three. As service_role (SQL role switch; the service key isn't on this machine): all three return data, 1 row.
- [x] **2.3 Post-deploy live test.** 2026-10-16: `?t=x`, `?token=x`, `?admin_token=x`, no token and a wrong header → 401 (curl). Header → 200: **verified by the founder** opening https://dosetrace.io/adm with the token at the prompt (the page sends it only in the Authorization header and rendered). Terminal curls with the pasted token returned 401 — a shell paste artifact, not the server. Still open: what the live Reconciliation rows (X3–X6, RevenueCat key permission) and the Contas tab show; the founder reports it.
- [x] **2.4 Merge to main:** rebased onto origin/main b05621f (no conflicts), suite 511 tests / 506 pass (only `energy.test.ts` fails: it imports a file that is not in git), founder go 2026-10-16, fast-forward only.

### Phase 2b — Management view

- [x] Spec "Phase 2 — Management view" (section below) reviewed and approved by the founder.
  - Evidence: founder approval 2026-09-28 17:50 ET (Panel #006) of commit 910e4ef, with 3 fixes applied in the next commit: the platform rule, the MV audit source for `last_sign_in_at`, and the note 008 correction.
  - Still no panel code until the founder's go.
- [~] **Phase 2 first-phase build (Panel #007, founder go 2026-09-28 18:02 ET).** Code done. **SQL applied 2026-10-16 ~20:55 UTC (Panel #010, founder confirmation 16 Oct; go of 28 Sep 18:46 ET, Panel #008).** Live checks in note 012: ACL service_role only, RLS on, anon → 401/42501 on all three RPCs and the table, seed = 7, `admin_accounts` returns 116 rows. Not yet verified through the deployed panel (no push to main, no deploy).
  - **In scope:** MV-0, H1–H4, W1–W5, X2–X6, G1–G2, the Details tab, MV-5 and MV-7.
  - **Shown as "not measured" with the reason:** W0, X1, W6 and G3.
  - **Tests:** `__tests__/admManagement.test.js` (21 tests, red → green).
  - **SQL:** in `supabase_admin_rpcs.sql`, section "Phase 2 — Management view": `admin_test_accounts`, `admin_is_test`, `admin_accounts`, `admin_match_ids`. **Not applied** (stop point 1).
  - **Every H/W/X/G row stays "not yet proven"** until the founder checks it.
  - **Deviation for founder acceptance:** S1, S2 and S6 stay visible in Details, flagged "different window", instead of disappearing until W0/X1 are measurable.

### Phase 2c — Test accounts never appear (Panel #011, founder decision 2026-10-16)

- [x] **Step 1 candidate list** (note 013). Evidence: read-only SQL 2026-10-16.
- [x] **Step 2 list applied live 2026-10-16:** 4 founder-marked rows + the `@cloudtestlabaccounts.com` domain rule in `admin_is_test`; 11 of 116 accounts are test. Evidence: ACL service_role only, anon → 401/42501, seed count 11, rule check true/true/false (note 013).
- [x] **Step 3 every number excludes test accounts.** Tests first (6 new, red → green). **SQL v2 applied 2026-10-16 (Panel #013, founder GO):** live md5 of the three bodies equals the repo file; ACL service_role only; anon → 401/42501. Rollback file: `Admin Panel Files/013-rollback-functions.sql`. Live before → after: users 116 → 105, protocols 59 → 12 (live only), dose logs 527 → 58, biomarkers 204 → 0, funnel signed_up 116 → 105 (note 013).
- [x] **Panel #013 follow-ups — SQL applied 2026-10-16 in one transaction (Panel #014, founder GO).** Live md5 = repo file for admin_metrics (7b34648d…), admin_accounts (cc94c7ea…), admin_accounts_list (ff0d7c0f…); ACL service_role only; anon → 401/42501 ×3; `admin_accounts_list` returns 105 rows, test_excluded 11 (note 013). Originally: (a) event-based numbers (F2 uses, C5 scans) labelled "Inclui contas de teste (não dá para separar)"; (b) W4 / funnel created_protocol aligned to live protocols like the totals (SQL change in `admin_accounts` and `admin_metrics`, **not applied**); (c) Contas tab: `admin_accounts_list` (real accounts only, newest first, emails for the admin, no analytics fields; service_role only; **not applied**), summary counts measured from the rows, "N contas de teste excluídas" count only.
  - `admin_metrics` v2: one `real` set (`not admin_is_test`) drives signups, doses, protocols (deleted rows excluded), audience, funnel, totals, adherence, top biomarkers; returns `test_excluded`.
  - `admin_feature_adoption` v2: events only; total_users excludes test.
  - `admin_accounts`: `protocols_live` excludes test.
  - Page: "N test accounts excluded" line under the headline cards; RevenueCat and store rows say "includes test purchases, IDs and installs"; no toggle, no raw view.
  - **Removed because analytics are anonymous since 2026-10-04 (founder regulatory decision; user_id is null on every event):** O5–O7 DAU/WAU/MAU, C2 active users, F1 and the Users/Reach columns of F2, P1–P3 compounds/searches/types, G2 cohorts, `admin_activity` is no longer called. Event counts (F2 Uses, C5 scans, E3 doses chart) stay and are labelled events, not people.
  - Before/after numbers (with tests / without) go in note 013 only, never on the page.

### Phase 2d — Marking test accounts from the panel (Panel #016, founder GO 2026-10-17; first panel write)

**Founder exception:** this is the only write the panel may do before a real login exists. It runs behind the current header-only ADMIN_TOKEN. Premium grant/revoke stays out of scope.

| ID | Criterion | Status | Evidence |
|---|---|---|---|
| TM1 | One POST endpoint in `api/adm.js`; token from the Authorization header only; a token-like query parameter → 401 before anything; GET behaviour unchanged | [~] | tests "TM1…" in admManagement.test.js |
| TM2 | Body validated: `action` ∈ {mark_test, unmark_test}; `emails` = array of 1–200 strings, trimmed, lower-cased, de-duplicated; anything else → 400 and no database call | [~] | tests "TM2…" |
| TM3 | Every email must exist in `auth.users`, otherwise the whole call is refused (no partial writes); enforced in SQL `admin_mark_test` | [x] | SQL + test "TM3…" |
| TM4 | Marking inserts into `admin_test_accounts` and removes any exception; unmarking removes the list row and, if the account is still test by a rule, inserts an exception ("não é teste") so the founder's word wins over the rule | [x] | SQL + static test |
| TM5 | `admin_audit_log` (at, action, email, before, after): one row per email, written in the same transaction as the change; RLS on; service_role only | [x] | SQL + static test |
| TM6 | Rule in `admin_is_test`: lower(email) ~ `^[a-z]+\.[0-9]{5,6}@gmail\.com$` counts as test; `admin_test_exceptions` wins over every rule and over the list; `admin_test_kind(email)` returns exception / list / domain / rule / null for badges | [x] | SQL + tests |
| TM7 | Contas tab: search by email; filters all / not onboarded / no live protocol / Google sign-in / rule match; row checkboxes + select all filtered; "Marcar como teste" / "Desmarcar teste"; confirmation listing the exact emails; "Contas de teste" view (emails + kind) to undo; badge "teste (regra)"; counter "N contas pela regra" | [~] | render, both themes |
| TM8 | Test accounts still appear in no number and not in the Resumo (count only) | [x] | existing tests + SQL |
| TM9 | No account is deleted or created by the panel | [x] | SQL contains no DELETE/INSERT on auth.users |
| TM10 | Rule impact on today's real accounts reported as counts only, before apply | [x] | note 015 |

**SQL applied 2026-10-17 ~04:25 UTC (Panel #017, founder GO), one transaction.** Evidence (note 015): rollback file `Admin Panel Files/017-rollback-functions.sql`; live md5 of the 4 functions = repo; ACL service_role only on 4 functions and 2 tables (RLS on); anon → 401/42501 on all 5; after apply 32 real / 87 test (rule 76, domain 1, list 10; the previous 11 unchanged); audit log and exceptions empty; `admin_mark_test` exercised live inside a rolled-back transaction (mark: before=true after=true; unmark: before=true after=false, exception created), nothing left after rollback. Rows TM3–TM6 and TM8–TM10 verified live. **Pushed + deployed 2026-10-17 (main fast-forward 08b2809..f932291, Vercel Production deployment 7134825517, live /adm sha = commit sha).** TM1/TM2 refusal paths verified live (GET and POST: query token, no header, wrong header → 401). The accept path (POST with the founder's token → mark/unmark) and TM7 on the live page are for the founder to confirm by using the Contas tab; the first real audit rows will have id ≥ 3.

**Panel #018 (founder requests 2026-10-17, test first):** (a) **Bug** — the live "Contas de teste" view was empty: `api/adm.js` dropped `tests`, `by_rule` and `test_excluded` from `admin_accounts_list`; now passed through (test "Bug (founder 2026-10-17)…", red → green). (b) **TM11** Contas tab sort + filter: every column header sorts (email A–Z, Criada, Login, Plataforma, Onboarding, Protocolos ativos, Último login; tests view: email, Fonte), click again flips the direction, ▲/▼ on the sorted column; filters = search by email AND Plataforma (iOS/Android/desconhecida) AND Login (google/apple/email) AND Onboarding (sim/não) AND Protocolos ativos (com/sem) AND "bate com a regra"; counter "mostradas / total"; "selecionar todas as mostradas" selects only the filtered rows. Pure block `accSort`/`accFilter` under test (3 tests); labels in 6 languages; tokens only; renders in `Admin Panel Files/018-screens/` (both themes). **Pushed + deployed 2026-10-17 (main fast-forward f932291..57442ef; live /adm sha256 = commit; GET/POST refusals re-verified live: no header, query token, wrong header → 401).** The founder confirms on the live page: Contas de teste lists 87 accounts; sort + filter work; one mark/unmark writes audit rows id ≥ 3.

### Phase 3 — Users, Premium and AI helper

checklist-signed: 2026-10-21 by the founder ("assino a fase 3 e aprovo o login"); the 3.1 login picture docs/design/adm-31-login.html approved the same day; built by Claude Code in the DoseTrace session (founder: "Faz aqui entao")

**3.1 deviations accepted by the founder 2026-10-21 ("Aceito as três diferenças, pode seguir com os passos"):** (1) not authorised shows right after the password, before the code; (2) a Sair button in the panel header; (3) the /adm CSP keeps unsafe-inline for now (a hash-based CSP needs the page rewritten, registered for later). **Migration applied 2026-10-21 (apply_migration admin_users):** RLS on, 0 policies, anon/authenticated no grants (service_role has the Supabase default table grants, not SELECT only), admin_mark_test(text[],boolean,uuid) execute = postgres + service_role only, actor column present; hello@dosetrace.io inserted as admin (1 row). Deploy (main fast-forward) pending: blocked by the session permission check, the founder decides.

**3.1 live 2026-10-22:** deployed (main 6a80242, then QR fixes 02336e6 SVGo header and 407d3dc 232 px QR; live /adm sha256 = commit each time). Live refusals: GET no token / ?t=x / ?token=x / junk Bearer → 401; POST foreign or missing Origin → 403; POST own Origin without JWT → 401; /api/_admAuth → 404 (helper, not an endpoint); anon REST read of admin_users → 401 42501; CSP, no-store, no-referrer, X-Frame-Options DENY served on /adm; no prompt( / dt_adm_token in the live page. The founder signed in as hello@dosetrace.io and set up Google Authenticator (auth.mfa_factors: 1 totp factor, verified, 04:07 UTC; the first setup key, shared in a screenshot, was discarded when the page removed the unfinished factor). ADMIN_TOKEN deleted from Vercel by the founder 2026-10-22 ("Apaguei"; not verifiable from here: no Vercel CLI login, and the live code ignores the variable since 3.1, every token-only request already 401). AU7 app side proven 2026-10-22: the founder signed out and back in on the Fold (Android build 1.3.1 vc56) as evandro1985@gmail.com after the deploy; auth.users last_sign_in_at 04:42:16 UTC, 0 MFA factors on that account (no second factor asked of app users), Today showed the same data as before the sign-out. Still open: step-up after 15 min on a live write (AU3, founder 2026-10-22: proven with the first Premium action of 3.2), the Supabase Auth settings read before/after (no settings were changed by this work).

**Status:** 3.1 built on `feature/admin-panel` 2026-10-21 (rows AU1–AU9 `[~]`, evidence on each row); NOT pushed, NOT deployed, migration NOT applied. 3.2–3.5 not started. Earlier status: spec and pictures only (2026-10-21). Input: the handoff `docs/handoffs/admin-panel-users-premium-ai.md` in the main repo (sections 0–8) and the founder's answers to its section 8, **founder 2026-10-21 (via Cowork)**. No code starts until the founder signs this checklist and picks the picture of each screen.

**Founder decisions this phase applies (founder 2026-10-21 (via Cowork)):**
- **Q1 Premium durations:** 7 days, 1 month, 3 months, 1 year, custom date, and "Lifetime" (end date 2099-12-31). Lifetime stays disabled until PR13 passes on the test phone.
- **Q2 Users tab actions:** "Resend confirmation e-mail" **yes**, only for e-mail sign-ups still unconfirmed, server-side, logged in `admin_actions_log`. "Force sign-out" **no**, until an app-side spec proves no data loss. Delete account stays out (the user deletes in the app).
- **Q3 Health data on the account card:** only "has an active protocol: yes/no" (`has_active_protocol` boolean). No counts of protocols, doses or labs, and no content.
- **Q4a AI scope:** answer + propose. It answers where/how questions, looks up numbers and status, and proposes actions that run only when the founder clicks Confirm. It never acts alone and never reads health data.
- **Q4b AI model and reach:** it must find data through read-only tools, interpret **admin/business metrics only** (MRR, sign-ups, activation, conversion, AI cost, release status) and say exactly where a number or chart is. Questions outside the admin panel's scope are declined. The health-data / medical hard line is unchanged. Model: start with `claude-sonnet-5-5`, switch to `claude-opus-5-5` if the eval fails, never Haiku.
- **Q4c AI cost caps:** US$ 1 per day (server-enforced) and US$ 15 per month (Anthropic workspace spend limit). The panel shows "cost today / US$ 1" and "this month / US$ 15".
- **Q5 Customer message:** after a grant the panel shows a copyable message in 6 languages. The founder copies and sends it himself; the panel never sends it.
- **Q6 Build order:** 3.1 login → 3.2 Premium (A) → 3.3 Users tab (B) → M1 release status → M2 version notice → M3–M5 → 3.4 AI helper (C) → the "Should" items (handoff section 5).

**Decided by the project rules (no founder question needed):**
- **3.1 lands before any new write.** The shared ADMIN_TOKEN has no identity, so no log could say who acted (handoff section 6).
- **The token prompt is replaced, not kept as a fallback** (CLAUDE.md "Rebuild means REPLACE"). When 3.1 ships, `window.prompt('Admin token')` and the ADMIN_TOKEN check are deleted in the same change, reads included. The recovery path if the login breaks is a Vercel rollback to the previous deployment, not a second door.
- **No project-wide Supabase Auth setting changes.** JWT expiry, session time-box and inactivity timeout are shared with every app user, so the panel enforces its own session limits server-side (never-lose-data rule: an app user must not be signed out by panel work).
- **No "forgot password" on the panel.** It would add a public reset flow to the admin door. Recovery goes through the Supabase dashboard, which the founder owns.
- **Scope lines.** When this checklist is signed, the Scope lines "View-only" and "Out of scope until the founder specs them" above are rewritten to point here. That edit happens at signing, not now.

#### 3.1 Admin login (prerequisite for every write)
- **Founder answers to the 3.1 picture (2026-10-21, in chat):** the panel account is **his own app account, hello@dosetrace.io**, for now (Q1 = b; recommendation was a separate account — accepted risk: a test on that account, e.g. a password change or delete, also affects panel access; app tests run on the test account per the standing rule). Second factor: **an authenticator app (TOTP) only, never an e-mail code**. Session: **12 h**. Backup for the code (Q3, founder 2026-10-21): one authenticator, Google Authenticator synced to his Google account (codes follow him to any phone); recovery if that account is lost: the factor is removed from the Supabase dashboard.


**Design:**
- **Sign-in:** Supabase Auth, e-mail + password, then a TOTP code (Supabase MFA, `aal2`). The page uses only the project's public anon key; no service key and no admin secret ever reach the page.
- **First-time setup:** an allow-listed account with no TOTP factor is shown the enrolment screen (QR code + manual key, shown once) right after the password step. An account with a factor never sees enrolment again.
- **Allow-list:** `admin_users (user_id uuid primary key, role text check (role in ('viewer','admin')), added_at timestamptz)`. RLS on, no policies, service_role only. Rows are added by SQL only, with the founder's go.
- **Server check on every `/api/adm*` request (GET included):** verify the Supabase JWT server-side; require `aal2`; require `user_id` in `admin_users`; writes also need role `admin` and a TOTP verification within the last 15 minutes (step-up). The actor written to every log row is the `user_id`.
- **Session:** kept in `sessionStorage` only (gone when the tab closes), never `localStorage`, never in a URL. Maximum panel session age: **12 h** (founder 2026-10-21). After it, or after a refused refresh, the page shows "session expired" and loads no data.
- **Origin and headers:** a POST whose `Origin` is not `https://dosetrace.io` is refused first. `Cache-Control: no-store` on every admin response. A Content-Security-Policy for `/adm`. No `console.*` in `api/`.
- **Phase 2d test marking** moves behind the new session (role admin + step-up). Its rows TM1–TM11 stay as they are.
- **Screens (picture `docs/design/adm-31-login.html`):** sign-in, TOTP code, first-time setup, errors (wrong e-mail or password, wrong or expired code, too many attempts, no connection), not authorised, session expired, and the step-up dialog before a change.

| ID | Criterion | Status | Evidence |
|---|---|---|---|
| AU1 | `/adm` requires Supabase sign-in plus TOTP (`aal2`); an account not in `admin_users` sees "not authorised" and gets no data (0 data requests after the refusal) | [~] | admLogin.test.js "AU1 page…" (4 tests) + AU2 server tests; headless: noauth = 1 refused check, 0 after. The allow-list is checked right after the password, before any TOTP step, so a non-admin account is never offered TOTP setup. Live check after deploy |
| AU2 | Every `/api/adm*` endpoint returns 401 without a valid JWT, 401 for an `aal1` session, 403 for a non-allow-listed user, and 403 on a write for a `viewer`; the old `ADMIN_TOKEN` alone → 401 | [~] | admLogin.test.js "AU2: …" (10 tests, every api/adm*.js); adm.test.js rewritten for the session. An aal1 session of a non-listed account gets 403 (allow-list first) |
| AU3 | A write more than 15 min after the last TOTP check opens the step-up dialog; the server refuses the write without a fresh check (401 `step_up_required`) | [~] | "AU3 server…" (3) + "AU3 page…" (2) + "AU3 static"; captures /private/tmp/claude-501/-Users-evandrosantos-Desktop-dosetrace/471f2548-5ba0-4cd3-9104-9a98d6108669/scratchpad/adm31/stepup-{light,dark}-{1280,420}.png. Live: confirm the TOTP amr time advances on a re-check |
| AU4 | A POST with a foreign `Origin` → 403 before anything else (no JWT check, no database call) | [~] | "AU4: …" (foreign, http, look-alike and missing Origin → 403, 0 calls) |
| AU5 | `admin_users` has RLS on and service_role only; anon → 401/42501 | [~] | SQL written, NOT applied: supabase/migrations/20261021000000_admin_users.sql + supabase_admin_rpcs.sql; "AU5 SQL…" (2). Live SQL check after the founder's go |
| AU6 | **Old door removed in the same change:** `web/adm.html` has no `prompt(` and no `dt_adm_token`; `api/adm.js` no longer reads `ADMIN_TOKEN`; the Phase 2d POST requires the session (role admin + step-up). Founder 2026-10-21 (via Cowork) order: login first | [~] | "AU6: …" static + AU2/AU3 server tests; TM1–TM3 moved onto the session. The ADMIN_TOKEN env var in Vercel can be deleted after the deploy is verified. Live check after deploy |
| AU7 | **App users unaffected:** no project-wide Supabase Auth setting changes (JWT expiry, session time-box, inactivity timeout, MFA enforcement); an app sign-in on the test account still works after the deploy | [~] | "AU7 static": only user-level Auth endpoints, no admin/Management API, migration touches no auth schema. Settings before/after + device check still owed (founder) |
| AU8 | Session in `sessionStorage` only; sign-out and tab close remove it; a session older than the chosen maximum age → "session expired" screen and 0 data requests | [~] | "AU8 server" + "AU8 page…" (5) + "AU8 static"; headless expired = 0 /api/adm requests; captures /private/tmp/claude-501/-Users-evandrosantos-Desktop-dosetrace/471f2548-5ba0-4cd3-9104-9a98d6108669/scratchpad/adm31/expired-*.png |
| AU9 | The login screens (sign-in, code, first-time setup, each error, not authorised, session expired, step-up) match the picked picture: labels in 6 languages (parity test), tokens only, desktop + 420 px with no horizontal scroll, both themes | [~] | "AU9: …" (3) + parity test; 40 renders (10 screens × light/dark × 1280/420, no horizontal scroll, no CSP violation) in captures /private/tmp/claude-501/-Users-evandrosantos-Desktop-dosetrace/471f2548-5ba0-4cd3-9104-9a98d6108669/scratchpad/adm31/; founder eyeball owed |

#### 3.2 Feature A: Premium (grant, change end date, revoke)

**Status 2026-10-22:** built on `feature/admin-panel` (commits d1ecc25 server + migration, 525298e page), NOT pushed, NOT deployed, migration `supabase/migrations/20261022120000_admin_actions_log.sql` NOT applied, key not created. No 3.2 picture had been approved: the dialog was built to the PR10/PR11 rows in the 3.1 login style and drawn in `docs/design/adm-32-premium.html` for the founder's pick (a deviation he must accept). RevenueCat v2 paths and fields checked 2026-10-22 on https://www.revenuecat.com/docs/api-v2/customer, …/customer/resources and …/entitlement. The key also needs `customer_information:subscriptions:read` and `customer_information:purchases:read` (to tell a store, Lifetime or panel source apart, PR5), beyond the two scopes listed below.

**Design:** handoff sections 2.2–2.7, unchanged except where the founder's answers say otherwise.
- New Vercel function `api/adm-premium.js`, the only reader of `REVENUECAT_WRITE_KEY` (a v2 secret key with `customer_information:customers:read_write` + `project_configuration:entitlements:read`). The existing read key is not widened.
- RevenueCat v2 `grant_entitlement` / `revoke_granted_entitlement`, entitlement resolved by lookup key `DoseTrace Pro` and stored as `REVENUECAT_ENTITLEMENT_ID`.
- **Durations (Q1, founder 2026-10-21 (via Cowork)):** 7 days, 1 month, 3 months, 1 year, custom date, Lifetime (2099-12-31T23:59:59Z). Dates are entered and shown in UTC, with the founder's local time beside them.
- **Lifetime gate:** until PR13 is `[x]`, the Lifetime option is shown disabled with the reason "Disponível após o teste no aparelho (PR13)", and the server refuses `expires_at` in 2099 with 400.
- Audit table `admin_actions_log` as in handoff 2.4 (plan state only, no health field, no e-mail copy).
- **Customer message (Q5, founder 2026-10-21 (via Cowork)):** after a successful grant the dialog shows the message below in the panel's current language, with a **Copy** button. The panel never sends it. The button and screen names are the app's exact strings (`/Users/evandrosantos/Desktop/dosetrace-1.3.1/i18n/translations.js`: `tab_settings`, `settings_premium_btn`, `paywall_restore`, checked 2026-10-21).
  - **Why the path is named, not "the Premium screen":** the app has no screen titled "Premium". The screen with the button is titled "Upgrade to Premium" / "Assine o Premium" (`paywall_title`) and opens from Settings › "See plans". Naming the two taps the customer really sees follows from the founder's intent (the customer finds the button).

| Lang | Message |
|---|---|
| en | Your Premium access is active. To see it now, open DoseTrace, go to Settings › See plans and tap Restore purchases. |
| pt | Seu acesso Premium está ativo. Para vê-lo agora, abra o DoseTrace, vá em Ajustes › Ver planos e toque em Restaurar compras. |
| es | Tu acceso Premium ya está activo. Para verlo ahora, abre DoseTrace, ve a Ajustes › Ver planes y toca Restaurar compras. |
| fr | Votre accès Premium est actif. Pour le voir dès maintenant, ouvrez DoseTrace, allez dans Paramètres › Voir les offres, puis touchez Restaurer les achats. |
| de | Dein Premium-Zugang ist aktiv. Um ihn sofort zu sehen, öffne DoseTrace, geh zu Einstellungen › Pläne anzeigen und tippe auf Käufe wiederherstellen. |
| it | Il tuo accesso Premium è attivo. Per vederlo subito, apri DoseTrace, vai su Impostazioni › Vedi i piani e tocca Ripristina acquisti. |

  - Register follows the app's own copy in each language: pt formal (founder rule 2026-10-20), es/de/it informal (the app writes "tu suscripción", "Dein Premium-Abonnement", "Il tuo abbonamento"), fr "vous" (the app writes "Votre abonnement").
  - Founder's source text (EN): "Your Premium access is active. To see it now, open DoseTrace and tap Restore purchases on the Premium screen." PT reference: "Seu acesso Premium está ativo. Para vê-lo agora, abra o DoseTrace e toque em Restaurar compras na tela Premium." The founder confirms the wording above when he picks the PR10/PR11 picture.

| ID | Criterion | Status | Evidence |
|---|---|---|---|
| PR1 | `api/adm-premium.js` is the only file that reads `REVENUECAT_WRITE_KEY`; the key never appears in a response, page or log; `grep -c console. api/adm-premium.js` = 0 | [~] | admPremium.test.js "PR1…" (2): repo scan finds REVENUECAT_WRITE_KEY only in api/adm-premium.js; 0 console.*; the key is never in a response and is sent only to api.revenuecat.com |
| PR2 | Body validation: `action` ∈ {grant, revoke, change_end}; `user_id` is a uuid; `expires_at` lies in the future and matches one of the offered durations (7 d, 1 mo, 3 mo, 1 y, a custom date in the future and before 2099-12-31, or Lifetime 2099-12-31 only once PR13 is `[x]`); `reason` is 1–200 chars; `request_id` is a uuid. Otherwise → 400 and no external call. Founder 2026-10-21 (via Cowork), Q1 | [~] | "PR2…" (3) + "PR2/PR13": 20 malformed bodies → 400 with 0 calls; every preset end equals the page end (api presetEnd = page premEnd); 2099 dates refused |
| PR3 | A `user_id` that is not in `auth.users` → 404, with no RevenueCat call; an `$RCAnonymousID` is refused | [~] | "PR3…" (2): unknown id → 404, 0 RevenueCat calls, no log row; $RCAnonymousID → 400 anonymous_id, 0 calls. SQL admin_premium_target rehearsed on local Postgres |
| PR4 | Grant calls v2 `grant_entitlement` with the resolved `entitlement_id` (lookup key `DoseTrace Pro`) and `expires_at`; the re-read shows the entitlement active until that date; a test fails if the lookup key stops matching | [~] | "PR4…" (5), RevenueCat mocked: v2 POST …/actions/grant_entitlement {entitlement_id, expires_at ms}, re-read shows promotional until that date; lookup key re-checked on every change (mismatch → 500, no write); static test ties the lookup key to lib/purchases.js ENTITLEMENT_ID; whitelist = DEVELOPER_EMAILS. Live check owed (PR12) |
| PR5 | Revoke calls `revoke_granted_entitlement`; it is refused before any call when the account's only Premium source is a store purchase, Lifetime purchase or the app whitelist, with that reason shown | [~] | "PR5…" (5): revoke → …/actions/revoke_granted_entitlement; refused 409 before any write for store / Lifetime / whitelist / never Premium, reason named on the page; promo beside a store sub can be revoked |
| PR6 | Change end date = revoke then grant, under one `request_id`, with one log row; the dialog warns about the brief drop | [~] | "PR6…" (3) + page test: revoke then grant, one request_id, one row; no panel grant → refused; grant failing after the revoke → 502 change_partial; dialog shows the drop warning |
| PR7 | Idempotency: the same `request_id` sent twice → one RevenueCat call and the same answer | [~] | "PR7…" (2): replay → 0 RevenueCat calls, identical answer; pending → in_progress; reused for another change → request_reused. Local Postgres rehearsal: two concurrent sessions, one request_id → one row |
| PR8 | Every action writes one `admin_actions_log` row (actor = admin `user_id`, action, user_id, expires_at, reason, before/after plan state, status, http); no health field and no e-mail column exist in the table | [~] | "PR8…" (4) + rehearsal 39/39 on a throw-away local supabase/postgres: one row per action (refused and failed too), actor, plan-state-only before/after (check constraint), no e-mail possible in the stored answer, RLS on, no policies, service_role SELECT only, finish only once. Migration NOT applied |
| PR9 | Error states (401/403, 404, 429, 5xx/timeout, a duplicate inside 2 h) each show their own message in 6 languages; after a timeout the state is re-read before anything is reported | [~] | "PR9…" (4) server + 2 page tests: RevenueCat 401/403, 404, 429, 5xx, timeout (4 s) each with its own code and message ×6; after a timeout/5xx the plan is re-read before the answer (applied late → done; nothing → rc_timeout/rc_down; re-read impossible → rc_unknown). Renders err-timeout / err-rate both themes |
| PR10 | The confirm dialog shows the e-mail, short id, current plan and source, action, end date (UTC + local) and the note "store subscriptions not affected"; Confirm stays disabled until a reason is typed; a double-click sends one request. **After a successful grant the same dialog shows the copyable customer message (table above) in the panel's current language, with a Copy button; nothing is sent from the panel** (founder 2026-10-21 (via Cowork), Q5) | [~] | page tests (5): dialog content, Confirm disabled until a reason, double-click → one request, request id kept for the step-up retry, Copy = exact string ×6 with 0 requests. Renders /private/tmp/claude-501/-Users-evandrosantos-Desktop-dosetrace/471f2548-5ba0-4cd3-9104-9a98d6108669/scratchpad/adm32/ (grant-form, change-form, revoke-form, store-refused, test-account, done-grant, done-revoke, stepup-premium; light/dark × 1280/420; no horizontal scroll, no CSP violation). Picture docs/design/adm-32-premium.html awaits the founder pick |
| PR11 | After success the panel says when the app will show it (≈5 min with the app open / on the next open / at once with "Restaurar compras") and shows the customer message from PR10 beside it; the message strings are in the parity test and use the app's exact button words | [~] | "PR11…" (2): message words equal release/1.3.1 i18n tab_settings › settings_premium_btn and paywall_restore ×6; "when the app shows it" ×6; unconfirmed re-read says so |
| PR12 | Live, on evandro1985@gmail.com only: grant 7 d → the app shows Premium after "Restaurar compras" → change end → revoke → the app is free again; 3–4 log rows | [ ] | not run: needs the migration, the key, the env vars and the deploy (founder go) |
| PR13 | The Lifetime end date (2099-12-31) displays correctly in the app's Settings and is treated as Premium by `lib/entitlement.js` (store reachable and offline cache) on the test phone. **Until this row is `[x]`, Lifetime is shown disabled with the reason and the server refuses it** (founder 2026-10-21 (via Cowork), Q1) | [ ] | device check not run. Off-switch proven: LIFETIME_ENABLED / PREM_LIFETIME_ON false (tests), server refuses 2099 with 400 lifetime_disabled, the option is disabled with the reason |
| PR14 | Rate limits, server-side through a Supabase counter RPC: 30 writes per hour per actor, 1 Premium action per account per minute; over the limit → 429 with its own message, no RevenueCat call | [~] | "PR14…" (2) + rehearsal: 31st action in an hour → 429 rate_actor; second Premium action on an account within 1 min → 429 rate_account; 0 RevenueCat calls; replays answered first |

#### 3.3 Feature B: Users tab (the Contas tab evolved, one place for accounts)

**Design:** handoff section 3. The existing Contas tab grows; no second list (Rebuild = replace).
- Search by e-mail (existing), exact Supabase id, exact RevenueCat id.
- Account drawer from `admin_account_card(p_user_id)` + a server-side RevenueCat read. **Health data (Q3, founder 2026-10-21 (via Cowork)):** the only health-related field is `has_active_protocol` (boolean). The Contas list's existing `protocols_live` count is replaced by the same yes/no in this change.
- **Actions (Q2, founder 2026-10-21 (via Cowork)):** Premium (3.2), copy id, open in the RevenueCat / Supabase dashboard, mark/unmark test (existing), and **Resend confirmation e-mail**, only for e-mail sign-ups whose `email_confirmed_at` is null. It calls Supabase Auth resend (`type: signup`) from the server, after a confirm dialog, behind the admin session, and writes one `admin_actions_log` row (`action = resend_confirmation`). **No force sign-out, no delete.**

| ID | Criterion | Status | Evidence |
|---|---|---|---|
| US1 | Search works by e-mail (existing), exact Supabase id and exact RevenueCat id; an anonymous RC id shows "anonymous id, not an account" | [ ] | tests |
| US2 | The card shows the fields in handoff 3.2. "Last seen" and "App version" show "not measured" with the reason until their migrations are applied | [ ] | test + render |
| US3 | The plan source is one of: free / App Store sub / Google Play sub / Lifetime purchase / promotional (end date) / app whitelist, matching RevenueCat for 3 test accounts | [ ] | live check |
| US4 | `admin_account_card` returns no protocol, dose, lab, food, weight or body field. The only health-related key allowed is `has_active_protocol` (boolean); no counts and no content. A static test lists the allowed keys and fails on any other. The Contas list shows the same yes/no instead of the `protocols_live` count (founder 2026-10-21 (via Cowork), Q3) | [ ] | static test + SQL check of the function's output columns |
| US5 | Actions shown: Premium (3.2), copy id, dashboard links, test marking, and "Resend confirmation e-mail" only for e-mail sign-ups with `email_confirmed_at` null (hidden for OAuth and confirmed accounts). **Force sign-out and delete are not offered anywhere** (founder 2026-10-21 (via Cowork), Q2) | [ ] | render + test (no force-sign-out or delete control or endpoint exists) |
| US6 | Test accounts stay out of every number and out of the main list (existing TM8 still green) | [ ] | existing tests |
| US7 | Labels in 6 languages (parity test), tokens only, desktop + 390 px with no horizontal scroll, both themes | [ ] | parity test + screenshots |
| US8 | Resend confirmation: server-side only, behind the admin session (role admin + step-up); refused with 409 for a confirmed or OAuth account before any call; one `admin_actions_log` row per send (actor, user_id, status); at most 1 send per account per hour; the confirm dialog names the e-mail it goes to | [ ] | tests + live check on a fake unconfirmed test sign-up |

#### 3.4 Feature C: AI helper (answer + propose)

**Design:** handoff section 4, with the founder's answers (founder 2026-10-21 (via Cowork), Q4a–Q4c).
- **Scope:** answers where/how questions; looks up numbers and status through read-only tools; interprets admin/business metrics only (MRR, sign-ups, activation, conversion, AI cost, release status), from the panel's own data and its own history, with no invented benchmarks; says exactly where a number or chart is on the panel. It proposes actions that run only on the founder's Confirm click. It never acts alone, never reads health data, and declines anything outside the admin panel's scope in one sentence.
- **Model:** start with `claude-sonnet-5-5`. Run AI5 (with its extensions), AI6 and AI10. If it fails the interpretation or "where is it" questions, switch to `claude-opus-5-5` and run them again. No Haiku. The model and the eval results are recorded in the AI5 note; the id is confirmed again at build (AI9).
- **Verified 2026-10-21** on https://platform.claude.com/docs/en/about-claude/models/overview and https://platform.claude.com/docs/en/about-claude/pricing (USD per million tokens):

| Model id | Input | 5-min cache write | 1-h cache write | Cache hit | Output |
|---|---|---|---|---|---|
| `claude-sonnet-5-5` | $2 | $2.50 | $4 | $0.10 | $10 |
| `claude-opus-5-5` | $4 | $5 | $8 | $0.20 | $20 |

  - Both have adaptive thinking (always on for Opus 5.5; Sonnet 5.5 cannot turn thinking fully off) and a 1M-token context at standard price. Thinking tokens bill as output.
  - **Estimate, not measured:** with the knowledge pack cached, one question with 2–3 tool rounds should cost about US$ 0.02–0.05 on Sonnet and about twice that on Opus. **The real cost per question is measured during the AI5 eval and shown to the founder before the AI ships.**
- **Cost caps (Q4c):** US$ 1 per day enforced by the server; US$ 15 per month as the Anthropic workspace spend limit. The monthly cap binds first: US$ 15 / 30 days ≈ US$ 0.50 per day on average, so a US$ 1 day is possible only if other days are lighter. The panel shows "custo hoje / US$ 1" and "este mês / US$ 15".

| ID | Criterion | Status | Evidence |
|---|---|---|---|
| AI1 | `api/adm-ai.js` requires the admin session; `ANTHROPIC_ADMIN_KEY` (workspace key, no expiry, own workspace) is used only there and never reaches the page | [ ] | tests |
| AI2 | Only the listed read-only tools exist; no tool can write; a static test fails if a tool calls `admin_mark_test`, `adm-premium` or any write RPC | [ ] | static test |
| AI3 | `propose_action` only renders a card; the action runs only through the founder's click on the Feature A endpoint with his own session; a proposal expires after 10 min | [ ] | test + render |
| AI4 | Tool outputs contain no e-mail and no health data (allowed-keys test; `has_active_protocol` is not passed to the model either) | [ ] | static test |
| AI5 | Eval set of at least 20 questions answered correctly from the knowledge pack and the read-only tools. It includes where/how questions ("where do I see Apple downloads", "how is activation counted", "how do I put a build on TestFlight for Early Birds") **and interpret-this-number questions**: "Why did MRR drop this week?" (only from panel data; says plainly when the data cannot explain it), "Is 3% activation good for us?" (compared with the panel's own history, no invented benchmarks), "Where is the chart of downloads by store?" (names the tab, section and card). The note records the model used, each answer's pass/fail, and the **measured cost per question** (input, output, cache tokens, US$), shown to the founder before the AI ships (founder 2026-10-21 (via Cowork), Q4b/Q4c) | [ ] | eval run, results in a note |
| AI6 | Refusals: asking for a user's doses or labs, for dose advice, or to "just grant it" without confirmation → refused, and nothing happens | [ ] | eval |
| AI7 | `admin_ai_usage` stores tokens, cost and tool names only, never prompt or answer text; no `console.*` | [ ] | SQL + static test |
| AI8 | Cost caps: US$ 1 per day enforced server-side (at the cap the chat says so and makes no API call); US$ 15 per month set as the Anthropic workspace spend limit; at most 20 questions per 10 min; the panel shows "custo hoje / US$ 1" and "este mês / US$ 15" from `admin_ai_usage` (founder 2026-10-21 (via Cowork), Q4c) | [ ] | tests + Anthropic console screenshot of the workspace limit (founder) + render |
| AI9 | Model id confirmed against the current docs at build time (start `claude-sonnet-5-5`, `claude-opus-5-5` only if AI5 fails, never Haiku); refusal `stop_reason` handled | [ ] | test + docs check dated at build |
| AI10 | Questions outside the DoseTrace admin panel's scope are declined in one sentence that points back to what the helper can do; no tool call is made and the cost is minimal (founder 2026-10-21 (via Cowork), Q4b) | [ ] | eval: at least 5 off-topic questions inside the AI5/AI6 set, each with 0 tool calls and its token cost recorded |

#### 3.5 Release and operations musts (handoff section 5; built after 3.3 and before 3.4, founder 2026-10-21 (via Cowork), Q6)

Each item gets its own picture and, where it writes, its own rows before code. These rows fix the order and the minimum each must prove.

| ID | Criterion | Status | Evidence |
|---|---|---|---|
| M1 | Release status board (view): latest iOS build, its TestFlight groups (internal + Early Birds), beta review state and `submittedDate`; App Store version state; Play track, status and rollout %. Same logic as `scripts/asc-tf-status.cjs` / `play-track-status.cjs`; no write | [ ] | tests with recorded API answers + live check against `/tf-status` on the same day |
| M2 | Version notice editor (write, `app_releases`): refuses a version not yet live in that store (checked through M1); `min_version` ≤ `latest_version`; `min_version` needs a second confirmation ("this locks older phones out"); all 6 note languages shown before saving; every change logged in `admin_actions_log`. Usable only after migration `20261022000000_app_releases.sql` is applied | [ ] | tests + render both themes + live check after the migration |
| M3 | Server function health (view): invocations and errors per edge function over 24 h / 7 d; last cron run (`version_notice_runs`); version-notice "refused" lines | [ ] | tests + live check against the Supabase dashboard |
| M4 | AI usage and quotas (view): daily counts from `ai_scan_usage`, `ai_food_usage`, `ai_assistant_usage`; accounts at their cap (count only); estimated Anthropic cost vs budget | [ ] | tests + live check |
| M5 | Key and certificate expiry calendar: names and dates only, never values (Anthropic keys, ASC API key, Sign in with Apple client secret, RevenueCat keys, admin keys); the dates are the only write and are logged | [ ] | tests + render |

The "Should" items S1–S7 (handoff section 5) come after 3.4, each specced when its turn comes.

## Auth

Since 3.1 (built 2026-10-21, not yet deployed) the shared admin token is gone. The rules below replace it; rows AU1–AU9 are the contract.

- **Credential.** The admin's own Supabase session: `Authorization: Bearer <access token>`, header only. Cookies and the body are never read. A token-like query parameter (`t`, `token`, `admin_token`, `access_token`) is still refused with 401.
- **Server order** (`api/_admAuth.js`, used by every `api/adm*.js`): a write from an Origin other than `https://dosetrace.io` → 403 first; no token → 401; Supabase not configured or unreachable → 503; token not accepted by Supabase Auth → 401; not in `admin_users` → 403; not `aal2` → 401 `aal2_required`; password sign-in older than 12 h → 401 `session_expired`; writes also need role `admin` (403) and a TOTP check within 15 min (401 `step_up_required`).
- **Page.** `web/adm.html` signs in with the public anon key (the one in `eas.json`), keeps the aal2 session in `sessionStorage` only, and offers TOTP setup only to an allow-listed account. CSP and security headers for `/adm` are in `vercel.json`.
- **Post-deploy checks** (founder, after the migration and the deploy):
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" "https://dosetrace.io/api/adm"                       # 401
  curl -s -o /dev/null -w "%{http_code}\n" "https://dosetrace.io/api/adm?t=x"                   # 401
  curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Origin: https://evil.example" "https://dosetrace.io/api/adm"   # 403
  ```
  Then sign in on https://dosetrace.io/adm as hello@dosetrace.io (first time: TOTP setup), and confirm the numbers load.

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
- **Live since 2026-10-16:** the Phase 2 SQL is applied, so `admin_accounts`, `admin_test_accounts` and `admin_is_test` exist in the live database. A1 by hand on 2026-10-16 (window 09-16 → 10-16): 5 / 29 = 17.2%, equal to the card computed by the tested code on the same rows (note 012). Still **not yet proven** by the founder.
- The visible window line says "31 UTC calendar days, today included" (Panel #010, item 6; test-first, 6 languages).

### MV-2 Funnel (one cohort, one window)

**Cohort:** the real accounts created in the chosen window (7, 30 or 90 days). Every step counts accounts **from that cohort** that reached the step at any time up to page load. Late conversions are counted, and the page says so.
- **Default window:** 30 days.
- **Split:** iOS / Android / unknown, with the same platform rule as MV-0.

| ID | Step | Source | Definition | Window (UTC) | How it is proven | Proven |
|---|---|---|---|---|---|---|
| W0 | Store downloads | ASC Sales Reports / Google Play stats | Apple: first-time units (product type 1*/F1), redownloads (3*) shown separately. Google: sum of "Daily User Installs" (and device installs) from the daily CSV rows. **Shown as its own bar, not as a funnel base, and never divided into the account steps** (different entities) | the same full UTC days as the cohort window | ASC Trends / Play Console → Statistics for the same dates | **built 2026-10-17 (MV-6, test first)**: own row W0 with iOS = Apple first installs (redownloads beside), Android = Google daily user installs (device installs beside), Total; days with a report and latest report per store; label "stores include test installs"; a missing source shows its own reason. Tests MV-6 (5); renders `Admin Panel Files/018-screens/` both themes. Live: not yet deployed |
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
| X1 | Store downloads (Apple / Google) | ASC / Play | as W0 | window | as W0 | **built 2026-10-17** (as W0: "Apple N · Google Play N" + the same note line). Live: not yet deployed |
| X2 | Supabase accounts: all / test / real | Supabase | all `auth.users` created in the window; test = `admin_is_test`; real = the rest | window | SQL | not yet proven |
| X3 | **RevenueCat IDs** (never labelled "customers"): total first seen | RevenueCat v2 customers list | RC customers with `first_seen_at` in the window | window | the RC dashboard filter `firstSeenAt afterOrOn … before …` (note 008) | **verified live 2026-10-17** (30-day window: X3 119 = X4 80 + X5 33 (real 7 · test 26) + X6 6; check green; real accounts without RC id: 0) after the RevenueCat key got customer_information:customers:read (Panel #019 redeploy) |
| X4 | … of which anonymous | RevenueCat | app_user_id starts with `$RCAnonymousID`. **Cause:** `Purchases.logOut()` on sign-out (lib/purchases.js:114, App.js:536) | window | RC filter `customerId contains RCAnonymousID` | **verified live 2026-10-17** (30-day window: X3 119 = X4 80 + X5 33 (real 7 · test 26) + X6 6; check green; real accounts without RC id: 0) after the RevenueCat key got customer_information:customers:read (Panel #019 redeploy) |
| X5 | … identified and matching a Supabase account (real / test) | RevenueCat × Supabase | app_user_id equals an `auth.users.id` (exact, full id) | window | exact join; must equal X2 real + test minus accounts that never signed in | **verified live 2026-10-17** (30-day window: X3 119 = X4 80 + X5 33 (real 7 · test 26) + X6 6; check green; real accounts without RC id: 0) after the RevenueCat key got customer_information:customers:read (Panel #019 redeploy) |
| X6 | … identified with no Supabase account (orphans) | RevenueCat × Supabase | app_user_id is not anonymous and matches no `auth.users.id`. **Named cause:** account deleted. `delete-user` removes the auth user but not the RC customer (supabase/functions/delete-user/index.ts:165). Shown as "likely deleted accounts" until MV-8 D2 lands | window | exact join | **verified live 2026-10-17** (30-day window: X3 119 = X4 80 + X5 33 (real 7 · test 26) + X6 6; check green; real accounts without RC id: 0) after the RevenueCat key got customer_information:customers:read (Panel #019 redeploy) |

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
| ~~G2~~ | ~~Weekly signup cohorts, retention~~ (removed 2026-10-16: analytics anonymous, no event per account) | "Do new customers keep using the app week after week?" | Supabase `auth.users` + `analytics_events` | cohort = real accounts by signup ISO week; cell W*n* = share with ≥1 analytics event in week *n*. **Marked as a floor** until an app-open event exists (A-6, MV-8 D3) | last 8 signup weeks | SQL per cohort cell | not yet proven |
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

**Built 2026-10-17 (founder GO, test first):** `fetchApple` reads 91 daily reports in batches of 16 (`STORE_DAYS`, `ASC_BATCH`) and keeps `days[{date, downloads, redownloads, updates}]`; `fetchGooglePlay` reads only the `*_overview.csv` files of the months overlapping the last 91 days and keeps `days[{date, user_installs, device_installs}]`; `storeWindow(apple, google, window)` sums the window's full UTC days, counts days with a report and lists the missing ones; `buildManagement` takes the two sources as a 4th argument → `windows[7|30|90].store`. The Details cards S1–S7 keep their old meaning. S4 fixed the same day (founder: "I need the numbers"): Google retired the "Total User Installs" column (0 on every row), so S4 is now the sum of "Daily User Installs" over every monthly overview file, with "since DATE" under the card (real bucket: 15 since 2026-04-17). **Until a source is configured** its cell shows "not measured — needs the Apple vendor number" / "needs the Play bucket", never an estimate.

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
