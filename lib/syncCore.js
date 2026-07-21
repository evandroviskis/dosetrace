// DoseTrace sync algorithm — pure orchestration with NO React Native / Expo /
// Supabase imports. It operates on two injected collaborators:
//
//   db    — an expo-sqlite-style handle: getFirstSync(sql, params),
//           getAllSync(sql, params), runSync(sql, params), execSync(sql).
//   cloud — a small async cloud interface (see the shape below), implemented
//           over Supabase in lib/sync.js and in-memory in the test harness.
//
// Keeping this RN-free lets `node --test` drive the real push/pull/merge logic
// against a real SQLite (better-sqlite3) + a fake cloud, so the multi-device
// sync bugs fixed earlier have direct regression tests.
//
// cloud interface:
//   delete(table, remoteId)              -> { error }
//   update(table, remoteId, payload)     -> { data: rows[], error }   rows: {id, updated_at}
//   insert(table, payload)               -> { data: {id, updated_at}, error }
//   fetchSince(table, userId, sinceOrNull) -> { data: rows[], error }  (rows gathered so far)
//   fetchAll(table, userId)              -> { data: rows[], error }

const { toCloudPayload } = require('./syncMappers');

const TABLES = ['protocols', 'vials', 'dose_logs', 'biomarkers', 'vaccines'];

// ── Local DB helpers (all take the injected db) ─────────────────

function getPendingChanges(db, table, userId) {
  return db.getAllSync(
    `SELECT * FROM ${table} WHERE (sync_status = 'pending' OR sync_status = 'deleted') AND user_id = ?`,
    [userId]
  );
}

function markSynced(db, table, id, remoteId, expectedUpdatedAt, cloudUpdatedAt) {
  if (remoteId) {
    db.runSync(`UPDATE ${table} SET remote_id = ? WHERE id = ?`, [remoteId, id]);
  }
  // Stamp the cloud's updated_at locally (when known) so the pull watermark
  // compares cloud timestamps to cloud timestamps, not the local device clock.
  if (expectedUpdatedAt) {
    // Only flip to synced if the row wasn't edited while the push was in flight
    if (cloudUpdatedAt) {
      db.runSync(`UPDATE ${table} SET sync_status = 'synced', updated_at = ? WHERE id = ? AND updated_at = ?`, [cloudUpdatedAt, id, expectedUpdatedAt]);
    } else {
      db.runSync(`UPDATE ${table} SET sync_status = 'synced' WHERE id = ? AND updated_at = ?`, [id, expectedUpdatedAt]);
    }
  } else if (cloudUpdatedAt) {
    db.runSync(`UPDATE ${table} SET sync_status = 'synced', updated_at = ? WHERE id = ?`, [cloudUpdatedAt, id]);
  } else {
    db.runSync(`UPDATE ${table} SET sync_status = 'synced' WHERE id = ?`, [id]);
  }
}

function hardDeleteSynced(db, table, id) {
  db.runSync(`DELETE FROM ${table} WHERE id = ? AND sync_status = 'deleted'`, [id]);
}

