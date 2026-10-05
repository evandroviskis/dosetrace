'use strict';
// The Reminder check's rules (docs/specs/reminder-check.md, founder 2026-10-05 "1 B"). Pure —
// lib/notifications reads the phone, this decides what each row says and whether Today warns.
//   state: 'ok' | 'warn' (can delay) | 'block' (reminders cannot arrive) | 'open' (cannot be read:
//   the row only opens the system screen and says what to check)
// Only what the app can READ ever blocks; Today warns only for a block (RC-6).

const IMPORTANCE_NONE = 0; // Android: a category the user switched off

function reminderChecks({ os, manufacturer, permission, doseChannelImportance, batteryOptimized }) {
  const checks = [];
  checks.push({ id: 'notifications', state: permission === 'granted' ? 'ok' : 'block', fix: 'notifications' });
  if (os === 'android') {
    if (doseChannelImportance != null) {
      checks.push({ id: 'channel', state: doseChannelImportance === IMPORTANCE_NONE ? 'block' : 'ok', fix: 'channel' });
    }
    if (batteryOptimized != null) {
      checks.push({ id: 'battery', state: batteryOptimized ? 'warn' : 'ok', fix: 'battery' });
    }
    checks.push({ id: 'alarms', state: 'open', fix: 'alarms' });
    if (/samsung/i.test(String(manufacturer || ''))) checks.push({ id: 'deep_sleep', state: 'open', fix: 'deepSleep' });
  }
  return checks;
}

// Nothing scheduled although reminders are on and an active protocol has a time: a block too
// (that is exactly what the founder's phone showed — no reminder for a week).
function scheduleState({ remindersOn, activeWithTime, scheduledCount }) {
  if (!remindersOn) return 'off';
  if (!activeWithTime) return 'none_needed';
  return scheduledCount > 0 ? 'ok' : 'block';
}

function blockingCount(checks, schedule) {
  return checks.filter((c) => c.state === 'block').length + (schedule === 'block' ? 1 : 0);
}

// Today's alert (RC-6): only when the user wants dose reminders, has a protocol that needs them,
// and something readable blocks them.
function shouldWarnToday({ remindersOn, activeWithTime, checks, schedule }) {
  if (!remindersOn || !activeWithTime) return false;
  return blockingCount(checks, schedule) > 0;
}

module.exports = { reminderChecks, scheduleState, blockingCount, shouldWarnToday, IMPORTANCE_NONE };
