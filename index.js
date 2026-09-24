import { registerRootComponent } from 'expo';
// Notification action buttons (Mark as taken / snooze): registered at module
// scope, before the app mounts, so a tap is handled even when the app was killed.
import './lib/notificationActions';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
