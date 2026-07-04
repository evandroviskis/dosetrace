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
import {
  getPendingChanges,
  markSynced,
  hardDeleteSynced,
  deleteLocalRow,
  importFromCloud,
  getDB,
} from './database';
import { toCloudPayload } from './syncMappers';

// ── State ───────────────────────────────────────────────────────
let _isOnline = true;
let _syncInProgress = false;
let _syncTimer = null;
let _unsubNetInfo = null;
let _listeners = [];

// ── Public getters ──────────────────────────────────────────────
export function isOnline() { return _isOnline; }
export function isSyncing() { return _syncInProgress; }

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

// ── PUSH ────────────────────────────────────────────────────────
// Send all local pending/deleted rows to Supabase

const TABLES = ['protocols', 'vials', 'dose_logs', 'biomarkers'];

async function pushPendingChanges() {
  const user = await getCachedUser();
  if (!user) return;

  for (const table of TABLES) {
    const pending = getPendingChanges(table, user.id);

    for (const row of pending) {
      try {
        // Re-read from DB to get latest data (e.g. protocol_remote_id may have been updated)
        const freshRow = getDB().getFirstSync(`SELECT * FROM ${table} WHERE id = ?`, [row.id]);
        if (!freshRow) continue; // row was deleted between fetch and here

        if (freshRow.sync_status === 'deleted') {
          // Delete from cloud, then hard-delete locally
          if (freshRow.remote_id) {
            const { error } = await supabase.from(table).delete().eq('id', freshRow.remote_id);
            if (error) continue; // retry next sync
          }
          hardDeleteSynced(table, freshRow.id);
          continue;
        }

        // Skip if row is no longer pending (e.g. already synced by another cycle)
        if (freshRow.sync_status !== 'pending') continue;

        // For child tables (vials, dose_logs), skip if parent protocol hasn't synced yet
        if ((table === 'vials' || table === 'dose_logs') && !freshRow.protocol_remote_id) {
          continue; // will sync after parent protocol gets its remote_id
        }

        // Upsert to cloud
        const payload = toCloudPayload(table, freshRow);
        payload.user_id = user.id;

        if (freshRow.remote_id) {
          // Update existing cloud row — check affected rows so a vanished
          // cloud row doesn't get silently marked synced
          const { data: updated, error } = await supabase
            .from(table)
            .update(payload)
            .eq('id', freshRow.remote_id)
            .select('id, updated_at');
          if (!error) {
            if (updated && updated.length > 0) {
              markSynced(table, freshRow.id, freshRow.remote_id, freshRow.updated_at, updated[0].updated_at);
            } else {
              // Cloud row is gone — another device deleted it. Deletions win, so
              // honor the removal locally instead of resurrecting a new copy.
              deleteLocalRow(table, freshRow.id);
            }
          }
        } else {
          // Insert new cloud row
          const { data, error } = await supabase
            .from(table)
            .insert(payload)
            .select('id, updated_at')
            .single();
          if (!error && data) {
            markSynced(table, freshRow.id, data.id, freshRow.updated_at, data.updated_at);

            // For protocols, update child rows that reference this local ID
            if (table === 'protocols') {
              updateChildRemoteIds(freshRow.id, data.id);
            }
          }
        }
      } catch {
        // Skip this row, try next — will retry on next sync
      }
    }
  }
}

// After a protocol gets a remote_id, update vials & dose_logs that reference it
// (force = true re-points children after a protocol is re-created in the cloud)
function updateChildRemoteIds(localProtocolId, remoteProtocolId, force = false) {
  const db = getDB();
  const cond = force ? '' : ` AND (protocol_remote_id IS NULL OR protocol_remote_id = '')`;
  db.runSync(
    `UPDATE vials SET protocol_remote_id = ? WHERE protocol_id = ?${cond}`,
    [remoteProtocolId, localProtocolId]
  );
  db.runSync(
    `UPDATE dose_logs SET protocol_remote_id = ? WHERE protocol_id = ?${cond}`,
    [remoteProtocolId, localProtocolId]
  );
}

// ── PULL ────────────────────────────────────────────────────────
// Fetch any cloud rows newer than our last sync for multi-device support

