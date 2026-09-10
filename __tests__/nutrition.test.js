'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { dayTotals, rollingAvgKcal, pickNudge } = require('../lib/nutrition');

test('dayTotals: sums Cal/Carbs/Protein and rounds; ignores junk', () => {
  const t = dayTotals([
    { kcal: 480, protein_g: 26, carb_g: 55 },
    { kcal: 640.4, protein_g: 59, carb_g: 72 },
    { kcal: null, protein_g: 'x', carb_g: undefined },
  ]);
  assert.deepEqual(t, { kcal: 1120, protein_g: 85, carb_g: 127 });
});

test('dayTotals: empty -> zeros', () => {
  assert.deepEqual(dayTotals([]), { kcal: 0, protein_g: 0, carb_g: 0 });
  assert.deepEqual(dayTotals(null), { kcal: 0, protein_g: 0, carb_g: 0 });
});

test('rollingAvgKcal: averages over LOGGED days only, inside the window', () => {
  const entries = [
    { entry_date: '2026-09-10', kcal: 2000 },
    { entry_date: '2026-09-10', kcal: 200 },  // same day sums to 2200
    { entry_date: '2026-09-08', kcal: 1800 },
    { entry_date: '2026-09-01', kcal: 9999 }, // outside a 7-day window ending 09-10
  ];
  const r = rollingAvgKcal(entries, '2026-09-10', 7);
  // window 09-04..09-10: logged days = 09-10 (2200) and 09-08 (1800) → avg 2000
  assert.equal(r.loggedDays, 2);
  assert.equal(r.avgKcal, 2000);
});

test('rollingAvgKcal: an unlogged day is NOT counted as zero', () => {
  // Only one logged day in the window → the average is that day, not diluted by 6 zeros.
  const r = rollingAvgKcal([{ entry_date: '2026-09-10', kcal: 1800 }], '2026-09-10', 7);
  assert.equal(r.avgKcal, 1800);
  assert.equal(r.loggedDays, 1);
});

test('rollingAvgKcal: no logged days in window -> null', () => {
  assert.equal(rollingAvgKcal([{ entry_date: '2026-08-01', kcal: 2000 }], '2026-09-10', 7), null);
  assert.equal(rollingAvgKcal([], '2026-09-10', 7), null);
});

test('pickNudge: one gap at a time in order, stops when all shown', () => {
  const noon = new Date('2026-09-10T12:00:00');
  assert.deepEqual(pickNudge([], noon), { id: 'lunch', tense: 'forward' }); // pre-2pm → lunch ahead
  assert.deepEqual(pickNudge(['lunch'], noon), { id: 'dinner', tense: 'forward' });
  assert.deepEqual(pickNudge(['lunch', 'dinner'], noon), { id: 'snacks', tense: 'neutral' });
  assert.deepEqual(pickNudge(['lunch', 'dinner', 'snacks'], noon), { id: 'drinks', tense: 'neutral' });
  assert.equal(pickNudge(['lunch', 'dinner', 'snacks', 'drinks'], noon), null);
});

test('pickNudge: time-aware tense — at 8pm lunch and dinner are past tense', () => {
  const evening = new Date('2026-09-10T20:00:00');
  assert.deepEqual(pickNudge([], evening), { id: 'lunch', tense: 'past' });
  assert.deepEqual(pickNudge(['lunch'], evening), { id: 'dinner', tense: 'past' });
});

test('pickNudge: mid-afternoon — lunch is past, dinner still ahead', () => {
  const afternoon = new Date('2026-09-10T15:00:00');
  assert.deepEqual(pickNudge([], afternoon), { id: 'lunch', tense: 'past' });
  assert.deepEqual(pickNudge(['lunch'], afternoon), { id: 'dinner', tense: 'forward' });
});
