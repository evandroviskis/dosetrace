'use strict';
// Founder 2026-10-07 council 3 decisions 2-5 ("1 a 7 sim"), picture docs/design/council3-decisions.html.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');
const R = require('../lib/reminderHealth');
const T = require('../i18n/translations.js').translations || require('../i18n/translations.js');

test('2: Silent mode on → a Today alert for anyone with a reminder time (both platforms)', () => {
  assert.equal(R.shouldWarnSilent({ silent: true, activeWithTime: 1 }), true);
  assert.equal(R.shouldWarnSilent({ silent: true, activeWithTime: 0 }), false);
  assert.equal(R.shouldWarnSilent({ silent: false, activeWithTime: 3 }), false);
  const t = read('screens/TodayScreen.js');
  const i = t.indexOf("id: 'reminders_silent'");
  assert.ok(i > 0);
  assert.match(t.slice(i, i + 400), /iconName: 'mute'/);
  assert.match(t.slice(i, i + 400), /snoozeId: 'reminders_silent'/);
});

test('3: two or more reminder warnings become ONE card that opens the step; one stays itself', () => {
  assert.deepEqual(R.reminderWarnings({ blocked: true, late: true, stop: true, stale: 0 }), ['blocked', 'late', 'stop']);
  assert.deepEqual(R.reminderWarnings({ blocked: false, late: false, stop: false, stale: 3 }), ['stale']);
  const t = read('screens/TodayScreen.js');
  const i = t.indexOf("id: 'reminders_combined'");
  assert.ok(i > 0);
  const block = t.slice(i - 400, i + 600);
  assert.match(block, /if \(warnings\.length >= 2/);
  assert.match(block, /navigation\.navigate\('ReminderCheck', \{ mode: 'setup' \}\)/);
  assert.match(block, /snoozeId: 'reminders_combined'/);
});

test('4: Check reminders (Android) ends with "See step by step (N of M ready)" into the step', () => {
  const s = read('screens/ReminderCheckScreen.js');
  assert.match(s, /rc_setup_open/);
  assert.match(s, /!setup && health && health\.os === 'android'/);
  assert.match(s, /navigation\.push\('ReminderCheck', \{ mode: 'setup' \}\)/);
});

test('5: Android users who already have a protocol with a reminder time see the step once after updating', () => {
  const { shouldOpenSetup } = require('../lib/reminderSetupRule');
  assert.equal(shouldOpenSetup({ os: 'android', seen: false, activeWithTime: 4 }), true);
  const n = read('lib/reminderSetup.js');
  assert.match(n, /export async function maybeOpenSetupForExisting\(navigation, activeWithTime\)/);
  assert.match(read('screens/TodayScreen.js'), /maybeOpenSetupForExisting\(navigation, h\.activeWithTime\)/);
});

test('texts in all 6 languages', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of ['today_alert_silent_title', 'today_alert_silent_body', 'today_alert_combined_title', 'today_alert_combined_body', 'rc_setup_open']) assert.ok(T[l][k], `${l} ${k}`);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(T[l].today_alert_combined_title.includes('{n}') && T[l].rc_setup_open.includes('{n}'), l);
});

// Ship-check review (2026-10-07): the once-only step must never pull the user off another screen —
// Today's reminder read also runs after every background resync, with Today hidden behind it.
test('5: the step opens only while Today is the screen in front', () => {
  const t = read('screens/TodayScreen.js');
  assert.match(t, /if \(!navigation\.isFocused\(\)\) return;[^\n]*\n\s*maybeOpenSetupForExisting\(navigation, h\.activeWithTime\)/);
});

// Ship-check review: a foreground resync that ran with no user known (offline, token expired)
// scheduled nothing, yet marked "the app refreshed" and hid the stale alert for 2 days.
test('the app-refresh mark is written only when a user was known for that resync', () => {
  const n = read('lib/notifications.js');
  assert.match(n, /run\.then\(async \(\) => \{ if \(_background\) return; const u = await getCachedUser\(\)\.catch\(\(\) => null\); if \(u\) await AsyncStorage\.setItem\(FG_SYNC_KEY/);
});

// Ship-check review: the Retomar question looked at vials including deleted ones.
test('1: the container question ignores deleted vials', () => {
  const p = read('screens/ProtocolsScreen.js');
  const i = p.indexOf('function askRestart(p) {');
  assert.match(p.slice(i, i + 600), /getVialsForProtocol\(p\.id\)\.length > 0/);
});
