'use strict';
// S-02 (FX-2 / FX-7): the ONE mark-taken plan shared by Today and the
// notification "Mark as taken" action (app-map L-07, L-08).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { planMarkTaken, markTakenDay } = require('../lib/markTaken');

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const NOW = local(2026, 9, 27, 20, 0);
const recon = { id: 1, user_id: 'u1', remote_id: 'r1', type: 'recon', doses_per_day: 2, interval_days: 1, dose: '0.5', dose_unit: 'mg', amount: '1', unit: 'mg' };

test('twice-daily: the second dose of the day is a new Taken row; a third tap is refused', () => {
  const first = { id: 10, protocol_id: 1, outcome: 'Taken', logged_at: new Date(local(2026, 9, 27, 8)).toISOString() };
  const p = planMarkTaken({ protocol: recon, todayLogs: [first], nowMs: NOW });
  assert.equal(p.alreadyTaken, false);
  assert.equal(p.update, null);
  assert.equal(p.insert.outcome, 'Taken');
  assert.equal(p.insert.protocol_remote_id, 'r1');
  assert.equal(Date.parse(p.insert.logged_at), NOW, 'today: logged now');
  const second = { id: 11, protocol_id: 1, outcome: 'Taken', logged_at: new Date(NOW).toISOString() };
  const third = planMarkTaken({ protocol: recon, todayLogs: [first, second], nowMs: NOW });
  assert.equal(third.alreadyTaken, true);
  assert.equal(third.insert, null);
  assert.equal(third.vialUpdate, null, 'a refused tap never moves the vial');
});

test('the Missed row closest to the slot is flipped; rows of other protocols or days are ignored', () => {
  const m8 = { id: 20, protocol_id: 1, outcome: 'Missed', logged_at: new Date(local(2026, 9, 26, 8)).toISOString() };
  const m20 = { id: 21, protocol_id: 1, outcome: 'Missed', logged_at: new Date(local(2026, 9, 26, 20)).toISOString() };
  const other = { id: 22, protocol_id: 2, outcome: 'Missed', logged_at: new Date(local(2026, 9, 26, 20)).toISOString() };
  const otherDay = { id: 23, protocol_id: 1, outcome: 'Taken', logged_at: new Date(local(2026, 9, 25, 20)).toISOString() };
  const p = planMarkTaken({ protocol: recon, todayLogs: [m8, m20, other, otherDay], dayKey: '2026-09-26', slotMs: local(2026, 9, 26, 20), nowMs: NOW });
  assert.equal(p.update.id, 21);
  assert.equal(p.flipped, true);
  assert.equal(p.insert, null);
});

test('a past day with no Missed row logs at that slot time, never today', () => {
  const p = planMarkTaken({ protocol: recon, todayLogs: [], dayKey: '2026-09-26', slotMs: local(2026, 9, 26, 20), nowMs: NOW });
  assert.equal(Date.parse(p.insert.logged_at), local(2026, 9, 26, 20));
  assert.equal(p.dayKey, '2026-09-26');
});

test('a future day is clamped to today; atNow (snoozed, tapped late) logs now and never flips', () => {
  assert.equal(markTakenDay({ dayKey: '2026-09-30', nowMs: NOW }).dayKey, '2026-09-27');
  const missed = { id: 30, protocol_id: 1, outcome: 'Missed', logged_at: new Date(local(2026, 9, 27, 8)).toISOString() };
  const p = planMarkTaken({ protocol: recon, todayLogs: [missed], dayKey: '2026-09-26', atNow: true, nowMs: NOW });
  assert.equal(p.dayKey, '2026-09-27');
  assert.equal(p.update, null);
  assert.equal(Date.parse(p.insert.logged_at), NOW);
});

test('the vial moves once and is closed on its last dose (derived capacity when total_doses is empty)', () => {
  const p = planMarkTaken({ protocol: recon, vial: { id: 9, doses_taken: 1, total_doses: null }, todayLogs: [], nowMs: NOW });
  assert.deepEqual(p.vialUpdate, { id: 9, doses_taken: 2, active: 0 });
  assert.equal(p.vialFinished, true);
  assert.equal(p.prevVialDosesTaken, 1);
});

test('oral supply: units move once by the calculated units per dose', () => {
  const oral = { id: 5, user_id: 'u1', type: 'oral', doses_per_day: 1, dose: '500', dose_unit: 'mg', serving_strength: '250', serving_strength_unit: 'mg', serving_units: '1', notes: 'capsule', container_units: 60, units_taken: 4 };
  const p = planMarkTaken({ protocol: oral, todayLogs: [], nowMs: NOW });
  assert.deepEqual(p.oralUpdate, { units_taken: 6 });
  assert.equal(p.prevUnitsTaken, 4);
  assert.equal(p.vialUpdate, null);
});

