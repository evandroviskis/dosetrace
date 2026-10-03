'use strict';
// Onboarding rules + the 4 → 5 activity-level migration — docs/specs/premium-and-auth.md
// PA-30…PA-45. Never lose a choice the user made.
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../lib/onboardingSteps');
const L = require('../lib/activityLevels');

test('PA-30: the pre-account flow is the prototype\'s 8 steps; "You\'re all set" is gone', () => {
  assert.deepEqual(O.STEPS, ['splash', 'features', 'goal', 'tracking', 'about', 'routine', 'consent', 'reminders']);
  assert.deepEqual(O.activeSteps({ signedIn: false }), O.STEPS);
  assert.ok(!O.STEPS.includes('ready'));
});

test('PA-41: signed-in users with gaps see only the missing steps, then Finish setup (build-49 gate)', () => {
  assert.deepEqual(O.activeSteps({ signedIn: true, missing: ['country'], consentAccepted: true }), ['about', 'finish']);
  assert.deepEqual(O.activeSteps({ signedIn: true, missing: ['activity'], consentAccepted: true }), ['routine', 'finish']);
  assert.deepEqual(O.activeSteps({ signedIn: true, missing: [], consentAccepted: false }), ['consent', 'finish']);
  assert.deepEqual(O.activeSteps({ signedIn: true, missing: ['name', 'age', 'sex', 'country', 'goal', 'activity', 'tracking', 'provider'], consentAccepted: false }), ['goal', 'tracking', 'about', 'routine', 'consent', 'finish'], 'a brand-new Apple/Google user sees the whole profile');
});

test('PA-35: the birth year: 1900 … this year − 18; outside it the adults note shows, never a silent refusal', () => {
  const Y = 2026;
  assert.deepEqual(O.birthYearState('1990', Y), { digits: '1990', year: 1990, note: false, max: 2008 });
  assert.equal(O.birthYearState('2008', Y).year, 2008, 'turns 18 this year → allowed');
  assert.deepEqual(O.birthYearState('2012', Y), { digits: '2012', year: null, note: true, max: 2008 });
  assert.equal(O.birthYearState('1899', Y).note, true);
  assert.equal(O.birthYearState('19', Y).note, false, 'still typing → no note yet');
  assert.equal(O.birthYearState('19a9x0', Y).digits, '1990', 'digits only');
  assert.equal(O.birthYearState('199012', Y).digits, '1990', 'four at most');
  assert.equal(O.birthYearState('2009', 2027).year, 2009, 'the bound moves with the calendar (never a fixed 2008)');
  assert.equal(O.birthYearState(null, Y).digits, '');
});

test('PA-31…PA-37: Continue stays dim until each step is answered', () => {
  const full = { goals: ['fitness'], tracking: ['oral'], name: 'Sam', gender: 'female', country: 'Italy', birthMonth: 0, birthYear: 1990, activity: 'light', provider: 'yes', terms: { med: 1, est: 1, ai: 1, priv: 1 } };
  for (const s of ['splash', 'features', 'goal', 'tracking', 'about', 'routine', 'consent', 'reminders', 'finish']) assert.equal(O.canContinue(s, full), true, s);
  assert.equal(O.canContinue('goal', { ...full, goals: [] }), false);
  assert.equal(O.canContinue('tracking', { ...full, tracking: [] }), false);
  assert.equal(O.canContinue('about', { ...full, name: '   ' }), false);
  assert.equal(O.canContinue('about', { ...full, gender: '' }), false);
  assert.equal(O.canContinue('about', { ...full, country: '' }), false, 'country stays required');
  assert.equal(O.canContinue('about', { ...full, birthMonth: null }), false);
  assert.equal(O.canContinue('about', { ...full, birthYear: null }), false);
  assert.equal(O.canContinue('about', { ...full, birthMonth: 0 }), true, 'January (index 0) counts');
  assert.equal(O.canContinue('routine', { ...full, activity: '' }), false);
  assert.equal(O.canContinue('routine', { ...full, activity: 'active' }), true, 'a legacy level still counts');
  assert.equal(O.canContinue('routine', { ...full, provider: '' }), false);
  assert.equal(O.canContinue('consent', { ...full, terms: { med: 1, est: 1, ai: 1 } }), false, 'all four confirmations');
  assert.equal(O.canContinue('consent', { ...full, terms: {}, consentAccepted: true }), false, 'a stored consent never passes the step (Gate B); the signed-in flow skips the step instead');
  assert.equal(O.canContinue(undefined, full), false, 'an out-of-range step never advances');
});

test('PA-36: five activity levels, the calculator\'s scale', () => {
  assert.deepEqual(L.PROFILE_ACTIVITY.map((a) => a.key), ['sedentary', 'light', 'moderate', 'high', 'very_high']);
  const { ACTIVITY_LEVELS } = require('../lib/energyCalc');
  assert.deepEqual(L.PROFILE_ACTIVITY.map((a) => [a.labelKey, a.multiplier]), ACTIVITY_LEVELS.map((a) => [a.key, a.value]), 'one scale: same words and multipliers as the calculator');
});

