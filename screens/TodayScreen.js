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
  getActiveProtocols, getActiveVials, getTodayLogs, getTakenLogsSince, getLogsSince,
  insertDoseLog, deleteDoseLog, updateDoseLog, updateVial, insertVial, updateProtocol,
  getProtocolById, hardDeleteOldProtocols, softDeleteProtocol, deactivateVialsByProtocol,
  getBiomarkers,
} from '../lib/database';
import { requestSync, addSyncListener } from '../lib/sync';
import { scanMissedDoses } from '../lib/doseActions';
import BodyMapModal from './components/BodyMapModal';
import { summarizeStored } from '../lib/injectionSites';
import { dosesPerVial } from '../lib/doseMath';
import { computeServings } from '../lib/oralMath';
import { DEFAULT_VALID_DAYS, daysUntilExpiry, expiryColor } from '../lib/vialExpiry';
import { formatTime } from '../lib/timeFormat';
import { friendlyError } from '../lib/friendlyError';
import { useTheme } from '../lib/theme';
import FeatureIcon from '../components/FeatureIcon';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedProps, useAnimatedStyle, useReducedMotion,
  withTiming, withDelay, withSequence, Easing,
} from 'react-native-reanimated';
import { AnimatedNumber, lightHaptic, eInOutSine } from '../components/motion';
import { Card, SectionLabel, Dot, Chip, RoundAction, ScreenTitle } from '../components/ui';

