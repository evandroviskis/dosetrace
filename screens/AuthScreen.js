import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Platform, StatusBar, Linking, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, signInWithGoogle, signInWithApple, sendPasswordReset, emailConfirmRedirectUrl } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { Analytics } from '../lib/analytics';
import { loadOnboarding, saveOnboarding, clearOnboarding, isStashFresh } from '../lib/onboardingStore';
import { signupMetadata } from '../lib/pendingProfile';
import { PRIVACY_URL } from '../lib/legalLinks';
import { GOOGLE_SANS_MEDIUM } from '../lib/fonts';
import { useFonts } from 'expo-font';
import { getAuthDraft, setAuthDraft } from '../lib/authDraft';
import { normalizeActivityLevel } from '../lib/activityLevels';
import {
  validateCredentials, signupNext, authErrorMessage, isNotConfirmed, consentParts,
  socialConsentPatch, initialAuthMode, initialConsent,
} from '../lib/authFlow';
import Svg, { Path } from 'react-native-svg';
import FeatureIcon from '../components/FeatureIcon';
import CheckMark from '../components/CheckMark';
import AuthField from '../components/AuthField';
import LegalModal from '../components/LegalModal';
import { DTSheet } from './components/ProtocolParts';


// Back arrow (Graduated): a drawn monoline chevron in ink, never a font glyph.
function BackChevron({ color }) {
  return (
    <Svg width={11} height={18} viewBox="0 0 10 16">
      <Path d="M8 2 L2 8 L8 14" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Google's "G" mark, the current colours of Google's own asset (Sign in with Google
// branding guidelines, updated 2026-07-07): #4285F4 / #34A853 / #FBBC04 / #E94235. Brand
// marks keep their official colours on purpose — the only fixed colours on this screen.
export const GOOGLE_G = { blue: '#4285F4', green: '#34A853', yellow: '#FBBC04', red: '#E94235' };
function GoogleMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path fill={GOOGLE_G.red} d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill={GOOGLE_G.blue} d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill={GOOGLE_G.yellow} d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill={GOOGLE_G.green} d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
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
// The system Sign in with Apple button (Apple HIG): black on light, white on dark, "Continue".
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
 * The account gate — sign in or create an account. This is the ONLY auth screen
 * (docs/specs/premium-and-auth.md PA-50…PA-59; prototype authScreen, approved from the
 * pictures 2026-10-03). The value-first intro (OnboardingFlowScreen) collects the profile
 * + consent and stashes it locally, then hands off here; this screen reads that stash for
 * the sign-up metadata (social sign-ups get it via applyPendingProfile on SIGNED_IN).
 *
 * initialMode: 'create' (from the last onboarding step) | 'signin' (from the welcome
 * screen) | undefined (a returning signed-out user: Create when the intro just finished).
 * The consent box starts ticked only for the person who ticked the four onboarding
 * confirmations in this run (lib/onboardingStore isStashFresh; prototype obcreate). Every
 * message is a DoseTrace sheet.
 */
export default function AuthScreen({ onBack, initialMode }) {
  const { t, language } = useLanguage();
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [mode, setMode] = useState(initialMode === 'create' || initialMode === 'signin' ? initialMode : null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // There must always be a way back to the welcome/intro (founder rule): a visible
  // arrow + Android hardware/swipe back. Back from Account created goes to Create.
  const [signupDone, setSignupDone] = useState(false);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (signupDone) { setSignupDone(false); return true; }
      if (onBack) { onBack(modeRef.current || 'signin'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [onBack, signupDone]);

  const [email, setEmailState] = useState(getAuthDraft);
  const setEmail = (v) => { setAuthDraft(v); setEmailState(v); };
  // Google's typeface is loaded here only, where its button is (not in the startup gate);
  // until it is ready the button text uses the system font for a moment.
  const [googleFont] = useFonts({ [GOOGLE_SANS_MEDIUM]: require('../assets/fonts/GoogleSans_500Medium.ttf') });
  const busyRef = useRef(false);
  // These answers were this person's when the first sign-up sent them; a corrected address
  // ("Wrong address? Go back") sends them again even though the device copy is gone.
  const usedFreshRef = useRef(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0); // seconds until resend allowed again
  const [sheet, setSheet] = useState(null);
  const [showTerms, setShowTerms] = useState(false);

  // Stash-derived signup payload (never rendered as fields — the intro collected it).
  const [stash, setStash] = useState(null);
  const [consentGiven, setConsentGiven] = useState(false);

  useEffect(() => {
    let active = true;
    loadOnboarding().then((d) => {
      if (!active) return;
      // loadOnboarding() returns {} (not null) on an empty/cleared stash.
      const real = !!(d && (d.consent_accepted || d.display_name || d.primary_goal || d.gender || d.birth_year));
      const st = real ? d : null;
      setStash(st);
      setMode((m) => m || initialAuthMode(initialMode, st));
      // The box is ticked only for the person who just confirmed the four onboarding
      // confirmations in this run; anyone else ticks it themselves (journey review).
      setConsentGiven(isStashFresh() && initialConsent(st));
    }).catch(() => { if (active) setMode((m) => m || 'signin'); });
    return () => { active = false; };
  }, []);

  const isSignIn = mode !== 'create';
  const errorSheet = (body, title) => setSheet({ icon: 'alert', title: title || t('error'), body, buttons: [{ label: t('ok'), kind: 'primary' }] });

  // Apple / Google: from Create account the consent box decides what a NEW account records
  // (PA-59). If the sign-in is cancelled or fails, the stash goes back to how it was.
  async function social(fn) {
    if (busyRef.current) return;
    busyRef.current = true;
    // Gate B: from Create account the box must be ticked for Apple / Google too — an account
    // is never created without the consent record (stopped before anything is written).
    if (mode === 'create' && !consentGiven) { busyRef.current = false; errorSheet(t('consent_required')); return; }
    const now = new Date().toISOString();
    const patch = socialConsentPatch({ mode, consent: consentGiven, stash, nowISO: now });
    const prior = stash ? { consent_accepted: !!stash.consent_accepted, consent_date: stash.consent_date || null } : { consent_accepted: false, consent_date: null };
    if (patch) await saveOnboarding(patch);
    setLoading(true);
    try {
      const { error, canceled } = await fn();
      if (canceled || error) { if (patch) await saveOnboarding(prior); }
      if (canceled) return;
      if (error) errorSheet(authErrorMessage(error, t, 'signin'));
    } catch (e) {
      if (patch) await saveOnboarding(prior);
      errorSheet(authErrorMessage(e, t, 'signin'));
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (busyRef.current) return;
    busyRef.current = true;
    const trimmed = email.trim();
    if (!trimmed) { busyRef.current = false; errorSheet(t('forgot_password_enter_email')); return; }
    setLoading(true);
    const { error } = await sendPasswordReset(trimmed);
    busyRef.current = false;
    setLoading(false);
    if (error) errorSheet(authErrorMessage(error, t, 'reset_request'));
    else setSheet({ icon: 'check', title: t('forgot_password_sent_title'), body: t('forgot_password_sent_msg').replace('{email}', trimmed), buttons: [{ label: t('ok'), kind: 'primary' }] });
  }

  // Resend the signup confirmation email (with a 30 s cooldown to avoid spam).
  const cooldownTimer = useRef(null);
  useEffect(() => () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); }, []);
  async function handleResend() {
    if (resendCooldown > 0) return;
    const addr = email.trim();
    const { error } = await supabase.auth.resend({ type: 'signup', email: addr, options: { emailRedirectTo: emailConfirmRedirectUrl() } });
    if (error) { errorSheet(authErrorMessage(error, t, 'signup')); return; }
    setSheet({ icon: 'check', title: t('signup_resent'), body: t('onboarding_confirm_msg').replace('{email}', addr), buttons: [{ label: t('ok'), kind: 'primary' }] });
    setResendCooldown(30);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => setResendCooldown((n) => { if (n <= 1) { clearInterval(cooldownTimer.current); cooldownTimer.current = null; return 0; } return n - 1; }), 1000);
  }

  async function handleAuth() {
    if (busyRef.current) return;
    busyRef.current = true;
    try { await doAuth(); } finally { busyRef.current = false; }
  }

  async function doAuth() {
    const bad = validateCredentials({ mode: isSignIn ? 'signin' : 'create', email, password, consent: consentGiven });
    if (bad) { errorSheet(t(bad.key)); return; }
    setLoading(true);
    let result;
    if (isSignIn) {
      result = await supabase.auth.signInWithPassword({ email: email.trim(), password: password.trim() });
      setLoading(false);
      if (result.error) {
        if (isNotConfirmed(result.error)) {
          // Never confirmed: offer the link again right here (PA-58).
          setSheet({
            icon: 'mail',
            title: t('error'),
            body: t('auth_email_not_confirmed'),
            buttons: [{ label: t('ok'), kind: 'secondary' }, { label: t('signup_resend'), kind: 'primary', onPress: handleResend }],
          });
        } else {
          errorSheet(authErrorMessage(result.error, t, 'signin'));
        }
      }
      return; // success: App.js routes on the new session
    }
    // The onboarding answers go into the new account only when they are this person's
    // (answered in this run — lib/pendingProfile); then they leave the device (PA-71).
    const fresh = isStashFresh() || usedFreshRef.current;
    result = await supabase.auth.signUp({
      email: email.trim(),
      password: password.trim(),
      options: {
        emailRedirectTo: emailConfirmRedirectUrl(),
        data: signupMetadata(stash, { fresh, nowISO: new Date().toISOString(), normalizeActivity: normalizeActivityLevel }),
      },
    });
    setLoading(false);
    const next = signupNext(result);
    if (next === 'error') { errorSheet(authErrorMessage(result && result.error, t, 'signup')); return; }
    if (next === 'exists') {
      // Explain and stay on Create account with the address kept (prototype create_taken).
      errorSheet(t('signup_email_exists_msg'), t('signup_email_exists_title'));
      setPassword('');
      return;
    }
    // Written into the account: clear the answers from the device (kept on this screen for a
    // corrected address via Wrong address? Go back).
    if (fresh) { usedFreshRef.current = true; clearOnboarding().catch(() => {}); }
    Analytics.onboardingCompleted({
      trackingTypes: Array.isArray(stash?.tracking_types) ? stash.tracking_types : [],
      language,
      region: Intl?.DateTimeFormat?.()?.resolvedOptions?.()?.timeZone || null,
    });
    // Auto-confirm returns a session and App.js signs the user straight in — no
    // "check your email" screen in that case.
    if (next === 'signed_in') return;
    setSignupDone(true);
  }

  // Open the device mail app so the user can find the confirmation link.
  function openMailApp() {
    const url = Platform.OS === 'ios' ? 'message://' : 'mailto:';
    Linking.openURL(url).catch(() => Linking.openURL('mailto:').catch(() => {}));
  }

  const switchMode = (m) => { setMode(m); setPassword(''); };

  // ---- Views ---- (Graduated: docs/design/prototype.html authScreen())
  const backRow = (onPress) => (
    <View style={s.navRow}>
      <TouchableOpacity style={s.backBtn} onPress={onPress} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel={t('back')}>
        <BackChevron color={colors.ink} />
      </TouchableOpacity>
    </View>
  );

  const sheets = (
    <>
      <DTSheet config={sheet} onClose={() => setSheet(null)} />
      <LegalModal visible={showTerms} onClose={() => setShowTerms(false)} title={t('settings_terms')} content={t('settings_terms_body')} doneLabel={t('done')} />
    </>
  );

  if (!mode) return <SafeAreaView style={s.container} />; // reading the stash (a few ms)

  if (signupDone) {
    // The email is set in ink inside the sentence; the words stay the key's own.
    const confirmParts = t('onboarding_confirm_msg').split('{email}');
    return (
      <SafeAreaView style={s.container}>
        <ScrollView style={s.scroll} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {backRow(() => setSignupDone(false))}
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
          {/* Lead with the actual next step (open the email), then resend / fix a typo,
              and keep sign-in as the last step for when they come back. */}
          <View style={s.confirmActs}>
            <TouchableOpacity style={s.primaryBtn} onPress={openMailApp} accessibilityRole="button">
              <Text style={s.primaryBtnText}>{t('signup_open_email')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={handleResend} disabled={resendCooldown > 0} accessibilityRole="button">
              <Text style={[s.secondaryBtnText, resendCooldown > 0 && s.secondaryBtnTextDim]}>
                {resendCooldown > 0 ? `${t('signup_resend')} (${resendCooldown})` : t('signup_resend')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={() => { setSignupDone(false); switchMode('signin'); }} accessibilityRole="button">
              <Text style={s.secondaryBtnText}>{t('onboarding_go_signin')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.linkBtnCenter} onPress={() => { setSignupDone(false); switchMode('create'); }} accessibilityRole="button">
              <Text style={s.linkText}>{t('signup_wrong_email')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        {sheets}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView style={s.scroll} contentContainerStyle={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {onBack ? backRow(() => onBack(mode)) : null}
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

        {/* Store-owned buttons follow the stores' rules (Apple HIG, Google branding). Apple first. */}
        <View style={s.socials}>
          <AppleSignInButton onPress={() => social(signInWithApple)} isDark={isDark} style={s.appleBtn} />
          <TouchableOpacity
            style={[s.googleBtn, isDark ? s.googleBtnDark : s.googleBtnLight, loading && s.busy]}
            onPress={() => social(signInWithGoogle)}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding_google_signin')}
          >
            <GoogleMark />
            <Text style={[s.googleBtnText, googleFont && s.googleBtnFont, isDark ? s.googleBtnTextDark : s.googleBtnTextLight]}>{t('onboarding_google_signin')}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.orDivider}><View style={s.orLine} /><Text style={s.orText}>{t('onboarding_or')}</Text><View style={s.orLine} /></View>

        <AuthField
          label={t('onboarding_email')}
          value={email}
          onChangeText={setEmail}
          email
          placeholder={t('auth_email_ph')}
          autoComplete="email"
          textContentType="emailAddress"
        />
        <AuthField
          label={t('onboarding_password')}
          value={password}
          onChangeText={setPassword}
          password
          autoComplete={isSignIn ? 'current-password' : 'new-password'}
          textContentType={isSignIn ? 'password' : 'newPassword'}
          showLabel={t('auth_show_password')}
          hideLabel={t('auth_hide_password')}
        />

        {isSignIn && (
          <TouchableOpacity style={s.forgotBtn} onPress={handleForgotPassword} accessibilityRole="button">
            <Text style={s.linkText}>{t('forgot_password')}</Text>
          </TouchableOpacity>
        )}

        {/* Create account always asks for consent, with BOTH documents linked (PA-63). */}
        {!isSignIn && (
          <TouchableOpacity style={s.consentRow} onPress={() => setConsentGiven((v) => !v)} activeOpacity={0.7} accessibilityRole="checkbox" accessibilityState={{ checked: consentGiven }}>
            <View style={[s.checkbox, consentGiven && s.checkboxOn]}>
              {consentGiven && <CheckMark size={16} color={colors.onInk} />}
            </View>
            <Text style={s.consentText}>
              {consentParts(t('auth_agree_terms_privacy')).map((p, i) => (
                p.link === 'terms' ? (
                  <Text key={i} style={s.consentLink} accessibilityRole="link" onPress={() => setShowTerms(true)}>{t('settings_terms')}</Text>
                ) : p.link === 'privacy' ? (
                  <Text key={i} style={s.consentLink} accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}>{t('settings_privacy_policy')}</Text>
                ) : (
                  <Text key={i}>{p.text}</Text>
                )
              ))}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[s.primaryBtn, loading && s.busy]} onPress={handleAuth} disabled={loading} accessibilityRole="button">
          <Text style={s.primaryBtnText}>
            {loading ? t('loading') : (isSignIn ? t('onboarding_signin_title') : t('onboarding_create_account'))}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.linkBtnCenter} onPress={() => switchMode(isSignIn ? 'create' : 'signin')} accessibilityRole="button">
          <Text style={s.linkText}>
            {isSignIn ? t('onboarding_create_account') : t('onboarding_already_have_account')}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
      {sheets}
    </SafeAreaView>
  );
}

// Graduated (DESIGN.md §2–§5): ground screen, ink text in three steps, one ink
// capsule action, well inputs (radius 16), underlined ink text links, no blue
// except the data icon. Theme tokens only — the Google button's colours and type are
// the deliberate exception (Sign in with Google branding guidelines, updated 2026-07-07:
// light #FFFFFF / stroke #747775 / text #1F1F1F, dark #131314 / #8E918F / #E3E3E3,
// Google Sans Medium, on iOS 16 pt before the G, 12 pt after it, 16 pt after the text).
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
  googleBtn: { minHeight: 52, borderRadius: 26, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingLeft: 16, paddingRight: 16 },
  googleBtnLight: { backgroundColor: '#FFFFFF', borderColor: '#747775' },
  googleBtnDark: { backgroundColor: '#131314', borderColor: '#8E918F' },
  googleBtnText: { fontSize: 17 },
  googleBtnFont: { fontFamily: GOOGLE_SANS_MEDIUM },
  googleBtnTextLight: { color: '#1F1F1F' },
  googleBtnTextDark: { color: '#E3E3E3' },
  busy: { opacity: 0.6 },
  orDivider: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  orLine: { flex: 1, height: 1, backgroundColor: c.line },
  orText: { fontSize: 13, color: c.ink2 },
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
