'use strict';
// The onboarding answers on the device (the "stash") and the account they may go into
// (docs/specs/premium-and-auth.md PA-71…PA-73, decided 2026-10-03 by logic):
//  - They belong ONLY to the person who answered them in this run of the app: the flow
//    marks them fresh when it hands off to Create account / Sign in. A stash left by
//    someone else (or by an earlier run) is never written into an account — not into a
//    new email sign-up, not into an Apple / Google sign-in.
//  - Written into an account they fill ONLY the fields the account is missing (new or
//    existing account — build-49 "I need the data"); a stored value is never overwritten.
//  - Once written (or refused), they are cleared from the device. A real sign-out clears
//    them too (App.js).
// Pure (node --test); lib/onboardingStore.js does the storage.

const { normalizeActivityLevel } = require('./activityLevels');

const FIELDS = ['display_name', 'country', 'primary_goal', 'activity_level', 'gender', 'birth_year', 'birth_month', 'tracking_types', 'has_provider'];

const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

function hasAnswers(stash) {
  return !!stash && FIELDS.some((k) => !isEmpty(stash[k]));
}

// → the user_metadata patch (only missing fields + consent if never recorded), or null.
function pendingProfilePatch(stash, existing, { fresh, nowISO }) {
  if (!fresh || !stash) return null;
  const ex = existing || {};
  const out = {};
  for (const k of FIELDS) {
    if (isEmpty(stash[k])) continue;
    if (!isEmpty(ex[k])) continue; // never overwrite a stored value
    out[k] = k === 'activity_level' ? (normalizeActivityLevel(stash[k]) || stash[k]) : stash[k];
  }
  if (stash.consent_accepted && !ex.consent_accepted) {
    out.consent_accepted = true;
    out.consent_date = stash.consent_date || nowISO;
  }
  if (!Object.keys(out).length) return null;
  if (out.activity_level) out.activity_scale = 5; // the 5-level scale (Gate B)
  out.onboarded_at = ex.onboarded_at || nowISO;
  return out;
}

// The email sign-up's metadata: the stash only when it is this person's (fresh).
function signupMetadata(stash, { fresh, nowISO, normalizeActivity }) {
  const d = fresh && stash ? stash : {};
  return {
    tracking_types: Array.isArray(d.tracking_types) ? d.tracking_types : [],
    onboarded_at: nowISO,
    consent_accepted: true, // the box on Create account is ticked (validated before)
    consent_date: (fresh && d.consent_date) || nowISO,
    display_name: d.display_name || null,
    gender: d.gender || null,
    birth_month: d.birth_month != null ? d.birth_month : null, // 1-based
    birth_year: d.birth_year != null ? d.birth_year : null,
    country: d.country || null,
    primary_goal: d.primary_goal || null,
    activity_level: (normalizeActivity ? normalizeActivity(d.activity_level) : d.activity_level) || null,
    activity_scale: d.activity_level ? 5 : null, // the 5-level scale (Gate B)
    has_provider: d.has_provider || null,
  };
}

module.exports = { FIELDS, hasAnswers, pendingProfilePatch, signupMetadata };
