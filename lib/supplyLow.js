'use strict';
// S-05 / FX-11: ONE supply-low rule for the Today "Supply low" alert, the vial push
// and the Protocols badge (they used to disagree: the push said low at 2 doses and
// skipped older vials without a stored count). Pure — runs under node --test.
const { dosesPerVial, parseDecimal } = require('./doseMath');
const { computeServings } = require('./oralMath');

// Founder 2026-10-27 (option A): low = the doses left last SUPPLY_LOW_DAYS or less at the protocol's own
// pace, or only the last dose is left — never a fixed number of doses (a 4-dose weekly vial was "low"
// right after its first dose under the old 1-3 doses rule).
const SUPPLY_LOW_DAYS = 7;
// Days the doses left last: doses × interval_days ÷ doses_per_day (missing fields: once a day).
function daysOfSupply(remaining, protocol) {
  const p = protocol || {};
  const interval = Number(p.interval_days) > 0 ? Number(p.interval_days) : 1;
  const perDay = Number(p.doses_per_day) > 0 ? Number(p.doses_per_day) : 1;
  return (remaining * interval) / perDay;
}

// Doses a vial yields: the stored count, else derived from vial size ÷ dose (older
// vials have no stored count).
function vialCapacity(vial, protocol) {
  if (!vial) return null;
  if (vial.total_doses && vial.total_doses > 0) return vial.total_doses;
  const p = protocol || {};
  return dosesPerVial({ amount: p.amount, unit: p.unit, dose: p.dose, doseUnit: p.dose_unit }) || null;
}

function supplyState(vial, protocol) {
  const capacity = vialCapacity(vial, protocol);
  if (!vial || !capacity) return { capacity: capacity || null, remaining: null, low: false };
  const remaining = Math.max(0, capacity - (vial.doses_taken || 0));
  // Council 2026-10-27: never low before its first dose (a short vial was "low" the day it was mixed).
  const started = (vial.doses_taken || 0) > 0;
  return { capacity, remaining, low: started && remaining > 0 && (remaining === 1 || daysOfSupply(remaining, protocol) <= SUPPLY_LOW_DAYS + 1e-9) };
}

// DV-092 (AD-81): a capsule / tablet bottle gets the same rule and the same words — the doses left in the
// bottle (units left ÷ units per dose, whole doses), low at SUPPLY_LOW_DAYS of doses or the last one, never
// before the first dose (units_taken 0: a new bottle). Nothing known without a bottle size or a serving.
function bottleState(protocol) {
  const none = { capacity: null, remaining: null, low: false };
  const p = protocol || {};
  if (p.type !== 'oral') return none;
  const units = parseDecimal(p.container_units);
  if (!(units > 0)) return none;
  let per = null;
  try {
    const r = computeServings({ targetDose: p.dose, doseUnit: p.dose_unit, servingStrength: p.serving_strength, servingStrengthUnit: p.serving_strength_unit, servingUnits: p.serving_units, form: p.notes });
    per = r && r.valid && r.unitsNeeded > 0 ? r.unitsNeeded : null;
  } catch { per = null; }
  if (!per) return none;
  const taken = parseDecimal(p.units_taken) || 0;
  const capacity = Math.floor(units / per + 1e-9);
  const remaining = Math.max(0, Math.floor((units - taken) / per + 1e-9));
  const started = taken > 0;
  return { capacity, remaining, low: started && remaining > 0 && (remaining === 1 || daysOfSupply(remaining, p) <= SUPPLY_LOW_DAYS + 1e-9) };
}

// DV-092: the bottles as the vial-low push sees vials — one entry per bottle with its own key (b<id>,
// remembered by its cloud id too), started once a dose was taken (a new bottle starts at 0 and re-arms).
function bottleLowStates(protocols) {
  return (protocols || []).filter((p) => p && p.type === 'oral').map((p) => ({
    v: { id: `b${p.id}`, protocol_id: p.id, doses_taken: (parseDecimal(p.units_taken) || 0) > 0 ? 1 : 0, remote_id: p.remote_id ? `b:${p.remote_id}` : null, bottle: true },
    ...bottleState(p),
  })).filter((x) => x.capacity != null);
}

module.exports = { SUPPLY_LOW_DAYS, daysOfSupply, vialCapacity, supplyState, bottleState, bottleLowStates };
