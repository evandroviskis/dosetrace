'use strict';
// A-157 (docs/review/features.md, curve re-review 2026-10-20): on the day a protocol was ended,
// Today's slots (lib/dosePageState daySlots) were picked by index from the end of the day
// (dpd - expected), so a twice-daily 08:00 / 20:00 protocol ended at 12:00 showed a 20:00 slot,
// after the end, while the curve, the rings and the Missed scan correctly kept 08:00. One rule
// now (lib/schedule slotAfterEnd, on top of A-83's endedAtMs): no slot after the protocol's end
// moment is shown, reminded or counted; the slots before it on that day stay. The planned end
// (ends_on, A-121) changes none of this (SG-4 / SG-11: nothing ends by itself).
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const { daySlots, cardPlan, cardSlot } = require('../lib/dosePageState');
const { expectedSlotTimesOn, expectedDosesOn, slotAfterEnd } = require('../lib/schedule');
const { doseSlots } = require('../lib/notificationPlan');
const { adherenceRings } = require('../lib/adherenceRings');

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const iso = (ms) => new Date(ms).toISOString();
const TODAY = '2026-10-01';
const S08 = local(2026, 10, 1, 8, 0);
const S20 = local(2026, 10, 1, 20, 0);
const twice = (over = {}) => ({
  id: 7, user_id: 'u1', name: 'BPC', type: 'oral', active: 1, start_date: '2026-09-01', interval_days: 1,
  doses_per_day: 2, reminder_time: '20:00,08:00', created_at: iso(local(2026, 9, 1, 7, 0)), ...over,
});
const endedAt = (h, min = 0, day = 1) => twice({ active: 0, ended_at: iso(local(2026, 10, day, h, min)) });

test('A-157: ended at 12:00 on a 08:00 / 20:00 day → only the 08:00 slot (ti 0), never 20:00', () => {
  const s = daySlots({ protocol: endedAt(12), dayKey: TODAY });
  assert.deepEqual(s.map((x) => x.slotMs), [S08]);
  assert.deepEqual(s.map((x) => x.ti), [0]);
});

test('A-157: the end moment itself still holds its slot; a minute before it does not', () => {
  assert.deepEqual(daySlots({ protocol: endedAt(20, 0), dayKey: TODAY }).map((x) => x.slotMs), [S08, S20]);
  assert.deepEqual(daySlots({ protocol: endedAt(19, 59), dayKey: TODAY }).map((x) => x.slotMs), [S08]);
  assert.deepEqual(daySlots({ protocol: endedAt(7, 59), dayKey: TODAY }), [], 'ended before the first slot');
  assert.deepEqual(daySlots({ protocol: endedAt(12, 0, 1), dayKey: '2026-10-02' }), [], 'nothing the day after');
});

test('A-157: Today card on the end day (13:00) offers the 08:00 slot or nothing, never 20:00', () => {
  const p = endedAt(12);
  const now = local(2026, 10, 1, 13, 0);
  const open = cardPlan({ protocol: p, logs: [], nowMs: now });
  assert.equal(open.slots.length, 1);
  assert.equal(open.next && open.next.slotMs, S08);
  const taken = cardPlan({ protocol: p, logs: [{ id: 1, protocol_id: 7, outcome: 'Taken', logged_at: iso(local(2026, 10, 1, 8, 5)) }], nowMs: now });
  assert.equal(taken.next, null, 'the only slot is filled');
  assert.equal(taken.allFilled, true);
  assert.equal(cardSlot({ protocol: p, logs: [], nowMs: now }).slotMs, S08);
});

test('A-157: the creation-day rule is unchanged (later slots stay, floor of 1 keeps the last slot)', () => {
  const at1630 = twice({ created_at: iso(local(2026, 10, 1, 16, 30)) });
  assert.deepEqual(daySlots({ protocol: at1630, dayKey: TODAY }).map((x) => [x.ti, x.slotMs]), [[1, S20]]);
  const at2130 = twice({ created_at: iso(local(2026, 10, 1, 21, 30)) });
  assert.deepEqual(daySlots({ protocol: at2130, dayKey: TODAY }).map((x) => [x.ti, x.slotMs]), [[1, S20]], 'floor of 1');
  const createdAndEnded = twice({ created_at: iso(local(2026, 10, 1, 7, 30)), active: 0, ended_at: iso(local(2026, 10, 1, 12, 0)) });
  assert.deepEqual(daySlots({ protocol: createdAndEnded, dayKey: TODAY }).map((x) => [x.ti, x.slotMs]), [[0, S08]]);
});

test('A-157: a planned end (ends_on) never removes a slot (SG-4 / SG-11)', () => {
  const p = twice({ ends_on: TODAY });
  assert.deepEqual(daySlots({ protocol: p, dayKey: TODAY }).map((x) => x.slotMs), [S08, S20]);
  assert.deepEqual(daySlots({ protocol: p, dayKey: '2026-10-02' }).length, 2);
});

test('A-157: one rule — Today slots are exactly the schedule slot times and count, for every case', () => {
  const cases = [
    twice(), endedAt(12), endedAt(7, 59), endedAt(20), endedAt(23, 59),
    twice({ created_at: iso(local(2026, 10, 1, 16, 30)) }),
    twice({ created_at: iso(local(2026, 10, 1, 7, 30)), active: 0, ended_at: iso(local(2026, 10, 1, 12, 0)) }),
    twice({ doses_per_day: 3, reminder_time: '08:00,14:00,20:00', active: 0, ended_at: iso(local(2026, 10, 1, 15, 0)) }),
    twice({ ends_on: TODAY }),
  ];
  const day = new Date(local(2026, 10, 1));
  for (const p of cases) {
    const got = daySlots({ protocol: p, dayKey: TODAY });
    const want = expectedSlotTimesOn(p, day);
    assert.equal(got.length, expectedDosesOn(p, day), JSON.stringify(p));
    if (want.length === got.length) {
      assert.deepEqual(got.map((x) => new Date(x.slotMs).toTimeString().slice(0, 5)), want, JSON.stringify(p));
    }
    for (const s of got) assert.equal(slotAfterEnd(p, s.slotMs), false, 'no slot after the end');
  }
});

test('A-157: reminders (doseSlots) never plan a slot after the end moment', () => {
  const p = endedAt(12);
  const now = new Date(local(2026, 10, 1, 10, 0));
  const slots = doseSlots({ protocol: p, now, windowDays: 3, persistent: true });
  assert.deepEqual(slots.filter((s) => s.slotMs > local(2026, 10, 1, 12, 0)), []);
  // An active protocol keeps every reminder (the rule is a no-op without an end).
  const live = doseSlots({ protocol: twice(), now, windowDays: 3 });
  assert.equal(live.filter((s) => s.kind === 'main').length, 5, '20:00 today + 2 × 2 later');
});

test('A-157: the rings count the same slot on the end day as Today shows', () => {
  const p = endedAt(12);
  const nowMs = local(2026, 10, 1, 13, 0);
  const r = adherenceRings({ protocols: [p], logs: [{ id: 1, protocol_id: 7, outcome: 'Taken', logged_at: iso(local(2026, 10, 1, 8, 2)) }], nowMs });
  assert.deepEqual(r.today, { taken: 1, due: 1 });
  assert.equal(daySlots({ protocol: p, dayKey: TODAY }).length, r.today.due);
});
