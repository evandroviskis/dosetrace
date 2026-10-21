// A-156 (part of A-127): the language a server push is written in. The app keeps the person's
// language on the phone only (AsyncStorage dosetrace_language, else the phone's language), never in
// user_metadata (0 of 134 production accounts had user_metadata.language on 2026-10-20). So the phone
// writes it on its push_tokens row (lib/notifications registerPushToken, again whenever the language
// changes) and every sender reads it from the token row: English only when the row has none.
// Pure — imported by version-notice and send-reminders (Deno) and by the node tests.
export const PUSH_LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

// Deploy order (review round 2, item 2): the language column comes from its own migration
// (20261021230000_push_tokens_language.sql). Until it is applied, reading it answers 400 / 42703 (or
// PGRST204): the read goes again without it, so a sender keeps sending (in English) instead of
// failing every run. run(cols) → the PostgREST answer { data, error }. Any other error is returned.
const MISSING_COLUMN = new Set(['42703', 'PGRST204']);
export async function selectWithOptionalLanguage(run, baseCols) {
  const first = await run(`${baseCols}, language`);
  const e = first && first.error;
  if (!e) return { ...first, withLanguage: true };
  if (!MISSING_COLUMN.has(String(e.code || ''))) return { ...first, withLanguage: true };
  const again = await run(baseCols);
  return { ...again, withLanguage: false };
}

export function tokenLanguage(tok) {
  const l = tok && typeof tok.language === 'string' ? tok.language : null;
  return l && PUSH_LANGS.includes(l) ? l : 'en';
}
