// The account actions shared by Settings and the 18+ confirmation sheet (PA-104): ONE export,
// ONE delete, ONE deliberate sign-out — the same code wherever they are offered. Moved here
// unchanged from screens/SettingsScreen.js (2026-10-03); each caller shows its own messages.
import { supabase, signOutGoogleNative } from './supabase';
import { getAllDataForExport, clearLocalDatabase } from './database';
import { stopSyncEngine, forceSync, isOnlineNow, pauseSyncForDeletion, resumeSyncAfterDeletion, deletionRequestSettled, waitForSyncIdle } from './sync';
import { markIntentionalSignOut, consumeIntentionalSignOut } from './authIntent';
import { pendingForSignOut } from './recoveryFlow';
import { signOutCore, finishDeletionCore, blockedCopy } from './signOutCore';
import { runRegisteredWipe, WIPE_PENDING_KEY } from './signedOut';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setStrictRemoval } from './secureStore';
import { teamMessagesForExport } from './teamMessages';
import { exportFilePath, removeExportFiles, profileForExport } from './exportFile';

export { blockedCopy };

// Write every record to a JSON file and open the share sheet. → { shared: true } when the
// share sheet opened, { saved: true } when sharing is unavailable. Throws on failure.
// Council 2026-10-22: also the account's messages from the DoseTrace team (id, body, created_at,
// read_at) from the phone's copy (lib/teamMessages; never blocks the export).
export async function exportMyData(user, dialogTitle) {
  const allData = getAllDataForExport(user.id);
  const teamMessagesRows = await teamMessagesForExport(user.id);
  const exportData = {
    exported_at: new Date().toISOString(),
    user_email: user.email,
    profile: profileForExport(user),
    ...allData,
    team_messages: teamMessagesRows,
  };
  const json = JSON.stringify(exportData, null, 2);
  const FileSystem = require('expo-file-system/legacy');
  // A-167 council: the cache folder (never backed up); older copies go first (lib/exportFile).
  await removeExportFiles(FileSystem);
  const path = exportFilePath(FileSystem);
  await FileSystem.writeAsStringAsync(path, json);
  const Sharing = require('expo-sharing');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle });
    return { shared: true };
  }
  return { saved: true };
}

