'use strict';
// The one shape of a usage-analytics row (founder 2026-10-04: analytics are truly anonymous, as the
// screens say). No account id: a random id of this installation instead, so a funnel can still be
// read without knowing who. Health details never leave the phone this way: compound, dose, unit,
// frequency, goal, colour, protocol type and search text are dropped here, whatever a caller passes.
// Pure — __tests__/analyticsAnonymous.test.js.
const HEALTH_KEYS = ['compound', 'dose', 'dose_unit', 'frequency', 'wellness_goal', 'color', 'type', 'compound_type', 'query', 'name', 'goal'];

function buildRow(event, properties, installId, platform, nowIso) {
  const props = {};
  for (const [k, v] of Object.entries(properties || {})) if (!HEALTH_KEYS.includes(k)) props[k] = v;
  return {
    user_id: null,
    event,
    properties: { ...props, install_id: installId || null, platform: platform || null, timestamp: nowIso },
  };
}

module.exports = { buildRow, HEALTH_KEYS };
