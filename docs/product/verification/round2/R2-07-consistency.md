# R2-07 — Cross-document consistency, round 2 (independent verifier)

- Date: 2026-10-12. Branch `redesign/graduated`, HEAD `19e4ebc`. Read-only: this report is the only file written.
- Scope: `docs/product/README.md`, `PRD.md`, `TRD.md`, `DIVERGENCES.md`, `OPEN-DECISIONS.md` (OD), `flows/README.md` + `01…14`, `research/01…08`, `docs/decisions.md` (the ledger) and the Portuguese picture `docs/design/fluxos-dosetrace.html` (the picture). The four parallel round-1 correction passes were checked against each other.
- Method: every count recomputed by script from the source tables (DV rows parsed per section, severity and domain; AD / DL / OPEN rows; PRD requirement bullets, G-rows, C-sections; flow acceptance-check headers; mermaid blocks; migration and test files); every withdrawn / moved ID grepped in every file; 45 cross-cutting topics read in every document; every round-1 item of `verification/07-consistency.md` re-checked; markdown tables checked for cell counts (lenient = pipes inside code spans ignored, and strict GFM).
- Severity (same scale as round 1): **S1** the founder is told something untrue, or a builder following one doc would build the opposite of the decision / recommendation; **S2** two documents disagree on behaviour or status; **S3** stale wording, citation or cross-reference; **S4** formatting, hygiene.

**Totals: 39 findings — 2 S1, 16 S2, 15 S3, 6 S4.** Round-1 (07) items: 49 of 58 resolved (several with residue in a file another agent did not touch), 8 partly resolved, 1 still open (section 4).

The pattern: OPEN-DECISIONS, DIVERGENCES and most of the PRD were moved to the reclassified IDs; the **picture**, **flows §12 / README crosswalk**, the **TRD §9 decision column** and the **ledger's own 2026-10-12 section** were corrected by different agents against the round-1 report, not against the final OD, so they still carry the pre-reclassification state (AD-27 "to be re-classified as DL", DL-22 recon, DL-45 Settings half, AD-35, AD-29, AD-04, DL-73, AD-45, AD-44, DL-16, DL-50).

---

## 1. Numbers — stated vs recounted

