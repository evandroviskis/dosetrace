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
//   delete(table, remoteId)              -> { data?: [{ id }], error }   data: the rows removed (A-142)
//   update(table, remoteId, payload)     -> { data: rows[], error }   rows: {id, updated_at}
//   insert(table, payload)               -> { data: {id, updated_at}, error }
//   fetchSince(table, userId, sinceOrNull) -> { data: rows[], error }  (rows gathered so far)
//   fetchAll(table, userId)              -> { data: rows[], error }
//   fetchIds(table, userId)              -> { data: ids[], error, sessionVerified }  (live protocols only)
//   fetchIn(table, column, values, userId) -> { data: rows[], error }
//   sessionUserId()                      -> the signed-in user id or null (optional)

const { toCloudPayload, OPTIONAL_COLUMNS, CLEARABLE_COLUMNS } = require('./syncMappers');
const PE = require('./protocolEnd');
// A-119 round 3: the engine's own writes never number a row (lib/changeSeq). Every exported engine
// function below takes the database as engineDb(db); the hot synchronous loops batch the mark once.
const { engineDb, asEngine } = require('./changeSeq');
const { pushCalcInputsRow } = require('./calcInputsSync');

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

// The server refused a dose log or vial because its protocol was deleted forever (the purged_at
// migration's trigger): the row stays pending (R-A), never re-sent under a new id.
function refusedPurgedParent(error) {
  return !!error && /was deleted forever/.test(String(error.message || ''));
}

