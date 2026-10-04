import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { goalOptions } from '../lib/profileGoals';
import LegalModal from '../components/LegalModal';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Linking,
  Share,
  TextInput,
  FlatList,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import GradSwitch from '../components/GradSwitch';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase, getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { formatDate, decimalText } from '../lib/localeFormat';
import { useTheme } from '../lib/theme';
import FeatureIcon from '../components/FeatureIcon';
import RowChevron from '../components/RowChevron';
import SegmentedBar from '../components/SegmentedBar';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import {
  getHistoryProtocols,
  getLogsSince, getActiveVials as getLocalVials,
} from '../lib/database';
import { hasPremium } from '../lib/entitlement';
import { isEnded, reportProtocols } from '../lib/protocolEnd';
import { loggedOnly } from '../lib/declared';
import { COUNTRIES, countryLabel } from '../lib/countries';
import { syncAllNotifications, openBatteryOptimizationSettings } from '../lib/notifications';
import { friendlyError } from '../lib/friendlyError';
import CheckMark from '../components/CheckMark';
import { MONO } from '../lib/fonts';
import BookPanes, { useBook, useBookSelection } from '../components/BookPanes';
import { pluralKey } from '../lib/plural';
import { PROFILE_ACTIVITY, normalizeActivityLevel, legacyActivity, activitySourceKey } from '../lib/activityLevels';
import { getCalcInputs } from '../lib/realityCheck';
import { activityParts } from '../lib/progressFormat';
import { adherenceStats, fillPercent } from '../lib/adherenceReport';
import { createBusyGuard } from '../lib/busyGuard';
import { runSignOut } from '../lib/settingsSignOut';
import { scanMissedDoses } from '../lib/doseActions';
import { DTSheet } from './components/ProtocolParts';
import { exportMyData, requestAccountDeletion, finishAccountDeletion as teardownDeletedAccount, signOutIntended } from '../lib/accountActions';

const APPLE_APP_ID = '6761788157'; // App Store Connect app ID (io.outcom.dosetrace)
const ANDROID_PACKAGE_ID = 'io.outcom.dosetrace';

const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr',
  'month_may', 'month_jun', 'month_jul', 'month_aug',
  'month_sep', 'month_oct', 'month_nov', 'month_dec',
];

const BIRTH_YEARS = [];
const _thisYear = new Date().getFullYear();
for (let y = _thisYear - 18; y >= _thisYear - 90; y--) BIRTH_YEARS.push(y);

// The Settings groups in screen order (founder-approved Graduated prototype, settingsScreen():
// Preferences, Notifications, Data & privacy, Support): the phone's group cards and, on a wide
// window (S-26 BK-7), the left page's list. Each card shows its name and a one-line summary of
// what is inside. Sign out / Delete account are not a group: they sit in their own card below.
// Recently deleted protocols live at the bottom of the Protocols list, not here.
const SETTINGS_GROUPS = [
  { key: 'account', labelKey: 'settings_preferences', sumKey: 'settings_sum_prefs' },
  { key: 'notifications', labelKey: 'settings_notifications', sumKey: 'settings_sum_notif' },
  { key: 'privacy', labelKey: 'settings_data_privacy', sumKey: 'settings_sum_privacy' },
  { key: 'support', labelKey: 'settings_support', sumKey: 'settings_sum_support' },
];

// The group on the right page: the chosen one, or Preferences (the first group, the default,
// BK-7) when the choice is unknown.
function bookGroup(sel) {
  return SETTINGS_GROUPS.some((g) => g.key === sel) ? sel : 'account';
}

// BK-10, folding: the group the user opened on the right page opens in the one-column
// list. Only that key changes; every other remembered open/closed state is kept. A
// default nobody chose changes nothing.
function foldCollapsed(collapsed, { sel, explicit }) {
  if (!explicit || !SETTINGS_GROUPS.some((g) => g.key === sel)) return collapsed;
  if (collapsed[sel] === false) return collapsed;
  return { ...collapsed, [sel]: false };
}

