'use strict';
// DV-184 (S1): "Mark complete" pressed on an Android notification with the app closed (the headless
// task). Before the fix the tap was CLAIMED (stored as handled) before the dose was written, any
// throw in the write was swallowed and the banner dismissed anyway, and ensureDb marked the database
// ready even when it failed to open: the dose could go unlogged, never retried, while the banner
// disappeared and the user believed it was logged. Now: the tap is claimed only after the action
// succeeds; a failed action keeps the banner (and the last response, so the next open retries),
// posts nothing; ensureDb retries; and the headless run reads the user as stored on the phone
// (setBackgroundRun -> readStoredUser), never getSession (which may rotate the token, INV-06).
// The WHOLE lib/notificationActions.js runs here with its imports replaced by fakes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');
const { notificationTakeTarget } = require('../lib/markTaken');
const { parseDoseId, foodReminderDay } = require('../lib/notificationPlan');

function loadModule(over = {}) {
  const src = read('lib/notificationActions.js')
    .split('\n').filter((l) => !/^import\s/.test(l)).join('\n')
    .replace(/^export\s+/gm, '');
  const log = [];
  const store = {};
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
    AppState: { currentState: 'background', addEventListener: () => {} },
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
    setBackgroundRun: (v) => { background = !!v; log.push(['bg', !!v]); },
    storedSessionOnly: () => background,
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
  return { ...mod, log, store, deps, task: () => taskFn, isBackground: () => background };
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
  assert.match(s, /setBackgroundRun\(true\)/);
});
