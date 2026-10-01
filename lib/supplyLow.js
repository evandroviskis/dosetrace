'use strict';
// S-05 / FX-11: ONE supply-low rule for the Today "Supply low" alert, the vial push
// and the Protocols badge (they used to disagree: the push said low at 2 doses and
// skipped older vials without a stored count). Pure — runs under node --test.
const { dosesPerVial } = require('./doseMath');

const SUPPLY_LOW_DOSES = 3; // 1, 2 or 3 doses left = low

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
  return { capacity, remaining, low: remaining > 0 && remaining <= SUPPLY_LOW_DOSES };
}

module.exports = { SUPPLY_LOW_DOSES, vialCapacity, supplyState };
