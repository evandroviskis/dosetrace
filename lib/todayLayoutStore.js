// A-135: Today's layout memory ("mould") on this device — which blocks the last opening showed and
// their heights, never data (lib/todaySkeleton sanitizes every read and write). Read once at the app
// start (App.js, for the opening) and kept here so Today's first render has it at once.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseStore, withLayout, layoutFor, sameLayout } from './todaySkeleton';

export const TODAY_LAYOUT_KEY = 'dosetrace_today_layout';

let cache; // undefined = not read yet; null = nothing stored
let reading = null;

export function loadTodayLayout() {
  if (cache !== undefined) return Promise.resolve(cache);
  if (!reading) {
    reading = AsyncStorage.getItem(TODAY_LAYOUT_KEY)
      .then((raw) => { if (cache === undefined) cache = parseStore(raw); return cache; })
      .catch(() => { if (cache === undefined) cache = null; return cache; })
      .finally(() => { reading = null; });
  }
  return reading;
}

// The mould for this user (null = the opening, before the user is read) and posture, if read.
export function cachedTodayLayout(userId, posture) {
  return cache ? layoutFor(cache, userId, posture) : null;
}

export function saveTodayLayout(userId, posture, layout) {
  if (!userId) return;
  const cur = cache || null;
  if (cur && cur.user === userId && sameLayout(layoutFor(cur, userId, posture), layout)) return;
  const next = withLayout(cur, userId, posture, layout);
  cache = next;
  AsyncStorage.setItem(TODAY_LAYOUT_KEY, JSON.stringify(next)).catch(() => {});
}

// No session: the next cold start is a signed-out one (the full-screen spinner, as before).
export async function forgetTodayLayout() {
  cache = null;
  try { await AsyncStorage.removeItem(TODAY_LAYOUT_KEY); } catch { /* best effort */ }
}
