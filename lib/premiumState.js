'use strict';
// A-164: one shared Premium state, so a change made elsewhere (admin-panel grant/revoke, store
// expiry, refund) shows in the open app without a cold start. Screens subscribe through
// lib/usePremium.js; screens that check at action time keep asking hasPremium().
//
//  - One RevenueCat CustomerInfo update listener per configured user (attachUser, from
//    initPurchases), removed on sign-out (detachUser, from logOutPurchases) or a user change.
//  - Back in the foreground: the SDK's cached CustomerInfo is invalidated, then re-read.
//  - Every answer comes from lib/entitlement.js getEntitlement() (the only reader of
//    RevenueCat; its per-user cache and entitlementFrom rules decide offline): a still-valid
//    cached Premium is never downgraded because the network failed.
//  - Never mixes accounts: a user change resets the state to unknown, and an answer read for
//    another user (or before the change) is dropped.
//
// createPremiumState is pure (runs under node --test with fake deps); the default instance loads
// the React Native modules lazily.

function createPremiumState(deps) {
  const empty = (uid) => Object.freeze({ uid, premium: false, known: false, source: 'unknown', expiresAt: null, endedOn: null });
  let snap = empty(null);
  let gen = 0; // bumped on every user change: answers started before it are dropped
  let removeListener = null;
  let watchingForeground = false;
  let foregroundBusy = false;
  // Face ID, the purchase sheet, permission prompts and pickers also bring the app back to
  // 'active': at most one foreground re-read a minute (Gate B review 2026-10-22).
  const FOREGROUND_GAP_MS = 60 * 1000;
  const now = () => (deps.now ? deps.now() : Date.now());
  let lastForeground = -Infinity;
  const subs = new Set();

  function emit() {
    for (const fn of Array.from(subs)) { try { fn(snap); } catch { /* one screen never breaks another */ } }
  }

  function setUser(uid) {
    gen++;
    if (removeListener) { try { removeListener(); } catch { /* already gone */ } removeListener = null; }
    snap = empty(uid);
    lastForeground = -Infinity; // a new user gets a fresh read on the next return
    emit();
  }

  // An entitlement answer for `uid`. Ignored for anyone but the attached user, and an unknown
  // answer (unreachable, no cache) never replaces a known one.
  function note(uid, r) {
    if (!uid || uid !== snap.uid || !r) return;
    if (!r.known && snap.known) return;
    const next = { uid, premium: !!r.premium, known: !!r.known, source: r.source || 'unknown', expiresAt: r.expiresAt ?? null, endedOn: r.endedOn ?? null };
    if (next.premium === snap.premium && next.known === snap.known && next.expiresAt === snap.expiresAt && next.endedOn === snap.endedOn) return;
    snap = Object.freeze(next);
    emit();
  }

  async function refresh({ invalidate = false } = {}) {
    const uid = snap.uid;
    const myGen = gen;
    if (!uid) return snap;
    if (invalidate) { try { await deps.invalidate(); } catch { /* the read below still decides */ } }
    if (myGen !== gen) return snap;
    let r;
    try { r = await deps.read(); } catch { return snap; }
    if (myGen === gen) note(uid, r);
    return snap;
  }

  function watchForeground() {
    if (watchingForeground) return;
    watchingForeground = true;
    try {
      deps.addForegroundListener(() => {
        if (!snap.uid || foregroundBusy) return;
        const t = now();
        if (t - lastForeground < FOREGROUND_GAP_MS) return;
        lastForeground = t;
        foregroundBusy = true;
        refresh({ invalidate: true }).catch(() => {}).finally(() => { foregroundBusy = false; });
      });
    } catch { watchingForeground = false; }
  }

  function attachUser(uid) {
    if (!uid) return;
    watchForeground();
    if (uid === snap.uid && removeListener) return; // same user configured again: nothing changes
    if (uid !== snap.uid) setUser(uid);
    const myGen = gen;
    try {
      removeListener = deps.addListener(() => {
        // A listener left over from a previous user never reads for the next one.
        if (myGen !== gen || snap.uid !== uid) return;
        refresh().catch(() => {});
      });
    } catch { removeListener = null; }
  }

  function detachUser() {
    if (snap.uid === null && !removeListener) return;
    setUser(null);
  }

  function subscribe(fn) {
    subs.add(fn);
    return () => { subs.delete(fn); };
  }

  return { attachUser, detachUser, refresh, note, subscribe, getSnapshot: () => snap };
}

const shared = createPremiumState({
  read: () => require('./entitlement').getEntitlement(),
  invalidate: () => require('./purchases').invalidateCustomerInfo(),
  addListener: (fn) => require('./purchases').addCustomerInfoListener(fn),
  addForegroundListener: (fn) => {
    const { AppState } = require('react-native');
    AppState.addEventListener('change', (state) => { if (state === 'active') fn(); });
  },
});

module.exports = {
  createPremiumState,
  attachPremiumUser: shared.attachUser,
  detachPremiumUser: shared.detachUser,
  refreshPremium: shared.refresh,
  subscribePremium: shared.subscribe,
  getPremiumSnapshot: shared.getSnapshot,
};
