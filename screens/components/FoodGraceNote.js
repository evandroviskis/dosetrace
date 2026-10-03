/**
 * DoseTrace — the grace-week / last-free-days note (FL-41). In the last 2 of the 7
 * free days, or in the week paid Premium ended during a running check (logging
 * stays open to the end of that check week), this app-written note says why the check matters using the user's OWN
 * numbers (day of the check, days with food logged, the weigh-in date, the last
 * day logging stays open) and offers the paywall. Never advice.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { periodTotals } from '../../lib/nutrition';
import { weighInDay } from '../../lib/foodThread';
import { localISO } from '../../lib/localDate';

import { formatDate } from '../../lib/localeFormat';

export default function FoodGraceNote({ rcStart, until, reason, freeFrom, rows, style }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const s = makeStyles(colors);
  // Only a payer whose Premium ended or free days that are ending need a note.
  if (!until || (reason !== 'premium_ended' && reason !== 'free_days_ending')) return null;
  const fmt = (iso) => formatDate(iso, language, 'weekdayDayMonth') || iso;
  const today = localISO();
  const hasCheck = !!(rcStart && rcStart.date);
  const start = hasCheck ? String(rcStart.date).slice(0, 10) : (freeFrom || today);
  const day = Math.max(1, Math.round((new Date(today + 'T12:00:00') - new Date(start + 'T12:00:00')) / 86400000) + 1);
  const logged = (periodTotals(rows || [], start, today) || { loggedDays: 0 }).loggedDays;
  // A lapsed PAYING user never reads "free days"; the free-days note shows even
  // without a check (FL-41).
  const key = reason === 'premium_ended'
    ? (hasCheck ? 'nutri_grace_note_premium' : 'nutri_grace_note_premium_nocheck')
    : (hasCheck ? 'nutri_free_ending_note' : 'nutri_free_ending_note_nocheck');
  const text = t(key)
    .replace('{day}', String(day))
    .replace('{logged}', String(logged))
    .replace(/\{until\}/g, fmt(until))
    .replace('{weighin}', hasCheck ? fmt(weighInDay(start)) : '');
  return (
    <View style={[s.card, style]}>
      <Text style={s.text}>{text}</Text>
      <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Paywall', { source: 'food_grace' })} accessibilityRole="button">
        <Text style={s.btnText}>{t('nutri_grace_cta')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// Graduated (prototype .grace): a plain raised card, the note in footnote ink2, and a
// secondary (well) capsule — the screen's one ink action stays its own.
const makeStyles = (c) => StyleSheet.create({
  card: { backgroundColor: c.raised, borderRadius: 22, padding: 16, gap: 10 },
  text: { fontSize: 13, lineHeight: 18, color: c.ink2, fontVariant: ['tabular-nums'] },
  btn: { alignSelf: 'flex-start', minHeight: 44, borderRadius: 22, backgroundColor: c.well, paddingHorizontal: 18, justifyContent: 'center' },
  btnText: { color: c.ink, fontWeight: '700', fontSize: 15 },
});
