'use strict';
// S-26 BK-16 (docs/specs/book-layout.md, founder decision 4): what the dose page on Today's
// right page shows for ONE dose slot, and which existing write it may use. Pure CommonJS
// (no React Native imports), tested in __tests__/dosePageState.test.js.
//
// A dose on the page is one slot: its protocol, its day (dayKey "YYYY-MM-DD", local) and its
// scheduled time (slotMs; null for a protocol without a reminder time, then its index ti).
// A twice-daily protocol has two slots a day, so 08:00 and 20:00 are two different items.
//
// Which row belongs to which slot (the day's rows of this protocol, any outcome):
//  1. a row written AT a slot's time (a flipped Missed row, yesterday's pending write or
//     skip, the Missed scan) belongs to that slot;
//  2. the other rows (written at the tap time: Today's Mark taken / Skip, a notification)
//     fill the remaining slots in the order they were written, earliest slot first. Today
//     writes "the next dose" at the tap time, so this is exactly where its write lands.
//
// What the page may do:
//  - logged (Taken / Skipped): show the state; Undo (when Today holds the undo record of
//    that row); a Taken slot never offers a second Mark taken. A slot skipped TODAY also
//    offers Mark taken, which turns that very Skipped row into Taken (A-78, write.flipRowId);
//  - every 'today' write names its slot (slotMs, ti) so Today's write lands on it (A-78);
//  - today, due (≤ 5 min to go, or past) and the EARLIEST open slot: Mark taken / Skip
//    through Today's path (write.path 'today'). A later due slot waits (waitsFor) — Today's
//    write would land on the earlier open slot;
//  - today, upcoming (more than 5 min to go) or a later day: info only;
//  - yesterday, still in Today's "Pending from yesterday" list: Mark taken / Skip through
//    the pending path (write.path 'pending', at yesterday's slot);
//  - yesterday, not pending and not logged: 'missed' (the Missed scan / Dose log own it).
const { sortedDoseTimes, expectedDosesOn } = require('./schedule');
const { pendingFromYesterday } = require('./pendingYesterday');

const SAME_SLOT_MS = 60 * 1000; // rows written for a slot sit at its exact time (lib/markTaken.js)
const DUE_AHEAD_MS = 5 * 60 * 1000; // the Today card's Due tag (isDoseDue)
const pad = (n) => (n < 10 ? '0' + n : '' + n);
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function dayBounds(dayKey) {
  const [y, m, d] = String(dayKey).split('-').map(Number);
  return { start: new Date(y, m - 1, d, 0, 0, 0, 0), end: new Date(y, m - 1, d + 1, 0, 0, 0, 0) };
}

// The slots of a day, as the Today card counts them: doses_per_day times, minus the slots
// before creation on the creation day (expectedDosesOn), earliest first.
function daySlots({ protocol, dayKey }) {
  const p = protocol || {};
  const { start } = dayBounds(dayKey);
  const dpd = p.doses_per_day || 1;
  const expected = expectedDosesOn(p, start);
  if (!expected) return [];
  const times = sortedDoseTimes(p).slice(0, dpd);
  const out = [];
  for (let ti = Math.max(0, dpd - expected); ti < dpd; ti++) {
    const t24 = times[ti];
    let slotMs = null;
    if (t24) {
      const [h, m] = t24.split(':').map(Number);
      slotMs = new Date(start.getFullYear(), start.getMonth(), start.getDate(), h, m, 0, 0).getTime();
    }
    out.push({ ti, slotMs });
  }
  return out;
}

// Each slot with the row that covers it (or null), per the two rules above.
function assignRows(protocol, logs, dayKey) {
  const slots = daySlots({ protocol, dayKey });
  const { start, end } = dayBounds(dayKey);
  const rows = (logs || [])
    .filter((l) => l && l.protocol_id === protocol.id)
    .map((l) => ({ l, t: Date.parse(l.logged_at) }))
    .filter((r) => Number.isFinite(r.t) && r.t >= start.getTime() && r.t < end.getTime());
  const used = new Set();
  const byTi = new Map();
  for (const s of slots) {
    if (s.slotMs == null) continue;
    const hit = rows.find((r) => !used.has(r) && Math.abs(r.t - s.slotMs) < SAME_SLOT_MS);
    if (hit) { used.add(hit); byTi.set(s.ti, hit.l); }
  }
  const rest = rows.filter((r) => !used.has(r)).sort((a, b) => a.t - b.t || (a.l.id || 0) - (b.l.id || 0));
  for (const s of slots) {
    if (byTi.has(s.ti)) continue;
    const r = rest.shift();
    if (!r) break;
    byTi.set(s.ti, r.l);
  }
  return slots.map((s) => ({ ...s, row: byTi.get(s.ti) || null }));
}

function findSlot(list, slotMs, ti) {
  if (Number.isFinite(slotMs)) return list.find((s) => s.slotMs === slotMs) || null;
  if (Number.isFinite(ti)) return list.find((s) => s.ti === ti && s.slotMs == null) || null;
  return null;
}

// The right-page item key of one slot.
function dosePageKey(protocolId, dayKey, slotMs, ti = null) {
  return `dose:${protocolId}:${dayKey}:${Number.isFinite(slotMs) ? slotMs : `i${ti}`}`;
}

