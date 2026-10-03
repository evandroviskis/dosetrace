'use strict';
// Gate B review of 450496f (senior-engineer, 2026-10-03): every finding as a test, written red
// before the fix (docs/specs/premium-and-auth.md PA-80…PA-89).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const fnBody = (src, start, len = 1600) => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, i + len); };

test('GB-1 (blocker): Apple / Google from Create account with the box unticked are stopped by the consent sheet, before anything is written', () => {
  const auth = read('screens', 'AuthScreen.js');
  const social = fnBody(auth, 'async function social(fn) {', 900);
  const guard = social.indexOf("if (mode === 'create' && !consentGiven)");
  assert.ok(guard > 0, 'the guard exists');
  assert.ok(guard < social.indexOf('saveOnboarding('), 'it comes before any stash write');
  assert.match(social.slice(guard, guard + 200), /errorSheet\(t\('consent_required'\)\); return;/);
});

test('GB-2 (major): consent counts only when THIS person ticked the four boxes in this run; unticking withdraws it', () => {
  const O = require('../lib/onboardingSteps');
  const all = { med: true, est: true, ai: true, priv: true };
  assert.equal(O.canContinue('consent', { terms: { ...all, ai: false }, consentAccepted: true }), false, 'a stored consent no longer passes the step');
  assert.equal(O.canContinue('consent', { terms: all }), true);
  const p = O.stashPatch({ terms: { ...all, ai: false }, consentAccepted: true }, 'NOW');
  assert.ok(!('consent_accepted' in p), 'an unticked box records no consent');
  // Resume: a finished stash reopens on the consent step (boxes empty) unless the consent was
  // passed in this run (Back from Create account) — never pre-ticked for whoever holds the phone.
  const stash = { display_name: 'Sam', primary_goal: 'fitness', tracking_types: ['peptides'], gender: 'male', country: 'Brazil', birth_year: 1990, birth_month: 4, activity_level: 'moderate', has_provider: 'no', consent_accepted: true };
  assert.equal(O.STEPS[O.entryStep(stash, { consentPassed: false })], 'consent');
  assert.equal(O.STEPS[O.entryStep(stash, { consentPassed: true })], 'reminders');
  assert.deepEqual(O.formFrom(stash, { trustConsent: false }).terms, {}, 'a resumed stash never pre-ticks the boxes');
  const onb = read('screens', 'OnboardingFlowScreen.js');
  assert.match(onb, /if \(cur === 'consent'\) markStashFresh\(\);/, 'passing the consent step is what makes the answers this person\'s');
  assert.doesNotMatch(onb, /await persist\(\);\n\s+markStashFresh\(\);/, 'the hand-off alone no longer does');
  const auth = read('screens', 'AuthScreen.js');
  assert.match(auth, /setConsentGiven\(isStashFresh\(\) && initialConsent\(st\)\)/, 'the Create box starts ticked only for that person');
  assert.doesNotMatch(read('App.js'), /consent: mode !== 'signin'/, 'App no longer assumes consent from the route');
});

test('GB-3 (major): an email link that was already handled, or arrives while signed in, never shows a failure; confirm-email failures say the address may be confirmed', () => {
  const app = read('App.js');
  assert.match(app, /dosetrace_links_handled/, 'handled links are remembered');
  assert.match(app, /if \(handled\.includes\(key\)\) return;/);
  assert.match(app, /isConfirm[\s\S]{0,300}if \(hasSession\) return;/, 'a confirm link while signed in is silent');
  assert.match(app, /auth_confirm_link_failed_msg/);
  const i18n = read('i18n', 'translations.js');
  assert.equal((i18n.match(/\n\s+auth_confirm_link_failed_msg: /g) || []).length, 6);
});

test('GB-4 (minor): the typed email and the stash never outlive a real sign-out', () => {
  const app = read('App.js');
  const cb = app.slice(app.indexOf('supabase.auth.onAuthStateChange('), app.indexOf('// Sign in with Apple: if the user revokes'));
  const intended = cb.slice(cb.indexOf('const intentional = consumeIntentionalSignOut();'), cb.indexOf('setTimeout('));
  assert.match(intended, /if \(intentional\) \{ discardStashNow\(\); clearAuthDraft\(\); setSeenOnboarding\(false\); \}/, 'synchronously, before the welcome screen mounts');
  assert.match(read('lib', 'onboardingStore.js'), /export function discardStashNow\(\)/);
  assert.match(read('screens', 'AuthScreen.js'), /from '\.\.\/lib\/authDraft'/);
});

test('GB-5 (minor): the auth entry is reset when someone signs in', () => {
  const app = read('App.js');
  const signedIn = app.slice(app.indexOf("if (_event === 'SIGNED_IN' && session?.user?.id) {"), app.indexOf("if (_event === 'SIGNED_IN' && session?.user?.id) {") + 900);
  assert.match(signedIn, /setAuthEntry\(\{ mode: undefined, consent: false \}\);/);
  assert.match(signedIn, /clearAuthDraft\(\);/);
});

test('GB-6 (minor): a second tap on Apple / Google is ignored synchronously', () => {
  const social = fnBody(read('screens', 'AuthScreen.js'), 'async function social(fn) {', 400);
  assert.match(social, /if \(busyRef\.current\) return;\n\s+busyRef\.current = true;/);
});

