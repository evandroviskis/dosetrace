/**
 * DoseTrace — Journey tab.
 *
 * The home for tracking whether things are actually working: the energy/protein
 * calculator + reality-check today, and the AI nutrition logger (build 52). Moved
 * out of the Body hub (which keeps records — labs, vaccines) into its own tab so
 * the "am I on track?" loop has a first-class home. Rebuild = replace: the Body
 * hub no longer carries the calculator.
 */

import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import CalculatorSection from './components/CalculatorSection';

export default function JourneyScreen() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = makeStyles(colors);
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.hero}>
        <Text style={s.title}>{t('tab_journey')}</Text>
        <Text style={s.sub}>{t('journey_subtitle')}</Text>
      </View>
      <CalculatorSection />
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  hero: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, backgroundColor: c.card },
  title: { fontSize: 26, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
  sub: { fontSize: 14, color: c.textMuted, marginTop: 6, lineHeight: 20 },
});
