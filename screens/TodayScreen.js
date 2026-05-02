import { useState, useCallback } from 'react';
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
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { Analytics } from '../lib/analytics';
import { syncVialAlerts, scheduleDoseReminder, cancelFollowups } from '../lib/notifications';
import {
  getActiveProtocols, getActiveVials, getTodayLogs, getTakenLogsSince, getLogsSince,
  insertDoseLog, deleteDoseLog, updateDoseLog, updateVial, insertVial, updateProtocol,
  getProtocolById, hardDeleteOldProtocols,
} from '../lib/database';
import { requestSync } from '../lib/sync';
import BodyMapModal from './components/BodyMapModal';
import { summarizeStored } from '../lib/injectionSites';

const WEEKDAY_KEYS = ['today_sun','today_mon','today_tue','today_wed','today_thu','today_fri','today_sat'];

const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr',
  'month_may', 'month_jun', 'month_jul', 'month_aug',
  'month_sep', 'month_oct', 'month_nov', 'month_dec',
];

export default function TodayScreen() {
  const { t } = useLanguage();
  const [protocols, setProtocols] = useState([]);
  const [vials, setVials] = useState({}); // keyed by protocol_id
  const [takenCounts, setTakenCounts] = useState({}); // { protocol_id: count }
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
  const [userName, setUserName] = useState('');
  const [streak, setStreak] = useState(0);
  const [monthConsistency, setMonthAdherence] = useState(0);
  const [weekDots, setWeekDots] = useState([]);
  const [showShareCard, setShowShareCard] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [undoData, setUndoData] = useState(null); // { logId, protocolId, vialId, prevDosesTaken, timer }
  const [protocolStreaks, setProtocolStreaks] = useState({}); // { protocol_id: number }

  // Vial continuation state
  const [showVialPrompt, setShowVialPrompt] = useState(false);
  const [continuationProtocol, setContinuationProtocol] = useState(null);
  const [newVialDoses, setNewVialDoses] = useState('');
  const currentYear = new Date().getFullYear();
  const [newVialMonth, setNewVialMonth] = useState(new Date().getMonth());
  const [newVialDay, setNewVialDay] = useState(String(new Date().getDate()));

  // Body map (injection site picker) state
  const [bodyMapVisible, setBodyMapVisible] = useState(false);
  const [bodyMapTarget, setBodyMapTarget] = useState(null); // { logId, protocolId, recentLogs, initialStored }

  // Last-site recall chip per protocol — pure recall, NOT a recommendation.
  // Shape: { [protocolId]: { summary: 'Abdomen', daysAgo: 3 } }
  const [lastSiteByProtocol, setLastSiteByProtocol] = useState({});

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
    }, [])
  );

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
      if (!logs) return;
      // Group by protocol_id → set of day strings
      const byProtocol = {};
      logs.forEach(l => {
        if (!byProtocol[l.protocol_id]) byProtocol[l.protocol_id] = new Set();
        byProtocol[l.protocol_id].add(new Date(l.logged_at).toDateString());
      });
      const streaks = {};
      Object.keys(byProtocol).forEach(pid => {
        const days = byProtocol[pid];
        let count = 0;
        const now = new Date();
        // Check today first
        if (days.has(now.toDateString())) count++;
        for (let i = 1; i <= 30; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          if (days.has(d.toDateString())) count++;
          else break;
        }
        streaks[pid] = count;
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
      const counts = {};
      data.forEach(d => { counts[d.protocol_id] = (counts[d.protocol_id] || 0) + 1; });
      setTakenCounts(counts);
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

    const protocolMap = {};
    activeProtocols.forEach(p => { protocolMap[p.id] = p; });
    const protocolIds = new Set(activeProtocols.map(p => p.id));
    const totalActive = protocolIds.size;

    function isDayComplete(dateStr) {
      const dayData = takenByDay[dateStr];
      if (!dayData) return false;
      let complete = 0;
      protocolIds.forEach(id => {
        const needed = protocolMap[id]?.doses_per_day || 1;
        if ((dayData[id] || 0) >= needed) complete++;
      });
      return complete >= totalActive;
    }

    function isDayPartial(dateStr) {
      const dayData = takenByDay[dateStr];
      if (!dayData) return false;
      let anyTaken = false;
      protocolIds.forEach(id => { if (dayData[id]) anyTaken = true; });
      return anyTaken && !isDayComplete(dateStr);
    }

    let streakCount = 0;
    const todayStr = now.toDateString();
    if (isDayComplete(todayStr)) streakCount++;
    for (let i = 1; i <= 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      if (isDayComplete(d.toDateString())) streakCount++;
      else break;
    }
    setStreak(streakCount);

    let completeDays = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      if (isDayComplete(d.toDateString())) completeDays++;
    }
    setMonthAdherence(Math.round((completeDays / 30) * 100));

    const dots = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      dots.push({
        dayIndex: d.getDay(),
        isToday: i === 0,
        status: isDayComplete(dateStr) ? 'complete' : isDayPartial(dateStr) ? 'partial' : 'missed',
      });
    }
    setWeekDots(dots);
  }

  async function markTaken(protocol) {
    if (actionInProgress) return;
    setActionInProgress(true);
    try {
      const user = await getCachedUser();
      if (!user) { setActionInProgress(false); return; }

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
        if (vial.total_doses && newTaken >= vial.total_doses) {
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

      // Setup undo (5 second window)
      if (undoData?.timer) clearTimeout(undoData.timer);
      const timer = setTimeout(() => setUndoData(null), 5000);
      setUndoData({
        logId,
        protocolId: protocol.id,
        vialId: vial?.id || null,
        prevDosesTaken: prevVialDosesTaken,
        timer,
      });

      setActionInProgress(false);
    } catch (err) {
      setActionInProgress(false);
      Alert.alert(t('error'), err.message);
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
              setTakenCounts(prev => ({ ...prev, [protocol.id]: (prev[protocol.id] || 0) + 1 }));
              Analytics.doseLogged({ name: protocol.name, type: protocol.type, outcome: 'Skipped' });
              requestSync();
            } catch (err) {
              Alert.alert(t('error'), err.message);
            }
          },
        },
      ]
    );
  }

  async function createNewVial() {
    if (!continuationProtocol || !newVialDoses) return;
    try {
      const user = await getCachedUser();
      if (!user) return;
      const m = String(newVialMonth + 1).padStart(2, '0');
      const d = String(parseInt(newVialDay) || 1).padStart(2, '0');
      const mixDate = `${currentYear}-${m}-${d}`;
      const totalDoses = parseInt(newVialDoses) || 0;
      if (totalDoses <= 0) return;

      insertVial({
        user_id: user.id,
        protocol_id: continuationProtocol.id,
        protocol_remote_id: continuationProtocol.remote_id || null,
        mixed_on: mixDate,
        water_ml: continuationProtocol.water ? parseFloat(continuationProtocol.water) : null,
        total_doses: totalDoses,
        doses_taken: 0,
      });

      updateProtocol(continuationProtocol.id, { schedule_total: totalDoses, start_date: mixDate });

      const updatedProtocol = getProtocolById(continuationProtocol.id);
      if (updatedProtocol) scheduleDoseReminder(updatedProtocol).catch(() => {});

      setShowVialPrompt(false);
      setContinuationProtocol(null);
      fetchProtocols();
      syncVialAlerts().catch(() => {});
      requestSync();
    } catch (err) {
      Alert.alert(t('error'), err.message);
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

  const doneCount = protocols.filter(p => (takenCounts[p.id] || 0) >= (p.doses_per_day || 1)).length;
  const totalCount = protocols.length;

  const reconProtocols = protocols.filter(p => p.type === 'recon');
  const rtuProtocols = protocols.filter(p => p.type === 'rtu');
  const oralProtocols = protocols.filter(p => p.type === 'oral');

  function formatTimeAMPM(time24) {
    if (!time24) return '—';
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  // Determine next time slot label for multi-dose protocols
  function getNextTimeLabel(p) {
    if (!p.reminder_time || (p.doses_per_day || 1) <= 1) return null;
    const times = p.reminder_time.split(',').filter(Boolean);
    const dosesTakenToday = takenCounts[p.id] || 0;
    if (dosesTakenToday < times.length) {
      return formatTimeAMPM(times[dosesTakenToday]);
    }
    return null;
  }

  // Check if the next dose is due (≤5 min away or overdue)
  function isDoseDue(p) {
    if (!p.reminder_time) return false;
    const dosesTakenToday = takenCounts[p.id] || 0;
    const dosesNeeded = p.doses_per_day || 1;
    if (dosesTakenToday >= dosesNeeded) return false;
    const times = p.reminder_time.split(',').filter(Boolean);
    const nextTimeStr = times[dosesTakenToday] || times[0];
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

  function DoseCard({ p }) {
    const dosesTakenToday = takenCounts[p.id] || 0;
    const dosesNeeded = p.doses_per_day || 1;
    const isTaken = dosesTakenToday >= dosesNeeded;
    const vial = vials[p.id];
    const nextTime = getNextTimeLabel(p);
    const progress = getProgress(p);
    const pStreak = protocolStreaks[p.id] || 0;
    const due = isDoseDue(p);
    const lastSite = lastSiteByProtocol[p.id];
    return (
      <View style={[s.doseCard, isTaken && s.doseCardDone]}>
        {isTaken && (
          <View style={s.takenBanner}>
            <Text style={s.takenBannerText}>{t('today_taken')}</Text>
          </View>
        )}
        {!isTaken && dosesTakenToday > 0 && dosesNeeded > 1 && (
          <View style={s.partialBanner}>
            <Text style={s.partialBannerText}>{dosesTakenToday}/{dosesNeeded} {t('today_taken_partial')}</Text>
          </View>
        )}
        <View style={s.doseCardTop}>
          <View style={[s.doseDot, { backgroundColor: p.color || '#185FA5' }]} />
          <View style={s.doseInfo}>
            <Text style={s.doseName}>{due && '🔥 '}{p.name}</Text>
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
        {p.type === 'recon' && vial && (
          <View style={s.vialStatus}>
            <Text style={s.vialStatusText}>
              {t('today_vial_mixed')} {formatVialDate(vial.mixed_on)} · {(vial.total_doses || 0) - (vial.doses_taken || 0)} {t('today_vial_remaining')}
            </Text>
          </View>
        )}
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
            <Text style={[s.vialStatusText, { color: '#185FA5' }]}>{t('today_add_vial')}</Text>
          </TouchableOpacity>
        )}
        {!isTaken && (
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

  function CategorySection({ label, items }) {
    if (items.length === 0) return null;
    return (
      <View style={s.categorySection}>
        <Text style={s.categoryLabel}>{label}</Text>
        {items.map(p => <DoseCard key={p.id} p={p} />)}
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
            <CategorySection label={t('today_category_lyophilized')} items={reconProtocols} />
            <CategorySection label={t('today_category_rtu')} items={rtuProtocols} />
            <CategorySection label={t('today_category_oral')} items={oralProtocols} />
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
              placeholder="DD"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
              maxLength={2}
              value={newVialDay}
              onChangeText={(val) => {
                const num = parseInt(val);
                if (val === '' || (num >= 1 && num <= 31)) setNewVialDay(val);
              }}
            />

            <Text style={[s.promptLabel, { marginTop: 12 }]}>{t('today_vial_how_many')}</Text>
            <TextInput
              style={s.promptDosesInput}
              placeholder={t('today_vial_doses_placeholder')}
              placeholderTextColor="#aaa"
              keyboardType="numeric"
              value={newVialDoses}
              onChangeText={setNewVialDoses}
            />

            <View style={s.promptActions}>
              <TouchableOpacity
                style={s.promptBtnSecondary}
                onPress={() => { setShowVialPrompt(false); setContinuationProtocol(null); }}
              >
                <Text style={s.promptBtnSecondaryText}>{t('today_vial_not_now')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.promptBtnPrimary, (!newVialDoses || parseInt(newVialDoses) <= 0) && { opacity: 0.4 }]}
                onPress={createNewVial}
                disabled={!newVialDoses || parseInt(newVialDoses) <= 0}
              >
                <Text style={s.promptBtnPrimaryText}>{t('today_vial_add')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  header: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 },
  date: { fontSize: 11, color: '#aaa', marginBottom: 2 },
  greeting: { fontSize: 28, fontWeight: '700', color: '#111', marginBottom: 4 },
  sub: { fontSize: 13, color: '#888' },
  streakCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: '#eee' },
  streakTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  streakLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  streakFire: { fontSize: 28 },
  streakCount: { fontSize: 16, fontWeight: '700', color: '#111' },
  streakSub: { fontSize: 11, color: '#888', marginTop: 1 },
  streakBadge: { backgroundColor: '#FEF3E2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  streakBadgeText: { fontSize: 11, fontWeight: '600', color: '#92400E' },
  streakDots: { flexDirection: 'row', justifyContent: 'space-between' },
  streakDotCol: { alignItems: 'center', gap: 4 },
  streakDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f0f0f0' },
  streakDotComplete: { backgroundColor: '#1D9E75' },
  streakDotPartial: { backgroundColor: '#F5C563' },
  streakDotMissed: { backgroundColor: '#f0f0f0' },
  streakDotToday: { borderWidth: 2, borderColor: '#185FA5' },
  streakDotLabel: { fontSize: 9, color: '#aaa', fontWeight: '500' },
  streakDotLabelToday: { color: '#185FA5', fontWeight: '700' },
  shareToggle: { alignSelf: 'center', marginBottom: 12, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#f0f6ff', borderRadius: 20 },
  shareToggleText: { fontSize: 12, color: '#185FA5', fontWeight: '600' },
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
  shareDotLabel: { fontSize: 9, color: '#64748B', fontWeight: '500' },
  shareBrand: { alignItems: 'center', marginBottom: 8 },
  shareBrandText: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  shareBrandSub: { fontSize: 10, color: '#64748B', marginTop: 2 },
  shareDisclaimer: { fontSize: 8, color: '#475569', textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, padding: 16 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: '#eee' },
  statHighlight: { backgroundColor: '#E6F1FB' },
  statVal: { fontSize: 20, fontWeight: '600', color: '#111' },
  statValBlue: { fontSize: 20, fontWeight: '600', color: '#0C447C' },
  statLbl: { fontSize: 10, color: '#888', marginTop: 2 },
  statLblBlue: { fontSize: 10, color: '#185FA5', marginTop: 2 },
  section: { paddingHorizontal: 16 },
  categorySection: { marginBottom: 8 },
  categoryLabel: { fontSize: 11, fontWeight: '600', color: '#aaa', letterSpacing: 0.5, marginBottom: 8, marginTop: 8 },
  doseCard: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 8, overflow: 'hidden', borderWidth: 0.5, borderColor: '#eee' },
  doseCardDone: { opacity: 0.6 },
  takenBanner: { backgroundColor: '#E1F5EE', paddingVertical: 6, paddingHorizontal: 14 },
  takenBannerText: { fontSize: 12, color: '#085041', fontWeight: '600' },
  partialBanner: { backgroundColor: '#FEF3E2', paddingVertical: 6, paddingHorizontal: 14 },
  partialBannerText: { fontSize: 12, color: '#92400E', fontWeight: '600' },
  doseCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  doseDot: { width: 10, height: 10, borderRadius: 5 },
  doseInfo: { flex: 1 },
  doseName: { fontSize: 14, fontWeight: '600', color: '#111' },
  doseMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  doseRight: { alignItems: 'flex-end', gap: 4 },
  doseTime: { alignItems: 'flex-end' },
  doseTimeVal: { fontSize: 12, fontWeight: '500', color: '#888' },
  doseTimeLbl: { fontSize: 10, color: '#aaa' },
  progressText: { fontSize: 10, color: '#185FA5', marginTop: 2, fontWeight: '500' },
  progressBarOuter: { height: 3, backgroundColor: '#f0f0f0', marginHorizontal: 14, marginBottom: 8, borderRadius: 2 },
  progressBarInner: { height: 3, backgroundColor: '#185FA5', borderRadius: 2 },
  miniStreak: { backgroundColor: '#FEF3E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  miniStreakText: { fontSize: 10, color: '#92400E', fontWeight: '600' },
  vialStatus: { paddingHorizontal: 14, paddingBottom: 10 },
  vialStatusText: { fontSize: 11, color: '#666' },
  lastSiteChip: { marginHorizontal: 14, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#E6F1FB', borderRadius: 8, alignSelf: 'flex-start' },
  lastSiteText: { fontSize: 11, color: '#0C447C', fontWeight: '500' },
  doseActions: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#f0f0f0' },
  doseBtn: { flex: 1, padding: 10, alignItems: 'center', borderRightWidth: 0.5, borderRightColor: '#f0f0f0' },
  doseBtnText: { fontSize: 12, color: '#888' },
  doseBtnPrimary: { backgroundColor: '#f0f6ff', borderRightWidth: 0 },
  doseBtnPrimaryText: { fontSize: 12, color: '#185FA5', fontWeight: '600' },
  disclaimer: { fontSize: 10, color: '#bbb', textAlign: 'center', marginTop: 16, marginHorizontal: 32, lineHeight: 15 },
  emptyState: { padding: 20, alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 8 },
  emptySub: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  tipBox: { backgroundColor: '#f9f9f9', borderRadius: 12, padding: 14, width: '100%', borderWidth: 0.5, borderColor: '#eee' },
  tipTitle: { fontSize: 11, fontWeight: '600', color: '#aaa', letterSpacing: 0.5, marginBottom: 10 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  tipNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#185FA5', alignItems: 'center', justifyContent: 'center' },
  tipNumText: { fontSize: 10, color: 'white', fontWeight: '600' },
  tipText: { fontSize: 12, color: '#666', flex: 1, lineHeight: 18 },
  // Vial continuation modal
  promptOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  promptCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360 },
  promptTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 4 },
  promptProtocolName: { fontSize: 14, fontWeight: '600', color: '#185FA5', marginBottom: 6 },
  promptSub: { fontSize: 13, color: '#888', marginBottom: 20, lineHeight: 19 },
  promptLabel: { fontSize: 11, color: '#888', marginBottom: 6 },
  promptMonthScroll: { marginBottom: 8 },
  promptMonthRow: { flexDirection: 'row', gap: 6 },
  promptMonthPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#f0f0f0', borderWidth: 0.5, borderColor: '#ddd' },
  promptMonthPillOn: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  promptMonthText: { fontSize: 11, color: '#666', fontWeight: '500' },
  promptMonthTextOn: { color: '#fff', fontWeight: '600' },
  promptDayInput: { borderWidth: 0.5, borderColor: '#ddd', borderRadius: 10, padding: 10, fontSize: 14, color: '#111', backgroundColor: '#f9f9f9', width: 70, textAlign: 'center' },
  promptDosesInput: { borderWidth: 0.5, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 14, color: '#111', backgroundColor: '#f9f9f9' },
  promptActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  promptBtnSecondary: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 0.5, borderColor: '#ddd', alignItems: 'center' },
  promptBtnSecondaryText: { fontSize: 14, color: '#888' },
  promptBtnPrimary: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#185FA5', alignItems: 'center' },
  promptBtnPrimaryText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  // Undo bar
  undoBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginTop: 12, backgroundColor: '#1a1a1a', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  undoBarText: { fontSize: 13, color: '#fff', fontWeight: '500' },
  undoBarActions: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  undoBarAction: { fontSize: 13, color: '#5CB8FF', fontWeight: '700' },
  // Yesterday / Today shortcut pills
  yesterdayRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  yesterdayPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#f0f6ff', borderWidth: 0.5, borderColor: '#cde0f5' },
  yesterdayPillText: { fontSize: 11, color: '#185FA5', fontWeight: '600' },
});
