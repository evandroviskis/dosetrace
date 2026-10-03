'use strict';
// Founder 2026-10-02: translation errors that said something different from the English
// (wrong feature, wrong frequency, download for upload, "draw" as in drawing a picture,
// bath for toilet, slang, misspelled compound names, "analyse" for a scan that only reads
// values — the AI hard line). Each one is pinned here so it cannot come back.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = load();
const LANGS = ['es', 'pt', 'fr', 'de', 'it'];
const str = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

test('coming-soon "any-language scanning" says the same thing as the live bullet in every language', () => {
  for (const l of LANGS) {
    assert.doesNotMatch(tr[l].paywall_coming_4, /Apple|Health|Watch/i, l);
    assert.equal(tr[l].paywall_coming_4, tr[l].paywall_feat_8, l);
  }
});

test('German syringe size is a size, not troubleshooting', () => {
  assert.equal(tr.de.protocols_syringe_size_label, 'Spritzengröße');
});

test('Bi-weekly is every two weeks, never twice a week', () => {
  assert.doesNotMatch(tr.fr.protocols_biweekly, /bihebdomadaire/i);
  assert.doesNotMatch(tr.it.protocols_biweekly, /bisettimanale/i);
});

test('French upload strings never say télécharger (download)', () => {
  const upload = ['blood_upload', 'blood_upload_modal_title', 'paywall_feat_5', 'paywall_free_feat_7', 'paywall_free_feat_10',
    'paywall_bloodwork_sub', 'paywall_single_title', 'paywall_single_sub', 'paywall_single_btn', 'paywall_single_note', 'consent_data_3'];
  for (const k of upload) assert.doesNotMatch(tr.fr[k], /t[ée]l[ée]charg/i, k);
  assert.doesNotMatch(str(tr.fr.faq_categories), /téléchargement d'examen|Téléchargez un rapport/);
});

test('drawing into a syringe is never the verb for drawing a picture', () => {
  for (const l of LANGS) assert.doesNotMatch(str(tr[l].faq_categories), /desenhar|dessiner|dibujar|disegnare|zeichnen/i, l);
});

test('weigh-in tip says after the toilet, not after a bath; a calorie deficit, not a fat deficit', () => {
  assert.doesNotMatch(tr.es.cal_expl_scale_body, /después del baño|déficit real de grasa/);
  assert.doesNotMatch(tr.it.cal_expl_scale_body, /dopo il bagno|deficit di grasso/);
  assert.doesNotMatch(tr.pt.cal_expl_scale_body, /após o banheiro|déficit real de gordura/);
  assert.doesNotMatch(tr.fr.cal_expl_scale_body, /déficit de graisse/);
  assert.doesNotMatch(tr.de.cal_expl_scale_body, /Fettdefizit/);
});

test('German gummies are Fruchtgummis', () => {
  assert.equal(tr.de.protocols_gummy, 'Fruchtgummi');
  assert.equal(tr.de.oral_unit_gummy, 'Fruchtgummis');
});

test('compound names are spelled right', () => {
  for (const l of ['es', 'pt']) assert.equal(tr[l].lyo_ipamorelin, 'Ipamorelina', l);
  assert.equal(tr.fr.lyo_ipamorelin, 'Ipamoréline');
  assert.equal(tr.fr.lyo_tirzepatide, 'Tirzépatide');
  assert.equal(tr.fr.rtu_tirzepatide, 'Tirzépatide');
  assert.equal(tr.pt.lyo_cetrorelix_acetate, 'Acetato de Cetrorrelix');
  for (const l of LANGS) {
    for (const k of ['lyo_epithalon', 'lyo_ac_epithalon', 'lyo_n_acetyl_epitalon_amidate', 'lyo_melanotan_1', 'lyo_melanotan_2']) {
      assert.doesNotMatch(tr[l][k], /ã|Epithalón|Melanotán/, `${l}.${k}`);
    }
    for (const k of ['rtu_trenbolone_acetate', 'rtu_trenbolone_enanthate']) assert.doesNotMatch(tr[l][k], /Trénbolone/, `${l}.${k}`);
  }
  assert.equal(tr.de.rtu_boldenone_undecylenate, 'Boldenon Undecylenat');
});

test('the lab scan reads and extracts values, it never analyses them (AI hard line)', () => {
  const scan = ['blood_uploading', 'blood_what_we_read', 'blood_error_extract', 'blood_premium_only', 'blood_error_service'];
  for (const l of LANGS) for (const k of scan) assert.doesNotMatch(tr[l][k], /Analizando|analizar|análise de sangue|analisar|analysiert|analysieren|Analyse fehlgeschlagen|Blutbild-Analyse|Analyse de votre|Analyse impossible|analyse sanguine|nous analysons|Service d'analyse|analizzare|Analisi del tuo|Analisi non riuscita|analisi del sangue è|El análisis de sangre es/i, `${l}.${k}`);
});
