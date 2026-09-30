'use strict';
// A-40 (S-17) closure, founder 2026-09-30: the device overnight check is replaced by
// clock-faked round trips. Every step uses the same pure planners the app applies
// (lib/pendingYesterday.js, lib/markTaken.js) on an in-memory list of dose_log rows,
// with a fixed clock (nowMs) instead of waiting for real time to pass.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pendingFromYesterday, pendingPromptFor } = require('../lib/pendingYesterday');
const { planMarkTaken, planSkipPending, planUndoTake, notificationTakeTarget } = require('../lib/markTaken');

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const iso = (ms) => new Date(ms).toISOString();
const SLOT = local(2026, 9, 29, 19, 20); // yesterday's 19:20 dose (like BPC-157 on Test03)
const MORNING = local(2026, 9, 30, 6, 30); // next morning, inside slot + 12 h
const proto = { id: 7, user_id: 'u1', remote_id: 'r7', name: 'BPC-157', type: 'recon', active: 1, start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '19:20', created_at: iso(local(2026, 9, 1, 7, 0)), dose: '0.25', dose_unit: 'mg', amount: '5', unit: 'mg' };

// A tiny in-memory dose_logs table + the apply steps recordDoseTaken / recordSkipPending /
// undoTake perform (lib/doseActions.js, screens/TodayScreen.js undoTake).
function db() {
  let rows = [];
  let nextId = 1;
  const dayRows = (dayKey) => rows.filter((l) => {
    const [y, m, d] = dayKey.split('-').map(Number);
    const t = Date.parse(l.logged_at);
    return t >= local(y, m, d) && t < local(y, m, d + 1);
  });
  return {
    rows: () => rows,
    take(opts, nowMs, vial = null) {
      const plan = planMarkTaken({ protocol: proto, vial, todayLogs: dayRows(opts.dayKey || '2026-09-30'), dayKey: opts.dayKey, slotMs: opts.slotMs, atNow: opts.atNow, nowMs });
      if (plan.alreadyTaken) return { logId: null, alreadyLogged: true };
      let logId;
      if (plan.update) { rows = rows.map((r) => (r.id === plan.update.id ? { ...r, outcome: 'Taken' } : r)); logId = plan.update.id; }
      else { logId = nextId++; rows.push({ id: logId, ...plan.insert }); }
      return { logId, flipped: plan.flipped, vialId: plan.vialUpdate ? plan.vialUpdate.id : null, prevVialDosesTaken: plan.prevVialDosesTaken, oralPrevUnitsTaken: plan.prevUnitsTaken, takenAfter: plan.takenAfter };
    },
    skip(item, nowMs) {
      const plan = planSkipPending({ protocol: proto, todayLogs: dayRows(item.dayKey), dayKey: item.dayKey, slotMs: item.slotMs, nowMs });
      if (!plan.insert) return null;
      const logId = nextId++;
      rows.push({ id: logId, ...plan.insert });
      return { logId };
    },
    undo(undoData) {
      const u = planUndoTake(undoData);
      if (u.restoreMissedId != null) rows = rows.map((r) => (r.id === u.restoreMissedId ? { ...r, outcome: 'Missed', injection_site: null } : r));
      rows = rows.filter((r) => !u.deleteIds.includes(r.id));
      return u;
    },
    add(outcome, ms) { const id = nextId++; rows.push({ id, protocol_id: proto.id, outcome, logged_at: iso(ms) }); return id; },
  };
}
const pending = (d, nowMs) => pendingFromYesterday({ protocols: [proto], logs: d.rows(), nowMs });

test('S-17: the block shows yesterday\'s unlogged 19:20 slot from midnight until slot + 12 h, then disappears', () => {
  const d = db();
  assert.equal(pending(d, local(2026, 9, 29, 23, 59)).length, 0, 'before midnight the slot is today\'s, not "yesterday"');
  assert.equal(pending(d, local(2026, 9, 30, 0, 0)).length, 1, 'shown from midnight');
  assert.equal(pending(d, MORNING)[0].slotMs, SLOT);
  assert.equal(pending(d, SLOT + 12 * 3600000 - 60000).length, 1, 'still shown one minute before slot + 12 h');
  assert.equal(pending(d, SLOT + 12 * 3600000).length, 0, 'gone at slot + 12 h (the Missed scan owns it from then)');
});

