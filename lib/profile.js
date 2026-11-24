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
import { getDB, getLocalDataUserId } from './database';
import { cloudTableReady } from './syncCore';
import { readProfileRow, withProfileMeta, ensureProfileRow, recordProfileWrite, phoneHoldsOtherAccount } from './profileStore';

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

export function noteProfileWrite(user, data) {
  if (!user || !user.id) return;
  // A write before the account guard ran (the Apple / Google name fill at sign-in) while another
  // account's data is on this phone: user_metadata has it; the copy after the guard brings it here.
  if (phoneHoldsOtherAccount(getLocalDataUserId, user.id)) return;
  const db = getDB();
  recordProfileWrite(db, user.id, data, { ready: cloudTableReady(db, T, user.id), meta: user.user_metadata || {}, now: new Date().toISOString() });
  // Lazy: lib/sync imports lib/supabase, which requires this file lazily.
  try { require('./sync').requestSync(); } catch { /* the next sync sends it */ }
}
