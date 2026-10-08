import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  AppState,
} from 'react-native';
import { useWindowSize } from '../lib/windowSize';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { orphanedPendingCount, discardOrphaned } from '../lib/accountActions';
import { shouldPromptOrphans, orphanPromptKey, orphanedSheet } from '../lib/orphanedPending';
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { Analytics } from '../lib/analytics';
import { syncVialAlerts, scheduleDoseReminder, cancelTodaysDoseReminders, cancelDoseReminder, REALITY_CHECK_DAYS, readReminderHealth, addNotificationsSyncedListener } from '../lib/notifications';
import { reminderChecks, scheduleState, shouldWarnToday, shouldWarnLate, shouldWarnStop, staleRefreshDays, shouldWarnSilent, reminderWarnings, shouldWarnBattery } from '../lib/reminderHealth';
import { maybeOpenSetupForExisting } from '../lib/reminderSetup';
import { getRealityStart } from '../lib/realityCheck';
import {
  getActiveProtocols, getActiveVials, getVialById, getTodayLogs, getTakenLogsSince, getLogsSince,
  deleteDoseLog, updateDoseLog, updateVial, insertVial, updateProtocol,
  getProtocolById, hardDeleteOldProtocols, endProtocol, endProtocolAtLastDose, getHistoryProtocols, deactivateVialsByProtocol,
  getBiomarkers,
  getDB, getLocalDataUserId,
} from '../lib/database';
import { requestSync, addSyncListener, isOnlineNow, notifyDataChanged } from '../lib/sync';
import { offlinePendingAlert } from '../lib/offlineAlert';
import { unsyncedCount } from '../lib/recoveryFlow';
import { TABLES, getPendingChanges } from '../lib/syncCore';
import { scanMissedDoses, recordDoseTaken, recordSkipPending, recordSkipToday, getMissedWatermark, isDoseAlreadyLogged } from '../lib/doseActions';
import { pendingFromYesterday, pendingPromptFor } from '../lib/pendingYesterday';
import { planUndoTake, takeRefusal } from '../lib/markTaken';
import { loggedOnly } from '../lib/declared';
import { wasDeleted } from '../lib/deleteDose';
import { planSitePickerAction } from '../lib/sitePickerActions';
import { needsSiteQuestion, newQuestion, commitOpts, loadQuestions, saveQuestion, dropQuestion, onQuestionsChanged, reminderCancelCount } from '../lib/siteQuestion';
import BodyMapModal from './components/BodyMapModal';
import { describeStored, hasSavedSite } from '../lib/injectionSites';
import { dosesTakenLabel, doseCountLabel, vialRemainingLabel, SNOOZE_KINDS, snoozeUntil } from '../lib/todayFormat';
import { dosesPerVial, computeDraw, trimZeros } from '../lib/doseMath';
import { drawLine, exceedsMessage } from '../lib/syringes'; // ml on 2 / 3 / 5 ml syringes (AP-21)
import { adherenceRings } from '../lib/adherenceRings';
import { dayKeyAt, msUntilNextLocalMidnight } from '../lib/dayChange';
import TodayTracker from './components/TodayTracker';
import SyringeScale from './components/SyringeScale';
import { newVialRecords } from '../lib/newVial';
import { supplyState } from '../lib/supplyLow';
import { DEFAULT_VALID_DAYS, daysUntilExpiry, expiryColor } from '../lib/vialExpiry';
import { formatTime } from '../lib/timeFormat';
import { formatDate, decimalText } from '../lib/localeFormat';
import useColumnWidth from '../components/useColumnWidth';
import { friendlyError } from '../lib/friendlyError';
import { useTheme } from '../lib/theme';
import FeatureIcon from '../components/FeatureIcon';
import { doseStreak, LOOKBACK_DAYS as STREAK_LOOKBACK_DAYS } from '../lib/doseStreak';
import RowChevron from '../components/RowChevron';
import FoldChevron from '../components/FoldChevron';
import { MONO } from '../lib/fonts';
import FoodLogHero from './components/FoodLogHero';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import BookPanes, { useBook, useBookSelection, useFoldPush } from '../components/BookPanes';
import { paneWidths } from '../lib/bookLayout';
import DosePage from './components/DosePage';
import { DTSheet, VialCells } from './components/ProtocolParts';
import { planDosePage, cardSlot, cardPlan, dosePageKey } from '../lib/dosePageState';
import { displayColor } from '../lib/protocolColors';
import { undoBarRuns } from '../lib/undoBar';
import LogScreen from './LogScreen';
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
import CheckMark from '../components/CheckMark';
import { pluralKey } from '../lib/plural';

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
const localDayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

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
// The Undo / notice toast stays 4 s (prototype toast(), Today redesign part 15).
const TOAST_MS = 4000;

// ── Schedule math ──────────────────────────────────────────────
// Extracted to lib/schedule.js (pure + unit-tested). Imported above.

