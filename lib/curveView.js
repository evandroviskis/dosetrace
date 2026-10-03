'use strict';
// Dose accumulation remembers how the user left it (founder 2026-10-02 bug: "every time I open
// it, it resets to the last protocol that was created"). The view — the selected compounds,
// Combined on/off and the projection horizon — comes back EXACTLY as left: nothing added (a
// protocol created later is not selected), nothing reset. Pure (node --test); the per-user
// storage is lib/curveViewStore.js. The estimate date is not remembered: it is a one-off
// question about a day, and the founder-approved 3-day opening window must stay.

const FUTURE_PRESETS = [7, 14, 30, 60, 90];
const DEFAULT_VIEW = { showCombined: true, futureDays: 7 };

const curveViewKey = (userId) => `dosetrace_curve_view_${userId}`;

// The saved view merged with one change (a patch never drops another key).
function curveViewPatch(saved, patch) {
  const base = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  return { ...base, ...(patch || {}) };
}

// The remembered compounds still on the chart, in the order they were saved: a deleted,
// archived or no-longer-chartable compound is dropped; mg and IU never share an axis, so
// only the first remembered unit's compounds stay.
function rememberedIds(saved, active, unitOf) {
  const ids = saved && Array.isArray(saved.selectedIds) ? saved.selectedIds : [];
  const still = ids.filter((id, i) => ids.indexOf(id) === i && (active || []).some((p) => p.id === id));
  if (!still.length) return [];
  const u0 = unitOf(still[0]);
  return still.filter((id) => unitOf(id) === u0);
}

// The view the screen opens with. Nothing valid remembered → today's default: the first
// charted compound, Combined on, +7 days.
function restoreCurveView({ saved, active, unitOf }) {
  const kept = rememberedIds(saved, active, unitOf);
  const s = saved && typeof saved === 'object' ? saved : {};
  return {
    selectedIds: kept.length ? kept : (active && active[0] ? [active[0].id] : []),
    showCombined: typeof s.showCombined === 'boolean' ? s.showCombined : DEFAULT_VIEW.showCombined,
    futureDays: FUTURE_PRESETS.includes(s.futureDays) ? s.futureDays : DEFAULT_VIEW.futureDays,
  };
}

// The Journey tile's compound: the first one the curve opens on.
function tileProtocol({ saved, active, unitOf }) {
  const { selectedIds } = restoreCurveView({ saved, active, unitOf });
  return selectedIds.length ? (active || []).find((p) => p.id === selectedIds[0]) || null : null;
}

module.exports = { FUTURE_PRESETS, DEFAULT_VIEW, curveViewKey, curveViewPatch, restoreCurveView, tileProtocol };
