'use strict';
// A-119 Gate B round 2 (finding 1): a local change sequence. Every local mutation of a synced row —
// any insert or update that leaves the row unsent ('pending' or 'deleted'), the Delete forever
// included (lib/protocolEnd purgeProtocol leaves updated_at alone) — gets the next number of one
// counter in local_meta, by SQLite triggers, so no writer can forget it and no phone clock (set back
// or ahead) changes it. Sync writes that leave a row 'synced' (markSynced, imports, pulls) do not
// count. The takeover records the counter at its start; the rebuild keeps the unsent rows numbered
// after it (lib/syncCore rebuildFromCloud, lib/unsentSummary keptByRebuild).
// Plain CommonJS on an expo-sqlite-style handle (execSync / getFirstSync); lib/schema createSchema
// installs it (fresh installs, existing installs and the test harness alike).

const TABLES = ['protocols', 'vials', 'dose_logs', 'biomarkers', 'vaccines', 'food_logs', 'reality_checks', 'calc_snapshots', 'calc_targets', 'reality_check_open', 'calc_inputs'];
const KEY = 'dt_change_seq';

function installChangeSeq(db) {
  for (const t of TABLES) {
    try { db.execSync(`ALTER TABLE ${t} ADD COLUMN dt_seq INTEGER;`); } catch { /* column already there */ }
    const bump = `INSERT INTO local_meta (key, value) VALUES ('${KEY}', '1')
        ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT);
      UPDATE ${t} SET dt_seq = (SELECT CAST(value AS INTEGER) FROM local_meta WHERE key = '${KEY}') WHERE id = NEW.id;`;
    db.execSync(`CREATE TRIGGER IF NOT EXISTS dt_seq_ins_${t} AFTER INSERT ON ${t}
      WHEN NEW.sync_status IN ('pending', 'deleted')
      BEGIN ${bump} END;`);
    // The inner UPDATE changes only dt_seq: the WHEN keeps it from counting itself.
    db.execSync(`CREATE TRIGGER IF NOT EXISTS dt_seq_upd_${t} AFTER UPDATE ON ${t}
      WHEN NEW.sync_status IN ('pending', 'deleted') AND NEW.dt_seq IS OLD.dt_seq
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

module.exports = { installChangeSeq, readChangeSeq, CHANGE_SEQ_KEY: KEY };
