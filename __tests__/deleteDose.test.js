'use strict';
// Delete a dose from the Dose log (founder 2026-10-02, option A): the row goes, and the
// supply goes back exactly as Today's Undo gives it back (lib/markTaken.js planUndoTake),
// to the vial that dose really used. dose_logs has no vial link, so the vial is found the
// way recordDoseTaken attributed it: the protocol's vial that was current at the dose's
// time. When that cannot be told safely, the row is deleted and the supply is not touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const { planDeleteDose, vialForDose } = require('../lib/deleteDose');

const DAY = 86400000;
const T0 = Date.parse('2026-09-01T09:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

const recon = { id: 7, user_id: 'u1', type: 'recon', amount: '10', unit: 'mg', dose: '1', dose_unit: 'mg', doses_per_day: 1 };
const oral = { id: 5, user_id: 'u1', type: 'oral', doses_per_day: 1, dose: '500', dose_unit: 'mg', serving_strength: '250', serving_strength_unit: 'mg', serving_units: '1', notes: 'capsule', container_units: 60, units_taken: 10 };
const taken = (id, ms, pid = 7) => ({ id, protocol_id: pid, outcome: 'Taken', logged_at: iso(ms) });

test('a Taken dose of the open vial: row deleted, one dose back to that vial, still open', () => {
  const vial = { id: 1, protocol_id: 7, created_at: iso(T0), doses_taken: 3, total_doses: 10, active: 1 };
  const logs = [taken(11, T0 + DAY), taken(12, T0 + 2 * DAY), taken(13, T0 + 3 * DAY)];
  const plan = planDeleteDose(logs[1], { protocol: recon, vials: [vial], takenLogs: logs });
  assert.deepEqual(plan.deleteIds, [12]);
  assert.deepEqual(plan.vialRestore, { id: 1, doses_taken: 2 });
  assert.equal(plan.oralRestore, null);
  assert.equal(plan.supply, 'vial');
});

test('the dose that finished the vial: one dose back and the vial reopens', () => {
  const vial = { id: 1, protocol_id: 7, created_at: iso(T0), doses_taken: 2, total_doses: 2, active: 0 };
  const logs = [taken(11, T0 + DAY), taken(12, T0 + 2 * DAY)];
  const plan = planDeleteDose(logs[1], { protocol: recon, vials: [vial], takenLogs: logs });
  assert.deepEqual(plan.vialRestore, { id: 1, doses_taken: 1, active: 1 });
});

test('capacity unknown on the row: derived from the protocol (10 mg / 1 mg = 10)', () => {
  const vial = { id: 1, protocol_id: 7, created_at: iso(T0), doses_taken: 10, total_doses: 0, active: 0 };
  const logs = Array.from({ length: 10 }, (_, k) => taken(100 + k, T0 + (k + 1) * 3600000));
  const plan = planDeleteDose(logs[9], { protocol: recon, vials: [vial], takenLogs: logs });
  assert.deepEqual(plan.vialRestore, { id: 1, doses_taken: 9, active: 1 });
});

test('another vial already active: the old vial gets its dose back but is never reopened (never two active)', () => {
  const old = { id: 1, protocol_id: 7, created_at: iso(T0), doses_taken: 2, total_doses: 2, active: 0 };
  const now = { id: 2, protocol_id: 7, created_at: iso(T0 + 5 * DAY), doses_taken: 1, total_doses: 2, active: 1 };
  const logs = [taken(11, T0 + DAY), taken(12, T0 + 2 * DAY), taken(13, T0 + 6 * DAY)];
  const plan = planDeleteDose(logs[1], { protocol: recon, vials: [old, now], takenLogs: logs });
  assert.deepEqual(plan.vialRestore, { id: 1, doses_taken: 1 });
});

test('a dose after the new vial started goes back to the new vial', () => {
  const old = { id: 1, protocol_id: 7, created_at: iso(T0), doses_taken: 2, total_doses: 2, active: 0 };
  const now = { id: 2, protocol_id: 7, created_at: iso(T0 + 5 * DAY), doses_taken: 1, total_doses: 2, active: 1 };
  const logs = [taken(11, T0 + DAY), taken(12, T0 + 2 * DAY), taken(13, T0 + 6 * DAY)];
  const plan = planDeleteDose(logs[2], { protocol: recon, vials: [old, now], takenLogs: logs });
  assert.deepEqual(plan.vialRestore, { id: 2, doses_taken: 0 });
});

test('a vial put away by the user (not finished by doses) is never reopened', () => {
  const vial = { id: 1, protocol_id: 7, created_at: iso(T0), doses_taken: 2, total_doses: 10, active: 0 };
  const logs = [taken(11, T0 + DAY), taken(12, T0 + 2 * DAY)];
  const plan = planDeleteDose(logs[1], { protocol: recon, vials: [vial], takenLogs: logs });
  assert.deepEqual(plan.vialRestore, { id: 1, doses_taken: 1 });
});

test('not safe to tell -> row deleted, supply untouched', () => {
  const vial = { id: 1, protocol_id: 7, created_at: iso(T0), doses_taken: 2, total_doses: 2, active: 0 };
  // A dose from before any vial (e.g. a backfilled start): no vial used it.
  const before = taken(10, T0 - DAY);
  let plan = planDeleteDose(before, { protocol: recon, vials: [vial], takenLogs: [before] });
  assert.deepEqual(plan.deleteIds, [10]);
  assert.equal(plan.vialRestore, null);
  assert.equal(plan.supply, 'none');
  // More Taken doses since the vial than it counted (some were logged after it ran out).
  const logs = [taken(11, T0 + DAY), taken(12, T0 + 2 * DAY), taken(13, T0 + 3 * DAY)];
  plan = planDeleteDose(logs[2], { protocol: recon, vials: [vial], takenLogs: logs });
  assert.equal(plan.vialRestore, null);
  // A vial date that cannot be read.
  plan = planDeleteDose(logs[0], { protocol: recon, vials: [{ ...vial, created_at: 'garbage' }], takenLogs: logs });
  assert.equal(plan.vialRestore, null);
  // A vial that counts nothing.
  plan = planDeleteDose(logs[0], { protocol: recon, vials: [{ ...vial, doses_taken: 0 }], takenLogs: [logs[0]] });
  assert.equal(plan.vialRestore, null);
  // No vial at all.
  plan = planDeleteDose(logs[0], { protocol: recon, vials: [], takenLogs: logs });
  assert.equal(plan.vialRestore, null);
  assert.deepEqual(plan.deleteIds, [11]);
});

test('SQLite default timestamps (UTC, no zone) are read as UTC', () => {
  const vial = { id: 1, protocol_id: 7, created_at: '2026-09-01 09:00:00', doses_taken: 1, total_doses: 5, active: 1 };
  const log = taken(11, T0 + 60000);
  assert.equal(vialForDose(log, [vial], [log]), vial);
  const early = taken(12, T0 - 60000);
  assert.equal(vialForDose(early, [vial], [early]), null);
});

test('the deleted row counts itself even when the list given does not hold it', () => {
  const vial = { id: 1, protocol_id: 7, created_at: iso(T0), doses_taken: 1, total_doses: 5, active: 1 };
  const log = taken(11, T0 + DAY);
  assert.equal(vialForDose(log, [vial], []), vial);
});

test('other protocols\' doses and non-Taken rows are not counted against the vial', () => {
  const vial = { id: 1, protocol_id: 7, created_at: iso(T0), doses_taken: 1, total_doses: 5, active: 1 };
  const log = taken(11, T0 + DAY);
  const others = [taken(20, T0 + DAY, 99), { id: 21, protocol_id: 7, outcome: 'Skipped', logged_at: iso(T0 + 2 * DAY) }, { id: 22, protocol_id: 7, outcome: 'Missed', logged_at: iso(T0 + 3 * DAY) }];
  assert.equal(vialForDose(log, [vial], [log, ...others]), vial);
});

test('oral: one serving goes back to the bottle (500 mg of 250 mg capsules = 2 units)', () => {
  const log = taken(31, T0, 5);
  const plan = planDeleteDose(log, { protocol: oral, vials: [], takenLogs: [log] });
  assert.deepEqual(plan.deleteIds, [31]);
  assert.deepEqual(plan.oralRestore, { protocolId: 5, units_taken: 8 });
  assert.equal(plan.vialRestore, null);
  assert.equal(plan.supply, 'bottle');
});

test('oral: a bottle that counts fewer units than one serving is not touched', () => {
  const log = taken(31, T0, 5);
  const plan = planDeleteDose(log, { protocol: { ...oral, units_taken: 1 }, vials: [], takenLogs: [log] });
  assert.equal(plan.oralRestore, null);
  assert.equal(plan.supply, 'none');
});

test('oral without a tracked bottle: row only', () => {
  const log = taken(31, T0, 5);
  const plan = planDeleteDose(log, { protocol: { ...oral, container_units: null }, vials: [], takenLogs: [log] });
  assert.equal(plan.oralRestore, null);
  assert.deepEqual(plan.deleteIds, [31]);
});

test('Skipped: the row is deleted, the supply never moves', () => {
  const vial = { id: 1, protocol_id: 7, created_at: iso(T0), doses_taken: 3, total_doses: 10, active: 1 };
  const log = { id: 40, protocol_id: 7, outcome: 'Skipped', logged_at: iso(T0 + DAY) };
  const plan = planDeleteDose(log, { protocol: recon, vials: [vial], takenLogs: [] });
  assert.deepEqual(plan, { deleteIds: [40], vialRestore: null, oralRestore: null, supply: 'none' });
  const o = planDeleteDose({ ...log, protocol_id: 5 }, { protocol: oral, vials: [], takenLogs: [] });
  assert.equal(o.oralRestore, null);
});

test('a Taken row that was flipped from Missed is deleted (the row keeps no trace of the flip)', () => {
  // The scan writes Missed at the slot's exact time and the flip keeps that time, so the
  // row alone looks like any Taken dose: it is deleted and the vial gets its dose back.
  const vial = { id: 1, protocol_id: 7, created_at: iso(T0), doses_taken: 1, total_doses: 10, active: 1 };
  const log = taken(50, T0 + DAY);
  const plan = planDeleteDose(log, { protocol: recon, vials: [vial], takenLogs: [log] });
  assert.deepEqual(plan.deleteIds, [50]);
  assert.deepEqual(plan.vialRestore, { id: 1, doses_taken: 0 });
});

test('deleted protocol / no protocol: row only', () => {
  const log = taken(60, T0 + DAY);
  const plan = planDeleteDose(log, { protocol: null, vials: [], takenLogs: [log] });
  assert.deepEqual(plan, { deleteIds: [60], vialRestore: null, oralRestore: null, supply: 'none' });
});

test('Missed rows and rows without an id are never deleted by this plan', () => {
  assert.deepEqual(planDeleteDose({ id: 70, protocol_id: 7, outcome: 'Missed', logged_at: iso(T0) }, { protocol: recon }).deleteIds, []);
  assert.deepEqual(planDeleteDose({ protocol_id: 7, outcome: 'Taken', logged_at: iso(T0) }, { protocol: recon }).deleteIds, []);
  assert.deepEqual(planDeleteDose(null).deleteIds, []);
});

test('a row deleted from the Dose log is remembered, so Today\'s Undo of it never runs', () => {
  const { rememberDeleted, wasDeleted } = require('../lib/deleteDose');
  assert.equal(wasDeleted(901), false);
  rememberDeleted(901);
  assert.equal(wasDeleted(901), true);
  assert.equal(wasDeleted('901'), true);
  assert.equal(wasDeleted(null), false);
});

test('the dose sheet\'s When word: today, yesterday, a weekday this week, else the date', () => {
  const { doseDayKind } = require('../lib/deleteDose');
  const now = new Date(2026, 9, 2, 15, 0).getTime(); // Fri 2 Oct 2026, local
  const at = (d, h = 9) => new Date(2026, 9, d, h, 0).toISOString();
  assert.equal(doseDayKind(at(2, 0), now), 'today');
  assert.equal(doseDayKind(at(1, 23), now), 'yesterday');
  assert.equal(doseDayKind(new Date(2026, 8, 27, 9).toISOString(), now), 'weekday'); // Sun, 5 days back
  assert.equal(doseDayKind(new Date(2026, 8, 25, 9).toISOString(), now), 'date'); // a week back
  assert.equal(doseDayKind('nope', now), 'date');
});
