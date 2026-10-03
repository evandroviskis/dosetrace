'use strict';
// Sign-in / Create account / Reset password rules — docs/specs/premium-and-auth.md PA-50…PA-59.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../lib/authFlow');

const t = (k) => `<${k}>`;

test('PA-52: Create account checks, in order: empty → email → 6+ password → consent', () => {
  const v = (o) => A.validateCredentials({ mode: 'create', email: 'sam@x.io', password: 'secret1', consent: true, ...o });
  assert.deepEqual(v({ email: '' }), { key: 'auth_missing_fields' });
  assert.deepEqual(v({ password: '   ' }), { key: 'auth_missing_fields' });
  assert.deepEqual(v({ email: 'sam@x' }), { key: 'auth_invalid_email' });
  assert.deepEqual(v({ email: 'sam x@y.io' }), { key: 'auth_invalid_email' });
  assert.deepEqual(v({ password: '12345' }), { key: 'auth_password_too_short' });
  assert.deepEqual(v({ consent: false }), { key: 'consent_required' });
  assert.equal(v({}), null);
  assert.equal(v({ email: '  sam@x.io  ' }), null, 'spaces around the address are ignored');
});

test('PA-52: Sign in never asks for consent or a 6-character password', () => {
  assert.equal(A.validateCredentials({ mode: 'signin', email: 'a@b.co', password: '1', consent: false }), null);
  assert.deepEqual(A.validateCredentials({ mode: 'signin', email: '', password: '' }), { key: 'auth_missing_fields' });
  assert.deepEqual(A.validateCredentials({ mode: 'signin', email: 'nope', password: 'x' }), { key: 'auth_invalid_email' });
});

test('PA-53: an existing address on sign-up is detected; a new one goes to "Account created"', () => {
  assert.equal(A.signupNext({ data: { user: { identities: [] } } }), 'exists');
  assert.equal(A.signupNext({ data: { user: { identities: [{}] }, session: null } }), 'confirm');
  assert.equal(A.signupNext({ data: { user: { identities: [{}] }, session: { access_token: 'x' } } }), 'signed_in', 'auto-confirm: App.js routes on the session');
  assert.equal(A.signupNext({ error: { message: 'x' } }), 'error');
  assert.equal(A.signupNext(null), 'error');
  assert.equal(A.isDuplicateSignup({ data: { user: {} } }), false);
});

test('PA-61: reset-password server errors become friendly sentences (never the raw text)', () => {
  assert.equal(A.authErrorMessage({ code: 'same_password', message: 'New password should be different from the old password.' }, t, 'reset'), '<reset_pw_same>');
  assert.equal(A.authErrorMessage({ message: 'Auth session missing!' }, t, 'reset'), '<reset_pw_link_expired>');
  assert.equal(A.authErrorMessage({ code: 'otp_expired', message: 'Email link is invalid or has expired' }, t, 'reset'), '<reset_pw_link_expired>');
  assert.equal(A.authErrorMessage({ code: 'weak_password', message: 'Password should be at least 6 characters.' }, t, 'reset'), '<auth_password_weak>');
  assert.equal(A.authErrorMessage({ message: 'Network request failed' }, t, 'reset'), '<error_network>');
  assert.equal(A.authErrorMessage({ message: 'For security purposes, you can only request this after 30 seconds.' }, t, 'reset'), '<auth_too_many>');
  assert.equal(A.authErrorMessage({ message: 'Database error saving user' }, t, 'reset'), '<error_generic>');
  assert.equal(A.authErrorMessage(null, t, 'reset'), '<error_generic>');
  for (const raw of ['New password should be different from the old password.', 'Auth session missing!', 'Database error']) {
    assert.ok(!A.authErrorMessage({ message: raw }, t, 'reset').includes(raw));
  }
});

