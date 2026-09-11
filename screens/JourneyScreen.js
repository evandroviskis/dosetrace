/**
 * DoseTrace — Journey tab.
 *
 * The home for tracking whether things are actually working. Leads with the MOAT
 * — the dose-accumulation / serum-level curve (the one thing no competitor does) —
 * then the energy/protein calculator + reality-check, then the AI nutrition logger
 * (inside CalculatorSection's Track section). Moved out of the Body hub (which
 * keeps records — labs, vaccines). Rebuild = replace: Body no longer carries the
 * calculator.
 */

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { isPremium } from '../lib/purchases';
import CalculatorSection from './components/CalculatorSection';
import FeatureIcon from '../components/FeatureIcon';

export default function JourneyScreen() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const s = makeStyles(colors);
  const [premium, setPremium] = useState(false);
  useFocusEffect(useCallback(() => { isPremium().then(setPremium); }, []));

  // Leads the tab: the dose-accumulation curve (the moat). Premium-gated like the
  // Body-hub entry it replaces. Rendered at the very top of the scroll.
  const curveCard = (
    <TouchableOpacity
      style={s.curveCard}
      activeOpacity={0.75}
      onPress={() => navigation.navigate(premium ? 'SerumCurve' : 'Paywall')}
    >
      <View style={s.curveIcon}><FeatureIcon name="curve" size={26} color={colors.accent} /></View>
      <View style={{ flex: 1 }}>
        <View style={s.curveTitleRow}>
          <Text style={s.curveTitle}>{t('body_card_dosing_title')}</Text>
          {!premium && <Text style={s.pro}>PRO</Text>}
        </View>
        <Text style={s.curveDesc}>{t('body_card_dosing_desc')}</Text>
      </View>
      <Text style={s.curveChev}>›</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.hero}>
        <Text style={s.title}>{t('tab_journey')}</Text>
        <Text style={s.sub}>{t('journey_subtitle')}</Text>
      </View>
      <CalculatorSection header={curveCard} scrollTarget={route.params?.scrollTo || null} />
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  hero: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, backgroundColor: c.card },
  title: { fontSize: 26, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
  sub: { fontSize: 14, color: c.textMuted, marginTop: 6, lineHeight: 20 },
  curveCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 18, padding: 16, marginBottom: 4, borderWidth: 0.5, borderColor: c.border, ...(c.shadowSoft || {}) },
  curveIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  curveTitleRow: { flexDirection: 'row', alignItems: 'center' },
  curveTitle: { fontSize: 15, fontWeight: '800', color: c.text },
  pro: { marginLeft: 8, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: c.accentText, backgroundColor: c.accent, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  curveDesc: { fontSize: 12.5, color: c.textMuted, marginTop: 3, lineHeight: 17 },
  curveChev: { fontSize: 20, color: c.textFaint },
});
