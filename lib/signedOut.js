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

// DEFERRED: stop sync first; on an intended sign-out wait for a running sync (never delete rows
// while a push writes them, F2), then wipe everything of this account from the phone: the local
// database, the scheduled AND the already delivered notifications, purchases identity, the
// device-global stash and flags, selections and drafts. One failing step never stops the rest.
// → false (spurious) | 'skipped' (a new sign-in happened while waiting) | true (wiped)
async function afterSignedOut(intentional, d) {
  d.stopSyncEngine();
  if (!intentional) return false;
  const gen = d.getSignInGeneration ? d.getSignInGeneration() : null;
  try { await d.waitForSyncIdle(); } catch { /* idle either way */ }
  const moved = () => d.getSignInGeneration && d.getSignInGeneration() !== gen;
  if (moved()) return 'skipped';
  let skipped = false;
  const wipe = () => {
    if (moved()) { skipped = true; return; } // re-checked inside the exclusive slot
    runWipeSteps(d);
  };
  if (d.runExclusive) {
    try { await d.runExclusive(wipe); } catch { /* steps never throw */ }
  } else {
    wipe();
  }
  return skipped ? 'skipped' : true;
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

module.exports = { onSignedOutNow, afterSignedOut, bumpSignInGeneration, signInGeneration };
