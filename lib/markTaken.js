'use strict';
// The ONE mark-taken plan (S-02, FX-2/FX-7). Today's "Taken" button and the
// notification's "Mark as taken" both reach it through lib/doseActions.js
// recordDoseTaken, so the two paths can't drift apart again. Pure — no React
// Native/Expo imports — so it runs under plain Node's test runner.
//
// It only PLANS: the caller reads the rows and applies the plan.
//  - Never logs beyond that day's scheduled dose count (a dose already logged is
//    never logged twice, e.g. Today + a notification follow-up).
//  - An auto-Missed row for the slot is flipped to Taken, never duplicated.
//  - The active vial and the oral bottle move exactly once.
const { dosesPerVial } = require('./doseMath');
const { computeServings } = require('./oralMath');

const HOUR = 3600000;
const pad = (n) => (n < 10 ? '0' + n : '' + n);
const localKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The day a mark-taken is FOR: the reminder's day (a banner left from yesterday
// and tapped today logs yesterday's dose), never a future day; atNow forces today.
function markTakenDay({ dayKey, atNow = false, nowMs = Date.now() } = {}) {
  const todayKey = localKey(new Date(nowMs));
  const day = !atNow && /^\d{4}-\d{2}-\d{2}$/.test(dayKey || '') && dayKey <= todayKey ? dayKey : todayKey;
  const [y, m, d] = day.split('-').map(Number);
  return {
    dayKey: day,
    isToday: day === todayKey,
    dayStart: new Date(y, m - 1, d, 0, 0, 0, 0).getTime(),
    dayEnd: new Date(y, m - 1, d + 1, 0, 0, 0, 0).getTime(),
  };
}

// dayLogs: this protocol's rows (any outcome); rows outside the day are ignored.
// slotMs: the reminder slot's scheduled time, when known.
function planMarkTaken({ protocol, vial = null, todayLogs = [], dayKey, slotMs, atNow = false, nowMs = Date.now() }) {
  const day = markTakenDay({ dayKey, atNow, nowMs });
  const logs = (todayLogs || []).filter((l) => {
    if (l.protocol_id !== protocol.id) return false;
    const t = Date.parse(l.logged_at);
    return t >= day.dayStart && t < day.dayEnd;
  });
  const none = { dayKey: day.dayKey, insert: null, update: null, flipped: false, vialUpdate: null, vialFinished: false, prevVialDosesTaken: null, oralUpdate: null, prevUnitsTaken: null };

  const taken = logs.filter((l) => l.outcome === 'Taken').length;
  if (taken >= (protocol.doses_per_day || 1)) return { ...none, alreadyTaken: true };

  // Missed rows carry their scheduled time: flip the one closest to this slot,
  // else the day's earliest. A snoozed copy tapped late (atNow) never flips.
  const missedRows = atNow ? [] : logs.filter((l) => l.outcome === 'Missed');
  const missed = Number.isFinite(slotMs)
    ? [...missedRows].sort((p, q) => Math.abs(Date.parse(p.logged_at) - slotMs) - Math.abs(Date.parse(q.logged_at) - slotMs))[0]
    : [...missedRows].sort((p, q) => (p.logged_at < q.logged_at ? -1 : 1))[0];

  let insert = null;
  let update = null;
  if (missed) {
    update = { id: missed.id, outcome: 'Taken' };
  } else {
    const loggedAt = day.isToday
      ? nowMs
      : (Number.isFinite(slotMs) && slotMs >= day.dayStart && slotMs < day.dayEnd ? slotMs : day.dayStart + 12 * HOUR);
    insert = {
      user_id: protocol.user_id,
      protocol_id: protocol.id,
      protocol_remote_id: protocol.remote_id || null,
      outcome: 'Taken',
      logged_at: new Date(loggedAt).toISOString(),
    };
  }

  let vialUpdate = null;
  let vialFinished = false;
  let prevVialDosesTaken = null;
  if (vial) {
    prevVialDosesTaken = vial.doses_taken || 0;
    const newTaken = prevVialDosesTaken + 1;
    // Capacity: stored if known, else derived (older vials have null total_doses).
    const capacity = (vial.total_doses && vial.total_doses > 0)
      ? vial.total_doses
      : dosesPerVial({ amount: protocol.amount, unit: protocol.unit, dose: protocol.dose, doseUnit: protocol.dose_unit });
    vialFinished = !!(capacity && newTaken >= capacity);
    vialUpdate = vialFinished ? { id: vial.id, doses_taken: newTaken, active: 0 } : { id: vial.id, doses_taken: newTaken };
  }

  // Oral supply: subtract the calculated units-per-dose from the bottle.
  let oralUpdate = null;
  let prevUnitsTaken = null;
  if (protocol.type === 'oral' && protocol.container_units) {
    try {
      const r = computeServings({
        targetDose: protocol.dose, doseUnit: protocol.dose_unit,
        servingStrength: protocol.serving_strength, servingStrengthUnit: protocol.serving_strength_unit,
        servingUnits: protocol.serving_units, form: protocol.notes,
      });
      if (r.valid && r.unitsNeeded > 0) {
        prevUnitsTaken = protocol.units_taken || 0;
        oralUpdate = { units_taken: prevUnitsTaken + r.unitsNeeded };
      }
    } catch { /* supply update is best-effort */ }
  }

  // takenAfter: the day's Taken count once this write lands — callers use it
  // instead of a screen count that may be stale (e.g. the banner logged one).
  return { ...none, alreadyTaken: false, insert, update, flipped: !!missed, vialUpdate, vialFinished, prevVialDosesTaken, oralUpdate, prevUnitsTaken, takenAfter: taken + 1 };
}

module.exports = { planMarkTaken, markTakenDay };
