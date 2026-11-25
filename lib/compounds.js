// Compound alias + search layer for the canonical picker.
//
// The compound `id` is the existing i18n translation key (e.g. `lyo_bpc_157`) —
// stable and language-independent. The display name comes from t(id); the
// protocol stores the id (compound_id), never the localized string. This module
// adds the alias/search layer so "klow", "deca", "reta", "test e", brand names,
// and common misspellings route to the right canonical id.
//
// Blends (Glow, KLOW, Wolverine…) are entries too. We show their COMMON,
// community-standard composition as a neutral hint (BLEND_COMPOSITION below),
// always paired with a "varies by source — check your vial" caveat (i18n
// blend_varies_hint). This is factual composition, NOT a claim about effects and
// NOT advice — it stays inside the honest-journal / not-medical-advice posture,
// and reverses the earlier no-composition call (founder directive 2026-09-18:
// "if we have the info, why not show the user?"). It never asserts a specific
// vendor's exact recipe.
//
// CommonJS so `node --test` can require it; Metro imports it fine.

// Well-known reconstituted blends added to the lyophilized list. Their ids are
// added to LYOPHILIZED_KEYS in the picker; their names live in i18n.
const BLEND_IDS = ['lyo_glow', 'lyo_klow', 'lyo_wolverine'];

// id → alternate search terms (shorthand, brand names, common misspellings,
// foreign spellings). Only the high-traffic compounds need entries; everything
// else is found by its canonical name. Missing coverage is handled by the
// always-available "add it yourself" escape hatch, never a block.
const ALIASES = {
  // Blends
  lyo_glow: ['glow'],
  lyo_klow: ['klow', 'k low'],
  lyo_wolverine: ['wolverine', 'bpc tb', 'bpc/tb', 'bpc+tb'],
  // Healing / recovery peptides
  lyo_bpc_157: ['bpc', 'bpc157', 'body protection compound'],
  lyo_pentadeca_arginate: ['pda', 'pentadeca', 'penta', 'bpc arginate'],
  lyo_fsh: ['fsh', 'follicle stimulating hormone'],
  lyo_pinealon: ['pinealon'],
  rtu_testosterone_suspension: ['test suspension', 'test susp', 'aquaviron'],
  rtu_trenbolone_hexahydrobenzylcarbonate: ['parabolan', 'tren hexa', 'trenbolone hexa'],
  rtu_insulin_lispro: ['humalog', 'lispro'],
  rtu_insulin_aspart: ['novolog', 'novorapid', 'aspart'],
  rtu_insulin_glargine: ['lantus', 'basaglar', 'glargine'],
  rtu_insulin_degludec: ['tresiba', 'degludec'],
  lyo_tb_500: ['tb', 'tb500', 'thymosin beta 4', 'tb4'],
  lyo_ghk_cu: ['ghk', 'ghkcu', 'copper peptide'],
  lyo_kpv: ['kpv'],
  lyo_eloralintide: ['elora', 'eloralintida', 'ly3841136', 'ly-3841136'],
  // GLP-1 / metabolic (incl. brand names)
  lyo_retatrutide: ['reta', 'retra'],
  lyo_tirzepatide: ['tirz', 'mounjaro', 'zepbound'],
  lyo_semaglutide: ['sema', 'ozempic', 'wegovy'],
  rtu_tirzepatide: ['tirz', 'mounjaro', 'zepbound'],
  rtu_semaglutide: ['sema', 'ozempic', 'wegovy'],
  lyo_cagrilintide: ['cagri'],
  // GH secretagogues
  lyo_cjc_1295_with_dac: ['cjc', 'cjc dac', 'cjc1295 dac'],
  lyo_cjc_1295_without_dac: ['cjc no dac', 'mod grf', 'modgrf'],
  lyo_ipamorelin: ['ipa', 'ipam'],
  lyo_mots_c: ['mots', 'motsc'],
  lyo_nad_plus: ['nad', 'nad plus'],
  lyo_tesamorelin: ['tesa', 'egrifta'],
  lyo_sermorelin: ['serm'],
  // Sexual / other
  lyo_pt_141: ['pt141', 'bremelanotide'],
  lyo_melanotan_2: ['mt2', 'mt 2', 'melanotan ii'],
  lyo_melanotan_1: ['mt1', 'mt 1', 'melanotan i', 'afamelanotide'],
  lyo_hcg: ['hcg', 'human chorionic gonadotropin'],
  // RTU hormones / AAS shorthand
  rtu_testosterone_enanthate: ['test e', 'teste', 'test enanthate'],
  rtu_testosterone_cypionate: ['test c', 'testc', 'test cyp', 'test cypionate'],
  rtu_testosterone_propionate: ['test p', 'testp', 'test prop'],
  rtu_testosterone_undecanoate: ['test u', 'nebido', 'aveed'],
  rtu_nandrolone_decanoate: ['deca', 'deca durabolin', 'nandrolone'],
  rtu_nandrolone_phenylpropionate: ['npp'],
  rtu_trenbolone_acetate: ['tren a', 'tren ace'],
  rtu_trenbolone_enanthate: ['tren e'],
  rtu_drostanolone_propionate: ['masteron', 'mast p', 'mast prop'],
  rtu_drostanolone_enanthate: ['masteron e', 'mast e'],
  rtu_boldenone_undecylenate: ['eq', 'equipoise', 'boldenone'],
  rtu_methenolone_enanthate: ['primo', 'primobolan'],
  rtu_stanozolol: ['winstrol', 'winny', 'stanozolol'],
  rtu_sustanon_250: ['sust', 'sustanon', 'sust 250'],
  // B12 family
  rtu_cyanocobalamin: ['b12', 'vitamin b12'],
  rtu_methylcobalamin: ['b12', 'methyl b12'],
  rtu_hydroxocobalamin: ['b12', 'hydroxo b12'],
};

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '');

