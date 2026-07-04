'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { unitsCompatible, normalizeDoseValue, formatML, computeDraw, dosesPerVial } = require('../lib/doseMath');

test('unitsCompatible: IU only pairs with IU', () => {
  assert.equal(unitsCompatible('IU', 'IU'), true);
  assert.equal(unitsCompatible('IU', 'mg'), false);
  assert.equal(unitsCompatible('mg', 'IU'), false);
  assert.equal(unitsCompatible('mg', 'mcg'), true);
  assert.equal(unitsCompatible('mcg', 'mg'), true);
  assert.equal(unitsCompatible('mg', 'mg'), true);
});

test('normalizeDoseValue: mg↔mcg conversion factor is 1000', () => {
  assert.equal(normalizeDoseValue('1', 'mg', 'mcg'), 0.001);   // 1 mcg = 0.001 mg
  assert.equal(normalizeDoseValue('1', 'mcg', 'mg'), 1000);    // 1 mg = 1000 mcg
  assert.equal(normalizeDoseValue('250', 'mg', 'mcg'), 0.25);  // 250 mcg = 0.25 mg
  assert.equal(normalizeDoseValue('2', 'mg', 'mg'), 2);        // same unit passthrough
  assert.equal(normalizeDoseValue('500', 'IU', 'IU'), 500);    // IU passthrough
});

test('normalizeDoseValue: non-numeric input degrades to 0, not NaN', () => {
  assert.equal(normalizeDoseValue('', 'mg', 'mg'), 0);
  assert.equal(normalizeDoseValue('abc', 'mg', 'mcg'), 0);
  assert.equal(normalizeDoseValue(undefined, 'mg', 'mg'), 0);
});

test('formatML: adaptive precision and non-finite guard', () => {
  assert.equal(formatML(0.005), '0.0050');  // < 0.01 → 4 dp
  assert.equal(formatML(0.05), '0.050');    // < 0.1  → 3 dp
  assert.equal(formatML(0.5), '0.50');      // ≥ 0.1  → 2 dp
  assert.equal(formatML(Infinity), '0');    // guarded
  assert.equal(formatML(NaN), '0');         // guarded
});

test('computeDraw recon: BPC 10mg/2ml, 250mcg dose → 0.05ml = 5.0u', () => {
  const r = computeDraw({ type: 'recon', amount: '10', water: '2', dose: '250', doseUnit: 'mcg', unit: 'mg', syringeSize: 100 });
  assert.equal(r.rawML, 0.05);
  assert.equal(r.drawML, '0.050');
  assert.equal(r.drawUnits, '5.0');
  assert.equal(r.valid, true);
  assert.equal(r.exceedsSyringe, false);
});

test('computeDraw recon: same-unit mg dose', () => {
  // 5 mg in 1 ml = 5 mg/ml; 2 mg dose → 0.4 ml = 40u
  const r = computeDraw({ type: 'recon', amount: '5', water: '1', dose: '2', doseUnit: 'mg', unit: 'mg', syringeSize: 100 });
  assert.equal(r.rawML, 0.4);
  assert.equal(r.drawUnits, '40.0');
  assert.equal(r.valid, true);
  assert.equal(r.exceedsSyringe, false);
});

test('computeDraw: exceedsSyringe flags an over-capacity draw (the H1 case)', () => {
  // 5 mg in 1 ml = 5 mg/ml; 4 mg dose → 0.8 ml = 80u, on a 50u syringe.
  const r = computeDraw({ type: 'recon', amount: '5', water: '1', dose: '4', doseUnit: 'mg', unit: 'mg', syringeSize: 50 });
  assert.equal(r.rawML, 0.8);
  assert.equal(r.drawUnits, '80.0');
  assert.equal(r.valid, true);          // arithmetic is in range (≤ 3 ml)
  assert.equal(r.exceedsSyringe, true); // ...but it does not fit the chosen syringe
});

