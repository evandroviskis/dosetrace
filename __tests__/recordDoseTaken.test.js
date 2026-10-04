'use strict';
// A-38 (a): the APPLY layer of Mark taken — lib/doseActions recordDoseTaken run for real with a
// fake database (the plan itself is tested in markTaken.test.js). What it writes: an insert or
// the flip of an existing row, the vial count (vialId, vialFinished), the oral units, and what it
// returns (takenAfter, the undo record's fields). A refused tap writes nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn } = require('./helpers/extractFn');
const MT = require('../lib/markTaken');

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const NOW = local(2026, 10, 3, 9, 0);

function fakeDb({ protocol, logs = [], vials = [] }) {
  const calls = [];
  let nextId = 100;
  return {
    calls,
    deps: {
      getProtocolById: (id) => (protocol && protocol.id === id ? protocol : null),
      getLogsSince: () => logs,
      getActiveVials: () => vials,
      insertDoseLog: (row) => { calls.push(['insert', row]); return nextId++; },
      updateDoseLog: (id, f) => calls.push(['updateLog', id, f]),
      updateVial: (id, f) => calls.push(['updateVial', id, f]),
      updateProtocol: (id, f) => calls.push(['updateProtocol', id, f]),
      planMarkTaken: MT.planMarkTaken,
      markTakenDay: MT.markTakenDay,
    },
  };
}
const load = (deps) => loadFn('lib/doseActions.js', 'export function recordDoseTaken(', 'recordDoseTaken', deps);

const recon = { id: 1, user_id: 'u1', remote_id: 'r1', type: 'recon', active: 1, doses_per_day: 1, interval_days: 1, reminder_time: '08:00', start_date: '2026-09-01', created_at: '2026-09-01T07:00:00.000Z', dose: '0.25', dose_unit: 'mg', amount: '5', unit: 'mg', water: '2' };

test('a new dose: one inserted Taken row at the tap time, the vial moves once', () => {
  const vial = { id: 7, protocol_id: 1, active: 1, doses_taken: 3, total_doses: 20 };
  const f = fakeDb({ protocol: recon, vials: [vial] });
  const r = load(f.deps)(1, { tapMs: NOW, atNow: true });
  const ins = f.calls.filter((c) => c[0] === 'insert');
  assert.equal(ins.length, 1);
  assert.equal(ins[0][1].outcome, 'Taken');
  assert.equal(Date.parse(ins[0][1].logged_at), NOW);
  assert.equal(r.logId, 100);
  assert.equal(r.vialId, 7);
  assert.equal(r.prevVialDosesTaken, 3);
  assert.deepEqual(f.calls.find((c) => c[0] === 'updateVial'), ['updateVial', 7, { doses_taken: 4 }]);
  assert.equal(r.vialFinished, false);
  assert.equal(r.takenAfter, 1);
});

test('the dose that empties the vial: vialFinished and the vial set inactive', () => {
  const vial = { id: 7, protocol_id: 1, active: 1, doses_taken: 19, total_doses: 20 };
  const f = fakeDb({ protocol: recon, vials: [vial] });
  const r = load(f.deps)(1, { tapMs: NOW, atNow: true });
  assert.equal(r.vialFinished, true);
  const vu = f.calls.find((c) => c[0] === 'updateVial');
  assert.equal(vu[2].doses_taken, 20);
  assert.equal(vu[2].active, 0);
});

test('an auto-Missed row of the slot is FLIPPED (updated), never a second row', () => {
  const missed = { id: 55, protocol_id: 1, outcome: 'Missed', logged_at: new Date(local(2026, 10, 3, 8, 0)).toISOString() };
  const f = fakeDb({ protocol: recon, logs: [missed] });
  const r = load(f.deps)(1, { tapMs: NOW }); // Today's card (a snoozed copy tapped late, atNow, never flips)
  assert.equal(f.calls.filter((c) => c[0] === 'insert').length, 0);
  const up = f.calls.find((c) => c[0] === 'updateLog');
  assert.equal(up[1], 55);
  assert.equal(up[2].outcome, 'Taken');
  assert.equal(r.logId, 55);
  assert.equal(r.flipped, true);
  assert.equal(r.flippedFrom, 'Missed');
});

test('oral: the units move and the undo gets exactly what this dose used', () => {
  const oral = { id: 2, user_id: 'u1', remote_id: 'r2', type: 'oral', active: 1, doses_per_day: 1, interval_days: 1, reminder_time: '08:00', start_date: '2026-09-01', created_at: '2026-09-01T07:00:00.000Z', dose: '10', dose_unit: 'mg', serving_strength: '5', serving_strength_unit: 'mg', container_units: 60, units_taken: 4 };
  const f = fakeDb({ protocol: oral });
  const r = load(f.deps)(2, { tapMs: NOW, atNow: true });
  const up = f.calls.find((c) => c[0] === 'updateProtocol');
  assert.ok(up, 'units written');
  assert.equal(r.oralPrevUnitsTaken, 4);
  assert.equal(r.oralUnitsAdded, up[2].units_taken - 4);
  assert.ok(r.oralUnitsAdded > 0);
});

test('a dose already logged: nothing written, alreadyLogged; an inactive protocol: null', () => {
  const taken = { id: 60, protocol_id: 1, outcome: 'Taken', logged_at: new Date(local(2026, 10, 3, 8, 5)).toISOString() };
  const f = fakeDb({ protocol: recon, logs: [taken] });
  const r = load(f.deps)(1, { tapMs: NOW, atNow: true });
  assert.equal(r.alreadyLogged, true);
  assert.equal(r.logId, null);
  assert.deepEqual(f.calls, []);
  for (const p of [{ ...recon, active: 0 }, { ...recon, deleted_at: '2026-10-01' }, null]) {
    const g = fakeDb({ protocol: p });
    assert.equal(load(g.deps)(1, { tapMs: NOW, atNow: true }), null);
    assert.deepEqual(g.calls, []);
  }
});

// A-38 (d): "Undo after a flipped Missed row while the site picker is open could write a site onto
// the restored Missed row." Since S-25 Today's picker only ASKS before anything is written (mode
// 'ask'; the dose — and a flip — is written by commitQuestion when the picker closes), so while it
// is open there is no written row an Undo could restore; S-20's tests cover Cancel = nothing
// written / a flipped Missed restored (sitePickerUndo.test.js).
test('A-38 (d): Today opens the site picker only to ask, and writes on its answer', () => {
  const { read, sliceBlock } = require('./helpers/extractFn');
  const today = read('screens/TodayScreen.js');
  const opens = [...today.matchAll(/setBodyMapTarget\(\{([^}]*)\}\)/g)].map((m) => m[1]);
  assert.ok(opens.length >= 1);
  for (const o of opens) assert.match(o, /mode: 'ask'/);
  const act = sliceBlock(today, '  function pickerAction(');
  assert.match(act, /if \(plan\.commit\) vialNext = commitQuestion\(tgt\.q,/);
  assert.match(sliceBlock(today, '  function commitQuestion('), /isDoseAlreadyLogged\(q\.protocolId, o\)/, 'the answer re-checks before writing');
});
