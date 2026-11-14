# "Dose no corpo" — model and parameters (pharmacometrician, 2026-11-13)

Founder decision 2026-11-13: the curve shows the amount of the compound in the body (circulation), as close to reality as possible, with a band when studies disagree and, for oil depots, a separate "ainda no local da aplicação, não liberado" layer. Precision principle: every number has a source; a range never becomes one number; nothing invented. Sanity check by the pharmacometrician agent (not a certification; a fit against published serum curves is still owed).

Legend: C = confirmed from label/paper text this session (directly or via a mirror); L = label value not re-read this session, verify before ship; U = unconfirmed. Ceiling = F unknown, drawn at F = 1 labeled "no máximo".

## Corrections to the earlier proposal
1. For depot esters with a Tmax, BOTH app rates describe release from the depot: kd = ln2/t½_app and kr = riseRate(t½_app, Tmax). True elimination ke = ln2/t½_true is a third rate. Body amount = release convolved with e^(−ke·t) (F1). The scale factor S·F·t½_true/t½_app falls out of this.
2. Today's number for depots with a Tmax is NOT "depot + body": it leaves out oil not yet released (0 of the new dose at injection). The picture's "Hoje" note must not say depot + body.
3. HGH is flip-flop (Genotropin: IV t½ 0.4 h, SC 3.0 h "due to slow absorption", F 0.80): today overstates ~11×. EPO likely flip-flop (IV 4–13 h vs SC 16–24 h).
4. Things that break when amounts shrink: dosesInLevel (serumModel ~303, ≥1% of own amount) must count on the release shape; curveDecaySamples must include ln2/ke in halfMs (HGH fast rise); band edges shown with 2 significant figures (0.081 must not read "0,1").
5. Steady-state average body amount = S·F·D·t½_true/(ln2·τ), independent of t½_app → sourced for testosterone esters even where the shape is not.
6. Depot (93–163 mg) and body (0.08–1.1 mg) differ ~150×: the body line has its own scale; the depot is its own labeled layer.

## Formulas (per dose D; t = hours since the dose)
- F1 depot with Tmax: A = D·S·F·kd·kr/(kr−kd)·[(e^−kd·t − e^−ke·t)/(ke−kd) − (e^−kr·t − e^−ke·t)/(ke−kr)]
- Not yet released (depot layer) with Tmax: U = D·S·(kr·e^−kd·t − kd·e^−kr·t)/(kr−kd)
- Depot without Tmax: A = D·S·F·kd/(ke−kd)·(e^−kd·t − e^−ke·t); U = D·S·e^−kd·t
- Mass balance ∫release = D·S·F; still a sum of exponentials (exactCarry holds); add the limit forms for ke = kd and ke = kr.
- Band: A at t½_true lo and hi (A rises with t½_true).
- Non-flip-flop SC: A = today × F.
- U is mass balance from the label t½ and Tmax, assuming F = 1 for IM esters (no IV-referenced study: label it an assumption). Where t½_app has no source (trenbolone, drostanolone, boldenone, methenolone, stanozolol, suspension, NPP, propionate) U comes from an invented rate: keep the "sem estudo" style, never call it sourced.
- No t½_true: draw only D·S·U labeled "ainda não liberado do local da aplicação" and write "parte já no corpo: sem estudo" (never "no local + no corpo").

## Worked example — testosterone cypionate 100 mg weekly, steady state
kd 0.003610/h, kr 0.0355/h, S 0.6990, F 1 (assumed), t½_true 10–100 min.
- Today (ester mg): trough 133, peak 186 (~47 h), 84 h 175, average 165.
- After, testosterone in the body: trough 0.081–0.81 mg, peak 0.11–1.13 mg, 84 h 0.11–1.06 mg, average 0.10–1.00 mg.
- After, depot (testosterone mg): 163 just after injection, 143 at 47 h, 126 at 84 h, 93 just before the next dose, average 127.
- Cross-check: MCR ~45 L/h → Css ≈ 9 µg/L (~900 ng/dL); Vd 11–108 L → body 0.1–1.0 mg; plasma alone ~0.03 mg.

