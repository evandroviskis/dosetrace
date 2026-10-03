'use strict';
// Password-reset links (decided 2026-10-03 by logic, PA-75 / PA-76): a link for another account
// asks first, naming both; the link's session lives in an isolated client and a pending
// recovery, so killing the app on Reset password brings it back and nothing is half-written.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const R = require('../lib/recoveryFlow');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('PA-75: a reset link for another account than the one signed in asks first; same account or nobody goes straight on', () => {
  assert.equal(R.recoveryDecision({ currentUserId: null, linkUserId: 'u2' }), 'proceed');
  assert.equal(R.recoveryDecision({ currentUserId: 'u2', linkUserId: 'u2' }), 'proceed');
  assert.equal(R.recoveryDecision({ currentUserId: 'u1', linkUserId: 'u2' }), 'ask');
  assert.equal(R.recoveryDecision({ currentUserId: 'u1', linkUserId: null }), 'ask', 'unknown link owner while signed in → ask');
  const app = read('App.js');
  assert.match(app, /if \(decision === 'ask'\) setSwitchAsk\(\{ pending, current: cur\?\.user\?\.email \|\| '' \}\);/);
  assert.match(app, /t\('reset_switch_msg'\)\.replace\('\{link\}', switchAsk\.pending\.email \|\| ''\)\.split\('\{current\}'\)\.join\(switchAsk\.current \|\| ''\)/, 'the sheet names both accounts');
  assert.match(app, /\.then\(\(\) => signOutCurrentForRecovery\(\)\)[\s\S]{0,160}setRecovery\(p\);/, 'Continue: the deliberate sign-out first, then the reset');
  assert.match(app, /onSwitchCancel=\{\(\) => \{ discardPendingRecovery\(\); \}\}/, 'Cancel drops the link');
  const so = read('lib', 'accountActions.js'); // the one deliberate sign-out the reset flow uses
  assert.match(so, /forceSync\(\)[\s\S]{0,700}removePushToken\(\)[\s\S]{0,80}markIntentionalSignOut\(\);/, 'the same order as Settings → Sign out');
  const i18n = read('i18n', 'translations.js');
  for (const k of ['reset_switch_title', 'reset_switch_msg', 'reset_switch_continue']) assert.equal((i18n.match(new RegExp(`\\n\\s+${k}: `, 'g')) || []).length, 6, k);
  for (const m of i18n.matchAll(/\n\s+reset_switch_msg: '(.*)',/g)) { assert.match(m[1], /\{link\}/); assert.match(m[1], /\{current\}/); }
});

test('PA-76: the link session is isolated; only a saved password signs the app in (nothing half-written)', () => {
  const link = read('lib', 'recoveryLink.js');
  assert.match(link, /storage: memoryStorage\(seed\)/, 'the link session never touches the Keychain session');
  assert.match(link, /autoRefreshToken: false/);
  const save = link.slice(link.indexOf('export async function saveRecoveryPassword'), link.indexOf('export async function signOutCurrentForRecovery'));
  assert.ok(save.indexOf('temp.auth.updateUser({ password })') < save.indexOf('supabase.auth.setSession('), 'password first, then the app session');
  assert.doesNotMatch(link.slice(0, link.indexOf('export async function saveRecoveryPassword')), /supabase\.auth\.(setSession|exchangeCodeForSession|updateUser)/, 'opening the link never changes the app session');
  const reset = read('screens', 'ResetPasswordScreen.js');
  assert.match(reset, /saveRecoveryPassword\(recovery, newPasswordValue\(password\)\)/);
  assert.doesNotMatch(reset, /supabase\.auth\.updateUser/);
});

test('PA-76: killing the app on Reset password: the pending recovery brings the screen back for an hour', () => {
  const now = 1_000_000_000;
  const p = R.buildPending({ session: { access_token: 'a', refresh_token: 'r', user: { id: 'u', email: 'x@y.z' } } }, now);
  assert.deepEqual(p, { access_token: 'a', refresh_token: 'r', userId: 'u', email: 'x@y.z', at: now });
  assert.equal(R.pendingRecoveryUsable(p, now + 59 * 60 * 1000), true);
  assert.equal(R.pendingRecoveryUsable(p, now + 61 * 60 * 1000), false, 'expired after an hour');
  assert.equal(R.pendingRecoveryUsable({ ...p, refresh_token: '' }, now), false);
  assert.equal(R.pendingRecoveryUsable(null, now), false);
  assert.equal(R.buildPending({ session: null }, now), null);
  const app = read('App.js');
  assert.match(app, /loadPendingRecovery\(\)\.then\(\(p\) => \{ if \(p && !cancelled\) routeRecovery\(p\); \}\)/, 'cold start reopens it');
  assert.match(app, /if \(!\(await loadPendingRecovery\(\)\)\) setLinkFailed\('reset'\);/, 're-tapping the used link while it is pending shows no failure');
  assert.match(read('lib', 'recoveryLink.js'), /await discardPendingRecovery\(\);\n[\s\S]{0,300}supabase\.auth\.setSession/, 'cleared once the password is saved');
});

test('PA-75: links are parsed without the React Native URL getters; each link is handled once', () => {
  assert.deepEqual(R.parseAuthLink('dosetrace://reset-password?code=abc123'), { code: 'abc123' });
  assert.deepEqual(R.parseAuthLink('dosetrace://reset-password#access_token=A&refresh_token=B&type=recovery'), { tokens: { access_token: 'A', refresh_token: 'B' } });
  assert.deepEqual(R.parseAuthLink('dosetrace://reset-password?error=access_denied&error_description=Email+link+is+invalid+or+has+expired'), { error: 'Email link is invalid or has expired' });
  assert.deepEqual(R.parseAuthLink('dosetrace://reset-password'), { error: 'no code in link' });
  assert.equal(R.linkKey('dosetrace://confirm-email?code=Z9'), 'code:Z9');
  assert.equal(R.linkKey('dosetrace://confirm-email?code=Z9'), R.linkKey('dosetrace://confirm-email?code=Z9'));
});
