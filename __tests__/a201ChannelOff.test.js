// A-201 (Fold7 2026-10-31, SP-9 session): the Dose reminders category switched off in Android
// (dumpsys mImportance=0) left the reminder screen at "5 of 5 ready" and the Settings row at "All set".
// The importance is read through expo-notifications (getNotificationChannelAsync), which reports its
// own enum — AndroidImportance.NONE = 2, UNKNOWN = 0 — never Android's raw 0. A channel read as NONE
// is a block; UNKNOWN is a value the app could not read and never blocks (only what is read blocks).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../lib/reminderHealth');

// The value expo-notifications reports for a switched-off channel, read from the installed package.
function expoEnum(name) {
  const d = fs.readFileSync(path.join(__dirname, '../node_modules/expo-notifications/build/NotificationChannelManager.types.d.ts'), 'utf8');
  const body = d.slice(d.indexOf('export declare enum AndroidImportance'));
  const m = body.match(new RegExp(`\\b${name} = (\\d+)`));
  return Number(m[1]);
}
const EXPO_NONE = expoEnum('NONE');
const EXPO_UNKNOWN = expoEnum('UNKNOWN');
const EXPO_DEFAULT = expoEnum('DEFAULT');

const ok = { os: 'android', manufacturer: 'samsung', permission: 'granted', doseChannelImportance: EXPO_DEFAULT, batteryOptimized: false,
  exactAlarms: true, hibernationExempt: true, remindersOn: true, activeWithTime: 1, scheduledCount: 20, syncedOnce: true,
  lastRefresh: { at: Date.now(), ok: true }, nowMs: Date.now(), deepSleepCheckedAt: Date.now() };

test('A-201: the Dose reminders category as expo reports it switched off (AndroidImportance.NONE) is a block', () => {
  const by = Object.fromEntries(R.reminderChecks({ ...ok, doseChannelImportance: EXPO_NONE }).map((c) => [c.id, c.state]));
  assert.equal(by.channel, 'block');
  assert.equal(R.setupRowState({ ...ok, doseChannelImportance: EXPO_NONE }).kind, 'block', 'the Settings row is never "All set" with the category off');
});

test('A-201: the check-in and vial categories switched off (AndroidImportance.NONE) are blocks', () => {
  const rows = R.kindChannelChecks({ os: 'android', checkinChannelImportance: EXPO_NONE, vialChannelImportance: EXPO_NONE, foodOn: true, vialOn: true });
  assert.deepEqual(rows.map((r) => [r.id, r.state]), [['channel_checkin', 'block'], ['channel_vial', 'block']]);
});

test('A-201: a channel on, or one expo could not read (UNKNOWN), never blocks', () => {
  for (const v of [EXPO_DEFAULT, EXPO_UNKNOWN]) {
    const by = Object.fromEntries(R.reminderChecks({ ...ok, doseChannelImportance: v }).map((c) => [c.id, c.state]));
    assert.equal(by.channel, 'ok', `importance ${v}`);
  }
  assert.equal(R.IMPORTANCE_NONE, EXPO_NONE, 'the constant is expo\'s NONE, not Android\'s raw 0');
});
