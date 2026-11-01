// DV-134 (parked-error sweep 2026-10-31): the offline alert showed the snooze round (every alert has it, the
// approved prototype) but ignored it. It now honours the snooze like every other alert — no layout change.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-134: the offline alert respects its snooze', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/TodayScreen.js'), 'utf8');
  assert.match(src, /if \(offlinePending && !\(alertSnooze\.offline_pending && nowMs < alertSnooze\.offline_pending\)\) \{/);
});
