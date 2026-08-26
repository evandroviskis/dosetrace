'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  lbmFromBodyFat, bmrKatch, bmrCunningham, bmrMifflin, computeBMR,
  tdee, goalCalories, proteinTarget, realityCheckTDEE, weeklyRateKg, lbToKg, inToCm,
  CALORIE_FLOOR, bmiValue, classifyBmi, healthyWeightRange, adjustedBodyWeight,
  macroTargets, validateEnergyInput, energyPlan,
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

test('computeBMR always uses Katch (Cunningham 1991) for composition — 1980 variant retired', () => {
  const r = computeBMR({ weightKg: 80, bodyFatPct: 20, resistanceTrained: true });
  assert.equal(r.method, 'katch');
  approx(r.bmr, bmrKatch(64));
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

test('weeklyRateKg: positive weight change = loss per week', () => {
  // Lost 2 kg over 28 days ⇒ 0.5 kg/week.
  approx(weeklyRateKg({ weightChangeKg: 2, days: 28 }), 0.5, 0.001);
  // Gained 1 kg over 14 days ⇒ −0.5 kg/week.
  approx(weeklyRateKg({ weightChangeKg: -1, days: 14 }), -0.5, 0.001);
  assert.equal(weeklyRateKg({ weightChangeKg: 2, days: 0 }), null);
});

test('unit conversions round-trip sanely', () => {
  approx(lbToKg(220), 99.79, 0.1);
  approx(inToCm(70), 177.8, 0.1);
});

// ── Safety guards (audit findings — docs/research/bmr-calculator) ────

test('energyPlan: small sedentary woman is floored at 1200, with warning', () => {
  // Raw lose target would be ~947 kcal — the exact case from the audit.
  const p = energyPlan({ weightKg: 40, heightCm: 130, age: 19, sex: 'female', activity: 1.2, goal: 'lose' });
  assert.ok(p.ok);
  assert.ok(p.allGoals.lose.mid >= CALORIE_FLOOR.female, `lose ${p.allGoals.lose.mid} >= 1200`);
  assert.ok(p.warnings.some(w => w.code === 'calorie_floor' || w.code === 'bmr_floor'));
});

test('energyPlan: lose target never sits below own BMR', () => {
  const p = energyPlan({ weightKg: 100, heightCm: 170, age: 35, sex: 'female', activity: 1.2, goal: 'lose' });
  assert.ok(p.allGoals.lose.low >= p.bmr - 0.5, `low ${p.allGoals.lose.low} >= BMR ${p.bmr}`);
});

test('energyPlan: protein for 180 kg uses adjusted weight and stays sane', () => {
  const p = energyPlan({ weightKg: 180, heightCm: 175, age: 40, sex: 'male', activity: 1.2, goal: 'lose' });
  assert.equal(p.protein.basis, 'adjusted');
  assert.ok(p.protein.rec < 250, `protein ${p.protein.rec} should be far below the old 342 g`);
  assert.ok(p.warnings.some(w => w.code === 'protein_adjusted'));
});

test('energyPlan: rejects out-of-range input instead of computing garbage', () => {
  const p = energyPlan({ weightKg: 75, heightCm: 175, age: 500, sex: 'male', activity: 1.55, goal: 'maintain' });
  assert.equal(p.ok, false);
  assert.ok(p.warnings.some(w => w.code === 'input_out_of_range' && w.values.includes('age')));
});

test('energyPlan: macros close with the calorie target', () => {
  const p = energyPlan({ weightKg: 82, heightCm: 178, age: 35, sex: 'male', activity: 1.55, goal: 'maintain' });
  const kcal = p.protein.rec * 4 + p.macros.carbsG * 4 + p.macros.fatG * 9;
  approx(kcal, p.target.mid, 15);
});

test('energyPlan: protein rec scales by goal (deficit highest)', () => {
  const base = { weightKg: 80, heightCm: 180, age: 30, sex: 'male', activity: 1.55 };
  const lose = energyPlan({ ...base, goal: 'lose' }).protein.rec;
  const maintain = energyPlan({ ...base, goal: 'maintain' }).protein.rec;
  const gain = energyPlan({ ...base, goal: 'gain' }).protein.rec;
  assert.ok(lose > gain && gain > maintain, `${lose} > ${gain} > ${maintain}`);
});

test('BMI, classification, healthy range, adjusted weight', () => {
  approx(bmiValue(80, 180), 24.69, 0.01);
  assert.equal(classifyBmi(17), 'underweight');
  assert.equal(classifyBmi(28.7), 'overweight');
  assert.equal(classifyBmi(41), 'obese_3');
  const r = healthyWeightRange(175);
  approx(r.min, 56.7, 0.2); approx(r.max, 76.3, 0.2);
  approx(adjustedBodyWeight(60, 175), 60, 0.01);   // below ideal: unchanged
  const adj = adjustedBodyWeight(180, 175);
  assert.ok(adj > 67 && adj < 100, `adjusted ${adj}`);
});

test('validateEnergyInput flags each bad field, ignores missing ones', () => {
  assert.deepEqual(validateEnergyInput({ age: 500 }), ['age']);
  assert.deepEqual(validateEnergyInput({ weightKg: 80 }), []);
  assert.deepEqual(validateEnergyInput({ heightCm: 10, bodyFatPct: 95 }), ['heightCm', 'bodyFatPct']);
});

test('macroTargets: fat respects the 0.6 g/kg physiological floor', () => {
  const m = macroTargets({ targetCalories: 1200, weightKg: 55, proteinG: 100 });
  assert.ok(m.fatG >= 0.6 * 55 - 0.01, `fat ${m.fatG}`);
});
