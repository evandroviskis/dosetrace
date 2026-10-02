'use strict';
// Delete a dose from the Dose log (founder 2026-10-02, option A: tap a dose, "Delete this
// dose", confirm). Pure plan, applied by screens/LogScreen.js. Supply goes back exactly as
// Today's Undo gives it back: through lib/markTaken.js planUndoTake (one dose back from what
// the vial / bottle counts NOW; a vial this dose finished is reopened unless another vial
// is active — never two).
//
// dose_logs keeps no vial link, so the vial is found the way recordDoseTaken attributed the
// dose: the protocol's vial that was current at the dose's time (the newest vial created at
// or before it). It is used only when that vial's count can hold every Taken dose logged
// while it was current; otherwise (doses logged after it ran out, a dose from before any
// vial such as a backfilled start, an unreadable date) nobody can tell which vial the dose
// came from, and the row is deleted without touching the supply (supply: 'none').
//
// Skipped rows never moved supply: the row only. Missed rows are not deleted here (the Dose
// log keeps its Mark taken / Mark skipped editor for them).
const { planUndoTake } = require('./markTaken');
const { dosesPerVial } = require('./doseMath');
const { computeServings } = require('./oralMath');

// ISO strings, and SQLite's datetime('now') default ("YYYY-MM-DD HH:MM:SS", UTC, no zone).
function tsMs(v) {
  if (v == null || v === '') return NaN;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return Date.parse(s.replace(' ', 'T') + 'Z');
  return Date.parse(s);
}

const isActive = (v) => v && (v.active === 1 || v.active === true || v.active === '1');

// The vial this Taken dose used, or null when it cannot be told safely.
// vials: the protocol's vials (any state); takenLogs: the user's dose rows (any protocol,
// any outcome — only this protocol's Taken rows are counted).
function vialForDose(log, vials = [], takenLogs = []) {
  if (!log) return null;
  const logMs = tsMs(log.logged_at);
  if (!Number.isFinite(logMs)) return null;
  const list = (vials || []).filter(Boolean).map((v) => ({ v, at: tsMs(v.created_at) }));
  if (!list.length || list.some((x) => !Number.isFinite(x.at))) return null;
  list.sort((a, b) => a.at - b.at);
  let idx = -1;
  for (let i = 0; i < list.length; i++) if (list[i].at <= logMs) idx = i;
  if (idx < 0) return null; // before any vial
  const cand = list[idx];
  const end = idx + 1 < list.length ? list[idx + 1].at : Infinity;
  const ids = new Set();
  let count = 0;
  for (const l of [log, ...(takenLogs || [])]) {
    if (!l || l.outcome !== 'Taken' || String(l.protocol_id) !== String(log.protocol_id)) continue;
    const key = l.id != null ? String(l.id) : null;
    if (key != null) { if (ids.has(key)) continue; ids.add(key); }
    const t = tsMs(l.logged_at);
    if (Number.isFinite(t) && t >= cand.at && t < end) count += 1;
  }
  const counted = Number(cand.v.doses_taken) || 0;
  if (counted <= 0 || count > counted) return null;
  return cand.v;
}

// The vial ran out by doses (not put away by the user): only then may a delete reopen it.
function finishedByDoses(vial, protocol) {
  const capacity = (vial.total_doses && vial.total_doses > 0)
    ? vial.total_doses
    : dosesPerVial({ amount: protocol.amount, unit: protocol.unit, dose: protocol.dose, doseUnit: protocol.dose_unit });
  return !!(capacity && (Number(vial.doses_taken) || 0) >= capacity);
}

// The units one dose takes from the bottle — the same calculation planMarkTaken used.
function oralUnitsPerDose(protocol) {
  if (protocol.type !== 'oral' || !protocol.container_units) return null;
  try {
    const r = computeServings({
      targetDose: protocol.dose, doseUnit: protocol.dose_unit,
      servingStrength: protocol.serving_strength, servingStrengthUnit: protocol.serving_strength_unit,
      servingUnits: protocol.serving_units, form: protocol.notes,
    });
    return r.valid && r.unitsNeeded > 0 ? r.unitsNeeded : null;
  } catch { return null; }
}

// log: the Dose log row; ctx.protocol: its protocol row (null when gone); ctx.vials: that
// protocol's vials; ctx.takenLogs: the user's dose rows.
// Returns { deleteIds, vialRestore: { id, doses_taken, active? } | null,
// oralRestore: { protocolId, units_taken } | null, supply: 'vial' | 'bottle' | 'none' }.
function planDeleteDose(log, { protocol = null, vials = [], takenLogs = [] } = {}) {
  const none = { deleteIds: [], vialRestore: null, oralRestore: null, supply: 'none' };
  if (!log || log.id == null || (log.outcome !== 'Taken' && log.outcome !== 'Skipped')) return none;
  const rowOnly = { ...none, deleteIds: [log.id] };
  if (log.outcome !== 'Taken' || !protocol) return rowOnly;

  const vial = vialForDose(log, vials, takenLogs);
  const otherActiveVial = !!(vial && (vials || []).some((v) => v && v.id !== vial.id && isActive(v)));
  const unitsNow = Number(protocol.units_taken) || 0;
  let units = oralUnitsPerDose(protocol);
  if (units != null && unitsNow < units) units = null; // the bottle never counted this dose

  // The same record Today's Undo builds from a take (TodayScreen applyUndo), for this row.
  const undo = planUndoTake({
    logId: log.id, flipped: false, protocolId: protocol.id, pending: true, extraDeleteIds: [],
    vialId: vial ? vial.id : null, prevDosesTaken: null,
    oralPrevUnitsTaken: units != null ? unitsNow - units : null, oralUnitsAdded: units,
  }, { vialNow: vial, otherActiveVial, unitsNow });

  let vialRestore = undo.vialRestore;
  if (vialRestore && vialRestore.active === 1 && !finishedByDoses(vial, protocol)) {
    const { active, ...rest } = vialRestore; // eslint-disable-line no-unused-vars
    vialRestore = rest;
  }
  const oralRestore = undo.oralRestore;
  return {
    deleteIds: undo.deleteIds,
    vialRestore,
    oralRestore,
    supply: vialRestore ? 'vial' : oralRestore ? 'bottle' : 'none',
  };
}

// The dose sheet's "When" (founder 2026-10-02): 'today' / 'yesterday' / 'weekday' (2 to 6
// local days back, the weekday is unambiguous) / 'date' (older, or unreadable). Local days.
function doseDayKind(loggedAt, nowMs = Date.now()) {
  const ms = tsMs(loggedAt);
  if (!Number.isFinite(ms)) return 'date';
  const d = new Date(ms);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n = new Date(nowMs);
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  const diff = Math.round((today - day) / 86400000); // Math.round: 23 h / 25 h DST days
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff >= 2 && diff <= 6) return 'weekday';
  return 'date';
}

// Rows deleted from the Dose log this session: Today's Undo bar / dose-page Undo of the
// same row must never run after it (it would give the dose back a second time, or write
// the deleted row back as Missed / Skipped).
const _deleted = new Set();
function rememberDeleted(id) { if (id != null) _deleted.add(String(id)); }
function wasDeleted(id) { return id != null && _deleted.has(String(id)); }

module.exports = { planDeleteDose, vialForDose, tsMs, doseDayKind, rememberDeleted, wasDeleted };
