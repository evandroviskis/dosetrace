'use strict';
// S-05 / FX-11: ONE supply-low rule for the Today "Supply low" alert, the vial push
// and the Protocols badge (they used to disagree: the push said low at 2 doses and
// skipped older vials without a stored count). Pure — runs under node --test.
const { dosesPerVial } = require('./doseMath');

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
  return { capacity, remaining, low: remaining > 0 && (remaining === 1 || daysOfSupply(remaining, protocol) <= SUPPLY_LOW_DAYS + 1e-9) };
}

module.exports = { SUPPLY_LOW_DAYS, daysOfSupply, vialCapacity, supplyState };
