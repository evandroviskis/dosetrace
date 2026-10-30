// A-107 (founder 2026-10-07, option B): the Android background task that refreshes the reminders
// scheduled on this phone every few hours, so they keep coming until the user deletes the protocol
// even when the app is never opened. The rules live in lib/reminderRefresh.js (tested); this file
// only wires the real dependencies.
//
// ANDROID ONLY (AC11): iOS keeps no background mode (plugins/withoutIosBackgroundFetch.js), and
// expo-background-task's iOS side would register its BGTask identifier at launch — without the
// Info.plist entry that is a crash on a real iPhone. So the package is excluded from iOS autolinking
// (package.json expo.autolinking.ios.exclude), its plugin is not applied, and it is required lazily
// behind an Android check — never imported at the top of a file.
import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { runReminderRefresh, LAST_RUN_KEY } from './reminderRefresh';
import { syncAllNotifications, enterBackgroundRun, leaveBackgroundRun } from './notifications';
import { readStoredUser } from './supabase';
import { initDatabase } from './database';
import { WIPE_PENDING_KEY } from './signedOut';
import { planRefreshRegistration } from './headlessRefreshPlan';

export const REFRESH_TASK = 'dosetrace-reminder-refresh';
// Every 6 hours at most (Android picks the moment; WorkManager's floor is 15 min). A missed run
// costs nothing: the next one schedules the same reminders (fixed ids).
export const REFRESH_MINUTES = 6 * 60;

let dbReady = false;
// → true when the database is open (DV-046: a run whose database did not open is recorded as failed).
function ensureDb() {
  if (dbReady) return true;
  // Marked ready only when it opened (council 3): a failed open is tried again on the next run.
  try { initDatabase(); dbReady = true; } catch { /* not ready: the run's reads fail and cancel nothing */ }
  return dbReady;
}

// One run. With the app open in the foreground it is just the normal resync (no background mode).
export async function refreshNow() {
  const foreground = AppState.currentState === 'active';
  let token; // this run's background-mode token (lib/backgroundMode, re-verification B)
  return runReminderRefresh({
    now: () => Date.now(),
    isWipePending: () => AsyncStorage.getItem(WIPE_PENDING_KEY),
    ensureDb,
    readStoredUser,
    // A-119 OD-16: replaced → verdict stored, reminders cancelled (lib/deviceRuntime).
    deviceCheck: () => require('./deviceRuntime').backgroundDeviceCheck(),
    setBackgroundRun: (v) => { if (foreground) return; if (v) token = enterBackgroundRun(); else leaveBackgroundRun(token); },
    syncAllNotifications,
    countScheduled: async () => (await require('expo-notifications').getAllScheduledNotificationsAsync()).length,
    saveLastRun,
  });
}

// Records the run, keeping the last SUCCESSFUL one (lastOkAt) across failed runs — the Reminder
// check and Today judge freshness by success (council 3).
export async function saveLastRun(r) {
  let prev = null;
  try { const raw = await AsyncStorage.getItem(LAST_RUN_KEY); prev = raw ? JSON.parse(raw) : null; } catch { prev = null; }
  const lastOkAt = r.ok ? r.at : (prev && (prev.lastOkAt ?? (prev.ok ? prev.at : null))) ?? null;
  // DV-046: the count of what the run left scheduled is kept (device proof, the Reminder check).
  await AsyncStorage.setItem(LAST_RUN_KEY, JSON.stringify({ at: r.at, ok: r.ok, reason: r.reason, scheduled: r.scheduled ?? null, lastOkAt }));
}

// DV-045 (DL-47): when the refresh was first registered on this phone, so a refresh that never ran
// is "late" 2 days after it, not "pending" forever. Kept from the first registration (registering
// again at every app open must not move it).
export const REGISTERED_AT_KEY = 'dosetrace_refresh_registered_at';
export async function markRegistered(storage = AsyncStorage, nowMs = Date.now()) {
  try {
    if (await storage.getItem(REGISTERED_AT_KEY)) return false;
    await storage.setItem(REGISTERED_AT_KEY, String(nowMs));
    return true;
  } catch { return false; }
}

// Called at module scope from index.js, so the task exists when Android starts the app headless.
export function defineReminderRefreshTask() {
  if (Platform.OS !== 'android') return;
  try {
    const TaskManager = require('expo-task-manager');
    const BackgroundTask = require('expo-background-task');
    if (!TaskManager.isTaskDefined(REFRESH_TASK)) {
      TaskManager.defineTask(REFRESH_TASK, async () => {
        try {
          const r = await refreshNow();
          return r && r.ok ? BackgroundTask.BackgroundTaskResult.Success : BackgroundTask.BackgroundTaskResult.Failed;
        } catch {
          return BackgroundTask.BackgroundTaskResult.Failed;
        }
      });
    }
  } catch { /* module unavailable (Expo Go): the app-open resync still runs */ }
}

// Called at module scope from index.js (Android): the refresh as a React Native headless JS task,
// so JS timers run during it even while the app is alive in the background (A-197). The key is
// HeadlessRefreshWorker.TASK_KEY (modules/dt-exact-alarm).
export function registerHeadlessReminderRefresh() {
  if (Platform.OS !== 'android') return;
  try {
    const { AppRegistry } = require('react-native');
    const { headlessRefreshDone } = require('../modules/dt-exact-alarm');
    AppRegistry.registerHeadlessTask('DoseTraceReminderRefresh', () => async () => {
      try { await refreshNow(); } finally { headlessRefreshDone(); }
    });
  } catch { /* already registered */ }
}

// Called from App.js once the app is up (Android). Registering again is harmless.
export async function registerReminderRefresh() {
  const { hasHeadlessRefresh, scheduleHeadlessRefresh } = require('../modules/dt-exact-alarm');
  const android = Platform.OS === 'android';
  const hasHeadless = hasHeadlessRefresh();
  const scheduled = android && hasHeadless ? scheduleHeadlessRefresh(REFRESH_MINUTES) : false;
  const plan = planRefreshRegistration({ android, hasHeadless, scheduled });
  try {
    if (scheduled) await markRegistered();
    if (plan.unregisterExpo || plan.expo) {
      const BackgroundTask = require('expo-background-task');
      if (plan.unregisterExpo) {
        const TaskManager = require('expo-task-manager');
        if (await TaskManager.isTaskRegisteredAsync(REFRESH_TASK)) await BackgroundTask.unregisterTaskAsync(REFRESH_TASK);
      } else {
        await BackgroundTask.registerTaskAsync(REFRESH_TASK, { minimumInterval: REFRESH_MINUTES });
        await markRegistered();
      }
    }
  } catch { /* ignore */ }
}

// The last run ({ at, ok, reason, scheduled }) for the Reminder check (A-110) and device proof.
export async function readLastRefresh() {
  try { const raw = await AsyncStorage.getItem(LAST_RUN_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
