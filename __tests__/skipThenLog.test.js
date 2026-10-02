'use strict';
// A-78 complete (founder 2026-10-01, "aprovo tudo, faz o A-78 completo"): a dose skipped on
// Today and logged later. Before this fix Today's Skip wrote its Skipped row at the TAP time
// and Today's Mark taken passed no slot, so the app guessed which row a later Take belonged
// to (twice-daily: skip 08:00 at 08:05, log it at 08:30, take the evening dose at 20:02 →
// Taken@08:05 + Taken@08:30 and nothing in the evening).
//
// Now every path names its slot:
//  - Skip on a Today card stamps the Skipped row at the scheduled time of the slot it skips
//    (planSkipToday, the card's earliest open slot), never moving supply;
//  - the card (lib/dosePageState.js cardPlan) treats Skipped as filled: its main time, Due
//    and Mark taken / Skip are for the next OPEN slot; each skipped slot has its own
//    "Skipped — you can still log it" line whose Mark taken carries that row (flipRowId);
//  - planMarkTaken flips exactly flipRowId (Taken at the TAP time, S-25), and its Undo puts
//    the row back to Skipped at its original time.
// Every scenario runs the same pure planners the app applies on an in-memory dose_logs table
// with a fixed clock, and ends with the exact set of rows.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planMarkTaken, planSkipToday, planUndoTake, notificationTakeTarget } = require('../lib/markTaken');
const { cardPlan, planDosePage } = require('../lib/dosePageState');

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const iso = (ms) => new Date(ms).toISOString();
const DAY = '2026-10-01';
const at = (h, min = 0) => local(2026, 10, 1, h, min);
const twice = (over = {}) => ({
  id: 7, user_id: 'u1', remote_id: 'r7', name: 'BPC', type: 'oral', active: 1, start_date: '2026-09-01', interval_days: 1,
  doses_per_day: 2, reminder_time: '20:00,08:00', created_at: iso(local(2026, 9, 1, 7, 0)), ...over,
});

// The writes recordSkipToday / recordDoseTaken / applyUndo perform, on a list of rows.
function table(protocol, initial = []) {
  let rows = initial.map((r) => ({ ...r }));
  let nextId = 500;
  return {
    rows: () => rows.map((r) => ({ id: r.id, outcome: r.outcome, logged_at: r.logged_at, ...(r.injection_site ? { injection_site: r.injection_site } : {}) })),
    card: (nowMs) => cardPlan({ protocol, logs: rows, nowMs }),
    skip(slot, nowMs) {
      const plan = planSkipToday({ protocol, todayLogs: rows, slotMs: slot ? slot.slotMs : null, nowMs });
      assert.ok(plan.insert, 'the skip writes a row');
      assert.equal(plan.vialUpdate, null, 'a skip never moves the vial');
      assert.equal(plan.oralUpdate, null, 'a skip never moves the oral supply');
      const id = nextId++;
      rows.push({ id, ...plan.insert });
      return id;
    },
    take(write, nowMs, extra = {}) {
      const plan = planMarkTaken({ protocol, todayLogs: rows, nowMs, ...write, ...extra });
      if (plan.alreadyTaken) return { alreadyLogged: true };
      if (plan.update) {
        const { id, ...fields } = plan.update;
        rows = rows.map((r) => (r.id === id ? { ...r, ...fields } : r));
        return { logId: id, flipped: true, flippedFrom: plan.flippedFrom, prevLoggedAt: plan.prevLoggedAt, prevInjectionSite: plan.prevInjectionSite, plan };
      }
      const id = nextId++;
      rows.push({ id, ...plan.insert });
      return { logId: id, flipped: false, plan };
    },
    undo(record) {
      const plan = planUndoTake(record);
      if (plan.restoreMissedId != null) {
        rows = rows.map((r) => (r.id === plan.restoreMissedId
          ? { ...r, outcome: plan.restoreOutcome, injection_site: plan.restoreSite, ...(plan.restoreLoggedAt ? { logged_at: plan.restoreLoggedAt } : {}) }
          : r));
      }
      rows = rows.filter((r) => !plan.deleteIds.includes(r.id));
    },
  };
}
const sorted = (rows) => [...rows].sort((a, b) => (a.logged_at < b.logged_at ? -1 : 1));

