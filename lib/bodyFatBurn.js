'use strict';
// Weight and body fat (docs/specs/body-fat-burn.md, founder 2026-11-19 10:42 "Siga. Aprovo tudo.";
// picture docs/design/food-goals-progress.html part 5). Pure (node --test).
//  - bodyComposition: how much of the weight is fat and how much is lean mass, from the weigh-ins
//    that carry a body fat %, and the change between two averages (the 7-day window of
//    lib/weightTrend, at least MIN_FAT_READINGS readings each, the founder's minimum).
//  - measuredBurn: the Reality check's measured daily burn. With at least 2 fat readings in the
//    first 7 days of the check and 2 in the last 7, the energy change counts fat and lean mass
//    apart (about 9,400 kcal per kg of fat, 1,800 per kg of lean mass; Hall KD, Int J Obes 2008);
//    otherwise it is exactly the weight-only math of lib/energyCalc (7,700 kcal per kg), and the
//    result says which one was used and why.
// Never advisory: it does arithmetic on the user's own numbers and says nothing about what they mean.
const { realityCheckTDEE } = require('./energyCalc');

const FAT_KCAL_PER_KG = 9400;
const LEAN_KCAL_PER_KG = 1800;
const MIN_FAT_READINGS = 2;
const FAT_WINDOW_DAYS = 7;
// The span between the two groups of readings below which the fat math is not used (not reachable
// with a 21-day check; a guard against a division by a tiny span).
const MIN_SPAN_DAYS = 7;
// The plausible range of a measured burn (lib/energyCalc realityCheckTDEE).
const MIN_BURN = 1000;
const MAX_BURN = 5000;

const DAY = 86400000;
const dayNum = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Weigh-ins with a weight and a body fat %, one per day (the last row of a day wins), oldest first.
// rows: [{ date: 'YYYY-MM-DD', weightKg, bodyFatPct }].
function fatReadings(rows) {
  const m = new Map();
  for (const r of rows || []) {
    if (!r || !r.date || !isNum(r.weightKg) || r.weightKg <= 0 || !isNum(r.bodyFatPct)) continue;
    if (!(r.bodyFatPct > 0 && r.bodyFatPct < 100)) continue;
    const date = String(r.date).slice(0, 10);
    const fatKg = (r.weightKg * r.bodyFatPct) / 100;
    m.set(date, { date, n: dayNum(date), weightKg: r.weightKg, bodyFatPct: r.bodyFatPct, fatKg, leanKg: r.weightKg - fatKg });
  }
  return [...m.values()].sort((a, b) => a.n - b.n);
}

// Mean weight, fat kg, lean kg and day of a group of readings.
function mean(list) {
  const k = list.length;
  const sum = (f) => list.reduce((s, x) => s + x[f], 0) / k;
  return { weightKg: sum('weightKg'), fatKg: sum('fatKg'), leanKg: sum('leanKg'), n: sum('n'), count: k };
}
const strip = (r) => ({ date: r.date, weightKg: r.weightKg, bodyFatPct: r.bodyFatPct, fatKg: r.fatKg, leanKg: r.leanKg });

// The Progress table: now = the latest fat reading; change = the mean of the readings in the 7 days
// ending on the latest minus the mean of the readings in the 7 days starting on the first (each at
// least MIN_FAT_READINGS, not overlapping), else null. null without any fat reading.
function bodyComposition({ snapshots } = {}) {
  const rs = fatReadings(snapshots);
  if (!rs.length) return null;
  const last = rs[rs.length - 1];
  const first = rs[0];
  const refEnd = first.n + FAT_WINDOW_DAYS - 1;
  const nowStart = last.n - FAT_WINDOW_DAYS + 1;
  let change = null;
  if (refEnd < nowStart) {
    const ref = rs.filter((r) => r.n <= refEnd);
    const now = rs.filter((r) => r.n >= nowStart);
    if (ref.length >= MIN_FAT_READINGS && now.length >= MIN_FAT_READINGS) {
      const a = mean(ref), b = mean(now);
      change = {
        since: first.date,
        weightKg: b.weightKg - a.weightKg,
        fatKg: b.fatKg - a.fatKg,
        leanKg: b.leanKg - a.leanKg,
        refCount: a.count,
        nowCount: b.count,
      };
    }
  }
  return { now: strip(last), change };
}

