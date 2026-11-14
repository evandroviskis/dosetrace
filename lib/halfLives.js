// Verified elimination half-lives (hours) for serum curve modeling.
// tier: 'clinical' = FDA/EMA label or robust human PK
//       'studied'  = human PK published, not an approved US drug
//       'estimated' = animal-only data or extrapolation — no human PK
// For IM oil-depot esters, values are absorption-limited (flip-flop) apparent half-lives.
// basis (tier 'estimated' only; founder 2026-11-01, the curve's no-study warning): where the estimate comes
// from — 'animal' (animal studies), 'analog' (a similar compound), 'thin' (little human data), 'none' (no measurement).
// It names where the DRAWN value comes from (pharmacometrician council 2026-11-01): a textbook value that ignores the
// compound's animal data is 'none'; a value taken from another peptide's data is 'analog'.
export const HALF_LIVES = {
  'Semaglutide': { hours: 168, tier: 'clinical', source: 'Ozempic/Wegovy FDA label; SC Tmax 1–3 d', tmaxHours: 48, tmaxRange: [24, 72] },
  'Tirzepatide': { hours: 120, tier: 'clinical', source: 'Mounjaro/Zepbound FDA labels §12.3; SC median Tmax 24 h, range 8–72 h (Zepbound label §12.3)', tmaxHours: 24, tmaxRange: [8, 72] },
  'Retatrutide': { hours: 144, tier: 'studied', source: 'Coskun Cell Metab 2022' },
  'Cagrilintide': { hours: 180, tier: 'studied', source: 'Enebo Lancet 2021 (PMID 33894838): SC Tmax median 24–72 h; single 0.6 mg median 72 h, range 24–120 h (PMID 42228334, Table 2)', tmaxHours: 72, tmaxRange: [24, 120] },
  'Eloralintide': { hours: 336, tier: 'studied', source: 'Bhattachar DOM 2026 — LY3841136 phase 1, terminal t1/2 ~13-15 days' },
  'Liraglutide': { hours: 13, tier: 'clinical', source: 'Victoza/Saxenda FDA labels §12.3; SC Tmax 8–12 h (Victoza), 11 h (Saxenda label §12.3)', tmaxHours: 11, tmaxRange: [8, 12] },
  'Exenatide': { hours: 2.4, tier: 'clinical', source: 'Byetta FDA label; SC median Tmax 2.1 h (§12.3)', tmaxHours: 2.1, tmaxRange: null },
  'Survodutide': { hours: 144, tier: 'studied', source: 'J Hepatol 2024 phase 1' },
  'Mazdutide': { hours: 192, tier: 'studied', source: 'phase 1b PK (PMID 34430840, Table 3, first dose): Tmax median 72 h, range 11.8–120 h', tmaxHours: 72, tmaxRange: [11.8, 120] },
  'BPC-157': { hours: 0.25, tier: 'estimated', basis: 'animal', tmaxHours: 0.05, tmaxRange: null, source: 'Rat IV t½ 15.2 min, the one precise value (founder 2026-11-01); rat/dog IM t½ 8–30 min (He 2022, PMID 36588717); rat IM peak at 3 min (same study), drawn as a rise to that peak (founder 2026-11-01): an instant peak reads ~13% high at t½ 15 min; no human PK' },
  'TB-500': { hours: 2, tier: 'estimated', basis: 'analog', source: 'No PK for the Ac-LKKTETQ fragment; value borrowed from full-length Tβ4 IV data (PMID 34346165)' },
  'Thymosin Beta-4': { hours: 2, tier: 'studied', source: 'Human IV phase 1, dose-dependent t½ 0.5–2.1h (Wang 2021, PMID 34346165); SC unpublished' },
  'GHK-Cu': { hours: 0.75, tier: 'estimated', basis: 'none', source: 'No t½ in any species; rat IV shows rapid degradation (Endo 1997, PMID 9187381); extrapolated' },
  'KPV': { hours: 2, tier: 'estimated', basis: 'none', source: 'No published PK in any species; extrapolated' },
  'Pentadeca Arginate': { hours: 0.25, tier: 'estimated', basis: 'analog', tmaxHours: 0.05, tmaxRange: null, source: 'No PDA PK; same sequence as BPC-157 — its value, rat IV t½ 15.2 min (founder 2026-11-01); rat/dog IM t½ <30 min, rat IM peak at 3 min (PMID 36588717), drawn as a rise to that peak as BPC-157 (an instant peak reads ~13% high); no human PK' },
  'ARA-290': { hours: 0.33, tier: 'studied', source: 'phase 2 human PK' },
  'Thymosin Alpha-1': { hours: 2, tier: 'studied', source: 'Zadaxin, approved abroad' },
  'CJC-1295 with DAC': { hours: 168, tier: 'studied', source: 'Teichman 2006 JCEM' },
  'CJC-1295 no DAC': { hours: 0.5, tier: 'estimated', basis: 'analog', source: 'No PK for Mod GRF(1-29); analog tesamorelin SC t½ 8–38 min (FDA label); extrapolated' },
  'Ipamorelin': { hours: 2, tier: 'studied', source: 'Human IV terminal t½ 2h, healthy men (Gobburu 1999, PMID 10496658); SC unpublished' },
  'Tesamorelin': { hours: 0.13, tier: 'clinical', source: 'Egrifta SV FDA label — SC elimination t½ ~8 min (WR ~11 min); median Tmax 0.15 h (Egrifta label §12.3)', tmaxHours: 0.15, tmaxRange: null },
  'Sermorelin': { hours: 0.2, tier: 'clinical', source: 'former FDA drug' },
  'Hexarelin': { hours: 1, tier: 'studied', source: 'Imbimbo 1994 human' },
  'GHRP-2': { hours: 0.5, tier: 'studied', source: 'human PK; JP diagnostic' },
  'GHRP-6': { hours: 0.5, tier: 'studied', source: 'peptide PK ~20 min' },
  'MK-677': { hours: 24, tier: 'studied', source: 'Chapman 1996 JCEM (oral)' },
  'HGH': { hours: 3.5, tier: 'clinical', source: 'Somatropin labels (SC apparent); median Tmax 4.0 h, range 3–8 h (Humatrope label §12.3)', unit: 'IU', iuPerMg: 3, tmaxHours: 4.0, tmaxRange: [3, 8] },
  'IGF-1 LR3': { hours: 24, tier: 'estimated', basis: 'animal', source: 'EXCLUDED from curve — no t½ in any species; rat IV clears ~10x faster than IGF-1 (PMID 7693845)' },
  'IGF-1 DES': { hours: 0.5, tier: 'estimated', basis: 'animal', source: 'Rat IV clears ~4x faster than IGF-1 (Ballard 1991, PMID 2005410); no human PK; extrapolated' },
  'Testosterone Cypionate': { hours: 192, tier: 'clinical', source: 'Depo-Testosterone IM ~8d; Tmax median 71.7h, range 24–191h (Azmiro FDA label §12.3)', substance: 'testosterone', tmaxHours: 71.7, tmaxRange: [24, 191] },
  'Testosterone Enanthate': { hours: 120, tier: 'clinical', source: 'Delatestryl IM 4.5-8d; IM Tmax mean 33.3 h at steady state, 200 mg (Kaminetsky 2015, PMID 26797061, Table 2; SC arms 35.5 h at 100 mg, 45.4 h at 50 mg)', substance: 'testosterone', tmaxHours: 33.3, tmaxRange: null },
  'Testosterone Propionate': { hours: 20, tier: 'clinical', source: 'IM 0.8d', substance: 'testosterone' },
  'Testosterone Undecanoate': { hours: 2160, tier: 'clinical', source: 'Nebido SmPC — depot RELEASE t½ ~90d governs serum accumulation (absorption-limited/flip-flop); 33.9d is the ester, not serum decline; Tmax median 7d, range 4–42d (Nebido SmPC, Aveed label)', substance: 'testosterone', tmaxHours: 168, tmaxRange: [96, 1008] },
  'Testosterone Suspension': { hours: 24, tier: 'estimated', basis: 'none', source: 'No published PK for aqueous testosterone; apparent value extrapolated', substance: 'testosterone' },
  'Sustanon 250': { hours: 168, tier: 'estimated', basis: 'thin', source: 'No labeled t½; apparent value fitted to SmPC timing (peak 24–48h, SmPC dosing interval ~21d); early propionate peak not modeled; SmPC peak 24–48h', substance: 'testosterone', tmaxHours: 36, tmaxRange: [24, 48] },
  'Nandrolone Decanoate': { hours: 216, tier: 'clinical', source: 'PMID 15713722 (7-12d); IM Tmax depends on the dose: 30 h with 50 and 100 mg, 72 h with 150 mg (same study) — 72 h is used (the doses people log are mostly 150 mg or more); above 150 mg not studied', substance: 'nandrolone', tmaxHours: 72, tmaxRange: null },
  'Nandrolone Phenylpropionate': { hours: 65, tier: 'estimated', basis: 'thin', source: 'Human IM PK exists (Minto 1997, PMID 9103484) but the 2.7d value is unconfirmed; apparent (absorption-limited)', substance: 'nandrolone' },
  'Trenbolone Acetate': { hours: 48, tier: 'estimated', basis: 'none', source: 'Extrapolated; no IM PK in any species (human data oral/urinary only)', substance: 'trenbolone' },
  'Trenbolone Enanthate': { hours: 168, tier: 'estimated', basis: 'none', source: 'Extrapolated from ester chain length; no PK data (never an approved product)', substance: 'trenbolone' },
  'Trenbolone Hexahydrobenzylcarbonate': { hours: 240, tier: 'estimated', basis: 'none', source: 'Extrapolated; no PK data (Parabolan label dosed every ~15d)', substance: 'trenbolone' },
  'Drostanolone Propionate': { hours: 48, tier: 'estimated', basis: 'none', source: 'Extrapolated; the 2d figure is from a non-scientific reference book; no PK data', substance: 'drostanolone' },
  'Drostanolone Enanthate': { hours: 168, tier: 'estimated', basis: 'none', source: 'Extrapolated from ester chain length; no PK data', substance: 'drostanolone' },
  'Boldenone Undecylenate': { hours: 336, tier: 'estimated', basis: 'none', source: 'Textbook ~14d; horse IM t½ 123h (Soma 2007, PMID 17348894); no human PK', substance: 'boldenone' },
  'Methenolone Enanthate': { hours: 252, tier: 'estimated', basis: 'none', source: 'Secondary textbook ~10.5d; no primary PK data' },
  'Stanozolol injectable': { hours: 24, tier: 'estimated', basis: 'none', source: 'Textbook 24h; only measured IM data is ~3.4x longer — horse t½ 82h (Soma 2007, PMID 17348894); no human PK' },
  'HCG': { hours: 32, tier: 'clinical', source: 'SC/IM terminal ~32h; SC Tmax median 24 h, range 12–24 h (Ovidrel, recombinant hCG, label §12.3); urinary hCG IM mean peak ~20 h (PMID 9688371)', unit: 'IU', tmaxHours: 24, tmaxRange: [12, 24] },
  'HMG': { hours: 30, tier: 'studied', source: 'Menopur label, FSH activity; SC Tmax mean 17.9 h (Menopur label PK table; IM 27.5 h)', unit: 'IU', tmaxHours: 17.9, tmaxRange: null },
  'FSH': { hours: 30, tier: 'clinical', source: 'Gonal-F/Follistim labels; SC Tmax mean 12.9 h (Follistim AQ label §12.3 Table 5; Gonal-f label ~16 h)', unit: 'IU', tmaxHours: 12.9, tmaxRange: null },
  'Gonadorelin': { hours: 0.5, tier: 'clinical', source: 'Factrel 10-40 min' },
  'Kisspeptin-10': { hours: 0.07, tier: 'studied', source: 'human ~4 min' },
  'Triptorelin': { hours: 3, tier: 'clinical', source: 'Trelstar label (IR)' },
  'Melanotan I': { hours: 0.5, tier: 'studied', source: 'afamelanotide injected t½ ~0.5h (IV 0.14-0.52h); the 15h Scenesse figure is implant-depot kinetics, not injection' },
  'Melanotan II': { hours: 1, tier: 'studied', source: 'small human studies' },
  'PT-141': { hours: 2.7, tier: 'clinical', source: 'Vyleesi FDA label; median Tmax ~1.0 h, range 0.5–1.0 h (§12.3)', tmaxHours: 1.0, tmaxRange: [0.5, 1.0] },
  'Oxytocin': { hours: 0.2, tier: 'clinical', source: 'Pitocin label; IV ~20 min' },
  'AOD-9604': { hours: 0.4, tier: 'estimated', basis: 'animal', source: 'Pig IV t½ ~3 min (Moré 2014, doi:10.14740/jem213w); no human PK; 0.4h adds an assumed SC absorption allowance' },
  'Fragment 176-191': { hours: 0.4, tier: 'estimated', basis: 'analog', source: 'No PK; assumed like AOD-9604 (pig IV t½ ~3 min, Moré 2014) plus an SC absorption allowance' },
  'MOTS-c': { hours: 1, tier: 'estimated', basis: 'none', source: 'No published PK (human or animal); CB4211 analog PK undisclosed; value is a placeholder' },
  'Epithalon': { hours: 0.5, tier: 'estimated', basis: 'none', source: 'No PK in any species (review, PMID 40141333); extrapolated' },
  'Ac-Epithalon': { hours: 0.5, tier: 'estimated', basis: 'none', source: 'Modified form of Epithalon; no PK; parent value used; persistence unmeasured' },
  'N-Acetyl-Epitalon-Amidate': { hours: 0.5, tier: 'estimated', basis: 'none', source: 'Modified form of Epithalon; no PK; parent value used; persistence unmeasured' },
  'SS-31': { hours: 4, tier: 'studied', source: 'Stealth trials human PK' },
  'NAD+': { hours: 1, tier: 'estimated', basis: 'thin', source: 'No human t½; IV 750 mg/6h cleared fast early, still raised 2h after (Grant 2019, PMID 31572171); placeholder' },
  'Selank': { hours: 0.5, tier: 'estimated', basis: 'thin', source: 'No t½; nasal plasma levels decline within ~5 min (Russian label); injected t½ unpublished; extrapolated' },
  'N-Acetyl Selank Amidate': { hours: 0.5, tier: 'estimated', basis: 'analog', source: 'Modified form of Selank; no PK; parent value used; persistence unmeasured' },
  'Semax': { hours: 0.5, tier: 'estimated', basis: 'animal', source: 'No t½; rat nasal — broken down within minutes (Shevchenko 2006, PMID 16523722); extrapolated' },
  'N-Acetyl Semax Amidate': { hours: 0.5, tier: 'estimated', basis: 'analog', source: 'Modified form of Semax; no PK; parent value used; persistence unmeasured' },
  'P21': { hours: 3, tier: 'estimated', basis: 'animal', source: 'Mouse plasma t½ >3h, a lower bound (Kazim & Iqbal 2016, PMID 27400746); no human PK' },
  'Dihexa': { hours: 3, tier: 'estimated', basis: 'animal', source: 'EXCLUDED from curve — only data rat t½ 8.8–12.7 d (McCoy 2013, PMID 23055539), under a 2021 Expression of Concern' },
  'Pinealon': { hours: 1, tier: 'estimated', basis: 'none', source: 'No published PK in any species; class estimate' },
  'DSIP': { hours: 0.13, tier: 'estimated', basis: 'animal', source: 'IV t½ 4 min dog, 2–3 min monkey/rat (Kato 1984, PMID 6379493); no human PK; SC absorption allowance' },
  'LL-37': { hours: 0.5, tier: 'estimated', basis: 'none', source: 'No systemic PK published; human data topical only (Grönberg 2014, PMID 25041740); extrapolated' },
  'VIP': { hours: 0.03, tier: 'studied', source: 'Domschke 1978 ~1-2 min' },
  // Insulins are loggable but EXCLUDED from the accumulation curve (see
  // CURVE_EXCLUDED below): rapid-acting is dosed to effect not accumulation, and
  // an implied insulin "level" is the one place a misread is dangerous. Kept as
  // reference values only. Glargine has no labeled t½ (peakless) — its number is
  // a modeling assumption, not a clinical value.
  'Insulin Lispro': { hours: 1, tier: 'studied', source: 'Humalog label (SC t1/2 ~1h; dosed to effect, not accumulation)' },
  'Insulin Aspart': { hours: 1.35, tier: 'studied', source: 'Novolog label (SC t1/2 ~81min; dosed to effect)' },
  'Insulin Glargine': { hours: 12, tier: 'estimated', basis: 'thin', source: 'Lantus label — peakless, no labeled t1/2; 12h is a modeling assumption' },
  'Insulin Degludec': { hours: 25, tier: 'studied', source: 'Tresiba label (terminal t1/2 ~25h)' },
  'Glutathione injectable': { hours: 0.25, tier: 'studied', source: 'Human IV t½ 14±9 min of the excess above baseline (Aebi 1991, PMID 1907548); IM/SC unpublished' },
  'B12 injectable': { hours: 144, tier: 'clinical', source: 'hydroxocobalamin ~6d' },
  'L-Carnitine injectable': { hours: 17.4, tier: 'clinical', source: 'Carnitor IV FDA label — terminal t½ 17.4h (2-compartment; large endogenous pool dominates)' },
  // --- Added 2026-09-10 (pharmacometrician-sourced; see STATE.md) ---
  // Approved drugs — authoritative (clinical)
  'Dulaglutide': { hours: 120, tier: 'clinical', source: 'Trulicity FDA label §12.3 — GLP-1 Fc fusion, t½ ~5d; SC Tmax at steady state median 48 h, range 24–72 h', tmaxHours: 48, tmaxRange: [24, 72] },
  'Albiglutide': { hours: 120, tier: 'clinical', source: 'Tanzeum FDA label — albumin fusion, t½ ~5d' },
  'Lixisenatide': { hours: 3, tier: 'clinical', source: 'Adlyxin FDA label — terminal t½ ~3h; median Tmax 1–3.5 h, 2.0 h arm/abdomen (Lyxumia PI)', tmaxHours: 2.0, tmaxRange: [1, 3.5] },
  'Octreotide': { hours: 1.7, tier: 'clinical', source: 'Sandostatin label — SC immediate-release ~1.7h (NOT the LAR depot); Tmax 0.4 h (0.7 h in acromegaly — two groups, not a range between people)', tmaxHours: 0.4, tmaxRange: null },
  'EPO': { hours: 24, tier: 'clinical', source: 'Epogen/Procrit — SC absorption-limited ~16-24h (IV shorter)' },
  'Estradiol Valerate': { hours: 84, tier: 'clinical', source: 'Oriowo 1980 (PMID 7389356) — IM apparent flip-flop ~3.5d; serum estradiol Tmax ~2 days (same study)', substance: 'estradiol', tmaxHours: 48, tmaxRange: null },
  'Progesterone': { hours: 20, tier: 'studied', source: 'progesterone-in-oil IM — absorption-limited, apparent (not terminal) t½; Tmax ~8 h (progesterone-in-oil label, DailyMed setid 7d19df3b: "maximum plasma concentrations … within approximately 8 hours"), ~24-48h to baseline', substance: 'progesterone', tmaxHours: 8, tmaxRange: null },
  // Human PK published, not US-approved (studied)
  'Estradiol Cypionate': { hours: 90, tier: 'studied', source: 'ester apparent t½ ~90h (89.65 ± 76.04h), healthy-female PK, PMID 30947128; serum estradiol Tmax ~4 days from a different study (Oriowo 1980, PMID 7389356) — two sources, the t½ spread is wide', substance: 'estradiol', tmaxHours: 96, tmaxRange: null },
  'ACE-031': { hours: 336, tier: 'studied', source: 'Attie 2013 Muscle Nerve — ActRIIB-Fc phase 1, t½ ~10-15d' },
  'Ghrelin': { hours: 0.5, tier: 'studied', source: 'human infusion — acyl ~10-13min, total ~30min' },
  'Melatonin': { hours: 0.75, tier: 'studied', source: 'exogenous IV/SC human — t½ ~40-60min' },
  'GTS-21': { hours: 1.5, tier: 'studied', source: 'DMXB-A human phase 1/2 — short t½' },
  'AICAR': { hours: 0.5, tier: 'studied', source: 'acadesine (GUARDIAN) human — short t½' },
  'Peptide T': { hours: 0.5, tier: 'studied', source: '1980s-90s human trials — cleared in minutes' },
  'Kisspeptin-13': { hours: 0.1, tier: 'estimated', basis: 'analog', source: 'No KP-13 PK; human IV t½ KP-10 ~4 min (PMID 21976724), KP-54 27.6 min (PMID 16174713)' },
  // No human PK — render DASHED (estimated); class analogies, NOT measurements
  'Cetrorelix Acetate': { hours: 20.6, tier: 'clinical', source: 'Cetrotide label (SC): 20.6h with 0.25 mg daily; single 0.25 mg 5h, single 3 mg 62.8h — dose-dependent; Tmax median 1.0 h, range 0.5–2 h (Cetrotide label PK table)', tmaxHours: 1, tmaxRange: [0.5, 2] },
  'Follistatin-344': { hours: 1, tier: 'estimated', basis: 'animal', source: 'No human PK; native follistatin cleared rapidly in mice (Datta-Mannan 2013, PMID 23249626); extrapolated' },
  'MGF': { hours: 0.1, tier: 'estimated', basis: 'none', source: 'No published PK in any species; assumed short (unmodified peptide)' },
  'PEG-MGF': { hours: 48, tier: 'estimated', basis: 'none', source: 'EXCLUDED from curve — undefined PEGylated product; no PK in any species' },
  'Adipotide': { hours: 2, tier: 'estimated', basis: 'none', source: 'EXCLUDED from curve — no PK in any species; phase 1 NCT01262664 terminated without results' },
  'Cecropin B': { hours: 1, tier: 'estimated', basis: 'none', source: 'No published PK in any species; class extrapolation' },
  'FOXO4-DRI': { hours: 0.5, tier: 'estimated', basis: 'none', source: 'EXCLUDED from curve — no PK in any species; D-retro-inverso design resists breakdown' },
  'Humanin': { hours: 1, tier: 'estimated', basis: 'analog', source: 'Native humanin unstudied; analog HNG (S14G) t½ ~0.5h mouse, >4h rat, IP (Chin 2013, PMID 23836030)' },
  'Orexin-A': { hours: 0.5, tier: 'estimated', basis: 'animal', source: 'Rat IV t½ 27 min (Ehrström 2004, PMID 15120482); no human PK' },
  'PE-22-28': { hours: 0.5, tier: 'estimated', basis: 'animal', source: 'Short serum t½, unquantified, mouse (Djillani 2017, PMID 28955242); no human PK' },
  'RGD Peptide': { hours: 0.3, tier: 'estimated', basis: 'none', source: 'EXCLUDED from curve — "RGD peptide" is a motif, not one defined molecule; no PK' },
  'Thymalin': { hours: 1, tier: 'estimated', basis: 'none', source: 'EXCLUDED from curve — undefined thymic polypeptide extract; no PK' },
  'Thymulin': { hours: 1, tier: 'estimated', basis: 'none', source: 'No verified PK; mouse bioassay reports unconfirmed; extrapolated' },
  'α-Endorphin': { hours: 0.3, tier: 'estimated', basis: 'none', source: 'No published PK in any species; extrapolated from POMC-fragment peptides' },
  'γ-Endorphin': { hours: 0.3, tier: 'estimated', basis: 'analog', source: 'No human t½; rat IV des-Tyr-γ-endorphin t½ 5.5 min, SC longer (Verhoef 1985, PMID 4070016)' },
  'α-MSH': { hours: 0.3, tier: 'estimated', basis: 'thin', source: 'Human IV radiolabel, n=1 per run: t½ 4.8–25 min (Redding 1978, PMID 714971); too thin for "studied"' },
};

