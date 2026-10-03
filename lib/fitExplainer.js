// "Why it doesn't fit" — the 4-step explainer's numbers (AP-12, approved 2026-10-02:
// https://claude.ai/artifact/WHoE7BRXggmpgCjCMkhw85). Pure CJS. Every number is the user's
// own (vial amount, water or strength, dose, syringe) run through the app's calculator; the
// split buttons only divide the user's dose by 2, 3 or 7 (the approved picture) — they never
// suggest a dose. Steps: 1 your vial (per ml), 2 your syringe (what a full one holds),
// 3 why it does not fit (ml needed), 4 was it a weekly total? (splits + "No, one injection").
const { parseDecimal, computeDraw, normalizeDoseValue, trimZeros } = require('./doseMath');
const { decimalText, inputNumber } = require('./localeFormat');
const S = require('./syringes');

const SPLITS = [2, 3, 7];
const fmt4 = (n) => Number(Number(n).toPrecision(4));
const num = (v, l) => decimalText(trimZeros(String(v)), l);

// f: the wizard form (type, amount, unit, water, concentration, concentrationUnit, dose,
// doseUnit, syringeSize). Returns null when the numbers can't explain anything yet.
function explainerModel(f, language) {
  if (!f || (f.type !== 'recon' && f.type !== 'rtu')) return null;
  const draw = computeDraw({ ...f, language });
  if (!draw.rawML) return null;
  const l = language;
  const dose = parseDecimal(f.dose, l);
  const doseUnit = f.doseUnit || 'mg';
  let perMl;
  if (f.type === 'recon') {
    const amount = parseDecimal(f.amount, l), water = parseDecimal(f.water, l);
    perMl = normalizeDoseValue(String(amount / water), doseUnit, f.unit || 'mg'); // in the dose's unit
  } else {
    perMl = normalizeDoseValue(String(parseDecimal(f.concentration, l)), doseUnit, f.concentrationUnit || 'mg');
  }
  const holds = S.syringeMl(f.syringeSize);
  const full = perMl * holds;
  const splits = SPLITS.map((n) => {
    const each = fmt4(dose / n);
    const d = computeDraw({ ...f, dose: inputNumber(each, l), language: l });
    return { n, each, eachText: num(each, l), fits: !!d.rawML && !d.exceedsSyringe };
  });
  return {
    type: f.type,
    params: {
      amount: num(parseDecimal(f.amount, l), l), unit: f.unit || 'mg', water: num(parseDecimal(f.water, l), l),
      perml: num(fmt4(perMl), l), dunit: doseUnit, holds: num(holds, l), full: num(fmt4(full), l),
      dose: num(dose, l), ml: num(Math.round(draw.rawML * 100) / 100, l),
    },
    capacity: Number(f.syringeSize) > 0 ? Number(f.syringeSize) : 100,
    needUnits: draw.rawML * 100,
    fillPct: Math.min(100, (draw.rawML / holds) * 100),
    over: draw.exceedsSyringe,
    overPct: Math.max(0, ((draw.rawML - holds) / holds) * 100),
    splits,
    keyUnit: doseUnit,
  };
}

module.exports = { explainerModel, SPLITS };
