import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedUser } from './supabase';
import { getActiveProtocols, getActiveVials, getTodayLogs } from './database';
import { translations } from '../i18n/translations';
import { ymd, parseYmd, dueDateKeys, morningSummaryPlan } from './notificationPlan';

// Notifications are scheduled outside React, so there's no useLanguage() here.
// Read the persisted language and return a t() that mirrors LanguageContext
// (fall back to English, then the key itself).
async function getT() {
  let lang = 'en';
  try { lang = (await AsyncStorage.getItem('dosetrace_language')) || 'en'; } catch { /* default en */ }
  return (key) => (translations[lang] && translations[lang][key]) || (translations.en && translations.en[key]) || key;
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
    await N.setNotificationCategoryAsync('dose-reminder', [
      {
        identifier: 'MARK_TAKEN',
        buttonTitle: t('notif_action_complete'),
        options: { opensAppToForeground: false },
      },
    ]);
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
function parseReminderTimes(reminderTime) {
  if (!reminderTime) return [{ hours: 8, minutes: 0 }];
  return reminderTime.split(',').filter(Boolean).map(t => {
    const [h, m] = t.split(':').map(Number);
    return { hours: Number.isFinite(h) ? h : 8, minutes: Number.isFinite(m) ? m : 0 };
  });
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
// and silently drop vial alerts, the check-in, and morning summaries. Reserves
// ~16 slots for those non-dose notifications (7 summaries + vial alerts + 1).
const DOSE_BUDGET = 48;

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
    const doseVars = { dose: protocol.dose || '', unit: protocol.dose_unit || '' };
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
            title: `💊 ${protocol.name}`,
            body: doseBody,
            data: { type: 'dose_reminder', protocolId: protocol.id },
            categoryIdentifier: 'dose-reminder',
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
                title: `⏰ ${protocol.name}`,
                body: followupBody,
                data: { type: 'dose_followup', protocolId: protocol.id },
                categoryIdentifier: 'dose-reminder',
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

    // Build protocol name lookup from local DB
    const protocols = getActiveProtocols(user.id) || [];
    const protocolNames = {};
    protocols.forEach(p => { protocolNames[p.id] = p.name; });

    for (const v of vials) {
      if (!v.total_doses || v.doses_taken == null) continue;
      const remaining = v.total_doses - v.doses_taken;
      if (remaining <= 2 && remaining > 0) {
        const vialName = protocolNames[v.protocol_id] || t('notif_vial_fallback');
        const vialBody = fill(
          t(remaining === 1 ? 'notif_vial_body_one' : 'notif_vial_body_other'),
          { name: vialName, n: remaining }
        );
        await N.scheduleNotificationAsync({
          identifier: `vial-low-${v.id}`,
          content: {
            title: `⚗️ ${t('notif_vial_title')}`,
            body: vialBody,
            data: { type: 'vial_low', vialId: v.id },
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
        title: `📏 ${t('notif_checkin_title')}`,
        body: t('notif_checkin_body'),
        data: { type: 'checkin_reminder' },
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

    // Per-day plan: a real summary on days a dose is due, a factual "next dose in
    // N days" heads-up on quiet days (so users can restock in time), and silence
    // on days with nothing due and nothing upcoming. No advice — just the facts.
    const todayKey = ymd(new Date());
    const plans = morningSummaryPlan(protocols, todayKey, SUMMARY_WINDOW_DAYS, SUMMARY_HORIZON_DAYS);
    const now = new Date();

    for (const plan of plans) {
      if (plan.kind === 'none') continue; // nothing today and nothing upcoming — stay quiet

      const fire = parseYmd(plan.dateKey);
      fire.setHours(MORNING_HOUR, MORNING_MIN, 0, 0);
      if (fire <= now) continue; // 7am already passed today

      let body;
      if (plan.kind === 'due') {
        body = fill(t('notif_morning_due_body'), { list: formatList(plan.list) });
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
  await syncMorningSummary();
}

export async function cancelAllNotifications() {
  const N = getNotifications();
  if (!N) return;
  try {
    await N.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
}
