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
const { birthMonthIndex } = require('./profileName');

// docs/specs/onboarding-protocol.md OB-1 (founder 2026-11-20): the app first (the intro video, OB-27:
// one continuous video with a scene per feature, which replaced the five separate feature screens), then
// what she wants, the goals, the Terms BEFORE the first health-data question (OB-12), what she
// uses, her first protocol (OB-14..OB-19; "Como vem" only for a compound sold in both forms), About
// you with the routine on the same screen (OP-1) and the reminders; then Create account. The old
// single "Feito para o seu protocolo" screen is gone (rebuild = replace).
const PROTOCOL_STEPS = ['compound', 'form', 'vial', 'frequency', 'start', 'ready'];
const STEPS = ['splash', 'intro', 'help', 'goal', 'consent', 'tracking', ...PROTOCOL_STEPS, 'about', 'reminders'];
const D = require('./onboardingDraft');

// OB-8: "Como o DoseTrace pode ajudar você?" — what she wants the app to do (multi-select). The
// first choice decides where the app opens after the account is created (OB-9).
const HELP_OPTIONS = [
  { key: 'syringe', tKey: 'ob_help_syringe', icon: 'reconstitution' },
  { key: 'reminders', tKey: 'ob_help_reminders', icon: 'bell' },
  { key: 'body', tKey: 'ob_help_body', icon: 'curve' },
  { key: 'organize', tKey: 'ob_help_organize', icon: 'stack' },
  { key: 'labs', tKey: 'ob_help_labs', icon: 'lab_frame' },
];
function toggleHelp(list, key) {
  const cur = Array.isArray(list) ? list : [];
  return cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
}
// OB-9: where the app opens — her first choice. The protocol, the reminder (Today) and the dose-in-body
// chart need the protocol she built; without one those open Protocols (where she adds it).
function landingFor(help, { hasProtocol }) {
  const first = Array.isArray(help) && help.length ? help[0] : null;
  if (!first) return null;
  if (first === 'labs') return { kind: 'labs' };
  if (first === 'organize' || !hasProtocol) return { kind: 'protocols' };
  if (first === 'syringe') return { kind: 'protocol' };
  if (first === 'reminders') return { kind: 'today' };
  if (first === 'body') return { kind: 'curve' };
  return null;
}
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

// protocol: the draft protocol (lib/onboardingDraft); skipped: "Montar depois" (the protocol steps go).
// mode 'builder' (OB-26): an existing account builds its first protocol — the same screens, nothing else.
function protocolSteps(protocol) {
  return PROTOCOL_STEPS.filter((s) => s !== 'form' || D.needsForm(protocol));
}
function activeSteps({ signedIn, missing = [], consentAccepted = false, mode, protocol = null, skipped = false }) {
  if (mode === 'builder') return protocolSteps(protocol);
  if (!signedIn) {
    const keep = skipped ? [] : protocolSteps(protocol);
    return STEPS.filter((s) => !PROTOCOL_STEPS.includes(s) || keep.includes(s));
  }
  const need = new Set(missing);
  const out = [];
  if (need.has('goal')) out.push('goal');
  if (!consentAccepted) out.push('consent'); // OB-12: the Terms before the first health-data question
  if (need.has('tracking')) out.push('tracking');
  // OP-1: About you carries the routine (activity + provider) on the same screen.
  if (['name', 'age', 'sex', 'country', 'activity', 'provider'].some((k) => need.has(k))) out.push('about');
  out.push('finish');
  return out;
}

// By name, so a list that changes under the screen (a form step appearing, Montar depois) never skips
// or repeats a step.
function nextStep(steps, cur) { const i = steps.indexOf(cur); return i >= 0 && i < steps.length - 1 ? steps[i + 1] : null; }
function prevStep(steps, cur) { const i = steps.indexOf(cur); return i > 0 ? steps[i - 1] : null; }
// The step to show when `cur` is no longer in the list (a "Como vem" that went away, an account's
// steps hydrating): the next one in the full order that is still shown — never back to the start.
const ORDER = [...STEPS, 'finish'];
function stepNear(steps, cur) {
  if (!steps.length) return null;
  if (cur && steps.includes(cur)) return cur;
  const at = ORDER.indexOf(cur);
  if (at < 0) return steps[0];
  return steps.find((s) => ORDER.indexOf(s) >= at) || steps[steps.length - 1];
}
// OB-20: "Montar depois" on a protocol screen → the onboarding goes on (About you). The intro video's
// "Pular" (OB-27) stays on the step: it jumps to the video's own end frame, whose Start goes on.
function skipTarget(step) {
  if (PROTOCOL_STEPS.includes(step)) return 'about';
  return null;
}