export default function TodayScreen() {
  const { t, language, timeFormat } = useLanguage();
  const { colors, isDark } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  // A-44 (founder 2026-09-28): a dose reminder tap lands on that exact dose — shown highlighted
  // at the top, its Skip / Mark complete one tap away. Cleared when the user leaves Today.
  const [notifFocus, setNotifFocus] = useState(null);
  useEffect(() => {
    const f = route.params?.focusDose;
    if (!f) return;
    setNotifFocus(f);
    navigation.setParams({ focusDose: undefined });
  }, [route.params?.focusDose]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => () => setNotifFocus(null), []));
  // RC-6: Today warns when something the app can read blocks dose reminders (lib/reminderHealth).
  const [remindersBlocked, setRemindersBlocked] = useState(false);
  const [remindersLate, setRemindersLate] = useState(false); // A-106: Alarms & reminders off (Android)
  const [remindersStop, setRemindersStop] = useState(false); // A-110: Pause app activity if unused is on
  const [refreshStale, setRefreshStale] = useState(0); // A-110: days the background refresh is late
  const [remindersSilent, setRemindersSilent] = useState(false); // council 3 decision 2
  const [remindersBattery, setRemindersBattery] = useState(false); // A-112 SP-6: battery optimized (Android)
  const readReminders = useCallback(() => {
    readReminderHealth()
      .then((h) => { const checks = reminderChecks(h); setRemindersBlocked(shouldWarnToday({ ...h, checks, schedule: scheduleState(h) })); setRemindersLate(shouldWarnLate(h)); setRemindersStop(shouldWarnStop(h)); setRefreshStale(staleRefreshDays(h)); setRemindersSilent(shouldWarnSilent(h)); setRemindersBattery(shouldWarnBattery(h));
        // Decision 5: Android users who already have a reminder time see the setup step once.
        setTimeout(() => {
          if (!navigation.isFocused()) return; // never pull the user off another screen (ship-check)
          maybeOpenSetupForExisting(navigation, h.activeWithTime).catch(() => {});
        }, 600);
      })
      .catch(() => {});
  }, []);
  useFocusEffect(readReminders);
  // …and again when a reminder resync finishes (the first open of a build reads before it).
  useEffect(() => addNotificationsSyncedListener(readReminders), [readReminders]);
  // Next 5 days: the day + time column is as wide as its widest date in this language.
  const [upColW, onUpColLayout] = useColumnWidth(88, language);
  const s = useMemo(() => makeStyles(colors), [colors]);
  // S-26 book layout (docs/specs/book-layout.md): on an unfolded foldable Today is the left
  // page and the Dose log, or the dose the user tapped, the right page (BK-3). One column
  // (book false) renders exactly as before (BK-2).
  const book = useBook();
  const { sel: bookSel, params: bookParams, select: bookSelect } = useBookSelection('Today', 'log');
  useFoldPush('Today'); // BK-10: an opened Dose log becomes the pushed Log screen on fold
  const { width: winW } = useWindowSize();
  const [protocols, setProtocols] = useState([]);
  const [vials, setVials] = useState({}); // keyed by protocol_id
  const [takenCounts, setTakenCounts] = useState({}); // { protocol_id: count } — outcome 'Taken' only
  const [skippedCounts, setSkippedCounts] = useState({}); // { protocol_id: count } — outcome 'Skipped' only
  // A-78: today's rows (any outcome) — the dose card names its slots from them (cardPlan).
  const [todayRows, setTodayRows] = useState([]);
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
  const [skipAsk, setSkipAsk] = useState(null); // the "Skip dose?" sheet: { name, onSkip } (part 14)
  const skipSheetOpenRef = useRef(false);
  // DoseTrace sheets instead of native alerts (M4). `todaySheet`: errors and the "yesterday or
  // today?" question, on the screen; it counts as one of Today's popups (one at a time).
  // `vialSheet` is presented from inside the vial prompt, `siteSheet` from inside the site
  // picker (a popup opened from a popup is rendered inside it, M1).
  const [todaySheet, setTodaySheet] = useState(null);
  const todaySheetOpenRef = useRef(false);
  const [vialSheet, setVialSheet] = useState(null);
  const [siteSheet, setSiteSheet] = useState(null);
  const okButton = () => [{ label: t('ok'), kind: 'primary' }];
  function showTodaySheet(config, delayMs = 0) {
    todaySheetOpenRef.current = true;
    if (delayMs) setTimeout(() => setTodaySheet(config), delayMs); else setTodaySheet(config);
  }
  function closeTodaySheet() {
    setTodaySheet(null);
    todaySheetOpenRef.current = false;
    setTimeout(openNextQuestion, 450); // a site question that waited opens
  }
  const todayError = (body, delayMs) => showTodaySheet({ icon: 'warning', title: t('error'), body, buttons: okButton() }, delayMs);
  const [takeNotice, setTakeNotice] = useState(false); // "Not marked as taken" after Cancel / a confirmed back (S-25)

  // S-26 book layout (BK-16, BK-19, BK-20): the rows the dose page reads (yesterday + today),
  // a revision the embedded Dose log refreshes on, the undo record of every dose Today wrote
  // this session (Undo on the dose page reuses applyUndo with it), and the embedded Log's
  // site editor in Today's one-popup-at-a-time queue. All idle in one column (BK-2).
  const bookRef = useRef(book); bookRef.current = book;
  const [pageLogs, setPageLogs] = useState([]);
  const [dataRev, setDataRev] = useState(0);
  const [, setPageTick] = useState(0);
  const undoRecordsRef = useRef(new Map()); // logId → the undo record of a dose written here
  const logPopupOpenRef = useRef(false); // the embedded Dose log's site editor is open
  const logPopupWaiterRef = useRef(null); // the embedded Log's editor, waiting for Today's popup
  const vialDeferredRef = useRef(false); // the vial prompt waits for the embedded Log's editor

  // Last-site recall chip per protocol — pure recall, NOT a recommendation.
  // Shape: { [protocolId]: { stored: '{"type":"subq","sites":["abdomen_lr"]}', daysAgo: 3 } } (named when drawn)
  const [lastSiteByProtocol, setLastSiteByProtocol] = useState({});

  // The Undo bar's time runs only while nothing covers it: a pop-up in front (vial finished,
  // site picker, still-going, Skip dose?) pauses it, and closing the pop-up gives the bar its
  // full time again. A new take replaces the bar and restarts the time.
  const popupOpen = showVialPrompt || bodyMapVisible || showInactivePrompt || !!skipAsk;
  useEffect(() => {
    if (!undoBarRuns({ hasUndo: !!undoData, popupOpen })) return undefined;
    const t = setTimeout(() => setUndoData(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [undoData, popupOpen]);

  useFocusEffect(
    useCallback(() => {
      // Fetch display name
      getCachedUser().then(user => {
        if (user?.user_metadata?.display_name) {
          setUserName(user.user_metadata.display_name.split(/\s+/)[0]); // first name only
        }
      }).catch(() => {});
      cleanupOldDeletedProtocols();
      checkOrphans();
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
        logPopupWaiterRef.current = null; // the embedded Log is gone with Today
      };
    }, [])
  );

  // F6 (Today v2.1): a new local day re-dates Today — on return to the foreground (any layout)
  // and at midnight while it is open: the date, doses, Pending from yesterday, the Missed scan
  // and the tracker are read again for the new day.
  const shownDayRef = useRef(dayKeyAt(Date.now()));
  const [, setDayTick] = useState(0);
  function refreshIfNewDay() {
    if (dayKeyAt(Date.now()) === shownDayRef.current) return;
    shownDayRef.current = dayKeyAt(Date.now());
    setDayTick((n) => n + 1);
    scanMissedDoses().then((n) => { if (n > 0) { requestSync(); fetchStreakData(); fetchProtocolStreaks(); } }).catch(() => {});
    fetchProtocols();
    fetchTodayLogs();
    fetchPendingYesterday();
    fetchStreakData();
    fetchProtocolStreaks();
    fetchAlerts();
  }
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && focusedRef.current) refreshIfNewDay();
    });
    let timer = null;
    const tick = () => { if (focusedRef.current) refreshIfNewDay(); timer = setTimeout(tick, msUntilNextLocalMidnight(Date.now()) + 1000); };
    timer = setTimeout(tick, msUntilNextLocalMidnight(Date.now()) + 1000);
    return () => { sub.remove(); if (timer) clearTimeout(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A-46 extension: offline with changes waiting to be pushed → an entry in the alerts box.
  // Re-checked on connectivity changes, sync results and every save; the reconnect sync
  // (lib/sync) clears it once nothing is pending.
  const [offlinePending, setOfflinePending] = useState(false);
  function refreshOffline() {
    let pending = 0;
    try { pending = unsyncedCount(getDB(), getLocalDataUserId(), TABLES, getPendingChanges); } catch { pending = 0; }
    setOfflinePending(offlinePendingAlert({ online: isOnlineNow(), pendingCount: pending }));
  }
  useEffect(() => {
    refreshOffline();
    return addSyncListener((e) => {
      if (e.type === 'connectivity' || e.type === 'sync_complete' || e.type === 'sync_error' || e.type === 'data_changed') refreshOffline();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // BK-16 / BK-19 (book layout only): the dose page reads yesterday's and today's rows. Load
  // them when the window becomes two pages, and again when the app returns to the
  // foreground (a notification action or another device may have logged a dose meanwhile).
  useEffect(() => { if (book) fetchPageLogs(); }, [book]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active' || !bookRef.current || !focusedRef.current) return;
      fetchProtocols();
      fetchTodayLogs();
      fetchPendingYesterday();
    });
    return () => sub.remove();
  }, []);
  // An open dose page follows the clock: 20:00 turns from upcoming to due while it is shown.
  const dosePageOpen = book && typeof bookSel === 'string' && bookSel.startsWith('dose:');
  useEffect(() => {
    if (!dosePageOpen) return undefined;
    const id = setInterval(() => setPageTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, [dosePageOpen]);

  // Yesterday's and today's rows of every protocol, for the dose page (book layout only).
  async function fetchPageLogs() {
    if (!bookRef.current) return;
    try {
      const user = await getCachedUser();
      if (!user) return;
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      since.setDate(since.getDate() - 1);
      setPageLogs(getLogsSince(user.id, since.toISOString()) || []);
      setDataRev((n) => n + 1);
    } catch { /* keep the last rows */ }
  }

  // The undo record of a dose Today just wrote, kept for the dose page's Undo (BK-16).
  function keepUndo(record) {
    if (record && record.logId != null) {
      undoRecordsRef.current.set(record.logId, record);
      // A-78: a skipped row logged, undone and logged again is the same row id — its new
      // write gets its own Undo (the old record was replaced above).
      undoneIdsRef.current.delete(record.logId);
    }
  }

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

  // Snooze an alert (Today redesign part 2, prototype strip): "Tomorrow" or "In 3 days",
  // both until 09:00 that day (lib/todayFormat.js snoozeUntil).
  async function snoozeAlert(id, kind) {
    const until = snoozeUntil(kind, Date.now());
    setSnoozeOpen(null);
    const next = { ...alertSnooze, [id]: until };
    setAlertSnooze(next);
    try { await AsyncStorage.setItem(ALERT_SNOOZE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
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
        // BK-20: nor over the embedded Dose log's site editor.
        if (bodyMapOpenRef.current || siteQueueRef.current.length || logPopupOpenRef.current) return;
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
    // A-83: ENDED, never deleted — its doses stay in the Dose log, the report, adherence and the
    // curve's past; it is never purged (lib/protocolEnd). Restart lives on the Protocols list.
    // A-86: dated at the last Taken dose (the prompt comes 7+ days after it), never the tap.
    endProtocolAtLastDose(p.id);
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
        // The stored value is kept and named when the card is drawn, in the language shown then
        // (lastSiteLanguage.test.js): naming it here froze the name in the language of this read.
        if (!hasSavedSite(l.injection_site)) return;
        const ms = Date.now() - new Date(l.logged_at).getTime();
        const daysAgo = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
        out[pid] = { stored: l.injection_site, daysAgo };
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
      // A year back: a weekly protocol's dose streak keeps counting past 30 days (founder 2026-10-05).
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - STREAK_LOOKBACK_DAYS);
      const activeProtocols = getActiveProtocols(user.id) || [];
      // A-30: only doses logged in the app.
      const logs = loggedOnly(getTakenLogsSince(user.id, thirtyDaysAgo.toISOString()) || [], activeProtocols);
      // Group by protocol_id → { dayString: count } (multi-dose aware)
      const byProtocol = {};
      logs.forEach(l => {
        const day = new Date(l.logged_at).toDateString();
        if (!byProtocol[l.protocol_id]) byProtocol[l.protocol_id] = {};
        byProtocol[l.protocol_id][day] = (byProtocol[l.protocol_id][day] || 0) + 1;
      });
      // Doses taken in a row, never days (founder 2026-10-05: a weekly protocol said "2 days").
      const streaks = {};
      const now = new Date();
      activeProtocols.forEach(p => { streaks[p.id] = doseStreak(p, byProtocol[p.id] || {}, now); });
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
      since.setDate(since.getDate() - 2); // A-51: yesterday may lie in another zone
      since.setHours(since.getHours() - 3);
      const logs = getLogsSince(user.id, since.toISOString()) || [];
      // A-51: slots rebuilt in the zone of their own day (the device's zone history); without a
      // zone name, A-49's guard (never a slot from before the last time-zone change).
      let tzSinceMs = null;
      let zoneHistory = null;
      try { ({ tzSinceMs, zoneHistory } = await getMissedWatermark()); } catch { /* best-effort */ }
      setPendingYest(pendingFromYesterday({ protocols: getActiveProtocols(user.id) || [], logs, nowMs: Date.now(), tzSinceMs, zoneHistory }));
    } catch { setPendingYest([]); }
    fetchPageLogs(); // BK-19: the dose page follows every write and undo (book layout only)
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
  function writePending(protocolId, writeOpts, extraDeleteIds = []) {
    const { toastText, ...write } = writeOpts; // the toast line is not part of the write
    const res = recordDoseTaken(protocolId, write);
    if (res && res.logId) {
      const timer = null; // armed by the Undo bar effect (lib/undoBar.js)
      const record = {
        logId: res.logId, flipped: res.flipped, flippedFrom: res.flippedFrom, prevLoggedAt: res.prevLoggedAt, prevInjectionSite: res.prevInjectionSite, protocolId, pending: true, extraDeleteIds,
        vialId: res.vialId, prevDosesTaken: res.prevVialDosesTaken, vialFinished: !!res.vialFinished,
        oralPrevUnitsTaken: res.oralPrevUnitsTaken, timer, fx: null, text: toastText || null,
      };
      setUndoData(record);
      keepUndo(record);
      const p = getProtocolById(protocolId);
      if (res.vialFinished && p && p.type === 'recon') showVialPromptFor(p, write.vialPromptDelay);
    }
    afterPendingWrite();
  }

  // "Didn't take": one Skipped row at yesterday's slot time (never the tap time).
  function skipPending(item) {
    const res = recordSkipPending(item.protocolId, { dayKey: item.dayKey, slotMs: item.slotMs });
    if (res && res.logId) {
      const timer = null; // armed by the Undo bar effect (lib/undoBar.js)
      const record = { logId: res.logId, flipped: false, protocolId: item.protocolId, pending: true, vialId: null, prevDosesTaken: null, oralPrevUnitsTaken: null, timer, fx: null };
      setUndoData(record);
      keepUndo(record);
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
      setTodayRows(data);
      setTodayTaken(data.filter(d => d.outcome === 'Taken').sort((a, b) => (a.logged_at < b.logged_at ? -1 : 1)));
    }
    fetchRings(user.id);
    fetchPageLogs(); // BK-19 (book layout only)
  }

  // Today v2.1 rings: doses taken ÷ doses scheduled (today / 7 days / 30 days).
  function fetchRings(uid) {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 40);
      const ps = getHistoryProtocols(uid) || []; // active + ended (A-83: an ended one keeps its past days)
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

    // Active + ended (A-83): an ended protocol's past days still count, nothing after its end.
    const activeProtocols = getHistoryProtocols(user.id) || [];
    // A-30: only doses logged in the app (declared history before a protocol was added never counts).
    const logs = loggedOnly(getLogsSince(user.id, thirtyDaysAgo.toISOString()) || [], activeProtocols);
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
  // A-38 (b): a refused tap is never silent — why nothing was written, in Today's sheet.
  // Returns true when the sheet is shown.
  function showTakeRefused(protocol, res) {
    let fresh = null;
    try { fresh = getProtocolById(protocol.id); } catch { fresh = null; }
    const r = takeRefusal({ protocol: fresh, alreadyLogged: !!(res && res.alreadyLogged) });
    if (!r) return false;
    const src = fresh || protocol;
    const name = src && (src.compound_id ? t(src.compound_id) : src.name);
    showTodaySheet({ title: t(r.title), body: t(r.body).replace('{name}', name || ''), buttons: okButton() });
    return true;
  }

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
        // Ended/deleted, or already logged elsewhere: show the real state and say why (A-38 b).
        actionInProgressRef.current = false;
        resetTake(protocol.id);
        fetchTodayLogs();
        fetchProtocols();
        showTakeRefused(protocol, res);
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
        fetchTodayLogs(); // A-78: the card's slots (a logged skip leaves its line) follow the write
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

      // The Undo bar time is armed by the effect that pauses behind pop-ups (lib/undoBar.js).
      const timer = null;
      // The full undo record of THIS take (the Undo bar).
      const record = {
        logId,
        flipped: res.flipped,
        flippedFrom: res.flippedFrom,
        prevLoggedAt: res.prevLoggedAt, // A-78: Undo puts a logged skip back at its own time
        prevInjectionSite: res.prevInjectionSite,
        extraDeleteIds: opts.extraDeleteIds || [],
        protocolId: protocol.id,
        vialId: res.vialId,
        prevDosesTaken: res.prevVialDosesTaken,
        vialFinished: !!res.vialFinished,
        oralPrevUnitsTaken,
        oralUnitsAdded: res.oralUnitsAdded,
        timer,
        fx,
        text: opts.toastText || null, // Q22 = A: "Site saved · {site}" after a saved site
      };
      setUndoData(record);
      keepUndo(record); // BK-16: the dose page's Undo of this slot
      fetchPageLogs(); // BK-16 / BK-19: the dose page shows the written slot (book layout only)

      actionInProgressRef.current = false;
    } catch (err) {
      actionInProgressRef.current = false;
      if (saved) {
        // The dose IS logged; only follow-up bookkeeping (vial/supply) failed.
        // Keep "Taken" — resetting the button would invite a duplicate dose.
        console.warn('markTaken follow-up failed', err);
      } else {
        resetTake(protocol.id); // the button already shows "Taken" — put it back
        // After a site answer the picker is still fading out: the sheet waits for it.
        todayError(friendlyError(err, t, 'error_save_failed'), opts.vialPromptDelay ? 700 : 0);
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

  // Entries of a protocol deleted forever on another device (lib/orphanedPending): they block
  // sign-out, so the user is asked once per new count — Keep for now (remembered) or Discard
  // (removes only those entries). Never over another of Today's popups (asked on a later focus).
  function checkOrphans() {
    (async () => {
      const owner = getLocalDataUserId();
      if (!owner) return;
      const n = await orphanedPendingCount();
      const key = orphanPromptKey(owner);
      let last = null;
      try { last = await AsyncStorage.getItem(key); } catch { /* ask */ }
      if (!shouldPromptOrphans(n, last) || !focusedRef.current || todayPopupBusy()) return;
      const remember = (v) => { AsyncStorage.setItem(key, String(v)).catch(() => {}); };
      showTodaySheet(orphanedSheet({
        t, count: n,
        onKeep: () => remember(n),
        onDiscard: () => { discardOrphaned().then(() => { remember(0); refreshOffline(); }).catch(() => {}); },
      }));
    })().catch(() => {});
  }

  // A popup of Today's own is open (or the vial prompt is about to open).
  function todayPopupBusy() {
    return bodyMapOpenRef.current || vialPromptOpenRef.current || inactivePromptOpenRef.current || skipSheetOpenRef.current || todaySheetOpenRef.current;
  }

  async function openNextQuestion() {
    // BK-20: one popup at a time across both pages — also not over the embedded Dose log's
    // site editor; the question waits and opens when that editor closes.
    if (!focusedRef.current || bodyMapOpenRef.current || vialPromptOpenRef.current || inactivePromptOpenRef.current || logPopupOpenRef.current || skipSheetOpenRef.current || todaySheetOpenRef.current) return;
    const q = siteQueueRef.current.shift();
    if (!q) { runLogPopupWaiter(); return; }
    // Paused / deleted, or already logged (another device, a banner): nothing to ask.
    if (isDoseAlreadyLogged(q.protocolId, commitOpts(q))) {
      dropQuestion(AsyncStorage, q.key);
      resetTake(q.protocolId);
      // The user tapped Mark taken for it: say why nothing is written (A-38 b); closing the
      // sheet opens the next question.
      const qp = protocols.find((x) => x.id === q.protocolId) || getProtocolById(q.protocolId);
      if (showTakeRefused(qp || { id: q.protocolId }, { alreadyLogged: true })) return;
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
    const write = { tapMs: o.tapMs, dayKey: o.dayKey, slotMs: o.slotMs, flipRowId: o.flipRowId, atNow: o.atNow, injectionSite: site || null, vialPromptDelay: 450 };
    // Q22 = A (founder 2026-10-02): a dose written with its site says so in the toast.
    const siteName = site ? describeStored(site, t) : null;
    const toastText = siteName ? t('today_site_saved').replace('{site}', siteName) : null;
    let extraDeleteIds = [];
    if (o.skipYesterday) {
      const skipped = recordSkipPending(protocol.id, { dayKey: o.skipYesterday.dayKey, slotMs: o.skipYesterday.slotMs });
      if (skipped && skipped.logId) extraDeleteIds = [skipped.logId];
      fetchPendingYesterday();
    }
    vialPromptPendingRef.current = false;
    if (q.source === 'pending' || o.dayKey !== localDayKey(Date.now())) writePending(protocol.id, { ...write, toastText }, extraDeleteIds);
    else markTaken(protocol, { write, extraDeleteIds, vialPromptDelay: 450, cancelUpTo: reminderCancelCount(q, 0), toastText });
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
    // Asked from inside the picker (BodyMapModal sheet): Stay first, Leave in the risk colour.
    setSiteSheet({
      title: t('today_site_back_title'),
      body: t('today_site_back_msg'),
      buttons: [
        { label: t('today_site_back_stay'), kind: 'secondary' },
        { label: t('today_site_back_leave'), kind: 'danger', onPress: () => pickerAction('leave') },
      ],
    });
  }
  function handleBodyMapSkip() { pickerAction('skip'); }
  function handleBodyMapSave({ stored }) { pickerAction('save', stored); }

  function undoTake() { applyUndo(undoData); }

  // Undo ONE take, from its own record. Never twice for the same log.
  function applyUndo(record) {
    // A row deleted from the Dose log is gone: its Undo would give the dose back a second
    // time, or write the deleted row back (founder 2026-10-02, delete a dose).
    if (!record || record.logId == null || undoneIdsRef.current.has(record.logId) || wasDeleted(record.logId)) return;
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
      // A-78: a logged skip goes back to Skipped at its own time, with its own site.
      if (plan.restoreMissedId != null) updateDoseLog(plan.restoreMissedId, { outcome: plan.restoreOutcome, injection_site: plan.restoreSite, ...(plan.restoreLoggedAt ? { logged_at: plan.restoreLoggedAt } : {}) });
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
      fetchTodayLogs(); // A-78: the card's slots / skipped lines read back after the undo
      fetchPendingYesterday();
      fetchStreakData();
      fetchProtocolStreaks();
      syncVialAlerts().catch(() => {});
      requestSync();
    } catch { /* ignore */ }
  }

  // A-78 (founder 2026-10-01): Skip writes the Skipped row of ONE slot — the card's earliest
  // open slot (or the dose page's slot) — stamped at that slot's scheduled time, never the tap
  // time, so a later Mark taken names it (lib/markTaken.js planSkipToday). Never moves supply.
  // Part 14 (founder 2026-10-02): "Skip dose?" is the DoseTrace sheet (DTSheet), never the
  // iOS alert; Skip in ink. The write runs once the sheet has closed.
  function skipDose(protocol, slot) {
    const write = () => {
      try {
        const res = recordSkipToday(protocol.id, { slotMs: slot ? slot.slotMs : null });
        if (!res || !res.logId) { fetchTodayLogs(); return; } // that slot already has a row
        const logId = res.logId;
        // BK-16: the dose page's Undo of this Skip goes through applyUndo too. A skip
        // never changes today's Taken count or the supply (todayCount 'none', as the
        // Pending block's skip); the Undo bar is unchanged (no record shown here).
        keepUndo({ logId, flipped: false, protocolId: protocol.id, pending: true, extraDeleteIds: [], vialId: null, prevDosesTaken: null, oralPrevUnitsTaken: null, timer: null, fx: null });
        fetchPageLogs();
        setSkippedCounts(prev => ({ ...prev, [protocol.id]: (prev[protocol.id] || 0) + 1 }));
        fetchTodayLogs(); // A-78: the card moves to the next open slot and shows this skip's line
        Analytics.doseLogged({ name: protocol.name, type: protocol.type, outcome: 'Skipped' });
        requestSync();
      } catch (err) {
        todayError(friendlyError(err, t, 'error_save_failed'));
      }
    };
    skipSheetOpenRef.current = true;
    setSkipAsk({ name: protocol.name, onSkip: write });
  }

  // The Skip sheet closed (Cancel, Skip or a tap outside): a site question that waited opens.
  function closeSkipAsk() {
    setSkipAsk(null);
    skipSheetOpenRef.current = false;
    setTimeout(openNextQuestion, 450);
  }

  // BK-20: the embedded Dose log (Today's right page) asks before opening its site editor.
  // While a popup of Today's is open the editor waits and opens once Today's queue is empty;
  // while the editor is open Today's questions and prompts wait for it to close.
  function runLogPopupWaiter() {
    const open = logPopupWaiterRef.current;
    if (!open || todayPopupBusy() || logPopupOpenRef.current) return;
    logPopupWaiterRef.current = null;
    open();
  }
  const logPopupGate = {
    busy: () => todayPopupBusy() || siteQueueRef.current.length > 0,
    wait: (open) => { logPopupWaiterRef.current = open; },
    opened: () => { logPopupOpenRef.current = true; },
    closed: () => {
      logPopupOpenRef.current = false;
      if (vialDeferredRef.current) {
        vialDeferredRef.current = false;
        vialTimerRef.current = setTimeout(() => setShowVialPrompt(true), 450);
        return;
      }
      setTimeout(openNextQuestion, 450); // a question that waited for the editor
    },
  };

  // The ONE way the vial prompt closes ("Protocol finished", "Log new vial", or the undo
  // of that dose). A site question waiting behind it opens after the prompt has faded out.
  function closeVialPrompt() {
    clearTimeout(vialTimerRef.current);
    vialDeferredRef.current = false;
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
    vialDeferredRef.current = false;
    // BK-20: the embedded Dose log's site editor is open — the prompt opens after it closes.
    if (logPopupOpenRef.current) { vialDeferredRef.current = true; return; }
    if (delayMs) vialTimerRef.current = setTimeout(() => setShowVialPrompt(true), delayMs); else setShowVialPrompt(true);
  }

  async function createNewVial() {
    if (!continuationProtocol) return;
    try {
      const user = await getCachedUser();
      if (!user) return;
      const mixDate = toPastDateString(newVialMonth, newVialDay);
      if (!mixDate) { setVialSheet({ icon: 'warning', title: t('error'), body: t('today_invalid_date'), buttons: okButton() }); return; }
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
      setVialSheet({ icon: 'warning', title: t('error'), body: friendlyError(err, t, 'error_save_failed'), buttons: okButton() });
    }
  }

  function formatVialDate(dateStr) {
    if (!dateStr) return '—';
    return formatDate(String(dateStr).slice(0, 10), language, 'dayMonth') || '—';
  }

  // Computed in render (not cached in state) so both follow the app language.
  const _hour = new Date().getHours();
  const greeting = t(_hour < 12 ? 'today_greeting_morning' : _hour < 18 ? 'today_greeting_afternoon' : 'today_greeting_evening');
  // Localized date in the app language (lib/localeFormat: fixed tables, never throws).
  const today = formatDate(new Date(), language, 'weekdayLong');

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

  // opts.slot (A-78): the slot this tap logs — { slotMs, ti } of the card's next open slot or
  // the dose page's slot, plus flipRowId for a skipped slot's "Mark taken" (that row turns
  // Taken). Without it the shared plan falls back to its own rules (older callers).
  function handleTake(p, btnRect, attempt = 0, opts = {}) {
    const tapMs = opts.tapMs || Date.now(); // S-25: the dose's time is the tap
    const slot = opts.slot || { slotMs: null, flipRowId: null, ti: null };
    // Another card's write is mid-flight: retry shortly rather than let the
    // button show "Taken" for a dose that was never logged.
    if (actionInProgressRef.current) {
      if (attempt < 12) setTimeout(() => handleTake(p, btnRect, attempt + 1, { ...opts, tapMs }), 250);
      else {
        resetTake(p.id);
        todayError(t('error_save_failed'));
      }
      return;
    }
    // A-40: yesterday's dose for this protocol is still pending — ask which day this
    // dose is for before writing anything (earliest pending slot).
    // A skipped slot of TODAY named by its line is today's dose by definition: no day prompt.
    const pend = slot.flipRowId != null ? null : pendingPromptFor(pendingYest, p.id, { pendingResolved: !!opts.pendingResolved });
    if (pend) {
      const vars = (str) => str.replace('{name}', p.compound_id ? t(p.compound_id) : p.name).replace('{time}', formatTimeAMPM(new Date(pend.slotMs).toTimeString().slice(0, 5)));
      // Cancel last (three choices stack); a tap outside or Android back = Cancel.
      showTodaySheet({
        title: t('today_pending_prompt_title'),
        body: vars(t('today_pending_prompt_msg')),
        buttons: [
          { label: t('today_pending_prompt_yesterday'), kind: 'primary', onPress: () => { resetTake(p.id); takePending(pend); } },
          // Nothing is written here: yesterday's Skipped row goes in with this dose (S-25).
          { label: t('today_pending_prompt_today'), kind: 'secondary', onPress: () => {
            handleTake(p, btnRect, 0, { ...opts, pendingResolved: true, tapMs, skipYesterday: { dayKey: pend.dayKey, slotMs: pend.slotMs } });
          } },
          { label: t('cancel'), kind: 'secondary', onPress: () => resetTake(p.id) },
        ],
        onDismiss: () => resetTake(p.id),
      });
      return;
    }
    // An injectable: ask where it was injected; the answer writes it (S-25).
    if (needsSiteQuestion(p.type)) {
      askSite(newQuestion({ protocolId: p.id, tapMs, skipYesterday: opts.skipYesterday || null, source: 'today', slotMs: slot.slotMs, flipRowId: slot.flipRowId, ti: slot.ti }));
      return;
    }
    // An oral dose is written now ("today, skip yesterday" writes both rows together).
    const extraDeleteIds = opts.skipYesterday ? skipYesterdayRow(p.id, opts.skipYesterday) : [];
    const write = { tapMs, slotMs: slot.slotMs, flipRowId: slot.flipRowId };
    const cancelUpTo = Number.isFinite(slot.ti) ? slot.ti + 1 : 0; // that slot's reminders and earlier
    if (reduceRef.current || !btnRect) { markTaken(p, { extraDeleteIds, write, cancelUpTo }); return; }
    // A-80 (founder: the take animation felt slow): the drop lands in 360 ms and the
    // card / tracker update exactly when it lands, never before.
    const LIFT = 60, FLIGHT = 300;
    landingAtRef.current = Date.now() + LIFT + FLIGHT;
    // Write now; let the card re-sort after the drop lands.
    markTaken(p, { deferUi: LIFT + FLIGHT, extraDeleteIds, write, cancelUpTo });
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
          : t('today_alert_rc_when').replace('{date}', formatDate(remind, language, 'dayMonth')),
        // Lands on the reality check itself: Progress, scrolled to its card (pre-build pass m6).
        onPress: () => navigation.navigate('Progress', { focus: 'reality' }),
        snoozeId: 'reality_check',
      });
    }
    // 0) Offline with changes not backed up yet (A-46 extension). Tapping it tries a sync.
    if (offlinePending) {
      list.push({
        id: 'offline_pending', iconName: 'repeat', due: false,
        title: t('today_alert_offline_title'),
        body: t('today_alert_offline_body'),
        onPress: () => requestSync(),
        snoozeId: 'offline_pending',
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
            ? t(pluralKey('today_alert_supply_one', low[0].rem, language)).replace('{name}', low[0].name).replace('{n}', String(low[0].rem))
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
    // Founder 2026-10-07 (council 3 decision 2): Silent mode is on — nothing else will arrive.
    if (remindersSilent && !(alertSnooze.reminders_silent && nowMs < alertSnooze.reminders_silent)) {
      list.push({
        id: 'reminders_silent', iconName: 'mute', due: true,
        title: t('today_alert_silent_title'),
        body: t('today_alert_silent_body'),
        onPress: () => navigation.navigate('ReminderCheck'),
        snoozeId: 'reminders_silent',
      });
    }
    // Decision 3: two or more reminder warnings at once are ONE card. A-112 SP-6: every card opens
    // "Make sure your reminders arrive" (at its item); Battery optimized joins them.
    const warnings = reminderWarnings({ blocked: remindersBlocked, late: remindersLate, stop: remindersStop, stale: refreshStale, battery: remindersBattery });
    if (warnings.length >= 2 && !(alertSnooze.reminders_combined && nowMs < alertSnooze.reminders_combined)) {
      list.push({
        id: 'reminders_combined', iconName: 'warning', due: true,
        title: t('today_alert_combined_title').replace('{n}', String(warnings.length)),
        body: t('today_alert_combined_body'),
        onPress: () => navigation.navigate('ReminderCheck'),
        snoozeId: 'reminders_combined',
      });
    }
    if (warnings.length < 2) {
    // 5) Reminders blocked (RC-6, founder 2026-10-05 "1 B"): a readable phone setting stops them.
    if (remindersBlocked && !(alertSnooze.reminders_blocked && nowMs < alertSnooze.reminders_blocked)) {
      list.push({
        id: 'reminders_blocked', iconName: 'warning', due: true,
        title: t('today_alert_reminders_title'),
        body: t('today_alert_reminders_body'),
        onPress: () => navigation.navigate('ReminderCheck'),
        snoozeId: 'reminders_blocked',
      });
    }
    // 6) Reminders may be late (A-106, founder 2026-10-07): Android "Alarms & reminders" is off, so
    // every reminder can arrive up to 1 h late. Opens the screen at that item (A-112 SP-6).
    if (remindersLate && !(alertSnooze.reminders_late && nowMs < alertSnooze.reminders_late)) {
      list.push({
        id: 'reminders_late', iconName: 'clock', due: true,
        title: t('today_alert_late_title'),
        body: t('today_alert_late_body'),
        onPress: () => navigation.navigate('ReminderCheck', { focus: 'alarms' }),
        snoozeId: 'reminders_late',
      });
    }
    // A-112 SP-6 (founder: "até todos os campos OK"): DoseTrace's battery is optimized, so Android can
    // delay reminders. Opens the screen at the Battery item.
    if (remindersBattery && !(alertSnooze.reminders_battery && nowMs < alertSnooze.reminders_battery)) {
      list.push({
        id: 'reminders_battery', iconName: 'calc_bolt', due: true,
        title: t('today_alert_battery_title'),
        body: t('today_alert_battery_body'),
        onPress: () => navigation.navigate('ReminderCheck', { focus: 'battery' }),
        snoozeId: 'reminders_battery',
      });
    }
    // 7) Reminders may stop (A-110 RG-5): "Pause app activity if unused" is on, so after months without
    // opening the app Android can freeze it and drop its reminders. Opens the screen at that item.
    if (remindersStop && !(alertSnooze.reminders_stop && nowMs < alertSnooze.reminders_stop)) {
      list.push({
        id: 'reminders_stop', iconName: 'pause', due: true,
        title: t('today_alert_stop_title'),
        body: t('today_alert_stop_body'),
        onPress: () => navigation.navigate('ReminderCheck', { focus: 'hibernation' }),
        snoozeId: 'reminders_stop',
      });
    }
    // 8) The background refresh is more than 2 days late (A-110 RG-5): Android is holding DoseTrace.
    if (refreshStale > 0 && !(alertSnooze.reminders_stale && nowMs < alertSnooze.reminders_stale)) {
      list.push({
        id: 'reminders_stale', iconName: 'refresh', due: true,
        title: t('today_alert_stale_title').replace('{n}', String(refreshStale)),
        body: t('today_alert_stale_body'),
        onPress: () => navigation.navigate('ReminderCheck', { focus: 'refresh' }), // the full check has the refresh row (council 3)
        snoozeId: 'reminders_stale',
      });
    }
    }
    return list;
  }, [rcStart, latestLabDate, protocols, vials, alertSnooze, language, offlinePending, remindersBlocked, remindersLate, remindersStop, refreshStale, remindersSilent, remindersBattery]);

  function formatTimeAMPM(time24) {
    return formatTime(time24, language, timeFormat);
  }

  // A-78: a multi-dose slot's time on the card ("Take 20:00 dose"); null for a once-a-day
  // protocol or a slot without a reminder time. The slot itself comes from cardPlan (the
  // next OPEN slot — a skipped slot counts as filled), as do the card's Due tag and buttons.
  function slotTakeLabel(p, slot) {
    if (!slot || (p.doses_per_day || 1) <= 1 || !Number.isFinite(slot.slotMs)) return null;
    return formatTimeAMPM(new Date(slot.slotMs).toTimeString().slice(0, 5));
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

  // ── Book layout: the dose page (S-26 BK-3, BK-16) ─────────────
  // A tapped dose is ONE slot: its protocol, its day and its scheduled time (dosePageKey), so
  // a twice-daily protocol's 08:00 and 20:00, and yesterday's pending 20:00, are different
  // items. What the page offers comes from lib/dosePageState.js planDosePage: due and pending
  // doses get Skip / Mark taken through Today's own paths, upcoming doses their info only, a
  // logged dose its state and Undo (never a second Mark taken).
  const pickedDose = book && typeof bookSel === 'string' && bookSel.startsWith('dose:') && bookParams && bookParams.protocolId != null
    ? bookParams : null;
  const todayKey = localDayKey(Date.now());
  // A-44: today's dose its reminder named, while it is still open (a dose already logged, or
  // one for another day, is not pulled up). Yesterday's pending slot is highlighted in place.
  const focusCard = (() => {
    if (!notifFocus || (notifFocus.dayKey && notifFocus.dayKey !== todayKey)) return null;
    const p = todayCards.find((x) => x.id === notifFocus.protocolId);
    if (!p) return null;
    return cardPlan({ protocol: p, logs: todayRows, nowMs: Date.now() }).next ? p : null;
  })();
  const isFocusPend = (item) => !!(notifFocus && notifFocus.dayKey && notifFocus.dayKey !== todayKey
    && item.protocolId === notifFocus.protocolId && (notifFocus.slotMs == null || item.slotMs === notifFocus.slotMs));
  // A-42: My Protocols' Mark complete opens Today on the dose with take: Today runs its own
  // take once (yesterday-or-today question, the site question, the vial, Undo) — no new rules.
  const takenFocusRef = useRef(null);
  useEffect(() => {
    if (!notifFocus || !notifFocus.take || takenFocusRef.current === notifFocus.nonce) return;
    if (notifFocus.dayKey && notifFocus.dayKey !== todayKey) {
      const item = pendingYest.find(isFocusPend);
      if (item) { takenFocusRef.current = notifFocus.nonce; takePending(item); }
      return;
    }
    if (!focusCard) return;
    const cp = cardPlan({ protocol: focusCard, logs: todayRows, nowMs: Date.now() });
    if (!cp.next) return;
    takenFocusRef.current = notifFocus.nonce;
    handleTake(focusCard, null, 0, { slot: cp.next });
  }, [notifFocus, focusCard, pendingYest]); // eslint-disable-line react-hooks/exhaustive-deps
  const isPickedDose = (protocolId, dayKey, slotMs) => !!pickedDose
    && String(pickedDose.protocolId) === String(protocolId) && pickedDose.dayKey === dayKey
    && (slotMs === undefined || pickedDose.slotMs === slotMs);

  function openDoseSlot(protocolId, dayKey, slotMs, ti = null) {
    bookSelect(dosePageKey(protocolId, dayKey, slotMs, ti), { protocolId, dayKey, slotMs, ti });
  }

  // The card opens the slot it offers: today's earliest open slot, else the last one (shown
  // with its logged state).
  function openDoseOnPage(p) {
    const slot = cardSlot({ protocol: p, logs: pageLogs, nowMs: Date.now() });
    if (!slot) { bookSelect('log'); return; }
    openDoseSlot(p.id, slot.dayKey, slot.slotMs, slot.ti);
  }

  // A Tomorrow / Next 5 days row opens that upcoming dose (info only).
  function openUpcomingOnPage(p, atMs) {
    const timed = sortedDoseTimes(p).length > 0;
    openDoseSlot(p.id, localDayKey(atMs), timed ? atMs : null, timed ? null : 0);
  }

  // BK-16 Undo: the app's own undo (applyUndo, the Undo bar's) with the record of THAT row.
  function undoFromPage(record) {
    applyUndo(record);
    fetchTodayLogs(); // the Skipped / Taken counts, the rings and the page, read back
  }

  // BK-19: the embedded Dose log changed a row (Missed → Taken / Skipped, a site): Today's
  // cards, rings, Pending block and the dose page follow without switching tabs.
  function afterLogChange() {
    setUndoData(prev => (prev && wasDeleted(prev.logId) ? null : prev)); // a dose deleted there: no Undo bar for it
    fetchProtocols(); // a delete gave a dose back to the vial / bottle
    fetchTodayLogs();
    fetchPendingYesterday();
    fetchStreakData();
    fetchProtocolStreaks();
    fetchLastSites();
  }

  // "Yesterday 20:00", "Tomorrow 08:00", "Fri 08:00", or just "20:00" today.
  function slotTimeLabel(dayKey, slotMs) {
    const time = Number.isFinite(slotMs) ? formatTimeAMPM(new Date(slotMs).toTimeString().slice(0, 5)) : null;
    if (dayKey === todayKey) return time;
    const [y, m, d] = dayKey.split('-').map(Number);
    const day = new Date(y, m - 1, d);
    const diff = Math.round((day - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000);
    const prefix = diff === -1 ? t('today_yesterday') : diff === 1 ? t('today_section_tomorrow') : t(WEEKDAY_KEYS[day.getDay()]);
    return time ? `${prefix} ${time}` : prefix;
  }

  // The right page: the tapped dose, else the Dose log (the default, BK-3).
  function renderRightPage() {
    const p = pickedDose ? protocols.find(x => String(x.id) === String(pickedDose.protocolId)) : null;
    const plan = p ? planDosePage({
      protocol: p, logs: pageLogs, dayKey: pickedDose.dayKey, slotMs: pickedDose.slotMs, ti: pickedDose.ti,
      nowMs: Date.now(), pending: pendingYest,
    }) : null;
    if (!p || plan.kind === 'none') {
      // A dose written, skipped or undone on the left page refreshes the embedded log (BK-19).
      const logRev = JSON.stringify([takenCounts, skippedCounts, undoData ? undoData.logId : null, pendingYest.length, dataRev]);
      return <LogScreen embedded refreshKey={logRev} onChanged={afterLogChange} popupGate={logPopupGate} />;
    }
    const pending = plan.kind === 'pending';
    const item = { protocolId: p.id, dayKey: plan.dayKey, slotMs: plan.slotMs };
    // Undo only with the record of that row (a dose written here this session); a row logged
    // elsewhere (notification, other device, an earlier session) links to the Dose log.
    const record = plan.logId != null ? undoRecordsRef.current.get(plan.logId) : null;
    const canUndo = plan.canUndo && !!record && !undoneIdsRef.current.has(plan.logId);
    const dpd = p.doses_per_day || 1;
    const time = plan.dayKey === todayKey && Number.isFinite(plan.slotMs) ? formatTimeAMPM(new Date(plan.slotMs).toTimeString().slice(0, 5)) : null;
    const partial = plan.dayKey === todayKey && dpd > 1 && (takenCounts[p.id] || 0) > 0
      ? `${takenCounts[p.id] || 0}/${expectedDosesOn(p, new Date())} ${t('today_taken_partial')}` : null;
    const stateLabel = plan.kind === 'taken' ? takenLabel : plan.kind === 'skipped' ? t('today_pending_skip') : t('log_missed');
    const { draw, syr } = doseDraw(p);
    return (
      <DosePage
        language={language}
        t={t}
        name={p.compound_id ? t(p.compound_id) : p.name}
        color={displayColor(p.color)}
        time={slotTimeLabel(plan.dayKey, plan.slotMs)}
        due={plan.kind === 'due' && Number.isFinite(plan.slotMs)}
        doseLine={`${decimalText(p.dose, language)} ${p.dose_unit} · ${frequencyLabelFor(p.interval_days, t)}`}
        draw={draw}
        syringeSize={syr}
        kind={plan.kind}
        canTake={plan.canTake}
        canSkip={plan.canSkip}
        canUndo={canUndo}
        sub={pending ? t('today_pending_title') : partial}
        stateLabel={stateLabel}
        takeLabel={pending ? t('today_pending_take') : (dpd > 1 && time ? t('today_take_time').replace('{time}', time) : t('today_mark_taken'))}
        takenLabel={takenLabel}
        skipLabel={pending ? t('today_pending_skip') : t('today_skip')}
        askFirst={needsSiteQuestion(p.type)}
        resetKey={`${p.id}-${takenCounts[p.id] || 0}-${takeReset[p.id] || 0}-${plan.kind}`}
        onTake={pending ? () => takePending(item) : (rect) => handleTake(p, rect, 0, { slot: plan.write })}
        onSkip={pending ? () => skipPending(item) : () => skipDose(p, plan.write)}
        onUndo={() => undoFromPage(record)}
        onOpenLog={() => bookSelect('log')}
        onOpenProtocol={() => navigation.navigate('Protocols', { openProtocolId: p.id })}
      />
    );
  }

  // Draw to {n} units for a reconstituted dose with a mixed vial — the ONE computation the
  // Today card and the book layout's dose page (BK-3) both draw from.
  function doseDraw(p) {
    const vial = vials[p.id];
    const draw = p.type === 'recon' && vial ? computeDraw({
      type: p.type, amount: p.amount, water: p.water, dose: p.dose, doseUnit: p.dose_unit, unit: p.unit,
      concentration: p.concentration, concentrationUnit: p.concentration_unit, syringe_size: p.syringe_size,
    }) : null;
    return { draw, syr: p.syringe_size || 100 };
  }

  // Today v2.1 dose card (founder 2026-09-29): the whole card opens the protocol; Skip and
  // Mark taken on the card; an outline "Due" tag; Draw to {n} units + the syringe to scale
  // for a reconstituted dose with a mixed vial (the same computeDraw as Protocols, with its
  // over-capacity warning); every item main showed stays (dose, frequency, time, skipped /
  // partial lines, Day X of Y, last site, protocol streak, vial line or + Add vial).
  // In the book layout (S-26) a tap on the card opens the dose on the right page instead.
  // Rendered as a plain function so React doesn't remount the subtree on every render.
  function renderDoseCard(p, opts = {}) {
    const dosesTakenToday = takenCounts[p.id] || 0;
    const dosesNeeded = expectedDosesOn(p, new Date());
    const vial = vials[p.id];
    // A-78 (founder 2026-10-01): the card's slots from today's rows. A skipped slot counts as
    // filled: the time label, Due and the main Mark taken / Skip are for the next OPEN slot
    // (none when every slot is Taken or Skipped); each skipped slot has its own line.
    const cp = cardPlan({ protocol: p, logs: todayRows, nowMs: Date.now() });
    const nextTime = slotTakeLabel(p, cp.next);
    const progress = getProgress(p);
    const pStreak = protocolStreaks[p.id] || 0;
    const due = cp.due;
    const lastSite = lastSiteByProtocol[p.id];
    const lastSiteName = lastSite ? describeStored(lastSite.stored, t) : null;
    const name = p.compound_id ? t(p.compound_id) : p.name;
    const { draw, syr } = doseDraw(p);
    // BK-8: the dose open on the right page has an ink outline (book layout only). The card is
    // today's dose of this protocol; yesterday's pending slot is selected on its own row.
    const picked = book && isPickedDose(p.id, todayKey);
    return (
      <View key={p.id} style={[s.dose, (picked || opts.highlight) && s.dosePicked]}>
        {/* Today redesign part 5 (prototype card()): dot, name, the amount in Geist Mono with
            " · Daily" in ink2; the time with the drawn arrow; "Due" once due, a grey
            "reminder" tag before it (when a reminder time is set). */}
        <TouchableOpacity
          style={s.dtop}
          activeOpacity={0.7}
          onPress={() => (book ? openDoseOnPage(p) : navigation.navigate('Protocols', { openProtocolId: p.id }))}
          accessibilityRole="button"
          accessibilityState={book ? { selected: picked } : undefined}
        >
          <View style={[s.ddot, { backgroundColor: displayColor(p.color) || colors.data }]} />
          <View style={s.dinfo}>
            <Text style={s.dname}>{name}</Text>
            <Text style={s.dfreq}><Text style={s.damt}>{decimalText(p.dose, language)} {p.dose_unit}</Text> · {frequencyLabelFor(p.interval_days, t)}</Text>
          </View>
          <View style={s.dright}>
            <View style={s.dtimeRow}>
              {p.reminder_time ? (
                <Text style={s.dtime}>{p.reminder_time.split(',').filter(Boolean).map(t24 => formatTimeAMPM(t24)).join(' · ')}</Text>
              ) : null}
              <RowChevron color={colors.tick} />
            </View>
            {due ? (
              <View style={s.dueTag}>
                <View style={s.dueDot} />
                <Text style={s.dueText}>{t('today_due')}</Text>
              </View>
            ) : cp.next && p.reminder_time ? (
              <View style={s.tagLater}>
                <Text style={s.tagLaterText}>{t('today_reminder_tag')}</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
        {cp.skipped.map((sk) => {
          // A-78: "Skipped — you can still log it" per skipped slot (prototype: right under the
          // card's top, ink2); its Mark taken logs THAT dose (the Skipped row turns Taken at the
          // tap time; the site question first for an injectable). A twice-daily card names the
          // slot by its time.
          const skTime = (p.doses_per_day || 1) > 1 && Number.isFinite(sk.slotMs)
            ? formatTimeAMPM(new Date(sk.slotMs).toTimeString().slice(0, 5)) : null;
          return (
            <View key={`sk-${sk.flipRowId}`} style={s.skipLine}>
              <Text style={s.skipLineText}>{skTime ? `${skTime} · ` : ''}{t('today_skipped_today')}</Text>
              {sk.canTake && (
                <TouchableOpacity
                  style={s.skipLineBtn}
                  onPress={() => { lightHaptic(); handleTake(p, null, 0, { slot: sk }); }}
                  accessibilityRole="button"
                  accessibilityLabel={skTime ? `${t('today_mark_taken')}, ${skTime}` : t('today_mark_taken')}
                >
                  <Text style={s.skipLineBtnText}>{t('today_mark_taken')}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        {dosesTakenToday > 0 && dosesNeeded > 1 && <Text style={s.dsub}>{dosesTakenToday}/{dosesNeeded} {t('today_taken_partial')}</Text>}
        {draw && draw.drawUnits && !draw.unitMismatch && (
          <View style={s.draw}>
            <View style={s.drawHead}>
              <Text style={s.drawLabel}>{t('protocols_syringe_draw_to')}</Text>
              <Text style={s.drawVal}>{drawLine(draw, syr, language).big}<Text style={s.drawUnit}>{drawLine(draw, syr, language).small}</Text></Text>
            </View>
            <SyringeScale units={Number(draw.drawUnits)} size={syr} width={290} />
            {draw.exceedsSyringe && (
              <Text style={s.drawWarn}>{exceedsMessage(t, draw, syr, language)}</Text>
            )}
          </View>
        )}
        {/* Part 7: Day X of Y, the last site (full name) and the streak on one line that
            wraps when there is no room (prototype .meta r-foot). */}
        {(progress || lastSiteName || pStreak > 0) && (
          <View style={s.dmeta}>
            {progress && (
              <Text style={s.dmetaText}>{t('today_day_of').replace('{current}', progress.current).replace('{total}', progress.total)}</Text>
            )}
            {lastSiteName && (
              <Text style={s.dmetaText}>
                {(lastSite.daysAgo === 0 ? t('today_last_site_today') : t('today_last_site')).replace('{site}', lastSiteName).replace('{days}', String(lastSite.daysAgo))}
              </Text>
            )}
            {pStreak > 0 && (
              <View style={s.dmetaRow}>
                <FeatureIcon name="flame" size={14} color={colors.attention} />
                <Text style={s.dmetaText}>{pStreak} {t(pluralKey('today_streak_doses', pStreak, language))}</Text>
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
              {/* Part 8: one cell per dose (prototype cells()), the remaining ones in data. */}
              {remaining != null && <VialCells total={capacity} left={remaining} />}
              <Text style={s.vialText}>
                {t('today_vial_mixed')} {formatVialDate(vial.mixed_on)}
                {remaining != null ? ` · ${vialRemainingLabel(remaining, t)}` : ''}
                {daysLeft != null ? ' · ' : ''}
                {daysLeft != null && (
                  // Q9 = B (founder, re-confirmed 2026-10-02 "dias coloridos"): coloured by deadline.
                  <Text style={{ color: daysLeft <= 3 ? colors.risk : daysLeft <= 7 ? colors.attention : colors.ok, fontWeight: '600' }}>
                    {daysLeft <= 0 ? t('protocols_vial_past') : t(pluralKey('protocols_vial_days_left', daysLeft, language)).replace('{n}', String(daysLeft))}
                  </Text>
                )}
              </Text>
            </View>
          );
        })()}
        {p.type === 'recon' && !vial && (
          <TouchableOpacity style={s.vialRow} onPress={() => showVialPromptFor(p)} accessibilityRole="button">
            <Text style={s.addVialText}>{t('today_add_vial')}</Text>
          </TouchableOpacity>
        )}
        {cp.next && (
          <View style={s.acts}>
            <TouchableOpacity style={s.btnSkip} onPress={() => skipDose(p, cp.next)} accessibilityRole="button">
              <Text style={s.btnSkipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('today_skip')}</Text>
            </TouchableOpacity>
            <TakeButton
              key={`take-${p.id}-${dosesTakenToday}-${takeReset[p.id] || 0}-${cp.next.slotMs != null ? cp.next.slotMs : `i${cp.next.ti}`}`}
              label={nextTime ? t('today_take_time').replace('{time}', nextTime) : t('today_mark_taken')}
              takenLabel={takenLabel}
              onTake={(rect) => handleTake(p, rect, 0, { slot: cp.next })}
              askFirst={needsSiteQuestion(p.type)}
              s={s}
              colors={colors}
            />
          </View>
        )}
      </View>
    );
  }

  // Tomorrow / Next 5 days: one list, each part folded with its count; open → rows (Today
  // redesign part 12, prototype foldRow() / uprow()): the drawn fold arrow, "1 dose", the day
  // and time stacked on the left, the amount in Geist Mono, the row arrow; "N more scheduled
  // later" is the last row of the list.
  function foldRow(key, title, items, extraRow = null) {
    if (!items.length) return null;
    const open = fold[key];
    return (
      <View key={key} style={key === 'n5' && tomorrowCards.length > 0 ? s.foldSep : null}>
        <TouchableOpacity style={s.foldHead} onPress={() => setFold(prev => ({ ...prev, [key]: !prev[key] }))} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <Text style={s.foldTitle}>{title}</Text>
          <Text style={s.foldCount}>{doseCountLabel(items.length, t)}</Text>
          <FoldChevron open={open} color={colors.ink3} />
        </TouchableOpacity>
        {open && items.map(p => {
          const at = nextDoseAt(p, takenCounts[p.id] || 0, new Date());
          const d = new Date(at);
          const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          // BK-16: in the book layout an upcoming dose opens on the right page, info only.
          const pickedUp = book && isPickedDose(p.id, localDayKey(at));
          return (
            <TouchableOpacity
              key={p.id}
              style={[s.upRow, pickedUp && s.upRowPicked]}
              onPress={() => (book ? openUpcomingOnPage(p, at) : navigation.navigate('Protocols', { openProtocolId: p.id }))}
              accessibilityRole="button"
              accessibilityState={book ? { selected: pickedUp } : undefined}
            >
              <View style={[s.upTimeCol, { minWidth: upColW }]}>
                {key === 'n5' && <Text style={[s.upDay, s.measureSelf]} numberOfLines={1} onLayout={onUpColLayout}>{formatDate(d, language, 'weekdayDayMonth')}</Text>}
                <Text style={s.upTime}>{formatTimeAMPM(hhmm)}</Text>
              </View>
              <View style={[s.updot, { backgroundColor: displayColor(p.color) || colors.data }]} />
              <View style={s.upMain}>
                <Text style={s.upName}>{p.compound_id ? t(p.compound_id) : p.name}</Text>
                <Text style={s.upAmt}><Text style={s.upAmtVal}>{decimalText(p.dose, language)} {p.dose_unit}</Text> · {frequencyLabelFor(p.interval_days, t)}</Text>
              </View>
              <RowChevron color={colors.tick} />
            </TouchableOpacity>
          );
        })}
        {open && extraRow}
      </View>
    );
  }

  // Part 16: the site sheet names the dose's time under its name — the time the dose is
  // written at (a pending dose: its slot; otherwise the tap, S-25).
  const siteQ = bodyMapTarget && bodyMapTarget.q;
  const siteMs = siteQ ? (siteQ.source === 'pending' && Number.isFinite(siteQ.slotMs) ? siteQ.slotMs : siteQ.tapMs) : null;
  const siteWhen = Number.isFinite(siteMs) ? formatTimeAMPM(new Date(siteMs).toTimeString().slice(0, 5)) : null;

  const skipSheet = skipAsk ? {
    title: t('today_skip_title'),
    body: t('today_skip_confirm').replace('{name}', skipAsk.name),
    buttons: [{ label: t('cancel'), kind: 'secondary' }, { label: t('today_skip'), kind: 'primary', onPress: skipAsk.onSkip }],
  } : null;

  const takenNames = todayTaken.map(l => {
    const pr = protocols.find(x => x.id === l.protocol_id);
    return pr ? (pr.compound_id ? t(pr.compound_id) : pr.name) : null;
  }).filter(Boolean);

  // BK-9: in the book layout the toasts sit on the left page, never across the fold.
  // One column: exactly the old styles (toast === s).
  const toastOnLeftPage = book ? { right: undefined, width: paneWidths(winW).left - 24 } : null;
  const toast = book
    ? { undoBar: [s.undoBar, toastOnLeftPage], takeNoticeBar: [s.takeNoticeBar, toastOnLeftPage] }
    : s;

  const leftPage = (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.centered}>
        {/* Today v2.1 order (founder 2026-09-29): header → Alerts (gone when none) → Pending
            from yesterday → tracker → AI food log → Doses → Taken → Tomorrow / Next 5 days. */}
        <View style={s.header}>
          <Text style={s.date}>{today}</Text>
          <Text style={s.title}>{t('tab_today')}</Text>
        </View>

        {focusCard && (
          // A-44: the dose its reminder was about, at the top, highlighted (ink outline).
          <View style={s.block}>
            <View style={s.lab}><Text style={s.labText}>{t('today_notif_focus_title')}</Text></View>
            {renderDoseCard(focusCard, { highlight: true })}
          </View>
        )}

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
                      <FeatureIcon name={a.iconName} size={22} color={colors.ink2} />
                      <View style={s.atext}>
                        <View style={s.atitleRow}>
                          <Text style={s.atitle}>{a.title}</Text>
                          {a.due && <View style={s.adot} />}
                        </View>
                        <Text style={s.abody}>{a.body}</Text>
                      </View>
                    </TouchableOpacity>
                    {/* Prototype: every alert has the snooze round; it opens "Tomorrow / In 3
                        days" under the alert (Q15: the current snooze drawing). */}
                    <TouchableOpacity
                      style={[s.round, snoozeOpen === a.id && s.roundOn]}
                      onPress={() => setSnoozeOpen(snoozeOpen === a.id ? null : a.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('alert_snooze')}
                      accessibilityState={{ expanded: snoozeOpen === a.id }}
                    >
                      <FeatureIcon name="snooze" size={20} color={snoozeOpen === a.id ? colors.onInk : colors.ink2} />
                    </TouchableOpacity>
                  </View>
                  {snoozeOpen === a.id && (
                    <View style={s.snz}>
                      {SNOOZE_KINDS.map((kind) => (
                        <TouchableOpacity key={kind} style={s.pill} onPress={() => snoozeAlert(a.snoozeId, kind)} accessibilityRole="button">
                          <Text style={s.pillText}>{kind === 'in3' ? t('alert_snooze_days').replace('{n}', '3') : t('alert_snooze_tomorrow')}</Text>
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
              // BK-16: in the book layout the row opens yesterday's dose on the right page.
              const pickedPend = (book && isPickedDose(item.protocolId, item.dayKey, item.slotMs)) || isFocusPend(item);
              return (
                <View key={`${item.protocolId}-${item.slotMs}`} style={[s.pend, pickedPend && s.pendPicked]}>
                  {book ? (
                    <TouchableOpacity
                      style={s.pendRow}
                      activeOpacity={0.7}
                      onPress={() => openDoseSlot(item.protocolId, item.dayKey, item.slotMs)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: pickedPend }}
                    >
                      <View style={s.adot} />
                      <Text style={s.pendText}>{when}</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={s.pendRow}>
                      <View style={s.adot} />
                      <Text style={s.pendText}>{when}</Text>
                    </View>
                  )}
                  <View style={s.acts2}>
                    <TouchableOpacity style={s.btnSkip} onPress={() => skipPending(item)} accessibilityRole="button">
                      <Text style={s.btnSkipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('today_pending_skip')}</Text>
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
          <TodayTracker rings={rings} weekDots={weekDots} streak={streak} onHistory={() => (book ? bookSelect('log') : navigation.navigate('Log'))} t={t} ringRef={ringRef} />
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
              {totalDoses > 0 && <Text style={s.labCount}>{dosesTakenLabel(doneDoses, totalDoses, t)}</Text>}
            </View>
            {todayCards.filter(p => !focusCard || p.id !== focusCard.id).map(p => renderDoseCard(p))}
            {todayCards.length === 0 && allDoneToday && (
              // Part 13 (prototype caught()): the ok check beside the line.
              <View style={s.doneCard}>
                <CheckMark size={22} color={colors.ok} />
                <Text style={s.doneText}>{t('today_all_done')}</Text>
              </View>
            )}
            {takenNames.length > 0 && (takenOpen ? (
              // Part 10, opened (prototype takenBlock(open)): a raised list — the check and
              // "Taken" with the up arrow, then one row per dose: dot, name, "time · site".
              <View style={s.takenList}>
                <TouchableOpacity style={s.takenHead} onPress={() => setTakenOpen(false)} accessibilityRole="button" accessibilityState={{ expanded: true }}>
                  <CheckMark size={20} color={colors.ok} />
                  <Text style={[s.takenTitle, s.takenGrow]}>{takenLabel}</Text>
                  <FoldChevron open={takenOpen} color={colors.ink3} />
                </TouchableOpacity>
                {todayTaken.map(l => {
                  const pr = protocols.find(x => x.id === l.protocol_id);
                  if (!pr) return null;
                  const d = new Date(l.logged_at);
                  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                  const site = l.injection_site ? describeStored(l.injection_site, t) : null;
                  return (
                    <View key={l.id} style={s.takenRow}>
                      <View style={[s.takenDot, { backgroundColor: displayColor(pr.color) || colors.data }]} />
                      <Text style={s.takenName} numberOfLines={1}>{pr.compound_id ? t(pr.compound_id) : pr.name}</Text>
                      <Text style={s.takenWhen} numberOfLines={1}>{site ? `${formatTimeAMPM(hhmm)} · ${site}` : formatTimeAMPM(hhmm)}</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              // Part 10, closed: the ok check (it had no colour, so it never showed), "Taken" in
              // ink, the names, the down arrow.
              <TouchableOpacity style={s.takenLine} onPress={() => setTakenOpen(true)} accessibilityRole="button" accessibilityState={{ expanded: false }}>
                <View style={s.takenMark}><CheckMark size={20} color={colors.ok} /></View>
                <View style={s.takenMain}>
                  <Text style={s.takenTitle}>{takenLabel}</Text>
                  <Text style={s.takenItem} numberOfLines={2}>{takenNames.join(', ')}</Text>
                </View>
                <View style={s.takenFold}><FoldChevron open={takenOpen} color={colors.ink3} /></View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {(tomorrowCards.length > 0 || next5Cards.length > 0) && (
          <View style={s.block}>
            <View style={s.foldList}>
              {foldRow('tom', t('today_section_tomorrow'), tomorrowCards)}
              {foldRow('n5', t('today_section_next5'), next5Cards, laterCount > 0 ? (
                <View style={s.laterRow}>
                  <Text style={s.laterHint}>{t(pluralKey('today_more_later', laterCount, language)).replace('{count}', laterCount)}</Text>
                </View>
              ) : null)}
              {/* Nothing in the next 5 days: the "later" line stays visible under Tomorrow. */}
              {next5Cards.length === 0 && laterCount > 0 && (
                <View style={s.laterRow}>
                  <Text style={s.laterHint}>{t(pluralKey('today_more_later', laterCount, language)).replace('{count}', laterCount)}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {protocols.length > 0 && <Text style={s.disclaimer}>{t('today_disclaimer')}</Text>}

        <View style={{ height: 24 }} />
      </ScrollView>
  );

  return (
    <SafeAreaView style={s.container} ref={rootRef} collapsable={false}>
      {book ? <BookPanes left={leftPage} right={renderRightPage()} rightKey={bookSel} /> : leftPage}

      {/* Undo toast — pinned above the tab bar, outside the ScrollView, so it is
        visible wherever the list is scrolled (S-02). */}
      {undoData && (
        <View style={toast.undoBar}>
          <Text style={s.undoBarText} numberOfLines={2}>{undoData.text || t('today_dose_logged')}</Text>
          <View style={s.undoBarActions}>
            <TouchableOpacity onPress={undoTake}>
              <Text style={s.undoBarAction}>{t('today_undo')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* S-20: the dose was undone from the site picker (Cancel / back) — say so. */}
      {takeNotice && !undoData && (
        <View style={toast.takeNoticeBar} accessibilityLiveRegion="polite">
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
        whenLabel={siteWhen}
        protocolId={bodyMapTarget?.protocolId ?? null}
        recentLogs={bodyMapTarget?.recentLogs || []}
        sheet={siteSheet}
        onSheetClose={() => setSiteSheet(null)}
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
              placeholderTextColor={colors.ink3}
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
                <Text style={s.promptLabel}>
                  {t(pluralKey('today_vial_new_capacity', cap, language)).replace('{n}', String(cap))}
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
        {/* Errors from the vial prompt are presented from inside it (M1/M4). */}
        <DTSheet config={vialSheet} onClose={() => setVialSheet(null)} />
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

      {/* Part 14: "Skip dose?" — the DoseTrace sheet. */}
      <DTSheet config={skipSheet} onClose={closeSkipAsk} />
      {/* Errors and the "yesterday or today?" question (M4). */}
      <DTSheet config={todaySheet} onClose={closeTodaySheet} />

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
  // Vial continuation + "still going?" pop-ups (Today redesign part 17): the prototype .scrim /
  // .sheet on Graduated tokens — raised sheet, 22/700 title, 17 ink2 body, 36 pt outline pills,
  // a raised 50 pt day field, capsule buttons (well secondary, act primary). Same words.
  promptOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', alignItems: 'center', padding: 16 },
  promptCard: { backgroundColor: c.raised, borderRadius: 26, padding: 20, gap: 14, width: '100%', maxWidth: 520 },
  promptTitle: { fontSize: 22, fontWeight: '700', lineHeight: 28, color: c.ink },
  promptProtocolName: { fontSize: 17, fontWeight: '600', color: c.ink },
  promptSub: { fontSize: 17, lineHeight: 22, color: c.ink2 },
  promptLabel: { fontSize: 17, fontWeight: '600', color: c.ink },
  promptMonthRow: { flexDirection: 'row', gap: 8 },
  promptMonthPill: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: c.line },
  promptMonthPillOn: { backgroundColor: c.raised, borderWidth: 1.5, borderColor: c.ink },
  promptMonthText: { fontSize: 15, color: c.ink2 },
  promptMonthTextOn: { color: c.ink, fontWeight: '600' },
  promptDayInput: { backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 14, minHeight: 50, paddingVertical: 12, paddingHorizontal: 14, fontSize: 17, color: c.ink, width: 90, textAlign: 'center' },
  promptActions: { flexDirection: 'row', gap: 10 },
  promptBtnSecondary: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  promptBtnSecondaryText: { fontSize: 15, fontWeight: '700', color: c.ink, textAlign: 'center' },
  promptBtnPrimary: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  promptBtnPrimaryText: { fontSize: 15, fontWeight: '700', color: c.onAct, textAlign: 'center' },
  // Yesterday / Today shortcut pills
  yesterdayRow: { flexDirection: 'row', gap: 8 },
  yesterdayPill: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: c.line },
  yesterdayPillText: { fontSize: 15, color: c.ink2 },
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
  aitemSep: { borderTopWidth: 1, borderTopColor: c.line },
  arow: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: 12 },
  amain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  atext: { flex: 1, minWidth: 0, gap: 2 },
  atitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  atitle: { fontSize: 17, fontWeight: '600', color: c.ink },
  adot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.attention },
  abody: { fontSize: 15, color: c.ink2, fontVariant: ['tabular-nums'] },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
  roundOn: { backgroundColor: c.ink },
  snz: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 34, paddingBottom: 14 },
  pill: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
  pillText: { fontSize: 15, color: c.ink2 },
  pend: { backgroundColor: c.raised, borderRadius: 22, padding: 16, gap: 12 },
  pendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pendText: { flex: 1, fontSize: 17, color: c.ink, fontVariant: ['tabular-nums'] },
  acts2: { flexDirection: 'row', gap: 10 },
  dose: { backgroundColor: c.raised, borderRadius: 24, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, gap: 14 },
  // BK-8: the selected dose in the book layout — a 2 pt ink outline; the padding gives the
  // border's 2 pt back so the card does not move.
  dosePicked: { borderWidth: 2, borderColor: c.ink, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14 },
  // BK-8 / BK-16: the same 2 pt ink outline on yesterday's pending row and an upcoming row.
  pendPicked: { borderWidth: 2, borderColor: c.ink, padding: 14 },
  upRowPicked: { borderWidth: 2, borderColor: c.ink, borderRadius: 14, paddingHorizontal: 10 },
  dtop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  ddot: { width: 10, height: 10, borderRadius: 5, marginTop: 8 },
  dinfo: { flex: 1, minWidth: 0, gap: 4 },
  dname: { fontSize: 20, fontWeight: '700', color: c.ink, letterSpacing: -0.2 },
  damt: { fontFamily: MONO['500'], fontSize: 16, color: c.ink, letterSpacing: -0.32, fontVariant: ['tabular-nums'] },
  dfreq: { fontSize: 15, color: c.ink2 },
  dsub: { fontSize: 15, color: c.ink2, fontVariant: ['tabular-nums'] },
  dright: { alignItems: 'flex-end', gap: 6 },
  dtimeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dtime: { fontSize: 17, fontWeight: '600', color: c.ink, fontVariant: ['tabular-nums'] },
  dueTag: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: c.attention },
  dueDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.attention },
  dueText: { fontSize: 12, fontWeight: '700', color: c.attention },
  tagLater: { flexDirection: 'row', alignItems: 'center', minHeight: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: c.line },
  tagLaterText: { fontSize: 12, color: c.ink3, fontWeight: '500' },
  draw: { backgroundColor: c.well, borderRadius: 16, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, gap: 6 },
  drawHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  drawLabel: { fontSize: 15, color: c.ink2 },
  drawVal: { fontSize: 22, fontWeight: '500', color: c.ink, fontVariant: ['tabular-nums'] },
  drawUnit: { fontSize: 13, fontWeight: '400', color: c.ink3 },
  drawWarn: { fontSize: 15, fontWeight: '600', color: c.risk },
  dmeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, columnGap: 14 },
  dmetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dmetaText: { fontSize: 13, lineHeight: 18, color: c.ink2, fontVariant: ['tabular-nums'] },
  vialRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.line },
  vialText: { fontSize: 13, lineHeight: 18, color: c.ink2, fontVariant: ['tabular-nums'] },
  // prototype btnlink r-body: 17 ink, underline in tick, 32 pt row
  addVialText: { fontSize: 17, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick, minHeight: 32, textAlignVertical: 'center' },
  acts: { flexDirection: 'row', gap: 10 },
  // A-78: a skipped slot's "you can still log it" line and its Mark taken.
  skipLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skipLineText: { flex: 1, fontSize: 15, color: c.ink2 },
  skipLineBtn: { minHeight: 44, borderRadius: 22, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  skipLineBtnText: { fontSize: 15, fontWeight: '700', color: c.ink },
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
  doneCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.raised, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 16 },
  doneText: { flex: 1, fontSize: 17, fontWeight: '600', color: c.ink },
  takenLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 6, paddingVertical: 4 },
  takenMark: { marginTop: 1 },
  takenFold: { marginTop: 4 },
  takenMain: { flex: 1, gap: 2 },
  takenTitle: { fontSize: 17, fontWeight: '600', color: c.ink },
  takenItem: { fontSize: 15, color: c.ink2, fontVariant: ['tabular-nums'] },
  // Part 10 opened (prototype .list + .li): raised list, 48 pt head, 44 pt rows with 1 pt lines
  takenList: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16 },
  takenHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 10 },
  takenGrow: { flex: 1 },
  takenRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line },
  takenDot: { width: 9, height: 9, borderRadius: 5, marginLeft: 6 },
  takenName: { flex: 1, fontSize: 17, color: c.ink },
  takenWhen: { flexShrink: 1, fontSize: 15, color: c.ink2, fontVariant: ['tabular-nums'] },
  foldList: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16 },
  foldSep: { borderTopWidth: 1, borderTopColor: c.line },
  foldHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  foldTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: c.ink },
  foldCount: { fontSize: 15, color: c.ink2, fontVariant: ['tabular-nums'] },
  upRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line },
  upTimeCol: { gap: 1 }, // width: useColumnWidth (88 pt at least, the widest date of the language)
  upDay: { fontSize: 15, color: c.ink, fontVariant: ['tabular-nums'] },
  measureSelf: { alignSelf: 'flex-start' }, // a measured cell reports its own text width (useColumnWidth)
  updot: { width: 9, height: 9, borderRadius: 5 },
  upTime: { fontSize: 15, color: c.ink2, fontVariant: ['tabular-nums'] },
  upMain: { flex: 1, minWidth: 0, gap: 1 },
  upName: { fontSize: 17, color: c.ink },
  upAmt: { fontSize: 15, color: c.ink2, fontVariant: ['tabular-nums'] },
  upAmtVal: { fontFamily: MONO['500'], color: c.ink },
  laterHint: { fontSize: 15, color: c.ink3, fontVariant: ['tabular-nums'] },
  laterRow: { minHeight: 44, justifyContent: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line },
  empty: { marginHorizontal: 16, marginBottom: 26, backgroundColor: c.raised, borderRadius: 24, padding: 24, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: c.ink, textAlign: 'center' },
  emptySub: { fontSize: 15, color: c.ink2, textAlign: 'center' },
  disclaimer: { fontSize: 13, lineHeight: 18, color: c.ink3, textAlign: 'left', marginHorizontal: 20, marginTop: -4 },
  undoBar: { position: 'absolute', left: 12, right: 12, bottom: 18, flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: c.toast, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14 },
  takeNoticeBar: { position: 'absolute', left: 12, right: 12, bottom: 18, backgroundColor: c.toast, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14 },
  undoBarText: { flex: 1, fontSize: 17, color: c.toastText, fontWeight: '400' },
  undoBarActions: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  undoBarAction: { fontSize: 17, color: c.toastText, fontWeight: '700', textDecorationLine: 'underline' },
  takeNoticeText: { fontSize: 17, color: c.toastText, fontWeight: '400' },
});
