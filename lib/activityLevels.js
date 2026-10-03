'use strict';
// ONE activity scale everywhere (founder Q3 = A, journey-dashboard Q7; A-54): the five
// levels of the calculator, each a bold title with a sub-line, used by onboarding "Your
// routine", Edit profile and the calculator. The profile used to store four keys
// (sedentary / moderate / active / very_active). Those are MIGRATED on read — never lost:
// every old key lands on the new level with the same meaning (same word, or the next step
// up for "active"), and the next save writes the new key. Nothing is deleted.

const PROFILE_ACTIVITY = [
  { key: 'sedentary', labelKey: 'cal_act_sedentary', multiplier: 1.2 },
  { key: 'light', labelKey: 'cal_act_light', multiplier: 1.375 },
  { key: 'moderate', labelKey: 'cal_act_moderate', multiplier: 1.55 },
  { key: 'high', labelKey: 'cal_act_high', multiplier: 1.725 },
  { key: 'very_high', labelKey: 'cal_act_very_high', multiplier: 1.9 },
];

const LEGACY_TO_NEW = {
  sedentary: 'sedentary', // "Sedentary" → "Desk job, little or no exercise"
  moderate: 'moderate', // "Moderate" → "Moderate — 4–5 sessions/week"
  active: 'high', // "Active" → "High — 6–7 sessions/week"
  very_active: 'very_high', // "Very active" → "Very high — physical job + daily training"
};

const KEYS = PROFILE_ACTIVITY.map((a) => a.key);

// The stored value (new or legacy, any case/spacing) → one of the five keys, or '' when
// nothing usable is stored. Pure; never writes.
function normalizeActivityLevel(stored) {
  const v = String(stored == null ? '' : stored).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!v) return '';
  if (KEYS.includes(v)) return v;
  if (LEGACY_TO_NEW[v]) return LEGACY_TO_NEW[v];
  return '';
}

function activityByKey(key) {
  const k = normalizeActivityLevel(key);
  return PROFILE_ACTIVITY.find((a) => a.key === k) || null;
}

// The extra key to write when a stored OLD value is replaced by a new level, so the user's
// original answer is never lost: { activity_level_legacy: 'active' } or {}.
function legacyActivity(stored, next) {
  const raw = stored == null ? '' : String(stored);
  if (!raw || !next) return {};
  const isLegacy = !KEYS.includes(raw) && !!normalizeActivityLevel(raw);
  return isLegacy && raw !== next ? { activity_level_legacy: raw } : {};
}

module.exports = { PROFILE_ACTIVITY, LEGACY_TO_NEW, normalizeActivityLevel, activityByKey, legacyActivity };
