// Pure energy / protein math for the Body calculator (BODY_TAB_SPEC §6–§10).
// No React Native imports so it's unit-testable under Node. Every output is an
// ESTIMATE — ±10–15% individual variation is normal; this is a general-wellness
// reality check, never a medical determination and NEVER tied to any dose.
// CommonJS so `node --test` can require it; Metro imports it fine.
//
// 2026-08 upgrade (docs/research/bmr-calculator/OPORTUNIDADES.md items 1–8):
// calorie floors, BMR floor, adjusted-weight protein for BMI ≥ 30, protein cap,
// goal-scaled protein, fat/carb targets, BMI + healthy range, input range
// validation, and a structured warnings[] channel — all inside energyPlan().
// The granular functions below keep their original behavior for callers/tests.

// ── Body composition ────────────────────────────────────────────────
// Lean body mass from weight + body-fat %. Never ask for both LBM and BF%.
function lbmFromBodyFat(weightKg, bodyFatPct) {
  if (!(weightKg > 0) || !(bodyFatPct >= 0) || bodyFatPct >= 100) return null;
  return weightKg * (1 - bodyFatPct / 100);
}

// ── BMR formulas ────────────────────────────────────────────────────
// Preferred when body composition is known (needs only LBM — no age/sex/height).
// This is Cunningham 1991, commonly cited as Katch-McArdle.
function bmrKatch(lbmKg) { return 370 + 21.6 * lbmKg; }
// Cunningham 1980 (500 + 22×LBM). No longer selected by computeBMR: it runs
// ~150 kcal above the 1991 recalibration, which the literature now prefers for
// trained users too. Kept exported for comparisons only.
function bmrCunningham(lbmKg) { return 500 + 22 * lbmKg; }
// Fallback when body fat is unknown (needs age, sex, height).
function bmrMifflin({ weightKg, heightCm, age, sex }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return base + (sex === 'male' ? 5 : -161);
}

// Choose the best BMR method from whatever inputs are present.
// Returns { bmr, method, lbm } or { bmr: null, ... } when nothing is computable.
function computeBMR(inp) {
  const { weightKg, heightCm, age, sex, bodyFatPct } = inp;
  let lbm = inp.lbmKg != null ? inp.lbmKg : null;
  if (lbm == null && bodyFatPct != null && weightKg != null) {
    lbm = lbmFromBodyFat(weightKg, bodyFatPct);
  }
  if (lbm != null && lbm > 0) {
    return { bmr: bmrKatch(lbm), method: 'katch', lbm };
  }
  if (weightKg > 0 && heightCm > 0 && age > 0 && (sex === 'male' || sex === 'female')) {
    return { bmr: bmrMifflin({ weightKg, heightCm, age, sex }), method: 'mifflin', lbm: null };
  }
  return { bmr: null, method: null, lbm: null };
}

// ── Activity + TDEE ─────────────────────────────────────────────────
// Labelled by behaviour (users chronically over-select adjectives).
const ACTIVITY_LEVELS = [
  { value: 1.2, key: 'cal_act_sedentary' },
  { value: 1.375, key: 'cal_act_light' },
  { value: 1.55, key: 'cal_act_moderate' },
  { value: 1.725, key: 'cal_act_high' },
  { value: 1.9, key: 'cal_act_very_high' },
];

function tdee(bmr, multiplier) { return bmr * multiplier; }

// ── Goal calories — a PERCENTAGE of TDEE, never a flat number ────────
// Lose: −15..20%.  Maintain: TDEE.  Gain: +10..15% (asymmetric on purpose —
// you cannot build muscle as fast as you can lose fat).
// Raw math only; floors are applied in energyPlan() so this stays pure.
function goalCalories(tdeeVal, goal) {
  if (goal === 'lose') return { low: tdeeVal * 0.80, high: tdeeVal * 0.85, mid: tdeeVal * 0.825 };
  if (goal === 'gain') return { low: tdeeVal * 1.10, high: tdeeVal * 1.15, mid: tdeeVal * 1.125 };
  return { low: tdeeVal, high: tdeeVal, mid: tdeeVal };
}

// ── Safety floors ───────────────────────────────────────────────────
// Never show a weight-loss target below these, nor below the person's own BMR.
// (The exact failure this prevents: a 40 kg sedentary woman getting 947 kcal.)
const CALORIE_FLOOR = { female: 1200, male: 1500 };

