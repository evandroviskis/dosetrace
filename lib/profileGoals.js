// Single source of truth for the profile "goal" options, shared by the onboarding
// flow and the Settings profile editor so the two can never drift apart. Each
// entry is a stable storage key + its i18n label key. Screens map these to
// { key, label: t(tKey) } and sort by the localized label (alphabetical).
export const PROFILE_GOALS = [
  { key: 'fitness', tKey: 'profile_goal_fitness' },
  { key: 'strength', tKey: 'profile_goal_strength' },
  { key: 'fat_loss', tKey: 'profile_goal_fat_loss' },
  { key: 'endurance', tKey: 'profile_goal_endurance' },
  { key: 'body_composition', tKey: 'profile_goal_body' },
  { key: 'wellness', tKey: 'profile_goal_wellness' },
  { key: 'energy', tKey: 'profile_goal_energy' },
  { key: 'sleep', tKey: 'profile_goal_sleep' },
  { key: 'hormonal_balance', tKey: 'profile_goal_hormonal' },
  { key: 'longevity', tKey: 'profile_goal_longevity' },
  { key: 'immune', tKey: 'profile_goal_immune' },
  { key: 'recovery', tKey: 'profile_goal_recovery' },
  { key: 'skin_collagen', tKey: 'profile_goal_skin' },
  { key: 'mood', tKey: 'profile_goal_mood' },
  { key: 'sexual_health', tKey: 'profile_goal_sexual' },
  { key: 'joint_bone', tKey: 'profile_goal_joint' },
  { key: 'cardiovascular', tKey: 'profile_goal_cardio' },
  { key: 'stress', tKey: 'profile_goal_stress' },
];

// Localized + alphabetically-ordered option list for a picker.
export function goalOptions(t) {
  return PROFILE_GOALS
    .map((g) => ({ key: g.key, label: t(g.tKey) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
