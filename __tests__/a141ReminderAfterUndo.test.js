'use strict';
// A-141 (6) — Fold session 2026-10-17 (build 50), verified in code: Vitmin C (daily 12:25) was
// SKIPPED at 00:33 (the Skipped row is stamped at the slot, 12:25); at 11:00 it was marked
// complete (the row flipped to Taken, today's reminder cancelled) and then Undone (back to
// Skipped). The Reminder check then listed "Próximo lembrete sáb. 12:25 · Vitmin C" — a reminder
// for a dose the user had declared skipped.
// Cause (DV-035 / DV-040, decisions DL-08 and DL-09):
//  - lib/notifications scheduleDoseReminder counted only TAKEN rows ("the earliest takenToday
//    slots are done"), so a Skipped slot was re-armed by every resync (app foreground, refresh);
//    doseSlotResolved (snoozed copies) had the same Taken-only count;
//  - Skip on Today never touched the reminders, and Undo never re-planned them, so the state after
//    a Skip or an Undo depended on whenever the next resync came.
// Fix: lib/notificationPlan handledSlotIndexes maps the day's rows to its slots the way the Today
// card does (a row at a slot's time is that slot's; the others fill the earliest open slots) and a
// slot holding Taken or Skipped is handled; scheduleDoseReminder and doseSlotResolved use it.
// Today's Skip and Undo re-plan the dose reminders (syncAllDoseReminders, which keeps the
// reminder switches and Android server push), so Undo restores the reminder state of the previous
// outcome: back to Skipped → no reminder; back to nothing → the reminder is scheduled again.
process.env.TZ = 'America/Sao_Paulo';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');
const plan = require('../lib/notificationPlan');
const { loadFn } = require('./helpers/extractFn');

const { handledSlotIndexes } = plan;
const at = (h, m, d = 17) => new Date(2026, 9, d, h, m, 0, 0).toISOString();

test('A-141 (6): a Skipped slot is handled, like a Taken one', () => {
  const logs = [{ protocol_id: 3, outcome: 'Skipped', logged_at: at(12, 25) }];
  assert.deepEqual([...handledSlotIndexes({ reminderTime: '12:25', logs, protocolId: 3, dayKey: '2026-10-17' })], [0]);
  const taken = [{ protocol_id: 3, outcome: 'Taken', logged_at: at(11, 0) }];
  assert.deepEqual([...handledSlotIndexes({ reminderTime: '12:25', logs: taken, protocolId: 3, dayKey: '2026-10-17' })], [0]);
  assert.deepEqual([...handledSlotIndexes({ reminderTime: '12:25', logs: [], protocolId: 3, dayKey: '2026-10-17' })], []);
});

test('A-141 (6): rows land on their own slot — skipping the 20:00 dose leaves the 08:00 one owed', () => {
  const logs = [{ protocol_id: 3, outcome: 'Skipped', logged_at: at(20, 0) }];
  assert.deepEqual([...handledSlotIndexes({ reminderTime: '08:00,20:00', logs, protocolId: 3, dayKey: '2026-10-17' })], [1]);
  // a tap-time row (Mark taken at 07:40) fills the earliest open slot
  const both = [...logs, { protocol_id: 3, outcome: 'Taken', logged_at: at(7, 40) }];
  assert.deepEqual([...handledSlotIndexes({ reminderTime: '08:00,20:00', logs: both, protocolId: 3, dayKey: '2026-10-17' })].sort(), [0, 1]);
  // a Missed row is not handled; another protocol's or another day's rows never count
  const other = [{ protocol_id: 3, outcome: 'Missed', logged_at: at(8, 0) }, { protocol_id: 9, outcome: 'Taken', logged_at: at(20, 0) },
    { protocol_id: 3, outcome: 'Taken', logged_at: at(20, 0, 16) }];
  assert.deepEqual([...handledSlotIndexes({ reminderTime: '08:00,20:00', logs: other, protocolId: 3, dayKey: '2026-10-17' })], []);
});

