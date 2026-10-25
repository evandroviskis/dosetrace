import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { QUESTIONS_KEY } from './lib/siteQuestion';
import { resetAllSelections } from './lib/bookSelection';
import { clearAllDrafts } from './lib/draftStore';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WindowSizeRoot } from './lib/windowSize';
import { View, Text, ActivityIndicator, TouchableOpacity, Linking, Platform, AppState } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, exchangeAuthCodeFromUrl, isProfileComplete, takeAccountGone, probeAccountGone } from './lib/supabase';
import { guardSignedIn, resolveAccountAsk, discardAndContinue, accountAskSheet, ownerBlocksSync, OWNER_KEY } from './lib/accountGuard';
import { clearAIConsent } from './lib/aiConsent';
import { clearAnalyticsQueue } from './lib/analytics';
import { clearTeamMessages } from './lib/teamMessages';
import { clearExportFile } from './lib/exportFile';
import AccountLanguageSync from './components/AccountLanguageSync';
import { TABLES, getPendingChanges } from './lib/syncCore';
import { setSignInHandler, noteSignedIn } from './lib/signInWork';
import { consumeExplicitSignIn, beginExplicitSignIn, endExplicitSignIn } from './lib/explicitSignIn';
import { deviceFlow, deviceGate, subscribeDevice, readDeviceState, continueAfterVerdict, checkAccountGoneFor } from './lib/deviceRuntime';
import { noticeSheet, verdictSheet, askSheet, signOutSheet } from './lib/deviceCopy';
import { UpdateInviteSheet, UpdateRequiredScreen, UpdateReadyBar } from './components/UpdateNotice';
import { useUpdateNotice } from './components/useUpdateNotice';
import { isUpdateTap } from './lib/updateRules';
import { requestForcedInvite } from './lib/updateRuntime';
import { runSignOut } from './lib/settingsSignOut';
import { signInDeviceStep, startupDeviceStep } from './lib/signInDevice';
import { createBusyGuard } from './lib/busyGuard';
import { signOutIntended } from './lib/accountActions';
import { hasSeenOnboarding, markSeenOnboarding, clearSeenOnboarding, applyPendingProfile, clearOnboarding, discardStashNow, endStashFreshness, loadOnboarding } from './lib/onboardingStore';
import { hasAnswers } from './lib/pendingProfile';
import { clearAuthDraft } from './lib/authDraft';
import { openRecoveryLink, loadPendingRecovery, discardPendingRecovery, signOutCurrentForRecovery, savePendingRecovery } from './lib/recoveryLink';
import { completeLocalSignOut } from './lib/signOutCore';
import { tabBarStyle } from './lib/tabBarStyle';
import { setStrictRemoval } from './lib/secureStore';
import { onSignedOutNow, afterSignedOut, checkAccountGone, completePendingWipe, sessionAfterPendingWipe, markerOnSignIn, registerWipe, bumpSignInGeneration, signInGeneration, WIPE_PENDING_KEY } from './lib/signedOut';
import { recoveryDecision, linkKey, isTransientLinkError, unsyncedCount } from './lib/recoveryFlow';
import { parseAppleReturn } from './lib/appleWebCheck';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import FoodChatScreen from './screens/FoodChatScreen';
import { initPurchases, logOutPurchases } from './lib/purchases';
import { registerReminderRefresh } from './lib/backgroundTasks';
import { initNotifications, askPermissionForArrivedProtocols, syncAllNotifications, watchExactAlarms, cancelAllNotifications, dismissAllNotifications, registerPushToken, RC_START_KEY } from './lib/notifications';
import { getRealityStart, runRealityMigration, clearRealityDeviceFlags } from './lib/realityCheck';
import { notifTapTarget, responseKey, launchTapStale } from './lib/notificationPlan';
import { readAppLanguage } from './lib/appLanguage';
import { consumeIntentionalSignOut } from './lib/authIntent';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { ThemeProvider, useTheme } from './lib/theme';
import { installFontMapping, useAppFonts } from './lib/fonts';

// Route every fontWeight in the app to Plus Jakarta Sans. Installed at module
// load, before any component renders.
installFontMapping();
import { initDatabase, clearLocalDatabase, getLocalDataUserId, getDB } from './lib/database';
import { startSyncEngine, stopSyncEngine, fullImportFromCloud, isLocalDBEmpty, requestSync, addSyncListener, waitForSyncIdle, runSyncExclusive } from './lib/sync';
import { isForegroundStale } from './lib/stillGoingGate';
import { bootView, bootTabTarget, lastSignedInUser } from './lib/todaySkeleton';
import { loadTodayLayout, forgetTodayLayout } from './lib/todayLayoutStore';
import { TodayOpening } from './screens/components/TodaySkeleton';

// ErrorBoundary renders outside LanguageProvider, so it carries its own
// dependency-free translations for the crash screen.
const ERROR_BOUNDARY_STRINGS = {
  en: { title: 'Something went wrong', message: 'The app encountered an unexpected error. Please restart DoseTrace.', retry: 'Try Again' },
  es: { title: 'Algo salió mal', message: 'La aplicación encontró un error inesperado. Por favor, reinicia DoseTrace.', retry: 'Reintentar' },
  pt: { title: 'Algo deu errado', message: 'O aplicativo encontrou um erro inesperado. Por favor, reinicie o DoseTrace.', retry: 'Tentar novamente' },
  fr: { title: 'Un problème est survenu', message: "L'application a rencontré une erreur inattendue. Veuillez redémarrer DoseTrace.", retry: 'Réessayer' },
  de: { title: 'Etwas ist schiefgelaufen', message: 'Die App ist auf einen unerwarteten Fehler gestoßen. Bitte starte DoseTrace neu.', retry: 'Erneut versuchen' },
  it: { title: 'Qualcosa è andato storto', message: "L'app ha riscontrato un errore imprevisto. Riavvia DoseTrace.", retry: 'Riprova' },
};

// Final review 2026-10-20: does this sync event change what the reminders are planned from? An
// import always does; a pass only when it pulled dose logs, protocols, vials or food logs, or the open
// reality check changed (openCheckChanged).
function syncTouchesReminders(e, openCheckChanged) {
  const REMINDER_TABLES = ['dose_logs', 'protocols', 'vials', 'food_logs'];
  if (!e) return false;
  if (e.type === 'import_complete') return true;
  if (e.type !== 'sync_complete') return false;
  return !!openCheckChanged || (Array.isArray(e.changed) && e.changed.some((t) => REMINDER_TABLES.includes(t)));
}

