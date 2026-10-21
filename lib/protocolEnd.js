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

// Every query below leaves out purged protocols (purged_at set: Delete forever, a tombstone).
const SQL_ACTIVE = `SELECT * FROM protocols WHERE user_id = ? AND active = 1 AND purged_at IS NULL AND sync_status != 'deleted' ORDER BY created_at DESC`;
const SQL_ENDED = `SELECT * FROM protocols WHERE user_id = ? AND active = 0 AND deleted_at IS NULL AND purged_at IS NULL AND sync_status != 'deleted' ORDER BY COALESCE(ended_at, updated_at) DESC`;
// Active + ended: every protocol whose history counts (adherence, streak days, report, curve past).
const SQL_HISTORY = `SELECT * FROM protocols WHERE user_id = ? AND (active = 1 OR deleted_at IS NULL) AND purged_at IS NULL AND sync_status != 'deleted' ORDER BY created_at DESC`;
const SQL_RECENTLY_DELETED = `SELECT * FROM protocols WHERE user_id = ? AND active = 0 AND deleted_at IS NOT NULL AND purged_at IS NULL AND datetime(deleted_at) >= datetime(?) AND sync_status != 'deleted' ORDER BY deleted_at DESC`;
// The Dose log: rows of active AND ended protocols (and of rows whose protocol is unknown);
// rows of a deleted protocol stay hidden as before.
const SQL_ALL_LOGS = `SELECT dl.*, p.name as protocol_name, p.compound_id as protocol_compound_id, p.color as protocol_color, p.type as protocol_type, p.created_at as protocol_created_at FROM dose_logs dl LEFT JOIN protocols p ON dl.protocol_id = p.id WHERE dl.user_id = ? AND dl.sync_status != 'deleted' AND (p.id IS NULL OR ((p.active = 1 OR p.deleted_at IS NULL) AND p.purged_at IS NULL AND p.sync_status != 'deleted')) ORDER BY dl.logged_at DESC`;

// A-87 local column status_at, added on the first start of 1.3.0. Rows an older build left PENDING
// may carry a status change (its "finished" soft delete, a Delete, a Restore) made before the column
// existed: they are marked once, so that change is still sent (never undone by the cloud's state).
// Runs the backfill only when the column is new (a later start finds it and does nothing).
function addStatusAtColumn(db) {
  try { db.execSync('ALTER TABLE protocols ADD COLUMN status_at TEXT;'); } catch { return false; }
  try {
    db.runSync(`UPDATE protocols SET status_at = COALESCE(restored_at, updated_at) WHERE (sync_status = 'pending' AND remote_id IS NOT NULL) OR optional_pending LIKE '%ended_at%'`);
  } catch { /* start-up never fails on it; the row then sends no status */ }
  return true;
}

