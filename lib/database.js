/**
 * DoseTrace Local Database (SQLite)
 *
 * This is the app's source of truth. All reads/writes go here first.
 * The sync engine (sync.js) handles pushing changes to Supabase.
 *
 * Every mutable row has:
 *   - sync_status: 'synced' | 'pending' | 'deleted'
 *   - updated_at: ISO timestamp of last local modification
 *   - remote_id: UUID from Supabase (null until first sync)
 */

import * as SQLite from 'expo-sqlite';
import { createSchema } from './schema';

let _db = null;

export function getDB() {
  if (!_db) {
    _db = SQLite.openDatabaseSync('dosetrace.db');
  }
  return _db;
}

// ── Schema setup ─────────────────────────────────────────────────
export function initDatabase() {
  const db = getDB();

  db.execSync(`PRAGMA journal_mode = WAL;`);
  db.execSync(`PRAGMA foreign_keys = ON;`);

  // Canonical tables + indexes (shared with the test harness via lib/schema.js).
  createSchema(db);

  // Migrations for pre-existing installs — no-ops on a fresh DB, which already
  // has these columns from createSchema.
  try { db.execSync(`ALTER TABLE protocols ADD COLUMN concentration_unit TEXT DEFAULT 'mg';`); } catch (e) { /* column already exists */ }
  try { db.execSync(`ALTER TABLE protocols ADD COLUMN diluent TEXT;`); } catch (e) { /* column already exists */ }
  try { db.execSync(`ALTER TABLE dose_logs ADD COLUMN injection_site TEXT;`); } catch (e) { /* column already exists */ }
  try { db.execSync(`ALTER TABLE protocols ADD COLUMN compound_id TEXT;`); } catch (e) { /* column already exists */ }
  try { db.execSync(`ALTER TABLE protocols ADD COLUMN vial_valid_days INTEGER;`); } catch (e) { /* column already exists */ }
}

// ── PROTOCOLS ────────────────────────────────────────────────────

export function getActiveProtocols(userId) {
  const db = getDB();
  return db.getAllSync(
    `SELECT * FROM protocols WHERE user_id = ? AND active = 1 AND sync_status != 'deleted' ORDER BY created_at DESC`,
    [userId]
  );
}

export function getProtocolById(id) {
  const db = getDB();
  return db.getFirstSync(`SELECT * FROM protocols WHERE id = ?`, [id]);
}

export function getDeletedProtocols(userId) {
  const db = getDB();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return db.getAllSync(
    `SELECT * FROM protocols WHERE user_id = ? AND active = 0 AND deleted_at IS NOT NULL AND datetime(deleted_at) >= datetime(?) AND sync_status != 'deleted' ORDER BY deleted_at DESC`,
    [userId, sevenDaysAgo.toISOString()]
  );
}

export function insertProtocol(data) {
  const db = getDB();
  const now = new Date().toISOString();
  const result = db.runSync(
    `INSERT INTO protocols (remote_id, user_id, name, compound_id, type, color, amount, unit, water, diluent, dose, dose_unit, syringe_size, concentration, concentration_unit, frequency, reminder_time, interval_days, doses_per_day, start_date, schedule_total, vial_valid_days, goal, notes, active, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'pending')`,
    [
      data.remote_id || null, data.user_id, data.name, data.compound_id || null, data.type || 'recon',
      data.color || '#185FA5', data.amount || null, data.unit || null,
      data.water || null, data.diluent || null, data.dose || null, data.dose_unit || null,
      data.syringe_size || null, data.concentration || null, data.concentration_unit || 'mg',
      data.frequency || null, data.reminder_time || null,
      data.interval_days || 1, data.doses_per_day || 1,
      data.start_date || null, data.schedule_total || null, data.vial_valid_days || null,
      data.goal || null, data.notes || null,
      data.created_at || now, now,
    ]
  );
  return result.lastInsertRowId;
}

export function updateProtocol(id, data) {
  const db = getDB();
  const now = new Date().toISOString();
  // Strip internal fields — these are managed by the database layer, not callers
  const safe = Object.fromEntries(
    Object.entries(data).filter(([k]) => !['id', 'sync_status', 'updated_at', 'remote_id'].includes(k))
  );
  if (Object.keys(safe).length === 0) return;
  const fields = Object.keys(safe).map(k => `${k} = ?`).join(', ');
  const values = Object.values(safe);
  db.runSync(
    `UPDATE protocols SET ${fields}, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
    [...values, now, id]
  );
}

export function softDeleteProtocol(id) {
  const db = getDB();
  const now = new Date().toISOString();
  db.runSync(
    `UPDATE protocols SET active = 0, deleted_at = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
    [now, now, id]
  );
}

