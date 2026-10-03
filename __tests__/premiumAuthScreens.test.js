'use strict';
// The screens wire the approved Premium / Onboarding / Auth design (docs/specs/premium-and-auth.md).
// The rules themselves are tested in paywallPlans / authFlow / onboardingSteps tests; these
// check the screens use them and keep the store rules, the AI line and the theme.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const PAY = read('screens', 'PaywallScreen.js');
const AUTH = read('screens', 'AuthScreen.js');
const ONB = read('screens', 'OnboardingFlowScreen.js');
const RESET = read('screens', 'ResetPasswordScreen.js');
const APP = read('App.js');
const i18n = read('i18n', 'translations.js');
const valuesOf = (key) => [...i18n.matchAll(new RegExp(`(?:\\n\\s+|, )${key}: (['"])((?:\\\\.|(?!\\1).)*)\\1`, 'g'))].map((m) => m[2]);

test('PA-1: the paywall header is a drawn chevron + Back, never a font arrow', () => {
  assert.match(PAY, /<BackChevron color=\{colors\.ink\} \/>/);
  assert.match(PAY, /t\('back'\)/);
  assert.doesNotMatch(PAY, /paywall_back|←|›/);
  assert.match(PAY, /<RowChevron color=\{colors\.tick\} \/>/, 'the preview rows use the drawn row chevron');
});

test('PA-5 / PA-7: no price, saving or trial length is written in the paywall — all from the store', () => {
  assert.doesNotMatch(PAY, /[$€£]\s?\d|R\$|\d+[.,]\d\d\s?(USD|BRL|EUR)/, 'no hard-coded money');
  assert.doesNotMatch(PAY, /37|Save \d/);
  for (const fn of ['pickPackages', 'paywallView', 'savingsPct', 'perMonthString', 'ctaModel', 'defaultPlan', 'purchaseOutcome', 'restoreOutcome', 'outcomeSheet', 'comparisonRows', 'includedLines', 'storeName']) {
    assert.match(PAY, new RegExp(`\\b${fn}\\(`), fn);
  }
  assert.match(PAY, /pkg\.product\.priceString/);
  assert.match(PAY, /lifetimePkg\.product\.priceString/);
});

test('PA-6: no buy button before the prices AND the trial answer have loaded; offline offers Try again', () => {
  const load = PAY.slice(PAY.indexOf('const load = useCallback'), PAY.indexOf('}, [showOutcome]);'));
  assert.ok(load.indexOf('checkTrialEligibility') < load.indexOf('setLoading(false)'), 'eligibility resolves before loading ends');
  assert.match(PAY, /view === 'loading'/);
  assert.match(PAY, /view === 'unavailable'[\s\S]{0,400}onPress=\{load\}[\s\S]{0,200}pw_try_again/);
  assert.match(PAY, /view === 'plans'/);
  assert.equal(valuesOf('pw_try_again').length, 6);
});

