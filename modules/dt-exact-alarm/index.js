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

// A-197 fix 2: start the reminder refresh in the background (Android).
export function scheduleHeadlessRefresh(minutes) {
  if (!Native || !Native.scheduleRefresh) return false;
  try { return !!Native.scheduleRefresh(minutes); } catch { return false; }
}

// The headless refresh task ended: tells our worker (React Native's own finish call does not reach it).
export function headlessRefreshDone() {
  if (!Native || !Native.headlessRefreshDone) return;
  try { Native.headlessRefreshDone(); } catch { /* the worker still ends at its cap */ }
}

// A-194: the window background (the Fold's taskbar area under the tab bar) follows the theme.
export function setWindowBackground(color) {
  if (!Native || !Native.setWindowBackground) return false;
  try { return !!Native.setWindowBackground(color); } catch { return false; }
}

export function hasHeadlessRefresh() {
  return !!(Native && Native.scheduleRefresh);
}