class ErrorBoundary extends React.Component {
  state = { hasError: false, lang: 'en' };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidMount() {
    // Best-effort language detection — must never throw on the error path.
    try {
      // Gate B F8: the one language rule (lib/appLanguage: the stored choice, else the phone's).
      readAppLanguage()
        .then(lang => {
          if (lang && ERROR_BOUNDARY_STRINGS[lang]) this.setState({ lang });
        })
        .catch(() => {});
    } catch {
      // ignore — fall back to English
    }
  }
  render() {
    if (this.state.hasError) {
      const str = ERROR_BOUNDARY_STRINGS[this.state.lang] || ERROR_BOUNDARY_STRINGS.en;
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 32 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 12 }}>{str.title}</Text>
          <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24 }}>
            {str.message}
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{ backgroundColor: '#185FA5', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>{str.retry}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

import TodayScreen from './screens/TodayScreen';
import ProtocolsScreen from './screens/ProtocolsScreen';
import LogScreen from './screens/LogScreen';
import SettingsScreen from './screens/SettingsScreen';
import AuthScreen from './screens/AuthScreen';
import OnboardingFlowScreen from './screens/OnboardingFlowScreen';
import FAQScreen from './screens/FAQScreen';
import TeamMessagesScreen from './screens/TeamMessagesScreen';
import ReminderCheckScreen from './screens/ReminderCheckScreen';
import BodyScreen from './screens/BodyScreen';
import JourneyScreen from './screens/JourneyScreen';
import PaywallScreen from './screens/PaywallScreen';
import AgeConfirmScreen from './screens/AgeConfirmScreen';
import { needsAdultConfirmation } from './lib/adultGate';
import { DTSheet } from './screens/components/ProtocolParts';
import SerumCurveScreen from './screens/SerumCurveScreen';
import ProgressScreen from './screens/ProgressScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// ── Tab-bar line icons ─────────────────────────────────────────
// Clean monochrome SVG icons that tint with the accent. Active tabs get a
// filled glyph, inactive a stroked outline — consistent weight across all four
// (replaces the old mismatched emoji set).
function TodayGlyph({ color, focused }) {
  // Four rounded squares — filled when active, outlined when not.
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      {[[3, 3], [14, 3], [3, 14], [14, 14]].map(([x, y], i) => (
        <Rect key={i} x={x} y={y} width={7} height={7} rx={2.2}
          fill={focused ? color : 'none'} stroke={color} strokeWidth={focused ? 0 : 1.9} />
      ))}
    </Svg>
  );
}
function ProtocolsGlyph({ color, focused }) {
  // Capsule / pill.
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path d="M10.5 20.5 20.5 10.5a5.66 5.66 0 0 0-8-8L2.5 12.5a5.66 5.66 0 0 0 8 8Z"
        stroke={color} strokeWidth={focused ? 2.2 : 1.9} strokeLinejoin="round"
        fill={focused ? color : 'none'} fillOpacity={focused ? 0.16 : 0} />
      <Path d="M8.5 8.5 15.5 15.5" stroke={color} strokeWidth={focused ? 2.2 : 1.9} strokeLinecap="round" />
    </Svg>
  );
}
function BodyGlyph({ color, focused }) {
  // Person / torso.
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={7.5} r={3.6}
        fill={focused ? color : 'none'} stroke={color} strokeWidth={focused ? 0 : 1.9} />
      <Path d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"
        stroke={color} strokeWidth={focused ? 2.2 : 1.9} strokeLinecap="round"
        fill={focused ? color : 'none'} fillOpacity={focused ? 0.16 : 0} />
    </Svg>
  );
}
function JourneyGlyph({ color, focused }) {
  // Milestone flag — the "am I on track" journey.
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path d="M6 21 V4" stroke={color} strokeWidth={focused ? 2.2 : 1.9} strokeLinecap="round" />
      <Path d="M6 4.5 C9.5 2.8 13 6.2 17.5 4.5 L17.5 10.5 C13 12.2 9.5 8.8 6 10.5 Z"
        stroke={color} strokeWidth={focused ? 2.2 : 1.9} strokeLinejoin="round"
        fill={focused ? color : 'none'} fillOpacity={focused ? 0.16 : 0} />
    </Svg>
  );
}
function SettingsGlyph({ color, focused }) {
  // Gear.
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"
        stroke={color} strokeWidth={focused ? 2 : 1.7} strokeLinejoin="round"
        fill={focused ? color : 'none'} fillOpacity={focused ? 0.14 : 0} />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={focused ? 2 : 1.7}
        fill={focused ? color : 'none'} fillOpacity={focused ? 0.5 : 0} />
    </Svg>
  );
}

function TabIcon({ Glyph, focused }) {
  const { colors } = useTheme();
  return <Glyph color={focused ? colors.ink : colors.ink3} focused={focused} />; // Graduated: active = ink, never blue
}

// The five tabs; the real app and its opening (BootTabs, A-135) draw the same bar from these.
const tabDefs = (t) => [
  { name: 'Today', label: t('tab_today'), Glyph: TodayGlyph, component: TodayScreen },
  { name: 'Protocols', label: t('tabbar_protocols'), Glyph: ProtocolsGlyph, component: ProtocolsScreen },
  { name: 'Journey', label: t('tab_journey'), Glyph: JourneyGlyph, component: JourneyScreen },
  { name: 'Body', label: t('tab_body'), Glyph: BodyGlyph, component: BodyScreen },
  { name: 'Settings', label: t('tabbar_settings'), Glyph: SettingsGlyph, component: SettingsScreen },
];
const TAB_NAMES = tabDefs(() => '').map((tab) => tab.name);

// Graduated tab bar (DESIGN.md §5): flat on the ground, hairline on top, active = ink + 600,
// inactive = ink3. Never blue. The bar sits above the system's bottom bar (Android).
function tabScreenOptions(colors, insets) {
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.ink,
    tabBarInactiveTintColor: colors.ink3,
    tabBarStyle: tabBarStyle(colors, insets.bottom),
    tabBarLabelStyle: {
      fontSize: 11,
      fontWeight: '600',
      marginTop: 2,
    },
  };
}

