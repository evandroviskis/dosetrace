'use strict';
// A-136 (6) — guided device session 2026-10-17 (Fold7, pt): adding an oral protocol (capsule)
// with Quantidade por dose 1000 IU and Concentração por porção 2000 IU, Next was blocked with
// "Não é possível misturar UI com mg/mcg" (protocols_unit_mismatch).
// Cause: the wizard's unit check compared the hidden ready-to-use concentration unit (default
// 'mg') with the dose unit for EVERY non-recon type: unitsCompatible(concentrationUnit || 'mg',
// doseUnit). An oral protocol has no concentration; its dose is read against the serving
// strength (lib/oralMath computeServings, the same rule the protocol assistant already used).
// So any IU oral dose was blocked, while a real oral mismatch (mg dose, IU serving) was not.
// Fix: lib/doseUnitCheck — recon: vial unit vs dose unit; ready to use: concentration unit vs
// dose unit; oral: the serving strength unit vs the dose unit (only once a serving strength is
// typed), with the serving message. The wizard's Next, Save (new and edit: the same form) and
// the Check values sheet all read it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { doseUnitCheck } = require('../lib/doseUnitCheck');

const OK = { ok: true, messageKey: null };
const base = { dose: '1000', unit: 'mg', concentrationUnit: 'mg', servingStrength: '2000', servingStrengthUnit: 'mg', servingUnits: '1', form: 'Capsule', language: 'pt' };

test('A-136 (6): the founder case — oral 1000 IU per dose, 2000 IU per serving — passes', () => {
  assert.deepEqual(doseUnitCheck({ ...base, type: 'oral', doseUnit: 'IU', servingStrengthUnit: 'IU' }), OK);
  // the hidden ready-to-use unit is never read for an oral protocol
  assert.deepEqual(doseUnitCheck({ ...base, type: 'oral', doseUnit: 'IU', servingStrengthUnit: 'IU', concentrationUnit: 'mg' }), OK);
});

test('A-136 (6): recon / rtu / oral x mg / mcg / IU', () => {
  const units = ['mg', 'mcg', 'IU'];
  for (const du of units) {
    for (const ou of units) {
      const mixed = (du === 'IU') !== (ou === 'IU');
      const recon = doseUnitCheck({ ...base, type: 'recon', unit: ou, doseUnit: du });
      const rtu = doseUnitCheck({ ...base, type: 'rtu', concentrationUnit: ou, doseUnit: du });
      const oral = doseUnitCheck({ ...base, type: 'oral', servingStrengthUnit: ou, doseUnit: du });
      assert.equal(recon.ok, !mixed, `recon vial ${ou} dose ${du}`);
      assert.equal(rtu.ok, !mixed, `rtu conc ${ou} dose ${du}`);
      assert.equal(oral.ok, !mixed, `oral serving ${ou} dose ${du}`);
      if (mixed) {
        assert.equal(recon.messageKey, 'protocols_unit_mismatch');
        assert.equal(rtu.messageKey, 'protocols_unit_mismatch');
        assert.equal(oral.messageKey, 'protocols_serving_unit_mismatch');
      }
    }
  }
});

test('A-136 (6): nothing to compare yet → no block', () => {
  assert.deepEqual(doseUnitCheck({ ...base, type: 'rtu', dose: '', concentrationUnit: 'mg', doseUnit: 'IU' }), OK);
  assert.deepEqual(doseUnitCheck({ ...base, type: 'oral', servingStrength: '', servingStrengthUnit: 'mg', doseUnit: 'IU' }), OK, 'no serving strength typed');
  assert.deepEqual(doseUnitCheck({ ...base, type: 'oral', dose: '', servingStrengthUnit: 'mg', doseUnit: 'IU' }), OK);
});

test('A-136 (6): the wizard reads the rule (Next, Save, Check values; new and edit share it)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/ProtocolsScreen.js'), 'utf8');
  assert.match(src, /import \{ doseUnitCheck \} from '\.\.\/lib\/doseUnitCheck'/);
  assert.doesNotMatch(src, /unitsCompatible\(concentrationUnit \|\| 'mg', doseUnit\)/, 'the old every-type check is gone');
  assert.match(src, /const unitCheck = doseUnitCheck\(\{\s*type, unit, concentrationUnit, doseUnit, dose,\s*servingStrength, servingStrengthUnit, servingUnits, form: notes, language,\s*\}\);/);
  assert.match(src, /const unitMismatch = !unitCheck\.ok;/);
  assert.match(src, /body: unitMismatch \? t\(unitCheck\.messageKey\) : drawExceedsMsg,/);
});
