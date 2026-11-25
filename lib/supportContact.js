// The support contact of Ajustes › Suporte › "Fale conosco", shared with the reminder conversation's
// "Fale conosco" (docs/specs/reminder-not-arriving.md RN-10, founder 2026-11-24): one address, one
// subject, so both doors reach the team the same way.
import { Linking } from 'react-native';

export const SUPPORT_MAIL_URL = 'mailto:hello@dosetrace.io?subject=DoseTrace Support';

export function openSupportContact() {
  return Linking.openURL(SUPPORT_MAIL_URL).catch(() => {});
}