export function restoreProtocol(id) {
  const db = getDB();
  const now = new Date().toISOString();
  db.runSync(
    `UPDATE protocols SET active = 1, deleted_at = NULL, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
    [now, id]
  );
}

export function hardDeleteOldProtocols(userId) {
  const db = getDB();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  // Get IDs to also delete vials
  const old = db.getAllSync(
    `SELECT id FROM protocols WHERE user_id = ? AND active = 0 AND deleted_at IS NOT NULL AND datetime(deleted_at) < datetime(?)`,
    [userId, sevenDaysAgo.toISOString()]
  );
  if (old.length > 0) {
    const now = new Date().toISOString();
    const ids = old.map(p => p.id);
    const placeholders = ids.map(() => '?').join(',');
    db.runSync(`UPDATE vials SET sync_status = 'deleted', updated_at = ? WHERE protocol_id IN (${placeholders})`, [now, ...ids]);
    db.runSync(`UPDATE protocols SET sync_status = 'deleted', updated_at = ? WHERE id IN (${placeholders})`, [now, ...ids]);
  }
}

// ── VIALS ────────────────────────────────────────────────────────

export function getActiveVials(userId) {
  const db = getDB();
  return db.getAllSync(
    `SELECT * FROM vials WHERE user_id = ? AND active = 1 AND sync_status != 'deleted' ORDER BY created_at DESC`,
    [userId]
  );
}

export function insertVial(data) {
  const db = getDB();
  const now = new Date().toISOString();
  const result = db.runSync(
    `INSERT INTO vials (remote_id, user_id, protocol_id, protocol_remote_id, mixed_on, water_ml, total_doses, doses_taken, active, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'pending')`,
    [
      data.remote_id || null, data.user_id, data.protocol_id,
      data.protocol_remote_id || null, data.mixed_on || null,
      data.water_ml || null, data.total_doses || 0, data.doses_taken || 0,
      data.created_at || now, now,
    ]
  );
  return result.lastInsertRowId;
}

export function updateVial(id, data) {
  const db = getDB();
  const now = new Date().toISOString();
  // Strip internal fields — these are managed by the database layer, not callers
  const safe = Object.fromEntries(
    Object.entries(data).filter(([k]) => !['id', 'sync_status', 'updated_at', 'remote_id'].includes(k))
  );
  if (Object.keys(safe).length === 0) return;
  const fields = Object.keys(safe).map(k => `${k} = ?`).join(', ');
  const values = Object.values(safe);
  db.runSync(
    `UPDATE vials SET ${fields}, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
    [...values, now, id]
  );
}

export function deactivateVialsByProtocol(protocolId) {
  const db = getDB();
  const now = new Date().toISOString();
  db.runSync(
    `UPDATE vials SET active = 0, updated_at = ?, sync_status = 'pending' WHERE protocol_id = ? AND active = 1`,
    [now, protocolId]
  );
}

export function getNewestVialForProtocol(protocolId) {
  const db = getDB();
  return db.getFirstSync(
    `SELECT id FROM vials WHERE protocol_id = ? ORDER BY created_at DESC LIMIT 1`,
    [protocolId]
  );
}

// ── DOSE LOGS ────────────────────────────────────────────────────

export function getTodayLogs(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const db = getDB();
  return db.getAllSync(
    `SELECT * FROM dose_logs WHERE user_id = ? AND datetime(logged_at) >= datetime(?) AND sync_status != 'deleted' ORDER BY logged_at DESC`,
    [userId, today.toISOString()]
  );
}

export function getLogsSince(userId, sinceDate) {
  const db = getDB();
  return db.getAllSync(
    `SELECT * FROM dose_logs WHERE user_id = ? AND datetime(logged_at) >= datetime(?) AND sync_status != 'deleted' ORDER BY logged_at DESC`,
    [userId, sinceDate]
  );
}

