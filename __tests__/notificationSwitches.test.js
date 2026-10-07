'use strict';
// A-108 / A-109 (found by the A-107 journey review, 2026-10-07; in 1.3.0 by the founder's reminder
// principle). Each test runs the REAL function from lib/notifications.js (helpers/extractFn) with a
// fake expo-notifications.
//   A-109: turning a reminder kind OFF in Settings returned before cancelling, so up to 21 days of
//          dose reminders (and summaries, vial alerts, check-ins) kept firing.
//   A-108: Silent mode ("Pause all notifications") was saved but never read — everything fired.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn } = require('./helpers/extractFn');

function fakeN(ids) {
  const scheduled = new Map(ids.map((id) => [id, { identifier: id, content: { data: {} } }]));
  return {
    scheduled,
    added: [],
    async getAllScheduledNotificationsAsync() { return [...scheduled.values()]; },
    async cancelScheduledNotificationAsync(id) { scheduled.delete(id); },
    async cancelAllScheduledNotificationsAsync() { scheduled.clear(); },
    async scheduleNotificationAsync(req) { this.added.push(req); scheduled.set(req.identifier || 'x', req); return req.identifier; },
  };
}
const user = (meta) => ({ id: 'u1', user_metadata: meta });
const cancelByPrefix = loadFn('lib/notifications.js', 'async function cancelByPrefix(', 'cancelByPrefix');
const common = (N, meta) => ({
  cancelByPrefix,
  getNotifications: () => N,
  getCachedUser: async () => user(meta),
  usesServerPush: () => false,
  Platform: { OS: 'android' },
});
const IDS = ['dose-1-20261008-0', 'dose-2-20261009-0', 'summary-2026-10-08', 'vial-7', 'checkin-1', 'food-log-2026-10-08', 'other-1'];
const left = (N) => [...N.scheduled.keys()].sort();

test('A-109: dose reminders OFF cancels the dose reminders already scheduled', async () => {
  const N = fakeN(IDS);
  const cancelAllDoseReminders = loadFn('lib/notifications.js', 'export async function cancelAllDoseReminders(', 'cancelAllDoseReminders', { getNotifications: () => N });
  const fn = loadFn('lib/notifications.js', 'export async function syncAllDoseReminders(', 'syncAllDoseReminders', { ...common(N, { dose_reminders: false }), cancelAllDoseReminders });
  await fn();
  assert.ok(!left(N).some((id) => id.startsWith('dose-')), left(N).join(','));
  assert.ok(left(N).includes('vial-7'), 'other kinds untouched');
});

test('A-109: dose reminders OFF cancels the morning summaries', async () => {
  const N = fakeN(IDS);
  const fn = loadFn('lib/notifications.js', 'export async function syncMorningSummary(', 'syncMorningSummary', { ...common(N, { dose_reminders: false }) });
  await fn();
  assert.ok(!left(N).some((id) => id.startsWith('summary-')), left(N).join(','));
});

test('A-109: vial alerts OFF and check-in reminders OFF cancel theirs', async () => {
  const N = fakeN(IDS);
  const vial = loadFn('lib/notifications.js', 'export async function syncVialAlerts(', 'syncVialAlerts', { ...common(N, { vial_alerts: false }) });
  await vial();
  assert.ok(!left(N).includes('vial-7'));
  const N2 = fakeN(IDS);
  const chk = loadFn('lib/notifications.js', 'export async function syncCheckinReminder(', 'syncCheckinReminder', { ...common(N2, { checkin_reminders: false }) });
  await chk();
  assert.ok(!left(N2).includes('checkin-1'));
});

test('A-108: Silent mode on → the resync cancels everything scheduled and schedules nothing', async () => {
  const N = fakeN(IDS);
  const calls = [];
  const spy = (name) => async () => { calls.push(name); };
  const deps = {
    getNotifications: () => N,
    resetSilent: () => calls.push('reset'),
    silentNow: async () => true,
    syncNotificationCategories: spy('categories'),
    syncAllDoseReminders: spy('doses'), syncVialAlerts: spy('vials'), syncCheckinReminder: spy('checkin'),
    syncRealityCheckReminder: spy('rc'), syncFoodLogReminder: spy('food'), syncMorningSummary: spy('summary'), restoreSnoozes: spy('snoozes'),
  };
  const run = loadFn('lib/notifications.js', 'async function syncAllNotificationsNow(', 'syncAllNotificationsNow', deps);
  await run();
  assert.equal(N.scheduled.size, 0, 'everything cancelled');
  assert.deepEqual(calls.filter((c) => !['reset', 'categories'].includes(c)), [], 'no scheduler ran');
  assert.ok(calls.indexOf('reset') >= 0 && calls.indexOf('reset') < calls.length, 'the setting is read fresh');
});

