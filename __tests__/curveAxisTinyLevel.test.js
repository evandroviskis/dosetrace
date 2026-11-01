'use strict';
// Simulator 2026-11-01 (evidence 7-curva-bpc-12h-dark, -24h-eixo-, -36h-eixo-): in hours mode the y-axis printed
// "000000" twice when the window held only the tail of an old BPC-157 dose (t½ 15 min: a dose 2 days earlier
// leaves ~1e-59 mg), while the header read "pico ≈ < 0,1". A-193 prints a small axis at its real values, but
// six decimals cannot write such a number. A level under a thousandth of the display unit in the whole window
// is nothing to draw: the window shows the empty-chart state (as with no dose; the no-study line stays).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getHalfLifeEntry } = require('../lib/halfLives');
const M = require('../lib/serumModel');

const H = 3600 * 1000;

test('a BPC-157 dose 2 days before a 12 h window: nothing to draw, no axis labels', () => {
  const entry = getHalfLifeEntry('BPC-157');
  const now = Date.parse('2026-11-01T12:00:00');
  const start = now - 6 * H, end = now + 6 * H;
  const dose = start - 48 * H;
  let max = 0;
  for (let ts = start; ts <= end; ts += 0.25 * H) max = Math.max(max, M.levelAt([dose], 0.25, entry, ts));
  assert.ok(max > 0 && max < 1e-12, `a tail above zero: ${max}`);
  const f = M.displayScale('mg', [0.25]).factor;
  assert.equal(f, 1000);
  // The defect: these ticks printed "0,000000" twice.
  const raw = M.curveTicks(max * f);
  assert.ok(raw.ticks.map((v) => M.axisLabel(v, 'pt', raw.ticks[1])).filter((l) => /^0,0+$/.test(l)).length >= 2);
  const drawn = M.curveDrawMax(max, f);
  assert.equal(drawn, 0, 'treated as an empty chart');
  assert.deepEqual(M.curveTicks(drawn * f).ticks, []);
});

test('every axis that is drawn prints distinct, real numbers (A-193 kept)', () => {
  for (const top of [M.CURVE_DRAW_FLOOR, 0.0012, 0.006, 0.012, 0.06, 0.3, 5, 250]) {
    assert.equal(M.curveDrawMax(top, 1), top, `${top} is drawn`);
    const tk = M.curveTicks(top);
    const labels = tk.ticks.map((v) => M.axisLabel(v, 'pt', tk.ticks[1]));
    assert.equal(new Set(labels).size, 3, labels.join(' | '));
    for (const l of labels.slice(1)) assert.ok(/[1-9]/.test(l), `${top}: ${l}`);
  }
  assert.equal(M.curveDrawMax(M.CURVE_DRAW_FLOOR * 0.99, 1), 0);
  // In mg with a mcg display: 0.06 mcg (A-193's example) is still drawn.
  assert.equal(M.curveDrawMax(0.00006, 1000), 0.00006);
  assert.equal(M.curveDrawMax(0, 1000), 0);
  assert.equal(M.curveDrawMax(NaN, 1000), 0);
});

test('wired: the curve model drops a window that holds nothing drawable', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/SerumCurveScreen.js'), 'utf8');
  // The no-study warning does not depend on a drawn level (2026-11-01).
  assert.match(src, /const noStudy = model \? noStudyWarning\(model\.series, \{ hourMode, t \}\) : null;/);
});

// Pharmacometrician council 2026-11-01: the floor was absolute in the SHARED display unit, so in a mixed mg selection
// (testosterone 100 mg + BPC-157 250 mcg) a BPC-157 line peaking at 0.5 mcg — the only level in the window — was
// blanked, although the same line draws alone (in mcg). The "nothing to draw" test is now per line, in the line's
// own unit (seriesLevelText's factor); the shared axis only needs numbers its six decimals can write
// (CURVE_AXIS_FLOOR), so it still never prints "0,000000".
test('mixed mg selection: a BPC-157 line peaking at 0.5 mcg is drawn, as it is alone', () => {
  const f = (doses) => M.displayScale('mg', doses).factor;
  const bpcPeak = 0.0005; // mg = 0.5 mcg
  assert.equal(M.curveDrawMax(bpcPeak, f([0.25])), bpcPeak, 'alone (mcg): drawn');
  const lines = [{ max: 0, factor: f([100]) }, { max: bpcPeak, factor: f([0.25]) }];
  assert.equal(M.curveDrawMax(bpcPeak, f([100, 0.25]), lines), bpcPeak, 'mixed (mg): drawn too');
  // the shared mg axis writes it with distinct, real numbers
  const tk = M.curveTicks(bpcPeak * f([100, 0.25]));
  const labels = tk.ticks.map((v) => M.axisLabel(v, 'pt', tk.ticks[1]));
  assert.equal(new Set(labels).size, 3, labels.join(' | '));
  for (const l of labels.slice(1)) assert.ok(/[1-9]/.test(l), l);
  // a truly empty window and an old tail stay empty in a mixed selection
  assert.equal(M.curveDrawMax(0, 1, [{ max: 0, factor: 1 }, { max: 0, factor: 1000 }]), 0);
  assert.equal(M.curveDrawMax(1e-59, 1, [{ max: 0, factor: 1 }, { max: 1e-59, factor: 1000 }]), 0);
  // a line under a thousandth of its own unit is nothing to draw, even beside an empty one
  assert.equal(M.curveDrawMax(0.9e-6, 1, [{ max: 0, factor: 1 }, { max: 0.9e-6, factor: 1000 }]), 0);
});

test('the shared axis never prints 0,000000: a drawn top is at least CURVE_AXIS_FLOOR in the shared unit', () => {
  assert.equal(M.CURVE_AXIS_FLOOR, 1e-5);
  // 0.002 mcg is drawable in its own unit, but an mg axis cannot write 2e-6 with six decimals: empty chart
  assert.equal(M.curveDrawMax(2e-6, 1, [{ max: 2e-6, factor: 1000 }]), 0);
  for (const top of [M.CURVE_AXIS_FLOOR, 1.3e-5, 4e-5, 2e-4]) {
    assert.equal(M.curveDrawMax(top, 1, [{ max: top, factor: 1000 }]), top, `${top} is drawn`);
    const tk = M.curveTicks(top);
    const labels = tk.ticks.map((v) => M.axisLabel(v, 'pt', tk.ticks[1]));
    assert.equal(new Set(labels).size, 3, labels.join(' | '));
    for (const l of labels.slice(1)) assert.ok(/[1-9]/.test(l), `${top}: ${l}`);
  }
});

test('wired: the screen judges each line (and each combined total) in its own unit', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /\.\.\.series\.map\(\(ser\) => \(\{ max: Math\.max\(0, \.\.\.ser\.points\), factor: lineFactor\(\[ser\.doseMg\]\) \}\)\)/);
  assert.match(src, /\.\.\.combined\.map\(\(c\) => \(\{ max: Math\.max\(0, \.\.\.c\.points\), factor: lineFactor\(c\.memberDoses\) \}\)\)/);
  assert.match(src, /max = curveDrawMax\(max, lineFactor\(series\.map\(\(ser\) => ser\.doseMg\)\), drawLines\);/);
});
