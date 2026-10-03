import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  PixelRatio,
  useWindowDimensions,
} from 'react-native';
import GradSwitch from '../components/GradSwitch';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Path, G, Line, Rect, Circle, Text as SvgText } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedProps, useAnimatedStyle, useDerivedValue, useReducedMotion,
  withTiming, withDelay, withSequence, cancelAnimation, Easing,
} from 'react-native-reanimated';
import { numberWidth } from '../lib/numberWidth';
import { AnimatedNumber, clamp01, eOutQuad, eInOutSine, eOutCubic, invInOutSine, bumpScale, dropPath } from '../components/motion';

import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { getActiveProtocols, getBiomarkers } from '../lib/database';
import { getHalfLifeEntry, curveUnit, doseInCurveUnit, amountFraction } from '../lib/halfLives';
import { parseDecimal } from '../lib/doseMath';
import {
  STEP_HOURS, matchName, splitCurveProtocols, curveGridStart, scheduledDoses, levelAt, levelLabel,
  curveWindowDays, curveTicks, axisLabel, upcomingDoseDays,
} from '../lib/serumModel';
import { formatDate, formatNumber, decimalText, MONTHS_SHORT, numberSymbols } from '../lib/localeFormat';
import { localISO } from '../lib/localDate';
import { dateColumns, dateAfter } from '../lib/wheelPick';
import { DTPickerSheet, DTWheel } from './components/ProtocolParts';
import RowChevron from '../components/RowChevron';

import { useTheme } from '../lib/theme';
import { MONO, fontFamilyFor } from '../lib/fonts';
import FeatureIcon from '../components/FeatureIcon';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { hasPremium } from '../lib/entitlement';
import { displayColor } from '../lib/protocolColors';
import CheckMark from '../components/CheckMark';
import SegmentedBar from '../components/SegmentedBar';
import { useUnfoldToPage } from '../components/BookPanes';
import { paneWidths } from '../lib/bookLayout';
import { restoreCurveView, FUTURE_PRESETS } from '../lib/curveView';
import { loadCurveView, saveCurveView } from '../lib/curveViewStore';
import { notifyDataChanged } from '../lib/sync';

const APath = Animated.createAnimatedComponent(Path);
const AG = Animated.createAnimatedComponent(G);
const ALine = Animated.createAnimatedComponent(Line);
const ARect = Animated.createAnimatedComponent(Rect);
const ACircle = Animated.createAnimatedComponent(Circle);

// ── Opening moment timeline (ms) ──
// The lines draw IN TIME across the last 14 days (each scheduled dose drops in),
// the Now marker rises, then the projection zone opens and the lines continue
// into it. One moment per screen open; nothing loops after.
const C_DRAW = 2400, C_RISE = 280, C_PROJ = 800, C_BREATH = 1300, C_DROP = 170;
const C_TOTAL = C_DRAW + C_RISE + C_PROJ + C_BREATH;

// Steps of the series revealed at clock t (fractional).
function revealAt(t, nowIdx, nSteps) {
  'worklet';
  if (t < C_DRAW) return nowIdx * eInOutSine(t / C_DRAW);
  const p0 = C_DRAW + C_RISE;
  if (t < p0) return nowIdx;
  if (t < p0 + C_PROJ) return nowIdx + (nSteps - nowIdx) * eOutCubic((t - p0) / C_PROJ);
  return nSteps;
}

// Path for a level series, drawn up to `rev` steps on an x-domain of `domN` steps.
// `pre[i]` is the level just BEFORE sample i (excluding a dose landing exactly on
// it), so a dose draws as a vertical jump instead of a ramp that starts 6h early.
// `from` is the first step drawn: 0 for the estimate up to Now, Now's step for the
// dashed projection after it (DESIGN.md §7: projections are dashed).
function seriesD(pts, pre, rev, domN, yMax, g, from) {
  'worklet';
  const n = pts.length;
  const last = Math.min(rev, n - 1, domN);
  if (last <= from || yMax <= 0 || domN <= 0) return 'M ' + g.L + ' ' + g.B;
  const w = g.R - g.L, h = g.B - g.T;
  const k = Math.floor(last);
  let d = '';
  for (let i = from; i <= k; i++) {
    const x = (g.L + (i / domN) * w).toFixed(1);
    if (i > from && pre[i] !== pts[i]) d += ' L ' + x + ' ' + (g.B - (pre[i] / yMax) * h).toFixed(1);
    d += (i === from ? 'M ' : ' L ') + x + ' ' + (g.B - (pts[i] / yMax) * h).toFixed(1);
  }
  const f = last - k;
  if (f > 0 && k + 1 < n) {
    const v = pts[k] + (pre[k + 1] - pts[k]) * f;
    d += ' L ' + (g.L + ((k + f) / domN) * w).toFixed(1) + ' ' + (g.B - (v / yMax) * h).toFixed(1);
  }
  return d;
}

function levelAtStep(pts, pre, s) {
  'worklet';
  const n = pts.length;
  if (s <= 0) return pts[0] || 0;
  if (s >= n - 1) return pts[n - 1] || 0;
  const k = Math.floor(s), f = s - k;
  if (f === 0) return pts[k];
  return pts[k] + (pre[k + 1] - pts[k]) * f;
}

// One curve (a compound or a combined total), driven entirely on the UI thread:
// solid up to Now (the estimate), dashed after it (the projection).
function CurveLine({ points, pre, clock, domainN, yMaxS, ready, geo, nowIdx, nSteps, stroke, strokeWidth }) {
  const past = useAnimatedProps(() => ({
    d: seriesD(points, pre, Math.min(revealAt(clock.value, nowIdx, nSteps), nowIdx), domainN.value, yMaxS.value, geo, 0),
    opacity: ready.value,
  }), [points, pre, nowIdx, nSteps, geo]);
  const ahead = useAnimatedProps(() => ({
    d: seriesD(points, pre, revealAt(clock.value, nowIdx, nSteps), domainN.value, yMaxS.value, geo, nowIdx),
    opacity: ready.value,
  }), [points, pre, nowIdx, nSteps, geo]);
  // Explicit dash on both: react-native-svg keeps a prior dash when the prop returns to undefined.
  return (
    <>
      <APath animatedProps={past} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="0" strokeLinejoin="round" strokeLinecap="round" />
      <APath animatedProps={ahead} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.8} strokeDasharray="5,4" strokeLinejoin="round" strokeLinecap="round" />
    </>
  );
}

// The pen dot that leads each line while it draws, then a soft "breath" at Now.
function PenDot({ points, pre, clock, domainN, yMaxS, geo, nowIdx, nSteps, color }) {
  const dot = useAnimatedProps(() => {
    const t = clock.value;
    const rev = Math.min(revealAt(t, nowIdx, nSteps), nowIdx);
    const w = geo.R - geo.L, h = geo.B - geo.T;
    return {
      cx: geo.L + (rev / domainN.value) * w,
      cy: geo.B - (levelAtStep(points, pre, rev) / yMaxS.value) * h,
      opacity: t > 60 && t < C_DRAW ? 1 : 0,
    };
  }, [points, pre, nowIdx, nSteps, geo]);
  const halo = useAnimatedProps(() => {
    const t = clock.value;
    const w = geo.R - geo.L, h = geo.B - geo.T;
    const drawing = t > 60 && t < C_DRAW;
    const rev = drawing ? Math.min(revealAt(t, nowIdx, nSteps), nowIdx) : nowIdx;
    const pos = { cx: geo.L + (rev / domainN.value) * w, cy: geo.B - (levelAtStep(points, pre, rev) / yMaxS.value) * h };
    if (drawing) return { ...pos, r: 8, opacity: 0.2 };
    const b = (t - (C_DRAW + C_RISE + C_PROJ)) / C_BREATH;
    if (b < 0 || b >= 1) return { ...pos, r: 4, opacity: 0 };
    const ph = (b * 2) % 1;
    return { ...pos, r: 4 + 8 * eOutQuad(ph), opacity: 0.28 * (1 - ph) };
  }, [points, pre, nowIdx, nSteps, geo]);
  return (
    <>
      <ACircle animatedProps={halo} fill={color} />
      <ACircle animatedProps={dot} r={3.5} fill={color} stroke={color} strokeWidth={0} />
    </>
  );
}

