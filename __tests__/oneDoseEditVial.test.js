'use strict';
// AD-95 F3 / DL-15 (council 2026-10-27, decided by logic): "Alterar dose" on one marked dose moves the
// vial it came from by the difference — only when that vial is the active one (a finished or put-away
// vial is history and is never rewritten). Same quantity, another unit: nothing moves.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { vialAfterOneDoseEdit } = require('../lib/doseEdit');

const protocol = { id: 7, dose: '90', dose_unit: 'mg', type: 'rtu' };
const vial = { id: 'v1', protocol_id: 7, created_at: '2026-10-01T00:00:00Z', total_doses: 22, doses_taken: 2, active: 1 };
const logs = [
  { id: 'a', protocol_id: 7, outcome: 'Taken', logged_at: '2026-10-10T10:00:00Z', dose_amount: 90, dose_unit: 'mg' },
  { id: 'b', protocol_id: 7, outcome: 'Taken', logged_at: '2026-10-17T10:00:00Z', dose_amount: 90, dose_unit: 'mg' },
];

test('a dose of the active vial corrected 90 → 180 mg: the vial loses one dose (22 → 21)', () => {
  assert.deepEqual(vialAfterOneDoseEdit(logs[1], { amount: 180, unit: 'mg' }, { protocol, vials: [vial], takenLogs: logs }), { id: 'v1', total_doses: 21 });
});

test('no change, no vial', () => {
  assert.equal(vialAfterOneDoseEdit(logs[1], { amount: 90, unit: 'mg' }, { protocol, vials: [vial], takenLogs: logs }), null, 'same amount');
  assert.equal(vialAfterOneDoseEdit(logs[1], { amount: 90000, unit: 'mcg' }, { protocol, vials: [vial], takenLogs: logs }), null, 'same mass in mcg');
  assert.equal(vialAfterOneDoseEdit(logs[1], { amount: 100, unit: 'mg' }, { protocol, vials: [{ ...vial, active: 0 }], takenLogs: logs }), null, 'a closed vial is history');
  assert.equal(vialAfterOneDoseEdit(logs[1], { amount: 100, unit: 'mg' }, { protocol, vials: [], takenLogs: logs }), null, 'no vial');
  assert.equal(vialAfterOneDoseEdit({ ...logs[1], outcome: 'Missed' }, { amount: 100, unit: 'mg' }, { protocol, vials: [vial], takenLogs: logs }), null, 'only a Taken dose');
  // 22 at 90, 2 taken; one was 95 → 20×90 − 5 = 1795 → 19 left → 21; floor keeps a partial dose out
  assert.deepEqual(vialAfterOneDoseEdit(logs[1], { amount: 95, unit: 'mg' }, { protocol, vials: [vial], takenLogs: logs }), { id: 'v1', total_doses: 21 });
  assert.equal(vialAfterOneDoseEdit(logs[1], { amount: 85, unit: 'mg' }, { protocol, vials: [vial], takenLogs: logs }), null, '5 mg back is not a whole dose: total unchanged → nothing written');
});

test('a row without its stamp counts at the dose in force then', () => {
  const bare = { ...logs[1], dose_amount: null, dose_unit: null };
  assert.deepEqual(vialAfterOneDoseEdit(bare, { amount: 180, unit: 'mg' }, { protocol, vials: [vial], takenLogs: logs }), { id: 'v1', total_doses: 21 });
});

test('wired: the Dose log writes the vial with the corrected dose', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/LogScreen.js'), 'utf8');
  assert.match(src, /vialAfterOneDoseEdit\(/);
  assert.match(src, /updateVial\(fix\.id, \{ total_doses: fix\.total_doses \}\)/);
});

test('the vial\'s taken doses: this protocol, since the vial started (SQLite or ISO time), newest first, as many as it counts', () => {
  const { vialUsedAmounts } = require('../lib/doseEdit');
  const v = { created_at: '2026-10-05 00:00:00', doses_taken: 2 };
  const rows = [
    { protocol_id: 7, outcome: 'Taken', logged_at: '2026-10-01T10:00:00Z', dose_amount: 50, dose_unit: 'mg' }, // before the vial
    { protocol_id: 7, outcome: 'Taken', logged_at: '2026-10-06T10:00:00Z', dose_amount: 90, dose_unit: 'mg' },
    { protocol_id: 7, outcome: 'Skipped', logged_at: '2026-10-07T10:00:00Z' },
    { protocol_id: 8, outcome: 'Taken', logged_at: '2026-10-08T10:00:00Z', dose_amount: 5, dose_unit: 'mg' }, // another protocol
    { protocol_id: 7, outcome: 'Taken', logged_at: '2026-10-09T10:00:00Z', dose_amount: null },
    { protocol_id: 7, outcome: 'Taken', logged_at: '2026-10-10T10:00:00Z', dose_amount: 70, dose_unit: 'mg', sync_status: 'deleted' },
  ];
  assert.deepEqual(vialUsedAmounts(rows, v, 7), [{ amount: null, unit: null }, { amount: 90, unit: 'mg' }]);
  assert.deepEqual(vialUsedAmounts(rows, null, 7), []);
});