test('PA-12 / PA-13 / PA-16: purchase, restore and already-Premium speak through DoseTrace sheets', () => {
  assert.match(PAY, /<DTSheet config=\{sheet\}/);
  assert.match(PAY, /showOutcome\('premium_already'\)/);
  assert.match(PAY, /showOutcome\(outcome === 'failed' \? 'restore_failed' : outcome\)/);
  assert.match(PAY, /if \(outcome === 'premium'\) \{[\s\S]{0,400}leave\(\)/);
  assert.doesNotMatch(PAY, /Alert/);
  const purchases = read('lib', 'purchases.js');
  assert.match(purchases, /PAYMENT_PENDING_ERROR/, 'Ask to Buy is recognised');
  assert.match(purchases, /if \(isPendingError\(err\)\) return \{ success: false, pending: true \}/);
});

test('PA-11 / PA-15: Apple 3.1.2 — billing text names the store, Restore + Terms (EULA) + Privacy stay', () => {
  assert.match(PAY, /t\(cta\.legalKey\)\.replace\(\/\\\{store\\\}\/g, storeName\(Platform\.OS\)\)/);
  assert.match(PAY, /t\('paywall_restore'\)/);
  assert.match(PAY, /termsTarget\(Platform\.OS\)/);
  assert.match(PAY, /openURL\(PRIVACY_URL\)/);
});

test('PA-4: the previews follow the prototype titles and never interpret (AI hard line), 6 languages', () => {
  const prev = read('components', 'FeaturePreviews.js');
  assert.match(prev, /key: 'protos', icon: 'stack', titleKey: 'pw_prev_protos_title', bodyKey: 'pw_prev_protos_body'/);
  assert.match(prev, /key: 'pdf', icon: 'download', titleKey: 'pw_prev_pdf_title', bodyKey: 'pw_prev_pdf_body'/);
  const INTERPRET = /out of range|drifting|too high|too low|abnormal|healthy range|fuera de rango|fora (do|da) faixa|hors (de la )?norme|außerhalb|fuori (dal|norma)|due soon|up to date/i;
  for (const key of ['serum_preview_body', 'pw_prev_reality_body', 'nutri_locked_sub', 'pw_prev_scan_body', 'pw_prev_labs_body', 'pw_prev_vax_body', 'pw_prev_protos_body', 'pw_prev_pdf_body']) {
    const v = valuesOf(key);
    assert.equal(v.length, 6, key);
    for (const s of v) assert.doesNotMatch(s, INTERPRET, `${key}: ${s}`);
  }
  for (const s of valuesOf('pw_prev_vax_body')) assert.doesNotMatch(s, /reminder|recordatorio|lembrete|rappels d|Erinnerung|promemoria/i, 'no vaccine reminders exist — the preview must not promise them');
  for (const s of valuesOf('pw_prev_scan_body')) assert.doesNotMatch(s, /Premium/, 'prototype text, no "Included with Premium"');
});

test('PA-2: the hero line follows the prototype in 6 languages (more scans, no number)', () => {
  const v = valuesOf('paywall_hero_sub');
  assert.equal(v.length, 6);
  assert.equal(v[0], 'Dose-accumulation curves from your own log, unlimited protocols, more scans, and PDF export.');
  for (const s of v) assert.doesNotMatch(s, /\d/);
});

test('PA-54: the Apple button is the system AppleAuthenticationButton, CONTINUE, black / white per theme, first', () => {
  assert.match(AUTH, /AA\.AppleAuthenticationButtonType\.CONTINUE/);
  assert.match(AUTH, /isDark \? AA\.AppleAuthenticationButtonStyle\.WHITE : AA\.AppleAuthenticationButtonStyle\.BLACK/);
  assert.ok(AUTH.indexOf('<AppleSignInButton') < AUTH.indexOf('<GoogleMark />'), 'Apple first');
  assert.match(AUTH, /appleBtn: \{ height: 52 \}/);
});

test('PA-55: the Google button follows Google\'s branding (Google Sans Medium, current G, 12 pt gap, light/dark)', () => {
  const { GOOGLE_SANS_MEDIUM } = { GOOGLE_SANS_MEDIUM: 'GoogleSans_500Medium' };
  assert.match(read('lib', 'fonts.js'), new RegExp(`GOOGLE_SANS_MEDIUM = '${GOOGLE_SANS_MEDIUM}'`));
  assert.match(AUTH, /\[GOOGLE_SANS_MEDIUM\]: require\('\.\.\/assets\/fonts\/GoogleSans_500Medium\.ttf'\)/);
  assert.ok(fs.statSync(path.join(__dirname, '..', 'assets', 'fonts', 'GoogleSans_500Medium.ttf')).size > 100000);
  assert.match(read('assets', 'fonts', 'GoogleSans-OFL.txt'), /SIL Open Font License, Version 1\.1/, 'the OFL travels with the font');
  assert.match(AUTH, /googleBtnText: \{ fontSize: 17 \},\n\s+googleBtnFont: \{ fontFamily: GOOGLE_SANS_MEDIUM \}/);
  assert.match(AUTH, /blue: '#4285F4', green: '#34A853', yellow: '#FBBC04', red: '#E94235'/);
  assert.doesNotMatch(AUTH, /#EA4335|#FBBC05/, 'the old G colours are gone');
  assert.match(AUTH, /googleBtn: \{ minHeight: 52, borderRadius: 26, borderWidth: 1,[^}]*gap: 12, paddingLeft: 16, paddingRight: 16 \}/);
  assert.match(AUTH, /googleBtnLight: \{ backgroundColor: '#FFFFFF', borderColor: '#747775' \}/);
  assert.match(AUTH, /googleBtnDark: \{ backgroundColor: '#131314', borderColor: '#8E918F' \}/);
  assert.match(AUTH, /googleBtnTextLight: \{ color: '#1F1F1F' \}/);
  assert.match(AUTH, /googleBtnTextDark: \{ color: '#E3E3E3' \}/);
  assert.match(AUTH, /isDark \? s\.googleBtnDark : s\.googleBtnLight/);
  for (const s of valuesOf('onboarding_google_signin')) assert.match(s, /Google/);
});

test('PA-50 / PA-51: Create account and Sign in views per the prototype (eye, example address, both links)', () => {
  assert.match(AUTH, /placeholder=\{t\('auth_email_ph'\)\}/);
  assert.equal((AUTH.match(/<AuthField/g) || []).length, 2);
  assert.match(AUTH, /password\n\s+autoComplete=\{isSignIn \? 'current-password' : 'new-password'\}/);
  assert.match(read('components', 'AuthField.js'), /secureTextEntry=\{password && !shown\}/);
  assert.match(AUTH, /onboarding_ready_title/);
  assert.match(AUTH, /onboarding_signin_title/);
  assert.match(AUTH, /handleForgotPassword/);
  assert.match(AUTH, /onBack\(mode\)/, 'Back reports which view it left');
  for (const k of ['auth_email_ph', 'auth_show_password', 'auth_hide_password', 'auth_agree_terms_privacy']) assert.equal(valuesOf(k).length, 6, k);
  for (const s of valuesOf('auth_agree_terms_privacy')) { assert.match(s, /\{terms\}/); assert.match(s, /\{privacy\}/); }
});

test('PA-53 / PA-58: email exists stays on Create with the address; not-confirmed offers Resend', () => {
  assert.match(AUTH, /next === 'exists'[\s\S]{0,300}signup_email_exists_title/);
  const exists = AUTH.slice(AUTH.indexOf("next === 'exists'"), AUTH.indexOf("next === 'exists'") + 400);
  assert.doesNotMatch(exists, /setMode|switchMode|setIsSignIn/, 'no jump to Sign in');
  assert.match(AUTH, /isNotConfirmed\(result\.error\)[\s\S]{0,400}signup_resend[\s\S]{0,60}onPress: handleResend/);
  for (const s of valuesOf('signup_email_exists_msg')) assert.match(s, /Apple/);
  assert.match(read('lib', 'authDraft.js'), /let draftEmail = '';/);
});

test('PA-59: Apple / Google sign-in from Create account honour the consent box (and undo on cancel)', () => {
  assert.match(AUTH, /socialConsentPatch\(\{ mode, consent: consentGiven, stash, nowISO: now \}\)/);
  assert.match(AUTH, /if \(canceled \|\| error\) \{ if \(patch\) await saveOnboarding\(prior\); \}/);
  assert.match(AUTH, /setConsentGiven\(isStashFresh\(\) && initialConsent\(st\)\)/);
});

test('PA-56: Forgot password is honest — "If an account exists" (6 languages)', () => {
  const v = valuesOf('forgot_password_sent_msg');
  assert.equal(v.length, 6);
  for (const s of v) { assert.match(s, /\{email\}/); assert.match(s, /^(If|Si|Se|Falls)\b/); }
});

test('PA-65: Reset password — two fields with the eye, sheets for every message, success signs in', () => {
  assert.equal((RESET.match(/<AuthField/g) || []).length, 2);
  assert.match(RESET, /validateNewPassword\(password, confirm\)/);
  assert.match(RESET, /title: t\('reset_pw_done_title'\),\n\s+body: t\(res\.signedIn === false \? 'reset_pw_done_signin' : 'reset_pw_done_msg'\)/);
  assert.match(RESET, /if \(wasDone && onDone\)/);
  assert.equal(valuesOf('reset_pw_done_msg')[0], "You\\'re signed in with your new password.");
  assert.equal(valuesOf('reset_pw_sub')[0], 'Choose a new password for your account.');
});

test('PA-66: email links: confirmed and failed both show a DoseTrace sheet', () => {
  assert.match(APP, /if \(!ok\) \{[\s\S]{0,160}setLinkFailed\('confirm'\);/);
  assert.match(APP, /<DTSheet config=\{linkSheet\} onClose=\{closeLinkSheet\} \/>/);
  assert.doesNotMatch(APP, /Alert\./);
  for (const k of ['auth_link_failed_title', 'auth_link_failed_msg']) assert.equal(valuesOf(k).length, 6, k);
});

test('PA-30 / PA-40: the 8 steps; both buttons of "Never miss a dose" go to Create account; the welcome Sign in goes to Sign in', () => {
  assert.match(ONB, /onPress=\{enableNotifications\}/);
  assert.match(ONB, /async function enableNotifications\(\) \{[\s\S]{0,200}toAuth\('create'\)/);
  assert.match(ONB, /onPress=\{\(\) => toAuth\('create'\)\}[\s\S]{0,120}ob_not_now/);
  assert.match(ONB, /onPress=\{\(\) => toAuth\('signin'\)\}[\s\S]{0,120}onboarding_already_have_account/);
  assert.doesNotMatch(ONB, /'ready'|ob_ready_sub|ob_create_account/, 'the "You\'re all set" step is gone');
  assert.match(APP, /setAuthEntry\(\{ mode: mode === 'signin' \? 'signin' : 'create', consent: false \}\)/);
  assert.match(APP, /initialMode=\{authEntry\.mode\} \/>/);
});

test('PA-31: the welcome screen shows the droplet app icon near the top (prototype position), not the blue square', () => {
  assert.match(ONB, /require\('\.\.\/assets\/adaptive-icon\.png'\)\} style=\{s\.logo\}/);
  assert.match(ONB, /splashHead: \{ alignItems: 'center', gap: 14, paddingTop: 90 \}/);
  assert.doesNotMatch(ONB, /applogo/);
});

test('PA-33 / PA-34 / PA-39: onboarding copy as approved, the AI line reads, never analyses (6 languages)', () => {
  assert.equal(valuesOf('ob_feat2_t')[0], 'Dose accumulation');
  assert.equal(valuesOf('ob_feat5_t')[0], 'Lab test journal');
  assert.deepEqual(valuesOf('ob_feat5_t'), valuesOf('body_card_labs_title'), 'one term per concept: the journal\'s own name');
  assert.deepEqual(valuesOf('ob_feat2_t'), valuesOf('body_card_dosing_title'));
  assert.equal(valuesOf('ob_goal_title')[0], 'What are your goals?');
  assert.equal(valuesOf('ob_term3_t')[0], 'AI only when you use it');
  const ai = valuesOf('ob_term3_d');
  assert.equal(ai.length, 6);
  for (const s of ai) {
    assert.match(s, /Anthropic/);
    assert.doesNotMatch(s, /analy|analis|anális|analysi/i, 'reads, never analyses');
  }
  assert.match(ai[0], /AI food log/);
});

test('PA-35: the adults-only note and the country bottom sheet', () => {
  assert.match(ONB, /year\.note \? <Text style=\{s\.note\}>\{t\('ob_adult_note'\)\.replace\('\{max\}', String\(year\.max\)\)\}/);
  for (const s of valuesOf('ob_adult_note')) assert.match(s, /1900.*\{max\}/);
  assert.match(ONB, /<BottomSheet visible=\{showCountry\}/);
  assert.doesNotMatch(ONB, /presentationStyle="pageSheet"/, 'the full-page iOS country picker is gone');
});

test('PA-39 / PA-63: Terms of service AND Privacy policy linked on the consent step and on Create account', () => {
  const consent = ONB.slice(ONB.indexOf("cur === 'consent'"), ONB.indexOf("cur === 'reminders'"));
  assert.match(consent, /settings_terms/);
  assert.match(consent, /settings_privacy_policy/);
  assert.match(ONB, /content=\{t\('settings_terms_body'\)\}/);
});

test('PA-41: Finish setup writes only the shown steps and reports a failed save in a sheet', () => {
  assert.match(ONB, /accountPatch\(form, meta, new Date\(\)\.toISOString\(\), steps\)/);
  assert.match(ONB, /refreshForm\(cur, meta, touched\.current\)/);
  assert.match(ONB, /friendlyError\(error, t, 'error_save_failed'\)/);
  assert.match(ONB, /t\('ob_finish_setup'\)/);
  assert.match(ONB, /handleSignOut[\s\S]{0,120}markIntentionalSignOut\(\)/, 'the sign-out escape is a real, intended sign-out');
});

test('PA-68: Gate B invariants kept — onAuthStateChange stays synchronous; the wipe needs an intended sign-out', () => {
  const cb = APP.slice(APP.indexOf('supabase.auth.onAuthStateChange('), APP.indexOf('// Sign in with Apple: if the user revokes'));
  assert.match(cb, /onAuthStateChange\(\(_event, session\) => \{/, 'not async');
  const body = cb.slice(cb.indexOf('=> {') + 4).split('setTimeout(')[0];
  assert.doesNotMatch(body.replace(/\/\/[^\n]*/g, ''), /await|supabase\./, 'nothing awaited or called on supabase before deferring');
  assert.match(cb, /const intentional = consumeIntentionalSignOut\(\);/);
  assert.match(cb, /if \(!intentional\) return; \/\/ spurious: keep local data/);
});

test('PA-69: no raw colours in the redesigned screens except the Google brand button', () => {
  const strip = (src) => src.replace(/\/\/[^\n]*/g, '').replace(/googleBtn\w*: \{[^}]*\}/g, '').replace(/GOOGLE_G = \{[^}]*\}/, '');
  for (const [name, src] of [['PaywallScreen', PAY], ['AuthScreen', AUTH], ['OnboardingFlowScreen', ONB], ['ResetPasswordScreen', RESET], ['AuthField', read('components', 'AuthField.js')]]) {
    const body = strip(src);
    assert.doesNotMatch(body, /#[0-9A-Fa-f]{3,8}\b/, `${name}: hex colour`);
    assert.doesNotMatch(body, /'(white|black)'|rgba?\(/, `${name}: named / rgba colour`);
  }
});
