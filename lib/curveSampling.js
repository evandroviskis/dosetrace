'use strict';
// The curve's level at every sample (A-93, senior review 2026-10-04). Doses are walked sorted with a
// moving window: a dose after the sample is never visited (break), and a dose older than 30 half-lives
// (plus its rise time) is dropped for good — its share is below 1e-9, so the numbers do not change.
// level = all doses up to and at the sample; before = the doses strictly before it. Pure.
// sampleLevelsAt takes any sample moments (DV-068: the 6 h grid plus every dose instant and Now,
// lib/serumModel curveSampleTimes); sampleLevels is the plain grid.
//
// Curve fixes 2 + 3 (1.3.1): when the amountFraction is a sum of exponentials — marked
// amountFraction.exactCarry (lib/halfLives: e^(−kd·t) for a first-order fall, kr/(kr − kd) ·
// (e^(−kd·t) − e^(−kr·t)) for a modeled rise) — the sums are CARRIED: once per dose list,
// A_i = A_(i−1) · e^(−kd·(d_i − d_(i−1))) + 1 (and B with kr), so the level at any moment is
// A_i · e^(−kd·(t − d_i)) (minus the B term) from the last dose i before it. Same numbers (every
// dose counts, none dropped), work = doses once + about 2 exponentials per sample. A frozen dose list
// (lib/serumModel scheduledDoses) keeps its carried sums between rebuilds (engineering review ENG-1:
// a date-chip tap or a toggle never walks the look-back again). Non-finite doses are left out
// (PK-3). Any other amountFraction (tests) takes the moving window below.
const halfLives = require('./halfLives');

const KR = {};
function riseRateOf(entry) {
  const key = entry.hours + ':' + entry.tmaxHours;
  if (!(key in KR)) KR[key] = halfLives.riseRate(entry.hours, entry.tmaxHours);
  return KR[key];
}

const finite = (doses) => (doses || []).filter((d) => Number.isFinite(d));

// The carried sums of one dose list for one compound (kd, kr per ms).
function buildCarry(doses, entry) {
  const sorted = finite(doses).sort((a, b) => a - b);
  const kd = Math.LN2 / (entry.hours * 3600000);
  const krH = entry.tmaxHours ? riseRateOf(entry) : null;
  const kr = krH ? krH / 3600000 : 0;
  const n = sorted.length;
  const A = new Float64Array(n);
  const B = new Float64Array(n);
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const dt = i ? sorted[i] - sorted[i - 1] : 0;
    a = (i ? a * Math.exp(-kd * dt) : 0) + 1;
    if (kr) b = (i ? b * Math.exp(-kr * dt) : 0) + 1;
    A[i] = a;
    B[i] = b;
  }
  return { sorted, A, B, kd, kr, c: kr ? kr / (kr - kd) : 1 };
}
const CARRY = new WeakMap(); // frozen dose list → Map(compound key → carried sums)
function carryOf(doses, entry) {
  if (!Object.isFrozen(doses)) return buildCarry(doses, entry);
  let byEntry = CARRY.get(doses);
  if (!byEntry) { byEntry = new Map(); CARRY.set(doses, byEntry); }
  const key = entry.hours + ':' + (entry.tmaxHours || 0);
  let carry = byEntry.get(key);
  if (!carry) { carry = buildCarry(doses, entry); byEntry.set(key, carry); }
  return carry;
}
// The last index i with sorted[i] < t (strict) or ≤ t, −1 when none.
function lastBefore(sorted, t, strict) {
  let lo = 0, hi = sorted.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (strict ? sorted[mid] < t : sorted[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
function carriedLevel(carry, i, t) {
  if (i < 0) return 0;
  const dt = t - carry.sorted[i];
  const a = carry.A[i] * Math.exp(-carry.kd * dt);
  return carry.kr ? carry.c * (a - carry.B[i] * Math.exp(-carry.kr * dt)) : a;
}
function sampleLevelsCarried(doses, doseMg, entry, times) {
  const carry = carryOf(doses, entry);
  const n = times.length;
  const points = new Array(n);
  const pre = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = times[i];
    const iPre = lastBefore(carry.sorted, t, true);
    const iAt = lastBefore(carry.sorted, t, false);
    const before = carriedLevel(carry, iPre, t);
    pre[i] = doseMg * before;
    points[i] = iAt === iPre ? pre[i] : doseMg * carriedLevel(carry, iAt, t);
  }
  return { points, pre };
}

function sampleLevelsAt(doses, doseMg, entry, times, amountFraction) {
  if (amountFraction && amountFraction.exactCarry === true && entry && entry.hours > 0) {
    return sampleLevelsCarried(doses || [], doseMg, entry, times);
  }
  const sorted = finite(doses).sort((a, b) => a - b);
  const horizonMs = (30 * entry.hours + (entry.tmaxHours || 0) * 3) * 3600000;
  const n = times.length;
  const points = new Array(n);
  const pre = new Array(n);
  let lo = 0;
  for (let i = 0; i < n; i++) {
    const ts = times[i];
    while (lo < sorted.length && ts - sorted[lo] > horizonMs) lo++;
    let level = 0, before = 0;
    for (let k = lo; k < sorted.length; k++) {
      const d = sorted[k];
      if (d > ts) break;
      const c = doseMg * amountFraction(entry, (ts - d) / 3600000);
      level += c;
      if (d < ts) before += c;
    }
    points[i] = level;
    pre[i] = before;
  }
  return { points, pre };
}

function sampleLevels(doses, doseMg, entry, start, stepMs, nSteps, amountFraction) {
  const times = new Array(nSteps + 1);
  for (let i = 0; i <= nSteps; i++) times[i] = start + i * stepMs;
  return sampleLevelsAt(doses, doseMg, entry, times, amountFraction);
}

module.exports = { sampleLevels, sampleLevelsAt };
