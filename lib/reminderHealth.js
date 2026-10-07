'use strict';
// The Reminder check's rules (docs/specs/reminder-check.md, founder 2026-10-05 "1 B"). Pure —
// lib/notifications reads the phone, this decides what each row says and whether Today warns.
//   state: 'ok' | 'warn' (can delay) | 'block' (reminders cannot arrive) | 'open' (cannot be read:
//   the row only opens the system screen and says what to check)
// Only what the app can READ ever blocks; Today warns only for a block (RC-6).

const { dueDateKeys, reminderTimes, ymd, parseYmd } = require('./notificationPlan');

const IMPORTANCE_NONE = 0; // Android: a category the user switched off

// How many dose reminders SHOULD be scheduled inside the scheduling window (future slots only).
// An every-14-days protocol on iPhone (10-day window) or a monthly one on Android (21 days) may have
// none yet — that is not a block (council 2 QA, 2026-10-05).
// takenToday: { protocolId: Taken doses logged today } — today's first slots that are already taken
// get no reminder (lib/notifications scheduleDoseReminder), so they are not owed either.
function dueInWindow(protocols, now = new Date(), windowDays = 10, takenToday = {}) {
  let n = 0;
  const todayKey = ymd(now);
  for (const p of protocols || []) {
    const times = reminderTimes(p.reminder_time);
    if (!times.length) continue;
    for (const key of dueDateKeys(p, todayKey, windowDays)) {
      for (let ti = 0; ti < times.length; ti++) {
        const t = times[ti];
        if (key === todayKey && ti < (takenToday[p.id] || 0)) continue;
        const at = parseYmd(key);
        at.setHours(t.hour, t.minute, 0, 0);
        if (at > now) n++;
      }
    }
  }
  return n;
}

function reminderChecks({ os, manufacturer, permission, doseChannelImportance, batteryOptimized, exactAlarms }) {
  const checks = [];
  checks.push({ id: 'notifications', state: permission === 'granted' ? 'ok' : 'block', fix: 'notifications' });
  if (os === 'android') {
    if (doseChannelImportance != null) {
      checks.push({ id: 'channel', state: doseChannelImportance === IMPORTANCE_NONE ? 'block' : 'ok', fix: 'channel' });
    }
    if (batteryOptimized != null) {
      checks.push({ id: 'battery', state: batteryOptimized ? 'warn' : 'ok', fix: 'battery' });
    }
    // A-106: readable on Android 12+ (modules/dt-exact-alarm). Off = reminders up to 1 h late: a
    // warning, never a block. Unknown (module missing) = open only, as before.
    checks.push({ id: 'alarms', state: exactAlarms === true ? 'ok' : exactAlarms === false ? 'warn' : 'open', fix: 'alarms' });
    if (/samsung/i.test(String(manufacturer || ''))) checks.push({ id: 'deep_sleep', state: 'open', fix: 'deepSleep' });
  }
  return checks;
}

// Nothing scheduled although reminders are on and an active protocol has a time: a block too
// (that is exactly what the founder's phone showed — no reminder for a week).
// syncedOnce === false: the first resync of this session has not finished — an empty queue is not
// evidence yet ('pending', never a block; council 2).
function scheduleState({ remindersOn, activeWithTime, scheduledCount, dueInWindow: due, syncedOnce }) {
  if (!remindersOn) return 'off';
  if (!activeWithTime) return 'none_needed';
  if (due === 0 && !scheduledCount) return 'none_needed'; // nothing due inside the window yet
  if (syncedOnce === false && !scheduledCount) return 'pending';
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

// A-106: Today's "Reminders may be late" alert — Android with Alarms & reminders off, for a user
// who wants dose reminders and has a protocol with a reminder time. Unknown never warns.
function shouldWarnLate({ os, exactAlarms, remindersOn, activeWithTime }) {
  return os === 'android' && exactAlarms === false && !!remindersOn && activeWithTime > 0;
}

module.exports = { dueInWindow, reminderChecks, scheduleState, blockingCount, shouldWarnToday, shouldWarnLate, IMPORTANCE_NONE };
