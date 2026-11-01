// Parked-error sweep 2026-10-31 — two accounts on one phone (DIVERGENCES DV-081 / DV-082 / DV-169).
// DV-081 (AD-05 + DL-52): account-scoped device keys survived an intended sign-out and the cross-account
//   guard (Missed-scan start, alert snoozes, "vial running low" sent ids, the entitlement owner, food
//   question / unsent food ids, paywall views). They now go with the account; per-phone keys stay.
// DV-082 (DL-53): right after SIGNED_IN of account B, before RevenueCat was configured for B, the
//   Premium check used A's cache (and A's live answer). The session user decides whose cache it is,
//   and a live answer of another RevenueCat user is never taken or written.
// DV-169: the owner scan of the cross-account guard skipped vials.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const { ACCOUNT_KEYS, clearAccountKeys } = require('../lib/accountKeys');
const { entitlementOwner } = require('../lib/entitlement');

test('DV-081: the account keys, and only those, are removed', async () => {
  for (const k of ['dosetrace_missed_since', 'dosetrace_missed_tz', 'dosetrace_missed_tz_since', 'dosetrace_alert_snooze', 'dosetrace_snoozes',
    'dosetrace_vial_low_sent', 'dosetrace_entitlement_last_uid', 'dosetrace_food_asked', 'dosetrace_food_local_pending', 'dosetrace_paywall_views']) {
    assert.ok(ACCOUNT_KEYS.includes(k), k);
  }
  for (const k of ['dosetrace_zone_history', 'dosetrace_theme_mode', 'dosetrace_language']) assert.ok(!ACCOUNT_KEYS.includes(k), k);
  const store = new Map([['dosetrace_vial_low_sent', JSON.stringify({ 7: true, 'r:abc': true })], ['dosetrace_missed_since', '1'], ['dosetrace_theme_mode', 'dark']]);
  const storage = { getItem: async (k) => (store.has(k) ? store.get(k) : null), setItem: async (k, v) => { store.set(k, v); }, multiRemove: async (keys) => { for (const k of keys) store.delete(k); } };
  await clearAccountKeys(storage);
  assert.equal(store.has('dosetrace_missed_since'), false);
  assert.equal(store.get('dosetrace_theme_mode'), 'dark', 'per-phone key kept');
  // A-66: the cloud-id entries of the vial-low map stay (the same user is never re-told), the local ids go
  assert.deepEqual(JSON.parse(store.get('dosetrace_vial_low_sent')), { 'r:abc': true });
  // both wipe paths run it
  assert.match(read('lib/signedOut.js'), /d\.clearAccountKeys/);
  assert.match(read('lib/accountGuard.js'), /d\.clearAccountKeys/);
  assert.equal(read('App.js').split('clearAccountKeys: () => clearAccountKeys(AsyncStorage)').length - 1, 2);
});

test('DV-082: whose Premium — the session user wins; another RevenueCat user\'s live answer is ignored', () => {
  assert.deepEqual(entitlementOwner({ sessionUid: 'B', purchasesUid: 'A', lastUid: 'A' }), { uid: 'B', liveIsTheirs: false });
  assert.deepEqual(entitlementOwner({ sessionUid: 'B', purchasesUid: null, lastUid: 'A' }), { uid: 'B', liveIsTheirs: false }, 'right after a sign-out the SDK may still be on A');
  assert.deepEqual(entitlementOwner({ sessionUid: 'B', purchasesUid: 'B', lastUid: 'A' }), { uid: 'B', liveIsTheirs: true });
  // offline, no session read (a failed refresh): the configured RevenueCat user, then the last one seen
  assert.deepEqual(entitlementOwner({ sessionUid: null, purchasesUid: 'A', lastUid: 'A' }), { uid: 'A', liveIsTheirs: true });
  assert.deepEqual(entitlementOwner({ sessionUid: null, purchasesUid: null, lastUid: 'A' }), { uid: 'A', liveIsTheirs: true });
  const src = read('lib/entitlement.js');
  assert.match(src, /peekCachedUser/);
  assert.match(src, /live = liveForOwner\(owner, live, !!sessionUid\);/);
});