// Drawn chevron (replaces the old "›" text glyph).
function Chevron({ color, size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 5.5l6.5 6.5L9 18.5" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

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
// variant 'round' = the hybrid 56pt round primary control (due-now card);
// variant 'pill' = a compact accent pill for the flat rows. Same behaviour.
function TakeButton({ label, takenLabel, onTake, s, colors, variant = 'pill' }) {
  const ref = useRef(null);
  const [ok, setOk] = useState(false);
  const press = useSharedValue(1);
  const chk = useSharedValue(0);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const chkProps = useAnimatedProps(() => ({ strokeDashoffset: 16 * (1 - chk.value) }));
  const onPress = () => {
    if (ok) return;
    lightHaptic();
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
  if (variant === 'round') {
    return (
      <Animated.View style={[s.takeRoundWrap, btnStyle]}>
        <TouchableOpacity
          style={s.takeRoundTouch}
          onPress={onPress}
          activeOpacity={0.85}
          disabled={ok}
          accessibilityRole="button"
          accessibilityLabel={ok ? takenLabel : label}
          accessibilityState={{ disabled: ok }}
        >
          <View ref={ref} collapsable={false} style={[s.takeRound, ok && s.takeRoundOk]}>
            <Svg width={26} height={26} viewBox="0 0 16 16">
              {ok ? (
                <APath d="M3.5 8.5 L6.8 11.5 L12.5 5" fill="none" stroke={colors.successSoftText} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={16} animatedProps={chkProps} />
              ) : (
                <Path d="M3.5 8.5 L6.8 11.5 L12.5 5" fill="none" stroke={colors.accentText} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              )}
            </Svg>
          </View>
          <Text style={[s.roundLbl, ok && { color: colors.successSoftText }]} numberOfLines={2}>{ok ? takenLabel : label}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }
  return (
    <Animated.View style={[s.doseBtnPrimaryWrap, btnStyle]}>
      <TouchableOpacity ref={ref} style={[s.doseBtn, ok ? s.doseBtnOk : s.doseBtnPrimary, s.doseBtnFill]} onPress={onPress} activeOpacity={0.85} disabled={ok} accessibilityRole="button" accessibilityLabel={ok ? takenLabel : label}>
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

const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };
const WEEKDAY_KEYS = ['today_sun','today_mon','today_tue','today_wed','today_thu','today_fri','today_sat'];

const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr',
  'month_may', 'month_jun', 'month_jul', 'month_aug',
  'month_sep', 'month_oct', 'month_nov', 'month_dec',
];

// ── Today alerts config ────────────────────────────────────────
const BLOODWORK_INTERVAL_DAYS = 182; // ~6 months
const SUPPLY_LOW_DOSES = 3;          // flag a vial with this many doses left or fewer
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
  const [showShareCard, setShowShareCard] = useState(false);
  const actionInProgressRef = useRef(false); // ref, not state — must block synchronously on double-tap
  const pendingFxRef = useRef(new Set()); // deferred follow-ups of recent takes (see markTaken)
  // Site prompts wait their turn: two injectables taken back to back each get
  // their own picker, and a site is never saved onto the other dose.
  const siteQueueRef = useRef([]);
  const bodyMapOpenRef = useRef(false);
  const [takeReset, setTakeReset] = useState({}); // per protocol: bumps to re-mount a TakeButton whose dose did not save
  const resetTake = (protocolId) => setTakeReset(prev => ({ ...prev, [protocolId]: (prev[protocolId] || 0) + 1 }));
  const [undoData, setUndoData] = useState(null);
  const [snoozeOpen, setSnoozeOpen] = useState(null); // alert id whose "remind me" strip is open // { logId, protocolId, vialId, prevDosesTaken, timer }
  const [protocolStreaks, setProtocolStreaks] = useState({}); // { protocol_id: number }

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
  const [bodyMapTarget, setBodyMapTarget] = useState(null); // { logId, protocolId, recentLogs, initialStored }

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
      fetchStreakData();
      fetchProtocolStreaks();
      fetchLastSites();
      fetchAlerts();
      checkTreatmentStillActive();
      playRingIntro(); // the ring fills from zero each time Today opens
      return () => {
        // Leaving Today mid-animation: land the count now, and drop a pending
        // site picker rather than pop it over another tab (the site can still
        // be added from the log).
        for (const fx of pendingFxRef.current) {
          if (fx.undone) continue;
          if (!fx.applied) { clearTimeout(fx.applyT); fx.flush(); }
          clearTimeout(fx.siteT); fx.siteT = null;
        }
        pendingFxRef.current.clear();
        siteQueueRef.current = [];
      };
    }, [])
  );

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
    fetchProtocols();
    requestSync();
  }

  async function snoozeInactiveProtocol() {
    const p = inactiveProtocol;
    if (p) AsyncStorage.setItem(`dosetrace_tx_check_${p.id}`, new Date().toISOString()).catch(() => {});
    setShowInactivePrompt(false);
    setInactiveProtocol(null);
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
    }
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

  // opts.deferUi / opts.siteDelay (ms): let the "taken" confirmation play before the
  // card re-sorts and before the injection-site picker covers the screen. The dose
  // is WRITTEN immediately regardless — only the visual follow-up waits.
  async function markTaken(protocol, opts = {}) {
    if (actionInProgressRef.current) return;
    actionInProgressRef.current = true;
    let saved = false;
    try {
      const user = await getCachedUser();
      if (!user) { actionInProgressRef.current = false; resetTake(protocol.id); return; }

      const logId = insertDoseLog({
        user_id: user.id,
        protocol_id: protocol.id,
        protocol_remote_id: protocol.remote_id || null,
        outcome: 'Taken',
      });
      saved = true;

      const newTakenToday = (takenCounts[protocol.id] || 0) + 1;
      // Deferred follow-ups are tracked so an Undo inside the delay cancels them:
      // otherwise the count bump lands after the undo, or the site picker opens
      // for (and re-syncs) the deleted log.
      const fx = { undone: false, applied: false, applyT: null, siteT: null };
      const applyTaken = () => {
        if (fx.undone) return;
        fx.applied = true;
        setTakenCounts(prev => ({ ...prev, [protocol.id]: (prev[protocol.id] || 0) + 1 }));
      };
      fx.flush = applyTaken;
      pendingFxRef.current.add(fx);
      setTimeout(() => pendingFxRef.current.delete(fx), 5000);
      if (opts.deferUi) fx.applyT = setTimeout(applyTaken, opts.deferUi); else applyTaken();
      fetchStreakData();
      fetchProtocolStreaks();
      Analytics.doseLogged({ name: protocol.name, type: protocol.type, outcome: 'Taken' });
      // Cancel today's reminder(s) for the slots now taken, so no "dose pending" fires later.
      cancelTodaysDoseReminders(protocol.id, newTakenToday).catch(() => {});

      // Update vial doses_taken if this protocol has an active vial
      const vial = vials[protocol.id];
      const prevVialDosesTaken = vial ? (vial.doses_taken || 0) : null;
      let vialPromptShown = false;
      if (vial) {
        const newTaken = (vial.doses_taken || 0) + 1;
        updateVial(vial.id, { doses_taken: newTaken });
        // Capacity: stored if known, else derived (older vials have null total_doses).
        const capacity = (vial.total_doses && vial.total_doses > 0)
          ? vial.total_doses
          : dosesPerVial({ amount: protocol.amount, unit: protocol.unit, dose: protocol.dose, doseUnit: protocol.dose_unit });
        if (capacity && newTaken >= capacity) {
          updateVial(vial.id, { active: 0 });
          if (protocol.type === 'recon') {
            setContinuationProtocol(protocol);
            setNewVialDoses('');
            setNewVialMonth(new Date().getMonth());
            setNewVialDay(String(new Date().getDate()));
            setShowVialPrompt(true);
            vialPromptShown = true;
          }
        }
        fetchProtocols();
      }

      // Oral supply: subtract the calculated units-per-dose from the bottle.
      let oralPrevUnitsTaken = null;
      if (protocol.type === 'oral' && protocol.container_units) {
        const r = computeServings({
          targetDose: protocol.dose, doseUnit: protocol.dose_unit,
          servingStrength: protocol.serving_strength, servingStrengthUnit: protocol.serving_strength_unit,
          servingUnits: protocol.serving_units, form: protocol.notes,
        });
        if (r.valid && r.unitsNeeded > 0) {
          oralPrevUnitsTaken = protocol.units_taken || 0;
          updateProtocol(protocol.id, { units_taken: oralPrevUnitsTaken + r.unitsNeeded });
          fetchProtocols();
        }
      }
      syncVialAlerts().catch(() => {});
      requestSync();

      // Setup undo (5 second window) — previous timer is cleared by the undoData effect
      const timer = setTimeout(() => setUndoData(null), 5000);
      setUndoData({
        logId,
        protocolId: protocol.id,
        vialId: vial?.id || null,
        prevDosesTaken: prevVialDosesTaken,
        oralPrevUnitsTaken,
        timer,
        fx,
      });

      // Injectables (lyophilized / ready-to-use): prompt for the injection
      // site right after logging, instead of leaving it as an optional step.
      // Oral supplements have no site, so they skip this.
      if (protocol.type === 'recon' || protocol.type === 'rtu') {
        const openSite = () => openBodyMapForUndo({ logId, protocolId: protocol.id, timer, fx });
        // With the vial-finished prompt up, open together as before (no delayed
        // second modal racing the first).
        if (opts.siteDelay && !vialPromptShown) fx.siteT = setTimeout(openSite, opts.siteDelay); else openSite();
      }

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

  // Open the body map for the just-logged dose. Cancels the undo timer
  // so the toast stays on screen while the modal is open.
  async function openBodyMapForUndo(undo) {
    if (!undo || !undo.logId) return;
    if (undo.fx) {
      if (undo.fx.undone) return;
      clearTimeout(undo.fx.siteT);
      undo.fx.siteT = null;
    }
    if (undo.timer) clearTimeout(undo.timer);
    if (bodyMapOpenRef.current) {
      if (!siteQueueRef.current.some(u => u.logId === undo.logId)) siteQueueRef.current.push(undo);
      return;
    }
    bodyMapOpenRef.current = true;
    try {
      const user = await getCachedUser();
      if (!user) { bodyMapOpenRef.current = false; return; }
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const recent = getLogsSince(user.id, since.toISOString()) || [];
      setBodyMapTarget({
        logId: undo.logId,
        protocolId: undo.protocolId,
        recentLogs: recent,
        initialStored: null,
      });
      setBodyMapVisible(true);
    } catch { bodyMapOpenRef.current = false; }
  }

  // After a picker closes, open the next queued one (skipping undone doses).
  function openNextSite() {
    bodyMapOpenRef.current = false;
    let next;
    do { next = siteQueueRef.current.shift(); } while (next && next.fx && next.fx.undone);
    if (next) setTimeout(() => openBodyMapForUndo(next), 350);
  }

  function handleBodyMapClose() {
    const closedLogId = bodyMapTarget?.logId;
    setBodyMapVisible(false);
    setBodyMapTarget(null);
    // Toast was kept open while modal was up — clear it now (only if it belongs
    // to this log: a queued take keeps its own Undo until its picker closes)
    setUndoData(prev => (prev && prev.logId === closedLogId ? null : prev));
    openNextSite();
  }

  function handleBodyMapSave({ stored }) {
    if (bodyMapTarget?.logId) {
      try {
        updateDoseLog(bodyMapTarget.logId, { injection_site: stored });
        requestSync();
      } catch { /* ignore */ }
    }
    const closedLogId = bodyMapTarget?.logId;
    setBodyMapVisible(false);
    setBodyMapTarget(null);
    setUndoData(prev => (prev && prev.logId === closedLogId ? null : prev));
    openNextSite();
  }

  async function undoTake() {
    if (!undoData) return;
    try {
      if (undoData.timer) clearTimeout(undoData.timer);
      const fx = undoData.fx;
      if (fx) {
        fx.undone = true;
        clearTimeout(fx.applyT);
        clearTimeout(fx.siteT);
      }
      deleteDoseLog(undoData.logId);
      // Only take back a count bump that actually landed.
      if (!fx || fx.applied) {
        setTakenCounts(prev => {
          const updated = { ...prev };
          updated[undoData.protocolId] = Math.max((updated[undoData.protocolId] || 1) - 1, 0);
          return updated;
        });
      } else {
        resetTake(undoData.protocolId); // the pressed button is still showing "Taken"
      }
      if (undoData.vialId && undoData.prevDosesTaken !== null) {
        updateVial(undoData.vialId, { doses_taken: undoData.prevDosesTaken, active: 1 });
        fetchProtocols();
      }
      if (undoData.oralPrevUnitsTaken != null) {
        updateProtocol(undoData.protocolId, { units_taken: undoData.oralPrevUnitsTaken });
        fetchProtocols();
      }
      setUndoData(null);
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

  async function createNewVial() {
    if (!continuationProtocol) return;
    try {
      const user = await getCachedUser();
      if (!user) return;
      const mixDate = toPastDateString(newVialMonth, newVialDay);
      if (!mixDate) { Alert.alert(t('error'), t('today_invalid_date')); return; }
      // Vial capacity is derived from the protocol (vial amount ÷ dose), not asked.
      const totalDoses = dosesPerVial({
        amount: continuationProtocol.amount, unit: continuationProtocol.unit,
        dose: continuationProtocol.dose, doseUnit: continuationProtocol.dose_unit,
      });

      insertVial({
        user_id: user.id,
        protocol_id: continuationProtocol.id,
        protocol_remote_id: continuationProtocol.remote_id || null,
        mixed_on: mixDate,
        water_ml: continuationProtocol.water ? parseFloat(continuationProtocol.water) : null,
        total_doses: totalDoses,
        doses_taken: 0,
      });

      updateProtocol(continuationProtocol.id, { start_date: mixDate });

      const updatedProtocol = getProtocolById(continuationProtocol.id);
      if (updatedProtocol) scheduleDoseReminder(updatedProtocol).catch(() => {});

      setShowVialPrompt(false);
      setContinuationProtocol(null);
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

  function handleTake(p, btnRect, attempt = 0) {
    // Another card's write is mid-flight: retry shortly rather than let the
    // button show "Taken" for a dose that was never logged.
    if (actionInProgressRef.current) {
      if (attempt < 12) setTimeout(() => handleTake(p, btnRect, attempt + 1), 250);
      else {
        resetTake(p.id);
        Alert.alert(t('error'), t('error_save_failed'));
      }
      return;
    }
    if (reduceRef.current || !btnRect) { markTaken(p); return; }
    const LIFT = 110, FLIGHT = 500;
    landingAtRef.current = Date.now() + LIFT + FLIGHT;
    // Write now; let the card re-sort and the site picker open after the drop lands.
    markTaken(p, { deferUi: 380, siteDelay: 900 });
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
        const cap = (v.total_doses && v.total_doses > 0)
          ? v.total_doses
          : dosesPerVial({ amount: p.amount, unit: p.unit, dose: p.dose, doseUnit: p.dose_unit });
        if (!cap) continue;
        const rem = Math.max(0, cap - (v.doses_taken || 0));
        if (rem > 0 && rem <= SUPPLY_LOW_DOSES) low.push({ name: p.compound_id ? t(p.compound_id) : p.name, rem });
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

  // Everything a dose row/card shows, computed once per protocol.
  function doseInfo(p) {
    const dosesTakenToday = takenCounts[p.id] || 0;
    const dosesNeeded = expectedDosesOn(p, new Date());
    const dueToday = dosesNeeded > 0;
    return {
      dosesTakenToday,
      dosesNeeded,
      dueToday,
      isTaken: dueToday && dosesTakenToday >= dosesNeeded,
      skippedToday: skippedCounts[p.id] || 0,
      nextDue: dueToday ? null : nextDueDate(p, new Date()),
      times: p.reminder_time ? p.reminder_time.split(',').filter(Boolean).map(t24 => formatTimeAMPM(t24)) : [],
      nextTime: getNextTimeLabel(p),
      progress: getProgress(p),
      pStreak: protocolStreaks[p.id] || 0,
      lastSite: lastSiteByProtocol[p.id],
      name: p.compound_id ? t(p.compound_id) : p.name,
    };
  }

  function openProtocol(p) {
    navigation.navigate('Protocols', { openProtocolId: p.id });
  }

  function openAddVial(p) {
    setContinuationProtocol(p);
    setNewVialDoses('');
    setNewVialMonth(new Date().getMonth());
    setNewVialDay(String(new Date().getDate()));
    setShowVialPrompt(true);
  }

  // Vial status line for recon protocols (or the "+ Add vial" link).
  function renderVialLine(p) {
    const vial = vials[p.id];
    if (p.type !== 'recon') return null;
    if (!vial) {
      return (
        <TouchableOpacity style={s.vialLink} onPress={() => openAddVial(p)} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8 }}>
          <Text style={[s.vialStatusText, { color: colors.accent, fontWeight: '600' }]}>{t('today_add_vial')}</Text>
        </TouchableOpacity>
      );
    }
    // Capacity: stored count if known, else derived from vial size ÷ dose
    // (older vials predate the derivation and have a null total_doses).
    const capacity = (vial.total_doses && vial.total_doses > 0)
      ? vial.total_doses
      : dosesPerVial({ amount: p.amount, unit: p.unit, dose: p.dose, doseUnit: p.dose_unit });
    const remaining = capacity ? Math.max(0, capacity - (vial.doses_taken || 0)) : null;
    const daysLeft = daysUntilExpiry(vial.mixed_on, p.vial_valid_days || DEFAULT_VALID_DAYS, new Date());
    return (
      <Text style={s.vialStatusText}>
        {t('today_vial_mixed')} {formatVialDate(vial.mixed_on)}
        {remaining != null ? ` · ${remaining} ${t('today_vial_remaining')}` : ''}
        {daysLeft != null ? ' · ' : ''}
        {daysLeft != null && (
          <Text style={{ color: expiryColor(daysLeft), fontWeight: '600' }}>
            {daysLeft <= 0
              ? t('protocols_vial_past')
              : t('protocols_vial_days_left').replace('{n}', String(daysLeft))}
          </Text>
        )}
      </Text>
    );
  }

  // Shared detail block: Day X of Y + bar, vial line, not-due note and the
  // status chips (skipped, partial, last-site recall, per-protocol streak).
  function renderDetails(p, d) {
    const skipped = d.dueToday && !d.isTaken && d.skippedToday > 0;
    const partial = d.dueToday && !d.isTaken && d.dosesTakenToday > 0 && d.dosesNeeded > 1;
    const hasChips = skipped || partial || d.lastSite || d.pStreak > 0;
    return (
      <>
        {d.progress && (
          <View style={s.progWrap}>
            <Text style={s.progressText}>
              {t('today_day_of').replace('{current}', d.progress.current).replace('{total}', d.progress.total)}
            </Text>
            <View style={s.progressBarOuter}>
              <View style={[s.progressBarInner, { width: `${Math.min((d.progress.current / d.progress.total) * 100, 100)}%` }]} />
            </View>
          </View>
        )}
        {renderVialLine(p)}
        {!d.dueToday && (
          <Text style={s.restText}>
            {t('today_not_due')}
            {d.nextDue ? ` · ${t('today_next_dose').replace('{date}', `${t(MONTH_KEYS[d.nextDue.getMonth()])} ${d.nextDue.getDate()}`)}` : ''}
          </Text>
        )}
        {hasChips && (
          <View style={s.chipRow}>
            {skipped && <Chip tone="warning" label={t('today_skipped_today')} style={s.chipMax} />}
            {partial && <Chip tone="warning" label={`${d.dosesTakenToday}/${d.dosesNeeded} ${t('today_taken_partial')}`} style={s.chipMax} />}
            {/* Last-site recall — recall only, never a recommendation */}
            {d.lastSite && (
              <Chip
                label={t('today_last_site').replace('{site}', d.lastSite.summary).replace('{days}', String(d.lastSite.daysAgo))}
                style={s.chipMax}
              />
            )}
            {d.pStreak > 0 && (
              <View style={s.streakChip}>
                <FeatureIcon name="flame" size={12} color={colors.warningSoftText} />
                <Text style={s.streakChipText} numberOfLines={1}>{d.pStreak} {d.pStreak === 1 ? t('today_streak_day') : t('today_streak_days')}</Text>
              </View>
            )}
          </View>
        )}
      </>
    );
  }

  // The dose that is due now (or next today): one clear card, round actions.
  function renderHeroCard(p) {
    const d = doseInfo(p);
    const due = isDoseDue(p);
    const when = d.nextTime || (d.times.length ? d.times[0] : null);
    const head = !p.reminder_time ? t('today_section_today') : due ? t('hy_due_now') : t('hy_up_next');
    const faded = d.isTaken || !d.dueToday;
    return (
      <Card key={p.id} style={[s.blockCard, faded && { opacity: isDark ? 0.8 : 0.6 }]}>
        <SectionLabel color={colors.accent}>{when ? `${head} · ${when}` : head}</SectionLabel>
        {/* Tapping the name opens this protocol in the Protocols tab. */}
        <TouchableOpacity
          style={s.heroNameRow}
          activeOpacity={0.6}
          onPress={() => openProtocol(p)}
          accessibilityRole="button"
          accessibilityLabel={d.name}
        >
          <Dot color={p.color || colors.accent} />
          <Text style={s.heroName} numberOfLines={2}>{d.name}</Text>
          <Chevron color={colors.textSubtle} size={18} />
        </TouchableOpacity>
        <View style={s.heroIndent}>
          <Text style={s.heroMeta}>
            {p.dose} {p.dose_unit} · {frequencyLabelFor(p.interval_days, t)}
            {d.times.length > 1 ? ` · ${d.times.join(' · ')}` : ''}
          </Text>
          {renderDetails(p, d)}
        </View>
        {d.dueToday && !d.isTaken && (
          <View style={s.heroActions}>
            <TakeButton
              key={`take-${p.id}-${d.dosesTakenToday}-${takeReset[p.id] || 0}`}
              variant="round"
              label={d.nextTime ? t('today_take_time').replace('{time}', d.nextTime) : t('today_mark_taken')}
              takenLabel={takenLabel}
              onTake={(rect) => handleTake(p, rect)}
              s={s}
              colors={colors}
            />
            <RoundAction
              icon={<CrossMark size={20} color={colors.text} />}
              label={t('today_skip')}
              onPress={() => skipDose(p)}
            />
          </View>
        )}
      </Card>
    );
  }

  // A flat row inside a card (rest of today / tomorrow / next days).
  function renderDoseRow(p, isLast) {
    const d = doseInfo(p);
    // Fade done/not-due rows so actionable ones stand out (gentler in dark).
    const faded = d.isTaken || !d.dueToday;
    return (
      <View key={p.id} style={[s.row, !isLast && s.rowSep, faded && { opacity: isDark ? 0.8 : 0.6 }]}>
        <TouchableOpacity
          style={s.rowTop}
          activeOpacity={0.6}
          onPress={() => openProtocol(p)}
          accessibilityRole="button"
          accessibilityLabel={d.name}
        >
          <Dot color={p.color || colors.accent} size={8} />
          <Text style={s.rowName} numberOfLines={2}>
            {d.name}
            <Text style={s.rowDose}> · {p.dose} {p.dose_unit}</Text>
          </Text>
          {d.times.length > 0 && (
            <View style={s.rowTime}>
              <Text style={s.rowTimeVal} numberOfLines={2}>{d.times.join(' · ')}</Text>
              <Text style={s.rowTimeLbl}>{t('today_reminder')}</Text>
            </View>
          )}
          <Chevron color={colors.textSubtle} size={16} />
        </TouchableOpacity>
        <View style={s.rowIndent}>
          <Text style={s.rowMeta}>{frequencyLabelFor(p.interval_days, t)}</Text>
          {renderDetails(p, d)}
          {d.dueToday && !d.isTaken && (
            <View style={s.rowActions}>
              <TouchableOpacity style={s.skipBtn} onPress={() => skipDose(p)} accessibilityRole="button">
                <Text style={s.skipBtnText}>{t('today_skip')}</Text>
              </TouchableOpacity>
              <TakeButton
                key={`take-${p.id}-${d.dosesTakenToday}-${takeReset[p.id] || 0}`}
                label={d.nextTime ? t('today_take_time').replace('{time}', d.nextTime) : t('today_mark_taken')}
                takenLabel={takenLabel}
                onTake={(rect) => handleTake(p, rect)}
                s={s}
                colors={colors}
              />
            </View>
          )}
        </View>
      </View>
    );
  }

  // A dose already taken today — shown in "Rest of today", with Undo while
  // the undo window for it is open.
  function renderTakenRow(p, isLast) {
    const name = p.compound_id ? t(p.compound_id) : p.name;
    const canUndo = undoData && undoData.protocolId === p.id;
    return (
      <View key={`taken-${p.id}`} style={[s.takenRow, !isLast && s.rowSep]}>
        <TouchableOpacity style={s.takenMain} activeOpacity={0.6} onPress={() => openProtocol(p)} accessibilityRole="button" accessibilityLabel={`${name} · ${t('today_taken')}`}>
          <View style={s.takenTick}><CheckMark size={13} color={colors.success} /></View>
          <Text style={s.takenText} numberOfLines={1}>{name} · {t('today_taken')}</Text>
        </TouchableOpacity>
        {canUndo && (
          <TouchableOpacity style={s.inlineUndo} onPress={undoTake} accessibilityRole="button">
            <Text style={s.inlineUndoText}>{t('today_undo')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function renderSectionCard(label, items) {
    if (items.length === 0) return null;
    return (
      <Card style={s.listCard}>
        <SectionLabel style={s.listLabel}>{label}</SectionLabel>
        {items.map((p, i) => renderDoseRow(p, i === items.length - 1))}
      </Card>
    );
  }

  // Today: every dose due now gets the full card; if none is due yet, the
  // next one of the day does. The rest (and doses already taken) sit in one card.
  const dueNowCards = todayCards.filter(p => isDoseDue(p));
  const heroCards = dueNowCards.length > 0 ? dueNowCards : todayCards.slice(0, 1);
  const restCards = todayCards.filter(p => !heroCards.includes(p));
  const takenTodayList = dailyOrder.filter(p => {
    const need = expectedDosesOn(p, todayDate);
    return need > 0 && (takenCounts[p.id] || 0) >= need && !todayCards.includes(p);
  });

  // Soft tint behind each alert's icon.
  function alertTone(a) {
    if (a.id === 'supply_low') return [colors.dangerSoft, colors.danger];
    if (a.due) return [colors.warningSoft, colors.warning];
    return [colors.accentSoft, colors.accent];
  }

  const titleText = `${greeting}${userName ? `, ${userName}` : ''}`;
  const ringA11y = totalDoses > 0 ? `${Math.round(ringTarget * 100)}% ${t('today_done_of')}` : t('today_done_of');

  return (
    <SafeAreaView style={s.container} ref={rootRef} collapsable={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.centered, s.scrollPad]}>
        <View style={s.header}>
          <ScreenTitle
            eyebrow={today}
            title={titleText}
            right={(
              <View ref={ringRef} collapsable={false} style={s.ringBox} accessible accessibilityLabel={ringA11y}>
                {/* 90×90 canvas around the 58×58 ring so the landing pulse can grow past it */}
                <Svg width={90} height={90} viewBox="-16 -16 90 90" style={s.ringSvg}>
                  <ACircle cx={29} cy={29} fill="none" stroke={colors.accent} strokeWidth={2} animatedProps={ringPulseProps} />
                  <Circle cx={29} cy={29} r={RING_R} fill="none" stroke={colors.ringTrack} strokeWidth={6} />
                  <ACircle
                    cx={29} cy={29} r={RING_R} fill="none"
                    stroke={colors.accent} strokeWidth={6} strokeLinecap="round"
                    strokeDasharray={RING_CIRC}
                    transform="rotate(-90 29 29)"
                    animatedProps={ringArcProps}
                  />
                </Svg>
              </View>
            )}
          />
          <View style={s.subWrap}>
            {totalCount === 0
              ? <Text style={s.sub}>{t('today_no_protocols')}</Text>
              : <AnimatedNumber value={doneShown} format={subFmt} style={[s.sub, s.subFill]} />}
          </View>
        </View>

        {/* Alerts — pending, actionable reminders (never daily doses). */}
        {alerts.length > 0 && (
          <View style={s.alertsSection}>
            <SectionLabel style={s.blockLabel}>{t('today_alerts_title')}</SectionLabel>
            {alerts.map(a => {
              const [tintBg, tintFg] = alertTone(a);
              const open = snoozeOpen === a.id;
              return (
                <Card key={a.id} padded={false} style={s.alertCard}>
                  <View style={s.alertRow}>
                    <TouchableOpacity style={s.alertMain} activeOpacity={0.7} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={`${a.title}. ${a.body}`}>
                      <View style={[s.alertIcon, { backgroundColor: tintBg }]}>
                        <FeatureIcon name={a.iconName} size={20} color={tintFg} />
                      </View>
                      <View style={s.alertTextWrap}>
                        <Text style={s.alertTitle} numberOfLines={1}>{a.title}</Text>
                        <Text style={s.alertBody} numberOfLines={2}>{a.body}</Text>
                      </View>
                    </TouchableOpacity>
                    {a.snoozeId ? (
                      // Snoozable alert: the round control opens "Later today · Tomorrow · In N days".
                      <TouchableOpacity
                        style={[s.alertRound, open && s.alertRoundOn]}
                        onPress={() => setSnoozeOpen(open ? null : a.id)}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('alert_snooze')}
                        accessibilityState={{ expanded: open }}
                      >
                        <FeatureIcon name="snooze" size={20} color={open ? colors.accent : colors.textMuted} />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={s.alertRound}
                        onPress={a.onRemove}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('today_alert_remove')}
                      >
                        <CrossMark size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {a.snoozeId && open && (
                    <View style={s.snoozeStrip}>
                      {[
                        // "Later today" only while it can still land today (3h, before 21:00).
                        ...(new Date().getHours() < 18 ? [['later', t('alert_snooze_later')]] : []),
                        ['tomorrow', t('alert_snooze_tomorrow')],
                        // The weigh-in alert has no long snooze — its third option is Remove.
                        a.onRemove
                          ? ['remove', t('today_alert_remove')]
                          : ['days', t('alert_snooze_days').replace('{n}', String(Math.round((ALERT_SNOOZE_MS[a.snoozeId] || 7 * 86400000) / 86400000)))],
                      ].map(([kind, label], i) => (
                        <TouchableOpacity key={kind} style={[s.snoozeOpt, i > 0 && s.snoozeOptSep]} onPress={() => (kind === 'remove' ? (setSnoozeOpen(null), a.onRemove()) : snoozeAlert(a.snoozeId, kind))} accessibilityRole="button">
                          <Text style={[s.snoozeOptText, kind === 'remove' && { color: colors.danger }]}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}

        {protocols.length === 0 && !loading && (
          <Card style={s.emptyCard}>
            <View style={s.emptyIcon}><FeatureIcon name="syringe" size={36} color={colors.accent} /></View>
            <Text style={s.emptyTitle}>{t('today_empty_title')}</Text>
            <Text style={s.emptySub}>{t('today_empty_sub')}</Text>
            <View style={s.tipBox}>
              <SectionLabel style={s.tipTitle}>{t('today_tip_title')}</SectionLabel>
              {[
                t('today_tip_1'),
                t('today_tip_2'),
                t('today_tip_3'),
              ].map((tip, i) => (
                <View key={i} style={[s.tipRow, i > 0 && s.rowSepTop]}>
                  <View style={s.tipNum}>
                    <Text style={s.tipNumText}>{i + 1}</Text>
                  </View>
                  <Text style={s.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {protocols.length > 0 && (
          <View style={s.section}>
            {heroCards.map(p => renderHeroCard(p))}
            {allDoneToday && (
              <Card style={s.blockCard}>
                <SectionLabel>{t('today_section_today')}</SectionLabel>
                <View style={s.allDoneRow}>
                  <View style={s.takenTick}><CheckMark size={13} color={colors.success} /></View>
                  <Text style={s.allDoneText}>{t('today_all_done')}</Text>
                </View>
                {takenTodayList.length > 0 && (
                  <View style={s.rowSepTop}>
                    {takenTodayList.map((p, i) => renderTakenRow(p, i === takenTodayList.length - 1))}
                  </View>
                )}
              </Card>
            )}
            {!allDoneToday && (restCards.length > 0 || (heroCards.length > 0 && takenTodayList.length > 0)) && (
              <Card style={s.listCard}>
                <SectionLabel style={s.listLabel}>{t('hy_rest_of_today')}</SectionLabel>
                {restCards.map((p, i) => renderDoseRow(p, i === restCards.length - 1 && takenTodayList.length === 0))}
                {takenTodayList.map((p, i) => renderTakenRow(p, i === takenTodayList.length - 1))}
              </Card>
            )}
          </View>
        )}

        {/* Progress: today's share of doses + streak / week (opens the log). */}
        {protocols.length > 0 && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Log')}
            accessibilityRole="button"
            accessibilityLabel={t('today_view_log')}
            style={s.sectionPad}
          >
            <Card style={s.blockCard}>
              <View style={s.cardHead}>
                <SectionLabel>{t('today_section_progress')}</SectionLabel>
                <View style={s.linkRow}>
                  <Text style={s.linkText}>{t('today_view_log')}</Text>
                  <Chevron color={colors.accent} size={15} />
                </View>
              </View>
              <View style={s.progHero}>
                <View style={s.progHeroLeft}>
                  <AnimatedNumber value={ringFrac} format={pctFmt} style={s.bigPct} width={150} />
                  <Text style={s.bigPctLbl}>{t('today_done_of')}</Text>
                </View>
                <View style={s.progFacts}>
                  <View style={s.progFact}>
                    <AnimatedNumber value={doneShown} format={intFmt} style={s.factVal} width={48} />
                    <Text style={s.factLbl} numberOfLines={1}>{t('today_done')}</Text>
                  </View>
                  <View style={s.progFact}>
                    <Text style={s.factVal}>{totalCount}</Text>
                    <Text style={s.factLbl} numberOfLines={1}>{t('today_protocols')}</Text>
                  </View>
                </View>
              </View>
              {weekDots.length > 0 && (
                <>
                  <View style={s.streakLine}>
                    {streak > 0 && <FeatureIcon name="flame" size={18} color={colors.warning} />}
                    <Text style={s.streakText}>
                      {streak > 0
                        ? `${streak} ${streak === 1 ? t('today_streak_day') : t('today_streak_days')}`
                        : t('today_streak_none')}
                      <Text style={s.streakSub}>{`  ·  ${monthConsistency}% ${t('today_streak_monthly')}`}</Text>
                    </Text>
                    {streak >= 7 && <Chip tone="warning" label={t('today_streak_fire')} />}
                  </View>
                  <View style={s.streakDots}>
                    {weekDots.map((dot, i) => (
                      <View key={i} style={s.streakDotCol}>
                        <View style={[
                          s.streakDot,
                          dot.status === 'complete' && s.streakDotComplete,
                          dot.status === 'partial' && s.streakDotPartial,
                          dot.status === 'missed' && s.streakDotMissed,
                          dot.status === 'rest' && s.streakDotRest,
                          dot.isToday && s.streakDotToday,
                        ]}>
                          {dot.status === 'complete' && !dot.isToday && (
                            <CheckMark size={13} color={colors.success} />
                          )}
                        </View>
                        <Text style={[s.streakDotLabel, dot.isToday && s.streakDotLabelToday]}>
                          {t(WEEKDAY_KEYS[dot.dayIndex])}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Text style={s.streakExplainer}>{t('today_streak_explainer')}</Text>
                </>
              )}
            </Card>
          </TouchableOpacity>
        )}

        {protocols.length > 0 && weekDots.length > 0 && (
          <TouchableOpacity
            style={s.shareToggle}
            onPress={() => setShowShareCard(!showShareCard)}
            accessibilityRole="button"
          >
            <Text style={s.shareToggleText}>
              {showShareCard ? t('today_share_hide') : t('today_share_show')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Share card: a deliberately fixed dark surface (exported look) in both themes. */}
        {showShareCard && protocols.length > 0 && (
          <View style={s.shareCard}>
            <View style={s.shareCardInner}>
              <Text style={s.shareTitle}>
                {streak > 0
                  ? `${streak} ${streak === 1 ? t('today_streak_day') : t('today_streak_days')}`
                  : t('today_share_started')}
              </Text>
              <Text style={s.shareSubtitle}>{t('today_share_tracking')}</Text>

              <View style={s.shareStats}>
                <View style={s.shareStat}>
                  <Text style={s.shareStatVal}>{monthConsistency}%</Text>
                  <Text style={s.shareStatLbl}>{t('today_share_adherence')}</Text>
                </View>
                <View style={s.shareStatDivider} />
                <View style={s.shareStat}>
                  <Text style={s.shareStatVal}>{totalCount}</Text>
                  <Text style={s.shareStatLbl}>{t('today_share_protocols')}</Text>
                </View>
                <View style={s.shareStatDivider} />
                <View style={s.shareStat}>
                  <Text style={s.shareStatVal}>{streak}</Text>
                  <Text style={s.shareStatLbl}>{t('today_share_streak')}</Text>
                </View>
              </View>

              <View style={s.shareDots}>
                {weekDots.map((dot, i) => (
                  <View key={i} style={s.shareDotCol}>
                    <View style={[
                      s.shareDot,
                      dot.status === 'complete' && s.shareDotComplete,
                      dot.status === 'partial' && s.shareDotPartial,
                      dot.status === 'rest' && s.shareDotRest,
                    ]} />
                    <Text style={s.shareDotLabel}>{t(WEEKDAY_KEYS[dot.dayIndex])}</Text>
                  </View>
                ))}
              </View>

              <View style={s.shareBrand}>
                <Text style={s.shareBrandText}>DoseTrace</Text>
                <Text style={s.shareBrandSub}>{t('today_share_tagline')}</Text>
              </View>
              <Text style={s.shareDisclaimer}>{t('today_share_disclaimer')}</Text>
            </View>
          </View>
        )}

        {protocols.length > 0 && (
          <View style={s.section}>
            {renderSectionCard(t('today_section_tomorrow'), tomorrowCards)}
            {renderSectionCard(t('today_section_next5'), next5Cards)}
            {laterCount > 0 && (
              <Text style={s.laterHint}>{t('today_more_later').replace('{count}', laterCount)}</Text>
            )}
          </View>
        )}

        {/* Compliance disclaimer */}
        {protocols.length > 0 && (
          <Text style={s.disclaimer}>{t('today_disclaimer')}</Text>
        )}

        <View style={{ height: undoData ? 96 : 40 }} />
      </ScrollView>

      {/* Undo toast — floats above the list so it is always visible (fixed toast surface). */}
      {undoData && (
        <View style={s.undoBar}>
          <Text style={s.undoBarText}>{t('today_dose_logged')}</Text>
          <View style={s.undoBarActions}>
            {['recon', 'rtu'].includes(protocols.find(p => p.id === undoData.protocolId)?.type) && (
              <TouchableOpacity onPress={() => openBodyMapForUndo(undoData)} accessibilityRole="button" hitSlop={{ top: 10, bottom: 10 }}>
                <Text style={s.undoBarAction}>{t('today_undo_add_site')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={undoTake} accessibilityRole="button" hitSlop={{ top: 10, bottom: 10 }}>
              <Text style={s.undoBarAction}>{t('today_undo')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Body map modal — auto-opens after taking an injectable dose,
          and re-openable from the undo toast "Add site" button */}
      <BodyMapModal
        visible={bodyMapVisible}
        onClose={handleBodyMapClose}
        onSave={handleBodyMapSave}
        initialStored={bodyMapTarget?.initialStored || null}
        protocolName={protocols.find(p => p.id === bodyMapTarget?.protocolId)?.name || null}
        recentLogs={bodyMapTarget?.recentLogs || []}
      />

      {/* Vial continuation modal */}
      <Modal visible={showVialPrompt} transparent animationType="fade">
        <View style={s.promptOverlay}>
          <View style={s.promptCard}>
            <Text style={s.promptTitle}>{t('today_vial_done_title')}</Text>
            {continuationProtocol && (
              <View style={s.promptNameRow}>
                <Dot color={continuationProtocol.color || colors.accent} size={8} />
                <Text style={s.promptProtocolName}>{continuationProtocol.name}</Text>
              </View>
            )}
            <Text style={s.promptSub}>{t('today_vial_done_sub')}</Text>

            <SectionLabel style={s.promptLabel}>{t('today_vial_mix_date')}</SectionLabel>
            <View style={s.yesterdayRow}>
              <TouchableOpacity
                style={s.yesterdayPill}
                onPress={() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  setNewVialMonth(y.getMonth());
                  setNewVialDay(String(y.getDate()));
                }}
                accessibilityRole="button"
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
                accessibilityRole="button"
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
                    accessibilityRole="button"
                    accessibilityState={{ selected: newVialMonth === idx }}
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
                <Text style={s.promptCapacity}>
                  {t('today_vial_new_capacity').replace('{n}', String(cap))}
                </Text>
              ) : null;
            })()}

            <View style={s.promptActions}>
              <TouchableOpacity
                style={s.promptBtnSecondary}
                onPress={() => { setShowVialPrompt(false); setContinuationProtocol(null); }}
                accessibilityRole="button"
              >
                <Text style={s.promptBtnSecondaryText}>{t('today_vial_finished')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.promptBtnPrimary}
                onPress={createNewVial}
                accessibilityRole="button"
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
              <View style={s.promptNameRow}>
                <Dot color={inactiveProtocol.color || colors.accent} size={8} />
                <Text style={s.promptProtocolName}>
                  {inactiveProtocol.compound_id ? t(inactiveProtocol.compound_id) : inactiveProtocol.name}
                </Text>
              </View>
            )}
            <Text style={s.promptSub}>{t('today_tx_over_body')}</Text>
            <View style={s.promptActions}>
              <TouchableOpacity style={s.promptBtnSecondary} onPress={snoozeInactiveProtocol} accessibilityRole="button">
                <Text style={s.promptBtnSecondaryText}>{t('today_tx_over_keep')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.promptBtnPrimary} onPress={endInactiveProtocol} accessibilityRole="button">
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

const HAIR = StyleSheet.hairlineWidth;

const makeStyles = (c) => StyleSheet.create({
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  scrollPad: { paddingTop: 8 },
  container: { flex: 1, backgroundColor: c.bg },

  // Header
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  subWrap: { marginTop: 4 },
  sub: { fontSize: 14.5, color: c.textMuted },
  subFill: { alignSelf: 'stretch' },
  ringBox: { width: 58, height: 58, marginLeft: 12, marginBottom: -2 },
  ringSvg: { position: 'absolute', left: -16, top: -16 },

  // Shared blocks
  section: { paddingHorizontal: 16 },
  sectionPad: { paddingHorizontal: 16 },
  blockCard: { marginBottom: 12 },
  blockLabel: { marginBottom: 8, marginLeft: 4 },
  listCard: { marginBottom: 12, paddingTop: 14, paddingBottom: 4 },
  listLabel: { marginBottom: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 24 },
  linkText: { fontSize: 14, fontWeight: '600', color: c.accent },
  rowSepTop: { borderTopWidth: HAIR, borderTopColor: c.border },

  // Alerts
  alertsSection: { marginHorizontal: 16, marginBottom: 12 },
  alertCard: { marginBottom: 10, borderRadius: 18 },
  alertRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
  alertMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 14, paddingRight: 8, minHeight: 60 },
  alertIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  alertTextWrap: { flex: 1, minWidth: 0 },
  alertTitle: { fontSize: 14.5, fontWeight: '600', color: c.text },
  alertBody: { fontSize: 12.5, color: c.textMuted, marginTop: 1, lineHeight: 17 },
  alertRound: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center' },
  alertRoundOn: { backgroundColor: c.accentSoft },
  snoozeStrip: { flexDirection: 'row', borderTopWidth: HAIR, borderTopColor: c.border },
  snoozeOpt: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  snoozeOptSep: { borderLeftWidth: HAIR, borderLeftColor: c.border },
  snoozeOptText: { fontSize: 13.5, fontWeight: '600', color: c.accent, textAlign: 'center' },

  // Due-now card
  heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, minHeight: 32 },
  heroName: { flex: 1, fontSize: 19, lineHeight: 24, fontWeight: '600', color: c.text },
  heroIndent: { marginLeft: 20 },
  heroMeta: { fontSize: 14.5, color: c.textMuted, marginTop: 2 },
  heroActions: { flexDirection: 'row', marginTop: 14, paddingTop: 14, borderTopWidth: HAIR, borderTopColor: c.border },
  takeRoundWrap: { flex: 1 },
  takeRoundTouch: { alignItems: 'center', gap: 6 },
  takeRound: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  takeRoundOk: { backgroundColor: c.successSoft },
  roundLbl: { fontSize: 12, fontWeight: '500', color: c.textMuted, textAlign: 'center', paddingHorizontal: 4 },

  // Detail block
  progWrap: { marginTop: 6 },
  progressText: { fontSize: 12, color: c.accent, fontWeight: '500' },
  progressBarOuter: { height: 3, backgroundColor: c.card2, marginTop: 4, borderRadius: 2, overflow: 'hidden' },
  progressBarInner: { height: 3, backgroundColor: c.accent, borderRadius: 2 },
  vialStatusText: { fontSize: 12.5, color: c.textSubtle, marginTop: 4, lineHeight: 17 },
  vialLink: { alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center' },
  restText: { fontSize: 12.5, color: c.accent, fontWeight: '500', marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chipMax: { maxWidth: '100%' },
  streakChip: { height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: c.warningSoft, flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  streakChipText: { fontSize: 12, fontWeight: '600', color: c.warningSoftText, flexShrink: 1 },

  // Flat rows
  row: { paddingVertical: 12 },
  rowSep: { borderBottomWidth: HAIR, borderBottomColor: c.border },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 },
  rowName: { flex: 1, fontSize: 15.5, fontWeight: '500', color: c.text },
  rowDose: { fontWeight: '400', color: c.textMuted },
  rowTime: { alignItems: 'flex-end', maxWidth: 130 },
  rowTimeVal: { fontSize: 13, fontWeight: '500', color: c.textMuted, textAlign: 'right' },
  rowTimeLbl: { fontSize: 11, color: c.textSubtle },
  rowIndent: { marginLeft: 20 },
  rowMeta: { fontSize: 13, color: c.textMuted, marginTop: 1 },
  rowActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  skipBtn: { flex: 1, height: 44, borderRadius: 14, backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center' },
  skipBtnText: { fontSize: 14, color: c.textMuted, fontWeight: '600' },
  doseBtn: { flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  doseBtnPrimary: { backgroundColor: c.accent },
  doseBtnPrimaryWrap: { flex: 2 },
  doseBtnFill: { flex: 0, alignSelf: 'stretch' },
  doseBtnOk: { backgroundColor: c.successSoft },
  doseBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  doseBtnPrimaryText: { fontSize: 14, color: c.accentText, fontWeight: '600' },

  // Taken rows
  takenRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  takenMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  takenTick: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.successSoft, alignItems: 'center', justifyContent: 'center' },
  takenText: { flex: 1, fontSize: 15.5, color: c.textMuted },
  inlineUndo: { height: 44, paddingHorizontal: 6, justifyContent: 'center' },
  inlineUndoText: { fontSize: 14, fontWeight: '600', color: c.accent },
  allDoneRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, marginTop: 4 },
  allDoneText: { flex: 1, fontSize: 15.5, fontWeight: '500', color: c.text },
  laterHint: { fontSize: 12.5, color: c.textSubtle, textAlign: 'center', paddingVertical: 12 },

  // Progress card
  progHero: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4 },
  progHeroLeft: { flexShrink: 1 },
  bigPct: { fontSize: 52, lineHeight: 58, fontWeight: '200', letterSpacing: -2, color: c.text, fontVariant: ['tabular-nums'] },
  bigPctLbl: { fontSize: 12.5, color: c.textSubtle },
  progFacts: { flexDirection: 'row', gap: 18, paddingBottom: 4 },
  progFact: { alignItems: 'flex-start' },
  factVal: { fontSize: 22, lineHeight: 26, fontWeight: '300', color: c.text, fontVariant: ['tabular-nums'] },
  factLbl: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: c.textSubtle, marginTop: 2 },
  streakLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 14, borderTopWidth: HAIR, borderTopColor: c.border },
  streakText: { flex: 1, fontSize: 15, fontWeight: '600', color: c.text },
  streakSub: { fontSize: 13, fontWeight: '400', color: c.textMuted },
  streakDots: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  streakDotCol: { alignItems: 'center', gap: 6 },
  streakDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center' },
  streakDotComplete: { backgroundColor: c.successSoft },
  streakDotPartial: { backgroundColor: c.warningSoft },
  streakDotMissed: { backgroundColor: c.card2 },
  streakDotRest: { backgroundColor: c.accentSoft },
  streakDotToday: { backgroundColor: c.accent },
  streakDotLabel: { fontSize: 11, color: c.textSubtle, fontWeight: '500' },
  streakDotLabelToday: { color: c.accent, fontWeight: '600' },
  streakExplainer: { fontSize: 12, color: c.textSubtle, lineHeight: 17, marginTop: 12 },

  // Share
  shareToggle: { alignSelf: 'center', marginBottom: 12, paddingHorizontal: 16, minHeight: 36, justifyContent: 'center', backgroundColor: c.accentSoft, borderRadius: 18 },
  shareToggleText: { fontSize: 13, color: c.accentSoftText, fontWeight: '600' },
  shareCard: { marginHorizontal: 16, marginBottom: 16 },
  // Fixed export surface (same in both themes by design).
  shareCardInner: { backgroundColor: '#0F172A', borderRadius: 20, padding: 24, alignItems: 'center' },
  shareTitle: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 4 },
  shareSubtitle: { fontSize: 13, color: '#94A3B8', marginBottom: 20 },
  shareStats: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8, width: '100%', marginBottom: 20 },
  shareStat: { flex: 1, alignItems: 'center' },
  shareStatVal: { fontSize: 22, fontWeight: '700', color: '#fff' },
  shareStatLbl: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  shareStatDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.12)' },
  shareDots: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 20 },
  shareDotCol: { alignItems: 'center', gap: 4 },
  shareDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
  shareDotComplete: { backgroundColor: '#22C55E' },
  shareDotPartial: { backgroundColor: '#F59E0B' },
  shareDotRest: { backgroundColor: 'rgba(255,255,255,0.18)' },
  shareDotLabel: { fontSize: 9, color: '#64748B', fontWeight: '500' },
  shareBrand: { alignItems: 'center', marginBottom: 8 },
  shareBrandText: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  shareBrandSub: { fontSize: 10, color: '#64748B', marginTop: 2 },
  shareDisclaimer: { fontSize: 8, color: '#475569', textAlign: 'center' },

  // Disclaimer / empty
  disclaimer: { fontSize: 11.5, color: c.textSubtle, textAlign: 'center', marginTop: 12, marginHorizontal: 28, lineHeight: 16 },
  emptyCard: { marginHorizontal: 16, marginTop: 4, alignItems: 'center', paddingVertical: 24 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 19, fontWeight: '600', color: c.text, marginBottom: 6 },
  emptySub: { fontSize: 14.5, color: c.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 18 },
  tipBox: { alignSelf: 'stretch', borderTopWidth: HAIR, borderTopColor: c.border, paddingTop: 14 },
  tipTitle: { marginBottom: 6 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 8 },
  tipNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  tipNumText: { fontSize: 12, color: c.accentText, fontWeight: '600' },
  tipText: { fontSize: 14.5, color: c.text, flex: 1, lineHeight: 20 },

  // Prompts (vial continuation / inactivity)
  promptOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
  promptCard: { backgroundColor: c.card, borderRadius: 20, padding: 20, width: '100%', maxWidth: 360, ...c.shadowCard },
  promptTitle: { fontSize: 19, fontWeight: '600', color: c.text, marginBottom: 6 },
  promptNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  promptProtocolName: { fontSize: 15, fontWeight: '600', color: c.text, flexShrink: 1 },
  promptSub: { fontSize: 14.5, color: c.textMuted, marginBottom: 18, lineHeight: 20 },
  promptLabel: { marginBottom: 8 },
  promptCapacity: { fontSize: 12.5, color: c.textMuted, marginTop: 12 },
  promptMonthScroll: { marginBottom: 10 },
  promptMonthRow: { flexDirection: 'row', gap: 6 },
  promptMonthPill: { paddingHorizontal: 12, height: 34, justifyContent: 'center', borderRadius: 17, backgroundColor: c.card2 },
  promptMonthPillOn: { backgroundColor: c.accent },
  promptMonthText: { fontSize: 13, color: c.textMuted, fontWeight: '500' },
  promptMonthTextOn: { color: c.accentText, fontWeight: '600' },
  promptDayInput: { borderRadius: 12, height: 44, paddingHorizontal: 10, fontSize: 16, color: c.text, backgroundColor: c.card2, width: 80, textAlign: 'center' },
  promptActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  promptBtnSecondary: { flex: 1, minHeight: 50, paddingHorizontal: 8, borderRadius: 16, backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center' },
  promptBtnSecondaryText: { fontSize: 15, color: c.text, fontWeight: '500', textAlign: 'center' },
  promptBtnPrimary: { flex: 1, minHeight: 50, paddingHorizontal: 8, borderRadius: 16, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  promptBtnPrimaryText: { fontSize: 15, color: c.accentText, fontWeight: '600', textAlign: 'center' },
  yesterdayRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  yesterdayPill: { paddingHorizontal: 14, height: 34, justifyContent: 'center', borderRadius: 17, backgroundColor: c.accentSoft },
  yesterdayPillText: { fontSize: 13, color: c.accentSoftText, fontWeight: '600' },

  // Undo toast (fixed toast surface in both themes)
  undoBar: {
    position: 'absolute', left: 16, right: 16, bottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: c.toast, borderRadius: 16, paddingHorizontal: 16, minHeight: 52, ...c.shadowCard,
  },
  undoBarText: { fontSize: 14, color: c.toastText, fontWeight: '500', flexShrink: 1 },
  undoBarActions: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  undoBarAction: { fontSize: 14, color: '#5CB8FF', fontWeight: '600' },

  flyDrop: { position: 'absolute', left: 0, top: 0, width: 10, height: 13, zIndex: 50, elevation: 50 },
});
