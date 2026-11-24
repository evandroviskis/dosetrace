import { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image,
  StyleSheet, BackHandler, Linking, Platform,
} from 'react-native';
import Modal from '../components/PresenceModal';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing, useReducedMotion,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useLanguage } from '../i18n/LanguageContext';
import { fillStoreText } from '../lib/storeText';
import { useTheme } from '../lib/theme';
import { useSheetGap } from '../components/useSheetInset';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { saveOnboarding, loadOnboarding, markSeenOnboarding, markStashFresh, isStashFresh, clearOnboarding } from '../lib/onboardingStore';
import { draftStore } from '../lib/onboardingDraftStore';
import { supabase, missingProfileFields } from '../lib/supabase';
import { signOutIntended } from '../lib/accountActions';
import { signOutSheet } from '../lib/deviceCopy';
import { runSignOut } from '../lib/settingsSignOut';
import { createBusyGuard } from '../lib/busyGuard';
import { COUNTRIES, countryLabel } from '../lib/countries';
import { PRIVACY_URL } from '../lib/legalLinks';
import { friendlyError } from '../lib/friendlyError';
import { errorSheet } from '../lib/errorSheet';
import { answerGate } from '../lib/pendingGateStore';
import { PROFILE_ACTIVITY } from '../lib/activityLevels';
import { activityParts } from '../lib/progressFormat';
import {
  STEPS, PROTOCOL_STEPS, HELP_OPTIONS, toggleHelp, nextStep, prevStep, skipTarget,
  birthYearState, activeSteps as stepsFor, canContinue as canGo, formFrom, stashPatch,
  accountPatch, refreshForm, entryStep, resumeAfterConsent, stepNear,
} from '../lib/onboardingSteps';
import { reminderLine } from '../lib/onboardingDraft';
import OnboardingIntro from '../components/OnboardingIntro';
import OnboardingProtocolSteps, { stepTitle, weekdayPhrase } from './components/OnboardingProtocolSteps';
import { purposeFromProfile } from '../lib/protocolPurpose';
import { compoundIdFor, freezeStart } from '../lib/onboardingDraft';
import GoalTiles from '../components/GoalTiles';
import FeatureIcon from '../components/FeatureIcon';
import CompoundPills, { compoundPillStyles } from '../components/CompoundPills';
import { toggleKey } from '../lib/trackingTypes';
import ReminderConversation from '../components/ReminderConversation';
import { markSetupSeen } from '../lib/reminderSetup';
import { askAndRemember } from '../lib/notifBlocked';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CheckMark from '../components/CheckMark';
import { Analytics } from '../lib/analytics';
import { onboardingFunnel } from '../lib/onboardingFunnelStore';
import useKeyboardLift from '../components/useKeyboardLift';
import SegmentedBar from '../components/SegmentedBar';
import LegalModal from '../components/LegalModal';
import { DTSheet } from './components/ProtocolParts';
import { BottomSheet } from './components/BodySheets';
import Svg, { Path } from 'react-native-svg';
import { MONO } from '../lib/fonts';
import { SexWhy, SexChangeNote } from '../components/SexAtBirthWhy';
import { isSex, sexChangeNoteShown } from '../lib/sexAtBirth';

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
 * The single value-before-signup onboarding (docs/specs/onboarding-protocol.md OB-1..OB-25, signed by
 * the founder 2026-11-20; picture docs/design/onboarding-protocolo.html). The rules live in
 * lib/onboardingSteps.js and lib/onboardingDraft.js; this screen renders them.
 *
 * THREE MODES (one screen):
 *  • Pre-account (no `session`): the intro video (OB-27), "Como o DoseTrace pode ajudar
 *    você?", the goals, the Terms, what she uses, her first protocol (kept on the phone as a draft,
 *    lib/onboardingDraftStore — never in the database before the account), About you with the
 *    routine (OP-1) and the reminders. Everything typed is kept as she goes and the flow reopens
 *    where it was left. Both buttons of the last step go to Create account: onDone('create');
 *    "Already have an account? Sign in" on the welcome screen: onDone('signin').
 *  • Signed-in (`session` passed): an Apple/Google sign-in or a returning account missing required
 *    fields (the build-49 gate). Prefilled from the account, only the missing steps (+ consent if
 *    never recorded), then "Finish setup", which writes only those steps' fields to the account.
 *  • Builder (`session` + mode="builder", OB-26): an account 15+ days old that never created a
 *    protocol builds it with the same protocol screens; onBuilderDone(protocol | null).
 */
