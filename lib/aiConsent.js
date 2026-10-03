// AI-extraction consent gate (App Review 5.1.1(i)/5.1.2(i)).
//
// Apple requires that BEFORE any user file is sent to a third-party AI
// service the app must (1) say what is sent, (2) name the recipient, and
// (3) obtain the user's permission. Every screen asks in its own DoseTrace sheet (no native
// alert, M4); this module remembers acceptance, so the user is asked once — not on every upload.
// All AI features (lab-report extraction, vaccine-card scanning, vial-label
// scanning, and the nutrition food log) share the same processor and consent.
//
// v2 (2026-09): added vial-label scanning as a covered data category.
// v3 (2026-09-10): added the AI food log — free-text MEAL descriptions are now
// sent to Anthropic, a new data category, so the key is bumped: every user
// re-consents once with copy that names it.

import AsyncStorage from '@react-native-async-storage/async-storage';

// v4 (2026-10-03): the AI protocol assistant — typed answers (compound, dose, schedule) are a
// new kind of data, so everyone agrees once more with copy that names it (regulatory review B1).
const CONSENT_KEY = 'dosetrace_ai_extraction_consent_v4';
const PRIVACY_URL = 'https://dosetrace.io/privacy-policy';

// For screens that ask in their own DoseTrace sheet (My Protocols part 21, 2026-10-02):
// the same key, the same policy link, so one consent still covers every AI feature.
export const AI_PRIVACY_URL = PRIVACY_URL;
export async function grantAIConsent() {
  try { await AsyncStorage.setItem(CONSENT_KEY, 'granted'); } catch {}
}

export async function hasAIConsent() {
  try {
    return (await AsyncStorage.getItem(CONSENT_KEY)) === 'granted';
  } catch {
    return false;
  }
}