test('PA-37: an existing user\'s 4-level choice migrates to the 5 levels and is never lost', () => {
  assert.equal(L.normalizeActivityLevel('sedentary'), 'sedentary');
  assert.equal(L.normalizeActivityLevel('moderate'), 'moderate');
  assert.equal(L.normalizeActivityLevel('active'), 'high');
  assert.equal(L.normalizeActivityLevel('very_active'), 'very_high');
  for (const k of ['sedentary', 'light', 'moderate', 'high', 'very_high']) assert.equal(L.normalizeActivityLevel(k), k, 'new keys stay');
  assert.equal(L.normalizeActivityLevel(' Very Active '), 'very_high', 'case / spaces');
  assert.equal(L.normalizeActivityLevel('very-active'), 'very_high');
  assert.equal(L.normalizeActivityLevel(''), '');
  assert.equal(L.normalizeActivityLevel(null), '');
  assert.equal(L.normalizeActivityLevel('athlete'), '', 'unknown → asked again, nothing invented');
  for (const old of Object.keys(L.LEGACY_TO_NEW)) assert.ok(L.activityByKey(old), `${old} lands on a level`);
  assert.equal(L.activityByKey('active').labelKey, 'cal_act_high');
  // Through the form and back to the account: the migrated key is what gets saved.
  const meta = { display_name: 'Ann', primary_goal: 'wellness', tracking_types: ['glp1'], gender: 'female', country: 'Spain', birth_year: 1980, birth_month: 12, activity_level: 'active', has_provider: 'yes', consent_accepted: true, onboarded_at: '2026-01-01T00:00:00Z' };
  const form = O.formFrom(meta);
  assert.equal(form.activity, 'high');
  const out = O.accountPatch(form, meta, '2026-10-03T12:00:00Z');
  assert.equal(out.activity_level, 'high');
  assert.equal(out.onboarded_at, '2026-01-01T00:00:00Z', 'keeps the first onboarding date');
  assert.equal(out.birth_month, 12);
  assert.ok(!('consent_accepted' in out), 'consent already on the account is not rewritten');
  assert.equal(O.stashPatch(O.formFrom({ activity_level: 'very_active' }), 'x').activity_level, 'very_high');
});

test('PA-38: the stash patch writes only what is filled (no undefined clobbers an earlier step)', () => {
  const p = O.stashPatch({ goals: ['sleep'], tracking: [], name: ' ', terms: {} }, '2026-10-03T00:00:00Z');
  assert.deepEqual(p, { primary_goal: 'sleep' });
  const all = O.stashPatch({ goals: ['a', 'b'], tracking: ['oral'], name: 'Bo', gender: 'male', country: 'Peru', birthMonth: 11, birthYear: 1970, activity: 'light', provider: 'no', terms: { med: 1, est: 1, ai: 1, priv: 1 } }, 'NOW');
  assert.deepEqual(all, { display_name: 'Bo', primary_goal: 'a,b', tracking_types: ['oral'], gender: 'male', country: 'Peru', birth_year: 1970, birth_month: 12, activity_level: 'light', has_provider: 'no', consent_accepted: true, consent_date: 'NOW', activity_scale: 5 });
});

test('PA-62: formFrom restores everything the user typed (stash or account) and rejects junk', () => {
  const f = O.formFrom({ display_name: 'Sam', primary_goal: 'fitness, sleep', tracking_types: ['peptides'], gender: 'male', country: 'Brazil', birth_year: 1990, birth_month: 1, activity_level: 'moderate', has_provider: 'yes', consent_accepted: true });
  assert.deepEqual(f.goals, ['fitness', 'sleep']);
  assert.equal(f.birthMonth, 0);
  assert.equal(f.birthYearText, '1990');
  assert.deepEqual(f.terms, { med: true, est: true, ai: true, priv: true });
  const empty = O.formFrom(null);
  assert.deepEqual([empty.goals, empty.tracking, empty.name, empty.birthMonth, empty.birthYear, empty.gender, empty.activity, empty.consentAccepted], [[], [], '', null, null, '', '', false]);
  assert.equal(O.formFrom({ gender: 'other', birth_month: 13, birth_year: '19x' }).gender, '');
  assert.equal(O.formFrom({ birth_month: 13 }).birthMonth, null);
  assert.equal(O.formFrom({ birth_year: '19x' }).birthYear, null);
  assert.equal(O.formFrom({ has_provider: false }).provider, 'false', 'a stored boolean is kept, not dropped');
});

test('PA-62: entry step — a finished intro reopens on "Never miss a dose"; anything less on the welcome screen', () => {
  const stash = { display_name: 'Sam', primary_goal: 'fitness', tracking_types: ['peptides'], gender: 'male', country: 'Brazil', birth_year: 1990, birth_month: 4, activity_level: 'moderate', has_provider: 'no', consent_accepted: true };
  assert.equal(O.STEPS[O.entryStep(stash, { consentPassed: true })], 'reminders', 'Back from Create account in the same run');
  assert.equal(O.STEPS[O.entryStep(stash)], 'consent', 'after a restart: confirm again');
  assert.equal(O.entryStep({ ...stash, consent_accepted: false }), 0);
  assert.equal(O.entryStep({}), 0);
  assert.equal(O.entryStep(null), 0);
});

