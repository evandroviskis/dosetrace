'use strict';
// The goals by category (docs/specs/onboarding-protocol.md OB-10 / OB-11): 4 categories, each with
// its goals, ordered by how often people choose them; all 18 visible. The stored keys are the same as
// before (lib/profileGoals PROFILE_GOALS). One rule for onboarding and Ajustes › Editar perfil (DV-113). Pure.

const GOAL_KEY_T = {
  fitness: 'profile_goal_fitness', strength: 'profile_goal_strength', fat_loss: 'profile_goal_fat_loss',
  endurance: 'profile_goal_endurance', body_composition: 'profile_goal_body', wellness: 'profile_goal_wellness',
  energy: 'profile_goal_energy', sleep: 'profile_goal_sleep', hormonal_balance: 'profile_goal_hormonal',
  longevity: 'profile_goal_longevity', immune: 'profile_goal_immune', recovery: 'profile_goal_recovery',
  skin_collagen: 'profile_goal_skin', mood: 'profile_goal_mood', sexual_health: 'profile_goal_sexual',
  joint_bone: 'profile_goal_joint', cardiovascular: 'profile_goal_cardio', stress: 'profile_goal_stress',
};

// Order = popularity in the base (accounts' primary_goal, counted 2026-11-20): categories by their
// total, goals inside each by their own count (a tie keeps Qualidade do sono first). All 18 show at
// once — no "Ver todos" (founder 2026-11-20 on the Fold: the alphabetical 12 hid Qualidade do sono).
const GOAL_CATEGORIES = [
  { key: 'body', tKey: 'goal_cat_body', icon: 'flame', goals: ['body_composition', 'fat_loss', 'strength', 'endurance', 'fitness'] },
  { key: 'hormones', tKey: 'goal_cat_hormones', icon: 'calc_bolt', goals: ['energy', 'sleep', 'sexual_health', 'hormonal_balance', 'mood', 'stress'] },
  { key: 'health', tKey: 'goal_cat_health', icon: 'shield', goals: ['wellness', 'longevity', 'cardiovascular', 'immune'] },
  { key: 'recovery', tKey: 'goal_cat_recovery', icon: 'refresh', goals: ['joint_bone', 'recovery', 'skin_collagen'] },
];

// → { sections: [{ key, label, icon, items: [{ key, label }] }], total } — all 18 shown at once
// (founder 2026-11-20 09:56: ordered by how often accounts chose them, no Ver todos).
function goalSections(t) {
  const sections = GOAL_CATEGORIES.map((c) => ({
    key: c.key, label: t(c.tKey), icon: c.icon,
    items: c.goals.map((g) => ({ key: g, label: t(GOAL_KEY_T[g]) })),
  }));
  const total = sections.reduce((n, c) => n + c.items.length, 0);
  return { sections, total };
}

// Keys stored on the account that are not in the 18 (an old "athletic"): shown selected so they
// can be kept or removed, as Edit profile always did.
function legacyGoals(selected) {
  return (selected || []).filter((k) => !GOAL_KEY_T[k]);
}

module.exports = { GOAL_CATEGORIES, GOAL_KEY_T, goalSections, legacyGoals };