async function pullCloudChanges() {
  const user = await getCachedUser();
  if (!user) return;
  const db = getDB();

  // Get latest updated_at per table to know what's new
  for (const table of TABLES) {
    try {
      // Find the most recent synced row's cloud timestamp (scoped to this user so
      // another account's rows can't contaminate the watermark).
      const lastRow = db.getFirstSync(
        `SELECT updated_at FROM ${table} WHERE sync_status = 'synced' AND user_id = ? ORDER BY updated_at DESC LIMIT 1`,
        [user.id]
      );

      // Fetch cloud rows in pages of 500 — if we have synced data, only get
      // ones updated in the cloud after our last sync
      const pageSize = 500;
      let offset = 0;
      const cloudRows = [];
      while (true) {
        let query = supabase.from(table).select('*').eq('user_id', user.id);
        if (lastRow?.updated_at) {
          query = query.gt('updated_at', lastRow.updated_at);
        }
        const { data: page, error } = await query
          .order('updated_at', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error || !page) break;
        cloudRows.push(...page);
        if (page.length < pageSize) break;
        offset += pageSize;
      }

      // Merge each cloud row — skip if local version is pending (local wins)
      for (const cloudRow of cloudRows) {
        const existing = db.getFirstSync(
          `SELECT id, sync_status FROM ${table} WHERE remote_id = ?`,
          [cloudRow.id]
        );

        if (existing) {
          // Local row exists — only update if it's synced (no local changes)
          if (existing.sync_status === 'synced') {
            updateLocalFromCloud(table, existing.id, cloudRow);
          }
          // If pending/deleted locally, local wins — skip cloud version
        } else {
          // New cloud row — import it
          importSingleRow(table, cloudRow, db);
        }
      }
    } catch {
      // Skip this table, try next
    }
  }
}

function updateLocalFromCloud(table, localId, cloudRow) {
  const db = getDB();
  const now = new Date().toISOString();
  // Store the cloud's own updated_at so the pull watermark stays on cloud time.
  const cloudStamp = cloudRow.updated_at || now;

  if (table === 'protocols') {
    db.runSync(
      `UPDATE protocols SET name = ?, type = ?, color = ?, amount = ?, unit = ?, water = ?, diluent = ?, dose = ?, dose_unit = ?, syringe_size = ?, concentration = ?, concentration_unit = ?, frequency = ?, reminder_time = ?, interval_days = ?, doses_per_day = ?, start_date = ?, schedule_total = ?, goal = ?, notes = ?, active = ?, deleted_at = ?, updated_at = ?, sync_status = 'synced' WHERE id = ?`,
      [
        cloudRow.name, cloudRow.type, cloudRow.color, cloudRow.amount, cloudRow.unit,
        cloudRow.water, cloudRow.diluent || null, cloudRow.dose, cloudRow.dose_unit, cloudRow.syringe_size,
        cloudRow.concentration, cloudRow.concentration_unit || 'mg', cloudRow.frequency, cloudRow.reminder_time,
        cloudRow.interval_days || 1, cloudRow.doses_per_day || 1,
        cloudRow.start_date, cloudRow.schedule_total, cloudRow.goal, cloudRow.notes,
        cloudRow.active ? 1 : 0, cloudRow.deleted_at, cloudStamp, localId,
      ]
    );
  } else if (table === 'vials') {
    const localP = db.getFirstSync(`SELECT id FROM protocols WHERE remote_id = ?`, [cloudRow.protocol_id]);
    db.runSync(
      `UPDATE vials SET protocol_id = ?, protocol_remote_id = ?, mixed_on = ?, water_ml = ?, total_doses = ?, doses_taken = ?, active = ?, updated_at = ?, sync_status = 'synced' WHERE id = ?`,
      [localP?.id || null, cloudRow.protocol_id, cloudRow.mixed_on, cloudRow.water_ml, cloudRow.total_doses, cloudRow.doses_taken, cloudRow.active ? 1 : 0, cloudStamp, localId]
    );
  } else if (table === 'dose_logs') {
    const localP = db.getFirstSync(`SELECT id FROM protocols WHERE remote_id = ?`, [cloudRow.protocol_id]);
    db.runSync(
      `UPDATE dose_logs SET protocol_id = ?, protocol_remote_id = ?, outcome = ?, injection_site = ?, logged_at = ?, updated_at = ?, sync_status = 'synced' WHERE id = ?`,
      [localP?.id || null, cloudRow.protocol_id, cloudRow.outcome, cloudRow.injection_site || null, cloudRow.logged_at, cloudStamp, localId]
    );
  } else if (table === 'biomarkers') {
    db.runSync(
      `UPDATE biomarkers SET report_date = ?, marker = ?, value = ?, unit = ?, updated_at = ?, sync_status = 'synced' WHERE id = ?`,
      [cloudRow.report_date, cloudRow.marker, cloudRow.value, cloudRow.unit, cloudStamp, localId]
    );
  }
}

