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
//   fetchIds(table, userId)              -> { data: ids[], error, sessionVerified }  (live protocols only)
//   fetchIn(table, column, values, userId) -> { data: rows[], error }
//   sessionUserId()                      -> the signed-in user id or null (optional)

const { toCloudPayload, OPTIONAL_COLUMNS } = require('./syncMappers');

const TABLES = ['protocols', 'vials', 'dose_logs', 'biomarkers', 'vaccines', 'food_logs', 'reality_checks', 'calc_snapshots', 'calc_targets', 'reality_check_open', 'calc_inputs'];

// Tables pulled IN FULL on every sync (tiny, a few rows per user) so a Stop pushed
// by another device is always seen, even when this device's own push moved the
// watermark past it (S-03 / FX-9, Stop wins).
const FULL_PULL = new Set(['reality_check_open']);

// parsed_items is a JSONB object/array in the cloud but JSON TEXT in SQLite. On
// PULL we serialize it back to TEXT (mirror of jsonTextToValue on push).
function jsonValueToText(v) {
  return v == null ? null : (typeof v === 'string' ? v : JSON.stringify(v));
}

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

// A push whose update found 0 rows (the cloud copy was deleted on another device): the local row
// goes instead of resurrecting — except a protocol (and a dose log or vial of a protocol that
// exists here, see pushPending), which may be the LAST copy of that history (Final Gate B
// 2026-10-04, never destroy on a maybe): it is never deleted here, only soft-deleted locally and
// left pending, so the next push re-inserts it (reviveProtocol). Only purged_at removes a protocol.
function softDeleteLocal(db, id) {
  db.runSync(
    `UPDATE protocols SET ended_at = COALESCE(ended_at, CASE WHEN active = 0 AND deleted_at IS NULL THEN updated_at END), active = 0, deleted_at = COALESCE(deleted_at, ?) WHERE id = ?`,
    [new Date().toISOString(), id],
  );
}
function deleteLocalRow(db, table, id) {
  if (table === 'protocols') {
    softDeleteLocal(db, id);
    db.runSync(`UPDATE protocols SET sync_status = 'pending' WHERE id = ?`, [id]);
    return;
  }
  db.runSync(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

// The local protocol of a dose log or vial, when it exists here and is not deleted forever.
function liveParent(db, row) {
  return db.getFirstSync(
    'SELECT id, remote_id, sync_status FROM protocols WHERE purged_at IS NULL AND (id = ? OR remote_id = ?) LIMIT 1',
    [row.protocol_id ?? null, row.protocol_remote_id || null],
  );
}

// Put a local row back into the cloud: with its own cloud id where possible (so other devices
// that kept it see the same row, no duplicate), else under a new one. → the cloud id, or null.
async function reinsertRow(db, cloud, userId, table, row) {
  const base = { ...toCloudPayload(table, row), user_id: userId };
  let r = row.remote_id ? await writeWithOptionalRetry(table, { ...base, id: row.remote_id }, (p) => cloud.insert(table, p)) : { error: true };
  if (r.error || !r.data) r = await writeWithOptionalRetry(table, { ...base }, (p) => cloud.insert(table, p));
  if (r.error || !r.data) return null;
  markOptionalDropped(db, table, row.id, r.dropped);
  markSynced(db, table, row.id, r.data.id, row.updated_at, r.data.updated_at);
  return r.data.id;
}

// A protocol whose cloud row is gone with NO purged_at evidence (an older build's automatic purge
// or manual delete — we cannot tell): this device may hold the last copy of its history. It goes
// back up SOFT-DELETED (it lands in Recently deleted, never silently active; the user can then
// Delete forever deliberately), and so do its dose logs and vials, same ids where possible.
// A revive caused by the user's Restore (restored_at, not yet pushed) keeps what the user asked
// for: restored (active, or Ended), never back in Recently deleted.
async function reviveProtocol(db, cloud, userId, row) {
  if (!(row.restored_at && !row.deleted_at)) softDeleteLocal(db, row.id);
  const fresh = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [row.id]);
  const newId = await reinsertRow(db, cloud, userId, 'protocols', fresh);
  if (!newId) return false; // stays pending (soft-deleted here), retried next sync
  db.runSync(`UPDATE protocols SET restored_at = NULL WHERE id = ? AND sync_status = 'synced'`, [row.id]);
  if (newId !== row.remote_id) updateChildRemoteIds(db, row.id, newId, true);
  for (const t of ['vials', 'dose_logs']) {
    const kids = db.getAllSync(
      `SELECT * FROM ${t} WHERE (protocol_id = ? OR protocol_remote_id = ?) AND remote_id IS NOT NULL AND sync_status != 'deleted'`,
      [row.id, row.remote_id],
    );
    for (const k of kids) {
      if (k.protocol_remote_id !== newId) db.runSync(`UPDATE ${t} SET protocol_id = ?, protocol_remote_id = ? WHERE id = ?`, [row.id, newId, k.id]);
      const kid = db.getFirstSync(`SELECT * FROM ${t} WHERE id = ?`, [k.id]);
      if (!(await reinsertRow(db, cloud, userId, t, kid))) {
        db.runSync(`UPDATE ${t} SET sync_status = 'pending' WHERE id = ?`, [k.id]); // retried: re-inserted next push
      }
    }
  }
  return true;
}

// 0 rows is only an answer under the same user's session: without one RLS also reports 0 rows
// (never destroy on a maybe). A cloud that cannot say (the test harness) counts as verified.
async function sameSession(cloud, userId) {
  if (!cloud.sessionUserId) return true;
  try { return (await cloud.sessionUserId()) === userId; } catch { return false; }
}

// ── Delete forever = a POSITIVE tombstone (Final Gate B 2026-10-04, never destroy on a maybe) ──
// The purge writes purged_at on the cloud protocol row (the row stays) after hard-deleting its dose
// logs and vials there; other devices remove it when an ordinary pull brings purged_at. Nothing is
// ever removed because a row is ABSENT from the cloud.

// Remove the SYNCED dose logs and vials of a protocol (matched by local or cloud id) and say how
// many unsynced ones remain — those are never deleted (R-A).
function dropSyncedChildren(db, p) {
  const where = p.remote_id ? '(protocol_id = ? OR protocol_remote_id = ?)' : 'protocol_id = ?';
  const args = p.remote_id ? [p.id, p.remote_id] : [p.id];
  let pending = 0;
  for (const t of ['dose_logs', 'vials']) {
    db.runSync(`DELETE FROM ${t} WHERE ${where} AND sync_status = 'synced'`, args);
    pending += db.getFirstSync(`SELECT COUNT(*) AS n FROM ${t} WHERE ${where} AND sync_status = 'pending'`, args).n;
  }
  return pending;
}

// A purged protocol leaves this device with its synced children; while an unsynced child of it
// remains, the protocol stays (hidden: every query reads purged_at IS NULL) and the child pending.
function finishLocalPurge(db, localId) {
  const p = db.getFirstSync('SELECT id, remote_id FROM protocols WHERE id = ?', [localId]);
  if (!p) return;
  if (dropSyncedChildren(db, p) === 0) db.runSync('DELETE FROM protocols WHERE id = ?', [p.id]);
}

// A dose log or vial whose local protocol is purged (by local or cloud protocol id).
function hasPurgedParent(db, row) {
  return !!db.getFirstSync(
    'SELECT 1 AS x FROM protocols WHERE purged_at IS NOT NULL AND (id = ? OR remote_id = ?) LIMIT 1',
    [row.protocol_id ?? null, row.protocol_remote_id || null],
  );
}

// Write the tombstone (purged_at) on the cloud protocol row; a row already gone (hard-deleted
// before the migration, or by an older build) is written back as a tombstone with the same id.
// → { status: 'done' | 'nocolumn' (the cloud lacks purged_at) | 'retry', updated_at }
async function writeTombstone(cloud, userId, row) {
  const mark = { user_id: userId, purged_at: row.purged_at, active: false };
  if (row.deleted_at) mark.deleted_at = row.deleted_at;
  let r;
  try { r = await cloud.update('protocols', row.remote_id, mark); } catch { return { status: 'retry' }; }
  if (r && r.error) return { status: missingOptionalColumn('protocols', mark, r.error) === 'purged_at' ? 'nocolumn' : 'retry' };
  if (r && Array.isArray(r.data) && r.data.length) return { status: 'done', updated_at: r.data[0].updated_at };
  return insertTombstone(cloud, userId, row);
}

// The tombstone as a new row with the protocol's own id (its cloud row is gone). An insert, never
// an update: a row that came back meanwhile makes it fail (duplicate id) instead of being purged.
async function insertTombstone(cloud, userId, row) {
  const mark = { user_id: userId, purged_at: row.purged_at, active: false };
  let r;
  const payload = { ...toCloudPayload('protocols', row), ...mark, id: row.remote_id, deleted_at: row.deleted_at || row.purged_at };
  delete payload.ended_at; delete payload.history_from; // a tombstone needs neither
  try { r = await cloud.insert('protocols', payload); } catch { return { status: 'retry' }; }
  if (r && r.error) return { status: missingOptionalColumn('protocols', payload, r.error) === 'purged_at' ? 'nocolumn' : 'retry' };
  return { status: 'done', updated_at: r && r.data ? r.data.updated_at : null };
}

// S2 (Final Gate B): the DELAYED tombstone (a Delete forever made before the migration) is
// written only while the cloud row is still missing. A live row means someone brought it back
// meanwhile: the local purge is cancelled and the protocol shows again as the cloud has it, with
// its history. A row that is already a tombstone just finishes the local purge.
// → 'stop' (the cloud still lacks the column: one probe per sync) | 'next'
async function resendTombstone(db, cloud, userId, row) {
  if (!cloud.fetchIn) return 'next'; // cannot check: never written blind
  let got;
  try { got = await cloud.fetchIn('protocols', 'id', [row.remote_id], userId); } catch { return 'next'; }
  if (!got || got.error || !Array.isArray(got.data)) return 'next';
  const there = got.data.find((r) => r.id === row.remote_id && r.user_id === userId);
  if (there && there.purged_at) {
    markOptionalDropped(db, 'protocols', row.id, null);
    finishLocalPurge(db, row.id);
    return 'next';
  }
  if (there) { await cancelLocalPurge(db, cloud, userId, row, there); return 'next'; }
  const w = await insertTombstone(cloud, userId, row);
  if (w.status === 'nocolumn') return 'stop';
  if (w.status === 'done') {
    markOptionalDropped(db, 'protocols', row.id, null);
    finishLocalPurge(db, row.id);
  }
  return 'next';
}

// The protocol came back in the cloud: the local purge is undone, the row takes the cloud's state
// and its dose logs and vials come back from the cloud (skipped while it was purged here).
async function cancelLocalPurge(db, cloud, userId, row, cloudRow) {
  db.runSync('UPDATE protocols SET purged_at = NULL, optional_pending = NULL WHERE id = ?', [row.id]);
  updateLocalFromCloud(db, 'protocols', row.id, cloudRow);
  for (const t of ['vials', 'dose_logs']) {
    let kids;
    try { kids = await cloud.fetchIn(t, 'protocol_id', [row.remote_id], userId); } catch { continue; }
    if (!kids || kids.error || !Array.isArray(kids.data)) continue;
    for (const k of kids.data) {
      if (k.user_id !== userId || db.getFirstSync(`SELECT id FROM ${t} WHERE remote_id = ?`, [k.id])) continue;
      importSingleRow(db, t, k);
    }
  }
}

// Push a purged protocol: its deleted dose logs and vials first (so no device ever sees the
// tombstone next to live children), then the tombstone. Before the migration: today's hard delete
// of the protocol row (the cloud cascades the children), and the local row waits hidden with
// optional_pending = 'purged_at' so resendOptional writes the tombstone once the column exists.
async function pushPurge(db, cloud, userId, row) {
  if (!row.remote_id) { finishLocalPurge(db, row.id); return; } // never reached the cloud
  for (const t of ['vials', 'dose_logs']) {
    const kids = db.getAllSync(`SELECT id, remote_id FROM ${t} WHERE (protocol_id = ? OR protocol_remote_id = ?) AND sync_status = 'deleted'`, [row.id, row.remote_id]);
    for (const k of kids) {
      if (k.remote_id) {
        const { error } = await cloud.delete(t, k.remote_id);
        if (error) return; // retry next sync
      }
      hardDeleteSynced(db, t, k.id);
    }
  }
  const w = await writeTombstone(cloud, userId, row);
  if (w.status === 'retry') return;
  if (w.status === 'nocolumn') {
    const { error } = await cloud.delete('protocols', row.remote_id);
    if (error) return;
    db.runSync(`UPDATE protocols SET sync_status = 'synced', optional_pending = 'purged_at' WHERE id = ? AND sync_status = 'pending'`, [row.id]);
    dropSyncedChildren(db, row);
    return;
  }
  markSynced(db, 'protocols', row.id, null, row.updated_at, w.updated_at);
  finishLocalPurge(db, row.id);
}

// After a protocol gets a remote_id, update vials & dose_logs that reference it
// (force = true re-points children after a protocol is re-created in the cloud).
function updateChildRemoteIds(db, localProtocolId, remoteProtocolId, force = false) {
  const cond = force ? '' : ` AND (protocol_remote_id IS NULL OR protocol_remote_id = '')`;
  db.runSync(`UPDATE vials SET protocol_remote_id = ? WHERE protocol_id = ?${cond}`, [remoteProtocolId, localProtocolId]);
  db.runSync(`UPDATE dose_logs SET protocol_remote_id = ? WHERE protocol_id = ?${cond}`, [remoteProtocolId, localProtocolId]);
}

// The optional columns (syncMappers OPTIONAL_COLUMNS) the cloud row carries: merged, never
// clobbered (Gate B round 2 R4) — a cloud value is written, a cloud NULL or a missing column
// leaves the local value as it is (a row pushed before the migration has NULL there).
function applyOptionalColumns(db, table, localId, cloudRow) {
  for (const col of OPTIONAL_COLUMNS[table] || []) {
    if (!cloudRow || cloudRow[col] == null) continue;
    try { db.runSync(`UPDATE ${table} SET ${col} = ? WHERE id = ?`, [cloudRow[col], localId]); } catch { /* old local schema */ }
  }
}

// R4: remember which optional columns a push had to drop (the cloud lacked them) so they are
// re-sent once it accepts them; a push that carried them all clears the marker. Local only.
function markOptionalDropped(db, table, localId, dropped) {
  if (!(OPTIONAL_COLUMNS[table] || []).length) return;
  try {
    db.runSync(`UPDATE ${table} SET optional_pending = ? WHERE id = ?`, [dropped && dropped.length ? dropped.join(',') : null, localId]);
  } catch { /* old local schema */ }
}

// R4: re-send the dropped optional columns of synced rows. One probe per sync while the cloud
// still lacks a column (it answers PGRST204): the rest wait for the next sync.
async function resendOptional(db, cloud, userId) {
  for (const table of Object.keys(OPTIONAL_COLUMNS)) {
    let rows = [];
    try {
      rows = db.getAllSync(`SELECT * FROM ${table} WHERE user_id = ? AND sync_status = 'synced' AND remote_id IS NOT NULL AND optional_pending IS NOT NULL`, [userId]);
    } catch { continue; }
    for (const row of rows) {
      const cols = String(row.optional_pending).split(',').filter(Boolean);
      if (table === 'protocols' && row.purged_at && cols.includes('purged_at')) {
        if ((await resendTombstone(db, cloud, userId, row)) === 'stop') return; // not migrated yet: probe failed
        continue;
      }
      const payload = { user_id: userId };
      for (const c of cols) if (row[c] != null) payload[c] = row[c];
      if (Object.keys(payload).length === 1) { markOptionalDropped(db, table, row.id, null); continue; }
      let r;
      try { r = await cloud.update(table, row.remote_id, payload); } catch { return; }
      if (r && r.error) {
        if (missingOptionalColumn(table, payload, r.error)) return; // not migrated yet: probe failed
        continue;
      }
      markOptionalDropped(db, table, row.id, null);
    }
  }
}

// PGRST204 "Could not find the 'ended_at' column of 'protocols' in the schema cache": the
// migration is not applied yet → the column is dropped from this payload and the write retried.
function missingOptionalColumn(table, payload, error) {
  if (!error) return null;
  const m = /Could not find the '([a-z_]+)' column/.exec(String(error.message || ''));
  const col = m && m[1];
  return col && (OPTIONAL_COLUMNS[table] || []).includes(col) && col in payload ? col : null;
}
async function writeWithOptionalRetry(table, payload, write) {
  let r = await write(payload);
  const dropped = [];
  for (let i = 0; i < 4; i++) {
    const col = missingOptionalColumn(table, payload, r && r.error);
    if (!col) break;
    delete payload[col];
    dropped.push(col);
    r = await write(payload);
  }
  return { ...(r || {}), dropped };
}

function updateLocalFromCloud(db, table, localId, cloudRow) {
  const now = new Date().toISOString();
  // Store the cloud's own updated_at so the pull watermark stays on cloud time.
  const cloudStamp = cloudRow.updated_at || now;

  if (table === 'protocols') {
    db.runSync(
      `UPDATE protocols SET name = ?, compound_id = ?, type = ?, color = ?, amount = ?, unit = ?, water = ?, diluent = ?, dose = ?, dose_unit = ?, syringe_size = ?, concentration = ?, concentration_unit = ?, frequency = ?, reminder_time = ?, interval_days = ?, doses_per_day = ?, start_date = ?, schedule_total = ?, vial_valid_days = ?, goal = ?, notes = ?, note = ?, composition = ?, serving_strength = ?, serving_strength_unit = ?, serving_units = ?, container_units = ?, units_taken = ?, divisible = ?, active = ?, deleted_at = ?, updated_at = ?, sync_status = 'synced' WHERE id = ?`,
      [
        cloudRow.name, cloudRow.compound_id || null, cloudRow.type, cloudRow.color, cloudRow.amount, cloudRow.unit,
        cloudRow.water, cloudRow.diluent || null, cloudRow.dose, cloudRow.dose_unit, cloudRow.syringe_size,
        cloudRow.concentration, cloudRow.concentration_unit || 'mg', cloudRow.frequency, cloudRow.reminder_time,
        cloudRow.interval_days || 1, cloudRow.doses_per_day || 1,
        cloudRow.start_date, cloudRow.schedule_total, cloudRow.vial_valid_days || null, cloudRow.goal, cloudRow.notes, cloudRow.note || null, cloudRow.composition || null,
        cloudRow.serving_strength ?? null, cloudRow.serving_strength_unit || null, cloudRow.serving_units ?? null,
        cloudRow.container_units ?? null, cloudRow.units_taken ?? 0,
        cloudRow.divisible == null ? null : (cloudRow.divisible ? 1 : 0),
        cloudRow.active ? 1 : 0, cloudRow.deleted_at, cloudStamp, localId,
      ]
    );
    applyOptionalColumns(db, table, localId, cloudRow);
    // Deleted forever on another device: it leaves with its synced children (pending ones stay).
    if (cloudRow.purged_at) finishLocalPurge(db, localId);
  } else if (table === 'vials') {
    const localP = db.getFirstSync(`SELECT id FROM protocols WHERE remote_id = ?`, [cloudRow.protocol_id]);
    db.runSync(
      `UPDATE vials SET protocol_id = ?, protocol_remote_id = ?, mixed_on = ?, water_ml = ?, total_doses = ?, doses_taken = ?, expires_on = ?, active = ?, updated_at = ?, sync_status = 'synced' WHERE id = ?`,
      [localP?.id || null, cloudRow.protocol_id, cloudRow.mixed_on, cloudRow.water_ml, cloudRow.total_doses, cloudRow.doses_taken, cloudRow.expires_on || null, cloudRow.active ? 1 : 0, cloudStamp, localId]
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
      `UPDATE vaccines SET name = ?, date_given = ?, next_due = ?, notes = ?, manufacturer = ?, batch_lot = ?, dose_number = ?, provider = ?, location = ?, updated_at = ?, sync_status = 'synced' WHERE id = ?`,
      [cloudRow.name, cloudRow.date_given || null, cloudRow.next_due || null, cloudRow.notes || null,
       cloudRow.manufacturer || null, cloudRow.batch_lot || null, cloudRow.dose_number ?? null, cloudRow.provider || null, cloudRow.location || null,
       cloudStamp, localId]
    );
  } else if (table === 'food_logs') {
    db.runSync(
      `UPDATE food_logs SET entry_date = ?, raw_text = ?, parsed_items = ?, kcal = ?, protein_g = ?, carb_g = ?, fat_g = ?, source = ?, parse_status = ?, updated_at = ?, sync_status = 'synced' WHERE id = ?`,
      [cloudRow.entry_date, cloudRow.raw_text || null, jsonValueToText(cloudRow.parsed_items),
       cloudRow.kcal ?? null, cloudRow.protein_g ?? null, cloudRow.carb_g ?? null, cloudRow.fat_g ?? null,
       cloudRow.source || 'ai', cloudRow.parse_status || 'done', cloudStamp, localId]
    );
  } else if (table === 'reality_checks') {
    db.runSync(
      `UPDATE reality_checks SET entry_date = ?, tdee = ?, rate_per_week_kg = ?, updated_at = ?, sync_status = 'synced' WHERE id = ?`,
      [cloudRow.entry_date, cloudRow.tdee ?? null, cloudRow.rate_per_week_kg ?? null, cloudStamp, localId]
    );
  } else if (table === 'calc_snapshots') {
    db.runSync(
      `UPDATE calc_snapshots SET entry_date = ?, weight_kg = ?, waist_cm = ?, body_fat_pct = ?, lbm = ?, bmr = ?, tdee = ?, updated_at = ?, sync_status = 'synced' WHERE id = ?`,
      [cloudRow.entry_date, cloudRow.weight_kg ?? null, cloudRow.waist_cm ?? null, cloudRow.body_fat_pct ?? null, cloudRow.lbm ?? null, cloudRow.bmr ?? null, cloudRow.tdee ?? null, cloudStamp, localId]
    );
  } else if (table === 'calc_targets') {
    db.runSync(
      `UPDATE calc_targets SET entry_date = ?, target_weight_kg = ?, target_body_fat_pct = ?, target_date = ?, start_date = ?, start_weight_kg = ?, start_body_fat_pct = ?, updated_at = ?, sync_status = 'synced' WHERE id = ?`,
      [cloudRow.entry_date ?? null, cloudRow.target_weight_kg ?? null, cloudRow.target_body_fat_pct ?? null, cloudRow.target_date ?? null, cloudRow.start_date ?? null, cloudRow.start_weight_kg ?? null, cloudRow.start_body_fat_pct ?? null, cloudStamp, localId]
    );
  } else if (table === 'reality_check_open') {
    // Stop wins: a local stop is kept even if the cloud copy is still open.
    db.runSync(
      `UPDATE reality_check_open SET start_date = ?, start_weight_kg = ?, stopped_at = COALESCE(stopped_at, ?), updated_at = ?, sync_status = 'synced' WHERE id = ?`,
      [cloudRow.start_date ?? null, cloudRow.start_weight_kg ?? null, cloudRow.stopped_at ?? null, cloudStamp, localId]
    );
  } else if (table === 'calc_inputs') {
    db.runSync(
      `UPDATE calc_inputs SET payload = ?, updated_at = ?, sync_status = 'synced' WHERE id = ?`,
      [jsonValueToText(cloudRow.payload), cloudStamp, localId]
    );
  }
}

function importSingleRow(db, table, cloudRow) {
  const now = new Date().toISOString();
  const cloudStamp = cloudRow.updated_at || now;

  if (table === 'protocols') {
    if (cloudRow.purged_at) return; // deleted forever: never imported (also a full import)
    db.runSync(
      `INSERT INTO protocols (remote_id, user_id, name, compound_id, type, color, amount, unit, water, diluent, dose, dose_unit, syringe_size, concentration, concentration_unit, frequency, reminder_time, interval_days, doses_per_day, start_date, schedule_total, vial_valid_days, goal, notes, note, composition, serving_strength, serving_strength_unit, serving_units, container_units, units_taken, divisible, active, deleted_at, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [
        cloudRow.id, cloudRow.user_id, cloudRow.name, cloudRow.compound_id || null, cloudRow.type, cloudRow.color,
        cloudRow.amount, cloudRow.unit, cloudRow.water, cloudRow.diluent || null, cloudRow.dose, cloudRow.dose_unit,
        cloudRow.syringe_size, cloudRow.concentration, cloudRow.concentration_unit || 'mg', cloudRow.frequency, cloudRow.reminder_time,
        cloudRow.interval_days || 1, cloudRow.doses_per_day || 1,
        cloudRow.start_date, cloudRow.schedule_total, cloudRow.vial_valid_days || null, cloudRow.goal, cloudRow.notes, cloudRow.note || null, cloudRow.composition || null,
        cloudRow.serving_strength ?? null, cloudRow.serving_strength_unit || null, cloudRow.serving_units ?? null,
        cloudRow.container_units ?? null, cloudRow.units_taken ?? 0,
        cloudRow.divisible == null ? null : (cloudRow.divisible ? 1 : 0),
        cloudRow.active ? 1 : 0, cloudRow.deleted_at, cloudRow.created_at, cloudStamp,
      ]
    );
    const added = db.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [cloudRow.id]);
    if (added) {
      applyOptionalColumns(db, table, added.id, cloudRow);
      // Children that arrived before their protocol get linked now (never left NULL orphans).
      for (const t of ['dose_logs', 'vials']) db.runSync(`UPDATE ${t} SET protocol_id = ? WHERE protocol_remote_id = ? AND protocol_id IS NULL`, [added.id, cloudRow.id]);
    }
  } else if (table === 'vials') {
    const localP = db.getFirstSync(`SELECT id, purged_at FROM protocols WHERE remote_id = ?`, [cloudRow.protocol_id]);
    if (localP && localP.purged_at) return;
    db.runSync(
      `INSERT INTO vials (remote_id, user_id, protocol_id, protocol_remote_id, mixed_on, water_ml, total_doses, doses_taken, expires_on, active, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [cloudRow.id, cloudRow.user_id, localP?.id || null, cloudRow.protocol_id, cloudRow.mixed_on, cloudRow.water_ml, cloudRow.total_doses, cloudRow.doses_taken, cloudRow.expires_on || null, cloudRow.active ? 1 : 0, cloudRow.created_at, cloudStamp]
    );
  } else if (table === 'dose_logs') {
    const localP = db.getFirstSync(`SELECT id, purged_at FROM protocols WHERE remote_id = ?`, [cloudRow.protocol_id]);
    if (localP && localP.purged_at) return;
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
      `INSERT INTO vaccines (remote_id, user_id, name, date_given, next_due, notes, manufacturer, batch_lot, dose_number, provider, location, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [cloudRow.id, cloudRow.user_id, cloudRow.name, cloudRow.date_given || null, cloudRow.next_due || null, cloudRow.notes || null,
       cloudRow.manufacturer || null, cloudRow.batch_lot || null, cloudRow.dose_number ?? null, cloudRow.provider || null, cloudRow.location || null,
       cloudRow.created_at, cloudStamp]
    );
  } else if (table === 'food_logs') {
    db.runSync(
      `INSERT INTO food_logs (remote_id, user_id, entry_date, raw_text, parsed_items, kcal, protein_g, carb_g, fat_g, source, parse_status, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [cloudRow.id, cloudRow.user_id, cloudRow.entry_date, cloudRow.raw_text || null, jsonValueToText(cloudRow.parsed_items),
       cloudRow.kcal ?? null, cloudRow.protein_g ?? null, cloudRow.carb_g ?? null, cloudRow.fat_g ?? null,
       cloudRow.source || 'ai', cloudRow.parse_status || 'done', cloudRow.created_at, cloudStamp]
    );
  } else if (table === 'reality_checks') {
    db.runSync(
      `INSERT INTO reality_checks (remote_id, user_id, entry_date, tdee, rate_per_week_kg, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [cloudRow.id, cloudRow.user_id, cloudRow.entry_date, cloudRow.tdee ?? null, cloudRow.rate_per_week_kg ?? null, cloudRow.created_at, cloudStamp]
    );
  } else if (table === 'calc_snapshots') {
    db.runSync(
      `INSERT INTO calc_snapshots (remote_id, user_id, entry_date, weight_kg, waist_cm, body_fat_pct, lbm, bmr, tdee, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [cloudRow.id, cloudRow.user_id, cloudRow.entry_date, cloudRow.weight_kg ?? null, cloudRow.waist_cm ?? null, cloudRow.body_fat_pct ?? null, cloudRow.lbm ?? null, cloudRow.bmr ?? null, cloudRow.tdee ?? null, cloudRow.created_at, cloudStamp]
    );
  } else if (table === 'calc_targets') {
    db.runSync(
      `INSERT INTO calc_targets (remote_id, user_id, entry_date, target_weight_kg, target_body_fat_pct, target_date, start_date, start_weight_kg, start_body_fat_pct, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [cloudRow.id, cloudRow.user_id, cloudRow.entry_date ?? null, cloudRow.target_weight_kg ?? null, cloudRow.target_body_fat_pct ?? null, cloudRow.target_date ?? null, cloudRow.start_date ?? null, cloudRow.start_weight_kg ?? null, cloudRow.start_body_fat_pct ?? null, cloudRow.created_at, cloudStamp]
    );
  } else if (table === 'reality_check_open') {
    db.runSync(
      `INSERT INTO reality_check_open (remote_id, user_id, start_date, start_weight_kg, stopped_at, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [cloudRow.id, cloudRow.user_id, cloudRow.start_date ?? null, cloudRow.start_weight_kg ?? null, cloudRow.stopped_at ?? null, cloudRow.created_at, cloudStamp]
    );
  } else if (table === 'calc_inputs') {
    db.runSync(
      `INSERT INTO calc_inputs (remote_id, user_id, payload, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, 'synced')`,
      [cloudRow.id, cloudRow.user_id, jsonValueToText(cloudRow.payload), cloudRow.created_at, cloudStamp]
    );
  }
}

// S3 (Final Gate B): a dose log or vial is imported only when its protocol is known here, or is
// LIVE in the cloud (never a purged one: no protocol_id NULL orphans of a purged protocol). The
// cloud protocols of the children whose protocol is unknown here are looked up once per batch.
// → { ok: false } when the lookup failed (the table waits), else { ok: true, live: Set | null }.
async function childGate(db, cloud, userId, table, rows) {
  if (table !== 'vials' && table !== 'dose_logs') return { ok: true, live: null };
  const unknown = [...new Set((rows || []).map((r) => r.protocol_id)
    .filter((pid) => pid && !db.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [pid])))];
  if (!unknown.length || !cloud.fetchIn) return { ok: true, live: new Set() };
  let got;
  try { got = await cloud.fetchIn('protocols', 'id', unknown, userId); } catch { return { ok: false }; }
  if (!got || got.error || !Array.isArray(got.data)) return { ok: false };
  return { ok: true, live: new Set(got.data.filter((p) => p.user_id === userId && !p.purged_at).map((p) => p.id)) };
}
function childAllowed(db, row, gate) {
  if (!gate || !gate.live || !row.protocol_id) return true;
  if (db.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [row.protocol_id])) return true; // importSingleRow checks purged
  return gate.live.has(row.protocol_id);
}

// Full import (first login / empty local DB): insert cloud rows we don't have.
function importFromCloud(db, table, rows, gate = null) {
  for (const row of rows) {
    const existing = db.getFirstSync(`SELECT id FROM ${table} WHERE remote_id = ?`, [row.id]);
    if (existing) continue; // skip duplicates
    if (!childAllowed(db, row, gate)) continue;
    importSingleRow(db, table, row);
  }
}

// ── Orchestration (take db + cloud) ─────────────────────────────

// One pulled cloud row: a synced local row takes it, a pending one keeps its edit (except Stop wins,
// and a protocol deleted forever elsewhere gets hidden now and leaves on the push), a new one is
// imported.
function mergeCloudRow(db, table, cloudRow, gate = null) {
  const existing = db.getFirstSync(`SELECT id, sync_status FROM ${table} WHERE remote_id = ?`, [cloudRow.id]);
  if (!existing) { if (childAllowed(db, cloudRow, gate)) importSingleRow(db, table, cloudRow); return; }
  if (existing.sync_status === 'synced') updateLocalFromCloud(db, table, existing.id, cloudRow);
  // Stop wins even over a pending local edit: take the cloud's stop, keep the row pending so the
  // edit (now stopped) is pushed.
  else if (table === 'reality_check_open' && existing.sync_status === 'pending' && cloudRow.stopped_at) {
    db.runSync(`UPDATE reality_check_open SET stopped_at = COALESCE(stopped_at, ?) WHERE id = ?`, [cloudRow.stopped_at, existing.id]);
  } else if (table === 'protocols' && existing.sync_status === 'pending' && cloudRow.purged_at) {
    db.runSync('UPDATE protocols SET purged_at = COALESCE(purged_at, ?) WHERE id = ?', [cloudRow.purged_at, existing.id]);
  }
}

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

        if (table === 'protocols' && freshRow.purged_at) { await pushPurge(db, cloud, userId, freshRow); continue; }

        // Child rows wait until their parent protocol has a remote_id
        if ((table === 'vials' || table === 'dose_logs') && !freshRow.protocol_remote_id) continue;
        // ...and a child of a protocol deleted forever stays pending, never deleted (R-A): it would
        // only hang off the tombstone; it blocks sign-out, and "Sign out anyway" still works.
        if ((table === 'vials' || table === 'dose_logs') && hasPurgedParent(db, freshRow)) continue;

        const payload = toCloudPayload(table, freshRow);
        payload.user_id = userId;

        if (freshRow.remote_id) {
          const { data: updated, error, dropped } = await writeWithOptionalRetry(table, payload, (p) => cloud.update(table, freshRow.remote_id, p));
          if (!error) {
            markOptionalDropped(db, table, freshRow.id, dropped);
            if (updated && updated.length > 0) {
              markSynced(db, table, freshRow.id, freshRow.remote_id, freshRow.updated_at, updated[0].updated_at);
              if (table === 'protocols') db.runSync(`UPDATE protocols SET restored_at = NULL WHERE id = ? AND sync_status = 'synced'`, [freshRow.id]);
            } else if (await sameSession(cloud, userId)) {
              // Cloud row is gone. A protocol (no purged_at: this is not a Delete forever) and a
              // child of a protocol that exists here may be the last copy: re-inserted, never
              // deleted. Other rows: deleted on another device, deletions win.
              const parent = (table === 'vials' || table === 'dose_logs') ? liveParent(db, freshRow) : null;
              if (table === 'protocols') await reviveProtocol(db, cloud, userId, freshRow);
              else if (parent) {
                // Refused (its protocol's cloud row is gone too): the protocol is pushed next, finds
                // 0 rows and is revived with this row.
                if (!(await reinsertRow(db, cloud, userId, table, freshRow))) db.runSync(`UPDATE protocols SET sync_status = 'pending' WHERE id = ? AND sync_status = 'synced'`, [parent.id]);
              } else deleteLocalRow(db, table, freshRow.id);
            } // else: no session (RLS reads as 0 rows) → kept pending, retried next sync
          }
        } else {
          const { data, error, dropped } = await writeWithOptionalRetry(table, payload, (p) => cloud.insert(table, p));
          if (!error && data) {
            markOptionalDropped(db, table, freshRow.id, dropped);
            markSynced(db, table, freshRow.id, data.id, freshRow.updated_at, data.updated_at);
            if (table === 'protocols') {
              updateChildRemoteIds(db, freshRow.id, data.id);
              db.runSync(`UPDATE protocols SET restored_at = NULL WHERE id = ? AND sync_status = 'synced'`, [freshRow.id]);
            }
          }
        }
      } catch {
        // Skip this row, retry next sync
      }
    }
  }
  // R4: optional columns dropped by an earlier push (before the migration) go up once accepted.
  try { await resendOptional(db, cloud, userId); } catch { /* next sync */ }
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
      const since = FULL_PULL.has(table) ? null : (lastRow?.updated_at || null);

      const { data: cloudRows } = await cloud.fetchSince(table, userId, since);
      const gate = await childGate(db, cloud, userId, table, cloudRows);
      if (!gate.ok) continue; // the protocol lookup failed: this table waits for the next pull
      for (const cloudRow of (cloudRows || [])) mergeCloudRow(db, table, cloudRow, gate);
      if (table === 'reality_check_open') enforceSingleOpenCheck(db, userId);
    } catch {
      // Skip this table, try next
    }
  }
  try { await selfHealProtocols(db, cloud, userId); } catch { /* next pull */ }
}

