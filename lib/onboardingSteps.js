'use strict';
// Onboarding rules (docs/specs/premium-and-auth.md PA-30…PA-45). Pure (node --test); the
// screen (screens/OnboardingFlowScreen.js) renders what these decide.
//
// Pre-account (no session): the prototype's 8 steps; after "Never miss a dose" both
// buttons go to Create account (the "You're all set" step is gone, founder 2026-09-29).
// Signed-in (an Apple/Google sign-up or a returning account missing required fields, the
// build-49 gate): only the missing steps, consent if never recorded, then the "Finish
// setup" screen that writes the profile to the account.
const { normalizeActivityLevel } = require('./activityLevels');

const STEPS = ['splash', 'features', 'goal', 'tracking', 'about', 'routine', 'consent', 'reminders'];
const CONSENT_TERMS = ['med', 'est', 'ai', 'priv'];
const MIN_BIRTH_YEAR = 1900;
const ADULT_AGE = 18;

function maxBirthYear(thisYear) { return thisYear - ADULT_AGE; }

// The typed birth year: digits only (max 4). year = the accepted number or null;
// note = true when 4 digits were typed but they are outside 1900…(this year − 18)
// (the adults-only note shows and Continue stays dim — never a silent refusal).
function birthYearState(text, thisYear) {
  const digits = String(text == null ? '' : text).replace(/[^0-9]/g, '').slice(0, 4);
  const n = parseInt(digits, 10);
  const ok = digits.length === 4 && n >= MIN_BIRTH_YEAR && n <= maxBirthYear(thisYear);
  return { digits, year: ok ? n : null, note: digits.length === 4 && !ok, max: maxBirthYear(thisYear) };
}

function activeSteps({ signedIn, missing = [], consentAccepted = false }) {
  if (!signedIn) return STEPS.slice();
  const need = new Set(missing);
  const out = [];
  if (need.has('goal')) out.push('goal');
  if (need.has('tracking')) out.push('tracking');
  if (need.has('name') || need.has('age') || need.has('sex') || need.has('country')) out.push('about');
  if (need.has('activity') || need.has('provider')) out.push('routine');
  if (!consentAccepted) out.push('consent');
  out.push('finish');
  return out;
}

// d = { goals[], tracking[], name, birthMonth (0–11|null), birthYear (number|null),
//       gender, country, activity, provider, terms {med,est,ai,priv}, consentAccepted }
function canContinue(step, d) {
  if (!step) return false;
  if (step === 'goal') return (d.goals || []).length > 0;
  if (step === 'tracking') return (d.tracking || []).length > 0;
  if (step === 'about') return !!String(d.name || '').trim() && (d.gender === 'male' || d.gender === 'female') && !!String(d.country || '').trim() && d.birthMonth != null && d.birthYear != null;
  if (step === 'routine') return !!normalizeActivityLevel(d.activity) && !!d.provider;
  if (step === 'consent') return !!d.consentAccepted || CONSENT_TERMS.every((k) => d.terms && d.terms[k]);
  return true;
}

// The stash (lib/onboardingStore) or the account's metadata → the form's values, so a
// user who comes BACK (from Create account, after the app was killed, or a signed-in user
// with gaps) sees what they already entered. Old 4-level activity keys are migrated.
function formFrom(src) {
  const m = src || {};
  const goals = String(m.primary_goal || '').split(',').map((x) => x.trim()).filter(Boolean);
  const by = m.birth_year != null && /^\d{4}$/.test(String(m.birth_year)) ? Number(m.birth_year) : null;
  const bm = m.birth_month != null && Number(m.birth_month) >= 1 && Number(m.birth_month) <= 12 ? Number(m.birth_month) - 1 : null; // stored 1-based
  return {
    goals,
    tracking: Array.isArray(m.tracking_types) ? m.tracking_types.slice() : [],
    name: m.display_name || '',
    birthMonth: bm,
    birthYear: by,
    birthYearText: by != null ? String(by) : '',
    gender: m.gender === 'male' || m.gender === 'female' ? m.gender : '',
    country: m.country || '',
    activity: normalizeActivityLevel(m.activity_level),
    provider: m.has_provider != null && String(m.has_provider) !== '' ? String(m.has_provider) : '',
    terms: m.consent_accepted ? { med: true, est: true, ai: true, priv: true } : {},
    consentAccepted: !!m.consent_accepted,
  };
}

