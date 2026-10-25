'use strict';
// 1.3.1 code review (DV-068 follow-up): sampling every line at EVERY line's dose instants made the
// curve 2–5x slower than before (one shared sample list; a long ester visits ~240 days of doses at
// each sample). Fix: each line is sampled only at its own dose instants (+ the 6 h grid + Now); a
// compound with a modeled rise (entry.tmaxHours) adds no instants (its rise starts at 0 — no jump to
// draw); past ~30 days the instants are merged to the chart's pixel resolution. Dense case from the
// review bench: 365 days back + 90 ahead, 4 protocols × 4 doses a day. The numbers shown (Est. level
// now, the date estimate) stay exact: they come from levelAt, never from the samples.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');
const { sampleLevelsAt } = require('../lib/curveSampling');

const now = new Date(2026, 9, 20, 13, 7).getTime();
const stepMs = M.STEP_HOURS * 3600e3;
const PLOT_PX = 330;
const sd = new Date(now - 500 * 864e5).toISOString().slice(0, 10);
const mk = (name, times) => ({ id: name, name, type: 'recon', dose: '1', dose_unit: 'mg', doses_per_day: 4, interval_days: 1, start_date: sd, reminder_time: times, created_at: new Date(now - 400 * 864e5).toISOString() });
const DENSE = [mk('BPC-157', '07:00,11:00,15:00,19:00'), mk('Testosterone Cypionate', '07:30,11:30,15:30,19:30'), mk('TB-500', '08:10,12:10,16:10,20:10'), mk('Semaglutide', '09:05,13:05,17:05,21:05')];

function visits(doses, entry, times) {
  const hz = (30 * entry.hours + (entry.tmaxHours || 0) * 3) * 3600e3;
  const s = [...doses].sort((a, b) => a - b);
  let c = 0;
  for (const ts of times) for (const d of s) { if (d > ts) break; if (ts - d <= hz) c++; }
  return c;
}

function lines(pastDays, futureDays) {
  const start = M.curveGridStart(now, pastDays);
  const end = now + futureDays * 864e5;
  const nSteps = Math.round((end - start) / stepMs);
  const grid = Array.from({ length: nSteps + 1 }, (_, i) => start + i * stepMs);
  return DENSE.map((p) => {
    const entry = H.getHalfLifeEntry(M.matchName(p));
    const doses = M.scheduledDoses(p, entry, start, end, now);
    const instants = M.curveDoseInstants(doses, entry, start, start + nSteps * stepMs, PLOT_PX);
    const times = M.curveSampleTimes(start, stepMs, nSteps, [instants], now);
    return { p, entry, doses, instants, times, grid, start, nSteps };
  });
}

test('dense 365 + 90 days: dose visits stay within 1.25x of the plain 6 h grid, samples per line ≤ grid + plot pixels + 1', () => {
  const ls = lines(365, 90);
  let vNew = 0, vGrid = 0, samples = 0;
  for (const l of ls) {
    vNew += visits(l.doses, l.entry, l.times);
    vGrid += visits(l.doses, l.entry, l.grid);
    samples += l.times.length;
    assert.ok(l.times.length <= l.nSteps + 1 + PLOT_PX + 1, `${l.p.name}: ${l.times.length} samples`);
  }
  assert.ok(vNew <= 1.25 * vGrid, `dose visits ${vNew} vs grid ${vGrid}`);
  assert.ok(vNew < 3.2e6, `dose visits ${vNew}`);
  assert.ok(samples <= 4 * (ls[0].nSteps + 1) + 2 * PLOT_PX + 4, `samples ${samples}`);
});

