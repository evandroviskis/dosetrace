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
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { Analytics } from '../lib/analytics';
import { syncVialAlerts, scheduleDoseReminder, cancelFollowups, cancelDoseReminder } from '../lib/notifications';
import {
  getActiveProtocols, getActiveVials, getTodayLogs, getTakenLogsSince, getLogsSince,
  insertDoseLog, deleteDoseLog, updateDoseLog, updateVial, insertVial, updateProtocol,
  getProtocolById, hardDeleteOldProtocols, softDeleteProtocol, deactivateVialsByProtocol,
} from '../lib/database';
import { requestSync, addSyncListener } from '../lib/sync';
import BodyMapModal from './components/BodyMapModal';
import { summarizeStored } from '../lib/injectionSites';
import { dosesPerVial } from '../lib/doseMath';
import { DEFAULT_VALID_DAYS, daysUntilExpiry, expiryColor } from '../lib/vialExpiry';
import { formatTime } from '../lib/timeFormat';
import { friendlyError } from '../lib/friendlyError';
import { useTheme } from '../lib/theme';
import {
  sortedDoseTimes, expectedDosesOn, nextDueDate, existedOn, toPastDateString, nextDoseAt,
} from '../lib/schedule';

const WEEKDAY_KEYS = ['today_sun','today_mon','today_tue','today_wed','today_thu','today_fri','today_sat'];

const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr',
  'month_may', 'month_jun', 'month_jul', 'month_aug',
  'month_sep', 'month_oct', 'month_nov', 'month_dec',
];

// ── Schedule math ──────────────────────────────────────────────
// Extracted to lib/schedule.js (pure + unit-tested). Imported above.

