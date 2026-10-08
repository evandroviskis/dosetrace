import { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image,
  StyleSheet, useWindowDimensions, Modal, BackHandler, Linking, Platform, AppState,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing, useReducedMotion,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { saveOnboarding, loadOnboarding, markSeenOnboarding, markStashFresh, isStashFresh, clearOnboarding } from '../lib/onboardingStore';
import { supabase, missingProfileFields } from '../lib/supabase';
import { signOutIntended, orphanedPendingCount, discardOrphaned } from '../lib/accountActions';
import { orphanedSheet } from '../lib/orphanedPending';
import { signOutOutcome } from '../lib/signOutCore';
import { goalOptions } from '../lib/profileGoals';
import { COUNTRIES, countryLabel } from '../lib/countries';
import { PRIVACY_URL } from '../lib/legalLinks';
import { friendlyError } from '../lib/friendlyError';
import { PROFILE_ACTIVITY } from '../lib/activityLevels';
import { activityParts } from '../lib/progressFormat';
import {
  STEPS, birthYearState, activeSteps as stepsFor, canContinue as canGo, formFrom, stashPatch,
  accountPatch, refreshForm, entryStep,
} from '../lib/onboardingSteps';
import AccumulationHero from '../components/AccumulationHero';
import FeatureIcon from '../components/FeatureIcon';
import ReminderSetupList from '../components/ReminderSetupList';
import { readReminderHealth } from '../lib/notifications';
import { setupSteps } from '../lib/reminderHealth';
import { markSetupSeen } from '../lib/reminderSetup';
import CheckMark from '../components/CheckMark';
import SegmentedBar from '../components/SegmentedBar';
import LegalModal from '../components/LegalModal';
import { DTSheet } from './components/ProtocolParts';
import { BottomSheet } from './components/BodySheets';
import Svg, { Path } from 'react-native-svg';
import { MONO } from '../lib/fonts';

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
 * The single value-before-signup onboarding (docs/specs/premium-and-auth.md PA-30…PA-42;
 * prototype onbScreen, approved from the pictures 2026-10-03). The rules live in
 * lib/onboardingSteps.js; this screen renders them.
 *
 * TWO MODES (one screen):
 *  • Pre-account (no `session`): the prototype's 8 steps. Everything typed is stashed
 *    (onboardingStore) as the user goes, and the flow reopens where it was left with the
 *    values kept (Back from Create account lands on "Never miss a dose"). Both buttons of the
 *    last step go to Create account: onDone('create'); "Already have an account? Sign in"
 *    on the welcome screen: onDone('signin').
 *  • Signed-in (`session` passed): an Apple/Google sign-in or a returning account missing
 *    required fields (the build-49 gate). Prefilled from the account, only the missing steps
 *    (+ consent if never recorded), then "Finish setup", which writes only those steps'
 *    fields to the account. A sign-out escape stays in the corner.
 */
const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr', 'month_may', 'month_jun',
  'month_jul', 'month_aug', 'month_sep', 'month_oct', 'month_nov', 'month_dec',
];

