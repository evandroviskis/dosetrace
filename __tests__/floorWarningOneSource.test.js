'use strict';
// S25 2026-11-07 (pt): Seu plano diário read "A meta para emagrecer foi elevada para 1740 kcal…" while
// the Perder card showed 2.130 kcal. With a reality check saved, the cards come from the MEASURED
// maintenance (goalsForTdee(measured, { bmr, sex })), but the plan still printed the formula path's
// floor warning (energyPlan: formula TDEE × 0.825 floored at the formula BMR = 1740) — a number from
// another computation, and without the thousands separator. When the measured lose target was floored
// too, two floor warnings showed. Fix (lib/energyCalc planWarnings): the floor warning comes from the
// SAME goals the cards show, once; the number is printed like the card (round10 + formatInt).
// The floor math itself is unchanged (BMR and 1500 / 1200 kcal, also on the measured path).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { energyPlan, goalsForTdee, planWarnings } = require('../lib/energyCalc');
const { formatInt } = require('../lib/localeFormat');

// Sedentary: formula lose (0.825 × 1.2 × BMR) is below the BMR, so the formula path is floored.
const inp = { weightKg: 82, heightCm: 180, age: 40, sex: 'male', bodyFatPct: null, activity: 1.2, goal: 'lose' };

test('floor warning: a measured maintenance above the floor shows no formula floor warning', () => {
  const plan = energyPlan(inp);
  assert.ok(plan.ok);
  assert.ok(plan.warnings.some((w) => w.code === 'bmr_floor'), 'the formula path is floored');
  const measured = goalsForTdee(2580, { bmr: plan.bmr, sex: 'male' });
  assert.equal(measured.lose.floorApplied, false);
  const ws = planWarnings(plan.warnings, measured);
  assert.ok(!ws.some((w) => w.code === 'bmr_floor' || w.code === 'calorie_floor'), 'no floor warning for an unfloored card');
});

test('floor warning: its number is the card number (formula path and measured path)', () => {
  const plan = energyPlan(inp);
  const formula = planWarnings(plan.warnings, plan.allGoals).filter((w) => /floor/.test(w.code));
  assert.equal(formula.length, 1);
  assert.equal(formula[0].values.kcal, plan.allGoals.lose.mid);
  // Measured maintenance low enough that the measured lose target is floored too: one warning, its number.
  const measured = goalsForTdee(1700, { bmr: plan.bmr, sex: 'male' });
  assert.equal(measured.lose.floorApplied, true);
  const ws = planWarnings(plan.warnings, measured).filter((w) => /floor/.test(w.code));
  assert.equal(ws.length, 1, 'never two floor warnings');
  assert.equal(ws[0].values.kcal, measured.lose.mid);
  assert.equal(ws[0].code, measured.lose.floorSource === 'absolute' ? 'calorie_floor' : 'bmr_floor');
  // The other engine warnings stay, in order.
  const extra = [{ code: 'protein_adjusted' }, { code: 'bmr_floor', values: { kcal: 1740 } }, { code: 'protein_cap', values: { g: 200 } }];
  assert.deepEqual(planWarnings(extra, goalsForTdee(2580, { bmr: 1740, sex: 'male' })).map((w) => w.code), ['protein_adjusted', 'protein_cap']);
  assert.deepEqual(planWarnings(plan.warnings, null), plan.warnings.filter((w) => !/floor/.test(w.code)));
});

test('floor warning: the screen prints it from the shown goals, with the thousands separator', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/components/CalculatorSection.js'), 'utf8');
  assert.match(src, /planWarnings\(plan\.warnings, effectiveGoals \|\| plan\.allGoals\)/);
  assert.doesNotMatch(src, /\{plan\.warnings\.map\(/, 'the raw engine list is not printed');
  assert.doesNotMatch(src, /scoreCheck && effectiveGoals\?\.lose\?\.floorApplied/, 'no second, separate floor warning');
  assert.match(src, /replace\('\{kcal\}', fmtInt\(round10\(w\.values\?\.kcal \?\? 0\)\)\)/);
  assert.equal(formatInt(1740, 'pt'), '1.740');
});
