/**
 * DoseTrace — Journey tab (redesign, A-52 dashboard approved by the founder 2026-09-29:
 * "I like this proposal. Keep this.").
 *
 * A dashboard: the AI food log card on top (the daily habit), then two tiles side by
 * side — Progress (your numbers + reality check → the Progress screen, which holds the
 * full calculator: numbers → target → daily plan → reality check → progress) and Dose
 * accumulation (→ the curve; Premium). Rebuild = replace: the long scroll moved behind
 * the Progress tile unchanged, nothing removed.
 */

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { hasPremium } from '../lib/entitlement';
import { getCalcInputs } from '../lib/realityCheck';
import { getCachedUser } from '../lib/supabase';
import { getActiveProtocols } from '../lib/database';
import { defaultCurveLevel, levelLabel } from '../lib/serumModel';
import { MONO } from '../lib/fonts';
import FoodLogHero from './components/FoodLogHero';
import FeatureIcon from '../components/FeatureIcon';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';

export default function JourneyScreen() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const s = makeStyles(colors);
  const [premium, setPremium] = useState(false);
  const [inputs, setInputs] = useState(null);
  // Dose accumulation tile: the compound the Curve opens on and its Est. level now —
  // the same lib function the Curve screen uses (lib/serumModel), Premium only.
  const [level, setLevel] = useState(null);
  useFocusEffect(useCallback(() => {
    let alive = true;
    hasPremium().then(async (pro) => {
      if (!alive) return;
      setPremium(pro);
      if (!pro) { setLevel(null); return; }
      const user = await getCachedUser();
      if (!alive || !user) return;
      try { setLevel(defaultCurveLevel(getActiveProtocols(user.id), Date.now())); } catch { setLevel(null); }
    }).catch(() => {});
    getCalcInputs().then(setInputs).catch(() => {});
    return () => { alive = false; };
  }, []));
  // Named as the Curve screen names its line (a blend component: "Blend · Component (est.)").
  const lp = level ? level.protocol : null;
  const levelName = !lp ? null
    : lp.__blend ? `${t(lp.__blend)} · ${t(lp.compound_id)} ${t('blend_est_marker')}`
      : (lp.compound_id ? t(lp.compound_id) : lp.name);

  const weight = inputs && inputs.weight != null && inputs.weight !== '' ? String(inputs.weight) : null;
  const unit = inputs && inputs.unit === 'imperial' ? 'lb' : 'kg';

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.centered}>
        <View style={s.header}>
          <Text style={s.title}>{t('tab_journey')}</Text>
          <Text style={s.sub}>{t('journey_subtitle')}</Text>
        </View>

        <View style={s.block}>
          <FoodLogHero variant="journey" />
        </View>

        <View style={s.duo}>
          <TouchableOpacity style={s.tile} activeOpacity={0.75} onPress={() => navigation.navigate('Progress')} accessibilityRole="button">
            <View style={s.tileTop}>
              <FeatureIcon name="calc_trend" size={22} color={colors.ink} />
              <Text style={s.chev}>›</Text>
            </View>
            <Text style={s.tileTitle}>{t('today_section_progress')}</Text>
            <View style={s.num}>
              <Text style={s.cap}>{t('cal_weight')}</Text>
              <Text style={s.big}>{weight || '—'}{weight ? <Text style={s.unit}> {unit}</Text> : null}</Text>
            </View>
            <Text style={s.foot}>{t('cal_rc_title')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.tile}
            activeOpacity={0.75}
            onPress={() => navigation.navigate(premium ? 'SerumCurve' : 'Paywall', premium ? undefined : { source: 'journey_serum' })}
            accessibilityRole="button"
          >
            <View style={s.tileTop}>
              <FeatureIcon name="curve" size={22} color={colors.ink} />
              {!premium ? <Text style={s.tag}>{t('paywall_premium')}</Text> : <Text style={s.chev}>›</Text>}
            </View>
            <Text style={s.tileTitle}>{t('body_card_dosing_title')}</Text>
            {premium && level ? (
              <>
                <View style={s.nameRow}>
                  <View style={[s.dot, { backgroundColor: level.protocol.color || colors.data }]} />
                  <Text style={s.name}>{levelName}</Text>
                </View>
                <View style={s.num}>
                  <Text style={s.cap}>{t('curve_current_level')}</Text>
                  <Text style={[s.big, { color: colors.data }]}>{levelLabel(level.value)}<Text style={s.unit}> {level.unit}</Text></Text>
                  <View style={s.chip}><Text style={s.chipText}>{t('hy_estimated')}</Text></View>
                </View>
              </>
            ) : (
              <Text style={s.desc}>{t('body_card_dosing_desc')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Graduated (DESIGN.md §3–§5): tiles as tall as their content, 34 pt numbers.
const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.ground },
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18, gap: 4 },
  title: { fontSize: 34, fontWeight: '700', color: c.ink, letterSpacing: -0.8 },
  sub: { fontSize: 15, color: c.ink2 },
  block: { paddingHorizontal: 16, marginBottom: 12 },
  duo: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, alignItems: 'stretch' },
  tile: { flex: 1, backgroundColor: c.raised, borderRadius: 24, padding: 16, gap: 8, minWidth: 0 },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chev: { fontSize: 20, color: c.tick },
  tag: { borderWidth: 1, borderColor: c.line, color: c.ink2, borderRadius: 13, paddingHorizontal: 9, paddingVertical: 2, fontSize: 12, fontWeight: '500', overflow: 'hidden' },
  tileTitle: { fontSize: 17, fontWeight: '600', color: c.ink },
  num: { gap: 4, paddingTop: 10, marginTop: 'auto' },
  cap: { fontSize: 12, fontWeight: '500', color: c.ink3 },
  big: { fontSize: 34, fontWeight: '500', color: c.ink, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 13, fontWeight: '400', color: c.ink3, fontFamily: MONO['400'], letterSpacing: 0 },
  desc: { fontSize: 13, color: c.ink2 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
  name: { flex: 1, fontSize: 15, color: c.ink },
  chip: { alignSelf: 'flex-start', minHeight: 26, borderRadius: 13, borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, justifyContent: 'center', marginTop: 2 },
  chipText: { fontSize: 12, fontWeight: '500', color: c.ink2 },
  foot: { fontSize: 13, color: c.ink2 },
});
