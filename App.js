import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './lib/supabase';
import { initPurchases, logOutPurchases } from './lib/purchases';
import { initNotifications, requestNotificationPermissions, syncAllNotifications, cancelAllNotifications } from './lib/notifications';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { ThemeProvider, useTheme } from './lib/theme';
import { initDatabase, clearLocalDatabase } from './lib/database';
import { startSyncEngine, stopSyncEngine, fullImportFromCloud, isLocalDBEmpty, requestSync } from './lib/sync';
import { redeemPendingReferral } from './lib/referrals';

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
// VialScreen removed from tabs — vial tracking now in TodayScreen
import FAQScreen from './screens/FAQScreen';
import BodyScreen from './screens/BodyScreen';
import PaywallScreen from './screens/PaywallScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function TabIcon({ emoji, focused }) {
  const { colors, isDark } = useTheme();
  // color themes any monochrome glyph icons (e.g. ⊞) — color emoji ignore it.
  // Inactive icons dim via opacity; keep it higher in dark mode so they don't
  // look muddy/"tinted" against the dark tab bar.
  return (
    <Text
      style={{
        fontSize: 22,
        color: focused ? colors.accent : colors.tabInactive,
        opacity: focused ? 1 : (isDark ? 0.7 : 0.45),
      }}
    >
      {emoji}
    </Text>
  );
}

function MainTabs() {
  const { t } = useLanguage();

  const tabs = [
    { name: 'Today', label: t('tab_today'), emoji: '⊞', component: TodayScreen },
    { name: 'Protocols', label: t('tab_protocols'), emoji: '💊', component: ProtocolsScreen },
    { name: 'Body', label: t('tab_body'), emoji: '🧍', component: BodyScreen },
    { name: 'Settings', label: t('tab_settings'), emoji: '👤', component: SettingsScreen },
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
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
          backgroundColor: colors.card,
          paddingBottom: 22,
          paddingTop: 8,
          height: 84,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.2,
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
              <TabIcon emoji={tab.emoji} focused={focused} />
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
      <Stack.Screen name="FAQ" component={FAQScreen} />
      <Stack.Screen name="Paywall" component={PaywallScreen} />
    </Stack.Navigator>
  );
}

// Rendered inside ThemeProvider so it can theme the status bar + navigation
// chrome (fixes white flashes during transitions in dark mode).
function ThemedRoot({ session, navigationRef }) {
  const { colors, isDark } = useTheme();
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
        {!session ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
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
  const navigationRef = useRef(null);

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
        if (data.type === 'dose_reminder' && data.protocolId && navigationRef.current) {
          navigationRef.current.navigate('Main', { screen: 'MainTabs', params: { screen: 'Today' } });
        } else if (data.type === 'checkin_reminder' && navigationRef.current) {
          navigationRef.current.navigate('Main', { screen: 'Log' });
        }
      });
    } catch {
      // expo-notifications not available — skip listener
    }

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (_event === 'SIGNED_OUT') {
        // Stop sync FIRST so no final sync runs, then wipe local health data —
        // otherwise user A's unsynced logs would upload into user B's account.
        stopSyncEngine();
        try { clearLocalDatabase(); } catch { /* ignore */ }
        cancelAllNotifications().catch(() => {});
        // Reset RevenueCat identity so the next sign-in doesn't inherit it
        logOutPurchases().catch(() => {});
      }
      if (_event === 'SIGNED_IN' && session?.user?.id) {
        initPurchases(session.user.id, session?.user?.email).catch(() => {});
        startSyncEngine();
        // Redeem a referral code stashed at signup (idempotent, needs a session)
        redeemPendingReferral().catch(() => {});

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
      }
    });

    return () => {
      subscription.unsubscribe();
      stopSyncEngine();
      if (notifResponseSub) notifResponseSub.remove();
    };
  }, []);

  if (loading) {
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
          <ThemedRoot session={session} navigationRef={navigationRef} />
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}