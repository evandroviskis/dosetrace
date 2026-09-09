import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, TouchableOpacity, Linking, Alert } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, exchangeAuthCodeFromUrl, isProfileComplete } from './lib/supabase';
import { hasSeenOnboarding, markSeenOnboarding, applyPendingProfile, clearOnboarding } from './lib/onboardingStore';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import { initPurchases, logOutPurchases } from './lib/purchases';
import { initNotifications, requestNotificationPermissions, syncAllNotifications, cancelAllNotifications, cancelTodaysDoseReminders, RC_START_KEY } from './lib/notifications';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { ThemeProvider, useTheme } from './lib/theme';
import { installFontMapping, useAppFonts } from './lib/fonts';

// Route every fontWeight in the app to Plus Jakarta Sans. Installed at module
// load, before any component renders.
installFontMapping();
import { initDatabase, clearLocalDatabase, getTodayLogs } from './lib/database';
import { recordDoseTaken } from './lib/doseActions';
import { startSyncEngine, stopSyncEngine, fullImportFromCloud, isLocalDBEmpty, requestSync } from './lib/sync';

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
import OnboardingScreen from './screens/OnboardingScreen';
import OnboardingFlowScreen from './screens/OnboardingFlowScreen';
import CompleteProfileScreen from './screens/CompleteProfileScreen';
import FAQScreen from './screens/FAQScreen';
import BodyScreen from './screens/BodyScreen';
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
    </Stack.Navigator>
  );
}

