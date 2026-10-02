'use strict';
// Journey redesign parts 17-20 (founder 2026-10-02) + the 3-day window: the Dose accumulation
// curve. 17 Proposta: "Est. level · now" hero, legend, scheduled-dose ticks, three grid lines,
// "Now". 18 Proposta: the stats stay 34 pt. 19 Prototype: three upcoming-dose chips, "Other date"
// on the prototype wheel, the bloodwork chip. 20 Prototype: note + disclaimer.
// EXTRA (founder 2026-10-02): the curve opens on the last 3 days, not 14; an earlier date can
// still be picked (the chart then reaches back to it).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const curve = () => read('screens/SerumCurveScreen.js');
const serum = require('../lib/serumModel');

test('3-day window: the curve opens on the last 3 days', () => {
  assert.equal(serum.CURVE_DEFAULT_PAST_DAYS, 3);
  assert.equal(serum.curveWindowDays(null, '2026-10-02'), 3, 'no date chosen → 3 days');
  assert.equal(serum.curveWindowDays('2026-10-02', '2026-10-02'), 3, 'today → 3 days');
  assert.equal(serum.curveWindowDays('2026-10-15', '2026-10-02'), 3, 'a future date never shortens or widens the past');
  assert.equal(serum.curveWindowDays('2026-09-30', '2026-10-02'), 3, 'inside the 3 days → unchanged');
  const now = new Date(2026, 9, 2, 15, 0).getTime();
  const start = serum.curveGridStart(now, 3);
  assert.ok(now - start >= 3 * 86400000 && now - start < 3 * 86400000 + 6 * 3600000, 'grid starts 3 days back on the 6 h grid');
});

test('3-day window: picking an earlier date still works — the chart reaches back to it', () => {
  assert.equal(serum.curveWindowDays('2026-09-18', '2026-10-02'), 15, '14 days back + 1');
  assert.equal(serum.curveWindowDays('2026-08-20', '2026-10-02'), 44);
  assert.equal(serum.curveWindowDays('2020-01-01', '2026-10-02'), serum.CURVE_MAX_PAST_DAYS, 'capped');
  const src = curve();
  assert.match(src, /const pastDays = curveWindowDays\(readoutDate, todayISO\(\)\);/);
  assert.match(src, /const start = curveGridStart\(now, pastDays\);/);
  assert.match(src, /\[protocols, selectedIds, t, colors\.data, showCombined, futureDays, pastDays\]/, 'the model follows the window');
  assert.match(src, /t\('curve_last_days'\)\} \{pastDays\}d/, 'the range line names the real window');
  assert.match(src, /−\{pastDays\}d/, 'the axis names the real window');
});

test('3-day window: the estimate itself never changes — doses before the window still count', () => {
  const p = { id: 1, type: 'recon', name: 'Testosterone Cypionate', compound_id: null, dose: 100, dose_unit: 'mg', frequency: 'weekly', start_date: '2026-06-01', interval_days: 7 };
  const { getHalfLifeEntry } = require('../lib/halfLives');
  const entry = getHalfLifeEntry(serum.matchName(p));
  const now = new Date(2026, 9, 2, 15, 0).getTime();
  const end = now + 7 * 86400000;
  const d14 = serum.scheduledDoses(p, entry, serum.curveGridStart(now), end, now);
  const d3 = serum.scheduledDoses(p, entry, serum.curveGridStart(now, 3), end, now);
  // The same doses (grid-snapped the same way) → the same level at any moment in the window.
  for (const T of [now, now - 2 * 86400000, now + 5 * 86400000]) {
    assert.ok(Math.abs(serum.levelAt(d14, 100, entry, T) - serum.levelAt(d3, 100, entry, T)) < 1e-9);
  }
  assert.equal(serum.estimatedLevelNow(p, now).value, serum.levelAt(d14, 100, entry, now), 'the Journey tile number is unchanged');
});

