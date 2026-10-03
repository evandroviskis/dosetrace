'use strict';
// The four bugs found on the picture pages (founder 2026-10-03, docs/specs/premium-and-auth.md
// PA-60…PA-63) — written red first, kept forever.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('PA-60 bug: Reset password never shows a hard-coded English "OK"', () => {
  const src = read('screens', 'ResetPasswordScreen.js');
  assert.doesNotMatch(src, /text:\s*'OK'/);
  assert.doesNotMatch(src, />\s*OK\s*</);
});

test('PA-61 bug: Reset password never shows the raw server error', () => {
  const src = read('screens', 'ResetPasswordScreen.js');
  assert.doesNotMatch(src, /error\.message/, 'the server text (English, technical) never reaches the user');
  assert.match(src, /authErrorMessage\(res\.error, t, 'reset'\)/, 'mapped to a friendly sentence in the user\'s language');
});

test('PA-62 bug: Back from Create account reopens the last onboarding step with the entered values', () => {
  const app = read('App.js');
  assert.doesNotMatch(app, /onBackToOnboarding=\{\(\) => setSeenOnboarding\(false\)\}/, 'back used to remount the intro at step 0, empty');
  const onb = read('screens', 'OnboardingFlowScreen.js');
  assert.match(onb, /loadOnboarding\(\)/, 'the pre-account flow reads what was already entered');
  assert.match(onb, /formFrom\(/);
  assert.match(onb, /entryStep\(/, 'and opens at the step the user left (Never miss a dose)');
  // the rule itself
  const { entryStep, formFrom, STEPS } = require('../lib/onboardingSteps');
  const stash = { display_name: 'Sam', primary_goal: 'fitness', tracking_types: ['peptides'], gender: 'male', country: 'Brazil', birth_year: 1990, birth_month: 4, activity_level: 'moderate', has_provider: 'no', consent_accepted: true };
  assert.equal(STEPS[entryStep(stash, { consentPassed: true })], 'reminders');
  const f = formFrom(stash);
  assert.equal(f.name, 'Sam');
  assert.equal(f.birthMonth, 3, '1-based in storage, 0-based in the form');
  assert.equal(f.country, 'Brazil');
});

test('PA-63 bug: the consent row is always on Create account and links Terms of service AND Privacy policy', () => {
  const src = read('screens', 'AuthScreen.js');
  assert.doesNotMatch(src, /!hasStash &&/, 'the row used to hide whenever the intro ran');
  assert.match(src, /consentParts\(t\('auth_agree_terms_privacy'\)\)/);
  assert.match(src, /link === 'terms'/);
  assert.match(src, /settings_terms_body/, 'Terms of service open in the app (dosetrace.io has no terms page)');
  assert.match(src, /PRIVACY_URL/);
});

test('PA-64: no native alert is left on the paywall, sign-in, onboarding or reset-password screens', () => {
  for (const f of ['PaywallScreen.js', 'AuthScreen.js', 'OnboardingFlowScreen.js', 'ResetPasswordScreen.js']) {
    const src = read('screens', f);
    assert.doesNotMatch(src, /Alert\.alert\(/, f);
    assert.match(src, /<DTSheet/, `${f} shows its messages in DoseTrace sheets`);
  }
  assert.doesNotMatch(read('App.js'), /Alert\.alert\(t\('confirm_email_done_title'\)/, 'the confirmed-email message is a DoseTrace sheet too');
});
