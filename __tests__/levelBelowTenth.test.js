'use strict';
// Council 2026-10-26 (pharmacometrician) + founder "Mostrar < 0,1 mg: ok" (2026-10-26 21:18 EDT):
// a level above zero that rounds to "0,0" said "nothing in the blood" — it prints "< 0,1" in the
// app language. Zero stays "0"; 0,05 and up keep one decimal.
const test = require('node:test');
const assert = require('node:assert/strict');
const { levelLabel } = require('../lib/serumModel');

test('a tiny positive level prints "< 0,1", never "0,0"', () => {
  assert.equal(levelLabel(0.03, 'pt'), '< 0,1');
  assert.equal(levelLabel(0.0001, 'en'), '< 0.1');
  assert.equal(levelLabel(0.049, 'de'), '< 0,1');
});

test('zero, 0.05 and up are unchanged', () => {
  assert.equal(levelLabel(0, 'pt'), '0');
  assert.equal(levelLabel(0.05, 'en'), '0.1');
  assert.equal(levelLabel(0.3, 'pt'), '0,3');
  assert.equal(levelLabel(12.4, 'pt'), '12');
});

// Council 2026-10-27: the axis follows the same rule — a grid line above zero never reads "0,0".
test('axis: above zero but under 0,05 reads "< 0,1"; zero stays 0,0', () => {
  const { axisLabel } = require('../lib/serumModel');
  assert.equal(axisLabel(0.03, 'pt'), '< 0,1');
  assert.equal(axisLabel(0.03, 'en'), '< 0.1');
  assert.equal(axisLabel(0, 'pt'), '0,0');
  assert.equal(axisLabel(0.05, 'pt'), '0,1');
  assert.equal(axisLabel(12.4, 'pt'), '12');
});

// Simulator 2026-10-27: the level stat under the curve read "0,0" while the header read "< 0,1" — the
// animated number follows the same rule.
test('stat card: the animated level reads "< 0,1" too', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /const numFmt = \(v\) => \{ 'worklet'; const x = v \* dispF; return !isFinite\(x\) \|\| x <= 0 \? '0' : x < 0\.05 \? '< 0' \+ decSep \+ '1' : /);
});

// A-193 (Fold, Gate S pass 2026-10-28): a curve whose whole window is under 0,05 drew two grid lines
// that both read "< 0,1" — two different values with the same number. When the axis's middle line is
// under 0,05, every line is printed with the decimals that make it its real value (precision
// principle, founder 2026-10-26): 0,03 / 0,06, never "< 0,1" twice.
test('A-193: a small axis prints each line at its real value, never the same label twice', () => {
  const { axisLabel, curveTicks } = require('../lib/serumModel');
  const t = curveTicks(0.06);
  const labels = t.ticks.map((v) => axisLabel(v, 'pt', t.ticks[1]));
  assert.deepEqual(labels, ['0,0', '0,03', '0,06']);
  const t2 = curveTicks(0.012);
  const l2 = t2.ticks.map((v) => axisLabel(v, 'en', t2.ticks[1]));
  assert.equal(new Set(l2).size, 3, l2.join(' | '));
  assert.equal(axisLabel(0.3, 'pt', 0.15), '0,3', 'a normal axis is unchanged');
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /axisLabel\(v \* dispF, language, ticksY\.ticks\[1\] \* dispF\)/);
});
