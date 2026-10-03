'use strict';
// Review finding 2026-10-02 (HIGH): an oral protocol's Edit preview in pt/es/fr/de/it showed
// the wrong tablet count. The edit form prefills "2,5" (the app language's decimal) and
// lib/oralMath read it with parseFloat ("2,5" -> 2), so 5 mg of 2.5 mg tablets showed 2.5
// tablets instead of 2. Every oral value now goes through parseDecimal.
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeServings, supplyDaysLeft } = require('../lib/oralMath');
const { formFromProtocol } = require('../lib/protocolForm');

const ORAL = { id: 3, name: 'Zinc', type: 'oral', dose: 5, dose_unit: 'mg', serving_strength: 2.5, serving_strength_unit: 'mg', serving_units: 1, container_units: 60, interval_days: 1, doses_per_day: 1, reminder_time: '08:00', start_date: '2026-09-01', goal: '', notes: 'Tablet' };

test('oral edit preview in every language: 5 mg of 2.5 mg tablets is 2 tablets', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    const f = formFromProtocol(ORAL, null, new Date(2026, 9, 2), l);
    const r = computeServings({ targetDose: f.dose, doseUnit: f.doseUnit, servingStrength: f.servingStrength, servingStrengthUnit: f.servingStrengthUnit, servingUnits: f.servingUnits, form: f.notes, language: l });
    assert.equal(r.valid, true, l);
    assert.equal(r.unitsNeeded, 2, `${l}: strength field "${f.servingStrength}"`);
  }
});

test('typed comma decimals are read in the oral math', () => {
  assert.equal(computeServings({ targetDose: '5', doseUnit: 'mg', servingStrength: '2,5', servingStrengthUnit: 'mg', servingUnits: '1', form: 'Tablet' }).unitsNeeded, 2);
  assert.equal(computeServings({ targetDose: '1,5', doseUnit: 'g', servingStrength: '0,75', servingStrengthUnit: 'g', servingUnits: '1', form: 'Capsule' }).unitsNeeded, 2);
  assert.equal(supplyDaysLeft('10,5', '2,5', '1'), 4);
});

test('a stored comma dose (older rows) still charts: the curve reads it with parseDecimal', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { blendComponents, BLEND_IDS } = require('../lib/compounds');
  const serum = fs.readFileSync(path.join(__dirname, '..', 'lib', 'serumModel.js'), 'utf8');
  const curve = fs.readFileSync(path.join(__dirname, '..', 'screens', 'SerumCurveScreen.js'), 'utf8');
  assert.doesNotMatch(serum, /Number\(p\.dose\)/);
  assert.doesNotMatch(serum + curve, /doseInCurveUnit\(p\.dose,/, 'the dose is parsed before the curve unit conversion');
  assert.match(serum, /doseInCurveUnit\(parseDecimal\(p\.dose\), p\.dose_unit, entry\)/);
  assert.match(curve, /doseInCurveUnit\(parseDecimal\(p\.dose\), p\.dose_unit, entry\)/);
  const parts = blendComponents(BLEND_IDS[0], '1,5');
  assert.ok(parts && Math.abs(parts.reduce((a, p) => a + p.dose, 0) - 1.5) < 1e-9);
});
