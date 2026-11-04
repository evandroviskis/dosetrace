'use strict';
// Unrecorded period beyond 14 days, option B (founder 2026-11-03 "B"; answers 2026-11-04 10:04 EST;
// docs/specs/unrecorded-period.md UP-1 … UP-36). The pure core lib/unrecordedPeriod.js: which slots are
// asked (gap function), what each answer writes (plan), the summary, the "Escolher quais" weeks, the Dose
// log card, the lab subset and the lab line. Every time is local (works in any time zone).
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../lib/unrecordedPeriod');
const MD = require('../lib/missedDoses');

const HOUR = 3600000;
const DAY = 86400000;
const L = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
const iso = (ms) => new Date(ms).toISOString();
// "Today" of the picture: Tuesday 2026-11-03 10:00. The scan's 14 days start on 2026-10-20 00:00.
const NOW = L(2026, 11, 3, 10);
const PULLED = NOW - 60000;

const weekly = (over = {}) => ({
  id: 1, user_id: 'u', remote_id: 'r1', name: 'Testosterona Cipionato', type: 'recon', dose: '125', dose_unit: 'mg',
  reminder_time: '09:00', doses_per_day: 1, interval_days: 7, start_date: '2026-10-05', active: 1,
  created_at: iso(L(2026, 10, 5, 8)), ...over,
});
const daily = (over = {}) => ({
  id: 2, user_id: 'u', remote_id: 'r2', name: 'BPC-157', type: 'recon', dose: '250', dose_unit: 'mcg',
  reminder_time: '08:00', doses_per_day: 1, interval_days: 1, start_date: '2026-09-15', active: 1,
  created_at: iso(L(2026, 9, 15, 7)), ...over,
});
const row = (id, pid, outcome, ms, extra = {}) => ({ id, protocol_id: pid, outcome, logged_at: iso(ms), ...extra });
const opts = (o = {}) => ({ nowMs: NOW, pulledThroughMs: PULLED, zoneHistory: null, ...o });
const times = (entries) => entries.map((e) => e.slotMs);
// The weekly protocol taken every Monday of September (so its gap is 2026-10-05, 10-12, 10-19).
const SEPT = [7, 14, 21, 28].map((d, i) => row(10 + i, 1, 'Taken', L(2026, 9, d, 9, 5)));

test('UP-1 / UP-3: only slots before the scan window (14 days) and after the protocol existed, at most 365 days', () => {
  const p = weekly();
  // Taken on 2026-09-28 and 2026-09-21 and 2026-09-14 and 2026-09-07; nothing from 2026-10-05 on.
  const logs = [7, 14, 21, 28].map((d, i) => row(10 + i, 1, 'Taken', L(2026, 9, d, 9, 5)));
  const e = U.gapEntries(p, logs, opts());
  assert.deepEqual(times(e), [L(2026, 10, 5, 9), L(2026, 10, 12, 9), L(2026, 10, 19, 9)]);
  // The window start is exactly the Missed scan's: 2026-10-20 00:00 local (no zone history).
  assert.equal(U.scanWindowStartMs(NOW, null), L(2026, 10, 20));
  // Never older than 365 days.
  const old = weekly({ start_date: '2025-01-06', created_at: iso(L(2025, 1, 6, 8)) });
  const all = U.gapEntries(old, [], opts());
  assert.ok(all.length > 0);
  assert.ok(all[0].slotMs >= NOW - 365 * DAY);
  assert.ok(all[all.length - 1].slotMs < L(2026, 10, 20));
});

test('UP-3 property: every past slot of a protocol is in exactly one of scan window / unrecorded period / before it existed', () => {
  const p = daily({ start_date: '2026-06-01', created_at: iso(L(2026, 8, 1, 12)) });
  const e = new Set(times(U.gapEntries(p, [], opts())));
  const floor = U.periodFloorMs(p, NOW);
  const ceil = U.scanWindowStartMs(NOW, null);
  for (let d = L(2026, 6, 1, 8); d < NOW - 12 * HOUR; d += DAY) {
    const inScan = d >= ceil;
    const before = d < floor;
    const inGap = e.has(d);
    assert.equal([inScan, before, inGap].filter(Boolean).length, 1, new Date(d).toString());
  }
});

