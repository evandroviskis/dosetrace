'use strict';
// Weight: the 7-day average (docs/specs/weight-trend.md, founder 2026-11-18; council 2026-11-17).
// The day's scale moves with water, glycogen and food still in the gut, so the big number is the
// mean of the weigh-ins of the last 7 days (today and the 6 days before), shown only with at least
// AVG_MIN_WEIGHINS of them; else the latest weigh-in, as before. Display only: the plan, BMR,
// reality check and target projection keep reading the latest weigh-in. Pure (node --test).
// Never advisory: it averages the user's own numbers and says nothing about why they moved.

const AVG_MIN_WEIGHINS = 4;
const WINDOW_DAYS = 7;

const DAY = 86400000;
const dayNum = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY);

// One weigh-in per day (the last row of a day wins), oldest first.
function byDay(snapshots) {
  const m = new Map();
  for (const r of snapshots || []) {
    if (!r || !r.date || typeof r.weightKg !== 'number' || !Number.isFinite(r.weightKg)) continue;
    m.set(String(r.date).slice(0, 10), r.weightKg);
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([date, kg]) => ({ date, kg, n: dayNum(date) }));
}

// Mean of the days in [endN - 6, endN], or null below the minimum.
function windowAvg(days, endN) {
  const inWin = days.filter((d) => d.n <= endN && d.n > endN - WINDOW_DAYS);
  if (inWin.length < AVG_MIN_WEIGHINS) return { avg: null, count: inWin.length };
  return { avg: inWin.reduce((s, d) => s + d.kg, 0) / inWin.length, count: inWin.length };
}

// snapshots: [{ date: 'YYYY-MM-DD', weightKg }]; today: 'YYYY-MM-DD'.
function weightTrend({ snapshots, today } = {}) {
  const days = byDay(snapshots);
  const latest = days.length ? { date: days[days.length - 1].date, kg: days[days.length - 1].kg } : null;
  const t = today ? dayNum(String(today).slice(0, 10)) : (days.length ? days[days.length - 1].n : 0);
  const now = windowAvg(days, t);
  const before = windowAvg(days, t - WINDOW_DAYS);
  return {
    latest,
    avg7: now.avg,
    count7: now.count,
    weekChange: now.avg != null && before.avg != null ? now.avg - before.avg : null,
    // The chart: each weigh-in with its own trailing 7-day average (null below the minimum).
    series: days.map((d) => ({ date: d.date, kg: d.kg, avg: windowAvg(days, d.n).avg })),
  };
}

module.exports = { weightTrend, AVG_MIN_WEIGHINS };
