import { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { translations, LANGUAGES } from './translations';

const LanguageContext = createContext({
  language: 'en',
  setLanguage: () => {},
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
  }, []);

  function setLanguage(code) {
    setLanguageState(code);
    AsyncStorage.setItem('dosetrace_language', code).catch(() => {});
  }

  function t(key) {
    return translations[language]?.[key] || translations['en']?.[key] || key;
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}