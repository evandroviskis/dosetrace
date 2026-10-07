import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedUser, setStoredSessionOnly } from './supabase';
import { supplyState } from './supplyLow';
import { getActiveProtocols, getActiveVials, getTodayLogs, getFoodLogsSince, getProtocolById, getLogsSince, insertFoodDayMarker } from './database';
import { translations } from '../i18n/translations';
import { dueInWindow } from './reminderHealth';
import { androidChannelRequest, doseBudget, vialExpiryPlan, vialLowToSend, ymd, parseYmd, addDays, dueDateKeys, morningSummaryPlan, foodNudgeDays, remindersForAccess, snoozeFireAt, snoozeId, parseDoseId, pruneSnoozes, reminderTimes, orphanDoseIds } from './notificationPlan';
import { closedDays } from './nutrition';
import { needsSiteQuestion } from './siteQuestion';
import { decimalText } from './localeFormat';
import { pluralKey } from './plural';
import { canScheduleExactAlarms, isExemptFromHibernation } from '../modules/dt-exact-alarm';

// Notifications are scheduled outside React, so there's no useLanguage() here.
// Read the persisted language and return a t() that mirrors LanguageContext
// (fall back to English, then the key itself).
async function getT() {
  let lang = 'en';
  try { lang = (await AsyncStorage.getItem('dosetrace_language')) || 'en'; } catch { /* default en */ }
  const t = (key) => (translations[lang] && translations[lang][key]) || (translations.en && translations.en[key]) || key;
  t.language = lang; // the dose in a reminder uses its decimal ("0,5 mg" in Portuguese)
  return t;
}

// Fill {placeholders} in a localized template and tidy any gaps left by empty
// values (e.g. a dose with no unit) — mirrors how the strings read in-app.
function fill(str, vars) {
  return String(str)
    .replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Lazy-loaded reference — avoid calling expo-notifications at module scope ──
let Notifications = null;

function getNotifications() {
  if (!Notifications) {
    try {
      Notifications = require('expo-notifications');
    } catch {
      return null;
    }
  }
  return Notifications;
}

// Every scheduled notification goes through here: on Android the channel must sit in the trigger
// (lib/notificationPlan androidChannelRequest; council 2, 2026-10-05).
// A-108: Silent mode ("Pause all notifications", Settings) — nothing is scheduled or shown while
// it is on; the user's own test reminder (Check reminders) still goes through. Read once from the
// account and re-read at every full resync (Settings resyncs after the switch).
// A-107: background mode for the daily refresh — the session is read as stored (no network),
// and nothing is sent immediately (a "vial running low" alert waits for the app).
let _background = false;
const FG_SYNC_KEY = 'dosetrace_fg_sync_at';
export function setBackgroundRun(v) { _background = !!v; setStoredSessionOnly(v); }

let _silent = null;
function resetSilent() { _silent = null; }
async function silentNow() {
  if (_silent === null) {
    try { const u = await getCachedUser(); _silent = u?.user_metadata?.silent_mode === true; } catch { _silent = false; }
  }
  return _silent;
}
async function scheduleReq(N, req) {
  if ((await silentNow()) && !(req && req.content && req.content.data && req.content.data.type === 'reminder_test')) return null;
  return N.scheduleNotificationAsync(androidChannelRequest(req, Platform.OS));
}

// ── Safe init — called once from App.js AFTER the app has mounted ──
let _initialized = false;
export function initNotifications() {
  if (_initialized) return;
  _initialized = true;
  const N = getNotifications();
  if (!N) return;
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      N.setNotificationChannelAsync('dose-reminders', {
        name: 'Dose Reminders',
        importance: N.AndroidImportance?.MAX ?? 4,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#185FA5',
      }).catch(() => {});
      N.setNotificationChannelAsync('vial-alerts', {
        name: 'Vial Alerts',
        importance: N.AndroidImportance?.HIGH ?? 3,
      }).catch(() => {});
      N.setNotificationChannelAsync('checkin-reminders', {
        name: 'Check-in Reminders',
        importance: N.AndroidImportance?.DEFAULT ?? 2,
      }).catch(() => {});
    }
  } catch {
    // native module not ready — silently ignore
  }
}

// ── Action buttons ───────────────────────────────────────────────
// Register the "Mark complete" button shown on dose reminders. On Android it logs the dose
// in the background (opensAppToForeground false); on iOS it opens the app (true, below), which
// logs it on Today (lib/notificationActions handles MARK_TAKEN; App.js only navigates).
// Re-registered on every sync so the button title follows the app language.
export async function syncNotificationCategories() {
  const N = getNotifications();
  if (!N) return;
  try {
    const t = await getT();
    // Mark as taken: Android logs it in a background task (lib/notificationActions);
    // iOS doesn't run JS reliably for a killed app, so there it opens the app,
    // which logs it and shows it on Today — never a silent no-op.
    const TAKEN = { identifier: 'MARK_TAKEN', buttonTitle: t('notif_action_complete'), options: { opensAppToForeground: Platform.OS === 'ios' } };
    // Snooze also opens the app on iOS: without it iOS can suspend the app before
    // the snooze is saved, and the reminder would come back late or never.
    const fg = Platform.OS === 'ios';
    const HOUR = { identifier: 'SNOOZE_HOUR', buttonTitle: t('notif_action_snooze_hour'), options: { opensAppToForeground: fg } };
    const TOMORROW = { identifier: 'SNOOZE_TOMORROW', buttonTitle: t('notif_action_snooze_tomorrow'), options: { opensAppToForeground: fg } };
    // Daily doses: taken / in 1 hour ("tomorrow" would only duplicate tomorrow's
    // own reminder). Less-than-daily doses also get tomorrow. A snoozed copy can
    // be marked taken but not snoozed again. Morning summary: informational, none.
    await N.setNotificationCategoryAsync('dose-reminder', [TAKEN, HOUR]);
    await N.setNotificationCategoryAsync('dose-reminder-long', [TAKEN, HOUR, TOMORROW]);
    await N.setNotificationCategoryAsync('dose-snoozed', [TAKEN]);
    // S-25: an injectable's Taken button OPENS the app on both platforms — the dose is
    // written only after the app asks where it was injected (never in the background).
    const TAKEN_OPEN = { identifier: 'MARK_TAKEN', buttonTitle: t('notif_action_complete'), options: { opensAppToForeground: true } };
    await N.setNotificationCategoryAsync('dose-reminder-inj', [TAKEN_OPEN, HOUR]);
    await N.setNotificationCategoryAsync('dose-reminder-long-inj', [TAKEN_OPEN, HOUR, TOMORROW]);
    await N.setNotificationCategoryAsync('dose-snoozed-inj', [TAKEN_OPEN]);
    await N.setNotificationCategoryAsync('general-reminder', [HOUR, TOMORROW]);
    // 20:00 "anything else today?" (FL-18). "Nothing else today" closes the day
    // without opening the app on Android (background task, like Mark as taken);
    // on iOS it opens the app for the same reason Mark as taken does — JS isn't
    // run reliably for a killed app there, and a silent no-op would re-ask.
    // "Log it" always opens the app to the food log.
    const FOOD_DONE = { identifier: 'FOOD_DAY_DONE', buttonTitle: t('notif_food_action_done'), options: { opensAppToForeground: Platform.OS === 'ios' } };
    const FOOD_LOG = { identifier: 'FOOD_LOG_IT', buttonTitle: t('notif_food_action_log'), options: { opensAppToForeground: true } };
    await N.setNotificationCategoryAsync('food-evening', [FOOD_LOG, FOOD_DONE]);
  } catch { /* ignore */ }
}

