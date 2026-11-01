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
  assert.match(src, /max = curveDrawMax\(max, displayScale\(series\[0\] \? series\[0\]\.unit : 'mg', series\.map\(\(ser\) => ser\.doseMg\)\)\.factor\);/);
  // The no-study warning does not depend on a drawn level (2026-11-01).
  assert.match(src, /const noStudy = model \? noStudyWarning\(model\.series, \{ hourMode, t \}\) : null;/);
});
