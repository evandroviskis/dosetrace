import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, AccessibilityInfo } from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The onboarding anchor moment: the dose-accumulation curve drawing itself in
 * while the "Est. in body" figure counts up from zero — the flagship feature
 * shown, not described. The curve is a real accumulation model (repeated doses
 * + exponential half-life decay → the characteristic sawtooth rising to a
 * steady state), not decorative noise. One strong moment, and it honors the OS
 * "reduce motion" setting by rendering the final state instantly.
 */

// Illustrative model (unitless, tuned to look like a real protocol curve): each
// dose is a sharp vertical spike UP, then the level decays DOWN toward the next
// dose — the classic serum sawtooth — with a wash-out tail so the line clearly
// comes down at the end. Half-life is short relative to the interval so the
// "down" between doses is plainly visible, while the peaks still creep up
// (accumulation). Returns {points, endT}: points are {t, v}, with two points
// sharing a t at each dose to draw the vertical edge.
const HALF = 2.2, INTERVAL = 3, DOSE = 5, NDOSES = 5;
const K = Math.LN2 / HALF;
const SEG = 22;                        // decay samples between doses
const TAIL = INTERVAL * 0.95;          // wash-out after the last dose

function buildSawtooth() {
  const pts = [];
  pts.push({ t: 0, v: 0 });            // baseline start
  let level = DOSE;
  pts.push({ t: 0, v: level });        // dose 1 — vertical spike up
  for (let i = 1; i < NDOSES; i++) {
    const t0 = (i - 1) * INTERVAL, t1 = i * INTERVAL;
    for (let sIdx = 1; sIdx <= SEG; sIdx++) {
      const tt = t0 + (INTERVAL * sIdx) / SEG;
      pts.push({ t: tt, v: level * Math.exp(-K * (tt - t0)) });   // decay down
    }
    level = level * Math.exp(-K * INTERVAL) + DOSE;               // next dose
    pts.push({ t: t1, v: level });     // vertical spike up
  }
  const tLast = (NDOSES - 1) * INTERVAL;
  for (let sIdx = 1; sIdx <= SEG; sIdx++) {
    const tt = tLast + (TAIL * sIdx) / SEG;
    pts.push({ t: tt, v: level * Math.exp(-K * (tt - tLast)) });  // wash-out tail
  }
  return { points: pts, endT: tLast + TAIL };
}