function endProtocol(db, id, nowIso = new Date().toISOString()) {
  db.runSync(
    `UPDATE protocols SET active = 0, ended_at = ?, deleted_at = NULL, status_at = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
    [nowIso, nowIso, nowIso, id],
  );
}

// A-86 (dt-council 2026-10-04, decided by logic): the inactivity prompt ("Yes, it's finished") only
// appears after 7+ days without a dose, so its tap always includes days the user did not take it.
// The end is the LAST logged Taken dose (no date question); a protocol never taken ends where it
// started. The Missed rows the app wrote after that end go (a synced one as a deletion everywhere,
// an unsynced one simply); a row the user answered (Taken, Skipped) is never touched.
function endAtLastDose(db, id, nowIso = new Date().toISOString()) {
  const p = db.getFirstSync('SELECT created_at FROM protocols WHERE id = ?', [id]);
  if (!p) return null;
  const last = db.getFirstSync(`SELECT MAX(logged_at) AS at FROM dose_logs WHERE protocol_id = ? AND outcome = 'Taken' AND sync_status != 'deleted'`, [id]);
  const end = (last && last.at) || p.created_at || nowIso;
  // A-121 SG-16: through the one End (vials off, Missed rows after the end gone), dated at the
  // last dose as DL-87 says.
  return endNow(db, id, { now: new Date(nowIso), endIso: end });
}

// The Missed rows the app wrote after an end are not what happened (DL-87): an unsynced one simply
// goes, a synced one becomes a deletion that the push sends to the cloud. A row the person answered
// (Taken, Skipped) is never touched. ISO strings compare as times only in one format, so the
// comparison is done on the parsed moments.
function dropMissedAfter(db, id, endIso, nowIso = new Date().toISOString()) {
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(endMs)) return 0;
  const rows = db.getAllSync(`SELECT id, remote_id, logged_at FROM dose_logs WHERE protocol_id = ? AND outcome = 'Missed' AND sync_status != 'deleted'`, [id]);
  let n = 0;
  for (const r of rows) {
    const t = Date.parse(r.logged_at);
    if (!Number.isFinite(t) || t <= endMs) continue;
    if (r.remote_id) db.runSync(`UPDATE dose_logs SET sync_status = 'deleted', updated_at = ? WHERE id = ?`, [nowIso, r.id]);
    else db.runSync('DELETE FROM dose_logs WHERE id = ?', [r.id]);
    n++;
  }
  return n;
}

// Delete forever (Recently deleted, one or several; founder 2026-10-03): its dose logs and vials
// become synced tombstones (the push deletes them in the cloud), and the protocol gets purged_at —
// a POSITIVE tombstone (Final Gate B 2026-10-04): the push writes purged_at on the cloud row, which
// stays, so every other device learns of it from an ordinary pull (lib/syncCore pushPurge). Every
// query hides it at once (purged_at IS NULL). Reminders are cancelled by the screen.
// updated_at is left as it is (a cloud stamp once synced: the pull watermark stays on cloud time).
// Gate B P2: only a protocol that is still deleted is purged (a pull may restore it while the
// confirm sheet is open), and its children only when it was. → true when it purged.
function purgeProtocol(db, id, nowIso = new Date().toISOString()) {
  const r = db.runSync(
    `UPDATE protocols SET purged_at = ?, sync_status = 'pending' WHERE id = ? AND active = 0 AND deleted_at IS NOT NULL AND purged_at IS NULL`,
    [nowIso, id],
  );
  if (!r || !r.changes) return false;
  db.runSync(`UPDATE dose_logs SET sync_status = 'deleted', updated_at = ? WHERE protocol_id = ?`, [nowIso, id]);
  db.runSync(`UPDATE vials SET sync_status = 'deleted', updated_at = ? WHERE protocol_id = ?`, [nowIso, id]);
  return true;
}

// Soft delete (to Recently deleted). An Ended row keeps the fact that it was ended: ended_at is
// recorded first (its last change when it has none — a row pulled while the cloud lacked the
// column), so Restore puts it back in Ended, never active (Gate B round 3 N3).
function softDeleteRow(db, id, nowIso = new Date().toISOString()) {
  db.runSync(
    `UPDATE protocols SET ended_at = COALESCE(ended_at, CASE WHEN active = 0 AND deleted_at IS NULL THEN updated_at END), active = 0, deleted_at = ?, restored_at = NULL, status_at = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
    [nowIso, nowIso, nowIso, id],
  );
}

