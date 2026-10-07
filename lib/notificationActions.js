// Notification action buttons — "Mark as taken", "In 1 hour", "Tomorrow", and the
// food log's "Nothing else today" (closes that local day, FL-18) — handled
// in ONE place at module scope (imported by index.js before the app mounts), so a
// tap works whether the app is open, backgrounded or killed:
//   • Android: a TaskManager task runs this headless when the app isn't in the
//     foreground (expo-notifications runs task-manager tasks for action presses).
//   • iOS: the response listener + a drain of the last response on launch and on
//     every return to the foreground. "Mark as taken" opens the app on iOS (see
//     syncNotificationCategories), so it never silently fails there.
// Every response is handled at most once (persisted key), so the task, the
// listener and the drain can all see it without double-logging a dose.
// Plain taps (no button) stay with App.js, which navigates.
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDatabase, getProtocolById } from './database';
import { recordDoseTaken } from './doseActions';
import { notificationTakeTarget } from './markTaken';
import { needsSiteQuestion, newQuestion, saveQuestion } from './siteQuestion';
import { snoozeNotification, cancelTodaysDoseReminders, syncAllNotifications, closeFoodDay } from './notifications';
import { parseDoseId, foodReminderDay } from './notificationPlan';
import { requestSync, notifyDataChanged } from './sync';
import { Analytics } from './analytics';

import { isWakePayload } from './reminderRefresh';
import { refreshNow } from './backgroundTasks';

export const TASK_NAME = 'dosetrace-notification-actions';
const HANDLED_KEY = 'dosetrace_notif_handled';
const ACTIONS = new Set(['MARK_TAKEN', 'SNOOZE_HOUR', 'SNOOZE_TOMORROW', 'FOOD_DAY_DONE']);

let dbReady = false;
function ensureDb() {
  if (dbReady) return;
  try { initDatabase(); } catch { /* already initialised / best-effort */ }
  dbReady = true;
}

// The Android task hands over a serialized response; the listener a live one.
// Normalise both to { action, id, date, request, data }.
function normalize(resp) {
  if (!resp || typeof resp !== 'object') return null;
  const action = resp.actionIdentifier;
  const notification = resp.notification || {};
  const request = notification.request || {};
  const content = request.content || {};
  let data = content.data || {};
  if (typeof data.dataString === 'string') { try { data = JSON.parse(data.dataString); } catch { /* keep */ } }
  return { action, id: request.identifier || '', date: notification.date || 0, request: { ...request, content: { ...content, data } }, data };
}

async function claim(key) {
  try {
    const raw = await AsyncStorage.getItem(HANDLED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list) && list.includes(key)) return false;
    const next = [...(Array.isArray(list) ? list : []), key].slice(-60);
    await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify(next));
    return true;
  } catch { return true; }
}

async function markTaken(r) {
  const slot = parseDoseId(r.data.origId || r.id) || {};
  const protocolId = r.data.protocolId || slot.protocolId;
  if (!protocolId) return;
  // A SNOOZED copy is taken when tapped, not at the original slot: log it now (a
  // weekly shot snoozed to tomorrow is logged tomorrow, honestly late); the
  // original day keeps whatever it had (e.g. its Missed row).
  const origDay = r.data.dayKey || slot.dayKey;
  const d0 = new Date();
  const pad0 = (n) => (n < 10 ? '0' + n : '' + n);
  const today0 = `${d0.getFullYear()}-${pad0(d0.getMonth() + 1)}-${pad0(d0.getDate())}`;
  // Founder 2026-09-28: inside slot + 12 h the dose goes to the slot it was for,
  // even when a snoozed copy is tapped after midnight; later than that a snoozed
  // copy is logged now (lib/markTaken.js notificationTakeTarget).
  const target = notificationTakeTarget({ dayKey: origDay, slotMs: r.data.slotMs, snoozed: !!(r.data.snoozed && origDay && origDay < today0), nowMs: d0.getTime() });
  // S-25 (founder 2026-10-01): an injectable is written only after the app asks where
  // it was injected — never here. Keep the question (tap time = the dose's time) for
  // Today, which asks it as soon as the app is open (this button opens the app for
  // injectables; a banner delivered before the update is asked on the next open).
  let protocol = null;
  try { protocol = getProtocolById(protocolId); } catch { protocol = null; }
  if (protocol && needsSiteQuestion(protocol.type)) {
    const ti = Number.isFinite(r.data.ti) ? r.data.ti : (slot.ti || 0);
    await saveQuestion(AsyncStorage, newQuestion({
      protocolId, tapMs: d0.getTime(), source: 'notification', ti,
      dayKey: target.atNow ? null : target.dayKey, slotMs: target.atNow ? null : target.slotMs, atNow: !!target.atNow,
    }));
    return 'asked';
  }
  const result = target.atNow
    ? recordDoseTaken(protocolId, { atNow: true })
    : recordDoseTaken(protocolId, { dayKey: target.dayKey, slotMs: target.slotMs });
  if (!result || !result.logId) { await notifyNothingLogged(); return; } // deleted/paused, or already complete
  try {
    const d = new Date();
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    const todayKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (result.dayKey === todayKey && (!origDay || origDay === todayKey)) {
      // Everything up to and including the tapped slot is done for today.
      const ti = Number.isFinite(r.data.ti) ? r.data.ti : (slot.ti || 0);
      await cancelTodaysDoseReminders(protocolId, ti + 1);
    }
  } catch { /* best-effort */ }
  try { Analytics.doseLogged({ name: result.protocol.name, type: result.protocol.type, outcome: 'Taken', source: 'notification' }); } catch { /* ignore */ }
  notifyDataChanged('dose_logs');
  // Sync only in the foreground: a headless Android task can be killed between
  // the cloud insert and the remote_id write-back, and the retry would duplicate
  // the row. Pending rows sync safely on the next launch.
  if (AppState.currentState === 'active') requestSync(); else syncWhenActive = true;
  // The full reminder resync only in the foreground (council 2): a killed headless task would leave
  // protocols cancelled and not rescheduled. Today's slot is already cancelled above.
  if (AppState.currentState === 'active') syncAllNotifications().catch(() => {});
}

