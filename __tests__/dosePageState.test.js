'use strict';
// S-26 BK-16 (docs/specs/book-layout.md, founder decision 4): the dose page on Today's right
// page of an unfolded foldable. Each tapped dose carries its own day and slot, so a
// twice-daily protocol writes the right slot and yesterday's pending dose is written to
// yesterday. Upcoming doses show their info only. A Taken or Skipped dose shows its state and
// Undo, never a second Mark taken. lib/dosePageState.js is the pure planner Today renders
// the page from; the writes it names are Today's existing paths (handleTake / skipDose for
// today, takePending / skipPending = writePending for yesterday). These tests feed the
// planner's write back through the real write planner (lib/markTaken.js) to prove the row
// lands on the tapped slot.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const { daySlots, planDosePage, cardSlot, dosePageKey } = require('../lib/dosePageState');
const { planMarkTaken, planSkipPending } = require('../lib/markTaken');

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const iso = (ms) => new Date(ms).toISOString();
const TODAY = '2026-10-01';
const YEST = '2026-09-30';
const twice = (over = {}) => ({
  id: 7, user_id: 'u1', name: 'BPC', type: 'oral', active: 1, start_date: '2026-09-01', interval_days: 1,
  doses_per_day: 2, reminder_time: '20:00,08:00', created_at: iso(local(2026, 9, 1, 7, 0)), ...over,
});
let nextId = 100;
const row = (outcome, ms, pid = 7) => ({ id: nextId++, protocol_id: pid, outcome, logged_at: iso(ms) });
const S08 = local(2026, 10, 1, 8, 0);
const S20 = local(2026, 10, 1, 20, 0);
const Y08 = local(2026, 9, 30, 8, 0);
const Y20 = local(2026, 9, 30, 20, 0);

// Apply a planner write through the real write planner, as Today's path does.
function applyWrite(protocol, logs, plan, nowMs) {
  assert.ok(plan.write, 'the plan names a write');
  const w = plan.write;
  const mt = planMarkTaken({ protocol, todayLogs: logs, dayKey: w.dayKey, slotMs: w.path === 'pending' ? w.slotMs : undefined, nowMs });
  assert.ok(!mt.alreadyTaken);
  if (mt.update) return logs.map((l) => (l.id === mt.update.id ? { ...l, outcome: 'Taken' } : l));
  return [...logs, { id: nextId++, ...mt.insert }];
}

test('BK-16: a twice-daily protocol has two distinct slots, each with its own day and time', () => {
  const s = daySlots({ protocol: twice(), dayKey: TODAY });
  assert.deepEqual(s.map((x) => x.slotMs), [S08, S20], 'sorted 08:00 then 20:00');
  assert.deepEqual(s.map((x) => x.ti), [0, 1]);
  assert.notEqual(dosePageKey(7, TODAY, S08), dosePageKey(7, TODAY, S20), 'two different right-page items');
  assert.notEqual(dosePageKey(7, YEST, Y20), dosePageKey(7, TODAY, S20), 'yesterday 20:00 is not today 20:00');
});

test('BK-16: at 10:00 the 08:00 dose is due (Mark taken, Skip) and the 20:00 dose is upcoming (info only)', () => {
  const now = local(2026, 10, 1, 10, 0);
  const a = planDosePage({ protocol: twice(), logs: [], dayKey: TODAY, slotMs: S08, nowMs: now });
  assert.equal(a.kind, 'due');
  assert.equal(a.canTake, true);
  assert.equal(a.canSkip, true);
  assert.equal(a.canUndo, false);
  // A-78: the write names its slot (time and index), so Today's write lands on it.
  assert.deepEqual(a.write, { path: 'today', dayKey: TODAY, slotMs: S08, flipRowId: null, ti: 0 });
  const b = planDosePage({ protocol: twice(), logs: [], dayKey: TODAY, slotMs: S20, nowMs: now });
  assert.equal(b.kind, 'upcoming');
  assert.equal(b.canTake, false, 'no Mark taken on an upcoming dose');
  assert.equal(b.canSkip, false, 'no Skip on an upcoming dose');
  assert.equal(b.write, null);
});

