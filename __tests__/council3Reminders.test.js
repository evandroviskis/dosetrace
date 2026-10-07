'use strict';
// Council 3 (2026-10-07) findings on A-106 / A-107 / A-110, each test first.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');
const R = require('../lib/reminderHealth');

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 7, 12);
const base = { os: 'android', manufacturer: 'Google', permission: 'granted', doseChannelImportance: 5, batteryOptimized: false,
  exactAlarms: true, hibernationExempt: true, remindersOn: true, silent: false, activeWithTime: 2, nowMs: NOW,
  lastRefresh: { at: NOW - 3600e3, ok: true, lastOkAt: NOW - 3600e3 } };

test('EA-4: turning Alarms & reminders on resyncs once and re-arms the snoozed copies; unknown or unchanged does nothing', async () => {
  const run = async (seq) => {
    const calls = []; let listener = null; let i = 0;
    const deps = {
      Platform: { OS: 'android' },
      canScheduleExactAlarms: () => seq[Math.min(i++, seq.length - 1)],
      AppState: { addEventListener: (ev, fn) => { listener = fn; return { remove() {} }; } },
      _notifSyncing: null,
      syncAllNotifications: async () => { calls.push('sync'); },
      restoreSnoozes: async (o) => { calls.push(o && o.rearm ? 'rearm' : 'restore'); },
    };
    loadFn('lib/notifications.js', 'export function watchExactAlarms(', 'watchExactAlarms', deps)();
    listener('active');
    await new Promise((r) => setTimeout(r, 5));
    return calls;
  };
  assert.deepEqual(await run([false, true]), ['sync', 'rearm']);
  assert.deepEqual(await run([null, true]), []);
  assert.deepEqual(await run([true, true]), []);
  assert.deepEqual(await run([false, false]), []);
});

test('EA-4: re-arming cancels and reschedules every snoozed copy (so it becomes exact)', async () => {
  const scheduled = new Map([['snz-1', {}], ['snz-2', {}], ['dose-1-x', {}]]);
  const rescheduled = [];
  const N = {
    async getAllScheduledNotificationsAsync() { return [...scheduled.keys()].map((identifier) => ({ identifier })); },
    async cancelScheduledNotificationAsync(id) { scheduled.delete(id); },
  };
  const list = [{ id: 'snz-1', fireAt: Date.now() + 3600e3 }, { id: 'snz-2', fireAt: Date.now() + 7200e3 }];
  const fn = loadFn('lib/notifications.js', 'async function restoreSnoozesLocked(', 'restoreSnoozesLocked', {
    getNotifications: () => N, loadSnoozes: async () => list, getCachedUser: async () => ({ user_metadata: {} }),
    pruneSnoozes: (l) => l, doseSlotResolved: () => false, getT: async () => (k) => k, fill: (s) => s,
    scheduleSnoozeCopy: async (n, r) => { rescheduled.push(r.id); scheduled.set(r.id, {}); }, saveSnoozes: async () => {},
  });
  await fn({ rearm: true });
  assert.deepEqual(rescheduled.sort(), ['snz-1', 'snz-2']);
  rescheduled.length = 0;
  await fn();
  assert.deepEqual(rescheduled, [], 'a normal restore leaves scheduled copies alone');
});

test('RG-2: the setup step counts Notifications ready only with the Dose reminders category on, and shows it when off', () => {
  const s = R.setupSteps({ ...base, doseChannelImportance: 0 });
  assert.equal(s.done, false);
  assert.ok(s.rows.some((r) => r.id === 'channel' && r.state === 'block'), 'the category row appears when it is off');
  assert.ok(!R.setupSteps(base).rows.some((r) => r.id === 'channel'));
  assert.equal(R.setupSteps(base).done, true);
});

test('RG-2: the count is of the rows actually shown (battery unreadable → 3 of 3)', () => {
  const s = R.setupSteps({ ...base, batteryOptimized: null });
  assert.equal(s.total, 3); assert.equal(s.ready, 3); assert.equal(s.done, true);
});

test('RG-4: freshness is the last SUCCESSFUL run; a failed run does not count', () => {
  const failedNow = { at: NOW - 3600e3, ok: false, reason: 'error', lastOkAt: NOW - 5 * DAY };
  const c = R.reminderChecks({ ...base, lastRefresh: failedNow }).find((x) => x.id === 'refresh');
  assert.equal(c.state, 'warn'); assert.equal(c.days, 5);
  assert.equal(R.staleRefreshDays({ ...base, lastRefresh: failedNow }), 5);
});

test('RG-5: no "not refreshed" alert for someone whose app refreshed its reminders on open in the last 2 days', () => {
  const h = { ...base, lastRefresh: { at: NOW - 5 * DAY, ok: true, lastOkAt: NOW - 5 * DAY }, foregroundSyncAt: NOW - 3 * 3600e3 };
  assert.equal(R.staleRefreshDays(h), 0);
  assert.equal(R.staleRefreshDays({ ...h, foregroundSyncAt: NOW - 3 * DAY }), 5);
  assert.match(read('lib/notifications.js'), /AsyncStorage\.setItem\(FG_SYNC_KEY, String\(Date\.now\(\)\)\)/);
});

test('UX: "not refreshed" opens the full Check reminders at the refresh row (the setup step has no such row)', () => {
  const t = read('screens/TodayScreen.js');
  const i = t.indexOf("id: 'reminders_stale'");
  assert.match(t.slice(i, i + 500), /navigation\.navigate\('ReminderCheck', \{ focus: 'refresh' \}\)/);
});

test('RG-5: the screen opens at the item that needs attention (focus is read and the row is marked)', () => {
  const s = read('screens/ReminderCheckScreen.js');
  assert.match(s, /const focus = route\?\.params\?\.focus;/);
  assert.match(s, /<ReminderSetupList [^>]*focus=\{focus\}/);
  const l = read('components/ReminderSetupList.js'); // A-112: the rows live in the shared list
  assert.match(l, /c\.id === focus && s\.rowFocus/);
  assert.match(l, /rowFocus: \{ backgroundColor: c\.well/);
});

// A-112 SP-5 (signed 2026-10-07): the protocol save no longer opens the step (Today does, once per
// phone), so the start-date question carries no setup opening at all.
test('journey F6: the start-date question opens nothing after it (Today offers the step once per phone)', () => {
  const p = read('screens/ProtocolsScreen.js');
  const i = p.indexOf("label: t('protocols_history_no')");
  assert.doesNotMatch(p.slice(i - 400, i + 900), /openSetup|onDismiss/);
});

test('refresh records the last successful run (kept across failed runs)', async () => {
  const mem = {};
  const AsyncStorage = { getItem: async (k) => mem[k] ?? null, setItem: async (k, v) => { mem[k] = v; } };
  const save = loadFn('lib/backgroundTasks.js', 'export async function saveLastRun(', 'saveLastRun', { AsyncStorage, LAST_RUN_KEY: 'L' });
  await save({ at: 100, ok: true, reason: null });
  await save({ at: 200, ok: false, reason: 'error' });
  assert.deepEqual(JSON.parse(mem.L), { at: 200, ok: false, reason: 'error', lastOkAt: 100 });
});