test('UP-4: a slot older than the zone history is built in the oldest known zone, never skipped', () => {
  const zones = [{ tz: 'America/New_York', sinceMs: L(2026, 10, 10) }];
  const p = weekly({ start_date: '2026-03-02', created_at: iso(L(2026, 3, 2, 8)) });
  const e = U.gapEntries(p, [], opts({ zoneHistory: zones }));
  assert.ok(e.length >= 30, 'months of slots before the history are asked');
  // 200 days back is asked.
  assert.ok(e.some((x) => x.slotMs < NOW - 200 * DAY));
  // Without a zone history: the device's own zone, same moments as local construction.
  const e2 = U.gapEntries(p, [], opts());
  assert.ok(e2.length >= 30);
});

test('UP-5: the Missed scan\'s own matching covers a slot (a weekly Monday dose taken Tuesday evening)', () => {
  const p = weekly();
  const logs = [row(1, 1, 'Taken', L(2026, 10, 6, 20)), row(2, 1, 'Skipped', L(2026, 10, 12, 9)), row(3, 1, 'NoDose', L(2026, 10, 19, 9))];
  assert.deepEqual(times(U.gapEntries(p, logs, opts())), []);
  // A time-edited row covers the slot it was marked for (slot_at).
  const moved = [row(4, 1, 'Taken', L(2026, 10, 9, 22), { slot_at: iso(L(2026, 10, 5, 9)) })];
  assert.ok(!times(U.gapEntries(p, moved, opts())).includes(L(2026, 10, 5, 9)));
  // The matcher is the scan's own (shared function).
  assert.equal(typeof MD.uncoveredSlots, 'function');
});

test('UP-6: nothing is asked before a successful pull that reaches the slot + 12 h', () => {
  const p = weekly();
  assert.deepEqual(U.gapEntries(p, [], opts({ pulledThroughMs: null })), []);
  assert.deepEqual(U.gapEntries(p, [], opts({ pulledThroughMs: undefined })), []);
  assert.equal(U.gapEntries(p, [], opts()).length, 3);
});

test('UP-7: nothing before the protocol was added; a protocol added less than 14 days ago has no period', () => {
  const p = weekly({ start_date: '2026-05-04', created_at: iso(L(2026, 8, 3, 12)) });
  const e = U.gapEntries(p, [], opts());
  assert.ok(e.every((x) => x.slotMs >= L(2026, 8, 3, 11)), 'from created_at − 1 h');
  const fresh = weekly({ start_date: '2026-05-04', created_at: iso(L(2026, 10, 25, 12)) });
  assert.deepEqual(U.gapEntries(fresh, [], opts()), []);
  // history_from (the curve starts there: past-start "Não") also bounds it.
  const cut = weekly({ history_from: '2026-10-11' });
  assert.deepEqual(times(U.gapEntries(cut, [], opts())), [L(2026, 10, 12, 9), L(2026, 10, 19, 9)]);
});

test('UP-8: an ended protocol is asked only up to ended_at', () => {
  const p = weekly({ active: 0, ended_at: iso(L(2026, 10, 13, 12)) });
  assert.deepEqual(times(U.gapEntries(p, [], opts())), [L(2026, 10, 5, 9), L(2026, 10, 12, 9)]);
});

