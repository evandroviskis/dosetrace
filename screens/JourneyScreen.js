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
import Svg, { Path } from 'react-native-svg';
import { useTheme, TYPE } from '../lib/theme';
import { isPremium } from '../lib/purchases';
import CalculatorSection from './components/CalculatorSection';
import FeatureIcon from '../components/FeatureIcon';
import { ScreenTitle, Chip } from '../components/ui';

function ChevronRight({ color }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5l7 7-7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

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
      accessibilityRole="button"
      accessibilityLabel={t('body_card_dosing_title')}
      onPress={() => navigation.navigate(premium ? 'SerumCurve' : 'Paywall', premium ? undefined : { source: 'journey_serum' })}
    >
      <View style={s.curveIcon}><FeatureIcon name="curve" size={26} color={colors.accent} /></View>
      <View style={{ flex: 1 }}>
        <View style={s.curveTitleRow}>
          <Text style={s.curveTitle}>{t('body_card_dosing_title')}</Text>
          {!premium && <Chip label="PRO" tone="accent" style={s.pro} />}
        </View>
        <Text style={s.curveDesc}>{t('body_card_dosing_desc')}</Text>
      </View>
      <ChevronRight color={colors.textSubtle} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
      <View style={s.hero}>
        <ScreenTitle title={t('tab_journey')} />
        <Text style={s.sub}>{t('journey_subtitle')}</Text>
      </View>
      <CalculatorSection header={curveCard} scrollTarget={route.params?.scrollTo || null} />
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  hero: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, backgroundColor: c.bg },
  sub: { ...TYPE.sub, color: c.textMuted, marginTop: 4, lineHeight: 20 },
  curveCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 20, padding: 16, marginBottom: 12, ...(c.shadowSoft || {}) },
  curveIcon: { width: 32, alignItems: 'center', justifyContent: 'center' },
  curveTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  curveTitle: { fontSize: 16, fontWeight: '600', color: c.text, flexShrink: 1 },
  pro: { marginLeft: 8, height: 22, paddingHorizontal: 8 },
  curveDesc: { ...TYPE.caption, color: c.textMuted, marginTop: 3, lineHeight: 18 },
});
