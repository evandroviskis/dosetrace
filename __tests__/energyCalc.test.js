'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  lbmFromBodyFat, bmrKatch, bmrCunningham, bmrMifflin, computeBMR,
  tdee, goalCalories, proteinTarget, realityCheckTDEE, lbToKg, inToCm,
} = require('../lib/energyCalc');

const approx = (a, b, eps = 0.5) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('lbmFromBodyFat: weight minus fat mass', () => {
  approx(lbmFromBodyFat(80, 20), 64);      // 80 × 0.80
  assert.equal(lbmFromBodyFat(0, 20), null);
  assert.equal(lbmFromBodyFat(80, 100), null);
});

test('Katch-McArdle and Cunningham use LBM only', () => {
  approx(bmrKatch(64), 370 + 21.6 * 64);   // 1752.4
  approx(bmrCunningham(64), 500 + 22 * 64); // 1908
});

test('Mifflin-St Jeor: sex offset differs by ±', () => {
  const male = bmrMifflin({ weightKg: 80, heightCm: 180, age: 30, sex: 'male' });
  const female = bmrMifflin({ weightKg: 80, heightCm: 180, age: 30, sex: 'female' });
  approx(male, 10 * 80 + 6.25 * 180 - 5 * 30 + 5);   // 1780
  approx(female, male - 5 - 161);                     // female = base − 161
});

test('computeBMR prefers composition (Katch) when BF% given', () => {
  const r = computeBMR({ weightKg: 80, bodyFatPct: 20 });
  assert.equal(r.method, 'katch');
  approx(r.lbm, 64);
  approx(r.bmr, bmrKatch(64));
});

test('computeBMR uses Cunningham when resistance-trained', () => {
  const r = computeBMR({ weightKg: 80, bodyFatPct: 20, resistanceTrained: true });
  assert.equal(r.method, 'cunningham');
});

test('computeBMR falls back to Mifflin when no composition', () => {
  const r = computeBMR({ weightKg: 80, heightCm: 180, age: 30, sex: 'male' });
  assert.equal(r.method, 'mifflin');
  assert.equal(r.lbm, null);
});

test('computeBMR returns null when nothing is computable', () => {
  assert.equal(computeBMR({ weightKg: 80 }).bmr, null);
});

test('goalCalories are percentages of TDEE, asymmetric', () => {
  const t = 2500;
  const lose = goalCalories(t, 'lose');
  approx(lose.low, t * 0.80); approx(lose.high, t * 0.85);
  const gain = goalCalories(t, 'gain');
  approx(gain.low, t * 1.10); approx(gain.high, t * 1.15);
  const maint = goalCalories(t, 'maintain');
  approx(maint.mid, t);
  // deficit % (17.5) is larger than surplus % (12.5) — not symmetric
  assert.ok((t - lose.mid) > (gain.mid - t));
});

test('proteinTarget uses LBM basis when known, else bodyweight', () => {
  const byLbm = proteinTarget({ weightKg: 80, lbmKg: 64 });
  assert.equal(byLbm.basis, 'lbm');
  approx(byLbm.rec, 2.2 * 64);
  const byWeight = proteinTarget({ weightKg: 80 });
  assert.equal(byWeight.basis, 'weight');
  approx(byWeight.low, 1.6 * 80);
});

test('realityCheckTDEE: usable estimate (maintenance sits above intake in a deficit)', () => {
  // Ate 2000/day, LOST 1 kg over 28 days (change = +1) → 2000 + 7700/28 ≈ 2275
  const r = realityCheckTDEE({ avgDailyCalories: 2000, weightChangeKg: 1, days: 28 });
  assert.equal(r.status, 'ok');
  approx(r.tdee, 2000 + 7700 / 28, 1);
  assert.ok(r.tdee > 2000, 'maintenance must be above intake when losing weight');
});

test('realityCheckTDEE: gaining weight puts maintenance below intake', () => {
  // Ate 3000/day, GAINED 1 kg over 28 days (change = −1) → 3000 − 7700/28 ≈ 2725
  const r = realityCheckTDEE({ avgDailyCalories: 3000, weightChangeKg: -1, days: 28 });
  assert.equal(r.status, 'ok');
  approx(r.tdee, 3000 - 7700 / 28, 1);
  assert.ok(r.tdee < 3000);
});

test('realityCheckTDEE guards: short window, maintenance, implausible', () => {
  assert.equal(realityCheckTDEE({ avgDailyCalories: 2000, weightChangeKg: 1, days: 10 }).status, 'too_short');
  assert.equal(realityCheckTDEE({ avgDailyCalories: 2000, weightChangeKg: 0.1, days: 28 }).status, 'maintenance');
  // Big reported loss with very low intake → implausibly low TDEE (under-reporting)
  const imp = realityCheckTDEE({ avgDailyCalories: 300, weightChangeKg: 0.3, days: 28 });
  assert.equal(imp.status, 'implausible');
});

test('unit conversions round-trip sanely', () => {
  approx(lbToKg(220), 99.79, 0.1);
  approx(inToCm(70), 177.8, 0.1);
});