// protocol, logs (rows of yesterday and today at least), dayKey + slotMs (or ti), nowMs.
// pending: Today's "Pending from yesterday" list (lib/pendingYesterday.js, with its
// time-zone guard); without it the list is computed from the logs.
function planDosePage({ protocol, logs = [], dayKey, slotMs = null, ti = null, nowMs = Date.now(), pending = null }) {
  const base = { kind: 'none', canTake: false, canSkip: false, canUndo: false, dayKey, slotMs, ti, logId: null, outcome: null, write: null, waitsFor: null };
  if (!protocol || !dayKey) return base;
  const list = assignRows(protocol, logs, dayKey);
  const slot = findSlot(list, slotMs, ti);
  if (!slot) return base;
  const out = { ...base, slotMs: slot.slotMs, ti: slot.ti };

  const todayKey = keyOf(new Date(nowMs));
  if (slot.row) {
    const outcome = slot.row.outcome;
    const kind = outcome === 'Taken' ? 'taken' : outcome === 'Skipped' ? 'skipped' : 'missed';
    const logged = { ...out, kind, outcome, logId: slot.row.id != null ? slot.row.id : null, canUndo: kind !== 'missed' };
    // A-78 (amends BK-16, founder 2026-10-01): a slot skipped TODAY can still be logged —
    // Mark taken turns that very row into Taken (flipRowId), as the card's skipped line.
    if (kind === 'skipped' && dayKey === todayKey && takenOn(list, logs, protocol, dayKey) < list.length) {
      return { ...logged, canTake: true, write: { path: 'today', dayKey, slotMs: slot.slotMs, flipRowId: logged.logId, ti: slot.ti } };
    }
    return logged;
  }

  if (dayKey > todayKey) return { ...out, kind: 'upcoming' };
  if (dayKey === todayKey) {
    if (slot.slotMs != null && slot.slotMs - nowMs > DUE_AHEAD_MS) return { ...out, kind: 'upcoming' };
    const first = list.find((s) => !s.row);
    if (first !== slot) return { ...out, kind: 'due', waitsFor: first.slotMs != null ? first.slotMs : first.ti };
    return { ...out, kind: 'due', canTake: true, canSkip: true, write: { path: 'today', dayKey, slotMs: slot.slotMs, flipRowId: null, ti: slot.ti } };
  }

  // A past day: only yesterday's pending slots can still be written (A-40).
  const pend = Array.isArray(pending)
    ? pending
    : pendingFromYesterday({ protocols: [protocol], logs, nowMs });
  const isPending = slot.slotMs != null && pend.some((x) => x && x.protocolId === protocol.id && x.dayKey === dayKey && x.slotMs === slot.slotMs);
  if (isPending) return { ...out, kind: 'pending', canTake: true, canSkip: true, write: { path: 'pending', dayKey, slotMs: slot.slotMs } };
  return { ...out, kind: 'missed' };
}

// The day's Taken rows of this protocol (every one, also a row no slot claimed), never fewer
// than the slots holding a Taken row.
function takenOn(list, logs, protocol, dayKey) {
  const { start, end } = dayBounds(dayKey);
  const n = (logs || []).filter((l) => l && l.protocol_id === protocol.id && l.outcome === 'Taken'
    && Date.parse(l.logged_at) >= start.getTime() && Date.parse(l.logged_at) < end.getTime()).length;
  return Math.max(n, list.filter((s) => s.row && s.row.outcome === 'Taken').length);
}

// A-78 (founder 2026-10-01): what today's dose card offers. Skipped counts as filled, so:
//  - next: the earliest OPEN slot (no row, or an auto-Missed row it may flip) — the card's
//    time label, its Due tag and its main Mark taken / Skip are for this slot; null when
//    every slot of today is Taken or Skipped (then the card has no main buttons);
//  - due: next is ≤ 5 min away or past (the Due tag, as isDoseDue);
//  - skipped: each slot of today holding a Skipped row, with that row's id (flipRowId) — its
//    "Skipped — you can still log it" line logs exactly that row. canTake is false once the
//    day already holds as many Taken doses as it expects (a stray legacy row).
// Rows are matched to slots as on the dose page (assignRows), so a legacy Skipped row
// written at the tap time before this fix still lands on its slot and stays loggable.
function cardPlan({ protocol, logs = [], nowMs = Date.now() }) {
  const dayKey = keyOf(new Date(nowMs));
  const list = protocol ? assignRows(protocol, logs, dayKey) : [];
  const taken = list.length ? takenOn(list, logs, protocol, dayKey) : 0;
  const open = list.find((s) => !s.row || s.row.outcome === 'Missed') || null;
  const next = open
    ? { dayKey, slotMs: open.slotMs, ti: open.ti, flipRowId: open.row && open.row.id != null ? open.row.id : null }
    : null;
  const due = !!(next && next.slotMs != null && next.slotMs - nowMs <= DUE_AHEAD_MS);
  const skipped = list
    .filter((s) => s.row && s.row.outcome === 'Skipped')
    .map((s) => ({ dayKey, slotMs: s.slotMs, ti: s.ti, flipRowId: s.row.id != null ? s.row.id : null, canTake: s.row.id != null && taken < list.length }));
  return { dayKey, slots: list, next, due, skipped, taken, allFilled: list.length > 0 && !next };
}

// The slot a tap on today's dose card opens: the earliest open slot of today, else the last
// one (it shows its logged state). null when today has no slot for this protocol.
function cardSlot({ protocol, logs = [], nowMs = Date.now() }) {
  const dayKey = keyOf(new Date(nowMs));
  const list = assignRows(protocol, logs, dayKey);
  if (!list.length) return null;
  const s = list.find((x) => !x.row) || list[list.length - 1];
  return { dayKey, slotMs: s.slotMs, ti: s.ti };
}

module.exports = { daySlots, planDosePage, cardSlot, cardPlan, dosePageKey };
