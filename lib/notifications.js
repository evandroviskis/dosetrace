import { Platform } from 'react-native';
import { supabase, getCachedUser } from './supabase';
import { getActiveProtocols, getActiveVials } from './database';

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

export async function hasNotificationPermissions() {
  const N = getNotifications();
  if (!N) return false;
  try {
    const { status } = await N.getPermissionsAsync();
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
    return { hours: h || 8, minutes: m || 0 };
  });
}

/**
 * Calculate upcoming dose dates from start_date + interval_days.
 * Returns up to `limit` future Date objects (capped by schedule_total).
 * If interval is 1 (daily), we use a repeating daily trigger instead.
 */
function getUpcomingDoseDates(protocol, limit = 15) {
  const interval = protocol.interval_days || 1;
  const total = protocol.schedule_total || 999;
  const startStr = protocol.start_date;
  const start = startStr ? new Date(startStr + 'T00:00:00') : new Date();

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const dates = [];
  let doseIndex = 0;
  const cursor = new Date(start);

  // Walk through dose dates from start
  while (doseIndex < total && dates.length < limit) {
    if (cursor >= now) {
      dates.push(new Date(cursor));
    }
    doseIndex++;
    cursor.setDate(cursor.getDate() + interval);
  }

  return dates;
}

// Max notifications to schedule per protocol (iOS limit is 64 total)
const MAX_SCHEDULED_PER_PROTOCOL = 15;

// Follow-up delays in minutes for persistent reminders
const FOLLOWUP_DELAYS = [5, 10];

// ── Check persistent reminders preference ───────────────────────
async function isPersistentEnabled() {
  try {
    const user = await getCachedUser();
    return user?.user_metadata?.persistent_reminders === true;
  } catch { return false; }
}

// ── DOSE REMINDERS ───────────────────────────────────────────────
export async function scheduleDoseReminder(protocol) {
  const N = getNotifications();
  if (!N) return;
  try {
    await cancelDoseReminder(protocol.id);

    const times = parseReminderTimes(protocol.reminder_time);
    const interval = protocol.interval_days || 1;
    const persistent = await isPersistentEnabled();
    const doseBody = `Time for your ${protocol.dose || ''} ${protocol.dose_unit || ''} dose`;
    const followupBody = `Reminder: ${protocol.dose || ''} ${protocol.dose_unit || ''} dose still pending`;

    // For daily protocols (interval=1) with no finite limit, use repeating daily triggers
    if (interval === 1 && !protocol.schedule_total) {
      for (let ti = 0; ti < times.length; ti++) {
        const { hours, minutes } = times[ti];
        await N.scheduleNotificationAsync({
          identifier: `dose-${protocol.id}-t${ti}`,
          content: {
            title: `💊 ${protocol.name}`,
            body: doseBody,
            data: { type: 'dose_reminder', protocolId: protocol.id },
            ...(Platform.OS === 'android' && { channelId: 'dose-reminders' }),
          },
          trigger: { type: 'daily', hour: hours, minute: minutes },
        }).catch(() => {});

        // Schedule follow-up daily triggers if persistent
        if (persistent) {
          for (let fi = 0; fi < FOLLOWUP_DELAYS.length; fi++) {
            let fMin = minutes + FOLLOWUP_DELAYS[fi];
            let fHour = hours;
            if (fMin >= 60) { fHour += Math.floor(fMin / 60); fMin = fMin % 60; }
            if (fHour >= 24) fHour = fHour % 24;
            await N.scheduleNotificationAsync({
              identifier: `dose-${protocol.id}-t${ti}-f${fi}`,
              content: {
                title: `⏰ ${protocol.name}`,
                body: followupBody,
                data: { type: 'dose_followup', protocolId: protocol.id },
                ...(Platform.OS === 'android' && { channelId: 'dose-reminders' }),
              },
              trigger: { type: 'daily', hour: fHour, minute: fMin },
            }).catch(() => {});
          }
        }
      }
      return;
    }

    // For all other cases, schedule individual date-based notifications
    const upcomingDates = getUpcomingDoseDates(protocol, MAX_SCHEDULED_PER_PROTOCOL);
    let count = 0;

    for (const doseDate of upcomingDates) {
      for (let ti = 0; ti < times.length; ti++) {
        if (count >= MAX_SCHEDULED_PER_PROTOCOL) break;
        const { hours, minutes } = times[ti];

        const fireDate = new Date(doseDate);
        fireDate.setHours(hours, minutes, 0, 0);

        // Skip if this time has already passed
        if (fireDate <= new Date()) continue;

        await N.scheduleNotificationAsync({
          identifier: `dose-${protocol.id}-${count}`,
          content: {
            title: `💊 ${protocol.name}`,
            body: doseBody,
            data: { type: 'dose_reminder', protocolId: protocol.id },
            ...(Platform.OS === 'android' && { channelId: 'dose-reminders' }),
          },
          trigger: { type: 'date', date: fireDate.getTime() },
        }).catch(() => {});

        // Schedule follow-ups if persistent
        if (persistent) {
          for (let fi = 0; fi < FOLLOWUP_DELAYS.length; fi++) {
            const followDate = new Date(fireDate.getTime() + FOLLOWUP_DELAYS[fi] * 60 * 1000);
            if (followDate <= new Date()) continue;
            await N.scheduleNotificationAsync({
              identifier: `dose-${protocol.id}-${count}-f${fi}`,
              content: {
                title: `⏰ ${protocol.name}`,
                body: followupBody,
                data: { type: 'dose_followup', protocolId: protocol.id },
                ...(Platform.OS === 'android' && { channelId: 'dose-reminders' }),
              },
              trigger: { type: 'date', date: followDate.getTime() },
            }).catch(() => {});
          }
        }

        count++;
      }
      if (count >= MAX_SCHEDULED_PER_PROTOCOL) break;
    }
  } catch {
    // silently fail
  }
}