function MainTabs() {
  const { t } = useLanguage();
  const tabs = tabDefs(t);

  const { colors } = useTheme();
  const insets = useSafeAreaInsets(); // the tab bar sits above the system's bottom bar (Android)
  return (
    <Tab.Navigator
      screenOptions={tabScreenOptions(colors, insets)}
    >
      {tabs.map(tab => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            tabBarLabel: tab.label,
            tabBarIcon: ({ focused }) => (
              <TabIcon Glyph={tab.Glyph} focused={focused} />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Log" component={LogScreen} />
      <Stack.Screen name="SerumCurve" component={SerumCurveScreen} />
      <Stack.Screen name="Progress" component={ProgressScreen} />
      <Stack.Screen name="FAQ" component={FAQScreen} />
      <Stack.Screen name="TeamMessages" component={TeamMessagesScreen} />
      <Stack.Screen name="ReminderCheck" component={ReminderCheckScreen} />
      <Stack.Screen name="Paywall" component={PaywallScreen} />
      {/* The ONE food chat (FL-31/32/37): Today's hero, Journey's hero and the 8 PM
          reminder all open it. Journey redesign part 21 (founder 2026-10-02): full screen,
          sliding up from the bottom (no iOS sheet with the screen behind peeking above);
          swipe down or Done to close. */}
      <Stack.Screen name="FoodChat" component={FoodChatScreen} options={{ gestureEnabled: true, gestureDirection: 'vertical', cardStyleInterpolator: CardStyleInterpolators.forVerticalIOS }} />
    </Stack.Navigator>
  );
}

// Rendered inside ThemeProvider so it can theme the status bar + navigation
// chrome (fixes white flashes during transitions in dark mode).
function ThemedRoot({ session, navigationRef, onNavReady, recovery, onRecoveryDone, switchAsk, onSwitchContinue, onSwitchCancel, onSwitchClose, justConfirmed, onConfirmedShown, linkFailed, onLinkFailedShown, seenOnboarding, onFinishOnboarding, onBackToOnboarding, authEntry, device, deviceHeld, onDeviceSheetClose, onVerdictContinue, onVerdictRetry, onUseHere, onAskSignOut, onNoticeSeen, switchSignOut, onSwitchSignOutClose, accountHeld, accountAsk, onAccountSave, onAccountDiscard, onAccountRetry, onAccountAskClose }) {
  const { colors, isDark } = useTheme();
  const { t, language, timeFormat } = useLanguage();

  // DV-242 (AD-102 = B): another account signed in over a previous account's changes never backed
  // up. Locked: the person picks one of the two (lib/accountGuard).
  const accountSheet = accountAsk
    ? accountAskSheet(t, { previous: accountAsk.previous, error: !!accountAsk.error, unreadable: !!accountAsk.unreadable, onSave: onAccountSave, onDiscard: onAccountDiscard, onRetry: onAccountRetry, onSignOut: onAccountSave })
    : null;

  // Signup confirmation came back through the deep link — the user has no other way to
  // know it worked, so say so; an emailed link that could not be used (expired, used, or
  // opened on another phone) says so too instead of doing nothing (journey review
  // 2026-10-03). Both are DoseTrace sheets (PA-66).
  // A reset link for ANOTHER account than the one signed in asks first, naming both (PA-75).
  // A confirm link that cannot be exchanged says the address may already be confirmed (the
  // server confirms it before redirecting — Gate B).
  const linkSheet = switchAsk
    ? {
      icon: 'alert',
      title: t('reset_switch_title'),
      body: t('reset_switch_msg').replace('{link}', switchAsk.pending.email || '').split('{current}').join(switchAsk.current || ''),
      buttons: [{ label: t('cancel'), kind: 'secondary', onPress: onSwitchCancel }, { label: t('reset_switch_continue'), kind: 'primary', onPress: onSwitchContinue }],
    }
    : justConfirmed
      ? { icon: 'check', title: t('confirm_email_done_title'), body: t('confirm_email_done_msg'), buttons: [{ label: t('ok'), kind: 'primary' }] }
      : linkFailed
        ? (linkFailed === 'signout_failed'
          // The reset-link account switch could not sign the other account out: "Couldn't sign out".
          ? { icon: 'alert', title: t('settings_signout_failed_title'), body: t('settings_signout_failed_body'), buttons: [{ label: t('ok'), kind: 'primary' }] }
          : { icon: 'alert', title: t('auth_link_failed_title'), body: t(linkFailed === 'confirm' ? 'auth_confirm_link_failed_msg' : 'auth_link_failed_msg'), buttons: [{ label: t('ok'), kind: 'primary' }] })
        : null;
  // Closing a sheet only hides it; the buttons carry the actions (DTSheet runs them after).
  const closeLinkSheet = () => {
    if (switchAsk) onSwitchClose && onSwitchClose();
    else if (justConfirmed) onConfirmedShown && onConfirmedShown();
    else onLinkFailedShown && onLinkFailedShown();
  };

  // A-119 (approved pictures docs/design/a119-*.html): the account's device sheets, before any other.
  //   screen 2 / 2b / account deleted — the server confirmed this phone lost the account: locked, on
  //     any route, signed in or not (the verdict was stored before anything was wiped);
  //   screen 4 — another device holds the account and this phone never signed in while it did:
  //     locked, while signed in;
  //   the sign-out sheet of the reset-link account switch (screens 3 / 3b / 5a / 5b);
  //   screen 1 / 1b — the takeover notice: once, on Main only (after the 18+ and profile steps).
  const onMain = !!session && !recovery && !accountHeld && isProfileComplete(session.user) && !needsAdultConfirmation(session.user && session.user.user_metadata);
  const dev = device || {};
  // The one sign-out sheet (the reset-link switch, screen 4's "Sign out of this phone") comes before
  // screen 4 itself, which shows again when the person stays.
  // Gate B F1: while another account's local data holds this one (DV-242), the cross-account sheet
  // wins — no device sheet's wipe ever runs over the other account's unsent rows.
  const deviceSheet = deviceHeld || accountHeld ? null
    : dev.verdict ? verdictSheet({ t, language, timeFormat, verdict: dev.verdict, onContinue: onVerdictContinue, onRetry: onVerdictRetry })
      : switchSignOut ? signOutSheet({ t, language, timeFormat, offline: switchSignOut.r.offline, summary: switchSignOut.r.summary, lastBackup: switchSignOut.r.lastBackup, onAnyway: switchSignOut.onAnyway, onStay: switchSignOut.onStay })
        : dev.ask && session && dev.ask.userId === session.user.id ? askSheet({ t, language, timeFormat, ask: dev.ask, onUseHere, onSignOut: onAskSignOut })
          : dev.notice && onMain && dev.notice.userId === session.user.id ? noticeSheet({ t, language, timeFormat, notice: dev.notice, onOk: onNoticeSeen })
            : null;
  const closeDeviceSheet = () => {
    if (switchSignOut && !dev.verdict) onSwitchSignOutClose && onSwitchSignOutClose();
    else onDeviceSheetClose && onDeviceSheetClose();
  };

  // A-127 (picture docs/design/a127-update-notice.html): below the minimum version — the founder's
  // per-platform minimum or A-119's server floor (DT003) — one full screen that cannot be closed,
  // over everything, signed in or not; nothing is deleted. Below the latest — the invitation, at app
  // open, on the tabs only, never over another sheet (components/useUpdateNotice).
  const upd = useUpdateNotice({ session, onMain, language, navigationRef, blocked: !!(deviceSheet || linkSheet || accountSheet) });
  const updateRequired = upd.required;
  if (updateRequired) {
    return (
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <UpdateRequiredScreen reason={updateRequired.reason} onUpdate={upd.onRequiredUpdate} />
      </>
    );
  }

  const navTheme = navThemeFor(colors, isDark);
  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} onReady={onNavReady} onStateChange={() => { if (onNavReady) onNavReady(); upd.poke(); }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {recovery ? (
          // Opened from a password-reset email: force the set-new-password step
          // even though the code exchange already created a session, so the user
          // can't be silently dropped into the app with the old password.
          <Stack.Screen name="ResetPassword">
            {() => <ResetPasswordScreen recovery={recovery} onDone={onRecoveryDone} />}
          </Stack.Screen>
        ) : !session ? (
          seenOnboarding ? (
            // Returning / signed-out: the auth screen only (sign in or create).
            // The old multi-step OnboardingScreen was deleted — the value-first
            // intro below is the single onboarding, and AuthScreen the single
            // auth surface.
            <Stack.Screen name="Auth">
              {() => <AuthScreen onBack={onBackToOnboarding} initialMode={authEntry.mode} />}
            </Stack.Screen>
          ) : (
            // First launch: the value-first intro flow collects the profile
            // (name / birthday / gender / goal / activity) BEFORE an account
            // exists and stashes it locally. onDone marks it seen and drops the
            // user onto AuthScreen; applyPendingProfile writes the stash to the
            // account right after SIGNED_IN.
            <Stack.Screen name="OnboardingFlow">
              {() => <OnboardingFlowScreen onDone={onFinishOnboarding} />}
            </Stack.Screen>
          )
        ) : accountHeld ? (
          // DV-242: the local data still belongs to another account — an empty screen (the boot
          // ground) under the sheet, so this account never sees it; nothing syncs meanwhile.
          <Stack.Screen name="AccountHold" component={BootEmpty} />
        ) : !isProfileComplete(session.user) ? (
          // A session with an incomplete profile — every Apple/Google sign-in, or a
          // returning account missing a now-required field — completes it through the
          // SAME onboarding flow (signed-in mode: prefilled, only the missing steps,
          // writes straight to the account). On save, the USER_UPDATED auth event
          // refreshes `session` and this gate clears. (Replaces CompleteProfileScreen.)
          <Stack.Screen name="CompleteProfile">
            {() => <OnboardingFlowScreen session={session} />}
          </Stack.Screen>
        ) : needsAdultConfirmation(session.user?.user_metadata) ? (
          // An old account whose stored birth year makes it under 18 confirms once that the
          // user is 18 or older (founder 2026-10-03). Until then the app stays behind this
          // sheet — export, delete and sign out are offered; nothing is deleted automatically.
          <Stack.Screen name="AgeConfirm">
            {() => <AgeConfirmScreen session={session} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Main" component={MainStack} />
        )}
      </Stack.Navigator>
      <DTSheet config={deviceSheet || linkSheet} onClose={deviceSheet ? closeDeviceSheet : closeLinkSheet} />
      {/* DV-242: the cross-account sheet; A-119's device sheets come before it (one locked sheet at a time). */}
      <DTSheet config={deviceSheet ? null : accountSheet} onClose={() => onAccountAskClose && onAccountAskClose()} />
      <UpdateInviteSheet config={deviceSheet || linkSheet ? null : upd.invite} onUpdate={upd.onUpdate} onLater={upd.onLater} />
      <UpdateReadyBar visible={upd.ready} onRestart={upd.onRestart} />
    </NavigationContainer>
  );
}

function navThemeFor(colors, isDark) {
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      primary: colors.accent,
    },
  };
}

// A-135 (founder 2026-10-17, picture a135-today-skeleton): while the app starts after a signed-in
// session, it already shows Today — the real tab bar (same options) over Today's opening skeleton
// (TodayOpening); the other tabs are empty and taps wait until the app is up. When the start ends,
// the real Today draws the same header and blocks in the same place.
function BootEmpty() {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.ground }} />;
}