// Rendered inside ThemeProvider so it can theme the status bar + navigation
// chrome (fixes white flashes during transitions in dark mode).
function ThemedRoot({ session, navigationRef, recovering, onRecoveryDone, justConfirmed, onConfirmedShown, seenOnboarding, onFinishOnboarding }) {
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
    <NavigationContainer ref={navigationRef} theme={navTheme}>
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
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          ) : (
            // First launch: the value-first intro flow collects the profile
            // (name / birthday / gender / goal / activity) BEFORE an account
            // exists and stashes it locally. onDone marks it seen and drops the
            // user onto the welcome/auth screen; applyPendingProfile writes the
            // stash to the account right after SIGNED_IN.
            <Stack.Screen name="OnboardingFlow">
              {() => <OnboardingFlowScreen onDone={onFinishOnboarding} />}
            </Stack.Screen>
          )
        ) : !isProfileComplete(session.user) ? (
          // A session with no minimum profile (name / country / goal / activity)
          // — e.g. a Google/Apple sign-in, which skips the email flow's profile
          // step — must complete it before reaching the app. On save, the
          // USER_UPDATED auth event refreshes `session` and this gate clears.
          <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
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
  // Whether the first-launch intro flow has been completed. Assume seen until
  // AsyncStorage answers, so the welcome screen (not the intro) shows for the
  // brief moment before the check resolves on returning users.
  const [seenOnboarding, setSeenOnboarding] = useState(true);
  const navigationRef = useRef(null);
  const fontsLoaded = useAppFonts();

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

        // "Mark as taken" button — log the dose without opening the app.
        if (response.actionIdentifier === 'MARK_TAKEN' && data.protocolId) {
          try {
            const result = recordDoseTaken(data.protocolId);
            if (result) {
              const logs = getTodayLogs(result.protocol.user_id) || [];
              const takenToday = logs.filter(l => l.protocol_id === data.protocolId && l.outcome === 'Taken').length;
              cancelTodaysDoseReminders(data.protocolId, takenToday).catch(() => {});
              requestSync();
              syncAllNotifications().catch(() => {});
            }
          } catch { /* best-effort background action */ }
          return;
        }

        if (data.type === 'dose_reminder' && data.protocolId && navigationRef.current) {
          navigationRef.current.navigate('Main', { screen: 'MainTabs', params: { screen: 'Today' } });
        } else if ((data.type === 'checkin_reminder' || data.type === 'reality_check') && navigationRef.current) {
          // Measurements / reality-check invitation — deep-link straight into the
          // calculator section, where weight/waist logging and the reality check live.
          navigationRef.current.navigate('Main', {
            screen: 'MainTabs',
            params: { screen: 'Body', params: { initialSection: 'calc' } },
          });
        }
      });
    } catch {
      // expo-notifications not available — skip listener
    }

    // Resolve the first-launch intro flag before we drop the loading gate, so a
    // brand-new install shows the intro (not the welcome screen) on first frame.
    hasSeenOnboarding().then((seen) => setSeenOnboarding(!!seen)).catch(() => {});

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) {
        initPurchases(session.user.id, session?.user?.email).catch(() => {});

        // If local DB is empty, import all data from cloud (first launch / new device)
        if (isLocalDBEmpty(session.user.id)) {
          await fullImportFromCloud();
        } else {
          // Otherwise trigger a background sync to push/pull changes
          requestSync();
        }

        // Schedule reminders AFTER the initial import — otherwise fresh
        // installs sync notifications against an empty local DB.
        requestNotificationPermissions()
          .then(() => syncAllNotifications())
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
        // Run OUTSIDE the auth lock so the re-render to Onboarding commits first.
        setTimeout(() => {
          // Stop sync FIRST so no final sync runs, then wipe local health data —
          // otherwise user A's unsynced logs would upload into user B's account.
          stopSyncEngine();
          try { clearLocalDatabase(); } catch { /* ignore */ }
          cancelAllNotifications().catch(() => {});
          // Reset RevenueCat identity so the next sign-in doesn't inherit it
          logOutPurchases().catch(() => {});
          // Wipe device-global AsyncStorage that would otherwise leak one user's
          // data to the next account on a shared device: the intro-flow stash
          // (name/sex/birth-year/goal) and the reality-check starting weigh-in.
          clearOnboarding().catch(() => {});
          AsyncStorage.removeItem(RC_START_KEY).catch(() => {});
        }, 0);
      }

      if (_event === 'SIGNED_IN' && session?.user?.id) {
        // Deferred: fullImportFromCloud() calls supabase, which would deadlock if
        // run inline in this callback.
        setTimeout(async () => {
          initPurchases(session.user.id, session?.user?.email).catch(() => {});
          startSyncEngine();

          // Write any stashed intro-flow answers (name/goal/activity/…) to the
          // freshly-created account, then clear the stash. No-op for returning
          // users with no stash. Deferred (never inline in onAuthStateChange).
          applyPendingProfile(supabase).catch(() => {});

          // Import from cloud on sign-in if local DB is empty
          if (isLocalDBEmpty(session.user.id)) {
            await fullImportFromCloud();
          } else {
            requestSync();
          }

          // Schedule reminders AFTER the import so they reflect the user's data
          requestNotificationPermissions()
            .then(() => syncAllNotifications())
            .catch(() => {});
        }, 0);
      }
    });

    return () => {
      subscription.unsubscribe();
      stopSyncEngine();
      if (notifResponseSub) notifResponseSub.remove();
    };
  }, []);

  // Gate the UI on fonts too, so the app never flashes the system font and
  // then reflows into Plus Jakarta Sans.
  if (loading || !fontsLoaded) {
    return (
      <LanguageProvider>
        <ThemeProvider>
          <ThemedLoading />
        </ThemeProvider>
      </LanguageProvider>
    );
  }

  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ThemeProvider>
          <ThemedRoot
            session={session}
            navigationRef={navigationRef}
            recovering={recovering}
            onRecoveryDone={() => setRecovering(false)}
            justConfirmed={justConfirmed}
            onConfirmedShown={() => setJustConfirmed(false)}
            seenOnboarding={seenOnboarding}
            onFinishOnboarding={() => { markSeenOnboarding().catch(() => {}); setSeenOnboarding(true); }}
          />
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}