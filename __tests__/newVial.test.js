'use strict';
// S-01 (docs/review/features.md; app-map L-13; journey review F4): starting a new
// vial must never change the protocol's start_date — the serum curve, adherence,
// streaks and reminders all count from it, so rewriting it erases history.
const test = require('node:test');
const assert = require('node:assert/strict');
const { newVialRecords } = require('../lib/newVial');

const protocol = {
  id: 7, remote_id: 'r-7', name: 'BPC-157', type: 'recon',
  amount: '5', unit: 'mg', dose: '250', dose_unit: 'mcg', water: '2',
  start_date: '2026-06-01', interval_days: 1,
};

test('newVialRecords: a new vial never changes the protocol start_date (history kept)', () => {
  const { protocolUpdate } = newVialRecords(protocol, '2026-09-20', 'u1');
  assert.ok(!protocolUpdate || !('start_date' in protocolUpdate), 'start_date must not be written');
});

test('newVialRecords: the vial row carries the mix date, capacity and links to the protocol', () => {
  const { vial } = newVialRecords(protocol, '2026-09-20', 'u1');
  assert.equal(vial.mixed_on, '2026-09-20');
  assert.equal(vial.protocol_id, 7);
  assert.equal(vial.protocol_remote_id, 'r-7');
  assert.equal(vial.user_id, 'u1');
  assert.equal(vial.total_doses, 20); // 5 mg ÷ 250 mcg
  assert.equal(vial.doses_taken, 0);
});

// S-09 / FX-14: the new vial's water amount accepts comma decimals ("2,5" = 2.5).
test('S-09: newVialRecords reads the protocol water with comma decimals ("2,5" → 2.5)', () => {
  const { newVialRecords } = require('../lib/newVial');
  const base = { id: 1, amount: '5', unit: 'mg', dose: '0.25', dose_unit: 'mg', remote_id: null };
  assert.equal(newVialRecords({ ...base, water: '2,5' }, '2026-10-01', 'u1').vial.water_ml, 2.5);
  assert.equal(newVialRecords({ ...base, water: '2.5' }, '2026-10-01', 'u1').vial.water_ml, 2.5);
  assert.equal(newVialRecords({ ...base, water: '' }, '2026-10-01', 'u1').vial.water_ml, null);
});
