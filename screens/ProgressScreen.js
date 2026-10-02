/**
 * DoseTrace — Progress (behind the Journey dashboard's Progress tile; redesign A-52,
 * founder approved 2026-09-29). Holds the full calculator loop unchanged: your numbers →
 * target → daily plan → reality check → progress → learn more (CalculatorSection).
 *
 * S-26 book layout: `embedded` = shown on the Journey tab's right page (BK-5): no back row,
 * no top safe-area edge (the tab screen has it). As a pushed screen it moves onto the right
 * page when the window unfolds, flushing anything typed first (BK-10).
 */
import { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import CalculatorSection from './components/CalculatorSection';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import RowChevron from '../components/RowChevron';
import { useUnfoldToPage } from '../components/BookPanes';
import { paneWidths } from '../lib/bookLayout';
import FeatureExplainerGate from '../components/FeatureExplainerGate';
import { getCalcInputsRow, getCalcSnapshots } from '../lib/database';

// Free-feature explainer of the energy + protein calculator (Today redesign part 18), until
// the user has entered their own numbers (synced calculator inputs or snapshots).
function energyExplainers(userId) {
  let used = false;
  try { used = !!getCalcInputsRow(userId) || (getCalcSnapshots(userId) || []).length > 0; } catch { used = false; }
  return [{ key: 'energy', used }];
}

export default function ProgressScreen({ embedded = false }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const { width } = useWindowDimensions();
  const s = makeStyles(colors, embedded);
  const flushRef = useRef(null);
  useUnfoldToPage('Progress', {
    embedded,
    params: embedded ? null : (route && route.params) || null,
    beforeLeave: () => { if (flushRef.current) flushRef.current(); },
  });
  return (
    <SafeAreaView style={s.container} edges={embedded ? ['left', 'right'] : ['top', 'left', 'right']}>
      <View style={s.column}>
      <View style={s.nav}>
        {embedded ? null : (
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <View style={s.backRow}>
              <View style={s.backChev}><RowChevron color={colors.ink} /></View>
              <Text style={s.back}>{t('tab_journey')}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
      <Text style={s.title}>{t('cal_snap_title')}</Text>
      </View>
      <CalculatorSection flushRef={flushRef} paneWidth={embedded ? paneWidths(width).right : null} />
      <FeatureExplainerGate candidates={energyExplainers} />
    </SafeAreaView>
  );
}

const makeStyles = (c, embedded) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.ground },
  // Same capped column as the cards below (A-75: wide screens, unfolded foldables).
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  // On a book page there is no back row: an 8 pt top space lines the title up with the
  // dashboard title on the left page.
  nav: embedded ? { height: 8 } : { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  back: { fontSize: 17, color: c.ink },
  // prototype .back: the drawn chevron (mirrored), gap 6
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backChev: { transform: [{ scaleX: -1 }] },
  title: { fontSize: 34, fontWeight: '700', color: c.ink, letterSpacing: -0.8, paddingHorizontal: 20, paddingBottom: 8 },
});
