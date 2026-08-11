// Canonical table shapes for the local SQLite DB, in one place so the app
// (database.js initDatabase) and the Node test harness build an identical schema
// — no drift. CommonJS so `node --test` can require it; database.js (ESM) imports
// it fine. These are the *final* shapes; database.js still runs its ALTER-TABLE
// migrations separately to upgrade old installs.

const TABLE_DDL = {
  protocols: `
    CREATE TABLE IF NOT EXISTS protocols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id TEXT,
      user_id TEXT,
      name TEXT NOT NULL,
      compound_id TEXT,
      type TEXT DEFAULT 'recon',
      color TEXT DEFAULT '#185FA5',
      amount TEXT,
      unit TEXT,
      water TEXT,
      diluent TEXT,
      dose TEXT,
      dose_unit TEXT,
      syringe_size REAL,
      concentration TEXT,
      concentration_unit TEXT DEFAULT 'mg',
      frequency TEXT,
      reminder_time TEXT,
      interval_days INTEGER DEFAULT 1,
      doses_per_day INTEGER DEFAULT 1,
      start_date TEXT,
      schedule_total INTEGER,
      vial_valid_days INTEGER,
      goal TEXT,
      notes TEXT,
      note TEXT,
      serving_strength REAL,
      serving_strength_unit TEXT,
      serving_units REAL,
      container_units REAL,
      units_taken REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending'
    );
  `,
  vials: `
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
  `,
  dose_logs: `
    CREATE TABLE IF NOT EXISTS dose_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id TEXT,
      user_id TEXT,
      protocol_id INTEGER,
      protocol_remote_id TEXT,
      outcome TEXT DEFAULT 'Taken',
      injection_site TEXT,
      logged_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending'
    );
  `,
  biomarkers: `
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
  `,
  vaccines: `
    CREATE TABLE IF NOT EXISTS vaccines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id TEXT,
      user_id TEXT,
      name TEXT,
      date_given TEXT,
      next_due TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending'
    );
  `,
};

const INDEX_DDL = [
  `CREATE INDEX IF NOT EXISTS idx_protocols_active ON protocols(active, user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_vials_protocol ON vials(protocol_id, active);`,
  `CREATE INDEX IF NOT EXISTS idx_dose_logs_date ON dose_logs(logged_at, protocol_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sync_pending ON protocols(sync_status) WHERE sync_status = 'pending';`,
];

// Create all tables + indexes on an expo-sqlite-style handle (has execSync).
function createSchema(db) {
  for (const table of ['protocols', 'vials', 'dose_logs', 'biomarkers', 'vaccines']) {
    db.execSync(TABLE_DDL[table]);
  }
  for (const ix of INDEX_DDL) db.execSync(ix);
}

module.exports = { TABLE_DDL, INDEX_DDL, createSchema };
