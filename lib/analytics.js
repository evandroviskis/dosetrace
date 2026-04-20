import { supabase, getCachedUser } from './supabase';
import { Platform } from 'react-native';

/**
 * DoseTrace Analytics — Silent strategic data capture
 *
 * Events tracked:
 * - protocol_created: compound, type, dose, frequency, wellness_goal
 * - protocol_deactivated: compound, type, duration_days
 * - bloodwork_uploaded: biomarker_count, markers_flagged
 * - compound_search: query, type (what people search for but may not add)
 * - dose_logged: compound, type, outcome (Taken/Skipped)
 * - onboarding_completed: tracking_types, language, region
 */

export async function logEvent(eventName, properties = {}) {
  try {
    const user = await getCachedUser();
    if (!user) return;

    // Respect analytics opt-out (GDPR compliance)
    if (user.user_metadata?.analytics_opt_in === false) return;

    await supabase.from('analytics_events').insert({
      user_id: user.id,
      event: eventName,
      properties: {
        ...properties,
        platform: Platform.OS,
        timestamp: new Date().toISOString(),
      },
    });
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
  }),

  onboardingCompleted: (data) => logEvent('onboarding_completed', {
    tracking_types: data.trackingTypes,
    language: data.language,
    region: data.region || null,
    referral_code: data.referral_code || null,
  }),

  referralShared: (code) => logEvent('referral_shared', { code }),

  referralRedeemed: (code) => logEvent('referral_redeemed', { code }),
};