function importSingleRow(table, cloudRow, db) {
  const now = new Date().toISOString();
  // Preserve the cloud's updated_at so the pull watermark stays on cloud time.
  const cloudStamp = cloudRow.updated_at || now;

  if (table === 'protocols') {
    db.runSync(
      `INSERT INTO protocols (remote_id, user_id, name, type, color, amount, unit, water, diluent, dose, dose_unit, syringe_size, concentration, concentration_unit, frequency, reminder_time, interval_days, doses_per_day, start_date, schedule_total, goal, notes, active, deleted_at, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [
        cloudRow.id, cloudRow.user_id, cloudRow.name, cloudRow.type, cloudRow.color,
        cloudRow.amount, cloudRow.unit, cloudRow.water, cloudRow.diluent || null, cloudRow.dose, cloudRow.dose_unit,
        cloudRow.syringe_size, cloudRow.concentration, cloudRow.concentration_unit || 'mg', cloudRow.frequency, cloudRow.reminder_time,
        cloudRow.interval_days || 1, cloudRow.doses_per_day || 1,
        cloudRow.start_date, cloudRow.schedule_total, cloudRow.goal, cloudRow.notes,
        cloudRow.active ? 1 : 0, cloudRow.deleted_at, cloudRow.created_at, cloudStamp,
      ]
    );
  } else if (table === 'vials') {
    const localP = db.getFirstSync(`SELECT id FROM protocols WHERE remote_id = ?`, [cloudRow.protocol_id]);
    db.runSync(
      `INSERT INTO vials (remote_id, user_id, protocol_id, protocol_remote_id, mixed_on, water_ml, total_doses, doses_taken, active, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [cloudRow.id, cloudRow.user_id, localP?.id || null, cloudRow.protocol_id, cloudRow.mixed_on, cloudRow.water_ml, cloudRow.total_doses, cloudRow.doses_taken, cloudRow.active ? 1 : 0, cloudRow.created_at, cloudStamp]
    );
  } else if (table === 'dose_logs') {
    const localP = db.getFirstSync(`SELECT id FROM protocols WHERE remote_id = ?`, [cloudRow.protocol_id]);
    db.runSync(
      `INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, injection_site, logged_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [cloudRow.id, cloudRow.user_id, localP?.id || null, cloudRow.protocol_id, cloudRow.outcome, cloudRow.injection_site || null, cloudRow.logged_at, cloudStamp]
    );
  } else if (table === 'biomarkers') {
    db.runSync(
      `INSERT INTO biomarkers (remote_id, user_id, report_date, marker, value, unit, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [cloudRow.id, cloudRow.user_id, cloudRow.report_date, cloudRow.marker, cloudRow.value, cloudRow.unit, cloudRow.created_at, cloudStamp]
    );
  }
}

// ── FULL IMPORT (first login / empty local DB) ──────────────────
export async function fullImportFromCloud() {
  const user = await getCachedUser();
  if (!user) return;

  _syncInProgress = true;
  notifyListeners({ type: 'import_start' });

  try {
    const db = getDB();
    // Import in dependency order: protocols first, then vials/logs, then biomarkers
    for (const table of TABLES) {
      // Fetch all cloud rows in pages of 500 so large accounts import completely
      const pageSize = 500;
      let offset = 0;
      let fetchFailed = false;
      const data = [];
      while (true) {
        const { data: page, error } = await supabase
          .from(table)
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error || !page) { fetchFailed = true; break; }
        data.push(...page);
        if (page.length < pageSize) break;
        offset += pageSize;
      }

      if (data.length > 0) {
        importFromCloud(table, data);
      }

      // Propagate cloud deletes: drop local synced rows whose cloud copy is
      // gone. Pending/deleted rows are untouched — unsynced work must survive.
      // Skipped if the fetch failed, so a partial page never causes deletes.
      if (!fetchFailed) {
        const cloudIds = new Set(data.map(r => r.id));
        const localSynced = db.getAllSync(
          `SELECT id, remote_id FROM ${table} WHERE user_id = ? AND sync_status = 'synced' AND remote_id IS NOT NULL`,
          [user.id]
        );
        for (const localRow of localSynced) {
          if (!cloudIds.has(localRow.remote_id)) {
            db.runSync(`DELETE FROM ${table} WHERE id = ? AND sync_status = 'synced'`, [localRow.id]);
          }
        }
      }
    }
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
  const db = getDB();
  const row = db.getFirstSync(`SELECT COUNT(*) as cnt FROM protocols WHERE user_id = ?`, [userId]);
  return (row?.cnt || 0) === 0;
}