export default function TodayScreen() {
  const { t, language } = useLanguage();
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [protocols, setProtocols] = useState([]);
  const [vials, setVials] = useState({}); // keyed by protocol_id
  const [takenCounts, setTakenCounts] = useState({}); // { protocol_id: count } — outcome 'Taken' only
  const [skippedCounts, setSkippedCounts] = useState({}); // { protocol_id: count } — outcome 'Skipped' only
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
  const [userName, setUserName] = useState('');
  const [streak, setStreak] = useState(0);
  const [monthConsistency, setMonthAdherence] = useState(0);
  const [weekDots, setWeekDots] = useState([]);
  const [showShareCard, setShowShareCard] = useState(false);
  const actionInProgressRef = useRef(false); // ref, not state — must block synchronously on double-tap
  const [undoData, setUndoData] = useState(null); // { logId, protocolId, vialId, prevDosesTaken, timer }
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
      const hour = new Date().getHours();
      if (hour < 12) setGreeting(t('today_greeting_morning'));
      else if (hour < 18) setGreeting(t('today_greeting_afternoon'));
      else setGreeting(t('today_greeting_evening'));
      // Fetch display name
      getCachedUser().then(user => {
        if (user?.user_metadata?.display_name) {
          setUserName(user.user_metadata.display_name.split(/\s+/)[0]); // first name only
        }
      }).catch(() => {});
      cleanupOldDeletedProtocols();
      fetchProtocols();
      fetchTodayLogs();
      fetchStreakData();
      fetchProtocolStreaks();
      fetchLastSites();
      checkTreatmentStillActive();
    }, [])
  );

  // Refresh when a cloud import/sync finishes — after logging in on a new device
  // the import runs in the background, so the first focus-fetch can hit an empty
  // local DB. Re-fetch on completion instead of requiring a manual tab switch.
  useEffect(() => {
    const unsub = addSyncListener((e) => {
      if (e.type === 'import_complete' || e.type === 'sync_complete') {
        fetchProtocols();
        fetchTodayLogs();
        fetchStreakData();
        fetchProtocolStreaks();
        fetchLastSites();
      }
    });
    return unsub;
  }, []);

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

  async function markTaken(protocol) {
    if (actionInProgressRef.current) return;
    actionInProgressRef.current = true;
    try {
      const user = await getCachedUser();
      if (!user) { actionInProgressRef.current = false; return; }

      const logId = insertDoseLog({
        user_id: user.id,
        protocol_id: protocol.id,
        protocol_remote_id: protocol.remote_id || null,
        outcome: 'Taken',
      });

      setTakenCounts(prev => ({ ...prev, [protocol.id]: (prev[protocol.id] || 0) + 1 }));
      fetchStreakData();
      fetchProtocolStreaks();
      Analytics.doseLogged({ name: protocol.name, type: protocol.type, outcome: 'Taken' });
      cancelFollowups(protocol.id).catch(() => {});

      // Update vial doses_taken if this protocol has an active vial
      const vial = vials[protocol.id];
      const prevVialDosesTaken = vial ? (vial.doses_taken || 0) : null;
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
          }
        }
        fetchProtocols();
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
        timer,
      });

      actionInProgressRef.current = false;
    } catch (err) {
      actionInProgressRef.current = false;
      Alert.alert(t('error'), friendlyError(err, t, 'error_save_failed'));
    }
  }

  // Open the body map for the just-logged dose. Cancels the undo timer
  // so the toast stays on screen while the modal is open.
  async function openBodyMapForUndo(undo) {
    if (!undo || !undo.logId) return;
    if (undo.timer) clearTimeout(undo.timer);
    try {
      const user = await getCachedUser();
      if (!user) return;
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
    } catch { /* ignore */ }
  }

  function handleBodyMapClose() {
    setBodyMapVisible(false);
    setBodyMapTarget(null);
    // Toast was kept open while modal was up — clear it now
    setUndoData(null);
  }

  function handleBodyMapSave({ stored }) {
    if (bodyMapTarget?.logId) {
      try {
        updateDoseLog(bodyMapTarget.logId, { injection_site: stored });
        requestSync();
      } catch { /* ignore */ }
    }
    setBodyMapVisible(false);
    setBodyMapTarget(null);
    setUndoData(null);
  }

  async function undoTake() {
    if (!undoData) return;
    try {
      if (undoData.timer) clearTimeout(undoData.timer);
      deleteDoseLog(undoData.logId);
      setTakenCounts(prev => {
        const updated = { ...prev };
        updated[undoData.protocolId] = Math.max((updated[undoData.protocolId] || 1) - 1, 0);
        return updated;
      });
      if (undoData.vialId && undoData.prevDosesTaken !== null) {
        updateVial(undoData.vialId, { doses_taken: undoData.prevDosesTaken, active: 1 });
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

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const todayDate = new Date();
  const dueProtocols = protocols.filter(p => expectedDosesOn(p, todayDate) > 0);
  const doneCount = dueProtocols.filter(p => (takenCounts[p.id] || 0) >= expectedDosesOn(p, todayDate)).length;
  const totalCount = dueProtocols.length;

  // Order the daily list purely by "what's next to take" across all compounds:
  // overdue/now → later today → tomorrow → in 2 days … (see nextDoseAt). A dose
  // already taken today sorts by its NEXT dose, not to the bottom.
  const dailyOrder = [...protocols].sort((a, b) =>
    nextDoseAt(a, takenCounts[a.id] || 0, new Date()) - nextDoseAt(b, takenCounts[b.id] || 0, new Date())
  );

  function formatTimeAMPM(time24) {
    return formatTime(time24, language);
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

  // Rendered as a plain function (not a nested component type) so React
  // doesn't remount the subtree on every parent state change.
  function renderDoseCard(p) {
    const dosesTakenToday = takenCounts[p.id] || 0;
    const dosesNeeded = expectedDosesOn(p, new Date());
    const dueToday = dosesNeeded > 0;
    const isTaken = dueToday && dosesTakenToday >= dosesNeeded;
    const skippedToday = skippedCounts[p.id] || 0;
    const nextDue = dueToday ? null : nextDueDate(p, new Date());
    const vial = vials[p.id];
    const nextTime = getNextTimeLabel(p);
    const progress = getProgress(p);
    const pStreak = protocolStreaks[p.id] || 0;
    const due = isDoseDue(p);
    const lastSite = lastSiteByProtocol[p.id];
    // Fade done/not-due cards so actionable (near-dose) cards stand out. Dark
    // mode uses a gentler fade (0.8 vs 0.6) so the name stays readable — 0.6 on
    // a dark bg greyed the text too much.
    return (
      <View key={p.id} style={[s.doseCard, (isTaken || !dueToday) && { opacity: isDark ? 0.8 : 0.6 }]}>
        {isTaken && (
          <View style={s.takenBanner}>
            <Text style={s.takenBannerText}>{t('today_taken')}</Text>
          </View>
        )}
        {!dueToday && (
          <View style={s.restBanner}>
            <Text style={s.restBannerText}>
              {t('today_not_due')}
              {nextDue ? ` · ${t('today_next_dose').replace('{date}', `${t(MONTH_KEYS[nextDue.getMonth()])} ${nextDue.getDate()}`)}` : ''}
            </Text>
          </View>
        )}
        {dueToday && !isTaken && skippedToday > 0 && (
          <View style={s.skippedBanner}>
            <Text style={s.skippedBannerText}>{t('today_skipped_today')}</Text>
          </View>
        )}
        {dueToday && !isTaken && dosesTakenToday > 0 && dosesNeeded > 1 && (
          <View style={s.partialBanner}>
            <Text style={s.partialBannerText}>{dosesTakenToday}/{dosesNeeded} {t('today_taken_partial')}</Text>
          </View>
        )}
        <View style={s.doseCardTop}>
          <View style={[s.doseDot, { backgroundColor: p.color || colors.accent }]} />
          <View style={s.doseInfo}>
            <Text style={s.doseName}>{due && '🔥 '}{p.compound_id ? t(p.compound_id) : p.name}</Text>
            <Text style={s.doseMeta}>
              {p.dose} {p.dose_unit} · {p.frequency}
            </Text>
            {/* Progress indicator */}
            {progress && (
              <Text style={s.progressText}>
                {t('today_day_of').replace('{current}', progress.current).replace('{total}', progress.total)}
              </Text>
            )}
          </View>
          <View style={s.doseRight}>
            {p.reminder_time ? (
              <View style={s.doseTime}>
                <Text style={s.doseTimeVal}>{p.reminder_time.split(',').filter(Boolean).map(t24 => formatTimeAMPM(t24)).join(' · ')}</Text>
                <Text style={s.doseTimeLbl}>{t('today_reminder')}</Text>
              </View>
            ) : null}
            {pStreak > 0 && (
              <View style={s.miniStreak}>
                <Text style={s.miniStreakText}>🔥 {pStreak}</Text>
              </View>
            )}
          </View>
        </View>
        {/* Progress bar */}
        {progress && (
          <View style={s.progressBarOuter}>
            <View style={[s.progressBarInner, { width: `${Math.min((progress.current / progress.total) * 100, 100)}%` }]} />
          </View>
        )}
        {/* Last-site recall chip — recall only, never a recommendation */}
        {lastSite && (
          <View style={s.lastSiteChip}>
            <Text style={s.lastSiteText}>
              {t('today_last_site')
                .replace('{site}', lastSite.summary)
                .replace('{days}', String(lastSite.daysAgo))}
            </Text>
          </View>
        )}
        {/* Vial status line for recon protocols */}
        {p.type === 'recon' && vial && (() => {
          // Capacity: stored count if known, else derived from vial size ÷ dose
          // (older vials predate the derivation and have a null total_doses).
          const capacity = (vial.total_doses && vial.total_doses > 0)
            ? vial.total_doses
            : dosesPerVial({ amount: p.amount, unit: p.unit, dose: p.dose, doseUnit: p.dose_unit });
          const remaining = capacity ? Math.max(0, capacity - (vial.doses_taken || 0)) : null;
          const daysLeft = daysUntilExpiry(vial.mixed_on, p.vial_valid_days || DEFAULT_VALID_DAYS, new Date());
          return (
            <View style={s.vialStatus}>
              <Text style={s.vialStatusText}>
                {t('today_vial_mixed')} {formatVialDate(vial.mixed_on)}
                {remaining != null ? ` · ${remaining} ${t('today_vial_remaining')}` : ''}
                {daysLeft != null ? '  ·  ' : ''}
                {daysLeft != null && (
                  <Text style={{ color: expiryColor(daysLeft), fontWeight: '600' }}>
                    {daysLeft <= 0
                      ? t('protocols_vial_past')
                      : t('protocols_vial_days_left').replace('{n}', String(daysLeft))}
                  </Text>
                )}
              </Text>
            </View>
          );
        })()}
        {p.type === 'recon' && !vial && (
          <TouchableOpacity
            style={s.vialStatus}
            onPress={() => {
              setContinuationProtocol(p);
              setNewVialDoses('');
              setNewVialMonth(new Date().getMonth());
              setNewVialDay(String(new Date().getDate()));
              setShowVialPrompt(true);
            }}
          >
            <Text style={[s.vialStatusText, { color: colors.accent }]}>{t('today_add_vial')}</Text>
          </TouchableOpacity>
        )}
        {dueToday && !isTaken && (
          <View style={s.doseActions}>
            <TouchableOpacity style={s.doseBtn} onPress={() => skipDose(p)}>
              <Text style={s.doseBtnText}>{t('today_skip')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.doseBtn, s.doseBtnPrimary]}
              onPress={() => markTaken(p)}
            >
              <Text style={s.doseBtnPrimaryText}>
                {nextTime
                  ? t('today_take_time').replace('{time}', nextTime)
                  : t('today_mark_taken')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  function renderCategory(label, items) {
    if (items.length === 0) return null;
    return (
      <View style={s.categorySection}>
        <Text style={s.categoryLabel}>{label}</Text>
        {items.map(p => renderDoseCard(p))}
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.date}>{today}</Text>
          <Text style={s.greeting}>{greeting}{userName ? `, ${userName}` : ''} 👋</Text>
          <Text style={s.sub}>
            {totalCount === 0
              ? t('today_no_protocols')
              : `${doneCount} / ${totalCount} ${t('today_done_of')}`}
          </Text>
        </View>

        <View style={s.statsRow}>
          <View style={[s.statCard, s.statHighlight]}>
            <Text style={s.statValBlue}>{doneCount}</Text>
            <Text style={s.statLblBlue}>{t('today_done')}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statVal}>{totalCount}</Text>
            <Text style={s.statLbl}>{t('today_protocols')}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statVal}>
              {totalCount > 0 ? Math.round((doneCount / totalCount) * 100) + '%' : '—'}
            </Text>
            <Text style={s.statLbl}>{t('today_done_of')}</Text>
          </View>
        </View>

        {protocols.length > 0 && weekDots.length > 0 && (
          <View style={s.streakCard}>
            <View style={s.streakTop}>
              <View style={s.streakLeft}>
                <Text style={s.streakFire}>{streak > 0 ? '🔥' : '💤'}</Text>
                <View>
                  <Text style={s.streakCount}>
                    {streak > 0
                      ? `${streak} ${streak === 1 ? t('today_streak_day') : t('today_streak_days')}`
                      : t('today_streak_none')}
                  </Text>
                  <Text style={s.streakSub}>
                    {monthConsistency}% {t('today_streak_monthly')}
                  </Text>
                </View>
              </View>
              {streak >= 7 && (
                <View style={s.streakBadge}>
                  <Text style={s.streakBadgeText}>{t('today_streak_fire')}</Text>
                </View>
              )}
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
                  ]} />
                  <Text style={[s.streakDotLabel, dot.isToday && s.streakDotLabelToday]}>
                    {t(WEEKDAY_KEYS[dot.dayIndex])}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {protocols.length > 0 && weekDots.length > 0 && (
          <TouchableOpacity
            style={s.shareToggle}
            onPress={() => setShowShareCard(!showShareCard)}
          >
            <Text style={s.shareToggleText}>
              {showShareCard ? t('today_share_hide') : t('today_share_show')}
            </Text>
          </TouchableOpacity>
        )}

        {showShareCard && protocols.length > 0 && (
          <View style={s.shareCard}>
            <View style={s.shareCardInner}>
              <Text style={s.shareEmoji}>{streak >= 7 ? '🔥' : streak > 0 ? '💪' : '🎯'}</Text>
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

        {protocols.length === 0 && !loading && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>💉</Text>
            <Text style={s.emptyTitle}>{t('today_empty_title')}</Text>
            <Text style={s.emptySub}>{t('today_empty_sub')}</Text>
            <View style={s.tipBox}>
              <Text style={s.tipTitle}>{t('today_tip_title')}</Text>
              {[
                t('today_tip_1'),
                t('today_tip_2'),
                t('today_tip_3'),
              ].map((tip, i) => (
                <View key={i} style={s.tipRow}>
                  <View style={s.tipNum}>
                    <Text style={s.tipNumText}>{i + 1}</Text>
                  </View>
                  <Text style={s.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {protocols.length > 0 && (
          <View style={s.section}>
            {dailyOrder.map(p => renderDoseCard(p))}
          </View>
        )}

        {/* Undo toast */}
        {undoData && (
          <View style={s.undoBar}>
            <Text style={s.undoBarText}>{t('today_dose_logged')}</Text>
            <View style={s.undoBarActions}>
              <TouchableOpacity onPress={() => openBodyMapForUndo(undoData)}>
                <Text style={s.undoBarAction}>{t('today_undo_add_site')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={undoTake}>
                <Text style={s.undoBarAction}>{t('today_undo')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Compliance disclaimer */}
        {protocols.length > 0 && (
          <Text style={s.disclaimer}>{t('today_disclaimer')}</Text>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Body map modal — opens from undo toast "Add site" */}
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
                onPress={() => { setShowVialPrompt(false); setContinuationProtocol(null); }}
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
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20, backgroundColor: c.card },
  date: { fontSize: 11, color: c.textFaint, marginBottom: 2 },
  greeting: { fontSize: 28, fontWeight: '700', color: c.text, marginBottom: 4 },
  sub: { fontSize: 13, color: c.textMuted },
  streakCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: c.card, borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: c.border },
  streakTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  streakLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  streakFire: { fontSize: 28 },
  streakCount: { fontSize: 16, fontWeight: '700', color: c.text },
  streakSub: { fontSize: 11, color: c.textMuted, marginTop: 1 },
  streakBadge: { backgroundColor: c.warningSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  streakBadgeText: { fontSize: 11, fontWeight: '600', color: c.warningSoftText },
  streakDots: { flexDirection: 'row', justifyContent: 'space-between' },
  streakDotCol: { alignItems: 'center', gap: 4 },
  streakDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.card2 },
  streakDotComplete: { backgroundColor: c.success },
  streakDotPartial: { backgroundColor: c.warning },
  streakDotMissed: { backgroundColor: c.card2 },
  streakDotRest: { backgroundColor: c.accentSoft },
  streakDotToday: { borderWidth: 2, borderColor: c.accent },
  streakDotLabel: { fontSize: 9, color: c.textFaint, fontWeight: '500' },
  streakDotLabelToday: { color: c.accent, fontWeight: '700' },
  shareToggle: { alignSelf: 'center', marginBottom: 12, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: c.accentSoft, borderRadius: 20 },
  shareToggleText: { fontSize: 12, color: c.accent, fontWeight: '600' },
  shareCard: { marginHorizontal: 16, marginBottom: 16 },
  shareCardInner: { backgroundColor: '#0F172A', borderRadius: 20, padding: 24, alignItems: 'center' },
  shareEmoji: { fontSize: 40, marginBottom: 8 },
  shareTitle: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 4 },
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
  shareBrandText: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  shareBrandSub: { fontSize: 10, color: '#64748B', marginTop: 2 },
  shareDisclaimer: { fontSize: 8, color: '#475569', textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, padding: 16 },
  statCard: { flex: 1, backgroundColor: c.card, borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: c.border },
  statHighlight: { backgroundColor: c.accentSoft },
  statVal: { fontSize: 20, fontWeight: '600', color: c.text },
  statValBlue: { fontSize: 20, fontWeight: '600', color: c.accentSoftText },
  statLbl: { fontSize: 10, color: c.textMuted, marginTop: 2 },
  statLblBlue: { fontSize: 10, color: c.accent, marginTop: 2 },
  section: { paddingHorizontal: 16 },
  categorySection: { marginBottom: 8 },
  categoryLabel: { fontSize: 11, fontWeight: '600', color: c.textFaint, letterSpacing: 0.5, marginBottom: 8, marginTop: 8 },
  doseCard: { backgroundColor: c.card, borderRadius: 14, marginBottom: 8, overflow: 'hidden', borderWidth: 0.5, borderColor: c.border },
  takenBanner: { backgroundColor: c.successSoft, paddingVertical: 6, paddingHorizontal: 14 },
  takenBannerText: { fontSize: 12, color: c.successSoftText, fontWeight: '600' },
  partialBanner: { backgroundColor: c.warningSoft, paddingVertical: 6, paddingHorizontal: 14 },
  partialBannerText: { fontSize: 12, color: c.warningSoftText, fontWeight: '600' },
  restBanner: { backgroundColor: c.accentSoft, paddingVertical: 6, paddingHorizontal: 14 },
  restBannerText: { fontSize: 12, color: c.accent, fontWeight: '500' },
  skippedBanner: { backgroundColor: c.warningSoft, paddingVertical: 6, paddingHorizontal: 14 },
  skippedBannerText: { fontSize: 12, color: c.warningSoftText, fontWeight: '500' },
  doseCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  doseDot: { width: 10, height: 10, borderRadius: 5 },
  doseInfo: { flex: 1 },
  doseName: { fontSize: 14, fontWeight: '600', color: c.text },
  doseMeta: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  doseRight: { alignItems: 'flex-end', gap: 4 },
  doseTime: { alignItems: 'flex-end' },
  doseTimeVal: { fontSize: 12, fontWeight: '500', color: c.textMuted },
  doseTimeLbl: { fontSize: 10, color: c.textFaint },
  progressText: { fontSize: 10, color: c.accent, marginTop: 2, fontWeight: '500' },
  progressBarOuter: { height: 3, backgroundColor: c.card2, marginHorizontal: 14, marginBottom: 8, borderRadius: 2 },
  progressBarInner: { height: 3, backgroundColor: c.accent, borderRadius: 2 },
  miniStreak: { backgroundColor: c.warningSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  miniStreakText: { fontSize: 10, color: c.warningSoftText, fontWeight: '600' },
  vialStatus: { paddingHorizontal: 14, paddingBottom: 10 },
  vialStatusText: { fontSize: 11, color: c.textMuted },
  lastSiteChip: { marginHorizontal: 14, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: c.accentSoft, borderRadius: 8, alignSelf: 'flex-start' },
  lastSiteText: { fontSize: 11, color: c.accentSoftText, fontWeight: '500' },
  doseActions: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: c.border },
  doseBtn: { flex: 1, padding: 10, alignItems: 'center', borderRightWidth: 0.5, borderRightColor: c.border },
  doseBtnText: { fontSize: 12, color: c.textMuted },
  doseBtnPrimary: { backgroundColor: c.accentSoft, borderRightWidth: 0 },
  doseBtnPrimaryText: { fontSize: 12, color: c.accent, fontWeight: '600' },
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
  undoBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginTop: 12, backgroundColor: c.toast, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  undoBarText: { fontSize: 13, color: c.toastText, fontWeight: '500' },
  undoBarActions: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  undoBarAction: { fontSize: 13, color: '#5CB8FF', fontWeight: '700' },
  // Yesterday / Today shortcut pills
  yesterdayRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  yesterdayPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: c.accentSoft, borderWidth: 0.5, borderColor: c.border },
  yesterdayPillText: { fontSize: 11, color: c.accent, fontWeight: '600' },
});
