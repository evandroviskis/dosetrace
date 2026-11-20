'use strict';
// "Para que você usa {produto}?" (docs/specs/purpose-question.md, founder 2026-11-20): the goal tiles
// of a protocol. The order only saves taps, like the preloaded product names (founder 2026-11-09); it
// never says what a product is for. Storage is unchanged: protocols.goal = comma-separated wt_* keys.
// Pure (node --test): used by the manual form, the protocol assistant and the onboarding summary.

// The two lists the form always had (moved here from screens/ProtocolsScreen.js).
const WELLNESS_KEYS_INJECTABLE = ['wt_anabolic','wt_antioxidant','wt_appetite','wt_athletic','wt_body_comp','wt_circadian','wt_cognitive','wt_hormonal_wellness','wt_energy','wt_metabolic_wellness','wt_gut','wt_hormone_balance','wt_recovery_support','wt_joint','wt_libido','wt_longevity','wt_metabolic','wt_cellular_energy','wt_mood','wt_muscle','wt_endurance','wt_rest','wt_sexual','wt_skin','wt_sleep_opt','wt_strength','wt_stress','wt_tissue','wt_vitality','wt_weight'];
const WELLNESS_KEYS_ORAL = ['wt_antioxidant_def','wt_atp','wt_heart_wellness','wt_neuro_wellness','wt_cognitive_vit','wt_electrolyte','wt_digestive_wellness','wt_blood_sugar_wellness','wt_liver_wellness','wt_stress_adaptation','wt_immune','wt_joint_health','wt_mental','wt_cellular_opt','wt_kidney_wellness','wt_sleep_quality','wt_stress_mgmt'];

const purposeKeysFor = (type) => (type === 'oral' ? WELLNESS_KEYS_ORAL : WELLNESS_KEYS_INJECTABLE);

// The goals usually tracked with a product: wellness keys only, no disease words. Products with no
// entry fall through to the alphabetical list. Peptides without an approved use and anabolic steroids
// are left out on purpose (council note on the picture, 2026-11-20).
const TYPICAL_PURPOSE = {
  // capsules and supplements
  oral_melatonin: ['wt_sleep_quality', 'wt_circadian'],
  oral_vit_c: ['wt_immune', 'wt_antioxidant_def'],
  oral_vit_d3: ['wt_immune'],
  oral_zinc: ['wt_immune'],
  oral_mag_bisglycinate: ['wt_stress_mgmt', 'wt_sleep_quality'],
  oral_mag_threonate: ['wt_cognitive_vit', 'wt_sleep_quality'],
  oral_ashwagandha: ['wt_stress_adaptation', 'wt_stress_mgmt', 'wt_sleep_quality'],
  oral_rhodiola: ['wt_stress_adaptation'],
  oral_theanine: ['wt_stress_mgmt', 'wt_mental'],
  oral_gaba: ['wt_stress_mgmt', 'wt_sleep_quality'],
  oral_omega3: ['wt_heart_wellness', 'wt_cognitive_vit'],
  oral_krill_oil: ['wt_heart_wellness'],
  oral_coq10: ['wt_atp', 'wt_heart_wellness'],
  oral_creatine: ['wt_strength', 'wt_atp'],
  oral_beta_alanine: ['wt_endurance'],
  oral_citrulline: ['wt_endurance'],
  oral_milk_thistle: ['wt_liver_wellness'],
  oral_tudca: ['wt_liver_wellness'],
  oral_nac: ['wt_antioxidant_def', 'wt_liver_wellness'],
  oral_probiotics: ['wt_digestive_wellness'],
  oral_glutamine: ['wt_digestive_wellness'],
  oral_lions_mane: ['wt_cognitive_vit', 'wt_neuro_wellness'],
  oral_bacopa: ['wt_cognitive_vit'],
  oral_alpha_gpc: ['wt_cognitive_vit'],
  oral_tyrosine: ['wt_mental'],
  oral_curcumin: ['wt_joint_health', 'wt_antioxidant_def'],
  oral_resveratrol: ['wt_antioxidant_def', 'wt_cellular_opt'],
  oral_nmn: ['wt_cellular_opt', 'wt_atp'],
  oral_nr: ['wt_cellular_opt', 'wt_atp'],
  oral_ala: ['wt_antioxidant_def'],
  oral_berberine: ['wt_blood_sugar_wellness'],
  oral_vit_b: ['wt_atp'],
  // injectables with an approved use (council 2026-11-20: injectable melatonin, glutathione and NAD+
  // have none, so they are not here and their tiles keep the normal order)
  lyo_semaglutide: ['wt_weight', 'wt_appetite'],
  rtu_semaglutide: ['wt_weight', 'wt_appetite'],
  lyo_tirzepatide: ['wt_weight', 'wt_appetite'],
  rtu_tirzepatide: ['wt_weight', 'wt_appetite'],
  lyo_liraglutide: ['wt_weight', 'wt_appetite'],
  rtu_liraglutide: ['wt_weight', 'wt_appetite'],
  rtu_testosterone_cypionate: ['wt_hormone_balance'],
  rtu_testosterone_enanthate: ['wt_hormone_balance'],
  rtu_testosterone_propionate: ['wt_hormone_balance'],
  rtu_testosterone_undecanoate: ['wt_hormone_balance'],
  rtu_testosterone_suspension: ['wt_hormone_balance'],
  rtu_sustanon_250: ['wt_hormone_balance'],
  rtu_estradiol_cypionate: ['wt_hormone_balance'],
  rtu_estradiol_valerate: ['wt_hormone_balance'],
  rtu_progesterone: ['wt_hormone_balance'],
  rtu_cyanocobalamin: ['wt_energy', 'wt_vitality'],
  rtu_methylcobalamin: ['wt_energy', 'wt_vitality'],
  rtu_hydroxocobalamin: ['wt_energy', 'wt_vitality'],
};

