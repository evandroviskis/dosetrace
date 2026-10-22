# Handoff for Cowork: admin panel, Premium grants, Users tab and an AI helper

From: Claude Code (DoseTrace repo). Owner: Evandro (the founder). Written 2026-10-21.
Status: **proposal only. Nothing here is approved to build.** The founder signs the checklist (section 7) and picks the pictures before any code is written.

---

## Resumo para o fundador (português)

- **O que o senhor pediu:** conceder e retirar o Premium de clientes pelo painel, sem abrir o RevenueCat; uma aba para gerenciar usuários; sugestões do que mais o painel deve ter, para não precisar abrir vários sites; e um assistente de IA dentro do painel que responda "como vejo o número X / onde encontro a informação Y" e ajude a executar tarefas.
- **Premium (A):** é possível, pelo servidor, com a API do RevenueCat (concessão "promocional" com data de término, e revogação). A chave secreta fica apenas no servidor. O identificador do Premium no RevenueCat é `DoseTrace Pro`, e o cliente é identificado pelo id da conta no Supabase.
- **Limite importante:** só é possível retirar o Premium concedido pelo painel (promocional). Uma assinatura paga na Apple ou no Google não pode ser cancelada nem reembolsada por aqui. As contas da lista fixa do app (`DEVELOPER_EMAILS`) continuam Premium de qualquer forma.
- **Aba Usuários (B):** amplia a aba "Contas" que já existe: busca por e-mail ou id, um resumo da conta (criação, último acesso, plataforma, versão do app, plano e a origem do plano, conta de teste) e as ações. **Nenhum dado de saúde** (protocolos, doses, exames, alimentação, peso) é exibido, por LGPD/GDPR art. 9; no máximo contagens, se o senhor decidir.
- **Atenção:** "forçar saída" foi avaliado e **não é recomendado agora**. A saída no celular apaga o banco local, e dados ainda não sincronizados poderiam ser perdidos.
- **Assistente de IA (C):** um chat no painel que conhece as definições de cada número e os procedimentos da equipe, consulta apenas leituras pré-definidas e **propõe** ações que só são executadas quando o senhor clica em "Confirmar". Ele nunca age sozinho e nunca lê dados de saúde. Haverá um teto de custo diário.
- **Antes de qualquer escrita:** o acesso ao painel precisa ser reforçado. Hoje há um único token compartilhado, adequado apenas para leitura. A proposta é login com conta autorizada e sessão curta.
- **Sugestões (seção 5):** status de TestFlight / App Store / Google Play, edição do aviso de versão (`app_releases`), saúde das funções do servidor, uso e cotas de IA, envios de notificações, avaliações nas lojas, calendário de vencimento de chaves, entre outras. Cada item está marcado como leitura ou escrita.
- **O que falta o senhor decidir** está na seção 8 (durações, quais ações, alcance da IA, teto de custo), cada item com a nossa recomendação.

---

## 0. Rules Cowork must follow (from the project contract)

These come from `/Users/evandrosantos/Desktop/dosetrace/CLAUDE.md` and the panel spec. They are not optional.

