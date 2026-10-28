import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Modal from '../components/PresenceModal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { protocolDisplayName } from '../lib/protocolName';
import { getAllLogs, getLogsSince, getTodayLogs, updateDoseLog, deleteDoseLog, updateVial, updateProtocol, getProtocolById, getVialsForProtocol } from '../lib/database';
import { scanMissedDoses, recordDoseTaken, unsyncedState } from '../lib/doseActions';
import { requestSync, forceSync, addSyncListener } from '../lib/sync';
import { pluralKey } from '../lib/plural';
import { summarizeStored, describeStored } from '../lib/injectionSites';
import { planDeleteDose, rememberDeleted, doseDayKind } from '../lib/deleteDose';
import { syncAllNotifications, cancelTodaysDoseReminders } from '../lib/notifications';
import { handledSlotIndexes } from '../lib/notificationPlan';
import { friendlyError } from '../lib/friendlyError';
import { formatTime } from '../lib/timeFormat';
import { formatDate } from '../lib/localeFormat';
import { hasPremium } from '../lib/entitlement';
import { Analytics } from '../lib/analytics';
import BodyMapModal from './components/BodyMapModal';
import { needsSiteQuestion } from '../lib/siteQuestion';
import { planSitePickerAction } from '../lib/sitePickerActions';
import { useTheme } from '../lib/theme';
import FeatureIcon from '../components/FeatureIcon';
import SegmentedBar from '../components/SegmentedBar';
import FeatureExplainerGate from '../components/FeatureExplainerGate';
import RowChevron from '../components/RowChevron';
import DoseEditSheet from './components/DoseEditSheet';
import { canEditTime, canEditDose, unitForDoseEdit, vialAfterOneDoseEdit, timeEditFields } from '../lib/doseEdit';
import { formatNumber } from '../lib/localeFormat';
import { DTSheet } from './components/ProtocolParts';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { useUnfoldToPage } from '../components/BookPanes';
import { outcomeCounts } from '../lib/declared';
import { logListState } from '../lib/firstLoad';

const WEEKDAY_KEYS = ['today_sun', 'today_mon', 'today_tue', 'today_wed', 'today_thu', 'today_fri', 'today_sat'];
const INJECTABLE = ['recon', 'rtu'];

// embedded (S-26 BK-3): the Dose log drawn on Today's right page of an unfolded foldable.
// No back row (nothing to go back to) and no top safe-area edge (Today's safe area holds
// it); everything else is the same screen. refreshKey: Today's dose counts, so a dose
// taken or skipped on the left page shows here at once.
// onChanged (embedded, BK-19): this page changed a row (Missed → Taken / Skipped, a site), so
// Today's cards, rings and Pending block refresh without switching tabs.
// popupGate (embedded, BK-20): one popup at a time across both pages — the site editor waits
// while a popup of Today's is open, and tells Today when it opens and closes.
// Free-feature explainers this screen offers (Today redesign part 18): the dose log + streak
// and site rotation, each until used — read from the user's own synced dose log. (Dose notes:
// the per-dose note is not in the app yet, so its explainer is not offered.)
function logExplainers(userId) {
  const logs = getAllLogs(userId) || [];
  return [
    { key: 'log', used: logs.some((l) => l.outcome === 'Taken') },
    { key: 'sites', used: logs.some((l) => !!l.injection_site) },
  ];
}

