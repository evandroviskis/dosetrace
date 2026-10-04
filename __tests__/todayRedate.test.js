'use strict';
// Today v2.1 package, F6 (approved 2026-09-29: "F1 and F6 fixed with failing-then-passing
// tests"): Today kept yesterday's date and doses when the app came back the next morning or
// stayed open over midnight. It now re-dates — the date, the doses, Pending from yesterday, the
// Missed scan and the tracker — when it returns to the foreground on a new day and at local
// midnight while it is open (lib/dayChange).
const test = require('node:test');
const assert = require('node:assert/strict');
const { msUntilNextLocalMidnight, dayKeyAt } = require('../lib/dayChange');
const { read } = require('./helpers/extractFn');

test('the next local midnight and the day key', () => {
  const t = new Date(2026, 9, 3, 23, 59, 30).getTime();
  assert.equal(msUntilNextLocalMidnight(t), 30000);
  assert.equal(dayKeyAt(t), '2026-10-03');
  assert.equal(dayKeyAt(t + 31000), '2026-10-04');
});

test('Today re-dates on resume (any layout) and at midnight', () => {
  const src = read('screens/TodayScreen.js');
  assert.match(src, /function refreshIfNewDay\(\)/);
  assert.match(src, /if \(dayKeyAt\(Date\.now\(\)\) === shownDayRef\.current\) return;/);
  assert.match(src, /if \(st === 'active' && focusedRef\.current\) refreshIfNewDay\(\);/);
  assert.match(src, /setTimeout\(tick, msUntilNextLocalMidnight\(Date\.now\(\)\) \+ 1000\)/);
});
