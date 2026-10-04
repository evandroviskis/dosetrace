'use strict';
// What a SIGNED_OUT does, as plain logic (Gate B 2026-10-03 F5; behaviour-tested in
// __tests__/signedOutHandler.test.js). App's onAuthStateChange runs onSignedOutNow inline and
// afterSignedOut in a setTimeout.

// Gate B round 2 R1: a sign-in generation. App bumps it INLINE in SIGNED_IN (a plain counter
// write, safe in the callback); the deferred wipe captures it before waiting for a running sync
// and skips if someone signed in meanwhile (else the old account's wipe would hit the new one).
let generation = 0;
function bumpSignInGeneration() { generation += 1; return generation; }
function signInGeneration() { return generation; }

// INLINE in the auth callback: ref writes and pure in-memory reads only — never await, never
// supabase (that deadlocks the session). Returns whether the sign-out was intended.
function onSignedOutNow(d) {
  // Any sign-out ends the onboarding answers' freshness (another account never receives them).
  d.endStashFreshness();
  // A notification tap queued for this account must never open a screen for the next one.
  d.pendingNavRef.current = null;
  // WIPE only on an INTENTIONAL sign-out (Sign out / Delete). A spurious SIGNED_OUT (token
  // refresh failure, expired session) keeps the data: it is cloud-backed and the same user
  // re-auths (the destructive wipe on a hiccup erased an in-progress reality check).
  const intentional = d.consumeIntentionalSignOut();
  if (intentional) { d.discardStashNow(); d.clearAuthDraft(); d.setSeenOnboarding(false); }
  return intentional;
}

// DEFERRED. Gate B round 3 N2: on an intended sign-out the wipe runs AT ONCE (signOutCore already
// forced a sync, or the user chose Sign out anyway) — waiting for a running sync had no time limit
// and a restart forgot it. A "wipe pending" marker is written first (setWipePending) so a cold
// start with no session completes it (completePendingWipe). After the running sync ends, the
// database is cleared once more (a pass may have written rows meanwhile), inside the runner's
// exclusive slot and only if nobody signed in since (the sign-in generation, R1); then the marker
// is cleared. One failing step never stops the rest.
// → false (spurious) | 'skipped' (a new sign-in happened before the second pass) | true (wiped)
async function afterSignedOut(intentional, d) {
  d.stopSyncEngine();
  if (!intentional) return false;
  const gen = d.getSignInGeneration ? d.getSignInGeneration() : null;
  const moved = () => d.getSignInGeneration && d.getSignInGeneration() !== gen;
  try { if (d.setWipePending) await d.setWipePending(true); } catch { /* best effort */ }
  runWipeSteps(d); // first pass, now
  try { await d.waitForSyncIdle(); } catch { /* idle either way */ }
  const clearMarker = async () => { try { if (d.setWipePending) await d.setWipePending(false); } catch { /* next start */ } };
  if (moved()) { await clearMarker(); return 'skipped'; }
  let skipped = false;
  const second = () => {
    if (moved()) { skipped = true; return; }
    try { d.clearLocalDatabase(); } catch { /* the cold-start check retries */ }
  };
  if (d.runExclusive) {
    try { await d.runExclusive(second); } catch { /* steps never throw */ }
  } else {
    second();
  }
  await clearMarker();
  return skipped ? 'skipped' : true;
}

// Cold start: a wipe left pending (the app was closed before it finished) completes when nobody
// is signed in; with a session the marker is dropped (that sign-in's cross-account guard owns the
// local data). → true when it wiped.
// A marker "deleted:<id>" (account deletion) whose account still has a session here is wiped and
// signed out too — a deleted account never stays half-signed-in on the phone.
async function completePendingWipe(d, { hasSession, sessionUserId = null }) {
  let pending = null;
  try { pending = await d.isWipePending(); } catch { pending = null; }
  if (!pending) return false;
  const deletedId = typeof pending === 'string' && pending.startsWith('deleted:') ? pending.slice(8) : null;
  if (hasSession && !(deletedId && deletedId === sessionUserId)) {
    try { await d.setWipePending(false); } catch { /* next start */ }
    return false;
  }
  runWipeSteps(d);
  let done = true;
  if (hasSession && d.signOutLocally) {
    try { const r = await d.signOutLocally(); done = !!(r && r.signedOut); } catch { done = false; }
  }
  if (done) { try { await d.setWipePending(false); } catch { /* next start */ } }
  return true;
}

// The App registers how to build the wipe steps (its wipeDeps), so account deletion
// (lib/accountActions) can wipe at once with the same steps.
let wipeFactory = null;
function registerWipe(factory) { wipeFactory = factory; }
function runRegisteredWipe() {
  if (!wipeFactory) throw new Error('no wipe registered');
  const d = wipeFactory();
  try { d.stopSyncEngine(); } catch { /* ignore */ }
  runWipeSteps(d);
}

function runWipeSteps(d) {
  const steps = [
    d.clearLocalDatabase, d.cancelAllNotifications, d.dismissAllNotifications, d.logOutPurchases,
    d.clearOnboarding, d.removeRcStart, d.clearRealityDeviceFlags, d.clearSeenOnboarding,
    d.removeQuestions, d.resetAllSelections, d.clearAllDrafts,
  ];
  for (const step of steps) {
    try {
      const r = step();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch { /* keep wiping */ }
  }
}

module.exports = { registerWipe, runRegisteredWipe, WIPE_PENDING_KEY: 'dosetrace_wipe_pending', completePendingWipe, onSignedOutNow, afterSignedOut, bumpSignInGeneration, signInGeneration };
