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

function restartProtocol(db, id, nowIso = new Date().toISOString()) {
  db.runSync(
    `UPDATE protocols SET active = 1, ended_at = NULL, deleted_at = NULL, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
    [nowIso, id],
  );
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

module.exports = { isEnded, endedAtMs, endProtocol, restartProtocol, purgeOldDeleted, SQL_ACTIVE, SQL_ENDED, SQL_HISTORY, SQL_RECENTLY_DELETED, SQL_ALL_LOGS };