// The stash patch for what is filled in so far: only keys with a value (saveOnboarding
// merges, so an undefined would clobber a value from an earlier step).
function stashPatch(d, nowISO) {
  const consent = canContinue('consent', d);
  const patch = {
    display_name: String(d.name || '').trim() || undefined,
    primary_goal: (d.goals || []).length ? d.goals.join(',') : undefined,
    tracking_types: (d.tracking || []).length ? d.tracking.slice() : undefined,
    gender: d.gender || undefined,
    country: d.country || undefined,
    birth_year: d.birthYear != null ? d.birthYear : undefined,
    birth_month: d.birthMonth != null ? d.birthMonth + 1 : undefined,
    activity_level: normalizeActivityLevel(d.activity) || undefined,
    has_provider: d.provider || undefined,
    consent_accepted: consent || undefined,
    consent_date: consent ? (d.consentDate || nowISO) : undefined,
  };
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
  return patch;
}

// Signed-in "Finish setup": the account write. Only the fields of the steps the user was
// shown (journey review 2026-10-03: writing every field from local state blanked fields that
// were hidden because the account already had them). Supabase merges top-level keys of
// user_metadata, so untouched keys stay. onboarded_at is kept; consent is recorded only if it
// never was. An old 4-level activity value that gets rewritten is kept as
// activity_level_legacy (never lost).
const STEP_FIELDS = {
  goal: ['primary_goal'],
  tracking: ['tracking_types'],
  about: ['display_name', 'gender', 'country', 'birth_year', 'birth_month'],
  routine: ['activity_level', 'has_provider'],
};
function accountPatch(d, meta, nowISO, shownSteps) {
  const m = meta || {};
  const shown = new Set(shownSteps || ['goal', 'tracking', 'about', 'routine', 'consent']);
  const all = {
    primary_goal: (d.goals || []).join(','),
    tracking_types: (d.tracking || []).slice(),
    display_name: String(d.name || '').trim(),
    gender: d.gender,
    country: String(d.country || '').trim(),
    birth_year: d.birthYear,
    birth_month: d.birthMonth != null ? d.birthMonth + 1 : null,
    activity_level: normalizeActivityLevel(d.activity),
    has_provider: d.provider,
  };
  const data = {};
  for (const [step, keys] of Object.entries(STEP_FIELDS)) {
    if (!shown.has(step)) continue;
    for (const k of keys) data[k] = all[k];
  }
  if ('activity_level' in data && m.activity_level && m.activity_level !== data.activity_level && m.activity_level !== normalizeActivityLevel(m.activity_level)) {
    data.activity_level_legacy = m.activity_level;
  }
  data.onboarded_at = m.onboarded_at || nowISO;
  if (!m.consent_accepted && shown.has('consent') && canContinue('consent', d)) {
    data.consent_accepted = true;
    data.consent_date = nowISO;
  }
  return data;
}

// The form after the account's profile changed under it (the deferred onboarding write,
// Apple's name, another device): fields the user has not touched take the account's value.
function refreshForm(cur, meta, touched) {
  const fresh = formFrom(meta);
  const out = { ...cur };
  for (const k of Object.keys(fresh)) {
    if (touched && touched.has(k)) continue;
    const empty = cur[k] == null || cur[k] === '' || (Array.isArray(cur[k]) && cur[k].length === 0) || (k === 'terms' && Object.keys(cur[k] || {}).length === 0);
    if (empty) out[k] = fresh[k];
  }
  if (fresh.consentAccepted) out.consentAccepted = true;
  return out;
}

// Where the pre-account flow opens. Back from Create account → the last step
// ("Never miss a dose") with everything kept, when the stash holds a finished flow
// (consent recorded); otherwise the welcome screen.
function entryStep(stash) {
  const d = formFrom(stash);
  const done = ['goal', 'tracking', 'about', 'routine', 'consent'].every((k) => canContinue(k, d));
  return done ? STEPS.indexOf('reminders') : 0;
}

module.exports = {
  STEPS, CONSENT_TERMS, MIN_BIRTH_YEAR, ADULT_AGE, maxBirthYear, birthYearState, activeSteps,
  canContinue, formFrom, stashPatch, accountPatch, refreshForm, entryStep, STEP_FIELDS,
};
