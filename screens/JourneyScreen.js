/**
 * DoseTrace — Journey tab (redesign, A-52 dashboard approved by the founder 2026-09-29:
 * "I like this proposal. Keep this.").
 *
 * A dashboard: the AI food log card on top (the daily habit), then two tiles side by
 * side — Progress (your numbers + reality check → the Progress screen, which holds the
 * full calculator: numbers → target → daily plan → reality check → progress) and Dose
 * accumulation (→ the curve; Premium). Rebuild = replace: the long scroll moved behind
 * the Progress tile unchanged, nothing removed.
 *
 * S-26 book layout (docs/specs/book-layout.md BK-5): on an unfolded foldable the dashboard
 * is the left page and the right page shows Your progress by default; the food log card
 * opens the AI food log chat there, the Dose accumulation tile the Curve (Premium; free
 * users get the Paywall full screen as today, BK-11). The chosen card has an ink outline
 * (BK-8). On a phone, or folded, nothing changes (BK-2).
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, NavigationContext } from '@react-navigation/native';
import BookPanes, { useBook, useBookSelection, useFoldPush } from '../components/BookPanes';
import { setSelection, clearSelection } from '../lib/bookSelection';
import ProgressScreen from './ProgressScreen';
import SerumCurveScreen from './SerumCurveScreen';
import FoodChatScreen from './FoodChatScreen';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { hasPremium } from '../lib/entitlement';
import { getCalcInputs } from '../lib/realityCheck';
import { addSyncListener } from '../lib/sync';
import { getCachedUser } from '../lib/supabase';
import { getActiveProtocols, getCalcSnapshots, getRealityChecks } from '../lib/database';
import { progressTile } from '../lib/progressTile';
import LearnBlock from './components/LearnBlock';
import RowChevron from '../components/RowChevron';
import { defaultCurveLevel, levelLabel } from '../lib/serumModel';
import { MONO } from '../lib/fonts';
import { displayColor } from '../lib/protocolColors';
import FoodLogHero from './components/FoodLogHero';
import FeatureIcon from '../components/FeatureIcon';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';

// S-26 BK-19: the events that change what the Progress tile shows. A calculator change saved
// on the Progress page (the right page beside the tiles, which never lose focus) or a sync
// that may have pulled one from another device.
const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

function tilesNeedRefresh(e) {
  if (!e) return false;
  if (e.type === 'sync_complete' || e.type === 'import_complete') return true;
  return e.type === 'data_changed' && e.what === 'calc';
}

export default function JourneyScreen() {
  const { t, language } = useLanguage();
  const { fontScale } = useWindowDimensions();
  const locale = LOCALE_MAP[language] || 'en-US';
  // Tile text helpers: "Aug 31" (the year only when it is not this year), "−3.4", "2,810".
  const shortDate = (iso) => {
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
  };
  const signedDelta = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
  const fmtInt = (n) => Math.round(n).toLocaleString(locale);
  const { colors } = useTheme();
  const navigation = useNavigation();
  const s = makeStyles(colors);
  // null = not known yet (reads as free on the dashboard, exactly as before).
  const [premium, setPremium] = useState(null);
  const book = useBook();
  const { sel, params: selParams } = useBookSelection('Journey', 'progress');
  useFoldPush('Journey');
  // The Curve is Premium: if Premium ended while it was the open page, fall back to the default.
  useEffect(() => { if (premium === false && sel === 'curve') clearSelection('Journey'); }, [premium, sel]);
  const open = (value, params = null) => setSelection('Journey', value, { explicit: true, params });
  // The food log card (FoodLogHero) opens the chat with navigation.navigate('FoodChat'). On a
  // book page the chat opens on the right page instead; every other route (the Paywall when
  // the log is locked) goes through unchanged. Stable per navigation, so the card's focus
  // effect does not re-run on every render.
  const heroNav = useMemo(() => {
    if (!book) return null;
    const nav = Object.create(navigation);
    nav.navigate = (...args) => {
      if (args[0] === 'FoodChat') { setSelection('Journey', 'food', { explicit: true, params: args[1] || null }); return undefined; }
      return navigation.navigate(...args);
    };
    return nav;
  }, [book, navigation]);
  const [heroH, setHeroH] = useState(0);
  // Progress tile (redesign part 2): the Progress hero's numbers (lib/progressTile), or null
  // until the user's numbers give an estimate (the tile then shows the prompt sentence).
  const [tile, setTile] = useState(null);
  const loadTile = useCallback(async () => {
    const saved = await getCalcInputs().catch(() => null);
    const user = await getCachedUser().catch(() => null);
    const uid = user && user.id;
    let snapshots = [], checks = [];
    try { if (uid) { snapshots = getCalcSnapshots(uid); checks = getRealityChecks(uid); } } catch { /* empty */ }
    setTile(progressTile({ saved, meta: user && user.user_metadata, snapshots, checks }));
  }, []);
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
    loadTile().catch(() => {});
    return () => { alive = false; };
  }, [loadTile]));
  // BK-19: refresh the tiles the moment the Progress page saves, without switching tabs.
  useEffect(() => addSyncListener((e) => {
    if (tilesNeedRefresh(e)) loadTile().catch(() => {});
  }), []);
  // Named as the Curve screen names its line (a blend component: "Blend · Component (est.)").
  const lp = level ? level.protocol : null;
  const levelName = !lp ? null
    : lp.__blend ? `${t(lp.__blend)} · ${t(lp.compound_id)} ${t('blend_est_marker')}`
      : (lp.compound_id ? t(lp.compound_id) : lp.name);


  // The right page actually shown (BK-5): the Curve only for Premium; while Premium is not
  // known yet the page waits instead of flashing Progress.
  const page = sel === 'curve' && premium !== true ? (premium === null ? 'wait' : 'progress') : sel;
  const outline = <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.selected]} />;

  const dashboard = (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.centered}>
        <View style={s.header}>
          <Text style={s.title}>{t('tab_journey')}</Text>
          <Text style={s.sub}>{t('journey_subtitle')}</Text>
        </View>

        <View style={s.block}>
          {book ? (
            <View onLayout={(e) => setHeroH(e.nativeEvent.layout.height)}>
              <NavigationContext.Provider value={heroNav}>
                <FoodLogHero variant="journey" />
              </NavigationContext.Provider>
              {page === 'food' && heroH > 0 ? outline : null}
            </View>
          ) : (
            <FoodLogHero variant="journey" />
          )}
        </View>

        <View style={[s.duo, fontScale >= 1.3 && s.duoStack]}>
          <TouchableOpacity
            style={s.tile}
            activeOpacity={0.75}
            onPress={() => (book ? open('progress') : navigation.navigate('Progress'))}
            accessibilityRole="button"
            accessibilityState={book ? { selected: page === 'progress' } : undefined}
          >
            {book && page === 'progress' ? outline : null}
            <View style={s.tileTop}>
              <FeatureIcon name="calc_trend" size={22} color={colors.ink2} />
              <RowChevron color={colors.tick} />
            </View>
            {/* Redesign part 2: "Progress"; the Progress hero's numbers, or the prompt sentence. */}
            <Text style={s.tileTitle}>{t('cal_snap_title')}</Text>
            {tile ? (
              <>
                <View style={s.num}>
                  <Text style={s.cap}>{t('cal_weight')}</Text>
                  <Text style={s.big}>{tile.weight}<Text style={s.unit}> {t(tile.unit === 'lb' ? 'cal_unit_lb' : 'cal_unit_kg')}</Text></Text>
                  {tile.since ? (
                    <Text style={s.foot}>
                      {t('cal_since')} {shortDate(tile.since.date)}: <Text style={s.vin}>{signedDelta(tile.since.delta)} {t(tile.unit === 'lb' ? 'cal_unit_lb' : 'cal_unit_kg')}</Text>
                    </Text>
                  ) : null}
                </View>
                <View style={[s.num, s.numSep, s.numEnd]}>
                  <Text style={s.cap}>{t('cal_tdee')}</Text>
                  <Text style={s.big}>{fmtInt(tile.tdee)}<Text style={s.unit}> {t('cal_kcal')}</Text></Text>
                  <View style={[s.chip, tile.measured && s.chipMeas]}>
                    <Text style={[s.chipText, tile.measured && s.chipMeasText]}>{tile.measured ? t('hy_rc_measured_chip') : t('hy_estimated')}</Text>
                  </View>
                </View>
              </>
            ) : (
              <Text style={s.desc}>{t('cal_need_inputs')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.tile}
            activeOpacity={0.75}
            onPress={() => {
              // Free users: the Paywall full screen, exactly as today, also on a book (BK-11).
              if (!premium) { navigation.navigate('Paywall', { source: 'journey_serum' }); return; }
              if (book) open('curve'); else navigation.navigate('SerumCurve');
            }}
            accessibilityRole="button"
            accessibilityState={book ? { selected: page === 'curve' } : undefined}
          >
            {book && page === 'curve' ? outline : null}
            <View style={s.tileTop}>
              <FeatureIcon name="curve" size={22} color={colors.data} />
              {!premium ? <Text style={s.tag}>{t('paywall_premium')}</Text> : <RowChevron color={colors.tick} />}
            </View>
            <Text style={s.tileTitle}>{t('body_card_dosing_title')}</Text>
            {premium && level ? (
              <>
                <View style={s.nameRow}>
                  <View style={[s.dot, { backgroundColor: displayColor(level.protocol.color) || colors.data }]} />
                  <Text style={s.name}>{levelName}</Text>
                </View>
                <View style={[s.num, s.numEnd]}>
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

        {/* Redesign part 3: Understand the numbers + Sources & references under the tiles. */}
        <LearnBlock style={s.learn} />

        <View style={{ height: 24 }} />
      </ScrollView>
  );

  if (!book) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
        {dashboard}
      </SafeAreaView>
    );
  }

  const right = page === 'food' ? <FoodChatScreen embedded params={selParams} />
    : page === 'curve' ? <SerumCurveScreen embedded />
      : page === 'wait' ? <View style={s.container} />
        : <ProgressScreen embedded />;

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
      <BookPanes left={dashboard} right={right} rightKey={page} />
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
  duoStack: { flexDirection: 'column' }, // prototype .duo.stack from ~130% text size
  tile: { flex: 1, backgroundColor: c.raised, borderRadius: 24, padding: 16, gap: 8, minWidth: 0 },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: -2 },
  tag: { borderWidth: 1, borderColor: c.line, color: c.ink2, borderRadius: 12, minHeight: 24, lineHeight: 20, paddingHorizontal: 9, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  tileTitle: { fontSize: 17, fontWeight: '600', color: c.ink },
  // prototype .tile .num (gap 4); .sep adds 10 on top with a line; .end sits at the bottom.
  num: { gap: 4 },
  numSep: { paddingTop: 10, borderTopWidth: 1, borderTopColor: c.line },
  numEnd: { marginTop: 'auto' },
  cap: { fontSize: 12, fontWeight: '500', color: c.ink2 },
  big: { fontSize: 34, fontWeight: '500', color: c.ink, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 13, fontWeight: '400', color: c.ink3, fontFamily: MONO['400'], letterSpacing: 0 },
  desc: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
  name: { flex: 1, fontSize: 15, color: c.ink },
  chip: { alignSelf: 'flex-start', minHeight: 26, borderRadius: 13, borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, justifyContent: 'center', marginTop: 2 },
  chipText: { fontSize: 12, fontWeight: '500', color: c.ink2 },
  chipMeas: { borderColor: c.data },
  chipMeasText: { color: c.data },
  foot: { fontSize: 13, lineHeight: 18, color: c.ink2, fontVariant: ['tabular-nums'] },
  vin: { fontFamily: MONO['500'], color: c.ink, fontVariant: ['tabular-nums'] },
  learn: { marginHorizontal: 16, marginTop: 20 },
  // BK-8: the card open on the right page has an ink outline (same radius as the cards).
  selected: { borderWidth: 2, borderColor: c.ink, borderRadius: 24 },
});
