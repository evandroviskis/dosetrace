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

  db.execSync(`
    CREATE TABLE IF NOT EXISTS protocols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id TEXT,
      user_id TEXT,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'recon',
      color TEXT DEFAULT '#185FA5',
      amount TEXT,
      unit TEXT,
      water TEXT,
      dose TEXT,
      dose_unit TEXT,
      syringe_size REAL,
      concentration TEXT,
      frequency TEXT,
      reminder_time TEXT,
      interval_days INTEGER DEFAULT 1,
      doses_per_day INTEGER DEFAULT 1,
      start_date TEXT,
      schedule_total INTEGER,
      goal TEXT,
      notes TEXT,
      active INTEGER DEFAULT 1,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending'
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS vials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id TEXT,
      user_id TEXT,
      protocol_id INTEGER,
      protocol_remote_id TEXT,
      mixed_on TEXT,
      water_ml REAL,
      total_doses INTEGER,
      doses_taken INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending'
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS dose_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id TEXT,
      user_id TEXT,
      protocol_id INTEGER,
      protocol_remote_id TEXT,
      outcome TEXT DEFAULT 'Taken',
      logged_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending'
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS biomarkers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id TEXT,
      user_id TEXT,
      report_date TEXT,
      marker TEXT,
      value REAL,
      unit TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending'
    );
  `);

  // Indexes for performance
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_protocols_active ON protocols(active, user_id);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_vials_protocol ON vials(protocol_id, active);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_dose_logs_date ON dose_logs(logged_at, protocol_id);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_sync_pending ON protocols(sync_status) WHERE sync_status = 'pending';`);
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

export function getProtocolByRemoteId(remoteId) {
  const db = getDB();
  return db.getFirstSync(`SELECT * FROM protocols WHERE remote_id = ?`, [remoteId]);
}

export function getDeletedProtocols(userId) {
  const db = getDB();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return db.getAllSync(
    `SELECT * FROM protocols WHERE user_id = ? AND active = 0 AND deleted_at IS NOT NULL AND deleted_at >= ? AND sync_status != 'deleted' ORDER BY deleted_at DESC`,
    [userId, sevenDaysAgo.toISOString()]
  );
}

export function insertProtocol(data) {
  const db = getDB();
  const now = new Date().toISOString();
  const result = db.runSync(
    `INSERT INTO protocols (remote_id, user_id, name, type, color, amount, unit, water, dose, dose_unit, syringe_size, concentration, frequency, reminder_time, interval_days, doses_per_day, start_date, schedule_total, goal, notes, active, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'pending')`,
    [
      data.remote_id || null, data.user_id, data.name, data.type || 'recon',
      data.color || '#185FA5', data.amount || null, data.unit || null,
      data.water || null, data.dose || null, data.dose_unit || null,
      data.syringe_size || null, data.concentration || null,
      data.frequency || null, data.reminder_time || null,
      data.interval_days || 1, data.doses_per_day || 1,
      data.start_date || null, data.schedule_total || null,
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
    `SELECT id FROM protocols WHERE user_id = ? AND active = 0 AND deleted_at IS NOT NULL AND deleted_at < ?`,
    [userId, sevenDaysAgo.toISOString()]
  );
  if (old.length > 0) {
    const ids = old.map(p => p.id);
    const placeholders = ids.map(() => '?').join(',');
    db.runSync(`UPDATE vials SET sync_status = 'deleted', updated_at = datetime('now') WHERE protocol_id IN (${placeholders})`, ids);
    db.runSync(`UPDATE protocols SET sync_status = 'deleted', updated_at = datetime('now') WHERE id IN (${placeholders})`, ids);
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

export function getActiveVialForProtocol(protocolId) {
  const db = getDB();
  return db.getFirstSync(
    `SELECT * FROM vials WHERE protocol_id = ? AND active = 1 AND sync_status != 'deleted' ORDER BY created_at DESC LIMIT 1`,
    [protocolId]
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
    `SELECT * FROM dose_logs WHERE user_id = ? AND logged_at >= ? AND sync_status != 'deleted' ORDER BY logged_at DESC`,
    [userId, today.toISOString()]
  );
}

export function getLogsSince(userId, sinceDate) {
  const db = getDB();
  return db.getAllSync(
    `SELECT * FROM dose_logs WHERE user_id = ? AND logged_at >= ? AND sync_status != 'deleted' ORDER BY logged_at DESC`,
    [userId, sinceDate]
  );
}

export function getTakenLogsSince(userId, sinceDate) {
  const db = getDB();
  return db.getAllSync(
    `SELECT protocol_id, logged_at, outcome FROM dose_logs WHERE user_id = ? AND outcome = 'Taken' AND logged_at >= ? AND sync_status != 'deleted'`,
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
    `INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      data.remote_id || null, data.user_id, data.protocol_id,
      data.protocol_remote_id || null, data.outcome || 'Taken',
      data.logged_at || now, now,
    ]
  );
  return result.lastInsertRowId;
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

