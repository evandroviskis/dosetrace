// DV-092 (AD-81, founder 2026-10-15: bottles get the vial's supply-low rule — Today alert, push and badge;
// the rule itself is the founder's 2026-10-27 one: 7 days of doses or less, or only the last dose;
// parked-error sweep 2026-11-01): a capsule bottle ran out with no warning anywhere. lib/supplyLow
// bottleState counts the doses left in the bottle (units left ÷ units per dose) with the same rule and the
// same words as a vial (doses left), never before the first dose.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bottleState } = require('../lib/supplyLow');

const zinc = (over) => ({ id: 5, type: 'oral', dose: '50', dose_unit: 'mg', serving_strength: '25', serving_strength_unit: 'mg', serving_units: '1', notes: 'capsule', container_units: 60, units_taken: 0, interval_days: 1, doses_per_day: 1, ...over });

test('DV-092: doses left in a bottle, low at 7 days or the last dose', () => {
  assert.deepEqual(bottleState(zinc({ units_taken: 0 })), { capacity: 30, remaining: 30, low: false }, 'never before the first dose');
  assert.equal(bottleState(zinc({ units_taken: 44 })).low, false, '8 doses = 8 days');
  assert.deepEqual(bottleState(zinc({ units_taken: 46 })), { capacity: 30, remaining: 7, low: true });
  assert.equal(bottleState(zinc({ units_taken: 58, interval_days: 14 })).low, true, 'the last dose');
  assert.equal(bottleState(zinc({ units_taken: 60 })).low, false, 'empty is not low');
  assert.equal(bottleState(zinc({ container_units: null })).low, false, 'no bottle size: nothing known');
  assert.equal(bottleState({ type: 'recon' }).low, false);
});

test('DV-092: Today alert, Protocols badge and the push read it', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(read('screens/TodayScreen.js'), /const \{ remaining: rem, low: isLow \} = p\.type === 'oral' \? bottleState\(p\) : \(v \? supplyState\(v, p\) : \{\}\);/);
  const prot = read('screens/ProtocolsScreen.js');
  assert.match(prot, /const bottle = p\.type === 'oral' \? bottleState\(p\) : null;/);
  assert.match(prot, /p\.type === 'oral' \? bottleState\(p\)\.low : \(vialsByProtocol\[p\.id\] && supplyState\(vialsByProtocol\[p\.id\], p\)\.low\)/);
  const n = read('lib/notifications.js');
  assert.match(n, /\.\.\.bottleLowStates\(protocols\)/);
});
