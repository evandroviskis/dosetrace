'use strict';
// docs/specs/reminder-setup-placement.md (A-112/A-113, founder 2026-10-07 "B, e o onboarding está bom
// assim", checklist signed "assino"). One screen "Make sure your reminders arrive": optional in the
// Android onboarding, the first row of Settings > Notifications, reminders on Today until it is OK.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');
const R = require('../lib/reminderHealth');
const T = require('../i18n/translations.js').translations || require('../i18n/translations.js');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const NOW = Date.UTC(2026, 9, 7, 12);
const ok = { os: 'android', manufacturer: 'samsung', permission: 'granted', doseChannelImportance: 5, batteryOptimized: false,
  exactAlarms: true, hibernationExempt: true, remindersOn: true, silent: false, activeWithTime: 2,
  lastRefresh: { at: NOW - 3600e3, ok: true }, nowMs: NOW, scheduledCount: 40, dueInWindow: 40, syncedOnce: true };
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a); const j = src.indexOf(b, i + a.length); return src.slice(i, j < 0 ? undefined : j); };

// ── SP-1: the Settings row and its three states ───────────────────────────────────────────────
test('SP-1: the Settings row state — a block is risk and never "All set"; attention counts; all set only when nothing blocks', () => {
  assert.equal(R.setupRowState(ok).kind, 'ok');
  for (const h of [{ ...ok, permission: 'denied' }, { ...ok, doseChannelImportance: 0 }, { ...ok, scheduledCount: 0 }]) {
    assert.equal(R.setupRowState(h).kind, 'block', JSON.stringify(h).slice(0, 60));
  }
  const w = R.setupRowState({ ...ok, exactAlarms: false, batteryOptimized: true });
  assert.equal(w.kind, 'warn'); assert.equal(w.ready, 2); assert.equal(w.total, 4);
  // Samsung deep sleep cannot be read: it never keeps the row from "All set".
  assert.equal(R.setupRowState({ ...ok, manufacturer: 'samsung' }).kind, 'ok');
});

test('SP-1: Android Settings opens Notifications with the row (state shown); iPhone keeps "Check reminders"', () => {
  const s = read('screens/SettingsScreen.js');
  const body = between(s, 'function renderNotificationsBody()', 'function renderPrivacyBody()');
  const first = body.indexOf("t('settings_setup_title')");
  assert.ok(first > 0 && first < body.indexOf("t('settings_dose_reminders')"), 'first row of Notifications');
  assert.match(body, /Platform\.OS === 'android'/);
  const sub = between(s, "function setupRowSub()", "\n  }\n");
  assert.match(sub, /settings_setup_all_next/);
  assert.match(sub, /settings_rc_sub_block/);
  assert.match(sub, /rc_setup_progress/);
  assert.match(body, /colors\.risk/);
  assert.match(body, /colors\.attention/);
  assert.match(body, /t\('settings_rc_title'\)/, 'iPhone row unchanged');
  assert.match(s, /setupRowState\(h\)/);
});