test('A-108: Silent mode off → the resync runs every scheduler as before', async () => {
  const N = fakeN(IDS);
  const calls = [];
  const spy = (name) => async () => { calls.push(name); };
  const deps = {
    getNotifications: () => N, resetSilent: () => {}, silentNow: async () => false,
    syncNotificationCategories: spy('categories'),
    syncAllDoseReminders: spy('doses'), syncVialAlerts: spy('vials'), syncCheckinReminder: spy('checkin'),
    syncRealityCheckReminder: spy('rc'), syncFoodLogReminder: spy('food'), syncMorningSummary: spy('summary'), restoreSnoozes: spy('snoozes'),
  };
  await loadFn('lib/notifications.js', 'async function syncAllNotificationsNow(', 'syncAllNotificationsNow', deps)();
  assert.deepEqual(calls, ['categories', 'doses', 'vials', 'checkin', 'rc', 'food', 'summary', 'snoozes']);
  assert.equal(N.scheduled.size, IDS.length);
});

test('A-108: every schedule call is refused while Silent mode is on (except the user\'s own test reminder)', async () => {
  const N = fakeN([]);
  const deps = { silentNow: async () => true, androidChannelRequest: (r) => r, Platform: { OS: 'android' } };
  const scheduleReq = loadFn('lib/notifications.js', 'async function scheduleReq(', 'scheduleReq', deps);
  assert.equal(await scheduleReq(N, { identifier: 'dose-1', content: { data: { type: 'dose_reminder' } }, trigger: null }), null);
  assert.equal(N.added.length, 0);
  await scheduleReq(N, { identifier: 'test', content: { data: { type: 'reminder_test' } }, trigger: null });
  assert.equal(N.added.length, 1, 'Check reminders → Send a test still works');
  const on = loadFn('lib/notifications.js', 'async function scheduleReq(', 'scheduleReq', { ...deps, silentNow: async () => false });
  await on(N, { identifier: 'dose-2', content: { data: { type: 'dose_reminder' } } });
  assert.equal(N.added.length, 2);
});

// A-108 follow-up (seen on the store simulator 2026-10-07, the demo account has Silent mode on):
// Silent mode cancels every reminder, so the check read "nothing scheduled" and Today said "Your
// reminders are blocked" — but the user paused them on purpose. Silent mode is its own state: the
// Reminder check says it is on, and nothing warns on Today or in the Settings line.
test('A-108: Silent mode is its own state — never "blocked", never a Today warning', () => {
  const R = require('../lib/reminderHealth');
  const h = { os: 'android', permission: 'granted', doseChannelImportance: 5, batteryOptimized: false, exactAlarms: false,
    remindersOn: true, silent: true, activeWithTime: 3, scheduledCount: 0, dueInWindow: 12, syncedOnce: true };
  assert.equal(R.scheduleState(h), 'silent');
  const checks = R.reminderChecks(h);
  assert.equal(R.blockingCount(checks, R.scheduleState(h)), 0);
  assert.equal(R.shouldWarnToday({ ...h, checks, schedule: R.scheduleState(h) }), false);
  assert.equal(R.shouldWarnLate(h), false, 'nothing is late while everything is paused');
  const { read } = require('./helpers/extractFn');
  assert.match(read('lib/notifications.js'), /out\.silent = user\.user_metadata\?\.silent_mode === true;/);
  assert.match(read('screens/ReminderCheckScreen.js'), /sched === 'silent' \? \(\s*<Text style=\{s\.cardMain\}>\{t\('rc_silent_on'\)\}<\/Text>/);
  const T = require('../i18n/translations.js').translations || require('../i18n/translations.js');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(T[l].rc_silent_on, l);
});