const SLEEP_KEYS = ['wt_sleep_quality', 'wt_sleep_opt'];

// "HH:MM" from 18:00 to 04:00 (both included).
function isNightTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm == null ? '' : hhmm).trim());
  if (!m) return false;
  const min = Number(m[1]) * 60 + Number(m[2]);
  return min >= 18 * 60 || min <= 4 * 60;
}

const goalKeys = (goal) => String(goal == null ? '' : goal).split(',').map((x) => x.trim()).filter(Boolean);
const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
const isKnownKey = (k) => WELLNESS_KEYS_INJECTABLE.includes(k) || WELLNESS_KEYS_ORAL.includes(k);

// The goals she chose for the same product in her other protocols (ended ones too): most chosen
// first, then the order of the list given (the screen passes the newest first).
function pastPurpose(protocols, { compoundId, name, excludeId }) {
  const n = norm(name);
  const count = new Map();
  for (const p of protocols || []) {
    if (!p || (excludeId != null && p.id === excludeId)) continue;
    const same = (compoundId && p.compound_id === compoundId) || (n && norm(p.name) === n);
    if (!same) continue;
    for (const k of goalKeys(p.goal)) if (isKnownKey(k)) count.set(k, (count.get(k) || 0) + 1);
  }
  const first = [...count.keys()];
  return first.sort((a, b) => (count.get(b) - count.get(a)) || (first.indexOf(a) - first.indexOf(b)));
}