// R-B self-heal (Final Gate B 2026-10-04): the pull is incremental by updated_at, so a live protocol
// this device lacks (removed by an earlier build's absence rule, or missed) never comes back once the
// watermark is past it. Read the account's live protocol ids (only under the same user's session
// before and after) and re-import the protocols this device has no row for — with their dose logs
// and vials. Read-only towards the device's data: it never deletes, never re-imports a purged
// protocol, never touches a protocol it already has (any status), never another account's rows.
async function selfHealProtocols(db, cloud, userId) {
  if (!cloud.fetchIds || !cloud.fetchIn) return 0;
  let res;
  try { res = await cloud.fetchIds('protocols', userId); } catch { return 0; }
  if (!res || res.error || !Array.isArray(res.data) || res.sessionVerified !== true) return 0;
  const missing = res.data.filter((id) => !db.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [id]));
  if (!missing.length) return 0;
  let got;
  try { got = await cloud.fetchIn('protocols', 'id', missing, userId); } catch { return 0; }
  if (!got || got.error || !Array.isArray(got.data)) return 0;
  const healed = [];
  for (const row of got.data) {
    if (row.user_id !== userId || row.purged_at || !missing.includes(row.id)) continue;
    if (db.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [row.id])) continue;
    importSingleRow(db, 'protocols', row);
    healed.push(row.id);
  }
  if (!healed.length) return 0;
  for (const t of ['vials', 'dose_logs']) {
    let kids;
    try { kids = await cloud.fetchIn(t, 'protocol_id', healed, userId); } catch { continue; }
    if (!kids || kids.error || !Array.isArray(kids.data)) continue;
    for (const k of kids.data) {
      if (k.user_id !== userId || db.getFirstSync(`SELECT id FROM ${t} WHERE remote_id = ?`, [k.id])) continue;
      importSingleRow(db, t, k);
    }
  }
  return healed.length;
}

