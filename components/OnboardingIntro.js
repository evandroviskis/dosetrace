// The onboarding intro video (docs/specs/onboarding-protocol.md OB-2..OB-7, OB-27, OB-29, OB-30; approved
// pictures docs/design/onboarding-intro.html, founder 2026-11-20, and
// docs/design/onboarding-intro-controles.html, founder 2026-11-24): opening, syringe, dose in the
// body, reminders, [dose observation — lib/obIntro OBSERVATION_SCENE], labs, then the end frame.
//
// Controls (2026-11-24): the opening plays and goes on to the syringe by itself; from the syringe on
// each scene plays its animation once and stops on its complete (hold) frame. "Avançar" plays the
// next scene (pressed mid-scene: straight to the next one); "Voltar" shows the previous scene
// complete (a short fade, never a replay; hidden on the opening); "Pular" (top right) goes to the end
// frame and is hidden there; on the end frame the pill says "Começar", the only way on (onDone).
// The Android back is Voltar (the flow asks backRef); on the opening it is the flow's own back.
// Back into the video from the next step (atEnd) opens it on the end frame, never from the start.
//
// Motion: ONE clock (a shared value in ms, linear, UI thread) played from hold to hold; every
// element is a worklet of it, using transform / opacity, stroke-dashoffset for the line draws and
// the sanctioned size of absolute, childless shapes (story bars, syringe fill, the observation
// sheet). No React render per frame: the scene index, the row latch and the typed letters of the
// observation note cross to the RN runtime only when they change. The timeline and the controls are
// lib/obIntro; the example numbers are lib/obFeatures (the app's own dose math and half-life
// formula) — never typed here, never her data.
//
// Reduce Motion, or a screen reader on: no playback. The same buttons; each scene is shown complete
// and read out (one accessible element per scene).
//
// Drawn like the picture on its own 390 x 786 canvas (the phone minus the status-bar strip),
// scaled to fit, so the choreography ports 1:1; texts inside are part of the video (no font
// scaling). Theme tokens only.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, AccessibilityInfo } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedProps, useAnimatedReaction,
  withTiming, cancelAnimation, Easing, useReducedMotion, FadeIn, FadeOut, interpolateColor,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Rect, Line, Path, Circle, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';
import { formatTime } from '../lib/timeFormat';
import { MONTHS_SHORT, formatDate } from '../lib/localeFormat';
import { MONO } from '../lib/fonts';
import { syringeParts, SYR_VIEW } from '../lib/syringeGeometry';
import SyringeScale from '../screens/components/SyringeScale';
import FeatureIcon from './FeatureIcon';
import { eInOutCubic } from './motion';
import { demoDec } from './previewFx';
import {
  SCENES, END, BEATS, IN_DUR, OUT_DUR, HOLDS, STORY_BARS, BAR_W, barLeft,
  sceneIndexAt, barFill, typedCount, noteLines, clamp01,
  introStart, introNext, introBack, introSkip, introReduce, navShown, controls,
} from '../lib/obIntro';
import {
  SYRINGE_EXAMPLE, syringeUnits, syringeMl, BODY_EXAMPLE, bodyColumns, bodySeries, bodyLimit, LAB_EXAMPLE, LAB_MONTHS, REMINDER_EXAMPLE, OBS_EXAMPLE,
} from '../lib/obFeatures';
import { onboardingFunnel } from '../lib/onboardingFunnelStore';

const ARect = Animated.createAnimatedComponent(Rect);
const APath = Animated.createAnimatedComponent(Path);

// The picture's curve (cubic-bezier(.2,.8,.2,1)): a strong ease-out for every entrance.
const EASE = Easing.bezierFn(0.2, 0.8, 0.2, 1);
const CW = 390, CH = 786, Y0 = 44; // the canvas: the picture's 390 x 844 phone minus its top 44 pt
const y = (v) => v - Y0;
const CUT_MS = 180; // the short fade of a jump (Voltar, Pular, Avançar mid-scene)
const NB = ' ';

// the real report (lib/adherenceReportDoc doseLine) writes the frequency lower-case after the dose
const lcFirst = (v) => (v ? v.charAt(0).toLocaleLowerCase() + v.slice(1) : v);
const fill = (str, vars) => Object.keys(vars).reduce((o, k) => o.split(`{${k}}`).join(String(vars[k])), String(str || ''));
const Tx = (p) => <Text allowFontScaling={false} {...p} />;

// ── building blocks ──
// An element entering at `at` (fade + a short rise), absolutely placed on the canvas.
function Enter({ clock, at, dur = IN_DUR, dy = 10, style, children }) {
  const st = useAnimatedStyle(() => {
    const v = clock.get();
    const p = EASE(clamp01((v - at) / dur));
    return { opacity: v < at ? 0 : p, transform: [{ translateY: dy * (1 - p) }] };
  });
  return <Animated.View pointerEvents="none" style={[style, st]}>{children}</Animated.View>;
}

// A scene: comes in with a fade and a rise, leaves with a fade and a lift (the end frame stays).
function Scene({ clock, k, children }) {
  const b = BEATS[k];
  const inAt = b.in, outAt = b.out == null ? -1 : b.out;
  const st = useAnimatedStyle(() => {
    const v = clock.get();
    const pin = EASE(clamp01((v - inAt) / IN_DUR));
    const pout = outAt < 0 ? 0 : EASE(clamp01((v - outAt) / OUT_DUR));
    return { opacity: v < inAt ? 0 : pin * (1 - pout), transform: [{ translateY: 10 * (1 - pin) - 6 * pout }] };
  });
  return (
    <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[StyleSheet.absoluteFill, st]}>
      {children}
    </Animated.View>
  );
}

// A line that draws itself (stroke-dashoffset from its length to 0).
// The static offset is the one for the clock at render: a scene shown complete (Voltar, Reduce Motion)
// mounts on its hold frame with the clock still, and on Android the SVG applies animated props only after
// the value changes (S25 2026-11-25: the lab lines were missing after Voltar).
function DrawLine({ clock, at, dur, d, length, color, width }) {
  const dash = (v) => { 'worklet'; return length * (1 - eInOutCubic(clamp01((v - at) / dur))); };
  const props = useAnimatedProps(() => ({ strokeDashoffset: dash(clock.get()) }));
  return <APath animatedProps={props} d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={[length, length]} strokeDashoffset={dash(clock.get())} />;
}
function polyline(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '), length: Math.ceil(len) + 4 }; // + 4: no round cap shows before the draw
}

// The app's graduated scale (the opening and the end frame): a tick every 10, long every 40, the
// blue tick in the middle.
function GradScale({ c, top }) {
  const ticks = [];
  for (let x = 40; x <= 350; x += 10) ticks.push({ x, long: (x - 40) % 40 === 0 });
  return (
    <Svg width={CW} height={30} style={{ position: 'absolute', left: 0, top }}>
      {ticks.map((k) => <Line key={k.x} x1={k.x} y1={k.long ? 8 : 13} x2={k.x} y2={24} stroke={c.tick} strokeWidth={k.long ? 2 : 1.4} />)}
      <Line x1={40} y1={24} x2={350} y2={24} stroke={c.line} strokeWidth={1.5} />
    </Svg>
  );
}

function Grow({ clock, at, dur, axis, origin, style, children }) {
  const st = useAnimatedStyle(() => {
    const p = EASE(clamp01((clock.get() - at) / dur));
    return { transform: [axis === 'x' ? { scaleX: p } : { scaleY: p }] };
  });
  return <Animated.View pointerEvents="none" style={[style, { transformOrigin: origin }, st]}>{children}</Animated.View>;
}