1. **Checklist before code.** The rows in section 7 go into `docs/specs/admin-panel.md` (as a new Phase 3 section) and the founder signs them before anything is built. "Done" means every row has evidence: a test, or a live check on a test account.
2. **Picture before code.** Every new screen (Users tab, account drawer, the confirm dialogs, AI chat, each suggestion you build) is shown to the founder first as a side-by-side HTML picture in **both themes** (the panel's light and dark tokens). Where there are options, draw each option. A text description does not count.
3. **Test first.** Every behaviour gets a failing test before the code (`__tests__/adm*.test.js` style, red then green). The full suite stays green.
4. **Never lose user data.** Nothing on the panel deletes or overwrites what a user entered. Writes merge, never clobber.
5. **AI hard line.** The AI helper only surfaces data. It never recommends a treatment, dose or protocol, never interprets a result, and never reads any user's health data.
6. **Formal Portuguese** in every PT string ("Não foi possível", never "Não deu para"). All 6 panel languages (en, es, pt, fr, de, it) stay in parity and read naturally, never word for word.
7. **Colours from the CSS tokens only** (`--bg`, `--surface`, `--ink`, ... in `web/adm.html`). No raw hex in new code.
8. **Never commit secrets.** Keys live only in Vercel / Supabase env. User e-mails are never committed (test fixtures use fake addresses).
9. **Never link DoseTrace to EvoxBiolabs** (the owner is Outcom).
10. **No push, no deploy, no SQL apply** without the founder's explicit go. Each SQL apply ships with a rollback file, the way Panels #013 and #017 did (`Admin Panel Files/0xx-rollback-functions.sql`).

## 1. Goal and scope

**The founder's request (2026-10-21, in his words as relayed):**
> In the existing admin panel, I want to grant and remove Premium for customers without going to RevenueCat; a new tab (or something similar) to manage users; and your suggestions of what else the panel should have, so I don't have to open many sites at once. Ideally an AI helper inside the panel (*"um braço de IA"*) that answers questions like "how do I see number X / where do I find information Y" and helps me do things.

**Where the panel lives:**
- Repo: `/Users/evandrosantos/Desktop/dosetrace-admin`. This is a git worktree of the main DoseTrace repo, on branch `feature/admin-panel`.
- Page: `web/adm.html`, served at https://dosetrace.io/adm. It has three tabs today: Management, Details and Contas (`tabsBar()` around line 946).
- Server: `api/adm.js`, a Vercel function at `/api/adm`. GET reads everything; one POST does the test-account marking (Panel #016).
- SQL: `supabase_admin_rpcs.sql`. Every RPC is `security definer`, with execute revoked from `anon` / `authenticated` and granted to `service_role` only.
- Spec: `docs/specs/admin-panel.md`.

**What the spec says today (this work changes it):**
- "View-only. Nothing on the panel writes data."
- "Out of scope until the founder specs them: login/password, and granting or revoking Premium." These are Phase 3, rows 3.1 and 3.2.
- One exception exists: Phase 2d. Marking test accounts is "the only write the panel may do before a real login exists".

This handoff is the input for the founder to spec Phase 3. **3.1 (login) must land before 3.2 (Premium) and before any other new write.**

**Out of scope:**
- The mobile app (`screens/`, `lib/`, `components/`, `i18n/`, `app.json`).
- Any user health data.
- Deleting accounts.
- Refunds or cancelling store subscriptions. Only Apple and Google can do those.
- Sending messages to users from the AI.

## 2. Feature A: grant and revoke Premium per user

### 2.1 Facts from the code (verified 2026-10-21)

| Fact | Where |
|---|---|
| The RevenueCat entitlement identifier is **`DoseTrace Pro`**. It did not change when the app renamed "Pro" to "Premium". | `lib/purchases.js:19` (`ENTITLEMENT_ID = 'DoseTrace Pro'`); `supabase/functions/extract-bloodwork/quota.ts:13-14` ("unchanged by the Pro → Premium rename") |
| **RevenueCat app_user_id = the Supabase `auth.users.id`** (full uuid) | `lib/purchases.js` `initPurchases(userId, email)` calls `Purchases.configure({ apiKey, appUserID: userId })`; quota.ts:64 says the same |
| After sign-out the SDK switches to an anonymous id (`$RCAnonymousID…`). **Never grant to an anonymous id.** Always grant to the Supabase id. | `lib/purchases.js` `logOutPurchases()`; spec MV-3 X4 |
| The server checks Premium itself. It never trusts the phone. It calls RevenueCat **REST v1** `GET /v1/subscribers/{id}` with `REVENUECAT_SECRET_KEY` (a Supabase Edge Function secret) and reads `subscriber.entitlements['DoseTrace Pro']`. | `supabase/functions/extract-bloodwork/quota.ts:34-86` |
| The app has a hard-coded Premium whitelist, `DEVELOPER_EMAILS` (6 addresses, including the App Review account). The server mirrors it as `PREMIUM_EMAILS`. These accounts are Premium **whatever RevenueCat says**. | `lib/purchases.js:24-31`; `quota.ts:19` |
| Inside the app, every Premium check goes through `lib/entitlement.js`. It asks the store live, and when the store is unreachable it falls back to a per-user cache that keeps the **expiration date**. | `lib/entitlement.js` `entitlementFrom` |
| The app has **no** `addCustomerInfoUpdateListener` and no `invalidateCustomerInfoCache` call. "Restore purchases" on the paywall (`screens/PaywallScreen.js:209`) is the only forced refresh. | grep over `lib/ screens/ App.js` |
| The panel already holds a RevenueCat **v2** key (`REVENUECAT_API_KEY` + `REVENUECAT_PROJECT_ID`, Vercel env). It has read access to customers, granted 2026-10-17 for Panel #019. | `api/adm.js` `fetchRevenueCat`, `fetchRevenueCatCustomers` |
| An open founder item already exists: "moving hard-coded premium accounts to RevenueCat promos" | `docs/decisions.md:417` |

### 2.2 RevenueCat endpoints (checked against the docs 2026-10-21)

**Recommended: API v2.** It is current, and its key permissions can be scoped.
- Grant: `POST https://api.revenuecat.com/v2/projects/{project_id}/customers/{customer_id}/actions/grant_entitlement`
  - Body: `{ "entitlement_id": "<entl…>", "expires_at": <ms since epoch, in the future> }`. Answers 201.
  - Permission: `customer_information:customers:read_write`.
- Revoke: `POST https://api.revenuecat.com/v2/projects/{project_id}/customers/{customer_id}/actions/revoke_granted_entitlement`
  - Body: `{ "entitlement_id": "<entl…>" }`.
  - It revokes **all active promotional grants** of that entitlement, and access ends immediately.
- Read: `GET /v2/projects/{project_id}/customers/{customer_id}`. The response includes `active_entitlements[{entitlement_id, expires_at}]`. Also read the customer's subscriptions, so the panel can tell a store subscription from a promotional one.
- In v2, `entitlement_id` is RevenueCat's **internal id** (format `entla1b2c3…`), not the lookup key `DoseTrace Pro`.
  - Resolve it once with `GET /v2/projects/{project_id}/entitlements` (permission `project_configuration:entitlements:read`), matching `lookup_key === 'DoseTrace Pro'`.
  - Store it as env `REVENUECAT_ENTITLEMENT_ID`. Then have a test fail if the lookup key ever stops matching.
- Docs: https://www.revenuecat.com/docs/api-v2/customer and https://www.revenuecat.com/docs/api-v2/entitlement

**Alternative: API v1.** These are the endpoints the founder's brief named, and they are still documented.
- Grant: `POST https://api.revenuecat.com/v1/subscribers/{app_user_id}/entitlements/{entitlement_identifier}/promotional`
  - `entitlement_identifier` = `DoseTrace%20Pro` (URL-encoded).
  - Body: `{ "end_time_ms": <ms> }`. The old `duration` field (`daily … yearly`, `lifetime`) and `start_time_ms` are marked **deprecated**, so use `end_time_ms`. Answers 201.
- Revoke: `POST https://api.revenuecat.com/v1/subscribers/{app_user_id}/entitlements/{entitlement_identifier}/revoke_promotionals`. It revokes all granted (promotional) entitlements for that identifier and answers 200.
- v1 needs a **secret** key.
- Docs: https://www.revenuecat.com/docs/api-v1/entitlements

**Rules both versions share (from the docs). They drive the UI:**
- A grant whose end time falls **within 2 hours** of an existing active promotional grant's end is ignored as a duplicate.
- To **extend**, grant again with an end time at least 2 h later.
- To **shorten**, revoke first, then grant again. The panel does this as one confirmed action, "Change end date". It must say that access drops for a moment in between.
- A grant **does not touch a store subscription**. Both run side by side.
- **Revoke removes only promotional grants.** A paid App Store / Google Play subscription, or a Lifetime purchase, **cannot be removed or refunded this way**. The panel must say so on the revoke dialog and must not offer revoke when the only source is a store purchase.
- Whitelisted accounts (`DEVELOPER_EMAILS`) stay Premium after a revoke. The panel shows the source "app whitelist" and disables revoke for them.

### 2.3 Server design

- **A new Vercel function, `api/adm-premium.js`**, kept apart from `api/adm.js`. Only this file reads the write key, and the GET path never holds write power.
- **Credentials:**
  - **New** env `REVENUECAT_WRITE_KEY`: a v2 secret key with `customer_information:customers:read_write` (plus `project_configuration:entitlements:read` for the one-time lookup).
  - Do **not** widen the existing read key, and do not reuse the Supabase `REVENUECAT_SECRET_KEY`.
  - The key never reaches the page, is never logged and is never echoed. The function has no `console.*` calls, the same rule as spec 1.3.
- **Auth:** the new admin session from section 6, and never the shared view token alone.
- **Request:**
  ```json
  { "request_id": "<uuid made by the page>", "action": "grant" | "revoke" | "change_end",
    "user_id": "<supabase uuid>", "expires_at": "<ISO, grant/change_end only>",
    "reason": "<1–200 chars, required>" }
  ```
- **Order of operations, all server-side:**
  1. Validate the body. Anything malformed → 400 and no external call.
  2. Look up the user by id through a new service-role RPC, `admin_account_card(p_user_id)`. If there is no such auth user → 404 and no RevenueCat call. **Never grant to an id that is not a Supabase account.**
  3. Idempotency: if `request_id` is already in the log, return the stored result and make no new call.
  4. Write the log row `pending`.
  5. Call RevenueCat (4 s timeout, the same as quota.ts).
  6. Re-read the customer, and store the before/after state.
  7. Mark the row `ok` or `failed` with the HTTP status.
- **Durations offered.** These are proposed, and the founder confirms them (Q1):
  - 7 days, 1 month, 3 months, 1 year, and a custom end date.
  - "Lifetime" = an end date far in the future (for example 2099-12-31). v2 has no lifetime value.
  - **To verify on the test account before building:** what the app's Settings shows for such a date, and whether `lib/entitlement.js` treats it correctly. It reads `expiresAt` and treats `null` as lifetime.
  - All dates are entered and shown in **UTC**, with the end time in the founder's local time beside it.
- **Error states. Each one gets its own message, in all 6 languages:**
  - RevenueCat 401/403: the key lacks permission.
  - 404: unknown customer.
  - 429: rate-limited. Retry after N s.
  - 5xx or timeout: "Não foi possível falar com o RevenueCat, nada mudou". Re-read the state, because a timeout may still have applied.
  - Duplicate inside the 2 h window: "a concessão já cobre essa data".
  - Revoke on a store-only, whitelist-only or never-Premium account: refused before any call, with the reason.

### 2.4 Audit log (new table)

`public.admin_actions_log`: RLS on, no policies, `select, insert` for `service_role` only. It is append-only (no update/delete grants, except the pending→final status update through a definer RPC).

| Column | Notes |
|---|---|
| `id` bigserial, `at` timestamptz | |
| `request_id` uuid **unique** | idempotency key |
| `actor` text | the admin's identity from the new login (section 6). With the old shared token it could only say "token", which is one reason auth comes first |
| `action` text | `premium_grant`, `premium_revoke`, `premium_change_end`, and later actions |
| `user_id` uuid | the target account. **No e-mail copy** (the e-mail is joined at read time, so a deleted account leaves no address behind) |
| `expires_at` timestamptz | for grants |
| `reason` text, at most 200 chars | the dialog warns: "never write health information here" |
| `before`, `after` jsonb | **plan state only**: `{premium, source, expires_at}` |
| `status` text, `http` int | `pending`, `ok` or `failed` |

**Never health data.** The existing `admin_audit_log` (test marking) stays as it is.

### 2.5 The confirm step

The dialog shows:
- the account's **e-mail** (large) and the first 8 characters of its id;
- the current plan and its source;
- the action;
- the end date (UTC and local);
- the reason field;
- for a revoke: "Assinaturas pagas na App Store / Google Play não são afetadas".

**"Confirmar" stays disabled until a reason is typed.** One click sends one request with one `request_id`. A double-click cannot send twice.

### 2.6 What the app shows afterwards (be honest in the UI)

- **Server features** (AI scan budget and other paid calls) ask RevenueCat live, so they see the change **immediately**.
- **The app itself:** the RevenueCat SDK refreshes its cached CustomerInfo about every **5 minutes in the foreground** and about every **25 hours in the background**, plus right after a purchase or restore (https://www.revenuecat.com/docs/test-and-launch/debugging/caching).
  - In practice the user sees Premium within about 5 minutes while the app is open, or on the next open.
  - Tapping **"Restaurar compras"** on the paywall forces it at once.
  - The panel tells the founder this after every success. A copyable sentence for the customer would be useful (the founder decides, Q5).
- **Revoke + offline phone:** `lib/entitlement.js` keeps Premium from its cache only while the store is unreachable and the cached end date is in the future. A revoked user who stays offline keeps Premium until they are next online. That is by design, so a paying user is never locked out offline. The panel states it.
- Making this instant needs an app change: a CustomerInfo listener, or a refresh on app focus. That is **not panel work**. List it in the main registry if the founder wants it.

### 2.7 Test accounts

- Live tests run only on **evandro1985@gmail.com** (the free test account), never on a real customer and never on the founder's main account.
- Do not use the whitelist accounts. They are Premium anyway, so a test proves nothing.
- Sequence: grant 7 days → check RevenueCat → check the app (Settings shows Premium after a restore) → change the end date → revoke → app back to free. Each step writes a log row.

## 3. Feature B: Users tab

**Build it as an evolution of the existing "Contas" tab**, not as a second list. "Rebuild = replace": there must be one place for accounts.

Contas already has search by e-mail, filters, sort and test marking (Panels #016/#018), backed by `admin_accounts_list()`.

### 3.1 Find an account

- Search by e-mail (existing), by Supabase user id (new, exact) and by RevenueCat id (new: an exact id, or an `$RCAnonymousID` with the hint "anonymous id, not an account").
- Test accounts are hidden from the main list, as today. The "Contas de teste" view stays.

### 3.2 Account card (a drawer that opens on a row)

All values come from a new service-role RPC, `admin_account_card(p_user_id)`, plus a server-side RevenueCat read. **Counts and states only.**

| Field | Source | Notes |
|---|---|---|
| E-mail, user id (copy button) | `auth.users` | |
| Created | `auth.users.created_at` (UTC) | |
| Sign-in method | `raw_app_meta_data.provider` | |
| E-mail confirmed | `email_confirmed_at` | |
| Last sign-in | `last_sign_in_at` | Spec MV-0: this changes **only on a new sign-in**. Label it "last sign-in", never "last seen" |
| Last seen | `user_devices.last_seen_at` (A-119 migration `20261021010000_one_active_device.sql`) | **not measured** until that migration is applied. Show "not measured" with the reason, never a guess |
| Platform | MV-0 rule (`platformOf` in `api/adm.js`) | iOS / Android / unknown / mixed |
| App version | `user_devices.app_version` or `push_tokens.app_version` (migration `20261022000000_app_releases.sql`) | **not measured** until applied |
| Plan + source | RevenueCat customer read | one of: Free / Premium via **App Store** / **Google Play** subscription / **Lifetime** purchase / **promotional** (with the end date and "granted from the panel on …", from the log) / **app whitelist** |
| Test account | `admin_test_kind(email)` | list / domain / rule / exception |
| Onboarded | `raw_user_meta_data ? 'onboarded_at'` | |
| History | `admin_actions_log` + `admin_audit_log` | panel actions on this account |

### 3.3 Actions

| Action | Writes? | Recommendation |
|---|---|---|
| Grant / change end / revoke Premium | yes (RevenueCat) | Feature A. Needs the founder's signature on section 7 |
| Resend the confirmation e-mail | yes (sends an e-mail to the user) | Only for unconfirmed e-mail sign-ups, through Supabase Auth's resend for `type: signup`, server-side. Logged. **Needs founder approval (Q2)** |
| Copy id; open this customer in the RevenueCat / Supabase dashboard | no | deep links for the cases the panel does not cover |
| Mark / unmark test | yes (existing) | unchanged |
| **Force sign-out** | yes | **Not recommended now.** A sign-out on the phone fires the app's SIGNED_OUT wipe (`clearLocalDatabase` + AsyncStorage). Rows not yet synced would be lost, which breaks "never lose user data". The A-119 device takeover already covers the lost-phone case. It is only possible after an app-side spec proves no data loss. **Founder decision (Q2)** |
| Delete account | — | **No.** The user deletes in the app (`delete-user`), which also gives the GDPR record |

### 3.4 No health data, by default

- The card **does not** show protocols, compounds, doses, lab results, food, weight, body measurements or notes. These are special-category health data (LGPD art. 11 / GDPR art. 9). The founder's support work does not need them.
- Today's Contas list already shows one count, `protocols_live`. Keeping counts (protocols, doses logged, labs) on the card is a **founder decision (Q3)**. We recommend at most "has ≥1 live protocol: yes/no", which is enough to help a customer who says "my data vanished" without seeing what it is.
- The panel must never offer an export of a user's records.

## 4. Feature C: the AI helper ("braço de IA")

### 4.1 What it does

- A chat panel docked on the right of `/adm` (a picture is needed: docked vs. a separate tab).
- **It answers "where / how" questions** from a built-in knowledge pack, sent as the cached system prompt:
  - the DEFS registry and the Data sources section of `web/adm.html`;
  - `docs/specs/admin-panel.md` (metric definitions and windows);
  - the team runbooks, as short excerpts curated by hand and versioned in the repo as `web/adm-ai-knowledge.md`. They cover:
    - the TestFlight steps from CLAUDE.md "TestFlight / release";
    - the `app_releases` "What the founder edits" header;
    - the Play internal-testing checks;
    - the RevenueCat promo rules (section 2.2);
    - where each store number comes from.
  - Example answer: "MRR is in Management › money cards, source RevenueCat v2 overview; Apple downloads lag about 1 day".
- **It runs only predefined read-only tools.** These are server functions that call the same service-role RPCs and APIs the panel already uses:
  - `get_metric(id, window)`
  - `list_definitions(query)`
  - `account_summary(user_id)`: the card fields from 3.2, **without the e-mail** and without health data
  - `release_status()`: the same data as suggestion M1
  - `ai_usage(window)`
  - `function_health(window)`
- **It proposes actions and never performs them.** A tool `propose_action({action, user_id, params, why})` returns a proposal card in the chat with a "Confirmar" button. The **founder's click** calls the Feature A endpoint with his own session, and the AI has no write tool at all. Proposals expire after 10 minutes.
- **It refuses** to read or reveal any user's health data, to give medical, dose or protocol advice (AI hard line), to send messages, and to act without confirmation.

### 4.2 Implementation

- **A new Vercel function, `api/adm-ai.js`**, behind the same admin session (section 6).
- **Key:** a new `ANTHROPIC_ADMIN_KEY` in Vercel env only.
  - Make it a **workspace key with no expiry**, in its own Anthropic workspace with a **monthly spend limit**.
  - The August 2026 outage came from a 30-day key expiring (memory "anthropic-key-setup"). Do not use an identity-linked key.
  - Never reuse the app's bloodwork key.
- **Model:** `claude-opus-5-5` is the current default model ($4 / $20 per M tokens).
  - Cheaper current options are `claude-sonnet-5-5` ($2 / $10) and `claude-haiku-5-5` ($0.10 / $0.50). The app's own AI features use `claude-haiku-4-5`.
  - **Model choice is the founder's call (Q4).** Confirm the id against https://platform.claude.com/docs before building.
- **API notes for the builder (current API):**
  - Use the official `@anthropic-ai/sdk` (Node).
  - Use tool use with `strict: true` tools and `tool_choice: auto`. **Forced `tool_choice` returns a 400 on Opus 5.5 / Sonnet 5.5.**
  - Thinking cannot be disabled on Opus 5.5. Set `output_config.effort: "low"` for Q&A.
  - Put the knowledge pack in a cached system block.
  - Handle `stop_reason: "refusal"`, and enable the server-side `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).
  - Use `max_tokens` around 2000 per turn and at most 6 tool rounds per question.
- **Minimal logging:**
  - The conversation lives only in the browser (`sessionStorage`) and is gone when the tab closes.
  - The server stores one row per question in `admin_ai_usage`: `at`, `actor`, input/output tokens, estimated cost, tool names called. It stores **no prompt text and no answer text**, and has no `console.*` calls.
- **Cost limits:**
  - A server-enforced daily cap (proposed **US$ 2 per day**, about 50–100 questions on Sonnet; the founder sets it, Q4).
  - At most 20 questions per 10 minutes.
  - The Anthropic workspace spend limit as a hard backstop.
  - The panel shows "cost today / cap".
- **Privacy:**
  - Tools return account summaries **without e-mail** (the model sees "this account" plus a short id). The founder already sees the e-mail on the page.
  - Sending user data to Anthropic falls under the open lawyer item "Anthropic DPA" (`docs/decisions.md:417`). Keep personal data out of prompts until that item is closed.

## 5. What else the panel should have (prioritised)

The founder currently juggles App Store Connect / TestFlight (`scripts/asc-tf-status.cjs`, `asc-appstore-status.cjs`, `asc-tf-release.cjs`), Google Play Console (`scripts/play-track-status.cjs`), RevenueCat, the Supabase dashboard and logs, the Anthropic console, the support inbox hello@dosetrace.io, and Vercel. Each row says **view** (read-only) or **write**.

### Must

| # | Item | V/W | Why |
|---|---|---|---|
| M1 | **Release status board**: latest iOS build, its TestFlight groups (internal + Early Birds), beta review state and `submittedDate`; App Store version state; Play track (internal/production), its status and rollout % | view | It replaces the most-repeated manual check. CLAUDE.md says a build is "delivered" only when this state is verified. The logic already exists in `scripts/asc-tf-status.cjs` / `play-track-status.cjs` |
| M2 | **Version notice editor** (`app_releases`, A-127, 1.3.2): `latest_version`, `min_version`, `notes`, `reason` per platform | **write** | Today the founder edits a Supabase table by hand. Guards (from the migration header): **refuse a version that is not live in that store yet** (checked through M1), `min_version` ≤ `latest_version`, `min_version` behind a second confirmation ("this locks older phones out"). All 6 note languages are shown before saving, and every change is logged. Usable only after migration `20261022000000_app_releases.sql` is applied |
| M3 | **Server function health**: invocations and errors per edge function (extract-bloodwork, parse-food, protocol-assistant, send-reminders, version-notice, wake-refresh, delete-user, apple-link) over 24 h / 7 d; the last cron run (`version_notice_runs`); version-notice "refused" lines | view | Silent failures (a missing Vault secret, an expired key) are the outages that cost the most |
| M4 | **AI usage and quotas**: daily counts from `ai_scan_usage`, `ai_food_usage`, `ai_assistant_usage`; accounts at their cap (count only); estimated Anthropic cost vs. budget | view | Cost control and early warning for the 3/20 scan cap and the food-log limits (25/day) |
| M5 | **Key and certificate expiry calendar**: Anthropic keys, the ASC API key, the Sign in with Apple client secret (`scripts/apple-client-secret.cjs`; Apple caps it at 6 months), the RevenueCat keys, ADMIN/write tokens. Only names and dates, entered by hand, never the values | view (dates are a small write) | An expired key already caused one outage |

### Should

| # | Item | V/W | Why |
|---|---|---|---|
| S1 | **Premium overview**: active subscriptions by store; active promotional grants with end dates (from RevenueCat + the log); grants ending in the next 7 days | view | Shows what Feature A has given away, so promos don't silently pile up |
| S2 | **Push and reminder health**: `notification_sends` per day, `push_tokens` by platform / app version / language, version-notice pushes (`app_release_pushes`) | view | Proves server reminders actually go out |
| S3 | **Store reviews and ratings**: the latest App Store reviews (ASC customerReviews API) and Play reviews (Play Developer API), star average per store | view | One place to read feedback. Replying is a write and stays out (Could) |
| S4 | **Crash and ANR rates**: Google Play vitals (Play Developer Reporting API); Apple through the ASC metrics the API exposes. **Confirm the source before building**, since the app has no crash SDK we found | view | Stability per release |
| S5 | **Refunds and cancellations**: RevenueCat refund / cancellation events by day | view | The founder sees refunds without opening RevenueCat. The refunds themselves stay with Apple/Google |
| S6 | **Account deletions**: count per week | view | Needs the app-side deletion record (spec MV-8 D2); until then it shows "not measured". Also explains the RevenueCat orphans (X6) |
| S7 | **Support inbox count**: unread count for hello@dosetrace.io, plus a link | view | Depends on the mail provider's API. Replying stays in the mail client, never in the panel and never by the AI |

### Could

| # | Item | V/W | Why |
|---|---|---|---|
| C1 | Device takeover stats (A-119): takeovers per week, refusals DT001/DT002/DT003 | view | Only after the A-119 migration is applied |
| C2 | Supabase project health: DB size, PITR on/off, billing banner | view | Items the founder checks by hand today (`docs/decisions.md:417`) |
| C3 | Reply to store reviews | write | Customer-facing text. Founder only, never AI-drafted without his edit |
| C4 | A daily e-mail digest of M1–M4 | write (sends e-mail) | Needs approval, since it sends a message |
| C5 | Merge `DEVELOPER_EMAILS` into RevenueCat promos | write + app change | The long-open founder item. Feature A makes it possible, but the app-side change belongs to the main registry |

## 6. Security and process requirements

1. **Upgrade admin auth before any new write.** The shared `ADMIN_TOKEN` (header-only, in sessionStorage) is **view-grade**. It has no identity, so the log cannot say who acted, and a leak gives everything. Proposed minimum:
   - **Supabase Auth sign-in** on `/adm` (the founder's own account), with **TOTP MFA required**.
   - A service-role-only allow-list table, `admin_users (user_id primary key, role text check (role in ('viewer','admin')), added_at)`.
   - Every write endpoint verifies the Supabase JWT server-side, checks the allow-list and records `actor = user_id`.
   - A short session: an access token of 1 h or less. Writes need a sign-in or MFA check within the last 15 minutes (step-up).
   - The current view token may stay for reads during the transition, but it **never** authorises a write. The Phase 2d test-marking exception moves to the new login too.
   - Stopgap only if the founder refuses a login (not recommended): a second, separate `ADMIN_WRITE_TOKEN` plus the confirm dialog. The log then records "write token", not a person.
2. **Rate limits.** These are server-enforced through a Supabase counter RPC, because Vercel functions keep no memory:
   - 30 writes per hour per actor;
   - 1 Premium action per account per minute;
   - AI as in 4.2.
3. **CSRF / origin.**
   - Bearer-header auth is not sent automatically by the browser. If a cookie session is used, add `SameSite=Strict` and a CSRF token.
   - In all cases, refuse a POST whose `Origin` is not `https://dosetrace.io`.
   - Add a Content-Security-Policy for `/adm`.
4. **No secrets in the page**, no token in a URL (the existing rule 1.2 stays), no `console.*` calls in `api/`, and `Cache-Control: no-store` on every admin response.
5. **SQL:** every new RPC and table is `security definer`, with RLS on, no policies and `service_role` only, versioned in `supabase_admin_rpcs.sql`. Apply only with the founder's go, with a rollback file and with the live checks from earlier panels (ACL, anon → 401/42501, md5 = repo).
6. **Process:**
   - signed checklist (section 7) in `docs/specs/admin-panel.md` before code;
   - a picture of every new screen and dialog, both themes, before code;
   - tests first;
   - 6-language parity;
   - the full suite green;
   - live tests on the test account only;
   - **push and deploy only with the founder's go** (push + deploy together, then the live test, as in Phase 2.1).

## 7. Acceptance checklist (to add to `docs/specs/admin-panel.md` as Phase 3)

Status legend as in the spec: `[ ]` not started, `[~]` code done, not verified, `[x]` verified with evidence.

### 3.1 Admin login (prerequisite)

| ID | Criterion | Status | Evidence |
|---|---|---|---|
| AU1 | `/adm` requires Supabase sign-in plus TOTP; an account not in `admin_users` sees "not authorised" and gets no data | [ ] | test + live check |
| AU2 | Every write endpoint returns 401 without a valid JWT, 403 for a non-allow-listed or viewer user, and 401 for the old `ADMIN_TOKEN` alone | [ ] | tests |
| AU3 | A write more than 15 min after the last sign-in or MFA asks for MFA again (step-up) | [ ] | test |
| AU4 | A POST with a foreign `Origin` → 403 before anything else | [ ] | test |
| AU5 | `admin_users` has RLS on and service_role only; anon → 401/42501 | [ ] | live SQL check |

### 3.2 Feature A: Premium

| ID | Criterion | Status | Evidence |
|---|---|---|---|
| PR1 | `api/adm-premium.js` is the only file that reads `REVENUECAT_WRITE_KEY`; the key never appears in a response, page or log; `grep -c console. api/adm-premium.js` = 0 | [ ] | static test |
| PR2 | Body validation: `action` ∈ {grant, revoke, change_end}; `user_id` is a uuid; `expires_at` lies in the future and within the offered range; `reason` is 1–200 chars; `request_id` is a uuid. Otherwise → 400 and no external call | [ ] | tests |
| PR3 | A `user_id` that is not in `auth.users` → 404, with no RevenueCat call; an `$RCAnonymousID` is refused | [ ] | tests |
| PR4 | Grant calls v2 `grant_entitlement` with the resolved `entitlement_id` (lookup key `DoseTrace Pro`) and `expires_at`; the re-read shows the entitlement active until that date | [ ] | test with a mocked RevenueCat + live check on the test account |
| PR5 | Revoke calls `revoke_granted_entitlement`; it is refused before any call when the account's only Premium source is a store purchase, Lifetime or the app whitelist, with that reason shown | [ ] | tests |
| PR6 | Change end date = revoke then grant, under one `request_id`, with one log row; the dialog warns about the brief drop | [ ] | test |
| PR7 | Idempotency: the same `request_id` sent twice → one RevenueCat call and the same answer | [ ] | test |
| PR8 | Every action writes one `admin_actions_log` row (actor, action, user_id, expires_at, reason, before/after plan state, status, http); no health field exists in the table | [ ] | SQL + test |
| PR9 | Error states (401/403, 404, 429, 5xx/timeout, a duplicate inside 2 h) each show their own message in 6 languages; after a timeout the state is re-read before anything is reported | [ ] | tests + render |
| PR10 | The confirm dialog shows the e-mail, short id, current plan and source, action, end date (UTC + local) and the note "store subscriptions not affected"; Confirm stays disabled until a reason is typed; a double-click sends one request | [ ] | render both themes + test |
| PR11 | After success the panel says when the app will show it (≈5 min open / next open / "Restaurar compras" now) | [ ] | render |
| PR12 | Live, on evandro1985@gmail.com only: grant 7 d → the app shows Premium after "Restaurar compras" → change end → revoke → the app is free again; 3–4 log rows | [ ] | founder device check |
| PR13 | The "lifetime" end date displays correctly in the app's Settings and in `lib/entitlement.js` (verified before the option ships) | [ ] | device check |

### 3.3 Feature B: Users tab (Contas evolved)

| ID | Criterion | Status | Evidence |
|---|---|---|---|
| US1 | Search works by e-mail (existing), exact Supabase id and exact RevenueCat id; an anonymous RC id shows "anonymous id, not an account" | [ ] | tests |
| US2 | The card shows the fields in 3.2. "Last seen" and "App version" show "not measured" with the reason until their migrations are applied | [ ] | test + render |
| US3 | The plan source is one of: free / App Store sub / Google Play sub / Lifetime / promotional (end date) / app whitelist, matching RevenueCat for 3 test accounts | [ ] | live check |
| US4 | `admin_account_card` returns no protocol, dose, lab, food, weight or body field (a static test lists the allowed keys) | [ ] | static test |
| US5 | Actions shown: Premium (A), copy id, dashboard links, test marking; "resend confirmation" only if Q2 = yes and only for unconfirmed e-mail accounts; no force sign-out, no delete | [ ] | render + test |
| US6 | Test accounts stay out of every number and out of the main list (existing TM8 still green) | [ ] | existing tests |
| US7 | Labels in 6 languages (parity test), tokens only, desktop + 390 px with no horizontal scroll, both themes | [ ] | parity test + screenshots |

### 3.4 Feature C: AI helper

| ID | Criterion | Status | Evidence |
|---|---|---|---|
| AI1 | `api/adm-ai.js` requires the admin session; `ANTHROPIC_ADMIN_KEY` is used only there and never reaches the page | [ ] | tests |
| AI2 | Only the listed read-only tools exist; no tool can write; a static test fails if a tool calls `admin_mark_test`, `adm-premium` or any write RPC | [ ] | static test |
| AI3 | `propose_action` only renders a card; the action runs only through the founder's click on the Feature A endpoint; a proposal expires after 10 min | [ ] | test + render |
| AI4 | Tool outputs contain no e-mail and no health data (allowed-keys test) | [ ] | static test |
| AI5 | Eval set of 20 questions answered correctly from the knowledge pack (e.g. "where do I see Apple downloads", "how is activation counted", "how do I put a build on TestFlight for Early Birds") | [ ] | eval run, results in a note |
| AI6 | Refusals: asking for a user's doses or labs, for dose advice, or to "just grant it" without confirmation → refused, and nothing happens | [ ] | eval |
| AI7 | `admin_ai_usage` stores tokens, cost and tool names only, never prompt or answer text; no `console.*` | [ ] | SQL + static test |
| AI8 | The daily cost cap and the 20 per 10 min limit are enforced server-side; at the cap the chat says so and makes no API call | [ ] | tests |
| AI9 | Model id confirmed against the current docs at build time; refusal `stop_reason` handled | [ ] | test |

## 8. Open questions for the founder (real preferences only)

Each question is in Portuguese, with our recommendation.

1. **Durações do Premium.** Quais opções o painel deve oferecer?
   *Recomendação:* 7 dias, 1 mês, 3 meses, 1 ano, data personalizada e "vitalício" (data de término em 2099). "Vitalício" entra somente depois do teste PR13 no aparelho.
2. **Ações na aba Usuários.** Além do Premium, o senhor deseja "reenviar e-mail de confirmação"? E "forçar saída"?
   *Recomendação:* sim para reenviar (só para contas por e-mail não confirmadas, com registro). Não para forçar saída por ora, pelo risco de perda de dados não sincronizados no celular.
3. **Contagens de dados de saúde no cartão da conta.** Mostrar nenhuma, apenas "tem protocolo ativo: sim/não", ou as contagens (protocolos, doses, exames)?
   *Recomendação:* apenas "tem protocolo ativo: sim/não".
4. **Assistente de IA: alcance, modelo e teto de custo.**
   - *Alcance recomendado:* responder "onde/como", consultar números e status, e propor ações para o senhor confirmar. Nunca executar sozinho.
   - *Modelo:* `claude-opus-5-5` é o padrão atual e o mais capaz desta lista. `claude-sonnet-5-5` custa a metade. `claude-haiku-5-5` é o mais barato. A escolha é sua. Sugerimos começar com o Sonnet, avaliar com as 20 perguntas (AI5) e trocar se a qualidade não for suficiente.
   - *Teto:* US$ 2 por dia e limite mensal de US$ 30 no espaço de trabalho da Anthropic.
5. **Mensagem ao cliente após conceder Premium.** O painel deve exibir um texto pronto para o senhor copiar ("Abra o app e toque em Restaurar compras")?
   *Recomendação:* sim, nos 6 idiomas. O envio continua sendo feito pelo senhor.
6. **Ordem das sugestões.** Confirma esta ordem?
   *Recomendação:* login (3.1) → Premium (A) → aba Usuários (B) → M1 status de versões → M2 aviso de versão → M3–M5 → assistente de IA (C) → itens "Should". O assistente vem depois porque responde melhor quando as telas que ele explica já existem.

---

**Key files for Cowork:**
- Admin panel: `/Users/evandrosantos/Desktop/dosetrace-admin/web/adm.html`, `/Users/evandrosantos/Desktop/dosetrace-admin/api/adm.js`, `/Users/evandrosantos/Desktop/dosetrace-admin/supabase_admin_rpcs.sql`, `/Users/evandrosantos/Desktop/dosetrace-admin/docs/specs/admin-panel.md`
- Premium in the app and on the server: `/Users/evandrosantos/Desktop/dosetrace/lib/purchases.js`, `/Users/evandrosantos/Desktop/dosetrace/lib/entitlement.js`, `/Users/evandrosantos/Desktop/dosetrace/supabase/functions/extract-bloodwork/quota.ts`
- Tables mentioned: `/Users/evandrosantos/Desktop/dosetrace/supabase/migrations/20261022000000_app_releases.sql`, `/Users/evandrosantos/Desktop/dosetrace/supabase/migrations/20261021010000_one_active_device.sql`, `/Users/evandrosantos/Desktop/dosetrace/supabase/migrations/20261003000000_ai_assistant_usage.sql`, `/Users/evandrosantos/Desktop/dosetrace/supabase_notification_sends_table.sql`
- Release scripts: `/Users/evandrosantos/Desktop/dosetrace/scripts/asc-tf-status.cjs`, `/Users/evandrosantos/Desktop/dosetrace/scripts/asc-appstore-status.cjs`, `/Users/evandrosantos/Desktop/dosetrace/scripts/play-track-status.cjs`
