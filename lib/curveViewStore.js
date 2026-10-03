// Per-user storage of the Dose accumulation view (lib/curveView.js). A view preference, kept
// like the app's other view preferences (theme, protocol sort, Settings folds) in AsyncStorage,
// keyed by user so another account on the device never inherits it. It is not health data:
// losing it only means the curve opens on its default again.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { curveViewKey, curveViewPatch } from './curveView';

export async function loadCurveView(userId) {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(curveViewKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Read → merge → write, so a change of one setting never drops another.
export async function saveCurveView(userId, patch) {
  if (!userId || !patch) return;
  try {
    const cur = await loadCurveView(userId);
    await AsyncStorage.setItem(curveViewKey(userId), JSON.stringify(curveViewPatch(cur, patch)));
  } catch { /* a view preference: the curve falls back to its default */ }
}
