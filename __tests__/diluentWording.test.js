'use strict';
// The diluent is never assumed to be water (founder 2026-11-20: "Por que que a gente está deduzindo que a
// pessoa usou água? A pessoa vai usar um diluente, mas a gente não sabe se ela vai usar água, se vai usar
// soro"). Every text about the liquid mixed into a powder vial says "diluent" in the app's own term for each
// language (protocols_diluent); only the named diluent options (bacteriostatic / sterile water) may say water,
// and the bacteriostatic-water note shows only when that diluent is the one chosen.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const m = require('../i18n/translations.js');
const T = m.translations || m.default || m;

const LANGS = ['en', 'pt', 'es', 'fr', 'de', 'it'];
const WATER = /(\bwater\b|água|\bagua\b|\beau\b|\bd'eau\b|wasser|acqua)/i;
const KEYS = ['xp_recon_body', 'xp_recon_water', 'protocols_water_label', 'protocols_draw_exceeds_warning', 'ap_not_mixed',
  'ap_fit_fact_powder', 'fx_s1_powder', 'vials_mix_summary', 'protocols_enter_water', 'vials_water', 'vials_water_prefill'];

test('diluent texts never say water, in all six languages', () => {
  for (const L of LANGS) for (const k of KEYS) {
    const v = T[L][k];
    assert.ok(typeof v === 'string' && v.length, `${L}.${k} exists`);
    assert.ok(!WATER.test(v.replace(/\{[a-z_]+\}/gi, '')), `${L}.${k} says water: ${v}`);
  }
});

test('diluent texts use the app term for the diluent in each language', () => {
  const term = { en: /diluent/i, pt: /diluente/i, es: /diluyente/i, fr: /diluant/i, de: /lösungsmittel/i, it: /diluente/i };
  for (const L of LANGS) for (const k of KEYS) assert.match(T[L][k], term[L], `${L}.${k}`);
});

test('the bacteriostatic-water note shows only when that diluent is chosen', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'ProtocolsScreen.js'), 'utf8');
  const i = src.indexOf("t('protocols_bac_info')");
  assert.ok(i > 0);
  const before = src.slice(Math.max(0, i - 200), i);
  assert.match(before, /diluentChoice === 'bacteriostatic_water'/);
});