// Never two open reality checks on an account: after a pull, every open row but
// the newest (start_date, then created_at — the same order on every device) is
// stopped and queued for push. Covers a new local check meeting an older open
// check that arrives on a later pull.
function enforceSingleOpenCheck(db, userId) {
  const open = db.getAllSync(
    `SELECT id FROM reality_check_open WHERE user_id = ? AND stopped_at IS NULL AND sync_status != 'deleted' ORDER BY start_date DESC, created_at DESC, remote_id DESC`,
    [userId]
  );
  if (open.length < 2) return;
  const now = new Date().toISOString();
  for (const r of open.slice(1)) {
    db.runSync(`UPDATE reality_check_open SET stopped_at = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`, [now, now, r.id]);
  }
}

// Pull ONE table in full and report whether it succeeded (S-03: the reality-check
// migration may only plan against a pull that is known to have worked).
async function pullTable(db, cloud, userId, table) {
  try {
    const { data: cloudRows, error } = await cloud.fetchSince(table, userId, null);
    if (error) return { ok: false };
    const gate = await childGate(db, cloud, userId, table, cloudRows);
    if (!gate.ok) return { ok: false };
    for (const cloudRow of (cloudRows || [])) mergeCloudRow(db, table, cloudRow, gate);
    if (table === 'reality_check_open') enforceSingleOpenCheck(db, userId);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

const NO_ABSENCE_DELETE = new Set(['protocols', 'dose_logs', 'vials']);

async function fullImport(db, cloud, userId) {
  for (const table of TABLES) {
    const { data, error } = await cloud.fetchAll(table, userId);
    const fetchFailed = !!error;
    const rows = data || [];

    const gate = rows.length > 0 ? await childGate(db, cloud, userId, table, rows) : { ok: true, live: null };
    if (rows.length > 0 && gate.ok) importFromCloud(db, table, rows, gate);

    // Propagate cloud deletes: drop local synced rows whose cloud copy is gone.
    // Pending/deleted rows are untouched. Skipped on fetch failure so a partial
    // page never causes deletes. Never for a protocol, dose log or vial (Final Gate B 2026-10-04):
    // an older build's auto-purge leaves no tombstone, and the history is kept.
    if (!fetchFailed && !NO_ABSENCE_DELETE.has(table)) {
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
  getPendingChanges, markSynced, hardDeleteSynced, deleteLocalRow, finishLocalPurge, pushPurge, writeTombstone, sameSession, reviveProtocol, reinsertRow,
  updateChildRemoteIds, updateLocalFromCloud, importSingleRow, importFromCloud,
  pushPending, pullChanges, pullTable, selfHealProtocols, fullImport, isLocalDBEmpty, enforceSingleOpenCheck,
};
