// DV-200 (parked-error sweep 2026-10-31): a ready-to-use box is good through its expiry day, but the
// Protocols card used Math.ceil on a negative fraction (−0 ≤ 0) and tagged it "Fora do prazo" for the whole
// last day. Today was fixed on its own (F2, 2026-10-27). One owner now: vialExpiry.boxDaysLeft.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boxDaysLeft } = require('../lib/vialExpiry');

test('DV-200: the expiry day still counts as a good day (1), the next day is past (0)', () => {
  assert.equal(boxDaysLeft('2026-10-31', new Date(2026, 9, 31, 9)), 1);
  assert.equal(boxDaysLeft('2026-10-31', new Date(2026, 9, 31, 23, 59)), 1);
  assert.equal(boxDaysLeft('2026-10-31', new Date(2026, 10, 1, 0, 1)), 0);
  assert.equal(boxDaysLeft('2026-11-10', new Date(2026, 9, 31, 9)), 11);
  assert.equal(boxDaysLeft(null, new Date()), null);
});

test('DV-200: Protocols and Today both read it', () => {
  const ps = fs.readFileSync(path.join(__dirname, '..', 'screens/ProtocolsScreen.js'), 'utf8');
  assert.match(ps, /return boxDaysLeft\(vial\.expires_on, new Date\(\)\);/);
  const td = fs.readFileSync(path.join(__dirname, '..', 'screens/TodayScreen.js'), 'utf8');
  assert.match(td, /daysLeft = boxDaysLeft\(v\.expires_on, new Date\(nowMs\)\);/);
});
