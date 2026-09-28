'use strict';
// Pure rules for the open reality check + calculator inputs in durable synced
// storage (S-03; FX-8 / FX-9 / FX-5). No React Native / Expo imports, so the
// migration and the Stop-wins merge run under plain node --test.
//
// Tables (local SQLite + Supabase, synced by lib/syncCore.js):
//   reality_check_open — one row per check: start_date, start_weight_kg,
//                         stopped_at (set on Stop, NEVER reverts: Stop wins).
//   calc_inputs        — one row per user: payload (JSON text), last writer wins.
//
// The old storage (AsyncStorage RC_START_KEY + user_metadata.calc_reality_open +
// user_metadata.calc_inputs) is migrated ONCE per account. After that,
// user_metadata is only a write-only mirror (1.2.4 devices + the server food
// nudge still read it) and is never read back as a source.

const validOpen = (v) => !!(v && typeof v.date === 'string' && v.date.length >= 10 && typeof v.weightKg === 'number' && isFinite(v.weightKg));
const dayOf = (v) => String(v.date).slice(0, 10);

// Pick the check to migrate: both present and different → newer start date;
// only one → that one.
function pickLegacyOpen(asyncStart, metaOpen) {
  const a = validOpen(asyncStart) ? asyncStart : null;
  const m = validOpen(metaOpen) ? metaOpen : null;
  if (a && m) return dayOf(m) > dayOf(a) ? m : a;
  return a || m;
}

// Match on the start date only (open OR stopped): a weight read back from the
// cloud can be rounded, and an old copy of a check that was stopped elsewhere must
// never come back as open.
function sameCheck(row, v) {
  return String(row.start_date).slice(0, 10) === dayOf(v);
}

// Latest day anything happened to a known check (a start or a stop).
function latestKnownDay(rows) {
  let d = '';
  for (const r of rows || []) {
    for (const x of [r.start_date, r.stopped_at]) {
      const k = x ? String(x).slice(0, 10) : '';
      if (k > d) d = k;
    }
  }
  return d;
}

// Plans the one-time migration. The caller commits openInserts / inputsUpsert to
// local SQLite, then (only then) clears RC_START_KEY when clearLegacyAfterCommit,
// and persists the migrated flag when markMigrated.
function planLegacyMigration({ asyncStart, metaOpen, metaInputs, existingOpen = [], existingInputs = null, migrated = false, userId }) {
  if (migrated) {
    // user_metadata is never read again. The one exception is a check started on
    // THIS device by 1.2.4 after the account migrated (only in its AsyncStorage):
    // keep it when it is newer than every known start AND stop, so it is not lost
    // and a stopped check can never come back.
    const a = validOpen(asyncStart) ? asyncStart : null;
    const keep = a && dayOf(a) > latestKnownDay(existingOpen) && !(existingOpen || []).some((r) => sameCheck(r, a));
    return {
      openInserts: keep ? [{ user_id: userId, start_date: dayOf(a), start_weight_kg: a.weightKg, stopped_at: null }] : [],
      inputsUpsert: null, markMigrated: false, clearLegacyAfterCommit: true,
    };
  }
  const openInserts = [];
  const pick = pickLegacyOpen(asyncStart, metaOpen);
  if (pick && !(existingOpen || []).some((r) => sameCheck(r, pick))) {
    openInserts.push({ user_id: userId, start_date: dayOf(pick), start_weight_kg: pick.weightKg, stopped_at: null });
  }
  let inputsUpsert = null;
  if (metaInputs && typeof metaInputs === 'object' && !existingInputs) {
    inputsUpsert = { user_id: userId, payload: JSON.stringify(metaInputs) };
  }
  return { openInserts, inputsUpsert, markMigrated: true, clearLegacyAfterCommit: true };
}

// The open check = newest row not stopped (start_date, then created_at — the same
// on every device, unlike the local id). Stop-wins merging itself lives in the
// sync engine (lib/syncCore.js) and the server trigger.
function currentOpenCheck(rows) {
  const open = (rows || []).filter((r) => !r.stopped_at);
  if (!open.length) return null;
  open.sort((x, y) => (String(y.start_date).localeCompare(String(x.start_date)))
    || String(y.created_at || '').localeCompare(String(x.created_at || ''))
    || String(y.remote_id || '').localeCompare(String(x.remote_id || '')));
  return open[0];
}

// Stop: mark the open row stopped, cancel both reminders, mirror null. Food logs
// are the user's own entries and are NEVER deleted by a Stop (keepFoodLogs).
function stopRealityCheckPlan({ open, nowIso = new Date().toISOString() } = {}) {
  return {
    open: null,
    update: open && open.id != null ? { id: open.id, stopped_at: nowIso } : null,
    cancelReminders: ['reality_check_day21', 'food_evening'],
    mirror: null,
    keepFoodLogs: true,
  };
}

// A Stop before this account migrated: record the legacy check as a STOPPED row,
// so a later migration (date-only match) can never re-import it.
function stoppedLegacyRow({ legacy, existingOpen = [], userId, nowIso }) {
  if (!validOpen(legacy)) return null;
  if ((existingOpen || []).some((r) => sameCheck(r, legacy))) return null;
  return { user_id: userId, start_date: dayOf(legacy), start_weight_kg: legacy.weightKg, stopped_at: nowIso };
}

// What the app SHOWS as the open check (display only — never writes).
//  - an open table row always wins;
//  - account not migrated: the old storage (this device's copy first, then metadata);
//  - migrated but this device has not completed a successful pull yet (new device /
//    reinstall): the user_metadata mirror, so an open check is not hidden;
//  - otherwise the table is the truth: nothing open.
function displayOpenCheck({ rows, migrated, pulledOnce, asyncStart = null, metaOpen = null }) {
  const open = currentOpenCheck(rows);
  if (open) return toLegacyShape(open);
  if (!migrated) {
    if (validOpen(asyncStart)) return asyncStart;
    return validOpen(metaOpen) ? metaOpen : null;
  }
  if (!pulledOnce) return validOpen(metaOpen) ? metaOpen : null;
  return null;
}

// Per-device S-03 flags ("this device pulled" / "migrated") — cleared on sign-out /
// local wipe, since the local table they describe is gone.
function rcDeviceFlagKeys(allKeys) {
  return (allKeys || []).filter((k) => /^dosetrace_rc_(pulled|store_migrated)_/.test(k));
}

// Row → the legacy shape the rest of the app reads ({ date, weightKg }).
function toLegacyShape(row) {
  return row ? { date: String(row.start_date).slice(0, 10), weightKg: Number(row.start_weight_kg) } : null;
}

module.exports = { planLegacyMigration, currentOpenCheck, displayOpenCheck, stopRealityCheckPlan, stoppedLegacyRow, rcDeviceFlagKeys, toLegacyShape, validOpen };