export default function LogScreen({ embedded = false, refreshKey, onChanged, popupGate } = {}) {
  const { t, language, timeFormat } = useLanguage();
  // A-134: a dose row names its protocol as Today does (translated compound, else the typed name).
  const logName = (log) => (log && log.protocols ? protocolDisplayName(log.protocols, t) : t('log_protocol_deleted'));
  const { colors } = useTheme();
  const navigation = useNavigation();
  const s = useMemo(() => makeStyles(colors), [colors]);
  // Times and dates in the app language and the user's 12/24 h choice (lib/timeFormat,
  // lib/localeFormat): "7:20 PM" / "19:20", "Sep 3" / "3 de set.".
  const timeOf = (iso) => { const d = new Date(iso); return formatTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, language, timeFormat); };
  const [logs, setLogs] = useState([]);
  // A-120: until the first load has finished the list is 'loading' (the app's spinner) — never
  // "No doses yet" or 0 / 0 / 0 before the rows are read.
  const [loaded, setLoaded] = useState(false);
  const listState = logListState({ loaded, rows: logs });
  const [filter, setFilter] = useState('All');

  // Body-map editor state (tap a row to edit its injection site)
  const [bodyMapVisible, setBodyMapVisible] = useState(false);
  const [bodyMapTarget, setBodyMapTarget] = useState(null);

  // The dose sheet (founder 2026-10-02, option A): a tapped Taken / Skipped row. deleteAsk:
  // the "Delete this dose?" confirm (DTSheet config inputs) for that row.
  const [doseSheet, setDoseSheet] = useState(null);
  const [doseEdit, setDoseEdit] = useState(null); // AD-95 / F2: { mode: 'time' | 'dose', log, name }
  const [deleteAsk, setDeleteAsk] = useState(null);
  // DoseTrace sheets instead of native alerts (M4): `logSheet` on the screen (the Missed
  // choice, errors); `siteSheet` presented from inside the site picker.
  const [logSheet, setLogSheet] = useState(null);
  const [siteSheet, setSiteSheet] = useState(null);
  // A-181 (founder 2026-10-26, option B): "Not synced since {date}" while the A-177 rule holds doses
  // back (lib/doseActions unsyncedState; null = nothing to say). syncing: Sync now is running.
  const [unsync, setUnsync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const insets = useSafeAreaInsets();

  // BK-10: a Dose log pushed while folded moves onto Today's right page on unfold.
  useUnfoldToPage('Log', { embedded });

  // Embedded: refetch when a dose is written on Today's left page (not on the first
  // render; the focus effect below loads the list).
  const firstRefresh = useRef(true);
  useEffect(() => {
    if (firstRefresh.current) { firstRefresh.current = false; return; }
    if (embedded) { fetchLogs(); refreshUnsync(); }
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A-181 code review #7: a sync that finished (a pull may have landed) refreshes the card.
  useEffect(() => addSyncListener((e) => { if (e && e.type === 'sync_complete') refreshUnsync(); }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      // Load now; the Missed scan (12h+ unlogged doses) waits for the session's first sync
      // (A-123), then the list is read again with its rows and the downloaded doses. Best-effort.
      fetchLogs();
      scanMissedDoses().then((n) => {
        if (n > 0) requestSync();
        fetchLogs();
        refreshUnsync();
      }).catch(() => {});
    }, [])
  );

  // A-181: read after the scan, so the rows it wrote or removed are counted.
  function refreshUnsync() {
    unsyncedState().then((st) => setUnsync(st && st.notice ? st.notice : null)).catch(() => {});
  }
  // Sync now: a full pass, then the scan (it writes the misses the pull now proves), then the notice.
  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    try {
      await forceSync();
      const n = await scanMissedDoses({ maxWaitMs: 15000 });
      if (n > 0) requestSync();
    } catch { /* the card stays: the next opening tries again */ }
    fetchLogs();
    refreshUnsync();
    setSyncing(false);
  }

  // A dose auto-marked "Missed" can be corrected here — the user took it but
  // didn't log it in time. Changing the outcome updates the same row (no new
  // log), so the streak/adherence recompute on the next focus.
  function openMissedEditor(log) {
    setLogSheet({
      title: t('log_missed_edit_title'),
      body: t('log_missed_edit_msg'),
      buttons: [
        { label: t('log_mark_taken'), kind: 'primary', onPress: () => setMissedOutcome(log, 'Taken') },
        { label: t('log_mark_skipped'), kind: 'secondary', onPress: () => setMissedOutcome(log, 'Skipped') },
        { label: t('cancel'), kind: 'secondary' },
      ],
    });
  }

  // S-25 (founder 2026-10-01): a Missed injectable changed to Taken is asked where it
  // was injected first (Skip allowed); Cancel leaves it Missed.
  function setMissedOutcome(log, outcome) {
    if (outcome === 'Taken' && needsSiteQuestion(log.protocols?.type)) {
      setTimeout(() => openSiteEditor(log, 'ask'), 350); // after the sheet has closed
      return;
    }
    if (outcome === 'Taken') { markRowTaken(log, null); return; }
    writeOutcome(log.id, { outcome });
  }

  // A Missed or Skipped row becomes complete (A-50): Today's own path (lib/doseActions
  // recordDoseTaken with the row named, A-78), so it is the same row, the vial or bottle moves
  // once and a past day keeps the row's time. A paused or deleted protocol: the plain flip.
  function markRowTaken(row, site) {
    const id = row.logId != null ? row.logId : row.id;
    const protocolId = row.protocolId != null ? row.protocolId : row.protocol_id;
    const atMs = Date.parse(row.loggedAt || row.logged_at);
    let res = null;
    try {
      res = recordDoseTaken(protocolId, { dayKey: Number.isFinite(atMs) ? dayKeyOf(atMs) : undefined, slotMs: Number.isFinite(atMs) ? atMs : undefined, flipRowId: id, injectionSite: site || null });
    } catch { res = null; }
    if (!res) { writeOutcome(id, site ? { outcome: 'Taken', injection_site: site } : { outcome: 'Taken' }); return; }
    // Final review 2026-10-20: a take of TODAY cancels its slot and +5/+10 repeats directly (the same
    // cancel Today's take uses), so a repeat due before the queued resync never fires.
    if (Number.isFinite(atMs) && dayKeyOf(atMs) === dayKeyOf(Date.now())) {
      try {
        const p = getProtocolById(protocolId);
        const handled = p ? handledSlotIndexes({ reminderTime: p.reminder_time, logs: getTodayLogs(p.user_id) || [], protocolId, dayKey: dayKeyOf(atMs) }) : new Set();
        if (handled.size) cancelTodaysDoseReminders(protocolId, Math.max(...handled) + 1).catch(() => {});
      } catch { /* the resync below still re-plans */ }
    }
    syncAllNotifications().catch(() => {}); // test build 3 council item 2: the slot is handled now
    requestSync();
    fetchLogs();
    if (embedded && onChanged) onChanged(); // BK-19: Today's left page follows
  }
  function dayKeyOf(ms) {
    const d = new Date(ms);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function writeOutcome(logId, fields) {
    try {
      updateDoseLog(logId, fields);
      syncAllNotifications().catch(() => {}); // test build 3 council item 2: Skipped / Taken / Missed change the plan
      requestSync();
      fetchLogs();
      if (embedded && onChanged) onChanged(); // BK-19: Today's left page follows
    } catch { /* ignore */ }
  }

  const gate = embedded && popupGate ? popupGate : null;
  const gateRef = useRef(gate);
  gateRef.current = gate;
  const editorOpenRef = useRef(false);
  function releasePopup() {
    if (!editorOpenRef.current) return;
    editorOpenRef.current = false;
    if (gateRef.current) gateRef.current.closed();
  }
  // Leaving the right page with the editor open (another item picked, folded) frees Today's queue.
  useEffect(() => () => {
    if (gateRef.current) gateRef.current.wait(null); // a waiting editor of this page is dropped
    releasePopup();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // mode 'edit': a saved dose's site. mode 'ask': a Missed dose about to become Taken.
  async function openSiteEditor(log, mode = 'edit') {
    // Oral supplements have no injection site — nothing to edit here.
    if (!['recon', 'rtu'].includes(log.protocols?.type)) return;
    // BK-20: Today's site question / vial prompt / "still going?" is open or queued — the
    // editor opens when it has closed. Claimed before the first await, so nothing slips in.
    // Opened from the dose sheet, the gate the sheet holds is kept (never asked twice).
    if (gate && !editorOpenRef.current) {
      if (gate.busy()) { gate.wait(() => openSiteEditor(log, mode)); return; }
      gate.opened();
      editorOpenRef.current = true;
    }
    const user = await getCachedUser();
    if (!user && mode !== 'ask') { releasePopup(); return; }
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const recent = user ? (getLogsSince(user.id, since.toISOString()) || []) : [];
    setBodyMapTarget({
      logId: log.id,
      loggedAt: log.logged_at,
      protocolName: log.protocols ? logName(log) : null,
      protocolId: log.protocol_id ?? null,
      initialStored: mode === 'ask' ? null : (log.injection_site || null),
      recentLogs: recent,
      mode,
    });
    setBodyMapVisible(true);
  }

  // Every way out of the picker goes through ONE plan (lib/sitePickerActions.js).
  function siteAction(action, stored) {
    const tgt = bodyMapTarget;
    if (!tgt) return;
    const plan = planSitePickerAction({ mode: tgt.mode, action });
    if (!plan.close) return;
    setBodyMapVisible(false);
    setBodyMapTarget(null);
    releasePopup(); // BK-20: a question of Today's that waited may open now
    if (!tgt.logId) return;
    if (plan.commit) markRowTaken(tgt, plan.writeSite ? stored : null);
    else if (plan.writeSite) writeOutcome(tgt.logId, { injection_site: stored });
  }
  function handleSiteSave({ stored }) { siteAction('save', stored); }
  function handleSiteSkip() { siteAction('skip'); }
  function handleSiteClose() { siteAction('cancel'); }
  function handleSiteBack() {
    const tgt = bodyMapTarget;
    if (!tgt || !planSitePickerAction({ mode: tgt.mode, action: 'back' }).confirm) { siteAction('back'); return; }
    // Asked from inside the picker (BodyMapModal sheet): Stay first, Leave in the risk colour.
    setSiteSheet({
      title: t('today_site_back_title'),
      body: t('today_site_back_msg'),
      buttons: [
        { label: t('today_site_back_stay'), kind: 'secondary' },
        { label: t('today_site_back_leave'), kind: 'danger', onPress: () => siteAction('leave') },
      ],
    });
  }

  // ── The dose sheet (founder 2026-10-02, option A) ──────────────────────────────────
  // Tap a Taken / Skipped row: its sheet (Status / When / Site, Change site for an
  // injectable, Delete this dose). BK-20: it is a popup like the site editor — it waits
  // for Today's, holds the gate through Change site / the confirm, and frees it at the end.
  function openDoseSheet(log) {
    if (gate && !editorOpenRef.current) {
      if (gate.busy()) { gate.wait(() => openDoseSheet(log)); return; }
      gate.opened();
      editorOpenRef.current = true;
    }
    setDoseSheet(log);
  }
  // Done, a tap outside, or the back gesture.
  function closeDoseSheet() {
    afterSheetRef.current = null;
    setDoseSheet(null);
    releasePopup();
  }
  // The next popup opens once the sheet has gone (iOS cannot present a Modal while another
  // one is still animating out): Modal onDismiss on iOS, a short timer as the fallback.
  const afterSheetRef = useRef(null);
  const afterTimerRef = useRef(null);
  function runAfterSheet() {
    if (afterTimerRef.current) { clearTimeout(afterTimerRef.current); afterTimerRef.current = null; }
    const fn = afterSheetRef.current;
    afterSheetRef.current = null;
    if (fn) fn();
  }
  function leaveSheetThen(fn) {
    afterSheetRef.current = fn;
    setDoseSheet(null);
    afterTimerRef.current = setTimeout(runAfterSheet, Platform.OS === 'ios' ? 700 : 50);
  }
  useEffect(() => () => { if (afterTimerRef.current) clearTimeout(afterTimerRef.current); }, []);

  // AD-95 / F2 (founder 2026-10-26, picture docs/design/f2-dose-time-edit.html): "Alterar horário" and
  // "Alterar dose" — the sheet leaves, the editor opens holding the same popup turn (BK-20), freed on close.
  function openDoseEdit(log, mode) {
    leaveSheetThen(() => setDoseEdit({ mode, log, name: logName(log), when: doseWhen(log) }));
  }
  function closeDoseEdit() {
    setDoseEdit(null);
    releasePopup();
  }
  function saveDoseEdit(mode, value) {
    const log = doseEdit && doseEdit.log;
    if (!log) return;
    closeDoseEdit();
    // Only this row changes: its time (the curve follows it) or its own amount (the curve changes from
    // it on). Reminders are re-planned (a time moved to another day).
    if (mode === 'time') { writeOutcome(log.id, timeEditFields(log, value)); return; }
    const unit = value.unit || unitForDoseEdit(log);
    // DL-15 / AD-95 F3: a dose of the active vial corrected to another amount moves that vial by the
    // difference — read before the row changes (the plan finds the vial from the rows as they are). Review
    // 2026-10-27 #1: nothing waits before the write (the row's own user_id, no session read).
    let fix = null;
    try { fix = vialAfterOneDoseEdit(log, { amount: value.amount, unit }, deleteContext(log, log.user_id)); } catch { fix = null; }
    writeOutcome(log.id, { dose_amount: value.amount, dose_unit: unit });
    if (fix) {
      try { updateVial(fix.id, { total_doses: fix.total_doses }); syncAllNotifications().catch(() => {}); requestSync(); } catch { /* the dose itself is saved */ }
    }
  }

  // Change site: the existing site editor, exactly as the row tap opened it before.
  function changeSiteFromSheet(log) {
    leaveSheetThen(() => openSiteEditor(log));
  }
  // A-50: Skipped → complete from the dose sheet; an injectable asks its site first (S-25).
  function takeFromSheet(log) {
    if (needsSiteQuestion(log.protocols?.type)) leaveSheetThen(() => openSiteEditor(log, 'ask'));
    else leaveSheetThen(() => { releasePopup(); markRowTaken(log, null); });
  }

  // "Delete this dose" → the Graduated confirm. The body says what really happens to the
  // supply (the same plan the write uses).
  function askDelete(log) {
    leaveSheetThen(async () => {
      let supply = 'none';
      try {
        const user = await getCachedUser();
        if (user) supply = planDeleteDose(log, deleteContext(log, user.id)).supply;
      } catch { /* the plain body */ }
      setDeleteAsk({ log, supply });
    });
  }
  function closeDeleteAsk() {
    setDeleteAsk(null);
    releasePopup();
  }

  // What the plan reads, fresh: the protocol, its vials, the user's dose rows.
  function deleteContext(log, userId) {
    const protocol = log.protocol_id != null ? getProtocolById(log.protocol_id) : null;
    const vials = protocol ? (getVialsForProtocol(protocol.id) || []) : [];
    return { protocol, vials, takenLogs: getAllLogs(userId) || [] };
  }

  // The delete: exactly what Today's Undo does for this row (lib/deleteDose.js
  // planDeleteDose → lib/markTaken.js planUndoTake): the sync tombstone, one dose back to
  // the vial it used (or one serving to the bottle), then sync, the list and Today.
  async function applyDelete(log) {
    try {
      const user = await getCachedUser();
      if (!user) return;
      const plan = planDeleteDose(log, deleteContext(log, user.id));
      if (!plan.deleteIds.length) return;
      for (const id of plan.deleteIds) {
        deleteDoseLog(id);
        rememberDeleted(id); // Today's Undo of this row must never run after it
      }
      // Supply is best-effort: the delete itself is already saved.
      try {
        if (plan.vialRestore) {
          const { id, ...fields } = plan.vialRestore;
          updateVial(id, fields);
        }
        if (plan.oralRestore) updateProtocol(plan.oralRestore.protocolId, { units_taken: plan.oralRestore.units_taken });
        if (plan.vialRestore || plan.oralRestore) syncAllNotifications().catch(() => {});
      } catch { /* supply update is best-effort */ }
      // Test build 3 council item 2: a deleted Taken row of a slot still ahead is owed again.
      syncAllNotifications().catch(() => {});
      requestSync();
      fetchLogs();
      if (embedded && onChanged) onChanged(); // BK-19: Today's left page follows
    } catch (err) {
      setLogSheet({ icon: 'warning', title: t('error'), body: friendlyError(err, t, 'error_save_failed'), buttons: [{ label: t('ok'), kind: 'primary' }] });
    }
  }

  // "Today, 11:51 AM" / "Yesterday, …" / "Fri, …" / "Sep 3, …" (the row's own time format).
  function doseWhen(log) {
    const d = new Date(log.logged_at);
    const time = timeOf(log.logged_at);
    const kind = doseDayKind(log.logged_at);
    let day;
    if (kind === 'today') day = t('today_today_pill');
    else if (kind === 'yesterday') day = t('today_yesterday');
    else if (kind === 'weekday') day = t(WEEKDAY_KEYS[d.getDay()]);
    else {
      day = formatDate(d, language, 'dayMonthAuto');
    }
    return `${day}, ${time}`;
  }

  async function fetchLogs() {
    try {
      const user = await getCachedUser();
      if (!user) return;
      const data = getAllLogs(user.id);
      // Map local join fields to match expected shape: { protocols: { name, color, type } }
      const mapped = (data || []).map(row => ({
        ...row,
        protocols: row.protocol_name ? { name: row.protocol_name, compound_id: row.protocol_compound_id || null, color: row.protocol_color, type: row.protocol_type } : null,
      }));
      setLogs(mapped);
    } finally { setLoaded(true); }
  }

  const filteredLogs = logs.filter(l => {
    if (filter === 'All') return true;
    return l.outcome === filter;
  });

  // Group by local calendar day (year included in the key so e.g. Jul 3 2025
  // and Jul 3 2026 stay separate); returns SectionList-shaped sections.
  function buildSections(logs) {
    const groups = {};
    const order = [];
    logs.forEach(log => {
      const d = new Date(log.logged_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          title: formatDate(d, language, 'weekdayLongDayMonthAuto'),
          data: [],
        };
        order.push(key);
      }
      groups[key].data.push(log);
    });
    return order.map(key => groups[key]);
  }

  // pre_tags may arrive as a JSON string from the cloud — parse defensively
  function parseTags(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  // Status = a dot + a word (DESIGN.md §5); schedule colors, never good/bad on the body.
  function outcomeColor(outcome) {
    if (outcome === 'Taken') return colors.ok;
    // Skipped is a neutral fact; red is only for a missed dose (DESIGN.md §2.1, founder 2026-10-01).
    if (outcome === 'Skipped') return colors.ink2;
    return colors.risk;
  }

  function outcomeLabel(outcome) {
    if (outcome === 'Taken') return t('log_taken');
    if (outcome === 'Skipped') return t('log_skipped');
    return t('log_missed');
  }

  // One dose's status, in the singular (founder 2026-10-02); the counts keep outcomeLabel.
  function statusWord(outcome) {
    if (outcome === 'Taken') return t('log_status_taken');
    if (outcome === 'Skipped') return t('log_status_skipped');
    return t('log_status_missed');
  }

  function typeIcon(type) {
    if (type === 'recon') return 'type_vial';
    if (type === 'rtu') return 'syringe';
    if (type === 'oral') return 'type_capsule';
    return 'syringe';
  }

  const sections = buildSections(filteredLogs);

  // A-30: the counts are doses logged in the app; declared history (dated before its protocol was
  // added) stays in the list but is not counted.
  const counted = outcomeCounts(logs);
  const takenCount = counted.Taken;
  const skippedCount = counted.Skipped;
  const missedCount = counted.Missed;

  const filters = [
    { key: 'All', label: t('log_all') },
    { key: 'Taken', label: t('log_taken') },
    { key: 'Skipped', label: t('log_skipped') },
    { key: 'Missed', label: t('log_missed') },
  ];
  const counts = [
    { key: 'Taken', n: takenCount },
    { key: 'Skipped', n: skippedCount },
    { key: 'Missed', n: missedCount },
  ];

  // The dose sheet keeps its last row on screen while it fades out.
  const lastSheetRef = useRef(null);
  if (doseSheet) lastSheetRef.current = doseSheet;
  const shownSheet = doseSheet || lastSheetRef.current;
  const sheetInjectable = !!shownSheet && INJECTABLE.includes(shownSheet.protocols?.type);
  // AD-95: the dose this Taken dose was given at (an injectable: the curve's compounds).
  const sheetDose = !!shownSheet && canEditDose(shownSheet) && shownSheet.dose_amount != null
    ? `${formatNumber(shownSheet.dose_amount, language, { trim: true, grouping: false })}\u00A0${shownSheet.dose_unit || ''}`.trim() : null;
  const sheetSite = sheetInjectable && shownSheet.injection_site
    ? (describeStored(shownSheet.injection_site, t) || summarizeStored(shownSheet.injection_site, t))
    : null;

  // "Delete this dose?" (DTSheet, the Graduated confirm Today's "Skip dose?" uses). The body
  // says what the delete really does to the supply: a dose back to the vial, a serving
  // back to the bottle, or (a skipped dose, a vial that cannot be told) the row only.
  const DELETE_BODY = { vial: 'log_delete_body', bottle: 'log_delete_body_oral', none: 'log_delete_body_plain' };
  const deleteSheet = deleteAsk ? {
    title: t('log_delete_title'),
    body: t(DELETE_BODY[deleteAsk.supply] || DELETE_BODY.none)
      .replace('{name}', logName(deleteAsk.log))
      .replace('{when}', doseWhen(deleteAsk.log)),
    buttons: [
      { label: t('cancel'), kind: 'secondary' },
      { label: t('log_delete'), kind: 'danger', onPress: () => applyDelete(deleteAsk.log) },
    ],
  } : null;

  // Everything above the day sections scrolls with them (one list, no fixed bars).
  const header = (
    <View style={s.top}>
      <Text style={s.title}>{t('log_title')}</Text>
      {/* A-181 option B: the state of the data, never an alert colour (DESIGN.md §2.5) */}
      {unsync ? (
        <View style={s.unsyncCard}>
          <View style={s.unsyncHead}>
            <FeatureIcon name="refresh" size={18} color={colors.ink2} />
            <Text style={s.unsyncTitle}>
              {unsync.never ? t('log_unsynced_never') : t('log_unsynced_title').replace('{date}', formatDate(new Date(unsync.sinceMs), language, 'dayMonth') || '')}
            </Text>
          </View>
          <Text style={s.unsyncBody}>{t(pluralKey('log_unsynced_count', unsync.count, language)).replace('{n}', String(unsync.count))}</Text>
          {unsync.old ? <Text style={s.unsyncBody}>{t('log_unsynced_old')}</Text> : null}
          <TouchableOpacity onPress={syncNow} disabled={syncing} style={s.syncBtn} accessibilityRole="button" accessibilityState={{ busy: syncing, disabled: syncing }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.syncBtnText}>{t('sync_now')}</Text>
            {syncing ? <ActivityIndicator size="small" color={colors.ink2} /> : null}
          </TouchableOpacity>
        </View>
      ) : null}
      {/* Why the log matters — moved here from Today (today-build-handoff.md item 15) */}
      <View style={s.expl}>
        <Text style={s.explText}>{t('today_streak_explainer')}</Text>
      </View>
      {/* Plain counts with a status dot — no tinted boxes (founder approved) */}
      <View style={s.trio}>
        {counts.map(c => (
          <View key={c.key} style={s.trioCol} accessible accessibilityLabel={`${c.n} ${outcomeLabel(c.key)}`}>
            <Text style={s.trioNum}>{c.n}</Text>
            <View style={s.trioCapRow}>
              <View style={[s.statusDot, { backgroundColor: outcomeColor(c.key) }]} />
              <Text style={s.trioCap}>{outcomeLabel(c.key)}</Text>
            </View>
            {c.key === 'Missed' && unsync ? <Text style={s.trioSub}>{t(pluralKey('log_unrecorded_n', unsync.count, language)).replace('{n}', String(unsync.count))}</Text> : null}
          </View>
        ))}
      </View>
      {/* Filter: the shared bar (founder 2026-10-02, Q2 = B). Never in a horizontal
          ScrollView (A-63: that grew to fill the screen and stretched each chip). */}
      <SegmentedBar items={filters} value={filter} onChange={setFilter} />
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={embedded ? ['left', 'right'] : undefined}>
      <View style={[s.nav, embedded && s.navEmbedded]}>
        {!embedded && (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('common_back')}
          >
            <Text style={s.back}>‹ {backLabelFor(navigation, t)}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={s.curveBtn}
          onPress={async () => { Analytics.viewed('serum_curve'); const pro = await hasPremium(); navigation.navigate(pro ? 'SerumCurve' : 'Paywall', pro ? undefined : { source: 'log_serum' }); }}
          accessibilityRole="button"
          accessibilityLabel={t('curve_btn')}
        >
          <FeatureIcon name="curve" size={15} color={colors.ink} />
          <Text style={s.curveBtnText}>{t('curve_btn')}</Text>
        </TouchableOpacity>
      </View>

      {/* A-135 council (4a): on the book's right page (embedded) the page ground stays plain while it
          loads — no spinner on the opening (founder rule, picture a135). */}
      {listState === 'loading' ? (
        <View style={s.loadingBox}>
          {!embedded && <ActivityIndicator size="large" color={colors.accent} />}
        </View>
      ) : (
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        style={s.scroll}
        contentContainerStyle={s.centered}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <View style={s.emptyIcon}><FeatureIcon name="journal" size={44} color={colors.ink3} /></View>
            <Text style={s.emptyTitle}>
              {listState === 'empty' && filter === 'All'
                ? t('log_empty_title')
                : t({ Taken: 'log_none_taken', Skipped: 'log_none_skipped', Missed: 'log_none_missed' }[filter] || 'log_empty_title')}
            </Text>
            {listState === 'empty' && filter === 'All' && <Text style={s.emptySub}>{t('log_empty_sub')}</Text>}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={s.groupHeader}>
            <Text style={s.groupDate}>{section.title}</Text>
            <Text style={s.groupCount}>
              {section.data.length} {section.data.length > 1 ? t('log_doses') : t('log_dose')}
            </Text>
          </View>
        )}
        renderSectionFooter={() => <View style={{ height: 16 }} />}
        renderItem={({ item: log, index, section }) => {
          const tags = parseTags(log.pre_tags);
          const first = index === 0;
          const last = index === section.data.length - 1;
          // Every row opens: a Missed row its Mark taken / Mark skipped editor, a Taken or
          // Skipped row its dose sheet (founder 2026-10-02, option A).
          return (
            <TouchableOpacity
              style={[s.row, first && s.rowFirst, last && s.rowLast]}
              onPress={() => log.outcome === 'Missed' ? openMissedEditor(log) : openDoseSheet(log)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${logName(log)}, ${statusWord(log.outcome)}`}
              accessibilityHint={log.outcome === 'Missed' ? t('log_missed_edit_title') : undefined}
            >
              <View style={[s.rowInner, !first && s.rowSep]}>
                <View style={s.logInfo}>
                  <View style={s.logNameRow}>
                    <FeatureIcon name={typeIcon(log.protocols?.type)} size={15} color={colors.ink2} />
                    <Text style={s.logName}>{logName(log)}</Text>
                  </View>
                  {log.injection_site ? (
                    <View style={s.detailRow}>
                      <FeatureIcon name="pin" size={13} color={colors.ink3} />
                      <Text style={s.logDetail}>{summarizeStored(log.injection_site, t) || log.injection_site}</Text>
                    </View>
                  ) : null}
                  {log.notes ? (
                    <View style={s.detailRow}>
                      <FeatureIcon name="journal" size={13} color={colors.ink3} />
                      <Text style={s.logDetail}>{log.notes}</Text>
                    </View>
                  ) : null}
                  {tags.length > 0 && (
                    <View style={s.tagRow}>
                      {tags.map(tag => (
                        <View key={String(tag)} style={s.tag}>
                          <Text style={s.tagText}>{String(tag)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={s.logRight}>
                  <Text style={s.logTime}>
                    {timeOf(log.logged_at)}
                  </Text>
                  <View style={s.outcomeRow}>
                    <View style={[s.statusDot, { backgroundColor: outcomeColor(log.outcome) }]} />
                    <Text style={[s.outcomeWord, { color: outcomeColor(log.outcome) }]}>{statusWord(log.outcome)}</Text>
                  </View>
                </View>
                <RowChevron color={colors.tick} />
              </View>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={<View style={{ height: 40 }} />}
      />
      )}

      {/* Part 18: on the Dose log screen only — never on Today's right page (the dose-logging path). */}
      {!embedded && <FeatureExplainerGate candidates={logExplainers} />}

      {/* The dose sheet (founder 2026-10-02, option A; Graduated sheet look). */}
      <Modal
        visible={!!doseSheet}
        transparent
        animationType="fade"
        onRequestClose={closeDoseSheet}
        onDismiss={runAfterSheet}
      >
        <Pressable style={s.sheetScrim} onPress={closeDoseSheet} accessibilityRole="button" accessibilityLabel={t('done')}>
          {shownSheet ? (
            <Pressable style={[s.doseSheet, { paddingBottom: 22 + insets.bottom }]} onPress={() => {}} accessibilityViewIsModal>
              <View style={s.sheetHead}>
                <Text style={s.sheetTitle} accessibilityRole="header" numberOfLines={2}>
                  {logName(shownSheet)}
                </Text>
                <TouchableOpacity onPress={closeDoseSheet} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
                  <Text style={s.sheetDone}>{t('done')}</Text>
                </TouchableOpacity>
              </View>
              <View>
                <View style={s.kvRow}>
                  <Text style={s.kvKey}>{t('log_sheet_status')}</Text>
                  <Text style={s.kvVal}>{statusWord(shownSheet.outcome)}</Text>
                </View>
                {sheetDose ? (
                  <View style={s.kvRow}>
                    <Text style={s.kvKey}>{t('log_sheet_dose')}</Text>
                    <Text style={s.kvVal}>{sheetDose}</Text>
                  </View>
                ) : null}
                <View style={[s.kvRow, !sheetSite && s.kvRowEnd]}>
                  <Text style={s.kvKey}>{t('log_sheet_when')}</Text>
                  <Text style={s.kvVal}>{doseWhen(shownSheet)}</Text>
                </View>
                {sheetSite ? (
                  <View style={[s.kvRow, s.kvRowEnd]}>
                    <Text style={s.kvKey}>{t('log_sheet_site')}</Text>
                    <Text style={s.kvVal}>{sheetSite}</Text>
                  </View>
                ) : null}
              </View>
              {sheetInjectable && (
                <TouchableOpacity style={s.changeSite} onPress={() => changeSiteFromSheet(shownSheet)} accessibilityRole="button">
                  <Text style={s.changeSiteText}>{t('log_change_site')}</Text>
                  <RowChevron color={colors.ink3} />
                </TouchableOpacity>
              )}
              {canEditTime(shownSheet) && (
                <TouchableOpacity style={s.changeSite} onPress={() => openDoseEdit(shownSheet, 'time')} accessibilityRole="button">
                  <Text style={s.changeSiteText}>{t('log_change_time')}</Text>
                  <RowChevron color={colors.ink3} />
                </TouchableOpacity>
              )}
              {canEditDose(shownSheet) && (
                <TouchableOpacity style={s.changeSite} onPress={() => openDoseEdit(shownSheet, 'dose')} accessibilityRole="button">
                  <Text style={s.changeSiteText}>{t('log_change_dose')}</Text>
                  <RowChevron color={colors.ink3} />
                </TouchableOpacity>
              )}
              {shownSheet.outcome === 'Skipped' && (
                <TouchableOpacity style={s.takeBtn} onPress={() => takeFromSheet(shownSheet)} accessibilityRole="button">
                  <Text style={s.takeBtnText}>{t('log_mark_taken')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.dangerBtn} onPress={() => askDelete(shownSheet)} accessibilityRole="button">
                <Text style={s.dangerBtnText}>{t('log_delete_dose')}</Text>
              </TouchableOpacity>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>

      <DoseEditSheet edit={doseEdit} onClose={closeDoseEdit} onSave={saveDoseEdit} />
      <DTSheet config={deleteSheet} onClose={closeDeleteAsk} />
      <DTSheet config={logSheet} onClose={() => setLogSheet(null)} />

      <BodyMapModal
        visible={bodyMapVisible}
        onClose={handleSiteClose}
        onBack={handleSiteBack}
        onSkip={bodyMapTarget?.mode === 'ask' ? handleSiteSkip : null}
        onSave={handleSiteSave}
        initialStored={bodyMapTarget?.initialStored || null}
        protocolName={bodyMapTarget?.protocolName || null}
        protocolId={bodyMapTarget?.protocolId ?? null}
        recentLogs={bodyMapTarget?.recentLogs || []}
        sheet={siteSheet}
        onSheetClose={() => setSiteSheet(null)}
      />
    </SafeAreaView>
  );
}

// The back row names the screen it returns to (prototype navrow), else "Back".
const TAB_LABEL = { Today: 'tab_today', Protocols: 'tab_protocols', Journey: 'tab_journey', Body: 'tab_body', Settings: 'tab_settings' };
function backLabelFor(navigation, t) {
  try {
    const st = navigation.getState();
    const prev = st && st.routes[st.index - 1];
    if (prev && prev.name === 'MainTabs' && prev.state && prev.state.routes) {
      const tab = prev.state.routes[prev.state.index || 0];
      if (tab && TAB_LABEL[tab.name]) return t(TAB_LABEL[tab.name]);
    }
  } catch { /* fall through */ }
  return t('back');
}

// Graduated (docs/design/prototype.html doseLog(); DESIGN.md §3–§5).
const makeStyles = (c) => StyleSheet.create({
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  container: { flex: 1, backgroundColor: c.ground },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 16 },
  navEmbedded: { justifyContent: 'flex-end' },
  back: { fontSize: 17, color: c.ink },
  // secondary action: an outline pill (the curve is one tap down, not the screen's action)
  curveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line },
  curveBtnText: { fontSize: 13, color: c.ink },
  scroll: { flex: 1, paddingHorizontal: 16 },
  top: { gap: 12, paddingBottom: 16 },
  title: { fontSize: 34, fontWeight: '600', color: c.ink, letterSpacing: -0.7, paddingHorizontal: 4, paddingTop: 4 },
  expl: { backgroundColor: c.raised, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16 },
  explText: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  trio: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  trioCol: { flex: 1, minWidth: 0, gap: 4 },
  trioNum: { fontSize: 34, fontWeight: '300', color: c.ink, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  trioCapRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trioCap: { fontSize: 12, fontWeight: '500', color: c.ink2, flexShrink: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  trioSub: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: c.ink3, fontVariant: ['tabular-nums'] },
  // A-181 option B (picture .ncard / .tbtn): a raised card, a text button.
  unsyncCard: { backgroundColor: c.raised, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, gap: 6 },
  unsyncHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unsyncTitle: { fontSize: 17, fontWeight: '600', color: c.ink, flexShrink: 1 },
  unsyncBody: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 24, paddingTop: 4 },
  syncBtnText: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: c.ink, textDecorationLine: 'underline' },
  emptyState: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 20 },
  loadingBox: { flex: 1, paddingTop: 96, alignItems: 'center' }, // A-120: first load
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '600', color: c.ink, marginBottom: 8, textAlign: 'center' },
  emptySub: { fontSize: 15, color: c.ink2, textAlign: 'center', lineHeight: 20 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingHorizontal: 4, marginBottom: 8 },
  groupDate: { fontSize: 17, fontWeight: '600', color: c.ink, flexShrink: 1 },
  groupCount: { fontSize: 13, color: c.ink2, fontVariant: ['tabular-nums'] },
  // one raised list per day: each row carries the list's fill; first/last round it
  row: { backgroundColor: c.raised, paddingHorizontal: 16 },
  rowFirst: { borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  rowLast: { borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  logInfo: { flex: 1, minWidth: 0, gap: 3 },
  logNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logName: { fontSize: 17, color: c.ink, flexShrink: 1 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  logDetail: { fontSize: 15, color: c.ink2, flexShrink: 1 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag: { minHeight: 24, borderRadius: 12, borderWidth: 1, borderColor: c.line, paddingHorizontal: 9, justifyContent: 'center' },
  tagText: { fontSize: 12, fontWeight: '500', color: c.ink2 },
  logRight: { alignItems: 'flex-end', gap: 4 },
  logTime: { fontSize: 15, color: c.ink2, fontVariant: ['tabular-nums'] },
  outcomeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  outcomeWord: { fontSize: 13, fontWeight: '600' },
  // The dose sheet (prototype sheet + .kv rows + .dangerbtn; approved render 2026-10-02).
  sheetScrim: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
  doseSheet: { backgroundColor: c.raised, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 18, paddingHorizontal: 18, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  sheetTitle: { fontSize: 22, fontWeight: '700', color: c.ink, flex: 1, letterSpacing: -0.3 },
  sheetDone: { fontSize: 17, fontWeight: '600', color: c.ink },
  kvRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, borderBottomWidth: 1, borderBottomColor: c.line },
  kvRowEnd: { borderBottomWidth: 0 },
  kvKey: { fontSize: 15, color: c.ink2 },
  kvVal: { fontSize: 15, fontWeight: '500', color: c.ink, flexShrink: 1, textAlign: 'right' },
  changeSite: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderRadius: 14, backgroundColor: c.well, paddingHorizontal: 14 },
  changeSiteText: { fontSize: 16, color: c.ink },
  dangerBtn: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  // A-50: a skipped dose's "Mark complete" (the primary action, ink).
  takeBtn: { minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center' },
  takeBtnText: { fontSize: 17, fontWeight: '700', color: c.onAct },
  dangerBtnText: { fontSize: 17, fontWeight: '600', color: c.risk },
});