// ── Curve fixes 2 + 3 (1.3.1): the full look-back (spec R15) and the drawing samples ───────────
// Each line is now also sampled on the pixel edges of its fast falls, at the bottom of each pixel
// (merged windows, and every dose dip of a long rise) — lib/serumModel curveDecaySamples /
// curveTroughInstants — and scans 365 days + 6 half-lives back (capped 600). The level at the samples
// is carried in one pass (lib/curveSampling, the model's own amountFraction): the work is doses +
// samples, not samples × the doses of the last 30 half-lives.
function realLines(pastDays, futureDays) {
  const start = M.curveGridStart(now, pastDays);
  const end = now + futureDays * 864e5;
  const nSteps = Math.round((end - start) / stepMs);
  const ctx = { start, stepMs, nSteps, now, plotPx: PLOT_PX, extraTimes: [] };
  const grid = Array.from({ length: nSteps + 1 }, (_, i) => start + i * stepMs);
  return DENSE.map((p) => {
    const entry = H.getHalfLifeEntry(M.matchName(p));
    const doses = M.scheduledDoses(p, entry, start, end, now);
    return { p, entry, doses, grid, nSteps, ctx };
  });
}
function countExp(fn) {
  const exp = Math.exp;
  let n = 0;
  Math.exp = (x) => { n++; return exp(x); };
  try { return { out: fn(), calls: n }; } finally { Math.exp = exp; }
}

for (const [pastDays, futureDays] of [[3, 7], [30, 7], [90, 30], [365, 90]]) {
  const dense = pastDays === 365;
  test(`dense ${pastDays} + ${futureDays} days, the real samples: ${dense ? 'dose visits within 1.25x of the 6 h grid, ' : ''}≤ 3 extra samples per plot pixel, work = one pass`, () => {
    const ls = realLines(pastDays, futureDays);
    let vNew = 0, vGrid = 0, items = 0;
    const { calls } = countExp(() => {
      for (const l of ls) l.s = M.lineSamples(l.doses, 1, l.entry, l.ctx, H.amountFraction);
    });
    for (const l of ls) {
      vNew += visits(l.doses, l.entry, l.s.times);
      vGrid += visits(l.doses, l.entry, l.grid);
      items += l.doses.length + l.s.times.length;
      assert.ok(l.s.times.length <= l.nSteps + 1 + 3 * PLOT_PX + 2, `${l.p.name}: ${l.s.times.length} samples`);
    }
    // the review's budget, on the review's dense case, now with every real sample (it counts what
    // the old moving window would visit — an upper bound on the one pass)
    if (dense) assert.ok(vNew <= 1.25 * vGrid, `dose visits ${vNew} vs grid ${vGrid}`);
    // one pass: at most 2 exponentials per dose or sample (fall + rise), plus the per-pixel dip choice
    assert.ok(calls <= 4 * items, `Math.exp calls ${calls} vs ${items} doses + samples`);
    assert.ok(calls < 60000, `Math.exp calls ${calls}`);
  });
}

test('a compound with a modeled rise adds no dose instants; a fast one keeps them', () => {
  for (const l of lines(3, 7)) {
    if (l.entry.tmaxHours) assert.equal(l.instants.length, 0, l.p.name);
    else assert.ok(l.instants.length >= 4 * 10, `${l.p.name}: every dose of a short window is a sample`);
  }
});

test('≤ 30 days: every dose instant is kept; > 30 days: at most one per plot pixel', () => {
  const short = lines(30, 0).find((l) => l.p.name === 'BPC-157');
  assert.deepEqual(short.instants, short.doses.filter((d) => d >= short.start && d <= short.start + short.nSteps * stepMs));
  const long = lines(365, 90).find((l) => l.p.name === 'BPC-157');
  assert.ok(long.instants.length <= PLOT_PX, `${long.instants.length} instants`);
  const px = (long.nSteps * stepMs) / PLOT_PX;
  const buckets = long.instants.map((d) => Math.floor((d - long.start) / px));
  assert.equal(new Set(buckets).size, buckets.length, 'one instant per pixel');
});

test('the numbers stay exact: Now is a sample and carries the Est. level', () => {
  for (const l of lines(365, 90)) {
    const { points } = sampleLevelsAt(l.doses, 1, l.entry, l.times, H.amountFraction);
    const k = l.times.indexOf(now);
    assert.ok(k >= 0, 'Now is a sample');
    const exact = M.levelAt(l.doses, 1, l.entry, now);
    // the drawing drops doses older than 30 half-lives (A-93): below 1e-6 of the level
    assert.ok(Math.abs(points[k] - exact) <= 1e-6 * Math.max(1, exact), `${l.p.name}`);
  }
});

