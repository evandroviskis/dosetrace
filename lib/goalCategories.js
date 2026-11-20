'use strict';
// The goals by category (docs/specs/onboarding-protocol.md OB-10 / OB-11, picture
// docs/design/onboarding-protocolo.html section 8): 4 categories, each with its goals, in
// alphabetical order of the app language (categories and goals); 12 visible (4 + 4 + 2 + 2) and
// "Ver todos os objetivos (18)". The stored keys are the same as before (lib/profileGoals
// PROFILE_GOALS). One rule for onboarding and Ajustes › Editar perfil (DV-113). Pure.

const GOAL_KEY_T = {
  fitness: 'profile_goal_fitness', strength: 'profile_goal_strength', fat_loss: 'profile_goal_fat_loss',
  endurance: 'profile_goal_endurance', body_composition: 'profile_goal_body', wellness: 'profile_goal_wellness',
  energy: 'profile_goal_energy', sleep: 'profile_goal_sleep', hormonal_balance: 'profile_goal_hormonal',
  longevity: 'profile_goal_longevity', immune: 'profile_goal_immune', recovery: 'profile_goal_recovery',
  skin_collagen: 'profile_goal_skin', mood: 'profile_goal_mood', sexual_health: 'profile_goal_sexual',
  joint_bone: 'profile_goal_joint', cardiovascular: 'profile_goal_cardio', stress: 'profile_goal_stress',
};

// visible: how many goals of the category show before "Ver todos".
const GOAL_CATEGORIES = [
  { key: 'body', tKey: 'goal_cat_body', icon: 'flame', visible: 4, goals: ['body_composition', 'fitness', 'strength', 'fat_loss', 'endurance'] },
  { key: 'hormones', tKey: 'goal_cat_hormones', icon: 'calc_bolt', visible: 4, goals: ['energy', 'hormonal_balance', 'stress', 'mood', 'sleep', 'sexual_health'] },
  { key: 'recovery', tKey: 'goal_cat_recovery', icon: 'refresh', visible: 2, goals: ['skin_collagen', 'recovery', 'joint_bone'] },
  { key: 'health', tKey: 'goal_cat_health', icon: 'shield', visible: 2, goals: ['wellness', 'immune', 'longevity', 'cardiovascular'] },
];

const byLabel = (a, b) => a.label.localeCompare(b.label);

// → { sections: [{ key, label, icon, items: [{ key, label }] }], total, hidden }
// expanded: "Ver todos" was tapped. A selected goal that would be hidden opens the full list
// (never an invisible choice — the Edit profile rule for legacy keys).
function goalSections(t, { expanded = false, selected = [] } = {}) {
  const chosen = new Set(selected || []);
  const all = GOAL_CATEGORIES.map((c) => ({
    key: c.key, label: t(c.tKey), icon: c.icon, visible: c.visible,
    items: c.goals.map((g) => ({ key: g, label: t(GOAL_KEY_T[g]) })).sort(byLabel),
  })).sort(byLabel);
  const total = all.reduce((n, c) => n + c.items.length, 0);
  const hiddenChosen = all.some((c) => c.items.slice(c.visible).some((i) => chosen.has(i.key)));
  const open = expanded || hiddenChosen;
  const sections = all.map((c) => ({ key: c.key, label: c.label, icon: c.icon, items: open ? c.items : c.items.slice(0, c.visible) }));
  const shown = sections.reduce((n, c) => n + c.items.length, 0);
  return { sections, total, hidden: total - shown };
}

// Keys stored on the account that are not in the 18 (an old "athletic"): shown selected so they
// can be kept or removed, as Edit profile always did.
function legacyGoals(selected) {
  return (selected || []).filter((k) => !GOAL_KEY_T[k]);
}

module.exports = { GOAL_CATEGORIES, GOAL_KEY_T, goalSections, legacyGoals };
