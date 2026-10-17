'use strict';
// Delete account UI (founder 2026-10-17 "1 B, 2, 3 C", picture docs/design/delete-account-wait.html):
// (1 B) after "Yes, delete everything" a fixed sheet "Deleting your account…" with a spinner, no
// buttons, not closed by a tap outside or Android back, replaced by the result;
// (2) a running sync pass that does not finish in time is its own result ({ syncBusy }) with its own
// sheet ("Still saving your data"); the offline message stays for real offline only;
// (3 C) Premium users read one more paragraph on the first delete sheet (deleting does not cancel the
// store subscription, where to cancel, per platform) and a "Manage subscription" link to the store's
// subscriptions page; free users see the sheet as before. The real code, fakes around it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, sliceBlock, read } = require('./helpers/extractFn');
const { translations } = require('../i18n/translations.js');
const { storeKey } = require('../lib/storeText');

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|'(white|black)'|"(white|black)"|rgba?\(/;
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const KEYS = [
  'settings_delete_progress_title', 'settings_delete_progress_body',
  'settings_delete_syncbusy_title', 'settings_delete_syncbusy_body',
  'settings_delete_premium_ios', 'settings_delete_premium_android',
  'settings_manage_subscription',
];
const tEn = (k) => translations.en[k] || k;

// ---------- (2) accountActions: the idle race timing out is syncBusy, not offline ----------
function loadDeletion(deps) {
  return loadFn('lib/accountActions.js', 'export async function requestAccountDeletion(', 'requestAccountDeletion', {
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }), refreshSession: async () => ({ data: { session: null } }) } },
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' } },
    deletionRequestSettled: () => {}, setTimeout, clearTimeout,
    ...deps,
  });
}

test('(2) a sync pass still running when the wait ends → { syncBusy: true }, sync resumed, no request sent', async () => {
  const calls = [];
  let posted = 0;
  const del = loadDeletion({
    fetch: async () => { posted++; return new Response('{}'); },
    pauseSyncForDeletion: () => calls.push('pause'), resumeSyncAfterDeletion: () => calls.push('resume'),
    waitForSyncIdle: () => new Promise(() => {}),
  });
  assert.deepEqual(await del({ idleWaitMs: 30 }), { syncBusy: true });
  assert.deepEqual(calls, ['pause', 'resume'], 'paused, then resumed as before');
  assert.equal(posted, 0, 'nothing was asked of the server');
});

test('(2) real offline stays offline: a network failure before an answer is { offline: true }', async () => {
  const calls = [];
  const del = loadDeletion({
    fetch: async () => { throw new TypeError('Network request failed'); },
    pauseSyncForDeletion: () => calls.push('pause'), resumeSyncAfterDeletion: () => calls.push('resume'),
    waitForSyncIdle: async () => {},
  });
  assert.deepEqual(await del(), { offline: true });
  assert.deepEqual(calls, ['pause', 'resume']);
});

test('(2) only the idle race returns syncBusy (one place in accountActions)', () => {
  const src = read('lib/accountActions.js');
  assert.equal((src.match(/syncBusy: true/g) || []).length, 1);
  assert.match(src, /if \(!idle\) \{ resumeSyncAfterDeletion\(\); return \{ syncBusy: true \}; \}/);
});

