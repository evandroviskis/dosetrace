import { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedProps, useAnimatedStyle, useDerivedValue,
  withTiming, Easing, useReducedMotion,
} from 'react-native-reanimated';
import { useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';
import { numberSymbols } from '../lib/localeFormat';
import { MONO } from '../lib/fonts';
import {
  AnimatedNumber, clamp01, eOutQuad, eInOutSine, eInOutCubic,
  invInOutSine, bumpScale, dropPath,
} from './motion';

const APath = Animated.createAnimatedComponent(Path);
const ALine = Animated.createAnimatedComponent(Line);
const ACircle = Animated.createAnimatedComponent(Circle);

/**
 * The flagship moment: the dose-accumulation curve, drawn the way the model
 * behaves ("Version B"). A pen moves in TIME, so each dose lands instantly and
 * then decays; a camera starts close on the first dose, follows the pen and pulls
 * back to the whole cycle; every dose drops in (the peak jumps, a ring pulses,
 * "+5.0" floats up, the number bumps); at the end a dashed line links the rising
 * peaks — accumulation, shown without words. It is a real accumulation model,
 * labelled "Example", never the user's data.
 *
 * Graduated look (docs/design/prototype.html HERO, approved 2026-09-30): a plain
 * raised card, the curve and its estimate fill in `data`, no gradient or glow; the
 * rising-peaks line is a dashed `ink2` line; the "Example" tag is an outline tag.
 *
 * Everything is derived from ONE timeline clock on the UI thread (no React
 * re-render per frame). Reduce Motion → final state at once. `playKey` makes a
 * frequently-visited screen (the Body tab) play it in full only once per app
 * session; onboarding, the paywall and the feature preview omit it and play it
 * every time they open — there the curve IS the pitch.
 */

// Illustrative model: short half-life vs interval so the "down" between doses is
// plain while the peaks still creep up (accumulation), plus a wash-out tail.
const HALF = 2.2, INTERVAL = 3, DOSE = 5, NDOSES = 5;
const K = Math.LN2 / HALF;
const SEG = 22;
const TAIL = INTERVAL * 0.95;

// Timeline (ms)
const PRE = 420;      // first drop falls
const DUR = 3400;     // pen travels the whole curve
const DROP = 230;     // drop fall time
const FIN = 1500;     // peaks line + two soft halo breaths
const ENTER = 600;    // card entrance
const TOTAL = PRE + DUR + FIN;

const PLAYED = new Set(); // playKeys already shown in full this session

function buildModel(width, height) {
  const pts = [{ t: 0, v: 0 }];
  let level = DOSE;
  pts.push({ t: 0, v: level });
  for (let i = 1; i < NDOSES; i++) {
    const t0 = (i - 1) * INTERVAL, t1 = i * INTERVAL;
    for (let s = 1; s <= SEG; s++) { const tt = t0 + (INTERVAL * s) / SEG; pts.push({ t: tt, v: level * Math.exp(-K * (tt - t0)) }); }
    level = level * Math.exp(-K * INTERVAL) + DOSE;
    pts.push({ t: t1, v: level });
  }
  const tLast = (NDOSES - 1) * INTERVAL;
  for (let s = 1; s <= SEG; s++) { const tt = tLast + (TAIL * s) / SEG; pts.push({ t: tt, v: level * Math.exp(-K * (tt - tLast)) }); }
  const endT = tLast + TAIL;

  const PL = 6, PR = 6, PT = 14, PB = 10;
  const plotW = Math.max(120, width - PL - PR), plotH = height - PT - PB;
  const maxV = pts.reduce((m, p) => Math.max(m, p.v), 0);
  const yTop = maxV * 1.14;
  const xFor = (t) => PL + (t / endT) * plotW;
  const yFor = (v) => PT + plotH - (v / yTop) * plotH;

  const peaksX = [], peaksY = [], hits = [];
  let lv = DOSE;
  for (let i = 0; i < NDOSES; i++) {
    peaksX.push(xFor(i * INTERVAL)); peaksY.push(yFor(lv));
    lv = lv * Math.exp(-K * INTERVAL) + DOSE;
    hits.push(PRE + DUR * invInOutSine((i * INTERVAL) / endT)); // lands as the pen arrives
  }
  const segLen = [];
  let envLen = 0;
  for (let i = 1; i < NDOSES; i++) { const l = Math.hypot(peaksX[i] - peaksX[i - 1], peaksY[i] - peaksY[i - 1]); segLen.push(l); envLen += l; }

  return {
    W: width, H: height, PL, PT, plotW, baseY: PT + plotH, endT,
    ts: pts.map((p) => p.t), vs: pts.map((p) => p.v),
    xs: pts.map((p) => xFor(p.t)), ys: pts.map((p) => yFor(p.v)),
    peaksX, peaksY, hits, segLen, envLen,
  };
}

// Camera + pen at clock time t.
function frame(G, t) {
  'worklet';
  const el = t - PRE;
  const p = clamp01(el / DUR);
  const T = eInOutSine(p) * G.endT;
  const n = G.ts.length;
  let i = n, x = G.xs[n - 1], y = G.ys[n - 1], v = G.vs[n - 1];
  if (T < G.endT) {
    i = 1; while (i < n && G.ts[i] <= T) i++;
    const f = (T - G.ts[i - 1]) / (G.ts[i] - G.ts[i - 1]);
    x = G.xs[i - 1] + (G.xs[i] - G.xs[i - 1]) * f;
    y = G.ys[i - 1] + (G.ys[i] - G.ys[i - 1]) * f;
    v = G.vs[i - 1] + (G.vs[i] - G.vs[i - 1]) * f;
  }
  const z = eInOutCubic(clamp01((p - 0.22) / 0.5));
  const s = 1.9 + (1 - 1.9) * z;
  return { el, p, i, x, y, v, s, tx: (1 - z) * (G.W * 0.38 - s * x), ty: G.baseY * (1 - s) };
}

function curveD(G, c, area) {
  'worklet';
  if (c.el < 0) return 'M 0 0';
  const X = (vx) => (c.s * vx + c.tx).toFixed(1);
  const Y = (vy) => (c.s * vy + c.ty).toFixed(1);
  let d = 'M ' + X(G.xs[0]) + ' ' + Y(G.ys[0]);
  for (let k = 1; k < c.i; k++) d += ' L ' + X(G.xs[k]) + ' ' + Y(G.ys[k]);
  d += ' L ' + X(c.x) + ' ' + Y(c.y);
  if (area) d += ' L ' + X(c.x) + ' ' + Y(G.baseY) + ' L ' + X(G.xs[0]) + ' ' + Y(G.baseY) + ' Z';
  return d;
}

// Per-dose effects: dose tick (once the dose has landed), falling drop, landing pulse.
function DoseFx({ t, G, i, colors }) {
  const litTick = useAnimatedProps(() => {
    const c = frame(G, t.value); const x = c.s * G.peaksX[i] + c.tx;
    return { x1: x, x2: x, y1: c.s * G.baseY + c.ty, y2: c.s * (G.PT + 4) + c.ty, opacity: t.value >= G.hits[i] ? 0.5 : 0 };
  }, [G, i]);
  const drop = useAnimatedProps(() => {
    const k = (t.value - (G.hits[i] - DROP)) / DROP;
    if (k < 0 || k >= 1) return { opacity: 0, d: 'M 0 0' };
    const c = frame(G, t.value);
    const tx = c.s * G.peaksX[i] + c.tx, ty = c.s * (G.peaksY[i] - 6) + c.ty;
    return { opacity: 1, d: dropPath(tx, -8 + (ty + 8) * k * k, 1) };
  }, [G, i]);
  const pulse = useAnimatedProps(() => {
    const k = (t.value - G.hits[i]) / 700;
    if (k < 0 || k >= 1) return { opacity: 0, r: 4 };
    const c = frame(G, t.value);
    return { opacity: 0.55 * (1 - k), r: (4 + 12 * eOutQuad(k)) * c.s, cx: c.s * G.peaksX[i] + c.tx, cy: c.s * G.peaksY[i] + c.ty };
  }, [G, i]);
  return (
    <>
      <ALine animatedProps={litTick} stroke={colors.tick} strokeWidth={1} strokeDasharray="2,3" />
      <APath animatedProps={drop} fill={colors.data} />
      <ACircle animatedProps={pulse} fill="none" stroke={colors.data} strokeWidth={1.6} />
    </>
  );
}

// "+5.0" rising from each landing peak (RN text over the SVG, same coordinates).
function DoseLabel({ t, G, i, style, dec = '.' }) {
  const st = useAnimatedStyle(() => {
    const k = (t.value - G.hits[i]) / 900;
    if (k < 0 || k >= 1) return { opacity: 0 };
    const c = frame(G, t.value);
    return {
      opacity: 1 - k,
      transform: [
        { translateX: c.s * G.peaksX[i] + c.tx + 6 },
        { translateY: c.s * G.peaksY[i] + c.ty - 18 - 12 * eOutQuad(k) },
      ],
    };
  }, [G, i]);
  return <Animated.Text style={[style, st]}>+{DOSE.toFixed(1).replace('.', dec)}</Animated.Text>;
}

export default function AccumulationHero({ width = 300, height = 140, playKey }) {
  const { colors } = useTheme();
  const { t: tr, language } = useLanguage();
  const dec = numberSymbols(language).decimal; // the app language's decimal ("3,5" in pt), UI thread
  const s = useMemo(() => makeStyles(colors), [colors]);
  const reduce = useReducedMotion();
  const G = useMemo(() => buildModel(width, height), [width, height]);

  const t = useSharedValue(0); // the timeline clock (ms)
  useEffect(() => {
    const skip = reduce || (playKey && PLAYED.has(playKey));
    if (playKey) PLAYED.add(playKey);
    if (skip) { t.value = TOTAL; return; }
    t.value = 0;
    t.value = withTiming(TOTAL, { duration: TOTAL, easing: Easing.linear });
  }, [reduce, playKey]);

  const cardStyle = useAnimatedStyle(() => {
    const k = clamp01(t.value / ENTER);
    return { opacity: clamp01(k * 1.6), transform: [{ translateY: 8 * (1 - k) }] };
  });
  const lineProps = useAnimatedProps(() => ({ d: curveD(G, frame(G, t.value), false) }), [G]);
  const areaProps = useAnimatedProps(() => ({ d: curveD(G, frame(G, t.value), true) }), [G]);
  const baseProps = useAnimatedProps(() => {
    const c = frame(G, t.value);
    return { x1: c.s * G.PL + c.tx, x2: c.s * (G.PL + G.plotW) + c.tx, y1: c.s * G.baseY + c.ty, y2: c.s * G.baseY + c.ty };
  }, [G]);
  const dotProps = useAnimatedProps(() => {
    const c = frame(G, t.value);
    return { cx: c.s * c.x + c.tx, cy: c.s * c.y + c.ty, opacity: c.el > 0 ? 1 : 0 };
  }, [G]);
  // Two soft breaths of the pen dot once the curve is drawn (prototype: fin phase only).
  const haloProps = useAnimatedProps(() => {
    const c = frame(G, t.value);
    const pos = { cx: c.s * c.x + c.tx, cy: c.s * c.y + c.ty };
    const fin = (t.value - (PRE + DUR)) / FIN;
    if (fin < 0 || fin >= 1) return { ...pos, r: 4, opacity: 0 };
    const ph = (fin * 2) % 1;
    return { ...pos, r: 4 + 9 * eOutQuad(ph), opacity: 0.3 * (1 - ph) };
  }, [G]);
  const envProps = useAnimatedProps(() => {
    const fin = clamp01((t.value - (PRE + DUR)) / FIN);
    if (fin <= 0) return { opacity: 0, d: 'M 0 0' };
    let remain = G.envLen * eOutQuad(clamp01(fin / 0.6));
    let d = 'M ' + G.peaksX[0].toFixed(1) + ' ' + G.peaksY[0].toFixed(1);
    for (let k = 1; k < G.peaksX.length && remain > 0; k++) {
      const l = G.segLen[k - 1], f = Math.min(1, remain / l);
      d += ' L ' + (G.peaksX[k - 1] + (G.peaksX[k] - G.peaksX[k - 1]) * f).toFixed(1)
        + ' ' + (G.peaksY[k - 1] + (G.peaksY[k] - G.peaksY[k - 1]) * f).toFixed(1);
      remain -= l;
    }
    return { opacity: clamp01(fin * 4), d };
  }, [G]);

  const value = useDerivedValue(() => { const c = frame(G, t.value); return c.el < 0 ? 0 : c.v; }, [G]);
  const numBump = useAnimatedStyle(() => ({ transform: [{ scale: bumpScale(t.value, G.hits, 500, 0.16) }] }), [G]);
  const fmt = (v) => { 'worklet'; return v.toFixed(1).replace('.', dec); };

  return (
    <Animated.View style={[s.card, cardStyle]}>
      <View style={s.labelRow}>
        <Text style={s.label}>{tr('curve_current_level')}</Text>
        <View style={s.exampleTag}><Text style={s.exampleTagText}>{tr('ob_hero_tag')}</Text></View>
      </View>
      <View style={s.readout}>
        <Animated.View style={[s.numWrap, numBump]}>
          <AnimatedNumber key={language} value={value} format={fmt} style={s.num} width={56} align="left" />
        </Animated.View>
        <Text style={s.unit}>mg</Text>
      </View>

      <View style={{ width, height, overflow: 'hidden' }}>
        <Svg width={width} height={height}>
          {G.peaksX.map((_, i) => <DoseFx key={`fx-${i}`} t={t} G={G} i={i} colors={colors} />)}
          <ALine animatedProps={baseProps} stroke={colors.line} strokeWidth={1} />
          <APath animatedProps={areaProps} fill={colors.data} fillOpacity={0.12} />
          <APath animatedProps={envProps} fill="none" stroke={colors.ink2} strokeWidth={1.4} strokeDasharray="4,4" />
          <APath animatedProps={lineProps} fill="none" stroke={colors.data} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          <ACircle animatedProps={haloProps} fill={colors.data} />
          <ACircle animatedProps={dotProps} r={4.5} fill={colors.data} />
        </Svg>
        {G.peaksX.map((_, i) => <DoseLabel key={`lb-${i}-${language}`} t={t} G={G} i={i} style={s.floatLabel} dec={dec} />)}
      </View>
    </Animated.View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.raised, borderRadius: 24, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 8,
      overflow: 'hidden', gap: 4,
    },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
    label: { fontSize: 12, fontWeight: '500', color: colors.ink2 },
    exampleTag: { minHeight: 24, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 9, justifyContent: 'center' },
    exampleTagText: { fontSize: 12, fontWeight: '600', color: colors.ink2 },
    readout: { flexDirection: 'row', alignItems: 'baseline', gap: 4, paddingHorizontal: 2 },
    numWrap: { transformOrigin: 'left bottom' },
    num: { fontSize: 34, fontWeight: '300', color: colors.data, letterSpacing: -1, fontVariant: ['tabular-nums'] },
    unit: { fontSize: 13, fontFamily: MONO['400'], color: colors.ink3 },
    floatLabel: { position: 'absolute', left: 0, top: 0, fontSize: 11, fontFamily: MONO['500'], color: colors.data },
  });
}