// Does a compound match the search query? Matches its display label (current
// language), its id, or any alias — all normalized so "tb-500" finds "tb500".
// An empty query matches everything (browse mode).
function matchesQuery(query, id, label) {
  const q = norm(query);
  if (!q) return true;
  if (norm(label).includes(q)) return true;
  if (norm(id).includes(q)) return true;
  return (ALIASES[id] || []).some((a) => norm(a).includes(q));
}

// Common, community-standard composition of the known blends, as component
// compound ids (each an entry in its own right, so the UI can localize the names
// via t(id) and — later — offer to log each component so the serum curve works).
// This is the WIDELY-USED recipe, not an assertion about any one vial; always
// show it with the blend_varies_hint caveat.
const BLEND_COMPOSITION = {
  lyo_wolverine: ['lyo_bpc_157', 'lyo_tb_500'],
  lyo_glow: ['lyo_ghk_cu', 'lyo_bpc_157', 'lyo_tb_500'],
  lyo_klow: ['lyo_kpv', 'lyo_ghk_cu', 'lyo_bpc_157', 'lyo_tb_500'],
};

// Given a compound id and the t() function, return the localized "commonly
// contains" component-name string (e.g. "BPC-157 + TB-500"), or null if not a
// known blend. The caller pairs it with t('blend_varies_hint').
function blendComposition(id, t) {
  const parts = BLEND_COMPOSITION[id];
  if (!parts || !parts.length) return null;
  return parts.map((p) => (t ? t(p) : p)).join(' + ');
}

// Canonical mg ratio for each blend (community-standard recipe). Used to split a
// logged blend dose into per-component doses so each component draws its own
// serum curve. RATIOS, not absolute mg — scaled to whatever vial size the user
// logs. Recipes VARY BY SOURCE (always shown with blend_varies_hint); this is the
// common split, and the curve is labeled as an estimate from it.
//   KLOW 80mg = 50 GHK-Cu / 10 KPV / 10 TB-500 / 10 BPC-157 (founder 2026-09-18)
//   GLOW = KLOW without KPV; Wolverine = 1:1 BPC-157 / TB-500
const BLEND_RATIOS = {
  lyo_klow: [
    { id: 'lyo_ghk_cu', mg: 50 }, { id: 'lyo_kpv', mg: 10 },
    { id: 'lyo_tb_500', mg: 10 }, { id: 'lyo_bpc_157', mg: 10 },
  ],
  lyo_glow: [
    { id: 'lyo_ghk_cu', mg: 50 }, { id: 'lyo_bpc_157', mg: 10 }, { id: 'lyo_tb_500', mg: 10 },
  ],
  lyo_wolverine: [
    { id: 'lyo_bpc_157', mg: 1 }, { id: 'lyo_tb_500', mg: 1 },
  ],
};

// Split a logged blend dose into per-component { id, dose } using the canonical
// ratio. Returns null if not a known blend. dose is in the same unit the user
// logged (mg); ratio is scaled so the component doses sum to the logged total.
function blendComponents(id, totalDose) {
  const parts = BLEND_RATIOS[id];
  if (!parts || !parts.length) return null;
  const sum = parts.reduce((a, p) => a + p.mg, 0);
  const total = require('./doseMath').parseDecimal(totalDose) || 0; // a stored "0,5" is 0.5
  return parts.map((p) => ({ id: p.id, dose: total * (p.mg / sum) }));
}

