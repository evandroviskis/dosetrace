'use strict';
// A-147 (docs/specs/a147-forgot-password-social.md; picture docs/design/a147-forgot-password-social.html,
// founder 2026-10-20: option A, title C "Confira seu e-mail", text as drawn). "Forgot password?" on an
// account created with Google or Apple sends no email (there is no DoseTrace password), yet the sheet
// said "Link enviado". The app cannot ask which provider an address uses, so the sheet itself says it:
// a title that is true in every case, and a second paragraph, same size and colour as the text, that
// sends a Google / Apple account to its button — cited by the name the button has on the screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { forgotPasswordSheet } = require('../lib/authFlow');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = load();
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const tFor = (lang) => (k) => (tr[lang][k] == null ? k : tr[lang][k]);
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const AUTH = read('screens', 'AuthScreen.js');

test('FP-1: the title is "Confira seu e-mail" (option C), never "Link enviado"', () => {
  const pt = forgotPasswordSheet({ t: tFor('pt'), email: 'voce@gmail.com', appleShown: true });
  assert.equal(pt.title, 'Confira seu e-mail');
  assert.equal(forgotPasswordSheet({ t: tFor('en'), email: 'a@b.co', appleShown: true }).title, 'Check your email');
  for (const l of LANGS) {
    const sh = forgotPasswordSheet({ t: tFor(l), email: 'a@b.co', appleShown: true });
    assert.ok(sh.title && sh.title !== 'forgot_password_check_title', l);
    assert.doesNotMatch(sh.title, /enviado|sent|envoyé|gesendet|inviato/i, `${l}: the title must not claim a link went out`);
  }
  // Rebuild = replace: the old title key is gone in every language.
  for (const l of LANGS) assert.equal(tr[l].forgot_password_sent_title, undefined, l);
});

test('FP-2: option A, the drawn text as a second paragraph under the existing one (pt + en exact)', () => {
  const pt = forgotPasswordSheet({ t: tFor('pt'), email: 'voce@gmail.com', appleShown: true });
  assert.equal(pt.body, 'Se existir uma conta com voce@gmail.com, enviamos um link de redefinição para ele. Abra-o neste celular — a nova senha é definida dentro do DoseTrace.');
  assert.equal(pt.body2, 'Criou a conta com o Google ou com a Apple? Ela não tem senha no DoseTrace, então não há o que redefinir: entre por Continuar com o Google ou Continuar com a Apple.');
  const en = forgotPasswordSheet({ t: tFor('en'), email: 'you@gmail.com', appleShown: true });
  // Review 2026-10-26: the button names in quotes, in each language's usual marks (the app's English
  // UI strings cite a button as "Name"; French « Nom », Italian «Nome», as es / de already did).
  // Portuguese is the founder's approved text, unchanged.
  assert.equal(en.body2, 'Created your account with Google or Apple? It has no DoseTrace password, so there is nothing to reset: sign in with "Continue with Google" or "Continue with Apple".');
  const QUOTED = {
    en: ['"{google}"', '"{apple}"'], fr: ['« {google} »', '« {apple} »'], it: ['«{google}»', '«{apple}»'],
    es: ['«{google}»', '«{apple}»'], de: ['„{google}“', '„{apple}“'],
  };
  for (const [l, [g, a]] of Object.entries(QUOTED)) {
    assert.ok(tr[l].forgot_password_social_msg.includes(g) && tr[l].forgot_password_social_msg.includes(a), `${l}: both names quoted`);
    assert.ok(tr[l].forgot_password_social_msg_google.includes(g), `${l}: Google-only name quoted`);
  }
  assert.equal(tr.pt.forgot_password_social_msg, 'Criou a conta com o Google ou com a Apple? Ela não tem senha no DoseTrace, então não há o que redefinir: entre por {google} ou {apple}.');
  // Same sheet shape as before: check icon, one OK button; the note (small text, option B) is not used.
  assert.equal(pt.icon, 'check');
  assert.deepEqual(pt.buttons.map((b) => [b.label, b.kind]), [[tr.pt.ok, 'primary']]);
  assert.equal(pt.note, undefined);
  assert.equal(pt.hint, undefined);
});

