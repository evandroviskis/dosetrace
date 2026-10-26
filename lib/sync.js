/**
 * DoseTrace Sync Engine
 *
 * Handles bidirectional sync between local SQLite (source of truth)
 * and Supabase (cloud backup / multi-device).
 *
 * Flow:
 *   1. On app start / login → fullImportFromCloud() if local DB is empty
 *   2. On connectivity restored → pushPendingChanges() then pullCloudChanges()
 *   3. After any local write → trigger a debounced sync if online
 */

import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase, getCachedUser, sessionNetworkBack, onSessionRecovered } from './supabase';
import { getDB, getLocalDataUserId } from './database';
import {
  pushPending,
  pullChanges, pullTable,
  fullImport, rebuildFromCloud,
  isLocalDBEmpty as coreIsLocalDBEmpty,
} from './syncCore';
import { createSyncRunner } from './syncRunner';
import { runSyncPass, trackRefusals } from './syncPassCore';
import { summarizeUnsent } from './unsentSummary';
import { fetchByUpdated, fetchAllRows, fetchById, fetchIdsKeyset } from './syncPager';
import { ownerBlocksSync } from './accountGuard';
import { recordDoseLogsPull, forgetDoseLogsPull } from './pullStamp';

// ── State ───────────────────────────────────────────────────────
let _isOnline = true;
let _syncTimer = null;
let _unsubNetInfo = null;
let _listeners = [];

// ── Listeners (UI can subscribe to sync state changes) ──────────
export function addSyncListener(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

function notifyListeners(event) {
  for (const fn of _listeners) {
    try { fn(event); } catch { /* ignore */ }
  }
}

// Broadcast a local data change (e.g. a protocol was saved) so any mounted
// screen refreshes immediately — without waiting for a network sync to finish.
// Screens that care listen for { type: 'data_changed' } via addSyncListener.
// Last known connectivity from NetInfo: true / false, or null before the first report.
let _knownOnline = null;
export function isOnlineNow() { return _knownOnline; }

export function notifyDataChanged(what) {
  notifyListeners({ type: 'data_changed', what: what || null });
}

// ── Start / Stop ────────────────────────────────────────────────
// A session recovered after "JWT expired" or the network coming back (lib/authFetch): sync again,
// so the pushes that failed meanwhile go now (they stayed queued in SQLite).
let _unsubRecovered = null;
// Account deletion (Gate B of cc29269): from just before the delete-user POST until the teardown, no
// sync pass runs — a push while the server deletes the account's tables table by table would write
// rows back or fail half-way. A failed or offline deletion resumes; an engine start (sign-in) after
// the request settled starts unpaused. Test build 3 council item 4: App.js starts the engine on
// SIGNED_IN, so _deletionInFlight (set with the pause, cleared only when requestAccountDeletion
// settles) keeps the pause through a start that happens while the request is out.
let _deletionPaused = false;
let _deletionInFlight = false;

export function pauseSyncForDeletion() {
  _deletionPaused = true;
  _deletionInFlight = true;
  if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }
}

// The server deleted the account: the request is over, the pause stays until the teardown.
export function deletionRequestSettled() {
  _deletionInFlight = false;
}

export function resumeSyncAfterDeletion() {
  _deletionInFlight = false;
  _deletionPaused = false;
  requestSync();
}

export function startSyncEngine() {
  if (!_deletionInFlight) _deletionPaused = false;
  if (!_unsubRecovered) _unsubRecovered = onSessionRecovered(() => requestSync());
  if (_unsubNetInfo) return; // already running

  _unsubNetInfo = NetInfo.addEventListener(state => {
    const wasOffline = !_isOnline;
    _isOnline = !!(state.isConnected && state.isInternetReachable !== false);
    _knownOnline = _isOnline;
    notifyListeners({ type: 'connectivity', online: _isOnline });

    if (_isOnline && wasOffline) {
      // Just came back online. A session kept from storage while offline (A-140) is refreshed
      // first (one request, foreground only), then the sync waits behind it in the auth lock.
      sessionNetworkBack();
      requestSync();
    }
  });
}

export function stopSyncEngine() {
  // The recovered hook goes with the engine: after the stop (the account-deletion teardown, a
  // sign-out) a late recovery never asks for a sync. During the deletion itself the pause above
  // already holds every pass (pauseSyncForDeletion, set before the delete POST); it is not cleared
  // here, only by a failed deletion or the next startSyncEngine.
  if (_unsubRecovered) {
    _unsubRecovered();
    _unsubRecovered = null;
  }
  if (_unsubNetInfo) {
    _unsubNetInfo();
    _unsubNetInfo = null;
  }
  if (_syncTimer) {
    clearTimeout(_syncTimer);
    _syncTimer = null;
  }
}