// ── Dose in the body (docs/specs/dose-in-body.md DB-1…DB-11; model and every number below:
// docs/review/dose-in-body-params.md, pharmacometrician 2026-11-13) ─────────────────────────────
// The curve shows the amount of the compound in the body: what reached the circulation and was not
// eliminated yet. Per compound, next to its apparent half-life above:
//   S       — the share of the dosed mass that is the parent hormone (formula masses; 1 = as dosed);
//   F       — the share of each dose that reaches the body: { value } | { range } (a band) |
//             { ceiling: true } (no human F: drawn at F = 1 and read "no máximo") | { ceiling, bound }
//             (an upper bound from a label) | { perDose } (dulaglutide, per dose, AD-95);
//   tTrue   — the parent's own elimination half-life (hours, a range [lo, hi]): only where a source
//             gives it; null = no source (the oil depot is drawn alone, "sem estudo" for the body).
//   model   — 'release': F1, the app's rates describe release from the depot (IM oil esters; flip-flop
//             proteins HGH and EPO); 'depotOnly': no tTrue, only what is not released yet is drawn;
//             'scaled': today's curve × F (SC compounds that are not flip-flop).
// Every number carries its source and a status (DB-10): 'confirmed' (read from the label or paper),
// 'label to re-read' (a label value not re-read this session) or 'unconfirmed'. Nothing invented: a
// range stays a range, an unknown F is a ceiling.
export const BODY_STATUS = { C: 'confirmed', L: 'label to re-read', U: 'unconfirmed' };
const S_AS_DOSED = { value: 1, source: 'Dosed as the labeled compound: approved products as free base, vials as labeled (params doc: S = 1, never an invented salt factor)', status: 'confirmed' };
const sOf = (parent, ester, what) => ({ value: parent / ester, source: `Formula masses: ${what} ${parent} / ester ${ester} g/mol (params doc)`, status: 'confirmed' });
const F_IM_ASSUMED = { value: 1, assumed: true, source: 'IM oil esters: no IV-referenced study, F = 1 is an assumption (params doc)', status: 'unconfirmed' };
const F_NONE = { ceiling: true, source: 'No human absolute bioavailability: drawn at F = 1 as an upper limit, "no máximo" (params doc)', status: 'unconfirmed' };
const F_NO_HUMAN_DATA = { ceiling: true, source: 'No human data at all: drawn at F = 1 as an upper limit (params doc)', status: 'unconfirmed' };
const F_ROUTE = { ceiling: true, source: 'F = 1 only if given IV; SC / IM not measured, so an upper limit (params doc)', status: 'unconfirmed' };
const F_ORAL = { ceiling: true, source: 'Oral: no human absolute bioavailability, so an upper limit (params doc)', status: 'unconfirmed' };
const T_TESTOSTERONE = { range: [10 / 60, 100 / 60], source: 'Testosterone t½ in plasma 10–100 min (Delatestryl label, globalrph mirror; re-read on DailyMed)', status: 'label to re-read' };
const T_NONE = (why) => ({ none: true, source: why, status: 'unconfirmed' });
const T_NOT_NEEDED = { notUsed: true, source: 'Not used: the curve keeps the apparent half-life (not flip-flop, today × F)', status: 'confirmed' };
const ceilingPeptide = (f = F_NONE) => ({ model: 'scaled', S: S_AS_DOSED, F: f, tTrue: T_NOT_NEEDED });
const testosteroneEster = (S) => ({ model: 'release', S, F: F_IM_ASSUMED, tTrue: T_TESTOSTERONE, parent: 'testosterone', depotLayer: true });
const depotOnly = (S, parent, why) => ({ model: 'depotOnly', S, F: F_IM_ASSUMED, tTrue: T_NONE(why), parent, depotLayer: true });