// Restore from Recently deleted. A protocol that was ENDED before it was deleted goes back to
// Ended (never active: its stopped weeks must not become owed doses). A-89 (dt-council 2026-10-04):
// one deleted BEFORE today also goes to Ended, dated at the delete (the days it spent deleted are
// never owed; Restart makes it active and asks for the free limit). A same-day Restore is an undo:
// active when opts.allowActive (the screen checks the free limit), otherwise Ended.
// restored_at (local) marks the Restore until it is pushed: a revive keeps it restored.
// → 'ended' | 'active' | null (not found).
function restoreDeleted(db, id, nowIso = new Date().toISOString(), opts = {}) {
  const row = db.getFirstSync('SELECT ended_at, deleted_at, purged_at FROM protocols WHERE id = ?', [id]);
  // Only a row that is still deleted is restored: a second tap, or a pull that restored it meanwhile,
  // changes nothing (Gate B review of 3ff3cd6, finding 1).
  if (!row || !row.deleted_at || row.purged_at) return null;
  const sameDay = !!row.deleted_at && localDay(row.deleted_at) === localDay(nowIso);
  const allowActive = opts.allowActive !== false;
  const ended = !!row.ended_at || !sameDay || !allowActive;
  const endedAt = row.ended_at || (ended ? (row.deleted_at || nowIso) : null);
  db.runSync(
    `UPDATE protocols SET active = ?, ended_at = ?, deleted_at = NULL, restored_at = ?, status_at = ?, updated_at = ?, sync_status = 'pending' WHERE id = ? AND deleted_at IS NOT NULL`,
    [ended ? 0 : 1, endedAt, nowIso, nowIso, nowIso, id],
  );
  return ended ? 'ended' : 'active';
}

// The phone's local calendar day of an ISO time (a restore "today" is the user's today).
function localDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Restart = a NEW run (journey review F1/F3, 2026-10-03): re-activating the same row would turn
// every day between the end and the restart into owed doses (the scan's Missed rows, ring days,
// curve doses) and bring "Is this protocol finished?" straight back. The copy keeps every setting,
// starts today and is created now (so the scan, the rings and the prompt start from now); the
// ended row stays as the history of the first run. The new run gets a FULL vial of the same size,
// mixed today, 0 doses taken (founder 2026-10-06: a restart starts today with nothing taken — the
// carried-over vial showed the first run's mix date and count); the old vial stays with the ended
// run as its history. Returns the new protocol's id.
// DL-114 / DV-250: the new run copies an ALLOW-LIST of setting columns, never every column — a
// column-generic copy carried history_from and would carry any column added later (the planned end
// and the "Still going?" answer belong to the earlier run: a restarted run has no end date, founder
// 2026-10-15). Not copied: identity, status, dates of the run, units_taken (zero on a new run,
// council 3 F3), history_from, ends_on, still_going_at.
const RESTART_COPIED = ['user_id', 'name', 'compound_id', 'type', 'color', 'amount', 'unit', 'water', 'diluent', 'dose', 'dose_unit',
  'syringe_size', 'concentration', 'concentration_unit', 'frequency', 'reminder_time', 'interval_days', 'doses_per_day',
  'schedule_total', 'vial_valid_days', 'goal', 'notes', 'note', 'composition', 'serving_strength', 'serving_strength_unit',
  'serving_units', 'container_units', 'divisible'];
