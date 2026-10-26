// A-135 (founder 2026-10-17, picture docs/design/a135-today-skeleton.html, "aprovo, pulso ligado"):
// Today's placeholder blocks and the app's opening page. Each block is the real card in its real
// colour (c.raised, c.slab) holding quiet bars where the text and numbers will be — c.well on the
// cards, c.slabInv.line in the ring block, c.line on the ground — never a number, a word or an
// "empty" message. Each block takes the height the mould remembered (lib/todaySkeleton), so the
// blocks under it stay where they will be. The bars pulse slowly (1.6 s, opacity only), still with
// Reduce Motion / Remove animations. Screen readers hear "Carregando" once; the bars are hidden.
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, AccessibilityInfo } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, useReducedMotion, withRepeat, withTiming, cancelAnimation, Easing } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatDate } from '../../lib/localeFormat';
import { CONTENT_MAX_WIDTH } from '../../lib/responsive';
import { TAB_SCREEN_EDGES } from '../../lib/tabBarStyle';
import BookPanes, { useBook } from '../../components/BookPanes';
import { PULSE_MS, shouldPulse, pulsePhase, skeletonPlan } from '../../lib/todaySkeleton';
import { cachedTodayLayout } from '../../lib/todayLayoutStore';
import { trackerFit } from '../../lib/trackerFit';

// Today's header and column: one definition for Today and its opening, so the swap moves nothing.
export const TODAY_HEADER = {
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18, gap: 2 },
  date: { fontSize: 15 },
  title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.8 },
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
};

function useReduceMotion() {
  const initial = useReducedMotion();
  const [reduceMotion, setReduceMotion] = useState(initial);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduceMotion(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduceMotion(!!v));
    return () => { alive = false; if (sub && sub.remove) sub.remove(); };
  }, []);
  return reduceMotion;
}