test('FP-3: buttons are cited by the name they have on the screen; no Apple button → only Google', () => {
  for (const l of LANGS) {
    const t = tFor(l);
    const both = forgotPasswordSheet({ t, email: 'a@b.co', appleShown: true }).body2;
    assert.ok(both.includes(t('onboarding_google_signin')), `${l}: Google button name`);
    assert.ok(both.includes(t('auth_continue_apple')), `${l}: Apple button name`);
    assert.doesNotMatch(both, /\{(google|apple)\}/, l);
    const g = forgotPasswordSheet({ t, email: 'a@b.co', appleShown: false }).body2;
    assert.ok(g.includes(t('onboarding_google_signin')), `${l}: Google-only names the Google button`);
    assert.doesNotMatch(g, /Apple/, `${l}: Google-only never mentions Apple`);
  }
  assert.equal(
    forgotPasswordSheet({ t: tFor('pt'), email: 'a@b.co', appleShown: false }).body2,
    'Criou a conta com o Google? Ela não tem senha no DoseTrace, então não há o que redefinir: entre por Continuar com o Google.',
  );
});

test('FP-4: all 6 languages carry the three strings; Portuguese stays formal', () => {
  for (const k of ['forgot_password_check_title', 'forgot_password_social_msg', 'forgot_password_social_msg_google']) {
    for (const l of LANGS) assert.ok(typeof tr[l][k] === 'string' && tr[l][k].trim(), `${l}.${k}`);
  }
  for (const l of LANGS) {
    assert.match(tr[l].forgot_password_social_msg, /\{google\}[\s\S]*\{apple\}/, l);
    assert.match(tr[l].forgot_password_social_msg_google, /\{google\}/, l);
    assert.doesNotMatch(tr[l].forgot_password_social_msg_google, /\{apple\}|Apple/, l);
    assert.match(tr[l].forgot_password_social_msg, /DoseTrace/, l);
  }
  for (const k of ['forgot_password_check_title', 'forgot_password_social_msg', 'forgot_password_social_msg_google']) {
    assert.doesNotMatch(tr.pt[k], /\bdá para\b|\ba gente\b|\bnão deu\b/i, k);
  }
  // The {email} paragraph is unchanged and still honest ("If an account exists", PA-56).
  const sh = forgotPasswordSheet({ t: tFor('de'), email: 'x@y.de', appleShown: true });
  assert.ok(sh.body.includes('x@y.de'));
  assert.ok(forgotPasswordSheet({ t: tFor('en'), email: 'a$&b@c.io', appleShown: true }).body.includes('a$&b@c.io'), 'the address is shown literally');
});

test('FP-5: AuthScreen shows this sheet after the reset request; no auth call changed', () => {
  const fn = AUTH.slice(AUTH.indexOf('async function handleForgotPassword'), AUTH.indexOf('// Resend the signup confirmation'));
  assert.match(fn, /const \{ error \} = await sendPasswordReset\(trimmed\);/, 'the reset request is the same call');
  assert.match(fn, /if \(error\) errorSheet\(authErrorMessage\(error, t, 'reset_request'\)\);/);
  assert.match(fn, /else setSheet\(forgotPasswordSheet\(\{ t, email: trimmed, appleShown: appleButtonShown\(appleWeb\) \}\)\);/);
  assert.doesNotMatch(AUTH, /forgot_password_sent_title/);
  // The sentence reads the same two conditions the Apple button checks, so they never disagree.
  const rule = AUTH.slice(AUTH.indexOf('function appleButtonShown(appleWeb)'), AUTH.indexOf('function AppleSignInButton('));
  assert.match(rule, /if \(Platform\.OS === 'android'\) return !!appleWeb;/);
  assert.match(rule, /return !!getAppleAuth\(\)\?\.AppleAuthenticationButton;/);
  const btn = AUTH.slice(AUTH.indexOf('function AppleSignInButton('), AUTH.indexOf('export default function AuthScreen'));
  assert.match(btn, /if \(Platform\.OS === 'android'\) \{\n\s+if \(!appleWeb\) return null;/);
  assert.match(btn, /if \(!AA\?\.AppleAuthenticationButton\) return null;/);
  // The store-owned buttons are untouched (Apple HIG / Google branding).
  assert.match(AUTH, /buttonType=\{AA\.AppleAuthenticationButtonType\.CONTINUE\}/);
  assert.match(AUTH, /accessibilityLabel=\{t\('onboarding_google_signin'\)\}/);
});

test('FP-6: both themes — the second paragraph is the DTSheet body (theme tokens only)', () => {
  const PP = read('screens', 'components', 'ProtocolParts.js');
  assert.match(PP, /\{shown\.body2 \? <Text style=\{\[s\.body, s\.bodyMore\]\}>\{shown\.body2\}<\/Text> : null\}/);
  assert.match(PP, /body: \{ fontSize: 17, lineHeight: 22, color: c\.ink2 \}/);
});
