'use strict';
// S-16 / FX-15 (founder 2026-09-27; A-53 decision 2026-09-28): weigh-ins are the user's
// own data and are NEVER paywalled. The paywall only blocks RESULTS — the reality-check
// number (measured maintenance) and the target ETA. Pure — runs under node --test.

// Reality check. Starting a check and seeing its result are Premium (or a free user's
// free days, FL-41). Logging the weigh-in of a check that is already running is always
// allowed — a user whose free days ended mid-check must not lose that measurement.
function realityCheckAccess({ premium = false, rcFree = false, hasOpenCheck = false } = {}) {
  const full = !!(premium || rcFree);
  return { canStart: full, canSeeResult: full, canLogWeighIn: full || !!hasOpenCheck };
}

// A weigh-in merged into that day's snapshot row (calc_snapshots, one row per day):
// the new weight (and body fat, when given) win; waist and the computed fields of an
// earlier save that day are kept — never written over with null.
function mergeWeighIn(existing, { date, weightKg, bodyFatPct = null }) {
  const e = existing || {};
  return {
    entry_date: date,
    weight_kg: weightKg,
    waist_cm: e.waist_cm ?? null,
    body_fat_pct: bodyFatPct != null ? bodyFatPct : (e.body_fat_pct ?? null),
    lbm: e.lbm ?? null,
    bmr: e.bmr ?? null,
    tdee: e.tdee ?? null,
  };
}

module.exports = { realityCheckAccess, mergeWeighIn };
