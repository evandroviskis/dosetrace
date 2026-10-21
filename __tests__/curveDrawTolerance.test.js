'use strict';
// Curve fix 3 (1.3.1, founder-approved 2026-10-20): the drawn line must not miss or flatten the
// peaks and dips of short half-life compounds. The screen draws straight segments between samples
// (SerumCurveScreen seriesD / levelAtStep: pts[i] → pre[i+1], a dose = a vertical jump pre → pts).
// Measured the way the eye sees it: in every pixel column of the plot (330 px, a phone), the drawn
// line's lowest and highest point vs the exact level's lowest and highest point there, as a share of
// the window's highest exact level. Tolerance: M.DRAW_TOLERANCE = 2 %.
// Before the fix (same doses, 330 px): BPC-157 56 % (3 + 7 days), TB-500 17 %, VIP 94 %,
// Liraglutide 8 % (90 + 30, 4 a day), weekly Semaglutide 3.6 % (its dip between the 6 h samples).
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');
const { sampleLevelsAt } = require('../lib/curveSampling');

const DAY = 864e5;
const STEP = M.STEP_HOURS * 3600e3;
const PX = 330;
const now = new Date(2026, 9, 20, 13, 7).getTime();
const sd = new Date(now - 500 * DAY).toISOString().slice(0, 10);
const mk = (name, dpd, times, interval = 1, startDaysAgo = null) => ({ id: name, name, type: 'recon', dose: '1', dose_unit: 'mg', doses_per_day: dpd, interval_days: interval, start_date: startDaysAgo == null ? sd : new Date(now - startDaysAgo * DAY).toISOString().slice(0, 10), reminder_time: times, created_at: new Date(now - 400 * DAY).toISOString() });
const SCHEDULES = [[1, '08:00', 1], [2, '08:00,20:00', 1], [4, '07:00,11:00,15:00,19:00', 1], [1, '10:30', 7]];
// Pharmacometrics review 2026-10-20 (PK-1): sparse depot dosing ON the 6 h grid (06:00 every 14 and
// 21 days) and a first-ever dose (06:00, two days ago): a modeled rise (Sustanon, t½ 7 d, Tmax 36 h)
// climbs over its first hours, and one chord across that climb drew the peak ~3 % low.
const SPARSE = [[1, '06:00', 14], [1, '06:00', 21], [1, '06:00', 21, 2]];
const WINDOWS = [[3, 7], [30, 7], [90, 30], [365, 90]];
const TOL = 0.02;

// The drawn level at t: 'L' = coming from the left (a jump AT t not yet drawn), 'R' = at t.
function drawnAt(ts, pts, pre, t, side) {
  const n = ts.length;
  if (t < ts[0]) return pts[0];
  if (t > ts[n - 1]) return pts[n - 1];
  let lo = -1;
  for (let a = 0, b = n - 1; a <= b;) { const m = (a + b) >> 1; if (side === 'L' ? ts[m] < t : ts[m] <= t) { lo = m; a = m + 1; } else b = m - 1; }
  if (lo < 0) return side === 'L' ? pre[0] : pts[0];
  if (lo >= n - 1) return pts[n - 1];
  return pts[lo] + (pre[lo + 1] - pts[lo]) * ((t - ts[lo]) / (ts[lo + 1] - ts[lo]));
}

// The exact level at sorted moments T (and just before each). A first-order fall in one pass:
// L(t) = L(t′) · 2^(−(t − t′)/t½) + the doses at t; a modeled rise through the model's own sum.
function exactAt(doses, entry, T) {
  if (entry.tmaxHours) return sampleLevelsAt(doses, 1, entry, T, H.amountFraction);
  const ds = [...doses].sort((a, b) => a - b);
  const k = Math.LN2 / (entry.hours * 3600e3);
  const points = new Array(T.length), pre = new Array(T.length);
  let L = 0, at = -Infinity, j = 0;
  const go = (t) => { if (at > -Infinity) L *= Math.exp(-k * (t - at)); at = t; };
  T.forEach((t, i) => {
    while (j < ds.length && ds[j] < t) { go(ds[j]); L += 1; j++; }
    go(t);
    pre[i] = L;
    while (j < ds.length && ds[j] === t) { L += 1; j++; }
    points[i] = L;
  });
  return { points, pre };
}

