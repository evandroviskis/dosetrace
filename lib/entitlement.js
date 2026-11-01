'use strict';
// THE entitlement helper (S-06 / FX-16 + FX-4). Every Premium gate in screens/,
// components/ and lib/ asks this module — a static test (entitlementGuard.test.js)
// fails if anything else calls isPremium()/getCustomerInfo() or reads the RevenueCat
// entitlement directly. lib/purchases.js only talks to the store.
//
//  - Store reachable: its answer, cached per user WITH the expiration date.
//  - Store unreachable: the cache decides — expiration in the future (or lifetime)
//    = full access, so a paying user is never locked out for being offline;
//    expiration passed = not paying (its end date is kept for the food log);
//    never known paying = free tier.
// Server-side checks for paid calls (AI extraction / parsing) stay authoritative.
//
// entitlementFrom is pure (runs under node --test); the async helpers load the
// React Native modules lazily so this file can be required in tests.
const { localISO } = require('./localDate');

function dayOf(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : localISO(d);
}

// live:  { reachable: true, premium, expiresAt (ISO | null = lifetime), endedOn } | { reachable: false } | null
// cache: { premium, expiresAt, endedOn } | null
// → { premium, known, source, expiresAt, endedOn, writeCache }
function entitlementFrom({ live, cache, now = Date.now() } = {}) {
  if (live && live.reachable) {
    const premium = !!live.premium;
    const expiresAt = live.expiresAt ?? null;
    const endedOn = premium ? null : (live.endedOn || null);
    return { premium, known: true, source: 'live', expiresAt, endedOn, writeCache: { premium, expiresAt, endedOn } };
  }
  if (cache && cache.premium) {
    if (cache.expiresAt == null) return { premium: true, known: true, source: 'cache', expiresAt: null, endedOn: null, writeCache: undefined };
    const exp = Date.parse(cache.expiresAt);
    if (Number.isFinite(exp) && exp > now) return { premium: true, known: true, source: 'cache', expiresAt: cache.expiresAt, endedOn: null, writeCache: undefined };
    return { premium: false, known: true, source: 'cache', expiresAt: cache.expiresAt, endedOn: cache.endedOn || dayOf(cache.expiresAt), writeCache: undefined };
  }
  if (cache) return { premium: false, known: true, source: 'cache', expiresAt: cache.expiresAt ?? null, endedOn: cache.endedOn || null, writeCache: undefined };
  return { premium: false, known: false, source: 'unknown', expiresAt: null, endedOn: null, writeCache: undefined };
}

const cacheKey = (uid) => `dosetrace_entitlement_v1:${uid}`;
const LAST_UID_KEY = 'dosetrace_entitlement_last_uid';

// Whose cache: the RevenueCat user the SDK is configured with (set at sign-in), else the
// last user seen. Never derived from the Supabase session: offline, a failed token refresh makes
// the session read return null after ~30 s (Gate B review 2026-10-01).
function cacheUid({ purchasesUid, lastUid }) {
  return purchasesUid || lastUid || null;
}

// DV-082 (DL-53): whose Premium this is. The user of the session (noted inline on every auth event, a
// plain read — lib/supabase peekCachedUser) wins: right after SIGNED_IN of account B RevenueCat is still
// configured for A until initPurchases runs, so A's live answer is never B's (liveIsTheirs false: not
// taken, not cached). Without a session read (offline, a failed refresh) the configured RevenueCat user,
// then the last one seen, as before.
function entitlementOwner({ sessionUid = null, purchasesUid = null, lastUid = null }) {
  // Gate B review (2026-10-31): strict — with a session, RevenueCat must be configured for that same user.
  if (sessionUid) return { uid: sessionUid, liveIsTheirs: purchasesUid === sessionUid };
  return { uid: cacheUid({ purchasesUid, lastUid }), liveIsTheirs: true };
}
// The live answer counts only for its owner: RevenueCat names the user it answered for (appUserId). With a
// session, an answer that names nobody is not taken either (a configure in flight answers for the previous
// user). Without a session (offline, headless) the old rule stands. → the live answer or null.
function liveForOwner(owner, live, hasSession) {
  if (!live || live.reachable === false) return live;
  if (!owner.liveIsTheirs || !owner.uid) return null;
  if (live.appUserId) return live.appUserId === owner.uid ? live : null;
  return hasSession ? null : live;
}
const sessionUidNow = () => { try { const u = require('./supabase').peekCachedUser(); return (u && u.id) || null; } catch { return null; } };

// The full answer (premium + endedOn for the food log). Never throws.
async function getEntitlement() {
  const { readLiveEntitlement, currentPurchasesUserId } = require('./purchases');
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  let lastUid = null;
  try { lastUid = await AsyncStorage.getItem(LAST_UID_KEY); } catch { lastUid = null; }
  const sessionUid = sessionUidNow();
  const owner = entitlementOwner({ sessionUid, purchasesUid: currentPurchasesUserId(), lastUid });
  const uid = owner.uid;
  let live = null;
  try { live = await readLiveEntitlement(); } catch { live = null; }
  live = liveForOwner(owner, live, !!sessionUid);
  // The account may have switched during the live read: never write its answer into the other
  // account's cache (Gate B review 2026-10-22, A-164).
  const after = entitlementOwner({ sessionUid: sessionUidNow(), purchasesUid: currentPurchasesUserId(), lastUid });
  const stillSameUser = after.uid === uid && after.liveIsTheirs === owner.liveIsTheirs;
  let cache = null;
  if (uid) { try { const raw = await AsyncStorage.getItem(cacheKey(uid)); cache = raw ? JSON.parse(raw) : null; } catch { cache = null; } }
  const r = entitlementFrom({ live, cache, now: Date.now() });
  if (r.writeCache && uid && stillSameUser) {
    AsyncStorage.setItem(cacheKey(uid), JSON.stringify(r.writeCache)).catch(() => {});
    if (uid !== lastUid) AsyncStorage.setItem(LAST_UID_KEY, uid).catch(() => {});
  }
  return r;
}

// Does this user have Premium right now? Never throws.
async function hasPremium() {
  try { return (await getEntitlement()).premium; } catch { return false; }
}

// Delete account (founder 2026-10-17 3 C; Gate B of 5cb065f, 2): which store bills the active
// Premium, so the delete sheet can say where to cancel. → 'APP_STORE' | 'PLAY_STORE' | null.
// A subscription that will renew decides (the entitlement's own store first); promotional, Lifetime,
// already cancelled, another store, not Premium or unknown → null: nothing to cancel in a store.
function billingStoreFrom(live) {
  if (!live || !live.reachable || !live.premium) return null;
  const norm = (s) => (s === 'APP_STORE' || s === 'MAC_APP_STORE' ? 'APP_STORE' : s === 'PLAY_STORE' ? 'PLAY_STORE' : null);
  if (Array.isArray(live.renewingStores)) {
    const renewing = live.renewingStores.map(norm).filter(Boolean);
    const own = norm(live.store);
    return own && renewing.includes(own) ? own : (renewing[0] || null);
  }
  return live.willRenew === false ? null : norm(live.store);
}

// The store's live answer (no cache: deleting needs the network anyway). Never throws.
async function getBillingStore() {
  try {
    const { readLiveEntitlement } = require('./purchases');
    return billingStoreFrom(await readLiveEntitlement());
  } catch { return null; }
}

module.exports = { entitlementFrom, cacheUid, entitlementOwner, liveForOwner, getEntitlement, hasPremium, billingStoreFrom, getBillingStore };
