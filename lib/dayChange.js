'use strict';
// F6 (Today v2.1): Today re-dates on a new local day. Pure helpers (node --test).
const { localISO } = require('./localDate');

function dayKeyAt(ms) {
  const d = new Date(ms);
  return localISO(d);
}

// Milliseconds until the next local midnight (date methods, so 23 h / 25 h DST days are right).
function msUntilNextLocalMidnight(nowMs) {
  const d = new Date(nowMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - nowMs;
}

module.exports = { dayKeyAt, msUntilNextLocalMidnight };