// The worst column error of one line, as a share of the window's highest exact level.
function columnError(doses, entry, ctx) {
  const { start, nSteps } = ctx;
  const end = start + nSteps * STEP;
  const ls = M.lineSamples(doses, 1, entry, ctx, H.amountFraction);
  const pxMs = (end - start) / PX;
  // Exact extremes of a column: at its edges and at each dose (just before, at). Between doses a
  // first-order fall is monotone; a modeled rise (tmaxHours) can turn inside a column, so those
  // compounds are also evaluated at 12 points per column.
  const edges = [];
  for (let c = 0; c <= PX; c++) edges.push(start + c * pxMs);
  const edgeSet = new Set(edges);
  const evalT = [...edges];
  if (entry.tmaxHours) for (let c = 0; c < PX; c++) for (let k = 1; k < 12; k++) evalT.push(edges[c] + (k / 12) * pxMs);
  for (const d of doses) if (d >= start && d <= end) evalT.push(d);
  const T = [...new Set(evalT)].sort((a, b) => a - b);
  const ex = exactAt(doses, entry, T);
  const exAt = new Map(T.map((t, i) => [t, i]));
  let top = 0;
  for (const v of ex.points) top = Math.max(top, v);
  if (!(top > 0)) return 0;
  const eMin = new Array(PX).fill(Infinity), eMax = new Array(PX).fill(-Infinity);
  const dMin = new Array(PX).fill(Infinity), dMax = new Array(PX).fill(-Infinity);
  const put = (mn, mx, c, v) => { if (c >= 0 && c < PX) { mn[c] = Math.min(mn[c], v); mx[c] = Math.max(mx[c], v); } };
  const col = (t) => Math.min(PX - 1, Math.floor((t - start) / pxMs));
  T.forEach((t, i) => { if (!edgeSet.has(t)) { put(eMin, eMax, col(t), ex.pre[i]); put(eMin, eMax, col(t), ex.points[i]); } });
  ls.times.forEach((t, i) => { if (t >= start && t <= end && !edgeSet.has(t)) { put(dMin, dMax, col(t), ls.pre[i]); put(dMin, dMax, col(t), ls.points[i]); } });
  edges.forEach((t, c) => {
    const right = c === PX ? c - 1 : c; // the window's end closes the last column with both sides
    const i = exAt.get(t);
    put(eMin, eMax, c - 1, ex.pre[i]); put(eMin, eMax, right, ex.points[i]);
    put(dMin, dMax, c - 1, drawnAt(ls.times, ls.points, ls.pre, t, 'L'));
    put(dMin, dMax, right, drawnAt(ls.times, ls.points, ls.pre, t, 'R'));
  });
  let worst = 0;
  for (let c = 0; c < PX; c++) worst = Math.max(worst, Math.abs(dMax[c] - eMax[c]) / top, Math.abs(dMin[c] - eMin[c]) / top);
  return worst;
}

function worstFor(name, [past, fut]) {
  const entry = H.getHalfLifeEntry(name);
  const start = M.curveGridStart(now, past);
  const nSteps = Math.round((now + fut * DAY - start) / STEP);
  const ctx = { start, stepMs: STEP, nSteps, now, plotPx: PX, extraTimes: [] };
  let worst = 0;
  // Every schedule for a fast fall (t½ < 12 h). A slower one draws from the 6 h grid, its doses and
  // dips: 4 a day (the merged-pixel dips) and weekly. A modeled rise: daily and weekly (its dips are
  // deepest when the doses are far apart) — the dense ones cost seconds for no new case.
  const list = [...(entry.tmaxHours ? [SCHEDULES[0], SCHEDULES[3]] : entry.hours >= 12 ? [SCHEDULES[2], SCHEDULES[3]] : SCHEDULES), ...SPARSE];
  for (const s of list) {
    const doses = M.scheduledDoses(mk(name, ...s), entry, start, start + nSteps * STEP, now);
    worst = Math.max(worst, columnError(doses, entry, ctx));
  }
  return worst;
}

test('the tolerance is 2 % of the chart top', () => {
  assert.equal(M.DRAW_TOLERANCE, TOL);
});

test('PK-1: Sustanon (Tmax 36 h) dosed at 06:00 every 14 / 21 days and its first-ever dose: each pixel column within 2 % on every window', () => {
  for (const w of WINDOWS) {
    const e = worstFor('Sustanon 250', w);
    assert.ok(e <= TOL, `${w.join('+')}: ${(100 * e).toFixed(2)} %`);
  }
});

test('BPC-157 and TB-500 on the default window (3 + 7 days): each pixel column within 2 %', () => {
  for (const name of ['BPC-157', 'TB-500']) {
    const e = worstFor(name, [3, 7]);
    assert.ok(e <= TOL, `${name}: ${(100 * e).toFixed(2)} %`);
  }
});

test('every charted half-life, down to the shortest (VIP 0.03 h), on 3 + 7, 30 + 7, 90 + 30 and 365 + 90 days: within 2 %', () => {
  // one compound per distinct (half-life, rise) — the line depends on nothing else
  const seen = new Map();
  for (const name of Object.keys(H.HALF_LIVES)) {
    const e = H.getHalfLifeEntry(name);
    if (!e) continue;
    const key = e.hours + ':' + (e.tmaxHours || 0);
    if (!seen.has(key)) seen.set(key, name);
  }
  const shortest = Math.min(...[...seen.keys()].map((k) => Number(k.split(':')[0])));
  assert.equal(shortest, 0.03, 'VIP is the shortest');
  const fails = [];
  for (const name of seen.values()) for (const w of WINDOWS) {
    const e = worstFor(name, w);
    if (!(e <= TOL)) fails.push(`${name} ${w.join('+')}: ${(100 * e).toFixed(2)} %`);
  }
  assert.deepEqual(fails, []);
});

test('a dose spike still draws its exact top, and the fall samples sit on the plot pixels after it', () => {
  const name = 'BPC-157';
  const entry = H.getHalfLifeEntry(name);
  const start = M.curveGridStart(now, 3);
  const nSteps = Math.round((now + 7 * DAY - start) / STEP);
  const ctx = { start, stepMs: STEP, nSteps, now, plotPx: PX, extraTimes: [] };
  const doses = M.scheduledDoses(mk(name, 1, '10:30'), entry, start, start + nSteps * STEP, now);
  const ls = M.lineSamples(doses, 0.25, entry, ctx, H.amountFraction);
  const d = ls.instants.find((x) => x < now);
  const k = ls.times.indexOf(d);
  assert.ok(Math.abs(ls.points[k] - M.levelAt(doses, 0.25, entry, d)) < 1e-12, 'the top is the exact level');
  const pxMs = (nSteps * STEP) / PX;
  const after = ls.decay.filter((t) => t > d && t < d + 4 * 3600e3);
  assert.ok(after.length >= 3, `${after.length} fall samples in the 4 h after the dose`);
  for (const t of after) assert.ok(Math.abs((t - start) / pxMs - Math.round((t - start) / pxMs)) < 1e-6, 'on a pixel edge');
});