test('BK-16: taking 08:00 never writes 20:00 — after the write 08:00 is Taken (Undo) and 20:00 is still upcoming', () => {
  const now = local(2026, 10, 1, 10, 0);
  const p = twice();
  const plan = planDosePage({ protocol: p, logs: [], dayKey: TODAY, slotMs: S08, nowMs: now });
  const logs = applyWrite(p, [], plan, now);
  assert.equal(logs.length, 1, 'exactly one row');
  const a = planDosePage({ protocol: p, logs, dayKey: TODAY, slotMs: S08, nowMs: now });
  assert.equal(a.kind, 'taken');
  assert.equal(a.canTake, false, 'never a second Mark taken');
  assert.equal(a.canSkip, false);
  assert.equal(a.canUndo, true);
  assert.equal(a.logId, logs[0].id, 'Undo targets the row of THIS slot');
  const b = planDosePage({ protocol: p, logs, dayKey: TODAY, slotMs: S20, nowMs: now });
  assert.equal(b.kind, 'upcoming', '20:00 is not marked by the 08:00 dose');
  assert.equal(b.logId, null);
  // At 20:00 the evening dose becomes due and writes its own row.
  const eve = local(2026, 10, 1, 20, 3);
  const c = planDosePage({ protocol: p, logs, dayKey: TODAY, slotMs: S20, nowMs: eve });
  assert.equal(c.kind, 'due');
  assert.equal(c.canTake, true);
  const logs2 = applyWrite(p, logs, c, eve);
  assert.equal(planDosePage({ protocol: p, logs: logs2, dayKey: TODAY, slotMs: S20, nowMs: eve }).kind, 'taken');
  assert.equal(planDosePage({ protocol: p, logs: logs2, dayKey: TODAY, slotMs: S08, nowMs: eve }).logId, logs[0].id, '08:00 keeps its own row');
});

test('BK-16: a dose becomes due 5 minutes before its time, as the Today card\'s Due tag', () => {
  const p = twice();
  const logs = [row('Taken', local(2026, 10, 1, 8, 10))];
  assert.equal(planDosePage({ protocol: p, logs, dayKey: TODAY, slotMs: S20, nowMs: local(2026, 10, 1, 19, 54) }).kind, 'upcoming');
  assert.equal(planDosePage({ protocol: p, logs, dayKey: TODAY, slotMs: S20, nowMs: local(2026, 10, 1, 19, 55) }).kind, 'due');
});

test('BK-16: only the earliest open slot of today can be written (Today writes "the next dose" at the tap time)', () => {
  const now = local(2026, 10, 1, 21, 0);
  const p = twice();
  const a = planDosePage({ protocol: p, logs: [], dayKey: TODAY, slotMs: S08, nowMs: now });
  assert.equal(a.kind, 'due');
  assert.equal(a.canTake, true);
  const b = planDosePage({ protocol: p, logs: [], dayKey: TODAY, slotMs: S20, nowMs: now });
  assert.equal(b.kind, 'due');
  assert.equal(b.canTake, false, '20:00 would be written as the 08:00 dose');
  assert.equal(b.canSkip, false);
  assert.equal(b.waitsFor, S08);
});