test('S-17: Taken on the pending row logs AT yesterday\'s slot, the row leaves the block, today stays due', () => {
  const d = db();
  const item = pending(d, MORNING)[0];
  const res = d.take({ dayKey: item.dayKey, slotMs: item.slotMs }, MORNING);
  assert.equal(d.rows().length, 1);
  assert.equal(d.rows()[0].outcome, 'Taken');
  assert.equal(Date.parse(d.rows()[0].logged_at), SLOT, 'logged at 19:20 yesterday, never the tap time');
  assert.equal(res.flipped, false);
  assert.equal(pending(d, MORNING).length, 0, 'no longer pending');
  const today = d.take({}, local(2026, 9, 30, 19, 25));
  assert.ok(today.logId, 'today\'s dose can still be logged (yesterday\'s row never used today\'s slot)');
});

test('S-17: Undo after Taken on the pending row removes it, the slot is pending again, today\'s count untouched', () => {
  const d = db();
  const item = pending(d, MORNING)[0];
  const res = d.take({ dayKey: item.dayKey, slotMs: item.slotMs }, MORNING);
  const u = d.undo({ logId: res.logId, flipped: res.flipped, pending: true, protocolId: proto.id, vialId: null, prevDosesTaken: null, oralPrevUnitsTaken: null, fx: null });
  assert.equal(d.rows().length, 0, 'the Taken row is deleted');
  assert.equal(u.todayCount, 'none', 'a pending undo never changes today\'s cards');
  assert.equal(pending(d, MORNING).length, 1, 'yesterday\'s slot is pending again');
});

test('S-17: Undo after Taken restores the vial count it moved', () => {
  const d = db();
  const item = pending(d, MORNING)[0];
  const res = d.take({ dayKey: item.dayKey, slotMs: item.slotMs }, MORNING, { id: 3, protocol_id: 7, doses_taken: 4, total_doses: 20 });
  assert.equal(res.vialId, 3);
  const u = d.undo({ logId: res.logId, flipped: false, pending: true, protocolId: proto.id, vialId: res.vialId, prevDosesTaken: res.prevVialDosesTaken, oralPrevUnitsTaken: null, fx: null });
  assert.deepEqual(u.vialRestore, { id: 3, doses_taken: 4, active: 1 });
});

test('S-17: Skipped on the pending row writes one Skipped at the slot; Undo removes it and the slot is pending again', () => {
  const d = db();
  const item = pending(d, MORNING)[0];
  const res = d.skip(item, MORNING);
  assert.equal(d.rows().length, 1);
  assert.equal(d.rows()[0].outcome, 'Skipped');
  assert.equal(Date.parse(d.rows()[0].logged_at), SLOT, 'Skipped at 19:20 yesterday, never the tap time');
  assert.equal(pending(d, MORNING).length, 0);
  const u = d.undo({ logId: res.logId, flipped: false, pending: true, protocolId: proto.id, vialId: null, prevDosesTaken: null, oralPrevUnitsTaken: null, fx: null });
  assert.equal(u.vialRestore, null, 'a skip never moved supply, so undo restores none');
  assert.equal(d.rows().length, 0);
  assert.equal(pending(d, MORNING).length, 1, 'pending again');
});

test('S-17: a flipped Missed row goes back to Missed on Undo (never deleted)', () => {
  const d = db();
  const missedId = d.add('Missed', SLOT);
  const res = d.take({ dayKey: '2026-09-29', slotMs: SLOT }, MORNING);
  assert.equal(res.flipped, true);
  assert.equal(res.logId, missedId);
  d.undo({ logId: res.logId, flipped: true, pending: true, protocolId: proto.id, vialId: null, prevDosesTaken: null, oralPrevUnitsTaken: null, fx: null });
  assert.equal(d.rows().length, 1);
  assert.equal(d.rows()[0].outcome, 'Missed');
});