// Every other protocols column, decided on purpose (a test fails when a new column is in neither list).
const RESTART_EXCLUDED = ['id', 'remote_id', 'active', 'deleted_at', 'ended_at', 'purged_at', 'optional_pending', 'restored_at',
  'status_at', 'created_at', 'updated_at', 'sync_status', 'start_date', 'units_taken', 'history_from', 'ends_on', 'ends_on_changed',
  'still_going_at',
  'dt_seq', // A-119 Gate B round 2: the local change sequence (lib/changeSeq) — a new run gets its own
];
// sameContainer (founder 2026-10-07): "Continue the same vial/bottle" — the old vial moves to the new
// run unchanged and an oral run keeps its units taken; otherwise a full new vial mixed today.
function restartAsNew(db, id, { nowIso = new Date().toISOString(), todayKey, sameContainer = false } = {}) {
  const old = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [id]);
  if (!old) return null;
  const have = new Set(db.getAllSync('PRAGMA table_info(protocols)').map((c) => c.name));
  const cols = RESTART_COPIED.filter((c) => have.has(c)); // an older local schema may lack one
  const day = todayKey || nowIso.slice(0, 10);
  const all = [...cols, 'start_date', 'active', 'created_at', 'updated_at', 'sync_status', 'units_taken'];
  const values = [...cols.map((c) => old[c]), day, 1, nowIso, nowIso, 'pending', sameContainer ? (old.units_taken || 0) : 0];
  // All or nothing (council 3): a crash between the writes must not leave a run without its vial.
  db.execSync('BEGIN');
  try {
  const r = db.runSync(`INSERT INTO protocols (${all.join(', ')}) VALUES (${all.map(() => '?').join(', ')})`, values);
  const newId = r.lastInsertRowId;
  const vial = db.getFirstSync(`SELECT * FROM vials WHERE protocol_id = ? AND sync_status != 'deleted' ORDER BY created_at DESC LIMIT 1`, [id]);
  if (vial && sameContainer) {
    db.runSync(`UPDATE vials SET protocol_id = ?, protocol_remote_id = NULL, active = 1, updated_at = ?, sync_status = 'pending' WHERE id = ?`, [newId, nowIso, vial.id]);
  } else if (vial) {
    db.runSync(`UPDATE vials SET active = 0, updated_at = ?, sync_status = 'pending' WHERE protocol_id = ? AND active = 1`, [nowIso, id]);
    db.runSync(
      `INSERT INTO vials (user_id, protocol_id, protocol_remote_id, mixed_on, water_ml, total_doses, doses_taken, expires_on, active, created_at, updated_at, sync_status) VALUES (?, ?, NULL, ?, ?, ?, 0, ?, 1, ?, ?, 'pending')`,
      [vial.user_id, newId, vial.mixed_on ? day : null, vial.water_ml, vial.total_doses, null, nowIso, nowIso], // a new box: its expiry is entered by the user (council 3)
    );
  }
  db.execSync('COMMIT');
  return newId;
  } catch (e) {
    try { db.execSync('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  }
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

// Never destroy on a maybe (2026-10-03, docs/decisions.md): the automatic purge of soft-deleted
// protocols is PAUSED in 1.3.0. Protocols the old "Yes, it's finished" button soft-deleted cannot
// be told from deliberate deletes, and the cloud's dose_logs → protocols foreign key cascades on
// delete, so purging them would erase their doses. "Delete permanently" by hand still works.
// Revisit in the next build (registry).
const AUTO_PURGE_PAUSED = true;

// Recently deleted: every soft-deleted protocol while the purge is paused (an older one would
// vanish from the list yet stay on the phone, with no Restore and no Delete permanently);
// the last 7 days when purging again. → { sql, params } (the user id goes first).
function recentlyDeletedQuery(nowIso = new Date().toISOString(), { paused = AUTO_PURGE_PAUSED } = {}) {
  if (paused) {
    return { sql: `SELECT * FROM protocols WHERE user_id = ? AND active = 0 AND deleted_at IS NOT NULL AND purged_at IS NULL AND sync_status != 'deleted' ORDER BY deleted_at DESC`, params: [] };
  }
  const cutoff = new Date(Date.parse(nowIso) - 7 * 86400000).toISOString();
  return { sql: SQL_RECENTLY_DELETED, params: [cutoff] };
}

// The 7-day clean-up of DELETED protocols only (ended ones have no deleted_at). Paused in 1.3.0.
function purgeOldDeleted(db, userId, nowIso = new Date().toISOString(), { paused = AUTO_PURGE_PAUSED } = {}) {
  if (paused) return 0;
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

// ── A-121 "Still going?" with an end date, A-148 the answer kept in sync ─────────────────────────
// lib/schedule.js courseState (S-15) is the only READER of the planned end; this file is its only
// WRITER (setPlannedEnd, continueCourse) and the one End (endNow). Required lazily: schedule.js
// requires this file at load.
const sched = () => require('./schedule');
const DAY_MS = 86400000;

// Local-only marker (local_meta) that the next protocols pull starts from the beginning once.
const PULL_REWIND_KEY = 'pull_rewind:protocols';

// The columns, added on the first start of the version that has them. An update over an older
// version (the column is new here) asks for one protocols pull rewind (DL-117): that version pulled
// rows without the columns and moved its watermark past them. A fresh install has nothing to rewind.
// ends_on_changed is LOCAL only (Gate B 1, the A-87 status_at pattern): "the planned end was changed
// on this phone and not yet accepted by the cloud" — only then does a push carry ends_on.
function addPlannedEndColumns(db) {
  let added = false;
  const newCols = [];
  for (const col of ['ends_on TEXT', 'still_going_at TEXT', 'ends_on_changed TEXT']) {
    try { db.execSync(`ALTER TABLE protocols ADD COLUMN ${col};`); added = true; newCols.push(col.split(' ')[0]); } catch { /* already there */ }
  }
  // Round 3 R3: the marker added to a database that already had ends_on (an intermediate build): a
  // pending date was changed here and not yet accepted — marked, so it still goes up (as addStatusAtColumn).
  if (newCols.includes('ends_on_changed') && !newCols.includes('ends_on')) {
    try { db.runSync(`UPDATE protocols SET ends_on_changed = updated_at WHERE sync_status = 'pending' AND ends_on IS NOT NULL`); } catch { /* start-up never fails on it */ }
  }
  if (added) {
    try { db.runSync('INSERT OR REPLACE INTO local_meta (key, value) VALUES (?, ?)', [PULL_REWIND_KEY, 'pending']); } catch { /* no meta table: no rewind */ }
  }
  return added;
}

// Gate B 3 (A-149's trusted time): an answer later than a time known to have passed (+ an hour of
// clock slack) was written by a phone whose clock was ahead. It is not trusted: the check ignores it
// and a real answer replaces it, so a clock put back never locks "Still going?".
const TRUST_SLACK_MS = 3600000;
// The later of the device clock and the newest cloud stamp on a synced protocol or dose log (the
// cloud sets updated_at; a pending row's stamp is the device clock and proves nothing).
function dbTrustedNowMs(db, nowMs = Date.now()) {
  let t = nowMs;
  for (const table of ['protocols', 'dose_logs']) {
    try {
      const r = db.getFirstSync(`SELECT MAX(updated_at) AS u FROM ${table} WHERE sync_status = 'synced'`);
      const u = r && r.u ? Date.parse(r.u) : NaN;
      if (Number.isFinite(u) && u > t) t = u;
    } catch { /* old schema */ }
  }
  return t;
}
// May the "it continues" moment atIso replace prevIso? Never a moment from the future; a trusted
// later answer stays (the answer only moves forward); an untrusted (future) one is replaced.
function stillGoingMayWrite(prevIso, atIso, trustedNowMs) {
  const next = Date.parse(atIso);
  if (!Number.isFinite(next) || next > trustedNowMs + TRUST_SLACK_MS) return false;
  const prev = prevIso ? Date.parse(prevIso) : NaN;
  if (Number.isFinite(prev) && prev <= trustedNowMs + TRUST_SLACK_MS && prev >= next) return false;
  return true;
}

// S-33: is "Still going?" due for p? Never while a planned end is set (before, on and after it: the
// course-end question owns its day, SG-3 / DL-112), nor on and after a legacy total's last day, nor
// before the start. Otherwise today's rule: max(7, 3 × interval) days since the later of the last
// logged Taken dose (else creation, else start) and the last "it continues" answer (still_going_at,
// A-148 / DL-113) — an answer from the future (later than trustedNowMs) is not trusted (Gate B 3).
function inactivityDue(p, { lastTakenIso = null, now = new Date(), trustedNowMs = null } = {}) {
  if (!p) return false;
  const nowDate = new Date(now);
  const cs = sched().courseState(p, nowDate);
  if (cs.kind === 'planned') return false;
  if (cs.kind && !cs.before) return false;
  const nowMs = nowDate.getTime();
  const trusted = Number.isFinite(trustedNowMs) ? Math.max(trustedNowMs, nowMs) : nowMs;
  if (p.start_date && new Date(p.start_date + 'T00:00:00').getTime() > nowMs) return false;
  const thresholdDays = Math.max(7, (p.interval_days || 1) * 3);
  const refIso = lastTakenIso || p.created_at || p.start_date;
  let refMs = refIso ? new Date(refIso).getTime() : NaN;
  const answered = p.still_going_at ? Date.parse(p.still_going_at) : NaN;
  if (Number.isFinite(answered) && answered <= trusted + TRUST_SLACK_MS && (!Number.isFinite(refMs) || answered > refMs)) refMs = answered;
  if (!Number.isFinite(refMs)) return false;
  return (nowMs - refMs) / DAY_MS >= thresholdDays;
}

// The next protocol question Today asks, one at a time (SG-22 / SG-29): the course-end question
// first (on and after its day, once its last doses are answered, SG-17), then "Still going?".
// An answered protocol is no longer due (ended, a new end date, or the span restarted), so asking
// again after each answer goes through them one by one, each once.
// logs: dose_log rows of the last 90 days (any outcome). The trusted time is A-149's
// serverConfirmedNow over the synced rows. → { p, kind: 'course_end' | 'still_going' } | null
function nextTodayQuestion(protocols, logs, now = new Date()) {
  const list = (protocols || []).filter(Boolean);
  const all = logs || [];
  for (const p of list) {
    if (sched().courseEndAsk(p, now, all)) return { p, kind: 'course_end' };
  }
  const { serverConfirmedNow } = require('./missedDoses'); // lazy: missedDoses requires this file
  const trustedNowMs = serverConfirmedNow([...all, ...list], new Date(now).getTime());
  const lastTaken = {};
  for (const l of all) {
    if (!l || l.outcome !== 'Taken') continue;
    if (!lastTaken[l.protocol_id] || Date.parse(l.logged_at) > Date.parse(lastTaken[l.protocol_id])) lastTaken[l.protocol_id] = l.logged_at;
  }
  for (const p of list) {
    if (inactivityDue(p, { lastTakenIso: lastTaken[p.id] || null, now, trustedNowMs })) return { p, kind: 'still_going' };
  }
  return null;
}

function writeRow(db, id, sets, values, nowIso) {
  db.runSync(`UPDATE protocols SET ${sets}, updated_at = ?, sync_status = 'pending' WHERE id = ?`, [...values, nowIso, id]);
}

// "Continua" (A-148): the moment the person said the protocol continues, kept on the protocol and
// synced (never on the device only: it was wiped on sign-out). Only forward, never from the future
// (stillGoingMayWrite). opts.trustedNowMs: the trusted time (default: device clock + cloud stamps).
function markStillGoing(db, id, atIso = new Date().toISOString(), { trustedNowMs = null } = {}) {
  const row = db.getFirstSync('SELECT still_going_at FROM protocols WHERE id = ?', [id]);
  if (!row) return false;
  const trusted = Number.isFinite(trustedNowMs) ? trustedNowMs : dbTrustedNowMs(db);
  if (!stillGoingMayWrite(row.still_going_at, atIso, trusted)) return false;
  writeRow(db, id, 'still_going_at = ?', [atIso], new Date().toISOString());
  return true;
}
// The "it continues" moment a clear / Continuar writes: the tap, unless a trusted later answer exists.
function stillGoingAfter(db, row, nowIso) {
  return stillGoingMayWrite(row.still_going_at, nowIso, Math.max(dbTrustedNowMs(db), Date.parse(nowIso))) ? nowIso : row.still_going_at;
}

// Save, move or clear the planned end (SG-2, SG-6, SG-13). A day before the later of tomorrow and
// the start date (opts.startKey: a start being edited) is refused (false). A clear ("Sem data de
// fim") restarts the "Still going?" span at the tap, like "Continua" (DL-113). Content, not status:
// status_at is never set (A-87); ends_on_changed marks the change for the push (Gate B 1).
function setPlannedEnd(db, id, dayKey, { now = new Date(), startKey = null } = {}) {
  const nowDate = new Date(now);
  const nowIso = nowDate.toISOString();
  const row = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [id]);
  if (!row) return false;
  if (dayKey == null) {
    writeRow(db, id, 'ends_on = NULL, ends_on_changed = ?, still_going_at = ?', [nowIso, stillGoingAfter(db, row, nowIso)], nowIso);
    return true;
  }
  const S = sched();
  if (!S.isDayKey(dayKey) || dayKey < S.endDateRange(row, nowDate, { startKey }).minKey) return false;
  writeRow(db, id, 'ends_on = ?, ends_on_changed = ?', [dayKey, nowIso], nowIso);
  return true;
}

// "Continuar" on "Ciclo concluído": the end date and a legacy total go (AD-82, DL-112), and the
// "Still going?" span restarts at the tap (DL-113). Missed rows written meanwhile stay (DL-110).
function continueCourse(db, id, { now = new Date() } = {}) {
  const nowIso = new Date(now).toISOString();
  const row = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [id]);
  if (!row) return;
  writeRow(db, id, 'ends_on = NULL, ends_on_changed = ?, schedule_total = NULL, still_going_at = ?', [nowIso, stillGoingAfter(db, row, nowIso)], nowIso);
}

// The one End (SG-16): Ended (never deleted, history kept), vials deactivated, the app-written Missed
// rows after the end removed. Dated by opts.endIso when given ("Sim, terminou": the last logged dose,
// DL-87, through endAtLastDose), else by lib/schedule courseEndMoment — the tap, or for a course-end
// question answered after its day the end of that day / the last Taken dose (DL-110). The planned end
// stays on the row as history. The screen cancels its reminders (and on "Encerrar" clears delivered
// banners). A-85's "End protocol" and the vial "Protocol finished" do not exist yet (founder). → end
function endNow(db, id, { now = new Date(), endIso = null } = {}) {
  const nowDate = new Date(now);
  const nowIso = nowDate.toISOString();
  const row = db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [id]);
  if (!row) return null;
  let end = endIso;
  if (!end) {
    const last = db.getFirstSync(`SELECT MAX(logged_at) AS at FROM dose_logs WHERE protocol_id = ? AND outcome = 'Taken' AND sync_status != 'deleted'`, [id]);
    end = sched().courseEndMoment(row, nowDate, last && last.at);
  }
  db.runSync(
    `UPDATE protocols SET active = 0, ended_at = ?, deleted_at = NULL, status_at = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
    [end, nowIso, nowIso, id],
  );
  db.runSync(`UPDATE vials SET active = 0, updated_at = ?, sync_status = 'pending' WHERE protocol_id = ? AND active = 1`, [nowIso, id]);
  dropMissedAfter(db, id, end, nowIso);
  return end;
}

// Another phone ended a protocol (a pulled row became Ended): the app-written Missed rows this phone
// holds after that end go too, as on the phone that ended it (SG-27, DL-87 / DL-110). Taken /
// Skipped rows are never touched. Called by the sync merge (lib/syncCore).
function settlePulledEnd(db, localId, before, after) {
  if (!after || !isEnded(after) || !after.ended_at) return 0;
  if (before && isEnded(before) && before.ended_at === after.ended_at) return 0;
  return dropMissedAfter(db, localId, after.ended_at);
}

// SG-14 / DL-111: a start date (being saved) after the saved planned end. → { endKey } | null
function startAfterEnd(p, startKey) {
  const end = sched().courseState(p).plannedEnd;
  if (!end || typeof startKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startKey)) return null;
  return startKey > end ? { endKey: end } : null;
}

module.exports = {
  addPlannedEndColumns, PULL_REWIND_KEY, inactivityDue, nextTodayQuestion, markStillGoing, setPlannedEnd, continueCourse, endNow, settlePulledEnd, startAfterEnd, dropMissedAfter, RESTART_COPIED, RESTART_EXCLUDED, dbTrustedNowMs, stillGoingMayWrite,
  addStatusAtColumn, endAtLastDose, purgeProtocol, softDeleteRow, restoreDeleted, AUTO_PURGE_PAUSED, recentlyDeletedQuery, isEnded, endedAtMs, endProtocol, restartAsNew, reportProtocols, purgeOldDeleted, SQL_ACTIVE, SQL_ENDED, SQL_HISTORY, SQL_RECENTLY_DELETED, SQL_ALL_LOGS };