test('UP-36: an app-written Missed row older than 14 days enters the question (that row attached); a person-marked one stays out', () => {
  const p = weekly({ name: 'Semaglutida', start_date: '2026-08-07', created_at: iso(L(2026, 8, 7, 8)), reminder_time: '20:00' });
  // Fridays: 9/4 9/11 (app Missed, no marker = app), 9/18 (person Missed), 9/25 … 10/16 nothing.
  const p2 = { ...p, start_date: '2026-09-04', interval_days: 7 };
  const logs = [
    row(41, 1, 'Missed', L(2026, 9, 4, 20)),
    row(42, 1, 'Missed', L(2026, 9, 11, 20), { outcome_by_person: 0 }),
    row(43, 1, 'Missed', L(2026, 9, 18, 20), { outcome_by_person: 1 }),
  ];
  const e = U.gapEntries({ ...p2, created_at: iso(L(2026, 9, 1, 8)) }, logs, opts());
  assert.equal(e.length, 6, '4 without record + 2 written by the app');
  assert.equal(e[0].row && e[0].row.id, 41);
  assert.equal(e[1].row && e[1].row.id, 42);
  assert.ok(!e.some((x) => x.slotMs === L(2026, 9, 18, 20)), 'the person-marked row stays red and out');
  assert.ok(e.slice(2).every((x) => !x.row));
  // Inside the 14 days an app Missed row is never in the question.
  const recent = [row(44, 1, 'Missed', L(2026, 10, 23, 20))];
  assert.ok(!U.gapEntries({ ...p2, created_at: iso(L(2026, 9, 1, 8)) }, recent, opts()).some((x) => x.row));
  // Who wrote the row, with old rows (no marker) counted as the app.
  assert.equal(U.isPersonMarked({ outcome_by_person: 1 }), true);
  assert.equal(U.isPersonMarked({ outcome_by_person: true }), true);
  assert.equal(U.isPersonMarked({ outcome_by_person: 0 }), false);
  assert.equal(U.isPersonMarked({}), false);
});

test('UP-35: slots inside a "Não lembro" range are never asked again (the range lives on the protocol, synced)', () => {
  const p = weekly();
  const answered = U.addUnknownRange(null, { fromMs: L(2026, 10, 5, 9), toMs: L(2026, 10, 12, 9), atMs: NOW });
  assert.deepEqual(times(U.gapEntries({ ...p, unrecorded_unknown: answered }, [], opts())), [L(2026, 10, 19, 9)]);
  assert.deepEqual(U.unknownRanges({ unrecorded_unknown: 'not json' }), []);
  // Undo takes exactly that range away.
  const back = U.removeUnknownRange(answered, { fromMs: L(2026, 10, 5, 9), toMs: L(2026, 10, 12, 9) });
  assert.deepEqual(times(U.gapEntries({ ...p, unrecorded_unknown: back }, [], opts())).length, 3);
  assert.equal(back, '[]', 'an empty list, never null, so the removal is sent');
});

test('UP-10 / UP-11 / UP-12: "Tomei todas" = one Taken row per slot at its own time; "Não tomei" = Skipped; no dose amount in the plan (the database stamps the dose in force that day)', () => {
  const p = weekly();
  const e = U.gapEntries(p, [], opts());
  const all = U.planUnrecordedAnswer({ protocol: p, entries: e, choice: 'all', nowMs: NOW });
  assert.equal(all.inserts.length, 3);
  for (const [i, r] of all.inserts.entries()) {
    assert.equal(r.outcome, 'Taken');
    assert.equal(r.logged_at, iso(e[i].slotMs));
    assert.equal(r.slot_at, iso(e[i].slotMs));
    assert.equal(r.outcome_by_person, 1);
    assert.ok(!('dose_amount' in r));
  }
  const none = U.planUnrecordedAnswer({ protocol: p, entries: e, choice: 'none', nowMs: NOW });
  assert.deepEqual(none.inserts.map((r) => r.outcome), ['Skipped', 'Skipped', 'Skipped']);
  assert.equal(none.vialUpdate, null);
});

test('UP-12: the slots follow the schedule in force on their own day (schedule history)', () => {
  // Daily at 08:00 until 2026-10-10, then 20:00.
  const sh = JSON.stringify([{ from: null, interval_days: 1, doses_per_day: 1, reminder_time: '08:00' }, { from: iso(L(2026, 10, 10, 12)), interval_days: 1, doses_per_day: 1, reminder_time: '20:00' }]);
  const p = daily({ reminder_time: '20:00', schedule_history: sh, start_date: '2026-10-01', created_at: iso(L(2026, 10, 1, 7)) });
  const e = U.gapEntries(p, [], opts());
  assert.equal(new Date(e[0].slotMs).getHours(), 8);
  assert.ok(e.some((x) => new Date(x.slotMs).getDate() === 9 && new Date(x.slotMs).getHours() === 8));
  assert.ok(e.some((x) => new Date(x.slotMs).getDate() === 10 && new Date(x.slotMs).getHours() === 20));
});

