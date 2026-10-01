import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { Analytics } from '../lib/analytics';
import { syncVialAlerts, scheduleDoseReminder, cancelTodaysDoseReminders, cancelDoseReminder, syncRealityCheckReminder, syncFoodLogReminder, REALITY_CHECK_DAYS } from '../lib/notifications';
import { getRealityStart, clearRealityStart } from '../lib/realityCheck';
import {
  getActiveProtocols, getActiveVials, getVialById, getTodayLogs, getTakenLogsSince, getLogsSince,
  insertDoseLog, deleteDoseLog, updateDoseLog, updateVial, insertVial, updateProtocol,
  getProtocolById, hardDeleteOldProtocols, softDeleteProtocol, deactivateVialsByProtocol,
  getBiomarkers,
} from '../lib/database';
import { requestSync, addSyncListener } from '../lib/sync';
import { scanMissedDoses, recordDoseTaken, recordSkipPending, getMissedWatermark, isDoseAlreadyLogged } from '../lib/doseActions';
import { pendingFromYesterday, pendingPromptFor } from '../lib/pendingYesterday';
import { planUndoTake } from '../lib/markTaken';
import { planSitePickerAction } from '../lib/sitePickerActions';
import { needsSiteQuestion, newQuestion, commitOpts, loadQuestions, saveQuestion, dropQuestion, onQuestionsChanged, reminderCancelCount } from '../lib/siteQuestion';
import BodyMapModal from './components/BodyMapModal';
import { summarizeStored } from '../lib/injectionSites';
import { dosesPerVial, computeDraw } from '../lib/doseMath';
import { adherenceRings } from '../lib/adherenceRings';
import TodayTracker from './components/TodayTracker';
import SyringeScale from './components/SyringeScale';
import { newVialRecords } from '../lib/newVial';
import { supplyState } from '../lib/supplyLow';
import { DEFAULT_VALID_DAYS, daysUntilExpiry, expiryColor } from '../lib/vialExpiry';
import { formatTime } from '../lib/timeFormat';
import { friendlyError } from '../lib/friendlyError';
import { useTheme } from '../lib/theme';
import FeatureIcon from '../components/FeatureIcon';
import FoodLogHero from './components/FoodLogHero';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedProps, useAnimatedStyle, useReducedMotion,
  withTiming, withDelay, withSequence, Easing,
} from 'react-native-reanimated';
import { AnimatedNumber, lightHaptic, eInOutSine } from '../components/motion';

const ACircle = Animated.createAnimatedComponent(Circle);
const APath = Animated.createAnimatedComponent(Path);
const DROP_D = 'M 0 -7 C 3 -2 4.5 0.5 4.5 2.5 A 4.5 4.5 0 0 1 -4.5 2.5 C -4.5 0.5 -3 -2 0 -7 Z';
const RING_R = 24;
const RING_CIRC = 2 * Math.PI * RING_R;
const measureWin = (ref) => new Promise((res) => {
  if (!ref?.current?.measureInWindow) { res(null); return; }
  ref.current.measureInWindow((x, y, w, h) => res({ x, y, w, h }));
});

// "Mark taken" — presses, turns into a check, and hands its on-screen position
// to the parent so a drop can travel from here into the progress ring. Keyed by
// the taken count, so a multi-dose protocol gets a fresh button per dose.
function TakeButton({ label, takenLabel, onTake, s, colors, askFirst }) {
  const ref = useRef(null);
  const [ok, setOk] = useState(false);
  const press = useSharedValue(1);
  const chk = useSharedValue(0);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const chkProps = useAnimatedProps(() => ({ strokeDashoffset: 16 * (1 - chk.value) }));
  const onPress = () => {
    if (ok) return;
    lightHaptic();
    // S-25: an injectable is asked where it was injected first — the button stays
    // "Mark taken" until the answer writes the dose (Cancel leaves it as it was).
    if (askFirst) { onTake(null); return; }
    press.value = withSequence(withTiming(0.96, { duration: 90 }), withTiming(1, { duration: 150 }));
    chk.value = withDelay(90, withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }));
    setOk(true);
    // The dose write must not hang on a layout callback: if the measurement
    // doesn't come back promptly, take without the flight animation.
    let fired = false;
    const fire = (rect) => { if (fired) return; fired = true; onTake(rect); };
    if (ref.current?.measureInWindow) ref.current.measureInWindow((x, y, w, h) => fire({ x, y, w, h }));
    setTimeout(() => fire(null), 150);
  };
  return (
    <Animated.View style={[s.doseBtnPrimaryWrap, btnStyle]}>
      <TouchableOpacity ref={ref} style={[s.doseBtn, ok ? s.doseBtnOk : s.doseBtnPrimary, s.doseBtnFill]} onPress={onPress} activeOpacity={0.85} disabled={ok}>
        <View style={s.doseBtnRow}>
          {ok && (
            <Svg width={15} height={15} viewBox="0 0 16 16">
              <APath d="M3.5 8.5 L6.8 11.5 L12.5 5" fill="none" stroke={colors.successSoftText} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={16} animatedProps={chkProps} />
            </Svg>
          )}
          <Text style={[s.doseBtnPrimaryText, ok && { color: colors.successSoftText }]}>{ok ? takenLabel : label}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
import {
  sortedDoseTimes, expectedDosesOn, nextDueDate, existedOn, toPastDateString, nextDoseAt, frequencyLabelFor,
} from '../lib/schedule';
import CheckMark, { CrossMark } from '../components/CheckMark';

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
const localDayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };
const WEEKDAY_KEYS = ['today_sun','today_mon','today_tue','today_wed','today_thu','today_fri','today_sat'];

const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr',
  'month_may', 'month_jun', 'month_jul', 'month_aug',
  'month_sep', 'month_oct', 'month_nov', 'month_dec',
];

// ── Today alerts config ────────────────────────────────────────
const BLOODWORK_INTERVAL_DAYS = 182; // ~6 months
const VIAL_EXPIRY_SOON_DAYS = 7;     // flag a vial expiring within this many days
const ALERT_SNOOZE_KEY = 'dosetrace_alert_snooze';
// How long "delete" hides a DERIVED alert (reality-check delete cancels instead).
const ALERT_SNOOZE_MS = {
  bloodwork_due: 14 * 86400000,
  supply_low: 3 * 86400000,
  vial_expiry: 2 * 86400000,
};

// ── Schedule math ──────────────────────────────────────────────
// Extracted to lib/schedule.js (pure + unit-tested). Imported above.