// "Nothing else today" on the 20:00 food question: close the day the reminder
// was about (a tap after midnight still closes that evening's day), durably —
// a synced 'day_closed' marker row, so the app never asks about it again.
async function closeFoodDayFromNotification(r) {
  const d = new Date();
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const todayKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayKey = foodReminderDay(r.data.origId || r.id, r.data) || todayKey;
  const ok = await closeFoodDay(dayKey);
  if (!ok) return;
  notifyDataChanged('food_logs');
  // Same rule as a dose: sync only in the foreground (a headless task can be
  // killed mid-push); the marker row syncs on the next launch otherwise.
  if (AppState.currentState === 'active') requestSync(); else syncWhenActive = true;
}

// Android dismisses the banner either way — say so when nothing was logged, so
// a tap on an already-logged or paused dose never looks like it worked.
async function notifyNothingLogged() {
  if (Platform.OS !== 'android' || !N) return;
  try {
    const { translations } = require('../i18n/translations');
    const lang = (await AsyncStorage.getItem('dosetrace_language')) || 'en';
    const tr = (translations[lang] || translations.en);
    await N.scheduleNotificationAsync({
      content: { title: tr.notif_taken_nothing_title || translations.en.notif_taken_nothing_title, body: tr.notif_taken_nothing_body || translations.en.notif_taken_nothing_body, data: { type: 'info' } },
      trigger: null,
    });
  } catch { /* ignore */ }
}

// Taps being handled right now, checked BEFORE any await: the Android task, the
// listener and the launch drain can all deliver the same tap at the same moment.
const inFlight = new Set();
// A dose logged while the app wasn't active syncs as soon as it is.
let syncWhenActive = false;

export async function handleNotificationResponse(resp) {
  const r = normalize(resp);
  if (!r || !ACTIONS.has(r.action)) return false;
  const key = `${r.id}|${r.action}|${r.date}`;
  if (inFlight.has(key)) return true;
  inFlight.add(key);
  try {
    if (!(await claim(key))) return true;
    await runAction(r);
  } finally {
    inFlight.delete(key);
    try { if (N && N.clearLastNotificationResponseAsync) await N.clearLastNotificationResponseAsync(); } catch { /* ignore */ }
  }
  return true;
}

async function runAction(r) {
  ensureDb();
  let keepBanner = false;
  try {
    // An injectable's Taken only keeps a question (S-25): on Android, a banner from before the
    // update (no foreground button) stays up, so the dose is not silently forgotten.
    if (r.action === 'MARK_TAKEN') keepBanner = (await markTaken(r)) === 'asked' && AppState.currentState !== 'active';
    else if (r.action === 'FOOD_DAY_DONE') await closeFoodDayFromNotification(r);
    else await snoozeNotification(r.request, r.action === 'SNOOZE_HOUR' ? 'hour' : 'tomorrow');
    try { Analytics.notifAction({ action: r.action, type: r.data.type || null }); } catch { /* ignore */ }
  } catch { /* never throw out of a notification handler */ }
  // Android only auto-dismisses a notification when its BODY is tapped, not a
  // button — clear it so a handled reminder never lingers looking un-acted.
  if (Platform.OS === 'android' && r.id && N && !keepBanner) { try { await N.dismissNotificationAsync(r.id); } catch { /* ignore */ } }
}

// ── Module-scope registration (runs once, when index.js imports this file) ──
let N = null;
try { N = require('expo-notifications'); } catch { N = null; }

async function drainLast() {
  if (!N || !N.getLastNotificationResponseAsync) return;
  try {
    const last = await N.getLastNotificationResponseAsync();
    if (last) await handleNotificationResponse(last);
  } catch { /* ignore */ }
}

if (N) {
  // expo-notifications runs task-manager tasks for button presses on Android
  // only; iOS never does, so don't register there.
  if (Platform.OS === 'android') try {
    const TaskManager = require('expo-task-manager');
    if (!TaskManager.isTaskDefined(TASK_NAME)) {
      TaskManager.defineTask(TASK_NAME, async ({ data }) => {
        // A-110 RG-6: the server's daily silent wake-up → refresh the reminders, nothing else.
        if (isWakePayload(data)) { await refreshNow().catch(() => {}); return; }
        await handleNotificationResponse(data);
      });
    }
    N.registerTaskAsync(TASK_NAME).catch(() => {});
  } catch { /* task-manager unavailable (e.g. Expo Go) — listener + drain still work */ }
  try { N.addNotificationResponseReceivedListener((resp) => { handleNotificationResponse(resp); }); } catch { /* ignore */ }
  drainLast();
  try {
    AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      drainLast();
      if (syncWhenActive) { syncWhenActive = false; requestSync(); }
    });
  } catch { /* ignore */ }
}
