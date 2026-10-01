// "Show, don't tell" previews of the Premium features (founder approved 2026-09-30,
// design handoff item 25; docs/design/prototype.html PREVIEWS + FX). One animation
// per Premium feature: accumulation, reality check, AI food log, lab scan, lab trends,
// vaccine scan, protocols, PDF export. Each is an EXAMPLE built from sample data —
// never the user's numbers, never a measurement, a range verdict or advice (SaMD /
// Apple 1.4.1 line). Reduce Motion shows the last frame. Theme tokens only.
// Engine: components/previewFx.js (one UI-thread clock per preview).
import { Fragment, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown, useAnimatedProps } from 'react-native-reanimated';
import Svg, { Line, Circle, Path } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';
import AccumulationHero from './AccumulationHero';
import FeatureIcon from './FeatureIcon';
import CheckMark, { CrossMark } from './CheckMark';
import { clamp01, eOutQuad, eInOutCubic } from './motion';
import { MONO } from '../lib/fonts';
import {
  FX_W, eBack, kf, groupNum, useFxClock, FxCanvas, Box, Anim, Bar, Rect, T, Count, Typed,
  OkMark, Corners, ScanBeam, fmtDate,
} from './previewFx';

const ALine = Animated.createAnimatedComponent(Line);
const ACircle = Animated.createAnimatedComponent(Circle);

/* ---- Reality check: two weigh-ins + the food log → measured vs the formula ---- */
function RealityFx({ c, t: tr, width, label }) {
  const H = 250, DUR = 5600;
  const t = useFxClock(DUR);
  const day = (n) => tr('today_day_of').replace('{current}', String(n)).replace('{total}', '21');
  const perDay = `${tr('cal_kcal')}${tr('nutri_per_day')}`;
  const card = (x, n, kg) => (
    <>
      <Rect x={x} y={6} w={138} h={58} r={14} fill={c.well} />
      <T x={x + 12} y={26} size={11} color={c.ink2} width={118}>{day(n)}</T>
      <T x={x + 12} y={52} size={22} weight="500" color={c.ink} mono width={56}>{kg}</T>
      <T x={x + 66} y={52} size={11} color={c.ink2} mono width={30}>kg</T>
    </>
  );
  const connector = (tv) => { 'worklet'; return { width: 42 * eOutQuad(kf(tv, 950, 450)) }; };
  const kcal2320 = (v) => { 'worklet'; return '~' + groupNum(v) + ' ' + perDay; };
  const kcal = (v) => { 'worklet'; return groupNum(v); };
  const lineW = (tv) => { 'worklet'; return { width: 318 * eOutQuad(clamp01(eBack(kf(tv, 4100, 450)))) }; };
  return (
    <FxCanvas width={width} h={H} label={label}>
      <Box t={t} at={0} dur={500} dy={10}>{card(4, 1, '85.3')}</Box>
      <Box t={t} at={500} dur={500} dy={10}>{card(184, 21, '84.7')}</Box>
      <Anim t={t} fx={connector} style={{ left: 142, top: 34, height: 2, overflow: 'hidden' }}>
        <Svg width={42} height={2}><Line x1={0} x2={42} y1={1} y2={1} stroke={c.ink3} strokeDasharray="3,3" strokeWidth={1} /></Svg>
      </Anim>
      <Box t={t} at={950} dur={450} ease="out"><T x={163} y={80} size={11} color={c.ink2} mono anchor="middle" width={80}>−0.6 kg</T></Box>

      <Box t={t} at={1400} dur={300} ease="lin">
        <T x={4} y={106} size={11} color={c.ink2} width={170}>{tr('nutri_ai_badge')}</T>
        <Rect x={4} y={114} w={318} h={10} r={5} fill={c.well} />
      </Box>
      <Bar t={t} at={1500} dur={1100} x={4} y={114} w={318} h={10} r={5} color={c.data} />
      <Box t={t} at={1400} dur={300} ease="lin">
        <Count t={t} at={1500} dur={1100} to={2320} format={kcal2320} x={322} y={106} size={11} color={c.ink} anchor="end" width={150} />
      </Box>

      <Box t={t} at={2700} dur={400} ease="lin">
        <T x={4} y={152} size={12} color={c.ink2} width={200}>{tr('pw_prev_estimated')}</T>
        <T x={268} y={152} size={14} color={c.ink2} mono anchor="end" width={60}>2,780</T>
        <T x={322} y={152} size={10} color={c.ink3} mono anchor="end" width={52}>{perDay}</T>
      </Box>
      <Box t={t} at={3100} dur={300} ease="lin">
        <T x={4} y={182} size={12} weight="600" color={c.ink} width={200}>{tr('pw_prev_measured')}</T>
        <T x={322} y={182} size={10} color={c.ink3} mono anchor="end" width={52}>{perDay}</T>
      </Box>
      <Count t={t} at={3100} dur={900} to={2540} format={kcal} x={268} y={182} size={18} weight="500" color={c.data} anchor="end" width={70} />
      <Box t={t} at={4100} dur={450}>
        <Anim t={t} fx={lineW} style={{ left: 4, top: 200, height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }} />
        <T x={4} y={226} size={12} color={c.ink2} width={200}>{tr('pw_prev_difference')}</T>
        <T x={268} y={226} size={14} color={c.ink} mono anchor="end" width={60}>−240</T>
        <T x={322} y={226} size={10} color={c.ink3} mono anchor="end" width={52}>{perDay}</T>
      </Box>
    </FxCanvas>
  );
}