export const BODY_PARAMS = {
  // DB-1 / DB-2: IM oil esters of testosterone — F1 band at the testosterone t½ 10–100 min, mass of testosterone.
  'Testosterone Cypionate': testosteroneEster(sOf(288.43, 412.61, 'testosterone')),
  'Testosterone Enanthate': testosteroneEster(sOf(288.43, 400.60, 'testosterone')),
  'Testosterone Propionate': testosteroneEster(sOf(288.43, 344.49, 'testosterone')),
  'Testosterone Undecanoate': testosteroneEster(sOf(288.43, 456.71, 'testosterone')),
  'Testosterone Suspension': testosteroneEster({ value: 1, source: 'Aqueous testosterone, dosed as testosterone itself (params doc S = 1.00)', status: 'confirmed' }),
  'Sustanon 250': testosteroneEster({ value: 176.19 / 250, source: 'Formula masses: 176.19 mg testosterone in 250 mg of the four esters (params doc)', status: 'confirmed' }),
  // DB-3: depot esters with NO sourced elimination t½ of the parent — only the depot is drawn.
  'Nandrolone Decanoate': depotOnly(sOf(274.40, 428.65, 'nandrolone'), 'nandrolone', 'No primary source for the nandrolone elimination t½ (the 4.3 h figure is Wikipedia)'),
  'Nandrolone Phenylpropionate': depotOnly(sOf(274.40, 406.56, 'nandrolone'), 'nandrolone', 'No primary source for the nandrolone elimination t½'),
  'Trenbolone Acetate': depotOnly(sOf(270.37, 312.41, 'trenbolone'), 'trenbolone', 'No source for the trenbolone elimination t½'),
  'Trenbolone Enanthate': depotOnly(sOf(270.37, 382.54, 'trenbolone'), 'trenbolone', 'No source for the trenbolone elimination t½'),
  'Trenbolone Hexahydrobenzylcarbonate': depotOnly(sOf(270.37, 410.55, 'trenbolone'), 'trenbolone', 'No source for the trenbolone elimination t½'),
  'Drostanolone Propionate': depotOnly(sOf(304.47, 360.54, 'drostanolone'), 'drostanolone', 'No source for the drostanolone elimination t½'),
  'Drostanolone Enanthate': depotOnly(sOf(304.47, 416.65, 'drostanolone'), 'drostanolone', 'No source for the drostanolone elimination t½'),
  'Boldenone Undecylenate': depotOnly(sOf(286.41, 454.69, 'boldenone'), 'boldenone', 'No source for the boldenone elimination t½'),
  'Methenolone Enanthate': depotOnly(sOf(302.46, 414.63, 'methenolone'), 'methenolone', 'No source for the methenolone elimination t½'),
  'Stanozolol injectable': depotOnly({ value: 1, source: 'Aqueous stanozolol, dosed as stanozolol itself (params doc S = 1.00)', status: 'confirmed' }, 'stanozolol', 'No source for the stanozolol elimination t½'),
  'Estradiol Valerate': depotOnly(sOf(272.38, 356.51, 'estradiol'), 'estradiol', 'Estradiol IV t½ 27.45 ± 5.65 min seen only as a snippet (White 1998): drawn as no source until a primary source is read'),
  'Estradiol Cypionate': depotOnly(sOf(272.38, 396.57, 'estradiol'), 'estradiol', 'Estradiol IV t½ seen only as a snippet (White 1998): no primary source read'),
  'Progesterone': depotOnly({ value: 1, source: 'Progesterone in oil, dosed as progesterone itself (params doc S = 1.00)', status: 'confirmed' }, 'progesterone', 'Progesterone t½ 3–90 min from secondary sources only'),
  // DB-4: SC with a human F on the label, not flip-flop — today × F (a band where F is a range).
  'Semaglutide': { model: 'scaled', S: S_AS_DOSED, F: { value: 0.89, source: 'Ozempic label §12.3: absolute bioavailability 89%', status: 'label to re-read' }, tTrue: T_NOT_NEEDED },
  'Tirzepatide': { model: 'scaled', S: S_AS_DOSED, F: { value: 0.80, source: 'Mounjaro label §12.3: absolute bioavailability 80%', status: 'label to re-read' }, tTrue: T_NOT_NEEDED },
  'Liraglutide': { model: 'scaled', S: S_AS_DOSED, F: { value: 0.55, source: 'Victoza label: absolute bioavailability 55% (globalrph)', status: 'confirmed' }, tTrue: T_NOT_NEEDED },
  'Cetrorelix Acetate': { model: 'scaled', S: S_AS_DOSED, F: { value: 0.85, source: 'Cetrotide label: absolute bioavailability 85%', status: 'label to re-read' }, tTrue: T_NOT_NEEDED },
  'PT-141': { model: 'scaled', S: S_AS_DOSED, F: { value: 1, source: 'Vyleesi label: SC bioavailability ~100% (rxreasoner mirror)', status: 'confirmed' }, tTrue: T_NOT_NEEDED },
  'Octreotide': { model: 'scaled', S: S_AS_DOSED, F: { value: 1, source: 'Sandostatin label summary: SC bioavailability ~100%', status: 'label to re-read' }, tTrue: T_NOT_NEEDED },
  'FSH': { model: 'scaled', S: S_AS_DOSED, F: { range: [0.70, 0.778], source: 'Gonal-f 70% (MIMS) and Follistim 77.8% (drugcentral): two labels, a band', status: 'confirmed' }, tTrue: T_NOT_NEEDED },
  // DB-5: dulaglutide F per dose (AD-95: each dose at its own amount, never per protocol).
  'Dulaglutide': { model: 'scaled', S: S_AS_DOSED, F: { perDose: 'dulaglutide', source: 'Trulicity label §12.3: 65% at 0.75 mg, 47% at 1.5 mg, 47% estimated at 3 and 4.5 mg (uspl.lilly.com)', status: 'confirmed' }, tTrue: T_NOT_NEEDED },
  // DB-6: ceilings (F unknown in people → F = 1, "no máximo").
  'Tesamorelin': { model: 'scaled', S: S_AS_DOSED, F: { ceiling: true, bound: 0.04, source: 'Egrifta label: absolute bioavailability under 4% (ndclist), an upper bound', status: 'confirmed' }, tTrue: T_NOT_NEEDED, dashed: true, hoursHi: { value: 38 / 60, source: 'Egrifta label: SC t½ 26 min (healthy) and 38 min (HIV); 8 / 11 min in the SV label — the ceiling uses the longest', status: 'label to re-read' } },
  'HCG': { model: 'scaled', S: S_AS_DOSED, F: { ceiling: true, measured: 0.40, source: 'Only measurement: 40% for recombinant hCG SC (Ovidrel PI, drugs.com); none for urinary hCG, so an upper limit', status: 'confirmed' }, tTrue: T_NOT_NEEDED },
  'HMG': ceilingPeptide(),
  'Retatrutide': ceilingPeptide(), 'Cagrilintide': ceilingPeptide(), 'Eloralintide': ceilingPeptide(),
  'Exenatide': ceilingPeptide(), 'Survodutide': ceilingPeptide(), 'Mazdutide': ceilingPeptide(),
  'Albiglutide': ceilingPeptide(), 'Lixisenatide': ceilingPeptide(), 'Thymosin Alpha-1': ceilingPeptide(),
  'CJC-1295 with DAC': ceilingPeptide(), 'Sermorelin': ceilingPeptide(), 'Hexarelin': ceilingPeptide(),
  'GHRP-2': ceilingPeptide(), 'GHRP-6': ceilingPeptide(), 'Ipamorelin': ceilingPeptide(),
  'Triptorelin': ceilingPeptide(), 'Gonadorelin': ceilingPeptide(), 'Kisspeptin-10': ceilingPeptide(),
  'Kisspeptin-13': ceilingPeptide(), 'Melanotan I': ceilingPeptide(), 'Melanotan II': ceilingPeptide(),
  'Oxytocin': ceilingPeptide(), 'SS-31': ceilingPeptide(), 'ACE-031': ceilingPeptide(), 'ARA-290': ceilingPeptide(),
  'Thymosin Beta-4': ceilingPeptide(), 'VIP': ceilingPeptide(), 'Ghrelin': ceilingPeptide(), 'AICAR': ceilingPeptide(),
  'Peptide T': ceilingPeptide(),
  // No human data at all: ceiling, and the existing "sem estudo" warning stays (lib/curveEvidence).
  'BPC-157': ceilingPeptide(F_NO_HUMAN_DATA), 'TB-500': ceilingPeptide(F_NO_HUMAN_DATA), 'GHK-Cu': ceilingPeptide(F_NO_HUMAN_DATA),
  'KPV': ceilingPeptide(F_NO_HUMAN_DATA), 'Pentadeca Arginate': ceilingPeptide(F_NO_HUMAN_DATA), 'CJC-1295 no DAC': ceilingPeptide(F_NO_HUMAN_DATA),
  'IGF-1 DES': ceilingPeptide(F_NO_HUMAN_DATA), 'AOD-9604': ceilingPeptide(F_NO_HUMAN_DATA), 'Fragment 176-191': ceilingPeptide(F_NO_HUMAN_DATA),
  'MOTS-c': ceilingPeptide(F_NO_HUMAN_DATA), 'Epithalon': ceilingPeptide(F_NO_HUMAN_DATA), 'Ac-Epithalon': ceilingPeptide(F_NO_HUMAN_DATA),
  'N-Acetyl-Epitalon-Amidate': ceilingPeptide(F_NO_HUMAN_DATA), 'Selank': ceilingPeptide(F_NO_HUMAN_DATA), 'N-Acetyl Selank Amidate': ceilingPeptide(F_NO_HUMAN_DATA),
  'Semax': ceilingPeptide(F_NO_HUMAN_DATA), 'N-Acetyl Semax Amidate': ceilingPeptide(F_NO_HUMAN_DATA), 'P21': ceilingPeptide(F_NO_HUMAN_DATA),
  'Pinealon': ceilingPeptide(F_NO_HUMAN_DATA), 'DSIP': ceilingPeptide(F_NO_HUMAN_DATA), 'LL-37': ceilingPeptide(F_NO_HUMAN_DATA),
  'Follistatin-344': ceilingPeptide(F_NO_HUMAN_DATA), 'MGF': ceilingPeptide(F_NO_HUMAN_DATA), 'Cecropin B': ceilingPeptide(F_NO_HUMAN_DATA),
  'Humanin': ceilingPeptide(F_NO_HUMAN_DATA), 'Orexin-A': ceilingPeptide(F_NO_HUMAN_DATA), 'PE-22-28': ceilingPeptide(F_NO_HUMAN_DATA),
  'Thymulin': ceilingPeptide(F_NO_HUMAN_DATA), 'α-Endorphin': ceilingPeptide(F_NO_HUMAN_DATA), 'γ-Endorphin': ceilingPeptide(F_NO_HUMAN_DATA),
  'α-MSH': ceilingPeptide(F_NO_HUMAN_DATA),
  // IV / IM small molecules and oral compounds: an upper limit.
  'L-Carnitine injectable': ceilingPeptide(F_ROUTE), 'Glutathione injectable': ceilingPeptide(F_ROUTE), 'NAD+': ceilingPeptide(F_ROUTE),
  'B12 injectable': ceilingPeptide(F_ROUTE), 'Melatonin': ceilingPeptide(F_ROUTE),
  'MK-677': ceilingPeptide(F_ORAL), 'GTS-21': ceilingPeptide(F_ORAL),
  // DB-7: flip-flop proteins — F1 with the parent's IV half-life.
  'HGH': { model: 'release', S: S_AS_DOSED, F: { value: 0.80, source: 'Genotropin clinical pharmacology: SC bioavailability 80% (pfizermedical)', status: 'confirmed' }, tTrue: { range: [0.4, 0.4], source: 'Genotropin: IV t½ 0.4 h; SC 3.0 h "due to slow absorption" (flip-flop)', status: 'confirmed' } },
  'EPO': { model: 'release', S: S_AS_DOSED, F: { ceiling: true, source: 'SC bioavailability 20–40% from secondary sources only (unconfirmed): an upper limit', status: 'unconfirmed' }, tTrue: { range: [4, 13], source: 'Epogen PI: IV t½ 4–13 h (accessdata.fda.gov 103234s5195spi); SC 16–24 h is absorption (flip-flop)', status: 'confirmed' } },
};

