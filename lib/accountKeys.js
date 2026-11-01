'use strict';
// DV-081 (AD-05 + DL-52): the phone keys that belong to the signed-in ACCOUNT, not to the phone. They go
// with the account on an intended sign-out (lib/signedOut runWipeSteps) and when the cross-account
// guard discards a previous account's data (lib/accountGuard) — else account B inherited A's Missed-scan
// start, A's snoozed alerts, A's "vial running low" ids (local ids restart, so B's first one could be
// suppressed), A's Premium owner, food question and paywall count. Per-phone keys stay: the zone history
// (device-only on purpose), language, theme, time format, reminder setup, deep-sleep hints.
const ACCOUNT_KEYS = [
  'dosetrace_missed_since', 'dosetrace_missed_tz', 'dosetrace_missed_tz_since', // lib/doseActions
  'dosetrace_alert_snooze', 'dosetrace_snoozes', // alert and notification snoozes
  'dosetrace_vial_low_sent', // lib/notifications
  'dosetrace_entitlement_last_uid', // lib/entitlement (DV-082)
  'dosetrace_food_asked', 'dosetrace_food_local_pending', // FoodChatScreen, lib/foodLogActions
  'dosetrace_paywall_views', // PaywallScreen
];

// "Vial running low" sent ids: the local ids go (they restart and could match the next account's vials);
// the r:<cloud id> entries stay — they can never match another account's vial, and dropping them made the
// same user's already-announced vials notify again after every sign-in (A-66; Gate B review 2026-10-31).
const VIAL_LOW_SENT_KEY = 'dosetrace_vial_low_sent';
function keepCloudIds(raw) {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object') return null;
    const kept = {};
    for (const k of Object.keys(v)) if (k.startsWith('r:') && v[k]) kept[k] = true;
    return Object.keys(kept).length ? kept : null;
  } catch { return null; }
}

async function clearAccountKeys(storage) {
  let kept = null;
  try { kept = keepCloudIds(await storage.getItem(VIAL_LOW_SENT_KEY)); } catch { kept = null; }
  try { await storage.multiRemove(ACCOUNT_KEYS); } catch { /* the next sign-out retries */ }
  if (kept) { try { await storage.setItem(VIAL_LOW_SENT_KEY, JSON.stringify(kept)); } catch { /* best effort */ } }
}

module.exports = { ACCOUNT_KEYS, clearAccountKeys, keepCloudIds };
