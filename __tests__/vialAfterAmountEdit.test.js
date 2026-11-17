'use strict';
// DV-015 (the "or amount" half, never built with DL-15): editing a reconstituted protocol's vial content
// (amount / unit) must recount the active vial from the new content, as a dose edit does. Found by the
// founder 2026-11-16: a protocol saved with 5 mg in the vial at 500 mcg (10 doses), then edited to 15 mg,
// kept "10 doses" — 15 mg ÷ 500 mcg is 30. The vial's water follows the protocol's water too.
const test = require('node:test');
const assert = require('node:assert/strict');
const { vialRecountNeeded, vialTotalAfterDoseEdit, vialMass } = require('../lib/protocolForm');

test('a recon vial content edit asks for the recount; a dose edit still does; a rename does not', () => {
  assert.equal(vialRecountNeeded({ amount: 15 }, 'recon'), true);
  assert.equal(vialRecountNeeded({ unit: 'mcg' }, 'recon'), true);
  assert.equal(vialRecountNeeded({ dose: 250 }, 'recon'), true);
  assert.equal(vialRecountNeeded({ dose_unit: 'mcg' }, 'rtu'), true);
  assert.equal(vialRecountNeeded({ name: 'X', water: 3 }, 'recon'), false);
  assert.equal(vialRecountNeeded({ amount: 15 }, 'oral'), false);
  assert.equal(vialRecountNeeded({}, 'recon'), false);
});

test('the founder case: 5 mg → 15 mg at 500 mcg, nothing taken → 30 doses', () => {
  const after = { type: 'recon', amount: 15, unit: 'mg', dose: 500, dose_unit: 'mcg' };
  const vial = { total_doses: 10, doses_taken: 0 };
  assert.equal(vialTotalAfterDoseEdit({ total: vial.total_doses, taken: 0, ...vialMass(after, vial), oldDose: 500, oldUnit: 'mcg', newDose: 500, newUnit: 'mcg', used: [] }), 30);
});

test('with doses already taken, they count at their own amounts', () => {
  const after = { type: 'recon', amount: 15, unit: 'mg', dose: 500, dose_unit: 'mcg' };
  const used = [{ amount: 500, unit: 'mcg' }, { amount: 500, unit: 'mcg' }, { amount: 500, unit: 'mcg' }, { amount: 500, unit: 'mcg' }];
  assert.equal(vialTotalAfterDoseEdit({ total: 10, taken: 4, ...vialMass(after, {}), oldDose: 500, oldUnit: 'mcg', newDose: 500, newUnit: 'mcg', used }), 30);
  // content lowered below what was taken: never below the doses taken
  assert.equal(vialTotalAfterDoseEdit({ total: 30, taken: 4, ...vialMass({ ...after, amount: 1 }, {}), oldDose: 500, oldUnit: 'mcg', newDose: 500, newUnit: 'mcg', used }), 4);
});

test('wired: the protocol edit recounts on a content edit and carries the water to the recon vial', () => {
  const src = require('./helpers/extractFn').read('screens/ProtocolsScreen.js');
  assert.match(src, /vialRecountNeeded\(patch, /);
  assert.match(src, /'water' in patch/);
});
