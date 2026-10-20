// A-119 OD-18: this phone's identity and how it names itself (lib/deviceIdentity has the rules).
// Imported by lib/supabase.js (every request carries the device id) — so nothing here imports the
// Supabase client.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { createDeviceIdentity } from './deviceIdentity';

// Never in an iCloud / iTunes backup ("this device only"), readable after the first unlock (a
// background run on a locked phone still has it).
const KEYCHAIN = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

const identity = createDeviceIdentity({
  platform: Platform.OS,
  // expo-application is linked through expo-notifications; required lazily so iOS never loads it.
  androidId: () => require('expo-application').getAndroidId(),
  secureGet: (k) => SecureStore.getItemAsync(k, KEYCHAIN),
  secureSet: (k, v) => SecureStore.setItemAsync(k, v, KEYCHAIN),
  randomId: () => Crypto.randomUUID().replace(/-/g, ''),
});

export function getDeviceId() {
  return identity.getDeviceId();
}

// How this phone names itself to the account's other phone (ledger 2026-10-15): iPhone / iPad;
// Android: the brand (the settings name is not available without a new native module — see
// lib/deviceRules deviceWords, which also refuses raw model codes).
export function deviceInfo() {
  if (Platform.OS === 'ios') return { platform: 'ios', name: Platform.isPad ? 'iPad' : 'iPhone', brand: 'Apple' };
  if (Platform.OS === 'android') {
    const c = Platform.constants || {};
    return { platform: 'android', name: null, brand: c.Brand || c.Manufacturer || null };
  }
  return { platform: Platform.OS, name: null, brand: null };
}

export function appVersion() {
  return (Constants && Constants.expoConfig && Constants.expoConfig.version) || null;
}

// The headers every request to the project carries (the server's guard reads them).
export async function deviceHeaders() {
  const out = {};
  let id = null;
  try { id = await getDeviceId(); } catch { id = null; }
  if (id) out['x-dt-device'] = id;
  const v = appVersion();
  if (v) out['x-dt-app-version'] = v;
  return out;
}
