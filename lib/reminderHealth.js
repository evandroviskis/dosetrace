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
// get no reminder (lib/notifications scheduleDoseReminder), so they are not owed either. A value may
// also be the Set of today's handled slot indexes (A-141 (6): Taken or Skipped, handledSlotIndexes).
function dueInWindow(protocols, now = new Date(), windowDays = 10, takenToday = {}) {
  let n = 0;
  const todayKey = ymd(now);
  for (const p of protocols || []) {
    const times = reminderTimes(p.reminder_time);
    if (!times.length) continue;
    for (const key of dueDateKeys(p, todayKey, windowDays)) {
      for (let ti = 0; ti < times.length; ti++) {
        const t = times[ti];
        const done = takenToday[p.id];
        if (key === todayKey && (done instanceof Set ? done.has(ti) : ti < (done || 0))) continue;
        const at = parseYmd(key);
        at.setHours(t.hour, t.minute, 0, 0);
        if (at > now) n++;
      }
    }
  }
  return n;
}

// DV-043 (DL-46): the protocols that OWE a reminder inside the window → { protocolId: first due ms }.
// Same slots as dueInWindow (future only, today's handled slots left out).
function duePerProtocol(protocols, now = new Date(), windowDays = 10, takenToday = {}) {
  const out = {};
  const todayKey = ymd(now);
  for (const p of protocols || []) {
    const times = reminderTimes(p.reminder_time);
    if (!times.length) continue;
    let first = null;
    for (const key of dueDateKeys(p, todayKey, windowDays)) {
      for (let ti = 0; ti < times.length; ti++) {
        const done = takenToday[p.id];
        if (key === todayKey && (done instanceof Set ? done.has(ti) : ti < (done || 0))) continue;
        const at = parseYmd(key);
        at.setHours(times[ti].hour, times[ti].minute, 0, 0);
        if (at > now && (first == null || at.getTime() < first)) first = at.getTime();
      }
      if (first != null) break; // the earliest day with a future slot is enough
    }
    if (first != null) out[p.id] = first;
  }
  return out;
}

const DAY_MS = 86400000;
const STALE_DAYS = 2; // A-110 RG-4: the refresh runs every 6 h; more than 2 days late means Android holds it

// Whole days since the last SUCCESSFUL background refresh (A-107/A-110; a failed run does not
// count, council 3); null when it never succeeded.
function lastOkAt(lastRefresh) {
  if (!lastRefresh) return null;
  if (Number.isFinite(lastRefresh.lastOkAt)) return lastRefresh.lastOkAt;
  return lastRefresh.ok && Number.isFinite(lastRefresh.at) ? lastRefresh.at : null;
}
// DV-045 (DL-47): a refresh that never succeeded counts from its registration (lib/backgroundTasks
// stores it): registered more than 2 days ago and never run = late, never "pending" forever.
function refreshAgeDays(lastRefresh, nowMs = Date.now(), registeredAt = null) {
  const at = lastOkAt(lastRefresh);
  if (at == null) {
    if (!Number.isFinite(registeredAt)) return null;
    const d = Math.max(0, Math.floor((nowMs - registeredAt) / DAY_MS));
    return d > STALE_DAYS ? d : null; // younger: still pending (Android picks the moment)
  }
  return Math.max(0, Math.floor((nowMs - at) / DAY_MS));
}

// Reminders matter right now: wanted, not paused, and a protocol has a reminder time.
const remindersMatter = ({ remindersOn, silent, activeWithTime }) => !!remindersOn && !silent && activeWithTime > 0;

function reminderChecks({ os, manufacturer, permission, doseChannelImportance, batteryOptimized, exactAlarms, hibernationExempt, lastRefresh, nowMs, remindersOn, silent, activeWithTime, lastScheduledMs, foregroundSyncAt, deepSleepCheckedAt, refreshRegisteredAt }) {
  const checks = [];
  // DV-214: a permission the phone did not give (null) is unknown — open, never a block.
  checks.push({ id: 'notifications', state: permission === 'granted' ? 'ok' : permission == null ? 'open' : 'block', fix: 'notifications' });
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
    const days = refreshAgeDays(lastRefresh, nowMs ?? Date.now(), refreshRegisteredAt);
    // DV-045 split (coordinator 2026-10-20, replaces council 4's "agree" rule for this row): the
    // diagnostic row judges ONLY the background task (every app open resyncs, so a foreground rule
    // here could never show the warning to someone looking at it); the app-open resync is reported
    // separately (foregroundAt). Today's card keeps the foreground rule (staleRefreshDays).
    const late = days != null && days > STALE_DAYS && remindersMatter({ remindersOn: remindersOn !== false, silent, activeWithTime: activeWithTime == null ? 1 : activeWithTime });
    checks.push({ id: 'refresh', state: late ? 'warn' : 'ok', fix: 'battery', pending: days == null, days, at: lastOkAt(lastRefresh), until: Number.isFinite(lastScheduledMs) ? lastScheduledMs : null, foregroundAt: Number.isFinite(foregroundSyncAt) ? foregroundSyncAt : null });
    // SP-10 (founder 2026-10-07 "1 B"): Samsung's deep-sleep list cannot be read; the person confirms
    // "I checked" (saved on this phone) and the row is OK from then on.
    if (/samsung/i.test(String(manufacturer || ''))) checks.push({ id: 'deep_sleep', state: Number.isFinite(deepSleepCheckedAt) ? 'ok' : 'open', fix: 'deepSleep', at: Number.isFinite(deepSleepCheckedAt) ? deepSleepCheckedAt : null });
  }
  return checks;
}

