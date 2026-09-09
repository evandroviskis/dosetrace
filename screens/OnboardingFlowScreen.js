import { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image, Animated,
  Platform, StyleSheet, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { saveOnboarding, markSeenOnboarding } from '../lib/onboardingStore';
import AccumulationHero from '../components/AccumulationHero';

/**
 * Value-before-signup onboarding. Runs on first launch (before any account),
 * educates on the app, collects the profile, and hands off to the auth screen
 * LAST. Answers are stashed (onboardingStore) and written to the profile right
 * after sign-up, so new users skip the post-login profile gate.
 *
 * onDone() — called when the user reaches "create account"; App.js flips to the
 * auth screen. The flow never creates the account itself.
 */
const STEPS = ['splash', 'features', 'goal', 'about', 'activity', 'terms', 'reminders', 'ready'];

export default function OnboardingFlowScreen({ onDone }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { width: winW } = useWindowDimensions();
  const heroW = Math.min(420, winW - 48); // content has 24px horizontal padding

  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState('');
  const [name, setName] = useState('');
  const [birth, setBirth] = useState(null);           // Date or null
  const [showPicker, setShowPicker] = useState(false);
  const [gender, setGender] = useState('');
  const [activity, setActivity] = useState('');
  const [confirmed, setConfirmed] = useState({});      // terms acknowledged

  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [step]);

  const GOALS = [
    { key: 'wellness', label: t('profile_goal_wellness') },
    { key: 'fitness', label: t('profile_goal_fitness') },
    { key: 'body_composition', label: t('profile_goal_body') },
    { key: 'longevity', label: t('profile_goal_longevity') },
    { key: 'athletic', label: t('profile_goal_athletic') },
  ];
  const ACTIVITY = [
    { key: 'sedentary', label: t('profile_activity_sedentary') },
    { key: 'moderate', label: t('profile_activity_moderate') },
    { key: 'active', label: t('profile_activity_active') },
    { key: 'very_active', label: t('profile_activity_very_active') },
  ];
  // Sex ASSIGNED AT BIRTH — a physiological input for the calorie/BMR math, not a
  // gender-identity field. Mifflin-St Jeor and the calorie floors are sex-specific,
  // so this must be male/female and required; there is no meaningful "other" for the
  // formula. Stored under the existing `gender` metadata key (no data migration).
  const SEXES = [
    { key: 'male', label: t('profile_gender_male') },
    { key: 'female', label: t('profile_gender_female') },
  ];
  const FEATURES = [
    { icon: '💧', t: t('ob_feat1_t'), d: t('ob_feat1_d') },
    { icon: '📈', t: t('ob_feat2_t'), d: t('ob_feat2_d') },
    { icon: '🔔', t: t('ob_feat3_t'), d: t('ob_feat3_d') },
    { icon: '🧬', t: t('ob_feat4_t'), d: t('ob_feat4_d') },
    { icon: '🩸', t: t('ob_feat5_t'), d: t('ob_feat5_d') },
  ];
  const TERMS = [
    { key: 'med', t: t('ob_term1_t'), d: t('ob_term1_d') },
    { key: 'est', t: t('ob_term2_t'), d: t('ob_term2_d') },
    { key: 'ai', t: t('ob_term3_t'), d: t('ob_term3_d') },
    { key: 'priv', t: t('ob_term4_t'), d: t('ob_term4_d') },
  ];

  const canContinue = () => {
    const name_ = STEPS[step];
    if (name_ === 'goal') return !!goal;
    if (name_ === 'about') return !!name.trim() && !!gender;
    if (name_ === 'activity') return !!activity;
    if (name_ === 'terms') return TERMS.every(x => confirmed[x.key]);
    return true;
  };

  async function persist() {
    await saveOnboarding({
      display_name: name.trim() || undefined,
      primary_goal: goal || undefined,
      activity_level: activity || undefined,
      gender: gender || undefined,
      birth_year: birth ? birth.getFullYear() : undefined,
      birth_month: birth ? birth.getMonth() + 1 : undefined,
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
    onDone && onDone();       // App.js swaps to the auth (create-account) screen
  }

  async function enableNotifications() {
    try { await Notifications.requestPermissionsAsync(); } catch (e) { /* user can enable later */ }
    setStep(step + 1);
  }

  const name_ = STEPS[step];

  return (
    <SafeAreaView style={s.root}>
      {/* progress + back */}
      {step > 0 && (
        <View style={s.topBar}>
          <TouchableOpacity onPress={back} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={s.backChevron}>‹</Text>
          </TouchableOpacity>
          <View style={s.progress}>
            {STEPS.map((_, i) => (
              <View key={i} style={[s.dash, i <= step && s.dashOn]} />
            ))}
          </View>
          <View style={{ width: 24 }} />
        </View>
      )}

      <Animated.View style={{ flex: 1, opacity: fade }}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          {name_ === 'splash' && (
            <View style={s.splashWrap}>
              <Image source={require('../assets/adaptive-icon.png')} style={s.logo} resizeMode="contain" />
              <Text style={s.brand}>DoseTrace</Text>
              <Text style={s.phrase}>{t('ob_phrase')}</Text>
            </View>
          )}

          {name_ === 'features' && (
            <>
              <Text style={s.title}>{t('ob_features_title')}</Text>
              <Text style={s.sub}>{t('ob_features_sub')}</Text>
              <AccumulationHero width={heroW} height={140} />
              <View style={{ marginTop: 8 }}>
                {FEATURES.map((f, i) => (
                  <View key={i} style={s.featRow}>
                    <View style={s.featIcon}><Text style={{ fontSize: 22 }}>{f.icon}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.featTitle}>{f.t}</Text>
                      <Text style={s.featDesc}>{f.d}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {name_ === 'goal' && (
            <>
              <Text style={s.title}>{t('ob_goal_title')}</Text>
              <Text style={s.sub}>{t('ob_goal_sub')}</Text>
              <View style={s.pillRow}>
                {GOALS.map(g => (
                  <TouchableOpacity key={g.key} style={[s.pill, goal === g.key && s.pillOn]} onPress={() => setGoal(g.key)}>
                    <Text style={[s.pillText, goal === g.key && s.pillTextOn]}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {name_ === 'about' && (
            <>
              <Text style={s.title}>{t('ob_about_title')}</Text>
              <Text style={s.fieldLabel}>{t('profile_name')}</Text>
              <TextInput
                style={s.input}
                placeholder={t('profile_name_placeholder')}
                placeholderTextColor={colors.textFaint}
                value={name} onChangeText={setName} autoCapitalize="words" autoCorrect={false}
              />
              <Text style={s.fieldLabel}>{t('ob_birthday')} <Text style={s.optional}>{t('ob_optional')}</Text></Text>
              <TouchableOpacity style={[s.input, { justifyContent: 'center' }]} onPress={() => setShowPicker(true)}>
                <Text style={{ fontSize: 15, color: birth ? colors.text : colors.textFaint }}>
                  {birth ? birth.toLocaleDateString() : t('ob_birthday_placeholder')}
                </Text>
              </TouchableOpacity>
              {showPicker && (
                <DateTimePicker
                  value={birth || new Date(1995, 0, 1)}
                  mode="date"
                  maximumDate={new Date()}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(e, d) => {
                    if (Platform.OS !== 'ios') setShowPicker(false);
                    if (d) setBirth(d);
                  }}
                />
              )}
              {Platform.OS === 'ios' && showPicker && (
                <TouchableOpacity style={s.doneRow} onPress={() => setShowPicker(false)}>
                  <Text style={s.doneText}>{t('done')}</Text>
                </TouchableOpacity>
              )}
              <Text style={s.fieldLabel}>{t('profile_sex')}</Text>
              <View style={s.pillRow}>
                {SEXES.map(g => (
                  <TouchableOpacity key={g.key} style={[s.pill, gender === g.key && s.pillOn]} onPress={() => setGender(g.key)}>
                    <Text style={[s.pillText, gender === g.key && s.pillTextOn]}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.sexHelp}>{t('profile_sex_help')}</Text>
            </>
          )}

          {name_ === 'activity' && (
            <>
              <Text style={s.title}>{t('ob_activity_title')}</Text>
              <Text style={s.sub}>{t('ob_activity_sub')}</Text>
              <View style={s.pillRow}>
                {ACTIVITY.map(a => (
                  <TouchableOpacity key={a.key} style={[s.pill, activity === a.key && s.pillOn]} onPress={() => setActivity(a.key)}>
                    <Text style={[s.pillText, activity === a.key && s.pillTextOn]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {name_ === 'terms' && (
            <>
              <Text style={s.title}>{t('ob_terms_title')}</Text>
              <Text style={s.sub}>{t('ob_terms_sub')}</Text>
              {TERMS.map(x => (
                <TouchableOpacity
                  key={x.key}
                  style={[s.termRow, confirmed[x.key] && s.termRowOn]}
                  onPress={() => setConfirmed(c => ({ ...c, [x.key]: !c[x.key] }))}
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

          {name_ === 'reminders' && (
            <View style={s.centerStep}>
              <Text style={s.bigEmoji}>🔔</Text>
              <Text style={s.title}>{t('ob_reminders_title')}</Text>
              <Text style={s.sub}>{t('ob_reminders_sub')}</Text>
            </View>
          )}

          {name_ === 'ready' && (
            <View style={s.centerStep}>
              <Image source={require('../assets/adaptive-icon.png')} style={s.logoSm} resizeMode="contain" />
              <Text style={s.title}>{t('ob_ready_title')}</Text>
              <Text style={s.sub}>{t('ob_ready_sub')}</Text>
            </View>
          )}

        </ScrollView>
      </Animated.View>

      {/* footer button(s) */}
      <View style={s.footer}>
        {name_ === 'splash' && (
          <TouchableOpacity style={s.primaryBtn} onPress={next}>
            <Text style={s.primaryBtnText}>{t('ob_get_started')}</Text>
          </TouchableOpacity>
        )}
        {name_ === 'reminders' && (
          <>
            <TouchableOpacity style={s.primaryBtn} onPress={enableNotifications}>
              <Text style={s.primaryBtnText}>{t('ob_enable_notifs')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.skip} onPress={() => setStep(step + 1)}>
              <Text style={s.skipText}>{t('ob_not_now')}</Text>
            </TouchableOpacity>
          </>
        )}
        {name_ === 'ready' && (
          <TouchableOpacity style={s.primaryBtn} onPress={finish}>
            <Text style={s.primaryBtnText}>{t('ob_create_account')}</Text>
          </TouchableOpacity>
        )}
        {!['splash', 'reminders', 'ready'].includes(name_) && (
          <TouchableOpacity
            style={[s.primaryBtn, !canContinue() && { opacity: 0.4 }]}
            onPress={next}
            disabled={!canContinue()}
          >
            <Text style={s.primaryBtnText}>{t('ob_continue')}</Text>
          </TouchableOpacity>
        )}
      </View>
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
    content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24, flexGrow: 1 },
    splashWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 380 },
    logo: { width: 128, height: 128, marginBottom: 18 },
    logoSm: { width: 84, height: 84, marginBottom: 14 },
    brand: { fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
    phrase: { fontSize: 16, color: colors.textFaint, marginTop: 8, textAlign: 'center' },
    title: { fontSize: 25, fontWeight: '800', color: colors.text, letterSpacing: -0.3, textAlign: 'center' },
    sub: { fontSize: 14.5, color: colors.textFaint, textAlign: 'center', marginTop: 8, marginBottom: 14, lineHeight: 20 },
    fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 18, marginBottom: 8 },
    optional: { fontSize: 12, fontWeight: '500', color: colors.textFaint },
    sexHelp: { fontSize: 12, color: colors.textFaint, marginTop: 8, lineHeight: 16 },
    input: {
      backgroundColor: colors.card2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
      fontSize: 15, color: colors.text, borderWidth: 0.5, borderColor: colors.border, minHeight: 48,
    },
    doneRow: { alignItems: 'flex-end', paddingVertical: 8 },
    doneText: { fontSize: 14, color: colors.accent, fontWeight: '700' },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, justifyContent: 'center' },
    pill: { paddingHorizontal: 15, paddingVertical: 11, borderRadius: 999, backgroundColor: colors.card2, borderWidth: 0.5, borderColor: colors.border },
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
    centerStep: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 340 },
    bigEmoji: { fontSize: 46, marginBottom: 10 },
    footer: { paddingHorizontal: 24, paddingBottom: 12, paddingTop: 6 },
    primaryBtn: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 54 },
    primaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.accentText },
    skip: { alignItems: 'center', paddingVertical: 14, marginTop: 2 },
    skipText: { fontSize: 14, fontWeight: '600', color: colors.textFaint },
  });
}
