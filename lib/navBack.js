'use strict';
// The back row of a pushed screen names the tab it returns to (pre-build pass round 2: Progress
// opened from Today's reality-check alert said "‹ Journey" and went back to Today). state = the
// Main stack's navigation state; the route below the current one is MainTabs, whose active tab
// is where Back lands. Unknown → Journey (Progress's home). Pure (node --test).
const TAB_KEYS = { Today: 'tab_today', Protocols: 'tab_protocols', Journey: 'tab_journey', Body: 'tab_body', Settings: 'tab_settings' };

function backTabKey(state, fallback = 'tab_journey') {
  if (!state || !Array.isArray(state.routes)) return fallback;
  const below = state.routes[(state.index != null ? state.index : state.routes.length - 1) - 1];
  const tabs = below && below.state;
  if (!tabs || !Array.isArray(tabs.routes)) return fallback;
  const active = tabs.routes[tabs.index != null ? tabs.index : 0];
  return (active && TAB_KEYS[active.name]) || fallback;
}

module.exports = { backTabKey };