// ---------- strings ×6 ----------
test('strings: every new key in all 6 languages, filled, no emoji, distinct per platform', () => {
  for (const lang of LANGS) {
    for (const k of KEYS) {
      const v = translations[lang][k];
      assert.ok(typeof v === 'string' && v.trim().length > 0, `${lang}.${k}`);
      assert.doesNotMatch(v, EMOJI, `${lang}.${k}: emoji`);
    }
    const ios = translations[lang].settings_delete_premium_ios;
    const android = translations[lang].settings_delete_premium_android;
    assert.match(ios, /App Store/, `${lang}: iOS names the App Store`);
    assert.doesNotMatch(ios, /Google|Android/, `${lang}: iOS never names Google (2.3.10)`);
    assert.match(android, /Google Play/, `${lang}: Android names Google Play`);
    assert.doesNotMatch(android, /Apple|App Store|iPhone/, `${lang}: Android never names Apple`);
    assert.match(translations[lang].settings_delete_progress_title, /…$/, `${lang}: progress title ends with an ellipsis`);
  }
  assert.equal(translations.en.settings_delete_progress_title, 'Deleting your account…');
  assert.equal(translations.en.settings_delete_progress_body, 'This can take up to a minute. Keep the app open.');
  assert.equal(translations.en.settings_delete_syncbusy_title, 'Still saving your data');
  assert.equal(translations.en.settings_delete_syncbusy_body, 'The app is still sending your records to the cloud. Try deleting again in a minute.');
  assert.equal(translations.en.settings_delete_premium_ios, 'Deleting your account does not cancel your Premium subscription. Billing is handled by the App Store: cancel in Settings › your name › Subscriptions.');
  assert.equal(translations.en.settings_delete_premium_android, 'Deleting your account does not cancel your Premium subscription. Billing is handled by Google Play: cancel in Google Play › Payments & subscriptions › Subscriptions.');
  assert.equal(translations.en.settings_manage_subscription, 'Manage subscription');
  assert.equal(translations.pt.settings_delete_progress_title, 'Excluindo sua conta…');
  assert.equal(translations.pt.settings_delete_progress_body, 'Isso pode levar até um minuto. Mantenha o app aberto.');
  assert.equal(translations.pt.settings_delete_syncbusy_title, 'Ainda salvando seus dados');
  assert.equal(translations.pt.settings_delete_syncbusy_body, 'O app ainda está enviando seus registros para a nuvem. Tente excluir de novo em um minuto.');
  assert.equal(translations.pt.settings_delete_premium_ios, 'Excluir a conta não cancela sua assinatura Premium. A cobrança é da App Store: cancele em Ajustes › seu nome › Assinaturas.');
  assert.equal(translations.pt.settings_delete_premium_android, 'Excluir a conta não cancela sua assinatura Premium. A cobrança é do Google Play: cancele em Google Play › Pagamentos e assinaturas › Assinaturas.');
  assert.equal(translations.pt.settings_manage_subscription, 'Gerenciar assinatura');
  // French uses "vous"; the store menus are the ones each store shows in that language.
  assert.match(translations.fr.settings_delete_progress_body, /\b(Gardez|vous)\b/);
  assert.doesNotMatch(Object.values(KEYS.map((k) => translations.fr[k])).join(' '), /\b(tu|ton|ta|tes)\b/);
  assert.match(translations.fr.settings_delete_premium_ios, /Réglages › votre nom › Abonnements/);
  assert.match(translations.fr.settings_delete_premium_android, /Paiements et abonnements › Abonnements/);
  assert.match(translations.es.settings_delete_premium_ios, /Ajustes › tu nombre › Suscripciones/);
  assert.match(translations.es.settings_delete_premium_android, /Pagos y suscripciones › Suscripciones/);
  assert.match(translations.de.settings_delete_premium_ios, /Einstellungen › dein Name › Abonnements/);
  assert.match(translations.de.settings_delete_premium_android, /Zahlungen und Abos › Abos/);
  assert.match(translations.it.settings_delete_premium_ios, /Impostazioni › il tuo nome › Abbonamenti/);
  assert.match(translations.it.settings_delete_premium_android, /Pagamenti e abbonamenti › Abbonamenti/);
});

// ---------- (3 C) the first delete sheet ----------
const settingsSrc = read('screens/SettingsScreen.js');
// Loaded on first use, so one missing piece fails its own tests only.
const lazy = (load) => { let f = null; return (...a) => (f || (f = load()))(...a); };
const manageSubscriptionsUrl = lazy(() => loadFn('screens/SettingsScreen.js', 'function manageSubscriptionsUrl(', 'manageSubscriptionsUrl', { ANDROID_PACKAGE_ID: 'io.outcom.dosetrace' }));
const deleteAccountSheet = lazy(() => loadFn('screens/SettingsScreen.js', 'function deleteAccountSheet(', 'deleteAccountSheet', { storeKey, manageSubscriptionsUrl }));

test('(3 C) the store subscriptions page per platform (Android: the package from app.json)', () => {
  const pkg = JSON.parse(read('app.json')).expo.android.package;
  assert.match(settingsSrc, new RegExp(`const ANDROID_PACKAGE_ID = '${pkg.replace(/\./g, '\\.')}'`));
  assert.equal(manageSubscriptionsUrl('ios'), 'https://apps.apple.com/account/subscriptions');
  assert.equal(manageSubscriptionsUrl('android'), `https://play.google.com/store/account/subscriptions?package=${pkg}`);
});

test('(3 C) no store subscription: the first delete sheet exactly as before (no paragraph, no link)', () => {
  const sh = deleteAccountSheet({ t: tEn, store: null, onConfirm: () => {}, openUrl: () => {} });
  assert.equal(sh.title, 'Delete account');
  assert.equal(sh.body, translations.en.settings_delete_permanent_msg);
  assert.equal(sh.body2, undefined);
  assert.equal(sh.link, undefined);
  assert.equal(sh.icon, undefined, 'no icon, as before');
  assert.deepEqual(sh.buttons.map((b) => [b.label, b.kind]), [['Cancel', 'secondary'], [translations.en.settings_delete_confirm, 'danger']]);
});

