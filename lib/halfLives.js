// Verified elimination half-lives (hours) for serum curve modeling.
// tier: 'clinical' = FDA/EMA label or robust human PK
//       'studied'  = human PK published, not an approved US drug
//       'estimated' = animal-only data or extrapolation — no human PK
// For IM oil-depot esters, values are absorption-limited (flip-flop) apparent half-lives.
export const HALF_LIVES = {
  'Semaglutide': { hours: 168, tier: 'clinical', source: 'Ozempic/Wegovy FDA label; SC Tmax 1–3 d', tmaxHours: 48, tmaxRange: [24, 72] },
  'Tirzepatide': { hours: 120, tier: 'clinical', source: 'Mounjaro FDA label' },
  'Retatrutide': { hours: 144, tier: 'studied', source: 'Coskun Cell Metab 2022' },
  'Cagrilintide': { hours: 180, tier: 'studied', source: 'Enebo Lancet 2021' },
  'Eloralintide': { hours: 336, tier: 'studied', source: 'Bhattachar DOM 2026 — LY3841136 phase 1, terminal t1/2 ~13-15 days' },
  'Liraglutide': { hours: 13, tier: 'clinical', source: 'Victoza FDA label' },
  'Exenatide': { hours: 2.4, tier: 'clinical', source: 'Byetta FDA label' },
  'Survodutide': { hours: 144, tier: 'studied', source: 'J Hepatol 2024 phase 1' },
  'Mazdutide': { hours: 192, tier: 'studied', source: 'DOM 2025 phase 1' },
  'BPC-157': { hours: 0.5, tier: 'estimated', source: 'Rat/dog IM t½ 8–30 min (He 2022, PMID 36588717); no human PK' },
  'TB-500': { hours: 2, tier: 'estimated', source: 'No PK for the Ac-LKKTETQ fragment; value borrowed from full-length Tβ4 IV data (PMID 34346165)' },
  'Thymosin Beta-4': { hours: 2, tier: 'studied', source: 'Human IV phase 1, dose-dependent t½ 0.5–2.1h (Wang 2021, PMID 34346165); SC unpublished' },
  'GHK-Cu': { hours: 0.75, tier: 'estimated', source: 'No t½ in any species; rat IV shows rapid degradation (Endo 1997, PMID 9187381); extrapolated' },
  'KPV': { hours: 2, tier: 'estimated', source: 'No published PK in any species; extrapolated' },
  'Pentadeca Arginate': { hours: 0.5, tier: 'estimated', source: 'No PDA PK; same sequence as BPC-157 — rat/dog IM t½ <30 min (PMID 36588717); no human PK' },
  'ARA-290': { hours: 0.33, tier: 'studied', source: 'phase 2 human PK' },
  'Thymosin Alpha-1': { hours: 2, tier: 'studied', source: 'Zadaxin, approved abroad' },
  'CJC-1295 with DAC': { hours: 168, tier: 'studied', source: 'Teichman 2006 JCEM' },
  'CJC-1295 no DAC': { hours: 0.5, tier: 'estimated', source: 'No PK for Mod GRF(1-29); analog tesamorelin SC t½ 8–38 min (FDA label); extrapolated' },
  'Ipamorelin': { hours: 2, tier: 'studied', source: 'Human IV terminal t½ 2h, healthy men (Gobburu 1999, PMID 10496658); SC unpublished' },
  'Tesamorelin': { hours: 0.13, tier: 'clinical', source: 'Egrifta SV FDA label — SC elimination t½ ~8 min (WR ~11 min)' },
  'Sermorelin': { hours: 0.2, tier: 'clinical', source: 'former FDA drug' },
  'Hexarelin': { hours: 1, tier: 'studied', source: 'Imbimbo 1994 human' },
  'GHRP-2': { hours: 0.5, tier: 'studied', source: 'human PK; JP diagnostic' },
  'GHRP-6': { hours: 0.5, tier: 'studied', source: 'peptide PK ~20 min' },
  'MK-677': { hours: 24, tier: 'studied', source: 'Chapman 1996 JCEM (oral)' },
  'HGH': { hours: 3.5, tier: 'clinical', source: 'Somatropin labels (SC apparent)', unit: 'IU', iuPerMg: 3 },
  'IGF-1 LR3': { hours: 24, tier: 'estimated', source: 'EXCLUDED from curve — no t½ in any species; rat IV clears ~10x faster than IGF-1 (PMID 7693845)' },
  'IGF-1 DES': { hours: 0.5, tier: 'estimated', source: 'Rat IV clears ~4x faster than IGF-1 (Ballard 1991, PMID 2005410); no human PK; extrapolated' },
  'Testosterone Cypionate': { hours: 192, tier: 'clinical', source: 'Depo-Testosterone IM ~8d; Tmax median 71.7h, range 24–191h (Azmiro FDA label §12.3)', substance: 'testosterone', tmaxHours: 71.7, tmaxRange: [24, 191] },
  'Testosterone Enanthate': { hours: 120, tier: 'clinical', source: 'Delatestryl IM 4.5-8d', substance: 'testosterone' },
  'Testosterone Propionate': { hours: 20, tier: 'clinical', source: 'IM 0.8d', substance: 'testosterone' },
  'Testosterone Undecanoate': { hours: 2160, tier: 'clinical', source: 'Nebido SmPC — depot RELEASE t½ ~90d governs serum accumulation (absorption-limited/flip-flop); 33.9d is the ester, not serum decline; Tmax median 7d, range 4–42d (Nebido SmPC, Aveed label)', substance: 'testosterone', tmaxHours: 168, tmaxRange: [96, 1008] },
  'Testosterone Suspension': { hours: 24, tier: 'estimated', source: 'No published PK for aqueous testosterone; apparent value extrapolated', substance: 'testosterone' },
  'Sustanon 250': { hours: 168, tier: 'estimated', source: 'No labeled t½; apparent value fitted to SmPC timing (peak 24–48h, SmPC dosing interval ~21d); early propionate peak not modeled; SmPC peak 24–48h', substance: 'testosterone', tmaxHours: 36, tmaxRange: [24, 48] },
  'Nandrolone Decanoate': { hours: 216, tier: 'clinical', source: 'PMID 15713722 (7-12d)', substance: 'nandrolone' },
  'Nandrolone Phenylpropionate': { hours: 65, tier: 'estimated', source: 'Human IM PK exists (Minto 1997, PMID 9103484) but the 2.7d value is unconfirmed; apparent (absorption-limited)', substance: 'nandrolone' },
  'Trenbolone Acetate': { hours: 48, tier: 'estimated', source: 'Extrapolated; no IM PK in any species (human data oral/urinary only)', substance: 'trenbolone' },
  'Trenbolone Enanthate': { hours: 168, tier: 'estimated', source: 'Extrapolated from ester chain length; no PK data (never an approved product)', substance: 'trenbolone' },
  'Trenbolone Hexahydrobenzylcarbonate': { hours: 240, tier: 'estimated', source: 'Extrapolated; no PK data (Parabolan label dosed every ~15d)', substance: 'trenbolone' },
  'Drostanolone Propionate': { hours: 48, tier: 'estimated', source: 'Extrapolated; the 2d figure is from a non-scientific reference book; no PK data', substance: 'drostanolone' },
  'Drostanolone Enanthate': { hours: 168, tier: 'estimated', source: 'Extrapolated from ester chain length; no PK data', substance: 'drostanolone' },
  'Boldenone Undecylenate': { hours: 336, tier: 'estimated', source: 'Textbook ~14d; horse IM t½ 123h (Soma 2007, PMID 17348894); no human PK', substance: 'boldenone' },
  'Methenolone Enanthate': { hours: 252, tier: 'estimated', source: 'Secondary textbook ~10.5d; no primary PK data' },
  'Stanozolol injectable': { hours: 24, tier: 'estimated', source: 'Textbook 24h; only measured IM data is ~3.4x longer — horse t½ 82h (Soma 2007, PMID 17348894); no human PK' },
  'HCG': { hours: 32, tier: 'clinical', source: 'SC/IM terminal ~32h', unit: 'IU' },
  'HMG': { hours: 30, tier: 'studied', source: 'Menopur label, FSH activity', unit: 'IU' },
  'FSH': { hours: 30, tier: 'clinical', source: 'Gonal-F/Follistim labels', unit: 'IU' },
  'Gonadorelin': { hours: 0.5, tier: 'clinical', source: 'Factrel 10-40 min' },
  'Kisspeptin-10': { hours: 0.07, tier: 'studied', source: 'human ~4 min' },
  'Triptorelin': { hours: 3, tier: 'clinical', source: 'Trelstar label (IR)' },
  'Melanotan I': { hours: 0.5, tier: 'studied', source: 'afamelanotide injected t½ ~0.5h (IV 0.14-0.52h); the 15h Scenesse figure is implant-depot kinetics, not injection' },
  'Melanotan II': { hours: 1, tier: 'studied', source: 'small human studies' },
  'PT-141': { hours: 2.7, tier: 'clinical', source: 'Vyleesi FDA label' },
  'Oxytocin': { hours: 0.2, tier: 'clinical', source: 'Pitocin label; IV ~20 min' },
  'AOD-9604': { hours: 0.4, tier: 'estimated', source: 'Pig IV t½ ~3 min (Moré 2014, doi:10.14740/jem213w); no human PK; 0.4h adds an assumed SC absorption allowance' },
  'Fragment 176-191': { hours: 0.4, tier: 'estimated', source: 'No PK; assumed like AOD-9604 (pig IV t½ ~3 min, Moré 2014) plus an SC absorption allowance' },
  'MOTS-c': { hours: 1, tier: 'estimated', source: 'No published PK (human or animal); CB4211 analog PK undisclosed; value is a placeholder' },
  'Epithalon': { hours: 0.5, tier: 'estimated', source: 'No PK in any species (review, PMID 40141333); extrapolated' },
  'Ac-Epithalon': { hours: 0.5, tier: 'estimated', source: 'Modified form of Epithalon; no PK; parent value used; persistence unmeasured' },
  'N-Acetyl-Epitalon-Amidate': { hours: 0.5, tier: 'estimated', source: 'Modified form of Epithalon; no PK; parent value used; persistence unmeasured' },
  'SS-31': { hours: 4, tier: 'studied', source: 'Stealth trials human PK' },
  'NAD+': { hours: 1, tier: 'estimated', source: 'No human t½; IV 750 mg/6h cleared fast early, still raised 2h after (Grant 2019, PMID 31572171); placeholder' },
  'Selank': { hours: 0.5, tier: 'estimated', source: 'No t½; nasal plasma levels decline within ~5 min (Russian label); injected t½ unpublished; extrapolated' },
  'N-Acetyl Selank Amidate': { hours: 0.5, tier: 'estimated', source: 'Modified form of Selank; no PK; parent value used; persistence unmeasured' },
  'Semax': { hours: 0.5, tier: 'estimated', source: 'No t½; rat nasal — broken down within minutes (Shevchenko 2006, PMID 16523722); extrapolated' },
  'N-Acetyl Semax Amidate': { hours: 0.5, tier: 'estimated', source: 'Modified form of Semax; no PK; parent value used; persistence unmeasured' },
  'P21': { hours: 3, tier: 'estimated', source: 'Mouse plasma t½ >3h, a lower bound (Kazim & Iqbal 2016, PMID 27400746); no human PK' },
  'Dihexa': { hours: 3, tier: 'estimated', source: 'EXCLUDED from curve — only data rat t½ 8.8–12.7 d (McCoy 2013, PMID 23055539), under a 2021 Expression of Concern' },
  'Pinealon': { hours: 1, tier: 'estimated', source: 'No published PK in any species; class estimate' },
  'DSIP': { hours: 0.13, tier: 'estimated', source: 'IV t½ 4 min dog, 2–3 min monkey/rat (Kato 1984, PMID 6379493); no human PK; SC absorption allowance' },
  'LL-37': { hours: 0.5, tier: 'estimated', source: 'No systemic PK published; human data topical only (Grönberg 2014, PMID 25041740); extrapolated' },
  'VIP': { hours: 0.03, tier: 'studied', source: 'Domschke 1978 ~1-2 min' },
  // Insulins are loggable but EXCLUDED from the accumulation curve (see
  // CURVE_EXCLUDED below): rapid-acting is dosed to effect not accumulation, and
  // an implied insulin "level" is the one place a misread is dangerous. Kept as
  // reference values only. Glargine has no labeled t½ (peakless) — its number is
  // a modeling assumption, not a clinical value.
  'Insulin Lispro': { hours: 1, tier: 'studied', source: 'Humalog label (SC t1/2 ~1h; dosed to effect, not accumulation)' },
  'Insulin Aspart': { hours: 1.35, tier: 'studied', source: 'Novolog label (SC t1/2 ~81min; dosed to effect)' },
  'Insulin Glargine': { hours: 12, tier: 'estimated', source: 'Lantus label — peakless, no labeled t1/2; 12h is a modeling assumption' },
  'Insulin Degludec': { hours: 25, tier: 'studied', source: 'Tresiba label (terminal t1/2 ~25h)' },
  'Glutathione injectable': { hours: 0.25, tier: 'studied', source: 'Human IV t½ 14±9 min of the excess above baseline (Aebi 1991, PMID 1907548); IM/SC unpublished' },
  'B12 injectable': { hours: 144, tier: 'clinical', source: 'hydroxocobalamin ~6d' },
  'L-Carnitine injectable': { hours: 17.4, tier: 'clinical', source: 'Carnitor IV FDA label — terminal t½ 17.4h (2-compartment; large endogenous pool dominates)' },
  // --- Added 2026-09-10 (pharmacometrician-sourced; see STATE.md) ---
  // Approved drugs — authoritative (clinical)
  'Dulaglutide': { hours: 120, tier: 'clinical', source: 'Trulicity FDA label — GLP-1 Fc fusion, t½ ~5d' },
  'Albiglutide': { hours: 120, tier: 'clinical', source: 'Tanzeum FDA label — albumin fusion, t½ ~5d' },
  'Lixisenatide': { hours: 3, tier: 'clinical', source: 'Adlyxin FDA label — terminal t½ ~3h' },
  'Octreotide': { hours: 1.7, tier: 'clinical', source: 'Sandostatin label — SC immediate-release ~1.7h (NOT the LAR depot)' },
  'EPO': { hours: 24, tier: 'clinical', source: 'Epogen/Procrit — SC absorption-limited ~16-24h (IV shorter)' },
  'Estradiol Valerate': { hours: 84, tier: 'clinical', source: 'Oriowo 1980 (PMID 7389356) — IM apparent flip-flop ~3.5d', substance: 'estradiol' },
  'Progesterone': { hours: 20, tier: 'studied', source: 'progesterone-in-oil IM — absorption-limited, apparent (not terminal) t½; peaks ~8h, ~24-48h to baseline', substance: 'progesterone' },
  // Human PK published, not US-approved (studied)
  'Estradiol Cypionate': { hours: 90, tier: 'studied', source: 'ester apparent t½ ~90h (89.65 ± 76.04h), healthy-female PK, PMID 30947128', substance: 'estradiol' },
  'ACE-031': { hours: 336, tier: 'studied', source: 'Attie 2013 Muscle Nerve — ActRIIB-Fc phase 1, t½ ~10-15d' },
  'Ghrelin': { hours: 0.5, tier: 'studied', source: 'human infusion — acyl ~10-13min, total ~30min' },
  'Melatonin': { hours: 0.75, tier: 'studied', source: 'exogenous IV/SC human — t½ ~40-60min' },
  'GTS-21': { hours: 1.5, tier: 'studied', source: 'DMXB-A human phase 1/2 — short t½' },
  'AICAR': { hours: 0.5, tier: 'studied', source: 'acadesine (GUARDIAN) human — short t½' },
  'Peptide T': { hours: 0.5, tier: 'studied', source: '1980s-90s human trials — cleared in minutes' },
  'Kisspeptin-13': { hours: 0.1, tier: 'estimated', source: 'No KP-13 PK; human IV t½ KP-10 ~4 min (PMID 21976724), KP-54 27.6 min (PMID 16174713)' },
  // No human PK — render DASHED (estimated); class analogies, NOT measurements
  'Cetrorelix Acetate': { hours: 20.6, tier: 'clinical', source: 'Cetrotide label (SC): 20.6h with 0.25 mg daily; single 0.25 mg 5h, single 3 mg 62.8h — dose-dependent' },
  'Follistatin-344': { hours: 1, tier: 'estimated', source: 'No human PK; native follistatin cleared rapidly in mice (Datta-Mannan 2013, PMID 23249626); extrapolated' },
  'MGF': { hours: 0.1, tier: 'estimated', source: 'No published PK in any species; assumed short (unmodified peptide)' },
  'PEG-MGF': { hours: 48, tier: 'estimated', source: 'EXCLUDED from curve — undefined PEGylated product; no PK in any species' },
  'Adipotide': { hours: 2, tier: 'estimated', source: 'EXCLUDED from curve — no PK in any species; phase 1 NCT01262664 terminated without results' },
  'Cecropin B': { hours: 1, tier: 'estimated', source: 'No published PK in any species; class extrapolation' },
  'FOXO4-DRI': { hours: 0.5, tier: 'estimated', source: 'EXCLUDED from curve — no PK in any species; D-retro-inverso design resists breakdown' },
  'Humanin': { hours: 1, tier: 'estimated', source: 'Native humanin unstudied; analog HNG (S14G) t½ ~0.5h mouse, >4h rat, IP (Chin 2013, PMID 23836030)' },
  'Orexin-A': { hours: 0.5, tier: 'estimated', source: 'Rat IV t½ 27 min (Ehrström 2004, PMID 15120482); no human PK' },
  'PE-22-28': { hours: 0.5, tier: 'estimated', source: 'Short serum t½, unquantified, mouse (Djillani 2017, PMID 28955242); no human PK' },
  'RGD Peptide': { hours: 0.3, tier: 'estimated', source: 'EXCLUDED from curve — "RGD peptide" is a motif, not one defined molecule; no PK' },
  'Thymalin': { hours: 1, tier: 'estimated', source: 'EXCLUDED from curve — undefined thymic polypeptide extract; no PK' },
  'Thymulin': { hours: 1, tier: 'estimated', source: 'No verified PK; mouse bioassay reports unconfirmed; extrapolated' },
  'α-Endorphin': { hours: 0.3, tier: 'estimated', source: 'No published PK in any species; extrapolated from POMC-fragment peptides' },
  'γ-Endorphin': { hours: 0.3, tier: 'estimated', source: 'No human t½; rat IV des-Tyr-γ-endorphin t½ 5.5 min, SC longer (Verhoef 1985, PMID 4070016)' },
  'α-MSH': { hours: 0.3, tier: 'estimated', source: 'Human IV radiolabel, n=1 per run: t½ 4.8–25 min (Redding 1978, PMID 714971); too thin for "studied"' },
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
export function riseRate(hours, tmaxHours) {
  const kd = Math.LN2 / hours;
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
export function amountFraction(entry, dtHours) {
  if (!(dtHours >= 0)) return 0;
  const kd = Math.LN2 / entry.hours;
  if (!entry.tmaxHours) return Math.exp(-kd * dtHours);
  const cacheKey = entry.hours + ':' + entry.tmaxHours;
  const kr = KR_CACHE[cacheKey] || (KR_CACHE[cacheKey] = riseRate(entry.hours, entry.tmaxHours));
  return (kr / (kr - kd)) * (Math.exp(-kd * dtHours) - Math.exp(-kr * dtHours));
}

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
