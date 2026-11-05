// A-112 SP-5 (founder 2026-10-07): the "Make sure your reminders arrive" screen opens by itself once
// per phone, from Today, for an Android user who has a protocol with a reminder time and has not seen
// it here (onboarding marks it seen). Reachable any time from Settings > Notifications.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { shouldOpenSetup, resumeItem } from './reminderSetupRule';

export const SETUP_SEEN_KEY = 'dosetrace_reminder_setup_seen';
// RS-4 (docs/specs/reminder-setup-conversation.md): the item an Android screen is open on, kept while
// the person is there; if Android closes DoseTrace meanwhile, Today brings them back to it.
export const RESUME_KEY = 'dosetrace_reminder_conv_resume';

export async function markSetupSeen() {
  try { await AsyncStorage.setItem(SETUP_SEEN_KEY, '1'); } catch { /* ignore */ }
}

export async function saveResume(item) {
  try { await AsyncStorage.setItem(RESUME_KEY, JSON.stringify({ item, at: Date.now() })); } catch { /* best-effort */ }
}
export async function clearResume() {
  try { await AsyncStorage.removeItem(RESUME_KEY); } catch { /* best-effort */ }
}

export async function maybeOpenSetupForExisting(navigation, activeWithTime) {
  // RS-4 cold return: back from an Android screen after Android closed the app → the conversation, at
  // that item (read again at once). Fresh only (lib/reminderSetupRule resumeItem); used once.
  let raw = null;
  try { raw = await AsyncStorage.getItem(RESUME_KEY); } catch { raw = null; }
  if (raw) {
    await clearResume();
    const resume = resumeItem(raw);
    if (resume) { navigation.navigate('ReminderCheck', { resume }); return true; }
  }
  if (Platform.OS !== 'android') return false;
  let seen = false;
  try { seen = (await AsyncStorage.getItem(SETUP_SEEN_KEY)) === '1'; } catch { seen = true; }
  if (!shouldOpenSetup({ os: Platform.OS, seen, activeWithTime })) return false;
  await markSetupSeen();
  navigation.navigate('ReminderCheck');
  return true;
}
