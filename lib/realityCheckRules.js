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

module.exports = { MAX_START_BACKDATE_DAYS, earliestStart, validStartDate, stepStartDate, weighInOn };
