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
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useWindowSize } from '../lib/windowSize';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TAB_SCREEN_EDGES } from '../lib/tabBarStyle';
import { useNavigation, useFocusEffect, NavigationContext } from '@react-navigation/native';
import BookPanes, { useBook, useBookSelection, useFoldPush } from '../components/BookPanes';
import { setSelection, clearSelection } from '../lib/bookSelection';
import ProgressScreen from './ProgressScreen';
import SerumCurveScreen from './SerumCurveScreen';
import FoodChatScreen from './FoodChatScreen';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { hasPremium } from '../lib/entitlement';
import { usePremiumUpdates } from '../lib/usePremium';
import { getCalcInputs } from '../lib/realityCheck';
import { addSyncListener } from '../lib/sync';
import { curveReloadOnSync, sameCurveLevel } from '../lib/curveReload';
import { getCachedUser } from '../lib/supabase';
import { getActiveProtocols, getCalcSnapshots, getRealityChecks } from '../lib/database';
import { progressTile } from '../lib/progressTile';
import { formatDate, formatNumber, formatInt, unitText } from '../lib/localeFormat';
import LearnBlock from './components/LearnBlock';
import { defaultCurveLevel, levelLabel } from '../lib/serumModel';
import { loadCurveView } from '../lib/curveViewStore';
import { MONO } from '../lib/fonts';
import { displayColor } from '../lib/protocolColors';
import FoodLogHero from './components/FoodLogHero';
import DashTile, { dashTileStyles } from './components/DashTile';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';

// S-26 BK-19: the events that change what the Progress tile shows. A calculator change saved
// on the Progress page (the right page beside the tiles, which never lose focus) or a sync
// that may have pulled one from another device.

function tilesNeedRefresh(e) {
  if (!e) return false;
  if (e.type === 'sync_complete' || e.type === 'import_complete') return true;
  return e.type === 'data_changed' && e.what === 'calc';
}