test('A-78 journey: twice-daily, skip 08:00 at 08:05, log it at 08:30 via its line, take the evening dose at 20:02 → exactly 2 rows', () => {
  const t = table(twice());
  // 08:05: the card offers the 08:00 dose; Skip stamps the row at 08:00 (the slot), not the tap.
  const c1 = t.card(at(8, 5));
  assert.equal(c1.next.slotMs, at(8, 0));
  const skipId = t.skip(c1.next, at(8, 5));
  assert.deepEqual(t.rows(), [{ id: skipId, outcome: 'Skipped', logged_at: iso(at(8, 0)) }]);
  // 08:30: the skipped line of 08:00 logs THAT dose (its row), the card's main button is 20:00.
  const c2 = t.card(at(8, 30));
  assert.equal(c2.next.slotMs, at(20, 0), 'the main Mark taken moved to the next open slot');
  assert.equal(c2.skipped.length, 1);
  assert.equal(c2.skipped[0].slotMs, at(8, 0));
  assert.equal(c2.skipped[0].flipRowId, skipId);
  assert.equal(c2.skipped[0].canTake, true);
  const r = t.take({ dayKey: DAY, slotMs: c2.skipped[0].slotMs, flipRowId: c2.skipped[0].flipRowId }, at(8, 30));
  assert.equal(r.logId, skipId, 'the Skipped row is turned into Taken, never a second row');
  // 20:02: the main button logs the evening slot.
  const c3 = t.card(at(20, 2));
  assert.equal(c3.next.slotMs, at(20, 0));
  assert.equal(c3.skipped.length, 0);
  t.take({ dayKey: DAY, slotMs: c3.next.slotMs, flipRowId: c3.next.flipRowId }, at(20, 2));
  assert.deepEqual(sorted(t.rows()), [
    { id: skipId, outcome: 'Taken', logged_at: iso(at(8, 30)) },
    { id: 501, outcome: 'Taken', logged_at: iso(at(20, 2)) },
  ]);
  assert.equal(t.card(at(20, 3)).next, null, 'both slots filled: no main Mark taken / Skip');
});

test('A-78 journey: once-daily, skip at 07:00, log at 21:00 via the line → 1 row Taken@21:00; Undo → Skipped@07:00 again', () => {
  const p = twice({ doses_per_day: 1, reminder_time: '07:00' });
  const t = table(p);
  const c1 = t.card(at(7, 0));
  const skipId = t.skip(c1.next, at(7, 0));
  const c2 = t.card(at(21, 0));
  assert.equal(c2.next, null, 'the only slot is filled (skipped): no main buttons');
  assert.equal(c2.skipped.length, 1);
  const r = t.take({ dayKey: DAY, slotMs: c2.skipped[0].slotMs, flipRowId: c2.skipped[0].flipRowId }, at(21, 0));
  assert.deepEqual(t.rows(), [{ id: skipId, outcome: 'Taken', logged_at: iso(at(21, 0)) }]);
  assert.equal(r.prevLoggedAt, iso(at(7, 0)));
  t.undo({ logId: r.logId, flipped: true, flippedFrom: r.flippedFrom, prevLoggedAt: r.prevLoggedAt, prevInjectionSite: r.prevInjectionSite, protocolId: 7 });
  assert.deepEqual(t.rows(), [{ id: skipId, outcome: 'Skipped', logged_at: iso(at(7, 0)) }], 'the original time is restored');
});

test('A-78 journey: both slots skipped, then the evening one logged via its line → evening Taken, morning still Skipped', () => {
  const t = table(twice());
  const m = t.skip(t.card(at(8, 5)).next, at(8, 5));
  const c = t.card(at(20, 5));
  assert.equal(c.next.slotMs, at(20, 0));
  const e = t.skip(c.next, at(20, 5));
  const c2 = t.card(at(21, 0));
  assert.equal(c2.next, null);
  assert.deepEqual(c2.skipped.map((s) => s.flipRowId), [m, e]);
  const eve = c2.skipped.find((s) => s.slotMs === at(20, 0));
  t.take({ dayKey: DAY, slotMs: eve.slotMs, flipRowId: eve.flipRowId }, at(21, 0));
  assert.deepEqual(sorted(t.rows()), [
    { id: m, outcome: 'Skipped', logged_at: iso(at(8, 0)) },
    { id: e, outcome: 'Taken', logged_at: iso(at(21, 0)) },
  ]);
  // The morning line still logs the morning dose only.
  const c3 = t.card(at(21, 5));
  assert.deepEqual(c3.skipped.map((s) => [s.slotMs, s.flipRowId]), [[at(8, 0), m]]);
});

test('A-78 journey: first day with only the 20:00 slot expected — skip then log → 1 row Taken', () => {
  const p = twice({ created_at: iso(at(12, 0)) });
  const t = table(p);
  const c1 = t.card(at(20, 5));
  assert.equal(c1.next.slotMs, at(20, 0));
  const id = t.skip(c1.next, at(20, 5));
  const c2 = t.card(at(20, 30));
  assert.equal(c2.next, null, 'the only expected slot today is filled');
  t.take({ dayKey: DAY, slotMs: c2.skipped[0].slotMs, flipRowId: c2.skipped[0].flipRowId }, at(20, 30));
  assert.deepEqual(t.rows(), [{ id, outcome: 'Taken', logged_at: iso(at(20, 30)) }]);
});