test('computeDraw recon: zero/empty water does not divide-by-zero', () => {
  const zero = computeDraw({ type: 'recon', amount: '5', water: '0', dose: '2', doseUnit: 'mg', unit: 'mg' });
  assert.equal(zero.rawML, null);
  assert.equal(zero.valid, false);
  const empty = computeDraw({ type: 'recon', amount: '5', water: '', dose: '2', doseUnit: 'mg', unit: 'mg' });
  assert.equal(empty.rawML, null);
  assert.equal(empty.valid, false);
});

test('computeDraw recon: incompatible units are reported, not miscomputed', () => {
  const r = computeDraw({ type: 'recon', amount: '5000', water: '1', dose: '500', doseUnit: 'IU', unit: 'mg' });
  assert.equal(r.unitMismatch, true);
  assert.equal(r.valid, false);
  assert.equal(r.rawML, null);
});

test('computeDraw rtu: 250mg/ml, 100mg dose → 0.4ml = 40u', () => {
  const r = computeDraw({ type: 'rtu', concentration: '250', concentrationUnit: 'mg', dose: '100', doseUnit: 'mg', syringeSize: 100 });
  assert.equal(r.rawML, 0.4);
  assert.equal(r.drawUnits, '40.0');
  assert.equal(r.valid, true);
});

test('computeDraw rtu: mixed mg/mcg units convert correctly', () => {
  // 200 mcg/ml concentration, 100 mcg dose → 0.5 ml
  const r = computeDraw({ type: 'rtu', concentration: '200', concentrationUnit: 'mcg', dose: '100', doseUnit: 'mcg', syringeSize: 100 });
  assert.equal(r.rawML, 0.5);
  assert.equal(r.valid, true);
});

test('computeDraw rtu: zero concentration does not divide-by-zero', () => {
  const r = computeDraw({ type: 'rtu', concentration: '0', dose: '100', doseUnit: 'mg' });
  assert.equal(r.rawML, null);
  assert.equal(r.valid, false);
});

test('computeDraw: incomplete input returns an empty, non-crashing result', () => {
  assert.equal(computeDraw({ type: 'recon' }).valid, false);
  assert.equal(computeDraw({ type: 'rtu' }).valid, false);
  assert.equal(computeDraw({ type: 'oral', dose: '500', doseUnit: 'mg' }).valid, false);
  assert.equal(computeDraw({}).rawML, null);
});

test('dosesPerVial: derives vial capacity from amount ÷ dose', () => {
  // Retatrutide 20 mg vial, 2 mg dose → 10 doses (the owner's example).
  assert.equal(dosesPerVial({ amount: '20', unit: 'mg', dose: '2', doseUnit: 'mg' }), 10);
  // BPC 10 mg vial, 250 mcg dose → 40 doses.
  assert.equal(dosesPerVial({ amount: '10', unit: 'mg', dose: '250', doseUnit: 'mcg' }), 40);
  // Non-integer floors down: 5 mg / 2 mg = 2 (not 2.5).
  assert.equal(dosesPerVial({ amount: '5', unit: 'mg', dose: '2', doseUnit: 'mg' }), 2);
});

test('dosesPerVial: returns null on incomplete or incompatible input', () => {
  assert.equal(dosesPerVial({ amount: '', unit: 'mg', dose: '2', doseUnit: 'mg' }), null);
  assert.equal(dosesPerVial({ amount: '10', unit: 'mg', dose: '0', doseUnit: 'mg' }), null);
  assert.equal(dosesPerVial({ amount: '10', unit: 'mg', dose: '500', doseUnit: 'IU' }), null); // incompatible
  assert.equal(dosesPerVial({ amount: '1', unit: 'mg', dose: '2', doseUnit: 'mg' }), null); // <1 dose
});

test('computeDraw: valid ceiling is 3 ml (arithmetic sanity bound)', () => {
  // 1 mg/ml, 4 mg dose → 4 ml, beyond the 3 ml sanity cap
  const r = computeDraw({ type: 'rtu', concentration: '1', concentrationUnit: 'mg', dose: '4', doseUnit: 'mg' });
  assert.equal(r.rawML, 4);
  assert.equal(r.valid, false);
});
