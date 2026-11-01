// DV-121 (parked-error sweep 2026-10-31): Today's dose card, planMarkTaken and deleteDose each re-implemented the vial
// capacity rule; they all read lib/supplyLow vialCapacity now (results unchanged).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('DV-121: one capacity owner', () => {
  for (const f of ['lib/markTaken.js', 'lib/deleteDose.js', 'screens/TodayScreen.js']) {
    assert.doesNotMatch(read(f), /\(vial\.total_doses && vial\.total_doses > 0\)\s*\?\s*vial\.total_doses/, f);
    assert.match(read(f), /vialCapacity\(vial, (protocol|p)\)/, f);
  }
});
