import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  StatusBar,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, signInWithGoogle, sendPasswordReset, emailConfirmRedirectUrl } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { Analytics } from '../lib/analytics';
import { storePendingReferral, redeemPendingReferral } from '../lib/referrals';
import { COUNTRIES, countryLabel } from '../lib/countries';
import { useTheme } from '../lib/theme';
import { friendlyError } from '../lib/friendlyError';

const STEPS = 7;

const BIRTH_YEARS = [];
const thisYear = new Date().getFullYear();
for (let y = thisYear - 18; y >= thisYear - 90; y--) BIRTH_YEARS.push(y);

const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr',
  'month_may', 'month_jun', 'month_jul', 'month_aug',
  'month_sep', 'month_oct', 'month_nov', 'month_dec',
];

export default function OnboardingScreen() {
  const { t, language, setLanguage, LANGUAGES } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignIn, setIsSignIn] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [referralCode, setReferralCode] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  // GDPR: analytics is opt-IN for a health app — default off
  const [analyticsConsent, setAnalyticsConsent] = useState(false);

  // Profile fields
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState('');
  const [birthMonth, setBirthMonth] = useState(null);
  const [birthYear, setBirthYear] = useState(null);
  const [country, setCountry] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState('');
  const [activityLevel, setActivityLevel] = useState('');
  const [hasProvider, setHasProvider] = useState('');

  const compoundTypes = [
    { key: 'peptides', label: t('onboarding_compound_peptides'), emoji: '🧪' },
    { key: 'hormones', label: t('onboarding_compound_hormones'), emoji: '💉' },
    { key: 'glp1', label: t('onboarding_compound_glp1'), emoji: '⚖️' },
    { key: 'oral', label: t('onboarding_compound_oral'), emoji: '💊' },
  ];

  function toggleType(key) {
    setSelectedTypes(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    const { error } = await signInWithGoogle();
    setLoading(false);
    if (error) {
      Alert.alert(t('error'), friendlyError(error, t));
    }
    // If successful, App.js auth listener will pick up the session automatically
  }

  async function handleForgotPassword() {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert(t('error'), t('forgot_password_enter_email'));
      return;
    }
    setLoading(true);
    // Sends a link that deep-links back INTO the app (see sendPasswordReset) —
    // not to the marketing site, which has no reset form.
    const { error } = await sendPasswordReset(trimmed);
    setLoading(false);
    if (error) {
      Alert.alert(t('error'), friendlyError(error, t));
    } else {
      Alert.alert(t('forgot_password_sent_title'), t('forgot_password_sent_msg').replace('{email}', trimmed));
    }
  }

  async function handleAuth() {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t('error'), t('auth_missing_fields'));
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      Alert.alert(t('error'), t('auth_invalid_email'));
      return;
    }
    if (!isSignIn && password.trim().length < 6) {
      Alert.alert(t('error'), t('auth_password_too_short'));
      return;
    }
    // Consent is required to create an account — never record it as accepted
    // unless the checkbox was actually checked.
    if (!isSignIn && !consentGiven) {
      Alert.alert(t('error'), t('consent_required'));
      return;
    }
    setLoading(true);
    let result;
    if (isSignIn) {
      result = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });
    } else {
      result = await supabase.auth.signUp({
        email: email.trim(),
        password: password.trim(),
        options: {
          // Without this the confirmation email links to the Site URL
          // (dosetrace.io) and the user gets no "confirmed" feedback.
          emailRedirectTo: emailConfirmRedirectUrl(),
          data: {
            tracking_types: selectedTypes,
            onboarded_at: new Date().toISOString(),
            consent_accepted: consentGiven,
            consent_date: new Date().toISOString(),
            analytics_opt_in: analyticsConsent,
            display_name: displayName.trim() || null,
            gender: gender || null,
            birth_month: birthMonth,
            birth_year: birthYear,
            country: country.trim() || null,
            primary_goal: primaryGoal || null,
            activity_level: activityLevel || null,
            has_provider: hasProvider || null,
          },
        },
      });
    }
    setLoading(false);
    if (result.error) {
      Alert.alert(t('error'), friendlyError(result.error, t));
    } else if (isSignIn) {
      // Session exists now — redeem any pending referral / ensure own code.
      // Best effort; App.js also runs this on SIGNED_IN.
      redeemPendingReferral().catch(() => {});
    } else {
      // Supabase obfuscates duplicate signups: it returns a user with an
      // empty identities array instead of an error. Guide the user to sign in.
      const identities = result.data?.user?.identities;
      if (Array.isArray(identities) && identities.length === 0) {
        Alert.alert(t('signup_email_exists_title'), t('signup_email_exists_msg'));
        setIsSignIn(true);
        setStep(6);
        setPassword('');
        return;
      }
      // With email confirmation enabled there is no session yet, so referral
      // writes would fail RLS. Stash the code; redeemPendingReferral() runs
      // once the user signs in with a real session.
      if (referralCode.trim().length === 6) {
        await storePendingReferral(referralCode.trim());
      }
      Analytics.onboardingCompleted({
        trackingTypes: selectedTypes,
        language,
        region: Intl?.DateTimeFormat?.()?.resolvedOptions?.()?.timeZone || null,
        referral_code: referralCode.trim() || null,
      });
      // Show confirmation message instead of staying on the form
      setSignupDone(true);
    }
  }

  const profileComplete = !!(displayName.trim() && gender && birthMonth !== null && birthYear && country.trim() && primaryGoal && activityLevel && hasProvider);

  // Steps with required input can't be advanced past via the top-nav "Next"
  function canAdvance() {
    if (step === 5) return profileComplete;
    if (step === 6 && !isSignIn) return consentGiven; // consent is mandatory
    return true;
  }

  function nextStep() {
    if (!canAdvance()) return;
    if (step < STEPS) setStep(step + 1);
  }

  function prevStep() {
    if (step > 1) setStep(step - 1);
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.progressBar}>
        {Array.from({ length: STEPS }).map((_, i) => (
          <View
            key={i}
            style={[s.progressSegment, i < step && s.progressSegmentActive]}
          />
        ))}
      </View>

      <View style={s.nav}>
        {step > 1 ? (
          <TouchableOpacity onPress={prevStep}>
            <Text style={s.navBack}>← {t('back')}</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 60 }} />}
        <Text style={s.navStep}>{step} / {STEPS}</Text>
        {step < STEPS ? (
          <TouchableOpacity onPress={nextStep} disabled={!canAdvance()}>
            <Text style={[s.navNext, !canAdvance() && { opacity: 0.35 }]}>{t('next')}</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 60 }} />}
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>

        {/* STEP 1 — WELCOME */}
        {step === 1 && (
          <View style={s.stepContent}>
            <Text style={s.bigEmoji}>💉</Text>
            <Text style={s.title}>{t('onboarding_welcome_title')}</Text>
            <Text style={s.sub}>{t('onboarding_welcome_sub')}</Text>
            <TouchableOpacity style={s.primaryBtn} onPress={nextStep}>
              <Text style={s.primaryBtnText}>{t('onboarding_welcome_btn')}</Text>
            </TouchableOpacity>
            {/* Returning from another device → jump straight to sign-in */}
            <TouchableOpacity
              style={s.signinLink}
              onPress={() => { setIsSignIn(true); setStep(6); }}
            >
              <Text style={s.signinLinkText}>{t('onboarding_already_have_account')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 2 — LANGUAGE */}
        {step === 2 && (
          <View style={s.stepContent}>
            <Text style={s.bigEmoji}>🌐</Text>
            <Text style={s.title}>{t('onboarding_language_title')}</Text>
            <Text style={s.sub}>{t('onboarding_language_sub')}</Text>
            <View style={s.langList}>
              {LANGUAGES.map(lang => (
                <TouchableOpacity
                  key={lang.code}
                  style={[s.langRow, language === lang.code && s.langRowSelected]}
                  onPress={() => setLanguage(lang.code)}
                >
                  <Text style={s.langFlag}>{lang.flag}</Text>
                  <View style={s.langInfo}>
                    <Text style={s.langNative}>{lang.native}</Text>
                    <Text style={s.langName}>{lang.name}</Text>
                  </View>
                  {language === lang.code && (
                    <Text style={s.langCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* STEP 3 — COMPOUND TYPE */}
        {step === 3 && (
          <View style={s.stepContent}>
            <Text style={s.bigEmoji}>🔬</Text>
            <Text style={s.title}>{t('onboarding_compound_title')}</Text>
            <Text style={s.sub}>{t('onboarding_compound_sub')}</Text>
            <View style={s.typeGrid}>
              {compoundTypes.map(type => (
                <TouchableOpacity
                  key={type.key}
                  style={[s.typeCard, selectedTypes.includes(type.key) && s.typeCardSelected]}
                  onPress={() => toggleType(type.key)}
                >
                  <Text style={s.typeEmoji}>{type.emoji}</Text>
                  <Text style={[s.typeLabel, selectedTypes.includes(type.key) && s.typeLabelSelected]}>
                    {type.label}
                  </Text>
                  {selectedTypes.includes(type.key) && (
                    <View style={s.typeCheck}>
                      <Text style={s.typeCheckText}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* STEP 4 — GET STARTED (decision screen) */}
        {step === 4 && (
          <View style={s.stepContent}>
            <Text style={s.bigEmoji}>🚀</Text>
            <Text style={s.title}>{t('onboarding_ready_title')}</Text>
            <Text style={s.sub}>{t('onboarding_getstarted_sub')}</Text>

            {/* Google Sign-In — recommended */}
            <TouchableOpacity
              style={[s.googleBtn, loading && { opacity: 0.6 }]}
              onPress={handleGoogleSignIn}
              disabled={loading}
            >
              <Text style={s.googleBtnIcon}>G</Text>
              <Text style={s.googleBtnText}>
                {loading ? t('loading') : t('onboarding_google_signin')}
              </Text>
            </TouchableOpacity>

            <View style={s.orDivider}>
              <View style={s.orLine} />
              <Text style={s.orText}>{t('onboarding_or')}</Text>
              <View style={s.orLine} />
            </View>

            {/* Create account — new users */}
            <TouchableOpacity style={s.primaryBtn} onPress={() => { setIsSignIn(false); nextStep(); }}>
              <Text style={s.primaryBtnText}>{t('onboarding_create_account')} →</Text>
            </TouchableOpacity>

            {/* Sign in — returning users */}
            <TouchableOpacity
              style={s.signinLink}
              onPress={() => { setIsSignIn(true); setStep(6); }}
            >
              <Text style={s.signinLinkText}>{t('onboarding_already_have_account')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 5 — PROFILE (OPTIONAL) */}
        {step === 5 && (
          <View style={s.stepContent}>
            <Text style={s.bigEmoji}>👤</Text>
            <Text style={s.title}>{t('profile_step_title')}</Text>
            <Text style={s.sub}>{t('profile_step_sub_required')}</Text>

            <Text style={s.fieldLabel}>{t('profile_name')}</Text>
            <TextInput
              style={s.input}
              placeholder={t('profile_name_placeholder')}
              placeholderTextColor={colors.textFaint}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoCorrect={false}
            />

            <Text style={s.fieldLabel}>{t('profile_gender')}</Text>
            <View style={s.pillRow}>
              {[
                { key: 'male', label: t('profile_gender_male') },
                { key: 'female', label: t('profile_gender_female') },
                { key: 'prefer_not_to_say', label: t('profile_gender_skip') },
              ].map(g => (
                <TouchableOpacity
                  key={g.key}
                  style={[s.pill, gender === g.key && s.pillOn]}
                  onPress={() => setGender(g.key)}
                >
                  <Text style={[s.pillText, gender === g.key && s.pillTextOn]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>{t('profile_birth')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.monthScroll}>
              <View style={s.monthRow}>
                {MONTH_KEYS.map((mk, idx) => (
                  <TouchableOpacity
                    key={mk}
                    style={[s.pill, birthMonth === idx && s.pillOn]}
                    onPress={() => setBirthMonth(idx)}
                  >
                    <Text style={[s.pillText, birthMonth === idx && s.pillTextOn]}>{t(mk)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.yearScroll}>
              <View style={s.monthRow}>
                {BIRTH_YEARS.map(y => (
                  <TouchableOpacity
                    key={y}
                    style={[s.pill, birthYear === y && s.pillOn]}
                    onPress={() => setBirthYear(y)}
                  >
                    <Text style={[s.pillText, birthYear === y && s.pillTextOn]}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.fieldLabel}>{t('profile_country')}</Text>
            <TouchableOpacity
              style={[s.input, { justifyContent: 'center' }]}
              onPress={() => { setCountrySearch(''); setShowCountryPicker(true); }}
            >
              <Text style={{ fontSize: 15, color: country ? colors.text : colors.textFaint }}>
                {country ? countryLabel(country, language) : t('profile_country_placeholder')}
              </Text>
            </TouchableOpacity>

            <Text style={s.fieldLabel}>{t('profile_goal')}</Text>
            <View style={s.pillRow}>
              {[
                { key: 'wellness', label: t('profile_goal_wellness') },
                { key: 'fitness', label: t('profile_goal_fitness') },
                { key: 'body_composition', label: t('profile_goal_body') },
                { key: 'longevity', label: t('profile_goal_longevity') },
                { key: 'athletic', label: t('profile_goal_athletic') },
              ].map(g => (
                <TouchableOpacity
                  key={g.key}
                  style={[s.pill, primaryGoal === g.key && s.pillOn]}
                  onPress={() => setPrimaryGoal(g.key)}
                >
                  <Text style={[s.pillText, primaryGoal === g.key && s.pillTextOn]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>{t('profile_activity')}</Text>
            <View style={s.pillRow}>
              {[
                { key: 'sedentary', label: t('profile_activity_sedentary') },
                { key: 'moderate', label: t('profile_activity_moderate') },
                { key: 'active', label: t('profile_activity_active') },
                { key: 'very_active', label: t('profile_activity_very_active') },
              ].map(a => (
                <TouchableOpacity
                  key={a.key}
                  style={[s.pill, activityLevel === a.key && s.pillOn]}
                  onPress={() => setActivityLevel(a.key)}
                >
                  <Text style={[s.pillText, activityLevel === a.key && s.pillTextOn]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>{t('profile_provider')}</Text>
            <View style={s.pillRow}>
              {[
                { key: 'yes', label: t('profile_provider_yes') },
                { key: 'no', label: t('profile_provider_no') },
              ].map(p => (
                <TouchableOpacity
                  key={p.key}
                  style={[s.pill, hasProvider === p.key && s.pillOn]}
                  onPress={() => setHasProvider(p.key)}
                >
                  <Text style={[s.pillText, hasProvider === p.key && s.pillTextOn]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.profileDisclaimer}>{t('profile_data_note')}</Text>

            <TouchableOpacity
              style={[s.primaryBtn, !profileComplete && { opacity: 0.4 }]}
              onPress={nextStep}
              disabled={!profileComplete}
            >
              <Text style={s.primaryBtnText}>{t('next')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 6 — DATA & PRIVACY CONSENT */}
        {step === 6 && !isSignIn && (
          <View style={s.stepContent}>
            <Text style={s.bigEmoji}>🔒</Text>
            <Text style={s.title}>{t('consent_title')}</Text>
            <Text style={s.sub}>{t('consent_sub')}</Text>

            <View style={s.consentCard}>
              <Text style={s.consentSectionTitle}>{t('consent_what_title')}</Text>
              {[
                t('consent_data_1'),
                t('consent_data_2'),
                t('consent_data_3'),
                t('consent_data_4'),
              ].map((item, i) => (
                <View key={i} style={s.consentRow}>
                  <View style={s.consentDot} />
                  <Text style={s.consentText}>{item}</Text>
                </View>
              ))}

              <Text style={[s.consentSectionTitle, { marginTop: 16 }]}>{t('consent_why_title')}</Text>
              {[
                t('consent_purpose_1'),
                t('consent_purpose_2'),
              ].map((item, i) => (
                <View key={i} style={s.consentRow}>
                  <View style={s.consentDot} />
                  <Text style={s.consentText}>{item}</Text>
                </View>
              ))}

              <Text style={[s.consentSectionTitle, { marginTop: 16 }]}>{t('consent_rights_title')}</Text>
              {[
                t('consent_right_1'),
                t('consent_right_2'),
                t('consent_right_3'),
              ].map((item, i) => (
                <View key={i} style={s.consentRow}>
                  <View style={s.consentDot} />
                  <Text style={s.consentText}>{item}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={s.consentToggleRow}
              onPress={() => setAnalyticsConsent(!analyticsConsent)}
            >
              <View style={[s.consentCheckbox, analyticsConsent && s.consentCheckboxOn]}>
                {analyticsConsent && <Text style={s.consentCheckMark}>✓</Text>}
              </View>
              <Text style={s.consentToggleText}>{t('consent_analytics_toggle')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.consentToggleRow}
              onPress={() => setConsentGiven(!consentGiven)}
            >
              <View style={[s.consentCheckbox, consentGiven && s.consentCheckboxOn]}>
                {consentGiven && <Text style={s.consentCheckMark}>✓</Text>}
              </View>
              <Text style={s.consentToggleText}>{t('consent_accept')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.primaryBtn, !consentGiven && { opacity: 0.4 }]}
              onPress={nextStep}
              disabled={!consentGiven}
            >
              <Text style={s.primaryBtnText}>{t('consent_continue')}</Text>
            </TouchableOpacity>

            <Text style={s.consentFooter}>{t('consent_footer')}</Text>
          </View>
        )}

        {/* STEP 6 — AUTH (sign-in bypasses consent) */}
        {step === 6 && isSignIn && (
          <View style={s.stepContent}>
            <Text style={s.bigEmoji}>👤</Text>
            <Text style={s.title}>{t('onboarding_signin_title')}</Text>
            <Text style={s.sub}>{t('onboarding_signin')}</Text>

            {/* Google Sign-In option on login screen too */}
            <TouchableOpacity
              style={[s.googleBtn, loading && { opacity: 0.6 }]}
              onPress={handleGoogleSignIn}
              disabled={loading}
            >
              <Text style={s.googleBtnIcon}>G</Text>
              <Text style={s.googleBtnText}>
                {loading ? t('loading') : t('onboarding_google_signin')}
              </Text>
            </TouchableOpacity>

            <View style={s.orDivider}>
              <View style={s.orLine} />
              <Text style={s.orText}>{t('onboarding_or')}</Text>
              <View style={s.orLine} />
            </View>

            <TextInput
              style={s.input}
              placeholder={t('onboarding_email')}
              placeholderTextColor={colors.textFaint}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={s.input}
              placeholder={t('onboarding_password') || 'Password'}
              placeholderTextColor={colors.textFaint}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={handleForgotPassword}>
              <Text style={s.forgotPassword}>{t('forgot_password')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryBtn, loading && { opacity: 0.6 }]}
              onPress={handleAuth}
              disabled={loading}
            >
              <Text style={s.primaryBtnText}>
                {loading ? t('loading') : t('onboarding_signin')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.switchBtn}
              onPress={() => setIsSignIn(false)}
            >
              <Text style={s.switchBtnText}>{t('onboarding_create_account')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 7 — CREATE ACCOUNT / CONFIRMATION */}
        {step === 7 && !signupDone && (
          <View style={s.stepContent}>
            <Text style={s.bigEmoji}>👤</Text>
            <Text style={s.title}>{t('onboarding_signin_title')}</Text>
            <Text style={s.sub}>{t('onboarding_ready_sub')}</Text>
            <TextInput
              style={s.input}
              placeholder={t('onboarding_email')}
              placeholderTextColor={colors.textFaint}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={s.input}
              placeholder={t('onboarding_password') || 'Password'}
              placeholderTextColor={colors.textFaint}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={s.referralRow}>
              <Text style={s.referralLabel}>{t('referral_enter_code')}</Text>
              <TextInput
                style={[s.input, s.referralInput]}
                placeholder={t('referral_enter_placeholder')}
                placeholderTextColor={colors.textFaint}
                value={referralCode}
                onChangeText={(text) => setReferralCode(text.toUpperCase().slice(0, 6))}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
              />
              <Text style={s.referralHint}>{t('referral_optional')}</Text>
            </View>
            <TouchableOpacity
              style={[s.primaryBtn, loading && { opacity: 0.6 }]}
              onPress={handleAuth}
              disabled={loading}
            >
              <Text style={s.primaryBtnText}>
                {loading ? t('loading') : t('onboarding_create_account')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.switchBtn}
              onPress={() => { setIsSignIn(true); setStep(6); }}
            >
              <Text style={s.switchBtnText}>{t('onboarding_signin')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {step === 7 && signupDone && (
          <View style={s.stepContent}>
            <Text style={s.bigEmoji}>📧</Text>
            <Text style={s.title}>{t('onboarding_confirm_title')}</Text>
            <Text style={[s.sub, { marginBottom: 8 }]}>{t('onboarding_confirm_msg').replace('{email}', email.trim())}</Text>
            <Text style={[s.sub, { fontSize: 13, color: colors.textFaint, marginBottom: 24 }]}>{t('onboarding_confirm_hint')}</Text>
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => { setSignupDone(false); setIsSignIn(true); setStep(6); setPassword(''); }}
            >
              <Text style={s.primaryBtnText}>{t('onboarding_go_signin')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Country picker — select-only from the canonical list (no free text),
          so the same country is never stored as "USA"/"America"/"United States". */}
      <Modal visible={showCountryPicker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
            <View style={{ minWidth: 60 }} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{t('profile_country')}</Text>
            <TouchableOpacity onPress={() => setShowCountryPicker(false)} style={{ minWidth: 60, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 14, color: colors.accent, fontWeight: '600' }}>{t('done')}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
            <TextInput
              style={s.input}
              placeholder={t('profile_country_search')}
              placeholderTextColor={colors.textFaint}
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
          </View>
          <FlatList
            data={COUNTRIES.filter(c => {
              const q = countrySearch.toLowerCase();
              return c.toLowerCase().includes(q) || countryLabel(c, language).toLowerCase().includes(q);
            })}
            keyExtractor={item => item}
            style={{ flex: 1, paddingHorizontal: 20 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: country === item ? colors.accentSoft : colors.card2, borderRadius: 12, marginBottom: 8, borderWidth: country === item ? 1.5 : 0.5, borderColor: country === item ? colors.accent : colors.border }}
                onPress={() => { setCountry(item); setShowCountryPicker(false); }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, flex: 1 }}>{countryLabel(item, language)}</Text>
                {country === item && <Text style={{ fontSize: 18, color: colors.accent, fontWeight: '600' }}>✓</Text>}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 0 },
  progressBar: { flexDirection: 'row', gap: 4, paddingHorizontal: 20, paddingTop: 12 },
  progressSegment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: c.border },
  progressSegmentActive: { backgroundColor: c.accent },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  navBack: { fontSize: 14, color: c.accent, paddingVertical: 8, paddingHorizontal: 4 },
  navStep: { fontSize: 12, color: c.textFaint, fontWeight: '500' },
  navNext: { fontSize: 14, color: c.accent, fontWeight: '600', paddingVertical: 8, paddingHorizontal: 4 },
  scroll: { flex: 1 },
  stepContent: { padding: 28 },
  bigEmoji: { fontSize: 56, marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '700', color: c.text, marginBottom: 12, lineHeight: 34 },
  sub: { fontSize: 15, color: c.textMuted, lineHeight: 24, marginBottom: 28 },
  primaryBtn: { backgroundColor: c.accent, padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: c.accentText, fontSize: 16, fontWeight: '600' },
  secondaryBtn: { padding: 14, alignItems: 'center' },
  secondaryBtnText: { color: c.accent, fontSize: 14 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  langList: { gap: 10 },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: c.card2, borderRadius: 12, borderWidth: 0.5, borderColor: c.border },
  langRowSelected: { backgroundColor: c.accentSoft, borderColor: c.accent, borderWidth: 1.5 },
  langFlag: { fontSize: 28 },
  langInfo: { flex: 1 },
  langNative: { fontSize: 15, fontWeight: '600', color: c.text },
  langName: { fontSize: 12, color: c.textMuted, marginTop: 1 },
  langCheck: { fontSize: 18, color: c.accent, fontWeight: '600' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  typeCard: { width: '47%', backgroundColor: c.card2, borderRadius: 14, padding: 18, alignItems: 'center', borderWidth: 1.5, borderColor: c.border, position: 'relative' },
  typeCardSelected: { backgroundColor: c.accentSoft, borderColor: c.accent },
  typeEmoji: { fontSize: 32, marginBottom: 10 },
  typeLabel: { fontSize: 13, fontWeight: '600', color: c.textMuted, textAlign: 'center' },
  typeLabelSelected: { color: c.accent },
  typeCheck: { position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  typeCheckText: { color: c.accentText, fontSize: 11, fontWeight: '700' },
  readyFeatures: { backgroundColor: c.card2, borderRadius: 14, padding: 18, marginBottom: 28, gap: 14 },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  readyEmoji: { fontSize: 20 },
  readyText: { fontSize: 14, color: c.textMuted, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, fontSize: 15, color: c.text, marginBottom: 14, backgroundColor: c.card2 },
  switchBtn: { padding: 12, alignItems: 'center' },
  switchBtnText: { fontSize: 14, color: c.accent },
  referralRow: { marginBottom: 4, marginTop: 8, padding: 14, backgroundColor: c.card2, borderRadius: 12, borderWidth: 0.5, borderColor: c.border },
  referralLabel: { fontSize: 14, fontWeight: '600', color: c.textMuted, marginBottom: 8 },
  referralInput: { marginBottom: 4, letterSpacing: 2, fontWeight: '600', fontSize: 16, backgroundColor: c.card },
  referralHint: { fontSize: 12, color: c.textFaint, marginBottom: 4, marginTop: 2 },
  // Consent
  consentCard: { backgroundColor: c.card2, borderRadius: 14, padding: 18, marginBottom: 20, borderWidth: 0.5, borderColor: c.border },
  consentSectionTitle: { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 8 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  consentDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.accent, marginTop: 6, flexShrink: 0 },
  consentText: { fontSize: 13, color: c.textMuted, lineHeight: 19, flex: 1 },
  consentToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, marginBottom: 6 },
  consentCheckbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  consentCheckboxOn: { backgroundColor: c.accent, borderColor: c.accent },
  consentCheckMark: { color: c.accentText, fontSize: 14, fontWeight: '700' },
  consentToggleText: { fontSize: 13, color: c.text, flex: 1, lineHeight: 19 },
  consentFooter: { fontSize: 11, color: c.textFaint, textAlign: 'center', marginTop: 10, lineHeight: 16 },
  // Profile step
  fieldLabel: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: 6, marginTop: 12 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: c.card2, borderWidth: 0.5, borderColor: c.border },
  pillOn: { backgroundColor: c.accent, borderColor: c.accent },
  pillText: { fontSize: 13, color: c.textMuted, fontWeight: '500' },
  pillTextOn: { color: c.accentText, fontWeight: '600' },
  monthScroll: { marginBottom: 8 },
  yearScroll: { marginBottom: 4, maxHeight: 42 },
  monthRow: { flexDirection: 'row', gap: 6 },
  profileDisclaimer: { fontSize: 11, color: c.textFaint, textAlign: 'center', marginTop: 16, marginBottom: 8, lineHeight: 16 },
  // Google Sign-In button
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 12, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.card, marginBottom: 16, gap: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 2 },
  googleBtnIcon: { fontSize: 20, fontWeight: '700', color: '#4285F4' },
  googleBtnText: { fontSize: 16, fontWeight: '600', color: c.text },
  // OR divider
  orDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: c.border },
  orText: { fontSize: 13, color: c.textFaint, fontWeight: '500' },
  // Sign-in link on step 4
  signinLink: { padding: 16, alignItems: 'center', marginTop: 4 },
  signinLinkText: { fontSize: 15, color: c.accent, fontWeight: '500' },
  // Forgot password
  forgotPassword: { fontSize: 13, color: c.accent, textAlign: 'right', marginBottom: 16, marginTop: -6 },
});