'use strict';
// Gate B review of e0de76c (senior-engineer, 2026-10-03): every finding as a test, written red
// before the fix (docs/specs/premium-and-auth.md PA-120…PA-129).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const REDIRECT = 'dosetrace://auth-callback';
const apple = (clientId, st) => `https://appleid.apple.com/auth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=https%3A%2F%2Fx.supabase.co%2Fauth%2Fv1%2Fcallback&response_type=code&state=${st}`;

test('GB3-1 (blocker): the Android check works with today\'s Supabase Auth (state is a plain flow id, no signed referrer)', () => {
  const C = require('../lib/appleWebCheck');
  const uuid = 'ffa6c4a9-4816-4b3e-9d1f-0c7d2a1b3e44';
  const ok = { externalApple: true, finalUrl: apple('io.outcom.dosetrace.signin', uuid), bundleId: 'io.outcom.dosetrace', redirectTo: REDIRECT };
  assert.equal(C.appleWebReady(ok), true, 'Services ID + secret configured → Apple\'s page with the Services ID');
  assert.equal(C.appleWebReady({ ...ok, finalUrl: apple('io.outcom.dosetrace', uuid) }), false, 'native-only (bundle id) → hidden');
  assert.equal(C.appleWebReady({ ...ok, finalUrl: 'https://x.supabase.co/auth/v1/authorize?provider=apple&redirect_to=x' }), false, '400 "missing OAuth secret" → hidden');
  assert.equal(C.appleWebReady({ ...ok, externalApple: false }), false);
  assert.doesNotMatch(read('lib', 'appleWebCheck.js'), /referrer|atob|b64urlJson/, 'no guessing at server internals');
});

test('GB3-2: after a deletion, closing the Apple note any way still runs the local teardown, once', () => {
  const scr = read('screens', 'AgeConfirmScreen.js');
  assert.match(scr, /teardown: true/);
  assert.match(scr, /if \(closing && closing\.teardown\) runTeardown\(\);/);
  assert.match(scr, /if \(tornDown\.current\) return;\n\s+tornDown\.current = true;/);
});

test('GB3-3: Sign out on the 18+ sheet asks first and never wipes changes that are not backed up', () => {
  const scr = read('screens', 'AgeConfirmScreen.js');
  assert.match(scr, /settings_signout_confirm_local/);
  assert.match(scr, /const o = signOutOutcome\(/); // blocked → nothing signed out (signOutOutcome.test.js)
  // Order (check, then push token, then the intent flag, then sign-out): behaviour-tested in
  // __tests__/signOutOffline.test.js (Gate B 2026-10-03 F7).
  assert.match(read('lib', 'accountActions.js'), /signOutCore\(/);
  assert.match(read('lib', 'recoveryLink.js'), /return signOutIntended\(\);/, 'the reset flow uses the same sign-out (one fewer copy)');
  const i18n = read('i18n', 'translations.js');
  assert.equal((i18n.match(/\n\s+auth_signout_unsynced: /g) || []).length, 6);
});

test('GB3-4: the Apple client secret (≤ 6 months) can be made again and its expiry is tracked', () => {
  const sc = read('scripts', 'apple-client-secret.cjs');
  assert.match(sc, /ES256/);
  assert.match(sc, /aud: 'https:\/\/appleid\.apple\.com'/);
  assert.match(sc, /15777000/, 'Apple\'s maximum, about 6 months');
  assert.doesNotMatch(sc, /BEGIN PRIVATE KEY/, 'no key in the repo');
  assert.match(read('docs', 'specs', 'premium-and-auth.md'), /scripts\/apple-client-secret\.cjs/);
});

test('GB3-5: an Apple attempt that does not finish gives back the code verifier it replaced (a pending reset link keeps working)', () => {
  const web = read('lib', 'appleWeb.js');
  assert.match(web, /const before = await SecureStoreAdapter\.getItem\(verifierKey\)/);
  assert.match(web, /restoreVerifier\(\)/);
});

test('GB3-6: if Android killed the app while the Apple tab was open, the relaunch link still signs in (once, only with no session)', () => {
  const app = read('App.js');
  assert.match(app, /const isAppleReturn = u\.includes\('auth-callback'\);/);
  assert.match(app, /if \(isAppleReturn\) \{[\s\S]{0,400}if \(hasSession\) \{ rememberLink\(key\); return; \}[\s\S]{0,400}exchangeCodeForSession\(/);
});

test('GB3-8: the deletion note on Android points to account.apple.com, not the iPhone Settings app (6 languages)', () => {
  const i18n = read('i18n', 'translations.js');
  const v = [...i18n.matchAll(/\n\s+settings_delete_apple_revoke_note_android: '(.*)',/g)].map((m) => m[1]);
  assert.equal(v.length, 6);
  for (const s of v) assert.match(s, /account\.apple\.com/);
  for (const f of [['screens', 'SettingsScreen.js'], ['screens', 'AgeConfirmScreen.js']]) {
    assert.match(read(...f), /Platform\.OS === 'android' \? 'settings_delete_apple_revoke_note_android' : 'settings_delete_apple_revoke_note'/, f.join('/'));
  }
});

test('GB3-10: Download my data on a new phone first brings the account\'s records down', () => {
  const scr = read('screens', 'AgeConfirmScreen.js');
  assert.match(scr, /if \(isLocalDBEmpty\(user\.id\)\) await fullImportFromCloud\(\)\.catch\(\(\) => \{\}\);/);
});

test('GB3-12: the Android Apple button: 43% type (22 pt on 52), the busy look, German as on iOS ("Mit Apple fortfahren")', () => {
  const auth = read('screens', 'AuthScreen.js');
  assert.match(auth, /appleWebText: \{ fontSize: 22, fontWeight: '500' \}/);
  assert.match(auth, /busy && s\.busy/);
  const i18n = read('i18n', 'translations.js');
  const de = i18n.slice(i18n.indexOf("\n  'de': {"));
  assert.match(de, /\n\s+auth_continue_apple: 'Mit Apple fortfahren',/);
});