function Title({ s, text }) {
  return <Tx style={s.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>{text}</Tx>;
}

// ── 0. Opening (OB-2): a blue tick grows and opens into the graduated scale ──
function OpenScene({ clock, c, s, t }) {
  const B = BEATS.open;
  return (
    <Scene clock={clock} k="open">
      <Grow clock={clock} at={B.scale[0]} dur={B.scale[1]} axis="x" origin="50% 50%" style={s.full}>
        <GradScale c={c} top={y(408)} />
      </Grow>
      <Grow clock={clock} at={B.tick[0]} dur={B.tick[1]} axis="y" origin="50% 100%" style={[s.blueTick, { top: y(408) }]} />
      <Enter clock={clock} at={B.title} style={[s.centerLine, { top: y(326) }]}>
        <Tx style={s.openTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('obi_open')}</Tx>
      </Enter>
    </Scene>
  );
}

// ── 1. Syringe (OB-3): the fields fill in one by one, then the syringe fills to 28 units ──
// The app's own syringe drawing (lib/syringeGeometry, as components SyringeScale): fill, stopper and
// rod move with the clock; when the fill lands the real SyringeScale takes over (same drawing,
// the ticks inside the dose in onData), so the final frame IS the app's syringe.
function IntroSyringe({ clock, c, width, units, size }) {
  const [at, dur] = BEATS.syringe.fill;
  const g0 = useMemo(() => syringeParts(size, 0), [size]);
  const g1 = useMemo(() => syringeParts(size, units), [size, units]);
  const h = (width * SYR_VIEW.h) / SYR_VIEW.w;
  const fw = g1.fill.w, s0 = g0.stopper.x, s1 = g1.stopper.x, r0x = g0.rod.x, r1x = g1.rod.x, r0w = g0.rod.w, r1w = g1.rod.w;
  const fillP = useAnimatedProps(() => ({ width: fw * eInOutCubic(clamp01((clock.get() - at) / dur)) }));
  const stopP = useAnimatedProps(() => ({ x: s0 + (s1 - s0) * eInOutCubic(clamp01((clock.get() - at) / dur)) }));
  const rodP = useAnimatedProps(() => {
    const p = eInOutCubic(clamp01((clock.get() - at) / dur));
    return { x: r0x + (r1x - r0x) * p, width: r0w + (r1w - r0w) * p };
  });
  const real = useAnimatedStyle(() => ({ opacity: clamp01((clock.get() - (at + dur)) / 150) }));
  return (
    <View style={{ width, height: h }}>
      <Svg width={width} height={h} viewBox={`0 0 ${SYR_VIEW.w} ${SYR_VIEW.h}`}>
        <Line x1={g0.needle.x1} y1={g0.needle.y1} x2={g0.needle.x2} y2={g0.needle.y2} stroke={c.ink3} strokeWidth={g0.needle.width} strokeLinecap="round" />
        <Path d={g0.hub} fill={c.ink3} />
        <Rect x={g0.barrel.x} y={g0.barrel.y} width={g0.barrel.w} height={g0.barrel.h} rx={g0.barrel.rx} fill={c.raised} stroke={c.tick} strokeWidth={g0.barrel.stroke} />
        <ARect animatedProps={fillP} x={g1.fill.x} y={g1.fill.y} width={0} height={g1.fill.h} rx={g1.fill.rx} fill={c.data} />
        {g0.ticks.map((k) => <Line key={'t' + k.u} x1={k.x} y1={k.y1} x2={k.x} y2={k.y2} stroke={c.tick} strokeWidth={k.width} />)}
        {g0.labels.map((l) => <SvgText key={'n' + l.text} x={l.x} y={l.y} textAnchor="middle" fill={c.ink3} fontFamily={MONO['400']} fontSize={9}>{l.text}</SvgText>)}
        <ARect animatedProps={stopP} x={s0} y={g0.stopper.y} width={g0.stopper.w} height={g0.stopper.h} rx={g0.stopper.rx} fill={c.ink} />
        <ARect animatedProps={rodP} x={r0x} y={g0.rod.y} width={r0w} height={g0.rod.h} rx={g0.rod.rx} fill={c.ink2} />
        <Rect x={g0.thumb.x} y={g0.thumb.y} width={g0.thumb.w} height={g0.thumb.h} rx={g0.thumb.rx} fill={c.ink} />
      </Svg>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, real]}>
        <SyringeScale units={units} size={size} width={width} />
      </Animated.View>
    </View>
  );
}

function SyringeScene({ clock, c, s, t, language }) {
  const B = BEATS.syringe;
  const ex = SYRINGE_EXAMPLE;
  const units = syringeUnits(); // 10 mg in 2 mL, a 1,4 mg dose → 28 (lib/doseMath computeDraw)
  const ml = syringeMl(); // 0,3 mL
  const rows = [
    [t('obi_syr_l_compound'), t('obi_ex_compound1')],
    [t('obi_syr_l_vial'), `${demoDec(ex.amount, language)}${NB}${ex.unit}`],
    [t('obi_syr_l_diluent'), `${demoDec(ex.water, language)}${NB}mL`],
    [t('obi_syr_l_dose'), `${demoDec(ex.dose, language)}${NB}${ex.doseUnit}`],
  ];
  return (
    <Scene clock={clock} k="syringe">
      <Title s={s} text={t('obi_syr_title')} />
      <Enter clock={clock} at={B.card} style={[s.card, { top: y(230), height: 400 }]}>
        <View style={s.tag}><Tx style={s.tagText}>{t('obi_example')}</Tx></View>
        {rows.map((r, i) => (
          <Enter key={i} clock={clock} at={B.rows[i]} style={[s.exRow, { top: 50 + 40 * i }]}>
            <Tx style={s.exLabel} numberOfLines={1}>{r[0]}</Tx>
            <Tx style={s.exValue} numberOfLines={1}>{r[1]}</Tx>
          </Enter>
        ))}
        <Enter clock={clock} at={B.calc} style={[s.cardLine, { top: 232 }]}>
          <Tx style={s.calc} numberOfLines={1} adjustsFontSizeToFit>{t('obi_syr_calc')}</Tx>
        </Enter>
        <View style={{ position: 'absolute', left: 16, top: 262 }}>
          <IntroSyringe clock={clock} c={c} width={310} units={units} size={ex.syringeSize} />
        </View>
        <Enter clock={clock} at={B.result} style={[s.cardLine, { top: 330 }]}>
          <Tx style={s.draw} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{fill(t('obi_syr_draw'), { n: units })}</Tx>
          <Tx style={s.drawMl}>{`${demoDec(String(ml), language)}${NB}mL`}</Tx>
        </Enter>
      </Enter>
    </Scene>
  );
}