/* ---- AI food log: a sentence becomes itemised, estimated entries ---- */
// The demo sentence is translated (nutri_demo_meal); its three parts are the items.
function splitMeal(s) {
  const parts = s.split(/,\s*|\s+(?:and|y|e|et|und)\s+/).map((x) => x.trim()).filter(Boolean);
  return parts.length === 3 ? parts : null;
}
function FoodFx({ c, t: tr, width, label }) {
  const H = 250, DUR = 6000;
  const t = useFxClock(DUR);
  const full = tr('nutri_demo_meal');
  const items = splitMeal(full);
  const rows = items
    ? [[items[0], 215, tr('nutri_cat_meal')], [items[1], 240, tr('nutri_cat_meal')], [items[2], 25, tr('nutri_cat_drink')]]
    : [[full, 480, tr('nutri_cat_meal')]];
  const kcalWord = tr('cal_kcal'), carbsWord = tr('nutri_carbs'), protWord = tr('nutri_protein');
  const composer = (tv) => { 'worklet'; return { opacity: tv <= 1700 ? 1 : 0 }; };
  const bubble = (tv) => { 'worklet'; return { opacity: tv > 1700 ? 1 : 0, transform: [{ translateY: 200 - 186 * eOutQuad(kf(tv, 1700, 350)) }] }; };
  const typing = (tv) => { 'worklet'; return { opacity: tv > 2050 && tv < 2700 ? 1 : 0 }; };
  const dot = (i) => (tv) => { 'worklet'; return { opacity: Math.floor((tv - 2050) / 200) % 3 === i ? 1 : 0.35 }; };
  const total = (v) => { 'worklet'; return '≈ ' + groupNum(v) + ' ' + kcalWord; };
  const macros = (v) => { 'worklet'; return Math.round(55 * v) + ' g ' + carbsWord + ' · ' + Math.round(26 * v) + ' g ' + protWord; };
  return (
    <FxCanvas width={width} h={H} label={label}>
      <Box t={t} at={2700} dur={300} ease="lin"><Rect x={0} y={52} w={326} h={138} r={18} fill={c.well} /></Box>

      <Anim t={t} fx={composer} style={{ left: 0, top: 0, width: FX_W, height: H }}>
        <Rect x={4} y={200} w={272} h={40} r={20} fill={c.well} stroke={c.line} />
        <Typed t={t} text={full} at={200} dur={1300} caretUntil={1700} x={20} top={211} size={13} color={c.ink} width={250} />
        <View style={{ position: 'absolute', left: 284, top: 202, width: 36, height: 36, borderRadius: 18, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center' }}>
          <FeatureIcon name="ai_spark" size={18} color={c.onAct} />
        </View>
      </Anim>
      <Anim t={t} fx={bubble} style={{ left: 96, top: 0, width: 226, height: 34, borderRadius: 17, backgroundColor: c.act, justifyContent: 'center', paddingHorizontal: 12 }}>
        <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 12.5, color: c.onAct, textAlign: 'center' }}>{full}</Text>
      </Anim>
      <Anim t={t} fx={typing} style={{ left: 4, top: 58, height: 30, borderRadius: 15, backgroundColor: c.well, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }}>
        <Text allowFontScaling={false} style={{ fontSize: 11.5, color: c.ink2 }}>{tr('nutri_typing')}</Text>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {[0, 1, 2].map((i) => (
            <Anim key={i} t={t} fx={dot(i)} style={{ position: 'relative', width: 4.4, height: 4.4, borderRadius: 2.2, backgroundColor: c.ink2 }} />
          ))}
        </View>
      </Anim>

      {rows.map((r, i) => {
        const y = 60 + i * 34;
        return (
          <Box key={i} t={t} at={2700 + i * 280} dur={380} dx={-16}>
            <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
              style={{ position: 'absolute', left: 12, top: y + 3, width: 240, fontSize: 13, lineHeight: 16, color: c.ink }}>
              {r[0]} · <Text style={{ fontFamily: MONO['500'] }}>~{r[1]}</Text> {kcalWord}
            </Text>
            <Rect x={262} y={y + 3} w={56} h={20} r={10} stroke={c.line} />
            <T x={290} y={y + 17} size={10.5} color={c.ink2} anchor="middle" width={50}>{r[2]}</T>
          </Box>
        );
      })}

      <Box t={t} at={3700} dur={300} ease="lin">
        <Rect x={12} y={166} w={302} h={StyleSheet.hairlineWidth * 2} fill={c.line} />
      </Box>
      <Box t={t} at={3700} dur={300} ease="lin">
        <Count t={t} at={3700} dur={900} to={480} format={total} x={12} y={184} size={15} weight="500" color={c.ink} width={130} />
        <Count t={t} at={3700} dur={900} to={1} format={macros} x={314} y={184} size={11.5} color={c.ink2} mono={false} anchor="end" width={180} />
      </Box>
      <Box t={t} at={4700} dur={400} ease="lin">
        <T x={163} y={224} size={10.5} color={c.ink3} anchor="middle" width={310} lines={2}>{tr('nutri_est_note')}</T>
      </Box>
    </FxCanvas>
  );
}

