/**
 * DoseTrace — canonical injection-site definitions
 *
 * Used by BodyMapModal to render zones and by dose_logs to persist
 * which site(s) a dose was injected into. Stored as a JSON-encoded
 * value in dose_logs.injection_site (TEXT column).
 *
 * The ids are what a log stores and never change. Where each site is drawn
 * on the body images (per sex and view) lives in lib/bodySites.js.
 *
 * IMPORTANT — regulatory framing:
 *   This file is data-only. It does NOT make recommendations tied to
 *   any specific drug, dose, or clinical outcome. The "next site"
 *   helper rotates by user-set rules (last-used timestamp), not by
 *   pharmacology. The app is a personal log, not clinical decision
 *   support — see disclaimer copy in i18n keys.
 */

// Canonical site list. labelKey resolves via t() in LanguageContext.
export const SITES = [
  // ── Subcutaneous, front ──────────────────────────────────────────
  { id: 'abdomen_ul',   type: 'subq', view: 'front', group: 'abdomen', side: 'left', labelKey: 'site_abdomen_upper_left' },
  { id: 'abdomen_ur',   type: 'subq', view: 'front', group: 'abdomen', side: 'right', labelKey: 'site_abdomen_upper_right' },
  { id: 'abdomen_ll',   type: 'subq', view: 'front', group: 'abdomen', side: 'left', labelKey: 'site_abdomen_lower_left' },
  { id: 'abdomen_lr',   type: 'subq', view: 'front', group: 'abdomen', side: 'right', labelKey: 'site_abdomen_lower_right' },
  { id: 'thigh_f_l',    type: 'subq', view: 'front', group: 'thigh',   side: 'left', labelKey: 'site_thigh_front_left' },
  { id: 'thigh_f_r',    type: 'subq', view: 'front', group: 'thigh',   side: 'right', labelKey: 'site_thigh_front_right' },
  { id: 'arm_back_l_f', type: 'subq', view: 'front', group: 'arm',     side: 'left', labelKey: 'site_arm_back_left' },
  { id: 'arm_back_r_f', type: 'subq', view: 'front', group: 'arm',     side: 'right', labelKey: 'site_arm_back_right' },

  // ── Subcutaneous, back ───────────────────────────────────────────
  // Same physical sites for arms — but separate IDs so view-toggling works cleanly.
  { id: 'arm_back_l_b',     type: 'subq', view: 'back', group: 'arm',   side: 'left', labelKey: 'site_arm_back_left' },
  { id: 'arm_back_r_b',     type: 'subq', view: 'back', group: 'arm',   side: 'right', labelKey: 'site_arm_back_right' },
  { id: 'flank_l',          type: 'subq', view: 'back', group: 'flank', side: 'left', labelKey: 'site_flank_left' },
  { id: 'flank_r',          type: 'subq', view: 'back', group: 'flank', side: 'right', labelKey: 'site_flank_right' },
  { id: 'glute_dimple_l',   type: 'subq', view: 'back', group: 'glute', side: 'left', labelKey: 'site_glute_dimple_left' },
  { id: 'glute_dimple_r',   type: 'subq', view: 'back', group: 'glute', side: 'right', labelKey: 'site_glute_dimple_right' },
  { id: 'thigh_b_l',        type: 'subq', view: 'back', group: 'thigh', side: 'left', labelKey: 'site_thigh_back_left' },
  { id: 'thigh_b_r',        type: 'subq', view: 'back', group: 'thigh', side: 'right', labelKey: 'site_thigh_back_right' },

  // ── Intramuscular, front ─────────────────────────────────────────
  { id: 'deltoid_l',  type: 'im', view: 'front', group: 'deltoid', side: 'left', labelKey: 'site_deltoid_left' },
  { id: 'deltoid_r',  type: 'im', view: 'front', group: 'deltoid', side: 'right', labelKey: 'site_deltoid_right' },
  { id: 'vastus_l',   type: 'im', view: 'front', group: 'vastus',  side: 'left', labelKey: 'site_vastus_left' },
  { id: 'vastus_r',   type: 'im', view: 'front', group: 'vastus',  side: 'right', labelKey: 'site_vastus_right' },

  // ── Intramuscular, back ──────────────────────────────────────────
  { id: 'ventroglute_l', type: 'im', view: 'back', group: 'ventroglute', side: 'left', labelKey: 'site_ventrogluteal_left' },
  { id: 'ventroglute_r', type: 'im', view: 'back', group: 'ventroglute', side: 'right', labelKey: 'site_ventrogluteal_right' },
  { id: 'dorsoglute_l',  type: 'im', view: 'back', group: 'dorsoglute',  side: 'left', labelKey: 'site_dorsogluteal_left' },
  { id: 'dorsoglute_r',  type: 'im', view: 'back', group: 'dorsoglute',  side: 'right', labelKey: 'site_dorsogluteal_right' },
];

// ── Lookups ──────────────────────────────────────────────────────────
const _byId = Object.fromEntries(SITES.map(s => [s.id, s]));
export function getSiteById(id) { return _byId[id] || null; }

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

// What the picker's Save stores (A-55 / FX-21): an older row can hold free text
// ("left glute") that the picker cannot show as a dot. Saving with nothing picked
// keeps that text — never null over it. A new pick replaces it. Sites the user had
// PICKED are hydrated as selected, so clearing them all is the user's own removal.
export function siteToStore({ type, selected, initialStored = null }) {
  if (selected && selected.length) return serializeForStorage(type, selected);
  const prev = parseStored(initialStored);
  return prev.freeText ? initialStored : null;
}

// Is a site saved on this row (picked dots or typed text)? The picker offers
// "Remove site" only then (S-20: sites are optional and removable without undoing the dose).
export function hasSavedSite(stored) {
  const p = parseStored(stored);
  return !!(p.freeText || p.sites.length);
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

// The full name of a stored site for one line (Today "Last: Abdomen, lower left · 1d ago",
// the "Site saved · …" toast, the Taken list; prototype siteText): one site → its full
// name; several → "2 sites · Abdomen, Thigh"; typed text → in quotes. Reads only.
export function describeStored(stored, t) {
  const parsed = parseStored(stored);
  if (parsed.freeText) return `“${parsed.freeText}”`;
  const known = parsed.sites.map(getSiteById).filter(Boolean);
  if (!known.length) return null;
  if (known.length === 1) return t(known[0].labelKey);
  const groups = [];
  for (const s of known) if (!groups.includes(s.group)) groups.push(s.group);
  return `${t('today_sites_n').replace('{n}', String(known.length))} · ${groups.map(g => t(`group_${g}`)).join(', ')}`;
}

// The "Longest unused in your log" recall (a recall of the user's own log, not a
// clinical recommendation) lives in lib/bodySites.js siteLongest().
