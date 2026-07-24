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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
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
        <View style={s.body}>
          <Text style={s.title}>{t('reset_pw_title')}</Text>
          <Text style={s.sub}>{t('reset_pw_sub')}</Text>

          <Text style={s.label}>{t('reset_pw_new')}</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            placeholder="••••••••"
            placeholderTextColor={colors.textFaint}
          />

          <Text style={s.label}>{t('reset_pw_confirm')}</Text>
          <TextInput
            style={s.input}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            placeholder="••••••••"
            placeholderTextColor={colors.textFaint}
          />

          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={save}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={colors.accentText} />
              : <Text style={s.btnText}>{t('reset_pw_save')}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },
  body: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: c.text, marginBottom: 6 },
  sub: { fontSize: 14, color: c.textMuted, lineHeight: 20, marginBottom: 28 },
  label: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: c.card,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: c.text,
    marginBottom: 18,
  },
  btn: {
    backgroundColor: c.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: c.accentText, fontSize: 16, fontWeight: '600' },
});
