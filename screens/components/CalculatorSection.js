/**
 * DoseTrace — Energy & protein calculator (the Progress screen, behind Journey's tile)
 *
 * Journey redesign (founder per-part choices 2026-10-02; docs/design/prototype.html
 * progressScreen): with numbers the order is hero (weight, daily burn, Log today's weight)
 * → Your target (its own block) → daily plan → reality check → weigh-ins → your numbers;
 * before them it is your numbers (open, with the prompt) → reality check → Your target →
 * weigh-ins. Then the disclaimer and Understand the numbers / Sources. Log today's weight,
 * the reality-check start, the target and a past weigh-in are bottom sheets; Start over,
 * Stop and Remove target ask first in DoseTrace sheets. The reality check finishes from
 * the user's own weigh-in (day 21) and food log (7 days in a row) — nothing typed twice.
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
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, useWindowDimensions, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import Svg, { Path, Rect, Line, Text as SvgText } from 'react-native-svg';
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
import { syncRealityCheckReminder, syncFoodLogReminder, REALITY_CHECK_DAYS } from '../../lib/notifications';
import { getRealityStart, setRealityStart, clearRealityStart, getCalcInputs, saveCalcInputs } from '../../lib/realityCheck';
import { validStartDate, stepStartDate, weighInOn, earliestStart, prefillStartWeight, checkOutcome } from '../../lib/realityCheckRules';
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
import { FoodReminderRow } from './NutritionLogger';
import { intakeRun, MIN_RUN_DAYS, checkSoFar } from '../../lib/nutrition';
import { exampleValues, activityParts, numbersSummary, targetTicks } from '../../lib/progressFormat';
import { dateColumns, dateAfter } from '../../lib/wheelPick';
import { DTSheet, DTPickerSheet, DTWheel } from './ProtocolParts';
import { FeaturePreviewSheet } from '../../components/FeaturePreviews';
import FoldChevron from '../../components/FoldChevron';
import RowChevron from '../../components/RowChevron';
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

const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr',
  'month_may', 'month_jun', 'month_jul', 'month_aug',
  'month_sep', 'month_oct', 'month_nov', 'month_dec',
];

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
  // Reality check: the start weight typed in the start sheet (display units).
  const [rcThen, setRcThen] = useState(() => (rcDraft && rcDraft.then) || '');
  const [rcStart, setRcStart] = useState(null);     // { date, weightKg } — open check-in
  const [rcStartOpen, setRcStartOpen] = useState(false); // the start sheet (part 9)
  const [rcExplain, setRcExplain] = useState(false);     // free plan: "See how it works" (part 11)
  const [soFarOpen, setSoFarOpen] = useState(false);     // "Your reality check so far" (part 8)
  const [realityLog, setRealityLog] = useState([]); // saved reality checks over time
  const [foodRows, setFoodRows] = useState([]); // food_logs rows, for the check's run and day list
  const [confirm, setConfirm] = useState(null); // DoseTrace confirm sheet (Start over? / Stop / Remove target / sex)
  // Log today's weight (parts 5-6); its typed values survive a remount like the other forms.
  const [wiDraft] = useState(() => getDraft('progress:todayWeigh'));
  const [wiOpen, setWiOpen] = useState(() => !!(wiDraft && wiDraft.open));
  const [wiWeight, setWiWeight] = useState(() => (wiDraft && wiDraft.weight) || '');
  const [wiBf, setWiBf] = useState(() => (wiDraft && wiDraft.bf) || '');
  const [wiWaist, setWiWaist] = useState(() => (wiDraft && wiDraft.waist) || '');
  // Weigh-ins card (part 13): folded by default; the newest five unless Show all.
  const [weighOpen, setWeighOpen] = useState(false);
  const [showAllW, setShowAllW] = useState(false);

  // ── Personal target (build 56) ──────────────────────────────────
  const [target, setTarget] = useState(null);        // the saved calc_targets row
  const [targetEditing, setTargetEditing] = useState(() => !!tgtDraft); // a kept target draft reopens its sheet
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
    keepDraft('progress:rcWeigh', { then: rcThen, startDate: rcStartDate, thenAuto: rcThenAuto.current });
  }, [rcThen, rcStartDate]);
  useEffect(() => {
    const typed = wiWeight || wiBf || wiWaist;
    keepDraft('progress:todayWeigh', typed ? { weight: wiWeight, bf: wiBf, waist: wiWaist, open: wiOpen } : null);
  }, [wiOpen, wiWeight, wiBf, wiWaist]);
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
    setConfirm({
      title: t('cal_sex_gate_title'),
      body: t('cal_sex_gate_body'),
      buttons: [
        { label: t('profile_gender_male'), kind: 'secondary', onPress: () => saveProfileSex('male') },
        { label: t('profile_gender_female'), kind: 'secondary', onPress: () => saveProfileSex('female') },
        { label: t('cancel'), kind: 'secondary' },
      ],
    });
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
    setWiWeight(cw(wiWeight));
    setWiWaist(ch(wiWaist));
    setUnit(next);
  }

  const waistCm = useMemo(() => {
    const w = num(waist);
    if (w == null) return null;
    return unit === 'imperial' ? inToCm(w) : w;
  }, [waist, unit]);

  // ── Log today's weight (redesign parts 5-6, Q10 = A) ─────────────
  // Every weigh-in is the user's own data: saved as TODAY's row in calc_snapshots, merged
  // against a fresh read so nothing logged earlier that day is lost (FX-15: never
  // paywalled). The weight / body fat / waist typed here also become the current numbers
  // in Your numbers, so the plan, the target and the reality check use them.
  function openWeighIn() { setWiOpen(true); }
  function closeWeighIn() { setWiOpen(false); }
  function saveTodayWeighIn() {
    const uid = userIdRef.current;
    if (!uid) return;
    const w = num(wiWeight);
    if (w == null) return;
    const date = todayISO();
    const weightKg = unit === 'imperial' ? lbToKg(w) : w;
    const bfv = num(wiBf);
    const wc = num(wiWaist);
    const waistCmNew = wc == null ? null : (unit === 'imperial' ? inToCm(wc) : wc);
    const existing = getCalcSnapshots(uid).find(sn => sn.entry_date === date) || null;
    upsertCalcSnapshot(uid, mergeWeighIn(existing, { date, weightKg, bodyFatPct: bfv, waistCm: waistCmNew }));
    requestSync?.();
    setSnapshots(getCalcSnapshots(uid).map(snapRowToUI));
    setWeight(String(w));
    if (bfv != null && !isUnknown) setBodyFat(String(bfv));
    if (wc != null) setWaist(String(wc));
    setWiWeight(''); setWiBf(''); setWiWaist('');
    clearDraft('progress:todayWeigh');
    calcChanged();
    setWiOpen(false);
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
  }

  // Remove target (the editor's red link): asks first in a DoseTrace sheet (prototype confirm).
  function clearTargetConfirm() {
    setConfirm({
      title: t('cal_tgt_clear_title'),
      body: t('cal_tgt_clear_body'),
      buttons: [
        { label: t('cancel'), kind: 'secondary' },
        { label: t('cal_tgt_clear_confirm'), kind: 'danger', onPress: () => {
          const uid = userIdRef.current; if (!uid) return;
          clearCalcTarget(uid); requestSync?.(); calcChanged();
          setTarget(null); setTargetEditing(false);
        } },
      ],
    });
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
  // A past weigh-in is never in the future.
  const clampPast = (iso) => (iso > todayISO() ? todayISO() : iso);

  // ETA weeks → { weeks, when } where `when` is the projected finish day.
  function fmtEta(weeks) {
    if (weeks == null || !Number.isFinite(weeks)) return null;
    const w = Math.max(1, Math.round(weeks));
    const done = new Date(); done.setDate(done.getDate() + w * 7);
    const sameYear = done.getFullYear() === new Date().getFullYear();
    const when = done.toLocaleDateString(locale, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
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
  }, [snapshots, unit, colors, language]);

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

  // A one-line "since your first weigh-in" delta for the hero.
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
  // "Aug 31" (the year only when it is not this year).
  const fmtShort = iso => {
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
  };
  const fmtInt = n => Math.round(n).toLocaleString(locale);
  // "Tue, Sep 22, 2026" (the sheets' date buttons, prototype wdl()).
  const fmtLong = iso => {
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };
  // A target date is never in the past.
  const clampFuture = iso => (iso < todayISO() ? todayISO() : iso);

  // ── Reality check (Premium, or a free user's 7 free days — FL-41) ──
  const rcAllowed = premium || rcFree;
  const rcAccess = realityCheckAccess({ premium, rcFree, hasOpenCheck: !!rcStart });
  // The check's food-log run (FL-3: 7+ consecutive complete days) and the day list of
  // "Your reality check so far" — the user's own logged food, never a typed guess.
  const foodRun = useMemo(
    () => (rcStart ? intakeRun(foodRows, String(rcStart.date).slice(0, 10), todayISO()) : null),
    [foodRows, rcStart],
  );
  const soFar = useMemo(
    () => (rcStart ? checkSoFar(foodRows, String(rcStart.date).slice(0, 10), todayISO()) : null),
    [foodRows, rcStart],
  );
  // The date the day-21 weigh-in is due (display only).
  const rcRemindOn = useMemo(() => {
    if (!rcStart) return null;
    const d = new Date(rcStart.date + 'T12:00:00');
    d.setDate(d.getDate() + REALITY_CHECK_DAYS);
    return localISO(d);
  }, [rcStart]);
  const rcDayN = rcStart ? Math.min(daysBetween(rcStart.date, todayISO()) + 1, REALITY_CHECK_DAYS) : null;

  // Where the open check stands (parts 8 / 10): it finishes from the first weigh-in on or
  // after day 21 and the food log's 7-day run (lib/realityCheckRules checkOutcome).
  const outcome = useMemo(
    () => checkOutcome({ start: rcStart, snapshots, run: foodRun, todayISO: todayISO(), days: REALITY_CHECK_DAYS }),
    [rcStart, snapshots, foodRun],
  );
  const outcomeResult = useMemo(() => {
    if (outcome.state !== 'ready') return null;
    const res = realityCheckTDEE({ avgDailyCalories: outcome.avgDailyCalories, weightChangeKg: outcome.weightChangeKg, days: outcome.days });
    return { ...res, ratePerWeekKg: weeklyRateKg({ weightChangeKg: outcome.weightChangeKg, days: outcome.days }), weighIn: outcome.weighIn };
  }, [outcome]);
  // A finished check is saved once and closed — only for someone who may see the result
  // (FL-41: a free user after the free days keeps the check open until Premium or Stop).
  // A check that already has a saved result (saved with the old typed form before this
  // update) is never finished a second time: its saved number is the user's, never rewritten.
  const rcStartISO = rcStart ? String(rcStart.date).slice(0, 10) : null;
  const checkSaved = !!rcStart && realityLog.some(c => c.date >= rcStartISO);
  const completing = useRef(false);
  useEffect(() => {
    if (!outcomeResult || outcomeResult.status !== 'ok' || !rcAccess.canSeeResult || checkSaved || completing.current) return;
    completing.current = true;
    completeRealityCheck(outcomeResult).catch(() => {}).finally(() => { completing.current = false; });
  }, [outcomeResult, rcAccess.canSeeResult, checkSaved]);

  // Phase 1 — log the starting weight (today, or a weigh-in up to 7 days back) and
  // arm the +21-day reminder. The sheet opens on today with today's weigh-in, if any.
  function openRcStart() {
    setRcStartDate(null);
    const w = weighInOn(snapshots, todayISO());
    const snap = w == null ? null : Math.round((unit === 'imperial' ? kgToLb(w) : w) * 10) / 10;
    const v = prefillStartWeight(rcThen, rcThenAuto.current, snap);
    if (v != null) { setRcThen(v); rcThenAuto.current = v || null; }
    setRcStartOpen(true);
  }
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
  // The start weight is also kept as that day's weigh-in when the day has none yet
  // (never over a weight already saved that day).
  async function startRealityCheck() {
    const kg = num(rcThen) == null ? null : (unit === 'imperial' ? lbToKg(num(rcThen)) : num(rcThen));
    if (kg == null) return;
    const date = rcStartDate && validStartDate(rcStartDate, todayISO()) ? rcStartDate : todayISO();
    // Free days count from the day of this TAP, never the backdated start (FL-41 × FL-44).
    ensureFreeStart(userIdRef.current);
    const uid = userIdRef.current;
    if (uid) {
      const existing = getCalcSnapshots(uid).find(sn => sn.entry_date === date) || null;
      if (!existing || existing.weight_kg == null) {
        upsertCalcSnapshot(uid, mergeWeighIn(existing, { date, weightKg: kg }));
        requestSync?.();
        setSnapshots(getCalcSnapshots(uid).map(snapRowToUI));
      }
    }
    const start = { date, weightKg: kg };
    setRcStart(start);
    setRcThen('');
    setRcStartDate(null);
    rcThenAuto.current = null;
    setRcStartOpen(false);
    clearDraft('progress:rcWeigh');
    await setRealityStart(start);
    calcChanged();
    syncRealityCheckReminder().catch(() => {});
    syncFoodLogReminder().catch(() => {});
  }

  // Start over (after "Start over?"): clear the open check and its reminders (back to
  // "Not run yet"). Weigh-ins and logged meals are kept.
  async function resetRealityCheck() {
    setRcStart(null);
    await clearRealityStart();
    calcChanged();
    syncRealityCheckReminder().catch(() => {});
    syncFoodLogReminder().catch(() => {});
  }
  function confirmResetRealityCheck() {
    setConfirm({
      title: t('cal_rc_reset_title'),
      body: t('cal_rc_reset_body'),
      buttons: [
        { label: t('cancel'), kind: 'secondary' },
        { label: t('cal_rc_reset'), kind: 'danger', onPress: resetRealityCheck },
      ],
    });
  }

  // Stop the reality check entirely (founder-requested, one easy-to-reach button):
  // confirm in a DoseTrace sheet, then clear the open check-in AND the saved numbers,
  // and cancel both the weigh-in reminder and the daily food-log reminder. Logged meals
  // and weigh-ins are KEPT. Nothing is cleared before the confirm.
  function stopRealityCheck() {
    setConfirm({
      title: t('cal_rc_stop_title'),
      body: t('cal_rc_stop_body'),
      buttons: [
        { label: t('cancel'), kind: 'secondary' },
        { label: t('cal_rc_stop_confirm'), kind: 'danger', onPress: async () => {
          setRcStart(null); setRealityLog([]);
          await clearRealityStart();
          if (userIdRef.current) { clearRealityChecks(userIdRef.current); requestSync?.(); }
          calcChanged();
          syncRealityCheckReminder().catch(() => {});
          syncFoodLogReminder().catch(() => {});
        } },
      ],
    });
  }

  // Part 10: a finished check (ready + plausible) is saved as a result row on its weigh-in
  // day, then the open check closes (its reminders stop). The start weight is kept as the
  // start day's weigh-in when that day has none, so nothing the user entered is lost.
  async function completeRealityCheck(res) {
    const uid = userIdRef.current;
    if (!uid || !rcStart) return;
    const startDay = String(rcStart.date).slice(0, 10);
    if (getRealityChecks(uid).some(r => r.entry_date >= startDay)) return;
    const onStart = getCalcSnapshots(uid).find(sn => sn.entry_date === startDay) || null;
    if (!onStart || onStart.weight_kg == null) upsertCalcSnapshot(uid, mergeWeighIn(onStart, { date: startDay, weightKg: rcStart.weightKg }));
    upsertRealityCheck(uid, { entry_date: res.weighIn.date, tdee: Math.round(res.tdee), rate_per_week_kg: res.ratePerWeekKg ?? null });
    requestSync?.();
    setRealityLog(getRealityChecks(uid).map(rcRowToUI));
    setSnapshots(getCalcSnapshots(uid).map(snapRowToUI));
    setRcStart(null);
    await clearRealityStart();
    calcChanged();
    syncRealityCheckReminder().catch(() => {});
    syncFoodLogReminder().catch(() => {});
  }

  // Weekly rate → display units, absolute value (sign drives the label).
  const rateDisplay = kg => {
    if (kg == null) return null;
    const v = unit === 'imperial' ? kgToLb(kg) : kg;
    return Math.abs(Math.round(v * 100) / 100);
  };

  // ── Scoreboard ───────────────────────────────────────────────────
  // The measured daily burn: the most recent saved check.
  const scoreCheck = useMemo(() => {
    if (realityLog.length) {
      const l = realityLog[realityLog.length - 1];
      return { tdee: l.tdee, ratePerWeekKg: l.ratePerWeekKg };
    }
    return null;
  }, [realityLog]);

  // Goal targets: when a reality-check MEASURED maintenance exists, recompute the
  // lose/maintain/gain calories off it through the SAME floored engine (not a raw
  // ratio scale) so the calorie/BMR safety floor still applies on the measured
  // path — else scaling lose by measured/formula can silently dip below 1200.
  const effectiveGoals = useMemo(() => {
    if (!plan) return null;
    if (scoreCheck && plan.tdeeVal) return goalsForTdee(scoreCheck.tdee, { bmr: plan.bmr, sex });
    return plan.allGoals;
  }, [plan, scoreCheck, sex]);

  const scrollRef = useRef(null);

  // Warning codes from the engine → localized copy.
  const warnText = w => {
    if (w.code === 'calorie_floor' || w.code === 'bmr_floor') {
      return t(`cal_warn_${w.code}`).replace('{kcal}', String(round10(w.values?.kcal ?? 0)));
    }
    if (w.code === 'protein_cap') return t('cal_warn_protein_cap').replace('{g}', String(w.values?.g ?? ''));
    if (w.code === 'protein_adjusted') return t('cal_warn_protein_adjusted');
    return null;
  };

  // "Your numbers" auto-collapses once there is a plan (the user can still open it);
  // collapsed, it is one line: "84.6 kg · 21% BF · 181 cm · Moderate" (part 7).
  const numbersFoldable = !!plan;
  const numbersOpenEff = !numbersFoldable ? true : (numbersOpen == null ? false : numbersOpen);
  const youNowSummary = useMemo(() => {
    const act = ACTIVITY_LEVELS.find(a => a.value === activity);
    return numbersSummary([
      num(weight) != null ? `${weight} ${wUnit}` : null,
      !isUnknown && num(bodyFat) != null ? `${bodyFat}% ${t('cal_bf_short')}` : null,
      isUnknown ? t(`cal_sex_${sex}`) : null,
      isUnknown && num(age) != null ? `${age} ${t('cal_yr')}` : null,
      num(height) != null ? `${height} ${hUnit}` : null,
      act ? activityParts(t(act.key))[0] : null,
    ]);
  }, [weight, bodyFat, isUnknown, sex, age, height, activity, unit, language]);
  const ex = exampleValues(unit);
  const eg = v => t('cal_eg').replace('{v}', v);

  const toDisplayW = kg => (unit === 'imperial' ? kgToLb(kg) : kg);

  // Display helpers (Graduated): weights to one decimal in the display unit.
  const fmtW = kg => (kg == null ? null : (Math.round(toDisplayW(kg) * 10) / 10).toFixed(1));
  const sortedSnaps = [...snapshots].sort((a, b) => (a.date < b.date ? -1 : 1));
  const lastSnap = sortedSnaps.length ? sortedSnaps[sortedSnaps.length - 1] : null;
  const histAll = [...sortedSnaps].reverse();
  const histRows = showAllW ? histAll : histAll.slice(0, 5); // newest five unless Show all; the chart holds them all
  const tgtValid = num(tgtWeight) != null || num(tgtBF) != null;
  const tgtLow = (() => {
    const tw = num(tgtWeight);
    if (tw == null || !plan?.healthyRange) return false;
    return (unit === 'imperial' ? lbToKg(tw) : tw) < plan.healthyRange.min;
  })();
  const closeTarget = () => { setTargetEditing(false); setShowTgtDatePicker(false); };
  const closeBackfill = () => { setBfOpen(false); setShowBfDatePicker(false); };
  const atEarliest = (rcStartDate || todayISO()) <= earliestStart(todayISO());
  const healthyText = key => t(key)
    .replace('{min}', String(Math.round(toDisplayW(plan.healthyRange.min))))
    .replace('{max}', String(Math.round(toDisplayW(plan.healthyRange.max))))
    .replace('{unit}', wUnit);
  const monthLabels = MONTH_KEYS.map(k => t(k));
  const wiCanSave = num(wiWeight) != null;

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
    const one = v => (v == null ? '—' : isW ? Number(v).toFixed(1) : String(v));
    return (
      <View style={s.tgtMetric} key={kind}>
        <View style={s.rowCenter}>
          <Text style={[s.sec2, s.grow]}>{isW ? t('cal_snap_weight') : t('cal_snap_bodyfat')}</Text>
          <Text style={s.val15}>{one(cur)} → {one(tgt)} {unitLabel}</Text>
        </View>
        {frac != null ? (
          <TargetScale start={disp(startCanon)} goal={tgt} frac={frac} colors={colors} width={CHART_WIDTH} label={one} />
        ) : null}
        {/* reached is a pure current-vs-target fact — free. */}
        {proj.state === 'reached' ? (
          <Text style={s.body}>{t('cal_tgt_reached')}</Text>
        ) : belowRange ? null /* status line suppressed; the range note below carries it */
        : showEta ? (
          proj.state === 'eta' && eta ? (
            <Text style={[s.body, s.tnum]}>{t('cal_tgt_eta').replace('{weeks}', String(eta.weeks)).replace('{when}', eta.when)}</Text>
          ) : proj.state === 'away' ? (
            <Text style={s.body}>{t('cal_tgt_away')}</Text>
          ) : (
            <Text style={s.body}>{t('cal_tgt_no_rate')}</Text>
          )
        ) : (
          // Free: no measured pace — teaser to Premium.
          <TouchableOpacity onPress={() => navigation.navigate('Paywall')} activeOpacity={0.7} accessibilityRole="button">
            <Text style={s.linkU}>{t('cal_tgt_locked_eta')}</Text>
          </TouchableOpacity>
        )}
        {showEta && !belowRange && proj.state === 'eta' && rateInfo ? (
          <Text style={[s.foot2, s.tnum]}>{t('cal_tgt_basis').replace('{from}', fmtDate(rateInfo.firstDate)).replace('{to}', fmtDate(rateInfo.lastDate))}</Text>
        ) : null}
        {belowRange ? (
          <Text style={s.tnote}>{healthyText('cal_tgt_below_range')}</Text>
        ) : isW && plan?.healthyRange ? (
          <Text style={[s.foot2, s.tnum]}>{healthyText('cal_tgt_healthy')}</Text>
        ) : null}
      </View>
    );
  };

  // Your target (part 14, its own block): a weight and/or body-fat goal. Setting a goal +
  // the scale are FREE; the MEASURED timeline is the Premium unlock. Never advisory.
  // Without a target: title, what it is, and "Set a target".
  const renderTargetBlock = (hasTarget) => {
    if (!hasTarget) {
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
        <View style={s.rowCenter}>
          <Text style={[s.head, s.grow]}>{t('cal_tgt_title')}</Text>
          <TouchableOpacity onPress={beginEditTarget} activeOpacity={0.7} style={s.linkHit} accessibilityRole="button">
            <Text style={s.linkU}>{t('cal_tgt_edit')}</Text>
          </TouchableOpacity>
        </View>
        {weightProj ? renderTargetMetric('weight', weightProj, currentWeightKg, target.target_weight_kg, usableWeightRate, premium) : null}
        {bfProj ? renderTargetMetric('bodyfat', bfProj, currentBF, target.target_body_fat_pct, usableBfRate, premium) : null}
        {target.target_date ? (
          <Text style={[s.foot2, s.tnum]}>{t('cal_tgt_date_line').replace('{date}', fmtDate(target.target_date))}</Text>
        ) : null}
      </View>
    );
  };

  // ── Sections (docs/design/prototype.html progressScreen, founder choices 2026-10-02) ──
  // Hero (part 5): weight + daily burn (Estimated / Measured), the since-line, the formula
  // line and "Log today's weight". Once a reality check exists, the MEASURED maintenance is
  // the daily burn; the generic estimate drops to the formula line.
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
            {fmtInt(round10(scoreCheck ? scoreCheck.tdee : plan.tdeeVal))}<Text style={s.unit}> {t('cal_kcal')}</Text>
          </Text>
          <View style={[s.chip, scoreCheck && s.chipMeas]}>
            <Text style={[s.chipText, scoreCheck && s.chipMeasText]}>{scoreCheck ? t('hy_rc_measured_chip') : t('hy_estimated')}</Text>
          </View>
        </View>
      </View>
      <View style={s.gap6}>
        {progressSummary ? (
          <Text style={[s.sec2, s.tnum]}>
            {t('cal_since')} {fmtShort(progressSummary.firstDate)}: {t('cal_snap_weight')} <Text style={s.mono}>{progressSummary.wDelta != null ? `${signed(progressSummary.wDelta)} ${wUnit}` : '—'}</Text>
            {progressSummary.waistDelta != null ? <>{' · '}{t('cal_snap_waist')} <Text style={s.mono}>{signed(progressSummary.waistDelta)} {hUnit}</Text></> : null}
          </Text>
        ) : null}
        <Text style={[s.foot2, s.tnum]}>
          {scoreCheck
            ? `${t('cal_measured_from_check')} · ${t('cal_est')} ${fmtInt(round10(plan.tdeeVal))}`
            : `${t(`cal_eq_${plan.method}`)} · ${t('cal_bmr')} ${fmtInt(round10(plan.bmr))}`}
        </Text>
      </View>
      <TouchableOpacity style={s.btnP} onPress={openWeighIn} activeOpacity={0.85} accessibilityRole="button">
        <Text style={s.btnPText}>{t('cal_log_today_weight')}</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  // Your daily plan (part 15): all three goals side by side (tap to choose), protein,
  // context. When a reality-check exists the goals are recomputed off the MEASURED
  // maintenance through the floored engine (effectiveGoals), so the calorie floor holds.
  const planEl = plan ? (
    <View key="plan" style={s.card}>
      <Text style={s.title}>{t('hy_daily_plan')}</Text>
      <View style={s.goals}>
        {['lose', 'maintain', 'gain'].map(g => {
          const on = goal === g;
          const gc = (effectiveGoals || plan.allGoals)[g];
          return (
            <TouchableOpacity key={g} style={[s.goal, on && s.goalOn]} onPress={() => setGoal(g)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ selected: on }}>
              <Text style={s.cap2}>{t(`cal_goal_${g}`)}</Text>
              <Text style={s.val}>{fmtInt(round10(gc.mid))}</Text>
              <Text style={[s.cap2, s.tnum]}>{g === 'lose' ? '−15–20%' : g === 'gain' ? '+10–15%' : t('cal_tdee')}</Text>
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
        <Text style={[s.foot2, s.tnum]}>{round5(plan.protein.low)}–{round5(plan.protein.high)} · {t(`cal_protein_basis_${plan.protein.basis}${unit === 'imperial' ? '_imp' : ''}`)}</Text>
      </View>
      {/* Context chips — BMI + macros */}
      <View style={s.chips}>
        {plan.bmi != null && plan.healthyRange && (
          <View style={s.chipBox}><Text style={[s.cap2, s.tnum]}>{t('cal_bmi')} {(Math.round(plan.bmi * 10) / 10).toFixed(1)} · {t('cal_healthy_range')} {Math.round(toDisplayW(plan.healthyRange.min))}–{Math.round(toDisplayW(plan.healthyRange.max))} {wUnit}</Text></View>
        )}
        {plan.macros && (
          <View style={s.chipBox}><Text style={[s.cap2, s.tnum]}>{t('cal_fat_g')} ≈ {round5(plan.macros.fatG)} g · {t('cal_carbs_g')} ≈ {round5(plan.macros.carbsG)} g</Text></View>
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
        style={s.foldRowSm}
        activeOpacity={0.7}
      >
        <Text style={[s.sec, s.grow]}>{t('cal_intro_title')}</Text>
        <FoldChevron open={introOpen} color={colors.ink3} />
      </TouchableOpacity>
      {introOpen && <Text style={s.sec2}>{t('cal_intro_body')}</Text>}
      <Text style={s.foot2}>{t('cal_estimate_note')}</Text>
    </View>
  ) : null;

  // Your target (part 14): its own card — right after the hero with numbers, after the
  // reality check before them (prototype order).
  const targetEl = (
    <View key="target" style={s.card}>
      {renderTargetBlock(!!target)}
    </View>
  );

  // Your numbers (part 7) — open with no fold arrow until there is a plan; then folded to
  // one line. The prompt (or why there is no estimate yet) sits under Metric / Imperial.
  const numbersEl = (
    <View key="numbers" style={s.card}>
      {numbersFoldable ? (
        <TouchableOpacity style={s.foldHead} activeOpacity={0.7} onPress={() => setNumbersOpen(!numbersOpenEff)} accessibilityRole="button" accessibilityState={{ expanded: numbersOpenEff }}>
          <View style={[s.grow, s.gap2]}>
            <Text style={s.title}>{t('cal_your_numbers')}</Text>
            {!numbersOpenEff && youNowSummary ? <Text style={[s.foot2, s.tnum]} numberOfLines={2}>{youNowSummary}</Text> : null}
          </View>
          <FoldChevron open={numbersOpenEff} color={colors.ink3} />
        </TouchableOpacity>
      ) : (
        <Text style={s.title}>{t('cal_your_numbers')}</Text>
      )}
      {numbersOpenEff && (
        <>
          <SegmentedBar
            items={[{ key: 'metric', label: t('cal_metric') }, { key: 'imperial', label: t('cal_imperial') }]}
            value={unit}
            onChange={changeUnit}
            style={s.unitBar}
          />
          {!plan ? (
            result && result.sexGated ? (
              <Text style={s.sec2}>{t('cal_sex_gate_body')}</Text>
            ) : result && result.invalid ? (
              <View style={s.warnbox}><Text style={s.warnText}>{t('cal_check_inputs')}</Text></View>
            ) : (
              <Text style={s.sec2}>{t('cal_need_inputs')}</Text>
            )
          ) : null}
          {/* Weight + body fat (or age, on the height/age/sex path) */}
          <View style={s.fieldRow}>
            <View style={s.fldHalf}>
              <Text style={s.fieldLab}>{t('cal_weight')} ({wUnit})</Text>
              <TextInput style={s.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={eg(ex.weight)} placeholderTextColor={colors.ink3} />
            </View>
            {!isUnknown ? (
              <View style={s.fldHalf}>
                <Text style={s.fieldLab}>{t('cal_bodyfat')} (%)</Text>
                <TextInput style={s.input} value={bodyFat} onChangeText={setBodyFat} keyboardType="decimal-pad" placeholder={eg(ex.bodyFat)} placeholderTextColor={colors.ink3} />
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
                  style={s.unitBar}
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
            <TextInput style={s.input} value={waist} onChangeText={setWaist} keyboardType="decimal-pad" placeholder={eg(ex.waist)} placeholderTextColor={colors.ink3} />
          </View>
          <Text style={s.foot2}>{t('cal_waist_hint')}</Text>
          <View style={s.sep} />
          {/* Height is universal (BMI, waist-to-height, and the Mifflin fallback all need it). */}
          <View style={s.fld}>
            <Text style={s.fieldLab}>{t('cal_height')} ({hUnit})</Text>
            <TextInput style={s.input} value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder={eg(ex.height)} placeholderTextColor={colors.ink3} />
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
            <Text style={s.fieldHint}>{t(`cal_bf_${bfSource}_hint`)}</Text>
          </View>
          {/* Activity is an input too — it collapses with "Your numbers". */}
          <View style={s.fld}>
            <View style={s.actHead}>
              <FeatureIcon name="calc_bolt" size={18} color={colors.ink2} />
              <Text style={s.head}>{t('cal_activity')}</Text>
            </View>
            <View style={s.actlist}>
              {ACTIVITY_LEVELS.map((a, i) => {
                const on = activity === a.value;
                const prevOn = i > 0 && ACTIVITY_LEVELS[i - 1].value === activity;
                const parts = activityParts(t(a.key));
                return (
                  <View key={a.value}>
                    {i > 0 ? <View style={[s.actSep, (on || prevOn) && s.actSepHidden]} /> : null}
                    <TouchableOpacity style={[s.actRow, on && s.actRowOn]} onPress={() => setActivity(a.value)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ selected: on }}>
                      <View style={[s.grow, s.gap2]}>
                        <Text style={s.head}>{parts[0]}</Text>
                        {parts.length > 1 ? <Text style={s.sec2}>{parts[1]}</Text> : null}
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

  // Reality check (parts 8-12; Premium, or a free user's 7 free days — FL-41): how the
  // daily burn becomes Measured, from the user's own weigh-ins and food log.
  const rcHead = (
    <View style={s.rowC}>
      <FeatureIcon name="calc_bars" size={22} color={colors.ink2} />
      <Text style={[s.title, s.grow]}>{t('cal_rc_title')}</Text>
      {!rcAllowed ? <Text style={s.otag}>{t('paywall_premium')}</Text> : null}
    </View>
  );
  const howRow = (
    <TouchableOpacity style={s.foldRow} activeOpacity={0.7} onPress={() => setRcExplain(true)} accessibilityRole="button">
      <Text style={[s.head, s.grow]}>{t('nutri_how')}</Text>
      <RowChevron color={colors.tick} />
    </TouchableOpacity>
  );
  const stopLink = (
    <TouchableOpacity onPress={stopRealityCheck} style={s.linkHit} activeOpacity={0.7} accessibilityRole="button">
      <Text style={s.linkRisk}>{t('cal_rc_stop')}</Text>
    </TouchableOpacity>
  );
  // In progress: the status line, the start weigh-in, the 7-day rule (or the outcome note).
  const rcStatusLines = rcStart ? (
    <>
      <Text style={[s.body, s.tnum]}>
        {outcome.state === 'due' ? t('cal_rc_due') : t('cal_rc_sb_progress').replace('{date}', fmtDate(rcRemindOn))}
      </Text>
      <Text style={[s.sec2, s.tnum]}>
        ①  <Text style={s.mono}>{fmtW(rcStart.weightKg)} {wUnit}</Text> · {fmtShort(rcStart.date)}
      </Text>
      {outcomeResult && outcomeResult.status !== 'ok' ? (
        <Text style={s.sec2}>{t(`cal_rc_${outcomeResult.status}`)}</Text>
      ) : foodRun && foodRun.ok ? (
        <Text style={[s.sec2, s.tnum]}>{t('nutri_run_summary').replace('{avg}', fmtInt(foodRun.avgKcal)).replace('{d}', String(foodRun.days))}</Text>
      ) : (
        <Text style={[s.sec2, s.tnum]}>{t('nutri_run_progress').replace('{n}', String(Math.min(foodRun ? foodRun.current : 0, MIN_RUN_DAYS)))}</Text>
      )}
    </>
  ) : null;
  const soFarEmpty = !!soFar && soFar.rows.every(r => r.state !== 'food');
  const rcEl = (
    <View key="rc" style={s.card}>
      {rcHead}
      {!rcAllowed ? (
        // Free plan (part 11): explainer first, then Unlock with Premium. A check that is
        // already running keeps its weigh-in (FX-15) and Stop (never behind the paywall).
        <>
          {rcStatusLines || <Text style={s.sec2}>{t('cal_rc_sub')}</Text>}
          {rcStart && rcAccess.canLogWeighIn ? (
            <TouchableOpacity style={s.btnO} onPress={openWeighIn} activeOpacity={0.75} accessibilityRole="button">
              <Text style={s.btnOText}>{t('cal_log_today_weight')}</Text>
            </TouchableOpacity>
          ) : null}
          {howRow}
          {(rcStart || realityLog.length > 0) ? stopLink : null}
        </>
      ) : rcStart && !checkSaved ? (
        // Part 8: in progress — no fold to open; Start over / Stop always in view.
        <>
          {rcStatusLines}
          <TouchableOpacity style={s.foldRow} activeOpacity={0.7} onPress={() => setSoFarOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: soFarOpen }}>
            <Text style={[s.body, s.grow]}>{t('nutri_check_label')}</Text>
            <FoldChevron open={soFarOpen} color={colors.ink3} />
          </TouchableOpacity>
          {soFarOpen && soFar ? (
            soFarEmpty && soFar.rows.length === 1 ? (
              <Text style={s.sec2}>{t('cal_rc_sofar_day1').replace('{n}', String(rcDayN)).replace('{total}', String(REALITY_CHECK_DAYS))}</Text>
            ) : (
              <View>
                {soFar.rows.map((r, i) => (
                  <View key={r.date} style={[s.dayRow, i > 0 && s.dayRowSep]}>
                    <Text style={[s.sec, s.tnum, s.dayDate]}>{fmtShort(r.date)}</Text>
                    <Text style={[s.sec2, s.tnum, s.grow]}>
                      {r.state === 'food'
                        ? t(r.items === 1 ? 'cal_rc_sofar_row_one' : 'cal_rc_sofar_row').replace('{kcal}', fmtInt(r.kcal)).replace('{n}', String(r.items))
                        : r.state === 'not_recorded' ? t('nutri_marked_not_recorded') : t('nutri_nothing_logged')}
                    </Text>
                  </View>
                ))}
                {soFar.run.days > 0 ? (
                  <Text style={[s.foot2, s.tnum, s.runLine]}>{t('cal_rc_sofar_run').replace('{d}', String(soFar.run.days)).replace('{kcal}', fmtInt(soFar.run.avgKcal))}</Text>
                ) : null}
              </View>
            )
          ) : null}
          <FoodReminderRow />
          <View style={s.linkRow}>
            <TouchableOpacity onPress={confirmResetRealityCheck} style={s.linkHit} accessibilityRole="button">
              <Text style={s.linkU}>{t('cal_rc_reset')}</Text>
            </TouchableOpacity>
            {stopLink}
          </View>
        </>
      ) : scoreCheck ? (
        // Part 10: the result as a sentence, the checks over time, and the next check.
        <>
          <Text style={[s.body, s.tnum]}>{t('cal_rc_result_prefix')} <Text style={s.mono}>{fmtInt(round10(scoreCheck.tdee))} {t('cal_kcal')}/{t('cal_day')}</Text>.</Text>
          <View style={s.gap6}>
            <Text style={s.cap2}>{t('cal_rc_log_title')}</Text>
            {[...realityLog].reverse().map((c) => (
              <View key={c.date} style={s.logRow}>
                <Text style={[s.sec, s.tnum, s.grow]}>{fmtShort(c.date)}</Text>
                <Text style={[s.val15, s.ink2Text]}>
                  {c.ratePerWeekKg != null
                    ? `${c.ratePerWeekKg >= 0 ? '−' : '+'}${rateDisplay(c.ratePerWeekKg)} ${wUnit}/${t('cal_week')}`
                    : '—'}
                </Text>
                <Text style={s.val15}>{fmtInt(round10(c.tdee))} {t('cal_kcal')}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={s.btnO} onPress={openRcStart} activeOpacity={0.75} accessibilityRole="button">
            <Text style={s.btnOText}>{t('cal_rc_next').replace('{n}', String(REALITY_CHECK_DAYS))}</Text>
          </TouchableOpacity>
          {stopLink}
        </>
      ) : (
        // Part 9: not run yet — the row opens the start sheet.
        <>
          <Text style={s.sec2}>{t('cal_rc_sub')}</Text>
          <TouchableOpacity style={s.foldRow} activeOpacity={0.7} onPress={openRcStart} accessibilityRole="button">
            <Text style={[s.body, s.grow]}>{t('cal_rc_sb_run')}</Text>
            <RowChevron color={colors.tick} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  // Weigh-ins (part 13): folded with a one-line summary; open: the trend chart, the newest
  // weigh-ins (Show all / Show less), and + Add a past weigh-in. Never paywalled (FX-15).
  const weighEl = (
    <View key="weigh" style={s.card}>
      <TouchableOpacity style={s.foldHead} activeOpacity={0.7} onPress={() => setWeighOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: weighOpen }}>
        <View style={[s.grow, s.gap2]}>
          <Text style={s.title}>{t('cal_weighins_title')}</Text>
          {lastSnap ? (
            <Text style={[s.foot2, s.tnum]}>
              {t('cal_weighins_summary').replace('{n}', String(sortedSnaps.length)).replace('{date}', fmtShort(lastSnap.date)).replace('{w}', lastSnap.weightKg != null ? `${fmtW(lastSnap.weightKg)} ${wUnit}` : '—')}
            </Text>
          ) : null}
        </View>
        <FoldChevron open={weighOpen} color={colors.ink3} />
      </TouchableOpacity>
      {weighOpen ? (
        <>
          {snapPointCount >= 2 ? (
            <ProgressChart series={chartSeries} locale={locale} width={CHART_WIDTH} />
          ) : (
            <Text style={s.sec2}>{t('cal_weighins_need_more')}</Text>
          )}
          {/* The weigh-ins as rows (date · weight · body fat · waist); all of them are on the chart. */}
          {histRows.length > 0 ? (
            <View>
              <View style={s.histHead}>
                <Text style={[s.cap2, s.histDate]}>{t('cal_tgt_backfill_date')}</Text>
                <Text style={[s.cap2, s.histW]}>{t('cal_snap_weight')}</Text>
                <Text style={[s.cap2, s.histB]}>{t('cal_snap_bodyfat')}</Text>
                <Text style={[s.cap2, s.histC]}>{t('cal_snap_waist')}</Text>
              </View>
              {histRows.map(r => (
                <View key={r.date} style={s.histRow}>
                  <Text style={[s.sec, s.tnum, s.histDate]}>{fmtShort(r.date)}</Text>
                  <Text style={[s.val15, s.histW]}>{r.weightKg != null ? `${fmtW(r.weightKg)} ${wUnit}` : '—'}</Text>
                  <Text style={[s.val15, s.histB]}>{r.bodyFatPct != null ? `${Math.round(r.bodyFatPct * 10) / 10}%` : '—'}</Text>
                  <Text style={[s.val15, s.histC]}>{r.waistCm != null ? `${Math.round((unit === 'imperial' ? cmToIn(r.waistCm) : r.waistCm) * 10) / 10} ${hUnit}` : '—'}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {/* Backfill a past weigh-in — for someone who started before installing. */}
          <View style={s.rowCenter}>
            <TouchableOpacity onPress={() => setBfOpen(true)} activeOpacity={0.7} style={[s.linkHit, s.grow]} accessibilityRole="button">
              <Text style={s.linkU}>{t('cal_tgt_backfill_add')}</Text>
            </TouchableOpacity>
            {histAll.length > 5 ? (
              <TouchableOpacity onPress={() => setShowAllW(v => !v)} activeOpacity={0.7} style={s.linkHit} accessibilityRole="button">
                <Text style={s.linkU}>{t(showAllW ? 'cal_show_less' : 'cal_show_all')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );

  return (
    <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={s.centered} keyboardShouldPersistTaps="handled">
      {header}
      {/* Order (part 4 = the prototype's progressScreen; part 14: Your target is its own block).
          Keyed, so a card that moves when the plan appears keeps its state (no remount). */}
      {plan
        ? [heroEl, targetEl, planEl, rcEl, weighEl, numbersEl]
        : [numbersEl, rcEl, targetEl, weighEl]}

      {/* The disclaimer qualifies every number on this screen. */}
      <Text style={s.disclaimer}>{t('cal_disclaimer')}</Text>

      {/* Understand the numbers + Sources & references (shared with the Journey dashboard). */}
      <LearnBlock />

      {/* Log today's weight (part 6, prototype weighin sheet). */}
      <SheetModal visible={wiOpen} onClose={closeWeighIn} s={s}>
        <View style={s.sheetHeadL}>
          <Text style={[s.title, s.grow]}>{t('cal_log_today_weight')}</Text>
          <TouchableOpacity onPress={closeWeighIn} style={s.sheetSideEnd} accessibilityRole="button">
            <Text style={s.txtBtn}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
        <View style={s.fieldRow}>
          <View style={s.fldHalf}>
            <Text style={s.fieldLab}>{t('cal_snap_weight')} ({wUnit})</Text>
            <TextInput style={s.input} value={wiWeight} onChangeText={setWiWeight} keyboardType="decimal-pad" placeholder={fmtW(currentWeightKg) || '—'} placeholderTextColor={colors.ink3} />
          </View>
          <View style={s.fldHalf}>
            <Text style={s.fieldLab}>{t('cal_snap_bodyfat')} (%) · {t('cal_tgt_optional')}</Text>
            <TextInput style={s.input} value={wiBf} onChangeText={setWiBf} keyboardType="decimal-pad" placeholder={currentBF != null ? String(Math.round(currentBF * 10) / 10) : '—'} placeholderTextColor={colors.ink3} />
          </View>
        </View>
        <View style={s.fld}>
          <Text style={s.fieldLab}>{t('cal_waist')} ({hUnit}) · {t('cal_optional')}</Text>
          <TextInput style={s.input} value={wiWaist} onChangeText={setWiWaist} keyboardType="decimal-pad" placeholder={waist || '—'} placeholderTextColor={colors.ink3} />
        </View>
        <Text style={s.foot2}>{t('cal_log_today_note')}</Text>
        <TouchableOpacity style={[s.btnP, !wiCanSave && s.btnDim]} onPress={saveTodayWeighIn} disabled={!wiCanSave} accessibilityRole="button" accessibilityState={{ disabled: !wiCanSave }}>
          <Text style={s.btnPText}>{t('save')}</Text>
        </TouchableOpacity>
      </SheetModal>

      {/* Reality check start (part 9, prototype rcStartSheet). */}
      <SheetModal visible={rcStartOpen} onClose={() => setRcStartOpen(false)} s={s}>
        <View style={s.sheetHead}>
          <TouchableOpacity onPress={() => setRcStartOpen(false)} style={s.sheetSide} accessibilityRole="button">
            <Text style={s.txtBtn}>{t('cancel')}</Text>
          </TouchableOpacity>
          <Text style={s.sheetTitle} numberOfLines={2}>{t('cal_rc_title')}</Text>
          <View style={s.sheetSide} />
        </View>
        <Text style={s.sec2}>{t('cal_rc_sub')}</Text>
        <View style={s.fld}>
          <Text style={s.fieldLab}>{t('cal_rc_start_on')}</Text>
          <View style={s.stepper}>
            <TouchableOpacity style={[s.stepBtn, atEarliest && s.stepOff]} onPress={() => shiftRcStartDate(-1)} disabled={atEarliest} accessibilityRole="button" accessibilityLabel={t('nutri_date_earlier')}>
              <StepChev dir="left" color={colors.ink} />
            </TouchableOpacity>
            <Text style={s.stepVal}>{rcStartDate ? fmtDate(rcStartDate) : t('nutri_day_today')}</Text>
            <TouchableOpacity style={[s.stepBtn, !rcStartDate && s.stepOff]} onPress={() => shiftRcStartDate(1)} disabled={!rcStartDate} accessibilityRole="button" accessibilityLabel={t('nutri_date_later')}>
              <StepChev dir="right" color={colors.ink} />
            </TouchableOpacity>
          </View>
          <Text style={s.fieldLab}>{t('cal_rc_start_on_hint')}</Text>
        </View>
        <View style={s.fld}>
          <Text style={s.fieldLab}>{t('cal_snap_weight')} ({wUnit})</Text>
          <TextInput style={s.input} value={rcThen} onChangeText={setRcThen} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.ink3} />
        </View>
        <TouchableOpacity style={[s.btnP, num(rcThen) == null && s.btnDim]} onPress={startRealityCheck} disabled={num(rcThen) == null} accessibilityRole="button">
          <Text style={s.btnPText}>{t('cal_rc_start_btn')}</Text>
        </TouchableOpacity>
        <Text style={s.foot2}>{t('cal_rc_start_hint').replace('{n}', String(REALITY_CHECK_DAYS))}</Text>
      </SheetModal>

      {/* Add a past weigh-in (part 13, prototype pastSheet). */}
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
            <Text style={s.body}>{fmtLong(bfDate)}</Text>
            <FeatureIcon name="calendar" size={20} color={colors.ink2} />
          </TouchableOpacity>
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
        <TouchableOpacity style={[s.btnP, !num(bfWeight) && s.btnDim]} onPress={saveBackfillWeighIn} disabled={!num(bfWeight)} accessibilityRole="button">
          {bfMsg ? (
            <View style={s.savedRow}>
              <CheckMark style={s.btnPText} />
              <Text style={s.btnPText}>{t('cal_snap_saved')}</Text>
            </View>
          ) : <Text style={s.btnPText}>{t('cal_tgt_backfill_save')}</Text>}
        </TouchableOpacity>
        <DTPickerSheet visible={showBfDatePicker} title={t('cal_tgt_backfill_date')} doneLabel={t('done')} onDone={() => setShowBfDatePicker(false)}>
          <DTWheel
            columns={dateColumns(bfDate, new Date(), monthLabels)}
            onChange={(col, i) => setBfDate(clampPast(dateAfter(bfDate, new Date(), col, i)))}
          />
        </DTPickerSheet>
      </SheetModal>

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
            <Text style={s.body}>{tgtDate ? fmtLong(tgtDate) : t('cal_tgt_no_date')}</Text>
            <FeatureIcon name="calendar" size={20} color={colors.ink2} />
          </TouchableOpacity>
          {tgtDate ? (
            <TouchableOpacity onPress={() => setTgtDate(null)} activeOpacity={0.7} style={s.linkHitSm} accessibilityRole="button">
              <Text style={[s.linkU, s.linkSm]}>{t('cal_tgt_remove_date')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {target ? (
          <TouchableOpacity style={s.dangerBtn} onPress={clearTargetConfirm} activeOpacity={0.7} accessibilityRole="button">
            <Text style={s.dangerText}>{t('cal_tgt_remove')}</Text>
          </TouchableOpacity>
        ) : null}
        <DTPickerSheet visible={showTgtDatePicker} title={t('cal_tgt_date')} doneLabel={t('done')} onDone={() => { if (!tgtDate) setTgtDate(clampFuture(todayISO())); setShowTgtDatePicker(false); }}>
          <DTWheel
            columns={dateColumns(tgtDate || todayISO(), new Date(), monthLabels)}
            onChange={(col, i) => setTgtDate(clampFuture(dateAfter(tgtDate || todayISO(), new Date(), col, i)))}
          />
        </DTPickerSheet>
        {/* Remove target asks first: inside the editor so it shows over this sheet. */}
        <DTSheet config={targetEditing ? confirm : null} onClose={() => setConfirm(null)} />
      </SheetModal>

      {/* Start over? / Stop reality check? / Set your sex (DoseTrace sheets, part 12). */}
      <DTSheet config={targetEditing ? null : confirm} onClose={() => setConfirm(null)} />

      {/* Free plan: "See how it works" — the explainer first, then Unlock with Premium (part 11). */}
      <FeaturePreviewSheet featureKey={rcExplain ? 'reality' : null} onClose={() => setRcExplain(false)} onUnlock={() => { setRcExplain(false); navigation.navigate('Paywall', { source: 'reality_check' }); }} />
    </ScrollView>
  );
}

// The stepper arrows of the start sheet (prototype: 20 pt, the 24 grid, stroke 1.8).
function StepChev({ dir, color }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// The target as a graduated scale (prototype targetScale, DESIGN.md §5: no rounded progress
// bars): one tick every 0.5 from the start (left) to the goal (right), majors on whole units;
// the covered distance in data blue with onData ticks inside; the "now" marker in ink; the
// start and goal values under the ends. Drawn in a 320 x 44 box scaled to the card width.
function TargetScale({ start, goal, frac, colors, width, label }) {
  const W = 320, H = 44, x0 = 12, x1 = W - 12;
  const X = v => x0 + ((start - v) / (start - goal)) * (x1 - x0);
  const xf = x0 + Math.max(0, Math.min(1, frac)) * (x1 - x0);
  const ticks = targetTicks(start, goal);
  return (
    <Svg width="100%" height={Math.round(((width || W) * H) / W)} viewBox={`0 0 ${W} ${H}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={x0} y={10} width={Math.max(0, xf - x0)} height={12} rx={2} fill={colors.data} />
      {ticks.map((tk, i) => {
        const x = X(tk.v);
        return <Line key={i} x1={x} x2={x} y1={tk.major ? 6 : 12} y2={26} stroke={x <= xf ? colors.onData : colors.tick} strokeWidth={tk.major ? 1.4 : 0.9} />;
      })}
      <SvgText x={x0} y={40} fontFamily={MONO['400']} fontSize={11} fill={colors.ink3}>{label(start)}</SvgText>
      <SvgText x={x1} y={40} textAnchor="end" fontFamily={MONO['400']} fontSize={11} fill={colors.ink}>{label(goal)}</SvgText>
      <Rect x={Math.min(x1 - 4, Math.max(x0, xf - 2))} y={3} width={4} height={26} rx={1.5} fill={colors.ink} />
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
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 40, gap: 14 },
  grow: { flex: 1, minWidth: 0 },
  gap2: { gap: 2 },
  gap6: { gap: 6 },
  tnum: { fontVariant: ['tabular-nums'] },
  card: { backgroundColor: c.raised, borderRadius: 24, padding: 18, gap: 12 },
  rowC: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sep: { height: 1, backgroundColor: c.line },
  // type roles (DESIGN.md §3; Geist is applied automatically from 22 pt)
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.ink, letterSpacing: -0.2 },
  head: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  body: { fontSize: 17, lineHeight: 22, color: c.ink },
  sec: { fontSize: 15, lineHeight: 20, color: c.ink },
  sec2: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  foot2: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  cap2: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: c.ink2 },
  ink2Text: { color: c.ink2 },
  val: { fontFamily: MONO['500'], fontSize: 17, lineHeight: 22, color: c.ink, fontVariant: ['tabular-nums'] },
  val15: { fontFamily: MONO['500'], fontSize: 15, lineHeight: 19, color: c.ink, fontVariant: ['tabular-nums'] },
  mono: { fontFamily: MONO['500'], color: c.ink, fontVariant: ['tabular-nums'] },
  tnote: { fontSize: 13, lineHeight: 18, color: c.attention },
  // hero (prototype heroCard): two 56 pt numbers, units in mono
  heroPair: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 18 },
  heroCol: { flexGrow: 1, flexBasis: 140, minWidth: 0, gap: 6 },
  heroColStack: { flexBasis: '100%' }, // side-by-side numbers stack from ~130% text size
  display: { fontSize: 56, lineHeight: 62, fontWeight: '500', color: c.ink, letterSpacing: -1.6, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: MONO['400'], fontSize: 13, fontWeight: '400', color: c.ink3, letterSpacing: 0 },
  chip: { alignSelf: 'flex-start', minHeight: 26, borderRadius: 13, borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, paddingVertical: 2, justifyContent: 'center' },
  chipText: { fontSize: 12, fontWeight: '500', color: c.ink2 },
  chipMeas: { borderColor: c.data },
  chipMeasText: { color: c.data },
  // target
  tgtBlock: { gap: 12 },
  tgtMetric: { gap: 12 },
  // daily plan
  goals: { flexDirection: 'row', gap: 8 },
  goal: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 10, gap: 2 },
  goalOn: { borderWidth: 1.5, borderColor: c.ink, padding: 9.5 },
  cell: { backgroundColor: c.well, borderRadius: 14, padding: 12, gap: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipBox: { borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  warnbox: { borderWidth: 1, borderColor: c.attention, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  warnText: { fontSize: 15, lineHeight: 20, color: c.ink },
  // prototype .fh rows: 60 high, gap 12, a line above inside a card
  foldRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderTopWidth: 1, borderTopColor: c.line },
  foldRowSm: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40, borderTopWidth: 1, borderTopColor: c.line },
  foldHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  // inputs
  unitBar: { alignSelf: 'flex-start' },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fld: { gap: 10 },
  fldHalf: { flex: 1, minWidth: 0, gap: 10 },
  fieldLab: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },
  fieldHint: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },
  input: { backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: c.ink, fontVariant: ['tabular-nums'] },
  inputLocked: { backgroundColor: c.well, color: c.ink2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { alignSelf: 'flex-start', minHeight: 36, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
  pillOn: { borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.raised, paddingHorizontal: 13.5 },
  pillText: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  pillTextOn: { color: c.ink, fontWeight: '600' },
  actHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  actlist: { borderWidth: 1, borderColor: c.line, borderRadius: 16, overflow: 'hidden' },
  actRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 2, borderColor: c.raised, borderRadius: 16 },
  actRowOn: { borderColor: c.ink },
  actSep: { height: 1, backgroundColor: c.line },
  actSepHidden: { backgroundColor: c.raised },
  // actions
  btnP: { minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnPText: { color: c.onAct, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  btnO: { minHeight: 50, borderRadius: 25, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnOText: { color: c.ink, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  // disabled = the same button dimmed (prototype .btn.obdim, opacity .35)
  btnDim: { opacity: 0.35 },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  linkU: { fontSize: 17, lineHeight: 22, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  linkSm: { fontSize: 13, lineHeight: 18 },
  linkRisk: { fontSize: 17, lineHeight: 22, color: c.risk, textDecorationLine: 'underline', textDecorationColor: c.risk },
  linkHit: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkHitSm: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 24 },
  otag: { borderWidth: 1, borderColor: c.line, color: c.ink2, borderRadius: 12, minHeight: 24, lineHeight: 20, paddingHorizontal: 9, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  // reality check
  stepper: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised },
  stepBtn: { width: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  stepOff: { opacity: 0.35 },
  stepVal: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: c.ink, fontVariant: ['tabular-nums'] },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 10 },
  dayRowSep: { borderTopWidth: 1, borderTopColor: c.line },
  dayDate: { width: 64 },
  runLine: { paddingTop: 4 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8 },
  // weigh-ins history (prototype .hist: 1 / 1 / 0.9 / 0.8)
  histHead: { flexDirection: 'row', paddingBottom: 9 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.line },
  histDate: { flex: 1, minWidth: 0 },
  histW: { flex: 1, minWidth: 0, textAlign: 'right' },
  histB: { flex: 0.9, minWidth: 0, textAlign: 'right' },
  histC: { flex: 0.8, minWidth: 0, textAlign: 'right' },
  datebtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.well },
  dangerBtn: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  dangerText: { fontSize: 17, fontWeight: '600', color: c.risk },
  // footer
  disclaimer: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },
  // sheets (prototype .scrim.bot / .sheet.bsheet)
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end', paddingHorizontal: 8, paddingTop: 48, paddingBottom: 30 },
  sheet: { backgroundColor: c.raised, borderRadius: 26, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', maxHeight: '100%', overflow: 'hidden' },
  sheetBody: { padding: 20, gap: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  sheetHeadL: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  sheetSide: { minWidth: 52, minHeight: 44, justifyContent: 'center' },
  sheetSideEnd: { minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  sheetTitle: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  txtBtn: { fontSize: 17, color: c.ink },
  txtBtnStrong: { fontSize: 17, fontWeight: '600', color: c.ink },
  txtOff: { color: c.ink3 },
});
