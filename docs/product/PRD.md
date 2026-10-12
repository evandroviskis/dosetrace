# DoseTrace — Product Requirements Document (PRD)

- Version: draft 1 for founder review, written 2026-10-12 (founder request 2026-10-12: "Quero isso feito, mas sem cortar caminhos. Sem nada curto se pode ser mais detalhado.").
- Code state described: branch `redesign/graduated`, code as of `976ef9e` / `4dade55` (A-118); only documentation changed between that commit and `6591fa4` (the round-2 registers), so every code line cited is current. Store version in preparation **1.3.0**. No code was changed to write this document.
- Companion documents: `docs/product/TRD.md` (architecture, data model, the single owner of every derived state), `docs/product/flows/*` (drawn journeys), `docs/product/OPEN-DECISIONS.md` (the single list of founder questions, with the AD / DL decisions applied here) and `docs/product/DIVERGENCES.md` (the single register of defects; every gap in §6 points to its DV row, and every DV row is reached from §6). Reconciled with both on 2026-10-12, again after verification round 2.
- **Verification status (2026-10-12, two independent rounds applied to this PRD).** Round 1: `docs/product/verification/00-mechanical.md`, `00b-diagrams.md`, `01-protocols.md`, `02-doses-today.md`, `03-reminders.md`, `04-food-reality-progress.md`, `05-curve-body-account.md`, `06-platform-trd.md`, `07-consistency.md`. Round 2: `docs/product/verification/round2/R2-01…R2-07` (R2-03 is the PRD report) and `docs/product/verification/round2/id-map.md`, the single source for every id whose status changed. Authority: the founder's own lines in `docs/decisions.md`; coordinator, "by logic" and council blocks are not founder answers (§0.2). Round 1 applied about 180 corrections to requirements, loops, contracts and gap rows and added 18 gap rows (G-138…G-155). Round 2 applied every R2-03 finding that held when re-checked in the code or the ledger (findings that did not hold were not applied); re-cited every OPEN / AD / DL / DV id with its final status (a moved id is replaced by its destination, a withdrawn id is shown only as withdrawn, a closed OPEN item is cited by the AD / DL that closed it, an item that is now an OPEN question is described as waiting for the founder); and added **78 gap rows (§6.10, G-156…G-233)** so that every row of `DIVERGENCES.md` is reachable from this PRD. Register counts after round 3 (2026-10-12): **23 OPEN questions open** (OPEN-01…OPEN-11, OPEN-13…OPEN-24), **62 AD in force**, **87 DL in force** (DL-99…DL-101 added in round 3), **231 active DV rows** (15 S1, 103 S2, 44 S3, 69 S4; plus 3 ops items, 4 merged rows and 3 closed rows). Key decisions as applied: the lapsed-payer grace week is logging only (AD-14; decisions.md:274, FL-41); Android Apple sign-in is live (`STATE.md:17`), its client secret expires 2027-04-04 (DV-211, an ops item) and the button must use Apple's artwork (AD-74); notification "Mark complete" writes the tap time for today's slot (DL-10, decisions.md:153); the Today tracker streak counts days as built, and its unit and words wait for the founder (OPEN-17); the interval is "Every day / Custom N" with no presets (AD-66); the vial prompt has two buttons; a dose on the slot's own local day belongs to that slot (AD-70); protocols with no reminder time use 08:00 everywhere (DL-77); Settings › Notifications is red on any readable block, as signed (AD-71); Delete forever keeps the identity the founder-approved migration defines (AD-67); notifications fall back to English for users who never picked a language (G-77). Mechanical check: every backticked repo path in this PRD exists (no PROPOSED paths are needed); this PRD has no mermaid blocks. Not changed here: TRD, flows, the registers and the Portuguese message (other owners).
- Authority order when sources disagree (CLAUDE.md, decisions ledger): (1) the founder's latest written decision in `docs/decisions.md`; (2) the founder-signed checklist rows in `docs/specs/*.md`; (3) the approved prototype `docs/design/prototype.html` (the "Sam Carter" version, binding for look, order and behaviour unless a later decision says otherwise, decisions.md:34); (4) current code behaviour, used only where no decision exists and always labelled as such.

---

## Contents
0. How to read this document (identifiers, source tags, status markers, glossary)
1. Product summary — what DoseTrace is and is not, users, platforms, Free vs Premium (every limit), prices, languages, release model
2. Principles P-1…P-30 (each with its decision date)
3. Core loops L-1…L-11 (end-to-end user stories)
4. Feature specifications — 4.1 Onboarding, account, gates · 4.2 Today, doses, Dose log · 4.3 Protocols and supply · 4.4 Reminders and notifications · 4.5 AI food log · 4.6 Reality check, Progress, Your numbers, weigh-ins, target · 4.7 Dose accumulation and Journey · 4.8 My Body · 4.9 Settings · 4.10 Premium and the paywall · 4.11 Book layout on the Fold · 4.12 AI features · 4.13 Privacy and data · 4.14 App-wide UI, numbers, dates, language
5. Cross-feature contracts C-1…C-40
6. Known gaps G-1…G-233 (with dossier pointers and the DV row of each; G-138…G-155 added by verification round 1, G-156…G-233 by round 2 so that every `DIVERGENCES.md` row is reachable)
7. Founder decisions → `OPEN-DECISIONS.md` (canonical OPEN-xx / AD-xx / DL-xx; 23 open questions)
Appendices — A sources · B what this PRD does not decide · C sign-off

---

## 0. How to read this document

### 0.1 Requirement identifiers
Every user-visible behaviour is a numbered requirement `PRD-<AREA>-<n>`. Areas:

| Area | Chapter | Area | Chapter |
|---|---|---|---|
| ONB | 4.1 Onboarding | REM | 4.4 Reminders & notifications |
| AUTH | 4.1 Sign-in / sign-up / reset | FOOD | 4.5 AI food log |
| GATE | 4.1 Profile and 18+ gates | RC | 4.6 Reality check |
| ACCT | 4.1 Sign-out, delete account | PROG | 4.6 Progress / Your numbers / weigh-ins / target |
| TODAY | 4.2 Today screen | CURVE | 4.7 Dose accumulation |
| DOSE | 4.2 Marking doses, site question, Undo | JOUR | 4.7 Journey dashboard |
| LOG | 4.2 Dose log | BODY | 4.8 My Body (labs, vaccines, hub) |
| PROT | 4.3 Protocols | SET | 4.9 Settings |
| VIAL | 4.3 Vials, bottles, supply | PREM | 4.10 Premium & paywall |
| FOLD | 4.11 Book layout | AI | 4.12 AI features (shared rules) |
| DATA | 4.13 Privacy & data | UI | 4.14 App-wide UI, numbers, dates, language |

Cross-feature contracts are `C-<n>` (§5). Known gaps are `G-<n>` (§6) and point to dossier IDs and to their row `DV-<n>` in `DIVERGENCES.md`. Founder questions and decisions use the canonical IDs of `OPEN-DECISIONS.md`: `OPEN-xx`, `AD-xx`, `DL-xx`.

### 0.2 Source tags (every requirement carries one or more)
- `[D 2026-10-02 #178]` — a founder decision in `docs/decisions.md`, with its decision date and the ledger line number (line numbers as of 2026-10-12).
- `[FL-41]`, `[PO-14]`, `[MB-3]`, `[PA-9]`, `[AP-18]`, `[BK-10]`, `[FR-2]`, `[RC-6]`, `[EA-3]`, `[BR-12]`, `[RG-5]`, `[SP-6]`, `[FX-23]`, `[RL-2]` — a row of a signed checklist in `docs/specs/` (food-log, progress-one-card, my-body, premium-and-auth, ai-protocol-assistant, book-layout, fold-right-page, reminder-check, exact-alarms, background-refresh, reminders-guaranteed, reminder-setup-placement, fixes-1.2.5, release-1.2.5).
- Caution (verification round 1, `verification/07-consistency.md` §3; round 2, `verification/round2/R2-03-prd.md` #17): some ledger lines cited with `[D …]` are coordinator ledger / logic lines, not founder answers. The whole blocks are decisions.md:445-461 (resolved by the ledger + product logic, 2026-10-03), :469-484 (Premium + onboarding / auth build), :485-509 (AI protocol assistant by logic and by the ledger, 18+ confirmation, pre-build pass, ended protocols and the purge, cross-account guard), :519-530 (positive tombstones; the founder approved only applying the migration, :531), :533-548 (dt-council 1.3.0 synthesis, "no question to the founder"), :580-583 (store prints by logic), :599 ("By logic … founder may override") and :644 onward (the 2026-10-12 DL section and its round-2 status notes); also the conflict notes :429-430 (Conflicts 28-29). A `[D …]` tag on any of them means "recorded in the ledger", not "the founder said"; each such topic is cited through its canonical AD / DL / OPEN id where one exists, and the founder may override it like any DL. Requirements whose tags point into these blocks include PRD-ONB-13, PRD-AUTH-13/14, PRD-PREM-7 (#472-477), PRD-GATE-1 (#456), PRD-UI-2 (#448), PRD-PROT-62/80-84/100-106, PRD-AI-4/5/32-34 (#487-#494), PRD-DATA-20/21 and PRD-UI-4 (#547).
- `[A-118]`, `[S-25]`, `[F-035]` — a row of the registry `docs/review/features.md`. (A-118, the founder's 2026-10-09 bug report, is in features.md:258; the rule that follows from it is DL-25, and decisions.md:764 records its status.)
- `[CLAUDE.md]` — a standing rule in the project contract.
- `[code]` — **current code behaviour, no founder decision exists**. Kept as the requirement until the founder says otherwise; listed so the code sweep does not "fix" deliberate behaviour by accident.
- `[logic]` — decided in this PRD by product logic under the 2026-10-03 rule "decide what is already decided" (decisions.md:351). Each `[logic]` item states its one-line reason; where it is a product decision it carries its canonical `DL-xx` (OPEN-DECISIONS.md), and every DL is recorded in `docs/decisions.md` (2026-10-12 section). The founder may override any of them.
- Dossier references `01:D-13`, `02:G1`, `04:D-7` … point to `docs/product/research/0N-*.md` (D = divergence in the state-ownership audit, G = gap, R = rule, E = edge case).

### 0.3 Status markers
- A requirement **with no marker** matches the code as read by the dossiers (built). "Built" is not "device-verified": the device evidence status lives in the spec rows; `node scripts/spec-audit.cjs` on 2026-10-12 **fails with 31 blocking criteria** (book-layout BK-1…BK-22, BR-9/BR-10, EA-7, FR-6, RL-1, SP-9, RG-6/RG-7/RG-8; premium-and-auth and admin-panel checklists unsigned — two warnings, not failures — and fold-right-page read as signed through a parser defect, DV-229) (08 §9).
- `→ GAP G-n` — the code does not do what the requirement says; §6 has the dossier pointer.
- `→ OPEN-xx` — the requirement cannot be finalised without a founder answer (`OPEN-DECISIONS.md`). Until answered, the current code behaviour stays.
- `→ AD-xx` / `→ DL-xx` — decided (AD = by the ledger or a signed spec; DL = by product logic, founder may override). Build to the decision; where the sentence still describes today's code, the defect is the DV row of the gap.
- `Approvals item n` — a founder action that is not a question (a production go, a wording approval in 6 languages, a picture, a signature, a download), listed in OPEN-DECISIONS.md "Approvals still owed".
- `UNVERIFIED` — could not be proven from the repo (device behaviour, live cloud state, OS behaviour, founder intent).
- Moved, withdrawn or closed ids (verification rounds 1 and 2, 2026-10-12) — a moved id is cited by its destination (e.g. AD-44 → OPEN-18 (4), AD-12 → DL-25, DL-01 → AD-76, AD-45 → OPEN-22 (a)); a withdrawn id is named only as withdrawn (e.g. DL-73); a closed OPEN item is cited by the AD / DL that closed it (e.g. OPEN-12 → AD-68, OPEN-19 (a) → AD-70, OPEN-21 (1)…(10) → DL-85…DL-97); an item that is now an OPEN question waits for the founder and is never described here as decided. Final statuses: `verification/round2/id-map.md`. Until an OPEN is answered, the current code behaviour stays.
- `PROPOSED` — a file path or function that does not exist in the repo today; it names the target owner for the code sweep.

### 0.4 Glossary — one term per concept (CLAUDE.md "one term per concept", decisions.md:86)
| Concept | The one term (EN UI) | Notes and other languages |
|---|---|---|
| A thing the user takes on a schedule | **protocol** | One row per run; a Restart creates a new run. |
| The substance named in a protocol | **compound** | Never "medicine" (AP-35, decisions.md:494). |
| A dose recorded as done | stored outcome `Taken`; UI word **Complete** ("Mark complete", "Dose complete", "{x} of {y} complete") | decisions.md:97-100; Today button short forms ES "Completar", PT "Concluir", FR "C'est fait", DE "Erledigt", IT "Completa" (decisions.md:98). "Taken" is never shown as a status word (decisions.md:100). |
| A dose deliberately not taken | **Skipped** (neutral colour) | DE uses one verb "auslassen / ausgelassen" for doses (decisions.md:500). |
| A past slot nobody answered | **Missed** (risk red) | Written only by the Missed scan (01 §4, 02 R12). |
| Yesterday's unanswered slot still inside slot + 12 h | **Pending from yesterday** | decisions.md:155. |
| A user's reconstituted or ready-to-use container | **vial**; oral container = **bottle** | FR "Flacons" (decisions.md:90). |
| The estimated amount of compound in the body | **Est. level** on the **Dose accumulation** screen | Never "blood level", never "your level will be" (decisions.md:111-112). |
| The 21-day measured-maintenance feature | **Reality check** | PT "Seus números reais", ES "Tus cifras reales", FR "Vos vrais chiffres", DE "Deine echten Zahlen", IT "I tuoi numeri reali" (decisions.md:87). |
| The measured/estimated calories per day | **Daily burn** (TDEE / maintenance; never BMR) | decisions.md:126. |
| Lose / Maintain / Gain calories | **Your daily plan** | Specs call it "Your goal"; the string `cal_overview_title` is unused (04 §1). |
| A dated weight entry | **weigh-in** | One row per local day (decisions.md:230). |
| The Journey screen behind the Progress tile | **Progress** (screen title "Your progress") | The reality check lives inside it (decisions.md:218). |
| Weight / body-fat target | **Your target** | Distinct from profile goals (04 §1). |
| Onboarding / Settings multi-select of aims | **goals** (18, alphabetised) | Feed no math (04 §1). |
| The AI chat that logs food | **AI food log** | decisions.md:217. |
| Lab section of My Body | **Lab test journal** | FR "Bilan sanguin", DE "Blutwerte" (decisions.md:90). |
| Vaccine section | **Vaccine journal** | |
| The paid plan | **Premium** (never "Pro") | RevenueCat entitlement id stays `DoseTrace Pro` (decisions.md:24). |
| The 7 free food-log days | **free days** | Code calls it `mode: 'trial'`; never call it a "trial" in UI — the store trial is a different concept (07:D-6). `[logic = DL-61]` → G-219 |
| The store's 7-day introductory offer | **free trial** | Only claimed when the store says eligible (PA-9). |
| A popup in DoseTrace style | **DoseTrace sheet** | Replaces native alerts everywhere (decisions.md:45). |
| Unfolded-foldable two-page mode | **book layout** (left page / right page) | decisions.md:78-80. |

---
## 1. Product summary

### 1.1 What DoseTrace is
DoseTrace is a **private health journal plus a pure-math calculator** for adults who self-manage peptides, testosterone / AAS esters, GLP-1s, HGH and supplements (decisions.md:20, :169; CLAUDE.md "Product guardrails"). Store name "DoseTrace: Health Journal"; EN App Store subtitle "Peptides, labs. No advice"; Play short description "Private journal: peptides, supplements, labs, vaccines & body. Never interprets." (decisions.md:21-23).

It does six jobs, all on the user's own data:
1. **Record what is taken** — protocols (what, how much, how often, from which vial or bottle), each dose as Complete / Skipped / Missed with an optional injection site (chapters 4.2, 4.3).
2. **Calculate, never advise** — the reconstitution calculator ("Draw to N units" on a syringe drawn to scale), oral serving math, supply and vial-window math, the energy calculator (daily burn by formula), the Dose accumulation estimate (published half-lives × the planned schedule) (4.3, 4.6, 4.7).
3. **Remind** — local dose reminders that keep coming for as long as the protocol exists, with checks that the phone is not silently blocking them (4.4).
4. **Measure the body honestly** — weigh-ins, Your numbers, Your target, and the 21-day reality check that turns real food intake (AI food log) plus real weight change into a **measured** daily burn (4.5, 4.6).
5. **Keep records** — a Lab test journal and a Vaccine journal, scanned by AI that only transcribes, or typed by hand (vaccines: built; lab values: approved 2026-09-30, never built — registry F-070 "Shipped" is wrong → AD-68, ships in 1.3.0, picture first; DV-107) (4.8).
6. **Export and share on the user's terms** — CSV (free), PDF (Premium), the full "Download my data" JSON, and an adherence report preview "This is exactly what your provider will receive" (decisions.md:308).

The flagship is **Dose accumulation** (the serum curve): App Store screenshot 01, the website's first landing shot, Premium, showcased with an example hero (decisions.md:29, :279, :349).

### 1.2 What DoseTrace is not (the regulatory line)
These are hard product limits, not preferences. Each is a requirement of every chapter.

| Never | Source |
|---|---|
| Interprets, diagnoses, recommends or advises — on doses, treatments, protocols, food, labs or vaccines | CLAUDE.md; decisions.md:20, :28, :169 |
| A drug-interaction checker ("KILL forever") | decisions.md:169 |
| Suggests numeric doses: no pre-filled dose values, no auto-selected goals; the only preset is picking a compound name | decisions.md:170 |
| Lets an AI feature do anything but transcribe or surface the user's own data; never recommends a treatment, dose or protocol change; never diagnoses or interprets a result; never says "do X to make a compound work better" | AI HARD LINE 2026-09-10, decisions.md:316 (Apple Guideline 1.4.1 / Software-as-a-Medical-Device defence) |
| Lets the AI write any sentence the user reads (the AI returns data only; the app writes every sentence in 6 languages) | decisions.md:318 |
| Shows ranges, "out of range", colours, arrows or verdicts on lab or vaccine data | decisions.md:266, :127 |
| Calls a dose high, low, safe or unsafe; gives a water amount when a dose does not fit | decisions.md:186, :325 |
| Links body metrics to dosing or nutrition to a drug's outcome | decisions.md:242 |
| Says the Est. level is a blood level or "your level will be" | decisions.md:111 |
| Makes outcome/efficacy claims in marketing or says data "stays on your device" | decisions.md:125, :385 |
| Is linked to EvoxBiolabs (the owner is Outcom) | decisions.md:19 |
| Becomes a medical/doctor product; that would be a separate company or app linked only by a consent bridge | decisions.md:28 |

Every advice-shaped request to an AI feature gets a fixed, app-written deflection card in 6 languages ("cannot advise; ask a healthcare provider"), never model text (decisions.md:320). Where the app points a person somewhere, it points to "a health professional" / "your healthcare provider" (decisions.md:316, :494). (Conflict #13 — "point to gyms, not doctors" from ~2026-07 — is superseded by the AI hard line: users are pointed to "a health professional" (AD-61); a gym body-composition scan is a measurement source the user brings, not advice (DL-96).)

### 1.3 Target users
| Segment | What they need | Evidence |
|---|---|---|
| Peptide users (BPC-157, TB-500, GHK-Cu, blends such as KLOW / Glow / Wolverine) who reconstitute lyophilized powder | Exact draw on an insulin syringe; vial window; doses left; site rotation; reminders | 01 §1; decisions.md:205 |
| TRT / AAS users on long-interval esters (cypionate weekly, undecanoate every ~12 weeks) | Custom intervals, ready-to-use vials, ml syringes (2/3/5 ml), Dose accumulation with absorption | decisions.md:185, :200, :203 |
| GLP-1 users (semaglutide, tirzepatide, retatrutide) | Weekly reminders, curve, weigh-ins, reality check | 01 §1; F-029 audience note |
| Supplement users (capsules, tablets, softgels, gummies, powders, liquids) | Oral serving math, bottle supply, daily reminders that never stop (the 180-capsule vitamin) | decisions.md:598 |
| Lay users who get stuck in the calculator | "Dose per injection" label, the "why it doesn't fit" explainer, the optional AI protocol assistant (a real customer typed her weekly 240 mg as one injection) | ai-protocol-assistant.md purpose; decisions.md:183-184 |
| People who started before installing the app ("started my compound weeks ago") | Past start date, "Same dose for the last N weeks?", the estimated pre-install curve, no false Missed rows | decisions.md:198; A-30, A-32 |
| People who care about body composition while on GLP-1 / TRT | AI food log (7 days in a row) → reality check (21 days) → measured daily burn | decisions.md:213 |
| People who keep lab and vaccine records | Scan or type, chart their own values, export for a provider | 06 §1 |
| Adults only | Birth year ≥ 18 years ago; old under-18 accounts confirm once | decisions.md:300, :482 |
| Business goal | 20–50k users in 5 years, no revenue need, 100 % reinvested; Brazil and the EU are launch targets (6 languages) | decisions.md:27, :85 |

Few users today and no ads yet (decisions.md:343, memory "release-full-no-staging"). The competitor to watch is "Dose Track" (peptide/TRT/GLP-1 tracker with AI and PK curves) (decisions.md:26).

### 1.4 Platforms
| Platform | Status | Rules |
|---|---|---|
| iPhone (iOS 16+) | Primary | Bundle `io.outcom.dosetrace`; `supportsTablet: false` (no iPad layout; DL-70); 6 languages declared in `CFBundleLocalizations` [RL-3]; no background reminder refresh on iOS (by an earlier decision; BR-11) → OPEN-06. |
| Android phones | Primary | Package `io.outcom.dosetrace`; exact alarms (`SCHEDULE_EXACT_ALARM`), background refresh every ~6 h, update/reboot receiver, daily silent server wake-up (chapter 4.4). Android keeps its native date/time dialogs (decisions.md:48); today the curve's "Other date" and the past-weigh-in date use the DTWheel on Android → G-231. |
| Samsung Galaxy Z Fold (unfolded ≈ 830 × 750 pt) | **Book layout** in 1.3.0: two pages when the window is ≥ 700 × 560 pt and the physical screen is held normally (hinge vertical) [BK-1, BK-13] | Chapter 4.11. Folded = phone layout. |
| iPhone "Duo" (foldable iPhone) | Deferred: decided with the first build made with the iOS 27.1 SDK; until then iOS letterboxes at phone size [BK-13] | decisions.md:81 |
| Landscape and large windows | Every screen works in landscape; content in a centred column, max 640 pt (decisions.md:77). Confirmed by the founder's line decisions.md:77 ("do it correctly, take your time"); conflict #37 (:438) is closed by AD-62 (no portrait revert). | |
| Web | Only `dosetrace.io` (home + `/privacy-policy`) and the view-only admin panel (`docs/specs/admin-panel.md`, out of app scope). No terms page: the app uses its own in-app Terms of service (decisions.md:30). | |

Tech stack (detail in TRD): Expo SDK 54 / React Native 0.81 (new architecture), expo-sqlite local-first database mirrored to Supabase Postgres with tombstones, Supabase Auth (email, Google, Apple), RevenueCat, Anthropic Claude Haiku through Supabase Edge Functions, local notifications (08 §1).

### 1.5 Business model — Free and Premium, every limit
One plan name, **Premium** (decisions.md:24). Cloud backup and sync are **free for everyone** and are never sold as Premium — "a launch trust/retention hook; monetize on the AI features" (decisions.md:278). The paywall lists only real Premium features, never "Coming soon" (decisions.md:283).

#### 1.5.1 Feature matrix
| Capability | Free | Premium | Enforced where | Source |
|---|---|---|---|---|
| Active protocols | **3** (Ended, Recently deleted and purged do not count) | Unlimited | Phone only (no server rule) → OPEN-05 (G-186) | decisions.md:280, :465 ("3 mantém"); 01 §3.14 |
| Reconstitution calculator, drawn syringe, oral serving math, IU→mass converter | Yes | Yes | — | paywall row "Full reconstitution calculator" |
| Injection log, vial tracker, site picker, Dose log, adherence tracker (rings, streaks), Missed, Pending from yesterday | Yes | Yes | — | paywall row "Injection log & vial tracker" |
| Reminders (dose, morning summary, vial, check-in, weigh-in, food) and the reminder check | Yes | Yes | — | paywall row "Reminders" |
| Lab test journal and Vaccine journal (view, edit, delete; type vaccines by hand) | Yes | Yes | — | decisions.md:268; paywall "Lab & vaccine journals" |
| Lab values typed by hand | **Free by decision** (2026-09-30) | Yes | **Never built** (no insert path besides the scan; registry F-070 "Shipped" is wrong) → AD-68: ships in 1.3.0, picture first (Approvals item 3) | decisions.md:268, :76; DV-107 |
| Lab marker charts | **Premium by decision** (2026-09-30) | Yes | **Free in code today** (not gated on any path: `MarkerChart` renders with 2+ readings, `BodyScreen.js:1067`) → GAP (DV-108), AD-24. Gating takes a working feature away from current free users — picture first, and say so in the founder's deviation/picture round | decisions.md:268; 06:D-8 |
| AI scans — lab reports, vaccine cards, vial labels, **one shared monthly pool** | **3 / calendar month (UTC)** — the limit is printed to free users only before their first scan that yields lab values (empty journal, free card), then only on the paywall and in the FAQ; the count used / left is never shown → OPEN-14 (b) (G-190) | **20 / calendar month**. Premium strings carry no scan number (the 20 only in the FAQ and the limit-reached message), no Premium scan line is added to My Body, and the free number is never shown to a Premium user — AD-69 (founder decisions.md:104, :257; signed MB-10; the coordinator line :544 is not the authority). Today the empty lab journal shows Premium users "3 free scans" → G-178. | Server (`extract-bloodwork`, RevenueCat check; RevenueCat unreachable → Premium cap) | decisions.md:104, :275-277; FX-19, FX-20; MB-10 |
| Vial-label scan | Free for everyone (activation feature), counted in the pool | Same | Server | decisions.md:277 |
| AI protocol assistant | 10 conversations per rolling 7 days (the server also enforces 40 answers per conversation, a 24-hour conversation life and 200 answers per rolling 24 h — builder caps with no signed row → OPEN-18 (3), G-200) | Same (every plan) | Server (`protocol-assistant`) | decisions.md:289, :487; AP-18 |
| AI food log | **7 days from the first day the user used it** (first send or the reality-check start tap; backdating never shortens it); then locked with a benefits explanation and the paywall | Every day | Phone only → GAP G-40 | decisions.md:274, :446; FL-41 |
| AI food parse cap | **Ledger:** 25 AI parses per user per day; follow-up answers do not count (decisions.md:251; FL-21). **Code:** 25 parses + 25 follow-up answers per `entry_date`, plus a 60 / rolling-24 h ceiling that both kinds share — the follow-up cap and the 60 / 24 h ceiling are builder choices with no ledger line → OPEN-18 (3) (GAP G-153). A given date's counter never resets (a new date starts at 0) | Same | Server (`parse-food`) | decisions.md:251; FL-21; 04 R-F9 |
| Weigh-ins, past weigh-ins, the weigh-in chart, the weigh-in of a running reality check | Always free | Yes | — | decisions.md:229 (FX-15) |
| Energy calculator: Your numbers, daily burn by formula, Your daily plan | Yes | Yes | — | paywall "Energy & protein calculator" |
| Your target: set + progress bar | Yes | Yes | — | decisions.md:281 |
| Your target: measured ETA | — (teaser → paywall) | Yes | Phone | decisions.md:281 |
| Reality check: start | During the 7 free food-log days only. **Not** in a lapsed payer's grace week: grace = finish the current week of **logging** only (no new check, no result) | Yes | Phone. Code today also lets a lapsed payer in grace start a new check and see its result (`rcFree = access.canLog`, `CalculatorSection.js:220`) → GAP G-53 (DV-101) | FL-41; decisions.md:229, :274; AD-14 |
| Reality check: result (measured maintenance) at day 21+ | — (free days are over by then; never in the grace week) | Yes | Phone (code shows it in grace → GAP G-53) | decisions.md:274; AD-14 |
| Reality check: "Type your average calories instead" link | — (Premium-only, 2026-10-08 "A") | Yes | Phone (code also shows it in free days → GAP G-41) | decisions.md:636 |
| Dose accumulation (curve screen, the Est. level number on Journey and My Body) | Premium tag, example preview sheet → paywall | Yes | Phone | decisions.md:219, :261, :279 |
| Export: CSV (labs + vaccines) and "Download my data" (JSON of every synced table) | Yes | Yes | — | decisions.md:282, :376 |
| Export: PDF | — ("PDF export is Premium", Cancel first, Go Premium second) | Yes | Phone (fresh check at the tap) | decisions.md:282; MB-19 |
| Cloud backup & sync | Yes (never sold) | Yes | — | decisions.md:278 |

Premium in the paywall's "Free vs Premium" table — 13 prototype rows in this order (PA-17, `lib/paywallPlans.js comparisonRows`): Full reconstitution calculator · Up to 3 protocols · Injection log & vial tracker · Reminders · Lab & vaccine journals · Energy & protein calculator · Cloud backup & sync · AI food log ("7 days") · Unlimited protocols (—) · AI scans (labs, vaccines, vials) ("3 / month") · PDF export for your doctor (—) · Reality check & progress tracking (—) · Dose accumulation (—). Premium shows a check on every row. Note: the row "Reality check & progress tracking" contradicts "weigh-ins and their chart are free" (decisions.md:107, :229) → GAP G-43.

#### 1.5.2 Prices, trial, products
- Prices always come from the store at runtime (RevenueCat offerings, storefront currency); nothing in the app writes a price; "Save N %" only from real prices of the same currency, rounded down, hidden when nothing is saved [PA-5, PA-7] (decisions.md:284).
- Current store prices (read 2026-10-03): US Monthly $2.99, Annual $28.99, Lifetime $69.99 on App Store; Play US equal (old yearly $49.99 inactive); Brazil R$19,90 / month and R$199,90 / year, equal in both stores (founder "4 iguala à Apple") (decisions.md:452, :466). UNVERIFIED that Play Brazil was changed to match.
- Products: monthly, yearly, lifetime; ASC group "DoseTrace Premium" with 19 localized display names submitted with 1.3.0 [RL-6] (decisions.md:24, :348).
- Free trial: 7 days on Monthly and Yearly in both stores (iOS 175 territories; Play `free-trial-7d`, new customers only) (decisions.md:451, :478). The paywall claims a trial only when the store says this person is eligible and only with its real length [PA-9, PA-77, PA-85].
- Upgrade-sheet copy: "Start 7-day free trial", "Price shown at checkout · Cancel anytime", "Free for 7 days — no charge today" (decisions.md:287).
- The 1-year early-adopter Premium offer is **explicitly deferred by the founder** (decisions.md:291; A-17).
- Founder's own extra accounts and the App Review account are Premium through `DEVELOPER_EMAILS` (client) and `PREMIUM_EMAILS` (server); test account Test03 gets Premium only through a temporary RevenueCat promo (decisions.md:290; 07 R41). No move to RevenueCat promotional grants is scheduled (AD-58).

#### 1.5.3 One entitlement helper
Every Premium gate asks one helper (`lib/entitlement.js hasPremium / getEntitlement`). It caches the **expiration date** per RevenueCat user: store unreachable + future expiry (or lifetime) = Premium; past expiry = not paying (with `endedOn` for the food-log grace week); never known = free. A paying user is never locked out offline. The server stays authoritative for paid AI calls (decisions.md:288; FX-4, FX-16). A static guard test forbids any other file reading RevenueCat directly [FX-16].

### 1.6 Languages
- Six languages — English, Spanish, Portuguese (Brazil), French, German, Italian — always at key parity; never strip a language (decisions.md:85). 2,206 keys per language on 2026-10-12 (08 §7.1).
- Every string is written the way a native app in that language would say it, from the screen's context, never word for word; a literal translation is a bug (decisions.md:86). The 1,790-row natural-translation pass is approved (decisions.md:88). PT and ES still mix the reminder terms in two strings → G-228.
- App language is chosen in onboarding and Settings (code tiles EN/ES/PT/FR/DE/IT, never flags) (decisions.md:71); default = device language when supported, else English (08 §7.1). The device-language default is only displayed, never stored (`i18n/LanguageContext.js:33-39`), and notifications read the stored language or fall back to English (`getT`, `lib/notifications.js:18-24`), so a user who never picked a language gets the app in the device language and every notification in English → GAP G-77 (DV-050, DV-196).
- Dates and decimals follow the **app language**, never the device locale ("19 de out.", "86,0 kg", "2.480 kcal") — display only; stored values never change (decisions.md:92).
- Tab bar labels (own short keys) (decisions.md:91, :581):

| | Today | Protocols | Journey | My Body | Settings |
|---|---|---|---|---|---|
| EN | Today | Protocols | Journey | My Body | Settings |
| PT | Hoje | Protocolos | Evolução | Meu corpo | Ajustes |
| ES | Hoy | Protocolos | Evolución | Mi cuerpo | Ajustes |
| FR | Aujourd'hui | Protocoles | Parcours | Mon corps | Paramètres |
| DE | Heute | Protokolle | Verlauf | Mein Körper | Optionen |
| IT | Oggi | Protocolli | Percorso | Il mio corpo | Opzioni |

### 1.7 Release model
- The next store version is **1.3.0** on App Store and Play: the 1.2.5 work package plus the Graduated redesign, submitted together (decisions.md:345). The Graduated redesign must ship before any store upload (decisions.md:344).
- Current process (latest founder words): test builds for the founder's devices (iOS internal TestFlight + Android Play internal track) after dt-council + ship-check; the production build and store submit only after his "clean" (decisions.md:514, :551). On 2026-10-07 he added: "Vamos resolver tudo. Sem pendência" — no production submit while any item is open; the earlier "straight to the store" is withdrawn (decisions.md:634).
- On 2026-10-12 the founder paused A-116 / A-117 code until this PRD, the TRD and the drawn flows exist (decisions.md:639).
- Before every build: dt-council, ship-check (Gate A both themes on every touched screen, Gate B auth/sync, Gate S spec-audit), full-functionality pass of every app-map link in both themes (CLAUDE.md evolution rule 4).

---
## 2. Principles

Each principle is a founder decision (date in brackets) or a standing rule. When a feature requirement and a principle disagree, the principle wins and the requirement is a bug.

**P-1 — Honest journal plus pure-math calculator; never advice.** DoseTrace records, charts and exports; it never interprets, diagnoses, recommends or advises, and it is never a drug-interaction checker. [standing 2026-04-29; positioning 2026-07-21; "never advisory forever" 2026-07-03] (decisions.md:20, :28, :169; CLAUDE.md)

**P-2 — AI hard line.** Any AI feature only transcribes or surfaces the user's own data. It never recommends a treatment, dose or protocol change, never diagnoses or interprets a result. The AI returns data only; the app writes every sentence in 6 languages. Every number the calculator uses comes from the user (typed, or read from their own label and confirmed) and is computed by the app, never by the model. [2026-09-10; 2026-09-27; 2026-10-02] (decisions.md:316-326; CLAUDE.md)

**P-3 — Never lose user-entered data.** Data a user typed survives app updates, screen rebuilds, re-auth and sync. Durable SQLite↔Supabase synced storage (tombstones) is the default — never AsyncStorage alone, never `user_metadata` alone. The destructive wipe fires only on a real, intended sign-out. Writes merge, never clobber; never write back from a stale or empty read. When a screen or flow is replaced, its data is migrated in the same change. Storage/auth/sync changes are proven by update-over-old-version and re-auth on a device. [2026-09-12] (decisions.md:369-372; CLAUDE.md)

**P-4 — Never destroy on a maybe; every delete asks first.** Every delete asks first in a DoseTrace sheet (Cancel · red Delete) and leaves a synced tombstone. No device removes data because a row is absent from the cloud. "Delete forever" is a positive tombstone (`purged_at`). The automatic purge of soft-deleted protocols is paused in 1.3.0. [2026-10-03; 2026-10-04] (decisions.md:46, :264, :506, :520-531)

**P-5 — Reminders keep coming until the user deletes or ends the protocol.** A user still taking something keeps getting its reminders for as long as it lasts, whether or not they open the app (a 180-capsule vitamin = at least 180 days of reminders); Android must not silently stop them ("O Android não entende a importância desse aplicativo não ser pausado. Nós é que temos que entender isso."). A user who stopped everything needs no reminders. A reminder the user switched off is the opposite failure (switches and Silent mode must work). Protocols with a total number of doses end their reminders when that course ends. [2026-10-07] (decisions.md:594-601, :620; BR-12)

**P-6 — One term per concept, translated naturally, in six languages.** Six languages always in parity; never strip one. Every translation is written as a native app in that language would say it, from the screen's context. One term per concept across the app (glossary §0.4). A literal translation is a bug. [standing; 2026-10-02] (decisions.md:85-87; CLAUDE.md)

**P-7 — On the unfolded Fold, the right page adds, never repeats.** The right page shows the most information the app already has about what was tapped, without inventing anything; it never duplicates the controls of the left card. Every tap and every notification opens its item on the right page (A-116). [2026-10-07] (decisions.md:633-634; fold-right-page.md)

**P-8 — Approved → the next build; only the founder defers.** Anything the founder approves ships in the next build whose scope is still open. If it cannot be built well in time, say so and let him decide; never a silent backlog. [2026-09-10; 2026-09-27] (decisions.md:336; CLAUDE.md)

**P-9 — Show the layout before building; the prototype is binding.** Every visual change is rendered as side-by-side pictures (prototype | proposal | app today, both themes, one tile per option) and picked by the founder before code. The approved prototype is binding for look, order and behaviour, except later founder decisions. Store-owned controls follow the store rules 100 % (Apple sign-in per HIG, Google per Google branding). [2026-10-01; 2026-10-02] (decisions.md:34-40; CLAUDE.md)

**P-10 — "Done" is the signed checklist with evidence.** Every approved feature has a numbered checklist in `docs/specs/`. Anything built simpler is a deviation the founder accepts in writing. `spec-audit` must pass; the spec-auditor never sees the builder's summary. [2026-09-27] (decisions.md:339; CLAUDE.md)

**P-11 — Enter once, used everywhere.** Anything the user tells the app once is the single source of truth and is never asked again: the latest weigh-in is the current weight everywhere; sex and age come from the profile only; one activity scale (5 levels); the compound picked on the curve shows first on every Dose-accumulation surface. [2026-09-28; S-04 2026-10-01] (decisions.md:231-232, :312; A-54)

**P-12 — One owner per shared state; every surface agrees.** A state shown in more than one place (reality-check status, weigh-in, dose taken, supply low, Premium, reminder health, Est. level…) is computed by one owner and read by every surface; no screen computes it on its own. A surface that disagrees with another is a bug, even if each matches "its own" rule. [logic from the founder's 2026-10-12 PRD/TRD request and the A-118 incident of 2026-10-09: "Today kept asking for the weigh-in while Progress knew it was done" (docs/product/README.md)] — Chapter 5 lists every contract.

**P-13 — The user's own data is never paywalled.** Saving a weigh-in, past weigh-ins, the weigh-in chart and the weigh-in of a running check are free; only results (measured maintenance, measured target ETA) and starting a new check after the free days are Premium. Cloud backup and sync are free. [2026-09-27; 2026-10-01; 2026-07-21] (decisions.md:229, :278)

**P-14 — Honesty lines.** Every estimate says "estimate", with method and sources one tap away; estimates are drawn as line/fill, measured values as points, projections dashed; no good/bad colour on a health value. Copy must be true (no promise the app does not keep: no "7 days" while the purge is paused, no "unlimited", no reminders the app does not send). Honest paywall: only real Premium features, never "Coming soon". Say "makes no recommendations". [2026-09-28; 2026-10-04; 2026-07-21; 2026-07-23] (decisions.md:73, :126, :283, :544)

**P-15 — Both themes, theme tokens only.** Colour and contrast are verified in light AND dark on every screen, modal, sheet, picker and dropdown before every build. Theme tokens only; hard-coded colours only on deliberately fixed surfaces (toast, share-card export, solid-accent card, brand marks, protocol palette). No colour clashes with either theme; protocol colours ≥ 3:1 on the card in both themes. [2026-09-11; hard gate 2026-09-18; 2026-10-02] (decisions.md:41-43; CLAUDE.md)

**P-16 — No emoji anywhere in the UI or notification titles.** The founder's monoline FeatureIcon set; a missing glyph is drawn in the same style. [standing; 2026-09-09/13] (decisions.md:70)

**P-17 — DoseTrace sheets, never native alerts.** Floating bottom sheets that hug their content, 30 pt above the edge; pickers keep the wheel inside a sheet; camera/photo library stay system UI; Android keeps native date dialogs (two Android screens use the DTWheel today → G-231). Titles say what happened, never a generic "Error" (generic titles and the circle glyph today → G-230). [2026-09-29 → 2026-10-03] (decisions.md:45, :47-48, :121)

**P-18 — "Today" is the user's local day; display follows the app language.** Every "today", day boundary and date field uses the user's local calendar day; stored dates are untouched. Dates and decimals are displayed in the app language, never the device locale; display strings are never parsed back. [2026-10-03; 2026-10-02] (decisions.md:92, :383)

**P-19 — Decide what is already decided; ask only real questions.** Check the ledger and logic before asking the founder; ask only taste/money/risk/scope questions, all of a phase in one round. [2026-10-03] (decisions.md:351)

**P-20 — Every bug becomes a failing test first; one item per session; full suite green.** [2026-09-27] (decisions.md:340)

**P-21 — Value before the account, but the data is required.** The onboarding carousel runs before sign-up; every account with a missing required profile field is held at the profile gate ("I need the data"; do not re-litigate). [2026-09-08; 2026-09-09] (decisions.md:296, :299)

**P-22 — Restraint never removes information a feature exists to show.** Protocol cards keep all their information as clean lines; distinct screens are not flattened into identical cards. [2026-09-27] (decisions.md:50)

**P-23 — No numeric presets.** No pre-filled dose values and no auto-selected goals; the only preset is a compound name. [2026-07-03] (decisions.md:170)

**P-24 — Injection sites are optional, and asked before the write.** A Complete dose may have no site; for an injectable the site is asked before anything is written. [2026-09-30; 2026-10-01] (decisions.md:152; features.md S-20/S-25 decisions)

**P-25 — Deliberate status changes win across devices.** Stop wins (reality check); End/Delete wins (protocols); a newer weigh-in typed on another phone wins over a delete of that day. [2026-09-27; 2026-10-04] (decisions.md:239, :537, :539)

**P-26 — Rebuild means replace.** When a screen/module/flow is replaced, the old one is deleted in the same change (its data migrated). [standing] (CLAUDE.md)

**P-27 — The food log is a retention engine.** Food log → reality check → Your daily plan: a daily habit and a friendly chat, not a diet diary, never advice; catch-ups at most 7 days back. [2026-09-27] (decisions.md:213, :244)

**P-28 — The serum curve is sex-neutral.** No global sex fudge; sex feeds the BMR, not the curve; any covariate only per compound with published data. [2026-09-09] (decisions.md:201-202)

**P-29 — Concurrent multi-device use is not a real DoseTrace use case.** Two devices must never lose data, but simultaneous live editing on two phones is not designed for (A-48 parked). [2026-09-28] (decisions.md:199)

**P-30 — Explainers never interrupt dosing.** Free-feature explainer animations play on the feature's own screen the first time it is reached and unused, never on Today or at launch, at most one a day, never on the dose-logging path; their "used" flag is synced. [2026-09-30 / 2026-10-02] (decisions.md:76, :381)

---
## 3. Core loops (end-to-end user stories)

Each loop is written as the user lives it, step by step, naming every surface that must react. The detailed rules are in chapter 4; the surface-by-surface agreements are the contracts of chapter 5.

### L-1 — The daily dose loop (take → remind → log → adherence / curve)
**Story.** "As someone on a protocol, I want to be reminded at my dose time, record it in one tap (with the site if I inject), and see that today is complete, so I keep my schedule without thinking about it."

1. **Before the slot.** The dose card is on Today (the protocol's next dose moment is today or overdue) with its time and, for a powder (recon) dose with a mixed vial, "Draw to N units" on the drawn syringe (ready-to-use cards show no draw, as in the prototype); Mark complete is available early (an early dose covers its own day by count) (PRD-TODAY-20…, PRD-DOSE-1). The morning summary at 07:00 listed it ("Today: …") (PRD-REM-20).
2. **At the slot.** The dose reminder arrives (local notification, exact on Android when allowed) titled with the protocol name (or "Dose reminder" when names are hidden), body "Time for your {dose} {unit} dose", with **Mark complete** and **In 1 hour** (+ **Tomorrow** for less-than-daily protocols) (PRD-REM-10…). The card shows the outline "Due" tag from 5 minutes before the slot (PRD-TODAY-24). If "Persistent reminders" is on, two follow-ups come at +5 and +10 min (PRD-REM-14).
3. **Marking.**
   - From the notification button: an oral dose is written at once (in the background on Android; on iPhone the app opens on Today) — for **today's** slot at the **tap time** (`lib/markTaken.js:101-104`, same as PRD-DOSE-3); a previous day's slot is logged at its slot time, except a **snoozed** copy tapped more than 12 h after its slot, which logs at the tap time (`lib/markTaken.js:204-208`, as PRD-REM-30). An injectable opens the app on the site question (PRD-REM-30…).
   - From the notification body: Today opens with that dose in "From your reminder" (PRD-TODAY-8).
   - From the card: oral = written at once with a 4-second Undo bar; injectable = the site question first; Save writes the dose with the site, Skip writes it without, Cancel writes nothing and says "Not marked complete" (PRD-DOSE-10…).
4. **Everything that reacts** (C-1): the card fills its slot (next slot or the "all caught up" card), "{x} of {y} complete", the tracker rings (Today / 7 days / 30 days), the week circle, the day streak, the protocol's dose streak and "Last site" line, the vial cells and "N of M doses left", supply-low alert/badge/push, the vial-finished prompt for a powder vial's last dose, the oral bottle's units, the slot's reminder and earlier ones (cancelled, delivered banners dismissed, snoozes resolved), the Dose log, the Protocols card's Mark complete button, the Fold right page. **The curve does not change** — it is schedule-driven by decision (PRD-CURVE-12).
5. **If not marked.** At local midnight the slot moves to "Pending from yesterday" until slot + 12 h (Complete logs at the slot time; Skipped writes a Skipped row at the slot) (PRD-TODAY-40…). After slot + 12 h the Missed scan writes a Missed row that the Dose log can turn into Complete or Skipped (PRD-LOG-…).
6. **Over weeks.** Rings and streaks count only doses logged in the app (declared history never counts); the Dose accumulation estimate follows the planned schedule; the adherence report (Settings) is shown before it is shared with a provider (PRD-SET-40…).

### L-2 — The supply and vial loop
**Story.** "As someone who mixes vials, I want to know how many doses are left, when the vial's window ends, and to log a new vial in two taps, without losing my history."

1. **Create.** A powder protocol's step 5 records the mix date (month + day) and validity window (default 30 days), or "I haven't mixed this vial yet — skip"; ready-to-use records the box expiry month/year; orals record units per container (PRD-PROT-20, PRD-VIAL-1…).
2. **Each dose** moves the active vial (or bottle) once; the last dose of a vial closes it (PRD-VIAL-10…).
3. **Low.** 1–3 doses left = low: amber Today alert, Protocols badge, the hero's low-supply line, and one push per vial (app running) — one rule for all; the push fires at 3 doses left (AD-60: the signed FX-11 deviation and decisions.md:148) (PRD-VIAL-20…; C-15).
4. **Window.** 7 days before the window ends and on the day: a 09:00 notification and the Today "Vial expiring soon" alert (the lead time and words wait for the founder → OPEN-20 (c)); ≤ 0 days = "Past window" on the card (PRD-VIAL-30…; C-16).
5. **Empty.** After the last dose of a powder vial the "All doses logged" prompt opens (after the site question): "Log new vial" (mix date Yesterday/Today or a date) or "Protocol finished" (today: only closes the prompt; a real end with a "Later" way out is scheduled for 1.3.0 by the founder — AD-11 — and its picture is owed, Approvals item 3 → G-183) — two buttons only, no "Not now" (`TodayScreen.js:2380-2393`; decisions.md:558) (PRD-VIAL-40…). Ready-to-use: "New vial" resets the vial count after asking; orals: "New bottle" after asking. A new vial never rewrites the protocol's start date (history kept) (P-3; FX-1).
6. **Gaps the user can hit today:** an empty ready-to-use vial cannot be replaced from the UI; a powder vial past its window but not empty has no "new vial" path; oral bottles never warn low (→ DL-22: an empty ready-to-use vial can be replaced, as a new vial row, G-162; asking the new box's date, the powder "New vial" on the protocol page and correcting the vial in use wait for the founder → OPEN-01, G-185; bottles → OPEN-02, G-184).

### L-3 — The protocol lifecycle loop (create → run → end → restart / delete → restore / delete forever)
**Story.** "As someone who starts and stops compounds, I want to add a protocol (even one I started weeks ago), stop it without losing its history, start it again later, or delete it — and get back anything I deleted by mistake."

1. **Create** by the manual wizard (default, free) or the optional AI assistant (10 conversations a week) — identical result (PRD-PROT-1…, PRD-AI-30…). First dose defaults to Today; a past start date is allowed; for a compound with t½ ≥ 24 h a past start asks "Same dose for the last N weeks?" (No → the curve starts today) (PRD-PROT-60…).
2. **Run.** Reminders scheduled (C-8); Today, Protocols, curve, tile react.
3. **End.** Today's "Still going?" prompt after max(7, 3 × interval) days with no Complete dose → "Yes, it's finished" ends it at the last Complete dose (Missed rows the app wrote after it are removed) (PRD-PROT-80…). A deliberate "End protocol" on the protocol page, and "Protocol finished" with a way out ("Later"), are scheduled for 1.3.0 by the founder (AD-11); their picture is owed (Approvals item 3; G-183). The inactivity end's date and the removal of app-written Missed rows on every phone are DL-87. An ended protocol keeps all history (Dose log, report, rings until the end, curve past for 365 days), leaves Today, reminders and the free-limit count (C-10).
4. **Restart** from the Ended section, in this order: (1) the free-limit check first (a free user at 3 active sees "Protocol limit reached" before any question); (2) the duplicate warning if the same compound is active; (3) the container question "New vial / Keep using the same vial" (bottle for orals); a new run starts today (C-11). Today the limit is checked last, inside the restart, after a container button is tapped (`ProtocolsScreen.js:1253-1290`), so a free user answers two questions only to be refused — a bug (G-229, DV-217).
5. **Delete** (protocol page or Ended row) → Recently deleted at the bottom of the Protocols list; its doses leave the Dose log while deleted (PRD-PROT-100…).
6. **Restore**: same local day = undo (active if under the free limit, else Ended); deleted before today or was Ended → Ended (never makes the deleted days owed) (DL-89). **Delete forever** (single or multi-select) asks first and is final on every device (positive tombstone) (C-12, C-13).

### L-4 — The food → reality check → Your numbers → plan loop (the retention engine)
**Story.** "As someone who wants to know my real maintenance calories, I want to tell the app what I ate in my own words for 7 days in a row, weigh in at the start and after 21 days, and get a measured daily burn that my plan then uses."

1. **Your numbers first.** Progress → Your numbers: weight, height, age (from profile), sex (from profile, no default), optional body fat (+ source) and waist, activity (5 levels), units. With weight + height + age + sex the **estimated** daily burn and Your daily plan (Lose / Maintain / Gain as % of daily burn) appear (PRD-PROG-20…).
2. **Start the reality check** (Progress → reality-check card; first time opens the explainer): pick the start date (today … 7 days back) and the start weight (prefilled from that day's weigh-in) (PRD-RC-1…). Free users may start during their 7 free food-log days (the free days count from the start tap if not already started) (PRD-FOOD-60…).
3. **Daily.** The AI food log hero appears on Today ("Reality check · day N of 21 · {n} of 7 days in a row"; PT "… · {n} de 7 seguidos") and stays on Journey. The user types what they ate ("2 built puff bars and a coffee"); the AI transcribes items with quantity and estimated kcal/carbs/protein; the app asks one friendly follow-up about what else today; "that's it" closes the day; "I ate nothing" must be confirmed for an empty day to count (PRD-FOOD-…). At 20:00 the app asks "Anything you ate today that isn't logged yet…?" (Log it · Nothing else today · I'll eat later) unless the day is closed (PRD-REM-60…).
4. **The run.** Only 7 consecutive fully logged days give an intake number; until then "n of 7 so far"; the app never guesses (PRD-FOOD-40…). Premium users may instead type their average calories (PRD-RC-30…).
5. **Day 21.** A 10:00 notification "Time to log your weight…" and a Today alert "Weigh in on {date}" → "Ready now — tap to log your weight". The user logs today's weight (free for everyone) (PRD-PROG-40…).
6. **Result.** With the weigh-in on/after day 21 and a 7-day run (or typed average), and the right to see results (Premium, or still inside the free days — **never** in a lapsed payer's grace week, which is logging only; AD-14, decisions.md:274; code today also finishes in grace → GAP G-53, DV-101), the check finishes by itself when Progress is opened (whether it should finish by itself waits for the founder → OPEN-07; the save runs only in `CalculatorSection.js:855-859`; Today and Journey can say "ready" for days before anything is saved): measured daily burn = average intake + (start − final weight) × 7700 / days, with the weekly rate. It becomes the hero "Daily burn · Measured" on Progress and on the Journey tile, and Your daily plan rebases on it; the formula drops to an "estimate" sub-line (PRD-RC-50…). Free users after the free days see the benefits explanation and the paywall; their weigh-ins are kept (P-13).
7. **Next.** "Weigh in again in 21 days" starts the next check. Stop ends the open check (asks first; keeps food; clears the reality-check numbers → OPEN-08); Stop on one phone wins on every phone. The same Stop link is also offered with **no** check open (on the result view and in the locked branch), and one tap there wipes every saved result → GAP G-149 (extends DV-004).
8. **Every surface that must agree at each step** — C-17 (weigh-in), C-19 (food), C-20 (check state), C-21 (food access). The A-118 incident (Today kept asking for the weigh-in while Progress knew it was done) is the reason these contracts exist.

### L-5 — The weigh-in loop (body over time)
**Story.** "As someone tracking my body, I want to log a weigh-in in one tap (weight, optional body fat and waist), fix or delete a wrong one, and see the trend, my target and my daily burn update everywhere."
1. Log today's weight (Progress card button, weekly Sunday 10:00 check-in notification, the day-21 weigh-in, changing the weight in Your numbers, or "+ Add a past weigh-in") → one row per local day, merged per field (PRD-PROG-40…).
2. Everything that reads weigh-ins updates at once: hero weight, "Since …" line, target pace/ETA, Weigh-ins table/chart, Your numbers weight, daily burn, reality-check state, Today alert and food-card line, Journey tile (C-17).
3. Tap a weigh-in to fix it (date fixed) or delete it (asks first; the weigh-in that started the open check can be fixed, never deleted) (PRD-PROG-50…; C-18).

### L-6 — The lab loop
**Story.** "As someone who gets bloodwork, I want to photograph or upload the report, have every value saved under its date, see each marker over time, star the ones I care about, and export them for my doctor — without the app ever telling me what the numbers mean."
1. My Body → Lab test journal → + Upload → the shared AI consent (once) → Take a photo / Choose a photo / PDF file → "Reading your lab report…" (PRD-BODY-20…).
2. The values save automatically, dated from the document (an unreadable date falls back to today and says so) → "Report imported · {n} markers saved · {date}" (PRD-BODY-30…).
3. By date (one card per test) / By marker (favourites first, then A–Z), each marker with "Latest", N readings and a neutral chart of the user's own values (PRD-BODY-40…).
4. Edit a value, delete a value or a whole test (asks first) (PRD-BODY-50…).
5. Six months after the latest test, Today shows "Bloodwork due" (PRD-TODAY-57; OPEN-13).
6. Export CSV (free) / PDF (Premium); the Dose accumulation screen's "Estimate on a date" lists bloodwork dates beside the estimate, never comparing them (PRD-CURVE-40…).
7. Scans share one monthly pool with vaccine cards and vial labels (3 free / 20 Premium) (C-36).

### L-7 — The vaccine loop
"As someone keeping vaccine records, I want to add or scan a vaccine card, record the next-due date I was given, and see the nearest one on My Body." → + Add vaccine / Scan · upload → Vaccine journal (newest first) → hub "Next due: {name} · {date}" from the user's own date, never advice (PRD-BODY-60…; C-33).

### L-8 — The reminder-reliability loop
**Story.** "As someone who relies on reminders, I want the app to tell me when my phone is blocking or delaying them and take me to the exact setting, so I never find out a week later."
1. Onboarding (Android): after "Enable notifications", the step "Make sure your reminders arrive" (Notifications, Alarms & reminders, Battery, Pause app activity if unused, Samsung deep sleep) with "Set up later" (PRD-ONB-10).
2. Today shows a reminder card while a readable item blocks or can stop reminders (one card for two or more; Silent mode its own card); late, battery, stop and stale cards open the reminder screen at their item, while blocked, Silent and the combined card open the top of the screen (PRD-TODAY-58).
3. Settings → Notifications → "Make sure your reminders arrive" (Android) / "Check reminders" (iPhone): every row with its state and fix button, the next reminder, the scheduled count, and a 10-second test reminder (PRD-REM-80…).
4. Android keeps the reminders renewed without the app being opened: a background refresh every ~6 h, a refresh after an update/reboot, a daily silent server wake-up (PRD-REM-100…). iPhone has no background renewal today → OPEN-06.

### L-9 — Onboarding to the first dose (activation)
**Story.** "As a new user, I want to see what the app does before giving it an account, answer a few questions once, and reach Today with my first protocol and its reminders set."
Splash (droplet, "Every dose, precisely tracked.", language pill) → features ("Built for your protocol") → goals → what you use → about you (18+ year) → your routine (5 activity levels + provider) → Before we begin (4 confirmations incl. the AI line, Terms + Privacy links) → Never miss a dose (Enable notifications / Not now; Android setup step) → Create account (Apple / Google / email; consent row) → (email: Account created → confirm link) → Today empty state "Add a protocol" → wizard or "Build it with AI" → Today with the card, reminders scheduled, the free-feature explainers on their screens (PRD-ONB, PRD-AUTH, PRD-PROT).

### L-10 — The Premium conversion loop
"As a free user, I want to see exactly what Premium adds with an example of my own kind of data, start a store trial if eligible, and never lose what I already logged."
Locked surfaces (curve tile/card, PDF, 4th protocol, food log after day 7, reality-check result, measured ETA, lab charts by decision) → example preview sheet or the paywall with `source` → real store prices, "Best value" annual preselected, trial only if eligible → purchase / restore outcomes as DoseTrace sheets → Premium everywhere at once (C-22) (PRD-PREM-…).

### L-11 — The records-export loop
"As someone who sees a provider, I want to give them my own records — dose adherence, labs, vaccines — in a clean form, and take all my data out whenever I want." Settings → Adherence report (preview "This is exactly what your provider will receive", then share); My Body → Export (choose markers/vaccines; CSV free, PDF Premium); Settings → Download my data (JSON of every synced table) (PRD-SET-40…, PRD-BODY-70…, PRD-DATA-30…).

---
## 4. Feature specifications

Numbering inside each area is grouped by tens (1–9 general, 10–19 the next topic, …); gaps in the numbering are deliberate room for later requirements.

### 4.1 Onboarding, account, gates

**Purpose.** Show value before asking for an account (decisions.md:296), collect the profile the calculators need once (P-11), confirm adults only and the four consents, create or reach the account by Apple, Google or email, and hold any account that lacks required data (P-21). Sign-out and account deletion must never lose data by accident nor leave another person's data on a shared phone (P-3).

**Entry points.** First launch (no session, onboarding not seen) → onboarding; signed-out launch → Auth (Sign in); a stash with answers → onboarding again even if seen (07 R6); emailed links `dosetrace://reset-password`, `dosetrace://confirm-email`, `…auth-callback` (Android Apple); Settings → Sign out / Delete account; the gates after sign-in.

**Root routing (exact order, 07 §2.1).** Loading → Reset password (a pending recovery beats everything) → no session & onboarding not seen (or stash has answers) → Onboarding → no session & seen → Auth → session & profile incomplete → Finish setup (signed-in onboarding) → session & under-18 unconfirmed → 18+ confirmation → Main.

#### Onboarding (pre-account)
- **PRD-ONB-1** Exactly 8 steps in this order: splash (welcome), features, goals, what you use, about you, your routine, Before we begin (consent), Never miss a dose (reminders); progress dashes, Back, one Continue dimmed until the step is answered. No "You're all set" step. [D 2026-09-29 #297; PA-30]
- **PRD-ONB-2** Welcome: language pill top right (opens the 6-language sheet, code + name, switches at once), the droplet app icon (not the prototype's blue tile), "DoseTrace", "Every dose, precisely tracked.", "Get started", "Already have an account? Sign in" → Auth in Sign-in view. [D 2026-10-01 #18; PA-31, PA-32; decisions.md:123]
- **PRD-ONB-3** "Built for your protocol": the self-drawing curve animation and 5 features, named "Dose accumulation" and "Lab test journal" (the app's own names ×6). [PA-33; decisions.md:123]
- **PRD-ONB-4** Goals: "What are your goals?" / "We'll tailor your tracking around them."; 18 goals alphabetised by the localised label (fitness, strength, fat loss, endurance, body composition, wellness, energy, sleep, hormonal balance, longevity, immune, recovery, skin & collagen, mood, sexual health, joint & bone, cardiovascular, stress), several at once, shared with Settings; Continue dim until one. Goals feed no math. [D 2026-09-14 #298; PA-34; lib/profileGoals.js]
- **PRD-ONB-5** What you use: peptides / hormones / GLP-1 / oral (multi-select, at least one) → `tracking_types`. [code: OnboardingFlowScreen COMPOUNDS; 07 R2]
- **PRD-ONB-6** About you: the prototype sentence; name; birth month (4-across grid); birth year typed, 4 digits, 1900 … (this year − 18) — outside that the adults-only note "DoseTrace is for adults: enter a year of birth between 1900 and {this year − 18}." shows and Continue stays dim (never a silent refusal); sex at birth (Male / Female bar, no default); country required, picked in a bottom sheet with search and Done. Required-field legend. Month is not used for the 18+ test (year only — AD-43; its source is decisions.md:300, not the unsigned premium-and-auth note) → G-223. [D 2026-09-15 #300-301; PA-35; 07 R3]
- **PRD-ONB-7** Your routine: the 5 activity levels of the calculator (Desk job, Light, Moderate, High, Very high), each a bold title with its sub-line, and the Yes / No "has a provider" bar. Same 5 levels as Edit profile and Progress. [D 2026-10-01 #232; PA-36]
- **PRD-ONB-8** Before we begin: four confirmations (medical, estimates, AI, privacy); Continue only with all four ticked **in this screen in this run**; the AI line reads "AI only when you use it — A photo or report you scan, or a meal you describe in the AI food log, is sent to Anthropic to read it — only with your consent." (reads, never analyses, ×6); Terms of service and Privacy policy linked (in-app Terms; dosetrace.io/privacy-policy). Unticking writes "no consent"; a resumed stash never pre-ticks the boxes. [D 2026-09-29 #122; PA-39, PA-81, PA-95]
- **PRD-ONB-9** Never miss a dose: "Enable notifications" (the OS question) and "Not now" both go to Create account with the consent box ticked for this person; on Android "Enable notifications" first opens the setup step of PRD-ONB-10 (`screens/OnboardingFlowScreen.js:306-310`; SP-4). [PA-40]
- **PRD-ONB-10** Android only: after "Enable notifications" is answered, the step "Make sure your reminders arrive" shows the reminder items and the "N of M ready" bar only (no schedule or test reminder: no protocols yet), with "Continue" ("Done" when all readable items are OK) and "Set up later"; both continue onboarding exactly as before; showing it marks the setup seen on this phone. Never on iPhone. After "Not now" the step is skipped. [D 2026-10-07 #623, #625; SP-4] The step also shows when the OS dialog was denied: a denial is an answer, so this matches signed SP-4 ("right after 'Turn on notifications' is answered") — not a divergence and nothing to amend (DV-142 closed; DL-50 withdrawn as moot; G-88 closed).
- **PRD-ONB-11** Every Continue saves the answers typed so far on the device (only filled keys; an empty step never clobbers an earlier one; consent written true/false each time). [PA-38; 07 R4]
- **PRD-ONB-12** Killed mid-onboarding: the next launch reopens onboarding (step 0 unless profile + consent complete, then "Before we begin" with the boxes empty — whoever holds the phone confirms for themselves). Back from Create account in the same run reopens "Never miss a dose" with every value kept. [PA-62, PA-92; 07 R5]
- **PRD-ONB-13** Shared device: onboarding answers belong only to the person who passed "Before we begin" in this run; they are written only into that person's new or existing account, fill ONLY the fields the account is missing (never overwrite a stored value), and leave the device as soon as an account has them and on any real sign-out. They never carry into a different person's sign-up (email, Apple or Google). [DL-100 (was the coordinator lines #472-473); PA-71…PA-73, built; checklist signature owed, Approvals item 7]
- **PRD-ONB-14** Onboarding copy makes no outcome or efficacy claims and never says data "stays on your device" (it is cloud-synced, "encrypted in transit and at rest" — see PRD-DATA-10 for the policies' wording). [D 2026-09-08 #125; 2026-09-09 #385]
- **PRD-ONB-15** Main's curve animation is restored on the features step; motion respects Reduce Motion. [D 2026-09-29 #297; #74]

#### Sign-in, sign-up, reset (Auth)
- **PRD-AUTH-1** Create account view per the prototype: back chevron, curve icon, title, sentence, Apple button first, Google second, "or", email ("you@example.com"), password with show/hide eye, the consent row "I agree to the Terms of service and Privacy policy" (both linked, word order per language) — always shown — "Create account", "Already have an account? Sign in". [PA-50, PA-63]
- **PRD-AUTH-2** Sign-in view: "Sign in", "Sign in to your account", Apple, Google, email, password with eye, "Forgot password?", "Sign in", "Create account". Auth opens on what was asked for (welcome link → Sign in; last onboarding step → Create account; otherwise Create if the stash has consent, else Sign in). [PA-51; 07 R19] Someone who typed answers and then chose "Sign in" lands back on onboarding after a restart → DL-59, G-218.
- **PRD-AUTH-3** Checks before sending, each a DoseTrace error sheet, in order: empty fields, invalid email (`^\S+@\S+\.\S+$`), password under 6 characters (create only), consent not ticked (create only). Passwords are trimmed identically on sign-up, sign-in and reset. [PA-52, PA-86; 07 R15]
- **PRD-AUTH-4** An email already registered: a sheet explains (naming Apple/Google and Forgot password?) and the user stays on Create account with the address kept. [PA-53]
- **PRD-AUTH-5** Apple button = the system Sign in with Apple button per Apple's HIG ("Continue", black on light / white on dark, 52 pt, first). Google button per Google's branding guidelines (Google Sans Medium bundled under OFL, current G colours, 12 pt gap, light/dark per theme, "Continue with Google", same height as Apple; 17 pt text accepted). Google always shows the account chooser. [D 2026-10-02 #40; PA-54, PA-55; 07 R20]
- **PRD-AUTH-6** Apple / Google from Create account honour the consent box: unticked → the consent sheet, nothing written, no sign-in started; ticked → consent recorded; a cancelled or failed sign-in restores the stash; a cancel is silent; a second tap is ignored; one auth action at a time. [PA-59, PA-80, PA-84, PA-98]
- **PRD-AUTH-7** "Continue with Apple" also on Android (accounts created with Apple must be able to sign in there): shown only when the server side is configured (Apple provider on and `/authorize` answering with Apple's page for a Services ID); never a dead button; web OAuth + PKCE + `dosetrace://auth-callback`; the Android button must use Apple's official artwork — store-owned controls follow the store's rules 100 % (AD-74, founder decisions.md:40; the coordinator's "keep the drawn glyph for now", :497, is superseded); today it draws its own glyph (`screens/AuthScreen.js:65-73`) → G-199; the artwork download waits for the founder's go (Approvals item 4). **Live since 2026-10-03:** the founder completed the Apple and Supabase setup and added the `dosetrace://auth-callback` redirect (`STATE.md:17`); a live probe of `/auth/v1/authorize?provider=apple` on 2026-10-12 returned 302 to Apple with the Services ID, so the button shows; a real Android Apple sign-in is a founder device test that is not recorded in the repo (AD-30). The stale line "today it answers 400" in premium-and-auth.md "Manual setup" step 7 is wrong. Only the ship-check Gate B allow-list text still lacks `dosetrace://auth-callback`. [D 2026-10-03 #483, #497; PA-110…PA-114, PA-120, PA-124, PA-125, PA-128] → G-114 (doc only). Because Android Apple accounts are real, the Android paths for account deletion (manual-revoke note, no `apple-link`) and for display names (PRD-GATE-3, DL-57 / DV-084) are live behaviour.
- **PRD-AUTH-7a** The Apple web client secret that Android Apple sign-in depends on **expires on 2027-04-04** (`STATE.md:17`). It must be regenerated (`scripts/apple-client-secret.cjs`) and the new secret saved in Supabase before that date, with a dated reminder; when it lapses every Android Apple sign-in fails at the token exchange (the button still shows: the probe checks only `/authorize`, `lib/appleWebCheck.js:7-12`). [STATE.md:17; PA-123; verification 05 O-1] → GAP G-138 (DV-211, an ops item: the founder's console step with the .p8 he keeps, Approvals item 5)
- **PRD-AUTH-8** Sign-in errors are DoseTrace sheets with precise friendly messages (wrong password, not confirmed, too many tries, network); raw server text is never shown; an unconfirmed address offers Resend in the same sheet. [PA-58; D 2026-09-29 #124]
- **PRD-AUTH-9** Account created (email confirmation on): green check, title, sentence with the email in ink, spam hint, Open email app, Resend link (sheet, then a 30 s countdown), Sign in with my account, "Wrong address? Go back" (signs up again with the answers); Back returns to Create account. [PA-57, PA-93; D 2026-09-18 #302]
- **PRD-AUTH-10** Email links: a confirmed address shows "Email confirmed" (DoseTrace sheet); a link that cannot be used (expired, used, opened on another phone) says so ("the address may already be confirmed"); a confirm link while signed in shows nothing and never switches accounts; each emailed link is handled once (remembered on disk only after it worked or the server refused it, so an offline failure can be tapped again). [PA-66, PA-82, PA-91]
- **PRD-AUTH-11** Forgot password: no email → a sheet asking for it; with email → "Reset link sent" with "If an account exists for {email}, we sent it a password reset link…" ×6. [PA-56]
- **PRD-AUTH-12** Reset password: "Set a new password", "Choose a new password for your account.", two fields with the eye, "Save new password"; success "Password updated / You're signed in with your new password." → Done → Today. Every button translated; server errors (same password, weak, expired/used link, network, rate limit) mapped to friendly sentences ×6. [PA-60, PA-61, PA-65]
- **PRD-AUTH-13** Reset safety: the link's session lives in an isolated client and a pending recovery (Keychain, one hour); killing the app reopens Reset password; the signed-in account and the password change only happen together on Save; "Not now" drops the link (a pending reset never locks anyone out); a dead link session ends the reset with "This link has expired…". [D 2026-10-03 #476-477; PA-76, PA-90, PA-96]
- **PRD-AUTH-14** A reset link for another account than the one signed in asks first, naming both: "Sign out and continue" (the deliberate sign-out — push, then wipe, never forced; blocked and explained if anything is unsynced) or Cancel (link dropped; closing the sheet = Cancel). [D 2026-10-03 #476; PA-75, PA-94]
- **PRD-AUTH-15** No native alert anywhere on paywall, sign-in, onboarding, reset or email-link messages. [PA-64]
- **PRD-AUTH-16** After `SIGNED_IN` (deferred, never inline): clear auth entry + typed email draft, start purchases for this user, start the sync engine, apply the fresh onboarding stash (fill-missing), cross-account guard, full import (empty local DB) or sync, reality-check migration, notification permission + full reminder resync + push token. `onAuthStateChange` stays synchronous. [CLAUDE.md; 07 §3.3; 08 §1.3]

#### Profile gate and 18+ gate
- **PRD-GATE-1** Every signed-in account missing any of 8 required fields — name, birth month AND year, sex (male/female), country, goals, activity, what you track, provider — is held at "Finish setup" (paying users and testers included; `PROFILE_GATE_SINCE = 2020-01-01`, nobody grandfathered). "I need the data" — do not re-litigate. Country stays required. [D 2026-09-09 #299; 2026-10-03 #456 (coordinator block, §0.2); 07 R37-R38] The gate checks presence, not validity → G-217.
- **PRD-GATE-2** Finish setup = the same onboarding screens in signed-in mode: only the missing steps (goals, what you track, about you, your routine) + consent if never recorded + a finish screen; Sign out in the corner. It writes only the fields of the steps it showed (never blanks a hidden field), follows the account if its profile lands mid-flow, prefills a fresh account from its own onboarding answers; a failed save is a DoseTrace sheet with everything kept; success → `USER_UPDATED` → the gate re-evaluates. [PA-41; 07 R7-R8]
- **PRD-GATE-3** Apple/Google sign-ups with missing fields go through Finish setup. Google and Apple-on-Android never provide a display name, so those users always see "About you" unless their fresh stash had it; Apple iOS writes the name Apple returns (it may overwrite an existing name) → DL-57. [D 2026-10-03 #456; 07:D-20]
- **PRD-GATE-4** Old accounts whose stored birth year makes them under 18 are asked once, on the next open, to confirm "I'm 18 or older" — and to pick their real birth year on the app's year wheel (this year − 18 back to 1900, nothing preselected, Confirm off until a year is picked); confirming writes `adult_confirmed_at` and `birth_year` in one merge-only write; the calorie inputs then use the new year. Never asked of confirmed or adult-aged accounts. No birth year = the profile gate, not this one. [D 2026-10-03 #482 (the confirmation, founder); DL-101 (the real-year ask, was the coordinator line #496); PA-100…PA-108]
- **PRD-GATE-5** Not confirmed: the sheet offers only Download my data, Delete account (the two-step delete) and Sign out (asks first, never wipes unsynced changes); nothing is ever deleted automatically. [PA-104, PA-122]
- **PRD-GATE-6** Both gates may be answered offline: the answers are kept on the phone and written when back online; both gates offer the same "Sign out anyway" (with confirmation) as Settings. [logic = DL-92 (it places the coordinator line decisions.md:542; A-94); the "Sign out anyway" button on the gates is new UI → OPEN-24 item 10] → GAP G-113 (not built: gates cannot be answered offline, no "Sign out anyway")
- **PRD-GATE-7** Old 4-level activity values are migrated on read (sedentary → Desk job, moderate → Moderate, active → High, very_active → Very high), the old value kept as `activity_level_legacy` when rewritten; every activity write stores `activity_scale: 5`. [D 2026-10-03 #455, #471; PA-37, PA-87]

#### Sign-out and account deletion
- **PRD-ACCT-1** Sign out (Settings): confirm sheet → the app pushes first; if rows are still unsynced: "Some changes aren't backed up yet … Connect to the internet first" / "Sign out anyway" (with confirmation) / Stay. Only Settings offers "Sign out anyway"; Finish setup, the 18+ sheet and the reset Continue never force. [D 2026-09-28/29 #309; 07 R27-R28]
- **PRD-ACCT-2** An intended sign-out wipes the phone: local database (11 tables), scheduled and delivered notifications, snooze records, RevenueCat log-out, onboarding stash and seen flag, legacy reality-check keys and per-device migration flags, open site questions, Fold selections, in-memory drafts; this device's push token is removed first. A spurious SIGNED_OUT (token refresh failure, session hiccup during an update, Apple credential revoked) keeps everything. An interrupted wipe completes on the next cold start only for the data's own owner. [D 2026-09-12 #370; 07 R27-R33; 08 §4.10]
- **PRD-ACCT-3** Device-level keys that today outlive an intended sign-out must not leak one account's state into another person's use of the phone. **Inherited by the next account today (real leaks):** AI consent (`dosetrace_ai_extraction_consent_v4`, `lib/aiConsent.js:19`, not in `runWipeSteps`), the entitlement cache's last uid (`dosetrace_entitlement_last_uid`, never cleared), the Missed-scan watermark / time zone / zone history (`dosetrace_missed_since`, `dosetrace_missed_tz`, `dosetrace_missed_tz_since`, `dosetrace_zone_history`, `lib/doseActions.js:123-129`), alert snoozes (`dosetrace_alert_snooze`), vial-low-sent (`dosetrace_vial_low_sent`). **Residue only (per-user keys, never inherited):** the curve view (`dosetrace_curve_view_{userId}`) and the food chat draft (`dosetrace_food_draft:{uid}`). Explainer flags are not a leak (G-117, closed). [logic: P-3 + BK-14 (a real sign-out clears the account's drafts) = AD-05, DL-52] → GAP G-106, G-109, G-110, G-12, G-87; DL-52, DL-55
- **PRD-ACCT-4** Cross-account guard: when a different account signs in on the phone (cold start or `SIGNED_IN`), the previous account's local data is discarded (privacy over keeping unsynced data that belongs to another person); its reminders are cancelled before import. `[code]` [coordinator line decisions.md:508-509, never put to the founder; 03 R-41] Whether the previous account's unsynced rows may be discarded without a warning collides with "never lose user-entered data" and waits for the founder → OPEN-21 (11).
- **PRD-ACCT-5** Delete account (Settings or 18+ sheet): two confirmations (DoseTrace sheets); offline → "can't delete offline", nothing changes; the server revokes the Apple token best-effort (delete always wins), deletes every synced table and the usage/token tables, then the auth user; the phone wipes and signs out exactly once however the Apple note is closed; the Apple-access note points to account.apple.com on Android and to the Settings app on iOS. [D 2026-09-19 #304; 2026-10-01 #376; PA-121, PA-126; 07 R34-R36]
- **PRD-ACCT-6** Deleting the account does not cancel a store subscription; the app must say so before the deletion. [logic: P-14 copy must be true; 07 §8 "Account deleted while subscribed — nothing tells the user" = DL-60] → GAP (DV-087); the line and store link ×6 are new UI → OPEN-24 item 6
- **PRD-ACCT-7** A lost response after the server deleted the account must not be reported as "offline" with the account gone. [logic: P-14 copy must be true — a plain bug, DV-009 "lost-response half: No (bug)"] → GAP G-116 (SUSPECTED)
- **PRD-ACCT-8** When the server confirms the account was deleted or the session revoked, scheduled reminders are cancelled (private names, nobody to remind); a network failure never cancels anything. [logic = DL-85 (it places the by-logic line decisions.md:599 under the founder's reminder principle, :597-601)] → GAP G-75

**States the user can see.** Loading; Onboarding (8 steps, Android setup sub-step); Auth (Create account / Sign in / Account created); Reset password; Email confirmed / link failed sheets; Other-account reset question; Finish setup; 18+ confirmation; Main; Signing out (spinner); "changes not backed up" sheet; Delete confirmations; Apple-access note. Diagram: 07 §5.1.

**Edge cases the product must handle.** Killed on any step (stash kept, PRD-ONB-12); killed between sign-up and confirmation (metadata already in the sign-up); confirm link on another phone (no PKCE → explained); reset link while signed in as another account (PRD-AUTH-14); Apple private-relay email (separate account from a real-email sign-up; UNVERIFIED); Apple name only on first authorization; offline sign-out with nothing unsynced (local session removal); offline sign-out with unsynced rows (blocked/explained); offline cold start with an expired access token routes to Auth although the session is stored (SUSPECTED) → DL-54, G-179; iOS reinstall (Keychain session may survive while AsyncStorage is empty; UNVERIFIED) → DL-63, G-193; under-18 year typed in Settings (refused by the same rule); a profile write failing offline in Settings (must say so → GAP G-107).

**Free / Premium.** Nothing in this chapter is gated. Analytics "Usage analytics" is a Settings opt-out (an install id "not linked to your account" since 1.3.0 — DL-84; decisions.md:553-557; the wording ×6 is Approvals item 2.6).

---
### 4.2 Today, doses, Dose log

**Purpose.** Today is the daily home: what is due now, what happened, what needs attention — an honest journal, never advice (02 §1). Marking a dose must be one tap for an oral dose and one question (the site) for an injectable, must land on the right slot and day, and must move supply exactly once. The Dose log is the full, correctable history.

**Entry points.** Tab "Today"; a dose reminder body tap (Today with `focusDose`); the notification "Mark complete" button (orals logged in the background; injectables open Today on the site question); the morning summary tap; My Protocols "Mark complete" on a card (Today runs the take); return to the foreground / local midnight (re-date); sync events. Dose log: tracker "View history ›", Protocols hero "Dose log", the Fold right page (default). (02 §2.2-§2.4)

#### Today layout
- **PRD-TODAY-1** Order: header (localized long date + "Today") → "From your reminder" (only when a notification focus resolves) → Alerts box (gone when none) → Pending from yesterday → tracker (only with at least one active protocol) → AI food log hero (only while a reality check is open) → empty state (no active protocol) → Doses ("{x} of {y} complete", the dose cards, the "all caught up" card, the Complete fold) → Tomorrow / Next 5 days (one folded list with counts, "N more scheduled later") → disclaimer. The greeting, the Protocols tile, faded cards and the share card are removed. [D 2026-09-29 #141; 02 §2.1] (FL-33's "under the alerts" text is stale → GAP G-130)
- **PRD-TODAY-2** Today keeps ALL features; layout may change only through an approved picture. [D 2026-09-29 #139]
- **PRD-TODAY-3** One popup at a time on Today (site question, vial prompt, "Still going?", Skip sheet, Today sheet, the embedded Dose log editor on the Fold); queued items open 450 ms after the previous one closes. [02 R30; BK-20] The inactivity prompt ("Still going?", `TodayScreen.js:530`) checks only the site picker, the queue and the Log editor — not the vial prompt, the Skip sheet or the Today sheet — and the orphan sheet runs in the same focus, so two can open together → GAP G-142.
- **PRD-TODAY-4** Today re-dates when the app returns to the foreground on a new local day and at local midnight while focused (timer at midnight + 1 s). [A-82; 02 R31]
- **PRD-TODAY-5** Today refreshes on focus and on sync events (`import_complete`, `sync_complete`, `data_changed`). [02 §2.2]
- **PRD-TODAY-6** The empty state (no active protocol) shows an icon, title, sub and "Add a protocol". [D 2026-09-29 #133] The button opens the Protocols tab, not the wizard → `[logic = DL-23]` it should open the add wizard (the button's own words; one tap fewer for activation) → GAP G-39
- **PRD-TODAY-7** Disclaimer at the bottom of Today when at least one active protocol exists (hidden in the empty state, `TodayScreen.js:2259`). [02 §2.1]
- **PRD-TODAY-8** "From your reminder": a dose-reminder body tap shows that dose's card highlighted at the top while it is still open today; a focus for yesterday's slot highlights the pending row; a focus for a dose already logged shows nothing (no message) `[code]`. [A-44; 02 §6.11] The focused slot (`slotMs`, `ti`) is ignored for today: the card acts on its earliest open slot → GAP G-10.

#### Dose cards
- **PRD-TODAY-20** A protocol is on Today when its next dose moment (counting only Complete doses) is today or overdue; Tomorrow = 1 day ahead; Next 5 days = 2–6 days ahead; "N more scheduled later" beyond. [02 R18] Tomorrow / Next 5 show only the protocol's first time of that day and count protocols while labelled as doses (a twice-daily protocol reads "1 dose") → GAP G-17.
- **PRD-TODAY-21** The whole card opens that protocol (phone: My Protocols detail; Fold: the protocol page on the right page — A-115). Skip and Mark complete sit on the card. [D 2026-09-29 #145; FR-1]
- **PRD-TODAY-22** Card content: colour dot, name, Geist Mono amount, "Draw to {n} units" with the syringe drawn to scale for a powder (recon) dose with a mixed vial — ready-to-use cards show no draw, as in the prototype (`prototype.html:975`) (numbered every 10 from 0, minor ticks every 2; over capacity the full syringe in risk red), "Day X of Y" / last site / streak on one line, full site names, vial cells, the Due tag. [D 2026-10-02 #142; #61-62]
- **PRD-TODAY-23** A slot is open when it has no row (or a Missed row); rows at a slot's exact time (± 60 s) belong to that slot; other rows fill remaining slots in written order, earliest first; a Skipped row counts as filled. The card offers only the earliest open slot. [02 R17; A-78] `cardSlot` treats a Missed row as filled while `cardPlan` treats it as open (no effect today: today is never scanned) → G-203.
- **PRD-TODAY-24** "Due" (outline tag) when the card's next open slot is ≤ 5 minutes away or past; a slot without a time is never "Due". [D 2026-09-29 #133; 02 R16] A grey "reminder" tag shows before Due when a reminder time exists → AD-38 (only "Due"; the tag goes) → G-205. The Due tag is computed at render with no timer → GAP G-6 (SUSPECTED stale until any re-render).
- **PRD-TODAY-25** A skipped slot shows its own line "Skipped — you can still log it" with Mark complete for that row while the day's Complete count is below the number of slots (A-78 slot identity). [D 2026-10-01 #157]
- **PRD-TODAY-26** "All caught up" card when no protocol is left in the day's cards and at least one protocol was due today; no duplicate text after the day-complete pulse. A day with any skipped slot never reaches "all caught up" `[code]` → DL-12: "All caught up" shows when no open slot remains (a skip counts as handled) and the skipped line stays visible; the picture is OPEN-24 item 12 → G-204. [D 2026-09-24 #164; 02 R19, D10]
- **PRD-TODAY-27** Header count "{x} of {y} complete" = Σ min(Complete today, expected) ÷ Σ expected over active protocols due today. [D 2026-10-02 #99; 02 R20] It must agree with the Today ring → C-1, GAP G-2.
- **PRD-TODAY-28** "Last: {site} · {n}d ago" = newest row with a site in the last 30 days of that protocol. [02 §6.12] The day count is elapsed 24 h, not calendar days; the UI never says "0d ago" — a dose logged at 23:00 yesterday reads "Last: {site} · today" the next morning (CONFIRMED by code, `TodayScreen.js:588-590, :1930`) → GAP G-18.
- **PRD-TODAY-29** The protocol name shown everywhere for one protocol is the same: the translated compound name when the protocol has a `compound_id`, else the user's own text. `[logic: P-6 one term per concept; the language follows the app = DL-13]` Today's Skip sheet, site picker title, vial prompt and the Dose log use the stored name → GAP G-15.

#### Tracker (rings, week, streak)
- **PRD-TODAY-30** Tracker: three windows (Today, 7 days, 30 days) as % plus "{n} of {m}" on two lines; the week as circles (done / partial / missed / rest); the flame vector + streak; "View history ›" → Dose log. Shown only with at least one active protocol. [D 2026-09-29 #143; A-79] Visual (three rings vs the prototype gauge with 20 soft ticks) → AD-52 (the deviation list). The ring count-from-zero, the day-complete pulse and the curve intro on every open wait for the founder → OPEN-18 (4) (Conflict 40, decisions.md:441; his Motion "Version B" approval, :74, and "count-ups only when values change", :57; AD-44 moved there) → G-206.
- **PRD-TODAY-31** Ring rule: doses, not days (Complete ÷ due); Today with nothing due says "Nothing due", never 0 %; 7- and 30-day windows are rolling over slots whose time has passed; a late dose matches **its own slot** within ± half the interval; a skip is not complete; as-needed doses are excluded (no as-needed concept exists → DL-65, G-207); never above 100 % (an extra or duplicate log never adds); declared history (before the protocol was created − 1 h) excluded; ring colour = data blue at every value. [D 2026-09-29 #144] A late dose is credited to the NEXT slot when it is nearer (daily 08:00 taken yesterday 21:00 shows today 100 %) → GAP G-1. Note: 21:00 is 13 h after the 08:00 slot, outside "± half the interval" (12 h), so the code applies :144 literally; the real contradiction is between the rings and the Missed scan's same-local-day rule (`lib/missedDoses.js:149-155`), which counts that dose for yesterday. Decided: a dose logged on the slot's own local day belongs to that slot, however late (AD-70 — fix F1 of the approved Today v2.1, decisions.md:140); the rings follow the same rule by DL-04.
- **PRD-TODAY-32** The rings include active and ended protocols (an ended protocol's past stays counted up to its end); deleted protocols are excluded. [02 R21; 01 §6.17]
- **PRD-TODAY-33** Tracker streak — as built and as on the binding prototype a **day** streak, "{n} days without a miss" (its unit and its words wait for the founder → OPEN-17): consecutive days on which every protocol due that day had all its expected Complete doses; rest days neither add nor break; today counts only once complete; "On fire!" at ≥ 7. [binding prototype `prototype.html:970`; Today v2.1 "the flame + streak", D 2026-09-29 #143; 02 R22] The founder's 2026-10-05 "doses, not days" rule is scoped to the **protocol card** streak (commit b215b32, `lib/doseStreak.js:2`; PRD-TODAY-35), not to the tracker; the tracker's unit (days or doses) and its words (copy ×6; recommended: days, with words that read right for a weekly user) are a founder decision → OPEN-17. Only the look-back is a logic fix (DL-03): capped at 31 by a 30-day look-back today → extend to 365 days like the card streak → GAP DV-034.
- **PRD-TODAY-34** Week circles: last 7 days; rest (nothing due) / complete / partial (some due protocol had a Complete) / missed (no Complete at all). [02 R23] Two meanings of "missed" (circle vs Missed rows) → DL-02 (each labelled by what it counts) → G-167.
- **PRD-TODAY-35** Protocol streak on the card: doses in a row, never days (founder 2026-10-05, scoped to the protocol card — commit b215b32, `lib/doseStreak.js:2`); a fully complete due day adds its doses; rest days skipped; stops at the first not-fully-complete due day or before creation; looks back 365 days; logged rows only. [02 R24; lib/doseStreak.js]
- **PRD-TODAY-36** The Mark-complete animation lands in 360 ms (a drop flies to the tracker); the card and tracker update exactly at the landing; Reduce Motion honoured. [D 2026-10-01 #161; A-80] Today the card and the rings update at the landing, but the streak and week circles change at once (`fetchStreakData()` runs immediately, `TodayScreen.js:887`) → GAP G-145.

#### Pending from yesterday
- **PRD-TODAY-40** Yesterday's unlogged slot stays on Today in "Pending from yesterday" until slot + 12 h, if the protocol existed then (created − 1 h), the day is not already at its doses-per-day Complete count, and (without zone history) the slot is after the last time-zone change. [D 2026-09-28/10-01 #155; S-17; 02 R11]
- **PRD-TODAY-41** "Complete" logs at yesterday's SLOT time (a 00:30 tap is recorded at 20:00) — injectables ask the site first; "Skipped" writes a Skipped row at yesterday's slot. [D #155; FX-26]
- **PRD-TODAY-42** With a pending slot, Mark complete on the same protocol's today card asks "yesterday or today": "Log for yesterday" = the pending take; "Today's dose — skip yesterday" = today's take + a Skipped row at yesterday's slot in one commit (Cancel = no rows); Undo removes both. The day question comes first, then the site question, then one commit. [D #153, #155; FX-26]
- **PRD-TODAY-43** A notification tap after midnight but inside slot + 12 h logs to yesterday's slot; later, a snoozed copy logs now. [D #155; 02 R32]
- **PRD-TODAY-44** Pending rows on the Fold open the protocol page on the right page (no actions there). [FR-1]

#### Alerts
- **PRD-TODAY-50** Alerts stay on top in one box with a count; each row: icon, title, attention dot when due, body, its own snooze round → "Tomorrow" / "In 3 days" (both until 09:00 that day); no Remove, no X, no "Later today". [D 2026-09-29 #146; 2026-10-02 #163] (builder call on the founder's deviation list → AD-52)
- **PRD-TODAY-51** An alert that names one protocol opens that protocol. [D 2026-09-29 #146] Supply-low and vial-expiry alerts open the Protocols heroes instead → GAP G-5.
- **PRD-TODAY-52** Snoozes are per device (AsyncStorage) and end at 09:00 of the chosen day. [02 §3.10] A snooze that ends while Today stays focused reappears only after the next refresh → GAP G-7. Snoozes survive an intended sign-out → GAP G-87.
- **PRD-TODAY-53** Reality-check alert (title "Reality-check weigh-in"), shown while a check is open and not snoozed. Body follows the check's real state (A-118): before day 21 "Weigh in on {date}"; due "Ready now — tap to log your weight"; weighed in with the food run missing "Weight logged — {n} more day(s) of food logs in a row for your result"; ready "Your reality check is ready — tap to see it". Tap → Progress focused on the reality check. Date-only fallback only when the state cannot be read. [D 2026-10-09 A-118; 04 §6.1] "Ready" also shows when the result is locked or cannot be saved → DL-26, OPEN-09.
- **PRD-TODAY-54** Offline alert "Waiting to back up" / "You're offline. Your changes are saved on this phone and back up when you're online again." only when connectivity is known offline AND at least one row is unsynced; tap = sync now; it clears after a sync with nothing pending. [A-46; 02 R28] It cannot actually be snoozed → GAP G-8.
- **PRD-TODAY-55** Supply low (one rule, C-15): any active protocol's newest active vial with 1–3 doses left: "{name} — {n} dose(s) left" (singular for 1, French singular for 0 and 1), "{names} running low", "{count} protocols running low"; amber with days coloured by deadline. Oral bottles are not covered → OPEN-02 (G-184). [D 2026-10-01 #147-148; A-65]
- **PRD-TODAY-56** Vial expiring (C-16): days left ≤ 7 — recon: mixed_on + validity window; ready-to-use: box date — "{name} — {n} days left" / "{name} — expired" / "{count} vials expiring soon". [02 §6.9]
- **PRD-TODAY-57** Bloodwork due: the newest lab `report_date` is ≥ 182 days old; "It's been {months} months since your last panel" with months = max(6, round(days / 30)); tap → Lab test journal; no alert when no lab was ever logged. [02 R27; 06 R27] Regulatory review of an app-chosen interval → OPEN-13 (G-191).
- **PRD-TODAY-58** Reminder alerts (detail in 4.4): Silent mode on (own card); "Your reminders are blocked"; "Reminders may be late" (Android exact alarms off); "Battery may delay reminders"; "Your reminders may stop" (hibernation); "Reminders not refreshed for {n} days"; two or more of blocked/late/battery/stop/stale → one card "{n} fixes for your reminders". Late, battery, stop and stale open the reminder screen at their item; blocked, Silent and the combined card open the top of the screen (`TodayScreen.js:1581-1659`). [D 2026-10-05 #561; 2026-10-07 #604, #615-616, #626; RC-6, EA-3, RG-5, SP-6]
- **PRD-TODAY-59** Android, once per phone: Today (in front) opens "Make sure your reminders arrive" automatically, 600 ms after focus, for a user with a reminder-time protocol who has not seen it on this phone. Never again automatically. [SP-5]

#### The AI food log hero on Today
- **PRD-TODAY-60** Shown only while a reality check is open (outside a check the food log lives on Journey); line "Reality check · day {d} of 21 · {n} of 7 days in a row" (EN `nutri_hero_run_today`; the shorter run words, e.g. PT "{n} de 7 seguidos", apply to PT/ES/FR/DE/IT only, decisions.md:114), after day 21 "· time to weigh in" until the weigh-in, then "· weight logged"; today's items and ~kcal, or "day closed"; tap → the AI food chat (or the paywall when locked). [D 2026-09-27 #160; 2026-10-02 #114; FL-33, FL-43; A-118]

#### Marking doses (Today card, notification, Protocols card, Dose log — one path)
- **PRD-DOSE-1** Every place that marks a dose complete — Today card, skipped line, Pending block, notification action, Dose log, My Protocols card — writes through one function; a dose already logged is never logged twice; a Missed row at the slot is turned into Complete (never duplicated); vial and bottle counts move exactly once. [FX-2, FX-7; 02 R1-R3] Exception today: on an ended protocol the Dose log falls back to a plain outcome flip (`LogScreen.js:146`, no cap, no bottle update; "paused" does not exist and deleted rows are hidden) → GAP G-144 (DL-76: the cap applies on every path).
- **PRD-DOSE-2** A day never holds more Complete rows than the protocol's doses per day; a refused tap shows "Nothing new logged" with the reason (DoseTrace sheet). [02 R2; A-38(b)] One cap on every path — Today, the notification action and the Dose log (Missed → Complete included): the protocol's doses per day (DL-76, which closed OPEN-19 (b); DL-67 withdrawn: it would refuse a real dose recorded on a rest day). Today the Dose-log path refuses silently → G-168; its plain-flip fallback skips the cap → G-144.
- **PRD-DOSE-3** Time written: today's Complete = the TAP time of Mark complete, also when the site is answered later or after midnight; a flipped Missed row and any past-day write keep the slot time (noon of that day without a slot); a flipped Skipped row of today takes the tap time. [D 2026-10-01 #153; FX-24; 02 R5]
- **PRD-DOSE-4** Early doses count: a dose logged early on its own day covers its slot by count (no false Missed beside it). [D 2026-09-28 #197; S-18]

**Oral doses**
- **PRD-DOSE-10** An oral dose is written at once on Mark complete, with a 4-second Undo bar ("Dose logged · Undo"). [D 2026-10-01 #152]

**Injectable doses — site before the write (S-25)**
- **PRD-DOSE-11** For a powder (recon) or ready-to-use (rtu) dose, Mark complete asks the injection site first and writes nothing until it is answered: Save = one Complete row with the site; Skip = Complete with no site (sites are optional); Cancel, X or a confirmed Android back = nothing written, the button back to Mark complete and the notice "Not marked complete. Mark it again to log it." for 6 s. A bare Android back asks first (Stay / Leave). [D 2026-10-01 #152-153; FX-23]
- **PRD-DOSE-12** The question is saved on the device before it is shown; an app killed with it open asks again on the next Today open and logs at the original tap time; a question for a dose already logged (other device, banner) or a protocol gone is dropped with "Nothing new logged". [FX-25; 02 §3.2] Never dropped for age — the founder's S-25 line "kept until answered" (decisions.md:379) decides it → AD-76 (was DL-01); decisions.md:459 ("let go after 7 days") is superseded → G-225, and the signed FX-25 evidence cell still cites a test ("a question older than 7 days is let go") that no longer exists. Device-only storage → AD-34 (G-209).
- **PRD-DOSE-13** The site picker: the founder's mannequins, male or female from the profile's sex (male when unknown); subcutaneous = Front / Back, intramuscular = Right side / Left side; each point at the real anatomical site, front views in the medical-chart convention, one row per body area; each area a Right | Left | Both bar (tapping the chosen part again clears it; "Both" stores both side ids); several areas per dose; "Somewhere else" takes typed text; "Longest unused in your log" across all compounds once a site has been logged (the arm counts as one spot) — today Today passes only the last 30 days of logs (`TodayScreen.js:1008-1010`), so a site used 40 days ago reads "not in your log yet" → GAP G-143; the picker shows the protocol name and the time the dose is written at; the disclaimer above Save ("Personal log only. Follow your healthcare provider's instructions for injection technique and site selection."). [D 2026-09-29/30 #192-194; 2026-10-02 #193; 2026-05-02 #131]
- **PRD-DOSE-14** Saving the picker with nothing new never erases a stored or typed site; "Remove site" (shown only when a site is saved) clears the site without undoing the dose. [D #195; A-55, S-20]
- **PRD-DOSE-15** After the write: the toast "Site saved · {site}" (17 pt, 4 s) and an Undo bar with Undo only (no "Add site"). [D 2026-10-01/02 #149; FX-29]
- **PRD-DOSE-16** The site sheet has no "dose logged / Undo dose" header (the dose is logged only on Save or Skip). [D 2026-10-02 #154]
- **PRD-DOSE-17** Recording sites for injections from before the app was installed is deferred by the founder. [D 2026-09-30 #196]

**Skip**
- **PRD-DOSE-20** Skip opens the "Skip dose?" DoseTrace sheet (Cancel / Skip); Skip writes a Skipped row stamped at the slot it skips (tap time only for a protocol without reminder times); nothing when that slot already has a row; never moves supply; Skipped is shown neutral, Missed red. [D 2026-10-02 #150; 2026-10-01 #151, #157; 02 R6-R7]
- **PRD-DOSE-21** A skipped slot can still be marked complete: the same row turns Complete (tap time; site first for injectables; supply once); Undo restores Skipped at its original time and site. [D #157; A-78]
- **PRD-DOSE-22** After a Skip the slot's reminder is not cancelled `[code]` → DL-08 (decided: Skip cancels that slot's reminders → GAP DV-035). Whether Skip gets an Undo bar waits for the founder → OPEN-19 (d) (DV-130). "Didn't take" on a pending-from-yesterday slot already shows an Undo bar (`TodayScreen.js:710-717`), and that bar says "Dose logged" → G-169.

**Undo**
- **PRD-DOSE-30** The Undo bar shows for 4 s after a take (Today card, skipped line, Pending Complete) and after a Pending Skipped; the timer pauses while a popup covers it; a new take replaces it; never twice for one log; never after the row was deleted in the Dose log. [02 §3.6]
- **PRD-DOSE-31** Undo: a flipped row goes back to Missed/Skipped with its old time and site; otherwise the row is tombstoned; "skip yesterday" rows go too; the vial gets one dose back from its current count and reopens only if this dose closed it and no other vial is active; an oral bottle gets its units back; today's count goes back; the vial-finished prompt of that dose closes. [02 §3.6; FX-2] Undo after the protocol was ended/deleted can reopen its vial → GAP G-30.
- **PRD-DOSE-32** Undo does not re-arm reminders the take cancelled `[code]` → DL-09 (A-36).

**Vial finished and inactivity**
- **PRD-DOSE-40** After the take that reaches a powder vial's capacity (and after the site picker has closed, 450 ms), the "All doses logged" prompt opens: "Log new vial" (mix date Yesterday / Today pills or month + day) or "Protocol finished" (today: only closes the prompt; a real end with a "Later" way out is scheduled for 1.3.0 by the founder — AD-11 — and waits for its picture, Approvals item 3 → G-183). Two buttons only — no "Not now" (`TodayScreen.js:2380-2393`). The prompt follows the write; Cancel on the site question shows no prompt. [D 2026-10-01 #152; 2026-10-04 #558; FX-22]
- **PRD-DOSE-41** "Still going?" prompt on Today focus for the first active, started protocol with no Complete dose for max(7, 3 × interval) days (since its last Complete, else created/start), not snoozed within that window, never over another popup: "Keep" snoozes it per protocol (device); "Yes, it's finished" ends the protocol dated at its last Complete dose, removes the Missed rows the app wrote after that end (never a row the user entered), deactivates its vials, cancels its reminders. [DL-87 (it places the coordinator line decisions.md:536); A-86; 02 §3.8] Declared rows count as "last Complete" → GAP G-34.

#### Missed doses
- **PRD-DOSE-50** A slot becomes Missed (a row written by the scan) when it is ≥ 12 h past, not covered by any log in [min(slot − 3 h, the slot's local midnight), slot + 12 h] nor by a later log on the same local day, at/after the scan watermark, after the protocol was created − 1 h, within a 14-day look-back, protocol active at scan time. Today's slots are never scanned. The scan runs on Today focus, a new day, Dose log focus and the adherence report. [D 2026-09-28/30 #197; A-32, A-43, A-81; 02 R12]
- **PRD-DOSE-51** Time zones: first run = watermark now (old history never rewritten); with device zone history, past slots are rebuilt in the zone of their own day; without it, a time-zone NAME change moves the watermark (a real miss just before a zone change is not recorded — accepted). [D #197; S-19, A-51; 02 R13]
- **PRD-DOSE-52** Ended protocols are not scanned; deleted protocols are not scanned. [02 D13] (rings still count ended protocols' unanswered slots → GAP G-11)
- **PRD-DOSE-53** Test03's false Missed rows 132–138 stay untouched; no production SQL on the founder's or Test03's rows without his OK; what happens to existing false Missed rows of real users waits for the founder → OPEN-23 (DL-71 moved there: a Missed row cannot be deleted, `LogScreen.js:112-121`). [D #197, #387]

#### Dose log
- **PRD-LOG-1** Header: title, the streak explanation (moved here from My Protocols), three counts Complete / Skipped / Missed (logged rows only, declared history excluded; plain numbers, no tinted boxes), the shared SegmentedBar filter All / Complete / Skipped / Missed (long German labels shrink to 0.8); a "Curve" button (Premium → Dose accumulation; free → paywall `log_serum`). [D 2026-09-29/10-02 #173, #190; 02 §2.4] The PT tab name is "Histórico" (AD-59); the app still says "Registro" → G-226.
- **PRD-LOG-2** Day sections (local calendar day, newest first); rows with type icon, protocol name, site summary, time, the prototype's green check / status word ("Dose complete / Dose skipped / Dose missed", singular per row). No Site row when no site is stored. [D #100, #190-191]
- **PRD-LOG-3** Missed row tap → "Update this dose" (Mark complete / Mark skipped / Cancel): Complete flips the same row at its slot time (injectables ask the site first; Cancel = stays Missed); Skipped changes the outcome only. Missed rows cannot be deleted. [FX-28; 02 §3.9] On a day already at its daily cap, Missed → Complete does nothing and says nothing → G-168.
- **PRD-LOG-4** Complete or Skipped row tap → the dose sheet (Status, When, Site, Change site for injectables, "Mark complete" for a Skipped row, "Delete this dose"). Skipped → Complete flips the same row (A-50). [D 2026-10-02 #191; A-50]
- **PRD-LOG-5** "Delete this dose" → confirm (plain body approved) → tombstone; one dose back to the vial it used when the app can show that vial held it (a finished vial reopens unless another is active); an oral gives one serving back; a Skipped delete moves nothing; a deleted past-day dose shows Missed at the next scan; Today's Undo of that row is disabled. [D 2026-10-02 #101, #191] (layout A confirmed? → AD-52)
- **PRD-LOG-6** Change site: the site editor in edit mode; Save writes the site; Cancel/back only close; an empty Save never erases. [FX-21, FX-23]
- **PRD-LOG-7** Logs of deleted protocols are hidden while deleted; logs of ended protocols and of unknown protocols stay visible; declared rows (before created − 1 h) stay visible but never count. [01 §6.17; 02 R34]
- **PRD-LOG-8** A Missed → Complete in the Dose log that empties a powder vial must open the same vial-finished prompt as Today. `[logic: one supply rule, FX-22 order = AD-48]` → GAP G-9. (Verification 02: decisions.md:152-153 and FX-22 set the order on Today's take only; extending it to the Dose-log path is logic (DL), not AD.)
- **PRD-LOG-9** The Dose log on the Fold is Today's default right page; a change on either page shows on the other at once (BK-19). [BK-3, BK-19]

**States (02 §5).** Today slot: upcoming → due → complete / skipped → (midnight) pending → (slot + 12 h) Missed row. Dose row: Complete / Skipped / Missed → tombstone. Site question: saved → queued → open → written / dropped. Undo bar: shown → paused → hidden / undone. Alert: hidden → visible → snoozed → visible.

**Edge cases the product must handle** (02 §8). Dose just after midnight for last night (yesterday-or-today question); injectable tapped 23:58 answered 00:03 (logged 23:58 the previous day); app killed between the dose insert and the vial update (dose saved, supply unchanged — SUSPECTED, GAP G-16); notification Mark complete with the app killed (Android orals headless; iOS opens the app); two devices (each scans with its own watermark; duplicate Missed possible before sync — A-48 parked; GAP G-19 note); offline (all local; offline alert); DST (date methods; a 02:30 slot on the spring-forward day UNVERIFIED); travel (zone history); midnight while open (re-date); creation day after the slot (card Due, header "0 of 1", tracker "Nothing due" → GAP G-2); protocol without a reminder time (no Due, never pending or Missed, rings expect it at noon, reminders at 08:00 → GAP G-3; DL-77: 08:00 everywhere); doses per day above the number of times → GAP G-4; finite course past its total → OPEN-03; skip before the slot (reminder still fires → DL-08); Undo after the reminder was cancelled (not re-armed → DL-09); delete today's Complete in the Dose log (slot reopens, reminders stay cancelled).

**Free / Premium.** Everything in this chapter is free. The Dose log "Curve" button leads to a Premium screen.

---
### 4.3 Protocols and supply

**Purpose.** Record what the user takes, how much, how often and from which container. Every other module reads it: Today's cards and rings, reminders, the Missed scan, the Dose log, the curve, the adherence report and supply alerts (01 §1). A protocol is a durable health record (P-3, P-4).

**Entry points.** Tab "Protocols" (heroes → list → detail); a Today card or upcoming row (opens the protocol); a vial notification (opens that protocol); Today's empty state; Today alerts (should open the named protocol → GAP G-5); the limit sheet → paywall; on the Fold the list on the left and the tapped protocol on the right (01 §2.2).

#### My Protocols screen
- **PRD-PROT-1** The tab opens on two heroes: "Protocols" (count of active, each name with its colour dot, the low-supply line) and "Dose log" (Complete / Skipped / Missed counts of logged rows + "Last: name · when"); "+ Add" in the header; the streak explanation lives at the top of the Dose log; no empty-state tips. [D 2026-09-29 #173]
- **PRD-PROT-2** The list: "‹ Protocols", title + "+ Add", sort pills Due next / A–Z / Vial age / Recently added / Type (saved per device), cards flat or grouped by type, then the Ended section, then Recently deleted. [D 2026-09-29/10-01 #174; 01 §2.1]
- **PRD-PROT-3** Sort rules: Due next = the full next-dose moment (date + time) as Today computes it (Complete-only counts); A–Z by the localized display name; Vial age = oldest mix date first (no mix date last); Recently added = newest first; Type = Lyophilized / Ready to use / Oral sections. [01 R-60…R-64] Vial age ignores each protocol's validity window and puts every ready-to-use vial last → GAP G-24.
- **PRD-PROT-4** Protocol card: dot, name, size · dose · frequency, vial cells + "N of M doses left" · days left (or "M doses per vial" with no vial), tags (Low, Past window, type, goals), and "Mark complete" only when Today would offer that dose (today's open slot or yesterday's pending slot); the tap goes to Today, which runs its own take (site first for injectables). [D 2026-09-28 A-42; 01 §3.13]
- **PRD-PROT-5** Protocol page order: calculator first (the syringe hero for powders / ready-to-use; the serving hero for orals), then vial, schedule (frequency re-derived in the current language, reminder times in 12/24 h, goals), dose details, notes; Edit at the top right (pill/capsule); Delete at the bottom. The syringe hero opens an enlarged zoom sheet centred on the dose. [D 2026-09-29 #175; #189; A-76]
- **PRD-PROT-6** Protocol colour: the 20-name palette B (one hex per colour, ≥ 3:1 on light and dark cards; near-twins accepted); new protocol default Ocean; colours used by other ACTIVE protocols are marked and a duplicate warns but is allowed; the colour shows only as a 9 pt dot or the curve line, never a fill; stored legacy hexes are never rewritten in bulk — they are mapped on display. Keep the "Tip: pick one color…" line. [D 2026-10-02 #43, #55, #176, #382]
- **PRD-PROT-7** Free-feature explainers (reconstitution calculator, vial tracker, reminders) play on this tab the first time it is reached and unused, at most one a day, "Not now" / "Try it", example numbers only; their "used" flags are synced. [D 2026-09-30 #76, #381] — OK on check 2026-10-12 (G-117 closed): "used" is derived from the user's own synced data; only "already shown" is per device (`lib/featureExplainers.js:6-11`)

#### Create — the manual wizard (default, free)
- **PRD-PROT-10** The add/edit wizard is an iOS page sheet: Cancel top left, Back + Next in the footer, a live syringe under the fields, the dose result only once it can be computed. Steps: 1 Name & type, 2 Colour, 3 Dose, 4 Schedule, 5 Vial (powders, new protocols only). Book layout keeps it one centred column. [D 2026-09-29/10-01/10-02 #176; BK-11]
- **PRD-PROT-11** Free plan: + Add (and Save) on a 4th active protocol opens the limit sheet ("Protocol limit reached"; button "Start free trial", body says "try it free for 7 days" → paywall `protocol_limit`) instead of the wizard; the count is re-read fresh from the phone at + Add and again at Save. [D 2026-07-08/10-03 #280, #465; 01 §3.14] Phone-only enforcement, and what a lapsed payer above 3 keeps, wait for the founder → OPEN-05 (DL-24 withdrawn) (G-186). The sheet's "Start free trial" does not ask the store whether this person is eligible → AD-49, DL-82 (G-166).
- **PRD-PROT-12** Step 1 type tiles Lyophilized / Ready to use / Oral (today's style and size); changing type resets the name and clamps the syringe. Compound search shows suggestions only after 2 typed characters (the app never surfaces a compound unprompted), max 8 + "+N more", alias-aware; the list depends on the type; blends (Glow, KLOW, Wolverine) show "{components} · commonly; varies by source" (EN `blend_varies_hint`; the ledger's #205 wording "check your vial" is not in the app); insulins show "Logged for your records — accumulation isn't modeled for insulin."; `Add "{name}"` keeps the user's own name. The name is required to leave step 1 ("Missing name"); typed text equal to a listed compound selects it; the name field's placeholder is "Type a compound" ("Your compound" survives only as the step-2 preview fallback, `protocols_your_compound`). [D 2026-10-02 #172, #177; 2026-09-18/24 #205; 01 R-01…R-05]
- **PRD-PROT-13** Step 3 Dose — powders: compound amount + unit (mg/mcg/IU); diluent pills Bacteriostatic water / Sterile water / Sodium chloride 0.9 % / Other (own text), nothing preselected; water stepper ±0.5 ml (min 0.5; typed comma or dot); "Dose per injection" with the hint "How much you inject each time — not your weekly total."; the IU→mass converter (mg/mcg vials; "Use" fills mcg below 1 mg); syringe size bar 0.3 / 0.5 / 1 ml. [D 2026-07-03 #171; 2026-10-02 #183; 01 §3.2]
- **PRD-PROT-14** Step 3 Dose — ready to use: dose + unit; concentration (optional) + unit/ml; the syringe picker row (option B: one row opening a grouped list — "Insulin syringes · marked in units" / "Larger syringes · marked in ml" (2, 3, 5 ml); an ml size adds "Larger syringes are marked in ml, so the draw is shown in ml."); "Syringes of 2, 3 and 5 ml are for intramuscular injection." is shown in the doesn't-fit explainer and the assistant, not in the picker; vial size ml; box expiry month pills + year pills (this year … +5). [D 2026-10-02 #185; 2026-10-03 #493; AP-21]
- **PRD-PROT-15** Step 3 Dose — oral: dose + unit (mg/mcg/IU/g); form pills (capsule, tablet, softgel, gummy, powder, liquid); "divisible?" for discrete forms (optional, deselectable); serving strength + unit; units per serving; units per container. [01 §3.2] An oral protocol with its dose in IU is blocked at step 3 and at Save with a unit mismatch (`unitsOk` compares `concentrationUnit || 'mg'` with the dose unit, and orals never set a concentration unit, `ProtocolsScreen.js:1793-1810`) → GAP G-139.
- **PRD-PROT-16** Live result: "Draw to {n} units" (one decimal, "50.0 u") or ml on ml syringes; the syringe drawn to scale; the ml line (trailing zeros dropped: "1 mg/ml", "0.5 ml", "1.25 ml"); the small-draw fact under 10 units ("This dose is {u} units — small marks are harder to read accurately.", never suggesting a change); over capacity: the full syringe in risk red, the short warning, "Why" and "Ask AI for help". Oral: units to take (½ steps for divisible), "contains" warning and nearest brackets when not achievable. Disclaimer under the result. [D 2026-10-02 #182, #184, #188; #62]
- **PRD-PROT-17** "Why it doesn't fit": the "?" on the dose field (only while it does not fit), the red warning and the red syringe each open the animated 4-step explainer (your vial, your syringe, why it does not fit, "was it a weekly total?" with split buttons that divide the user's own number, written "2 × 120 mg"), always showing "mg = how much of the compound · ml = how much liquid". The app never gives a water amount; "Plan my mix" and the vial-size (ml) water target are dropped. [D 2026-10-02 #184, #186-187; 2026-10-03 #480; AP-12, AP-22]
- **PRD-PROT-18** Guard: Next on step 3 and Save are blocked on a unit mismatch or a powder draw over the chosen syringe; a ready-to-use draw over the syringe is shown in red but does not block. [D 2026-10-03 #488; AP-21; 01 R-14]
- **PRD-PROT-19** Step 4 Schedule: First dose "Today" (default for every NEW protocol) / "Tomorrow" + a start-date picker (any past or future date; the DTWheel in a DoseTrace sheet on iOS, native on Android); "Every day" / "Custom" (a typed "Every N days", digits only, maxLength 3; no preset buttons, `ProtocolsScreen.js:3062-3088` — AD-66: the binding prototype, decisions.md:34 and `docs/design/prototype.html:1380`, supersedes the presets of decisions.md:200). Custom shows for any stored interval ≠ 1 (`ProtocolsScreen.js:3070`, `:3076`); `PRESET_INTERVALS` (`lib/protocolForm.js:16`) only decides whether Edit pre-fills the N field, so an interval of 2–7, 10 or 14 opens with an EMPTY field and the grey placeholder 14 (`formFromProtocol`, `lib/protocolForm.js:94`) → G-164; doses per day 1/2/3 only when the interval is ≤ 2; one time per dose (default now rounded to 5 min, then 14:00, 21:00); wellness goals as one list (injectable vs oral lists, none preselected); blend composition label (journaling only); note. The custom interval accepts 1–999 in the form vs 1–365 in the assistant → GAP G-29 (DL-19: 1–365 everywhere). [D 2026-10-01 #34 (prototype binding), AD-66; 2026-10-02 #178; 2026-07-03 #170; 01 R-06…R-09]
- **PRD-PROT-20** Step 5 Vial (new powder protocols): mixed month pills + day (a future month/day resolves to last year; an impossible day is clamped), validity window days (default 30, the user's own tracking window), a BAC info box, "I haven't mixed this vial yet — skip" ("log your vial mix anytime from Today (+ Add vial)"), summary rows. [01 R-20, R-41, R-45] Two rules resolve "Feb 31" (the wizard clamps it, Today's Add vial refuses it); the assistant takes the mix date from a date wheel (it cannot receive "Feb 31") and refuses a future date or one > 365 days ago, which the wizard does not → GAP G-28.
- **PRD-PROT-21** Cancel on a NEW protocol with any typed content asks "Discard this protocol?" (Cancel / Discard in risk); Edit cancels silently. [D 2026-09-29/10-02 #180]
- **PRD-PROT-22** Save writes the protocol (local first, synced), the vial (powder not skipped: mixed date, water, capacity = floor(vial amount ÷ dose), 0 taken; ready-to-use: bottle ml, capacity, expiry = last day of the box month), schedules its reminders, and asks the history question when it applies (after the sheet is gone). Orals keep supply on the protocol row. [01 §3.2]
- **PRD-PROT-23** A half-filled new protocol lives, like every draft, until it is saved or the app closes; Cancel already asks before discarding it (DL-97: BK-14's lifetime, decisions.md:378, applied to the wizard). Today it lives in screen state and an app kill loses it → G-202. (The assistant-chat loss is AP-33, signed.)

#### Create — the AI protocol assistant (optional)
See 4.12 (PRD-AI-30…). It ends in exactly the protocol the manual form would create (same fields, vial, reminders, history question) [AP-17].

#### Vial-label scan (AI, transcription only)
- **PRD-PROT-30** On step 3 for powders and ready-to-use, and inside the assistant: shared AI consent first; camera (permission) or photo; image ≤ ~10 MB (the oversized-photo notice reuses "Please choose a PDF under 10 MB." — the wrong word for a photo → G-104, DV-201); the scan counts in the shared monthly pool (3 free / 20 Premium); the quota message fills the server's limit. [D 2026-09-09/30 #275-277, #322; 01 §3.4]
- **PRD-PROT-31** Apply: the form becomes powder or ready-to-use only when unambiguous; the compound is resolved **deterministically by the app** (exact label/id, then alias; ambiguous → none) and only when the user has not chosen one, else the printed name (≤ 60 chars) is seeded; ready-to-use concentration only for a clean per-ml unit; a warning ("We filled these in from your vial label. Check every value before you save — the app read the label, it didn't verify it."); **nothing is saved until the user taps Save** (review before save; the model never writes compound_id). Failures → DoseTrace notices. [D 2026-09-09 #322; 01 §3.4]

#### History before the protocol existed (A-30 option C)
- **PRD-PROT-60** A start date in the past is allowed. History before the protocol existed is **declared, never logged**: no dose rows are created; adherence, both streaks and Dose-log counts count only doses logged in the app; Missed rows are never written for slots before created − 1 h. [D 2026-09-27 #198; A-30, A-32]
- **PRD-PROT-61** After creating a protocol whose start date is before today and whose compound has a half-life ≥ 24 h, the app asks "Same dose for the last N weeks?" (N = min(5 × t½, days since start); ≥ 14 days in weeks, else days). Yes = nothing written; No = `history_from` = today and the curve starts today. No dose rows, vial or bottle counts move. Dismissing the sheet = Yes `[code]`. [D #198; 01 R-35]
- **PRD-PROT-62** The question names the compound, and is asked again when an edit moves the start date earlier ("Yes" clears `history_from`). [logic = DL-86 (it places the coordinator line decisions.md:543); the question naming the compound is wording, Approvals item 2.9; A-94, A-90] → GAP G-37
- **PRD-PROT-63** The curve draws the part before creation as "estimated from your start date" (a dashed vertical line at the moment the protocol was added + the label), approved as built. [D 2026-10-03 #516; 01 R-36]
- **PRD-PROT-64** `created_at` (the device's creation moment) must be the same on every device, so the declared boundary, Missed protection and the estimated curve agree across devices. [logic: P-12; registry A-30 recommendation] → GAP G-33 (residual only: protocols send `created_at` since e85519c; a pull never rewrites an existing local `created_at`, and vials and other child tables do not send it)

#### Edit
- **PRD-PROT-70** Edit (top right; "Dose details" link → step 3; "+ Reminder" → step 4) opens the wizard with the stored values shown in the app language (4 steps, no vial step). Save writes only the columns the user changed; a Save with no change alters nothing (test-proven); first dose and start date are never touched unless changed. Ready-to-use: the active vial's changed fields are patched (or a vial is inserted if none exists and the change describes one). Reminders are always re-planned from the saved row; delivered banners are dismissed only when time / doses per day / interval / start date changed. [D 2026-10-02 #179; 01 §3.6]
- **PRD-PROT-71** In Edit only the "doesn't fit" AI door exists and it ends in "Fill the form" (never a second protocol). [AP-1 deviation accepted]
- **PRD-PROT-72** Not editable after creation `[code]`: a powder vial's mixed date, validity window and capacity; changing a powder protocol's dose does not recompute its vial's capacity → DL-15 (recompute capacity from the mass left); ready-to-use recomputes, but ignores the doses already taken (`total_doses = vial ÷ new dose`, `lib/protocolForm.js:167-187`) → G-163; mix date, window and "doses already used" not editable → OPEN-01 (G-185).
- **PRD-PROT-73** Inline note on the detail page and on the Fold right page: the draft is kept per protocol in memory across fold/unfold, other protocols and tab changes until Save/Cancel or app close; a real sign-out clears it. [D 2026-10-01 #378; BK-14; FR-4]

#### End (Ended state)
- **PRD-PROT-80** Ended = `active 0`, not deleted, not purged. An ended protocol leaves Today, reminders, the active list and the free-limit count; its history stays in the Dose log, the adherence report, rings/streaks up to the end and the curve's past (offered for 365 days after the end with "· ended"); it is never auto-purged. [D 2026-10-03 #504-506; A-83 (the Ended semantics); #506 (never purged)]
- **PRD-PROT-81** End from the inactivity prompt = dated at the last Complete dose (A-86); a deliberate end = the moment tapped, no date question (DL-99). [DL-99 (was the coordinator lines #504, #535); DL-87 (was decisions.md:536)]
- **PRD-PROT-82** A deliberate "End protocol" action on the protocol page, and "Protocol finished" on the empty-vial prompt with a "Later" way out, are scheduled for 1.3.0 by the founder (AD-11, decisions.md:550); the coordinator / Gate B lines #535 and #558 ("does NOT end the protocol until a picture with a way out ('Later')") hold the build until the picture is shown — it is owed to the founder (Approvals item 3; A-85) → G-183
- **PRD-PROT-83** The Ended section: dot, name, "Ended {date}", "Restart" pill, risk-coloured trash (the same "Delete protocol" sheet as an active one → Recently deleted). [D 2026-10-03 #505]
- **PRD-PROT-84** End wins across devices: another phone's pending edit never brings an ended or deleted protocol back to active; status fields are sent only by the device that changed the status. [DL-88 (it places the coordinator line decisions.md:537); A-87] The same rule for vials is not built (another phone can re-activate a vial the end deactivated) → GAP G-36. Missed rows removed at an end are removed only on this phone → GAP G-35 (DL-87).

#### Restart
- **PRD-PROT-90** Restart (Ended row): if an ACTIVE protocol has the same compound or name → "{name} is already active … duplicate reminders" (Resume anyway / Cancel); then the container question "New vial" (primary) / "Keep using the same vial" / Cancel (bottle for orals; a plain confirm when there is no container); one restart at a time; the free limit is checked FIRST, before the duplicate warning and the container question, so a free user at the limit never answers a question only to be refused; nothing is written when refused. [D 2026-10-07 #614; A-99] Today the limit is checked last, inside the restart, after a container button is tapped (`ProtocolsScreen.js:1253-1290`) → GAP G-229 (DV-217, a bug).
- **PRD-PROT-91** A restart creates a NEW run: same settings, start date today, created now, 0 doses; the ended row stays as the history of the first run. New container = a full vial of the same size mixed today (expiry blank — the user enters the new box date), the old vial stays with the ended run; same container = the old vial moves to the new run unchanged (mix date, count; orals keep units) — today it is set active even when it was finished by doses (`lib/protocolEnd.js:153-155`), against DL-20 → G-165. Reminders are scheduled. [D 2026-10-06 #578; 2026-10-07 #614]
- **PRD-PROT-92** The restart copy must be true for both choices (today it says "zero doses taken" even when the same vial keeps its count) → GAP G-38.

#### Delete, Recently deleted, Restore, Delete forever
- **PRD-PROT-100** Delete (protocol page bottom, Ended row trash) → "Delete protocol" sheet → soft delete: the protocol and its dose logs leave Today, the Dose log, hero counts, the report and the curve; vials deactivated and reminders + delivered banners cancelled (protocol-page delete); the Ended-row delete only soft-deletes and cancels reminders — no vial deactivation (already done at the end) and no dismissal of delivered banners (`ProtocolsScreen.js:1231-1249` vs :2006-2025) → GAP G-152. [01 §3.10]
- **PRD-PROT-101** The delete sheet tells the truth: no "recoverable for 7 days" while the purge is paused, and it says the doses leave the Dose log while deleted. [P-14 copy must be true; the rewording ×6 is Approvals item 2.8 (the coordinator line decisions.md:544 placed it); A-90] → GAP G-32
- **PRD-PROT-102** Recently deleted sits at the bottom of the Protocols list (not in Settings), newest delete first; "Deleted {days}d ago" (whole local days → GAP G-32: shows "1d ago" one minute after); while the purge is paused every soft-deleted, non-purged protocol is listed. [D 2026-09-29/10-01 #174; 2026-10-03 #506]
- **PRD-PROT-103** Restore: a protocol that was Ended before the delete returns to Ended; a protocol deleted before today returns to Ended dated at the delete (its deleted days are never owed; Restart makes it active and respects the free limit); a same-day Restore is an undo — active when under the free limit, otherwise Ended; only a row still deleted and not purged is restored; a second Restore changes nothing; Restore → active re-activates its newest vial and schedules reminders. [DL-89 (A-89; it places decisions.md:538); #505, #558 (coordinator blocks)] Restore re-activates a vial even when it was empty → GAP G-31.
- **PRD-PROT-104** Multi-select (founder 2026-10-03, picture approved): "Select" beside the title (only with items); checkboxes; Select all / Deselect all, Cancel; a bottom bar replaces the tab bar with "Restore (N)" and "Delete forever (N)", disabled at 0; Restore N runs single restores one by one (the free limit counts each); rows that leave the list leave the selection; leaving the tab ends selection. [D 2026-10-03 #501, #515]
- **PRD-PROT-105** "Delete forever" (single trash or the bar) asks first ("Delete this protocol forever?" / "Delete N protocols forever?") and is a positive tombstone: the protocol's dose logs and vials are deleted in the cloud, the cloud row keeps only its identity as the founder-approved migration defines it — id, user_id, type, colour, timestamps, deleted_at and purged_at (AD-67: the founder's go decisions.md:552, applied :556; `supabase/migrations/20261004010000_protocol_delete_guard.sql:8-9`; the coordinator's narrower list at :540 is not the authority); the trigger does not blank interval_days, doses_per_day, concentration_unit or divisible (`:31-41`) → GAP G-151 (DV-221; the wider blanking is a production go, Approvals item 1), other devices remove it on their next pull (only its synced children; an unsynced child is never deleted), and a dose log or vial written onto a purged protocol is refused by the server. Cannot be undone. [D 2026-10-04 #552, #556; AD-67; coordinator #519-531]
- **PRD-PROT-106** The automatic 7-day purge is paused through 1.3.0 (DL-94, which places the coordinator line decisions.md:506); whether and how it comes back after 1.3.0 (A-84) waits for the founder → OPEN-04 (G-201).
- **PRD-PROT-107** No device removes a protocol, dose log or vial because it is absent from the cloud; a push that finds no cloud row re-inserts the protocol SOFT-DELETED (it lands in Recently deleted, never silently active); old 1.2.x apps cannot DELETE protocols in the cloud. [D 2026-10-04 #520, #524, #541, #556]

#### Vials, bottles, supply (PRD-VIAL)
- **PRD-VIAL-1** Powder vial: capacity = the stored count (set at mix time) else floor(vial amount ÷ dose); doses left = capacity − doses taken; the newest active vial is "the" vial of a protocol on every screen. [01 R-28; 01 §6.2]
- **PRD-VIAL-2** Ready-to-use vial: amount = concentration × ml; capacity = floor(concentration × ml ÷ dose); expiry = the last day of the box month. [01 R-21]
- **PRD-VIAL-3** Oral bottle (no row; on the protocol): units left = units per container − units taken; days left = floor(units left ÷ units per dose ÷ doses per day) — **must also divide by the interval** (every-2-days protocols show half their real supply) `[logic: math must be correct]` → GAP G-27.
- **PRD-VIAL-10** Each Complete dose moves the active vial by one (or the bottle by the units per dose); reaching capacity closes the vial (inactive); Undo / Delete give one back (C-3, C-4). [01 R-46]
- **PRD-VIAL-11** Vial cells + "N of M doses left" on the Protocols card and the protocol page; Today's card shows cells + "N doses remaining" for powder vials only (no vial line for ready-to-use); one capacity rule everywhere — the report's "doses remaining" (`SettingsScreen.js:415`) uses its own older rule and can go negative → GAP G-20; the capacity rule is re-implemented in Today's card (`TodayScreen.js:1942`), `lib/markTaken.js:122` and `lib/deleteDose.js:62` → GAP G-21.
- **PRD-VIAL-20** ONE supply-low rule for the Today alert, the vial push and the Protocols badge/hero line: low = 1, 2 or 3 doses left (0 is not "low"), older vials included (derived capacity); the push fires at 3 (AD-60). [D 2026-10-01 #148; FX-11] The push evaluates every active vial while screens evaluate the newest per protocol → GAP G-22.
- **PRD-VIAL-21** Low stock is amber, with the days coloured by deadline (≤ 3 risk, ≤ 7 attention); the same colour rule on Today and in My Protocols. [D 2026-10-01/02 #147] The founder chose coloured days (Q9 = B, re-confirmed 2026-10-02 "dias coloridos") over the grey "29 days left" (V10): Today's card follows it (green above 7, `TodayScreen.js:1956-1957`); the Protocols list shows grey ink2 above 7 (`ProtocolsScreen.js:197-200`) — **Protocols is the divergence** → GAP G-23. The Today card follows the founder's pick (AD-65); the same colouring on My Protocols is DL-80, shown as a picture first (OPEN-24 item 11); DL-16, which picked the reverse, was replaced by AD-65.
- **PRD-VIAL-22** The supply-low push is sent once per vial, immediately, only with the app running (never from the background run). [BR-7; 01 R-39] After a ready-to-use "New vial" (which resets the SAME row) that vial's low push never fires again, because the once-per-vial memory keeps the id while it stays active (`notificationPlan.js:243-255`) → GAP G-140.
- **PRD-VIAL-30** Vial window: powder = mix date + validity days (default 30) counted in whole local days; ready-to-use = days to the box expiry date; ≤ 0 = "Past window" (risk). An expired vial stays active and keeps counting doses. [01 §6.4; R-41] A ready-to-use vial already reads "Past window" from 00:00 on the last day of its box month (`Math.ceil` of a negative fraction gives −0, counted as ≤ 0, `ProtocolsScreen.js:194`) → GAP G-141.
- **PRD-VIAL-31** Expiry notification behind the "Vial expiry alerts" switch (the label today; one switch covers low supply and expiry — AD-26, decisions.md:165; the new label "Vial alerts" ×6 is Approvals item 2.4): 7 days before and on the day, at 09:00 local (the lead time and words wait for the founder → OPEN-20 (c)), the next one only per vial, inside the iPhone budget (which reserves at most 8 expiry slots); the Today alert at ≤ 7 days uses the same date. [A-45; 01 R-42]
- **PRD-VIAL-40** New powder vial: only from Today's prompt after the last dose of a vial, or "+ Add vial" when a powder protocol has no active vial (card; Fold right page "No mixed vial right now" + why the syringe and supply are missing + "+ Add vial"); the prompt asks the mix date; the new vial's capacity is derived (water read with comma decimals); the protocol (start date) is never changed. [D 2026-09-27 #181; FX-1, FX-6, FX-14; FR-3] Whether the protocol page also gets a powder "New vial" (e.g. for a vial past its window but not empty) waits for the founder → OPEN-01.
- **PRD-VIAL-41** Ready-to-use "New vial" (only while the active vial has ≥ 1 dose taken) and oral "New bottle" (units taken > 0 and a container size) ask first: "Start counting from a full vial / bottle? The doses already logged stay in your history." (Cancel / Start new); ready-to-use resets the SAME vial row (size and expiry kept); oral resets units taken. [D 2026-09-29/10-02 #180; 01 §3.12]
- **PRD-VIAL-42** Replacing an empty ready-to-use vial (today impossible from the UI), as a new vial row — never the old row reset → DL-22 (G-162). Asking the new box's printed date, a manual new powder vial on the protocol page and "doses already used from this vial" wait for the founder → OPEN-01 (G-185; registry A-08 F5–F7; at a Restart the founder already gave "Continue the same vial", decisions.md:614).
- **PRD-VIAL-43** Oral bottles have no low-supply warning anywhere `[code]` → OPEN-02 (G-184).

**States (01 §5).** Protocol: Draft → Active (not started / running) → Ended → Deleted → Purged (+ legacy hard-deleted). Vial: none → active (ok / low / past window) → finished → inactive → tombstone. Bottle: not tracked → tracking → empty (derived). Course: open-ended / running (legacy) / complete (legacy). Diagrams: 01 §5.

**Edge cases the product must handle** (01 §8). Started weeks ago (PRD-PROT-60…); vial already half used (no field → OPEN-01); vial mixed days ago (mix date); dose changed mid-vial (stale capacity → DL-15, OPEN-01); long-interval esters (custom interval; reminders renewed by the refresh); twice/three times daily (interval ≤ 2); stopped for a while (inactivity end, restart); duplicate restart on two devices (warning is local); deleted by mistake (same-day undo / Ended); free user restoring a 4th (→ Ended); offline (all writes local; scan and assistant need network); time zones and DST (local calendar days); update from 1.2.x (status_at backfill; purge paused); language change (frequency re-derived; stored name in notifications → GAP G-15); legacy rows (no start date, no reminder time, `schedule_total`) → OPEN-03, GAP G-3; Fold (one-column wizard; sheets survive fold/unfold); ready-to-use vial ran out (no prompt, no New vial → DL-22); expired-not-empty powder vial (no new-vial path → OPEN-01); oral every other day (understated days → GAP G-27); wizard interrupted (kept until saved or the app closes → DL-97).

**Free / Premium.** Free: 3 active protocols; everything else here is free (calculator, vials, supply, reminders, restart, delete, restore, the vial scan in the shared pool, the assistant's 10 a week). Premium: unlimited active protocols.

---
### 4.4 Reminders and notifications

**Purpose.** "O app avisa até a pessoa entrar no aplicativo e deletar esse protocolo… Não posso deixar o Android definir se vai continuar avisando" (decisions.md:601). A user still taking something keeps getting reminders for as long as it lasts, whether or not they open the app; Android must not silently stop them; a switch the user turned off must work; a finite course ends its reminders (P-5). A reminder that never arrives is invisible, so the app reads what the phone allows, shows it with a fix, proves delivery with a test, and warns on Today (reminder-check.md purpose).

**Entry points.** OS notifications and their buttons; Settings → Notifications (7 switches + the reminder screen row); Today reminder cards; the onboarding step (Android); the automatic once-per-phone opening (Android); the test reminder tap; headless (Android action task, background refresh, update/reboot receiver, server wake-up) (03 §2).

#### Architecture rules
- **PRD-REM-1** Reminders are local, one-shot, dated notifications per due slot, scheduled on the phone; server push (`send-reminders`) stays OFF (it lacked Mark complete, Show names, Silent mode, repeats and ran late) and is not deployed. [D 2026-10-07 #589; 2026-10-05 #564] The foreground handler still uses the legacy `shouldShowAlert` key → G-212.
- **PRD-REM-2** Rolling window and budget: iPhone 10 days, 40 total minus up to 8 for vial-expiry alerts, inside the iOS 64-pending cap; Android 21 days, 400 total; per protocol at least 2 and at most 24 (iPhone) / 60 (Android); dose mains and follow-ups both count. The vial deduction counts **every active vial** (`getActiveVials().length`), not only vials with an expiry. [RC-7; 03 R-2] On iPhone the 64 cap is breached at ≥ 23 protocols (no vials), ≥ 21 protocols with ≥ 3 vials, or ≥ 14–15 vials (verification 03 node table) → GAP G-83.
- **PRD-REM-3** The window is topped up on app open, foreground (throttled 60 s), Settings change, sign-in, and on Android by the background refresh, the update/reboot receiver and the server wake-up. [03 R-1; BR; RG-6; A-111]
- **PRD-REM-4** Scheduling is non-destructive: schedule what is wanted first (fixed ids replace), then cancel only ids of that kind no longer wanted; an unknown state (database not ready, failed read, no user) cancels nothing; one full resync at a time (calls during a run share one follow-up). [BR-1, BR-2, BR-6]
- **PRD-REM-5** Full resync order: categories → Silent check → dose reminders → vial alerts → weekly check-in → day-21 weigh-in → 20:00 food → morning summary → snoozes. [03 R-9]
- **PRD-REM-6** Notification language = the language the app is shown in; a language change re-plans every scheduled notification. [logic: P-6 one language per app; 03:G6 = DL-13] Today this is not true as written: notifications read the **stored** language (`dosetrace_language`) or fall back to **English** (`getT`, `lib/notifications.js:18-24`, `lib/notificationActions.js:138`), and the device-language default the app displays is never stored (`i18n/LanguageContext.js:33-39`). A user who never picked a language explicitly sees the app in the device language (e.g. Portuguese) and gets every notification, action button and "Nothing new logged" in English (verification 03 NEW-1, S2) — on top of the missing re-plan on a language change → GAP G-77 (DL-13 must also persist the device-language default).
- **PRD-REM-7** No advice or interpretation in any notification text; no emoji in titles. [CLAUDE.md; decisions.md:70]
- **PRD-REM-8** Android channels: "Dose Reminders" (max importance), "Vial Alerts" (high), "Check-in Reminders" (default); channel names must be in the app language. [03 §3] English-only literals today → GAP G-82.

#### Dose reminder
- **PRD-REM-10** One notification per due slot at the local slot time (day from start date + interval; times from the protocol's reminder times). Title = the protocol name, or "Dose reminder" when "Show names in notifications" is off; body "Time for your {dose} {unit} dose" (locale decimal). [03 §3.1; D 2026-09-24 #311]
- **PRD-REM-11** Skipped: past slots; today's first N slots where N = Complete rows today. [03 R-6] A Skipped slot keeps its reminder → DL-08.
- **PRD-REM-12** A protocol with no reminder time is reminded at 08:00, and every other surface must use the same 08:00 slot (DL-77); the Today card shows no time for it → GAP G-3 (legacy/imported rows only; the form always writes a time).
- **PRD-REM-13** Buttons: daily = Mark complete + In 1 hour; less than daily = + Tomorrow; a snoozed copy = Mark complete only. Mark complete opens the app on iOS (all) and for injectables on both platforms; runs headless for Android orals. Vial, weekly check-in and day-21 notifications also carry In 1 hour / Tomorrow (category `general-reminder`). [D 2026-09-24 #162; 03 R-18]
- **PRD-REM-14** Persistent reminders (Settings, off by default): two follow-ups at +5 and +10 min ("Reminder: your {dose} {unit} dose is still pending"), kept after the main slot fired while still ahead, cancelled with the slot or its snooze. [03 §3.2] Settings copy promises "every 5 min until acknowledged" → DL-48 (wording ×6: Approvals item 2.2) → G-172. Snoozing does not stop the +5 / +10 repeats once a resync runs inside the snooze → G-196.
- **PRD-REM-15** Cancelled when: logged Complete (that slot and earlier ones; delivered banners dismissed; snoozes resolved); protocol ended, deleted or deleted forever; schedule edited (re-plan + dismiss delivered); Dose reminders switch off; Silent mode on; orphan (protocol no longer active here); intended sign-out or another account signs in. [03 §3.1]
- **PRD-REM-16** Reminders keep being renewed until the protocol is deleted or ended — no stop point, whatever its length; a protocol with a total number of doses ends its reminders when that course ends. [D 2026-10-07 #594, #601, #620; BR-12] No UI can set a total today → OPEN-03.
- **PRD-REM-17** A tap on the body opens Today on that dose (A-44); a tap that launched the app is routed once and ignored when older than 12 h; navigation waits until Main exists; a sign-out drops a queued tap. [03 R-25-R-26] A cold-start tap can miss its routing because the action handler clears the last response while `App.js` reads it → G-208.

#### Morning summary
- **PRD-REM-20** 07:00 every day for 7 days ahead, gated by "Dose reminders": "Good morning" / "Today: {up to 3 names + more}." (names off: "{n} scheduled today.") / "Nothing today. Next dose tomorrow." / "Nothing today. Next dose in {days} days."; no buttons; tap → Today. Days with nothing due within 45 days get no summary. [03 §3.4]
- **PRD-REM-21** Creating, editing or deleting a protocol re-plans the morning summary and vial alerts at once (not only at the next full resync). [logic: P-12 — the summary names the protocols] → GAP G-78

#### Notification actions
- **PRD-REM-30** Mark complete (oral): the reminder's own slot — for **today's** slot the row is written at the **tap time** (`lib/markTaken.js:101-104`), for a previous day's slot inside slot + 12 h (even after midnight) at the slot time; only a **snoozed** copy whose slot day is before today and more than 12 h old logs as "now" (a non-snoozed reminder tapped after 12 h still logs to its slot); it cancels today's slots up to the tapped one only when the logged day and the slot day are both today; Today refreshes; the cloud sync waits for the foreground. [D 2026-09-28 #155; 03 R-13, R-16] On the Android headless path a press can be lost when the database fails to open or the write throws (the claim is stored first, the error swallowed, the banner dismissed) → G-160.
- **PRD-REM-31** Mark complete (injectable): writes nothing in the background; saves a site question at the tap time and opens the app on it; Android keeps the banner when the app is not active. [D 2026-10-01 #153; FX-27]
- **PRD-REM-32** Each action is handled at most once (in-flight + a persisted list); "Nothing new logged" on Android when the dose was already complete or the protocol is paused/deleted. [03 R-15; §3.11] That notification has no channel and bypasses Silent mode → GAP G-85.
- **PRD-REM-33** Snooze (In 1 hour / Tomorrow): a snoozed copy (`snz-`), hour = now + 60 min; Tomorrow = now + 24 h when 07:00–20:59, else 09:00; at most 4 snoozed copies (newest kept; the oldest silently dropped); a dose snooze is dropped when its slot is resolved or reminders are off; with names off, copies are re-titled. [03 §3.3] A snoozed vial-expiry copy changes channel and keeps the compound name → GAP G-84.

#### Vial alerts
- **PRD-REM-40** "Vial running low" (immediate, once per vial, app running, never from the background run; body "{name} has {n} dose(s) left" or "Your vial") and "Vial expiring soon" (09:00, 7 days before and on the day, next one per vial) — both gated by the vial-alerts switch; tap → that protocol. [A-45; BR-7; 03 §3.5-§3.6] The expiry lead time and words wait for the founder → OPEN-20 (c). The switch is labelled "Vial expiry alerts" but also silences "running low" → GAP G-76 (one switch, AD-26; the label "Vial alerts" ×6 is Approvals item 2.4). Names: low uses the stored name, expiry the translated compound → GAP G-15.

#### Weekly check-in and reality-check reminders
- **PRD-REM-50** Weekly check-in: Sunday 10:00, "Weekly check-in" / "Log this week's weight and waist — every entry adds to your trend chart", switch "Check-in reminders"; tap → Progress → "Log today's weight" (focus `weighin`). [A-44 (features.md) — decisions.md:132 (2026-08-21) still says "the tap opens Body" and is stale; 03 §3.7] Repeating trigger is inexact under Android Doze → GAP G-86.
- **PRD-REM-51** Day-21 weigh-in: 10:00 local on start + 21 days, read from the synced open check; none if that time has passed (the Today alert covers it); title "Reality-check weigh-in", body "Time to log your weight and finish your reality check."; tap → Progress focused on the reality check (scrolls only; it does not open the weigh-in sheet); cancelled when no check is open (Stop, finish). No switch of its own gates it ("Check-in reminders" does not) — only Silent mode stops it (undocumented until now) → G-148. [03 §3.8; FX-5]
- **PRD-REM-52** The day-21 notification is cancelled once the weigh-in on/after day 21 exists (the check may still wait for food days). [logic = DL-25: one reality-check assembler for Today, the food card, Progress and the schedulers; it absorbed AD-12 — A-118 is the founder's bug report (features.md:258), "follow the check's real state" is the logic fix] → GAP G-44.

#### 20:00 food question
- **PRD-REM-60** While a reality check is open, once a day at 20:00 unless the day is closed: "Anything you ate today that isn't logged yet — and will you eat again today?" with Log it · Nothing else today (closes that reminder's own day, even when tapped after midnight) · (in the chat) I'll eat later; tap → the food chat with the evening question; logging food does not cancel it; no every-other-day backoff; no day-21 cut-off; a rolling set of 7 one-shot alarms re-planned on every app open and sync; none for days the user cannot log (locked free user); off switch shared by Settings and Progress (stays off across new checks). [D 2026-09-10/27/29 #249 (AD-73: one off switch, no backoff); FL-18, FL-41, FL-42; 03 §3.9] Whether a check can be saved early, and so end the reminder (registry A-24), waits for the founder → OPEN-07 (DL-51 withdrawn) (G-213). The 20:00 question and the weigh-in use the "Check-in Reminders" channel, which the reminder check never inspects → GAP G-81.

#### Test reminder
- **PRD-REM-70** "Send a test reminder" schedules a dose-style reminder 10 s ahead through the same channel path as real dose reminders ("DoseTrace · This is a test reminder"); goes through even in Silent mode; never logs a dose; tap → the reminder screen. [RC-5]

#### Reminder screen ("Make sure your reminders arrive" / "Check reminders")
- **PRD-REM-80** Settings → Notifications: on Android the FIRST row is "Make sure your reminders arrive" with its state — a block (notifications denied, Dose Reminders category off, or nothing scheduled although a protocol has a reminder time) in risk; else "N of M ready" in attention with a dot while a readable item is not OK; "All set · next reminder <day, time>" only when every readable item is OK and nothing blocks. iPhone keeps a "Check reminders" row ("Nothing is blocking them" / "Something is blocking your reminders"). [SP-1; RC-1]
- **PRD-REM-81** The row opens ONE screen (large title + intro): the "N of M ready" bar; each item with its real state and the button that opens the exact system screen — Notifications, Dose Reminders category (when blocked), Alarms & reminders, Battery, the hibernation switch under the phone's own name ("Pause app activity if unused" / Samsung "Manage app if unused"), Automatic refresh (last run + "reminders scheduled until {date}"), Samsung deep sleep; then "Next reminder" with the scheduled count ("None scheduled" when reminders are on, a protocol has a time and nothing is scheduled) and "Send a test reminder". "Next reminder" ignores snoozed copies, follow-ups, the summary and food reminders → G-211. No separate setup mode, no "See step by step". [SP-2; D 2026-10-07 #625, #630]
- **PRD-REM-82** Row rules: Notifications OK only when granted (undetermined = block); Dose Reminders category off = block; battery optimized = warn ("can delay"); Alarms & reminders off (Android 12+) = warn "Off: reminders can arrive up to 1 hour late" + "Turn on"; hibernation not exempt (Android 11+) = warn "On: after months without opening the app, Android can stop the reminders" + "Turn off"; refresh late (> 2 days since the last successful run and no foreground resync in 2 days) = warn "Adjust"; Samsung deep sleep cannot be read: "Open" (Samsung's Battery screen; fallback the app's Android page) + "I checked" (saved on this phone) → OK "You checked on <date>…" and counted (5 items on Samsung, 4 elsewhere — fewer when items cannot be read, e.g. 2 of 2 when exact alarms and battery are unknown). Unreadable rows show no OK state. Only what the app can read can block — but today an unreadable notification permission (`null`) is treated as a block (`reminderHealth.js:56`) → GAP G-147. [EA-2, RC-3, RG-3, RG-4, SP-7, SP-10; D 2026-10-05 #569]
- **PRD-REM-83** Coming back from an Android settings screen updates every row, the bar and the Settings row without reopening. Turning Alarms & reminders on reschedules everything as exact and re-arms snoozes. [SP-3; EA-4]
- **PRD-REM-84** The same rule set decides the Settings row, the screen, Today's cards and the onboarding step (one owner: `lib/reminderHealth.js`). Settings › Notifications is red on any readable block (notifications denied, the Dose Reminders category off, or nothing scheduled while a protocol has a reminder time), whichever reminder kinds are switched on — as the signed SP-1 / RC-1 say (AD-71; a denied permission still blocks the food question, weekly check-in, day-21 weigh-in and vial alerts). Silent mode is its own state, never "blocked" (AD-25, DL-45); today Today's blocked card ignores Silent, so Blocked and Silent can show together → G-170. `shouldWarnLate` re-implements `remindersMatter` inline → G-210. "Scheduled OK" with only one protocol's reminders, and "4 of 4 ready" above "None scheduled" → GAP G-89.

#### Today reminder cards
- **PRD-REM-90** While a readable item is not OK and a protocol has a reminder time (and dose reminders are on, Silent off): "Your reminders are blocked" (permission off, category off, nothing scheduled); "Reminders may be late" (Android exact alarms off); "Battery may delay reminders"; "Your reminders may stop" (hibernation); "Reminders not refreshed for {n} days"; two or more → one card "{n} fixes for your reminders". Silent mode → its own card "Silent mode is on — No dose reminder will arrive. Tap to see." Samsung deep sleep never raises a card. Late, battery, stop and stale cards open the reminder screen at their item; blocked, combined and Silent cards open it with no focus; snoozable like other alerts; the card comes back while the item stays not OK. [RC-6, EA-3, RG-5, SP-6; D 2026-10-07 #615-616, #626] "A protocol with a reminder time" counts every active protocol — correct for this surface, because a protocol with no time IS reminded at 08:00 (PRD-REM-12; one slot list, DL-06, at 08:00 everywhere, DL-77); G-3 does not apply to the warnings.

#### Android: keeping reminders alive without opening the app
- **PRD-REM-100** Background refresh (expo-background-task, every ~6 h, Android decides the moment): opens the database, does nothing when a wipe is pending or no session is stored, uses the stored session only (never a network token refresh — never signs anyone out), runs the same non-destructive resync, sends no immediate notification, pushes nothing, records when it ran and the result. iOS never links or loads it. Implementation: a chain of one-time WorkManager jobs (initial delay 360 min), re-queued 60 min later when the app is in front. [BR-1…BR-11; A-107]
- **PRD-REM-101** Changes made on another device reach this phone's reminders when the app is opened here (or via the wake-up), not from the background run. [D 2026-10-07 #605; BR-5 deviation]
- **PRD-REM-102** After a Play update or a reboot, the app rebuilds every reminder itself without being opened (update/reboot receiver). [A-111; decisions.md:565 is the R8 keep-rule incident, not the receiver] Device proof pending (the class-name guard test `__tests__/updateRestore.test.js` already exists; only the device proof is open) → GAP G-91.
- **PRD-REM-103** Daily silent server wake-up (cron 08:00 UTC, at most once per 20 h, data-only push to Android tokens, no content): it only triggers the local refresh; a failed or missing wake-up changes nothing. [D 2026-10-07 #600, #611; RG-6]
- **PRD-REM-104** The background refresh needs a network connection to start (library constraint) while the update/reboot run does not → GAP G-91. A refresh that rescheduled nothing still reads "OK", and a refresh that never ran is never flagged → GAP G-80.
- **PRD-REM-105** iPhone: no background renewal; reminders end after the 10-day window (morning summary and food 7 days) if the app is not opened; no warning on iPhone → OPEN-06 (G-187).

#### Switches (Settings → Notifications)
- **PRD-REM-110** Seven switches, stored on the account (`user_metadata`), each re-planning at once and reverting with a sheet on a failed save: Dose reminders (on; also gates the morning summary and dose snoozes), "Vial expiry alerts" (on; also gates the low-supply push), Check-in reminders (on; does not gate the day-21 weigh-in), "Food-log reminder" (on; shared with Progress), Persistent reminders (off), Show names in notifications (on; off = the lock screen never shows a compound name), Silent mode (off). A switch turned off cancels what is already scheduled of that kind — but "Vial alerts" and "Check-in reminders" leave their already-snoozed copies → G-197. [D 2026-09-24 #311; A-108, A-109; 03 §7.1]
- **PRD-REM-111** Silent mode: cancels every scheduled notification and schedules nothing (only the user's test reminder goes through); it is its own state, never "blocked"; snooze records survive and come back when Silent ends. [BR-4; A-108] A Silent change made on another phone reaches the standalone schedulers only at the next full resync, and the cached session may still be stale then → G-171.
- **PRD-REM-112** The Apple review account has Silent mode off. [D 2026-10-07 #606]

#### Permission
- **PRD-REM-120** Onboarding asks for notification permission at "Enable notifications" (on iOS and Android); "Not now" asks nothing there. The app today calls the permission request at every signed-in cold start / sign-in (and inside `registerPushToken`), but the OS dialog appears only while the status is undetermined (on iOS once). When to ask after "Not now" waits for the founder → OPEN-20 (b) (G-182; AD-27 moved there: its cited line decisions.md:623 has no such rule, and :626 and the signed SP-5 re-open the Android setup screen once for "Not now" users with a reminder time).

**States.** Slot: planned → scheduled → delivered → follow-ups → complete / site question / snoozed / ignored / cancelled. Schedule state: silent / off / none needed / pending / ok / block. Row: open / ok / warn / block. Silent: normal ↔ silent. Setup seen (per phone). Refresh run: triggered → recorded (ok / wipe pending / signed out / error). Freshness: never ran / fresh / late. Food day: no check → planned → scheduled → delivered → closed. (03 §5)

**Edge cases the product must handle** (03 §8). Installed but never opened after onboarding (nothing scheduled until the first signed-in start); never opened again (Android renews; iPhone stops → OPEN-06); Play update (receiver); reboot (receiver + expo restore); Doze / battery saver (exact only with Alarms & reminders); Samsung deep sleep (I checked); two devices (each phone schedules its own; a dose logged on phone A keeps reminding on phone B until B pulls; a pull does not re-plan dose reminders → GAP G-79); protocol ended/deleted on another device (orphan sweep on the next resync); intended sign-out (all cancelled); spurious sign-out (reminders stay; the refresh stops renewing); session revoked / account deleted elsewhere (→ GAP G-75); another account signs in (previous reminders cancelled); time-zone change (fires at the old wall time until the next resync; ids by local day); DST (wall time kept; the spring-forward gap UNVERIFIED); permission revoked (rows turn red, Today warns); "Not now" in onboarding (→ OPEN-20 (b)); Undo after a take (reminder not restored → DL-09); language change, and a user who never picked a language (notifications in English) (→ GAP G-77); many protocols on iPhone (→ GAP G-83); 5th snooze (oldest dropped); snooze in Silent mode (record kept, copy not scheduled).

**Free / Premium.** All reminders are free. The 20:00 food question exists only while the user may log food (FL-41).

---
### 4.5 AI food log

**Purpose.** Find out what the person really eats — per day, week and across the reality-check window — so the reality check computes a real maintenance without guessing, and Your daily plan uses that measured number. A friendly daily chat that brings the user back (a retention engine), not a diet diary; never advice (decisions.md:213; food-log.md purpose; P-27).

**Entry points.** Today's food hero (only while a check is open); Journey's food card (always); the 20:00 notification (body → the chat with the evening question, carrying that evening's day; "Log it" → opens the composer but carries **no day** (`foodTapParams` returns `{ logIt: nowMs }`, `notificationPlan.js:153`), so after midnight "Log it" on last night's question logs onto **today** → GAP G-146; "Nothing else today" → closes that day without opening); on the Fold the chat opens on Journey's right page. ONE chat thread for all of them (FL-37).

#### Chat
- **PRD-FOOD-1** The log can be opened any time (the 8 PM nudge is the daily catch-all, not an access gate); the composer invites: "So, what have you eaten? Earlier days count too." [D 2026-09-10 #252; 2026-09-27 #128; FL-1]
- **PRD-FOOD-2** The food log is a chat: app bubbles (always app-written), the user's own messages as bubbles, each logged entry as a small tappable card (items, quantity, category, kcal) that opens "Fix this entry", follow-up questions and quick answers as bubbles + chips, a typing indicator while the AI reads. One message = one bubble with one entry card per day it covered; messages in the order typed. [FL-31, FL-38]
- **PRD-FOOD-3** The thread is rebuilt from stored data only (entries, day markers, follow-up state stored on the items); nothing exists only in the chat view. The thread shows the last 7 days of typed messages. [FL-35; 04 R-F1, R-F13]
- **PRD-FOOD-4** The chat closes back to the hero on a swipe down, on leaving the app, or after ~30 s idle with the keyboard down — never while sending, with text in the box, a follow-up/fix screen/consent/alert open, or a screen reader on; never when embedded on the Fold right page (no Done, no auto-close there). Reopening the same day resumes the thread and an open follow-up. [D 2026-09-27 #243; FL-32, FL-36; BK-17]
- **PRD-FOOD-5** The draft (and any text put back after a failed send) survives closing and reopening, per user. [FL-36] It also survives a real sign-out today, unlike other drafts → GAP G-110.
- **PRD-FOOD-6** The last bubble and the input stay above the keyboard on iOS and Android; a long thread opens at the latest message; iOS has no empty band above the header. [FL-39; A-68]
- **PRD-FOOD-7** Midnight while the chat is open: a day divider appears and questions name the day they ask about; a next-morning tap on last night's reminder asks about yesterday; a send that crosses midnight lands on the typed day. [FL-40; 04 edge 6]

#### What the AI does (transcription only)
- **PRD-FOOD-10** Every text is read as food or drink the user consumed; an ambiguous name triggers a question, never a guess at a non-food product; brands are kept as typed and estimated as that product ("2 built puff bars" → 2 × BUILT Puff Bar); calories and macros stored for an item are totals for the whole quantity; "another one" uses today's last item, and with nothing logged that day the app asks which instead of guessing (no AI call). [D 2026-09-10/27 #321; FL-11…FL-14]
- **PRD-FOOD-11** After logging, a neutral echo names only the items logged (up to 3, then "+N more"), never a comment about the food; quantity always shown ("2 × BUILT Puff Bar · ~280 kcal"); a vague amount is estimated anyway and flagged "estimate · tap to fix"; nothing typed is ever dropped — every food is its own line in the user's words; a one-letter unit never reads as a count ("180 g grilled chicken breast"). [D #246; FL-7…FL-9; A-100]
- **PRD-FOOD-12** Calories, carbs and protein are shown; fat is captured but not shown. [D #247; FL-17]
- **PRD-FOOD-13** The AI sets each item's category (meal, snack, drink, supplement); the user does not edit it ("Categoria não importa, as calorias sim"). [D 2026-10-02 #248; FL-23]
- **PRD-FOOD-14** The AI never writes a sentence shown to the user: only food names (≤ 60 chars), units (≤ 16) and, in follow-ups, up to 4 short answer options (plain text, one line, ≤ 40 chars). Every question and sentence is app-written in 6 languages. [D #318-319; FL-16] AI chips vs fixed answers → AD-53.
- **PRD-FOOD-15** Any advice-shaped request gets the fixed deflection card (cannot advise; ask a doctor or dietitian), never model text; the text typed in the composer is kept (an advice-shaped answer to an open follow-up is cleared and its draft deleted, `screens/FoodChatScreen.js:440-449`). [D #320; FL-15]
- **PRD-FOOD-16** In a message with several foods, the clear ones save immediately; when the parser needs one detail (amount, brand, size, preparation) the app asks ONE follow-up in app-written words with quick answers plus free text; the answer updates only that item and the entry total; answering never uses one of the 25 daily reads; typing a new meal while a follow-up is open creates a new entry and the earlier item stays flagged; an answer given offline or after midnight still updates the same entry, unless that entry was edited or deleted meanwhile (then it is dropped). [FL-10, FL-21, FL-26…FL-28]
- **PRD-FOOD-17** No raw text is logged on the server; extraction-only structured JSON; model Claude Haiku. [D #321; 04 R-F9]

#### Days, catch-ups, closing a day
- **PRD-FOOD-20** A food day runs midnight to midnight in the user's local time; totals per day, per week (last 7 local days) and for the whole check window. [D #250; FL-24] Only the day's total is shown today: since Journey part 8 replaced the Totals card, `nutri_tot_week` / `nutri_tot_window` (`i18n/translations.js:221-222`) have no caller; keep or bring back waits for the founder → OPEN-18 (9) (G-198).
- **PRD-FOOD-21** Food from up to 7 days back is logged on the day it was eaten without asking when (an item's own "days ago" wins over the message's); a multi-day catch-up becomes one entry per day eaten; food for an earlier day never counts as eaten today; older food is refused kindly (app-written, 6 languages) and the typed text is kept (when only some items are too old, the recent part saves and the full text goes back in the box). [D #244; FL-2, FL-25, FL-45]
- **PRD-FOOD-22** After each entry dated today the app asks ONE friendly question about anything else today — meal → snack → drink → supplement → "anything else" — one at a time, past tense from 19:00, none once the day is closed; no strict meal slots. [D #245; FL-4, FL-5]
- **PRD-FOOD-23** Only explicit phrases close a day ("that's it" in 6 languages, the "That's all for today" chip on every question, the 20:00 "Nothing else today"); a bare "no" never closes it (it skips an open follow-up, or moves to the next gap question, `screens/FoodChatScreen.js:339-344`); a closed day is never asked again. [D #245; FL-6, FL-29]
- **PRD-FOOD-24** Closing a day with NO food asks: Cancel / "Just close the day" / "I ate nothing" with the approved "why we ask"; only "I ate nothing" makes it a 0-kcal day that counts toward the 7 in a row. The 20:00 "Nothing else today" closes without asking (an empty day closed there does not count). [D 2026-10-01 #129, #237; FL-47] A day whose only rows are refused/unparsed/too old/pending closes without the question → GAP G-54.
- **PRD-FOOD-25** "Fix this entry": item name, kcal, carbs, protein editable; the day bar Today / Yesterday / Earlier day (2–7 days ago → DL-95: FL-2 allows food up to 7 days back, and Today = 0, Yesterday = 1); no category picker; a changed item becomes the user's value and its open follow-up is dropped; the sheet floats 30 pt above the edge. [D 2026-10-02 #248; part 23 #216] "Remove entry" deletes without asking → GAP G-56 (every delete asks first).

#### The 7-day run
- **PRD-FOOD-40** The reality check takes intake only from ≥ 7 CONSECUTIVE complete days (the most recent such run). Days counted: from the check start to yesterday, plus today once closed. Complete = a day with parsed food (a past day with food counts; today counts only once closed), or closed + "I ate nothing". A gap, an empty closed day, or a "not recorded" mark breaks the run. [D 2026-09-27/10-01 #236; FL-3, FL-47; 04 R-R4] No UI writes "not recorded" any more; keep as built (retire the mark, FL-3 amended with his signature) or bring it back waits for the founder → OPEN-18 (2) (DL-66 withdrawn; G-57).
- **PRD-FOOD-41** Until a 7-day run exists the app shows progress ("{n} of 7 so far" / "4 of 7 days in a row") and never offers or guesses an intake number for the check (before a 7-day run the fold shows the run so far, "Run: {d} days · ~{kcal} kcal/day logged", `screens/components/CalculatorSection.js:1503-1504`, as the prototype approves); the user may instead type an average (Premium, 4.6). [D #236; FL-3, FL-48]
- **PRD-FOOD-42** Offline-pending entries do not make a day complete until parsed. [FL-3 evidence]
- **PRD-FOOD-43** Different "days" counts can sit on one screen (latest ≥ 7 run vs trailing run vs "food logged on N days"): on a phone Progress shows two (identical until a ≥ 7 run exists, then different); all three side by side only in the Fold book layout (Journey + Progress) → GAP G-50 (presentation).

#### Offline, limits
- **PRD-FOOD-50** An entry typed offline is saved (pending) and parsed later — only by the device that typed it — on chat open, hero focus, reconnect, or after 20 s while online; the offline notice appears only when the device is actually offline (else "retry"); a health entry is never silently deleted (refused → kept with Remove; empty → kept). [D #377; FL-19, FL-46] The chat's own "Remove" pill on a refused or too-old row deletes it without asking → G-161 (AD-01).
- **PRD-FOOD-51** Server caps (every plan). **Ledger:** 25 AI parses per user per day; follow-up answers don't count (decisions.md:251; FL-21). **Code:** 25 parses and 25 follow-up answers per user per `entry_date` (the client's local date), plus a hard ceiling of 60 per rolling 24 h shared by both kinds — the follow-up cap and the 60 / 24 h ceiling have no ledger line → keep or change waits for the founder → OPEN-18 (3) (GAP G-153). A new date starts at 0, but a given date's counter **never resets** (which is why G-59 can never clear itself); the slot is reserved before the model call (refusals and provider errors count); hitting it shows a clear message, keeps the typed text and saves nothing half-done; a counting error fails open. Logging for yesterday counts against yesterday's 25. [D 2026-09-10/27 #251; FL-20…FL-22; 04 R-F9] A quota hit on an offline re-parse keeps the row pending and retried on every open (the catch-up re-parses rows of the last 60 days, `localDaysAgoISO(60)` in `lib/foodLogActions.js`) → GAP G-59. The fix is DL-28 (rewritten): `parse-food` counts the 25 by the user's local day of the request, and a re-parse refused by the cap marks the row "not read yet — daily limit reached", keeps the text, explains, and retries the next day (the new row state and notice: OPEN-24 item 8; the server deploy: Approvals item 1).

#### Free days and access (FL-41)
- **PRD-FOOD-60** Free users get the AI food log (and the reality check it feeds) for **7 days counted from the first day they used it** — the first send, or the reality-check start tap — persisted as a synced `free_start` marker; backdating the check start never shortens it; a user who never used it has all 7 days. [D 2026-09-27 #274; 2026-10-03 #446; FL-41]
- **PRD-FOOD-61** The last 2 free days show the grace / free-days-ending note with the user's own numbers and a paywall button. After the 7 days the app explains the food log's benefits in its own words with the user's numbers and takes them to the paywall; logging is locked (locked hero, locked card in the chat, no 20:00 questions) until Premium. Weigh-ins stay free. [D #274; FL-41; 04 R-A3, R-A5]
- **PRD-FOOD-62** If paid Premium ends during a running check, the user finishes the current week of the check (grace until the end of the check week — days 1–7 / 8–14 / 15–21 — that contains the end day, only if the end day is on/after the check start), never with "free days" wording. Grace is **logging only**: no new reality check and no result (decided — AD-14; decisions.md:229, :274). [D #274; 04 R-A4] Code today lets a lapsed payer in grace start a new check and see its result (`realityCheckAccess({rcFree: canLog})`) → GAP G-53 (DV-101).
- **PRD-FOOD-63** One owner decides access (`foodLogAccess`) for the chat, the heroes, Progress, the grace note and the 20:00 reminders. If the access read fails, the chat is not gated `[code]`. [04 §6.7]
- **PRD-FOOD-64** The server must enforce the same access for paid AI calls (the ledger: "the server stays authoritative for paid AI calls"). [D 2026-10-01 #288; FX-16] `parse-food` checks only auth and quota → GAP G-40.

**States (04 §5).** Food day: empty → pending → partial → closed / closed-empty / closed-ate-nothing (/ not recorded, legacy). Access: never used (7 left) → free days → free days ending → locked; Premium; grace; locked.

**Edge cases.** Offline parse (re-parsed by the typing device); midnight crossing; time-zone change (stored dates are local strings and do not move; thread dividers may shift); a follow-up answer after the entry was edited (dropped); "another one" with nothing today (asks); two devices typing (each re-parses only its own rows); all "ate nothing" days (0 kcal average → `too_short` message is misleading → GAP G-58); an entry moved to another day by the editor can make or break a run retroactively (allowed).

**Free / Premium.** Free: 7 days from first use, then locked. Premium: every day. Caps for everyone (ledger: 25 parses a day; the code's extra follow-up cap and 60 / 24 h ceiling → OPEN-18 (3), PRD-FOOD-51).

---

### 4.6 Reality check, Progress, Your numbers, weigh-ins, target

**Purpose.** "Where am I" in one card — weight, daily burn, target, weigh-ins and the numbers behind the math — then Your daily plan, then the reality check that turns 21+ days of weight change plus 7 days in a row of real intake into a **measured** daily burn (progress-one-card.md purpose; decisions.md:220, :240). Never links body metrics to dosing; Lose / Maintain / Gain is always the user's choice (decisions.md:242).

**Entry points.** Journey → Progress tile (Fold: Journey's right page by default); Today's reality-check alert (focus reality); the day-21 notification (focus reality); the weekly check-in notification (focus "Log today's weight"); the paywall from locked parts.

#### Progress screen layout
- **PRD-PROG-1** With numbers: ONE card on top holding, in order, the hero (Weight, Daily burn), Your target, "Log today's weight", the Weigh-ins fold and the Your numbers fold; then the Your daily plan card; then the Reality check card; then the disclaimer and the "Understand the numbers" / "Sources" folds. The separate target, weigh-ins, numbers and old hero cards are gone. [D 2026-10-02 #220; PO-1, PO-8]
- **PRD-PROG-2** First use (no daily burn yet): the same card with Weight "—" and Daily burn "—" in ink3 (the weight shows once there is one), "Fill in your numbers below to see your daily burn.", a non-folding "Your numbers" header with the form open, then "Set a target", then Weigh-ins "None yet"; no daily plan; the reality-check card below. [D #221; PO-9]
- **PRD-PROG-3** "Log today's weight" is hidden until the first weigh-in or a daily burn exists; the daily plan shows only with a daily burn. [D 2026-10-01/02 #226; PO-10]
- **PRD-PROG-4** The Progress screen must refresh on sync events and at local midnight like Today, and re-read the open check on every focus (it loads it once per mount today). [logic: P-12; 04:D-4, D-5 = DL-25] → GAP G-46, G-47

#### Hero, daily burn
- **PRD-PROG-10** Hero: Weight and Daily burn as big numbers with the Estimated / Measured chip (Measured = the latest saved reality-check result); under them the "Since …" line (two or more weigh-ins) and the formula line (method + BMR, or "Measured from your reality check · estimate N"). [PO-2, PO-3]
- **PRD-PROG-11** Daily burn (option A) needs weight + height + age + sex; body fat and waist only sharpen it (Katch-McArdle when body fat is known, else Mifflin-St Jeor); inputs in range (age 10–120, height 100–250 cm, weight 25–300 kg, body fat 3–70 %) else "check inputs". The Journey Progress tile follows the same rule. [D 2026-10-02 #222; PO-12; 04 R-P1-R-P2]
- **PRD-PROG-12** Existing users who had weight + body fat but miss height/age/sex keep their daily burn computed as before, plus the tappable "Complete your numbers" (opens the fold); the decision is kept in the synced inputs (merge write). [D #222; PO-13]
- **PRD-PROG-13** No sex-dependent calculation runs until the user has set their sex (the BMR is withheld and the user is asked). [D 2026-09-09 #224]
- **PRD-PROG-14** A measured maintenance becomes the hero number once it exists; goals rebase off it and the formula drops to an "estimate" sub-line. [D 2026-09-13 #240] When the formula gate fails later (e.g. height cleared), the measured number disappears too `[code]`. Whether a measured burn shows when height, age or sex is missing waits for the founder → OPEN-22 (a): the signed PO-12 gates "daily burn", while the founder's words behind it were about the formula inputs and decisions.md:240 makes the measured number the hero once it exists (AD-45 moved there; DL-75 withdrawn) (G-194).

#### Your numbers
- **PRD-PROG-20** The form always asks everything: Metric / Imperial, Weight, Height, Age (locked while the profile has a birth year), Sex (Male / Female bar, neither chosen until set; saved to the profile, never a "male" default), Body fat (%) · optional, Waist · optional with its hint, the body-fat source pills with their hint, Activity level (the 5 levels). Until there is a daily burn: "Weight, height, age and sex give your daily burn. Body fat and waist make it sharper." Unit switches convert typed values; comma decimals are read in the app language. [D 2026-09-27/10-02 #223; PO-11]
- **PRD-PROG-21** The fold row summary repeats the numbers used in the math — "84.6 kg · 181 cm · 38 yr · Male · 21% BF · Moderate" (age word per language: yr / años / anos / ans / J. / anni), only the parts that exist. [PO-7, PO-18]
- **PRD-PROG-22** The profile's sex and birth year are the only source for the BMR; changing them in Settings changes the calculation; age follows the birth year. [D 2026-10-01 #312; FX-10] When the profile has none yet, the code falls back to the calculator's saved age and saved sex (else a "male" placeholder, returned with `profileSex: null` so PRD-PROG-13 still withholds the BMR) (`lib/bodyProfile.js:10`, `:14`) `[code]`.
- **PRD-PROG-23** One activity answer: the newest stamped side wins (profile vs calculator); unstamped → the profile; default 1.375 when none. `[code]` [04 R-P4] (decisions.md:232 is only "one 5-level activity scale"; no ledger line has the stamp rule)
- **PRD-PROG-24** The Your-numbers weight adopts the newest weigh-in unless the weight was typed on that day or later (A-101e). [04 R-P5] After a fix or a delete of a weigh-in, the hero and the daily burn can show different weights → GAP G-51.
- **PRD-PROG-25** Changing the weight when weigh-ins exist asks first (DoseTrace sheet): "Update your weight" / "Changing your weight works like a weigh-in." / "Update the <date> weigh-in" · "Save as today's weigh-in" · Cancel (Cancel or a tap outside puts the saved weight back; only Update when the latest weigh-in is today). With no weigh-ins, a weight the user changed and saved becomes the first weigh-in (one row for today, with body fat and waist when present) — only on a user save, never on open, load or migration. [D 2026-10-02 #225; PO-14, PO-15, PO-17]
- **PRD-PROG-26** Other fields save by a debounced merge into the synced calculator inputs (and the legacy `user_metadata` mirror); values stored canonical. [04 §3.3] Two devices editing inputs both offline → the last push wins on the whole payload → GAP G-62.

#### Weigh-ins
- **PRD-PROG-40** Weigh-ins are NEVER paywalled: "Log today's weight", "+ Add a past weigh-in", the chart, and the weigh-in of a running check are free for everyone. [D 2026-09-27/10-01 #229; FX-15]
- **PRD-PROG-41** "Log today's weight" (ink button) opens the sheet: weight, body fat (optional), waist (optional); Save merges into today's row and updates Your numbers. [PO-5]
- **PRD-PROG-42** One row per local day: a later weigh-in that day merges per field and never writes null over a stored value; both reality-check weigh-ins (start and final) are weigh-ins; snapshots are automatic (no "Save a snapshot"). [D 2026-09-28 #230; A-53]
- **PRD-PROG-43** "+ Add a past weigh-in": a past date picked on the date wheel, which runs from 10 years back to today (`lib/wheelPick.js:16`; future dates clamped), merged into that day's row. [04 §3.3] (There is no "no lower bound" hole: 1926 cannot be picked; no change — DL-73 withdrawn, the wheel stops 10 years back.)
- **PRD-PROG-44** Every weigh-in path validates the same ranges: weight 25–300 kg, body fat 3–70 %, waist 30–250 cm, comma decimals, imperial round-trips. [logic: one rule (PO-21 is the signed range) = DL-27] Only the fix sheet enforces them today (the existing validator is `readWeighInForm` / `RANGES`, `lib/weighInEdit.js:11-45`) → GAP G-55.
- **PRD-PROG-45** Weigh-ins fold row: "N · last <date> · <weight> · <bf>% BF" (body fat only when the last one has it) or "None yet"; open inside the card: trend chart (or "Two weigh-ins make a trend."), the table date / weight / body fat / waist, Show all / Show less, + Add a past weigh-in; every row ends with a chevron and is tappable; under the table "Tap a weigh-in to fix or delete it." [PO-6, PO-19]

#### Fix or delete a weigh-in
- **PRD-PROG-50** A tapped row opens the "Weigh-in" bottom sheet (Cancel left, title centre): the date as fixed text (a weigh-in's date cannot be changed), Weight, Body fat (%) · optional, Waist · optional, prefilled; "Changes here update your progress, your target and your reality check."; Save corrects that day in place (same synced row, never a new one). Invalid value → one line, nothing saved. [D 2026-10-02 #227-228; PO-20, PO-21]
- **PRD-PROG-51** Red "Delete weigh-in" asks first: "Delete this weigh-in?" / "{date} · {weight}. Your progress, your target and your reality check update without it. This can't be undone." / Cancel · red Delete; every row of that day becomes a tombstone that a later pull, full import or another device's push never brings back — except a NEWER weigh-in typed on another phone for that day, which is re-inserted (newer user input wins). [PO-22, PO-23; D 2026-10-04 #539; A-92]
- **PRD-PROG-52** The weigh-in that started the open reality check can be fixed but not deleted (no Delete; the note "This weigh-in starts your reality check, so it can be fixed but not deleted."; refused below the UI too); fixing it moves the check's start weight with it. [D #228; PO-24]
- **PRD-PROG-53** After Save or Delete everything that reads weigh-ins updates at once (C-17, C-18). [PO-25]

#### Your target
- **PRD-PROG-60** Inside the card after a separator: weight → target, the scale, the ETA / reached / moving away / locked line, the base and the neutral healthy-range fact (BMI line states the WHO range instead of "below the healthy range"), the target date; "Edit" or "Set a target" opens the target sheet (weight and/or body-fat target, stored in kg / %, one active per user); "Remove target" asks first. [D 2026-09-13 #241; PO-4; D 2026-10-04 #544]
- **PRD-PROG-61** Setting a target and the progress bar are free; the measured ETA is Premium (teaser → paywall). The ETA needs a weigh-in series spanning ≥ 14 days and a rate ≥ 0.1 / week, labelled with its weigh-in window; pure math. [D #241, #281; 04 R-P7] Built: no staleness cutoff, the window is named; whether an estimate from an old weigh-in window still shows waits for the founder → OPEN-22 (b) (DL-68 moved there).

#### Your daily plan
- **PRD-PROG-70** Shown only with a daily burn: Lose / Maintain / Gain as % of the daily burn (lose −15–20 %, gain +10–15 %; never a flat 500 kcal), floored at max(BMR, 1200 F / 1500 M); protein; Estimated or Measured chip; "What this is" inside; waist is a first-class output. [D ~2026-07 / 2026-09-27 #242; 04 R-R7]

#### Reality check
- **PRD-RC-1** The reality check lives inside Progress (no separate card or screen of its own); the free reality check opens the explainer first ("See how it works"). [D 2026-09-28/29 #218; 2026-10-01 #234]
- **PRD-RC-2** Start sheet: start date today … 7 days back (a real calendar day, never in the future, stepper ‹ date ›), start weight prefilled from that day's weigh-in (moving the date never overwrites a typed weight). Start writes the open check (synced, Stop-wins), creates that day's weigh-in only if the day has none, anchors the free days, and arms the day-21 and 20:00 reminders. [D 2026-09-27 #238; FL-44; 04 R-R1] The check has its own start-weight field although Q-A said "no weight fields of its own" → OPEN-07.
- **PRD-RC-3** Only one open check per user (the newest start wins across devices). [04 §5.1; FX-9]
- **PRD-RC-4** Status line: "In progress · weigh in {date}" before day 21; "Time to weigh in" when due; and — after the weigh-in — the same state Today shows ("Weight logged — {n} more days of food logs in a row" / ready). [logic = DL-25 (one reality-check assembler; A-118 is the founder's bug report, features.md:258)] Progress shows "In progress · weigh in {past date}" after the weigh-in today → GAP G-42.
- **PRD-RC-5** After day 21 without a weigh-in the check stays open: "Time to weigh in" on Today, and the 20:00 food reminder continues while the check is open — no weigh-in or day-21 cut-off (`lib/notifications.js:695-703`, FL-42) and none on days the user cannot log; it ends when the check finishes or is stopped. [D #238; FL-42]
- **PRD-RC-6** The check uses the FIRST weigh-in dated on/after start + 21 (never a later one); a weigh-in before day 21 is stored and ignored by the check; a backfilled weigh-in dated ≥ day 21 counts; deleting it makes the next one the result weigh-in (before saving). [04 R-R2, R-R3; edge 1-3]
- **PRD-RC-30** "Enter my average calories per day" (PT "Informar minha média de calorias por dia"; the same line in all 6 languages, 2026-10-08; signed FL-48 said "Type your average calories instead") (an underlined link in the open check, also when it is time to weigh in): a DoseTrace sheet with one field (kcal/day, 500–10,000), Save dimmed until valid; can be changed ("Change the calories you typed") or cleared until the check finishes; kept in the synced inputs. Change/clear lines say "entered" / "informada". **Premium only** — free users see it once they subscribe. [D 2026-10-02 #235; 2026-10-08 #635-636; FL-48] Shown during free days/grace today → GAP G-41.
- **PRD-RC-31** With a weigh-in on/after day 21 and a 7-day run OR a typed average, the check can finish with the same math; with both, the food run is used, the typed value is kept and a one-line note says so; the source (food / typed) is recorded next to the result. [FL-48]
- **PRD-RC-50** Result math: daily burn = average intake + (start weight − final weight) × 7700 / days; weekly rate = Δ / days × 7. Status, in the order tested: maintenance (|Δ| < 0.2 kg), too short (average ≤ 0; the "< 14 days" branch is unreachable because the result weigh-in is always ≥ day 21), implausible (outside 1000–5000 kcal), ok. Only "ok" is saved. [04 R-R5] Copy defects: `cal_rc_implausible` always says the result is implausibly **low** ("intake was higher than remembered"), also for a high result such as 5,600 kcal → GAP G-150; `cal_rc_too_short` says "Use weigh-ins at least 14 days apart" although its only reachable cause is an average of 0 kcal (N-3) → GAP G-58 (extend). The result buttons "Use my food log" / "See my actual maintenance" from day 14 (Q-B) vs the self-finishing check → OPEN-07. What happens when the math gives no savable number (maintenance / implausible / too short: never saved, never closes) waits for the founder → OPEN-09 (G-188).
- **PRD-RC-51** The check finishes by itself when Progress is opened (the save runs only in `CalculatorSection.js:855-859`, mounted only by Progress) and the state is ready, the status is ok, the user may see results (Premium, or still inside the free days — **never** in a lapsed payer's grace week, AD-14 / decisions.md:274; code today also allows grace → GAP G-53, DV-101) and no result exists dated on/after the start: one result row per weigh-in date (the latest is the Measured daily burn), the source recorded, the open check closed, both reminders cancelled. [04 R-R6-R-R7] The self-finishing needs the founder's explicit OK → OPEN-07. A new check started on or before the last result's date (`CalculatorSection.js:853`, `c.date >= rcStartISO`, so a backdated start too) is hidden behind the old result and never finishes → GAP G-48.
- **PRD-RC-52** A free user does not get the day-21 result without Premium (free days end around check day 7); the locked panel explains with their own numbers and offers the weigh-in of the running check (free). [D #274; FX-15; FL-41]
- **PRD-RC-53** "Ready" that cannot be shown (locked) or cannot be saved (maintenance / implausible / too short) must say what it is on every surface instead of "ready — tap to see it" → DL-26, OPEN-09 (the new texts: OPEN-24 item 7). [04:D-3]
- **PRD-RC-60** Stop asks "are you sure?", stops the open check, cancels the day-21 and 20:00 reminders, keeps the logged food and weigh-ins, and today also deletes every saved reality-check result (measured history) → OPEN-08. The same Stop link is also shown with **no** check open — on the result view and in the locked branch when results exist (`CalculatorSection.js:1475, :1541`) — where one tap wipes the whole measured history → GAP G-149 (S1; extends DV-004). The confirm copy "This clears your reality-check numbers…" (PT "Isso apaga seus números reais", which reads as the feature name) was never approved. Across devices Stop always wins (client and server trigger). [D 2026-09-10/27 #239; FX-5, FX-9]
- **PRD-RC-61** "Start over" asks first, stops the open check and keeps the results. [D part 12 #216]
- **PRD-RC-62** "Weigh in again in 21 days" after a result opens the start sheet. [04 §3.2]
- **PRD-RC-63** The open check and the calculator inputs live in synced tables; the migration from the old storage carried everything over, offline and idempotent; calculator history is uncapped ("capping = data loss"). [D 2026-09-12 #373; 2026-09-27/28 #374; FX-8]

**States (04 §5.1).** none → running → due → needs food → ready (ok / maintenance / implausible / too short) → saved (→ none) · ready-locked · ready-unsavable · stopped. Weigh-in vs the check: start weigh-in · pre-due · result weigh-in · later · deleted.

**Edge cases.** Weigh-in before day 21 (ignored, weigh again at day 21); two weigh-ins on/after day 21 (first counts; same-day merge changes it before saving); two devices (Stop wins; two offline starts → newest wins; possible two results; inputs last-writer race); Premium ends mid-check (grace week: logging only, no new check, no result — AD-14); free user timeline (free days end near day 7, result needs Premium); start weight not range-checked (→ GAP G-55); "Weigh in again" on the result day (→ GAP G-48); sign-in on a new device (the open check from the mirror until the first pull); Progress open across midnight (→ GAP G-47).

**Free / Premium.** Free: Your numbers, daily burn, daily plan, target + progress, all weigh-ins, starting a check during free days (never in a lapsed payer's grace week), the weigh-in of a running check. Premium: the result after free days, starting a new check after free days, typed calories, the measured target ETA. Paywall copy must not list "progress tracking" as Premium → GAP G-43.

---
### 4.7 Dose accumulation (the curve) and the Journey dashboard

**Purpose.** Dose accumulation is an **educational math estimate** of how much of each compound may be present over time, drawn from the protocol's **planned schedule** and **published half-lives** — never a measurement, never advice; the flagship Premium feature (decisions.md:111, :206, :279). Journey answers "Is my body responding to what I'm doing, and what do I log today to keep measuring it?": the AI food log card, the Progress tile and the Dose accumulation tile, and the "Understand the numbers" / "Sources" folds (decisions.md:215; journey-dashboard.md).

**Entry points.** Journey tile (Premium → curve; free → paywall `journey_serum`); My Body card (Premium → curve; free → the example preview sheet → paywall `serum_preview_sheet`); Dose log "Curve" button (Premium → curve; free → paywall `log_serum`); a direct/back-stack open by a free user → replaced by the paywall `serum_direct`; Fold: Journey and My Body right pages. Today has no direct link (by design, via the Dose log). (05 §2.2)

#### Journey dashboard
- **PRD-JOUR-1** Order: header (tab title + subtitle) → the AI food log card full width → two tiles side by side, Progress and Dose accumulation (stacked when text size ≥ 130 %) → "Understand the numbers" and "Sources & references" folds. No adherence tile, no labs tile. [D 2026-09-29 #215; 2026-10-02 #216; 05 §2.4]
- **PRD-JOUR-2** The food card is titled "AI food log"; it shows today's line (items · ~kcal, closed, or empty) and, while a reality check runs, only the 7-day run line (no reality-check line); locked → paywall; offline entries are re-parsed on focus. [D #216-217; 05 R54]
- **PRD-JOUR-3** Progress tile ("Progress"): weight (latest weigh-in, else typed), "Since {first weigh-in}: ±Δ" with ≥ 2 weigh-ins, daily burn rounded to 10 with the Measured / Estimated chip — the same daily-burn gate as Progress; before the gate passes the prompt "Enter your weight, height, age and sex to see your daily burn." Refreshes on focus, sync and `data_changed:'calc'`. [D 2026-10-02 #216, #222; PO-12, PO-18; 05 R53] The tile's daily burn uses the saved weight, not the adopted one → GAP G-52.
- **PRD-JOUR-4** Dose accumulation tile: Premium + a charted compound → dot (protocol colour), name (blend "Blend · Component (est.)"), "Est. level", the number in data blue + unit, the "Estimated" chip; Premium without a charted compound → chevron + description; free → "Premium" tag + description, no number (Q5). The curve icon is blue (curve_loose). [D 2026-09-29 #219; 2026-10-02 #65, #216; 05 R52]
- **PRD-JOUR-5** While Premium is still unknown the tile reads as free and a tap goes to the paywall (which then says "You already have Premium") `[code]` → GAP G-74 (logic: wait for the answer before routing).
- **PRD-JOUR-6** A Journey tile tap is counted in analytics like the other curve entries. [A-98] → GAP G-71
- **PRD-JOUR-7** The Journey explainer ends: "Every weigh-in is saved, so you can watch the numbers change over time." The FAQ has answers for AI food log, reality check, Dose accumulation, Vaccine journal and "Lab test journal". [D 2026-09-29 #134-135]
- **PRD-JOUR-8** Book layout: left = the dashboard; right = Progress by default; the food card opens the AI food chat on the right (no Done, no auto-close); the Dose accumulation tile opens the curve on the right for Premium and the paywall full screen for free users. Premium lost while the curve is open clears the selection. [BK-5, BK-17; 05 §2.3]

#### What is charted
- **PRD-CURVE-1** Only injectables (powder or ready-to-use). Charted when a half-life entry exists, the dose > 0 and the dose converts to the curve unit. Excluded and IU compounds are NAMED as "not charted" (empty state and under the picker ×6), one line per reason (IU dose of a mass compound, no data/excluded, no dose). [D 2026-09-24 #130; 05 R1, R3] Oral protocols are dropped silently although the screen promises to name what it does not chart → GAP G-68.
- **PRD-CURVE-2** Excluded from the curve (still journalable): insulins (an implied insulin level is the one place a misread is dangerous), IGF-1 LR3, Dihexa, PEG-MGF, Adipotide, Thymalin, RGD Peptide, FOXO4-DRI, GDF-8, Dermorphin. Half-life tiers clinical / studied / estimated with the label-verified corrections (e.g. Tesamorelin 0.13 h, Testosterone Undecanoate 2160 h, Cetrorelix 20.6 h, Sustanon 168 h). `lib/halfLives.js` is unchanged by the redesign. [D 2026-09-09/10/24 #203; 05 R5, R50]
- **PRD-CURVE-3** Blends split by their common mg ratio into component lines labelled "(est.)" (KLOW 80 mg = 50 GHK-Cu / 10 KPV / 10 TB-500 / 10 BPC-157; Glow 50/10/10; Wolverine 1/1); the per-vial "What's in the vial" label is journaling only and never feeds the curve. [D 2026-09-18/24 #205] Component lines drawn like any compound (solid past) vs the founder's "dashed '(est.)' component lines" (decisions.md:205) → keep as built or change waits for the founder → OPEN-18 (1) (two pictures first; DL-32 withdrawn) (G-214). Picker rows lack the blend name → GAP G-66.
- **PRD-CURVE-4** Ended protocols are offered for 365 days after their end, after the active ones, most recently ended first, labelled "· ended"; deleted and purged protocols never. [05 R6]
- **PRD-CURVE-5** Units: the curve is always in mg, except IU-native compounds (HGH/HCG/HMG/FSH in IU; HGH mg → IU × 3); one unit per chart (picking the other unit starts a new selection with only it). [D 2026-09-18/24 #204; 05 R7-R9]
- **PRD-CURVE-6** The half-life lookup uses the English compound name (or the user's own name) with exact → alias → longest key → unambiguous partial resolution; excluded entries stay in the table so a fuzzy match cannot borrow a neighbour's value — except GDF-8 and Dermorphin, which were removed from the table instead (`halfLives.js:141-145`; still not charted). [05 R4-R5]

#### The model
- **PRD-CURVE-10** Dose events come from the protocol's **schedule**, never from logged doses: per calendar day the expected count (0 before the start date; interval from the start date; after an end 0; the end day only slots up to the end; the creation day at least 1); calendar-day stepping so a 25 h fall-back day is visited once. [D 2026-09-24/29 #206; A-101b; 05 R10-R13]
- **PRD-CURVE-11** Dose hours on the curve are fixed local hours (1/day 12:00; 2/day 06:00 and 18:00; 3/day 06/12/18; 4/day 00/06/12/18), not the user's reminder times `[code]` → DL-31 (the user's own times; pharmacometrician check) (G-175).
- **PRD-CURVE-12** Complete / Skipped / Missed rows never change the curve; "Est. level" follows the PLANNED schedule (A-07). Whether missed doses should show as dips, and "count only Taken doses", is a pharmacometrics review → OPEN-11 (G-176). [D #206; A-31]
- **PRD-CURVE-13** One current dose for every past and future dose (an edited dose rewrites the past estimate) `[code]` → OPEN-10 (F2) (G-174).
- **PRD-CURVE-14** Level math: kd = ln 2 / t½; fraction remaining e^(−kd·Δt), or the Bateman absorption form for compounds with a published time-to-peak (Semaglutide 48 h, Testosterone Cypionate 71.7 h, Testosterone Undecanoate 168 h, Sustanon 250 36 h; same area as instant absorption); level = Σ dose × fraction over doses up to that moment; look-back max(16 days, days in the shown window + 2, 6 × t½), capped at 600 days; samples every 6 h; doses older than 30 × t½ + 3 × Tmax dropped. Enanthate/Nandrolone stay instant → DL-37 (G-189). [D #202-203; 05 R14-R21]
- **PRD-CURVE-15** `history_from` ("No, the dose was different") draws nothing before that day; otherwise the part before the protocol was added is "estimated from your start date": a dashed vertical line at the moment it was added + "Before {date}: estimated from your start date", only when the creation moment is inside the window. [D 2026-10-03 #516; 05 R16, R33]
- **PRD-CURVE-16** Combined total per substance (testosterone, nandrolone, trenbolone, drostanolone, boldenone, estradiol, progesterone) when ≥ 2 selected members of one substance; the combined hint says it is a rough total of compound amounts, not active-hormone mass, not an assay. [05 R22, R47] "substance_boldenone" is missing in all 6 languages → GAP G-69.
- **PRD-CURVE-17** The serum curve is sex-neutral (no sex, weight or body-fat input anywhere); any covariate only per compound with published data via a future Vd/CL engine (GREEN published / YELLOW info only / RED unchanged; no blogs, forums or AI estimates as evidence). [D 2026-09-09 #201-202; 05 R49] Future free/Premium split → AD-47.

#### The screen
- **PRD-CURVE-20** Screen title "Dose accumulation"; order: Est. level first (single compound: "Est. level · now" + 56 pt light number + "Estimated" chip; several: one hero row per series), the chart (solid past, dashed shaded future zone, dose ticks under the axis, the Now line), Project ahead (+7 / +14 / +30 / +60 / +90 days, default +7), stats (34 pt: Est. level, Half-life, Doses counted), "Estimate on a date" (the next 3 dose days, bloodwork dates, Other date), one data-rating card per compound with its source one tap away, the disclaimer. The same screen and the same Est. level appear in Journey and My Body. [D 2026-09-29 #209; #189; 05 §3]
- **PRD-CURVE-21** Opens on the last 3 days; an earlier "Estimate on a date" widens the window to min(365, days back + 1); one-decimal grid labels (0.0 / mid / max with 12 % headroom); axis labels "−{n}{d}", "Now", "+{n}{d}" with the day letter per language (d/d/d/j/T/gg), never overlapping "Now"; "Now" in sentence case. [D 2026-10-02 #207; A-73, A-101a, A-104; 05 R23-R30]
- **PRD-CURVE-22** Number format: "0" at zero, one decimal below 10 in the app's decimal, else whole (never grouped); peak "≈ {max}". Fast compounds keep showing ~0.0 mg between doses (Q-M). [D #206; 05 R24-R25] "0.0 mg" hero for short half-lives is among A-96's picture items.
- **PRD-CURVE-23** One compound draws in data blue; several keep their protocol colours; the combined line in ink. [05 R31-R32]
- **PRD-CURVE-24** "Doses counted" must count the doses that make the estimate, or say what it counts. [A-96 approved, picture first] → GAP G-67.
- **PRD-CURVE-25** Opening moment: 2.4 s draw-in of the past, the Now rise, the projection, a breath; dose drops when ≤ 24, pulses when ≤ 60; Reduce Motion → final frame; any touch or change ends it. Whether the intro plays on every open waits for the founder → OPEN-18 (4) (Conflict 40, decisions.md:441; AD-44 moved there) (G-206). [D 2026-09-24 #74; 05 R36]

#### Honesty
- **PRD-CURVE-30** The always-on disclaimer says the estimate follows published half-lives and the user's **planned schedule**, individual PK varies, educational, not a blood level, confirm with bloodwork, not medical advice, not a medical device (×6); never "your level will be". [D 2026-10-01 #111; FX-13]
- **PRD-CURVE-31** "Estimated" next to every Est. level; labels "Est. level" / "Est. level · now", never "blood level". [D #112; 05 R45]
- **PRD-CURVE-32** Per-compound card: evidence tier tag (clinical / studied / "Estimated — no human data" in attention), a model note (absorption with peak and published range; depot ester drawn instant; fast compound), the source one tap away; blends add the blend caveat. [D 2026-09-28 #73; 05 R46]
- **PRD-CURVE-33** Copy never says the curve uses "logged" doses: the empty state "log doses to see your curve", the combined hint "compound amounts you logged", **and the live Premium strings `paywall_hero_sub` ("Dose-accumulation curves from your own log…", `PaywallScreen.js:278`) and `settings_premium_feat_1` ("Dose accumulation curve from your own log", `SettingsScreen.js:642`)** ×6 must change to the planned schedule. [logic: FX-13 / A-07 intent = AD-19; decisions.md:111] → GAP G-70

#### Estimate on a date
- **PRD-CURVE-40** Chips: the next 3 dose days and every bloodwork date (newest first); "Other date" opens the date wheel (10 years back … 2 years ahead); a tap shows the estimate on that date beside the bloodwork date — never compared with a lab value; the readout date is never remembered. [D #209; 05 R48, A5-A7] A date more than 365 days back shows "—" per compound with no explanation, while the Combined row still prints a computed number (`SerumCurveScreen.js:1021` vs `:1031`) → GAP G-72 (logic: cap the wheel at 365 days back or say why; the Combined row must follow the same rule).

#### Remembered view (A-41)
- **PRD-CURVE-50** The curve reopens exactly as the user left it — selected compounds, Combined on/off, horizon — saved per user on the device (a convenience, not synced); written only on a user change, never on open; restore keeps saved ids still charted (first unit only); nothing valid → the newest-created active protocol (DL-36; the dashboard plan's second fallback is not built and the plan is amended → G-215); a protocol created later never joins the selection; never zero selected. [D 2026-10-02 #208, #380; 05 R37-R39] Lost after sign-out/sign-in on the same phone (local row ids change) → GAP G-73 (SUSPECTED).
- **PRD-CURVE-51** The Journey tile and the My Body card show **the same compound and the same Est. level** as the curve's first selected compound. [D 2026-09-29 #209; MB-4] → GAP G-63 (tile/card use active protocols only, so an ended first selection diverges), GAP G-64 (DST grid snap: tile 0.0625 / 0.0 vs curve 0.25 mg at 0.5 mg for up to 14 days after a clock change — and the reverse, the tile showing a dose the curve does not have yet), GAP G-65 (My Body does not listen to curve changes on the Fold).

#### Premium gate
- **PRD-CURVE-60** The curve screen checks Premium on every focus; free → paywall (replace in stack; navigate when embedded). [05 R42] Free users see examples only: the paywall hero, the onboarding hero and the preview sheet use example constants labelled "Example", never user data. [D #286]

**States (05 §5).** Screen: checking Premium → paywall / loading → empty (reasons) / chart (intro → settled). Selection: restore → remembered / default → single ↔ multi. Window: today 3 d → chip date / custom date → extended → before 365 ("—") / future (no marker). Tile: unknown → free / Premium no data / Premium level.

**Edge cases** (05 §8). Protocol ended (past only, decays; offered 365 days; tile never shows ended → GAP G-63); ended at last dose (curve stops there); restarted (two lines; Combined if same substance); dose edited mid-cycle (past rewritten → OPEN-10); skipped/missed (still counted → OPEN-11); `history_from`; start before creation (marker only inside the window); long esters (600-day look-back); fast compounds (~0.0 between doses); DST (calendar stepping fixed; grid snap → GAP G-64); travel (all local wall-clock); future start (level 0; nothing drawn if beyond the horizon); creation day (at least one dose); no start date (interval ignored → OPEN-03); > 4 doses a day (slots shared); mixed units (never one chart); screen left open (frozen "now" until a change); blend label edited (never feeds the curve); deleted protocol (dropped).

**Free / Premium.** The curve, the tile number and the My Body number are Premium; free users see the Premium tag and examples.

---

### 4.8 My Body — Lab test journal, Vaccine journal, hub

**Purpose.** The user's own health-record journal: lab values and vaccine records, plus a shortcut to Dose accumulation. Transcribe and organize, never interpret (AI hard line; decisions.md:266, :317); records are the user's (every delete asks first, synced tombstones) (my-body.md).

**Entry points.** Tab "My Body"; Today "Bloodwork due" → Lab test journal; Fold: left = labs + vaccines, right = the tapped test / marker / vaccine / curve.

#### Hub
- **PRD-BODY-1** "My Body" large title and the subtitle "Your records, all in one place." (no "insights"), then three raised hero cards in this order — Lab test journal, Vaccine journal, Dose accumulation — each radius 26, padding 20, a 24 pt icon inline with a 22/700 title, chevron top right, description last in 15 pt ink2; footnote left-aligned 13 pt ink2. Icons: lab_frame, syringe_tilt, curve_loose (data blue). No emoji. [D 2026-10-02 #109; 2026-10-03 #258; MB-1, MB-5]
- **PRD-BODY-2** Lab card: a big light count (56 pt / 300) + "test"/"tests" (one per upload, the same count the journal lists); each starred marker as a row (star, name, latest value + unit in mono 15) and "Starred markers · latest test {date}"; no starred marker → no rows, no caption; no tests → "Nothing logged yet" (regular ink2). [D #259; MB-2] The hub counts one per scan batch while the journal merges batches of one date (and on any other device one per marker because the batch time is not synced) → GAP G-92.
- **PRD-BODY-3** Vaccine card: the count + "vaccine"/"vaccines"; "Next due: {name} · {date}" from the nearest next-due date the USER entered that is today or later (16 pt calendar); none → no line; never advice. A past next-due silently drops off the hub but stays on the card and the read page `[code]`. [D #260; MB-3; 06:D-9]
- **PRD-BODY-4** Dose accumulation card: Premium → chevron and, under a line, the compound dot + name and "Est. level" in data blue (34 pt / 300) + unit — the same compound and number as Journey; free → "Premium" tag + lock in ink3, no number, no chevron; a tap opens the example preview bottom sheet ("See your compound build up", × close, the example curve with an "Example" tag, "Unlock with Premium" → paywall, the example-only note). [D #261; MB-4, MB-6]

#### Lab test journal
- **PRD-BODY-10** Header: "‹ My Body", Export and "+ Upload" on the right (Export hidden when there is nothing to export: no tests and no vaccines), large title, the disclaimer, the full-width By date / By marker SegmentedBar, search, Newest/Oldest. One card per test (date, N markers, label tags, chevron). While a report is read: ONE "Reading your lab report…" card with one indicator. [D 2026-10-03 #262; MB-7, MB-9]
- **PRD-BODY-11** By marker: star toggle, name, N readings, latest value, chevron; favourites first, then A–Z; a Favorites pill filters; naming variants merge ("Testosterone, Total" = "Total Testosterone"). [MB-8; 06 R18-R19]
- **PRD-BODY-12** Empty journal: the drop icon, "No bloodwork yet", "You get 3 free scans a month (labs, vaccine cards and vials combined).", "Upload lab report", the "What we can read" card. Free plan card: "Bloodwork scan — Premium feature" with the S-24 text — with markers "You've scanned {n} markers. Premium charts every one over time and keeps reading your labs — any language, photo or PDF."; without "3 free scans a month (labs, vaccine cards and vials combined) · More with Premium" — and "Upgrade". [D 2026-10-03 #276; MB-9, MB-10] Premium strings carry no scan number and no Premium scan line is added (AD-69: founder decisions.md:104, :257; signed MB-10; the coordinator line :544 is not the authority). Code: the free card renders only for free users (`{!premium && …}`, `BodyScreen.js:1100-1107`) and prints the limit only while no scan has yielded markers (`:1105-1107`); the empty journal (`:1115-1120`) shows "3 free scans" to Premium users too → G-178. How many scans are used / left is never shown → OPEN-14 (b) (G-190).
- **PRD-BODY-13** "Upload bloodwork" upsell sheet (hugs content, × close): "Lab, vaccine & vial scans", the S-24 body and list ("Lab, vaccine & vial scans included"), "Start 7-day free trial" + "Price shown at checkout · Cancel anytime" (→ paywall `bloodwork_upload`), "Free for 7 days — no charge today". [MB-11; D #287]
- **PRD-BODY-14** The lab journal typed by hand is free; lab charts are Premium. [D 2026-09-30 #268] There is no manual lab entry in the app at all — never built (the only insert is the scan's `persistMarkers`; registry F-070 "manual entry … Shipped" is wrong) → AD-68: approved, ships in 1.3.0, picture first (Approvals item 3; DV-107). Charts are not gated in code on any path (free in code, Premium in the ledger) → GAP DV-108, AD-24 — picture first, and the founder must be told that gating takes a working feature away from current free users.
- **PRD-BODY-15** A lab-journal explainer plays on the first visit until a lab value exists ("Type in values from any lab report…" — promises manual entry that does not exist yet → AD-68). [D #76]

#### Scanning a lab report (AI transcription)
- **PRD-BODY-20** "+ Upload" → the shared AI consent DoseTrace sheet if not yet granted (spark icon, "Send to AI for extraction?", body naming Anthropic/Claude and what is sent, "View privacy policy", "Agree & continue" / "Cancel") → the bottom action sheet "Add a lab report" (Take a photo / Choose a photo / PDF file; Cancel apart). No client quota gate: every scan asks the server (3 free / 20 Premium a month, one pool with vaccine cards and vial labels). [D 2026-10-03 #276, #323; MB-12, MB-24]
- **PRD-BODY-21** File limits: the client refuses > 10 MB (a PDF checked before it is read); the server caps 15 MB base64 (413 "file too large"); jpeg / png / webp / heic. [06 R9-R10]
- **PRD-BODY-30** Values auto-save dated from the document — no review gate: one row per marker with a name and a numeric value; the document's own date evidence first, the app language only as a tie-break, never "today" because the order is ambiguous; an unreadable/missing date falls back to the user's LOCAL today and the result says so; markers without a usable value are skipped and counted. Result sheet "Report imported" ("{n} markers saved · {date}", the date-fallback and skipped lines, "Tap any marker to edit it anytime.", OK). The retired review sheets are deleted. [D 2026-07-23/09-29/10-03 #267; MB-12, MB-26, MB-27; 06 R11-R13]
- **PRD-BODY-31** Every upload/scan error is a DoseTrace sheet with OK: "Scan service unavailable … please try again in a little while." (no "or enter values manually"; a service failure is never blamed on the file); "Monthly scan limit reached" with the server's limit ("your {n} scans for this month"); extraction failed; not signed in; file too large; camera off; could not read. Wording "reads/extracts", never "analyses". [D #105, #110, #327; MB-13] The "could not read" text says "PDF" for photos too → GAP G-104.
- **PRD-BODY-32** A scan that returns 200 with no usable values must not be counted ("failed extractions are not counted"). [D 2026-09-30 #275; logic] → GAP G-99
- **PRD-BODY-33** A document date in the future is accepted today (the Today alert is then suppressed and the hub's "latest" is a future date) → GAP G-100 (logic: future dates are refused elsewhere, MB-17).

#### One test, one marker, edits, deletes
- **PRD-BODY-40** One test = one card: rows grouped by test date, then by upload batch; batches of the same date join one card unless the batch repeats a marker the card already has (a duplicate upload stays its own card); the detail shows every value of the card (not the search-filtered list). [A-101d; 06 R16-R17]
- **PRD-BODY-41** One test: the date as the large title, "N markers", the Labels card (removable tag pills, "Add a label…", Add), every value with a pen (→ Edit value), "Delete this blood test" in red, the disclaimer. [MB-14] Labels are keyed by date, so two tests on the same date share labels → GAP G-95; favourites and labels live in `user_metadata` (stale whole-array writes, an unclearable star) → AD-02.
- **PRD-BODY-42** One marker: "Latest · {date}" over the number (56 pt / 300, unit attached in mono 13 ink3), "N readings", the chart with ≥ 2 readings (neutral: no bands, no colours, the user's own readings only, evenly spaced) else "Add another test with this marker to see how it changes over time.", the readings list with pens. [D #262, #266; MB-16; 06 R20] Today mixed units of one marker share one axis and points are spaced by index, not by date → DL-43 (the chart picture: OPEN-24 item 4) → G-177. The tie-break for two readings on the latest date differs between the marker screen, the hub and the export → GAP G-93.
- **PRD-BODY-50** Edit value (bottom sheet: Cancel · Edit value · Save): Marker, Value + Unit, "Test date" as a well button opening the date-wheel sheet "Test date" + Done (no future day; field and wheel always the same local day); Save reads the value with the lab rule (a comma is a decimal in every language); invalid → DoseTrace error sheet, nothing saved. [D 2026-10-03 #265; MB-17] The scan path reads "1,025" as 1025 while the edit path reads 1.025 → GAP G-96.
- **PRD-BODY-51** "Delete this value" asks first ("Delete this value?" / "{marker} from {date} is removed from your lab test journal. It cannot be undone." / Cancel · red Delete) → synced tombstone. [D #264; MB-18]
- **PRD-BODY-52** "Delete this blood test" asks first ("{date} · {n} markers" + the warning) → every batch of the card tombstoned; labels cleared only when no row is left on that date; on the Fold the right page falls back to the newest test. [D #264; MB-15]
- **PRD-BODY-53** There is no action to change a whole test's date (a wrong DD/MM read means editing every value) → OPEN-14 (c) (G-190).

#### Vaccine journal
- **PRD-BODY-60** Vaccine journal: the disclaimer, "+ Add vaccine" (ink) and "Scan / upload" (well, lab_frame icon), "Search vaccines…", one card per vaccine newest first (date, dose · manufacturer · lot, Next due, notes); empty → the tilted syringe, "No vaccines logged" and its text; Export only with vaccines. [MB-20; MB-9]
- **PRD-BODY-61** Add / Edit vaccine (bottom sheet hugging content: Cancel · title · Save): name, Date given (80 years back … today, never future), Next due (optional; 10 years back … 15 ahead; "Clear" beside it in Edit), manufacturer, lot, dose #, provider, location, notes; the date fields open date-wheel sheets titled with the field + Done; field and wheel always the same local day; Save without a name → toast "Enter the vaccine name first." and nothing saved. [D 2026-09-04/29, 10-03 #263, #265; MB-21, MB-22] Opening the Next due wheel and closing it untouched sets today → GAP G-102; Next due before Date given is allowed `[code]`.
- **PRD-BODY-62** "Delete vaccine" asks first ("Delete vaccine?" / "This removes {name} from your vaccine journal. It cannot be undone.") → synced tombstone. [MB-22]
- **PRD-BODY-63** Vaccine scan: the same consent, the "Scan a vaccine record" action sheet, ONE "Reading your record…" card, auto-save of every record with a name and a valid date given (never dated today; an invalid next-due dropped), "Vaccines imported" with the dropped count; the next-due date is never inferred or scheduled by the AI; same monthly pool (free users included). [D 2026-10-03 #276; MB-23, MB-24; 06 R14] The scanned details (manufacturer, lot, dose #, provider, location) land in Notes instead of their fields → GAP G-97.
- **PRD-BODY-64** No vaccine reminder or Today alert exists (the next-due date is the user's own, never advice) → DL-44 (G-216).
- **PRD-BODY-65** Fold: a vaccine tap shows the read page on the right (name, date given, next due, dose number, batch/lot, provider, manufacturer, where given, notes, the disclaimer) with Edit opening the left page's edit sheet. [D 2026-10-01 #270; BK-18]

#### Export
- **PRD-BODY-70** "Choose what to export" (bottom sheet): every marker (rows "N readings", no unit) and every vaccine preselected; CSV free; PDF Premium (free tap → "PDF export is Premium", Cancel first, Go Premium second; a fresh Premium check at the tap); CSV = Labs (Marker, Date, Value, Unit) then Vaccines (Vaccine, Given, Next due, Notes); PDF adds a neutral line chart per marker with ≥ 2 points (fixed colours on paper); export errors are DoseTrace sheets; lab report organised by marker. [D 2026-07-21 #269, 2026-10-03 #282; MB-19; 06 §7.5] The vaccine detail fields are not exported → GAP G-98.

#### Book layout My Body
- **PRD-BODY-80** Left: hub title, Lab test journal, Vaccine journal, Dose accumulation card; right: the tapped test (default the newest), marker, vaccine read page or the curve (Premium); fold/unfold keeps the open vaccine sheet and maps detail ↔ selection. [BK-6, BK-10, BK-18; MB-31]

**States (06 §5).** Scan: idle → consent → source choice → picking → uploading → server (401 / 400 / 413 / not configured / 429 / reserved → extracting → 502 / 200) → error sheet / unread / saved → report imported. Report card: listed → open → editing → deleted. Vaccine due: none → future → due today → past (hub ignores). Bloodwork due: hidden → shown → snoozed.

**Edge cases** (06 §8). Two pages of one report scanned separately (one card, hub "2 tests" → GAP G-92); a second device (hub count per marker → GAP G-92); a 200 with nothing usable (counted → GAP G-99); the same report twice (duplicated card, deletable); wrong DD/MM read (no whole-test date edit → OPEN-14 (c)); future report date (→ GAP G-100); mixed units for one marker (one axis, latest unit shown; no conversion — correct per the hard line); chart x-axis by index, not time (→ DL-43, G-177); marker rename leaves the favourite on the old label (→ AD-02); offline star/label silently lost (→ AD-02); vaccine PDF > 10 MB read into memory first (→ GAP G-101); a vaccine scan when the user object is missing says "0 imported" (→ GAP G-103); consent per device (→ DL-55); UTC month boundary for the scan pool (a 21:00 Oct 31 scan in New York counts for November) `[code]`; Premium lapsing mid-month with 10 scans used (next scan refused at 3).

**Free / Premium.** Free: everything in the journals (view, edit, delete, add vaccines, scans within 3 a month, CSV). Premium: 20 scans a month, PDF, lab charts (by decision; free in code today → DV-108), the Dose accumulation card number. Manual lab entry (free by decision) is not built yet (AD-68: ships in 1.3.0).

---
### 4.9 Settings

**Purpose.** One place for the profile, preferences, notifications, data and privacy, support, and the account actions — following the prototype (Q6 = A) and the approved "Settings A" look (decisions.md:307-308).

**Entry points.** Tab "Settings"; on the Fold: left = profile card, group list, account card; right = the chosen group (Preferences by default) (BK-7).

#### Layout
- **PRD-SET-1** Order: profile card; the Premium card (free users only; sells the dose curve, never cloud sync); four group cards in the order Preferences → Notifications → Data & privacy → Support, each with a one-line summary ("Appearance, time format, language" / "Reminders, alerts, silent mode" / "Legal, analytics, your data" / "FAQ, contact, rate"), closed until opened and remembered (per device); a separate Sign out / Delete account card; the version. [D 2026-09-29/10-01/10-02 #120, #278, #307]
- **PRD-SET-2** Look: drawn 9 × 15 row chevrons (stroke 2), a 16 × 10 group arrow in a 36 pt round well, 28 pt row icons with no box, dividers inset 16; GradSwitch (ink track when on) replaces native switches; long subtitles wrap beside the switch. [D #72, #307; A-70, A-71]
- **PRD-SET-3** Sentence case everywhere ("Usage analytics", "Download my data"), "Preferences" (not "Account & preferences"); legal headings stay ALL CAPS (Q13 = B). [D #59, #120]

#### Profile
- **PRD-SET-10** Edit profile (bottom sheet): name, birth month, birth year (typed, 1900 … this year − 18), sex, country (sheet with search), goals (18, alphabetised, same list as onboarding), activity (the 5 levels with sub-lines; old 4-level values shown mapped, kept as legacy when rewritten), provider (Yes / No). Save is blocked while any required field is missing. [D 2026-09-09/29 #298, #308; PA-36, PA-37]
- **PRD-SET-11** "What you track" (peptides / hormones / GLP-1 / oral) is required by the profile gate but cannot be edited in Settings → DL-58 (the editor is new UI → OPEN-24 item 2).
- **PRD-SET-12** A profile save that fails (offline, server error) says so in a DoseTrace sheet and keeps the typed values; the same for the analytics switch. [logic: P-3 / P-14 = DL-56] → GAP G-107
- **PRD-SET-13** Changing sex or birth year here changes the daily burn at once (profile is the only source). [FX-10; C-23]

#### Preferences
- **PRD-SET-20** Appearance (System / Light / Dark) and Time format (Auto / AM-PM / 24 h; Auto = 12 h in English, 24 h otherwise) as a label row above a full-width SegmentedBar; Language as code tiles EN / ES / PT / FR / DE / IT (a sheet), switching at once. Device preferences, not wiped on sign-out. [D 2026-07-23 #310; 2026-09-29/10-01 #71, #307]

#### Notifications
- **PRD-SET-30** Android: the first row "Make sure your reminders arrive" with its state; iPhone: "Check reminders" row (last). Then the seven switches (PRD-REM-110). [SP-1; RC-1]

#### Data & privacy
- **PRD-SET-40** Adherence report: scans Missed doses first, then shows the report BEFORE the share sheet ("This is exactly what your provider will receive"); includes active protocols and ended protocols with records in the window (30 days): adherence = Complete ÷ (Complete + Skipped + Missed rows), a streak, doses remaining; the PDF report line says "Mark complete"/"Dose complete" wording. [D 2026-09-29 #308; 02 §6.6] The report's streak counts calendar days with any dose; DL-02 (logic) makes it the card's dose streak — the founder's 2026-10-05 "doses, not days" line itself is scoped to the protocol card (commit b215b32), its extension to the report is logic → DL-02 (G-167; the report line ×6: Approvals item 2.3); its "doses remaining" can go negative → GAP G-20; it names protocols by the stored name → GAP G-15.
- **PRD-SET-41** Download my data: a JSON of every synced user table (protocols, vials, dose logs, labs, vaccines, food logs, reality checks, weigh-ins, targets, the open check, calculator inputs) + the account email → the share sheet. [D 2026-10-01 #376; FX-12] Profile and preferences (`user_metadata`) are not included, and Settings does not first import from the cloud when the phone is empty → GAP G-111.
- **PRD-SET-42** Privacy policy, Terms of service and Disclaimer open in the in-app legal reader; the in-app privacy policy and the website text must be the same content in 6 languages (A-117); the in-app policy no longer says profile data may "develop wellness partnerships". [D 2026-10-05 #570; A-117; DL-81, AD-72] → GAP G-112 (DV-085, DV-231)
- **PRD-SET-43** Usage analytics switch (default on): anonymous analytics — a random install id, no user id, no compound, dose, unit, frequency, goal, colour, type, search text or substance kind; a server trigger anonymizes every write from any app version. [D 2026-10-04 #553, #557; 2026-10-05 #562, #570] The install id is pseudonymous, so the wording "anonymous" becomes "not linked to your account" → DL-84 (wording ×6: Approvals item 2.6; store labels: Approvals item 6; G-136); no analytics before sign-in for now → DL-62 (G-222); default-on install-id analytics under ePrivacy goes to counsel → DL-83.

#### Support
- **PRD-SET-50** FAQ is its own screen (with "What does Premium include?" listing "reality-check results", the scans "up to 20 a month in total", and "Your weigh-ins and their chart, cloud backup and sync are free for everyone."); Contact (mail); Rate. [D 2026-10-01 #104, #107; 2026-09-29 #134, #308]

#### Account
- **PRD-SET-60** Sign out and Delete account — chapter 4.1 (PRD-ACCT-1…8). "Delete forever" for protocols lives on Recently deleted (Protocols), not in Settings. [D #308; BK-7]
- **PRD-SET-61** No subscription management (Manage / cancel subscription, trial or billing state) exists in Settings → OPEN-15. Restore is only on the paywall, but anyone the app sees as non-Premium reaches it (the Settings Premium card → paywall → "Restore purchases"), and a reinstall needs no Restore at all: RevenueCat's `appUserID` is the Supabase user id (`lib/purchases.js:68`), so signing in brings Premium back. The real gap is the missing in-app manage/cancel and the trial / billing-problem state (G-192).

**States.** Group open/closed (per device); Premium card shown/hidden; Settings row reminder state (block / N of M / not refreshed / All set).

**Free / Premium.** Everything in Settings is free; the Premium card is shown to free users only.

---

### 4.10 Premium and the paywall

**Purpose.** An honest paywall: only real Premium features, real store prices, the store's own rules (Apple 3.1.2), and an example of what each Premium feature shows (decisions.md:283-287).

**Entry points (`source`).** Settings (`settings`), protocol limit (`protocol_limit`), PDF export (`export_pdf`), lab upload sheet (`bloodwork_upload`), serum preview sheet (`serum_preview_sheet`), Journey tile (`journey_serum`), Dose log (`log_serum`), curve direct (`serum_direct`, replace), reality check (`reality_check`; once with no source), food grace note (`food_grace`), food hero (`food_hero`), food chat locked card (no source). (08 §2.2) Two entry points navigate with no `source` (`CalculatorSection.js:1148`, `FoodChatScreen.js:720`) → G-227.

- **PRD-PREM-1** Header: a drawn back chevron + "Back", "Upgrade to Premium" centred. Hero: the self-drawing Example curve, "DoseTrace Premium", a line naming dose-accumulation curves from the user's **planned schedule**, unlimited protocols, more scans and PDF export (no number); founder wording ×6 needed. Today's string `paywall_hero_sub` says "Dose-accumulation curves from your own log…", which contradicts AD-19 (decisions.md:111) → GAP G-70. The hero animation replays on every open. [PA-1, PA-2; D 2026-09-24 #75]
- **PRD-PREM-2** "See what you get": the 8 previews in prototype order with the prototype titles (accumulation, reality check, AI food log, lab scan, lab trends, vaccine scan, "Every protocol you run", "A clean PDF for your doctor"), each opening an animated preview with an "Example" tag and sample numbers (Reduce Motion → last frame); paper titles in UPPERCASE; protocol colours from the prototype, lighter in dark; inside the paywall "Unlock with Premium" closes the preview and scrolls to the plans. Previews never interpret (no "out of range", "drifting", "due soon"); the vaccine preview says "next-due dates" (the app has no vaccine reminders). [D 2026-09-16/30, 10-01 #286, #127-128, #453; PA-3, PA-4]
- **PRD-PREM-3** Buy section has four states: loading (no buy button until the prices AND the trial answer are in), unavailable ("Plans are currently unavailable…" + "Try again"), plans, already Premium ("You already have Premium" sheet, no buy button, Done goes back). [PA-6, PA-16]
- **PRD-PREM-4** Plans: Annual ("Best value", preselected when sold, else Monthly), Monthly, Lifetime (its own card, the price on the grey button, "One-time purchase…"); the billed amount is the biggest price; the length next to every price; Annual shows "Save N %" (from real prices of one currency, rounded down; hidden when 0) and the per-month equivalent (the store's string, else computed in the store currency); the selected card has the ink outline and filled radio. [D 2026-09-30 #284; PA-7, PA-8, PA-10, PA-14]
- **PRD-PREM-5** The trial is claimed only when the store says this person is eligible and only with its real length: "Start 7-day free trial" / "Then {price} per year · Cancel anytime" (a month-long trial is disclosed as such); otherwise "Subscribe" / "{price} per year · Cancel anytime"; the billing text names the store (Apple ID / Google Play) and says payment is charged when the trial ends. [PA-9, PA-11, PA-85; DL-82; D 2026-10-03 #451, #478]
- **PRD-PREM-6** Purchase outcomes (DoseTrace sheets): Premium → back where the user was with Premium on everywhere; cancelled → stays, no message; failed → "Purchase failed"; pending (Ask to Buy / deferred / paid but not active yet) → "Purchase pending", never "failed"; a plan the store does not sell → "Product not available…". Lifetime bought while a subscription still renews → a sheet: the subscription keeps renewing until the user cancels it in the store's settings (the app cannot); a subscription already cancelled is not treated as renewing. One purchase/restore at a time; Back and swipe blocked while the store works; a real purchase is counted even if the paywall closed. [PA-12, PA-19, PA-74, PA-84, PA-97] Right after a purchase the purchase result and the entitlement helper can briefly disagree (handled by `purchaseOutcome`) → G-221.
- **PRD-PREM-7** Restore purchases: found → "Purchases restored" (check, Done); none → "No purchases found"; failed → "Restore failed" (any store error, including a receipt used by another account). RevenueCat's restore/transfer behaviour stays as configured in its dashboard (UNVERIFIED value). [PA-13; D 2026-10-03 #475]
- **PRD-PREM-8** Under Restore: iOS "Terms of Use (EULA)" (Apple's Standard EULA); Android "Terms of service" (DoseTrace's own in-app Terms, `lib/legalLinks.js:11-14`); and "Privacy policy" in sentence case (dosetrace.io/privacy-policy, `PaywallScreen.js:397`), 6 languages. [D 2026-09-30 #285; FX-17, PA-15]
- **PRD-PREM-9** "Free vs Premium" (13 rows, §1.5.1) and "What's included with Premium" (six lines: Everything in Free, Unlimited protocols, "Lab, vaccine & vial scans — photo or PDF, any language", PDF export for your doctor, Reality check & progress tracking, Dose accumulation); free cells are a check, a dash or an amount ("7 days", "3 / month"); every Premium cell is a check; never "unlimited" scans; cloud backup never sold. [PA-17, PA-18; D #104] "Reality check & progress tracking" as Premium contradicts the free weigh-ins → GAP G-43.
- **PRD-PREM-10** Paywall copy: "Premium" everywhere ("Unlock with Premium", Premium badges); German "Pro Upload zahlen" (= per upload) is not the plan name; no "Coming soon"; no number in Premium scan strings (AD-69: founder decisions.md:104, :257; MB-10). [D 2026-09-30 #102; FX-18, FX-20]
- **PRD-PREM-11** Premium state after purchase, restore, lapse or going offline is the same on every surface at once (C-22).
- **PRD-PREM-12** A store free trial and a store billing-grace period are indistinguishable from a paid period in the app (no "trial ends on …", no "payment problem") `[code]` → OPEN-15 (G-192).
- **PRD-PREM-13** Lapse: when Premium ends, Premium surfaces lock at once; the food log keeps the grace week rule (PRD-FOOD-62); active protocols above 3 stay active `[code]` → OPEN-05 (a money rule) (G-186); scans fall back to 3 a month at the next server check.

**States (07 §5.2).** Unknown → Free / Premium (subscription, incl. store trial and store grace) / Lifetime / Developer / Expired (with food grace) / Pending purchase.

**Free / Premium.** See §1.5.

---

### 4.11 Book layout on the Galaxy Z Fold

**Purpose.** On an unfolded foldable the app opens like a book: the list on the left page, the tapped item on the right; on a phone, or folded, nothing changes (book-layout.md). The right page adds, never repeats (P-7).

- **PRD-FOLD-1** Two pages only when the window is ≥ 700 pt wide AND ≥ 560 pt tall, and on Android only when the physical screen is at least as tall as it is wide (the Fold held normally; on its side = one column so the fold never crosses a page). Phones (portrait or landscape) and the folded Fold keep one column, exactly today's app. iPhone Duo decided with the first iOS 27.1 SDK build. [BK-1, BK-2, BK-13]
- **PRD-FOLD-2** Pairs: Today = doses + tracker | Dose log by default, or the tapped dose's protocol page; Protocols = list | protocol (default: the first in the list, or the one opened from Today); Journey = dashboard | Progress by default, AI food chat or the curve; My Body = labs + vaccines | test (default newest), marker, vaccine read page or the curve; Settings = menu | group (Preferences by default). [D 2026-10-01 #78; BK-3…BK-7]
- **PRD-FOLD-3** Today's right page for a tapped dose (today's, yesterday's pending or an upcoming row) = that protocol's page (name, dose, tags, the app's standard syringe with the draw, the vial block, the oral serving block, Schedule & reminders, Dose details, Notes); no Mark complete, Skip, Undo or Delete protocol there (they stay on the left card); Edit, refill and syringe zoom open the protocol in My Protocols; a powder protocol with no mixed vial starts with "No mixed vial right now", why the syringe and supply are missing, and "+ Add vial"; a note typed there is kept per protocol and saves like My Protocols. Supersedes BK-3's dose page and BK-16's actions (DosePage deleted). [D 2026-10-07 #633; FR-1…FR-5] Device proof FR-6 missing → GAP G-132; leftovers of the old dose page → GAP G-13; book-layout.md BK-3/BK-16 rows not marked superseded → GAP G-130.
- **PRD-FOLD-4** Every tap and every notification opens its item on the right page with the most information the app already has: food reminder → the AI food chat on the right; weigh-in / reality check → Progress on the right; vial → the protocol on the right; dose → its protocol on the right. [D 2026-10-07 #634; A-116] Not started; paused by the founder until this PRD (decisions.md:639) → GAP G-131, AD-31.
- **PRD-FOLD-5** A 22 pt gutter over the hinge holds no text or control; the selected item gets an ink outline; the tab bar spans the full width; each tab keeps its right-page item while the app is open. [BK-8, BK-9]
- **PRD-FOLD-6** Full-screen flows stay one centred column: paywall, sign-in, onboarding, reset password, add/edit protocol, every sheet and popup. One popup at a time across both pages. [BK-11, BK-20]
- **PRD-FOLD-7** Fold/unfold never loses the place or anything typed: folding with an explicitly chosen right-page item shows it as a pushed screen with "‹ back"; unfolding with a pushed item shows it on the right page; a default nobody chose is never pushed; sheets and pickers stay open with their values; unsaved drafts are kept per item until saved or the app closes (protocol note, Progress forms, food chat answer field); a real sign-out clears them. [BK-10, BK-14, BK-15; D #378]
- **PRD-FOLD-8** The two pages update each other at once (a dose on Today ↔ the Dose log; a weigh-in on Progress → the Journey tiles; a curve selection → the Journey tile and the My Body card; a food send on the right → the Journey food hero on the left, DL-98). [BK-19; logic for the curve → GAP G-65; the food hero → G-173]
- **PRD-FOLD-9** Android back is the same as today; the right page has no back control of its own; a screen shown on a right page never navigates back or replaces the screen under it. Accessibility: after a selection, screen-reader focus moves to the right page; the selected item reports itself selected; reading order left then right. [BK-15, BK-21, BK-22]
- **PRD-FOLD-10** Both themes, theme tokens only, no emoji; any new string approved in 6 languages first. Device evidence: every BK row is "partial" until the founder checks the Z Fold 7 (light + dark) → GAP G-132, G-126. [BK-12]
- **PRD-FOLD-11** Large screens generally: the portrait lock is removed; every screen works in landscape in a centred column (640 pt max); Progress title and back row inside the column; the enlarged syringe sized on the sheet. [D 2026-09-11 #77; A-75, A-76] (AD-62)

---

### 4.12 AI features (shared rules)

**Purpose.** AI makes recording easier — reading a lab report, a vaccine card or a vial label, logging food in plain words, filling a protocol by answering questions — and nothing else (P-2).

**The four AI features.** Lab / vaccine / vial scans (`extract-bloodwork`), the AI food log (`parse-food`), the AI protocol assistant (`protocol-assistant`). Model: Anthropic Claude Haiku. (08 §3.3)

#### Rules for every AI feature
- **PRD-AI-1** Transcribe or surface only; never recommend, diagnose or interpret; never "do X to make a compound work better"; lab interpretation or dose advice is a hard veto. [D 2026-09-10 #316-317]
- **PRD-AI-2** The AI returns structured data only (names, estimates, which question to ask, short answer options); the app writes every sentence in 6 languages. Server prompts return JSON only, no prose. [D 2026-09-27 #318; FL-16; AP-14]
- **PRD-AI-3** Any advice-shaped request gets the fixed app-written deflection card ×6, never model text. [D #320; FL-15; AP-3]
- **PRD-AI-4** One shared AI consent before the first AI call of any kind (lab, vaccine, vial, food chat, protocol assistant): a DoseTrace sheet naming Anthropic/Claude and what is sent, "View privacy policy", "Agree & continue" / "Cancel"; current version v4 (typed dose answers are a new kind of data, so everyone agrees once more). [D 2026-08-25 → 10-02 #323; 2026-10-03 #490 (coordinator block); AP-15; MB-12] Consent is stored per device, not per account, survives sign-out, and cannot be withdrawn in-app → DL-55 (the withdraw row is new UI → OPEN-24 item 1; server proof of consent → counsel, DL-83).
- **PRD-AI-5** The user's own text is never logged on the server (food raw text, lab text out of the extract-bloodwork logs). [D #321; 2026-10-04 #545; v20 deployed 2026-10-05 #564]
- **PRD-AI-6** Anthropic is named as a sub-processor in the privacy policy, and its AI section covers the AI food log — and so every AI feature the app has (AD-72; counsel flag). [D 2026-09-09/29 #330; A-117] The web policy does (`web/privacy-policy.html:60-61`: lab reports, vaccine records, vial labels, the food log, the assistant); the in-app policy shown by Settings (`settings_privacy_body`, `i18n/translations.js:649` ×6, "Last updated: April 2026") still names only a lab report or vaccine card → GAP G-112 (DV-231, S1; one policy text, DL-81; the rewritten text ×6 is Approvals item 2.7; registry A-117).
- **PRD-AI-7** Scan wording says the app reads / extracts, never "analyses"; no "insights". [D 2026-10-02 #327]
- **PRD-AI-8** Previews and explainers use example data only and never promise a health outcome. [D 2026-09-30 #328]
- **PRD-AI-9** A protocol ↔ results ↔ labs cross-reference may only ever be factual (phase 2; not built). [D 2026-09-10 #329; A-12]

#### Scans (labs, vaccine cards, vial labels)
- **PRD-AI-10** One monthly pool per user shared by lab reports, vaccine cards and vial labels: 20 a month with an active RevenueCat entitlement (incl. the App Review account and the server's Premium email list), 3 for everyone else; calendar month, UTC; RevenueCat asked only at ≥ 3 scans; unreachable → the Premium cap (AD-36, G-220); misconfigured → the free cap; rate-limited → not Premium; the usage row is reserved before the AI call; parallel requests are ranked by position; a failed extraction is released (not counted); the server fails open if counting fails. [D 2026-09-30 #275; FX-19; A-59; 06 R3-R6]
- **PRD-AI-11** Labs and vaccines auto-save from the document (no review gate) and the user can edit anything later; the vial label is review-before-save and the model never writes the compound id (deterministic resolution, fail closed). [D #267, #322]
- **PRD-AI-12** The limit message fills the server's limit ("your {n} scans for this month"), never a fixed 3 or "free". [D 2026-09-30 #105; A-60]
- **PRD-AI-13** Free users see the limit ("3 free scans a month…") only before their first scan that yields lab values (empty journal, free card, `BodyScreen.js:1105-1107`, `:1115-1120`); after that only the paywall and the FAQ show it. Nobody sees how many scans are used or left; the user finds out only when a scan is refused → OPEN-14 (b) (G-190). Premium strings carry no number (AD-69).

#### AI food log
- See chapter 4.5 (PRD-FOOD-10…17, 50-51, 60-64).

#### AI protocol assistant
- **PRD-AI-30** Optional helper beside the manual form, which stays the default and fully free (anyone can type anything, including blends and unlisted compounds); meant for simple single-compound vials; anything it cannot map goes back to the manual form with the answers kept. [D 2026-10-02 #324; AP-0]
- **PRD-AI-31** Four doors, one window: "Build it with AI" at + Add (before the form; "Or fill in the form yourself."), "Finish with AI" on steps 2, 4, 5, the dose door on step 3, "Ask AI for help" on the doesn't-fit warning and in the explainer; in Edit only the doesn't-fit door (ends in "Fill the form"). Step 1's door reads "Finish with AI" once anything is typed (`ProtocolsScreen.js:2329`); the step-5 door exists only for powders. AI help never appears on a saved protocol's page, Today or the dose page. [D #326; AP-1, AP-34]
- **PRD-AI-32** One question at a time: compound (matched to the list ignoring case, partial names as tap choices + "Keep …", else the user's own name; never a compound the user did not name), form (powder / ready to use / pill), vial amount (typed or the label photo through the vial-scan path — same consent and pool — read back "I read BPC-157 · 1000 mg. Is that right?" and used only after Yes), the mix (powders: what and how much) and "When did you mix it?" (Today / Yesterday / Pick a date, ≤ 365 days), ready-to-use strength per ml + vial ml, oral strength, dose and how often, first dose (Today first). Plain numbers are read on the phone and never sent. [AP-5…AP-7; D 2026-10-03 #488]
- **PRD-AI-33** An amount without its spread asks one neutral question: per injection, per day, per week or per month; for a total, how many applications in that period, and the app divides the user's number (4 significant digits), showing per-application amounts "for your numbers" (never "recommended"), written as a multiplication ("3 × 80 mg"); only spacings the app can store (every N days) are offered, stated honestly ("Every 2 days · 3 or 4 times a week"); weekday schedules do not exist. [D 2026-10-02 #186; 2026-10-03 #480, #488; AP-4, AP-22, AP-26, AP-29]
- **PRD-AI-34** Before anything is filled, the plan is restated in the user's numbers ("2.5 mg once a week = 10 mg every 4 weeks; this 20 mg vial lasts 8 doses. Is that right?"), then a review card lists every field and the calculated draw (units and ml) and vial duration with Change / Fill the form / Save protocol; one Done creates exactly what the manual form would (same fields, vial, reminders, history question). Syringe size and dose time are not asked (form defaults 1 ml / now, shown with Change). [AP-8, AP-9, AP-17, AP-26, AP-32] The review card lacks a dose-time row → GAP G-133 (A-91).
- **PRD-AI-35** "Finish with AI" reads the form, says it back, asks only for what is missing and never changes a filled field unless the user says so. [AP-10]
- **PRD-AI-36** From the doesn't-fit warning: explain with the user's numbers (mg per ml of their mix, ml this dose needs, ml their syringe holds), ask the spread question; if it really is one injection, state facts only ("240 mg is 1.68 ml of liquid. Your syringe holds 1 ml, so it cannot be drawn in one go. It needs a syringe that holds at least 1.68 ml."), add that how to adjust is something to confirm with "your healthcare provider", and for a powder that "the amount of water in the NEXT vial decides how much is in each ml" with no number and "check with your supplier how much liquid the vial holds" (as built, `ap_fit_fact_powder` — the founder's own word, decisions.md:186 and signed AP-22: AD-75; the coordinator's change to "the product label or manufacturer", decisions.md:544, is withdrawn); never says the dose is wrong, high or unsafe; never a water amount; not mixed yet → no water amount, back to the form. [D #186, #325; AD-75; #494 (coordinator block); AP-11, AP-22, AP-30, AP-31, AP-35]
- **PRD-AI-37** Limit: 10 conversations per rolling 7 days per user, every plan, server-enforced, separate from the scan pool; a use counts at the conversation's FIRST answer to the AI or when the label-photo path starts — opening/closing the window or the "AI isn't available" notice spends nothing, more answers spend nothing, a failed start spends nothing; at the limit it says (in app words) when it resets and the manual form keeps working — built: "You've used AI help {limit} times this week. It is available again on {date}…" (`ap_err_quota`, `i18n/translations.js:2289`); the rewording without "this week" is Approvals item 2.10 (DV-192). [D 2026-10-02 #289; 2026-10-03 #487 (coordinator block); AP-18] The server also enforces 40 answers per conversation, a 24-hour conversation life and 200 answers per rolling 24 h (`supabase/functions/protocol-assistant/budget.ts:10-12`), which AP-18 does not have; reaching them shows only "The AI isn't available right now" → keep or change waits for the founder → OPEN-18 (3) (G-200).
- **PRD-AI-38** Offline: "I can't connect right now. You can continue in the form — everything you answered is kept." (`ap_err_offline`); any other AI error: "The AI isn't available right now. You can continue in the form — everything you answered is kept." (`ap_err_service`) (`lib/assistantErrors.js:23`; `i18n/translations.js:2287-2288`); the user continues by hand with every answer already in the form; no typed answer lost; the conversation itself lives in memory (lost if the app is killed; the filled form stays). [AP-16, AP-33]
- **PRD-AI-39** Running cost approved by the founder ("eu aprovo sim qualquer custo"). The server parts (usage migration, function, privacy page) must be deployed before the build: the founder's go is given (decisions.md:481) and the deploy is still pending per `STATE.md:20` (live state not provable from the repo; Approvals item 1); until then every AI door says the AI isn't available. [D 2026-10-02 #289; 2026-10-03 #481]

---

### 4.13 Privacy and data

**Purpose.** Health data is the user's: durable, portable, deletable, private to the account and the phone it is on (P-3, P-4).

- **PRD-DATA-1** Local-first: every write goes to the phone's database first (pending) and syncs to the cloud; the pending rows are the offline queue (survive kills and updates). [08 §4] **Caveat — known sync holes today (S1, shipped per OPEN-16 (b), whose timing waits for the founder):** a phone's own push moves its pull watermark past rows another phone pushed earlier, so they are never fetched (G-156); the watermark is the transaction START time, so a late-committing row is never fetched (G-157); offset paging can skip a row for good (G-158); deletes of non-protocol rows do not travel (G-155, DV-182); whole-row pushes with absolute counters lose an offline dose on the counter (G-159). Also: a `requestSync` during a running pass queues no follow-up (G-195); a lost INSERT response inserts the row twice (G-180); a value the cloud column type rejects leaves the row pending forever (G-181).
- **PRD-DATA-2** Durable storage for user data: protocols, vials, dose logs, labs, vaccines, food logs, reality checks, weigh-ins, targets, the open reality check, calculator inputs — all synced tables with tombstones. Never AsyncStorage alone, never `user_metadata` alone. [D 2026-09-12 #369, #373-375] Exceptions today: favourites and labels (`user_metadata`, rewritten as whole arrays from the session's copy, which clobbers another phone's change and contradicts PRD-DATA-5 → AD-02, G-94); the profile (sex, birth year, activity, name), the seven notification switches, the food-reminder switch and the analytics switch (`user_metadata` only, single keys merged by `updateUser`, e.g. `CalculatorSection.js:411`, `:462`, `NutritionLogger.js:101`; not in "Download my data" → G-111); open site questions (device only by decision → AD-34); explainer "already shown" flags (device; "used" is derived from synced data — G-117 closed on check); AI consent (device → DL-55).
- **PRD-DATA-3** Conflict rules: a pending local row beats the cloud; a synced local row is replaced by the cloud; overrides: Stop wins (reality check), the protocol tombstone wins, status (end/delete) from the device that changed it wins, a newer weigh-in wins over another device's delete of that day; deletions win on push for other tables; no field-level merge between two pending edits (the later push wins). [08 §4.5; D 2026-10-04 #537, #539] Not true today for deletes of non-protocol rows: a delete never reaches a device that already holds the row, and for dose logs a later edit on that device finds no cloud row, sees a live parent protocol and **re-inserts** it (`reinsertRow`, `lib/syncCore.js:692-698`), so the deleted dose comes back on the deleting phone too (reproduced with the sync harness, verification 06); a weigh-in edited there is re-inserted the same way by design (DL-90, `:699-703`). Vials are deleted only by Delete forever, and the cloud refuses a vial written onto a purged protocol (`vials_refuse_purged_parent`, `supabase/migrations/20261004000000_protocol_purged_at.sql:63-67`), so the vial re-insert is not reachable in 1.3.0 → GAP G-155 (DV-182; its fix waits on OPEN-16 (b)).
- **PRD-DATA-4** No device removes a protocol, dose log or vial because it is absent from the cloud (`NO_ABSENCE_DELETE`, `lib/syncCore.js:817`); protocols use positive tombstones; a vanished protocol is re-inserted soft-deleted; live cloud protocols the device lacks are re-imported (self-heal). [D 2026-10-04 #520-524 (coordinator block, §0.2)] The other 8 tables still absence-delete on a full import (an empty device only, `lib/syncCore.js:832-845`); with offset paging that can delete a live local row → G-158.
- **PRD-DATA-5** Writes merge, never clobber; metadata writes keep existing keys; the calculator inputs are merge-written. [D #371, #375]
- **PRD-DATA-6** The SIGNED_OUT wipe fires only on a real, intended sign-out (PRD-ACCT-2); the cross-account guard discards another account's data (PRD-ACCT-4; without a warning for its unsynced rows → OPEN-21 (11)). [D #370; coordinator #509]
- **PRD-DATA-7** When a screen or flow is replaced, its data is migrated in the same change; storage/auth/sync changes are proven by update-over-old-version and re-auth on a device (RL-5 at the 1.3.0 submit). [D #372; RL-5]
- **PRD-DATA-10** Privacy copy is truthful: data is cloud-synced (never "stays on your device"), "encrypted in transit and at rest". [D 2026-09-09 #385] Both privacy policies (web and in-app) say "in transit" only, and the web text presents sync as optional ("if you create an account"); the policy texts are rewritten as one text covering every AI feature (DL-81, AD-72; Approvals item 2.7; G-112).
- **PRD-DATA-11** "Show names in notifications" off = the lock screen never shows a compound name (titles, morning summary, vial notices, snoozed copies). [D 2026-09-24 #311]
- **PRD-DATA-12** Analytics are "not linked to your account": a random install id, pseudonymous rather than anonymous (DL-84; PRD-SET-43); stored rows before 1.3.0 de-linked (850 → 0 linked). [D 2026-10-05 #562-564]
- **PRD-DATA-13** Never commit secrets; keys live in their consoles or Supabase secrets; the RevenueCat secret only as an Edge Function secret; the Apple review password never in git or typed by Claude. [D #361, #386] `STATE.md` is tracked in git (no secret found on 2026-10-12) → G-224.
- **PRD-DATA-20** Account delete erases every synced table and the usage/token tables (the list must be a superset of the synced tables); Apple token revoked best-effort. [D #376; PRD-ACCT-5] `ai_assistant_usage` relies on cascade; a non-existent table is listed → GAP G-122 (DL-93). The RevenueCat customer survives the deletion → G-154 (DV-219; to counsel, DL-83).
- **PRD-DATA-21** "Delete forever" blanks the purged protocol's content on the server (GDPR Art. 17); only its identity stays, as the founder-approved migration defines it (id, user_id, type, colour, timestamps, deleted_at, purged_at — AD-67). [D 2026-10-04 #552, #556] → GAP G-151 (DV-221: four dosing columns are not blanked)
- **PRD-DATA-30** Export: Download my data (every synced table, JSON), CSV/PDF records (labs + vaccines), the adherence report (preview first). [D #376; PRD-SET-40-41; PRD-BODY-70]
- **PRD-DATA-31** Admin panel (web): view-only; Bearer-token header only; a token in the query string refused; fails closed (503) when unset; no logging; test accounts included in metrics for now. [D 2026-09-27/28 #389; admin-panel.md] (Checklist unsigned → AD-42. Signing the three unsigned checklists — fold-right-page (its `checklist-signed:` line is empty, `docs/specs/fold-right-page.md:7`), premium-and-auth and admin-panel — is Approvals item 7; `spec-audit` reads an empty signature as signed and only warns on unsigned ones → G-126 (DV-229). The panel's metric fixes O-4…O-7 are DL-79; test accounts stay included, decisions.md:389.)
- **PRD-DATA-40** Legal items needing a real lawyer (the founder's rule, decisions.md:388): GDPR Art. 9 wording of the hard profile gate, the Anthropic DPA for free text, the crisis-resource policy (AD-51); and, by logic, server proof of consent (A-95), default-on install-id analytics under ePrivacy 5(3) and deleting the RevenueCat customer with the account (DL-83). The year-only 18+ test is not a counsel item: the floor uses the typed birth year (AD-43, decisions.md:300; G-223). [D 2026-09-09 #388; DL-83; Approvals item 9]
- **PRD-DATA-41** Store privacy declarations: Apple App Privacy declares Photos (AI scans), Device ID + Product interaction "not linked"; Play Data safety equivalent. [D 2026-10-08 #636; #570 (coordinator); DL-84] Not done yet: the console labels are the founder's step (Approvals item 6) → G-136 (DV-190).

---

### 4.14 App-wide UI, numbers, dates and language

- **PRD-UI-1** Theme tokens only (`lib/theme.js`, LIGHT and DARK with identical keys); both themes verified on every touched screen, modal, sheet, picker and dropdown; hard-coded colours only on fixed surfaces. [P-15] Leftovers (ErrorBoundary white in dark, a few legacy styles) → GAP G-123, G-129.
- **PRD-UI-2** Graduated identity: green-grey "bench" ground #DDE0DB light / charcoal #121416 dark (never pitch black); no shadows, no tinted surfaces; semantic colours only on dots, ticks and short words; data blue Cobalt #2350D8 / #8AA8FF only for data; tracker block dark grey #383C41 in light / #EEEFEB in dark; primary action ink (prototype); typography v4 (system font for reading text, Geist for large titles / display numbers / section titles, Geist Mono only for measured values; body 17, secondary 15, footnote 13, caption 12/500, tab bar 11; titles on Today and My Protocols 700, big numbers 500; text weights stop at 700); 7 pt between a number and its unit; no uppercase letter-spaced labels (legal headings excepted). [D 2026-09-28/29, 10-01 #51-60, #67; D 2026-10-03 #448]
- **PRD-UI-3** One shared SegmentedBar (full width, 42 pt, chosen segment raised, ink 700, long labels shrink to 0.8) for every side-by-side choice. [D 2026-10-02 #44]
- **PRD-UI-4** DoseTrace sheets (P-17); DTSheet button order, as built and one convention for every sheet (`screens/components/ProtocolParts.js:55-57`): two short buttons side by side, Cancel on the left; three or more buttons, or a label longer than 14 characters, stacked with the action on top and Cancel last. [coordinator line decisions.md:547 ("the order stays the app-wide convention"; its "Cancel on top" misdescribes the built order)]
- **PRD-UI-5** The prototype's date and time wheels (DTWheel) in a sheet on iOS; Android keeps native dialogs. [D 2026-10-02 #48] Today on Android the curve's "Other date" (`SerumCurveScreen.js:1078-1083`) and the past-weigh-in date (`CalculatorSection.js:1807-1810`) use the DTWheel sheet, which :48 names among the native-on-Android cases → G-231.
- **PRD-UI-6** No emoji; the founder's monoline FeatureIcon set (stroke 72/1024); the streak flame is a vector; current drawings kept except the adopted prototype glyphs (curve_loose, balance scale, lab_frame, syringe_tilt) and upright reconstitution/capsule icons; error sheets use the warning triangle. [D #63-66, #70, #448 (coordinator block)] Today the paywall, sign-in, reset-password, onboarding, email-link and 18+ error sheets use the circle `alert` glyph and several are titled only "Error" (e.g. `lib/paywallPlans.js:149-151`, `screens/AuthScreen.js:179`) → G-230.
- **PRD-UI-7** Motion: count-ups only when values change; self-drawing charts; one strong moment; Reduce Motion honoured. [D #57, #74] Whether the Today ring counts from zero and the curve intro replays on every open waits for the founder → OPEN-18 (4) (G-206).
- **PRD-UI-8** Numbers typed: comma decimals accepted ("0,5" = 0.5); in English a comma-grouped thousand ("5,000 IU") is not a decimal; in pt/es/fr/de/it the comma is the decimal ("1,125" = 1.125, "5,000" = 5), a dot with exact 3-digit groups is thousands ("1.250" = 1250), any other dot a decimal, spaces between 3-digit groups are thousands; lab values: a comma is always a decimal; prefilled fields use a never-grouped number; display strings are never parsed. [D 2026-10-01 #93; CLAUDE.md] The per-language parse rule is the assistant's, not the founder's → DL-69.
- **PRD-UI-9** Displayed numbers: draw in units keeps one decimal ("50.0 u"); volumes and concentrations drop trailing zeros; dates and decimals in the app language. [D #92, #182]
- **PRD-UI-10** Correct singular/plural for counts of 1 (French singular for 0 and 1; no "(s)"); a site label stored in English is translated when shown. [D 2026-10-03 #96; A-65, A-101c] Two strings still use "(s)" plurals (`blood_dropped_sub` "value(s)", `screens/BodyScreen.js:618`; `paywall_start_trial_months` in ES / DE / IT) → G-232.
- **PRD-UI-11** "Today" = the local day everywhere; no UTC date pattern in the UI. [D 2026-10-03 #383; MB-27]
- **PRD-UI-12** Free-feature explainers: eight approved (reconstitution calculator, vial tracker, reminders, site rotation, dose log + streak, energy + protein, lab journal typed by hand, dose notes — built but not offered); on the feature's own screen the first time it is reached and unused, never on Today or at launch, at most one a day, never on the dose-logging path, "Not now" / "Try it", example numbers only, "used" flag synced. [D 2026-09-30/10-02 #76] — OK on check 2026-10-12 (G-117 closed): "used" is derived from the user's own synced data; only "already shown" is per device (`lib/featureExplainers.js:6-11`)

---
## 5. Cross-feature contracts

**Why this chapter exists.** Features were specified one at a time, so a rule changed in one place could stay old in another — A-118: Today kept asking for the weigh-in while Progress knew it was done (docs/product/README.md). Each contract below names one **event or shared state**, its **single owner** (the one function that computes it; the TRD defines it), and **every surface that must reflect it identically**. A surface that disagrees is a defect even if it matches "its own" rule (P-12).

How to read the tables: **Must show / do** is the required behaviour; **Status** is `OK` (dossiers found no divergence), `GAP G-n` (§6), a canonical `OPEN-xx` / `AD-xx` / `DL-xx` (`OPEN-DECISIONS.md`), or `UNVERIFIED` (no device evidence). "At once" = without leaving the screen (a data-changed or sync event, or the write's own result); "on focus" = the next time the screen comes to the front.

---

### C-1 — A dose is marked complete
- **Owner:** the single mark-complete path (`recordDoseTaken` → `planMarkTaken`) for the write; `lib/schedule.js` for slots; `lib/adherenceRings.js` for rings; `lib/supplyLow.js` for supply.
- **Triggers:** Today card (oral at once / injectable after the site question), the skipped line, Pending block, "yesterday or today" answer, notification Mark complete (oral headless; injectable via the app), Dose log Missed → Complete and Skipped → Complete, My Protocols card (runs Today's take), Fold left card.

| Surface | Must show / do | Status |
|---|---|---|
| Today dose card | the slot filled; next open slot or the card leaves; "Due" gone; "Skipped — you can still log it" lines unchanged | OK |
| Today header "{x} of {y} complete" | +1 (capped at expected) | OK; must equal the Today ring → GAP G-2 |
| Tracker rings Today / 7 / 30 days | the dose credited to **its own slot** | GAP G-1 (late dose credited to the next slot) |
| Week circle + day streak | today becomes complete/partial; the tracker's **day** streak ("days without a miss") +1 when the day completes | OK (31-day look-back cap → 365, GAP DV-034; changing the unit to doses → OPEN-17) |
| Protocol streak on the card | +doses when the due day becomes fully complete | OK |
| "Last: {site} · {n}d ago" | updated when a site was saved | OK |
| "All caught up" card | appears when nothing is left and something was due | OK |
| Undo bar | "Dose logged · Undo" / "Site saved · {site} · Undo" for 4 s | OK |
| Vial cells / "N of M doses left" (Today card, Protocols card, protocol page, hero line) | −1 dose, the same number everywhere | OK (rule copied 3× → GAP G-21) |
| Supply low (Today alert, Protocols badge/hero, push) | recomputed by the one rule (C-15) | OK (push vs newest vial → GAP G-22) |
| Vial-finished prompt | opens after the last dose of a powder vial (after the site picker) — from Today AND the Dose log | Today OK; Dose log GAP G-9 |
| Oral bottle units / days left | − units per dose | OK (days math → GAP G-27) |
| Dose reminders | that slot and earlier slots of today cancelled; delivered banners dismissed; snoozed copies resolved | OK (body-tap path cancels a different slot → GAP G-10) |
| Reminder screen "Next reminder" / count | reflects the cancellations | OK |
| Pending from yesterday | the pending row disappears when it was the one marked | OK |
| Dose log | new row (or the flipped row) at the right time; counts updated; on the Fold the embedded log refreshes at once | OK (BK-19) |
| My Protocols card "Mark complete" | disappears for that slot; "Due next" sort moves | OK |
| Fold right page (protocol page) | vial block and doses left refresh | UNVERIFIED (FR-6) |
| Inactivity prompt reference | "last Complete" moves to now | OK |
| Missed scan | the slot is covered (no Missed row later) | OK |
| Dose accumulation curve, Journey tile, My Body card | **no change** (schedule-driven by decision) | OK — must stay so (OPEN-11) |
| Adherence report (Settings) | counts the row | OK |
| Sync | the row (and vial/bottle) pushed; other devices show it after their pull | OK (other phone's reminders → GAP G-79) |

- **Timing:** at once on this phone (the drop lands in 360 ms). **Two devices:** a dose logged on phone A keeps reminding on phone B until B pulls and re-plans (GAP G-79).

### C-2 — A dose is skipped
- **Owner:** `recordSkipToday` / `recordSkipPending` (slot-stamped Skipped row).

| Surface | Must show / do | Status |
|---|---|---|
| Today card | the slot shows "Skipped — you can still log it" with Mark complete; the card moves to the next open slot | OK |
| Header count / rings | a skip is not complete (count and rings unchanged) | OK |
| Week circle / streak | the day can at best be partial | OK |
| "All caught up" | shown when no open slot remains (a skip counts as handled), the skipped line still visible (DL-12; picture OPEN-24 item 12) | never reached today → G-204 |
| Supply | never moves | OK |
| Reminder for that slot (and its follow-ups / snoozes) | cancelled (decided by logic: a skipped slot needs no reminder) | DL-08 — not built: today it still fires → GAP DV-035 |
| Undo | whether Skip gets an Undo bar waits for the founder; a Skip undone by marking the slot complete re-arms nothing | OPEN-19 (d) (DV-130); "Didn't take" on a pending-from-yesterday slot already shows an Undo bar (`TodayScreen.js:710-717`), which says "Dose logged" → G-169 |
| Dose log | "Dose skipped" row (neutral colour); counts | OK |
| Missed scan | the slot is covered | OK |
| Curve | no change | OK |

### C-3 — A take is undone (Undo bar)
- **Owner:** `planUndoTake`.

| Surface | Must show / do | Status |
|---|---|---|
| Dose row | deleted (tombstone) or restored to Missed/Skipped with its old time and site; "skip yesterday" rows removed too | OK |
| Header count, rings, streaks, card | back to before | OK |
| Vial / bottle | +1 dose (from the current count) / units back; a vial this dose closed reopens unless another vial is active | OK; must not reopen a vial of an ended/deleted protocol → GAP G-30 |
| Vial-finished prompt of that dose | closed | OK |
| Reminders cancelled by the take | re-armed for the slot that is open again (decided by logic) | DL-09 — not built: not re-armed today → GAP DV-040 |
| Dose log / Fold | refreshed | OK |

### C-4 — A dose is deleted in the Dose log
- **Owner:** `lib/deleteDose.js`.

| Surface | Must show / do | Status |
|---|---|---|
| Dose log | row gone; counts updated | OK |
| Today | today's slot reopens (if it was today's); Undo of that row disabled | OK |
| Vial | +1 only to the vial that can be shown to have held it; reopens if finished by doses | OK (differs from Undo's rule → GAP G-30) |
| Bottle | units back | OK |
| Skipped delete | nothing moves | OK |
| A past-day dose | shows Missed at the next scan | OK |
| Reminders | the reopened slot's reminder re-armed (DL-09); today it stays cancelled `[code]` | DL-09 → GAP DV-040 |
| Rings / streaks / report | recomputed | OK |

### C-5 — The Missed scan writes, or the user corrects, a Missed row
- **Owner:** `scanMissedDoses` (writes); the mark-complete path (corrections).

| Surface | Must show / do | Status |
|---|---|---|
| Dose log | "Dose missed" (red) row; "Update this dose" | OK |
| Adherence report | counts the Missed row | OK |
| Rings | already counted the slot as not taken (they do not need the row) | OK; but rings include ended protocols that the scan skips → GAP G-11 |
| Week circles | "missed" means no dose at all that day (different meaning) | DL-02 (each labelled by what it counts; G-167); tracker streak unit → OPEN-17 |
| Today | never shows Missed (today is never scanned) | OK |
| Pending from yesterday | gone once slot + 12 h passes | OK |
| Correction to Complete | C-1 (site first; vial-finished prompt → GAP G-9) | — |
| Two devices | each scans with its own watermark (duplicates possible; A-48 parked) | GAP G-19 (note) |

### C-6 — Pending from yesterday answered
- **Owner:** `pendingFromYesterday` (both Today and My Protocols call it with the same inputs).
- Complete → C-1 at yesterday's slot time (rings credit yesterday, not today); Skipped → Skipped at yesterday's slot; both clear the Pending row on Today and the "Mark complete" on the Protocols card; nothing cancels today's reminders. **Status:** OK.

### C-7 — An injectable site question is answered or abandoned
- **Owner:** `lib/siteQuestion.js` (saved before shown) + `lib/sitePickerActions.js`.
- Save / Skip → C-1 with or without the site, at the tap time. Cancel / X / confirmed back → nothing written anywhere (dose rows, vial, bottle, counts, rings, streak, reminders unchanged), the button resets, "Not marked complete" notice. App killed → asked again on the next Today open. Intentional sign-out → removed. **Status:** OK; never dropped for age (AD-76, founder line decisions.md:379; was DL-01; G-225); device-only storage AD-34 (G-209).

### C-8 — A protocol is created (manual wizard or AI assistant)
- **Owner:** `saveProtocol` (both doors) → `insertProtocol` + `insertVial` + `scheduleDoseReminder`.

| Surface | Must show / do | Status |
|---|---|---|
| Today | the card (if due today) or Tomorrow / Next 5 days row; header expected count; rings expect from creation − 1 h | OK (creation day after the slot → GAP G-2) |
| My Protocols | heroes (count, names), list, Due-next sort, free-limit count | OK |
| Free limit | the 4th active protocol blocked (free) | OK (phone-only enforcement and the lapsed-Premium rule → OPEN-05, G-186) |
| Dose reminders | scheduled for the window | OK |
| Morning summary, vial-expiry notifications | re-planned at once | GAP G-78 (only at the next full resync) |
| Reminder health (Android) | "a protocol with a reminder time" now true → setup auto-opens once per phone if not seen; Today reminder cards may appear | OK |
| Curve | the protocol is offered (if charted); the remembered selection does NOT change (a new protocol never joins) | OK |
| Journey tile / My Body card | change only if no remembered view existed (default = newest active) | OK |
| History question | asked after the sheet closes when start < today and t½ ≥ 24 h | OK (names the compound → GAP G-37) |
| Vial rows, supply, expiry | created per type; supply and window computed | OK |
| Explainers | the reconstitution/vial/reminder explainers stop being offered once used (synced flag) | OK (G-117 closed on check) |
| Sync / other devices | the protocol and vial pushed; protocol `created_at` = the device time since `e85519c` (vials still first push time; residual for earlier imports) | GAP G-33 |

### C-9 — A protocol is edited
- **Owner:** `editPatch` (writes only changed columns) + `rtuVialPatch`.

| Surface | Must show / do | Status |
|---|---|---|
| Stored row | only changed columns; a no-change Save alters nothing | OK |
| Dose reminders | re-planned; delivered banners dismissed when time / doses per day / interval / start changed | OK |
| Morning summary / vial alerts | re-planned at once | GAP G-78 |
| Today / Tomorrow / rings / Missed scan | follow the new schedule from now | OK (rings re-evaluate past slots with the new schedule `[code]`) |
| Vial capacity | recomputed from what is left (DL-15) | powder kept → GAP G-26; ready-to-use ignores doses taken → G-163; the vial's mix date and window → OPEN-01 |
| Edit form | the stored interval shown in "Every N days" | an interval of 2–7, 10 or 14 opens empty → G-164 |
| Curve | the current dose is applied to past doses too | OPEN-10 (G-174) |
| History question | re-asked when the start moves earlier | GAP G-37 |
| Protocol name/compound | the same name on every surface (translated compound) | GAP G-15 |

### C-10 — A protocol is ended
- **Owner:** `lib/protocolEnd.js` (`endProtocolAtLastDose`; `endProtocol` for a deliberate end — no UI yet: AD-11, picture owed, G-183).

| Surface | Must show / do | Status |
|---|---|---|
| Today | card, Tomorrow/Next 5, pending row, header expected count gone; inactivity snooze cleared | OK |
| My Protocols | moves from the list to Ended ("Ended {date}", Restart, trash); hero count −1 | OK |
| Free limit | no longer counted | OK |
| Reminders (this phone) | cancelled; delivered banners dismissed | OK |
| Reminders (other phones) | cancelled at their next resync after a pull (orphan sweep) | OK (timing → GAP G-79) |
| Vials | deactivated (no supply-low or expiry alerts/pushes) | OK; another phone must not revive them → GAP G-36 (DL-88) |
| Missed rows after the end | removed (only app-written ones) on THIS phone and on other phones | GAP G-35 (DL-87) |
| Dose log, adherence report | history kept (ended protocols with records in the window in the report) | OK |
| Rings / day streak | count up to the end; nothing expected after | OK |
| Protocol streak | (active protocols only) gone from Today | OK |
| Curve | offered 365 days after the end with "· ended"; past drawn, decay after | OK |
| Journey tile / My Body card | must show the same compound and number as the curve even when the first selected compound is ended | GAP G-63 |
| Status across devices | End wins (status only from the device that changed it) | OK |

### C-11 — An ended protocol is restarted
- **Owner:** `restartEndedProtocol`.
- New active run (start today, created now) → C-8 surfaces (Today, Protocols, reminders, curve offers both runs; same-substance runs may form a Combined total; the remembered selection stays on the old run → GAP G-63); the ended row stays in Ended; new container = new full vial mixed today (old vial with the ended run) / same container = the old vial moves unchanged (never re-activating an empty vial, DL-20 → G-165); order: free-limit check first → duplicate warning when the same compound is active → container question (today the limit is checked last, after a container is picked, `ProtocolsScreen.js:1253-1290` → GAP G-229); the copy must be true for "same container" (GAP G-38). **Status:** otherwise OK.

### C-12 — A protocol is deleted (soft) / deleted forever
- **Owner:** `softDeleteRow`; `purgeProtocol` + server triggers.

| Surface | Must show / do (soft delete) | Status |
|---|---|---|
| Today, rings, streaks, report | the protocol and its doses gone | OK |
| Dose log | its doses hidden while deleted (the delete sheet must say so) | OK; copy → GAP G-32 |
| My Protocols | moves to Recently deleted ("Deleted {days}d ago") | OK (day count → GAP G-32) |
| Reminders, delivered banners, vial alerts | cancelled; vials deactivated | OK for the protocol-page delete; the Ended-row delete (`deleteEndedProtocol`, `ProtocolsScreen.js:1231-1246`) only cancels reminders — no `dismissDeliveredDoseReminders`, no `deactivateVialsByProtocol` (low risk: End already deactivated the vials) → GAP G-152 |
| Curve / tile / card | never offered; a remembered id is dropped | OK |
| Free limit | not counted | OK |
| Other devices | status change applied on pull (Delete wins) | OK |
| **Delete forever** | asks first; tombstone; the cloud deletes its doses and vials and blanks the row; other devices remove it (only its synced children); an unsynced child stays pending; cannot be undone | OK, except the blanking: what stays must be only the identity the founder-approved migration defines (id, user_id, type, colour, timestamps, deleted_at, purged_at — AD-67); the trigger leaves interval_days, doses_per_day, concentration_unit and divisible (PRD-PROT-105) → GAP G-151 (DV-221) |

### C-13 — A deleted protocol is restored
- **Owner:** `restoreDeleted`.
- Same local day and under the free limit and not ended before → active again (C-8 surfaces: Today, reminders, curve, newest vial active — must not re-activate an empty vial → GAP G-31); otherwise → Ended dated at the delete (never owed days); purged rows cannot be restored; a second restore changes nothing; multi-select restores one by one (the limit counts each) (DL-89). **Status:** OK except the vial.

### C-14 — A vial: new, reset, finished
- **Owner:** `newVialRecords` (powder new vial), `updateVial` (ready-to-use reset), the mark-complete path (finished).
- New powder vial → Today card cells and "N of M", Protocols card/detail/hero, supply-low cleared, expiry recomputed (Today alert + 09:00 notifications re-planned at once — Today/Log call it; Protocols' create path does not → GAP G-78), protocol start date untouched (history, curve, rings unchanged), reminders rescheduled. Ready-to-use "New vial" resets the same row and keeps the old expiry — a new box must be a new vial row (DL-22, G-162); asking its printed date → OPEN-01. Finished (last dose) → vial inactive, the prompt (C-1), supply-low gone, the card shows "+ Add vial" (powder) — and nothing for an empty ready-to-use vial (DL-22, G-162). **Status:** as noted.

### C-15 — Supply low (one rule)
- **Owner:** `lib/supplyLow.js supplyState` — low = 1–3 doses left; capacity = stored, else derived.

| Surface | Must show | Status |
|---|---|---|
| Today alert "Supply low" (amber, days coloured by deadline) | newest active vial per active protocol; tap → that protocol | OK; tap → GAP G-5 |
| Protocols card "Low" tag, protocol page, hero low-supply line | same rule, same vial | OK |
| Push "Vial running low" | same rule (fires at 3, AD-60); once per vial; app running only | OK; evaluates every active vial → GAP G-22; names → GAP G-15 |
| Adherence report "doses remaining" | same capacity rule | GAP G-20 |
| Oral bottles | no rule anywhere | OPEN-02 (G-184) |

### C-16 — Vial window / expiry (one rule)
- **Owner:** should be one function (today: `lib/vialExpiry.daysUntilExpiry` for powders + three copies of the ready-to-use rule) → GAP G-23.

| Surface | Must show | Status |
|---|---|---|
| Today alert "Vial expiring soon" (≤ 7 days) / "expired" | same date as below | OK |
| Today dose card days-left colour | ≤ 3 risk, ≤ 7 attention, above 7 ok green — the founder's coloured days (Q9 = B, decisions.md:147) | OK |
| Protocols card / page "days left", "Past window" tag | same date and the same colours as Today | GAP G-23 (Protocols shows grey ink2 above 7 — the divergence; AD-65 for Today, DL-80 for My Protocols, picture OPEN-24 item 11) |
| 09:00 notifications (7 days before, on the day) | same date | OK (lead time and words → OPEN-20 (c)) |
| "Vial age" sort | should follow the same window | GAP G-24 |

### C-17 — A weigh-in is saved (any path)
- **Paths:** Log today's weight; + Add a past weigh-in; changing the weight in Your numbers (first weigh-in or the Update/Save-as-today question); the reality-check start sheet (only if that day has none); the check's completion (start day if missing); the weekly check-in tap; the day-21 alert tap.
- **Owner:** `calc_snapshots` (one row per local day, merge per field) read through one "current weight" rule (`lib/numbersWeight.js`) and one check state (`checkOutcome`).

| Surface | Must show / do | Status |
|---|---|---|
| Progress hero weight | the newest weigh-in | OK |
| Progress "Since …" line | first → latest weigh-in | OK (all vs weighed snapshots differ → GAP G-52 note) |
| Weigh-ins fold summary, table, chart | the new row | OK |
| Your numbers weight + summary line | adopts the newest weigh-in unless typed later | OK (fix/delete → GAP G-51) |
| Daily burn (formula) + Your daily plan | recomputed with that weight | OK |
| Your target (progress, pace, ETA) | recomputed | OK |
| Reality check state | running → (weigh-in ≥ day 21) needs food / ready → auto-finish | OK, but the auto-finish runs only when Progress is opened (`CalculatorSection.js:855-859`): Today and Journey can say "ready" for days before the result is saved — whether the self-finishing is wanted waits for the founder → OPEN-07; the one assembler is DL-25 |
| Progress reality-check status line | "Weight logged — …" / ready (never "weigh in {past date}") | GAP G-42 |
| Today reality-check alert | "Weight logged — {n} more day(s)…" / "ready" | OK (A-118) |
| Today food hero line | "· weight logged" | OK (A-118) |
| Day-21 notification | cancelled once weighed in | GAP G-44 |
| 20:00 food reminders | continue until the check finishes (needs food) | OK |
| Journey Progress tile | weight, Since, daily burn — the same numbers as Progress | weight OK; burn → GAP G-52 |
| Journey food card | run line unchanged | OK |
| Event | `data_changed:'calc'` so the Journey tiles refresh at once (Fold too) | OK (PO-25, BK-19) |
| Validation | 25–300 kg / 3–70 % / 30–250 cm on every path | GAP G-55 |
| Paywall | never | OK (P-13) |
| Sync | one row per day; a newer weigh-in typed on another phone wins over that day's delete | OK (A-92) |

### C-18 — A weigh-in is fixed or deleted
- Fix → the same surfaces as C-17 (in place, same row); fixing the check's start weigh-in moves the check's start weight. Delete → every row of that day tombstoned, never comes back (except a newer entry typed on another phone); the next weigh-in ≥ day 21 becomes the result weigh-in if the deleted one was it (before saving); the open check's start weigh-in cannot be deleted. **Status:** OK except Your numbers' weight and the daily burn not following a same-day fix/delete (GAP G-51).

### C-19 — Food is logged, fixed, removed; a day is closed
- **Owner:** `food_logs` rows + markers (`day_closed`, `ate_nothing`, `free_start`), read through `intakeRun` (run) and `todaySummary` (today's line).

| Surface | Must show / do | Status |
|---|---|---|
| Chat thread | rebuilt from stored rows (one bubble per message, entry cards per day) | OK |
| Today food hero (check open) | today's items · ~kcal or "day closed"; "{n} of 7 days in a row" (PT "{n} de 7 seguidos") | OK (midnight staleness → GAP G-47) |
| Journey food card | today's line; run line while a check runs | OK |
| Progress reality-check card | "n of 7 so far" / "≈ avg from d days" | OK (three "days" counts → GAP G-50) |
| Today reality-check alert | "needs food" count after the weigh-in | OK |
| Check readiness / auto-finish | the 7th complete day makes it ready | OK |
| 20:00 reminder for that day | cancelled when the day is closed (any path: "that's it", chip, notification "Nothing else today") | OK |
| Free-days anchor | the first send writes `free_start` | OK |
| Totals (day / 7 days / window) | recomputed and shown | only the day's total is shown → OPEN-18 (9) (G-198) |
| Closing an empty day | asks "I ate nothing" except from the notification | OK (only-unparsed rows → GAP G-54) |
| Removing an entry | asks first | GAP G-56 ("Fix this entry"); the chat's Remove pill → G-161 |
| Fold left page (Journey food hero) | follows a send made on the right page | G-173 (DL-98) |

### C-20 — The reality check starts, stops, starts over, finishes
- **Owner:** `reality_check_open` (open check) + `checkOutcome` (state) + `reality_checks` (results). Every surface must read the state through one assembler (`readCheckNow`-style) → GAP G-46 / G-42 (Progress assembles its own copy).

| Surface | Start | Stop | Finish (result saved) | Status |
|---|---|---|---|---|
| Progress RC card | "In progress · weigh in {date}" | "Not run yet" | result with source line; "Weigh in again in 21 days" — saved only when Progress is opened | OK (stale `rcStart` → GAP G-46); the Stop link is also offered with no check open and wipes every result → GAP G-149 (DV-004) |
| Today alert | appears ("Weigh in on {date}") | disappears | disappears | OK |
| Today food hero | appears | disappears | disappears | OK |
| Journey food card | run line appears | disappears | disappears | OK |
| Day-21 notification | scheduled 10:00 start + 21 | cancelled | cancelled | OK |
| 20:00 food reminders | 7-day rolling set | cancelled | cancelled | OK (OPEN-07) |
| Free-days anchor | written at the start tap (if none) | — | — | OK |
| Progress hero / daily plan / Journey tile | — | today: Stop deletes saved results → back to Estimated | Measured chip + rebased plan | OPEN-08 |
| Other devices | the open check pulled (full pull) | Stop wins (client + server trigger) | result row pulled | OK |
| Next check on (or before) the result day | must run normally | — | — | GAP G-48 |
| No savable number (maintenance / implausible / too short) | — | — | never saved, never closes today | OPEN-09 (G-188) |

### C-21 — Food access (free days, locked, grace, Premium)
- **Owner:** `foodLogAccess` via `loadFoodAccess`.

| Surface | Must show / do | Status |
|---|---|---|
| Chat composer | open, or the locked card → paywall | OK |
| Today hero / Journey card | locked line → paywall | OK |
| Grace / free-days-ending note | the last 2 free days; grace "until the end of this check week" | OK |
| Progress | start allowed during free days only — **not** in grace (grace = finish the current week of logging; no new check, no result — AD-14, decisions.md:229, :274); result needs Premium after free days; typed calories Premium only | GAP G-53 (DV-101: code lets grace start a check and see a result); typed link → GAP G-41 |
| 20:00 reminders | none for days the user cannot log | OK |
| Paywall table | "AI food log · 7 days" | OK |
| Server (`parse-food`) | must refuse a locked user's parse | GAP G-40 |

### C-22 — Premium state
- **Owner:** `lib/entitlement.js hasPremium / getEntitlement` (client); RevenueCat REST (server, scans only).

| Surface | Free | Premium | Status |
|---|---|---|---|
| Curve screen (all entries) | paywall | opens | OK |
| Journey tile | Premium tag, no number | Est. level | OK (unknown state → GAP G-74) |
| My Body card | tag + lock → preview sheet | Est. level | OK |
| Dose log "Curve" button | paywall | curve | OK |
| Protocols | 3 active, then the limit sheet; restore/restart at the limit → Ended | unlimited | OK (lapse and server enforcement → OPEN-05) |
| PDF export | "PDF export is Premium" | export | OK |
| Reality check start/result | free days only (never in the lapsed-payer grace week) | always | GAP G-53 (DV-101: code allows grace) — AD-14 |
| Typed calories link | hidden | shown | GAP G-41 |
| Target measured ETA | teaser → paywall | shown | OK |
| Lab charts | locked (by decision) | shown | GAP DV-108 — not gated in code on any path (`MarkerChart` with 2+ readings, `BodyScreen.js:1067-1068`; no gate in `openMarker` or the Fold right page); AD-24; picture first (free users lose a feature they have today — say so in the founder's deviation/picture round) |
| Food log | 7 free days, then locked | every day | OK |
| AI scans | 3 / month (server) | 20 / month (server; no number in Premium strings, AD-69) | OK (Premium empty journal shows "3 free scans" → G-178) |
| AI assistant, food parse caps | same for all | same for all | OK (builder caps → OPEN-18 (3)) |
| Settings Premium card / badge | card shown | hidden / badge | OK |
| Paywall | plans | "You already have Premium" | OK |
| After purchase / restore | every surface flips at once; the paywall closes back where the user was | — | UNVERIFIED on device |
| Offline | cached expiry decides (a payer is never locked out) | — | OK (cross-account cache → GAP G-109) |
| Lapse | Premium surfaces lock; food grace week (logging only); protocols above 3 stay `[code]` | — | OPEN-05 |

### C-23 — Profile data (sex, birth year, activity, name)
- **Owner:** `user_metadata` profile, read through `lib/bodyProfile.js` (sex/age) and `lib/activityLevels.js` (activity).

| Surface | Must show / do | Status |
|---|---|---|
| Progress daily burn, BMR, Your numbers age (locked) and sex | from the profile only; sex never defaulted | OK |
| Journey tile daily burn | same | OK |
| Site picker mannequin | male/female from the profile (male when unknown) | OK |
| Profile gate / 18+ gate | the same fields and rules | OK (Settings validates its own list; "tracking" not editable → DL-58) |
| Onboarding stash | fills only missing fields | OK |
| Settings Edit profile | edits the same keys; must report a failed save | GAP G-107 |
| Activity | one 5-level scale; newest stamp wins between Settings, onboarding and Progress | OK |

### C-24 — The app language changes
- **Owner:** `LanguageContext` (`dosetrace_language`).

| Surface | Must show / do | Status |
|---|---|---|
| Every screen | strings, dates and decimals in the new language at once | OK |
| Protocol names | the translated compound name everywhere (stored text only for own names) | GAP G-15 |
| Frequency rows | re-derived from the interval | OK |
| Scheduled notifications (dose, summary, food, vial, check-in) | re-planned in the new language; and in the device language for a user who never picked one | GAP G-77 (also: the device-language default is never stored, so notifications fall back to English for those users — verification 03 NEW-1) |
| Android channel names | in the app language | GAP G-82 |
| Curve day letter, units, age word | per language | OK |
| AI scans / assistant | the `lang` parameter follows the app language (date tie-break) | OK |
| Notification action button titles | re-registered at the next full resync | OK (delay → GAP G-77) |

### C-25 — Theme changes (System / Light / Dark)
Every screen, modal, sheet, picker, dropdown, chart, notification-free surface switches with tokens; nothing illegible in either theme; the share/export paper keeps its fixed colours. **Status:** per-screen device evidence required before every build (P-15); ErrorBoundary → GAP G-123.

### C-26 — A notification switch changes (Settings or Progress)
- **Owner:** `user_metadata` switches read by `lib/notifications.js`.

| Switch | Must do at once | Status |
|---|---|---|
| Dose reminders off | cancel dose reminders, follow-ups, dose snoozes, morning summaries; Today reminder cards stop (reminders don't matter) | OK |
| Silent mode on | cancel everything; schedule nothing (test reminder excepted); Today Silent card; reminder screen says so; Settings never "blocked" | OK (Today Blocked + Silent together → AD-25 / DL-45, G-170; "Nothing new logged" bypass → GAP G-85) |
| Show names off | titles/bodies private; snoozed copies re-titled | OK (snoozed vial-expiry → GAP G-84) |
| Vial alerts off | cancel low + expiry | OK (label → GAP G-76; snoozed copies survive → G-197) |
| Check-in off | cancel the weekly check-in | OK (snoozed copies survive → G-197) |
| Food reminders off (Settings or Progress, one switch) | cancel 20:00 questions; stays off across new checks | OK |
| Persistent on/off | follow-ups added/removed | OK (copy → DL-48, G-172; a snooze does not stop them after a resync → G-196) |
| A change made on another device | picked up at the next full resync | Silent: standalone schedulers use a stale flag → G-171; others UNVERIFIED (03:D-12) |

### C-27 — The phone's reminder health changes (permission, category, exact alarms, battery, hibernation, refresh, deep sleep)
- **Owner:** `readReminderHealth` (reader) + `lib/reminderHealth.js` (rules).

| Surface | Must show / do | Status |
|---|---|---|
| Today reminder cards (+ combined card) | appear/disappear with the same rule | OK |
| Settings row (Android / iPhone) | the same state: red on any readable block, whichever kinds are on (AD-71, as signed RC-1 / SP-1) | OK |
| Reminder screen rows + bar | the same state, refreshed on return from Android settings | OK (bar ignores "None scheduled" → GAP G-89) |
| Onboarding step | the items + bar | OK (also shown after a denied dialog — a denial is an answer, as the signed SP-4 says; G-88 closed) |
| Exact alarms turned on | reschedule everything exact; re-arm snoozes | OK |
| Food / weigh-in channel | the "Check-in Reminders" category must be checked too | GAP G-81 |

### C-28 — Local midnight passes / a new day
| Surface | Must do | Status |
|---|---|---|
| Today | re-date; yesterday's open slots move to Pending; tracker windows roll | OK |
| Missed scan | runs on the new day | OK |
| Food chat | day divider; questions name their day | OK |
| Food hero / Journey card / Progress | today's line and the check's day move to the new day | GAP G-47 |
| Today alert snoozes ending at 09:00 | reappear without a refocus | GAP G-7 |
| Curve "now" | moves on the next change/focus `[code]` | (05 E19) |
| Free days / grace | the new day counts | OK |

### C-29 — The time zone or DST changes
Dose slots, pending and Missed use the zone of their own day (zone history); reminders fire at the old wall time until the next resync re-plans; stored dates never move; the curve's dose grid must give the tile and the screen the same number across a DST change (GAP G-64); food days are local strings; the scan pool month is UTC. **Status:** as noted; a 02:30 slot on a spring-forward day UNVERIFIED.

### C-30 — Sign-out, sign-in, account switch, account deletion
| Event | Must do on every surface | Status |
|---|---|---|
| Intended sign-out | push first (block if unsynced unless "Sign out anyway"); wipe the database, notifications, snoozes, stash, flags, site questions, selections, drafts; remove the push token; RevenueCat log-out | OK |
| Intended sign-out — device keys | must not carry to the next person. Real global leaks today: `dosetrace_missed_since` / `_tz` / `dosetrace_zone_history` (`lib/doseActions.js:123-129`), `dosetrace_alert_snooze`, `dosetrace_vial_low_sent`, the AI consent, `dosetrace_entitlement_last_uid` (never cleared, `lib/entitlement.js:44-68`). Already per user (residue only, never inherited): the curve view (`curveViewKey(userId)`), explainer flags (`dosetrace_explainers_v1:${userId}`), the food draft (`dosetrace_food_draft:${uid}`) | GAP G-106, G-109, G-12, G-87; DL-55 (G-110: the food draft is a per-user key — residue that breaks BK-14, not a cross-account leak) |
| Spurious SIGNED_OUT | keep everything | OK |
| Different account signs in | discard the previous account's local data and reminders before import | as built; whether the previous account's unsynced rows may be discarded without a warning → OPEN-21 (11) |
| Account deleted (here) | server deletes all; phone wipes and signs out once | OK |
| Account deleted / session revoked elsewhere | cancel scheduled reminders when the server confirms | GAP G-75 |

### C-31 — Data arrives from another device (pull)
| Surface | Must react | Status |
|---|---|---|
| Today, Dose log, Protocols, Journey tiles | on the sync event | OK |
| Progress (open check, weigh-ins, results, food rows) | on the sync event while mounted (Fold) | GAP G-46 |
| My Body | on the sync event (and curve change) | GAP G-65 (no listener) |
| Dose reminders | re-planned after the pull (a dose logged elsewhere stops this phone's reminder) | GAP G-79 |
| Food / weigh-in reminders | re-planned (30 s throttle) | OK |
| Protocol status | End/Delete wins | OK |
| Vial status | the same rule | GAP G-36 |
| Missed rows removed at an end elsewhere | removed here too | GAP G-35 |
| Calculator inputs | merged, never a whole-payload overwrite | GAP G-62 |
| Rows another phone pushed before this phone's own push; a late-committing row; a row at a page boundary | fetched by the pull | G-156, G-157, G-158 (OPEN-16 (b)) |
| Vial / bottle counters | two offline doses on two phones count as two | G-159 (OPEN-16 (b)) |
| A deleted dose log (and other non-protocol rows) | the delete reaches every device | G-155 (DV-182) |

### C-32 — A lab test is added, edited or deleted
- **Owner:** `biomarkers` rows, grouped by one card rule (A-101d).

| Surface | Must show | Status |
|---|---|---|
| Lab test journal (By date / By marker) | the card / readings | OK |
| Hub count ("N tests") | the same count as the journal's cards, on every device | GAP G-92 |
| Hub starred rows | the same "latest" as the marker screen and the export | GAP G-93 |
| Marker screen / chart | updated | OK |
| Today "Bloodwork due" | recomputed from the newest test date | OK (future date → GAP G-100) |
| Curve "Estimate on a date" chips | bloodwork dates updated | OK |
| Export sheet | the marker list | OK |
| Labels / favourites | follow the test / the marker identity | GAP G-95, AD-02 |
| Fold right page | falls back to the newest test after a delete | OK |
| Scan pool | +1 per delivered scan (not for "nothing usable") | GAP G-99 |

### C-33 — A vaccine is added, edited or deleted
Vaccine journal card; hub count and "Next due" line (nearest user date ≥ today); Fold read page; Export list and Export visibility; scan pool (scan). **Status:** OK (export omits details → GAP G-98).

### C-34 — The curve selection changes
- **Owner:** the remembered view (`dosetrace_curve_view_{uid}`) → the first selected compound.
- Curve screen, Journey tile and My Body card show the same compound and Est. level; the event `data_changed:'curve'` refreshes Journey at once; My Body must listen too. **Status:** GAP G-63, G-64, G-65.

### C-35 — Fold / unfold and the book selection
Place kept; explicitly chosen right-page items become pushed screens on fold and right pages on unfold; drafts per item kept; sheets stay open; one popup across both pages; pages update each other (BK-19). **Status:** tests partial; device proof missing (GAP G-132).

### C-36 — The AI scan pool
- **Owner:** the server (`ai_scan_usage`, calendar month UTC).
- Lab, vaccine and vial scans all count; the limit message on all three screens shows the server's limit; the paywall row "3 / month" (a client constant, `FREE_SCANS_PER_MONTH = 3`, `paywallPlans.js:13`, mirroring `quota.ts:10`); My Body's free card "3 free scans a month (labs, vaccine cards and vials combined)" (free users only, `BodyScreen.js:1100-1107`) and the empty journal line (shown to everyone, `:1115-1120`); the FAQ "up to 20 a month in total". Premium strings carry no number (the 20 only in the FAQ and the limit-reached message); no Premium scan line is added; the free number is never shown to a Premium user (AD-69). **Status:** the empty journal shows "3 free scans" to Premium users → G-178; used / left is never shown → OPEN-14 (b) (G-190).

### C-37 — AI consent
- **Owner:** `lib/aiConsent.js` (key v4).
- Asked once before the first AI call of any kind (lab, vaccine, vial, food chat, assistant); the onboarding AI line and the privacy policy say the same thing (Anthropic; reads, never analyses; only with consent). **Status:** device-scoped, not withdrawable → DL-55. The copy-match is **not** true today: the consent stores only `'granted'` (no version date) and is not in the sign-out wipe (`lib/signedOut.js:158-163`); the onboarding line `ob_term3_d` omits vial labels and the protocol assistant; the in-app `settings_privacy_body` is dated April 2026 and covers labs and vaccine cards only → GAP G-106, G-112 (A-117 not built; one text DL-81, every AI feature AD-72; DV-231).

### C-38 — Activity, units and "enter once"
One activity answer for onboarding, Settings and Progress (5 levels, newest stamp wins); metric/imperial for Your numbers, weigh-in sheets and the target (stored kg/cm); the latest weigh-in is the current weight everywhere (C-17). **Status:** OK except GAP G-51, G-52.

### C-39 — Explainer "used" flags
One flag per explainer per user, synced, so an explainer never replays on another phone or after reinstall. **Status:** OK on check 2026-10-12 (G-117 closed): "used" is derived from the user's own synced data; only "already shown" is per device (`lib/featureExplainers.js:6-11`); a reinstall may replay an explainer once (accepted in the code comment, not user data).

### C-40 — Protocol identity across surfaces
The same protocol is named the same everywhere: Today card, Skip sheet, site picker, vial prompt, Dose log, Protocols, curve picker (blend components with the blend name), tile, card, notifications, morning summary, adherence report, vial notifications. **Owner:** one display-name function (translated compound, else own text). **Status:** GAP G-15, G-66.

---
## 6. Known gaps versus this PRD

Every row is a place where the code does not do what this PRD requires. Dossier references point to `docs/product/research/0N-*.md` (D = divergence, G = gap, E = edge case, § = section). **Kind:** `bug` (a decided rule the code breaks), `not built` (approved, missing), `logic` (required by a `[logic]` requirement — record in decisions.md), `doc` (documentation drift), `evidence` (built but unproven on a device). For the code sweep: each row becomes a failing test first (P-20); rows marked with an OPEN-xx wait for the founder; the DV column is the row in `DIVERGENCES.md` (the one register of defects). Every active row and every ops item of that register is reached from a gap row here (§6.10 adds the rows the earlier sections did not reach); merged rows are cited by their target (DV-206 → DV-003, DV-208 → DV-068, DV-212 → DV-071, DV-189 → DV-088) and closed rows (DV-100, DV-142, DV-194) only as closed.

### 6.1 Today, doses, Dose log
| Gap | Dossier | Description | Kind | PRD / contract | DV |
|---|---|---|---|---|---|
| G-1 | 02:D6, 02:D7, 02:G2 | A dose logged late is credited to the NEXT slot in the rings (yesterday 21:00 dose for an 08:00 slot fills today's ring; twice-daily 20:00 counts for 08:00). The 21:00 example is 13 h late — outside "± half the interval", so the code follows :144 literally; the real conflict is rings vs the Missed scan's same-local-day rule (`missedDoses.js:149-155`); decided: a dose on the slot's own local day belongs to that slot (AD-70, decisions.md:140; the rings follow by DL-04) | bug → AD-70 | PRD-TODAY-31; C-1 | DV-030 |
| G-2 | 02:D8, 02:D3 | Header count and Today ring use different rules (active vs active+ended, declared included, calendar day vs proximity); a protocol created after its slot shows "Due"/"0 of 1" while the tracker says "Nothing due" | bug | PRD-TODAY-27; C-1, C-8 | DV-029 |
| G-3 | 02:D1, 02:D22, 03:D-18, 01:D-09 | A protocol with no reminder time: expected by Today, never pending/Missed, rings at 12:00, reminders at 08:00 (fix per DL-06: one slot list everywhere — Due, pending, Missed, rings, reminders — and DL-77: 08:00, what the phone already uses). Counting it as "has a reminder time" for the reminder warnings is correct (it IS reminded at 08:00) | bug (legacy rows) | PRD-REM-12 | DV-028 |
| G-4 | 02:D2 | doses per day larger than the number of times: header 2, ring 1, second slot never Due | bug (legacy/edge) | PRD-TODAY-23 | DV-028 |
| G-5 | 02:D23, 01:D-23, 01:G-10 | Today supply-low and vial-expiry alerts naming one protocol open the Protocols heroes, not that protocol | bug | PRD-TODAY-51; C-15 | DV-089 |
| G-6 | 02 §8 | The "Due" tag is computed at render; no timer re-renders the card when the slot becomes due | bug (SUSPECTED) | PRD-TODAY-24 | DV-148 |
| G-7 | 02:D24 | A Today alert snooze ending at 09:00 reappears only after the next refresh | bug (SUSPECTED) | PRD-TODAY-52; C-28 | DV-148 |
| G-8 | 02 §6.9 | The offline alert has a snooze id but its condition ignores the snooze | bug | PRD-TODAY-54 | DV-134 |
| G-9 | 02:G12 | Dose log Missed → Complete that empties a powder vial deactivates it silently (no vial-finished prompt) | logic | PRD-LOG-8; C-1 | DV-038 |
| G-10 | 02:D12, 02:D25 | A body tap on the 20:00 reminder while 08:00 is open logs the 08:00 slot and cancels only 08:00 reminders; the focus slot is ignored | bug | PRD-TODAY-8, PRD-REM-15 | DV-036 |
| G-11 | 02:D13 | The Missed scan skips ended protocols while rings/streaks count their unanswered slots | bug | PRD-DOSE-52; C-5 | DV-031 |
| G-12 | 02:D16, 08 §11.14 | The Missed-scan watermark and zone history survive an account switch | logic | PRD-ACCT-3; C-30 | DV-081 |
| G-13 | 02:G14, 01:G-25 | Dead code left by A-115 and others (`planDosePage`, `undoRecordsRef`, Skip `keepUndo`, 60 s page tick, `endProtocol` import, `expiryColor` with raw hex, `totalDoses` state, unused month-adherence, invisible ring animation) | cleanup (rebuild = replace) | PRD-FOLD-3 | DV-181 |
| G-14 | 02:G19 | The Dose log renders `notes` / `pre_tags` that are never stored | cleanup | PRD-LOG-2 | DV-181 |
| G-15 | 02:D26, 01:D-05, 03:D-19 | The same protocol is named by its translated compound on some surfaces and by its stored text (creation language) in the Skip sheet, site picker, vial prompt, Dose log, notifications, morning summary, report | logic | PRD-TODAY-29; C-40 | DV-013 |
| G-16 | 02 §7.3 | The dose row and the vial/bottle update are not one transaction (a kill between them leaves supply unchanged) | bug (SUSPECTED) | PRD-DOSE-1 | DV-039 |
| G-17 | 02:D21 | Tomorrow / Next 5 days show only the first time of the day and count protocols labelled as doses | bug | PRD-TODAY-20 | DV-037 |
| G-18 | 02 §6.12 | "Last site" counts elapsed hours, not calendar days: a dose logged 23:00 yesterday reads "Last: {site} · today" the next morning (the UI never says "0d ago") | bug (CONFIRMED by code) | PRD-TODAY-28 | DV-135 |
| G-19 | 02:D15 | Two devices can each write a Missed row for one slot (no dedupe) | note (A-48 parked) | C-5 | DV-041 |

### 6.2 Protocols and supply
| Gap | Dossier | Description | Kind | PRD / contract | DV |
|---|---|---|---|---|---|
| G-20 | 01:D-02, 08:D3 | Adherence report "doses remaining" ignores the derived capacity (can be negative) | bug | PRD-SET-40; C-15 | DV-017 |
| G-21 | 01:D-03 | The capacity rule is re-implemented in Today's card, markTaken and deleteDose | cleanup | PRD-VIAL-11 | DV-121 |
| G-22 | 01:D-04 | The supply push evaluates every active vial; screens only the newest per protocol | bug | PRD-VIAL-20; C-15 | DV-016 |
| G-23 | 01:D-06, 01:D-06b, 08:D6 | Days-left colours differ: Today green above 7 follows the founder's coloured days (Q9 = B, decisions.md:147); the Protocols list's grey ink2 above 7 is the divergence (AD-65 for Today; DL-80 for My Protocols, picture OPEN-24 item 11; DL-16 replaced); and three copies of the ready-to-use expiry rule | bug | PRD-VIAL-21; C-16 | DV-018 |
| G-24 | 01:D-07 | "Vial age" sort ignores the validity window and puts ready-to-use vials last | bug | PRD-PROT-3 | DV-122 |
| G-25 | 01:D-08, 01:D-09, 01:D-11, 02:D4, 08:D4 | `schedule_total` honoured by reminders only; rows without start date are due every day on Today but every N days for reminders; "Day Y of Y" forever | bug → OPEN-03 | PRD-REM-16 | DV-012, DV-014 |
| G-26 | 01:D-13 | Editing a powder protocol's dose keeps the vial's old stored capacity | bug → DL-15 | PRD-PROT-72 | DV-015 |
| G-27 | 01:D-14 | Oral days of supply ignore the interval (every-2-days protocols show half) | logic | PRD-VIAL-3 | DV-020 |
| G-28 | 01:D-14b | "Mixed on Feb 31": clamped in the wizard, refused on Today; the assistant uses a date wheel (cannot receive Feb 31) and refuses a future date or one > 365 days ago, the wizard does not | bug | PRD-PROT-20 | DV-019 |
| G-29 | 01:D-16 | Custom interval 1–999 in the form vs 1–365 in the assistant | bug → DL-19 (1–365 everywhere) | PRD-PROT-19 | DV-123 |
| G-30 | 01:D-17, A-87b | Undo can reopen the vial of an ended/deleted protocol; Undo and Delete use different "give one back" rules | bug | PRD-DOSE-31; C-3, C-4 | DV-021 |
| G-31 | 01:D-18 | Same-day Restore re-activates an empty vial; the newest-vial read lacks the tombstone filter | bug | PRD-PROT-103; C-13 | DV-022 |
| G-32 | 01:D-19, 01:G-4, 01:G-22, A-90 | "Deleted 1d ago" one minute after; the sheet promises "recoverable for 7 days" and does not say doses leave the Dose log | bug (copy must be true) | PRD-PROT-101-102; C-12 | DV-023 |
| G-33 | 01:D-20, 01:G-27 | `created_at` drift across devices. Protocols send `created_at` since commit `e85519c` (verified 2026-10-12); residual: a pull never updates a local `created_at`, so devices that imported a protocol earlier keep the server time — and 8 tables still do not send it: vials, labs, vaccines, food, reality checks, snapshots, targets and calculator inputs (verification 06) | bug | PRD-PROT-64; C-8 | DV-001 |
| G-34 | 01:D-21 | The inactivity prompt and the end date use declared rows | bug (legacy) | PRD-DOSE-41 | DV-026 |
| G-35 | 01:G-2, A-86b | Missed rows removed at an end are removed on this phone only | not built → DL-87 | PRD-PROT-84; C-10, C-31 | DV-025 |
| G-36 | 01:G-3, A-87b | Another phone can re-activate a vial the end deactivated (no status rule for vials) | not built → DL-88 | PRD-PROT-84; C-10 | DV-021 |
| G-37 | 01:G-5, A-94, A-90 | The history question does not name the compound and is not re-asked when an edit moves the start earlier | not built → DL-86 (naming: Approvals item 2.9) | PRD-PROT-62; C-9 | DV-091 |
| G-38 | 01:G-20 | Restart copy says "zero doses taken" even for "Keep using the same vial" | bug (copy) | PRD-PROT-92; C-11 | DV-024 |
| G-39 | 01:G-24 | Today's empty-state "Add a protocol" opens the tab, not the wizard | logic | PRD-TODAY-6 | DV-124 |

### 6.3 Food log, reality check, Progress
| Gap | Dossier | Description | Kind | PRD / contract | DV |
|---|---|---|---|---|---|
| G-40 | 04:D-15, 04:G-1, 07:D-2 | `parse-food` never checks entitlement or free days (the lock is phone-only) | bug (FX-16 "server authoritative") | PRD-FOOD-64; C-21 | DV-103 |
| G-41 | 04:D-14 | The typed-calories link shows to free-days and grace users; the founder chose Premium-only (2026-10-08 "A") | bug | PRD-RC-30; C-21, C-22 | DV-102 |
| G-42 | 04:D-1 | Progress status line ignores "weighed in" ("In progress · weigh in {past date}") — the A-118 class | bug | PRD-RC-4; C-17 | DV-056 |
| G-43 | features.md S-16 note; `lib/paywallPlans.js` | Paywall/FAQ row "Reality check & progress tracking" sold as Premium while weigh-ins and the chart are free | bug (copy must be true) | PRD-PREM-9 | DV-186 |
| G-44 | 04:D-2 | The day-21 notification fires after the weigh-in (not re-planned on a weigh-in) | logic | PRD-REM-52; C-17 | DV-057 |
| G-45 | 04:D-3 | Today says "ready — tap to see it" when the result is locked or cannot be saved | → DL-26, OPEN-09 (texts: OPEN-24 item 7) | PRD-RC-53 | DV-058 |
| G-46 | 04:D-4, 04:G-6, 08:D5 | Progress loads the open check once per mount and has no sync listener (two assemblers of the check state) | bug | PRD-PROG-4; C-20, C-31 | DV-059 |
| G-47 | 04:D-5 | Progress and the food heroes keep yesterday's state across midnight until refocused | bug (SUSPECTED) | PRD-PROG-4; C-28 | DV-148 |
| G-48 | 04:D-7, 04:G-3 | A new check started on (or before) the last result's date is hidden behind the old result and never finishes; only regex tests cover it | bug | PRD-RC-51; C-20 | DV-060 |
| G-49 | 04:D-8 | The open check has its own start weight that can differ from that day's weigh-in | → OPEN-07 | PRD-RC-2 | DV-061 |
| G-50 | 04:D-9 | Three different "days" numbers on one screen (latest ≥7 run, trailing run, days with food) | presentation | PRD-FOOD-43 | DV-146 |
| G-51 | 04:D-10, 04:G-5 | After a same-day weigh-in fix or a delete, the hero weight and the daily-burn weight differ (A-101e class) | bug | PRD-PROG-24; C-18 | DV-062 |
| G-52 | 04:D-11, 05:D8, 08:D1 | The Journey tile computes the daily burn from the saved weight, not the adopted one; tile vs hero "since" and null-weight rows differ | bug | PRD-JOUR-3; C-17 | DV-063 |
| G-53 | 04:D-13 | A lapsed payer in grace can start a new check and see its result (`rcFree = access.canLog`) | bug (AD-14 decided: grace = logging only; no new check, no result) | PRD-FOOD-62 | DV-101 |
| G-54 | 04:D-16 | Closing a day whose only rows are refused/unparsed/too old/pending does not ask "I ate nothing" | bug | PRD-FOOD-24; C-19 | DV-064 |
| G-55 | 04:G-7, 04 edge 12 | Weigh-in ranges enforced only in the fix sheet (Log today / backfill / start sheet accept 0.8 or 900 kg) | logic | PRD-PROG-44; C-17 | DV-065 |
| G-56 | 04:G-16 | "Fix this entry → Remove entry" deletes without asking; saving "Fix this entry" with every item cleared also deletes the entry without asking (`FoodEntryEditor.js:86`, verification 04 N-4, S1) | bug ("every delete asks first") | PRD-FOOD-25 | DV-003 |
| G-57 | 04:G-4 | The "not recorded" mark is read but nothing writes it | → OPEN-18 (2) (DL-66 withdrawn) | PRD-FOOD-40 | DV-151 |
| G-58 | 04 edge 11 | An all-"ate nothing" run gives the misleading "too short" message ("Use weigh-ins at least 14 days apart" — its only reachable cause is a 0 kcal average; the "< 14 days" branch is unreachable) | bug | PRD-RC-50 | DV-150 |
| G-59 | 04 edge 5 | A quota hit on an offline re-parse keeps the row pending, retried on every open (rows of the last 60 days); the counter is per `entry_date` and never resets for that date, so the row cannot clear itself | bug (CONFIRMED by code) → DL-28 (rewritten: count by the request's local day; mark "not read yet — daily limit reached" and retry the next day; OPEN-24 item 8; deploy: Approvals item 1) | PRD-FOOD-51 | DV-066 |
| G-60 | 04:G-11, 04 §6.2 | Dead code/strings (`rollingAvgKcal`, `getFoodLogDayCount` "3 free days", `unloggedCheckDays`, `today_alert_rc_remove_*`, `cal_overview_title`); the 21-day constant duplicated in FoodLogHero/foodThread; stale "AsyncStorage" comment | cleanup | — | DV-181, DV-147 |
| G-61 | 04:G-12 | Dormant server push food strings differ from the signed FL-18 wording | doc (dormant) | PRD-REM-1 | DV-145 |
| G-62 | 04 §7 | Calculator inputs: last writer wins on the whole payload across devices (typed calories / result sources / legacy burn can be lost) | bug (SUSPECTED) | PRD-PROG-26; C-31 | DV-010 |

### 6.4 Dose accumulation and Journey
| Gap | Dossier | Description | Kind | PRD / contract | DV |
|---|---|---|---|---|---|
| G-63 | 05:D1, 05:G1 | Journey tile and My Body card use active protocols only, the curve active + ended: different compound and number after End/Restart | bug (MB-4) | PRD-CURVE-51; C-10, C-34 | DV-067 |
| G-64 | 05:D2, 05:G2, 05:D9 | DST grid snap: tile ≠ curve for up to 14 days after a clock change (tile 0.0625 / 0.0 vs curve 0.25 mg at 0.5 mg reproduced; also the reverse — at 11:30 the tile shows a dose the curve does not have yet) | bug | PRD-CURVE-51; C-29 | DV-068 |
| G-65 | 05:D3, 05:G3 | My Body has no sync listener at all (`addSyncListener` absent): it never reloads on a pull while focused, and a 'curve' change on the Fold right page is not reflected | bug | PRD-FOLD-8; C-34 | DV-152 |
| G-66 | 05:D4, 05:G4 | Picker rows name blend components without the blend | bug | PRD-CURVE-3; C-40 | DV-153 |
| G-67 | 05:D5, A-96 | "Doses counted" counts the visible window, not the doses in the estimate | not built (picture first) | PRD-CURVE-24 | DV-096 |
| G-68 | 05:G6 | Oral protocols are excluded silently (the screen promises to name what it does not chart) | bug | PRD-CURVE-1 | DV-155 |
| G-69 | 05:G7 | `substance_boldenone` missing in all 6 languages (raw key in a Combined total) | bug | PRD-CURVE-16 | DV-070 |
| G-70 | 05:G8 | Curve copy still says "logged" doses / "serum curve": `curve_empty_sub`, `curve_combined_hint`, and the live Premium strings `paywall_hero_sub` and `settings_premium_feat_1` ("…from your own log", ×6) | logic (FX-13 intent) | PRD-CURVE-33 | DV-071 |
| G-71 | 05:G12, A-98 | A Journey tile tap fires no analytics event | not built | PRD-JOUR-6 | DV-105 |
| G-72 | 05:G16, 05 E17 | Readout dates > 365 days back show "—" per compound unexplained (the wheel allows 10 years), while the Combined row still prints a computed number | logic → DL-35 | PRD-CURVE-40 | DV-158, DV-207 |
| G-73 | 05:D10, 05:G15 | The remembered view is keyed by local row ids (lost after sign-out/sign-in) | bug (SUSPECTED) | PRD-CURVE-50 | DV-159 |
| G-74 | 05:D7 | Journey tile while Premium is unknown routes a payer to the paywall | logic | PRD-JOUR-5; C-22 | DV-154 |

### 6.5 Reminders and notifications
| Gap | Dossier | Description | Kind | PRD / contract | DV |
|---|---|---|---|---|---|
| G-75 | 03:G2, 07 §8 | Reminders are not cancelled when the server confirms the account was deleted or the session revoked | not built → DL-85 | PRD-ACCT-8; C-30 | DV-009 |
| G-76 | 03:G4 | The "Vial expiry alerts" switch also silences "Vial running low" (label must name both; strings ×6) | bug (copy) → AD-26; Approvals item 2.4 | PRD-REM-40 | DV-140 |
| G-77 | 03:G6; verification 03 NEW-1 | A language change does not re-plan scheduled notifications; and the device-language default is never stored, so a user who never picked a language gets every notification, action button and "Nothing new logged" in English (S2) | logic → DL-13 | PRD-REM-6; C-24 | DV-050, DV-196 |
| G-78 | 03:G7 | Creating/editing/deleting a protocol re-plans only its dose reminders (morning summary and vial expiry wait) | logic | PRD-REM-21; C-8, C-9, C-14 | DV-051 |
| G-79 | 03:G8, 03 §8 | A pull bringing doses/protocol changes re-plans only food + weigh-in reminders; resume runs pull and resync concurrently | bug | C-1, C-10, C-31 | DV-052 |
| G-80 | 03:D-8…D-11, 03:G14, 03:G15 | Refresh "OK" even when nothing was rescheduled; the scheduled count is not stored; a refresh that never ran is never flagged; any foreground resync masks the stale signal | bug | PRD-REM-104 | DV-045, DV-046 |
| G-81 | 03:G16 | Only the dose channel is checked; the 20:00 food question and the weigh-in use "Check-in Reminders" (can be silently off); vial channel unchecked | bug | PRD-REM-60; C-27 | DV-098 |
| G-82 | 03:G17 | Android channel names are English literals | bug (i18n) | PRD-REM-8; C-24 | DV-141 |
| G-83 | 03:G18 | iPhone budget overflows the 64 cap at ≥ 23 protocols (no vials), ≥ 21 protocols with ≥ 3 vials, or ≥ 14–15 vials (the vial deduction counts every active vial) | bug | PRD-REM-2 | DV-053 |
| G-84 | 03:G19 | A snoozed vial-expiry copy moves to the check-in channel and keeps the compound name when names are off | bug | PRD-REM-33; C-26 | DV-002 |
| G-85 | 03:G20, 03:D-13 | "Nothing new logged" has no channel and bypasses Silent mode | bug | PRD-REM-32; C-26 | DV-048 |
| G-86 | 03:G27 | The weekly check-in uses a repeating trigger (inexact, dropped under Doze) | bug | PRD-REM-50 | DV-055 |
| G-87 | 03:G28 | `dosetrace_vial_low_sent` and `dosetrace_alert_snooze` survive an intended sign-out | logic | PRD-ACCT-3; C-30 | DV-081 |
| G-88 | 03:G26 | Android onboarding shows the setup step after a denied permission dialog — this matches signed SP-4 ("right after … is answered"; a denial is an answer): not a divergence, nothing to amend (DL-50 withdrawn as moot) | closed | PRD-ONB-10 | — (DV-142 closed) |
| G-89 | 03:D-4, 03:D-14, 03:D-16 | Schedule "OK" when one reminder of many is scheduled; "4 of 4 ready" above "None scheduled"; two "scheduled" counts | bug | PRD-REM-84; C-27 | DV-043, DV-044 |
| G-90 | 03:G10, 03:G11, 03:G12, 03:G13, 03:G31 | Spec/registry drift: EA-3 (superseded by SP-6), SP-1/decision 623 vs SP-10, RG-2 buttons, F-068/L-21, A-04/F-024/L-12, F-067/F-081 "no test" | doc | — | DV-179, DV-176, DV-177 |
| G-91 | 03:G23, 03:G24, A-111 | The 6-hourly refresh needs network (an offline Android phone is covered only by the update/reboot receiver and the 21-day window — the wake push needs network too); the receiver's dependence on a library class name is already pinned by `__tests__/updateRestore.test.js`; post-update re-chain UNVERIFIED on a device | fragility / evidence | PRD-REM-102-104 | DV-099, DV-118 (DV-100 closed: the class-name guard test already exists) |

### 6.6 My Body
| Gap | Dossier | Description | Kind | PRD / contract | DV |
|---|---|---|---|---|---|
| G-92 | 06:D-3, 06:G-3 | Hub "N tests" counts per batch while the journal merges batches; biomarker `created_at` not synced → per-marker count on other devices (suspected root of A-101d) | bug | PRD-BODY-2; C-32 | DV-073 |
| G-93 | 06:D-4 | "Latest" tie-break differs between hub stars, marker screen and export | bug (SUSPECTED) | PRD-BODY-42; C-32 | DV-074 |
| G-94 | 06:D-5 | A favourite stored under an older label cannot be cleared; whole-array writes from a stale read; offline writes silently lost | bug → AD-02 | PRD-BODY-41 | DV-006 |
| G-95 | 06:D-6, 06:G-5 | Labels keyed by date: two tests on one date share labels; moving a value leaves labels behind | logic | PRD-BODY-41; C-32 | DV-075 |
| G-96 | 06:D-11 | Scan path reads a string "1,025" as 1025; the edit path as 1.025 | bug (CONFIRMED in node) | PRD-BODY-50 | DV-076 |
| G-97 | 06:D-12, 06:G-6 | Vaccine scan puts manufacturer/lot/dose #/provider/location into Notes (fields always empty) | logic | PRD-BODY-63 | DV-109 |
| G-98 | 06:G-7 | CSV/PDF export omits vaccine detail fields | logic (P-3 portability) | PRD-BODY-70; C-33 | DV-079 |
| G-99 | 06:G-10, 06:E-3 | A 200 with no usable values is counted (decision: failed extractions not counted) | logic | PRD-BODY-32; C-36 | DV-078 |
| G-100 | 06:D-1, 06:E-6 | A future report date is accepted (hides the Today alert, becomes "latest"; CONFIRMED in node: 2099-01-01 kept) | logic | PRD-BODY-33 | DV-077 |
| G-101 | 06:E-13 | Vaccine PDF read fully before the size check | bug | PRD-BODY-21 | DV-160 |
| G-102 | 06:E-15 | Opening the Next due wheel and closing it untouched sets today | bug | PRD-BODY-61 | DV-160 |
| G-103 | 06:E-16 | A vaccine scan with no cached user after a 200 says "0 vaccines imported" | bug | PRD-BODY-63 | DV-160 |
| G-104 | 06:E-22; verification 01 NEW-D | "Could not read lab values from this PDF" shown for photos; the oversized vial-photo notice reuses "Please choose a PDF under 10 MB." | bug (copy; Approvals item 2.12) | PRD-BODY-31; PRD-PROT-30 | DV-160, DV-201 |
| G-105 | 06:G-14, 06:G-15 | Repo DDL drift (no biomarkers CREATE TABLE; vaccines DDL lacks 5 live columns; unused reference_min/max/status columns must never be filled); stale comments | doc | — | DV-119, DV-181 |

### 6.7 Account, Premium, privacy, platform
| Gap | Dossier | Description | Kind | PRD / contract | DV |
|---|---|---|---|---|---|
| G-106 | 07:D-18, 07:D-19, 08 §11.1 | AI consent stored per device, not wiped on sign-out, not per account, no withdraw | → DL-55 (withdraw row: OPEN-24 item 1; server proof: DL-83) | PRD-AI-4; C-37 | DV-007 |
| G-107 | 07:D-22 | Settings profile save and the analytics switch ignore write errors (an offline save looks saved) | logic | PRD-SET-12 | DV-008 |
| G-108 | 07:D-10 | "What you track" is required by the gate but not editable in Settings | → DL-58 (editor: OPEN-24 item 2) | PRD-SET-11 | DV-113 |
| G-109 | 07:D-7, 07:D-17 | Entitlement cache and per-user keys survive sign-out; a short cross-account window before purchases start on SIGNED_IN | bug (SUSPECTED) | PRD-ACCT-3; C-22, C-30 | DV-082, DV-081 |
| G-110 | 07:D-17 | The food chat draft survives a real sign-out (BK-14 says a real sign-out clears drafts) | bug | PRD-FOOD-5; C-30 | DV-081 |
| G-111 | 07:D-23, 07:D-24 | Download my data omits `user_metadata` (profile, preferences, favourites, labels); Settings does not import first on an empty phone | logic | PRD-SET-41 | DV-086 |
| G-112 | 07:D-21, A-117 | Two privacy-policy texts (in-app vs website); the in-app text (`settings_privacy_body` ×6, "Last updated: April 2026") names only labs and vaccine cards as going to Anthropic — not the AI food log, the protocol assistant or the vial scan (S1 privacy) | not built → DL-81 (one text), AD-72 (covers every AI feature); text ×6: Approvals item 2.7 | PRD-SET-42; PRD-AI-6; PRD-DATA-10; C-37 | DV-085, DV-231 |
| G-113 | 07 §9.6, A-94 | Gates cannot be answered offline and offer no "Sign out anyway" | not built → DL-92 (the button: OPEN-24 item 10) | PRD-GATE-6 | DV-114 |
| G-114 | 07 §9.13; verification 05 | "Continue with Apple" on Android **is live** since 2026-10-03 (`STATE.md:17`; live probe 302 on 2026-10-12; a real Android Apple sign-in is a founder device test not recorded in the repo, AD-30). Remaining: the ship-check Gate B allow-list text lacks `dosetrace://auth-callback`; premium-and-auth.md "Manual setup" step 7 ("today it answers 400") is stale | doc | PRD-AUTH-7 | DV-115 |
| G-115 | 07:D-13, 07:D-15, 07 §6.3 | Dead `BIRTH_YEARS`, dead `authEntry.consent`, double `markSeenOnboarding` | cleanup | — | DV-181 |
| G-116 | 07 §8 | Delete with a lost response reports "offline" while the account is gone; the follow-up sign-out is spurious (no wipe) | bug (SUSPECTED) | PRD-ACCT-7 | DV-009 |
| G-117 | 07:D-17 vs decisions.md:76, :381 | Explainer flags: checked 2026-10-12 — "used" comes from synced data, only "already shown" is per device; consistent, closed | closed | PRD-UI-12; C-39 | — (checked: consistent; DIVERGENCES "Checked and excluded") |
| G-118 | 08 addendum; TRD §3.10 | `reality_checks` has no `updated_at` trigger in production and the client never sends `updated_at`: edits never reach other devices' pulls (CONFIRMED, TRD §3.10) | bug | PRD-DATA-3 | DV-088 |
| G-119 | 08 §11.3 | Core table DDL (profiles, protocols, vials, dose_logs, biomarkers, handle_new_user) not versioned | doc / risk | — | DV-119 |
| G-120 | 08 §11.5 | "Local DB empty" = no protocols → a food/weight-only user runs a full import on every launch | bug | PRD-DATA-1 | DV-120 |
| G-121 | 08 §11.7 | The local-data-owner check skips `vials` | bug (edge) | PRD-ACCT-4 | DV-169 |
| G-122 | 08 §11.9, 07 §7.3 | delete-user omits `ai_assistant_usage`/`profiles` (cascade relied on) and lists a non-existent table | bug (minor) → DL-93 | PRD-DATA-20 | DV-011 |
| G-123 | 08 §11.10 | ErrorBoundary is white with fixed colours in dark mode | bug | PRD-UI-1; C-25 | DV-170 |
| G-124 | 08:D7 | The local-day key formula is copied inline 24 times in 21 files (verification 06) | cleanup / drift risk | PRD-UI-11 | DV-171 |
| G-125 | 08:D9 | Pull-on-Today-focus depends on the paused purge call | fragility | — | DV-172 |
| G-126 | 08 §9; R2-01 | `spec-audit` fails: 31 criteria block a build (BK-1…BK-22, BR-9/10, EA-7, FR-6, RL-1, SP-9, RG-6/7/8); premium-and-auth and admin-panel are unsigned (two warnings, not failures), and fold-right-page's empty `checklist-signed:` line is read as signed (`scripts/spec-audit.cjs:40`); signing the three is Approvals item 7 | evidence / bug | P-10; PRD-DATA-31 | DV-118, DV-229 |
| G-127 | 08 §9 | 184 of 255 test files call `readFileSync`, but only 45 are pure source-text tests; 139 mix regex checks with tests that execute real code; 68 are behaviour-only (verification 06). No test renders a screen; Fold, themes and navigation rely on manual/agent-device passes | evidence (ops / process item) | P-10 | DV-173 |
| G-128 | 01:G-14, 01:G-15, 02:G13, 05:G14, 07 §9.15, 08 §11.11 | Stale docs: APP-HANDOFF (backfill, RLS delete on every table, metadata storage, "3-day trial"), app-map (L-02/L-12/L-13/L-20/L-21/L-34/L-42), registry rows (A-86/A-87/A-89/A-93 "Not started" but built; F-014, F-026, F-039, F-050/F-051, F-057…F-068, F-070, F-072/F-084), the PK memory note | doc | — | DV-176, DV-177, DV-178, DV-180 |
| G-129 | 08 §7.3 | Hard-coded colour sweep: after round 2 only the ErrorBoundary is a defect (G-123). FeatureIcon's `#000000` default is never used (every call passes a colour), the settingsLegacy colours sit on the allowed accent card, and the BodyMapModal figure palette is a declared fixed surface (`screens/components/BodyMapModal.js:94-96`) | check → AD-41 | PRD-UI-1 | DV-170 |
| G-130 | 02:G14, 02:G16 | Spec text stale: FL-33 "under the alerts" (approved order puts the hero after the tracker); book-layout BK-3/BK-16 not marked superseded by A-115 | doc | PRD-TODAY-1, PRD-FOLD-3 | DV-179 |

### 6.8 Fold, AI assistant, release
| Gap | Dossier | Description | Kind | PRD / contract | DV |
|---|---|---|---|---|---|
| G-131 | 02:G15, 03:G30, 01:G-16 | A-116 (every tap / notification opens on the right page) not started | not built (paused 2026-10-12) | PRD-FOLD-4 | DV-117 |
| G-132 | 02:G21, book-layout.md, fold-right-page.md | Device proof missing: FR-6, every BK row, SP-9, RG-8, EA-7, BR-9/10, A-111, A-118, FX-26/27 | evidence | PRD-FOLD-1…10 | DV-118 |
| G-133 | A-91 | The assistant's review card has no dose-time row; a live model run on Test03 (AP-3…6, 429) owed | not built (picture first) | PRD-AI-34 | DV-191 |
| G-134 | 01:G-13 | AP-27 evidence text still describes the removed "log the past doses" backfill | doc | PRD-PROT-61 | DV-179 |
| G-135 | A-90 | Copy items: `cal_tgt_below_range` still says "below the healthy range" although the line states the range, and `ap_err_quota` says "this week" for a rolling 7-day limit; "Check with your supplier…" (`ap_fit_fact_powder`) stays — the founder's own word (AD-75) | copy (Approvals item 2.10) | PRD-AI-36-37, PRD-PROG-60 | DV-192 |
| G-136 | A-95, A-117 | Privacy items: "anonymous" → "not linked" wording, web + in-app policy rewrite, Apple/Play labels, counsel list | not built → DL-84 (wording ×6: Approvals item 2.6; labels: Approvals item 6), DL-81 / AD-72 (one policy text), DL-83 (counsel) | PRD-SET-42-43, PRD-DATA-40-41 | DV-190, DV-085, DV-231, DV-007 |
| G-137 | A-93 | Engineering hardening (forceSync/runExclusive overlap, curve loop bound, vial expiry inside the iOS budget, remote_id indexes, tsc check) — registry says "Not started", parts are built (curve bound 30 × t½, not ~10 as the ledger says) | verify | — | DV-180, DV-118 |

### 6.9 New gaps found by the 2026-10-12 verification (each now has a DV row in DIVERGENCES.md — see the DV column; test first)
| Gap | Source | Description | Kind | PRD / contract | DV |
|---|---|---|---|---|---|
| G-138 | verification 05 O-1; `STATE.md:17`; PA-123 | The Apple web client secret behind Android Apple sign-in expires **2027-04-04**; when it lapses every Android Apple sign-in fails at the token exchange (the button still shows: the probe checks only `/authorize`). Needs a dated reminder and regeneration (`scripts/apple-client-secret.cjs`) | risk (ops item; the founder's console step, Approvals item 5) | PRD-AUTH-7a | DV-211 |
| G-139 | verification 01 NEW-A | An oral protocol with its dose in IU is blocked at step 3 and at Save with a unit mismatch (`unitsOk` compares the concentration unit, default mg, with the dose unit; orals never set one) | bug | PRD-PROT-15 | DV-198 |
| G-140 | verification 01 NEW-B | After a ready-to-use "New vial" (same row reset) that vial's "running low" push never fires again (`vialLowToSend` keeps the sent flag while the id stays active) | bug | PRD-VIAL-22; C-15 | DV-199 |
| G-141 | verification 01 NEW-C | A ready-to-use vial reads "Past window" from 00:00 on the last day of its box month (`Math.ceil` of a negative fraction = −0 ≤ 0) | bug | PRD-VIAL-30; C-16 | DV-200 |
| G-142 | verification 02 #3 | "Still going?" checks only three popup flags (not the vial prompt, Skip sheet or Today sheet), and the orphan sheet runs in the same focus: two popups can open together | bug | PRD-TODAY-3 | DV-202 |
| G-143 | verification 02 #4 | "Longest unused in your log" reads only the last 30 days of logs; a site used 40 days ago reads "not in your log yet" | bug (copy must be true) | PRD-DOSE-13 | DV-203 |
| G-144 | verification 02 (PRD-DOSE-1) | The Dose log falls back to a plain outcome flip on an ended protocol (`LogScreen.js:146`; no cap, no bottle update; "paused" does not exist and deleted rows are hidden) — an exception to the one mark-complete path | bug → DL-76 | PRD-DOSE-1; C-1 | DV-204 |
| G-145 | verification 02 (PRD-TODAY-36) | The streak and week circles update at once (`fetchStreakData()`, `TodayScreen.js:887`), before the 360 ms landing | bug (polish) | PRD-TODAY-36 | DV-220 |
| G-146 | verification 03 NEW-2 | The 20:00 notification "Log it" carries no day (`foodTapParams` returns `{ logIt: nowMs }`): after midnight it logs onto today, not the evening it asked about | bug (S2) | PRD-REM-60; 4.5 entry points | DV-197 |
| G-147 | verification 03 NEW-3 | An unreadable notification permission (`null`) is treated as a block, against "only what the app can read can block" | bug (S4) | PRD-REM-82 | DV-214 |
| G-148 | verification 03 NEW-4 | The day-21 weigh-in reminder has no switch of its own ("Check-in reminders" does not gate it; only Silent stops it) — now documented here (PRD-REM-51, PRD-REM-110); the register row is narrowed to flow 06, which still lacks it | doc (flow 06) | PRD-REM-51, PRD-REM-110 | DV-218 |
| G-149 | verification 04 N-1 | The reality-check Stop link is also offered with no check open (result view, locked branch) and one tap tombstones the whole measured history | bug (S2; S1 if OPEN-08 is answered A) → OPEN-08 | PRD-RC-60; L-4; C-20 | DV-004 (extended) |
| G-150 | verification 04 N-2 | `cal_rc_implausible` always says the result is implausibly **low** ("intake was higher than remembered"), also for a high result (e.g. 5,600 kcal) | bug (copy, S2) | PRD-RC-50 | DV-205 |
| G-151 | verification 01 (PRD-PROT-105); R2-03 #16 | The Delete-forever blanking trigger does not blank interval_days, doses_per_day, concentration_unit or divisible; what may stay is only the identity the founder-approved migration defines (id, user_id, type, colour, timestamps, deleted_at, purged_at — AD-67; decisions.md:552, :556; the coordinator's narrower list at :540 is not the authority) | bug (S3; the wider blanking is a production go, Approvals item 1) | PRD-PROT-105; PRD-DATA-21; C-12 | DV-221 |
| G-152 | verification 07 K-07; 01 (PRD-PROT-100) | The Ended-row delete does not dismiss delivered banners or deactivate vials (the page delete does) | bug (low risk) | PRD-PROT-100; C-12 | DV-216 |
| G-153 | verification 07 X-09 | AI food parse caps: the code's 25 follow-up cap and 60 / 24 h ceiling have no ledger line (decisions.md:251 says follow-ups don't count) | → OPEN-18 (3) | PRD-FOOD-51; §1.5.1 | DV-213 |
| G-154 | verification 05 O-6 | Account deletion leaves the RevenueCat customer (app user id = Supabase uid, purchase history); no doc treats it as a deletion / privacy item | counsel → DL-83 | PRD-ACCT-5; PRD-DATA-20 | DV-219 |
| G-155 | verification 06 (H-1, S3-14, S3-31); R2-03 #21 | Deletes of non-protocol rows never reach a device that holds the row; for `dose_logs` that device's later edit re-inserts the row into the cloud and the deleting phone gets it back (health-record case); a weigh-in edited there comes back by design (DL-90); the vial re-insert is not reachable in 1.3.0 (vials are deleted only by Delete forever, and the cloud refuses a vial on a purged protocol). A two-device delete test with the stock harness fails today — no test asserts it | bug (S1 data integrity) → shipped per OPEN-16 (b) | PRD-DATA-3; P-4 | DV-182 (extended) |

### 6.10 Register rows reached from this PRD in verification round 2 (every remaining DIVERGENCES.md row; test first)
Rows of `DIVERGENCES.md` that no earlier gap row pointed to. Source = the first sources of the DV row; the DV row holds the full evidence, fix and failing test.

| Gap | Source | Description | Kind | PRD / contract | DV |
|---|---|---|---|---|---|
| G-156 | verification round 2 R2-06 M-1 (harness reproduced twice) | A phone's own push moves its pull watermark past another phone's rows: the watermark is the newest `updated_at` among this phone's synced rows, `markSynced` stamps its own pushed rows with the cloud time, and every pass pushes before it pulls — so rows another phone pushed earlier into that table are skipped for good (a dose, meal, weigh-in or lab value never reaches the other phone) | bug (S1) → shipped per OPEN-16 (b) (client only) | PRD-DATA-1; C-31 | DV-222 |
| G-157 | verification 06 (most important error 4) | The pull watermark is set by `now()` at transaction START: a row whose transaction commits after another that started later is never fetched by a phone that pulled in between | bug (S1) → shipped per OPEN-16 (b) (the server change is a production go, Approvals item 1) | PRD-DATA-1; C-31 | DV-209 |
| G-158 | verification 06 (most important error 3) | Offset paging with no `id` tie-break (`lib/sync.js:140-157`) can skip a row for good when rows move between pages or share one `updated_at`; the same paging feeds the full-import absence-delete, which can then delete a live local row | bug (S1) → shipped per OPEN-16 (b) (client only) | PRD-DATA-1, PRD-DATA-4; C-31 | DV-210 |
| G-159 | TRD §3.9 H-3, §3.6 | Every push sends the whole row and absolute counters (`vials.doses_taken`, `protocols.units_taken`): two doses logged offline on two phones leave the vial or bottle counter one short (both Dose-log rows exist), and a field edited on one phone can be reverted by the other's next push | bug (S1) → shipped per OPEN-16 (b) (DL-74 withdrawn) | PRD-DATA-3, PRD-DATA-5, PRD-VIAL-10; C-31 | DV-183 |
| G-160 | TRD §1.4, R-32 | Android headless "Mark complete" (app closed): the database is marked ready even when it failed to open, the claim key is stored before the write, and a failed write is swallowed while the banner is dismissed — a dose the user pressed may not be written | bug (S1) | PRD-REM-30, PRD-REM-32; C-1 | DV-184 |
| G-161 | verification round 2 R2-06 N-4 | The food chat's own "Remove" pill on a refused or too-old row deletes the row (the user's typed text) without asking, while the same screen's `confirmRemove` asks | bug (S1) → AD-01 (every delete asks first) | PRD-FOOD-50; C-19 | DV-226 |
| G-162 | 01:D-12, 01:G-8 | An rtu vial that runs out is set inactive and its "New vial" needs an active vial with doses taken; Today's vial prompt is recon-only; rtu "New vial" resets the same row and keeps the old box's expiry | bug → DL-22 (an empty rtu vial can be replaced, as a new row); asking the new box's date → OPEN-01 | PRD-VIAL-41, PRD-VIAL-42; C-14 | DV-027 |
| G-163 | verification round 2 R2-06 N-1 | Editing a ready-to-use protocol's dose recomputes `total_doses = vial ÷ new dose` (`lib/protocolForm.js:167-187`) and ignores the doses already taken (10 mg vial at 1 mg, 4 taken, edited to 0.5 mg → 16 left instead of 12) | bug → DL-15 | PRD-PROT-72; C-9 | DV-223 |
| G-164 | verification round 2 R2-03 #4 (PRD-PROT-19) | Editing a protocol whose interval is 2–7, 10 or 14 days opens Custom with an EMPTY "Every _ days" field showing the grey placeholder 14 (`formFromProtocol` fills it only for intervals outside `PRESET_INTERVALS`, `lib/protocolForm.js:16`, `:94`) | bug → AD-66 (Every day / Custom with a typed N; no presets) | PRD-PROT-19, PRD-PROT-70; C-9 | DV-230 |
| G-165 | verification round 2 R2-05 (05:146, H5-F7) | Restart with "Continue the same vial" moves the old vial to the new run and sets it active even when it was finished by doses (`lib/protocolEnd.js:153-155`) | bug → DL-20 (an empty vial is never reopened) | PRD-PROT-91; C-11 | DV-236 |
| G-166 | 01:G-11 | The free-limit sheet says "Start free trial" without asking the store whether this person is eligible (the paywall asks) | bug → AD-49 (the 7-day trial) + DL-82 (claimed only when eligible) | PRD-PROT-11, PRD-PREM-5 | DV-126 |
| G-167 | 02:D17 (report part), 02:G10; 02:D14, 02:D18 | The adherence report's streak counts calendar days with any Complete row (schedule-blind) while the card counts doses; three "adherence" numbers and two meanings of "missed" (week circle vs Missed rows) | bug → DL-02 (the report line ×6: Approvals item 2.3) | PRD-SET-40, PRD-TODAY-34; C-5 | DV-032, DV-033 |
| G-168 | verification round 2 R2-06 N-5 | Dose log "Missed → Complete" on a day already at its daily cap does nothing and says nothing (`recordDoseTaken` returns `{alreadyLogged}`, treated as success, `LogScreen.js:143-150`); Today shows the refusal in the same case | bug → DL-76 | PRD-LOG-3, PRD-DOSE-2; C-1 | DV-227 |
| G-169 | verification round 2 R2-01 (a side defect found under OPEN-19 (d)) | After "Didn't take" on yesterday's pending dose the Undo bar says "Dose logged" (the skip record carries no text, `TodayScreen.js:710-717`) | bug | PRD-DOSE-22, PRD-DOSE-30; C-2 | DV-228 |
| G-170 | 03:D-1, 03:D-2 | Today's "blocked" card ignores Silent mode, so Blocked and Silent can show together | bug → AD-25, DL-45 (Silent is never "blocked"); Settings as signed (AD-71) | PRD-REM-84, PRD-TODAY-58; C-26 | DV-042 |
| G-171 | 03:D-12 | Standalone schedulers (protocol create / edit, snooze) use the cached Silent flag: a Silent change on another phone applies only at the next full resync, and the cached session can be stale even then | bug | PRD-REM-111; C-26 | DV-047 |
| G-172 | 03:G3 | Settings says persistent reminders repeat "every 5 min until acknowledged"; the code sends exactly two repeats (+5, +10) | copy → DL-48 (wording ×6: Approvals item 2.2) | PRD-REM-14; C-26 | DV-049 |
| G-173 | verification round 2 R2-05 (F07-18) | On the unfolded Fold, the Journey food hero on the left page keeps the old line after a meal is sent from the chat on the right (`FoodLogHero` reloads only on focus) | bug → DL-98 | PRD-FOLD-8; C-19 | DV-238 |
| G-174 | 05:E4, 05:G13 (registry F-051 "F2") | The curve applies the protocol's current dose, interval, start and doses per day to every past dose: an edit rewrites the past estimate (a derived estimate; the Dose log rows are intact) | → OPEN-10 | PRD-CURVE-13; C-9 | DV-005 |
| G-175 | 05:D6, 05:G9 | The curve places doses at fixed hours (12:00; 06/18 …), not at the user's reminder times; an end-day dose can be drawn after the end; disclosed nowhere | → DL-31 | PRD-CURVE-11 | DV-069 |
| G-176 | 05:E5, 05:G13 (registry A-31) | Skipped and Missed doses still count in the curve (schedule-driven, disclosed) | → OPEN-11 | PRD-CURVE-12; C-1 | DV-072 |
| G-177 | 06:E-7, 06:E-8 | The marker chart puts mixed units of one marker on one axis and spaces points by index, not by date | → DL-43 (the chart picture: OPEN-24 item 4) | PRD-BODY-42 | DV-080 |
| G-178 | verification round 2 R2-05 (13:213), R2-03 #9 | A Premium user with an empty lab journal reads "…You get 3 free scans a month…" (`blood_empty_sub`, `BodyScreen.js:1115-1120`, no Premium check) | bug → AD-69 (wording ×6: Approvals item 2.17) | PRD-BODY-12, PRD-AI-13; C-36 | DV-237 |
| G-179 | 07:D-16, 07:G8 | Offline cold start with an expired access token: the session is stored but the app routes to Auth / Onboarding | bug → DL-54 (offline with a stored session = signed in) | 4.1 edge cases; C-30 | DV-083 |
| G-180 | TRD §3.8 F-8, H-11 | A first INSERT carries no client-generated id; a lost response leaves the row pending and it is inserted twice (a dose, meal or weigh-in double-counted on other phones) | bug | PRD-DATA-1; C-31 | DV-185 |
| G-181 | verification round 2 R2-06 (split from DV-119, DR-7) | A local value the cloud column type rejects (protocol numbers and dates stored as text) leaves the row pending forever, retried on every pass | bug | PRD-DATA-1; C-31 | DV-241 |
| G-182 | 03:G25, 07:§8 ("Not now") | The app calls the notification-permission request at every signed-in cold start, at sign-in and inside the push-token registration, ignoring "Not now" (the OS dialog itself shows only while undecided) | → OPEN-20 (b) (AD-27 moved there) | PRD-REM-120 | DV-054 |
| G-183 | 01:G-1 (registry A-85) | No deliberate "End protocol" on the protocol page; "Protocol finished" on the empty-vial prompt only closes it; `endProtocol` has no caller | not built → AD-11 (in 1.3.0; the End + "Later" picture is owed, Approvals item 3) | PRD-PROT-82, PRD-DOSE-40; C-10 | DV-090 |
| G-184 | 01:D-15, 01:G-19 (oral part) | Oral bottles have no supply-low warning anywhere (no alert, push, hero line or tag) | → OPEN-02 | PRD-VIAL-43, PRD-TODAY-55; C-15 | DV-092 |
| G-185 | 01:D-12b, 01:G-7 (recon part; 01:G-9, 01:G-7 (doses-used part) | Powder users cannot start a new vial from My Protocols (Today offers it only when the vial is finished or absent); the mix date, validity window and capacity cannot be edited after creation; no "doses already used" for a part-used vial | → OPEN-01 | PRD-VIAL-42, PRD-PROT-72; C-9, C-14 | DV-093, DV-094 |
| G-186 | 01:D-22, 01:G-26 | The 3-protocol free limit is checked only on this phone at add / restart / restore; a protocol that arrives by sync, was created while Premium or is revived is never checked; a lapsed payer keeps every active protocol | → OPEN-05 (DL-24 withdrawn) | PRD-PROT-11, PRD-PREM-13; C-22 | DV-095 |
| G-187 | 03:G1 | iPhone has no background refresh: if the app is not opened, dose reminders end after the 10-day window (summary and food after 7), with no warning | → OPEN-06 | PRD-REM-105 | DV-097 |
| G-188 | 04:§8.10, 04:§5.1 (ready-unsavable) | A check whose result is maintenance, implausible or too short is never saved and never closes; the 8 PM question and the alert continue until Stop | → OPEN-09 | PRD-RC-50, PRD-RC-53; C-20 | DV-104 |
| G-189 | 05:E8, 05:G13 (registry A-15 | Testosterone Enanthate and Nandrolone Decanoate are drawn with instant absorption | → DL-37 (a time-to-peak only with a published source) | PRD-CURVE-14 | DV-106 |
| G-190 | 06:D-7, 06:G-8 | Free users see the monthly scan limit only before their first scan that yields lab values; nobody sees how many scans are used or left; a whole test's date cannot be changed | → OPEN-14 (b), (c) · AD-69 | PRD-AI-13, PRD-BODY-12, PRD-BODY-53; C-36 | DV-110 |
| G-191 | 06:G-13 | "Bloodwork due" is a fixed 6-month interval chosen by the app | → OPEN-13 | PRD-TODAY-57 | DV-111 |
| G-192 | 07:D-8, 07:D-9 | Settings has no Manage subscription; the app cannot show a store trial or a billing problem | → OPEN-15 | PRD-SET-61, PRD-PREM-12 | DV-112 |
| G-193 | 07:G17 | Reinstall behaviour is unspecified (the iOS Keychain may keep the session while AsyncStorage is empty; Android `allowBackup="false"`) | → DL-63 | 4.1 edge cases | DV-116 |
| G-194 | 04:§6.6 | A measured daily burn is hidden on the Progress hero and the Journey tile when height, age or sex is missing, while the result view still prints it | → OPEN-22 (a) (AD-45 moved there; DL-75 withdrawn) | PRD-PROG-14, PRD-JOUR-3 | DV-149 |
| G-195 | TRD §3.8 F-7, H-6 | A `requestSync` during a running pass gets the running promise and no follow-up pass is queued: a row written after its table was pushed waits for the next trigger | bug | PRD-DATA-1; C-31 | DV-187 |
| G-196 | verification round 2 R2-06 N-2 | Snoozing a persistent dose reminder does not stop its +5 / +10 repeats once a resync runs inside the snooze (`scheduleDoseReminder` never reads the snooze list) | bug | PRD-REM-14, PRD-REM-33 | DV-224 |
| G-197 | verification round 2 R2-06 N-3 | Turning off "Vial alerts" or "Check-in reminders" leaves their already-snoozed copies scheduled | bug | PRD-REM-110; C-26 | DV-225 |
| G-198 | verification round 2 R2-03 #7 (PRD-FOOD-20) | Food totals per week and for the whole window (decisions.md:250, signed FL-24) are no longer shown: `nutri_tot_week` / `nutri_tot_window` have no caller since Journey part 8 replaced the Totals card | → OPEN-18 (9) | PRD-FOOD-20; C-19 | DV-232 |
| G-199 | verification round 2 R2-01 (OPEN-18 item 6, closed → AD-74) | "Continue with Apple" on Android draws its own glyph (`screens/AuthScreen.js:65-73`) instead of Apple's official artwork | → AD-74 (the download go: Approvals item 4) | PRD-AUTH-7 | DV-239 |
| G-200 | verification round 2 R2-03 #13 (PRD-AI-37) | The protocol assistant's server enforces 40 answers per conversation, a 24-hour conversation life and 200 answers per rolling 24 h (`budget.ts:10-12`) that the signed AP-18 does not have; reaching them shows only "The AI isn't available right now" | → OPEN-18 (3) | PRD-AI-37; §1.5.1 | DV-240 |
| G-201 | 01:G-23 (registry A-84) | The automatic purge of Recently deleted is paused; it keeps everything until "Delete forever" | → DL-94 (paused through 1.3.0) · OPEN-04 (after 1.3.0) | PRD-PROT-106 | DV-125 |
| G-202 | 01:G-18 | A half-filled new protocol lives in screen state; an app kill loses it | → DL-97 | PRD-PROT-23 | DV-127 |
| G-203 | 02:D11 | `cardSlot` treats a Missed row as filled; `cardPlan` treats it as open (no effect today: today is never scanned) | bug (hygiene) | PRD-TODAY-23 | DV-128 |
| G-204 | 02:D10 | A skipped slot keeps the protocol in today's cards; "All caught up" never shows on a day with a skip | → DL-12 (picture: OPEN-24 item 12) | PRD-TODAY-26; C-2 | DV-129 |
| G-205 | 02:G9 (decisions Conflict 22) | A grey "reminder" tag shows before "Due" | → AD-38 (only "Due") | PRD-TODAY-24 | DV-131 |
| G-206 | 02:D20, 02:G7 (decisions Conflict 23 | Ring animation code drives values nothing renders; the tracker gauge is static; no day-complete pulse; whether the curve intro replays on every open is the other half of Conflict 40 | → OPEN-18 (4) (AD-44 moved there) | PRD-TODAY-30, PRD-CURVE-25, PRD-UI-7 | DV-132 |
| G-207 | 02:G4 | The ring rule says "as-needed doses are excluded"; the app has no as-needed concept | → DL-65 (a note, no code) | PRD-TODAY-31 | DV-133 |
| G-208 | 02:§8 (iOS cold start) | The notification action clears the last response while `App.js` reads it for routing (race on a cold-start tap) | bug | PRD-REM-17 | DV-136 |
| G-209 | 02:G18 | An unanswered injectable "Mark complete" lives only on the device (not synced) and is cleared on sign-out | as decided → AD-34 | PRD-DOSE-12; C-7 | DV-137 |
| G-210 | 03:D-5 | `shouldWarnLate` re-implements `remindersMatter` inline | bug (hygiene) | PRD-REM-84 | DV-138 |
| G-211 | 03:D-17 | "Next reminder" ignores snoozed copies, follow-ups, the morning summary and food reminders | bug | PRD-REM-81 | DV-139 |
| G-212 | 03:G33 | The foreground handler uses the legacy `shouldShowAlert` key (it still works on expo-notifications 0.32.16; a deprecation warning only) | bug (hygiene) | PRD-REM-1 | DV-143 |
| G-213 | 03:G29 (registry A-24) | The registry question "does saving a reality check early end the 8 PM reminder?" (A-24) is still open | → OPEN-07 (DL-51 withdrawn) | PRD-REM-60 | DV-144 |
| G-214 | 05:G10 | decisions.md:205 says blend component lines are dashed; the code draws them like any compound (solid past, dashed future) | → OPEN-18 (1) (DL-32 withdrawn) | PRD-CURVE-3 | DV-156 |
| G-215 | 05:G11 | The journey-dashboard plan's second fallback ("compound of the most recent Taken dose") is not built | → DL-36 (the newest protocol stays the fallback; the plan is amended) | PRD-CURVE-50 | DV-157 |
| G-216 | 06:G-11 | No vaccine due reminder or Today alert | as decided → DL-44 | PRD-BODY-64 | DV-161 |
| G-217 | 07:D-11 | The profile gate checks presence, not validity (an old `birth_year: "abc"` passes) | bug | PRD-GATE-1 | DV-162 |
| G-218 | 07:D-14 | Someone who typed answers and then chose "Sign in" lands back on onboarding after a restart | → DL-59 | PRD-AUTH-2 | DV-163 |
| G-219 | 07:D-6, 07:G12 | "Trial" means the 7 free food-log days in code and the store's intro offer on the paywall | copy → DL-61 (wording ×6: Approvals item 2.14) | §0.4 glossary; PRD-FOOD-60 | DV-164 |
| G-220 | 07:D-1 | RevenueCat unreachable: the server grants the Premium scan budget while the client uses its cache | as decided → AD-36 | PRD-AI-10 | DV-165 |
| G-221 | 07:D-5 | Right after a purchase the purchase result and the entitlement helper can briefly disagree (handled by `purchaseOutcome`) | bug (handled) | PRD-PREM-6; C-22 | DV-166 |
| G-222 | 07:G18 | Analytics events are dropped while signed out, so the onboarding funnel misses every email sign-up that needs confirmation | as decided → DL-62 (no analytics before sign-in for now) | PRD-SET-43 | DV-167 |
| G-223 | 07:G19 | The 18+ test uses the birth year only (someone born in December of this year − 18 passes at 17) | as decided → AD-43 (the floor uses the typed birth year) | PRD-ONB-6, PRD-DATA-40 | DV-168 |
| G-224 | 08:G16 | `STATE.md` is tracked in git (no secret found on 2026-10-12) | hygiene | PRD-DATA-13 | DV-174 |
| G-225 | 02:G1 (decisions Conflict 20, resolved line 459) | decisions.md:459 says site questions are let go after 7 days; the code, its test and the founder's S-25 line say never dropped for age | doc → AD-76 (was DL-01) | PRD-DOSE-12; C-7 | DV-175 |
| G-226 | decisions.md Conflict 27 | The PT name of the Dose log is still "Registro"; the approved translation block named it "Histórico" | copy → AD-59 | PRD-LOG-1 | DV-193 |
| G-227 | flows D13-9 | Two Paywall entry points navigate without a `source` (`CalculatorSection.js:1148`, `FoodChatScreen.js:720`) | bug (analytics) | 4.10 entry points | DV-195 |
| G-228 | verification 03 NEW-5 | PT and ES mix the reminder terms ("avisos de dose" / "Los avisos de dosis" while every other string says "lembretes" / "recordatorios") | copy (Approvals item 2.13) | §1.6; P-6 | DV-215 |
| G-229 | verification 01 (coordinator summary 2) | Restart shows the duplicate warning and the container question before it checks the free limit (`ProtocolsScreen.js:1253-1290`): a free user with 3 active picks a container and only then sees "Protocol limit reached" | bug (check the limit first) | PRD-PROT-90; C-11; L-3 | DV-217 |
| G-230 | verification round 2 R2-03 #6 (PRD-UI-6) | Error sheets break two founder sheet rules: the paywall, sign-in, reset-password, onboarding, email-link and 18+ error sheets use the circle `alert` glyph, and several are titled only "Error" | bug (titles ×6: Approvals item 2.16) | PRD-UI-6; P-17 | DV-233 |
| G-231 | verification round 2 R2-03 #24 (PRD-UI-5) | On Android the curve's "Other date" and the past-weigh-in date use the DTWheel sheet, while the founder's line keeps Android's native dialogs for both (decisions.md:48) | bug | PRD-UI-5; P-17; §1.4 | DV-234 |
| G-232 | verification round 2 R2-03 #52 (PRD-UI-10) | "(s)" plurals: `blood_dropped_sub` "value(s)" and `paywall_start_trial_months` (ES "mes(es)", DE "Monat(e)", IT "mese/i") | copy (Approvals item 2.15) | PRD-UI-10 | DV-235 |
| G-233 | TRD §2.3 DR-4, R-25 | `parse-food-next` is still deployed in production although the founder said to remove it (decisions.md:513) | ops item → AD-63 (go given, still to do: Approvals item 1) | PRD-AI-5, PRD-FOOD-17 | DV-188 |

---
## 7. Founder decisions — see OPEN-DECISIONS.md

This PRD keeps no question list of its own. The single list of founder questions for the PRD / TRD / flows round is `docs/product/OPEN-DECISIONS.md`: **23 OPEN questions** after verification round 2 (OPEN-01…OPEN-11, OPEN-13…OPEN-24; OPEN-12 closed → AD-68; parts of OPEN-14, OPEN-18, OPEN-19, OPEN-20 and OPEN-21 closed by an AD or DL), the founder actions that are not questions ("Approvals still owed", 9 items), 62 decisions already taken by the ledger or a signed spec (AD) and 84 decided by product logic (DL; recorded in `docs/decisions.md`, 2026-10-12 sections; the founder may override any DL), with a Portuguese message ready to send as one round. Every question this chapter used to hold (the former PRD question list of the 2026-10-12 draft, numbered 1 to 69) is mapped there to its canonical id ("Where every earlier question went"); the final status of every id that moved is in `docs/product/verification/round2/id-map.md`. Every marker in this PRD uses the canonical ids (§0.3).

---
## Appendix A — Sources read for this PRD

| Source | What it gave | Note |
|---|---|---|
| `docs/decisions.md` (765 lines on 2026-10-12: ledger compiled 2026-10-03, appended to 2026-10-12 incl. the round-2 status section) | every founder decision with its date; the open conflicts (#1–#42) and their resolutions | the authority on behaviour |
| `docs/product/research/01-protocols.md` | protocols, vials, supply, end/restart/delete, state ownership D-01…D-23, gaps G-1…G-27 | |
| `docs/product/research/02-doses-today.md` | Today, marking doses, site question, pending, Missed, Dose log, rings, alerts, D1…D26, G1…G21 | script-verified divergences D1-D4, D6-D7 |
| `docs/product/research/03-reminders.md` | every notification type, reminder health, background refresh, D-1…D-19, G1…G33 | |
| `docs/product/research/04-food-reality-progress.md` | food log, access, reality check, Progress, weigh-ins, D-1…D-16, G-1…G-16 | |
| `docs/product/research/05-curve-journey.md` | the PK model, the curve screen, the Journey dashboard, D1…D10, G1…G17 | |
| `docs/product/research/06-my-body.md` | labs, vaccines, scans, hub, D-1…D-12, G-1…G-17 | |
| `docs/product/research/07-onboarding-account-premium.md` | routing, onboarding, auth, gates, sign-out, delete, entitlement, D-1…D-24, gaps 1–19 | |
| `docs/product/research/08-platform.md` | architecture, data model, sync, storage, native pieces, i18n, theme, tests, release, D1…D9, risks 1–16 | |
| `docs/specs/*.md` | signed checklists: food-log (FL-1…48), progress-one-card (PO-1…26), my-body (MB-1…31), premium-and-auth (PA-1…128, unsigned), ai-protocol-assistant (AP-0…35), book-layout (BK-1…22), fold-right-page (FR-1…6, unsigned), reminder-check (RC-1…8), exact-alarms (EA-1…7), background-refresh (BR-1…12), reminders-guaranteed (RG-1…8), reminder-setup-placement (SP-1…10), fixes-1.2.5 (FX-1…29), release-1.2.5 (RL-1…6), admin-panel (unsigned) | |
| `docs/product/OPEN-DECISIONS.md`, `docs/product/DIVERGENCES.md`, `docs/product/verification/` (round 1) and `docs/product/verification/round2/` (round 2, `id-map.md`) | the single founder-question list, the defect register, and both verification rounds with the final status of every id | the source of every OPEN / AD / DL / DV id cited here |
| `docs/review/features.md` | the registry (F-001…F-092, A-01…A-118, S-01…S-26 and their "do not re-ask" decisions) | several rows stale (G-128) |
| `CLAUDE.md` | standing rules (data, themes, translation, AI hard line, release) | |
| `docs/APP-HANDOFF.md` | background only — stale in places (G-128) | |
| `docs/design/prototype.html` | the approved visual ("Sam Carter" version) — referenced, not transcribed | binding for look, order, behaviour |
| Code (read-only, to confirm facts the dossiers did not quote) | `lib/paywallPlans.js` (Free vs Premium rows), `i18n/translations.js` (row labels, FL-48 link text), `lib/profileGoals.js` (18 goals), `screens/OnboardingFlowScreen.js` (tracking types), `lib/activityLevels.js` (5 levels) | no code changed |

## Appendix B — What this PRD deliberately does not decide
- Architecture, data model, the single owner function of each derived state, and the sync design → `docs/product/TRD.md`.
- Pictures of any layout → founder-approved artifacts (P-9); this PRD never replaces a picture.
- Wording in the six languages → every new or changed string needs founder approval in all 6 (decisions.md:85); requirements here quote English for reference.
- Founder questions → `docs/product/OPEN-DECISIONS.md` (the only list).

## Appendix C — Sign-off
| Role | Name | Date | Notes |
|---|---|---|---|
| Founder (product owner) | | | Review §2 principles, §5 contracts, the OPEN questions in OPEN-DECISIONS.md; `[logic]` items to be recorded in `docs/decisions.md` |
| Spec-auditor (independent) | | | Checks §4 requirements against the code with no builder summary |
