'use strict';
// A-136 (7) — guided device session 2026-10-17 (Fold7, pt): the serving calculator read
// "1 cápsulas". Every serving unit word (oral_unit_capsule / tablet / softgel / gummy / scoop /
// ml) had only its plural form, printed after any count.
// Fix: each word gets its singular (_one) in all 6 languages, written the way the app's own
// language says it, and every count + word on the protocol page and in the wizard picks it with
// lib/plural pluralKey (the singular for 1; French for 0 and 1): the big "take" number, its
// accessibility label, the nearest-amount line (each count its own word) and the "Left" read.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');
const { pluralKey } = require('../lib/plural');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const UNITS = ['oral_unit_capsule', 'oral_unit_tablet', 'oral_unit_softgel', 'oral_unit_gummy', 'oral_unit_scoop', 'oral_unit_ml'];
const ONE = {
  en: ['capsule', 'tablet', 'softgel', 'gummy', 'scoop', 'ml'],
  es: ['cápsula', 'comprimido', 'cápsula blanda', 'gomita', 'medida', 'ml'],
  pt: ['cápsula', 'comprimido', 'cápsula em gel', 'goma', 'medida', 'ml'],
  fr: ['gélule', 'comprimé', 'capsule molle', 'gomme', 'mesure', 'ml'],
  de: ['Kapsel', 'Tablette', 'Weichkapsel', 'Fruchtgummi', 'Messlöffel', 'ml'],
  it: ['capsula', 'compressa', 'capsula molle', 'caramella gommosa', 'misurino', 'ml'],
};

test('A-136 (7): every serving word has its singular in all 6 languages', () => {
  for (const l of LANGS) {
    UNITS.forEach((k, i) => {
      assert.equal(tr[l][`${k}_one`], ONE[l][i], `${l} ${k}_one`);
      assert.ok(tr[l][k], `${l} ${k} (plural) still there`);
    });
  }
});

test('A-136 (7): 1 cápsula, 2 cápsulas; French 0 and 1 gélule', () => {
  const word = (k, n, l) => tr[l][pluralKey(k, n, l)];
  assert.equal(word('oral_unit_capsule', 1, 'pt'), 'cápsula');
  assert.equal(word('oral_unit_capsule', 2, 'pt'), 'cápsulas');
  assert.equal(word('oral_unit_capsule', 58, 'pt'), 'cápsulas');
  assert.equal(word('oral_unit_capsule', 0, 'fr'), 'gélule');
  assert.equal(word('oral_unit_capsule', 1, 'fr'), 'gélule');
  assert.equal(word('oral_unit_capsule', 2, 'fr'), 'gélules');
  assert.equal(word('oral_unit_tablet', 1, 'en'), 'tablet');
  assert.equal(word('oral_unit_tablet', 0, 'en'), 'tablets');
  assert.equal(word('oral_unit_gummy', 1, 'de'), 'Fruchtgummi');
});

test('A-136 (7): the protocol page and the wizard pick the word by its count', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/ProtocolsScreen.js'), 'utf8');
  assert.doesNotMatch(src, /t\(r\.unitKey\)/, 'no count prints the plural word blindly');
  assert.equal((src.match(/const unitWord = \(n\) => t\(pluralKey\(r\.unitKey, n, language\)\);/g) || []).length, 2, 'the page and the wizard');
  // take amount (page, a11y label, wizard), nearest low / high (page + wizard), left
  assert.equal((src.match(/\{unitWord\(r\.unitsNeeded\)\}/g) || []).length, 3, 'the big take word: page, its accessibility label, wizard');
  assert.match(src, /\\u00A0\$\{unitWord\(r\.unitsNeeded\)\}`\}>/, 'the accessibility label');
  assert.equal((src.match(/\{unitWord\(r\.nearest\.lowUnits\)\}/g) || []).length, 2);
  assert.equal((src.match(/\{unitWord\(r\.nearest\.highUnits\)\}/g) || []).length, 2);
  assert.match(src, /value: `\$\{decimalText\(unitsLeft, language\)\}\\u00A0\$\{unitWord\(unitsLeft\)\}`/);
});
