'use strict';
// Review 2026-10-02 (MEDIUM, decided by the coordinator): number parsing follows the app
// language, and the "1,250 -> 1,2500" prefill trick is gone (users saw "1,1250" and deleting
// the extra zero stored a value 1000x too big).
//   English: unchanged — "5,000" is thousands, "." is the decimal.
//   pt/es/fr/de/it: a comma is the decimal ("1,125" = 1.125, "5,000" = 5); a dot followed by
//   exact 3-digit groups with a non-zero leading group is thousands ("1.250" = 1250,
//   "12.500" = 12500); any other dot is a decimal typed out of habit ("0.5", "1.25",
//   "0.250" = 0.25); spaces / no-break spaces between 3-digit groups are thousands ("2 480").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseDecimal } = require('../lib/doseMath');
const { inputNumber, formatNumber } = require('../lib/localeFormat');

const COMMA = ['es', 'pt', 'fr', 'de', 'it'];
const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

test('English (and no language): unchanged', () => {
  for (const l of [undefined, 'en']) {
    assert.equal(parseDecimal('5,000', l), 5000);
    assert.equal(parseDecimal('10,000', l), 10000);
    assert.equal(parseDecimal('0,5', l), 0.5);
    assert.equal(parseDecimal('2,5', l), 2.5);
    assert.equal(parseDecimal('0.5', l), 0.5);
    assert.equal(parseDecimal('1.250', l), 1.25);
    assert.equal(parseDecimal('1,234.5', l), 1234.5);
    assert.equal(parseDecimal('1.234,5', l), 1234.5);
    assert.equal(parseDecimal(12.5, l), 12.5);
    assert.ok(Number.isNaN(parseDecimal('', l)));
  }
});

test('comma languages: a comma is the decimal', () => {
  for (const l of COMMA) {
    assert.equal(parseDecimal('1,125', l), 1.125, l);
    assert.equal(parseDecimal('1,025', l), 1.025, l);
    assert.equal(parseDecimal('5,000', l), 5, l);
    assert.equal(parseDecimal('0,5', l), 0.5, l);
    assert.equal(parseDecimal('86,5', l), 86.5, l);
    assert.equal(parseDecimal('-1,5', l), -1.5, l);
    assert.equal(parseDecimal('1250,75', l), 1250.75, l);
  }
});

test('comma languages: a dot with exact 3-digit groups is thousands, any other dot is a decimal', () => {
  for (const l of COMMA) {
    assert.equal(parseDecimal('1.250', l), 1250, l);
    assert.equal(parseDecimal('5.000', l), 5000, l);
    assert.equal(parseDecimal('12.500', l), 12500, l);
    assert.equal(parseDecimal('1.250.000', l), 1250000, l);
    assert.equal(parseDecimal('-1.250', l), -1250, l);
    assert.equal(parseDecimal('0.5', l), 0.5, l);
    assert.equal(parseDecimal('1.25', l), 1.25, l);
    assert.equal(parseDecimal('0.250', l), 0.25, l);
    assert.equal(parseDecimal('86.5', l), 86.5, l);
    assert.equal(parseDecimal('1.2345', l), 1.2345, l);
    assert.equal(parseDecimal('1.250,5', l), 1250.5, l);
  }
});

test('comma languages: spaces and no-break spaces between 3-digit groups are thousands', () => {
  for (const l of COMMA) {
    assert.equal(parseDecimal('2 480', l), 2480, l);
    assert.equal(parseDecimal('2 480', l), 2480, l);
    assert.equal(parseDecimal('2 480', l), 2480, l);
    assert.equal(parseDecimal('12 500,5', l), 12500.5, l);
  }
});

test('display -> prefilled field -> parse round-trips in every language', () => {
  const values = [0.05, 0.1 + 0.2, 1.025, 1.125, 2.5, 86.5, 1250, 2480, 5000, 12500, -1.5, -1250, 0.25, 1234.5];
  for (const l of ['en', ...COMMA]) {
    for (const v of values) {
      const shown = inputNumber(v, l);
      assert.equal(parseDecimal(shown, l), v, `${l} ${v} -> "${shown}"`);
    }
  }
});

test('the prefill shows the plain localized decimal: no "1,1250" trick, no grouping', () => {
  assert.equal(inputNumber(1.125, 'pt'), '1,125');
  assert.equal(inputNumber(1.025, 'de'), '1,025');
  assert.equal(inputNumber(1.25, 'pt', 3), '1,250');
  assert.equal(inputNumber(86.5, 'fr'), '86,5');
  assert.equal(inputNumber(12500, 'it'), '12500');
  assert.equal(inputNumber(1.125, 'en'), '1.125');
  // a grouped display string is never what a field is prefilled with
  assert.equal(formatNumber(12500, 'pt'), '12.500');
  assert.equal(parseDecimal(formatNumber(12500, 'pt'), 'pt'), 12500);
});

test('every user-typed numeric field is parsed with the app language', () => {
  const protocols = read('screens', 'ProtocolsScreen.js');
  assert.match(protocols, /protocolPayload\(currentForm\(\), frequencyLabel, language\)/, 'protocol save');
  assert.match(protocols, /editPatch\(editStartRef\.current, currentForm\(\), frequencyLabel, language\)/, 'protocol edit save');
  assert.match(protocols, /const wizardDraw = computeDraw\(\{[^}]*\blanguage,/, 'wizard live draw');
  const calc = read('screens', 'components', 'CalculatorSection.js');
  // (second review: body and lab numbers use parseMeasure — same rule in pt/es/fr/de/it, comma = decimal in English)
  assert.match(calc, /parseMeasure\(v, language\)/, 'Your numbers, weigh-in, target, reality check fields');
  assert.match(calc, /readWeighInForm\(\{[^}]*language[^}]*\}\)/);
  const body = read('screens', 'BodyScreen.js');
  assert.match(body, /parseMeasure\(mValue, language\)/, 'lab value edit');
  assert.match(body, /value: parseMeasure\(m\.value, language\)/, 'lab scan review values the user may have edited');
  const form = read('lib', 'protocolForm.js');
  assert.match(form, /function protocolPayload\(f, frequencyLabel, language\)/);
  const weigh = read('lib', 'weighInEdit.js');
  assert.match(weigh, /parseMeasure\(s, language\)/);
});

test('CLAUDE.md states the language rule in the Numbers gotcha', () => {
  const md = read('CLAUDE.md');
  assert.match(md, /\*\*Numbers\*\*:[^\n]*pt\/es\/fr\/de\/it[^\n]*comma is the decimal/);
});