test('Part 17: "Est. level · now" leads the chart card for one compound, with the Estimated chip', () => {
  const src = curve();
  assert.match(src, /t\('curve_level_now'\)/);
  assert.match(src, /style=\{\[s\.heroNum, \{ color: colors\.data \}\]\}/);
  const hero = src.indexOf("t('curve_level_now')");
  const range = src.indexOf("t('curve_last_days')");
  assert.ok(hero > 0 && range > hero, 'the hero comes before the range line');
});

test('Part 17: three grid lines (0, half the peak, the peak; top = peak × 1.12), labels with one decimal ("0.0")', () => {
  const { curveTicks, axisLabel } = serum;
  assert.deepEqual(curveTicks(0.5), { top: 0.5 * 1.12, ticks: [0, 0.25, 0.5] });
  assert.equal(axisLabel(0), '0.0');
  assert.equal(axisLabel(0.25), '0.3');
  assert.equal(axisLabel(122.4), '122');
  const src = curve();
  assert.match(src, /const ticksY = curveTicks\(model \? model\.max : 0\);/);
  assert.doesNotMatch(src, /function yTicks\(\)/, 'no step-by-step grid any more');
});

test('Part 17: legend (estimate · projection · scheduled doses) and a tick under the axis per scheduled dose', () => {
  const src = curve();
  for (const k of ["t('curve_lg_estimate')", "t('curve_lg_projection')", "t('curve_lg_doses')"]) assert.ok(src.includes(k), k);
  assert.match(src, /y1=\{PLOT_BOTTOM \+ 2\} x2=\{x\} y2=\{PLOT_BOTTOM \+ 7\}/);
  assert.match(src, /\{t\('curve_now'\)\}/, 'A-73: "Now", not "NOW"');
});

test('Part 18: the three stats stay at 34 pt (Q12 = B)', () => {
  const src = curve();
  assert.match(src, /statNum: \{ fontSize: 34,/);
});

test('Part 19: three upcoming-dose chips, Other date on the prototype wheel, the bloodwork chip (no icons)', () => {
  const src = curve();
  assert.match(src, /upcoming\.slice\(0, 3\)\.map/);
  assert.match(src, /t\('curve_other_date'\)/);
  assert.match(src, /<DTPickerSheet visible=\{showReadoutPicker\} title=\{t\('curve_readout_title'\)\}/);
  assert.match(src, /<DTWheel/);
  assert.match(src, /t\('curve_bloodwork_chip'\)\.replace\('\{date\}'/);
  assert.doesNotMatch(src, /@react-native-community\/datetimepicker/, 'no system date picker');
  assert.doesNotMatch(src, /name="droplet"/, 'the bloodwork chip is text only');
  assert.match(src, /readoutDate \? \(/, 'the estimate rows show once a date is chosen');
});

test('Part 19: upcoming dose days come from the schedule (next 3 distinct days after now)', () => {
  const p = { id: 1, type: 'recon', name: 'Testosterone Cypionate', compound_id: null, dose: 100, dose_unit: 'mg', frequency: 'weekly', start_date: '2026-09-03', interval_days: 7 };
  const now = new Date(2026, 9, 2, 15, 0).getTime();
  const days = serum.upcomingDoseDays([p], now, 3);
  assert.equal(days.length, 3);
  for (const d of days) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(days[0] > '2026-10-02' || days[0] === '2026-10-02');
  assert.deepEqual([...days].sort(), days, 'in order');
  assert.equal(new Set(days).size, 3, 'distinct days');
});

test('Part 20: the notes card and the disclaimer stay; cards are the prototype .pc (radius 24, padding 18, gap 12)', () => {
  const src = curve();
  assert.match(src, /card: \{ backgroundColor: c\.raised, borderRadius: 24, padding: 18, gap: 12 \}/);
  assert.match(src, /t\('curve_disclaimer'\)/);
  assert.match(src, /tierCfg\[ser\.entry\.tier\]/);
});

test('Curve file parses, theme tokens only, no emoji', () => {
  const { parse } = require('@babel/parser');
  const src = curve();
  assert.doesNotThrow(() => parse(src, { sourceType: 'module', plugins: ['jsx'] }));
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/);
  assert.doesNotMatch(src, /\p{Extended_Pictographic}/u);
});
