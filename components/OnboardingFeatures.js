// The five animated FEATURE screens at the start of the onboarding (docs/specs/onboarding-protocol.md
// OB-2..OB-7; approved picture docs/design/onboarding-protocolo.html section 2, founder 2026-11-20):
// syringe math, dose in the body, reminders, several protocols, blood tests. Each one is the title,
// the sentence under it, an animated EXAMPLE (Composto 1, Diluente A, fictitious lab values: never
// the person's data, never a recommendation or a verdict) and its footer note. Skip and Continue
// belong to the flow screen (screens/OnboardingFlowScreen.js), not here.
//
// Motion: one previewFx clock per screen (components/previewFx.js), started when the screen mounts;
// every element is a worklet of that clock, so Reduce Motion (the clock starts at its end) shows the
// final frame at once. The example numbers come from lib/obFeatures (the app's own dose math).
// Values and units are joined with a no-break space (A-134). Colours: theme tokens only; the protocol dots use the user protocol palette (lib/protocolColors,
// deliberately fixed in both themes, shown only as dots, DESIGN.md §2.4).
import { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useAnimatedProps, useAnimatedReaction, useDerivedValue, runOnJS, useReducedMotion } from 'react-native-reanimated';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';
import { formatTime } from '../lib/timeFormat';
import { MONTHS_SHORT } from '../lib/localeFormat';
import { paletteHex } from '../lib/protocolColors';
import { MONO, fontFamilyFor } from '../lib/fonts';
import SyringeScale from '../screens/components/SyringeScale';
import FeatureIcon from './FeatureIcon';
import CheckMark from './CheckMark';
import RowChevron from './RowChevron';
import { clamp01, eOutQuad, eInOutCubic } from './motion';
import { kf, eBack, useFxClock, demoDec, LiveText } from './previewFx';
import {
  FEATURE_KINDS as KINDS, SYRINGE_EXAMPLE, syringeUnits, BODY_EXAMPLE, halfLifeSteps, accumulation,
  LAB_EXAMPLE, LAB_MONTHS, PROTOCOL_EXAMPLE, REMINDER_EXAMPLE,
} from '../lib/obFeatures';

export const FEATURE_KINDS = KINDS;

const APath = Animated.createAnimatedComponent(Path);
const ALine = Animated.createAnimatedComponent(Line);
const ACircle = Animated.createAnimatedComponent(Circle);

const fill = (s, vars) => Object.keys(vars).reduce((out, k) => out.split(`{${k}}`).join(String(vars[k])), String(s));

// An element entering on the clock (fade + a short slide), in normal layout flow.
function In({ t, at, dur = 420, dx = 0, dy = 8, style, children, ...rest }) {
  const st = useAnimatedStyle(() => {
    const a = eOutQuad(kf(t.value, at, dur));
    return { opacity: t.value < at ? 0 : a, transform: [{ translateX: dx * (1 - a) }, { translateY: dy * (1 - a) }] };
  });
  return <Animated.View style={[style, st]} {...rest}>{children}</Animated.View>;
}

// A value typed in by itself, one character at a time (UI thread, no re-render per frame).
function TypedValue({ t, text, at, dur, style }) {
  const v = useDerivedValue(() => t.value);
  const len = text.length;
  const format = (tv) => { 'worklet'; return text.slice(0, Math.ceil(kf(tv, at, dur) * len)); };
  return <LiveText value={v} format={format} style={style} />;
}

function Tag({ s, label }) {
  return <View style={s.tag}><Text style={s.tagText}>{label}</Text></View>;
}

