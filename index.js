import { registerRootComponent } from 'expo';
// Notification action buttons (Mark as taken / snooze): registered at module
// scope, before the app mounts, so a tap is handled even when the app was killed.
import './lib/notificationActions';
// A-107: the Android reminder refresh task, defined before the app mounts (Android may start the
// app headless just to run it).
import { defineReminderRefreshTask } from './lib/backgroundTasks';
defineReminderRefreshTask();

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
