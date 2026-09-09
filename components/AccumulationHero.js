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

// Illustrative model (unitless, tuned to look like a real protocol curve).
const HALF = 4, INTERVAL = 3, DOSE = 5, NDOSES = 6;
const K = Math.LN2 / HALF;
const END_T = INTERVAL * (NDOSES - 1) + INTERVAL * 0.35; // stop just past the last dose's peak
const SAMPLES = 130;

function levelAt(t) {
  let sum = 0;
  for (let i = 0; i < NDOSES; i++) {
    const dt = t - i * INTERVAL;
    if (dt >= 0) sum += DOSE * Math.exp(-K * dt);
  }
  return sum;
}

export default function AccumulationHero({ width = 300, height = 140 }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const PAD_L = 6, PAD_R = 6, PAD_T = 14, PAD_B = 10;
  const plotW = Math.max(120, width - PAD_L - PAD_R);
  const plotH = height - PAD_T - PAD_B;

  // Build the curve geometry once per size.
  const { d, length, peak, endValue, dosesX, baselineY, endPt } = useMemo(() => {
    const pts = [];
    let maxV = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const tt = (END_T * i) / SAMPLES;
      const v = levelAt(tt);
      if (v > maxV) maxV = v;
      pts.push({ t: tt, v });
    }
    const yTop = maxV * 1.12; // headroom so the peak isn't glued to the top edge
    const xFor = (tt) => PAD_L + (tt / END_T) * plotW;
    const yFor = (v) => PAD_T + plotH - (v / yTop) * plotH;
    const xy = pts.map((p) => ({ x: xFor(p.t), y: yFor(p.v) }));

    let path = `M ${xy[0].x.toFixed(2)} ${xy[0].y.toFixed(2)}`;
    let len = 0;
    for (let i = 1; i < xy.length; i++) {
      path += ` L ${xy[i].x.toFixed(2)} ${xy[i].y.toFixed(2)}`;
      len += Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y);
    }
    const doseXs = [];
    for (let i = 0; i < NDOSES; i++) {
      const dx = xFor(i * INTERVAL);
      if (dx <= PAD_L + plotW) doseXs.push(dx);
    }
    return {
      d: path,
      length: Math.ceil(len),
      peak: maxV,
      endValue: pts[pts.length - 1].v,
      dosesX: doseXs,
      baselineY: PAD_T + plotH,
      endPt: xy[xy.length - 1],
    };
  }, [plotW, plotH]);

  const draw = useRef(new Animated.Value(1)).current;   // 1 = fully hidden, 0 = fully drawn
  const fade = useRef(new Animated.Value(0)).current;    // fill + endpoint
  const count = useRef(new Animated.Value(0)).current;
  const [num, setNum] = useState('0.0');
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    const id = count.addListener(({ value }) => setNum(value.toFixed(1)));

    AccessibilityInfo.isReduceMotionEnabled().then((rm) => {
      if (!mounted) return;
      if (rm) {
        setReduced(true);
        draw.setValue(0);
        fade.setValue(1);
        count.setValue(endValue);
        setNum(endValue.toFixed(1));
        return;
      }
      draw.setValue(1);
      fade.setValue(0);
      count.setValue(0);
      Animated.parallel([
        Animated.timing(draw, { toValue: 0, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(count, { toValue: endValue, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(fade, { toValue: 1, duration: 700, delay: 900, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      ]).start();
    }).catch(() => {
      // If the check fails, just show the finished state — never leave it blank.
      if (!mounted) return;
      draw.setValue(0); fade.setValue(1); count.setValue(endValue); setNum(endValue.toFixed(1));
    });

    return () => { mounted = false; count.removeListener(id); };
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
