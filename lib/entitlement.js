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

const pad = (n) => (n < 10 ? '0' + n : '' + n);
function dayOf(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

// The full answer (premium + endedOn for the food log). Never throws.
async function getEntitlement() {
  const { readLiveEntitlement, currentPurchasesUserId } = require('./purchases');
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  let lastUid = null;
  try { lastUid = await AsyncStorage.getItem(LAST_UID_KEY); } catch { lastUid = null; }
  const uid = cacheUid({ purchasesUid: currentPurchasesUserId(), lastUid });
  let live = null;
  try { live = await readLiveEntitlement(); } catch { live = null; }
  let cache = null;
  if (uid) { try { const raw = await AsyncStorage.getItem(cacheKey(uid)); cache = raw ? JSON.parse(raw) : null; } catch { cache = null; } }
  const r = entitlementFrom({ live, cache, now: Date.now() });
  if (r.writeCache && uid) {
    AsyncStorage.setItem(cacheKey(uid), JSON.stringify(r.writeCache)).catch(() => {});
    if (uid !== lastUid) AsyncStorage.setItem(LAST_UID_KEY, uid).catch(() => {});
  }
  return r;
}

// Does this user have Premium right now? Never throws.
async function hasPremium() {
  try { return (await getEntitlement()).premium; } catch { return false; }
}

module.exports = { entitlementFrom, cacheUid, getEntitlement, hasPremium };
