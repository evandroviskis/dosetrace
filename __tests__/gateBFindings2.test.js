'use strict';
// Gate B re-review of 01e44eb (senior-engineer, 2026-10-03): every finding as a test, written red
// before the fix (docs/specs/premium-and-auth.md PA-90…PA-99).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const slice = (src, start, len = 1600) => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, i + len); };

test('GB2-1: Reset password has a way out (Not now) and a dead link session is dropped, never a trap', () => {
  const reset = read('screens', 'ResetPasswordScreen.js');
  assert.match(reset, /t\('ob_not_now'\)/, 'a visible Not now');
  assert.match(reset, /discardPendingRecovery\(\)/);
  assert.match(reset, /if \(res\.terminal\)/, 'a dead session ends the reset');
  const R = require('../lib/recoveryFlow');
  for (const m of ['Invalid Refresh Token: Already Used', 'refresh_token_not_found', 'Session not found', 'User not found', 'session_not_found', 'user_not_found']) {
    assert.equal(R.isTerminalRecoveryError({ message: m }), true, m);
  }
  for (const m of ['New password should be different from the old password.', 'Password should be at least 6 characters', 'Network request failed']) {
    assert.equal(R.isTerminalRecoveryError({ message: m }), false, m);
  }
  assert.match(read('lib', 'recoveryLink.js'), /isTerminalRecoveryError\(/);
});

test('GB2-2 / GB2-8: a link is deduped in memory at once; it is remembered only after it worked or the server refused it', () => {
  const app = read('App.js');
  assert.match(app, /if \(seenLinks\.current\.has\(key\)\) return;\n\s+seenLinks\.current\.add\(key\);/, 'synchronous, before the first await');
  assert.match(app, /const rememberLink = /);
  const R = require('../lib/recoveryFlow');
  assert.equal(R.isTransientLinkError({ message: 'Network request failed' }), true);
  assert.equal(R.isTransientLinkError({ message: 'Failed to fetch' }), true);
  assert.equal(R.isTransientLinkError({ message: 'invalid flow state, no valid flow state found' }), false);
  assert.match(app, /if \(!isTransientLinkError\(r\.error\)\) rememberLink\(key\);/, 'an offline failure can be retried with the same link');
});

test('GB2-3: a finished onboarding that was not confirmed in this run reopens on Before we begin, not on Create account', () => {
  const app = read('App.js');
  assert.match(app, /Promise\.all\(\[hasSeenOnboarding\(\), loadOnboarding\(\)\]\)/);
  assert.match(app, /setSeenOnboarding\(!!seen && !hasAnswers\(stash\)\)/);
});

test('GB2-4: Wrong address? Go back signs up again WITH the answers', () => {
  const auth = read('screens', 'AuthScreen.js');
  assert.match(auth, /const fresh = isStashFresh\(\) \|\| usedFreshRef\.current;/);
  assert.match(auth, /if \(fresh\) \{ usedFreshRef\.current = true; clearOnboarding\(\)\.catch\(\(\) => \{\}\); \}/);
});

test('GB2-5: Continue on the other-account sheet never wipes changes that are not backed up', () => {
  const R = require('../lib/recoveryFlow');
  const db = { getAllSync: (sql, [uid]) => (sql.includes('dose_logs') && uid === 'u1' ? [{ id: 1 }] : []) };
  const pend = (d, table, uid) => d.getAllSync(`SELECT * FROM ${table} WHERE sync_status = 'pending' AND user_id = ?`, [uid]);
  assert.equal(R.unsyncedCount(db, 'u1', ['protocols', 'dose_logs'], pend), 1);
  assert.equal(R.unsyncedCount(db, 'u2', ['protocols', 'dose_logs'], pend), 0);
  const broken = { getAllSync: () => { throw new Error('no such table'); } };
  assert.equal(R.unsyncedCount(broken, 'u1', ['x'], pend), 0, 'a missing table counts nothing');
  // Since 2026-10-03 (Gate B round 3) the reset flow uses the one deliberate sign-out.
  assert.match(read('lib', 'recoveryLink.js'), /return signOutIntended\(\);/);
  // The check-before-sign-out order is a behaviour test now (__tests__/signOutOffline.test.js,
  // Gate B 2026-10-03 F7); App never opens the reset while still signed in.
  assert.match(read('lib', 'accountActions.js'), /signOutCore\(/);
  assert.match(read('App.js'), /if \(r && \(r\.blocked \|\| r\.failed\)\) \{ setLinkFailed\('offline'\); return; \}/);
  const i18n = read('i18n', 'translations.js');
  assert.equal((i18n.match(/\n\s+reset_switch_offline: /g) || []).length, 6);
});

test('GB2-6: unticking a confirmation is written as no consent (the stash never keeps an old "true")', () => {
  const O = require('../lib/onboardingSteps');
  const p = O.stashPatch({ terms: { med: true, est: true, ai: false, priv: true } }, 'NOW');
  assert.equal(p.consent_accepted, false);
  assert.equal(p.consent_date, null);
  assert.equal(O.stashPatch({ terms: { med: 1, est: 1, ai: 1, priv: 1 } }, 'NOW').consent_accepted, true);
});

test('GB2-7: a session refreshed inside the reset is written back to the pending recovery', () => {
  const link = read('lib', 'recoveryLink.js');
  const save = slice(link, 'export async function saveRecoveryPassword', 1400);
  assert.ok(save.indexOf('writePending(') > 0 && save.indexOf('writePending(') < save.indexOf('temp.auth.updateUser'), 'saved before the password call can fail');
});

test('GB2-9: closing the other-account sheet is a Cancel; Continue keeps the link pending', () => {
  const app = read('App.js');
  assert.match(app, /onSwitchClose=\{\(\) => \{ setSwitchAsk\(null\); discardPendingRecovery\(\); \}\}/);
  assert.match(app, /savePendingRecovery\(p\)/);
});

test('GB2-10: paywall — the store guard always resets, no swipe / hardware back mid-purchase, a cancelled subscription is not "renewing"', () => {
  const pay = read('screens', 'PaywallScreen.js');
  assert.ok((pay.match(/finally \{\n\s+busyRef\.current = false;/g) || []).length >= 2, 'try/finally on purchase and restore');
  assert.match(pay, /navigation\.setOptions\?\.\(\{ gestureEnabled: !\(purchasing \|\| restoring\) \}\)/);
  assert.match(pay, /hardwareBackPress', \(\) => busyRef\.current\)/);
  const purchases = read('lib', 'purchases.js');
  assert.match(purchases, /subscriptionsByProductIdentifier\?\.\[id\]\?\.willRenew !== false/);
});

test('GB2-11: every auth action (Sign in / Create / Forgot / Apple / Google) shares one synchronous guard', () => {
  const auth = read('screens', 'AuthScreen.js');
  for (const fn of ['async function handleAuth() {', 'async function handleForgotPassword() {']) {
    assert.match(slice(auth, fn, 200), /if \(busyRef\.current\) return;\n\s+busyRef\.current = true;/, fn);
  }
});

test('GB2-12: any sign-out ends the answers\' freshness (another account signing in later never gets them)', () => {
  const app = read('App.js');
  const cb = app.slice(app.indexOf('supabase.auth.onAuthStateChange('), app.indexOf('// Sign in with Apple: if the user revokes'));
  const signedOut = cb.slice(cb.indexOf("if (_event === 'SIGNED_OUT') {"), cb.indexOf('setTimeout('));
  assert.match(signedOut, /endStashFreshness\(\);/);
  assert.match(read('lib', 'onboardingStore.js'), /export function endStashFreshness\(\) \{ fresh = false; \}/);
});
