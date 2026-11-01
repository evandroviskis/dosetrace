'use strict';
// Pure reality-check rules (no React Native imports; runs under node --test).
const { localISO } = require('./localDate');

// A reality check can start on a past weigh-in, at most 7 days back (FL-44,
// founder 2026-09-27) — never further, never in the future.
const MAX_START_BACKDATE_DAYS = 7;
function shift(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  if (isNaN(d)) return null;
  d.setDate(d.getDate() + n);
  return localISO(d);
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
// The calc_inputs patch for a typed value. kcal null = a clear FOR THAT CHECK ({ start, kcal: null },
// DV-004 Gate B): the merge applies it only while the value it lands on has the same start, so a
// clear (Stop, or the user emptying it) never wipes the calories typed for another check on another
// phone (lib/realityCheckStore mergeCalcInputs). typedIntakeFor reads it as no typed value.
function typedIntakePatch(startISO, kcal) {
  return { rcTypedKcal: { start: String(startISO).slice(0, 10), kcal: kcal == null ? null : kcal } };
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
// intakeRun() or null. → { body: 'when' | 'due' | 'needs_food' | 'ready' | 'locked' | 'no_result', left?,
// dueISO? } or null.
// DV-058 (DL-26, AD-92): a ready check says what Progress will show. opts.result: realityCheckTDEE() of the
// outcome; a status other than 'ok' (implausible / too_short) → 'no_result' (there is no number, only the
// reason; nothing to unlock, so it comes before 'locked'). opts.canSeeResult false (a free user after the
// free days) → 'locked' (the result is Premium). Unknown (not passed) → the plain 'ready'.
const RUN_DAYS = 7;
// DV-147: the one length of a reality check (lib/notifications re-exports it).
const REALITY_CHECK_DAYS = 21;
function checkAlert(outcome, run, opts) {
  if (!outcome || outcome.state === 'none') return null;
  if (outcome.state === 'running') return { body: 'when', dueISO: outcome.dueISO };
  if (outcome.state === 'due') return { body: 'due' };
  if (outcome.state === 'needs_food') return { body: 'needs_food', left: Math.max(1, RUN_DAYS - Math.min(RUN_DAYS, (run && run.current) || 0)) };
  const o = opts || {};
  if (o.result && o.result.status && o.result.status !== 'ok') return { body: 'no_result' };
  if (o.canSeeResult === false) return { body: 'locked' };
  return { body: 'ready' };
}

// DV-058 / DV-104 (AD-92): a check that ended without a number closes once its card is seen on Progress.
// The open check is stopped (lib/realityCheck clearRealityStart: food logs and weigh-ins are kept) and the
// closed card is kept in the synced calc_inputs payload (merged, never clobbered) as rcClosed: { start,
// weightKg, status, tdee } — what Progress shows ("Encerrada · sem resultado", the start weigh-in, the
// reason). It belongs to that check: shown while no check is open and no newer result exists; a new check
// clears it (CLEAR_CLOSED_CHECK).
function closedCheckPatch(start, result) {
  if (!start || !start.date || !result) return null;
  return { rcClosed: {
    start: String(start.date).slice(0, 10),
    weightKg: typeof start.weightKg === 'number' ? start.weightKg : null,
    status: result.status || null,
    tdee: typeof result.tdee === 'number' && isFinite(result.tdee) ? result.tdee : null,
  } };
}
const CLEAR_CLOSED_CHECK = { rcClosed: null };
function closedCheckShown(rcClosed, { rcStart = null, realityLog = [] } = {}) {
  if (rcStart || !rcClosed || typeof rcClosed !== 'object') return null;
  const start = String(rcClosed.start || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  if ((realityLog || []).some((c) => c && String(c.date).slice(0, 10) > start)) return null;
  return rcClosed;
}

// DV-205 (AD-92): the message for a check without a usable result — an implausible value above the
// range has its own (it is not under-reporting); the others are cal_rc_<status>.
function rcStatusKey(res) {
  if (res && res.status === 'implausible' && res.tdee > 5000) return 'cal_rc_implausible_high';
  return `cal_rc_${res && res.status}`;
}

module.exports = {
  rcStatusKey,
  REALITY_CHECK_DAYS,
  checkAlert, closedCheckPatch, closedCheckShown, CLEAR_CLOSED_CHECK,
  MAX_START_BACKDATE_DAYS, earliestStart, validStartDate, stepStartDate, weighInOn, prefillStartWeight, checkOutcome,
  MIN_TYPED_KCAL, MAX_TYPED_KCAL, parseTypedKcal, typedIntakeFor, typedIntakePatch, resultSourcePatch, resultSource,
};
