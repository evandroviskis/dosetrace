'use strict';
// DT Council, test build 3 (2026-10-17), item 2: a Dose log change must re-plan the dose reminders.
// screens/LogScreen.js applyDelete, writeOutcome and markRowTaken (the row made complete), and
// Today's afterLogChange (the Dose log on Today's right page), never called syncAllDoseReminders:
// deleting the Taken row of a slot that is now owed left its reminder cancelled.
// The real LogScreen functions and the real scheduleDoseReminder, clock Sat 17 Oct 2026 11:05.
process.env.TZ = 'America/Sao_Paulo';
const test = require('node:test');
const assert = require('node:assert/strict');
const plan = require('../lib/notificationPlan');
const { loadFn } = require('./helpers/extractFn');

const at = (h, m, d = 17) => new Date(2026, 9, d, h, m, 0, 0).toISOString();
const PROTOCOL = { id: 3, user_id: 'u', reminder_time: '12:25', interval_days: 1, doses_per_day: 1, start_date: '2026-10-01', type: 'oral', dose: 500, dose_unit: 'mg' };
const SLOT = 'dose-3-2026-10-17-t0';

function world(rows) {
  const logs = rows.map((r) => ({ ...r }));
  const scheduled = new Set();
  const RealDate = Date;
  const NOW = new RealDate(2026, 9, 17, 11, 5, 0, 0).getTime();
  class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
  const N = {
    scheduleNotificationAsync: async (req) => { scheduled.add(req.identifier); },
    getAllScheduledNotificationsAsync: async () => [...scheduled].map((identifier) => ({ identifier })),
    cancelScheduledNotificationAsync: async (id) => { scheduled.delete(id); },
  };
  const schedule = loadFn('lib/notifications.js', 'export async function scheduleDoseReminder(', 'scheduleDoseReminder', {
    Date: FakeDate, Platform: { OS: 'ios' }, getActiveProtocols: () => [PROTOCOL], doseBudget: plan.doseBudget,
    getNotifications: () => N, getT: async () => Object.assign((k) => k, { language: 'pt' }),
    parseReminderTimes: (rt) => plan.reminderTimes(rt).map((s) => ({ hours: s.hour, minutes: s.minute })),
    isPersistentEnabled: async () => false, fill: (s) => s, decimalText: String, unitText: String,
    ymd: plan.ymd, parseYmd: plan.parseYmd, dueDateKeys: plan.dueDateKeys, handledSlotIndexes: plan.handledSlotIndexes,
    getTodayLogs: () => logs, showNamesInNotifications: async () => true, protocolDisplayName: () => 'Vitmin C',
    needsSiteQuestion: () => false, FOLLOWUP_DELAYS: [5, 10],
    scheduleReq: (n, req) => n.scheduleNotificationAsync(req),
  });
  const runs = [];
  const syncAllDoseReminders = () => { const r = schedule(PROTOCOL, 24, 3); runs.push(r); return r; };
  const settle = () => Promise.all(runs);
  return { logs, scheduled, schedule, syncAllDoseReminders, settle, runs };
}

const noop = () => {};
function logFns(w) {
  const deps = {
    getCachedUser: async () => ({ id: 'u' }),
    planDeleteDose: (log) => ({ deleteIds: [log.id] }),
    deleteContext: () => ({}),
    deleteDoseLog: (id) => { const i = w.logs.findIndex((l) => l.id === id); if (i >= 0) w.logs.splice(i, 1); },
    rememberDeleted: noop, updateVial: noop, updateProtocol: noop,
    syncVialAlerts: async () => {}, requestSync: noop, fetchLogs: noop,
    embedded: false, onChanged: null, setLogSheet: noop, t: (k) => k, friendlyError: () => '',
    updateDoseLog: (id, fields) => { const l = w.logs.find((x) => x.id === id); if (l) Object.assign(l, fields); },
    syncAllDoseReminders: w.syncAllDoseReminders,
  };
  return {
    applyDelete: loadFn('screens/LogScreen.js', 'async function applyDelete(log) {', 'applyDelete', deps),
    writeOutcome: loadFn('screens/LogScreen.js', 'function writeOutcome(logId, fields) {', 'writeOutcome', deps),
  };
}

test('TB3-2: deleting the Taken row of a slot still ahead schedules its reminder again', async () => {
  const w = world([{ id: 41, protocol_id: 3, outcome: 'Taken', logged_at: at(12, 25) }]);
  await w.schedule(PROTOCOL, 24, 3); // the take cancelled today's 12:25
  assert.ok(!w.scheduled.has(SLOT));
  const { applyDelete } = logFns(w);
  await applyDelete({ id: 41, protocol_id: 3, outcome: 'Taken', logged_at: at(12, 25) });
  await w.settle();
  assert.ok(w.runs.length >= 1, 'the delete re-planned the reminders');
  assert.ok(w.scheduled.has(SLOT), `${SLOT} is scheduled again (${[...w.scheduled].join(', ')})`);
});

test('TB3-2: changing a row\'s outcome in the Dose log re-plans (Skipped → no reminder for that slot)', async () => {
  const w = world([{ id: 42, protocol_id: 3, outcome: 'Missed', logged_at: at(12, 25) }]);
  await w.schedule(PROTOCOL, 24, 3);
  assert.ok(w.scheduled.has(SLOT), 'Missed is not handled: armed');
  const { writeOutcome } = logFns(w);
  writeOutcome(42, { outcome: 'Skipped' });
  await w.settle();
  assert.ok(w.runs.length >= 1, 'the outcome change re-planned');
  assert.ok(!w.scheduled.has(SLOT), 'a skipped slot is never reminded');
});

test('TB3-2: the Dose log made-complete path and Today\'s afterLogChange re-plan too', async () => {
  const { read } = require('./helpers/extractFn');
  const { sliceBlock } = require('./helpers/extractFn');
  const log = read('screens/LogScreen.js');
  assert.match(log, /import \{ syncVialAlerts, syncAllDoseReminders \} from '\.\.\/lib\/notifications';/);
  const mark = sliceBlock(log, 'function markRowTaken(row, site) {');
  assert.ok(mark.indexOf('syncAllDoseReminders().catch(() => {});') > mark.indexOf('recordDoseTaken('), 'after the take');
  let called = 0;
  const after = loadFn('screens/TodayScreen.js', 'function afterLogChange() {', 'afterLogChange', {
    setUndoData: noop, wasDeleted: () => false, fetchProtocols: noop, fetchTodayLogs: noop, fetchPendingYesterday: noop,
    fetchStreakData: noop, fetchProtocolStreaks: noop, fetchLastSites: noop,
    syncAllDoseReminders: async () => { called += 1; },
  });
  after();
  assert.equal(called, 1, 'Today\'s right-page Dose log change re-plans');
});