export default function TodayScreen() {
  const { t, language, timeFormat } = useLanguage();
  const { colors, isDark } = useTheme();
  const navigation = useNavigation();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [protocols, setProtocols] = useState([]);
  const [vials, setVials] = useState({}); // keyed by protocol_id
  const [takenCounts, setTakenCounts] = useState({}); // { protocol_id: count } — outcome 'Taken' only
  const [skippedCounts, setSkippedCounts] = useState({}); // { protocol_id: count } — outcome 'Skipped' only
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [streak, setStreak] = useState(0);
  const [monthConsistency, setMonthAdherence] = useState(0);
  const [weekDots, setWeekDots] = useState([]);
  const [rcStart, setRcStart] = useState(null); // open reality-check weigh-in → an alert
  const [latestLabDate, setLatestLabDate] = useState(null); // most recent bloodwork report_date
  const [alertSnooze, setAlertSnooze] = useState({}); // { alertId: untilTimestamp } — dismissed derived alerts
  const actionInProgressRef = useRef(false); // ref, not state — must block synchronously on double-tap
  const pendingFxRef = useRef(new Set()); // deferred follow-ups of recent takes (see markTaken)
  // Site questions wait their turn (S-25): one picker at a time, and never together with
  // another modal (vial prompt, "still going?") — iOS shows one modal at a time.
  const siteQueueRef = useRef([]);
  const bodyMapOpenRef = useRef(false);
  const openQuestionRef = useRef(null); // key of the site question on screen (S-25)
  const vialPromptOpenRef = useRef(false); // one modal at a time: questions wait for the vial prompt
  const vialPromptPendingRef = useRef(false); // set synchronously by markTaken when the vial prompt will show
  const vialTimerRef = useRef(null); // the delayed open of the vial prompt (cancelled when it closes)
  const inactivePromptOpenRef = useRef(false); // the "still going?" prompt is up
  const focusedRef = useRef(false); // questions open only on Today, never over another tab
  const undoneIdsRef = useRef(new Set()); // log ids already undone (never undo twice, never write a site on them)
  const takeNoticeT = useRef(null);
  const [takeReset, setTakeReset] = useState({}); // per protocol: bumps to re-mount a TakeButton whose dose did not save
  const resetTake = (protocolId) => setTakeReset(prev => ({ ...prev, [protocolId]: (prev[protocolId] || 0) + 1 }));
  const [undoData, setUndoData] = useState(null);
  // A-40: yesterday's un-logged slots, shown until slot + 12 h (lib/pendingYesterday).
  const [pendingYest, setPendingYest] = useState([]);
  const [snoozeOpen, setSnoozeOpen] = useState(null); // alert id whose "remind me" strip is open // { logId, protocolId, vialId, prevDosesTaken, timer }
  const [protocolStreaks, setProtocolStreaks] = useState({}); // { protocol_id: number }
  // Today v2.1: the tracker's rings (lib/adherenceRings), today's taken doses (the Taken
  // line) and the folded Tomorrow / Next 5 days rows.
  const [rings, setRings] = useState({ today: null, week: { taken: 0, due: 0 }, month: { taken: 0, due: 0 } });
  const [todayTaken, setTodayTaken] = useState([]);
  const [takenOpen, setTakenOpen] = useState(false);
  const [fold, setFold] = useState({ tom: false, n5: false });

  // Vial continuation state
  const [showVialPrompt, setShowVialPrompt] = useState(false);
  const [continuationProtocol, setContinuationProtocol] = useState(null);
  // Inactivity nudge: a protocol with no doses logged for a while → "still going?"
  const [inactiveProtocol, setInactiveProtocol] = useState(null);
  const [showInactivePrompt, setShowInactivePrompt] = useState(false);
  const [newVialDoses, setNewVialDoses] = useState('');
  const [newVialMonth, setNewVialMonth] = useState(new Date().getMonth());
  const [newVialDay, setNewVialDay] = useState(String(new Date().getDate()));

  // Body map (injection site picker) state
  const [bodyMapVisible, setBodyMapVisible] = useState(false);
  const [bodyMapTarget, setBodyMapTarget] = useState(null); // { q, protocolId, recentLogs, initialStored, mode: 'ask' }
  const [takeNotice, setTakeNotice] = useState(false); // "Not marked as taken" after Cancel / a confirmed back (S-25)

  // Last-site recall chip per protocol — pure recall, NOT a recommendation.
  // Shape: { [protocolId]: { summary: 'Abdomen', daysAgo: 3 } }
  const [lastSiteByProtocol, setLastSiteByProtocol] = useState({});

  // Clear the previous undo timer whenever it's replaced, and on unmount
  useEffect(() => {
    return () => { if (undoData?.timer) clearTimeout(undoData.timer); };
  }, [undoData]);

  useFocusEffect(
    useCallback(() => {
      // Fetch display name
      getCachedUser().then(user => {
        if (user?.user_metadata?.display_name) {
          setUserName(user.user_metadata.display_name.split(/\s+/)[0]); // first name only
        }
      }).catch(() => {});
      cleanupOldDeletedProtocols();
      // Record any dose that went 12h+ unlogged as Missed (prior days only), then
      // refresh streaks/adherence so they reflect it. Best-effort, never blocks.
      scanMissedDoses().then((n) => {
        if (n > 0) { requestSync(); fetchStreakData(); fetchProtocolStreaks(); }
      }).catch(() => {});
      fetchProtocols();
      fetchTodayLogs();
      fetchPendingYesterday();
      fetchStreakData();
      fetchProtocolStreaks();
      fetchLastSites();
      fetchAlerts();
      focusedRef.current = true;
      checkTreatmentStillActive();
      askKeptQuestions();
      playRingIntro(); // the ring fills from zero each time Today opens
      return () => {
        // Leaving Today mid-animation: land the count now. Queued site questions stay
        // kept on the device and are asked again when Today opens (never over another tab).
        focusedRef.current = false;
        for (const fx of pendingFxRef.current) {
          if (fx.undone) continue;
          if (!fx.applied) { clearTimeout(fx.applyT); fx.flush(); }
        }
        pendingFxRef.current.clear();
        siteQueueRef.current = [];
      };
    }, [])
  );

  // A question saved by the notification Taken button while the app is open (S-25).
  useEffect(() => onQuestionsChanged(() => { if (focusedRef.current) askKeptQuestions(); }), []);

  // Refresh when a cloud import/sync finishes — after logging in on a new device
  // the import runs in the background, so the first focus-fetch can hit an empty
  // local DB. Re-fetch on completion instead of requiring a manual tab switch.
  // 'data_changed' fires the instant a protocol is saved (even offline), so a
  // reminder-time edit reflects here immediately without a tab switch.
  useEffect(() => {
    const unsub = addSyncListener((e) => {
      if (e.type === 'import_complete' || e.type === 'sync_complete' || e.type === 'data_changed') {
        fetchProtocols();
        fetchTodayLogs();
        fetchPendingYesterday();
        fetchStreakData();
        fetchProtocolStreaks();
        fetchLastSites();
        fetchAlerts();
      }
    });
    return unsub;
  }, []);

  // Load the open reality-check weigh-in (if any) — surfaced as a Today alert.
  async function fetchAlerts() {
    // Open reality-check weigh-in.
    const rcs = await getRealityStart();
    setRcStart(rcs || null);
    // Latest bloodwork date (biomarkers are ordered report_date DESC).
    try {
      const user = await getCachedUser();
      const bm = user ? (getBiomarkers(user.id) || []) : [];
      setLatestLabDate(bm.length ? bm[0].report_date : null);
    } catch { /* ignore */ }
    // Snooze map for dismissed derived alerts.
    try {
      const raw = await AsyncStorage.getItem(ALERT_SNOOZE_KEY);
      setAlertSnooze(raw ? JSON.parse(raw) : {});
    } catch { setAlertSnooze({}); }
  }

  // Snooze a DERIVED alert (bloodwork / supply / expiry). kind: 'later' (3h, or
  // tomorrow 09:00 if that runs past 21:00), 'tomorrow' (09:00 tomorrow), or
  // 'days' (the alert's own longer window, the old dismiss).
  async function snoozeAlert(id, kind = 'days') {
    const now = new Date();
    const tomorrow9 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0).getTime();
    let until;
    if (kind === 'later') {
      const later = now.getTime() + 3 * 3600000;
      until = new Date(later).getHours() >= 21 || new Date(later).getDate() !== now.getDate() ? tomorrow9 : later;
    } else if (kind === 'tomorrow') until = tomorrow9;
    else until = Date.now() + (ALERT_SNOOZE_MS[id] || 7 * 86400000);
    setSnoozeOpen(null);
    const next = { ...alertSnooze, [id]: until };
    setAlertSnooze(next);
    try { await AsyncStorage.setItem(ALERT_SNOOZE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  // Cancel the open reality-check reminder from the Today alert (with confirm).
  function dismissRealityCheckAlert() {
    Alert.alert(
      t('today_alert_rc_remove_title'),
      t('today_alert_rc_remove_msg'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('today_alert_remove'), style: 'destructive',
          onPress: async () => {
            setRcStart(null);
            await clearRealityStart();
            syncRealityCheckReminder().catch(() => {});
            // Also cancel the 8pm food-log nudges — stopping the reality-check must
            // stop ALL its reminders, not just the weigh-in (journey-review F1).
            syncFoodLogReminder().catch(() => {});
          },
        },
      ]
    );
  }

  // Inactivity nudge: if an active protocol hasn't had a dose logged for a while
  // (max of 7 days or 3× its interval), gently ask whether it's finished — so
  // reminders don't nag forever for an abandoned/completed protocol. Never
  // blocks; snoozed per-protocol so it doesn't re-ask on every app open.
  async function checkTreatmentStillActive() {
    try {
      const user = await getCachedUser();
      if (!user) return;
      const protocols = getActiveProtocols(user.id) || [];
      if (protocols.length === 0) return;
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const logs = getTakenLogsSince(user.id, since.toISOString()) || [];
      const lastLog = {};
      for (const l of logs) {
        if (!lastLog[l.protocol_id] || l.logged_at > lastLog[l.protocol_id]) {
          lastLog[l.protocol_id] = l.logged_at;
        }
      }
      const now = Date.now();
      for (const p of protocols) {
        // Not started yet → don't nudge.
        if (p.start_date && new Date(p.start_date + 'T00:00:00').getTime() > now) continue;
        const thresholdDays = Math.max(7, (p.interval_days || 1) * 3);
        const refIso = lastLog[p.id] || p.created_at || p.start_date;
        if (!refIso) continue;
        const daysSince = (now - new Date(refIso).getTime()) / 86400000;
        if (daysSince < thresholdDays) continue;
        // Skip if snoozed within the last threshold window.
        const snoozedAt = await AsyncStorage.getItem(`dosetrace_tx_check_${p.id}`);
        if (snoozedAt && (now - new Date(snoozedAt).getTime()) / 86400000 < thresholdDays) continue;
        // One modal at a time: a site question goes first; this prompt comes on a later open.
        if (bodyMapOpenRef.current || siteQueueRef.current.length) return;
        inactivePromptOpenRef.current = true;
        setInactiveProtocol(p);
        setShowInactivePrompt(true);
        return; // one at a time
      }
    } catch { /* ignore */ }
  }

  async function endInactiveProtocol() {
    const p = inactiveProtocol;
    if (!p) return;
    softDeleteProtocol(p.id);
    deactivateVialsByProtocol(p.id);
    cancelDoseReminder(p.id).catch(() => {});
    AsyncStorage.removeItem(`dosetrace_tx_check_${p.id}`).catch(() => {});
    setShowInactivePrompt(false);
    setInactiveProtocol(null);
    inactivePromptOpenRef.current = false;
    fetchProtocols();
    requestSync();
    setTimeout(openNextQuestion, 450);
  }

  async function snoozeInactiveProtocol() {
    const p = inactiveProtocol;
    if (p) AsyncStorage.setItem(`dosetrace_tx_check_${p.id}`, new Date().toISOString()).catch(() => {});
    setShowInactivePrompt(false);
    setInactiveProtocol(null);
    inactivePromptOpenRef.current = false;
    setTimeout(openNextQuestion, 450);
  }

  // Build last-site recall map: most recent log with an injection_site, per protocol.
  // Used by DoseCard to show "Last: Abdomen · 3d ago". This is a recall of the
  // user's own log, not a recommendation tied to any drug or protocol.
  async function fetchLastSites() {
    try {
      const user = await getCachedUser();
      if (!user) return;
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const logs = getLogsSince(user.id, since.toISOString()) || [];
      const newest = {};
      for (const l of logs) {
        if (!l.injection_site) continue;
        const prev = newest[l.protocol_id];
        if (!prev || l.logged_at > prev.logged_at) newest[l.protocol_id] = l;
      }
      const out = {};
      Object.keys(newest).forEach(pid => {
        const l = newest[pid];
        const summary = summarizeStored(l.injection_site, t);
        if (!summary) return;
        const ms = Date.now() - new Date(l.logged_at).getTime();
        const daysAgo = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
        out[pid] = { summary, daysAgo };
      });
      setLastSiteByProtocol(out);
    } catch { /* ignore */ }
  }

  // Auto-cleanup: hard-delete protocols where deleted_at > 7 days ago
  function cleanupOldDeletedProtocols() {
    getCachedUser().then(user => {
      if (!user) return;
      hardDeleteOldProtocols(user.id);
      requestSync();
    }).catch(() => { /* silently ignore */ });
  }

  // Per-protocol streaks: consecutive days each individual protocol was taken
  async function fetchProtocolStreaks() {
    try {
      const user = await getCachedUser();
      if (!user) return;
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const logs = getTakenLogsSince(user.id, thirtyDaysAgo.toISOString());
      const activeProtocols = getActiveProtocols(user.id) || [];
      if (!logs) return;
      // Group by protocol_id → { dayString: count } (multi-dose aware)
      const byProtocol = {};
      logs.forEach(l => {
        const day = new Date(l.logged_at).toDateString();
        if (!byProtocol[l.protocol_id]) byProtocol[l.protocol_id] = {};
        byProtocol[l.protocol_id][day] = (byProtocol[l.protocol_id][day] || 0) + 1;
      });
      const streaks = {};
      const now = new Date();
      activeProtocols.forEach(p => {
        const dayCounts = byProtocol[p.id] || {};
        const satisfied = d => (dayCounts[d.toDateString()] || 0) >= expectedDosesOn(p, d);
        let count = 0;
        if (expectedDosesOn(p, now) > 0 && satisfied(now)) count++;
        for (let i = 1; i <= 30; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          if (!existedOn(p, d)) break;
          if (expectedDosesOn(p, d) === 0) continue; // rest day
          if (satisfied(d)) count++;
          else break;
        }
        streaks[p.id] = count;
      });
      setProtocolStreaks(streaks);
    } catch { /* ignore */ }
  }

  async function fetchProtocols() {
    const user = await getCachedUser();
    if (!user) { setLoading(false); return; }

    const data = getActiveProtocols(user.id);
    setProtocols(data || []);

    // Fetch active vials and key them by protocol_id (newest first so latest vial wins)
    const vialData = getActiveVials(user.id);
    if (vialData) {
      const vialMap = {};
      vialData.forEach(v => { if (!vialMap[v.protocol_id]) vialMap[v.protocol_id] = v; });
      setVials(vialMap);
    }
    setLoading(false);
  }

  // A-40 "Pending from yesterday": yesterday's slots with no row of any outcome,
  // matched like the Missed scan, until slot + 12 h. Display only.
  async function fetchPendingYesterday() {
    try {
      const user = await getCachedUser();
      if (!user) { setPendingYest([]); return; }
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      since.setDate(since.getDate() - 1);
      since.setHours(since.getHours() - 3);
      const logs = getLogsSince(user.id, since.toISOString()) || [];
      // A-49 guard: never offer a slot from before the last time-zone change.
      let tzSinceMs = null;
      try { tzSinceMs = (await getMissedWatermark()).tzSinceMs; } catch { /* guard is best-effort */ }
      setPendingYest(pendingFromYesterday({ protocols: getActiveProtocols(user.id) || [], logs, nowMs: Date.now(), tzSinceMs }));
    } catch { setPendingYest([]); }
  }

  function afterPendingWrite() {
    fetchPendingYesterday();
    fetchProtocols();
    fetchStreakData();
    fetchProtocolStreaks();
    syncVialAlerts().catch(() => {});
    requestSync();
  }

  // Taken for a pending slot: logged AT yesterday's slot time through the shared
  // mark-taken path. Never touches today's count or today's reminders. An injectable
  // is asked where it was injected first (S-25); the answer writes it.
  function takePending(item) {
    const p = protocols.find(x => x.id === item.protocolId) || getProtocolById(item.protocolId);
    if (p && needsSiteQuestion(p.type)) {
      askSite(newQuestion({ protocolId: item.protocolId, tapMs: Date.now(), dayKey: item.dayKey, slotMs: item.slotMs, source: 'pending' }));
      return;
    }
    writePending(item.protocolId, { dayKey: item.dayKey, slotMs: item.slotMs });
  }

  // extraDeleteIds: yesterday's Skipped row written with this dose ("today, skip yesterday"
  // answered after midnight) — Undo removes both.
  function writePending(protocolId, write, extraDeleteIds = []) {
    const res = recordDoseTaken(protocolId, write);
    if (res && res.logId) {
      const timer = setTimeout(() => setUndoData(null), 5000);
      setUndoData({
        logId: res.logId, flipped: res.flipped, protocolId, pending: true, extraDeleteIds,
        vialId: res.vialId, prevDosesTaken: res.prevVialDosesTaken, vialFinished: !!res.vialFinished,
        oralPrevUnitsTaken: res.oralPrevUnitsTaken, timer, fx: null,
      });
      const p = getProtocolById(protocolId);
      if (res.vialFinished && p && p.type === 'recon') showVialPromptFor(p, write.vialPromptDelay);
    }
    afterPendingWrite();
  }

  // "Didn't take": one Skipped row at yesterday's slot time (never the tap time).
  function skipPending(item) {
    const res = recordSkipPending(item.protocolId, { dayKey: item.dayKey, slotMs: item.slotMs });
    if (res && res.logId) {
      const timer = setTimeout(() => setUndoData(null), 5000);
      setUndoData({ logId: res.logId, flipped: false, protocolId: item.protocolId, pending: true, vialId: null, prevDosesTaken: null, oralPrevUnitsTaken: null, timer, fx: null });
    }
    afterPendingWrite();
  }

  async function fetchTodayLogs() {
    const user = await getCachedUser();
    if (!user) return;
    const data = getTodayLogs(user.id);
    if (data) {
      const taken = {};
      const skipped = {};
      data.forEach(d => {
        if (d.outcome === 'Taken') taken[d.protocol_id] = (taken[d.protocol_id] || 0) + 1;
        else if (d.outcome === 'Skipped') skipped[d.protocol_id] = (skipped[d.protocol_id] || 0) + 1;
      });
      setTakenCounts(taken);
      setSkippedCounts(skipped);
      setTodayTaken(data.filter(d => d.outcome === 'Taken').sort((a, b) => (a.logged_at < b.logged_at ? -1 : 1)));
    }
    fetchRings(user.id);
  }

  // Today v2.1 rings: doses taken ÷ doses scheduled (today / 7 days / 30 days).
  function fetchRings(uid) {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 40);
      const ps = getActiveProtocols(uid) || [];
      const ls = getLogsSince(uid, since.toISOString()) || [];
      setRings(adherenceRings({ protocols: ps, logs: ls, nowMs: Date.now() }));
    } catch { /* keep the last rings */ }
  }

  async function fetchStreakData() {
    const user = await getCachedUser();
    if (!user) return;
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const logs = getLogsSince(user.id, thirtyDaysAgo.toISOString()) || [];
    const activeProtocols = getActiveProtocols(user.id) || [];
    if (activeProtocols.length === 0) {
      setStreak(0); setMonthAdherence(0); setWeekDots([]); return;
    }

    // Track counts per day per protocol (multi-dose aware)
    const takenByDay = {}; // { dateStr: { protocol_id: count } }
    logs.forEach(l => {
      if (l.outcome !== 'Taken') return;
      const day = new Date(l.logged_at).toDateString();
      if (!takenByDay[day]) takenByDay[day] = {};
      takenByDay[day][l.protocol_id] = (takenByDay[day][l.protocol_id] || 0) + 1;
    });

    // Protocols that existed and expected at least one dose on the given date.
    // Rest days (interval protocols) and pre-creation days never count against the user.
    function dueOn(d) {
      return activeProtocols.filter(p => existedOn(p, d) && expectedDosesOn(p, d) > 0);
    }
    function isDayComplete(d) {
      const due = dueOn(d);
      if (due.length === 0) return false;
      const dayData = takenByDay[d.toDateString()] || {};
      return due.every(p => (dayData[p.id] || 0) >= expectedDosesOn(p, d));
    }
    function isDayPartial(d) {
      const dayData = takenByDay[d.toDateString()];
      if (!dayData) return false;
      const anyTaken = dueOn(d).some(p => dayData[p.id]);
      return anyTaken && !isDayComplete(d);
    }

    let streakCount = 0;
    if (isDayComplete(now)) streakCount++;
    for (let i = 1; i <= 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      if (dueOn(d).length === 0) continue; // rest day — neither adds nor breaks
      if (isDayComplete(d)) streakCount++;
      else break;
    }
    setStreak(streakCount);

    // Adherence over days doses were actually due. Today only counts once
    // complete, so a still-in-progress day doesn't drag the number down.
    let dueDays = 0, completeDays = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      if (dueOn(d).length === 0) continue;
      const complete = isDayComplete(d);
      if (i === 0 && !complete) continue;
      dueDays++;
      if (complete) completeDays++;
    }
    setMonthAdherence(dueDays > 0 ? Math.round((completeDays / dueDays) * 100) : 0);

    const dots = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const status = dueOn(d).length === 0
        ? 'rest'
        : isDayComplete(d) ? 'complete' : isDayPartial(d) ? 'partial' : 'missed';
      dots.push({ dayIndex: d.getDay(), isToday: i === 0, status });
    }
    setWeekDots(dots);
  }

  // opts.deferUi (ms): let the "taken" confirmation play before the card re-sorts; the
  // dose is WRITTEN immediately regardless. opts.write: recordDoseTaken options (tap
  // time, site). opts.cancelUpTo: reminders to cancel for a banner's answer (ti + 1).
  async function markTaken(protocol, opts = {}) {
    if (actionInProgressRef.current) return;
    actionInProgressRef.current = true;
    let saved = false;
    try {
      // The ONE mark-taken path shared with the notification action (S-02):
      // never a second row for a dose already logged (e.g. from the banner), an
      // auto-Missed row is flipped, and vial/oral counts move once.
      const res = recordDoseTaken(protocol.id, opts.write || {});
      if (!res || !res.logId) {
        // Paused/deleted, or already logged elsewhere: show the real state.
        actionInProgressRef.current = false;
        resetTake(protocol.id);
        fetchTodayLogs();
        fetchProtocols();
        return;
      }
      const logId = res.logId;
      saved = true;

      // The day's real Taken count from the write, not the screen's count (which
      // is stale if the banner already logged a dose).
      const newTakenToday = res.takenAfter;
      // Deferred follow-ups are tracked so an Undo inside the delay cancels them:
      // otherwise the count bump lands after the undo, or the site picker opens
      // for (and re-syncs) the deleted log.
      const fx = { undone: false, applied: false, applyT: null };
      const applyTaken = () => {
        if (fx.undone) return;
        fx.applied = true;
        setTakenCounts(prev => ({ ...prev, [protocol.id]: newTakenToday }));
      };
      fx.flush = applyTaken;
      pendingFxRef.current.add(fx);
      setTimeout(() => pendingFxRef.current.delete(fx), 5000);
      if (opts.deferUi) fx.applyT = setTimeout(applyTaken, opts.deferUi); else applyTaken();
      fetchStreakData();
      fetchProtocolStreaks();
      Analytics.doseLogged({ name: protocol.name, type: protocol.type, outcome: 'Taken' });
      // Cancel today's reminder(s) for the slots now taken, so no "dose pending" fires later.
      cancelTodaysDoseReminders(protocol.id, Math.max(newTakenToday, opts.cancelUpTo || 0)).catch(() => {});

      // Vial and oral supply already moved (once) inside recordDoseTaken.
      // The vial prompt FOLLOWS the write (S-25), after the site picker has closed.
      if (res.vialFinished && protocol.type === 'recon') showVialPromptFor(protocol, opts.vialPromptDelay);
      const oralPrevUnitsTaken = res.oralPrevUnitsTaken;
      if (res.vialId || oralPrevUnitsTaken != null) fetchProtocols();
      syncVialAlerts().catch(() => {});
      requestSync();

      // Setup undo (5 second window) — previous timer is cleared by the undoData effect
      const timer = setTimeout(() => setUndoData(null), 5000);
      // The full undo record of THIS take (the Undo bar).
      const record = {
        logId,
        flipped: res.flipped,
        extraDeleteIds: opts.extraDeleteIds || [],
        protocolId: protocol.id,
        vialId: res.vialId,
        prevDosesTaken: res.prevVialDosesTaken,
        vialFinished: !!res.vialFinished,
        oralPrevUnitsTaken,
        oralUnitsAdded: res.oralUnitsAdded,
        timer,
        fx,
      };
      setUndoData(record);

      actionInProgressRef.current = false;
    } catch (err) {
      actionInProgressRef.current = false;
      if (saved) {
        // The dose IS logged; only follow-up bookkeeping (vial/supply) failed.
        // Keep "Taken" — resetting the button would invite a duplicate dose.
        console.warn('markTaken follow-up failed', err);
      } else {
        resetTake(protocol.id); // the button already shows "Taken" — put it back
        Alert.alert(t('error'), friendlyError(err, t, 'error_save_failed'));
      }
    }
  }

  // S-25 (founder 2026-10-01): an injectable is written only AFTER the app asks where
  // it was injected. Each question is kept on the device first (lib/siteQuestion.js),
  // so an app closed with it open asks it again instead of losing the dose; its tap
  // time is the dose's time. One modal at a time: questions wait for the vial prompt.
  async function askSite(q) {
    await saveQuestion(AsyncStorage, q);
    enqueueQuestion(q);
  }

  async function askKeptQuestions() {
    const list = await loadQuestions(AsyncStorage);
    for (const q of list) enqueueQuestion(q);
  }

  function enqueueQuestion(q) {
    if (openQuestionRef.current === q.key) return;
    if (siteQueueRef.current.some(x => x.protocolId === q.protocolId && x.dayKey === q.dayKey)) return;
    siteQueueRef.current.push(q);
    setTimeout(openNextQuestion, 300); // after a press / an Alert has finished
  }

  async function openNextQuestion() {
    if (!focusedRef.current || bodyMapOpenRef.current || vialPromptOpenRef.current || inactivePromptOpenRef.current) return;
    const q = siteQueueRef.current.shift();
    if (!q) return;
    // Paused / deleted, or already logged (another device, a banner): nothing to ask.
    if (isDoseAlreadyLogged(q.protocolId, commitOpts(q))) {
      dropQuestion(AsyncStorage, q.key);
      resetTake(q.protocolId);
      openNextQuestion();
      return;
    }
    bodyMapOpenRef.current = true;
    openQuestionRef.current = q.key;
    try {
      const user = await getCachedUser();
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const recent = user ? (getLogsSince(user.id, since.toISOString()) || []) : [];
      setBodyMapTarget({ q, protocolId: q.protocolId, recentLogs: recent, initialStored: null, mode: 'ask' });
      setBodyMapVisible(true);
    } catch { bodyMapOpenRef.current = false; openQuestionRef.current = null; }
  }

  // The answer writes the dose: at the tap time, with the site (Save) or without
  // (Skip). "Today's dose — skip yesterday" writes yesterday's Skipped row here, in
  // the same step. Returns true when the vial prompt will follow.
  function commitQuestion(q, site) {
    const protocol = protocols.find(p => p.id === q.protocolId) || getProtocolById(q.protocolId);
    const o = commitOpts(q);
    // Gone, or this dose already logged meanwhile (another device, a banner): nothing to
    // write — and no Skipped row for yesterday either.
    if (!protocol || isDoseAlreadyLogged(q.protocolId, o)) {
      dropQuestion(AsyncStorage, q.key);
      fetchTodayLogs();
      return false;
    }
    const write = { tapMs: o.tapMs, dayKey: o.dayKey, slotMs: o.slotMs, atNow: o.atNow, injectionSite: site || null, vialPromptDelay: 450 };
    let extraDeleteIds = [];
    if (o.skipYesterday) {
      const skipped = recordSkipPending(protocol.id, { dayKey: o.skipYesterday.dayKey, slotMs: o.skipYesterday.slotMs });
      if (skipped && skipped.logId) extraDeleteIds = [skipped.logId];
      fetchPendingYesterday();
    }
    vialPromptPendingRef.current = false;
    if (q.source === 'pending' || o.dayKey !== localDayKey(Date.now())) writePending(protocol.id, write, extraDeleteIds);
    else markTaken(protocol, { write, extraDeleteIds, vialPromptDelay: 450, cancelUpTo: reminderCancelCount(q, 0) });
    // Forgotten only after the write (markTaken is synchronous: no await before its write).
    dropQuestion(AsyncStorage, q.key);
    return vialPromptPendingRef.current;
  }

  // Every way out of the site picker goes through ONE plan (lib/sitePickerActions.js,
  // __tests__/siteBeforeTaken.test.js): Save / Skip write the dose; Cancel / X and a
  // CONFIRMED Android back write nothing and say so.
  function pickerAction(action, stored) {
    const tgt = bodyMapTarget;
    if (!tgt) return;
    const plan = planSitePickerAction({ mode: tgt.mode, action });
    if (!plan.close) return; // a bare Android back is handled by handleBodyMapBack
    setBodyMapVisible(false);
    setBodyMapTarget(null);
    bodyMapOpenRef.current = false;
    openQuestionRef.current = null;
    let vialNext = false;
    if (tgt.q) {
      if (plan.commit) vialNext = commitQuestion(tgt.q, plan.writeSite ? stored : null);
      else {
        dropQuestion(AsyncStorage, tgt.q.key);
        resetTake(tgt.q.protocolId);
      }
    }
    if (plan.notice) {
      clearTimeout(takeNoticeT.current);
      setTakeNotice(true);
      takeNoticeT.current = setTimeout(() => setTakeNotice(false), 6000);
    }
    if (!vialNext) setTimeout(openNextQuestion, 450); // the next question, once this picker has faded out
  }

  function handleBodyMapClose() { pickerAction('cancel'); }
  // Android back (button or gesture) never decides by itself (founder 2026-09-30):
  // ask — stay in the picker, or leave (= Cancel = nothing written).
  function handleBodyMapBack() {
    const tgt = bodyMapTarget;
    if (!tgt) return;
    if (!planSitePickerAction({ mode: tgt.mode, action: 'back' }).confirm) { pickerAction('back'); return; }
    Alert.alert(
      t('today_site_back_title'),
      t('today_site_back_msg'),
      [
        { text: t('today_site_back_stay'), style: 'cancel' },
        { text: t('today_site_back_leave'), style: 'destructive', onPress: () => pickerAction('leave') },
      ],
      { cancelable: true },
    );
  }
  function handleBodyMapSkip() { pickerAction('skip'); }
  function handleBodyMapSave({ stored }) { pickerAction('save', stored); }

  function undoTake() { applyUndo(undoData); }

  // Undo ONE take, from its own record. Never twice for the same log.
  function applyUndo(record) {
    if (!record || record.logId == null || undoneIdsRef.current.has(record.logId)) return;
    undoneIdsRef.current.add(record.logId);
    try {
      if (record.timer) clearTimeout(record.timer);
      const fx = record.fx;
      if (fx) {
        fx.undone = true;
        clearTimeout(fx.applyT);
      }
      // The ONE undo plan (lib/markTaken.js planUndoTake, __tests__/pendingFlow.test.js):
      // a flipped Missed row goes back to Missed; "today's dose — skip yesterday"
      // wrote two rows and undo removes both (A-40). Supply goes back by one dose
      // from what it is NOW, read fresh (another dose may have moved it since).
      const proto = getProtocolById(record.protocolId);
      const vialNow = record.vialId ? getVialById(record.vialId) : null;
      const otherActiveVial = !!(record.vialId && proto
        && (getActiveVials(proto.user_id) || []).some(v => v.protocol_id === record.protocolId && v.id !== record.vialId));
      const plan = planUndoTake(record, { vialNow, otherActiveVial, unitsNow: proto ? (proto.units_taken || 0) : null });
      if (plan.restoreMissedId != null) updateDoseLog(plan.restoreMissedId, { outcome: 'Missed', injection_site: null });
      for (const id of plan.deleteIds) deleteDoseLog(id);
      // Only take back a count bump that actually landed (a pending-from-yesterday
      // row never changed today's count).
      if (plan.todayCount === 'none') {
        // nothing to take back on today's cards
      } else if (plan.todayCount === 'decrement') {
        setTakenCounts(prev => {
          const updated = { ...prev };
          updated[record.protocolId] = Math.max((updated[record.protocolId] || 1) - 1, 0);
          return updated;
        });
      } else {
        resetTake(record.protocolId); // the pressed button is still showing "Taken"
      }
      if (plan.vialRestore) {
        const { id, ...fields } = plan.vialRestore;
        updateVial(id, fields);
        fetchProtocols();
      }
      if (plan.oralRestore) {
        updateProtocol(plan.oralRestore.protocolId, { units_taken: plan.oralRestore.units_taken });
        fetchProtocols();
      }
      // The "start a new vial?" prompt of the undone dose must not stay up.
      if (plan.closeVialPrompt) {
        if (continuationProtocol && continuationProtocol.id === record.protocolId) closeVialPrompt();
      }
      setUndoData(prev => (prev && prev.logId === record.logId ? null : prev));
      fetchPendingYesterday();
      fetchStreakData();
      fetchProtocolStreaks();
      syncVialAlerts().catch(() => {});
      requestSync();
    } catch { /* ignore */ }
  }

  function skipDose(protocol) {
    Alert.alert(
      t('today_skip_title'),
      t('today_skip_confirm').replace('{name}', protocol.name),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('today_skip'), style: 'destructive',
          onPress: async () => {
            try {
              const user = await getCachedUser();
              if (!user) return;
              insertDoseLog({
                user_id: user.id,
                protocol_id: protocol.id,
                protocol_remote_id: protocol.remote_id || null,
                outcome: 'Skipped',
              });
              setSkippedCounts(prev => ({ ...prev, [protocol.id]: (prev[protocol.id] || 0) + 1 }));
              Analytics.doseLogged({ name: protocol.name, type: protocol.type, outcome: 'Skipped' });
              requestSync();
            } catch (err) {
              Alert.alert(t('error'), friendlyError(err, t, 'error_save_failed'));
            }
          },
        },
      ]
    );
  }

  // The ONE way the vial prompt closes ("Protocol finished", "Log new vial", or the undo
  // of that dose). A site question waiting behind it opens after the prompt has faded out.
  function closeVialPrompt() {
    clearTimeout(vialTimerRef.current);
    setShowVialPrompt(false);
    setContinuationProtocol(null);
    vialPromptOpenRef.current = false;
    setTimeout(openNextQuestion, 450); // a site question waiting behind the prompt
  }

  // delayMs: after a site picker, wait for it to fade out (iOS shows one modal at a time).
  function showVialPromptFor(protocol, delayMs) {
    vialPromptOpenRef.current = true;
    vialPromptPendingRef.current = true;
    setContinuationProtocol(protocol);
    setNewVialDoses('');
    setNewVialMonth(new Date().getMonth());
    setNewVialDay(String(new Date().getDate()));
    clearTimeout(vialTimerRef.current);
    if (delayMs) vialTimerRef.current = setTimeout(() => setShowVialPrompt(true), delayMs); else setShowVialPrompt(true);
  }

  async function createNewVial() {
    if (!continuationProtocol) return;
    try {
      const user = await getCachedUser();
      if (!user) return;
      const mixDate = toPastDateString(newVialMonth, newVialDay);
      if (!mixDate) { Alert.alert(t('error'), t('today_invalid_date')); return; }
      // Vial row from lib/newVial (tested): capacity derived from the protocol;
      // the protocol itself is never changed, so its history is kept (S-01).
      const { vial, protocolUpdate } = newVialRecords(continuationProtocol, mixDate, user.id);
      insertVial(vial);
      if (protocolUpdate) updateProtocol(continuationProtocol.id, protocolUpdate);

      const updatedProtocol = getProtocolById(continuationProtocol.id);
      if (updatedProtocol) scheduleDoseReminder(updatedProtocol).catch(() => {});

      closeVialPrompt();
      fetchProtocols();
      syncVialAlerts().catch(() => {});
      requestSync();
    } catch (err) {
      Alert.alert(t('error'), friendlyError(err, t, 'error_save_failed'));
    }
  }

  function formatVialDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return `${t(MONTH_KEYS[d.getMonth()])} ${d.getDate()}`;
  }

  // Computed in render (not cached in state) so both follow the app language.
  const _hour = new Date().getHours();
  const greeting = t(_hour < 12 ? 'today_greeting_morning' : _hour < 18 ? 'today_greeting_afternoon' : 'today_greeting_evening');
  // Localized date. toLocaleDateString with an explicit locale can throw on
  // some Hermes builds, which would blank the whole header — so guard it and
  // fall back to the app's own localized month/weekday keys (always works).
  let today;
  try {
    today = new Date().toLocaleDateString(LOCALE_MAP[language] || 'en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  } catch { today = ''; }
  if (!today) {
    const _d = new Date();
    today = `${t(WEEKDAY_KEYS[_d.getDay()])}, ${t(MONTH_KEYS[_d.getMonth()])} ${_d.getDate()}`;
  }

  const todayDate = new Date();
  const dueProtocols = protocols.filter(p => expectedDosesOn(p, todayDate) > 0);
  const doneCount = dueProtocols.filter(p => (takenCounts[p.id] || 0) >= expectedDosesOn(p, todayDate)).length;
  const totalCount = dueProtocols.length;
  // Dose-based totals: every scheduled dose counts (a 2×/day vitamin = 2), taken
  // capped at expected so extra taps can't overshoot.
  const totalDoses = dueProtocols.reduce((sum, p) => sum + expectedDosesOn(p, todayDate), 0);
  const doneDoses = dueProtocols.reduce((sum, p) => sum + Math.min(takenCounts[p.id] || 0, expectedDosesOn(p, todayDate)), 0);
  // ── Progress ring motion ───────────────────────────────────────
  // The ring and its numbers run on the UI thread. On every open they fill from
  // zero to today's progress; after Mark taken a drop flies from the card into
  // the ring and the ring sweeps to its new value as it lands. Reduce Motion →
  // values are set instantly.
  const reduceMotion = useReducedMotion();
  const reduceRef = useRef(reduceMotion); reduceRef.current = reduceMotion;
  const ringTarget = totalDoses > 0 ? doneDoses / totalDoses : 0;
  const targetRef = useRef({ frac: 0, done: 0 });
  targetRef.current = { frac: ringTarget, done: doneDoses };
  const ringFrac = useSharedValue(0);
  const doneShown = useSharedValue(0);
  const ringPulse = useSharedValue(1);
  const pulseGrow = useSharedValue(10);
  const flyK = useSharedValue(0);
  const fly = useSharedValue({ sx: 0, sy: 0, ex: 0, ey: 0 });
  const landingAtRef = useRef(0);
  const rootRef = useRef(null);
  const ringRef = useRef(null);
  const ringMountedRef = useRef(false);

  const ringTokenRef = useRef(0);
  const ringSafetyRef = useRef(null);
  useEffect(() => () => clearTimeout(ringSafetyRef.current), []);
  function playRingIntro() {
    const { frac, done } = targetRef.current;
    if (reduceRef.current) { ringFrac.value = frac; doneShown.value = done; return; }
    const ease = { duration: 950, easing: Easing.out(Easing.cubic) };
    ringFrac.value = 0; doneShown.value = 0;
    ringFrac.value = withDelay(150, withTiming(frac, ease));
    doneShown.value = withDelay(150, withTiming(done, ease));
    // Founder rule: the ring loads from zero every visit UNLESS the animation might
    // not play. If it was interrupted (app backgrounded mid-sweep, a stalled frame
    // loop), never leave a wrong number on screen: land on the real values.
    const token = ++ringTokenRef.current;
    clearTimeout(ringSafetyRef.current);
    ringSafetyRef.current = setTimeout(() => {
      if (token !== ringTokenRef.current) return; // a newer sweep owns the ring
      const tgt = targetRef.current;
      if (Math.abs(doneShown.value - tgt.done) > 0.01 || Math.abs(ringFrac.value - tgt.frac) > 0.001) {
        ringFrac.value = tgt.frac; doneShown.value = tgt.done;
      }
    }, 150 + 950 + 400);
  }

  // Progress changed (data loaded, dose taken, undo): sweep to the new value —
  // after the drop lands if one is in flight.
  useEffect(() => {
    if (!ringMountedRef.current) { ringMountedRef.current = true; return; } // the focus intro owns the first fill
    if (reduceRef.current) { ringFrac.value = ringTarget; doneShown.value = doneDoses; return; }
    const delay = Math.max(0, landingAtRef.current - Date.now());
    ringTokenRef.current++; // this sweep supersedes the intro safety net
    ringFrac.value = withDelay(delay, withTiming(ringTarget, { duration: 560, easing: Easing.out(Easing.cubic) }));
    doneShown.value = withDelay(delay, withTiming(doneDoses, { duration: 320 }));
    if (landingAtRef.current) {
      const dayDone = totalDoses > 0 && doneDoses >= totalDoses;
      pulseGrow.value = dayDone ? 16 : 10;
      ringPulse.value = 0;
      ringPulse.value = withDelay(delay, withTiming(1, { duration: dayDone ? 750 : 520 }));
      landingAtRef.current = 0;
    }
  }, [ringTarget, doneDoses]);

  function handleTake(p, btnRect, attempt = 0, opts = {}) {
    const tapMs = opts.tapMs || Date.now(); // S-25: the dose's time is the tap
    // Another card's write is mid-flight: retry shortly rather than let the
    // button show "Taken" for a dose that was never logged.
    if (actionInProgressRef.current) {
      if (attempt < 12) setTimeout(() => handleTake(p, btnRect, attempt + 1, { ...opts, tapMs }), 250);
      else {
        resetTake(p.id);
        Alert.alert(t('error'), t('error_save_failed'));
      }
      return;
    }
    // A-40: yesterday's dose for this protocol is still pending — ask which day this
    // dose is for before writing anything (earliest pending slot).
    const pend = pendingPromptFor(pendingYest, p.id, { pendingResolved: !!opts.pendingResolved });
    if (pend) {
      const vars = (str) => str.replace('{name}', p.compound_id ? t(p.compound_id) : p.name).replace('{time}', formatTimeAMPM(new Date(pend.slotMs).toTimeString().slice(0, 5)));
      Alert.alert(
        t('today_pending_prompt_title'),
        vars(t('today_pending_prompt_msg')),
        [
          { text: t('today_pending_prompt_yesterday'), onPress: () => { resetTake(p.id); takePending(pend); } },
          // Nothing is written here: yesterday's Skipped row goes in with this dose (S-25).
          { text: t('today_pending_prompt_today'), onPress: () => {
            handleTake(p, btnRect, 0, { pendingResolved: true, tapMs, skipYesterday: { dayKey: pend.dayKey, slotMs: pend.slotMs } });
          } },
          { text: t('cancel'), style: 'cancel', onPress: () => resetTake(p.id) },
        ],
        { cancelable: true, onDismiss: () => resetTake(p.id) },
      );
      return;
    }
    // An injectable: ask where it was injected; the answer writes it (S-25).
    if (needsSiteQuestion(p.type)) {
      askSite(newQuestion({ protocolId: p.id, tapMs, skipYesterday: opts.skipYesterday || null, source: 'today' }));
      return;
    }
    // An oral dose is written now ("today, skip yesterday" writes both rows together).
    const extraDeleteIds = opts.skipYesterday ? skipYesterdayRow(p.id, opts.skipYesterday) : [];
    if (reduceRef.current || !btnRect) { markTaken(p, { extraDeleteIds }); return; }
    const LIFT = 110, FLIGHT = 500;
    landingAtRef.current = Date.now() + LIFT + FLIGHT;
    // Write now; let the card re-sort after the drop lands.
    markTaken(p, { deferUi: 380, extraDeleteIds });
    setTimeout(() => { if (landingAtRef.current && Date.now() > landingAtRef.current + 400) landingAtRef.current = 0; }, 1500);
    Promise.all([measureWin(rootRef), measureWin(ringRef)]).then(([root, ring]) => {
      if (!root || !ring) return;
      // Ring scrolled out of view: no flight to an invisible target (the button's
      // check and the count still confirm the dose).
      if (ring.y + ring.h < root.y || ring.y > root.y + root.h) { landingAtRef.current = 0; return; }
      fly.value = {
        sx: btnRect.x - root.x + btnRect.w / 2 - 5, sy: btnRect.y - root.y + btnRect.h / 2 - 6,
        ex: ring.x - root.x + ring.w / 2 - 5, ey: ring.y - root.y + ring.h / 2 - 6,
      };
      flyK.value = 0;
      flyK.value = withDelay(LIFT, withTiming(1, { duration: FLIGHT }));
    });
  }

  function skipYesterdayRow(protocolId, skip) {
    const skipped = recordSkipPending(protocolId, { dayKey: skip.dayKey, slotMs: skip.slotMs });
    fetchPendingYesterday();
    return skipped && skipped.logId ? [skipped.logId] : [];
  }

  const ringArcProps = useAnimatedProps(() => ({ strokeDashoffset: RING_CIRC * (1 - ringFrac.value) }));
  const ringPulseProps = useAnimatedProps(() => {
    const k = ringPulse.value;
    return { r: RING_R + pulseGrow.value * (1 - (1 - k) * (1 - k)), opacity: k > 0 && k < 1 ? 0.5 * (1 - k) : 0 };
  });
  const flyStyle = useAnimatedStyle(() => {
    const k = flyK.value;
    if (k <= 0 || k >= 1) return { opacity: 0 };
    const f = fly.value, e = eInOutSine(k), u = 1 - e;
    const cx = (f.sx + f.ex) / 2, cy = Math.min(f.sy, f.ey) - 70;
    return {
      opacity: 1,
      transform: [
        { translateX: u * u * f.sx + 2 * u * e * cx + e * e * f.ex },
        { translateY: u * u * f.sy + 2 * u * e * cy + e * e * f.ey },
        { scale: 1 - 0.3 * e },
      ],
    };
  });
  const pctFmt = (v) => { 'worklet'; return totalDoses > 0 ? Math.round(v * 100) + '%' : '—'; };
  const intFmt = (v) => { 'worklet'; return String(Math.round(v)); };
  const dosesWord = t('today_doses');
  const subFmt = (v) => { 'worklet'; return Math.round(v) + ' / ' + totalDoses + ' ' + dosesWord; };
  const takenLabel = t('today_taken');

  // Order the daily list purely by "what's next to take" across all compounds:
  // overdue/now → later today → tomorrow → in 2 days … (see nextDoseAt). A dose
  // already taken today sorts by its NEXT dose, not to the bottom.
  const dailyOrder = [...protocols].sort((a, b) =>
    nextDoseAt(a, takenCounts[a.id] || 0, new Date()) - nextDoseAt(b, takenCounts[b.id] || 0, new Date())
  );
  // Near-term agenda, bucketed by the NEXT dose moment. nextDoseAt already
  // accounts for doses taken today, so once you take today's dose the protocol
  // advances to its next dose (tomorrow, etc.) instead of lingering as "taken".
  // Anything past 5 days isn't shown here (it lives in the Protocols tab).
  const startOfToday = new Date(todayDate); startOfToday.setHours(0, 0, 0, 0);
  const bucketDay = (p) => {
    const at = nextDoseAt(p, takenCounts[p.id] || 0, todayDate);
    if (!isFinite(at)) return Infinity;
    const d = new Date(at); d.setHours(0, 0, 0, 0);
    return Math.round((d - startOfToday) / 86400000);
  };
  const todayCards = dailyOrder.filter(p => bucketDay(p) <= 0);
  const tomorrowCards = dailyOrder.filter(p => bucketDay(p) === 1);
  const next5Cards = dailyOrder.filter(p => { const d = bucketDay(p); return d >= 2 && d <= 6; });
  const laterCount = dailyOrder.filter(p => bucketDay(p) > 6).length;
  // Doses were due today and all handled → show a positive "all done" note
  // instead of an empty Today section.
  const allDoneToday = todayCards.length === 0 && totalCount > 0;

  // ── Today alerts ─────────────────────────────────────────────
  // Pending, actionable reminders shown under the streak — NOT the daily doses
  // (those live in the Today list). Each is tappable and deletable.
  const alerts = useMemo(() => {
    const list = [];
    const nowMs = Date.now();
    // 1) Reality-check weigh-in (open check-in awaiting the second weight).
    if (rcStart && !(alertSnooze.reality_check && nowMs < alertSnooze.reality_check)) {
      const remind = new Date(rcStart.date + 'T12:00:00');
      remind.setDate(remind.getDate() + REALITY_CHECK_DAYS);
      const due = nowMs >= remind.getTime();
      list.push({
        id: 'reality_check', iconName: 'type_glp1', due,
        title: t('today_alert_rc_title'),
        body: due ? t('today_alert_rc_due')
          : t('today_alert_rc_when').replace('{date}', `${t(MONTH_KEYS[remind.getMonth()])} ${remind.getDate()}`),
        onPress: () => navigation.navigate('Journey'),
        onRemove: dismissRealityCheckAlert,
        snoozeId: 'reality_check',
      });
    }
    // 2) Bloodwork due (~6 months since the last logged test).
    if (latestLabDate && !(alertSnooze.bloodwork_due && nowMs < alertSnooze.bloodwork_due)) {
      const days = Math.floor((nowMs - new Date(latestLabDate + 'T12:00:00').getTime()) / 86400000);
      if (days >= BLOODWORK_INTERVAL_DAYS) {
        list.push({
          id: 'bloodwork_due', iconName: 'droplet', due: true,
          title: t('today_alert_blood_title'),
          body: t('today_alert_blood_body').replace('{months}', String(Math.max(6, Math.round(days / 30)))),
          onPress: () => navigation.navigate('Body', { initialSection: 'labs' }),
          snoozeId: 'bloodwork_due',
        });
      }
    }
    // 3) Supply low (an active vial with only a few doses left).
    if (!(alertSnooze.supply_low && nowMs < alertSnooze.supply_low)) {
      const low = [];
      for (const p of protocols) {
        const v = vials[p.id];
        if (!v) continue;
        const { remaining: rem, low: isLow } = supplyState(v, p); // the ONE rule (S-05)
        if (isLow) low.push({ name: p.compound_id ? t(p.compound_id) : p.name, rem });
      }
      if (low.length) {
        low.sort((a, b) => a.rem - b.rem);
        list.push({
          id: 'supply_low', iconName: 'syringe', due: true,
          title: t('today_alert_supply_title'),
          body: low.length === 1
            ? t('today_alert_supply_one').replace('{name}', low[0].name).replace('{n}', String(low[0].rem))
            : low.length <= 3
              ? t('today_alert_supply_list').replace('{names}', low.map(x => x.name).join(', '))
              : t('today_alert_supply_many').replace('{count}', String(low.length)),
          onPress: () => navigation.navigate('Protocols'),
          snoozeId: 'supply_low',
        });
      }
    }
    // 4) Vial expiring soon (recon: mix date + validity; rtu: box expiry date).
    if (!(alertSnooze.vial_expiry && nowMs < alertSnooze.vial_expiry)) {
      const exp = [];
      for (const p of protocols) {
        const v = vials[p.id];
        if (!v) continue;
        let daysLeft = null;
        if (p.type === 'recon') {
          daysLeft = daysUntilExpiry(v.mixed_on, p.vial_valid_days || DEFAULT_VALID_DAYS, new Date());
        } else if (v.expires_on) {
          daysLeft = Math.ceil((new Date(v.expires_on + 'T00:00:00').getTime() - nowMs) / 86400000);
        }
        if (daysLeft != null && daysLeft <= VIAL_EXPIRY_SOON_DAYS) {
          exp.push({ name: p.compound_id ? t(p.compound_id) : p.name, daysLeft });
        }
      }
      if (exp.length) {
        exp.sort((a, b) => a.daysLeft - b.daysLeft);
        const soonest = exp[0];
        const body = exp.length === 1
          ? (soonest.daysLeft <= 0
              ? t('today_alert_vial_expired_one').replace('{name}', soonest.name)
              : t('today_alert_vial_expiry_one').replace('{name}', soonest.name).replace('{n}', String(soonest.daysLeft)))
          : t('today_alert_vial_expiry_many').replace('{count}', String(exp.length));
        list.push({
          id: 'vial_expiry', iconName: 'clock', due: true,
          title: t('today_alert_vial_title'), body,
          onPress: () => navigation.navigate('Protocols'),
          snoozeId: 'vial_expiry',
        });
      }
    }
    return list;
  }, [rcStart, latestLabDate, protocols, vials, alertSnooze, language]);

  function formatTimeAMPM(time24) {
    return formatTime(time24, language, timeFormat);
  }

  // Determine next time slot label for multi-dose protocols.
  // On the creation day earlier slots don't count, so the label starts from
  // the first slot that's actually expected.
  function getNextTimeLabel(p) {
    const dpd = p.doses_per_day || 1;
    if (!p.reminder_time || dpd <= 1) return null;
    const times = sortedDoseTimes(p).slice(0, dpd);
    const expected = expectedDosesOn(p, new Date());
    const taken = takenCounts[p.id] || 0;
    if (expected === 0 || taken >= expected) return null;
    const idx = (dpd - expected) + taken;
    return times[idx] ? formatTimeAMPM(times[idx]) : null;
  }

  // Check if the next dose is due (≤5 min away or overdue)
  function isDoseDue(p) {
    if (!p.reminder_time) return false;
    const dpd = p.doses_per_day || 1;
    const dosesTakenToday = takenCounts[p.id] || 0;
    const dosesNeeded = expectedDosesOn(p, new Date());
    if (dosesNeeded === 0 || dosesTakenToday >= dosesNeeded) return false;
    const times = sortedDoseTimes(p).slice(0, dpd);
    const nextTimeStr = times[(dpd - dosesNeeded) + dosesTakenToday] || times[0];
    if (!nextTimeStr) return false;
    const [h, m] = nextTimeStr.split(':').map(Number);
    const now = new Date();
    const doseTime = new Date();
    doseTime.setHours(h, m, 0, 0);
    const diffMs = doseTime - now;
    // Due if ≤5 min from now OR already past
    return diffMs <= 5 * 60 * 1000;
  }

  // Calculate progress "Day X of Y"
  function getProgress(p) {
    if (!p.start_date || !p.schedule_total) return null;
    const start = new Date(p.start_date + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const interval = p.interval_days || 1;
    const daysSinceStart = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    const currentDose = Math.floor(daysSinceStart / interval) + 1;
    const capped = Math.min(Math.max(currentDose, 1), p.schedule_total);
    return { current: capped, total: p.schedule_total };
  }

  // Today v2.1 dose card (founder 2026-09-29): the whole card opens the protocol; Skip and
  // Mark taken on the card; an outline "Due" tag; Draw to {n} units + the syringe to scale
  // for a reconstituted dose with a mixed vial (the same computeDraw as Protocols, with its
  // over-capacity warning); every item main showed stays (dose, frequency, time, skipped /
  // partial lines, Day X of Y, last site, protocol streak, vial line or + Add vial).
  // Rendered as a plain function so React doesn't remount the subtree on every render.
  function renderDoseCard(p) {
    const dosesTakenToday = takenCounts[p.id] || 0;
    const dosesNeeded = expectedDosesOn(p, new Date());
    const skippedToday = skippedCounts[p.id] || 0;
    const vial = vials[p.id];
    const nextTime = getNextTimeLabel(p);
    const progress = getProgress(p);
    const pStreak = protocolStreaks[p.id] || 0;
    const due = isDoseDue(p);
    const lastSite = lastSiteByProtocol[p.id];
    const name = p.compound_id ? t(p.compound_id) : p.name;
    const draw = p.type === 'recon' && vial ? computeDraw({
      type: p.type, amount: p.amount, water: p.water, dose: p.dose, doseUnit: p.dose_unit, unit: p.unit,
      concentration: p.concentration, concentrationUnit: p.concentration_unit, syringe_size: p.syringe_size,
    }) : null;
    const syr = p.syringe_size || 100;
    return (
      <View key={p.id} style={s.dose}>
        <TouchableOpacity style={s.dtop} activeOpacity={0.7} onPress={() => navigation.navigate('Protocols', { openProtocolId: p.id })} accessibilityRole="button">
          <View style={[s.ddot, { backgroundColor: p.color || colors.data }]} />
          <View style={s.dinfo}>
            <Text style={s.dname}>{name}</Text>
            <Text style={s.damt}>{p.dose} {p.dose_unit} · {frequencyLabelFor(p.interval_days, t)}</Text>
            {progress && (
              <Text style={s.dsub}>{t('today_day_of').replace('{current}', progress.current).replace('{total}', progress.total)}</Text>
            )}
            {skippedToday > 0 && <Text style={s.dsub}>{t('today_skipped_today')}</Text>}
            {dosesTakenToday > 0 && dosesNeeded > 1 && <Text style={s.dsub}>{dosesTakenToday}/{dosesNeeded} {t('today_taken_partial')}</Text>}
          </View>
          <View style={s.dright}>
            {p.reminder_time ? (
              <Text style={s.dtime}>{p.reminder_time.split(',').filter(Boolean).map(t24 => formatTimeAMPM(t24)).join(' · ')}</Text>
            ) : null}
            {due && (
              <View style={s.dueTag}>
                <View style={s.dueDot} />
                <Text style={s.dueText}>{t('today_due')}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        {draw && draw.drawUnits && !draw.unitMismatch && (
          <View style={s.draw}>
            <View style={s.drawHead}>
              <Text style={s.drawLabel}>{t('protocols_syringe_draw_to')}</Text>
              <Text style={s.drawVal}>{draw.drawUnits}<Text style={s.drawUnit}> u · {draw.drawML} ml</Text></Text>
            </View>
            {draw.exceedsSyringe ? (
              <Text style={s.drawWarn}>{t('protocols_draw_exceeds_warning').replace('{units}', draw.drawUnits).replace('{size}', String(syr))}</Text>
            ) : (
              <SyringeScale units={Number(draw.drawUnits)} size={syr} width={290} />
            )}
          </View>
        )}
        {(lastSite || pStreak > 0) && (
          <View style={s.dmeta}>
            {lastSite && (
              <Text style={s.dmetaText}>
                {t('today_last_site').replace('{site}', lastSite.summary).replace('{days}', String(lastSite.daysAgo))}
              </Text>
            )}
            {pStreak > 0 && (
              <View style={s.dmetaRow}>
                <FeatureIcon name="flame" size={12} color={colors.attention} />
                <Text style={s.dmetaText}>{pStreak} {pStreak === 1 ? t('today_streak_day') : t('today_streak_days')}</Text>
              </View>
            )}
          </View>
        )}
        {p.type === 'recon' && vial && (() => {
          const capacity = (vial.total_doses && vial.total_doses > 0)
            ? vial.total_doses
            : dosesPerVial({ amount: p.amount, unit: p.unit, dose: p.dose, doseUnit: p.dose_unit });
          const remaining = capacity ? Math.max(0, capacity - (vial.doses_taken || 0)) : null;
          const daysLeft = daysUntilExpiry(vial.mixed_on, p.vial_valid_days || DEFAULT_VALID_DAYS, new Date());
          return (
            <View style={s.vialRow}>
              <Text style={s.vialText}>
                {t('today_vial_mixed')} {formatVialDate(vial.mixed_on)}
                {remaining != null ? ` · ${remaining} ${t('today_vial_remaining')}` : ''}
                {daysLeft != null ? ' · ' : ''}
                {daysLeft != null && (
                  <Text style={{ color: daysLeft <= 3 ? colors.risk : daysLeft <= 7 ? colors.attention : colors.ok, fontWeight: '600' }}>
                    {daysLeft <= 0 ? t('protocols_vial_past') : t('protocols_vial_days_left').replace('{n}', String(daysLeft))}
                  </Text>
                )}
              </Text>
            </View>
          );
        })()}
        {p.type === 'recon' && !vial && (
          <TouchableOpacity style={s.vialRow} onPress={() => showVialPromptFor(p)} accessibilityRole="button">
            <Text style={[s.vialText, { color: colors.ink, textDecorationLine: 'underline' }]}>{t('today_add_vial')}</Text>
          </TouchableOpacity>
        )}
        <View style={s.acts}>
          <TouchableOpacity style={s.btnSkip} onPress={() => skipDose(p)} accessibilityRole="button">
            <Text style={s.btnSkipText}>{t('today_skip')}</Text>
          </TouchableOpacity>
          <TakeButton
            key={`take-${p.id}-${dosesTakenToday}-${takeReset[p.id] || 0}`}
            label={nextTime ? t('today_take_time').replace('{time}', nextTime) : t('today_mark_taken')}
            takenLabel={takenLabel}
            onTake={(rect) => handleTake(p, rect)}
            askFirst={needsSiteQuestion(p.type)}
            s={s}
            colors={colors}
          />
        </View>
      </View>
    );
  }

  // Tomorrow / Next 5 days: one list, each part folded with its count; open → rows.
  function foldRow(key, title, items) {
    if (!items.length) return null;
    const open = fold[key];
    return (
      <View key={key} style={s.foldBlock}>
        <TouchableOpacity style={s.foldHead} onPress={() => setFold(prev => ({ ...prev, [key]: !prev[key] }))} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <Text style={s.foldTitle}>{title}</Text>
          <Text style={s.foldCount}>{items.length} {t('today_doses')}</Text>
          <Text style={s.foldChev}>{open ? '⌃' : '⌄'}</Text>
        </TouchableOpacity>
        {open && items.map(p => {
          const at = nextDoseAt(p, takenCounts[p.id] || 0, new Date());
          const d = new Date(at);
          const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          return (
            <TouchableOpacity key={p.id} style={s.upRow} onPress={() => navigation.navigate('Protocols', { openProtocolId: p.id })} accessibilityRole="button">
              <Text style={s.upTime}>{key === 'n5' ? `${t(WEEKDAY_KEYS[d.getDay()])} ` : ''}{formatTimeAMPM(hhmm)}</Text>
              <View style={[s.ddot, { backgroundColor: p.color || colors.data }]} />
              <View style={s.upMain}>
                <Text style={s.upName}>{p.compound_id ? t(p.compound_id) : p.name}</Text>
                <Text style={s.upAmt}>{p.dose} {p.dose_unit} · {frequencyLabelFor(p.interval_days, t)}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  const takenNames = todayTaken.map(l => {
    const pr = protocols.find(x => x.id === l.protocol_id);
    return pr ? (pr.compound_id ? t(pr.compound_id) : pr.name) : null;
  }).filter(Boolean);

  return (
    <SafeAreaView style={s.container} ref={rootRef} collapsable={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.centered}>
        {/* Today v2.1 order (founder 2026-09-29): header → Alerts (gone when none) → Pending
            from yesterday → tracker → AI food log → Doses → Taken → Tomorrow / Next 5 days. */}
        <View style={s.header}>
          <Text style={s.date}>{today}</Text>
          <Text style={s.title}>{t('tab_today')}</Text>
        </View>

        {alerts.length > 0 && (
          <View style={s.block}>
            <View style={s.lab}>
              <Text style={s.labText}>{t('today_alerts_title')}</Text>
              <Text style={s.labCount}>{alerts.length}</Text>
            </View>
            <View style={s.alist}>
              {alerts.map((a, i) => (
                <View key={a.id} style={[s.aitem, i > 0 && s.aitemSep]}>
                  <View style={s.arow}>
                    <TouchableOpacity style={s.amain} activeOpacity={0.7} onPress={a.onPress}>
                      <FeatureIcon name={a.iconName} size={20} color={colors.ink2} />
                      <View style={s.atext}>
                        <View style={s.atitleRow}>
                          <Text style={s.atitle}>{a.title}</Text>
                          {a.due && <View style={s.adot} />}
                        </View>
                        <Text style={s.abody}>{a.body}</Text>
                      </View>
                    </TouchableOpacity>
                    {a.snoozeId ? (
                      <TouchableOpacity
                        style={[s.round, snoozeOpen === a.id && s.roundOn]}
                        onPress={() => setSnoozeOpen(snoozeOpen === a.id ? null : a.id)}
                        accessibilityRole="button"
                        accessibilityLabel={t('alert_snooze')}
                      >
                        <FeatureIcon name="snooze" size={18} color={snoozeOpen === a.id ? colors.onInk : colors.ink2} />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={s.round} onPress={a.onRemove} accessibilityRole="button" accessibilityLabel={t('today_alert_remove')}>
                        <CrossMark size={14} color={colors.ink2} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {a.snoozeId && snoozeOpen === a.id && (
                    <View style={s.snz}>
                      {[
                        ...(new Date().getHours() < 18 ? [['later', t('alert_snooze_later')]] : []),
                        ['tomorrow', t('alert_snooze_tomorrow')],
                        a.onRemove
                          ? ['remove', t('today_alert_remove')]
                          : ['days', t('alert_snooze_days').replace('{n}', String(Math.round((ALERT_SNOOZE_MS[a.snoozeId] || 7 * 86400000) / 86400000)))],
                      ].map(([kind, label]) => (
                        <TouchableOpacity key={kind} style={s.pill} onPress={() => (kind === 'remove' ? (setSnoozeOpen(null), a.onRemove()) : snoozeAlert(a.snoozeId, kind))} accessibilityRole="button">
                          <Text style={[s.pillText, kind === 'remove' && { color: colors.risk }]}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {pendingYest.length > 0 && (
          <View style={s.block}>
            <View style={s.lab}><Text style={s.labText}>{t('today_pending_title')}</Text></View>
            {pendingYest.map((item) => {
              const pr = protocols.find((x) => x.id === item.protocolId);
              if (!pr) return null;
              const name = pr.compound_id ? t(pr.compound_id) : pr.name;
              const when = t('today_pending_row')
                .replace('{name}', name)
                .replace('{time}', formatTimeAMPM(new Date(item.slotMs).toTimeString().slice(0, 5)));
              return (
                <View key={`${item.protocolId}-${item.slotMs}`} style={s.pend}>
                  <View style={s.pendRow}>
                    <View style={s.adot} />
                    <Text style={s.pendText}>{when}</Text>
                  </View>
                  <View style={s.acts2}>
                    <TouchableOpacity style={s.btnSkip} onPress={() => skipPending(item)} accessibilityRole="button">
                      <Text style={s.btnSkipText}>{t('today_pending_skip')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.btnAct} onPress={() => takePending(item)} accessibilityRole="button">
                      <Text style={s.btnActText}>{t('today_pending_take')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {protocols.length > 0 && (
          <TodayTracker rings={rings} weekDots={weekDots} streak={streak} onHistory={() => navigation.navigate('Log')} t={t} ringRef={ringRef} />
        )}

        {/* AI food log while a reality check runs (FL-33) — lib/foodThread todayFoodHeroPolicy. */}
        <FoodLogHero variant="today" />

        {protocols.length === 0 && !loading && (
          <View style={s.empty}>
            <FeatureIcon name="syringe" size={44} color={colors.ink2} />
            <Text style={s.emptyTitle}>{t('today_empty_title')}</Text>
            <Text style={s.emptySub}>{t('today_empty_sub')}</Text>
            <TouchableOpacity style={s.btnActWide} onPress={() => navigation.navigate('Protocols')} accessibilityRole="button">
              <Text style={s.btnActText}>{t('today_add_protocol')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {protocols.length > 0 && (
          <View style={s.block}>
            <View style={s.lab}>
              <Text style={s.sectionTitle}>{t('today_doses').charAt(0).toUpperCase() + t('today_doses').slice(1)}</Text>
              {totalDoses > 0 && <Text style={s.labCount}>{t('vials_count_of').replace('{x}', String(doneDoses)).replace('{y}', String(totalDoses))}</Text>}
            </View>
            {todayCards.map(p => renderDoseCard(p))}
            {todayCards.length === 0 && allDoneToday && (
              <View style={s.doneCard}><Text style={s.doneText}>{t('today_all_done')}</Text></View>
            )}
            {takenNames.length > 0 && (
              <TouchableOpacity style={s.takenLine} onPress={() => setTakenOpen(!takenOpen)} accessibilityRole="button" accessibilityState={{ expanded: takenOpen }}>
                <CheckMark style={s.takenCheck} />
                <View style={s.takenMain}>
                  <Text style={s.takenTitle}>{takenLabel}</Text>
                  {takenOpen
                    ? todayTaken.map(l => {
                        const pr = protocols.find(x => x.id === l.protocol_id);
                        if (!pr) return null;
                        const d = new Date(l.logged_at);
                        const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                        return <Text key={l.id} style={s.takenItem}>{formatTimeAMPM(hhmm)} · {pr.compound_id ? t(pr.compound_id) : pr.name}</Text>;
                      })
                    : <Text style={s.takenItem} numberOfLines={2}>{takenNames.join(', ')}</Text>}
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {(tomorrowCards.length > 0 || next5Cards.length > 0) && (
          <View style={s.block}>
            <View style={s.foldList}>
              {foldRow('tom', t('today_section_tomorrow'), tomorrowCards)}
              {foldRow('n5', t('today_section_next5'), next5Cards)}
            </View>
            {laterCount > 0 && <Text style={s.laterHint}>{t('today_more_later').replace('{count}', laterCount)}</Text>}
          </View>
        )}

        {protocols.length > 0 && <Text style={s.disclaimer}>{t('today_disclaimer')}</Text>}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Undo toast — pinned above the tab bar, outside the ScrollView, so it is
        visible wherever the list is scrolled (S-02). */}
      {undoData && (
        <View style={s.undoBar}>
          <Text style={s.undoBarText}>{t('today_dose_logged')}</Text>
          <View style={s.undoBarActions}>
            <TouchableOpacity onPress={undoTake}>
              <Text style={s.undoBarAction}>{t('today_undo')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* S-20: the dose was undone from the site picker (Cancel / back) — say so. */}
      {takeNotice && !undoData && (
        <View style={s.takeNoticeBar} accessibilityLiveRegion="polite">
          <Text style={s.takeNoticeText}>{t('today_take_undone')}</Text>
        </View>
      )}

      {/* Body map modal — auto-opens after taking an injectable dose,
          and re-openable from the undo toast "Add site" button */}
      <BodyMapModal
        visible={bodyMapVisible}
        onClose={handleBodyMapClose}
        onBack={handleBodyMapBack}
        onSkip={bodyMapTarget?.mode === 'ask' ? handleBodyMapSkip : null}
        onSave={handleBodyMapSave}
        initialStored={bodyMapTarget?.initialStored || null}
        protocolName={protocols.find(p => p.id === bodyMapTarget?.protocolId)?.name || null}
        protocolId={bodyMapTarget?.protocolId ?? null}
        recentLogs={bodyMapTarget?.recentLogs || []}
      />

      {/* Vial continuation modal */}
      <Modal visible={showVialPrompt} transparent animationType="fade">
        <View style={s.promptOverlay}>
          <View style={s.promptCard}>
            <Text style={s.promptTitle}>{t('today_vial_done_title')}</Text>
            {continuationProtocol && (
              <Text style={s.promptProtocolName}>{continuationProtocol.name}</Text>
            )}
            <Text style={s.promptSub}>{t('today_vial_done_sub')}</Text>

            <Text style={s.promptLabel}>{t('today_vial_mix_date')}</Text>
            <View style={s.yesterdayRow}>
              <TouchableOpacity
                style={s.yesterdayPill}
                onPress={() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  setNewVialMonth(y.getMonth());
                  setNewVialDay(String(y.getDate()));
                }}
              >
                <Text style={s.yesterdayPillText}>{t('today_yesterday')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.yesterdayPill}
                onPress={() => {
                  const td = new Date();
                  setNewVialMonth(td.getMonth());
                  setNewVialDay(String(td.getDate()));
                }}
              >
                <Text style={s.yesterdayPillText}>{t('today_today_pill')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.promptMonthScroll}>
              <View style={s.promptMonthRow}>
                {MONTH_KEYS.map((mk, idx) => (
                  <TouchableOpacity
                    key={mk}
                    style={[s.promptMonthPill, newVialMonth === idx && s.promptMonthPillOn]}
                    onPress={() => setNewVialMonth(idx)}
                  >
                    <Text style={[s.promptMonthText, newVialMonth === idx && s.promptMonthTextOn]}>
                      {t(mk)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TextInput
              style={s.promptDayInput}
              placeholder={t('protocols_day_dd')}
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              maxLength={2}
              value={newVialDay}
              onChangeText={(val) => {
                const num = parseInt(val);
                if (val === '' || (num >= 1 && num <= 31)) setNewVialDay(val);
              }}
            />

            {continuationProtocol && (() => {
              const cap = dosesPerVial({
                amount: continuationProtocol.amount, unit: continuationProtocol.unit,
                dose: continuationProtocol.dose, doseUnit: continuationProtocol.dose_unit,
              });
              return cap ? (
                <Text style={[s.promptLabel, { marginTop: 12 }]}>
                  {t('today_vial_new_capacity').replace('{n}', String(cap))}
                </Text>
              ) : null;
            })()}

            <View style={s.promptActions}>
              <TouchableOpacity
                style={s.promptBtnSecondary}
                onPress={closeVialPrompt}
              >
                <Text style={s.promptBtnSecondaryText}>{t('today_vial_finished')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.promptBtnPrimary}
                onPress={createNewVial}
              >
                <Text style={s.promptBtnPrimaryText}>{t('today_vial_add')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Inactivity nudge: "is this protocol finished?" */}
      <Modal visible={showInactivePrompt} transparent animationType="fade">
        <View style={s.promptOverlay}>
          <View style={s.promptCard}>
            <Text style={s.promptTitle}>{t('today_tx_over_title')}</Text>
            {inactiveProtocol && (
              <Text style={s.promptProtocolName}>
                {inactiveProtocol.compound_id ? t(inactiveProtocol.compound_id) : inactiveProtocol.name}
              </Text>
            )}
            <Text style={s.promptSub}>{t('today_tx_over_body')}</Text>
            <View style={s.promptActions}>
              <TouchableOpacity style={s.promptBtnSecondary} onPress={snoozeInactiveProtocol}>
                <Text style={s.promptBtnSecondaryText}>{t('today_tx_over_keep')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.promptBtnPrimary} onPress={endInactiveProtocol}>
                <Text style={s.promptBtnPrimaryText}>{t('today_tx_over_end')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* The dose drop that travels from a "Mark taken" button into the ring. */}
      <Animated.View pointerEvents="none" style={[s.flyDrop, flyStyle]}>
        <Svg width={10} height={13} viewBox="-5 -7.5 10 13">
          <Path d={DROP_D} fill={colors.accent} />
        </Svg>
      </Animated.View>
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  ...legacyStyles(c),
  ...todayV21Styles(c),
});

const legacyStyles = (c) => ({
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  container: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 16, backgroundColor: c.bg },
  date: { fontSize: 13, fontWeight: '600', color: c.textMuted, letterSpacing: 0.2, marginBottom: 2 },
  greeting: { fontSize: 27, fontWeight: '700', color: c.text, letterSpacing: -0.6, marginBottom: 4 },
  sub: { fontSize: 14, color: c.textMuted },
  streakCard: { marginHorizontal: 18, marginBottom: 22, backgroundColor: c.card, borderRadius: 20, padding: 18, ...c.shadowCard },
  streakTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  streakLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  streakFireTile: { width: 42, height: 42, borderRadius: 13, backgroundColor: c.warningSoft, alignItems: 'center', justifyContent: 'center' },
  streakFire: { fontSize: 22 },
  streakCount: { fontSize: 17, fontWeight: '700', color: c.text },
  streakSub: { fontSize: 12.5, color: c.textMuted, marginTop: 1 },
  streakBadge: { backgroundColor: c.warningSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  streakBadgeText: { fontSize: 11, fontWeight: '600', color: c.warningSoftText },
  streakDots: { flexDirection: 'row', justifyContent: 'space-between' },
  streakDotCol: { alignItems: 'center', gap: 6 },
  streakDot: { width: 30, height: 30, borderRadius: 10, backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center' },
  streakDotComplete: { backgroundColor: c.successSoft },
  streakDotCheck: { fontSize: 15, fontWeight: '700', color: c.success },
  streakDotPartial: { backgroundColor: c.warningSoft },
  streakDotMissed: { backgroundColor: c.card2 },
  streakDotRest: { backgroundColor: c.accentSoft },
  streakDotToday: { backgroundColor: c.accent },
  streakDotLabel: { fontSize: 11, color: c.textFaint, fontWeight: '500' },
  streakDotLabelToday: { color: c.accent, fontWeight: '700' },
  streakExplainer: { fontSize: 11, color: c.textMuted, lineHeight: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: c.border },
  streakLogRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: 10 },
  streakLogText: { fontSize: 12, color: c.accent, fontWeight: '600' },
  streakLogChevron: { fontSize: 15, color: c.accent, fontWeight: '600', marginTop: -1 },
  // Alerts panel (pending reminders under the streak)
  alertsSection: { marginHorizontal: 18, marginBottom: 22 },
  // A-40 Pending from yesterday
  pendingSection: { marginHorizontal: 18, marginBottom: 18 },
  pendingCard: { backgroundColor: c.card, borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: c.warning, ...c.shadowSoft },
  pendingActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  pendingSkip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: c.card2 },
  pendingSkipText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
  pendingTake: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12, backgroundColor: c.accent },
  pendingTakeText: { fontSize: 14, fontWeight: '700', color: c.accentText },
  alertsHeader: { fontSize: 13, fontWeight: '700', color: c.text, letterSpacing: 0.6, marginBottom: 12 },
  alertCard: { backgroundColor: c.card, borderRadius: 18, marginBottom: 10, ...c.shadowSoft },
  alertRow: { flexDirection: 'row', alignItems: 'stretch' },
  snoozeStrip: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: c.border },
  snoozeOpt: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  snoozeOptSep: { borderLeftWidth: 0.5, borderLeftColor: c.border },
  snoozeOptText: { fontSize: 13, fontWeight: '600', color: c.accent, textAlign: 'center' },
  alertMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingLeft: 14 },
  alertIconTile: { width: 42, height: 42, borderRadius: 13, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  alertIconTileDue: { backgroundColor: c.warningSoft },
  alertIcon: { fontSize: 20 },
  alertTextWrap: { flex: 1 },
  alertTitle: { fontSize: 15, fontWeight: '700', color: c.text },
  alertBody: { fontSize: 13, color: c.textMuted, marginTop: 1 },
  alertBodyDue: { color: c.warningSoftText, fontWeight: '600' },
  alertDelete: { paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  progressRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 18, marginBottom: 16 },
  ringCard: { flex: 1.1, backgroundColor: c.card, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, ...c.shadowCard },
  ringText: { flexDirection: 'column' },
  ringPct: { fontSize: 22, fontWeight: '700', color: c.text, lineHeight: 24 },
  ringLbl: { fontSize: 12, color: c.textMuted, marginTop: 3 },
  progressStatsCol: { flex: 0.9, gap: 12 },
  miniStatCard: { flex: 1, backgroundColor: c.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center', ...c.shadowSoft },
  miniStatVal: { fontSize: 19, fontWeight: '700', color: c.text, lineHeight: 20 },
  miniStatLbl: { fontSize: 11.5, color: c.textMuted, marginTop: 2 },
  section: { paddingHorizontal: 18 },
  categorySection: { marginBottom: 8 },
  categoryLabel: { fontSize: 13, fontWeight: '700', color: c.text, letterSpacing: 0.6, marginBottom: 12, marginTop: 8 },
  laterHint: { fontSize: 12, color: c.textFaint, textAlign: 'center', paddingVertical: 12 },
  allDoneCard: { backgroundColor: c.successSoft, borderRadius: 16, padding: 18, alignItems: 'center' },
  allDoneText: { fontSize: 14, fontWeight: '700', color: c.successSoftText },
  doseCard: { backgroundColor: c.card, borderRadius: 18, marginBottom: 12, overflow: 'hidden', ...c.shadowSoft },
  takenBanner: { backgroundColor: c.successSoft, paddingVertical: 7, paddingHorizontal: 16 },
  takenBannerText: { fontSize: 12, color: c.successSoftText, fontWeight: '600' },
  partialBanner: { backgroundColor: c.warningSoft, paddingVertical: 7, paddingHorizontal: 16 },
  partialBannerText: { fontSize: 12, color: c.warningSoftText, fontWeight: '600' },
  restBanner: { backgroundColor: c.accentSoft, paddingVertical: 7, paddingHorizontal: 16 },
  restBannerText: { fontSize: 12, color: c.accent, fontWeight: '500' },
  skippedBanner: { backgroundColor: c.warningSoft, paddingVertical: 7, paddingHorizontal: 16 },
  skippedBannerText: { fontSize: 12, color: c.warningSoftText, fontWeight: '500' },
  doseCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  doseDot: { width: 10, height: 10, borderRadius: 5 },
  doseInfo: { flex: 1 },
  doseName: { fontSize: 16, fontWeight: '700', color: c.text },
  doseMeta: { fontSize: 13, color: c.textMuted, marginTop: 2 },
  doseRight: { alignItems: 'flex-end', gap: 4 },
  doseOpenChevron: { fontSize: 20, color: c.textFaint, fontWeight: '600', marginLeft: 2 },
  doseTime: { alignItems: 'flex-end' },
  doseTimeVal: { fontSize: 12, fontWeight: '500', color: c.textMuted },
  doseTimeLbl: { fontSize: 10, color: c.textFaint },
  progressText: { fontSize: 10, color: c.accent, marginTop: 2, fontWeight: '500' },
  progressBarOuter: { height: 3, backgroundColor: c.card2, marginHorizontal: 14, marginBottom: 8, borderRadius: 2 },
  progressBarInner: { height: 3, backgroundColor: c.accent, borderRadius: 2 },
  miniStreak: { backgroundColor: c.warningSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 3 },
  miniStreakText: { fontSize: 10, color: c.warningSoftText, fontWeight: '600' },
  vialStatus: { paddingHorizontal: 14, paddingBottom: 10 },
  vialStatusText: { fontSize: 11, color: c.textMuted },
  lastSiteChip: { marginHorizontal: 14, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: c.accentSoft, borderRadius: 8, alignSelf: 'flex-start' },
  lastSiteText: { fontSize: 11, color: c.accentSoftText, fontWeight: '500' },
  doseActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 2 },
  doseBtn: { flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  doseBtnText: { fontSize: 14, color: c.textMuted, fontWeight: '600' },
  doseBtnPrimary: { flex: 2, backgroundColor: c.accent, borderWidth: 0 },
  doseBtnPrimaryWrap: { flex: 2 },
  doseBtnFill: { flex: 0, alignSelf: 'stretch' },
  doseBtnOk: { backgroundColor: c.successSoft, borderWidth: 0 },
  doseBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ringBox: { width: 58, height: 58 },
  ringSvg: { position: 'absolute', left: -16, top: -16 },
  subFill: { alignSelf: 'stretch' },
  flyDrop: { position: 'absolute', left: 0, top: 0, width: 10, height: 13, zIndex: 50, elevation: 50 },
  doseBtnPrimaryText: { fontSize: 14, color: c.accentText, fontWeight: '700' },
  disclaimer: { fontSize: 10, color: c.textFaint, textAlign: 'center', marginTop: 16, marginHorizontal: 32, lineHeight: 15 },
  emptyState: { padding: 20, alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: c.text, marginBottom: 8 },
  emptySub: { fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  tipBox: { backgroundColor: c.card2, borderRadius: 12, padding: 14, width: '100%', borderWidth: 0.5, borderColor: c.border },
  tipTitle: { fontSize: 11, fontWeight: '600', color: c.textFaint, letterSpacing: 0.5, marginBottom: 10 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  tipNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  tipNumText: { fontSize: 10, color: c.accentText, fontWeight: '600' },
  tipText: { fontSize: 12, color: c.textMuted, flex: 1, lineHeight: 18 },
  // Vial continuation modal
  promptOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
  promptCard: { backgroundColor: c.card, borderRadius: 20, padding: 24, width: '100%', maxWidth: 360 },
  promptTitle: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 4 },
  promptProtocolName: { fontSize: 14, fontWeight: '600', color: c.accent, marginBottom: 6 },
  promptSub: { fontSize: 13, color: c.textMuted, marginBottom: 20, lineHeight: 19 },
  promptLabel: { fontSize: 11, color: c.textMuted, marginBottom: 6 },
  promptMonthScroll: { marginBottom: 8 },
  promptMonthRow: { flexDirection: 'row', gap: 6 },
  promptMonthPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: c.card2, borderWidth: 0.5, borderColor: c.border },
  promptMonthPillOn: { backgroundColor: c.accent, borderColor: c.accent },
  promptMonthText: { fontSize: 11, color: c.textMuted, fontWeight: '500' },
  promptMonthTextOn: { color: c.accentText, fontWeight: '600' },
  promptDayInput: { borderWidth: 0.5, borderColor: c.border, borderRadius: 10, padding: 10, fontSize: 14, color: c.text, backgroundColor: c.card2, width: 70, textAlign: 'center' },
  promptDosesInput: { borderWidth: 0.5, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 14, color: c.text, backgroundColor: c.card2 },
  promptActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  promptBtnSecondary: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 0.5, borderColor: c.border, alignItems: 'center' },
  promptBtnSecondaryText: { fontSize: 14, color: c.textMuted },
  promptBtnPrimary: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center' },
  promptBtnPrimaryText: { fontSize: 14, color: c.accentText, fontWeight: '600' },
  // Undo bar
  undoBar: { position: 'absolute', left: 16, right: 16, bottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: c.toast, ...c.shadowCard, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  // S-20 notice (same pinned surface as the Undo bar, text only)
  takeNoticeBar: { position: 'absolute', left: 16, right: 16, bottom: 12, backgroundColor: c.toast, ...c.shadowCard, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  takeNoticeText: { fontSize: 13, color: c.toastText, fontWeight: '500' },
  undoBarText: { fontSize: 13, color: c.toastText, fontWeight: '500' },
  undoBarActions: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  undoBarAction: { fontSize: 13, color: c.toastText, fontWeight: '700', textDecorationLine: 'underline' },
  // Yesterday / Today shortcut pills
  yesterdayRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  yesterdayPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: c.accentSoft, borderWidth: 0.5, borderColor: c.border },
  yesterdayPillText: { fontSize: 11, color: c.accent, fontWeight: '600' },
});

// Today v2.1 (DESIGN.md §2–§5 + the approved prototype): titles 700, big numbers 500;
// cards = raised, radius 20–24, no border / shadow / tint; the one action in ink.
const todayV21Styles = (c) => ({
  container: { flex: 1, backgroundColor: c.ground },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18, gap: 2 },
  date: { fontSize: 15, color: c.ink2 },
  title: { fontSize: 34, fontWeight: '700', color: c.ink, letterSpacing: -0.8 },
  block: { paddingHorizontal: 16, marginBottom: 26, gap: 10 },
  lab: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, gap: 8 },
  labText: { fontSize: 17, fontWeight: '600', color: c.ink },
  labCount: { fontSize: 15, fontWeight: '500', color: c.ink3, fontVariant: ['tabular-nums'] },
  sectionTitle: { fontSize: 22, fontWeight: '700', color: c.ink },
  alist: { backgroundColor: c.raised, borderRadius: 22, paddingLeft: 16, paddingRight: 8 },
  aitem: {},
  aitemSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  arow: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: 12 },
  amain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  atext: { flex: 1, minWidth: 0, gap: 2 },
  atitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  atitle: { fontSize: 17, fontWeight: '600', color: c.ink },
  adot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.attention },
  abody: { fontSize: 15, color: c.ink2 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
  roundOn: { backgroundColor: c.ink },
  snz: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 32, paddingBottom: 14 },
  pill: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
  pillText: { fontSize: 15, color: c.ink2 },
  pend: { backgroundColor: c.raised, borderRadius: 22, padding: 16, gap: 12 },
  pendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pendText: { flex: 1, fontSize: 17, color: c.ink, fontVariant: ['tabular-nums'] },
  acts2: { flexDirection: 'row', gap: 10 },
  dose: { backgroundColor: c.raised, borderRadius: 24, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, gap: 14 },
  dtop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  ddot: { width: 9, height: 9, borderRadius: 5, marginTop: 8 },
  dinfo: { flex: 1, minWidth: 0, gap: 3 },
  dname: { fontSize: 20, fontWeight: '700', color: c.ink, letterSpacing: -0.2 },
  damt: { fontSize: 16, fontWeight: '500', color: c.ink, fontVariant: ['tabular-nums'] },
  dsub: { fontSize: 15, color: c.ink2 },
  dright: { alignItems: 'flex-end', gap: 8 },
  dtime: { fontSize: 17, fontWeight: '600', color: c.ink, fontVariant: ['tabular-nums'] },
  dueTag: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: c.attention },
  dueDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.attention },
  dueText: { fontSize: 12, fontWeight: '700', color: c.attention },
  draw: { backgroundColor: c.well, borderRadius: 16, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, gap: 6 },
  drawHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  drawLabel: { fontSize: 15, fontWeight: '600', color: c.ink2 },
  drawVal: { fontSize: 22, fontWeight: '500', color: c.ink, fontVariant: ['tabular-nums'] },
  drawUnit: { fontSize: 13, fontWeight: '400', color: c.ink3 },
  drawWarn: { fontSize: 15, fontWeight: '600', color: c.risk },
  dmeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, columnGap: 14 },
  dmetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dmetaText: { fontSize: 13, color: c.ink2 },
  vialRow: { paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  vialText: { fontSize: 13, color: c.ink2 },
  acts: { flexDirection: 'row', gap: 10 },
  btnSkip: { flex: 1, minHeight: 52, borderRadius: 26, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnSkipText: { fontSize: 17, fontWeight: '700', color: c.ink },
  btnAct: { flex: 1, minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnActWide: { alignSelf: 'stretch', minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 8 },
  btnActText: { fontSize: 17, fontWeight: '700', color: c.onAct },
  doseBtnPrimaryWrap: { flex: 2 },
  doseBtn: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  doseBtnPrimary: { backgroundColor: c.act },
  doseBtnOk: { backgroundColor: c.well },
  doseBtnFill: { alignSelf: 'stretch' },
  doseBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  doseBtnPrimaryText: { fontSize: 17, fontWeight: '700', color: c.onAct },
  doneCard: { backgroundColor: c.raised, borderRadius: 22, padding: 18 },
  doneText: { fontSize: 17, color: c.ink },
  takenLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 6, paddingVertical: 4 },
  takenCheck: { marginTop: 3 },
  takenMain: { flex: 1, gap: 2 },
  takenTitle: { fontSize: 17, fontWeight: '600', color: c.ok },
  takenItem: { fontSize: 15, color: c.ink2, fontVariant: ['tabular-nums'] },
  foldList: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16 },
  foldBlock: {},
  foldHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  foldTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: c.ink },
  foldCount: { fontSize: 15, color: c.ink2, fontVariant: ['tabular-nums'] },
  foldChev: { fontSize: 16, color: c.ink3, width: 16, textAlign: 'center' },
  upRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  upTime: { width: 88, fontSize: 15, color: c.ink2, fontVariant: ['tabular-nums'] },
  upMain: { flex: 1, minWidth: 0, gap: 2 },
  upName: { fontSize: 17, fontWeight: '600', color: c.ink },
  upAmt: { fontSize: 15, color: c.ink2 },
  laterHint: { fontSize: 13, color: c.ink3, paddingHorizontal: 4 },
  empty: { marginHorizontal: 16, marginBottom: 26, backgroundColor: c.raised, borderRadius: 24, padding: 24, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: c.ink, textAlign: 'center' },
  emptySub: { fontSize: 15, color: c.ink2, textAlign: 'center' },
  disclaimer: { fontSize: 13, color: c.ink3, textAlign: 'center', paddingHorizontal: 24, marginBottom: 8 },
  undoBar: { position: 'absolute', left: 12, right: 12, bottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: c.toast, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14 },
  takeNoticeBar: { position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: c.toast, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14 },
});