// Compounds explicitly excluded from the curve — a single-exponential serum t½ would
// be fabricated or physiologically wrong. Still fully pickable for protocols; the curve
// shows "can't model" instead of a fake line:
//  - Blends/mixtures (no single t½): Glow, KLOW, Wolverine, MIC Blend, Lipo-C,
//    Cerebrolysin, Cortexin, Larazotide, amino-acid blends
//  - Non-systemic/local: Hyaluronic Acid (intra-articular/filler), SNAP-8 (topical cosmetic)
//  - Not a therapeutic drug / research immunization: MOG (35-55)
//  - Oral (injectable depot model wrong): Tesofensine, 5-Amino-1MQ
//  - Vitamins — not single-exponential (transcobalamin/hepatic pool, PLP binding):
//    Cyanocobalamin, Methylcobalamin, Pyridoxine
//  - Identity unverified — do NOT ship a number: Adamax, LC120, LC216
//  - Controlled/opioid — pulled from the curve 2026-09-10 (founder call, Apple 1.4.3;
//    still journalable, just no serum curve): Dermorphin
//  - Endogenous protein / not a dosed compound (you don't inject your own myostatin;
//    users dose its INHIBITORS — Follistatin, ACE-031, YK-11 — which stay in the curve).
//    Same molecule (myostatin = GDF-8), no human PK. Pulled 2026-09-10 (founder call):
//    GDF-8, Myostatin

