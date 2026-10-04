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
const { expectedDosesOn } = require('./schedule');

const HOUR = 3600000;
const SAME_SLOT_MS = 60 * 1000; // rows written for a slot sit at its exact time
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
// injectionSite (S-25): the site the user just chose, written in the SAME write as the
// dose (insert or the flipped Missed row); absent = no site (Skip, or an oral dose).
// flipRowId (A-78): the Skipped / Missed row this tap logs (Today's "Skipped — you can still
// log it" line, the dose page of a skipped slot). That exact row of this protocol and day is
// turned into Taken; when it is already Taken the dose is logged (never a second row); when
// it is not found the existing slot rules apply.
function planMarkTaken({ protocol, vial = null, todayLogs = [], dayKey, slotMs, atNow = false, nowMs = Date.now(), injectionSite = null, flipRowId = null }) {
  const day = markTakenDay({ dayKey, atNow, nowMs });
  const logs = (todayLogs || []).filter((l) => {
    if (l.protocol_id !== protocol.id) return false;
    const t = Date.parse(l.logged_at);
    return t >= day.dayStart && t < day.dayEnd;
  });
  const none = { dayKey: day.dayKey, insert: null, update: null, flipped: false, vialUpdate: null, vialFinished: false, prevVialDosesTaken: null, oralUpdate: null, prevUnitsTaken: null };

  const taken = logs.filter((l) => l.outcome === 'Taken').length;
  if (taken >= (protocol.doses_per_day || 1)) return { ...none, alreadyTaken: true };

  // A-78: the caller names the row (slot identity, no guessing).
  let named = null;
  if (flipRowId != null && !atNow) {
    const row = logs.find((l) => l.id != null && String(l.id) === String(flipRowId));
    if (row && row.outcome === 'Taken') return { ...none, alreadyTaken: true };
    if (row && (row.outcome === 'Skipped' || row.outcome === 'Missed')) named = row;
  }

  // Missed rows carry their scheduled time: flip the one closest to this slot,
  // else the day's earliest. A snoozed copy tapped late (atNow) never flips.
  // A-78: a Skipped row at THIS slot is flipped the same way (logging a dose the user
  // skipped turns that row into Taken). Without a slot it is never touched: guessing
  // turned a morning skip into the evening dose (council 2026-10-01).
  // Without a slot, a Skipped row may flip only when every slot of the day is already
  // filled (taken + skipped >= the doses expected THAT day — the creation day may expect
  // fewer than doses_per_day): then this dose can only be the skipped one.
  const skippedCount = logs.filter((l) => l.outcome === 'Skipped').length;
  const expectedThatDay = Math.max(1, expectedDosesOn(protocol, new Date(day.dayStart)));
  const allSlotsFilled = taken + skippedCount >= expectedThatDay;
  const skipFlips = Number.isFinite(slotMs) || allSlotsFilled;
  const missedRows = atNow ? [] : logs.filter((l) => l.outcome === 'Missed' || (skipFlips && l.outcome === 'Skipped'));
  // With a slot, only the Missed row AT that slot (the scan writes it at the exact
  // scheduled time) may be flipped — never another slot's Missed row that day
  // (A-40 journey review: 08:00 Missed must stay Missed when 20:00 is logged).
  const missed = named || (Number.isFinite(slotMs)
    ? missedRows.find((l) => Math.abs(Date.parse(l.logged_at) - slotMs) < SAME_SLOT_MS)
    : [...missedRows].sort((p, q) => (p.logged_at < q.logged_at ? -1 : 1))[0]);

  let insert = null;
  let update = null;
  let flippedFrom = null;
  let prevLoggedAt = null;
  let prevInjectionSite = null;
  if (missed) {
    // A Skipped row logged today takes the TAP time (S-25: a Taken dose's time is the tap of
    // Mark taken); a Missed row (and a past day's row) keeps its scheduled time. Undo puts
    // the old time and site back (prevLoggedAt / prevInjectionSite).
    const tapTime = missed.outcome === 'Skipped' && day.isToday;
    update = {
      id: missed.id, outcome: 'Taken',
      ...(tapTime ? { logged_at: new Date(nowMs).toISOString() } : {}),
      ...(injectionSite ? { injection_site: injectionSite } : {}),
    };
    flippedFrom = missed.outcome;
    prevLoggedAt = missed.logged_at || null;
    prevInjectionSite = missed.injection_site || null;
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
      ...(injectionSite ? { injection_site: injectionSite } : {}),
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
  return { ...none, alreadyTaken: false, insert, update, flipped: !!missed, flippedFrom, prevLoggedAt, prevInjectionSite, vialUpdate, vialFinished, prevVialDosesTaken, oralUpdate, prevUnitsTaken, takenAfter: taken + 1 };
}

// A-40 (S-17): "ignore yesterday's" from the Pending-from-yesterday block / prompt.
// Writes ONE Skipped row at that slot's scheduled time (never the tap time, never
// through Today's tap-time skip path), and nothing when that slot already has a row
// of any outcome (never twice — rows written for a slot sit at its exact time).
// A skip never moves supply.
function planSkipPending({ protocol, todayLogs = [], dayKey, slotMs, nowMs = Date.now() }) {
  const day = markTakenDay({ dayKey, nowMs });
  const none = { dayKey: day.dayKey, insert: null, vialUpdate: null, oralUpdate: null };
  if (!Number.isFinite(slotMs) || slotMs < day.dayStart || slotMs >= day.dayEnd || slotMs > nowMs) return none;
  const taken = (todayLogs || []).some((l) => l.protocol_id === protocol.id
    && Math.abs(Date.parse(l.logged_at) - slotMs) < SAME_SLOT_MS);
  if (taken) return none;
  return {
    ...none,
    insert: {
      user_id: protocol.user_id,
      protocol_id: protocol.id,
      protocol_remote_id: protocol.remote_id || null,
      outcome: 'Skipped',
      logged_at: new Date(slotMs).toISOString(),
    },
  };
}

// A-78 (founder 2026-10-01): Skip on a Today card. The Skipped row is stamped at the
// scheduled time of the slot it skips (the card's earliest open slot), exactly as
// planSkipPending does for yesterday — never the tap time, so a later Mark taken can name
// that slot. A protocol without reminder times has no slot time: the tap time is used.
// Nothing is written when that slot already has a row of any outcome. A skip never moves
// supply.
function planSkipToday({ protocol, todayLogs = [], slotMs = null, nowMs = Date.now() }) {
  const day = markTakenDay({ nowMs });
  const none = { dayKey: day.dayKey, insert: null, vialUpdate: null, oralUpdate: null };
  const hasSlot = Number.isFinite(slotMs) && slotMs >= day.dayStart && slotMs < day.dayEnd;
  if (hasSlot && (todayLogs || []).some((l) => l.protocol_id === protocol.id
    && Math.abs(Date.parse(l.logged_at) - slotMs) < SAME_SLOT_MS)) return none;
  return {
    ...none,
    insert: {
      user_id: protocol.user_id,
      protocol_id: protocol.id,
      protocol_remote_id: protocol.remote_id || null,
      outcome: 'Skipped',
      logged_at: new Date(hasSlot ? slotMs : nowMs).toISOString(),
    },
  };
}

// Where a notification "Mark taken" logs (founder 2026-09-28): the slot the
// reminder was for while now < slot + 12 h (the Missed scan's window) — also for a
// snoozed copy tapped after midnight. A snoozed copy tapped later than that is
// logged now (honestly late). A banner without a slot keeps its day.
const LATE_WINDOW_MS = 12 * HOUR; // mirror of lib/missedDoses.js LATE_MS
function notificationTakeTarget({ dayKey, slotMs, snoozed = false, nowMs = Date.now() }) {
  if (Number.isFinite(slotMs) && nowMs - slotMs < LATE_WINDOW_MS) return { dayKey, slotMs };
  if (snoozed) return { atNow: true };
  return { dayKey, slotMs };
}

// Undo of a Taken / Skipped written from Today (S-02, A-40). Pure plan applied by
// TodayScreen undoTake:
//  - a flipped auto-Missed row goes back to Missed (never deleted), else the row is deleted;
//  - extraDeleteIds (the Skipped row of "today's dose — skip yesterday") are deleted too;
//  - todayCount: "none" for a pending-from-yesterday row (it never changed today's
//    cards), "reset" when today's count bump has not landed yet (the pressed button
//    still shows Taken), else "decrement";
//  - the vial / oral bottle go back to the counts saved before the take.
function planUndoTake(undoData = {}, { vialNow = null, otherActiveVial = false, unitsNow = null } = {}) {
  const u = undoData || {};
  const fx = u.fx || null;
  const deleteIds = [...(u.flipped ? [] : [u.logId]), ...(u.extraDeleteIds || [])].filter((id) => id != null);

  // Supply goes back by ONE dose from what it is NOW (S-20): with Cancel = undo in
  // the site picker there is no 5 s limit, so another dose may have moved the same
  // vial / bottle meanwhile and a saved snapshot would erase it. A vial this dose
  // closed is reopened — unless a newer vial is already active (never two).
  // Without the current row (older callers) the saved snapshot is used.
  let vialRestore = null;
  if (u.vialId && vialNow) {
    vialRestore = { id: u.vialId, doses_taken: Math.max((vialNow.doses_taken || 0) - 1, 0) };
    if (vialNow.active === 0 && !otherActiveVial) vialRestore.active = 1;
  } else if (u.vialId && u.prevDosesTaken != null) {
    vialRestore = { id: u.vialId, doses_taken: u.prevDosesTaken, active: 1 };
  }
  let oralRestore = null;
  if (u.oralPrevUnitsTaken != null) {
    const units = unitsNow != null && u.oralUnitsAdded != null ? Math.max(unitsNow - u.oralUnitsAdded, 0) : u.oralPrevUnitsTaken;
    oralRestore = { protocolId: u.protocolId, units_taken: units };
  }
  return {
    restoreMissedId: u.flipped ? u.logId : null,
    restoreOutcome: u.flippedFrom === 'Skipped' ? 'Skipped' : 'Missed', // A-78
    // A-78: a flipped row gets back its own time and site (older records: time unchanged, no site).
    restoreLoggedAt: u.flipped && u.prevLoggedAt ? u.prevLoggedAt : null,
    restoreSite: u.flipped && u.prevInjectionSite ? u.prevInjectionSite : null,
    deleteIds,
    todayCount: u.pending ? 'none' : (!fx || fx.applied ? 'decrement' : 'reset'),
    vialRestore,
    oralRestore,
    closeVialPrompt: !!u.vialFinished, // the "start a new vial?" prompt of the undone dose
  };
}

// A-38 (b): why a Mark taken tap wrote nothing, for Today's sheet (string keys). The protocol
// no longer active (ended, deleted, gone) wins over "already logged". null = nothing refused.
function takeRefusal({ protocol, alreadyLogged }) {
  const inactive = !protocol || protocol.active === 0 || protocol.active === false || !!protocol.deleted_at || protocol.sync_status === 'deleted';
  if (inactive) return { reason: 'inactive', title: 'notif_taken_nothing_title', body: 'today_take_inactive_body' };
  if (alreadyLogged) return { reason: 'already', title: 'notif_taken_nothing_title', body: 'today_take_logged_body' };
  return null;
}

module.exports = { takeRefusal, planMarkTaken, markTakenDay, planSkipPending, planSkipToday, notificationTakeTarget, planUndoTake };
