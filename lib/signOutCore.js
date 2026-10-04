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
//         intent: { mark, consume } }
// → { blocked: true, offline } | { failed: true } | { blocked: false }
// strictStorage (R2): { begin, end } — while signing out, a storage delete that fails throws
// (lib/secureStore setStrictRemoval), so auth-js emits no SIGNED_OUT while tokens remain.
async function signOutCore({ force = false, auth, forceSync, pendingCount, isOnline, removePushToken, signOutGoogle, intent, strictStorage }) {
  try { await forceSync(); } catch { /* checked below */ }
  const offline = () => { try { return isOnline() === false; } catch { return false; } };
  if (!force) {
    let pending;
    try { pending = pendingCount(); } catch { return { blocked: true, offline: offline(), unknown: true }; }
    if (pending > 0) return { blocked: true, offline: offline() };
  }
  try { await removePushToken(); } catch { /* best effort */ }
  intent.mark();
  try { await signOutGoogle(); } catch { /* not a Google session */ }
  try { if (strictStorage) strictStorage.begin(); } catch { /* lax */ }
  let r;
  try { r = await completeLocalSignOut(auth); } finally { try { if (strictStorage) strictStorage.end(); } catch { /* lax */ } }
  if (!r.signedOut) {
    intent.consume(); // never leave the flag armed for a later spurious SIGNED_OUT
    return { failed: true };
  }
  return { blocked: false };
}

// Gate B F3: the words for a blocked sign-out — the internet is named only when the phone is
// offline; otherwise "Some changes could not be backed up." (string keys; link = App's linkFailed).
function blockedCopy(r) {
  return r && r.offline
    ? { settingsBody: 'settings_signout_unsynced_body', stay: 'settings_signout_connect_first', sheet: 'auth_signout_unsynced', link: 'offline' }
    : { settingsBody: 'settings_signout_notbacked_body', stay: 'settings_signout_stay', sheet: 'auth_signout_notbacked', link: 'notbacked' };
}

// Gate B F7: what a caller shows after the deliberate sign-out (string keys). Anything but a
// confirmed { blocked: false } is never "done" — no answer counts as "could not sign out".
//   title/body → a sheet (the 18+ sheet); link → App's linkFailed for the reset link.
function signOutOutcome(r) {
  if (r && r.blocked === false && !r.failed) return { kind: 'done' };
  if (r && r.blocked && !r.failed) {
    const c = blockedCopy(r);
    return { kind: 'blocked', title: 'settings_signout', body: c.sheet, link: c.link };
  }
  return { kind: 'failed', title: 'settings_signout_failed_title', body: 'settings_signout_failed_body', link: 'offline' };
}

module.exports = { signOutOutcome, blockedCopy, hasSession, removeSessionLocally, completeLocalSignOut, signOutCore };
