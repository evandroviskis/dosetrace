'use strict';
// Can the dose unit be read against the protocol's own strength unit? (A-136 (6), Fold 7
// 2026-10-17: an oral 1000 IU dose with 2000 IU per serving was blocked with "can't mix IU with
// mg/mcg", because the wizard compared the hidden ready-to-use concentration unit, 'mg' by
// default, for every non-recon type.) Each type has its own strength:
//   recon — the vial amount's unit; rtu — the concentration unit; oral — the serving strength
//   unit (lib/oralMath, the rule the protocol assistant and the serving calculator use).
// Nothing typed to compare yet → no block. Pure, CommonJS.
const { unitsCompatible } = require('./doseMath');
const { computeServings } = require('./oralMath');

const OK = { ok: true, messageKey: null };

function doseUnitCheck(f) {
  if (!f || !f.dose) return OK;
  if (f.type === 'oral') {
    const r = computeServings({
      targetDose: f.dose, doseUnit: f.doseUnit, servingStrength: f.servingStrength,
      servingStrengthUnit: f.servingStrengthUnit, servingUnits: f.servingUnits, form: f.form, language: f.language,
    });
    return r.unitMismatch ? { ok: false, messageKey: 'protocols_serving_unit_mismatch' } : OK;
  }
  const strengthUnit = f.type === 'recon' ? f.unit : (f.concentrationUnit || 'mg');
  return unitsCompatible(strengthUnit, f.doseUnit) ? OK : { ok: false, messageKey: 'protocols_unit_mismatch' };
}

module.exports = { doseUnitCheck };
