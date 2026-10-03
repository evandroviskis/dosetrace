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

// Decided 2026-10-03 by logic: confirming 18+ means the stored year is wrong, and it feeds the
// calorie math — so the confirmation carries the real birth year. One merge-only write of these
// two keys; null (nothing written) unless the year is valid (1900 … this year − 18).
const MIN_BIRTH_YEAR = 1900; // the onboarding minimum (lib/onboardingSteps)

function adultYears(now = new Date()) {
  const out = [];
  for (let y = now.getFullYear() - ADULT_AGE; y >= MIN_BIRTH_YEAR; y--) out.push(y);
  return out;
}

function adultConfirmPatch(nowISO, year, now = new Date()) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < MIN_BIRTH_YEAR || y > now.getFullYear() - ADULT_AGE) return null;
  return { adult_confirmed_at: nowISO, birth_year: y };
}

module.exports = { ADULT_AGE, MIN_BIRTH_YEAR, storedYear, needsAdultConfirmation, adultYears, adultConfirmPatch };
