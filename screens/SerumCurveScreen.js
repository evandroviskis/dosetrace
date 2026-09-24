import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Switch,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Svg, { Path, G, Line, Rect, Circle, Text as SvgText } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedProps, useAnimatedStyle, useDerivedValue, useReducedMotion,
  withTiming, withDelay, withSequence, cancelAnimation, Easing,
} from 'react-native-reanimated';
import { AnimatedNumber, clamp01, eOutQuad, eInOutSine, eOutCubic, invInOutSine, bumpScale, dropPath } from '../components/motion';

import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { translations } from '../i18n/translations';
import { getActiveProtocols, getBiomarkers } from '../lib/database';
import { expectedDosesOn } from '../lib/schedule';
import { getHalfLifeEntry } from '../lib/halfLives';
import { BLEND_IDS, blendComponents } from '../lib/compounds';
import { useTheme } from '../lib/theme';
import FeatureIcon from '../components/FeatureIcon';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { isPremium } from '../lib/purchases';

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
function seriesD(pts, pre, rev, domN, yMax, g) {
  'worklet';
  const n = pts.length;
  const last = Math.min(rev, n - 1, domN);
  if (last <= 0 || yMax <= 0 || domN <= 0) return 'M ' + g.L + ' ' + g.B;
  const w = g.R - g.L, h = g.B - g.T;
  const k = Math.floor(last);
  let d = '';
  for (let i = 0; i <= k; i++) {
    const x = (g.L + (i / domN) * w).toFixed(1);
    if (i > 0 && pre[i] !== pts[i]) d += ' L ' + x + ' ' + (g.B - (pre[i] / yMax) * h).toFixed(1);
    d += (i === 0 ? 'M ' : ' L ') + x + ' ' + (g.B - (pts[i] / yMax) * h).toFixed(1);
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

// One curve (a compound or a combined total), driven entirely on the UI thread.
function CurveLine({ points, pre, clock, domainN, yMaxS, ready, geo, nowIdx, nSteps, stroke, strokeWidth, strokeDasharray }) {
  const props = useAnimatedProps(() => ({
    d: seriesD(points, pre, revealAt(clock.value, nowIdx, nSteps), domainN.value, yMaxS.value, geo),
    opacity: ready.value,
  }), [points, pre, nowIdx, nSteps, geo]);
  return <APath animatedProps={props} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray} strokeLinejoin="round" strokeLinecap="round" />;
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

const PAST_DAYS = 14;
const FUTURE_PRESETS = [7, 14, 30, 60, 90];
const STEP_HOURS = 6;
// Local hours for N scheduled doses in one day (on the 00/06/12/18 sample grid).
const DOSE_SLOTS = { 1: [12], 2: [6, 18], 3: [6, 12, 18], 4: [0, 6, 12, 18] };

// Matching must run on the ENGLISH compound name: compound_id renders localized
// via t(), but the half-life table is keyed in English.
function matchName(protocol) {
  if (protocol.compound_id && translations.en[protocol.compound_id]) {
    return translations.en[protocol.compound_id];
  }
  return protocol.name || '';
}

function doseInMg(protocol) {
  const dose = Number(protocol.dose);
  if (!dose || !isFinite(dose) || dose <= 0) return 1;
  return (protocol.dose_unit || '').toLowerCase() === 'mcg' ? dose / 1000 : dose;
}

// Estimated amount still in the body (mg), from the summed-decay model. Rough,
// not a serum concentration — the disclaimer says so.
const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

function todayISO() {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function mgLabel(v) {
  if (!isFinite(v) || v <= 0) return '0';
  if (v < 10) return v.toFixed(1);
  return String(Math.round(v));
}

function halfLifeLabel(hours) {
  if (hours == null) return '—';
  if (hours >= 48) {
    const days = hours / 24;
    return `${Number.isInteger(days) ? days : days.toFixed(1)}d`;
  }
  return `${hours}h`;
}

export default function SerumCurveScreen() {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { width: windowWidth } = useWindowDimensions();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [protocols, setProtocols] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notCharted, setNotCharted] = useState({ iu: [], noData: [] });
  const [sourceOpen, setSourceOpen] = useState(false);
  const [showCombined, setShowCombined] = useState(true);
  const [futureDays, setFutureDays] = useState(7);   // projection horizon
  // Readout: estimate levels on a chosen date, e.g. a blood-draw date.
  const [readoutDate, setReadoutDate] = useState(null); // ISO 'YYYY-MM-DD'; null = today
  const [showReadoutPicker, setShowReadoutPicker] = useState(false);
  const [labDates, setLabDates] = useState([]);         // distinct blood-exam dates

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      (async () => {
        // Dose accumulation / serum curve is a Premium feature. Guard here so no
        // entry path (deep link, back-stack) can reach it without an entitlement.
        if (!(await isPremium())) {
          if (isMounted) navigation.replace('Paywall', { source: 'serum_direct' });
          return;
        }
        if (isMounted) fetchData();
      })();
      return () => { isMounted = false; };
    }, [navigation])
  );

  async function fetchData() {
    const user = await getCachedUser();
    if (!user) return;
    // Blends (Wolverine/Glow/KLOW) are expanded into one virtual protocol per
    // component, its dose split from the logged blend dose by the common ratio
    // (lib/compounds BLEND_RATIOS). Each component then charts its own line, like
    // any compound. Ratios vary by source — the curve shows the blend_curve_caveat.
    const BLEND_COLORS = ['#4C93E0', '#1D9E75', '#D85A30', '#7F77DD'];
    const raw = (getActiveProtocols(user.id) || []).filter(p => ['recon', 'rtu'].includes(p.type));
    const expanded = [];
    for (const p of raw) {
      const comps = p.compound_id && BLEND_IDS.includes(p.compound_id) ? blendComponents(p.compound_id, p.dose) : null;
      if (comps && comps.length) {
        comps.forEach((c, idx) => expanded.push({
          ...p, id: `${p.id}__${c.id}`, compound_id: c.id, dose: c.dose,
          color: BLEND_COLORS[idx % BLEND_COLORS.length],
          __label: `${t(p.compound_id)} · ${t(c.id)} ${t('blend_est_marker')}`, __blend: p.compound_id,
        }));
      } else {
        expanded.push(p);
      }
    }
    // IU-dosed compounds (HCG, insulins, HMG/FSH) can't be plotted or summed on a
    // mg axis — IU→mg is not a unit conversion — so they're excluded from the curve.
    // Compounds without reliable half-life data are excluded too. Both are NAMED on
    // screen, never dropped silently (a user must not think their protocol vanished).
    const isIU = (p) => (p.dose_unit || '').toLowerCase() === 'iu';
    const active = expanded.filter(p => !isIU(p) && getHalfLifeEntry(matchName(p)) != null);
    const nameOf = (p) => p.__blend ? t(p.__blend) : (p.compound_id ? t(p.compound_id) : p.name);
    const uniqNames = (list) => [...new Set(list.map(nameOf).filter(Boolean))];
    setNotCharted({
      iu: uniqNames(expanded.filter(isIU)),
      noData: uniqNames(expanded.filter(p => !isIU(p) && getHalfLifeEntry(matchName(p)) == null)),
    });
    setProtocols(active);
    // Keep any still-valid selection; otherwise default to the first compound.
    setSelectedIds(prev => {
      const kept = prev.filter(id => active.some(p => p.id === id));
      return kept.length ? kept : (active[0] ? [active[0].id] : []);
    });
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
    return out;
  }

  function toggle(id) {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        // Never allow zero selected — keep the last one.
        return prev.length === 1 ? prev : prev.filter(x => x !== id);
      }
      return [...prev, id];
    });
  }

  const chartWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH) - 32 - 28;
  const chartHeight = 220;
  const AXIS_W = 38;            // left gutter for mg labels
  const PLOT_TOP = 8;           // headroom above the peak
  const PLOT_BOTTOM = chartHeight - 4;
  const plotLeft = AXIS_W;
  const plotRight = chartWidth;
  const stepMs = STEP_HOURS * 3600 * 1000;

  // Shared plot mappers. Scale to a "nice" ceiling (plotMax) that sits ABOVE the
  // peak, so the highest spike never clips the top edge; set just after `model`.
  let plotMax = 1;
  let yStep = 1;
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
    const s0 = new Date(now - PAST_DAYS * 24 * 3600 * 1000);
    s0.setHours(Math.floor(s0.getHours() / STEP_HOURS) * STEP_HOURS, 0, 0, 0);
    const start = s0.getTime();
    const end = now + futureDays * 24 * 3600 * 1000;
    const nSteps = Math.round((end - start) / stepMs);

    const DAY_MS = 86400000;
    const series = selected.map(p => {
      const entry = getHalfLifeEntry(matchName(p));
      const doseMg = doseInMg(p);
      const halfLifeMs = entry.hours * 3600 * 1000;
      // Dose events come from the protocol's SCHEDULE (start date + interval +
      // doses/day), not from hand-logged doses — so the curve reflects the
      // protocol automatically, past and projected. Scan back far enough that
      // long esters' earlier doses still contribute at the window start.
      const lookbackDays = Math.min(365, Math.max(PAST_DAYS + 2, Math.ceil(6 * entry.hours / 24)));
      let scanStart = now - lookbackDays * DAY_MS;
      if (p.start_date) {
        const sd = new Date(p.start_date + 'T00:00:00').getTime();
        if (isFinite(sd) && sd > scanStart) scanStart = sd;
      }
      const scanStartDay = new Date(scanStart); scanStartDay.setHours(0, 0, 0, 0);
      // Snap onto the sample grid: after a clock change local 12:00 is 1h off the
      // fixed 6h steps, and a fast compound's spike would fall between samples.
      const snap = (ts) => start + Math.round((ts - start) / stepMs) * stepMs;
      const doses = [];
      for (let dts = scanStartDay.getTime(); dts <= end; dts += DAY_MS) {
        const day = new Date(dts);
        // Count of scheduled doses that day (reminder-time-independent), spread
        // over the day's 6h sample slots — 1/day at 12:00, 2/day at 06+18, … — so
        // two doses draw as two spikes, not one double-height spike.
        const cnt = expectedDosesOn(p, day);
        const slots = DOSE_SLOTS[cnt] || DOSE_SLOTS[4];
        for (let k = 0; k < cnt; k++) {
          const dd = new Date(day); dd.setHours(slots[k % slots.length], 0, 0, 0);
          doses.push(snap(dd.getTime()));
        }
      }
      const points = [];
      const pre = [];
      for (let i = 0; i <= nSteps; i++) {
        const ts = start + i * stepMs;
        let level = 0, before = 0;
        for (const d of doses) {
          if (d > ts) continue;
          const c = doseMg * Math.exp((-Math.LN2 * (ts - d)) / halfLifeMs);
          level += c;
          if (d < ts) before += c;
        }
        points.push(level);
        pre.push(before);
      }
      // Exact level at this moment (not the last 6h sample), for the numbers.
      let nowLevel = 0;
      for (const d of doses) if (d <= now) nowLevel += doseMg * Math.exp((-Math.LN2 * (now - d)) / halfLifeMs);
      const dosesInWindow = doses.filter(ts => ts >= start && ts <= now).length;
      return {
        id: p.id,
        name: p.__label || (p.compound_id ? t(p.compound_id) : p.name),
        color: p.color || colors.accent,
        fromBlend: !!p.__blend,
        entry,
        points,
        pre,
        nowLevel,
        dosesInWindow,
        doses,       // raw dose timestamps, for date-readout math
        doseMg,
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
    return { series, combined, max, nowIdx, nowF, nSteps, start };
  }, [protocols, selectedIds, t, colors.accent, showCombined, futureDays]);

  // Round the axis up to a readable ceiling above the peak (so nothing clips).
  if (model && model.max > 0) {
    const raw = model.max / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    yStep = (raw / mag >= 5 ? 5 : raw / mag >= 2 ? 2 : 1) * mag;
    plotMax = Math.ceil(model.max / yStep) * yStep;
  }
  // mg tick values for the y-axis, 0 → plotMax.
  function yTicks() {
    if (!model || model.max <= 0) return [];
    const ticks = [];
    for (let v = 0; v <= plotMax + 0.001; v += yStep) ticks.push(v);
    return ticks;
  }

  const nowX = model ? xForIndex(model.nowF) : plotLeft;
  const single = model && model.series.length === 1 ? model.series[0] : null;

  // ── Date readout (cross-reference a blood-draw date) ──
  const now = Date.now();
  // Same aligned origin as the model's sample grid, so the readout marker sits
  // exactly where the curve's samples are.
  const winStart = model ? model.start : now - PAST_DAYS * 24 * 3600 * 1000;
  const winEnd = now + futureDays * 24 * 3600 * 1000;
  const readoutISO = readoutDate || todayISO();
  const readoutRaw = new Date(readoutISO + 'T12:00:00').getTime();
  // On the sample grid (same snap as the doses), so a clock change never moves
  // the readout off the line or across a dose.
  const readoutT = model ? model.start + Math.round((readoutRaw - model.start) / stepMs) * stepMs : readoutRaw;
  // Estimated mg of one series at an arbitrary timestamp (direct decay sum).
  const levelAtDate = (ser, T) => {
    let lv = 0;
    for (const d of ser.doses) if (d <= T) lv += ser.doseMg * Math.exp((-Math.LN2 * (T - d)) / ser.halfLifeMs);
    return lv;
  };
  const seriesById = {};
  if (model) for (const ser of model.series) seriesById[ser.id] = ser;
  // Marker x only when the readout date sits inside the plotted window.
  const readoutInWindow = readoutT >= winStart && readoutT <= winEnd;
  const readoutX = model ? xForIndex((readoutT - winStart) / stepMs) : plotLeft;
  const isToday = readoutISO === todayISO();
  const readoutShort = new Date(readoutISO + 'T12:00:00').toLocaleDateString(LOCALE_MAP[language] || 'en-US', { month: 'short', day: 'numeric' });

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
        drops.push({ key: `${ser.id}-${ts}`, hit, color: ser.color, x: plotLeft + (idx / model.nSteps) * w, y: PLOT_BOTTOM - (levelAtDate(ser, ts) / plotMax) * h });
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
    return { x, width: Math.max(0, (plotRight - x) * k), opacity: 0.55 * ready.value };
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
  const mgFmt = (v) => { 'worklet'; return (!isFinite(v) || v <= 0 ? '0' : v < 10 ? v.toFixed(1) : String(Math.round(v))) + ' mg'; };
  const cntFmt = (v) => { 'worklet'; return String(Math.round(v)); };

  // Dropdown button label: the single compound's name, or "N compounds".
  const selCount = selectedIds.length;
  const buttonLabel = single
    ? single.name
    : `${selCount} ${t('curve_compounds_label')}`;

  const tierCfg = {
    clinical: { bg: colors.successSoft, fg: colors.successSoftText, label: t('curve_tier_clinical') },
    studied: { bg: colors.accentSoft, fg: colors.accentSoftText, label: t('curve_tier_studied') },
    estimated: { bg: colors.warningSoft, fg: colors.warningSoftText, label: t('curve_tier_estimated') },
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common_back')}
        >
          <Text style={s.headerBack}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('curve_title')}</Text>
        <View style={s.headerSpacer} />
      </View>

      {protocols.length === 0 ? (
        <View style={s.emptyWrap}>
          <View style={s.emptyIcon}><FeatureIcon name="curve" size={44} color={colors.textMuted} /></View>
          <Text style={s.emptyTitle}>{t('curve_empty_title')}</Text>
          {notChartedLines().length ? (
            notChartedLines().map((line, i) => <Text key={line} style={[s.emptySub, i > 0 && { marginTop: 8 }]}>{line}</Text>)
          ) : (
            <Text style={s.emptySub}>{t('curve_empty_sub')}</Text>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll}>
          {/* Dropdown trigger — multi-select compound picker */}
          <TouchableOpacity
            style={s.dropdown}
            activeOpacity={0.7}
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('curve_choose_title')}
          >
            <View style={s.dropdownLeft}>
              {single && <View style={[s.dot, { backgroundColor: single.color }]} />}
              <Text style={s.dropdownText} numberOfLines={1}>{buttonLabel}</Text>
            </View>
            <Text style={s.dropdownChevron}>⌄</Text>
          </TouchableOpacity>
          {notChartedLines().map(line => <Text key={line} style={s.notCharted}>{line}</Text>)}

          <View style={s.card}>
            <View style={s.cardTopRow}>
              <Text style={s.rangeLabel}>
                {t('curve_last_days')} {PAST_DAYS}d · +{futureDays}d {t('curve_projection')}
                {model && model.max > 0 ? `  ·  ${t('curve_peak')} ≈ ${mgLabel(model.max)} mg` : ''}
              </Text>
              {single && (
                <View style={[s.tierBadge, { backgroundColor: tierCfg[single.entry.tier].bg }]}>
                  <Text style={[s.tierBadgeText, { color: tierCfg[single.entry.tier].fg }]}>
                    {tierCfg[single.entry.tier].label}
                  </Text>
                </View>
              )}
            </View>
            {/* Where the half-life comes from: the tier badge says it plainly; the
                research citation is one tap away rather than jargon on the chart. */}
            {single && (
              <TouchableOpacity onPress={() => setSourceOpen(v => !v)} accessibilityRole="button" hitSlop={{ top: 6, bottom: 6 }}>
                <Text style={s.sourceLine}>
                  {t('curve_source_label')} {sourceOpen ? '⌃' : '⌄'}
                  {sourceOpen ? `\n${single.entry.source}` : ''}
                </Text>
              </TouchableOpacity>
            )}

            <View style={s.disclaimerBox}>
              <Text style={s.disclaimerText}>{t('curve_disclaimer')}</Text>
            </View>

            {model && model.series.some(ser => ser.fromBlend) && (
              <View style={s.disclaimerBox}>
                <Text style={s.disclaimerText}>{t('blend_curve_caveat')}</Text>
              </View>
            )}

            {/* a touch on the chart skips the opening moment to its end */}
            <View onTouchStart={finishIntro}>
            <Svg width={chartWidth} height={chartHeight}>
              {/* future projection zone — opens at Now during the opening moment */}
              <ARect y={PLOT_TOP} height={PLOT_BOTTOM - PLOT_TOP} fill={colors.accentSoft} animatedProps={zoneProps} />
              {/* y-axis: mg gridlines + labels (dip and return during a rescale) */}
              <AG animatedProps={gridProps}>
              {yTicks().map((v, i) => (
                <React.Fragment key={i}>
                  <Line x1={plotLeft} y1={yForLevel(v)} x2={plotRight} y2={yForLevel(v)} stroke={colors.border} strokeWidth={1} />
                  <SvgText x={plotLeft - 6} y={yForLevel(v) + 3.5} fontSize={9} fill={colors.textMuted} textAnchor="end">
                    {mgLabel(v)}
                  </SvgText>
                </React.Fragment>
              ))}
              <SvgText x={2} y={PLOT_TOP + 2} fontSize={9} fill={colors.textMuted} textAnchor="start">mg</SvgText>
              </AG>
              {/* NOW line — rises from the baseline when the pen reaches today */}
              <ALine stroke={colors.textMuted} strokeWidth={1.5} strokeDasharray="4,4" animatedProps={nowLineProps} />
              {/* readout date marker (a chosen blood-draw date) — labeled so a
                  screenshot shows which date and level it represents */}
              <AG animatedProps={readoutGProps}>
              {model && model.max > 0 && readoutInWindow && !isToday && (
                <>
                  <Line x1={readoutX} y1={PLOT_TOP + 12} x2={readoutX} y2={PLOT_BOTTOM} stroke={colors.accent} strokeWidth={1.5} strokeDasharray="2,3" />
                  <SvgText
                    x={Math.min(Math.max(readoutX, plotLeft + 20), plotRight - 20)}
                    y={PLOT_TOP + 8}
                    fontSize={10}
                    fontWeight="700"
                    fill={colors.accent}
                    textAnchor="middle"
                  >
                    {readoutShort}
                  </SvgText>
                  {/* dots where the chosen date crosses each line */}
                  {model.series.map(ser => (
                    <Circle key={`ro-dot-${ser.id}`} cx={readoutX} cy={yForLevel(levelAtDate(ser, readoutT))} r={3} fill={ser.color} stroke={colors.card} strokeWidth={1} />
                  ))}
                  {showCombined && model.combined.map(c => (
                    <Circle key={`ro-dot-${c.id}`} cx={readoutX} cy={yForLevel(c.members.reduce((s, mid) => s + (seriesById[mid] ? levelAtDate(seriesById[mid], readoutT) : 0), 0))} r={3.5} fill={colors.accent} stroke={colors.card} strokeWidth={1} />
                  ))}
                </>
              )}
              </AG>
              {/* one overlaid curve per selected compound — drawn in time on open */}
              {model && model.max > 0 && model.series.map(ser => (
                <CurveLine
                  key={ser.id}
                  points={ser.points} pre={ser.pre}
                  clock={clock} domainN={domainN} yMaxS={yMaxS} ready={ready} geo={geo}
                  nowIdx={model.nowIdx} nSteps={model.nSteps}
                  stroke={ser.color}
                  strokeWidth={2.5}
                  // Explicit in both cases: react-native-svg keeps a prior dash when
                  // the prop returns to undefined, so estimated→clinical would stay dashed.
                  strokeDasharray={ser.entry.tier === 'estimated' ? '6,4' : '0'}
                />
              ))}
              {/* combined total per substance group — bold, on top */}
              {model && model.max > 0 && showCombined && model.combined.map(c => (
                <CurveLine
                  key={c.id}
                  points={c.points} pre={c.pre}
                  clock={clock} domainN={domainN} yMaxS={yMaxS} ready={ready} geo={geo}
                  nowIdx={model.nowIdx} nSteps={model.nSteps}
                  stroke={colors.text} strokeWidth={3.5} strokeDasharray="0"
                />
              ))}
              {/* opening moment: each scheduled dose drops in; a pen leads each line */}
              {introFx && introFx.drops.map(dp => (
                <DoseDrop key={dp.key} clock={clock} hit={dp.hit} x={dp.x} y={dp.y} color={dp.color} showDrop={introFx.showDrop} />
              ))}
              {introFx && model && model.max > 0 && model.series.map(ser => (
                <PenDot key={`pen-${ser.id}`} points={ser.points} pre={ser.pre} clock={clock} domainN={domainN} yMaxS={yMaxS} geo={geo} nowIdx={model.nowIdx} nSteps={model.nSteps} color={ser.color} />
              ))}
              {/* dots marking each line's level right now */}
              <AG animatedProps={markerProps}>
              {model && model.max > 0 && model.series.map(ser => (
                <Circle key={`d-${ser.id}`} cx={nowX} cy={yForLevel(ser.nowLevel)} r={3.5} fill={ser.color} />
              ))}
              {model && model.max > 0 && showCombined && model.combined.map(c => (
                <Circle key={`d-${c.id}`} cx={nowX} cy={yForLevel(c.nowLevel)} r={4} fill={colors.text} />
              ))}
              </AG>
            </Svg>
            </View>

            <Animated.View style={[{ height: 16, marginLeft: AXIS_W, marginTop: 6 }, axisStyle]}>
              <Text style={[s.axisLabel, { position: 'absolute', left: 0 }]}>−{PAST_DAYS}d</Text>
              <Text style={[s.axisLabel, { position: 'absolute', right: 0 }]}>+{futureDays}d</Text>
              {model && (
                <Text style={[s.axisLabel, { position: 'absolute', left: Math.max(0, (nowX - AXIS_W) - 14), color: colors.text, fontWeight: '700' }]}>
                  {t('curve_now')}
                </Text>
              )}
            </Animated.View>
            {/* Compounds that clear between 6h samples draw a spike per dose, not a build-up. */}
            {model && model.max > 0 && model.series.some(ser => ser.entry.hours < STEP_HOURS) && (
              <Text style={s.fastNote}>
                {t('curve_fast_note').replace('{names}', model.series.filter(ser => ser.entry.hours < STEP_HOURS).map(ser => ser.name).join(', '))}
              </Text>
            )}

            {/* Projection horizon selector */}
            <View style={s.horizonRow}>
              <Text style={s.horizonLabel}>{t('curve_project_ahead')}</Text>
              <View style={s.horizonChips}>
                {FUTURE_PRESETS.map(d => {
                  const on = futureDays === d;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[s.horizonChip, on && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                      onPress={() => setFutureDays(d)}
                    >
                      <Text style={[s.horizonChipText, on && { color: colors.accentText }]}>+{d}d</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {single ? (
            // One compound → the 3-stat detail row.
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Animated.View style={statBump}>
                  <AnimatedNumber value={statLevel} format={mgFmt} style={s.statVal} width={104} align="center" />
                </Animated.View>
                <Text style={s.statLbl}>{t('curve_current_level')}</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statVal}>{halfLifeLabel(single.entry.hours)}</Text>
                <Text style={s.statLbl}>{t('curve_half_life')}</Text>
              </View>
              <View style={s.statCard}>
                <AnimatedNumber value={statDoses} format={cntFmt} style={s.statVal} width={64} align="center" />
                <Text style={s.statLbl}>{t('curve_doses_counted')}</Text>
              </View>
            </View>
          ) : (
            // Multiple compounds → a legend, one row each, sharing the y-scale.
            <View style={s.legend}>
              {model && model.series.map(ser => (
                <View key={ser.id} style={s.legendRow}>
                  <View style={[s.dot, { backgroundColor: ser.color }]} />
                  <View style={s.legendNameCol}>
                    <Text style={s.legendNameTxt} numberOfLines={1}>{ser.name}</Text>
                    <Text style={[s.legendTier, { color: tierCfg[ser.entry.tier].fg }]} numberOfLines={1}>
                      {tierCfg[ser.entry.tier].label}
                    </Text>
                  </View>
                  <Text style={s.legendLevel}>{mgLabel(ser.nowLevel)} mg</Text>
                  <Text style={s.legendHalf}>t½ {halfLifeLabel(ser.entry.hours)}</Text>
                </View>
              ))}
              {showCombined && model && model.combined.map(c => (
                <View key={c.id} style={s.legendRow}>
                  <View style={[s.combinedSwatch, { backgroundColor: colors.text }]} />
                  <Text style={[s.legendName, { fontWeight: '800' }]} numberOfLines={1}>
                    {t('curve_combined')} · {t(`substance_${c.substance}`)}
                  </Text>
                  <Text style={[s.legendLevel, { fontWeight: '800' }]}>{mgLabel(c.nowLevel)} mg</Text>
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
              <Switch
                value={showCombined}
                onValueChange={setShowCombined}
                trackColor={{ true: colors.accent, false: colors.border }}
              />
            </View>
          )}

          {/* ── Estimate on a date (cross-reference a blood draw) ── */}
          <View style={s.readoutCard}>
            <Text style={s.readoutTitle}>{t('curve_readout_title')}</Text>
            <TouchableOpacity style={[s.readoutDateBtn, { flexDirection: 'row', alignItems: 'center', gap: 8 }]} onPress={() => setShowReadoutPicker(v => !v)}>
              <FeatureIcon name="calendar" size={15} color={colors.text} />
              <Text style={s.readoutDateText}>
                {new Date(readoutISO + 'T12:00:00').toLocaleDateString(LOCALE_MAP[language] || 'en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </TouchableOpacity>
            {showReadoutPicker && (
              <DateTimePicker
                value={new Date(readoutISO + 'T12:00:00')}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date(winEnd)}
                onChange={(event, d) => {
                  setShowReadoutPicker(Platform.OS === 'ios');
                  if (event.type === 'dismissed') { setShowReadoutPicker(false); return; }
                  if (d) { const x = new Date(d); x.setHours(12, 0, 0, 0); setReadoutDate(x.toISOString().split('T')[0]); }
                }}
              />
            )}

            {labDates.length > 0 && (
              <>
                <Text style={s.readoutLabHint}>{t('curve_readout_lab_hint')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.labChipRow}>
                  {labDates.map(d => {
                    const on = readoutISO === d;
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[s.labChip, { flexDirection: 'row', alignItems: 'center', gap: 5 }, on && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                        onPress={() => setReadoutDate(d)}
                      >
                        <FeatureIcon name="droplet" size={12} color={on ? colors.accentText : colors.text} />
                        <Text style={[s.labChipText, on && { color: colors.accentText }]}>
                          {new Date(d + 'T12:00:00').toLocaleDateString(LOCALE_MAP[language] || 'en-US', { month: 'short', day: 'numeric' })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* per-line estimate on the chosen date */}
            {model && model.series.map(ser => (
              <View key={`ro-${ser.id}`} style={s.readoutRow}>
                <View style={[s.dot, { backgroundColor: ser.color }]} />
                <Text style={s.readoutName} numberOfLines={1}>{ser.name}</Text>
                <Text style={s.readoutVal}>{mgLabel(levelAtDate(ser, readoutT))} mg</Text>
              </View>
            ))}
            {showCombined && model && model.combined.map(c => (
              <View key={`ro-${c.id}`} style={s.readoutRow}>
                <View style={[s.combinedSwatch, { backgroundColor: colors.text }]} />
                <Text style={[s.readoutName, { fontWeight: '800' }]} numberOfLines={1}>
                  {t('curve_combined')} · {t(`substance_${c.substance}`)}
                </Text>
                <Text style={[s.readoutVal, { fontWeight: '800' }]}>
                  {mgLabel(c.members.reduce((sum, mid) => sum + (seriesById[mid] ? levelAtDate(seriesById[mid], readoutT) : 0), 0))} mg
                </Text>
              </View>
            ))}
          </View>

        </ScrollView>
      )}

      {/* Multi-select picker sheet */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={s.modalScrim} onPress={() => setPickerOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>{t('curve_choose_title')}</Text>
            <Text style={s.sheetHint}>{t('curve_choose_hint')}</Text>
            <ScrollView style={s.sheetList}>
              {protocols.map(p => {
                const on = selectedIds.includes(p.id);
                const entry = getHalfLifeEntry(matchName(p));
                return (
                  <TouchableOpacity key={p.id} style={s.optionRow} activeOpacity={0.7} onPress={() => toggle(p.id)}>
                    <View style={[s.dot, { backgroundColor: p.color || colors.accent }]} />
                    <View style={s.optionMain}>
                      <Text style={s.optionName} numberOfLines={1}>{p.compound_id ? t(p.compound_id) : p.name}</Text>
                      <Text style={s.optionSub}>t½ {halfLifeLabel(entry.hours)} · {tierCfg[entry.tier].label}</Text>
                    </View>
                    <View style={[s.check, on && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
                      {on && <Text style={s.checkMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={s.sheetDone} onPress={() => setPickerOpen(false)}>
              <Text style={s.sheetDoneText}>{t('curve_done')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
    headerBack: { fontSize: 32, color: colors.accent, marginRight: 10, marginTop: -4 },
    headerTitle: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.text },
    headerSpacer: { width: 32 },
    scroll: { paddingHorizontal: 16, paddingBottom: 32, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },

    dropdown: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
    },
    dropdownLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    dropdownText: { fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 },
    dropdownChevron: { fontSize: 20, color: colors.textMuted, fontWeight: '700', marginLeft: 8 },

    dot: { width: 11, height: 11, borderRadius: 6, marginRight: 9 },

    card: { backgroundColor: colors.card, borderRadius: 18, padding: 14, ...colors.shadowSoft },
    cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 },
    rangeLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
    tierBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    tierBadgeText: { fontSize: 11, fontWeight: '700' },
    axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    axisLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
    horizonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 6 },
    horizonLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
    horizonChips: { flexDirection: 'row', gap: 6 },
    horizonChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
    horizonChipText: { fontSize: 12.5, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },

    statsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    statCard: { flex: 1, backgroundColor: colors.card, borderRadius: 16, paddingVertical: 12, alignItems: 'center', ...colors.shadowSoft },
    statVal: { fontSize: 18, fontWeight: '800', color: colors.text },
    statLbl: { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },

    legend: { backgroundColor: colors.card, borderRadius: 16, marginTop: 12, paddingHorizontal: 12, paddingVertical: 4, ...colors.shadowSoft },
    legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    legendName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
    legendNameCol: { flex: 1, marginRight: 6 },
    legendNameTxt: { fontSize: 14, fontWeight: '600', color: colors.text },
    legendTier: { fontSize: 10.5, fontWeight: '700', marginTop: 1 },
    notCharted: { fontSize: 12, color: colors.textMuted, lineHeight: 16, marginTop: -4, marginBottom: 10, paddingHorizontal: 4 },
    sourceLine: { fontSize: 11, color: colors.textMuted, marginTop: -2, marginBottom: 10, lineHeight: 15 },
    fastNote: { fontSize: 11.5, color: colors.textMuted, marginTop: 8, lineHeight: 16 },
    legendLevel: { fontSize: 14, fontWeight: '800', color: colors.text, width: 72, textAlign: 'right', fontVariant: ['tabular-nums'] },
    legendHalf: { fontSize: 12, color: colors.textMuted, width: 74, textAlign: 'right' },
    combinedSwatch: { width: 16, height: 4, borderRadius: 2, marginRight: 6 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, ...colors.shadowSoft },
    toggleLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
    toggleHint: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },

    readoutCard: { backgroundColor: colors.card, borderRadius: 16, padding: 14, marginTop: 12, ...colors.shadowSoft },
    readoutTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 10 },
    readoutDateBtn: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
    readoutDateText: { fontSize: 14, color: colors.text, fontWeight: '600' },
    readoutLabHint: { fontSize: 12, color: colors.textMuted, marginTop: 12, marginBottom: 6 },
    labChipRow: { gap: 8, paddingVertical: 2 },
    labChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
    labChipText: { fontSize: 13, fontWeight: '600', color: colors.text },
    readoutRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    readoutName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
    readoutVal: { fontSize: 14, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
    disclaimerBox: { backgroundColor: colors.warningSoft, borderRadius: 12, padding: 12, marginTop: 12 },
    disclaimerText: { fontSize: 12, lineHeight: 17, color: colors.warningSoftText },

    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    emptyIcon: { fontSize: 44, marginBottom: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8, textAlign: 'center' },
    emptySub: { fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },

    modalScrim: { flex: 1, backgroundColor: colors.overlay || 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24, maxHeight: '80%', width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
    sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
    sheetHint: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 8 },
    sheetList: { flexGrow: 0 },
    optionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    optionMain: { flex: 1 },
    optionName: { fontSize: 15, fontWeight: '600', color: colors.text },
    optionSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    check: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    checkMark: { color: colors.accentText, fontSize: 14, fontWeight: '800' },
    sheetDone: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
    sheetDoneText: { color: colors.accentText, fontSize: 16, fontWeight: '700' },
  });
}
