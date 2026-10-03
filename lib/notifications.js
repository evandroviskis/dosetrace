import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedUser } from './supabase';
import { supplyState } from './supplyLow';
import { getActiveProtocols, getActiveVials, getTodayLogs, getFoodLogsSince, getProtocolById, getLogsSince, insertFoodDayMarker } from './database';
import { translations } from '../i18n/translations';
import { ymd, parseYmd, addDays, dueDateKeys, morningSummaryPlan, foodNudgeDays, remindersForAccess, snoozeFireAt, snoozeId, parseDoseId, pruneSnoozes, reminderTimes } from './notificationPlan';
import { closedDays } from './nutrition';
import { needsSiteQuestion } from './siteQuestion';
import { decimalText } from './localeFormat';
import { pluralKey } from './plural';

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
// Register the "Mark as taken" button shown on dose reminders. The button
// logs the dose without opening the app (opensAppToForeground: false); App.js
// handles the MARK_TAKEN response. Re-registered on every sync so the button
// title follows the app language.
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

// Max reminders to schedule per protocol. All reminders are now one-shot dated
// notifications (no repeating triggers), so a single day's occurrence can be
// cancelled when the dose is logged, and per-day reminders never fire on days a
// dose isn't actually due. The rolling window is topped up whenever the app
// opens (App.js → syncAllNotifications). iOS caps an app at 64 pending, so the
// window is kept modest.
const DOSE_WINDOW_DAYS = 10;
// TOTAL notifications a single protocol may schedule (mains + follow-ups counted
// together — follow-ups are what quietly tripled the old count).
const MAX_SCHEDULED_PER_PROTOCOL = 24;
// Total dose-notification budget shared across ALL protocols in one sync, so a
// multi-protocol / persistent-reminder user can't blow past iOS's 64-pending cap
// and silently drop the notifications scheduled LAST (the morning summary). The
// non-dose demand during an active reality-check is larger than it looks:
//   up to 7 morning summaries + up to 7 food-log nudges (FOOD_WINDOW_DAYS)
//   + 1 weekly check-in + 1 reality-check weigh-in = ~16 slots.
// So the dose budget is capped at 40, leaving 24 for the rest (40+7+7+1+1 = 56 < 64).
// Vial alerts are trigger:null (immediate), so they cost 0 pending slots.
const DOSE_BUDGET = 40;

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
// schedule. syncAllDoseReminders passes a per-protocol share of DOSE_BUDGET;
// standalone callers (create/edit/restore) use the per-protocol default.
export async function scheduleDoseReminder(protocol, maxNotifs = MAX_SCHEDULED_PER_PROTOCOL) {
  const N = getNotifications();
  if (!N) return;
  try {
    await cancelDoseReminder(protocol.id);

    const t = await getT();
    const times = parseReminderTimes(protocol.reminder_time);
    const persistent = await isPersistentEnabled();
    const doseVars = { dose: protocol.dose ? decimalText(protocol.dose, t.language) : '', unit: protocol.dose_unit || '' };
    const doseBody = fill(t('notif_dose_body'), doseVars);
    const followupBody = fill(t('notif_followup_body'), doseVars);

    const todayKey = ymd(new Date());
    const dueDays = dueDateKeys(protocol, todayKey, DOSE_WINDOW_DAYS);

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

    for (const dayKey of dueDays) {
      const isToday = dayKey === todayKey;
      for (let ti = 0; ti < times.length; ti++) {
        if (scheduled >= maxNotifs) return;
        // On today, the earliest `takenToday` slots are already done.
        if (isToday && ti < takenToday) continue;

        const { hours, minutes } = times[ti];
        const fireDate = parseYmd(dayKey);
        fireDate.setHours(hours, minutes, 0, 0);
        if (fireDate <= now) continue; // time already passed today

        await N.scheduleNotificationAsync({
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

        // Schedule follow-ups if persistent (each counts against the budget)
        if (persistent) {
          for (let fi = 0; fi < FOLLOWUP_DELAYS.length; fi++) {
            if (scheduled >= maxNotifs) break;
            const followDate = new Date(fireDate.getTime() + FOLLOWUP_DELAYS[fi] * 60 * 1000);
            if (followDate <= now) continue;
            await N.scheduleNotificationAsync({
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
  } catch {
    // silently fail
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
    if (user.user_metadata?.dose_reminders === false) return;

    const protocols = getActiveProtocols(user.id);
    if (!protocols || protocols.length === 0) return;

    // Share the dose budget across protocols so the total stays under iOS's cap.
    // Each protocol is still bounded by MAX_SCHEDULED_PER_PROTOCOL; with many
    // protocols each gets a smaller near-term window rather than a few hogging it.
    const perProtocol = Math.min(
      MAX_SCHEDULED_PER_PROTOCOL,
      Math.max(2, Math.floor(DOSE_BUDGET / protocols.length)),
    );
    for (const p of protocols) {
      await scheduleDoseReminder(p, perProtocol);
    }
  } catch {
    // ignore
  }
}

// ── VIAL ALERTS ──────────────────────────────────────────────────
export async function syncVialAlerts() {
  const N = getNotifications();
  if (!N) return;
  try {
    const user = await getCachedUser();
    if (!user) return;
    if (user.user_metadata?.vial_alerts === false) return;

    const t = await getT();

    // Cancel existing vial alerts
    const all = await N.getAllScheduledNotificationsAsync();
    for (const n of all.filter(x => x.identifier.startsWith('vial-'))) {
      await N.cancelScheduledNotificationAsync(n.identifier);
    }

    const vials = getActiveVials(user.id);
    if (!vials) return;
    // A snoozed vial alert stays quiet until its snoozed copy fires (this sync
    // re-fires vial alerts immediately on every run otherwise).
    const snoozedIds = new Set((await loadSnoozes()).filter((r) => r.fireAt > Date.now()).map((r) => r.origId));
    const showNames = await showNamesInNotifications();

    // Build protocol name lookup from local DB
    const protocols = getActiveProtocols(user.id) || [];
    const protocolNames = {};
    const protocolById = {};
    protocols.forEach(p => { protocolNames[p.id] = p.name; protocolById[p.id] = p; });

    for (const v of vials) {
      // The ONE supply-low rule (lib/supplyLow.js) — same as the Today alert and the
      // Protocols badge, older vials without a stored count included (S-05).
      const { remaining, low } = supplyState(v, protocolById[v.protocol_id]);
      if (low) {
        if (snoozedIds.has(`vial-low-${v.id}`)) continue;
        const vialName = (showNames && protocolNames[v.protocol_id]) || t('notif_vial_fallback');
        const vialBody = fill(
          t(remaining === 1 ? 'notif_vial_body_one' : 'notif_vial_body_other'),
          { name: vialName, n: remaining }
        );
        await N.scheduleNotificationAsync({
          identifier: `vial-low-${v.id}`,
          content: {
            title: t('notif_vial_title'),
            body: vialBody,
            data: { type: 'vial_low', vialId: v.id, remaining },
            categoryIdentifier: 'general-reminder',
            ...(Platform.OS === 'android' && { channelId: 'vial-alerts' }),
          },
          trigger: null, // fire immediately
        }).catch(() => {});
      }
    }
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
    if (user.user_metadata?.checkin_reminders === false) return;

    const t = await getT();

    // Cancel existing
    const all = await N.getAllScheduledNotificationsAsync();
    for (const n of all.filter(x => x.identifier.startsWith('checkin-'))) {
      await N.cancelScheduledNotificationAsync(n.identifier);
    }

    await N.scheduleNotificationAsync({
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
    // Always clear the previous one first so a reset/relogin can't leave a stale
    // reminder behind.
    const all = await N.getAllScheduledNotificationsAsync();
    for (const n of all.filter(x => x.identifier === 'reality-check-weigh')) {
      await N.cancelScheduledNotificationAsync(n.identifier);
    }

    let start = null;
    // Source of truth: the synced open-check table (S-03). Lazy require: realityCheck imports this module.
    try { start = await require('./realityCheck').getRealityStart(); } catch { start = null; }
    if (!start || !start.date) return; // no open check-in

    const fire = new Date(start.date + 'T00:00:00');
    fire.setDate(fire.getDate() + REALITY_CHECK_DAYS);
    fire.setHours(10, 0, 0, 0);
    // Past due → the in-app Today alert covers it; don't schedule in the past.
    if (fire.getTime() <= Date.now()) return;

    const t = await getT();
    await N.scheduleNotificationAsync({
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
    // Clear both the old single-id reminder and any dated ones before rescheduling.
    const all = await N.getAllScheduledNotificationsAsync();
    for (const n of all.filter(x => x.identifier === 'food-log-daily' || x.identifier.startsWith('food-log-'))) {
      await N.cancelScheduledNotificationAsync(n.identifier);
    }
    // Android delegates this to server push when active (battery-saver drops local
    // alarms); the server sends it from calc_reality_open, so skip local to avoid
    // doubles. iOS keeps local scheduling.
    if (usesServerPush()) return;

    // The user's own off-switch (Settings). Checked AFTER the cancel above, so
    // turning it off clears anything already scheduled. It deliberately stays off
    // across new reality checks — the Settings label says so.
    let user = null;
    try { user = await getCachedUser(); } catch { user = null; }
    if (user?.user_metadata?.food_reminders === false) return;

    let start = null;
    // Source of truth: the synced open-check table (S-03). Lazy require: realityCheck imports this module.
    try { start = await require('./realityCheck').getRealityStart(); } catch { start = null; }
    if (!start || !start.date) return; // no active reality-check → no food reminder
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
      const { access } = await loadFoodAccess(user?.id || null);
      days = remindersForAccess(days, access);
    } catch { /* access unknown: keep the plan (lenient) */ }

    const t = await getT();
    for (const dayKey of days) {
      const fire = parseYmd(dayKey);
      fire.setHours(FOOD_HOUR, FOOD_MIN, 0, 0);
      if (fire <= now) continue; // today's 8pm already passed
      await N.scheduleNotificationAsync({
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
    if (user.user_metadata?.dose_reminders === false) return;

    const t = await getT();
    const protocols = getActiveProtocols(user.id) || [];

    // Cancel existing summaries before rescheduling (e.g. after a language or
    // protocol change). Old builds used a single 'morning-summary' id; clear it too.
    const all = await N.getAllScheduledNotificationsAsync();
    for (const n of all.filter(x => x.identifier === 'morning-summary' || x.identifier.startsWith('summary-'))) {
      await N.cancelScheduledNotificationAsync(n.identifier);
    }
    // Android delegates the morning summary to server push — stop after clearing
    // local ones so it isn't sent twice. iOS keeps the local summary.
    if (usesServerPush()) return;

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

      await N.scheduleNotificationAsync({
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
  } catch {
    // ignore
  }
}

// ── MASTER SYNC ──────────────────────────────────────────────────
export async function syncAllNotifications() {
  await syncNotificationCategories();
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
  await N.scheduleNotificationAsync({
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
export function restoreSnoozes() {
  return withSnoozeLock(() => restoreSnoozesLocked());
}
async function restoreSnoozesLocked() {
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
      if (keptIds.has(n.identifier) && !retitled.has(n.identifier)) have.add(n.identifier);
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