## Depot esters (IM oil). Testosterone t½_true 10–100 min [0.167, 1.667 h] (Delatestryl label, C-mirror; re-read DailyMed). F for all IM esters: not measured → assumed 1 (U).
| key | S | t½_true | notes |
|---|---|---|---|
| Testosterone Cypionate | 288.43/412.61 = 0.6990 | 10–100 min | t½_app 8 d (Depo-T), Tmax 71.7 h (Azmiro) |
| Testosterone Enanthate | 288.43/400.60 = 0.7200 | 10–100 min | label apparent t½ itself 4.5–8 d |
| Testosterone Propionate | 288.43/344.49 = 0.8373 | 10–100 min | t½_app "IM 0.8d" uncited (U); SS average sourced |
| Testosterone Undecanoate | 288.43/456.71 = 0.6315 | 10–100 min | 90 d (Nebido) vs 33.9 d (Aveed): band or resolve (U) |
| Testosterone Suspension | 1.00 | 10–100 min | t½_app basis none: shape invented, SS average sourced |
| Sustanon 250 | 176.19/250 = 0.7048 | 10–100 min | one exponential for 4 esters; sub-ester t½s unsourced (U) |
| Nandrolone Decanoate | 274.40/428.65 = 0.6402 | NO SOURCE (4.3 h is Wikipedia) | draw U only |
| Nandrolone Phenylpropionate | 274.40/406.56 = 0.6749 | NO SOURCE | draw U only |
| Trenbolone Acetate | 270.37/312.41 = 0.8654 | NO SOURCE | U from invented rate |
| Trenbolone Enanthate | 270.37/382.54 = 0.7068 | NO SOURCE | same |
| Trenbolone Hexahydrobenzylcarbonate | 270.37/410.55 = 0.6586 | NO SOURCE | same |
| Drostanolone Propionate | 304.47/360.54 = 0.8445 | NO SOURCE | same |
| Drostanolone Enanthate | 304.47/416.65 = 0.7308 | NO SOURCE | same |
| Boldenone Undecylenate | 286.41/454.69 = 0.6299 | NO SOURCE | same |
| Methenolone Enanthate | 302.46/414.63 = 0.7295 | NO SOURCE | same |
| Stanozolol injectable | 1.00 | NO SOURCE | same |
| Estradiol Valerate | 272.38/356.51 = 0.7640 | IV 27.45±5.65 min (White 1998, snippet, U) | draw U until a primary source is read |
| Estradiol Cypionate | 272.38/396.57 = 0.6869 | same | t½_app 90±76 h |
| Progesterone (in oil) | 1.00 | 3–90 min secondary only (U) | draw U |

## SC proteins/peptides with human F (A = today × F unless flip-flop)
| key | F | notes |
|---|---|---|
| Semaglutide | 0.89 | Ozempic §12.3 (L) |
| Tirzepatide | 0.80 | Mounjaro §12.3 (L) |
| Liraglutide | 0.55 | Victoza (C); IV t½ unresolved, flip-flop open |
| Dulaglutide | per dose (AD-95): 0.75 mg → 0.65; 1.5 mg → 0.47 (C); 3 and 4.5 mg → 0.47 "estimated" (label, C); between 0.75 and 1.5 → band [0.47, 0.65], never interpolated; <0.75 or >4.5 → ceiling | label's dose proportionality contradicts F 65→47%: flag, don't resolve |
| Cetrorelix Acetate | 0.85 | Cetrotide (L); t½ dose-dependent (5/20.6/62.8 h) → band |
| PT-141 | ~1.00 | Vyleesi (C-mirror) |
| Octreotide | ~1.00 | label summary (L) |
| HCG | ceiling; 0.40 measured only for recombinant SC (Ovidrel, C) | not flip-flop (IV 26.5 h vs SC 29 h) |
| FSH | band [0.70 Gonal-f, 0.778 Follistim] (C) | flip-flop U |
| HMG | ceiling | |
| HGH | 0.80 (Genotropin, C) | FLIP-FLOP: t½_true 0.4 h IV (C); F1 with ke 1.73/h vs kr 0.31/h; ~0.09× today |
| EPO | ceiling (20–40% secondary, U) | FLIP-FLOP: t½_true [4, 13] h IV (Epogen, C) |
| Tesamorelin | < 0.04 upper bound (Egrifta, C) | dashed ceiling at F = 0.04, "no máximo X", no fill, no lower edge; t½ conflict (8 / 11 / 26–38 min) → t½ band |

