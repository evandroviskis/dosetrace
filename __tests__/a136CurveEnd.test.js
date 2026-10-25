'use strict';
// A-136 (5) — guided device session 2026-10-17 (Fold7 unfolded, TB-500, pt): the dose
// accumulation chart at +7d showed the dashed projection and the shaded zone stopping ~2 days
// before the axis end ("+7d") while the scheduled-dose ticks ran on to the edge; at +30d the
// chart filled the width.
// Investigation: the time → x mapping is one and the same for the ticks, the zone and the lines
// (the +7d geometry below lands the last sample, the zone and the last tick on the plot's right
// edge at the Fold width). The capture shows the line ending MID-DECAY at a fractional sample:
// only the opening moment's reveal clock draws that (revealAt during the projection phase; the
// zone opens with the same eased fraction, and both stopped at ~67%). Switching to +30d calls
// finishIntro, which sets the clock to its end, so +30d was always full. Cause: the end of the
// opening moment relied on the UI-thread withTiming reaching C_TOTAL; the JS timer that closes
// the moment never set the clock, so an animation that was dropped or interrupted before its last
// frame (a capture taken during the reveal shows the same picture) left the projection half drawn.
// Fix: the timer that ends the opening moment also lands the clock on its end (cancelAnimation +
// C_TOTAL), so the chart always settles full width.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { curveGridStart, scheduledDoses, curveSampleTimes, STEP_HOURS } = require('../lib/serumModel');
const { getHalfLifeEntry, amountFraction } = require('../lib/halfLives');
const { sampleLevelsAt } = require('../lib/curveSampling');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'screens/SerumCurveScreen.js'), 'utf8');

// revealAt + seriesD + the timeline, straight from the screen (worklets are plain functions).
const motion = (() => {
  const a = SRC.indexOf('const C_DRAW');
  const b = SRC.indexOf('function levelAtStep(');
  assert.ok(a > 0 && b > a, 'the timeline block');
  const ease = 'const eInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2; const eOutCubic = (t) => 1 - Math.pow(1 - t, 3);';
  // eslint-disable-next-line no-new-func
  return new Function(`${ease}\n${SRC.slice(a, b)}\nreturn { revealAt, seriesD, C_DRAW, C_RISE, C_PROJ, C_TOTAL };`)();
})();

const DAY = 24 * 3600 * 1000;
const lastX = (d) => Number(d.trim().split(/\s+/).slice(-2)[0]);

test('A-136 (5): at +7d on the Fold page the projection, the zone and the ticks end on the same right edge', () => {
  const now = new Date(2026, 9, 17, 0, 3).getTime();
  const pastDays = 3, futureDays = 7;
  const stepMs = STEP_HOURS * 3600 * 1000;
  const start = curveGridStart(now, pastDays);
  const end = now + futureDays * DAY;
  const nSteps = Math.round((end - start) / stepMs);
  const entry = getHalfLifeEntry('TB-500');
  const p = { id: 1, dose: '0.5', dose_unit: 'mg', interval_days: 1, doses_per_day: 1, start_date: '2026-09-01', type: 'lyophilized' };
  const doses = scheduledDoses(p, entry, start, end, now);
  assert.ok(doses.filter((ts) => ts > now && ts <= end).length >= 6, 'a daily dose on each projected day');
  // DV-068 (1.3.1): the samples are the 6 h grid plus every dose instant and Now (x = exact step position).
  const times = curveSampleTimes(start, stepMs, nSteps, [doses], now);
  const xs = times.map((ts) => (ts - start) / stepMs);
  const { points, pre } = sampleLevelsAt(doses, 0.5, entry, times, amountFraction);
  assert.equal(points.length, times.length, 'a level for every sample');
  assert.equal(xs[xs.length - 1], nSteps, 'the last sample is the end of the window');

  const windowWidth = 767; // the unfolded Fold, full-screen curve
  const chartWidth = Math.min(windowWidth, 640) - 32 - 32;
  const g = { L: 38, R: chartWidth, T: 8, B: 210 };
  const nowIdx = (now - start) / stepMs; // Now is a sample (DV-068)
  const rev = motion.revealAt(motion.C_TOTAL, nowIdx, nSteps);
  assert.equal(rev, nSteps, 'the settled reveal is the whole window');
  const d = motion.seriesD(points, pre, xs, rev, nSteps, 0.6, g, nowIdx);
  assert.equal(lastX(d), g.R, `the dashed projection ends at the right edge (${lastX(d)} of ${g.R})`);
  // the ticks: every scheduled dose inside the window maps inside the plot
  const tickX = doses.filter((ts) => ts >= start && ts <= start + nSteps * stepMs)
    .map((ts) => g.L + ((ts - start) / stepMs / nSteps) * (g.R - g.L));
  assert.ok(Math.max(...tickX) <= g.R, 'no tick past the edge');
});

test('A-136 (5): mid-reveal is exactly the picture captured (the line stops mid-decay, short of the edge)', () => {
  const t = motion.C_DRAW + motion.C_RISE + motion.C_PROJ * 0.3;
  const rev = motion.revealAt(t, 12, 40);
  assert.ok(rev > 12 && rev < 40 && !Number.isInteger(rev), `a fractional reveal ${rev}`);
});

test('A-136 (5): the end of the opening moment always lands the clock on its end', () => {
  const m = SRC.match(/introTimerRef\.current = setTimeout\(\(\) => \{([^\n]*)\}, C_TOTAL \+ 50\);/);
  assert.ok(m, 'the timer that ends the opening moment');
  assert.match(m[1], /cancelAnimation\(clock\); clock\.value = C_TOTAL;/, 'it sets the clock to the end, not only the JS flags');
  assert.match(m[1], /introDoneRef\.current = true; setIntroFx\(null\);/);
});
