// Senior review 2026-10-31 (notifications), fixed on the spot: ending a protocol from Today's "still
// taking it?" question cancelled its reminders but never re-planned the set, unlike every other End
// (lib/endProtocolFlow endProtocolFully). A full resync running at that moment could re-arm the ended
// protocol's reminders from its stale snapshot. Now this End re-plans too, through the same queue.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('ending a protocol from Today re-plans every reminder, like every other End', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/TodayScreen.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function endInactiveProtocol()'), src.indexOf('async function snoozeInactiveProtocol()'));
  assert.match(fn, /cancelDoseReminder\(p\.id\)\.catch\(\(\) => \{\}\);\s*syncAllNotifications\(\)\.catch\(\(\) => \{\}\);/);
});
