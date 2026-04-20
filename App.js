import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { supabase } from './lib/supabase';
import { initPurchases } from './lib/purchases';
import { initNotifications, requestNotificationPermissions, syncAllNotifications, cancelAllNotifications } from './lib/notifications';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { initDatabase } from './lib/database';
import { startSyncEngine, stopSyncEngine, fullImportFromCloud, isLocalDBEmpty, requestSync } from './lib/sync';

class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 32 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 12 }}>Something went wrong</Text>
          <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24 }}>
            The app encountered an unexpected error. Please restart DoseTrace.
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{ backgroundColor: '#185FA5', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Try Again</Text>
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
import BloodworkScreen from './screens/BloodworkScreen';
import PaywallScreen from './screens/PaywallScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function TabIcon({ emoji, focused }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.35 }}>
      {emoji}
    </Text>
  );
}

function MainTabs() {
  const { t } = useLanguage();

  const tabs = [
    { name: 'Today', label: t('tab_today'), emoji: '⊞', component: TodayScreen },
    { name: 'Protocols', label: t('tab_protocols'), emoji: '💊', component: ProtocolsScreen },
    { name: 'Log', label: t('tab_log'), emoji: '📋', component: LogScreen },
    { name: 'Blood', label: t('tab_blood'), emoji: '🩸', component: BloodworkScreen },
    { name: 'Settings', label: t('tab_settings'), emoji: '👤', component: SettingsScreen },
  ];

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#185FA5',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: {
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
          backgroundColor: '#fff',
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
      <Stack.Screen name="FAQ" component={FAQScreen} />
      <Stack.Screen name="Paywall" component={PaywallScreen} />
    </Stack.Navigator>
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
          navigationRef.current.navigate('Main', { screen: 'MainTabs', params: { screen: 'Log' } });
        }
      });
    } catch {
      // expo-notifications not available — skip listener
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) {
        initPurchases(session.user.id, session?.user?.email).catch(() => {});
        requestNotificationPermissions()
          .then(() => syncAllNotifications())
          .catch(() => {});

        // If local DB is empty, import all data from cloud (first launch / new device)
        if (isLocalDBEmpty(session.user.id)) {
          await fullImportFromCloud();
        } else {
          // Otherwise trigger a background sync to push/pull changes
          requestSync();
        }
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (_event === 'SIGNED_OUT') {
        cancelAllNotifications().catch(() => {});
        stopSyncEngine();
      }
      if (_event === 'SIGNED_IN' && session?.user?.id) {
        startSyncEngine();
        requestNotificationPermissions()
          .then(() => syncAllNotifications())
          .catch(() => {});

        // Import from cloud on sign-in if local DB is empty
        if (isLocalDBEmpty(session.user.id)) {
          await fullImportFromCloud();
        } else {
          requestSync();
        }
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
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
          <ActivityIndicator size="large" color="#185FA5" />
        </View>
      </LanguageProvider>
    );
  }

  return (
    <ErrorBoundary>
      <LanguageProvider>
        <NavigationContainer ref={navigationRef}>
          <StatusBar style="auto" />
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!session ? (
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            ) : (
              <Stack.Screen name="Main" component={MainStack} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </LanguageProvider>
    </ErrorBoundary>
  );
}