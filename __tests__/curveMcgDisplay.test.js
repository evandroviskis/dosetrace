'use strict';
// Council 2026-10-27 (pharmacometrician): a 100–300 mcg peptide read "< 0,1 mg" almost all the time on the
// hours curve. A compound dosed under 1 mg is shown in mcg (value × 1000) — every number on the curve and the
// Journey tile; the unit never switches as the level falls; several compounds use mcg only if all are. The
// math stays in mg; IU never changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { displayScale, levelLabel } = require('../lib/serumModel');

test('the rule', () => {
  assert.deepEqual(displayScale('mg', [0.25]), { unit: 'mcg', factor: 1000 });
  assert.deepEqual(displayScale('mg', [0.25, 0.5]), { unit: 'mcg', factor: 1000 });
  assert.deepEqual(displayScale('mg', [0.25, 100]), { unit: 'mg', factor: 1 }, 'one compound at 1 mg or more: mg');
  assert.deepEqual(displayScale('mg', [1]), { unit: 'mg', factor: 1 });
  assert.deepEqual(displayScale('IU', [0.5]), { unit: 'IU', factor: 1 });
  assert.deepEqual(displayScale('mg', []), { unit: 'mg', factor: 1 });
  assert.equal(levelLabel(0.042 * 1000, 'pt'), '42', '42 mcg, not "< 0,1 mg"');
});

test('wired: every number on the curve and the Journey tile goes through the scale', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /const disp = displayScale\(/);
  assert.match(src, /const mgLabel = \(v\) => levelLabel\(v \* dispF, language\);/);
  assert.match(src, /const unitLbl = unitText\(disp\.unit, language\);/);
  assert.match(src, /axisLabel\(v \* dispF, language\)/);
  assert.match(src, /const x = v \* dispF;/, 'the animated number too');
  const j = fs.readFileSync(path.join(__dirname, '../screens/JourneyScreen.js'), 'utf8');
  assert.match(j, /levelLabel\(level\.value \* level\.display\.factor, language\)/);
  assert.match(j, /unitText\(level\.display\.unit, language\)/);
});
