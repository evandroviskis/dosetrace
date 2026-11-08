'use strict';
// Review 2026-10-02 (LOW, item 4): Your numbers shows every saved number in the app
// language — a saved "86.5" string too, not only a number — and every write to the synced
// calc_inputs payload stores one canonical dot-decimal string ("86.5"), never "86,5" from a
// Portuguese weigh-in. Readers (lib/progressCard, lib/progressTile) accept both forms.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { canonicalDecimal } = require('../lib/doseMath');

const CALC = fs.readFileSync(path.join(__dirname, '..', 'screens', 'components', 'CalculatorSection.js'), 'utf8');

test('canonicalDecimal stores a typed number as a dot-decimal string in every language', () => {
  assert.equal(canonicalDecimal('86,5', 'pt'), '86.5');
  assert.equal(canonicalDecimal('86,5', 'de'), '86.5');
  assert.equal(canonicalDecimal('86.5', 'en'), '86.5');
  assert.equal(canonicalDecimal('86.5', 'pt'), '86.5');
  assert.equal(canonicalDecimal('177', 'fr'), '177');
  assert.equal(canonicalDecimal(84.6, 'it'), '84.6');
  assert.equal(canonicalDecimal('1.250', 'es'), '1250');
  assert.equal(canonicalDecimal('', 'pt'), '');
  assert.equal(canonicalDecimal(null, 'pt'), null);
  assert.equal(canonicalDecimal('abc', 'pt'), 'abc', 'not a number: kept as typed');
});

test('Your numbers writes canonical numbers to calc_inputs', () => {
  // (second review: read with the body-number rule, lib/doseMath parseMeasure)
  // S25 2026-11-07: weight / height / waist go through lib/unitFields fieldSave (canonicalDecimal for a
  // typed value; the exact conversion plus its typed source while a field shows the other unit).
  const { fieldSave } = require('../lib/unitFields');
  assert.equal(fieldSave('86,5', 'weight', 'metric', null, 'pt').value, '86.5');
  assert.equal(fieldSave('177', 'length', 'metric', null, 'fr').value, '177');
  assert.equal(fieldSave('86.5', 'weight', 'imperial', null, 'en').value, '86.5');
  assert.match(CALC, /const fw = fieldSave\(weight, 'weight', unit, m\.weight, language\);/);
  assert.match(CALC, /const fh = fieldSave\(height, 'length', unit, m\.height, language\);/);
  assert.match(CALC, /const fwa = fieldSave\(waist, 'length', unit, m\.waist, language\);/);
  assert.match(CALC, /inputsSave\.current\.schedule\(\{ unit, weight: fw\.value, bfSource, bodyFat: canonicalDecimal\(bodyFat, language, parseMeasure\), sex, age, height: fh\.value, activity, activitySetAt, goal, waist: fwa\.value,/);
});

test('Your numbers prefills a saved string in the app language too', () => {
  // Body fat directly; weight / height / waist through lib/unitFields fieldLoad (savedFieldText).
  const { fieldLoad } = require('../lib/unitFields');
  assert.equal(fieldLoad('86.5', null, 'weight', 'metric', 'pt').text, '86,5');
  assert.equal(fieldLoad(84.6, null, 'weight', 'metric', 'de').text, '84,6');
  assert.equal(fieldLoad('177', undefined, 'length', 'imperial', 'it').text, '177');
  assert.match(CALC, /if \(saved\.bodyFat != null\) setBodyFat\(savedFieldText\(saved\.bodyFat, language\)\);/);
  assert.match(CALC, /fieldLoad\(savedObj\[key\], typedAs\[key\], kind, savedUnit, language\)/);
  assert.match(CALC, /const wLoad = load\('weight', 'weight'\), hLoad = load\('height', 'length'\), waLoad = load\('waist', 'length'\);/);
  for (const [l, setter] of [['wLoad', 'setWeight'], ['hLoad', 'setHeight'], ['waLoad', 'setWaist']]) {
    assert.match(CALC, new RegExp(`if \\(${l}\\) ${setter}\\(${l}\\.text\\);`), setter);
  }
});
