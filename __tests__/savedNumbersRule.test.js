'use strict';
// Second review 2026-10-02 (MEDIUM, data rule): a value saved in Your numbers is read with
// the rule it was saved under. Before the language change every reader took a comma as
// the decimal ("72,500" = 72.5: CalculatorSection num, lib/progressCard, lib/progressTile).
// The new parser read a saved "72,500" in English as 72500, showed "72,500" and wrote
// "72500" back on open without the user touching anything. Saved values now go through
// parseMeasure (comma = decimal) and are shown with inputNumber; the Journey tile and the
// Progress card read the same number.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseMeasure, savedFieldText, canonicalDecimal } = require('../lib/doseMath');
const { progressTile } = require('../lib/progressTile');
const { numbersLine } = require('../lib/progressCard');

const CALC = fs.readFileSync(path.join(__dirname, '..', 'screens', 'components', 'CalculatorSection.js'), 'utf8');

test('a saved Your-numbers value is read with the comma-as-decimal rule it was saved under', () => {
  assert.equal(parseMeasure('72,500'), 72.5);
  assert.equal(parseMeasure('72.5'), 72.5);
  assert.equal(parseMeasure(72.5), 72.5);
  assert.equal(savedFieldText('72,500', 'en'), '72.5');
  assert.equal(savedFieldText('72,500', 'pt'), '72,5');
  assert.equal(savedFieldText('86', 'de'), '86');
  assert.equal(savedFieldText('', 'en'), '');
  assert.equal(savedFieldText('abc', 'en'), 'abc');
});

test('opening Your numbers in English never rewrites a saved "72,500": it saves 72.5', () => {
  const shown = savedFieldText('72,500', 'en');
  assert.equal(canonicalDecimal(shown, 'en', parseMeasure), '72.5');
  for (const k of ['weight', 'bodyFat', 'height', 'waist']) {
    const setter = 'set' + k[0].toUpperCase() + k.slice(1);
    assert.match(CALC, new RegExp(`if \\(saved\\.${k} != null\\) ${setter}\\(savedFieldText\\(saved\\.${k}, language\\)\\);`), k);
  }
  assert.match(CALC, /saved\.weight != null \? savedFieldText\(saved\.weight, language\) : ''/);
  assert.match(CALC, /weight: canonicalDecimal\(weight, language, parseMeasure\)/);
});

test('the Journey tile and the Progress card read the same saved number', () => {
  const saved = { unit: 'metric', weight: '72,500', height: '180', bodyFat: '20', activity: 1.375, goal: 'lose' };
  const tile = progressTile({ saved, meta: { sex: 'male', birth_year: 1985 }, snapshots: [], checks: [], now: new Date(2026, 9, 2) });
  assert.ok(tile, 'the tile has numbers');
  assert.equal(tile.weight, '72.5');
  assert.equal(numbersLine({ weight: savedFieldText(saved.weight, 'en'), wUnit: 'kg' }), '72.5 kg');
});
