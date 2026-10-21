'use strict';
// The curve's level at every sample (A-93, senior review 2026-10-04). Doses are walked sorted with a
// moving window: a dose after the sample is never visited (break), and a dose older than 30 half-lives
// (plus its rise time) is dropped for good — its share is below 1e-9, so the numbers do not change.
// level = all doses up to and at the sample; before = the doses strictly before it. Pure.
// sampleLevelsAt takes any sorted sample moments (DV-068: the 6 h grid plus every dose instant and Now,
// lib/serumModel curveSampleTimes); sampleLevels is the plain grid.
//
// Curve fixes 2 + 3 (1.3.1): with the model's own amountFraction (lib/halfLives) the level is a sum of
// exponentials — e^(−kd·t) for a first-order fall, kr/(kr − kd) · (e^(−kd·t) − e^(−kr·t)) for a modeled
// rise — so it is carried from one moment to the next in ONE pass over doses and samples together:
// A(t) = A(t′) · e^(−kd·(t − t′)) + the doses at t (and B the same with kr). Same numbers (every dose
// counts, none dropped), but the work is doses + samples instead of samples × the doses of the last 30
// half-lives — so the curve can take its full look-back (spec R15) and the extra drawing samples (the
// fast falls and dips) at no cost. Any other amountFraction (tests) takes the moving window below.
const halfLives = require('./halfLives');

const KR = {};
function riseRateOf(entry) {
  const key = entry.hours + ':' + entry.tmaxHours;
  return KR[key] || (KR[key] = halfLives.riseRate(entry.hours, entry.tmaxHours));
}

function sampleLevelsExp(sorted, doseMg, entry, times) {
  const kd = Math.LN2 / (entry.hours * 3600000); // per ms
  const kr = entry.tmaxHours ? riseRateOf(entry) / 3600000 : 0;
  const c = kr ? kr / (kr - kd) : 1;
  const n = times.length;
  const points = new Array(n);
  const pre = new Array(n);
  let A = 0, B = 0, at = null, j = 0;
  const go = (t) => {
    if (at !== null && t !== at) {
      const dt = t - at;
      A *= Math.exp(-kd * dt);
      if (kr) B *= Math.exp(-kr * dt);
    }
    at = t;
  };
  const value = () => doseMg * (kr ? c * (A - B) : A);
  for (let i = 0; i < n; i++) {
    const ts = times[i];
    while (j < sorted.length && sorted[j] < ts) { go(sorted[j]); A += 1; B += 1; j++; }
    go(ts);
    pre[i] = value();
    while (j < sorted.length && sorted[j] === ts) { A += 1; B += 1; j++; }
    points[i] = value();
  }
  return { points, pre };
}

function isSorted(a) {
  for (let i = 1; i < a.length; i++) if (a[i] < a[i - 1]) return false;
  return true;
}

function sampleLevelsAt(doses, doseMg, entry, times, amountFraction) {
  const sorted = [...doses].sort((a, b) => a - b);
  if (amountFraction === halfLives.amountFraction && entry && entry.hours > 0 && isSorted(times)) {
    return sampleLevelsExp(sorted, doseMg, entry, times);
  }
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
