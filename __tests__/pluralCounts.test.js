'use strict';
// Bug 2026-10-02 (sim check): counts of 1 used the plural in every language - "1 doses
// restantes sur 4", "Faible · 1 restantes", "1 restantes", "day(s)", "entry(ies)". Every count
// string that can be 1 now has a singular key (key_one, same placeholders) and the screens
// pick it with lib/plural.js (French: singular for 0 and 1).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isOne, pluralKey } = require('../lib/plural');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = load();
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const ph = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');

const KEYS = ['nutri_free_note', 'nutri_hero_today', 'notif_morning_due_private', 'today_more_later', 'today_vial_new_capacity',
  'blood_premium_markers', 'protocols_vial_days_left', 'protocols_doses_left', 'protocols_doses_capacity', 'protocols_low_supply',
  'protocols_history_weeks', 'protocols_history_days', 'report_streak_line', 'report_vial_line', 'blood_imported_body',
  'vax_imported_body', 'vax_imported_dropped', 'bodymap_n_selected'];

test('the plural rule: French singular for 0 and 1, the others for 1 only', () => {
  assert.equal(isOne(1, 'en'), true);
  assert.equal(isOne(0, 'en'), false);
  assert.equal(isOne(2, 'pt'), false);
  assert.equal(isOne(0, 'fr'), true);
  assert.equal(isOne(1, 'fr'), true);
  assert.equal(isOne(2, 'fr'), false);
  assert.equal(pluralKey('protocols_low_supply', 1, 'de'), 'protocols_low_supply_one');
  assert.equal(pluralKey('protocols_low_supply', 3, 'de'), 'protocols_low_supply');
});

test('every count string has a singular form with the same placeholders, in 6 languages', () => {
  for (const k of KEYS) for (const l of LANGS) {
    assert.ok(tr[l][`${k}_one`], `${l}.${k}_one`);
    assert.equal(ph(tr[l][`${k}_one`]), ph(tr.en[k]), `${l}.${k}_one placeholders`);
  }
});

test('no "(s)" style plurals left', () => {
  for (const l of LANGS) for (const k of KEYS) {
    for (const v of [tr[l][k], tr[l][`${k}_one`]]) assert.doesNotMatch(String(v), /\((s|e|es|ies|i)\)|\/i\b|\/Einträge/, `${l}.${k}: ${v}`);
  }
});

test('the reported cases read right with 1', () => {
  const one = (l, k, vars) => Object.entries(vars).reduce((s, [p, v]) => s.split(`{${p}}`).join(String(v)), tr[l][pluralKey(k, 1, l)]);
  assert.equal(one('fr', 'protocols_doses_left', { n: 1, total: 4 }), '1 dose restante sur 4');
  assert.equal(one('fr', 'protocols_low_supply', { n: 1 }), 'Faible · 1 restante');
  assert.equal(one('pt', 'protocols_low_supply', { n: 1 }), 'Baixo · 1 restante');
  assert.equal(one('pt', 'protocols_vial_days_left', { n: 1 }), '1 dia restante');
  assert.equal(one('en', 'report_streak_line', { days: 1 }), 'Current streak: 1 day');
  assert.equal(tr.en.report_streak_line, 'Current streak: {days} days');
  assert.equal(one('es', 'vax_imported_dropped', { count: 1 }), '1 entrada sin fecha legible se omitió.');
});

test('the screens pick the singular with pluralKey', () => {
  const uses = {
    'screens/FoodChatScreen.js': ['nutri_free_note'],
    'screens/components/FoodLogHero.js': ['nutri_hero_today'],
    'lib/notifications.js': ['notif_morning_due_private'],
    'screens/TodayScreen.js': ['today_more_later', 'today_vial_new_capacity', 'protocols_vial_days_left'],
    'screens/BodyScreen.js': ['blood_premium_markers', 'blood_imported_body'],
    'screens/ProtocolsScreen.js': ['protocols_vial_days_left', 'protocols_doses_left', 'protocols_doses_capacity', 'protocols_low_supply', 'protocols_history_weeks', 'protocols_history_days'],
    'screens/SettingsScreen.js': ['report_streak_line', 'report_vial_line'],
    'screens/components/VaccinesSection.js': ['vax_imported_body', 'vax_imported_dropped'],
    'screens/components/BodyMapModal.js': ['bodymap_n_selected'],
  };
  for (const [f, keys] of Object.entries(uses)) {
    const src = read(f);
    for (const k of keys) {
      assert.match(src, new RegExp(`pluralKey\\('${k}'`), `${f} picks ${k} with pluralKey`);
      assert.doesNotMatch(src, new RegExp(`t\\('${k}'\\)`), `${f} has no plain t('${k}') left`);
    }
  }
});