// ── Debounced sync trigger ──────────────────────────────────────
export function requestSync() {
  if (_deletionPaused) return;
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => doSync(), 1500);
}

// ── Main sync loop ──────────────────────────────────────────────
async function syncPass() {
  if (_deletionPaused || !_isOnline) return;
  notifyListeners({ type: 'sync_start' });
  try {
    // A-119 (lib/syncPassCore): the active-device check is the first server call of the pass; a phone
    // that is not the account's active one never pushes or pulls; a refusal ends the pass.
    const r = await runSyncPass({ ...passDevice(), push: pushPendingChanges, pull: pullCloudChanges });
    // DV-242 re-verification 3: a pass the owner check skipped is not a completed sync — it settles
    // as not done (sync_error, skipped), never sync_complete.
    if (r && (r.ownerSkipped || r.reason === 'owner_check')) {
      notifyListeners({ type: 'sync_error', error: 'owner_check', skipped: true });
      return;
    }
    notifyListeners(r && r.ran === false ? { type: 'sync_skipped', reason: r.reason || null } : { type: 'sync_complete', changed: (r && r.changed) || [], refused: !!(r && r.refused) });
  } catch (err) {
    console.warn('[Sync] Error:', err?.message || err);
    notifyListeners({ type: 'sync_error', error: err?.message });
  }
}
// One pass at a time (Gate B F2, lib/syncRunner).
const _runner = createSyncRunner(syncPass);
function doSync() { return _runner.run(); }

// Force a complete sync now: waits for a running pass, then runs a fresh one (the sign-out asks
// "is everything backed up?" only after it).
export async function forceSync() {
  if (_syncTimer) clearTimeout(_syncTimer);
  await _runner.forceSync();
}

// Resolves when no sync is running (the intended sign-out wipe waits for it).
// The intended sign-out wipe runs here so it never overlaps a pass or an import (R1).
export function runSyncExclusive(job) { return _runner.runExclusive(job); }

export function waitForSyncIdle() { return _runner.waitIdle(); }

