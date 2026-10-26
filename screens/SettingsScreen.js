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
  Linking,
  Share,
  TextInput,
  FlatList,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Modal from '../components/PresenceModal';
import Svg, { Path } from 'react-native-svg';
import GradSwitch from '../components/GradSwitch';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TAB_SCREEN_EDGES } from '../lib/tabBarStyle';
import { useFocusEffect } from '@react-navigation/native';
import { supabase, getCachedUser } from '../lib/supabase';
import { clearAnalyticsQueue, noteAnalyticsChoice } from '../lib/analytics';
import { useLanguage } from '../i18n/LanguageContext';
import { fillStoreText, storeKey } from '../lib/storeText';
import { formatDate, decimalText, unitText } from '../lib/localeFormat';
import { useTheme } from '../lib/theme';
import FeatureIcon from '../components/FeatureIcon';
import RowChevron from '../components/RowChevron';
import SegmentedBar from '../components/SegmentedBar';
import useKeyboardLift from '../components/useKeyboardLift';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import {
  getHistoryProtocols,
  getLogsSince, getActiveVials as getLocalVials,
} from '../lib/database';
import { hasPremium, getBillingStore } from '../lib/entitlement';
import { usePremiumUpdates } from '../lib/usePremium';
import { isEnded, reportProtocols } from '../lib/protocolEnd';
import { loggedOnly } from '../lib/declared';
import { COUNTRIES, countryLabel } from '../lib/countries';
import { syncAllNotifications, readReminderHealth, registerPushToken, askNotificationPermission, notificationsGranted } from '../lib/notifications';
import { updateFlow } from '../lib/updateRuntime';
import { reminderChecks, scheduleState, blockingCount, setupRowState } from '../lib/reminderHealth';
import { formatTime } from '../lib/timeFormat';
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
import { scanMissedDoses, unsyncedState, unrecordedGapsWithMisses } from '../lib/doseActions';
import { readUnrecordedGaps } from '../lib/pullStamp';
import { heldByProtocol, reportGaps, fillDate } from '../lib/unsyncedDoses';
import { forceSync } from '../lib/sync';
import { DTSheet } from './components/ProtocolParts';
import { exportMyData, requestAccountDeletion, finishAccountDeletion as teardownDeletedAccount, signOutIntended } from '../lib/accountActions';
import { signOutSheet } from '../lib/deviceCopy';
import { protocolDisplayName } from '../lib/protocolName';
import { hasAIConsent, grantAIConsent, revokeAIConsent, AI_PRIVACY_URL } from '../lib/aiConsent';
import { createAIUseSwitch } from '../lib/aiUseSwitch';
import { teamMessages, settingsRow, settingsRowLine } from '../lib/teamMessages';
import { useTeamMessages } from '../lib/useTeamMessages';

// A-123: the report's Missed scan waits for the session's first sync result at most this long, then
// the report is made from the rows already on the phone (no scan from a half-synced phone). The
// button shows its spinner meanwhile; a first sync normally ends within a couple of seconds, and
// without a cap a stalled network (no answer, no error) would hang the export.
const REPORT_SCAN_WAIT_MS = 5000;
const APPLE_APP_ID = '6761788157'; // App Store Connect app ID (io.outcom.dosetrace)
const ANDROID_PACKAGE_ID = 'io.outcom.dosetrace';

// Delete account UI (founder 2026-10-17 "1 B, 2, 3 C", docs/design/delete-account-wait.html).
// 3 C: the store's own subscriptions page, the running platform's only (guideline 2.3.10).
function manageSubscriptionsUrl(os) {
  return os === 'android'
    ? `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE_ID}`
    : 'https://apps.apple.com/account/subscriptions';
}