// FX-7: both entry points go through the same function (source guard, so a
// future edit can't quietly give Today its own write path again).
test('FX-7: Today and the notification action both mark taken through recordDoseTaken', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const body = (src, name) => {
    const i = src.indexOf(`async function ${name}(`);
    assert.ok(i >= 0, `${name} not found`);
    const next = src.indexOf('\n  async function ', i + 10);
    const nextTop = src.indexOf('\nasync function ', i + 10);
    const ends = [next, nextTop].filter((n) => n > 0);
    return src.slice(i, ends.length ? Math.min(...ends) : undefined);
  };
  const today = body(read('screens/TodayScreen.js'), 'markTaken');
  assert.match(today, /recordDoseTaken\(/, 'Today calls the shared function');
  assert.doesNotMatch(today, /insertDoseLog\(|updateVial\(|units_taken/, 'Today has no write path of its own');
  const notif = body(read('lib/notificationActions.js'), 'markTaken');
  assert.match(notif, /recordDoseTaken\(/, 'the notification calls the shared function');
  assert.match(read('lib/doseActions.js'), /planMarkTaken\(/, 'recordDoseTaken applies the shared plan');
});

// Review #013 item 2: Today must not use its (possibly stale) screen count to
// cancel reminders — the plan returns the day's Taken count after this write.
test('the plan returns the day\'s Taken count after the write (stale screen count cannot cancel the wrong slots)', () => {
  const first = { id: 10, protocol_id: 1, outcome: 'Taken', logged_at: new Date(local(2026, 9, 27, 8)).toISOString() };
  const p = planMarkTaken({ protocol: recon, todayLogs: [first], nowMs: NOW });
  assert.equal(p.takenAfter, 2, 'first logged from the banner + this one');
  const flip = planMarkTaken({ protocol: recon, todayLogs: [{ id: 12, protocol_id: 1, outcome: 'Missed', logged_at: new Date(local(2026, 9, 27, 8)).toISOString() }], nowMs: NOW });
  assert.equal(flip.takenAfter, 1, 'a flipped Missed row counts once');
});

// A-40 (S-17, review #017 item 1): "ignore yesterday's" from the Pending-from-yesterday
// prompt writes ONE Skipped row with logged_at = yesterday's slotMs — never Today's
// tap-time skip path (TodayScreen.js:745). Red until A-40 builds it. planSkipPending is a
// PLACEHOLDER name (review #018): the A-40 session may rename it or change its signature;
// the binding behavior is one Skipped row at slotMs and no vial/supply change.
test('A-40: ignore yesterday\'s pending dose → one Skipped row at yesterday\'s slot time (not the tap time)', () => {
  const { planSkipPending } = require('../lib/markTaken');
  assert.equal(typeof planSkipPending, 'function', 'planSkipPending not built yet');
  const slotMs = local(2026, 9, 26, 20, 0);
  const p = planSkipPending({ protocol: recon, todayLogs: [], dayKey: '2026-09-26', slotMs, nowMs: local(2026, 9, 27, 7, 0) });
  assert.equal(p.insert.outcome, 'Skipped');
  assert.equal(Date.parse(p.insert.logged_at), slotMs);
  assert.equal(p.vialUpdate, null, 'a skip never moves supply');
});

// Review #018 item 2: the binding behavior, not the API name (planSkipPending is a
// placeholder the A-40 session may rename): if yesterday's slot already has a row
// (any outcome), "ignore" writes nothing — never twice.
test('A-40: ignore yesterday\'s pending dose when that slot already has a row (any outcome) → writes nothing', () => {
  const { planSkipPending } = require('../lib/markTaken');
  assert.equal(typeof planSkipPending, 'function', 'planSkipPending (placeholder name) not built yet');
  const slotMs = local(2026, 9, 26, 20, 0);
  for (const outcome of ['Taken', 'Skipped', 'Missed']) {
    const existing = { id: 40, protocol_id: 1, outcome, logged_at: new Date(slotMs).toISOString() };
    const p = planSkipPending({ protocol: { ...recon, doses_per_day: 1 }, todayLogs: [existing], dayKey: '2026-09-26', slotMs, nowMs: local(2026, 9, 27, 7, 0) });
    assert.equal(p.insert, null, `no new row when the slot already has a ${outcome} row`);
  }
});

// A-40 journey review row 1 (confirmed defect in the shared planner): with a slot
// given, only a Missed row AT that slot may be flipped — never a Missed row of
// another slot that day (08:00 Missed must stay Missed when 20:00 is logged).
test('A-40: marking yesterday\'s 20:00 slot taken never flips the 08:00 Missed row of the same day', () => {
  const twice = { ...recon, doses_per_day: 2 };
  const missed8 = { id: 70, protocol_id: 1, outcome: 'Missed', logged_at: new Date(local(2026, 9, 26, 8, 0)).toISOString() };
  const p = planMarkTaken({ protocol: twice, todayLogs: [missed8], dayKey: '2026-09-26', slotMs: local(2026, 9, 26, 20, 0), nowMs: local(2026, 9, 27, 1, 0) });
  assert.equal(p.update, null, 'the 08:00 Missed row is not touched');
  assert.equal(Date.parse(p.insert.logged_at), local(2026, 9, 26, 20, 0), 'a Taken row is inserted at 20:00');
  const missed20 = { id: 71, protocol_id: 1, outcome: 'Missed', logged_at: new Date(local(2026, 9, 26, 20, 0)).toISOString() };
  const q = planMarkTaken({ protocol: twice, todayLogs: [missed8, missed20], dayKey: '2026-09-26', slotMs: local(2026, 9, 26, 20, 0), nowMs: local(2026, 9, 27, 9, 0) });
  assert.equal(q.update.id, 71, 'the Missed row AT the slot is the one flipped');
});