// Nothing scheduled although reminders are on and an active protocol has a time: a block too
// (that is exactly what the founder's phone showed — no reminder for a week).
// syncedOnce === false: the first resync of this session has not finished — an empty queue is not
// evidence yet ('pending', never a block; council 2).
// DV-043 (DL-46): "OK" only when every protocol that owes a reminder inside the window has at least
// one scheduled (presence per protocol, never a count — iPhone's floor of 2 per protocol would give
// false blocks). dueProtocols: { id: first due ms } (duePerProtocol); scheduledProtocolIds: the
// protocols with a scheduled dose reminder; capUntilMs (DV-053): iPhone's 64 cap kept the soonest
// reminders up to there, so a protocol first due after it is planned later, not missing.
function scheduleState({ remindersOn, silent, activeWithTime, scheduledCount, dueInWindow: due, syncedOnce, dueProtocols, scheduledProtocolIds, capUntilMs }) {
  if (silent) return 'silent'; // A-108: paused on purpose (Settings > Silent mode) — never a block
  if (!remindersOn) return 'off';
  if (!activeWithTime) return 'none_needed';
  if (dueProtocols && Array.isArray(scheduledProtocolIds)) {
    const have = new Set(scheduledProtocolIds.map(String));
    const owed = Object.keys(dueProtocols).filter((id) => !(Number.isFinite(capUntilMs) && dueProtocols[id] >= capUntilMs));
    if (!owed.length) return have.size ? 'ok' : 'none_needed';
    if (owed.every((id) => have.has(String(id)))) return 'ok';
    return syncedOnce === false ? 'pending' : 'block';
  }
  if (due === 0 && !scheduledCount) return 'none_needed'; // nothing due inside the window yet
  if (syncedOnce === false && !scheduledCount) return 'pending';
  return scheduledCount > 0 ? 'ok' : 'block';
}

function blockingCount(checks, schedule) {
  return checks.filter((c) => c.state === 'block').length + (schedule === 'block' ? 1 : 0);
}

// Today's alert (RC-6): only when the user wants dose reminders, has a protocol that needs them,
// and something readable blocks them.
// DV-042 (AD-25, DL-45, BR-4): Silent mode is paused on purpose — never "blocked", even when the
// permission is off too (Today shows the Silent card instead).
function shouldWarnToday({ remindersOn, silent, activeWithTime, checks, schedule }) {
  if (!remindersOn || silent || !activeWithTime) return false;
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
  // The app itself refreshed the reminders on open in the last 2 days: nothing is at risk (council 3).
  if (Number.isFinite(h.foregroundSyncAt) && (h.nowMs ?? Date.now()) - h.foregroundSyncAt <= STALE_DAYS * DAY_MS) return 0;
  return backgroundStaleDays(h);
}
// DV-045 split: days the BACKGROUND task is late (> 2), whatever the app did on open — the Reminder
// check row and Settings' "Automatic refresh" line.
function backgroundStaleDays(h) {
  if (h.os !== 'android' || !remindersMatter(h)) return 0;
  const d = refreshAgeDays(h.lastRefresh, h.nowMs ?? Date.now(), h.refreshRegisteredAt);
  return d != null && d > STALE_DAYS ? d : 0;
}
// A-110 RG-2: the setup step — its rows in the approved order and the "N of 4 ready" count (Samsung
// deep sleep is listed but cannot be read, so it is never counted).
// Council 3: the Dose reminders category joins the step (counted with Notifications) when it is
// off, and the count is of the rows actually shown (an unreadable row is left out).
// A-112 SP-2: the one screen also lists the automatic refresh (shown, never counted); the onboarding
// step lists the items only (no protocols yet).
const SETUP_IDS = ['notifications', 'channel', 'alarms', 'battery', 'hibernation', 'refresh', 'deep_sleep'];
// SP-10: Samsung deep sleep counts too (OK once the person confirms it), so Samsung shows 5 items.
const SETUP_COUNTED = ['notifications', 'alarms', 'battery', 'hibernation', 'deep_sleep'];
function setupSteps(h, { withRefresh = false } = {}) {
  const by = Object.fromEntries(reminderChecks(h).map((c) => [c.id, c]));
  const rows = SETUP_IDS.map((id) => by[id]).filter((c) => c && (c.id !== 'channel' || c.state !== 'ok') && (c.id !== 'refresh' || withRefresh));
  const counted = SETUP_COUNTED.filter((id) => by[id] && (by[id].state !== 'open' || id === 'deep_sleep'));
  const channelOk = !by.channel || by.channel.state === 'ok';
  const ready = counted.filter((id) => by[id].state === 'ok' && (id !== 'notifications' || channelOk)).length;
  // DV-044 (DL-46): nothing scheduled although a protocol owes a reminder → never done (only once
  // the phone's queue was read: scheduledCount is a number).
  const scheduleBlocked = Number.isFinite(h.scheduledCount) && scheduleState(h) === 'block';
  return { rows, ready, total: counted.length, scheduleBlocked, done: counted.length > 0 && ready === counted.length && !scheduleBlocked };
}