test('DV-169: the owner scan includes vials', () => {
  const db = read('lib/database.js');
  const scan = db.slice(db.indexOf('export function getLocalDataUserId('), db.indexOf('export function getLocalDataUserId(') + 400);
  assert.match(scan, /'vials'/);
});

// Behaviour (Gate B review 2026-10-31, B1): getEntitlement with RevenueCat still answering for A while B is signed in.
function withMocks({ sessionUid, purchasesUid, live }, fn) {
  const path = require('node:path');
  const store = new Map();
  const ids = {
    purchases: require.resolve('../lib/purchases'),
    supabase: require.resolve('../lib/supabase'),
    storage: require.resolve('@react-native-async-storage/async-storage'),
  };
  const saved = {};
  const put = (id, exports) => { saved[id] = require.cache[id]; require.cache[id] = { id, filename: id, loaded: true, exports }; };
  put(ids.purchases, { readLiveEntitlement: async () => live, currentPurchasesUserId: () => purchasesUid });
  put(ids.supabase, { peekCachedUser: () => (sessionUid ? { id: sessionUid } : null) });
  const storage = { getItem: async (k) => (store.has(k) ? store.get(k) : null), setItem: async (k, v) => { store.set(k, v); } };
  put(ids.storage, { default: storage, __esModule: true });
  return fn(store).finally(() => { for (const id of Object.values(ids)) { if (saved[id]) require.cache[id] = saved[id]; else delete require.cache[id]; } });
}
const premiumA = { reachable: true, premium: true, expiresAt: '2099-01-01T00:00:00Z', endedOn: null, appUserId: 'A' };

test('DV-082 behaviour: SDK still on A, session B, RevenueCat user unset — B never gets A\'s Premium, nothing is cached for B', async () => {
  const { getEntitlement } = require('../lib/entitlement');
  await withMocks({ sessionUid: 'B', purchasesUid: null, live: premiumA }, async (store) => {
    const r = await getEntitlement();
    assert.equal(r.premium, false);
    assert.equal(store.has('dosetrace_entitlement_v1:B'), false);
  });
});

test('DV-082 behaviour: configure for B in flight (RevenueCat user B, answer still A\'s) — not taken, not cached', async () => {
  const { getEntitlement } = require('../lib/entitlement');
  await withMocks({ sessionUid: 'B', purchasesUid: 'B', live: premiumA }, async (store) => {
    const r = await getEntitlement();
    assert.equal(r.premium, false);
    assert.equal(store.has('dosetrace_entitlement_v1:B'), false);
  });
});

test('DV-082 behaviour: B\'s own answer is taken and cached; offline with no session the old order stands', async () => {
  const { getEntitlement } = require('../lib/entitlement');
  await withMocks({ sessionUid: 'B', purchasesUid: 'B', live: { ...premiumA, appUserId: 'B' } }, async (store) => {
    assert.equal((await getEntitlement()).premium, true);
    assert.ok(store.has('dosetrace_entitlement_v1:B'));
  });
  await withMocks({ sessionUid: null, purchasesUid: 'A', live: { reachable: false } }, async (store) => {
    store.set('dosetrace_entitlement_v1:A', JSON.stringify({ premium: true, expiresAt: '2099-01-01T00:00:00Z' }));
    assert.equal((await getEntitlement()).premium, true, 'a paying user offline keeps Premium from the cache');
  });
});

test('DV-081 behaviour: both wipe paths run the account-key step', async () => {
  const { afterSignedOut } = require('../lib/signedOut');
  const ran = [];
  const noop = () => {};
  const d = new Proxy({ clearAccountKeys: () => ran.push('signout'), waitForSyncIdle: async () => {}, stopSyncEngine: noop }, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' ? noop : undefined)) });
  await afterSignedOut(true, d);
  assert.ok(ran.includes('signout'));
  const { discardPreviousAccount } = require('../lib/accountGuard');
  const order = [];
  const g = new Proxy({ clearAccountKeys: () => order.push('keys'), cancelAllNotifications: () => order.push('cancel') }, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' ? noop : undefined)) });
  await discardPreviousAccount(g);
  assert.deepEqual(order.slice(0, 2), ['keys', 'cancel'], 'first in the discard (Gate B review N5)');
});
