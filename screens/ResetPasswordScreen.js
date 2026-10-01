/**
 * Shown when the app is opened from a password-reset email link.
 *
 * The link deep-links into the app (see sendPasswordReset) and App.js exchanges
 * the PKCE code for a session BEFORE rendering this screen — which is what makes
 * updateUser({ password }) permitted here. Without this screen the reset link
 * dead-ended on the marketing site.
 */
import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { supabase } from '../lib/supabase';

export default function ResetPasswordScreen({ onDone }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function save() {
    if (password.length < 6) {
      Alert.alert(t('error'), t('auth_password_too_short'));
      return;
    }
    if (password !== confirm) {
      Alert.alert(t('error'), t('reset_pw_mismatch'));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      Alert.alert(t('error'), error.message);
      return;
    }
    Alert.alert(t('reset_pw_done_title'), t('reset_pw_done_msg'), [
      { text: 'OK', onPress: () => onDone && onDone() },
    ]);
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

          <View style={s.field}>
            <Text style={s.label}>{t('reset_pw_new')}</Text>
            <TextInput
              style={s.input}
              accessibilityLabel={t('reset_pw_new')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              placeholderTextColor={colors.ink3}
            />
          </View>

          <View style={s.field}>
            <Text style={s.label}>{t('reset_pw_confirm')}</Text>
            <TextInput
              style={s.input}
              accessibilityLabel={t('reset_pw_confirm')}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              placeholderTextColor={colors.ink3}
            />
          </View>

          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={save}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={colors.onAct} />
              : <Text style={s.btnText}>{t('reset_pw_save')}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Graduated (prototype.html authScreen() 'reset'): large title, ink2 sentence,
// labelled well inputs (radius 16), one ink capsule action. Theme tokens only.
const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.ground },
  flex: { flex: 1 },
  body: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 24, gap: 14, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '600', color: c.ink, letterSpacing: -0.6 },
  sub: { fontSize: 17, lineHeight: 22, color: c.ink2 },
  field: { gap: 10 },
  label: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },
  input: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: c.well,
    borderWidth: 1,
    borderColor: c.line,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 17,
    color: c.ink,
  },
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
