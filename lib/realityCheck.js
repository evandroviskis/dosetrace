// Durable storage for the IN-PROGRESS reality-check weigh-in.
//
// This value used to live ONLY in AsyncStorage (RC_START_KEY). AsyncStorage is
// wiped on SIGNED_OUT (App.js) and does not re-import on the next sign-in, so an
// app update / session hiccup / re-auth silently lost a weigh-in the user had
// entered (data-loss on hello@dosetrace.io, 2026-09-12). Per the "NEVER lose
// user-entered data" rule, the source of truth is now cloud-backed: it is
// mirrored into Supabase user_metadata (`calc_reality_open`, alongside the
// existing calc_inputs/calc_snapshots/calc_reality_checks that survived that
// incident), and restored to the local AsyncStorage cache on read after a wipe.
//
// All reality-check start reads/writes go through here so no caller can
// accidentally store it device-only again. AsyncStorage stays the fast local
// cache; user_metadata is the durable copy.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getCachedUser } from './supabase';
import { RC_START_KEY } from './notifications';

const valid = (v) => !!(v && v.date && typeof v.weightKg === 'number');

// Read the open weigh-in: local cache first; if empty (e.g. right after a wipe or
// on a new device), restore from cloud metadata and repopulate the cache.
export async function getRealityStart() {
  try {
    const raw = await AsyncStorage.getItem(RC_START_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (valid(v)) return v;
  } catch { /* fall through to cloud */ }
  try {
    const u = await getCachedUser();
    const v = u?.user_metadata?.calc_reality_open;
    if (valid(v)) {
      await AsyncStorage.setItem(RC_START_KEY, JSON.stringify(v)).catch(() => {});
      return v;
    }
  } catch { /* ignore */ }
  return null;
}

// Persist a new/updated open weigh-in to BOTH the local cache and cloud metadata.
// updateUser merges data keys, so this preserves calc_inputs/snapshots/etc.
export async function setRealityStart(start) {
  try { await AsyncStorage.setItem(RC_START_KEY, JSON.stringify(start)); } catch { /* ignore */ }
  supabase.auth.updateUser({ data: { calc_reality_open: start } }).catch(() => {});
}

// Clear the open weigh-in from both places (user reset/stop/dismiss).
export async function clearRealityStart() {
  try { await AsyncStorage.removeItem(RC_START_KEY); } catch { /* ignore */ }
  supabase.auth.updateUser({ data: { calc_reality_open: null } }).catch(() => {});
}
