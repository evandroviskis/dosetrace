'use strict';
// A-163 contract step 4: the team message's push title is written in user_metadata.language (the
// same key the send-reminders function reads). The app keeps its language on the phone
// (AsyncStorage 'dosetrace_language'); this copies it to the account — only the one key
// (updateUser merges into user_metadata, so silent_mode, display_name and the rest stay). Never
// called inside onAuthStateChange (components/AccountLanguageSync runs it from a React effect).
// Council 2026-10-22: on start it writes ONLY when the account has no language yet (two phones in
// two languages no longer overwrite each other on every start); when the person changes the
// language (Settings, or the onboarding picker while signed in) it always writes.

const CODES = ['en', 'es', 'pt', 'fr', 'de', 'it'];

// → 'written' | 'same' | 'kept' (start: the account already has a language) | 'skipped' (no
// account / unknown code) | 'failed' (offline: next start, or the next change)
async function syncAccountLanguage({ language, getUser, updateUser, onlyIfMissing = false }) {
  if (!CODES.includes(language)) return 'skipped';
  let user = null;
  try { user = await getUser(); } catch { user = null; }
  if (!user || !user.id) return 'skipped';
  const cur = user.user_metadata && user.user_metadata.language;
  if (cur === language) return 'same';
  if (onlyIfMissing && CODES.includes(cur)) return 'kept';
  try {
    const r = await updateUser({ data: { language } });
    return r && r.error ? 'failed' : 'written';
  } catch { return 'failed'; }
}

// The effect's run for (userId, language) after `prev` (the last run): 'start' — the first run for
// this account (app start, sign-in, another account); 'change' — the same account, another
// language (the person picked it); null — nothing to do.
function languageSyncMode(prev, userId, language) {
  if (!prev || !prev.userId || prev.userId !== userId) return 'start';
  return prev.language === language ? null : 'change';
}

// A change the person made that did not reach the account (offline) is owed: the phone keeps the
// account id under OWED_KEY and the next start writes it as a change. → the id to keep, or null.
const OWED_KEY = 'dosetrace_language_owed';
function owedAfter(owedUid, userId, wasChange, result) {
  if (result === 'written' || result === 'same') return owedUid === userId ? null : owedUid;
  if (wasChange && result === 'failed') return userId;
  return owedUid;
}

module.exports = { syncAccountLanguage, languageSyncMode, owedAfter, OWED_KEY, CODES };