// A-135 council (2): a tab tapped here does not navigate (the app is not up yet) but is remembered
// (onTabTap); the real app opens on the last one when the start ends (App onRootNavReady).
function BootTabs({ onTabTap }) {
  const { t } = useLanguage();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <NavigationContainer theme={navThemeFor(colors, isDark)}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Tab.Navigator screenOptions={tabScreenOptions(colors, insets)} screenListeners={({ route }) => ({ tabPress: (e) => { e.preventDefault(); if (onTabTap) onTabTap(route.name); } })}>
        {tabDefs(t).map((tab) => (
          <Tab.Screen
            key={tab.name}
            name={tab.name}
            component={tab.name === 'Today' ? TodayOpening : BootEmpty}
            options={{ tabBarLabel: tab.label, tabBarIcon: ({ focused }) => <TabIcon Glyph={tab.Glyph} focused={focused} /> }}
          />
        ))}
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// The loading gate's screen (lib/todaySkeleton bootView): Today's opening after a signed-in
// session; the full-screen spinner when the last session was not signed in (welcome / sign in
// keep what they had); a plain ground for the few ms before the mould, fonts, language and theme
// are read (never English or the wrong theme first).
function BootScreen({ lastUser, fontsLoaded, onTabTap }) {
  const { ready: langReady } = useLanguage();
  const { ready: themeReady, colors } = useTheme();
  const view = bootView({ lastUser, fontsLoaded, langReady, themeReady });
  if (view === 'spinner') return <ThemedLoading />;
  if (view === 'today') return <BootTabs onTabTap={onTabTap} />;
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}

function ThemedLoading() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // A password-reset link opened in an isolated client (lib/recoveryLink): the pending
  // recovery while the user sets the new password; it survives an app kill for an hour.
  const [recovery, setRecovery] = useState(null);
  const [switchAsk, setSwitchAsk] = useState(null); // { pending, current } — a link for another account
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false); // false | 'reset' | 'confirm' | 'signout_failed'
  // A-119 one active device: the device state (lib/deviceRuntime) — the verdict, the screen-4
  // question, the takeover notice — read at once at start (a stored verdict needs no network) and
  // again whenever it changes. deviceHeld hides the sheet while its button's action runs.
  const [device, setDevice] = useState(null);
  const [deviceHeld, setDeviceHeld] = useState(false);
  const [switchSignOut, setSwitchSignOut] = useState(null); // the reset-link switch's sign-out sheet
  const switchGuard = useRef(null);
  if (!switchGuard.current) switchGuard.current = createBusyGuard();
  const reloadDevice = useCallback(() => { readDeviceState().then(setDevice).catch(() => {}); }, []);
  useEffect(() => {
    const unsub = subscribeDevice(reloadDevice);
    reloadDevice();
    // OD-6: a verdict shown again counts what this phone holds now (a notification "Taken" since).
    deviceFlow().refreshVerdict().then(reloadDevice).catch(() => {});
    return unsub;
  }, [reloadDevice]);
  // DV-242: { previous, pending, userId } while the cross-account sheet is up; guardTick re-reads
  // the local data owner after a discard.
  const [accountAsk, setAccountAsk] = useState(null);
  const [guardTick, setGuardTick] = useState(0);
  const seenLinks = useRef(new Set()); // emailed links already being handled in this run
  // How the auth screen opens: Create account (from the last onboarding step, with the
  // consent box ticked by the four confirmations just made) or Sign in (from the welcome
  // screen). undefined = a returning signed-out user (AuthScreen decides from the stash).
  const [authEntry, setAuthEntry] = useState({ mode: undefined, consent: false });
  // Whether the first-launch intro flow has been completed. null = not resolved
  // yet; the loading gate below waits for it, so we never flash the welcome
  // screen before the intro (or vice-versa) on first frame.
  const [seenOnboarding, setSeenOnboarding] = useState(null);
  const navigationRef = useRef(null);
  const fontsLoaded = useAppFonts();
  // A-135: the owner of Today's mould = the last signed-in user (undefined until read, null none).
  const [bootUser, setBootUser] = useState(undefined);
  useEffect(() => {
    loadTodayLayout().then((st) => setBootUser(lastSignedInUser(st))).catch(() => setBootUser(null));
  }, []);

  // Notification taps (A-44: each lands on its reason; the food question opens the one food
  // chat, FL-18/37) wait here until the signed-in app (the 'Main' route) exists — a tap that
  // LAUNCHED the app arrives before navigation does.
  // Everything the intended sign-out wipe touches (lib/signedOut), shared by the SIGNED_OUT path
  // and a cold start that finds a wipe left pending (Gate B round 3 N2).
  const wipeDeps = () => ({
    stopSyncEngine,
    waitForSyncIdle,
    runExclusive: runSyncExclusive,
    getSignInGeneration: signInGeneration,
    // 'wipe:<owner id>' (or '1' when the data has no owner); false removes it (G2).
    setWipePending: (v) => (v ? AsyncStorage.setItem(WIPE_PENDING_KEY, v === true ? '1' : String(v)) : AsyncStorage.removeItem(WIPE_PENDING_KEY)),
    getLocalOwner: () => getLocalDataUserId(),
    isWipePending: () => AsyncStorage.getItem(WIPE_PENDING_KEY), // '1' or 'deleted:<id>' (account deletion)
    // A cold start still holding a deleted account's session signs it out locally.
    signOutLocally: async () => { setStrictRemoval(true); try { const r = await completeLocalSignOut(supabase.auth); consumeIntentionalSignOut(); return r; } finally { setStrictRemoval(false); } },
    clearLocalDatabase,
    cancelAllNotifications,
    dismissAllNotifications,
    logOutPurchases,
    clearOnboarding,
    removeRcStart: () => AsyncStorage.removeItem(RC_START_KEY),
    clearRealityDeviceFlags, // S-03 per-device flags
    clearSeenOnboarding,
    removeQuestions: () => AsyncStorage.removeItem(QUESTIONS_KEY), // S-25 open site questions
    resetAllSelections, // S-26: the next account starts with no open right-page items
    clearAllDrafts, // S-26 BK-14: typed-but-unsaved drafts stay with their account
    forgetTodayLayout, // A-135 council: Today's layout memory (keyed by the user id) goes with the account
    forgetDeviceState: () => deviceFlow().clearOnSignOut(), // A-119: screen-4 question, pending takeover, notice, secret
    clearAIConsent, // DV-007 (DL-55): the AI consent goes with the account
    forgetLocalOwner: () => AsyncStorage.removeItem(OWNER_KEY), // DV-242: whose data this phone holds
    clearAnalyticsQueue, // council regulatory review (1.3.1): queued analytics rows go with the account
    clearTeamMessages, // A-163: the kept copy of the team's messages goes with the account
    clearExportFile, // A-167 council: the Download my data file goes with the account
  });

  // DV-242 (AD-102 = B): the cross-account guard's effects (lib/accountGuard).
  const guardDeps = () => ({
    getLocalOwner: () => getLocalDataUserId(),
    countPending: (id) => unsyncedCount(getDB(), id, TABLES, getPendingChanges),
    readOwnerLabel: () => AsyncStorage.getItem(OWNER_KEY),
    rememberOwner: (u) => AsyncStorage.setItem(OWNER_KEY, JSON.stringify({ id: u.id, email: u.email || null })),
    forgetLocalOwner: () => AsyncStorage.removeItem(OWNER_KEY),
    clearLocalDatabase,
    removeRcStart: () => AsyncStorage.removeItem(RC_START_KEY),
    clearRealityDeviceFlags, // S-03 per-device flags
    cancelAllNotifications, // the prior user's dose reminders never fire for the new one
    dismissAllNotifications, // Gate B 5: nor do the ones already delivered stay on the lock screen
    clearAllDrafts, // S-26 BK-14: typed-but-unsaved text stays with its account
    resetAllSelections, // S-26: no open right-page item from the other account
    removeQuestions: () => AsyncStorage.removeItem(QUESTIONS_KEY), // S-25 open site questions
    clearAIConsent, // DV-007
    clearAnalyticsQueue, // the previous account's queued analytics rows (council regulatory review)
    clearTeamMessages, // A-163: the previous account's kept team messages
    clearExportFile, // A-167 council: the previous account's export file
    getSession: async () => { const { data } = await supabase.auth.getSession(); return (data && data.session) || null; },
    ask: (a) => { lastAskRef.current = a; setAccountAsk(a); },
    // "Sign in as {previous} first": this account signs out on this phone only — not an intended
    // sign-out, so nothing is wiped; the previous account's rows wait for it.
    signOutLocally: () => wipeDeps().signOutLocally(),
  });
  // The local data owner is another account → the UI holds (no screen of this account shows it).
  const sessionUid = (session && session.user && session.user.id) || null;
  const lastAskRef = useRef(null); // the last cross-account sheet, to bring back on a failed choice
  const ownerHeld = useMemo(() => {
    if (!sessionUid) return false;
    try { return ownerBlocksSync(getLocalDataUserId(), sessionUid); } catch { return false; }
  }, [sessionUid, guardTick]);
  // Gate B 3: an open sheet holds too (the guard failed closed: the owner could not be read).
  const accountHeld = !!sessionUid && (ownerHeld || !!accountAsk);
  // An unexpected guard error never means "continue": the unreadable-owner sheet (Try again / Sign out, never Discard).
  const failClosed = (user) => {
    try { guardDeps().ask({ unreadable: true, previous: null, pending: null, userId: user && user.id }); } catch { /* ignore */ }
    return 'held';
  };
  const accountHeldRef = useRef(false);
  accountHeldRef.current = accountHeld;

  // The sign-in work after the cross-account sheet ("Try again" / "Discard and continue"; the cold
  // start and SIGNED_IN run the same steps inline below). A-119 (lib/signInDevice): the device check
  // first — a sign-in the person just made claims the account through its noted intent (DL-102) —
  // then the sync engine, the import or a sync; screen 2 / 4: nothing imported, nothing scheduled.
  const continueSignedIn = async (s) => {
    const step = await signInDeviceStep({
      explicit: false, userId: s.user.id, flow: deviceFlow(), gate: deviceGate, startSync: startSyncEngine,
      isLocalEmpty: isLocalDBEmpty, fullImport: fullImportFromCloud, requestSync, reload: reloadDevice,
    });
    // Gate B doubt 3: the stashed intro answers go to this account after its device step (as on
    // SIGNED_IN); refused (screen 2 / 4) they stay on the phone, never dropped.
    applyPendingProfile(supabase).catch(() => {});
    if (step.held) return;
    // One-time move of the open reality check + calculator inputs into the
    // synced tables (S-03), AFTER the import and BEFORE scheduling reminders.
    // A-119 round 3: not while a takeover's rebuild is queued (step.migrate).
    if (step.migrate) await runRealityMigration().catch(() => {});
    // Schedule reminders AFTER the import so they reflect the user's data. AD-88 (DV-054): never a
    // permission request here (the sync listener asks once when this account's protocols arrive).
    syncAllNotifications()
      .then(() => registerPushToken())
      .catch(() => {});
  };

  // DV-242: the two choices of the cross-account sheet.
  const onAccountSave = () => {
    resolveAccountAsk('save', guardDeps(), { lastAsk: lastAskRef.current })
      .then(() => setAuthEntry({ mode: 'signin', consent: false }))
      .catch(() => {});
  };
  // Re-verification 2: "Try again" on the owner-unreadable sheet runs the guard once more (it asks
  // again itself when it still cannot read; the session unreadable → the same sheet back).
  const onAccountRetry = async () => {
    let s = null;
    try { s = await guardDeps().getSession(); } catch { s = null; }
    if (!s || !s.user) { failClosed(null); return; }
    let guard = 'held';
    try { guard = await guardSignedIn(guardDeps(), { sessionUser: s.user }); } catch { guard = failClosed(s.user); }
    setGuardTick((n) => n + 1);
    if (guard !== 'continue') return;
    lastAskRef.current = null;
    await continueSignedIn(s).catch(() => {}); // the device step starts the sync engine (A-119)
  };
  // Gate B 4: a session that cannot be read brings the sheet back with an error (retry), never a
  // holding screen without buttons.
  const onAccountDiscard = async () => {
    const r = await discardAndContinue(guardDeps(), { lastAsk: lastAskRef.current });
    if (r.status !== 'continue') return;
    lastAskRef.current = null;
    setGuardTick((n) => n + 1);
    await continueSignedIn(r.session).catch(() => {}); // the device step starts the sync engine (A-119)
  };

  registerWipe(wipeDeps); // account deletion wipes at once with the same steps (lib/accountActions)
  const pendingNavRef = useRef(null);
  const flushPendingNav = useCallback(() => {
    const nav = navigationRef.current;
    const target = pendingNavRef.current;
    if (!target || !nav || (nav.isReady && !nav.isReady())) return;
    const names = (nav.getRootState && nav.getRootState()?.routeNames) || [];
    if (!names.includes('Main')) return;
    pendingNavRef.current = null;
    nav.navigate('Main', { screen: target.screen, params: target.params });
  }, []);
  // A-135 council (2): the last tab tapped on the opening; applied once, when the real navigator is
  // ready (a notification tap waiting to be routed wins; signed out / a profile to complete drops it).
  const bootTabRef = useRef(null);
  const rememberBootTab = useCallback((name) => { bootTabRef.current = name; }, []);
  const onRootNavReady = useCallback(() => {
    const nav = navigationRef.current;
    const tab = bootTabRef.current;
    if (tab && nav && (!nav.isReady || nav.isReady())) {
      bootTabRef.current = null;
      const names = (nav.getRootState && nav.getRootState()?.routeNames) || [];
      const target = bootTabTarget({ tapped: tab, routeNames: names, tabNames: TAB_NAMES, pendingNav: !!pendingNavRef.current });
      if (target) nav.navigate('Main', target);
    }
    flushPendingNav();
  }, [flushPendingNav]);
  // Each tap is routed once, whether it comes from the running listener or the
  // launch path (persisted, so a relaunch never replays an old tap).
  const routedRef = useRef(new Set());
  const routeTap = useCallback(async (response, maxAgeMs) => {
    const target = notifTapTarget(response, Date.now());
    if (!target) return false;
    const key = responseKey(response);
    if (routedRef.current.has(key)) return true;
    routedRef.current.add(key);
    if (launchTapStale(response, Date.now(), maxAgeMs)) return true; // a stale launch response (iOS dates are seconds)
    try {
      const raw = await AsyncStorage.getItem('dosetrace_nav_handled');
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list) && list.includes(key)) return true;
      await AsyncStorage.setItem('dosetrace_nav_handled', JSON.stringify([...(Array.isArray(list) ? list : []), key].slice(-30)));
    } catch { /* best effort — the in-memory set still dedupes this run */ }
    if (isUpdateTap(response)) requestForcedInvite(); // A-127 UN-6: the version push opens the invitation
    pendingNavRef.current = target;
    flushPendingNav();
    return true;
  }, [flushPendingNav]);

  // Auth deep links from emailed links. Both carry a PKCE `code` that must be
  // exchanged for a session:
  //   dosetrace://reset-password  → show the set-new-password screen
  //   dosetrace://confirm-email   → signup confirmed, tell the user so
  // Without these the links fall back to the Site URL (dosetrace.io) and the
  // user dead-ends on the marketing site.
  useEffect(() => {
    let cancelled = false;
    const currentSession = () => supabase.auth.getSession().then(({ data }) => (data && data.session) || null).catch(() => null);
    // The link's account vs the one signed in: same / nobody → the reset screen; another
    // account → ask first (PA-75).
    const routeRecovery = async (pending) => {
      const cur = await currentSession();
      if (cancelled) return;
      const decision = recoveryDecision({ currentUserId: cur?.user?.id || null, linkUserId: pending.userId });
      if (decision === 'ask') setSwitchAsk({ pending, current: cur?.user?.email || '' });
      else setRecovery(pending);
    };
    const handleUrl = async (url) => {
      if (!url) return;
      const u = String(url);
      const isReset = u.includes('reset-password');
      const isConfirm = u.includes('confirm-email');
      const isAppleReturn = u.includes('auth-callback');
      if (!isReset && !isConfirm && !isAppleReturn) return;
      // Each emailed link is handled once. In memory at once (the launch URL and the url event
      // can deliver the same link together); on disk only after it worked or the server
      // refused it, so Android's re-delivered launch intent stays silent while a link that
      // failed offline can simply be tapped again (Gate B + re-review).
      const key = linkKey(u);
      if (seenLinks.current.has(key)) return;
      seenLinks.current.add(key);
      let handled = [];
      try { const raw = await AsyncStorage.getItem('dosetrace_links_handled'); handled = raw ? JSON.parse(raw) : []; } catch { handled = []; }
      if (!Array.isArray(handled)) handled = [];
      if (handled.includes(key)) return;
      const rememberLink = (k) => { AsyncStorage.setItem('dosetrace_links_handled', JSON.stringify([...handled, k].slice(-20))).catch(() => {}); };
      const forgetInMemory = () => { seenLinks.current.delete(key); };
      const cur = await currentSession();
      const hasSession = !!cur?.user;
      if (cancelled) return;
      if (isReset) {
        const r = await openRecoveryLink(u);
        if (cancelled) return;
        if (r.error) {
          if (!isTransientLinkError(r.error)) rememberLink(key); else forgetInMemory();
          // The reset screen may already be up from an earlier open of this link.
          if (!(await loadPendingRecovery())) setLinkFailed('reset');
          return;
        }
        rememberLink(key);
        routeRecovery(r.pending);
        return;
      }
      if (isAppleReturn) {
        // Android killed the app while the Apple tab was open: the relaunch brings the code.
        // With a session the in-app browser already finished it; otherwise sign in once.
        if (hasSession) { rememberLink(key); return; }
        const p = parseAppleReturn(u);
        if (!p.code) { rememberLink(key); return; }
        // A-119 DL-102: the person's own Apple sign-in (the app was killed on Apple's page).
        beginExplicitSignIn();
        const { error } = await supabase.auth.exchangeCodeForSession(p.code).finally(endExplicitSignIn);
        if (cancelled) return;
        if (error && isTransientLinkError(error)) forgetInMemory(); else rememberLink(key);
        return;
      }
      if (isConfirm) {
        // Signed in already: the server confirmed the address before redirecting; the app
        // has nothing to change (and never switches accounts on a confirm link).
        if (hasSession) { rememberLink(key); return; }
        const { ok, error } = await exchangeAuthCodeFromUrl(u);
        if (cancelled) return;
        if (!ok) {
          if (!isTransientLinkError(error)) rememberLink(key); else forgetInMemory();
          setLinkFailed('confirm');
          return;
        }
        rememberLink(key);
        setJustConfirmed(true);
      }
    };
    // A reset left half-way (the app was killed on Reset password) comes back first.
    loadPendingRecovery().then((p) => { if (p && !cancelled) routeRecovery(p); }).catch(() => {});
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => { cancelled = true; sub.remove(); };
  }, []);

  useEffect(() => {
    // Initialize local SQLite database
    initDatabase();

    // Initialize notification handler AFTER app mount (lazy-loaded, safe)
    initNotifications();

    // Start background sync engine (connectivity listener)
    startSyncEngine();

    // Set up notification response listener (tap-to-open)
    let notifResponseSub = null;
    try {
      const N = require('expo-notifications');
      notifResponseSub = N.addNotificationResponseReceivedListener(response => {
        const data = response?.notification?.request?.content?.data;
        if (!data) return;

        // Action buttons (Mark complete / snooze / "Nothing else today") are handled once, at
        // module scope, by lib/notificationActions (works with the app killed). Here only the
        // navigation: A-44 — every tap lands on its reason (lib/notificationPlan notifTapTarget):
        // a dose on that dose at the top of Today, a vial on its protocol, the weigh-in on
        // "Log today's weight", day 21 on the reality check, the food question on the chat.
        routeTap(response, 0);
      });
      // Cold start: a tap that LAUNCHED the app may never
      // reach the listener above — route the launch response too (deduped with
      // the listener by responseKey; older than 12 h = stale, ignored).
      if (N.getLastNotificationResponseAsync) {
        N.getLastNotificationResponseAsync().then((last) => { if (last) routeTap(last, 12 * 3600 * 1000); }).catch(() => {});
      }
    } catch {
      // expo-notifications not available — skip listener
    }

    // Top up rolling one-shot notifications whenever the app comes to the
    // foreground. syncAllNotifications otherwise runs only on cold start / SIGNED_IN,
    // so a warm-resumed process would never re-arm the tail of a rolling window
    // (e.g. the 7-day food-log nudge set under a 21-day reality-check — journey F2).
    // Throttled so rapid foreground/background toggles don't thrash.
    // Token auto-refresh only while the app is in the foreground (lib/supabase.js: off at creation
    // so a headless start never refreshes). A cold start in the foreground starts it at once.
    if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
    let lastFgSync = 0;
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
      if (state !== 'active') return;
      // A-119 OD-4: the active-device check is the first server call of every foreground (a background
      // verdict, or one that came while the app slept, shows screen 2 now).
      // Not throttled; the sync pass below asks again first, and a stored verdict schedules nothing.
      // OD-6: a verdict shown again counts what the phone holds now (a notification "Taken" since).
      deviceFlow().refreshVerdict().then(reloadDevice).catch(reloadDevice);
      supabase.auth.getSession().then(({ data: { session } }) => (session?.user?.id ? deviceGate('foreground') : null)).catch(() => null);
      // A-127 / A-156: every foreground re-writes this phone's push row (app version after a store
      // auto-update, the language) — one upsert, never a permission prompt.
      supabase.auth.getSession().then(({ data: { session } }) => (session?.user?.id ? registerPushToken({ ifChanged: true }) : null)).catch(() => null);
      const nowTs = Date.now();
      // At most once a minute, with the first-sync gate's own rule: a clock moved back is stale too
      // (a negative difference never asked for a sync again — council fix 1, 2026-10-16).
      if (!isForegroundStale(nowTs, lastFgSync)) return;
      lastFgSync = nowTs;
      supabase.auth.getSession().then(({ data: { session } }) => {
        // A-47: also pull, so a change made on another device (e.g. a reality-check Stop)
        // arrives on resume, not only on a cold start or this device's own write. Same throttle.
        // DV-242: not while another account's data waits for the cross-account choice.
        if (session?.user?.id && !accountHeldRef.current) {
          requestSync(); syncAllNotifications().catch(() => {});
          // DV-009: deleted or revoked elsewhere since the last look (same once-a-minute throttle).
          checkAccountGone(wipeDeps(), probeAccountGone).catch(() => {});
        }
      }).catch(() => {});
    });

    // A-106: "Alarms & reminders" turned on in Android settings → reschedule as exact alarms.
    const stopExactWatch = watchExactAlarms();
    // A-107: the Android background refresh keeps reminders coming without the app being opened.
    registerReminderRefresh().catch(() => {});

    // A sync can bring in food logs from another device — re-plan the 20:00
    // food nudge so a day logged on the iPad doesn't still ping the phone, and so
    // the backoff doesn't count it as ignored (journey-review F7). Throttled.
    let lastPermissionAsk = 0;
    // The open reality check as last seen here (its start day, '' = none, null = not read yet): the
    // table is pulled in full every pass, so a Stop or a new check from another device shows as a
    // change of this key, not in the pull's changed tables.
    let lastOpenCheck = null;
    // Baseline before the first pull of this session, so a change that first pull brings counts.
    getRealityStart({ strict: true }).then((s) => { if (lastOpenCheck === null) lastOpenCheck = s && s.date ? String(s.date) : ''; }).catch(() => {});
    const unsubSyncForFood = addSyncListener(async (e) => {
      if (e?.type !== 'sync_complete' && e?.type !== 'import_complete') return;
      let openChanged = false;
      try {
        const s = await getRealityStart({ strict: true });
        const key = s && s.date ? String(s.date) : '';
        openChanged = lastOpenCheck !== null && key !== lastOpenCheck;
        lastOpenCheck = key;
      } catch { /* unknown: judged by the changed tables alone */ }
      // DV-052 (TRD H-9) / final review 2026-10-20: the full resync (serialized, the iPhone 64 guard)
      // runs only when the pull changed something reminders read — another device's dose logs,
      // protocols, vials or food logs, or the open check (the 8 PM question, the day-21 weigh-in,
      // FX-9) — never on every sync.
      if (syncTouchesReminders(e, openChanged)) syncAllNotifications().catch(() => {});
      const nowTs = Date.now();
      // AD-88 (DV-054): this account's protocols with a reminder time arrived on the phone → the
      // permission is asked while the phone's answer is undecided (Gate B F3: never after a pass
      // the server refused — a replaced phone — and at most once a minute).
      if (!e.refused && nowTs - lastPermissionAsk > 60000) { lastPermissionAsk = nowTs; askPermissionForArrivedProtocols().catch(() => {}); }
    });

    // Resolve the first-launch intro flag; the loading gate holds until it's
    // non-null, so a brand-new install shows the intro (not the welcome screen)
    // on first frame. Fail-safe to "seen" so a read error can't wedge the gate.
    // A finished onboarding whose consent was not given in THIS run (the app was killed on
    // Create account) reopens on "Before we begin", never straight on Create account, so the
    // person at the screen confirms and keeps their answers (Gate B re-review). Only matters
    // with no session.
    Promise.all([hasSeenOnboarding(), loadOnboarding()])
      .then(([seen, stash]) => setSeenOnboarding(!!seen && !hasAnswers(stash)))
      .catch(() => setSeenOnboarding(true));

    supabase.auth.getSession().then(async ({ data: { session: firstSession } }) => {
      // A wipe left pending by an intended sign-out or a deletion (the app closed before it
      // finished) completes first (N2/G2); then the session is READ AGAIN, because that wipe may
      // have signed a deleted account out (G3).
      const session = await sessionAfterPendingWipe(firstSession, {
        completePending: (session) => completePendingWipe(wipeDeps(), { hasSession: !!session, sessionUserId: session?.user?.id || null, localOwnerId: getLocalDataUserId() }),
        getSession: () => supabase.auth.getSession(),
      });
      setSession(session);
      if (session?.user?.id) {
        initPurchases(session.user.id, session?.user?.email).catch(() => {});

        // Cross-account guard on cold start too (symmetry with SIGNED_IN): local data of a
        // different user is discarded before importing — after a warning when some of it was never
        // backed up (DV-242, AD-102 = B; lib/accountGuard). Held → the sheet decides; nothing more.
        let guard = 'continue';
        try { guard = await guardSignedIn(guardDeps(), { sessionUser: session.user }); } catch { guard = failClosed(session.user); }
        setGuardTick((n) => n + 1);
        if (guard === 'continue') {
          // A-119: the active-device check before the import (OD-4: a phone the server says was replaced
          // never pulls; DL-103: an updated phone becomes active silently, or asks when another device
          // holds the account; OD-14: a restored session never takes over). lib/signInDevice: if the
          // local DB is empty, import all data from cloud (first launch / new device); otherwise a
          // background sync pushes / pulls changes.
          const step = await startupDeviceStep({ gate: deviceGate, userId: session.user.id, isLocalEmpty: isLocalDBEmpty, fullImport: fullImportFromCloud, requestSync });
          if (!step.held) {
            // One-time move of the open reality check + calculator inputs into the
            // synced tables (S-03), AFTER the import and BEFORE scheduling reminders.
            // A-119 round 3: never while a takeover's rebuild is queued (step.migrate).
            if (step.migrate) await runRealityMigration().catch(() => {});

            // Schedule reminders AFTER the initial import — otherwise fresh
            // installs sync notifications against an empty local DB.
            // AD-88 (DV-054): no permission request at app open — it is asked once, when a protocol
            // with a reminder time is first saved here or arrives by sync (lib/notifications).
            syncAllNotifications()
              .then(() => registerPushToken())
              .catch(() => {});
          }
        }
        // DV-009: an account deleted or a session revoked elsewhere (the server says so; a network
        // failure changes nothing). Deferred, never awaited by the start.
        setTimeout(() => { checkAccountGone(wipeDeps(), probeAccountGone).catch(() => {}); }, 0);
      } else {
        // OD-10 / DL-85: no session but an account's data on the phone (a session that ended on its
        // own): if the server says that account no longer exists, the deletion notice and the wipe.
        let owner = null;
        try { owner = getLocalDataUserId(); } catch { owner = null; }
        if (owner) checkAccountGoneFor(owner).catch(() => {});
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // The sign-in work, one function for both paths (A-144, lib/signInWork): auth-js's SIGNED_IN below,
    // and a session the password reset took that auth-js reported as TOKEN_REFRESHED (a phone ahead).
    const onSignedIn = (session) => {
      noteSignedIn(); // counted first: the reset helper then never runs it a second time
      const explicit = consumeExplicitSignIn(); // A-119 DL-102 (pure)
      if (explicit) deviceFlow().noteExplicitSignIn(session.user.id); // in memory: a pass first claims
      // A sign-in ends any pending wipe of the previous account (R1): plain counter write.
      bumpSignInGeneration();
      // Deferred: fullImportFromCloud() calls supabase, which would deadlock if
      // run inline in this callback.
      setTimeout(async () => {
        // Older wipe marker dropped (G2); deleted:<this account> finishes the deletion, once (H1).
        try { if ((await markerOnSignIn(wipeDeps(), { sessionUserId: session.user.id })) === 'deleted') return; } catch { /* next start */ }
        // A new sign-in starts clean: no leftover auth entry or typed address (Gate B).
        setAuthEntry({ mode: undefined, consent: false });
        clearAuthDraft();
        // Discard any stale intentional-sign-out flag so it can NEVER survive a
        // login boundary (a set-but-never-consumed flag would wrongly wipe on the
        // next spurious sign-out — the exact bug this guard exists to prevent).
        consumeIntentionalSignOut();
        initPurchases(session.user.id, session?.user?.email).catch(() => {});
        // (A-119: the sync engine starts after the device step below — lib/signInDevice.)

        // Cross-account guard: if local data belongs to a DIFFERENT user (e.g. a
        // spurious sign-out KEPT it, then a different account signed in on this
        // device), it is discarded before importing — one account's data must never bleed
        // into another. No-op for the normal same-user re-auth. DV-242 (AD-102 = B): rows never
        // backed up → a warning first ("Sign in as {previous} first, to save" / "Discard and
        // continue"); until the choice nothing syncs or imports (lib/accountGuard).
        let guard = 'continue';
        try { guard = await guardSignedIn(guardDeps(), { sessionUser: session.user }); } catch { guard = failClosed(session.user); }
        setGuardTick((n) => n + 1);
        if (guard !== 'continue') {
          // Gate B doubt 3: the stashed intro answers wait (kept on the phone) for the device step of
          // the choice that continues this sign-in (continueSignedIn) — before any claim the profile
          // write is refused, and nothing would try again.
          return;
        }

        // A-119 one active device (lib/signInDevice): a sign-in the person made takes the account over
        // (DL-102; committed before the first import, OD-3; a rebuild it owes runs in the next pass);
        // any other SIGNED_IN only checks (OD-14). The sync engine starts after it (auditor race).
        // Never blocks the sign-in (OD-1). Screen 2 / screen 4: nothing imported, nothing scheduled.
        const step = await signInDeviceStep({
          explicit, userId: session.user.id, flow: deviceFlow(), gate: deviceGate, startSync: startSyncEngine,
          isLocalEmpty: isLocalDBEmpty, fullImport: fullImportFromCloud, requestSync, reload: reloadDevice,
        });

        // Write any stashed intro-flow answers (name/goal/activity/…) to the
        // freshly-created account, then clear the stash. No-op for returning
        // users with no stash. Deferred (never inline in onAuthStateChange).
        applyPendingProfile(supabase).catch(() => {});
        if (step.held) return;

        // One-time move of the open reality check + calculator inputs into the
        // synced tables (S-03), after the import and BEFORE scheduling reminders.
        // A-119 round 3: not while the takeover's rebuild is queued — its pull and its writes would
        // land in the old copy before the rebuild judges it (lib/signInDevice migrate).
        if (step.migrate) await runRealityMigration().catch(() => {});

        // Schedule reminders AFTER the import so they reflect the user's data
        // AD-88 (DV-054): never a permission request at sign-in (the sync listener asks once when
        // this account's protocols arrive on the phone).
        syncAllNotifications()
          .then(() => registerPushToken())
          .catch(() => {});
      }, 0);
    };
    setSignInHandler(onSignedIn);

    const checkGoneAfterSpurious = () => {
      let owner = null;
      try { owner = getLocalDataUserId(); } catch { owner = null; }
      if (owner) checkAccountGoneFor(owner).catch(() => {});
    };

    // IMPORTANT: keep this callback SYNCHRONOUS and update state FIRST, then defer
    // all side-effects. Supabase holds an internal lock while this runs, and doing
    // async work / calling supabase methods inline deadlocks the client — which is
    // why signing out cleared the data but never routed back to the welcome screen.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session); // drives the navigator (null → Onboarding) immediately

      if (_event === 'SIGNED_OUT') {
        // lib/signedOut: the inline part is ref writes / pure reads only (safe in this callback);
        // it clears a queued notification tap and, only on an INTENTIONAL sign-out, the answers.
        const intentional = onSignedOutNow({
          pendingNavRef, endStashFreshness, consumeIntentionalSignOut, discardStashNow, clearAuthDraft, setSeenOnboarding,
        });
        // DV-009: did the auth server just say the account / session is gone? (in-memory read)
        const gone = takeAccountGone();
        // Deferred: stop sync; intentional → wait for a running sync, then the full wipe (the
        // anti-cross-account-leak guard). Spurious → keep local data (cloud-backed, same user). When the
        // server said the session is gone, the reminders are cancelled too — the data is still kept:
        // a sign-out signal never wipes; only the deferred account probe's user_not_found does, for
        // that user id (DL-85, lib/signedOut afterAccountGone).
        // A-119 OD-10 / DL-85: a session that ended on its own (not intended) while the phone holds the
        // account's data — if the server says the account no longer exists, the deletion notice and wipe.
        setTimeout(() => { afterSignedOut(intentional, wipeDeps(), gone).catch(() => {}); if (!intentional) checkGoneAfterSpurious(); }, 0);
      }

      if (_event === 'SIGNED_IN' && session?.user?.id) onSignedIn(session);
    });

    // Sign in with Apple: if the user revokes our app's access from iOS Settings →
    // Apple ID → Sign in with Apple, Apple fires this. Force the app back to an
    // unauthenticated state (Apple 5.1.1(v) / TN3194). We do NOT wipe local data —
    // this is not an account deletion; a plain local sign-out routes to Auth and,
    // because it isn't flagged intentional, keeps the (cloud-backed) data for a
    // possible re-sign-in. iOS only; the module doesn't exist on Android.
    let appleRevokeSub;
    if (Platform.OS === 'ios') {
      try {
        const AA = require('expo-apple-authentication');
        appleRevokeSub = AA.addRevokeListener(() => {
          // Deferred off the listener; signOut hits supabase, keep it out of any lock.
          setTimeout(() => {
            supabase.auth.signOut({ scope: 'local' }).catch(() => {
              supabase.auth.signOut().catch(() => {});
            });
          }, 0);
        });
      } catch { /* module unavailable — no-op */ }
    }

    return () => {
      subscription.unsubscribe();
      setSignInHandler(null);
      stopSyncEngine();
      if (notifResponseSub) notifResponseSub.remove();
      if (appleRevokeSub) appleRevokeSub.remove();
      if (appStateSub) appStateSub.remove();
      stopExactWatch();
      if (unsubSyncForFood) unsubSyncForFood();
    };
  }, []);

  // Onboarding → auth: 'create' from the last step (the four confirmations were just made,
  // so the consent box starts ticked), 'signin' from the welcome screen.
  const finishOnboarding = (mode) => {
    markSeenOnboarding().catch(() => {});
    setAuthEntry({ mode: mode === 'signin' ? 'signin' : 'create', consent: false });
    setSeenOnboarding(true);
  };
  // Back from the auth screen: the onboarding reopens from the stash at the step the user
  // left, with every value kept (PA-62; it used to restart at the welcome screen, empty).
  const backToOnboarding = () => {
    setAuthEntry({ mode: undefined, consent: false });
    setSeenOnboarding(false);
  };

  // Gate the UI on fonts too, so the app never flashes the system font and
  // then reflows into Plus Jakarta Sans.
  // A-135: one app root for the gate and the app, so the language, theme, safe area and measured
  // window are not created again when the gate opens (Today's opening and Today match exactly).
  const booting = loading || !fontsLoaded || seenOnboarding === null;
  // No session once started (signed out, or never signed in): the next cold start is a signed-out
  // one — forget the mould (outside onAuthStateChange, which stays synchronous).
  useEffect(() => { if (!booting && !session) forgetTodayLayout(); }, [booting, session]);

  return (
    <WindowSizeRoot>
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ErrorBoundary>
        <LanguageProvider>
          {/* A-163: user_metadata.language follows the app language (push titles); never in onAuthStateChange */}
          <AccountLanguageSync userId={!booting && session && session.user && !accountHeld ? session.user.id : null} />
          <ThemeProvider>
            {booting ? (
              <BootScreen lastUser={bootUser} fontsLoaded={fontsLoaded} onTabTap={rememberBootTab} />
            ) : (
            <ThemedRoot
              session={session}
              navigationRef={navigationRef}
              onNavReady={onRootNavReady}
              recovery={recovery}
              onRecoveryDone={() => setRecovery(null)}
              switchAsk={switchAsk}
              onSwitchClose={() => { setSwitchAsk(null); discardPendingRecovery(); }}
              onSwitchCancel={() => { discardPendingRecovery(); }}
              onSwitchContinue={() => {
                const p = switchAsk && switchAsk.pending;
                if (!p) return;
                // Sign out of the current account the deliberate way (push, then wipe), then
                // set the new password for the link's account. Never blocked (A-119 OD-9): with
                // changes not backed up, the one sign-out sheet — "Sign out anyway" or stay (which
                // drops the link). Never open the reset while the other account is still signed
                // in (Gate B F1): only a sign-out that really happened opens it.
                // The sheet's close dropped the pending link; Continue keeps it (kill-safe).
                const proceed = (r) => { if (r && r.blocked === false && !r.failed) setRecovery(p); };
                savePendingRecovery(p)
                  .then(() => runSignOut({
                    signOut: (opts) => signOutCurrentForRecovery(opts),
                    guard: switchGuard.current,
                    onFailed: () => setLinkFailed('signout_failed'),
                    onBlocked: (r, anyway) => setSwitchSignOut({ r, onAnyway: () => { anyway().then(proceed).catch(() => {}); }, onStay: () => { discardPendingRecovery(); } }),
                  }))
                  .then((o) => { if (o === 'done') setRecovery(p); })
                  .catch(() => setLinkFailed('signout_failed'));
              }}
              switchSignOut={switchSignOut}
              onSwitchSignOutClose={() => setSwitchSignOut(null)}
              device={device}
              deviceHeld={deviceHeld}
              onDeviceSheetClose={() => setDeviceHeld(true)}
              onVerdictContinue={() => {
                // Screen 2 / account deleted: wipe and sign out like an intentional sign-out; on a
                // failure the screen comes back (the verdict stays until it worked).
                continueAfterVerdict().catch(() => {}).finally(() => { setDeviceHeld(false); reloadDevice(); });
              }}
              onVerdictRetry={() => {
                // The count could not be read: try again (no wipe until it is read; Gate B round 2).
                deviceFlow().refreshVerdict().catch(() => {}).finally(() => { setDeviceHeld(false); reloadDevice(); });
              }}
              onUseHere={() => {
                const uid = session && session.user && session.user.id;
                if (!uid) { setDeviceHeld(false); return; }
                // Screen 4 "Use here": the takeover (then screen 1 / 1b); offline the question stays.
                deviceFlow().useHere(uid)
                  .then((r) => {
                    if (r && r.go) {
                      requestSync();
                      syncAllNotifications().then(() => registerPushToken()).catch(() => {}); // AD-88: no request here
                    }
                  })
                  .catch(() => {})
                  .finally(() => { setDeviceHeld(false); reloadDevice(); });
              }}
              onAskSignOut={() => {
                // Screen 4 "Sign out of this phone" (Gate B H1): the deliberate sign-out with its count —
                // anything unsent opens the one sign-out sheet ("Sign out anyway" or stay; staying shows
                // screen 4 again). Nothing changes on the other device (this phone is not active: no release).
                runSignOut({
                  signOut: (opts) => signOutIntended(opts),
                  guard: switchGuard.current,
                  onFailed: () => setLinkFailed('signout_failed'),
                  onBlocked: (r, anyway) => setSwitchSignOut({ r, onAnyway: () => { anyway().catch(() => {}).finally(reloadDevice); }, onStay: () => {} }),
                })
                  .catch(() => setLinkFailed('signout_failed'))
                  .finally(() => { setDeviceHeld(false); reloadDevice(); });
              }}
              onNoticeSeen={() => { deviceFlow().dismissNotice().catch(() => {}).finally(() => { setDeviceHeld(false); reloadDevice(); }); }}
              justConfirmed={justConfirmed}
              onConfirmedShown={() => setJustConfirmed(false)}
              seenOnboarding={seenOnboarding}
              linkFailed={linkFailed}
              onLinkFailedShown={() => setLinkFailed(false)}
              onFinishOnboarding={finishOnboarding}
              onBackToOnboarding={backToOnboarding}
              authEntry={authEntry}
              accountHeld={accountHeld}
              accountAsk={accountAsk}
              onAccountSave={onAccountSave}
              onAccountDiscard={onAccountDiscard}
              onAccountRetry={onAccountRetry}
              onAccountAskClose={() => setAccountAsk(null)}
            />
            )}
          </ThemeProvider>
        </LanguageProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
    </WindowSizeRoot>
  );
}