test('BK-16: yesterday\'s pending dose is written to YESTERDAY at its slot, never to today', () => {
  const now = local(2026, 10, 1, 6, 0); // yesterday 20:00 is pending until 08:00 today
  const p = twice();
  const logs = [row('Taken', local(2026, 9, 30, 8, 5))]; // yesterday's 08:00 was taken
  const a = planDosePage({ protocol: p, logs, dayKey: YEST, slotMs: Y20, nowMs: now });
  assert.equal(a.kind, 'pending');
  assert.equal(a.canTake, true);
  assert.equal(a.canSkip, true);
  assert.deepEqual(a.write, { path: 'pending', dayKey: YEST, slotMs: Y20 });
  const after = applyWrite(p, logs, a, now);
  const written = after[after.length - 1];
  assert.equal(written.logged_at, iso(Y20), 'the row sits at yesterday 20:00');
  const b = planDosePage({ protocol: p, logs: after, dayKey: YEST, slotMs: Y20, nowMs: now });
  assert.equal(b.kind, 'taken');
  assert.equal(b.canTake, false);
  assert.equal(b.logId, written.id);
  // Today's doses are untouched by yesterday's row.
  assert.equal(planDosePage({ protocol: p, logs: after, dayKey: TODAY, slotMs: S08, nowMs: now }).kind, 'upcoming');
  assert.equal(planDosePage({ protocol: p, logs: after, dayKey: TODAY, slotMs: S08, nowMs: local(2026, 10, 1, 8, 0) }).canTake, true);
});

test('BK-16: yesterday\'s pending Skip writes one Skipped row at yesterday\'s slot, then shows Skipped with Undo', () => {
  const now = local(2026, 10, 1, 6, 0);
  const p = twice();
  const logs = [row('Taken', local(2026, 9, 30, 8, 5))];
  const a = planDosePage({ protocol: p, logs, dayKey: YEST, slotMs: Y20, nowMs: now });
  const sp = planSkipPending({ protocol: p, todayLogs: logs, dayKey: a.write.dayKey, slotMs: a.write.slotMs, nowMs: now });
  assert.equal(sp.insert.logged_at, iso(Y20));
  const after = [...logs, { id: 999, ...sp.insert }];
  const b = planDosePage({ protocol: p, logs: after, dayKey: YEST, slotMs: Y20, nowMs: now });
  assert.equal(b.kind, 'skipped');
  assert.equal(b.canTake, false, 'a Skipped dose offers no Mark taken');
  assert.equal(b.canUndo, true);
  assert.equal(b.logId, 999);
});

test('BK-16: yesterday\'s slot past its 12 h window is not pending — no write from the page', () => {
  const now = local(2026, 10, 1, 9, 0);
  const a = planDosePage({ protocol: twice(), logs: [], dayKey: YEST, slotMs: Y20, nowMs: now });
  assert.equal(a.kind, 'missed');
  assert.equal(a.canTake, false);
  assert.equal(a.canSkip, false);
  assert.equal(a.write, null);
  const m = row('Missed', Y08);
  const b = planDosePage({ protocol: twice(), logs: [m], dayKey: YEST, slotMs: Y08, nowMs: now });
  assert.equal(b.kind, 'missed');
  assert.equal(b.logId, m.id);
  assert.equal(b.canUndo, false);
});

test('BK-16: the pending list Today shows decides "pending" (time-zone guard included)', () => {
  const now = local(2026, 10, 1, 6, 0);
  const p = twice();
  const logs = [row('Taken', local(2026, 9, 30, 8, 5))];
  assert.equal(planDosePage({ protocol: p, logs, dayKey: YEST, slotMs: Y20, nowMs: now, pending: [] }).kind, 'missed',
    'not in Today\'s pending list → no write');
  assert.equal(planDosePage({ protocol: p, logs, dayKey: YEST, slotMs: Y20, nowMs: now, pending: [{ protocolId: 7, dayKey: YEST, slotMs: Y20 }] }).kind, 'pending');
});

// A-78 amends BK-16 (founder 2026-10-01): a Taken slot never offers a second Mark taken; a
// slot skipped today shows its state AND Mark taken, which logs that very Skipped row.
test('BK-16: a dose logged anywhere else (notification, other device) shows its state; Taken never offers Mark taken, Skipped today logs that row', () => {
  const now = local(2026, 10, 1, 10, 0);
  const p = twice();
  for (const [outcome, kind] of [['Taken', 'taken'], ['Skipped', 'skipped']]) {
    const logs = [row(outcome, local(2026, 10, 1, 8, 2))];
    const a = planDosePage({ protocol: p, logs, dayKey: TODAY, slotMs: S08, nowMs: now });
    assert.equal(a.kind, kind);
    assert.equal(a.canTake, kind === 'skipped');
    assert.equal(a.canSkip, false);
    assert.equal(a.canUndo, true);
    assert.equal(a.outcome, outcome);
    if (kind === 'skipped') assert.deepEqual(a.write, { path: 'today', dayKey: TODAY, slotMs: S08, flipRowId: logs[0].id, ti: 0 });
    else assert.equal(a.write, null);
  }
});

