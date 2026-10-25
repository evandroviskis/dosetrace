import { supabase, getCachedUser, storedSessionOnly, readStoredUser } from './supabase';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { buildRow } from './analyticsEvent';
import { createAnalyticsQueue, createOptOutFlag } from './analyticsQueue';

// A random id of this installation (never the account): lets a funnel be read anonymously.
const INSTALL_KEY = 'dosetrace_install_id';
let _installId = null;
async function installId() {
  if (_installId) return _installId;
  try {
    _installId = await AsyncStorage.getItem(INSTALL_KEY);
    if (!_installId) { _installId = Crypto.randomUUID(); await AsyncStorage.setItem(INSTALL_KEY, _installId); }
  } catch { _installId = _installId || null; }
  return _installId;
}

/**
 * DoseTrace Analytics — ANONYMOUS product usage events (respects the user's analytics opt-out).
 * Founder 2026-10-04: no account id and no health detail is sent (lib/analyticsEvent drops
 * compound, dose, unit, frequency, goal, colour, type and search text; a random install id instead).
 *
 * Events tracked:
 * - protocol_created: compound, type, dose, frequency, wellness_goal
 * - protocol_deactivated: compound, type, duration_days
 * - bloodwork_uploaded: biomarker_count, markers_flagged
 * - compound_search: query, type (what people search for but may not add)
 * - dose_logged: compound, type, outcome (Taken/Skipped)
 * - onboarding_completed: tracking_types, language, region
 */

// Gate B 1.3.1 item 3 (DV-184 / INV-06): in background mode (a headless notification action, the
// reminder refresh) the auth client is never touched — its insert reads the session, which may
// refresh an expired token in the background and end the session. The event's anonymous row waits
// in lib/analyticsQueue (at most 50; removed only once sent) and goes with the next foreground event.
// Council regulatory review (1.3.1, __tests__/analyticsOptOutQueue): the opt-out is checked BEFORE a
// row is queued — the stored user (read from the phone, never the auth client) and the phone's
// last-known choice (OPT_OUT_KEY, lib/analyticsQueue createOptOutFlag) — and every queued row is
// tagged with its account, so a flush never sends another account's rows. The Settings switch
// (off), the intended sign-out wipe and the cross-account discard clear the queue.
const BG_QUEUE_KEY = 'dosetrace_analytics_bg_queue';
const OPT_OUT_KEY = 'dosetrace_analytics_opt_out';
const bgQueue = createAnalyticsQueue({ storage: AsyncStorage, key: BG_QUEUE_KEY, send: (row) => supabase.from('analytics_events').insert(row) });
const optOutFlag = createOptOutFlag({ storage: AsyncStorage, key: OPT_OUT_KEY });

export function clearAnalyticsQueue() { return bgQueue.clear(); }
// The account's analytics choice as read or just changed (Settings): kept on the phone for the
// background check.
export function noteAnalyticsChoice(uid, optIn) { return optOutFlag.remember(uid, optIn === false); }

export async function logEvent(eventName, properties = {}) {
  try {
    if (storedSessionOnly()) {
      const stored = await readStoredUser(); // the user as stored on this phone (no auth client)
      if (!(await optOutFlag.mayQueue(stored))) return;
      await bgQueue.add(buildRow(eventName, properties, await installId(), Platform.OS, new Date().toISOString()), stored.id);
      return;
    }
    const user = await getCachedUser();
    if (!user) return;

    // Respect analytics opt-out (GDPR compliance)
    const optedOut = user.user_metadata?.analytics_opt_in === false;
    await optOutFlag.remember(user.id, optedOut);
    if (optedOut) {
      await bgQueue.clear(); // opted out: queued rows never go
      return;
    }

    await bgQueue.flush(user.id); // this account's rows only; any other account's are dropped
    await supabase.from('analytics_events').insert(buildRow(eventName, properties, await installId(), Platform.OS, new Date().toISOString()));
  } catch (e) {
    // Silent fail — analytics should never break the app
  }
}

// Convenience methods for common events
export const Analytics = {
  protocolCreated: (data) => logEvent('protocol_created', {
    compound: data.name,
    type: data.type,
    dose: data.dose,
    dose_unit: data.dose_unit,
    frequency: data.frequency,
    wellness_goal: data.goal || null,
    color: data.color,
  }),

  protocolDeactivated: (data) => logEvent('protocol_deactivated', {
    compound: data.name,
    type: data.type,
    duration_days: data.created_at
      ? Math.floor((Date.now() - new Date(data.created_at).getTime()) / 86400000)
      : null,
  }),

  bloodworkUploaded: (data) => logEvent('bloodwork_uploaded', {
    biomarker_count: data.biomarkerCount || 0,
  }),

  compoundSearched: (query, type) => logEvent('compound_search', {
    query,
    compound_type: type,
  }),

  doseLogged: (data) => logEvent('dose_logged', {
    compound: data.name,
    type: data.type,
    outcome: data.outcome,
    source: data.source || 'app', // 'notification' = logged from the lock-screen button
  }),

  onboardingCompleted: (data) => logEvent('onboarding_completed', {
    tracking_types: data.trackingTypes,
    language: data.language,
    region: data.region || null,
  }),

  // Feature-adoption tracking: which parts of the app people actually open.
  // `feature` becomes an event named `view_<feature>` (e.g. view_serum_curve),
  // read back per-user by the admin panel's Feature adoption section. Fire it
  // when a feature is opened (the intent), even if a paywall then intercepts —
  // so we can see interest, not just paid usage.
  viewed: (feature) => logEvent('view_' + feature, {}),

  // Conversion funnel: `source` says which card/banner/limit sent the user to the
  // paywall, so we can read conversion per entry point (serum card, PDF wall,
  // 2nd-upload wall, settings, protocol limit, preview sheet, …). purchase =
  // paywall_viewed → paywall_cta_tapped → purchase_completed, segmented by source.
  // anim_variant: which paywall hero animation was shown ('hero_b' = 1.2.4 motion);
  // view_count: this device's nth paywall view — to read curve→premium conversion.
  // A button on a notification: MARK_TAKEN / SNOOZE_HOUR / SNOOZE_TOMORROW.
  notifAction: (data) => logEvent('notif_action', { action: data.action, notif_type: data.type || null }),
  paywallViewed: (source, extra = {}) => logEvent('paywall_viewed', {
    source: source || 'unknown',
    anim_variant: extra.animVariant || null,
    view_count: extra.viewCount || null,
  }),
  paywallCtaTapped: (data) => logEvent('paywall_cta_tapped', { plan: data.plan || null, source: data.source || 'unknown' }),
  purchaseCompleted: (data) => logEvent('purchase_completed', { plan: data.plan || null, source: data.source || 'unknown' }),
  // A locked-feature preview sheet (e.g. the serum-curve example) was opened.
  previewSheetViewed: (feature) => logEvent('preview_sheet_viewed', { feature }),
};