// ── Permissions ──────────────────────────────────────────────────
export async function requestNotificationPermissions() {
  const N = getNotifications();
  if (!N) return false;
  try {
    const { status: existing } = await N.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await N.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// ── Time helpers ─────────────────────────────────────────────────
// One parser for the app and the server push sender (lib/notificationPlan.js reminderTimes).
function parseReminderTimes(reminderTime) {
  return reminderTimes(reminderTime).map((s) => ({ hours: s.hour, minutes: s.minute }));
}

// Dose reminders are one-shot dated notifications (a day's occurrence is cancelled when the dose is
// logged; per-day reminders never fire on days a dose isn't due). The rolling window is topped up
// whenever the app opens (App.js → syncAllNotifications). How many, and how far ahead, depends on
// the platform: lib/notificationPlan doseBudget (RC-7 — iPhone's 64 cap never applies to Android).

// Morning summary: how many days ahead to schedule, and how far to look for the
// "next dose is in N days" heads-up on quiet days.
const SUMMARY_WINDOW_DAYS = 7;
const SUMMARY_HORIZON_DAYS = 45;
const MORNING_HOUR = 7;
const MORNING_MIN = 0;

// Follow-up delays in minutes for persistent reminders
const FOLLOWUP_DELAYS = [5, 10];

// Join protocol names for a summary body, capping the list so it stays short.
function formatList(names) {
  const clean = (names || []).filter(Boolean);
  if (clean.length <= 3) return clean.join(', ');
  return clean.slice(0, 3).join(', ') + ' +' + (clean.length - 3);
}

// ── Check persistent reminders preference ───────────────────────
async function isPersistentEnabled() {
  try {
    const user = await getCachedUser();
    return user?.user_metadata?.persistent_reminders === true;
  } catch { return false; }
}

// Lock-screen privacy: compound names show in notifications unless the user
// turned them off in Settings (user_metadata.notif_show_names === false).
async function showNamesInNotifications() {
  try {
    const user = await getCachedUser();
    return user?.user_metadata?.notif_show_names !== false;
  } catch { return true; }
}

// ── DOSE REMINDERS ───────────────────────────────────────────────
// maxNotifs caps the TOTAL notifications (mains + follow-ups) this protocol may
// schedule. syncAllDoseReminders passes a per-protocol share (doseBudget);
// standalone callers (create/edit/restore) use the per-protocol default.
// RC-7: the budget and window follow the platform (lib/notificationPlan doseBudget); a standalone
// call (create / edit / restore) gets one protocol's full share.
export async function scheduleDoseReminder(protocol, maxNotifs, windowDays) {
  // A standalone call (create / edit / restore) shares the budget with the other active protocols
  // (council 2: 60 each regardless of their number could pass Android's 500 alarms per app).
  let activeCount = 1;
  try { activeCount = Math.max(1, (getActiveProtocols(protocol.user_id) || []).length); } catch { /* one */ }
  const one = doseBudget({ os: Platform.OS, protocolCount: activeCount });
  if (maxNotifs == null) maxNotifs = one.perProtocol;
  if (windowDays == null) windowDays = one.windowDays;
  const N = getNotifications();
  if (!N) return;
  try {
    // A-107 AC2: never cancel first. Each wanted reminder is scheduled with its fixed id (an
    // existing one is replaced); only ids no longer wanted are cancelled at the very end, so a run
    // killed partway (the daily background refresh) leaves the previous reminders in place.
    const wanted = new Set();
    const t = await getT();
    const times = parseReminderTimes(protocol.reminder_time);
    const persistent = await isPersistentEnabled();
    const doseVars = { dose: protocol.dose ? decimalText(protocol.dose, t.language) : '', unit: protocol.dose_unit || '' };
    const doseBody = fill(t('notif_dose_body'), doseVars);
    const followupBody = fill(t('notif_followup_body'), doseVars);

    const todayKey = ymd(new Date());
    const dueDays = dueDateKeys(protocol, todayKey, windowDays);

    // How many of today's dose slots are already logged as Taken — skip those,
    // so re-syncing after a dose is logged never re-arms today's reminder.
    let takenToday = 0;
    try {
      const logs = getTodayLogs(protocol.user_id) || [];
      takenToday = logs.filter((l) => l.protocol_id === protocol.id && l.outcome === 'Taken').length;
    } catch { /* best-effort; DB may be unavailable off the main path */ }

    const now = new Date();
    let scheduled = 0; // total notifications (mains + follow-ups) for this protocol
    const showNames = await showNamesInNotifications();
    const title = showNames ? protocol.name : t('notif_dose_title_private');
    const inj = needsSiteQuestion(protocol.type); // S-25: injectables open the app on Taken
    const category = ((protocol.interval_days || 1) > 1 ? 'dose-reminder-long' : 'dose-reminder') + (inj ? '-inj' : '');

    slots: for (const dayKey of dueDays) {
      const isToday = dayKey === todayKey;
      for (let ti = 0; ti < times.length; ti++) {
        if (scheduled >= maxNotifs) break slots;
        // On today, the earliest `takenToday` slots are already done.
        if (isToday && ti < takenToday) continue;

        const { hours, minutes } = times[ti];
        const fireDate = parseYmd(dayKey);
        fireDate.setHours(hours, minutes, 0, 0);
        // A slot that already fired today is never re-armed, but its +5/+10 repeats still come
        // (A-107 AC3: a resync right after a slot used to drop them).
        const past = fireDate <= now;
        if (!past) {
        wanted.add(`dose-${protocol.id}-${dayKey}-t${ti}`);
        await scheduleReq(N, {
          identifier: `dose-${protocol.id}-${dayKey}-t${ti}`,
          content: {
            title,
            body: doseBody,
            // dayKey/ti/slotMs: a tap on this banner logs THIS slot's day, even
            // if it's tapped after midnight (lib/doseActions recordDoseTaken).
            data: { type: 'dose_reminder', protocolId: protocol.id, dayKey, ti, slotMs: fireDate.getTime(), inj },
            categoryIdentifier: category,
            ...(Platform.OS === 'android' && { channelId: 'dose-reminders' }),
          },
          trigger: { type: 'date', date: fireDate.getTime() },
        }).catch(() => {});
        scheduled++;
        }

        // Schedule follow-ups if persistent (each counts against the budget)
        if (persistent) {
          for (let fi = 0; fi < FOLLOWUP_DELAYS.length; fi++) {
            if (scheduled >= maxNotifs) break;
            const followDate = new Date(fireDate.getTime() + FOLLOWUP_DELAYS[fi] * 60 * 1000);
            if (followDate <= now) continue;
            wanted.add(`dose-${protocol.id}-${dayKey}-t${ti}-f${fi}`);
            await scheduleReq(N, {
              identifier: `dose-${protocol.id}-${dayKey}-t${ti}-f${fi}`,
              content: {
                title,
                body: followupBody,
                data: { type: 'dose_followup', protocolId: protocol.id, dayKey, ti, slotMs: fireDate.getTime(), inj },
                categoryIdentifier: category,
                ...(Platform.OS === 'android' && { channelId: 'dose-reminders' }),
              },
              trigger: { type: 'date', date: followDate.getTime() },
            }).catch(() => {});
            scheduled++;
          }
        }
      }
    }
    // Only now: cancel this protocol's reminders that are no longer wanted (time changed, a
    // taken slot, the window moved on).
    const prefix = `dose-${protocol.id}-`;
    for (const n of await N.getAllScheduledNotificationsAsync()) {
      if (n.identifier.startsWith(prefix) && !wanted.has(n.identifier)) {
        await N.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
      }
    }
  } catch {
    // silently fail — and nothing was cancelled
  }
}

// Remove already-DELIVERED dose reminders for a protocol from the notification
// center. Cancelling a *scheduled* notification never clears one that has
// already fired, so a stale banner ("take your 10 AM dose") keeps sitting on the
// lock screen after you reschedule the time or log the dose. `maxTi`, when given,
// only dismisses today's slots with index < maxTi (mirrors the taken-count
// logic); omitted, it dismisses every delivered reminder for the protocol.
// Call ONLY on an explicit user action (edit the time, log the dose, delete the
// protocol) — never from a routine resync, or a legitimate un-acted banner would
// be wiped without being re-created (past-time slots aren't rescheduled).
export async function dismissDeliveredDoseReminders(protocolId, maxTi) {
  const N = getNotifications();
  if (!N || !N.getPresentedNotificationsAsync) return;
  try {
    const presented = await N.getPresentedNotificationsAsync();
    const todayPrefix = `dose-${protocolId}-${ymd(new Date())}-t`;
    const anyPrefix = `dose-${protocolId}-`;
    for (const n of presented) {
      const id = n.request?.identifier || '';
      if (maxTi == null) {
        if (id.startsWith(anyPrefix)) await N.dismissNotificationAsync(id).catch(() => {});
      } else if (id.startsWith(todayPrefix)) {
        const ti = parseInt(id.slice(todayPrefix.length), 10); // "{ti}" or "{ti}-f{fi}"
        if (Number.isFinite(ti) && ti < maxTi) await N.dismissNotificationAsync(id).catch(() => {});
      }
    }
  } catch { /* best-effort */ }
}

// Cancel today's dose reminders for a protocol once doses are logged as taken.
// Identifiers are date-encoded (`dose-{id}-{YYYY-MM-DD}-t{ti}[-f{fi}]`), so we
// cancel today's earliest `takenCount` slots plus their follow-ups. Future days
// and other protocols are untouched — the reminder simply won't fire today.
export async function cancelTodaysDoseReminders(protocolId, takenCount) {
  const N = getNotifications();
  if (!N) return;
  try {
    const prefix = `dose-${protocolId}-${ymd(new Date())}-t`;
    const all = await N.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (!n.identifier.startsWith(prefix)) continue;
      const ti = parseInt(n.identifier.slice(prefix.length), 10); // "{ti}" or "{ti}-f{fi}"
      if (Number.isFinite(ti) && ti < takenCount) {
        await N.cancelScheduledNotificationAsync(n.identifier);
      }
    }
    // Also clear any banner for those slots that already fired this morning.
    await dismissDeliveredDoseReminders(protocolId, takenCount);
    // …and any snoozed copy of a slot that's now taken.
    await restoreSnoozes();
  } catch { /* ignore */ }
}

// Cancel every locally-scheduled dose reminder (all protocols). Used when Android
// switches to server push, so pre-existing local one-shot alarms don't double up
// with the server's pushes.
// A-109: a reminder kind switched off in Settings cancels what is already scheduled (it used to
// return first, so up to 21 days of reminders kept firing after the switch was off).
async function cancelByPrefix(N, prefix, exactId) {
  try {
    const all = await N.getAllScheduledNotificationsAsync();
    for (const n of all.filter((x) => x.identifier.startsWith(prefix) || x.identifier === exactId)) {
      await N.cancelScheduledNotificationAsync(n.identifier);
    }
  } catch { /* ignore */ }
}

// A-107 AC2: the non-destructive reschedule. Each sync schedules what it wants first (a fixed id
// replaces the existing one), then cancels only the ids of its kind that are no longer wanted —
// so a run Android kills partway never leaves fewer reminders than before.
async function cancelUnwanted(N, match, wanted) {
  try {
    for (const n of await N.getAllScheduledNotificationsAsync()) {
      if (match(n.identifier) && !wanted.has(n.identifier)) await N.cancelScheduledNotificationAsync(n.identifier);
    }
  } catch { /* ignore */ }
}

export async function cancelAllDoseReminders() {
  const N = getNotifications();
  if (!N) return;
  try {
    const all = await N.getAllScheduledNotificationsAsync();
    for (const n of all.filter(x => x.identifier.startsWith('dose-'))) {
      await N.cancelScheduledNotificationAsync(n.identifier);
    }
  } catch { /* ignore */ }
}

export async function cancelDoseReminder(protocolId) {
  const N = getNotifications();
  if (!N) return;
  try {
    const all = await N.getAllScheduledNotificationsAsync();
    const toCancel = all.filter(n => n.identifier.startsWith(`dose-${protocolId}-`));
    for (const n of toCancel) {
      await N.cancelScheduledNotificationAsync(n.identifier);
    }
    // Protocol deleted or paused (not a routine resync): its snoozed copies go too.
    try {
      const p = getProtocolById(protocolId);
      if (!p || p.active === 0 || p.deleted_at) await restoreSnoozes();
    } catch { /* best-effort */ }
    // NOTE: delivered banners are intentionally NOT dismissed here — this runs on
    // every routine resync too, and wiping an un-acted banner (whose past-time
    // slot won't be re-created) would lose a legitimate reminder. The edit and
    // delete paths call dismissDeliveredDoseReminders() explicitly instead.
  } catch {
    // ignore
  }
}

export async function syncAllDoseReminders() {
  try {
    // Android delegates dose reminders to server push (battery saver drops local
    // scheduled alarms); the server sends them, so skip local scheduling to avoid
    // doubles. iOS keeps local scheduling.
    if (usesServerPush()) { await cancelAllDoseReminders(); return; }
    const user = await getCachedUser();
    if (!user) return;
    // Preference source of truth is user_metadata (set by Settings). The old
    // notification_preferences table never existed, so this gate used to no-op.
    if (user.user_metadata?.dose_reminders === false) { await cancelAllDoseReminders(); return; } // A-109

    const protocols = getActiveProtocols(user.id);
    // Reminders of a protocol no longer active here (ended or deleted on another device and
    // pulled) are cancelled on every resync, also when nothing is active (A-83 journey F7).
    try {
      const N = getNotifications();
      const all = N ? await N.getAllScheduledNotificationsAsync() : [];
      for (const id of orphanDoseIds(all.map((n) => n.identifier), (protocols || []).map((p) => p.id))) {
        await N.cancelScheduledNotificationAsync(id);
      }
    } catch { /* best-effort */ }
    if (!protocols || protocols.length === 0) return;

    // Share the dose budget across protocols (RC-7, lib/notificationPlan doseBudget): iPhone stays
    // under its 64-pending cap with the vial-expiry alerts counted in; Android gets far more.
    let expiryAlerts = 0;
    try { expiryAlerts = (getActiveVials(user.id) || []).length; } catch { /* best-effort */ }
    const b = doseBudget({ os: Platform.OS, protocolCount: protocols.length, expiryAlerts });
    for (const p of protocols) {
      await scheduleDoseReminder(p, b.perProtocol, b.windowDays);
    }
  } catch {
    // ignore
  }
}

// ── VIAL ALERTS ──────────────────────────────────────────────────
// What "Vial running low" was already sent for (m10): per device, a reminder setting, not user data.
const VIAL_LOW_SENT_KEY = 'dosetrace_vial_low_sent';

export async function syncVialAlerts() {
  const N = getNotifications();
  if (!N) return;
  try {
    const user = await getCachedUser();
    if (!user) return;
    if (user.user_metadata?.vial_alerts === false) { await cancelByPrefix(N, 'vial-'); return; } // A-109

    const t = await getT();

    const wanted = new Set(); // A-107 AC2: cancel only what is no longer wanted, at the end
    const vials = getActiveVials(user.id);
    if (!vials) return; // unknown (database not ready): keep what is scheduled
    // A snoozed vial alert stays quiet until its snoozed copy fires (this sync
    // re-fires vial alerts immediately on every run otherwise).
    const snoozedIds = new Set((await loadSnoozes()).filter((r) => r.fireAt > Date.now()).map((r) => r.origId));
    const showNames = await showNamesInNotifications();

    // Build protocol name lookup from local DB
    const protocols = getActiveProtocols(user.id) || [];
    const protocolNames = {};
    const protocolById = {};
    protocols.forEach(p => { protocolNames[p.id] = p.name; protocolById[p.id] = p; });

    // The ONE supply-low rule (lib/supplyLow.js) — same as the Today alert and the
    // Protocols badge, older vials without a stored count included (S-05).
    const states = vials.map((v) => ({ v, ...supplyState(v, protocolById[v.protocol_id]) }));
    // A-107 AC7: the immediate "running low" alert is sent only with the app running (never at 03:00
    // from the background refresh); it stays owed until then.
    if (!_background) {
      // Once per vial (m10): only vials not announced before are sent now; the rest stay quiet.
      let sentBefore = {};
      try { const raw = await AsyncStorage.getItem(VIAL_LOW_SENT_KEY); sentBefore = raw ? JSON.parse(raw) || {} : {}; } catch { sentBefore = {}; }
      const plan = vialLowToSend({ lowIds: states.filter((x) => x.low).map((x) => x.v.id), activeIds: vials.map((v) => v.id), sent: sentBefore });
      const toSend = new Set(plan.send);
      try { await AsyncStorage.setItem(VIAL_LOW_SENT_KEY, JSON.stringify(plan.sent)); } catch { /* ignore */ }

      for (const { v, remaining, low } of states) {
        if (low) {
          if (!toSend.has(v.id)) continue;
          if (snoozedIds.has(`vial-low-${v.id}`)) continue;
          const vialName = (showNames && protocolNames[v.protocol_id]) || t('notif_vial_fallback');
          const vialBody = fill(
            t(remaining === 1 ? 'notif_vial_body_one' : 'notif_vial_body_other'),
            { name: vialName, n: remaining }
          );
          wanted.add(`vial-low-${v.id}`);
          await scheduleReq(N, {
            identifier: `vial-low-${v.id}`,
            content: {
              title: t('notif_vial_title'),
              body: vialBody,
              data: { type: 'vial_low', vialId: v.id, protocolId: v.protocol_id, remaining }, // A-44: the tap opens this protocol
              categoryIdentifier: 'general-reminder',
              ...(Platform.OS === 'android' && { channelId: 'vial-alerts' }),
            },
            trigger: null, // fire immediately
          }).catch(() => {});
        }
      }
    }
    // A-45: the vial EXPIRY reminders behind the same switch (it is called "Vial expiry alerts"):
    // the next one per vial (7 days before, then the expiry day), with Today's own words. Every
    // 'vial-' notification was cancelled above, so a finished, discarded or edited vial
    // reschedules here on the next sync.
    for (const e of vialExpiryPlan({ vials, protocolsById: protocolById, nowMs: Date.now() })) {
      const p = protocolById[e.protocolId];
      const name = (showNames && p && (p.compound_id ? t(p.compound_id) : p.name)) || t('notif_vial_fallback');
      const body = e.daysLeft <= 0
        ? t('today_alert_vial_expired_one').replace('{name}', name)
        : t('today_alert_vial_expiry_one').replace('{name}', name).replace('{n}', String(e.daysLeft));
      wanted.add(e.id);
      await scheduleReq(N, {
        identifier: e.id,
        content: {
          title: t('today_alert_vial_title'),
          body,
          data: { type: 'vial_expiry', vialId: e.vialId, protocolId: e.protocolId, daysLeft: e.daysLeft },
          categoryIdentifier: 'general-reminder',
          ...(Platform.OS === 'android' && { channelId: 'vial-alerts' }),
        },
        trigger: { type: 'date', date: e.fireAtMs },
      }).catch(() => {});
    }
    await cancelUnwanted(N, (id) => id.startsWith('vial-'), wanted);
  } catch {
    // ignore
  }
}

// ── CHECK-IN REMINDERS ──────────────────────────────────────────
export async function syncCheckinReminder() {
  const N = getNotifications();
  if (!N) return;
  try {
    const user = await getCachedUser();
    if (!user) return;
    if (user.user_metadata?.checkin_reminders === false) { await cancelByPrefix(N, 'checkin-'); return; } // A-109

    const t = await getT();

    await scheduleReq(N, {
      identifier: 'checkin-weekly',
      content: {
        title: t('notif_checkin_title'),
        body: t('notif_checkin_body'),
        data: { type: 'checkin_reminder' },
        categoryIdentifier: 'general-reminder',
        ...(Platform.OS === 'android' && { channelId: 'checkin-reminders' }),
      },
      trigger: {
        type: 'weekly',
        weekday: 1, // Sunday
        hour: 10,
        minute: 0,
      },
    }).catch(() => {});
    await cancelUnwanted(N, (id) => id.startsWith('checkin-'), new Set(['checkin-weekly'])); // A-107 AC2
  } catch {
    // ignore
  }
}

// ── REALITY-CHECK WEIGH-IN REMINDER ─────────────────────────────
// Its OWN notification, independent of dose reminders and the morning summary.
// Fires ~21 days after the user logged their first reality-check weight, at
// 10:00 local, and deep-links into the BMR calculator to log the second weight.
// Reads the open check-in ({ date, weightKg }) from AsyncStorage; none → nothing scheduled.
export const REALITY_CHECK_DAYS = 21;
// The open reality-check weigh-in ({ date, weightKg }) lives in AsyncStorage —
// a per-device reminder that must persist reliably (server metadata proved too
// flaky for this). Shared by the calculator, this scheduler, and the Today alert.
export const RC_START_KEY = 'dosetrace_rc_start';
export async function syncRealityCheckReminder() {
  const N = getNotifications();
  if (!N) return;
  try {
    // A-107 AC2: never cancel first. No open check (or a past one) cancels it; an unknown state
    // (the read failed) keeps what is scheduled.
    const none = () => cancelUnwanted(N, (id) => id === 'reality-check-weigh', new Set());
    let start = null;
    // Source of truth: the synced open-check table (S-03). Lazy require: realityCheck imports this module.
    try { start = await require('./realityCheck').getRealityStart({ strict: true }); } catch { return; }
    if (!start || !start.date) { await none(); return; } // no open check-in

    const fire = new Date(start.date + 'T00:00:00');
    fire.setDate(fire.getDate() + REALITY_CHECK_DAYS);
    fire.setHours(10, 0, 0, 0);
    // Past due → the in-app Today alert covers it; don't schedule in the past.
    if (fire.getTime() <= Date.now()) { await none(); return; }

    const t = await getT();
    await scheduleReq(N, {
      identifier: 'reality-check-weigh',
      content: {
        title: t('notif_rc_title'),
        body: t('notif_rc_body'),
        data: { type: 'reality_check' },
        categoryIdentifier: 'general-reminder',
        ...(Platform.OS === 'android' && { channelId: 'checkin-reminders' }),
      },
      trigger: { type: 'date', date: fire },
    }).catch(() => {});
  } catch {
    // ignore
  }
}

// 20:00 "anything else today?" question for the AI food log (FL-18, founder
// 2026-09-27). It fires ONLY while a reality-check is active (an open reality-check
// start), once a day, unless the user already closed that local day ("Nothing else
// today" here, in the app, or "that's it" typed in the composer). Logging food does
// NOT cancel it (a logged breakfast still leaves dinner) and there is no backoff.
// Cleared when the reality-check stops. Buttons: Log it · Nothing else today.
//
// Scheduled as a ROLLING SET OF ONE-SHOT dated alarms (not a single repeating
// `type:'daily'` trigger). A repeating daily trigger on Android is an inexact
// alarm that Doze / battery-saver silently drops when the app is closed — and it
// does NOT get the SCHEDULE_EXACT_ALARM treatment that one-shot dated alarms do
// (this is why the nudge never showed). One-shots at a fixed clock time fire
// exactly, and the set is topped up every time the app opens (syncAllNotifications).
const FOOD_HOUR = 20;
const FOOD_MIN = 0;
// Rolling window. Kept at 7 (not the full 21-day reality-check length) to stay well
// under iOS's 64-pending cap; the set is re-topped whenever the app comes to the
// foreground (App.js AppState listener), so the tail of a 21-day check stays covered
// without pre-scheduling all 21 days at once.
const FOOD_WINDOW_DAYS = 7;
export async function syncFoodLogReminder() {
  const N = getNotifications();
  if (!N) return;
  try {
    // A-107 AC2: schedule first, then cancel only food-log ids no longer wanted (the old single
    // 'food-log-daily' id included). An unknown state never cancels.
    const wanted = new Set();
    const finish = () => cancelUnwanted(N, (id) => id === 'food-log-daily' || id.startsWith('food-log-'), wanted);
    // Android delegates this to server push when active (battery-saver drops local
    // alarms); the server sends it from calc_reality_open, so skip local to avoid
    // doubles. iOS keeps local scheduling.
    if (usesServerPush()) { await finish(); return; }

    // The user's own off-switch (Settings): turning it off clears anything already scheduled. It deliberately stays off
    // across new reality checks — the Settings label says so.
    let user = null;
    try { user = await getCachedUser(); } catch { user = null; }
    if (!user) return; // no user known on this phone right now: keep what is scheduled (AC1)
    if (user.user_metadata?.food_reminders === false) { await finish(); return; }

    let start = null;
    // Source of truth: the synced open-check table (S-03). Lazy require: realityCheck imports this module.
    try { start = await require('./realityCheck').getRealityStart({ strict: true }); } catch { return; }
    if (!start || !start.date) { await finish(); return; } // no active reality-check → no food reminder
    const startKey = String(start.date).slice(0, 10); // corrupt dates → foodNudgeDays returns []

    const now = new Date();
    const todayKey = ymd(now);
    // Days the user already closed (only today can be closed ahead of 20:00).
    let closed = new Set();
    if (user?.id) {
      try { closed = closedDays(getFoodLogsSince(user.id, todayKey) || []); } catch { /* best-effort: schedule as if none closed */ }
    }
    let days = foodNudgeDays(startKey, todayKey, closed, FOOD_WINDOW_DAYS); // no day-21 cutoff while the check is open (FL-42)
    // No 8 PM question while the user can't log food (locked), none past the last
    // open day (FL-41). Lazy require: foodLogActions imports this module.
    try {
      const { loadFoodAccess } = require('./foodLogActions');
      const { access } = await loadFoodAccess(user?.id || null, { persist: !_background });
      days = remindersForAccess(days, access);
    } catch { /* access unknown: keep the plan (lenient) */ }

    const t = await getT();
    for (const dayKey of days) {
      const fire = parseYmd(dayKey);
      fire.setHours(FOOD_HOUR, FOOD_MIN, 0, 0);
      if (fire <= now) continue; // today's 8pm already passed
      wanted.add(`food-log-${dayKey}`);
      await scheduleReq(N, {
        identifier: `food-log-${dayKey}`,
        content: {
          title: t('notif_food_title'),
          body: t('notif_food_body'),
          data: { type: 'food_log', dayKey },
          categoryIdentifier: 'food-evening',
          ...(Platform.OS === 'android' && { channelId: 'checkin-reminders' }),
        },
        trigger: { type: 'date', date: fire.getTime() },
      }).catch(() => {});
    }
    await finish();
  } catch {
    // ignore
  }
}

// Close a local day's food log (FL-18 / FL-29): a durable, synced 'day_closed'
// marker row, then re-plan so that day's 20:00 question is cancelled. Safe to
// call twice (the marker is idempotent). Returns true when the day is closed.
export async function closeFoodDay(dayKey, userId) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || ''))) return false;
  let uid = userId || null;
  if (!uid) { try { uid = (await getCachedUser())?.id || null; } catch { uid = null; } }
  if (!uid) return false;
  let id = null;
  try { id = insertFoodDayMarker(uid, dayKey, 'day_closed'); } catch { id = null; }
  if (!id) return false;
  const N = getNotifications();
  if (N) { try { await N.cancelScheduledNotificationAsync(`food-log-${dayKey}`); } catch { /* ignore */ } }
  await syncFoodLogReminder().catch(() => {});
  return true;
}

