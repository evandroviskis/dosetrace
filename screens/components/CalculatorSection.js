/**
 * DoseTrace — Energy & protein calculator (inside the Body hub)
 *
 * A one-shot general-wellness REALITY CHECK (BODY_TAB_SPEC): estimate BMR →
 * TDEE → a calorie target (as a % of TDEE) → a protein target, from the user's
 * own body-composition inputs. Plus plain-language explainers about why the
 * scale is noisy and why a flat deficit stops working.
 *
 * IMPORTANT — regulatory framing (hard rules from the spec):
 *   • Every output is an ESTIMATE, never a prescription.
 *   • NOTHING here is tied to any dose, drug, or compound — no mg/kg, no
 *     weight feeding a dose field. It is drug-agnostic energy math.
 *   • It reports numbers; it never diagnoses. No medical-cause suggestions.
 *   • Body composition points to gyms (a fitness service), not doctors.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Linking, useWindowDimensions, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getCachedUser, supabase } from '../../lib/supabase';
import { isPremium } from '../../lib/purchases';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import {
  energyPlan, ACTIVITY_LEVELS, realityCheckTDEE, weeklyRateKg,
  lbToKg, kgToLb, inToCm, cmToIn,
} from '../../lib/energyCalc';
import { syncRealityCheckReminder, REALITY_CHECK_DAYS, RC_START_KEY } from '../../lib/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ProgressChart from './ProgressChart';
import FeatureIcon from '../../components/FeatureIcon';
import NutritionLogger from './NutritionLogger';

const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };
const todayISO = () => new Date().toISOString().split('T')[0];
// Whole days between two YYYY-MM-DD dates (noon-anchored to dodge DST).
const daysBetween = (fromISO, toISO) => {
  const a = new Date(fromISO + 'T12:00:00').getTime();
  const b = new Date(toISO + 'T12:00:00').getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
};
const SNAP_CAP = 50;
// Chart width tracks the live window (fold/unfold, rotation) — see useWindowDimensions in the component.

const BF_SOURCES = ['dexa', 'gym', 'calipers', 'scale', 'unknown'];
const round10 = n => Math.round(n / 10) * 10;
const round5 = n => Math.round(n / 5) * 5;
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

// Published sources for every figure this calculator shows (App Review 1.4.1:
// health information must cite its sources). Citation text stays in English —
// the convention for references; the topic label (t(key)) is localized.
const REFERENCES = [
  { key: 'cal_src_bmr_mifflin', cite: 'Mifflin & St Jeor et al. — Am J Clin Nutr, 1990', url: 'https://doi.org/10.1093/ajcn/51.2.241' },
  { key: 'cal_src_bmr_lbm', cite: 'Cunningham — Am J Clin Nutr, 1991', url: 'https://pubmed.ncbi.nlm.nih.gov/1957828/' },
  { key: 'cal_src_protein', cite: 'Jäger et al. — ISSN Position Stand, 2017', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5477153/' },
  { key: 'cal_src_glycogen', cite: 'Muscle glycogen & body water — Nutrients, 2023', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9823884/' },
  { key: 'cal_src_energy', cite: 'Hall — Int J Obes, 2008', url: 'https://www.nature.com/articles/0803720' },
];

export default function CalculatorSection() {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { width: windowWidth } = useWindowDimensions();
  const CHART_WIDTH = windowWidth - 64;
  const s = useMemo(() => makeStyles(colors), [colors]);
  const locale = LOCALE_MAP[language] || 'en-US';

  const [unit, setUnit] = useState('metric');       // 'metric' | 'imperial'
  const [weight, setWeight] = useState('');
  const [bfSource, setBfSource] = useState('gym');
  const [bodyFat, setBodyFat] = useState('');
  const [sex, setSex] = useState('male');
  // Sex assigned at birth as set in the PROFILE (male|female) or null if unset.
  // The Mifflin BMR path is sex-specific, so we won't compute it off the 'male'
  // default — we gate on this and prompt the user to complete their profile.
  const [profileSex, setProfileSex] = useState(null);
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [activity, setActivity] = useState(1.375);
  const [goal, setGoal] = useState('lose');
  const [waist, setWaist] = useState('');
  const [expl, setExpl] = useState(null);           // which explainer is open
  const [learnOpen, setLearnOpen] = useState(false);   // "Understand the numbers" group
  const [sourcesOpen, setSourcesOpen] = useState(false); // "Sources & references" group
  const [premium, setPremium] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [snapMsg, setSnapMsg] = useState(false);
  // Reality-check inputs (display units).
  const [rcThen, setRcThen] = useState('');         // phase-1 starting weight
  const [rcNow, setRcNow] = useState('');           // phase-2 current weight
  const [rcIntake, setRcIntake] = useState('');
  const [rc, setRc] = useState(null);               // { status, tdee, ratePerWeekKg }
  const [rcStart, setRcStart] = useState(null);     // { date, weightKg } — open check-in
  const [rcOpen, setRcOpen] = useState(false);      // collapsible panel under the goal
  const [realityLog, setRealityLog] = useState([]); // saved reality checks over time
  const [rcSavedMsg, setRcSavedMsg] = useState(false);
  const loadedRef = useRef(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setPremium(await isPremium());
    if (loadedRef.current) return;
    const user = await getCachedUser();
    const snaps = user?.user_metadata?.calc_snapshots;
    if (Array.isArray(snaps)) setSnapshots(snaps);
    const checks = user?.user_metadata?.calc_reality_checks;
    if (Array.isArray(checks)) setRealityLog(checks);
    try {
      const raw = await AsyncStorage.getItem(RC_START_KEY);
      const rcs = raw ? JSON.parse(raw) : null;
      if (rcs && rcs.date && typeof rcs.weightKg === 'number') setRcStart(rcs);
    } catch { /* ignore */ }
    // Seed physiological defaults from the profile so BMR is sensitive to the
    // user's stored sex (assigned at birth) and age. Explicit calculator inputs
    // saved below still win over these.
    const meta = user?.user_metadata || {};
    if (meta.gender === 'male' || meta.gender === 'female') { setSex(meta.gender); setProfileSex(meta.gender); }
    if (meta.birth_year) {
      const yrs = new Date().getFullYear() - Number(meta.birth_year);
      if (yrs > 0 && yrs < 120) setAge(String(yrs));
    }

    const saved = user?.user_metadata?.calc_inputs;
    if (saved && typeof saved === 'object') {
      if (saved.unit) setUnit(saved.unit);
      if (saved.weight != null) setWeight(String(saved.weight));
      if (saved.bfSource) setBfSource(saved.bfSource);
      if (saved.bodyFat != null) setBodyFat(String(saved.bodyFat));
      if (saved.sex) setSex(saved.sex);
      if (saved.age != null) setAge(String(saved.age));
      if (saved.height != null) setHeight(String(saved.height));
      if (saved.activity != null) setActivity(saved.activity);
      if (saved.goal) setGoal(saved.goal);
      if (saved.waist != null) setWaist(String(saved.waist));
    }
    loadedRef.current = true;
  }

  // Convert display inputs → metric for the math.
  const metric = useMemo(() => {
    const w = num(weight);
    const h = num(height);
    return {
      weightKg: w == null ? null : (unit === 'imperial' ? lbToKg(w) : w),
      heightCm: h == null ? null : (unit === 'imperial' ? inToCm(h) : h),
    };
  }, [weight, height, unit]);

  const result = useMemo(() => {
    const isUnknown = bfSource === 'unknown';
    // The Mifflin (body-fat-unknown) BMR is sex-specific. Rather than silently
    // computing off the 'male' default, gate on the profile's sex being set.
    // Katch-McArdle (body fat known) doesn't use sex, so it's never gated.
    if (isUnknown && !profileSex) return { sexGated: true };
    const plan = energyPlan({
      weightKg: metric.weightKg,
      heightCm: metric.heightCm,
      age: num(age),
      sex,
      bodyFatPct: isUnknown ? null : num(bodyFat),
      activity,
      goal,
    });
    if (!plan.ok) return plan.warnings.length ? { invalid: true, warnings: plan.warnings } : null;
    return plan;
  }, [metric, age, sex, bodyFat, bfSource, activity, goal, profileSex]);
  const plan = result && !result.invalid && !result.sexGated ? result : null;

  // Persist inputs (debounced, fire-and-forget) once initial load is done.
  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(() => {
      const payload = { unit, weight, bfSource, bodyFat, sex, age, height, activity, goal, waist };
      supabase.auth.updateUser({ data: { calc_inputs: payload } }).catch(() => {});
    }, 900);
    return () => clearTimeout(timer);
  }, [unit, weight, bfSource, bodyFat, sex, age, height, activity, goal, waist]);

  const wUnit = unit === 'imperial' ? t('cal_unit_lb') : t('cal_unit_kg');
  const hUnit = unit === 'imperial' ? t('cal_unit_in') : t('cal_unit_cm');
  const isUnknown = bfSource === 'unknown';

  // Write sex assigned at birth to the profile (the source of truth for the
  // sex-specific BMR path), then unblock the calculation.
  async function saveProfileSex(val) {
    setSex(val);
    setProfileSex(val);
    try { await supabase.auth.updateUser({ data: { gender: val } }); } catch (e) { /* non-fatal */ }
  }
  function promptProfileSex() {
    Alert.alert(t('cal_sex_gate_title'), t('cal_sex_gate_body'), [
      { text: t('profile_gender_male'), onPress: () => saveProfileSex('male') },
      { text: t('profile_gender_female'), onPress: () => saveProfileSex('female') },
      { text: t('cancel'), style: 'cancel' },
    ]);
  }

  // Switching units must CONVERT the values already typed, not just relabel
  // them — otherwise "80" silently jumps from 80 kg to 80 lb and every result
  // changes. Body fat % and calories are unit-agnostic and stay put.
  function changeUnit(next) {
    if (next === unit) return;
    const toImp = next === 'imperial';
    const fmt = v => (v == null ? '' : String(Math.round(v * 10) / 10));
    const cw = str => { const n = num(str); return n == null ? str : fmt(toImp ? kgToLb(n) : lbToKg(n)); };
    const ch = str => { const n = num(str); return n == null ? str : fmt(toImp ? cmToIn(n) : inToCm(n)); };
    setWeight(cw(weight));
    setHeight(ch(height));
    setWaist(ch(waist));
    setRcThen(cw(rcThen));
    setRcNow(cw(rcNow));
    setUnit(next);
  }

  const waistCm = useMemo(() => {
    const w = num(waist);
    if (w == null) return null;
    return unit === 'imperial' ? inToCm(w) : w;
  }, [waist, unit]);

  // ── Snapshots (premium) ──────────────────────────────────────────
  function saveSnapshot() {
    if (!plan || metric.weightKg == null) return;
    const snap = {
      date: todayISO(),
      weightKg: metric.weightKg,
      waistCm,
      bodyFatPct: isUnknown ? null : num(bodyFat),
      lbm: plan.lbm,
      bmr: Math.round(plan.bmr),
      tdee: Math.round(plan.tdeeVal),
    };
    // One snapshot per day (latest wins); keep the newest SNAP_CAP, sorted.
    const next = [...snapshots.filter(x => x.date !== snap.date), snap]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(-SNAP_CAP);
    setSnapshots(next);
    supabase.auth.updateUser({ data: { calc_snapshots: next } }).catch(() => {});
    setSnapMsg(true);
    setTimeout(() => setSnapMsg(false), 2500);
  }

  const chartSeries = useMemo(() => {
    const toW = kg => unit === 'imperial' ? kgToLb(kg) : kg;
    const toL = cm => unit === 'imperial' ? cmToIn(cm) : cm;
    const weightPts = snapshots.filter(x => x.weightKg != null).map(x => ({ date: x.date, value: toW(x.weightKg) }));
    const waistPts = snapshots.filter(x => x.waistCm != null).map(x => ({ date: x.date, value: toL(x.waistCm) }));
    return [
      { key: 'weight', label: t('cal_snap_weight'), color: colors.accent, unit: wUnit, points: weightPts },
      { key: 'waist', label: t('cal_snap_waist'), color: colors.warning, unit: hUnit, points: waistPts },
    ].filter(sr => sr.points.length > 0);
  }, [snapshots, unit]);

  const snapPointCount = chartSeries.reduce((n, sr) => Math.max(n, sr.points.length), 0);

  // A one-line "since your first snapshot" delta for the overview panel.
  const progressSummary = useMemo(() => {
    if (snapshots.length < 2) return null;
    const sorted = [...snapshots].sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = sorted[0], last = sorted[sorted.length - 1];
    const toW = kg => unit === 'imperial' ? kgToLb(kg) : kg;
    const toL = cm => unit === 'imperial' ? cmToIn(cm) : cm;
    const wDelta = (first.weightKg != null && last.weightKg != null) ? toW(last.weightKg) - toW(first.weightKg) : null;
    const waistDelta = (first.waistCm != null && last.waistCm != null) ? toL(last.waistCm) - toL(first.waistCm) : null;
    return { firstDate: first.date, wDelta, waistDelta };
  }, [snapshots, unit]);

  const signed = d => (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d).toFixed(1);
  const fmtDate = iso => {
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // ── Reality check (premium) ──────────────────────────────────────
  // Auto days-between the two weigh-ins; null until phase 2.
  const rcElapsedDays = rcStart ? daysBetween(rcStart.date, todayISO()) : null;
  // The date the day-21 reminder is set for (display only).
  const rcRemindOn = useMemo(() => {
    if (!rcStart) return null;
    const d = new Date(rcStart.date + 'T12:00:00');
    d.setDate(d.getDate() + REALITY_CHECK_DAYS);
    return d.toISOString().split('T')[0];
  }, [rcStart]);

  // Phase 1 — log today's starting weight and arm the +21-day reminder.
  async function startRealityCheck() {
    const kg = num(rcThen) == null ? null : (unit === 'imperial' ? lbToKg(num(rcThen)) : num(rcThen));
    if (kg == null) return;
    const start = { date: todayISO(), weightKg: kg };
    setRcStart(start);
    setRcThen('');
    setRc(null);
    await AsyncStorage.setItem(RC_START_KEY, JSON.stringify(start)).catch(() => {});
    syncRealityCheckReminder().catch(() => {});
  }

  // Clear the open check-in and cancel its reminder (back to phase 1).
  async function resetRealityCheck() {
    setRcStart(null);
    setRcNow('');
    setRc(null);
    await AsyncStorage.removeItem(RC_START_KEY).catch(() => {});
    syncRealityCheckReminder().catch(() => {});
  }

  // Phase 2 — compute from the stored starting weight + today's weight, using the
  // auto-measured elapsed days.
  function computeReality() {
    if (!rcStart) { setRc(null); return; }
    const nowKg = num(rcNow) == null ? null : (unit === 'imperial' ? lbToKg(num(rcNow)) : num(rcNow));
    const days = rcElapsedDays;
    const intake = num(rcIntake);
    if (nowKg == null || !days || intake == null) { setRc(null); return; }
    // weightChangeKg = amount lost (positive when weight went down).
    const weightChangeKg = rcStart.weightKg - nowKg;
    const res = realityCheckTDEE({ avgDailyCalories: intake, weightChangeKg, days });
    setRc({ ...res, ratePerWeekKg: weeklyRateKg({ weightChangeKg, days }) });
  }

  // Save the current valid check so its weekly rate can be tracked over time
  // (one per day, latest wins) — this is how "1 kg/week → 2.5 kg/week" surfaces.
  // Completing a check closes the current window; the user can start a fresh one.
  function saveRealityCheck() {
    if (!rc || rc.status !== 'ok') return;
    const entry = { date: todayISO(), tdee: Math.round(rc.tdee), ratePerWeekKg: rc.ratePerWeekKg };
    const next = [...realityLog.filter(x => x.date !== entry.date), entry]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(-SNAP_CAP);
    setRealityLog(next);
    supabase.auth.updateUser({ data: { calc_reality_checks: next } }).catch(() => {});
    setRcSavedMsg(true);
    setTimeout(() => setRcSavedMsg(false), 2500);
  }

  // Roll straight into the next window using today's weight as the new start —
  // this is the "1st → 2nd → 3rd measurement" sequence, always 3 weeks apart.
  async function startNextRealityCheck() {
    const kg = num(rcNow) == null ? null : (unit === 'imperial' ? lbToKg(num(rcNow)) : num(rcNow));
    setRc(null);
    setRcNow('');
    if (kg == null) { await resetRealityCheck(); return; }
    const start = { date: todayISO(), weightKg: kg };
    setRcStart(start);
    await AsyncStorage.setItem(RC_START_KEY, JSON.stringify(start)).catch(() => {});
    syncRealityCheckReminder().catch(() => {});
  }

  // Weekly rate → display units, one decimal, absolute value (sign drives the label).
  const rateDisplay = kg => {
    if (kg == null) return null;
    const v = unit === 'imperial' ? kgToLb(kg) : kg;
    return Math.abs(Math.round(v * 10) / 10);
  };

  // ── Scoreboard ───────────────────────────────────────────────────
  // The number to headline for the reality check: the live result if it's
  // valid, otherwise the most recent saved check.
  const scoreCheck = useMemo(() => {
    if (rc && rc.status === 'ok') return { tdee: rc.tdee, ratePerWeekKg: rc.ratePerWeekKg };
    if (realityLog.length) {
      const l = realityLog[realityLog.length - 1];
      return { tdee: l.tdee, ratePerWeekKg: l.ratePerWeekKg };
    }
    return null;
  }, [rc, realityLog]);

  // Tap a scoreboard tile → jump down to the calculator that produced it.
  const scrollRef = useRef(null);
  const detailsY = useRef(0);
  const scrollTo = yRef => scrollRef.current?.scrollTo({ y: Math.max((yRef.current || 0) - 8, 0), animated: true });

  // Warning codes from the engine → localized copy.
  const warnText = w => {
    if (w.code === 'calorie_floor' || w.code === 'bmr_floor') {
      return t(`cal_warn_${w.code}`).replace('{kcal}', String(round10(w.values?.kcal ?? 0)));
    }
    if (w.code === 'protein_cap') return t('cal_warn_protein_cap').replace('{g}', String(w.values?.g ?? ''));
    if (w.code === 'protein_adjusted') return t('cal_warn_protein_adjusted');
    return null;
  };

  // Echo the inputs the math actually used — a wrong/stale input should be
  // visible right next to the results, not discovered weeks later.
  const echoParts = useMemo(() => {
    const parts = [];
    if (num(weight) != null) parts.push(`${weight} ${wUnit}`);
    if (!isUnknown && num(bodyFat) != null) parts.push(`${bodyFat}% ${t('cal_bf_short')}`);
    if (isUnknown) {
      parts.push(t(`cal_sex_${sex}`));
      if (num(age) != null) parts.push(`${age} ${t('cal_yr')}`);
      if (num(height) != null) parts.push(`${height} ${hUnit}`);
    }
    parts.push(`×${activity}`);
    return parts;
  }, [weight, bodyFat, isUnknown, sex, age, height, activity, unit, language]);

  const toDisplayW = kg => (unit === 'imperial' ? kgToLb(kg) : kg);

  const EXPLAINERS = [
    { key: 'scale', title: t('cal_expl_scale_title'), body: t('cal_expl_scale_body') },
    { key: 'deficit', title: t('cal_expl_deficit_title'), body: t('cal_expl_deficit_body') },
    { key: 'measure', title: t('cal_expl_measure_title'), body: t('cal_expl_measure_body') },
  ];

  // A labelled section divider: a monoline glyph in a soft-accent tile + an
  // uppercase micro-label, matching the onboarding's grouping. Optional right slot.
  const SectionHeader = ({ icon, title, right }) => (
    <View style={s.sh}>
      <View style={s.shIcon}><FeatureIcon name={icon} size={16} color={colors.accent} /></View>
      <Text style={s.shTitle}>{title}</Text>
      {right ? <View style={s.shRight}>{right}</View> : null}
    </View>
  );

  return (
    <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={s.scroll} keyboardShouldPersistTaps="handled">
      {/* Intro — what this is */}
      <View style={s.introCard}>
        <Text style={s.introTitle}>{t('cal_intro_title')}</Text>
        <Text style={s.introBody}>{t('cal_intro_body')}</Text>
      </View>

      {/* Overview — the user's current situation */}
      {result && result.sexGated ? (
        <View style={s.overview}>
          <Text style={s.overviewTitle}>{t('cal_sex_gate_title')}</Text>
          <Text style={s.resultsHint}>{t('cal_sex_gate_body')}</Text>
          <TouchableOpacity style={[s.computeBtn, { marginTop: 12 }]} onPress={promptProfileSex}>
            <Text style={s.computeBtnText}>{t('cal_sex_gate_btn')}</Text>
          </TouchableOpacity>
        </View>
      ) : result && result.invalid ? (
        <View style={s.overview}><Text style={s.warnText}>{t('cal_check_inputs')}</Text></View>
      ) : plan ? (
        <View style={s.overview}>
          <View style={s.overviewTop}>
            <Text style={s.overviewTitle}>{t('cal_overview_title')}</Text>
            <View style={s.echoChip}><Text style={s.echoChipText}>{echoParts.join(' · ')}</Text></View>
          </View>

          {/* Hero cards — daily burn + protein */}
          <View style={s.heroRow}>
            <View style={[s.heroCard, s.heroCardPrimary]}>
              <Text style={s.heroLabelPrimary}>{t('cal_tdee')}</Text>
              <Text style={[s.heroVal, s.heroValAccent]}>{round10(plan.tdeeVal)} <Text style={s.heroUnitAccent}>{t('cal_kcal')}</Text></Text>
              <Text style={s.heroSubPrimary}>{t(`cal_eq_${plan.method}`)} · {t('cal_bmr')} {round10(plan.bmr)}</Text>
            </View>
            <View style={s.heroCard}>
              <Text style={s.heroLabel}>{t('cal_protein')}</Text>
              <Text style={s.heroVal}>{round5(plan.protein.rec)} <Text style={s.heroUnit}>{t('cal_g_day')}</Text></Text>
              <Text style={s.heroSub}>{round5(plan.protein.low)}–{round5(plan.protein.high)} · {t(`cal_protein_basis_${plan.protein.basis}${unit === 'imperial' ? '_imp' : ''}`)}</Text>
            </View>
          </View>

          {/* All three goals, side by side — tap to choose */}
          <View style={s.goalRow}>
            {['lose', 'maintain', 'gain'].map(g => {
              const on = goal === g;
              const gc = plan.allGoals[g];
              return (
                <TouchableOpacity key={g} style={[s.goalCard, on && s.goalCardOn]} onPress={() => setGoal(g)} activeOpacity={0.7}>
                  <Text style={[s.goalLabel, on && s.goalLabelOn]}>{t(`cal_goal_${g}`)}</Text>
                  <Text style={[s.goalVal, on && s.goalValOn]}>{round10(gc.mid)}</Text>
                  <Text style={s.goalSub}>{g === 'lose' ? '−15–20%' : g === 'gain' ? '+10–15%' : t('cal_tdee')}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Context chips — BMI + macros */}
          <View style={s.chipRow}>
            {plan.bmi != null && plan.healthyRange && (
              <View style={s.chip}><Text style={s.chipText}>{t('cal_bmi')} {(Math.round(plan.bmi * 10) / 10).toFixed(1)} · {t('cal_healthy_range')} {Math.round(toDisplayW(plan.healthyRange.min))}–{Math.round(toDisplayW(plan.healthyRange.max))} {wUnit}</Text></View>
            )}
            {plan.macros && (
              <View style={s.chip}><Text style={s.chipText}>{t('cal_fat_g')} ≈ {round5(plan.macros.fatG)} g · {t('cal_carbs_g')} ≈ {round5(plan.macros.carbsG)} g</Text></View>
            )}
          </View>

          {/* Safety notes from the engine */}
          {plan.warnings.map(w => {
            const txt = warnText(w);
            return txt ? <View key={w.code} style={s.warnBox}><Text style={s.warnText}>{txt}</Text></View> : null;
          })}

          {progressSummary && (
            <View style={s.deltaRow}>
              <Text style={s.deltaText}>
                {t('cal_since')} {fmtDate(progressSummary.firstDate)}:  {t('cal_snap_weight')} {progressSummary.wDelta != null ? `${signed(progressSummary.wDelta)} ${wUnit}` : '—'}
                {progressSummary.waistDelta != null ? `   ·   ${t('cal_snap_waist')} ${signed(progressSummary.waistDelta)} ${hUnit}` : ''}
              </Text>
            </View>
          )}

          <Text style={s.estimateNote}>{t('cal_estimate_note')}</Text>
        </View>
      ) : (
        <View style={s.overview}><Text style={s.resultsHint}>{t('cal_need_inputs')}</Text></View>
      )}

      {/* ── TRACK YOUR PROGRESS ─────────────────────────────────────── */}
      <SectionHeader icon="calc_trend" title={t('cal_track_title')} />

      {/* Reality check — tap to expand its panel right here (collapsible). */}
      <TouchableOpacity
        style={s.sbReality}
        activeOpacity={0.7}
        onPress={() => (premium ? setRcOpen(o => !o) : navigation.navigate('Paywall'))}
      >
        <View style={s.sbRealityMain}>
          <Text style={s.sbRealityLabel}>{t('cal_rc_title')}</Text>
          {premium ? (
            scoreCheck ? (
              <Text style={s.sbRealityVal}>{round10(scoreCheck.tdee)} {t('cal_kcal')}/{t('cal_day')}</Text>
            ) : rcStart ? (
              <Text style={s.sbRealityMuted}>{t('cal_rc_sb_progress').replace('{date}', fmtDate(rcRemindOn))}</Text>
            ) : (
              <Text style={s.sbRealityMuted}>{t('cal_rc_sb_run')}</Text>
            )
          ) : (
            <Text style={s.sbRealityMuted}>{t('cal_rc_sb_locked')}</Text>
          )}
        </View>
        <View style={s.sbRealityRight}>
          {premium && scoreCheck && scoreCheck.ratePerWeekKg != null && Math.abs(scoreCheck.ratePerWeekKg) >= 0.05 ? (
            <Text style={s.sbRealityRate}>
              {scoreCheck.ratePerWeekKg >= 0 ? '−' : '+'}{rateDisplay(scoreCheck.ratePerWeekKg)} {wUnit}/{t('cal_week')}
            </Text>
          ) : null}
          <Text style={s.sbArrow}>{premium ? (rcOpen ? '▾' : '›') : '›'}</Text>
        </View>
      </TouchableOpacity>

      {/* Collapsible reality-check panel — lives right under the goal/scoreboard. */}
      {rcOpen && (
        <View style={s.premCard}>
          <Text style={s.premSub}>{t('cal_rc_sub')}</Text>
          {premium ? (
            <>
              {!rcStart ? (
                // ── Phase 1: log today's starting weight, arm the 3-week reminder ──
                <>
                  <Text style={s.label}>{t('cal_rc_start_weight')} ({wUnit})</Text>
                  <TextInput style={s.input} value={rcThen} onChangeText={setRcThen} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
                  <TouchableOpacity style={s.computeBtn} onPress={startRealityCheck}>
                    <Text style={s.computeBtnText}>{t('cal_rc_start_btn')}</Text>
                  </TouchableOpacity>
                  <Text style={s.rcNote}>{t('cal_rc_start_hint').replace('{n}', String(REALITY_CHECK_DAYS))}</Text>
                </>
              ) : (
                // ── Phase 2: return, log current weight; days are auto-measured ──
                <>
                  <View style={s.rcTracking}>
                    <Text style={s.rcTrackingLine}>
                      ①  {Math.round((unit === 'imperial' ? kgToLb(rcStart.weightKg) : rcStart.weightKg) * 10) / 10} {wUnit}  ·  {fmtDate(rcStart.date)}
                    </Text>
                    <Text style={s.rcTrackingSub}>
                      {t('cal_rc_remind_on').replace('{date}', fmtDate(rcRemindOn))}  ·  {t('cal_rc_elapsed').replace('{n}', String(rcElapsedDays))}
                    </Text>
                  </View>
                  <Text style={s.label}>{t('cal_rc_current_weight')} ({wUnit})</Text>
                  <TextInput style={s.input} value={rcNow} onChangeText={setRcNow} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
                  <Text style={s.label}>{t('cal_rc_intake')}</Text>
                  <TextInput style={s.input} value={rcIntake} onChangeText={setRcIntake} keyboardType="number-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
                  <TouchableOpacity style={s.computeBtn} onPress={computeReality}>
                    <Text style={s.computeBtnText}>{t('cal_rc_compute')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.rcReset} onPress={resetRealityCheck}>
                    <Text style={s.rcResetText}>{t('cal_rc_reset')}</Text>
                  </TouchableOpacity>

                  {rc && rc.status === 'ok' && (
                    <View style={s.rcResult}>
                      <Text style={s.rcHeadline}>{t('cal_rc_result_prefix')} {round10(rc.tdee)} {t('cal_kcal')}/{t('cal_day')}</Text>
                      {rc.ratePerWeekKg != null && Math.abs(rc.ratePerWeekKg) >= 0.05 ? (
                        <Text style={s.rcRate}>
                          {t('cal_rc_rate_losing')} {rateDisplay(rc.ratePerWeekKg)} {wUnit}/{t('cal_week')} {rc.ratePerWeekKg >= 0 ? t('cal_rc_rate_lost') : t('cal_rc_rate_gained')}
                        </Text>
                      ) : null}
                      {plan ? <Text style={s.rcVs}>{t('cal_rc_vs')} {round10(plan.tdeeVal)} {t('cal_kcal')}.</Text> : null}
                      <TouchableOpacity style={[s.computeBtn, { marginTop: 14 }]} onPress={saveRealityCheck}>
                        <Text style={s.computeBtnText}>{rcSavedMsg ? `✓ ${t('cal_snap_saved')}` : t('cal_rc_save')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.rcReset, { marginTop: 10 }]} onPress={startNextRealityCheck}>
                        <Text style={s.rcResetText}>{t('cal_rc_next').replace('{n}', String(REALITY_CHECK_DAYS))}</Text>
                      </TouchableOpacity>
                      <Text style={s.rcWhyTitle}>{t('cal_rc_why_title')}</Text>
                      {[1, 2, 3, 4, 5].map(i => <Text key={i} style={s.rcWhy}>•  {t(`cal_rc_why_${i}`)}</Text>)}
                      <Text style={s.rcNote}>{t('cal_rc_unreliable_note')}</Text>
                    </View>
                  )}
                  {rc && rc.status !== 'ok' && (
                    <View style={s.rcResult}><Text style={s.rcGuard}>{t(`cal_rc_${rc.status}`)}</Text></View>
                  )}
                </>
              )}

              {realityLog.length > 0 && (
                <View style={s.rcLog}>
                  <Text style={s.rcWhyTitle}>{t('cal_rc_log_title')}</Text>
                  {[...realityLog].reverse().map((c) => (
                    <View key={c.date} style={s.rcLogRow}>
                      <Text style={s.rcLogDate}>{fmtDate(c.date)}</Text>
                      <Text style={s.rcLogRate}>
                        {c.ratePerWeekKg != null
                          ? `${c.ratePerWeekKg >= 0 ? '−' : '+'}${rateDisplay(c.ratePerWeekKg)} ${wUnit}/${t('cal_week')}`
                          : '—'}
                      </Text>
                      <Text style={s.rcLogTdee}>{round10(c.tdee)} {t('cal_kcal')}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={s.rcLocked}>
              <Text style={s.rcLockedIntro}>{t('cal_rc_locked_intro')}</Text>
              <Text style={s.rcLockedLead}>{t('cal_rc_locked_lead')}</Text>
              <Text style={s.rcLockedItem}>1.  {t('cal_rc_start_weight')}</Text>
              <Text style={s.rcLockedItem}>2.  {t('cal_rc_current_weight')}</Text>
              <Text style={s.rcLockedItem}>3.  {t('cal_rc_intake')}</Text>
              <Text style={s.rcLockedPayoff}>{t('cal_rc_locked_payoff')}</Text>
              <TouchableOpacity style={s.lockedBtn} onPress={() => navigation.navigate('Paywall')}>
                <Text style={s.lockedBtnText}>{t('cal_premium_cta')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Progress snapshots (premium) — part of tracking progress */}
      <View style={s.premCard}>
        <Text style={s.premTitle}>{t('cal_snap_title')}</Text>
        <Text style={s.premSub}>{t('cal_snap_sub')}</Text>
        {premium ? (
          <>
            <TouchableOpacity style={[s.computeBtn, !plan && s.computeBtnDisabled]} onPress={saveSnapshot} disabled={!plan}>
              <Text style={s.computeBtnText}>{snapMsg ? `✓ ${t('cal_snap_saved')}` : t('cal_snap_save')}</Text>
            </TouchableOpacity>
            {snapPointCount >= 2 ? (
              <ProgressChart series={chartSeries} locale={locale} width={CHART_WIDTH} />
            ) : (
              <Text style={s.premSub}>{t('cal_snap_need_more')}</Text>
            )}
          </>
        ) : (
          <View style={s.locked}>
            <Text style={s.lockedText}>{t('cal_premium_locked')}</Text>
            <TouchableOpacity style={s.lockedBtn} onPress={() => navigation.navigate('Paywall')}>
              <Text style={s.lockedBtnText}>{t('cal_premium_cta')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* AI nutrition logger — lives under Track your progress; feeds the
          reality-check's weekly intake. Premium-gated inside the component. */}
      <NutritionLogger />

      {/* ── YOUR NUMBERS ────────────────────────────────────────────── */}
      <SectionHeader
        icon="calc_bars"
        title={t('cal_your_numbers')}
        right={(
          <View style={s.unitToggle}>
            {['metric', 'imperial'].map(u => (
              <TouchableOpacity key={u} style={[s.unitPill, unit === u && s.unitPillOn]} onPress={() => changeUnit(u)}>
                <Text style={[s.unitPillText, unit === u && s.unitPillTextOn]}>{u === 'metric' ? t('cal_metric') : t('cal_imperial')}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      />
      <View style={s.groupCard}>
        {/* Weight + Height — both universal (BMI, waist-to-height, and the Mifflin
            fallback all need height, so height shows regardless of the BF path). */}
        <View style={s.row}>
          <View style={s.rowCol}>
            <Text style={s.fieldLab}>{t('cal_weight')} ({wUnit})</Text>
            <TextInput style={s.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
          </View>
          <View style={s.rowCol}>
            <Text style={s.fieldLab}>{t('cal_height')} ({hUnit})</Text>
            <TextInput style={s.input} value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
          </View>
        </View>

        {/* Body-fat source */}
        <View>
          <Text style={s.fieldLab}>{t('cal_bf_source')}</Text>
          <View style={s.pillWrap}>
            {BF_SOURCES.map(src => (
              <TouchableOpacity key={src} style={[s.pill, bfSource === src && s.pillOn]} onPress={() => setBfSource(src)}>
                <Text style={[s.pillText, bfSource === src && s.pillTextOn]}>{t(`cal_bf_${src}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.hint}>{t(`cal_bf_${bfSource}_hint`)}</Text>
        </View>

        {/* Body fat % (+ optional waist)  OR  sex/age fallback */}
        {!isUnknown ? (
          <View style={s.row}>
            <View style={s.rowCol}>
              <Text style={s.fieldLab}>{t('cal_bodyfat')} (%)</Text>
              <TextInput style={s.input} value={bodyFat} onChangeText={setBodyFat} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
            </View>
            <View style={s.rowCol}>
              <Text style={s.fieldLab}>{t('cal_waist')} ({hUnit}) · {t('cal_optional')}</Text>
              <TextInput style={s.input} value={waist} onChangeText={setWaist} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
            </View>
          </View>
        ) : (
          <>
            <View>
              <Text style={s.fieldLab}>{t('cal_sex')}</Text>
              {profileSex ? (
                <View style={s.segment}>
                  {['male', 'female'].map(sx => (
                    <TouchableOpacity key={sx} style={[s.segBtn, sex === sx && s.segBtnOn]} onPress={() => saveProfileSex(sx)}>
                      <Text style={[s.segText, sex === sx && s.segTextOn]}>{t(`cal_sex_${sx}`)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                // Not set in the profile → prompt to complete it instead of defaulting.
                <TouchableOpacity style={[s.segment, s.sexGatePrompt]} onPress={promptProfileSex}>
                  <Text style={s.sexGatePromptText}>{t('cal_sex_gate_btn')}</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={s.row}>
              <View style={s.rowCol}>
                <Text style={s.fieldLab}>{t('cal_age')}</Text>
                <TextInput style={s.input} value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
              </View>
              <View style={s.rowCol}>
                <Text style={s.fieldLab}>{t('cal_waist')} ({hUnit}) · {t('cal_optional')}</Text>
                <TextInput style={s.input} value={waist} onChangeText={setWaist} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
              </View>
            </View>
          </>
        )}
        <Text style={s.hint}>{t('cal_waist_hint')}</Text>
      </View>
      <Text style={s.disclaimer}>{t('cal_disclaimer')}</Text>

      {/* ── ACTIVITY ────────────────────────────────────────────────── */}
      <SectionHeader icon="calc_bolt" title={t('cal_activity')} />
      <View style={s.groupCard}>
        <View style={s.actGrid}>
          {ACTIVITY_LEVELS.map(a => {
            const on = activity === a.value;
            return (
              <TouchableOpacity key={a.value} style={[s.actChip, on && s.actChipOn]} onPress={() => setActivity(a.value)} activeOpacity={0.7}>
                <View style={[s.actDot, on && s.actDotOn]} />
                <Text style={[s.actChipText, on && s.actChipTextOn]}>{t(a.key)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Understand the numbers — collapsed by default */}
      <TouchableOpacity style={s.rowLink} onPress={() => setLearnOpen(o => !o)} activeOpacity={0.7}>
        <Text style={s.rowLinkText}>{t('cal_learn')}</Text>
        <Text style={s.rowLinkChev}>{learnOpen ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {learnOpen && EXPLAINERS.map(e => (
        <View key={e.key} style={s.explCard}>
          <TouchableOpacity style={s.explHead} onPress={() => setExpl(expl === e.key ? null : e.key)}>
            <Text style={s.explTitle}>{e.title}</Text>
            <Text style={s.explChevron}>{expl === e.key ? '▲' : '▶'}</Text>
          </TouchableOpacity>
          {expl === e.key && <Text style={s.explBody}>{e.body}</Text>}
        </View>
      ))}

      {/* Sources & references — collapsed by default (App Review 1.4.1) */}
      <TouchableOpacity style={s.rowLink} onPress={() => setSourcesOpen(o => !o)} activeOpacity={0.7}>
        <Text style={s.rowLinkText}>{t('cal_sources_title')}</Text>
        <Text style={s.rowLinkChev}>{sourcesOpen ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {sourcesOpen && (
        <>
          <Text style={[s.hint, { marginBottom: 8 }]}>{t('cal_sources_intro')}</Text>
          {REFERENCES.map(r => (
            <TouchableOpacity
              key={r.key}
              style={s.srcRow}
              activeOpacity={0.6}
              onPress={() => Linking.openURL(r.url).catch(() => {})}
            >
              <View style={s.srcText}>
                <Text style={s.srcTopic}>{t(r.key)}</Text>
                <Text style={s.srcCite}>{r.cite}</Text>
              </View>
              <Text style={s.srcArrow}>↗</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  scroll: { flex: 1, padding: 16 },
  // Section header: monoline glyph tile + uppercase micro-label, optional right slot.
  sh: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 24, marginBottom: 10, marginHorizontal: 2 },
  shIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  shTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: c.textMuted },
  shRight: { marginLeft: 'auto' },
  // Grouped input card — inputs sit inside with breathing room.
  groupCard: { backgroundColor: c.card, borderRadius: 20, padding: 16, gap: 16, borderWidth: 0.5, borderColor: c.border },
  fieldLab: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', color: c.textFaint, marginBottom: 7 },
  // Activity — compact 2-col chips (was 5 full-width rows).
  actGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actChip: { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card2, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, borderWidth: 1, borderColor: c.border },
  actChipOn: { backgroundColor: c.accentSoft, borderColor: c.accent },
  actDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: c.border },
  actDotOn: { borderColor: c.accent, backgroundColor: c.accent },
  actChipText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: c.textMuted },
  actChipTextOn: { color: c.text },
  // Collapsed learn/sources rows.
  rowLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.card, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, marginTop: 10, borderWidth: 0.5, borderColor: c.border },
  rowLinkText: { fontSize: 13, fontWeight: '600', color: c.text },
  rowLinkChev: { fontSize: 13, color: c.textFaint },
  disclaimer: { fontSize: 11, color: c.textFaint, lineHeight: 16, marginTop: 10, marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: 8, marginTop: 16 },
  hint: { fontSize: 11, color: c.textFaint, lineHeight: 15, marginTop: 6 },
  input: { backgroundColor: c.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: c.text, borderWidth: 0.5, borderColor: c.border },
  row: { flexDirection: 'row', gap: 12 },
  rowCol: { flex: 1 },
  segment: { flexDirection: 'row', backgroundColor: c.card2, borderRadius: 10, padding: 3, gap: 3 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  segBtnOn: { backgroundColor: c.accent },
  segText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
  segTextOn: { color: c.accentText },
  sexGatePrompt: { justifyContent: 'center', paddingVertical: 11, borderWidth: 1, borderColor: c.accent, backgroundColor: c.accentSoft },
  sexGatePromptText: { fontSize: 13, fontWeight: '700', color: c.accent, textAlign: 'center' },
  // Calculator start: clear section title + a quiet, compact unit toggle
  detailsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 4 },
  detailsTitle: { fontSize: 17, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
  unitToggle: { flexDirection: 'row', backgroundColor: c.card2, borderRadius: 8, padding: 2 },
  unitPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  unitPillOn: { backgroundColor: c.card },
  unitPillText: { fontSize: 12, fontWeight: '600', color: c.textFaint },
  unitPillTextOn: { color: c.accent, fontWeight: '700' },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { backgroundColor: c.card, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8, borderWidth: 0.5, borderColor: c.border },
  pillOn: { backgroundColor: c.accentSoft, borderColor: c.accent },
  pillText: { fontSize: 12, fontWeight: '500', color: c.textMuted },
  pillTextOn: { color: c.accent, fontWeight: '600' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: c.accent, borderColor: c.accent },
  checkMark: { color: c.accentText, fontSize: 13, fontWeight: '700' },
  checkLabel: { flex: 1, fontSize: 13, color: c.text },
  actRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 0.5, borderColor: c.border },
  actRowOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c.border },
  radioOn: { borderColor: c.accent, backgroundColor: c.accent },
  actText: { flex: 1, fontSize: 13, color: c.textMuted },
  actTextOn: { color: c.text, fontWeight: '500' },
  introCard: { backgroundColor: c.accentSoft, borderRadius: 14, padding: 14, marginBottom: 4 },
  introTitle: { fontSize: 14, fontWeight: '700', color: c.accentSoftText, marginBottom: 4 },
  introBody: { fontSize: 12, color: c.accentSoftText, lineHeight: 18 },
  overview: { backgroundColor: c.card, borderRadius: 18, padding: 16, marginTop: 12, ...c.shadowSoft },
  overviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 },
  overviewTitle: { fontSize: 13, fontWeight: '800', color: c.text, letterSpacing: 0.5 },
  echoChip: { backgroundColor: c.card2, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 1 },
  echoChipText: { fontSize: 11, color: c.textMuted },
  heroRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  heroCard: { flex: 1, backgroundColor: c.card2, borderRadius: 12, padding: 12 },
  // Primary (daily-burn) card carries the accent so the key number has life.
  heroCardPrimary: { backgroundColor: c.accentSoft },
  heroLabel: { fontSize: 11, color: c.textMuted, marginBottom: 4 },
  heroLabelPrimary: { fontSize: 11, color: c.accentSoftText, fontWeight: '600', marginBottom: 4 },
  heroVal: { fontSize: 22, fontWeight: '800', color: c.text },
  heroValAccent: { color: c.accent },
  heroUnit: { fontSize: 12, fontWeight: '500', color: c.textMuted },
  heroUnitAccent: { fontSize: 12, fontWeight: '600', color: c.accent },
  heroSub: { fontSize: 10, color: c.textFaint, marginTop: 3 },
  heroSubPrimary: { fontSize: 10, color: c.accentSoftText, opacity: 0.8, marginTop: 3 },
  goalRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  goalCard: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 10, alignItems: 'center' },
  goalCardOn: { borderColor: c.accent, borderWidth: 2, backgroundColor: c.accentSoft },
  goalLabel: { fontSize: 11, fontWeight: '600', color: c.textMuted },
  goalLabelOn: { color: c.accent },
  goalVal: { fontSize: 17, fontWeight: '700', color: c.text, marginTop: 2 },
  goalValOn: { color: c.accent },
  goalSub: { fontSize: 9, color: c.textFaint, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { backgroundColor: c.card2, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 11, color: c.textMuted },
  warnBox: { backgroundColor: c.warningSoft, borderRadius: 10, padding: 10, marginTop: 8 },
  warnText: { fontSize: 11, color: c.warningSoftText, lineHeight: 16 },
  goalBadge: { backgroundColor: c.accent, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  goalBadgeText: { color: c.accentText, fontSize: 12, fontWeight: '700' },
  overviewHeadline: { marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: c.border },
  overviewHeadlineLabel: { fontSize: 12, color: c.textMuted, marginBottom: 3 },
  overviewHeadlineVal: { fontSize: 24, fontWeight: '800', color: c.accent },
  overviewHeadlineSub: { fontSize: 11, color: c.textFaint, marginTop: 3 },
  overviewStats: { flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: c.border },
  overviewStat: { flex: 1, alignItems: 'center' },
  overviewStatVal: { fontSize: 17, fontWeight: '700', color: c.text },
  overviewStatLabel: { fontSize: 11, color: c.textMuted, marginTop: 2, textAlign: 'center' },
  overviewStatDiv: { width: 0.5, height: 34, backgroundColor: c.border },
  deltaRow: { marginTop: 14, backgroundColor: c.card2, borderRadius: 10, padding: 10 },
  deltaText: { fontSize: 12, color: c.text, fontWeight: '500' },
  results: { backgroundColor: c.card, borderRadius: 18, padding: 16, marginTop: 20, ...c.shadowSoft },
  resultsTitle: { fontSize: 12, fontWeight: '700', color: c.textFaint, letterSpacing: 0.5, marginBottom: 12 },
  resultsHint: { fontSize: 13, color: c.textMuted, textAlign: 'center', paddingVertical: 8 },
  resRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  resLabel: { fontSize: 13, color: c.textMuted },
  resVal: { fontSize: 14, fontWeight: '600', color: c.text },
  resHeadline: { marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: c.border },
  resHeadlineLabel: { fontSize: 12, color: c.textMuted, marginBottom: 3 },
  resHeadlineVal: { fontSize: 22, fontWeight: '700', color: c.accent },
  resHeadlineSub: { fontSize: 11, color: c.textFaint, marginTop: 3 },
  estimateNote: { fontSize: 11, color: c.textFaint, lineHeight: 16, marginTop: 14 },
  premCard: { backgroundColor: c.card, borderRadius: 18, padding: 16, marginTop: 16, ...c.shadowSoft },
  premTitle: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 4 },
  premSub: { fontSize: 12, color: c.textMuted, lineHeight: 17, marginBottom: 4 },
  computeBtn: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  computeBtnDisabled: { opacity: 0.4 },
  computeBtnText: { color: c.accentText, fontSize: 14, fontWeight: '600' },
  rcResult: { marginTop: 16, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: c.border },
  rcHeadline: { fontSize: 16, fontWeight: '700', color: c.accent, lineHeight: 22 },
  rcVs: { fontSize: 13, color: c.textMuted, marginTop: 4 },
  rcWhyTitle: { fontSize: 12, fontWeight: '700', color: c.textFaint, letterSpacing: 0.4, marginTop: 16, marginBottom: 8 },
  rcWhy: { fontSize: 13, color: c.textMuted, lineHeight: 20, marginBottom: 4 },
  rcNote: { fontSize: 11, color: c.textFaint, lineHeight: 16, marginTop: 12 },
  rcGuard: { fontSize: 13, color: c.textMuted, lineHeight: 19 },
  // Phase-2 "tracking" banner + reset/next links
  rcTracking: { backgroundColor: c.accentSoft, borderRadius: 12, padding: 12, marginTop: 8, marginBottom: 4 },
  rcTrackingLine: { fontSize: 15, fontWeight: '700', color: c.accentSoftText },
  rcTrackingSub: { fontSize: 12, color: c.accentSoftText, opacity: 0.85, marginTop: 3 },
  rcReset: { alignItems: 'center', paddingVertical: 10, marginTop: 8 },
  rcResetText: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
  locked: { alignItems: 'center', paddingVertical: 16, marginTop: 8 },
  lockedText: { fontSize: 13, color: c.textMuted, marginBottom: 12 },
  lockedBtn: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 24 },
  lockedBtnText: { color: c.accentText, fontSize: 14, fontWeight: '600' },
  srcRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 16, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 8, ...c.shadowSoft },
  srcText: { flex: 1 },
  srcTopic: { fontSize: 13, fontWeight: '600', color: c.text },
  srcCite: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  srcArrow: { fontSize: 16, color: c.accent, marginLeft: 10 },
  sbReality: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 18, padding: 16, marginTop: 12, ...c.shadowSoft },
  sbRealityMain: { flex: 1 },
  sbRealityLabel: { fontSize: 12, fontWeight: '600', color: c.textFaint, letterSpacing: 0.3, marginBottom: 4 },
  sbRealityVal: { fontSize: 18, fontWeight: '800', color: c.accent },
  sbRealityMuted: { fontSize: 14, fontWeight: '600', color: c.textFaint },
  sbRealityRight: { alignItems: 'flex-end', marginLeft: 10 },
  sbRealityRate: { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 2 },
  sbArrow: { fontSize: 18, color: c.textFaint },
  sbActions: { flexDirection: 'row', marginTop: 10 },
  sbActionBtn: { flex: 1, backgroundColor: c.card, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 0.5, borderColor: c.border },
  sbActionText: { fontSize: 13, fontWeight: '600', color: c.accent },
  rcRate: { fontSize: 14, fontWeight: '600', color: c.text, marginTop: 6 },
  rcLog: { marginTop: 18, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: c.border },
  rcLogRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: c.border },
  rcLogDate: { fontSize: 13, color: c.textMuted, flex: 1 },
  rcLogRate: { fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'center' },
  rcLogTdee: { fontSize: 12, color: c.textFaint, flex: 1, textAlign: 'right' },
  rcLocked: { marginTop: 8 },
  rcLockedIntro: { fontSize: 13, color: c.textMuted, lineHeight: 20 },
  rcLockedLead: { fontSize: 13, fontWeight: '600', color: c.text, marginTop: 12, marginBottom: 6 },
  rcLockedItem: { fontSize: 13, color: c.textMuted, lineHeight: 22 },
  rcLockedPayoff: { fontSize: 13, color: c.text, lineHeight: 20, marginTop: 12, marginBottom: 16 },
  learn: {},
  explCard: { backgroundColor: c.card, borderRadius: 16, marginBottom: 8, overflow: 'hidden', ...c.shadowSoft },
  explHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  explTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: c.text, marginRight: 10 },
  explChevron: { fontSize: 11, color: c.textFaint },
  explBody: { fontSize: 13, color: c.textMuted, lineHeight: 20, paddingHorizontal: 14, paddingBottom: 14 },
});
