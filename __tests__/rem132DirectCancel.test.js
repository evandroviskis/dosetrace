'use strict';
// 1.3.2 REM final review (coordinator 2026-10-20, after the merge 3ac8a6c):
//  1. A take from the Log screen and Today's Skip cancel today's handled slot and its +5/+10 repeats
//     DIRECTLY (the same cancel Today's take uses), before the queued full resync — a repeat due in
//     those seconds must not fire.
//  2. The App.js sync listener runs the full resync only when the pull changed a table that affects
//     reminders (dose_logs, protocols, vials, food_logs, the open reality check), not on every sync.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const plan = require('../lib/notificationPlan');

const pad = (n) => (n < 10 ? '0' + n : '' + n);
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const at = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const PROTOCOL = { id: 7, user_id: 'u1', reminder_time: '08:00,20:00', name: 'BPC-157', type: 'oral' };

test('Log screen take: today\'s slot and its repeats are cancelled directly, before the full resync', () => {
  const calls = [];
  const logs = [{ id: 1, protocol_id: 7, outcome: 'Taken', logged_at: at(8) }];
  const mark = loadFn('screens/LogScreen.js', 'function markRowTaken(row, site) {', 'markRowTaken', {
    recordDoseTaken: () => ({ logId: 1 }), writeOutcome: () => calls.push(['writeOutcome']),
    getProtocolById: () => PROTOCOL, getTodayLogs: () => logs, handledSlotIndexes: plan.handledSlotIndexes,
    cancelTodaysDoseReminders: async (pid, n) => { calls.push(['cancel', pid, n]); },
    syncAllNotifications: async () => { calls.push(['resync']); }, requestSync: () => {}, fetchLogs: () => {},
    embedded: false, onChanged: null, dayKeyOf: (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
  });
  mark({ id: 1, protocol_id: 7, logged_at: at(8) });
  assert.deepEqual(calls, [['cancel', 7, 1], ['resync']]);
});

test('Log screen take of an earlier day: nothing of today is cancelled (only the resync)', () => {
  const calls = [];
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(8, 0, 0, 0);
  const mark = loadFn('screens/LogScreen.js', 'function markRowTaken(row, site) {', 'markRowTaken', {
    recordDoseTaken: () => ({ logId: 2 }), writeOutcome: () => {}, getProtocolById: () => PROTOCOL, getTodayLogs: () => [],
    handledSlotIndexes: plan.handledSlotIndexes, cancelTodaysDoseReminders: async (pid, n) => { calls.push(['cancel', pid, n]); },
    syncAllNotifications: async () => { calls.push(['resync']); }, requestSync: () => {}, fetchLogs: () => {},
    embedded: false, onChanged: null, dayKeyOf: () => 'not-today',
  });
  mark({ id: 2, protocol_id: 7, logged_at: yesterday.toISOString() });
  assert.deepEqual(calls, [['resync']]);
});

test('Today Skip: the skipped slot and its repeats are cancelled directly, before the full resync', () => {
  const calls = [];
  let sheet = null;
  const logs = [{ id: 3, protocol_id: 7, outcome: 'Skipped', logged_at: at(20) }];
  const skip = loadFn('screens/TodayScreen.js', 'function skipDose(protocol, slot) {', 'skipDose', {
    recordSkipToday: () => ({ logId: 3 }), fetchTodayLogs: () => {}, keepUndo: () => {}, fetchPageLogs: () => {},
    setSkippedCounts: () => {}, Analytics: { doseLogged: () => {} }, setTimeout: () => {}, checkStillGoingWhenSynced: () => {},
    requestSync: () => {}, todayError: () => {}, friendlyError: () => '', t: (k) => k,
    skipSheetOpenRef: { current: false }, setSkipAsk: (s) => { sheet = s; }, protocolDisplayName: (p) => p.name,
    getTodayLogs: () => logs, handledSlotIndexes: plan.handledSlotIndexes, ymd: plan.ymd,
    cancelTodaysDoseReminders: async (pid, n) => { calls.push(['cancel', pid, n]); },
    syncAllNotifications: async () => { calls.push(['resync']); },
  });
  skip(PROTOCOL, { slotMs: Date.parse(at(20)) });
  sheet.onSkip();
  assert.deepEqual(calls, [['cancel', 7, 2], ['resync']], 'slot t1 (20:00) handled → ti < 2 cancelled now');
  assert.equal(plan.handledSlotIndexes({ reminderTime: '08:00,20:00', logs, protocolId: 7, dayKey: todayKey() }).has(1), true);
});

test('Today take keeps its direct cancel first (the reference behaviour)', () => {
  const today = read('screens/TodayScreen.js');
  const i = today.indexOf('cancelTodaysDoseReminders(protocol.id, Math.max(newTakenToday');
  assert.ok(i > 0 && i < today.indexOf('syncAllNotifications().catch', i));
});

// ── 2: the listener re-plans only for a pull that touched reminder data ──────────────────────────
test('the sync listener re-plans only when a reminder table changed (dose logs, protocols, vials, food logs, the open check)', () => {
  const touches = loadFn('App.js', 'function syncTouchesReminders(e, openCheckChanged) {', 'syncTouchesReminders');
  for (const t of ['dose_logs', 'protocols', 'vials', 'food_logs']) assert.equal(touches({ type: 'sync_complete', changed: [t] }, false), true, t);
  assert.equal(touches({ type: 'sync_complete', changed: [] }, false), false, 'nothing new → no resync');
  assert.equal(touches({ type: 'sync_complete', changed: ['biomarkers', 'vaccines'] }, false), false, 'lab values do not touch reminders');
  assert.equal(touches({ type: 'sync_complete', changed: [] }, true), true, 'a Stop or a new check pulled from another device');
  assert.equal(touches({ type: 'import_complete' }, false), true);
  assert.equal(touches({ type: 'sync_skipped' }, true), false);
  const block = sliceBlock(read('App.js'), 'const unsubSyncForFood = addSyncListener(async (e) => {');
  assert.match(block, /if \(syncTouchesReminders\(e, openChanged\)\) syncAllNotifications\(\)\.catch/);
  assert.equal((block.match(/syncAllNotifications\(\)/g) || []).length, 1, 'one resync call, only behind the check');
  assert.doesNotMatch(block, /lastFoodResync/, 'no resync on every sync any more');
});
