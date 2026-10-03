'use strict';
// The Journey dashboard's Progress tile (Journey redesign part 2, founder 2026-10-02): the
// same numbers the Progress screen's hero shows — weight (latest weigh-in, else the number
// typed in Your numbers), the "Since <first weigh-in>" change, and the daily burn (TDEE),
// Measured once a reality check exists, else the formula estimate. Pure (node --test).
// Never advisory: it only repeats the user's own numbers and the energy math.
const { energyPlan, lbToKg, inToCm, kgToLb } = require('./energyCalc');
const { profileBodyInputs } = require('./bodyProfile');
const { dailyBurnGate, legacyBurnFromSaved } = require('./progressCard');

const num = (v) => {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const round1 = (v) => Math.round(v * 10) / 10;
const byDate = (a, b) => (String(a.entry_date) < String(b.entry_date) ? -1 : String(a.entry_date) > String(b.entry_date) ? 1 : 0);

// saved = the calculator inputs (calc_inputs, display units); meta = user_metadata (profile
// sex / birth year); snapshots = calc_snapshots rows; checks = reality_checks rows.
// Returns null until the numbers give an estimate (the tile then shows the prompt sentence).
function progressTile({ saved, meta, snapshots, checks, now = new Date() } = {}) {
  const s = saved || {};
  const imperial = s.unit === 'imperial';
  const body = profileBodyInputs({ meta, saved: s, now });
  const unknown = s.bfSource === 'unknown';
  const w = num(s.weight);
  const h = num(s.height);
  // The card's daily-burn rule (lib/progressCard, founder option A 2026-10-02): weight,
  // height, age and sex (profile, never the 'male' default) — or an existing user's kept
  // weight + body fat number. The tile shows the same number as the card, or none.
  const gate = dailyBurnGate({
    weightKg: w == null ? null : (imperial ? lbToKg(w) : w),
    heightCm: h == null ? null : (imperial ? inToCm(h) : h),
    age: num(body.age),
    sexKnown: !!body.profileSex,
    bodyFatPct: unknown ? null : num(s.bodyFat),
    legacyBurn: legacyBurnFromSaved({ saved: s, sexKnown: !!body.profileSex, age: body.age }),
  });
  if (!gate.show) return null;
  const plan = energyPlan({
    weightKg: w == null ? null : (imperial ? lbToKg(w) : w),
    heightCm: h == null ? null : (imperial ? inToCm(h) : h),
    age: num(body.age),
    sex: body.sex,
    bodyFatPct: unknown ? null : num(s.bodyFat),
    activity: s.activity != null ? s.activity : 1.375,
    goal: s.goal || 'lose',
  });
  if (!plan || !plan.ok) return null;
  const toW = (kg) => (imperial ? kgToLb(kg) : kg);
  const weighed = (snapshots || []).filter((r) => r && r.entry_date && typeof r.weight_kg === 'number').sort(byDate);
  const last = weighed.length ? weighed[weighed.length - 1] : null;
  const weightShown = last ? toW(last.weight_kg) : w;
  const since = weighed.length >= 2
    ? { date: String(weighed[0].entry_date).slice(0, 10), delta: round1(toW(last.weight_kg) - toW(weighed[0].weight_kg)) }
    : null;
  const done = (checks || []).filter((r) => r && r.entry_date && typeof r.tdee === 'number').sort(byDate);
  const measured = done.length ? done[done.length - 1].tdee : null;
  return {
    unit: imperial ? 'lb' : 'kg',
    weight: weightShown == null ? null : round1(weightShown).toFixed(1),
    since,
    tdee: Math.round((measured != null ? measured : plan.tdeeVal) / 10) * 10,
    measured: measured != null,
  };
}

module.exports = { progressTile };
