// A-112 SP-5 (founder 2026-10-07): the "Make sure your reminders arrive" screen opens by itself once
// per phone, from Today, for an Android user who has a protocol with a reminder time and has not seen
// it here (onboarding marks it seen). Reachable any time from Settings > Notifications.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { shouldOpenSetup } from './reminderSetupRule';

export const SETUP_SEEN_KEY = 'dosetrace_reminder_setup_seen';

export async function markSetupSeen() {
  try { await AsyncStorage.setItem(SETUP_SEEN_KEY, '1'); } catch { /* ignore */ }
}

export async function maybeOpenSetupForExisting(navigation, activeWithTime) {
  if (Platform.OS !== 'android') return false;
  let seen = false;
  try { seen = (await AsyncStorage.getItem(SETUP_SEEN_KEY)) === '1'; } catch { seen = true; }
  if (!shouldOpenSetup({ os: Platform.OS, seen, activeWithTime })) return false;
  await markSetupSeen();
  navigation.navigate('ReminderCheck');
  return true;
}