export function getTakenLogsSince(userId, sinceDate) {
  const db = getDB();
  return db.getAllSync(
    `SELECT protocol_id, logged_at, outcome FROM dose_logs WHERE user_id = ? AND outcome = 'Taken' AND datetime(logged_at) >= datetime(?) AND sync_status != 'deleted'`,
    [userId, sinceDate]
  );
}

export function getAllLogs(userId) {
  const db = getDB();
  return db.getAllSync(
    `SELECT dl.*, p.name as protocol_name, p.color as protocol_color, p.type as protocol_type FROM dose_logs dl LEFT JOIN protocols p ON dl.protocol_id = p.id WHERE dl.user_id = ? AND dl.sync_status != 'deleted' AND (p.id IS NULL OR (p.active = 1 AND p.sync_status != 'deleted')) ORDER BY dl.logged_at DESC`,
    [userId]
  );
}

export function insertDoseLog(data) {
  const db = getDB();
  const now = new Date().toISOString();
  const result = db.runSync(
    `INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, injection_site, logged_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      data.remote_id || null, data.user_id, data.protocol_id,
      data.protocol_remote_id || null, data.outcome || 'Taken',
      data.injection_site || null,
      data.logged_at || now, now,
    ]
  );
  return result.lastInsertRowId;
}

export function updateDoseLog(id, data) {
  const db = getDB();
  const now = new Date().toISOString();
  // Strip internal fields — these are managed by the database layer, not callers
  const safe = Object.fromEntries(
    Object.entries(data).filter(([k]) => !['id', 'sync_status', 'updated_at', 'remote_id'].includes(k))
  );
  if (Object.keys(safe).length === 0) return;
  const fields = Object.keys(safe).map(k => `${k} = ?`).join(', ');
  const values = Object.values(safe);
  db.runSync(
    `UPDATE dose_logs SET ${fields}, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
    [...values, now, id]
  );
}

export function deleteDoseLog(id) {
  const db = getDB();
  const now = new Date().toISOString();
  db.runSync(
    `UPDATE dose_logs SET sync_status = 'deleted', updated_at = ? WHERE id = ?`,
    [now, id]
  );
}

// ── BIOMARKERS ───────────────────────────────────────────────────

export function getBiomarkers(userId) {
  const db = getDB();
  return db.getAllSync(
    `SELECT * FROM biomarkers WHERE user_id = ? AND sync_status != 'deleted' ORDER BY report_date DESC, marker ASC`,
    [userId]
  );
}

export function insertBiomarkers(rows) {
  const db = getDB();
  const now = new Date().toISOString();
  for (const r of rows) {
    db.runSync(
      `INSERT INTO biomarkers (remote_id, user_id, report_date, marker, value, unit, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [r.remote_id || null, r.user_id, r.report_date, r.marker, r.value, r.unit || null, now, now]
    );
  }
}

// ── SYNC HELPERS ─────────────────────────────────────────────────
// The push/pull/merge helpers (getPendingChanges, markSynced, hardDeleteSynced,
// deleteLocalRow, importFromCloud, …) now live in lib/syncCore.js, which takes
// the db handle as a parameter so it can be unit-tested under plain Node. The
// sync engine (lib/sync.js) wires getDB() into those functions.

// ── CLEAR ALL LOCAL DATA ────────────────────────────────────────

export function clearLocalDatabase() {
  const db = getDB();
  db.execSync(`DELETE FROM dose_logs;`);
  db.execSync(`DELETE FROM vials;`);
  db.execSync(`DELETE FROM biomarkers;`);
  db.execSync(`DELETE FROM protocols;`);
}

// ── DATA EXPORT ──────────────────────────────────────────────────

export function getAllDataForExport(userId) {
  const db = getDB();
  return {
    protocols: db.getAllSync(`SELECT * FROM protocols WHERE user_id = ? AND sync_status != 'deleted'`, [userId]),
    dose_logs: db.getAllSync(`SELECT * FROM dose_logs WHERE user_id = ? AND sync_status != 'deleted'`, [userId]),
    biomarkers: db.getAllSync(`SELECT * FROM biomarkers WHERE user_id = ? AND sync_status != 'deleted'`, [userId]),
    vials: db.getAllSync(`SELECT * FROM vials WHERE user_id = ? AND sync_status != 'deleted'`, [userId]),
  };
}
