'use strict';
// Gate B review of 5cb065f (Delete account UI, founder 2026-10-17 "1 B, 2, 3 C"), FIX-FIRST:
// (1) HIGH: tornDown was set once and never reset. Server deletes, the local teardown fails ("Couldn't
//     sign out"), the user taps Delete again, the locked "Deleting your account…" sheet opens, the
//     server answers ok (gone) and runTeardown returned early: the locked sheet had no exit. Now a
//     failed teardown re-arms, and every exit (an early return included) replaces or clears a locked
//     sheet. The same for the 18+ sheet, whose "lock" is its busy state (every button disabled).
// (2) MEDIUM: the Premium paragraph follows a real store subscription that will renew, read from
//     RevenueCat (entitlement store + the renewing subscriptions): APP_STORE → the Apple text and link,
//     PLAY_STORE → the Google Play text and link (on either platform); promotional, lifetime, already
//     cancelled, unknown → no paragraph (nothing to cancel). Not loaded yet when Delete is tapped →
//     waited for, 2 s at most.
// (3) low: a store page that cannot open leaves the sheet open and never throws.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');
const { translations } = require('../i18n/translations.js');
const { storeKey } = require('../lib/storeText');

const tEn = (k) => translations.en[k] || k;
const settle = () => new Promise((r) => setTimeout(r, 0));
const S = 'screens/SettingsScreen.js';

// ---------- (1) the screen's state, the real runTeardown + executeAccountDeletion ----------
function settingsRig({ teardowns, results }) {
  const state = { sheet: null, failedShown: 0, teardownCalls: 0 };
  const setSheet = (v) => { state.sheet = typeof v === 'function' ? v(state.sheet) : v; };
  const tornDown = { current: false };
  const unlockSheet = loadFn(S, 'function unlockSheet(', 'unlockSheet', {});
  const runTeardown = loadFn(S, 'const runTeardown = () => {', 'runTeardown', {
    tornDown, setSheet, unlockSheet,
    finishAccountDeletion: async () => { const r = teardowns[state.teardownCalls++]; if (r instanceof Error) throw r; return r; },
    showSignOutFailed: () => { state.failedShown++; setSheet({ title: 'failed', buttons: [{ label: 'OK' }] }); },
  });
  const deletingAccountSheet = loadFn(S, 'function deletingAccountSheet(', 'deletingAccountSheet', {});
  const deleteSyncBusySheet = loadFn(S, 'function deleteSyncBusySheet(', 'deleteSyncBusySheet', {});
  let n = 0;
  const executeAccountDeletion = loadFn(S, 'async function executeAccountDeletion(', 'executeAccountDeletion', {
    setSheet, t: tEn, runTeardown, Platform: { OS: 'ios' }, deletingAccountSheet, deleteSyncBusySheet,
    errorSheet: (b) => setSheet({ title: 'Error', body: b, buttons: [{ label: 'OK' }] }),
    friendlyError: (e, t, k) => t(k),
    requestAccountDeletion: async () => { const r = results[n++]; if (r instanceof Error) throw r; return r; },
  });
  return { state, tornDown, runTeardown, executeAccountDeletion };
}

test('(1) HIGH: a retry after a failed teardown tears down again and never leaves the locked sheet', async () => {
  const r = settingsRig({ teardowns: [{ failed: true }, { ok: true }], results: [{ ok: true }, { ok: true, appleManualRevokeNeeded: false }] });
  await r.executeAccountDeletion();
  await settle();
  assert.equal(r.state.sheet.title, 'failed', 'the failed sign-out replaced the progress sheet');
  assert.equal(r.tornDown.current, false, 'a failed teardown re-arms');
  await r.executeAccountDeletion(); // Delete again: the server answers ok (already gone)
  await settle();
  assert.equal(r.state.teardownCalls, 2, 'the teardown ran again');
  assert.equal(r.state.sheet, null, 'the locked sheet is gone');
});

