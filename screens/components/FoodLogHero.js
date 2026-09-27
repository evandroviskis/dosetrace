/**
 * DoseTrace — compact food-log hero (FL-32/33). Tapping it opens the ONE food
 * chat ('FoodChat' modal route, FL-37). Shown on Journey (before the Reality
 * check, FL-34) and on Today under the alerts while a reality check runs (FL-33;
 * when/for whom is decided ONLY in lib/foodThread todayFoodHeroPolicy — pending a
 * founder decision).
 */

import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getCachedUser } from '../../lib/supabase';
import { isPremium } from '../../lib/purchases';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { getFoodLogsSince, getFoodLogDayCount } from '../../lib/database';
import { getRealityStart } from '../../lib/realityCheck';
import { todayFoodHeroPolicy, todaySummary } from '../../lib/foodThread';
import { catchUpFood } from '../../lib/foodLogActions';
import { localISO } from '../../lib/localDate';
import FeatureIcon from '../../components/FeatureIcon';

const FREE_DAYS = 3;
const CHECK_DAYS = 21;

export default function FoodLogHero({ variant = 'journey', onChanged }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const s = makeStyles(colors);
  const [state, setState] = useState(null);

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      const premium = await isPremium();
      const user = await getCachedUser();
      const uid = user?.id || null;
      let rcStart = null;
      try { rcStart = await getRealityStart(); } catch { rcStart = null; }
      const today = localISO();
      const read = () => {
        const rows = uid ? (getFoodLogsSince(uid, today) || []) : [];
        const dayCount = uid ? getFoodLogDayCount(uid) : 0;
        if (alive) setState({ premium, rcStart, today, sum: todaySummary(rows, today), dayCount });
      };
      read();
      // Offline entries / follow-up answers are parsed once back online, even if
      // the chat is never opened (FL-19/28).
      if (uid) {
        const { changed } = await catchUpFood(uid, language);
        if (changed) { read(); onChanged && onChanged(); }
      }
    })();
    return () => { alive = false; };
  }, [language]));

  if (!state) return null;
  const policy = todayFoodHeroPolicy({ rcStart: state.rcStart, todayISO: state.today, premium: state.premium, trialDaysUsed: state.dayCount, freeDays: FREE_DAYS, checkDays: CHECK_DAYS });
  if (variant === 'today' && !policy.show) return null;
  const locked = variant === 'today' ? policy.locked : (!state.premium && state.dayCount >= FREE_DAYS);

  const checkLine = policy.show
    ? (policy.weighInDue ? t('nutri_hero_weigh') : t('nutri_hero_day').replace('{n}', String(policy.day)).replace('{total}', String(policy.of)))
    : null;
  const { items, kcal, closed } = state.sum;
  const todayLine = closed
    ? t('nutri_hero_closed').replace('{kcal}', String(kcal))
    : items > 0 ? t('nutri_hero_today').replace('{n}', String(items)).replace('{kcal}', String(kcal)) : t('nutri_hero_empty');

  return (
    <TouchableOpacity
      style={[s.card, variant === 'today' && s.cardToday]}
      activeOpacity={0.8}
      onPress={() => navigation.navigate(locked ? 'Paywall' : 'FoodChat', locked ? { source: 'food_hero' } : undefined)}
      accessibilityRole="button"
      accessibilityLabel={`${t('nutri_ai_badge')}. ${checkLine ? checkLine + '. ' : ''}${todayLine}`}
    >
      <View style={s.icon}><FeatureIcon name="ai_spark" size={20} color={colors.accent} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{t('nutri_ai_badge')}</Text>
        {checkLine && <Text style={s.check}>{checkLine}</Text>}
        <Text style={s.line}>{locked ? t('nutri_hero_locked') : todayLine}</Text>
      </View>
      <View style={s.cta}><Text style={s.ctaText}>{locked ? t('nutri_locked_cta') : t('nutri_hero_cta')}</Text></View>
    </TouchableOpacity>
  );
}

const makeStyles = (c) => StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.accentSoft, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: c.border },
  cardToday: { marginHorizontal: 18, marginBottom: 22 },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: c.text },
  check: { fontSize: 11.5, fontWeight: '700', color: c.accentSoftText, marginTop: 2 },
  line: { fontSize: 12.5, color: c.textMuted, marginTop: 2, lineHeight: 17 },
  cta: { backgroundColor: c.accent, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  ctaText: { color: c.accentText, fontWeight: '800', fontSize: 12.5 },
});
