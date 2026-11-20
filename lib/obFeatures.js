'use strict';
// The example data of the five onboarding FEATURE screens (docs/specs/onboarding-protocol.md
// OB-2..OB-7, picture docs/design/onboarding-protocolo.html section 2). Pure and CommonJS so the
// numbers the screens show are tested here, never typed twice: the syringe draw comes from the
// app's own dose math (lib/doseMath computeDraw), the halving and the doses adding up from one
// half-life formula. Every value is an EXAMPLE (Composto 1, Diluente A, fictitious lab values),
// never the person's data, never a recommendation (AI/SaMD hard line).
const { computeDraw } = require('./doseMath');

// The order is binding (picture section 1): syringe, dose in body, reminders, protocols, labs.
const FEATURE_KINDS = ['syringe', 'body', 'reminders', 'protocols', 'labs'];

// OB-2: 10 mg in 2 mL, a 2,5 mg dose → 0,5 mL → 50 units on a U-100 syringe.
const SYRINGE_EXAMPLE = { type: 'recon', amount: '10', unit: 'mg', water: '2', dose: '2.5', doseUnit: 'mg', syringeSize: 100 };
function syringeUnits(ex = SYRINGE_EXAMPLE) {
  const d = computeDraw(ex);
  return d.valid ? Math.round(Number(d.drawUnits)) : null;
}

// OB-3: one dose of 100 mg with a 7-day half-life, seen every half-life (100 → 50 → 25 → 12,5).
const BODY_EXAMPLE = { dose: 100, unit: 'mg', halfLifeDays: 7, steps: 4, interval: 7, doses: 4 };
const remaining = (dose, halfLifeDays, days) => dose * Math.pow(0.5, days / halfLifeDays);
function halfLifeSteps(ex = BODY_EXAMPLE) {
  return Array.from({ length: ex.steps }, (_, i) => {
    const day = i * ex.halfLifeDays;
    return { day, mg: remaining(ex.dose, ex.halfLifeDays, day), frac: Math.pow(0.5, i) };
  });
}

// OB-3 chart: the same dose repeated every `interval` days, each dose added to what is left
// (superposition, the model the app's curve uses), plus one interval of wash-out after the last.
// Returns the curve points { day, mg }, the dose days and the level right after each dose.
function accumulation(ex = BODY_EXAMPLE, perInterval = 14) {
  const k = Math.LN2 / ex.halfLifeDays;
  const doseDays = Array.from({ length: ex.doses }, (_, i) => i * ex.interval);
  const level = (day) => doseDays.reduce((s, d0) => (day >= d0 ? s + ex.dose * Math.exp(-k * (day - d0)) : s), 0);
  const points = [{ day: 0, mg: 0 }];
  const end = ex.doses * ex.interval;
  for (let i = 0; i < ex.doses; i++) {
    const d0 = doseDays[i];
    for (let s = 0; s <= perInterval; s++) {
      const day = d0 + (ex.interval * s) / perInterval;
      if (day > end) break;
      // just before the next dose: the level before it lands (the vertical jump comes next)
      const mg = s === perInterval ? level(day - 1e-9) : level(day);
      points.push({ day, mg });
    }
  }
  const peaks = doseDays.map((d) => level(d));
  return { points, doseDays, peaks, endDay: end };
}

// OB-6: three general markers (never a hormone), fictitious values that go up and down, the
// month of each test under its point. No range, no zone, no target, one neutral colour.
const LAB_MONTHS = [2, 5, 7, 9, 10]; // Mar, Jun, Aug, Oct, Nov (0-based, lib/localeFormat MONTHS_SHORT)
const LAB_EXAMPLE = [
  { key: 'glucose', nameKey: 'obf_lab_glucose', unit: 'mg/dL', values: [94, 90, 96, 91, 92] },
  { key: 'ldl', nameKey: 'obf_lab_ldl', unit: 'mg/dL', values: [112, 121, 115, 120, 118] },
  { key: 'vitd', nameKey: 'obf_lab_vitd', unit: 'ng/mL', values: [31, 36, 33, 35, 34] },
];
function isMonotone(values) {
  let up = true, down = true;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[i - 1]) up = false;
    if (values[i] > values[i - 1]) down = false;
  }
  return up || down;
}

// OB-5: three example protocols, in the order they come in.
const PROTOCOL_EXAMPLE = [
  { nameKey: 'obf_ex_compound1', dose: '2.5', unit: 'mg', schedKey: 'obf_pro_weekly', time: '08:00', dot: 'ocean' },
  { nameKey: 'obf_ex_compound2', dose: '250', unit: 'mcg', schedKey: 'obf_pro_daily', time: '08:00', dot: 'lavender' },
  { nameKey: 'obf_ex_supplement', doseKey: 'obf_pro_capsule', schedKey: 'obf_pro_daily', time: '21:00', dot: 'amber' },
];

// OB-4: the first reminder at 08:00, "Taken" tapped, logged at 08:02; the second at 21:00.
const REMINDER_EXAMPLE = { first: '08:00', logged: '08:02', second: '21:00' };

// The kicker over each feature screen ("What DoseTrace does · n of 5") and, on the first one only,
// the intro sentence, so the tour reads as what the app does, not as a protocol (founder 2026-11-20).
function featureKicker(t, kind) {
  const i = FEATURE_KINDS.indexOf(kind);
  if (i < 0) return { kicker: null, intro: null };
  const kicker = String(t('obf_kicker') || '').replace('{n}', String(i + 1)).replace('{total}', String(FEATURE_KINDS.length));
  return { kicker, intro: i === 0 ? t('obf_intro') : null };
}

module.exports = {
  featureKicker, FEATURE_KINDS, SYRINGE_EXAMPLE, syringeUnits, BODY_EXAMPLE, halfLifeSteps, accumulation,
  LAB_MONTHS, LAB_EXAMPLE, isMonotone, PROTOCOL_EXAMPLE, REMINDER_EXAMPLE,
};
