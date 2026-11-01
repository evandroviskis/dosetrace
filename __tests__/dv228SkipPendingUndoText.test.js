// DV-228 (parked-error sweep 2026-10-31): after "Didn't take" on yesterday's pending dose the Undo bar said
// "Dose registrada" — the record had no text and the bar fell back to the logged wording. It now says the
// existing "Dose pulada" (log_status_skipped, ×6; no new copy).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-228: the skip of a pending dose carries the skipped wording to the Undo bar', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/TodayScreen.js'), 'utf8');
  const fn = src.slice(src.indexOf('recordSkipPending(item.protocolId'), src.indexOf('recordSkipPending(item.protocolId') + 700);
  assert.match(fn, /const record = \{[^}]*text: t\('log_status_skipped'\)/);
});
