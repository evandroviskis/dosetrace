'use strict';
// S-26 BK-16 (docs/specs/book-layout.md, founder decision 4): the dose slots of a day, as Today's
// card and the right page of an unfolded foldable read them. Pure CommonJS (no React Native
// imports), tested in __tests__/dosePageState.test.js. (A-115 replaced the old dose page with the
// protocol's own page; its planner went with it — rebuild = replace.)
//
// A dose is one slot: its protocol, its day (dayKey "YYYY-MM-DD", local) and its scheduled time
// (slotMs; null for a protocol without a reminder time, then its index ti). A twice-daily
// protocol has two slots a day, so 08:00 and 20:00 are two different items (dosePageKey).
//
// Which row belongs to which slot (the day's rows of this protocol, any outcome):
//  1. a row written AT a slot's time (a flipped Missed row, yesterday's pending write or
//     skip, the Missed scan) belongs to that slot;
//  2. the other rows (written at the tap time: Today's Mark taken / Skip, a notification)
//     fill the remaining slots in the order they were written, earliest slot first. Today
//     writes "the next dose" at the tap time, so this is exactly where its write lands.
const { sortedDoseTimes, expectedDosesOn } = require('./schedule');

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

// The right-page item key of one slot.
function dosePageKey(protocolId, dayKey, slotMs, ti = null) {
  return `dose:${protocolId}:${dayKey}:${Number.isFinite(slotMs) ? slotMs : `i${ti}`}`;
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
// Rows are matched to slots by assignRows, so a legacy Skipped row
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

module.exports = { daySlots, cardSlot, cardPlan, dosePageKey };
