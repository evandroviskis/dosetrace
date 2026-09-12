import { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image, Animated,
  StyleSheet, useWindowDimensions, Modal, FlatList, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { saveOnboarding, markSeenOnboarding } from '../lib/onboardingStore';
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
 * with one 9-screen flow. Returning users don't see this; App.js routes them to
 * CompleteProfileScreen for only their missing fields.
 *
 * onDone() — called at the end; App.js flips to the auth (create-account) screen,
 * which reads the stash and creates the account. This flow never signs up itself.
 */
const STEPS = ['splash', 'features', 'goal', 'tracking', 'about', 'routine', 'consent', 'reminders', 'ready'];

const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr', 'month_may', 'month_jun',
  'month_jul', 'month_aug', 'month_sep', 'month_oct', 'month_nov', 'month_dec',
];
const BIRTH_YEARS = [];
const _thisYear = new Date().getFullYear();
for (let y = _thisYear - 18; y >= _thisYear - 90; y--) BIRTH_YEARS.push(y);

export default function OnboardingFlowScreen({ onDone }) {
  const { t, language, setLanguage, LANGUAGES } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { width: winW } = useWindowDimensions();
  const heroW = Math.min(420, winW - 48);

  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState('');
  const [tracking, setTracking] = useState([]);        // tracking_types (>=1 required)
  const [name, setName] = useState('');
  const [birthMonth, setBirthMonth] = useState(null);  // 0-11 index
  const [birthYear, setBirthYear] = useState(null);
  const [gender, setGender] = useState('');
  const [country, setCountry] = useState('');
  const [activity, setActivity] = useState('');
  const [provider, setProvider] = useState('');
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

  const GOALS = [
    { key: 'wellness', label: t('profile_goal_wellness') },
    { key: 'fitness', label: t('profile_goal_fitness') },
    { key: 'body_composition', label: t('profile_goal_body') },
    { key: 'longevity', label: t('profile_goal_longevity') },
    { key: 'athletic', label: t('profile_goal_athletic') },
  ];
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
  const consentDone = TERMS.every((x) => confirmed[x.key]);

  function toggleTracking(key) {
    setTracking((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  }

  const canContinue = () => {
    const cur = STEPS[step];
    if (cur === 'goal') return !!goal;
    if (cur === 'tracking') return tracking.length > 0;
    if (cur === 'about') return !!name.trim() && !!gender && !!country && birthMonth != null && birthYear != null;
    if (cur === 'routine') return !!activity && !!provider;
    if (cur === 'consent') return consentDone;
    return true;
  };

  async function persist() {
    await saveOnboarding({
      display_name: name.trim() || undefined,
      primary_goal: goal || undefined,
      tracking_types: tracking.length ? tracking : undefined,
      gender: gender || undefined,
      country: country || undefined,
      birth_year: birthYear != null ? birthYear : undefined,
      birth_month: birthMonth != null ? birthMonth + 1 : undefined, // store 1-based
      activity_level: activity || undefined,
      has_provider: provider || undefined,
      consent_accepted: consentDone || undefined,
      consent_date: consentDone ? new Date().toISOString() : undefined,
    });
  }

  async function next() {
    if (!canContinue()) return;
    await persist();
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  }
  function back() { if (step > 0) setStep(step - 1); }

  async function finish() {
    await persist();
    await markSeenOnboarding();
    onDone && onDone();
  }

  async function enableNotifications() {
    try { await Notifications.requestPermissionsAsync(); } catch (e) { /* later */ }
    setStep(step + 1);
  }

  const cur = STEPS[step];
  const filteredCountries = COUNTRIES.filter((c) => {
    const q = countrySearch.toLowerCase();
    return c.toLowerCase().includes(q) || countryLabel(c, language).toLowerCase().includes(q);
  });

  return (
    <SafeAreaView style={s.root}>
      {step > 0 && (
        <View style={s.topBar}>
          <TouchableOpacity onPress={back} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={s.backChevron}>‹</Text>
          </TouchableOpacity>
          <View style={s.progress}>
            {STEPS.map((_, i) => (<View key={i} style={[s.dash, i <= step && s.dashOn]} />))}
          </View>
          <View style={{ width: 24 }} />
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
              <View style={s.pillRow}>
                {GOALS.map((g) => (
                  <TouchableOpacity key={g.key} style={[s.pill, goal === g.key && s.pillOn]} onPress={() => setGoal(g.key)}>
                    <Text style={[s.pillText, goal === g.key && s.pillTextOn]}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
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
              <Text style={s.title}>{t('ob_about_title')}</Text>
              <Text style={s.fieldLabel}>{t('profile_name')}</Text>
              <TextInput
                style={s.input}
                placeholder={t('profile_name_placeholder')}
                placeholderTextColor={colors.textFaint}
                value={name} onChangeText={setName} autoCapitalize="words" autoCorrect={false}
              />
              <Text style={s.fieldLabel}>{t('profile_birth')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hScroll}>
                <View style={s.hRow}>
                  {MONTH_KEYS.map((mk, idx) => (
                    <TouchableOpacity key={mk} style={[s.chip, birthMonth === idx && s.pillOn]} onPress={() => setBirthMonth(idx)}>
                      <Text style={[s.pillText, birthMonth === idx && s.pillTextOn]}>{t(mk)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hScroll}>
                <View style={s.hRow}>
                  {BIRTH_YEARS.map((y) => (
                    <TouchableOpacity key={y} style={[s.chip, birthYear === y && s.pillOn]} onPress={() => setBirthYear(y)}>
                      <Text style={[s.pillText, birthYear === y && s.pillTextOn]}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <Text style={s.fieldLabel}>{t('profile_sex')}</Text>
              <View style={s.pillRow}>
                {SEXES.map((g) => (
                  <TouchableOpacity key={g.key} style={[s.pill, gender === g.key && s.pillOn]} onPress={() => setGender(g.key)}>
                    <Text style={[s.pillText, gender === g.key && s.pillTextOn]}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.sexHelp}>{t('profile_sex_help')}</Text>
              <Text style={s.fieldLabel}>{t('profile_country')}</Text>
              <TouchableOpacity style={[s.input, { justifyContent: 'center' }]} onPress={() => { setCountrySearch(''); setShowCountry(true); }}>
                <Text style={{ fontSize: 15, color: country ? colors.text : colors.textFaint }}>
                  {country ? countryLabel(country, language) : t('profile_country_placeholder')}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {cur === 'routine' && (
            <>
              <Text style={s.title}>{t('ob_routine_title')}</Text>
              <Text style={s.fieldLabel}>{t('profile_activity')}</Text>
              <View style={s.pillRow}>
                {ACTIVITY.map((a) => (
                  <TouchableOpacity key={a.key} style={[s.pill, activity === a.key && s.pillOn]} onPress={() => setActivity(a.key)}>
                    <Text style={[s.pillText, activity === a.key && s.pillTextOn]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.fieldLabel}>{t('profile_provider')}</Text>
              <View style={s.pillRow}>
                {PROVIDERS.map((p) => (
                  <TouchableOpacity key={p.key} style={[s.pill, provider === p.key && s.pillOn]} onPress={() => setProvider(p.key)}>
                    <Text style={[s.pillText, provider === p.key && s.pillTextOn]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
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
              <Text style={s.sub}>{t('ob_ready_sub')}</Text>
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
          <TouchableOpacity style={s.primaryBtn} onPress={finish}>
            <Text style={s.primaryBtnText}>{t('ob_create_account')}</Text>
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
                  {/* color is an explicit theme token on BOTH states so the row can
                      never render as invisible text (the light-theme white-on-white bug). */}
                  <Text style={[s.langOptText, on && s.langOptTextOn]}>{l.label}</Text>
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
    fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 18, marginBottom: 8 },
    sexHelp: { fontSize: 12, color: colors.textFaint, marginTop: 8, lineHeight: 16 },
    input: {
      backgroundColor: colors.card2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
      fontSize: 15, color: colors.text, borderWidth: 0.5, borderColor: colors.border, minHeight: 48,
    },
    hScroll: { maxHeight: 46, marginBottom: 2 },
    hRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, justifyContent: 'center' },
    pill: { paddingHorizontal: 15, paddingVertical: 11, borderRadius: 999, backgroundColor: colors.card2, borderWidth: 0.5, borderColor: colors.border },
    chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.card2, borderWidth: 0.5, borderColor: colors.border },
    pillOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 1.5 },
    pillText: { fontSize: 14, fontWeight: '600', color: colors.text },
    pillTextOn: { color: colors.accent },
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
