import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Modal, FlatList,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, signOutGoogleNative } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { COUNTRIES, countryLabel } from '../lib/countries';

const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr', 'month_may', 'month_jun',
  'month_jul', 'month_aug', 'month_sep', 'month_oct', 'month_nov', 'month_dec',
];
const BIRTH_YEARS = [];
const _thisYear = new Date().getFullYear();
for (let y = _thisYear - 18; y >= _thisYear - 90; y--) BIRTH_YEARS.push(y);

/**
 * Mandatory profile gate. Shown by App.js when a session exists but the profile
 * is incomplete — for Google/Apple sign-ins (which skip the email flow's profile
 * step), a deleted-then-recreated account, and (since the 2026-09 gate flip) any
 * existing account missing a now-required field.
 *
 * CRITICAL: this screen MUST collect every field in REQUIRED_PROFILE_FIELDS
 * (name, age=birth month+year, sex, country, goal, activity, tracking, provider).
 * If it omits one, a returning user saves, isProfileComplete() is still false,
 * and App.js routes them right back here — an infinite lockout. The `complete`
 * check below mirrors lib/supabase.js#fieldPresent exactly; keep them in sync.
 * Present values are prefilled so a returning user only fills the gaps.
 */
export default function CompleteProfileScreen() {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [displayName, setDisplayName] = useState('');
  const [birthMonth, setBirthMonth] = useState(null);   // 0-11 index (stored 1-based)
  const [birthYear, setBirthYear] = useState(null);
  const [sex, setSex] = useState('');                   // 'male' | 'female' — sex assigned at birth
  const [country, setCountry] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState('');
  const [activityLevel, setActivityLevel] = useState('');
  const [tracking, setTracking] = useState([]);         // tracking_types (>=1)
  const [provider, setProvider] = useState('');         // 'yes' | 'no'
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Prefill everything we already have so the user only completes what's missing.
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const m = (data && data.user && data.user.user_metadata) || {};
      const guess = m.display_name || m.full_name || m.name || '';
      if (guess) setDisplayName(prev => prev || String(guess));
      if (m.birth_month != null) setBirthMonth(prev => (prev == null ? Number(m.birth_month) - 1 : prev)); // stored 1-based
      if (m.birth_year != null) setBirthYear(prev => (prev == null ? Number(m.birth_year) : prev));
      if (m.gender === 'male' || m.gender === 'female') setSex(prev => prev || m.gender);
      if (m.country) setCountry(prev => prev || String(m.country));
      if (m.primary_goal) setPrimaryGoal(prev => prev || String(m.primary_goal));
      if (m.activity_level) setActivityLevel(prev => prev || String(m.activity_level));
      if (Array.isArray(m.tracking_types) && m.tracking_types.length) setTracking(prev => (prev.length ? prev : m.tracking_types));
      if (m.has_provider != null && String(m.has_provider).trim() !== '') setProvider(prev => prev || String(m.has_provider));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

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
  const SEXES = [
    { key: 'male', label: t('profile_gender_male') },
    { key: 'female', label: t('profile_gender_female') },
  ];
  const COMPOUNDS = [
    { key: 'peptides', label: t('onboarding_compound_peptides') },
    { key: 'hormones', label: t('onboarding_compound_hormones') },
    { key: 'glp1', label: t('onboarding_compound_glp1') },
    { key: 'oral', label: t('onboarding_compound_oral') },
  ];
  const PROVIDERS = [
    { key: 'yes', label: t('profile_provider_yes') },
    { key: 'no', label: t('profile_provider_no') },
  ];

  function toggleTracking(key) {
    setTracking(p => (p.includes(key) ? p.filter(k => k !== key) : [...p, key]));
  }

  // Mirrors lib/supabase.js#fieldPresent for all 8 REQUIRED_PROFILE_FIELDS — if
  // this passes, isProfileComplete() must too, so Save always releases the gate.
  const complete = !!(
    displayName.trim() &&
    birthMonth != null && birthYear != null &&
    (sex === 'male' || sex === 'female') &&
    country.trim() &&
    primaryGoal &&
    activityLevel &&
    tracking.length > 0 &&
    (provider === 'yes' || provider === 'no')
  );

  async function handleSave() {
    if (!complete || saving) return;
    setSaving(true);
    const { error } = await supabase.auth.updateUser({
      data: {
        display_name: displayName.trim(),
        birth_month: birthMonth + 1, // store 1-based, matching the onboarding flow
        birth_year: birthYear,
        gender: sex,
        country: country.trim(),
        primary_goal: primaryGoal,
        activity_level: activityLevel,
        tracking_types: tracking,
        has_provider: provider,
        onboarded_at: new Date().toISOString(),
      },
    });
    setSaving(false);
    if (error) {
      Alert.alert(t('error'), error.message || String(error));
      return;
    }
    // Success: the USER_UPDATED auth event carries the new metadata, so App.js
    // re-evaluates isProfileComplete() and swaps this screen for the main app.
  }

  async function handleSignOut() {
    Alert.alert(t('settings_signout'), t('settings_signout_confirm_local'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('settings_signout'),
        style: 'destructive',
        onPress: async () => {
          await signOutGoogleNative();
          try { await supabase.auth.signOut({ scope: 'local' }); }
          catch { await supabase.auth.signOut().catch(() => {}); }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
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
          {SEXES.map(g => (
            <TouchableOpacity key={g.key} style={[s.pill, sex === g.key && s.pillOn]} onPress={() => setSex(g.key)}>
              <Text style={[s.pillText, sex === g.key && s.pillTextOn]}>{g.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.sexHelp}>{t('profile_sex_help')}</Text>

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
          {GOALS.map(g => (
            <TouchableOpacity key={g.key} style={[s.pill, primaryGoal === g.key && s.pillOn]} onPress={() => setPrimaryGoal(g.key)}>
              <Text style={[s.pillText, primaryGoal === g.key && s.pillTextOn]}>{g.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.fieldLabel}>{t('profile_activity')}</Text>
        <View style={s.pillRow}>
          {ACTIVITY.map(a => (
            <TouchableOpacity key={a.key} style={[s.pill, activityLevel === a.key && s.pillOn]} onPress={() => setActivityLevel(a.key)}>
              <Text style={[s.pillText, activityLevel === a.key && s.pillTextOn]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.fieldLabel}>{t('onboarding_compound_title')}</Text>
        <View style={s.pillRow}>
          {COMPOUNDS.map(c => (
            <TouchableOpacity key={c.key} style={[s.pill, tracking.includes(c.key) && s.pillOn]} onPress={() => toggleTracking(c.key)}>
              <Text style={[s.pillText, tracking.includes(c.key) && s.pillTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.fieldLabel}>{t('profile_provider')}</Text>
        <View style={s.pillRow}>
          {PROVIDERS.map(p => (
            <TouchableOpacity key={p.key} style={[s.pill, provider === p.key && s.pillOn]} onPress={() => setProvider(p.key)}>
              <Text style={[s.pillText, provider === p.key && s.pillTextOn]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.disclaimer}>{t('profile_data_note')}</Text>

        <TouchableOpacity
          style={[s.primaryBtn, (!complete || saving) && { opacity: 0.4 }]}
          onPress={handleSave}
          disabled={!complete || saving}
        >
          {saving
            ? <ActivityIndicator color={colors.accentText} />
            : <Text style={s.primaryBtnText}>{t('save')}</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={s.signOut} onPress={handleSignOut}>
          <Text style={s.signOutText}>{t('settings_signout')}</Text>
        </TouchableOpacity>
      </ScrollView>

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

function makeStyles(colors) {
  const { StyleSheet } = require('react-native');
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40 },
    bigEmoji: { fontSize: 40, textAlign: 'center', marginBottom: 8 },
    title: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center', letterSpacing: -0.3 },
    sub: { fontSize: 14.5, color: colors.textFaint, textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 20 },
    fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 18, marginBottom: 8 },
    input: {
      backgroundColor: colors.card2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
      fontSize: 15, color: colors.text, borderWidth: 0.5, borderColor: colors.border, minHeight: 48,
    },
    hScroll: { marginBottom: 8 },
    hRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
      backgroundColor: colors.card2, borderWidth: 0.5, borderColor: colors.border,
    },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: {
      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
      backgroundColor: colors.card2, borderWidth: 0.5, borderColor: colors.border,
    },
    pillOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 1.5 },
    pillText: { fontSize: 14, fontWeight: '600', color: colors.text },
    pillTextOn: { color: colors.accent },
    sexHelp: { fontSize: 12, color: colors.textFaint, marginTop: 8, lineHeight: 16 },
    disclaimer: { fontSize: 12, color: colors.textFaint, marginTop: 22, lineHeight: 17, textAlign: 'center' },
    primaryBtn: {
      backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 16,
      alignItems: 'center', justifyContent: 'center', marginTop: 24, minHeight: 54,
    },
    primaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.accentText },
    signOut: { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
    signOutText: { fontSize: 14, fontWeight: '600', color: colors.textFaint },
  });
}