// The app's canonical compound names (i18n English values) that differ from the
// table keys only in spelling/format. Bridged exactly so picker-chosen protocols
// aren't wrongly excluded from the curve.
const NAME_ALIASES = {
  'CJC-1295 without DAC': 'CJC-1295 no DAC',
  'Melanotan 1': 'Melanotan I',
  'Melanotan 2': 'Melanotan II',
  'Hydroxocobalamin': 'B12 injectable', // the B12 entry's value IS hydroxocobalamin
  // (2026-09-24) 'Thymosin Beta-4' and the acetyl/amidated variants now have their
  // OWN entries — Tβ4 (full 43-aa protein, human IV PK) is a different molecule
  // from the TB-500 fragment, and each variant needs its own honest source line.
};

// Compounds that HAVE a table entry but are deliberately kept OFF the accumulation
// curve because a modeled "level" would mislead: insulins (rapid-acting is dosed
// to effect, not accumulation; an implied insulin level is the one place a misread
// is dangerous — DT council 2026-09-18, founder-approved).
//
// Deep-search review 2026-09-24 (5 research agents + pharmacometrician, founder-
// approved): no defensible single t½ exists, so these are kept in the table for
// reference but never chart — IGF-1 LR3 (no t½ in any species; rat data contradicts
// the 24h folklore), Dihexa (only data is rat, under an Expression of Concern),
// PEG-MGF (undefined product), Adipotide (no PK; phase 1 terminated), Thymalin
// (undefined extract), RGD Peptide (a motif, not a molecule), FOXO4-DRI (no PK).
// They MUST live here, not be deleted: a deleted key would fuzzy-match a neighbour
// (PEG-MGF → MGF) and chart a wrong curve.
export const CURVE_EXCLUDED = new Set([
  'Insulin Lispro', 'Insulin Aspart', 'Insulin Glargine', 'Insulin Degludec',
  'IGF-1 LR3', 'Dihexa', 'PEG-MGF', 'Adipotide', 'Thymalin', 'RGD Peptide', 'FOXO4-DRI',
]);

