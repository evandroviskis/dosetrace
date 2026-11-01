// DV-039 (parked-error sweep 2026-10-31): Mark taken wrote the dose row, then the vial / bottle count in
// separate statements outside any transaction (a transaction only when a notification key came along),
// so an app kill in between left a logged dose without its supply change. The dose and its supply are
// now one write, every time.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn } = require('./helpers/extractFn');
const { markTakenDay, planMarkTaken } = require('../lib/markTaken');

test('DV-039: the dose row and the vial count are written inside the same transaction', () => {
  let inTx = false;
  const seen = [];
  const deps = {
    markTakenDay, planMarkTaken,
    getProtocolById: () => ({ id: 1, user_id: 'u', name: 'BPC', type: 'recon', amount: 10, unit: 'mg', dose: 1, dose_unit: 'mg', interval_days: 1, doses_per_day: 1, reminder_time: '09:00', start_date: '2026-10-01', active: 1, created_at: '2026-10-01T00:00:00Z' }),
    getActiveVials: () => [{ id: 9, protocol_id: 1, total_doses: 10, doses_taken: 3, active: 1 }],
    getLogsSince: () => [],
    insertDoseLog: () => { seen.push(['dose', inTx]); return 55; },
    updateDoseLog: () => {},
    updateVial: () => { seen.push(['vial', inTx]); },
    updateProtocol: () => { seen.push(['bottle', inTx]); },
    doseLogBySourceKey: () => null,
    recordDoseTapKey: () => {},
    withImmediateTransaction: (fn) => { inTx = true; try { return fn(); } finally { inTx = false; } },
  };
  const record = loadFn('lib/doseActions.js', 'export function recordDoseTaken(', 'recordDoseTaken', deps);
  const r = record(1, { atNow: true }); // no notification key
  assert.equal(r.vialId, 9);
  assert.deepEqual(seen, [['dose', true], ['vial', true]]);
});
