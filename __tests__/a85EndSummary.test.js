// A-85 / SG-16 simulator proof 2026-10-30 (iPhone 17 Pro Max, account evandro1985+qa2): after "Encerrar"
// on the empty-vial prompt, BPC-157's dose reminders were gone but the morning summaries for the next
// six days ("Bom dia — Hoje: BPC-157.") stayed scheduled until the app was opened again. The morning
// summary and the vial alerts name protocols across the board, so the one End runs the serialized
// re-plan (syncAllNotifications) right after the protocol is Ended (they read the active protocols, which no longer include it).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadFn } = require('./helpers/extractFn');

function endFlow(calls) {
  return loadFn('lib/endProtocolFlow.js', 'export function endProtocolFully(', 'endProtocolFully', {
    endProtocolNow: (id) => { calls.push(['endNow', id]); return '2026-10-30T12:00:00.000Z'; },
    cancelDoseReminder: async (id) => { calls.push(['cancel', id]); },
    dismissDeliveredDoseReminders: async (id) => { calls.push(['dismiss', id]); },
    syncAllNotifications: async () => { calls.push(['replan']); },
    AsyncStorage: { removeItem: async (k) => { calls.push(['removeKey', k]); } },
  });
}

test('A-85 / SG-16: the one End re-plans every reminder (morning summary, vial alerts) after the protocol is Ended', () => {
  const calls = [];
  endFlow(calls)(7);
  const at = (name) => calls.findIndex((c) => c[0] === name);
  assert.ok(at('endNow') >= 0 && at('replan') > at('endNow'), 'the one re-plan runs after the End');
});

test('A-85 / SG-16: the re-plan is the real serialized one (syncAllNotifications), never a per-kind scheduler', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/endProtocolFlow.js'), 'utf8');
  assert.match(src, /import \{[^}]*\bsyncAllNotifications\b[^}]*\} from '\.\/notifications';/);
  assert.doesNotMatch(src, /syncMorningSummary|syncVialAlerts/);
});