// Resolve a protocol name to its table key: exact → alias → longest fuzzy
// substring match. Returns the key (string) or null.
export function resolveHalfLifeKey(name) {
  if (!name) return null;
  if (HALF_LIVES[name]) return name;
  if (NAME_ALIASES[name]) return NAME_ALIASES[name];
  const lower = name.toLowerCase();
  let best = null;
  let bestLen = 0;
  // A key named inside the protocol name ("Semaglutide 5mg") is a match.
  for (const key of Object.keys(HALF_LIVES)) {
    const kl = key.toLowerCase();
    if (lower.includes(kl) && kl.length > bestLen) {
      best = key;
      bestLen = kl.length;
    }
  }
  // A protocol name that is only PART of a key ("Tirzep") counts only when it is
  // unambiguous: exactly one key contains it, and it is 3+ characters. A custom
  // "Test" must not silently borrow Testosterone Undecanoate's 90-day curve.
  const lt = lower.trim();
  if (!best && lt.length >= 3) {
    const hits = Object.keys(HALF_LIVES).filter(key => key.toLowerCase().includes(lt));
    if (hits.length === 1) best = hits[0];
  }
  // "HGH Frag" / "hgh frag 176-191" is the fragment peptide, not somatropin (it
  // would otherwise chart as HGH, in IU).
  if (best === 'HGH' && /frag/.test(lower) && HALF_LIVES['Fragment 176-191']) return 'Fragment 176-191';
  if (!best) return null;
  // Narrow upgrade only: when a match was found, prefer a LONGER key that is
  // contained in the name once spaces/punctuation/case are stripped, so a typed
  // "PEG MGF" or "pegmgf" resolves to PEG-MGF (and its exclusion) rather than
  // plain MGF. Never creates a match the plain pass didn't find, and ignores
  // short keys (so "nad" can't hit inside "Gonadorelin"-like words).
  const norm = (v) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nName = norm(name);
  let nBestLen = norm(best).length;
  for (const key of Object.keys(HALF_LIVES)) {
    const nk = norm(key);
    if (nk.length >= 5 && nk.length > nBestLen && nName.includes(nk)) {
      best = key;
      nBestLen = nk.length;
    }
  }
  return best;
}

