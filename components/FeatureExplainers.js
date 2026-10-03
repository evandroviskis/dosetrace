// The free-feature explainers (Today redesign part 18; approved 2026-09-30 as V26 / handoff
// item 28): one short animation per free feature — reconstitution calculator, vial tracker,
// reminders, site rotation, dose log + streak, energy + protein, lab journal, dose notes —
// ported 1:1 from docs/design/prototype.html (FX.A.recon … FX.A.notes, explainerSheet()).
// Every number is an EXAMPLE (never the user's data, never a promised result). Engine:
// components/previewFx.js (one UI-thread clock; Reduce Motion shows the last frame).
// Theme tokens only; the body image marks use the fixed light figure palette (the image is a
// fixed light surface in both themes, as in the site picker).
import { Fragment, useEffect, useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet, Modal, ScrollView, TouchableOpacity, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown, useAnimatedProps, useDerivedValue } from 'react-native-reanimated';
import Svg, { Line, Circle, Path, Ellipse } from 'react-native-svg';
import { LIGHT, useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';
import { formatDate } from '../lib/localeFormat';
import { getCachedUser } from '../lib/supabase';
import { formatTime } from '../lib/timeFormat';
import { paletteHex } from '../lib/protocolColors';
import { figureSex, figurePoints, IMG_W, IMG_H } from '../lib/bodySites';
import { getSiteById } from '../lib/injectionSites';
import { EXPLAINERS } from '../lib/featureExplainers';
import { CrossMark } from './CheckMark';
import { clamp01, eInOutCubic } from './motion';
import { MONO } from '../lib/fonts';
import {
  FX_W, eBack, kf, groupNum, numGroup, useFxClock, FxCanvas, Box, Anim, Bar, Rect, T, Count, Typed, OkMark, LiveText, fmtDate,
} from './previewFx';

const ACircle = Animated.createAnimatedComponent(Circle);
const BODY = { male: require('../assets/body/m_front.png'), female: require('../assets/body/f_front.png') };
const FIG = { ink: LIGHT.ink, sel: LIGHT.data }; // marks on the fixed light body image
const H = 250;

// A word that changes with the clock (step values, e.g. "7 doses left" → "6 doses left").
function StepText({ t, format, x, y, size = 12, weight = '400', color, mono = false, anchor = 'start', width = 300 }) {
  const v = useDerivedValue(() => t.value);
  const lh = Math.round(size * 1.25);
  const top = y - size * 1.02 - (lh - size * 1.2) / 2;
  const pos = anchor === 'end' ? { left: x - width, width, textAlign: 'right' }
    : anchor === 'middle' ? { left: x - width / 2, width, textAlign: 'center' } : { left: x, width, textAlign: 'left' };
  const font = mono ? { fontFamily: MONO[Number(weight) >= 500 ? '500' : '400'] } : { fontWeight: weight };
  return <LiveText value={v} format={format} style={[{ position: 'absolute', top, height: lh, fontSize: size, color, fontVariant: ['tabular-nums'] }, font, pos]} />;
}

// The small white check of the prototype (tick()).
function Tick({ x, y, s = 1, color }) {
  return (
    <Svg width={FX_W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
      <Path d={`M${x - 5 * s} ${y} l${3.5 * s} ${3.5 * s} l${6.5 * s} ${-7 * s}`} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const fade = (at, dur) => (tv) => { 'worklet'; return { opacity: clamp01((tv - at) / dur) }; };

/* ---- Reconstitution calculator: vial + water + dose in, the draw on the syringe out ---- */
// 5 mg in 2 ml = 2.5 mg/ml; 500 mcg = 0.2 ml = 20 units.
function ReconFx({ c, t: tr, width, label }) {
  const { language } = useLanguage();
  const dec = language === 'en' ? '.' : ','; // the app language's decimal, for the UI-thread number
  const DUR = 6000;
  const t = useFxClock(DUR);
  const F = [[tr('xp_recon_vial'), '5 mg', 200], [tr('xp_recon_water'), '2 ml', 800], [tr('protocols_dose_label'), '500 mcg', 1400]];
  const x0 = 22, W = 290, sy = 150, X = (u) => x0 + (u / 100) * W;
  const ticks = [];
  for (let u = 2; u < 100; u += 2) ticks.push(u);
  const units = (v) => { 'worklet'; return String(Math.round(v)); };
  const ml = (v) => { 'worklet'; return (v / 100).toFixed(2).replace('.', dec) + ' ml'; };
  const stopper = (tv) => { 'worklet'; return { transform: [{ translateX: 58 * eInOutCubic(kf(tv, 2300, 1300)) }] }; };
  const inFill = (u) => (tv) => { 'worklet'; return { opacity: 20 * eInOutCubic(kf(tv, 2300, 1300)) > u ? 1 : 0 }; };
  return (
    <FxCanvas width={width} h={H} label={label}>
      {F.map((f, i) => {
        const y = 8 + i * 42;
        return (
          <Box key={i} t={t} at={f[2] - 200} dur={250} ease="lin">
            <T x={4} y={y + 12} size={11} color={c.ink2} width={150}>{f[0]}</T>
            <Rect x={4} y={y + 17} w={150} h={22} r={8} fill={c.well} />
            <Typed t={t} text={f[1]} at={f[2]} dur={450} caretUntil={f[2] + 600} x={12} top={y + 19} size={13} color={c.ink} mono width={136} />
          </Box>
        );
      })}
      <Box t={t} at={2200} dur={300} ease="lin">
        <T x={180} y={22} size={11} color={c.ink2} width={140}>{tr('protocols_syringe_draw_to')}</T>
        <Count t={t} at={2300} dur={1300} to={20} format={units} x={180} y={62} size={38} weight="500" color={c.ink} width={50} />
        <T x={230} y={62} size={12} color={c.ink2} mono width={90}>{tr('protocols_syringe_units')}</T>
        <Count t={t} at={2300} dur={1300} to={20} format={ml} x={180} y={84} size={12} color={c.ink2} width={100} />
      </Box>
      <Svg width={FX_W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        <Line x1={4} x2={x0} y1={sy + 15} y2={sy + 15} stroke={c.ink2} strokeWidth={1.6} />
      </Svg>
      <Rect x={x0} y={sy} w={W} h={30} r={6} fill={c.raised} stroke={c.tick} />
      <Bar t={t} at={2300} dur={1300} x={x0 + 1} y={sy + 1} w={58} h={28} r={5} color={c.data} />
      <Svg width={FX_W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        {ticks.map((u) => {
          const lg = u % 10 === 0;
          return <Line key={u} x1={X(u)} x2={X(u)} y1={sy + 1} y2={sy + (lg ? 15 : 9)} stroke={c.tick} strokeWidth={lg ? 1.4 : 0.8} />;
        })}
      </Svg>
      {ticks.filter((u) => u < 20).map((u) => {
        const lg = u % 10 === 0;
        return (
          <Anim key={`d${u}`} t={t} fx={inFill(u)} style={{ left: X(u) - (lg ? 0.7 : 0.4), top: sy + 1, width: lg ? 1.4 : 0.8, height: lg ? 14 : 8, backgroundColor: c.onData }} />
        );
      })}
      {Array.from({ length: 11 }, (_, i) => i * 10).map((L) => (
        <T key={`n${L}`} x={X(L)} y={sy + 46} size={9} color={c.ink2} mono anchor="middle" width={30}>{String(L)}</T>
      ))}
      <Anim t={t} fx={stopper} style={{ left: X(0) - 2, top: sy - 5, width: 5, height: 40, borderRadius: 2, backgroundColor: c.ink }} />
      <Anim t={t} fx={fade(4200, 400)} style={{ left: 0, top: 0, width: FX_W, height: H }}>
        <T x={163} y={240} size={11.5} color={c.ink2} anchor="middle" width={318}>{tr('xp_recon_foot')}</T>
      </Anim>
    </FxCanvas>
  );
}

/* ---- Vial tracker: each logged dose comes off the vial; a warning before it runs out ---- */
function VialFx({ c, t: tr, width, label, language }) {
  const DUR = 6200;
  const t = useFxClock(DUR);
  const name = 'BPC-157';
  const gone = (i) => (tv) => {
    'worklet';
    const at = 700 + i * 430;
    const on = tv > at;
    const pop = on && tv < at + 250 ? 1 - clamp01((tv - at) / 250) : 0;
    return { opacity: on ? 1 : 0, transform: [{ translateY: -4 * pop }] };
  };
  const leftText = tr('xp_vial_left');
  const leftFmt = (tv) => {
    'worklet';
    let used = 0;
    for (let j = 0; j < 7; j++) if (tv > 700 + j * 430) used++;
    const left = 10 - used;
    return leftText.replace('{n}', String(left)).replace('{d}', String(left));
  };
  const mixed = `${tr('today_vial_mixed')} ${fmtDate(language, 2026, 8, 27, false)}`;
  return (
    <FxCanvas width={width} h={H} label={label}>
      <T x={4} y={18} size={13} weight="700" color={c.ink} width={200}>{tr('xp_vial_head').replace('{name}', name).replace('{n}', '1')}</T>
      <T x={322} y={18} size={11} color={c.ink2} anchor="end" width={140}>{mixed}</T>
      {Array.from({ length: 10 }, (_, i) => (
        <Fragment key={i}>
          <Rect x={4 + i * 32} y={32} w={28} h={40} r={7} fill={c.data} />
          {i < 7 && (
            <Anim t={t} fx={gone(i)} style={{ left: 4 + i * 32, top: 32, width: 28, height: 40, borderRadius: 7, backgroundColor: c.well, borderWidth: 1, borderColor: c.line }} />
          )}
        </Fragment>
      ))}
      <StepText t={t} format={leftFmt} x={4} y={98} size={13} color={c.ink} mono width={318} />
      <Box t={t} at={3800} dur={450} dx={24}>
        <Rect x={4} y={118} w={318} h={50} r={14} fill={c.well} />
        <View style={{ position: 'absolute', left: 17, top: 138, width: 10, height: 10, borderRadius: 5, backgroundColor: c.attention }} />
        <T x={36} y={139} size={12.5} weight="700" color={c.ink} width={280}>{tr('today_alert_supply_title')}</T>
        <T x={36} y={156} size={11} color={c.ink2} width={280}>{tr('xp_vial_low').replace('{name}', name).replace('{n}', '3')}</T>
      </Box>
      <Anim t={t} fx={fade(4800, 400)} style={{ left: 0, top: 0, width: FX_W, height: H }}>
        <T x={4} y={200} size={12} color={c.ink2} width={318}>{tr('xp_vial_foot')}</T>
        <Rect x={4} y={212} w={94} h={30} r={15} stroke={c.ink} sw={1.4} />
        <T x={51} y={232} size={12} weight="600" color={c.ink} anchor="middle" width={90}>{tr('today_add_vial')}</T>
      </Anim>
    </FxCanvas>
  );
}

/* ---- Reminders: the notification arrives, "Mark taken" logs the dose from it ---- */
function RemindFx({ c, t: tr, width, label, language, timeFormat }) {
  const DUR = 6000;
  const t = useFxClock(DUR);
  let dateLine = '';
  dateLine = formatDate(new Date(2026, 8, 28, 12), language, 'weekdayLong');
  const time = formatTime('19:20', language, timeFormat);
  const note = (tv) => {
    'worklet';
    const dn = eBack(kf(tv, 400, 550));
    const out = eInOutCubic(kf(tv, 3300, 350));
    return { opacity: tv < 400 ? 0 : clamp01(dn * 1.5) * (1 - out), transform: [{ translateY: (1 - dn) * -60 - out * 20 }] };
  };
  const acts = (tv) => { 'worklet'; return { opacity: tv < 1600 ? 0 : clamp01(eBack(kf(tv, 1600, 450)) * 1.5) }; };
  const tap = (tv) => {
    'worklet';
    const tp = kf(tv, 2700, 500);
    const r = 6 + 26 * tp;
    return { opacity: tp > 0 && tp < 1 ? 0.45 * (1 - tp) : 0, width: r * 2, height: r * 2, borderRadius: r, transform: [{ translateX: -r }, { translateY: -r }] };
  };
  const y = 72;
  return (
    <FxCanvas width={width} h={H} label={label}>
      <T x={163} y={40} size={34} weight="300" color={c.ink} anchor="middle" width={200}>7:20</T>
      <T x={163} y={58} size={11} color={c.ink2} anchor="middle" width={300}>{dateLine}</T>
      <Anim t={t} fx={note} style={{ left: 0, top: 0, width: FX_W, height: H }}>
        <Rect x={10} y={y} w={306} h={70} r={16} fill={c.well} />
        <View style={{ position: 'absolute', left: 22, top: y + 12, width: 24, height: 24, borderRadius: 6, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={12} height={14} viewBox="-6 -8 12 14"><Path d="M0 -7c-3 4-5 6.5-5 9a5 5 0 0 0 10 0c0-2.5-2-5-5-9z" fill={c.onAct} /></Svg>
        </View>
        <T x={56} y={y + 22} size={9} weight="700" color={c.ink2} width={200}>DOSETRACE</T>
        <T x={304} y={y + 22} size={9} color={c.ink2} anchor="end" width={80}>{tr('xp_remind_now')}</T>
        <T x={56} y={y + 40} size={13} weight="700" color={c.ink} width={250}>BPC-157 · 0.5 mg</T>
        <T x={56} y={y + 57} size={11.5} color={c.ink2} width={250}>{tr('xp_remind_msg')}</T>
        <Anim t={t} fx={acts} style={{ left: 0, top: 0, width: FX_W, height: H }}>
          <Rect x={10} y={y + 80} w={150} h={38} r={12} fill={c.act} />
          <T x={85} y={y + 104} size={13} weight="700" color={c.onAct} anchor="middle" width={140}>{tr('today_mark_taken')}</T>
          <Rect x={166} y={y + 80} w={150} h={38} r={12} fill={c.well} />
          <T x={241} y={y + 104} size={13} weight="600" color={c.ink} anchor="middle" width={140}>{tr('xp_remind_snooze')}</T>
          <Anim t={t} fx={tap} style={{ left: 85, top: y + 99, backgroundColor: c.onAct }} />
        </Anim>
      </Anim>
      <OkMark t={t} at={3500} cx={24} cy={112} c={c} />
      <Box t={t} at={3500} dur={450}>
        <T x={44} y={117} size={13} weight="600" color={c.ink} width={278}>{tr('xp_remind_taken').replace('{name}', 'BPC-157').replace('{time}', time)}</T>
      </Box>
      <Anim t={t} fx={fade(3900, 400)} style={{ left: 0, top: 0, width: FX_W, height: H }}>
        <T x={4} y={150} size={11.5} color={c.ink2} width={318}>{tr('xp_remind_foot')}</T>
      </Anim>
    </FxCanvas>
  );
}

/* ---- Site rotation: a week of sites on the user's body image, then the longest unused ---- */
const W7 = [['today_mon', 'abdomen_lr'], ['today_tue', 'abdomen_ll'], ['today_wed', 'thigh_f_r'], ['today_thu', 'abdomen_ur'], ['today_fri', 'abdomen_ul'], ['today_sat', 'thigh_f_l']];
function SitesFx({ t: tr, c, width, label }) {
  const DUR = 6400;
  const t = useFxClock(DUR);
  const [sex, setSex] = useState('male');
  useEffect(() => {
    let live = true;
    getCachedUser().then((u) => { if (live) setSex(figureSex(u?.user_metadata)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const figW = IMG_W * 0.22, figH = IMG_H * 0.22, oy = 2;
  const pts = {};
  for (const p of figurePoints(sex, 'front', 'subq', figW)) pts[p.id] = p;
  const dot = (i) => (tv) => {
    'worklet';
    const at = 400 + i * 560;
    const a = eBack(kf(tv, at, 420));
    const latest = tv < at + 560 || i === W7.length - 1;
    return { opacity: tv < at ? 0 : latest ? 1 : 0.5, transform: [{ scale: Math.max(0, a) }] };
  };
  const bold = (i, on) => (tv) => {
    'worklet';
    const at = 400 + i * 560;
    const latest = tv < at + 560 || i === W7.length - 1;
    return { opacity: tv < at ? 0 : (latest === on ? clamp01(eBack(kf(tv, at, 420)) * 1.5) : 0) };
  };
  const ring = pts.abdomen_lr;
  const longest = tr('bodymap_longest_in_log').replace(/[:：]\s*$/, '');
  return (
    <FxCanvas width={width} h={H} label={label}>
      <Image source={BODY[sex] || BODY.male} style={{ position: 'absolute', left: 0, top: oy, width: figW, height: figH }} resizeMode="contain" accessible={false} />
      {W7.map(([dayKey, id], i) => {
        const p = pts[id];
        const ry = 12 + i * 28;
        const site = getSiteById(id);
        return (
          <Fragment key={id}>
            {p && <Anim t={t} fx={dot(i)} style={{ left: p.x - 5.5, top: oy + p.y - 5.5, width: 11, height: 11, borderRadius: 5.5, backgroundColor: FIG.sel }} />}
            <Anim t={t} fx={bold(i, false)} style={{ left: 0, top: 0, width: FX_W, height: H }}>
              <T x={172} y={ry + 12} size={11} color={c.ink2} mono width={30}>{tr(dayKey)}</T>
              <T x={202} y={ry + 12} size={11} color={c.ink} width={122}>{site ? tr(site.labelKey) : id}</T>
            </Anim>
            <Anim t={t} fx={bold(i, true)} style={{ left: 0, top: 0, width: FX_W, height: H }}>
              <T x={172} y={ry + 12} size={11} color={c.ink2} mono width={30}>{tr(dayKey)}</T>
              <T x={202} y={ry + 12} size={11} weight="700" color={c.ink} width={122}>{site ? tr(site.labelKey) : id}</T>
            </Anim>
          </Fragment>
        );
      })}
      <Anim t={t} fx={fade(4000, 450)} style={{ left: 0, top: 0, width: FX_W, height: H }}>
        {ring && (
          <Svg width={FX_W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
            <Ellipse cx={ring.x} cy={oy + ring.y} rx={9} ry={8} fill="none" stroke={FIG.ink} strokeWidth={1.2} strokeDasharray="3,2.4" />
          </Svg>
        )}
        <T x={172} y={196} size={11} color={c.ink2} width={152}>{longest}</T>
        <T x={172} y={214} size={13} weight="700" color={c.ink} width={152}>{tr('site_abdomen_lower_right')}</T>
        <T x={172} y={231} size={11} color={c.ink2} width={152}>{tr('xp_sites_ago').replace('{n}', '6')}</T>
      </Anim>
    </FxCanvas>
  );
}

/* ---- Dose log and streak: a week fills, the streak and the ring count with it ---- */
const WEEK = ['today_mon', 'today_tue', 'today_wed', 'today_thu', 'today_fri', 'today_sat', 'today_sun'];
function LogFx({ c, t: tr, width, label }) {
  const DUR = 5600;
  const t = useFxClock(DUR);
  const R2 = 42, C = 2 * Math.PI * R2;
  const count = (tv) => { 'worklet'; let n = 0; for (let i = 0; i < 7; i++) if (tv > 300 + i * 420) n++; return n; };
  const fill = (i) => (tv) => { 'worklet'; const a = eBack(kf(tv, 300 + i * 420, 380)); return { opacity: tv > 300 + i * 420 ? 1 : 0, transform: [{ scale: Math.max(0, a) }] }; };
  const check = (i) => (tv) => { 'worklet'; return { opacity: eBack(kf(tv, 300 + i * 420, 380)) > 0.6 ? 1 : 0 }; };
  const one = tr('today_streak_day'), many = tr('today_streak_days'), ofText = tr('vials_count_of');
  const nFmt = (tv) => { 'worklet'; return String(count(tv)); };
  const wordFmt = (tv) => { 'worklet'; return count(tv) === 1 ? one : many; };
  const ofFmt = (tv) => { 'worklet'; return ofText.replace('{x}', String(count(tv))).replace('{y}', '7'); };
  const arc = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - count(t.value) / 7) }));
  return (
    <FxCanvas width={width} h={H} label={label}>
      {WEEK.map((k, i) => {
        const cx = 26 + i * 45;
        return (
          <Fragment key={k}>
            <View style={{ position: 'absolute', left: cx - 16, top: 18, width: 32, height: 32, borderRadius: 16, backgroundColor: c.well }} />
            <Anim t={t} fx={fill(i)} style={{ left: cx - 16, top: 18, width: 32, height: 32, borderRadius: 16, backgroundColor: c.data }} />
            <Anim t={t} fx={check(i)} style={{ left: 0, top: 0, width: FX_W, height: H }}>
              <Tick x={cx} y={34} color={c.onData} />
            </Anim>
            <T x={cx} y={68} size={11} color={c.ink2} anchor="middle" width={40}>{String(tr(k)).charAt(0)}</T>
          </Fragment>
        );
      })}
      <T x={4} y={112} size={11} color={c.ink2} width={150}>{tr('today_share_streak')}</T>
      <StepText t={t} format={nFmt} x={4} y={160} size={44} weight="500" color={c.ink} mono width={120} />
      <StepText t={t} format={wordFmt} x={4} y={182} size={12} color={c.ink2} width={190} />
      <Svg width={FX_W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        <Circle cx={250} cy={148} r={R2} fill="none" stroke={c.well} strokeWidth={10} />
        <ACircle cx={250} cy={148} r={R2} fill="none" stroke={c.data} strokeWidth={10} strokeLinecap="round" strokeDasharray={`${C} ${C}`} animatedProps={arc} transform="rotate(-90 250 148)" />
      </Svg>
      <StepText t={t} format={ofFmt} x={250} y={153} size={14} weight="500" color={c.ink} mono anchor="middle" width={80} />
      <T x={250} y={208} size={11} color={c.ink2} anchor="middle" width={140}>{tr('xp_log_week')}</T>
      <Anim t={t} fx={fade(3700, 400)} style={{ left: 0, top: 0, width: FX_W, height: H }}>
        <T x={163} y={240} size={11.5} color={c.ink2} anchor="middle" width={318}>{tr('xp_log_foot')}</T>
      </Anim>
    </FxCanvas>
  );
}

/* ---- Energy & protein: your numbers in, standard-formula estimates out ---- */
// Mifflin-St Jeor: 84 kg, 180 cm, 38 y, male = 1,780; x1.55 = ~2,760; 1.6–2.0 g/kg = 134–168 g.
function EnergyFx({ c, t: tr, width, label }) {
  const { language } = useLanguage();
  const { sep, min } = numGroup(language);
  const DUR = 6000;
  const t = useFxClock(DUR);
  const IN = ['84 kg', '180 cm', tr('xp_energy_years').replace('{n}', '38'), tr('xp_energy_active')];
  const chips = [];
  let x = 4, cy = 6;
  IN.forEach((s) => { const w = s.length * 6.4 + 22; if (x + w > 322) { x = 4; cy += 32; } chips.push({ s, x, y: cy, w }); x += w + 6; });
  const kcal = tr('cal_kcal'), perDay = tr('xp_energy_per_day');
  const R = [[tr('xp_energy_bmr'), 1780, 0.64], [tr('xp_energy_tdee'), 2760, 1], [tr('cal_protein'), 0, 0.5]];
  return (
    <FxCanvas width={width} h={H} label={label}>
      {chips.map((ch, i) => (
        <Box key={i} t={t} at={150 + i * 260} dur={380}>
          <Rect x={ch.x} y={ch.y} w={ch.w} h={26} r={13} fill={c.well} />
          <T x={ch.x + ch.w / 2} y={ch.y + 17} size={11.5} color={c.ink} anchor="middle" width={ch.w}>{ch.s}</T>
        </Box>
      ))}
      {R.map((r, i) => {
        const at = 1500 + i * 700, y = 80 + i * 50;
        const fmt = i === 2
          ? (v) => { 'worklet'; return groupNum(134 * v, sep, min) + '–' + groupNum(168 * v, sep, min) + ' ' + perDay; }
          : (v) => { 'worklet'; return groupNum(v, sep, min) + ' ' + kcal; };
        return (
          <Anim key={i} t={t} fx={fade(at - 150, 300)} style={{ left: 0, top: 0, width: FX_W, height: H }}>
            <T x={4} y={y + 12} size={12} color={c.ink2} width={180}>{r[0]}</T>
            <Count t={t} at={at} dur={900} to={i === 2 ? 1 : r[1]} format={fmt} x={322} y={y + 12} size={15} weight="500" color={c.ink} anchor="end" width={150} />
            <Rect x={4} y={y + 22} w={318} h={6} r={3} fill={c.well} />
            <Bar t={t} at={at} dur={900} x={4} y={y + 22} w={318} h={6} r={3} color={c.data} frac={r[2]} />
          </Anim>
        );
      })}
      <Anim t={t} fx={fade(4200, 400)} style={{ left: 0, top: 0, width: FX_W, height: H }}>
        <T x={163} y={240} size={11} color={c.ink2} anchor="middle" width={318}>{tr('xp_energy_foot')}</T>
      </Anim>
    </FxCanvas>
  );
}

/* ---- Lab journal (typed): values from any report, kept together by date ---- */
function LabsmanFx({ c, t: tr, width, label, language }) {
  const DUR = 5800;
  const t = useFxClock(DUR);
  const marker = tr('xp_labs_marker');
  const F = [[tr('export_col_marker'), marker, 200], [tr('export_col_value'), '24 ng/mL', 800], [tr('export_col_date'), fmtDate(language, 2026, 2, 2), 1300]];
  const form = (tv) => { 'worklet'; return { opacity: 1 - 0.55 * eInOutCubic(kf(tv, 2300, 400)) }; };
  const ROWS = [['24 ng/mL', fmtDate(language, 2026, 2, 2, false), 2300], ['31 ng/mL', fmtDate(language, 2026, 5, 8, false), 3000], ['38 ng/mL', fmtDate(language, 2026, 8, 14, false), 3600]];
  return (
    <FxCanvas width={width} h={H} label={label}>
      <Anim t={t} fx={form} style={{ left: 0, top: 0, width: FX_W, height: H }}>
        <Rect x={4} y={4} w={318} h={92} r={14} fill={c.well} />
        {F.map((f, i) => {
          const y = 22 + i * 26;
          return (
            <Fragment key={i}>
              <T x={16} y={y} size={11} color={c.ink2} width={78}>{f[0]}</T>
              <Typed t={t} text={f[1]} at={f[2]} dur={420} caretUntil={f[2] + 520} x={96} top={y - 13} size={12.5} color={c.ink} mono width={150} />
            </Fragment>
          );
        })}
        <Box t={t} at={1800} dur={350}>
          <Rect x={248} y={62} w={64} h={26} r={13} fill={c.act} />
          <T x={280} y={79} size={12} weight="700" color={c.onAct} anchor="middle" width={60}>{tr('save')}</T>
        </Box>
      </Anim>
      {ROWS.map((r, i) => {
        const y = 108 + i * 38;
        return (
          <Box key={i} t={t} at={r[2]} dur={420} dy={10}>
            <Rect x={4} y={y} w={318} h={32} r={10} fill={c.raised} stroke={c.line} />
            <T x={16} y={y + 21} size={12} weight="600" color={c.ink} width={120}>{marker}</T>
            <T x={220} y={y + 21} size={12} color={c.ink} mono anchor="end" width={90}>{r[0]}</T>
            <T x={310} y={y + 21} size={11} color={c.ink2} anchor="end" width={80}>{r[1]}</T>
          </Box>
        );
      })}
      <Anim t={t} fx={fade(4300, 400)} style={{ left: 0, top: 0, width: FX_W, height: H }}>
        <T x={163} y={242} size={11} color={c.ink2} anchor="middle" width={318}>{tr('xp_labs_foot')}</T>
      </Anim>
    </FxCanvas>
  );
}

/* ---- Dose notes: a note written when logging, found again in the dose log ---- */
function NotesFx({ c, t: tr, width, label, language, timeFormat }) {
  const DUR = 5800;
  const t = useFxClock(DUR);
  const note = tr('xp_notes_text');
  const t742 = formatTime('19:42', language, timeFormat), t720 = formatTime('19:20', language, timeFormat);
  const scene1 = (tv) => { 'worklet'; const mv = eInOutCubic(kf(tv, 2900, 500)); return { opacity: 1 - mv, transform: [{ translateY: -20 * mv }] }; };
  const day = (d) => {
    return formatDate(new Date(2026, 8, d, 12), language, 'weekdayDayMonth');
  };
  return (
    <FxCanvas width={width} h={H} label={label}>
      <Anim t={t} fx={scene1} style={{ left: 0, top: 0, width: FX_W, height: H }}>
        <Rect x={4} y={6} w={318} h={40} r={12} fill={c.well} />
        <View style={{ position: 'absolute', left: 15, top: 21, width: 10, height: 10, borderRadius: 5, backgroundColor: paletteHex('forest') }} />
        <T x={32} y={30} size={12.5} weight="700" color={c.ink} width={150}>TB-500 · 0.5 mg</T>
        <T x={310} y={30} size={11} color={c.ink2} anchor="end" width={130}>{tr('xp_notes_taken').replace('{time}', t742)}</T>
        <T x={4} y={68} size={11} color={c.ink2} width={200}>{tr('xp_notes_label')}</T>
        <Rect x={4} y={76} w={318} h={44} r={12} fill={c.raised} stroke={c.line} />
        <Typed t={t} text={note} at={400} dur={1700} caretUntil={2400} x={14} top={89} size={12.5} color={c.ink} width={300} />
        <Box t={t} at={2300} dur={350}>
          <Rect x={248} y={130} w={74} h={28} r={14} fill={c.act} />
          <T x={285} y={148} size={12} weight="700" color={c.onAct} anchor="middle" width={70}>{tr('save')}</T>
        </Box>
      </Anim>
      <Box t={t} at={3100} dur={450}>
        <T x={4} y={22} size={13} weight="700" color={c.ink} width={200}>{tr('log_title')}</T>
        <T x={4} y={46} size={11} weight="600" color={c.ink2} width={200}>{day(28)}</T>
        <Rect x={4} y={54} w={318} h={58} r={12} fill={c.well} />
        <T x={16} y={76} size={12.5} weight="700" color={c.ink} width={150}>TB-500</T>
        <T x={310} y={76} size={11} color={c.ink2} mono anchor="end" width={90}>{t742}</T>
        <T x={16} y={97} size={11.5} color={c.ink2} width={296}>{`“${note}”`}</T>
        <T x={4} y={136} size={11} weight="600" color={c.ink2} width={200}>{day(27)}</T>
        <Rect x={4} y={144} w={318} h={40} r={12} fill={c.well} />
        <T x={16} y={168} size={12.5} weight="700" color={c.ink} width={150}>BPC-157</T>
        <T x={310} y={168} size={11} color={c.ink2} mono anchor="end" width={90}>{t720}</T>
      </Box>
      <Anim t={t} fx={fade(4200, 400)} style={{ left: 0, top: 0, width: FX_W, height: H }}>
        <T x={163} y={238} size={11.5} color={c.ink2} anchor="middle" width={318}>{tr('xp_notes_foot')}</T>
      </Anim>
    </FxCanvas>
  );
}

const FX = { recon: ReconFx, vial: VialFx, remind: RemindFx, sites: SitesFx, log: LogFx, energy: EnergyFx, labsman: LabsmanFx, notes: NotesFx };

// The prototype explainerSheet(): title + close, the "Example" tag and the animation, what the
// feature does, Not now / Try it, and the example-numbers note. Both buttons close the sheet
// ("Try it" leaves the user on the feature's own screen, where it was reached).
export function FeatureExplainerSheet({ featureKey, onClose, onTry }) {
  const { colors } = useTheme();
  const { t, language, timeFormat } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const [shown, setShown] = useState(featureKey); // keeps the content during the fade-out
  useEffect(() => { if (featureKey) setShown(featureKey); }, [featureKey]);
  const xp = EXPLAINERS.find((x) => x.key === shown);
  const Fx = xp ? FX[xp.key] : null;
  const sheetW = Math.min(winW - 16, 560);
  const inner = sheetW - 40 - 36; // the example card's own padding (18 each side)
  return (
    <Modal visible={!!featureKey} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.wrap}>
        <Pressable style={s.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('today_vial_not_now')} />
        {xp && Fx && (
          <Animated.View entering={SlideInDown.duration(280)} style={[s.sheet, { width: sheetW, marginBottom: Math.max(insets.bottom, 8) + 22 }]}>
            <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false} bounces={false}>
              <View style={s.head}>
                <Text style={s.title} accessibilityRole="header">{t(xp.titleKey)}</Text>
                <TouchableOpacity onPress={onClose} style={s.close} accessibilityRole="button" accessibilityLabel={t('today_vial_not_now')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <CrossMark size={18} color={colors.ink} />
                </TouchableOpacity>
              </View>
              <View style={s.card}>
                <View style={s.tag}><Text style={s.tagText}>{t('paywall_hero_example')}</Text></View>
                <Fx c={colors} t={t} width={inner} label={`${t('paywall_hero_example')}: ${t(xp.titleKey)}`} language={language} timeFormat={timeFormat} />
              </View>
              <Text style={s.text}>{t(xp.bodyKey)}</Text>
              <View style={s.btns}>
                <TouchableOpacity style={s.btnNo} onPress={onClose} accessibilityRole="button">
                  <Text style={s.btnNoText}>{t('today_vial_not_now')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnTry} onPress={onTry || onClose} accessibilityRole="button">
                  <Text style={s.btnTryText}>{t('xp_try')}</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.note}>{t('xp_note')}</Text>
            </ScrollView>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (c) => StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay },
  sheet: { maxHeight: '92%', backgroundColor: c.raised, borderRadius: 26, overflow: 'hidden' },
  body: { padding: 20, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.ink },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
  // prototype .card.pc: raised card, 18 padding, 12 gap (inside the raised sheet it reads as one surface)
  card: { backgroundColor: c.raised, borderRadius: 24, padding: 18, gap: 12 },
  tag: { alignSelf: 'flex-start', minHeight: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
  tagText: { fontSize: 12, fontWeight: '600', color: c.ink2 },
  text: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  btns: { flexDirection: 'row', gap: 10 },
  btnNo: { flex: 1, minHeight: 52, borderRadius: 26, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnNoText: { fontSize: 17, fontWeight: '700', color: c.ink },
  btnTry: { flex: 1.4, minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnTryText: { fontSize: 17, fontWeight: '700', color: c.onAct },
  note: { fontSize: 13, lineHeight: 18, color: c.ink2 },
});
