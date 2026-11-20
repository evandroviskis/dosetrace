'use strict';
// The entry offer screen (screens/EntryOfferScreen.js) wires the approved picture
// (docs/design/onboarding-offer.html, PT version 3 + 2026-11-20 changes). The rules are tested in
// entryOffer / referralCode / paywallPlans tests; these check the screen uses them and keeps the
// store rules, the theme, the copy rules and the 6 languages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const SRC = read('screens', 'EntryOfferScreen.js');
const i18n = read('i18n', 'translations.js');
const valuesOf = (key) => [...i18n.matchAll(new RegExp(`(?:\\n\\s+|, )${key}: (['"])((?:\\\\.|(?!\\1).)*)\\1`, 'g'))].map((m) => m[2]);
const eoKeys = [...new Set([...i18n.matchAll(/\n\s+(eo_[a-z0-9_]+):/g)].map((m) => m[1]))];

test('EO-S1: a React Navigation screen: route.params { protocolName, protocolSummary }, optional onFinish(outcome)', () => {
  assert.match(SRC, /export default function EntryOfferScreen\(\{ navigation, route, onFinish \}\)/);
  assert.match(SRC, /route\?\.params/);
  assert.match(SRC, /protocolName/);
  assert.match(SRC, /protocolSummary/);
  for (const o of ['purchased', 'free', 'closed']) assert.match(SRC, new RegExp(`finish\\('${o}'\\)`), o);
  assert.match(SRC, /if \(onFinish\) \{ onFinish\(outcome\); return; \}[\s\S]{0,120}navigation\.canGoBack\?\.\(\)[\s\S]{0,60}navigation\.goBack\(\)/, 'without onFinish it goes back when it can');
  assert.doesNotMatch(read('App.js'), /EntryOfferScreen/, 'the coordinator registers it, not this change');
});