// ---- 1. Syringe (OB-2): the fields fill in, then the syringe fills to 50 units ----
function SyringeFeature({ c, s, t, language, inner }) {
  const DUR = 4400, FILL_AT = 2900, FILL_DUR = 1000;
  const clk = useFxClock(DUR);
  const reduce = useReducedMotion();
  const full = syringeUnits(); // 10 mg in 2 mL, 2,5 mg → 50 (lib/doseMath computeDraw)
  const [units, setUnits] = useState(reduce ? full : 0);
  useAnimatedReaction(
    () => Math.round(full * eInOutCubic(kf(clk.value, FILL_AT, FILL_DUR))),
    (u, prev) => { if (u !== prev) runOnJS(setUnits)(u); },
    [full],
  );
  const ex = SYRINGE_EXAMPLE;
  const rows = [
    [t('obf_syr_l_compound'), t('obf_ex_compound1')],
    [t('obf_syr_l_diluent'), `${t('obf_ex_diluent')} · ${demoDec(ex.water, language)}\u00A0mL`],
    [t('obf_syr_l_vial'), `${demoDec(ex.amount, language)}\u00A0${ex.unit}`],
    [t('obf_syr_l_dose'), `${demoDec(ex.dose, language)}\u00A0${ex.doseUnit}`],
  ];
  const label = `${t('paywall_hero_example')}: ${rows.map((r) => `${r[0]} ${r[1]}`).join(', ')}. ${full} ${t('obf_syr_units')}`;
  return (
    <View style={s.card} accessible accessibilityLabel={label}>
      <Tag s={s} label={t('paywall_hero_example')} />
      <View style={s.exRows}>
        {rows.map((r, i) => (
          <View key={i} style={s.exRow}>
            <Text style={s.exLabel} numberOfLines={1}>{r[0]}</Text>
            <TypedValue t={clk} text={r[1]} at={200 + i * 700} dur={450} style={s.exValue} />
          </View>
        ))}
      </View>
      <SyringeScale units={units} size={SYRINGE_EXAMPLE.syringeSize} width={inner} />
      <In t={clk} at={FILL_AT + FILL_DUR - 100} dur={400} dy={6} style={s.unitsRow}>
        <Text style={s.unitsNum}>{full}</Text>
        <Text style={s.unitsWord}>{t('obf_syr_units')}</Text>
      </In>
    </View>
  );
}

// ---- 2. Dose in the body (OB-3): one dose halves every half-life, then doses add up ----
function BodyFeature({ c, s, t, language, inner }) {
  const DUR = 7000;
  const clk = useFxClock(DUR);
  const name = t('obf_ex_compound1');
  const steps = halfLifeSteps();
  const stepKeys = [t('obf_body_step0'), t('obf_body_step1'), t('obf_body_step2'), t('obf_body_step3')];
  const amount = (mg) => `${demoDec(String(mg), language)}\u00A0${BODY_EXAMPLE.unit}`;
  const barW = inner;
  return (
    <>
      <View style={s.card}>
        <Tag s={s} label={t('paywall_hero_example')} />
        <Text style={s.exLabel}>{fill(t('obf_body_intro'), { name, days: BODY_EXAMPLE.halfLifeDays })}</Text>
        <View style={s.steps}>
          {steps.map((st, i) => (
            <In key={st.day} t={clk} at={300 + i * 700} dur={380} dy={6} style={s.step}>
              <View style={s.stepHead}>
                <Text style={s.stepDay}>{fill(t('obf_body_day'), { n: st.day })}</Text>
                <Text style={s.stepText}>{fill(stepKeys[i], { amount: amount(st.mg) })}</Text>
              </View>
              <View style={[s.track, { width: barW }]}>
                <HalfBar t={clk} at={300 + i * 700 + 150} w={barW} from={i === 0 ? 0 : steps[i - 1].frac} to={st.frac} c={c} />
              </View>
            </In>
          ))}
        </View>
      </View>
      <In t={clk} at={3300} dur={450}>
        <Text style={s.body}>{t('obf_body_adds')}</Text>
      </In>
      <In t={clk} at={3600} dur={400} style={s.card}>
        <AccumulationChart t={clk} at={3800} dur={2500} w={inner} c={c} />
        <View style={s.legend}>
          <View style={[s.legendDot, { backgroundColor: c.data }]} />
          <Text style={s.legendText}>{t('obf_body_legend')}</Text>
        </View>
        <Text style={s.foot}>{t('obf_body_foot')}</Text>
      </In>
    </>
  );
}

// A bar going from `from` to `to` of the track (the first grows in, the next ones halve).
function HalfBar({ t, at, w, from, to, c }) {
  const st = useAnimatedStyle(() => {
    const f = from + (to - from) * eInOutCubic(kf(t.value, at, 500));
    return { width: w * f };
  });
  return <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: c.data }, st]} />;
}