test('BK-16: Skip 08:00 then take at 20:30 → 08:00 Skipped, 20:00 Taken (rows are matched to slots in the order they were written)', () => {
  const p = twice();
  const logs = [row('Skipped', local(2026, 10, 1, 9, 0)), row('Taken', local(2026, 10, 1, 20, 30))];
  const now = local(2026, 10, 1, 21, 0);
  assert.equal(planDosePage({ protocol: p, logs, dayKey: TODAY, slotMs: S08, nowMs: now }).kind, 'skipped');
  assert.equal(planDosePage({ protocol: p, logs, dayKey: TODAY, slotMs: S20, nowMs: now }).kind, 'taken');
});

test('BK-16: a row written AT a slot (a flipped Missed, a pending write) belongs to that slot first', () => {
  const p = twice();
  const logs = [row('Taken', Y20), row('Taken', local(2026, 9, 30, 7, 50))];
  const now = local(2026, 10, 1, 7, 0);
  assert.equal(planDosePage({ protocol: p, logs, dayKey: YEST, slotMs: Y20, nowMs: now }).logId, logs[0].id);
  assert.equal(planDosePage({ protocol: p, logs, dayKey: YEST, slotMs: Y08, nowMs: now }).logId, logs[1].id);
});

test('BK-16: other protocols\' rows and other days\' rows never mark this slot', () => {
  const p = twice();
  const logs = [row('Taken', local(2026, 10, 1, 8, 1), 8), row('Taken', local(2026, 9, 30, 21, 0))];
  const a = planDosePage({ protocol: p, logs, dayKey: TODAY, slotMs: S08, nowMs: local(2026, 10, 1, 9, 0) });
  assert.equal(a.kind, 'due');
});

test('BK-16: tomorrow\'s dose is upcoming (info only)', () => {
  const a = planDosePage({ protocol: twice(), logs: [], dayKey: '2026-10-02', slotMs: local(2026, 10, 2, 8, 0), nowMs: local(2026, 10, 1, 10, 0) });
  assert.equal(a.kind, 'upcoming');
  assert.equal(a.canTake, false);
  assert.equal(a.canSkip, false);
});

test('BK-16: a slot that is no longer in the schedule (reminder time edited) is "none" — Today shows the Dose log', () => {
  const a = planDosePage({ protocol: twice(), logs: [], dayKey: TODAY, slotMs: local(2026, 10, 1, 9, 0), nowMs: local(2026, 10, 1, 10, 0) });
  assert.equal(a.kind, 'none');
  assert.equal(a.canTake, false);
});

test('BK-16: the card opens the earliest open slot, else the last logged one', () => {
  const p = twice();
  assert.deepEqual(cardSlot({ protocol: p, logs: [], nowMs: local(2026, 10, 1, 10, 0) }), { dayKey: TODAY, slotMs: S08, ti: 0 });
  const one = [row('Taken', local(2026, 10, 1, 10, 0))];
  assert.deepEqual(cardSlot({ protocol: p, logs: one, nowMs: local(2026, 10, 1, 10, 1) }), { dayKey: TODAY, slotMs: S20, ti: 1 });
  const two = [...one, row('Taken', local(2026, 10, 1, 20, 1))];
  assert.deepEqual(cardSlot({ protocol: p, logs: two, nowMs: local(2026, 10, 1, 20, 2) }), { dayKey: TODAY, slotMs: S20, ti: 1 });
  assert.equal(cardSlot({ protocol: twice({ interval_days: 2, start_date: '2026-09-30' }), logs: [], nowMs: local(2026, 10, 1, 10, 0) }), null, 'not a dose day');
});

