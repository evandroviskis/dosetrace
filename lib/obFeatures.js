'use strict';
// The example data of the onboarding intro video (docs/specs/onboarding-protocol.md OB-3..OB-6,
// approved picture docs/design/onboarding-intro.html). Pure and CommonJS so the numbers the video
// shows are tested here, never typed twice: the syringe draw comes from the app's own dose math
// (lib/doseMath computeDraw), the dose-in-body columns from one half-life formula. Every value is
// an EXAMPLE (Composto 1, Suplemento A, fictitious lab values), never the person's data, never a
// recommendation (AI/SaMD hard line).
const { computeDraw } = require('./doseMath');

// OB-3: 10 mg in 2 mL, a 1,5 mg dose → 0,3 mL → 30 units on a U-100 syringe (30 on purpose, away
// from the middle of the scale, so it does not look staged).
const SYRINGE_EXAMPLE = { type: 'recon', amount: '10', unit: 'mg', water: '2', dose: '1.5', doseUnit: 'mg', syringeSize: 100 };
function syringeUnits(ex = SYRINGE_EXAMPLE) {
  const d = computeDraw(ex);
  return d.valid ? Math.round(Number(d.drawUnits)) : null;
}
function syringeMl(ex = SYRINGE_EXAMPLE) {
  const d = computeDraw(ex);
  return d.valid ? Math.round(Number(d.rawML) * 100) / 100 : null;
}

// OB-4: 100 mg of Composto 1 every 7 days, half-life 7 days. Each column is a dose day; each segment
// is what is left of one dose (oldest at the bottom), so the total is every dose added to what is
// left of the ones before (superposition, the model the app's curve uses): 100 · 50 + 100 · 25 + 50 + 100.
const BODY_EXAMPLE = { dose: 100, unit: 'mg', halfLifeDays: 7, interval: 7, doses: 3 };
const remaining = (dose, halfLifeDays, days) => dose * Math.pow(0.5, days / halfLifeDays);
// The age of each segment's dose, by colour: today, 7 days ago, 14 days ago.
const BODY_AGES = Array.from({ length: BODY_EXAMPLE.doses }, (_, i) => i * BODY_EXAMPLE.interval);
function bodyColumns(ex = BODY_EXAMPLE) {
  return Array.from({ length: ex.doses }, (_, i) => {
    const day = i * ex.interval;
    const segments = [];
    for (let k = 0; k <= i; k++) {
      const age = day - k * ex.interval;
      segments.push({ age, mg: remaining(ex.dose, ex.halfLifeDays, age) });
    }
    return { day, segments, total: segments.reduce((s, x) => s + x.mg, 0) };
  });
}

// OB-6: three general markers (never a hormone), fictitious values that go up and down, the
// month of each test under its point. No range, no zone, no target, one neutral colour.
const LAB_MONTHS = [2, 5, 7, 9, 10]; // Mar, Jun, Aug, Oct, Nov (0-based, lib/localeFormat MONTHS_SHORT)
const LAB_EXAMPLE = [
  { key: 'glucose', nameKey: 'obi_lab_glucose', unit: 'mg/dL', values: [94, 90, 96, 91, 92] },
  { key: 'ldl', nameKey: 'obi_lab_ldl', unit: 'mg/dL', values: [112, 121, 115, 120, 118] },
  { key: 'vitd', nameKey: 'obi_lab_vitd', unit: 'ng/mL', values: [31, 36, 33, 35, 34] },
];
function isMonotone(values) {
  let up = true, down = true;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[i - 1]) up = false;
    if (values[i] > values[i - 1]) down = false;
  }
  return up || down;
}

// OB-5: the reminder at 08:00, "Taken" tapped, logged at 08:02.
const REMINDER_EXAMPLE = { first: '08:00', logged: '08:02' };

module.exports = {
  SYRINGE_EXAMPLE, syringeUnits, syringeMl, BODY_EXAMPLE, BODY_AGES, remaining, bodyColumns,
  LAB_MONTHS, LAB_EXAMPLE, isMonotone, REMINDER_EXAMPLE,
};