// ── SP-2: one screen ─────────────────────────────────────────────────────────────────────────
test('SP-2: one screen — no setup mode, no "See step by step"; Android shows the items, the bar, the schedule and the test', () => {
  const s = read('screens/ReminderCheckScreen.js');
  assert.doesNotMatch(s, /mode === 'setup'/);
  assert.doesNotMatch(s, /rc_setup_open/);
  assert.doesNotMatch(s, /navigation\.push\('ReminderCheck'/);
  assert.match(s, /ReminderSetupList/);
  assert.match(s, /rc_setup_title/);
  assert.match(s, /rc_test_btn/);
  assert.match(s, /rc_sched_title/);
  const rows = R.setupSteps(ok, { withRefresh: true }).rows.map((r) => r.id);
  assert.deepEqual(rows, ['notifications', 'alarms', 'battery', 'hibernation', 'refresh', 'deep_sleep']);
  assert.ok(!R.setupSteps(ok).rows.some((r) => r.id === 'refresh'), 'onboarding: items only');
  assert.equal(R.setupSteps(ok, { withRefresh: true }).total, 4, 'the refresh row is shown, never counted');
});

test('SP-3: the screen and the onboarding step read the phone again on return from Android settings', () => {
  assert.match(read('screens/ReminderCheckScreen.js'), /AppState\.addEventListener\('change'/);
  assert.match(read('screens/OnboardingFlowScreen.js'), /AppState\.addEventListener\('change'/);
  assert.match(read('screens/SettingsScreen.js'), /useFocusEffect\(/);
});

// ── SP-4: onboarding ─────────────────────────────────────────────────────────────────────────
test('SP-4: Android onboarding shows the step after "Turn on notifications", marks it seen, Continue / Set up later go on', () => {
  const o = read('screens/OnboardingFlowScreen.js');
  const en = between(o, 'async function enableNotifications()', '\n  }\n');
  assert.match(en, /Platform\.OS === 'android'/);
  assert.match(en, /setShowSetup\(true\)/);
  assert.match(en, /toAuth\('create'\)/, 'iPhone goes on as before');
  assert.match(en, /await markSetupSeen\(\)/);
  assert.match(o, /ob_setup_later/);
  assert.match(o, /<ReminderSetupList[^>]*health=/);
  // "Not now" skips it.
  const notNow = o.slice(o.indexOf("t('ob_not_now')") - 300, o.indexOf("t('ob_not_now')"));
  assert.match(notNow, /toAuth\('create'\)/);
});

// ── SP-5: no automatic opening after the first protocol; once per phone from Today ────────────
test('SP-5: the first-protocol opening is gone; Today opens the one screen once per phone', () => {
  assert.doesNotMatch(read('screens/ProtocolsScreen.js'), /maybeOpenReminderSetup|openSetup/);
  const n = read('lib/reminderSetup.js');
  assert.doesNotMatch(n, /export async function maybeOpenReminderSetup/);
  assert.match(n, /navigation\.navigate\('ReminderCheck'\)/);
  assert.doesNotMatch(n, /mode: 'setup'/);
  const { shouldOpenSetup } = require('../lib/reminderSetupRule');
  assert.equal(shouldOpenSetup({ os: 'android', seen: false, activeWithTime: 1 }), true);
  assert.equal(shouldOpenSetup({ os: 'android', seen: true, activeWithTime: 1 }), false);
});

// ── SP-6: Today keeps reminding (battery joins), snooze stays, cards open the one screen ──────
test('SP-6: Battery optimized joins the Today reminder warnings; deep sleep never counts', () => {
  assert.equal(R.shouldWarnBattery({ ...ok, batteryOptimized: true }), true);
  assert.equal(R.shouldWarnBattery({ ...ok, batteryOptimized: false }), false);
  assert.equal(R.shouldWarnBattery({ ...ok, batteryOptimized: null }), false, 'unknown never warns');
  assert.equal(R.shouldWarnBattery({ ...ok, batteryOptimized: true, activeWithTime: 0 }), false);
  assert.equal(R.shouldWarnBattery({ ...ok, batteryOptimized: true, silent: true }), false);
  assert.equal(R.shouldWarnBattery({ ...ok, batteryOptimized: true, os: 'ios' }), false);
  assert.deepEqual(R.reminderWarnings({ blocked: false, late: true, stop: false, stale: 0, battery: true }), ['late', 'battery']);
});

test('SP-6: every Today reminder card opens the one screen at its item and keeps its snooze', () => {
  const t = read('screens/TodayScreen.js');
  assert.doesNotMatch(t, /mode: 'setup'/);
  const card = (id) => t.slice(t.indexOf(`id: '${id}'`), t.indexOf(`id: '${id}'`) + 520);
  assert.match(card('reminders_combined'), /navigation\.navigate\('ReminderCheck'\)/);
  assert.match(card('reminders_late'), /navigation\.navigate\('ReminderCheck', \{ focus: 'alarms' \}\)/);
  assert.match(card('reminders_battery'), /navigation\.navigate\('ReminderCheck', \{ focus: 'battery' \}\)/);
  assert.match(card('reminders_stop'), /navigation\.navigate\('ReminderCheck', \{ focus: 'hibernation' \}\)/);
  assert.match(card('reminders_stale'), /navigation\.navigate\('ReminderCheck', \{ focus: 'refresh' \}\)/);
  for (const id of ['reminders_combined', 'reminders_late', 'reminders_battery', 'reminders_stop', 'reminders_stale']) {
    assert.match(card(id), new RegExp(`snoozeId: '${id}'`));
  }
  assert.match(t, /shouldWarnBattery\(h\)/);
});

// ── SP-7: Samsung deep sleep ─────────────────────────────────────────────────────────────────
test('SP-7: deep sleep opens Samsung\'s Battery, falling back to the app\'s own page; the text names the taps', () => {
  const n = read('lib/notifications.js');
  const fix = between(n, 'export async function openReminderFix(fix)', '\n}\n');
  assert.match(fix, /fix === 'deepSleep'/);
  assert.match(fix, /com\.samsung\.android\.sm\.ACTION_BATTERY/);
  assert.match(fix, /APPLICATION_DETAILS_SETTINGS/);
  const start = { en: 'In Battery, tap Background usage limits › Deep sleeping apps.', pt: 'Em Bateria, toque em Limites de uso em segundo plano › Aplicativos em suspensão profunda.',
    es: 'En Batería, toca Límites de uso en segundo plano › Aplicaciones en suspensión profunda.', fr: 'Dans Batterie, touchez Limites utilisation arrière-plan › Applications en veille profonde.',
    de: 'Tippe in Akku auf Grenzen der Hintergrundnutzung › Apps in tiefem Standby.', it: 'In Batteria, tocca Limiti per l’uso in background › App in sospensione avanzata.' };
  for (const l of LANGS) assert.ok(T[l].rc_deep_sleep_sub.startsWith(start[l]), `${l}: ${T[l].rc_deep_sleep_sub}`);
});

// ── SP-8: texts ──────────────────────────────────────────────────────────────────────────────
test('SP-8: new text in all 6 languages', () => {
  const keys = ['settings_setup_title', 'settings_setup_all', 'settings_setup_all_next', 'ob_setup_later', 'today_alert_battery_title', 'today_alert_battery_body'];
  for (const l of LANGS) for (const k of keys) assert.ok(T[l][k], `${l} ${k}`);
  for (const l of LANGS) {
    assert.ok(T[l].settings_setup_all_next.includes('{when}'), l);
    assert.equal(T[l].settings_setup_title, T[l].rc_setup_title, `${l}: one name for the screen and its row`);
  }
});
