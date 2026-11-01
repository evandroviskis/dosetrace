'use strict';
// DV-080 (DL-43; founder 2026-11-01, option A of docs/design/rodada2-conta-exames.html #dv080): the
// layout rules of a lab marker's chart (screens/components/MarkerChart.js), pure so they are tested.
// One series per unit (a marker read in ng/dL and in nmol/L is never joined in one line, and NO unit
// is ever converted), every point placed by its date on one time axis shared by the unit charts.

const DAY_MS = 86400000;

// The unit as a grouping key: the same unit typed with other spacing or case ("mg/dl ", "mg / dL")
// is the same unit. Never a conversion — "ng/dL" and "nmol/L" stay apart.
const unitKey = (u) => String(u == null ? '' : u).replace(/\s+/g, '').toLowerCase();

// points (oldest → newest, each { date, value, unit, ... }) → [{ unit, points }]. The series of the
// latest reading's unit (latestUnit) first, as drawn; the others by their newest reading, newest first.
// Each series shows the unit as its newest reading spells it.
function unitSeries(points, latestUnit) {
  const by = new Map();
  (Array.isArray(points) ? points : []).forEach((p, i) => {
    const k = unitKey(p && p.unit);
    if (!by.has(k)) by.set(k, { key: k, points: [], last: -1 });
    const s = by.get(k);
    s.points.push(p);
    s.last = i;
  });
  const first = unitKey(latestUnit);
  return [...by.values()]
    .sort((a, b) => (b.key === first) - (a.key === first) || b.last - a.last)
    .map((s) => ({ unit: String(s.points[s.points.length - 1].unit || '').trim(), points: s.points }));
}

// A YYYY-MM-DD date as a day number (UTC, so no time zone or DST shifts the spacing).
function dayNum(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS : NaN;
}

// The first and last date of every drawn reading (all units): the shared time axis.
function dateDomain(points) {
  const days = (Array.isArray(points) ? points : []).map((p) => dayNum(p && p.date)).filter(Number.isFinite);
  if (!days.length) return { from: null, to: null };
  return { from: Math.min(...days), to: Math.max(...days) };
}

// x of a date between L (the first date) and R (the last): proportional to time. One date only (or
// an unreadable one) sits in the middle.
function dateX(date, from, to, L, R) {
  const d = dayNum(date);
  if (!Number.isFinite(d) || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) return (L + R) / 2;
  return L + ((d - from) / (to - from)) * (R - L);
}

// Which points get their value and date written: the newest always, then walking back every point at
// least minGap px from the last labelled one, so labels never collide.
function labelledIndexes(xs, minGap) {
  const show = new Set();
  let last = null;
  for (let i = xs.length - 1; i >= 0; i--) {
    if (last == null || Math.abs(last - xs[i]) >= minGap) { show.add(i); last = xs[i]; }
  }
  return show;
}

// How many different days the readings fall on (two readings of one test day count once).
function distinctDates(points) {
  return new Set((Array.isArray(points) ? points : []).map((p) => dayNum(p && p.date)).filter(Number.isFinite)).size;
}

// Simulator 2026-11-01: two readings of one day drew a vertical line on one x. A chart shows change over
// time, so it is drawn only when at least one unit has readings on 2+ different days; otherwise the page
// shows the "add another test" line and the readings list. (A one-day unit beside such a unit keeps its
// small chart of DV-080 option A, with no line.)
function hasTimeChart(points, latestUnit) {
  return unitSeries(points, latestUnit).some((s) => distinctDates(s.points) >= 2);
}

// Where each point's value label goes and which point writes the date, for xy = [{ x, y }] in drawing
// order. Points of one date share an x: each keeps its label — the upper one above its point, the lower
// one under it, any in between beside it — and the date is written once. Dates are thinned as before
// (lib labelledIndexes: the newest always, then every date at least minGap px from the last labelled).
// Returns [{ value: 'above' | 'below' | 'right' | null, date: boolean }].
function labelPlan(xy, minGap) {
  const list = Array.isArray(xy) ? xy : [];
  const groups = [];
  const byX = new Map();
  list.forEach((p, i) => {
    const k = Math.round(p.x * 2) / 2; // same date → same x
    if (!byX.has(k)) { byX.set(k, groups.length); groups.push({ x: k, members: [] }); }
    groups[byX.get(k)].members.push(i);
  });
  const plan = list.map(() => ({ value: null, date: false }));
  const kept = labelledIndexes(groups.map((g) => g.x), minGap);
  groups.forEach((g, gi) => {
    if (!kept.has(gi)) return;
    const order = g.members.slice().sort((a, b) => list[a].y - list[b].y || a - b);
    order.forEach((i, j) => {
      plan[i].value = order.length === 1 || j === 0 ? 'above' : j === order.length - 1 ? 'below' : 'right';
    });
    plan[g.members[g.members.length - 1]].date = true;
  });
  return plan;
}

// The value label's anchor point for a point at { x, y } (11 pt labels, 4.5 px points).
function labelPos(p, where) {
  if (where === 'below') return { x: p.x, y: p.y + 18, anchor: 'middle' };
  if (where === 'right') return { x: p.x + 9, y: p.y + 4, anchor: 'start' };
  return { x: p.x, y: p.y - 10, anchor: 'middle' };
}

module.exports = { unitKey, unitSeries, dayNum, dateDomain, dateX, labelledIndexes, distinctDates, hasTimeChart, labelPlan, labelPos };
