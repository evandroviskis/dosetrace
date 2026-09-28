import React, { useEffect, useState, useRef, useCallback } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { View, Text, ActivityIndicator, TouchableOpacity, Linking, Alert, Platform, AppState } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, exchangeAuthCodeFromUrl, isProfileComplete } from './lib/supabase';
import { hasSeenOnboarding, markSeenOnboarding, clearSeenOnboarding, applyPendingProfile, clearOnboarding } from './lib/onboardingStore';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import FoodChatScreen from './screens/FoodChatScreen';
import { initPurchases, logOutPurchases } from './lib/purchases';
import { initNotifications, requestNotificationPermissions, syncAllNotifications, cancelAllNotifications, registerPushToken, syncFoodLogReminder, syncRealityCheckReminder, RC_START_KEY } from './lib/notifications';
import { runRealityMigration, clearRealityDeviceFlags } from './lib/realityCheck';
import { foodTapParams, responseKey } from './lib/notificationPlan';
import { consumeIntentionalSignOut } from './lib/authIntent';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { ThemeProvider, useTheme } from './lib/theme';
import { installFontMapping, useAppFonts } from './lib/fonts';

// Route every fontWeight in the app to Plus Jakarta Sans. Installed at module
// load, before any component renders.
installFontMapping();
import { initDatabase, clearLocalDatabase, getLocalDataUserId } from './lib/database';
import { startSyncEngine, stopSyncEngine, fullImportFromCloud, isLocalDBEmpty, requestSync, addSyncListener } from './lib/sync';

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

class ErrorBoundary extends React.Component {
  state = { hasError: false, lang: 'en' };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidMount() {
    // Best-effort language detection — must never throw on the error path.
    try {
      AsyncStorage.getItem('dosetrace_language')
        .then(saved => {
          if (saved && ERROR_BOUNDARY_STRINGS[saved]) this.setState({ lang: saved });
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
import BodyScreen from './screens/BodyScreen';
import JourneyScreen from './screens/JourneyScreen';
import PaywallScreen from './screens/PaywallScreen';
import SerumCurveScreen from './screens/SerumCurveScreen';

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
  return <Glyph color={focused ? colors.accent : colors.tabInactive} focused={focused} />;
}

function MainTabs() {
  const { t } = useLanguage();

  const tabs = [
    { name: 'Today', label: t('tab_today'), Glyph: TodayGlyph, component: TodayScreen },
    { name: 'Protocols', label: t('tab_protocols'), Glyph: ProtocolsGlyph, component: ProtocolsScreen },
    { name: 'Journey', label: t('tab_journey'), Glyph: JourneyGlyph, component: JourneyScreen },
    { name: 'Body', label: t('tab_body'), Glyph: BodyGlyph, component: BodyScreen },
    { name: 'Settings', label: t('tab_settings'), Glyph: SettingsGlyph, component: SettingsScreen },
  ];

  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          borderTopWidth: 0,
          elevation: 0,
          shadowColor: '#12233B',
          shadowOpacity: 0.10,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -6 },
          backgroundColor: colors.card,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingBottom: 22,
          paddingTop: 10,
          height: 86,
        },
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontWeight: '700',
          letterSpacing: 0.2,
          marginTop: 2,
        },
      }}
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
      <Stack.Screen name="FAQ" component={FAQScreen} />
      <Stack.Screen name="Paywall" component={PaywallScreen} />
      {/* The ONE food chat (FL-31/32/37): Today's hero, Journey's hero and the 8 PM
          reminder all open this full-screen modal; swipe down to close. */}
      <Stack.Screen name="FoodChat" component={FoodChatScreen} options={{ presentation: 'modal', gestureEnabled: true, gestureDirection: 'vertical' }} />
    </Stack.Navigator>
  );
}