// ── BMI + healthy range + adjusted weight ───────────────────────────
function bmiValue(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

function classifyBmi(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'overweight';
  if (bmi < 35) return 'obese_1';
  if (bmi < 40) return 'obese_2';
  return 'obese_3';
}

function healthyWeightRange(heightCm) {
  if (!(heightCm > 0)) return null;
  const m = heightCm / 100;
  return { min: 18.5 * m * m, max: 24.9 * m * m };
}

// Adjusted body weight for protein prescription in obesity:
// ideal (BMI 22) + 25% of the excess. Below ideal, the real weight stands.
function adjustedBodyWeight(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm > 0)) return weightKg;
  const m = heightCm / 100;
  const ideal = 22 * m * m;
  if (weightKg <= ideal) return weightKg;
  return ideal + 0.25 * (weightKg - ideal);
}

// ── Protein target (the headline — protects lean mass in a deficit) ──
// 2.0–2.4 g/kg LBM when composition is known, else 1.6–2.2 g/kg bodyweight.
// With heightCm provided and BMI ≥ 30 (and no LBM), the basis switches to
// adjusted weight so a 180 kg user is not told to eat 340+ g/day.
// With a goal provided, `rec` scales: higher in a deficit to protect lean
// mass, lower at maintenance (ISSN position stand ranges).
const PROTEIN_CAP_PER_KG = 2.5; // g per kg of LBM (or adjusted weight)

function proteinTarget({ weightKg, lbmKg, heightCm, goal }) {
  const recFactor = { lose: 1.0, gain: 0.95, maintain: 0.9 }[goal] || null;
  if (lbmKg != null && lbmKg > 0) {
    const rec = recFactor != null ? 2.2 * lbmKg * recFactor : 2.2 * lbmKg;
    return { low: 2.0 * lbmKg, high: 2.4 * lbmKg, rec, basis: 'lbm', capG: PROTEIN_CAP_PER_KG * lbmKg };
  }
  if (weightKg > 0) {
    const bmi = heightCm != null ? bmiValue(weightKg, heightCm) : null;
    const useAdjusted = bmi != null && bmi >= 30;
    const basisKg = useAdjusted ? adjustedBodyWeight(weightKg, heightCm) : weightKg;
    const rec = recFactor != null ? 1.9 * basisKg * recFactor : 1.9 * basisKg;
    return {
      low: 1.6 * basisKg, high: 2.2 * basisKg, rec,
      basis: useAdjusted ? 'adjusted' : 'weight',
      capG: PROTEIN_CAP_PER_KG * basisKg,
    };
  }
  return null;
}

// ── Fat + carbs — close the plate around the calorie target ─────────
// Fat: 25% of calories with a physiological floor of 0.6 g/kg bodyweight.
// Carbs: whatever calories remain after protein and fat.
function macroTargets({ targetCalories, weightKg, proteinG }) {
  if (!(targetCalories > 0) || !(proteinG >= 0)) return null;
  const fatFloor = weightKg > 0 ? 0.6 * weightKg : 0;
  const fatG = Math.max((targetCalories * 0.25) / 9, fatFloor);
  const carbsG = Math.max(0, (targetCalories - proteinG * 4 - fatG * 9) / 4);
  return { fatG, carbsG };
}

// ── Input range validation ──────────────────────────────────────────
// The UI constrains inputs in practice; the engine must not trust that.
// (Without this, age 500 produces a NEGATIVE BMR.)
const INPUT_RANGES = {
  age: [10, 120],
  heightCm: [100, 250],
  weightKg: [25, 300],
  bodyFatPct: [3, 70],
};

function validateEnergyInput(inp) {
  const issues = [];
  for (const [field, [lo, hi]] of Object.entries(INPUT_RANGES)) {
    const v = inp[field];
    if (v == null) continue;
    if (!Number.isFinite(v) || v < lo || v > hi) issues.push(field);
  }
  return issues;
}

