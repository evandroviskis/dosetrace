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
  // A-142: the reply lists the rows removed (RLS answers a delete it refuses with 0 rows, no error).
  async delete(table, remoteId) {
    return await supabase.from(table).delete().eq('id', remoteId).select('id');
  },
  async update(table, remoteId, payload) {
    // A-87: a protocol's status comes back too, so an edit pushed over another phone's end takes it.
    if (table !== 'protocols') return await supabase.from(table).update(payload).eq('id', remoteId).select('id, updated_at');
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
    // calc_inputs is one row per user (unique user_id): a second device's first
    // save merges into that row instead of failing forever (S-03).
    if (table === 'calc_inputs') {
      return await supabase.from(table).upsert(payload, { onConflict: 'user_id' }).select('id, updated_at').single();
    }
    return await supabase.from(table).insert(payload).select('id, updated_at').single();
  },
  async fetchSince(table, userId, since) {
    const pageSize = 500;
    let offset = 0;
    const rows = [];
    let error = null;
    while (true) {
      let query = supabase.from(table).select('*').eq('user_id', userId);
      if (since) query = query.gt('updated_at', since);
      const { data: page, error: pageError } = await query
        .order('updated_at', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (pageError || !page) { error = pageError; break; }
      rows.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    return { data: rows, error };
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
    const pageSize = 1000;
    const list = async (live) => {
      const ids = [];
      let offset = 0;
      while (true) {
        let q = supabase.from(table).select('id').eq('user_id', userId);
        if (live) q = q.is('purged_at', null);
        const { data: page, error } = await q.order('id', { ascending: true }).range(offset, offset + pageSize - 1);
        if (error || !page) return { ids: null, error: error || new Error('fetch failed') };
        ids.push(...page.map((r) => r.id));
        if (page.length < pageSize) break;
        offset += pageSize;
      }
      return { ids, error: null };
    };
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
      let offset = 0;
      while (true) {
        const { data: page, error } = await supabase.from(table).select('*').eq('user_id', userId).in(column, chunk)
          .order('id', { ascending: true }).range(offset, offset + pageSize - 1);
        if (error || !page) return { data: null, error: error || new Error('fetch failed') };
        rows.push(...page);
        if (page.length < pageSize) break;
        offset += pageSize;
      }
    }
    return { data: rows, error: null };
  },
  async fetchAll(table, userId) {
    const pageSize = 500;
    let offset = 0;
    const rows = [];
    let error = null;
    while (true) {
      const { data: page, error: pageError } = await supabase
        .from(table).select('*').eq('user_id', userId)
        .order('created_at', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (pageError || !page) { error = pageError || new Error('fetch failed'); break; }
      rows.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    return { data: rows, error };
  },
};

// A-119: the adapter notes when the server refuses this device (DT001/DT002/DT003, lib/syncPassCore).
const trackedCloud = trackRefusals(cloud);

// The device side of one pass (lib/syncPassCore runSyncPass): the check, the refusal note, and the
// server stamp of this phone's last full backup when the pass leaves nothing unsent.
function passDevice() {
  const rt = () => require('./deviceRuntime');
  return {
    gate: (ctx) => rt().deviceGate(ctx),
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
async function pushPendingChanges() {
  const user = await getCachedUser();
  if (!user) return;
  await pushPending(getDB(), trackedCloud, user.id);
}

async function pullCloudChanges() {
  const user = await getCachedUser();
  if (!user) return;
  return pullChanges(getDB(), trackedCloud, user.id); // { changed } (DV-052)
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
    try {
      res = await rebuildFromCloud(getDB(), trackedCloud, userId, { keep });
    } catch (err) {
      res = { ok: false };
    }
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
    notifyListeners({ type: 'import_start' });
    try {
      await fullImport(getDB(), trackedCloud, user.id);
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
