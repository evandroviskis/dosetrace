// A-110 RG-1: opens the reminder setup step once, on Android, after the first protocol with a
// reminder time is saved (lib/reminderSetupRule.js decides). Reachable any time from Settings.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { shouldOpenSetup } from './reminderSetupRule';
import { reminderTimes } from './notificationPlan';

export const SETUP_SEEN_KEY = 'dosetrace_reminder_setup_seen';

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
