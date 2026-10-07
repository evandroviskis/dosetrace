// A-106: whether Android lets DoseTrace schedule EXACT alarms ("Alarms & reminders").
// Returns true / false on Android, null where it cannot be read (iPhone, Expo Go, module missing).
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

const Native = Platform.OS === 'android' ? requireOptionalNativeModule('DtExactAlarm') : null;

// A-110: exempt from "Pause app activity if unused"; null where it cannot be read.
export function isExemptFromHibernation() {
  if (!Native || !Native.isExemptFromHibernation) return null;
  try { return !!Native.isExemptFromHibernation(); } catch { return null; }
}

export function canScheduleExactAlarms() {
  if (!Native) return null;
  try { return !!Native.canScheduleExactAlarms(); } catch { return null; }
}
