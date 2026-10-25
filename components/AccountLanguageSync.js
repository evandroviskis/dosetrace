// A-163: keeps the account's language (user_metadata.language) equal to the app's, so a message
// from the DoseTrace team arrives with its title in the person's language (lib/accountLanguage):
// on start only when the account has none (council 2026-10-22: two phones in two languages no
// longer overwrite each other), and on every language change the person makes. A React effect, never inside
// onAuthStateChange (which stays synchronous). Also (re)names the Android "team-messages"
// notification channel in the app language. Renders nothing.
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../i18n/LanguageContext';
import { supabase } from '../lib/supabase';
import { syncAccountLanguage, languageSyncMode, owedAfter, OWED_KEY } from '../lib/accountLanguage';
import { teamChannelRequest } from '../lib/teamMessages';

export default function AccountLanguageSync({ userId }) {
  const { language, ready, t } = useLanguage();
  const lastRef = useRef(null); // { userId, language } of the last run

  useEffect(() => {
    if (!ready || !userId) { lastRef.current = null; return; }
    const mode = languageSyncMode(lastRef.current, userId, language);
    lastRef.current = { userId, language };
    if (!mode) return;
    (async () => {
      // A change that could not reach the account (offline) still counts as a change next start.
      let owedUid = null;
      try { owedUid = await AsyncStorage.getItem(OWED_KEY); } catch { owedUid = null; }
      const owed = owedUid === userId;
      const r = await syncAccountLanguage({
        language,
        onlyIfMissing: mode === 'start' && !owed,
        getUser: async () => {
          const { data } = await supabase.auth.getSession();
          const u = data && data.session && data.session.user;
          return u && u.id === userId ? u : null; // never write for an account that is not this one
        },
        updateUser: (p) => supabase.auth.updateUser(p),
      });
      const next = owedAfter(owedUid, userId, mode === 'change' || owed, r);
      if (next === owedUid) return;
      if (next) await AsyncStorage.setItem(OWED_KEY, next); else await AsyncStorage.removeItem(OWED_KEY);
    })().catch(() => {});
  }, [language, userId, ready]);

  useEffect(() => {
    if (!ready || Platform.OS !== 'android') return;
    try {
      const N = require('expo-notifications');
      const req = teamChannelRequest(t, N.AndroidImportance);
      N.setNotificationChannelAsync(req.id, req.options).catch(() => {});
    } catch { /* expo-notifications unavailable */ }
  }, [language, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