// The real scheduleDoseReminder, with a fake notifications module and a clock at Sat 17 Oct 11:05.
function runSchedule(todayLogs) {
  const RealDate = Date;
  const NOW = new RealDate(2026, 9, 17, 11, 5, 0, 0).getTime();
  class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
  const scheduled = new Map();
  const N = {
    scheduleNotificationAsync: async (req) => { scheduled.set(req.identifier, req); },
    getAllScheduledNotificationsAsync: async () => [...scheduled.keys()].map((identifier) => ({ identifier })),
    cancelScheduledNotificationAsync: async (id) => { scheduled.delete(id); },
  };
  const fn = loadFn('lib/notifications.js', 'export async function scheduleDoseReminder(', 'scheduleDoseReminder', {
    Date: FakeDate, Platform: { OS: 'ios' }, getActiveProtocols: () => [{ id: 3 }], doseBudget: plan.doseBudget,
    getNotifications: () => N, getT: async () => Object.assign((k) => k, { language: 'pt' }),
    isPersistentEnabled: async () => false, fill: (s) => s, decimalText: String, unitText: String,
    ymd: plan.ymd, parseYmd: plan.parseYmd, dueDateKeys: plan.dueDateKeys, handledSlotIndexes: plan.handledSlotIndexes,
    getTodayLogs: () => todayLogs, showNamesInNotifications: async () => true, protocolDisplayName: () => 'Vitmin C',
    needsSiteQuestion: () => false, FOLLOWUP_DELAYS: [5, 10],
    doseSlots: plan.doseSlots, snoozedDoseSlots: async () => new Set(), // 1.3.2: the slots in fire order (DV-053 / DV-224)
    scheduleReq: (n, req) => n.scheduleNotificationAsync(req),
  });
  const protocol = { id: 3, user_id: 'u', reminder_time: '12:25', interval_days: 1, doses_per_day: 1, start_date: '2026-10-01', type: 'oral', dose: 500, dose_unit: 'mg' };
  return fn(protocol, 24, 3).then(() => [...scheduled.keys()].sort());
}

test('A-141 (6): Skipped (also after Undo of a Taken that replaced it) → no reminder for that slot', async () => {
  const ids = await runSchedule([{ protocol_id: 3, outcome: 'Skipped', logged_at: at(12, 25) }]);
  assert.ok(!ids.includes('dose-3-2026-10-17-t0'), `today's 12:25 is not re-armed (${ids.join(', ')})`);
  assert.ok(ids.includes('dose-3-2026-10-18-t0'), 'tomorrow keeps its reminder');
});

test('A-141 (6): Taken then Undone (no row left) → the 12:25 reminder is scheduled again', async () => {
  const ids = await runSchedule([]);
  assert.ok(ids.includes('dose-3-2026-10-17-t0'), ids.join(', '));
});

test('A-141 (6): a snoozed copy of a Skipped slot counts as resolved', () => {
  const resolved = loadFn('lib/notifications.js', 'function doseSlotResolved(', 'doseSlotResolved', {
    getProtocolById: () => ({ id: 3, user_id: 'u', active: 1, reminder_time: '12:25' }),
    getLogsSince: () => [{ protocol_id: 3, outcome: 'Skipped', logged_at: at(12, 25) }],
    handledSlotIndexes: plan.handledSlotIndexes,
  });
  assert.equal(resolved({ protocolId: 3, dayKey: '2026-10-17', ti: 0 }), true);
});

const today = fs.readFileSync(path.join(__dirname, '..', 'screens', 'TodayScreen.js'), 'utf8');
function fnCode(name) {
  let hit = null;
  const walk = (node) => {
    if (!node || typeof node.type !== 'string' || hit) return;
    if (node.type === 'FunctionDeclaration' && node.id && node.id.name === name) { hit = today.slice(node.start, node.end); return; }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
    }
  };
  walk(parse(today, { sourceType: 'module', plugins: ['jsx'] }));
  assert.ok(hit, `function ${name} exists`);
  return hit;
}

test('A-141 (6): Today\'s Undo and Skip re-plan the dose reminders right away (switches respected)', () => {
  const undo = fnCode('applyUndo');
  assert.ok(undo.indexOf('syncAllDoseReminders()') > undo.indexOf('deleteDoseLog(id)'), 'Undo re-plans after its writes');
  const skip = fnCode('skipDose');
  assert.ok(skip.indexOf('syncAllDoseReminders()') > skip.indexOf('recordSkipToday('), 'Skip re-plans after its write');
});

test('A-141 (6): the Reminder check does not count a Skipped slot as an owed (missing) reminder', () => {
  const { dueInWindow } = require('../lib/reminderHealth');
  const p = { id: 3, reminder_time: '12:25', interval_days: 14, start_date: '2026-10-17' };
  const now = new Date(2026, 9, 17, 11, 5);
  assert.equal(dueInWindow([p], now, 10, {}), 1, 'today 12:25 owed');
  assert.equal(dueInWindow([p], now, 10, { 3: new Set([0]) }), 0, 'skipped: nothing owed, so no false "reminders missing"');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'lib', 'notifications.js'), 'utf8'),
    /takenToday\[p\.id\] = handledSlotIndexes\(/, 'readReminderHealth passes the handled slots');
});