// Daily "start of day" nudge so the user sees today's doses first thing when
// they wake, before the day gets away from them. Localized. Gated by the same
// dose_reminders preference as the per-dose reminders.
export async function syncMorningSummary() {
  const N = getNotifications();
  if (!N) return;
  try {
    const user = await getCachedUser();
    if (!user) return;
    if (user.user_metadata?.dose_reminders === false) { await cancelByPrefix(N, 'summary-', 'morning-summary'); return; } // A-109

    const t = await getT();
    const protocols = getActiveProtocols(user.id) || [];

    // A-107 AC2: schedule first (same id replaces), then cancel only summaries no longer wanted
    // (the old single 'morning-summary' id included).
    const wanted = new Set();
    const finish = () => cancelUnwanted(N, (id) => id === 'morning-summary' || id.startsWith('summary-'), wanted);
    // Android delegates the morning summary to server push when active — clear local ones.
    if (usesServerPush()) { await finish(); return; }

    // Per-day plan: a real summary on days a dose is due, a factual "next dose in
    // N days" heads-up on quiet days (so users can restock in time), and silence
    // on days with nothing due and nothing upcoming. No advice — just the facts.
    const todayKey = ymd(new Date());
    const plans = morningSummaryPlan(protocols, todayKey, SUMMARY_WINDOW_DAYS, SUMMARY_HORIZON_DAYS);
    const now = new Date();
    const showNames = await showNamesInNotifications();

    for (const plan of plans) {
      if (plan.kind === 'none') continue; // nothing today and nothing upcoming — stay quiet

      const fire = parseYmd(plan.dateKey);
      fire.setHours(MORNING_HOUR, MORNING_MIN, 0, 0);
      if (fire <= now) continue; // 7am already passed today

      let body;
      if (plan.kind === 'due') {
        body = showNames
          ? fill(t('notif_morning_due_body'), { list: formatList(plan.list) })
          : fill(t(pluralKey('notif_morning_due_private', plan.list.length, t.language)), { n: plan.list.length });
      } else if (plan.kind === 'next1') {
        body = t('notif_morning_next1_body');
      } else {
        body = fill(t('notif_morning_next_body'), { days: plan.days });
      }

      wanted.add(`summary-${plan.dateKey}`);
      await scheduleReq(N, {
        identifier: `summary-${plan.dateKey}`,
        content: {
          title: t('notif_morning_title'),
          body,
          data: { type: 'morning_summary' },
          ...(Platform.OS === 'android' && { channelId: 'dose-reminders' }),
        },
        trigger: { type: 'date', date: fire.getTime() },
      }).catch(() => {});
    }
    await finish();
  } catch {
    // ignore
  }
}

