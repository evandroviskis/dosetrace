/**
 * DoseTrace — Energy & protein calculator (the Progress screen, behind Journey's tile)
 *
 * Graduated redesign (docs/design/prototype.html progressScreen): with a plan the order
 * is hero (weight, daily burn, target) → daily plan → reality check (with the food
 * log's intake + reminder) → weigh-ins → your numbers; before one it is intro → your
 * numbers → status → reality check → target → weigh-ins. Then the disclaimer and
 * Understand the numbers / Sources. Target and past weigh-in are bottom sheets.
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
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, useWindowDimensions, Alert, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import Svg, { Path, Rect, Line } from 'react-native-svg';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getCachedUser, supabase } from '../../lib/supabase';
import { hasPremium } from '../../lib/entitlement';
import { realityCheckAccess, mergeWeighIn } from '../../lib/weighInAccess';
import { profileBodyInputs } from '../../lib/bodyProfile';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { CONTENT_MAX_WIDTH } from '../../lib/responsive';
import { MONO } from '../../lib/fonts';
import {
  energyPlan, ACTIVITY_LEVELS, realityCheckTDEE, weeklyRateKg,
  targetProjection, seriesRatePerWeek, goalsForTdee, TARGET_MIN_WINDOW_DAYS,
  lbToKg, kgToLb, inToCm, cmToIn,
} from '../../lib/energyCalc';
import DateTimePicker from '@react-native-community/datetimepicker';
import { syncRealityCheckReminder, syncFoodLogReminder, REALITY_CHECK_DAYS } from '../../lib/notifications';
import { getRealityStart, setRealityStart, clearRealityStart, getCalcInputs, saveCalcInputs } from '../../lib/realityCheck';
import { validStartDate, stepStartDate, weighInOn, earliestStart, prefillStartWeight } from '../../lib/realityCheckRules';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestSync, notifyDataChanged } from '../../lib/sync';
import { getDraft, setDraft, clearDraft, keepDraft } from '../../lib/draftStore';
import { localISO } from '../../lib/localDate';
import { createDebouncedSave } from '../../lib/debouncedSave';
import {
  getFoodLogsSince,
  getRealityChecks, upsertRealityCheck, clearRealityChecks,
  getCalcSnapshots, upsertCalcSnapshot,
  getCalcTarget, upsertCalcTarget, clearCalcTarget,
} from '../../lib/database';

// Durable per-device flag: the one-time legacy metadata->tables migration ran here.
const MIGRATED_KEY = 'dosetrace_calc_history_migrated_v55';

// Map synced DB rows (snake_case columns) <-> the shape the UI/chart use.
const rcRowToUI = (r) => ({ date: r.entry_date, tdee: r.tdee, ratePerWeekKg: r.rate_per_week_kg });
const snapRowToUI = (r) => ({ date: r.entry_date, weightKg: r.weight_kg, waistCm: r.waist_cm, bodyFatPct: r.body_fat_pct, lbm: r.lbm, bmr: r.bmr, tdee: r.tdee });
import ProgressChart from './ProgressChart';
import FeatureIcon from '../../components/FeatureIcon';
import NutritionLogger from './NutritionLogger';
import { intakeRun, MIN_RUN_DAYS } from '../../lib/nutrition';
import { loadFoodAccess, ensureFreeStart } from '../../lib/foodLogActions';
import CheckMark from '../../components/CheckMark';
import SegmentedBar from '../../components/SegmentedBar';
import LearnBlock from './LearnBlock';

const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };
// LOCAL date (journey-review F1): a UTC date shifted check starts/snapshots by a day.
const todayISO = () => localISO();
// Whole days between two YYYY-MM-DD dates (noon-anchored to dodge DST).
const daysBetween = (fromISO, toISO) => {
  const a = new Date(fromISO + 'T12:00:00').getTime();
  const b = new Date(toISO + 'T12:00:00').getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
};
// History is no longer capped: the synced tables hold full history (capping would
// delete a user's older entries — a data-loss the "never lose data" rule forbids).
// Chart width tracks the live window (fold/unfold, rotation) — see useWindowDimensions in the component.

const BF_SOURCES = ['dexa', 'gym', 'calipers', 'scale', 'unknown'];
const round10 = n => Math.round(n / 10) * 10;
const round5 = n => Math.round(n / 5) * 5;
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

// flushRef (optional): the screen gets a function that writes any pending input now, for its
// beforeLeave on a fold or unfold (S-26 BK-10). paneWidth (optional): the width of the book
// page it sits on, so the chart fits the page instead of the whole unfolded window.
export default function CalculatorSection({ header = null, flushRef = null, paneWidth = null }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const CHART_WIDTH = Math.min(paneWidth || windowWidth, CONTENT_MAX_WIDTH) - 68; // screen gutter 16 + card padding 18, both sides
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
  const [ageFromProfile, setAgeFromProfile] = useState(false); // S-04: age follows the profile birth year
  const [height, setHeight] = useState('');
  const [activity, setActivity] = useState(1.375);
  const [goal, setGoal] = useState('lose');
  const [waist, setWaist] = useState('');
  const [numbersOpen, setNumbersOpen] = useState(null); // "Your numbers" collapse: null = auto (open until there is a plan)
  const [introOpen, setIntroOpen] = useState(false);    // "What this is" inside the daily plan
  const [premium, setPremium] = useState(false);
  const [rcWeighMsg, setRcWeighMsg] = useState(false);
  const [rcFree, setRcFree] = useState(false); // free 7 days of food log + reality check (FL-41)
  const [snapshots, setSnapshots] = useState([]);
  // Text typed in the forms below and not saved yet comes back from lib/draftStore when this
  // screen remounts (a fold or unfold, another Journey item, leaving and coming back), and is
  // kept until it is saved or the app closes (S-26 BK-14, A-77). Read once, on mount.
  const [rcDraft] = useState(() => getDraft('progress:rcWeigh'));
  const [tgtDraft] = useState(() => getDraft('progress:target'));
  const [bfDraft] = useState(() => getDraft('progress:pastWeighIn'));
  // null = today; else a past weigh-in day (≤ 7 days back; a kept day that is now too old is dropped)
  const [rcStartDate, setRcStartDate] = useState(() => (rcDraft && rcDraft.startDate && validStartDate(rcDraft.startDate, todayISO()) ? rcDraft.startDate : null));
  const rcThenAuto = useRef(rcDraft && rcDraft.thenAuto != null ? rcDraft.thenAuto : null); // the start weight the date picker last filled in (never overwrite a typed one)
  const [snapMsg, setSnapMsg] = useState(false);
  // Reality-check inputs (display units).
  const [rcThen, setRcThen] = useState(() => (rcDraft && rcDraft.then) || '');         // phase-1 starting weight
  const [rcNow, setRcNow] = useState(() => (rcDraft && rcDraft.now) || '');           // phase-2 current weight
  const [rcIntake, setRcIntake] = useState(() => getDraft('progress:rcIntake') || '');
  const [rc, setRc] = useState(null);               // { status, tdee, ratePerWeekKg }
  const [rcStart, setRcStart] = useState(null);     // { date, weightKg } — open check-in
  const [rcOpen, setRcOpen] = useState(false);      // collapsible panel under the goal
  const [realityLog, setRealityLog] = useState([]); // saved reality checks over time
  const [rcSavedMsg, setRcSavedMsg] = useState(false);
  const [foodRows, setFoodRows] = useState([]); // food_logs rows, for the check-window intake

  // ── Personal target (build 56) ──────────────────────────────────
  const [target, setTarget] = useState(null);        // the saved calc_targets row
  const [targetEditing, setTargetEditing] = useState(() => !!tgtDraft); // a kept target draft reopens its sheet
  const [tgtFormOpen, setTgtFormOpen] = useState(false); // empty target stays a compact card until tapped
  const [tgtWeight, setTgtWeight] = useState(() => (tgtDraft && tgtDraft.weight) || '');     // display units
  const [tgtBF, setTgtBF] = useState(() => (tgtDraft && tgtDraft.bf) || '');             // %
  const [tgtDate, setTgtDate] = useState(() => (tgtDraft && tgtDraft.date) || null);       // ISO 'YYYY-MM-DD' | null
  const [showTgtDatePicker, setShowTgtDatePicker] = useState(false);
  // Backfill a past weigh-in (seeds the measured rate sooner).
  const [bfOpen, setBfOpen] = useState(() => !!(bfDraft && bfDraft.open));
  const [bfDate, setBfDate] = useState(() => (bfDraft && bfDraft.date) || todayISO());
  const [bfWeight, setBfWeight] = useState(() => (bfDraft && bfDraft.weight) || '');
  const [bfBodyFat, setBfBodyFat] = useState(() => (bfDraft && bfDraft.bf) || '');
  const [showBfDatePicker, setShowBfDatePicker] = useState(false);
  const [bfMsg, setBfMsg] = useState(false);

  const loadedRef = useRef(false);
  const userIdRef = useRef(null);
  const migratedRef = useRef(false); // legacy metadata->table migration ran this session

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setPremium(await hasPremium());
    const user = await getCachedUser();
    const uid = user?.id || null;
    // Free users get the reality check (and food log) for 7 days too (FL-41).
    try { setRcFree(!!(await loadFoodAccess(uid)).access.canLog); } catch { setRcFree(false); }
    // Set EVERY load (not only the first) so a save can never no-op because the
    // session wasn't ready on the first focus.
    if (uid) userIdRef.current = uid;

    // Food log rows (feed the reality-check intake over the check window).
    // Re-read each focus so newly-logged meals — catch-ups included — move it.
    try {
      if (uid) {
        const since = new Date(); since.setDate(since.getDate() - 366);
        setFoodRows(getFoodLogsSince(uid, localISO(since)) || []);
      }
    } catch { /* ignore */ }

    // One-time-per-ACCOUNT migration of legacy user_metadata history into the
    // synced tables. Gated on a DURABLE per-account flag (calc_history_migrated_v55),
    // NOT table-emptiness — so a user who CLEARS their log is never re-imported, and
    // a second device never double-migrates (which would inject duplicate cloud
    // rows). Metadata arrays are LEFT as a backup for a later cleanup build. Runs at
    // most once per session (migratedRef).
    if (uid && !migratedRef.current) {
      migratedRef.current = true;
      // FAIL OPEN: a throw here (e.g. a malformed legacy entry) must never block
      // render or crash the 53->55 upgrade launch. Two gates: a DURABLE LOCAL flag
      // (AsyncStorage — persists even offline, so a clear-then-relaunch on this
      // device is never re-migrated → no resurrection) AND the cloud flag (so no
      // second device repeats the migration). Migration runs only if NEITHER is set;
      // both are then reconciled so it never re-runs.
      try {
        const localDone = !!(await AsyncStorage.getItem(MIGRATED_KEY).catch(() => null));
        const cloudDone = !!user?.user_metadata?.calc_history_migrated_v55;
        if (!localDone && !cloudDone) {
          const metaChecks = user?.user_metadata?.calc_reality_checks;
          const metaSnaps = user?.user_metadata?.calc_snapshots;
          if (Array.isArray(metaChecks)) for (const c of metaChecks) if (c && c.date) upsertRealityCheck(uid, { entry_date: c.date, tdee: c.tdee ?? null, rate_per_week_kg: c.ratePerWeekKg ?? null });
          if (Array.isArray(metaSnaps)) for (const sn of metaSnaps) if (sn && sn.date) upsertCalcSnapshot(uid, { entry_date: sn.date, weight_kg: sn.weightKg ?? null, waist_cm: sn.waistCm ?? null, body_fat_pct: sn.bodyFatPct ?? null, lbm: sn.lbm ?? null, bmr: sn.bmr ?? null, tdee: sn.tdee ?? null });
          requestSync?.();
          await AsyncStorage.setItem(MIGRATED_KEY, '1').catch(() => {}); // durable, offline-safe — closes the resurrection hole
          supabase.auth.updateUser({ data: { calc_history_migrated_v55: true } }).catch(() => {}); // cross-device (eventual)
        } else {
          // Already migrated somewhere — make both gates agree so it never re-runs.
          if (!localDone) await AsyncStorage.setItem(MIGRATED_KEY, '1').catch(() => {});
          if (!cloudDone) supabase.auth.updateUser({ data: { calc_history_migrated_v55: true } }).catch(() => {});
        }
      } catch { /* fail open — retry next launch */ }
    }

    // Read history from the synced tables EVERY focus, so rows pulled by sync (or
    // just saved) show up without needing a remount.
    if (uid) {
      setRealityLog(getRealityChecks(uid).map(rcRowToUI));
      setSnapshots(getCalcSnapshots(uid).map(snapRowToUI));
      setTarget(getCalcTarget(uid));
    }

    // S-04 / FX-10: the PROFILE is the only source for sex and age — applied on every
    // focus so a change in Settings reaches the BMR; saved calculator values are used
    // only while the profile has none.
    {
      const savedForBody = await getCalcInputs().catch(() => null);
      const body = profileBodyInputs({ meta: user?.user_metadata, saved: savedForBody, now: new Date() });
      setSex(body.sex);
      setProfileSex(body.profileSex);
      setAgeFromProfile(body.ageFromProfile);
      if (body.ageFromProfile || !loadedRef.current) setAge(body.age);
    }
    if (loadedRef.current) return;
    // ── one-time seeding (open weigh-in + profile defaults + saved calc inputs) ──
    // Cloud-backed (survives a wipe / re-auth); restores from user_metadata if the
    // local cache was cleared. See lib/realityCheck.js.
    const rcs = await getRealityStart();
    if (rcs) setRcStart(rcs);
    // Synced calc_inputs table (S-03); the old metadata only before migration.
    const saved = await getCalcInputs().catch(() => null);
    if (saved && typeof saved === 'object') {
      if (saved.unit) setUnit(saved.unit);
      if (saved.weight != null) setWeight(String(saved.weight));
      if (saved.bfSource) setBfSource(saved.bfSource);
      if (saved.bodyFat != null) setBodyFat(String(saved.bodyFat));
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

  // Persist inputs (debounced, fire-and-forget) once initial load is done. A value typed
  // less than 0.9 s before the screen goes away (back, or a fold / unfold moving it) is
  // flushed on unmount and in the screen's beforeLeave, never dropped (S-26 BK-10).
  const inputsSave = useRef(null);
  if (!inputsSave.current) inputsSave.current = createDebouncedSave((payload) => saveCalcInputs(payload).then(calcChanged), 900); // synced table + user_metadata mirror
  useEffect(() => {
    if (!loadedRef.current) return;
    inputsSave.current.schedule({ unit, weight, bfSource, bodyFat, sex, age, height, activity, goal, waist });
  }, [unit, weight, bfSource, bodyFat, sex, age, height, activity, goal, waist]);
  useEffect(() => () => inputsSave.current.flush(), []);
  if (flushRef) flushRef.current = () => inputsSave.current.flush();

  // S-26 BK-19: every saved calculator change is announced, so a screen showing these numbers
  // next to this one (the Journey tiles beside the Progress page, Today's alerts) refreshes
  // right away instead of on its next focus.
  function calcChanged() { notifyDataChanged('calc'); }

  // BK-14 / A-77: the unsaved form text follows every keystroke into lib/draftStore (memory
  // only). A save or a discard empties the fields or ends the sheet, which clears the draft.
  useEffect(() => {
    keepDraft('progress:rcWeigh', { then: rcThen, now: rcNow, startDate: rcStartDate, thenAuto: rcThenAuto.current });
  }, [rcThen, rcNow, rcStartDate]);
  useEffect(() => {
    keepDraft('progress:rcIntake', rcIntake);
  }, [rcIntake]);
  useEffect(() => {
    // The target sheet discards on Cancel today (it reseeds from the saved target), so its
    // draft lives only while the sheet is open.
    if (targetEditing) setDraft('progress:target', { weight: tgtWeight, bf: tgtBF, date: tgtDate });
    else clearDraft('progress:target');
  }, [targetEditing, tgtWeight, tgtBF, tgtDate]);
  useEffect(() => {
    // The past weigh-in sheet keeps its fields when closed (as today); a day other than today
    // counts as typed, today does not.
    const typed = bfWeight || bfBodyFat || bfDate !== todayISO();
    keepDraft('progress:pastWeighIn', typed ? { date: bfDate, weight: bfWeight, bf: bfBodyFat, open: bfOpen } : null);
  }, [bfOpen, bfDate, bfWeight, bfBodyFat]);

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
  async function saveSnapshot() {
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
    // One row per day (latest wins) in the synced calc_snapshots table — an
    // upsert, never a whole-array rewrite, so history can't be truncated.
    const uid = userIdRef.current;
    if (!uid) return; // no session yet — don't show a "saved" toast for a no-op
    upsertCalcSnapshot(uid, { entry_date: snap.date, weight_kg: snap.weightKg ?? null, waist_cm: snap.waistCm ?? null, body_fat_pct: snap.bodyFatPct ?? null, lbm: snap.lbm ?? null, bmr: snap.bmr ?? null, tdee: snap.tdee ?? null });
    requestSync?.();
    setSnapshots(getCalcSnapshots(uid).map(snapRowToUI));
    calcChanged();
    setSnapMsg(true);
    setTimeout(() => setSnapMsg(false), 2500);
  }

  // ── Target handlers (build 56) ───────────────────────────────────
  // Seed the edit form from the saved target (in display units) or blank.
  function beginEditTarget() {
    if (target) {
      setTgtWeight(target.target_weight_kg != null ? String(Math.round(toDisplayW(target.target_weight_kg) * 10) / 10) : '');
      setTgtBF(target.target_body_fat_pct != null ? String(target.target_body_fat_pct) : '');
      setTgtDate(target.target_date || null);
    } else {
      setTgtWeight(''); setTgtBF(''); setTgtDate(null);
    }
    setTargetEditing(true);
  }

  // Persist the target in CANONICAL units (kg, %). start_* is captured once (the
  // value when first set) and kept on later edits — it anchors progress and the
  // goal direction, so an overshoot reads as "reached", not "moving away".
  function saveTarget() {
    const uid = userIdRef.current;
    if (!uid) return;
    const tw = num(tgtWeight);
    const tb = num(tgtBF);
    const targetWeightKg = tw == null ? null : (unit === 'imperial' ? lbToKg(tw) : tw);
    if (targetWeightKg == null && tb == null) { setTargetEditing(false); return; }
    const startW = target?.start_weight_kg != null ? target.start_weight_kg : currentWeightKg;
    const startB = target?.start_body_fat_pct != null ? target.start_body_fat_pct : currentBF;
    upsertCalcTarget(uid, {
      entry_date: target?.entry_date || todayISO(),
      target_weight_kg: targetWeightKg,
      target_body_fat_pct: tb,
      target_date: tgtDate || null,
      start_date: target?.start_date || todayISO(),
      start_weight_kg: startW ?? null,
      start_body_fat_pct: startB ?? null,
    });
    requestSync?.();
    setTarget(getCalcTarget(uid));
    calcChanged();
    setTargetEditing(false);
    setTgtFormOpen(false);
  }

  function clearTargetConfirm() {
    Alert.alert(t('cal_tgt_clear_title'), t('cal_tgt_clear_body'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('cal_tgt_clear_confirm'), style: 'destructive', onPress: () => {
        const uid = userIdRef.current; if (!uid) return;
        clearCalcTarget(uid); requestSync?.(); calcChanged();
        setTarget(null); setTargetEditing(false); setTgtFormOpen(false);
      } },
    ]);
  }

  // Backfill a past weigh-in → a dated snapshot (weight + optional BF). Merges
  // with any existing snapshot for that date so waist/derived fields are never
  // wiped (the "never lose user data" rule). This seeds the measured rate sooner.
  function saveBackfillWeighIn() {
    const uid = userIdRef.current;
    if (!uid) return;
    const w = num(bfWeight);
    if (w == null || !bfDate) return;
    const weightKg = unit === 'imperial' ? lbToKg(w) : w;
    const bfv = num(bfBodyFat);
    // Merge against a FRESH DB read, not React state — a stale/empty in-memory
    // snapshots array would null out an existing same-date snapshot's other fields.
    const existing = getCalcSnapshots(uid).find(sn => sn.entry_date === bfDate) || null;
    upsertCalcSnapshot(uid, mergeWeighIn(existing, { date: bfDate, weightKg, bodyFatPct: bfv }));
    requestSync?.();
    setSnapshots(getCalcSnapshots(uid).map(snapRowToUI));
    calcChanged();
    setBfWeight(''); setBfBodyFat(''); setBfDate(todayISO());
    setBfMsg(true); setTimeout(() => setBfMsg(false), 2500);
  }

  // The weigh-in of a reality check that is already running, for a user whose free
  // days ended (FX-15: weigh-ins are never paywalled; only the result is). Saved as
  // today's snapshot, merged so nothing logged earlier that day is lost.
  function saveRcWeighIn() {
    const uid = userIdRef.current;
    if (!uid) return;
    const w = num(rcNow);
    if (w == null) return;
    const weightKg = unit === 'imperial' ? lbToKg(w) : w;
    const date = todayISO();
    const existing = getCalcSnapshots(uid).find(sn => sn.entry_date === date) || null;
    upsertCalcSnapshot(uid, mergeWeighIn(existing, { date, weightKg }));
    requestSync?.();
    setSnapshots(getCalcSnapshots(uid).map(snapRowToUI));
    clearDraft('progress:rcWeigh');
    calcChanged();
    setRcWeighMsg(true); setTimeout(() => setRcWeighMsg(false), 2500);
  }

  // ETA weeks → { weeks, when } where `when` is the projected finish month.
  function fmtEta(weeks) {
    if (weeks == null || !Number.isFinite(weeks)) return null;
    const w = Math.max(1, Math.round(weeks));
    const done = new Date(); done.setDate(done.getDate() + w * 7);
    const sameYear = done.getFullYear() === new Date().getFullYear();
    const when = done.toLocaleDateString(locale, { month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
    return { weeks: w, when };
  }

  const chartSeries = useMemo(() => {
    const toW = kg => unit === 'imperial' ? kgToLb(kg) : kg;
    const toL = cm => unit === 'imperial' ? cmToIn(cm) : cm;
    const weightPts = snapshots.filter(x => x.weightKg != null).map(x => ({ date: x.date, value: toW(x.weightKg) }));
    const waistPts = snapshots.filter(x => x.waistCm != null).map(x => ({ date: x.date, value: toL(x.waistCm) }));
    return [
      { key: 'weight', label: t('cal_snap_weight'), color: colors.data, unit: wUnit, points: weightPts },
      { key: 'waist', label: t('cal_snap_waist'), color: colors.ink2, unit: hUnit, points: waistPts },
    ].filter(sr => sr.points.length > 0);
  }, [snapshots, unit, colors]);

  const snapPointCount = chartSeries.reduce((n, sr) => Math.max(n, sr.points.length), 0);

  // ── Target projection (build 56) ─────────────────────────────────
  // Latest measured value per metric (most recent weigh-in; falls back to the
  // current calculator input so a brand-new user still sees current-vs-target).
  const latestSnap = useMemo(() => {
    if (!snapshots.length) return null;
    return [...snapshots].sort((a, b) => (a.date < b.date ? -1 : 1))[snapshots.length - 1];
  }, [snapshots]);
  const currentWeightKg = latestSnap?.weightKg != null ? latestSnap.weightKg : metric.weightKg;
  const currentBF = latestSnap?.bodyFatPct != null ? latestSnap.bodyFatPct : (isUnknown ? null : num(bodyFat));

  // Measured weekly rate for each metric, from the dated weigh-in series (so a
  // backfilled past weigh-in counts). Weight is canonical kg; BF is %.
  const weightRate = useMemo(
    () => seriesRatePerWeek(snapshots.filter(x => x.weightKg != null).map(x => ({ date: x.date, value: x.weightKg }))),
    [snapshots]
  );
  const bfRate = useMemo(
    () => seriesRatePerWeek(snapshots.filter(x => x.bodyFatPct != null).map(x => ({ date: x.date, value: x.bodyFatPct }))),
    [snapshots]
  );

  // Only feed a rate to the projection when the weigh-in series spans a real
  // window (>= 14 days) — a 2-day series is noise and would render a confident,
  // wrong ETA (pharmacometrics finding). Below that the projection returns
  // 'no_rate' and the UI shows progress only.
  const usableWeightRate = (weightRate && weightRate.days >= TARGET_MIN_WINDOW_DAYS) ? weightRate : null;
  const usableBfRate = (bfRate && bfRate.days >= TARGET_MIN_WINDOW_DAYS) ? bfRate : null;
  const weightProj = useMemo(() => {
    if (!target || target.target_weight_kg == null) return null;
    return targetProjection({
      current: currentWeightKg, target: target.target_weight_kg, start: target.start_weight_kg,
      ratePerWeek: usableWeightRate?.ratePerWeek ?? null, kind: 'weight',
    });
  }, [target, currentWeightKg, usableWeightRate]);
  const bfProj = useMemo(() => {
    if (!target || target.target_body_fat_pct == null) return null;
    return targetProjection({
      current: currentBF, target: target.target_body_fat_pct, start: target.start_body_fat_pct,
      ratePerWeek: usableBfRate?.ratePerWeek ?? null, kind: 'bodyfat',
    });
  }, [target, currentBF, usableBfRate]);

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

  // ── Reality check (Premium, or a free user's 7 free days — FL-41) ──
  const rcAllowed = premium || rcFree;
  const rcAccess = realityCheckAccess({ premium, rcFree, hasOpenCheck: !!rcStart });
  // Auto days-between the two weigh-ins; null until phase 2.
  const rcElapsedDays = rcStart ? daysBetween(rcStart.date, todayISO()) : null;
  // Intake across THIS check (founder: the check window matters, not day by day):
  // everything logged from the start date through today ÷ the same elapsed days
  // the TDEE uses. Offered tap-to-use with its working shown; never auto-filled.
  // FL-3: only a run of 7+ consecutive complete days is offered; until then, progress.
  const foodRun = useMemo(
    () => (rcStart ? intakeRun(foodRows, String(rcStart.date).slice(0, 10), todayISO()) : null),
    [foodRows, rcStart],
  );
  const foodIntake = foodRun && foodRun.ok ? foodRun : null;
  // The date the day-21 reminder is set for (display only).
  const rcRemindOn = useMemo(() => {
    if (!rcStart) return null;
    const d = new Date(rcStart.date + 'T12:00:00');
    d.setDate(d.getDate() + REALITY_CHECK_DAYS);
    return localISO(d);
  }, [rcStart]);

  // Phase 1 — log the starting weight (today, or a weigh-in up to 7 days back) and
  // arm the +21-day reminder.
  function shiftRcStartDate(delta) {
    const next = stepStartDate(rcStartDate || todayISO(), delta, todayISO());
    setRcStartDate(next === todayISO() ? null : next);
    // A weigh-in saved on that day fills the start weight — only an empty field or
    // our own earlier prefill; a weight the user typed is never overwritten.
    const w = weighInOn(snapshots, next);
    const snap = w == null ? null : Math.round((unit === 'imperial' ? kgToLb(w) : w) * 10) / 10;
    const v = prefillStartWeight(rcThen, rcThenAuto.current, snap);
    if (v != null) { setRcThen(v); rcThenAuto.current = v || null; }
  }
  // The start can be a past weigh-in, at most 7 days back (FL-44, founder
  // 2026-09-27) — validated again here, never further back, never in the future.
  async function startRealityCheck() {
    const kg = num(rcThen) == null ? null : (unit === 'imperial' ? lbToKg(num(rcThen)) : num(rcThen));
    if (kg == null) return;
    const date = rcStartDate && validStartDate(rcStartDate, todayISO()) ? rcStartDate : todayISO();
    // Free days count from the day of this TAP, never the backdated start (FL-41 × FL-44).
    ensureFreeStart(userIdRef.current);
    const start = { date, weightKg: kg };
    setRcStart(start);
    setRcThen('');
    setRcStartDate(null);
    rcThenAuto.current = null;
    setRc(null);
    await setRealityStart(start);
    calcChanged();
    syncRealityCheckReminder().catch(() => {});
    syncFoodLogReminder().catch(() => {});
  }

  // Clear the open check-in and cancel its reminder (back to phase 1).
  async function resetRealityCheck() {
    setRcStart(null);
    setRcNow('');
    setRc(null);
    await clearRealityStart();
    calcChanged();
    syncRealityCheckReminder().catch(() => {});
    syncFoodLogReminder().catch(() => {});
  }

  // Stop the reality check entirely (founder-requested, one easy-to-reach button):
  // confirm, then clear the open check-in AND the saved numbers, and cancel both
  // the weigh-in reminder and the daily food-log reminder. Logged meals are KEPT.
  function stopRealityCheck() {
    Alert.alert(t('cal_rc_stop_title'), t('cal_rc_stop_body'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('cal_rc_stop_confirm'), style: 'destructive', onPress: async () => {
          setRcStart(null); setRcNow(''); setRc(null); setRealityLog([]);
          await clearRealityStart();
          if (userIdRef.current) { clearRealityChecks(userIdRef.current); requestSync?.(); }
          calcChanged();
          syncRealityCheckReminder().catch(() => {});
          syncFoodLogReminder().catch(() => {});
        },
      },
    ]);
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
  async function saveRealityCheck() {
    if (!rc || rc.status !== 'ok') return;
    const entry = { date: todayISO(), tdee: Math.round(rc.tdee), ratePerWeekKg: rc.ratePerWeekKg };
    // Upsert one row per date in the synced reality_checks table (no array rewrite).
    const uid = userIdRef.current;
    if (!uid) return; // no session yet — don't show a "saved" toast for a no-op
    upsertRealityCheck(uid, { entry_date: entry.date, tdee: entry.tdee ?? null, rate_per_week_kg: entry.ratePerWeekKg ?? null });
    requestSync?.();
    setRealityLog(getRealityChecks(uid).map(rcRowToUI));
    clearDraft('progress:rcWeigh'); clearDraft('progress:rcIntake');
    calcChanged();
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
    await setRealityStart(start);
    calcChanged();
    syncRealityCheckReminder().catch(() => {});
    syncFoodLogReminder().catch(() => {});
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

  // Goal targets: when a reality-check MEASURED maintenance exists, recompute the
  // lose/maintain/gain calories off it through the SAME floored engine (not a raw
  // ratio scale) so the calorie/BMR safety floor still applies on the measured
  // path — else scaling lose by measured/formula can silently dip below 1200.
  const effectiveGoals = useMemo(() => {
    if (!plan) return null;
    if (scoreCheck && plan.tdeeVal) return goalsForTdee(scoreCheck.tdee, { bmr: plan.bmr, sex });
    return plan.allGoals;
  }, [plan, scoreCheck, sex]);

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

  // "Your numbers" auto-collapses once there is a plan (the user can still open it);
  // collapsed, it shows a one-line summary of the inputs (activity included) + Edit.
  const numbersOpenEff = numbersOpen == null ? !plan : numbersOpen;
  const youNowSummary = useMemo(() => {
    const act = ACTIVITY_LEVELS.find(a => a.value === activity);
    return [...echoParts.filter(p => !String(p).startsWith('×')), act ? t(act.key) : null].filter(Boolean).join(' · ');
  }, [echoParts, activity, language]);

  const toDisplayW = kg => (unit === 'imperial' ? kgToLb(kg) : kg);

  // Display helpers (Graduated): weights to one decimal in the display unit.
  const fmtW = kg => (kg == null ? null : (Math.round(toDisplayW(kg) * 10) / 10).toFixed(1));
  const sortedSnaps = [...snapshots].sort((a, b) => (a.date < b.date ? -1 : 1));
  const lastSnap = sortedSnaps.length ? sortedSnaps[sortedSnaps.length - 1] : null;
  const histRows = [...sortedSnaps].reverse().slice(0, 5); // newest five; the chart holds them all
  const tgtValid = num(tgtWeight) != null || num(tgtBF) != null;
  const tgtLow = (() => {
    const tw = num(tgtWeight);
    if (tw == null || !plan?.healthyRange) return false;
    return (unit === 'imperial' ? lbToKg(tw) : tw) < plan.healthyRange.min;
  })();
  const closeTarget = () => { setTargetEditing(false); setTgtFormOpen(false); setShowTgtDatePicker(false); };
  const closeBackfill = () => { setBfOpen(false); setShowBfDatePicker(false); };
  const rcExpandable = rcAllowed || !!rcStart || realityLog.length > 0;
  const atEarliest = (rcStartDate || todayISO()) <= earliestStart(todayISO());
  const healthyText = key => t(key)
    .replace('{min}', String(Math.round(toDisplayW(plan.healthyRange.min))))
    .replace('{max}', String(Math.round(toDisplayW(plan.healthyRange.max))))
    .replace('{unit}', wUnit);

  // One metric row of the target: current → target, the graduated scale, and a
  // direction-aware status (ETA / reached / moving away / no rate yet). All
  // display math; never advisory. `showEta` (premium) gates the MEASURED timeline;
  // free users still see the goal, the scale, and the "reached"/below-range facts,
  // plus a locked teaser pointing at the paid measured pace.
  const renderTargetMetric = (kind, proj, curCanon, targetCanon, rateInfo, showEta) => {
    const isW = kind === 'weight';
    const unitLabel = isW ? wUnit : '%';
    const disp = v => v == null ? null : (isW ? Math.round(toDisplayW(v) * 10) / 10 : Math.round(v * 10) / 10);
    const cur = disp(curCanon);
    const tgt = disp(targetCanon);
    const startCanon = isW ? target.start_weight_kg : target.start_body_fat_pct;
    let frac = null;
    if (startCanon != null && curCanon != null && targetCanon != null && startCanon !== targetCanon) {
      frac = Math.max(0, Math.min(1, (startCanon - curCanon) / (startCanon - targetCanon)));
    }
    // Below-healthy-range guard (weight only): a factual note, and NO celebratory
    // ETA toward a below-range weight (App Store 1.4 / eating-disorder exposure).
    const belowRange = isW && plan?.healthyRange && targetCanon != null && targetCanon < plan.healthyRange.min;
    const eta = proj.state === 'eta' ? fmtEta(proj.etaWeeks) : null;
    return (
      <View style={s.tgtMetric} key={kind}>
        <View style={s.rowBetween}>
          <Text style={s.sec2}>{isW ? t('cal_snap_weight') : t('cal_snap_bodyfat')}</Text>
          <Text style={s.val15}>{cur ?? '—'} → {tgt ?? '—'} {unitLabel}</Text>
        </View>
        {frac != null ? (
          <View>
            <TargetScale frac={frac} colors={colors} />
            <View style={s.rowBetween}>
              <Text style={s.scaleLab}>{disp(startCanon)}</Text>
              <Text style={[s.scaleLab, s.scaleLabEnd]}>{tgt}</Text>
            </View>
          </View>
        ) : null}
        {/* reached is a pure current-vs-target fact — free. */}
        {proj.state === 'reached' ? (
          <Text style={s.body}>{t('cal_tgt_reached')}</Text>
        ) : belowRange ? null /* status line suppressed; the range note below carries it */
        : showEta ? (
          proj.state === 'eta' && eta ? (
            <Text style={s.body}>{t('cal_tgt_eta').replace('{weeks}', String(eta.weeks)).replace('{when}', eta.when)}</Text>
          ) : proj.state === 'away' ? (
            <Text style={s.body}>{t('cal_tgt_away')}</Text>
          ) : (
            <Text style={s.sec2}>{t('cal_tgt_no_rate')}</Text>
          )
        ) : (
          // Free: no measured pace — teaser to Premium.
          <TouchableOpacity onPress={() => navigation.navigate('Paywall')} activeOpacity={0.7} accessibilityRole="button">
            <Text style={s.linkU}>{t('cal_tgt_locked_eta')}</Text>
          </TouchableOpacity>
        )}
        {showEta && !belowRange && proj.state === 'eta' && rateInfo ? (
          <Text style={s.foot2}>{t('cal_tgt_basis').replace('{from}', fmtDate(rateInfo.firstDate)).replace('{to}', fmtDate(rateInfo.lastDate))}</Text>
        ) : null}
        {belowRange ? (
          <Text style={s.tnote}>{healthyText('cal_tgt_below_range')}</Text>
        ) : isW && plan?.healthyRange ? (
          <Text style={s.foot2}>{healthyText('cal_tgt_healthy')}</Text>
        ) : null}
      </View>
    );
  };

  // Your target — a weight and/or body-fat goal. Setting a goal + the scale are
  // FREE (matches the free-targets split); the MEASURED timeline is the Premium
  // unlock. Never advisory. Inside the hero once there is a plan; its own card before.
  const renderTargetBlock = (inHero) => {
    if (!target && !inHero) {
      return (
        <>
          <Text style={s.title}>{t('cal_tgt_title')}</Text>
          <Text style={s.sec2}>{t('cal_tgt_sub')}</Text>
          <TouchableOpacity style={s.btnO} onPress={beginEditTarget} activeOpacity={0.75} accessibilityRole="button">
            <Text style={s.btnOText}>{t('hy_set_target')}</Text>
          </TouchableOpacity>
        </>
      );
    }
    return (
      <View style={s.tgtBlock}>
        <View style={s.rowC}>
          <Text style={[inHero ? s.head : s.title, s.grow]}>{t('cal_tgt_title')}</Text>
          <TouchableOpacity onPress={beginEditTarget} activeOpacity={0.7} style={s.linkHit} accessibilityRole="button">
            <Text style={s.linkU}>{target ? t('cal_tgt_edit') : t('hy_set_target')}</Text>
          </TouchableOpacity>
        </View>
        {target && weightProj ? renderTargetMetric('weight', weightProj, currentWeightKg, target.target_weight_kg, usableWeightRate, premium) : null}
        {target && bfProj ? renderTargetMetric('bodyfat', bfProj, currentBF, target.target_body_fat_pct, usableBfRate, premium) : null}
      </View>
    );
  };

  // ── Sections (Graduated, docs/design/prototype.html progressScreen) ──
  // Hero: weight + daily burn (Estimated / Measured), the since-line, and the target.
  // Once a reality-check exists, the MEASURED maintenance is the real daily burn (the
  // formula under/over-shoots); the generic estimate drops to the source line.
  const heroEl = plan ? (
    <View key="hero" style={s.card}>
      <View style={s.heroPair}>
        <View style={[s.heroCol, fontScale >= 1.3 && s.heroColStack]}>
          <Text style={s.foot2}>{t('cal_weight')}</Text>
          <Text style={s.display} numberOfLines={1} adjustsFontSizeToFit>
            {fmtW(currentWeightKg) ?? '—'}<Text style={s.unit}> {wUnit}</Text>
          </Text>
        </View>
        <View style={[s.heroCol, fontScale >= 1.3 && s.heroColStack]}>
          <Text style={s.foot2}>{t('cal_tdee')}</Text>
          <Text style={s.display} numberOfLines={1} adjustsFontSizeToFit>
            {round10(scoreCheck ? scoreCheck.tdee : plan.tdeeVal)}<Text style={s.unit}> {t('cal_kcal')}</Text>
          </Text>
          <View style={[s.chip, scoreCheck && s.chipMeas]}>
            <Text style={[s.chipText, scoreCheck && s.chipMeasText]}>{scoreCheck ? t('hy_rc_measured_chip') : t('hy_estimated')}</Text>
          </View>
        </View>
      </View>
      {progressSummary ? (
        <Text style={s.sec2}>
          {t('cal_since')} {fmtDate(progressSummary.firstDate)}: {t('cal_snap_weight')} <Text style={s.mono}>{progressSummary.wDelta != null ? `${signed(progressSummary.wDelta)} ${wUnit}` : '—'}</Text>
          {progressSummary.waistDelta != null ? <>{'  ·  '}{t('cal_snap_waist')} <Text style={s.mono}>{signed(progressSummary.waistDelta)} {hUnit}</Text></> : null}
        </Text>
      ) : null}
      <Text style={s.foot2}>
        {scoreCheck
          ? `${t('cal_measured_from_check')} · ${t('cal_est')} ${round10(plan.tdeeVal)}`
          : `${t(`cal_eq_${plan.method}`)} · ${t('cal_bmr')} ${round10(plan.bmr)}`}
      </Text>
      <View style={s.sep} />
      {renderTargetBlock(true)}
    </View>
  ) : null;

  // Your daily plan: all three goals side by side (tap to choose), protein, context.
  // When a reality-check exists the goals are recomputed off the MEASURED maintenance
  // through the floored engine (effectiveGoals), so the calorie floor still holds.
  const planEl = plan ? (
    <View key="plan" style={s.card}>
      <View style={s.gap2}>
        <Text style={s.title}>{t('hy_daily_plan')}</Text>
        {/* Echo the inputs the math used — a wrong/stale input shows right here. */}
        <Text style={s.foot2} numberOfLines={2}>{echoParts.join(' · ')}</Text>
      </View>
      <View style={s.goals}>
        {['lose', 'maintain', 'gain'].map(g => {
          const on = goal === g;
          const gc = (effectiveGoals || plan.allGoals)[g];
          return (
            <TouchableOpacity key={g} style={[s.goal, on && s.goalOn]} onPress={() => setGoal(g)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ selected: on }}>
              <Text style={[s.cap2, on && s.inkText]}>{t(`cal_goal_${g}`)}</Text>
              <Text style={s.val}>{round10(gc.mid)}</Text>
              <Text style={s.cap2}>{g === 'lose' ? '−15–20%' : g === 'gain' ? '+10–15%' : t('cal_tdee')}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {/* Re-emit the calorie-floor warning if the MEASURED-path lose target hit
          the floor (the formula-path warning is already in plan.warnings). */}
      {scoreCheck && effectiveGoals?.lose?.floorApplied ? (
        <View style={s.warnbox}><Text style={s.warnText}>{warnText({ code: effectiveGoals.lose.floorSource === 'absolute' ? 'calorie_floor' : 'bmr_floor', values: { kcal: Math.round(effectiveGoals.lose.mid) } })}</Text></View>
      ) : null}
      <View style={s.cell}>
        <Text style={s.cap2}>{t('cal_protein')}</Text>
        <Text style={s.val}>{round5(plan.protein.rec)} {t('cal_g_day')}</Text>
        <Text style={s.foot2}>{round5(plan.protein.low)}–{round5(plan.protein.high)} · {t(`cal_protein_basis_${plan.protein.basis}${unit === 'imperial' ? '_imp' : ''}`)}</Text>
      </View>
      {/* Context chips — BMI + macros */}
      <View style={s.chips}>
        {plan.bmi != null && plan.healthyRange && (
          <View style={s.chipBox}><Text style={s.cap2}>{t('cal_bmi')} {(Math.round(plan.bmi * 10) / 10).toFixed(1)} · {t('cal_healthy_range')} {Math.round(toDisplayW(plan.healthyRange.min))}–{Math.round(toDisplayW(plan.healthyRange.max))} {wUnit}</Text></View>
        )}
        {plan.macros && (
          <View style={s.chipBox}><Text style={s.cap2}>{t('cal_fat_g')} ≈ {round5(plan.macros.fatG)} g · {t('cal_carbs_g')} ≈ {round5(plan.macros.carbsG)} g</Text></View>
        )}
      </View>
      {/* Safety notes from the engine */}
      {plan.warnings.map(w => {
        const txt = warnText(w);
        return txt ? <View key={w.code} style={s.warnbox}><Text style={s.warnText}>{txt}</Text></View> : null;
      })}
      <TouchableOpacity
        onPress={() => setIntroOpen(v => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: introOpen }}
        style={s.foldRow}
        activeOpacity={0.7}
      >
        <Text style={[s.sec, s.grow]}>{t('cal_intro_title')}</Text>
        <Chev dir={introOpen ? 'up' : 'down'} color={colors.ink3} />
      </TouchableOpacity>
      {introOpen && <Text style={s.sec2}>{t('cal_intro_body')}</Text>}
      <Text style={s.foot2}>{t('cal_estimate_note')}</Text>
    </View>
  ) : null;

  // Before there are results the intro explains what to do, so it leads.
  const introEl = !plan ? (
    <View key="intro" style={s.card}>
      <Text style={s.head}>{t('cal_intro_title')}</Text>
      <Text style={s.sec2}>{t('cal_intro_body')}</Text>
    </View>
  ) : null;

  // No plan yet: why (sex not set / an input out of range / not enough inputs).
  const statusEl = !plan ? (
    <View key="status" style={s.card}>
      {result && result.sexGated ? (
        <>
          <Text style={s.head}>{t('cal_sex_gate_title')}</Text>
          <Text style={s.sec2}>{t('cal_sex_gate_body')}</Text>
          <TouchableOpacity style={s.btnP} onPress={promptProfileSex} accessibilityRole="button">
            <Text style={s.btnPText}>{t('cal_sex_gate_btn')}</Text>
          </TouchableOpacity>
        </>
      ) : result && result.invalid ? (
        <View style={s.warnbox}><Text style={s.warnText}>{t('cal_check_inputs')}</Text></View>
      ) : (
        <Text style={s.sec2}>{t('cal_need_inputs')}</Text>
      )}
    </View>
  ) : null;

  const targetEl = !plan ? (
    <View key="target" style={s.card}>
      {renderTargetBlock(false)}
    </View>
  ) : null;

  // Your numbers — auto-collapses once there is a plan (the user can still open it);
  // collapsed, it shows a one-line summary of the inputs (activity included).
  const numbersEl = (
    <View key="numbers" style={s.card}>
      <TouchableOpacity style={s.foldHead} activeOpacity={0.7} onPress={() => setNumbersOpen(!numbersOpenEff)} accessibilityRole="button" accessibilityState={{ expanded: numbersOpenEff }}>
        <View style={[s.grow, s.gap2]}>
          <Text style={s.title}>{t('cal_your_numbers')}</Text>
          {!numbersOpenEff && youNowSummary ? <Text style={s.foot2} numberOfLines={2}>{youNowSummary}</Text> : null}
        </View>
        <Chev dir={numbersOpenEff ? 'up' : 'down'} color={colors.ink3} />
      </TouchableOpacity>
      {numbersOpenEff && (
        <>
          <SegmentedBar
            items={[{ key: 'metric', label: t('cal_metric') }, { key: 'imperial', label: t('cal_imperial') }]}
            value={unit}
            onChange={changeUnit}
          />
          {/* Weight + body fat (or age, on the height/age/sex path) */}
          <View style={s.fieldRow}>
            <View style={s.fldHalf}>
              <Text style={s.fieldLab}>{t('cal_weight')} ({wUnit})</Text>
              <TextInput style={s.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.ink3} />
            </View>
            {!isUnknown ? (
              <View style={s.fldHalf}>
                <Text style={s.fieldLab}>{t('cal_bodyfat')} (%)</Text>
                <TextInput style={s.input} value={bodyFat} onChangeText={setBodyFat} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.ink3} />
              </View>
            ) : (
              <View style={s.fldHalf}>
                <Text style={s.fieldLab}>{t('cal_age')}</Text>
                <TextInput style={[s.input, ageFromProfile && s.inputLocked]} value={age} onChangeText={setAge} editable={!ageFromProfile} keyboardType="number-pad" placeholder="—" placeholderTextColor={colors.ink3} />
              </View>
            )}
          </View>
          {isUnknown ? (
            <View style={s.fld}>
              <Text style={s.fieldLab}>{t('cal_sex')}</Text>
              {profileSex ? (
                <SegmentedBar
                  accessibilityLabel={t('cal_sex')}
                  items={['male', 'female'].map(sx => ({ key: sx, label: t(`cal_sex_${sx}`) }))}
                  value={sex}
                  onChange={saveProfileSex}
                />
              ) : (
                // Not set in the profile → prompt to complete it instead of defaulting.
                <TouchableOpacity style={s.btnO} onPress={promptProfileSex} accessibilityRole="button">
                  <Text style={s.btnOText}>{t('cal_sex_gate_btn')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
          <View style={s.fld}>
            <Text style={s.fieldLab}>{t('cal_waist')} ({hUnit}) · {t('cal_optional')}</Text>
            <TextInput style={s.input} value={waist} onChangeText={setWaist} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.ink3} />
            <Text style={s.foot2}>{t('cal_waist_hint')}</Text>
          </View>
          <View style={s.sep} />
          {/* Height is universal (BMI, waist-to-height, and the Mifflin fallback all need it). */}
          <View style={s.fld}>
            <Text style={s.fieldLab}>{t('cal_height')} ({hUnit})</Text>
            <TextInput style={s.input} value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.ink3} />
          </View>
          <View style={s.fld}>
            <Text style={s.fieldLab}>{t('cal_bf_source')}</Text>
            <View style={s.pills}>
              {BF_SOURCES.map(src => (
                <TouchableOpacity key={src} style={[s.pill, bfSource === src && s.pillOn]} onPress={() => setBfSource(src)} accessibilityRole="button" accessibilityState={{ selected: bfSource === src }}>
                  <Text style={[s.pillText, bfSource === src && s.pillTextOn]}>{t(`cal_bf_${src}`)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.foot2}>{t(`cal_bf_${bfSource}_hint`)}</Text>
          </View>
          {/* Activity is an input too — it collapses with "Your numbers". */}
          <View style={s.fld}>
            <View style={s.rowC}>
              <FeatureIcon name="calc_bolt" size={18} color={colors.ink2} />
              <Text style={s.head}>{t('cal_activity')}</Text>
            </View>
            <View style={s.actlist}>
              {ACTIVITY_LEVELS.map((a, i) => {
                const on = activity === a.value;
                const prevOn = i > 0 && ACTIVITY_LEVELS[i - 1].value === activity;
                const parts = String(t(a.key)).split(' — ');
                return (
                  <View key={a.value}>
                    {i > 0 ? <View style={[s.actSep, (on || prevOn) && s.actSepHidden]} /> : null}
                    <TouchableOpacity style={[s.actRow, on && s.actRowOn]} onPress={() => setActivity(a.value)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ selected: on }}>
                      <View style={[s.grow, s.gap2]}>
                        <Text style={s.head}>{parts[0]}</Text>
                        {parts.length > 1 ? <Text style={s.sec2}>{parts.slice(1).join(' — ')}</Text> : null}
                      </View>
                      {on ? <CheckMark size={22} color={colors.ink} /> : null}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        </>
      )}
    </View>
  );

  // Reality check (Premium, or a free user's 7 free days — FL-41): how the daily burn
  // becomes Measured. Its food-log intake, totals, unlogged days and the food-log
  // reminder live in this card too (journey-dashboard: NutritionLogger → Reality check).
  const rcEl = (
    <View key="rc" style={s.card}>
      <View style={s.rowC}>
        <FeatureIcon name="calc_bars" size={22} color={colors.ink2} />
        <Text style={[s.title, s.grow]}>{t('cal_rc_title')}</Text>
        {!rcAllowed ? <Text style={s.otag}>{t('paywall_premium')}</Text> : null}
      </View>
      {!rcStart && !scoreCheck ? <Text style={s.sec2}>{t('cal_rc_sub')}</Text> : null}
      <TouchableOpacity
        style={s.foldRow}
        activeOpacity={0.7}
        // Locked users with an open check can still open the panel to STOP it (never behind the paywall).
        onPress={() => (rcExpandable ? setRcOpen(o => !o) : navigation.navigate('Paywall'))}
        accessibilityRole="button"
        accessibilityState={rcExpandable ? { expanded: rcOpen } : undefined}
      >
        <View style={s.grow}>
          {rcAllowed ? (
            scoreCheck ? (
              <Text style={s.body}>{t('cal_rc_result_prefix')} <Text style={s.mono}>{round10(scoreCheck.tdee)} {t('cal_kcal')}/{t('cal_day')}</Text></Text>
            ) : rcStart ? (
              <Text style={s.body}>{t('cal_rc_sb_progress').replace('{date}', fmtDate(rcRemindOn))}</Text>
            ) : (
              <Text style={s.body}>{t('cal_rc_sb_run')}</Text>
            )
          ) : (
            <Text style={s.body}>{t('cal_rc_sb_locked')}</Text>
          )}
        </View>
        {rcAllowed && scoreCheck && scoreCheck.ratePerWeekKg != null && Math.abs(scoreCheck.ratePerWeekKg) >= 0.05 ? (
          <Text style={[s.val15, s.ink2Text]}>
            {scoreCheck.ratePerWeekKg >= 0 ? '−' : '+'}{rateDisplay(scoreCheck.ratePerWeekKg)} {wUnit}/{t('cal_week')}
          </Text>
        ) : null}
        <Chev dir={rcExpandable ? (rcOpen ? 'up' : 'down') : 'right'} color={colors.ink3} />
      </TouchableOpacity>
      {rcOpen && (
        <View style={s.panel}>
          {rcStart || scoreCheck ? <Text style={s.sec2}>{t('cal_rc_sub')}</Text> : null}
          {rcAllowed ? (
            <>
              {!rcStart ? (
                // ── Phase 1: log the starting weight, arm the 3-week reminder ──
                <>
                  <View style={s.fld}>
                    <Text style={s.fieldLab}>{t('cal_rc_start_on')}</Text>
                    <View style={s.stepper}>
                      <TouchableOpacity style={[s.stepBtn, atEarliest && s.stepOff]} onPress={() => shiftRcStartDate(-1)} disabled={atEarliest} accessibilityRole="button" accessibilityLabel={t('nutri_date_earlier')}>
                        <Chev dir="left" color={colors.ink} size={20} />
                      </TouchableOpacity>
                      <Text style={s.stepVal}>{rcStartDate ? fmtDate(rcStartDate) : t('nutri_day_today')}</Text>
                      <TouchableOpacity style={[s.stepBtn, !rcStartDate && s.stepOff]} onPress={() => shiftRcStartDate(1)} disabled={!rcStartDate} accessibilityRole="button" accessibilityLabel={t('nutri_date_later')}>
                        <Chev dir="right" color={colors.ink} size={20} />
                      </TouchableOpacity>
                    </View>
                    <Text style={s.foot2}>{t('cal_rc_start_on_hint')}</Text>
                  </View>
                  <View style={s.fld}>
                    <Text style={s.fieldLab}>{t('cal_rc_start_weight')} ({wUnit})</Text>
                    <TextInput style={s.input} value={rcThen} onChangeText={setRcThen} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.ink3} />
                  </View>
                  <TouchableOpacity style={s.btnP} onPress={startRealityCheck} accessibilityRole="button">
                    <Text style={s.btnPText}>{t('cal_rc_start_btn')}</Text>
                  </TouchableOpacity>
                  <Text style={s.foot2}>{t('cal_rc_start_hint').replace('{n}', String(REALITY_CHECK_DAYS))}</Text>
                </>
              ) : (
                // ── Phase 2: return, log current weight; days are auto-measured ──
                <>
                  <View style={s.gap4}>
                    <Text style={s.sec2}>
                      ①  <Text style={s.mono}>{Math.round((unit === 'imperial' ? kgToLb(rcStart.weightKg) : rcStart.weightKg) * 10) / 10} {wUnit}</Text>  ·  {fmtDate(rcStart.date)}
                    </Text>
                    <Text style={s.foot2}>
                      {t('cal_rc_remind_on').replace('{date}', fmtDate(rcRemindOn))}  ·  {t('cal_rc_elapsed').replace('{n}', String(rcElapsedDays))}
                    </Text>
                  </View>
                  <View style={s.fld}>
                    <Text style={s.fieldLab}>{t('cal_rc_current_weight')} ({wUnit})</Text>
                    <TextInput style={s.input} value={rcNow} onChangeText={setRcNow} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.ink3} />
                  </View>
                  <View style={s.fld}>
                    <Text style={s.fieldLab}>{t('cal_rc_intake')}</Text>
                    <TextInput style={s.input} value={rcIntake} onChangeText={setRcIntake} keyboardType="number-pad" placeholder="—" placeholderTextColor={colors.ink3} />
                    {foodIntake ? (
                      <>
                        <TouchableOpacity style={s.pill} onPress={() => setRcIntake(String(foodIntake.avgKcal))} activeOpacity={0.7} accessibilityRole="button">
                          <Text style={[s.pillText, s.inkText]}>{t('cal_rc_use_log').replace('{total}', String(foodIntake.totalKcal)).replace('{d}', String(foodIntake.days)).replace('{n}', String(foodIntake.avgKcal))}</Text>
                        </TouchableOpacity>
                        <Text style={s.foot2}>{t('nutri_run_working').replace('{total}', String(foodIntake.totalKcal)).replace('{d}', String(foodIntake.days)).replace('{from}', fmtDate(foodIntake.fromISO)).replace('{to}', fmtDate(foodIntake.toISO))}</Text>
                        <Text style={s.foot2}>{t('cal_rc_from_log_note')}</Text>
                      </>
                    ) : foodRun ? (
                      // No intake number until 7 days in a row are fully logged (FL-3).
                      <Text style={s.foot2}>{t('nutri_run_progress').replace('{n}', String(Math.min(foodRun.current, MIN_RUN_DAYS)))}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity style={s.btnP} onPress={computeReality} accessibilityRole="button">
                    <Text style={s.btnPText}>{t('cal_rc_compute')}</Text>
                  </TouchableOpacity>

                  {rc && rc.status === 'ok' && (
                    <View style={s.result}>
                      <Text style={s.body}>{t('cal_rc_result_prefix')} <Text style={s.mono}>{round10(rc.tdee)} {t('cal_kcal')}/{t('cal_day')}</Text></Text>
                      {rc.ratePerWeekKg != null && Math.abs(rc.ratePerWeekKg) >= 0.05 ? (
                        <Text style={s.sec}>
                          {t('cal_rc_rate_losing')} <Text style={s.mono}>{rateDisplay(rc.ratePerWeekKg)} {wUnit}/{t('cal_week')}</Text> {rc.ratePerWeekKg >= 0 ? t('cal_rc_rate_lost') : t('cal_rc_rate_gained')}
                        </Text>
                      ) : null}
                      {plan ? <Text style={s.sec2}>{t('cal_rc_vs')} {round10(plan.tdeeVal)} {t('cal_kcal')}.</Text> : null}
                      <TouchableOpacity style={s.btnP} onPress={saveRealityCheck} accessibilityRole="button">
                        {rcSavedMsg ? (
                          <View style={s.savedRow}>
                            <CheckMark style={s.btnPText} />
                            <Text style={s.btnPText}>{t('cal_snap_saved')}</Text>
                          </View>
                        ) : <Text style={s.btnPText}>{t('cal_rc_save')}</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity style={s.btnO} onPress={startNextRealityCheck} accessibilityRole="button">
                        <Text style={s.btnOText}>{t('cal_rc_next').replace('{n}', String(REALITY_CHECK_DAYS))}</Text>
                      </TouchableOpacity>
                      <Text style={[s.head, s.mt6]}>{t('cal_rc_why_title')}</Text>
                      {[1, 2, 3, 4, 5].map(i => <Text key={i} style={s.sec2}>•  {t(`cal_rc_why_${i}`)}</Text>)}
                      <Text style={s.foot2}>{t('cal_rc_unreliable_note')}</Text>
                    </View>
                  )}
                  {rc && rc.status !== 'ok' && (
                    <View style={s.result}><Text style={s.sec2}>{t(`cal_rc_${rc.status}`)}</Text></View>
                  )}
                </>
              )}

              {realityLog.length > 0 && (
                <View style={s.gap6}>
                  <Text style={s.cap2}>{t('cal_rc_log_title')}</Text>
                  {[...realityLog].reverse().map((c) => (
                    <View key={c.date} style={s.logRow}>
                      <Text style={[s.sec, s.grow]}>{fmtDate(c.date)}</Text>
                      <Text style={[s.val15, s.ink2Text]}>
                        {c.ratePerWeekKg != null
                          ? `${c.ratePerWeekKg >= 0 ? '−' : '+'}${rateDisplay(c.ratePerWeekKg)} ${wUnit}/${t('cal_week')}`
                          : '—'}
                      </Text>
                      <Text style={s.val15}>{round10(c.tdee)} {t('cal_kcal')}</Text>
                    </View>
                  ))}
                </View>
              )}
              {(rcStart || realityLog.length > 0) && (
                <View style={s.linkRow}>
                  {rcStart ? (
                    <TouchableOpacity onPress={resetRealityCheck} style={s.linkHit} accessibilityRole="button">
                      <Text style={s.linkU}>{t('cal_rc_reset')}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity onPress={stopRealityCheck} style={s.linkHit} activeOpacity={0.7} accessibilityRole="button">
                    <Text style={s.linkRisk}>{t('cal_rc_stop')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <View style={s.rcLocked}>
              {/* FX-15: a check that is already running keeps its weigh-in — only the result is Premium. */}
              {rcAccess.canLogWeighIn ? (
                <View style={s.fld}>
                  <Text style={s.fieldLab}>{t('cal_rc_current_weight')} ({wUnit})</Text>
                  <TextInput style={s.input} value={rcNow} onChangeText={setRcNow} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.ink3} />
                  <TouchableOpacity style={[s.btnP, !num(rcNow) && s.btnOff]} onPress={saveRcWeighIn} disabled={!num(rcNow)} accessibilityRole="button">
                    {rcWeighMsg ? (
                      <View style={s.savedRow}>
                        <CheckMark style={s.btnPText} />
                        <Text style={s.btnPText}>{t('cal_snap_saved')}</Text>
                      </View>
                    ) : <Text style={[s.btnPText, !num(rcNow) && s.btnOffText]}>{t('cal_tgt_backfill_save')}</Text>}
                  </TouchableOpacity>
                </View>
              ) : null}
              <Text style={s.sec2}>{t('cal_rc_locked_intro')}</Text>
              <Text style={s.head}>{t('cal_rc_locked_lead')}</Text>
              <View style={s.gap2}>
                <Text style={s.sec2}>1.  {t('cal_rc_start_weight')}</Text>
                <Text style={s.sec2}>2.  {t('cal_rc_current_weight')}</Text>
                <Text style={s.sec2}>3.  {t('cal_rc_intake')}</Text>
              </View>
              <Text style={s.sec}>{t('cal_rc_locked_payoff')}</Text>
              <TouchableOpacity style={s.btnP} onPress={() => navigation.navigate('Paywall')} accessibilityRole="button">
                <Text style={s.btnPText}>{t('cal_premium_cta')}</Text>
              </TouchableOpacity>
              {/* Stop stays reachable when locked (FL-41) — it only clears the check; logged meals are kept. */}
              {(rcStart || realityLog.length > 0) && (
                <TouchableOpacity style={s.linkHit} onPress={stopRealityCheck} activeOpacity={0.7} accessibilityRole="button">
                  <Text style={s.linkRisk}>{t('cal_rc_stop')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
      {/* Food log — feeds the reality check's intake (totals, run, unlogged days, reminder). */}
      <NutritionLogger />
    </View>
  );

  const weighEl = (
    <View key="weigh" style={s.card}>
      {/* Progress snapshots — weigh-ins are never paywalled (FX-15) */}
      <View style={s.gap2}>
        <Text style={s.title}>{t('cal_snap_title')}</Text>
        {lastSnap ? (
          <Text style={s.foot2}>{sortedSnaps.length} · {fmtDate(lastSnap.date)}{lastSnap.weightKg != null ? <> · <Text style={s.mono}>{fmtW(lastSnap.weightKg)} {wUnit}</Text></> : null}</Text>
        ) : null}
      </View>
      <Text style={s.sec2}>{t('cal_snap_sub')}</Text>
      <TouchableOpacity style={[s.btnP, !plan && s.btnOff]} onPress={saveSnapshot} disabled={!plan} accessibilityRole="button">
        {snapMsg ? (
          <View style={s.savedRow}>
            <CheckMark style={s.btnPText} />
            <Text style={s.btnPText}>{t('cal_snap_saved')}</Text>
          </View>
        ) : <Text style={[s.btnPText, !plan && s.btnOffText]}>{t('cal_snap_save')}</Text>}
      </TouchableOpacity>
      {snapPointCount >= 2 ? (
        <ProgressChart series={chartSeries} locale={locale} width={CHART_WIDTH} />
      ) : (
        <Text style={s.sec2}>{t('cal_snap_need_more')}</Text>
      )}
      {/* The newest weigh-ins as rows (date · weight · body fat · waist); all of them are on the chart. */}
      {histRows.length > 0 ? (
        <View>
          <View style={s.histHead}>
            <Text style={[s.cap2, s.histDate]}>{t('cal_tgt_backfill_date')}</Text>
            <Text style={[s.cap2, s.histCell]}>{t('cal_snap_weight')}</Text>
            <Text style={[s.cap2, s.histCell]}>{t('cal_snap_bodyfat')}</Text>
            <Text style={[s.cap2, s.histCell]}>{t('cal_snap_waist')}</Text>
          </View>
          {histRows.map(r => (
            <View key={r.date} style={s.histRow}>
              <Text style={[s.sec, s.histDate]}>{fmtDate(r.date)}</Text>
              <Text style={[s.val15, s.histCell]}>{r.weightKg != null ? `${fmtW(r.weightKg)} ${wUnit}` : '—'}</Text>
              <Text style={[s.val15, s.histCell]}>{r.bodyFatPct != null ? `${Math.round(r.bodyFatPct * 10) / 10}%` : '—'}</Text>
              <Text style={[s.val15, s.histCell]}>{r.waistCm != null ? `${Math.round((unit === 'imperial' ? cmToIn(r.waistCm) : r.waistCm) * 10) / 10} ${hUnit}` : '—'}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {/* Backfill a past weigh-in — for someone who started before installing.
          Writes a dated snapshot so the measured rate (and the target ETA)
          can appear without waiting weeks. */}
      <TouchableOpacity onPress={() => setBfOpen(true)} activeOpacity={0.7} style={s.linkHit} accessibilityRole="button">
        <Text style={s.linkU}>{t('cal_tgt_backfill_add')}</Text>
      </TouchableOpacity>
      <SheetModal visible={bfOpen} onClose={closeBackfill} s={s}>
        <View style={s.sheetHead}>
          <TouchableOpacity onPress={closeBackfill} style={s.sheetSide} accessibilityRole="button">
            <Text style={s.txtBtn}>{bfMsg ? t('done') : t('cancel')}</Text>
          </TouchableOpacity>
          <Text style={s.sheetTitle} numberOfLines={2}>{String(t('cal_tgt_backfill_add')).replace(/^\+\s*/, '')}</Text>
          <View style={s.sheetSide} />
        </View>
        <Text style={s.sec2}>{t('cal_tgt_backfill_hint')}</Text>
        <View style={s.fld}>
          <Text style={s.fieldLab}>{t('cal_tgt_backfill_date')}</Text>
          <TouchableOpacity style={s.datebtn} onPress={() => setShowBfDatePicker(true)} activeOpacity={0.7} accessibilityRole="button">
            <Text style={s.body}>{fmtDate(bfDate)}</Text>
            <FeatureIcon name="calendar" size={20} color={colors.ink2} />
          </TouchableOpacity>
          {showBfDatePicker ? (
            <DateTimePicker
              value={new Date(bfDate + 'T12:00:00')}
              mode="date"
              maximumDate={new Date()}
              onChange={(e, d) => { setShowBfDatePicker(false); if (d) setBfDate(localISO(d)); }}
            />
          ) : null}
        </View>
        <View style={s.fieldRow}>
          <View style={s.fldHalf}>
            <Text style={s.fieldLab}>{t('cal_snap_weight')} ({wUnit})</Text>
            <TextInput style={s.input} value={bfWeight} onChangeText={setBfWeight} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.ink3} />
          </View>
          <View style={s.fldHalf}>
            <Text style={s.fieldLab}>{t('cal_snap_bodyfat')} (%) · {t('cal_tgt_optional')}</Text>
            <TextInput style={s.input} value={bfBodyFat} onChangeText={setBfBodyFat} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.ink3} />
          </View>
        </View>
        <TouchableOpacity style={[s.btnP, !num(bfWeight) && s.btnOff]} onPress={saveBackfillWeighIn} disabled={!num(bfWeight)} accessibilityRole="button">
          {bfMsg ? (
            <View style={s.savedRow}>
              <CheckMark style={s.btnPText} />
              <Text style={s.btnPText}>{t('cal_snap_saved')}</Text>
            </View>
          ) : <Text style={[s.btnPText, !num(bfWeight) && s.btnOffText]}>{t('cal_tgt_backfill_save')}</Text>}
        </TouchableOpacity>
      </SheetModal>
    </View>
  );

  return (
    <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={s.centered} keyboardShouldPersistTaps="handled">
      {header}
      {/* Order (prototype progressScreen): what the user needs every visit first. Keyed,
          so a card that moves when the plan appears keeps its state (no remount). */}
      {plan
        ? [heroEl, planEl, rcEl, weighEl, numbersEl]
        : [introEl, numbersEl, statusEl, rcEl, targetEl, weighEl]}

      {/* The disclaimer qualifies every number on this screen. */}
      <Text style={s.disclaimer}>{t('cal_disclaimer')}</Text>

      {/* Understand the numbers + Sources & references (shared with the Journey dashboard). */}
      <LearnBlock />

      {/* Your target — edit sheet (prototype tgtSheet). */}
      <SheetModal visible={targetEditing} onClose={closeTarget} s={s}>
        <View style={s.sheetHead}>
          <TouchableOpacity onPress={closeTarget} style={s.sheetSide} accessibilityRole="button">
            <Text style={s.txtBtn}>{t('cancel')}</Text>
          </TouchableOpacity>
          <Text style={s.sheetTitle} numberOfLines={2}>{t('cal_tgt_title')}</Text>
          {/* Save stays off until at least one target field is valid (no silent no-op loop). */}
          <TouchableOpacity onPress={saveTarget} disabled={!tgtValid} style={[s.sheetSide, s.sheetSideEnd]} accessibilityRole="button" accessibilityState={{ disabled: !tgtValid }}>
            <Text style={[s.txtBtnStrong, !tgtValid && s.txtOff]}>{t('save')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.sec2}>{t('cal_tgt_sub')}</Text>
        <View style={s.fieldRow}>
          <View style={s.fldHalf}>
            <Text style={s.fieldLab}>{t('cal_tgt_weight')} ({wUnit}) · {t('cal_tgt_optional')}</Text>
            <TextInput style={s.input} value={tgtWeight} onChangeText={setTgtWeight} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.ink3} />
          </View>
          <View style={s.fldHalf}>
            <Text style={s.fieldLab}>{t('cal_tgt_bodyfat')} (%) · {t('cal_tgt_optional')}</Text>
            <TextInput style={s.input} value={tgtBF} onChangeText={setTgtBF} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.ink3} />
          </View>
        </View>
        {tgtLow ? <Text style={s.tnote}>{healthyText('cal_tgt_below_range')}</Text> : null}
        <View style={s.fld}>
          <Text style={s.fieldLab}>{t('cal_tgt_date')}</Text>
          <TouchableOpacity style={s.datebtn} onPress={() => setShowTgtDatePicker(true)} activeOpacity={0.7} accessibilityRole="button">
            <Text style={tgtDate ? s.body : s.bodyMuted}>{tgtDate ? fmtDate(tgtDate) : t('cal_tgt_no_date')}</Text>
            <FeatureIcon name="calendar" size={20} color={colors.ink2} />
          </TouchableOpacity>
          {tgtDate ? (
            <TouchableOpacity onPress={() => setTgtDate(null)} activeOpacity={0.7} style={s.linkHitSm} accessibilityRole="button">
              <Text style={[s.linkU, s.linkSm]}>{t('cal_tgt_remove_date')}</Text>
            </TouchableOpacity>
          ) : null}
          {showTgtDatePicker ? (
            <DateTimePicker
              value={tgtDate ? new Date(tgtDate + 'T12:00:00') : new Date()}
              mode="date"
              minimumDate={new Date()}
              onChange={(e, d) => { setShowTgtDatePicker(false); if (d) setTgtDate(localISO(d)); }}
            />
          ) : null}
        </View>
        {target ? (
          <TouchableOpacity style={s.dangerBtn} onPress={clearTargetConfirm} activeOpacity={0.7} accessibilityRole="button">
            <Text style={s.dangerText}>{t('cal_tgt_remove')}</Text>
          </TouchableOpacity>
        ) : null}
      </SheetModal>
    </ScrollView>
  );
}

// A thin monoline chevron (prototype UP / DOWN / CHEV).
const CHEV_PATHS = { down: 'M3 6l5 5 5-5', up: 'M3 10l5-5 5 5', left: 'M10 3l-5 5 5 5', right: 'M6 3l5 5-5 5' };
function Chev({ dir = 'down', color, size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path d={CHEV_PATHS[dir]} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// The target as a graduated scale (DESIGN.md §5: no rounded progress bars): the
// covered distance in data blue with onData ticks inside, the rest as tick marks,
// and the "now" marker in ink.
function TargetScale({ frac, colors }) {
  const W = 320, x0 = 2, x1 = W - 2, N = 20;
  const xf = x0 + Math.max(0, Math.min(1, frac)) * (x1 - x0);
  const ticks = [];
  for (let i = 0; i <= N; i++) {
    const x = x0 + (i / N) * (x1 - x0);
    const major = i % 5 === 0;
    ticks.push(<Line key={i} x1={x} x2={x} y1={major ? 4 : 10} y2={24} stroke={x <= xf ? colors.onData : colors.tick} strokeWidth={major ? 1.4 : 0.9} />);
  }
  return (
    <Svg width="100%" height={30} viewBox={`0 0 ${W} 30`} preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={x0} y={8} width={Math.max(0, xf - x0)} height={12} rx={2} fill={colors.data} />
      {ticks}
      <Rect x={Math.min(x1 - 4, Math.max(x0, xf - 2))} y={1} width={4} height={26} rx={1.5} fill={colors.ink} />
    </Svg>
  );
}

// A bottom sheet (prototype .scrim.bot + .sheet). Forms close only through their
// own Cancel / Save (never a stray tap on the scrim) so typed values are not lost.
function SheetModal({ visible, onClose, s, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.scrim} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetBody}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Graduated (DESIGN.md §2–§5, prototype .card.pc / .goal / .cell / .pill /
// .actlist / .winp / .btn / .list): plain raised cards, no border, shadow or tint;
// one ink action per card; selection = ink outline; data blue only for data.
const makeStyles = (c) => StyleSheet.create({
  scroll: { flex: 1 },
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 60, gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  gap2: { gap: 2 },
  gap4: { gap: 4 },
  gap6: { gap: 6 },
  mt6: { marginTop: 6 },
  card: { backgroundColor: c.raised, borderRadius: 24, padding: 18, gap: 12 },
  rowC: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  sep: { height: 1, backgroundColor: c.line },
  // type roles (DESIGN.md §3; Geist is applied automatically from 22 pt)
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.ink, letterSpacing: -0.2 },
  head: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  body: { fontSize: 17, lineHeight: 22, color: c.ink },
  bodyMuted: { fontSize: 17, lineHeight: 22, color: c.ink3 },
  sec: { fontSize: 15, lineHeight: 20, color: c.ink },
  sec2: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  foot2: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  cap2: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: c.ink2 },
  inkText: { color: c.ink },
  ink2Text: { color: c.ink2 },
  val: { fontFamily: MONO['500'], fontSize: 17, lineHeight: 22, color: c.ink, fontVariant: ['tabular-nums'] },
  val15: { fontFamily: MONO['500'], fontSize: 15, lineHeight: 20, color: c.ink, fontVariant: ['tabular-nums'] },
  mono: { fontFamily: MONO['500'], color: c.ink, fontVariant: ['tabular-nums'] },
  tnote: { fontSize: 13, lineHeight: 18, color: c.attention },
  // hero (prototype heroCard): two 56 pt numbers, units in mono
  heroPair: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 18 },
  heroCol: { flexGrow: 1, flexBasis: 140, minWidth: 0, gap: 6 },
  heroColStack: { flexBasis: '100%' }, // side-by-side numbers stack from ~130% text size
  display: { fontSize: 56, lineHeight: 62, fontWeight: '500', color: c.ink, letterSpacing: -1.6, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: MONO['400'], fontSize: 13, fontWeight: '400', color: c.ink3, letterSpacing: 0 },
  chip: { alignSelf: 'flex-start', minHeight: 26, borderRadius: 13, borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, justifyContent: 'center' },
  chipText: { fontSize: 12, fontWeight: '500', color: c.ink2 },
  chipMeas: { borderColor: c.data },
  chipMeasText: { color: c.data },
  // target
  tgtBlock: { gap: 10 },
  tgtMetric: { gap: 8 },
  scaleLab: { fontFamily: MONO['400'], fontSize: 12, color: c.ink3, fontVariant: ['tabular-nums'] },
  scaleLabEnd: { color: c.ink },
  // daily plan
  goals: { flexDirection: 'row', gap: 8 },
  goal: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 10, gap: 2 },
  goalOn: { borderWidth: 1.5, borderColor: c.ink, padding: 9.5 },
  cell: { backgroundColor: c.well, borderRadius: 14, padding: 12, gap: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipBox: { borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  warnbox: { borderWidth: 1, borderColor: c.attention, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  warnText: { fontSize: 15, lineHeight: 20, color: c.ink },
  foldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 4 },
  foldHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  // inputs
  fieldRow: { flexDirection: 'row', gap: 12 },
  fld: { gap: 6 },
  fldHalf: { flex: 1, minWidth: 0, gap: 6 },
  fieldLab: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  input: { backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: c.ink },
  inputLocked: { backgroundColor: c.well, color: c.ink2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { alignSelf: 'flex-start', minHeight: 36, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
  pillOn: { borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.raised, paddingHorizontal: 13.5, paddingVertical: 6.5 },
  pillText: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  pillTextOn: { color: c.ink, fontWeight: '600' },
  actlist: { borderWidth: 1, borderColor: c.line, borderRadius: 16, overflow: 'hidden' },
  actRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 2, borderColor: c.raised, borderRadius: 16 },
  actRowOn: { borderColor: c.ink },
  actSep: { height: 1, backgroundColor: c.line, marginHorizontal: 14 },
  actSepHidden: { backgroundColor: c.raised },
  // actions
  btnP: { minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 10 },
  btnPText: { color: c.onAct, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  btnO: { minHeight: 50, borderRadius: 25, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 10 },
  btnOText: { color: c.ink, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  // disabled = well, ink3, dashed line border (readable, clearly inactive)
  btnOff: { backgroundColor: c.well, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line },
  btnOffText: { color: c.ink3 },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  linkU: { fontSize: 17, lineHeight: 22, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  linkSm: { fontSize: 13, lineHeight: 18 },
  linkRisk: { fontSize: 17, lineHeight: 22, color: c.risk, textDecorationLine: 'underline', textDecorationColor: c.risk },
  linkHit: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkHitSm: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 24 },
  otag: { borderWidth: 1, borderColor: c.line, color: c.ink2, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  // reality check
  panel: { gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised },
  stepBtn: { width: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  stepOff: { opacity: 0.35 },
  stepVal: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: c.ink, fontVariant: ['tabular-nums'] },
  result: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 14, gap: 10 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8, paddingBottom: 2 },
  rcLocked: { gap: 12 },
  // weigh-ins history (prototype .hist)
  histHead: { flexDirection: 'row', paddingBottom: 6 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.line },
  histDate: { flex: 1.1, minWidth: 0 },
  histCell: { flex: 1, minWidth: 0, textAlign: 'right' },
  datebtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.well },
  dangerBtn: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  dangerText: { fontSize: 17, fontWeight: '600', color: c.risk },
  // footer
  disclaimer: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },
  list: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16 },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  listItem: { borderTopWidth: 1, borderTopColor: c.line },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  listBody: { paddingBottom: 14 },
  srcRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line },
  // sheets (prototype .scrim.bot / .sheet.bsheet)
  scrim: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end', paddingHorizontal: 8, paddingTop: 48, paddingBottom: 30 },
  sheet: { backgroundColor: c.raised, borderRadius: 26, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', maxHeight: '100%', overflow: 'hidden' },
  sheetBody: { padding: 20, gap: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  sheetSide: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  sheetSideEnd: { alignItems: 'flex-end' },
  sheetTitle: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  txtBtn: { fontSize: 17, color: c.ink },
  txtBtnStrong: { fontSize: 17, fontWeight: '600', color: c.ink },
  txtOff: { color: c.ink3 },
});
