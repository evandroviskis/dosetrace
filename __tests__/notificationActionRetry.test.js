'use strict';
// DV-184 (S1): "Mark complete" pressed on an Android notification with the app closed (the headless
// task). Before the fix the tap was CLAIMED (stored as handled) before the dose was written, any
// throw in the write was swallowed and the banner dismissed anyway, and ensureDb marked the database
// ready even when it failed to open: the dose could go unlogged, never retried, while the banner
// disappeared and the user believed it was logged. Now: the tap is claimed only after the action
// succeeds; a failed action keeps the banner (and the last response, so the next open retries),
// posts nothing; ensureDb retries; and the headless run reads the user as stored on the phone
// (enterBackgroundRun -> readStoredUser), never getSession (which may rotate the token, INV-06).
// The WHOLE lib/notificationActions.js runs here with its imports replaced by fakes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read, loadFn } = require('./helpers/extractFn');
const { notificationTakeTarget } = require('../lib/markTaken');
const { parseDoseId, foodReminderDay } = require('../lib/notificationPlan');

// shared.store: the phone's AsyncStorage, kept across a "kill" (a second module instance).
function loadModule(over = {}, shared = {}) {
  const src = read('lib/notificationActions.js')
    .split('\n').filter((l) => !/^import\s/.test(l)).join('\n')
    .replace(/^export\s+/gm, '');
  const log = [];
  const store = shared.store || {};
  let appListener = null;
  let background = false;
  let taskFn = null;
  const N = {
    dismissNotificationAsync: async (id) => log.push(['dismiss', id]),
    scheduleNotificationAsync: async (req) => log.push(['post', req.content.title]),
    clearLastNotificationResponseAsync: async () => log.push(['clearLast']),
    getLastNotificationResponseAsync: async () => null,
    registerTaskAsync: async () => {},
    addNotificationResponseReceivedListener: () => {},
  };
  const deps = {
    AppState: { currentState: 'background', addEventListener: (_e, fn) => { appListener = fn; } },
    Platform: { OS: 'android' },
    AsyncStorage: {
      getItem: async (k) => (k in store ? store[k] : null),
      setItem: async (k, v) => { store[k] = v; },
    },
    initDatabase: () => { log.push(['initDb']); },
    getProtocolById: (id) => ({ id, name: 'Testosterone', type: 'oral', active: 1 }),
    recordDoseTaken: (id) => { log.push(['write', id, background]); return { logId: 7, protocol: { name: 'Testosterone', type: 'oral' }, dayKey: '2026-10-20' }; },
    notificationTakeTarget, parseDoseId, foodReminderDay,
    needsSiteQuestion: () => false,
    newQuestion: (q) => q,
    saveQuestion: async () => {},
    snoozeNotification: async () => log.push(['snooze', background]),
    cancelTodaysDoseReminders: async () => log.push(['cancelToday', background]),
    syncAllNotifications: async () => log.push(['resyncAll']),
    closeFoodDay: async () => true,
    enterBackgroundRun: () => { background = true; log.push(['bg', true]); return 'gen'; },
    leaveBackgroundRun: (t) => { assert.equal(t, 'gen', 'leaves with its own token'); background = false; log.push(['bg', false]); },
    storedSessionOnly: () => background,
    resetBackgroundRun: () => log.push(['bgReset']),
    requestSync: () => log.push(['sync']),
    notifyDataChanged: () => {},
    Analytics: { doseLogged: () => {}, notifAction: () => {} },
    isWakePayload: () => false,
    refreshNow: async () => {},
    require: (m) => {
      if (m === 'expo-notifications') return N;
      if (m === 'expo-task-manager') return { isTaskDefined: () => false, defineTask: (_n, fn) => { taskFn = fn; } };
      if (m === '../i18n/translations') return { translations: { en: { notif_taken_nothing_title: 'Nothing new logged', notif_taken_nothing_body: 'x' } } };
      throw new Error('unexpected require ' + m);
    },
    ...over,
  };
  const names = Object.keys(deps);
  // eslint-disable-next-line no-new-func
  const mod = new Function(...names, `${src}\nreturn { handleNotificationResponse };`)(...names.map((n) => deps[n]));
  return { ...mod, log, store, deps, task: () => taskFn, isBackground: () => background, appChange: (s) => appListener && appListener(s) };
}

