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
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getCachedUser, supabase } from '../../lib/supabase';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import {
  computeBMR, tdee, goalCalories, proteinTarget, ACTIVITY_LEVELS, lbToKg, inToCm,
} from '../../lib/energyCalc';

const BF_SOURCES = ['dexa', 'gym', 'calipers', 'scale', 'unknown'];
const GOALS = ['lose', 'maintain', 'gain'];
const round10 = n => Math.round(n / 10) * 10;
const round5 = n => Math.round(n / 5) * 5;
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

export default function CalculatorSection() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

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
  const loadedRef = useRef(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    if (loadedRef.current) return;
    const user = await getCachedUser();
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

  const EXPLAINERS = [
    { key: 'scale', title: t('cal_expl_scale_title'), body: t('cal_expl_scale_body') },
    { key: 'deficit', title: t('cal_expl_deficit_title'), body: t('cal_expl_deficit_body') },
    { key: 'measure', title: t('cal_expl_measure_title'), body: t('cal_expl_measure_body') },
  ];

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={s.scroll} keyboardShouldPersistTaps="handled">
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

      {/* Results */}
      {result ? (
        <View style={s.results}>
          <Text style={s.resultsTitle}>{t('cal_results_title')}</Text>

          <View style={s.resRow}><Text style={s.resLabel}>{t('cal_bmr')}</Text><Text style={s.resVal}>{round10(result.bmr)} {t('cal_kcal')}</Text></View>
          <View style={s.resRow}><Text style={s.resLabel}>{t('cal_tdee')}</Text><Text style={s.resVal}>{round10(result.tdeeVal)} {t('cal_kcal')}</Text></View>

          <View style={s.resHeadline}>
            <Text style={s.resHeadlineLabel}>{t(`cal_goal_${goal}`)} · {t('cal_target')}</Text>
            <Text style={s.resHeadlineVal}>
              {goal === 'maintain'
                ? `${round10(result.cals.mid)} ${t('cal_kcal')}`
                : `${round10(result.cals.low)}–${round10(result.cals.high)} ${t('cal_kcal')}`}
            </Text>
          </View>

          <View style={s.resHeadline}>
            <Text style={s.resHeadlineLabel}>{t('cal_protein')}</Text>
            <Text style={s.resHeadlineVal}>{round5(result.protein.rec)} {t('cal_g_day')}</Text>
            <Text style={s.resHeadlineSub}>{t('cal_range')} {round5(result.protein.low)}–{round5(result.protein.high)} {t('cal_g_day')} · {t(`cal_protein_basis_${result.protein.basis}`)}</Text>
          </View>

          <Text style={s.estimateNote}>{t('cal_estimate_note')}</Text>
        </View>
      ) : (
        <View style={s.results}><Text style={s.resultsHint}>{t('cal_need_inputs')}</Text></View>
      )}

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
  learn: {},
  explCard: { backgroundColor: c.card, borderRadius: 12, marginBottom: 8, overflow: 'hidden', borderWidth: 0.5, borderColor: c.border },
  explHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  explTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: c.text, marginRight: 10 },
  explChevron: { fontSize: 11, color: c.textFaint },
  explBody: { fontSize: 13, color: c.textMuted, lineHeight: 20, paddingHorizontal: 14, paddingBottom: 14 },
});
