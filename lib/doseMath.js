// Pure dose-volume arithmetic for the reconstitution / RTU calculator.
// No React Native or Expo imports — safe to unit-test under plain Node.
// Authored as CommonJS so `node --test` can require it directly; Metro/Babel
// import it fine via named imports (`import { computeDraw } from '../lib/doseMath'`).
//
// The app is a personal calculator/logger: every value here is user-entered.
// These functions do arithmetic only; they make no dosing recommendation.

// Parse a user- or OCR-entered number that may use either a comma or a dot as
// its decimal separator. Most of the world writes "0,5"; the US writes "0.5" —
// and on a localized numeric keypad a European user's only decimal key is the
// comma, so `parseFloat("0,5")` silently returns 0 and starves the calculator.
// Rules: if both separators appear (e.g. "1.234,5" / "1,234.5") the LAST one is
// the decimal point and the other is stripped as grouping; a lone comma is the
// decimal point (numeric keypads never emit a grouping separator). Returns NaN
// for anything unparseable, so existing `|| 0` and `> 0` guards behave as before.
function parseDecimal(v) {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  let s = String(v).trim().replace(/\s+/g, '');
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Only comma(s). A lone comma is normally the decimal point ("0,5" -> 0.5),
    // but grouped thousands ("5,000", "10,000") must NOT collapse to 5.0 / 10.0 —
    // HCG/HMG vials are labelled "5,000 IU" / "10,000 IU", and OCR label text now
    // flows through here. Treat a single comma followed by exactly 3 digits, with
    // a non-zero integer part and no leading zero, as a thousands separator; a
    // leading zero ("0,750") or 1-2 trailing digits ("0,5", "2,5") stays decimal.
    const parts = s.split(',');
    const grouped = parts.length === 2 && /^[1-9]\d{0,2}$/.test(parts[0]) && /^\d{3}$/.test(parts[1]);
    s = grouped ? parts[0] + parts[1] : s.replace(/,/g, '.');
  }
  return parseFloat(s);
}

// Unit compatibility: IU is only compatible with IU; mg/mcg are interconvertible.
function unitsCompatible(u1, u2) {
  if (u1 === 'IU' || u2 === 'IU') return u1 === u2;
  return true; // mg↔mcg are convertible
}

// Normalize a dose so its magnitude matches the compound's unit
// (convert mcg↔mg as needed; IU and same-unit pass through unchanged).
function normalizeDoseValue(doseVal, compoundUnit, doseUnit) {
  const d = parseDecimal(doseVal) || 0;
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
    const conc = parseDecimal(amount) / parseDecimal(water);
    if (conc > 0) rawML = normalDose / conc;
  } else if (type === 'rtu' && concentration && dose) {
    const cu = concentrationUnit || 'mg';
    if (!unitsCompatible(cu, doseUnit)) return { ...empty, unitMismatch: true };
    const normalDose = normalizeDoseValue(dose, cu, doseUnit);
    const concVal = parseDecimal(concentration);
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
  const amt = parseDecimal(amount);
  if (!amt || amt <= 0) return null;
  if (!unitsCompatible(unit, doseUnit)) return null;
  const perDose = normalizeDoseValue(dose, unit, doseUnit);
  if (!perDose || perDose <= 0) return null;
  const n = Math.floor(amt / perDose);
  return n > 0 ? n : null;
}

// Mass (in mg) delivered by `iu` syringe units of a reconstituted mass vial.
// An insulin/peptide syringe is U-100: 100 units = 1 ml, so `iu` units = iu/100 ml.
// Concentration = amountMg / waterMl (mg/ml). Mass = (iu/100) × concentration.
// e.g. massFromUnits(10, 10, 2.5) = (10/100) × (10/2.5) = 0.4 mg (400 mcg).
// Returns a mg number, or null when any input is missing/invalid. Pure info — it
// converts a syringe-unit reading into a mass; it recommends nothing.
function massFromUnits(iu, amountMg, waterMl) {
  const u = parseDecimal(iu);
  const a = parseDecimal(amountMg);
  const w = parseDecimal(waterMl);
  if (!(u > 0) || !(a > 0) || !(w > 0)) return null;
  return (u / 100) * (a / w);
}

// Present a mg mass as short { mcg, mg } strings for an equivalence readout.
// mcg keeps one decimal only below 10 (so 0.4 mg → "400"/"0.4", 5 mcg → "5").
function massParts(mg) {
  const m = parseFloat(mg);
  if (!(m > 0)) return null;
  const mcgVal = m * 1000;
  const round = (n, d) => {
    const f = Math.pow(10, d);
    return String(Math.round(n * f) / f);
  };
  return { mcg: round(mcgVal, mcgVal < 10 ? 1 : 0), mg: round(m, 3) };
}

module.exports = { parseDecimal, unitsCompatible, normalizeDoseValue, formatML, computeDraw, dosesPerVial, massFromUnits, massParts };
