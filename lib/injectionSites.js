/**
 * DoseTrace — canonical injection-site definitions
 *
 * Used by BodyMapModal to render zones and by dose_logs to persist
 * which site(s) a dose was injected into. Stored as a JSON-encoded
 * value in dose_logs.injection_site (TEXT column).
 *
 * Coordinates live inside a 100×220 viewBox shared by all body figures
 * (front and back). The same (x, y) on the front and back maps to the
 * same body part — this is intentional so that the figure and the dot
 * positions stay aligned across views.
 *
 * IMPORTANT — regulatory framing:
 *   This file is data-only. It does NOT make recommendations tied to
 *   any specific drug, dose, or clinical outcome. The "next site"
 *   helper rotates by user-set rules (last-used timestamp), not by
 *   pharmacology. The app is a personal log, not clinical decision
 *   support — see disclaimer copy in i18n keys.
 */

export const SITE_TYPES = { SUBQ: 'subq', IM: 'im' };
export const SITE_VIEWS = { FRONT: 'front', BACK: 'back' };

// Canonical site list. labelKey resolves via t() in LanguageContext.
export const SITES = [
  // ── Subcutaneous, front ──────────────────────────────────────────
  { id: 'abdomen_ul',   type: 'subq', view: 'front', group: 'abdomen', side: 'left',  x: 42, y: 92,  labelKey: 'site_abdomen_upper_left' },
  { id: 'abdomen_ur',   type: 'subq', view: 'front', group: 'abdomen', side: 'right', x: 58, y: 92,  labelKey: 'site_abdomen_upper_right' },
  { id: 'abdomen_ll',   type: 'subq', view: 'front', group: 'abdomen', side: 'left',  x: 44, y: 105, labelKey: 'site_abdomen_lower_left' },
  { id: 'abdomen_lr',   type: 'subq', view: 'front', group: 'abdomen', side: 'right', x: 56, y: 105, labelKey: 'site_abdomen_lower_right' },
  { id: 'thigh_f_l',    type: 'subq', view: 'front', group: 'thigh',   side: 'left',  x: 40, y: 145, labelKey: 'site_thigh_front_left' },
  { id: 'thigh_f_r',    type: 'subq', view: 'front', group: 'thigh',   side: 'right', x: 60, y: 145, labelKey: 'site_thigh_front_right' },
  { id: 'arm_back_l_f', type: 'subq', view: 'front', group: 'arm',     side: 'left',  x: 22, y: 68,  labelKey: 'site_arm_back_left' },
  { id: 'arm_back_r_f', type: 'subq', view: 'front', group: 'arm',     side: 'right', x: 78, y: 68,  labelKey: 'site_arm_back_right' },

  // ── Subcutaneous, back ───────────────────────────────────────────
  // Same physical sites for arms — but separate IDs so view-toggling works cleanly.
  { id: 'arm_back_l_b',     type: 'subq', view: 'back', group: 'arm',   side: 'left',  x: 22, y: 68,  labelKey: 'site_arm_back_left' },
  { id: 'arm_back_r_b',     type: 'subq', view: 'back', group: 'arm',   side: 'right', x: 78, y: 68,  labelKey: 'site_arm_back_right' },
  { id: 'flank_l',          type: 'subq', view: 'back', group: 'flank', side: 'left',  x: 34, y: 100, labelKey: 'site_flank_left' },
  { id: 'flank_r',          type: 'subq', view: 'back', group: 'flank', side: 'right', x: 66, y: 100, labelKey: 'site_flank_right' },
  { id: 'glute_dimple_l',   type: 'subq', view: 'back', group: 'glute', side: 'left',  x: 40, y: 128, labelKey: 'site_glute_dimple_left' },
  { id: 'glute_dimple_r',   type: 'subq', view: 'back', group: 'glute', side: 'right', x: 60, y: 128, labelKey: 'site_glute_dimple_right' },
  { id: 'thigh_b_l',        type: 'subq', view: 'back', group: 'thigh', side: 'left',  x: 40, y: 160, labelKey: 'site_thigh_back_left' },
  { id: 'thigh_b_r',        type: 'subq', view: 'back', group: 'thigh', side: 'right', x: 60, y: 160, labelKey: 'site_thigh_back_right' },

  // ── Intramuscular, front ─────────────────────────────────────────
  { id: 'deltoid_l',  type: 'im', view: 'front', group: 'deltoid', side: 'left',  x: 22, y: 58,  labelKey: 'site_deltoid_left' },
  { id: 'deltoid_r',  type: 'im', view: 'front', group: 'deltoid', side: 'right', x: 78, y: 58,  labelKey: 'site_deltoid_right' },
  { id: 'vastus_l',   type: 'im', view: 'front', group: 'vastus',  side: 'left',  x: 36, y: 145, labelKey: 'site_vastus_left' },
  { id: 'vastus_r',   type: 'im', view: 'front', group: 'vastus',  side: 'right', x: 64, y: 145, labelKey: 'site_vastus_right' },

  // ── Intramuscular, back ──────────────────────────────────────────
  { id: 'ventroglute_l', type: 'im', view: 'back', group: 'ventroglute', side: 'left',  x: 36, y: 124, labelKey: 'site_ventrogluteal_left' },
  { id: 'ventroglute_r', type: 'im', view: 'back', group: 'ventroglute', side: 'right', x: 64, y: 124, labelKey: 'site_ventrogluteal_right' },
  { id: 'dorsoglute_l',  type: 'im', view: 'back', group: 'dorsoglute',  side: 'left',  x: 40, y: 138, labelKey: 'site_dorsogluteal_left' },
  { id: 'dorsoglute_r',  type: 'im', view: 'back', group: 'dorsoglute',  side: 'right', x: 60, y: 138, labelKey: 'site_dorsogluteal_right' },
];