// The slow pulse, in step with the wall clock so every placeholder (the opening's, then Today's)
// pulses together. Opacity only; none at all with Reduce Motion. Bar, Dot and this pulse also draw
// Settings' profile card while it is not known yet (A-169).
export function usePulse() {
  const reduceMotion = useReduceMotion();
  const on = shouldPulse({ reduceMotion });
  const p = useSharedValue(0);
  useEffect(() => {
    if (!on) { cancelAnimation(p); p.value = 0; return undefined; }
    const start = pulsePhase(Date.now());
    p.value = start;
    p.value = withRepeat(withTiming(start + 1, { duration: PULSE_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  return useAnimatedStyle(() => ({ opacity: 0.75 + 0.25 * Math.cos(2 * Math.PI * p.value) }));
}

// A bar in the box of the text line it stands for (lh), so it sits where the text will be.
// ps: the bar pulses on its own (the ring block, where the tracks and week circles stay still).
export function Bar({ w, h = 12, lh, color, style, ps }) {
  const Box = ps ? Animated.View : View;
  return (
    <Box style={[{ height: lh || h, justifyContent: 'center' }, style, ps]}>
      <View style={{ width: w, height: h, borderRadius: 6, backgroundColor: color }} />
    </Box>
  );
}
export const Dot = ({ size, color, style, ps }) => {
  const Box = ps ? Animated.View : View;
  return <Box style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style, ps]} />;
};
function Ring({ size, r, sw, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={50} cy={50} r={r} stroke={color} strokeWidth={sw} fill="none" />
    </Svg>
  );
}

function AlertsShape({ spec, c, ps, s }) {
  return (
    <View style={s.block}>
      <Animated.View style={[s.lab, ps]}><Bar w={72} lh={22} color={c.line} /><Bar w={12} h={10} lh={20} color={c.line} /></Animated.View>
      <View style={[s.alist, s.grow]}>
        {Array.from({ length: spec.n || 1 }, (_, i) => (
          <View key={i} style={[s.arow, i > 0 && s.aitemSep]}>
            <Animated.View style={[s.arowIn, ps]}>
              <Dot size={22} color={c.well} />
              <View style={s.atext}><Bar w="78%" lh={22} color={c.well} /><Bar w="52%" h={10} lh={20} color={c.well} /></View>
              <Dot size={44} color={c.well} />
            </Animated.View>
          </View>
        ))}
      </View>
    </View>
  );
}

function PendingShape({ spec, c, ps, s }) {
  return (
    <View style={s.block}>
      <Animated.View style={[s.lab, ps]}><Bar w={150} lh={22} color={c.line} /></Animated.View>
      {Array.from({ length: spec.n || 1 }, (_, i) => (
        <View key={i} style={[s.pend, s.grow]}>
          <Animated.View style={[s.pendIn, ps]}>
            <View style={s.pendRow}><Dot size={7} color={c.well} /><Bar w="70%" lh={22} color={c.well} style={s.grow} /></View>
            <View style={s.acts}><View style={[s.btn, s.grow, { backgroundColor: c.well }]} /><View style={[s.btn, s.grow, { backgroundColor: c.well }]} /></View>
          </Animated.View>
        </View>
      ))}
    </View>
  );
}

// The ring block: the same fit as TodayTracker (lib/trackerFit on the measured slab interior), so the
// gauges do not move at the swap. As in the picture, only the bars (and the flame's dot) pulse; the
// ring tracks and the week circles stay still.
function TrackerShape({ c, ps, s }) {
  const [inner, setInner] = useState(0);
  const fit = trackerFit(inner);
  const line = c.slabInv.line;
  return (
    <View style={[s.slab, s.grow]} onLayout={(e) => setInner(Math.round(e.nativeEvent.layout.width) - 40)}>
      <View style={s.slabIn}>
        <View style={[s.gauges, { gap: fit.gap }]}>
          <View style={{ width: fit.big, height: fit.big }}>
            <Ring size={fit.big} r={38} sw={9} color={line} />
            <View style={s.bigIn}><Bar w={44} h={20} lh={38} color={line} ps={ps} /><Bar w={38} h={8} lh={14} color={line} ps={ps} /><Bar w={30} h={8} lh={14} color={line} ps={ps} /></View>
          </View>
          <View style={s.side}>
            {[0, 1].map((i) => (
              <View key={i} style={s.sideRow}>
                <Ring size={44} r={40} sw={10} color={line} />
                <View style={s.sideText}><Bar w={56} h={10} lh={20} color={line} ps={ps} /><Bar w={48} h={9} lh={17} color={line} ps={ps} /></View>
                <Bar w={36} h={16} lh={31} color={line} ps={ps} />
              </View>
            ))}
          </View>
        </View>
        <View style={s.week}>
          {Array.from({ length: 7 }, (_, i) => (
            <View key={i} style={s.wd}><View style={[s.wdc, { borderColor: line }]} /><Bar w={22} h={8} lh={15} color={line} ps={ps} /></View>
          ))}
        </View>
        <View style={[s.streak, { borderTopColor: line }]}>
          <Dot size={20} color={line} ps={ps} />
          <View style={s.grow}><Bar w={104} lh={22} color={line} ps={ps} /></View>
          <Bar w={92} h={10} lh={20} color={line} ps={ps} />
        </View>
      </View>
    </View>
  );
}

function FoodShape({ spec, c, ps, s }) {
  const tall = spec.h - 26 >= 150; // the emphasised card (a reality check running) has its button
  return (
    <View style={[s.food, s.grow]}>
      <Animated.View style={[s.foodIn, ps]}>
        <View style={s.fhead}><Dot size={40} color={c.well} /><Bar w="62%" lh={22} color={c.well} style={s.grow} /></View>
        <Bar w="58%" lh={24} color={c.well} />
        <Bar w="84%" h={10} lh={20} color={c.well} />
        {tall && <View style={[s.cta, { backgroundColor: c.well }]} />}
      </Animated.View>
    </View>
  );
}

function EmptyShape({ c, ps, s }) {
  return (
    <View style={[s.empty, s.grow]}>
      <Animated.View style={[s.emptyIn, ps]}>
        <Dot size={44} color={c.well} />
        <Bar w={160} h={16} lh={28} color={c.well} />
        <Bar w={200} h={10} lh={20} color={c.well} />
        <View style={[s.btn, s.wide, { backgroundColor: c.well }]} />
      </Animated.View>
    </View>
  );
}

function DosesShape({ spec, c, ps, s }) {
  return (
    <View style={s.block}>
      <Animated.View style={[s.lab, ps]}><Bar w={78} h={15} lh={28} color={c.line} /><Bar w={118} h={10} lh={20} color={c.line} /></Animated.View>
      {(spec.cards || []).map((h, i) => (
        <View key={i} style={[s.dose, { height: h }]}>
          <Animated.View style={[s.doseIn, ps]}>
            <View style={s.dtop}>
              <Dot size={10} color={c.well} style={s.ddot} />
              <View style={s.dinfo}><Bar w={96} h={14} lh={25} color={c.well} /><Bar w={150} h={10} lh={20} color={c.well} /></View>
              <View style={s.dright}><Bar w={46} lh={22} color={c.well} /><View style={[s.tag, { backgroundColor: c.well }]} /></View>
            </View>
            <Bar w="70%" h={9} lh={18} color={c.well} />
            <View style={s.acts}><View style={[s.btn, s.grow, { backgroundColor: c.well }]} /><View style={[s.btn, s.grow2, { backgroundColor: c.well }]} /></View>
          </Animated.View>
        </View>
      ))}
    </View>
  );
}

const SHAPES = { alerts: AlertsShape, pending: PendingShape, tracker: TrackerShape, food: FoodShape, empty: EmptyShape, doses: DosesShape };

// One placeholder block, as tall as the room its real block took last time. first: the one that
// tells a screen reader "Carregando" (the others are silent).
export function SkeletonBlock({ spec, first }) {
  const { colors: c } = useTheme();
  const { t } = useLanguage();
  const ps = usePulse();
  if (!spec || !SHAPES[spec.key]) return null;
  const Shape = SHAPES[spec.key];
  const s = makeStyles(c);
  return (
    <View
      style={{ height: spec.h, overflow: 'hidden' }}
      accessible={!!first}
      accessibilityRole={first ? 'progressbar' : undefined}
      accessibilityState={first ? { busy: true } : undefined}
      accessibilityLabel={first ? t('loading') : undefined}
    >
      <View style={s.fill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Shape spec={spec} c={c} ps={ps} s={s} />
      </View>
    </View>
  );
}

// The app's opening after a signed-in session (App.js BootTabs): Today's header and the remembered
// placeholder blocks, in Today's own column (and on the left page of the book; the right page is
// the Dose log's, which shows its own loading once the app is up).
export function TodayOpening() {
  const { colors: c } = useTheme();
  const { t, language } = useLanguage();
  const book = useBook();
  const plan = skeletonPlan(cachedTodayLayout(null, book ? 'book' : 'single'));
  const hs = headerStyles(c);
  const date = formatDate(new Date(), language, 'weekdayLong');
  const page = (
    <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={false} contentContainerStyle={hs.centered}>
      <View style={hs.header}>
        <Text style={hs.date}>{date}</Text>
        <Text style={hs.title}>{t('tab_today')}</Text>
      </View>
      {plan.map((b, i) => <SkeletonBlock key={b.key} spec={b} first={i === 0} />)}
    </ScrollView>
  );
  return (
    <SafeAreaView style={hs.container} edges={TAB_SCREEN_EDGES}>
      {book ? <BookPanes left={page} right={<View />} rightKey="log" /> : page}
    </SafeAreaView>
  );
}

const headerStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.ground },
  centered: TODAY_HEADER.centered,
  header: TODAY_HEADER.header,
  date: { ...TODAY_HEADER.date, color: c.ink2 },
  title: { ...TODAY_HEADER.title, color: c.ink },
});

// The real blocks' geometry (TodayScreen todayV21Styles, TodayTracker, FoodLogHero), colours from
// the theme only.
const makeStyles = (c) => StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  grow2: { flex: 2 },
  wide: { alignSelf: 'stretch', marginTop: 8 },
  block: { flex: 1, paddingHorizontal: 16, marginBottom: 26, gap: 10 },
  lab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, gap: 8 },
  alist: { backgroundColor: c.raised, borderRadius: 22, paddingLeft: 16, paddingRight: 8, overflow: 'hidden' },
  arow: { minHeight: 64 },
  arowIn: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: 12, paddingVertical: 10 },
  aitemSep: { borderTopWidth: 1, borderTopColor: c.line },
  atext: { flex: 1, minWidth: 0, gap: 2 },
  pend: { backgroundColor: c.raised, borderRadius: 22, overflow: 'hidden' },
  pendIn: { padding: 16, gap: 12 },
  pendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  acts: { flexDirection: 'row', gap: 10 },
  btn: { minHeight: 52, borderRadius: 26 },
  slab: { backgroundColor: c.slab, borderRadius: 28, marginHorizontal: 16, marginBottom: 26, overflow: 'hidden' },
  slabIn: { flex: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, gap: 18 },
  gauges: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  bigIn: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 1 },
  side: { flex: 1, gap: 14, minWidth: 0 },
  sideRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sideText: { flex: 1, minWidth: 0, gap: 2 },
  week: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  wd: { flex: 1, alignItems: 'center', gap: 6 },
  wdc: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14, borderTopWidth: 1 },
  food: { backgroundColor: c.raised, borderRadius: 24, marginHorizontal: 16, marginBottom: 26, overflow: 'hidden' },
  foodIn: { flex: 1, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, gap: 8 },
  fhead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  cta: { minHeight: 48, borderRadius: 24, marginTop: 6 },
  empty: { backgroundColor: c.raised, borderRadius: 24, marginHorizontal: 16, marginBottom: 26, overflow: 'hidden' },
  emptyIn: { flex: 1, padding: 24, alignItems: 'center', gap: 8 },
  dose: { backgroundColor: c.raised, borderRadius: 24, overflow: 'hidden' },
  doseIn: { flex: 1, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, gap: 14 },
  dtop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  ddot: { marginTop: 8 },
  dinfo: { flex: 1, minWidth: 0, gap: 4 },
  dright: { alignItems: 'flex-end', gap: 6 },
  tag: { width: 60, height: 24, borderRadius: 12 },
});