test('S-17: Mark taken on today\'s card with a pending slot → the prompt is for the earliest pending slot of THAT protocol', () => {
  const d = db();
  const list = pending(d, MORNING);
  assert.equal(pendingPromptFor(list, proto.id).slotMs, SLOT, 'prompt shown');
  assert.equal(pendingPromptFor(list, 99), null, 'another protocol: no prompt');
  assert.equal(pendingPromptFor(list, proto.id, { pendingResolved: true }), null, 'after a choice, the retap never prompts again');
  const two = [{ protocolId: 7, slotMs: 20 }, { protocolId: 7, slotMs: 10 }, { protocolId: 8, slotMs: 5 }];
  assert.equal(pendingPromptFor(two, 7).slotMs, 10, 'earliest slot first');
});

test('S-17: prompt → "yesterday" (the default) logs at yesterday\'s slot; today\'s dose stays due', () => {
  const d = db();
  const pend = pendingPromptFor(pending(d, MORNING), proto.id);
  d.take({ dayKey: pend.dayKey, slotMs: pend.slotMs }, MORNING);
  assert.equal(Date.parse(d.rows()[0].logged_at), SLOT);
  assert.equal(d.rows().filter((r) => Date.parse(r.logged_at) >= local(2026, 9, 30)).length, 0, 'nothing written on today');
});

test('S-17: prompt → "today, skip yesterday" writes Skipped at yesterday\'s slot + Taken now; Undo removes both', () => {
  const d = db();
  const pend = pendingPromptFor(pending(d, MORNING), proto.id);
  const skipped = d.skip(pend, MORNING);
  const res = d.take({}, MORNING);
  const outcomes = d.rows().map((r) => [r.outcome, Date.parse(r.logged_at)]);
  assert.deepEqual(outcomes, [['Skipped', SLOT], ['Taken', MORNING]]);
  assert.equal(pending(d, MORNING).length, 0);
  const u = d.undo({ logId: res.logId, flipped: false, pending: false, extraDeleteIds: [skipped.logId], protocolId: proto.id, vialId: null, prevDosesTaken: null, oralPrevUnitsTaken: null, fx: null });
  assert.equal(d.rows().length, 0, 'both rows removed');
  assert.equal(u.todayCount, 'decrement', 'today\'s count goes back down');
  assert.equal(pending(d, MORNING).length, 1, 'yesterday is pending again');
});

test('S-17: Undo of today\'s take whose animation has not landed resets the button instead of decrementing', () => {
  assert.equal(planUndoTake({ logId: 1, flipped: false, pending: false, fx: { applied: false } }).todayCount, 'reset');
  assert.equal(planUndoTake({ logId: 1, flipped: false, pending: false, fx: { applied: true } }).todayCount, 'decrement');
});

test('S-17: notification "Mark taken" after midnight inside slot + 12 h logs to yesterday\'s slot (end to end)', () => {
  const d = db();
  const target = notificationTakeTarget({ dayKey: '2026-09-29', slotMs: SLOT, snoozed: true, nowMs: local(2026, 9, 30, 0, 40) });
  d.take(target, local(2026, 9, 30, 0, 40));
  assert.equal(Date.parse(d.rows()[0].logged_at), SLOT);
  assert.equal(pending(d, local(2026, 9, 30, 0, 41)).length, 0, 'no pending row left behind');
  const d2 = db();
  const late = notificationTakeTarget({ dayKey: '2026-09-29', slotMs: SLOT, snoozed: true, nowMs: SLOT + 12 * 3600000 + 60000 });
  d2.take(late, SLOT + 12 * 3600000 + 60000);
  assert.equal(Date.parse(d2.rows()[0].logged_at), SLOT + 12 * 3600000 + 60000, 'past the window a snoozed copy logs now');
});

test('S-17: TodayScreen applies planUndoTake and pendingPromptFor (the tested functions are the ones on screen)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'TodayScreen.js'), 'utf8');
  const u = src.indexOf('async function undoTake(');
  assert.match(src.slice(u, src.indexOf('\n  function ', u + 10)), /planUndoTake\(/);
  const h = src.indexOf('function handleTake(');
  assert.match(src.slice(h, h + 3000), /pendingPromptFor\(/);
});