export default function OnboardingFlowScreen({ onDone, session }) {
  const { t, language, setLanguage, LANGUAGES } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { width: winW } = useWindowDimensions();
  const heroW = Math.min(420, winW - 32); // 16 pt screen gutter each side
  const thisYear = new Date().getFullYear();

  const signedIn = !!session?.user;
  const meta = (session && session.user && session.user.user_metadata) || {};
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState(null);
  const signOutBusy = useRef(false); // one sign-out at a time (G1)

  // The form. Signed-in: from the account. Pre-account: from the stash (loaded below).
  const [d, setD] = useState(() => formFrom(signedIn ? meta : {}));
  const touched = useRef(new Set());
  const set = (k, v) => { touched.current.add(k); setD((cur) => ({ ...cur, [k]: typeof v === 'function' ? v(cur[k]) : v })); };
  const [ready, setReady] = useState(signedIn);
  const [step, setStep] = useState(0);

  // Pre-account: reopen with what was already entered, at the step the user left
  // (PA-62 — Back from Create account used to restart empty).
  useEffect(() => {
    if (signedIn) return;
    let active = true;
    loadOnboarding().then((stash) => {
      if (!active) return;
      // A stash read back may be someone else's: the consent boxes start empty unless they
      // were ticked in this run (Gate B).
      setD(formFrom(stash, { trustConsent: isStashFresh() }));
      setStep(entryStep(stash, { consentPassed: isStashFresh() }));
      setReady(true);
    }).catch(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  // Signed-in: the person who just answered the onboarding in this run (an Apple/Google
  // sign-up seconds ago) may still be waiting for the deferred write of those answers —
  // show them now, only into fields the account is missing (refreshForm never overwrites).
  // Someone else's answers (not fresh) are never shown here (lib/pendingProfile).
  // Later profile changes fill untouched fields.
  useEffect(() => {
    if (!signedIn || !isStashFresh()) return;
    let active = true;
    loadOnboarding().then((stash) => {
      if (active && stash && Object.keys(stash).length) setD((cur) => refreshForm(cur, { ...stash, ...metaForms(meta) }, touched.current));
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const metaKey = JSON.stringify(meta);
  useEffect(() => {
    if (signedIn) setD((cur) => refreshForm(cur, meta, touched.current));
  }, [metaKey]);

  const [showLang, setShowLang] = useState(false);
  const [showCountry, setShowCountry] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [legal, setLegal] = useState(false);
  // A-112 SP-4 (founder 2026-10-07): Android — after "Turn on notifications", "Make sure your reminders
  // arrive" (items only; there are no protocols yet). Showing it marks it seen on this phone
  // (lib/reminderSetup markSetupSeen), so Today never opens it again.
  const [showSetup, setShowSetup] = useState(false);
  const [setupHealth, setSetupHealth] = useState(null);
  useEffect(() => {
    if (!showSetup) return undefined;
    const load = () => { readReminderHealth().then(setSetupHealth).catch(() => {}); };
    load();
    // Back from an Android settings screen: read the phone again.
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') load(); });
    return () => sub.remove();
  }, [showSetup]);

  // The steps to show (lib/onboardingSteps activeSteps).
  const missingKey = signedIn ? missingProfileFields(session.user).join(',') : '';
  const steps = useMemo(
    () => stepsFor({ signedIn, missing: missingKey ? missingKey.split(',') : [], consentAccepted: !!meta.consent_accepted }),
    [signedIn, missingKey, meta.consent_accepted],
  );
  // Self-heal: right after an Apple/Google sign-up the session + metadata hydrate over a
  // few frames, so the steps can shrink while `step` still points past the new end (the
  // "blank onboarding screen after Sign in with Apple" bug). Clamp step back into range.
  useEffect(() => {
    if (step > steps.length - 1) setStep(Math.max(0, steps.length - 1));
  }, [steps.length, step]);
  const cur = steps[step];

  // Step transition: the new step slides in from the direction you're moving.
  const reduceMotion = useReducedMotion();
  const enter = useSharedValue(1);
  const dir = useSharedValue(0);
  const prevStepRef = useRef(step);
  useEffect(() => {
    const dd = step > prevStepRef.current ? 1 : step < prevStepRef.current ? -1 : 0;
    prevStepRef.current = step;
    if (reduceMotion) { enter.value = 1; return; }
    dir.value = dd;
    enter.value = 0;
    enter.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [step, reduceMotion]);
  const stepStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: 24 * dir.value * (1 - enter.value) }],
  }));

  // Android hardware / swipe back: close an open picker, else step back one; on the first
  // screen let the OS handle it (exit). There must always be a way back.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showSetup) { setShowSetup(false); return true; }
      if (showLang) { setShowLang(false); return true; }
      if (showCountry) { setShowCountry(false); return true; }
      if (step > 0) { back(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [step, showLang, showCountry, showSetup]);

  // Full goal set, shared with the Settings profile editor, alphabetized.
  const GOALS = goalOptions(t);
  const COMPOUNDS = [
    { key: 'peptides', label: t('onboarding_compound_peptides'), icon: 'type_vial' },
    { key: 'hormones', label: t('onboarding_compound_hormones'), icon: 'reconstitution' },
    { key: 'glp1', label: t('onboarding_compound_glp1'), icon: 'type_glp1' },
    { key: 'oral', label: t('onboarding_compound_oral'), icon: 'type_capsule' },
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

  const year = birthYearState(d.birthYearText, thisYear);
  const form = { ...d, birthYear: year.year };
  const canContinue = () => canGo(cur, form);

  async function persist() {
    // Only keys with a value (saveOnboarding merges — an undefined would clobber an earlier step).
    if (!signedIn) await saveOnboarding(stashPatch(form, new Date().toISOString()));
  }

  async function next() {
    if (!canContinue()) return;
    // Passing "Before we begin" is what makes these answers this person's for this run
    // (lib/pendingProfile): from here on they may go into the account they create.
    if (cur === 'consent') markStashFresh();
    await persist();
    if (step < steps.length - 1) setStep(step + 1);
    else finish();
  }
  function back() { if (showSetup) { setShowSetup(false); return; } if (step > 0) setStep(step - 1); }

  async function toAuth(mode) {
    await persist();
    await markSeenOnboarding();
    onDone && onDone(mode);
  }

  async function finish() {
    if (!signedIn) { toAuth('create'); return; }
    // Signed-in: write the shown steps' fields to the account; on error keep everything
    // typed and say so in a DoseTrace sheet. Success clears the gate via USER_UPDATED.
    if (saving) return;
    setSaving(true);
    const data = accountPatch(form, meta, new Date().toISOString(), steps);
    const { error } = await supabase.auth.updateUser({ data });
    setSaving(false);
    if (error) {
      setSheet({ icon: 'alert', title: t('error'), body: friendlyError(error, t, 'error_save_failed'), buttons: [{ label: t('ok'), kind: 'primary' }] });
      return;
    }
    clearOnboarding().catch(() => {}); // written into the account: gone from the device
    await markSeenOnboarding();
  }

  // Escape hatch for a signed-in user who doesn't want to finish the profile —
  // otherwise they'd be trapped on the gate with no way to the app or out.
  // Final Gate B G1: the one deliberate sign-out (lib/accountActions signOutIntended: push first,
  // nothing signed out while changes are not backed up, the phone signs out even offline, never
  // success while still signed in) and its words (lib/signOutCore signOutOutcome), as on the 18+ sheet.
  async function handleSignOut() {
    if (signOutBusy.current) return;
    signOutBusy.current = true;
    try {
      const o = signOutOutcome(await signOutIntended().catch(() => ({ failed: true })));
      // Blocked by entries of a protocol deleted forever on another device (lib/orphanedPending):
      // no "Sign out anyway" here, so offer to discard only those, then try again.
      const n = o.kind === 'blocked' ? await orphanedPendingCount() : 0;
      if (n) setSheet(orphanedSheet({ t, count: n, title: t(o.title), prefix: t(o.body), onKeep: () => {}, onDiscard: () => { discardOrphaned().then(() => handleSignOut()).catch(() => {}); } }));
      else if (o.kind !== 'done') setSheet({ icon: 'alert', title: t(o.title), body: t(o.body), buttons: [{ label: t('ok'), kind: 'primary' }] });
    } finally {
      signOutBusy.current = false;
    }
  }

  // "Never miss a dose": iOS asks for notifications, then Create account (both buttons go
  // there — the "You're all set" step is gone, founder 2026-09-29).
  async function enableNotifications() {
    try { await Notifications.requestPermissionsAsync(); } catch (e) { /* later */ }
    if (Platform.OS === 'android') { await markSetupSeen(); setShowSetup(true); return; } // A-112 SP-4
    toAuth('create');
  }

  const q = countrySearch.toLowerCase();
  const filteredCountries = COUNTRIES.filter((c) => c.toLowerCase().includes(q) || countryLabel(c, language).toLowerCase().includes(q));

  if (!ready) return <SafeAreaView style={s.root} />; // reading the stash (a few ms)

  return (
    <SafeAreaView style={s.root}>
      {(step > 0 || signedIn) && (
        <View style={s.topBar}>
          <TouchableOpacity onPress={back} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} disabled={step === 0} style={[s.backBtn, step === 0 && s.hidden]} accessibilityRole="button" accessibilityLabel={t('back')}>
            <Chevron dir="left" color={colors.ink} />
          </TouchableOpacity>
          <View style={s.progress}>
            {steps.map((_, i) => (<ProgressDash key={i} on={i <= step} s={s} />))}
          </View>
          {signedIn ? (
            <TouchableOpacity onPress={handleSignOut} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={s.signOutBtn} accessibilityRole="button">
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
              <View style={s.splashHead}>
                {/* The droplet app icon (founder 2026-09-07, Q1 = B) — its own artwork, fixed brand colours. */}
                <Image source={require('../assets/adaptive-icon.png')} style={s.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
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
                  const on = d.goals.includes(g.key);
                  return (
                    <TouchableOpacity
                      key={g.key}
                      style={[s.pill, on && s.pillOn]}
                      onPress={() => set('goals', (prev) => (prev.includes(g.key) ? prev.filter((k) => k !== g.key) : [...prev, g.key]))}
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
                  const on = d.tracking.includes(c.key);
                  return (
                    <TouchableOpacity key={c.key} style={[s.pill, s.pillIcon, on && s.pillOn]} onPress={() => set('tracking', (p) => (p.includes(c.key) ? p.filter((k) => k !== c.key) : [...p, c.key]))} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
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
                  value={d.name} onChangeText={(v) => set('name', v)} autoCapitalize="words" autoCorrect={false}
                />
              </View>

              <View style={s.field}>
                <Text style={s.fieldLabel}>{t('profile_birth_month')}<Text style={s.req}> *</Text></Text>
                {/* Month as a full 4-across grid (all 12 visible), year typed. */}
                <View style={s.mGrid}>
                  {MONTH_KEYS.map((mk, idx) => (
                    <TouchableOpacity key={mk} style={[s.pill, s.mChip, d.birthMonth === idx && s.pillOn]} onPress={() => set('birthMonth', idx)} accessibilityRole="radio" accessibilityState={{ selected: d.birthMonth === idx }}>
                      <Text style={[s.pillText, d.birthMonth === idx && s.pillTextOn]}>{t(mk)}</Text>
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
                  value={d.birthYearText}
                  onChangeText={(txt) => set('birthYearText', birthYearState(txt, thisYear).digits)}
                  keyboardType="number-pad"
                  maxLength={4}
                />
                {/* Adults only (18+): say why Continue stays dim — never a silent refusal. */}
                {year.note ? <Text style={s.note}>{t('ob_adult_note').replace('{max}', String(year.max))}</Text> : null}
              </View>

              <View style={s.field}>
                <Text style={s.fieldLabel}>{t('profile_sex')}<Text style={s.req}> *</Text></Text>
                <SegmentedBar accessibilityLabel={t('profile_sex')} items={SEXES} value={d.gender} onChange={(v) => set('gender', v)} />
                <Text style={s.help}>{t('profile_sex_help')}</Text>
              </View>

              <View style={s.field}>
                <Text style={s.fieldLabel}>{t('profile_country')}<Text style={s.req}> *</Text></Text>
                <TouchableOpacity style={s.selectBtn} onPress={() => { setCountrySearch(''); setShowCountry(true); }} accessibilityRole="button">
                  <Text style={[s.selectText, !d.country && s.selectTextEmpty]}>
                    {d.country ? countryLabel(d.country, language) : t('profile_country_placeholder')}
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
                {/* One activity scale everywhere: the calculator's 5 levels, title + sub-line. */}
                <View style={s.actList}>
                  {PROFILE_ACTIVITY.map((a, i) => {
                    const on = d.activity === a.key;
                    const prevOn = i > 0 && d.activity === PROFILE_ACTIVITY[i - 1].key;
                    const parts = activityParts(t(a.labelKey));
                    return (
                      <View key={a.key}>
                        {i > 0 && <View style={[s.actDiv, (on || prevOn) && s.actDivHidden]} />}
                        <TouchableOpacity style={[s.actRow, on && s.actRowOn]} onPress={() => set('activity', a.key)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                          <View style={s.actTexts}>
                            <Text style={s.actText}>{parts[0]}</Text>
                            {parts[1] ? <Text style={s.actSub}>{parts[1]}</Text> : null}
                          </View>
                          {on && <CheckMark size={22} color={colors.ink} />}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>
              <View style={s.field}>
                <Text style={s.fieldHead}>{t('profile_provider')}</Text>
                <SegmentedBar accessibilityLabel={t('profile_provider')} items={PROVIDERS} value={d.provider} onChange={(v) => set('provider', v)} />
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
                {TERMS.map((x, i) => {
                  const on = !!(d.terms && d.terms[x.key]);
                  return (
                    <TouchableOpacity
                      key={x.key}
                      style={[s.termRow, i > 0 && s.termRowDiv]}
                      onPress={() => set('terms', (c) => ({ ...(c || {}), [x.key]: !(c && c[x.key]) }))}
                      activeOpacity={0.8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <View style={[s.check, on && s.checkOn]}>
                        {on && <CheckMark size={16} color={colors.onInk} />}
                      </View>
                      <View style={s.termText}>
                        <Text style={s.termTitle}>{x.t}</Text>
                        <Text style={s.termDesc}>{x.d}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {/* Functional links at the point of data collection (Apple 5.1.1(ii)): the
                  Terms of service (in the app — dosetrace.io has no terms page) and the
                  Privacy policy. */}
              <View style={s.linkRow}>
                <TouchableOpacity onPress={() => setLegal(true)} style={s.linkBtn} accessibilityRole="link">
                  <Text style={s.linkText}>{t('settings_terms')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} style={s.linkBtn} accessibilityRole="link">
                  <Text style={s.linkText}>{t('settings_privacy_policy')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {cur === 'reminders' && showSetup && (
            <View style={{ gap: 14 }}>
              <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: 8 }}>
                <FeatureIcon name="shield" size={56} color={colors.ink} />
                <Text style={[s.title, s.textCenter]}>{t('rc_setup_title')}</Text>
                <Text style={[s.sub, s.textCenter]}>{t('rc_setup_intro')}</Text>
              </View>
              <View style={{ marginHorizontal: -16 }}>
                <ReminderSetupList health={setupHealth} onChange={() => { readReminderHealth().then(setSetupHealth).catch(() => {}); }} />
              </View>
            </View>
          )}

          {cur === 'reminders' && !showSetup && (
            <View style={s.centerStep}>
              <FeatureIcon name="bell" size={76} color={colors.data} />
              <Text style={[s.title, s.textCenter]}>{t('ob_reminders_title')}</Text>
              <Text style={[s.sub, s.textCenter]}>{t('ob_reminders_sub')}</Text>
            </View>
          )}

          {cur === 'finish' && (
            <View style={s.centerStep}>
              <Image source={require('../assets/adaptive-icon.png')} style={s.logoSm} resizeMode="contain" accessibilityIgnoresInvertColors />
              <Text style={[s.title, s.textCenter]}>{t('ob_ready_title')}</Text>
              <Text style={[s.sub, s.textCenter]}>{t('ob_finish_sub')}</Text>
            </View>
          )}

        </ScrollView>
      </Animated.View>

      <View style={s.footer}>
        {cur === 'splash' && (
          <>
            <TouchableOpacity style={s.primaryBtn} onPress={next} accessibilityRole="button">
              <Text style={s.primaryBtnText}>{t('ob_get_started')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.linkBtn} onPress={() => toAuth('signin')} accessibilityRole="button">
              <Text style={s.linkText}>{t('onboarding_already_have_account')}</Text>
            </TouchableOpacity>
          </>
        )}
        {cur === 'reminders' && showSetup && (
          <>
            <TouchableOpacity style={s.primaryBtn} onPress={() => toAuth('create')} accessibilityRole="button">
              <Text style={s.primaryBtnText}>{t(setupHealth && setupSteps(setupHealth).done ? 'rc_setup_done' : 'ob_continue')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.linkBtn} onPress={() => toAuth('create')} accessibilityRole="button">
              <Text style={s.linkText}>{t('ob_setup_later')}</Text>
            </TouchableOpacity>
          </>
        )}
        {cur === 'reminders' && !showSetup && (
          <>
            <TouchableOpacity style={s.primaryBtn} onPress={enableNotifications} accessibilityRole="button">
              <Text style={s.primaryBtnText}>{t('ob_enable_notifs')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.linkBtn} onPress={() => toAuth('create')} accessibilityRole="button">
              <Text style={s.linkText}>{t('ob_not_now')}</Text>
            </TouchableOpacity>
          </>
        )}
        {cur === 'finish' && (
          <TouchableOpacity style={[s.primaryBtn, saving && s.primaryBtnDim]} onPress={finish} disabled={saving} accessibilityRole="button">
            <Text style={s.primaryBtnText}>{t('ob_finish_setup')}</Text>
          </TouchableOpacity>
        )}
        {!['splash', 'reminders', 'finish'].includes(cur) && (
          <TouchableOpacity
            style={[s.primaryBtn, !canContinue() && s.primaryBtnDim]}
            onPress={next}
            disabled={!canContinue()}
            accessibilityRole="button"
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
                    {/* `native` = the localized language name (the objects have no `label`). */}
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

      {/* Country (prototype countrySheet): a bottom sheet with "Country", Done, the search
          field and the list; the chosen country carries the check. */}
      <BottomSheet visible={showCountry} onClose={() => setShowCountry(false)}>
        <View style={s.sheetHead}>
          <Text style={s.sheetTitle}>{t('profile_country')}</Text>
          <TouchableOpacity onPress={() => setShowCountry(false)} style={s.sheetDone} accessibilityRole="button">
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
            autoCapitalize="none" autoCorrect={false}
          />
        </View>
        <View>
          {filteredCountries.map((item, index) => (
            <TouchableOpacity
              key={item}
              style={[s.countryRow, index > 0 && s.countryRowDiv]}
              onPress={() => { set('country', item); setShowCountry(false); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: d.country === item }}
            >
              <Text style={s.countryText}>{countryLabel(item, language)}</Text>
              {d.country === item && <CheckMark size={22} color={colors.ink} />}
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>

      <LegalModal visible={legal} onClose={() => setLegal(false)} title={t('settings_terms')} content={t('settings_terms_body')} doneLabel={t('done')} />
      <DTSheet config={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

// The account's metadata keys as the stash uses them (both are user_metadata-shaped).
function metaForms(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) if (v != null && v !== '' && !(Array.isArray(v) && v.length === 0)) out[k] = v;
  return out;
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

    // Splash (prototype: the block starts 90 pt under the language pill, not centred)
    splashWrap: { flex: 1 },
    langRow: { flexDirection: 'row', justifyContent: 'flex-end' },
    langPill: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', gap: 6 },
    langPillText: { fontSize: 13, color: c.ink2 },
    splashHead: { alignItems: 'center', gap: 14, paddingTop: 90 },
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
    note: { fontSize: 13, lineHeight: 18, color: c.ink, paddingHorizontal: 4 },

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

    // Activity list (actlist): bold title, ink2 sub-line
    actList: { backgroundColor: c.raised, borderRadius: 16, borderWidth: 1, borderColor: c.line, overflow: 'hidden' },
    actRow: { minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 2, borderColor: c.raised },
    actRowOn: { borderColor: c.ink },
    actDiv: { height: 1, backgroundColor: c.line },
    actDivHidden: { backgroundColor: c.raised },
    actTexts: { flex: 1, gap: 2 },
    actText: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
    actSub: { fontSize: 15, lineHeight: 20, color: c.ink2 },

    // Consent list
    termList: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16 },
    termRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
    termRowDiv: { borderTopWidth: 1, borderTopColor: c.line },
    check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: c.tick, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    checkOn: { backgroundColor: c.ink, borderColor: c.ink },
    termText: { flex: 1, gap: 3 },
    termTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
    termDesc: { fontSize: 15, lineHeight: 20, color: c.ink2 },
    linkRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 24 },

    centerStep: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 8 },

    // Footer (obfoot): one ink capsule, then an underlined text button
    footer: { gap: 6, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, backgroundColor: c.ground, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
    primaryBtn: { minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    primaryBtnDim: { opacity: 0.35 },
    primaryBtnText: { fontSize: 17, fontWeight: '700', color: c.onAct },
    linkBtn: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
    linkText: { fontSize: 17, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick, textAlign: 'center' },

    // Language sheet / country sheet heads
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

    searchWrap: { justifyContent: 'center' },
    searchIcon: { position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 },
    searchInput: { paddingLeft: 42, minHeight: 46 },
    countryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 10 },
    countryRowDiv: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    countryText: { flex: 1, fontSize: 17, color: c.ink },
  });
}