test('PA-59: sign-in / sign-up errors keep the precise friendly messages', () => {
  assert.equal(A.authErrorMessage({ message: 'Invalid login credentials' }, t, 'signin'), '<auth_invalid_credentials>');
  assert.equal(A.authErrorMessage({ message: 'Email not confirmed' }, t, 'signin'), '<auth_email_not_confirmed>');
  assert.equal(A.authErrorMessage({ message: 'something odd' }, t, 'signin'), '<auth_signin_failed>');
  assert.equal(A.authErrorMessage({ code: 'user_already_exists', message: 'User already registered' }, t, 'signup'), '<signup_email_exists_msg>');
  assert.equal(A.authErrorMessage({ message: 'Signups not allowed for this instance' }, t, 'signup'), '<error_generic>');
  assert.equal(A.authErrorMessage({ message: 'Failed to fetch' }, t, 'signup'), '<error_network>');
});

test('PA-60: the new-password fields: 6+ characters and matching', () => {
  assert.deepEqual(A.validateNewPassword('12345', '12345'), { key: 'auth_password_too_short' });
  assert.deepEqual(A.validateNewPassword('123456', '123457'), { key: 'reset_pw_mismatch' });
  assert.equal(A.validateNewPassword('123456', '123456'), null);
  assert.deepEqual(A.validateNewPassword(undefined, undefined), { key: 'auth_password_too_short' });
});

test('PA-63: the consent sentence splits around both links in any word order', () => {
  assert.deepEqual(A.consentParts('I agree to the {terms} and {privacy}'), [{ text: 'I agree to the ' }, { link: 'terms' }, { text: ' and ' }, { link: 'privacy' }]);
  assert.deepEqual(A.consentParts('Ich stimme den {terms} und der {privacy} zu'), [{ text: 'Ich stimme den ' }, { link: 'terms' }, { text: ' und der ' }, { link: 'privacy' }, { text: ' zu' }]);
  assert.deepEqual(A.consentParts(''), []);
});

test('PA-51: Auth opens on what was asked for; else a finished intro means Create account', () => {
  assert.equal(A.initialAuthMode('signin', { consent_accepted: true }), 'signin', 'welcome → Sign in wins');
  assert.equal(A.initialAuthMode('create', null), 'create');
  assert.equal(A.initialAuthMode(null, { consent_accepted: true }), 'create');
  assert.equal(A.initialAuthMode(undefined, {}), 'signin', 'a returning signed-out user');
  assert.equal(A.initialAuthMode(undefined, null), 'signin');
  assert.equal(A.initialConsent({ consent_accepted: true }), true, 'came from the four confirmations → ticked');
  assert.equal(A.initialConsent({}), false, 'a returning user creating a new account ticks it');
  assert.equal(A.initialConsent(null), false);
});

test('PA-58: an unconfirmed address is recognised so the sheet can offer Resend', () => {
  assert.equal(A.isNotConfirmed({ code: 'email_not_confirmed', message: 'Email not confirmed' }), true);
  assert.equal(A.isNotConfirmed({ message: 'Email not confirmed' }), true);
  assert.equal(A.isNotConfirmed({ message: 'Invalid login credentials' }), false);
  assert.equal(A.isNotConfirmed(null), false);
});

test('PA-59: Apple / Google from Create account honour the consent box; from Sign in nothing changes', () => {
  assert.deepEqual(A.socialConsentPatch({ mode: 'create', consent: true, stash: { consent_date: 'D0' }, nowISO: 'NOW' }), { consent_accepted: true, consent_date: 'D0' });
  assert.deepEqual(A.socialConsentPatch({ mode: 'create', consent: true, stash: null, nowISO: 'NOW' }), { consent_accepted: true, consent_date: 'NOW' });
  assert.deepEqual(A.socialConsentPatch({ mode: 'create', consent: false, stash: { consent_accepted: true }, nowISO: 'NOW' }), { consent_accepted: false, consent_date: null }, 'unticked: the onboarding consent is withdrawn, never written');
  assert.equal(A.socialConsentPatch({ mode: 'signin', consent: false, stash: { consent_accepted: true }, nowISO: 'NOW' }), null);
});
