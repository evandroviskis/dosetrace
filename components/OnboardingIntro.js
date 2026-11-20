// The onboarding intro video (docs/specs/onboarding-protocol.md OB-2..OB-7, OB-27; approved picture
// docs/design/onboarding-intro.html, founder 2026-11-20): one continuous ~32 s video that plays by
// itself and replaces the five separate feature screens. Opening, syringe, dose in the body,
// reminders, labs, then the end frame with "Começar" — the only way on (no auto-advance). Four story
// bars and "Pular" (to the end frame) are always on screen.
//
// Motion: ONE clock (a shared value in ms, 0 → INTRO_END, linear, UI thread); every element is a
// worklet of it, using transform / opacity, stroke-dashoffset for the line draws and the
// sanctioned width of absolute, childless bars (story bars, syringe fill). No React render per
// frame: the scene index and "Start is visible" cross to the RN runtime only when they change.
// The timeline (order, timings, holds) is lib/obIntro; the example numbers are lib/obFeatures (the
// app's own dose math and half-life formula) — never typed here, never her data.
//
// Reduce Motion, or a screen reader on: no playback. Each scene is shown complete (its hold frame)
// and a tap goes to the next; the end frame waits for "Começar". Skip works the same.
//
// Drawn like the picture on its own 390 x 786 canvas (the phone minus the status-bar strip),
// scaled to fit, so the choreography ports 1:1; texts inside are part of the video (no font
// scaling) and the tap layer reads each scene out for screen readers. Theme tokens only.
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, AccessibilityInfo } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedProps, useAnimatedReaction,
  withTiming, cancelAnimation, Easing, useReducedMotion,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Rect, Line, Path, Circle, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';
import { formatTime } from '../lib/timeFormat';
import { MONTHS_SHORT } from '../lib/localeFormat';
import { MONO } from '../lib/fonts';
import { syringeParts, SYR_VIEW } from '../lib/syringeGeometry';
import SyringeScale from '../screens/components/SyringeScale';
import { eInOutCubic } from './motion';
import { demoDec } from './previewFx';
import {
  SCENES, INTRO_END, BEATS, IN_DUR, OUT_DUR, HOLDS, STORY_BARS,
  sceneIndexAt, barFill, skipTime, reducedStart, reducedNext, clamp01,
} from '../lib/obIntro';
import {
  SYRINGE_EXAMPLE, syringeUnits, syringeMl, BODY_EXAMPLE, bodyColumns, LAB_EXAMPLE, LAB_MONTHS, REMINDER_EXAMPLE,
} from '../lib/obFeatures';

const ARect = Animated.createAnimatedComponent(Rect);
const APath = Animated.createAnimatedComponent(Path);

// The picture's curve (cubic-bezier(.2,.8,.2,1)): a strong ease-out for every entrance.
const EASE = Easing.bezierFn(0.2, 0.8, 0.2, 1);
const CW = 390, CH = 786, Y0 = 44; // the canvas: the picture's 390 x 844 phone minus its top 44 pt
const y = (v) => v - Y0;
const END_INDEX = SCENES.length - 1;
const START_AT = BEATS.end.button;
const NB = ' ';

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
function DrawLine({ clock, at, dur, d, length, color, width }) {
  const props = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - eInOutCubic(clamp01((clock.get() - at) / dur))) }));
  return <APath animatedProps={props} d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={[length, length]} strokeDashoffset={length} />;
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

// ── 1. Syringe (OB-3): the fields fill in one by one, then the syringe fills to 30 units ──
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
  const units = syringeUnits(); // 10 mg in 2 mL, a 1,5 mg dose → 30 (lib/doseMath computeDraw)
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