test('(3 C) a store subscription: that store\'s paragraph + "Manage subscription", which opens the store and keeps the sheet (Gate B of 5cb065f: by the billing store)', () => {
  for (const [store, os] of [['APP_STORE', 'ios'], ['PLAY_STORE', 'android']]) {
    const opened = [];
    let confirmed = 0;
    const sh = deleteAccountSheet({ t: tEn, store, onConfirm: () => { confirmed++; }, openUrl: async (u) => { opened.push(u); } });
    assert.equal(sh.body, translations.en.settings_delete_permanent_msg);
    assert.equal(sh.body2, translations.en[`settings_delete_premium_${os}`]);
    assert.equal(sh.link.label, 'Manage subscription');
    assert.equal(sh.link.keepOpen, true, 'the link does not close the sheet');
    sh.link.onPress();
    assert.deepEqual(opened, [manageSubscriptionsUrl(os)]);
    assert.equal(confirmed, 0, 'the link never starts the deletion');
    sh.buttons[1].onPress();
    assert.equal(confirmed, 1);
  }
  // A store page that cannot open is ignored (no crash, the sheet stays).
  const sh = deleteAccountSheet({ t: tEn, store: 'APP_STORE', onConfirm: () => {}, openUrl: () => Promise.reject(new Error('no')) });
  assert.doesNotThrow(() => sh.link.onPress());
  const sync = deleteAccountSheet({ t: tEn, store: 'APP_STORE', onConfirm: () => {}, openUrl: () => { throw new Error('no'); } });
  assert.doesNotThrow(() => sync.link.onPress());
});

