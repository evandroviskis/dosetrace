'use strict';
// DV-196 / DV-050 (DL-13: the app language rules every surface): ONE rule for the app's language,
// shared by i18n/LanguageContext (the screens) and every notification path (reminders, action
// buttons, "Nothing new logged", Android channel names). The stored choice wins; with no choice the
// phone's own language (when the app has it), else English. Resolved at read time and never stored,
// so a person who never picked a language follows a later change of the phone's language.
// Plain CommonJS with its two native readers injectable, so the rule runs under node --test.

const LANGUAGE_KEY = 'dosetrace_language';
const SUPPORTED = ['en', 'es', 'pt', 'fr', 'de', 'it'];

function resolveLanguage(stored, deviceCode) {
  const s = String(stored || '').toLowerCase();
  if (SUPPORTED.includes(s)) return s;
  const d = String(deviceCode || '').toLowerCase();
  return SUPPORTED.includes(d) ? d : 'en';
}

// The phone's language code ("pt" for pt-BR), or null when it cannot be read.
function deviceLanguage(localization) {
  try {
    const L = localization || require('expo-localization');
    const code = (L.getLocales && L.getLocales()[0] && L.getLocales()[0].languageCode) || null;
    return code ? String(code).toLowerCase() : null;
  } catch { return null; }
}

async function readStoredLanguage(storage) {
  try {
    const S = storage || require('@react-native-async-storage/async-storage').default;
    return await S.getItem(LANGUAGE_KEY);
  } catch { return null; }
}

// The app language right now: the stored choice, else the phone's language, else English.
async function readAppLanguage(storage, localization) {
  return resolveLanguage(await readStoredLanguage(storage), deviceLanguage(localization));
}

module.exports = { LANGUAGE_KEY, SUPPORTED, resolveLanguage, deviceLanguage, readStoredLanguage, readAppLanguage };
