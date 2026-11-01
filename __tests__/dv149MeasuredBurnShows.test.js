// DV-149 (AD-93, founder 2026-10-15: "the measured burn shows whenever it exists"; parked-error sweep
// 2026-10-31): a measured daily burn (a finished reality check) was hidden in the Progress hero and the
// Journey tile when a formula input (height, age, sex) was missing, while the result view printed it.
// Only the FORMULA estimate keeps the PO-12 inputs gate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { progressTile } = require('../lib/progressTile');

const now = new Date(2026, 9, 31, 12);
const saved = { unit: 'metric', weight: '80', height: '', bodyFat: '' }; // height cleared
const meta = { sex: 'male', birth_year: 1985 };
const snapshots = [{ entry_date: '2026-10-20', weight_kg: 80 }];

test('DV-149: measured result + height cleared → the tile shows the measured burn', () => {
  const tile = progressTile({ saved, meta, snapshots, checks: [{ entry_date: '2026-10-25', tdee: 2512 }], now });
  assert.ok(tile, 'the tile is not empty');
  assert.equal(tile.tdee, 2510);
  assert.equal(tile.measured, true);
  assert.equal(tile.weight, '80.0');
});

test('DV-149: no measured result + height cleared → no estimate (PO-12 gate)', () => {
  assert.equal(progressTile({ saved, meta, snapshots, checks: [], now }), null);
});

test('DV-149: the Progress hero shows the measured burn without the formula inputs', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/components/CalculatorSection.js'), 'utf8');
  assert.match(src, /\{plan \|\| scoreCheck \? \(/);
  assert.match(src, /\{fmtInt\(round10\(scoreCheck \? scoreCheck\.tdee : plan\.tdeeVal\)\)\}/);
  assert.match(src, /: scoreCheck \? \(\s*<Text style=\{\[s\.foot2, s\.tnum\]\}>\{t\('cal_measured_from_check'\)\}<\/Text>/);
});
