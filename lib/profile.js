// Profile synced (docs/specs/profile-synced.md): lib/profileStore (the rules, tested in
// __tests__/profileSynced.test.js) wired to this app — the local database, the sync engine's "cloud
// table read here" note and the sync trigger. Synchronous SQLite reads only; every failure (the
// database not open yet, an install before the table) falls back to the user exactly as given, so a
// reader never sees less than user_metadata. Never called inside onAuthStateChange (Gate B).
//
//   withProfile(user)            → the user with the profile view laid over user_metadata (lib/supabase
//                                  getCachedUser / peekCachedUser / readStoredUser, the App gate)
//   ensureProfileCopy(user)      → the row created from user_metadata when missing (merge-only)
//   noteProfileWrite(user, data) → after user_metadata accepted a write: the same keys in the table
//   saveProfileEdit(user, data, { updateUser, knownOffline }) → Edit profile's save (founder 2026-11-24, B):
//                                  online as before; without internet kept on this phone and sent later
//   flushProfileEdits()          → the kept edit to user_metadata (start, sign-in, connection back, app active)
//   keptEditsBefore / clearAcceptedEdits → the one updateUser wrapper: any accepted write supersedes the kept
//                                  edit of its keys (Gate B 2026-11-24, PS-24)
//   useDroppedProfileEdit(userId) → App.js: the values a refusal cleared, for the one-time notice (PS-26)
import { useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import { getDB, getLocalDataUserId } from './database';
import { cloudTableReady } from './syncCore';
import * as PS from './profileStore';
import { readProfileRow, withProfileMeta, ensureProfileRow, phoneHoldsOtherAccount, noteWrite, sendProfileEdits } from './profileStore';

const T = 'account_profile';

export function withProfile(user) {
  if (!user || !user.id) return user;
  try {
    const db = getDB();
    return withProfileMeta(user, { row: readProfileRow(db, user.id), ready: cloudTableReady(db, T, user.id) });
  } catch {
    return user;
  }
}

// After the cross-account guard (App.js, both paths). Another account's data still on the phone
// (the guard holds) → nothing written; the next start copies it.
export function ensureProfileCopy(user) {
  if (!user || !user.id) return 'empty';
  try {
    if (phoneHoldsOtherAccount(getLocalDataUserId, user.id)) return 'empty';
    return ensureProfileRow(getDB(), user.id, user.user_metadata || {}, { now: new Date().toISOString() });
  } catch {
    return 'empty';
  }
}

// sessionUserId: the user App.js last saw (lib/supabase knownUser_, null after SIGNED_OUT). Written
// only while it is still this user and no other account's data is on the phone (the Apple / Google
// name fill at sign-in runs before the account guard): lib/profileStore noteWrite. user_metadata has
// the value either way; the copy after the guard brings it here.
export function noteProfileWrite(user, data, sessionUserId) {
  if (!user || !user.id) return;
  const db = getDB();
  const wrote = noteWrite(db, user, data, { sessionUserId, localOwner: getLocalDataUserId, ready: cloudTableReady(db, T, user.id), now: new Date().toISOString() });
  // Lazy: lib/sync imports lib/supabase, which requires this file lazily.
  if (wrote) { try { require('./sync').requestSync(); } catch { /* the next sync sends it */ } }
}

// ── Offline edit (founder 2026-11-24, B: "Guardar no celular e enviar quando a internet voltar";
// spec PS-18..PS-23, rules in lib/profileStore sendProfileEdits). Every send — Edit profile's save and
// the flush — runs one after the other, so an older waiting edit never lands after a newer save.
let sendQueue = Promise.resolve();
const serial = (fn) => { const run = sendQueue.then(fn, fn); sendQueue = run.catch(() => {}); return run; };
const sessionUserId = () => { try { return require('./supabase').sessionUserId(); } catch { return null; } };
const openDb = () => { try { return getDB(); } catch { return null; } };
// Gate B 2026-11-24 (PS-25): A-119 holds the kept edit (screen 2 / 4, or a takeover whose rebuild has not run).
// Stored state only; an error counts as held.
const editsHeld = (uid) => { try { return require('./deviceRuntime').profileEditsHeld(uid); } catch { return Promise.resolve(true); } };
// PS-26: a refusal cleared the kept edit → App.js shows the one-time notice.
const dropListeners = new Set();
function emitDropped() { for (const fn of [...dropListeners]) { try { fn(); } catch { /* UI only */ } } }

// Edit profile's save. updateUser: (data) => supabase.auth.updateUser({ data }) (the one wrapper: the A-119
// guard, user_metadata, then the table). → { status: 'saved' | 'kept' | 'failed', error? }
export function saveProfileEdit(user, data, { updateUser, knownOffline = false } = {}) {
  return serial(async () => {
    if (!user || !user.id) return { status: 'failed', error: new Error('no user') };
    return sendProfileEdits(openDb(), user.id, data, {
      updateUser, knownOffline, meta: user.user_metadata || {}, now: new Date().toISOString(),
      // Kept only for the account signed in now, never next to another account's data (PS-15, Gate B F2).
      canKeep: () => sessionUserId() === user.id && !phoneHoldsOtherAccount(getLocalDataUserId, user.id),
      held: () => editsHeld(user.id),
    });
  }).catch((error) => ({ status: 'failed', error }));
}

// A profile edit made outside Edit profile (integration 2026-11-24: the full name typed in the sheet before a
// report, AR-19) goes the same way as Edit profile's save: kept on this phone without internet, sent later.
export function saveProfileFields(user, data) {
  let online = null;
  try { online = require('./sync').isOnlineNow(); } catch { online = null; }
  const sb = require('./supabase');
  return saveProfileEdit(user, data, { updateUser: (d) => sb.supabase.auth.updateUser({ data: d }), knownOffline: online === false });
}

// The edit kept on this phone goes to the account (the signed-in one only). Nothing waiting → no request.
export function flushProfileEdits() {
  return serial(async () => {
    const uid = sessionUserId();
    if (!uid) return { status: 'none' };
    let online = null;
    try { online = require('./sync').isOnlineNow(); } catch { online = null; }
    if (online === false) return { status: 'offline' };
    const sb = require('./supabase');
    const r = await sendProfileEdits(openDb(), uid, null, {
      updateUser: (data) => sb.supabase.auth.updateUser({ data }), now: new Date().toISOString(),
      held: () => editsHeld(uid),
    });
    if (r && r.status === 'dropped') emitDropped();
    return r;
  }).catch(() => ({ status: 'offline' }));
}

// The one updateUser wrapper (lib/supabase, lib/profileWrite metadataWrite), around EVERY profile write.
export function keptEditsBefore(keys) {
  return PS.keptEditsBefore(openDb(), sessionUserId(), keys);
}
export function clearAcceptedEdits(user, keys, before) {
  return PS.clearAcceptedEdits(openDb(), user, keys, before, { sessionUserId: sessionUserId() });
}

// PS-26 (App.js): the values a refusal cleared for this account, until the notice is closed (one time:
// closing it, or its "Edit profile", forgets them). Read at start and after each refusal.
export function useDroppedProfileEdit(userId) {
  const [values, setValues] = useState(null);
  useEffect(() => {
    if (!userId) { setValues(null); return undefined; }
    const load = () => { try { setValues(PS.droppedEditOf(readProfileRow(getDB(), userId))); } catch { setValues(null); } };
    load();
    dropListeners.add(load);
    return () => { dropListeners.delete(load); };
  }, [userId]);
  const forget = useCallback(() => {
    setValues(null);
    try { if (userId) PS.forgetDroppedEdit(getDB(), userId); } catch { /* shown again next start */ }
  }, [userId]);
  return { values, forget };
}

// Started once by App.js (never inside onAuthStateChange): connection back, a completed sync pass (the
// network works even when the phone never reported it lost: a Wi-Fi without internet) and return to the
// app. Nothing waiting → no request, so a pass started by a flush ends there. → stop()
export function startProfileEditFlush() {
  let unsubSync = () => {};
  try {
    unsubSync = require('./sync').addSyncListener((e) => {
      if (e && ((e.type === 'connectivity' && e.online) || e.type === 'sync_complete')) flushProfileEdits();
    });
  } catch { /* the app-active trigger still runs */ }
  const sub = AppState.addEventListener('change', (st) => { if (st === 'active') flushProfileEdits(); });
  return () => { unsubSync(); sub.remove(); };
}
