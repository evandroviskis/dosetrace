'use strict';
// A-163 contract step 4: the team message's push title is written in user_metadata.language (the
// same key the send-reminders function reads). The app keeps its language on the phone
// (AsyncStorage 'dosetrace_language'); this copies it to the account on start and on every
// change — only when it differs, and only the one key (updateUser merges into user_metadata, so
// silent_mode, display_name and the rest stay). Never called inside onAuthStateChange
// (components/AccountLanguageSync runs it from a React effect).

const CODES = ['en', 'es', 'pt', 'fr', 'de', 'it'];

// → 'written' | 'same' | 'skipped' (no account / unknown code) | 'failed' (offline: next start)
async function syncAccountLanguage({ language, getUser, updateUser }) {
  if (!CODES.includes(language)) return 'skipped';
  let user = null;
  try { user = await getUser(); } catch { user = null; }
  if (!user || !user.id) return 'skipped';
  const cur = user.user_metadata && user.user_metadata.language;
  if (cur === language) return 'same';
  try {
    const r = await updateUser({ data: { language } });
    return r && r.error ? 'failed' : 'written';
  } catch { return 'failed'; }
}

module.exports = { syncAccountLanguage, CODES };
