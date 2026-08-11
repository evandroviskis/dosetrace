'use strict';
// Pure serving arithmetic for oral supplements — no React Native/Expo imports,
// so it runs under plain `node --test`. Every value is user-entered; these
// functions do arithmetic ONLY and make no dosing recommendation.
//
// Model: a "serving" carries `servingStrength` of active compound and is made of
// `servingUnits` physical units (e.g. 500 mg per serving = 2 gummies → 250 mg per
// gummy). To reach a target dose you take `targetDose / strengthPerUnit` units.

// Mass units → micrograms. IU is compound-specific and never mass-convertible.
const MASS_TO_MCG = { mcg: 1, mg: 1000, g: 1000000 };

// Two dose units are comparable if identical, or both are mass units.
function unitsComparable(u1, u2) {
  if (u1 === u2) return true;
  return MASS_TO_MCG[u1] != null && MASS_TO_MCG[u2] != null;
}

// Express a strength value in the target dose's unit. null when not convertible.
function toDoseUnit(value, fromUnit, doseUnit) {
  if (fromUnit === doseUnit) return value;
  const mcg = MASS_TO_MCG[fromUnit] != null ? value * MASS_TO_MCG[fromUnit] : null;
  const f = MASS_TO_MCG[doseUnit];
  if (mcg == null || f == null) return null;
  return mcg / f;
}

// Per-form traits: whether it's a countable (discrete) unit, whether a unit is
// practically splittable, and the i18n key for its unit noun. The UI formats the
// label; this module only classifies.
const FORMS = {
  Capsule: { discrete: true, splittable: false, unitKey: 'oral_unit_capsule' },
  Tablet: { discrete: true, splittable: true, unitKey: 'oral_unit_tablet' },
  Softgel: { discrete: true, splittable: false, unitKey: 'oral_unit_softgel' },
  Gummy: { discrete: true, splittable: false, unitKey: 'oral_unit_gummy' },
  Powder: { discrete: false, splittable: true, unitKey: 'oral_unit_scoop' },
  Liquid: { discrete: false, splittable: true, unitKey: 'oral_unit_ml' },
};

function round(n, dp) { const f = 10 ** dp; return Math.round(n * f) / f; }

// How many units (and servings) to take to reach the target dose.
// inputs: { targetDose, doseUnit, servingStrength, servingStrengthUnit, servingUnits, form }
// Returns:
//   { valid, unitMismatch, form, discrete, splittable, unitKey,
//     unitsNeeded, servingsNeeded, isWhole,
//     nearest: { lowUnits, lowDose, highUnits, highDose } | null }
function computeServings(inp) {
  const form = inp.form || 'Capsule';
  const formInfo = FORMS[form] || FORMS.Capsule;
  const base = { valid: false, unitMismatch: false, form, ...formInfo, nearest: null };

  const targetDose = parseFloat(inp.targetDose);
  const servingStrength = parseFloat(inp.servingStrength);
  const servingUnits = parseFloat(inp.servingUnits) || 1;
  const doseUnit = inp.doseUnit || 'mg';
  const strengthUnit = inp.servingStrengthUnit || 'mg';

  if (!(targetDose > 0) || !(servingStrength > 0) || !(servingUnits > 0)) return base;
  if (!unitsComparable(doseUnit, strengthUnit)) return { ...base, unitMismatch: true };

  const perServing = toDoseUnit(servingStrength, strengthUnit, doseUnit); // in doseUnit
  if (!(perServing > 0)) return base;
  const perUnit = perServing / servingUnits; // one physical unit, in doseUnit
  if (!(perUnit > 0)) return base;

  const unitsNeeded = targetDose / perUnit;
  const servingsNeeded = targetDose / perServing;
  const isWhole = Math.abs(unitsNeeded - Math.round(unitsNeeded)) < 1e-9;

  let nearest = null;
  if (formInfo.discrete && !isWhole) {
    const low = Math.floor(unitsNeeded);
    const high = Math.ceil(unitsNeeded);
    nearest = {
      lowUnits: low,
      lowDose: round(low * perUnit, 3),
      highUnits: high,
      highDose: round(high * perUnit, 3),
    };
  }

  return {
    ...base,
    valid: true,
    unitsNeeded: round(unitsNeeded, 2),
    servingsNeeded: round(servingsNeeded, 2),
    isWhole,
    nearest,
  };
}

// Whole days of supply left: floor((unitsLeft / unitsPerDose) / dosesPerDay).
// null when inputs are unusable. Feeds the "servings left / days remaining" UI
// and the restock heads-up.
function supplyDaysLeft(unitsLeft, unitsPerDose, dosesPerDay) {
  const u = parseFloat(unitsLeft);
  const upd = parseFloat(unitsPerDose);
  const dpd = parseFloat(dosesPerDay) || 1;
  if (!(u >= 0) || !(upd > 0)) return null;
  return Math.floor((u / upd) / dpd);
}

module.exports = { unitsComparable, computeServings, supplyDaysLeft, FORMS };