// A scheduled dose landing during the opening moment: a drop falls, a ring pulses.
function DoseDrop({ clock, hit, x, y, color, showDrop }) {
  const drop = useAnimatedProps(() => {
    const k = (clock.value - (hit - C_DROP)) / C_DROP;
    if (!showDrop || k < 0 || k >= 1) return { opacity: 0, d: 'M 0 0' };
    return { opacity: 1, d: dropPath(x, -8 + (y - 5 + 8) * k * k, 0.72) };
  }, [hit, x, y, showDrop]);
  const pulse = useAnimatedProps(() => {
    const k = (clock.value - hit) / 460;
    if (k < 0 || k >= 1) return { opacity: 0, r: 3 };
    return { opacity: 0.55 * (1 - k), r: 3 + 9 * eOutQuad(k) };
  }, [hit]);
  return (
    <>
      <APath animatedProps={drop} fill={color} />
      <ACircle cx={x} cy={y} animatedProps={pulse} fill="none" stroke={color} strokeWidth={1.5} />
    </>
  );
}

// The schedule → dose → level math lives in lib/serumModel.js (shared with the
// Journey tile, so both always show the same Est. level).


// Estimated level (mg or IU) from the summed dose model — not "amount in the body"
// not a serum concentration — the disclaimer says so.

// The user's local calendar day (lib/localDate) — never a UTC date: noon local turned into
// UTC was the day before east of UTC+12.
function todayISO() {
  return localISO();
}


// Peak time and its published range, in hours below 3 days, else days.
function tmaxLabels(entry) {
  const [lo, hi] = entry.tmaxRange;
  const inDays = hi >= 72;
  const f = (h) => (inDays ? String(Math.round(h / 24)) : String(Math.round(h)));
  const u = inDays ? 'd' : 'h';
  return { peak: f(entry.tmaxHours) + u, range: f(lo) + '–' + f(hi) + u };
}

function halfLifeLabel(hours, language = 'en') {
  if (hours == null) return '—';
  if (hours >= 48) {
    const days = hours / 24;
    return `${Number.isInteger(days) ? days : formatNumber(days, language, { digits: 1 })}d`;
  }
  return `${decimalText(hours, language)}h`;
}

// The same label split into a number and its unit, for the 34 pt stat.
function halfLifeParts(hours, language = 'en') {
  if (hours == null) return { num: '—', unit: '' };
  if (hours >= 48) {
    const days = hours / 24;
    return { num: String(Number.isInteger(days) ? days : formatNumber(days, language, { digits: 1 })), unit: 'd' };
  }
  return { num: decimalText(hours, language), unit: 'h' };
}

// The back row names the screen it returns to (prototype navrow), else "Back".
const TAB_LABEL = { Today: 'tab_today', Protocols: 'tab_protocols', Journey: 'tab_journey', Body: 'tab_body', Settings: 'tab_settings' };
function backLabelFor(navigation, t) {
  try {
    const st = navigation.getState();
    const prev = st && st.routes[st.index - 1];
    if (prev && prev.name === 'Log') return t('log_title');
    if (prev && prev.name === 'MainTabs' && prev.state && prev.state.routes) {
      const tab = prev.state.routes[prev.state.index || 0];
      if (tab && TAB_LABEL[tab.name]) return t(TAB_LABEL[tab.name]);
    }
  } catch { /* fall through */ }
  return t('back');
}