test('A-78: first day, an old notification without a slot: "all slots filled" counts the doses expected that day', () => {
  const p = twice({ created_at: iso(at(12, 0)) });
  const skipped = { id: 60, protocol_id: 7, outcome: 'Skipped', logged_at: iso(at(20, 0)) };
  const plan = planMarkTaken({ protocol: p, todayLogs: [skipped], nowMs: at(20, 30) });
  assert.equal(plan.insert, null, 'one slot expected today and it is skipped: this dose is that one');
  assert.equal(plan.update && plan.update.id, 60);
  assert.equal(plan.update.logged_at, iso(at(20, 30)), 'a Taken dose\'s time is the tap (S-25)');
});

test('A-78 journey: a legacy Skipped row written at the tap time (08:05) is still logged from its line (flips that row)', () => {
  const legacy = { id: 70, protocol_id: 7, outcome: 'Skipped', logged_at: iso(at(8, 5)) };
  const t = table(twice(), [legacy]);
  const c = t.card(at(9, 0));
  assert.equal(c.next.slotMs, at(20, 0), 'the legacy skip fills the 08:00 slot');
  assert.deepEqual(c.skipped.map((s) => [s.slotMs, s.flipRowId]), [[at(8, 0), 70]]);
  t.take({ dayKey: DAY, slotMs: c.skipped[0].slotMs, flipRowId: c.skipped[0].flipRowId }, at(9, 0));
  assert.deepEqual(t.rows(), [{ id: 70, outcome: 'Taken', logged_at: iso(at(9, 0)) }]);
});

test('A-78 journey: notification "Mark as taken" for the skipped 08:00 slot flips that row; for 20:00 it inserts', () => {
  const t = table(twice());
  const skipId = t.skip(t.card(at(8, 5)).next, at(8, 5));
  // The 08:00 banner tapped at 08:30 (the notification passes its day and slot).
  const tgt8 = notificationTakeTarget({ dayKey: DAY, slotMs: at(8, 0), nowMs: at(8, 30) });
  const r8 = t.take(tgt8, at(8, 30));
  assert.equal(r8.logId, skipId);
  assert.deepEqual(t.rows(), [{ id: skipId, outcome: 'Taken', logged_at: iso(at(8, 30)) }]);
  // The 20:00 banner tapped at 20:01.
  const tgt20 = notificationTakeTarget({ dayKey: DAY, slotMs: at(20, 0), nowMs: at(20, 1) });
  const r20 = t.take(tgt20, at(20, 1));
  assert.equal(r20.flipped, false);
  assert.deepEqual(sorted(t.rows()), [
    { id: skipId, outcome: 'Taken', logged_at: iso(at(8, 30)) },
    { id: r20.logId, outcome: 'Taken', logged_at: iso(at(20, 1)) },
  ]);
});

test('A-78 journey: the 20:00 banner when 08:00 was skipped leaves the morning skip alone', () => {
  const t = table(twice());
  const skipId = t.skip(t.card(at(8, 5)).next, at(8, 5));
  t.take(notificationTakeTarget({ dayKey: DAY, slotMs: at(20, 0), nowMs: at(20, 1) }), at(20, 1));
  const rows = sorted(t.rows());
  assert.deepEqual(rows[0], { id: skipId, outcome: 'Skipped', logged_at: iso(at(8, 0)) });
  assert.equal(rows[1].outcome, 'Taken');
  assert.equal(rows.length, 2);
});

test('A-78: the card\'s label, Due and main buttons move to the next open slot after a skip', () => {
  const t = table(twice());
  const c0 = t.card(at(8, 1));
  assert.equal(c0.next.slotMs, at(8, 0));
  assert.equal(c0.due, true, '08:00 is due at 08:01');
  t.skip(c0.next, at(8, 1));
  const c1 = t.card(at(8, 2));
  assert.equal(c1.next.slotMs, at(20, 0), 'label / buttons: 20:00');
  assert.equal(c1.next.ti, 1);
  assert.equal(c1.due, false, '20:00 is not due at 08:02');
  assert.equal(t.card(at(19, 55)).due, true, 'due 5 minutes before');
  assert.equal(c1.taken, 0);
  assert.equal(c1.allFilled, false);
});

