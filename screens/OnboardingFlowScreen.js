import { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image,
  StyleSheet, useWindowDimensions, Modal, FlatList, BackHandler, Alert, Linking,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing, useReducedMotion,
} from 'react-native-reanimated';

// One progress segment: fills (or empties) as you move through the steps.
function ProgressDash({ on, s }) {
  const fill = useSharedValue(on ? 1 : 0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) { fill.value = on ? 1 : 0; return; }
    fill.value = withTiming(on ? 1 : 0, { duration: on ? 340 : 240, easing: Easing.out(Easing.cubic) });
  }, [on, reduce]);
  const st = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={s.dash}>
      <Animated.View style={[s.dashFill, st]} />
    </View>
  );
}
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { saveOnboarding, markSeenOnboarding } from '../lib/onboardingStore';
import { supabase, signOutGoogleNative, missingProfileFields } from '../lib/supabase';
import { markIntentionalSignOut } from '../lib/authIntent';
import { goalOptions } from '../lib/profileGoals';
import { COUNTRIES, countryLabel } from '../lib/countries';
import AccumulationHero from '../components/AccumulationHero';
import FeatureIcon from '../components/FeatureIcon';
import CheckMark from '../components/CheckMark';
import Svg, { Path } from 'react-native-svg';
import { MONO } from '../lib/fonts';

