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

test('"Estava errada": the corrected doses used the new dose (fixed = how many of this vial were corrected)', () => {
  // 2000 mg vial; both doses taken were really 90, not 100 → 1820 left → 20 more
  assert.equal(vialTotalAfterDoseEdit({ total: 20, taken: 2, mass: 2000, massUnit: 'mg', oldDose: '100', oldUnit: 'mg', newDose: '90', newUnit: 'mg', fixed: 2 }), 2 + 20);
  // a typo before any dose: the whole vial at the new dose
  assert.equal(vialTotalAfterDoseEdit({ total: 0, taken: 0, mass: 2000, massUnit: 'mg', oldDose: '2500', oldUnit: 'mg', newDose: '250', newUnit: 'mg', fixed: 0 }), 8);
  // only 2 of 3 doses from this vial corrected: 19 left at 90 + 2 × 10 back = 1730 → 21 at 80
  assert.equal(vialTotalAfterDoseEdit({ total: 22, taken: 3, mass: 2000, massUnit: 'mg', oldDose: '90', oldUnit: 'mg', newDose: '80', newUnit: 'mg', fixed: 2 }), 3 + 21);
});

test('council block 2026-10-27: a second dose change of the same vial counts from the doses left, never invents doses', () => {
  const a = vialTotalAfterDoseEdit({ total: 10, taken: 4, mass: 10, massUnit: 'mg', oldDose: '1', oldUnit: 'mg', newDose: '0.5', newUnit: 'mg' });
  assert.equal(a, 16);
  // 4 more at 0.5 (8 taken, 4 mg really left), then 0.25 → 8 + 16 = 24 (was 32)
  assert.equal(vialTotalAfterDoseEdit({ total: a, taken: 8, mass: 10, massUnit: 'mg', oldDose: '0.5', oldUnit: 'mg', newDose: '0.25', newUnit: 'mg' }), 24);
  // same state changed to 2 mg → 8 + 2 = 10 (was 11)
  assert.equal(vialTotalAfterDoseEdit({ total: a, taken: 8, mass: 10, massUnit: 'mg', oldDose: '0.5', oldUnit: 'mg', newDose: '2', newUnit: 'mg' }), 10);
});

test('one corrected dose (Alterar dose) moves the vial by the difference', () => {
  const { vialTotalAfterOneDoseEdit } = require('../lib/protocolForm');
  // 22 at 90 mg, 2 taken; one of them was really 180 → 20×90 − 90 = 1710 → 19 left → 21
  assert.equal(vialTotalAfterOneDoseEdit({ total: 22, taken: 2, dose: '90', doseUnit: 'mg', oldAmount: 90, oldUnit: 'mg', newAmount: 180, newUnit: 'mg' }), 21);
  assert.equal(vialTotalAfterOneDoseEdit({ total: 22, taken: 2, dose: '90', doseUnit: 'mg', oldAmount: 90, oldUnit: 'mg', newAmount: 45, newUnit: 'mg' }), 22, '45 mg back is half a dose: floor');
  assert.equal(vialTotalAfterOneDoseEdit({ total: 22, taken: 2, dose: '90', doseUnit: 'mg', oldAmount: 90, oldUnit: 'mg', newAmount: 0, newUnit: 'mg' }), null);
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
  assert.match(src, /fixed: /);
  assert.doesNotMatch(src, /vialPatch && vialPatch\.total_doses != null \? Number\(vialNow\.total_doses\) : vialNow\.total_doses/, 'no dead ternary; the patched vial is read back');
});

// Council 2026-10-27: "Estava errada" (and any dose edit) writes the protocol, its corrected doses and the
// vial in ONE step — a crash between them never leaves the vial counted at one dose and the protocol at the other.
test('one step: the protocol edit and the vial recount run inside one transaction', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../screens/ProtocolsScreen.js'), 'utf8');
  const start = src.indexOf('const written = withImmediateTransaction(() => {');
  assert.ok(start > -1, 'the edit opens one transaction');
  const body = src.slice(start, src.indexOf('\n      });', start));
  assert.match(body, /updateProtocol\(editingId/);
  assert.match(body, /vialTotalAfterDoseEdit\(/);
  assert.match(body, /updateVial\(vialNow\.id, \{ total_doses: total \}\)/);
});
