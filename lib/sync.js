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
import { supabase, getCachedUser } from './supabase';
import { getDB, getLocalDataUserId } from './database';
import {
  pushPending,
  pullChanges, pullTable,
  fullImport,
  isLocalDBEmpty as coreIsLocalDBEmpty,
} from './syncCore';
import { createSyncRunner } from './syncRunner';

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
export function startSyncEngine() {
  if (_unsubNetInfo) return; // already running

  _unsubNetInfo = NetInfo.addEventListener(state => {
    const wasOffline = !_isOnline;
    _isOnline = !!(state.isConnected && state.isInternetReachable !== false);
    _knownOnline = _isOnline;
    notifyListeners({ type: 'connectivity', online: _isOnline });

    if (_isOnline && wasOffline) {
      // Just came back online — sync immediately
      requestSync();
    }
  });
}

export function stopSyncEngine() {
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
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => doSync(), 1500);
}

// ── Main sync loop ──────────────────────────────────────────────
async function syncPass() {
  if (!_isOnline) return;
  notifyListeners({ type: 'sync_start' });
  try {
    await pushPendingChanges();
    await pullCloudChanges();
    notifyListeners({ type: 'sync_complete' });
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
  async delete(table, remoteId) {
    return await supabase.from(table).delete().eq('id', remoteId);
  },
  async update(table, remoteId, payload) {
    // A-87: a protocol's status comes back too, so an edit pushed over another phone's end takes it.
    return await supabase.from(table).update(payload).eq('id', remoteId).select(table === 'protocols' ? 'id, updated_at, active, deleted_at, ended_at' : 'id, updated_at');
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

// ── PUSH / PULL ─────────────────────────────────────────────────
// Thin wrappers: resolve the user, hand the real DB + cloud adapter to syncCore.
async function pushPendingChanges() {
  const user = await getCachedUser();
  if (!user) return;
  await pushPending(getDB(), cloud, user.id);
}

async function pullCloudChanges() {
  const user = await getCachedUser();
  if (!user) return;
  await pullChanges(getDB(), cloud, user.id);
}

// Pull reality_check_open and say whether it worked (S-03 migration gate).
export async function pullRealityCheckTable() {
  const user = await getCachedUser();
  if (!user || !_isOnline) return false;
  const { ok } = await pullTable(getDB(), cloud, user.id, 'reality_check_open');
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
      await fullImport(getDB(), cloud, user.id);
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
