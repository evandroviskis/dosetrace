'use strict';
// Onboarding answers on a shared device (decided 2026-10-03 by logic, PA-71…PA-73):
// only the person who answered them in this run gets them; they fill only MISSING fields
// (new or existing account) and never overwrite; they leave the device once written and on
// any real sign-out.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const P = require('../lib/pendingProfile');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const A_STASH = { display_name: 'Ann', gender: 'female', birth_year: 1980, birth_month: 3, country: 'Spain', primary_goal: 'sleep', tracking_types: ['glp1'], activity_level: 'light', has_provider: 'yes', consent_accepted: true, consent_date: 'D0' };

test('PA-71: someone else\'s answers never reach a different person\'s email sign-up', () => {
  const md = P.signupMetadata(A_STASH, { fresh: false, nowISO: 'NOW' });
  for (const k of ['display_name', 'gender', 'birth_year', 'birth_month', 'country', 'primary_goal', 'activity_level', 'has_provider']) assert.equal(md[k], null, k);
  assert.deepEqual(md.tracking_types, []);
  assert.equal(md.consent_date, 'NOW', 'consent is the one just ticked on Create account, not the stash\'s');
  const mine = P.signupMetadata(A_STASH, { fresh: true, nowISO: 'NOW', normalizeActivity: (v) => v });
  assert.equal(mine.display_name, 'Ann');
  assert.equal(mine.consent_date, 'D0');
});

test('PA-71: someone else\'s answers never reach an Apple / Google sign-in either', () => {
  assert.equal(P.pendingProfilePatch(A_STASH, {}, { fresh: false, nowISO: 'NOW' }), null);
  const store = read('lib', 'onboardingStore.js');
  assert.match(store, /if \(!fresh\) \{ await clearOnboarding\(\); return; \} \/\/ someone else's/, 'a stash that is not fresh is cleared unwritten');
  assert.match(store, /export function markStashFresh\(\) \{ fresh = true; \}/);
  assert.match(store, /export async function clearOnboarding\(\) \{\n  fresh = false;/, 'clearing also ends the freshness');
  assert.doesNotMatch(store, /FRESH_ACCOUNT_WINDOW_MS|created_at/, 'the 1-hour account window is gone');
  const onb = read('screens', 'OnboardingFlowScreen.js');
  assert.match(onb, /if \(cur === 'consent'\) markStashFresh\(\);/, 'only passing the consent step in this run marks them fresh');
  assert.match(onb, /if \(!signedIn \|\| !isStashFresh\(\)\) return;/, 'Finish setup shows answers only to the person who gave them');
  assert.match(read('screens', 'AuthScreen.js'), /signupMetadata\(stash, \{ fresh, nowISO/);
});

test('PA-72: the answers fill ONLY the missing fields of an existing account, never overwrite', () => {
  const existing = { display_name: 'Annette', gender: 'female', birth_year: 1979, birth_month: 7, primary_goal: 'wellness', tracking_types: ['oral'], has_provider: 'no', consent_accepted: true, onboarded_at: 'OLD' };
  const out = P.pendingProfilePatch(A_STASH, existing, { fresh: true, nowISO: 'NOW' });
  assert.deepEqual(out, { country: 'Spain', activity_level: 'light', activity_scale: 5, onboarded_at: 'OLD' });
  assert.equal(P.pendingProfilePatch(A_STASH, { ...existing, country: 'Peru', activity_level: 'active' }, { fresh: true, nowISO: 'NOW' }), null, 'nothing missing → nothing written');
  const blank = P.pendingProfilePatch(A_STASH, { display_name: '', tracking_types: [], country: null }, { fresh: true, nowISO: 'NOW' });
  assert.equal(blank.display_name, 'Ann', 'an empty stored value counts as missing');
  assert.deepEqual(blank.tracking_types, ['glp1']);
  assert.equal(blank.consent_accepted, true);
  assert.equal(blank.consent_date, 'D0');
  assert.equal(blank.onboarded_at, 'NOW');
  assert.equal(P.pendingProfilePatch({ display_name: '' }, {}, { fresh: true, nowISO: 'NOW' }), null);
  assert.equal(P.pendingProfilePatch(null, {}, { fresh: true, nowISO: 'NOW' }), null);
});

test('PA-73: the answers leave the device once written into an account and on any real sign-out', () => {
  const store = read('lib', 'onboardingStore.js');
  assert.match(store, /await clearOnboarding\(\); \/\/ written \(or nothing missing\): gone from the device/);
  assert.match(read('screens', 'AuthScreen.js'), /if \(fresh\) \{ usedFreshRef\.current = true; clearOnboarding\(\)\.catch/, 'email sign-up: cleared right after the account has them');
  assert.match(read('screens', 'OnboardingFlowScreen.js'), /clearOnboarding\(\)\.catch\(\(\) => \{\}\); \/\/ written into the account/, 'Finish setup: cleared after the save');
  const app = read('App.js');
  const wipe = app.slice(app.indexOf("afterSignedOut(intentional, {"), app.indexOf("if (_event === 'SIGNED_IN'"));
  assert.match(wipe, /\n\s+clearOnboarding,\n/, 'a real sign-out clears them (lib/signedOut runs every step)');
  assert.equal(P.hasAnswers({ consent_accepted: true }), false);
  assert.equal(P.hasAnswers({ country: 'Peru' }), true);
});