// The group card's arrow (prototype DOWN / UP), drawn in the theme's ink.
function GroupChevron({ dir, color }) {
  return (
    <Svg width={16} height={10} viewBox="0 0 16 10">
      <Path d={dir === 'up' ? 'M2 8l6-6 6 6' : 'M2 2l6 6 6-6'} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function SettingsScreen({ navigation }) {
  const { language, setLanguage, timeFormat, setTimeFormat, t, LANGUAGES } = useLanguage();
  const { colors, mode, setMode } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [user, setUser] = useState(null);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [doseReminders, setDoseReminders] = useState(true);
  const [checkinReminders, setCheckinReminders] = useState(true);
  const [foodReminders, setFoodReminders] = useState(true);
  const [notifNames, setNotifNames] = useState(true); // lock-screen privacy: compound names in notifications
  const [vialAlerts, setVialAlerts] = useState(true);
  const [silentMode, setSilentMode] = useState(false);
  const [persistentReminders, setPersistentReminders] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [premium, setPremium] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  // Profile fields
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState('');
  const [birthMonth, setBirthMonth] = useState(null);
  const [birthYear, setBirthYear] = useState(null);
  const [birthYearText, setBirthYearText] = useState('');
  const [country, setCountry] = useState('');
  const [primaryGoals, setPrimaryGoals] = useState([]);
  const [activityLevel, setActivityLevel] = useState('');
  const [hasProvider, setHasProvider] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  // DoseTrace sheets instead of native alerts (decisions: "DoseTrace sheets replace native iOS
  // alerts everywhere"). `sheet` sits on the screen; `editSheet` is presented from inside the
  // Edit profile sheet (a popup opened from a popup is rendered inside it, M1).
  const [sheet, setSheet] = useState(null);
  const [editSheet, setEditSheet] = useState(null);
  // The adherence report preview (Settings part 3): the exact text before the share sheet.
  const [reportPreview, setReportPreview] = useState(null);
  const lastReport = useRef('');
  if (reportPreview) lastReport.current = reportPreview;
  const reportShown = reportPreview || lastReport.current;
  const pendingShare = useRef(null);
  const tornDown = useRef(false);
  const notice = (title, body, icon) => setSheet({ icon, title, body, buttons: [{ label: t('ok'), kind: 'primary' }] });
  const errorSheet = (body) => notice(t('error'), body, 'warning');
  // After the server deleted the account, the phone is cleared and signed out exactly once,
  // however the Apple note is closed (Done, the scrim or Android back), as on the 18+ sheet.
  const runTeardown = () => {
    if (tornDown.current) return;
    tornDown.current = true;
    // The phone could not sign out (no SIGNED_OUT ran): say so with the sign-out failure sheet.
    finishAccountDeletion().then((r) => { if (r && r.failed) showSignOutFailed(); }).catch(() => showSignOutFailed());
  };
  const closeSheet = () => {
    const closing = sheet;
    setSheet(null);
    if (closing && closing.teardown) runTeardown();
  };
  // Collapsible Settings sections (remembered). All start collapsed — the user
  // opens only what they need, so the screen stays clean.
  const ALL_COLLAPSED = { account: true, notifications: true, privacy: true, support: true };
  const [collapsed, setCollapsed] = useState(ALL_COLLAPSED);

  useEffect(() => {
    AsyncStorage.getItem('dosetrace_settings_collapsed')
      .then(v => { if (v) { try { setCollapsed({ ...ALL_COLLAPSED, ...JSON.parse(v) }); } catch {} } })
      .catch(() => {});
  }, []);

  function toggleSection(key) {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] };
      AsyncStorage.setItem('dosetrace_settings_collapsed', JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  // S-26 book layout: two pages on a wide window (BK-1), today's one column otherwise (BK-2).
  // The open group is kept per tab while the app is open (BK-8); Preferences (the first
  // group) by default.
  const book = useBook();
  const { sel, explicit, select } = useBookSelection('Settings', 'account');
  const wasBook = useRef(book);
  const phoneScrollRef = useRef(null);
  const headerY = useRef({});
  const foldTarget = useRef(null);

  // BK-10, folding: the group the user had open on the right page opens in the list (the
  // other remembered sections keep their state) and the list scrolls to it.
  useEffect(() => {
    if (wasBook.current && !book) {
      const target = sel;
      setCollapsed(prev => {
        const next = foldCollapsed(prev, { sel: target, explicit });
        if (next !== prev) AsyncStorage.setItem('dosetrace_settings_collapsed', JSON.stringify(next)).catch(() => {});
        return next;
      });
      if (explicit) {
        foldTarget.current = target;
        requestAnimationFrame(() => { if (foldTarget.current === target) scrollToSection(target); });
      }
    } else if (!wasBook.current && book) {
      headerY.current = {}; // the one-column list is gone; its positions are stale
      foldTarget.current = null;
    }
    wasBook.current = book;
  }, [book]); // eslint-disable-line react-hooks/exhaustive-deps

  function scrollToSection(key) {
    const y = headerY.current[key];
    if (y == null || !phoneScrollRef.current) return;
    phoneScrollRef.current.scrollTo({ y: Math.max(0, y - 8), animated: false });
    foldTarget.current = null;
  }

  function onSectionHeaderLayout(key, e) {
    headerY.current[key] = e.nativeEvent.layout.y;
    if (foldTarget.current === key) scrollToSection(key);
  }

  useFocusEffect(
    useCallback(() => {
      fetchUser();
    }, [])
  );

  async function fetchUser() {
    const user = await getCachedUser();
    setUser(user);
    // Real subscription status (non-throwing; defaults to false on failure)
    hasPremium().then(setPremium).catch(() => setPremium(false));
    if (user) {
      setAnalyticsEnabled(user.user_metadata?.analytics_opt_in !== false);
      setDoseReminders(user.user_metadata?.dose_reminders !== false);
      setCheckinReminders(user.user_metadata?.checkin_reminders !== false);
      setFoodReminders(user.user_metadata?.food_reminders !== false);
      setNotifNames(user.user_metadata?.notif_show_names !== false);
      setVialAlerts(user.user_metadata?.vial_alerts !== false);
      setSilentMode(user.user_metadata?.silent_mode === true);
      setPersistentReminders(user.user_metadata?.persistent_reminders === true);
      // Load profile
      setDisplayName(user.user_metadata?.display_name || '');
      setGender(user.user_metadata?.gender || '');
      setBirthMonth(user.user_metadata?.birth_month != null ? user.user_metadata.birth_month - 1 : null); // stored 1-based → 0-11 index
      setBirthYear(user.user_metadata?.birth_year ?? null);
      setBirthYearText(user.user_metadata?.birth_year != null ? String(user.user_metadata.birth_year) : '');
      setCountry(user.user_metadata?.country || '');
      const pg = user.user_metadata?.primary_goal || '';
      setPrimaryGoals(pg ? pg.split(',').filter(Boolean) : []);
      // The ONE activity answer (m14): the profile's level, or a later choice made in the
      // calculator — the same level Journey shows. Old 4-level values map to 5 (never lost).
      setActivityLevel(activitySourceKey(user.user_metadata, await getCalcInputs().catch(() => null)));
      setHasProvider(user.user_metadata?.has_provider || '');
    }
  }

  async function toggleNotificationPref(key, val, setter) {
    setter(val);
    // The preference lives in the account, so a failed save (e.g. offline) must
    // not LOOK saved: revert the switch and say so, instead of silently
    // re-scheduling from the old value (journey-review F3).
    let error = null;
    try { ({ error } = await supabase.auth.updateUser({ data: { [key]: val } })); } catch (e) { error = e; }
    if (error) {
      setter(!val);
      errorSheet(friendlyError(error, t, 'error_save_failed'));
      return;
    }
    // Re-sync all notifications to respect the new preference
    syncAllNotifications().catch(() => {});
  }

  async function toggleAnalytics(val) {
    setAnalyticsEnabled(val);
    await supabase.auth.updateUser({ data: { analytics_opt_in: val } });
  }

  async function saveProfile() {
    // The profile gate is hard-ON for everyone (lib/supabase.js PROFILE_GATE_SINCE),
    // so saving an incomplete profile would re-gate the user out of the app on the
    // next launch. Block the save and name the gaps instead of writing nulls.
    const missing = [];
    if (!displayName.trim()) missing.push(t('profile_name'));
    if (birthMonth == null) missing.push(t('profile_birth_month'));
    if (birthYear == null) missing.push(t('profile_birth_year'));
    if (!gender) missing.push(t('profile_sex'));
    if (!country.trim()) missing.push(t('profile_country'));
    if (primaryGoals.length === 0) missing.push(t('profile_goal'));
    if (!activityLevel) missing.push(t('profile_activity'));
    if (!hasProvider) missing.push(t('profile_provider'));
    if (missing.length > 0) {
      setEditSheet({ icon: 'warning', title: t('profile_required_legend').replace(/^\*\s*/, ''), body: missing.join('\n'), buttons: [{ label: t('ok'), kind: 'primary' }] });
      return;
    }
    try {
      await supabase.auth.updateUser({
        data: {
          display_name: displayName.trim() || null,
          gender: gender || null,
          birth_month: birthMonth != null ? birthMonth + 1 : null, // store 1-based (matches onboarding)
          birth_year: birthYear,
          country: country.trim() || null,
          primary_goal: primaryGoals.length > 0 ? primaryGoals.join(',') : null,
          activity_level: activityLevel || null,
          activity_scale: 5, // the 5-level scale (Gate B)
          // A changed answer is the user's latest choice (m14): stamped, so the calculator shows it.
          ...(activityLevel !== normalizeActivityLevel(user?.user_metadata?.activity_level) ? { activity_set_at: new Date().toISOString() } : {}),
          // An old 4-level value rewritten as its new level is kept (never lose user data).
          ...legacyActivity(user?.user_metadata?.activity_level, activityLevel),
          has_provider: hasProvider || null,
        },
      });
      setShowCountryPicker(false);
      setShowEditProfile(false);
      fetchUser();
    } catch (e) {
      setEditSheet({ icon: 'warning', title: t('error'), body: friendlyError(e, t, 'error_save_failed'), buttons: [{ label: t('ok'), kind: 'primary' }] });
    }
  }

  async function handleExportData() {
    if (!user) return;
    setExporting(true);
    try {
      // The one export (lib/accountActions), shared with the 18+ confirmation sheet.
      const r = await exportMyData(user, t('settings_export_title'));
      if (r.saved) notice(t('settings_export_title'), t('settings_export_done'), 'check');
    } catch (e) {
      errorSheet(t('settings_export_error'));
    }
    setExporting(false);
  }

  async function handleAdherenceReport() {
    if (!user) return;
    setExporting(true);
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Missed rows first (the same scan Today and the Dose log run), so the report counts
      // every scheduled dose of the period. Best-effort: the rows already written still count.
      try { await scanMissedDoses(); } catch (e) { /* best effort */ }
      const logs = getLogsSince(user.id, thirtyDaysAgo.toISOString()) || [];
      // Active protocols and the ended ones with records in the window (A-83: ending never
      // removes doses from the report; lib/protocolEnd reportProtocols).
      const protocols = reportProtocols(getHistoryProtocols(user.id) || [], logs, thirtyDaysAgo.getTime(), now.getTime());
      // One definition for every protocol and the overall figure (lib/adherenceReport, M2):
      // complete ÷ (complete + skipped + missed).
      const stats = adherenceStats({ protocols, logs, sinceMs: thirtyDaysAgo.getTime(), nowMs: now.getTime() });
      const vials = getLocalVials(user.id) || [];

      if (protocols.length === 0) {
        notice(t('settings_report_title'), t('settings_report_empty'));
        setExporting(false);
        return;
      }

      // Build per-protocol stats
      const protocolStats = protocols.map(p => {
        const pLogs = loggedOnly(logs, [p]).filter(l => l.protocol_id === p.id); // A-30: logged doses only
        const { taken, skipped, missed, adherence } = stats.perProtocol.find(r => r.id === p.id);

        // Calculate streak
        const takenDays = new Set();
        pLogs.filter(l => l.outcome === 'Taken').forEach(l => {
          takenDays.add(new Date(l.logged_at).toDateString());
        });
        let streak = 0;
        for (let i = 0; i <= 30; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          if (takenDays.has(d.toDateString())) streak++;
          else if (i > 0) break;
        }

        const vial = vials.find(v => v.protocol_id === p.id);

        return {
          // An ended protocol says so ("BPC-157 · Ended 20 Sep").
          name: isEnded(p) ? `${p.name} · ${t('protocols_ended_on').replace('{date}', formatDate(new Date(p.ended_at || p.updated_at), language, 'dayMonth') || '')}` : p.name,
          dose: `${p.dose ? decimalText(p.dose, language) : '—'} ${p.dose_unit || ''}`,
          frequency: p.frequency || '—',
          taken,
          skipped,
          missed,
          adherence,
          streak,
          vialRemaining: vial ? (vial.total_doses || 0) - (vial.doses_taken || 0) : null,
        };
      });

      // Overall adherence
      const totalAll = stats.overall.total;

      // Build report text
      const userName = user.user_metadata?.display_name || user.email;
      // In the app language, never the device locale (founder 2026-10-02).
      const dateRange = `${formatDate(thirtyDaysAgo, language, 'dayMonth')} – ${formatDate(now, language, 'dayMonthYear')}`;

      let report = `${t('report_header')}\n`;
      report += `${'─'.repeat(40)}\n`;
      report += `${t('report_user').replace('{name}', userName)}\n`;
      report += `${t('report_period').replace('{range}', dateRange)}\n`;
      report += `${fillPercent(t('report_overall'), stats.overall.adherence)}\n`;
      report += `${t('report_active_protocols').replace('{count}', protocols.filter((p) => !isEnded(p)).length)}\n`;
      report += `${t('report_total_logged').replace('{count}', totalAll)}\n`;
      report += `${'─'.repeat(40)}\n\n`;

      protocolStats.forEach(ps => {
        report += `${ps.name}\n`;
        report += `  ${t('report_dose_line').replace('{dose}', ps.dose).replace('{frequency}', ps.frequency)}\n`;
        report += `  ${fillPercent(t('report_outcome_line').replace('{taken}', ps.taken).replace('{skipped}', ps.skipped).replace('{missed}', ps.missed), ps.adherence)}\n`;
        report += `  ${t(pluralKey('report_streak_line', ps.streak, language)).replace('{days}', ps.streak)}\n`;
        if (ps.vialRemaining !== null) {
          report += `  ${t(pluralKey('report_vial_line', ps.vialRemaining, language)).replace('{count}', ps.vialRemaining)}\n`;
        }
        report += `\n`;
      });

      report += `${'─'.repeat(40)}\n`;
      report += `${t('report_generated').replace('{date}', formatDate(now, language, 'long'))}\n`;
      report += `${t('report_footer_1')}\n`;
      report += `${t('report_footer_2')}\n`;

      // Shown first, exactly as it will be sent (Settings part 3); Share opens the system sheet.
      setReportPreview(report);
    } catch (e) {
      errorSheet(friendlyError(e, t));
    }
    setExporting(false);
  }

  // The system share sheet opens only after the preview page has closed (iOS cannot present it
  // over a page sheet). iOS reports the end through onDismiss; elsewhere a short timer.
  function shareReport() {
    pendingShare.current = reportPreview;
    setReportPreview(null);
    if (Platform.OS !== 'ios') setTimeout(runPendingShare, 0);
    else setTimeout(runPendingShare, 900); // fallback if onDismiss never comes
  }
  function runPendingShare() {
    const message = pendingShare.current;
    pendingShare.current = null;
    if (!message) return;
    Share.share({ message, title: t('settings_report_title') }).catch(() => {});
  }

  // Gate B F4: one sign-out at a time; the row shows a spinner while it runs.
  const [signingOut, setSigningOut] = useState(false);
  const signOutGuardRef = useRef(null);
  if (!signOutGuardRef.current) signOutGuardRef.current = createBusyGuard(setSigningOut);
  const signOutGuard = signOutGuardRef.current;

  // Gate B F1: the phone is still signed in (it could not complete the sign-out): say so.
  function showSignOutFailed() {
    setSheet({ icon: 'warning', title: t('settings_signout_failed_title'), body: t('settings_signout_failed_body'), buttons: [{ label: t('ok'), kind: 'primary' }] });
  }

  async function handleSignOut() {
    if (signOutGuard.isBusy()) return;
    setSheet({
      title: t('settings_signout'),
      body: t('settings_signout_confirm_local'),
      buttons: [
        { label: t('cancel'), kind: 'secondary' },
        // The one deliberate sign-out (lib/settingsSignOut → accountActions): push first; if anything
        // is STILL not in the cloud nobody is signed out (never lose data) and the user decides.
        { label: t('settings_signout'), kind: 'danger', onPress: () => runSignOut({
          signOut: (opts) => signOutIntended(opts),
          guard: signOutGuard,
          onFailed: showSignOutFailed,
          onBlocked: (copy, anyway) => setSheet({
            icon: 'warning',
            title: t('settings_signout'),
            body: t(copy.settingsBody),
            buttons: [
              { label: t(copy.stay), kind: 'secondary' },
              { label: t('settings_signout_anyway'), kind: 'danger', onPress: anyway },
            ],
          }),
        }) },
      ],
    });
  }

  function handleDeleteAccount() {
    setSheet({
      title: t('settings_delete'),
      body: t('settings_delete_permanent_msg'),
      buttons: [
        { label: t('cancel'), kind: 'secondary' },
        // Second confirmation — this is irreversible. The sheet runs a button's action
        // after it has closed, so the second sheet opens on its own.
        { label: t('settings_delete_confirm'), kind: 'danger', onPress: () => setSheet({
          title: t('settings_delete_final_title'),
          body: t('settings_delete_final_msg'),
          buttons: [
            { label: t('cancel'), kind: 'secondary' },
            { label: t('settings_delete_final_confirm'), kind: 'danger', onPress: () => executeAccountDeletion() },
          ],
        }) },
      ],
    });
  }

  async function executeAccountDeletion() {
    try {
      // The one delete (lib/accountActions → delete-user: ALL of the user's data rows first,
      // then the auth account), shared with the 18+ confirmation sheet.
      const result = await requestAccountDeletion();
      if (result.noSession) { errorSheet(t('error_no_session')); return; }
      if (result.offline) { errorSheet(t('settings_delete_offline')); return; }

      // The account + data are deleted. If the user signed in with Apple but we
      // had no stored token to auto-revoke (a pre-feature account, or a transient
      // revoke failure), tell them how to remove Apple access themselves — Apple
      // 5.1.1(v) fallback guidance. The deletion itself already succeeded.
      if (result.appleManualRevokeNeeded) {
        setSheet({
          icon: 'check',
          title: t('settings_delete_apple_revoke_title'),
          body: t(Platform.OS === 'android' ? 'settings_delete_apple_revoke_note_android' : 'settings_delete_apple_revoke_note'),
          teardown: true,
          buttons: [{ label: t('done'), kind: 'primary', onPress: runTeardown }],
        });
        return;
      }
      runTeardown();
    } catch (e) {
      errorSheet(friendlyError(e, t, 'error_deletion_failed'));
    }
  }

  // Local teardown after a confirmed server-side deletion. Clears local data and
  // signs out (local scope — the auth account is already gone server-side). The
  // native Google session is fully detached (signOut + revoke) so the deleted
  // account can't be silently re-authenticated; the next Google sign-in shows the
  // chooser + consent, making a new account a conscious choice. (Apple sign-in is
  // revoked server-side in delete-user, or via the guidance note above.)
  async function finishAccountDeletion() {
    return teardownDeletedAccount(); // lib/accountActions: marker, immediate wipe, sign-out (N1 guard), Google revoke
  }

  function handleContactSupport() {
    Linking.openURL('mailto:hello@dosetrace.io?subject=DoseTrace Support');
  }

  function handleRateApp() {
    if (Platform.OS === 'android') {
      Linking.openURL(`market://details?id=${ANDROID_PACKAGE_ID}`).catch(() => {
        Linking.openURL(`https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`);
      });
    } else {
      Linking.openURL(`itms-apps://apps.apple.com/app/id${APPLE_APP_ID}`).catch(() => {
        Linking.openURL(`https://apps.apple.com/app/id${APPLE_APP_ID}`);
      });
    }
  }

  const initials = displayName
    ? displayName.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email ? user.email.slice(0, 2).toUpperCase() : '??';
  const currentLanguage = LANGUAGES.find(l => l.code === language);

  // One render per Settings piece, used by BOTH layouts (the phone list and the book's
  // pages), so a group shows the same rows and actions wherever it is drawn (S-26 BK-7).
  function renderProfileCard() {
    return (
      <TouchableOpacity style={s.profileCard} onPress={() => setShowEditProfile(true)} activeOpacity={0.7}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>
        <View style={s.profileInfo}>
          {displayName ? (
            <Text style={s.profileName}>{displayName}</Text>
          ) : null}
          <Text style={s.profileEmail}>{user?.email || '—'}</Text>
          <View style={s.profileBadgeRow}>
            <View style={s.planBadge}>
              <Text style={s.planBadgeText}>{premium ? t('paywall_premium') : t('settings_free_plan')}</Text>
            </View>
            {primaryGoals.length > 0 ? (
              <View style={s.goalBadge}>
                <Text style={s.goalBadgeText}>{primaryGoals.slice(0, 3).map(g => {
                  const keyMap = { body_composition: 'body', hormonal_balance: 'hormonal', skin_collagen: 'skin', sexual_health: 'sexual', joint_bone: 'joint', cardiovascular: 'cardio' };
                  return t('profile_goal_' + (keyMap[g] || g)) || g;
                }).join(', ')}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <RowChevron color={colors.tick} />
      </TouchableOpacity>
    );
  }

  // Upsell hidden for premium users.
  function renderPremiumCard() {
    if (premium) return null;
    return (
      <View style={s.premiumCard}>
        <Text style={s.premiumTitle}>{t('settings_premium_title')}</Text>
        <Text style={s.premiumSub}>{t('settings_premium_sub')}</Text>
        {[
          t('settings_premium_feat_1'),
          t('settings_premium_feat_2'),
          t('settings_premium_feat_3'),
          t('settings_premium_feat_4'),
          t('settings_premium_feat_5'),
        ].map((f, i) => (
          <View key={i} style={s.premiumFeat}>
            <CheckMark style={s.premiumCheck} />
            <Text style={s.premiumFeatText}>{f}</Text>
          </View>
        ))}
        <TouchableOpacity
          style={s.premiumBtn}
          onPress={() => navigation.navigate('Paywall', { source: 'settings' })}
        >
          <Text style={s.premiumBtnText}>{t('settings_premium_btn')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderVersionFooter() {
    return (
      <Text style={s.version}>
        {`DoseTrace v${Constants.expoConfig?.version || '1.0.0'}`}{'\n'}
        {t('settings_not_medical')}
      </Text>
    );
  }

  function renderNotificationsBody() {
    return (
      <>
        <View style={s.row}>
          <View style={s.rowLeft}>
            <FeatureIcon name="bell" size={28} color={colors.text} />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.rowLabel}>{t('settings_dose_reminders')}</Text>
              <Text style={s.rowSub}>{t('settings_dose_reminders_sub')}</Text>
            </View>
          </View>
          <GradSwitch
            value={doseReminders}
            onValueChange={(v) => toggleNotificationPref('dose_reminders', v, setDoseReminders)}
          />
        </View>
        <View style={s.row}>
          <View style={s.rowLeft}>
            <FeatureIcon name="chat" size={28} color={colors.text} />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.rowLabel}>{t('settings_checkin')}</Text>
              <Text style={s.rowSub}>{t('settings_checkin_sub')}</Text>
            </View>
          </View>
          <GradSwitch
            value={checkinReminders}
            onValueChange={(v) => toggleNotificationPref('checkin_reminders', v, setCheckinReminders)}
          />
        </View>
        <View style={s.row}>
          <View style={s.rowLeft}>
            <FeatureIcon name="food" size={28} color={colors.text} />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.rowLabel}>{t('settings_food_reminders')}</Text>
              <Text style={s.rowSub}>{t('settings_food_reminders_sub')}</Text>
            </View>
          </View>
          <GradSwitch
            value={foodReminders}
            onValueChange={(v) => toggleNotificationPref('food_reminders', v, setFoodReminders)}
          />
        </View>
        <View style={s.row}>
          <View style={s.rowLeft}>
            <FeatureIcon name="lock" size={28} color={colors.text} />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.rowLabel}>{t('settings_notif_names')}</Text>
              <Text style={s.rowSub}>{t('settings_notif_names_sub')}</Text>
            </View>
          </View>
          <GradSwitch
            value={notifNames}
            onValueChange={(v) => toggleNotificationPref('notif_show_names', v, setNotifNames)}
          />
        </View>
        <View style={s.row}>
          <View style={s.rowLeft}>
            <FeatureIcon name="type_vial" size={28} color={colors.text} />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.rowLabel}>{t('settings_vial_alerts')}</Text>
              <Text style={s.rowSub}>{t('settings_vial_alerts_sub')}</Text>
            </View>
          </View>
          <GradSwitch
            value={vialAlerts}
            onValueChange={(v) => toggleNotificationPref('vial_alerts', v, setVialAlerts)}
          />
        </View>
        <View style={s.row}>
          <View style={s.rowLeft}>
            <FeatureIcon name="mute" size={28} color={colors.text} />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.rowLabel}>{t('settings_silent')}</Text>
              <Text style={s.rowSub}>{t('settings_silent_sub')}</Text>
            </View>
          </View>
          <GradSwitch
            value={silentMode}
            onValueChange={(v) => toggleNotificationPref('silent_mode', v, setSilentMode)}
          />
        </View>
        <View style={[s.row, { borderBottomWidth: 0 }]}>
          <View style={s.rowLeft}>
            <FeatureIcon name="repeat" size={28} color={colors.text} />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.rowLabel}>{t('settings_persistent')}</Text>
              <Text style={s.rowSub}>{t('settings_persistent_sub')}</Text>
            </View>
          </View>
          <GradSwitch
            value={persistentReminders}
            onValueChange={(v) => toggleNotificationPref('persistent_reminders', v, setPersistentReminders)}
          />
        </View>
        {/* Android only: battery optimization silently drops scheduled reminders
            while the app is closed. Guide the user to set the app to Unrestricted. */}
        {Platform.OS === 'android' && (
          <TouchableOpacity
            style={[s.row, { borderBottomWidth: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
            onPress={async () => {
              const ok = await openBatteryOptimizationSettings();
              if (!ok) notice(t('settings_reliable_reminders'), t('settings_reliable_reminders_sub'));
            }}
          >
            <View style={s.rowLeft}>
              <FeatureIcon name="help" size={28} color={colors.ink} />
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={s.rowLabel}>{t('settings_reliable_reminders')}</Text>
                <Text style={s.rowSub}>{t('settings_reliable_reminders_sub')}</Text>
              </View>
            </View>
            <RowChevron color={colors.tick} />
          </TouchableOpacity>
        )}
      </>
    );
  }

  function renderPrivacyBody() {
    return (
      <>
        <TouchableOpacity style={s.row} onPress={() => setShowPrivacy(true)}>
          <View style={s.rowLeft}>
            <FeatureIcon name="lock" size={28} color={colors.text} />
            <Text style={s.rowLabel}>{t('settings_privacy_policy')}</Text>
          </View>
          <RowChevron color={colors.tick} />
        </TouchableOpacity>
        <TouchableOpacity style={s.row} onPress={() => setShowTerms(true)}>
          <View style={s.rowLeft}>
            <FeatureIcon name="clipboard" size={28} color={colors.text} />
            <Text style={s.rowLabel}>{t('settings_terms')}</Text>
          </View>
          <RowChevron color={colors.tick} />
        </TouchableOpacity>
        <TouchableOpacity style={s.row} onPress={() => setShowDisclaimer(true)}>
          <View style={s.rowLeft}>
            <FeatureIcon name="shield" size={28} color={colors.text} />
            <Text style={s.rowLabel}>{t('settings_disclaimer')}</Text>
          </View>
          <RowChevron color={colors.tick} />
        </TouchableOpacity>
        <View style={s.row}>
          <View style={s.rowLeft}>
            <FeatureIcon name="calc_bars" size={28} color={colors.text} />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.rowLabel}>{t('settings_analytics')}</Text>
              <Text style={s.rowSub}>{t('settings_analytics_sub')}</Text>
            </View>
          </View>
          <GradSwitch
            value={analyticsEnabled}
            onValueChange={toggleAnalytics}
          />
        </View>
        <TouchableOpacity
          style={s.row}
          onPress={handleAdherenceReport}
          disabled={exporting}
        >
          <View style={s.rowLeft}>
            <FeatureIcon name="calc_trend" size={28} color={colors.text} />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.rowLabel}>{t('settings_report_title')}</Text>
              <Text style={s.rowSub}>{t('settings_report_sub')}</Text>
            </View>
          </View>
          {exporting ? <Text style={s.rowArrow}>...</Text> : <RowChevron color={colors.tick} />}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.row, { borderBottomWidth: 0 }]}
          onPress={handleExportData}
          disabled={exporting}
        >
          <View style={s.rowLeft}>
            <FeatureIcon name="download" size={28} color={colors.text} />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.rowLabel}>{t('settings_export_title')}</Text>
              <Text style={s.rowSub}>{t('settings_export_sub')}</Text>
            </View>
          </View>
          {exporting ? <Text style={s.rowArrow}>...</Text> : <RowChevron color={colors.tick} />}
        </TouchableOpacity>
      </>
    );
  }

  function renderSupportBody() {
    return (
      <>
        <TouchableOpacity style={s.row} onPress={() => navigation.navigate('FAQ')}>
          <View style={s.rowLeft}>
            <FeatureIcon name="help" size={28} color={colors.text} />
            <Text style={s.rowLabel}>{t('settings_faq')}</Text>
          </View>
          <RowChevron color={colors.tick} />
        </TouchableOpacity>
        <TouchableOpacity style={s.row} onPress={handleContactSupport}>
          <View style={s.rowLeft}>
            <FeatureIcon name="mail" size={28} color={colors.text} />
            <Text style={s.rowLabel}>{t('settings_contact')}</Text>
          </View>
          <RowChevron color={colors.tick} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.row, { borderBottomWidth: 0 }]}
          onPress={handleRateApp}
        >
          <View style={s.rowLeft}>
            <FeatureIcon name="star" size={28} color={colors.text} />
            <Text style={s.rowLabel}>{t('settings_rate')}</Text>
          </View>
          <RowChevron color={colors.tick} />
        </TouchableOpacity>
      </>
    );
  }

  // Preferences (prototype: Appearance, Time format, Language). Sign out and Delete account
  // are not here any more: they have their own card under the groups.
  function renderAccountBody() {
    return (
      <>
        <View style={s.setStack}>
          <View style={s.setStackHead}>
            <FeatureIcon name="palette" size={28} color={colors.text} />
            <Text style={s.rowLabel}>{t('settings_appearance')}</Text>
          </View>
          <SegmentedBar
            accessibilityLabel={t('settings_appearance')}
            items={[
              { key: 'light', label: t('settings_theme_light') },
              { key: 'dark', label: t('settings_theme_dark') },
              { key: 'system', label: t('settings_theme_system') },
            ]}
            value={mode}
            onChange={setMode}
          />
        </View>
        <View style={s.setStack}>
          <View style={s.setStackHead}>
            <FeatureIcon name="clock" size={28} color={colors.text} />
            <Text style={s.rowLabel}>{t('settings_time_format')}</Text>
          </View>
          <SegmentedBar
            accessibilityLabel={t('settings_time_format')}
            items={[
              { key: 'auto', label: t('settings_time_auto') },
              { key: '12h', label: t('settings_time_12h') },
              { key: '24h', label: t('settings_time_24h') },
            ]}
            value={timeFormat}
            onChange={setTimeFormat}
          />
        </View>
        <TouchableOpacity style={[s.row, { borderBottomWidth: 0 }]} onPress={() => setShowLanguagePicker(true)}>
          <View style={s.rowLeft}>
            <FeatureIcon name="globe" size={28} color={colors.text} />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.rowLabel}>{t('settings_language')}</Text>
              <Text style={s.rowSub}>{currentLanguage?.native || 'English'}</Text>
            </View>
          </View>
          <RowChevron color={colors.tick} />
        </TouchableOpacity>
      </>
    );
  }

  const GROUP_BODIES = {
    account: renderAccountBody,
    notifications: renderNotificationsBody,
    privacy: renderPrivacyBody,
    support: renderSupportBody,
  };
  function renderGroupBody(key) {
    const fn = GROUP_BODIES[key];
    return fn ? fn() : null;
  }

  // Prototype setSection(): one card per group. The header carries the group name, a one-line
  // summary of what is inside and a round arrow; the rows open inside the same card. Open /
  // closed is remembered (all closed at first).
  function renderGroupCard(g) {
    const open = !collapsed[g.key];
    return (
      <View key={g.key} style={s.setCard}>
        <TouchableOpacity
          style={[s.setHead, open && s.setHeadOpen]}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => toggleSection(g.key)}
          onLayout={(e) => onSectionHeaderLayout(g.key, e)}
        >
          <View style={s.setHeadText}>
            <Text style={s.setTitle}>{t(g.labelKey)}</Text>
            <Text style={s.setSum}>{t(g.sumKey)}</Text>
          </View>
          <View style={s.setChev}>
            <GroupChevron dir={open ? 'up' : 'down'} color={colors.ink} />
          </View>
        </TouchableOpacity>
        {open && renderGroupBody(g.key)}
      </View>
    );
  }

  // Prototype: Sign out, then Delete account (risk color), alone in their own card under the
  // groups, on both layouts.
  function renderAccountActions() {
    return (
      <View style={s.actionsCard}>
        <TouchableOpacity style={s.row} onPress={handleSignOut} accessibilityRole="button">
          <View style={s.rowLeft}>
            <FeatureIcon name="door" size={28} color={colors.ink} />
            <Text style={s.rowLabel}>{t('settings_signout')}</Text>
          </View>
          {signingOut ? <ActivityIndicator color={colors.ink} /> : <RowChevron color={colors.tick} />}
        </TouchableOpacity>
        <TouchableOpacity style={[s.row, { borderBottomWidth: 0 }]} onPress={handleDeleteAccount} accessibilityRole="button">
          <View style={s.rowLeft}>
            <FeatureIcon name="trash" size={28} color={colors.risk} />
            <Text style={[s.rowLabel, { color: colors.risk }]}>{t('settings_delete')}</Text>
          </View>
          <RowChevron color={colors.risk} />
        </TouchableOpacity>
      </View>
    );
  }

  // BK-2: one column = the approved Settings (prototype settingsScreen()): title, profile,
  // Premium (free users), the four group cards, the Sign out / Delete account card, version.
  function renderPhone() {
    return (
      <>
        <View style={s.header}>
          <Text style={s.headerTitle}>{t('settings_title')}</Text>
        </View>

        <ScrollView ref={phoneScrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={s.centered}>
          {renderProfileCard()}
          {renderPremiumCard()}

          <View style={s.setCards}>
            {SETTINGS_GROUPS.map(g => renderGroupCard(g))}
          </View>

          {renderAccountActions()}

          {renderVersionFooter()}

          <View style={{ height: 40 }} />
        </ScrollView>
      </>
    );
  }

  // BK-7: left page = title, profile, Premium (free users), the group list in the same order
  // with the open group outlined in ink (BK-8), the Sign out / Delete account card and the
  // version; right page = that group, always open.
  function renderBook() {
    const open = bookGroup(sel);
    const openGroup = SETTINGS_GROUPS.find(g => g.key === open);
    const left = (
      <>
        <View style={s.header}>
          <Text style={s.headerTitle}>{t('settings_title')}</Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.centered}>
          {renderProfileCard()}
          {renderPremiumCard()}
          <View style={s.bookNav}>
            {SETTINGS_GROUPS.map(g => {
              const on = g.key === open;
              return (
                <TouchableOpacity
                  key={g.key}
                  style={[s.bookNavRow, on && s.bookNavRowOn]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => select(g.key)}
                >
                  <View style={s.setHeadText}>
                    <Text style={[s.bookNavLabel, on && s.bookNavLabelOn]} numberOfLines={2}>{t(g.labelKey)}</Text>
                    <Text style={s.setSum} numberOfLines={2}>{t(g.sumKey)}</Text>
                  </View>
                  <RowChevron color={colors.tick} />
                </TouchableOpacity>
              );
            })}
          </View>
          {renderAccountActions()}
          {renderVersionFooter()}
          <View style={{ height: 40 }} />
        </ScrollView>
      </>
    );
    const right = (
      <>
        <View style={s.header}>
          <Text style={s.bookPageTitle} numberOfLines={2}>{t(openGroup.labelKey)}</Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.centered, s.bookRightBody]}>
          <View style={s.group}>{renderGroupBody(open)}</View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </>
    );
    return <BookPanes left={left} right={right} rightKey={open} />;
  }

  return (
    <SafeAreaView style={s.container}>
      {/* The sheets below sit outside both layouts, so a fold or unfold never closes
          one or drops what was typed in it (BK-10). */}
      {book ? renderBook() : renderPhone()}

      {/* The screen's DoseTrace sheet. While Edit profile is up its own sheet (below, inside it)
          is the one shown, so two popups are never stacked side by side (M1). */}
      <DTSheet config={showEditProfile ? null : sheet} onClose={closeSheet} />

      {/* ADHERENCE REPORT PREVIEW (Settings part 3) */}
      <Modal
        visible={!!reportPreview}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReportPreview(null)}
        onDismiss={runPendingShare}
      >
        <SafeAreaView style={s.modal}>
          <View style={s.modalNav}>
            <TouchableOpacity onPress={() => setReportPreview(null)} style={{ minWidth: 60 }} accessibilityRole="button">
              <Text style={s.modalCancel}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle} numberOfLines={1}>{t('settings_report_title')}</Text>
            <View style={{ minWidth: 60 }} />
          </View>
          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={s.sheetIntro}>{t('settings_report_preview_note')}</Text>
            <View style={s.reportPaper}>
              <Text style={s.reportText} selectable>{reportShown}</Text>
            </View>
            <View style={{ height: 24 }} />
          </ScrollView>
          <View style={s.reportFoot}>
            <TouchableOpacity style={s.premiumBtn} onPress={shareReport} accessibilityRole="button">
              <Text style={s.premiumBtnText}>{t('settings_report_share')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* LANGUAGE PICKER MODAL */}
      <Modal
        visible={showLanguagePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLanguagePicker(false)}
      >
        <SafeAreaView style={s.modal}>
          <View style={s.modalNav}>
            <View style={{ minWidth: 60 }} />
            <Text style={s.modalTitle}>{t('settings_language')}</Text>
            <TouchableOpacity
              onPress={() => setShowLanguagePicker(false)}
              style={{ minWidth: 60, alignItems: 'flex-end' }}
            >
              <Text style={s.modalClose} numberOfLines={1}>{t('done')}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={s.sheetIntro}>
              {t('settings_language_sub')}
            </Text>
            {/* A language CODE tile (EN, ES…) instead of the flag emoji: no emoji in
                the UI (founder-approved, prototype .lcode). The selected language
                carries the ink check. */}
            {LANGUAGES.map((lang, idx) => (
              <TouchableOpacity
                key={lang.code}
                style={[s.langRow, idx > 0 && s.sheetDivider]}
                accessibilityRole="button"
                accessibilityState={{ selected: language === lang.code }}
                onPress={() => {
                  setLanguage(lang.code);
                  setShowLanguagePicker(false);
                }}
              >
                <View style={s.langCode}>
                  <Text style={s.langCodeText}>{lang.code.toUpperCase()}</Text>
                </View>
                <View style={s.langInfo}>
                  <Text style={s.langNative}>{lang.native}</Text>
                  {/* The language's name in the app's language (m9); no repeat of the main label. */}
                  {t(`lang_name_${lang.code}`) !== lang.native ? (
                    <Text style={s.langName}>{t(`lang_name_${lang.code}`)}</Text>
                  ) : null}
                </View>
                {language === lang.code && (
                  <CheckMark style={s.langCheck} />
                )}
              </TouchableOpacity>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* LEGAL MODALS */}
      <LegalModal
        visible={showDisclaimer}
        onClose={() => setShowDisclaimer(false)}
        title={t('settings_disclaimer')}
        content={t('settings_disclaimer_body')}
        doneLabel={t('done')}
      />
      <LegalModal
        visible={showPrivacy}
        onClose={() => setShowPrivacy(false)}
        title={t('settings_privacy_policy')}
        content={t('settings_privacy_body')}
        doneLabel={t('done')}
      />
      <LegalModal
        visible={showTerms}
        onClose={() => setShowTerms(false)}
        title={t('settings_terms')}
        content={t('settings_terms_body')}
        doneLabel={t('done')}
      />

      {/* EDIT PROFILE MODAL */}
      <Modal
        visible={showEditProfile}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowCountryPicker(false); setShowEditProfile(false); fetchUser(); }}
      >
        <SafeAreaView style={s.modal}>
          <View style={s.modalNav}>
            <TouchableOpacity onPress={() => { setShowCountryPicker(false); setShowEditProfile(false); fetchUser(); }} style={{ minWidth: 60 }}>
              <Text style={s.modalCancel}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>{t('profile_edit_title')}</Text>
            <TouchableOpacity onPress={saveProfile} style={{ minWidth: 60, alignItems: 'flex-end' }}>
              <Text style={s.modalClose}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
            {/* ── About you ─────────────────────────────────────────── */}
            <Text style={[s.editSection, s.editSectionFirst]}>{t('profile_sec_about')}</Text>

            <View style={s.editField}>
              <Text style={s.editLabel}>{t('profile_name')}</Text>
              <TextInput
                style={s.editInput}
                placeholder={t('profile_name_placeholder')}
                placeholderTextColor={colors.ink3}
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            <View style={s.editField}>
              <Text style={s.editLabel}>{t('profile_birth_month')}</Text>
              {/* 4-across uniform month grid — same shape as onboarding. */}
              <View style={s.editMGrid}>
                {MONTH_KEYS.map((mk, idx) => (
                  <TouchableOpacity
                    key={mk}
                    style={[s.editMChip, birthMonth === idx && s.editPillOn]}
                    onPress={() => setBirthMonth(idx)}
                  >
                    <Text style={[s.editPillText, birthMonth === idx && s.editPillTextOn]}>{t(mk)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.editField}>
              <Text style={s.editLabel}>{t('profile_birth_year')}</Text>
              <TextInput
                style={s.editInput}
                placeholder={t('profile_birth_year_ph')}
                placeholderTextColor={colors.ink3}
                value={birthYearText}
                onChangeText={(txt) => {
                  const digits = txt.replace(/[^0-9]/g, '').slice(0, 4);
                  setBirthYearText(digits);
                  const n = parseInt(digits, 10);
                  const max = new Date().getFullYear() - 18;
                  setBirthYear(digits.length === 4 && n >= 1900 && n <= max ? n : null);
                }}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>

            <View style={s.editField}>
              <Text style={s.editLabel}>{t('profile_sex')}</Text>
              {/* Two options → a segmented well (prototype profSheet), same values. */}
              <SegmentedBar
                accessibilityLabel={t('profile_sex')}
                items={[
                  { key: 'male', label: t('profile_gender_male') },
                  { key: 'female', label: t('profile_gender_female') },
                ]}
                value={gender}
                onChange={setGender}
              />
              <Text style={s.sexHelp}>{t('profile_sex_help')}</Text>
            </View>

            <View style={s.editField}>
              <Text style={s.editLabel}>{t('profile_country')}</Text>
              <TouchableOpacity
                style={s.editPick}
                accessibilityRole="button"
                onPress={() => { setCountrySearch(''); setShowCountryPicker(true); }}
              >
                <Text style={[s.editPickText, !country && s.editPickPlaceholder]} numberOfLines={1}>
                  {country ? countryLabel(country, language) : t('profile_country_placeholder')}
                </Text>
                <RowChevron color={colors.tick} />
              </TouchableOpacity>
            </View>

            {/* ── Your goals ────────────────────────────────────────── */}
            <Text style={s.editSection}>{t('profile_sec_goals')}</Text>

            <View style={s.editField}>
              <Text style={s.editLabel}>{t('profile_goal')}</Text>
              <Text style={s.editHint}>{t('profile_goal_multi_hint')}</Text>
              <View style={s.editRow}>
                {goalOptions(t).map(g => {
                  const selected = primaryGoals.includes(g.key);
                  return (
                    <TouchableOpacity
                      key={g.key}
                      style={[s.editPill, selected && s.editPillOn]}
                      onPress={() => {
                        setPrimaryGoals(prev =>
                          prev.includes(g.key)
                            ? prev.filter(k => k !== g.key)
                            : [...prev, g.key]
                        );
                      }}
                    >
                      <Text style={[s.editPillText, selected && s.editPillTextOn]}>{g.label}</Text>
                    </TouchableOpacity>
                  );
                })}
                {/* Legacy goal keys not in the current 18 (e.g. an old "athletic")
                    still render selected so the user can see and keep/remove them —
                    never a silent, invisible selection. */}
                {primaryGoals.filter(k => !goalOptions(t).some(g => g.key === k)).map(k => (
                  <TouchableOpacity
                    key={k}
                    style={[s.editPill, s.editPillOn]}
                    onPress={() => setPrimaryGoals(prev => prev.filter(x => x !== k))}
                  >
                    <Text style={[s.editPillText, s.editPillTextOn]}>{t('profile_goal_' + k) || k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.editField}>
              <Text style={s.editLabel}>{t('profile_activity')}</Text>
              {/* One activity scale everywhere (Q3 = A, A-54): the calculator's 5 levels, a bold
                  title and its sub-line, as onboarding "Your routine". An old 4-level value is
                  shown on its new level (lib/activityLevels) and saved as the new key. */}
              <View style={s.actList}>
                {PROFILE_ACTIVITY.map((a, i) => {
                  const on = activityLevel === a.key;
                  const prevOn = i > 0 && activityLevel === PROFILE_ACTIVITY[i - 1].key;
                  const parts = activityParts(t(a.labelKey));
                  return (
                    <View key={a.key}>
                      {i > 0 && <View style={[s.actDiv, (on || prevOn) && s.actDivHidden]} />}
                      <TouchableOpacity style={[s.actRow, on && s.actRowOn]} onPress={() => setActivityLevel(a.key)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                        <View style={s.actTexts}>
                          <Text style={s.actText}>{parts[0]}</Text>
                          {parts[1] ? <Text style={s.actSub}>{parts[1]}</Text> : null}
                        </View>
                        {on && <CheckMark size={22} color={colors.ink} />}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={s.editField}>
              <Text style={s.editLabel}>{t('profile_provider')}</Text>
              <SegmentedBar
                accessibilityLabel={t('profile_provider')}
                items={[
                  { key: 'yes', label: t('profile_provider_yes') },
                  { key: 'no', label: t('profile_provider_no') },
                ]}
                value={hasProvider}
                onChange={setHasProvider}
              />
            </View>

            <Text style={s.editDisclaimer}>{t('profile_data_note')}</Text>
            <View style={{ height: 40 }} />
          </ScrollView>

          <DTSheet config={editSheet} onClose={() => setEditSheet(null)} />

          {/* COUNTRY PICKER: presented FROM the Edit profile sheet (nested), never as a
              sibling of it. iOS refuses a second sibling pageSheet ("already presenting") and
              the stuck state then blocked every later Settings sheet (pre-build pass M1). */}
          <Modal visible={showCountryPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCountryPicker(false)}>
            <SafeAreaView style={s.modal}>
              <View style={s.modalNav}>
                <View style={{ minWidth: 60 }} />
                <Text style={s.modalTitle}>{t('profile_country')}</Text>
                <TouchableOpacity
                  onPress={() => setShowCountryPicker(false)}
                  style={{ minWidth: 60, alignItems: 'flex-end' }}
                >
                  <Text style={s.modalClose}>{t('done')}</Text>
                </TouchableOpacity>
              </View>
              <View style={[s.centered, s.searchWrapOuter]}>
                <View style={s.searchWrap}>
                  <FeatureIcon name="search" size={18} color={colors.ink3} />
                  <TextInput
                    style={s.searchInput}
                    placeholder={t('profile_country_search')}
                    placeholderTextColor={colors.ink3}
                    value={countrySearch}
                    onChangeText={setCountrySearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                  />
                </View>
              </View>
              <FlatList
                data={COUNTRIES.filter(c => {
                  const q = countrySearch.toLowerCase();
                  return c.toLowerCase().includes(q) || countryLabel(c, language).toLowerCase().includes(q);
                })}
                keyExtractor={item => item}
                style={{ flex: 1 }}
                contentContainerStyle={[s.centered, { paddingHorizontal: 20 }]}
                keyboardShouldPersistTaps="handled"
                ItemSeparatorComponent={() => <View style={s.sheetDivider} />}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={s.countryRow}
                    accessibilityRole="button"
                    accessibilityState={{ selected: country === item }}
                    onPress={() => {
                      setCountry(item);
                      setShowCountryPicker(false);
                    }}
                  >
                    <Text style={s.countryName}>{countryLabel(item, language)}</Text>
                    {country === item && <CheckMark style={s.langCheck} />}
                  </TouchableOpacity>
                )}
              />
            </SafeAreaView>
          </Modal>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  ...settingsLegacy(c),
  ...settingsGraduated(c),
});

const settingsLegacy = (c) => ({
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  container: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: 20, paddingVertical: 20, backgroundColor: c.card },
  headerTitle: { fontSize: 24, fontWeight: '700', color: c.text },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, margin: 16, padding: 16, backgroundColor: c.card, borderRadius: 14, ...c.shadowSoft },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  profileInfo: { flex: 1 },
  profileEmail: { fontSize: 14, fontWeight: '500', color: c.text, marginBottom: 4 },
  planBadge: { backgroundColor: c.accentSoft, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' },
  planBadgeText: { fontSize: 11, color: c.accentSoftText, fontWeight: '500' },
  premiumCard: { marginHorizontal: 16, marginBottom: 8, padding: 16, backgroundColor: c.accent, borderRadius: 14 },
  premiumTitle: { fontSize: 16, fontWeight: '600', color: 'white', marginBottom: 6 },
  premiumSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 14, lineHeight: 18 },
  premiumFeat: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  premiumCheck: { color: '#9FE1CB', fontWeight: '600', fontSize: 13 },
  premiumFeatText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', flex: 1 },
  premiumBtn: { backgroundColor: 'white', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  premiumBtnText: { color: '#185FA5', fontSize: 13, fontWeight: '600' },
  group: { marginHorizontal: 16, backgroundColor: c.card, borderRadius: 14, overflow: 'hidden', ...c.shadowSoft },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIcon: { fontSize: 18, width: 28, textAlign: 'center' },
  rowLabel: { fontSize: 14, color: c.text },
  rowSub: { fontSize: 11, color: c.textFaint, marginTop: 1 },
  rowArrow: { fontSize: 18, color: c.textFaint },
  version: { textAlign: 'center', fontSize: 11, color: c.textFaint, marginTop: 24, lineHeight: 18 },
  // Theme toggle
  // Profile enhancements
  profileName: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 2 },
  profileBadgeRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  goalBadge: { backgroundColor: c.warningSoft, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  goalBadgeText: { fontSize: 11, color: c.warningSoftText, fontWeight: '500' },
});

// Redesign (Graduated, Settings approved 2026-09-29): large title on the ground; the
// profile and every group are plain raised cards (no shadow); group titles in sentence
// case (no uppercase letter-spaced labels); the Premium card is a plain card with the
// one action in ink (no blue block, no hardcoded white).
const settingsGraduated = (c) => ({
  container: { flex: 1, backgroundColor: c.ground },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6, backgroundColor: c.ground },
  headerTitle: { fontSize: 34, fontWeight: '700', color: c.ink, letterSpacing: -0.8 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginTop: 12, marginBottom: 8, padding: 16, backgroundColor: c.raised, borderRadius: 22 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: c.onInk, fontSize: 19, fontWeight: '700' },
  profileEmail: { fontSize: 15, fontWeight: '400', color: c.ink2, marginBottom: 6 },
  planBadge: { borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 13, alignSelf: 'flex-start' },
  planBadgeText: { fontSize: 12, color: c.ink2, fontWeight: '500' },
  premiumCard: { marginHorizontal: 16, marginBottom: 8, padding: 18, backgroundColor: c.raised, borderRadius: 22 },
  premiumTitle: { fontSize: 20, fontWeight: '700', color: c.ink, marginBottom: 6 },
  premiumSub: { fontSize: 15, color: c.ink2, marginBottom: 14, lineHeight: 20 },
  premiumCheck: { color: c.data, fontWeight: '600', fontSize: 15 },
  premiumFeatText: { fontSize: 15, color: c.ink, flex: 1 },
  premiumBtn: { backgroundColor: c.act, minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  premiumBtnText: { color: c.onAct, fontSize: 17, fontWeight: '700' },
  group: { marginHorizontal: 16, backgroundColor: c.raised, borderRadius: 22, overflow: 'hidden' },
  // Prototype .list (padding 0 16) + .li: rows and their 1 pt dividers sit inside the card margin.
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginHorizontal: 16, paddingHorizontal: 0, minHeight: 60, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line },
  rowLabel: { fontSize: 17, color: c.ink },
  rowSub: { fontSize: 13, color: c.ink2, marginTop: 2 },
  rowArrow: { fontSize: 20, color: c.tick },
  version: { textAlign: 'center', fontSize: 13, color: c.ink3, marginTop: 24, lineHeight: 18 },
  profileName: { fontSize: 22, fontWeight: '600', color: c.ink, marginBottom: 2 },
  goalBadge: { borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 13, flexShrink: 1 },
  goalBadgeText: { fontSize: 12, color: c.ink2, fontWeight: '500' },

  // Group cards (prototype .setcard / .setsec / .setchev): one raised card per group; the
  // header holds the name (headline), a one-line summary (footnote, ink2) and the arrow in a
  // 36 pt round well; when open a hairline separates the header from the rows inside.
  setCards: { marginHorizontal: 16, marginTop: 14, gap: 10 },
  setCard: { backgroundColor: c.raised, borderRadius: 22, overflow: 'hidden' },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, marginHorizontal: 16, paddingHorizontal: 0, paddingVertical: 6 },
  // Prototype .setstack: the label row (52 pt, no divider) and under it the full-width bar.
  setStack: { marginHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.line },
  setStackHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  setHeadOpen: { borderBottomWidth: 1, borderBottomColor: c.line },
  setHeadText: { flex: 1, gap: 3 },
  setTitle: { fontSize: 17, fontWeight: '600', color: c.ink },
  setSum: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  setChev: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
  // Sign out / Delete account: their own card under the groups (prototype S-out).
  actionsCard: { marginHorizontal: 16, marginTop: 18, backgroundColor: c.raised, borderRadius: 22, overflow: 'hidden' },

  // Book layout (S-26 BK-7/BK-8): the left page lists the groups as raised rows; the open
  // one carries the 1.5 pt ink outline (selection, DESIGN.md) and a semibold label. The
  // unselected rows keep a clear 1.5 pt border so the outline never shifts the text.
  // The right page's heading is the open group's title.
  bookNav: { marginHorizontal: 16, marginTop: 14, gap: 8 },
  bookNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18, backgroundColor: c.raised, borderWidth: 1.5, borderColor: 'transparent' },
  bookNavRowOn: { borderColor: c.ink },
  bookNavLabel: { fontSize: 17, fontWeight: '400', color: c.ink },
  bookNavLabelOn: { fontWeight: '600' },
  bookPageTitle: { fontSize: 28, lineHeight: 41, fontWeight: '700', color: c.ink, letterSpacing: -0.4 },
  bookRightBody: { paddingTop: 12 },

  // ── Sheets (Settings part 2: language, edit profile, country) ──────────────
  // A sheet is one raised surface: plain text buttons in ink (Cancel regular, Save /
  // Done semibold), a 17 pt headline title, no hairline under the bar, no blue.
  modal: { flex: 1, backgroundColor: c.raised },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 20, minHeight: 56, paddingVertical: 6 },
  modalTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: c.ink },
  modalClose: { fontSize: 17, fontWeight: '600', color: c.ink },
  modalCancel: { fontSize: 17, fontWeight: '400', color: c.ink },
  modalBody: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8 },
  sheetIntro: { fontSize: 15, lineHeight: 20, color: c.ink2, marginBottom: 8 },
  // The adherence report as it will be sent: plain text on a well "paper", mono for the columns.
  reportPaper: { backgroundColor: c.well, borderRadius: 14, padding: 16, marginTop: 4 },
  reportText: { fontFamily: MONO['500'], fontSize: 12, lineHeight: 18, color: c.ink },
  reportFoot: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  sheetDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },

  // Language picker (prototype langSheet): plain rows with a hairline between, the
  // language CODE in a well tile (.lcode), native name as the headline, English name
  // under it, ink check on the current one.
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 10 },
  langCode: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
  langCodeText: { fontFamily: MONO['500'], fontSize: 13, color: c.ink },
  langInfo: { flex: 1, gap: 2 },
  langNative: { fontSize: 17, fontWeight: '600', color: c.ink },
  langName: { fontSize: 13, color: c.ink2 },
  langCheck: { fontSize: 22, color: c.ink },

  // Country picker (prototype countrySheet): a search field with the search glyph,
  // plain rows, ink check.
  searchWrapOuter: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.raised, borderWidth: 1, borderColor: c.line },
  searchInput: { flex: 1, fontSize: 17, color: c.ink, paddingVertical: 10 },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  countryName: { flex: 1, fontSize: 17, color: c.ink },

  // Edit profile (prototype profSheet): Geist section titles, footnote field labels in
  // ink2 (sentence case), outlined inputs, outline pills (selected = 1.5 pt ink on
  // raised), the two-option questions as a segmented well, country as a well picker.
  editSection: { fontSize: 22, fontWeight: '600', color: c.ink, letterSpacing: -0.2, marginTop: 28 },
  editSectionFirst: { marginTop: 4 },
  editField: { marginTop: 18 },
  editLabel: { fontSize: 13, lineHeight: 18, fontWeight: '400', color: c.ink2, marginBottom: 10, paddingHorizontal: 4 },
  editHint: { fontSize: 13, lineHeight: 18, color: c.ink2, marginTop: -6, marginBottom: 10, paddingHorizontal: 4 },
  sexHelp: { fontSize: 13, lineHeight: 18, color: c.ink2, marginTop: 10, paddingHorizontal: 4 },
  editInput: { minHeight: 50, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: c.ink, backgroundColor: c.raised, borderWidth: 1, borderColor: c.line },
  editPick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 48, borderRadius: 14, paddingHorizontal: 14, backgroundColor: c.well },
  editPickText: { flex: 1, fontSize: 17, color: c.ink },
  editPickPlaceholder: { color: c.ink3 },
  editRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editMGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editMChip: { width: '22%', flexGrow: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: c.line },
  actList: { backgroundColor: c.raised, borderRadius: 16, borderWidth: 1, borderColor: c.line, overflow: 'hidden' },
  actRow: { minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 2, borderColor: c.raised },
  actRowOn: { borderColor: c.ink },
  actDiv: { height: 1, backgroundColor: c.line },
  actDivHidden: { backgroundColor: c.raised },
  actTexts: { flex: 1, gap: 2 },
  actText: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  actSub: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  editPill: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: c.line },
  editPillOn: { backgroundColor: c.raised, borderColor: c.ink, borderWidth: 1.5 },
  editPillText: { fontSize: 15, color: c.ink2, fontWeight: '400' },
  editPillTextOn: { color: c.ink, fontWeight: '600' },
  editDisclaimer: { fontSize: 13, lineHeight: 18, color: c.ink3, marginTop: 24, paddingHorizontal: 4 },
});
