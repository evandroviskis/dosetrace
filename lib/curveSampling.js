'use strict';
// The curve's level at every sample (A-93, senior review 2026-10-04). Doses are walked sorted with a
// moving window: a dose after the sample is never visited (break), and a dose older than 30 half-lives
// (plus its rise time) is dropped for good — its share is below 1e-9, so the numbers do not change.
// level = all doses up to and at the sample; before = the doses strictly before it. Pure.
// sampleLevelsAt takes any sorted sample moments (DV-068: the 6 h grid plus every dose instant and Now,
// lib/serumModel curveSampleTimes); sampleLevels is the plain grid.
function sampleLevelsAt(doses, doseMg, entry, times, amountFraction) {
  const sorted = [...doses].sort((a, b) => a - b);
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