// The Reality check's measured daily burn. startISO = the check's start date, endISO = the finishing
// weigh-in's date; avgDailyCalories / weightChangeKg (start − end) / days as checkOutcome gives them.
// → { status, tdee, maintenance?, method: 'fat' | 'weight', reason: null | 'readings' | 'range',
//     weightOnly: realityCheckTDEE(…), withFat: null | { status, tdee, startN, endN, spanDays, fatChangeKg, leanChangeKg } }
function measuredBurn({ startISO, endISO, snapshots, avgDailyCalories, weightChangeKg, days } = {}) {
  const weightOnly = realityCheckTDEE({ avgDailyCalories, weightChangeKg, days });
  const asWeight = (reason, withFat = null) => ({ ...weightOnly, method: 'weight', reason, weightOnly, withFat });
  if (weightOnly.status === 'too_short') return asWeight(null);
  if (!startISO || !endISO) return asWeight('readings');
  const s = dayNum(String(startISO).slice(0, 10));
  const e = dayNum(String(endISO).slice(0, 10));
  const rs = fatReadings(snapshots);
  const startGroup = rs.filter((r) => r.n >= s && r.n <= s + FAT_WINDOW_DAYS - 1);
  const endGroup = rs.filter((r) => r.n <= e && r.n >= e - FAT_WINDOW_DAYS + 1);
  if (startGroup.length < MIN_FAT_READINGS || endGroup.length < MIN_FAT_READINGS) return asWeight('readings');
  const a = mean(startGroup), b = mean(endGroup);
  const spanDays = b.n - a.n;
  if (!(spanDays >= MIN_SPAN_DAYS)) return asWeight('readings');
  const fatChangeKg = b.fatKg - a.fatKg;
  const leanChangeKg = b.leanKg - a.leanKg;
  const energy = fatChangeKg * FAT_KCAL_PER_KG + leanChangeKg * LEAN_KCAL_PER_KG;
  const tdee = avgDailyCalories - energy / spanDays;
  const ok = tdee >= MIN_BURN && tdee <= MAX_BURN;
  const withFat = { status: ok ? 'ok' : 'implausible', tdee, startN: a.count, endN: b.count, spanDays, fatChangeKg, leanChangeKg };
  if (!ok) return asWeight('range', withFat);
  return { status: 'ok', tdee, method: 'fat', reason: null, weightOnly, withFat };
}

// The math a finished result used, kept with it in the synced calc_inputs payload (merged per date,
// never clobbered — lib/realityCheckStore mergeCalcInputs), because the check's readings and food
// average are gone once it closes. res = measuredBurn(); days / avgKcal = the check's.
const roundOrNull = (v) => (isNum(v) ? Math.round(v) : null);
function resultMathPatch(dateISO, res, { days = null, avgKcal = null } = {}) {
  const fat = !!(res && res.method === 'fat');
  return { rcResultMath: { [String(dateISO).slice(0, 10)]: {
    method: fat ? 'fat' : 'weight',
    // The weight-only number only when that math gave a result (never a 0 or negative kcal row).
    weightOnly: res && res.weightOnly && res.weightOnly.status === 'ok' ? roundOrNull(res.weightOnly.tdee) : null,
    withFat: fat ? roundOrNull(res.withFat && res.withFat.tdee) : null,
    startN: fat ? res.withFat.startN : null,
    endN: fat ? res.withFat.endN : null,
    days: isNum(days) ? days : null,
    avgKcal: roundOrNull(avgKcal),
    reason: fat ? null : (res && res.reason) || 'readings',
  } } };
}
// The record of a result (by its weigh-in date), or null (a result saved before this version).
function resultMath(saved, dateISO) {
  const m = saved && saved.rcResultMath;
  const v = m && typeof m === 'object' ? m[String(dateISO).slice(0, 10)] : null;
  return v && typeof v === 'object' && (v.method === 'fat' || v.method === 'weight') ? v : null;
}

module.exports = {
  fatReadings, bodyComposition, measuredBurn, resultMathPatch, resultMath,
  FAT_KCAL_PER_KG, LEAN_KCAL_PER_KG, MIN_FAT_READINGS, FAT_WINDOW_DAYS,
};
