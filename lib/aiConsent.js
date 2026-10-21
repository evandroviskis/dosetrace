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
// v4 (2026-10-03): the AI protocol assistant — typed answers (compound, dose, schedule) are a
// new kind of data, so everyone agrees once more with copy that names it (regulatory review B1).
//
// DV-007 / DL-55 (1.3.1): the consent belongs to the ACCOUNT that gave it, not to the phone. One
// record per user id — { status: 'granted' | 'revoked', version, at } — so a second person who
// signs in on the same phone is asked again, the version and date are kept, and the consent can be
// withdrawn (revokeAIConsent; the Settings row waits for its picture, AD-79 item 1). The intended
// sign-out wipe and the cross-account guard clear every record (clearAIConsent). The 1.3.0
// phone-wide flag ('…_v4' = 'granted', no owner, no date) is never read: whoever signs in after the
// update is asked once more, as at every version bump. A copy of the record goes to the account's
// user_metadata.ai_consent with a merge write (only that key is sent); the phone's record decides.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedUser, supabase } from './supabase';

const CONSENT_VERSION = 4;
const CONSENT_PREFIX = 'dosetrace_ai_consent:'; // + user id
const LEGACY_KEYS = ['dosetrace_ai_extraction_consent_v1', 'dosetrace_ai_extraction_consent_v2', 'dosetrace_ai_extraction_consent_v3', 'dosetrace_ai_extraction_consent_v4'];
const PRIVACY_URL = 'https://dosetrace.io/privacy-policy';

// For screens that ask in their own DoseTrace sheet (My Protocols part 21, 2026-10-02):
// the same record, the same policy link, so one consent still covers every AI feature.
export const AI_PRIVACY_URL = PRIVACY_URL;

async function consentUserId() {
  try { const u = await getCachedUser(); return (u && u.id) || null; } catch { return null; }
}

async function writeConsent(status) {
  const uid = await consentUserId();
  if (!uid) return false;
  const rec = { status, version: CONSENT_VERSION, at: new Date().toISOString() };
  try { await AsyncStorage.setItem(CONSENT_PREFIX + uid, JSON.stringify(rec)); } catch { return false; }
  // The account's copy: a merge write of this one key (GoTrue merges top-level metadata keys).
  try { Promise.resolve(supabase.auth.updateUser({ data: { ai_consent: rec } })).catch(() => {}); } catch { /* the phone's record stands */ }
  return true;
}

export async function grantAIConsent() {
  return writeConsent('granted');
}

// GDPR Art. 7(3): withdrawing is as easy as giving. The next AI action asks again.
export async function revokeAIConsent() {
  return writeConsent('revoked');
}

export async function hasAIConsent() {
  const uid = await consentUserId();
  if (!uid) return false;
  try {
    const rec = JSON.parse((await AsyncStorage.getItem(CONSENT_PREFIX + uid)) || 'null');
    return !!rec && rec.status === 'granted' && rec.version === CONSENT_VERSION;
  } catch {
    return false;
  }
}

// Every account's record and the 1.3.0 phone-wide flag (sign-out wipe, cross-account guard).
export async function clearAIConsent() {
  let keys = [];
  try { keys = (await AsyncStorage.getAllKeys()) || []; } catch { keys = []; }
  const doomed = [...keys.filter((k) => typeof k === 'string' && k.startsWith(CONSENT_PREFIX)), ...LEGACY_KEYS];
  try { await AsyncStorage.multiRemove(doomed); } catch {
    for (const k of doomed) { try { await AsyncStorage.removeItem(k); } catch { /* next wipe */ } }
  }
}