// A-112 SP-1: the Settings row — 'block' (notifications denied, Dose Reminders category off, or nothing
// scheduled although a protocol has a time: risk color, never "All set"), 'warn' (a readable item is
// not OK: "N of M ready"), or 'ok' (all readable items OK and nothing blocks).
// Council 4: a late automatic refresh is 'warn' too (staleDays), never "All set".
function setupRowState(h) {
  const st = setupSteps(h);
  const staleDays = backgroundStaleDays(h); // DV-045 split: Settings is the diagnostic line
  if (blockingCount(reminderChecks(h), scheduleState(h)) > 0) return { kind: 'block', ready: st.ready, total: st.total, staleDays };
  const ready = st.done || st.total === 0;
  return { kind: ready && !staleDays ? 'ok' : 'warn', ready: st.ready, total: st.total, staleDays };
}

// DV-098 (DL-49; AD-79 item 5 — the rows show only after their picture is approved): the Android
// channel of every other reminder kind the user has switched on. The 20:00 food question, the weekly
// check-in and the weigh-in use 'checkin-reminders'; vial low / expiry use 'vial-alerts'. Off
// (importance 0) = block; unreadable (null) = no row. Not part of reminderChecks yet.
function kindChannelChecks({ os, checkinChannelImportance, vialChannelImportance, foodOn, checkinOn, vialOn }) {
  if (os !== 'android') return [];
  const rows = [];
  if ((foodOn || checkinOn) && checkinChannelImportance != null) rows.push({ id: 'channel_checkin', channelId: 'checkin-reminders', state: checkinChannelImportance === IMPORTANCE_NONE ? 'block' : 'ok', fix: 'channel_checkin' });
  if (vialOn && vialChannelImportance != null) rows.push({ id: 'channel_vial', channelId: 'vial-alerts', state: vialChannelImportance === IMPORTANCE_NONE ? 'block' : 'ok', fix: 'channel_vial' });
  return rows;
}

// A-112 SP-6 (founder: "até todos os campos OK"): Battery optimized joins Today's reminder warnings.
function shouldWarnBattery(h) {
  return h.os === 'android' && h.batteryOptimized === true && remindersMatter(h);
}

// Founder 2026-10-07 (council 3 decision 2): Silent mode is on and a protocol has a reminder time —
// Today says so (both platforms), since nothing else will arrive.
function shouldWarnSilent(h) { return !!h.silent && h.activeWithTime > 0; }
// Decision 3: the reminder warnings showing at once, in order; two or more become one card.
function reminderWarnings({ blocked, late, stop, stale, battery }) {
  return [blocked && 'blocked', late && 'late', battery && 'battery', stop && 'stop', stale > 0 && 'stale'].filter(Boolean);
}

// A-110 RG-7: a row carries the name the phone shows on the screen its button opens. Samsung calls
// "Pause app activity if unused" "Manage app if unused" (read from the founder's Fold 2026-10-07).
// Returns the title key that replaces the row's default, or null to keep it.
function rowTitleKey(id, manufacturer) {
  if (id === 'hibernation') return /samsung/i.test(String(manufacturer || '')) ? 'rc_hibernation_samsung' : 'rc_hibernation';
  return null;
}

module.exports = { backgroundStaleDays, duePerProtocol, kindChannelChecks, setupRowState, shouldWarnBattery, rowTitleKey, shouldWarnSilent, reminderWarnings, dueInWindow, reminderChecks, scheduleState, blockingCount, shouldWarnToday, shouldWarnLate, shouldWarnStop, staleRefreshDays, refreshAgeDays, setupSteps, IMPORTANCE_NONE };
