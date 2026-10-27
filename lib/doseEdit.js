'use strict';
// AD-95 / F2 (founder 2026-10-26, picture docs/design/f2-dose-time-edit.html): what the Dose log's
// dose sheet lets the person correct on a Taken dose — its time (the curve follows it, never later than
// now) and, for an injectable, its own amount (only this dose; the curve changes from it on). Pure.
const { parseDecimal } = require('./doseMath');

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

module.exports = { canEditTime, canEditDose, checkEditedTime, combineDateTime, parseDoseEdit };
