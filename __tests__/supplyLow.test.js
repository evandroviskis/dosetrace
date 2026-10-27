'use strict';
// S-05 / FX-11: ONE supply-low rule for the Today alert, the push and the Protocols
// badge. The push used to say "low" at 2 doses and only for vials with a stored count;
// Today and Protocols said 3 and derived the count for older vials. Now all three use
// lib/supplyLow.js: capacity = stored count, else vial size ÷ dose; low = 7 days of use or the last dose.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sl = () => require('../lib/supplyLow');
const protocol = { id: 7, amount: '5', unit: 'mg', dose: '0.5', dose_unit: 'mg' }; // 10 doses a vial

test('S-05: capacity is the stored count, else derived from vial size ÷ dose', () => {
  const { vialCapacity } = sl();
  assert.equal(vialCapacity({ total_doses: 20 }, protocol), 20);
  assert.equal(vialCapacity({ total_doses: null }, protocol), 10, 'older vial without a count');
  assert.equal(vialCapacity(null, protocol), null);
});

// Founder 2026-10-27 (option A, "Concordo com você em relação a avisar com 7 dias"): a 4-dose tirzepatide vial
// said "Frasco acabando" right after its first dose (3 left = low whatever the vial). Now low = the doses left
// last 7 days or less at the protocol's own pace (doses per day ÷ interval), or only the last dose is left.
test('vial low = 7 days of use or less, or the last dose — never by a fixed number of doses', () => {
  const { supplyState, SUPPLY_LOW_DAYS } = sl();
  assert.equal(SUPPLY_LOW_DAYS, 7);
  const weekly = { ...protocol, interval_days: 7, doses_per_day: 1 };
  assert.equal(supplyState({ total_doses: 4, doses_taken: 1 }, weekly).low, false, 'tirzepatide: 3 weeks left after the first dose');
  assert.equal(supplyState({ total_doses: 4, doses_taken: 2 }, weekly).low, false, '2 weeks left');
  assert.equal(supplyState({ total_doses: 4, doses_taken: 3 }, weekly).low, true, 'the last dose: 7 days');
  const daily = { ...protocol, interval_days: 1, doses_per_day: 1 };
  assert.equal(supplyState({ total_doses: 50, doses_taken: 42 }, daily).low, false, 'GHK-Cu: 8 days left');
  assert.equal(supplyState({ total_doses: 50, doses_taken: 43 }, daily).low, true, '7 days left');
  const twice = { ...protocol, interval_days: 1, doses_per_day: 2 };
  assert.equal(supplyState({ total_doses: 60, doses_taken: 45 }, twice).low, false, '15 doses = 7,5 days');
  assert.equal(supplyState({ total_doses: 60, doses_taken: 46 }, twice).low, true, '14 doses = 7 days');
  const biweekly = { ...protocol, interval_days: 14, doses_per_day: 1 };
  assert.equal(supplyState({ total_doses: 2, doses_taken: 0 }, biweekly).low, false);
  assert.equal(supplyState({ total_doses: 2, doses_taken: 1 }, biweekly).low, true, 'the last dose, even 14 days ahead');
  assert.deepEqual(supplyState({ total_doses: 10, doses_taken: 10 }, daily), { capacity: 10, remaining: 0, low: false }, 'finished: not low');
  assert.deepEqual(supplyState(null, daily), { capacity: null, remaining: null, low: false });
  assert.equal(supplyState({ total_doses: null, doses_taken: 3 }, protocol).low, true, 'no schedule fields: daily, 7 left');
});

test('S-05: the push, the Today alert and the Protocols badge all use supplyState', () => {
  const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const n = read('lib', 'notifications.js');
  const s = n.indexOf('export async function syncVialAlerts(');
  assert.match(n.slice(s, s + 3000), /supplyState\(/, 'push');
  assert.doesNotMatch(n.slice(s, s + 3000), /remaining <= 2/, 'no private threshold in the push');
  const today = read('screens', 'TodayScreen.js');
  const a = today.indexOf('// 3) Supply low');
  assert.match(today.slice(a, a + 1200), /supplyState\(/, 'Today alert');
  const prot = read('screens', 'ProtocolsScreen.js');
  assert.match(prot, /supplyState\(/, 'Protocols badge');
  assert.doesNotMatch(prot, /dosesRemaining <= 3/);
});

// Council 2026-10-27 (senior): a vial whose whole supply lasts 7 days or less was "low" the day it was mixed —
// the same complaint as the tirzepatide vial. A vial is low only once a dose has been taken from it.
test('a vial with no dose taken yet is never low (not on the day it is mixed)', () => {
  const { supplyState } = sl();
  const daily = { ...protocol, interval_days: 1, doses_per_day: 1 };
  assert.equal(supplyState({ total_doses: 6, doses_taken: 0 }, daily).low, false);
  assert.equal(supplyState({ total_doses: 1, doses_taken: 0 }, daily).low, false, 'a single-dose vial');
  assert.equal(supplyState({ total_doses: 6, doses_taken: 1 }, daily).low, true, '5 days left after the first dose');
});
