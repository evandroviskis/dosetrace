// Parked-error sweep 2026-10-31 (DIVERGENCES DV-017 / DV-020, both "No (bug)").
// DV-017: the provider report said doses left = total_doses − doses_taken (0 or negative for an older vial
//   without a stored total); it now uses the app's one owner, supplyState.
// DV-020: an oral bottle's days of supply ignored the interval (every other day: 30 capsules said 30 days).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { supplyDaysLeft } = require('../lib/oralMath');

test('DV-020: days of supply count the interval', () => {
  assert.equal(supplyDaysLeft(30, 1, 1, 2), 60);
  assert.equal(supplyDaysLeft(30, 1, 1), 30, 'daily, as before');
  assert.equal(supplyDaysLeft(30, 2, 2, 1), 7);
  const ps = fs.readFileSync(path.join(__dirname, '..', 'screens/ProtocolsScreen.js'), 'utf8');
  assert.match(ps, /supplyDaysLeft\(unitsLeft, r\.unitsNeeded, p\.doses_per_day \|\| 1, p\.interval_days \|\| 1\)/);
});

test('DV-017: the report\'s doses left come from supplyState', () => {
  const { supplyState } = require('../lib/supplyLow');
  const p = { amount: 10, unit: 'mg', dose: 1, dose_unit: 'mg', interval_days: 1, doses_per_day: 1 };
  assert.equal(supplyState({ doses_taken: 3, total_doses: null }, p).remaining, 7);
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/SettingsScreen.js'), 'utf8');
  assert.match(src, /vialRemaining: vial \? supplyState\(vial, p\)\.remaining : null,/);
});