// ── Re-review 2026-10-20 ──────────────────────────────────────────────────────────────────────
const ctxFor = (pastDays, futureDays, extraTimes = []) => {
  const start = M.curveGridStart(now, pastDays);
  const nSteps = Math.round((now + futureDays * 864e5 - start) / stepMs);
  return { start, stepMs, nSteps, now, plotPx: PLOT_PX, extraTimes };
};
function countingAf() {
  const af = (e, dt) => { af.calls++; return H.amountFraction(e, dt); };
  af.calls = 0;
  return af;
}
function member(p, ctx, af) {
  const entry = H.getHalfLifeEntry(M.matchName(p));
  const doses = M.scheduledDoses(p, entry, ctx.start, ctx.start + ctx.nSteps * stepMs, now);
  return { doses, doseMg: 1, entry, ...M.lineSamples(doses, 1, entry, ctx, af) };
}

test('combined total of two rise-time esters (365 + 90 days) sampled at the same moments: no second sampling pass, the sum of the member lines', () => {
  const ctx = ctxFor(365, 90);
  // UPDATED 1.3.1 (curve fix 3): a long rise now samples its dose dips, so two esters share their
  // sample moments when they share their dose times (here two daily 07:30 protocols).
  const cyp = [mk('Testosterone Cypionate', '07:30'), mk('Testosterone Cypionate', '07:30')].map((p, i) => ({ ...p, id: 'c' + i, doses_per_day: 1 }));
  const members = cyp.map((p) => member(p, ctx));
  assert.deepEqual(members[0].times, members[1].times);
  const af = countingAf();
  const c = M.combinedLine(members, ctx, af);
  assert.equal(af.calls, 0, 'no re-sampling when the members share their sample moments');
  assert.deepEqual(c.xs, members[0].xs);
  for (let i = 0; i < c.points.length; i += 97) assert.equal(c.points[i], members[0].points[i] + members[1].points[i]);
});

test('combined total of two rise-time esters at different times (07:30 / 19:30): each member is computed only at the moments it lacks', () => {
  const ctx = ctxFor(365, 90);
  const cyp = [mk('Testosterone Cypionate', '07:30'), mk('Testosterone Cypionate', '19:30')].map((p, i) => ({ ...p, id: 'c' + i, doses_per_day: 1 }));
  const members = cyp.map((p) => member(p, ctx));
  const af = countingAf();
  const c = M.combinedLine(members, ctx, af);
  // the union of the members' moments, every member counted at each — exact
  assert.deepEqual(c.times, [...new Set([...members[0].times, ...members[1].times])].sort((a, b) => a - b));
  for (let i = 0; i < c.times.length; i += 37) {
    const exact = members.reduce((s, m) => s + M.levelAt(m.doses, 1, m.entry, c.times[i]), 0);
    assert.ok(Math.abs(c.points[i] - exact) <= 1e-9 * Math.max(1, exact), `sample ${i}`);
  }
  // a full second pass (every member at every moment) would cost this much
  const full = countingAf();
  for (const m of members) sampleLevelsAt(m.doses, 1, m.entry, c.times, full);
  assert.ok(af.calls <= 0.25 * full.calls, `${af.calls} vs a full pass ${full.calls}`);
});

test('combined total of members with instants is sampled at their instants together, once', () => {
  const ctx = ctxFor(3, 7);
  const fast = [mk('BPC-157', '08:00'), mk('BPC-157', '20:00')].map((p, i) => ({ ...p, id: 'b' + i, doses_per_day: 1 }));
  const members = fast.map((p) => member(p, ctx));
  const c = M.combinedLine(members, ctx);
  for (const m of members) for (const d of m.instants) assert.ok(c.times.includes(d));
  const k = c.times.indexOf(members[0].instants[1]);
  const exact = M.levelAt(members[0].doses, 1, members[0].entry, c.times[k]) + M.levelAt(members[1].doses, 1, members[1].entry, c.times[k]);
  assert.ok(Math.abs(c.points[k] - exact) < 1e-9);
});