// → every goal key for this product, in tile order: (a) her past choices for it, (b) the table, (c)
// the rest alphabetical in the app language. A dose at night moves a sleep key up within its group.
function purposeOrder({ type, compoundId, name, protocols, excludeId, times, label, language } = {}) {
  const lab = typeof label === 'function' ? label : (k) => k;
  const base = purposeKeysFor(type);
  const byLabel = new Map(base.map((k) => [norm(lab(k)), k]));
  const taken = new Set();
  // A key outside the type's list joins it, unless a key with the same label is already there.
  const resolve = (k) => {
    if (base.includes(k)) return k;
    const twin = byLabel.get(norm(lab(k)));
    if (twin) return twin;
    byLabel.set(norm(lab(k)), k);
    return k;
  };
  const group = (keys) => {
    const out = [];
    for (const k of keys) { const r = resolve(k); if (!taken.has(r)) { taken.add(r); out.push(r); } }
    return out;
  };
  const a = group(pastPurpose(protocols, { compoundId, name, excludeId }));
  const b = group((compoundId && TYPICAL_PURPOSE[compoundId]) || []);
  const collator = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator(language || 'en') : null;
  const cmp = (x, y) => (collator ? collator.compare(lab(x), lab(y)) : String(lab(x)).localeCompare(String(lab(y))));
  const c = group(base.filter((k) => !taken.has(k)).sort(cmp));
  const night = (times || []).some(isNightTime);
  const lift = (g) => (night ? [...g.filter((k) => SLEEP_KEYS.includes(k)), ...g.filter((k) => !SLEEP_KEYS.includes(k))] : g);
  return [...lift(a), ...lift(b), ...lift(c)];
}

// → { keys: the tiles to draw, legacy: selected keys not in the list (drawn selected), total, hidden }.
// Collapsed: the first `limit`, plus every selected tile beyond them (in list order).
function purposeTiles(ordered, selected, { expanded = false, limit = 6 } = {}) {
  const list = Array.isArray(ordered) ? ordered : [];
  const sel = Array.isArray(selected) ? selected : [];
  const legacy = sel.filter((k, i) => !list.includes(k) && sel.indexOf(k) === i);
  if (expanded || list.length <= limit) return { keys: list.slice(), legacy, total: list.length, hidden: 0 };
  const keys = list.filter((k, i) => i < limit || sel.includes(k));
  return { keys, legacy, total: list.length, hidden: list.length - keys.length };
}

// Onboarding "Protocolo pronto" (PQ-14 / PQ-17): her profile goals (lib/goalCategories keys) → the
// protocol goal of the same meaning, kept only when it is in that product's curated table. Her goals
// were answered for her life in general, not for this product: a product with no table entry (or no
// match) gets no goal, never a fallback to the type's list (false data; she picks it in the form).
const PROFILE_PURPOSE = {
  fitness: { injectable: 'wt_athletic' },
  strength: { injectable: 'wt_strength' },
  fat_loss: { injectable: 'wt_weight' },
  endurance: { injectable: 'wt_endurance' },
  body_composition: { injectable: 'wt_body_comp' },
  energy: { injectable: 'wt_vitality' },
  sleep: { injectable: 'wt_sleep_opt', oral: 'wt_sleep_quality' },
  hormonal_balance: { injectable: 'wt_hormone_balance' },
  longevity: { injectable: 'wt_longevity' },
  immune: { oral: 'wt_immune' },
  recovery: { injectable: 'wt_recovery_support' },
  skin_collagen: { injectable: 'wt_skin' },
  mood: { injectable: 'wt_mood' },
  sexual_health: { injectable: 'wt_sexual' },
  joint_bone: { injectable: 'wt_joint', oral: 'wt_joint_health' },
  cardiovascular: { oral: 'wt_heart_wellness' },
  stress: { injectable: 'wt_stress', oral: 'wt_stress_mgmt' },
};

function purposeFromProfile(profileGoals, type, compoundId) {
  const goals = Array.isArray(profileGoals) ? profileGoals : goalKeys(profileGoals);
  const usual = (compoundId && TYPICAL_PURPOSE[compoundId]) || [];
  const out = [];
  for (const g of goals) {
    const m = PROFILE_PURPOSE[g];
    const k = m && (type === 'oral' ? m.oral : m.injectable);
    if (k && usual.includes(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

module.exports = {
  WELLNESS_KEYS_INJECTABLE, WELLNESS_KEYS_ORAL, TYPICAL_PURPOSE, SLEEP_KEYS, PROFILE_PURPOSE,
  purposeKeysFor, isNightTime, goalKeys, pastPurpose, purposeOrder, purposeTiles, purposeFromProfile,
};