// The serialized response the Android task hands over for "Mark complete".
const response = (date = 1760950000000) => ({
  actionIdentifier: 'MARK_TAKEN',
  notification: { date, request: { identifier: 'dose-12-2026-10-20-t0', content: { data: { protocolId: 12, dayKey: '2026-10-20', ti: 0 } } } },
});
const handled = (m) => JSON.parse(m.store.dosetrace_notif_handled || '[]');

test('DV-184: the dose write throws once -> not claimed, banner kept, nothing posted; the retry logs it once', async () => {
  let fail = true;
  const m2 = loadModule({
    recordDoseTaken: (id) => {
      if (fail) { fail = false; throw new Error('SQLITE_BUSY'); }
      m2.log.push(['write', id]);
      return { logId: 7, protocol: { name: 'Testosterone', type: 'oral' }, dayKey: '2026-10-20' };
    },
  });
  await m2.task()({ data: response() });               // headless, app closed
  assert.deepEqual(handled(m2), [], 'a failed write is not claimed');
  assert.ok(!m2.log.some((e) => e[0] === 'dismiss'), 'the banner stays (the user can tap again)');
  assert.ok(!m2.log.some((e) => e[0] === 'post'), 'no misleading notification');
  assert.ok(!m2.log.some((e) => e[0] === 'clearLast'), 'the response is kept for the next launch drain');

  await m2.task()({ data: response() });               // the retry (tap again / drain on open)
  assert.equal(m2.log.filter((e) => e[0] === 'write').length, 1, 'logged once');
  assert.equal(handled(m2).length, 1, 'claimed after the write succeeded');
  assert.ok(m2.log.some((e) => e[0] === 'dismiss'), 'banner cleared once the dose is logged');

  await m2.task()({ data: response() });               // the same tap delivered again (listener + drain)
  assert.equal(m2.log.filter((e) => e[0] === 'write').length, 1, 'never a second write');
});

test('DV-184: ensureDb retries when the database failed to open (it is not marked ready on a failure)', async () => {
  let opens = 0;
  const m = loadModule({ initDatabase: () => { opens++; if (opens === 1) throw new Error('open failed'); } });
  await m.task()({ data: response(1) });
  await m.task()({ data: response(2) });
  assert.equal(opens, 2, 'the second tap opens the database again');
  await m.task()({ data: response(3) });
  assert.equal(opens, 2, 'once open, not reopened');
});

test('DV-184: the headless run reads the stored session only (background mode on during the action, restored after)', async () => {
  const m = loadModule();
  await m.task()({ data: response() });
  const w = m.log.find((e) => e[0] === 'write');
  assert.equal(w[2], true, 'the write runs in background mode');
  assert.deepEqual(m.log.find((e) => e[0] === 'cancelToday'), ['cancelToday', true], 'the reminder cleanup (restoreSnoozes -> getCachedUser) reads the stored user');
  assert.equal(m.isBackground(), false, 'restored after the action');
  const s = loadModule();
  await s.task()({ data: { ...response(), actionIdentifier: 'SNOOZE_HOUR' } });
  assert.deepEqual(s.log.find((e) => e[0] === 'snooze'), ['snooze', true]);
  // In the foreground nothing changes: the normal session is used.
  const f = loadModule({ AppState: { currentState: 'active', addEventListener: () => {} } });
  await f.handleNotificationResponse(response());
  assert.ok(!f.log.some((e) => e[0] === 'bg'), 'no background mode while the app is open');
});

test('DV-184: a tap with nothing to log (already logged / paused) is still handled once, with the honest notice', async () => {
  const m = loadModule({ recordDoseTaken: () => ({ logId: null, alreadyLogged: true }) });
  await m.task()({ data: response() });
  assert.equal(handled(m).length, 1);
  assert.ok(m.log.some((e) => e[0] === 'post' && e[1] === 'Nothing new logged'));
  assert.ok(m.log.some((e) => e[0] === 'dismiss'));
});

test('DV-184 source guard: the notification action path never calls getSession', () => {
  const s = read('lib/notificationActions.js');
  assert.doesNotMatch(s, /getSession|getCachedUser/);
  assert.match(s, /enterBackgroundRun\(\)/);
});

// ── Gate B review (1.3.1) ───────────────────────────────────────────────────────────────────────