// Drawn monoline chevron (back / open / dropdown) — never a font glyph.
const CHEVRON_PATHS = { left: 'M8 2 L2 8 L8 14', right: 'M2 2 L8 8 L2 14', down: 'M2 2 L8 8 L14 2' };
function Chevron({ dir, color }) {
  const down = dir === 'down';
  return (
    <Svg width={down ? 13 : 11} height={down ? 8 : 18} viewBox={down ? '0 0 16 10' : '0 0 10 16'}>
      <Path d={CHEVRON_PATHS[dir]} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * The single value-before-signup onboarding. Runs on first launch (no account
 * yet), educates on the app, collects the FULL required profile (name, age
 * [month+year], sex, country, goal, what-you-track, activity, provider) plus
 * binding consent, and hands off to account creation LAST. Everything is stashed
 * (onboardingStore) and written to the account at sign-up, so there is no second
 * profile step afterward — this replaces the old 8-intro + 7-legacy = 15 screens
 * with one flow.
 *
 * TWO MODES (one screen, no more separate CompleteProfileScreen):
 *  • Pre-account (no `session`): the value-first flow. onDone() flips App.js to the
 *    auth screen, which reads the stash and creates the account; applyPendingProfile
 *    then writes the stash on SIGNED_IN.
 *  • Signed-in (`session` passed): an Apple/Google sign-in or a returning account
 *    missing required fields. Prefills from the profile, shows ONLY the missing
 *    steps, and writes straight to the account on finish (the stash path never
 *    fires here). Offers a sign-out escape. On save, USER_UPDATED clears the gate.
 */
const STEPS = ['splash', 'features', 'goal', 'tracking', 'about', 'routine', 'consent', 'reminders', 'ready'];

const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr', 'month_may', 'month_jun',
  'month_jul', 'month_aug', 'month_sep', 'month_oct', 'month_nov', 'month_dec',
];
const PRIVACY_URL = 'https://dosetrace.io/privacy-policy';
const BIRTH_YEARS = [];
const _thisYear = new Date().getFullYear();
for (let y = _thisYear - 18; y >= _thisYear - 90; y--) BIRTH_YEARS.push(y);

export default function OnboardingFlowScreen({ onDone, session }) {
  const { t, language, setLanguage, LANGUAGES } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { width: winW } = useWindowDimensions();
  const heroW = Math.min(420, winW - 32); // 16 pt screen gutter each side

  // Signed-in mode: the user already has an account (an Apple/Google sign-in, or
  // a returning account missing required fields). We prefill from their profile,
  // show only the steps they still need, WRITE the result straight to the account
  // on finish, and offer a sign-out escape. No session → the original pre-account
  // flow (stash locally → Auth → applyPendingProfile on sign-up).
  const signedIn = !!session?.user;
  const meta = (session && session.user && session.user.user_metadata) || {};
  const [saving, setSaving] = useState(false);

  const [step, setStep] = useState(0);
  const [goals, setGoals] = useState(String(meta.primary_goal || '').split(',').map((x) => x.trim()).filter(Boolean)); // multi-select
  const [tracking, setTracking] = useState(Array.isArray(meta.tracking_types) ? meta.tracking_types : []);
  const [name, setName] = useState(meta.display_name || '');
  const [birthMonth, setBirthMonth] = useState(meta.birth_month != null ? meta.birth_month - 1 : null); // stored 1-based → 0-11 index
  const [birthYear, setBirthYear] = useState(meta.birth_year != null ? meta.birth_year : null);
  const [birthYearText, setBirthYearText] = useState(meta.birth_year != null ? String(meta.birth_year) : '');
  const [gender, setGender] = useState(meta.gender || '');
  const [country, setCountry] = useState(meta.country || '');
  const [activity, setActivity] = useState(meta.activity_level || '');
  const [provider, setProvider] = useState(meta.has_provider != null ? String(meta.has_provider) : '');
  const [confirmed, setConfirmed] = useState({});      // consent terms
  const [showLang, setShowLang] = useState(false);
  const [showCountry, setShowCountry] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  // Step transition: the new step slides in from the direction you're moving
  // (Continue → from the right, Back → from the left) while it fades in.
  const reduceMotion = useReducedMotion();
  const enter = useSharedValue(0);
  const dir = useSharedValue(0);
  const prevStepRef = useRef(step);
  useEffect(() => {
    const d = step > prevStepRef.current ? 1 : step < prevStepRef.current ? -1 : 0;
    prevStepRef.current = step;
    if (reduceMotion) { enter.value = 1; return; }
    dir.value = d;
    enter.value = 0;
    enter.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [step, reduceMotion]);
  const stepStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: 24 * dir.value * (1 - enter.value) }],
  }));

  // Android hardware / swipe back: close an open picker, else step back one; on
  // the first screen let the OS handle it (exit). There must always be a way back.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showLang) { setShowLang(false); return true; }
      if (showCountry) { setShowCountry(false); return true; }
      if (step > 0) { back(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [step, showLang, showCountry]);

  // Full goal set, shared with the Settings profile editor, alphabetized.
  const GOALS = goalOptions(t);
  const COMPOUNDS = [
    { key: 'peptides', label: t('onboarding_compound_peptides'), icon: 'type_vial' },
    { key: 'hormones', label: t('onboarding_compound_hormones'), icon: 'reconstitution' },
    { key: 'glp1', label: t('onboarding_compound_glp1'), icon: 'type_glp1' },
    { key: 'oral', label: t('onboarding_compound_oral'), icon: 'type_capsule' },
  ];
  const ACTIVITY = [
    { key: 'sedentary', label: t('profile_activity_sedentary') },
    { key: 'moderate', label: t('profile_activity_moderate') },
    { key: 'active', label: t('profile_activity_active') },
    { key: 'very_active', label: t('profile_activity_very_active') },
  ];
  const PROVIDERS = [
    { key: 'yes', label: t('profile_provider_yes') },
    { key: 'no', label: t('profile_provider_no') },
  ];
  // Sex ASSIGNED AT BIRTH — a physiological input for the calorie/BMR math.
  const SEXES = [
    { key: 'male', label: t('profile_gender_male') },
    { key: 'female', label: t('profile_gender_female') },
  ];
  const FEATURES = [
    { icon: 'reconstitution', t: t('ob_feat1_t'), d: t('ob_feat1_d') },
    { icon: 'curve', t: t('ob_feat2_t'), d: t('ob_feat2_d') },
    { icon: 'bell', t: t('ob_feat3_t'), d: t('ob_feat3_d') },
    { icon: 'stack', t: t('ob_feat4_t'), d: t('ob_feat4_d') },
    { icon: 'scan', t: t('ob_feat5_t'), d: t('ob_feat5_d') },
  ];
  const TERMS = [
    { key: 'med', t: t('ob_term1_t'), d: t('ob_term1_d') },
    { key: 'est', t: t('ob_term2_t'), d: t('ob_term2_d') },
    { key: 'ai', t: t('ob_term3_t'), d: t('ob_term3_d') },
    { key: 'priv', t: t('ob_term4_t'), d: t('ob_term4_d') },
  ];
  // Already-consented accounts count as done (their consent step is skipped).
  const consentDone = TERMS.every((x) => confirmed[x.key]) || !!meta.consent_accepted;

  // The steps to actually show. Pre-account: the full flow. Signed-in: only the
  // steps whose required fields are still missing, + consent (if not recorded) +
  // the finish screen — so a returning user fills only the gaps, a brand-new
  // social user still sees the whole profile flow.
  const activeSteps = useMemo(() => {
    if (!signedIn) return STEPS;
    const need = new Set(missingProfileFields(session.user)); // name,age,sex,country,goal,activity,tracking,provider
    const out = [];
    if (need.has('goal')) out.push('goal');
    if (need.has('tracking')) out.push('tracking');
    if (need.has('name') || need.has('age') || need.has('sex') || need.has('country')) out.push('about');
    if (need.has('activity') || need.has('provider')) out.push('routine');
    if (!meta.consent_accepted) out.push('consent');
    out.push('ready');
    return out;
  }, [signedIn, session, meta.consent_accepted]);

  // Self-heal: right after an Apple/Google sign-up the session + metadata hydrate
  // over a few frames, so activeSteps can shrink (or a consent record lands
  // mid-flow) while `step` still points past the new end. That makes
  // activeSteps[step] undefined → the body renders blank with only a stray
  // Continue, and nothing resets it (the "blank onboarding screen after Sign in
  // with Apple, had to restart the app" bug). Clamp step back into range.
  useEffect(() => {
    if (step > activeSteps.length - 1) setStep(Math.max(0, activeSteps.length - 1));
  }, [activeSteps.length, step]);

  function toggleTracking(key) {
    setTracking((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  }

  const canContinue = () => {
    const cur = activeSteps[step];
    if (!cur) return false; // step out of range mid-hydration — don't advance a blank step
    if (cur === 'goal') return goals.length > 0;
    if (cur === 'tracking') return tracking.length > 0;
    if (cur === 'about') return !!name.trim() && !!gender && !!country && birthMonth != null && birthYear != null;
    if (cur === 'routine') return !!activity && !!provider;
    if (cur === 'consent') return consentDone;
    return true;
  };

  async function persist() {
    // Only stash keys that actually have a value. saveOnboarding merges {...cur,
    // ...patch}, and a spread copies undefined-valued keys — so writing `undefined`
    // for a not-yet-filled field would CLOBBER a value entered on an earlier step
    // (the mid-onboarding-kill data-loss path). Strip undefined before saving.
    const patch = {
      display_name: name.trim() || undefined,
      primary_goal: goals.length ? goals.join(',') : undefined,
      tracking_types: tracking.length ? tracking : undefined,
      gender: gender || undefined,
      country: country || undefined,
      birth_year: birthYear != null ? birthYear : undefined,
      birth_month: birthMonth != null ? birthMonth + 1 : undefined, // store 1-based
      activity_level: activity || undefined,
      has_provider: provider || undefined,
      consent_accepted: consentDone || undefined,
      consent_date: consentDone ? new Date().toISOString() : undefined,
    };
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
    await saveOnboarding(patch);
  }

  async function next() {
    if (!canContinue()) return;
    await persist();
    if (step < activeSteps.length - 1) setStep(step + 1);
    else finish();
  }
  function back() { if (step > 0) setStep(step - 1); }

  async function finish() {
    // Signed-in mode: write the profile straight to the account (the pre-account
    // stash path never fires here — SIGNED_IN already happened). On error, keep
    // the entered data and surface it; success clears the gate via USER_UPDATED.
    if (signedIn) {
      if (saving) return;
      setSaving(true);
      const data = {
        display_name: name.trim(),
        primary_goal: goals.join(','),
        tracking_types: tracking,
        gender,
        country: country.trim(),
        birth_year: birthYear,
        birth_month: birthMonth != null ? birthMonth + 1 : null,
        activity_level: activity,
        has_provider: provider,
        onboarded_at: meta.onboarded_at || new Date().toISOString(),
      };
      if (consentDone && !meta.consent_accepted) {
        data.consent_accepted = true;
        data.consent_date = new Date().toISOString();
      }
      const { error } = await supabase.auth.updateUser({ data });
      setSaving(false);
      if (error) { Alert.alert(t('error'), error.message || String(error)); return; }
      await markSeenOnboarding();
      return; // App.js re-evaluates isProfileComplete() on USER_UPDATED → Main
    }
    await persist();
    await markSeenOnboarding();
    onDone && onDone();
  }

  // Escape hatch for a signed-in user who doesn't want to finish the profile —
  // otherwise they'd be trapped on the gate with no way to the app or out.
  async function handleSignOut() {
    markIntentionalSignOut();
    try { await signOutGoogleNative(); } catch { /* not a Google session */ }
    try { await supabase.auth.signOut({ scope: 'local' }); }
    catch { await supabase.auth.signOut().catch(() => {}); }
  }

  async function enableNotifications() {
    try { await Notifications.requestPermissionsAsync(); } catch (e) { /* later */ }
    setStep(step + 1);
  }

  const cur = activeSteps[step];
  const filteredCountries = COUNTRIES.filter((c) => {
    const q = countrySearch.toLowerCase();
    return c.toLowerCase().includes(q) || countryLabel(c, language).toLowerCase().includes(q);
  });

  return (
    <SafeAreaView style={s.root}>
      {(step > 0 || signedIn) && (
        <View style={s.topBar}>
          <TouchableOpacity onPress={back} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} disabled={step === 0} style={[s.backBtn, step === 0 && s.hidden]} accessibilityRole="button" accessibilityLabel={t('back')}>
            <Chevron dir="left" color={colors.ink} />
          </TouchableOpacity>
          <View style={s.progress}>
            {activeSteps.map((_, i) => (<ProgressDash key={i} on={i <= step} s={s} />))}
          </View>
          {signedIn ? (
            <TouchableOpacity onPress={handleSignOut} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={s.signOutBtn}>
              <Text style={s.signOutLink}>{t('settings_signout')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>
      )}

      <Animated.View style={[{ flex: 1 }, stepStyle]}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          {cur === 'splash' && (
            <View style={s.splashWrap}>
              <View style={s.langRow}>
                <TouchableOpacity style={s.langPill} onPress={() => setShowLang(true)} accessibilityRole="button" accessibilityLabel={t('settings_language')}>
                  <Text style={s.langPillText}>{String(language).toUpperCase()}</Text>
                  <Chevron dir="down" color={colors.ink2} />
                </TouchableOpacity>
              </View>
              <View style={s.splashCenter}>
                {/* The brand mark keeps its own artwork (fixed brand colors on purpose). */}
                <Image source={require('../assets/adaptive-icon.png')} style={s.logo} resizeMode="contain" />
                <Text style={s.brand}>DoseTrace</Text>
                <Text style={s.phrase}>{t('ob_phrase')}</Text>
              </View>
            </View>
          )}

          {cur === 'features' && (
            <>
              <View style={s.stepHead}>
                <Text style={s.title}>{t('ob_features_title')}</Text>
                <Text style={s.sub}>{t('ob_features_sub')}</Text>
              </View>
              <AccumulationHero width={heroW} height={140} />
              <View style={s.featList}>
                {FEATURES.map((f, i) => (
                  <View key={i} style={s.featRow}>
                    <View style={s.featIcon}><FeatureIcon name={f.icon} size={30} color={colors.ink} /></View>
                    <View style={s.featText}>
                      <Text style={s.featTitle}>{f.t}</Text>
                      <Text style={s.featDesc}>{f.d}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {cur === 'goal' && (
            <>
              <View style={s.stepHead}>
                <Text style={s.title}>{t('ob_goal_title')}</Text>
                <Text style={s.sub}>{t('ob_goal_sub')}</Text>
              </View>
              <Text style={s.hint}>{t('profile_goal_multi_hint')}</Text>
              <View style={s.pillRow}>
                {GOALS.map((g) => {
                  const on = goals.includes(g.key);
                  return (
                    <TouchableOpacity
                      key={g.key}
                      style={[s.pill, on && s.pillOn]}
                      onPress={() => setGoals((prev) => (prev.includes(g.key) ? prev.filter((k) => k !== g.key) : [...prev, g.key]))}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={[s.pillText, on && s.pillTextOn]}>{g.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {cur === 'tracking' && (
            <>
              <View style={s.stepHead}>
                <Text style={s.title}>{t('onboarding_compound_title')}</Text>
                <Text style={s.sub}>{t('onboarding_compound_sub')}</Text>
              </View>
              <View style={s.pillRow}>
                {COMPOUNDS.map((c) => {
                  const on = tracking.includes(c.key);
                  return (
                    <TouchableOpacity key={c.key} style={[s.pill, s.pillIcon, on && s.pillOn]} onPress={() => toggleTracking(c.key)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                      <FeatureIcon name={c.icon} size={20} color={on ? colors.ink : colors.ink2} />
                      <Text style={[s.pillText, on && s.pillTextOn]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {cur === 'about' && (
            <>
              <View style={s.stepHead}>
                <Text style={s.title}>{t('profile_step_title')}</Text>
                <Text style={s.sub}>{t('profile_step_sub_required')}</Text>
              </View>
              <Text style={s.hint}>{t('profile_required_legend')}</Text>

              <View style={s.field}>
                <Text style={s.fieldLabel}>{t('profile_name')}<Text style={s.req}> *</Text></Text>
                <TextInput
                  style={s.input}
                  placeholder={t('profile_name_placeholder')}
                  placeholderTextColor={colors.ink3}
                  value={name} onChangeText={setName} autoCapitalize="words" autoCorrect={false}
                />
              </View>

              <View style={s.field}>
                <Text style={s.fieldLabel}>{t('profile_birth_month')}<Text style={s.req}> *</Text></Text>
                {/* Month as a full 4-across grid (all 12 visible), year typed —
                    scrolling through ~70 years horizontally was the bad UX. */}
                <View style={s.mGrid}>
                  {MONTH_KEYS.map((mk, idx) => (
                    <TouchableOpacity key={mk} style={[s.pill, s.mChip, birthMonth === idx && s.pillOn]} onPress={() => setBirthMonth(idx)} accessibilityRole="radio" accessibilityState={{ selected: birthMonth === idx }}>
                      <Text style={[s.pillText, birthMonth === idx && s.pillTextOn]}>{t(mk)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={s.field}>
                <Text style={s.fieldLabel}>{t('profile_birth_year')}<Text style={s.req}> *</Text></Text>
                <TextInput
                  style={s.input}
                  placeholder={t('profile_birth_year_ph')}
                  placeholderTextColor={colors.ink3}
                  value={birthYearText}
                  onChangeText={(txt) => {
                    const digits = txt.replace(/[^0-9]/g, '').slice(0, 4);
                    setBirthYearText(digits);
                    const n = parseInt(digits, 10);
                    const max = new Date().getFullYear() - 18; // 18+ only
                    setBirthYear(digits.length === 4 && n >= 1900 && n <= max ? n : null);
                  }}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>

              <View style={s.field}>
                <Text style={s.fieldLabel}>{t('profile_sex')}<Text style={s.req}> *</Text></Text>
                <View style={s.seg}>
                  {SEXES.map((g) => (
                    <TouchableOpacity key={g.key} style={[s.segItem, gender === g.key && s.segItemOn]} onPress={() => setGender(g.key)} accessibilityRole="radio" accessibilityState={{ selected: gender === g.key }}>
                      <Text style={[s.segText, gender === g.key && s.segTextOn]}>{g.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={s.help}>{t('profile_sex_help')}</Text>
              </View>

              <View style={s.field}>
                <Text style={s.fieldLabel}>{t('profile_country')}<Text style={s.req}> *</Text></Text>
                <TouchableOpacity style={s.selectBtn} onPress={() => { setCountrySearch(''); setShowCountry(true); }}>
                  <Text style={[s.selectText, !country && s.selectTextEmpty]}>
                    {country ? countryLabel(country, language) : t('profile_country_placeholder')}
                  </Text>
                  <Chevron dir="right" color={colors.ink3} />
                </TouchableOpacity>
              </View>
            </>
          )}

          {cur === 'routine' && (
            <>
              <View style={s.stepHead}>
                <Text style={s.title}>{t('ob_routine_title')}</Text>
              </View>
              <View style={s.field}>
                <Text style={s.fieldHead}>{t('profile_activity')}</Text>
                <View style={s.actList}>
                  {ACTIVITY.map((a, i) => {
                    const on = activity === a.key;
                    const prevOn = i > 0 && activity === ACTIVITY[i - 1].key;
                    return (
                      <View key={a.key}>
                        {i > 0 && <View style={[s.actDiv, (on || prevOn) && s.actDivHidden]} />}
                        <TouchableOpacity style={[s.actRow, on && s.actRowOn]} onPress={() => setActivity(a.key)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                          <Text style={s.actText}>{a.label}</Text>
                          {on && <CheckMark size={22} color={colors.ink} />}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>
              <View style={s.field}>
                <Text style={s.fieldHead}>{t('profile_provider')}</Text>
                <View style={s.seg}>
                  {PROVIDERS.map((p) => (
                    <TouchableOpacity key={p.key} style={[s.segItem, provider === p.key && s.segItemOn]} onPress={() => setProvider(p.key)} accessibilityRole="radio" accessibilityState={{ selected: provider === p.key }}>
                      <Text style={[s.segText, provider === p.key && s.segTextOn]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}

          {cur === 'consent' && (
            <>
              <View style={s.stepHead}>
                <Text style={s.title}>{t('ob_terms_title')}</Text>
                <Text style={s.sub}>{t('ob_terms_sub')}</Text>
              </View>
              <View style={s.termList}>
                {TERMS.map((x, i) => (
                  <TouchableOpacity
                    key={x.key}
                    style={[s.termRow, i > 0 && s.termRowDiv]}
                    onPress={() => setConfirmed((c) => ({ ...c, [x.key]: !c[x.key] }))}
                    activeOpacity={0.8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !!confirmed[x.key] }}
                  >
                    <View style={[s.check, confirmed[x.key] && s.checkOn]}>
                      {confirmed[x.key] && <CheckMark size={16} color={colors.onInk} />}
                    </View>
                    <View style={s.termText}>
                      <Text style={s.termTitle}>{x.t}</Text>
                      <Text style={s.termDesc}>{x.d}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Functional privacy-policy link at the point of data collection
                  (Apple 5.1.1(ii)). */}
              <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} style={s.linkBtn}>
                <Text style={s.linkText}>{t('settings_privacy_policy')}</Text>
              </TouchableOpacity>
            </>
          )}

          {cur === 'reminders' && (
            <View style={s.centerStep}>
              <FeatureIcon name="bell" size={76} color={colors.data} />
              <Text style={[s.title, s.textCenter]}>{t('ob_reminders_title')}</Text>
              <Text style={[s.sub, s.textCenter]}>{t('ob_reminders_sub')}</Text>
            </View>
          )}

          {cur === 'ready' && (
            <View style={s.centerStep}>
              <Image source={require('../assets/adaptive-icon.png')} style={s.logoSm} resizeMode="contain" />
              <Text style={[s.title, s.textCenter]}>{t('ob_ready_title')}</Text>
              <Text style={[s.sub, s.textCenter]}>{signedIn ? t('ob_finish_sub') : t('ob_ready_sub')}</Text>
            </View>
          )}

        </ScrollView>
      </Animated.View>

      <View style={s.footer}>
        {cur === 'splash' && (
          <>
            <TouchableOpacity style={s.primaryBtn} onPress={next}>
              <Text style={s.primaryBtnText}>{t('ob_get_started')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.linkBtn} onPress={() => onDone && onDone()}>
              <Text style={s.linkText}>{t('onboarding_already_have_account')}</Text>
            </TouchableOpacity>
          </>
        )}
        {cur === 'reminders' && (
          <>
            <TouchableOpacity style={s.primaryBtn} onPress={enableNotifications}>
              <Text style={s.primaryBtnText}>{t('ob_enable_notifs')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.linkBtn} onPress={() => setStep(step + 1)}>
              <Text style={s.linkText}>{t('ob_not_now')}</Text>
            </TouchableOpacity>
          </>
        )}
        {cur === 'ready' && (
          <TouchableOpacity style={[s.primaryBtn, saving && { opacity: 0.5 }]} onPress={finish} disabled={saving}>
            <Text style={s.primaryBtnText}>{signedIn ? t('ob_finish_setup') : t('ob_create_account')}</Text>
          </TouchableOpacity>
        )}
        {!['splash', 'reminders', 'ready'].includes(cur) && (
          <TouchableOpacity
            style={[s.primaryBtn, !canContinue() && s.primaryBtnDim]}
            onPress={next}
            disabled={!canContinue()}
            accessibilityState={{ disabled: !canContinue() }}
          >
            <Text style={s.primaryBtnText}>{t('ob_continue')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Language picker (Graduated bottom sheet, prototype.html langSheet()) */}
      <Modal visible={showLang} animationType="fade" transparent onRequestClose={() => setShowLang(false)}>
        <TouchableOpacity style={s.langBackdrop} activeOpacity={1} onPress={() => setShowLang(false)}>
          <View style={s.langSheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>{t('settings_language')}</Text>
              <TouchableOpacity onPress={() => setShowLang(false)} style={s.sheetDone}>
                <Text style={s.sheetDoneText}>{t('done')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.sheetSub}>{t('settings_language_sub')}</Text>
            <View>
              {(LANGUAGES || []).map((l, i) => {
                const on = language === l.code;
                return (
                  <TouchableOpacity
                    key={l.code}
                    style={[s.langOpt, i > 0 && s.langDiv]}
                    onPress={() => { setLanguage(l.code); setShowLang(false); }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    {/* Use `native` (the localized language name) — the LANGUAGES
                        objects have code/name/native/flag, NO `label`, so `l.label`
                        rendered as blank rows (invisible picker). Every color is an
                        explicit theme token so it can't go white-on-white either. */}
                    <View style={s.langCode}><Text style={s.langCodeText}>{String(l.code).toUpperCase()}</Text></View>
                    <View style={s.langNames}>
                      <Text style={s.langOptText}>{l.native}</Text>
                      <Text style={s.langOptSub}>{l.name}</Text>
                    </View>
                    {on && <CheckMark size={22} color={colors.ink} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Country picker */}
      <Modal visible={showCountry} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCountry(false)}>
        <SafeAreaView style={s.pickerRoot}>
          <View style={s.pickerHead}>
            <View style={{ minWidth: 60 }} />
            <Text style={s.pickerTitle}>{t('profile_country')}</Text>
            <TouchableOpacity onPress={() => setShowCountry(false)} style={s.pickerDone}>
              <Text style={s.sheetDoneText}>{t('done')}</Text>
            </TouchableOpacity>
          </View>
          <View style={s.searchWrap}>
            <View style={s.searchIcon} pointerEvents="none"><FeatureIcon name="search" size={18} color={colors.ink3} /></View>
            <TextInput
              style={[s.input, s.searchInput]}
              placeholder={t('profile_country_search')}
              placeholderTextColor={colors.ink3}
              value={countrySearch} onChangeText={setCountrySearch}
              autoCapitalize="none" autoCorrect={false} autoFocus
            />
          </View>
          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => item}
            style={s.countryList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[s.countryRow, index > 0 && s.countryRowDiv]}
                onPress={() => { setCountry(item); setShowCountry(false); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: country === item }}
              >
                <Text style={s.countryText}>{countryLabel(item, language)}</Text>
                {country === item && <CheckMark size={22} color={colors.ink} />}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// Graduated (docs/design/prototype.html onbScreen(), DESIGN.md §2–§5): ground
// screen, left-aligned large titles, ink progress dashes, outline pills with an
// ink outline when selected, well inputs (radius 16), one ink capsule action,
// underlined ink text links. Theme tokens only; blue (data) only on the two
// illustration icons.
function makeStyles(colors) {
  const c = colors;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.ground },
    hidden: { opacity: 0 },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, gap: 12, minHeight: 44, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
    backBtn: { minWidth: 24, minHeight: 44, justifyContent: 'center' },
    signOutBtn: { minHeight: 44, justifyContent: 'center' },
    signOutLink: { fontSize: 15, fontWeight: '600', color: c.ink },
    progress: { flex: 1, flexDirection: 'row', gap: 4 },
    dash: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden' },
    dashFill: { height: '100%', borderRadius: 2, backgroundColor: c.ink },
    content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 14, flexGrow: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },

    // Splash
    splashWrap: { flex: 1 },
    langRow: { flexDirection: 'row', justifyContent: 'flex-end' },
    langPill: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', gap: 6 },
    langPillText: { fontSize: 13, color: c.ink2 },
    splashCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingBottom: 44 },
    logo: { width: 112, height: 112 },
    logoSm: { width: 84, height: 84 },
    brand: { fontSize: 42, lineHeight: 48, fontWeight: '700', color: c.ink, letterSpacing: -0.84 },
    phrase: { fontSize: 22, lineHeight: 28, fontWeight: '500', color: c.ink2, textAlign: 'center' },

    // Step heads (obHead): large title + ink2 sentence, left-aligned
    stepHead: { gap: 14, paddingTop: 4 },
    title: { fontSize: 30, lineHeight: 36, fontWeight: '600', color: c.ink, letterSpacing: -0.6 },
    sub: { fontSize: 17, lineHeight: 22, color: c.ink2 },
    textCenter: { textAlign: 'center' },
    hint: { fontSize: 13, lineHeight: 18, color: c.ink2 },
    help: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },

    // Features
    featList: { gap: 14 },
    featRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
    featIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' },
    featText: { flex: 1, gap: 2 },
    featTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
    featDesc: { fontSize: 15, lineHeight: 20, color: c.ink2 },

    // Pills (selection = ink outline on raised)
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
    pillIcon: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pillOn: { borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.raised },
    pillText: { fontSize: 13, lineHeight: 18, color: c.ink2 },
    pillTextOn: { color: c.ink, fontWeight: '600' },
    mGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    mChip: { width: '22%', flexGrow: 1, alignItems: 'center', paddingHorizontal: 4 },

    // Fields
    field: { gap: 10 },
    fieldLabel: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },
    fieldHead: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink, paddingHorizontal: 4 },
    req: { color: c.ink2 },
    input: { minHeight: 52, borderRadius: 16, backgroundColor: c.well, borderWidth: 1, borderColor: c.line, paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, color: c.ink },
    selectBtn: { minHeight: 52, borderRadius: 16, backgroundColor: c.well, borderWidth: 1, borderColor: c.line, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    selectText: { flex: 1, fontSize: 17, color: c.ink },
    selectTextEmpty: { color: c.ink3 },

    // Segmented control (segw fill)
    seg: { flexDirection: 'row', padding: 3, gap: 2, borderRadius: 14, backgroundColor: c.well },
    segItem: { flex: 1, minHeight: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1, borderColor: c.well },
    segItemOn: { backgroundColor: c.raised, borderColor: c.line },
    segText: { fontSize: 15, fontWeight: '500', color: c.ink2 },
    segTextOn: { color: c.ink, fontWeight: '700' },

    // Activity list (actlist)
    actList: { backgroundColor: c.raised, borderRadius: 16, borderWidth: 1, borderColor: c.line, overflow: 'hidden' },
    actRow: { minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 2, borderColor: c.raised },
    actRowOn: { borderColor: c.ink },
    actDiv: { height: 1, backgroundColor: c.line },
    actDivHidden: { backgroundColor: c.raised },
    actText: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },

    // Consent list
    termList: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16 },
    termRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
    termRowDiv: { borderTopWidth: 1, borderTopColor: c.line },
    check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: c.tick, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    checkOn: { backgroundColor: c.ink, borderColor: c.ink },
    termText: { flex: 1, gap: 3 },
    termTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
    termDesc: { fontSize: 15, lineHeight: 20, color: c.ink2 },

    centerStep: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 8 },

    // Footer (obfoot): one ink capsule, then an underlined text button
    footer: { gap: 6, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, backgroundColor: c.ground, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
    primaryBtn: { minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    primaryBtnDim: { opacity: 0.35 },
    primaryBtnText: { fontSize: 17, fontWeight: '700', color: c.onAct },
    linkBtn: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
    linkText: { fontSize: 17, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick, textAlign: 'center' },

    // Language sheet
    langBackdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end', paddingHorizontal: 8, paddingBottom: 30 },
    langSheet: { backgroundColor: c.raised, borderRadius: 26, padding: 20, gap: 14, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
    sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetTitle: { fontSize: 17, fontWeight: '600', color: c.ink },
    sheetDone: { minHeight: 44, justifyContent: 'center' },
    sheetDoneText: { fontSize: 17, fontWeight: '600', color: c.ink },
    sheetSub: { fontSize: 15, lineHeight: 20, color: c.ink2 },
    langOpt: { minHeight: 56, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
    langDiv: { borderTopWidth: 1, borderTopColor: c.line },
    langCode: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
    langCodeText: { fontSize: 13, fontFamily: MONO['500'], color: c.ink },
    langNames: { flex: 1, gap: 2 },
    langOptText: { fontSize: 17, fontWeight: '600', color: c.ink },
    langOptSub: { fontSize: 13, color: c.ink2 },

    // Country picker
    pickerRoot: { flex: 1, backgroundColor: c.ground },
    pickerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, minHeight: 56, borderBottomWidth: 1, borderBottomColor: c.line },
    pickerTitle: { fontSize: 17, fontWeight: '600', color: c.ink },
    pickerDone: { minWidth: 60, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
    searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, justifyContent: 'center' },
    searchIcon: { position: 'absolute', left: 30, top: 12, bottom: 8, justifyContent: 'center', zIndex: 1 },
    searchInput: { paddingLeft: 42 },
    countryList: { flex: 1, paddingHorizontal: 16 },
    countryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
    countryRowDiv: { borderTopWidth: 1, borderTopColor: c.line },
    countryText: { flex: 1, fontSize: 17, color: c.ink },
  });
}
