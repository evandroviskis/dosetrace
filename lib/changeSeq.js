'use strict';
// A-119 Gate B round 2 (finding 1): a local change sequence. Every change the PERSON makes to a synced
// row on this phone — any insert or update that leaves the row unsent ('pending' or 'deleted'), the
// Delete forever included (lib/protocolEnd purgeProtocol leaves updated_at alone) — gets the next
// number of one counter in local_meta, by SQLite triggers, so no writer can forget it and no phone
// clock (set back or ahead) changes it. The takeover records the counter at its start; the rebuild
// keeps the unsent rows numbered after it (lib/syncCore rebuildFromCloud, lib/unsentSummary
// keptByRebuild).
//
// Round 3 (finding 1): the sync engine's own writes never number a row — not a pull merging into a
// pending edit, not markSynced's remote_id, not an import, not the single-open-check stop. Otherwise
// an OLD unsent row became "kept" just because the engine touched it after the keep point. The engine
// marks its writes with one row in dt_engine_write (engineDb / asEngine below: lib/syncCore wraps
// every engine entry point); the triggers' WHEN skips a write while that row exists. The mark is set
// and removed synchronously around each write (never across an await, so a change the person makes
// while a pull waits for the network is still numbered) and is cleared at every open (a kill inside
// an engine write).
// Round 3 (finding 2): the trigger names carry a version; installChangeSeq drops every other version,
// so a changed body reaches existing installs (CREATE TRIGGER IF NOT EXISTS never replaces a body).
// Plain CommonJS on an expo-sqlite-style handle (execSync / runSync / getFirstSync / getAllSync);
// lib/schema createSchema installs it (fresh installs, existing installs and the test harness alike).

const TABLES = ['protocols', 'vials', 'dose_logs', 'biomarkers', 'vaccines', 'food_logs', 'reality_checks', 'calc_snapshots', 'calc_targets', 'reality_check_open', 'calc_inputs', 'lab_prefs'];
const KEY = 'dt_change_seq';
const FLAG = 'dt_engine_write';
// Bump when the trigger body changes: the next open replaces the old triggers.
const TRIGGER_VERSION = 2;
const insName = (t) => `dt_seq_ins_v${TRIGGER_VERSION}_${t}`;
const updName = (t) => `dt_seq_upd_v${TRIGGER_VERSION}_${t}`;

function installChangeSeq(db) {
  db.execSync(`CREATE TABLE IF NOT EXISTS ${FLAG} (id INTEGER PRIMARY KEY CHECK (id = 1));`);
  db.execSync(`DELETE FROM ${FLAG};`); // a mark left by a kill inside an engine write
  const want = new Set();
  for (const t of TABLES) { want.add(insName(t)); want.add(updName(t)); }
  let have = [];
  try { have = db.getAllSync(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'dt\\_seq\\_%' ESCAPE '\\'`) || []; } catch { have = []; }
  for (const r of have) if (r && r.name && !want.has(r.name)) db.execSync(`DROP TRIGGER IF EXISTS "${r.name}";`);
  const notEngine = `NOT EXISTS (SELECT 1 FROM ${FLAG})`;
  for (const t of TABLES) {
    try { db.execSync(`ALTER TABLE ${t} ADD COLUMN dt_seq INTEGER;`); } catch { /* column already there */ }
    const bump = `INSERT INTO local_meta (key, value) VALUES ('${KEY}', '1')
        ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT);
      UPDATE ${t} SET dt_seq = (SELECT CAST(value AS INTEGER) FROM local_meta WHERE key = '${KEY}') WHERE id = NEW.id;`;
    db.execSync(`CREATE TRIGGER IF NOT EXISTS ${insName(t)} AFTER INSERT ON ${t}
      WHEN NEW.sync_status IN ('pending', 'deleted') AND ${notEngine}
      BEGIN ${bump} END;`);
    // The inner UPDATE changes only dt_seq: the WHEN keeps it from counting itself.
    db.execSync(`CREATE TRIGGER IF NOT EXISTS ${updName(t)} AFTER UPDATE ON ${t}
      WHEN NEW.sync_status IN ('pending', 'deleted') AND NEW.dt_seq IS OLD.dt_seq AND ${notEngine}
      BEGIN ${bump} END;`);
  }
}

// The counter now (0 before any counted change).
function readChangeSeq(db) {
  try {
    const r = db.getFirstSync(`SELECT value FROM local_meta WHERE key = ?`, [KEY]);
    const n = r ? Number(r.value) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch { return 0; }
}

// ── The engine mark ──────────────────────────────────────────────────────────────────────────
// One depth per database handle, shared by every engineDb view of it (nested engine calls).
const depths = new WeakMap();
const ENGINE = Symbol.for('dosetrace.engineDb');
const RAW = Symbol.for('dosetrace.rawDb');
const rawOf = (db) => (db && db[RAW]) || db;

function markOn(raw) {
  const d = depths.get(raw) || 0;
  if (d === 0) raw.runSync(`INSERT OR IGNORE INTO ${FLAG} (id) VALUES (1)`);
  depths.set(raw, d + 1);
}
function markOff(raw) {
  const d = (depths.get(raw) || 1) - 1;
  depths.set(raw, d);
  if (d === 0) raw.runSync(`DELETE FROM ${FLAG}`);
}

// fn runs with the engine mark set: its writes never number a row. fn must be synchronous — a mark
// across an await would hide the person's own changes made meanwhile. Place it around a whole
// transaction or inside one (never so that a ROLLBACK after it could bring the mark back).
function asEngine(db, fn) {
  const raw = rawOf(db);
  markOn(raw);
  let out;
  try {
    out = fn();
  } finally {
    markOff(raw);
  }
  if (out && typeof out.then === 'function') throw new Error('asEngine: the engine mark is synchronous only');
  return out;
}

// Transaction control passes through unmarked: a mark set before BEGIN and removed inside the
// transaction would come back with a ROLLBACK.
const TX = /^\s*(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

// The database as the sync engine writes it: every runSync / execSync carries the engine mark.
function engineDb(db) {
  if (!db || db[ENGINE]) return db;
  const raw = db;
  return new Proxy(raw, {
    get(target, prop) {
      if (prop === ENGINE) return true;
      if (prop === RAW) return raw;
      const v = target[prop];
      if ((prop === 'runSync' || prop === 'execSync') && typeof v === 'function') {
        return (sql, ...rest) => {
          if (TX.test(String(sql))) return v.call(target, sql, ...rest);
          return asEngine(raw, () => v.call(target, sql, ...rest));
        };
      }
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

module.exports = { TABLES, installChangeSeq, readChangeSeq, engineDb, asEngine, CHANGE_SEQ_KEY: KEY, ENGINE_FLAG_TABLE: FLAG, TRIGGER_VERSION };