export default function JourneyScreen() {
  const { t, language } = useLanguage();
  const { fontScale } = useWindowSize(); // A-129: every window read goes through the measured root
  // Tile text helpers in the app language (lib/localeFormat): "Aug 31" / "31 de ago." (the
  // year only when it is not this year), "−3.4" / "−3,4", "2,810" / "2.810".
  const shortDate = (iso) => formatDate(String(iso).slice(0, 10), language, 'dayMonthAuto') || iso;
  const signedDelta = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + formatNumber(Math.abs(v), language, { digits: 1 });
  const fmtInt = (n) => formatInt(n, language);
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
  // Dose accumulation tile: the compound the Curve opens on — the first one the user left
  // selected there (lib/curveView), else the first charted — and its Est. level now, the same
  // lib function the Curve screen uses (lib/serumModel), Premium only.
  const [level, setLevel] = useState(null);
  const loadLevel = useCallback(async (isAlive = () => true) => {
    const user = await getCachedUser();
    if (!isAlive() || !user) return;
    const savedView = await loadCurveView(user.id);
    if (!isAlive()) return;
    try {
      const next = defaultCurveLevel(getActiveProtocols(user.id), Date.now(), undefined, savedView);
      // The same compound, value and unit → no state change (a reload is not a re-render).
      setLevel((prev) => (sameCurveLevel(prev, next) ? prev : next));
    } catch { setLevel(null); }
  }, []);
  // A-164: a Premium change made elsewhere (panel, store expiry, refund) applies while open.
  usePremiumUpdates((pro) => {
    setPremium(pro);
    if (!pro) setLevel(null); else loadLevel().catch(() => {});
  });
  useFocusEffect(useCallback(() => {
    let alive = true;
    hasPremium().then(async (pro) => {
      if (!alive) return;
      setPremium(pro);
      if (!pro) { setLevel(null); return; }
      await loadLevel(() => alive);
    }).catch(() => {});
    loadTile().catch(() => {});
    return () => { alive = false; };
  }, [loadTile, loadLevel]));
  // BK-19: refresh the tiles the moment the Progress page saves, without switching tabs.
  useEffect(() => addSyncListener((e) => {
    if (tilesNeedRefresh(e)) loadTile().catch(() => {});
  }), []);
  // The Est. level follows a selection changed on the Curve page beside it (book layout).
  useEffect(() => addSyncListener((e) => {
    if (e && e.type === 'data_changed' && e.what === 'curve' && premium === true) loadLevel().catch(() => {});
  }), [premium, loadLevel]);
  // PK-16 (1.3.1 review): and the protocols a sync, an import or a dose / protocol change brings,
  // debounced (lib/curveReload, the same events as the Curve screen).
  useEffect(() => curveReloadOnSync(addSyncListener, () => { if (premium === true) loadLevel().catch(() => {}); }), [premium, loadLevel]);
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
          {/* Redesign part 2: "Progress"; the Progress hero's numbers, or the prompt sentence.
              The tile itself is shared with My Body (A-125, screens/components/DashTile). */}
          <DashTile
            icon="calc_trend"
            iconColor={colors.ink2}
            title={t('cal_snap_title')}
            onPress={() => (book ? open('progress') : navigation.navigate('Progress'))}
            book={book}
            selected={page === 'progress'}
          >
            {tile ? (
              <>
                <View style={s.num}>
                  <Text style={s.cap}>{t('cal_weight')}</Text>
                  <Text style={s.big}>{formatNumber(tile.weight, language)}<Text style={s.unit}> {t(tile.unit === 'lb' ? 'cal_unit_lb' : 'cal_unit_kg')}</Text></Text>
                  {tile.since ? (
                    <Text style={s.foot}>
                      {t('cal_since_date').replace('{date}', shortDate(tile.since.date))} <Text style={s.vin}>{signedDelta(tile.since.delta)}{'\u00A0'}{t(tile.unit === 'lb' ? 'cal_unit_lb' : 'cal_unit_kg')}</Text>
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
          </DashTile>

          <DashTile
            icon="curve_loose"
            iconColor={colors.data}
            title={t('body_card_dosing_title')}
            tag={!premium ? t('paywall_premium') : null}
            onPress={() => {
              // Free users: the Paywall full screen, exactly as today, also on a book (BK-11).
              if (!premium) { navigation.navigate('Paywall', { source: 'journey_serum' }); return; }
              if (book) open('curve'); else navigation.navigate('SerumCurve');
            }}
            book={book}
            selected={page === 'curve'}
          >
            {premium && level ? (
              <>
                <View style={s.nameRow}>
                  <View style={[s.dot, { backgroundColor: displayColor(level.protocol.color) || colors.data }]} />
                  <Text style={s.name}>{levelName}</Text>
                </View>
                <View style={[s.num, s.numEnd]}>
                  <Text style={s.cap}>{t('curve_current_level')}</Text>
                  <Text style={[s.big, { color: colors.data }]}>{levelLabel(level.value, language)}<Text style={s.unit}> {unitText(level.unit, language)}</Text></Text>
                  <View style={s.chip}><Text style={s.chipText}>{t('hy_estimated')}</Text></View>
                </View>
              </>
            ) : (
              <Text style={s.desc}>{t('body_card_dosing_desc')}</Text>
            )}
          </DashTile>
        </View>

        {/* Redesign part 3: Understand the numbers + Sources & references under the tiles. */}
        <LearnBlock style={s.learn} />

        <View style={{ height: 24 }} />
      </ScrollView>
  );

  if (!book) {
    return (
      <SafeAreaView style={s.container} edges={TAB_SCREEN_EDGES}>
        {dashboard}
      </SafeAreaView>
    );
  }

  const right = page === 'food' ? <FoodChatScreen embedded params={selParams} />
    : page === 'curve' ? <SerumCurveScreen embedded />
      : page === 'wait' ? <View style={s.container} />
        : <ProgressScreen embedded />;

  return (
    <SafeAreaView style={s.container} edges={TAB_SCREEN_EDGES}>
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
  // The tile and its content (num, big, unit, cap, foot, desc, the BK-8 outline): shared with My Body.
  ...dashTileStyles(c),
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
  name: { flex: 1, fontSize: 15, color: c.ink },
  chip: { alignSelf: 'flex-start', minHeight: 26, borderRadius: 13, borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, justifyContent: 'center', marginTop: 2 },
  chipText: { fontSize: 12, fontWeight: '500', color: c.ink2 },
  chipMeas: { borderColor: c.data },
  chipMeasText: { color: c.data },
  vin: { fontFamily: MONO['500'], color: c.ink, fontVariant: ['tabular-nums'] },
  learn: { marginHorizontal: 16, marginTop: 20 },
});
