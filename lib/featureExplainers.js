// The free-feature explainers (Today redesign part 18; approved 2026-09-30, handoff item 28;
// docs/design/prototype.html EXPLAINERS + FX). Rules (DESIGN.md): shown the first time someone
// reaches a feature they have not used, never on launch, "Not now" / "Try it", at most one a
// day, never on the dose-logging path, gone once the feature is used. Example numbers only.
//
// Storage choice: "used" is NOT stored here — each screen reads it from the user's own synced
// data (a recon protocol, a vial, a reminder time, a logged site, a Taken dose, calculator
// inputs, a lab value), so it follows the account to every device. What is stored is only
// "this explainer was already shown" (and the day of the last one), per user and per device,
// in AsyncStorage: a one-time explainer is not data the user entered (CLAUDE.md), and losing
// it can at worst show one explainer once more.

export const EXPLAINERS = [
  { key: 'recon', titleKey: 'xp_recon_title', bodyKey: 'xp_recon_body' },
  { key: 'vial', titleKey: 'xp_vial_title', bodyKey: 'xp_vial_body' },
  { key: 'remind', titleKey: 'xp_remind_title', bodyKey: 'xp_remind_body' },
  { key: 'sites', titleKey: 'xp_sites_title', bodyKey: 'xp_sites_body' },
  { key: 'log', titleKey: 'xp_log_title', bodyKey: 'xp_log_body' },
  { key: 'energy', titleKey: 'xp_energy_title', bodyKey: 'xp_energy_body' },
  { key: 'labsman', titleKey: 'xp_labsman_title', bodyKey: 'xp_labsman_body' },
  { key: 'notes', titleKey: 'xp_notes_title', bodyKey: 'xp_notes_body' },
];
const KNOWN = new Set(EXPLAINERS.map((x) => x.key));

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function emptyState() {
  return { shown: {}, lastDay: null };
}

// The explainer to show now, or null: the first candidate (in the screen's order) that is a
// known feature, not used yet and never shown — and none shown today.
export function pickExplainer(state, candidates, nowMs) {
  const st = state || emptyState();
  if (st.lastDay && st.lastDay === dayKey(nowMs)) return null;
  for (const c of candidates || []) {
    if (!c || !KNOWN.has(c.key) || c.used) continue;
    if (st.shown && st.shown[c.key]) continue;
    return c.key;
  }
  return null;
}

export function markShown(state, key, nowMs) {
  const st = state || emptyState();
  return { shown: { ...(st.shown || {}), [key]: nowMs }, lastDay: dayKey(nowMs) };
}

export function storageKey(userId) {
  return `dosetrace_explainers_v1:${userId}`;
}

export async function loadExplainerState(store, userId) {
  try {
    const raw = await store.getItem(storageKey(userId));
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object' && v.shown && typeof v.shown === 'object') return { shown: v.shown, lastDay: v.lastDay || null };
  } catch { /* a broken value starts fresh */ }
  return emptyState();
}

// Read, merge, write: never writes back a list computed from a stale read alone.
export async function saveShown(store, userId, key, nowMs) {
  const next = markShown(await loadExplainerState(store, userId), key, nowMs);
  try { await store.setItem(storageKey(userId), JSON.stringify(next)); } catch { /* best-effort */ }
  return next;
}
