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
  assert.match(CALC, /inputsSave\.current\.schedule\(\{ unit, weight: canonicalDecimal\(weight, language, parseMeasure\), bfSource, bodyFat: canonicalDecimal\(bodyFat, language, parseMeasure\), sex, age, height: canonicalDecimal\(height, language, parseMeasure\), activity, goal, waist: canonicalDecimal\(waist, language, parseMeasure\),/);
});

test('Your numbers prefills a saved string in the app language too', () => {
  for (const k of ['weight', 'bodyFat', 'height', 'waist']) {
    const setter = 'set' + k[0].toUpperCase() + k.slice(1);
    assert.match(CALC, new RegExp(`if \\(saved\\.${k} != null\\) ${setter}\\(savedFieldText\\(saved\\.${k}, language\\)\\);`), k);
  }
  assert.match(CALC, /saved\.weight != null \? savedFieldText\(saved\.weight, language\) : ''/);
});
