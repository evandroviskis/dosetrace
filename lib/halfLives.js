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
  'Ipamorelin': { hours: 2, tier: 'studied', source: 'human gastric-emptying PK' },
  'Tesamorelin': { hours: 0.6, tier: 'clinical', source: 'Egrifta FDA label' },
  'Sermorelin': { hours: 0.2, tier: 'clinical', source: 'former FDA drug' },
  'Hexarelin': { hours: 1, tier: 'studied', source: 'Imbimbo 1994 human' },
  'GHRP-2': { hours: 0.5, tier: 'studied', source: 'human PK; JP diagnostic' },
  'GHRP-6': { hours: 0.5, tier: 'studied', source: 'peptide PK ~20 min' },
  'MK-677': { hours: 24, tier: 'studied', source: 'Chapman 1996 JCEM (oral)' },
  'HGH': { hours: 3.5, tier: 'clinical', source: 'Somatropin labels (SC apparent)' },
  'IGF-1 LR3': { hours: 24, tier: 'estimated', source: 'no dedicated human PK' },
  'IGF-1 DES': { hours: 0.5, tier: 'estimated', source: 'no human PK' },
  'Testosterone Cypionate': { hours: 192, tier: 'clinical', source: 'Depo-Testosterone IM ~8d' },
  'Testosterone Enanthate': { hours: 120, tier: 'clinical', source: 'Delatestryl IM 4.5-8d' },
  'Testosterone Propionate': { hours: 20, tier: 'clinical', source: 'IM 0.8d' },
  'Testosterone Undecanoate': { hours: 720, tier: 'clinical', source: 'Aveed/Nebido castor oil 33.9d' },
  'Testosterone Suspension': { hours: 24, tier: 'studied', source: 'aqueous, duration 2-3d' },
  'Sustanon 250': { hours: 360, tier: 'estimated', source: 'blend, decanoate-driven' },
  'Nandrolone Decanoate': { hours: 216, tier: 'clinical', source: 'PMID 15713722 (7-12d)' },
  'Nandrolone Phenylpropionate': { hours: 65, tier: 'studied', source: 'IM 2.7d' },
  'Trenbolone Acetate': { hours: 72, tier: 'estimated', source: 'IM depot ~3d' },
  'Trenbolone Enanthate': { hours: 168, tier: 'estimated', source: 'IM depot ~7-10d' },
  'Trenbolone Hexahydrobenzylcarbonate': { hours: 240, tier: 'estimated', source: 'IM depot ~10d' },
  'Drostanolone Propionate': { hours: 48, tier: 'estimated', source: 'IM 2d' },
  'Drostanolone Enanthate': { hours: 168, tier: 'estimated', source: 'poorly characterized' },
  'Boldenone Undecylenate': { hours: 336, tier: 'estimated', source: 'IM 14d' },
  'Methenolone Enanthate': { hours: 252, tier: 'studied', source: 'IM 10.5d' },
  'Stanozolol injectable': { hours: 24, tier: 'studied', source: 'aqueous IM' },
  'HCG': { hours: 32, tier: 'clinical', source: 'SC/IM terminal ~32h' },
  'HMG': { hours: 30, tier: 'studied', source: 'Menopur label, FSH activity' },
  'FSH': { hours: 30, tier: 'clinical', source: 'Gonal-F/Follistim labels' },
  'Gonadorelin': { hours: 0.5, tier: 'clinical', source: 'Factrel 10-40 min' },
  'Kisspeptin-10': { hours: 0.07, tier: 'studied', source: 'human ~4 min' },
  'Triptorelin': { hours: 3, tier: 'clinical', source: 'Trelstar label (IR)' },
  'Melanotan I': { hours: 15, tier: 'clinical', source: 'Scenesse FDA label' },
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
  'Glutathione injectable': { hours: 0.25, tier: 'studied', source: 'Aebi 1991 IV' },
  'B12 injectable': { hours: 144, tier: 'clinical', source: 'hydroxocobalamin ~6d' },
  'L-Carnitine injectable': { hours: 10, tier: 'studied', source: 'Harper 1995' },
};

// Compounds explicitly excluded from the curve (mixtures with no single t½, or oral/non-systemic):
// Cerebrolysin, Cortexin, Larazotide, amino acid blends, Tesofensine, 5-Amino-1MQ

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
