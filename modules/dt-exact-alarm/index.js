// A-106: whether Android lets DoseTrace schedule EXACT alarms ("Alarms & reminders").
// Returns true / false on Android, null where it cannot be read (iPhone, Expo Go, module missing).
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

const Native = Platform.OS === 'android' ? requireOptionalNativeModule('DtExactAlarm') : null;

export function canScheduleExactAlarms() {
  if (!Native) return null;
  try { return !!Native.canScheduleExactAlarms(); } catch { return null; }
}