test('the screen computes the combined totals only while Combined is shown', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'screens', 'SerumCurveScreen.js'), 'utf8');
  assert.match(src, /const combined = !showCombined \? \[\] : Object\.entries\(bySubstance\)/);
  assert.match(src, /combinedLine\(members, ctx, amountFraction\)/);
  assert.match(src, /lineSamples\(doses, doseMg, entry, ctx, amountFraction\)/);
  // the Combined toggle itself still shows while the total is off (a same-substance group exists)
  assert.match(src, /\{model && model\.hasGroups && \(/);
  assert.match(src, /const hasGroups = Object\.values\(bySubstance\)\.some\(members => members\.length >= 2\);/);
});

test('only a LONG rise (≥ 36 h) skips the dose instants; a short rise still samples them', () => {
  const s = M.curveGridStart(now, 3), e = now + 7 * 864e5;
  const doses = [now - 864e5, now - 3600e3];
  assert.deepEqual(M.curveDoseInstants(doses, { hours: 4, tmaxHours: 2 }, s, e, PLOT_PX), doses);
  assert.deepEqual(M.curveDoseInstants(doses, { hours: 4, tmaxHours: 35.9 }, s, e, PLOT_PX), doses);
  assert.deepEqual(M.curveDoseInstants(doses, { hours: 192, tmaxHours: 36 }, s, e, PLOT_PX), []);
  assert.equal(M.LONG_RISE_HOURS, 36);
});

test('per-pixel thinning keeps the dose with the HIGHEST level in each pixel (TB-500 08:00 / 08:30)', () => {
  const ctx = ctxFor(365, 90);
  const p = { ...mk('TB-500', '08:00,08:30'), doses_per_day: 2 };
  const entry = H.getHalfLifeEntry(M.matchName(p));
  const end = ctx.start + ctx.nSteps * stepMs;
  const doses = M.scheduledDoses(p, entry, ctx.start, end, now);
  const kept = M.curveDoseInstants(doses, entry, ctx.start, end, PLOT_PX);
  const px = (end - ctx.start) / PLOT_PX;
  const bucket = (d) => Math.min(PLOT_PX - 1, Math.floor((d - ctx.start) / px));
  const inWin = doses.filter((d) => d >= ctx.start && d <= end);
  for (const k of kept) {
    const lk = M.levelAt(doses, 1, entry, k);
    for (const d of inWin) if (bucket(d) === bucket(k)) assert.ok(lk >= M.levelAt(doses, 1, entry, d) - 1e-9, new Date(k).toString());
  }
  // the 08:30 dose (on top of the 08:00 one) is the one kept
  assert.ok(kept.filter((d) => new Date(d).getMinutes() === 30).length > kept.length / 2);
});

test('the date estimate is a sample, so its dot sits on the drawn line (across 2026-11-01)', () => {
  const T = M.readoutMoment('2026-11-01', '2026-11-06', new Date(2026, 10, 6, 9).getTime());
  const ctx = { ...ctxFor(10, 20), extraTimes: [T] }; // the window runs across the US clock change
  for (const p of [{ ...mk('Semaglutide', '09:05'), doses_per_day: 1 }, { ...mk('TB-500', '10:10'), doses_per_day: 1 }]) {
    const m = member(p, ctx);
    const k = m.times.indexOf(T);
    assert.ok(k >= 0, `${p.name}: the readout moment is a sample`);
    assert.ok(Math.abs(m.points[k] - M.levelAt(m.doses, 1, m.entry, T)) < 1e-6, p.name);
  }
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'screens', 'SerumCurveScreen.js'), 'utf8');
  assert.match(src, /extraTimes: \[readoutAt\]/);
});
