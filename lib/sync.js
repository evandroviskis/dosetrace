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
import { getDB } from './database';
import {
  pushPending,
  pullChanges,
  fullImport,
  isLocalDBEmpty as coreIsLocalDBEmpty,
} from './syncCore';

// ── State ───────────────────────────────────────────────────────
let _isOnline = true;
let _syncInProgress = false;
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

// ── Start / Stop ────────────────────────────────────────────────
export function startSyncEngine() {
  if (_unsubNetInfo) return; // already running

  _unsubNetInfo = NetInfo.addEventListener(state => {
    const wasOffline = !_isOnline;
    _isOnline = !!(state.isConnected && state.isInternetReachable !== false);
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
async function doSync() {
  if (_syncInProgress || !_isOnline) return;
  _syncInProgress = true;
  notifyListeners({ type: 'sync_start' });

  try {
    await pushPendingChanges();
    await pullCloudChanges();
    notifyListeners({ type: 'sync_complete' });
  } catch (err) {
    console.warn('[Sync] Error:', err?.message || err);
    notifyListeners({ type: 'sync_error', error: err?.message });
  } finally {
    _syncInProgress = false;
  }
}

// Force immediate sync (for manual "Sync now" button)
export async function forceSync() {
  if (_syncTimer) clearTimeout(_syncTimer);
  await doSync();
}

// ── Cloud adapter over Supabase ─────────────────────────────────
// The narrow interface syncCore expects. Pagination lives here so the sync
// algorithm stays storage-agnostic (and testable against an in-memory fake).
const cloud = {
  async delete(table, remoteId) {
    return await supabase.from(table).delete().eq('id', remoteId);
  },
  async update(table, remoteId, payload) {
    return await supabase.from(table).update(payload).eq('id', remoteId).select('id, updated_at');
  },
  async insert(table, payload) {
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

// ── FULL IMPORT (first login / empty local DB) ──────────────────
export async function fullImportFromCloud() {
  const user = await getCachedUser();
  if (!user) return;

  _syncInProgress = true;
  notifyListeners({ type: 'import_start' });
  try {
    await fullImport(getDB(), cloud, user.id);
    notifyListeners({ type: 'import_complete' });
  } catch (err) {
    console.warn('[Sync] Full import error:', err?.message || err);
    notifyListeners({ type: 'import_error', error: err?.message });
  } finally {
    _syncInProgress = false;
  }
}

// Check if local DB needs initial import
export function isLocalDBEmpty(userId) {
  return coreIsLocalDBEmpty(getDB(), userId);
}