test('Gate B 1: a 2x/day dose written, then the headless task killed before the end -> the retry never logs a second Taken', async () => {
  const store = {};
  const rows = [];
  // The dose table as recordDoseTaken keeps it: a row carries the tap's source_key (re-verification C).
  const write = (id, o) => {
    const hit = rows.find((r) => o.sourceKey && r.source_key === o.sourceKey);
    if (hit) return { logId: null, alreadyLogged: true, sameTap: true, protocol: { name: 'BPC-157', type: 'oral' } };
    rows.push({ protocol_id: id, outcome: 'Taken', source_key: o.sourceKey || null });
    return { logId: rows.length, protocol: { name: 'BPC-157', type: 'oral', doses_per_day: 2 }, dayKey: '2026-10-20' };
  };
  // First run: the write lands, then the process dies while the reminder cleanup is awaited.
  const killed = loadModule({ recordDoseTaken: write, cancelTodaysDoseReminders: () => new Promise(() => {}) }, { store });
  killed.task()({ data: response() }); // never settles (killed)
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(rows.length, 1, 'the dose was written');
  // Next launch: the drain delivers the same tap to a fresh process (same AsyncStorage).
  const next = loadModule({ recordDoseTaken: write }, { store });
  await next.task()({ data: response() });
  assert.equal(rows.length, 1, 'exactly one Taken row (planMarkTaken would allow a 2nd dose of a 2x/day protocol)');
  assert.equal(rows[0].source_key, 'dose-12-2026-10-20-t0|MARK_TAKEN|1760950000000', 'the tap\'s key goes with the write');
  assert.ok(!next.log.some((e) => e[0] === 'post'), 'the replay of a tap already written posts nothing');
  assert.ok(next.log.some((e) => e[0] === 'dismiss'), 'and clears the banner');
  assert.equal(handled(next).length, 1);
});

test('Re-verification C: the AsyncStorage claim is after the write (a kill at the claim never leaves the dose unwritten)', async () => {
  const store = {};
  const rows = [];
  const write = (id, o) => {
    if (rows.some((r) => r.source_key === o.sourceKey)) return { logId: null, alreadyLogged: true, sameTap: true };
    rows.push({ source_key: o.sourceKey });
    return { logId: 1, protocol: { name: 'x', type: 'oral' }, dayKey: '2026-10-20' };
  };
  // The process dies inside the claim's AsyncStorage write (the value is stored, nothing after runs).
  const dying = { getItem: async (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; return new Promise(() => {}); } };
  const first = loadModule({ recordDoseTaken: write, AsyncStorage: dying }, { store });
  first.task()({ data: response() });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(rows.length, 1, 'the dose was written before any claim (claimed first, it would be lost)');
  const next = loadModule({ recordDoseTaken: write }, { store });
  await next.task()({ data: response() });
  assert.equal(rows.length, 1, 'and never twice');
});

test('Gate B 2: "Nothing else today" whose day marker could not be written is not claimed and keeps the banner; no user = handled', async () => {
  const food = (date) => ({ actionIdentifier: 'FOOD_DAY_DONE', notification: { date, request: { identifier: 'food-log-2026-10-20', content: { data: {} } } } });
  let fail = true;
  const m = loadModule({ closeFoodDay: async () => { if (fail) { fail = false; throw new Error('insert failed'); } return true; } });
  await m.task()({ data: food(1) });
  assert.deepEqual(handled(m), [], 'not claimed');
  assert.ok(!m.log.some((e) => e[0] === 'dismiss'), 'banner kept');
  await m.task()({ data: food(1) });
  assert.equal(handled(m).length, 1, 'the retry closes the day');
  const nobody = loadModule({ closeFoodDay: async () => false });
  await nobody.task()({ data: food(2) });
  assert.equal(handled(nobody).length, 1, 'signed out: nothing to close, handled');
});

test('Gate B 2: closeFoodDay throws on a failed marker write when asked to (the notification), and keeps false for no user / a bad day', async () => {
  const mk = (insert, user = { id: 'u1' }) => loadFn('lib/notifications.js', 'export async function closeFoodDay(', 'closeFoodDay', {
    getCachedUser: async () => user,
    insertFoodDayMarker: insert,
    getNotifications: () => null,
    syncFoodLogReminder: async () => {},
  });
  await assert.rejects(mk(() => { throw new Error('db'); })('2026-10-20', null, { throwOnFail: true }));
  await assert.rejects(mk(() => null)('2026-10-20', null, { throwOnFail: true }));
  assert.equal(await mk(() => null)('2026-10-20'), false, 'Food log screen: still false (its own error message)');
  assert.equal(await mk(() => 1, null)('2026-10-20', null, { throwOnFail: true }), false, 'no user: false, no throw');
  assert.equal(await mk(() => 1)('bad', null, { throwOnFail: true }), false);
  assert.match(read('lib/notificationActions.js'), /closeFoodDay\(dayKey, null, \{ throwOnFail: true \}\)/);
});