// Rise rate kr (1/h) of a first-order absorption whose peak falls at tmaxHours,
// given the (apparent) decline half-life: solves Tmax = ln(kr/kd)/(kr − kd).
// That peak time is always below 1/kd (its limit as kr → kd), so a Tmax at or past it has no
// solution: null = no modeled rise (pharmacometrics review 2026-10-20, PK-4 — the search used to
// settle on kr = kd × 1.000001, where kr/(kr − kd) cancels). The guard starts a little before the
// limit (Tmax · kd ≥ 0.999). Every Tmax in the table is far below it (curveReviewFixes.test.js).
export function riseRate(hours, tmaxHours) {
  const kd = Math.LN2 / hours;
  if (!(tmaxHours > 0) || !(tmaxHours * kd < 0.999)) return null;
  let lo = kd * 1.000001, hi = 100;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const tm = Math.log(mid / kd) / (mid - kd);
    if (tm > tmaxHours) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Fraction of one dose still counted dtHours after it. Instant absorption (the
// default) is e^(−kd·t). Where a published Tmax exists (oil-depot esters, SC
// semaglutide) it is the Bateman shape kr/(kr−kd)·(e^(−kd·t) − e^(−kr·t)), which
// has the SAME area (1/kd): accumulation and average level are unchanged, only
// the peak moves later and lower. The Tmax is a population median — the curve
// says it varies by person.
const KR_CACHE = {};
// DB-8: a "dose in the body" line (lib/doseInBody) carries its shape as explicit terms — per unit dose,
// Σ c · t^p · e^(−k·t) (k per hour, p 0 or 1: p = 1 is the limit form when two rates are equal). Still a
// sum of exponentials, so lib/curveSampling carries it exactly.
export function termsFraction(terms, dtHours) {
  let s = 0;
  for (let i = 0; i < terms.length; i++) {
    const x = terms[i];
    s += x.c * (x.p ? dtHours : 1) * Math.exp(-x.k * dtHours);
  }
  return s;
}
export function amountFraction(entry, dtHours) {
  if (!(dtHours >= 0)) return 0;
  if (entry.terms) return termsFraction(entry.terms, dtHours);
  const kd = Math.LN2 / entry.hours;
  if (!entry.tmaxHours) return Math.exp(-kd * dtHours);
  const cacheKey = entry.hours + ':' + entry.tmaxHours;
  if (!(cacheKey in KR_CACHE)) KR_CACHE[cacheKey] = riseRate(entry.hours, entry.tmaxHours);
  const kr = KR_CACHE[cacheKey];
  if (kr == null) return Math.exp(-kd * dtHours); // no rise can peak at that Tmax (riseRate)
  return (kr / (kr - kd)) * (Math.exp(-kd * dtHours) - Math.exp(-kr * dtHours));
}
// A sum of exponentials, so lib/curveSampling may carry it from moment to moment in one pass
// (PK-4: an explicit marker, not an identity check — a wrapper that keeps this model says so).
amountFraction.exactCarry = true;

// The curve's unit for an entry: mg for everything, except compounds that are
// always measured in IU (somatropin, gonadotropins) — those chart in IU.
export function curveUnit(entry) {
  return entry && entry.unit === 'IU' ? 'IU' : 'mg';
}

// A protocol dose expressed in its compound's curve unit, or null when it can't
// be converted (IU is bioactivity, not mass: mg↔IU only where a fixed standard
// exists — somatropin 1 mg = 3 IU, WHO IS 98/574).
export function doseInCurveUnit(dose, doseUnit, entry) {
  const d = Number(dose);
  if (!d || !isFinite(d) || d <= 0) return null;
  const u = String(doseUnit || 'mg').trim().toLowerCase();
  const mg = u === 'mg' ? d : u === 'mcg' ? d / 1000 : u === 'g' ? d * 1000 : null;
  if (curveUnit(entry) === 'IU') {
    if (u === 'iu') return d;
    return mg != null && entry.iuPerMg ? mg * entry.iuPerMg : null;
  }
  return mg; // IU dose of a mass-dosed compound → null (not convertible)
}

// Returns the full entry { hours, tier, source } or null. Exclusion is checked on
// the RESOLVED key as well as the raw name, so a variant spelling ("IGF-1 LR3 1mg")
// can't slip an excluded compound back onto the curve.
export function getHalfLifeEntry(name) {
  if (!name) return null;
  if (CURVE_EXCLUDED.has(name)) return null;
  const key = resolveHalfLifeKey(name);
  if (!key || CURVE_EXCLUDED.has(key)) return null;
  return HALF_LIVES[key];
}