// ── Lookups ──────────────────────────────────────────────────────────
const _byId = Object.fromEntries(SITES.map(s => [s.id, s]));
export function getSiteById(id) { return _byId[id] || null; }

export function getSitesByView(view, type) {
  return SITES.filter(s => s.view === view && s.type === type);
}

// ── Storage helpers ──────────────────────────────────────────────────
// Stored shape in dose_logs.injection_site (TEXT):
//   - JSON object: { type: 'subq'|'im', sites: ['abdomen_lr', 'thigh_f_r'] }
//   - Or a plain legacy string (from older versions / hand-edited rows)
//
// parseStored() returns { type, sites } regardless of stored format.
// If stored is a plain string that isn't JSON, sites is empty and freeText holds it.

export function parseStored(stored) {
  if (!stored) return { type: null, sites: [], freeText: null };
  if (typeof stored !== 'string') return { type: null, sites: [], freeText: null };
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) return { type: null, sites: parsed.filter(Boolean), freeText: null };
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.sites)) {
      return { type: parsed.type || null, sites: parsed.sites.filter(Boolean), freeText: null };
    }
    return { type: null, sites: [], freeText: stored };
  } catch {
    return { type: null, sites: [], freeText: stored };
  }
}

export function serializeForStorage(type, siteIds) {
  if (!siteIds || siteIds.length === 0) return null;
  return JSON.stringify({ type: type || null, sites: siteIds });
}

// Human-readable summary for display, given a t() function.
// Returns e.g. "Abdomen, Thigh" — comma-joined unique groups for the selected sites.
export function summarizeStored(stored, t) {
  const parsed = parseStored(stored);
  if (parsed.freeText) return parsed.freeText;
  if (!parsed.sites.length) return null;
  const groups = new Set();
  for (const sid of parsed.sites) {
    const s = getSiteById(sid);
    if (s) groups.add(s.group);
  }
  return Array.from(groups).map(g => t(`group_${g}`)).join(', ');
}

// ── Rotation suggestion ──────────────────────────────────────────────
// Returns the site (in the given view+type) that has gone the longest
// without being used. Unused sites are preferred.
//
// This is a USER-CONFIGURABLE rotation reminder — not a clinical
// recommendation, not drug-aware, not pharmacology-driven.
export function suggestNextSite(view, type, recentLogs) {
  const candidates = getSitesByView(view, type);
  if (!candidates.length) return null;

  const lastUsed = {};
  for (const log of (recentLogs || [])) {
    const parsed = parseStored(log.injection_site);
    for (const sid of parsed.sites || []) {
      const ts = log.logged_at;
      if (!lastUsed[sid] || ts > lastUsed[sid]) lastUsed[sid] = ts;
    }
  }

  let best = null;
  for (const c of candidates) {
    if (!lastUsed[c.id]) return c; // never used → return immediately
    if (!best || lastUsed[c.id] < lastUsed[best.id]) best = c;
  }
  return best;
}
