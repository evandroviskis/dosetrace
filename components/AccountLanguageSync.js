// A-163: keeps the account's language (user_metadata.language) equal to the app's, so a message
// from the DoseTrace team arrives with its title in the person's language — on start and on every
// language change, only when it differs (lib/accountLanguage). A React effect, never inside
// onAuthStateChange (which stays synchronous). Also (re)names the Android "team-messages"
// notification channel in the app language. Renders nothing.
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { supabase } from '../lib/supabase';
import { syncAccountLanguage } from '../lib/accountLanguage';
import { teamChannelRequest } from '../lib/teamMessages';

export default function AccountLanguageSync({ userId }) {
  const { language, ready, t } = useLanguage();

  useEffect(() => {
    if (!ready || !userId) return;
    syncAccountLanguage({
      language,
      getUser: async () => {
        const { data } = await supabase.auth.getSession();
        const u = data && data.session && data.session.user;
        return u && u.id === userId ? u : null; // never write for an account that is not this one
      },
      updateUser: (p) => supabase.auth.updateUser(p),
    }).catch(() => {});
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
