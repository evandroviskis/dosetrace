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
// Facts only: it states the user's arithmetic; it never sets, suggests or checks an amount.
const { decimalText, unitText } = require('./localeFormat');
const { parseDecimal, trimZeros } = require('./doseMath');
const { isMlSyringe } = require('./syringes');

const NB = ' ';
const fill = (s, vars) => Object.keys(vars).reduce((out, k) => out.split(`{${k}}`).join(vars[k]), String(s || ''));

// The concentration as the protocol page shows it: amount ÷ water (2 decimals, trailing
// zeros dropped) for a powder; the typed value for ready to use. null when it cannot be told.
function concentrationText(p, language) {
  if (!p) return null;
  if (p.type === 'recon') {
    if (!p.amount || !p.water) return null;
    const v = parseDecimal(p.amount) / parseDecimal(p.water);
    if (!Number.isFinite(v) || v <= 0) return null;
    return `${decimalText(trimZeros(v.toFixed(2)), language)}${NB}${unitText(p.unit, language)}/ml`;
  }
  if (p.type === 'rtu') {
    if (!p.concentration) return null;
    return `${decimalText(trimZeros(p.concentration), language)}${NB}${unitText(p.concentration_unit || 'mg', language)}/ml`;
  }
  return null;
}

// "* Concentration = 30 mg ÷ 2 ml, from the values you entered." — a powder vial only (the
// ready-to-use concentration is typed by the user, nothing to explain).
function concentrationNote(p, t, language) {
  if (!p || p.type !== 'recon' || concentrationText(p, language) == null) return null;
  return fill(t('protocols_calc_note_conc'), {
    amount: `${decimalText(p.amount, language)}${NB}${unitText(p.unit, language)}`,
    water: `${decimalText(trimZeros(p.water), language)}${NB}ml`,
  });
}

// "* Volume = 7.5 mg ÷ 15 mg/ml = 0.5 ml, or 50.0 units (100 units per ml)." On an ml
// syringe (2 / 3 / 5 ml, AP-21) it ends at the ml. `draw` is the computeDraw result the
// screen already shows; `size` the protocol's syringe.
function volumeNote(p, draw, size, t, language) {
  if (!p || !draw || !draw.drawML || draw.drawUnits == null) return null;
  const conc = concentrationText(p, language);
  if (conc == null || p.dose == null || p.dose === '') return null;
  const vars = {
    dose: `${decimalText(p.dose, language)}${NB}${unitText(p.dose_unit, language)}`,
    conc,
    ml: `${decimalText(trimZeros(draw.drawML), language)}${NB}ml`,
    units: decimalText(draw.drawUnits, language),
  };
  return fill(t(isMlSyringe(size) ? 'protocols_calc_note_volume_ml' : 'protocols_calc_note_volume'), vars);
}

module.exports = { concentrationText, concentrationNote, volumeNote };
