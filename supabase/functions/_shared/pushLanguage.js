// A-156 (part of A-127): the language a server push is written in. The app keeps the person's
// language on the phone only (AsyncStorage dosetrace_language, else the phone's language), never in
// user_metadata (0 of 134 production accounts had user_metadata.language on 2026-10-20). So the phone
// writes it on its push_tokens row (lib/notifications registerPushToken, again whenever the language
// changes) and every sender reads it from the token row: English only when the row has none.
// Pure — imported by version-notice and send-reminders (Deno) and by the node tests.
export const PUSH_LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

export function tokenLanguage(tok) {
  const l = tok && typeof tok.language === 'string' ? tok.language : null;
  return l && PUSH_LANGS.includes(l) ? l : 'en';
}
