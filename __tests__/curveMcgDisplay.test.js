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
  assert.match(src, /const unitLbl = unitText\(disp\.unit, language\);/);
  assert.match(src, /axisLabel\(v \* dispF, language, ticksY\.ticks\[1\] \* dispF\)/); // A-193: the middle line sets the decimals
  assert.match(src, /const x = v \* dispF;/, 'the animated number too');
  const j = fs.readFileSync(path.join(__dirname, '../screens/JourneyScreen.js'), 'utf8');
  // DB-9: the tile reads the body level, scaled by its own dose (lib/doseInBody displayOf: mcg under 1 mg)
  assert.match(j, /bodyLevelParts\(level\.body, \{ t, language, unit: level\.unit, parent: level\.parent, doses: \[level\.doseInUnit\] \}\)/);
});

// Pharmacometrician 2026-11-01: with several compounds the axis keeps the shared unit, but each compound's own
// number (legend, readout rows) uses ITS unit. BPC-157 250 mcg + TB-500 2 mg, 2 h after both doses: BPC reads
// "16 mcg" (true 15.6 mcg), never "< 0,1 mg"; TB-500 keeps mg. A combined line uses mcg only if all its members do.
test('mixed selection: each compound\'s number in its own unit', () => {
  const { seriesLevelText } = require('../lib/serumModel');
  assert.equal(typeof seriesLevelText, 'function');
  assert.deepEqual(seriesLevelText(0.0156, 'mg', [0.25], 'pt'), { num: '16', unit: 'mcg' });
  assert.deepEqual(seriesLevelText(1.0, 'mg', [2], 'pt'), { num: '1,0', unit: 'mg' });
  assert.deepEqual(seriesLevelText(0.5, 'mg', [0.25, 2], 'pt'), { num: '0,5', unit: 'mg' }, 'a combined line with a 2 mg member stays in mg');
  assert.deepEqual(seriesLevelText(3, 'IU', [3], 'en'), { num: '3.0', unit: 'IU' });
  // Pharmacometrician council 2026-11-01: the unit came from the dose only, so a 2 mg dose decayed to 40 mcg read
  // "< 0,1 mg". A number that would print "< 0,1" in mg prints in mcg instead (IU never changes; the axis keeps
  // the shared unit).
  assert.deepEqual(seriesLevelText(0.04, 'mg', [2], 'pt'), { num: '40', unit: 'mcg' });
  assert.deepEqual(seriesLevelText(0.0156, 'mg', [0.25, 2], 'pt'), { num: '16', unit: 'mcg' }, 'a combined line too');
  assert.deepEqual(seriesLevelText(0.0012, 'mg', [2], 'en'), { num: '1.2', unit: 'mcg' });
  assert.deepEqual(seriesLevelText(0.05, 'mg', [2], 'pt'), { num: '0,1', unit: 'mg' }, 'from 0.05 mg it prints in mg');
  assert.deepEqual(seriesLevelText(1e-8, 'mg', [2], 'pt'), { num: '< 0,1', unit: 'mcg' }, 'below 0.05 mcg: "< 0,1 mcg"');
  assert.deepEqual(seriesLevelText(0, 'mg', [2], 'pt'), { num: '0', unit: 'mg' }, 'zero keeps its unit');
  assert.deepEqual(seriesLevelText(0.01, 'IU', [3], 'en'), { num: '< 0.1', unit: 'IU' });
  const src = fs.readFileSync(path.join(__dirname, '../screens/SerumCurveScreen.js'), 'utf8');
  // legend rows, the "now" readout rows and the scrub readout rows read per series (DB-9: the body level, each
  // in the unit of its own dose)
  assert.ok((src.match(/bodyText\(ser, /g) || []).length >= 3, 'per-series rows use bodyText');
  assert.match(src, /doses: ser\.memberDoses \|\| \[ser\.doseMg\]/);
  assert.ok(!/mgLabel\(ser\.nowLevel\)/.test(src), 'no per-series row uses the shared unit');
  assert.ok(!/mgLabel\(readoutLevel\(ser, readoutT\)\)/.test(src));
});