// S-26 book layout: `embedded` = shown on a tab's right page (Journey BK-5, My Body BK-6):
// no back row, no top safe-area edge (the tab screen has it), the chart sized to the page.
// As a pushed screen it moves onto the Journey right page when the window unfolds (BK-10).
export default function SerumCurveScreen({ embedded = false }) {
  const { t, language } = useLanguage();
  // Levels and dates in the app language ("3,5 mg", "19 de out."; lib/localeFormat).
  const mgLabel = (v) => levelLabel(v, language);
  const decSep = numberSymbols(language).decimal; // for the UI-thread number below
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const { width: rawWindowWidth } = useWindowDimensions();
  const windowWidth = embedded ? paneWidths(rawWindowWidth).right : rawWindowWidth;
  useUnfoldToPage('SerumCurve', { embedded, params: embedded ? null : (route && route.params) || null });
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [protocols, setProtocols] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notCharted, setNotCharted] = useState({ iu: [], noData: [], noDose: [] });
  const [sourceOpen, setSourceOpen] = useState({}); // per compound id: its half-life source shown
  const [showCombined, setShowCombined] = useState(true);
  const [futureDays, setFutureDays] = useState(7);   // projection horizon
  // Readout: estimate levels on a chosen date, e.g. a blood-draw date.
  const [readoutDate, setReadoutDate] = useState(null); // ISO 'YYYY-MM-DD'; null = today
  const [showReadoutPicker, setShowReadoutPicker] = useState(false);
  const [labDates, setLabDates] = useState([]);         // distinct blood-exam dates
  // Founder 2026-10-02: the curve opens on the last 3 days (a new protocol fills the chart);
  // choosing an earlier date in "Estimate on a date" reaches the chart back to it.
  const pastDays = curveWindowDays(readoutDate, todayISO());

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      (async () => {
        // Dose accumulation / serum curve is a Premium feature. Guard here so no
        // entry path (deep link, back-stack) can reach it without an entitlement.
        // Embedded on a tab page there is no stack screen to replace: the Paywall opens as
        // a full screen over the tab (BK-11); the tabs only embed it for Premium anyway.
        if (!(await hasPremium())) {
          if (isMounted) {
            if (embedded) navigation.navigate('Paywall', { source: 'serum_direct' });
            else navigation.replace('Paywall', { source: 'serum_direct' });
          }
          return;
        }
        if (isMounted) fetchData();
      })();
      return () => { isMounted = false; };
    }, [navigation, embedded])
  );

  const userIdRef = useRef(null);
  async function fetchData() {
    const user = await getCachedUser();
    if (!user) return;
    userIdRef.current = user.id;
    const savedView = await loadCurveView(user.id);
    // Blends (Wolverine/Glow/KLOW) are expanded into one virtual protocol per
    // component, its dose split from the logged blend dose by the common ratio
    // (lib/compounds BLEND_RATIOS); each component charts its own line. IU-dosed
    // mass compounds, compounds without reliable half-life data and protocols with
    // no dose are NAMED on screen, never dropped silently (lib/serumModel).
    const entryOf = (p) => getHalfLifeEntry(matchName(p));
    const { active, iu, noData, noDose } = splitCurveProtocols(getActiveProtocols(user.id), t);
    setNotCharted({ iu, noData, noDose });
    setProtocols(active);
    // Opens exactly as the user left it (lib/curveView, founder 2026-10-02): the remembered
    // compounds still on the chart (one unit per chart), Combined and the horizon; nothing
    // remembered or valid → the first compound. Reading the view writes nothing.
    const u = (id) => { const p = active.find(x => x.id === id); return p ? curveUnit(entryOf(p)) : null; };
    const view = restoreCurveView({ saved: savedView, active, unitOf: u });
    setSelectedIds(view.selectedIds);
    setShowCombined(view.showCombined);
    setFutureDays(view.futureDays);
    // Distinct blood-exam dates (most recent first) to cross-reference against.
    const marks = getBiomarkers(user.id) || [];
    const uniq = [...new Set(marks.map(m => m.report_date).filter(Boolean))].sort().reverse();
    setLabDates(uniq);
  }

  // One muted line per reason a compound isn't on the curve.
  function notChartedLines() {
    const out = [];
    if (notCharted.noData.length) out.push(t('curve_not_charted').replace('{names}', notCharted.noData.join(', ')));
    if (notCharted.iu.length) out.push(t('curve_not_charted_iu').replace('{names}', notCharted.iu.join(', ')));
    if (notCharted.noDose.length) out.push(t('curve_not_charted_nodose').replace('{names}', notCharted.noDose.join(', ')));
    return out;
  }

  // Unit a protocol charts in ('mg' or 'IU').
  function unitOf(id) {
    const p = protocols.find(x => x.id === id);
    return p ? curveUnit(getHalfLifeEntry(matchName(p))) : 'mg';
  }

  // Only a change the user makes is remembered (per user), never the opening itself.
  function rememberView(patch) {
    saveCurveView(userIdRef.current, patch).then(() => notifyDataChanged('curve')).catch(() => {});
  }
  function nextSelection(prev, id) {
    if (prev.includes(id)) {
      // Never allow zero selected — keep the last one.
      return prev.length === 1 ? prev : prev.filter(x => x !== id);
    }
    // mg and IU can't share one axis: picking a compound in the other unit
    // starts a new selection with it.
    if (prev.length && unitOf(prev[0]) !== unitOf(id)) return [id];
    return [...prev, id];
  }
  function toggle(id) {
    const next = nextSelection(selectedIds, id);
    setSelectedIds(next);
    rememberView({ selectedIds: next });
  }
  function changeCombined(v) {
    setShowCombined(v);
    rememberView({ showCombined: !!v });
  }
  function changeHorizon(d) {
    setFutureDays(d);
    rememberView({ futureDays: d });
  }

  const chartWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH) - 32 - 32; // screen gutter + card padding
  const chartHeight = 220;
  const AXIS_W = 38;            // left gutter for mg labels
  const PLOT_TOP = 8;           // headroom above the peak
  const PLOT_BOTTOM = chartHeight - 10; // room for the scheduled-dose ticks under the axis
  const plotLeft = AXIS_W;
  const plotRight = chartWidth;
  const stepMs = STEP_HOURS * 3600 * 1000;

  // Shared plot mappers. Scale to a "nice" ceiling (plotMax) that sits ABOVE the
  // peak, so the highest spike never clips the top edge; set just after `model`.
  let plotMax = 1;
  const yForLevel = (lv) => PLOT_BOTTOM - (lv / plotMax) * (PLOT_BOTTOM - PLOT_TOP);
  const xForIndex = (i) => {
    const n = model ? model.nSteps : 1;
    return plotLeft + (i / (n || 1)) * (plotRight - plotLeft);
  };

  // One decay series per selected compound, all on a SHARED time axis and a
  // SHARED vertical scale (max across every selected series) so overlaid curves
  // are directly comparable.
  const model = useMemo(() => {
    const selected = protocols.filter(p => selectedIds.includes(p.id));
    if (!selected.length) return null;
    const now = Date.now();
    // Align the 6h sampling grid to 00/06/12/18 local time. Doses are placed at
    // 12:00, so every dose lands exactly ON a sample — otherwise a fast compound
    // (t½ ≲ 2h) sampled at arbitrary times of day draws near-zero or random
    // spikes that change with the minute you open the screen.
    const start = curveGridStart(now, pastDays);
    const end = now + futureDays * 24 * 3600 * 1000;
    const nSteps = Math.round((end - start) / stepMs);

    const series = selected.map(p => {
      const entry = getHalfLifeEntry(matchName(p));
      const doseMg = doseInCurveUnit(parseDecimal(p.dose), p.dose_unit, entry) || 0;
      const halfLifeMs = entry.hours * 3600 * 1000;
      // Dose events come from the protocol's SCHEDULE, not from hand-logged doses
      // (lib/serumModel scheduledDoses), snapped onto this 6h sample grid.
      const doses = scheduledDoses(p, entry, start, end, now);
      const points = [];
      const pre = [];
      for (let i = 0; i <= nSteps; i++) {
        const ts = start + i * stepMs;
        let level = 0, before = 0;
        for (const d of doses) {
          if (d > ts) continue;
          const c = doseMg * amountFraction(entry, (ts - d) / 3600000);
          level += c;
          if (d < ts) before += c;
        }
        points.push(level);
        pre.push(before);
      }
      // Exact level at this moment (not the last 6h sample), for the numbers.
      const nowLevel = levelAt(doses, doseMg, entry, now);
      const dosesInWindow = doses.filter(ts => ts >= start && ts <= now).length;
      return {
        id: p.id,
        p,
        name: p.__label || (p.compound_id ? t(p.compound_id) : p.name),
        color: displayColor(p.color) || colors.data,
        fromBlend: !!p.__blend,
        entry,
        points,
        pre,
        nowLevel,
        dosesInWindow,
        doses,       // raw dose timestamps, for date-readout math
        doseMg,
        unit: curveUnit(entry),
        halfLifeMs,
      };
    });

    // Auto-group by shared active substance (e.g. two testosterone esters).
    // A "combined" line sums the point-by-point levels of a group's members —
    // meaningful only within one active substance, which is why ungrouped
    // compounds (no `substance` tag) never contribute to a total.
    const bySubstance = {};
    for (const ser of series) {
      const sub = ser.entry.substance;
      if (!sub) continue;
      (bySubstance[sub] ||= []).push(ser);
    }
    const combined = Object.entries(bySubstance)
      .filter(([, members]) => members.length >= 2)
      .map(([sub, members]) => {
        const points = new Array(nSteps + 1).fill(0);
        const pre = new Array(nSteps + 1).fill(0);
        for (const ser of members) for (let i = 0; i <= nSteps; i++) { points[i] += ser.points[i]; pre[i] += ser.pre[i]; }
        const nowLevel = members.reduce((sum, m) => sum + m.nowLevel, 0);
        return { id: `combined:${sub}`, substance: sub, members: members.map(m => m.id), points, pre, nowLevel };
      });

    // Shared vertical scale spans the individual series and, when shown, the
    // (taller) combined totals — so every line is directly comparable.
    let max = series.reduce((m, ser) => Math.max(m, ...ser.points), 0);
    if (showCombined) max = combined.reduce((m, c) => Math.max(m, ...c.points), max);
    // Last sample at or before now — rounding up could count a dose later today.
    const nowIdx = Math.min(nSteps, Math.floor((now - start) / stepMs));
    // Exact position of this moment (fractional step) — the Now marker and dots
    // sit here, at the same exact level the numbers show.
    const nowF = Math.min(nSteps, (now - start) / stepMs);
    return { series, combined, max, nowIdx, nowF, nSteps, start, now, unit: series[0] ? series[0].unit : 'mg' };
  }, [protocols, selectedIds, t, colors.data, showCombined, futureDays, pastDays]);

  // Part 17 (prototype curveScreen): three grid lines — 0, half the peak, the peak — on an
  // axis whose top is the peak × 1.12, so the highest spike never clips the top edge.
  const ticksY = curveTicks(model ? model.max : 0);
  if (model && model.max > 0) plotMax = ticksY.top;

  const nowX = model ? xForIndex(model.nowF) : plotLeft;
  const single = model && model.series.length === 1 ? model.series[0] : null;
  // One compound draws in data blue (prototype curveScreen); several keep their protocol colors.
  const lineColor = (ser) => (single ? colors.data : ser.color);

  // ── Date readout (cross-reference a blood-draw date) ──
  const now = Date.now();
  // Same aligned origin as the model's sample grid, so the readout marker sits
  // exactly where the curve's samples are.
  const winStart = model ? model.start : now - pastDays * 24 * 3600 * 1000;
  const winEnd = now + futureDays * 24 * 3600 * 1000;
  const readoutISO = readoutDate || todayISO();
  const readoutRaw = new Date(readoutISO + 'T12:00:00').getTime();
  // On the sample grid (same snap as the doses), so a clock change never moves
  // the readout off the line or across a dose.
  // Today reads at THIS moment (same as the Est. level stat), not noon.
  const readoutT = readoutISO === todayISO() ? (model ? model.now : now)
    : model ? model.start + Math.round((readoutRaw - model.start) / stepMs) * stepMs : readoutRaw;
  // Estimated mg of one series at an arbitrary timestamp (direct decay sum).
  const levelAtDate = (ser, T) => levelAt(ser.doses, ser.doseMg, ser.entry, T);
  // The same for a chosen date past the projection: its own scheduled doses up to that date.
  const readoutLevel = (ser, T) => (T <= winEnd || !model ? levelAtDate(ser, T)
    : levelAt(scheduledDoses(ser.p, ser.entry, model.start, T, model.now), ser.doseMg, ser.entry, T));
  // Part 19: the next three days with a scheduled dose, as chips.
  const upcoming = useMemo(
    () => upcomingDoseDays(protocols.filter(p => selectedIds.includes(p.id)), Date.now(), 3),
    [protocols, selectedIds],
  );
  const chipDay = (iso) => formatDate(iso, language, 'weekdayDayMonth');
  const customDate = !!readoutDate && !upcoming.includes(readoutDate) && !labDates.includes(readoutDate);
  const pickDate = (iso) => setReadoutDate(prev => (prev === iso ? null : iso));
  const seriesById = {};
  if (model) for (const ser of model.series) seriesById[ser.id] = ser;
  // Marker x only when the readout date sits inside the plotted window.
  const readoutInWindow = readoutT >= winStart && readoutT <= winEnd;
  const readoutX = model ? xForIndex((readoutT - winStart) / stepMs) : plotLeft;
  const isToday = readoutISO === todayISO();
  const readoutShort = formatDate(readoutISO, language, 'dayMonth');

  // ── Motion ─────────────────────────────────────────────────────
  const reduceMotion = useReducedMotion();
  const geo = useMemo(() => ({ L: plotLeft, R: plotRight, T: PLOT_TOP, B: PLOT_BOTTOM }), [plotLeft, plotRight, PLOT_TOP, PLOT_BOTTOM]);
  const clock = useSharedValue(reduceMotion ? C_TOTAL : 0);
  const domainN = useSharedValue(1);
  const yMaxS = useSharedValue(1);
  const staticK = useSharedValue(1);   // grid/labels/markers — dip during a rescale
  const ready = useSharedValue(0);     // hides the animated layer until its scale is set
  const introPlayedRef = useRef(false);
  const introDoneRef = useRef(!!reduceMotion);
  const prevHorizonRef = useRef(futureDays);
  const lastModelRef = useRef(null);
  const [introFx, setIntroFx] = useState(null); // { drops:[], hitsSingle:[], showDrop }
  const introTimerRef = useRef(null);
  // Jump the opening moment to its end (a tap, or the model changing under it).
  const finishIntro = () => {
    if (introDoneRef.current) return;
    clearTimeout(introTimerRef.current);
    cancelAnimation(clock); clock.value = C_TOTAL; introDoneRef.current = true; setIntroFx(null);
  };
  useEffect(() => () => clearTimeout(introTimerRef.current), []);

  // Opening moment: plays once per screen open, the first time there's a model.
  useEffect(() => {
    if (!model || introPlayedRef.current) return;
    introPlayedRef.current = true;
    domainN.value = model.nSteps; yMaxS.value = plotMax; ready.value = 1;
    if (reduceMotion || model.max <= 0) { clock.value = C_TOTAL; introDoneRef.current = true; return; }
    const w = plotRight - plotLeft, h = PLOT_BOTTOM - PLOT_TOP;
    const drops = [];
    const hitsSingle = [];
    for (const ser of model.series) {
      for (const ts of ser.doses) {
        const idx = (ts - model.start) / stepMs;
        if (idx < 0 || idx > model.nowIdx || model.nowIdx <= 0) continue;
        const hit = C_DRAW * invInOutSine(idx / model.nowIdx);
        drops.push({ key: `${ser.id}-${ts}`, hit, color: lineColor(ser), x: plotLeft + (idx / model.nSteps) * w, y: PLOT_BOTTOM - (levelAtDate(ser, ts) / plotMax) * h });
        if (single && ser.id === single.id) hitsSingle.push(hit);
      }
    }
    // Keep it legible: every dose drops in for a normal schedule; a dense one
    // (many daily compounds) gets pulses only, and a very dense one nothing.
    const showDrop = drops.length <= 24;
    setIntroFx({ drops: drops.length <= 60 ? drops : [], hitsSingle, showDrop });
    clock.value = 0;
    clock.value = withTiming(C_TOTAL, { duration: C_TOTAL, easing: Easing.linear });
    introTimerRef.current = setTimeout(() => { introDoneRef.current = true; setIntroFx(null); }, C_TOTAL + 50);
  }, [model]);

  // Later changes (skips the first run, which the intro owns): a new horizon rescales smoothly; anything else (selection,
  // combined toggle, refetch) just re-draws at its scale.
  useEffect(() => {
    if (!model || !introPlayedRef.current) return;
    const horizonChanged = prevHorizonRef.current !== futureDays;
    prevHorizonRef.current = futureDays;
    // Any change mid-intro (selection, toggle, horizon, refetch) ends it: the
    // queued drops belong to the old model.
    const modelChanged = lastModelRef.current !== null && lastModelRef.current !== model;
    lastModelRef.current = model;
    if (modelChanged || horizonChanged) finishIntro();
    if (!horizonChanged || reduceMotion) { domainN.value = model.nSteps; yMaxS.value = plotMax; return; }
    const ease = { duration: 480, easing: Easing.inOut(Easing.cubic) };
    domainN.value = withTiming(model.nSteps, ease);
    yMaxS.value = withTiming(plotMax, ease);
    staticK.value = withSequence(withTiming(0, { duration: 90 }), withDelay(390, withTiming(1, { duration: 200 })));
  }, [model, plotMax, futureDays]);

  const mNow = model ? model.nowIdx : 0;
  const mNowF = model ? model.nowF : 0;
  const mN = model ? model.nSteps : 1;
  const gridProps = useAnimatedProps(() => ({ opacity: staticK.value }));
  const markerProps = useAnimatedProps(() => {
    const m = clamp01((clock.value - (C_DRAW + C_RISE + C_PROJ)) / 220);
    return { opacity: Math.min(staticK.value, m) };
  });
  const readoutGProps = useAnimatedProps(() => {
    const m = clamp01((clock.value - (C_DRAW + C_RISE + C_PROJ)) / 220);
    return { opacity: Math.min(staticK.value, m) };
  });
  const axisStyle = useAnimatedStyle(() => ({
    opacity: Math.min(staticK.value, clamp01((clock.value - C_DRAW) / C_RISE)),
  }));
  const zoneProps = useAnimatedProps(() => {
    const x = plotLeft + (mNowF / domainN.value) * (plotRight - plotLeft);
    const p0 = C_DRAW + C_RISE;
    const k = eOutCubic(clamp01((clock.value - p0) / C_PROJ));
    return { x, width: Math.max(0, (plotRight - x) * k), opacity: ready.value };
  }, [mNowF, plotLeft, plotRight]);
  const nowLineProps = useAnimatedProps(() => {
    const x = plotLeft + (mNowF / domainN.value) * (plotRight - plotLeft);
    const k = eOutCubic(clamp01((clock.value - C_DRAW) / C_RISE));
    return { x1: x, x2: x, y1: PLOT_BOTTOM - (PLOT_BOTTOM - PLOT_TOP) * k, y2: PLOT_BOTTOM, opacity: k > 0 ? ready.value : 0 };
  }, [mNowF, plotLeft, plotRight]);

  // Single-compound stats count along with the pen.
  const singlePts = single ? single.points : null;
  const singlePre = single ? single.pre : null;
  const singleNow = single ? single.nowLevel : 0;
  const singleDoseIdx = useMemo(() => {
    if (!single || !model) return [];
    return single.doses
      .map((ts) => (ts - model.start) / stepMs)
      .filter((i) => i >= 0 && i <= model.nowIdx);
  }, [single, model]);
  const statLevel = useDerivedValue(() => {
    if (!singlePts) return 0;
    const rev = Math.min(revealAt(clock.value, mNow, mN), mNow);
    // Counts along with the pen, then settles on the exact level at this moment.
    return rev >= mNow ? singleNow : levelAtStep(singlePts, singlePre, rev);
  }, [singlePts, singlePre, singleNow, mNow, mN]);
  const statDoses = useDerivedValue(() => {
    const rev = Math.min(revealAt(clock.value, mNow, mN), mNow);
    let c = 0;
    for (let i = 0; i < singleDoseIdx.length; i++) if (singleDoseIdx[i] <= rev + 1e-6) c++;
    return c;
  }, [singleDoseIdx, mNow, mN]);
  const hitsSingle = introFx ? introFx.hitsSingle : [];
  const statBump = useAnimatedStyle(() => ({ transform: [{ scale: bumpScale(clock.value, hitsSingle, 500, 0.12) }] }), [hitsSingle]);
  const unitLbl = model ? model.unit : 'mg';
  const numFmt = (v) => { 'worklet'; return !isFinite(v) || v <= 0 ? '0' : v < 10 ? v.toFixed(1).replace('.', decSep) : String(Math.round(v)); };
  const cntFmt = (v) => { 'worklet'; return String(Math.round(v)); };

  // Dropdown button label: the single compound's name, or "N compounds".
  const selCount = selectedIds.length;
  const buttonLabel = single
    ? single.name
    : `${selCount} ${t('curve_compounds_label')}`;

  // Evidence tier as an outline tag (DESIGN.md §5: no tinted chips); "no human data"
  // in attention so it stands out as the weakest basis.
  const tierCfg = {
    clinical: { fg: colors.ink2, border: colors.line, label: t('curve_tier_clinical') },
    studied: { fg: colors.ink2, border: colors.line, label: t('curve_tier_studied') },
    estimated: { fg: colors.attention, border: colors.attention, label: t('curve_tier_estimated') },
  };
  const backLabel = embedded ? null : backLabelFor(navigation, t);
  // AnimatedNumber is a fixed-width field: size it to the settled value so it never clips.
  const fontScale = PixelRatio.getFontScale();
  const numW = (str) => numberWidth(str, 34, fontScale);
  // Part 18: the Est. level field is as wide as the number actually drawn (measured from a
  // hidden copy), so its unit sits right next to the digits as in the prototype ("0.4 mg").
  const [levelW, setLevelW] = useState(null);
  const hl = single ? halfLifeParts(single.entry.hours, language) : null;
  // One plain-language note per compound on how this model draws it.
  const noteFor = (ser) => {
    if (ser.entry.tmaxHours) {
      // Oil-depot / SC-depot compounds: modeled rise to a published median peak.
      const lb = tmaxLabels(ser.entry);
      return t('curve_absorption_note').replace('{name}', ser.name).replace('{peak}', lb.peak).replace('{range}', lb.range);
    }
    // Depot esters WITHOUT a published peak time are drawn as instant: say so, so
    // they aren't read against the modeled rise of e.g. Cypionate.
    if (ser.entry.substance && ser.entry.hours >= 24) return t('curve_instant_note').replace('{name}', ser.name);
    // Compounds that clear between 6h samples draw a spike per dose, not a build-up.
    if (ser.entry.hours < STEP_HOURS) return t('curve_fast_note').replace('{names}', ser.name);
    return null;
  };
  const dateLong = (iso) => formatDate(iso, language, 'weekdayDayMonthYear');

  const title = <Text style={s.title}>{t('body_card_dosing_title')}</Text>;

  return (
    <SafeAreaView style={s.container} edges={embedded ? ['left', 'right', 'bottom'] : undefined}>
      {embedded ? <View style={s.navEmbedded} /> : (
        <View style={s.nav}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('common_back')}
          >
            <View style={s.backRow}>
              <View style={s.backChev}><RowChevron color={colors.ink} /></View>
              <Text style={s.back}>{backLabel}</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {protocols.length === 0 ? (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 16 }}>{title}</View>
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}><FeatureIcon name="curve" size={44} color={colors.ink3} /></View>
            <Text style={s.emptyTitle}>{t('curve_empty_title')}</Text>
            {notChartedLines().length ? (
              notChartedLines().map((line, i) => <Text key={line} style={[s.emptySub, i > 0 && { marginTop: 8 }]}>{line}</Text>)
            ) : (
              <Text style={s.emptySub}>{t('curve_empty_sub')}</Text>
            )}
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {title}

          {/* Compound picker row (.pickrow) — opens the multi-select sheet */}
          <TouchableOpacity
            style={s.pickrow}
            activeOpacity={0.7}
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('curve_choose_title')}
          >
            {model && model.series.map(ser => <View key={ser.id} style={[s.dot, { backgroundColor: ser.color }]} />)}
            <Text style={s.pickText} numberOfLines={1}>{buttonLabel}</Text>
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path d="M6.5 9.5 12 15l5.5-5.5" fill="none" stroke={colors.ink3} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          {notChartedLines().map(line => <Text key={line} style={s.notCharted}>{line}</Text>)}

          {/* Chart card */}
          <View style={s.card}>
            {/* Part 17: the number the Journey tile shows leads the card. */}
            {single ? (
              <View style={s.heroRow}>
                <View style={s.heroCol}>
                  <Text style={s.foot}>{t('curve_level_now')}</Text>
                  <Text style={[s.heroNum, { color: colors.data }]} numberOfLines={1} adjustsFontSizeToFit>
                    {mgLabel(single.nowLevel)}<Text style={s.unitInline}> {unitLbl}</Text>
                  </Text>
                </View>
                <View style={s.chip}><Text style={s.chipText}>{t('hy_estimated')}</Text></View>
              </View>
            ) : (
              <>
                {model && model.series.map(ser => (
                  <View key={`h-${ser.id}`} style={s.heroMultiRow}>
                    <View style={[s.dot, { backgroundColor: ser.color }]} />
                    <Text style={s.readoutName} numberOfLines={1}>{ser.name}</Text>
                    <Text style={s.readoutVal}>{mgLabel(ser.nowLevel)} {unitLbl}</Text>
                  </View>
                ))}
                <View style={s.chip}><Text style={s.chipText}>{t('hy_estimated')}</Text></View>
              </>
            )}
            <Text style={s.rangeLabel}>
              {t('curve_last_days')} {pastDays}d · +{futureDays}d {t('curve_projection')}
              {model && model.max > 0 ? ` · ${t('curve_peak')} ≈ ${mgLabel(model.max)} ${unitLbl}` : ''}
            </Text>

            {/* a touch on the chart skips the opening moment to its end */}
            <View onTouchStart={finishIntro}>
            <Svg width={chartWidth} height={chartHeight}>
              {/* future projection zone — opens at Now during the opening moment */}
              <ARect y={PLOT_TOP} height={PLOT_BOTTOM - PLOT_TOP} fill={colors.well} animatedProps={zoneProps} />
              {/* y-axis: gridlines + labels (dip and return during a rescale) */}
              <AG animatedProps={gridProps}>
              {ticksY.ticks.map((v, i) => (
                <React.Fragment key={i}>
                  <Line x1={plotLeft} y1={yForLevel(v)} x2={plotRight} y2={yForLevel(v)} stroke={colors.line} strokeWidth={1} strokeDasharray="2,3" />
                  <SvgText x={plotLeft - 4} y={yForLevel(v) + 3} fontSize={9} fontFamily={MONO['400']} fill={colors.ink3} textAnchor="end">
                    {axisLabel(v, language)}
                  </SvgText>
                </React.Fragment>
              ))}
              {/* a short tick under the axis for every scheduled dose in the window */}
              {model && model.max > 0 && model.series.map(ser => ser.doses
                .filter(ts => ts >= model.start && ts <= model.start + model.nSteps * stepMs)
                .map(ts => {
                  const x = xForIndex((ts - model.start) / stepMs);
                  return <Line key={`tk-${ser.id}-${ts}`} x1={x} y1={PLOT_BOTTOM + 2} x2={x} y2={PLOT_BOTTOM + 7} stroke={lineColor(ser)} strokeWidth={1.4} />;
                }))}
              <SvgText x={2} y={PLOT_TOP + 2} fontSize={9} fontFamily={MONO['400']} fill={colors.ink3} textAnchor="start">{unitLbl}</SvgText>
              </AG>
              {/* NOW line — rises from the baseline when the pen reaches today */}
              <ALine stroke={colors.ink} strokeWidth={1.4} animatedProps={nowLineProps} />
              {/* readout date marker (a chosen blood-draw date) — labeled so a
                  screenshot shows which date and level it represents */}
              <AG animatedProps={readoutGProps}>
              {model && model.max > 0 && readoutInWindow && !isToday && (
                <>
                  <Line x1={readoutX} y1={PLOT_TOP + 12} x2={readoutX} y2={PLOT_BOTTOM} stroke={colors.ink2} strokeWidth={1.2} strokeDasharray="2,3" />
                  <SvgText
                    x={Math.min(Math.max(readoutX, plotLeft + 20), plotRight - 20)}
                    y={PLOT_TOP + 8}
                    fontSize={10}
                    fontWeight="700"
                    fill={colors.ink2}
                    textAnchor="middle"
                  >
                    {readoutShort}
                  </SvgText>
                  {/* dots where the chosen date crosses each line */}
                  {model.series.map(ser => (
                    <Circle key={`ro-dot-${ser.id}`} cx={readoutX} cy={yForLevel(levelAtDate(ser, readoutT))} r={3.5} fill={lineColor(ser)} stroke={colors.raised} strokeWidth={1} />
                  ))}
                  {showCombined && model.combined.map(c => (
                    <Circle key={`ro-dot-${c.id}`} cx={readoutX} cy={yForLevel(c.members.reduce((sum, mid) => sum + (seriesById[mid] ? levelAtDate(seriesById[mid], readoutT) : 0), 0))} r={3.5} fill={colors.ink} stroke={colors.raised} strokeWidth={1} />
                  ))}
                </>
              )}
              </AG>
              {/* one overlaid curve per selected compound — drawn in time on open;
                  solid = estimate, dashed = projection */}
              {model && model.max > 0 && model.series.map(ser => (
                <CurveLine
                  key={ser.id}
                  points={ser.points} pre={ser.pre}
                  clock={clock} domainN={domainN} yMaxS={yMaxS} ready={ready} geo={geo}
                  nowIdx={model.nowIdx} nSteps={model.nSteps}
                  stroke={lineColor(ser)}
                  strokeWidth={2.2}
                />
              ))}
              {/* combined total per substance group — bold, on top */}
              {model && model.max > 0 && showCombined && model.combined.map(c => (
                <CurveLine
                  key={c.id}
                  points={c.points} pre={c.pre}
                  clock={clock} domainN={domainN} yMaxS={yMaxS} ready={ready} geo={geo}
                  nowIdx={model.nowIdx} nSteps={model.nSteps}
                  stroke={colors.ink} strokeWidth={3.2}
                />
              ))}
              {/* opening moment: each scheduled dose drops in; a pen leads each line */}
              {introFx && introFx.drops.map(dp => (
                <DoseDrop key={dp.key} clock={clock} hit={dp.hit} x={dp.x} y={dp.y} color={dp.color} showDrop={introFx.showDrop} />
              ))}
              {introFx && model && model.max > 0 && model.series.map(ser => (
                <PenDot key={`pen-${ser.id}`} points={ser.points} pre={ser.pre} clock={clock} domainN={domainN} yMaxS={yMaxS} geo={geo} nowIdx={model.nowIdx} nSteps={model.nSteps} color={lineColor(ser)} />
              ))}
              {/* dots marking each line's level right now */}
              <AG animatedProps={markerProps}>
              {model && model.max > 0 && model.series.map(ser => (
                <Circle key={`d-${ser.id}`} cx={nowX} cy={yForLevel(ser.nowLevel)} r={3.5} fill={lineColor(ser)} />
              ))}
              {model && model.max > 0 && showCombined && model.combined.map(c => (
                <Circle key={`d-${c.id}`} cx={nowX} cy={yForLevel(c.nowLevel)} r={4} fill={colors.ink} />
              ))}
              </AG>
            </Svg>
            </View>

            <Animated.View style={[{ height: 16, marginLeft: AXIS_W, marginTop: 6 }, axisStyle]}>
              <Text style={[s.axisLabel, { position: 'absolute', left: 0 }]}>−{pastDays}d</Text>
              <Text style={[s.axisLabel, { position: 'absolute', right: 0 }]}>+{futureDays}d</Text>
              {model && (
                <Text style={[s.axisNow, { position: 'absolute', left: Math.max(0, (nowX - AXIS_W) - 14) }]}>
                  {t('curve_now')}
                </Text>
              )}
            </Animated.View>

            {/* Legend (part 17): estimate · projection · scheduled doses */}
            <View style={s.legendKeys}>
              <View style={s.legendKey}><View style={s.lgSolid} /><Text style={s.legendKeyText}>{t('curve_lg_estimate')}</Text></View>
              <View style={s.legendKey}><View style={s.lgDash}>{[0, 1, 2].map(k => <View key={k} style={s.lgDashBit} />)}</View><Text style={s.legendKeyText}>{t('curve_lg_projection')}</Text></View>
              <View style={s.legendKey}><View style={s.lgTick} /><Text style={s.legendKeyText}>{t('curve_lg_doses')}</Text></View>
            </View>

            {/* Projection horizon: the shared bar */}
            <View style={s.fld}>
              <Text style={s.fldLabel}>{t('curve_project_ahead')}</Text>
              <SegmentedBar
                accessibilityLabel={t('curve_project_ahead')}
                items={FUTURE_PRESETS.map(d => ({ key: d, label: `+${d}d` }))}
                value={futureDays}
                onChange={changeHorizon}
              />
            </View>
          </View>

          {single ? (
            // One compound → the three stats (.curvestats), 34 pt numbers.
            <View style={s.curvestats}>
              <View style={s.statCol}>
                <Text style={s.statCap}>{t('curve_current_level')}</Text>
                <View style={s.statNumRow}>
                  <Text style={[s.statNum, s.measure]} onLayout={(e) => setLevelW(Math.ceil(e.nativeEvent.layout.width) + 2)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{mgLabel(singleNow)}</Text>
                  <Animated.View style={statBump}>
                    <AnimatedNumber key={language} value={statLevel} format={numFmt} style={[s.statNum, { color: colors.data }]} width={levelW != null ? levelW : numW(mgLabel(singleNow))} />
                  </Animated.View>
                  <Text style={s.statUnit}>{unitLbl}</Text>
                </View>
              </View>
              <View style={s.statCol}>
                <Text style={s.statCap}>{t('curve_half_life')}</Text>
                <View style={s.statNumRow}>
                  <Text style={s.statNum}>{hl.num}</Text>
                  <Text style={s.statUnit}>{hl.unit}</Text>
                </View>
              </View>
              <View style={s.statCol}>
                <Text style={s.statCap}>{t('curve_doses_counted')}</Text>
                <AnimatedNumber value={statDoses} format={cntFmt} style={s.statNum} width={numW(single.dosesInWindow)} />
              </View>
            </View>
          ) : (
            // Multiple compounds → a legend, one row each, sharing the y-scale.
            <View style={s.list}>
              <Text style={[s.statCap, { paddingTop: 14 }]}>{t('curve_current_level')}</Text>
              {model && model.series.map(ser => (
                <View key={ser.id} style={s.legendRow}>
                  <View style={[s.dot, { backgroundColor: ser.color }]} />
                  <View style={s.legendNameCol}>
                    <Text style={s.legendName} numberOfLines={1}>{ser.name}</Text>
                    <Text style={[s.legendTier, { color: tierCfg[ser.entry.tier].fg }]} numberOfLines={1}>
                      {tierCfg[ser.entry.tier].label}
                    </Text>
                  </View>
                  <Text style={s.legendLevel}>{mgLabel(ser.nowLevel)}<Text style={s.unitInline}> {unitLbl}</Text></Text>
                  <Text style={s.legendHalf}>t½ {halfLifeLabel(ser.entry.hours, language)}</Text>
                </View>
              ))}
              {showCombined && model && model.combined.map(c => (
                <View key={c.id} style={s.legendRow}>
                  <View style={[s.combinedSwatch, { backgroundColor: colors.ink }]} />
                  <Text style={[s.legendName, { flex: 1, fontWeight: '700' }]} numberOfLines={1}>
                    {t('curve_combined')} · {t(`substance_${c.substance}`)}
                  </Text>
                  <Text style={[s.legendLevel, { fontWeight: '700' }]}>{mgLabel(c.nowLevel)}<Text style={s.unitInline}> {unitLbl}</Text></Text>
                  <Text style={s.legendHalf}> </Text>
                </View>
              ))}
            </View>
          )}

          {/* Combined-total toggle — only when a same-substance group exists */}
          {model && model.combined.length > 0 && (
            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleLabel}>{t('curve_combined_toggle')}</Text>
                <Text style={s.toggleHint}>{t('curve_combined_hint')}</Text>
              </View>
              <GradSwitch
                value={showCombined}
                onValueChange={changeCombined}
              />
            </View>
          )}

          {/* ── Estimate on a date (cross-reference a blood draw) ── */}
          <View style={s.card}>
            <Text style={s.cardHead}>{t('curve_readout_title')}</Text>
            {/* Part 19: the next three dose days, "Other date" (the wheel), then bloodwork dates. */}
            <View style={s.chips}>
              {upcoming.slice(0, 3).map(d => {
                const on = readoutDate === d;
                return (
                  <TouchableOpacity key={d} style={[s.pill, on && s.pillOn]} onPress={() => pickDate(d)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <Text style={[s.pillText, on && s.pillTextOn]}>{chipDay(d)}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={[s.pill, customDate && s.pillOn]} onPress={() => setShowReadoutPicker(true)} accessibilityRole="button" accessibilityState={{ selected: customDate }}>
                <Text style={[s.pillText, customDate && s.pillTextOn]}>{customDate ? dateLong(readoutDate) : t('curve_other_date')}</Text>
              </TouchableOpacity>
            </View>

            {labDates.length > 0 && (
              <>
                <Text style={s.foot}>{t('curve_readout_lab_hint')}</Text>
                <View style={s.chips}>
                  {labDates.map(d => {
                    const on = readoutDate === d;
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[s.pill, on && s.pillOn]}
                        onPress={() => pickDate(d)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                      >
                        <Text style={[s.pillText, on && s.pillTextOn]}>
                          {t('curve_bloodwork_chip').replace('{date}', formatDate(d, language, 'dayMonth'))}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* the estimate on the chosen date, per line */}
            {readoutDate ? (
              <>
                <View style={s.sep} />
                {model && model.series.map(ser => (
                  <View key={`ro-${ser.id}`} style={s.readoutRow}>
                    <View style={[s.dot, { backgroundColor: ser.color }]} />
                    <Text style={s.readoutName} numberOfLines={2}>{ser.name} · {readoutShort}</Text>
                    <Text style={s.readoutVal}>{readoutT < model.start ? '—' : mgLabel(readoutLevel(ser, readoutT))} {unitLbl}</Text>
                  </View>
                ))}
                {showCombined && model && model.combined.map(c => (
                  <View key={`ro-${c.id}`} style={s.readoutRow}>
                    <View style={[s.combinedSwatch, { backgroundColor: colors.ink }]} />
                    <Text style={[s.readoutName, { fontWeight: '700' }]} numberOfLines={2}>
                      {t('curve_combined')} · {t(`substance_${c.substance}`)} · {readoutShort}
                    </Text>
                    <Text style={s.readoutVal}>
                      {mgLabel(c.members.reduce((sum, mid) => sum + (seriesById[mid] ? readoutLevel(seriesById[mid], readoutT) : 0), 0))} {unitLbl}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
          </View>

          {/* Honesty: evidence tier, how the model draws it, and the source — one tap away */}
          {model && (
            <View style={s.card}>
              {model.series.map((ser, i) => {
                const tier = tierCfg[ser.entry.tier];
                const note = model.max > 0 ? noteFor(ser) : null;
                const open = !!sourceOpen[ser.id];
                return (
                  <View key={`n-${ser.id}`} style={[s.noteBlock, i > 0 && s.noteSep]}>
                    <View style={s.noteHead}>
                      <View style={[s.dot, { backgroundColor: ser.color }]} />
                      <Text style={s.noteName}>{ser.name}</Text>
                      <View style={[s.otag, { borderColor: tier.border }]}>
                        <Text style={[s.otagText, { color: tier.fg }]}>{tier.label}</Text>
                      </View>
                    </View>
                    {note ? <Text style={s.foot}>{note}</Text> : null}
                    {open ? <Text style={s.sourceText}>{ser.entry.source}</Text> : null}
                    <TouchableOpacity
                      onPress={() => setSourceOpen(o => ({ ...o, [ser.id]: !o[ser.id] }))}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      hitSlop={{ top: 8, bottom: 8 }}
                      style={s.linkBtn}
                    >
                      <Text style={s.link}>{t('curve_source_label')} {open ? '▴' : '▾'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {model.series.some(ser => ser.fromBlend) && (
                <Text style={[s.foot, s.noteSep]}>{t('blend_curve_caveat')}</Text>
              )}
            </View>
          )}

          <Text style={s.disclaimer}>{t('curve_disclaimer')}</Text>
        </ScrollView>
      )}

      {/* "Other date": the prototype wheel in a DoseTrace bottom sheet (part 19). */}
      <DTPickerSheet visible={showReadoutPicker} title={t('curve_readout_title')} doneLabel={t('curve_done')} onDone={() => { if (!readoutDate) setReadoutDate(todayISO()); setShowReadoutPicker(false); }}>
        <DTWheel
          columns={dateColumns(readoutISO, new Date(), MONTHS_SHORT[language] || MONTHS_SHORT.en)}
          onChange={(col, i) => setReadoutDate(dateAfter(readoutISO, new Date(), col, i))}
        />
      </DTPickerSheet>

      {/* Multi-select picker sheet */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={s.modalScrim} onPress={() => setPickerOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetHeadRow}>
              <Text style={s.sheetTitle}>{t('curve_choose_title')}</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)} accessibilityRole="button" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={s.sheetDoneText}>{t('curve_done')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.sheetHint}>{t('curve_choose_hint')}</Text>
            <ScrollView style={s.sheetList} contentContainerStyle={s.actlist}>
              {protocols.map((p, i) => {
                const on = selectedIds.includes(p.id);
                const entry = getHalfLifeEntry(matchName(p));
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.actrow, i > 0 && s.actrowSep, on && s.actrowOn]}
                    activeOpacity={0.7}
                    onPress={() => toggle(p.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <View style={[s.dot, { backgroundColor: displayColor(p.color) || colors.data }]} />
                    <View style={s.optionMain}>
                      <Text style={s.optionName} numberOfLines={1}>{p.compound_id ? t(p.compound_id) : p.name}</Text>
                      <Text style={s.optionSub}>t½ {halfLifeLabel(entry.hours, language)} · {tierCfg[entry.tier].label}{curveUnit(entry) === 'IU' ? ' · IU' : ''}</Text>
                    </View>
                    {on ? <CheckMark size={22} color={colors.ink} /> : <View style={{ width: 22 }} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {notChartedLines().map(line => <Text key={`sheet-${line}`} style={s.sheetFoot}>{line}</Text>)}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// Graduated (docs/design/prototype.html curveScreen() / curvePicker(); DESIGN.md §3–§5, §7).
function makeStyles(c) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.ground },
    nav: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
    navEmbedded: { height: 8 }, // on a book page: the title lines up with the left page's title
    back: { fontSize: 17, color: c.ink },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backChev: { transform: [{ scaleX: -1 }] },
    title: { fontSize: 34, fontWeight: '600', color: c.ink, letterSpacing: -0.7, paddingHorizontal: 4, paddingTop: 4, paddingBottom: 12 },
    scroll: { paddingHorizontal: 16, paddingBottom: 24, gap: 14, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },

    // the title already carries the screen gutter inside the scroll
    pickrow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.raised, borderRadius: 18, minHeight: 56, paddingHorizontal: 16 },
    pickText: { flex: 1, fontSize: 17, fontWeight: '600', color: c.ink },
    dot: { width: 9, height: 9, borderRadius: 5 },
    notCharted: { fontSize: 13, color: c.ink2, lineHeight: 18, paddingHorizontal: 4 },

    card: { backgroundColor: c.raised, borderRadius: 24, padding: 18, gap: 12 },
    // part 17 hero: "Est. level · now" + the 56 pt number in data blue, the chip on the right
    heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    heroCol: { flex: 1, minWidth: 0, gap: 4 },
    heroNum: { fontSize: 56, lineHeight: 60, fontWeight: '500', letterSpacing: -1.6, fontVariant: ['tabular-nums'] },
    heroMultiRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    legendKeys: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 6 },
    legendKey: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendKeyText: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: c.ink2 },
    lgSolid: { width: 18, height: 2, backgroundColor: c.data },
    lgDash: { width: 18, height: 2, flexDirection: 'row', justifyContent: 'space-between' },
    lgDashBit: { width: 4, height: 2, backgroundColor: c.data },
    lgTick: { width: 2, height: 8, backgroundColor: c.data },
    rangeLabel: { flex: 1, fontSize: 13, lineHeight: 18, color: c.ink2, fontVariant: ['tabular-nums'] },
    chip: { alignSelf: 'flex-start', minHeight: 26, borderRadius: 13, borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, paddingVertical: 2, justifyContent: 'center' },
    chipText: { fontSize: 12, fontWeight: '500', color: c.ink2 },
    axisLabel: { fontSize: 11, color: c.ink3, fontFamily: MONO['400'] },
    axisNow: { fontSize: 11, color: c.ink, fontWeight: '700' },

    fld: { gap: 10 },
    fldLabel: { fontSize: 13, color: c.ink2 },

    curvestats: { flexDirection: 'row', gap: 8, backgroundColor: c.raised, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16 },
    statCol: { flex: 1, minWidth: 0, gap: 4 },
    statCap: { fontSize: 12, fontWeight: '500', color: c.ink2 },
    statNumRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
    statNum: { fontSize: 34, fontWeight: '300', color: c.ink, letterSpacing: -1, fontVariant: ['tabular-nums'] },
    statUnit: { fontSize: 13, color: c.ink3, fontFamily: MONO['400'], marginLeft: 3 },
    // the hidden copy that measures the Est. level number (same font as AnimatedNumber)
    measure: { position: 'absolute', left: 0, top: 0, opacity: 0, fontFamily: fontFamilyFor('300'), fontWeight: undefined },
    unitInline: { fontSize: 13, color: c.ink3, fontFamily: MONO['400'] },

    list: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    legendNameCol: { flex: 1, minWidth: 0 },
    legendName: { fontSize: 17, color: c.ink },
    legendTier: { fontSize: 12, fontWeight: '500', marginTop: 2 },
    legendLevel: { fontSize: 15, fontWeight: '500', color: c.ink, fontFamily: MONO['500'], textAlign: 'right', fontVariant: ['tabular-nums'] },
    legendHalf: { fontSize: 13, color: c.ink3, width: 64, textAlign: 'right' },
    combinedSwatch: { width: 16, height: 4, borderRadius: 2 },

    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.raised, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14 },
    toggleLabel: { fontSize: 17, fontWeight: '600', color: c.ink },
    toggleHint: { fontSize: 13, color: c.ink2, marginTop: 2, lineHeight: 18 },

    cardHead: { fontSize: 17, fontWeight: '600', color: c.ink },
    dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, borderRadius: 14, backgroundColor: c.well, paddingHorizontal: 14 },
    dateBtnText: { fontSize: 17, color: c.ink },
    foot: { fontSize: 13, lineHeight: 18, color: c.ink2 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    pill: { flexDirection: 'row', alignItems: 'center', minHeight: 36, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line },
    pillOn: { borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.raised, paddingHorizontal: 13.5 },
    pillText: { fontSize: 13, color: c.ink2 },
    pillTextOn: { color: c.ink, fontWeight: '600' },
    sep: { height: 1, backgroundColor: c.line },
    readoutRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    readoutName: { flex: 1, fontSize: 17, lineHeight: 22, color: c.ink },
    readoutVal: { fontSize: 17, lineHeight: 22, color: c.ink, fontFamily: MONO['500'], fontVariant: ['tabular-nums'] },

    noteBlock: { gap: 6 },
    noteSep: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12 },
    noteHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    noteName: { fontSize: 17, fontWeight: '600', color: c.ink, flexShrink: 1 },
    otag: { minHeight: 24, borderRadius: 12, borderWidth: 1, paddingHorizontal: 9, justifyContent: 'center' },
    otagText: { fontSize: 12, fontWeight: '600' },
    sourceText: { fontSize: 13, lineHeight: 18, color: c.ink3 },
    linkBtn: { minHeight: 28, justifyContent: 'center', alignSelf: 'flex-start' },
    link: { fontSize: 13, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
    disclaimer: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },

    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    emptyIcon: { marginBottom: 12 },
    emptyTitle: { fontSize: 22, fontWeight: '600', color: c.ink, marginBottom: 8, textAlign: 'center' },
    emptySub: { fontSize: 15, lineHeight: 20, color: c.ink2, textAlign: 'center' },

    modalScrim: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.raised, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 32, gap: 12, maxHeight: '80%', width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
    sheetHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    sheetTitle: { fontSize: 22, fontWeight: '600', color: c.ink, flexShrink: 1 },
    sheetDoneText: { fontSize: 17, fontWeight: '600', color: c.ink },
    sheetHint: { fontSize: 15, color: c.ink2 },
    sheetList: { flexGrow: 0 },
    actlist: { borderRadius: 16, borderWidth: 1, borderColor: c.line, overflow: 'hidden' },
    actrow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, paddingHorizontal: 14 },
    actrowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    actrowOn: { borderWidth: 2, borderColor: c.ink, borderRadius: 16 },
    optionMain: { flex: 1, minWidth: 0 },
    optionName: { fontSize: 17, fontWeight: '600', color: c.ink },
    optionSub: { fontSize: 15, color: c.ink2, marginTop: 2 },
    sheetFoot: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  });
}