// ── MASTER SYNC ──────────────────────────────────────────────────
// The resync in flight (cancel → reschedule): the Reminder check waits for it, so it never counts a
// queue that is being rebuilt (council 2 QA, 2026-10-05).
let _notifSyncing = null;
let _notifSyncedOnce = false; // a resync finished this session (the queue count means something)
const _syncedListeners = new Set();
// Today re-reads the Reminder check when a resync finishes (its first read may come before it).
// A-106 EA-4: Android keeps the reminders already scheduled as inexact when the user turns
// "Alarms & reminders" on, so coming back to the app with it newly on reschedules everything
// (and the resync listeners refresh Today's alert). Started once in App.js. → unsubscribe
export function watchExactAlarms() {
  if (Platform.OS !== 'android') return () => {};
  let last = canScheduleExactAlarms();
  const sub = AppState.addEventListener('change', (st) => {
    if (st !== 'active') return;
    const now = canScheduleExactAlarms();
    const turnedOn = last === false && now === true;
    last = now;
    // after any resync already running (the app's own foreground top-up), never alongside it
    if (turnedOn) Promise.resolve(_notifSyncing).catch(() => {}).then(() => syncAllNotifications()).then(() => restoreSnoozes({ rearm: true })).catch(() => {});
  });
  return () => sub.remove();
}