// ── Cloud adapter over Supabase ─────────────────────────────────
// The narrow interface syncCore expects. Pagination lives here so the sync
// algorithm stays storage-agnostic (and testable against an in-memory fake).
const cloud = {
  // A-143: the client id a row's first insert sends as its cloud id (lib/syncCore insertWithClientId).
  newId() { return Crypto.randomUUID(); },
  // A-142: the reply lists the rows removed (RLS answers a delete it refuses with 0 rows, no error).
  async delete(table, remoteId) {
    return await supabase.from(table).delete().eq('id', remoteId).select('id');
  },
  // opts.ifUpdatedAt (calc_inputs, Gate B 1.3.1 item 4): only while the row still has the updated_at
  // the push read; otherwise 0 rows (retried).
  async update(table, remoteId, payload, opts = {}) {
    // A-87: a protocol's status comes back too, so an edit pushed over another phone's end takes it.
    if (table !== 'protocols') {
      let q = supabase.from(table).update(payload).eq('id', remoteId);
      if (opts.ifUpdatedAt) q = q.eq('updated_at', opts.ifUpdatedAt);
      return await q.select('id, updated_at');
    }
    // A-121 Gate B 1 / 2: the planned end and the "Still going?" answer come back too, so a phone that
    // pushed an unrelated edit takes another phone's end date and a later answer.
    let res = await supabase.from(table).update(payload).eq('id', remoteId).select('id, updated_at, active, deleted_at, ended_at, ends_on, still_going_at');
    // A cloud without a column of the reply (42703: the migration not applied yet): the same update,
    // with a shorter reply.
    if (res.error && String(res.error.code) === '42703') res = await supabase.from(table).update(payload).eq('id', remoteId).select('id, updated_at, active, deleted_at, ended_at');
    if (res.error && String(res.error.code) === '42703') return await supabase.from(table).update(payload).eq('id', remoteId).select('id, updated_at, active, deleted_at');
    return res;
  },
  async insert(table, payload) {
    // calc_inputs is one row per user (unique user_id). DV-010: the push merges into the account's
    // row (lib/calcInputsSync) and inserts only when it read none; a row that appeared meanwhile is
    // never replaced (DO NOTHING -> no row back -> retried, and the next pass merges into it).
    if (table === 'calc_inputs') {
      return await supabase.from(table).upsert(payload, { onConflict: 'user_id', ignoreDuplicates: true }).select('id, updated_at').single();
    }
    return await supabase.from(table).insert(payload).select('id, updated_at').single();
  },
  // DV-210: keyset paging on (updated_at, id) (lib/syncPager), never by offset — a row edited during
  // the pull, or rows sharing one updated_at, can no longer be skipped at a page boundary.
  async fetchSince(table, userId, since) {
    return fetchByUpdated(() => supabase.from(table).select('*').eq('user_id', userId), { since, pageSize: 500 });
  },
  // The signed-in user right now: a push that finds 0 rows only counts under the same user's
  // session (syncCore sameSession) — without one RLS also answers 0 rows.
  async sessionUserId() {
    try { const { data } = await supabase.auth.getSession(); return data?.session?.user?.id || null; } catch { return null; }
  },
  // The account's LIVE row ids (protocols: purged_at is null; unfiltered while the cloud lacks the
  // column, when no tombstone can exist yet), paged — read-only, used only to re-import what this
  // device lacks (syncCore selfHealProtocols), never to delete. sessionVerified: the same signed-in
  // user before and after, who also owns the local data (or none yet).
  async fetchIds(table, userId) {
    const sessionUid = () => cloud.sessionUserId();
    const beforeUid = await sessionUid();
    // DV-210: keyset paging on id (lib/syncPager).
    const list = (live) => fetchIdsKeyset(() => {
      let q = supabase.from(table).select('id').eq('user_id', userId);
      if (live) q = q.is('purged_at', null);
      return q;
    }, { pageSize: 1000 });
    let r = await list(table === 'protocols');
    if (r.error && table === 'protocols' && /purged_at/.test(String(r.error.message || ''))) r = await list(false);
    if (r.error) return { data: null, error: r.error };
    const ids = r.ids;
    const afterUid = await sessionUid();
    const owner = getLocalDataUserId();
    return {
      data: ids,
      error: null,
      sessionVerified: !!userId && beforeUid === userId && afterUid === userId && (owner == null || owner === userId),
    };
  },
  // Rows whose column is one of the values (the self-heal's re-import), this user's only; chunked
  // and paged.
  async fetchIn(table, column, values, userId) {
    const rows = [];
    const pageSize = 1000;
    for (let i = 0; i < values.length; i += 100) {
      const chunk = values.slice(i, i + 100);
      // DV-210: keyset paging on id (lib/syncPager).
      const { data: page, error } = await fetchById(() => supabase.from(table).select('*').eq('user_id', userId).in(column, chunk), { pageSize });
      if (error || !page) return { data: null, error: error || new Error('fetch failed') };
      rows.push(...page);
    }
    return { data: rows, error: null };
  },
  // DV-210: keyset paging on (updated_at, id), handed back in created_at order as before. It feeds
  // fullImport's absence-delete, so a skipped row would have deleted a live local row.
  async fetchAll(table, userId) {
    return fetchAllRows(() => supabase.from(table).select('*').eq('user_id', userId), { pageSize: 500 });
  },
};

// A-119: the adapter notes when the server refuses this device (DT001/DT002/DT003, lib/syncPassCore).
const trackedCloud = trackRefusals(cloud);

// The device side of one pass (lib/syncPassCore runSyncPass): the check, the refusal note, and the
// server stamp of this phone's last full backup when the pass leaves nothing unsent.
function passDevice() {
  const rt = () => require('./deviceRuntime');
  return {
    // DV-242 before A-119: a phone holding another account's local data never runs this account's
    // device check in a pass — the check can rebuild the copy from the cloud (Gate B M1), which would
    // put this account's rows next to the other account's unsent ones. The push / pull keep their own
    // owner check (fail closed); here an unreadable owner falls through to them.
    gate: async (ctx) => {
      let user = null;
      try { user = await getCachedUser(); } catch { user = null; }
      if (user && ownerBlocksThisSync(user)) return { go: false, reason: 'owner_check' };
      return rt().deviceGate(ctx);
    },
    refused: () => trackedCloud.takeRefused(),
    pendingCount: async () => {
      const user = await getCachedUser();
      if (!user) return null;
      return summarizeUnsent(getDB(), [getLocalDataUserId(), user.id]).count;
    },
    markSent: async () => {
      const user = await getCachedUser();
      if (user) await rt().deviceFlow().markSent(user.id);
    },
  };
}

