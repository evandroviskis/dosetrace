import { useState, useCallback } from 'react';
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
  Clipboard,
  TextInput,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase, getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { getMyReferralCode, getReferralStats, createReferralCode } from '../lib/referrals';
import {
  getAllDataForExport, getActiveProtocols as getLocalProtocols,
  getLogsSince, getActiveVials as getLocalVials,
  clearLocalDatabase, getDeletedProtocols as getLocalDeletedProtocols,
  restoreProtocol as restoreProtocolDB, getNewestVialForProtocol,
  updateVial, getProtocolById,
} from '../lib/database';
import { stopSyncEngine, requestSync } from '../lib/sync';
import { Analytics } from '../lib/analytics';
import { COUNTRIES } from '../lib/countries';
import { syncAllNotifications } from '../lib/notifications';

const MEDICAL_DISCLAIMER = `WELLNESS DISCLAIMER

DoseTrace is a personal wellness tracking tool designed for informational and organizational purposes only.

DoseTrace does not provide medical advice, diagnosis, or treatment recommendations. All content within this app is for general informational purposes only.

Nothing in this app should be construed as medical advice or used as a substitute for professional medical advice, diagnosis, or treatment. Always seek the guidance of a qualified healthcare provider before starting, adjusting, or stopping any wellness regimen.

All features within DoseTrace are passive data recording utilities. They help you log and visualize your own self-reported data. They do not validate, endorse, or recommend any specific protocol, dosage, or outcome. All mathematical calculations are estimates based on user-provided inputs and are not biological predictions.

By using DoseTrace, you acknowledge that:

- You are using this app at your own risk
- You take full responsibility for any decisions made based on information recorded in this app
- DoseTrace and Outcom are not liable for any harm arising from use of this app
- This app is not intended to diagnose, treat, cure, or prevent any disease or medical condition

If you are experiencing a medical emergency, call emergency services immediately.`;

const PRIVACY_POLICY = `PRIVACY POLICY

Last updated: April 2026

Outcom operates the DoseTrace mobile application.

DATA WE COLLECT
When you create an account, we collect your email address. You may optionally provide your name, gender, birth month and year, country, wellness goals, activity level, and whether you work with a healthcare provider. Protocol data, dose logs, vial records, and reminders you create are stored locally on your device. Premium users may sync this data to our secure cloud servers.

HOW WE USE YOUR DATA
We use your data to provide and personalize the DoseTrace service. Optional profile information (name, gender, age range, country, goals, activity level) may be used in aggregate and anonymized form to improve our service and develop wellness partnerships. We never share individual user data with third parties. We do not sell your personal data. We do not use your health data for advertising purposes.

DATA STORAGE
Free accounts: All data stored locally on your device only.
Premium accounts: Data encrypted and stored on Supabase secure cloud servers in the United States.

YOUR RIGHTS
You may request deletion of your account and all associated data at any time by contacting hello@dosetrace.io.

CHILDREN
DoseTrace is not intended for use by individuals under the age of 18.

CHANGES
We may update this policy periodically. Continued use of the app constitutes acceptance of the updated policy.

CONTACT
hello@dosetrace.io`;

const TERMS = `TERMS OF SERVICE

Last updated: April 2026

By downloading or using DoseTrace, you agree to these terms.

USE OF THE APP
DoseTrace is provided for personal wellness tracking purposes only. You must be 18 or older to use this app. You are responsible for maintaining the confidentiality of your account credentials.

MEDICAL DISCLAIMER
DoseTrace does not provide medical advice. See our Medical Disclaimer for full details.

PREMIUM SUBSCRIPTION
Premium features are available via monthly subscription at $5.99/month. Subscriptions auto-renew unless cancelled at least 24 hours before the renewal date. Manage subscriptions in your Apple ID settings.

INTELLECTUAL PROPERTY
All content, features, and functionality of DoseTrace are owned by Outcom and protected by applicable intellectual property laws.

LIMITATION OF LIABILITY
Outcom shall not be liable for any indirect, incidental, or consequential damages arising from your use of DoseTrace.

TERMINATION
We reserve the right to terminate accounts that violate these terms.

GOVERNING LAW
These terms are governed by the laws of the State of Florida, United States.

CONTACT
hello@dosetrace.io`;

const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr',
  'month_may', 'month_jun', 'month_jul', 'month_aug',
  'month_sep', 'month_oct', 'month_nov', 'month_dec',
];

