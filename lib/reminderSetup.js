// A-110 RG-1: opens the reminder setup step once, on Android, after the first protocol with a
// reminder time is saved (lib/reminderSetupRule.js decides). Reachable any time from Settings.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { shouldOpenSetup } from './reminderSetupRule';
import { reminderTimes } from './notificationPlan';

export const SETUP_SEEN_KEY = 'dosetrace_reminder_setup_seen';

// Founder 2026-10-07 (council 3 decision 5): an Android user who already has a protocol with a
// reminder time (an update, a reinstall, a new phone) sees the step once too — from Today.
export async function maybeOpenSetupForExisting(navigation, activeWithTime) {
  if (Platform.OS !== 'android') return false;
  let seen = false;
  try { seen = (await AsyncStorage.getItem(SETUP_SEEN_KEY)) === '1'; } catch { seen = true; }
  if (!shouldOpenSetup({ os: Platform.OS, seen, activeWithTime })) return false;
  try { await AsyncStorage.setItem(SETUP_SEEN_KEY, '1'); } catch { /* ignore */ }
  navigation.navigate('ReminderCheck', { mode: 'setup' });
  return true;
}

export async function maybeOpenReminderSetup(navigation, protocol) {
  if (Platform.OS !== 'android') return false;
  let seen = false;
  try { seen = (await AsyncStorage.getItem(SETUP_SEEN_KEY)) === '1'; } catch { seen = false; }
  const activeWithTime = protocol && reminderTimes(protocol.reminder_time).length > 0 ? 1 : 0;
  if (!shouldOpenSetup({ os: Platform.OS, seen, activeWithTime })) return false;
  try { await AsyncStorage.setItem(SETUP_SEEN_KEY, '1'); } catch { /* ignore */ }
  navigation.navigate('ReminderCheck', { mode: 'setup' });
  return true;
}
