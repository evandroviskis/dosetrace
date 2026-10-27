'use strict';
// AD-95 / F2 (founder 2026-10-26, picture docs/design/f2-dose-time-edit.html): what the Dose log's
// dose sheet lets the person correct on a Taken dose — its time (the curve follows it, never later than
// now) and, for an injectable, its own amount (only this dose; the curve changes from it on). Pure.
const { parseDecimal } = require('./doseMath');
const { vialForDose } = require('./deleteDose');
const { stampForTaken, sameMass } = require('./doseStamp');
const { vialTotalAfterOneDoseEdit } = require('./protocolForm');

const INJECTABLE = ['recon', 'rtu'];
const GRACE_MS = 60 * 1000;

const canEditTime = (log) => !!log && log.outcome === 'Taken';
// An oral dose counts capsules (its supply), not the curve: its amount is the protocol's.
const canEditDose = (log) => canEditTime(log) && INJECTABLE.includes(log.protocols && log.protocols.type);

// 'future' when the chosen moment is later than now (the minute being edited is fine), else null.
function checkEditedTime(ms, nowMs) {
  if (!Number.isFinite(ms)) return 'invalid';
  return ms > nowMs + GRACE_MS ? 'future' : null;
}

// The day of dateMs at the hour and minute of timeMs (local time, seconds dropped).
function combineDateTime(dateMs, timeMs) {
  const d = new Date(dateMs);
  const t = new Date(timeMs);
  d.setHours(t.getHours(), t.getMinutes(), 0, 0);
  return d.getTime();
}

// The typed amount in the app language ("0,5" in Portuguese), above zero.
function parseDoseEdit(text, language) {
  const n = parseDecimal(String(text || '').trim(), language);
  return Number.isFinite(n) && n > 0 ? { amount: n } : { error: 'invalid' };
}

// The unit a corrected amount is saved in: the row's own, else its protocol's (review 5: a row with no
// unit was saved as NULL, read as mg — a mcg protocol weighed 1000x).
const unitForDoseEdit = (log) => (log && (log.dose_unit || log.protocol_dose_unit)) || null;

// AD-95 F3 / DL-15 (council 2026-10-27, by logic): "Alterar dose" on one Taken dose moves the vial it came
// from by the difference — only the active vial (a finished or put-away vial is history). The old amount is
// the row's stamp, else the dose in force at its time. next: { amount, unit }. ctx: { protocol, vials,
// takenLogs } (lib/deleteDose vialForDose). → { id, total_doses } to write, or null (nothing moves).
function vialAfterOneDoseEdit(log, next, { protocol = null, vials = [], takenLogs = [] } = {}) {
  if (!log || log.outcome !== 'Taken' || !protocol || !next) return null;
  const vial = vialForDose(log, vials, takenLogs);
  if (!vial || !(vial.active === 1 || vial.active === true || vial.active === '1')) return null;
  const stamp = log.dose_amount != null
    ? { dose_amount: Number(log.dose_amount), dose_unit: unitForDoseEdit(log) || protocol.dose_unit }
    : stampForTaken(protocol, Date.parse(log.logged_at));
  if (!stamp) return null;
  const newUnit = next.unit || stamp.dose_unit;
  if (sameMass(stamp.dose_amount, stamp.dose_unit, next.amount, newUnit)) return null;
  const total = vialTotalAfterOneDoseEdit({
    total: vial.total_doses, taken: vial.doses_taken, dose: protocol.dose, doseUnit: protocol.dose_unit,
    oldAmount: stamp.dose_amount, oldUnit: stamp.dose_unit, newAmount: next.amount, newUnit,
  });
  if (total == null || total === Number(vial.total_doses)) return null;
  return { id: vial.id, total_doses: total };
}

module.exports = { canEditTime, canEditDose, checkEditedTime, combineDateTime, parseDoseEdit, unitForDoseEdit, vialAfterOneDoseEdit };