test('EO-S2: every price from the store through offerModel; nothing written in the screen', () => {
  assert.doesNotMatch(SRC, /[$€£]\s?\d|R\$|\d+[.,]\d\d\s?(USD|BRL|EUR)/, 'no hard-coded money');
  assert.match(SRC, /offerModel\(\{/);
  assert.match(SRC, /getOfferings\(\)/);
  assert.match(SRC, /const ids = offerProductIds\(pkgs\);[\s\S]{0,120}checkTrialEligibility\(ids\)/, 'iOS asks the store about the intro for every plan shown');
  const load = SRC.slice(SRC.indexOf('const load = useCallback'), SRC.indexOf('// load-end'));
  assert.ok(load.indexOf('checkTrialEligibility') > 0 && load.indexOf('checkTrialEligibility') < load.indexOf('setLoading(false)'), 'no buy button before the eligibility answer');
});

test('EO-S3: the sample prices exist only in __DEV__ builds, labelled, and never reach a purchase', () => {
  assert.match(SRC, /dev: __DEV__/);
  assert.doesNotMatch(SRC, /dev: true/);
  assert.match(SRC, /model\.sampleLabel/);
  assert.match(SRC, /if \(model\.sample\) \{[\s\S]{0,200}eo_sample_buy_title/, 'the button explains instead of buying');
});

test('EO-S4: the purchase sends the referral attributes first, then buys through lib/purchases, outcomes through the paywall helpers', () => {
  const buy = SRC.slice(SRC.indexOf('async function doPurchase'), SRC.indexOf('async function handleRestore'));
  assert.ok(buy.indexOf('syncReferralAttributes(') > 0, 'attributes re-sent');
  assert.ok(buy.indexOf('syncReferralAttributes(') < buy.indexOf('purchasePackage('), 'BEFORE the purchase (creators AP4)');
  assert.match(buy, /purchaseOutcome\(result, premiumNow\)/);
  assert.match(SRC, /outcomeSheet\(kind, t, Platform\.OS\)/);
  assert.match(SRC, /restoreOutcome\(result, premiumNow\)/);
  assert.match(SRC, /<DTSheet config=\{sheet\}/);
  assert.doesNotMatch(SRC, /\bAlert\b/);
  assert.doesNotMatch(SRC, /fetch\(|dosetrace\.io\/api/, 'no server call (the creators server is not live)');
});

test('EO-S5: Restore, close, all plans, Terms (EULA / in-app) and Privacy are there (Apple 3.1.2)', () => {
  assert.match(SRC, /t\('paywall_restore'\)/);
  assert.match(SRC, /t\('eo_close'\)/);
  assert.match(SRC, /navigation\.navigate\('Paywall'/);
  assert.match(SRC, /termsTarget\(Platform\.OS\)/);
  assert.match(SRC, /openURL\(PRIVACY_URL\)/);
  assert.match(SRC, /<LegalModal/);
  assert.match(SRC, /t\('eo_continue_free'\)/);
  assert.match(SRC, /t\('eo_free_link'\)/);
});

test('EO-S6: no free trial and no renewal-reminder promise on this screen', () => {
  // checkTrialEligibility is the store's intro-eligibility call (it answers for paid intros too).
  assert.doesNotMatch(SRC.replace(/checkTrialEligibility/g, ''), /trial|paywall_legal'|paywall_start_trial/i);
  for (const k of eoKeys) for (const v of valuesOf(k)) assert.doesNotMatch(v, /free trial|prueba gratis|teste grátis|essai gratuit|Testphase|prova gratuita|avisa|warns you|reminds you/i, `${k}: ${v}`);
});

test('EO-S7: the extra referral month is not promised (nothing grants it yet)', () => {
  for (const k of eoKeys) for (const v of valuesOf(k)) assert.doesNotMatch(v, /extra|mês a mais|mês grátis|mes extra|mois offert|Gratismonat|mese in più/i, `${k}: ${v}`);
});

test('EO-S8: S-24 — the AI reads never say unlimited and carry no number on the Premium side (6 languages)', () => {
  for (const k of ['eo_ben_scans', 'eo_ben_scans_v', 'eo_cmp_ai_reads']) {
    const v = valuesOf(k);
    assert.equal(v.length, 6, k);
    for (const s of v) { assert.doesNotMatch(s, /unlimited|ilimitad|illimit|unbegrenzt|sin límite|sem limites/i, `${k}: ${s}`); assert.doesNotMatch(s, /\d/, `${k}: ${s}`); }
  }
});

test('EO-S9: every eo_ key exists in all 6 languages', () => {
  assert.ok(eoKeys.length >= 70, `found ${eoKeys.length}`);
  for (const k of eoKeys) assert.equal(valuesOf(k).length, 6, k);
  const used = [...SRC.matchAll(/(?<![A-Za-z0-9_])t\('(eo_[a-z0-9_]+)'\)/g)].map((m) => m[1]);
  for (const k of used) assert.ok(eoKeys.includes(k), k);
});

test('EO-S10: theme tokens only, drawn checks, no emoji, no font arrows', () => {
  const code = SRC.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/, 'no raw colours');
  assert.match(SRC, /useTheme\(\)/);
  assert.match(SRC, /<CheckMark /);
  assert.doesNotMatch(SRC, /[✓✔✕✖×←→›‹]/u);
  assert.doesNotMatch(SRC, /\p{Extended_Pictographic}/u);
});

test('EO-S11: the 12 month ticks fill with the data colour, the struck price is smaller than the billed one', () => {
  assert.match(SRC, /model\.hero\.filled/);
  assert.match(SRC, /backgroundColor: c\.data/);
  const big = Number((SRC.match(/heroPrice: \{ fontSize: (\d+)/) || [])[1]);
  const struck = Number((SRC.match(/heroStruck: \{ fontSize: (\d+)/) || [])[1]);
  assert.ok(big > struck && struck > 0, `${big} > ${struck}`);
  assert.match(SRC, /textDecorationLine: 'line-through'/);
});

test('EO-S12: the Free and Premium sheet is a separate, exported component with the 10 rows', () => {
  assert.match(SRC, /export function FreePremiumSheet\(/);
  assert.match(SRC, /freePremiumRows\(t\)/);
  assert.match(SRC, /t\('eo_cmp_title'\)/);
  assert.match(SRC, /import Modal from '\.\.\/components\/PresenceModal'/, 'the app Modal (reports itself to the update notice)');
});

test('EO-S13: the referral code row: dashed coupon, field + Apply, applied state + Remove; stored locally, its own key', () => {
  assert.match(SRC, /borderStyle: 'dashed'/);
  assert.match(SRC, /t\('eo_ref_row'\)/);
  assert.match(SRC, /t\('eo_ref_label'\)/);
  assert.match(SRC, /t\('eo_ref_apply'\)/);
  assert.match(SRC, /t\('eo_ref_applied'\)\.replace\('\{code\}'/);
  assert.match(SRC, /t\('eo_ref_remove'\)/);
  assert.match(SRC, /applyReferralCode\(/);
  assert.match(SRC, /removeReferralCode\(/);
  assert.match(SRC, /loadReferralCode\(AsyncStorage\)/);
  assert.match(SRC, /setAttributes: setCreatorAttributes/);
});
