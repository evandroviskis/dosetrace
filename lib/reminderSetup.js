// A-112 SP-5 (founder 2026-10-07): the "Make sure your reminders arrive" screen opens by itself once
// per phone, from Today, for an Android user who has a protocol with a reminder time and has not seen
// it here (onboarding marks it seen). Reachable any time from Settings > Notifications.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { shouldOpenSetup, resumeDecision } from './reminderSetupRule';
import { getCachedUser } from './supabase';

export const SETUP_SEEN_KEY = 'dosetrace_reminder_setup_seen';
// RS-4 (docs/specs/reminder-setup-conversation.md): the item an Android screen is open on, kept while
// the person is there; if Android closes DoseTrace meanwhile, Today brings them back to it.
export const RESUME_KEY = 'dosetrace_reminder_conv_resume';

export async function markSetupSeen() {
  try { await AsyncStorage.setItem(SETUP_SEEN_KEY, '1'); } catch { /* ignore */ }
}

// Review 6: the item is kept with the account that left it (resumeItem checks it). Second review 6:
// without the account id nothing is saved (it could never be matched back). → true when saved.
export async function saveResume(item, userId) {
  if (!userId) return false;
  try { await AsyncStorage.setItem(RESUME_KEY, JSON.stringify({ item, at: Date.now(), user: userId })); return true; } catch { return false; }
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
    let userId = null;
    try { const u = await getCachedUser(); userId = u ? u.id : null; } catch { userId = null; }
    // Second review 6: the account not known yet → keep it for the next look (never drop silently).
    const d = resumeDecision(raw, Date.now(), userId);
    if (d.action !== 'keep') await clearResume();
    if (d.action === 'open') { navigation.navigate('ReminderCheck', { resume: d.item }); return true; }
  }
  if (Platform.OS !== 'android') return false;
  let seen = false;
  try { seen = (await AsyncStorage.getItem(SETUP_SEEN_KEY)) === '1'; } catch { seen = true; }
  if (!shouldOpenSetup({ os: Platform.OS, seen, activeWithTime })) return false;
  await markSetupSeen();
  navigation.navigate('ReminderCheck');
  return true;
}