test('(3 C) handleDeleteAccount builds the first sheet from the billing store (deleteAccountGateB.test.js)', () => {
  const h = sliceBlock(settingsSrc, 'async function handleDeleteAccount(');
  assert.match(h, /deleteAccountSheet\(\{ t, store,/);
  assert.match(h, /openUrl: \(u\) => Linking\.openURL\(u\)/);
});

// ---------- (1 B) the progress sheet ----------
const deletingAccountSheet = lazy(() => loadFn('screens/SettingsScreen.js', 'function deletingAccountSheet(', 'deletingAccountSheet', {}));
const deleteSyncBusySheet = lazy(() => loadFn('screens/SettingsScreen.js', 'function deleteSyncBusySheet(', 'deleteSyncBusySheet', {}));

test('(1 B) the progress sheet: spinner in the risk tone, title + body, no buttons, locked', () => {
  const sh = deletingAccountSheet(tEn);
  assert.equal(sh.spinner, 'risk');
  assert.equal(sh.title, 'Deleting your account…');
  assert.equal(sh.body, 'This can take up to a minute. Keep the app open.');
  assert.deepEqual(sh.buttons, []);
  assert.equal(sh.locked, true);
  assert.equal(sh.icon, undefined, 'the spinner takes the icon place');
});

test('(1 B) DTSheet: a locked sheet ignores a tap outside and Android back; no empty button row; the spinner sits in the 48 pt icon circle', () => {
  const src = read('screens/components/ProtocolParts.js');
  const d = sliceBlock(src, 'export function DTSheet(');
  assert.match(d, /const dismiss = \(\) => \{ if \(shown\.locked\) return; after\.queue\(shown\.onDismiss\); onClose\(\); \};/);
  assert.match(d, /onRequestClose=\{dismiss\}/);
  assert.match(d, /<Pressable style=\{\[s\.scrim, \{ paddingBottom: centerGap \}\]\} onPress=\{dismiss\}/);
  assert.match(d, /\{btns\.length \? \(\s*<View style=\{stack \? s\.btnStack : s\.btnRow\}>/);
  assert.match(d, /shown\.spinner \? \(\s*<View style=\{s\.icon\}><ActivityIndicator size="small" color=\{c\[shown\.spinner\] \|\| c\.ink\} style=\{s\.spinner\} \/><\/View>/);
  assert.match(d, /onPress=\{\(\) => \{ const fn = shown\.link\.onPress; if \(!shown\.link\.keepOpen\) onClose\(\); if \(fn\) fn\(\); \}\}/);
  assert.match(d, /shown\.body2 \? <Text style=\{\[s\.body, s\.bodyMore\]\}>\{shown\.body2\}<\/Text> : null/);
  assert.match(src, /bodyMore: \{ marginTop: -4 \}/, 'prototype .sb + .sb: 10 between the paragraphs');
  assert.match(src, /spinner: \{ transform: \[\{ scale: 1\.4 \}\] \}/, 'prototype spin.big: 28 pt');
});

// The executeAccountDeletion of the screen, run with fakes.
function runDelete(result) {
  const shown = [];
  const errors = [];
  let teardowns = 0;
  const fn = loadFn('screens/SettingsScreen.js', 'async function executeAccountDeletion(', 'executeAccountDeletion', {
    setSheet: (s) => shown.push(s), errorSheet: (b) => errors.push(b), t: tEn,
    requestAccountDeletion: async () => { if (result instanceof Error) throw result; return result; },
    runTeardown: () => { teardowns++; }, friendlyError: (e, t, k) => t(k),
    Platform: { OS: 'ios' }, deletingAccountSheet, deleteSyncBusySheet,
  });
  return fn().then(() => ({ shown, errors, teardowns }));
}

test('(1 B) the progress sheet shows first; the result replaces it (still syncing / offline / error / Apple note / teardown)', async () => {
  let r = await runDelete({ syncBusy: true });
  assert.equal(r.shown[0].title, 'Deleting your account…');
  assert.equal(r.shown[1].title, 'Still saving your data');
  assert.equal(r.shown[1].icon, 'refresh', 'the FeatureIcon sync glyph, never an emoji');
  assert.deepEqual(r.shown[1].buttons.map((b) => [b.label, b.kind]), [['OK', 'primary']]);
  assert.equal(r.shown[1].locked, undefined, 'the result sheet closes normally');
  assert.deepEqual(r.errors, []);

  r = await runDelete({ offline: true });
  assert.equal(r.shown.length, 1);
  assert.deepEqual(r.errors, [translations.en.settings_delete_offline], 'offline keeps its own message');

  r = await runDelete(new Error('boom'));
  assert.deepEqual(r.errors, [translations.en.error_deletion_failed]);

  r = await runDelete({ noSession: true });
  assert.deepEqual(r.errors, [translations.en.error_no_session]);

  r = await runDelete({ ok: true, appleManualRevokeNeeded: true });
  assert.equal(r.shown[1].title, translations.en.settings_delete_apple_revoke_title);
  assert.equal(r.teardowns, 0);

  r = await runDelete({ ok: true, appleManualRevokeNeeded: false });
  assert.equal(r.shown.length, 1, 'the progress sheet stays up during the teardown');
  assert.equal(r.teardowns, 1);
});

test('(1 B) after the teardown a locked sheet never stays behind; a failed sign-out replaces it', () => {
  const rt = settingsSrc.slice(settingsSrc.indexOf('const runTeardown = () => {'), settingsSrc.indexOf('const closeSheet = () => {'));
  assert.match(rt, /setSheet\(unlockSheet\)/); // behaviour: deleteAccountGateB.test.js
  assert.match(rt, /showSignOutFailed\(\)/);
});

test('(2) the 18+ sheet (AgeConfirmScreen) also tells "Still saving your data", never the offline words', () => {
  const d = sliceBlock(read('screens/AgeConfirmScreen.js'), 'async function doDelete(');
  assert.match(d, /if \(result\.syncBusy\) \{ setBusy\(null\); ok\(t\('settings_delete_syncbusy_title'\), t\('settings_delete_syncbusy_body'\), 'refresh'\); return; \}/);
});

test('no hardcoded colors and no emoji in the new code', () => {
  const parts = {
    DTSheet: sliceBlock(read('screens/components/ProtocolParts.js'), 'export function DTSheet('),
    sheetStyles: read('screens/components/ProtocolParts.js').slice(read('screens/components/ProtocolParts.js').indexOf('const sheetStyles = (c) =>')),
    manageSubscriptionsUrl: sliceBlock(settingsSrc, 'function manageSubscriptionsUrl('),
    deleteAccountSheet: sliceBlock(settingsSrc, 'function deleteAccountSheet('),
    deletingAccountSheet: sliceBlock(settingsSrc, 'function deletingAccountSheet('),
    deleteSyncBusySheet: sliceBlock(settingsSrc, 'function deleteSyncBusySheet('),
    executeAccountDeletion: sliceBlock(settingsSrc, 'async function executeAccountDeletion('),
    handleDeleteAccount: sliceBlock(settingsSrc, 'async function handleDeleteAccount('),
    resolveBillingStore: sliceBlock(settingsSrc, 'async function resolveBillingStore('),
    unlockSheet: sliceBlock(settingsSrc, 'function unlockSheet('),
  };
  for (const [name, src] of Object.entries(parts)) {
    assert.doesNotMatch(src, COLOR_LITERAL, `${name}: color literal`);
    assert.doesNotMatch(src, EMOJI, `${name}: emoji`);
  }
});
