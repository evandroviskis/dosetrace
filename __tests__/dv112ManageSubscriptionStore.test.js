'use strict';
// DV-112 journey review F4: "Gerenciar assinatura" opens the subscriptions page of the store on the
// phone in hand; a person who subscribed in the other store (bought on an iPhone, now on Android, or
// the reverse) landed on an empty page. The button shows only when the store that bills the plan
// (RevenueCat live.store) is this platform's; otherwise one line says to manage it in the store where
// they subscribed. On iOS that line never names Google Play (guideline 2.3.10, the rule
// deleteAccountSheet follows); on Android it may name the App Store. An unknown store keeps the
// button (as before). A billing problem's line points to the button only when the button is there.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { translations } = require('../i18n/translations.js');
const tOf = (l) => (k) => translations[l][k] ?? k;
const UNTIL = '2027-10-12T15:00:00Z';
const live = (o = {}) => ({ reachable: true, premium: true, expiresAt: UNTIL, store: 'APP_STORE', willRenew: true, productId: 'yearly', periodType: 'NORMAL', unsubscribeDetectedAt: null, billingIssueDetectedAt: null, ...o });
const fmt = () => '12 Oct 2027';

test('F4: the status carries the store that bills the plan', () => {
  const { subscriptionStatusFrom } = require('../lib/subscriptionStatus');
  assert.equal(subscriptionStatusFrom(live()).store, 'APP_STORE');
  assert.equal(subscriptionStatusFrom(live({ store: 'MAC_APP_STORE' })).store, 'APP_STORE');
  assert.equal(subscriptionStatusFrom(live({ store: 'PLAY_STORE', productId: 'yearly:yearly-base' })).store, 'PLAY_STORE');
  assert.equal(subscriptionStatusFrom(live({ store: 'STRIPE' })).store, 'STRIPE');
  assert.equal(subscriptionStatusFrom(live({ store: undefined })).store, null);
});

test('F4: same store → the button, no line; the other store → no button, one line', () => {
  const { subscriptionStatusFrom, subscriptionCard } = require('../lib/subscriptionStatus');
  const t = tOf('en');
  const apple = subscriptionStatusFrom(live());
  const play = subscriptionStatusFrom(live({ store: 'PLAY_STORE', productId: 'yearly:yearly-base' }));
  assert.deepEqual(subscriptionCard(apple, t, fmt, 'ios').manage, true);
  assert.equal(subscriptionCard(apple, t, fmt, 'ios').elsewhere, null);
  assert.equal(subscriptionCard(play, t, fmt, 'android').manage, true);
  assert.equal(subscriptionCard(play, t, fmt, 'android').elsewhere, null);
  // Bought on Android, opened on an iPhone: no button, a line that never names Google Play.
  const onIos = subscriptionCard(play, t, fmt, 'ios');
  assert.equal(onIos.manage, false);
  assert.equal(onIos.elsewhere, translations.en.settings_sub_manage_elsewhere);
  // Bought on an iPhone, opened on Android: the line may name the App Store.
  const onAndroid = subscriptionCard(apple, t, fmt, 'android');
  assert.equal(onAndroid.manage, false);
  assert.equal(onAndroid.elsewhere, translations.en.settings_sub_manage_app_store);
  // Another store (web) on either phone: the neutral line.
  const web = subscriptionStatusFrom(live({ store: 'STRIPE' }));
  assert.equal(subscriptionCard(web, t, fmt, 'android').elsewhere, translations.en.settings_sub_manage_elsewhere);
  assert.equal(subscriptionCard(web, t, fmt, 'ios').manage, false);
  // Unknown store, no status, lifetime, a team grant: as before (no line).
  assert.deepEqual(subscriptionCard(null, t, fmt, 'ios'), { name: translations.en.paywall_premium, line: null, manage: true, elsewhere: null });
  assert.equal(subscriptionCard(subscriptionStatusFrom(live({ store: null })), t, fmt, 'android').manage, true);
  assert.equal(subscriptionCard(subscriptionStatusFrom(live({ store: 'PLAY_STORE', productId: 'lifetime', expiresAt: null })), t, fmt, 'ios').elsewhere, null);
  assert.equal(subscriptionCard(subscriptionStatusFrom(live({ store: 'PROMOTIONAL' })), t, fmt, 'android').elsewhere, null);
});

test('F4: a billing problem in the other store points to that store, not to a missing button', () => {
  const { subscriptionStatusFrom, subscriptionCard } = require('../lib/subscriptionStatus');
  const t = tOf('pt');
  const play = subscriptionStatusFrom(live({ store: 'PLAY_STORE', billingIssueDetectedAt: 'x' }));
  assert.equal(subscriptionCard(play, t, fmt, 'android').line, translations.pt.settings_sub_billing);
  assert.equal(subscriptionCard(play, t, fmt, 'ios').line, translations.pt.settings_sub_billing_elsewhere);
});

test('F4: no line shown on iOS names Google Play; the words in 6 languages', () => {
  const pt = translations.pt;
  assert.equal(pt.settings_sub_manage_elsewhere, 'A assinatura foi feita em outra loja. Gerencie-a na loja em que assinou.');
  assert.equal(pt.settings_sub_manage_app_store, 'A assinatura foi feita na App Store. Gerencie-a no iPhone ou iPad: Ajustes › seu nome › Assinaturas.');
  assert.equal(pt.settings_sub_billing_elsewhere, 'Problema no pagamento · verifique na loja em que assinou');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['settings_sub_manage_elsewhere', 'settings_sub_manage_app_store', 'settings_sub_billing_elsewhere']) assert.ok(translations[l][k], `${l} ${k}`);
    // The two lines iOS can show (the neutral one and the billing one) never name Google or Play.
    for (const k of ['settings_sub_manage_elsewhere', 'settings_sub_billing_elsewhere']) assert.doesNotMatch(translations[l][k], /google|play/i, `${l} ${k}`);
  }
});

test('F4: Settings passes the platform and shows the line where the button was', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'SettingsScreen.js'), 'utf8');
  const sub = src.slice(src.indexOf('function renderSubscriptionCard('), src.indexOf('function renderPremiumCard('));
  assert.match(sub, /subscriptionCard\(subStatus, t, \(iso\) => formatDate\(new Date\(iso\), language, 'dayMonthYear'\), Platform\.OS\)/);
  const btn = sub.indexOf('card.manage && (');
  const line = sub.indexOf('card.elsewhere ? (');
  assert.ok(btn > 0 && line > btn, 'the line sits where the button would be');
  assert.match(sub, /card\.elsewhere \? \(\s*<View style=\{s\.row\}[^>]*>\s*<Text style=\{\[s\.rowSub, \{ flex: 1 \}\]\}>\{card\.elsewhere\}<\/Text>/);
});
