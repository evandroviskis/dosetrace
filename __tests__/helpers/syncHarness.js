'use strict';
// Test harness for the sync engine: a real in-memory SQLite (better-sqlite3)
// wrapped to look like an expo-sqlite handle, plus an in-memory fake cloud that
// implements the same interface lib/sync.js's Supabase adapter does. This lets
// __tests__/sync.test.js drive the REAL lib/syncCore.js push/pull/merge logic.

const Database = require('better-sqlite3');
const { createSchema } = require('../../lib/schema');

// ── expo-sqlite-shaped adapter over better-sqlite3 ───────────────
function makeDb() {
  const raw = new Database(':memory:');
  // better-sqlite3 rejects undefined/boolean binds; expo-sqlite tolerates them.
  const clean = (params) => (params || []).map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
  const db = {
    _raw: raw,
    execSync(sql) { raw.exec(sql); },
    runSync(sql, params) {
      const info = raw.prepare(sql).run(...clean(params));
      return { lastInsertRowId: Number(info.lastInsertRowid), changes: info.changes };
    },
    getFirstSync(sql, params) {
      return raw.prepare(sql).get(...clean(params)) ?? null;
    },
    getAllSync(sql, params) {
      return raw.prepare(sql).all(...clean(params));
    },
  };
  createSchema(db);
  return db;
}

// ── In-memory fake cloud (same interface as the Supabase adapter) ─
function makeCloud() {
  const store = { protocols: new Map(), vials: new Map(), dose_logs: new Map(), biomarkers: new Map() };
  let clock = 0;
  // Monotonic, string-sortable cloud timestamps (so `updated_at > since` works).
  const stamp = () => String(++clock).padStart(6, '0');
  let idSeq = 0;
  const newId = () => `cloud-${++idSeq}`;

  return {
    _store: store,
    _stamp: stamp,
    rows(table, userId) {
      return [...store[table].values()].filter((r) => !userId || r.user_id === userId);
    },
    async delete(table, remoteId) { store[table].delete(remoteId); return { error: null }; },
    async update(table, remoteId, payload) {
      const existing = store[table].get(remoteId);
      if (!existing) return { data: [], error: null }; // gone → 0 rows affected
      const updated_at = stamp();
      store[table].set(remoteId, { ...existing, ...payload, id: remoteId, updated_at });
      return { data: [{ id: remoteId, updated_at }], error: null };
    },
    async insert(table, payload) {
      const id = newId();
      const updated_at = stamp();
      store[table].set(id, { ...payload, id, created_at: payload.created_at || updated_at, updated_at });
      return { data: { id, updated_at }, error: null };
    },
    async fetchSince(table, userId, since) {
      const rows = this.rows(table, userId)
        .filter((r) => !since || r.updated_at > since)
        .sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));
      return { data: rows, error: null };
    },
    async fetchAll(table, userId) {
      const rows = this.rows(table, userId)
        .sort((a, b) => ((a.created_at || '') < (b.created_at || '') ? -1 : 1));
      return { data: rows, error: null };
    },
  };
}

// ── Local-row seeders ────────────────────────────────────────────
let seedClock = 0;

// A locally-created protocol that hasn't synced yet (sync_status='pending').
function seedLocalProtocol(db, userId, over = {}) {
  const stamp = over.updated_at || `L${++seedClock}`;
  const info = db.runSync(
    `INSERT INTO protocols (user_id, name, type, color, amount, unit, water, diluent, dose, dose_unit, interval_days, doses_per_day, active, created_at, updated_at, sync_status)
     VALUES (?, ?, 'recon', '#185FA5', ?, 'mg', ?, ?, ?, 'mcg', 1, 1, 1, ?, ?, 'pending')`,
    [userId, over.name || 'BPC-157', over.amount || '10', over.water || '2', over.diluent || null, over.dose || '250', stamp, stamp]
  );
  return info.lastInsertRowId;
}

// A protocol already in synced state (as if previously pulled/pushed).
function seedSyncedProtocol(db, userId, { remote_id, updated_at, name = 'X' }) {
  const info = db.runSync(
    `INSERT INTO protocols (remote_id, user_id, name, type, color, dose, dose_unit, interval_days, doses_per_day, active, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, 'recon', '#185FA5', '100', 'mcg', 1, 1, 1, ?, ?, 'synced')`,
    [remote_id, userId, name, updated_at, updated_at]
  );
  return info.lastInsertRowId;
}

// Mark a synced local protocol as edited-but-unpushed again.
function editLocalProtocol(db, id, over = {}) {
  const stamp = over.updated_at || `L${++seedClock}`;
  db.runSync(`UPDATE protocols SET name = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
    [over.name || 'edited', stamp, id]);
}

function getProtocol(db, id) {
  return db.getFirstSync(`SELECT * FROM protocols WHERE id = ?`, [id]);
}
function watermark(db, table, userId) {
  const row = db.getFirstSync(
    `SELECT updated_at FROM ${table} WHERE sync_status = 'synced' AND user_id = ? ORDER BY updated_at DESC LIMIT 1`,
    [userId]);
  return row?.updated_at || null;
}

module.exports = {
  makeDb, makeCloud,
  seedLocalProtocol, seedSyncedProtocol, editLocalProtocol,
  getProtocol, watermark,
};
