'use strict';
// Sign-in / Create account / Reset password rules (docs/specs/premium-and-auth.md
// PA-50…PA-72). Pure (node --test). Every message a user sees is an app string in their
// language — a raw server message is never shown (it is logged by friendlyError).
const { friendlyError } = require('./friendlyError');

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const MIN_PASSWORD = 6;

// Create account / Sign in, before anything is sent. → null, or { key } of the message
// for the error sheet (in the order the prototype checks them).
function validateCredentials({ mode, email, password, consent }) {
  const em = String(email || '').trim();
  const pw = String(password || '').trim();
  if (!em || !pw) return { key: 'auth_missing_fields' };
  if (!EMAIL_RE.test(em)) return { key: 'auth_invalid_email' };
  if (mode === 'create' && pw.length < MIN_PASSWORD) return { key: 'auth_password_too_short' };
  if (mode === 'create' && !consent) return { key: 'consent_required' };
  return null;
}

// Reset password (the emailed link): the two new-password fields. Trimmed exactly as sign-in
// and sign-up trim the password, so a new password can always be used to sign in (Gate B).
function newPasswordValue(pw) {
  return String(pw == null ? '' : pw).trim();
}
function validateNewPassword(pw, confirm) {
  const a = newPasswordValue(pw);
  if (a.length < MIN_PASSWORD) return { key: 'auth_password_too_short' };
  if (a !== newPasswordValue(confirm)) return { key: 'reset_pw_mismatch' };
  return null;
}

// Supabase hides an existing address on sign-up: a user with no identities.
function isDuplicateSignup(result) {
  const ids = result && result.data && result.data.user && result.data.user.identities;
  return Array.isArray(ids) && ids.length === 0;
}

// What a successful sign-up shows: auto-confirmed projects return a session (App.js routes
// on it), otherwise the "Account created" screen.
function signupNext(result) {
  if (!result || result.error) return 'error';
  if (isDuplicateSignup(result)) return 'exists';
  if (result.data && result.data.session) return 'signed_in';
  return 'confirm';
}

function rawOf(err) {
  return String((err && (err.code || '')) + ' ' + ((err && (err.message || err.error_description || err.error)) || err || '')).toLowerCase();
}

// A server/SDK error → the localized sentence. Reset-password specifics first, then the
// shared mapping (network / credentials / not confirmed / rate limit / generic).
function authErrorMessage(err, t, context) {
  const m = rawOf(err);
  if (context === 'reset') {
    if (/same_password|should be different|different from the old/.test(m)) return t('reset_pw_same');
    if (/session_not_found|session missing|auth session|jwt expired|token.*expired|expired|invalid.*token|otp_expired|refresh_token/.test(m)) return t('reset_pw_link_expired');
  }
  if (/weak_password|password should|password is too weak|pwned|known to be weak/.test(m)) return t('auth_password_weak');
  if (/user_already_exists|already registered|already been registered|email_exists/.test(m)) return t('signup_email_exists_msg');
  if (/signup.*disabled|signups not allowed/.test(m)) return t('error_generic');
  return friendlyError(err, t, context === 'signin' ? 'auth_signin_failed' : 'error_generic');
}

// Sign-in refused because the address was never confirmed: the sheet offers Resend (PA-58).
function isNotConfirmed(err) {
  return /email_not_confirmed|email not confirmed|not confirmed|confirm your email/.test(rawOf(err));
}

// "I agree to the {terms} and {privacy}" → parts in order, so the two links can be
// underlined in place in every language (word order differs).
function consentParts(sentence) {
  const out = [];
  const re = /\{(terms|privacy)\}/g;
  let last = 0, m;
  const s = String(sentence || '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ link: m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

// Which form AuthScreen opens with. An explicit request (the welcome screen's "Sign in", the
// last onboarding step's Create account) wins; otherwise a finished intro (stash with
// consent) means Create account, else Sign in (a returning, signed-out user).
function initialAuthMode(requested, stash) {
  if (requested === 'create' || requested === 'signin') return requested;
  return stash && stash.consent_accepted ? 'create' : 'signin';
}

// The consent box on Create account: always shown; ticked already when the user just
// confirmed the four onboarding confirmations (prototype obcreate: auConsent = true).
function initialConsent(stash) {
  return !!(stash && stash.consent_accepted);
}

// Apple / Google from the Create account view: the consent box decides what the new account
// records (PA-59). Ticked → the stash carries the consent (applyPendingProfile writes it to a
// fresh account); unticked → any earlier consent in the stash is withdrawn, so no consent is
// written and Finish setup asks for it. From the Sign in view the stash is left alone.
function socialConsentPatch({ mode, consent, stash, nowISO }) {
  if (mode !== 'create') return null;
  if (consent) return { consent_accepted: true, consent_date: (stash && stash.consent_date) || nowISO };
  return { consent_accepted: false, consent_date: null };
}

module.exports = {
  EMAIL_RE, MIN_PASSWORD, validateCredentials, validateNewPassword, newPasswordValue, isDuplicateSignup, signupNext,
  authErrorMessage, isNotConfirmed, consentParts, socialConsentPatch, initialAuthMode, initialConsent,
};