// ── The full plan — everything the result screen needs, with guards ──
// Input: { weightKg, heightCm, age, sex, bodyFatPct, activity, goal }
// (all optional except what the chosen BMR path requires; activity is the
// multiplier value). Returns null when no BMR is computable or an input is
// out of range, with warnings explaining why. warnings[] entries are
// { code, values? } — the UI translates codes; the engine stays i18n-free.
function energyPlan(inp) {
  const warnings = [];
  const invalid = validateEnergyInput(inp);
  if (invalid.length) {
    return { ok: false, warnings: [{ code: 'input_out_of_range', values: invalid }] };
  }

  const { bmr, method, lbm } = computeBMR(inp);
  if (!bmr) return { ok: false, warnings: [] };

  const activity = inp.activity || 1.2;
  const tdeeVal = tdee(bmr, activity);
  const bmi = bmiValue(inp.weightKg, inp.heightCm);
  const bmiCategory = classifyBmi(bmi);
  const range = healthyWeightRange(inp.heightCm);

  // Three goals side by side, each with the floors applied to the LOSE side.
  // Floor = own BMR always; plus the absolute floor when sex is known.
  const absFloor = inp.sex === 'male' || inp.sex === 'female' ? CALORIE_FLOOR[inp.sex] : 0;
  const floor = Math.max(bmr, absFloor);
  function guardLose(c) {
    const low = Math.max(c.low, floor);
    const high = Math.max(c.high, floor);
    const mid = Math.max(c.mid, floor);
    const applied = mid > c.mid + 0.5;
    return { low, high, mid, floorApplied: applied, floorSource: applied ? (c.mid < absFloor ? 'absolute' : 'bmr') : null };
  }
  const rawLose = goalCalories(tdeeVal, 'lose');
  const allGoals = {
    lose: guardLose(rawLose),
    maintain: { ...goalCalories(tdeeVal, 'maintain'), floorApplied: false },
    gain: { ...goalCalories(tdeeVal, 'gain'), floorApplied: false },
  };
  if (allGoals.lose.floorApplied) {
    warnings.push({
      code: allGoals.lose.floorSource === 'absolute' ? 'calorie_floor' : 'bmr_floor',
      values: { kcal: Math.round(allGoals.lose.mid) },
    });
  }

  // Protein with adjusted-weight + goal scaling + cap.
  const goal = inp.goal || 'maintain';
  let protein = proteinTarget({ weightKg: inp.weightKg, lbmKg: lbm, heightCm: inp.heightCm, goal });
  if (protein) {
    if (protein.basis === 'adjusted') warnings.push({ code: 'protein_adjusted' });
    if (protein.rec > protein.capG) {
      protein = { ...protein, rec: protein.capG, high: Math.min(protein.high, protein.capG) };
      warnings.push({ code: 'protein_cap', values: { g: Math.round(protein.capG) } });
    }
  }

  const target = allGoals[goal] || allGoals.maintain;
  const macros = protein
    ? macroTargets({ targetCalories: target.mid, weightKg: inp.weightKg, proteinG: protein.rec })
    : null;

  return {
    ok: true,
    bmr, method, lbm, tdeeVal, activity,
    allGoals, goal, target,
    protein, macros,
    bmi, bmiCategory, healthyRange: range,
    warnings,
  };
}

// ── Reality check — actual TDEE from two weigh-ins + reported intake ─
// (BODY_TAB_SPEC §10.) 7700 kcal ≈ 1 kg of body mass.
//   weightChangeKg = weightThen − weightNow, i.e. the amount LOST (positive
//   when weight went DOWN, negative when it went up). With that convention
//   maintenance = intake + change×7700/days: eating 2000 while losing 1 kg over
//   28 days ⇒ 2000 + 275 ≈ 2275 (maintenance sits ABOVE intake, as it must in a
//   deficit).
// Returns { status, tdee } where status is one of:
//   'ok'          — a usable estimate
//   'too_short'   — window < 14 days
//   'maintenance' — |weight change| < 0.2 kg (too small to compute)
//   'implausible' — result outside 1000–5000 kcal (intake likely under-reported)
function realityCheckTDEE({ avgDailyCalories, weightChangeKg, days }) {
  if (!(days >= 14)) return { status: 'too_short', tdee: null };
  if (Math.abs(weightChangeKg) < 0.2) return { status: 'maintenance', tdee: null };
  if (!(avgDailyCalories > 0)) return { status: 'too_short', tdee: null };
  const value = avgDailyCalories + (weightChangeKg * 7700 / days);
  if (value < 1000 || value > 5000) return { status: 'implausible', tdee: value };
  return { status: 'ok', tdee: value };
}

// ── Observed weekly rate of change (kg/week) ────────────────────────
// Pure display math from the reality-check window. weightChangeKg is (then −
// now), so a POSITIVE result means weight went DOWN, i.e. loss per week.
// Returns null when the window is unusable.
function weeklyRateKg({ weightChangeKg, days }) {
  if (!(days > 0)) return null;
  return (weightChangeKg / days) * 7;
}

// ── Unit conversions (UI keeps display units; math stays metric) ─────
function lbToKg(lb) { return lb * 0.45359237; }
function kgToLb(kg) { return kg / 0.45359237; }
function inToCm(inch) { return inch * 2.54; }
function cmToIn(cm) { return cm / 2.54; }

module.exports = {
  lbmFromBodyFat, bmrKatch, bmrCunningham, bmrMifflin, computeBMR,
  ACTIVITY_LEVELS, tdee, goalCalories, proteinTarget, realityCheckTDEE,
  weeklyRateKg, lbToKg, kgToLb, inToCm, cmToIn,
  CALORIE_FLOOR, PROTEIN_CAP_PER_KG,
  bmiValue, classifyBmi, healthyWeightRange, adjustedBodyWeight,
  macroTargets, validateEnergyInput, energyPlan,
};
