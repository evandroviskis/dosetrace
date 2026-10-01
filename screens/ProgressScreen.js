/**
 * DoseTrace — Progress (behind the Journey dashboard's Progress tile; redesign A-52,
 * founder approved 2026-09-29). Holds the full calculator loop unchanged: your numbers →
 * target → daily plan → reality check → progress → learn more (CalculatorSection).
 */
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import CalculatorSection from './components/CalculatorSection';

export default function ProgressScreen() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const s = makeStyles(colors);
  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
      <View style={s.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.back}>‹ {t('tab_journey')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.title}>{t('today_section_progress')}</Text>
      <CalculatorSection />
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.ground },
  nav: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  back: { fontSize: 17, color: c.ink },
  title: { fontSize: 34, fontWeight: '700', color: c.ink, letterSpacing: -0.8, paddingHorizontal: 20, paddingBottom: 8 },
});