test('Gate B 3: analytics never reaches the auth client while in background mode (queued, sent on the next foreground event)', async () => {
  const calls = [];
  let bg = true;
  const mem = {};
  const AsyncStorage = { getItem: async (k) => (k in mem ? mem[k] : null), setItem: async (k, v) => { mem[k] = v; } };
  const supabase = { from: (t) => ({ insert: async (row) => { calls.push(['insert', t, row]); return { error: null }; } }) };
  const deps = {
    storedSessionOnly: () => bg,
    getCachedUser: async () => { calls.push(['getUser', bg]); return { id: 'u', user_metadata: {} }; },
    supabase, AsyncStorage,
    Platform: { OS: 'android' },
    installId: async () => 'inst',
    buildRow: (name, props, inst, os, at) => ({ name, at }),
  };
  // The real queue (lib/analyticsQueue), as lib/analytics builds it.
  const { createAnalyticsQueue } = require('../lib/analyticsQueue');
  deps.bgQueue = createAnalyticsQueue({ storage: AsyncStorage, key: 'q', send: (row) => supabase.from('analytics_events').insert(row) });
  const logEvent = loadFn('lib/analytics.js', 'export async function logEvent(', 'logEvent', deps);
  assert.match(read('lib/analytics.js'), /const bgQueue = createAnalyticsQueue\(\{ storage: AsyncStorage, key: BG_QUEUE_KEY, send: \(row\) => supabase\.from\('analytics_events'\)\.insert\(row\) \}\);/);
  await logEvent('dose_logged', { source: 'notification' });
  assert.deepEqual(calls, [], 'no session read, no insert in background mode');
  bg = false;
  await logEvent('notif_action', {});
  assert.deepEqual(calls.filter((c) => c[0] === 'insert').map((c) => c[2].name), ['dose_logged', 'notif_action'], 'the queued event goes first, with the foreground one');
  await logEvent('x', {});
  assert.equal(calls.filter((c) => c[0] === 'insert' && c[2].name === 'dose_logged').length, 1, 'sent once');
});

test('Gate B 7: background mode is a counter - an overlapping refresh and action leave it on until both end; reset when the app is active', () => {
  const BG = require('../lib/backgroundMode');
  BG.reset();
  const stored = [];
  const _background = false;
  const deps = { BG, setStoredSessionOnly: (v) => stored.push(v), _background };
  const enter = loadFn('lib/notifications.js', 'export function enterBackgroundRun(', 'enterBackgroundRun', deps);
  const leave = loadFn('lib/notifications.js', 'export function leaveBackgroundRun(', 'leaveBackgroundRun', deps);
  const reset = loadFn('lib/notifications.js', 'export function resetBackgroundRun(', 'resetBackgroundRun', deps);
  const last = () => stored[stored.length - 1];
  const refresh = enter();  // the reminder refresh starts
  const action = enter();   // a Mark complete arrives
  leave(action);            // the action ends
  assert.equal(last(), true, 'the refresh is still running: stored session only');
  leave(refresh);           // the refresh ends
  assert.equal(last(), false);
  leave(refresh);           // an extra leave never goes negative
  const t = enter();
  assert.equal(last(), true);
  reset();
  assert.equal(last(), false);
  leave(t);
  const t2 = enter();
  assert.equal(last(), true, 'counted from 0 again after a reset');
  leave(t2);
  BG.reset();
});

test('Re-verification B: a stale leave from before a foreground reset never ends a newer background job (5 steps)', () => {
  const BG = require('../lib/backgroundMode');
  BG.reset();
  const a = BG.enter();          // 1. job A (headless) enters
  BG.reset();                    // 2. the app comes to the foreground: reset
  const b = BG.enter();          // 3. the app goes back; job B (headless) enters
  BG.leave(a);                   // 4. job A finishes late: its leave belongs to the old generation
  assert.equal(BG.active(), true, '5. job B still reads the stored session (never getSession headless)');
  BG.leave(b);
  assert.equal(BG.active(), false);
  BG.reset();
  // The reminder refresh leaves with the token it entered with.
  const bt = read('lib/backgroundTasks.js');
  assert.match(bt, /if \(v\) token = enterBackgroundRun\(\); else leaveBackgroundRun\(token\);/);
});

test('Gate B 7: the notification module resets background mode when the app becomes active', () => {
  const m = loadModule();
  m.appChange('active');
  assert.ok(m.log.some((e) => e[0] === 'bgReset'));
});
