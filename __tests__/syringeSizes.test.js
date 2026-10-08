'use strict';
// AP-21 (founder 2026-10-02): 2, 3 and 5 ml syringes join 0.3, 0.5 and 1 ml in the
// Ready-to-use size picker ONLY (powders adjust the water instead). Larger syringes are
// marked in ml, so with them the draw and the drawn syringe show ml. Picker = option B:
// one row showing the chosen syringe that opens a grouped list (insulin syringes · marked
// in units / larger syringes · marked in ml).
// AP-23: a dose under 10 units on an insulin syringe gets a neutral fact, never advice.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { computeDraw } = require('../lib/doseMath');
const S = require('../lib/syringes');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

test('AP-21: sizes are stored as units on the U-100 scale (2 ml = 200)', () => {
  assert.deepEqual(S.INSULIN_SIZES, [30, 50, 100]);
  assert.deepEqual(S.ML_SIZES, [200, 300, 500]);
  assert.equal(S.syringeMl(30), 0.3);
  assert.equal(S.syringeMl(300), 3);
  assert.equal(S.isMlSyringe(100), false);
  assert.equal(S.isMlSyringe(200), true);
  assert.equal(S.isMlSyringe(null), false);
});

test('AP-21: the larger syringes are offered for Ready to use only', () => {
  assert.deepEqual(S.syringeGroups('rtu').map((g) => g.sizes), [[30, 50, 100], [200, 300, 500]]);
  assert.deepEqual(S.syringeGroups('recon').map((g) => g.sizes), [[30, 50, 100]]);
  assert.deepEqual(S.syringeGroups('oral'), []);
  assert.deepEqual(S.syringeGroups('rtu').map((g) => g.titleKey), ['ap_syr_group_insulin', 'ap_syr_group_ml']);
  // A powder protocol can never be set to an ml syringe.
  assert.equal(S.allowedSyringe('recon', 300), 100);
  assert.equal(S.allowedSyringe('recon', 50), 50);
  assert.equal(S.allowedSyringe('rtu', 300), 300);
  assert.equal(S.allowedSyringe('rtu', 7), 100);
});

test('AP-21: the 1.68 ml NAD+ draw fits a 2 ml syringe, not a 1 ml one; valid up to the syringe', () => {
  const one = computeDraw({ type: 'rtu', concentration: '142.857142857', concentrationUnit: 'mg', dose: '240', doseUnit: 'mg', syringeSize: 100 });
  assert.equal(one.exceedsSyringe, true);
  const two = computeDraw({ type: 'rtu', concentration: '142.857142857', concentrationUnit: 'mg', dose: '240', doseUnit: 'mg', syringeSize: 200 });
  assert.equal(two.exceedsSyringe, false);
  assert.equal(two.valid, true);
  // 4 ml fits a 5 ml syringe and is a valid draw there (it was capped at 3 ml before).
  const four = computeDraw({ type: 'rtu', concentration: '50', concentrationUnit: 'mg', dose: '200', doseUnit: 'mg', syringeSize: 500 });
  assert.equal(four.rawML, 4);
  assert.equal(four.valid, true);
  assert.equal(four.exceedsSyringe, false);
  // On an insulin syringe the old 3 ml bound still applies.
  assert.equal(computeDraw({ type: 'rtu', concentration: '50', concentrationUnit: 'mg', dose: '200', doseUnit: 'mg', syringeSize: 100 }).valid, false);
});

test('AP-21: the draw reads in ml on an ml syringe, in units on an insulin syringe', () => {
  assert.deepEqual(S.drawReading({ drawUnits: '168.0', drawML: '1.68' }, 300), { value: '1.68', unit: 'ml', ml: true });
  assert.deepEqual(S.drawReading({ drawUnits: '56.0', drawML: '0.56' }, 100), { value: '56.0', unit: 'u', ml: false });
  assert.equal(S.sizeLabel(300, 'en'), '3 ml');
  assert.equal(S.sizeLabel(30, 'pt'), '0,3 ml · 30 u');
  assert.equal(S.sizeLabel(100, 'en'), '1 ml · 100 u');
});

test('AP-21: the drawn syringe is marked in ml (0 1 2 3) on a 3 ml syringe', () => {
  const { syringeParts } = require('../lib/syringeGeometry');
  const g = syringeParts(300, 168);
  assert.deepEqual(g.labels.map((l) => l.text), ['0', '1', '2', '3']);
  assert.ok(g.ticks.every((k) => k.u % 10 === 0));
  assert.deepEqual(g.ticks.filter((k) => k.long).map((k) => k.u), [100, 200]);
  assert.equal(g.over, false);
  const five = syringeParts(500, 420);
  assert.deepEqual(five.labels.map((l) => l.text), ['0', '1', '2', '3', '4', '5']);
  assert.ok(five.ticks.every((k) => k.u % 20 === 0));
  // An insulin syringe is unchanged: numbers every 10 units.
  assert.equal(syringeParts(100, 50).labels.length, 11);
});

test('AP-23: under 10 units on an insulin syringe is a neutral fact; ml syringes and 10+ units are not', () => {
  assert.equal(S.smallDraw('8.0', 100), true);
  assert.equal(S.smallDraw('9.9', 30), true);
  assert.equal(S.smallDraw('10.0', 100), false);
  assert.equal(S.smallDraw('0', 100), false);
  assert.equal(S.smallDraw('8.0', 300), false);
  assert.equal(S.smallDraw(null, 100), false);
});

test('AP-21 / AP-23 wiring: the wizard, Today, the dose page and the protocol page use the helpers', () => {
  const ps = read('screens', 'ProtocolsScreen.js');
  assert.match(ps, /syringeGroups\(type\)/, 'the size list comes from syringeGroups(type)');
  assert.match(ps, /SyringePickerSheet/, 'option B: one row that opens a grouped list');
  assert.match(ps, /protocols_small_draw/, 'AP-23 fact next to the draw in the wizard');
  assert.match(ps, /drawReading\(/, 'the wizard and the protocol page read the draw through drawReading');
  for (const f of [['screens', 'TodayScreen.js']]) { // A-115: the dose page is gone (the right page shows the protocol page)
    const src = read(...f);
    assert.match(src, /drawLine\(/, `${f.join('/')} shows the draw through drawLine (ml on ml syringes)`);
    assert.match(src, /exceedsMessage\(/, `${f.join('/')} says what does not fit in ml on an ml syringe`);
  }
});
