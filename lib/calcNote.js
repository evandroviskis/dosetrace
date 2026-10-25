// A-166 (founder 2026-10-22, after Apple's 1.4.2 rejection of iOS 1.3.0): every COMPUTED
// value on the protocol page, the enlarged syringe and the Today card carries "*" and one
// small line with the arithmetic, written with the user's own numbers. Pure, CommonJS
// (unit-tested under Node).
//
// The note quotes exactly the texts the screen shows: the same concentration text as the
// Concentration row (concentrationText, used by both), the same volume and the same draw in
// units as computeDraw returns them (never computed a second way). Numbers are formatted for
// the app language with decimalText; a no-break space joins each number to its unit.
//
// Council fixes (2026-10-22): a dose in another mass unit also shows in the concentration's
// unit, converted with the draw's own normalizeDoseValue ("250 mcg (0.25 mg) ÷ 2.5 mg/ml");
// a concentration under 1 keeps 4 significant digits (never "0 mg/ml"); stored numbers are
// read with parseDecimal (as computeDraw reads them) before they are formatted, so "0,5"
// prints "0.5" in English; a no-break space on both sides of "÷" and "=", so no line starts
// or ends with an operator.
//
// Facts only: it states the user's arithmetic; it never sets, suggests or checks an amount.
const { decimalText, unitText } = require('./localeFormat');
const { parseDecimal, trimZeros, normalizeDoseValue } = require('./doseMath');
const { isMlSyringe } = require('./syringes');

const NB = ' ';
const fill = (s, vars) => Object.keys(vars).reduce((out, k) => out.split(`{${k}}`).join(vars[k]), String(s || ''));
// "a ÷ b = c": the operators never start or end a line.
const glueOperators = (s) => s.replace(/[ \t]+([÷=])[ \t]+/g, `${NB}$1${NB}`);

// A number as one plain dot-decimal text: float noise removed (0.7 × 1000 is 700, not
// 700.0000000000001) and never exponent notation. null when it is not a number.
function plainNumber(n) {
  if (!Number.isFinite(n)) return null;
  const r = Number(n.toPrecision(12));
  const s = String(r);
  if (!/e/i.test(s)) return s;
  const dec = Math.max(0, Math.min(100, 11 - Math.floor(Math.log10(Math.abs(r)))));
  return trimZeros(r.toFixed(dec));
}

// A stored number (amount, water, dose, typed concentration) as dot-decimal text. A plain
// "7.50" keeps the user's digits; anything else ("0,5", "5,000") is read with parseDecimal,
// with no language, exactly as computeDraw reads a stored row. null when empty or not a number.
function storedNumber(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return s;
  return plainNumber(parseDecimal(s));
}

// A computed concentration's digits: 2 decimals from 1 up ("3.33", "15"); under 1, 4
// significant digits ("0.3333", "0.001667"), so a low concentration never prints as 0 and
// dose ÷ concentration = volume holds as printed.
function concentrationDigits(v) {
  if (v >= 1) return trimZeros(v.toFixed(2));
  const dec = Math.min(100, 3 - Math.floor(Math.log10(v)));
  return trimZeros(v.toFixed(dec));
}

// The mass unit the concentration is written in: the vial's for a powder, the typed one for
// ready to use.
const massUnitOf = (p) => (p.type === 'recon' ? p.unit : (p.concentration_unit || 'mg'));

// The concentration as the protocol page shows it: amount ÷ water for a powder; the typed
// value for ready to use. null when it cannot be told.
function concentrationText(p, language) {
  if (!p) return null;
  if (p.type === 'recon') {
    if (!p.amount || !p.water) return null;
    const v = parseDecimal(p.amount) / parseDecimal(p.water);
    if (!Number.isFinite(v) || v <= 0) return null;
    return `${decimalText(concentrationDigits(v), language)}${NB}${unitText(p.unit, language)}/ml`;
  }
  if (p.type === 'rtu') {
    if (!p.concentration) return null;
    const c = storedNumber(p.concentration);
    return `${decimalText(trimZeros(c == null ? p.concentration : c), language)}${NB}${unitText(massUnitOf(p), language)}/ml`;
  }
  return null;
}

// "* Concentration = 30 mg ÷ 2 ml, from the values you entered." — a powder vial only (the
// ready-to-use concentration is typed by the user, nothing to explain).
function concentrationNote(p, t, language) {
  if (!p || p.type !== 'recon' || concentrationText(p, language) == null) return null;
  return glueOperators(fill(t('protocols_calc_note_conc'), {
    amount: `${decimalText(storedNumber(p.amount), language)}${NB}${unitText(p.unit, language)}`,
    water: `${decimalText(trimZeros(storedNumber(p.water)), language)}${NB}ml`,
  }));
}

// "* Volume = 7.5 mg ÷ 15 mg/ml = 0.5 ml, or 50.0 units (100 units per ml)." On an ml
// syringe (2 / 3 / 5 ml, AP-21) it ends at the ml. `draw` is the computeDraw result the
// screen already shows; `size` the protocol's syringe. A dose in another mass unit than the
// concentration also shows converted: "250 mcg (0.25 mg) ÷ 2.5 mg/ml".
function volumeNote(p, draw, size, t, language) {
  if (!p || !draw || !draw.drawML || draw.drawUnits == null) return null;
  const conc = concentrationText(p, language);
  const doseNum = storedNumber(p.dose);
  if (conc == null || doseNum == null) return null;
  const massUnit = massUnitOf(p);
  let dose = `${decimalText(doseNum, language)}${NB}${unitText(p.dose_unit, language)}`;
  if (p.dose_unit && massUnit && p.dose_unit !== massUnit) {
    const converted = plainNumber(normalizeDoseValue(p.dose, massUnit, p.dose_unit));
    dose += ` (${decimalText(converted, language)}${NB}${unitText(massUnit, language)})`;
  }
  const vars = {
    dose,
    conc,
    ml: `${decimalText(trimZeros(draw.drawML), language)}${NB}ml`,
    units: decimalText(draw.drawUnits, language),
  };
  return glueOperators(fill(t(isMlSyringe(size) ? 'protocols_calc_note_volume_ml' : 'protocols_calc_note_volume'), vars));
}

module.exports = { concentrationText, concentrationNote, volumeNote };