test('BK-16: creation day — a protocol created at 12:00 today has only its 20:00 slot', () => {
  const p = twice({ created_at: iso(local(2026, 10, 1, 12, 0)) });
  assert.deepEqual(daySlots({ protocol: p, dayKey: TODAY }).map((x) => x.slotMs), [S20]);
  assert.equal(planDosePage({ protocol: p, logs: [], dayKey: TODAY, slotMs: S08, nowMs: local(2026, 10, 1, 13, 0) }).kind, 'none');
});

test('BK-16: once a day without a reminder time — due all day, identified by its index', () => {
  const p = twice({ doses_per_day: 1, reminder_time: '' });
  const s = daySlots({ protocol: p, dayKey: TODAY });
  assert.deepEqual(s, [{ ti: 0, slotMs: null }]);
  const a = planDosePage({ protocol: p, logs: [], dayKey: TODAY, slotMs: null, ti: 0, nowMs: local(2026, 10, 1, 6, 0) });
  assert.equal(a.kind, 'due');
  assert.equal(a.canTake, true);
  const b = planDosePage({ protocol: p, logs: [row('Taken', local(2026, 10, 1, 7, 0))], dayKey: TODAY, slotMs: null, ti: 0, nowMs: local(2026, 10, 1, 8, 0) });
  assert.equal(b.kind, 'taken');
});

// A-78 complete (founder 2026-10-01): the Today card counts Skipped as filled.
const { cardPlan } = require('../lib/dosePageState');

test('A-78: cardPlan — after the 08:00 skip the card offers 20:00 (label, Due, main buttons) and a line for the skipped 08:00', () => {
  const p = twice();
  const skip = row('Skipped', S08);
  const c = cardPlan({ protocol: p, logs: [skip], nowMs: local(2026, 10, 1, 8, 10) });
  assert.deepEqual(c.next, { dayKey: TODAY, slotMs: S20, ti: 1, flipRowId: null });
  assert.equal(c.due, false);
  assert.deepEqual(c.skipped, [{ dayKey: TODAY, slotMs: S08, ti: 0, flipRowId: skip.id, canTake: true }]);
  assert.equal(cardPlan({ protocol: p, logs: [skip], nowMs: local(2026, 10, 1, 19, 55) }).due, true);
});

test('A-78: cardPlan — every slot Taken or Skipped → no main Mark taken / Skip; the skipped line stays loggable', () => {
  const p = twice();
  const logs = [row('Taken', local(2026, 10, 1, 8, 3)), row('Skipped', S20)];
  const c = cardPlan({ protocol: p, logs, nowMs: local(2026, 10, 1, 20, 10) });
  assert.equal(c.next, null);
  assert.equal(c.allFilled, true);
  assert.equal(c.taken, 1);
  assert.equal(c.skipped.length, 1);
  assert.equal(c.skipped[0].slotMs, S20);
  assert.equal(c.skipped[0].canTake, true);
});

test('A-78: cardPlan — a day already holding its Taken doses never offers to log a stray Skipped row', () => {
  const p = twice({ doses_per_day: 1, reminder_time: '08:00' });
  const logs = [row('Skipped', local(2026, 10, 1, 8, 0)), row('Taken', local(2026, 10, 1, 8, 30))];
  const c = cardPlan({ protocol: p, logs, nowMs: local(2026, 10, 1, 9, 0) });
  assert.equal(c.skipped.every((s) => s.canTake === false), true);
});

test('A-78: dose page — yesterday\'s Skipped slot keeps no Mark taken (the skipped line is a today action)', () => {
  const now = local(2026, 10, 1, 6, 0);
  const s = row('Skipped', Y20);
  const a = planDosePage({ protocol: twice(), logs: [s], dayKey: YEST, slotMs: Y20, nowMs: now });
  assert.equal(a.kind, 'skipped');
  assert.equal(a.canTake, false);
});