// Ask the server to delete the account and ALL its data (supabase/functions/delete-user: the
// data rows first, then the auth account). → { noSession } | { syncBusy } (a sync pass still ran
// after idleWaitMs) | { offline } |
// { ok: true, appleManualRevokeNeeded }. Throws on a server error. Never called without the
// user's two confirmations. timeoutMs / idleWaitMs / checkTimeoutMs: tests only.
export async function requestAccountDeletion({ timeoutMs = 20000, idleWaitMs = 20000, checkTimeoutMs = 8000 } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { noSession: true };
  // No sync pass from here to the teardown (finishAccountDeletion): a refresh below can turn a
  // stored stand-in into a real session, whose recovered hook would otherwise push while delete-user
  // deletes the tables. A pass already running finishes first (at most 20 s, else { syncBusy }).
  pauseSyncForDeletion();
  let idleTimer = null;
  const idle = await Promise.race([
    waitForSyncIdle().then(() => true, () => true),
    new Promise((resolve) => { idleTimer = setTimeout(() => resolve(false), idleWaitMs); }),
  ]);
  clearTimeout(idleTimer); // test build 3 council item 3: no 20 s timer left behind
  // Delete account UI (founder 2026-10-17, 2): a pass still running is not "offline" — its own
  // result ("Still saving your data, try again in a minute"); sync resumes as before.
  if (!idle) { resumeSyncAfterDeletion(); return { syncBusy: true }; }
  // Test build 3 council item 3: RN Android's OkHttp has no timeout, so on a network that is up but
  // carries nothing the request would never answer (the hang CS-23 fixed for the refresh). Aborted
  // after timeoutMs; the abort lands in the catch below = offline (sync resumes).
  const post = (token) => {
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { if (ac) ac.abort(); } catch { /* ignore */ }
        reject(Object.assign(new Error('delete-user timed out'), { name: 'TimeoutError' }));
      }, timeoutMs);
    });
    const req = fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-user`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        ...(ac ? { signal: ac.signal } : {}),
      }
    );
    Promise.resolve(req).catch(() => {}); // a late rejection after the timeout is not unhandled
    return Promise.race([req, timeout]).finally(() => clearTimeout(timer));
  };
  // Review of ed5d8bf, item 1: the server keeps deleting after the client gave up.
  // Re-verification 1 (1.3.1): ONLY GoTrue's user_not_found from /auth/v1/user means the account is
  // gone. A refused refresh token, a 404, "does not exist" (session_not_found says that too) are a
  // revoked session elsewhere just as well — the account may still exist, never report it deleted.
  const goneError = (body) => !!body && (body.code === 'user_not_found' || body.error_code === 'user_not_found');
  // A refresh the server refused because it no longer knows the token: ask the account (accountState).
  const refusedToken = (e) => !!e && (e.code === 'refresh_token_not_found'
    || /invalid refresh token|refresh token not found/i.test(String(e.message || e.msg || e.error_description || '')));
  // Does the account still exist? GET /auth/v1/user with our token, its own timeout — not
  // supabase.auth.getUser(), which runs inside auth-js's lock: a stalled request there would hold
  // every session call. → 'gone' | 'exists' | 'unknown'.
  const accountState = async (token) => {
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer = null;
    try {
      const timeout = new Promise((resolve) => { timer = setTimeout(() => { try { if (ac) ac.abort(); } catch { /* ignore */ } resolve(null); }, checkTimeoutMs); });
      const req = fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY },
        ...(ac ? { signal: ac.signal } : {}),
      });
      Promise.resolve(req).catch(() => {});
      const r = await Promise.race([req, timeout]);
      if (!r) return 'unknown';
      let body = {};
      try { body = await r.json(); } catch { body = {}; }
      if (r.ok && body && body.id) return 'exists';
      if (r.status >= 400 && r.status < 500 && goneError(body)) return 'gone';
      return 'unknown';
    } catch { return 'unknown'; } finally { clearTimeout(timer); }
  };
  const gone = () => { deletionRequestSettled(); return { ok: true, appleManualRevokeNeeded: false }; };
  let res;
  let token = session.access_token;
  try {
    res = await post(token);
    // Gate B 2 (A-137): a token the server calls expired while this phone thinks it valid (the
    // clock was moved back) → one refresh, one retry with the NEW token. Never more than once. No
    // new token (offline: the refresh answered with the stored session) → "offline", the message
    // the user can act on, never "deletion failed".
    if (res.status === 401) {
      let fresh = null;
      let refreshError = null;
      try { const { data, error } = await supabase.auth.refreshSession(); fresh = data && data.session && data.session.access_token; refreshError = error || null; } catch (e) { fresh = null; refreshError = e; }
      // An earlier attempt may already have deleted the account — or the session was revoked
      // elsewhere: the account itself is asked (Re-verification 1).
      if (refusedToken(refreshError) && (await accountState(token)) === 'gone') return gone();
      if (!fresh || fresh === session.access_token) { resumeSyncAfterDeletion(); return { offline: true }; }
      token = fresh;
      res = await post(fresh);
    }
  } catch (e) {
    // Timed out: the request may have reached the server, which goes on deleting. Sync stays paused
    // until we know: gone → the teardown; still there → resume; unknown → paused (the next engine
    // start, an app start or a retry clears it).
    if (e && e.name === 'TimeoutError') {
      const state = await accountState(token);
      if (state === 'gone') return gone();
      if (state === 'exists') { resumeSyncAfterDeletion(); return { offline: true }; }
      deletionRequestSettled();
      return { offline: true };
    }
    // DV-009 lost-response half (Gate B 2, 1.3.1): a network-level failure cannot tell "never left"
    // from "the answer was lost after the server deleted" — ask first. Gone → the teardown (never
    // "failed", never a retry against a deleted account); otherwise offline, sync resumes as before.
    const state = await accountState(token);
    if (state === 'gone') return gone();
    resumeSyncAfterDeletion();
    return { offline: true };
  }
  let result;
  try { result = await res.json(); } catch { result = {}; }
  if (!res.ok) {
    // A 5xx after the function already deleted the auth account (it deletes the data, then the
    // account): the account is gone, so the deletion worked.
    if (res.status >= 500 && (await accountState(token)) === 'gone') return gone();
    resumeSyncAfterDeletion();
    throw new Error(result.error || 'deletion failed');
  }
  // Deleted on the server: the request is over (a SIGNED_IN start no longer matters), sync stays
  // paused; finishAccountDeletion stops it and wipes.
  deletionRequestSettled();
  return { ok: true, appleManualRevokeNeeded: !!result.appleManualRevokeNeeded };
}

// Local teardown after a confirmed server-side deletion: clear local data and sign out (local
// scope — the account is already gone). The native Google session is fully detached (signOut +
// revoke) so the deleted account can't be silently re-authenticated.
// lib/signOutCore finishDeletionCore: wipe-pending marker naming the account, immediate wipe (the
// App's registered steps; the local database at least if none), local sign-out with the N1 guard.
// → { ok: true } | { failed: true } (the screens say "Couldn't sign out").
export async function finishAccountDeletion() {
  stopSyncEngine();
  let userId = null;
  try { const { data } = await supabase.auth.getSession(); userId = data?.session?.user?.id || null; } catch { /* unknown */ }
  return finishDeletionCore({
    auth: supabase.auth,
    intent: { mark: markIntentionalSignOut, consume: consumeIntentionalSignOut },
    userId,
    signOutGoogle: () => signOutGoogleNative({ revoke: true }),
    setWipePending: (v) => AsyncStorage.setItem(WIPE_PENDING_KEY, String(v)),
    wipeNow: () => { try { runRegisteredWipe(); } catch { clearLocalDatabase(); } },
    strictStorage: { begin: () => setStrictRemoval(true), end: () => setStrictRemoval(false) },
  });
}

// Entries of a protocol deleted forever on another device (lib/orphanedPending): those of the
// local data owner and of the signed-in user. Counted for the one-time prompt; removed only on the
// user's Discard, nothing else.
async function orphanOwners() {
  const { getLocalDataUserId } = require('./database');
  let sessionUserId = null;
  try { const { data } = await supabase.auth.getSession(); sessionUserId = data?.session?.user?.id || null; } catch { /* unknown */ }
  return [getLocalDataUserId(), sessionUserId];
}
export async function orphanedPendingCount() {
  try {
    const { getDB } = require('./database');
    const { countOrphanedPending } = require('./orphanedPending');
    return countOrphanedPending(getDB(), await orphanOwners());
  } catch { return 0; }
}
export async function discardOrphaned() {
  const { getDB } = require('./database');
  const { discardOrphanedPending } = require('./orphanedPending');
  const n = discardOrphanedPending(getDB(), await orphanOwners());
  try { require('./sync').notifyDataChanged('orphans'); } catch { /* the screens refresh on focus */ }
  return n;
}

// The deliberate sign-out: push what is not backed up, and if anything is STILL not in the
// cloud (offline) sign nobody out → { blocked: true } (never lose data — the intended sign-out
// wipes the phone). Otherwise remove this device's push token while still signed in, mark it
// intended so the SIGNED_OUT wipe runs, detach Google → { blocked: false }.
// force: the user saw that changes are not backed up and chose "Sign out anyway" (Settings).
// → { blocked: true, offline } | { failed: true } (still signed in: say so) | { blocked: false }.
// The logic lives in lib/signOutCore (Gate B F1/F3/F6, behaviour-tested); this wires the app's own.
export async function signOutIntended({ force = false } = {}) {
  return signOutCore({
    force,
    auth: supabase.auth,
    forceSync,
    // R3: the local owner AND the signed-in user (a null owner never counts 0).
    pendingCount: async () => {
      const { getDB, getLocalDataUserId } = require('./database');
      const { TABLES, getPendingChanges } = require('./syncCore');
      let sessionUserId = null;
      try { const { data } = await supabase.auth.getSession(); sessionUserId = data?.session?.user?.id || null; } catch { /* unknown */ }
      return pendingForSignOut({ db: getDB(), localOwnerId: getLocalDataUserId(), sessionUserId, tables: TABLES, getPending: getPendingChanges });
    },
    isOnline: isOnlineNow,
    removePushToken: async () => { const { removePushToken } = require('./notifications'); await removePushToken(); },
    restorePushToken: async () => { const { registerPushToken } = require('./notifications'); await registerPushToken(); },
    signOutGoogle: () => signOutGoogleNative(),
    intent: { mark: markIntentionalSignOut, consume: consumeIntentionalSignOut },
    strictStorage: { begin: () => setStrictRemoval(true), end: () => setStrictRemoval(false) },
  });
}