// ── PUSH / PULL ─────────────────────────────────────────────────
// Thin wrappers: resolve the user, hand the real DB + cloud adapter to syncCore.
// DV-242: never under another account's local data — App's cross-account guard asks first (the
// pull would mix this account's rows into the previous account's unsent ones). Gate B 3: fails
// closed — an owner that cannot be read skips the step (the next pass retries).
function ownerBlocksThisSync(user) {
  try { return ownerBlocksSync(getLocalDataUserId(), user.id); } catch { return true; }
}

async function pushPendingChanges() {
  const user = await getCachedUser();
  if (!user) return;
  if (ownerBlocksThisSync(user)) return 'skipped';
  await pushPending(getDB(), trackedCloud, user.id);
}

// A-177: a dose_logs pull without error stamps its START time (lib/pullStamp) — rows that reached
// the cloud before it are here now. Awaited, so the stamp is stored before syncPass emits
// sync_complete (the Missed scan's gate opens on it and reads the stamp).
async function pullCloudChanges() {
  const user = await getCachedUser();
  if (!user) return;
  if (ownerBlocksThisSync(user)) return 'skipped';
  const startMs = Date.now();
  const res = await pullChanges(getDB(), trackedCloud, user.id); // { changed (DV-052), ok (A-177) }
  if (res && Array.isArray(res.ok) && res.ok.includes('dose_logs')) await recordDoseLogsPull(AsyncStorage, user.id, startMs);
  return res;
}

// A-119 OD-15 / DL-104: after a takeover this phone's copy is rebuilt from the account (lib/syncCore
// rebuildFromCloud: every table fetched first, then one transaction), never alongside a pass. Asked
// from inside a pass (its device check, inPass) it runs right there: waiting for the runner would
// wait for that same pass.
// Gate B: keep (what the person typed on this phone after its own sign-in) and, after a rebuild, the
// reminders are planned again (the local ids they pointed at are new).
export async function rebuildFromCloudNow(userId, { inPass = false, keep = null } = {}) {
  let res = { ok: false };
  const job = async () => {
    notifyListeners({ type: 'import_start' });
    // A-177: a rebuild that worked read every table in full (dose_logs included, no error), so it
    // stamps its start like a good pull; a failed one leaves the local data and the old stamp as they were.
    const startMs = Date.now();
    try {
      res = await rebuildFromCloud(getDB(), trackedCloud, userId, { keep });
    } catch (err) {
      res = { ok: false };
    }
    // A stamp that cannot be written only waits for the next good pull; the rebuild's notices go on.
    if (res.ok === true) { try { await recordDoseLogsPull(AsyncStorage, userId, startMs); } catch { /* next pull */ } }
    notifyListeners({ type: res.ok ? 'import_complete' : 'import_error' });
    if (res.ok) {
      notifyDataChanged('rebuild');
      try { require('./notifications').syncAllNotifications().catch(() => {}); } catch { /* next start */ }
    }
  };
  if (inPass) await job();
  else await _runner.runExclusive(job);
  return res;
}

// Pull reality_check_open and say whether it worked (S-03 migration gate).
export async function pullRealityCheckTable() {
  const user = await getCachedUser();
  if (!user || !_isOnline) return false;
  const { ok } = await pullTable(getDB(), trackedCloud, user.id, 'reality_check_open');
  return ok;
}

// ── FULL IMPORT (first login / empty local DB) ──────────────────
export async function fullImportFromCloud() {
  const user = await getCachedUser();
  if (!user) return;

  // Never alongside a sync pass, and the sign-out wipe waits for it (Gate B F2).
  await _runner.runExclusive(async () => {
    // A-177: the local data is replaced — the last pull's stamp goes first; the import sets it again.
    await forgetDoseLogsPull(AsyncStorage);
    notifyListeners({ type: 'import_start' });
    try {
      const startMs = Date.now();
      const res = await fullImport(getDB(), trackedCloud, user.id);
      if (res && Array.isArray(res.ok) && res.ok.includes('dose_logs')) await recordDoseLogsPull(AsyncStorage, user.id, startMs);
      notifyListeners({ type: 'import_complete' });
    } catch (err) {
      console.warn('[Sync] Full import error:', err?.message || err);
      notifyListeners({ type: 'import_error', error: err?.message });
    }
  });
}

// Check if local DB needs initial import
export function isLocalDBEmpty(userId) {
  return coreIsLocalDBEmpty(getDB(), userId);
}
