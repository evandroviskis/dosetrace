'use strict';
// Council 2 senior review (2026-10-05): expo-notifications 0.32 reads an Android notification's
// channel ONLY from the trigger (build/scheduleNotificationAsync.js parseDateTrigger copies
// trigger.channelId). The app put channelId in the content, so every Android reminder would land
// in the fallback "Miscellaneous" channel — and the Reminder check would read a channel nothing
// uses. Every schedule call now goes through androidChannelRequest, which moves it to the trigger.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { androidChannelRequest } = require('../lib/notificationPlan');

test('Android: the channel moves from the content to a date trigger', () => {
  const r = androidChannelRequest({ content: { title: 'T', channelId: 'dose-reminders' }, trigger: { type: 'date', date: 5 } }, 'android');
  assert.deepEqual(r.trigger, { type: 'date', date: 5, channelId: 'dose-reminders' });
  assert.ok(!('channelId' in r.content));
});

test('Android: an immediate notification gets a channel-only trigger', () => {
  const r = androidChannelRequest({ content: { channelId: 'vial-alerts' }, trigger: null }, 'android');
  assert.deepEqual(r.trigger, { channelId: 'vial-alerts' });
});

test('iPhone: nothing changes, and a content channel is dropped', () => {
  const r = androidChannelRequest({ content: { title: 'T' }, trigger: { type: 'date', date: 5 } }, 'ios');
  assert.deepEqual(r, { content: { title: 'T' }, trigger: { type: 'date', date: 5 } });
});

test('lib/notifications schedules only through the channel helper', () => {
  const s = fs.readFileSync(path.join(__dirname, '../lib/notifications.js'), 'utf8');
  assert.doesNotMatch(s, /N\.scheduleNotificationAsync\(\{/, 'no direct schedule call');
  assert.match(s, /function scheduleReq\(N, req\) \{\s*return N\.scheduleNotificationAsync\(androidChannelRequest\(req, Platform\.OS\)\);/);
});

// Council 2 senior review B2: Mark as taken with the app closed must not rebuild the whole queue in
// a headless task Android can kill mid-way (cancelled, never rescheduled = silent reminders). Today's
// slot is already cancelled; the full resync runs when the app is active.
test('a background Mark as taken resyncs reminders only when the app is active', () => {
  const s = fs.readFileSync(path.join(__dirname, '../lib/notificationActions.js'), 'utf8');
  assert.doesNotMatch(s, /\n  syncAllNotifications\(\)\.catch/, 'never unconditional');
  assert.match(s, /if \(AppState\.currentState === 'active'\) syncAllNotifications\(\)\.catch\(\(\) => \{\}\);/);
});

// Senior review #1: at the first open of a build the queue is still empty until the first resync
// finishes; "nothing scheduled" is not a block until one has finished this session.
test('nothing scheduled is not a block before the first resync of the session', () => {
  const R = require('../lib/reminderHealth');
  assert.equal(R.scheduleState({ remindersOn: true, activeWithTime: 2, scheduledCount: 0, dueInWindow: 5, syncedOnce: false }), 'pending');
  assert.equal(R.scheduleState({ remindersOn: true, activeWithTime: 2, scheduledCount: 0, dueInWindow: 5, syncedOnce: true }), 'block');
  const checks = R.reminderChecks({ os: 'ios', permission: 'granted' });
  assert.equal(R.shouldWarnToday({ remindersOn: true, activeWithTime: 2, checks, schedule: 'pending' }), false);
});
