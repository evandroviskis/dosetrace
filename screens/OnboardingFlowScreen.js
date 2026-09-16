import { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image, Animated,
  StyleSheet, useWindowDimensions, Modal, FlatList, BackHandler, Alert, Linking,
} from 'react-native';
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
  const heroW = Math.min(420, winW - 48);

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

  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [step]);

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

  function toggleTracking(key) {
    setTracking((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  }

  const canContinue = () => {
    const cur = activeSteps[step];
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
          <TouchableOpacity onPress={back} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} disabled={step === 0} style={step === 0 ? { opacity: 0 } : null}>
            <Text style={s.backChevron}>‹</Text>
          </TouchableOpacity>
          <View style={s.progress}>
            {activeSteps.map((_, i) => (<View key={i} style={[s.dash, i <= step && s.dashOn]} />))}
          </View>
          {signedIn ? (
            <TouchableOpacity onPress={handleSignOut} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={s.signOutLink}>{t('settings_signout')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>
      )}

      <Animated.View style={{ flex: 1, opacity: fade }}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          {cur === 'splash' && (
            <View style={s.splashWrap}>
              <TouchableOpacity style={s.langChip} onPress={() => setShowLang(true)}>
                <Text style={s.langChipText}>{String(language).toUpperCase()} ▾</Text>
              </TouchableOpacity>
              <Image source={require('../assets/adaptive-icon.png')} style={s.logo} resizeMode="contain" />
              <Text style={s.brand}>DoseTrace</Text>
              <Text style={s.phrase}>{t('ob_phrase')}</Text>
            </View>
          )}

          {cur === 'features' && (
            <>
              <Text style={s.title}>{t('ob_features_title')}</Text>
              <Text style={s.sub}>{t('ob_features_sub')}</Text>
              <AccumulationHero width={heroW} height={140} />
              <View style={{ marginTop: 8 }}>
                {FEATURES.map((f, i) => (
                  <View key={i} style={s.featRow}>
                    <View style={s.featIcon}><FeatureIcon name={f.icon} size={24} color={colors.accent} /></View>
                    <View style={{ flex: 1 }}>
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
              <Text style={s.title}>{t('ob_goal_title')}</Text>
              <Text style={s.sub}>{t('ob_goal_sub')}</Text>
              <Text style={s.multiHint}>{t('profile_goal_multi_hint')}</Text>
              <View style={s.pillRow}>
                {GOALS.map((g) => {
                  const on = goals.includes(g.key);
                  return (
                    <TouchableOpacity
                      key={g.key}
                      style={[s.pill, on && s.pillOn]}
                      onPress={() => setGoals((prev) => (prev.includes(g.key) ? prev.filter((k) => k !== g.key) : [...prev, g.key]))}
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
              <Text style={s.title}>{t('onboarding_compound_title')}</Text>
              <Text style={s.sub}>{t('onboarding_compound_sub')}</Text>
              <View style={s.pillRow}>
                {COMPOUNDS.map((c) => (
                  <TouchableOpacity key={c.key} style={[s.pill, { flexDirection: 'row', alignItems: 'center', gap: 8 }, tracking.includes(c.key) && s.pillOn]} onPress={() => toggleTracking(c.key)}>
                    <FeatureIcon name={c.icon} size={18} color={tracking.includes(c.key) ? colors.accent : colors.textMuted} />
                    <Text style={[s.pillText, tracking.includes(c.key) && s.pillTextOn]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {cur === 'about' && (
            <>
              <Text style={s.title}>{t('profile_step_title')}</Text>
              <Text style={s.sub}>{t('profile_step_sub_required')}</Text>
              <Text style={s.legend}>{t('profile_required_legend')}</Text>

              {/* ── About you ─────────────────────────────────────────── */}
              <Text style={s.section}>{t('profile_sec_about')}</Text>

              <View style={s.field}>
                <Text style={s.fieldLabel}>{t('profile_name')}<Text style={s.req}> *</Text></Text>
                <TextInput
                  style={s.input}
                  placeholder={t('profile_name_placeholder')}
                  placeholderTextColor={colors.textFaint}
                  value={name} onChangeText={setName} autoCapitalize="words" autoCorrect={false}
                />
              </View>

              <View style={s.field}>
                <Text style={s.fieldLabel}>{t('profile_birth_month')}<Text style={s.req}> *</Text></Text>
                {/* Month as a full 4-across grid (all 12 visible), year typed —
                    scrolling through ~70 years horizontally was the bad UX. */}
                <View style={s.mGrid}>
                  {MONTH_KEYS.map((mk, idx) => (
                    <TouchableOpacity key={mk} style={[s.mChip, birthMonth === idx && s.pillOn]} onPress={() => setBirthMonth(idx)}>
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
                  placeholderTextColor={colors.textFaint}
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
                <View style={s.mRow}>
                  {SEXES.map((g) => (
                    <TouchableOpacity key={g.key} style={[s.pill, gender === g.key && s.pillOn]} onPress={() => setGender(g.key)}>
                      <Text style={[s.pillText, gender === g.key && s.pillTextOn]}>{g.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={s.sexHelp}>{t('profile_sex_help')}</Text>
              </View>

              <View style={s.field}>
                <Text style={s.fieldLabel}>{t('profile_country')}<Text style={s.req}> *</Text></Text>
                <TouchableOpacity style={[s.input, { justifyContent: 'center' }]} onPress={() => { setCountrySearch(''); setShowCountry(true); }}>
                  <Text style={{ fontSize: 15, color: country ? colors.text : colors.textFaint }}>
                    {country ? countryLabel(country, language) : t('profile_country_placeholder')}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {cur === 'routine' && (
            <>
              <Text style={s.title}>{t('ob_routine_title')}</Text>
              <View style={s.field}>
                <Text style={s.fieldLabel}>{t('profile_activity')}</Text>
                <View style={s.mRow}>
                  {ACTIVITY.map((a) => (
                    <TouchableOpacity key={a.key} style={[s.pill, activity === a.key && s.pillOn]} onPress={() => setActivity(a.key)}>
                      <Text style={[s.pillText, activity === a.key && s.pillTextOn]}>{a.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={s.field}>
                <Text style={s.fieldLabel}>{t('profile_provider')}</Text>
                <View style={s.mRow}>
                  {PROVIDERS.map((p) => (
                    <TouchableOpacity key={p.key} style={[s.pill, provider === p.key && s.pillOn]} onPress={() => setProvider(p.key)}>
                      <Text style={[s.pillText, provider === p.key && s.pillTextOn]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}

          {cur === 'consent' && (
            <>
              <Text style={s.title}>{t('ob_terms_title')}</Text>
              <Text style={s.sub}>{t('ob_terms_sub')}</Text>
              {TERMS.map((x) => (
                <TouchableOpacity
                  key={x.key}
                  style={[s.termRow, confirmed[x.key] && s.termRowOn]}
                  onPress={() => setConfirmed((c) => ({ ...c, [x.key]: !c[x.key] }))}
                  activeOpacity={0.8}
                >
                  <View style={[s.check, confirmed[x.key] && s.checkOn]}>
                    {confirmed[x.key] && <Text style={s.checkMark}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.termTitle}>{x.t}</Text>
                    <Text style={s.termDesc}>{x.d}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {/* Functional privacy-policy link at the point of data collection
                  (Apple 5.1.1(ii)). */}
              <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} style={{ paddingVertical: 14, alignItems: 'center' }}>
                <Text style={s.privacyLink}>{t('settings_privacy_policy')}</Text>
              </TouchableOpacity>
            </>
          )}

          {cur === 'reminders' && (
            <View style={s.centerStep}>
              <View style={{ marginBottom: 12 }}><FeatureIcon name="bell" size={52} color={colors.accent} /></View>
              <Text style={s.title}>{t('ob_reminders_title')}</Text>
              <Text style={s.sub}>{t('ob_reminders_sub')}</Text>
            </View>
          )}

          {cur === 'ready' && (
            <View style={s.centerStep}>
              <Image source={require('../assets/adaptive-icon.png')} style={s.logoSm} resizeMode="contain" />
              <Text style={s.title}>{t('ob_ready_title')}</Text>
              <Text style={s.sub}>{signedIn ? t('ob_finish_sub') : t('ob_ready_sub')}</Text>
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
            <TouchableOpacity style={s.skip} onPress={() => onDone && onDone()}>
              <Text style={s.skipText}>{t('onboarding_already_have_account')}</Text>
            </TouchableOpacity>
          </>
        )}
        {cur === 'reminders' && (
          <>
            <TouchableOpacity style={s.primaryBtn} onPress={enableNotifications}>
              <Text style={s.primaryBtnText}>{t('ob_enable_notifs')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.skip} onPress={() => setStep(step + 1)}>
              <Text style={s.skipText}>{t('ob_not_now')}</Text>
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
            style={[s.primaryBtn, !canContinue() && { opacity: 0.4 }]}
            onPress={next}
            disabled={!canContinue()}
          >
            <Text style={s.primaryBtnText}>{t('ob_continue')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Language picker */}
      <Modal visible={showLang} animationType="fade" transparent onRequestClose={() => setShowLang(false)}>
        <TouchableOpacity style={s.langBackdrop} activeOpacity={1} onPress={() => setShowLang(false)}>
          <View style={s.langSheet}>
            {(LANGUAGES || []).map((l, i) => {
              const on = language === l.code;
              return (
                <TouchableOpacity
                  key={l.code}
                  style={[s.langOpt, i > 0 && s.langDiv, on && s.langOptOn]}
                  onPress={() => { setLanguage(l.code); setShowLang(false); }}
                >
                  {/* Use `native` (the localized language name) — the LANGUAGES
                      objects have code/name/native/flag, NO `label`, so `l.label`
                      rendered as blank rows (invisible picker). Color is an explicit
                      theme token on both states so it can't go white-on-white either. */}
                  <Text style={[s.langOptText, on && s.langOptTextOn]}>{l.native}</Text>
                  {on && <Text style={s.langCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Country picker */}
      <Modal visible={showCountry} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCountry(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={s.pickerHead}>
            <View style={{ minWidth: 60 }} />
            <Text style={s.pickerTitle}>{t('profile_country')}</Text>
            <TouchableOpacity onPress={() => setShowCountry(false)} style={{ minWidth: 60, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 14, color: colors.accent, fontWeight: '600' }}>{t('done')}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
            <TextInput
              style={s.input}
              placeholder={t('profile_country_search')}
              placeholderTextColor={colors.textFaint}
              value={countrySearch} onChangeText={setCountrySearch}
              autoCapitalize="none" autoCorrect={false} autoFocus
            />
          </View>
          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => item}
            style={{ flex: 1, paddingHorizontal: 20 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.countryRow, country === item && s.countryRowOn]}
                onPress={() => { setCountry(item); setShowCountry(false); }}
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

function makeStyles(colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, gap: 12 },
    backChevron: { fontSize: 30, color: colors.textFaint, lineHeight: 30, width: 24 },
    signOutLink: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
    progress: { flex: 1, flexDirection: 'row', gap: 5 },
    dash: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.card2 },
    dashOn: { backgroundColor: colors.accent },
    content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24, flexGrow: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
    splashWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    langChip: { position: 'absolute', top: 4, right: 0, paddingVertical: 6, paddingHorizontal: 8 },
    langChipText: { fontSize: 13, color: colors.textMuted, fontWeight: '700' },
    logo: { width: 128, height: 128, marginBottom: 18 },
    logoSm: { width: 84, height: 84, marginBottom: 14 },
    brand: { fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
    phrase: { fontSize: 16, color: colors.textFaint, marginTop: 8, textAlign: 'center' },
    title: { fontSize: 25, fontWeight: '800', color: colors.text, letterSpacing: -0.3, textAlign: 'center' },
    sub: { fontSize: 14.5, color: colors.textFaint, textAlign: 'center', marginTop: 8, marginBottom: 14, lineHeight: 20 },
    multiHint: { fontSize: 12.5, color: colors.textMuted, textAlign: 'center', marginTop: -6, marginBottom: 14 },
    reqLegend: { fontSize: 12.5, color: colors.textMuted, textAlign: 'center', marginTop: -8, marginBottom: 4 },
    privacyLink: { fontSize: 13.5, fontWeight: '700', color: colors.accent, textDecorationLine: 'underline' },
    legend: { fontSize: 12, color: colors.textFaint, textAlign: 'center', marginTop: 6, marginBottom: 4 },
    req: { color: colors.danger, fontWeight: '800' },
    // Section heading — bold, with a top hairline that reads as the divider.
    section: { fontSize: 15, fontWeight: '800', color: colors.text, letterSpacing: -0.2, marginTop: 28, marginBottom: 2, paddingTop: 16, borderTopWidth: 0.5, borderTopColor: colors.border },
    field: { marginTop: 16 },
    // Quiet micro-label — lighter than the option chips so it never reads flush.
    fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.textFaint, marginBottom: 8 },
    // Month picker: 4-across uniform grid of rounded-rect chips.
    mGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    mChip: { width: '22%', flexGrow: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, backgroundColor: colors.card2, borderWidth: 0.5, borderColor: colors.border },
    // Left-aligned option row (sex, etc.) — distinct from the centered pill clouds.
    mRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    sexHelp: { fontSize: 12, color: colors.textFaint, marginTop: 8, lineHeight: 16 },
    input: {
      backgroundColor: colors.card2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
      fontSize: 15, color: colors.text, borderWidth: 0.5, borderColor: colors.border, minHeight: 48,
    },
    hScroll: { maxHeight: 46, marginBottom: 2 },
    hRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, justifyContent: 'flex-start' },
    pill: { paddingHorizontal: 15, paddingVertical: 11, borderRadius: 999, backgroundColor: colors.card2, borderWidth: 0.5, borderColor: colors.border },
    chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.card2, borderWidth: 0.5, borderColor: colors.border },
    pillOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 1.5 },
    pillText: { fontSize: 14, fontWeight: '600', color: colors.text },
    pillTextOn: { color: colors.accentSoftText },
    featRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11 },
    featIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    featTitle: { fontSize: 15.5, fontWeight: '700', color: colors.text },
    featDesc: { fontSize: 13, color: colors.textFaint, marginTop: 2, lineHeight: 17 },
    termRow: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, backgroundColor: colors.card2, borderWidth: 0.5, borderColor: colors.border, marginTop: 10 },
    termRowOn: { borderColor: colors.accent, borderWidth: 1.5, backgroundColor: colors.accentSoft },
    check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    checkMark: { color: colors.accentText, fontSize: 14, fontWeight: '800' },
    termTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    termDesc: { fontSize: 12.5, color: colors.textFaint, marginTop: 2, lineHeight: 17 },
    centerStep: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    footer: { paddingHorizontal: 24, paddingBottom: 12, paddingTop: 6, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
    primaryBtn: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 54 },
    primaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.accentText },
    skip: { alignItems: 'center', paddingVertical: 14, marginTop: 2 },
    skipText: { fontSize: 14, fontWeight: '600', color: colors.textFaint },
    langBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', paddingHorizontal: 40 },
    langSheet: { backgroundColor: colors.card, borderRadius: 16, paddingVertical: 6, borderWidth: 0.5, borderColor: colors.border },
    langOpt: { paddingVertical: 13, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    langDiv: { borderTopWidth: 0.5, borderTopColor: colors.border },
    langOptOn: { backgroundColor: colors.accentSoft },
    langOptText: { fontSize: 15, fontWeight: '600', color: colors.text },
    langOptTextOn: { color: colors.accent, fontWeight: '800' },
    langCheck: { fontSize: 16, fontWeight: '800', color: colors.accent },
    pickerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border },
    pickerTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
    countryRow: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: colors.card2, borderRadius: 12, marginBottom: 8, borderWidth: 0.5, borderColor: colors.border },
    countryRowOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 1.5 },
  });
}
