// Durable, synced storage for the IN-PROGRESS reality check and the calculator
// inputs (S-03; FX-8 / FX-9 / FX-5).
//
// History: the open check lived in AsyncStorage (RC_START_KEY, wiped on sign-out)
// and then was mirrored to Supabase user_metadata (calc_reality_open) after a
// data-loss on 2026-09-12; calculator inputs lived only in user_metadata
// (calc_inputs). Neither had history, tombstones or a conflict rule.
//
// Now the SOURCE OF TRUTH is the synced SQLite tables reality_check_open and
// calc_inputs (lib/schema.js, synced by lib/syncCore.js; Stop wins). The old
// storage is migrated ONCE per account (runRealityMigration). After that,
// user_metadata is only a WRITE-ONLY MIRROR — kept up to date (null on Stop) so
// 1.2.4 devices and the server food nudge (send-reminders) keep working — and is
// never read back, so a 1.2.4 device cannot resurrect a stopped check.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getCachedUser } from './supabase';
import { RC_START_KEY } from './notifications';
import {
  getRealityCheckRows, insertRealityCheckOpen, updateRealityCheckWeight, stopOpenRealityChecks,
  getCalcInputsRow, upsertCalcInputs, commitRealityMigration,
} from './database';
import { requestSync, pullRealityCheckTable } from './sync';
import { planLegacyMigration, currentOpenCheck, stopRealityCheckPlan, stoppedLegacyRow, toLegacyShape, validOpen } from './realityCheckStore';

const MIGRATED_KEY = (uid) => `dosetrace_rc_store_migrated_${uid}`;

async function isMigrated(user) {
  if (user?.user_metadata?.rc_store_migrated === true) return true;
  try { return (await AsyncStorage.getItem(MIGRATED_KEY(user.id))) === '1'; } catch { return false; }
}

// One-time move of the old storage into the synced tables. Offline-safe and
// idempotent (planner + tests in __tests__/realityCheckStore.test.js): rows are
// committed to local SQLite (one transaction) BEFORE the old AsyncStorage key is
// cleared. The synced flag is set only once the migrated rows reached the cloud,
// so a reinstall before the first push can still migrate from the mirror.
export async function runRealityMigration() {
  const user = await getCachedUser();
  if (!user?.id) return;
  // Plan only against what the cloud already holds (another device may have
  // migrated or stopped this check). If that pull did not succeed (offline, or the
  // cloud tables are not there yet), skip this launch: nothing is written or
  // cleared, and getRealityStart keeps reading the old storage until next time.
  let pulled = false;
  try { pulled = await pullRealityCheckTable(); } catch { pulled = false; }
  if (!pulled) return;
  const migrated = await isMigrated(user);
  let asyncStart = null;
  try { const raw = await AsyncStorage.getItem(RC_START_KEY); asyncStart = raw ? JSON.parse(raw) : null; } catch { asyncStart = null; }
  const plan = planLegacyMigration({
    asyncStart,
    metaOpen: user.user_metadata?.calc_reality_open || null,
    metaInputs: user.user_metadata?.calc_inputs || null,
    existingOpen: getRealityCheckRows(user.id),
    existingInputs: getCalcInputsRow(user.id),
    migrated,
    userId: user.id,
  });
  if (plan.openInserts.length || plan.inputsUpsert) commitRealityMigration(plan); // throws → nothing cleared
  if (plan.markMigrated) {
    try { await AsyncStorage.setItem(MIGRATED_KEY(user.id), '1'); } catch { /* retried next launch */ }
  }
  if (plan.clearLegacyAfterCommit) {
    try { await AsyncStorage.removeItem(RC_START_KEY); } catch { /* ignore */ }
  }
  if (plan.openInserts.length || plan.inputsUpsert) requestSync();
  // Synced flag: only when every migrated row has reached the cloud.
  if (user.user_metadata?.rc_store_migrated !== true) {
    const rows = [...getRealityCheckRows(user.id)];
    const inputs = getCalcInputsRow(user.id);
    if (inputs) rows.push(inputs);
    if (rows.every((r) => r.remote_id)) supabase.auth.updateUser({ data: { rc_store_migrated: true } }).catch(() => {});
  }
}

