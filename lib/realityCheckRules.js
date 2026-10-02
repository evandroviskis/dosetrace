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
// date (never a later one, so the result does not move) and the food log's 7-day run
// (FL-3). No typed intake, no guess. snapshots: [{ date, weightKg }]; run: intakeRun().
//   none        no open check
//   running     before the weigh-in date
//   due         the weigh-in date has come, no weigh-in yet (FL-42: the check stays open)
//   needs_food  weighed in, but no 7 days in a row of full food logs yet
//   ready       { weighIn, days, weightChangeKg (start − weigh-in), avgDailyCalories }
function checkOutcome({ start, snapshots, run, todayISO, days = 21 } = {}) {
  if (!start || !start.date || typeof start.weightKg !== 'number') return { state: 'none' };
  const startISO = String(start.date).slice(0, 10);
  const dueISO = shift(startISO, days);
  const weigh = (snapshots || [])
    .filter((x) => x && typeof x.weightKg === 'number' && x.date && x.date >= dueISO)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0] || null;
  if (!weigh) return { state: todayISO >= dueISO ? 'due' : 'running', dueISO };
  if (!run || !run.ok) return { state: 'needs_food', dueISO, weighIn: weigh };
  const ms = new Date(weigh.date + 'T12:00:00') - new Date(startISO + 'T12:00:00');
  return {
    state: 'ready',
    dueISO,
    weighIn: weigh,
    days: Math.round(ms / 86400000),
    weightChangeKg: start.weightKg - weigh.weightKg,
    avgDailyCalories: run.avgKcal,
  };
}

module.exports = { MAX_START_BACKDATE_DAYS, earliestStart, validStartDate, stepStartDate, weighInOn, prefillStartWeight, checkOutcome };
