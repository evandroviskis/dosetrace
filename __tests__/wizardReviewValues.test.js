'use strict';
// Second review 2026-10-02 (item 3): the protocol wizard's review step showed the raw typed
// amount and dose. It now shows the value as the app READS it, so a Portuguese user who typed
// "2.500 mg" (thousands) sees "2500 mg" before saving, and "0.5" reads "0,5".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseDecimal } = require('../lib/doseMath');
const { decimalText } = require('../lib/localeFormat');

const SCREEN = fs.readFileSync(path.join(__dirname, '..', 'screens', 'ProtocolsScreen.js'), 'utf8');
const shown = (text, l) => decimalText(parseDecimal(text, l), l);

test('the review shows what the app will save', () => {
  assert.equal(shown('2.500', 'pt'), '2500');
  assert.equal(shown('0.5', 'pt'), '0,5');
  assert.equal(shown('1,25', 'de'), '1,25');
  assert.equal(shown('5,000', 'en'), '5000');
  assert.equal(shown('250', 'en'), '250');
});

test('the wizard review rows for amount and dose use the read value', () => {
  assert.match(SCREEN, /\{ label: t\('protocols_amount_label'\), value: amount \? `\$\{decimalText\(parseDecimal\(amount, language\), language\)\} \$\{unit\}` : '—' \}/);
  assert.match(SCREEN, /\{ label: t\('protocols_dose_label'\), value: dose \? `\$\{decimalText\(parseDecimal\(dose, language\), language\)\} \$\{doseUnit\}` : '—' \}/);
});