/* ---- Lab scan: one photo → every value read ---- */
const SCAN_MARKERS = [['Total Testosterone', '986 ng/dL'], ['Free Testosterone', '21.4 ng/dL'], ['Estradiol', '41 pg/mL'], ['SHBG', '31 nmol/L'], ['Hematocrit', '47.6 %'], ['HbA1c', '5.2 %'], ['LDL', '121 mg/dL']];
function ScanFx({ c, t: tr, width, label }) {
  const H = 250, DUR = 5600;
  const t = useFxClock(DUR);
  const px = 8, py = 14, pw = 120, ph = 168;
  const lit = (ly) => (tv) => { 'worklet'; return { opacity: tv > 700 && eInOutCubic(kf(tv, 700, 2200)) * ph > ly - py ? 0.9 : 0 }; };
  const lines = Array.from({ length: 12 }, (_, i) => py + 30 + i * 11.5);
  return (
    <FxCanvas width={width} h={H} label={label}>
      <Box t={t} at={0} dur={400} ease="lin">
        <Rect x={px} y={py} w={pw} h={ph} r={8} fill={c.raised} stroke={c.line} />
        <T x={px + 10} y={py + 18} size={8.5} weight="700" color={c.ink3} width={pw - 20}>{tr('export_labs')}</T>
        {lines.map((ly, i) => (
          <Fragment key={i}>
            <Rect x={px + 10} y={ly} w={58 - (i % 3) * 10} h={4} r={2} fill={c.line} />
            <Rect x={px + 84} y={ly} w={24} h={4} r={2} fill={c.line} />
            <Anim t={t} fx={lit(ly)} style={{ left: 0, top: 0, width: FX_W, height: H }}>
              <Rect x={px + 10} y={ly} w={58 - (i % 3) * 10} h={4} r={2} fill={c.data} />
              <Rect x={px + 84} y={ly} w={24} h={4} r={2} fill={c.data} />
            </Anim>
          </Fragment>
        ))}
      </Box>
      <Box t={t} at={250} dur={350} ease="lin"><Corners x={px - 6} y={py - 6} w={pw + 12} h={ph + 12} color={c.ink} /></Box>
      <ScanBeam t={t} at={700} dur={2200} until={3000} x={px} y={py} w={pw} h={ph} c={c} />
      {SCAN_MARKERS.map((m, i) => {
        const y = 20 + i * 24;
        return (
          <Box key={m[0]} t={t} at={900 + i * 300} dur={420} dx={-26}>
            <T x={146} y={y + 10} size={11.5} color={c.ink} width={104}>{m[0]}</T>
            <T x={322} y={y + 10} size={11.5} weight="500" color={c.ink} mono anchor="end" width={76}>{m[1]}</T>
          </Box>
        );
      })}
      <OkMark t={t} at={3300} cx={20} cy={214} c={c} />
      <Box t={t} at={3300} dur={450}>
        <T x={38} y={219} size={12} weight="600" color={c.ink} width={284}>{tr('pw_prev_scan_count')}</T>
      </Box>
    </FxCanvas>
  );
}

