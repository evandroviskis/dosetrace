'use strict';
// My Body dates (docs/specs/my-body.md MB-17, MB-21, MB-27). Pure (node --test).
//
// Every day in My Body is the user's LOCAL calendar day as "YYYY-MM-DD". The 2026-10-02 bug
// ("Date given" read Oct 3 while its wheel showed Oct 2, evening in New York) came from
// new Date().toISOString().split('T')[0] — the UTC date — beside a wheel clamped to the local
// today. The field and the wheel now share one ISO string, and the wheel turns that string
// (no Date round trip through a time zone).
const { localISO } = require('./localDate');

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Today on the user's own calendar.
function todayLocal(now = new Date()) { return localISO(now); }

// A day that may not be after `max` (Date given, Test date: never in the future).
function clampNotAfter(iso, max) {
  if (!ISO.test(iso || '')) return max;
  return max && iso > max ? max : iso;
}

// The date wheel (the prototype's month / day / year columns, drawn by DTWheel): the years
// run from `back` years before this year to `ahead` years after it, always including the
// chosen year. A vaccine given decades ago (back 80), a next-due booster ten years ahead
// (ahead 15), a lab test never in the future (ahead 0).
function years(iso, now, back, ahead) {
  const y = Number(iso.slice(0, 4));
  const y0 = Math.min(now.getFullYear() - back, y), y1 = Math.max(now.getFullYear() + ahead, y);
  const out = [];
  for (let k = y0; k <= y1; k++) out.push(k);
  return out;
}
function wheelColumns(iso, now, monthLabels, { back = 10, ahead = 2 } = {}) {
  const day = ISO.test(iso || '') ? iso : todayLocal(now);
  const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7)) - 1, d = Number(day.slice(8, 10));
  const ys = years(day, now, back, ahead);
  const days = [];
  for (let k = 1; k <= daysIn(y, m); k++) days.push(k);
  return [
    { values: monthLabels.map(String), index: m },
    { values: days.map(String), index: Math.min(d, days.length) - 1 },
    { values: ys.map(String), index: ys.indexOf(y) },
  ];
}

// The day after turning one column; the day is kept inside the month (Feb 31 → Feb 28/29)
// and, with `max`, never after it.
function wheelAfter(iso, now, col, index, { back = 10, ahead = 2, max = null } = {}) {
  const day = ISO.test(iso || '') ? iso : todayLocal(now);
  let y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7)) - 1, d = Number(day.slice(8, 10));
  const ys = years(day, now, back, ahead);
  if (col === 0) m = Math.max(0, Math.min(11, index));
  if (col === 1) d = index + 1;
  if (col === 2) y = ys[Math.max(0, Math.min(ys.length - 1, index))];
  d = Math.max(1, Math.min(d, daysIn(y, m)));
  const next = `${y}-${pad2(m + 1)}-${pad2(d)}`;
  return max ? clampNotAfter(next, max) : next;
}

module.exports = { todayLocal, clampNotAfter, wheelColumns, wheelAfter };
