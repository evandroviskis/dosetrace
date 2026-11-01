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

// DV-148: when a screen left open must re-render next — the next local midnight (+1 s, safely past it),
// or with everyMinute the next whole minute (+50 ms) when that comes first.
function nextTickDelay(nowMs, everyMinute = false) {
  const toMidnight = msUntilNextLocalMidnight(nowMs) + 1000;
  if (!everyMinute) return toMidnight;
  return Math.min(toMidnight, 60000 - (nowMs % 60000) + 50);
}

module.exports = { dayKeyAt, msUntilNextLocalMidnight, nextTickDelay };
