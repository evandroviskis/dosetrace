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

// Founder decision 2026-09-28 (#031 reply, item 1): a notification "Mark taken"
// tapped after midnight — snoozed copy or original — logs to YESTERDAY's slot while
// now < slot + 12 h (the Missed scan's window), using the notification's slotMs.
// After that window a snoozed copy is logged now (honestly late), as before.
test('A-40: a snoozed dose tapped after midnight inside slot + 12 h logs to yesterday\'s slot', () => {
  const { notificationTakeTarget } = require('../lib/markTaken');
  assert.equal(typeof notificationTakeTarget, 'function', 'notificationTakeTarget not built yet');
  const slotMs = local(2026, 9, 27, 23, 30);
  const t = notificationTakeTarget({ dayKey: '2026-09-27', slotMs, snoozed: true, nowMs: local(2026, 9, 28, 0, 30) });
  assert.deepEqual(t, { dayKey: '2026-09-27', slotMs });
  const late = notificationTakeTarget({ dayKey: '2026-09-27', slotMs, snoozed: true, nowMs: local(2026, 9, 28, 11, 31) });
  assert.deepEqual(late, { atNow: true }, 'past slot + 12 h: logged now');
  const same = notificationTakeTarget({ dayKey: '2026-09-28', slotMs: local(2026, 9, 28, 8, 0), snoozed: true, nowMs: local(2026, 9, 28, 9, 0) });
  assert.deepEqual(same, { dayKey: '2026-09-28', slotMs: local(2026, 9, 28, 8, 0) }, 'same day: that slot');
  const orig = notificationTakeTarget({ dayKey: '2026-09-27', slotMs, snoozed: false, nowMs: local(2026, 9, 28, 0, 30) });
  assert.deepEqual(orig, { dayKey: '2026-09-27', slotMs }, 'an un-snoozed banner from yesterday: that slot (unchanged)');
});

test('A-40: notificationActions.markTaken routes through notificationTakeTarget', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'notificationActions.js'), 'utf8');
  const i = src.indexOf('async function markTaken(');
  assert.match(src.slice(i, src.indexOf('\nasync function ', i + 10)), /notificationTakeTarget\(/);
});

// A-78 (registry, 2026-10-01): twice-daily, Skip then "you can still log it" inserted a
// second row (Taken) next to the Skipped one, so one slot held Skipped + Taken. Logging a
// skipped dose now turns that Skipped row into Taken, like an auto-Missed row; its Undo
// puts it back to Skipped.
const { planUndoTake } = require('../lib/markTaken');
// Council backend 2026-10-01 (verified): without slot identity, flipping "the day's
// earliest Skipped row" turned a morning skip into Taken@08:05 when the user logged the
// EVENING dose at 20:00 — erasing a skip the user entered and moving the dose by 12 h.
// Without a slot, a Skipped row is never touched; only a slot-matched Skipped row flips.
test('A-78: without a slot, a Skipped row is never overwritten (the 20:00 dose is a new row)', () => {
  const skipped = { id: 20, protocol_id: 1, outcome: 'Skipped', logged_at: new Date(local(2026, 9, 27, 8, 5)).toISOString() };
  const p = planMarkTaken({ protocol: recon, todayLogs: [skipped], nowMs: NOW });
  assert.equal(p.update, null, 'the morning skip stays Skipped');
  assert.ok(p.insert, 'the evening dose is its own Taken row');
  assert.equal(p.flipped, false);
});

test('A-78: with a slot, only the Skipped row at that slot flips; another slot keeps its Skipped row', () => {
  const at8 = local(2026, 9, 27, 8, 0);
  const at20 = local(2026, 9, 27, 20, 0);
  const skipped8 = { id: 21, protocol_id: 1, outcome: 'Skipped', logged_at: new Date(at8).toISOString() };
  const p20 = planMarkTaken({ protocol: recon, todayLogs: [skipped8], dayKey: '2026-09-27', slotMs: at20, nowMs: NOW });
  assert.equal(p20.update, null, '08:00 stays Skipped when 20:00 is logged');
  assert.ok(p20.insert);
  const p8 = planMarkTaken({ protocol: recon, todayLogs: [skipped8], dayKey: '2026-09-27', slotMs: at8, nowMs: NOW });
  assert.equal(p8.update && p8.update.id, 21);
});

test('A-78: Undo of a flipped Skipped row puts it back to Skipped; a flipped Missed row back to Missed', () => {
  assert.equal(planUndoTake({ logId: 20, flipped: true, flippedFrom: 'Skipped' }).restoreOutcome, 'Skipped');
  assert.equal(planUndoTake({ logId: 20, flipped: true, flippedFrom: 'Skipped' }).restoreMissedId, 20);
  assert.equal(planUndoTake({ logId: 30, flipped: true }).restoreOutcome, 'Missed', 'older records default to Missed');
  assert.deepEqual(planUndoTake({ logId: 20, flipped: true, flippedFrom: 'Skipped' }).deleteIds, []);
});

test('A-78: Today restores the outcome the undo plan gives, and carries flippedFrom into its undo record', () => {
  const today = fs.readFileSync(path.join(__dirname, '..', 'screens', 'TodayScreen.js'), 'utf8');
  assert.match(today, /updateDoseLog\(plan\.restoreMissedId, \{ outcome: plan\.restoreOutcome/);
  const actions = fs.readFileSync(path.join(__dirname, '..', 'lib', 'doseActions.js'), 'utf8');
  assert.match(actions, /flippedFrom: plan\.flippedFrom/);
});

// A-78, council senior engineer 2026-10-01: without a slot, a Skipped row may flip only
// when every slot of the day is already filled (taken + skipped >= doses_per_day) — then
// the dose being logged can only be the skipped one.
test('A-78: once-daily, skip then log: the Skipped row becomes Taken (no second row)', () => {
  const daily = { ...recon, doses_per_day: 1 };
  const skipped = { id: 40, protocol_id: 1, outcome: 'Skipped', logged_at: new Date(local(2026, 9, 27, 8, 5)).toISOString() };
  const p = planMarkTaken({ protocol: daily, todayLogs: [skipped], nowMs: NOW });
  assert.equal(p.insert, null);
  assert.equal(p.update && p.update.id, 40);
  assert.equal(p.flippedFrom, 'Skipped');
});

test('A-78: twice-daily, 08:00 skipped and 20:00 taken, then "log the 08:00 dose": the Skipped row flips', () => {
  const skipped = { id: 41, protocol_id: 1, outcome: 'Skipped', logged_at: new Date(local(2026, 9, 27, 8, 5)).toISOString() };
  const taken20 = { id: 42, protocol_id: 1, outcome: 'Taken', logged_at: new Date(local(2026, 9, 27, 20, 1)).toISOString() };
  const p = planMarkTaken({ protocol: recon, todayLogs: [skipped, taken20], nowMs: NOW + 3600000 });
  assert.equal(p.insert, null, 'never a third row');
  assert.equal(p.update && p.update.id, 41);
  assert.equal(p.takenAfter, 2);
});