// 3 C: the first delete sheet. A store subscription that will renew (store: lib/entitlement
// getBillingStore — APP_STORE | PLAY_STORE, Gate B of 5cb065f) adds that deleting does not cancel
// it, where to cancel in THAT store, and "Manage subscription", which opens its page and leaves
// the sheet up. No store subscription (free, promotional, Lifetime, cancelled, unknown): as before.
// Guideline 2.3.10: the iOS app never names Google Play, so on iOS a Play subscription shows nothing.
function deleteAccountSheet({ t, store, platform, onConfirm, openUrl }) {
  const os = store === 'APP_STORE' ? 'ios' : store === 'PLAY_STORE' && platform !== 'ios' ? 'android' : null;
  const sheet = {
    title: t('settings_delete'),
    body: t('settings_delete_permanent_msg'),
    buttons: [
      { label: t('cancel'), kind: 'secondary' },
      { label: t('settings_delete_confirm'), kind: 'danger', onPress: onConfirm },
    ],
  };
  if (!os) return sheet;
  return {
    ...sheet,
    body2: t(storeKey('settings_delete_premium', os)),
    link: {
      label: t('settings_manage_subscription'),
      keepOpen: true,
      onPress: () => {
        try { Promise.resolve(openUrl(manageSubscriptionsUrl(os))).catch(() => {}); } catch { /* no store page: the sheet stays */ }
      },
    },
  };
}

// Gate B of 5cb065f, 2: Delete tapped before the store answer arrived → wait for it, ms at most
// (then no paragraph). A known answer (null included) is used at once. Never throws.
async function resolveBillingStore(known, load, ms = 2000) {
  if (known !== undefined) return known;
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve().then(load).then((v) => v ?? null, () => null),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); }),
    ]);
  } finally { clearTimeout(timer); }
}

// Gate B of 5cb065f, 1: a locked sheet (the progress) is cleared; any other sheet is kept.
function unlockSheet(cur) {
  return cur && cur.locked ? null : cur;
}

// 1 B: while the server deletes (up to a minute) a fixed sheet: spinner, no buttons, not closed by
// a tap outside or Android back. The result replaces it.
function deletingAccountSheet(t) {
  return { spinner: 'risk', locked: true, title: t('settings_delete_progress_title'), body: t('settings_delete_progress_body'), buttons: [] };
}

// 2: a sync pass was still running (requestAccountDeletion → { syncBusy }): nothing was deleted.
function deleteSyncBusySheet(t) {
  return { icon: 'refresh', title: t('settings_delete_syncbusy_title'), body: t('settings_delete_syncbusy_body'), buttons: [{ label: t('ok'), kind: 'primary' }] };
}

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

