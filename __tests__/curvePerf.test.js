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
