/**
 * Shown when the app is opened from a password-reset email link.
 *
 * The link deep-links into the app (see sendPasswordReset) and App.js exchanges
 * the PKCE code for a session BEFORE rendering this screen — which is what makes
 * updateUser({ password }) permitted here. Without this screen the reset link
 * dead-ended on the marketing site.
 *
 * Graduated (prototype authScreen 'reset', docs/specs/premium-and-auth.md PA-60/61/65):
 * every message is a DoseTrace sheet in the user's language — never the raw server text,
 * never a hard-coded English button.
 */
import { useState, useMemo } from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { validateNewPassword, newPasswordValue, authErrorMessage } from '../lib/authFlow';
import { saveRecoveryPassword } from '../lib/recoveryLink';
import AuthField from '../components/AuthField';
import { DTSheet } from './components/ProtocolParts';

// recovery: the link's pending session (lib/recoveryLink). The account the app may be signed
// in to is untouched until the new password is saved (PA-76).
export default function ResetPasswordScreen({ recovery, onDone }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState(null);

  const errorSheet = (body) => setSheet({ icon: 'alert', title: t('error'), body, buttons: [{ label: t('ok'), kind: 'primary' }] });

  async function save() {
    if (loading) return;
    const bad = validateNewPassword(password, confirm);
    if (bad) { errorSheet(t(bad.key)); return; }
    setLoading(true);
    const res = await saveRecoveryPassword(recovery, newPasswordValue(password));
    setLoading(false);
    if (res.error) {
      errorSheet(authErrorMessage(res.error, t, 'reset'));
      return;
    }
    // The password is saved and the app is signed in with it (or, if that last step
    // failed, the user signs in with it). Done (or closing the sheet) goes on.
    setSheet({
      icon: 'check',
      title: t('reset_pw_done_title'),
      body: t(res.signedIn === false ? 'reset_pw_done_signin' : 'reset_pw_done_msg'),
      done: true,
      buttons: [{ label: t('done'), kind: 'primary' }], // closing it (Done or the scrim) goes on — closeSheet
    });
  }

  function closeSheet() {
    const wasDone = sheet && sheet.done;
    setSheet(null);
    if (wasDone && onDone) setTimeout(onDone, 300);
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={s.flex}
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.title}>{t('reset_pw_title')}</Text>
          <Text style={s.sub}>{t('reset_pw_sub')}</Text>

          <AuthField
            label={t('reset_pw_new')}
            value={password}
            onChangeText={setPassword}
            password
            autoComplete="new-password"
            textContentType="newPassword"
            showLabel={t('auth_show_password')}
            hideLabel={t('auth_hide_password')}
          />
          <AuthField
            label={t('reset_pw_confirm')}
            value={confirm}
            onChangeText={setConfirm}
            password
            autoComplete="new-password"
            textContentType="newPassword"
            showLabel={t('auth_show_password')}
            hideLabel={t('auth_hide_password')}
          />

          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={save}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading
              ? <ActivityIndicator color={colors.onAct} />
              : <Text style={s.btnText}>{t('reset_pw_save')}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      <DTSheet config={sheet} onClose={closeSheet} />
    </SafeAreaView>
  );
}

// Graduated (prototype.html authScreen() 'reset'): large title, ink2 sentence,
// labelled well inputs (radius 16) with the eye, one ink capsule action. Theme tokens only.
const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.ground },
  flex: { flex: 1 },
  body: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 24, gap: 14, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '600', color: c.ink, letterSpacing: -0.6 },
  sub: { fontSize: 17, lineHeight: 22, color: c.ink2 },
  btn: {
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: c.act,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: c.onAct, fontSize: 17, fontWeight: '700' },
});