// Weekly doses of the same example, each added to what is left; the pen draws the line and every
// dose gets its mark (a dot on the baseline and a dashed tick) as the pen reaches it.
function AccumulationChart({ t, at, dur, w, c }) {
  const VW = 300, VH = 120, X0 = 14, X1 = 262, BASE = 104, TOP = 14;
  const G = useMemo(() => {
    const a = accumulation();
    const maxV = Math.max(...a.peaks);
    const X = (d) => X0 + (d / a.endDay) * (X1 - X0);
    const Y = (v) => BASE - (v / maxV) * (BASE - TOP);
    const xs = a.points.map((p) => X(p.day));
    const ys = a.points.map((p) => Y(p.mg));
    const cum = [0];
    for (let i = 1; i < xs.length; i++) cum.push(cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
    const L = cum[cum.length - 1];
    // the point right after each dose lands (the top of its jump)
    const marks = a.doseDays.map((d, i) => {
      const k = a.points.findIndex((p, j) => j > 0 && p.day === d && Math.abs(p.mg - a.peaks[i]) < 1e-6);
      return { x: X(d), y: Y(a.peaks[i]), at: cum[k] / L };
    });
    return { xs, ys, cum, L, marks, doseDays: a.doseDays };
  }, []);
  const h = (w * VH) / VW;
  const lineProps = useAnimatedProps(() => {
    const p = clamp01((t.value - at) / dur);
    if (p <= 0) return { d: 'M 0 0', opacity: 0 };
    const len = G.L * p;
    let d = 'M ' + G.xs[0].toFixed(1) + ' ' + G.ys[0].toFixed(1);
    let i = 1;
    for (; i < G.xs.length && G.cum[i] <= len; i++) d += ' L ' + G.xs[i].toFixed(1) + ' ' + G.ys[i].toFixed(1);
    if (i < G.xs.length) {
      const seg = G.cum[i] - G.cum[i - 1];
      const f = seg > 0 ? (len - G.cum[i - 1]) / seg : 0;
      d += ' L ' + (G.xs[i - 1] + (G.xs[i] - G.xs[i - 1]) * f).toFixed(1) + ' ' + (G.ys[i - 1] + (G.ys[i] - G.ys[i - 1]) * f).toFixed(1);
    }
    return { d, opacity: 1 };
  }, [G]);
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${VW} ${VH}`}>
      <Line x1={X0} y1={BASE} x2={290} y2={BASE} stroke={c.line} strokeWidth={1} />
      {G.doseDays.map((d, i) => <DoseMark key={d} t={t} at={at + dur * G.marks[i].at} m={G.marks[i]} base={BASE} c={c} />)}
      <APath animatedProps={lineProps} fill="none" stroke={c.data} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
function DoseMark({ t, at, m, base, c }) {
  const tick = useAnimatedProps(() => ({ opacity: t.value >= at ? 1 : 0 }));
  const dot = useAnimatedProps(() => ({ r: Math.max(0, 4 * eBack(kf(t.value, at - 120, 360))) }));
  return (
    <>
      <ALine animatedProps={tick} x1={m.x} y1={base} x2={m.x} y2={m.y - 2} stroke={c.tick} strokeWidth={1} strokeDasharray="3,3" />
      <ACircle animatedProps={dot} cx={m.x} cy={base} r={0} fill={c.data} />
    </>
  );
}

// ---- 3. Reminders (OB-4): two notifications arrive, Taken is tapped, the dose is logged ----
function RemindersFeature({ c, s, t, language, timeFormat }) {
  const DUR = 3200, TAP = 1900;
  const clk = useFxClock(DUR);
  const name1 = t('obf_ex_compound1'), name2 = t('obf_ex_supplement');
  const ex = REMINDER_EXAMPLE;
  const time = (v) => formatTime(v, language, timeFormat);
  const msg1 = fill(t('obf_rem_msg_time'), { name: name1, time: time(ex.first) });
  const msg2 = fill(t('obf_rem_msg'), { name: name2 });
  const done = fill(t('obf_rem_done'), { time: time(ex.logged) });
  const pressed = (tv) => { 'worklet'; return { opacity: tv >= TAP ? 1 : 0 }; };
  const pulse = useAnimatedStyle(() => {
    const k = kf(clk.value, TAP, 300);
    return { transform: [{ scale: clk.value < TAP || k >= 1 ? 1 : 1 - 0.08 * Math.sin(Math.PI * k) }] };
  });
  const pressedSt = useAnimatedStyle(() => pressed(clk.value));
  const note = (head, msg, first) => (
    <View style={s.notif}>
      <View style={s.notifHead}>
        <View style={s.appLogo}><FeatureIcon name="curve" size={18} color={c.onInk} /></View>
        <Text style={s.notifApp} numberOfLines={1}>{head}</Text>
      </View>
      <Text style={s.notifMsg}>{msg}</Text>
      <View style={s.notifBtns}>
        <Animated.View style={[s.notifBtn, first ? pulse : null]}>
          <Text style={s.notifBtnText} numberOfLines={1}>{t('obf_rem_taken')}</Text>
          {first ? (
            <Animated.View style={[StyleSheet.absoluteFill, s.notifBtnOn, pressedSt]}>
              <Text style={s.notifBtnTextOn} numberOfLines={1}>{t('obf_rem_taken')}</Text>
            </Animated.View>
          ) : null}
        </Animated.View>
        <View style={s.notifBtn}><Text style={s.notifBtnText} numberOfLines={1}>{t('obf_rem_snooze')}</Text></View>
      </View>
    </View>
  );
  const label = `${t('paywall_hero_example')}: ${msg1}. ${msg2}. ${done}`;
  return (
    <View style={s.stack} accessible accessibilityLabel={label}>
      <Tag s={s} label={t('paywall_hero_example')} />
      <In t={clk} at={200} dur={450} dy={-14}>{note(`DoseTrace · ${t('obf_rem_now')}`, msg1, true)}</In>
      <In t={clk} at={900} dur={450} dy={-14}>{note(`DoseTrace · ${time(ex.second)}`, msg2, false)}</In>
      <In t={clk} at={TAP + 500} dur={420} dy={6} style={s.doneChip}>
        <CheckMark size={18} color={c.ok} />
        <Text style={s.doneText}>{done}</Text>
      </In>
    </View>
  );
}

// ---- 4. Several protocols (OB-5): three example cards come in one by one ----
function ProtocolsFeature({ c, s, t, language, timeFormat }) {
  const DUR = 2400;
  const clk = useFxClock(DUR);
  const rows = PROTOCOL_EXAMPLE.map((p) => ({
    ...p,
    name: t(p.nameKey),
    line: fill(t(p.schedKey), { dose: p.doseKey ? t(p.doseKey) : `${demoDec(p.dose, language)}\u00A0${p.unit}`, time: formatTime(p.time, language, timeFormat) }),
  }));
  const label = `${t('paywall_hero_example')}: ${rows.map((r) => `${r.name}, ${r.line}`).join('. ')}`;
  return (
    <View style={s.stack} accessible accessibilityLabel={label}>
      {rows.map((p, i) => (
        <In key={p.nameKey} t={clk} at={200 + i * 450} dur={420} dx={-16} dy={0} style={s.protoRow}>
          <View style={[s.protoDot, { backgroundColor: paletteHex(p.dot) }]} />
          <View style={s.protoText}>
            <Text style={s.protoName} numberOfLines={1}>{p.name}</Text>
            <Text style={s.protoLine}>{p.line}</Text>
          </View>
          <RowChevron color={c.tick} />
        </In>
      ))}
      <In t={clk} at={1700} dur={400} dy={0}>
        <Tag s={s} label={t('paywall_hero_example')} />
      </In>
    </View>
  );
}

// ---- 5. Blood tests (OB-6): three general markers whose lines draw in ----
function LabsFeature({ c, s, t, language, inner }) {
  const DUR = 4200;
  const clk = useFxClock(DUR);
  return (
    <View style={s.stack}>
      {LAB_EXAMPLE.map((m, i) => {
        const name = t(m.nameKey);
        const label = `${name} (${m.unit}): ${m.values.map((v, k) => `${MONTHS_SHORT[language] ? MONTHS_SHORT[language][LAB_MONTHS[k]] : ''} ${v}`).join(', ')}`;
        return (
          <In key={m.key} t={clk} at={100 + i * 300} dur={400} style={s.labCard} accessible accessibilityLabel={label}>
            <View style={s.labHead}>
              <Text style={s.labName} numberOfLines={1}>{name}</Text>
              <Text style={s.labUnit}>{m.unit}</Text>
            </View>
            <LabChart t={clk} at={500 + i * 700} values={m.values} w={inner} c={c} s={s} language={language} />
          </In>
        );
      })}
      <Text style={s.foot}>{t('obf_lab_foot')}</Text>
    </View>
  );
}

// One marker: every point with its value over it and its month under it, in the one data colour;
// the y scale is the marker's own min..max, nothing drawn behind the line.
function LabChart({ t, at, values, w, c, s, language }) {
  const VW = 280, VH = 92, PX0 = 22, STEP = 59, YT = 22, YB = 66;
  const sc = w / VW;
  const lo = Math.min(...values), hi = Math.max(...values);
  const X = (k) => PX0 + k * STEP;
  const Y = (v) => (hi === lo ? (YT + YB) / 2 : YB - ((v - lo) / (hi - lo)) * (YB - YT));
  const SEG = 300;
  const months = MONTHS_SHORT[language] || MONTHS_SHORT.en;
  return (
    <View style={{ width: w, height: VH * sc }}>
      <Svg width={w} height={VH * sc} viewBox={`0 0 ${VW} ${VH}`}>
        {values.map((v, k) => (k > 0 ? <LabSegment key={`s${k}`} t={t} at={at + (k - 1) * SEG} dur={SEG} x0={X(k - 1)} y0={Y(values[k - 1])} x1={X(k)} y1={Y(v)} color={c.data} /> : null))}
        {values.map((v, k) => <LabPoint key={`p${k}`} t={t} at={at + k * SEG - 60} cx={X(k)} cy={Y(v)} color={c.data} />)}
      </Svg>
      {values.map((v, k) => (
        <In key={`v${k}`} t={t} at={at + k * SEG - 60} dur={260} dy={0} style={[s.labPt, { left: X(k) * sc - 30 }]}>
          <Text style={[s.labVal, { top: (Y(v) - 9) * sc - 14 }]}>{String(v)}</Text>
          <Text style={[s.labMonth, { top: 86 * sc - 12 }]}>{months[LAB_MONTHS[k]]}</Text>
        </In>
      ))}
    </View>
  );
}
function LabSegment({ t, at, dur, x0, y0, x1, y1, color }) {
  const props = useAnimatedProps(() => {
    const sp = eOutQuad(kf(t.value, at, dur));
    return { x2: x0 + (x1 - x0) * sp, y2: y0 + (y1 - y0) * sp, opacity: t.value > at ? 1 : 0 };
  });
  return <ALine animatedProps={props} x1={x0} y1={y0} x2={x0} y2={y0} stroke={color} strokeWidth={2.5} strokeLinecap="round" />;
}
function LabPoint({ t, at, cx, cy, color }) {
  const props = useAnimatedProps(() => ({ r: Math.max(0, 3.5 * eBack(kf(t.value, at, 360))) }));
  return <ACircle animatedProps={props} cx={cx} cy={cy} r={0} fill={color} />;
}
// ---- end labs

const SCREENS = {
  syringe: { titleKey: 'obf_syr_title', subKey: 'obf_syr_sub', Fx: SyringeFeature },
  body: { titleKey: 'obf_body_title', subKey: 'obf_body_sub', Fx: BodyFeature },
  reminders: { titleKey: 'obf_rem_title', subKey: 'obf_rem_sub', Fx: RemindersFeature },
  protocols: { titleKey: 'obf_pro_title', subKey: 'obf_pro_sub', Fx: ProtocolsFeature },
  labs: { titleKey: 'obf_lab_title', subKey: 'obf_lab_sub', Fx: LabsFeature },
};

// One feature screen's content: title, sentence, the animated example and its note. `width` is the
// content width the flow gives it (the screen minus its side padding). The example restarts each
// time the screen mounts (and when the language changes).
export default function OnboardingFeature({ kind, width }) {
  const { colors: c } = useTheme();
  const { t, language, timeFormat } = useLanguage();
  const s = useMemo(() => makeStyles(c), [c]);
  const screen = SCREENS[kind];
  if (!screen) return null;
  const w = Math.max(240, Number(width) || 342);
  const inner = w - 32; // inside a card (16 each side)
  const { Fx } = screen;
  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.title} accessibilityRole="header">{t(screen.titleKey)}</Text>
        <Text style={s.sub}>{t(screen.subKey)}</Text>
      </View>
      <Fx key={`${kind}-${language}`} c={c} s={s} t={t} language={language} timeFormat={timeFormat} inner={inner} />
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  wrap: { gap: 16 },
  head: { gap: 8 },
  // the onboarding step head (screens/OnboardingFlowScreen.js makeStyles title / sub)
  title: { fontSize: 30, lineHeight: 36, fontWeight: '600', color: c.ink, letterSpacing: -0.6 },
  sub: { fontSize: 17, lineHeight: 22, color: c.ink2 },
  body: { fontSize: 15, lineHeight: 20, color: c.ink },
  foot: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  stack: { gap: 10 },
  card: { backgroundColor: c.raised, borderRadius: 20, padding: 16, gap: 10 },
  tag: { alignSelf: 'flex-start', minHeight: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
  tagText: { fontSize: 12, fontWeight: '600', color: c.ink2 },
  // syringe
  exRows: { gap: 8 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 22 },
  exLabel: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  exValue: { flex: 1, height: 22, fontSize: 16, lineHeight: 22, color: c.ink, textAlign: 'right', fontFamily: fontFamilyFor('600') },
  unitsRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 },
  unitsNum: { fontSize: 40, lineHeight: 46, fontWeight: '300', color: c.data, fontVariant: ['tabular-nums'] },
  unitsWord: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  // dose in body
  steps: { gap: 10 },
  step: { gap: 5 },
  stepHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  stepDay: { width: 66, fontSize: 13, lineHeight: 18, color: c.ink2, fontVariant: ['tabular-nums'] },
  stepText: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: c.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: c.well, overflow: 'hidden' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, lineHeight: 16, color: c.ink2 },
  // reminders
  notif: { backgroundColor: c.raised, borderRadius: 18, padding: 12, gap: 6 },
  notifHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appLogo: { width: 28, height: 28, borderRadius: 8, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' },
  notifApp: { flex: 1, fontSize: 13, lineHeight: 18, color: c.ink2 },
  notifMsg: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: c.ink },
  notifBtns: { flexDirection: 'row', gap: 8, marginTop: 2 },
  notifBtn: { flex: 1, minHeight: 36, borderRadius: 10, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, overflow: 'hidden' },
  notifBtnOn: { borderRadius: 10, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  notifBtnText: { fontSize: 15, fontWeight: '600', color: c.ink },
  notifBtnTextOn: { fontSize: 15, fontWeight: '600', color: c.onAct },
  doneChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, borderRadius: 18, paddingHorizontal: 12, backgroundColor: c.well },
  doneText: { fontSize: 15, lineHeight: 20, color: c.ink },
  // protocols
  protoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.raised, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 },
  protoDot: { width: 12, height: 12, borderRadius: 6 },
  protoText: { flex: 1, gap: 2 },
  protoName: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  protoLine: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  // labs
  labCard: { backgroundColor: c.raised, borderRadius: 18, padding: 16, paddingBottom: 10, gap: 4 },
  labHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  labName: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  labUnit: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  labPt: { position: 'absolute', top: 0, bottom: 0, width: 60 },
  labVal: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 12, lineHeight: 15, fontFamily: MONO['500'], color: c.ink, fontVariant: ['tabular-nums'] },
  labMonth: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 11.5, lineHeight: 14, color: c.ink2 },
});