// Independent review 2026-10-27 (#2): the rounded difference drifted — 1 → 1,5 → 1 mg lost a dose for good.
// With the vial's mass known, the vial is recomputed from its mass minus every taken dose's own amount.
test('mass known: editing a dose and editing it back gives the vial back (no drift)', () => {
  const p = { id: 7, type: 'recon', amount: '10', unit: 'mg', dose: '1', dose_unit: 'mg' };
  const v = { id: 'v', created_at: '2026-10-01T00:00:00Z', total_doses: 10, doses_taken: 5, active: 1 };
  const rows = [1, 2, 3, 4, 5].map((d) => ({ id: d, protocol_id: 7, outcome: 'Taken', logged_at: `2026-10-0${d + 1}T08:00:00Z`, dose_amount: 1, dose_unit: 'mg' }));
  const one = vialAfterOneDoseEdit(rows[4], { amount: 1.5, unit: 'mg' }, { protocol: p, vials: [v], takenLogs: rows });
  assert.deepEqual(one, { id: 'v', total_doses: 9 }, '10 − 5,5 = 4,5 → 4 left');
  const after = rows.map((r) => (r.id === 5 ? { ...r, dose_amount: 1.5 } : r));
  const back = vialAfterOneDoseEdit(after[4], { amount: 1, unit: 'mg' }, { protocol: p, vials: [{ ...v, total_doses: 9 }], takenLogs: after });
  assert.deepEqual(back, { id: 'v', total_doses: 10 }, 'back to 1 mg: 5 left again');
});

// Review #3: the "since when" summary and the save count the vial the same way.
test('the summary uses the same taken doses as the save (corrected ones at the new dose)', () => {
  const { previewUsedAmounts, vialUsedAmounts } = require('../lib/doseEdit');
  const { vialTotalAfterDoseEdit } = require('../lib/protocolForm');
  const v = { created_at: '2026-10-01T00:00:00Z', total_doses: 10, doses_taken: 4 };
  const rows = [90, 90, 90, 80].map((a, i) => ({ id: i + 1, protocol_id: 7, outcome: 'Taken', logged_at: `2026-10-0${i + 2}T08:00:00Z`, dose_amount: a, dose_unit: 'mg' }));
  const base = { total: 10, taken: 4, mass: 900, massUnit: 'mg', oldDose: '80', oldUnit: 'mg', newDose: '70', newUnit: 'mg' };
  const saved = vialTotalAfterDoseEdit({ ...base, used: vialUsedAmounts(rows, v, 7) });
  assert.equal(vialTotalAfterDoseEdit({ ...base, used: previewUsedAmounts(rows, v, 7, [], '70', 'mg') }), saved, 'from now');
  assert.equal(saved - 4, 7, '900 − 350 = 550 → 7 left');
  // from the 80 mg dose: that dose becomes 70 in the preview exactly as the save will write it
  const fixedRows = rows.map((r) => (r.id === 4 ? { ...r, dose_amount: 70 } : r));
  assert.equal(vialTotalAfterDoseEdit({ ...base, used: previewUsedAmounts(rows, v, 7, [4], '70', 'mg') }), vialTotalAfterDoseEdit({ ...base, used: vialUsedAmounts(fixedRows, v, 7) }));
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../screens/ProtocolsScreen.js'), 'utf8');
  assert.match(src, /used: previewUsedAmounts\(/, 'the summary passes them');
});

// Review #1: the amount is written before anything waits (a token refresh offline must never lose it).
test('wired: Alterar dose writes the row before any await', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../screens/LogScreen.js'), 'utf8');
  const body = src.slice(src.indexOf('function saveDoseEdit('), src.indexOf('function changeSiteFromSheet('));
  assert.doesNotMatch(body, /await /);
  assert.match(body, /deleteContext\(log, log\.user_id\)/);
});
