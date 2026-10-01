import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Platform, StatusBar, Linking, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, signInWithGoogle, signInWithApple, sendPasswordReset, emailConfirmRedirectUrl } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { friendlyError } from '../lib/friendlyError';
import { Analytics } from '../lib/analytics';
import { loadOnboarding } from '../lib/onboardingStore';
import Svg, { Path } from 'react-native-svg';
import FeatureIcon from '../components/FeatureIcon';
import CheckMark from '../components/CheckMark';

const PRIVACY_URL = 'https://dosetrace.io/privacy-policy';

// Back arrow (Graduated): a drawn monoline chevron in ink, never a font glyph.
function BackChevron({ color }) {
  return (
    <Svg width={11} height={18} viewBox="0 0 10 16">
      <Path d="M8 2 L2 8 L8 14" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Google's "G" mark. Brand marks keep their official colors on purpose (Google
// sign-in branding guidelines) — the only fixed colors on this screen.
function GoogleMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

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
      buttonType={AA.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={isDark ? AA.AppleAuthenticationButtonStyle.WHITE : AA.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={26}
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
export default function AuthScreen({ onBack }) {
  const { t, language } = useLanguage();
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  // There must always be a way back to the welcome/intro (founder rule): a visible
  // arrow + Android hardware/swipe back. onBack returns to OnboardingFlowScreen.
  useEffect(() => {
    if (!onBack) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => sub.remove();
  }, [onBack]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignIn, setIsSignIn] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0); // seconds until resend allowed again
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
      // If the project auto-confirms email, signUp returns a session and
      // onAuthStateChange signs the user straight in — DON'T show the
      // "check your email" screen in that case (App.js routes on the session).
      if (result.data?.session) return;
      setSignupDone(true);
    }
  }

  // Open the device mail app so the user can find the confirmation link.
  function openMailApp() {
    const url = Platform.OS === 'ios' ? 'message://' : 'mailto:';
    Linking.openURL(url).catch(() => Linking.openURL('mailto:').catch(() => {}));
  }

  // Resend the signup confirmation email (with a 30s cooldown to avoid spam).
  async function handleResend() {
    if (resendCooldown > 0) return;
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: emailConfirmRedirectUrl() } });
    if (error) { Alert.alert(t('error'), friendlyError(error, t)); return; }
    Alert.alert(t('signup_resent'), t('onboarding_confirm_msg').replace('{email}', email.trim()));
    setResendCooldown(30);
    const iv = setInterval(() => setResendCooldown((s) => { if (s <= 1) { clearInterval(iv); return 0; } return s - 1; }), 1000);
  }

  // ---- Views ---- (Graduated: docs/design/prototype.html authScreen())
  const backRow = onBack ? (
    <View style={s.navRow}>
      <TouchableOpacity style={s.backBtn} onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel={t('back')}>
        <BackChevron color={colors.ink} />
      </TouchableOpacity>
    </View>
  ) : null;

  if (signupDone) {
    // The email is set in ink inside the sentence; the words stay the key's own.
    const confirmParts = t('onboarding_confirm_msg').split('{email}');
    return (
      <SafeAreaView style={s.container}>
        <ScrollView style={s.scroll} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {backRow}
          <View style={s.confirmHead}>
            <View style={s.okBadge}><CheckMark size={34} color={colors.onInk} strokeWidth={2.4} /></View>
            <Text style={[s.title, s.titleCenter]}>{t('onboarding_confirm_title')}</Text>
            <Text style={[s.sub, s.textCenter]}>
              {confirmParts.map((part, i) => (
                <Text key={i}>
                  {part}
                  {i < confirmParts.length - 1 && <Text style={s.subStrong}>{email.trim()}</Text>}
                </Text>
              ))}
            </Text>
            <Text style={[s.hint, s.textCenter]}>{t('onboarding_confirm_hint')}</Text>
          </View>
          {/* Lead with the actual next step (open the email), then resend / fix a
              typo, and keep sign-in as the last step for when they come back. */}
          <View style={s.confirmActs}>
            <TouchableOpacity style={s.primaryBtn} onPress={openMailApp}>
              <Text style={s.primaryBtnText}>{t('signup_open_email')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={handleResend} disabled={resendCooldown > 0}>
              <Text style={[s.secondaryBtnText, resendCooldown > 0 && s.secondaryBtnTextDim]}>
                {resendCooldown > 0 ? `${t('signup_resend')} (${resendCooldown})` : t('signup_resend')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={() => { setSignupDone(false); setIsSignIn(true); setPassword(''); }}>
              <Text style={s.secondaryBtnText}>{t('onboarding_go_signin')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.linkBtnCenter} onPress={() => { setSignupDone(false); setIsSignIn(false); setPassword(''); }}>
              <Text style={s.linkText}>{t('signup_wrong_email')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView style={s.scroll} contentContainerStyle={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {backRow}
        {!isSignIn ? (
          <View style={s.head}>
            <FeatureIcon name="curve" size={48} color={colors.data} />
            <Text style={s.title}>{t('onboarding_ready_title')}</Text>
            <Text style={s.sub}>{t('onboarding_getstarted_sub')}</Text>
          </View>
        ) : (
          <View style={s.head}>
            <Text style={s.title}>{t('onboarding_signin_title')}</Text>
            <Text style={s.sub}>{t('onboarding_signin')}</Text>
          </View>
        )}

        {/* Apple / Google keep their brand-guideline looks (fixed colors on purpose). */}
        <View style={s.socials}>
          <AppleSignInButton onPress={handleAppleSignIn} isDark={isDark} style={s.appleBtn} />
          <TouchableOpacity style={[s.googleBtn, isDark ? s.googleBtnDark : s.googleBtnLight, loading && s.busy]} onPress={handleGoogleSignIn} disabled={loading}>
            <GoogleMark />
            <Text style={[s.googleBtnText, isDark ? s.googleBtnTextDark : s.googleBtnTextLight]}>{loading ? t('loading') : t('onboarding_google_signin')}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.orDivider}><View style={s.orLine} /><Text style={s.orText}>{t('onboarding_or')}</Text><View style={s.orLine} /></View>

        <View style={s.field}>
          <Text style={s.fieldLabel}>{t('onboarding_email')}</Text>
          <TextInput style={s.input} accessibilityLabel={t('onboarding_email')} placeholderTextColor={colors.ink3} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        </View>
        <View style={s.field}>
          <Text style={s.fieldLabel}>{t('onboarding_password')}</Text>
          <TextInput style={s.input} accessibilityLabel={t('onboarding_password')} placeholderTextColor={colors.ink3} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} />
        </View>

        {isSignIn && (
          <TouchableOpacity style={s.forgotBtn} onPress={handleForgotPassword}>
            <Text style={s.linkText}>{t('forgot_password')}</Text>
          </TouchableOpacity>
        )}

        {/* Consent only when the intro didn't already stash it (returning-user create). */}
        {!isSignIn && !hasStash && (
          <TouchableOpacity style={s.consentRow} onPress={() => setConsentGiven((v) => !v)} activeOpacity={0.7} accessibilityRole="checkbox" accessibilityState={{ checked: consentGiven }}>
            <View style={[s.checkbox, consentGiven && s.checkboxOn]}>
              {consentGiven && <CheckMark size={16} color={colors.onInk} />}
            </View>
            <Text style={s.consentText}>
              {t('auth_agree_terms')}{' '}
              <Text style={s.consentLink} onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}>
                {t('settings_privacy_policy')}
              </Text>
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[s.primaryBtn, loading && s.busy]} onPress={handleAuth} disabled={loading}>
          <Text style={s.primaryBtnText}>
            {loading ? t('loading') : (isSignIn ? t('onboarding_signin') : t('onboarding_create_account'))}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.linkBtnCenter} onPress={() => { setIsSignIn((v) => !v); setPassword(''); }}>
          <Text style={s.linkText}>
            {isSignIn ? t('onboarding_create_account') : t('onboarding_already_have_account')}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Graduated (DESIGN.md §2–§5): ground screen, ink text in three steps, one ink
// capsule action, well inputs (radius 16), underlined ink text links, no blue
// except the data icon. Theme tokens only — the Google button's brand colors
// are the one deliberate exception (Google sign-in branding guidelines).
const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.ground, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 0 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 14, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  navRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center' },
  backBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  head: { gap: 8, paddingTop: 4 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '600', color: c.ink, letterSpacing: -0.64 },
  titleCenter: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6, textAlign: 'center' },
  textCenter: { textAlign: 'center' },
  sub: { fontSize: 17, lineHeight: 22, color: c.ink2 },
  subStrong: { color: c.ink, fontWeight: '700' },
  hint: { fontSize: 13, lineHeight: 18, color: c.ink3 },
  socials: { gap: 10, paddingTop: 6 },
  appleBtn: { height: 52 },
  googleBtn: { minHeight: 52, borderRadius: 26, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
  googleBtnLight: { backgroundColor: '#FFFFFF', borderColor: '#747775' },
  googleBtnDark: { backgroundColor: '#131314', borderColor: '#8E918F' },
  googleBtnText: { fontSize: 17, fontWeight: '600' },
  googleBtnTextLight: { color: '#1F1F1F' },
  googleBtnTextDark: { color: '#E3E3E3' },
  busy: { opacity: 0.6 },
  orDivider: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  orLine: { flex: 1, height: 1, backgroundColor: c.line },
  orText: { fontSize: 13, color: c.ink2 },
  field: { gap: 10 },
  fieldLabel: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },
  input: { minHeight: 52, borderRadius: 16, backgroundColor: c.well, borderWidth: 1, borderColor: c.line, paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, color: c.ink },
  forgotBtn: { alignSelf: 'flex-end', minHeight: 40, justifyContent: 'center' },
  linkBtnCenter: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  linkText: { fontSize: 17, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick, textAlign: 'center' },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 4, paddingHorizontal: 2 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: c.tick, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: c.ink, borderColor: c.ink },
  consentText: { flex: 1, fontSize: 15, lineHeight: 20, color: c.ink2 },
  consentLink: { color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  primaryBtn: { minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryBtnText: { fontSize: 17, fontWeight: '700', color: c.onAct },
  secondaryBtn: { minHeight: 50, borderRadius: 25, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryBtnText: { fontSize: 17, fontWeight: '700', color: c.ink },
  secondaryBtnTextDim: { color: c.ink3 },
  confirmHead: { alignItems: 'center', gap: 14, paddingTop: 18, paddingHorizontal: 8 },
  okBadge: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.ok, alignItems: 'center', justifyContent: 'center' },
  confirmActs: { gap: 10, paddingTop: 10 },
});