// ── 2. Dose in the body (OB-4): doses add up, each coloured by its age, then a line across the tops ──
const MG_PX = 1.28; // 100 mg = 128 pt, as in the picture
const BASE = y(598);
const COL_X = [70, 175, 280];
const COL_W = 60;
function BodyScene({ clock, c, s, t }) {
  const B = BEATS.body;
  const cols = useMemo(() => bodyColumns(), []);
  const tone = (age) => (age === 0 ? c.data : age === BODY_EXAMPLE.interval ? c.data2 : c.data3);
  const ink = (age) => (age === 0 ? c.onData : c.ink);
  const geo = cols.map((col, i) => {
    let bottom = BASE;
    const n = col.segments.length;
    const segs = col.segments.map((sg, k) => {
      const hgt = sg.mg * MG_PX;
      const gap = k < n - 1 ? 2 : 0; // a 2 pt gap between doses
      const seg = { ...sg, top: bottom - hgt + gap, height: hgt - gap };
      bottom -= hgt;
      return seg;
    });
    return { ...col, x: COL_X[i], top: bottom, segs };
  });
  const LINE_TOP = y(300);
  const line = polyline(geo.map((g) => [g.x + COL_W / 2, g.top - LINE_TOP]));
  const name = t('obi_ex_compound1');
  return (
    <Scene clock={clock} k="body">
      <Title s={s} text={t('obi_body_title')} />
      <Enter clock={clock} at={B.sub} style={[s.textBlock, { top: y(214) }]}>
        <Tx style={s.sub}>{t('obi_body_sub')}</Tx>
      </Enter>
      <View style={[s.baseLine, { top: BASE + 1 }]} />
      {geo.map((g, i) => (
        <Enter key={g.day} clock={clock} at={B.cols[i]} style={s.full}>
          {g.segs.map((sg) => (
            <View key={sg.age} style={[s.seg, { left: g.x, top: sg.top, height: sg.height, backgroundColor: tone(sg.age) }]}>
              <Tx style={[s.segVal, { color: ink(sg.age) }]}>{String(Math.round(sg.mg))}</Tx>
            </View>
          ))}
          <Tx style={[s.colSum, { left: g.x - 30, top: g.top - 36 }]} numberOfLines={1}>{`${Math.round(g.total)}${NB}${BODY_EXAMPLE.unit}`}</Tx>
          <Tx style={[s.colDay, { left: g.x - 30, top: y(610) }]} numberOfLines={1}>{fill(t('obi_body_day'), { n: g.day })}</Tx>
          <Tx style={[s.colSumLine, { left: g.x - 30, top: y(632) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {i === 0 ? fill(t('obi_body_you_take'), { n: Math.round(g.total) }) : g.segs.map((sg) => String(Math.round(sg.mg))).join(' + ')}
          </Tx>
        </Enter>
      ))}
      <Svg width={CW} height={BASE - LINE_TOP} style={{ position: 'absolute', left: 0, top: LINE_TOP }}>
        <DrawLine clock={clock} at={B.line[0]} dur={B.line[1]} d={line.d} length={line.length} color={c.ink} width={2} />
      </Svg>
      <Enter clock={clock} at={B.legend} style={[s.legend, { top: y(660) }]}>
        {[[c.data, t('obi_body_leg_today')], [c.data2, fill(t('obi_body_leg_ago'), { n: BODY_EXAMPLE.interval })], [c.data3, fill(t('obi_body_leg_ago'), { n: 2 * BODY_EXAMPLE.interval })]].map(([col, label]) => (
          <View key={label} style={s.legendRow}>
            <View style={[s.legendKey, { backgroundColor: col }]} />
            <Tx style={s.legendText} numberOfLines={1}>{label}</Tx>
          </View>
        ))}
      </Enter>
      <Enter clock={clock} at={B.foot} style={[s.textBlock, { top: y(738) }]}>
        <Tx style={s.foot}>{fill(t('obi_body_foot'), { name, days: BODY_EXAMPLE.halfLifeDays })}</Tx>
      </Enter>
    </Scene>
  );
}

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

// ── 4. Labs (OB-6): three general markers one by one, each line drawing through every value and its
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

// ── 5. End (OB-7): the scale again and the headline; the Start button is drawn by the video ──
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

const SCENE_VIEWS = [OpenScene, SyringeScene, BodyScene, RemindersScene, LabsScene, EndScene];

// What each scene says, for screen readers (the tap layer reads it; the drawing is hidden).
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
    return [t('obi_body_title'), t('obi_body_sub'), ...cols, fill(t('obi_body_foot'), { name: t('obi_ex_compound1'), days: BODY_EXAMPLE.halfLifeDays })].join('. ');
  }
  if (key === 'reminders') {
    const ex = REMINDER_EXAMPLE;
    return [t('obi_rem_title'), fill(t('obi_rem_msg'), { name: t('obi_ex_compound1') }), t('notif_action_complete'), fill(t('obi_rem_done'), { time: formatTime(ex.logged, language, timeFormat) }), fill(t('obi_rem_msg'), { name: t('obi_ex_supplement') }), t('notif_action_snooze_hour')].join('. ');
  }
  if (key === 'labs') {
    const months = MONTHS_SHORT[language] || MONTHS_SHORT.en;
    return [t('obi_lab_title'), ...LAB_EXAMPLE.map((m) => `${t(m.nameKey)} (${m.unit}): ${m.values.map((v, k) => `${months[LAB_MONTHS[k]]} ${v}`).join(', ')}`), t('obi_lab_foot')].join('. ');
  }
  return t('obi_end');
}

// ── the video ──
function StoryBar({ clock, b, reduced, s }) {
  const st = useAnimatedStyle(() => ({ width: 81 * barFill(clock.get(), b, reduced) }), [reduced]);
  return (
    <View style={[s.bar, { left: 24 + 87 * b }]}>
      <Animated.View style={[s.barFill, st]} />
    </View>
  );
}

export default function OnboardingIntro({ onDone }) {
  const { colors: c } = useTheme();
  const { t, language, timeFormat } = useLanguage();
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

  const clock = useSharedValue(reduced ? reducedStart() : 0);
  const [scene, setScene] = useState(sceneIndexAt(reduced ? reducedStart() : 0));
  const [startOn, setStartOn] = useState(false);
  const [box, setBox] = useState(null);

  // Play once, linear, on the UI thread; Reduce Motion / a screen reader: the hold frame of the scene.
  useEffect(() => {
    cancelAnimation(clock);
    const now = clock.get();
    if (reduced) {
      clock.set(now >= INTRO_END ? INTRO_END : HOLDS[sceneIndexAt(now)]);
      return undefined;
    }
    if (now < INTRO_END) clock.set(withTiming(INTRO_END, { duration: INTRO_END - now, easing: Easing.linear }));
    return () => cancelAnimation(clock);
  }, [reduced]);

  // Only two crossings reach React: the scene index (6 times) and "Start is on screen" (once).
  useAnimatedReaction(() => sceneIndexAt(clock.get()), (i, prev) => { if (i !== prev) scheduleOnRN(setScene, i); });
  useAnimatedReaction(() => clock.get() >= START_AT, (on, prev) => { if (on !== prev) scheduleOnRN(setStartOn, on); });

  function skip() { cancelAnimation(clock); clock.set(skipTime()); }
  function tapNext() { clock.set(reducedNext(clock.get())); }
  function start() { if (startOn && onDone) onDone(); }

  const startSt = useAnimatedStyle(() => {
    const p = EASE(clamp01((clock.get() - START_AT) / IN_DUR));
    return { opacity: clock.get() < START_AT ? 0 : p, transform: [{ translateY: 10 * (1 - p) }] };
  });

  const sc = box ? Math.min(box.w / CW, box.h / CH, 1.3) : 1;
  const ctx = { t, language, timeFormat };
  // The scene on screen and the next one (mounted ahead, still invisible), so a scene never
  // mounts in the frame it should appear.
  const shown = [scene, scene + 1].filter((i) => i <= END_INDEX);
  return (
    <View style={s.root} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {box ? (
        <View style={[s.canvas, { left: (box.w - CW * sc) / 2, top: (box.h - CH * sc) / 2, transform: [{ scale: sc }] }]}>
          {shown.map((i) => { const V = SCENE_VIEWS[i]; return <V key={SCENES[i].key} clock={clock} c={c} s={s} t={t} language={language} timeFormat={timeFormat} />; })}

          {reduced && scene < END_INDEX ? (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={tapNext}
              accessibilityRole="button"
              accessibilityLabel={sceneLabel(scene, ctx)}
              accessibilityHint={t('obi_tap_next')}
            >
              <Tx style={s.tapHint}>{t('obi_tap_next')}</Tx>
            </Pressable>
          ) : null}
          {scene === END_INDEX ? <Tx style={s.srOnly} accessibilityRole="header">{t('obi_end')}</Tx> : null}

          <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {STORY_BARS.map((k, b) => <StoryBar key={k} clock={clock} b={b} reduced={reduced} s={s} />)}
          </View>
          <Pressable onPress={skip} style={s.skip} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('ob_skip')}>
            <Tx style={s.skipText}>{t('ob_skip')}</Tx>
          </Pressable>
          <Animated.View style={[s.startWrap, startSt]} pointerEvents={startOn ? 'auto' : 'none'}>
            <Pressable onPress={start} style={s.startBtn} accessibilityRole="button" accessibilityLabel={t('obi_start')} accessibilityElementsHidden={!startOn} importantForAccessibility={startOn ? 'auto' : 'no-hide-descendants'}>
              <Tx style={s.startText}>{t('obi_start')}</Tx>
            </Pressable>
          </Animated.View>
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
  bar: { position: 'absolute', top: y(58), width: 81, height: 4, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, backgroundColor: c.ink },
  skip: { position: 'absolute', right: 16, top: y(70), minHeight: 36, minWidth: 44, paddingHorizontal: 8, alignItems: 'flex-end', justifyContent: 'center' },
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
  seg: { position: 'absolute', width: COL_W, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  segVal: { fontSize: 13, lineHeight: 16, fontFamily: MONO['500'], fontVariant: ['tabular-nums'] },
  colSum: { position: 'absolute', width: COL_W + 60, fontSize: 17, lineHeight: 22, fontFamily: MONO['500'], color: c.ink, textAlign: 'center' },
  colDay: { position: 'absolute', width: COL_W + 60, fontSize: 14, lineHeight: 18, fontWeight: '600', color: c.ink2, textAlign: 'center' },
  colSumLine: { position: 'absolute', width: COL_W + 60, fontSize: 12, lineHeight: 16, fontFamily: MONO['400'], color: c.ink2, textAlign: 'center' },
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
  // labs
  labCard: { position: 'absolute', left: 24, width: 342, height: 136, borderRadius: 18, backgroundColor: c.raised },
  labName: { position: 'absolute', left: 16, right: 90, top: 13, fontSize: 16, lineHeight: 20, fontWeight: '700', color: c.ink },
  labUnit: { position: 'absolute', right: 16, top: 16, fontSize: 12, lineHeight: 16, color: c.ink2 },
  labPt: { position: 'absolute', top: 0, bottom: 0, width: 48 },
  labVal: { position: 'absolute', left: 0, right: 0, fontSize: 11, lineHeight: 14, fontFamily: MONO['500'], color: c.ink, textAlign: 'center', fontVariant: ['tabular-nums'] },
  labMonth: { position: 'absolute', left: 0, right: 0, top: 112, fontSize: 11, lineHeight: 14, color: c.ink2, textAlign: 'center' },
  // end + reduced motion
  startWrap: { position: 'absolute', left: 24, top: y(760), width: 342 },
  startBtn: { height: 54, borderRadius: 27, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center' },
  startText: { fontSize: 17, fontWeight: '700', color: c.onAct },
  tapHint: { position: 'absolute', left: 24, right: 24, top: y(790), fontSize: 13, lineHeight: 18, color: c.ink2, textAlign: 'center' },
  srOnly: { position: 'absolute', left: 24, top: y(300), width: 342, height: 1, opacity: 0 },
});