// The catalog the add-protocol form and the onboarding list from (one list, moved here from
// screens/ProtocolsScreen.js so the onboarding filters the same catalog, OB-14). The id is the i18n key.
const LYOPHILIZED_KEYS = ['lyo_5_amino_1mq','lyo_alpha_endorphin','lyo_alpha_msh','lyo_gamma_endorphin','lyo_ac_epithalon','lyo_ace_031','lyo_adamax','lyo_adipotide','lyo_aicar','lyo_albiglutide','lyo_aod_9604','lyo_ara_290','lyo_bpc_157','lyo_cagrilintide','lyo_cecropin_b','lyo_cerebrolysin','lyo_cetrorelix_acetate','lyo_cjc_1295_with_dac','lyo_cjc_1295_without_dac','lyo_cortexin','lyo_dermorphin','lyo_dihexa','lyo_dsip','lyo_dulaglutide','lyo_eloralintide','lyo_epithalon','lyo_epo','lyo_exenatide','lyo_follistatin_344','lyo_foxo4_dri','lyo_fsh','lyo_gdf_8','lyo_ghk_cu','lyo_ghrelin','lyo_ghrp_2','lyo_ghrp_6','lyo_glutathione','lyo_gonadorelin','lyo_gts_21','lyo_hcg','lyo_hexarelin','lyo_hgh','lyo_hgh_fragment_176_191','lyo_hmg','lyo_humanin','lyo_hyaluronic_acid','lyo_igf_1_des','lyo_igf_1_lr3','lyo_ipamorelin','lyo_kisspeptin_10','lyo_kisspeptin_13','lyo_kpv','lyo_lc120','lyo_lc216','lyo_liraglutide','lyo_lixisenatide','lyo_ll_37','lyo_mazdutide','lyo_melanotan_1','lyo_melanotan_2','lyo_melatonin','lyo_mgf','lyo_mog_35_55','lyo_mots_c','lyo_myostatin','lyo_n_acetyl_selank_amidate','lyo_n_acetyl_semax_amidate','lyo_n_acetyl_epitalon_amidate','lyo_nad_plus','lyo_octreotide','lyo_orexin_a','lyo_oxytocin','lyo_p21','lyo_pe_22_28','lyo_peg_mgf','lyo_pentadeca_arginate','lyo_peptide_t','lyo_pinealon','lyo_pt_141','lyo_retatrutide','lyo_rgd_peptide','lyo_selank','lyo_semaglutide','lyo_semax','lyo_sermorelin','lyo_snap_8','lyo_ss_31','lyo_survodutide','lyo_tb_500','lyo_tesamorelin','lyo_tesofensine','lyo_thymalin','lyo_thymosin_alpha_1','lyo_thymosin_beta_4','lyo_thymulin','lyo_tirzepatide','lyo_triptorelin','lyo_vip','lyo_glow','lyo_klow','lyo_wolverine'];
const RTU_KEYS = ['rtu_boldenone_undecylenate','rtu_cyanocobalamin','rtu_drostanolone_enanthate','rtu_drostanolone_propionate','rtu_dulaglutide','rtu_estradiol_cypionate','rtu_estradiol_valerate','rtu_hydroxocobalamin','rtu_insulin_aspart','rtu_insulin_degludec','rtu_insulin_glargine','rtu_insulin_lispro','rtu_l_carnitine','rtu_lipo_c','rtu_liraglutide','rtu_methenolone_enanthate','rtu_methylcobalamin','rtu_mic_blend','rtu_nandrolone_decanoate','rtu_nandrolone_phenylpropionate','rtu_progesterone','rtu_pyridoxine','rtu_semaglutide','rtu_stanozolol','rtu_sustanon_250','rtu_testosterone_cypionate','rtu_testosterone_enanthate','rtu_testosterone_propionate','rtu_testosterone_suspension','rtu_testosterone_undecanoate','rtu_tirzepatide','rtu_trenbolone_acetate','rtu_trenbolone_enanthate','rtu_trenbolone_hexahydrobenzylcarbonate'];
const ORAL_KEYS = ['oral_alpha_gpc','oral_ala','oral_ashwagandha','oral_astragalus','oral_bacopa','oral_berberine','oral_beta_alanine','oral_citrulline','oral_coq10','oral_creatine','oral_curcumin','oral_gaba','oral_grape_seed','oral_krill_oil','oral_carnitine','oral_glutamine','oral_theanine','oral_tyrosine','oral_lions_mane','oral_maca','oral_mag_bisglycinate','oral_mag_threonate','oral_melatonin','oral_milk_thistle','oral_nac','oral_nmn','oral_nr','oral_omega3','oral_probiotics','oral_red_yeast','oral_resveratrol','oral_rhodiola','oral_saw_palmetto','oral_taurine','oral_tudca','oral_vit_b','oral_vit_c','oral_vit_d3','oral_vit_k2','oral_zinc'];

module.exports = { LYOPHILIZED_KEYS, RTU_KEYS, ORAL_KEYS, BLEND_IDS, ALIASES, matchesQuery, BLEND_COMPOSITION, blendComposition, BLEND_RATIOS, blendComponents };