export function addNotificationsSyncedListener(cb) { _syncedListeners.add(cb); return () => _syncedListeners.delete(cb); }
// A-107 AC6: one resync at a time. A call while one runs waits for it, and every call made meanwhile
// shares ONE follow-up run (the background refresh, the foreground top-up, Settings, a Mark-as-taken).
let _rerun = null;
export async function syncAllNotifications() {
  if (_notifSyncing) {
    if (!_rerun) _rerun = _notifSyncing.then(() => { _rerun = null; return syncAllNotifications(); });
    return _rerun;
  }
  const run = syncAllNotificationsNow();
  // The app's own resync (not the background run) refreshed the reminders: Today's "not refreshed"
  // alert stays quiet for a user who opens the app (council 3).
  // Only when a user was known for this resync (offline + expired token schedules nothing).
  run.then(async () => { if (_background) return; const u = await getCachedUser().catch(() => null); if (u) await AsyncStorage.setItem(FG_SYNC_KEY, String(Date.now())); }).catch(() => {});
  const tracked = run.catch(() => {}).then(() => {
    _notifSyncedOnce = true;
    if (_notifSyncing === tracked) _notifSyncing = null;
    for (const cb of _syncedListeners) { try { cb(); } catch { /* ignore */ } }
  });
  _notifSyncing = tracked;
  return run;
}

