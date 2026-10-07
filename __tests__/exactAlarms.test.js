'use strict';
// docs/specs/exact-alarms.md (A-106, founder 2026-10-07 "Aprovado, pode fazer"). Android 14+ leaves
// "Alarms & reminders" off by default; reminders then arrive up to 1 h late (adb, founder's Fold).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../lib/reminderHealth');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const T = require('../i18n/translations.js').translations || require('../i18n/translations.js');

const androidOk = { os: 'android', manufacturer: 'Google', permission: 'granted', doseChannelImportance: 5, batteryOptimized: false };
const alarms = (h) => R.reminderChecks(h).find((c) => c.id === 'alarms');

test('EA-1/EA-2: the Alarms & reminders row reads the real state on Android', () => {
  assert.equal(alarms({ ...androidOk, exactAlarms: true }).state, 'ok');
  assert.equal(alarms({ ...androidOk, exactAlarms: false }).state, 'warn', 'late, never blocked');
  assert.equal(alarms({ ...androidOk, exactAlarms: null }).state, 'open', 'cannot be read → open only, as before');
  assert.equal(alarms({ ...androidOk }).state, 'open');
  assert.equal(alarms({ os: 'ios', permission: 'granted', exactAlarms: false }), undefined, 'no row on iPhone');
});

test('EA-3: Today warns "may be late" only on Android, permission off, reminders on, a protocol with a time', () => {
  const base = { os: 'android', exactAlarms: false, remindersOn: true, activeWithTime: 2 };
  assert.equal(R.shouldWarnLate(base), true);
  assert.equal(R.shouldWarnLate({ ...base, exactAlarms: true }), false);
  assert.equal(R.shouldWarnLate({ ...base, exactAlarms: null }), false, 'unknown never warns');
  assert.equal(R.shouldWarnLate({ ...base, remindersOn: false }), false);
  assert.equal(R.shouldWarnLate({ ...base, activeWithTime: 0 }), false);
  assert.equal(R.shouldWarnLate({ ...base, os: 'ios' }), false);
});

test('EA-5: exact alarms off is never a block (the "blocked" alert and the Settings line are unchanged)', () => {
  const h = { ...androidOk, exactAlarms: false, remindersOn: true, activeWithTime: 2 };
  const checks = R.reminderChecks(h);
  assert.equal(R.blockingCount(checks, 'ok'), 0);
  assert.equal(R.shouldWarnToday({ ...h, checks, schedule: 'ok' }), false);
});

test('EA-1: readReminderHealth reads the native check; EA-4: turning it on reschedules every reminder', () => {
  const n = read('lib/notifications.js');
  assert.match(n, /canScheduleExactAlarms/);
  assert.match(n, /out\.exactAlarms\s*=/);
  assert.match(n, /export function watchExactAlarms/, 'a foreground watcher');
  const body = n.slice(n.indexOf('export function watchExactAlarms'), n.indexOf('export function watchExactAlarms') + 1200);
  assert.match(body, /syncAllNotifications\(/, 'resync when it turns on');
  assert.match(read('App.js'), /watchExactAlarms\(/, 'started once at app level');
  const mod = read('modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/DtExactAlarmModule.kt');
  assert.match(mod, /canScheduleExactAlarms\(\)/);
  assert.match(mod, /VERSION_CODES\.S/, 'Android 11 and older count as allowed');
});

test('EA-2: the Reminder check row has on / off texts and a Turn on button', () => {
  const s = read('screens/ReminderCheckScreen.js');
  assert.match(s, /alarms: \{ icon: 'clock', title: 'rc_alarms', ok: 'rc_alarms_ok', warn: 'rc_alarms_warn', open: 'rc_alarms_sub', fix: 'rc_fix_turn_on' \}/);
});

test('EA-3: Today adds the "may be late" alert, snoozable, opening Android\'s screen directly', () => {
  const s = read('screens/TodayScreen.js');
  const i = s.indexOf("id: 'reminders_late'");
  assert.ok(i > 0);
  const block = s.slice(i - 200, i + 400);
  assert.match(block, /snoozeId: 'reminders_late'/);
  assert.match(block, /openReminderFix\('alarms'\)/);
  assert.match(block, /today_alert_late_title/);
});

test('EA-6: new text in all 6 languages, with Android\'s own name for the setting', () => {
  const name = { en: 'Alarms & reminders', es: 'Alarmas y recordatorios', pt: 'Alarmes e lembretes', fr: 'Alarmes et rappels', de: 'Wecker und Erinnerungen', it: 'Sveglie e promemoria' };
  for (const l of Object.keys(name)) {
    for (const k of ['rc_alarms_ok', 'rc_alarms_warn', 'today_alert_late_title', 'today_alert_late_body']) assert.ok(T[l][k], `${l} ${k}`);
    assert.ok(T[l].today_alert_late_body.includes(name[l]), `${l} names the setting as Android does`);
    assert.equal(T[l].rc_alarms, name[l], `${l} row title`);
  }
});
