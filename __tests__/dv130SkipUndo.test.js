// DV-130 (AD-86, founder 2026-10-15: an Undo bar after Skip too; Undo re-arms the reminders; the "Skip dose?"
// sheet stays; parked-error sweep 2026-10-31): Skip on Today's card wrote the Skipped row with no Undo bar.
// It now shows the same bar as "Didn't take" (text "Pulada"); Undo goes through the one undo path, which
// deletes the Skipped row and re-plans the reminders (syncAllNotifications, DL-09).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-130: Skip shows the Undo bar with what happened', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/TodayScreen.js'), 'utf8');
  const fn = src.slice(src.indexOf('  function skipDose(protocol, slot) {'), src.indexOf('  function closeSkipAsk() {'));
  assert.match(fn, /const record = \{ logId, flipped: false, protocolId: protocol\.id, pending: true, extraDeleteIds: \[\], vialId: null, prevDosesTaken: null, oralPrevUnitsTaken: null, timer: null, fx: null, text: t\('log_status_skipped'\) \};/);
  assert.match(fn, /keepUndo\(record\);\s*setUndoData\(record\);/);
  assert.match(fn, /setSkipAsk\(\{ name: protocolDisplayName\(protocol, t\), onSkip: write \}\)/, 'the sheet stays');
  // The undo path re-plans the reminders.
  assert.match(src, /syncAllNotifications\(\)\.catch\(\(\) => \{\}\);\s*\/\/ The "start a new vial\?" prompt of the undone dose/);
});
