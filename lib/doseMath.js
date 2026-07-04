// Pure dose-volume arithmetic for the reconstitution / RTU calculator.
// No React Native or Expo imports — safe to unit-test under plain Node.
// Authored as CommonJS so `node --test` can require it directly; Metro/Babel
// import it fine via named imports (`import { computeDraw } from '../lib/doseMath'`).
//
// The app is a personal calculator/logger: every value here is user-entered.
// These functions do arithmetic only; they make no dosing recommendation.

// Unit compatibility: IU is only compatible with IU; mg/mcg are interconvertible.
function unitsCompatible(u1, u2) {
  if (u1 === 'IU' || u2 === 'IU') return u1 === u2;
  return true; // mg↔mcg are convertible
}

// Normalize a dose so its magnitude matches the compound's unit
// (convert mcg↔mg as needed; IU and same-unit pass through unchanged).
function normalizeDoseValue(doseVal, compoundUnit, doseUnit) {
  const d = parseFloat(doseVal) || 0;
  if (compoundUnit === 'IU' && doseUnit === 'IU') return d;
  if (compoundUnit === 'mg' && doseUnit === 'mcg') return d / 1000;
  if (compoundUnit === 'mcg' && doseUnit === 'mg') return d * 1000;
  return d; // same unit
}

// Format ml with adaptive precision for small peptide doses.
function formatML(rawML) {
  const v = Number(rawML);
  if (!isFinite(v)) return '0';
  if (v < 0.01) return v.toFixed(4);
  if (v < 0.1) return v.toFixed(3);
  return v.toFixed(2);
}

// Compute the draw volume for a protocol from user-entered values.
// Returns { rawML, drawML, drawUnits, valid, exceedsSyringe, unitMismatch }.
//   - rawML: numeric ml to draw, or null when inputs are incomplete/invalid
//   - drawML: display string (adaptive precision)
//   - drawUnits: display string on a U-100 syringe (rawML * 100)
//   - valid: the arithmetic produced a usable, in-range volume (0 < ml ≤ 3)
//   - exceedsSyringe: drawUnits is larger than the selected syringe capacity
//   - unitMismatch: a dose was given but its unit is incompatible with the compound
function computeDraw(p) {
  const { type, amount, water, dose, doseUnit, unit, concentration, concentrationUnit } = p;
  const syringeMax = p.syringeSize || p.syringe_size || 100;

  const empty = {
    rawML: null, drawML: null, drawUnits: null,
    valid: false, exceedsSyringe: false, unitMismatch: false,
  };

  let rawML = null;

  if (type === 'recon' && amount && water && dose) {
    if (!unitsCompatible(unit, doseUnit)) return { ...empty, unitMismatch: true };
    const normalDose = normalizeDoseValue(dose, unit, doseUnit);
    const conc = parseFloat(amount) / parseFloat(water);
    if (conc > 0) rawML = normalDose / conc;
  } else if (type === 'rtu' && concentration && dose) {
    const cu = concentrationUnit || 'mg';
    if (!unitsCompatible(cu, doseUnit)) return { ...empty, unitMismatch: true };
    const normalDose = normalizeDoseValue(dose, cu, doseUnit);
    const concVal = parseFloat(concentration);
    if (concVal > 0) rawML = normalDose / concVal;
  }

  if (rawML == null || !isFinite(rawML) || rawML <= 0) return empty;

  const drawUnits = rawML * 100;
  return {
    rawML,
    drawML: formatML(rawML),
    drawUnits: drawUnits.toFixed(1),
    valid: rawML > 0 && rawML <= 3,
    exceedsSyringe: drawUnits > syringeMax,
    unitMismatch: false,
  };
}

// How many doses a reconstituted vial yields: vial amount ÷ per-dose amount.
// Returns null when inputs are incomplete or units are incompatible. Used to
// derive vial capacity (so the app never has to ask "total doses?") and to
// drive the "vial almost empty — new vial or finished?" prompt.
function dosesPerVial(p) {
  const { amount, unit, dose, doseUnit } = p;
  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return null;
  if (!unitsCompatible(unit, doseUnit)) return null;
  const perDose = normalizeDoseValue(dose, unit, doseUnit);
  if (!perDose || perDose <= 0) return null;
  const n = Math.floor(amt / perDose);
  return n > 0 ? n : null;
}

module.exports = { unitsCompatible, normalizeDoseValue, formatML, computeDraw, dosesPerVial };