test('PA-41: Finish setup writes ONLY the fields of the steps it showed — never blanks a hidden field', () => {
  const meta = { display_name: 'Ann', primary_goal: 'wellness', tracking_types: ['glp1'], gender: 'female', birth_year: 1980, birth_month: 12, activity_level: 'moderate', has_provider: 'yes', consent_accepted: true };
  // Only the country was missing → only the About step was shown.
  const form = { ...O.formFrom({}), country: 'Spain', name: '', gender: '', birthYear: null, birthMonth: null };
  const out = O.accountPatch(form, meta, 'NOW', ['about', 'finish']);
  assert.deepEqual(Object.keys(out).sort(), ['birth_month', 'birth_year', 'country', 'display_name', 'gender', 'onboarded_at'].sort());
  // …and the screen fills those from the account first (refreshForm), so nothing is blank:
  const filled = O.refreshForm(form, meta, new Set(['country']));
  const out2 = O.accountPatch(filled, meta, 'NOW', ['about', 'finish']);
  assert.equal(out2.display_name, 'Ann');
  assert.equal(out2.country, 'Spain', 'what the user typed wins');
  assert.equal(out2.birth_month, 12);
  assert.ok(!('primary_goal' in out2) && !('tracking_types' in out2) && !('activity_level' in out2), 'hidden steps untouched');
  const routineOnly = O.accountPatch({ ...O.formFrom(meta), activity: 'light' }, meta, 'NOW', ['routine', 'finish']);
  assert.deepEqual(Object.keys(routineOnly).sort(), ['activity_level', 'activity_scale', 'has_provider', 'onboarded_at']);
});

test('PA-41: the form follows the account when its profile lands mid-flow, keeping what the user touched', () => {
  const start = O.formFrom({});
  const later = { display_name: 'Sam', gender: 'male', country: 'Brazil', birth_year: 1990, birth_month: 5, consent_accepted: true };
  const r = O.refreshForm({ ...start, name: 'Samuel' }, later, new Set(['name']));
  assert.equal(r.name, 'Samuel', 'typed by the user → kept');
  assert.equal(r.country, 'Brazil');
  assert.equal(r.birthMonth, 4);
  assert.equal(r.consentAccepted, true);
  assert.deepEqual(r.terms, { med: true, est: true, ai: true, priv: true });
  const keep = O.refreshForm({ ...start, country: 'Peru' }, later, new Set());
  assert.equal(keep.country, 'Peru', 'a value already in the form is never overwritten');
});

test('PA-37: rewriting an old 4-level activity keeps the original as activity_level_legacy', () => {
  const meta = { activity_level: 'very_active', has_provider: 'no' };
  const out = O.accountPatch({ ...O.formFrom(meta) }, meta, 'NOW', ['routine', 'finish']);
  assert.equal(out.activity_level, 'very_high');
  assert.equal(out.activity_level_legacy, 'very_active');
  const fresh = O.accountPatch({ ...O.formFrom({ activity_level: 'light', has_provider: 'no' }) }, { activity_level: 'light' }, 'NOW', ['routine', 'finish']);
  assert.ok(!('activity_level_legacy' in fresh), 'a new key is not a legacy value');
});

test('PA-37: Edit profile keeps an old value it rewrites (legacyActivity) and reads old values on the new scale', () => {
  assert.deepEqual(L.legacyActivity('active', 'high'), { activity_level_legacy: 'active' });
  assert.deepEqual(L.legacyActivity('very_active', 'light'), { activity_level_legacy: 'very_active' });
  assert.deepEqual(L.legacyActivity('light', 'high'), {}, 'a new key is not legacy');
  assert.deepEqual(L.legacyActivity('', 'high'), {});
  assert.deepEqual(L.legacyActivity('athlete', 'high'), {}, 'unknown values are not claimed as legacy levels');
  const fs = require('fs'); const path = require('path');
  const settings = fs.readFileSync(path.join(__dirname, '..', 'screens', 'SettingsScreen.js'), 'utf8');
  assert.match(settings, /setActivityLevel\(normalizeActivityLevel\(user\.user_metadata\?\.activity_level\)\)/);
  assert.match(settings, /\.\.\.legacyActivity\(user\?\.user_metadata\?\.activity_level, activityLevel\)/);
  assert.match(settings, /PROFILE_ACTIVITY\.map/);
  assert.doesNotMatch(settings, /profile_activity_(sedentary|moderate|active|very_active)/, 'the 4-level list is gone');
  const onb = fs.readFileSync(path.join(__dirname, '..', 'screens', 'OnboardingFlowScreen.js'), 'utf8');
  assert.match(onb, /PROFILE_ACTIVITY\.map/);
  assert.doesNotMatch(onb, /profile_activity_(sedentary|moderate|active|very_active)/);
});
