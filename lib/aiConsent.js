// AI-extraction consent gate (App Review 5.1.1(i)/5.1.2(i)).
//
// Apple requires that BEFORE any user file is sent to a third-party AI
// service the app must (1) say what is sent, (2) name the recipient, and
// (3) obtain the user's permission. This module shows that dialog and
// remembers acceptance, so the user is asked once — not on every upload.
// Both AI features (lab-report extraction and vaccine-card scanning) share
// the same processor and the same consent.

import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CONSENT_KEY = 'dosetrace_ai_extraction_consent_v1';
const PRIVACY_URL = 'https://dosetrace.io/privacy-policy';

export async function hasAIConsent() {
  try {
    return (await AsyncStorage.getItem(CONSENT_KEY)) === 'granted';
  } catch {
    return false;
  }
}

// Resolves true only after the user has explicitly agreed (now or earlier).
// "View privacy policy" opens the policy and keeps the flow cancelled — the
// user re-triggers the action and consents with full information.
export function requestAIConsent(t) {
  return new Promise(resolve => {
    hasAIConsent().then(granted => {
      if (granted) { resolve(true); return; }
      Alert.alert(
        t('ai_consent_title'),
        t('ai_consent_body'),
        [
          {
            text: t('ai_consent_privacy'),
            onPress: () => { Linking.openURL(PRIVACY_URL).catch(() => {}); resolve(false); },
          },
          { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
          {
            text: t('ai_consent_agree'),
            onPress: async () => {
              try { await AsyncStorage.setItem(CONSENT_KEY, 'granted'); } catch {}
              resolve(true);
            },
          },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  });
}