// Cancel today's follow-up notifications for a protocol (called when dose is taken)
export async function cancelFollowups(protocolId) {
  const N = getNotifications();
  if (!N) return;
  try {
    const all = await N.getAllScheduledNotificationsAsync();
    const toCancel = all.filter(n =>
      n.identifier.startsWith(`dose-${protocolId}-`) && n.identifier.includes('-f')
    );
    for (const n of toCancel) {
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
  } catch {
    // ignore
  }
}

export async function syncAllDoseReminders() {
  try {
    const user = await getCachedUser();
    if (!user) return;
    const { data: prefs } = await supabase
      .from('notification_preferences').select('*').eq('user_id', user.id).single();
    if (prefs && prefs.dose_reminders === false) return;

    const protocols = getActiveProtocols(user.id);
    if (!protocols || protocols.length === 0) return;

    for (const p of protocols) {
      await scheduleDoseReminder(p);
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
    const { data: prefs } = await supabase
      .from('notification_preferences').select('*').eq('user_id', user.id).single();
    if (prefs && prefs.vial_alerts === false) return;

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
      if (!v.total_doses || !v.doses_taken) continue;
      const remaining = v.total_doses - v.doses_taken;
      if (remaining <= 2 && remaining > 0) {
        await N.scheduleNotificationAsync({
          identifier: `vial-low-${v.id}`,
          content: {
            title: '⚗️ Vial Running Low',
            body: `${protocolNames[v.protocol_id] || 'Your vial'} has ${remaining} dose${remaining !== 1 ? 's' : ''} left`,
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
    const { data: prefs } = await supabase
      .from('notification_preferences').select('*').eq('user_id', user.id).single();
    if (prefs && prefs.checkin_reminders === false) return;

    // Cancel existing
    const all = await N.getAllScheduledNotificationsAsync();
    for (const n of all.filter(x => x.identifier.startsWith('checkin-'))) {
      await N.cancelScheduledNotificationAsync(n.identifier);
    }

    await N.scheduleNotificationAsync({
      identifier: 'checkin-weekly',
      content: {
        title: '📋 Weekly Check-in',
        body: 'How are you feeling? Log your wellness check-in.',
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

// ── MASTER SYNC ──────────────────────────────────────────────────
export async function syncAllNotifications() {
  await syncAllDoseReminders();
  await syncVialAlerts();
  await syncCheckinReminder();
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
