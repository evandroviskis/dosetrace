import { useState, useCallback, useEffect, useMemo } from 'react';
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
  Alert,
  Switch,
  Modal,
  Linking,
  Share,
  TextInput,
  FlatList,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase, getCachedUser, signOutGoogleNative } from '../lib/supabase';
import { markIntentionalSignOut } from '../lib/authIntent';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import FeatureIcon from '../components/FeatureIcon';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import {
  getAllDataForExport, getActiveProtocols as getLocalProtocols,
  getLogsSince, getActiveVials as getLocalVials,
  clearLocalDatabase, getDeletedProtocols as getLocalDeletedProtocols,
  restoreProtocol as restoreProtocolDB, getNewestVialForProtocol,
  updateVial, getProtocolById, permanentlyDeleteProtocol,
} from '../lib/database';
import { stopSyncEngine, requestSync, forceSync } from '../lib/sync';
import { hasPremium } from '../lib/entitlement';
import { COUNTRIES, countryLabel } from '../lib/countries';
import { syncAllNotifications, openBatteryOptimizationSettings, removePushToken } from '../lib/notifications';
import { friendlyError } from '../lib/friendlyError';
import CheckMark from '../components/CheckMark';
import { MONO } from '../lib/fonts';

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
  const [deletedProtocols, setDeletedProtocols] = useState([]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  // Collapsible Settings sections (remembered). All start collapsed — the user
  // opens only what they need, so the screen stays clean.
  const ALL_COLLAPSED = { notifications: true, privacy: true, support: true, deleted: true, account: true };
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

  function renderSectionHeader(labelKey, sectionKey) {
    return (
      <TouchableOpacity
        style={s.sectionHeaderRow}
        activeOpacity={0.6}
        onPress={() => toggleSection(sectionKey)}
      >
        <Text style={s.sectionLabel}>{t(labelKey)}</Text>
        <Text style={s.sectionChevron}>{collapsed[sectionKey] ? '▸' : '▾'}</Text>
      </TouchableOpacity>
    );
  }

  useFocusEffect(
    useCallback(() => {
      fetchUser();
      fetchDeletedProtocols();
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
      setActivityLevel(user.user_metadata?.activity_level || '');
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
      Alert.alert(t('error'), friendlyError(error, t, 'error_save_failed'));
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
      Alert.alert(t('profile_required_legend').replace(/^\*\s*/, ''), missing.join('\n'));
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
          has_provider: hasProvider || null,
        },
      });
      setShowEditProfile(false);
      fetchUser();
    } catch (e) {
      Alert.alert(t('error'), friendlyError(e, t, 'error_save_failed'));
    }
  }

  async function handleExportData() {
    if (!user) return;
    setExporting(true);
    try {
      const allData = getAllDataForExport(user.id);
      const exportData = {
        exported_at: new Date().toISOString(),
        user_email: user.email,
        ...allData,
      };
      const json = JSON.stringify(exportData, null, 2);
      const FileSystem = require('expo-file-system');
      const path = FileSystem.documentDirectory + 'dosetrace_export.json';
      await FileSystem.writeAsStringAsync(path, json);
      const Sharing = require('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: t('settings_export_title') });
      } else {
        Alert.alert(t('settings_export_title'), t('settings_export_done'));
      }
    } catch (e) {
      Alert.alert(t('error'), t('settings_export_error'));
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

      const protocols = getLocalProtocols(user.id) || [];
      const logs = getLogsSince(user.id, thirtyDaysAgo.toISOString()) || [];
      const vials = getLocalVials(user.id) || [];

      if (protocols.length === 0) {
        Alert.alert(t('settings_report_title'), t('settings_report_empty'));
        setExporting(false);
        return;
      }

      // Build per-protocol stats
      const protocolStats = protocols.map(p => {
        const pLogs = logs.filter(l => l.protocol_id === p.id);
        const taken = pLogs.filter(l => l.outcome === 'Taken').length;
        const skipped = pLogs.filter(l => l.outcome === 'Skipped').length;
        const total = taken + skipped;
        const adherence = total > 0 ? Math.round((taken / total) * 100) : 0;

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
          name: p.name,
          dose: `${p.dose || '—'} ${p.dose_unit || ''}`,
          frequency: p.frequency || '—',
          taken,
          skipped,
          adherence,
          streak,
          vialRemaining: vial ? (vial.total_doses || 0) - (vial.doses_taken || 0) : null,
        };
      });

      // Overall adherence
      const totalTaken = logs.filter(l => l.outcome === 'Taken').length;
      const totalAll = logs.length;
      const overallAdherence = totalAll > 0 ? Math.round((totalTaken / totalAll) * 100) : 0;

      // Build report text
      const userName = user.user_metadata?.display_name || user.email;
      const dateRange = `${thirtyDaysAgo.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

      let report = `${t('report_header')}\n`;
      report += `${'─'.repeat(40)}\n`;
      report += `${t('report_user').replace('{name}', userName)}\n`;
      report += `${t('report_period').replace('{range}', dateRange)}\n`;
      report += `${t('report_overall').replace('{percent}', overallAdherence)}\n`;
      report += `${t('report_active_protocols').replace('{count}', protocols.length)}\n`;
      report += `${t('report_total_logged').replace('{count}', totalAll)}\n`;
      report += `${'─'.repeat(40)}\n\n`;

      protocolStats.forEach(ps => {
        report += `${ps.name}\n`;
        report += `  ${t('report_dose_line').replace('{dose}', ps.dose).replace('{frequency}', ps.frequency)}\n`;
        report += `  ${t('report_outcome_line').replace('{taken}', ps.taken).replace('{skipped}', ps.skipped).replace('{percent}', ps.adherence)}\n`;
        report += `  ${t('report_streak_line').replace('{days}', ps.streak)}\n`;
        if (ps.vialRemaining !== null) {
          report += `  ${t('report_vial_line').replace('{count}', ps.vialRemaining)}\n`;
        }
        report += `\n`;
      });

      report += `${'─'.repeat(40)}\n`;
      report += `${t('report_generated').replace('{date}', now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))}\n`;
      report += `${t('report_footer_1')}\n`;
      report += `${t('report_footer_2')}\n`;

      await Share.share({
        message: report,
        title: t('settings_report_title'),
      });
    } catch (e) {
      Alert.alert(t('error'), friendlyError(e, t));
    }
    setExporting(false);
  }

  async function handleSignOut() {
    Alert.alert(t('settings_signout'), t('settings_signout_confirm_local'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('settings_signout'),
        style: 'destructive',
        onPress: async () => {
          // Best-effort: push this user's pending changes before local data
          // is wiped by the SIGNED_OUT handler.
          try { await forceSync(); } catch (e) { /* best effort */ }
          // Remove this device's push token WHILE still authenticated (owner RLS)
          // so the server stops pushing reminders to a signed-out device.
          try { await removePushToken(); } catch (e) { /* best effort */ }
          // Mark this as a deliberate sign-out so the SIGNED_OUT handler performs
          // the full local wipe (a spurious SIGNED_OUT would keep the data).
          markIntentionalSignOut();
          // Clear the native Google session too, so the account chooser shows on
          // the next sign-in instead of silently re-using this account.
          await signOutGoogleNative();
          // scope:'local' clears the session on-device without a network round-trip,
          // so sign-out never stalls on a slow/invalid token — it just fires
          // SIGNED_OUT, which routes back to the welcome screen.
          try { await supabase.auth.signOut({ scope: 'local' }); }
          catch { await supabase.auth.signOut().catch(() => {}); }
        },
      },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      t('settings_delete'),
      t('settings_delete_permanent_msg'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('settings_delete_confirm'),
          style: 'destructive',
          onPress: () => {
            // Second confirmation — this is irreversible
            Alert.alert(
              t('settings_delete_final_title'),
              t('settings_delete_final_msg'),
              [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('settings_delete_final_confirm'),
                  style: 'destructive',
                  onPress: () => executeAccountDeletion(),
                },
              ]
            );
          },
        },
      ]
    );
  }

  async function executeAccountDeletion() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { Alert.alert(t('error'), t('error_no_session')); return; }

      // Call the delete-user Edge Function: it deletes ALL of the user's data
      // rows first, then the auth account (see supabase/functions/delete-user),
      // matching the privacy policy's "account and all associated data" promise.
      // fetch() rejects only on a network-level failure (offline / unreachable),
      // so a caught error here means no connection — deletion needs the server.
      let res;
      try {
        res = await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-user`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );
      } catch {
        Alert.alert(t('error'), t('settings_delete_offline'));
        return;
      }
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || t('error_deletion_failed'));

      // The account + data are deleted. If the user signed in with Apple but we
      // had no stored token to auto-revoke (a pre-feature account, or a transient
      // revoke failure), tell them how to remove Apple access themselves — Apple
      // 5.1.1(v) fallback guidance. The deletion itself already succeeded.
      if (result.appleManualRevokeNeeded) {
        Alert.alert(
          t('settings_delete_apple_revoke_title'),
          t('settings_delete_apple_revoke_note'),
          [{ text: t('done'), onPress: () => finishAccountDeletion() }],
          { cancelable: false },
        );
        return;
      }
      await finishAccountDeletion();
    } catch (e) {
      Alert.alert(t('error'), friendlyError(e, t, 'error_deletion_failed'));
    }
  }

  // Local teardown after a confirmed server-side deletion. Clears local data and
  // signs out (local scope — the auth account is already gone server-side). The
  // native Google session is fully detached (signOut + revoke) so the deleted
  // account can't be silently re-authenticated; the next Google sign-in shows the
  // chooser + consent, making a new account a conscious choice. (Apple sign-in is
  // revoked server-side in delete-user, or via the guidance note above.)
  async function finishAccountDeletion() {
    stopSyncEngine();
    clearLocalDatabase();
    markIntentionalSignOut(); // deliberate account deletion — full wipe
    await signOutGoogleNative({ revoke: true });
    try { await supabase.auth.signOut({ scope: 'local' }); }
    catch { await supabase.auth.signOut().catch(() => {}); }
  }

  async function fetchDeletedProtocols() {
    const u = await getCachedUser();
    if (!u) return;
    setDeletedProtocols(getLocalDeletedProtocols(u.id) || []);
  }

  function restoreProtocol(id) {
    restoreProtocolDB(id);
    const newestVial = getNewestVialForProtocol(id);
    if (newestVial) updateVial(newestVial.id, { active: 1 });
    const restored = getProtocolById(id);
    if (restored) {
      import('../lib/notifications').then(n => n.scheduleDoseReminder(restored)).catch(() => {});
    }
    fetchDeletedProtocols();
    requestSync();
  }

  // Permanently remove a soft-deleted protocol before the 7-day auto-purge.
  // Irreversible, so it always goes through a confirm dialog.
  function confirmPermanentDelete(p) {
    Alert.alert(
      t('settings_delete_protocol_title'),
      t('settings_delete_protocol_msg').replace('{name}', p.name),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('settings_delete_forever'),
          style: 'destructive',
          onPress: () => {
            permanentlyDeleteProtocol(p.id);
            fetchDeletedProtocols();
            requestSync();
          },
        },
      ]
    );
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

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('settings_title')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.centered}>

        {/* PROFILE */}
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
          <Text style={s.rowArrow}>›</Text>
        </TouchableOpacity>

        {/* PREMIUM CARD — upsell hidden for premium users */}
        {!premium && (
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
        )}

        {/* NOTIFICATIONS */}
        {renderSectionHeader('settings_notifications', 'notifications')}
        {!collapsed.notifications && (
        <View style={s.group}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="bell" size={20} color={colors.text} /></View>
              <View>
                <Text style={s.rowLabel}>{t('settings_dose_reminders')}</Text>
                <Text style={s.rowSub}>{t('settings_dose_reminders_sub')}</Text>
              </View>
            </View>
            <Switch
              value={doseReminders}
              onValueChange={(v) => toggleNotificationPref('dose_reminders', v, setDoseReminders)}
              trackColor={{ true: colors.switchTrack }}
            />
          </View>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="chat" size={20} color={colors.text} /></View>
              <View>
                <Text style={s.rowLabel}>{t('settings_checkin')}</Text>
                <Text style={s.rowSub}>{t('settings_checkin_sub')}</Text>
              </View>
            </View>
            <Switch
              value={checkinReminders}
              onValueChange={(v) => toggleNotificationPref('checkin_reminders', v, setCheckinReminders)}
              trackColor={{ true: colors.switchTrack }}
            />
          </View>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="food" size={20} color={colors.text} /></View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={s.rowLabel}>{t('settings_food_reminders')}</Text>
                <Text style={s.rowSub}>{t('settings_food_reminders_sub')}</Text>
              </View>
            </View>
            <Switch
              value={foodReminders}
              onValueChange={(v) => toggleNotificationPref('food_reminders', v, setFoodReminders)}
              trackColor={{ true: colors.switchTrack }}
            />
          </View>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="lock" size={20} color={colors.text} /></View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={s.rowLabel}>{t('settings_notif_names')}</Text>
                <Text style={s.rowSub}>{t('settings_notif_names_sub')}</Text>
              </View>
            </View>
            <Switch
              value={notifNames}
              onValueChange={(v) => toggleNotificationPref('notif_show_names', v, setNotifNames)}
              trackColor={{ true: colors.switchTrack }}
            />
          </View>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="type_vial" size={20} color={colors.text} /></View>
              <View>
                <Text style={s.rowLabel}>{t('settings_vial_alerts')}</Text>
                <Text style={s.rowSub}>{t('settings_vial_alerts_sub')}</Text>
              </View>
            </View>
            <Switch
              value={vialAlerts}
              onValueChange={(v) => toggleNotificationPref('vial_alerts', v, setVialAlerts)}
              trackColor={{ true: colors.switchTrack }}
            />
          </View>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="mute" size={20} color={colors.text} /></View>
              <View>
                <Text style={s.rowLabel}>{t('settings_silent')}</Text>
                <Text style={s.rowSub}>{t('settings_silent_sub')}</Text>
              </View>
            </View>
            <Switch
              value={silentMode}
              onValueChange={(v) => toggleNotificationPref('silent_mode', v, setSilentMode)}
              trackColor={{ true: colors.switchTrack }}
            />
          </View>
          <View style={[s.row, { borderBottomWidth: 0 }]}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="repeat" size={20} color={colors.text} /></View>
              <View>
                <Text style={s.rowLabel}>{t('settings_persistent')}</Text>
                <Text style={s.rowSub}>{t('settings_persistent_sub')}</Text>
              </View>
            </View>
            <Switch
              value={persistentReminders}
              onValueChange={(v) => toggleNotificationPref('persistent_reminders', v, setPersistentReminders)}
              trackColor={{ true: colors.switchTrack }}
            />
          </View>
          {/* Android only: battery optimization silently drops scheduled reminders
              while the app is closed. Guide the user to set the app to Unrestricted. */}
          {Platform.OS === 'android' && (
            <TouchableOpacity
              style={[s.row, { borderBottomWidth: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
              onPress={async () => {
                const ok = await openBatteryOptimizationSettings();
                if (!ok) Alert.alert(t('settings_reliable_reminders'), t('settings_reliable_reminders_sub'));
              }}
            >
              <View style={s.rowLeft}>
                <View style={s.rowIconBox}><FeatureIcon name="help" size={20} color={colors.accent} /></View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={s.rowLabel}>{t('settings_reliable_reminders')}</Text>
                  <Text style={s.rowSub}>{t('settings_reliable_reminders_sub')}</Text>
                </View>
              </View>
              <Text style={s.rowArrow}>›</Text>
            </TouchableOpacity>
          )}
        </View>
        )}

        {/* DATA & PRIVACY */}
        {renderSectionHeader('settings_data_privacy', 'privacy')}
        {!collapsed.privacy && (
        <View style={s.group}>
          <TouchableOpacity style={s.row} onPress={() => setShowPrivacy(true)}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="lock" size={20} color={colors.text} /></View>
              <Text style={s.rowLabel}>{t('settings_privacy_policy')}</Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={() => setShowTerms(true)}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="clipboard" size={20} color={colors.text} /></View>
              <Text style={s.rowLabel}>{t('settings_terms')}</Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={() => setShowDisclaimer(true)}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="shield" size={20} color={colors.text} /></View>
              <Text style={s.rowLabel}>{t('settings_disclaimer')}</Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="calc_bars" size={20} color={colors.text} /></View>
              <View>
                <Text style={s.rowLabel}>{t('settings_analytics')}</Text>
                <Text style={s.rowSub}>{t('settings_analytics_sub')}</Text>
              </View>
            </View>
            <Switch
              value={analyticsEnabled}
              onValueChange={toggleAnalytics}
              trackColor={{ true: colors.switchTrack }}
            />
          </View>
          <TouchableOpacity
            style={s.row}
            onPress={handleAdherenceReport}
            disabled={exporting}
          >
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="calc_trend" size={20} color={colors.text} /></View>
              <View>
                <Text style={s.rowLabel}>{t('settings_report_title')}</Text>
                <Text style={s.rowSub}>{t('settings_report_sub')}</Text>
              </View>
            </View>
            <Text style={s.rowArrow}>{exporting ? '...' : '›'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.row, { borderBottomWidth: 0 }]}
            onPress={handleExportData}
            disabled={exporting}
          >
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="download" size={20} color={colors.text} /></View>
              <View>
                <Text style={s.rowLabel}>{t('settings_export_title')}</Text>
                <Text style={s.rowSub}>{t('settings_export_sub')}</Text>
              </View>
            </View>
            <Text style={s.rowArrow}>{exporting ? '...' : '›'}</Text>
          </TouchableOpacity>
        </View>
        )}

        {/* SUPPORT */}
        {renderSectionHeader('settings_support', 'support')}
        {!collapsed.support && (
        <View style={s.group}>
          <TouchableOpacity style={s.row} onPress={() => navigation.navigate('FAQ')}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="help" size={20} color={colors.text} /></View>
              <Text style={s.rowLabel}>{t('settings_faq')}</Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={handleContactSupport}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="mail" size={20} color={colors.text} /></View>
              <Text style={s.rowLabel}>{t('settings_contact')}</Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.row, { borderBottomWidth: 0 }]}
            onPress={handleRateApp}
          >
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="star" size={20} color={colors.text} /></View>
              <Text style={s.rowLabel}>{t('settings_rate')}</Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>
        )}

        {/* RECENTLY DELETED PROTOCOLS */}
        {deletedProtocols.length > 0 && (
          <>
            {renderSectionHeader('settings_recently_deleted', 'deleted')}
            {!collapsed.deleted && (
            <View style={s.group}>
              {deletedProtocols.map((p, idx) => {
                const isLast = idx === deletedProtocols.length - 1;
                return (
                  <View key={p.id} style={[s.row, isLast && { borderBottomWidth: 0 }]}>
                    <View style={s.rowLeft}>
                      {/* The user's protocol color, only as a 9 pt dot (DESIGN.md §2.4). */}
                      <View style={[s.deletedDot, { backgroundColor: p.color || colors.ink3 }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowLabel}>{p.name}</Text>
                        <Text style={s.rowSub}>{t('protocols_deleted_ago').replace('{days}', Math.ceil((Date.now() - new Date(p.deleted_at).getTime()) / 86400000))}</Text>
                      </View>
                    </View>
                    <View style={s.deletedActions}>
                      <TouchableOpacity
                        onPress={() => restoreProtocol(p.id)}
                        style={s.restoreBtn}
                      >
                        <Text style={s.restoreBtnText}>{t('protocols_restore')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => confirmPermanentDelete(p)}
                        accessibilityLabel={t('settings_delete_forever')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={s.deleteForeverBtn}
                      >
                        <FeatureIcon name="trash" size={20} color={colors.risk} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
            )}
          </>
        )}

        {/* ACCOUNT & PREFERENCES */}
        {renderSectionHeader('settings_account_prefs', 'account')}
        {!collapsed.account && (
        <View style={s.group}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="palette" size={20} color={colors.text} /></View>
              <Text style={s.rowLabel}>{t('settings_appearance')}</Text>
            </View>
            <View style={s.themePillRow}>
              {[
                { key: 'light', label: t('settings_theme_light') },
                { key: 'dark', label: t('settings_theme_dark') },
                { key: 'system', label: t('settings_theme_system') },
              ].map(o => (
                <TouchableOpacity
                  key={o.key}
                  style={[s.themePill, mode === o.key && s.themePillOn]}
                  onPress={() => setMode(o.key)}
                >
                  <Text style={[s.themePillText, mode === o.key && s.themePillTextOn]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="clock" size={20} color={colors.text} /></View>
              <Text style={s.rowLabel}>{t('settings_time_format')}</Text>
            </View>
            <View style={s.themePillRow}>
              {[
                { key: 'auto', label: t('settings_time_auto') },
                { key: '12h', label: t('settings_time_12h') },
                { key: '24h', label: t('settings_time_24h') },
              ].map(o => (
                <TouchableOpacity
                  key={o.key}
                  style={[s.themePill, timeFormat === o.key && s.themePillOn]}
                  onPress={() => setTimeFormat(o.key)}
                >
                  <Text style={[s.themePillText, timeFormat === o.key && s.themePillTextOn]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity style={s.row} onPress={() => setShowLanguagePicker(true)}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="globe" size={20} color={colors.text} /></View>
              <View>
                <Text style={s.rowLabel}>{t('settings_language')}</Text>
                <Text style={s.rowSub}>{currentLanguage?.native || 'English'}</Text>
              </View>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={handleSignOut}>
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="door" size={20} color={colors.text} /></View>
              <Text style={s.rowLabel}>{t('settings_signout')}</Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.row, { borderBottomWidth: 0 }]}
            onPress={handleDeleteAccount}
          >
            <View style={s.rowLeft}>
              <View style={s.rowIconBox}><FeatureIcon name="trash" size={20} color={colors.danger} /></View>
              <Text style={[s.rowLabel, { color: colors.danger }]}>{t('settings_delete')}</Text>
            </View>
            <Text style={[s.rowArrow, { color: colors.danger }]}>›</Text>
          </TouchableOpacity>
        </View>
        )}

        <Text style={s.version}>
          {`DoseTrace v${Constants.expoConfig?.version || '1.0.0'}`}{'\n'}
          {t('settings_not_medical')}
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* LANGUAGE PICKER MODAL */}
      <Modal
        visible={showLanguagePicker}
        animationType="slide"
        presentationStyle="pageSheet"
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
                  <Text style={s.langName}>{lang.name}</Text>
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
      <Modal visible={showEditProfile} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalNav}>
            <TouchableOpacity onPress={() => { setShowEditProfile(false); fetchUser(); }} style={{ minWidth: 60 }}>
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
              <View style={s.seg}>
                {[
                  { key: 'male', label: t('profile_gender_male') },
                  { key: 'female', label: t('profile_gender_female') },
                ].map(g => (
                  <TouchableOpacity
                    key={g.key}
                    style={[s.segItem, gender === g.key && s.segItemOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: gender === g.key }}
                    onPress={() => setGender(g.key)}
                  >
                    <Text style={[s.segText, gender === g.key && s.segTextOn]}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
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
                <Text style={s.rowArrow}>›</Text>
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
              <View style={s.editRow}>
                {[
                  { key: 'sedentary', label: t('profile_activity_sedentary') },
                  { key: 'moderate', label: t('profile_activity_moderate') },
                  { key: 'active', label: t('profile_activity_active') },
                  { key: 'very_active', label: t('profile_activity_very_active') },
                ].map(a => (
                  <TouchableOpacity
                    key={a.key}
                    style={[s.editPill, activityLevel === a.key && s.editPillOn]}
                    onPress={() => setActivityLevel(a.key)}
                  >
                    <Text style={[s.editPillText, activityLevel === a.key && s.editPillTextOn]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.editField}>
              <Text style={s.editLabel}>{t('profile_provider')}</Text>
              <View style={s.seg}>
                {[
                  { key: 'yes', label: t('profile_provider_yes') },
                  { key: 'no', label: t('profile_provider_no') },
                ].map(p => (
                  <TouchableOpacity
                    key={p.key}
                    style={[s.segItem, hasProvider === p.key && s.segItemOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: hasProvider === p.key }}
                    onPress={() => setHasProvider(p.key)}
                  >
                    <Text style={[s.segText, hasProvider === p.key && s.segTextOn]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={s.editDisclaimer}>{t('profile_data_note')}</Text>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* COUNTRY PICKER MODAL */}
      <Modal visible={showCountryPicker} animationType="slide" presentationStyle="pageSheet">
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
  sectionLabel: { fontSize: 11, fontWeight: '700', color: c.textFaint },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: 16, marginRight: 16, marginTop: 20, marginBottom: 8 },
  sectionChevron: { fontSize: 12, color: c.textFaint },
  group: { marginHorizontal: 16, backgroundColor: c.card, borderRadius: 14, overflow: 'hidden', ...c.shadowSoft },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 0.5, borderBottomColor: c.border },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIcon: { fontSize: 18, width: 28, textAlign: 'center' },
  rowIconBox: { width: 28, alignItems: 'center' },
  rowLabel: { fontSize: 14, color: c.text },
  rowSub: { fontSize: 11, color: c.textFaint, marginTop: 1 },
  rowArrow: { fontSize: 18, color: c.textFaint },
  version: { textAlign: 'center', fontSize: 11, color: c.textFaint, marginTop: 24, lineHeight: 18 },
  // Theme toggle
  themePillRow: { flexDirection: 'row', gap: 8 },
  themePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: c.card2, borderWidth: 0.5, borderColor: c.border },
  themePillOn: { backgroundColor: c.accentSoft, borderColor: c.accent, borderWidth: 1.5 },
  themePillText: { fontSize: 13, color: c.text, fontWeight: '600' },
  themePillTextOn: { color: c.accentSoftText, fontWeight: '600' },
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
  sectionLabel: { fontSize: 17, fontWeight: '600', color: c.ink, letterSpacing: 0, textTransform: 'none' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: 20, marginRight: 20, marginTop: 22, marginBottom: 10, minHeight: 32 },
  sectionChevron: { fontSize: 14, color: c.ink3 },
  group: { marginHorizontal: 16, backgroundColor: c.raised, borderRadius: 22, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 60, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
  rowLabel: { fontSize: 17, color: c.ink },
  rowSub: { fontSize: 13, color: c.ink2, marginTop: 2 },
  rowArrow: { fontSize: 20, color: c.tick },
  version: { textAlign: 'center', fontSize: 13, color: c.ink3, marginTop: 24, lineHeight: 18 },
  // Main-list leftovers that still drew the old tells: a selected theme / time pill
  // was a blue outline on a tint, the goal badge a tinted chip. Selection = 1.5 pt ink
  // outline on raised; tags = outline, like the plan badge.
  themePill: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 18, backgroundColor: 'transparent', borderWidth: 1, borderColor: c.line },
  themePillOn: { backgroundColor: c.raised, borderColor: c.ink, borderWidth: 1.5 },
  themePillText: { fontSize: 13, color: c.ink2, fontWeight: '500' }, // 13 keeps the three pills beside the label at 390 pt (as main)
  themePillTextOn: { color: c.ink, fontWeight: '600' },
  profileName: { fontSize: 22, fontWeight: '600', color: c.ink, marginBottom: 2 },
  goalBadge: { borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 13, flexShrink: 1 },
  goalBadgeText: { fontSize: 12, color: c.ink2, fontWeight: '500' },

  // Recently deleted protocols (inside the group card): the protocol color only as a
  // 9 pt dot; Restore is a secondary outline capsule in ink (no blue tint); delete
  // forever stays the risk-colored trash.
  deletedDot: { width: 9, height: 9, borderRadius: 4.5 },
  deletedActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  restoreBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: c.line },
  restoreBtnText: { fontSize: 15, fontWeight: '600', color: c.ink },
  deleteForeverBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

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
  editPill: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: c.line },
  editPillOn: { backgroundColor: c.raised, borderColor: c.ink, borderWidth: 1.5 },
  editPillText: { fontSize: 15, color: c.ink2, fontWeight: '400' },
  editPillTextOn: { color: c.ink, fontWeight: '600' },
  seg: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 14, backgroundColor: c.well },
  segItem: { flex: 1, minHeight: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1, borderColor: 'transparent' },
  segItemOn: { backgroundColor: c.raised, borderColor: c.line },
  segText: { fontSize: 15, fontWeight: '500', color: c.ink2 },
  segTextOn: { color: c.ink, fontWeight: '700' },
  editDisclaimer: { fontSize: 13, lineHeight: 18, color: c.ink3, marginTop: 24, paddingHorizontal: 4 },
});
