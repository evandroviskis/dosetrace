'use strict';
// S-26 BK-16 (docs/specs/book-layout.md, founder decision 4): each tapped dose on Today's right page
// of an unfolded foldable is ONE slot — its protocol, its day and its scheduled time — so a
// twice-daily protocol's 08:00 and 20:00 and yesterday's pending 20:00 are different items. The old
// dose page (Mark taken / Skip on the right) was replaced by A-115 (the protocol's own page, actions
// stay on the left card), so its planner planDosePage is gone (rebuild = replace). What stays and is
// tested here: the day's slots, the right-page key of a slot, which slot a card tap opens, and the
// card plan (A-78) — all read rows through the same slot matching (assignRows).
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const DPS = require('../lib/dosePageState');
const { daySlots, cardSlot, dosePageKey, cardPlan } = DPS;

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


test('BK-16: a twice-daily protocol has two distinct slots, each with its own day and time', () => {
  const s = daySlots({ protocol: twice(), dayKey: TODAY });
  assert.deepEqual(s.map((x) => x.slotMs), [S08, S20], 'sorted 08:00 then 20:00');
  assert.deepEqual(s.map((x) => x.ti), [0, 1]);
  assert.notEqual(dosePageKey(7, TODAY, S08), dosePageKey(7, TODAY, S20), 'two different right-page items');
  assert.notEqual(dosePageKey(7, YEST, Y20), dosePageKey(7, TODAY, S20), 'yesterday 20:00 is not today 20:00');
});

test('A-115: the old dose page planner is gone — no planDosePage in the module or any screen (rebuild = replace)', () => {
  assert.equal(DPS.planDosePage, undefined, 'lib/dosePageState.js no longer exports planDosePage');
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'lib', 'dosePageState.js'), 'utf8');
  assert.ok(!/function planDosePage|function findSlot/.test(src), 'its helpers went with it');
  for (const dir of ['screens', 'screens/components', 'components', 'lib']) {
    for (const name of fs.readdirSync(path.join(root, dir))) {
      if (!name.endsWith('.js')) continue;
      const body = fs.readFileSync(path.join(root, dir, name), 'utf8');
      assert.ok(!/planDosePage/.test(body), `${dir}/${name} mentions planDosePage`);
    }
  }
});

// The slot matching the card reads (assignRows), through cardPlan's slots.
const outcomes = (c) => c.slots.map((x) => (x.row ? x.row.outcome : null));

test('BK-16: Skip 08:00 then take at 20:30 → 08:00 Skipped, 20:00 Taken (rows are matched to slots in the order they were written)', () => {
  const logs = [row('Skipped', local(2026, 10, 1, 9, 0)), row('Taken', local(2026, 10, 1, 20, 30))];
  assert.deepEqual(outcomes(cardPlan({ protocol: twice(), logs, nowMs: local(2026, 10, 1, 21, 0) })), ['Skipped', 'Taken']);
});

test('BK-16: a row written AT a slot (a flipped Missed, a pending write) belongs to that slot first', () => {
  const logs = [row('Taken', S20), row('Skipped', local(2026, 10, 1, 7, 50))];
  const c = cardPlan({ protocol: twice(), logs, nowMs: local(2026, 10, 1, 21, 0) });
  assert.equal(c.slots[1].row.id, logs[0].id, '20:00 holds the row written at 20:00');
  assert.equal(c.slots[0].row.id, logs[1].id, '08:00 holds the other row');
});

test('BK-16: other protocols\' rows and other days\' rows never mark this slot', () => {
  const logs = [row('Taken', local(2026, 10, 1, 8, 1), 8), row('Taken', local(2026, 9, 30, 21, 0))];
  const c = cardPlan({ protocol: twice(), logs, nowMs: local(2026, 10, 1, 9, 0) });
  assert.deepEqual(outcomes(c), [null, null]);
  assert.deepEqual(c.next, { dayKey: TODAY, slotMs: S08, ti: 0, flipRowId: null });
  assert.equal(c.due, true);
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
  assert.deepEqual(cardSlot({ protocol: p, logs: [], nowMs: local(2026, 10, 1, 13, 0) }), { dayKey: TODAY, slotMs: S20, ti: 1 });
});

test('BK-16: once a day without a reminder time — one slot identified by its index', () => {
  const p = twice({ doses_per_day: 1, reminder_time: '' });
  assert.deepEqual(daySlots({ protocol: p, dayKey: TODAY }), [{ ti: 0, slotMs: null }]);
  assert.deepEqual(cardSlot({ protocol: p, logs: [], nowMs: local(2026, 10, 1, 6, 0) }), { dayKey: TODAY, slotMs: null, ti: 0 });
  const c = cardPlan({ protocol: p, logs: [row('Taken', local(2026, 10, 1, 7, 0))], nowMs: local(2026, 10, 1, 8, 0) });
  assert.equal(c.next, null);
  assert.equal(c.allFilled, true);
});

// A-78 complete (founder 2026-10-01): the Today card counts Skipped as filled.
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