test('UP-13: "Escolher quais" — the chosen become Taken, the rest Skipped; daily protocols grouped by week (Monday to Sunday), newest first', () => {
  const p = daily();
  const e = U.gapEntries(p, [], opts());
  assert.equal(e.length, 35, '2026-09-15 … 2026-10-19');
  const picked = new Set(e.slice(-14).map((x) => x.slotMs));
  const plan = U.planUnrecordedAnswer({ protocol: p, entries: e, choice: 'pick', picked, nowMs: NOW });
  assert.equal(plan.summary.taken, 14);
  assert.equal(plan.summary.skipped, 21);
  const weeks = U.weekGroups(e);
  assert.equal(weeks[0].slots.length, 1, 'Monday 2026-10-19 alone');
  assert.equal(new Date(weeks[0].startMs).getDay(), 1);
  assert.equal(weeks[1].slots.length, 7);
  assert.ok(weeks[0].startMs > weeks[1].startMs, 'newest week first');
  assert.ok(weeks[1].slots[0].slotMs > weeks[1].slots[1].slotMs, 'newest slot first inside a week');
  assert.equal(weeks.reduce((n, w) => n + w.slots.length, 0), 35);
  assert.equal(U.groupsByWeek(p), true);
  assert.equal(U.groupsByWeek(weekly()), false);
  // A year of daily doses stays within 53 weeks.
  const year = daily({ start_date: '2025-10-01', created_at: iso(L(2025, 10, 1, 7)) });
  assert.ok(U.weekGroups(U.gapEntries(year, [], opts())).length <= 54);
});

test('UP-14 / UP-15: the summary comes from the plan that writes; the vial takes only doses from its mix day, never more than it holds', () => {
  const p = daily({ amount: '5', unit: 'mg' });
  const e = U.gapEntries(p, [], opts()); // 2026-09-15 … 2026-10-19 (35)
  // Vial mixed 2026-10-12 holding 10, 5 used: 8 slots from 10-12 → only 5 left.
  const vial = { id: 9, protocol_id: 2, mixed_on: '2026-10-12', total_doses: 10, doses_taken: 5, active: 1, created_at: iso(L(2026, 10, 12, 9)) };
  const plan = U.planUnrecordedAnswer({ protocol: p, entries: e, choice: 'all', vial, nowMs: NOW });
  assert.deepEqual(plan.vialUpdate, { id: 9, doses_taken: 10, active: 0 });
  assert.equal(plan.summary.vial.used, 5);
  assert.equal(plan.summary.vial.finished, true);
  assert.equal(plan.summary.vial.others, 30);
  // Without a mix date: the day the vial was added.
  const added = { ...vial, mixed_on: null, created_at: iso(L(2026, 10, 18, 9)), doses_taken: 0 };
  const p2 = U.planUnrecordedAnswer({ protocol: p, entries: e, choice: 'all', vial: added, nowMs: NOW });
  assert.equal(p2.vialUpdate.doses_taken, 2, '10-18 and 10-19');
  assert.equal(p2.vialUpdate.active, undefined);
  // Skipped never touches the vial; nothing from the vial → no update.
  assert.equal(U.planUnrecordedAnswer({ protocol: p, entries: e, choice: 'none', vial, nowMs: NOW }).vialUpdate, null);
  const before = { ...vial, mixed_on: '2026-10-25' };
  assert.equal(U.planUnrecordedAnswer({ protocol: p, entries: e, choice: 'all', vial: before, nowMs: NOW }).vialUpdate, null);
});

