'use strict';
// A-83: an ENDED protocol ("Yes, it's finished") — stopped, never deleted. active = 0,
// ended_at = when, deleted_at = NULL. It leaves Today, the reminders and the active list, but its
// whole dose history stays: the Dose log, the report, adherence and streak days up to the end,
// the curve's past. The 7-day purge only touches deleted protocols (deleted_at set), so an ended
// one is never purged — the cloud's dose_logs → protocols foreign key cascades on delete, so a
// purge would erase its doses.
// A row with active 0 and no deleted_at was never written before this change (softDeleteProtocol
// always set deleted_at), so "active 0 + no deletion" = ended; ended_at falls back to the row's
// last change when the cloud has no ended_at column yet. CommonJS, testable with the harness DB.

function isEnded(p) {
  return !!p && (p.active === 0 || p.active === false) && !p.deleted_at;
}

// Epoch ms of the end, or null when the protocol is not ended.
function endedAtMs(p) {
  if (!isEnded(p)) return null;
  const t = Date.parse(p.ended_at || p.updated_at);
  return Number.isFinite(t) ? t : null;
}

const SQL_ACTIVE = `SELECT * FROM protocols WHERE user_id = ? AND active = 1 AND sync_status != 'deleted' ORDER BY created_at DESC`;
const SQL_ENDED = `SELECT * FROM protocols WHERE user_id = ? AND active = 0 AND deleted_at IS NULL AND sync_status != 'deleted' ORDER BY COALESCE(ended_at, updated_at) DESC`;
// Active + ended: every protocol whose history counts (adherence, streak days, report, curve past).
const SQL_HISTORY = `SELECT * FROM protocols WHERE user_id = ? AND (active = 1 OR deleted_at IS NULL) AND sync_status != 'deleted' ORDER BY created_at DESC`;
const SQL_RECENTLY_DELETED = `SELECT * FROM protocols WHERE user_id = ? AND active = 0 AND deleted_at IS NOT NULL AND datetime(deleted_at) >= datetime(?) AND sync_status != 'deleted' ORDER BY deleted_at DESC`;
// The Dose log: rows of active AND ended protocols (and of rows whose protocol is unknown);
// rows of a deleted protocol stay hidden as before.
const SQL_ALL_LOGS = `SELECT dl.*, p.name as protocol_name, p.color as protocol_color, p.type as protocol_type FROM dose_logs dl LEFT JOIN protocols p ON dl.protocol_id = p.id WHERE dl.user_id = ? AND dl.sync_status != 'deleted' AND (p.id IS NULL OR ((p.active = 1 OR p.deleted_at IS NULL) AND p.sync_status != 'deleted')) ORDER BY dl.logged_at DESC`;

function endProtocol(db, id, nowIso = new Date().toISOString()) {
  db.runSync(
    `UPDATE protocols SET active = 0, ended_at = ?, deleted_at = NULL, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
    [nowIso, nowIso, id],
  );
}

// Restart = a NEW run (journey review F1/F3, 2026-10-03): re-activating the same row would turn
// every day between the end and the restart into owed doses (the scan's Missed rows, ring days,
// curve doses) and bring "Is this protocol finished?" straight back. The copy keeps every setting,
// starts today and is created now (so the scan, the rings and the prompt start from now); the
// ended row stays as the history of the first run. The newest vial goes with the new run (the
// same physical vial, its count kept). Returns the new protocol's id.
const NOT_COPIED = new Set(['id', 'remote_id', 'active', 'deleted_at', 'ended_at', 'created_at', 'updated_at', 'sync_status', 'start_date']);
function restartAsNew(db, id, { nowIso = new Date().toISOString(), todayKey } = {}) {
  const old = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [id]);
  if (!old) return null;
  const cols = db.getAllSync('PRAGMA table_info(protocols)').map((c) => c.name).filter((c) => !NOT_COPIED.has(c));
  const day = todayKey || nowIso.slice(0, 10);
  const all = [...cols, 'start_date', 'active', 'created_at', 'updated_at', 'sync_status'];
  const values = [...cols.map((c) => old[c]), day, 1, nowIso, nowIso, 'pending'];
  const r = db.runSync(`INSERT INTO protocols (${all.join(', ')}) VALUES (${all.map(() => '?').join(', ')})`, values);
  const newId = r.lastInsertRowId;
  const vial = db.getFirstSync('SELECT id FROM vials WHERE protocol_id = ? ORDER BY created_at DESC LIMIT 1', [id]);
  if (vial) {
    db.runSync(`UPDATE vials SET protocol_id = ?, protocol_remote_id = NULL, active = 1, updated_at = ?, sync_status = 'pending' WHERE id = ?`, [newId, nowIso, vial.id]);
  }
  return newId;
}

// The protocols of the 30-day report (journey review F2): the active ones, and the ended ones
// that have a record inside the window — ending a protocol never removes its doses from it.
function reportProtocols(protocols, logs, sinceMs, nowMs) {
  const inWindow = new Set();
  for (const l of logs || []) {
    const t = Date.parse(l.logged_at);
    if (Number.isFinite(t) && t >= sinceMs && t <= nowMs) inWindow.add(l.protocol_id);
  }
  return (protocols || []).filter((p) => p && !p.deleted_at && p.sync_status !== 'deleted'
    && (!isEnded(p) || inWindow.has(p.id)));
}

// The 7-day clean-up of DELETED protocols only (ended ones have no deleted_at).
function purgeOldDeleted(db, userId, nowIso = new Date().toISOString()) {
  const cutoff = new Date(Date.parse(nowIso) - 7 * 86400000).toISOString();
  const old = db.getAllSync(
    `SELECT id FROM protocols WHERE user_id = ? AND active = 0 AND deleted_at IS NOT NULL AND datetime(deleted_at) < datetime(?)`,
    [userId, cutoff],
  );
  if (!old.length) return 0;
  const ids = old.map((p) => p.id);
  const ph = ids.map(() => '?').join(',');
  db.runSync(`UPDATE vials SET sync_status = 'deleted', updated_at = ? WHERE protocol_id IN (${ph})`, [nowIso, ...ids]);
  db.runSync(`UPDATE protocols SET sync_status = 'deleted', updated_at = ? WHERE id IN (${ph})`, [nowIso, ...ids]);
  return ids.length;
}

module.exports = { isEnded, endedAtMs, endProtocol, restartAsNew, reportProtocols, purgeOldDeleted, SQL_ACTIVE, SQL_ENDED, SQL_HISTORY, SQL_RECENTLY_DELETED, SQL_ALL_LOGS };
