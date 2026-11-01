// DV-038 / DV-204 (AD-48, DL-76; parked-error sweep 2026-10-31): the Dose log's "Missed → Complete"
// (1) on an ENDED protocol fell back to a plain outcome flip — no daily cap, no bottle change — because
// recordDoseTaken refuses inactive protocols; it now goes through recordDoseTaken with an explicit
// pastEnded flag (only an ended protocol, never a deleted one), and the plain flip is gone;
// (2) finishing a recon vial from the Dose log deactivated it with no "All doses logged" prompt: the
// prompt's one owner is Today's queue, and the Dose log asks it (lib/vialPromptRequests).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadFn } = require('./helpers/extractFn');
const { markTakenDay, planMarkTaken } = require('../lib/markTaken');

function harness(protocol) {
  const seen = [];
  const deps = {
    markTakenDay, planMarkTaken,
    getProtocolById: () => protocol,
    getActiveVials: () => [],
    getLogsSince: () => [{ id: 70, protocol_id: 1, outcome: 'Missed', logged_at: new Date(2026, 9, 20, 9).toISOString() }],
    insertDoseLog: () => { seen.push('insert'); return 71; },
    updateDoseLog: (id, f) => { seen.push(['flip', id, f.outcome]); },
    updateVial: () => {},
    updateProtocol: (id, f) => { seen.push(['bottle', f.units_taken]); },
    doseLogBySourceKey: () => null,
    recordDoseTapKey: () => {},
    withImmediateTransaction: (fn) => fn(),
  };
  return { record: loadFn('lib/doseActions.js', 'export function recordDoseTaken(', 'recordDoseTaken', deps), seen };
}
const oral = (over) => ({ id: 1, user_id: 'u', name: 'Zinc', type: 'oral', dose: '50', dose_unit: 'mg', serving_strength: '50', serving_strength_unit: 'mg', serving_units: '1', container_units: 60, units_taken: 10, interval_days: 1, doses_per_day: 1, reminder_time: '09:00', start_date: '2026-10-01', created_at: '2026-10-01T00:00:00Z', ...over });
const opts = { dayKey: '2026-10-20', slotMs: new Date(2026, 9, 20, 9).getTime(), flipRowId: 70 };

test('DV-204: an ended protocol completes through recordDoseTaken only with pastEnded (same row, bottle moves)', () => {
  const ended = oral({ active: 0, ended_at: '2026-10-25T00:00:00Z' });
  let h = harness(ended);
  assert.equal(h.record(1, opts), null, 'no flag: still refused');
  h = harness(ended);
  const r = h.record(1, { ...opts, pastEnded: true });
  assert.ok(r && r.logId === 70);
  assert.deepEqual(h.seen, [['flip', 70, 'Taken'], ['bottle', 11]]);
  h = harness(oral({ active: 0, deleted_at: '2026-10-25T00:00:00Z' }));
  assert.equal(h.record(1, { ...opts, pastEnded: true }), null, 'a deleted protocol never');
});

test('DV-038: a request made before Today listens is delivered when it does; later ones at once', () => {
  delete require.cache[require.resolve('../lib/vialPromptRequests')];
  const V = require('../lib/vialPromptRequests');
  V.requestVialPrompt({ protocol: { id: 1 }, logId: 5 });
  const got = [];
  const off = V.onVialPromptRequest((x) => got.push(x.logId));
  V.requestVialPrompt({ protocol: { id: 1 }, logId: 6 });
  assert.deepEqual(got, [5, 6]);
  off();
});

test('DV-038/204: the Dose log uses the flag, has no plain flip, and hands a finished vial to Today', () => {
  const log = fs.readFileSync(path.join(__dirname, '..', 'screens/LogScreen.js'), 'utf8');
  const fn = log.slice(log.indexOf('  function markRowTaken(row, site) {'), log.indexOf('  function dayKeyOf(ms) {'));
  assert.match(fn, /recordDoseTaken\(protocolId, \{ [^}]*pastEnded: true[^}]*\}\)/);
  assert.doesNotMatch(fn, /writeOutcome\(/);
  assert.match(fn, /if \(res\.vialFinished\) requestVialPrompt\(\{ protocol: res\.protocol, logId: res\.logId \}\);/);
  const today = fs.readFileSync(path.join(__dirname, '..', 'screens/TodayScreen.js'), 'utf8');
  assert.match(today, /onVialPromptRequest\(\(item\) => vialRequestRef\.current\(item\)\)/);
  assert.match(today, /vialRequestRef\.current = \(\{ protocol, logId \}\) => \{\s*queueVialPrompt\(protocol, logId\);\s*if \(!undoDataRef\.current\) releasePendingVial\(\);/);
});