test('UP-30 parity: one by one (planMarkTaken) and "Tomei todas" give the same vial count', () => {
  const { planMarkTaken } = require('../lib/markTaken');
  const p = daily({ amount: '5', unit: 'mg' });
  const vial = { id: 9, protocol_id: 2, mixed_on: '2026-10-12', total_doses: 40, doses_taken: 0, active: 1, created_at: iso(L(2026, 10, 12, 9)) };
  const e = U.gapEntries(p, [], opts());
  let v = { ...vial };
  for (const x of e) {
    const d = new Date(x.slotMs);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const one = planMarkTaken({ protocol: p, vial: v, todayLogs: [], dayKey: key, slotMs: x.slotMs, nowMs: NOW });
    if (one.vialUpdate) v = { ...v, ...one.vialUpdate };
  }
  const all = U.planUnrecordedAnswer({ protocol: p, entries: e, choice: 'all', vial, nowMs: NOW });
  assert.equal(all.vialUpdate.doses_taken, v.doses_taken);
  // A vial with no mix date counts from the DAY it was added (an 08:00 dose of that day included), both ways.
  const added = { ...vial, mixed_on: null, created_at: iso(L(2026, 10, 18, 9)) };
  let w = { ...added };
  for (const x of e) {
    const d = new Date(x.slotMs);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const one = planMarkTaken({ protocol: p, vial: w, todayLogs: [], dayKey: key, slotMs: x.slotMs, nowMs: NOW });
    if (one.vialUpdate) w = { ...w, ...one.vialUpdate };
  }
  assert.equal(w.doses_taken, 2);
  assert.equal(U.planUnrecordedAnswer({ protocol: p, entries: e, choice: 'all', vial: added, nowMs: NOW }).vialUpdate.doses_taken, 2);
});

test('UP-16: an oral bottle never changes', () => {
  const p = daily({ type: 'oral', container_units: 60, units_taken: 0, serving_strength: '250', serving_strength_unit: 'mcg', serving_units: 1 });
  const e = U.gapEntries(p, [], opts());
  const plan = U.planUnrecordedAnswer({ protocol: p, entries: e, choice: 'all', nowMs: NOW });
  assert.equal(plan.oralUpdate, undefined);
  assert.equal(plan.summary.bottle, true);
});

test('UP-35 / UP-36: answers change the app-written row itself (never a second row); "Não lembro" writes no dose, removes those rows and records the range', () => {
  const p = weekly({ start_date: '2026-09-07', created_at: iso(L(2026, 9, 1, 8)) });
  const logs = [row(41, 1, 'Missed', L(2026, 9, 7, 9))];
  const e = U.gapEntries(p, logs, opts());
  assert.equal(e[0].row.id, 41);
  const all = U.planUnrecordedAnswer({ protocol: p, entries: e, choice: 'all', nowMs: NOW });
  assert.deepEqual(all.updates[0], { id: 41, outcome: 'Taken', outcome_by_person: 1 });
  assert.equal(all.inserts.length, e.length - 1);
  const none = U.planUnrecordedAnswer({ protocol: p, entries: e, choice: 'none', nowMs: NOW });
  assert.deepEqual(none.updates[0], { id: 41, outcome: 'Skipped', outcome_by_person: 1 });
  const unk = U.planUnrecordedAnswer({ protocol: p, entries: e, choice: 'unknown', nowMs: NOW });
  assert.deepEqual(unk.inserts, []);
  assert.deepEqual(unk.updates, []);
  assert.deepEqual(unk.removes, [41]);
  assert.equal(unk.vialUpdate, null);
  const ranges = U.unknownRanges({ unrecorded_unknown: unk.unknownNext });
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].fromMs, e[0].slotMs);
  assert.equal(ranges[0].toMs, e[e.length - 1].slotMs);
  // Nothing asked any more for that protocol.
  assert.deepEqual(U.gapEntries({ ...p, unrecorded_unknown: unk.unknownNext }, logs, opts()), []);
});

test('UP-17: an answer is never written twice (a second plan over the written rows asks nothing)', () => {
  const p = weekly();
  const e = U.gapEntries(p, [], opts());
  const plan = U.planUnrecordedAnswer({ protocol: p, entries: e, choice: 'all', nowMs: NOW });
  const after = plan.inserts.map((r, i) => ({ id: 100 + i, protocol_id: 1, ...r }));
  assert.deepEqual(U.gapEntries(p, after, opts()), []);
});

