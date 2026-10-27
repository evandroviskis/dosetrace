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
  assert.match(src, /const numFmt = \(v\) => \{ 'worklet'; return !isFinite\(v\) \|\| v <= 0 \? '0' : v < 0\.05 \? '< 0' \+ decSep \+ '1' : /);
});
