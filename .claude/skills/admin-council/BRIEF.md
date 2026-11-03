# Admin Council — shared brief (read first)

## The client and the job
Evandro (founder of DoseTrace, owner Outcom) hired this council as if it were a firm that structures
companies for investors. His words (2026-11-02, dictated): "estar pronto caso o investidor apareça e
queira números, gráficos, resultados, e que eu possa mostrar isso de jeito fácil, de dentro de um
painel administrativo. Preciso que fique claro: quantos clientes reais estão instalando; quantos estão
pagando; quantos estão fazendo teste; quantos foram convertidos; por onde o cliente veio (clique,
Instagram, TikTok); o resultado de cada plataforma e quais plataformas devo ter."
The deliverable is the admin panel at dosetrace.io/adm (one page: web/adm.html; API api/adm*.js;
SQL supabase_admin_rpcs.sql; checklist docs/specs/admin-panel.md). The founder decides; the council
advises. Claude is the account director and speaks to the client.

## The product in one paragraph
DoseTrace: a personal journal + pure-math calculator for people who take injectable or oral compounds
(doses, vials, lab results, estimated blood level curve). iOS + Android, version 1.3.1 live in both stores
since 2026-11-02. About 40 real accounts, 126 test accounts, 1 active subscription, MRR US$ 3. Premium
plan (monthly / yearly / lifetime planned) through RevenueCat. Marketing started today: Instagram +
TikTok carousels scheduled 03–09 Nov, no paid ads in month 1, no attribution of any kind yet.

## Hard rules every proposal must respect
- The panel NEVER shows health data (no doses, compounds, lab values, protocols). Counts and dates only.
- Test accounts never appear in any number (one list: admin_test_accounts + domain rule + Gmail rule).
- RevenueCat ids are not customers (sign-outs and deleted accounts create extra ids). Store downloads
  are shown as their own line, never as the base of the account funnel.
- Never estimate: a number that is not measured says "Não medido — motivo".
- Apple/Google/RevenueCat numbers include test installs/purchases and are labelled "inclui teste".
- Analytics events are anonymous since 2026-10-04 (no account on events). Any per-person metric needs
  another source. "Last seen" per device arrives with the app's user_devices table (1.3.2, not live).
- The app has no referral/UTM/attribution code at all (grep done 2026-11-02). Store links in the bio and
  posts carry no campaign parameters yet.
- Privacy: GDPR/LGPD; health-adjacent app; iOS ATT limits attribution; the founder has no lawyer yet.
- Everything the founder approves is built test-first, shown as a picture before building, and
  proven on his phone (S25) as well as in the browser.

## What already exists in the panel (do not re-propose)
Summary: real customers, new accounts 7/30/90 days by platform, MRR, activation (dose within window),
funnel signed_up → confirmed → onboarded → protocol → dose, RevenueCat reconciliation, store downloads
(Apple daily reports cached; Google Play bucket CSVs), new accounts per day. Details: totals,
adherence, biomarkers, audience, RevenueCat metrics, stores. Accounts: search, filters, sort, bulk
mark-as-test, account card, Options (grant/change/revoke Premium, send/withdraw team message, copy id,
open RevenueCat/Supabase, mark test, resend confirmation). Data-sources glossary. Phone layout and a
private Android app with biometrics.

## Already decided and queued (do not re-propose)
M1 release board; M2 version-notice editor; M3 edge-function health; M4 AI usage/quota/cost; M5 expiry
calendar; 3.4 AI assistant over the panel; PR13 lifetime Premium; V4 server snapshot; V5 push
"numbers updated"; L4 phone Accounts compaction.

## What the previous review (2026-11-02, three roles) already found — your starting point
Read ~/Desktop/Second Brain/dosetrace/admin-panel/notas-de-trabalho/020-revisao-tres-papeis-2026-11-02.md
(17 improvements, 5 debts) and 021-painel-para-investidor-conselho-2026-11-02.md (the request and the
facts already known). Build on them; do not repeat them as if new.

## How to answer in round 1 (needs assessment)
Portuguese, formal register (never "a gente", "dá para"), plain words, no flattery. Through your lens
only. Deliver: (1) the questions the panel must answer for YOUR audience (investor, founder, marketer),
ranked; (2) for each, the exact definition of the number, the source that exists today or the
instrumentation missing (say which, from the brief), and effort S/M/L; (3) at most 3 questions for the
founder that only he can answer (taste, money, risk, scope), never something already in the brief;
(4) one thing to NOT build. Max 1 page.
