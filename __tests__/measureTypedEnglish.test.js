'use strict';
// Second review 2026-10-02 (LOW-MEDIUM, item 2): in English, text typed in Your numbers (and
// its weigh-in sheets) and in the lab value edit keeps the old reading, a comma is the
// decimal: "72,500" kg = 72.5, a urine specific gravity "1,025" = 1.025. Only these screens —
// protocols and doses keep the "5,000 IU" thousands rule in English.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseMeasure, parseDecimal } = require('../lib/doseMath');
const { readWeighInForm } = require('../lib/weighInEdit');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('English body and lab text: a comma is the decimal', () => {
  assert.equal(parseMeasure('72,500', 'en'), 72.5);
  assert.equal(parseMeasure('1,025', 'en'), 1.025);
  assert.equal(parseMeasure('86.5', 'en'), 86.5);
  assert.equal(parseMeasure('1,025', 'pt'), 1.025);
  assert.equal(parseMeasure('1.250', 'pt'), 1250, 'pt keeps its thousands rule');
  assert.equal(parseDecimal('5,000', 'en'), 5000, 'doses keep the 5,000 IU rule');
});

test('the weigh-in fix sheet reads English "72,500" as 72.5 kg', () => {
  assert.deepEqual(readWeighInForm({ weight: '72,500', unit: 'metric', language: 'en' }), { ok: true, weightKg: 72.5, bodyFatPct: null, waistCm: null });
});

test('Your numbers and the lab value edit read typed text with parseMeasure', () => {
  const calc = read('screens', 'components', 'CalculatorSection.js');
  assert.match(calc, /const num = v => \{ const n = parseMeasure\(v, language\); return Number\.isFinite\(n\) \? n : null; \};/);
  const body = read('screens', 'BodyScreen.js');
  assert.match(body, /const value = parseMeasure\(mValue, language\);/);
  assert.match(body, /value: parseMeasure\(m\.value, language\),/);
  assert.doesNotMatch(body, /parseDecimal\(mValue|parseDecimal\(m\.value/);
});