// ── 2. Dose in the body (OB-4, OB-32): doses add up, each coloured by its age, a line across the tops;
// then (founder 2026-11-24) the columns narrow, Dia 21 to 49 come in and the estimate nears the
// dashed guide (dose / (1 - 0.5^(7/7)) = 200 mg). Every number from lib/obFeatures, never typed. ──
const MG_PX = 1.28; // part 1: 100 mg = 128 pt, as in the picture
const MG2 = 1.05; // part 2: the 8 weeks fit under the guide
const COL_X = [70, 175, 280];
const COL_W = 60;
const W2 = 26;
function colX2(i) { 'worklet'; return 42 + 40 * i; }
const BASE = y(548); // the 2026-11-24 picture: 50 pt higher than 2026-11-20, the axis title above
// The column sum sits this far above the column top, clear of the line across the tops (it ran
// through the "mg" of "100 mg").
const SUM_LIFT = 46;
// Where column i is when the narrowing is at P (0 = part 1, 1 = part 2); the columns of part 2 are
// born narrow.
function colGeo(i, P) {
  'worklet';
  const p = i < 3 ? P : 1;
  return { x: i < 3 ? COL_X[i] + (colX2(i) - COL_X[i]) * P : colX2(i), w: COL_W + (W2 - COL_W) * p, mg: MG_PX + (MG2 - MG_PX) * p, p };
}
// One dose's leftover in a column: a childless rectangle that moves with the narrowing; the dose of
// 7 days ago turns into the leftover tone (interpolateColor, both themes).
function BodySeg({ clock, i, k, segs, sq, c }) {
  const n = segs.length;
  const mgv = segs[k].mg;
  const below = segs.slice(0, k).reduce((a, x) => a + x.mg, 0);
  const nextNew = k < n - 1 && segs[k + 1].age === 0;
  const last = k === n - 1;
  const today = segs[k].age === 0;
  const age7 = segs[k].age === BODY_EXAMPLE.interval;
  const [s0, sd] = sq;
  const st = useAnimatedStyle(() => {
    const P = EASE(clamp01((clock.get() - s0) / sd));
    const g = colGeo(i, P);
    const p = g.p;
    const gap = last ? 0 : nextNew ? 2 : 2 * (1 - p);
    const top = BASE - (below + mgv) * g.mg + gap;
    return {
      left: g.x, width: g.w, top, height: Math.max(0, mgv * g.mg - gap),
      borderRadius: today || k === 0 ? 4 - 2 * p : 4 * (1 - p),
      backgroundColor: today ? c.data : age7 ? interpolateColor(p, [0, 1], [c.data2, c.data3]) : c.data3,
    };
  });
  return <Animated.View style={[{ position: 'absolute' }, st]} />;
}
// Part 1 words leaving as the columns narrow (the value labels a little faster than the sums).
function FadeWithSqueeze({ clock, sq, rate, style, children }) {
  const [s0, sd] = sq;
  const st = useAnimatedStyle(() => ({ opacity: 1 - clamp01(EASE(clamp01((clock.get() - s0) / sd)) * rate) }));
  return <Animated.View pointerEvents="none" style={[style, st]}>{children}</Animated.View>;
}
// The legend and the footnote of part 1 leave when the narrowing starts.
function LeaveAt({ clock, at, style, children }) {
  const st = useAnimatedStyle(() => ({ opacity: 1 - EASE(clamp01((clock.get() - at) / OUT_DUR)) }));
  return <Animated.View pointerEvents="none" style={[style, st]}>{children}</Animated.View>;
}
// The line across the tops, one segment per pair of columns, its ends moving with the columns: part 1
// draws itself (the first two segments, in one stroke); in part 2 it reaches each new top as that
// column comes in. Animated ends of a Line, never an animated path.
const ALine = Animated.createAnimatedComponent(Line);
function TopLine({ clock, q, totals, part1, B, c }) {
  const [s0, sd] = B.squeeze, [l0, ld] = B.line;
  const colAt = q + 1 >= 3 ? B.more[q + 1 - 3] : 0;
  const { T, L, ACC } = part1;
  const tq = totals[q], tn = totals[q + 1];
  // The ends for a clock value; also the static props at render, so a scene shown complete has its line
  // (S25 2026-11-25: Voltar opened Dose no corpo without it — see DrawLine).
  const ends = (v) => {
    'worklet';
    const P = EASE(clamp01((v - s0) / sd));
    const a = colGeo(q, P), b = colGeo(q + 1, P);
    const ax = a.x + a.w / 2, ay = BASE - tq * a.mg, bx = b.x + b.w / 2, by = BASE - tn * b.mg;
    const lp = eInOutCubic(clamp01((v - l0) / ld));
    let f = 0;
    if (q < 2) f = lp <= 0 ? 0 : clamp01((lp * T - ACC[q]) / L[q]);
    else if (lp >= 1 && v >= colAt) f = EASE(clamp01((v - colAt) / IN_DUR));
    return { x1: ax, y1: ay, x2: ax + (bx - ax) * f, y2: ay + (by - ay) * f, strokeOpacity: f > 0 ? 1 : 0 };
  };
  const props = useAnimatedProps(() => ends(clock.get()));
  const e0 = ends(clock.get());
  return <ALine animatedProps={props} x1={e0.x1} y1={e0.y1} x2={e0.x2} y2={e0.y2} stroke={c.ink} strokeWidth={2} strokeLinecap="round" strokeOpacity={e0.strokeOpacity} />;
}
function BodyScene({ clock, c, s, t }) {
  const B = BEATS.body;
  const ex = BODY_EXAMPLE;
  const cols = useMemo(() => bodySeries(), []);
  const limit = useMemo(() => bodyLimit(), []);
  const totals = useMemo(() => cols.map((g) => g.total), [cols]);
  // part 1 geometry (P = 0): the value labels, the sums, the length of the first stroke
  const part1 = useMemo(() => {
    const tops = [0, 1, 2].map((i) => [COL_X[i] + COL_W / 2, BASE - cols[i].total * MG_PX]);
    const L = [0, 1].map((q) => Math.hypot(tops[q + 1][0] - tops[q][0], tops[q + 1][1] - tops[q][1]));
    return { T: L[0] + L[1], L, ACC: [0, L[0]] };
  }, [cols]);
  const ink = (age) => (age === 0 ? c.onData : c.ink);
  const name = t('obi_ex_compound1');
  const dose = `${ex.dose}${NB}${ex.unit}`;
  const total = `${Math.round(limit)}${NB}${ex.unit}`;
  const gy = BASE - limit * MG2;
  const legend = (rows) => rows.map(([col, label]) => (
    <View key={label} style={s.legendRow}>
      <View style={[s.legendKey, { backgroundColor: col }]} />
      <Tx style={s.legendText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Tx>
    </View>
  ));
  const labels2 = (g, i) => (
    <View style={[s.lab2, { left: colX2(i) + W2 / 2 - 20 }]}>
      <Tx style={s.lab2Day} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{fill(t('obi_body_day'), { n: g.day })}</Tx>
      <Tx style={s.lab2Total} numberOfLines={1}>{String(Math.round(g.total))}</Tx>
    </View>
  );
  return (
    <Scene clock={clock} k="body">
      <Title s={s} text={t('obi_body_title')} />
      <Enter clock={clock} at={B.sub} style={[s.textBlock, { top: y(214) }]}>
        <Tx style={s.sub} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>{t('obi_body_sub')}</Tx>
      </Enter>
      <Enter clock={clock} at={B.axis} dy={0} style={[s.textBlock, { top: y(270) }]}>
        <Tx style={s.axisTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('obi_body_axis')}</Tx>
      </Enter>
      <View style={[s.baseLine, { top: BASE + 1 }]} />
      <Enter clock={clock} at={B.guide[0]} dur={B.guide[1]} dy={0} style={s.full}>
        <Svg width={CW} height={6} style={{ position: 'absolute', left: 0, top: gy - 3 }}>
          <Line x1={40} y1={3} x2={350} y2={3} stroke={c.tick} strokeWidth={1.2} strokeDasharray={[4, 4]} />
        </Svg>
        <Tx style={[s.guideLabel, { top: gy - 18 }]} numberOfLines={1}>{total}</Tx>
      </Enter>
      {cols.map((g, i) => (
        <Enter key={g.day} clock={clock} at={i < 3 ? B.cols[i] : B.more[i - 3]} style={s.full}>
          {g.segments.map((sg, k) => <BodySeg key={sg.age} clock={clock} i={i} k={k} segs={g.segments} sq={B.squeeze} c={c} />)}
          {i < 3 ? (
            <>
              <FadeWithSqueeze clock={clock} sq={B.squeeze} rate={2.5} style={s.full}>
                {(() => {
                  let bottom = BASE;
                  return g.segments.map((sg, k) => {
                    const h = sg.mg * MG_PX;
                    const gap = k < g.segments.length - 1 ? 2 : 0;
                    const top = bottom - h + gap;
                    bottom -= h;
                    return <Tx key={sg.age} style={[s.segVal, { left: COL_X[i], top: top + (h - gap) / 2 - 8, color: ink(sg.age) }]}>{String(Math.round(sg.mg))}</Tx>;
                  });
                })()}
              </FadeWithSqueeze>
              <FadeWithSqueeze clock={clock} sq={B.squeeze} rate={2} style={s.full}>
                <Tx style={[s.colSum, { left: COL_X[i] - 30, top: BASE - g.total * MG_PX - SUM_LIFT }]} numberOfLines={1}>{`${Math.round(g.total)}${NB}${ex.unit}`}</Tx>
                <Tx style={[s.colDay, { left: COL_X[i] - 30, top: y(552) }]} numberOfLines={1}>{fill(t('obi_body_day'), { n: g.day })}</Tx>
                <Tx style={[s.colSumLine, { left: COL_X[i] - 30, top: y(574) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {i === 0 ? fill(t('obi_body_you_take'), { n: Math.round(g.total) }) : g.segments.map((sg) => String(Math.round(sg.mg))).join(' + ')}
                </Tx>
              </FadeWithSqueeze>
            </>
          ) : labels2(g, i)}
        </Enter>
      ))}
      {cols.slice(0, 3).map((g, i) => (
        <Enter key={'l2' + g.day} clock={clock} at={B.labels2} dy={0} style={s.full}>{labels2(g, i)}</Enter>
      ))}
      <Svg width={CW} height={CH} style={s.full} pointerEvents="none">
        {cols.slice(1).map((g, q) => <TopLine key={g.day} clock={clock} q={q} totals={totals} part1={part1} B={B} c={c} />)}
      </Svg>
      <Enter clock={clock} at={B.legend} style={[s.legend, { top: y(600) }]}>
        <LeaveAt clock={clock} at={B.squeeze[0]} style={s.legendInner}>
          {legend([[c.data, t('obi_body_leg_today')], [c.data2, fill(t('obi_body_leg_ago'), { n: ex.interval })], [c.data3, fill(t('obi_body_leg_ago'), { n: 2 * ex.interval })]])}
        </LeaveAt>
      </Enter>
      <Enter clock={clock} at={B.legend2} style={[s.legend, { top: y(600) }]}>
        {legend([[c.data, fill(t('obi_body_leg_applied'), { dose })], [c.data3, t('obi_body_leg_left')]])}
      </Enter>
      <Enter clock={clock} at={B.foot} style={[s.textBlock, { top: y(662) }]}>
        <LeaveAt clock={clock} at={B.squeeze[0]}>
          <Tx style={[s.foot, s.bodyFoot]} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.85}>{fill(t('obi_body_foot'), { name, days: ex.halfLifeDays })}</Tx>
        </LeaveAt>
      </Enter>
      <Enter clock={clock} at={B.caption} style={[s.textBlock, { top: y(650) }]}>
        <Tx style={s.foot} numberOfLines={5} adjustsFontSizeToFit minimumFontScale={0.85}>{`${fill(t('obi_body_trend'), { dose, total })} ${fill(t('obi_body_example'), { name, days: ex.halfLifeDays })}`}</Tx>
      </Enter>
    </Scene>
  );
}
// ---- end body

// ── 3. Reminders (OB-5): a notification slides down, Taken is tapped, the dose is logged; a second
// one slides down and Snooze is tapped ──
function Press({ clock, at, dur, s, label }) {
  const st = useAnimatedStyle(() => ({ opacity: clamp01((clock.get() - at) / dur) }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.btnOn, st]}>
      <Tx style={s.btnTextOn} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Tx>
    </Animated.View>
  );
}
function Notification({ clock, slide, press, which, s, head, msg, t }) {
  const st = useAnimatedStyle(() => {
    const p = EASE(clamp01((clock.get() - slide[0]) / slide[1]));
    return { opacity: clock.get() < slide[0] ? 0 : p, transform: [{ translateY: -50 * (1 - p) }] };
  });
  // The same words as the real reminder buttons (lib/notifications), never video-only words.
  const btn = (key, on, flex) => (
    <View style={[s.btn, { flex }]}>
      <Tx style={s.btnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t(key)}</Tx>
      {on ? <Press clock={clock} at={press[0]} dur={press[1]} s={s} label={t(key)} /> : null}
    </View>
  );
  return (
    <Animated.View style={[s.notif, st]}>
      <View style={s.notifHead}>
        <View style={s.appMark} />
        <Tx style={s.notifApp} numberOfLines={1}>{head}</Tx>
      </View>
      <Tx style={s.notifMsg} numberOfLines={2}>{msg}</Tx>
      <View style={s.btnRow}>
        {btn('notif_action_complete', which === 'taken', 1.7)}
        {btn('notif_action_snooze_hour', which === 'snooze', 1)}
      </View>
    </Animated.View>
  );
}
function RemindersScene({ clock, s, t, language, timeFormat }) {
  const B = BEATS.reminders;
  const ex = REMINDER_EXAMPLE;
  const head = `DoseTrace · ${t('obi_rem_now')}`;
  return (
    <Scene clock={clock} k="reminders">
      <Title s={s} text={t('obi_rem_title')} />
      <View style={[s.phone, { top: y(230) }]} />
      <View style={[s.notch, { top: y(244) }]} />
      <Tx style={[s.clock, { top: y(270) }]} numberOfLines={1} adjustsFontSizeToFit>{formatTime(ex.first, language, timeFormat)}</Tx>
      <View style={[s.notifCol, { top: y(350) }]}>
        <Notification clock={clock} slide={B.n1} press={B.taken} which="taken" s={s} t={t} head={head} msg={fill(t('obi_rem_msg'), { name: t('obi_ex_compound1') })} />
        <Enter clock={clock} at={B.chip} style={s.chip}>
          <Tx style={s.chipText} numberOfLines={1}>{fill(t('obi_rem_done'), { time: formatTime(ex.logged, language, timeFormat) })}</Tx>
        </Enter>
        <Notification clock={clock} slide={B.n2} press={B.snooze} which="snooze" s={s} t={t} head={head} msg={fill(t('obi_rem_msg'), { name: t('obi_ex_supplement') })} />
      </View>
    </Scene>
  );
}

// ── 4. Dose observation (OB-30, lib/obIntro OBSERVATION_SCENE): the completed dose of Melatonin, the
// sheet opens with the two marks (none chosen) and the Observação field, the note is typed letter by
// letter, Salvar, and the same words show in the report she can take to her doctor. The app only
// keeps and shows what she wrote: no comment, no interpretation. ──
const OBS_TOP = y(272);
function PillGlyph({ color }) {
  return (
    <Svg width={18.4} height={18.4} viewBox="0 0 16 16" style={{ position: 'absolute', left: 14, top: 14 }}>
      <Rect x={1.8} y={5.5} width={12.4} height={5} rx={2.5} transform="rotate(-35 8 8)" fill="none" stroke={color} strokeWidth={1.4} />
      <Path d="M6.3 10.6l3.5-5" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}
// The note on two lines, typed: the letters on screen cross to React only when their count changes.
function TypedNote({ clock, s, note }) {
  const B = BEATS.obs;
  const len = note.length;
  const [n, setN] = useState(() => typedCount(clock.get(), len));
  useAnimatedReaction(() => typedCount(clock.get(), len), (v, prev) => { if (v !== prev) scheduleOnRN(setN, v); }, [len]);
  const [l1, l2] = noteLines(note, n);
  const onSecond = l2.length > 0 || n > l1.length;
  const t0 = B.type[0], t1 = B.type[0] + B.type[1], p1 = B.press[0] + B.press[1];
  // the caret: on while typing, then blinking until Salvar; the field outline while it is focused
  const caret = useAnimatedStyle(() => {
    const v = clock.get();
    const focused = v >= t0 - 100 && v < p1;
    const on = v < t1 ? 1 : Math.floor(v / 500) % 2 === 0 ? 1 : 0;
    return { opacity: focused ? on : 0 };
  });
  return (
    <View style={s.noteText}>
      <View style={s.noteLine}>
        <Tx style={s.noteType} numberOfLines={1}>{l1}</Tx>
        {!onSecond ? <Animated.View style={[s.caret, caret]} /> : null}
      </View>
      <View style={s.noteLine}>
        <Tx style={s.noteType} numberOfLines={1}>{l2}</Tx>
        {onSecond ? <Animated.View style={[s.caret, caret]} /> : null}
      </View>
    </View>
  );
}
function ObservationScene({ clock, s, c, t, language, timeFormat }) {
  const B = BEATS.obs;
  const ex = OBS_EXAMPLE;
  const name = t(OBS_EXAMPLE.nameKey);
  const dose = `${demoDec(ex.dose, language)}${NB}${ex.unit}`;
  const time = formatTime(ex.time, language, timeFormat);
  const note = t('obi_obs_note');
  const day = formatDate(new Date(), language, 'dayMonth');
  const [g0, gd] = B.grow, [p0, pd] = B.press, [a0, ad] = B.actsOut, t0 = B.type[0], f0 = B.type[0] - 100, f1 = B.press[0] + B.press[1];
  // the card grows from the dose row (64 pt) to the sheet (272 pt); it closes up as Cancelar / Salvar leave
  const sheet = useAnimatedStyle(() => {
    const v = clock.get();
    return { height: 64 + 208 * EASE(clamp01((v - g0) / gd)) - 36 * EASE(clamp01((v - a0) / ad)) };
  });
  const acts = useAnimatedStyle(() => ({ opacity: 1 - EASE(clamp01((clock.get() - a0) / ad)) }));
  const press = useAnimatedStyle(() => { const v = clock.get(); return { opacity: v >= p0 && v < p0 + pd + 150 ? 0.3 : 0 }; });
  const ph = useAnimatedStyle(() => ({ opacity: clock.get() < t0 ? 1 : 0 }));
  const focus = useAnimatedStyle(() => { const v = clock.get(); return { opacity: v >= f0 && v < f1 ? 1 : 0 }; });
  return (
    <Scene clock={clock} k="obs">
      <Title s={s} text={t('obi_obs_title')} />
      <Enter clock={clock} at={B.sub} style={[s.textBlock, { top: y(214) }]}>
        <Tx style={s.sub} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{t('obi_obs_sub')}</Tx>
      </Enter>
      <Enter clock={clock} at={B.card} style={[s.obsCard, { top: OBS_TOP }]}>
        <Animated.View style={[s.obsSheet, sheet]} />
        <PillGlyph color={c.ink2} />
        <Tx style={s.obsName} numberOfLines={1}>{name}</Tx>
        <Tx style={s.obsDose} numberOfLines={1}>{dose}</Tx>
        <Tx style={s.obsWhen} numberOfLines={1}>{fill(t('team_msg_today_at'), { time })}</Tx>
        <View style={s.obsDone}>
          <View style={s.obsDot} />
          <Tx style={s.obsDoneText} numberOfLines={1}>{t('today_taken')}</Tx>
        </View>
      </Enter>
      <Enter clock={clock} at={B.marks} style={[s.obsBlock, { top: y(347) }]}>
        <View style={s.obsRule} />
        <View style={s.obsHead}>
          <Tx style={s.obsLabel} numberOfLines={1}>{t('dose_mark_label')}</Tx>
          <Tx style={s.obsOpt} numberOfLines={1}>{t('optional')}</Tx>
        </View>
        <View style={s.marks}>
          {['dose_mark_fasted', 'dose_mark_meal'].map((k) => (
            <View key={k} style={s.mark}><Tx style={s.markText} numberOfLines={1}>{t(k)}</Tx></View>
          ))}
        </View>
      </Enter>
      <Enter clock={clock} at={B.note} style={[s.obsBlock, { top: y(413) }]}>
        <View style={s.obsHead}>
          <Tx style={s.obsLabel} numberOfLines={1}>{t('dose_note_label')}</Tx>
          <Tx style={s.obsOpt} numberOfLines={1}>{t('optional')}</Tx>
        </View>
        <View style={s.field}>
          <Animated.View style={[s.fieldFocus, focus]} />
          <Animated.View style={[s.fieldPh, ph]}><Tx style={s.fieldPhText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('obi_obs_ph')}</Tx></Animated.View>
          <TypedNote clock={clock} s={s} note={note} />
        </View>
      </Enter>
      <Enter clock={clock} at={B.acts} style={[s.obsActs, { top: y(500) }]}>
        <Animated.View style={[s.obsActsRow, acts]}>
          <View style={s.actQuiet}><Tx style={s.actQuietText} numberOfLines={1}>{t('cancel')}</Tx></View>
          <View style={s.actMain}>
            <Tx style={s.actMainText} numberOfLines={1}>{t('save')}</Tx>
            <Animated.View style={[s.actPress, press]} />
          </View>
        </Animated.View>
      </Enter>
      <Enter clock={clock} at={B.report} style={[s.textBlock, { top: y(536) }]}>
        <Tx style={s.reportLabel} numberOfLines={1}>{t('obi_obs_report')}</Tx>
        <View style={s.reportCard}>
          <View style={s.reportPaper}>
            <Tx style={s.reportMono} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('settings_report_title').toLocaleUpperCase()}</Tx>
            <Tx style={[s.reportMono, { marginTop: 4 }]} numberOfLines={1}>{name.toLocaleUpperCase()}</Tx>
            <Tx style={s.reportMono} numberOfLines={1}>{`  ${fill(t('report_dose_setup'), { dose, frequency: lcFirst(t('protocols_every_day')) })}`}</Tx>
          </View>
        </View>
      </Enter>
      <Enter clock={clock} at={B.reportNote} style={[s.reportNote, { top: y(637) }]}>
        <View style={s.reportMark} />
        <Tx style={s.reportMono} numberOfLines={1}>{`  ${t('report_notes_label')}`}</Tx>
        <Tx style={[s.reportMono, s.reportQuote]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{`“${note}” · ${day}, ${time}`}</Tx>
      </Enter>
    </Scene>
  );
}
// ---- end observation

// ── 5. Labs (OB-6): three general markers one by one, each line drawing through every value and its
// month; one neutral colour, nothing behind the line ──
function LabsScene({ clock, c, s, t, language }) {
  const B = BEATS.labs;
  const months = MONTHS_SHORT[language] || MONTHS_SHORT.en;
  return (
    <Scene clock={clock} k="labs">
      <Title s={s} text={t('obi_lab_title')} />
      {LAB_EXAMPLE.map((m, i) => {
        const lo = Math.min(...m.values), hi = Math.max(...m.values);
        const pts = m.values.map((v, k) => [32 + 70 * k, hi === lo ? 74 : 52 + ((hi - v) / (hi - lo)) * 44]);
        const pl = polyline(pts);
        return (
          <Enter key={m.key} clock={clock} at={B.cards[i]} style={[s.labCard, { top: y(230 + 150 * i) }]}>
            <Tx style={s.labName} numberOfLines={1}>{t(m.nameKey)}</Tx>
            <Tx style={s.labUnit}>{m.unit}</Tx>
            <Svg width={342} height={136} style={StyleSheet.absoluteFill}>
              <DrawLine clock={clock} at={B.lines[i][0]} dur={B.lines[i][1]} d={pl.d} length={pl.length} color={c.data} width={2.5} />
              {pts.map((p, k) => <Circle key={k} cx={p[0]} cy={p[1]} r={3.5} fill={c.data} />)}
            </Svg>
            {m.values.map((v, k) => (
              <View key={k} style={[s.labPt, { left: pts[k][0] - 24 }]}>
                <Tx style={[s.labVal, { top: pts[k][1] - 22 }]}>{String(v)}</Tx>
                <Tx style={s.labMonth}>{months[LAB_MONTHS[k]]}</Tx>
              </View>
            ))}
          </Enter>
        );
      })}
      <Enter clock={clock} at={B.foot} style={[s.textBlock, { top: y(686) }]}>
        <Tx style={s.foot}>{t('obi_lab_foot')}</Tx>
      </Enter>
    </Scene>
  );
}
// ---- end labs

// ── 6. End (OB-7): the scale again and the headline; "Começar" is the pill of the button row ──
function EndScene({ clock, c, s, t }) {
  const B = BEATS.end;
  return (
    <Scene clock={clock} k="end">
      <Grow clock={clock} at={B.scale[0]} dur={B.scale[1]} axis="x" origin="50% 50%" style={s.full}>
        <GradScale c={c} top={y(416)} />
        <View style={[s.blueTick, { top: y(416) }]} />
      </Grow>
      <Enter clock={clock} at={B.title} style={[s.textBlock, { top: y(300) }]}>
        <Tx style={s.endTitle} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.75}>{t('obi_end')}</Tx>
      </Enter>
    </Scene>
  );
}

// The scene views by key: with OBSERVATION_SCENE false the timeline has no 'obs' and it never mounts.
const SCENE_VIEWS = { open: OpenScene, syringe: SyringeScene, body: BodyScene, reminders: RemindersScene, obs: ObservationScene, labs: LabsScene, end: EndScene };

// What each scene says, for screen readers (one accessible element reads it; the drawing is hidden).
function sceneLabel(i, { t, language, timeFormat }) {
  const key = SCENES[i].key;
  if (key === 'open') return `${t('obi_a11y_video')}. ${t('obi_open')}`;
  if (key === 'syringe') {
    const ex = SYRINGE_EXAMPLE;
    return [t('obi_syr_title'), `${t('obi_example')}: ${t('obi_syr_l_compound')} ${t('obi_ex_compound1')}, ${t('obi_syr_l_vial')} ${demoDec(ex.amount, language)}${NB}${ex.unit}, ${t('obi_syr_l_diluent')} ${demoDec(ex.water, language)}${NB}mL, ${t('obi_syr_l_dose')} ${demoDec(ex.dose, language)}${NB}${ex.doseUnit}`,
      t('obi_syr_calc'), `${fill(t('obi_syr_draw'), { n: syringeUnits() })}, ${demoDec(String(syringeMl()), language)}${NB}mL`].join('. ');
  }
  if (key === 'body') {
    const cols = bodyColumns().map((g) => `${fill(t('obi_body_day'), { n: g.day })}: ${g.segments.map((x) => Math.round(x.mg)).join(' + ')} = ${Math.round(g.total)}${NB}${BODY_EXAMPLE.unit}`);
    const ex = BODY_EXAMPLE, dose = `${ex.dose}${NB}${ex.unit}`;
    const weeks = bodySeries().map((g) => `${fill(t('obi_body_day'), { n: g.day })}: ${Math.round(g.total)}${NB}${ex.unit}`).join(', ');
    return [t('obi_body_title'), t('obi_body_sub'), t('obi_body_axis'), ...cols, weeks, fill(t('obi_body_leg_applied'), { dose }), t('obi_body_leg_left'),
      fill(t('obi_body_trend'), { dose, total: `${Math.round(bodyLimit())}${NB}${ex.unit}` }), fill(t('obi_body_example'), { name: t('obi_ex_compound1'), days: ex.halfLifeDays })].join('. ');
  }
  if (key === 'reminders') {
    const ex = REMINDER_EXAMPLE;
    return [t('obi_rem_title'), fill(t('obi_rem_msg'), { name: t('obi_ex_compound1') }), t('notif_action_complete'), fill(t('obi_rem_done'), { time: formatTime(ex.logged, language, timeFormat) }), fill(t('obi_rem_msg'), { name: t('obi_ex_supplement') }), t('notif_action_snooze_hour')].join('. ');
  }
  if (key === 'obs') {
    const ex = OBS_EXAMPLE;
    return [t('obi_obs_title'), t('obi_obs_sub'), `${t(ex.nameKey)}, ${demoDec(ex.dose, language)}${NB}${ex.unit}, ${fill(t('team_msg_today_at'), { time: formatTime(ex.time, language, timeFormat) })}, ${t('today_taken')}`,
      `${t('dose_note_label')}: ${t('obi_obs_note')}`, t('obi_obs_report')].join('. ');
  }
  if (key === 'labs') {
    const months = MONTHS_SHORT[language] || MONTHS_SHORT.en;
    return [t('obi_lab_title'), ...LAB_EXAMPLE.map((m) => `${t(m.nameKey)} (${m.unit}): ${m.values.map((v, k) => `${months[LAB_MONTHS[k]]} ${v}`).join(', ')}`), t('obi_lab_foot')].join('. ');
  }
  return t('obi_end');
}

// ── the video ──
function StoryBar({ clock, b, reduced, s }) {
  const st = useAnimatedStyle(() => ({ width: BAR_W * barFill(clock.get(), b, reduced) }), [reduced]);
  return (
    <View style={[s.bar, { left: barLeft(b) }]}>
      <Animated.View style={[s.barFill, st]} />
    </View>
  );
}

export default function OnboardingIntro({ onDone, atEnd, backRef, onLanguage }) {
  const { colors: c } = useTheme();
  const { t, language, timeFormat, LANGUAGES } = useLanguage();
  // The language chip (founder 2026-11-24): its own name, from the app list. Changing it re-renders
  // the texts only; the clock and the scene stay where they are.
  const langName = ((LANGUAGES || []).find((l) => l.code === language) || {}).native || String(language).toUpperCase();
  const s = useMemo(() => makeStyles(c), [c]);
  const reduceMotion = useReducedMotion();
  const [reader, setReader] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled().then((on) => { if (live) setReader(!!on); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (on) => setReader(!!on));
    return () => { live = false; if (sub && sub.remove) sub.remove(); };
  }, []);
  const reduced = !!(reduceMotion || reader);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  // The first plan (lib/obIntro introStart): the opening plays on to the syringe; Reduce Motion: the
  // opening complete; back from the next step: the end frame complete.
  const first = useMemo(() => introStart({ reduced, atEnd }), []);
  const clock = useSharedValue(first.from);
  const fade = useSharedValue(1);
  const [cur, setCur] = useState(first.cur);
  const curRef = useRef(first.cur);
  const [nav, setNav] = useState(first.nav);
  const navRef = useRef(first.nav);
  const [scene, setScene] = useState(sceneIndexAt(first.from));
  const [box, setBox] = useState(null);

  function latchNav() { if (!navRef.current) { navRef.current = true; setNav(true); } }
  // Run a plan: the clock jumps to `from` and plays to the hold frame `to` (Reduce Motion: no play,
  // no fade). Every button and the Android back come through here.
  function go(plan, byHand) {
    curRef.current = plan.cur;
    setCur(plan.cur);
    if (byHand || plan.nav) latchNav();
    cancelAnimation(clock);
    if (plan.cut && !reducedRef.current) {
      fade.set(0);
      fade.set(withTiming(1, { duration: CUT_MS, easing: Easing.out(Easing.quad) }));
    }
    clock.set(plan.from);
    if (!reducedRef.current && plan.to > plan.from) clock.set(withTiming(plan.to, { duration: plan.to - plan.from, easing: Easing.linear }));
  }

  // First mount: play the first plan. Reduce Motion / a screen reader turned on later: the scene on
  // screen, complete.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; go(first, false); return undefined; }
    if (reduced) go(introReduce(clock.get()), false);
    return undefined;
  }, [reduced]);
  useEffect(() => () => { cancelAnimation(clock); if (backRef) backRef.current = null; }, []);

  // Only a few crossings reach React: the scene index (once per scene) and the row latch (once).
  useAnimatedReaction(() => sceneIndexAt(clock.get()), (i, prev) => { if (i !== prev) scheduleOnRN(setScene, i); });
  useAnimatedReaction(() => navShown(false, clock.get()), (on, prev) => { if (on && !prev) scheduleOnRN(latchNav); });

  // Avançar (Começar on the end frame), Voltar, Pular.
  function primary() {
    const plan = introNext(curRef.current, clock.get(), reducedRef.current);
    if (plan.finish) {
      if (onDone) { onboardingFunnel.intro('finished'); onDone(); }
      return;
    }
    go(plan, true);
  }
  function goBack() {
    const plan = introBack(curRef.current, navRef.current);
    if (!plan) return false;
    go(plan, true);
    return true;
  }
  function skip() {
    const plan = introSkip(curRef.current);
    if (!plan) return;
    onboardingFunnel.intro('skipped');
    go(plan, true);
  }
  // The flow's Android back asks the video first: true = handled (the scene before); false = the flow's own back.
  if (backRef) backRef.current = goBack;

  // A screen reader hears the new scene when a button changes it.
  const ctx = { t, language, timeFormat };
  const lastSaid = useRef(scene);
  useEffect(() => {
    if (lastSaid.current === scene) return;
    lastSaid.current = scene;
    if (reader) AccessibilityInfo.announceForAccessibility(sceneLabel(scene, ctx));
  }, [scene, reader]);

  const fadeSt = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const ctl = controls(cur, nav);
  const sc = box ? Math.min(box.w / CW, box.h / CH, 1.3) : 1;
  // The scene on screen and the next one (mounted ahead, still invisible), so a scene never
  // mounts in the frame it should appear (a jump mounts under the cut fade).
  const shown = [scene, scene + 1].filter((i) => i <= END);
  return (
    <View style={s.root} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {box ? (
        <View style={[s.canvas, { left: (box.w - CW * sc) / 2, top: (box.h - CH * sc) / 2, transform: [{ scale: sc }] }]}>
          <Animated.View pointerEvents="none" style={[s.full, fadeSt]}>
            {shown.map((i) => { const V = SCENE_VIEWS[SCENES[i].key]; return <V key={SCENES[i].key} clock={clock} c={c} s={s} t={t} language={language} timeFormat={timeFormat} />; })}
          </Animated.View>

          <View accessible accessibilityRole={scene === END ? 'header' : 'text'} accessibilityLabel={sceneLabel(scene, ctx)} style={s.sceneA11y} />

          <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {STORY_BARS.map((k, b) => <StoryBar key={k} clock={clock} b={b} reduced={reduced} s={s} />)}
          </View>
          {onLanguage ? (
            <Pressable onPress={onLanguage} style={({ pressed }) => [s.langChip, pressed && s.pressedQuiet]} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${t('settings_language')}: ${langName}`}>
              <FeatureIcon name="globe" size={18} color={c.ink} />
              <Tx style={s.langChipText} numberOfLines={1}>{langName}</Tx>
              <Svg width={9} height={5} viewBox="0 0 9 5">
                <Path d="M0.5 0.5 L4.5 4.5 L8.5 0.5" fill="none" stroke={c.ink2} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
          ) : null}
          {ctl.skip ? (
            <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={s.skipWrap}>
              <Pressable onPress={skip} style={({ pressed }) => [s.skip, pressed && s.pressedQuiet]} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('ob_skip')}>
                <Tx style={s.skipText}>{t('ob_skip')}</Tx>
              </Pressable>
            </Animated.View>
          ) : null}
          {ctl.row ? (
            <Animated.View entering={FadeIn.duration(260)} style={s.row}>
              {ctl.back ? (
                <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={s.backWrap}>
                  <Pressable onPress={goBack} style={({ pressed }) => [s.backBtn, pressed && s.pressedQuiet]} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('back')}>
                    <Svg width={10} height={20} viewBox="0 0 10 20">
                      <Path d="M9 1 L1 10 L9 19" fill="none" stroke={c.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                    <Tx style={s.backText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('back')}</Tx>
                  </Pressable>
                </Animated.View>
              ) : null}
              <Pressable onPress={primary} style={({ pressed }) => [s.primaryBtn, pressed && s.pressedMain]} accessibilityRole="button" accessibilityLabel={t(ctl.primary)}>
                <Tx style={s.primaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t(ctl.primary)}</Tx>
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.ground, overflow: 'hidden' },
  canvas: { position: 'absolute', width: CW, height: CH, transformOrigin: 'top left' },
  full: { position: 'absolute', left: 0, top: 0, width: CW, height: CH },
  // top: story bars + Pular
  bar: { position: 'absolute', top: y(58), width: BAR_W, height: 4, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, backgroundColor: c.ink },
  skipWrap: { position: 'absolute', right: 16, top: y(70) },
  // the language chip (founder 2026-11-24): top left, next to Pular; opens the app's language sheet
  langChip: { position: 'absolute', left: 24, top: y(72), height: 34, maxWidth: 200, borderRadius: 17, paddingLeft: 10, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.raised },
  langChipText: { fontSize: 13.5, lineHeight: 18, fontWeight: '600', color: c.ink, marginRight: 2, flexShrink: 1 },
  skip: { minHeight: 36, minWidth: 44, paddingHorizontal: 8, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  title: { position: 'absolute', left: 24, top: y(133), width: 342, fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.56, color: c.ink },
  textBlock: { position: 'absolute', left: 24, width: 342 },
  sub: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  foot: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  centerLine: { position: 'absolute', left: 16, width: 358, alignItems: 'center' },
  // opening / end
  blueTick: { position: 'absolute', left: 193.5, width: 3, height: 24, borderRadius: 1.5, backgroundColor: c.data },
  openTitle: { fontSize: 34, lineHeight: 40, fontWeight: '600', letterSpacing: -0.68, color: c.ink, textAlign: 'center' },
  endTitle: { fontSize: 30, lineHeight: 38, fontWeight: '600', letterSpacing: -0.6, color: c.ink, textAlign: 'center' },
  // syringe
  card: { position: 'absolute', left: 24, width: 342, borderRadius: 20, backgroundColor: c.raised },
  tag: { position: 'absolute', left: 16, top: 16, height: 22, paddingHorizontal: 9, borderRadius: 11, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
  tagText: { fontSize: 12, fontWeight: '600', color: c.ink2 },
  exRow: { position: 'absolute', left: 16, right: 16, height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: c.line },
  exLabel: { fontSize: 15, lineHeight: 20, color: c.ink2, flexShrink: 1 },
  exValue: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink, textAlign: 'right' },
  cardLine: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  calc: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: c.data, textAlign: 'center' },
  draw: { fontSize: 30, lineHeight: 36, fontWeight: '600', letterSpacing: -0.6, color: c.data, textAlign: 'center' },
  drawMl: { fontSize: 14, lineHeight: 18, fontFamily: MONO['400'], color: c.ink2, textAlign: 'center' },
  // dose in body
  baseLine: { position: 'absolute', left: 40, width: 310, height: 1.5, backgroundColor: c.line },
  segVal: { position: 'absolute', width: COL_W, fontSize: 13, lineHeight: 16, fontFamily: MONO['500'], fontVariant: ['tabular-nums'], textAlign: 'center' },
  axisTitle: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: c.ink2 },
  guideLabel: { position: 'absolute', right: CW - 350, fontSize: 11, lineHeight: 14, fontFamily: MONO['400'], color: c.ink2, textAlign: 'right' },
  lab2: { position: 'absolute', top: y(555), width: 40, alignItems: 'center' },
  lab2Day: { fontSize: 10.5, lineHeight: 13, fontWeight: '600', color: c.ink2, textAlign: 'center' },
  lab2Total: { marginTop: 5, fontSize: 11, lineHeight: 14, fontFamily: MONO['500'], color: c.ink, textAlign: 'center', fontVariant: ['tabular-nums'] },
  legendInner: { gap: 6 },
  colSum: { position: 'absolute', width: COL_W + 60, fontSize: 17, lineHeight: 22, fontFamily: MONO['500'], color: c.ink, textAlign: 'center' },
  colDay: { position: 'absolute', width: COL_W + 60, fontSize: 14, lineHeight: 18, fontWeight: '600', color: c.ink2, textAlign: 'center' },
  colSumLine: { position: 'absolute', width: COL_W + 60, fontSize: 12, lineHeight: 16, fontFamily: MONO['400'], color: c.ink2, textAlign: 'center' },
  bodyFoot: { lineHeight: 16 }, // three lines (de, es) still end above the button row at y(760)
  legend: { position: 'absolute', left: 24, width: 342, gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendKey: { width: 14, height: 14, borderRadius: 3 },
  legendText: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: c.ink, flexShrink: 1 },
  // reminders
  phone: { position: 'absolute', left: 70, width: 250, height: 500, borderRadius: 34, borderWidth: 3, borderColor: c.tick, backgroundColor: c.well },
  notch: { position: 'absolute', left: 160, width: 70, height: 16, borderRadius: 8, backgroundColor: c.tick },
  clock: { position: 'absolute', left: 80, width: 230, fontSize: 44, lineHeight: 52, fontWeight: '600', color: c.ink, textAlign: 'center', fontVariant: ['tabular-nums'] },
  notifCol: { position: 'absolute', left: 84, width: 222 },
  notif: { backgroundColor: c.raised, borderRadius: 16, padding: 12, gap: 6 },
  notifHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appMark: { width: 20, height: 20, borderRadius: 6, backgroundColor: c.data },
  notifApp: { flex: 1, fontSize: 11, lineHeight: 14, color: c.ink2 },
  notifMsg: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: c.ink },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  btn: { height: 26, borderRadius: 8, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 4 },
  btnText: { fontSize: 12, fontWeight: '700', color: c.ink },
  btnOn: { borderRadius: 8, backgroundColor: c.data, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  btnTextOn: { fontSize: 12, fontWeight: '700', color: c.onData },
  chip: { alignSelf: 'center', marginTop: 12, marginBottom: 18, minHeight: 30, borderRadius: 15, paddingHorizontal: 14, backgroundColor: c.raised, justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: c.ok },
  // dose observation (OB-30)
  obsCard: { position: 'absolute', left: 24, width: 342, height: 272 },
  obsSheet: { position: 'absolute', left: 0, top: 0, width: 342, borderRadius: 20, backgroundColor: c.raised },
  obsName: { position: 'absolute', left: 40, right: 140, top: 10, fontSize: 16, lineHeight: 20, fontWeight: '700', color: c.ink },
  obsDose: { position: 'absolute', left: 40, top: 32, fontSize: 12.5, lineHeight: 16, fontFamily: MONO['500'], color: c.ink2 },
  obsWhen: { position: 'absolute', right: 16, top: 11, maxWidth: 150, fontSize: 13, lineHeight: 18, color: c.ink2, textAlign: 'right' },
  obsDone: { position: 'absolute', right: 16, top: 33, maxWidth: 170, flexDirection: 'row', alignItems: 'center', gap: 5 },
  obsDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.ok },
  obsDoneText: { fontSize: 11, lineHeight: 14, fontWeight: '600', color: c.ok, flexShrink: 1 },
  obsBlock: { position: 'absolute', left: 40, width: 310 },
  obsRule: { position: 'absolute', left: 0, right: 0, top: -11, height: 1, backgroundColor: c.line },
  obsHead: { height: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  obsLabel: { fontSize: 12.5, lineHeight: 16, fontWeight: '500', color: c.ink2, flexShrink: 1 },
  obsOpt: { fontSize: 11, lineHeight: 14, color: c.ink3 },
  marks: { flexDirection: 'row', gap: 6, marginTop: 7 },
  mark: { height: 30, borderRadius: 15, borderWidth: 1, borderColor: c.line, paddingHorizontal: 14, justifyContent: 'center' },
  markText: { fontSize: 12, lineHeight: 16, color: c.ink2 },
  field: { marginTop: 7, height: 56, borderRadius: 12, borderWidth: 1.5, borderColor: c.well, backgroundColor: c.well },
  fieldFocus: { position: 'absolute', left: -1.5, top: -1.5, right: -1.5, bottom: -1.5, borderRadius: 12, borderWidth: 1.5, borderColor: c.ink },
  fieldPh: { position: 'absolute', left: 12, right: 12, top: 11 },
  fieldPhText: { fontSize: 12.5, lineHeight: 16, color: c.ink3 },
  noteText: { position: 'absolute', left: 12, right: 12, top: 6 },
  noteLine: { height: 20, flexDirection: 'row', alignItems: 'center' },
  noteType: { fontSize: 13.5, lineHeight: 20, color: c.ink, flexShrink: 1 },
  caret: { width: 1.5, height: 16, marginLeft: 1, backgroundColor: c.ink },
  obsActs: { position: 'absolute', left: 40, width: 310 },
  obsActsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  actQuiet: { height: 30, borderRadius: 15, paddingHorizontal: 12, backgroundColor: c.well, justifyContent: 'center' },
  actQuietText: { fontSize: 12.5, fontWeight: '700', color: c.ink },
  actMain: { height: 30, borderRadius: 15, paddingHorizontal: 14, backgroundColor: c.act, justifyContent: 'center', overflow: 'hidden' },
  actMainText: { fontSize: 12.5, fontWeight: '700', color: c.onAct },
  actPress: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: c.ground },
  reportLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: c.ink2 },
  reportCard: { marginTop: 6, height: 146, borderRadius: 18, backgroundColor: c.raised, padding: 10 },
  reportPaper: { flex: 1, borderRadius: 11, backgroundColor: c.well, paddingHorizontal: 12, paddingTop: 8 },
  reportMono: { fontSize: 11.5, lineHeight: 18, fontFamily: MONO['500'], color: c.ink },
  reportNote: { position: 'absolute', left: 44, width: 304, height: 55, paddingLeft: 4 },
  reportMark: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 3, backgroundColor: c.data, opacity: 0.16 },
  reportQuote: { paddingLeft: 28, paddingRight: 4 },
  // labs
  labCard: { position: 'absolute', left: 24, width: 342, height: 136, borderRadius: 18, backgroundColor: c.raised },
  labName: { position: 'absolute', left: 16, right: 90, top: 13, fontSize: 16, lineHeight: 20, fontWeight: '700', color: c.ink },
  labUnit: { position: 'absolute', right: 16, top: 16, fontSize: 12, lineHeight: 16, color: c.ink2 },
  labPt: { position: 'absolute', top: 0, bottom: 0, width: 48 },
  labVal: { position: 'absolute', left: 0, right: 0, fontSize: 11, lineHeight: 14, fontFamily: MONO['500'], color: c.ink, textAlign: 'center', fontVariant: ['tabular-nums'] },
  labMonth: { position: 'absolute', left: 0, right: 0, top: 112, fontSize: 11, lineHeight: 14, color: c.ink2, textAlign: 'center' },
  // the controls (2026-11-24): Voltar / Avançar where Começar was
  row: { position: 'absolute', left: 24, top: y(760), width: 342, height: 54 },
  backWrap: { position: 'absolute', left: -8, top: 0, width: 108, height: 54 },
  backBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 6, borderRadius: 27 },
  backText: { fontSize: 17, fontWeight: '600', color: c.ink, flexShrink: 1 },
  primaryBtn: { position: 'absolute', left: 108, top: 0, width: 234, height: 54, borderRadius: 27, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { fontSize: 17, fontWeight: '700', color: c.onAct },
  pressedQuiet: { opacity: 0.6 },
  pressedMain: { opacity: 0.82 },
  // the scene read out (screen readers); invisible
  sceneA11y: { position: 'absolute', left: 24, top: y(100), width: 342, height: y(740) - y(100) },
});