export function getPendingChanges(table) {
  const db = getDB();
  return db.getAllSync(
    `SELECT * FROM ${table} WHERE sync_status = 'pending' OR sync_status = 'deleted'`
  );
}

export function markSynced(table, id, remoteId) {
  const db = getDB();
  if (remoteId) {
    db.runSync(`UPDATE ${table} SET sync_status = 'synced', remote_id = ? WHERE id = ?`, [remoteId, id]);
  } else {
    db.runSync(`UPDATE ${table} SET sync_status = 'synced' WHERE id = ?`, [id]);
  }
}

export function hardDeleteSynced(table, id) {
  const db = getDB();
  db.runSync(`DELETE FROM ${table} WHERE id = ? AND sync_status = 'deleted'`, [id]);
}

// ── FULL IMPORT (first sync / login) ─────────────────────────────

export function importFromCloud(table, rows) {
  const db = getDB();
  const now = new Date().toISOString();

  for (const row of rows) {
    // Check if we already have this remote_id
    const existing = db.getFirstSync(`SELECT id FROM ${table} WHERE remote_id = ?`, [row.id]);
    if (existing) continue; // skip duplicates

    if (table === 'protocols') {
      db.runSync(
        `INSERT INTO protocols (remote_id, user_id, name, type, color, amount, unit, water, dose, dose_unit, syringe_size, concentration, frequency, reminder_time, interval_days, doses_per_day, start_date, schedule_total, goal, notes, active, deleted_at, created_at, updated_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
        [
          row.id, row.user_id, row.name, row.type, row.color,
          row.amount, row.unit, row.water, row.dose, row.dose_unit,
          row.syringe_size, row.concentration, row.frequency, row.reminder_time,
          row.interval_days || 1, row.doses_per_day || 1,
          row.start_date, row.schedule_total, row.goal, row.notes,
          row.active ? 1 : 0, row.deleted_at, row.created_at, now,
        ]
      );
    } else if (table === 'vials') {
      // Find local protocol_id from remote
      const localP = db.getFirstSync(`SELECT id FROM protocols WHERE remote_id = ?`, [row.protocol_id]);
      db.runSync(
        `INSERT INTO vials (remote_id, user_id, protocol_id, protocol_remote_id, mixed_on, water_ml, total_doses, doses_taken, active, created_at, updated_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
        [
          row.id, row.user_id, localP?.id || null, row.protocol_id,
          row.mixed_on, row.water_ml, row.total_doses, row.doses_taken,
          row.active ? 1 : 0, row.created_at, now,
        ]
      );
    } else if (table === 'dose_logs') {
      const localP = db.getFirstSync(`SELECT id FROM protocols WHERE remote_id = ?`, [row.protocol_id]);
      db.runSync(
        `INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')`,
        [row.id, row.user_id, localP?.id || null, row.protocol_id, row.outcome, row.logged_at, now]
      );
    } else if (table === 'biomarkers') {
      db.runSync(
        `INSERT INTO biomarkers (remote_id, user_id, report_date, marker, value, unit, created_at, updated_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
        [row.id, row.user_id, row.report_date, row.marker, row.value, row.unit, row.created_at, now]
      );
    }
  }
}

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
