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

// AD-95: a dose list may carry each dose's weight (doses.w — its own amount ÷ the line's dose,
// lib/serumModel curvePlan); without it every dose weighs 1. Sorted with the weights kept aligned.
function sortedDoses(doses) {
  const list = doses || [];
  const w = list.w || null;
  const idx = [];
  for (let i = 0; i < list.length; i++) if (Number.isFinite(list[i])) idx.push(i);
  idx.sort((a, b) => list[a] - list[b]);
  return { sorted: idx.map((i) => list[i]), weights: w ? idx.map((i) => (Number.isFinite(w[i]) ? w[i] : 1)) : null };
}

// The carried sums of one dose list for one compound (kd, kr per ms).
function buildCarry(doses, entry) {
  const { sorted, weights } = sortedDoses(doses);
  const kd = Math.LN2 / (entry.hours * 3600000);
  const krH = entry.tmaxHours ? riseRateOf(entry) : null;
  const kr = krH ? krH / 3600000 : 0;
  const n = sorted.length;
  const A = new Float64Array(n);
  const B = new Float64Array(n);
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const dt = i ? sorted[i] - sorted[i - 1] : 0;
    const wi = weights ? weights[i] : 1;
    a = (i ? a * Math.exp(-kd * dt) : 0) + wi;
    if (kr) b = (i ? b * Math.exp(-kr * dt) : 0) + wi;
    A[i] = a;
    B[i] = b;
  }
  return { sorted, A, B, kd, kr, c: kr ? kr / (kr - kd) : 1 };
}
// DB-8 (docs/specs/dose-in-body.md): a "dose in the body" line carries explicit terms (entry.terms, per unit dose
// Σ c · t^p · e^(−k·t), k per hour, p = 1 the limit form of two equal rates; lib/doseInBody). Carried per rate k:
// A_n = A_(n−1)·E + w_n and, for a t·e^(−k·t) term, B_n = (B_(n−1) + Δ·A_(n−1))·E (E = e^(−k·Δ), Δ in hours), so
// the level at t after the last dose n is Σ e^(−k·τ)·(c0·A_n + c1·(τ·A_n + B_n)), τ = t − d_n in hours. Exact.
function buildTermsCarry(doses, entry) {
  const { sorted, weights } = sortedDoses(doses);
  const byK = new Map();
  for (const x of entry.terms) {
    const g = byK.get(x.k) || { k: x.k, c0: 0, c1: 0 };
    if (x.p) g.c1 += x.c; else g.c0 += x.c;
    byK.set(x.k, g);
  }
  const groups = [...byK.values()];
  const n = sorted.length;
  for (const g of groups) {
    g.A = new Float64Array(n);
    g.B = g.c1 ? new Float64Array(n) : null;
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      const wi = weights ? weights[i] : 1;
      if (i) {
        const dh = (sorted[i] - sorted[i - 1]) / 3600000;
        const e = Math.exp(-g.k * dh);
        if (g.B) b = (b + dh * a) * e;
        a = a * e;
      }
      a += wi;
      g.A[i] = a;
      if (g.B) g.B[i] = b;
    }
  }
  return { sorted, groups, terms: true };
}
function termsLevel(carry, i, t) {
  if (i < 0) return 0;
  const tau = (t - carry.sorted[i]) / 3600000;
  let s = 0;
  for (const g of carry.groups) {
    const e = tau === 0 ? 1 : Math.exp(-g.k * tau);
    s += e * (g.c0 * g.A[i] + (g.B ? g.c1 * (tau * g.A[i] + g.B[i]) : 0));
  }
  return s;
}
const CARRY = new WeakMap(); // frozen dose list → Map(compound key → carried sums)
function carryOf(doses, entry) {
  const build = entry.terms ? buildTermsCarry : buildCarry;
  if (!Object.isFrozen(doses)) return build(doses, entry);
  let byEntry = CARRY.get(doses);
  if (!byEntry) { byEntry = new Map(); CARRY.set(doses, byEntry); }
  const key = entry.terms ? 'terms:' + entry.termsKey : entry.hours + ':' + (entry.tmaxHours || 0);
  let carry = byEntry.get(key);
  if (!carry) { carry = build(doses, entry); byEntry.set(key, carry); }
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
// At a dose's own instant (dt = 0) the factors are exactly 1: no exponential (the same bits; it keeps the one-pass
// budget now that BPC-157 / Pentadeca Arginate carry a rise — two exponentials per sample, founder 2026-11-01).
function carriedLevel(carry, i, t) {
  if (i < 0) return 0;
  const dt = t - carry.sorted[i];
  if (dt === 0) return carry.kr ? carry.c * (carry.A[i] - carry.B[i]) : carry.A[i];
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
    const lv = carry.terms ? termsLevel : carriedLevel;
    const before = lv(carry, iPre, t);
    pre[i] = doseMg * before;
    points[i] = iAt === iPre ? pre[i] : doseMg * lv(carry, iAt, t);
  }
  return { points, pre };
}

function sampleLevelsAt(doses, doseMg, entry, times, amountFraction) {
  if (amountFraction && amountFraction.exactCarry === true && entry && entry.hours > 0) {
    return sampleLevelsCarried(doses || [], doseMg, entry, times);
  }
  const { sorted, weights } = sortedDoses(doses);
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
      const c = doseMg * (weights ? weights[k] : 1) * amountFraction(entry, (ts - d) / 3600000);
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
