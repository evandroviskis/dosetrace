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
  // Registered by the onboarding change (docs/specs/onboarding-protocol.md OB-9): its end opens her first choice.
  assert.match(read('App.js'), /<EntryOfferScreen \{\.\.\.props\} onFinish=\{\(\) => goLanding\(/);
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
  assert.doesNotMatch(SRC, /\bfetch\(|dosetrace\.io/, 'the screen never calls the server itself: lib/referralSync does');
  assert.ok(buy.indexOf('flushPendingAttribution(') > 0 && buy.indexOf('flushPendingAttribution(') < buy.indexOf('purchasePackage('), 'the server record is tried before the purchase too');
  assert.match(buy, /await syncReferralAttributes\(\)/, 'the purchase waits for the RevenueCat attributes');
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

// Coordinator 2026-11-20 (creators server live): the extra month may be promised ONLY in the applied
// state of a code the server said is valid — the server's benefit_text, else eo_ref_benefit_default.
test('EO-S7: the extra referral month appears only in the applied state of a server-valid code', () => {
  const PROMISE = /extra|mês a mais|mês grátis|mes extra|mois .*offert|Gratismonat|mese .*in più/i;
  for (const k of eoKeys) if (k !== 'eo_ref_benefit_default') for (const v of valuesOf(k)) assert.doesNotMatch(v, PROMISE, `${k}: ${v}`);
  const def = valuesOf('eo_ref_benefit_default');
  assert.equal(def.length, 6);
  assert.equal(def[2], '1 mês extra de Premium depois do primeiro pagamento.');
  for (const v of def) assert.match(v, PROMISE);
  assert.equal(SRC.split("t('eo_ref_benefit_default')").length - 1, 1, 'used once');
  assert.match(SRC, /\{refCode \? \([\s\S]{0,700}refBenefit \|\| t\('eo_ref_benefit_default'\)/, 'inside the applied branch, after the server benefit_text');
  assert.doesNotMatch(SRC, /setRefCode\((?!r\.code\)|rec\.code\)|null\))/, 'refCode only comes from a server-valid apply or the stored valid code');
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
  assert.match(SRC, /freePremiumRows\(t, \{ freeProtocols \}\)/); // OB-28: the account's free count
  assert.match(SRC, /t\('eo_cmp_title'\)/);
  assert.match(SRC, /import Modal from '\.\.\/components\/PresenceModal'/, 'the app Modal (reports itself to the update notice)');
});

test('EO-S12b: picture A (founder 2026-11-20): subtitle, two groups, the Premium column on a data band, Premium values in the data colour, and the offer button above Voltar', () => {
  assert.match(SRC, /t\('eo_cmp_sub'\)/);
  assert.match(SRC, /t\('eo_cmp_both'\)/);
  assert.match(SRC, /t\('eo_cmp_changes'\)/);
  assert.match(SRC, /cmpBand: \{[^}]*backgroundColor: c\.dataBand/);
  assert.match(SRC, /cmpPremiumText: \{[^}]*color: c\.data/);
  assert.match(SRC, /<FreePremiumSheet[\s\S]{0,200}?cta=\{model\.cta\}[\s\S]{0,200}?onCta=\{buyFromCompare\}\s+onDismiss=\{afterCompareClosed\}/);
  assert.match(SRC, /function buyFromCompare\(\) \{\s+buyAfterCompare\.current = true;\s+setShowFree\(false\);/);
  assert.match(SRC, /if \(!showFree && Platform\.OS === 'android'\) afterCompareClosed\(\)/);
  assert.match(SRC, /\{cta \? \(\s*<TouchableOpacity style=\{\[s\.cta/);
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
  assert.match(SRC, /loadReferralCode\(\)/);
  assert.match(SRC, /from '\.\.\/lib\/referralSync'/, 'the app-bound versions (AsyncStorage, RevenueCat, token, fetch)');
  for (const [reason, key] of [['shape', 'eo_ref_invalid'], ['unknown', 'eo_ref_unknown'], ['ended', 'eo_ref_ended'], ['offline', 'eo_ref_offline']]) {
    assert.match(SRC, new RegExp(`${reason}: '${key}'`), reason);
    assert.equal(valuesOf(key).length, 6, key);
  }
  for (const v of valuesOf('eo_ref_offline')) assert.doesNotMatch(v, /aplicad|applied|appliqué|eingelöst|applicat/i, 'offline never says applied');
  assert.match(SRC, /eo_ref_label/);
  assert.equal((SRC.match(/t\('eo_ref_label'\)/g) || []).length >= 1, true);
});

test('EO-S14: lib/referralSync binds the rules to the app and exports flushPendingAttribution for App.js', () => {
  const sync = read('lib', 'referralSync.js');
  assert.match(sync, /export function flushPendingAttribution\(\{ getAccessToken = sessionAccessToken, fetch = netFetch \} = \{\}\)/);
  assert.match(sync, /storage: AsyncStorage, setAttributes: setCreatorAttributes, getAccessToken, fetch/);
  assert.match(sync, /data\.session\.access_token/, 'the signed-in user Supabase token');
  assert.match(sync, /globalThis\.fetch\(url, opts\)/, 'the global fetch, read at call time');
  assert.match(read('lib', 'referralCode.js'), /CREATOR_API = 'https:\/\/dosetrace\.io\/api\/creator'/);
});