const BIRTH_YEARS = [];
const _thisYear = new Date().getFullYear();
for (let y = _thisYear - 18; y >= _thisYear - 90; y--) BIRTH_YEARS.push(y);

function LegalModal({ visible, onClose, title, content, doneLabel }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={s.modal}>
        <View style={s.modalNav}>
          <View style={{ width: 60 }} />
          <Text style={s.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={{ width: 60, alignItems: 'flex-end' }}>
            <Text style={s.modalClose}>{doneLabel}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
          <Text style={s.legalText}>{content}</Text>
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function SettingsScreen({ navigation }) {
  const { language, setLanguage, t, LANGUAGES } = useLanguage();
  const [user, setUser] = useState(null);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [doseReminders, setDoseReminders] = useState(true);
  const [checkinReminders, setCheckinReminders] = useState(true);
  const [vialAlerts, setVialAlerts] = useState(true);
  const [silentMode, setSilentMode] = useState(false);
  const [persistentReminders, setPersistentReminders] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [myReferralCode, setMyReferralCode] = useState(null);
  const [referralCount, setReferralCount] = useState(0);
  const [codeCopied, setCodeCopied] = useState(false);
  const [hasCredit, setHasCredit] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  // Profile fields
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState('');
  const [birthMonth, setBirthMonth] = useState(null);
  const [birthYear, setBirthYear] = useState(null);
  const [country, setCountry] = useState('');
  const [primaryGoals, setPrimaryGoals] = useState([]);
  const [activityLevel, setActivityLevel] = useState('');
  const [hasProvider, setHasProvider] = useState('');
  const [deletedProtocols, setDeletedProtocols] = useState([]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  useFocusEffect(
    useCallback(() => {
      fetchUser();
      fetchDeletedProtocols();
    }, [])
  );

  async function fetchUser() {
    const user = await getCachedUser();
    setUser(user);
    if (user) {
      // Fetch or create referral code
      let code = await getMyReferralCode(user.id);
      if (!code) {
        code = await createReferralCode(user.id);
      }
      setMyReferralCode(code);
      const stats = await getReferralStats(user.id);
      setReferralCount(stats.referralCount);
      setHasCredit((user.user_metadata?.bloodwork_credits || 0) > 0);
      setAnalyticsEnabled(user.user_metadata?.analytics_opt_in !== false);
      setDoseReminders(user.user_metadata?.dose_reminders !== false);
      setCheckinReminders(user.user_metadata?.checkin_reminders !== false);
      setVialAlerts(user.user_metadata?.vial_alerts !== false);
      setSilentMode(user.user_metadata?.silent_mode === true);
      setPersistentReminders(user.user_metadata?.persistent_reminders === true);
      // Load profile
      setDisplayName(user.user_metadata?.display_name || '');
      setGender(user.user_metadata?.gender || '');
      setBirthMonth(user.user_metadata?.birth_month ?? null);
      setBirthYear(user.user_metadata?.birth_year ?? null);
      setCountry(user.user_metadata?.country || '');
      const pg = user.user_metadata?.primary_goal || '';
      setPrimaryGoals(pg ? pg.split(',').filter(Boolean) : []);
      setActivityLevel(user.user_metadata?.activity_level || '');
      setHasProvider(user.user_metadata?.has_provider || '');
    }
  }

  async function toggleNotificationPref(key, val, setter) {
    setter(val);
    await supabase.auth.updateUser({ data: { [key]: val } });
    // Re-sync all notifications to respect the new preference
    syncAllNotifications().catch(() => {});
  }

  async function toggleAnalytics(val) {
    setAnalyticsEnabled(val);
    await supabase.auth.updateUser({ data: { analytics_opt_in: val } });
  }

  async function saveProfile() {
    try {
      await supabase.auth.updateUser({
        data: {
          display_name: displayName.trim() || null,
          gender: gender || null,
          birth_month: birthMonth,
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
      Alert.alert(t('error'), e.message);
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

      let report = `DOSETRACE ADHERENCE REPORT\n`;
      report += `${'─'.repeat(40)}\n`;
      report += `User: ${userName}\n`;
      report += `Period: ${dateRange} (30 days)\n`;
      report += `Overall adherence: ${overallAdherence}%\n`;
      report += `Active protocols: ${protocols.length}\n`;
      report += `Total doses logged: ${totalAll}\n`;
      report += `${'─'.repeat(40)}\n\n`;

      protocolStats.forEach(ps => {
        report += `${ps.name}\n`;
        report += `  Dose: ${ps.dose} · ${ps.frequency}\n`;
        report += `  Taken: ${ps.taken} · Skipped: ${ps.skipped} · Adherence: ${ps.adherence}%\n`;
        report += `  Current streak: ${ps.streak} day${ps.streak !== 1 ? 's' : ''}\n`;
        if (ps.vialRemaining !== null) {
          report += `  Vial: ${ps.vialRemaining} doses remaining\n`;
        }
        report += `\n`;
      });

      report += `${'─'.repeat(40)}\n`;
      report += `Generated by DoseTrace on ${now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}\n`;
      report += `This is a user-generated wellness tracking summary.\n`;
      report += `It does not constitute medical advice or a clinical record.\n`;

      await Share.share({
        message: report,
        title: t('settings_report_title'),
      });
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
    setExporting(false);
  }

  function handleCopyCode() {
    if (!myReferralCode) return;
    Clipboard.setString(myReferralCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  async function handleShareReferral() {
    if (!myReferralCode) return;
    const message = t('referral_share_message').replace('{code}', myReferralCode);
    try {
      await Share.share({ message });
      Analytics.referralShared(myReferralCode);
    } catch (e) { /* cancelled */ }
  }

  async function handleSignOut() {
    Alert.alert(t('settings_signout'), t('settings_signout_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('settings_signout'),
        style: 'destructive',
        onPress: async () => { await supabase.auth.signOut(); },
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
      if (!session) { Alert.alert(t('error'), 'No active session'); return; }

      // Call Edge Function to delete auth account (data stays in Supabase for research)
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-user`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Deletion failed');

      // Clear local data and sign out
      stopSyncEngine();
      clearLocalDatabase();
      await supabase.auth.signOut();
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
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

  function handleContactSupport() {
    Linking.openURL('mailto:hello@dosetrace.io?subject=DoseTrace Support');
  }

  function handleRateApp() {
    Linking.openURL('https://apps.apple.com/app/dosetrace');
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

      <ScrollView showsVerticalScrollIndicator={false}>

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
                <Text style={s.planBadgeText}>{t('settings_free_plan')}</Text>
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

        {/* PREMIUM CARD */}
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
              <Text style={s.premiumCheck}>✓</Text>
              <Text style={s.premiumFeatText}>{f}</Text>
            </View>
          ))}
          <TouchableOpacity
            style={s.premiumBtn}
            onPress={() => navigation.navigate('Paywall')}
          >
            <Text style={s.premiumBtnText}>{t('settings_premium_btn')}</Text>
          </TouchableOpacity>
        </View>

        {/* REFERRAL PROGRAM */}
        <View style={s.referralCard}>
          <Text style={s.referralTitle}>{t('referral_title')}</Text>
          <Text style={s.referralSub}>{t('referral_subtitle')}</Text>
          {hasCredit && (
            <View style={s.referralCreditBanner}>
              <Text style={s.referralCreditText}>{t('referral_credit')}</Text>
            </View>
          )}
          {myReferralCode && (
            <>
              <Text style={s.referralCodeLabel}>{t('referral_your_code')}</Text>
              <View style={s.referralCodeRow}>
                <Text style={s.referralCodeText}>{myReferralCode}</Text>
                <TouchableOpacity style={s.referralCopyBtn} onPress={handleCopyCode}>
                  <Text style={s.referralCopyBtnText}>
                    {codeCopied ? t('referral_copied') : t('referral_copy')}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={s.referralStatsRow}>
                <Text style={s.referralStatsLabel}>{t('referral_stats')}</Text>
                <Text style={s.referralStatsValue}>{referralCount}</Text>
              </View>
              <TouchableOpacity style={s.referralShareBtn} onPress={handleShareReferral}>
                <Text style={s.referralShareBtnText}>{t('referral_share')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* PREFERENCES */}
        <Text style={s.sectionLabel}>{t('settings_preferences')}</Text>
        <View style={s.group}>
          <TouchableOpacity
            style={[s.row, { borderBottomWidth: 0 }]}
            onPress={() => setShowLanguagePicker(true)}
          >
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>🌐</Text>
              <View>
                <Text style={s.rowLabel}>{t('settings_language')}</Text>
                <Text style={s.rowSub}>{currentLanguage?.native || 'English'}</Text>
              </View>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* NOTIFICATIONS */}
        <Text style={s.sectionLabel}>{t('settings_notifications').toUpperCase()}</Text>
        <View style={s.group}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>🔔</Text>
              <View>
                <Text style={s.rowLabel}>{t('settings_dose_reminders')}</Text>
                <Text style={s.rowSub}>{t('settings_dose_reminders_sub')}</Text>
              </View>
            </View>
            <Switch
              value={doseReminders}
              onValueChange={(v) => toggleNotificationPref('dose_reminders', v, setDoseReminders)}
              trackColor={{ true: '#185FA5' }}
            />
          </View>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>💬</Text>
              <View>
                <Text style={s.rowLabel}>{t('settings_checkin')}</Text>
                <Text style={s.rowSub}>{t('settings_checkin_sub')}</Text>
              </View>
            </View>
            <Switch
              value={checkinReminders}
              onValueChange={(v) => toggleNotificationPref('checkin_reminders', v, setCheckinReminders)}
              trackColor={{ true: '#185FA5' }}
            />
          </View>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>⚗️</Text>
              <View>
                <Text style={s.rowLabel}>{t('settings_vial_alerts')}</Text>
                <Text style={s.rowSub}>{t('settings_vial_alerts_sub')}</Text>
              </View>
            </View>
            <Switch
              value={vialAlerts}
              onValueChange={(v) => toggleNotificationPref('vial_alerts', v, setVialAlerts)}
              trackColor={{ true: '#185FA5' }}
            />
          </View>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>🔇</Text>
              <View>
                <Text style={s.rowLabel}>{t('settings_silent')}</Text>
                <Text style={s.rowSub}>{t('settings_silent_sub')}</Text>
              </View>
            </View>
            <Switch
              value={silentMode}
              onValueChange={(v) => toggleNotificationPref('silent_mode', v, setSilentMode)}
              trackColor={{ true: '#185FA5' }}
            />
          </View>
          <View style={[s.row, { borderBottomWidth: 0 }]}>
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>🔁</Text>
              <View>
                <Text style={s.rowLabel}>{t('settings_persistent')}</Text>
                <Text style={s.rowSub}>{t('settings_persistent_sub')}</Text>
              </View>
            </View>
            <Switch
              value={persistentReminders}
              onValueChange={(v) => toggleNotificationPref('persistent_reminders', v, setPersistentReminders)}
              trackColor={{ true: '#185FA5' }}
            />
          </View>
        </View>

        {/* DATA & PRIVACY */}
        <Text style={s.sectionLabel}>{t('settings_data_privacy')}</Text>
        <View style={s.group}>
          <TouchableOpacity style={s.row} onPress={() => setShowPrivacy(true)}>
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>🔒</Text>
              <Text style={s.rowLabel}>{t('settings_privacy_policy')}</Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={() => setShowTerms(true)}>
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>📋</Text>
              <Text style={s.rowLabel}>{t('settings_terms')}</Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={() => setShowDisclaimer(true)}>
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>🛡️</Text>
              <Text style={s.rowLabel}>{t('settings_disclaimer')}</Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>📊</Text>
              <View>
                <Text style={s.rowLabel}>{t('settings_analytics')}</Text>
                <Text style={s.rowSub}>{t('settings_analytics_sub')}</Text>
              </View>
            </View>
            <Switch
              value={analyticsEnabled}
              onValueChange={toggleAnalytics}
              trackColor={{ true: '#185FA5' }}
            />
          </View>
          <TouchableOpacity
            style={s.row}
            onPress={handleAdherenceReport}
            disabled={exporting}
          >
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>📈</Text>
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
              <Text style={s.rowIcon}>📥</Text>
              <View>
                <Text style={s.rowLabel}>{t('settings_export_title')}</Text>
                <Text style={s.rowSub}>{t('settings_export_sub')}</Text>
              </View>
            </View>
            <Text style={s.rowArrow}>{exporting ? '...' : '›'}</Text>
          </TouchableOpacity>
        </View>

        {/* SUPPORT */}
        <Text style={s.sectionLabel}>{t('settings_support')}</Text>
        <View style={s.group}>
          <TouchableOpacity style={s.row} onPress={() => navigation.navigate('FAQ')}>
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>❓</Text>
              <Text style={s.rowLabel}>{t('settings_faq')}</Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={handleContactSupport}>
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>💌</Text>
              <Text style={s.rowLabel}>{t('settings_contact')}</Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.row, { borderBottomWidth: 0 }]}
            onPress={handleRateApp}
          >
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>⭐</Text>
              <Text style={s.rowLabel}>{t('settings_rate')}</Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* RECENTLY DELETED PROTOCOLS */}
        {deletedProtocols.length > 0 && (
          <>
            <Text style={s.sectionLabel}>{t('settings_recently_deleted')}</Text>
            <View style={s.group}>
              {deletedProtocols.map((p, idx) => (
                <View key={p.id} style={[s.row, idx === deletedProtocols.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={s.rowLeft}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.color || '#999' }} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowLabel}>{p.name}</Text>
                      <Text style={s.rowSub}>{t('protocols_deleted_ago').replace('{days}', Math.ceil((Date.now() - new Date(p.deleted_at).getTime()) / 86400000))}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => restoreProtocol(p.id)}
                    style={{ backgroundColor: '#E6F1FB', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#185FA5' }}>{t('protocols_restore')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ACCOUNT */}
        <Text style={s.sectionLabel}>{t('settings_account')}</Text>
        <View style={s.group}>
          <TouchableOpacity style={s.row} onPress={handleSignOut}>
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>🚪</Text>
              <Text style={s.rowLabel}>{t('settings_signout')}</Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.row, { borderBottomWidth: 0 }]}
            onPress={handleDeleteAccount}
          >
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>🗑️</Text>
              <Text style={[s.rowLabel, { color: '#E24B4A' }]}>{t('settings_delete')}</Text>
            </View>
            <Text style={[s.rowArrow, { color: '#E24B4A' }]}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.version}>
          {t('settings_version')}{'\n'}
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
            <Text style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 20 }}>
              {t('settings_language_sub')}
            </Text>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[s.langRow, language === lang.code && s.langRowSelected]}
                onPress={() => {
                  setLanguage(lang.code);
                  setShowLanguagePicker(false);
                }}
              >
                <Text style={s.langFlag}>{lang.flag}</Text>
                <View style={s.langInfo}>
                  <Text style={s.langNative}>{lang.native}</Text>
                  <Text style={s.langName}>{lang.name}</Text>
                </View>
                {language === lang.code && (
                  <Text style={s.langCheck}>✓</Text>
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
        content={MEDICAL_DISCLAIMER}
        doneLabel={t('done')}
      />
      <LegalModal
        visible={showPrivacy}
        onClose={() => setShowPrivacy(false)}
        title={t('settings_privacy_policy')}
        content={PRIVACY_POLICY}
        doneLabel={t('done')}
      />
      <LegalModal
        visible={showTerms}
        onClose={() => setShowTerms(false)}
        title={t('settings_terms')}
        content={TERMS}
        doneLabel={t('done')}
      />

      {/* EDIT PROFILE MODAL */}
      <Modal visible={showEditProfile} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalNav}>
            <TouchableOpacity onPress={() => { setShowEditProfile(false); fetchUser(); }} style={{ minWidth: 60 }}>
              <Text style={s.modalClose}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>{t('profile_edit_title')}</Text>
            <TouchableOpacity onPress={saveProfile} style={{ minWidth: 60, alignItems: 'flex-end' }}>
              <Text style={[s.modalClose, { fontWeight: '700' }]}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={s.editLabel}>{t('profile_name')}</Text>
            <TextInput
              style={s.editInput}
              placeholder={t('profile_name_placeholder')}
              placeholderTextColor="#aaa"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoCorrect={false}
            />

            <Text style={s.editLabel}>{t('profile_gender')}</Text>
            <View style={s.editPillRow}>
              {[
                { key: 'male', label: t('profile_gender_male') },
                { key: 'female', label: t('profile_gender_female') },
                { key: 'prefer_not_to_say', label: t('profile_gender_skip') },
              ].map(g => (
                <TouchableOpacity
                  key={g.key}
                  style={[s.editPill, gender === g.key && s.editPillOn]}
                  onPress={() => setGender(g.key)}
                >
                  <Text style={[s.editPillText, gender === g.key && s.editPillTextOn]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.editLabel}>{t('profile_birth')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={s.editPillRow}>
                {MONTH_KEYS.map((mk, idx) => (
                  <TouchableOpacity
                    key={mk}
                    style={[s.editPill, birthMonth === idx && s.editPillOn]}
                    onPress={() => setBirthMonth(idx)}
                  >
                    <Text style={[s.editPillText, birthMonth === idx && s.editPillTextOn]}>{t(mk)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={s.editPillRow}>
                {BIRTH_YEARS.map(y => (
                  <TouchableOpacity
                    key={y}
                    style={[s.editPill, birthYear === y && s.editPillOn]}
                    onPress={() => setBirthYear(y)}
                  >
                    <Text style={[s.editPillText, birthYear === y && s.editPillTextOn]}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.editLabel}>{t('profile_country')}</Text>
            <TouchableOpacity
              style={s.editInput}
              onPress={() => { setCountrySearch(''); setShowCountryPicker(true); }}
            >
              <Text style={{ fontSize: 15, color: country ? '#111' : '#aaa' }}>
                {country || t('profile_country_placeholder')}
              </Text>
            </TouchableOpacity>

            <Text style={s.editLabel}>{t('profile_goal')}</Text>
            <Text style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>{t('profile_goal_multi_hint')}</Text>
            <View style={[s.editPillRow, { flexWrap: 'wrap' }]}>
              {[
                { key: 'fitness', label: t('profile_goal_fitness') },
                { key: 'strength', label: t('profile_goal_strength') },
                { key: 'fat_loss', label: t('profile_goal_fat_loss') },
                { key: 'endurance', label: t('profile_goal_endurance') },
                { key: 'body_composition', label: t('profile_goal_body') },
                { key: 'wellness', label: t('profile_goal_wellness') },
                { key: 'energy', label: t('profile_goal_energy') },
                { key: 'sleep', label: t('profile_goal_sleep') },
                { key: 'hormonal_balance', label: t('profile_goal_hormonal') },
                { key: 'longevity', label: t('profile_goal_longevity') },
                { key: 'immune', label: t('profile_goal_immune') },
                { key: 'recovery', label: t('profile_goal_recovery') },
                { key: 'skin_collagen', label: t('profile_goal_skin') },
                { key: 'mood', label: t('profile_goal_mood') },
                { key: 'sexual_health', label: t('profile_goal_sexual') },
                { key: 'joint_bone', label: t('profile_goal_joint') },
                { key: 'cardiovascular', label: t('profile_goal_cardio') },
                { key: 'stress', label: t('profile_goal_stress') },
              ].map(g => {
                const selected = primaryGoals.includes(g.key);
                return (
                  <TouchableOpacity
                    key={g.key}
                    style={[s.editPill, selected && s.editPillOn, { marginBottom: 8 }]}
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
            </View>

            <Text style={s.editLabel}>{t('profile_activity')}</Text>
            <View style={s.editPillRow}>
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

            <Text style={s.editLabel}>{t('profile_provider')}</Text>
            <View style={s.editPillRow}>
              {[
                { key: 'yes', label: t('profile_provider_yes') },
                { key: 'no', label: t('profile_provider_no') },
              ].map(p => (
                <TouchableOpacity
                  key={p.key}
                  style={[s.editPill, hasProvider === p.key && s.editPillOn]}
                  onPress={() => setHasProvider(p.key)}
                >
                  <Text style={[s.editPillText, hasProvider === p.key && s.editPillTextOn]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
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
          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
            <TextInput
              style={[s.editInput, { marginBottom: 0 }]}
              placeholder={t('profile_country_search')}
              placeholderTextColor="#aaa"
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
          </View>
          <FlatList
            data={COUNTRIES.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase()))}
            keyExtractor={item => item}
            style={{ flex: 1, paddingHorizontal: 20 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.langRow, country === item && s.langRowSelected]}
                onPress={() => {
                  setCountry(item);
                  setShowCountryPicker(false);
                }}
              >
                <Text style={[s.langNative, { flex: 1 }]}>{item}</Text>
                {country === item && <Text style={s.langCheck}>✓</Text>}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  header: { paddingHorizontal: 20, paddingVertical: 20, backgroundColor: '#fff' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#111' },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, margin: 16, padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 0.5, borderColor: '#eee' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#185FA5', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: 'white', fontSize: 18, fontWeight: '600' },
  profileInfo: { flex: 1 },
  profileEmail: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 4 },
  planBadge: { backgroundColor: '#E6F1FB', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' },
  planBadgeText: { fontSize: 11, color: '#0C447C', fontWeight: '500' },
  premiumCard: { marginHorizontal: 16, marginBottom: 8, padding: 16, backgroundColor: '#185FA5', borderRadius: 16 },
  premiumTitle: { fontSize: 16, fontWeight: '600', color: 'white', marginBottom: 6 },
  premiumSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 14, lineHeight: 18 },
  premiumFeat: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  premiumCheck: { color: '#9FE1CB', fontWeight: '600', fontSize: 13 },
  premiumFeatText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', flex: 1 },
  premiumBtn: { backgroundColor: 'white', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  premiumBtnText: { color: '#185FA5', fontSize: 13, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#aaa', letterSpacing: 0.5, marginLeft: 16, marginTop: 20, marginBottom: 8 },
  group: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 0.5, borderColor: '#eee', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIcon: { fontSize: 18, width: 28, textAlign: 'center' },
  rowLabel: { fontSize: 14, color: '#111' },
  rowSub: { fontSize: 11, color: '#aaa', marginTop: 1 },
  rowArrow: { fontSize: 18, color: '#ccc' },
  version: { textAlign: 'center', fontSize: 11, color: '#aaa', marginTop: 24, lineHeight: 18 },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  modalClose: { fontSize: 14, color: '#185FA5', fontWeight: '600' },
  modalBody: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  legalText: { fontSize: 13, color: '#444', lineHeight: 22 },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, backgroundColor: '#f9f9f9', borderRadius: 12, marginBottom: 8, borderWidth: 0.5, borderColor: '#eee' },
  langRowSelected: { backgroundColor: '#f0f6ff', borderColor: '#185FA5', borderWidth: 1.5 },
  langFlag: { fontSize: 28 },
  langInfo: { flex: 1 },
  langNative: { fontSize: 15, fontWeight: '600', color: '#111' },
  langName: { fontSize: 12, color: '#888', marginTop: 1 },
  langCheck: { fontSize: 18, color: '#185FA5', fontWeight: '600' },
  // Referral
  referralCard: { marginHorizontal: 16, marginTop: 8, marginBottom: 8, padding: 18, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#185FA5' },
  referralTitle: { fontSize: 16, fontWeight: '700', color: '#185FA5', marginBottom: 4 },
  referralSub: { fontSize: 12, color: '#666', lineHeight: 18, marginBottom: 14 },
  referralCreditBanner: { backgroundColor: '#E8F5E9', padding: 10, borderRadius: 8, marginBottom: 14 },
  referralCreditText: { fontSize: 13, fontWeight: '600', color: '#2E7D32', textAlign: 'center' },
  referralCodeLabel: { fontSize: 11, fontWeight: '600', color: '#aaa', letterSpacing: 0.5, marginBottom: 6 },
  referralCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  referralCodeText: { fontSize: 28, fontWeight: '700', color: '#111', letterSpacing: 6 },
  referralCopyBtn: { backgroundColor: '#E6F1FB', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  referralCopyBtnText: { fontSize: 12, fontWeight: '600', color: '#185FA5' },
  referralStatsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: '#eee', marginBottom: 12 },
  referralStatsLabel: { fontSize: 13, color: '#666' },
  referralStatsValue: { fontSize: 18, fontWeight: '700', color: '#185FA5' },
  referralShareBtn: { backgroundColor: '#185FA5', padding: 14, borderRadius: 10, alignItems: 'center' },
  referralShareBtnText: { color: 'white', fontSize: 14, fontWeight: '600' },
  // Profile enhancements
  profileName: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 2 },
  profileBadgeRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  goalBadge: { backgroundColor: '#FEF3E2', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  goalBadgeText: { fontSize: 11, color: '#92400E', fontWeight: '500' },
  // Edit profile modal
  editLabel: { fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 16 },
  editInput: { borderWidth: 0.5, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 15, color: '#111', backgroundColor: '#fafafa', marginBottom: 4 },
  editPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  editPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f0f0f0', borderWidth: 0.5, borderColor: '#ddd' },
  editPillOn: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  editPillText: { fontSize: 13, color: '#555', fontWeight: '500' },
  editPillTextOn: { color: '#fff', fontWeight: '600' },
  editDisclaimer: { fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 20, lineHeight: 16 },
});