test('UP-22: the lab subset — only slots before the exam day, within the compound\'s history window, never inside the 14 days', () => {
  const p = weekly();
  const w = U.labWindow('2026-10-15', 60);
  const e = U.gapEntries(p, SEPT, opts({ fromMs: w.fromMs, beforeMs: w.beforeMs }));
  assert.deepEqual(times(e), [L(2026, 10, 5, 9), L(2026, 10, 12, 9)]);
  // A short window: nothing older.
  const short = U.labWindow('2026-10-15', 5);
  assert.deepEqual(times(U.gapEntries(p, SEPT, opts({ fromMs: short.fromMs, beforeMs: short.beforeMs }))), [L(2026, 10, 12, 9)]);
  // An exam inside the 14 days asks only what lies before the window.
  const late = U.labWindow('2026-10-30', 60);
  assert.deepEqual(times(U.gapEntries(p, SEPT, opts({ fromMs: late.fromMs, beforeMs: late.beforeMs }))), [L(2026, 10, 5, 9), L(2026, 10, 12, 9), L(2026, 10, 19, 9)]);
});

test('UP-24: the Dose log card counts the same slots as the question', () => {
  const asks = [
    { protocol: weekly(), entries: U.gapEntries(weekly(), SEPT, opts()) },
    { protocol: daily(), entries: U.gapEntries(daily(), [], opts()) },
  ];
  const c = U.cardSummary(asks, NOW, null);
  assert.equal(c.n, 38);
  assert.equal(c.k, 2);
  assert.equal(c.fromMs, L(2026, 9, 15, 8));
  assert.equal(c.toMs, L(2026, 10, 19, 9));
  assert.equal(c.beforeMs, L(2026, 10, 20));
  assert.equal(U.cardSummary([], NOW, null), null);
});

test('UP-34: the lab line counts Missed rows in the 14 days before the exam; app-written rows older than today\'s window are left out', () => {
  const logs = [
    row(1, 1, 'Missed', L(2026, 10, 20, 9)), row(2, 2, 'Missed', L(2026, 10, 29, 8)), row(3, 2, 'Missed', L(2026, 10, 30, 8)), // on the exam day: not before it
    row(4, 2, 'Missed', L(2026, 10, 15, 8)), // before the 14 days of the exam
    row(5, 2, 'Taken', L(2026, 10, 25, 8)),
  ];
  assert.equal(U.labMissedCount(logs, '2026-10-30', { nowMs: NOW, zoneHistory: null }), 2);
  // An exam of 2026-10-25: 10-11 … 10-24; 10-15 is an app row older than today's window → in the question, not here.
  assert.equal(U.labMissedCount(logs, '2026-10-25', { nowMs: NOW, zoneHistory: null }), 1);
  const person = logs.map((l) => (l.id === 4 ? { ...l, outcome_by_person: 1 } : l));
  assert.equal(U.labMissedCount(person, '2026-10-25', { nowMs: NOW, zoneHistory: null }), 2);
  assert.equal(U.labMissedCount([], '2026-10-25', { nowMs: NOW }), 0);
});

test('UP-20 / UP-21: once a day; after the third "Agora não" in a row Today stops; a new period starts the count again', () => {
  const day = '2026-11-03';
  let st = null;
  assert.equal(U.todayMayAsk(st, { dayKey: day, newestMs: 10 }), true);
  st = U.afterShown(st, { dayKey: day, newestMs: 10 });
  assert.equal(U.todayMayAsk(st, { dayKey: day, newestMs: 10 }), false, 'once a day');
  st = U.afterLater(st);
  st = U.afterShown(st, { dayKey: '2026-11-04', newestMs: 10 }); st = U.afterLater(st);
  st = U.afterShown(st, { dayKey: '2026-11-05', newestMs: 10 }); st = U.afterLater(st);
  assert.equal(st.later, 3);
  assert.equal(U.todayMayAsk(st, { dayKey: '2026-11-06', newestMs: 10 }), false, 'stops after the third');
  assert.equal(U.todayMayAsk(st, { dayKey: '2026-11-06', newestMs: 20 }), true, 'a later absence starts again');
  st = U.afterShown(st, { dayKey: '2026-11-06', newestMs: 20 });
  assert.equal(st.later, 0);
  st = U.afterAnswered(U.afterLater(st));
  assert.equal(st.later, 0, 'an answer breaks the run');
});
