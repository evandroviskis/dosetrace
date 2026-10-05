'use strict';
// docs/specs/reminder-check.md RC-1, RC-2, RC-5, RC-6, RC-8 — wiring of the Reminder check.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const { notifTapTarget } = require('../lib/notificationPlan');

test('RC-2/RC-8: the screen parses, uses theme tokens only and draws no emoji', () => {
  const s = read('screens/ReminderCheckScreen.js');
  parse(s, { sourceType: 'module', plugins: ['jsx'] });
  assert.doesNotMatch(s, /#[0-9a-fA-F]{3,8}\b/, 'no raw hex');
  assert.doesNotMatch(s, /'white'|'black'|rgba\(/);
  assert.doesNotMatch(s, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji');
  assert.match(s, /openReminderFix\(c\.fix\)/, 'each fix opens its system screen');
  assert.match(s, /sendTestReminder\(\)/);
});

test('RC-1: Settings shows "Check reminders" on both platforms and opens the screen', () => {
  const s = read('screens/SettingsScreen.js');
  const i = s.indexOf("navigation.navigate('ReminderCheck')");
  assert.ok(i > 0);
  const before = s.slice(Math.max(0, i - 600), i);
  assert.doesNotMatch(before, /Platform\.OS === 'android' && \(/, 'not Android-only');
  assert.match(s, /t\(reminderBlocks > 0 \? 'settings_rc_sub_block' : 'settings_rc_sub_ok'\)/);
  assert.doesNotMatch(s, /settings_reliable_reminders/, 'the old row is gone');
  assert.match(read('App.js'), /<Stack\.Screen name="ReminderCheck" component=\{ReminderCheckScreen\} \/>/);
});

test('RC-6: Today adds the blocked-reminders alert, snoozable, opening the check', () => {
  const s = read('screens/TodayScreen.js');
  const block = s.slice(s.indexOf("id: 'reminders_blocked'") - 200, s.indexOf("id: 'reminders_blocked'") + 400);
  assert.match(block, /remindersBlocked && !\(alertSnooze\.reminders_blocked/);
  assert.match(block, /navigation\.navigate\('ReminderCheck'\)/);
  assert.match(block, /snoozeId: 'reminders_blocked'/);
  assert.match(s, /shouldWarnToday\(/);
});

test('RC-5: tapping the test reminder opens the Reminder check (never logs a dose)', () => {
  const resp = { actionIdentifier: 'expo.modules.notifications.actions.DEFAULT', notification: { request: { content: { data: { type: 'reminder_test' } } } } };
  assert.deepEqual(notifTapTarget(resp, 0), { screen: 'ReminderCheck' });
  const lib = read('lib/notifications.js');
  const fn = lib.slice(lib.indexOf('export async function sendTestReminder'), lib.indexOf('export async function openReminderFix'));
  assert.match(fn, /Date\.now\(\) \+ 10000/);
  assert.match(fn, /channelId: 'dose-reminders'/);
  assert.doesNotMatch(fn, /categoryIdentifier|protocolId/, 'no Taken button, no protocol');
});
