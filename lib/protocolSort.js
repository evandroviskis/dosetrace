'use strict';
// My Protocols' "Due next" order (pre-build pass m12): by the full moment of each protocol's next
// dose — date AND time — with the same nextDoseAt Today uses for its list, so a dose already
// complete today sorts by its next one. Pure (node --test: __tests__/dueNextSort.test.js).
const { nextDoseAt } = require('./schedule');

function sameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// logs: dose_log rows (any days); only today's Taken rows count, as on Today.
function dueNextOrder(protocols, logs, now = new Date()) {
  const taken = {};
  for (const l of logs || []) {
    if (l.outcome !== 'Taken') continue;
    const at = new Date(l.logged_at);
    if (!isNaN(at) && sameLocalDay(at, now)) taken[l.protocol_id] = (taken[l.protocol_id] || 0) + 1;
  }
  const at = new Map((protocols || []).map((p) => [p, nextDoseAt(p, taken[p.id] || 0, now)]));
  return [...(protocols || [])].sort((a, b) => {
    const x = at.get(a), y = at.get(b);
    if (x === y) return 0;
    if (x === Infinity) return 1;
    if (y === Infinity) return -1;
    return x - y;
  });
}

module.exports = { dueNextOrder };