test('(1) HIGH: a teardown that throws re-arms too; the failure sheet replaces the lock', async () => {
  const r = settingsRig({ teardowns: [new Error('x'), { ok: true }], results: [{ ok: true }, { ok: true }] });
  await r.executeAccountDeletion();
  await settle();
  assert.equal(r.state.sheet.title, 'failed');
  assert.equal(r.tornDown.current, false);
  await r.executeAccountDeletion();
  await settle();
  assert.equal(r.state.sheet, null);
});

test('(1) an early return from runTeardown (a teardown already running) clears a locked sheet', async () => {
  const r = settingsRig({ teardowns: [], results: [] });
  r.tornDown.current = true;
  r.state.sheet = { locked: true, title: 'Deleting your account…' };
  r.runTeardown();
  assert.equal(r.state.sheet, null);
  r.state.sheet = { title: 'Account deleted' };
  r.runTeardown();
  assert.equal(r.state.sheet.title, 'Account deleted', 'a sheet that is not locked is left alone');
});

test('(1) guard: every exit of executeAccountDeletion leaves no locked sheet, whatever the teardown does', async () => {
  const results = [
    { noSession: true }, { syncBusy: true }, { offline: true }, new Error('boom'),
    { ok: true, appleManualRevokeNeeded: true }, { ok: true, appleManualRevokeNeeded: false },
  ];
  for (const result of results) {
    for (const td of [{ ok: true }, { failed: true }, new Error('x')]) {
      const r = settingsRig({ teardowns: [td], results: [result] });
      await r.executeAccountDeletion();
      await settle();
      assert.ok(!(r.state.sheet && r.state.sheet.locked), `${JSON.stringify(result) || result} / ${JSON.stringify(td)}: locked sheet left`);
    }
  }
});

test('(1) the 18+ sheet: a failed teardown re-arms and frees the buttons; a retry tears down again', async () => {
  const state = { sheet: null, busy: 'delete', calls: 0 };
  const tornDown = { current: false };
  const outs = [{ failed: true }, { ok: true }];
  const ok = (title, body) => { state.sheet = { title, body }; };
  const runTeardown = loadFn('screens/AgeConfirmScreen.js', 'const runTeardown = () => {', 'runTeardown', {
    tornDown, ok, t: tEn, setBusy: (v) => { state.busy = v; },
    finishAccountDeletion: async () => outs[state.calls++],
  });
  runTeardown();
  await settle();
  assert.equal(state.sheet.title, translations.en.settings_signout_failed_title);
  assert.equal(state.busy, null, 'the buttons work again');
  assert.equal(tornDown.current, false);
  state.busy = 'delete';
  runTeardown();
  await settle();
  assert.equal(state.calls, 2, 'the retry tears down');
  assert.equal(state.busy, null);
});

// ---------- (2) which store bills the Premium ----------
test('(2) billingStoreFrom: the store of a renewing store subscription, else none', () => {
  const { billingStoreFrom } = require('../lib/entitlement');
  const live = (o) => ({ reachable: true, premium: true, expiresAt: null, endedOn: null, ...o });
  assert.equal(billingStoreFrom(live({ store: 'APP_STORE', willRenew: true, renewingStores: ['APP_STORE'] })), 'APP_STORE');
  assert.equal(billingStoreFrom(live({ store: 'PLAY_STORE', willRenew: true, renewingStores: ['PLAY_STORE'] })), 'PLAY_STORE');
  assert.equal(billingStoreFrom(live({ store: 'MAC_APP_STORE', willRenew: true, renewingStores: ['MAC_APP_STORE'] })), 'APP_STORE', 'billed by Apple');
  assert.equal(billingStoreFrom(live({ store: 'PROMOTIONAL', willRenew: false, renewingStores: [] })), null, 'promotional: nothing to cancel');
  assert.equal(billingStoreFrom(live({ store: 'APP_STORE', willRenew: false, renewingStores: [] })), null, 'lifetime or already cancelled: nothing to cancel');
  assert.equal(billingStoreFrom(live({ store: 'PROMOTIONAL', willRenew: false, renewingStores: ['PLAY_STORE'] })), 'PLAY_STORE', 'a promo on top of a paid Play subscription: the Play one still bills');
  assert.equal(billingStoreFrom(live({ store: 'APP_STORE', willRenew: false, renewingStores: ['APP_STORE'] })), 'APP_STORE', 'a Lifetime on top of a running App Store subscription (PA-74)');
  assert.equal(billingStoreFrom(live({ store: 'STRIPE', willRenew: true, renewingStores: ['STRIPE'] })), null, 'no store page to send to');
  assert.equal(billingStoreFrom(live({ store: 'UNKNOWN_STORE', willRenew: true, renewingStores: ['UNKNOWN_STORE'] })), null);
  assert.equal(billingStoreFrom(live({})), null, 'store unknown (the dev account)');
  assert.equal(billingStoreFrom({ reachable: true, premium: false, store: 'APP_STORE', renewingStores: ['APP_STORE'] }), null, 'not Premium');
  assert.equal(billingStoreFrom({ reachable: false }), null, 'store unreachable');
  assert.equal(billingStoreFrom(null), null);
});

