'use strict';
// F6 (Today v2.1): Today re-dates on a new local day. Pure helpers (node --test).
const pad = (n) => (n < 10 ? '0' + n : '' + n);

function dayKeyAt(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Milliseconds until the next local midnight (date methods, so 23 h / 25 h DST days are right).
function msUntilNextLocalMidnight(nowMs) {
  const d = new Date(nowMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - nowMs;
}

module.exports = { dayKeyAt, msUntilNextLocalMidnight };
