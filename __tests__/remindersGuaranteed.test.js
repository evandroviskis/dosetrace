'use strict';
// docs/specs/reminders-guaranteed.md (A-110, founder 2026-10-07; picture approved the same day).
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');
const R = require('../lib/reminderHealth');
const T = require('../i18n/translations.js').translations || require('../i18n/translations.js');

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 7, 12);
const base = { os: 'android', manufacturer: 'samsung', permission: 'granted', doseChannelImportance: 5, batteryOptimized: false,
  exactAlarms: true, hibernationExempt: true, remindersOn: true, silent: false, activeWithTime: 2, lastRefresh: { at: NOW - 3600e3, ok: true }, nowMs: NOW };
const row = (h, id) => R.reminderChecks(h).find((c) => c.id === id);

test('RG-3: "Pause app activity if unused" is read — exempt OK, not exempt attention, unknown open', () => {
  assert.equal(row(base, 'hibernation').state, 'ok');
  assert.equal(row({ ...base, hibernationExempt: false }, 'hibernation').state, 'warn');
  assert.equal(row({ ...base, hibernationExempt: null }, 'hibernation').state, 'open');
  assert.equal(row({ os: 'ios', permission: 'granted' }, 'hibernation'), undefined, 'Android only');
});

test('RG-4: "Automatic refresh" — recent run OK, never ran yet OK (pending), more than 2 days late attention', () => {
  assert.equal(row(base, 'refresh').state, 'ok');
  const never = row({ ...base, lastRefresh: null }, 'refresh');
  assert.equal(never.state, 'ok'); assert.equal(never.pending, true);
  const late = row({ ...base, lastRefresh: { at: NOW - 4 * DAY, ok: true } }, 'refresh');
  assert.equal(late.state, 'warn'); assert.equal(late.days, 4);
  assert.equal(row({ ...base, lastRefresh: { at: NOW - 4 * DAY }, activeWithTime: 0 }, 'refresh').state, 'ok', 'nothing to remind → never late');
  assert.equal(row({ os: 'ios', permission: 'granted' }, 'refresh'), undefined);
});

test('RG-3/RG-4 are warnings, never blocks (the "blocked" alert is unchanged)', () => {
  const h = { ...base, hibernationExempt: false, lastRefresh: { at: NOW - 9 * DAY } };
  assert.equal(R.blockingCount(R.reminderChecks(h), 'ok'), 0);
});

test('RG-5: Today alerts — may stop / not refreshed — only when it matters', () => {
  assert.equal(R.shouldWarnStop({ ...base, hibernationExempt: false }), true);
  assert.equal(R.shouldWarnStop(base), false);
  assert.equal(R.shouldWarnStop({ ...base, hibernationExempt: false, silent: true }), false);
  assert.equal(R.shouldWarnStop({ ...base, hibernationExempt: false, remindersOn: false }), false);
  assert.equal(R.shouldWarnStop({ ...base, hibernationExempt: false, activeWithTime: 0 }), false);
  assert.equal(R.shouldWarnStop({ ...base, hibernationExempt: false, os: 'ios' }), false);
  assert.equal(R.staleRefreshDays({ ...base, lastRefresh: { at: NOW - 3 * DAY } }), 3);
  assert.equal(R.staleRefreshDays(base), 0);
  assert.equal(R.staleRefreshDays({ ...base, lastRefresh: null }), 0, 'never ran yet is not late');
  assert.equal(R.staleRefreshDays({ ...base, lastRefresh: { at: NOW - 3 * DAY }, silent: true }), 0);
});

test('RG-2: setup step rows and the "N of 4 ready" count (Samsung deep sleep is listed but never counted)', () => {
  const s = R.setupSteps(base);
  assert.deepEqual(s.rows.map((r) => r.id), ['notifications', 'alarms', 'battery', 'hibernation', 'deep_sleep']);
  assert.equal(s.ready, 4); assert.equal(s.total, 4); assert.equal(s.done, true);
  const s2 = R.setupSteps({ ...base, exactAlarms: false, batteryOptimized: true, hibernationExempt: false });
  assert.equal(s2.ready, 1); assert.equal(s2.done, false);
  assert.ok(!R.setupSteps({ ...base, manufacturer: 'Google' }).rows.some((r) => r.id === 'deep_sleep'));
});

