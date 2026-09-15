import { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { translations, LANGUAGES } from './translations';

const LanguageContext = createContext({
  language: 'en',
  setLanguage: () => {},
  timeFormat: 'auto',
  setTimeFormat: () => {},
  t: (key) => key,
  LANGUAGES: [],
});

function getDeviceLanguage() {
  try {
    // expo-localization works under the New Architecture, where the legacy
    // NativeModules.SettingsManager path is often undefined
    const code = (Localization.getLocales()?.[0]?.languageCode || 'en').toLowerCase();
    const supported = LANGUAGES.map(l => l.code);
    return supported.includes(code) ? code : 'en';
  } catch {
    return 'en';
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState('en');
  // 'auto' follows the language (English → AM/PM, others → 24h); '12h'/'24h' force it.
  const [timeFormat, setTimeFormatState] = useState('auto');

  useEffect(() => {
    AsyncStorage.getItem('dosetrace_language')
      .then(saved => {
        if (saved) {
          setLanguageState(saved);
        } else {
          setLanguageState(getDeviceLanguage());
        }
      })
      .catch(() => setLanguageState('en'));
    AsyncStorage.getItem('dosetrace_time_format')
      .then(saved => {
        if (saved === '12h' || saved === '24h' || saved === 'auto') setTimeFormatState(saved);
      })
      .catch(() => {});
  }, []);

  function setLanguage(code) {
    setLanguageState(code);
    AsyncStorage.setItem('dosetrace_language', code).catch(() => {});
  }

  function setTimeFormat(fmt) {
    setTimeFormatState(fmt);
    AsyncStorage.setItem('dosetrace_time_format', fmt).catch(() => {});
  }

  function t(key) {
    return translations[language]?.[key] || translations['en']?.[key] || key;
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, timeFormat, setTimeFormat, t, LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
