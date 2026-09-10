import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Platform, StatusBar, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, signInWithGoogle, signInWithApple, sendPasswordReset, emailConfirmRedirectUrl } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { friendlyError } from '../lib/friendlyError';
import { Analytics } from '../lib/analytics';
import { loadOnboarding } from '../lib/onboardingStore';
import FeatureIcon from '../components/FeatureIcon';

const PRIVACY_URL = 'https://dosetrace.io/privacy-policy';

// Apple's native module doesn't exist on Android; resolve lazily and only on iOS.
let _appleAuth;
function getAppleAuth() {
  if (Platform.OS !== 'ios') return null;
  if (_appleAuth === undefined) {
    try { _appleAuth = require('expo-apple-authentication'); } catch { _appleAuth = null; }
  }
  return _appleAuth;
}
function AppleSignInButton({ onPress, isDark, style }) {
  const AA = getAppleAuth();
  if (!AA?.AppleAuthenticationButton) return null;
  return (
    <AA.AppleAuthenticationButton
      buttonType={AA.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={isDark ? AA.AppleAuthenticationButtonStyle.WHITE : AA.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={12}
      style={style}
      onPress={onPress}
    />
  );
}

/**
 * The account gate — sign in or create an account. This is the ONLY auth screen.
 * The value-first intro (OnboardingFlowScreen) collects the profile + consent and
 * stashes it locally, then hands off here; this screen reads that stash for the
 * sign-up metadata (social sign-ups get it via applyPendingProfile on SIGNED_IN).
 *
 * Defaults to the create view when the intro just ran (stash present), else to
 * sign-in (a returning, signed-out user). A consent checkbox appears only when
 * no consent was stashed (e.g. a returning user creating a brand-new account),
 * so account creation always has a lawful basis and never dead-ends.
 */
export default function AuthScreen() {
  const { t, language } = useLanguage();
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignIn, setIsSignIn] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [hasStash, setHasStash] = useState(false);

  // Stash-derived signup payload (never rendered as fields — the intro collected it).
  const [stash, setStash] = useState(null);
  const [consentGiven, setConsentGiven] = useState(false);

  useEffect(() => {
    let active = true;
    loadOnboarding().then((d) => {
      if (!active) return;
      // loadOnboarding() returns {} (not null) on an empty/cleared stash, so test
      // meaningful keys — a cleared stash (post sign-out/delete) must read as "no
      // stash" or the consent checkbox never renders and create dead-ends.
      const real = !!(d && (d.consent_accepted || d.display_name || d.primary_goal || d.gender || d.birth_year));
      setStash(real ? d : null);
      setHasStash(real);
      if (real && d.consent_accepted) setConsentGiven(true);
      // Intro just ran (real stash with consent) → create view; otherwise sign-in.
      setIsSignIn(!(real && d.consent_accepted));
    }).catch(() => { if (active) setIsSignIn(true); });
    return () => { active = false; };
  }, []);

  async function handleGoogleSignIn() {
    setLoading(true);
    try {
      const { error, canceled } = await signInWithGoogle();
      if (canceled) return;
      if (error) Alert.alert(t('error'), friendlyError(error, t, 'auth_signin_failed'));
    } catch (e) {
      Alert.alert(t('error'), friendlyError(e, t));
    } finally {
      setLoading(false);
    }
  }

  async function handleAppleSignIn() {
    setLoading(true);
    const { error, canceled } = await signInWithApple();
    setLoading(false);
    if (canceled) return;
    if (error) Alert.alert(t('error'), friendlyError(error, t));
  }

  async function handleForgotPassword() {
    const trimmed = email.trim();
    if (!trimmed) { Alert.alert(t('error'), t('forgot_password_enter_email')); return; }
    setLoading(true);
    const { error } = await sendPasswordReset(trimmed);
    setLoading(false);
    if (error) Alert.alert(t('error'), friendlyError(error, t));
    else Alert.alert(t('forgot_password_sent_title'), t('forgot_password_sent_msg').replace('{email}', trimmed));
  }

  async function handleAuth() {
    if (!email.trim() || !password.trim()) { Alert.alert(t('error'), t('auth_missing_fields')); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { Alert.alert(t('error'), t('auth_invalid_email')); return; }
    if (!isSignIn && password.trim().length < 6) { Alert.alert(t('error'), t('auth_password_too_short')); return; }
    if (!isSignIn && !consentGiven) { Alert.alert(t('error'), t('consent_required')); return; }
    setLoading(true);
    let result;
    if (isSignIn) {
      result = await supabase.auth.signInWithPassword({ email: email.trim(), password: password.trim() });
    } else {
      const d = stash || {};
      result = await supabase.auth.signUp({
        email: email.trim(),
        password: password.trim(),
        options: {
          emailRedirectTo: emailConfirmRedirectUrl(),
          data: {
            tracking_types: Array.isArray(d.tracking_types) ? d.tracking_types : [],
            onboarded_at: new Date().toISOString(),
            consent_accepted: true,
            consent_date: d.consent_date || new Date().toISOString(),
            display_name: d.display_name || null,
            gender: d.gender || null,
            birth_month: d.birth_month != null ? d.birth_month : null, // stash is 1-based (matches fieldPresent)
            birth_year: d.birth_year != null ? d.birth_year : null,
            country: d.country || null,
            primary_goal: d.primary_goal || null,
            activity_level: d.activity_level || null,
            has_provider: d.has_provider || null,
          },
        },
      });
    }
    setLoading(false);
    if (result.error) {
      Alert.alert(t('error'), friendlyError(result.error, t));
    } else if (!isSignIn) {
      // Supabase obfuscates a duplicate signup as a user with empty identities.
      const identities = result.data?.user?.identities;
      if (Array.isArray(identities) && identities.length === 0) {
        Alert.alert(t('signup_email_exists_title'), t('signup_email_exists_msg'));
        setIsSignIn(true);
        setPassword('');
        return;
      }
      Analytics.onboardingCompleted({
        trackingTypes: Array.isArray(stash?.tracking_types) ? stash.tracking_types : [],
        language,
        region: Intl?.DateTimeFormat?.()?.resolvedOptions?.()?.timeZone || null,
      });
      setSignupDone(true);
    }
  }

  // ---- Views ----
  if (signupDone) {
    return (
      <SafeAreaView style={s.container}>
        <ScrollView style={s.scroll} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          <Text style={s.title}>{t('onboarding_confirm_title')}</Text>
          <Text style={[s.sub, { marginBottom: 8 }]}>{t('onboarding_confirm_msg').replace('{email}', email.trim())}</Text>
          <Text style={[s.sub, { fontSize: 13, color: colors.textFaint, marginBottom: 24 }]}>{t('onboarding_confirm_hint')}</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => { setSignupDone(false); setIsSignIn(true); setPassword(''); }}>
            <Text style={s.primaryBtnText}>{t('onboarding_go_signin')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView style={s.scroll} contentContainerStyle={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {!isSignIn ? (
          <>
            <View style={s.hero}><FeatureIcon name="curve" size={48} color={colors.accent} /></View>
            <Text style={s.title}>{t('onboarding_ready_title')}</Text>
            <Text style={s.sub}>{t('onboarding_getstarted_sub')}</Text>
          </>
        ) : (
          <>
            <Text style={s.title}>{t('onboarding_signin_title')}</Text>
            <Text style={s.sub}>{t('onboarding_signin')}</Text>
          </>
        )}

        <TouchableOpacity style={[s.googleBtn, loading && { opacity: 0.6 }]} onPress={handleGoogleSignIn} disabled={loading}>
          <Text style={s.googleBtnIcon}>G</Text>
          <Text style={s.googleBtnText}>{loading ? t('loading') : t('onboarding_google_signin')}</Text>
        </TouchableOpacity>
        <AppleSignInButton onPress={handleAppleSignIn} isDark={isDark} style={s.appleBtn} />

        <View style={s.orDivider}><View style={s.orLine} /><Text style={s.orText}>{t('onboarding_or')}</Text><View style={s.orLine} /></View>

        <TextInput style={s.input} placeholder={t('onboarding_email')} placeholderTextColor={colors.textFaint} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <TextInput style={s.input} placeholder={t('onboarding_password')} placeholderTextColor={colors.textFaint} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} />

        {isSignIn && (
          <TouchableOpacity onPress={handleForgotPassword}>
            <Text style={s.forgotPassword}>{t('forgot_password')}</Text>
          </TouchableOpacity>
        )}

        {/* Consent only when the intro didn't already stash it (returning-user create). */}
        {!isSignIn && !hasStash && (
          <TouchableOpacity style={s.consentRow} onPress={() => setConsentGiven((v) => !v)} activeOpacity={0.7}>
            <View style={[s.checkbox, consentGiven && s.checkboxOn]}>
              {consentGiven && <Text style={s.checkboxTick}>✓</Text>}
            </View>
            <Text style={s.consentText}>
              {t('auth_agree_terms')}{' '}
              <Text style={s.consentLink} onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}>
                {t('settings_privacy_policy')}
              </Text>
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[s.primaryBtn, loading && { opacity: 0.6 }]} onPress={handleAuth} disabled={loading}>
          <Text style={s.primaryBtnText}>
            {loading ? t('loading') : (isSignIn ? t('onboarding_signin') : t('onboarding_create_account'))}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.switchBtn} onPress={() => { setIsSignIn((v) => !v); setPassword(''); }}>
          <Text style={s.switchBtnText}>
            {isSignIn ? t('onboarding_create_account') : t('onboarding_already_have_account')}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 0 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 24, paddingTop: 32 },
  hero: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '700', color: c.text, marginBottom: 12, lineHeight: 34 },
  sub: { fontSize: 15, color: c.textMuted, lineHeight: 24, marginBottom: 28 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 12, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.card, marginBottom: 16, gap: 10 },
  googleBtnIcon: { fontSize: 20, fontWeight: '700', color: '#4285F4' },
  googleBtnText: { fontSize: 16, fontWeight: '600', color: c.text },
  appleBtn: { height: 52, marginBottom: 16 },
  orDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: c.border },
  orText: { fontSize: 13, color: c.textFaint, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, fontSize: 15, color: c.text, marginBottom: 14, backgroundColor: c.card2 },
  forgotPassword: { fontSize: 13, color: c.accent, textAlign: 'right', marginBottom: 16, marginTop: -6 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16, marginTop: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxOn: { backgroundColor: c.accent, borderColor: c.accent },
  checkboxTick: { color: c.accentText, fontSize: 14, fontWeight: '700' },
  consentText: { flex: 1, fontSize: 13, color: c.textMuted, lineHeight: 19 },
  consentLink: { color: c.accent, fontWeight: '600' },
  primaryBtn: { backgroundColor: c.accent, padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: c.accentText, fontSize: 16, fontWeight: '600' },
  switchBtn: { padding: 12, alignItems: 'center' },
  switchBtnText: { fontSize: 14, color: c.accent },
});