// Put a local row back into the cloud: with its own cloud id where possible (so other devices
// that kept it see the same row, no duplicate). When that insert errors, first check whether the
// id exists now (a timeout after the row was created, or another device revived it meanwhile):
// present → that row is updated instead; a protocol tombstone → { purged }; the check fails →
// null (retried). Only an id that is really absent falls back to a new one.
// → { id } | { purged: cloudRow } | { refused: true } | null (retry next sync)
async function reinsertRow(db, cloud, userId, table, row) {
  const base = { ...toCloudPayload(table, row, { status: true }), user_id: userId };
  const done = (id, r, stamp) => {
    markOptionalDropped(db, table, row.id, r.dropped);
    markSynced(db, table, row.id, id, row.updated_at, stamp);
    // The whole row (its planned end included) went up: the change marker is settled (A-121 Gate B 1).
    if (table === 'protocols') { try { db.runSync(`UPDATE protocols SET ends_on_changed = NULL WHERE id = ? AND sync_status = 'synced'`, [row.id]); } catch { /* old schema */ } }
    return { id };
  };
  if (row.remote_id) {
    const r = await writeWithOptionalRetry(table, { ...base, id: row.remote_id }, (p) => cloud.insert(table, p));
    if (!r.error && r.data) return done(r.data.id, r, r.data.updated_at);
    if (refusedPurgedParent(r.error)) return { refused: true };
    if (!cloud.fetchIn) return null; // cannot check: never risk a duplicate
    let got;
    try { got = await cloud.fetchIn(table, 'id', [row.remote_id], userId); } catch { return null; }
    if (!got || got.error || !Array.isArray(got.data)) return null;
    const there = got.data.find((x) => x.id === row.remote_id && x.user_id === userId);
    if (there) {
      if (table === 'protocols' && there.purged_at) return { purged: there };
      const u = await writeWithOptionalRetry(table, { ...base }, (p) => cloud.update(table, row.remote_id, p));
      if (u.error) return refusedPurgedParent(u.error) ? { refused: true } : null;
      if (!u.data || !u.data.length) return null;
      return done(row.remote_id, u, u.data[0].updated_at);
    }
  }
  const r2 = await writeWithOptionalRetry(table, { ...base }, (p) => cloud.insert(table, p));
  if (r2.error || !r2.data) return refusedPurgedParent(r2.error) ? { refused: true } : null;
  return done(r2.data.id, r2, r2.data.updated_at);
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
  const res = await reinsertRow(db, cloud, userId, 'protocols', fresh);
  if (res && res.purged) {
    // Deleted forever elsewhere meanwhile: the tombstone wins (pending children stay, R-A).
    db.runSync('UPDATE protocols SET purged_at = COALESCE(purged_at, ?) WHERE id = ?', [res.purged.purged_at, row.id]);
    finishLocalPurge(db, row.id);
    return false;
  }
  const newId = res && res.id;
  if (!newId) return false; // stays pending (soft-deleted here), retried next sync
  db.runSync(`UPDATE protocols SET restored_at = NULL, status_at = NULL WHERE id = ? AND sync_status = 'synced'`, [row.id]);
  if (newId !== row.remote_id) updateChildRemoteIds(db, row.id, newId, true);
  for (const t of ['vials', 'dose_logs']) {
    const kids = db.getAllSync(
      `SELECT * FROM ${t} WHERE (protocol_id = ? OR protocol_remote_id = ?) AND remote_id IS NOT NULL AND sync_status != 'deleted'`,
      [row.id, row.remote_id],
    );
    for (const k of kids) {
      if (k.protocol_remote_id !== newId) db.runSync(`UPDATE ${t} SET protocol_id = ?, protocol_remote_id = ? WHERE id = ?`, [row.id, newId, k.id]);
      const kid = db.getFirstSync(`SELECT * FROM ${t} WHERE id = ?`, [k.id]);
      const kr = await reinsertRow(db, cloud, userId, t, kid);
      if (!kr || !kr.id) {
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

// A-142: a cloud delete without an error is not proof the row went. Without a session (the anon key)
// or under another user's, RLS answers 0 rows and the cloud row stays — dropping the local row then
// would let the next import bring it back. The adapter lists the rows removed. 0 rows count as done
// only under the same user's session, read before AND after the DELETE (it reads its token on its
// own; a session that comes back in between proves nothing — as lib/sync.js fetchIds): the row is gone
// already (deleted on another phone), or RLS refuses it for good (protocols have no DELETE policy; a
// vial of a protocol in Recently deleted, which the purge tombstone's trigger removes) and keeping it
// would block sign-out forever. Otherwise the local row stays 'deleted' and the next pass retries.
// A reply without the list (the test harness) keeps the old rule. → true when the local row may go.
async function cloudDeleted(cloud, userId, table, remoteId) {
  const before = await sameSession(cloud, userId);
  const { data, error } = await cloud.delete(table, remoteId);
  if (error) return false;
  if (Array.isArray(data) && data.length === 0) return before && (await sameSession(cloud, userId));
  return true;
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
  const payload = { ...toCloudPayload('protocols', row, { status: true }), ...mark, id: row.remote_id, deleted_at: row.deleted_at || row.purged_at };
  // A tombstone carries no content: neither the end, the history cut, the planned end nor the
  // "Still going?" answer (A-121 SG-21; the cloud trigger blanks them too).
  delete payload.ended_at; delete payload.history_from; delete payload.ends_on; delete payload.still_going_at;
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
        if (!(await cloudDeleted(cloud, userId, t, k.remote_id))) return; // retry next sync
      }
      hardDeleteSynced(db, t, k.id);
    }
  }
  const w = await writeTombstone(cloud, userId, row);
  if (w.status === 'retry') return;
  if (w.status === 'nocolumn') {
    if (!(await cloudDeleted(cloud, userId, 'protocols', row.remote_id))) return;
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
// A-148: the "Still going?" answer only moves forward — an older cloud value (another phone's,
// pushed late) never replaces a newer one here.
const LATER_WINS = { protocols: ['still_going_at'] };
// Does the cloud's answer replace the local one? The later wins; a local answer from the future (later
// than the trusted time + 1 h: the phone's clock was ahead) counts as absent, so the cloud's real,
// server-capped answer is taken (Round 3 R2).
function cloudAnswerWins(db, mineIso, cloudIso) {
  const theirs = Date.parse(cloudIso);
  if (!Number.isFinite(theirs)) return false;
  const mine = mineIso ? Date.parse(mineIso) : NaN;
  if (!Number.isFinite(mine)) return true;
  if (mine > PE.dbTrustedNowMs(db) + 3600000) return true;
  return theirs > mine;
}
function applyOptionalColumns(db, table, localId, cloudRow) {
  for (const col of OPTIONAL_COLUMNS[table] || []) {
    if (!cloudRow || cloudRow[col] == null) continue;
    try {
      if ((LATER_WINS[table] || []).includes(col)) {
        const cur = db.getFirstSync(`SELECT ${col} FROM ${table} WHERE id = ?`, [localId]);
        if (!cloudAnswerWins(db, cur && cur[col], cloudRow[col])) continue;
      }
      db.runSync(`UPDATE ${table} SET ${col} = ? WHERE id = ?`, [cloudRow[col], localId]);
    } catch { /* old local schema */ }
  }
}

// A-121 DL-115: the regular columns added after the cloud schema (syncMappers CLEARABLE_COLUMNS). A
// cloud value — NULL included — is written when the cloud row has the key; a cloud without the
// column (no key) or a value of this phone still waiting to go up (optional_pending) leaves the local
// value as it is (never destroy on a maybe).
function applyClearableColumns(db, table, localId, cloudRow) {
  const cols = CLEARABLE_COLUMNS[table] || [];
  if (!cols.length || !cloudRow) return;
  let waiting = [];
  try {
    const r = db.getFirstSync(`SELECT optional_pending FROM ${table} WHERE id = ?`, [localId]);
    waiting = String((r && r.optional_pending) || '').split(',').filter(Boolean);
  } catch { /* old local schema */ }
  for (const col of cols) {
    if (!(col in cloudRow) || waiting.includes(col)) continue;
    try { db.runSync(`UPDATE ${table} SET ${col} = ? WHERE id = ?`, [cloudRow[col] ?? null, localId]); } catch { /* old local schema */ }
  }
}
const isClearable = (table, col) => (CLEARABLE_COLUMNS[table] || []).includes(col);

// R4: remember which optional columns a push had to drop (the cloud lacked them) so they are
// re-sent once it accepts them; a push that carried them all clears the marker. Local only.
// sent (optional): the payload's keys. A column marked earlier but not in this payload (a protocol
// update without its status, A-87) keeps its mark, so it is still re-sent later.
function markOptionalDropped(db, table, localId, dropped, sent) {
  if (!(OPTIONAL_COLUMNS[table] || []).length) return;
  try {
    let marks = dropped && dropped.length ? [...dropped] : [];
    if (sent) {
      const prev = db.getFirstSync(`SELECT optional_pending FROM ${table} WHERE id = ?`, [localId]);
      for (const c of String((prev && prev.optional_pending) || '').split(',').filter(Boolean)) {
        if (!sent.includes(c) && !marks.includes(c)) marks.push(c);
      }
    }
    // A-121: a regular column the cloud lacked is waiting only while it holds a VALUE. A NULL needs
    // nothing there (the column did not exist, so the cloud has no value to clear) and is never
    // re-sent later, where it could erase a date another phone set after the migration.
    const clear = (CLEARABLE_COLUMNS[table] || []).filter((c) => marks.includes(c));
    if (clear.length) {
      const cur = db.getFirstSync(`SELECT ${clear.join(', ')} FROM ${table} WHERE id = ?`, [localId]) || {};
      marks = marks.filter((c) => !clear.includes(c) || cur[c] != null);
    }
    db.runSync(`UPDATE ${table} SET optional_pending = ? WHERE id = ?`, [marks.length ? marks.join(',') : null, localId]);
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
      for (const c of cols) if (row[c] != null) payload[c] = row[c]; // a NULL is never re-sent (A-121, markOptionalDropped)
      if (Object.keys(payload).length === 1) { markOptionalDropped(db, table, row.id, null); continue; }
      let r;
      try { r = await cloud.update(table, row.remote_id, payload); } catch { return; }
      if (r && r.error) {
        if (missingOptionalColumn(table, payload, r.error)) return; // not migrated yet: probe failed
        continue;
      }
      markOptionalDropped(db, table, row.id, null);
      // The end is in the cloud now: this phone's status change is settled (Gate B re-review, residual 1).
      if (table === 'protocols') db.runSync(`UPDATE protocols SET status_at = NULL WHERE id = ? AND sync_status = 'synced'`, [row.id]);
    }
  }
}

// PGRST204 "Could not find the 'ended_at' column of 'protocols' in the schema cache": the
// migration is not applied yet → the column is dropped from this payload and the write retried.
function missingOptionalColumn(table, payload, error) {
  if (!error) return null;
  const m = /Could not find the '([a-z_]+)' column/.exec(String(error.message || ''));
  const col = m && m[1];
  return col && ((OPTIONAL_COLUMNS[table] || []).includes(col) || isClearable(table, col)) && col in payload ? col : null;
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
    const before = db.getFirstSync('SELECT active, deleted_at, ended_at FROM protocols WHERE id = ?', [localId]);
    db.runSync(
      `UPDATE protocols SET name = ?, compound_id = ?, type = ?, color = ?, amount = ?, unit = ?, water = ?, diluent = ?, dose = ?, dose_unit = ?, syringe_size = ?, concentration = ?, concentration_unit = ?, frequency = ?, reminder_time = ?, interval_days = ?, doses_per_day = ?, start_date = ?, schedule_total = ?, vial_valid_days = ?, goal = ?, notes = ?, note = ?, composition = ?, serving_strength = ?, serving_strength_unit = ?, serving_units = ?, container_units = ?, units_taken = ?, divisible = ?, active = ?, deleted_at = ?, status_at = NULL, updated_at = ?, sync_status = 'synced' WHERE id = ?`,
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
    applyClearableColumns(db, table, localId, cloudRow);
    // A-121 SG-27: ended on another phone → this phone's app-written Missed rows after the end go too.
    try { PE.settlePulledEnd(db, localId, before, db.getFirstSync('SELECT active, deleted_at, ended_at FROM protocols WHERE id = ?', [localId])); } catch { /* next pull */ }
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
      applyClearableColumns(db, table, added.id, cloudRow);
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
  asEngine(db, () => {
    for (const row of rows) {
      const existing = db.getFirstSync(`SELECT id FROM ${table} WHERE remote_id = ?`, [row.id]);
      if (existing) continue; // skip duplicates
      if (!childAllowed(db, row, gate)) continue;
      importSingleRow(db, table, row);
    }
  });
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
  } else if (table === 'protocols' && existing.sync_status === 'pending') {
    // A-87 End / Delete wins: a pending edit that did not change the status (a capsule's
    // units_taken, a rename) takes the cloud's status; the edit itself stays pending.
    const local = db.getFirstSync('SELECT status_at FROM protocols WHERE id = ?', [existing.id]);
    if (!local.status_at) {
      const before = endState(db, existing.id);
      db.runSync('UPDATE protocols SET active = ?, deleted_at = ? WHERE id = ?', [cloudRow.active ? 1 : 0, cloudRow.deleted_at ?? null, existing.id]);
      if (cloudRow.ended_at !== undefined) db.runSync('UPDATE protocols SET ended_at = ? WHERE id = ?', [cloudRow.ended_at, existing.id]);
      settleEnd(db, existing.id, before); // Gate B 4: SG-27 also on a phone with a pending edit
    }
    takeCloudPlanned(db, existing.id, cloudRow); // Gate B 1 / 2
  }
}

// A-121 SG-27 (Gate B 4): a local row that became Ended through the cloud's state drops this phone's
// app-written Missed rows after the end, wherever that happens (pull of a synced row, the pending-row
// merge, the reply to a push).
function endState(db, id) {
  try { return db.getFirstSync('SELECT active, deleted_at, ended_at FROM protocols WHERE id = ?', [id]); } catch { return null; }
}
function settleEnd(db, id, before) {
  try { PE.settlePulledEnd(db, id, before, endState(db, id)); } catch { /* next pull */ }
}

// Gate B 1 / 2: a pending row (its own edit waits to go up) still takes what it did not change — the
// cloud's planned end unless this phone changed it (ends_on_changed), and a LATER "Still going?"
// answer (it only moves forward). src: a pulled cloud row or the reply to a push.
function takeCloudPlanned(db, id, src) {
  if (!src) return;
  try {
    const cur = db.getFirstSync('SELECT still_going_at, optional_pending FROM protocols WHERE id = ?', [id]) || {};
    // Round 3 R1: a date still waiting to go up (the cloud lacked the column when it was saved) is never
    // replaced by the cloud's NULL — the rule applyClearableColumns uses.
    const waiting = String(cur.optional_pending || '').split(',').includes('ends_on');
    if ('ends_on' in src && !waiting) db.runSync('UPDATE protocols SET ends_on = ? WHERE id = ? AND ends_on_changed IS NULL', [src.ends_on ?? null, id]);
    if (src.still_going_at && cloudAnswerWins(db, cur.still_going_at, src.still_going_at)) db.runSync('UPDATE protocols SET still_going_at = ? WHERE id = ?', [src.still_going_at, id]);
  } catch { /* old local schema */ }
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
            if (!(await cloudDeleted(cloud, userId, table, freshRow.remote_id))) continue; // retry next sync
          }
          hardDeleteSynced(db, table, freshRow.id);
          continue;
        }

        if (freshRow.sync_status !== 'pending') continue;

        if (table === 'protocols' && freshRow.purged_at) { await pushPurge(db, cloud, userId, freshRow); continue; }

        // DV-010 (DL-29): calc_inputs goes up as the cloud's payload + the keys changed here, never whole.
        if (table === 'calc_inputs' && (await pushCalcInputsRow(db, cloud, userId, freshRow)) !== 'fallback') continue;

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
            markOptionalDropped(db, table, freshRow.id, dropped, Object.keys(payload));
            if (updated && updated.length > 0) {
              markSynced(db, table, freshRow.id, freshRow.remote_id, freshRow.updated_at, updated[0].updated_at);
              if (table === 'protocols') {
                // An End whose ended_at the cloud could not take yet keeps its authority until it goes up.
                db.runSync(`UPDATE protocols SET restored_at = NULL, status_at = CASE WHEN ? THEN status_at ELSE NULL END WHERE id = ? AND sync_status = 'synced'`, [dropped.includes('ended_at') ? 1 : 0, freshRow.id]);
                // A-87: an edit without a status change takes the cloud's status (another phone's end).
                const u = updated[0];
                // Checked on the row as it is NOW (status_at IS NULL): an End tapped while this
                // request was out is never overwritten (Gate B review of A-87, finding 1).
                if (!freshRow.status_at && u && 'active' in u) {
                  const before = endState(db, freshRow.id);
                  db.runSync('UPDATE protocols SET active = ?, deleted_at = ?, ended_at = CASE WHEN ? THEN ? ELSE ended_at END WHERE id = ? AND status_at IS NULL',
                    [u.active ? 1 : 0, u.deleted_at ?? null, u.ended_at !== undefined ? 1 : 0, u.ended_at ?? null, freshRow.id]);
                  settleEnd(db, freshRow.id, before); // Gate B 4
                }
                // Gate B 1 / 2: the planned end and the answer as the cloud has them now (another phone's
                // date stays; a later answer comes back), then the change marker is settled.
                takeCloudPlanned(db, freshRow.id, u);
                db.runSync(`UPDATE protocols SET ends_on_changed = NULL WHERE id = ? AND sync_status = 'synced'`, [freshRow.id]);
              }
            } else if (await sameSession(cloud, userId)) {
              // Cloud row is gone. A protocol (no purged_at: this is not a Delete forever) and a
              // child of a protocol that exists here may be the last copy: re-inserted, never
              // deleted. Other rows: deleted on another device, deletions win.
              const parent = (table === 'vials' || table === 'dose_logs') ? liveParent(db, freshRow) : null;
              if (table === 'protocols') await reviveProtocol(db, cloud, userId, freshRow);
              else if (parent) {
                // Refused (its protocol's cloud row is gone too): the protocol is pushed next, finds
                // 0 rows and is revived with this row.
                const r = await reinsertRow(db, cloud, userId, table, freshRow);
                if ((!r || !r.id) && !(r && r.refused)) db.runSync(`UPDATE protocols SET sync_status = 'pending' WHERE id = ? AND sync_status = 'synced'`, [parent.id]);
              } else if (table === 'calc_snapshots') {
                // A-92: a weigh-in typed here after another phone deleted that row is newer user
                // input: it goes back up (same id where possible), never thrown away. Failing → pending.
                await reinsertRow(db, cloud, userId, table, freshRow);
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
              db.runSync(`UPDATE protocols SET restored_at = NULL, ends_on_changed = NULL, status_at = CASE WHEN ? THEN status_at ELSE NULL END WHERE id = ? AND sync_status = 'synced'`, [dropped.includes('ended_at') ? 1 : 0, freshRow.id]);
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

function pullRewindPending(db) {
  try { return !!db.getFirstSync('SELECT value FROM local_meta WHERE key = ?', [PE.PULL_REWIND_KEY]); } catch { return false; }
}
function pullRewindDone(db) {
  try { db.runSync('DELETE FROM local_meta WHERE key = ?', [PE.PULL_REWIND_KEY]); } catch { /* retried */ }
}

// → { changed: [tables that brought at least one row] (DV-052: the app re-plans the reminders when
// another device's dose logs, protocols or vials arrive), ok: the tables whose fetch had no error and
// whose rows all merged (A-177: the Missed scan judges a slot only after dose_logs pulled
// successfully, lib/pullStamp) }.
async function pullChanges(db, cloud, userId) {
  const changed = new Set();
  const ok = [];
  for (const table of TABLES) {
    try {
      // Most recent synced cloud timestamp, scoped to this user so another
      // account's rows can't contaminate the watermark.
      const lastRow = db.getFirstSync(
        `SELECT updated_at FROM ${table} WHERE sync_status = 'synced' AND user_id = ? ORDER BY updated_at DESC LIMIT 1`,
        [userId]
      );
      // A-121 DL-117: once after an update that added a protocols column, the pull starts from the
      // beginning (the older version moved its watermark past rows it pulled without the column).
      const rewind = table === 'protocols' && pullRewindPending(db);
      const since = FULL_PULL.has(table) || rewind ? null : (lastRow?.updated_at || null);

      const { data: cloudRows, error } = await cloud.fetchSince(table, userId, since);
      const gate = await childGate(db, cloud, userId, table, cloudRows);
      if (!gate.ok) continue; // the protocol lookup failed: this table waits for the next pull
      asEngine(db, () => { for (const cloudRow of (cloudRows || [])) mergeCloudRow(db, table, cloudRow, gate); });
      if (!FULL_PULL.has(table) && Array.isArray(cloudRows) && cloudRows.length) changed.add(table);
      // Done only when it could bring the column: a cloud without it yet keeps the rewind for later.
      // An empty answer counts only under the same user's session (RLS answers 0 rows without one).
      if (rewind && !error && Array.isArray(cloudRows) && (cloudRows.some((r) => 'ends_on' in r) || (!cloudRows.length && (await sameSession(cloud, userId))))) pullRewindDone(db);
      if (table === 'reality_check_open') enforceSingleOpenCheck(db, userId);
      if (!error) ok.push(table); // a failed page merged what it read, but the pull is not complete
    } catch {
      // Skip this table, try next
    }
  }
  try { if (await selfHealProtocols(db, cloud, userId)) changed.add('protocols'); } catch { /* next pull */ }
  return { changed: [...changed], ok };
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
    asEngine(db, () => {
      for (const cloudRow of (cloudRows || [])) mergeCloudRow(db, table, cloudRow, gate);
      if (table === 'reality_check_open') enforceSingleOpenCheck(db, userId);
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

const NO_ABSENCE_DELETE = new Set(['protocols', 'dose_logs', 'vials']);

// → { ok: the tables read in full and imported } (A-177, as pullChanges).
async function fullImport(db, cloud, userId) {
  const ok = [];
  for (const table of TABLES) {
    const { data, error } = await cloud.fetchAll(table, userId);
    const fetchFailed = !!error;
    const rows = data || [];

    const gate = rows.length > 0 ? await childGate(db, cloud, userId, table, rows) : { ok: true, live: null };
    if (rows.length > 0 && gate.ok) importFromCloud(db, table, rows, gate);
    if (!fetchFailed && gate.ok) ok.push(table);

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
  return { ok };
}

// A-119 (OD-15, DL-104): the phone that takes the account over rebuilds its local copy from the
// server AFTER the takeover was committed, so no old copy — a row deleted on the other phone, a stale
// counter, a row its own watermark skipped — can come back through it. Every table is fetched first;
// any failure leaves the local data untouched ({ ok: false }, retried). Then, in one transaction,
// this account's local rows (its own unsent ones included: counted and shown to the person before,
// the founder's exception for this case) are replaced by the account's rows. Children of a protocol
// deleted forever are not imported (the live set comes from the fetched protocols).
//
// Gate B H3 (2026-10-20, round 2): `keep` says which unsent rows survive — { seq: n } keeps what was
// written on this phone at or after its own sign-in / "Use here" (the person's new input on the
// winning phone; re-sent after the rebuild), { all: true } keeps every unsent row (a stale copy on a
// phone that becomes active while no other phone holds the account, DL-103). What is discarded is
// counted INSIDE the same transaction as the delete (a row typed during the fetch is never lost
// uncounted); an unreadable count rolls everything back ({ ok: false, reason: 'unreadable' }).
// → { ok, discarded: summary | null }
async function rebuildFromCloud(db, cloud, userId, { keep = null } = {}) {
  if (!userId) return { ok: false };
  const fetched = {};
  for (const table of TABLES) {
    let res;
    try { res = await cloud.fetchAll(table, userId); } catch { return { ok: false }; }
    if (!res || res.error || !Array.isArray(res.data)) return { ok: false };
    fetched[table] = res.data.filter((r) => r && r.user_id === userId);
  }
  const live = new Set(fetched.protocols.filter((p) => !p.purged_at).map((p) => p.id));
  const { summarizeUnsent } = require('./unsentSummary'); // lazy: unsentSummary requires this file
  let discarded = null;
  db.execSync('BEGIN');
  try {
    // Round 3: the engine mark is set INSIDE the transaction, so a ROLLBACK removes it with the rest.
    asEngine(db, () => {
      const bySeq = !!(keep && !keep.all && keep.seq != null);
      if (bySeq) {
        // Round 2: a child kept on its own while its protocol (created here, never sent) is discarded
        // would stay unsent forever — it goes with its protocol, and is counted with it.
        for (const t of ['vials', 'dose_logs']) {
          db.runSync(
            `UPDATE ${t} SET dt_seq = NULL WHERE user_id = ? AND sync_status != 'synced' AND dt_seq > ?
               AND protocol_id IN (SELECT p.id FROM protocols p WHERE p.user_id = ? AND p.remote_id IS NULL
                 AND (p.sync_status = 'synced' OR p.dt_seq IS NULL OR p.dt_seq <= ?))`, [userId, keep.seq, userId, keep.seq]);
        }
      }
      try { discarded = summarizeUnsent(db, [userId], { keep: keep || { seq: null } }); } catch (e) { e.unreadable = true; throw e; }
      for (const table of TABLES) {
        if (keep && keep.all) db.runSync(`DELETE FROM ${table} WHERE user_id = ? AND sync_status = 'synced'`, [userId]);
        else if (bySeq) db.runSync(`DELETE FROM ${table} WHERE user_id = ? AND (sync_status = 'synced' OR dt_seq IS NULL OR dt_seq <= ?)`, [userId, keep.seq]);
        else db.runSync(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
      }
      for (const table of TABLES) {
        const gate = (table === 'vials' || table === 'dose_logs') ? { ok: true, live } : null;
        importFromCloud(db, table, fetched[table], gate);
      }
      // Kept children point at their protocol again (a synced protocol was imported under a new id).
      for (const t of ['vials', 'dose_logs']) {
        db.runSync(
          `UPDATE ${t} SET protocol_id = (SELECT p.id FROM protocols p WHERE p.remote_id = ${t}.protocol_remote_id LIMIT 1)
           WHERE user_id = ? AND sync_status != 'synced' AND protocol_remote_id IS NOT NULL
             AND EXISTS (SELECT 1 FROM protocols p WHERE p.remote_id = ${t}.protocol_remote_id)`, [userId]);
      }
    });
    db.execSync('COMMIT');
  } catch (e) {
    try { db.execSync('ROLLBACK'); } catch { /* nothing to roll back */ }
    return { ok: false, reason: e && e.unreadable ? 'unreadable' : 'failed' };
  }
  return { ok: true, discarded };
}

function isLocalDBEmpty(db, userId) {
  const row = db.getFirstSync(`SELECT COUNT(*) as cnt FROM protocols WHERE user_id = ?`, [userId]);
  return (row?.cnt || 0) === 0;
}

// A-119 round 3: every engine entry point writes through engineDb — whoever calls it (lib/sync, the
// harness, a probe), its writes never number a row (lib/changeSeq). Reads, sameSession (no db) and
// finishLocalPurge (deletes only; also the person's own Discard, lib/orphanedPending) are exported
// as they are.
const asEngineFn = (fn) => function engineEntry(db, ...rest) { return fn(engineDb(db), ...rest); };
module.exports = {
  TABLES,
  getPendingChanges, finishLocalPurge, sameSession, isLocalDBEmpty,
  markSynced: asEngineFn(markSynced), hardDeleteSynced: asEngineFn(hardDeleteSynced), deleteLocalRow: asEngineFn(deleteLocalRow),
  pushPurge: asEngineFn(pushPurge), writeTombstone: asEngineFn(writeTombstone), reviveProtocol: asEngineFn(reviveProtocol), reinsertRow: asEngineFn(reinsertRow),
  updateChildRemoteIds: asEngineFn(updateChildRemoteIds), updateLocalFromCloud: asEngineFn(updateLocalFromCloud),
  importSingleRow: asEngineFn(importSingleRow), importFromCloud: asEngineFn(importFromCloud),
  pushPending: asEngineFn(pushPending), pullChanges: asEngineFn(pullChanges), pullTable: asEngineFn(pullTable),
  selfHealProtocols: asEngineFn(selfHealProtocols), fullImport: asEngineFn(fullImport), rebuildFromCloud: asEngineFn(rebuildFromCloud),
  enforceSingleOpenCheck: asEngineFn(enforceSingleOpenCheck),
};
