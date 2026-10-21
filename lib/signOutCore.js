'use strict';
// The deliberate sign-out, as plain logic with its dependencies passed in (testable with the real
// auth-js client and fakes; lib/accountActions wires the app's own). Gate B 2026-10-03:
//   F1 — auth-js 2.101.1 signOut({ scope: 'local' }) still calls /logout; offline it resolves
//        { error }, keeps the session and emits no SIGNED_OUT. The sign-out is then completed ON
//        THE PHONE (the stored session removed under the auth lock, which emits SIGNED_OUT so the
//        intended wipe runs). If a session is still there afterwards: the intentional flag is
//        disarmed and { failed: true } is returned — never success while still signed in.
//   F3 — a block says whether the phone is offline, so the screens only blame the connection
//        when it is the cause.
//   F6 — if counting the changes that are not backed up fails, nothing is signed out unless the
//        user chose "Sign out anyway" (force).

async function hasSession(auth) {
  try {
    // Gate B round 2 R2: offline with an expired token getSession() resolves { session: null,
    // error } while the session is still stored — any error means still signed in.
    const { data, error } = await auth.getSession();
    return !!(data && data.session) || !!error;
  } catch {
    return true; // unknown → treat as still signed in (never report a sign-out that did not happen)
  }
}

// auth-js internals (pinned by __tests__/signOutOffline.test.js against the installed version):
// _removeSession() deletes the stored session and notifies SIGNED_OUT; _acquireLock serialises it
// with token refreshes.
async function removeSessionLocally(auth, lockMs = 5000) {
  if (!auth || typeof auth._removeSession !== 'function') return false;
  const run = () => auth._removeSession();
  try {
    if (typeof auth._acquireLock === 'function') await auth._acquireLock(lockMs, run);
    else await run();
    return true;
  } catch {
    return false;
  }
}

async function completeLocalSignOut(auth) {
  let error = null;
  try {
    const r = await auth.signOut({ scope: 'local' });
    error = (r && r.error) || null;
  } catch (e) {
    error = e || new Error('signOut threw');
  }
  if (!error && !(await hasSession(auth))) return { signedOut: true, removedLocally: false };
  await removeSessionLocally(auth);
  const still = await hasSession(auth);
  return { signedOut: !still, removedLocally: !still };
}

// deps: { force, auth, forceSync, pendingCount, isOnline, removePushToken, signOutGoogle,
//         intent: { mark, consume }, releaseDevice }
// → { blocked: true, offline } | { failed: true } | { blocked: false }
// A-119 OD-9: "blocked" only means "not signed out yet": the caller shows the one sheet (lib/deviceCopy
// signOutSheet) and the person chooses "Sign out anyway" (force) or to stay — sign-out is never
// refused. DL-108: with nothing unsent (the second count is 0) the account is released on the server
// (releaseDevice, best effort) before the sign-out, so the next phone shows no "may be missing".
// strictStorage (R2): { begin, end } — while signing out, a storage delete that fails throws
// (lib/secureStore setStrictRemoval), so auth-js emits no SIGNED_OUT while tokens remain.
async function signOutCore({ force = false, auth, forceSync, pendingCount, isOnline, removePushToken, restorePushToken, signOutGoogle, intent, strictStorage, releaseDevice }) {
  try { await forceSync(); } catch { /* checked below */ }
  const offline = () => { try { return isOnline() === false; } catch { return false; } };
  if (!force) {
    let pending;
    try { pending = await pendingCount(); } catch { return { blocked: true, offline: offline(), unknown: true }; }
    if (pending > 0) return { blocked: true, offline: offline() };
  }
  try { await removePushToken(); } catch { /* best effort */ }
  // Final Gate B: counted again right before the flag is armed — a row written meanwhile (a Mark
  // complete notification action) blocks instead of being wiped; the push token goes back.
  if (!force) {
    let again;
    try { again = await pendingCount(); } catch { again = null; }
    if (!(again === 0)) {
      try { if (restorePushToken) await restorePushToken(); } catch { /* next launch registers it */ }
      return again == null ? { blocked: true, offline: offline(), unknown: true } : { blocked: true, offline: offline() };
    }
    try { if (releaseDevice) await releaseDevice(); } catch { /* the next phone shows the notice instead */ }
  }
  intent.mark();
  try { await signOutGoogle(); } catch { /* not a Google session */ }
  try { if (strictStorage) strictStorage.begin(); } catch { /* lax */ }
  let r;
  try { r = await completeLocalSignOut(auth); } finally { try { if (strictStorage) strictStorage.end(); } catch { /* lax */ } }
  if (!r.signedOut) {
    intent.consume(); // never leave the flag armed for a later spurious SIGNED_OUT
    return { failed: true };
  }
  // Gate B round 3 N1: the SIGNED_OUT handler consumes the flag synchronously; still armed here
  // means no SIGNED_OUT ran (e.g. a storage delete threw after the session was already unreadable):
  // nothing was wiped and the screens still show the account — never report that as success.
  if (intent.consume()) return { failed: true };
  return { blocked: false };
}

// Account deletion, after the server deleted the account (same guarantees as the deliberate
// sign-out, Gate B round 3 N1/N2): a wipe-pending marker naming the deleted account, the phone
// wiped AT ONCE, then a local sign-out (one retry). If no SIGNED_OUT ran (the flag is still armed)
// or a session is still there → the flag is disarmed and { failed: true } (the screens say
// "Couldn't sign out"); the marker stays so the next start finishes the job.
// deps: { auth, intent, userId, signOutGoogle, setWipePending, wipeNow } → { ok: true } | { failed: true }
async function finishDeletionCore({ auth, intent, userId, signOutGoogle, setWipePending, wipeNow, strictStorage, marker }) {
  try { await setWipePending(marker || (userId ? `deleted:${userId}` : '1')); } catch { /* best effort */ }
  try { wipeNow(); } catch { /* the cold-start check retries */ }
  intent.mark();
  try { await signOutGoogle(); } catch { /* not a Google session */ }
  // Strict storage removal, like the deliberate sign-out (R2): a failed keychain delete throws.
  try { if (strictStorage) strictStorage.begin(); } catch { /* lax */ }
  let r;
  try {
    r = await completeLocalSignOut(auth);
    if (!r.signedOut) r = await completeLocalSignOut(auth);
  } finally {
    try { if (strictStorage) strictStorage.end(); } catch { /* lax */ }
  }
  const stillArmed = intent.consume(); // the SIGNED_OUT handler consumes it synchronously
  if (!r.signedOut || stillArmed) return { failed: true };
  return { ok: true };
}

// A-119 OD-4 (the replaced phone's "Continue", the account deleted on another device): the same
// guarantees as the deletion finish — a wipe-pending marker naming this account ("wipe:<id>": the
// cold-start check completes it), the phone wiped at once, a local sign-out with the N1 guard. The
// account is not released: it is no longer this phone's.
function finishReplacedCore(deps) {
  return finishDeletionCore({ ...deps, marker: deps.userId ? `wipe:${deps.userId}` : '1' });
}

module.exports = { finishDeletionCore, finishReplacedCore, hasSession, removeSessionLocally, completeLocalSignOut, signOutCore };
