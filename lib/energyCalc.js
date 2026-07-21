// Pure energy / protein math for the Body calculator (BODY_TAB_SPEC §6–§10).
// No React Native imports so it's unit-testable under Node. Every output is an
// ESTIMATE — ±10–15% individual variation is normal; this is a general-wellness
// reality check, never a medical determination and NEVER tied to any dose.
// CommonJS so `node --test` can require it; Metro imports it fine.

// ── Body composition ────────────────────────────────────────────────
// Lean body mass from weight + body-fat %. Never ask for both LBM and BF%.
function lbmFromBodyFat(weightKg, bodyFatPct) {
  if (!(weightKg > 0) || !(bodyFatPct >= 0) || bodyFatPct >= 100) return null;
  return weightKg * (1 - bodyFatPct / 100);
}

// ── BMR formulas ────────────────────────────────────────────────────
// Preferred when body composition is known (needs only LBM — no age/sex/height).
function bmrKatch(lbmKg) { return 370 + 21.6 * lbmKg; }
// For users who flag consistent resistance training.
function bmrCunningham(lbmKg) { return 500 + 22 * lbmKg; }
// Fallback when body fat is unknown (needs age, sex, height).
function bmrMifflin({ weightKg, heightCm, age, sex }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return base + (sex === 'male' ? 5 : -161);
}

// Choose the best BMR method from whatever inputs are present.
// Returns { bmr, method, lbm } or { bmr: null, ... } when nothing is computable.
function computeBMR(inp) {
  const { weightKg, heightCm, age, sex, bodyFatPct, resistanceTrained } = inp;
  let lbm = inp.lbmKg != null ? inp.lbmKg : null;
  if (lbm == null && bodyFatPct != null && weightKg != null) {
    lbm = lbmFromBodyFat(weightKg, bodyFatPct);
  }
  if (lbm != null && lbm > 0) {
    return {
      bmr: resistanceTrained ? bmrCunningham(lbm) : bmrKatch(lbm),
      method: resistanceTrained ? 'cunningham' : 'katch',
      lbm,
    };
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
function goalCalories(tdeeVal, goal) {
  if (goal === 'lose') return { low: tdeeVal * 0.80, high: tdeeVal * 0.85, mid: tdeeVal * 0.825 };
  if (goal === 'gain') return { low: tdeeVal * 1.10, high: tdeeVal * 1.15, mid: tdeeVal * 1.125 };
  return { low: tdeeVal, high: tdeeVal, mid: tdeeVal };
}

// ── Protein target (the headline — protects lean mass in a deficit) ──
// 2.0–2.4 g/kg LBM when composition is known, else 1.6–2.2 g/kg bodyweight.
function proteinTarget({ weightKg, lbmKg }) {
  if (lbmKg != null && lbmKg > 0) {
    return { low: 2.0 * lbmKg, high: 2.4 * lbmKg, rec: 2.2 * lbmKg, basis: 'lbm' };
  }
  if (weightKg > 0) {
    return { low: 1.6 * weightKg, high: 2.2 * weightKg, rec: 1.9 * weightKg, basis: 'weight' };
  }
  return null;
}

// ── Reality check — actual TDEE from two weigh-ins + reported intake ─
// (BODY_TAB_SPEC §10.) 7700 kcal ≈ 1 kg of body mass.
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

// ── Unit conversions (UI keeps display units; math stays metric) ─────
function lbToKg(lb) { return lb * 0.45359237; }
function kgToLb(kg) { return kg / 0.45359237; }
function inToCm(inch) { return inch * 2.54; }
function cmToIn(cm) { return cm / 2.54; }

module.exports = {
  lbmFromBodyFat, bmrKatch, bmrCunningham, bmrMifflin, computeBMR,
  ACTIVITY_LEVELS, tdee, goalCalories, proteinTarget, realityCheckTDEE,
  lbToKg, kgToLb, inToCm, cmToIn,
};
