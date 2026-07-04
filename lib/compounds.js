// Compound alias + search layer for the canonical picker.
//
// The compound `id` is the existing i18n translation key (e.g. `lyo_bpc_157`) —
// stable and language-independent. The display name comes from t(id); the
// protocol stores the id (compound_id), never the localized string. This module
// adds the alias/search layer so "klow", "deca", "reta", "test e", brand names,
// and common misspellings route to the right canonical id.
//
// Blends (Glow, KLOW, Wolverine…) are entries too, but we make NO claim about
// what's in them — the app records the user's compound, it does not assert a
// composition (per the LLM-council verdict + the "not medical advice" posture).
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
  lyo_tb_500: ['tb', 'tb500', 'thymosin beta 4', 'tb4'],
  lyo_ghk_cu: ['ghk', 'ghkcu', 'copper peptide'],
  lyo_kpv: ['kpv'],
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

module.exports = { BLEND_IDS, ALIASES, matchesQuery };