// The open weigh-in as { date, weightKg }, or null. Before this account has been
// migrated (first launch after the update, before runRealityMigration ran), the
// old storage is still the truth, so read it rather than report "no check".
export async function getRealityStart() {
  try {
    const user = await getCachedUser();
    if (!user?.id) return null;
    const open = currentOpenCheck(getRealityCheckRows(user.id));
    if (open) return toLegacyShape(open);
    if (await isMigrated(user)) return null;
    try {
      const raw = await AsyncStorage.getItem(RC_START_KEY);
      const v = raw ? JSON.parse(raw) : null;
      if (validOpen(v)) return v;
    } catch { /* ignore */ }
    const m = user.user_metadata?.calc_reality_open;
    return validOpen(m) ? m : null;
  } catch {
    return null;
  }
}

// Start a new check, or correct the start weight of the open one (same start
// date). A different start date while one is open replaces it (the old one is
// stopped, never deleted). Mirror to user_metadata for 1.2.4 / the server nudge.
export async function setRealityStart(start) {
  const user = await getCachedUser();
  if (!user?.id || !validOpen(start)) return;
  const day = String(start.date).slice(0, 10);
  const open = currentOpenCheck(getRealityCheckRows(user.id));
  if (open && String(open.start_date).slice(0, 10) === day) {
    updateRealityCheckWeight(open.id, start.weightKg);
  } else {
    if (open) stopOpenRealityChecks(user.id, new Date().toISOString());
    insertRealityCheckOpen({ user_id: user.id, start_date: day, start_weight_kg: start.weightKg });
  }
  requestSync();
  supabase.auth.updateUser({ data: { calc_reality_open: { date: day, weightKg: start.weightKg } } }).catch(() => {});
}

// Stop (user reset/stop/dismiss): every open row gets stopped_at (Stop wins
// across devices), the mirror is written as null. Food logs are never touched.
export async function clearRealityStart() {
  const user = await getCachedUser();
  const nowIso = new Date().toISOString();
  const rows = user?.id ? getRealityCheckRows(user.id) : [];
  const plan = stopRealityCheckPlan({ open: currentOpenCheck(rows), nowIso });
  if (user?.id) {
    // Every open row (defensive against duplicates) gets the plan's stop time.
    stopOpenRealityChecks(user.id, nowIso);
    // Not migrated yet: the check still lives in the old storage — record it as a
    // stopped row so a later migration can never bring it back.
    if (!(await isMigrated(user))) {
      let legacy = null;
      try { const raw = await AsyncStorage.getItem(RC_START_KEY); legacy = raw ? JSON.parse(raw) : null; } catch { legacy = null; }
      if (!validOpen(legacy)) legacy = user.user_metadata?.calc_reality_open || null;
      const r = stoppedLegacyRow({ legacy, existingOpen: rows, userId: user.id, nowIso });
      if (r) insertRealityCheckOpen(r);
    }
    requestSync();
  }
  try { await AsyncStorage.removeItem(RC_START_KEY); } catch { /* ignore */ }
  supabase.auth.updateUser({ data: { calc_reality_open: plan.mirror } }).catch(() => {});
  // plan.cancelReminders: the day-21 weigh-in and the 8 PM food nudge. Both re-plan
  // from the (now stopped) table, which cancels them. Lazy: notifications imports us.
  try {
    const n = require('./notifications');
    n.syncRealityCheckReminder().catch(() => {});
    n.syncFoodLogReminder().catch(() => {});
  } catch { /* ignore */ }
}

// Calculator inputs: synced table first; before migration, the old metadata.
export async function getCalcInputs() {
  const user = await getCachedUser();
  if (!user?.id) return null;
  const row = getCalcInputsRow(user.id);
  if (row?.payload) {
    try { return JSON.parse(row.payload); } catch { return null; }
  }
  if (await isMigrated(user)) return null;
  const m = user.user_metadata?.calc_inputs;
  return m && typeof m === 'object' ? m : null;
}

export async function saveCalcInputs(payload) {
  const user = await getCachedUser();
  if (!user?.id || !payload) return;
  upsertCalcInputs(user.id, JSON.stringify(payload));
  requestSync();
  supabase.auth.updateUser({ data: { calc_inputs: payload } }).catch(() => {}); // mirror
}
