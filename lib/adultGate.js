'use strict';
// Old accounts whose stored birth year makes them under 18 (founder 2026-10-03 "2 sim";
// docs/specs/premium-and-auth.md PA-100…PA-105). Pure (node --test).
//
// The same year rule as onboarding (lib/onboardingSteps: 1900 … this year − 18): a stored
// year after (this year − 18) asks once for "I'm 18 or older". Confirmed → adult_confirmed_at
// on the account (merge-only) and never asked again. No birth year at all is not this gate:
// the build-49 profile gate asks for it (with the same 18+ rule).
const ADULT_AGE = 18;

function storedYear(meta) {
  const v = meta && meta.birth_year;
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!/^\d{4}$/.test(s)) return null;
  return Number(s);
}

function needsAdultConfirmation(meta, now = new Date()) {
  const y = storedYear(meta);
  if (y == null) return false;
  if (meta.adult_confirmed_at) return false;
  return y > now.getFullYear() - ADULT_AGE;
}

function adultConfirmPatch(nowISO) {
  return { adult_confirmed_at: nowISO };
}

module.exports = { ADULT_AGE, storedYear, needsAdultConfirmation, adultConfirmPatch };