export default function AccumulationHero({ width = 300, height = 140 }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const PAD_L = 6, PAD_R = 6, PAD_T = 14, PAD_B = 10;
  const plotW = Math.max(120, width - PAD_L - PAD_R);
  const plotH = height - PAD_T - PAD_B;

  // Build the curve geometry once per size.
  const { d, length, endValue, dosesX, baselineY, endPt, cumLen, vals } = useMemo(() => {
    const { points: pts, endT } = buildSawtooth();
    let maxV = 0;
    for (const p of pts) if (p.v > maxV) maxV = p.v;
    const yTop = maxV * 1.14; // headroom so the peak isn't glued to the top edge
    const xFor = (tt) => PAD_L + (tt / endT) * plotW;
    const yFor = (v) => PAD_T + plotH - (v / yTop) * plotH;
    const xy = pts.map((p) => ({ x: xFor(p.t), y: yFor(p.v) }));

    let path = `M ${xy[0].x.toFixed(2)} ${xy[0].y.toFixed(2)}`;
    const cum = [0];
    let len = 0;
    for (let i = 1; i < xy.length; i++) {
      path += ` L ${xy[i].x.toFixed(2)} ${xy[i].y.toFixed(2)}`;
      len += Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y);
      cum.push(len);
    }
    const doseXs = [];
    for (let i = 0; i < NDOSES; i++) {
      const dx = xFor(i * INTERVAL);
      if (dx <= PAD_L + plotW) doseXs.push(dx);
    }
    return {
      d: path,
      length: Math.ceil(len),
      endValue: pts[pts.length - 1].v,
      dosesX: doseXs,
      baselineY: PAD_T + plotH,
      endPt: xy[xy.length - 1],
      cumLen: cum,
      vals: pts.map((p) => p.v),
    };
  }, [plotW, plotH]);

  // The "Est. in body" figure tracks the pen: as the drawn length grows it rises
  // and falls with each peak, so the number moves with the sawtooth.
  const valueAtLength = (revealed) => {
    if (revealed <= 0) return vals[0];
    if (revealed >= cumLen[cumLen.length - 1]) return vals[vals.length - 1];
    let i = 1;
    while (i < cumLen.length && cumLen[i] < revealed) i++;
    return vals[i];
  };

  const draw = useRef(new Animated.Value(1)).current;   // 1 = fully hidden, 0 = fully drawn
  const fade = useRef(new Animated.Value(0)).current;    // fill + endpoint
  const [num, setNum] = useState('0.0');

  useEffect(() => {
    let mounted = true;
    // Move the readout with the pen: revealed length = length * (1 - draw).
    const id = draw.addListener(({ value }) => {
      if (!mounted) return;
      setNum(valueAtLength(length * (1 - value)).toFixed(1));
    });

    AccessibilityInfo.isReduceMotionEnabled().then((rm) => {
      if (!mounted) return;
      if (rm) {
        draw.setValue(0);   // fully drawn (listener sets num to endValue)
        fade.setValue(1);
        return;
      }
      draw.setValue(1);
      fade.setValue(0);
      setNum(vals[0].toFixed(1));
      Animated.parallel([
        Animated.timing(draw, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(fade, { toValue: 1, duration: 700, delay: 1500, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      ]).start();
    }).catch(() => {
      // If the check fails, just show the finished state — never leave it blank.
      if (!mounted) return;
      draw.setValue(0); fade.setValue(1);
    });

    return () => { mounted = false; draw.removeListener(id); };
  }, [endValue, length]);

  const dashOffset = draw.interpolate({ inputRange: [0, 1], outputRange: [0, length] });

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Text style={s.label}>{t('curve_current_level')}</Text>
        <View style={s.readout}>
          <Text style={s.num}>{num}</Text>
          <Text style={s.unit}> mg</Text>
        </View>
      </View>

      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="accHero" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={0.22} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {/* faint dose tick markers along the baseline */}
        {dosesX.map((dx, i) => (
          <Line key={i} x1={dx} y1={baselineY} x2={dx} y2={PAD_T + 4} stroke={colors.border} strokeWidth={1} strokeDasharray="2,4" />
        ))}
        <Line x1={PAD_L} y1={baselineY} x2={PAD_L + plotW} y2={baselineY} stroke={colors.border} strokeWidth={1} />

        {/* soft area fill under the curve — fades in once the line is mostly drawn */}
        <AnimatedPath
          d={`${d} L ${endPt.x.toFixed(2)} ${baselineY} L ${PAD_L.toFixed(2)} ${baselineY} Z`}
          fill="url(#accHero)"
          opacity={fade}
        />

        {/* the self-drawing accumulation line */}
        <AnimatedPath
          d={d}
          fill="none"
          stroke={colors.accent}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={length}
          strokeDashoffset={dashOffset}
        />

        {/* endpoint dot */}
        <AnimatedCircle cx={endPt.x} cy={endPt.y} r={4} fill={colors.accent} stroke={colors.card} strokeWidth={2} opacity={fade} />
      </Svg>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function makeStyles(colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card2, borderRadius: 16, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6,
      borderWidth: 0.5, borderColor: colors.border, overflow: 'hidden',
    },
    header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 },
    label: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.2, textTransform: 'uppercase' },
    readout: { flexDirection: 'row', alignItems: 'baseline' },
    num: { fontSize: 26, fontWeight: '900', color: colors.accent, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
    unit: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  });
}