| # | Place (file:line) | Stated | Recounted from source | Verdict |
|---|---|---|---|---|
| N-1 | OPEN-DECISIONS.md:10 | 21 OPEN, 54 AD in force, 65 DL in force; 11 AD moved out, 4 narrowed; 10 DL out, 5 narrowed | OPEN-01…21 = 21; AD-01…65 minus 11 moved (04,10,27,29,35,44,45,46,50,54,56) = 54; narrowed AD-07/09/11/61 = 4; DL-01…75 minus 10 (16,24,32,50,51,66,67,72,73,74) = 65; narrowed DL-03/06/08/22/45 = 5 | OK |
| N-2 | OPEN-DECISIONS.md:642–644 (PT) | 54 / 65 / 21 | as N-1 | OK |
| N-3 | OPEN-DECISIONS.md:646 (PT) | 26 items back to the founder (list of 14 AD + 12 DL) | Reclassified table :298–330: 14 AD (incl. AD-07 narrowed) + 12 DL = 26 | OK |
| N-4 | **OPEN-DECISIONS.md:22 (OPEN-16 context, EN)** | **216 open rows (14 S1, 94 S2, 37 S3, 71 S4)** | 218 live rows: **15 S1, 94 S2, 37 S3, 72 S4** (DV-100, 142, 194 closed) | **WRONG** (R2-03) |
| N-5 | OPEN-DECISIONS.md:641, :653 (PT) | 218 (15 / 94 / 37 / 72) | 218 (15 / 94 / 37 / 72) | OK — EN and PT of the same question disagree |
| N-6 | DIVERGENCES.md:43–54 (Summary) | per domain; total 15 / 94 / 37 / 72 = 218 | identical per domain (FOOD S4 = 6 only if DV-150, whose row is broken, is counted — R2-26) | OK |
| N-7 | DIVERGENCES.md:59 | +26 rows DV-196…221 (S1 4, S2 13, S3 1, S4 8) | 26; S1 DV-206/209/210/221; S2 13; S3 DV-213; S4 8 | OK |
| N-8 | DIVERGENCES.md:56 | +14 rows DV-182…195 | 14 issued, 13 live (DV-194 closed) | OK |
| N-9 | DIVERGENCES.md:66 | 43 rows need a founder answer, 13 through OPEN-21 | 43 rows cite OPEN-xx; 13 cite OPEN-21 | OK |
| N-10 | DIVERGENCES.md:5, :60 | 3 rows closed | DV-100, DV-142, DV-194 | OK |
| N-11 | PRD.md:43–44 (Contents), §5, §6 | C-1…C-40, G-1…G-155, P-1…P-30, L-1…L-11 | 40 C-sections; 155 G-rows (no gap, no duplicate); P-30; L-11 | OK |
| N-12 | PRD.md:6 | 18 new gap rows G-138…G-155 | 18 | OK |
| N-13 | PRD.md:6 | "about 180 corrections", "39 markers" | not countable from the text (markers were replaced by plain IDs) | unverifiable |
| N-14 | PRD.md:1800 | 21 OPEN questions | 21 | OK |
| N-15 | **PRD.md:1800** | former §7 held "DL-01 … DL-58 of the 2026-10-12 draft" | OD:344 maps the former PRD §7 as **OPEN-1 … OPEN-69** | **WRONG** (R2-29) |
| N-16 | **PRD.md:1807** | `docs/decisions.md` (639 lines) | **720** lines | **STALE** (R2-29) |
| N-17 | PRD.md:56, :1758; TRD.md:28, :872; research/08:543 | spec-audit FAIL, 31 blocking | BK 22 + BR 2 + EA 1 + FR 1 + RL 1 + SP 1 + RG 3 = 31 | OK (consistent everywhere) |
| N-18 | TRD.md:28, :867; research/08:540 | 1,872 tests, 1,871 pass, 1 todo | not re-run (read-only); same number in all three places | consistent, unverified |
| N-19 | TRD.md:868 | 256 entries in `__tests__/` (255 test files + helpers) | 256 / 255 | OK |
| N-20 | TRD.md:358 (DR-1) | 12 files in `supabase/migrations/`, 15 root `supabase_*.sql`, 29 live | 12 / 15 / (live not checked — read-only, no network) | OK / unverified |
| N-21 | TRD.md:10 | 360 claims: 298 + 40 + 10 + 12 | sums to 360 | OK |
| N-22 | TRD.md:282 / PRD.md:433 vs TRD.md:727 | SQLite 11 tables; owner scan 10 tables (not vials) | consistent (11 incl. vials) | OK |
| N-23 | flows/README.md:5–7 | 13 sections per flow | 13 numbered sections in each of 14 flows | OK |
| N-24 | **flows/README.md:129** | of 36 questions, **14 map to an OPEN** (14 distinct; "OPEN-05 comes only from the PRD and the TRD"); "5 of those 22 are back" | per OD crosswalk :436–471, **23 of 36** rows map wholly or partly to an OPEN (adds #2 → OPEN-20 (b), #5 → OPEN-21 (6), #12 → OPEN-01, #19 → OPEN-20 (a)); #7 maps to OPEN-05 from flows 02 / 13, so "OPEN-05 only from PRD/TRD" is false | **STALE** (R2-12) |
| N-25 | flows/README.md:129 | 36 questions | 36 rows | OK |
| N-26 | commit 8995f89 / 19e4ebc messages (not a doc) | 262 acceptance checks; 105 diagrams; 462 requirements | **263** `**Fnn-mm**` checks (26+25+25+19+16+19+19+19+18+15+18+13+15+16); **105** mermaid blocks (flows 64 + flows README 1 + TRD 4 + research 36); **463** `PRD-AREA-n` bullets | docs state none of these; commit text only — informational |
| N-27 | ledger decisions.md:645 | "OPEN-DECISIONS.md (DL-01…DL-74)" | DL-01…DL-75 | STALE (R2-23) |
| N-28 | picture fluxos-dosetrace.html:7, :219 | 14 fluxos | 14 | OK |

---

## 2. Topic matrix (45 cross-cutting topics)

Legend: ✓ agrees with the canonical OD / ledger state · ✗ disagrees (finding ID) · ~ agrees but stale ID or missing pointer · — not covered.

| # | Topic | Canonical (OD) | PRD | TRD | Flows | Dossiers | DIVERGENCES | Picture | Ledger |
|---|---|---|---|---|---|---|---|---|---|
| T-1 | Tracker streak: days vs doses | OPEN-17 (today: days) | ✓ TODAY-33 :480 | ✓ S-10, R-09 | ✓ 03 §7.7 | ✓ 02 note 5 | ✓ DV-034 | ~ "DL-03" :611 (R2-05) | ✓ :642, :648 corrected |
| T-2 | Tracker look-back 365 / 31-day cap | DL-03 (narrowed) | ✓ :1181 | ✓ | ✓ 03 :209 | ✓ | ✓ | ✓ :611 | ✓ |
| T-3 | Report streak = card rule | DL-02 | ✓ | ✓ S-09 | ✓ 03 :211 | ✓ | ✓ DV-032 | ✓ :611 | ✓ :647 |
| T-4 | Card streak = doses | AD-07 (narrowed to card) | ✓ TODAY-35 | ✓ | ✓ | ✓ | ✗ DV-180 says the line is missing (R2-35) | ✓ | ✓ :642 |
| T-5 | Days-left colour above 7 days | **AD-65** (founder Q9 = B, green everywhere) | ✓ VIAL-21, C-16, G-23 | ~ R-46 cites DL-16 (R2-30) | ✓ 04 :144, :254; README #15 | ✓ | ✓ DV-018 | **✗ :670 "Falta sua decisão (DL-16) … ainda é escolha sua" (R2-01)** | ✓ :661 corrected |
| T-6 | Skip cancels the slot's reminders | DL-08 (narrowed) | ✓ C-2 :1214 | ✓ S-05 | ✓ 03 §7.3 | ✓ | ✓ DV-035 | ✓ :583 | ✓ :653 |
| T-7 | Undo bar after Skip | OPEN-19 (d) | ~ DOSE-22 :528, C-2 :1215 "DL-08 must say" (R2-16) | ✓ R-17 | ✓ 03 :184 | — | ✓ DV-130 | ~ "DL-08" :583 | ✓ |
| T-8 | Default slot for a no-time protocol | OPEN-19 (c), rec. A = 08:00 | ✓ G-3 | **✗ S-01 :634 "decided: DL-06 — the form's default slot list" (R2-02)**; ~ §9.1 Q2 :1053 | ✓ 03 :317, 06 :260 | ✓ | ✓ DV-028 | ~ "DL-06" :609, :857 | ✓ :651 |
| T-9 | Daily cap for Mark complete | OPEN-19 (b) (DL-67 withdrawn) | ✓ DOSE-2 :509 | — | ✓ 03 :176 | — | ✓ | ~ "DL-67" :604 | ✓ :712 |
| T-10 | Late dose (13 h) — which day | OPEN-19 (a) | ~ G-1 cites AD-06 only (R2-18) | ~ R-08 "AD-06" | ~ 03 D03-1 "needs a rule", §12 silent | ✓ 02 note 1 | ✓ DV-030 | ✗ :610 "Previsto: conta para o próprio dia" (R2-06) | — |
| T-11 | Notification Mark complete time | tap time (today); slot time (yesterday ≤ 12 h) | ✓ :297, DOSE-3, REM-30 | — | ✓ 03 :169 | ✓ 02 note 6, 03 R-13 | — | ✓ :603, :605 | — |
| T-12 | AI consent per account + withdraw | DL-55 (target via OPEN-16 a) | ✓ C-37, G-106; ~ ACCT-3 wrong key name (R2-27) | ~ R-02 "(was DL-55)" (R2-30) | ✓ 01 §12 | ✓ | ✓ DV-007 | ✓ :1340 | ✓ :700 |
| T-13 | Sync tombstones / counters timing | OPEN-16 (b) | ✓ G-155 | ✓ R-01, R-05, §9.1 Q1 | — | — | ✓ DV-182/183; ~ DV-209/210 "No (bug)" though OPEN-16 (b) schedules them (R2-34) | — | ✓ :717, :719 |
| T-14 | Grace week after Premium lapses | AD-14: logging only, no new check / result | ✓ :177–178, :332, RC-51, C-21, C-22 | ✓ | ✓ 07, 08 :217, 13 :187 | ✓ 04 note 9 | ✓ DV-101 | ✓ :935, :1017, :1401 | ✓ :274 |
| T-15 | Apple sign-in on Android | AD-30 live; secret 2027-04-04 | ✓ AUTH-7, 7a, G-138 | ✓ :264, R-52 | ✓ 01, 12 | ✓ | ✓ DV-115, DV-211 | ✓ :410 | ✓ :483 |
| T-16 | Android Apple glyph | OPEN-18 (6) | ~ AUTH-7 cites "07 Q-11" not OPEN-18 (6) (R2-21) | — | ✗ 01 F01-11 :368 expects "store artwork" (R2-21) | — | — | ✗ :397 "seguem 100% as regras das lojas" as fact | ✓ :497 |
| T-17 | Reality check self-finish | OPEN-07 | ✓ RC-51, C-17 | — | ✓ 08 :277 | ✓ 04 note 9 | ✓ DV-061 | ✓ :986 | — |
| T-18 | A-24 closed? (DL-51) | OPEN-07 (DL-51 withdrawn) | ✓ REM-60 | — | ✓ 07 :251, 08 :278 | — | ✓ DV-144 | ~ "DL-51" :987 | ✓ :696 |
| T-19 | Stop erases earlier results | OPEN-08 | ✓ | — | ✓ 08 | ✓ | ✓ DV-004 | ✓ | — |
| T-20 | Free protocol limit after lapse | OPEN-05 (DL-24 withdrawn) | ✓ PREM-13 | ✓ R-16 | ✓ 02, 13 | — | ✓ DV-095 | ~ "DL-24" :524, :1422 | ✓ :669 |
| T-21 | Bloodwork due alert | OPEN-13 | ✓ | — | ✓ 11 | — | ✓ DV-111 | ✓ :1221 | — |
| T-22 | English fallback for notifications | bug (DV-196 / G-77) | ✓ :202, REM-6, G-77 | — | ✓ 06 P13, D06-10 | ✓ 03 note 5 | ✓ DV-050, DV-196 | — | — |
| T-23 | Blend line style | OPEN-18 (1) | ✓ CURVE-3 | — | ✓ 10 | — | ✓ DV-156 | ~ "DL-32" :1145 | ✓ :205 stands, :645 note |
| T-24 | "Not recorded" food mark | OPEN-18 (2) | ✓ G-57 | — | ✓ 07 | — | ✓ DV-151 | ~ "DL-66" :902 | ✓ :711 |
| T-25 | Food AI caps (25 follow-ups, 60/24 h) | OPEN-18 (3) | ✓ §1.5.1, FOOD-51, G-153 | ✓ :246 | ~ 13 :34 "X-09" not OPEN-18 (3) (R2-38) | ✓ | ✓ DV-213 | ✓ :932 | ✓ :251 |
| T-26 | Food quota bucket fix | DL-28 rewritten (count by request day) | ✗ G-59 :1675 "DL-28 cannot fix it" (R2-17) | — | ✗ 07 :165 three undecided options; :177 cites FL-22 for the entry_date bucket (R2-17) | — | ✓ DV-066 | ✗ :932 "conta por data da comida … fica presa" with no decided fix | ✓ :673 |
| T-27 | Scan quota 3 / 20, UTC month, failed not counted | AD-23, AD-36, :275 | ✓ AI-10, C-36 | ✓ :245, :717, :859 | ✓ 11, 13 | ✓ | ✓ DV-078 | ✓ :1250 | ✓ :275 |
| T-28 | Premium scan number in copy | OPEN-14 (a) | ✓ :168, C-36 | — | ~ 13 §12 :256 names AD-56, no OPEN-14 (a) (R2-22) | — | ✓ DV-110 | ~ "AD-56 contra MB-10" :1399 | **✗ :544 still states "3 free / 20 Premium" unmarked (R2-22)** |
| T-29 | Purge pause in 1.3.0 | OPEN-21 (8) | ✓ PROT-106 | ✓ :544 | ✓ 05 :166 (attribution fixed) | — | ✓ DV-125 | ✓ :776 | ✓ :506 |
| T-30 | Purge after 1.3.0 | OPEN-04 | ✓ | — | ✓ 05 :249 | — | ✓ | ✓ :776 | — |
| T-31 | Course total reached | OPEN-03 | ✓ | ✓ R-03 | ✓ 05 :85, §7.6; ✗ 03 D03-11 :303 "honoured everywhere" as intended (R2-32) | — | ✓ DV-012 | ✓ :731, :782 | ✓ :620 |
| T-32 | Lab charts Premium | AD-24 | ✓ BODY-14, C-22 | ✓ R-21 | ✓ 11, 13 | — | ✓ DV-108 | ✓ | ✓ :268 |
| T-33 | Manual lab entry | OPEN-12 (default A) | ✓ BODY-14 | ✓ | ✓ 11 | — | ✓ DV-107 | ✓ :1250 | ✓ :268 |
| T-34 | OS prompt after "Not now" | OPEN-20 (b) | ✓ REM-120 | — | ✗ 01 :227, :307, :320 "AD-27 … to be re-classified as DL", "No OPEN question remains" :322; README #2 :134 "DL" (R2-08) | — | ✓ DV-054 | ✗ :418 "decidido pelo registro, por lógica" (R2-06) | — |
| T-35 | Settings red with dose reminders off | OPEN-20 (a) | ✓ REM-84, :1515 | ✗ R-14 :1005 "Settings half is wrong" (R2-07) | ✗ 06 :184 "That part is right", :269, :288, :290 "Only OPEN-06"; README #19 "DL-45" (R2-07) | — | ✓ DV-042 | ✗ :831 "(correto, segue as regras assinadas)" (R2-06) | ✓ :690 corrected |
| T-36 | Vial-expiry push lead time and words | OPEN-20 (c) | ~ VIAL-31, REM-40 state 7 d as rule (R2-20) | — | ~ 04 :143, R-42 (R2-20) | — | — | ~ :672 | ✓ :417 lists A-45 |
| T-37 | Supply push at 3 doses (was 2) | OPEN-18 (5) | ~ :309, C-15 as decided (R2-19) | — | ~ 04 :197, R-38 | — | — | ~ :306, :671 | ✓ :148; :432 Conflict 31 |
| T-38 | Ring count-from-zero / curve intro every open | OPEN-18 (4) (ring only) | ✗ TODAY-30 :477, CURVE-25 :914 cite AD-44; UI-7 :1156 as decided (R2-15) | — | ~ 03 D03-12 | ✓ 02 note 4 | ✓ DV-132 | — | ✓ :441 open |
| T-39 | Android setup step after denial | DL-50 withdrawn (moot), DV-142 closed | ✗ G-88 :1712 "DV-142 (to close)", "wording item", :1517 (R2-29) | — | ✓ 01 :229, D01-5 | — | ✓ closed | ✗ :376 "Falta sua decisão (DL-50)" (R2-05) | ✓ :695 |
| T-40 | Site questions never dropped for age | DL-01 | ✓ | ~ R-48 says 07 re-classified DL-01 as AD (R2-30) | ✓ 03 P8 | ✓ | ✓ DV-175 | — | ~ :459 not annotated; FX-25 evidence not corrected (R2-39) |
| T-41 | "Earlier day" 2–7 days | OPEN-21 (9) | ✓ FOOD-25 | — | ~ 07 :152 as fact (R2-31) | — | — | — | ✓ :429 |
| T-42 | Half-filled wizard lost on a kill | OPEN-21 (6) | ✓ PROT-23 | — | ✗ 02 :43, :300, :317 "Already decided (AD-35)"; README #5 "AD-35" (R2-09) | — | ✓ DV-127 | — | — |
| T-43 | Gates answerable offline + "Sign out anyway" | OPEN-21 (5) | ✓ GATE-6 | ✗ R-39 :1030 "AD-29" (R2-30) | ✗ 01 :187, :304; 12 :40, :137 "Intended (AD-29)" (R2-31) | — | ✓ DV-114 | — | ✓ :542 |
| T-44 | Reminders cancelled on server-confirmed delete; 2nd-device residue | OPEN-21 (1) | ✓ ACCT-8 | — | ✗ 12 :175 "Intended (AD-04)", :176 "needs its own DL or OPEN", :242 "No OPEN question remains" (R2-31) | — | ✓ DV-009 | — | ✓ :599 |
| T-45 | Recon "New vial" on the protocol page | OPEN-01 (DL-22 narrowed to rtu) | ✓ :312, VIAL-42 | ✓ R-13, §9.1 Q8 | ✗ 04 :84, :161, :250 "decided by logic (DL-22)"; README #12 "DL-22" (R2-10) | ✓ 01 note 6 | ✓ DV-093 | ✗ :694 "Previsto" (R2-06) | ✓ :667 corrected |
| T-46 | End protocol + vial prompt "Later" | OPEN-21 (4) (rules are coordinator lines) | ✗ PROT-82 :617 "approved" vs :311, :1301 "→ OPEN-21" (R2-11) | ~ R-13 "AD-11" | ✗ 04 :253, 05 :247 "Already approved (AD-11)" (R2-11) | — | ✓ DV-090 | ✓ :750 | ✓ :558 |
| T-47 | Measured burn with incomplete inputs | DL-75 | ✗ PROG-14 :817 "→ AD-45 (contested … a DL or a founder line)" (R2-14) | — | ✗ 09 :123 "Not settled" (R2-14) | — | ✓ DV-149 | ✓ :1092 "Previsto" | ✓ :720 |
| T-48 | Past weigh-in lower bound | DL-73 withdrawn, no change | ✗ PROG-43 :832 "re-decide or drop" (R2-13) | — | ✗ 09 :218 "Under review", :212 lists closed DV-194; README #26 "DL-73" (R2-13) | — | ✓ closed | ✗ :1091 "Precisa ser decidida de novo ou retirada" (R2-13) | ✓ :718 |
| T-49 | Interval presets 1–7, 10, 14 / bound 1–365 | ledger :200 (founder) presets; DL-19 1–365 | ~ PROT-19 notes the gap, no G/DV (R2-33) | — | ✗ 02 F02 check :356 asserts "no preset buttons", "1–999" (R2-33) | ✓ 01 note 2 | — no row | ✗ :522 "1 a 999 … sem botões prontos" as fact | ✓ :200; DL-19 :664 |
| T-50 | Restart order (duplicate → container → limit) | PRD key fix | ✓ :320, PROT-90 | ✓ S-31 | ✓ 05 :126 | — | — | ✓ :779 | ✓ |

All other topics sampled (free limit 3 AD-40; 7 free food days / "free days" not "trial" DL-61; typed calories Premium AD-15; 7-day store trial AD-49; no lab reference ranges AD-55; iPad off DL-70; server push off AD-37; iPhone 10-day window OPEN-06; "Show names" off AD-03; Silent never "blocked" AD-25 / DL-45 Silent half) agree in every document that covers them.

---

## 3. Findings

### S1

**R2-01 (S1) — The picture tells the founder the days-left colour is still his open choice; it was decided by him (AD-65).**
`docs/design/fluxos-dosetrace.html:670`: "Falta sua decisão (DL-16): … qual das duas cores vale para as duas telas ainda é escolha sua." OD:548 AD-65, OD:571 DL-16, PRD G-23 :1635, flows/04 :254, DIVERGENCES DV-018 and ledger :661 all say: decided by the founder (Q9 = B, decisions.md:147) — coloured days, green above 7, My Protocols included; the Protocols grey is the divergence. **Correct:** replace the pend box with a "Hoje está diferente" divergence: "Previsto: dias coloridos como em Hoje (verde acima de 7), também em Meus protocolos — sua escolha Q9 = B (AD-65). Hoje está diferente: Meus protocolos mostra cinza."

**R2-02 (S1) — TRD S-01 decides OPEN-19 (c) the opposite way of the recommendation.**
`TRD.md:634` (S-01 "Target"): "decided: DL-06 — no-time protocols use the form's default slot list everywhere"; `TRD.md:676` S-40 "follows S-01's decided policy (DL-06)"; `TRD.md:1053` §9.1 Q2 → "DL-06" only. OD:106, :111, :561 and the ledger :651: one slot list is DL-06, **which default is OPEN-19 (c)** (recommendation A = 08:00, what the phone does). A builder following the TRD owner table would implement option B. **Correct:** S-01 "one declared policy (DL-06); which default → OPEN-19 (c) (rec. 08:00)"; §9.1 Q2 → "DL-06 · OPEN-19 (c)".

### S2

**R2-03 (S2) — OPEN-16's English context gives the wrong register size; the Portuguese gives the right one.** `OPEN-DECISIONS.md:22`: "216 open rows (14 S1, 94 S2, 37 S3, 71 S4)". Recount and DIVERGENCES Summary: **218 (15 S1, 94 S2, 37 S3, 72 S4)**; PT :641, :653 say 218. **Correct:** EN → 218 (15 / 94 / 37 / 72).

**R2-04 (S2) — The PT message points the founder to the wrong question.** `OPEN-DECISIONS.md:711` (PT Q10 recommendation): "o texto você vê no build de teste, **pergunta 18**" — PT question 18 is OPEN-14 (scan line); the test-build look list is PT question **20** (OPEN-18). The EN source `OPEN-DECISIONS.md:140` "(OPEN-18 item 7)" is also wrong: item 7 (:265) lists A-42, A-44, A-46, not A-45. **Correct:** add A-45 (vial-expiry words) to OPEN-18 item 7 (EN :265 and PT :780) and change PT "pergunta 18" → "pergunta 20".

**R2-05 (S2) — The picture still labels open questions with withdrawn IDs and keeps one withdrawn item alive.** `fluxos-dosetrace.html`: legend :225 "(DL-03)"; :376 "Falta sua decisão (DL-50) … vai para a lista de diferenças para você aceitar" (DL-50 is withdrawn as moot, DV-142 closed — nothing to accept); :524, :1422 "DL-24"; :583 "DL-08"; :604 "DL-67"; :609, :857 "DL-06"; :611 "DL-03"; :902 "DL-66"; :987 "DL-51"; :1145 "DL-32"; :1399 "AD-56 contra MB-10". The founder answers by OPEN number (PT message: "mande só o número e a letra"), and none of these cells carries the OPEN number. **Correct:** :376 → remove the pend box (or "Não é diferença: o app já faz o que a SP-4 assinada pede"); every other tag → the canonical id: DL-03 → OPEN-17 (pergunta 7), DL-08 → OPEN-19 (d), DL-67 → OPEN-19 (b), DL-06 → OPEN-19 (c), DL-24 → OPEN-05, DL-66 → OPEN-18 (2), DL-51 → OPEN-07, DL-32 → OPEN-18 (1), AD-56 → OPEN-14 (a).

**R2-06 (S2) — The picture shows four open founder questions as decided ("Previsto" / "correto" / "decidido").**
- :418 "Disse 'Agora não' … (regra SP-5; **decidido pelo registro, por lógica**)" — OPEN-20 (b).
- :831 "a linha fica vermelha … (**correto**, segue as regras assinadas RC-1 e SP-1)" — OPEN-20 (a).
- :610 "**Previsto:** a dose conta para o horário do próprio dia" — OPEN-19 (a).
- :694 "**Previsto:** 'Novo frasco' na página do protocolo a qualquer momento" — OPEN-01.
**Correct:** mark each "Falta sua decisão (OPEN-xx; recomendação …)".

**R2-07 (S2) — Flow 06 and TRD R-14 treat OPEN-20 (a) as decided, and flow 06 omits OPEN-20 entirely.** `flows/06:184` "That part is right: Settings stays red while any switched-on kind … is blocked"; :269 D06-4; :288 DL-45 text; **:290 "Only OPEN-06 is a founder question."** `TRD.md:1005` R-14 "DL-45 (Silent half only — its Settings half is wrong…)". `flows/README.md:151` #19 → "DL-45". OD:130–142: OPEN-20 (a) Settings red, (b) "Not now", (c) vial-expiry lead — all three belong to flow 06. **Correct:** flow 06 §7.3 / §11 / §12 say "OPEN-20 (a) (recommended A, as signed)"; §12 lists OPEN-06, OPEN-20 (a), (b), (c); TRD R-14 → "DL-45 (Silent) · OPEN-20 (a)"; README #19 → "DL-45 (Silent) · OPEN-20 (a)".

**R2-08 (S2) — Flow 01 still carries AD-27 "to be re-classified as DL" and says no OPEN question remains.** `flows/01:227` "Intended (… AD-27 as reworded)", :307 D01-4, :320 "AD-27 … (to be re-classified as DL, X-06 / A-02)", :322 "No OPEN question remains in this flow"; `flows/README.md:134` #2 → "DL (listed as AD-27 …)". OD:305, :368, :437: AD-27 → **OPEN-20 (b)**. **Correct:** flow 01 §7 / §11 / §12 → "OPEN-20 (b) (recommended A: no prompt at start; ask at the first timed protocol / SP-5 screen)"; §12 also lists OPEN-21 (5) (gates offline) and OPEN-18 (6) (Android Apple glyph); README #2 → OPEN-20 (b).

**R2-09 (S2) — Flow 02 calls the half-filled-wizard rule "Already decided (AD-35)".** `flows/02:43` "Intended (AD-35 …)", :300 D02-2, :317 "AD-35 … Already decided"; `flows/README.md:137` #5 → "AD-35". OD:307, :518, :440: AD-35 → **OPEN-21 (6)** (BK-14 does not name the wizard). PRD-PROT-23 :592 already says OPEN-21. **Correct:** flow 02 and README #5 → OPEN-21 (6).

**R2-10 (S2) — Flow 04 keeps the recon "New vial" as decided by logic (DL-22).** `flows/04:84` (state diagram "intended for recon"), :161 "→ DL-22 (decided by logic)", :250 "DL-22 — … recon gets 'New vial' on the protocol page at any time … Decided by logic"; `flows/README.md:144` #12 → "DL-22". OD:319, :577, :447: DL-22 narrowed to rtu; recon New vial → **OPEN-01**. PRD :312, VIAL-42, TRD R-13 and DV-093 already agree with OD. **Correct:** flow 04 §6 / §7 / §12 and README #12 → "DL-22 (rtu) · OPEN-01 (recon)".

**R2-11 (S2) — End protocol / vial prompt "Later" is "approved" in PRD-PROT-82 and flows 04 / 05, but a coordinator line awaiting confirmation in OD.** `PRD.md:617` PRD-PROT-82 "are approved but wait for a picture"; `flows/04:253`, `flows/05:247` "AD-11 … Already approved (A-85)". OD:280 / :494: the founder put A-85…A-98 in 1.3.0, but the rules inside (End on the page, "Later", A-86b, A-87b) are coordinator / Gate B lines → **OPEN-21 (4)**. PRD itself says "→ OPEN-21" at :311 and :1301 — the PRD contradicts itself. **Correct:** PRD-PROT-82 and both flows → "scheduled for 1.3.0 by the founder (AD-11); the rules (End on the page, 'Later', picture first) → OPEN-21 (4)".

**R2-12 (S2) — The flows README crosswalk disagrees with OD's crosswalk on five rows, and its summary sentence is stale.** `flows/README.md:129` (counts, "AD-27 is logic, not a ledger answer"), rows #2 :134 (DL vs OD :437 OPEN-20 (b)), #5 :137 (AD-35 vs OD :440 OPEN-21 (6)), #12 :144 (DL-22 vs OD :447 DL-22 rtu · OPEN-01), #19 :151 (DL-45 vs OD :454 OPEN-20 (a)), #26 :158 (DL-73 vs OD :461 "No change, DL-73 withdrawn"). Conventions list :115 also omits AD-27 → OPEN-20 (b), AD-35 → OPEN-21 (6), DL-45 → OPEN-20 (a), DL-22 → OPEN-01, AD-45 → DL-75, DL-73 withdrawn. **Correct:** copy OD's flows crosswalk into the README (or replace the table with a pointer to OD :432–474) and recount (23 of 36 rows reach an OPEN, wholly or in part).

**R2-14 (S2) — DL-75 (measured burn always shown) is not in the PRD or the flows; both still call it unsettled.** `PRD.md:817` PRD-PROG-14 "→ AD-45 (contested … this is not 'already decided': a DL with a reason, or a founder line)"; `flows/09:123` "Not settled by the ledger … AD-45's 'already decided' does not hold". OD:528, :630, DIVERGENCES DV-149 and ledger :720: **DL-75** — a measured burn shows whenever a result exists; PO-12 gates only the estimate. **Correct:** PRD-PROG-14 and flow 09 → "DL-75 → GAP DV-149".

**R2-15 (S2) — The PRD still cites the withdrawn AD-44 for the ring / curve intro, and half of Conflict 40 has no canonical question.** `PRD.md:477` (TODAY-30) "count-from-zero / day-complete pulse → AD-44, AD-52", `PRD.md:914` (CURVE-25) "Whether the intro plays on every open → AD-44, AD-52 (conflict #40)", `PRD.md:1156` (UI-7) states "count-ups only when values change" as decided. OD:527 AD-44 → OPEN-18 (4), which asks only about the **ring**; Conflict 40 (decisions.md:441) covers "Today ring count-from-0 **and the curve intro on every open**". **Correct:** PRD → OPEN-18 (4); add the curve-intro half to OPEN-18 item 4 (EN :262 and PT :775), or state where it is decided.

**R2-17 (S2) — The food-quota fix is decided (DL-28 rewritten) but the PRD, flow 07 and the picture still describe it as unworkable or undecided.** `PRD.md:1675` G-59 "… so 'retry after local midnight' (DL-28) cannot fix it"; `flows/07:165` "The fix proposed in DL-28 … cannot work … The fix needs one of: re-date and ask the user, a server exemption, or a permanent … state"; `fluxos-dosetrace.html:932` describes the stuck message with no decided fix. OD:583, DIVERGENCES DV-066 :175 and ledger :673: DL-28 **rewritten** — `parse-food` counts the 25 by the local day of the request; a refused re-parse is marked, explained and retried the next day. Also `flows/07:177` attributes the entry_date bucket to FL-22, but signed FL-22 (specs/food-log.md:35) says only "resets at the user's local midnight". **Correct:** G-59, flow 07 §7 / D07-8 and the picture → "fix per DL-28 (rewritten)"; :177 drop the FL-22 attribution for the as-built bucket.

**R2-22 (S2) — The ledger still states the Premium scan number as a live decision while OPEN-14 (a) asks it.** `docs/decisions.md:544` "My Body's scan line shows each plan's real number (3 free / 20 Premium)" has no WITHDRAWN / pending mark (the 2026-10-12 section annotates DL lines only). `flows/13:256` still names "AD-56" and gives no OPEN id. **Correct:** annotate :544 "→ pending OPEN-14 (a) (founder line :104 and signed MB-10 say no number)"; flow 13 §12 → OPEN-14 (a).

**R2-31 (S2) — Flow 12 and flow 01 present three OPEN-21 items as intended and say no OPEN question remains.** `flows/12:175` "Intended (AD-04 …)", :176 "Not decided: … (PRD OPEN-54) … needs its own DL or OPEN (07 A-06)" — OD:277 / :401 already folded it into **OPEN-21 (1)**; `flows/12:40`, :137 and `flows/01:187`, :304 "Intended (AD-29 …)" → **OPEN-21 (5)**; `flows/12:242` and `flows/01:322` "No OPEN question remains". Minor of the same kind: `flows/07:152` Earlier day 2–7 (OPEN-21 (9)), `flows/05:166` purge pause (OPEN-21 (8)) carry no OPEN id. **Correct:** cite OPEN-21 (n) at each place and list it in §12.

**R2-33 (S2) — An approved founder line (interval presets) is unbuilt and owned by no DV, OPEN or deviation item; a flow check asserts the divergence as expected.** Ledger `decisions.md:200` (2026-09-04): "Custom dosing interval: presets 1–7, 10, 14 + custom days". The code shows none (research/01 note 2; PRD-PROT-19 :588 "the code differs from :200 and no later ledger line replaces it"), but no G-row, DV row, OPEN item or OPEN-18 deviation exists. `flows/02:356` (acceptance check) expects "Custom = a typed number of days, **1–999**; no preset buttons" — encoding both the missing presets and the bound DL-19 changes to 1–365; the picture :522 shows the same as plain fact. **Correct:** add a DV row (S3, missing approved feature) and put it either under "approved → next build" or on OPEN-18 as a deviation; fix the F02 check to expect 1–365 and the decided presets behaviour.

### S3

**R2-13 (S3) — DL-73 is withdrawn but three documents still ask to re-decide it.** `PRD.md:832` PROG-43 "DL-73 … re-decide or drop"; `flows/09:218` "DL-73 … Under review … Re-decide or drop", :212 D09-8 cites the closed DV-194 as its row; `flows/README.md:158` #26 → "DL-73"; picture :1091 "Precisa ser decidida de novo ou retirada". OD:628, :461, DIVERGENCES :357: withdrawn, no change. **Correct:** "No change (DL-73 withdrawn: the wheel stops 10 years back)"; drop D09-8 or mark it "closed".

**R2-16 (S3) — PRD C-2 / PRD-DOSE-22 still say "DL-08 must say whether that Undo stays" (round-1 K-02 residue).** `PRD.md:528`, `PRD.md:1215`. OD:107 / :563: the Undo bar is **OPEN-19 (d)**. **Correct:** both → "Undo bar after Skip → OPEN-19 (d) (GAP DV-130)".

**R2-18 (S3) — OPEN-19 (a) (late-dose day) is missing where DV-030 is discussed.** `PRD.md:1609` G-1 and `TRD.md:999` R-08 cite only AD-06; `flows/03:293` D03-1 "needs an explicit rule extending decisions.md:144" and flow 03 §12 (:310–320) omit OPEN-19 (a). Inside OD, AD-06 (:489) still lists DV-030 among the rows it settles, while DV-030 (:124) points to OPEN-19 (a). **Correct:** add "→ OPEN-19 (a)" to G-1, R-08, D03-1 and flow 03 §12; remove DV-030 from AD-06's Rows.

**R2-19 (S3) — AD-60 states the supply push at 3 as decided and, in the same cell, sends it to OPEN-18 (5); PRD and flow 04 keep it as decided.** `OPEN-DECISIONS.md:543`; `PRD.md:309` and C-15 :1346; `flows/04:197`, :222 R-38. **Correct:** narrow AD-60 (the pop-up style and the A-33 test stay; the threshold → OPEN-18 (5)); PRD / flow 04 add "(push threshold 3 → OPEN-18 (5))".

**R2-20 (S3) — The vial-expiry lead time and words (OPEN-20 (c)) are written as settled rules elsewhere.** `PRD.md:646` VIAL-31, :696 REM-40, :1364; `flows/04:143`, :222 R-42 — "7 days before and on the day, 09:00" with no pointer. **Correct:** add "(lead time and words: OPEN-20 (c))".

**R2-21 (S3) — The Android Apple glyph (OPEN-18 (6)) is cited by a round-1 finding id, and a flow check expects store artwork.** `PRD.md:410` "a founder question, decisions.md:497; verification 07 Q-11"; `flows/01:368` F01-11 "Apple button first, Google second (store artwork, both themes)" — on Android the glyph is drawn; picture :397 "seguem 100% as regras das lojas" as fact. **Correct:** cite OPEN-18 (6); F01-11 expectation per platform ("Android: drawn glyph until OPEN-18 (6)").

**R2-25 (S3) — Six flow divergence rows say "no DV yet" although the DV rows exist, and DIVERGENCES' claim that every flow D-row is in a DV row's Sources is false.** `flows/02` D02-12 → DV-198; `flows/04` D04-16 → DV-199, D04-17 → DV-200 (flow 04 §12 :254 itself cites DV-200); `flows/05` D05-12 → DV-216; `flows/07` D07-10 :244, :253 "no register row yet" → DV-197; `flows/13` D13-11 "DV-071 (to extend)" → DV-212. D08-13 has no row. `DIVERGENCES.md:4` "every flow's 'Divergence today' row (Dnn-k) is listed in the Sources of its DV row" — not true for these seven (+ D01-5, D09-8 point to closed rows). **Correct:** fill the DV column in each flow §11 and add the Dnn-k ids to the Sources of DV-197/198/199/200/212/216.

**R2-27 (S3) — PRD-ACCT-3 names a consent key that does not exist.** `PRD.md:434` "`dosetrace_ai_consent`"; the key is `dosetrace_ai_extraction_consent_v4` (`lib/aiConsent.js:19`; TRD :383; flows/01 :206). **Correct:** use the real key.

**R2-29 (S3) — PRD stale pointers.** `PRD.md:1712` G-88 "DV-142 (to close)" and "at most the SP-4 wording is clarified (a deviation-list wording item)", `PRD.md:1517` "G-88 is a wording item only" — DV-142 is closed and DL-50 withdrawn with "nothing to amend" (OD:605). `PRD.md:1715` G-91 cites the closed DV-100. `PRD.md:1800` "DL-01 … DL-58 of the 2026-10-12 draft" (OD:344: former PRD OPEN-1…OPEN-69). `PRD.md:1807` "639 lines" (720). `PRD.md:6` lists the ids it replaced but not AD-44, AD-45, DL-73, which it still cites as live (R2-13/14/15). **Correct:** G-88 → "closed (DV-142); no wording change"; G-91 drop DV-100; fix :1800 and :1807.

**R2-30 (S3) — TRD §9 decision column carries moved IDs and "none yet" rows that now exist.** `TRD.md:1030` R-39 "AD-29" (→ OPEN-21 (5)); `:1037` R-46 "DL-16" (→ AD-65); `:993` R-02 "OPEN-16 (a) (was DL-55)" — DL-55 is in force, not withdrawn; `:1039` R-48 "verification/07 D-07 re-classifies DL-01 as already decided" — OD keeps it DL-01; `:995` R-04 "a separate founder item" (→ OPEN-18 (8)); `:1024` R-33 cites closed DV-100 as a live bug; `:1042–1044` R-51/R-52/R-53 "none yet" while DV-209, DV-211, DV-210 exist. **Correct:** replace with the canonical ids / DV rows.

**R2-32 (S3) — Flow 03 states the course-total behaviour that OPEN-03 still asks.** `flows/03:303` D03-11 "Intended: Course total honoured everywhere" — that is OPEN-03 option B (OD:59–66). **Correct:** "→ OPEN-03".

**R2-34 (S3) — OPEN ↔ DV links differ.** OPEN-16 (b) moves DV-209 / DV-210 between builds, but both rows say "No (bug)" (`DIVERGENCES.md` S1 section). OD "Related" lists DVs whose founder column points elsewhere: OPEN-01/DV-015 (DL-15), OPEN-02/DV-020 (bug), OPEN-07/DV-058 (DL-26), OPEN-09/DV-150, OPEN-15/DV-087 (DL-60), OPEN-19/DV-029 (DL-04) and DV-204 (bug); AD-12 Rows DV-056/057 while both rows say DL-25. These are context links, not contradictions, except DV-209/210. **Correct:** DV-209 / DV-210 founder column → "No (bug); build per OPEN-16 (b)".

**R2-35 (S3) — README of docs/product does not describe the set.** `docs/product/README.md:8–21` lists research, PRD, TRD, flows + "a drawn picture" only. Missing: `DIVERGENCES.md` (the one defect register), `OPEN-DECISIONS.md` (the single founder round, with the PT message), `verification/` (round 1 and round 2), the picture's path `docs/design/fluxos-dosetrace.html`, the counts (21 / 54 / 65; 218 DV; 463 requirements; 263 checks; 105 diagrams), the reading order, and the process steps that happened (verification → one founder round). DV-180 (`DIVERGENCES.md:334`) also still says the 2026-10-05 streak line is missing from the ledger — it was added at decisions.md:642. **Correct:** rewrite the README document list and process; close that clause of DV-180.

**R2-36 (S3) — The PT and EN of OPEN-16 (b) offer different options.** EN `OPEN-DECISIONS.md:25` B = "Tombstones (DL-72) and the paging fix (DV-210) in 1.3.0; counters (DL-74) and the watermark race (DV-209) in 1.3.1". PT :655 B = "na 1.3.0 só as exclusões; a contagem de doses na 1.3.1" — no paging fix / watermark race, and the PT context omits DV-209 / DV-210. **Correct:** PT B "… as exclusões e a correção da paginação na 1.3.0; a contagem de doses e a corrida do marcador de sincronização na 1.3.1".

**R2-39 (S3) — DL-01 says the FX-25 evidence and decisions.md:459 "are corrected"; neither is.** `docs/specs/fixes-1.2.5.md:38` still cites the test "FX-25: a question older than 7 days is let go"; `decisions.md:459` "Site questions older than 7 days are let go" has no inline mark (only the :645 header note). Round-1 D-07 residue. **Correct:** annotate :459 "superseded by DL-01 (2026-10-12)"; correct the FX-25 evidence cell (spec owner).

### S4

**R2-23 (S4) — Ledger 2026-10-12 section drift.** `decisions.md:645` "OPEN-DECISIONS.md (DL-01…DL-74)" (DL-75 exists) and "Production changes that follow from a DL (DL-64, DL-72)" (DL-72 withdrawn); `:664` DL-19 reason "longest ester ~12 weeks" vs OD:574 (Testosterone Undecanoate 10–14 weeks; assistant bound 365) — OD:336 lists DL-19 (reason), DL-14 (citation), DL-10 as corrected, the ledger was not. **Correct:** sync the three lines.

**R2-24 (S4) — OD internal: AD-06 Rows (:489) "DV-030" while DV-030 → OPEN-19 (a); AD-50 Rows (:533) DV-125 while AD-50 moved.** Housekeeping.

**R2-26 (S4) — Broken markdown tables.** `DIVERGENCES.md:303` DV-150 has unescaped `|Δ|` → 12 cells under a 10-column header (renders shifted: Sev / Conf / Founder decision land in the wrong columns; any script reading the register mis-reads its severity). Flow "§9 Data written" tables with rows missing the Table cell (3 vs 4): `flows/03:276, 278–283`; `flows/04:211–218` (and :217 `{7|0}` splits under GFM); `flows/05:219`; `flows/07:214–225`; `flows/08:238–247`; `flows/09:186–195`; `flows/11:233–240`. `flows/06:248` (extra cell under GFM: pipe in a code span); `TRD.md:881` (L2 row 3 cells vs 4); `flows/02:225` (one-cell row inside a 2-column table). Doubled bold `****OPEN-19 (d)** (was DL-08)**` at `flows/03:312, 315, 317, 318`, `flows/02:319`, `flows/13:255`, and `**OPEN-18 (2)** (was DL-66) — …**` at `flows/07:250`, `flows/07:251`, `flows/08:278`, `flows/10:235`. Research tables with unescaped `||` in code spans (strict GFM): `research/01:471, 474, 475, 492`, `research/03:287, 779`, `research/04:61`, `research/05:418`, `research/06:335`; `research/02:666` (2 vs 3). **Correct:** escape the pipes, add the missing Table cell, fix the bold.

**R2-28 (S4) — `PRD.md:1463` C-22 "Lapse" row: "OPEN-05, OPEN-05".** Duplicate.

**R2-37 (S4) — `TRD.md:1062` still names "tombstones for every synced table, DL-72" as a DL production change.** Already withdrawn to OPEN-16 (b) two sentences later. Reword.

**R2-38 (S4) — `flows/13:34` food caps cite the round-1 finding "X-09: deviation list or record them" instead of OPEN-18 (3).**

No placeholder was found: no `[OPEN-PENDING`, `TODO`, `TBD`, `XX` or `??` in any file of the set (the only "R-xx" / "D-xx" hits are numbering-scheme descriptions in research/01:232, :463). No empty cell in any AD / DL / OPEN / DV table except the intentional "Note" column of the DIVERGENCES crosswalk (:388). Every section heading referenced as `§n.m` inside PRD / TRD exists.

---

## 4. Round-1 (07-consistency.md) items — status

| Item | Status | Evidence / residue |
|---|---|---|
| X-01 grace = logging only | Resolved | PRD :177–178, :332, RC-51, C-21 :1436, C-22 :1452; flows 07/08/13; picture |
| X-02 Premium scan number | Partly | OD OPEN-14 (a); PRD :168, C-36 OK. Residue: ledger :544 unmarked, flow 13 :256 "AD-56", picture :1399 (R2-22, R2-05) |
| X-03 tracker streak | Resolved | PRD TODAY-33, flows/03 §7.7, TRD S-10, OPEN-17; DV-180 residue (R2-35) |
| X-04 flow 05 course "by logic" | Resolved in flow 05 | flow 05 :85 "pending OPEN-03"; flow 03 D03-11 residue (R2-32) |
| X-05 Android setup after denial | Partly | flow 01 :229 OK; PRD G-88 :1712 / :1517 still "wording item", picture :376 "Falta sua decisão (DL-50)" (R2-29, R2-05) |
| X-06 AD-27 "Not now" | Partly | OD → OPEN-20 (b); PRD REM-120 OK. Flow 01 :320 "to be re-classified as DL", README #2, picture :418 (R2-08, R2-12, R2-06) |
| X-07 TRD S-05 / PRD C-2, C-3 | Partly | TRD S-05 OK, "undecided" gone; PRD C-2 Undo row "DL-08 must say" (R2-16) |
| X-08 purge attribution | Resolved | flows/05 :166 |
| X-09 food caps | Resolved | DV-213, OPEN-18 (3), PRD G-153; flow 13 cites "X-09" (R2-38) |
| X-10 TRD founder markers | Partly — new error | §4.9 → AD-16 and §6.4 → decided OK; S-01 now says "decided: DL-06 — form's default list" (R2-02) |
| X-11 lab charts picture first | Resolved | PRD C-22 :1455, flows/11 §12 |
| X-12 neutral bodies | Resolved | flows/05 :249 |
| D-01 DL-03 | Resolved | OPEN-17 |
| D-02 DL-24 | Resolved | OPEN-05 (picture still says "DL-24", R2-05) |
| D-03 DL-72 / DL-74 | Resolved | OPEN-16 (b); misattribution fixed in OD :627 and ledger :717 |
| D-04 DL-32 | Resolved | OPEN-18 (1) |
| D-05 DL-66 | Resolved | OPEN-18 (2) |
| D-06 DL-50 | Resolved (withdrawn) | residue PRD G-88, picture :376 (R2-29, R2-05) |
| D-07 DL-01 | Open | kept as DL (not re-classified to AD as proposed); FX-25 evidence and ledger :459 not corrected; TRD R-48 claims it was re-classified (R2-39, R2-30) |
| D-08 DL-55 target / counsel | Resolved | OPEN-16 (a) names DL-55; AD-51 |
| D-09 DL-08 Undo | Resolved | OPEN-19 (d) |
| D-10 DL-22 / DL-58 target | Resolved in OD | OPEN-01, OPEN-16 (a); flow 04 residue (R2-10) |
| D-11 DL-71 to "Para você saber" | Resolved | OD :801 |
| A-01 AD-56 | Resolved in OD | residue R2-22 |
| A-02 AD-27 | Resolved in OD | residue R2-08 |
| A-03 AD-07 ledger :642 | Resolved | ledger :642 corrected |
| A-04 AD-52 unsigned checklists | Resolved | OPEN-18 (7, 8); TRD R-04 residue (R2-30) |
| A-05 AD-54 | Resolved (as OPEN-21 (9), not DL) | |
| A-06 AD-04 / PRD OPEN-54 | Partly | OD OPEN-21 (1); flow 12 :176 still "needs its own DL or OPEN" (R2-31) |
| A-07 AD-09/10/29/46 | Resolved in OD | flows 01 / 12, TRD R-39 still "AD-29" (R2-31, R2-30) |
| A-08 AD-50 | Resolved | OPEN-21 (8) |
| A-09 AD-43 citation | Resolved | OD :526, flow 01 §12 |
| A-10 AD-60 | Partly | OPEN-18 (5) added; AD-60 still states the threshold as decided (R2-19) |
| Q-01 … Q-11 | Resolved (11) | OPEN-05 C, OPEN-06 D removed, OPEN-12 reframed, OPEN-13 A marked, OPEN-08 copy, OPEN-16, OPEN-14 (a), OPEN-18 (8), OPEN-20 (c), OPEN-18 (7), OPEN-18 (6) |
| P-01 … P-06 | Resolved (6) | PT :641–646, :703, :756, :717, intro examples |
| K-01 C-36 | Resolved | PRD :1586 "GAP until decided" |
| K-02 C-2 Undo | Partly | R2-16 |
| K-03 C-37 copy-match | Resolved | PRD :1590 |
| K-04 C-22 lab charts | Resolved | PRD :1455 |
| K-05 finishes only on Progress | Resolved | PRD C-17, RC-51, OPEN-07 |
| K-06 C-30 key list | Resolved | PRD :1539 (but ACCT-3 key name wrong, R2-27) |
| K-07 C-12 ended-row delete | Resolved | PRD C-12, DV-216 |
| K-08 client constant | Resolved | PRD :1586 |

Count: 58 items → 49 resolved, 8 partly (X-02, X-05, X-06, X-07, X-10, A-06, A-10, K-02), 1 open (D-07). X-10 also introduced a new error (R2-02).

---

## 5. What to fix first (in order)

1. Picture: R2-01 (AD-65), R2-05 (withdrawn IDs, DL-50), R2-06 (four open questions shown as decided), R2-13 (DL-73) — the founder reads this page.
2. TRD S-01 / §9 (R2-02, R2-30) — the owner table a builder follows.
3. OD: R2-03 (216 → 218), R2-04 (PT "pergunta 18" → 20; A-45 into OPEN-18 item 7), R2-36 (PT OPEN-16 b), R2-19 / R2-24 (AD-60, AD-06, AD-50 rows).
4. Flows §12 + README crosswalk: R2-07, R2-08, R2-09, R2-10, R2-11, R2-12, R2-31, R2-32.
5. PRD: R2-14 (DL-75), R2-15 (AD-44 / Conflict 40 curve half), R2-16, R2-17, R2-18, R2-20, R2-21, R2-27, R2-29.
6. Ledger: R2-22 (:544), R2-23, R2-39.
7. Register hygiene: R2-25, R2-26, R2-33 (new DV row for interval presets), R2-34, R2-35 (README).
