import { registerRootComponent } from 'expo';
// A-197: on Android a background run's network answers must not wait on JS timers (paused while the
// app is in the background). Imports are evaluated before this call; it works because every caller
// reads the global fetch lazily (lib/supabase via lib/authFetch).
import { installBgSafeFetch } from './lib/bgSafeFetch';
installBgSafeFetch();
// Notification action buttons (Mark as taken / snooze): registered at module
// scope, before the app mounts, so a tap is handled even when the app was killed.
import './lib/notificationActions';
// A-107: the Android reminder refresh task, defined before the app mounts (Android may start the
// app headless just to run it).
import { defineReminderRefreshTask, registerHeadlessReminderRefresh } from './lib/backgroundTasks';
defineReminderRefreshTask();
// A-197 fix 2: the same refresh as a headless JS task (our WorkManager worker starts it).
registerHeadlessReminderRefresh();

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