const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr', 'month_may', 'month_jun',
  'month_jul', 'month_aug', 'month_sep', 'month_oct', 'month_nov', 'month_dec',
];

export default function OnboardingFlowScreen({ onDone, session, mode, onBuilderDone }) {
  // A-152: the name and birth year fields stay above the keyboard (iPhone and Android).
  const kb = useKeyboardLift();
  const { t, language, setLanguage, LANGUAGES, timeFormat } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const thisYear = new Date().getFullYear();

  const builder = mode === 'builder';
  const signedIn = !!session?.user;
  const meta = (session && session.user && session.user.user_metadata) || {};
  // A-139 C: the account's saved Sex at birth (signed-in only); pre-account it is a first choice.
  const savedGender = signedIn && isSex(meta.gender) ? meta.gender : null;
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState(null);
  const signOutGuard = useMemo(() => createBusyGuard(), []); // one sign-out at a time (G1)

  // The form. Signed-in: from the account. Pre-account: from the stash (loaded below).
  const [d, setD] = useState(() => formFrom(signedIn ? meta : {}));
  const touched = useRef(new Set());
  const set = (k, v) => { touched.current.add(k); setD((cur) => ({ ...cur, [k]: typeof v === 'function' ? v(cur[k]) : v })); };
  // The draft (OB-8 help choices, the protocol, "Montar depois"): its own durable store (OB-22).
  const [help, setHelp] = useState([]);
  const [protocol, setProtocol] = useState(null);
  const [skipped, setSkipped] = useState(false);
  const [ready, setReady] = useState(signedIn);
  const [cur, setCur] = useState(builder ? 'compound' : signedIn ? null : 'splash');
  const resumeTo = useRef(null); // the step to reopen once the consent is confirmed again (entryStep)
  // The intro video (components/OnboardingIntro, founder 2026-11-24): the Android back asks it first
  // (its Voltar, the scene before); Back from the step after it reopens it on its end frame, never
  // from the start (the founder saw the presentation restart).
  const introBack = useRef(null);
  const introAtEnd = useRef(false);
  // Council 2026-11-20: where people stop (step names only). Before the account the steps wait on the
  // phone (lib/onboardingFunnel) and go as one event after the sign-in; signed in, each step is logged.
  useEffect(() => {
    if (!cur) return;
    if (signedIn) Analytics.viewed('ob_' + cur);
    else onboardingFunnel.note(cur);
  }, [cur, signedIn]);

  // Pre-account: reopen with what was already entered, at the step the user left
  // (PA-62 — Back from Create account used to restart empty).
  useEffect(() => {
    if (signedIn) return;
    let active = true;
    Promise.all([loadOnboarding(), draftStore.load()]).then(([stash, draft]) => {
      if (!active) return;
      // A stash read back may be someone else's: the consent boxes start empty unless they
      // were ticked in this run (Gate B).
      setD(formFrom(stash, { trustConsent: isStashFresh() }));
      if (draft) { setHelp(Array.isArray(draft.help) ? draft.help : []); setProtocol(draft.protocol || null); setSkipped(!!draft.skipped); }
      resumeTo.current = resumeAfterConsent(stash, draft && draft.lastStep);
      setCur(entryStep(stash, { consentPassed: isStashFresh(), lastStep: draft && draft.lastStep }));
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
      if (active && stash && Object.keys(stash).length) setD((c) => refreshForm(c, { ...stash, ...metaForms(meta) }, touched.current));
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const metaKey = JSON.stringify(meta);
  useEffect(() => {
    if (signedIn) setD((c) => refreshForm(c, meta, touched.current));
  }, [metaKey]);

  const [showLang, setShowLang] = useState(false);
  const langGap = useSheetGap(30); // A-136 (2)
  const [showCountry, setShowCountry] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [legal, setLegal] = useState(false);
  // A-112 SP-4 (founder 2026-10-07): Android — after "Turn on notifications", "Make sure your reminders
  // arrive" (items only; there are no protocols yet). Showing it marks it seen on this phone
  // (lib/reminderSetup markSetupSeen), so Today never opens it again. RS-8 (2026-11-05): it is the
  // conversation (components/ReminderConversation, mode onboarding), which reads the phone again on
  // every return from Android by itself.
  const [showSetup, setShowSetup] = useState(false);

  // The steps to show (lib/onboardingSteps activeSteps), by NAME (a list that changes under the
  // screen — "Como vem" appearing, "Montar depois" — never skips or repeats a step).
  const missingKey = signedIn ? missingProfileFields(session.user).join(',') : '';
  const steps = useMemo(
    () => stepsFor({ signedIn, mode, protocol, skipped, missing: missingKey ? missingKey.split(',') : [], consentAccepted: !!meta.consent_accepted }),
    [signedIn, mode, protocol, skipped, missingKey, meta.consent_accepted],
  );
  // Self-heal: right after an Apple/Google sign-up the session + metadata hydrate over a few frames,
  // so the steps can change while `cur` names a step no longer in the list (the "blank onboarding
  // screen after Sign in with Apple" bug): fall back to the first step (signed-in) or keep the order.
  useEffect(() => {
    if (!ready) return;
    if (!cur || !steps.includes(cur)) setCur(stepNear(steps, cur));
  }, [steps, cur, ready]);
  const step = Math.max(0, steps.indexOf(cur));

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

  // Android hardware / swipe back: close an open picker; on the intro video, its Voltar (the scene
  // before, complete); else step back one; on the first screen let the OS handle it (exit). There
  // must always be a way back.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showSetup) { setShowSetup(false); return true; }
      if (showLang) { setShowLang(false); return true; }
      if (showCountry) { setShowCountry(false); return true; }
      if (cur === 'intro' && introBack.current && introBack.current()) return true;
      if (step > 0) { back(); return true; }
      if (builder) { onBuilderDone && onBuilderDone(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [step, showLang, showCountry, showSetup, cur, steps]);

  const PROVIDERS = [
    { key: 'yes', label: t('profile_provider_yes') },
    { key: 'no', label: t('profile_provider_no') },
  ];
  // Sex ASSIGNED AT BIRTH — a physiological input for the calorie/BMR math.
  const SEXES = [
    { key: 'male', label: t('profile_gender_male') },
    { key: 'female', label: t('profile_gender_female') },
  ];
  const TERMS = [
    { key: 'med', t: t('ob_term1_t'), d: t('ob_term1_d') },
    { key: 'est', t: t('ob_term2_t'), d: t('ob_term2_d') },
    { key: 'ai', t: t('ob_term3_t'), d: t('ob_term3_d') },
    { key: 'priv', t: t('ob_term4_t'), d: t('ob_term4_d') },
  ];

  const year = birthYearState(d.birthYearText, thisYear);
  const form = { ...d, birthYear: year.year, help, protocol, language, now: new Date() };
  const canContinue = () => canGo(cur, form);

  async function persist(over = {}) {
    // Only keys with a value (saveOnboarding merges — an undefined would clobber an earlier step).
    if (!signedIn) {
      await saveOnboarding(stashPatch(form, new Date().toISOString()));
      // The draft: its own key, with the language the numbers were typed in (OB-22).
      await draftStore.save({ help, protocol, skipped, language, ...over });
    }
  }

  async function next() {
    if (!canContinue()) return;
    // Passing "Before we begin" is what makes these answers this person's for this run
    // (lib/pendingProfile): from here on they may go into the account they create.
    if (cur === 'consent') markStashFresh();
    const over = {};
    if (cur === 'start') { const frozen = freezeStart(protocol, new Date()); setProtocol(frozen); over.protocol = frozen; }
    if (cur === 'ready') {
      // PQ-14: the protocol keeps the goals from her profile that map to it ("Para: …" on this screen).
      const withPurpose = { ...(protocol || {}), purpose: purposeFromProfile(builder ? meta.primary_goal : d.goals, protocol && protocol.form, compoundIdFor(protocol)) };
      if (builder) { onBuilderDone && onBuilderDone(withPurpose); return; }
      setProtocol(withPurpose);
      over.protocol = withPurpose;
    }
    // The protocol steps are back in when she builds after a "Montar depois" (OB-20).
    if (PROTOCOL_STEPS.includes(cur) && skipped) setSkipped(false);
    let n = nextStep(steps, cur);
    // A kill earlier in this flow reopened it on the consent: after it, back to where she was.
    if (cur === 'consent' && resumeTo.current && steps.includes(resumeTo.current)) n = resumeTo.current;
    resumeTo.current = null;
    if (n) over.lastStep = n;
    await persist(over);
    introAtEnd.current = false; // forward into the video: it plays from the start
    if (n) setCur(n);
    else finish();
  }
  function back() {
    if (showSetup) { setShowSetup(false); return; }
    // Back from About you after "Montar depois": the protocol screens come back, with what was typed.
    if (cur === 'about' && skipped && !signedIn) {
      const again = stepsFor({ signedIn: false, protocol, skipped: false }).filter((x) => PROTOCOL_STEPS.includes(x));
      setSkipped(false);
      setCur(again.find((x) => x !== 'ready' && !canGo(x, form)) || 'ready'); // the first one still to answer
      return;
    }
    const p = prevStep(steps, cur);
    introAtEnd.current = p === 'intro';
    if (p) setCur(p); // Back keeps every answer (OB-20)
  }
  // OB-20: "Montar depois" → the protocol is not built and the onboarding goes on (the draft keeps
  // what was typed, unused). The intro video's "Pular" is its own (components/OnboardingIntro).
  async function skip() {
    const target = skipTarget(cur);
    if (!target) return;
    if (PROTOCOL_STEPS.includes(cur)) {
      setSkipped(true);
      await persist({ skipped: true });
    }
    setCur(target);
  }

  async function toAuth(authMode) {
    await persist();
    // The draft belongs to whoever goes on to Create account / Sign in from here (OB-22): the
    // persisted hand-off is its owner marker after an app kill (e.g. while confirming the email).
    await draftStore.markHandoff().catch(() => {});
    await markSeenOnboarding();
    onDone && onDone(authMode);
  }

  async function finish() {
    if (!signedIn) { toAuth('create'); return; }
    // Signed-in: write the shown steps' fields to the account; on a refusal keep everything
    // typed and say so in a DoseTrace sheet. Success clears the gate via USER_UPDATED.
    // DV-114 (DL-92): offline, the answer is kept on this phone (lib/pendingGateStore) and goes to
    // the account when the internet is back; App.js opens the app at once and the toast says so.
    if (saving) return;
    setSaving(true);
    const data = accountPatch(form, meta, new Date().toISOString(), steps);
    const r = await answerGate({ userId: session.user.id, patch: data, write: () => supabase.auth.updateUser({ data }) });
    setSaving(false);
    if (r.status === 'failed') {
      setSheet(errorSheet(t, 'save', friendlyError(r.error, t, 'error_save_failed'))); // DV-233
      return;
    }
    clearOnboarding().catch(() => {}); // written into the account (or kept for it on this phone, DV-114): gone from the stash
    await markSeenOnboarding();
  }

  // Escape hatch for a signed-in user who doesn't want to finish the profile —
  // otherwise they'd be trapped on the gate with no way to the app or out.
  // Final Gate B G1: the one deliberate sign-out (lib/accountActions signOutIntended: push first, the
  // phone signs out even offline, never success while still signed in), through the one flow
  // (lib/settingsSignOut runSignOut) and the one sheet (A-119 OD-9: never blocked — "Sign out anyway").
  async function handleSignOut() {
    await runSignOut({
      signOut: (opts) => signOutIntended(opts),
      guard: signOutGuard,
      onFailed: () => setSheet(errorSheet(t, 'signout', t('settings_signout_failed_body'))), // DV-233
      onBlocked: (r, anyway) => setSheet(signOutSheet({ t, language, timeFormat, offline: r.offline, summary: r.summary, lastBackup: r.lastBackup, onAnyway: anyway, onStay: () => {} })),
    });
  }

  // "Never miss a dose": iOS asks for notifications, then Create account (both buttons go
  // there — the "You're all set" step is gone, founder 2026-09-29). OB-24: the permission is asked
  // only here.
  // NB-2: the answer is remembered as the person's own choice, never followed by the blocked sheet.
  async function enableNotifications() {
    await askAndRemember(Notifications, AsyncStorage);
    if (Platform.OS === 'android') { await markSetupSeen(); setShowSetup(true); return; } // A-112 SP-4
    toAuth('create');
  }

  const q = countrySearch.toLowerCase();
  const filteredCountries = COUNTRIES.filter((c) => c.toLowerCase().includes(q) || countryLabel(c, language).toLowerCase().includes(q));

  if (!ready || !cur) return <SafeAreaView style={s.root} />; // reading the stash (a few ms)

  const isProtocolStep = PROTOCOL_STEPS.includes(cur);
  const builtProtocol = protocol && protocol.name && !skipped ? protocol : null;
  const remindersSub = builtProtocol && builtProtocol.time
    ? reminderLine(builtProtocol, { t, timeFormat, language, weekdayName: weekdayPhrase(t) })
    : t('ob_reminders_sub');

  return (
    <SafeAreaView style={s.root}>
      {/* OB-27: the intro video is full screen with its own story bars, Pular, Voltar and Avançar / Começar. */}
      {(step > 0 || signedIn) && cur !== 'intro' && (
        <View style={s.topBar}>
          <TouchableOpacity onPress={back} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} disabled={step === 0} style={[s.backBtn, step === 0 && s.hidden]} accessibilityRole="button" accessibilityLabel={t('back')}>
            <Chevron dir="left" color={colors.ink} />
          </TouchableOpacity>
          <View style={s.progress}>
            {steps.map((_, i) => (<ProgressDash key={i} on={i <= step} s={s} />))}
          </View>
          {builder ? (
            // OB-26: shown once, with "Agora não".
            <TouchableOpacity onPress={() => onBuilderDone && onBuilderDone(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={s.signOutBtn} accessibilityRole="button">
              <Text style={s.signOutLink}>{t('ob_builder_close')}</Text>
            </TouchableOpacity>
          ) : signedIn ? (
            <TouchableOpacity onPress={handleSignOut} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={s.signOutBtn} accessibilityRole="button">
              <Text style={s.signOutLink}>{t('settings_signout')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>
      )}

      <Animated.View style={[{ flex: 1 }, stepStyle]}>
        {/* RS-8: Android, after "Turn on notifications" — the conversation for the phone items only;
            its last chip ("Continuar" / "Configurar depois") and "Agora não" go on exactly as before. */}
        {cur === 'intro' ? (
          <OnboardingIntro onDone={next} atEnd={introAtEnd.current} backRef={introBack} />
        ) : cur === 'reminders' && showSetup ? (
          <ReminderConversation mode="onboarding" onContinue={() => toAuth('create')} />
        ) : (
        <ScrollView {...kb.scrollProps} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

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

          {cur === 'help' && (
            <>
              <View style={s.stepHead}>
                <Text style={s.title}>{t('ob_help_title')}</Text>
                <Text style={s.sub}>{t('ob_help_sub')}</Text>
              </View>
              <View style={s.helpList}>
                {HELP_OPTIONS.map((h) => {
                  const on = help.includes(h.key);
                  return (
                    <TouchableOpacity key={h.key} style={[s.helpRow, on && s.helpRowOn]} onPress={() => setHelp((p) => toggleHelp(p, h.key))} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                      <FeatureIcon name={h.icon} size={26} color={on ? colors.ink : colors.ink2} />
                      <Text style={[s.helpText, on && s.helpTextOn]}>{t(h.tKey)}</Text>
                      {on ? <CheckMark size={22} color={colors.ink} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {cur === 'goal' && (
            <>
              <View style={s.stepHead}>
                <Text style={s.title}>{t('ob_goal_title')}</Text>
                <Text style={s.sub}>{t('ob_goal_pick')}</Text>
              </View>
              {/* OB-10 / OB-11: the one goals component, shared with Edit profile (DV-113). */}
              <GoalTiles value={d.goals} onToggle={(key) => set('goals', (p) => toggleKey(p, key))} t={t} />
            </>
          )}

          {cur === 'tracking' && (
            <>
              <View style={s.stepHead}>
                <Text style={s.title}>{t('onboarding_compound_title')}</Text>
                <Text style={s.sub}>{t('onboarding_compound_sub')}</Text>
              </View>
              {/* DV-113: the one component, shared with Edit profile. */}
              <CompoundPills value={d.tracking} onToggle={(key) => set('tracking', (p) => toggleKey(p, key))} t={t} />
            </>
          )}

          {isProtocolStep && (
            <>
              <View style={s.stepHead}>
                {cur === 'compound' && <Text style={s.kicker}>{t('ob_cmp_kicker')}</Text>}
                <Text style={s.title}>{stepTitle(cur, protocol, { t, tracking: d.tracking })}</Text>
              </View>
              <OnboardingProtocolSteps step={cur} p={protocol} setP={setProtocol} tracking={builder ? meta.tracking_types : d.tracking} t={t} language={language} timeFormat={timeFormat} mode={mode} kb={kb} profileGoals={builder ? meta.primary_goal : d.goals} />
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
                  {...kb.fieldProps('name', { next: 'birthYear' })}
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
                  {...kb.fieldProps('birthYear')}
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
                {/* A-139 C: only a signed-in account with a saved value that is being changed. */}
                {sexChangeNoteShown(savedGender, d.gender) ? <SexChangeNote style={s.sexNote} /> : null}
                <Text style={s.help}>{t('profile_sex_help')}</Text>
                {/* A-139 B: the link opens why the app asks. */}
                <SexWhy style={s.sexWhy} />
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

              {/* OP-1 (founder 2026-11-20): the routine is on the same screen as About you. */}
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

          {cur === 'reminders' && !showSetup && (
            <View style={s.centerStep}>
              <FeatureIcon name="bell" size={76} color={colors.data} />
              <Text style={[s.title, s.textCenter]}>{t(builtProtocol ? 'ob_reminders_title_dose' : 'ob_reminders_title')}</Text>
              {/* OB-24: names her dose — "Toda segunda-feira às 08:00, para a Tirzepatida." */}
              <Text style={[s.sub, s.textCenter]}>{remindersSub}</Text>
            </View>
          )}

          {cur === 'finish' && (
            <View style={s.centerStep}>
              <Image source={require('../assets/adaptive-icon.png')} style={s.logoSm} resizeMode="contain" accessibilityIgnoresInvertColors />
              <Text style={[s.title, s.textCenter]}>{t('ob_ready_title')}</Text>
              <Text style={[s.sub, s.textCenter]}>{t('ob_finish_sub')}</Text>
            </View>
          )}

          {kb.spacer}
        </ScrollView>
        )}
      </Animated.View>

      {cur !== 'intro' && (
      <View style={[s.footer, cur === 'reminders' && showSetup && s.footerNone]}>
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
            <Text style={s.primaryBtnText}>{builder && cur === 'ready' ? t('ob_builder_save') : t('ob_continue')}</Text>
          </TouchableOpacity>
        )}
        {/* OB-20: every protocol screen has "Montar depois" (the builder's own exit is "Agora não"). */}
        {isProtocolStep && !builder && (
          <TouchableOpacity style={s.linkBtn} onPress={skip} accessibilityRole="button">
            <Text style={s.linkText}>{t('ob_build_later')}</Text>
          </TouchableOpacity>
        )}
      </View>
      )}

      {/* Language picker (Graduated bottom sheet, prototype.html langSheet()) */}
      <Modal visible={showLang} animationType="fade" transparent onRequestClose={() => setShowLang(false)}>
        <TouchableOpacity style={[s.langBackdrop, { paddingBottom: langGap }]} activeOpacity={1} onPress={() => setShowLang(false)}>
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

      <LegalModal visible={legal} onClose={() => setLegal(false)} title={t('settings_terms')} content={fillStoreText(t('settings_terms_body'), t, Platform.OS)} doneLabel={t('done')} />
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
    progress: { flex: 1, flexDirection: 'row', gap: 3 },
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
    kicker: { fontSize: 13, lineHeight: 16, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: c.data, marginBottom: -8 },
    title: { fontSize: 30, lineHeight: 36, fontWeight: '600', color: c.ink, letterSpacing: -0.6 },
    sub: { fontSize: 17, lineHeight: 22, color: c.ink2 },
    textCenter: { textAlign: 'center' },
    hint: { fontSize: 13, lineHeight: 18, color: c.ink2 },
    help: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },
    // A-139: the field's 10 pt gap already spaces them (picture: note 10 under the bar, link right under the help line).
    sexNote: { marginTop: 0 },
    sexWhy: { marginTop: -10 },
    note: { fontSize: 13, lineHeight: 18, color: c.ink, paddingHorizontal: 4 },

    // OB-8: How DoseTrace can help
    helpList: { gap: 10 },
    helpRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised },
    helpRowOn: { borderWidth: 1.5, borderColor: c.ink },
    helpText: { flex: 1, fontSize: 17, lineHeight: 22, color: c.ink2 },
    helpTextOn: { color: c.ink, fontWeight: '600' },

    // Pills (selection = ink outline on raised) — the one look, shared with Edit profile (DV-113).
    ...compoundPillStyles(c),
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
    footerNone: { paddingTop: 0, paddingBottom: 0 }, // RS-8: the conversation's chips are the step's buttons
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
