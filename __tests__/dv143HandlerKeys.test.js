// DV-143 (parked-error sweep 2026-10-31): the foreground handler used the deprecated shouldShowAlert key
// (expo-notifications 0.32 logs a warning). It returns shouldShowBanner + shouldShowList — same behaviour.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-143: the foreground handler uses the current keys', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/notifications.js'), 'utf8');
  assert.doesNotMatch(src, /shouldShowAlert/);
  assert.match(src, /shouldShowBanner: true,\s*shouldShowList: true,\s*shouldPlaySound: true,\s*shouldSetBadge: false,/);
});
