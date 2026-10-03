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
//
// language (optional, the APP language — review 2026-10-02): what the user types in
// pt/es/fr/de/it is read the way that language writes numbers. A comma is the decimal
// ("1,125" = 1.125, "5,000" = 5); a dot followed by exact 3-digit groups with a non-zero
// leading group is thousands ("1.250" = 1250, "12.500" = 12500); any other dot is a
// decimal typed out of habit ("0.5", "1.25", "0.250" = 0.25); spaces / no-break spaces
// between 3-digit groups are thousands ("2 480"). English, or no language (stored values,
// OCR text), keeps the rules above unchanged.
const COMMA_DECIMAL = new Set(['es', 'pt', 'fr', 'de', 'it']);
function parseDecimal(v, language) {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  if (COMMA_DECIMAL.has(language)) return parseCommaDecimal(String(v));
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

// A typed number as ONE stored form, a dot-decimal string ("86,5" in pt -> "86.5"), so a synced
// payload never depends on the language it was typed in (review 2026-10-02). Empty or
// non-numeric text is kept as typed; null/undefined pass through.
function canonicalDecimal(v, language) {
  if (v == null) return v;
  if (typeof v === 'number') return String(v);
  if (String(v).trim() === '') return String(v);
  const n = parseDecimal(v, language);
  return Number.isFinite(n) ? String(n) : String(v);
}

// The pt/es/fr/de/it reading (see parseDecimal).
function parseCommaDecimal(text) {
  // Spaces / no-break spaces between 3-digit groups are thousands ("2 480", "12 500,5").
  let s = text.trim().replace(/(\d)[\s  ]+(?=\d{3}(?!\d))/g, '$1').replace(/\s+/g, '');
  if (!s) return NaN;
  const commas = (s.match(/,/g) || []).length;
  const dots = (s.match(/\./g) || []).length;
  if (commas && dots) {
    // Both: the last one is the decimal ("1.250,5" = 1250.5), the other is grouping.
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (commas) {
    if (commas > 1) return NaN;
    s = s.replace(',', '.');
  } else if (dots) {
    if (/^[-+]?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "1.250" = 1250
    else if (dots > 1) return NaN;
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
function normalizeDoseValue(doseVal, compoundUnit, doseUnit, language) {
  const d = parseDecimal(doseVal, language) || 0;
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

// Founder 2026-10-02: a shown volume or concentration drops its trailing zeros
// ("1.00" -> "1", "0.50" -> "0.5", "1.25" stays). No rounding: only trailing zeros and a
// dangling point go. A comma decimal is kept ("2,50" -> "2,5"); grouped thousands
// ("5,000", the parseDecimal rule) are left alone. Anything non-numeric passes through.
// Never used on the syringe draw in units, which keeps its decimal ("50.0").
function trimZeros(v) {
  if (v == null) return v;
  const s = String(v).trim();
  const m = /^(-?\d+)([.,])(\d*)$/.exec(s);
  if (!m) return s;
  if (m[2] === ',' && /^[1-9]\d{0,2}$/.test(m[1]) && m[3].length === 3) return s;
  const frac = m[3].replace(/0+$/, '');
  return frac ? m[1] + m[2] + frac : m[1];
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
  const { type, amount, water, dose, doseUnit, unit, concentration, concentrationUnit, language } = p; // language: typed form values (the app language); omitted for stored rows
  const syringeMax = p.syringeSize || p.syringe_size || 100;

  const empty = {
    rawML: null, drawML: null, drawUnits: null,
    valid: false, exceedsSyringe: false, unitMismatch: false,
  };

  let rawML = null;

  if (type === 'recon' && amount && water && dose) {
    if (!unitsCompatible(unit, doseUnit)) return { ...empty, unitMismatch: true };
    const normalDose = normalizeDoseValue(dose, unit, doseUnit, language);
    const conc = parseDecimal(amount, language) / parseDecimal(water, language);
    if (conc > 0) rawML = normalDose / conc;
  } else if (type === 'rtu' && concentration && dose) {
    const cu = concentrationUnit || 'mg';
    if (!unitsCompatible(cu, doseUnit)) return { ...empty, unitMismatch: true };
    const normalDose = normalizeDoseValue(dose, cu, doseUnit, language);
    const concVal = parseDecimal(concentration, language);
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
  const { amount, unit, dose, doseUnit, language } = p;
  const amt = parseDecimal(amount, language);
  if (!amt || amt <= 0) return null;
  if (!unitsCompatible(unit, doseUnit)) return null;
  const perDose = normalizeDoseValue(dose, unit, doseUnit, language);
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
function massFromUnits(iu, amountMg, waterMl, language) {
  const u = parseDecimal(iu, language);
  const a = parseDecimal(amountMg, language);
  const w = parseDecimal(waterMl, language);
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

module.exports = { parseDecimal, canonicalDecimal, trimZeros, unitsCompatible, normalizeDoseValue, formatML, computeDraw, dosesPerVial, massFromUnits, massParts };
