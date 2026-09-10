// Verified elimination half-lives (hours) for serum curve modeling.
// tier: 'clinical' = FDA/EMA label or robust human PK
//       'studied'  = human PK published, not an approved US drug
//       'estimated' = animal-only data or extrapolation — no human PK
// For IM oil-depot esters, values are absorption-limited (flip-flop) apparent half-lives.
export const HALF_LIVES = {
  'Semaglutide': { hours: 168, tier: 'clinical', source: 'Ozempic/Wegovy FDA label' },
  'Tirzepatide': { hours: 120, tier: 'clinical', source: 'Mounjaro FDA label' },
  'Retatrutide': { hours: 144, tier: 'studied', source: 'Coskun Cell Metab 2022' },
  'Cagrilintide': { hours: 180, tier: 'studied', source: 'Enebo Lancet 2021' },
  'Liraglutide': { hours: 13, tier: 'clinical', source: 'Victoza FDA label' },
  'Exenatide': { hours: 2.4, tier: 'clinical', source: 'Byetta FDA label' },
  'Survodutide': { hours: 144, tier: 'studied', source: 'J Hepatol 2024 phase 1' },
  'Mazdutide': { hours: 192, tier: 'studied', source: 'DOM 2025 phase 1' },
  'BPC-157': { hours: 0.5, tier: 'estimated', source: 'animal only (He 2022)' },
  'TB-500': { hours: 2, tier: 'estimated', source: 'no human PK on fragment' },
  'GHK-Cu': { hours: 0.75, tier: 'estimated', source: 'plasma turnover extrapolation' },
  'KPV': { hours: 2, tier: 'estimated', source: 'no human PK' },
  'Pentadeca Arginate': { hours: 0.5, tier: 'estimated', source: 'no human PK' },
  'ARA-290': { hours: 0.33, tier: 'studied', source: 'phase 2 human PK' },
  'Thymosin Alpha-1': { hours: 2, tier: 'studied', source: 'Zadaxin, approved abroad' },
  'CJC-1295 with DAC': { hours: 168, tier: 'studied', source: 'Teichman 2006 JCEM' },
  'CJC-1295 no DAC': { hours: 0.5, tier: 'estimated', source: 'native GHRH analogy' },
  'Ipamorelin': { hours: 2, tier: 'estimated', source: '~2h (thin human PK)' },
  'Tesamorelin': { hours: 0.13, tier: 'clinical', source: 'Egrifta SV FDA label — SC elimination t½ ~8 min (WR ~11 min); prior 0.6h overstated ~5x' },
  'Sermorelin': { hours: 0.2, tier: 'clinical', source: 'former FDA drug' },
  'Hexarelin': { hours: 1, tier: 'studied', source: 'Imbimbo 1994 human' },
  'GHRP-2': { hours: 0.5, tier: 'studied', source: 'human PK; JP diagnostic' },
  'GHRP-6': { hours: 0.5, tier: 'studied', source: 'peptide PK ~20 min' },
  'MK-677': { hours: 24, tier: 'studied', source: 'Chapman 1996 JCEM (oral)' },
  'HGH': { hours: 3.5, tier: 'clinical', source: 'Somatropin labels (SC apparent)' },
  'IGF-1 LR3': { hours: 24, tier: 'estimated', source: 'no dedicated human PK' },
  'IGF-1 DES': { hours: 0.5, tier: 'estimated', source: 'no human PK' },
  'Testosterone Cypionate': { hours: 192, tier: 'clinical', source: 'Depo-Testosterone IM ~8d', substance: 'testosterone' },
  'Testosterone Enanthate': { hours: 120, tier: 'clinical', source: 'Delatestryl IM 4.5-8d', substance: 'testosterone' },
  'Testosterone Propionate': { hours: 20, tier: 'clinical', source: 'IM 0.8d', substance: 'testosterone' },
  'Testosterone Undecanoate': { hours: 2160, tier: 'clinical', source: 'Nebido SmPC — depot RELEASE t½ ~90d governs serum accumulation (absorption-limited/flip-flop); 33.9d is the ester, not serum decline', substance: 'testosterone' },
  'Testosterone Suspension': { hours: 24, tier: 'studied', source: 'aqueous, duration 2-3d', substance: 'testosterone' },
  'Sustanon 250': { hours: 360, tier: 'estimated', source: 'blend, decanoate-driven', substance: 'testosterone' },
  'Nandrolone Decanoate': { hours: 216, tier: 'clinical', source: 'PMID 15713722 (7-12d)', substance: 'nandrolone' },
  'Nandrolone Phenylpropionate': { hours: 65, tier: 'estimated', source: 'IM ~2.7d (no dedicated human PK for this ester)', substance: 'nandrolone' },
  'Trenbolone Acetate': { hours: 48, tier: 'estimated', source: 'IM depot ~1.5-2d (EOD dosing; veterinary, no human PK)', substance: 'trenbolone' },
  'Trenbolone Enanthate': { hours: 168, tier: 'estimated', source: 'IM depot ~7-10d', substance: 'trenbolone' },
  'Trenbolone Hexahydrobenzylcarbonate': { hours: 240, tier: 'estimated', source: 'IM depot ~10d', substance: 'trenbolone' },
  'Drostanolone Propionate': { hours: 48, tier: 'estimated', source: 'IM 2d', substance: 'drostanolone' },
  'Drostanolone Enanthate': { hours: 168, tier: 'estimated', source: 'poorly characterized', substance: 'drostanolone' },
  'Boldenone Undecylenate': { hours: 336, tier: 'estimated', source: 'IM ~14d (veterinary, no human PK)', substance: 'boldenone' },
  'Methenolone Enanthate': { hours: 252, tier: 'estimated', source: 'IM ~10.5d (Primobolan; no robust human elimination PK)' },
  'Stanozolol injectable': { hours: 24, tier: 'estimated', source: 'aqueous IM (oral t½ ~9h published; injectable depot is an estimate)' },
  'HCG': { hours: 32, tier: 'clinical', source: 'SC/IM terminal ~32h' },
  'HMG': { hours: 30, tier: 'studied', source: 'Menopur label, FSH activity' },
  'FSH': { hours: 30, tier: 'clinical', source: 'Gonal-F/Follistim labels' },
  'Gonadorelin': { hours: 0.5, tier: 'clinical', source: 'Factrel 10-40 min' },
  'Kisspeptin-10': { hours: 0.07, tier: 'studied', source: 'human ~4 min' },
  'Triptorelin': { hours: 3, tier: 'clinical', source: 'Trelstar label (IR)' },
  'Melanotan I': { hours: 0.5, tier: 'studied', source: 'afamelanotide injected t½ ~0.5h (IV 0.14-0.52h); the 15h Scenesse figure is implant-depot kinetics, not injection' },
  'Melanotan II': { hours: 1, tier: 'studied', source: 'small human studies' },
  'PT-141': { hours: 2.7, tier: 'clinical', source: 'Vyleesi FDA label' },
  'Oxytocin': { hours: 0.2, tier: 'clinical', source: 'Pitocin label; IV ~20 min' },
  'AOD-9604': { hours: 0.4, tier: 'estimated', source: 'minimal published human PK' },
  'Fragment 176-191': { hours: 0.4, tier: 'estimated', source: 'no human PK' },
  'MOTS-c': { hours: 1, tier: 'estimated', source: 'no human PK' },
  'Epithalon': { hours: 0.5, tier: 'estimated', source: 'no human PK' },
  'SS-31': { hours: 4, tier: 'studied', source: 'Stealth trials human PK' },
  'NAD+': { hours: 1, tier: 'estimated', source: 'no robust human PK' },
  'Selank': { hours: 0.5, tier: 'estimated', source: 'no human PK' },
  'Semax': { hours: 0.5, tier: 'estimated', source: 'no human PK' },
  'P21': { hours: 3, tier: 'estimated', source: 'no human PK' },
  'Dihexa': { hours: 3, tier: 'estimated', source: 'no human PK' },
  'Pinealon': { hours: 1, tier: 'estimated', source: 'no human PK' },
  'DSIP': { hours: 0.13, tier: 'estimated', source: 'rapid clearance, old data' },
  'LL-37': { hours: 0.5, tier: 'estimated', source: 'no robust human PK' },
  'VIP': { hours: 0.03, tier: 'studied', source: 'Domschke 1978 ~1-2 min' },
  'Insulin Lispro': { hours: 1, tier: 'clinical', source: 'Humalog label' },
  'Insulin Aspart': { hours: 1.35, tier: 'clinical', source: 'Novolog label' },
  'Insulin Glargine': { hours: 12, tier: 'clinical', source: 'Lantus label (peakless)' },
  'Insulin Degludec': { hours: 25, tier: 'clinical', source: 'Tresiba label' },
  'Glutathione injectable': { hours: 0.25, tier: 'estimated', source: 'IV plasma t½ ~10-15 min' },
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
  'Kisspeptin-13': { hours: 0.1, tier: 'estimated', source: 'no direct KP-13 human PK; kisspeptin-fragment analogy (~min)' },
  // No human PK — render DASHED (estimated); class analogies, NOT measurements
  'Cetrorelix Acetate': { hours: 20, tier: 'estimated', source: 'Cetrotide — DOSE-DEPENDENT ~5h(0.25mg)→~63h(3mg); 20h compromise' },
  'Follistatin-344': { hours: 1, tier: 'estimated', source: 'no human PK; follistatin clears rapidly' },
  'MGF': { hours: 0.1, tier: 'estimated', source: 'no human PK; IGF-1Ec fragment unstable, minutes' },
  'PEG-MGF': { hours: 48, tier: 'estimated', source: 'no human PK; PEGylation-extended estimate' },
  'Adipotide': { hours: 2, tier: 'estimated', source: 'no human PK; primate-only short peptide' },
  'Cecropin B': { hours: 1, tier: 'estimated', source: 'no human PK; antimicrobial peptide analogy' },
  'FOXO4-DRI': { hours: 0.5, tier: 'estimated', source: 'no human PK; senolytic research peptide' },
  'Humanin': { hours: 1, tier: 'estimated', source: 'no robust human PK; mitochondrial peptide' },
  'Orexin-A': { hours: 0.5, tier: 'estimated', source: 'no robust systemic human PK; neuropeptide' },
  'PE-22-28': { hours: 0.5, tier: 'estimated', source: 'no human PK; spadin analog' },
  'RGD Peptide': { hours: 0.3, tier: 'estimated', source: 'no human PK; tripeptide motif, very fast' },
  'Thymalin': { hours: 1, tier: 'estimated', source: 'no human PK; thymic polypeptide' },
  'Thymulin': { hours: 1, tier: 'estimated', source: 'no human PK; zinc-nonapeptide (FTS)' },
  'α-Endorphin': { hours: 0.3, tier: 'estimated', source: 'no human PK; endorphin fragment, rapid' },
  'γ-Endorphin': { hours: 0.3, tier: 'estimated', source: 'no human PK; endorphin fragment' },
  'α-MSH': { hours: 0.3, tier: 'estimated', source: 'no human PK for native α-MSH; rapid clearance' },
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
  'N-Acetyl-Epitalon-Amidate': 'Epithalon',
  'Thymosin Beta-4': 'TB-500', // fragment value; both no-human-PK estimates
};

// Fuzzy match: protocol names may not exactly equal keys.
// Returns the full entry { hours, tier, source } or null.
export function getHalfLifeEntry(name) {
  if (!name) return null;
  if (HALF_LIVES[name]) return HALF_LIVES[name];
  if (NAME_ALIASES[name]) return HALF_LIVES[NAME_ALIASES[name]];
  const lower = name.toLowerCase();
  let best = null;
  let bestLen = 0;
  for (const key of Object.keys(HALF_LIVES)) {
    const kl = key.toLowerCase();
    if ((lower.includes(kl) || kl.includes(lower)) && kl.length > bestLen) {
      best = HALF_LIVES[key];
      bestLen = kl.length;
    }
  }
  return best;
}
