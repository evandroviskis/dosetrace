'use strict';
// S-05 / FX-11: ONE supply-low rule for the Today alert, the push and the Protocols
// badge. The push used to say "low" at 2 doses and only for vials with a stored count;
// Today and Protocols said 3 and derived the count for older vials. Now all three use
// lib/supplyLow.js: capacity = stored count, else vial size ÷ dose; low = 1..3 left.
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

test('S-05: low = 1, 2 or 3 doses left; 0 (finished) and 4+ are not low — same answer everywhere', () => {
  const { supplyState, SUPPLY_LOW_DOSES } = sl();
  assert.equal(SUPPLY_LOW_DOSES, 3);
  assert.deepEqual(supplyState({ total_doses: null, doses_taken: 7 }, protocol), { capacity: 10, remaining: 3, low: true });
  assert.deepEqual(supplyState({ total_doses: 10, doses_taken: 6 }, protocol), { capacity: 10, remaining: 4, low: false });
  assert.deepEqual(supplyState({ total_doses: 10, doses_taken: 10 }, protocol), { capacity: 10, remaining: 0, low: false });
  assert.deepEqual(supplyState({ total_doses: 10, doses_taken: 9 }, protocol), { capacity: 10, remaining: 1, low: true });
  assert.deepEqual(supplyState(null, protocol), { capacity: null, remaining: null, low: false });
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
