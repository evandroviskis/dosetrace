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

const DAY_MS = 86400000;
const STALE_DAYS = 2; // A-110 RG-4: the refresh runs every 6 h; more than 2 days late means Android holds it

// Whole days since the last background refresh (A-107/A-110); null when it never ran.
function refreshAgeDays(lastRefresh, nowMs = Date.now()) {
  if (!lastRefresh || !Number.isFinite(lastRefresh.at)) return null;
  return Math.max(0, Math.floor((nowMs - lastRefresh.at) / DAY_MS));
}

// Reminders matter right now: wanted, not paused, and a protocol has a reminder time.
const remindersMatter = ({ remindersOn, silent, activeWithTime }) => !!remindersOn && !silent && activeWithTime > 0;

function reminderChecks({ os, manufacturer, permission, doseChannelImportance, batteryOptimized, exactAlarms, hibernationExempt, lastRefresh, nowMs, remindersOn, silent, activeWithTime, lastScheduledMs }) {
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
    // A-110 RG-3: "Pause app activity if unused" — after ~3 months without opening the app Android
    // freezes it and drops its alarms. Exempt = OK; not exempt = attention; unknown = open only.
    checks.push({ id: 'hibernation', state: hibernationExempt === true ? 'ok' : hibernationExempt === false ? 'warn' : 'open', fix: 'hibernation' });
    // A-110 RG-4: the background refresh (A-107). Never ran yet = OK (pending); late only matters
    // while reminders matter.
    const days = refreshAgeDays(lastRefresh, nowMs);
    const late = days != null && days > STALE_DAYS && remindersMatter({ remindersOn: remindersOn !== false, silent, activeWithTime: activeWithTime == null ? 1 : activeWithTime });
    checks.push({ id: 'refresh', state: late ? 'warn' : 'ok', fix: 'battery', pending: days == null, days, at: lastRefresh ? lastRefresh.at : null, until: Number.isFinite(lastScheduledMs) ? lastScheduledMs : null });
    if (/samsung/i.test(String(manufacturer || ''))) checks.push({ id: 'deep_sleep', state: 'open', fix: 'deepSleep' });
  }
  return checks;
}

// Nothing scheduled although reminders are on and an active protocol has a time: a block too
// (that is exactly what the founder's phone showed — no reminder for a week).
// syncedOnce === false: the first resync of this session has not finished — an empty queue is not
// evidence yet ('pending', never a block; council 2).
function scheduleState({ remindersOn, silent, activeWithTime, scheduledCount, dueInWindow: due, syncedOnce }) {
  if (silent) return 'silent'; // A-108: paused on purpose (Settings > Silent mode) — never a block
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
function shouldWarnLate({ os, exactAlarms, remindersOn, silent, activeWithTime }) {
  return os === 'android' && exactAlarms === false && !!remindersOn && !silent && activeWithTime > 0;
}

// A-110 RG-5: Today's "Your reminders may stop" (Pause app activity is on).
function shouldWarnStop(h) {
  return h.os === 'android' && h.hibernationExempt === false && remindersMatter(h);
}
// A-110 RG-5: days the refresh is late (> 2), else 0 — Today's "Reminders not refreshed for N days".
function staleRefreshDays(h) {
  if (h.os !== 'android' || !remindersMatter(h)) return 0;
  const d = refreshAgeDays(h.lastRefresh, h.nowMs);
  return d != null && d > STALE_DAYS ? d : 0;
}
// A-110 RG-2: the setup step — its rows in the approved order and the "N of 4 ready" count (Samsung
// deep sleep is listed but cannot be read, so it is never counted).
const SETUP_IDS = ['notifications', 'alarms', 'battery', 'hibernation', 'deep_sleep'];
const SETUP_COUNTED = ['notifications', 'alarms', 'battery', 'hibernation'];
function setupSteps(h) {
  const by = Object.fromEntries(reminderChecks(h).map((c) => [c.id, c]));
  const rows = SETUP_IDS.map((id) => by[id]).filter(Boolean);
  const ready = SETUP_COUNTED.filter((id) => by[id] && by[id].state === 'ok').length;
  return { rows, ready, total: SETUP_COUNTED.length, done: ready === SETUP_COUNTED.length };
}

module.exports = { dueInWindow, reminderChecks, scheduleState, blockingCount, shouldWarnToday, shouldWarnLate, shouldWarnStop, staleRefreshDays, refreshAgeDays, setupSteps, IMPORTANCE_NONE };