// d = { goals[], tracking[], name, birthMonth (0–11|null), birthYear (number|null),
//       gender, country, activity, provider, terms {med,est,ai,priv}, consentAccepted }
function canContinue(step, d) {
  if (!step) return false;
  if (step === 'help') return (d.help || []).length > 0;
  if (step === 'goal') return (d.goals || []).length > 0;
  if (step === 'tracking') return (d.tracking || []).length > 0;
  if (step === 'compound') return !!(d.protocol && String(d.protocol.name || '').trim());
  if (step === 'form') return !!(d.protocol && ['recon', 'rtu', 'oral'].includes(d.protocol.form));
  if (step === 'vial') return D.vialReady(d.protocol, d.language);
  if (step === 'frequency') return D.frequencyReady(d.protocol);
  if (step === 'start') return D.startReady(d.protocol || {}, d.now || new Date());
  // OP-1: one screen, About you + the routine.
  if (step === 'about') return !!String(d.name || '').trim() && (d.gender === 'male' || d.gender === 'female') && !!String(d.country || '').trim() && d.birthMonth != null && d.birthYear != null
    && !!normalizeActivityLevel(d.activity) && !!d.provider;
  // Only the four boxes ticked by the person at the screen count (Gate B: a consent stored
  // earlier — or by someone else on this phone — never passes the step, and unticking one
  // withdraws it). The signed-in flow shows this step only when the account has no consent.
  if (step === 'consent') return CONSENT_TERMS.every((k) => d.terms && d.terms[k]);
  return true;
}

// The stash (lib/onboardingStore) or the account's metadata → the form's values, so a
// user who comes BACK (from Create account, after the app was killed, or a signed-in user
// with gaps) sees what they already entered. Old 4-level activity keys are migrated.
// trustConsent: false for a stash read back on this phone (it may be someone else's) — the
// four boxes then start empty and must be ticked again.
function formFrom(src, { trustConsent = true } = {}) {
  const m = src || {};
  const goals = String(m.primary_goal || '').split(',').map((x) => x.trim()).filter(Boolean);
  const by = m.birth_year != null && /^\d{4}$/.test(String(m.birth_year)) ? Number(m.birth_year) : null;
  const bm = birthMonthIndex(m.birth_month); // stored 1-12; an old 0-based 0 = January (founder 2026-10-31)
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
    terms: trustConsent && m.consent_accepted ? { med: true, est: true, ai: true, priv: true } : {},
    consentAccepted: trustConsent && !!m.consent_accepted,
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
    // Written either way: unticking a confirmation withdraws an earlier "true" in the stash
    // (saveOnboarding merges — Gate B re-review).
    consent_accepted: consent,
    consent_date: consent ? (d.consentDate || nowISO) : null,
  };
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
  if (patch.activity_level) patch.activity_scale = 5; // Gate B: the 5-level scale
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
  about: ['display_name', 'gender', 'country', 'birth_year', 'birth_month', 'activity_level', 'has_provider'], // OP-1
};
function accountPatch(d, meta, nowISO, shownSteps) {
  const m = meta || {};
  const shown = new Set(shownSteps || ['goal', 'tracking', 'about', 'consent']);
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
  if ('activity_level' in data) data.activity_scale = 5; // Gate B: the 5-level scale
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

// Where the pre-account flow opens, with everything kept. A finished flow reopens on
// "Never miss a dose" when its consent was given in THIS run (Back from Create account);
// otherwise on "Before we begin" with the boxes empty, so whoever holds the phone confirms
// for themselves (Gate B). Anything less opens on the welcome screen.
// → the step NAME the pre-account flow opens on.
function entryStep(stash, { consentPassed = false } = {}) {
  const d = formFrom(stash);
  const profileDone = ['goal', 'tracking', 'about'].every((k) => canContinue(k, d));
  if (!profileDone || !(stash && stash.consent_accepted)) return 'splash';
  return consentPassed ? 'reminders' : 'consent';
}

module.exports = {
  STEPS, PROTOCOL_STEPS, HELP_OPTIONS, toggleHelp, landingFor, protocolSteps, nextStep, prevStep, skipTarget, stepNear,
  CONSENT_TERMS, MIN_BIRTH_YEAR, ADULT_AGE, maxBirthYear, birthYearState, activeSteps,
  canContinue, formFrom, stashPatch, accountPatch, refreshForm, entryStep, STEP_FIELDS,
};
