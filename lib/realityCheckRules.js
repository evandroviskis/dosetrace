'use strict';
// Pure reality-check rules (no React Native imports; runs under node --test).

// A reality check can start on a past weigh-in, at most 7 days back (FL-44,
// founder 2026-09-27) — never further, never in the future.
const MAX_START_BACKDATE_DAYS = 7;
const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
function shift(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  if (isNaN(d)) return null;
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
// The earliest allowed start day.
const earliestStart = (todayISO) => shift(todayISO, -MAX_START_BACKDATE_DAYS);
// Is dateISO an allowed start (today … 7 days back)?
function validStartDate(dateISO, todayISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(todayISO || ''))) return false;
  if (shift(dateISO, 0) !== dateISO) return false; // not a real calendar day
  return dateISO <= todayISO && dateISO >= earliestStart(todayISO);
}
// Move a start date by delta days, staying inside the allowed range.
function stepStartDate(dateISO, delta, todayISO) {
  const next = shift(dateISO || todayISO, delta);
  if (!next) return todayISO;
  if (next > todayISO) return todayISO;
  const min = earliestStart(todayISO);
  return next < min ? min : next;
}
// A saved weigh-in (calc snapshot) on that day, to prefill the start weight.
function weighInOn(snapshots, dateISO) {
  const s = (snapshots || []).find((x) => x && x.date === dateISO && typeof x.weightKg === 'number');
  return s ? s.weightKg : null;
}

// Moving the start date may prefill the weight from a weigh-in saved that day —
// but NEVER overwrite a weight the user typed. current = the field now; lastAuto =
// the value this picker put there last (null if none); snapshot = the weigh-in on
// the new day (display units) or null. Returns the new field value, or null to
// leave the field as it is.
function prefillStartWeight(current, lastAuto, snapshot) {
  const cur = String(current == null ? '' : current).trim();
  const auto = lastAuto == null ? null : String(lastAuto);
  if (cur && cur !== auto) return null; // typed by the user — keep it
  if (snapshot != null) return String(snapshot);
  return cur && cur === auto ? '' : null; // clear a stale prefill, else leave empty as is
}

// Where an open check stands (Journey redesign parts 8 and 10, founder 2026-10-02): the
// check finishes from the user's own numbers — the FIRST weigh-in on or after the day-21
// date (never a later one, so the result does not move) and the intake: the food log's
// 7-day run (FL-3) or, when there is none, the average per day the user typed by hand
// (founder 2026-10-02: "manter a opção de digitar as calorias à mão"). Both present: the
// food run is used and the typed value is kept (typedKept). Never a guess of the app's.
// snapshots: [{ date, weightKg }]; run: intakeRun(); typedKcal: typedIntakeFor() or null.
//   none        no open check
//   running     before the weigh-in date
//   due         the weigh-in date has come, no weigh-in yet (FL-42: the check stays open)
//   needs_food  weighed in, but no 7-day food run and no typed average yet
//   ready       { weighIn, days, weightChangeKg (start − weigh-in), avgDailyCalories,
//                 source: 'food' | 'typed', typedKept }
function checkOutcome({ start, snapshots, run, typedKcal = null, todayISO, days = 21 } = {}) {
  if (!start || !start.date || typeof start.weightKg !== 'number') return { state: 'none' };
  const startISO = String(start.date).slice(0, 10);
  const dueISO = shift(startISO, days);
  const weigh = (snapshots || [])
    .filter((x) => x && typeof x.weightKg === 'number' && x.date && x.date >= dueISO)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0] || null;
  if (!weigh) return { state: todayISO >= dueISO ? 'due' : 'running', dueISO };
  const food = !!(run && run.ok);
  const typed = typeof typedKcal === 'number' && isFinite(typedKcal) && typedKcal > 0 ? typedKcal : null;
  if (!food && typed == null) return { state: 'needs_food', dueISO, weighIn: weigh };
  const ms = new Date(weigh.date + 'T12:00:00') - new Date(startISO + 'T12:00:00');
  return {
    state: 'ready',
    dueISO,
    weighIn: weigh,
    days: Math.round(ms / 86400000),
    weightChangeKg: start.weightKg - weigh.weightKg,
    avgDailyCalories: food ? run.avgKcal : typed,
    source: food ? 'food' : 'typed',
    typedKept: food && typed != null,
  };
}

// ── Calories typed by hand (founder 2026-10-02) ──
// Stored in the synced calc_inputs payload (lib/realityCheck.js saveCalcInputs, merged —
// never clobbered) as rcTypedKcal: { start, kcal }, tied to the check it was typed for
// (its start date), so it never carries into a later check. The sources of finished
// results are kept next to it as rcResultSources: { [weigh-in date]: 'food' | 'typed' };
// a result saved before this (the old typed form) simply has none.
const MIN_TYPED_KCAL = 500;
const MAX_TYPED_KCAL = 10000;
// "2100", "2 100", "2,100" / "2.100" (thousands), "1850,6" → whole kcal; else null.
function parseTypedKcal(text) {
  let v = String(text == null ? '' : text).trim();
  if (!v) return null;
  if (/^\d{1,2}[.,\s]\d{3}$/.test(v)) v = v.replace(/[.,\s]/, '');
  else if (/^\d+([.,]\d+)?$/.test(v)) v = v.replace(',', '.');
  else return null;
  const n = Math.round(parseFloat(v));
  return Number.isFinite(n) && n >= MIN_TYPED_KCAL && n <= MAX_TYPED_KCAL ? n : null;
}
function typedIntakeFor(saved, startISO) {
  const t = saved && saved.rcTypedKcal;
  if (!t || !startISO || String(t.start).slice(0, 10) !== String(startISO).slice(0, 10)) return null;
  return typeof t.kcal === 'number' && isFinite(t.kcal) && t.kcal > 0 ? t.kcal : null;
}
// The calc_inputs patch for a typed value (kcal null = cleared by the user).
function typedIntakePatch(startISO, kcal) {
  return { rcTypedKcal: kcal == null ? null : { start: String(startISO).slice(0, 10), kcal } };
}
function resultSourcePatch(dateISO, source) {
  return { rcResultSources: { [String(dateISO).slice(0, 10)]: source === 'typed' ? 'typed' : 'food' } };
}
function resultSource(saved, dateISO) {
  const m = saved && saved.rcResultSources;
  const v = m && typeof m === 'object' ? m[String(dateISO).slice(0, 10)] : null;
  return v === 'food' || v === 'typed' ? v : null;
}

// Founder 2026-10-09: Today's reality-check alert follows the check's real state, never the date
// alone (it kept saying "time to weigh in" after the weigh-in). outcome: checkOutcome(); run:
// intakeRun() or null. → { body: 'when' | 'due' | 'needs_food' | 'ready', left?, dueISO? } or null.
const RUN_DAYS = 7;
function checkAlert(outcome, run) {
  if (!outcome || outcome.state === 'none') return null;
  if (outcome.state === 'running') return { body: 'when', dueISO: outcome.dueISO };
  if (outcome.state === 'due') return { body: 'due' };
  if (outcome.state === 'needs_food') return { body: 'needs_food', left: Math.max(1, RUN_DAYS - Math.min(RUN_DAYS, (run && run.current) || 0)) };
  return { body: 'ready' };
}

module.exports = {
  checkAlert,
  MAX_START_BACKDATE_DAYS, earliestStart, validStartDate, stepStartDate, weighInOn, prefillStartWeight, checkOutcome,
  MIN_TYPED_KCAL, MAX_TYPED_KCAL, parseTypedKcal, typedIntakeFor, typedIntakePatch, resultSourcePatch, resultSource,
};