test('(2) readLiveEntitlement reports the entitlement store, willRenew and the renewing subscriptions\' stores', async () => {
  const info = {
    entitlements: { active: { 'DoseTrace Pro': { expirationDate: '2026-11-01T00:00:00Z', store: 'APP_STORE', willRenew: true, periodType: 'NORMAL' } } },
    activeSubscriptions: ['m', 'y'],
    subscriptionsByProductIdentifier: { m: { store: 'APP_STORE', willRenew: true }, y: { store: 'PLAY_STORE', willRenew: false } },
  };
  const read = loadFn('lib/purchases.js', 'export async function readLiveEntitlement(', 'readLiveEntitlement', {
    Purchases: { isConfigured: async () => true, getCustomerInfo: async () => info },
    isDevAccount: () => false, ENTITLEMENT_ID: 'DoseTrace Pro',
  });
  assert.deepEqual(await read(), { reachable: true, premium: true, expiresAt: '2026-11-01T00:00:00Z', endedOn: null, store: 'APP_STORE', willRenew: true, renewingStores: ['APP_STORE'] });
});

test('(2) getBillingStore asks the live store, never throws', async () => {
  const src = read('lib/entitlement.js');
  assert.match(src, /async function getBillingStore\(\)/);
  assert.match(src, /module\.exports = \{[^}]*getBillingStore[^}]*\}/);
});

const manageSubscriptionsUrl = loadFn(S, 'function manageSubscriptionsUrl(', 'manageSubscriptionsUrl', { ANDROID_PACKAGE_ID: 'io.outcom.dosetrace' });
const deleteAccountSheet = (a) => loadFn(S, 'function deleteAccountSheet(', 'deleteAccountSheet', { storeKey, manageSubscriptionsUrl })(a);

test('(2) APP_STORE → the Apple text and link, PLAY_STORE → the Google Play text and link; none → the sheet as before', () => {
  for (const [store, os] of [['APP_STORE', 'ios'], ['PLAY_STORE', 'android']]) {
    const opened = [];
    const sh = deleteAccountSheet({ t: tEn, store, onConfirm: () => {}, openUrl: (u) => { opened.push(u); return Promise.resolve(); } });
    assert.equal(sh.body2, translations.en[`settings_delete_premium_${os}`], store);
    assert.equal(sh.link.keepOpen, true);
    sh.link.onPress();
    assert.deepEqual(opened, [manageSubscriptionsUrl(os)], store);
  }
  for (const store of [null, undefined, 'PROMOTIONAL', 'STRIPE']) {
    const sh = deleteAccountSheet({ t: tEn, store, onConfirm: () => {}, openUrl: () => {} });
    assert.equal(sh.body2, undefined, String(store));
    assert.equal(sh.link, undefined, String(store));
  }
});

