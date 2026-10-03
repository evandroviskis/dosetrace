'use strict';
// "Continue with Apple" on Android (founder 2026-10-03 "3 sim", docs/specs/premium-and-auth.md
// PA-110…PA-115): Supabase's web OAuth flow (PKCE) on Android, behind a capability check — the
// button appears only when the server side is configured (never a dead button); iOS keeps the
// native flow untouched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../lib/appleWebCheck');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const state = (claims) => `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
const REDIRECT = 'dosetrace://auth-callback';
const appleUrl = (clientId, claims) => `https://appleid.apple.com/auth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=https%3A%2F%2Fx.supabase.co%2Fauth%2Fv1%2Fcallback&response_mode=form_post&response_type=code&scope=email+name&state=${state(claims)}`;

test('PA-110: the button shows only when the Apple provider is on, a Services ID answers the web flow, and our redirect is allow-listed', () => {
  const ok = { externalApple: true, finalUrl: appleUrl('io.outcom.dosetrace.signin', { referrer: REDIRECT }), bundleId: 'io.outcom.dosetrace', redirectTo: REDIRECT };
  assert.equal(C.appleWebReady(ok), true);
  assert.equal(C.appleWebReady({ ...ok, externalApple: false }), false, 'provider off');
  assert.equal(C.appleWebReady({ ...ok, finalUrl: appleUrl('io.outcom.dosetrace', { referrer: REDIRECT }) }), false, 'only the iOS bundle id configured (native only) → the web flow would fail');
  assert.equal(C.appleWebReady({ ...ok, finalUrl: appleUrl('io.outcom.dosetrace.signin', { referrer: 'https://dosetrace.io' }) }), false, 'redirect not allow-listed → Supabase would land on the Site URL');
  assert.equal(C.appleWebReady({ ...ok, finalUrl: 'https://x.supabase.co/auth/v1/authorize?provider=apple' }), false, 'Supabase answered with an error, no Apple page');
  assert.equal(C.appleWebReady({ ...ok, finalUrl: '' }), false);
  assert.equal(C.appleWebReady({ ...ok, finalUrl: appleUrl('io.outcom.dosetrace.signin', {}).replace(/state=[^&]+/, 'state=garbage') }), false, 'unreadable state → not ready');
  assert.equal(C.appleWebReady({ ...ok, finalUrl: `https://evil.example/auth/authorize?client_id=x&state=${state({ referrer: REDIRECT })}` }), false, 'only Apple\'s own page counts');
});

test('PA-111: the authorization code comes back on our redirect; an error or a cancel is never a sign-in', () => {
  assert.deepEqual(C.parseAppleReturn(`${REDIRECT}?code=abc`), { code: 'abc' });
  assert.deepEqual(C.parseAppleReturn(`${REDIRECT}#error=access_denied&error_description=User+cancelled`), { error: 'User cancelled' });
  assert.deepEqual(C.parseAppleReturn(`${REDIRECT}?state=x`), { error: 'no code' });
  assert.deepEqual(C.parseAppleReturn(''), { error: 'no code' });
});

test('PA-112: Android runs the Supabase web OAuth flow with PKCE on our scheme; iOS keeps the native flow untouched', () => {
  const web = read('lib', 'appleWeb.js');
  assert.match(web, /signInWithOAuth\(\{\s*provider: 'apple',\s*options: \{ redirectTo, skipBrowserRedirect: true, scopes: 'name email' \}/);
  assert.match(web, /WebBrowser\.openAuthSessionAsync\(data\.url, redirectTo\)/);
  assert.match(web, /supabase\.auth\.exchangeCodeForSession\(ret\.code\)/);
  assert.match(web, /makeRedirectUri\(\{ scheme: 'dosetrace', path: 'auth-callback' \}\)/);
  const sb = read('lib', 'supabase.js');
  const ios = sb.slice(sb.indexOf('export async function signInWithApple()'), sb.indexOf('export async function signInWithApple()') + 2600);
  assert.match(ios, /if \(Platform\.OS === 'android'\) return signInWithAppleWeb\(\);/, 'Android only');
  assert.match(ios, /AppleAuthentication\.signInAsync\(/, 'iOS: the native sheet, as before');
  assert.match(ios, /signInWithIdToken\(\{\n\s+provider: 'apple',/);
});

test('PA-113: the Android button follows Apple\'s rules (black on light / white on dark, Apple logo, "Continue with Apple", 52 pt, first) and only after the check', () => {
  const auth = read('screens', 'AuthScreen.js');
  assert.match(auth, /if \(Platform\.OS === 'android'\) \{\n\s+if \(!appleWeb\) return null;/, 'no dead button');
  assert.match(auth, /appleWebAvailable\(\)\.then/);
  assert.match(auth, /appleWebBtn: \{ height: 52, borderRadius: 26,/);
  assert.match(auth, /appleWebLight: \{ backgroundColor: '#000000' \}/);
  assert.match(auth, /appleWebDark: \{ backgroundColor: '#FFFFFF' \}/);
  assert.match(auth, /t\('auth_continue_apple'\)/);
  assert.ok(auth.indexOf('<AppleSignInButton') < auth.indexOf('<GoogleMark />'), 'Apple first, as on iOS');
  const i18n = read('i18n', 'translations.js');
  const v = [...i18n.matchAll(/\n\s+auth_continue_apple: '(.*)',/g)].map((m) => m[1]);
  assert.equal(v.length, 6);
  for (const s of v) assert.match(s, /Apple/);
});

test('PA-114: the iOS system button and native code path are unchanged (Gate B)', () => {
  const auth = read('screens', 'AuthScreen.js');
  assert.match(auth, /AA\.AppleAuthenticationButtonType\.CONTINUE/);
  assert.match(auth, /if \(Platform\.OS !== 'ios'\) return null;/, 'the native module is still loaded on iOS only');
  assert.match(read('lib', 'supabase.js'), /linkAppleToken\(credential\.authorizationCode, data\.session\.access_token\)/);
});