// A-127: "Novidades do DoseTrace" shows ON only when the account said yes AND this phone can receive
// notifications (permission granted). Display only: the account is never rewritten here.
async function versionNewsShown(meta) {
  if (!meta || meta.version_news !== true) return false;
  try { return (await notificationsGranted()) === true; } catch { return false; }
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
  const [versionNews, setVersionNews] = useState(false); // A-127 UN-5: off unless the person said yes
  const [persistentReminders, setPersistentReminders] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [premium, setPremium] = useState(false);
  // A-164: a grant/revoke made elsewhere updates the badge and the upgrade card while open.
  usePremiumUpdates(setPremium);
  // Which store bills the Premium (undefined = not answered yet), for the delete sheet (3 C).
  const [billingStore, setBillingStore] = useState(undefined);
  const billingLoad = useRef(null);
  const deleteOpening = useRef(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const analyticsSaved = useRef(true); // DV-008: the value the account holds (a failed tap reverts to it)
  // DV-007 = A: the "AI use" switch shows this account's AI consent (on this phone, per account).
  const [aiUseOn, setAiUseOn] = useState(false);
  const [aiUse] = useState(createAIUseSwitch);
  const savingProfile = useRef(false); // DV-008: Edit profile Save in flight (a double tap sends one save)
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
  // Android (edge to edge, the page sheet is never resized; build 54): Edit profile scrolls the
  // focused field just above the keyboard, and the country list's end can scroll above it.
  const profileLift = useKeyboardLift(null, Platform.OS === 'android' && showEditProfile);
  const countryLift = useKeyboardLift(null, Platform.OS === 'android' && showCountryPicker);
  const profileNameRef = useRef(null);
  const profileYearRef = useRef(null);
  const [countrySearch, setCountrySearch] = useState('');
  // DoseTrace sheets instead of native alerts (decisions: "DoseTrace sheets replace native iOS
  // alerts everywhere"). `sheet` sits on the screen; `editSheet` is presented from inside the
  // Edit profile sheet (a popup opened from a popup is rendered inside it, M1).
  const [sheet, setSheet] = useState(null);
  const [editSheet, setEditSheet] = useState(null);
  // The adherence report preview (Settings part 3): the exact text before the share sheet.
  const [reportPreview, setReportPreview] = useState(null);
  // A-181 option B: above the paper (never in the report), "This phone hasn't synced since {date}" +
  // Sync now, while the A-177 rule holds doses back. { sinceMs } or null; reportSyncing: Sync now runs.
  const [reportUnsync, setReportUnsync] = useState(null);
  const [reportSyncing, setReportSyncing] = useState(false);
  // Code review #6: Sync now rebuilds the report only while its page is still open.
  const reportOpenRef = useRef(false);
  reportOpenRef.current = !!reportPreview;
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
    // Already running (the Apple note closed twice): that run settles it; never leave a locked sheet.
    if (tornDown.current) { setSheet(unlockSheet); return; }
    tornDown.current = true;
    // The phone could not sign out (no SIGNED_OUT ran): say so with the sign-out failure sheet, and
    // re-arm so Delete again tears down again (Gate B of 5cb065f, 1: the locked sheet had no exit).
    // The progress sheet (1 B) stays up during the teardown; a locked sheet never stays behind.
    const failed = () => { tornDown.current = false; showSignOutFailed(); };
    finishAccountDeletion().then((r) => { if (r && r.failed) failed(); else setSheet(unlockSheet); }).catch(failed);
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

  // RC-1: how many readable phone settings block reminders (lib/reminderHealth).
  const [reminderBlocks, setReminderBlocks] = useState(0);
  // A-112 SP-1: Android's "Make sure your reminders arrive" row state (block / N of M ready / all set).
  const [setupRow, setSetupRow] = useState(null);
  // A-163 TM-17: "Team messages" under Support only after the account received a message.
  const teamList = useTeamMessages(user && user.id);
  const teamRow = settingsRow({ list: teamList, pending: {} });
  const groupSum = (g) => t(g.key === 'support' && teamRow ? 'settings_sum_support_msgs' : g.sumKey);
  useFocusEffect(
    useCallback(() => {
      fetchUser();
      teamMessages().refresh().catch(() => {}); // A-163: the row follows the server list
      readReminderHealth().then((h) => {
        setReminderBlocks(blockingCount(reminderChecks(h), scheduleState(h)));
        setSetupRow({ ...setupRowState(h), nextAtMs: h.next ? h.next.atMs : null });
      }).catch(() => {});
    }, [])
  );
  function setupRowSub() {
    if (!setupRow) return '';
    if (setupRow.kind === 'block') return t('settings_rc_sub_block');
    if (setupRow.kind === 'warn' && setupRow.ready === setupRow.total && setupRow.staleDays) return t('today_alert_stale_title').replace('{n}', String(setupRow.staleDays));
    if (setupRow.kind === 'warn') return t(pluralKey('rc_setup_progress', setupRow.ready, language)).replace('{n}', String(setupRow.ready)).replace('{total}', String(setupRow.total));
    if (!setupRow.nextAtMs) return t('settings_setup_all');
    const d = new Date(setupRow.nextAtMs);
    return t('settings_setup_all_next').replace('{when}', `${formatDate(d, language, 'weekdayDayMonth')}, ${formatTime(d.toTimeString().slice(0, 5), language, timeFormat)}`);
  }

  async function fetchUser() {
    // Asked first, so a fast tap on Delete account rarely waits (resolveBillingStore).
    const bl = getBillingStore();
    billingLoad.current = bl;
    bl.then(setBillingStore, () => setBillingStore(null));
    const user = await getCachedUser();
    setUser(user);
    aiUse.load(aiUseDeps()); // per account: signed out or another account → OFF
    // Real subscription status (non-throwing; defaults to false on failure)
    hasPremium().then(setPremium).catch(() => setPremium(false));
    if (user) {
      noteAnalyticsChoice(user.id, user.user_metadata?.analytics_opt_in !== false); // the background check (lib/analytics)
      setAnalyticsEnabled(user.user_metadata?.analytics_opt_in !== false);
      analyticsSaved.current = user.user_metadata?.analytics_opt_in !== false;
      setDoseReminders(user.user_metadata?.dose_reminders !== false);
      setCheckinReminders(user.user_metadata?.checkin_reminders !== false);
      setFoodReminders(user.user_metadata?.food_reminders !== false);
      setNotifNames(user.user_metadata?.notif_show_names !== false);
      setVialAlerts(user.user_metadata?.vial_alerts !== false);
      setSilentMode(user.user_metadata?.silent_mode === true);
      versionNewsShown(user.user_metadata).then(setVersionNews).catch(() => setVersionNews(false)); // A-127: display only
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

  // DV-007 = A (lib/aiUseSwitch): OFF withdraws at once; ON asks with the AI features' own sheet.
  function aiUseDeps() {
    return {
      t,
      has: hasAIConsent,
      grant: grantAIConsent,
      revoke: revokeAIConsent,
      setOn: setAiUseOn,
      showSheet: setSheet,
      openPrivacy: () => Linking.openURL(AI_PRIVACY_URL).catch(() => {}),
    };
  }

  function toggleAIUse(val) {
    aiUse.toggle(val, aiUseDeps());
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

  // A-127 UN-5 / UN-6: "Novidades do DoseTrace" — the one place the yes / no lives after the
  // invitation. Saved like the other switches (a failed save reverts and says so); a yes registers
  // this phone for the push; the answer ends the invitation's question on this phone.
  async function toggleVersionNews(val) {
    // ON needs the notification permission: the system dialog only while it is undetermined (AD-88);
    // denied or not granted → the switch stays off and nothing is saved or registered.
    if (val) {
      try { await askNotificationPermission(); } catch { /* read below */ }
      let granted = false;
      try { granted = await notificationsGranted(); } catch { granted = false; }
      if (!granted) { setVersionNews(false); return; }
    }
    setVersionNews(val);
    let error = null;
    try { ({ error } = await supabase.auth.updateUser({ data: { version_news: val } })); } catch (e) { error = e; }
    if (error) {
      setVersionNews(!val);
      errorSheet(friendlyError(error, t, 'error_save_failed'));
      return;
    }
    updateFlow().noteSettingsAnswer(user && user.id, val).catch(() => {});
    if (val) registerPushToken().catch(() => {});
  }

  async function toggleAnalytics(val) {
    setAnalyticsEnabled(val);
    // Council regulatory review (1.3.1): switching off clears the background queue and remembers
    // the opt-out on this phone at once, started before the save and finished before this returns
    // (a refused save keeps the intent: nothing waiting is sent; the next foreground event reads
    // the account's own choice again).
    const stopQueue = !val ? Promise.all([clearAnalyticsQueue(), noteAnalyticsChoice(user && user.id, false)]).catch(() => {}) : null;
    // DV-008 / DL-56: a refused save (offline) must not LOOK saved: revert to what the account
    // holds (not !val: two quick failing taps would end on a value never stored) and say so.
    // Only its own key is written (merge).
    let error = null;
    try { ({ error } = await supabase.auth.updateUser({ data: { analytics_opt_in: val } })); } catch (e) { error = e; }
    if (error) {
      setAnalyticsEnabled(analyticsSaved.current);
      errorSheet(friendlyError(error, t, 'error_save_failed'));
    } else {
      analyticsSaved.current = val;
      if (val) await noteAnalyticsChoice(user && user.id, true);
    }
    if (stopQueue) await stopQueue;
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
    if (savingProfile.current) return; // a double tap on Save sends one save
    savingProfile.current = true;
    try {
      // DV-008 / DL-56: updateUser RESOLVES { error } when the save is refused (offline): that
      // is a failure too — Edit profile stays open with the typed values and the error sheet shows.
      const res = await supabase.auth.updateUser({
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
      if (res && res.error) throw res.error;
      setShowCountryPicker(false);
      setShowEditProfile(false);
      fetchUser();
    } catch (e) {
      setEditSheet({ icon: 'warning', title: t('error'), body: friendlyError(e, t, 'error_save_failed'), buttons: [{ label: t('ok'), kind: 'primary' }] });
    } finally {
      savingProfile.current = false;
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
      // A-123: after the first sync only, waiting at most REPORT_SCAN_WAIT_MS.
      try { await scanMissedDoses({ maxWaitMs: REPORT_SCAN_WAIT_MS }); } catch (e) { /* best effort */ }
      const logs = getLogsSince(user.id, thirtyDaysAgo.toISOString()) || [];
      // Active protocols and the ended ones with records in the window (A-83: ending never
      // removes doses from the report; lib/protocolEnd reportProtocols).
      const protocols = reportProtocols(getHistoryProtocols(user.id) || [], logs, thirtyDaysAgo.getTime(), now.getTime());
      // One definition for every protocol and the overall figure (lib/adherenceReport, M2):
      // complete ÷ (complete + skipped + missed).
      const stats = adherenceStats({ protocols, logs, sinceMs: thirtyDaysAgo.getTime(), nowMs: now.getTime() });
      const vials = getLocalVials(user.id) || [];
      // A-181 (founder 2026-10-26, option B): doses the A-177 rule still holds back are not counted as
      // missed yet — the report says so (asterisks, a line, "No record since" per protocol), and every
      // gap of more than 14 days without a sync stays written while it falls in these 30 days.
      // Code review 2026-10-26: unsyncNotice, never "notice" (that name is this screen's sheet helper);
      // a gap only when the scan would have written a miss in it; no sync ever → the wording with no date.
      const unsync = await unsyncedState();
      const unsyncNotice = unsync.notice;
      const heldIn = unsyncNotice ? heldByProtocol(unsync.held, thirtyDaysAgo.getTime(), now.getTime()) : {};
      const gaps = await unrecordedGapsWithMisses(reportGaps(await readUnrecordedGaps(AsyncStorage, user.id, now.getTime()), thirtyDaysAgo.getTime(), now.getTime()));
      const unsyncSinceMs = unsyncNotice ? unsyncNotice.sinceMs : null;
      const sinceText = (fmt) => formatDate(new Date(unsyncSinceMs), language, fmt) || '';

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
          name: isEnded(p) ? `${protocolDisplayName(p, t)} · ${t('protocols_ended_on').replace('{date}', formatDate(new Date(p.ended_at || p.updated_at), language, 'dayMonth') || '')}` : protocolDisplayName(p, t), // A-134: as on Today
          dose: `${p.dose ? decimalText(p.dose, language) : '—'}\u00A0${unitText(p.dose_unit || '', language)}`,
          frequency: p.frequency || '—',
          taken,
          skipped,
          missed,
          adherence,
          unrecorded: heldIn[p.id] || 0,
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
      report += `${fillPercent(t('report_overall'), stats.overall.adherence)}${unsyncNotice || gaps.length ? '*' : ''}\n`;
      if (unsyncNotice) report += `${unsyncNotice.never ? t('report_unsynced_never') : t('report_unsynced').replace('{date}', sinceText('dayMonthYear'))}\n`;
      for (const g of gaps) report += `${t('report_gap').replace('{from}', formatDate(new Date(g.fromMs), language, 'dayMonth') || '').replace('{to}', formatDate(new Date(g.toMs - 1), language, 'dayMonth') || '')}\n`;
      report += `${t('report_active_protocols').replace('{count}', protocols.filter((p) => !isEnded(p)).length)}\n`;
      report += `${t('report_total_logged').replace('{count}', totalAll)}\n`;
      report += `${'─'.repeat(40)}\n\n`;

      protocolStats.forEach(ps => {
        report += `${ps.name}\n`;
        report += `  ${t('report_dose_line').replace('{dose}', ps.dose).replace('{frequency}', ps.frequency)}\n`;
        report += `  ${fillPercent(t('report_outcome_line').replace('{taken}', ps.taken).replace('{skipped}', ps.skipped).replace('{missed}', ps.missed), ps.adherence)}${ps.unrecorded > 0 ? '*' : ''}\n`;
        if (ps.unrecorded > 0) report += `  ${(unsyncNotice.never ? t('report_unrecorded_never') : t('report_unrecorded').replace('{date}', sinceText('dayMonth'))).replace('{n}', ps.unrecorded)}\n`;
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
      setReportUnsync(unsyncNotice ? { sinceMs: unsyncSinceMs, never: unsyncNotice.never } : null);
      setReportPreview(report);
    } catch (e) {
      errorSheet(friendlyError(e, t));
    }
    setExporting(false);
  }

  // A-181: Sync now above the paper — a full pass, then the report is built again (its scan writes the
  // misses the pull now proves).
  async function reportSyncNow() {
    if (reportSyncing) return;
    setReportSyncing(true);
    try { await forceSync(); } catch { /* the notice stays */ }
    if (reportOpenRef.current) await handleAdherenceReport();
    setReportSyncing(false);
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

  // The one deliberate sign-out (lib/settingsSignOut → accountActions): push first; if anything
  // is STILL not backed up, the one sheet (A-119 OD-9, lib/deviceCopy signOutSheet) says what really
  // happened, what and how many (records the server will never accept included), the last full
  // backup, and that signing in on the new phone is enough — "Sign out anyway" or stay. Never blocked.
  function startSignOut() {
    return runSignOut({
      signOut: (opts) => signOutIntended(opts),
      guard: signOutGuard,
      onFailed: showSignOutFailed,
      onBlocked: (r, anyway) => setSheet(signOutSheet({ t, language, timeFormat, offline: r.offline, summary: r.summary, lastBackup: r.lastBackup, onAnyway: anyway, onStay: () => {} })),
    });
  }

  async function handleSignOut() {
    if (signOutGuard.isBusy()) return;
    setSheet({
      title: t('settings_signout'),
      body: t('settings_signout_confirm_local'),
      buttons: [
        { label: t('cancel'), kind: 'secondary' },
        { label: t('settings_signout'), kind: 'danger', onPress: () => startSignOut() },
      ],
    });
  }

  async function handleDeleteAccount() {
    if (deleteOpening.current) return;
    deleteOpening.current = true;
    let store = null;
    try { store = await resolveBillingStore(billingStore, () => billingLoad.current || getBillingStore()); } finally { deleteOpening.current = false; }
    setSheet(deleteAccountSheet({ t, store, platform: Platform.OS,
      openUrl: (u) => Linking.openURL(u),
      // Second confirmation — this is irreversible. The sheet runs a button's action
      // after it has closed, so the second sheet opens on its own.
      onConfirm: () => setSheet({
        title: t('settings_delete_final_title'),
        body: t('settings_delete_final_msg'),
        buttons: [
          { label: t('cancel'), kind: 'secondary' },
          { label: t('settings_delete_final_confirm'), kind: 'danger', onPress: () => executeAccountDeletion() },
        ],
      }),
    }));
  }

  async function executeAccountDeletion() {
    setSheet(deletingAccountSheet(t)); // 1 B: right away, until the result replaces it
    try {
      // The one delete (lib/accountActions → delete-user: ALL of the user's data rows first,
      // then the auth account), shared with the 18+ confirmation sheet.
      const result = await requestAccountDeletion();
      if (result.noSession) { errorSheet(t('error_no_session')); return; }
      if (result.syncBusy) { setSheet(deleteSyncBusySheet(t)); return; } // 2: not "offline"
      if (result.offline) { errorSheet(t('settings_delete_offline')); return; }
      // A-119 OD-10: this phone is no longer the account's; nothing was deleted and screen 2 takes over.
      if (result.replaced) { setSheet(null); return; }
      // Gate B M4: this phone's own takeover is not confirmed yet — nothing was deleted; say so.
      if (result.deviceWait) { notice(t('settings_delete_device_wait_title'), t('settings_delete_device_wait'), 'warning'); return; }

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
    const setupColor = setupRow && setupRow.kind === 'block' ? colors.risk : setupRow && setupRow.kind === 'warn' ? colors.attention : null;
    return (
      <>
        {/* A-112 SP-1 (founder 2026-10-07, picture B): Android — the first row of Notifications opens
            "Make sure your reminders arrive", with its state. */}
        {Platform.OS === 'android' ? (
          <TouchableOpacity style={s.row} onPress={() => navigation.navigate('ReminderCheck')} accessibilityRole="button">
            <View style={s.rowLeft}>
              <FeatureIcon name={setupRow && setupRow.kind === 'block' ? 'warning' : 'shield'} size={28} color={setupRow && setupRow.kind === 'block' ? colors.risk : colors.ink} />
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[s.rowLabel, { flexShrink: 1 }]}>{t('settings_setup_title')}</Text>
                  {setupRow && setupRow.kind !== 'ok' ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: setupColor }} /> : null}
                </View>
                <Text style={[s.rowSub, setupColor && { color: setupColor }]}>{setupRowSub()}</Text>
              </View>
            </View>
            <RowChevron color={colors.tick} />
          </TouchableOpacity>
        ) : null}
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
        {/* A-127 (picture a127-update-notice screen 5): after the vial alerts, before Silent mode. */}
        <View style={s.row}>
          <View style={s.rowLeft}>
            <FeatureIcon name="download" size={28} color={colors.text} />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.rowLabel}>{t('settings_version_news')}</Text>
              <Text style={s.rowSub}>{t('settings_version_news_sub')}</Text>
            </View>
          </View>
          <GradSwitch
            value={versionNews}
            onValueChange={toggleVersionNews}
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
        {/* RC-1 (founder 2026-10-05 "1 B"): the Reminder check — iPhone. On Android the first row of
            this section replaces it (A-112 SP-1). */}
        {Platform.OS !== 'android' ? (
        <TouchableOpacity
          style={[s.row, { borderBottomWidth: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
          onPress={() => navigation.navigate('ReminderCheck')}
          accessibilityRole="button"
        >
          <View style={s.rowLeft}>
            <FeatureIcon name={reminderBlocks > 0 ? 'warning' : 'check'} size={28} color={reminderBlocks > 0 ? colors.risk : colors.ink} />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.rowLabel}>{t('settings_rc_title')}</Text>
              <Text style={[s.rowSub, reminderBlocks > 0 && { color: colors.risk }]}>{t(reminderBlocks > 0 ? 'settings_rc_sub_block' : 'settings_rc_sub_ok')}</Text>
            </View>
          </View>
          <RowChevron color={colors.tick} />
        </TouchableOpacity>
        ) : null}
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
        <View style={s.row}>
          <View style={s.rowLeft}>
            <FeatureIcon name="ai_spark" size={28} color={colors.text} />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.rowLabel}>{t('settings_ai_use')}</Text>
              <Text style={s.rowSub}>{t('settings_ai_use_sub')}</Text>
            </View>
          </View>
          <GradSwitch
            value={aiUseOn}
            onValueChange={toggleAIUse}
            accessibilityLabel={t('settings_ai_use')}
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
        {teamRow ? (
          <TouchableOpacity style={s.row} onPress={() => navigation.navigate('TeamMessages')} accessibilityRole="button">
            <View style={s.rowLeft}>
              <FeatureIcon name="mail" size={28} color={colors.text} />
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={s.rowLabel}>{t('settings_team_messages')}</Text>
                <Text style={s.rowSub}>{settingsRowLine(teamRow, Date.now(), t, language)}</Text>
              </View>
            </View>
            <RowChevron color={colors.tick} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={s.row} onPress={() => navigation.navigate('FAQ')}>
          <View style={s.rowLeft}>
            <FeatureIcon name="help" size={28} color={colors.text} />
            <Text style={s.rowLabel}>{t('settings_faq')}</Text>
          </View>
          <RowChevron color={colors.tick} />
        </TouchableOpacity>
        <TouchableOpacity style={s.row} onPress={handleContactSupport}>
          <View style={s.rowLeft}>
            {/* A-163 picture: the envelope is Team messages; Contact us is the speech bubble */}
            <FeatureIcon name="chat" size={28} color={colors.text} />
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
            <Text style={s.setSum}>{groupSum(g)}</Text>
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
                    <Text style={s.setSum} numberOfLines={2}>{groupSum(g)}</Text>
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
    <SafeAreaView style={s.container} edges={TAB_SCREEN_EDGES}>
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
            {reportUnsync ? (
              <View style={s.reportUnsync}>
                <FeatureIcon name="refresh" size={18} color={colors.ink2} />
                <View style={s.reportUnsyncCol}>
                  <Text style={s.reportUnsyncText}>{reportUnsync.never ? t('settings_report_unsynced_never') : fillDate(t('settings_report_unsynced'), formatDate(new Date(reportUnsync.sinceMs), language, 'dayMonth'))}</Text>
                  <TouchableOpacity onPress={reportSyncNow} disabled={reportSyncing} style={s.reportSyncBtn} accessibilityRole="button" accessibilityState={{ busy: reportSyncing, disabled: reportSyncing }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={s.reportSyncBtnText}>{t('sync_now')}</Text>
                    {reportSyncing ? <ActivityIndicator size="small" color={colors.ink2} /> : null}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            <View style={s.reportPaper}>
              <Text style={s.reportText} selectable>{reportShown}</Text>
            </View>
            <View style={{ height: 24 }} />
          </ScrollView>
          <View style={s.reportFoot}>
            <TouchableOpacity style={[s.premiumBtn, reportSyncing && { opacity: 0.5 }]} onPress={shareReport} disabled={reportSyncing} accessibilityRole="button" accessibilityState={{ disabled: reportSyncing }}>
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
        content={fillStoreText(t('settings_terms_body'), t, Platform.OS)}
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
          <ScrollView {...profileLift.scrollProps} style={s.modalBody} showsVerticalScrollIndicator={false}>
            {/* ── About you ─────────────────────────────────────────── */}
            <Text style={[s.editSection, s.editSectionFirst]}>{t('profile_sec_about')}</Text>

            <View style={s.editField}>
              <Text style={s.editLabel}>{t('profile_name')}</Text>
              <TextInput
                ref={profileNameRef}
                onFocus={() => profileLift.liftField(profileNameRef)}
                {...profileLift.nextProps(profileYearRef)}
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
                ref={profileYearRef}
                onFocus={() => profileLift.liftField(profileYearRef)}
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
            {profileLift.spacer}
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
                ListFooterComponent={countryLift.spacer}
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
  // A-181 option B (picture .flat.inSheet): plain on the sheet, a text button.
  reportUnsync: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 4, paddingBottom: 10 },
  reportUnsyncCol: { flex: 1, minWidth: 0, gap: 4 },
  reportUnsyncText: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  reportSyncBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 24 },
  reportSyncBtnText: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: c.ink, textDecorationLine: 'underline' },
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
