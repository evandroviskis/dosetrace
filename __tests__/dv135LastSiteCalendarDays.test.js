// DV-135 (parked-error sweep 2026-10-31): the last-site line counted elapsed hours — a dose at 23:00 yesterday read
// "Last: {site} · today" the next morning, and 47 h read "1d ago". It now counts calendar days (lib/localDate
// calendarDaysSince, the rule the Recently deleted line already uses).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-135: the last-site line uses calendar days', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/TodayScreen.js'), 'utf8');
  assert.match(src, /const daysAgo = calendarDaysSince\(l\.logged_at\);/);
  assert.doesNotMatch(src, /Math\.floor\(ms \/ \(1000 \* 60 \* 60 \* 24\)\)/);
});