/* ---- Lab trends: each marker becomes a line, test after test (no ranges, no verdicts) ---- */
function LabsFx({ c, t: tr, width, label, language }) {
  const H = 250, DUR = 5400;
  const t = useFxClock(DUR);
  const pts = [[fmtDate(language, 2026, 1, 3, false), 498], [fmtDate(language, 2026, 4, 12, false), 512], [fmtDate(language, 2026, 7, 20, false), 986]];
  const X = (i) => 40 + i * 120;
  const Y = (v) => 190 - ((v - 400) / (1100 - 400)) * 112;
  return (
    <FxCanvas width={width} h={H} label={label}>
      {pts.map((p, i) => (
        <Box key={`d${i}`} t={t} at={100 + i * 250} dur={400}>
          <Rect x={X(i) - 34} y={6} w={68} h={26} r={13} fill={c.well} />
          <T x={X(i)} y={23} size={11} color={c.ink2} anchor="middle" width={62}>{p[0]}</T>
        </Box>
      ))}
      <Box t={t} at={900} dur={300} ease="lin">
        <T x={4} y={52} size={13} weight="700" color={c.ink} width={220}>Total Testosterone</T>
        <T x={322} y={52} size={11} color={c.ink2} mono anchor="end" width={60}>ng/dL</T>
        <Rect x={4} y={206} w={318} h={StyleSheet.hairlineWidth * 2} fill={c.line} />
      </Box>
      <Svg width={FX_W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        {pts.map((p, i) => (i > 0 ? <LabSegment key={`s${i}`} t={t} at={1300 + i * 700} x0={X(i - 1)} y0={Y(pts[i - 1][1])} x1={X(i)} y1={Y(p[1])} color={c.data} /> : null))}
        {pts.map((p, i) => <LabPoint key={`p${i}`} t={t} at={1300 + i * 700} cx={X(i)} cy={Y(p[1])} color={c.data} />)}
      </Svg>
      {pts.map((p, i) => (
        <Box key={`v${i}`} t={t} at={1300 + i * 700} dur={320} ease="lin">
          <T x={X(i)} y={Y(p[1]) - 12} size={12} weight="500" color={c.ink} mono anchor="middle" width={60}>{String(p[1])}</T>
          <T x={X(i)} y={224} size={11} color={c.ink3} anchor="middle" width={80}>{p[0]}</T>
        </Box>
      ))}
      <Box t={t} at={3700} dur={450}>
        <T x={4} y={246} size={11} color={c.ink2} width={318}>{`3 ${tr('blood_readings')}`}</T>
      </Box>
    </FxCanvas>
  );
}
function LabSegment({ t, at, x0, y0, x1, y1, color }) {
  const props = useAnimatedProps(() => {
    const sp = eOutQuad(kf(t.value, at - 450, 450));
    return { x2: x0 + (x1 - x0) * sp, y2: y0 + (y1 - y0) * sp, opacity: t.value > at - 450 ? 1 : 0 };
  });
  return <ALine animatedProps={props} x1={x0} y1={y0} x2={x0} y2={y0} stroke={color} strokeWidth={2.2} strokeLinecap="round" />;
}
function LabPoint({ t, at, cx, cy, color }) {
  const props = useAnimatedProps(() => ({ r: Math.max(0, 5 * eBack(kf(t.value, at, 450))) }));
  return <ACircle animatedProps={props} cx={cx} cy={cy} r={0} fill={color} />;
}

/* ---- Vaccine scan: a card photo → your records, dates as written ---- */
function VaxFx({ c, t: tr, width, label, language }) {
  const H = 216, DUR = 5600;
  const t = useFxClock(DUR);
  const px = 8, py = 14, pw = 128, ph = 110;
  const due = tr('vax_next_due');
  const R = [
    ['Influenza (flu)', fmtDate(language, 2025, 9, 2), `${due}: ${fmtDate(language, 2026, 9, 1)}`],
    ['COVID-19', fmtDate(language, 2025, 8, 8), `${tr('vax_dose_short')} 4 · Pfizer`],
    ['Tetanus, diphtheria (Td)', fmtDate(language, 2019, 2, 14), `${due}: ${fmtDate(language, 2029, 2, 14)}`],
  ];
  return (
    <FxCanvas width={width} h={H} label={label}>
      <Box t={t} at={0} dur={400} ease="lin">
        <Rect x={px} y={py} w={pw} h={ph} r={8} fill={c.raised} stroke={c.line} />
        <T x={px + 10} y={py + 17} size={8.5} weight="700" color={c.ink3} width={pw - 20}>{tr('body_section_vaccines')}</T>
        {Array.from({ length: 6 }, (_, i) => (
          <Fragment key={i}>
            <Rect x={px + 10} y={py + 30 + i * 12.5} w={50} h={4} r={2} fill={c.line} />
            <Rect x={px + 70} y={py + 30 + i * 12.5} w={44} h={4} r={2} fill={c.line} />
          </Fragment>
        ))}
      </Box>
      <Box t={t} at={250} dur={350} ease="lin"><Corners x={px - 6} y={py - 6} w={pw + 12} h={ph + 12} color={c.ink} /></Box>
      <ScanBeam t={t} at={700} dur={1600} until={2400} x={px} y={py} w={pw} h={ph} c={c} />
      {R.map((r, i) => {
        const y = 8 + i * 70;
        return (
          <Box key={r[0]} t={t} at={1600 + i * 450} dur={480} dx={30}>
            <Rect x={150} y={y} w={172} h={62} r={14} fill={c.well} />
            <T x={162} y={y + 20} size={12} weight="700" color={c.ink} width={152}>{r[0]}</T>
            <T x={162} y={y + 37} size={11} color={c.ink2} width={152}>{r[1]}</T>
            <T x={162} y={y + 53} size={10.5} color={c.ink2} width={152}>{r[2]}</T>
          </Box>
        );
      })}
      <OkMark t={t} at={3300} cx={20} cy={164} c={c} />
      <Box t={t} at={3300} dur={450}>
        <T x={38} y={169} size={12} weight="600" color={c.ink} width={104} lines={2}>{tr('vax_imported_body').replace('{count}', '3')}</T>
      </Box>
    </FxCanvas>
  );
}

/* ---- Protocols: the free plan's 3 slots, then as many as you run ---- */
// Dots in the user protocol-colour palette (ProtocolsScreen COLORS) — deliberately
// fixed, the same in both themes, shown only as dots (DESIGN.md §2.4).
const PROTOCOL_DOTS = ['#1D9E75', '#D85A30', '#7F77DD', '#378ADD', '#BA7517', '#D4537E'];
const SAMPLE_PROTOCOLS = ['BPC-157', 'TB-500', 'Testosterone Cypionate', 'Magnesium Bisglycinate', 'Vitamin D3', 'Semaglutide'];
function ProtosFx({ c, t: tr, width, label }) {
  const H = 250, DUR = 5600;
  const t = useFxClock(DUR);
  // The 4th protocol: dimmed and shaken while the free plan is full, then unlocked.
  const fourth = (tv) => {
    'worklet';
    const locked = tv <= 2600;
    const s = locked && tv > 1500 ? Math.sin((tv - 1500) / 40) * 6 * clamp01(1 - (tv - 1500) / 700) : 0;
    return { opacity: locked ? 0.45 : 1, transform: [{ translateX: s }] };
  };
  const lock = (tv) => { 'worklet'; return { opacity: tv > 1500 && tv <= 2600 ? clamp01((tv - 1500) / 300) : 0 }; };
  const before = (tv) => { 'worklet'; return { opacity: tv > 900 && tv <= 2600 ? clamp01((tv - 900) / 300) : 0 }; };
  const after = (tv) => { 'worklet'; return { opacity: tv > 2600 ? clamp01((tv - 2600) / 300) : 0 }; };
  return (
    <FxCanvas width={width} h={H} label={label}>
      {SAMPLE_PROTOCOLS.map((name, i) => {
        const y = 6 + i * 34;
        const at = i < 3 ? 150 + i * 250 : (i === 3 ? 1300 : 2900 + (i - 3) * 260);
        const row = (
          <>
            <Rect x={4} y={y} w={318} h={28} r={14} fill={c.well} />
            <View style={{ position: 'absolute', left: 15, top: y + 9, width: 10, height: 10, borderRadius: 5, backgroundColor: PROTOCOL_DOTS[i] }} />
            <T x={34} y={y + 18.5} size={12.5} weight="600" color={c.ink} width={250}>{name}</T>
          </>
        );
        return (
          <Box key={name} t={t} at={at} dur={420} dx={-20}>
            {i === 3 ? <Anim t={t} fx={fourth} style={{ left: 0, top: 0, width: FX_W, height: H }}>{row}</Anim> : row}
          </Box>
        );
      })}
      <Anim t={t} fx={lock} style={{ left: 294, top: 6 + 3 * 34 + 4 }}>
        <FeatureIcon name="lock" size={20} color={c.ink} />
      </Anim>
      <Anim t={t} fx={before} style={{ left: 0, top: 0, width: FX_W, height: H }}>
        <T x={163} y={232} size={12.5} weight="600" color={c.ink2} anchor="middle" width={310}>{tr('paywall_free_feat_3')}</T>
      </Anim>
      <Anim t={t} fx={after} style={{ left: 0, top: 0, width: FX_W, height: H }}>
        <T x={163} y={232} size={12.5} weight="600" color={c.data} anchor="middle" width={310}>{tr('paywall_feat_4')}</T>
      </Anim>
    </FxCanvas>
  );
}

/* ---- PDF export for your doctor: choose, then the pages print themselves ---- */
function PdfFx({ c, t: tr, width, label, language }) {
  const H = 230, DUR = 5800;
  const t = useFxClock(DUR);
  const items = [tr('export_labs'), tr('body_section_vaccines')];
  const pxp = 150, pyp = 6, pwp = 168, php = 216;
  const page = (tv) => {
    'worklet';
    const pg = eBack(kf(tv, 1500, 500));
    const fly = eInOutCubic(kf(tv, 4300, 700));
    return { opacity: tv < 1500 ? 0 : clamp01(pg * 1.5), transform: [{ translateY: -6 * fly }, { scale: (1 - 0.12 * fly) * (0.9 + 0.1 * pg) }] };
  };
  const rows = [[items[0], 1], ['', 0], ['', 0], ['', 0], [items[1], 1], ['', 0], ['', 0], ['', 0]];
  const exported = `${tr('export_exported_prefix')} ${fmtDate(language, 2026, 8, 29)}`;
  return (
    <FxCanvas width={width} h={H} label={label}>
      {items.map((it, i) => (
        <Box key={it} t={t} at={100 + i * 200} dur={300} ease="lin">
          <Rect x={4} y={10 + i * 36} w={22} h={22} r={7} stroke={c.tick} sw={1.5} />
          <Anim t={t} fx={(tv) => { 'worklet'; return { opacity: tv > 700 + i * 350 ? 1 : 0 }; }} style={{ left: 4, top: 10 + i * 36, width: 22, height: 22, borderRadius: 7, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
            <CheckMark size={15} color={c.onInk} strokeWidth={2.4} />
          </Anim>
          <T x={36} y={26 + i * 36} size={12.5} weight="600" color={c.ink} width={108}>{it}</T>
        </Box>
      ))}
      <Anim t={t} fx={page} style={{ left: pxp, top: pyp, width: pwp, height: php }}>
        <Rect x={0} y={0} w={pwp} h={php} r={6} fill={c.raised} stroke={c.line} />
        <T x={12} y={22} size={12} weight="700" color={c.ink} width={pwp - 24}>{tr('export_title')}</T>
        <T x={12} y={36} size={8.5} color={c.ink3} width={pwp - 24}>{exported}</T>
        {rows.map((r, i) => {
          const y = 50 + i * 17;
          const at = 2100 + i * 220;
          return r[1] ? (
            <Box key={i} t={t} at={at} dur={220} ease="lin"><T x={12} y={y + 8} size={9.5} weight="700" color={c.ink} width={pwp - 24}>{r[0]}</T></Box>
          ) : (
            <Fragment key={i}>
              <Bar t={t} at={at} dur={220} x={12} y={y + 3} w={64} h={4} r={2} color={c.ink3} ease="lin" />
              <Bar t={t} at={at} dur={220} x={118} y={y + 3} w={36} h={4} r={2} color={c.data} ease="lin" />
            </Fragment>
          );
        })}
        <Box t={t} at={3900} dur={300} ease="lin">
          <T x={12} y={196} size={7.5} color={c.ink3} width={pwp - 24} lines={2}>{tr('settings_not_medical')}</T>
        </Box>
      </Anim>
      <Box t={t} at={4700} dur={450} grow x={pxp + pwp - 37} y={pyp + 1} w={34} h={34}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={16} height={18} viewBox="-8 -9 16 18"><Path d="M0 7V-6M-5 -1 0 -6l5 5" fill="none" stroke={c.onAct} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </View>
      </Box>
      <OkMark t={t} at={4700} cx={20} cy={112} c={c} />
      <Box t={t} at={4700} dur={450}>
        <T x={38} y={117} size={12} weight="600" color={c.ink} width={106} lines={3}>{tr('pw_prem_pdf')}</T>
      </Box>
    </FxCanvas>
  );
}

// Registry, in the approved order (prototype PREVIEWS): key (analytics id — the
// existing ids stay), icon, title/body i18n keys, renderer.
export const PREVIEW_FEATURES = [
  { key: 'serum', icon: 'curve', titleKey: 'serum_preview_title', bodyKey: 'serum_preview_body', hero: true },
  { key: 'reality', icon: 'calc_trend', titleKey: 'pw_prev_reality_title', bodyKey: 'pw_prev_reality_body', Fx: RealityFx },
  { key: 'food', icon: 'food', titleKey: 'nutri_locked_title', bodyKey: 'nutri_locked_sub', Fx: FoodFx },
  { key: 'scan', icon: 'scan', titleKey: 'pw_prev_scan_title', bodyKey: 'pw_prev_scan_body', Fx: ScanFx },
  { key: 'labs', icon: 'calc_bars', titleKey: 'pw_prev_labs_title', bodyKey: 'pw_prev_labs_body', Fx: LabsFx },
  { key: 'vaccine', icon: 'shield', titleKey: 'pw_prev_vax_title', bodyKey: 'pw_prev_vax_body', Fx: VaxFx },
  { key: 'protos', icon: 'stack', titleKey: 'paywall_feat_4', bodyKey: 'ob_feat4_d', Fx: ProtosFx },
  { key: 'pdf', icon: 'download', titleKey: 'pw_prem_pdf', bodyKey: 'export_premium_sub', Fx: PdfFx },
];

// One preview, "Example"-tagged, at a given width (also usable outside the sheet,
// e.g. from a locked feature).
export function FeaturePreview({ featureKey, width }) {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const f = PREVIEW_FEATURES.find((x) => x.key === featureKey);
  if (!f) return null;
  if (f.hero) return <AccumulationHero width={width - 28} height={150} />;
  const label = `${t('paywall_hero_example')}: ${t(f.titleKey)}`;
  return (
    <View style={s.fx}>
      <View style={s.tag}><Text style={s.tagText}>{t('paywall_hero_example')}</Text></View>
      <f.Fx c={colors} t={t} width={width} label={label} language={language} />
    </View>
  );
}

// Bottom sheet: title, the preview, what it does, Unlock with Premium (when
// `onUnlock` is given), the example-only note.
export function FeaturePreviewSheet({ featureKey, onClose, onUnlock }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const [shown, setShown] = useState(featureKey); // keeps the content during the fade-out
  useEffect(() => { if (featureKey) setShown(featureKey); }, [featureKey]);
  const feature = PREVIEW_FEATURES.find((f) => f.key === shown);
  const sheetW = Math.min(winW - 16, 560);
  const inner = sheetW - 40;
  return (
    <Modal visible={!!featureKey} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.wrap}>
        <Pressable style={s.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('done')} />
        {feature && (
          <Animated.View entering={SlideInDown.duration(280)} style={[s.sheet, { width: sheetW, marginBottom: Math.max(insets.bottom, 8) + 8 }]}>
            <ScrollView contentContainerStyle={s.sheetBody} showsVerticalScrollIndicator={false} bounces={false}>
              <View style={s.head}>
                <Text style={s.title}>{t(feature.titleKey)}</Text>
                <TouchableOpacity onPress={onClose} style={s.close} accessibilityRole="button" accessibilityLabel={t('done')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <CrossMark size={16} color={colors.ink2} />
                </TouchableOpacity>
              </View>
              <FeaturePreview featureKey={feature.key} width={inner} />
              <Text style={s.body}>{t(feature.bodyKey)}</Text>
              {onUnlock ? (
                <TouchableOpacity style={s.cta} onPress={onUnlock} activeOpacity={0.85} accessibilityRole="button">
                  <Text style={s.ctaText}>{t('preview_unlock_cta')}</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={s.note}>{t('pw_prev_disclaimer')}</Text>
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
  sheetBody: { padding: 20, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.ink },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  cta: { minHeight: 54, borderRadius: 27, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  ctaText: { fontSize: 17, fontWeight: '700', color: c.onAct },
  note: { fontSize: 13, lineHeight: 18, color: c.ink3 },
  fx: { gap: 10 },
  tag: { alignSelf: 'flex-start', minHeight: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
  tagText: { fontSize: 12, fontWeight: '600', color: c.ink2 },
});