test('RG-1: the first protocol with a reminder time opens the step once, Android only', () => {
  const p = read('screens/ProtocolsScreen.js');
  assert.match(p, /maybeOpenReminderSetup\(/);
  const n = read('lib/reminderSetup.js');
  assert.match(n, /Platform\.OS !== 'android'/);
  assert.match(n, /SETUP_SEEN_KEY/);
  const { shouldOpenSetup } = require('../lib/reminderSetupRule');
  assert.equal(shouldOpenSetup({ os: 'android', seen: false, activeWithTime: 1 }), true);
  assert.equal(shouldOpenSetup({ os: 'android', seen: true, activeWithTime: 1 }), false, 'once');
  assert.equal(shouldOpenSetup({ os: 'android', seen: false, activeWithTime: 0 }), false, 'no reminder time');
  assert.equal(shouldOpenSetup({ os: 'ios', seen: false, activeWithTime: 1 }), false);
});

test('RG-2/RG-5: the screen has a setup mode; Today\'s alerts open it at the missing item', () => {
  const s = read('screens/ReminderCheckScreen.js');
  assert.match(s, /route\?\.params\?\.mode === 'setup'/);
  assert.match(s, /rc_setup_title/);
  assert.match(s, /rc_setup_progress/);
  const t = read('screens/TodayScreen.js');
  for (const id of ['reminders_stop', 'reminders_stale']) {
    const i = t.indexOf(`id: '${id}'`);
    assert.ok(i > 0, id);
    assert.match(t.slice(i, i + 500), /navigation\.navigate\('ReminderCheck', \{ mode: 'setup'/);
    assert.match(t.slice(i, i + 500), new RegExp(`snoozeId: '${id}'`));
  }
});

test('RG-3: the native module reads the hibernation exemption (Android 11+)', () => {
  const k = read('modules/dt-exact-alarm/android/src/main/java/expo/modules/dtexactalarm/DtExactAlarmModule.kt');
  assert.match(k, /Function\("isExemptFromHibernation"\)/);
  assert.match(k, /isAutoRevokeWhitelisted/);
  assert.match(k, /VERSION_CODES\.R/);
  assert.match(read('lib/notifications.js'), /out\.hibernationExempt = isExemptFromHibernation\(\);/);
});

test('RG-7: new text in all 6 languages; icons from the app set (no emoji)', () => {
  const keys = ['rc_setup_title', 'rc_setup_intro', 'rc_setup_progress', 'rc_setup_later', 'rc_setup_done',
    'rc_hibernation', 'rc_hibernation_ok', 'rc_hibernation_warn', 'rc_fix_turn_off',
    'rc_refresh', 'rc_refresh_ok', 'rc_refresh_pending', 'rc_refresh_warn',
    'today_alert_stop_title', 'today_alert_stop_body', 'today_alert_stale_title', 'today_alert_stale_body'];
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of keys) assert.ok(T[l][k], `${l} ${k}`);
  const icons = read('components/featureIconsData.js');
  for (const n of ['pause', 'refresh', 'moon', 'close']) assert.match(icons, new RegExp(`\\n  ${n}: \``));
});

// ── RG-6: the daily silent wake-up ─────────────────────────────────────────────────────────
test('RG-6: the server sends one silent, data-only wake-up per Android device (never iOS, never text)', async () => {
  const { pathToFileURL } = require('node:url');
  const path = require('node:path');
  const P = await import(pathToFileURL(path.join(__dirname, '../supabase/functions/wake-refresh/plan.js')).href);
  const msgs = P.wakeMessages([
    { expo_token: 'ExponentPushToken[a]', platform: 'android' },
    { expo_token: 'ExponentPushToken[a]', platform: 'android' },
    { expo_token: 'ExponentPushToken[i]', platform: 'ios' },
    { expo_token: null, platform: 'android' },
  ]);
  assert.equal(msgs.length, 1, 'one per Android token, duplicates and iOS dropped');
  assert.deepEqual(msgs[0], { to: 'ExponentPushToken[a]', data: { type: 'refresh_wake' }, priority: 'high', _contentAvailable: true });
  assert.ok(!('title' in msgs[0]) && !('body' in msgs[0]) && !('sound' in msgs[0]), 'nothing visible, nothing private');
  assert.deepEqual(P.deadTokens([{ to: 'x' }, { to: 'y' }], [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }]), ['y']);
});

test('RG-6: the app turns a wake-up into the reminder refresh — and nothing else', () => {
  const R = require('../lib/reminderRefresh');
  assert.equal(R.isWakePayload({ data: { type: 'refresh_wake' } }), true);
  assert.equal(R.isWakePayload({ notification: { request: { content: { data: { type: 'refresh_wake' } } } } }), true);
  assert.equal(R.isWakePayload({ data: { dataString: JSON.stringify({ type: 'refresh_wake' }) } }), true);
  assert.equal(R.isWakePayload({ data: { body: JSON.stringify({ type: 'refresh_wake' }) } }), true);
  assert.equal(R.isWakePayload({ actionIdentifier: 'MARK_TAKEN', notification: { request: { content: { data: { type: 'dose_reminder' } } } } }), false);
  assert.equal(R.isWakePayload(null), false);
  const a = read('lib/notificationActions.js');
  assert.match(a, /if \(isWakePayload\(data\)\) \{ await refreshNow\(\)\.catch\(\(\) => \{\}\); return; \}/);
});

test('RG-6: the server function is protected and the schedule is a reviewed migration (not applied without the founder)', () => {
  const fn = read('supabase/functions/wake-refresh/index.ts');
  assert.match(fn, /unauthorized/);
  assert.match(fn, /eq\('platform', 'android'\)/);
  assert.match(fn, /wakeMessages\(/);
  const fs = require('node:fs');
  const mig = fs.readdirSync(require('node:path').join(__dirname, '../supabase/migrations')).find((f) => /wake_refresh/.test(f));
  assert.ok(mig, 'a migration schedules it');
});
