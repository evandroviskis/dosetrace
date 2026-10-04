'use strict';
// App-map links that had no test (docs/review/app-map.md, pre-build pass 2026-10-03):
// L-06, L-10, L-14, L-15, L-26, L-28, L-30, L-42, L-46. Each test runs the REAL function from
// the app source with its imports replaced by fakes (helpers/extractFn), or — where the link is
// screen wiring — checks the wiring in the source, as the repo's other link tests do.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const { elapsedDoseSlots } = require('../lib/schedule');
const { dosesPerVial } = require('../lib/doseMath');
const { computeServings } = require('../lib/oralMath');
const { ymd, foodReminderDay } = require('../lib/notificationPlan');

// A fake expo-notifications: scheduled ids, cancelled ids.
function fakeN(ids) {
  const cancelled = [];
  return {
    cancelled,
    getAllScheduledNotificationsAsync: async () => ids.map((identifier) => ({ identifier })),
    cancelScheduledNotificationAsync: async (id) => { cancelled.push(id); },
  };
}

// ── L-06: a past start date → one back-filled Taken row per elapsed slot ─────────────────
test('L-06: backfillTakenDoses writes one Taken row per elapsed slot at the slot time and moves the vial count once per row', () => {
  const NOW = new Date(2026, 9, 3, 12, 0).getTime();
  const protocol = { id: 4, user_id: 'u1', remote_id: 'r4', type: 'recon', start_date: '2026-09-29', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', amount: '5', unit: 'mg', dose: '250', dose_unit: 'mcg' };
  const rows = []; const vialUpdates = [];
  const backfill = loadFn('lib/doseActions.js', 'export function backfillTakenDoses(', 'backfillTakenDoses', {
    getProtocolById: () => protocol,
    elapsedDoseSlots,
    insertDoseLog: (r) => rows.push(r),
    getActiveVials: () => [{ id: 9, protocol_id: 4, doses_taken: 1, total_doses: 20 }],
    dosesPerVial,
    updateVial: (id, patch) => vialUpdates.push({ id, ...patch }),
    computeServings,
    updateProtocol: () => {},
  });
  const n = backfill(4, NOW);
  assert.equal(n, 5, '29, 30 Sep, 1, 2, 3 Oct at 08:00');
  assert.equal(rows.length, 5);
  assert.ok(rows.every((r) => r.outcome === 'Taken' && r.protocol_id === 4 && r.protocol_remote_id === 'r4'));
  assert.equal(rows[0].logged_at, new Date(2026, 8, 29, 8, 0).toISOString());
  assert.deepEqual(vialUpdates, [{ id: 9, doses_taken: 6 }]);
});

test('L-06: the back-fill runs only from the Yes of the back-fill question after a new protocol', () => {
  const src = read('screens/ProtocolsScreen.js');
  const calls = src.split('backfillTakenDoses(').length - 1;
  assert.equal(calls, 1, 'one call site');
  const yes = src.slice(src.indexOf("label: t(pluralKey('protocols_backfill_yes'"), src.indexOf('backfillTakenDoses(newId)') + 30);
  assert.match(yes, /kind: 'primary',\s*onPress: \(\) => \{\s*try \{ backfillTakenDoses\(newId\); \}/);
});

// ── L-10: a dose taken today cancels that slot's pending reminders ─────────────────────────
test('L-10: cancelTodaysDoseReminders cancels today\'s reminders of the slots taken, nothing else', async () => {
  const today = ymd(new Date());
  const N = fakeN([`dose-3-${today}-t0`, `dose-3-${today}-t0-f1`, `dose-3-${today}-t1`, `dose-3-2099-01-01-t0`, `dose-4-${today}-t0`]);
  let dismissed = null, restored = 0;
  const cancel = loadFn('lib/notifications.js', 'export async function cancelTodaysDoseReminders(', 'cancelTodaysDoseReminders', {
    getNotifications: () => N, ymd,
    dismissDeliveredDoseReminders: async (pid, n) => { dismissed = [pid, n]; },
    restoreSnoozes: async () => { restored++; },
  });
  await cancel(3, 1);
  assert.deepEqual(N.cancelled.sort(), [`dose-3-${today}-t0`, `dose-3-${today}-t0-f1`].sort());
  assert.deepEqual(dismissed, [3, 1], 'the banner that already fired is cleared too');
  assert.equal(restored, 1, 'a snoozed copy of a taken slot is dropped');
});

test('L-10: Today calls it with the day\'s real Taken count after a dose is written', () => {
  const src = read('screens/TodayScreen.js');
  assert.match(src, /cancelTodaysDoseReminders\(protocol\.id, Math\.max\(newTakenToday, opts\.cancelUpTo \|\| 0\)\)/);
  assert.match(read('lib/notificationActions.js'), /await cancelTodaysDoseReminders\(protocolId, ti \+ 1\)/);
});

// ── L-14: My Body lab dates → the curve's blood-draw readout ───────────────────────────────
test('L-14: the curve lists each lab report date once, newest first, from My Body\'s biomarkers', () => {
  const src = read('screens/SerumCurveScreen.js');
  assert.match(src, /const marks = getBiomarkers\(user\.id\) \|\| \[\];/);
  const line = src.match(/const uniq = (\[\.\.\.new Set\(marks\.map\(m => m\.report_date\)\.filter\(Boolean\)\)\]\.sort\(\)\.reverse\(\));/);
  assert.ok(line, 'the dedupe line');
  // eslint-disable-next-line no-new-func
  const uniq = new Function('marks', `return ${line[1]};`)([
    { report_date: '2026-05-01' }, { report_date: '2026-09-10' }, { report_date: '2026-05-01' }, { report_date: null },
  ]);
  assert.deepEqual(uniq, ['2026-09-10', '2026-05-01']);
  assert.match(src, /setLabDates\(uniq\);/);
});

// ── L-15: last lab date → Today's "bloodwork due" alert → My Body › Labs ───────────────────
test('L-15: Today reads the newest report date, alerts after 182 days and opens My Body on Labs', () => {
  const today = read('screens/TodayScreen.js');
  assert.match(today, /const BLOODWORK_INTERVAL_DAYS = 182;/);
  assert.match(today, /setLatestLabDate\(bm\.length \? bm\[0\]\.report_date : null\);/);
  assert.match(today, /if \(days >= BLOODWORK_INTERVAL_DAYS\) \{/);
  assert.match(today, /onPress: \(\) => navigation\.navigate\('Body', \{ initialSection: 'labs' \}\),/);
  const body = read('screens/BodyScreen.js');
  assert.match(body, /const target = route\?\.params\?\.initialSection;\s*if \(target === 'labs' \|\| target === 'vaccines'\) \{\s*setSection\(target\);/);
  assert.match(body, /navigation\.setParams\(\{ initialSection: undefined \}\);/, 'the param is used once');
  // The newest date comes first: the biomarker query orders report_date DESC.
  assert.match(read('lib/database.js'), /FROM biomarkers[^`]*ORDER BY report_date DESC/);
});

// ── L-26: "Nothing else today" on the 8 PM notification → day_closed marker ────────────────
test('L-26: the notification action closes the evening\'s own day (even after midnight) and syncs in the foreground', async () => {
  const closed = []; let notified = null, synced = 0;
  const fromNotif = loadFn('lib/notificationActions.js', 'async function closeFoodDayFromNotification(', 'closeFoodDayFromNotification', {
    foodReminderDay,
    closeFoodDay: async (k) => { closed.push(k); return true; },
    notifyDataChanged: (k) => { notified = k; },
    AppState: { currentState: 'active' },
    requestSync: () => { synced++; },
    syncWhenActive: false,
  });
  await fromNotif({ id: 'food-log-2026-10-02', data: {} });
  assert.deepEqual(closed, ['2026-10-02'], 'the reminder\'s day, not the tap day');
  assert.equal(notified, 'food_logs');
  assert.equal(synced, 1);
});

test('L-26: closeFoodDay writes the durable day_closed marker and cancels that day\'s reminder', async () => {
  const markers = []; let resynced = 0;
  const N = fakeN([]);
  const close = loadFn('lib/notifications.js', 'export async function closeFoodDay(', 'closeFoodDay', {
    getCachedUser: async () => ({ id: 'u1' }),
    insertFoodDayMarker: (uid, day, kind) => { markers.push([uid, day, kind]); return 77; },
    getNotifications: () => N,
    syncFoodLogReminder: async () => { resynced++; },
  });
  assert.equal(await close('2026-10-02'), true);
  assert.deepEqual(markers, [['u1', '2026-10-02', 'day_closed']]);
  assert.deepEqual(N.cancelled, ['food-log-2026-10-02']);
  assert.equal(resynced, 1);
  assert.equal(await close('not a day'), false, 'a bad key writes nothing');
  assert.equal(markers.length, 1);
});

// ── L-28: a sync that brings food logs re-plans the 8 PM reminder ──────────────────────────
test('L-28: after a sync or import the 8 PM reminder (and the day-21 one) is re-planned, at most every 30 s', () => {
  const app = read('App.js');
  const block = sliceBlock(app, 'const unsubSyncForFood = addSyncListener((e) => {');
  assert.match(block, /if \(e\?\.type !== 'sync_complete' && e\?\.type !== 'import_complete'\) return;/);
  assert.match(block, /if \(nowTs - lastFoodResync < 30000\) return;/);
  assert.match(block, /syncFoodLogReminder\(\)\.catch/);
  assert.match(block, /syncRealityCheckReminder\(\)\.catch/);
});

// ── L-30: the Journey sex prompt → the profile ─────────────────────────────────────────────
test('L-30: the sex chosen in Journey is saved to the profile (gender), the only source the BMR reads', async () => {
  const writes = []; let sex = null, profileSex = null;
  const save = loadFn('screens/components/CalculatorSection.js', 'async function saveProfileSex(', 'saveProfileSex', {
    setSex: (v) => { sex = v; }, setProfileSex: (v) => { profileSex = v; },
    supabase: { auth: { updateUser: async (p) => { writes.push(p); return {}; } } },
  });
  await save('female');
  assert.deepEqual(writes, [{ data: { gender: 'female' } }], 'merge-only: one key');
  assert.equal(sex, 'female'); assert.equal(profileSex, 'female');
  await save('other');
  assert.equal(writes.length, 1, 'only male / female are written');
  // Settings and the calculator read the same key back.
  assert.match(read('screens/SettingsScreen.js'), /setGender\(user\.user_metadata\?\.gender \|\| ''\)/);
  assert.match(read('lib/bodyProfile.js'), /gender/);
});

// ── L-42: notification taps → the right screen (A-44: each lands on its reason) ───────────
test('L-42: every notification tap goes through the one router to its reason (dose → that dose on Today, vial → its protocol, weigh-in / day-21 → Progress, food → the chat)', () => {
  const { notifTapTarget } = require('../lib/notificationPlan');
  const app = read('App.js');
  const at = app.indexOf('notifResponseSub = N.addNotificationResponseReceivedListener(response =>');
  assert.ok(at > 0, 'the tap listener');
  const fnSrc = sliceBlock(app.slice(at), 'response => {');
  const routed = [];
  // eslint-disable-next-line no-new-func
  const handler = new Function('routeTap', `return (${fnSrc});`)((r) => routed.push(r));
  const tap = (data, actionIdentifier = 'expo.modules.notifications.actions.DEFAULT') => handler({ actionIdentifier, notification: { date: 1, request: { identifier: 'food-log-2026-10-02', content: { data } } } });
  tap({ type: 'dose_reminder', protocolId: 3, dayKey: '2026-10-03', ti: 0, slotMs: 5 });
  tap({ type: 'checkin_reminder' });
  tap({ type: 'reality_check' });
  tap({ type: 'vial_low', vialId: 9, protocolId: 4 });
  tap({ type: 'food_log' });
  const where = routed.map((r) => { const t = notifTapTarget(r, 1); return t.screen === 'MainTabs' ? t.params.screen : t.screen; });
  assert.deepEqual(where, ['Today', 'Progress', 'Progress', 'Protocols', 'FoodChat']);
});

// ── L-46: protocol delete → its reminders and snoozed copies go ────────────────────────────
test('L-46: deleting a protocol cancels its reminders and banners; snoozed copies of a deleted protocol are dropped', async () => {
  const src = read('screens/ProtocolsScreen.js');
  const del = sliceBlock(src, 'async function deleteProtocol(id) {');
  assert.match(del, /softDeleteProtocol\(id\);[\s\S]*cancelDoseReminder\(id\)\.catch[\s\S]*dismissDeliveredDoseReminders\(id\)\.catch/);

  const N = fakeN(['dose-5-2026-10-03-t0', 'dose-5-2026-10-04-t0', 'dose-6-2026-10-03-t0', 'snz-abc']);
  let restored = 0;
  const cancel = loadFn('lib/notifications.js', 'export async function cancelDoseReminder(', 'cancelDoseReminder', {
    getNotifications: () => N,
    getProtocolById: () => ({ id: 5, active: 1, deleted_at: '2026-10-03T10:00:00Z' }),
    restoreSnoozes: async () => { restored++; },
  });
  await cancel(5);
  assert.deepEqual(N.cancelled, ['dose-5-2026-10-03-t0', 'dose-5-2026-10-04-t0']);
  assert.equal(restored, 1, 'a deleted protocol re-runs the snooze pruning');

  const resolved = loadFn('lib/notifications.js', 'function doseSlotResolved(', 'doseSlotResolved', {
    getProtocolById: () => ({ id: 5, deleted_at: '2026-10-03T10:00:00Z' }),
    getLogsSince: () => [],
  });
  assert.equal(resolved({ protocolId: 5, dayKey: '2026-10-03', ti: 0 }), true, 'its snoozed copies are pruned');
});