test('(2) Delete tapped before the store answer loaded: waited for, 2 s at most; a known answer is used at once', async () => {
  const resolveBillingStore = loadFn(S, 'async function resolveBillingStore(', 'resolveBillingStore', { setTimeout, clearTimeout });
  let loads = 0;
  assert.equal(await resolveBillingStore('PLAY_STORE', () => { loads++; return Promise.resolve('APP_STORE'); }), 'PLAY_STORE');
  assert.equal(await resolveBillingStore(null, () => { loads++; return Promise.resolve('APP_STORE'); }), null, 'known: none');
  assert.equal(loads, 0, 'a known answer is not asked again');
  assert.equal(await resolveBillingStore(undefined, () => new Promise((r) => setTimeout(() => r('APP_STORE'), 20))), 'APP_STORE', 'not loaded: waited for');
  const t0 = Date.now();
  assert.equal(await resolveBillingStore(undefined, () => new Promise(() => {}), 40), null, 'no answer in time: no paragraph');
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(await resolveBillingStore(undefined, () => Promise.reject(new Error('x'))), null);
  assert.equal(await resolveBillingStore(undefined, () => { throw new Error('x'); }), null);
  assert.match(read(S), /async function resolveBillingStore\(known, load, ms = 2000\)/);
});

test('(2) handleDeleteAccount waits for the store answer, one opening at a time, then builds the sheet from it', () => {
  const src = read(S);
  const h = src.slice(src.indexOf('async function handleDeleteAccount('), src.indexOf('async function executeAccountDeletion('));
  assert.match(h, /if \(deleteOpening\.current\) return;/);
  assert.match(h, /await resolveBillingStore\(billingStore, \(\) => billingLoad\.current \|\| getBillingStore\(\)\)/);
  assert.match(h, /deleteAccountSheet\(\{ t, store,/);
  assert.match(h, /openUrl: \(u\) => Linking\.openURL\(u\)/);
  const f = src.slice(src.indexOf('async function fetchUser()'), src.indexOf('async function fetchUser()') + 600);
  assert.match(f, /const bl = getBillingStore\(\);\s*billingLoad\.current = bl;/, 'asked before the user read, so a fast tap rarely waits');
});

// ---------- (3) a store page that cannot open ----------
test('(3) the link never throws and never closes the sheet when the store page cannot open', () => {
  for (const openUrl of [() => Promise.reject(new Error('no')), () => { throw new Error('no'); }, () => undefined]) {
    const sh = deleteAccountSheet({ t: tEn, store: 'APP_STORE', onConfirm: () => {}, openUrl });
    assert.doesNotThrow(() => sh.link.onPress());
    assert.equal(sh.link.keepOpen, true);
  }
});

// ---------- 2.3.10 follow-up: the iOS app never names Google Play ----------
test('(2.3.10) on iOS a PLAY_STORE subscription shows no paragraph; Android keeps both stores', () => {
  const sheetOn = (store, platform) => deleteAccountSheet({ t: tEn, store, platform, onConfirm: () => {}, openUrl: () => {} });
  const ios = sheetOn('PLAY_STORE', 'ios');
  assert.equal(ios.body2, undefined, 'iOS: no Google Play text');
  assert.equal(ios.link, undefined, 'iOS: no Play link');
  assert.equal(sheetOn('APP_STORE', 'ios').body2, translations.en.settings_delete_premium_ios);
  assert.equal(sheetOn('APP_STORE', 'android').body2, translations.en.settings_delete_premium_ios, 'Android: the Apple text for an App Store subscription');
  assert.equal(sheetOn('APP_STORE', 'android').link.label, 'Manage subscription');
  assert.equal(sheetOn('PLAY_STORE', 'android').body2, translations.en.settings_delete_premium_android);
  const src = read(S);
  const h = src.slice(src.indexOf('async function handleDeleteAccount('), src.indexOf('async function executeAccountDeletion('));
  assert.match(h, /deleteAccountSheet\(\{ t, store, platform: Platform\.OS,/);
});