test('A-78: a skip of today\'s slot that already has a row writes nothing; without a reminder time it is stamped at the tap', () => {
  const p = twice();
  const existing = [{ id: 1, protocol_id: 7, outcome: 'Taken', logged_at: iso(at(8, 0)) }];
  assert.equal(planSkipToday({ protocol: p, todayLogs: existing, slotMs: at(8, 0), nowMs: at(8, 5) }).insert, null);
  const noTime = twice({ doses_per_day: 1, reminder_time: '' });
  const plan = planSkipToday({ protocol: noTime, todayLogs: [], slotMs: null, nowMs: at(9, 0) });
  assert.equal(plan.insert.logged_at, iso(at(9, 0)));
  assert.equal(plan.insert.outcome, 'Skipped');
  assert.equal(plan.insert.protocol_remote_id, 'r7');
});

test('A-78: a second tap on an already-logged skipped line never writes a second row (flipRowId already Taken)', () => {
  const t = table(twice());
  const id = t.skip(t.card(at(8, 5)).next, at(8, 5));
  t.take({ dayKey: DAY, slotMs: at(8, 0), flipRowId: id }, at(8, 30));
  const again = t.take({ dayKey: DAY, slotMs: at(8, 0), flipRowId: id }, at(8, 31));
  assert.equal(again.alreadyLogged, true);
  assert.equal(t.rows().length, 1);
});

test('A-78: flipping a skipped row keeps a site already on it unless a new one is chosen, and Undo restores it', () => {
  const skipped = { id: 80, protocol_id: 7, outcome: 'Skipped', logged_at: iso(at(8, 0)), injection_site: 'abdomen-L' };
  const t = table(twice({ type: 'recon' }), [skipped]);
  const r = t.take({ dayKey: DAY, slotMs: at(8, 0), flipRowId: 80 }, at(9, 0), { injectionSite: 'thigh-R' });
  assert.equal(t.rows()[0].injection_site, 'thigh-R');
  assert.equal(r.prevInjectionSite, 'abdomen-L');
  t.undo({ logId: 80, flipped: true, flippedFrom: 'Skipped', prevLoggedAt: r.prevLoggedAt, prevInjectionSite: r.prevInjectionSite });
  assert.deepEqual(t.rows(), [{ id: 80, outcome: 'Skipped', logged_at: iso(at(8, 0)), injection_site: 'abdomen-L' }]);
});

test('A-78: flipRowId of another protocol or another day is ignored (falls back to the slot rules)', () => {
  const other = { id: 90, protocol_id: 8, outcome: 'Skipped', logged_at: iso(at(8, 0)) };
  const yest = { id: 91, protocol_id: 7, outcome: 'Skipped', logged_at: iso(local(2026, 9, 30, 8, 0)) };
  const p = planMarkTaken({ protocol: twice(), todayLogs: [other, yest], dayKey: DAY, slotMs: at(20, 0), flipRowId: 90, nowMs: at(20, 1) });
  assert.equal(p.update, null);
  assert.ok(p.insert);
  const q = planMarkTaken({ protocol: twice(), todayLogs: [other, yest], dayKey: DAY, slotMs: at(20, 0), flipRowId: 91, nowMs: at(20, 1) });
  assert.equal(q.update, null);
});

test('A-78 S-26: the dose page of a skipped slot today offers Mark taken (that row), Undo, and no Skip; a Taken slot never offers Mark taken', () => {
  const t = table(twice());
  const id = t.skip(t.card(at(8, 5)).next, at(8, 5));
  const a = planDosePage({ protocol: twice(), logs: t.rows().map((r) => ({ ...r, protocol_id: 7 })), dayKey: DAY, slotMs: at(8, 0), nowMs: at(8, 30) });
  assert.equal(a.kind, 'skipped');
  assert.equal(a.canTake, true);
  assert.equal(a.canSkip, false);
  assert.equal(a.canUndo, true);
  assert.deepEqual(a.write, { path: 'today', dayKey: DAY, slotMs: at(8, 0), flipRowId: id, ti: 0 });
  // 20:00 is now the earliest open slot (the skip filled 08:00).
  const b = planDosePage({ protocol: twice(), logs: t.rows().map((r) => ({ ...r, protocol_id: 7 })), dayKey: DAY, slotMs: at(20, 0), nowMs: at(19, 58) });
  assert.equal(b.kind, 'due');
  assert.equal(b.canTake, true);
  assert.deepEqual(b.write, { path: 'today', dayKey: DAY, slotMs: at(20, 0), flipRowId: null, ti: 1 });
  t.take({ dayKey: DAY, slotMs: a.write.slotMs, flipRowId: a.write.flipRowId }, at(8, 30));
  const c = planDosePage({ protocol: twice(), logs: t.rows().map((r) => ({ ...r, protocol_id: 7 })), dayKey: DAY, slotMs: at(8, 0), nowMs: at(8, 31) });
  assert.equal(c.kind, 'taken');
  assert.equal(c.canTake, false, 'never a second Mark taken');
});
