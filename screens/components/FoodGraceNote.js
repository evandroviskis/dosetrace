/**
 * DoseTrace — the grace-week note (FL-41). When Premium or the free days end
 * during a running reality check, logging stays open until the end of that check
 * week; this app-written note says why the check matters using the user's OWN
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

const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

export default function FoodGraceNote({ rcStart, graceUntil, rows, style }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const s = makeStyles(colors);
  if (!rcStart || !rcStart.date || !graceUntil) return null;
  const locale = LOCALE_MAP[language] || 'en-US';
  const fmt = (iso) => { const d = new Date(iso + 'T12:00:00'); return isNaN(d) ? iso : d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' }); };
  const today = localISO();
  const start = String(rcStart.date).slice(0, 10);
  const day = Math.max(1, Math.round((new Date(today + 'T12:00:00') - new Date(start + 'T12:00:00')) / 86400000) + 1);
  const logged = (periodTotals(rows || [], start, today) || { loggedDays: 0 }).loggedDays;
  const text = t('nutri_grace_note')
    .replace('{day}', String(day))
    .replace('{logged}', String(logged))
    .replace('{until}', fmt(graceUntil))
    .replace('{weighin}', fmt(weighInDay(start)));
  return (
    <View style={[s.card, style]}>
      <Text style={s.text}>{text}</Text>
      <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Paywall', { source: 'food_grace' })} accessibilityRole="button">
        <Text style={s.btnText}>{t('nutri_grace_cta')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 14, padding: 13, borderWidth: 1, borderColor: c.border },
  text: { fontSize: 13, color: c.text, lineHeight: 19 },
  btn: { alignSelf: 'flex-start', backgroundColor: c.accent, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 8, marginTop: 10 },
  btnText: { color: c.accentText, fontWeight: '800', fontSize: 13 },
});
