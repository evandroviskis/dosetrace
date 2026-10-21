import { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { translations, LANGUAGES } from './translations';
import { resolveLanguage, deviceLanguage, LANGUAGE_KEY } from '../lib/appLanguage';

const LanguageContext = createContext({
  language: 'en',
  setLanguage: () => {},
  timeFormat: 'auto',
  setTimeFormat: () => {},
  t: (key) => key,
  LANGUAGES: [],
});

// DV-196: the one language rule (lib/appLanguage) — the stored choice, else the phone's language
// (expo-localization, which works under the New Architecture) — shared with every notification
// path, so a reminder speaks the language the app shows.

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState('en');
  // 'auto' follows the language (English → AM/PM, others → 24h); '12h'/'24h' force it.
  const [timeFormat, setTimeFormatState] = useState('auto');
  // A-135: true once the stored language was read, so the opening never draws English first.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_KEY)
      .then(saved => {
        setLanguageState(resolveLanguage(saved, deviceLanguage(Localization)));
      })
      .catch(() => setLanguageState('en'))
      .finally(() => setReady(true));
    AsyncStorage.getItem('dosetrace_time_format')
      .then(saved => {
        if (saved === '12h' || saved === '24h' || saved === 'auto') setTimeFormatState(saved);
      })
      .catch(() => {});
  }, []);

  // DV-050 (DL-13): a new language re-plans every scheduled notification (and renames the Android
  // channels) once it is stored, so pending reminders never keep the old language.
  function setLanguage(code) {
    setLanguageState(code);
    AsyncStorage.setItem(LANGUAGE_KEY, code)
      .catch(() => {})
      .then(() => require('../lib/notifications').onAppLanguageChanged())
      .catch(() => {});
  }

  function setTimeFormat(fmt) {
    setTimeFormatState(fmt);
    AsyncStorage.setItem('dosetrace_time_format', fmt).catch(() => {});
  }

  function t(key) {
    return translations[language]?.[key] || translations['en']?.[key] || key;
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, timeFormat, setTimeFormat, t, LANGUAGES, ready }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