Ceiling, no human F (U): Retatrutide, Cagrilintide, Eloralintide, Exenatide, Survodutide, Mazdutide, Albiglutide, Lixisenatide, Thymosin Alpha-1, CJC-1295 with DAC, Sermorelin, Hexarelin, GHRP-2, GHRP-6, Ipamorelin, Triptorelin, Gonadorelin, Kisspeptin-10, Kisspeptin-13, Melanotan I, Melanotan II, Oxytocin, SS-31, ACE-031, ARA-290, Thymosin Beta-4, VIP, Ghrelin, AICAR, Peptide T.

No human data, ceiling + existing "sem estudo": BPC-157, TB-500, GHK-Cu, KPV, Pentadeca Arginate, CJC-1295 no DAC, IGF-1 DES, AOD-9604, Fragment 176-191, MOTS-c, Epithalon, Ac-Epithalon, N-Acetyl-Epitalon-Amidate, Selank, N-Acetyl Selank Amidate, Semax, N-Acetyl Semax Amidate, P21, Pinealon, DSIP, LL-37, Follistatin-344, MGF, Cecropin B, Humanin, Orexin-A, PE-22-28, Thymulin, α-Endorphin, γ-Endorphin, α-MSH.

IV/IM small molecules (F = 1 only if IV; SC/IM ceiling): L-Carnitine (Carnitor IV, endogenous pool dominates), Glutathione (IV, excess above baseline), NAD+ (IV, placeholder t½), B12 injectable (IM hydroxocobalamin, F unsourced, early urinary loss not modeled, U), Melatonin (SC F unmeasured).
Oral: MK-677 (no human absolute F → ceiling; no Tmax → instant peak too high), GTS-21 (same).
Peptide S: approved products dosed as free base (L); grey-market vials S = 1 "as labeled on the vial"; never invent a salt factor.

## Still owed before ship
Primary sources for parent elimination t½ (estradiol: White 1998, Kuhl 2005; progesterone; nandrolone); re-read the testosterone 10–100 min line on DailyMed; resolve undecanoate 90 d vs 33.9 d; re-read every L row; fit F1 against published serum curves (e.g. Azmiro TC steady state).

## Presentation
Every body number: "estimativa: entre X e Y mg de testosterona no corpo (não é o exame de sangue)"; ceilings "no máximo X"; depot on its own labeled scale; band edges with 2 significant figures.

Sources: Trulicity USPI §12.3 (uspl.lilly.com/trulicity), Genotropin clinical pharmacology (pfizermedical.com), Ovidrel PI (drugs.com), Egrifta label (ndclist.com), Delatestryl monograph (globalrph.com), Depo-Testosterone (DailyMed setid 2f72be32-ede6-44d9-88a0-0653b53a3e47), Victoza (globalrph.com), Epogen PI (accessdata.fda.gov 103234s5195spi), Follistim (drugcentral.org), Gonal-f SG (MIMS), Vyleesi (rxreasoner.com), semaglutide PK table (PMC8736331).

## Label re-read 2026-11-13 (DailyMed / primary)
- Semaglutide 89% (Ozempic §12.3) — confirmed. Tirzepatide 80% mean (Mounjaro §12.3) — confirmed. Cetrorelix 85% in healthy women — confirmed; t½ dose-dependent (5.0 h single 0.25 mg, 20.6 h 0.25 mg daily ×14, 62.8 h single 3 mg): the app keeps 20.6 h (daily use), a per-dose band is a follow-up. Octreotide SC "absorbed rapidly and completely", bioequivalent to IV — confirmed ~1.
- Testosterone t½ 10–100 min — confirmed on the Aveed USPI §12.3 Excretion (now the cited source).
- Testosterone undecanoate: Nebido SmPC §5.2 "release rate … half life of 90±40 days" (a release t½ = the app's apparent t½, kept at 90 d); Aveed USPI gives no terminal t½ (Tmax median 7 d); 33.9 d / 20.9 d are Behre 1999 (literature), not a label — never banded with the 90 d release value.
- Estradiol IV terminal t½ 27.45 ± 5.65 min, n = 8 postmenopausal women (White CM et al., Pharmacotherapy 1998;18(6):1343–6, PMID 9855336, abstract) — estradiol esters now draw the body band (mean ± SD).
- Progesterone IV t½: no human primary source found yet (next: Kharasch 1997) — stays "sem estudo".
