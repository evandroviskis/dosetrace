// The account actions shared by Settings and the 18+ confirmation sheet (PA-104): ONE export,
// ONE delete, ONE deliberate sign-out — the same code wherever they are offered. Moved here
// unchanged from screens/SettingsScreen.js (2026-10-03); each caller shows its own messages.
import { supabase, signOutGoogleNative } from './supabase';
import { getAllDataForExport, clearLocalDatabase } from './database';
import { stopSyncEngine, forceSync } from './sync';
import { markIntentionalSignOut } from './authIntent';
import { unsyncedCount } from './recoveryFlow';

// Write every record to a JSON file and open the share sheet. → { shared: true } when the
// share sheet opened, { saved: true } when sharing is unavailable. Throws on failure.
export async function exportMyData(user, dialogTitle) {
  const allData = getAllDataForExport(user.id);
  const exportData = {
    exported_at: new Date().toISOString(),
    user_email: user.email,
    ...allData,
  };
  const json = JSON.stringify(exportData, null, 2);
  const FileSystem = require('expo-file-system');
  const path = FileSystem.documentDirectory + 'dosetrace_export.json';
  await FileSystem.writeAsStringAsync(path, json);
  const Sharing = require('expo-sharing');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle });
    return { shared: true };
  }
  return { saved: true };
}

// Ask the server to delete the account and ALL its data (supabase/functions/delete-user: the
// data rows first, then the auth account). → { noSession } | { offline } |
// { ok: true, appleManualRevokeNeeded }. Throws on a server error. Never called without the
// user's two confirmations.
export async function requestAccountDeletion() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { noSession: true };
  let res;
  try {
    res = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-user`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch {
    return { offline: true }; // fetch rejects only on a network-level failure
  }
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'deletion failed');
  return { ok: true, appleManualRevokeNeeded: !!result.appleManualRevokeNeeded };
}

// Local teardown after a confirmed server-side deletion: clear local data and sign out (local
// scope — the account is already gone). The native Google session is fully detached (signOut +
// revoke) so the deleted account can't be silently re-authenticated.
export async function finishAccountDeletion() {
  stopSyncEngine();
  clearLocalDatabase();
  markIntentionalSignOut(); // deliberate account deletion — full wipe
  await signOutGoogleNative({ revoke: true });
  try { await supabase.auth.signOut({ scope: 'local' }); }
  catch { await supabase.auth.signOut().catch(() => {}); }
}

// The deliberate sign-out: push what is not backed up, and if anything is STILL not in the
// cloud (offline) sign nobody out → { blocked: true } (never lose data — the intended sign-out
// wipes the phone). Otherwise remove this device's push token while still signed in, mark it
// intended so the SIGNED_OUT wipe runs, detach Google → { blocked: false }.
// force: the user saw that changes are not backed up and chose "Sign out anyway" (Settings).
export async function signOutIntended({ force = false } = {}) {
  try { await forceSync(); } catch { /* checked below */ }
  try {
    const { getDB, getLocalDataUserId } = require('./database');
    const { TABLES, getPendingChanges } = require('./syncCore');
    if (!force && unsyncedCount(getDB(), getLocalDataUserId(), TABLES, getPendingChanges) > 0) return { blocked: true };
  } catch { /* no local database: nothing to lose */ }
  try { const { removePushToken } = require('./notifications'); await removePushToken(); } catch { /* best effort */ }
  markIntentionalSignOut();
  try { await signOutGoogleNative(); } catch { /* not a Google session */ }
  try { await supabase.auth.signOut({ scope: 'local' }); }
  catch { await supabase.auth.signOut().catch(() => {}); }
  return { blocked: false };
}