async function syncAllNotificationsNow() {
  await syncNotificationCategories();
  // A-108: Silent mode on → cancel everything already scheduled and schedule nothing.
  resetSilent();
  if (await silentNow()) {
    const N = getNotifications();
    if (N) { try { await N.cancelAllScheduledNotificationsAsync(); } catch { /* ignore */ } }
    return;
  }
  await syncAllDoseReminders();
  await syncVialAlerts();
  await syncCheckinReminder();
  await syncRealityCheckReminder();
  await syncFoodLogReminder();
  await syncMorningSummary();
  await restoreSnoozes();
}

export async function cancelAllNotifications() {
  const N = getNotifications();
  if (!N) return;
  try {
    await N.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
  try { await AsyncStorage.removeItem(SNOOZE_KEY); } catch { /* ignore */ }
}

// The notifications already shown in Notification Center (an intended sign-out removes them so
// nothing of this account stays on the phone; Gate B 2026-10-03 F5).
export async function dismissAllNotifications() {
  const N = getNotifications();
  if (!N) return;
  try { await N.dismissAllNotificationsAsync(); } catch { /* ignore */ }
}

// ── SNOOZE ("In 1 hour" / "Tomorrow" on a notification) ──────────
// A snoozed notification is a one-shot COPY with its own id ("snz-…"), recorded in
// AsyncStorage (a per-device reminder setting, not user data). Routine resyncs
// never touch the "snz-" prefix; restoreSnoozes() re-arms records whose copy is
// missing and drops ones no longer wanted (dose slot logged meanwhile, protocol
// gone, time passed). Capped (MAX_SNOOZES) for iOS's 64 pending limit.
const SNOOZE_KEY = 'dosetrace_snoozes';
const CHANNEL_FOR = { dose_reminder: 'dose-reminders', dose_followup: 'dose-reminders', vial_low: 'vial-alerts' };

// Every read-modify-write of the snooze list runs one at a time: a snooze saved
// while a foreground resync prunes the list must not be cancelled by a stale read.
let snoozeLock = Promise.resolve();
function withSnoozeLock(fn) {
  const run = snoozeLock.then(fn, fn);
  snoozeLock = run.catch(() => {});
  return run;
}

async function loadSnoozes() {
  try { const raw = await AsyncStorage.getItem(SNOOZE_KEY); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; }
}
async function saveSnoozes(list) {
  try { await AsyncStorage.setItem(SNOOZE_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

// Is the dose slot a snooze points at already logged (or its protocol gone)?
function doseSlotResolved(dose) {
  try {
    const p = getProtocolById(dose.protocolId);
    if (!p || p.active === 0 || p.deleted_at) return true;
    const [y, m, d] = dose.dayKey.split('-').map(Number);
    const start = new Date(y, m - 1, d), end = new Date(y, m - 1, d + 1);
    const taken = (getLogsSince(p.user_id, start.toISOString()) || [])
      .filter((l) => l.protocol_id === p.id && l.outcome === 'Taken' && new Date(l.logged_at) < end).length;
    return taken > dose.ti;
  } catch { return false; }
}

async function scheduleSnoozeCopy(N, r) {
  const data = { ...(r.data || {}), snoozed: true, origId: r.origId };
  const isDose = data.type === 'dose_reminder' || data.type === 'dose_followup';
  await scheduleReq(N, {
    identifier: r.id,
    content: {
      title: r.title || '',
      body: r.body || '',
      data,
      // A snoozed dose can still be marked taken; nothing is snoozed twice.
      ...(isDose ? { categoryIdentifier: data.inj ? 'dose-snoozed-inj' : 'dose-snoozed' } : {}),
      ...(Platform.OS === 'android' && { channelId: CHANNEL_FOR[data.type] || 'checkin-reminders' }),
    },
    trigger: { type: 'date', date: r.fireAt },
  });
}

export function snoozeNotification(request, kind) {
  return withSnoozeLock(() => snoozeNotificationLocked(request, kind));
}
async function snoozeNotificationLocked(request, kind) {
  const N = getNotifications();
  if (!N || !request) return null;
  const content = request.content || {};
  let data = content.data || {};
  if (typeof data.dataString === 'string') { try { data = JSON.parse(data.dataString); } catch { /* keep */ } }
  const origId = data.origId || request.identifier;
  const now = Date.now();
  const rec = {
    id: snoozeId(origId), origId, fireAt: snoozeFireAt(kind, now), createdAt: now, kind,
    title: content.title, body: content.body, data, dose: parseDoseId(origId),
  };
  try {
    await scheduleSnoozeCopy(N, rec);
    // Persistent-mode follow-ups for this slot would fire straight through the snooze.
    if (rec.dose) {
      const all = await N.getAllScheduledNotificationsAsync();
      const fPrefix = `dose-${rec.dose.protocolId}-${rec.dose.dayKey}-t${rec.dose.ti}-f`;
      for (const n of all) if (n.identifier.startsWith(fPrefix)) await N.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
    }
    const list = (await loadSnoozes()).filter((r) => r.id !== rec.id);
    list.push(rec);
    await saveSnoozes(list);
    await restoreSnoozesLocked();
    if (request.identifier) await N.dismissNotificationAsync(request.identifier).catch(() => {});
    return rec;
  } catch { return null; }
}

// Re-arm wanted snoozes, drop the rest. Safe to call from any sync.
// rearm (A-106 EA-4): cancel and reschedule every snoozed copy — after Alarms & reminders turns on,
// so the copies scheduled while it was off become exact too.
export function restoreSnoozes(opts) {
  return withSnoozeLock(() => restoreSnoozesLocked(opts));
}
async function restoreSnoozesLocked({ rearm = false } = {}) {
  const N = getNotifications();
  if (!N) return;
  try {
    const list = await loadSnoozes();
    let user = null;
    try { user = await getCachedUser(); } catch { user = null; }
    const dosesOff = user?.user_metadata?.dose_reminders === false;
    const namesOff = user?.user_metadata?.notif_show_names === false;
    const kept = pruneSnoozes(list, Date.now(), (r) => !(r.dose && (dosesOff || doseSlotResolved(r.dose))));
    // Settings changed since the snooze? A dose copy follows the name-privacy setting.
    const retitled = new Set();
    if (namesOff) {
      const t = await getT();
      for (const r of kept) {
        if (r.dose && r.title !== t('notif_dose_title_private')) { r.title = t('notif_dose_title_private'); retitled.add(r.id); }
        if (r.data && r.data.type === 'vial_low' && Number.isFinite(r.data.remaining)) {
          const body = fill(t(r.data.remaining === 1 ? 'notif_vial_body_one' : 'notif_vial_body_other'), { name: t('notif_vial_fallback'), n: r.data.remaining });
          if (r.body !== body) { r.body = body; retitled.add(r.id); }
        }
      }
    }
    const keptIds = new Set(kept.map((r) => r.id));
    const scheduled = await N.getAllScheduledNotificationsAsync();
    const have = new Set();
    for (const n of scheduled) {
      if (!n.identifier.startsWith('snz-')) continue;
      if (keptIds.has(n.identifier) && !retitled.has(n.identifier) && !rearm) have.add(n.identifier);
      else await N.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
    }
    for (const r of kept) if (!have.has(r.id)) await scheduleSnoozeCopy(N, r).catch(() => {});
    if (kept.length !== list.length || retitled.size) await saveSnoozes(kept);
  } catch { /* best-effort */ }
}

// ── SERVER PUSH (Expo) registration ──────────────────────────────
// Register this device's Expo push token so the server-side scheduled sender can
// deliver dose reminders + the morning summary as high-priority pushes that
// arrive even under Android battery saver / Doze. Best-effort, never blocks.
// See supabase/functions/send-reminders.
export async function registerPushToken() {
  const N = getNotifications();
  if (!N) return;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;
    const Constants = require('expo-constants').default;
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
    if (!projectId) return;
    const res = await N.getExpoPushTokenAsync({ projectId });
    const token = res?.data;
    if (!token) return;
    const user = await getCachedUser();
    if (!user) return;
    // Capture the device's IANA timezone so the server sender can fire dose
    // reminders and the 7am morning summary in the user's LOCAL time (the server
    // has no other way to know it). Refreshed on every registration, so a user who
    // travels/changes zones self-heals next launch.
    let timezone = null;
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { timezone = null; }
    const { supabase } = require('./supabase');
    await supabase.from('push_tokens').upsert(
      { user_id: user.id, expo_token: token, platform: Platform.OS, timezone, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,expo_token' },
    );
  } catch { /* best-effort — sign-in never depends on this */ }
}

// Remove this device's token on intentional sign-out / delete so the server stops
// pushing to a device that's no longer signed in.
export async function removePushToken() {
  const N = getNotifications();
  if (!N) return;
  try {
    const Constants = require('expo-constants').default;
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
    if (!projectId) return;
    const res = await N.getExpoPushTokenAsync({ projectId }).catch(() => null);
    const token = res?.data;
    if (!token) return;
    const { supabase } = require('./supabase');
    await supabase.from('push_tokens').delete().eq('expo_token', token);
  } catch { /* best-effort */ }
}

// Flip to true ONLY after the server sender (supabase/functions/send-reminders)
// is deployed AND verified delivering on a real device. While false, Android
// keeps its local scheduled notifications (today's behavior) — so shipping the
// push groundwork can NEVER black out Android reminders by suppressing local
// ones before the server is actually sending them.
const SERVER_PUSH_ACTIVE = false;

// True when this device delegates dose + morning-summary delivery to server push.
// Android's local scheduled alarms are unreliable under battery saver, so on
// Android we let the server send those (and suppress the local copies to avoid
// doubles). iOS keeps local scheduling (reliable there) and gets no server push,
// so neither platform double-fires. Immediate notifications (vial-low) stay local
// on both.
export function usesServerPush() {
  return SERVER_PUSH_ACTIVE && Platform.OS === 'android';
}

// ── ANDROID: reliable-delivery helper ────────────────────────────
// On Android, battery optimization / Doze delays or drops time-scheduled
// notifications (dose reminders, the morning summary) while the app is closed —
// only immediate notifications survive. We can't force delivery (the OS/user
// decide), but we can send the user to the app's system settings so they can set
// battery usage to Unrestricted, which is the single biggest reliability win.
// No-op on iOS (scheduled local notifications fire reliably there).
export async function openBatteryOptimizationSettings() {
  if (Platform.OS !== 'android') return false;
  try {
    const IntentLauncher = require('expo-intent-launcher');
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
      { data: 'package:io.outcom.dosetrace' },
    );
    return true;
  } catch {
    return false;
  }
}


// ── REMINDER CHECK (docs/specs/reminder-check.md, founder 2026-10-05 "1 B") ─────────────────────
// What this phone allows DoseTrace right now, for the Reminder check screen and Today's alert. Every
// read is best-effort: a value the phone does not give stays null and is never shown as a problem.
const APP_PACKAGE = 'io.outcom.dosetrace';

export async function readReminderHealth() {
  const N = getNotifications();
  const out = {
    os: Platform.OS,
    manufacturer: Platform.OS === 'android' ? (Platform.constants && (Platform.constants.Manufacturer || Platform.constants.Brand)) || null : null,
    permission: null, doseChannelImportance: null, batteryOptimized: null, exactAlarms: null, hibernationExempt: null, lastRefresh: null, nowMs: Date.now(),
    scheduledCount: 0, next: null, remindersOn: true, silent: false, activeWithTime: 0, syncedOnce: false,
  };
  if (_notifSyncing) { try { await _notifSyncing; } catch { /* read anyway */ } }
  out.syncedOnce = _notifSyncedOnce;
  try { if (N) out.permission = (await N.getPermissionsAsync()).status; } catch { /* unknown */ }
  if (Platform.OS === 'android') {
    try { const ch = N && (await N.getNotificationChannelAsync('dose-reminders')); if (ch) out.doseChannelImportance = ch.importance; } catch { /* unknown */ }
    try { out.batteryOptimized = await require('expo-battery').isBatteryOptimizationEnabledAsync(); } catch { /* unknown */ }
    out.exactAlarms = canScheduleExactAlarms(); // A-106: null when it cannot be read
    out.hibernationExempt = isExemptFromHibernation(); // A-110 RG-3
    try { const raw = await AsyncStorage.getItem('dosetrace_refresh_last'); out.lastRefresh = raw ? JSON.parse(raw) : null; } catch { /* unknown */ } // A-110 RG-4 (lib/reminderRefresh LAST_RUN_KEY)
    try { const fg = Number(await AsyncStorage.getItem(FG_SYNC_KEY)); out.foregroundSyncAt = Number.isFinite(fg) && fg > 0 ? fg : null; } catch { /* unknown */ }
  }
  try {
    const all = N ? await N.getAllScheduledNotificationsAsync() : [];
    const doses = (all || []).filter((n) => n && n.content && n.content.data && n.content.data.type === 'dose_reminder');
    out.scheduledCount = doses.length;
    let best = null;
    for (const n of doses) {
      const at = Number(n.content.data.slotMs);
      if (Number.isFinite(at) && at > Date.now() && (!best || at < best.atMs)) best = { atMs: at, title: n.content.title || '' };
    }
    out.next = best;
    // A-110 RG-4: until when dose reminders are scheduled on this phone (the latest one).
    out.lastScheduledMs = doses.reduce((m, n) => { const at = Number(n.content.data.slotMs); return Number.isFinite(at) && at > m ? at : m; }, 0) || null;
  } catch { /* unknown */ }
  try {
    const user = await getCachedUser();
    if (user) {
      out.remindersOn = user.user_metadata?.dose_reminders !== false;
      out.silent = user.user_metadata?.silent_mode === true; // A-108
      const active = getActiveProtocols(user.id) || [];
      out.activeWithTime = active.filter((p) => reminderTimes(p.reminder_time).length > 0).length;
      // Only a reminder due inside this phone's scheduling window can be missing (RC-4).
      const takenToday = {};
      try { for (const l of getTodayLogs(user.id) || []) if (l.outcome === 'Taken') takenToday[l.protocol_id] = (takenToday[l.protocol_id] || 0) + 1; } catch { /* best-effort */ }
      out.dueInWindow = dueInWindow(active, new Date(), doseBudget({ os: Platform.OS, protocolCount: active.length }).windowDays, takenToday);
    }
  } catch { /* unknown */ }
  return out;
}

// RC-5: a dose-style reminder 10 seconds ahead, through the same channel as real dose reminders.
// It is never a dose: no protocol, no action buttons, and a tap opens the Reminder check.
export async function sendTestReminder() {
  const N = getNotifications();
  if (!N) return false;
  try {
    const t = await getT();
    await scheduleReq(N, {
      identifier: 'reminder-test',
      content: {
        title: 'DoseTrace',
        body: t('rc_test_body'),
        data: { type: 'reminder_test' },
        ...(Platform.OS === 'android' && { channelId: 'dose-reminders' }),
      },
      trigger: { type: 'date', date: Date.now() + 10000 },
    });
    return true;
  } catch { return false; }
}

// The exact system screen for each fix (Android); iPhone has one place: the app's settings.
export async function openReminderFix(fix) {
  const { Linking } = require('react-native');
  if (Platform.OS !== 'android') { try { await Linking.openSettings(); return true; } catch { return false; } }
  try {
    const IntentLauncher = require('expo-intent-launcher');
    const pkgExtra = { 'android.provider.extra.APP_PACKAGE': APP_PACKAGE };
    if (fix === 'notifications') {
      await IntentLauncher.startActivityAsync('android.settings.APP_NOTIFICATION_SETTINGS', { extra: pkgExtra });
    } else if (fix === 'channel') {
      await IntentLauncher.startActivityAsync('android.settings.CHANNEL_NOTIFICATION_SETTINGS', { extra: { ...pkgExtra, 'android.provider.extra.CHANNEL_ID': 'dose-reminders' } });
    } else if (fix === 'hibernation') {
      // A-110: "Pause app activity if unused" sits on the app's own system page.
      await IntentLauncher.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', { data: 'package:' + APP_PACKAGE });
    } else if (fix === 'alarms') {
      await IntentLauncher.startActivityAsync('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', { data: 'package:' + APP_PACKAGE });
    } else {
      // battery and Samsung's deep-sleeping apps: both start from the app's own system page
      return await openBatteryOptimizationSettings();
    }
    return true;
  } catch {
    try { await Linking.openSettings(); return true; } catch { return false; }
  }
}