// Remove a local row unconditionally — used when the cloud copy was deleted on
// another device (deletions win, so we honor the removal instead of resurrecting).
function deleteLocalRow(db, table, id) {
  db.runSync(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

// After a protocol gets a remote_id, update vials & dose_logs that reference it
// (force = true re-points children after a protocol is re-created in the cloud).
function updateChildRemoteIds(db, localProtocolId, remoteProtocolId, force = false) {
  const cond = force ? '' : ` AND (protocol_remote_id IS NULL OR protocol_remote_id = '')`;
  db.runSync(`UPDATE vials SET protocol_remote_id = ? WHERE protocol_id = ?${cond}`, [remoteProtocolId, localProtocolId]);
  db.runSync(`UPDATE dose_logs SET protocol_remote_id = ? WHERE protocol_id = ?${cond}`, [remoteProtocolId, localProtocolId]);
}

function updateLocalFromCloud(db, table, localId, cloudRow) {
  const now = new Date().toISOString();
  // Store the cloud's own updated_at so the pull watermark stays on cloud time.
  const cloudStamp = cloudRow.updated_at || now;

  if (table === 'protocols') {
    db.runSync(
      `UPDATE protocols SET name = ?, compound_id = ?, type = ?, color = ?, amount = ?, unit = ?, water = ?, diluent = ?, dose = ?, dose_unit = ?, syringe_size = ?, concentration = ?, concentration_unit = ?, frequency = ?, reminder_time = ?, interval_days = ?, doses_per_day = ?, start_date = ?, schedule_total = ?, vial_valid_days = ?, goal = ?, notes = ?, active = ?, deleted_at = ?, updated_at = ?, sync_status = 'synced' WHERE id = ?`,
      [
        cloudRow.name, cloudRow.compound_id || null, cloudRow.type, cloudRow.color, cloudRow.amount, cloudRow.unit,
        cloudRow.water, cloudRow.diluent || null, cloudRow.dose, cloudRow.dose_unit, cloudRow.syringe_size,
        cloudRow.concentration, cloudRow.concentration_unit || 'mg', cloudRow.frequency, cloudRow.reminder_time,
        cloudRow.interval_days || 1, cloudRow.doses_per_day || 1,
        cloudRow.start_date, cloudRow.schedule_total, cloudRow.vial_valid_days || null, cloudRow.goal, cloudRow.notes,
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
  } else if (table === 'vaccines') {
    db.runSync(
      `UPDATE vaccines SET name = ?, date_given = ?, next_due = ?, notes = ?, updated_at = ?, sync_status = 'synced' WHERE id = ?`,
      [cloudRow.name, cloudRow.date_given || null, cloudRow.next_due || null, cloudRow.notes || null, cloudStamp, localId]
    );
  }
}

function importSingleRow(db, table, cloudRow) {
  const now = new Date().toISOString();
  const cloudStamp = cloudRow.updated_at || now;

  if (table === 'protocols') {
    db.runSync(
      `INSERT INTO protocols (remote_id, user_id, name, compound_id, type, color, amount, unit, water, diluent, dose, dose_unit, syringe_size, concentration, concentration_unit, frequency, reminder_time, interval_days, doses_per_day, start_date, schedule_total, vial_valid_days, goal, notes, active, deleted_at, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [
        cloudRow.id, cloudRow.user_id, cloudRow.name, cloudRow.compound_id || null, cloudRow.type, cloudRow.color,
        cloudRow.amount, cloudRow.unit, cloudRow.water, cloudRow.diluent || null, cloudRow.dose, cloudRow.dose_unit,
        cloudRow.syringe_size, cloudRow.concentration, cloudRow.concentration_unit || 'mg', cloudRow.frequency, cloudRow.reminder_time,
        cloudRow.interval_days || 1, cloudRow.doses_per_day || 1,
        cloudRow.start_date, cloudRow.schedule_total, cloudRow.vial_valid_days || null, cloudRow.goal, cloudRow.notes,
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
  } else if (table === 'vaccines') {
    db.runSync(
      `INSERT INTO vaccines (remote_id, user_id, name, date_given, next_due, notes, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [cloudRow.id, cloudRow.user_id, cloudRow.name, cloudRow.date_given || null, cloudRow.next_due || null, cloudRow.notes || null, cloudRow.created_at, cloudStamp]
    );
  }
}

// Full import (first login / empty local DB): insert cloud rows we don't have.
function importFromCloud(db, table, rows) {
  for (const row of rows) {
    const existing = db.getFirstSync(`SELECT id FROM ${table} WHERE remote_id = ?`, [row.id]);
    if (existing) continue; // skip duplicates
    importSingleRow(db, table, row);
  }
}

// ── Orchestration (take db + cloud) ─────────────────────────────

async function pushPending(db, cloud, userId) {
  for (const table of TABLES) {
    const pending = getPendingChanges(db, table, userId);

    for (const row of pending) {
      try {
        // Re-read to get the latest data (e.g. protocol_remote_id may have updated)
        const freshRow = db.getFirstSync(`SELECT * FROM ${table} WHERE id = ?`, [row.id]);
        if (!freshRow) continue;

        if (freshRow.sync_status === 'deleted') {
          if (freshRow.remote_id) {
            const { error } = await cloud.delete(table, freshRow.remote_id);
            if (error) continue; // retry next sync
          }
          hardDeleteSynced(db, table, freshRow.id);
          continue;
        }

        if (freshRow.sync_status !== 'pending') continue;

        // Child rows wait until their parent protocol has a remote_id
        if ((table === 'vials' || table === 'dose_logs') && !freshRow.protocol_remote_id) continue;

        const payload = toCloudPayload(table, freshRow);
        payload.user_id = userId;

        if (freshRow.remote_id) {
          const { data: updated, error } = await cloud.update(table, freshRow.remote_id, payload);
          if (!error) {
            if (updated && updated.length > 0) {
              markSynced(db, table, freshRow.id, freshRow.remote_id, freshRow.updated_at, updated[0].updated_at);
            } else {
              // Cloud row is gone — another device deleted it. Deletions win.
              deleteLocalRow(db, table, freshRow.id);
            }
          }
        } else {
          const { data, error } = await cloud.insert(table, payload);
          if (!error && data) {
            markSynced(db, table, freshRow.id, data.id, freshRow.updated_at, data.updated_at);
            if (table === 'protocols') updateChildRemoteIds(db, freshRow.id, data.id);
          }
        }
      } catch {
        // Skip this row, retry next sync
      }
    }
  }
}

async function pullChanges(db, cloud, userId) {
  for (const table of TABLES) {
    try {
      // Most recent synced cloud timestamp, scoped to this user so another
      // account's rows can't contaminate the watermark.
      const lastRow = db.getFirstSync(
        `SELECT updated_at FROM ${table} WHERE sync_status = 'synced' AND user_id = ? ORDER BY updated_at DESC LIMIT 1`,
        [userId]
      );
      const since = lastRow?.updated_at || null;

      const { data: cloudRows } = await cloud.fetchSince(table, userId, since);
      for (const cloudRow of (cloudRows || [])) {
        const existing = db.getFirstSync(`SELECT id, sync_status FROM ${table} WHERE remote_id = ?`, [cloudRow.id]);
        if (existing) {
          // Local row exists — only overwrite if it has no pending local changes
          if (existing.sync_status === 'synced') updateLocalFromCloud(db, table, existing.id, cloudRow);
        } else {
          importSingleRow(db, table, cloudRow);
        }
      }
    } catch {
      // Skip this table, try next
    }
  }
}

async function fullImport(db, cloud, userId) {
  for (const table of TABLES) {
    const { data, error } = await cloud.fetchAll(table, userId);
    const fetchFailed = !!error;
    const rows = data || [];

    if (rows.length > 0) importFromCloud(db, table, rows);

    // Propagate cloud deletes: drop local synced rows whose cloud copy is gone.
    // Pending/deleted rows are untouched. Skipped on fetch failure so a partial
    // page never causes deletes.
    if (!fetchFailed) {
      const cloudIds = new Set(rows.map(r => r.id));
      const localSynced = db.getAllSync(
        `SELECT id, remote_id FROM ${table} WHERE user_id = ? AND sync_status = 'synced' AND remote_id IS NOT NULL`,
        [userId]
      );
      for (const localRow of localSynced) {
        if (!cloudIds.has(localRow.remote_id)) {
          db.runSync(`DELETE FROM ${table} WHERE id = ? AND sync_status = 'synced'`, [localRow.id]);
        }
      }
    }
  }
}

function isLocalDBEmpty(db, userId) {
  const row = db.getFirstSync(`SELECT COUNT(*) as cnt FROM protocols WHERE user_id = ?`, [userId]);
  return (row?.cnt || 0) === 0;
}

module.exports = {
  TABLES,
  getPendingChanges, markSynced, hardDeleteSynced, deleteLocalRow,
  updateChildRemoteIds, updateLocalFromCloud, importSingleRow, importFromCloud,
  pushPending, pullChanges, fullImport, isLocalDBEmpty,
};
