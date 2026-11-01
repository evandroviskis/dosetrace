// DV-064 (AD-17; parked-error sweep 2026-10-31): closing a day whose only rows were refused / unparsed / too old
// skipped the "I ate nothing" question (any row counted as food) — yet the 7-day run does not count such a day,
// so the run broke silently. Food = a read entry, or one still waiting to be read (it will count once read).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-064: closeDay asks unless the day has food the run counts (or will)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/FoodChatScreen.js'), 'utf8');
  // DV-066: an item waiting for the next day's read (quota_wait) will be read, like a pending one.
  assert.match(src, /const hasFood = \(rows \|\| \[\]\)\.some\(\(r\) => r && r\.entry_date === dayKey && !isMarker\(r\) && \(r\.parse_status === 'done' \|\| r\.parse_status === 'pending' \|\| !!quotaWaitDay\(r\.parse_status\)\)\);/);
});
