'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeServings, supplyDaysLeft, unitsComparable } = require('../lib/oralMath');

test('whey example: 75mg target, 25mg per scoop → 3 scoops (whole)', () => {
  const r = computeServings({ targetDose: 75, doseUnit: 'mg', servingStrength: 25, servingStrengthUnit: 'mg', servingUnits: 1, form: 'Powder' });
  assert.equal(r.valid, true);
  assert.equal(r.unitsNeeded, 3);
  assert.equal(r.servingsNeeded, 3);
  assert.equal(r.isWhole, true);
  assert.equal(r.discrete, false);
  assert.equal(r.nearest, null);
});

test('vitamin C example: 800mg target, 1600mg per capsule → 0.5 capsule (not whole)', () => {
  const r = computeServings({ targetDose: 800, doseUnit: 'mg', servingStrength: 1600, servingStrengthUnit: 'mg', servingUnits: 1, form: 'Capsule' });
  assert.equal(r.valid, true);
  assert.equal(r.unitsNeeded, 0.5);
  assert.equal(r.isWhole, false);
  assert.equal(r.discrete, true);
  assert.equal(r.splittable, false); // capsules aren't reliably splittable
  assert.deepEqual(r.nearest, { lowUnits: 0, lowDose: 0, highUnits: 1, highDose: 1600 });
});

test('serving = N units: 750mg target, 500mg per serving of 2 gummies → 3 gummies', () => {
  const r = computeServings({ targetDose: 750, doseUnit: 'mg', servingStrength: 500, servingStrengthUnit: 'mg', servingUnits: 2, form: 'Gummy' });
  assert.equal(r.unitsNeeded, 3);      // 750 / (500/2) = 750/250
  assert.equal(r.servingsNeeded, 1.5); // 750 / 500
  assert.equal(r.isWhole, true);
});

test('liquid: 800mg target, 500mg per 5ml serving → 8 ml', () => {
  const r = computeServings({ targetDose: 800, doseUnit: 'mg', servingStrength: 500, servingStrengthUnit: 'mg', servingUnits: 5, form: 'Liquid' });
  assert.equal(r.unitsNeeded, 8); // 800 / (500/5) = 800/100
  assert.equal(r.discrete, false);
});

test('unit conversion across mass units: 0.8g target, 400mg per capsule → 2 capsules', () => {
  const r = computeServings({ targetDose: 0.8, doseUnit: 'g', servingStrength: 400, servingStrengthUnit: 'mg', servingUnits: 1, form: 'Capsule' });
  assert.equal(r.unitsNeeded, 2); // 800mg / 400mg
  assert.equal(r.isWhole, true);
});

test('mcg conversion: 500mcg target, 1mg per capsule → 0.5 capsule', () => {
  const r = computeServings({ targetDose: 500, doseUnit: 'mcg', servingStrength: 1, servingStrengthUnit: 'mg', servingUnits: 1, form: 'Capsule' });
  assert.equal(r.unitsNeeded, 0.5);
});

test('IU vs mg is a unit mismatch (IU is not mass-convertible)', () => {
  const r = computeServings({ targetDose: 1000, doseUnit: 'IU', servingStrength: 50, servingStrengthUnit: 'mg', servingUnits: 1, form: 'Softgel' });
  assert.equal(r.valid, false);
  assert.equal(r.unitMismatch, true);
});

test('IU with IU is fine: 2000 IU target, 1000 IU per softgel → 2 softgels', () => {
  const r = computeServings({ targetDose: 2000, doseUnit: 'IU', servingStrength: 1000, servingStrengthUnit: 'IU', servingUnits: 1, form: 'Softgel' });
  assert.equal(r.unitsNeeded, 2);
  assert.equal(r.unitMismatch, false);
});

test('incomplete / non-positive inputs are not valid', () => {
  assert.equal(computeServings({ targetDose: 0, servingStrength: 100, form: 'Capsule' }).valid, false);
  assert.equal(computeServings({ targetDose: 100, servingStrength: 0, form: 'Capsule' }).valid, false);
  assert.equal(computeServings({ targetDose: 100, form: 'Capsule' }).valid, false);
});

test('unitsComparable: mass units interconvert; IU only with IU', () => {
  assert.equal(unitsComparable('mg', 'mcg'), true);
  assert.equal(unitsComparable('g', 'mg'), true);
  assert.equal(unitsComparable('IU', 'mg'), false);
  assert.equal(unitsComparable('IU', 'IU'), true);
});

test('supplyDaysLeft: 60 units, 3 per dose, once a day → 20 days', () => {
  assert.equal(supplyDaysLeft(60, 3, 1), 20);
  assert.equal(supplyDaysLeft(60, 3, 2), 10); // twice a day
  assert.equal(supplyDaysLeft(5, 2, 1), 2);   // floor(2.5)
  assert.equal(supplyDaysLeft(0, 3, 1), 0);
  assert.equal(supplyDaysLeft(60, 0, 1), null); // unusable
});
