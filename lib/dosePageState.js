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
const { sortedDoseTimes, expectedDosesOn, expectedSlotTimesOn, slotAfterEnd } = require('./schedule');
const { localISO } = require('./localDate');
const { notificationTakeTarget } = require('./markTaken');

const SAME_SLOT_MS = 60 * 1000; // rows written for a slot sit at its exact time (lib/markTaken.js)
const DUE_AHEAD_MS = 5 * 60 * 1000; // the Today card's Due tag (isDoseDue)
const keyOf = (d) => localISO(d);

function dayBounds(dayKey) {
  const [y, m, d] = String(dayKey).split('-').map(Number);
  return { start: new Date(y, m - 1, d, 0, 0, 0, 0), end: new Date(y, m - 1, d + 1, 0, 0, 0, 0) };
}

// The slots of a day, as the Today card counts them (expectedDosesOn), earliest first. A-157: the
// slots are the schedule's own slot times of the day (expectedSlotTimesOn: start date, interval,
// the creation day, and the end moment through slotAfterEnd), so on the day a protocol was ended
// only the slots up to the end stay — never a later one picked by index. A count above the listed
// times (the creation-day floor of 1 after its slot passed; a legacy row with fewer times than
// doses a day) takes the latest positions left, as before.
function daySlots({ protocol, dayKey }) {
  const p = protocol || {};
  const { start } = dayBounds(dayKey);
  const dpd = p.doses_per_day || 1;
  const expected = expectedDosesOn(p, start);
  if (!expected) return [];
  const times = sortedDoseTimes(p).slice(0, dpd);
  const at = (ti) => {
    const t24 = times[ti];
    if (!t24) return null;
    const [h, m] = t24.split(':').map(Number);
    return new Date(start.getFullYear(), start.getMonth(), start.getDate(), h, m, 0, 0).getTime();
  };
  const used = new Set();
  for (const t24 of expectedSlotTimesOn(p, start)) {
    const ti = times.findIndex((x, i) => x === t24 && !used.has(i));
    if (ti >= 0) used.add(ti);
  }
  for (let ti = dpd - 1; ti >= 0 && used.size < expected; ti--) {
    if (!used.has(ti) && !slotAfterEnd(p, at(ti))) used.add(ti);
  }
  return [...used].sort((a, b) => a - b).map((ti) => ({ ti, slotMs: at(ti) }));
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

// DV-129 (DL-12, AD-79 item 12; founder 2026-11-01 option A): a skip counts as resolved on Today.
// cards: the protocols Today lists for today (nextDoseAt bucket ≤ 0 — it counts Taken only, so a
// skipped dose keeps its protocol there). A card whose every slot of today is Taken or Skipped
// (cardPlan allFilled) leaves the open list — nothing is left to do on it — and each of its skipped
// slots goes to `skipped` ({ protocol, slot }), shown inside the "all caught up" card with its
// Mark taken (the skipped dose stays loggable). A card without a slot today stays open, as before.
function caughtUpPlan({ cards = [], logs = [], nowMs = Date.now() }) {
  const open = [];
  const skipped = [];
  for (const p of cards) {
    const cp = cardPlan({ protocol: p, logs, nowMs });
    if (!cp.allFilled) { open.push(p); continue; }
    for (const slot of cp.skipped) skipped.push({ protocol: p, slot });
  }
  return { open, skipped };
}

// DV-036 (DL-10 rewritten round 2, AD-79 item 9; founder 2026-11-01 option A): what a reminder's body
// tap finds on Today. focus = the reminder's { dayKey, ti, slotMs } (lib/notificationPlan notifTapTarget).
//  - { kind: 'logged', outcome: 'Taken' | 'Skipped', loggedAt } — the reminder's own slot already holds a
//    Taken or Skipped row (without a slot named: every slot of today is filled, the latest such row);
//    Today says so in a toast and offers no take (A-171: a tapped dose is never logged twice);
//  - { kind: 'open', slot, cancelUpTo } — the focus card's take does what the reminder's Mark complete
//    button does (lib/notificationActions markTaken): the reminder's slot through notificationTakeTarget,
//    written at the tap time, and the same reminders cancelled (ti + 1);
//  - null — the reminder is not about a dose of today.
function reminderFocus({ protocol, logs = [], focus, nowMs = Date.now() }) {
  if (!protocol || !focus) return null;
  const dayKey = keyOf(new Date(nowMs));
  if (focus.dayKey && focus.dayKey !== dayKey) return null;
  const list = assignRows(protocol, logs, dayKey);
  if (!list.length) return null;
  const done = (s) => !!(s && s.row && (s.row.outcome === 'Taken' || s.row.outcome === 'Skipped'));
  const logged = (s) => ({ kind: 'logged', outcome: s.row.outcome, loggedAt: s.row.logged_at });
  const named = Number.isFinite(focus.slotMs)
    ? list.find((s) => s.slotMs === focus.slotMs)
    : (Number.isFinite(focus.ti) ? list.find((s) => s.ti === focus.ti) : null);
  if (named && done(named)) return logged(named);
  const open = list.find((s) => !done(s));
  if (!named && !open) {
    const last = list.filter(done).sort((a, b) => Date.parse(a.row.logged_at) - Date.parse(b.row.logged_at)).pop();
    return logged(last);
  }
  const base = named || open;
  const ti = Number.isFinite(focus.ti) ? focus.ti : base.ti;
  const slotMs = Number.isFinite(focus.slotMs) ? focus.slotMs : base.slotMs;
  const target = notificationTakeTarget({ dayKey, slotMs, snoozed: false, nowMs });
  return {
    kind: 'open',
    slot: { dayKey: target.dayKey, slotMs: Number.isFinite(target.slotMs) ? target.slotMs : null, ti, flipRowId: null },
    cancelUpTo: Number.isFinite(ti) ? ti + 1 : 0,
  };
}

// The slot a tap on today's dose card opens: the earliest open slot of today, else the last
// one (it shows its logged state). null when today has no slot for this protocol.
function cardSlot({ protocol, logs = [], nowMs = Date.now() }) {
  const dayKey = keyOf(new Date(nowMs));
  const list = assignRows(protocol, logs, dayKey);
  if (!list.length) return null;
  // DV-128: the same "open" rule as cardPlan — an auto-Missed row is still open (the card offers it).
  const s = list.find((x) => !x.row || x.row.outcome === 'Missed') || list[list.length - 1];
  return { dayKey, slotMs: s.slotMs, ti: s.ti };
}

module.exports = { daySlots, cardSlot, cardPlan, caughtUpPlan, reminderFocus, dosePageKey };
