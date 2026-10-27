'use strict';
// DL-15 (DV-015 / DV-223): a dose edit recomputes the vial's capacity from the mass left — the vial's
// content does not change with the dose. With AD-95 (founder 2026-10-27): "Mudou a partir de agora" →
// the doses taken used the OLD dose; "Estava errada" (or a typo fixed before any dose) → they used the
// NEW one. new total = taken + floor(mass left ÷ new dose).
const test = require('node:test');
const assert = require('node:assert/strict');
const { vialTotalAfterDoseEdit } = require('../lib/protocolForm');

test('DV-223 example: 10 mg vial, 1 mg dose, 4 taken, changed to 0.5 mg → 16 in total (12 left)', () => {
  assert.equal(vialTotalAfterDoseEdit({ total: 10, taken: 4, mass: 10, massUnit: 'mg', oldDose: '1', oldUnit: 'mg', newDose: '0.5', newUnit: 'mg' }), 16);
});

test('recon without a known mass: the mass is total × old dose', () => {
  assert.equal(vialTotalAfterDoseEdit({ total: 20, taken: 5, oldDose: '0.25', oldUnit: 'mg', newDose: '0.5', newUnit: 'mg' }), 5 + 7);
});

test('"Estava errada": the doses taken used the new dose', () => {
  // 2000 mg vial; marked at 100 but it was 90 → 2 taken × 90 used; 1820 left → 20 more
  assert.equal(vialTotalAfterDoseEdit({ total: 20, taken: 2, mass: 2000, massUnit: 'mg', oldDose: '100', oldUnit: 'mg', newDose: '90', newUnit: 'mg', fix: true }), 2 + 20);
});

test('units: mcg vs mg converted; IU only against IU; nothing known → null (vial untouched)', () => {
  assert.equal(vialTotalAfterDoseEdit({ total: 10, taken: 0, mass: 5, massUnit: 'mg', oldDose: '500', oldUnit: 'mcg', newDose: '250', newUnit: 'mcg' }), 20);
  assert.equal(vialTotalAfterDoseEdit({ total: 10, taken: 0, mass: 5, massUnit: 'mg', oldDose: '0.5', oldUnit: 'mg', newDose: '250', newUnit: 'mcg' }), 20);
  assert.equal(vialTotalAfterDoseEdit({ total: 10, taken: 0, oldDose: '5', oldUnit: 'IU', newDose: '10', newUnit: 'mg' }), null);
  assert.equal(vialTotalAfterDoseEdit({ total: 0, taken: 0, oldDose: '1', oldUnit: 'mg', newDose: '2', newUnit: 'mg' }), null);
  assert.equal(vialTotalAfterDoseEdit({ total: 10, taken: 2, oldDose: '1', oldUnit: 'mg', newDose: '0', newUnit: 'mg' }), null);
});

test('never below the doses already taken; a 0,5 typed in Portuguese reads as a half', () => {
  assert.equal(vialTotalAfterDoseEdit({ total: 10, taken: 9, mass: 10, massUnit: 'mg', oldDose: '1', oldUnit: 'mg', newDose: '5', newUnit: 'mg' }), 9);
  assert.equal(vialTotalAfterDoseEdit({ total: 10, taken: 0, mass: 10, massUnit: 'mg', oldDose: '1', oldUnit: 'mg', newDose: '0,5', newUnit: 'mg', language: 'pt' }), 20);
});

test('wired: the protocol edit writes the recomputed total for recon and ready-to-use vials', () => {
  const src = require('./helpers/extractFn').read('screens/ProtocolsScreen.js');
  assert.match(src, /vialTotalAfterDoseEdit\(/);
  assert.match(src, /fix: doseChoice === 'fix' \|\| doseTypo/);
});