// Rendered inside ThemeProvider so it can theme the status bar + navigation
// chrome (fixes white flashes during transitions in dark mode).
function ThemedRoot({ session, navigationRef, onNavReady, recovering, onRecoveryDone, justConfirmed, onConfirmedShown, seenOnboarding, onFinishOnboarding, onBackToOnboarding }) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();

  // Signup confirmation came back through the deep link — the user has no other
  // way to know it worked, so say so explicitly.
  useEffect(() => {
    if (!justConfirmed) return;
    Alert.alert(t('confirm_email_done_title'), t('confirm_email_done_msg'));
    onConfirmedShown && onConfirmedShown();
  }, [justConfirmed]);

  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
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
  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} onReady={onNavReady} onStateChange={onNavReady}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {recovering ? (
          // Opened from a password-reset email: force the set-new-password step
          // even though the code exchange already created a session, so the user
          // can't be silently dropped into the app with the old password.
          <Stack.Screen name="ResetPassword">
            {() => <ResetPasswordScreen onDone={onRecoveryDone} />}
          </Stack.Screen>
        ) : !session ? (
          seenOnboarding ? (
            // Returning / signed-out: the auth screen only (sign in or create).
            // The old multi-step OnboardingScreen was deleted — the value-first
            // intro below is the single onboarding, and AuthScreen the single
            // auth surface.
            <Stack.Screen name="Auth">
              {() => <AuthScreen onBack={onBackToOnboarding} />}
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
        ) : !isProfileComplete(session.user) ? (
          // A session with an incomplete profile — every Apple/Google sign-in, or a
          // returning account missing a now-required field — completes it through the
          // SAME onboarding flow (signed-in mode: prefilled, only the missing steps,
          // writes straight to the account). On save, the USER_UPDATED auth event
          // refreshes `session` and this gate clears. (Replaces CompleteProfileScreen.)
          <Stack.Screen name="CompleteProfile">
            {() => <OnboardingFlowScreen session={session} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Main" component={MainStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
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
  const [recovering, setRecovering] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);
  // Whether the first-launch intro flow has been completed. null = not resolved
  // yet; the loading gate below waits for it, so we never flash the welcome
  // screen before the intro (or vice-versa) on first frame.
  const [seenOnboarding, setSeenOnboarding] = useState(null);
  const navigationRef = useRef(null);
  const fontsLoaded = useAppFonts();

  // Food-reminder taps (FL-18/37: they open the one food chat) wait here until the signed-in app (the 'Main'
  // route) exists — a tap that LAUNCHED the app arrives before navigation does.
  const pendingNavRef = useRef(null);
  const flushPendingNav = useCallback(() => {
    const nav = navigationRef.current;
    const params = pendingNavRef.current;
    if (!params || !nav || (nav.isReady && !nav.isReady())) return;
    const names = (nav.getRootState && nav.getRootState()?.routeNames) || [];
    if (!names.includes('Main')) return;
    pendingNavRef.current = null;
    nav.navigate('Main', { screen: 'FoodChat', params });
  }, []);
  // Each tap is routed once, whether it comes from the running listener or the
  // launch path (persisted, so a relaunch never replays an old tap).
  const routedRef = useRef(new Set());
  const routeFoodTap = useCallback(async (response, maxAgeMs) => {
    const params = foodTapParams(response, Date.now());
    if (!params) return false;
    const key = responseKey(response);
    if (routedRef.current.has(key)) return true;
    routedRef.current.add(key);
    const at = Number(response?.notification?.date) || 0;
    if (maxAgeMs && at && Date.now() - at > maxAgeMs) return true; // a stale launch response
    try {
      const raw = await AsyncStorage.getItem('dosetrace_nav_handled');
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list) && list.includes(key)) return true;
      await AsyncStorage.setItem('dosetrace_nav_handled', JSON.stringify([...(Array.isArray(list) ? list : []), key].slice(-30)));
    } catch { /* best effort — the in-memory set still dedupes this run */ }
    pendingNavRef.current = params;
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
    const handleUrl = async (url) => {
      if (!url) return;
      const u = String(url);
      const isReset = u.includes('reset-password');
      const isConfirm = u.includes('confirm-email');
      if (!isReset && !isConfirm) return;
      const { ok } = await exchangeAuthCodeFromUrl(u);
      if (!ok || cancelled) return;
      if (isReset) setRecovering(true);
      else setJustConfirmed(true);
    };
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

        // Action buttons (Mark as taken / snooze) are handled once, at module scope,
        // by lib/notificationActions (works with the app killed). Here: only
        // navigation — Mark as taken opens the app on iOS, so show Today.
        if (response.actionIdentifier === 'MARK_TAKEN') {
          if (navigationRef.current) navigationRef.current.navigate('Main', { screen: 'MainTabs', params: { screen: 'Today' } });
          return;
        }
        if (response.actionIdentifier === 'SNOOZE_HOUR' || response.actionIdentifier === 'SNOOZE_TOMORROW') return;
        // "Nothing else today" (food question) closes the day in lib/notificationActions — no navigation.
        if (response.actionIdentifier === 'FOOD_DAY_DONE') return;
        // Food reminder: body tap → the 3-button question; "Log it" → the composer.
        if (data.type === 'food_log' || response.actionIdentifier === 'FOOD_LOG_IT') { routeFoodTap(response, 0); return; }

        if (data.type === 'dose_reminder' && data.protocolId && navigationRef.current) {
          navigationRef.current.navigate('Main', { screen: 'MainTabs', params: { screen: 'Today' } });
        } else if ((data.type === 'checkin_reminder' || data.type === 'reality_check') && navigationRef.current) {
          // Measurements / reality-check nudge — deep-link into the Journey tab.
          navigationRef.current.navigate('Main', {
            screen: 'MainTabs',
            params: { screen: 'Journey', params: {} },
          });
        }
      });
      // Cold start: a tap on the food reminder that LAUNCHED the app may never
      // reach the listener above — route the launch response too (deduped with
      // the listener by responseKey; older than 12 h = stale, ignored).
      if (N.getLastNotificationResponseAsync) {
        N.getLastNotificationResponseAsync().then((last) => { if (last) routeFoodTap(last, 12 * 3600 * 1000); }).catch(() => {});
      }
    } catch {
      // expo-notifications not available — skip listener
    }

    // Top up rolling one-shot notifications whenever the app comes to the
    // foreground. syncAllNotifications otherwise runs only on cold start / SIGNED_IN,
    // so a warm-resumed process would never re-arm the tail of a rolling window
    // (e.g. the 7-day food-log nudge set under a 21-day reality-check — journey F2).
    // Throttled so rapid foreground/background toggles don't thrash.
    let lastFgSync = 0;
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const nowTs = Date.now();
      if (nowTs - lastFgSync < 60000) return; // at most once/min
      lastFgSync = nowTs;
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.id) syncAllNotifications().catch(() => {});
      }).catch(() => {});
    });

    // A sync can bring in food logs from another device — re-plan the 20:00
    // food nudge so a day logged on the iPad doesn't still ping the phone, and so
    // the backoff doesn't count it as ignored (journey-review F7). Throttled.
    let lastFoodResync = 0;
    const unsubSyncForFood = addSyncListener((e) => {
      if (e?.type !== 'sync_complete' && e?.type !== 'import_complete') return;
      const nowTs = Date.now();
      if (nowTs - lastFoodResync < 30000) return;
      lastFoodResync = nowTs;
      syncFoodLogReminder().catch(() => {});
      // A Stop (or new check) pulled from another device must also cancel / re-arm
      // the day-21 weigh-in reminder here, not only on the next cold start (FX-9).
      syncRealityCheckReminder().catch(() => {});
    });

    // Resolve the first-launch intro flag; the loading gate holds until it's
    // non-null, so a brand-new install shows the intro (not the welcome screen)
    // on first frame. Fail-safe to "seen" so a read error can't wedge the gate.
    hasSeenOnboarding().then((seen) => setSeenOnboarding(!!seen)).catch(() => setSeenOnboarding(true));

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) {
        initPurchases(session.user.id, session?.user?.email).catch(() => {});

        // Cross-account guard on cold start too (symmetry with SIGNED_IN): if the
        // local data belongs to a different user, wipe before importing.
        try {
          const localUid = getLocalDataUserId();
          if (localUid && localUid !== session.user.id) {
            clearLocalDatabase();
            AsyncStorage.removeItem(RC_START_KEY).catch(() => {});
            await clearRealityDeviceFlags().catch(() => {}); // S-03 per-device flags
            cancelAllNotifications().catch(() => {}); // symmetry with SIGNED_IN — don't let the prior user's dose reminders fire
          }
        } catch { /* ignore */ }

        // If local DB is empty, import all data from cloud (first launch / new device)
        if (isLocalDBEmpty(session.user.id)) {
          await fullImportFromCloud();
        } else {
          // Otherwise trigger a background sync to push/pull changes
          requestSync();
        }

        // One-time move of the open reality check + calculator inputs into the
        // synced tables (S-03), AFTER the import and BEFORE scheduling reminders.
        await runRealityMigration().catch(() => {});

        // Schedule reminders AFTER the initial import — otherwise fresh
        // installs sync notifications against an empty local DB.
        requestNotificationPermissions()
          .then(() => syncAllNotifications())
          .then(() => registerPushToken())
          .catch(() => {});
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // IMPORTANT: keep this callback SYNCHRONOUS and update state FIRST, then defer
    // all side-effects. Supabase holds an internal lock while this runs, and doing
    // async work / calling supabase methods inline deadlocks the client — which is
    // why signing out cleared the data but never routed back to the welcome screen.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session); // drives the navigator (null → Onboarding) immediately

      if (_event === 'SIGNED_OUT') {
        // WIPE only on an INTENTIONAL sign-out (user tapped Sign Out / Delete). A
        // SPURIOUS SIGNED_OUT (token-refresh failure / expired session) must NOT
        // wipe — that destructive wipe on a mere session hiccup is what erased an
        // in-progress reality-check. All user data is cloud-backed now, so keeping
        // it is safe: the same user re-auths and their data is intact (no re-import
        // churn). Cross-account safety on a shared device is handled by the sign-in
        // user-switch guard below. consumeIntentionalSignOut() is a pure, synchronous
        // read — safe inside the auth callback (never touches supabase).
        const intentional = consumeIntentionalSignOut();
        // Intentional → route to the splash (and wipe). Spurious → leave
        // seenOnboarding as-is so the returning user lands on Auth to re-sign-in.
        if (intentional) setSeenOnboarding(false);
        setTimeout(() => {
          // Stop sync FIRST so no final sync runs.
          stopSyncEngine();
          if (!intentional) return; // spurious: keep local data (cloud-backed, same user)
          // Intentional sign-out: full wipe. This is also the anti-cross-account-leak
          // guard — clear local health data + device-global AsyncStorage (intro-flow
          // stash, reality-check weigh-in) so nothing bleeds to the next account.
          try { clearLocalDatabase(); } catch { /* ignore */ }
          cancelAllNotifications().catch(() => {});
          logOutPurchases().catch(() => {});
          clearOnboarding().catch(() => {});
          AsyncStorage.removeItem(RC_START_KEY).catch(() => {});
          clearRealityDeviceFlags().catch(() => {}); // S-03 per-device flags
          clearSeenOnboarding().catch(() => {});
        }, 0);
      }

      if (_event === 'SIGNED_IN' && session?.user?.id) {
        // Deferred: fullImportFromCloud() calls supabase, which would deadlock if
        // run inline in this callback.
        setTimeout(async () => {
          // Discard any stale intentional-sign-out flag so it can NEVER survive a
          // login boundary (a set-but-never-consumed flag would wrongly wipe on the
          // next spurious sign-out — the exact bug this guard exists to prevent).
          consumeIntentionalSignOut();
          initPurchases(session.user.id, session?.user?.email).catch(() => {});
          startSyncEngine();

          // Write any stashed intro-flow answers (name/goal/activity/…) to the
          // freshly-created account, then clear the stash. No-op for returning
          // users with no stash. Deferred (never inline in onAuthStateChange).
          applyPendingProfile(supabase).catch(() => {});

          // Cross-account guard: if local data belongs to a DIFFERENT user (e.g. a
          // spurious sign-out KEPT it, then a different account signed in on this
          // device), wipe it before importing — one account's data must never bleed
          // into another. No-op for the normal same-user re-auth.
          try {
            const localUid = getLocalDataUserId();
            if (localUid && localUid !== session.user.id) {
              clearLocalDatabase();
              AsyncStorage.removeItem(RC_START_KEY).catch(() => {});
              await clearRealityDeviceFlags().catch(() => {}); // S-03 per-device flags
              cancelAllNotifications().catch(() => {}); // don't let the prior user's dose reminders fire
            }
          } catch { /* ignore */ }

          // Import from cloud on sign-in if local DB is empty
          if (isLocalDBEmpty(session.user.id)) {
            await fullImportFromCloud();
          } else {
            requestSync();
          }

          // One-time move of the open reality check + calculator inputs into the
          // synced tables (S-03), after the import and BEFORE scheduling reminders.
          await runRealityMigration().catch(() => {});

          // Schedule reminders AFTER the import so they reflect the user's data
          requestNotificationPermissions()
            .then(() => syncAllNotifications())
            .then(() => registerPushToken())
            .catch(() => {});
        }, 0);
      }
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
      stopSyncEngine();
      if (notifResponseSub) notifResponseSub.remove();
      if (appleRevokeSub) appleRevokeSub.remove();
      if (appStateSub) appStateSub.remove();
      if (unsubSyncForFood) unsubSyncForFood();
    };
  }, []);

  // Gate the UI on fonts too, so the app never flashes the system font and
  // then reflows into Plus Jakarta Sans.
  if (loading || !fontsLoaded || seenOnboarding === null) {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <LanguageProvider>
          <ThemeProvider>
            <ThemedLoading />
          </ThemeProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ErrorBoundary>
        <LanguageProvider>
          <ThemeProvider>
            <ThemedRoot
              session={session}
              navigationRef={navigationRef}
              onNavReady={flushPendingNav}
              recovering={recovering}
              onRecoveryDone={() => setRecovering(false)}
              justConfirmed={justConfirmed}
              onConfirmedShown={() => setJustConfirmed(false)}
              seenOnboarding={seenOnboarding}
              onFinishOnboarding={() => { markSeenOnboarding().catch(() => {}); setSeenOnboarding(true); }}
              onBackToOnboarding={() => setSeenOnboarding(false)}
            />
          </ThemeProvider>
        </LanguageProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}