test('GB-7 (minor): one purchase / restore at a time, Back waits, the purchase is counted even if the screen closed', () => {
  const pay = read('screens', 'PaywallScreen.js');
  assert.match(pay, /if \(busyRef\.current\) return;\n\s+busyRef\.current = true;/);
  assert.equal((pay.match(/if \(busyRef\.current\) return;/g) || []).length >= 2, true, 'purchase and restore share the guard');
  assert.match(pay, /disabled=\{purchasing \|\| restoring\}/, 'Back is disabled while the store works');
  const after = fnBody(pay, 'const outcome = purchaseOutcome(result, premiumNow);', 400);
  assert.match(after, /Analytics\.purchaseCompleted/);
  const before = fnBody(pay, 'async function doPurchase(pkg, plan) {', 1400);
  assert.ok(before.indexOf('Analytics.purchaseCompleted') < before.indexOf('if (!mounted.current)'), 'analytics before the mount check');
});

test('GB-8 (minor): a month-long trial is disclosed too, and the trial billing text says when payment happens', () => {
  const P = require('../lib/paywallPlans');
  const t = (k) => ({ paywall_per_year: 'per year', paywall_per_month: 'per month', paywall_start_trial_days: 'Start {days}-day free trial', paywall_start_trial_months: 'Start {n}-month free trial', paywall_then_price: 'Then {price} · Cancel anytime', paywall_price_cancel: '{price} · Cancel anytime', paywall_subscribe_now: 'Subscribe' }[k] || k);
  const monthTrial = { packageType: 'ANNUAL', product: { identifier: 'yearly', price: 28.99, priceString: '$28.99', introPrice: { price: 0, cycles: 1, periodUnit: 'MONTH', periodNumberOfUnits: 1 } } };
  const c = P.ctaModel({ selected: 'annual', pkgs: [monthTrial], eligibility: { yearly: true }, platform: 'ios', t });
  assert.equal(c.title, 'Start 1-month free trial');
  assert.equal(c.legalKey, 'paywall_legal');
  const andr = { packageType: 'ANNUAL', product: { identifier: 'yearly:annual', price: 28.99, priceString: '$28.99', defaultOption: { freePhase: { billingPeriod: { unit: 'MONTH', value: 1 }, billingCycleCount: 1 } } } };
  assert.equal(P.ctaModel({ selected: 'annual', pkgs: [andr], eligibility: null, platform: 'android', t }).title, 'Start 1-month free trial');
  const i18n = read('i18n', 'translations.js');
  const legal = [...i18n.matchAll(/\n\s+paywall_legal: (['"])(.*)\1,/g)].map((m) => m[2]);
  assert.equal(legal.length, 6);
  assert.doesNotMatch(legal[0], /at confirmation of purchase/, 'a free trial is not charged at confirmation');
  assert.match(legal[0], /when the (free )?trial ends/);
  assert.equal((i18n.match(/\n\s+paywall_start_trial_months: /g) || []).length, 6);
});

test('GB-9 (minor): a new password is trimmed like sign-in trims it, so it can always be used', () => {
  const A = require('../lib/authFlow');
  assert.deepEqual(A.validateNewPassword(' 12345 ', ' 12345 '), { key: 'auth_password_too_short' }, '5 characters once trimmed');
  assert.equal(A.validateNewPassword(' 123456 ', '123456'), null, 'the same password once trimmed');
  assert.equal(A.newPasswordValue(' abc123 '), 'abc123');
  assert.match(read('screens', 'ResetPasswordScreen.js'), /newPasswordValue\(password\)/);
});

test('GB-10 (minor): every activity write says which scale it is on (activity_scale: 5)', () => {
  const O = require('../lib/onboardingSteps');
  const P = require('../lib/pendingProfile');
  const form = { ...O.formFrom({ activity_level: 'moderate', has_provider: 'no' }) };
  assert.equal(O.accountPatch(form, {}, 'NOW', ['routine', 'finish']).activity_scale, 5);
  assert.ok(!('activity_scale' in O.accountPatch(form, {}, 'NOW', ['about', 'finish'])), 'no activity written → no scale');
  assert.equal(O.stashPatch({ activity: 'light', terms: {} }, 'NOW').activity_scale, 5);
  assert.equal(P.pendingProfilePatch({ activity_level: 'light', activity_scale: 5 }, {}, { fresh: true, nowISO: 'NOW' }).activity_scale, 5);
  assert.equal(P.signupMetadata({ activity_level: 'light' }, { fresh: true, nowISO: 'NOW' }).activity_scale, 5);
  assert.match(read('screens', 'SettingsScreen.js'), /activity_scale: 5,/);
});

test('GB-12 (nit): no hard-coded sample prices left in the strings; Google Sans loads only where the button is', () => {
  const i18n = read('i18n', 'translations.js');
  for (const k of ['paywall_save', 'paywall_then_annual', 'paywall_then_monthly']) assert.doesNotMatch(i18n, new RegExp(`\\n\\s+${k}: `), k);
  assert.doesNotMatch(read('lib', 'fonts.js'), /GoogleSans_500Medium\.ttf/, 'not in the startup font gate');
  assert.match(read('screens', 'AuthScreen.js'), /useFonts\(\{ \[GOOGLE_SANS_MEDIUM\]: require\('\.\.\/assets\/fonts\/GoogleSans_500Medium\.ttf'\) \}\)/);
});
