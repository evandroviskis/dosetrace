'use strict';
// The curve's level at every sample (A-93, senior review 2026-10-04). Doses are walked sorted with a
// moving window: a dose after the sample is never visited (break), and a dose older than 30 half-lives
// (plus its rise time) is dropped for good — its share is below 1e-9, so the numbers do not change.
// level = all doses up to and at the sample; before = the doses strictly before it. Pure.
function sampleLevels(doses, doseMg, entry, start, stepMs, nSteps, amountFraction) {
  const sorted = [...doses].sort((a, b) => a - b);
  const horizonMs = (30 * entry.hours + (entry.tmaxHours || 0) * 3) * 3600000;
  const points = new Array(nSteps + 1);
  const pre = new Array(nSteps + 1);
  let lo = 0;
  for (let i = 0; i <= nSteps; i++) {
    const ts = start + i * stepMs;
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

module.exports = { sampleLevels };
