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
