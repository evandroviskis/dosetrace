'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { dayTotals, rollingAvgKcal, pickNudge, groupByDay } = require('../lib/nutrition');

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

test('groupByDay: groups entries per day, newest first, with per-day totals', () => {
  const g = groupByDay([
    { entry_date: '2026-09-10', kcal: 400, carb_g: 10, protein_g: 20 },
    { entry_date: '2026-09-10', kcal: 600, carb_g: 30, protein_g: 40 },
    { entry_date: '2026-09-09', kcal: 500, carb_g: 15, protein_g: 25 },
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].date, '2026-09-10');           // newest first
  assert.equal(g[0].entries.length, 2);
  assert.deepEqual(g[0].totals, { kcal: 1000, carb_g: 40, protein_g: 60 });
  assert.equal(g[1].date, '2026-09-09');
  assert.equal(g[1].totals.kcal, 500);
});

test('groupByDay: empty -> []', () => {
  assert.deepEqual(groupByDay([]), []);
  assert.deepEqual(groupByDay(null), []);
});

// ── Reality-check window intake (founder 2026-09-24: not day by day) ──
const { checkIntake, entryDateFor } = require('../lib/nutrition');

test('checkIntake: completed days of the check ÷ elapsed days (same window as the TDEE)', () => {
  const e = [
    { entry_date: '2026-09-01', kcal: 2000 },
    { entry_date: '2026-09-03', kcal: 3000 },
    { entry_date: '2026-09-05', kcal: 2000 },
    { entry_date: '2026-09-06', kcal: 900 }, // today — not in the completed window
  ];
  assert.deepEqual(checkIntake(e, '2026-09-01', '2026-09-06', 5), { totalKcal: 7000, days: 5, avgKcal: 1400, entries: 3 });
  // the logger's running view includes today, over 6 calendar days
  assert.deepEqual(checkIntake(e, '2026-09-01', '2026-09-06', 6, 1, true), { totalKcal: 7900, days: 6, avgKcal: 1317, entries: 4 });
});

test('checkIntake: food before the check started is not counted', () => {
  const e = [{ entry_date: '2026-08-30', kcal: 5000 }, { entry_date: '2026-09-02', kcal: 1000 }];
  assert.equal(checkIntake(e, '2026-09-01', '2026-09-06', 5).totalKcal, 1000);
});

test('checkIntake: three days logged in one go land in the same total (no per-day inflation)', () => {
  const oneGo = [{ entry_date: '2026-09-05', kcal: 6000 }];
  assert.equal(checkIntake(oneGo, '2026-09-01', '2026-09-06', 5).avgKcal, 1200);
});

test('checkIntake: nothing until the check has run minDays and something is logged', () => {
  assert.equal(checkIntake([{ entry_date: '2026-09-02', kcal: 900 }], '2026-09-01', '2026-09-04', 3), null);
  assert.equal(checkIntake([], '2026-09-01', '2026-09-10', 9), null);
  assert.equal(checkIntake([{ entry_date: '2026-09-02', kcal: 900 }], null, '2026-09-10', 9), null);
});

test('entryDateFor: "3 days ago" moves the entry back; nothing said keeps the typed day', () => {
  assert.equal(entryDateFor('2026-09-06', 3), '2026-09-03');
  assert.equal(entryDateFor('2026-09-06', 0), '2026-09-06');
  assert.equal(entryDateFor('2026-09-06', null), '2026-09-06');
  assert.equal(entryDateFor('2026-03-01', 1), '2026-02-28');
  assert.equal(entryDateFor('2026-09-06', -2), '2026-09-06', 'never into the future');
  assert.equal(entryDateFor('2026-09-06', 9999), '2025-09-06', 'clamped to a year');
});
