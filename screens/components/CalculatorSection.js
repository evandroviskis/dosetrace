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
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getCachedUser, supabase } from '../../lib/supabase';
import { isPremium } from '../../lib/purchases';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import {
  computeBMR, tdee, goalCalories, proteinTarget, ACTIVITY_LEVELS, realityCheckTDEE,
  lbToKg, kgToLb, inToCm, cmToIn,
} from '../../lib/energyCalc';
import ProgressChart from './ProgressChart';

const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };
const todayISO = () => new Date().toISOString().split('T')[0];
const SNAP_CAP = 50;
const CHART_WIDTH = Dimensions.get('window').width - 64;

const BF_SOURCES = ['dexa', 'gym', 'calipers', 'scale', 'unknown'];
const GOALS = ['lose', 'maintain', 'gain'];
const round10 = n => Math.round(n / 10) * 10;
const round5 = n => Math.round(n / 5) * 5;
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

export default function CalculatorSection() {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const locale = LOCALE_MAP[language] || 'en-US';

  const [unit, setUnit] = useState('metric');       // 'metric' | 'imperial'
  const [weight, setWeight] = useState('');
  const [bfSource, setBfSource] = useState('gym');
  const [bodyFat, setBodyFat] = useState('');
  const [sex, setSex] = useState('male');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [activity, setActivity] = useState(1.375);
  const [goal, setGoal] = useState('lose');
  const [resistance, setResistance] = useState(false);
  const [waist, setWaist] = useState('');
  const [expl, setExpl] = useState(null);           // which explainer is open
  const [premium, setPremium] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [snapMsg, setSnapMsg] = useState(false);
  // Reality-check inputs (display units).
  const [rcThen, setRcThen] = useState('');
  const [rcNow, setRcNow] = useState('');
  const [rcDays, setRcDays] = useState('');
  const [rcIntake, setRcIntake] = useState('');
  const [rc, setRc] = useState(null);               // { status, tdee }
  const loadedRef = useRef(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setPremium(await isPremium());
    if (loadedRef.current) return;
    const user = await getCachedUser();
    const snaps = user?.user_metadata?.calc_snapshots;
    if (Array.isArray(snaps)) setSnapshots(snaps);
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
      if (typeof saved.resistance === 'boolean') setResistance(saved.resistance);
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
    const bmrInput = {
      weightKg: metric.weightKg,
      heightCm: metric.heightCm,
      age: num(age),
      sex,
      bodyFatPct: isUnknown ? null : num(bodyFat),
      resistanceTrained: resistance,
    };
    const { bmr, method, lbm } = computeBMR(bmrInput);
    if (!bmr) return null;
    const tdeeVal = tdee(bmr, activity);
    const cals = goalCalories(tdeeVal, goal);
    const protein = proteinTarget({ weightKg: metric.weightKg, lbmKg: lbm });
    return { bmr, method, lbm, tdeeVal, cals, protein };
  }, [metric, age, sex, bodyFat, bfSource, resistance, activity, goal]);

  // Persist inputs (debounced, fire-and-forget) once initial load is done.
  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(() => {
      const payload = { unit, weight, bfSource, bodyFat, sex, age, height, activity, goal, resistance, waist };
      supabase.auth.updateUser({ data: { calc_inputs: payload } }).catch(() => {});
    }, 900);
    return () => clearTimeout(timer);
  }, [unit, weight, bfSource, bodyFat, sex, age, height, activity, goal, resistance, waist]);

  const wUnit = unit === 'imperial' ? t('cal_unit_lb') : t('cal_unit_kg');
  const hUnit = unit === 'imperial' ? t('cal_unit_in') : t('cal_unit_cm');
  const isUnknown = bfSource === 'unknown';

  const waistCm = useMemo(() => {
    const w = num(waist);
    if (w == null) return null;
    return unit === 'imperial' ? inToCm(w) : w;
  }, [waist, unit]);

  // ── Snapshots (premium) ──────────────────────────────────────────
  function saveSnapshot() {
    if (!result || metric.weightKg == null) return;
    const snap = {
      date: todayISO(),
      weightKg: metric.weightKg,
      waistCm,
      bodyFatPct: isUnknown ? null : num(bodyFat),
      lbm: result.lbm,
      bmr: Math.round(result.bmr),
      tdee: Math.round(result.tdeeVal),
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
  function computeReality() {
    const thenKg = num(rcThen) == null ? null : (unit === 'imperial' ? lbToKg(num(rcThen)) : num(rcThen));
    const nowKg = num(rcNow) == null ? null : (unit === 'imperial' ? lbToKg(num(rcNow)) : num(rcNow));
    const days = num(rcDays);
    const intake = num(rcIntake);
    if (thenKg == null || nowKg == null || !days || intake == null) { setRc(null); return; }
    // weightChangeKg = amount lost (positive when weight went down).
    setRc(realityCheckTDEE({ avgDailyCalories: intake, weightChangeKg: thenKg - nowKg, days }));
  }

  const EXPLAINERS = [
    { key: 'scale', title: t('cal_expl_scale_title'), body: t('cal_expl_scale_body') },
    { key: 'deficit', title: t('cal_expl_deficit_title'), body: t('cal_expl_deficit_body') },
    { key: 'measure', title: t('cal_expl_measure_title'), body: t('cal_expl_measure_body') },
  ];

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={s.scroll} keyboardShouldPersistTaps="handled">
      {/* Intro — what this is */}
      <View style={s.introCard}>
        <Text style={s.introTitle}>{t('cal_intro_title')}</Text>
        <Text style={s.introBody}>{t('cal_intro_body')}</Text>
      </View>

      {/* Overview — the user's current situation */}
      {result ? (
        <View style={s.overview}>
          <View style={s.overviewTop}>
            <Text style={s.overviewTitle}>{t('cal_overview_title')}</Text>
            <View style={s.goalBadge}><Text style={s.goalBadgeText}>{t(`cal_goal_${goal}`)}</Text></View>
          </View>

          <View style={s.overviewHeadline}>
            <Text style={s.overviewHeadlineLabel}>{t('cal_target')}</Text>
            <Text style={s.overviewHeadlineVal}>
              {goal === 'maintain'
                ? `${round10(result.cals.mid)} ${t('cal_kcal')}`
                : `${round10(result.cals.low)}–${round10(result.cals.high)} ${t('cal_kcal')}`}
            </Text>
          </View>
          <View style={s.overviewHeadline}>
            <Text style={s.overviewHeadlineLabel}>{t('cal_protein')}</Text>
            <Text style={s.overviewHeadlineVal}>{round5(result.protein.rec)} {t('cal_g_day')}</Text>
            <Text style={s.overviewHeadlineSub}>{t('cal_range')} {round5(result.protein.low)}–{round5(result.protein.high)} {t('cal_g_day')} · {t(`cal_protein_basis_${result.protein.basis}${unit === 'imperial' ? '_imp' : ''}`)}</Text>
          </View>

          <View style={s.overviewStats}>
            <View style={s.overviewStat}><Text style={s.overviewStatVal}>{round10(result.bmr)}</Text><Text style={s.overviewStatLabel}>{t('cal_bmr')}</Text></View>
            <View style={s.overviewStatDiv} />
            <View style={s.overviewStat}><Text style={s.overviewStatVal}>{round10(result.tdeeVal)}</Text><Text style={s.overviewStatLabel}>{t('cal_tdee')}</Text></View>
          </View>

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

      <Text style={[s.label, { marginTop: 20 }]}>{t('cal_your_details')}</Text>
      <Text style={s.disclaimer}>{t('cal_disclaimer')}</Text>

      {/* Units */}
      <View style={s.segment}>
        {['metric', 'imperial'].map(u => (
          <TouchableOpacity key={u} style={[s.segBtn, unit === u && s.segBtnOn]} onPress={() => setUnit(u)}>
            <Text style={[s.segText, unit === u && s.segTextOn]}>{u === 'metric' ? t('cal_metric') : t('cal_imperial')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Weight */}
      <Text style={s.label}>{t('cal_weight')} ({wUnit})</Text>
      <TextInput style={s.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textFaint} />

      {/* Body-fat source */}
      <Text style={s.label}>{t('cal_bf_source')}</Text>
      <View style={s.pillWrap}>
        {BF_SOURCES.map(src => (
          <TouchableOpacity key={src} style={[s.pill, bfSource === src && s.pillOn]} onPress={() => setBfSource(src)}>
            <Text style={[s.pillText, bfSource === src && s.pillTextOn]}>{t(`cal_bf_${src}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.hint}>{t(`cal_bf_${bfSource}_hint`)}</Text>

      {/* Body fat %  OR  age/sex/height fallback */}
      {!isUnknown ? (
        <>
          <Text style={s.label}>{t('cal_bodyfat')} (%)</Text>
          <TextInput style={s.input} value={bodyFat} onChangeText={setBodyFat} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
        </>
      ) : (
        <>
          <Text style={s.label}>{t('cal_sex')}</Text>
          <View style={s.segment}>
            {['male', 'female'].map(sx => (
              <TouchableOpacity key={sx} style={[s.segBtn, sex === sx && s.segBtnOn]} onPress={() => setSex(sx)}>
                <Text style={[s.segText, sex === sx && s.segTextOn]}>{t(`cal_sex_${sx}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.row}>
            <View style={s.rowCol}>
              <Text style={s.label}>{t('cal_age')}</Text>
              <TextInput style={s.input} value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
            </View>
            <View style={s.rowCol}>
              <Text style={s.label}>{t('cal_height')} ({hUnit})</Text>
              <TextInput style={s.input} value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
            </View>
          </View>
        </>
      )}

      {/* Resistance-trained flag (switches Katch → Cunningham) */}
      {!isUnknown && (
        <TouchableOpacity style={s.checkRow} onPress={() => setResistance(v => !v)}>
          <View style={[s.checkbox, resistance && s.checkboxOn]}>{resistance ? <Text style={s.checkMark}>✓</Text> : null}</View>
          <Text style={s.checkLabel}>{t('cal_resistance')}</Text>
        </TouchableOpacity>
      )}

      {/* Activity */}
      <Text style={s.label}>{t('cal_activity')}</Text>
      {ACTIVITY_LEVELS.map(a => (
        <TouchableOpacity key={a.value} style={[s.actRow, activity === a.value && s.actRowOn]} onPress={() => setActivity(a.value)}>
          <View style={[s.radio, activity === a.value && s.radioOn]} />
          <Text style={[s.actText, activity === a.value && s.actTextOn]}>{t(a.key)}</Text>
        </TouchableOpacity>
      ))}

      {/* Goal */}
      <Text style={s.label}>{t('cal_goal')}</Text>
      <View style={s.segment}>
        {GOALS.map(g => (
          <TouchableOpacity key={g} style={[s.segBtn, goal === g && s.segBtnOn]} onPress={() => setGoal(g)}>
            <Text style={[s.segText, goal === g && s.segTextOn]}>{t(`cal_goal_${g}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Optional waist — the headline non-scale metric */}
      <Text style={s.label}>{t('cal_waist')} ({hUnit}) · {t('cal_optional')}</Text>
      <TextInput style={s.input} value={waist} onChangeText={setWaist} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
      <Text style={s.hint}>{t('cal_waist_hint')}</Text>

      {/* Reality check (premium) */}
      <View style={s.premCard}>
        <Text style={s.premTitle}>{t('cal_rc_title')}</Text>
        <Text style={s.premSub}>{t('cal_rc_sub')}</Text>
        {premium ? (
          <>
            <Text style={s.label}>{t('cal_rc_weight_then')} ({wUnit})</Text>
            <TextInput style={s.input} value={rcThen} onChangeText={setRcThen} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
            <Text style={s.label}>{t('cal_rc_weight_now')} ({wUnit})</Text>
            <TextInput style={s.input} value={rcNow} onChangeText={setRcNow} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
            <View style={s.row}>
              <View style={s.rowCol}>
                <Text style={s.label}>{t('cal_rc_days')}</Text>
                <TextInput style={s.input} value={rcDays} onChangeText={setRcDays} keyboardType="number-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
              </View>
              <View style={s.rowCol}>
                <Text style={s.label}>{t('cal_rc_intake')}</Text>
                <TextInput style={s.input} value={rcIntake} onChangeText={setRcIntake} keyboardType="number-pad" placeholder="—" placeholderTextColor={colors.textFaint} />
              </View>
            </View>
            <TouchableOpacity style={s.computeBtn} onPress={computeReality}>
              <Text style={s.computeBtnText}>{t('cal_rc_compute')}</Text>
            </TouchableOpacity>

            {rc && rc.status === 'ok' && (
              <View style={s.rcResult}>
                <Text style={s.rcHeadline}>{t('cal_rc_result_prefix')} {round10(rc.tdee)} {t('cal_kcal')}/{t('cal_day')}</Text>
                {result ? <Text style={s.rcVs}>{t('cal_rc_vs')} {round10(result.tdeeVal)} {t('cal_kcal')}.</Text> : null}
                <Text style={s.rcWhyTitle}>{t('cal_rc_why_title')}</Text>
                {[1, 2, 3, 4, 5].map(i => <Text key={i} style={s.rcWhy}>•  {t(`cal_rc_why_${i}`)}</Text>)}
                <Text style={s.rcNote}>{t('cal_rc_unreliable_note')}</Text>
              </View>
            )}
            {rc && rc.status !== 'ok' && (
              <View style={s.rcResult}><Text style={s.rcGuard}>{t(`cal_rc_${rc.status}`)}</Text></View>
            )}
          </>
        ) : (
          <View style={s.locked}>
            <Text style={s.lockedText}>🔒  {t('cal_premium_locked')}</Text>
            <TouchableOpacity style={s.lockedBtn} onPress={() => navigation.navigate('Paywall')}>
              <Text style={s.lockedBtnText}>{t('cal_premium_cta')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Progress snapshots (premium) */}
      <View style={s.premCard}>
        <Text style={s.premTitle}>{t('cal_snap_title')}</Text>
        <Text style={s.premSub}>{t('cal_snap_sub')}</Text>
        {premium ? (
          <>
            <TouchableOpacity style={[s.computeBtn, !result && s.computeBtnDisabled]} onPress={saveSnapshot} disabled={!result}>
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
            <Text style={s.lockedText}>🔒  {t('cal_premium_locked')}</Text>
            <TouchableOpacity style={s.lockedBtn} onPress={() => navigation.navigate('Paywall')}>
              <Text style={s.lockedBtnText}>{t('cal_premium_cta')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Explainers */}
      <Text style={[s.label, { marginTop: 24 }]}>{t('cal_learn')}</Text>
      {EXPLAINERS.map(e => (
        <View key={e.key} style={s.explCard}>
          <TouchableOpacity style={s.explHead} onPress={() => setExpl(expl === e.key ? null : e.key)}>
            <Text style={s.explTitle}>{e.title}</Text>
            <Text style={s.explChevron}>{expl === e.key ? '▲' : '▶'}</Text>
          </TouchableOpacity>
          {expl === e.key && <Text style={s.explBody}>{e.body}</Text>}
        </View>
      ))}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  scroll: { flex: 1, padding: 16 },
  disclaimer: { fontSize: 11, color: c.textFaint, lineHeight: 16, marginBottom: 14 },
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
  overview: { backgroundColor: c.card, borderRadius: 14, padding: 16, marginTop: 12, borderWidth: 0.5, borderColor: c.border },
  overviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  overviewTitle: { fontSize: 12, fontWeight: '700', color: c.textFaint, letterSpacing: 0.5 },
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
  results: { backgroundColor: c.card, borderRadius: 14, padding: 16, marginTop: 20, borderWidth: 0.5, borderColor: c.border },
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
  premCard: { backgroundColor: c.card, borderRadius: 14, padding: 16, marginTop: 16, borderWidth: 0.5, borderColor: c.border },
  premTitle: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 4 },
  premSub: { fontSize: 12, color: c.textMuted, lineHeight: 17, marginBottom: 4 },
  computeBtn: { backgroundColor: c.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  computeBtnDisabled: { opacity: 0.4 },
  computeBtnText: { color: c.accentText, fontSize: 14, fontWeight: '600' },
  rcResult: { marginTop: 16, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: c.border },
  rcHeadline: { fontSize: 16, fontWeight: '700', color: c.accent, lineHeight: 22 },
  rcVs: { fontSize: 13, color: c.textMuted, marginTop: 4 },
  rcWhyTitle: { fontSize: 12, fontWeight: '700', color: c.textFaint, letterSpacing: 0.4, marginTop: 16, marginBottom: 8 },
  rcWhy: { fontSize: 13, color: c.textMuted, lineHeight: 20, marginBottom: 4 },
  rcNote: { fontSize: 11, color: c.textFaint, lineHeight: 16, marginTop: 12 },
  rcGuard: { fontSize: 13, color: c.textMuted, lineHeight: 19 },
  locked: { alignItems: 'center', paddingVertical: 16, marginTop: 8 },
  lockedText: { fontSize: 13, color: c.textMuted, marginBottom: 12 },
  lockedBtn: { backgroundColor: c.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24 },
  lockedBtnText: { color: c.accentText, fontSize: 14, fontWeight: '600' },
  learn: {},
  explCard: { backgroundColor: c.card, borderRadius: 12, marginBottom: 8, overflow: 'hidden', borderWidth: 0.5, borderColor: c.border },
  explHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  explTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: c.text, marginRight: 10 },
  explChevron: { fontSize: 11, color: c.textFaint },
  explBody: { fontSize: 13, color: c.textMuted, lineHeight: 20, paddingHorizontal: 14, paddingBottom: 14 },
});
