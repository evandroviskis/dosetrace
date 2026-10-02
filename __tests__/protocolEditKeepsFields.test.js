'use strict';
// My Protocols redesign, founder decisions 2026-10-02 (binding):
//  2. a NEW protocol always starts with "Today" chosen in the first-dose bar; EDITING a
//     protocol changes ONLY what the user changes — opening Edit and saving without a change
//     writes no field (start_date, frequency, times, doses, vial fields, colour, ...), never a
//     preselected first dose and never a vial the user did not touch;
//  3. the compound name is required to leave step 1 (prototype wnext: the typed text is
//     taken, an empty field shows "Missing name");
//  5. (part 20, approved P6) Cancel on a new protocol with something typed asks first.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  newProtocolForm, formFromProtocol, protocolPayload, editPatch, rtuVialFields, rtuVialPatch,
  firstDoseChoice, isoDay, hasNewProtocolInput, nameOnNext,
} = require('../lib/protocolForm');

const SCREEN = fs.readFileSync(path.join(__dirname, '..', 'screens', 'ProtocolsScreen.js'), 'utf8');
const fnBody = (src, name) => {
  const a = src.indexOf(`function ${name}(`);
  assert.ok(a >= 0, `function ${name}`);
  let depth = 0, i = src.indexOf('{', a);
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(a, i + 1);
};

const NOW = new Date(2026, 9, 2, 15, 7); // Fri Oct 2 2026, 3:07 PM local
const freq = (n) => (n === 1 ? 'Daily' : `Every ${n} days`);

// Rows as SQLite holds them, including the awkward ones: nulls the form fills with
// defaults, a legacy colour, a full timestamp start date, a schedule total, a vial whose
// box date is not a month end, numbers stored as numbers.
const RECON = {
  id: 1, name: 'BPC-157', compound_id: 'lyo_bpc_157', type: 'recon', color: '#185FA5',
  amount: 5, unit: 'mg', water: 2, diluent: 'bacteriostatic_water', dose: 250, dose_unit: 'mcg',
  syringe_size: 100, concentration: null, concentration_unit: null, frequency: 'Daily',
  reminder_time: '07:40', interval_days: 1, doses_per_day: 1, start_date: '2026-06-01T00:00:00.000Z',
  schedule_total: 40, vial_valid_days: null, goal: 'wt_recovery_support', notes: null, note: null,
  composition: null, serving_strength: null, serving_strength_unit: null, serving_units: null,
  container_units: null, divisible: null,
};
const RTU = {
  id: 2, name: 'Testosterone Cypionate', compound_id: 'rtu_testosterone_cypionate', type: 'rtu',
  color: '#387BC4', amount: 2000, unit: 'mg', water: null, diluent: null, dose: 100, dose_unit: 'mg',
  syringe_size: null, concentration: 200, concentration_unit: 'mg', frequency: 'Every 7 days',
  reminder_time: null, interval_days: 7, doses_per_day: 1, start_date: null, schedule_total: null,
  vial_valid_days: null, goal: '', notes: '', note: 'left glute', composition: null,
};
const RTU_VIAL = { id: 9, protocol_id: 2, water_ml: 10, total_doses: 20, doses_taken: 3, expires_on: '2027-03-15', active: 1 };
const ORAL = {
  id: 3, name: 'Zinc', compound_id: 'oral_zinc', type: 'oral', color: '#9B7204', amount: null, unit: 'mg',
  water: null, dose: 25, dose_unit: 'mg', frequency: 'Daily', reminder_time: '08:00,21:00',
  interval_days: 1, doses_per_day: 2, start_date: '2026-09-01', serving_strength: 25,
  serving_strength_unit: 'mg', serving_units: null, container_units: 60, divisible: 0, notes: 'Capsule',
};

for (const [label, p, vial] of [['recon', RECON, null], ['rtu with a vial', RTU, RTU_VIAL], ['rtu without a vial', RTU, null], ['oral', ORAL, null]]) {
  test(`decision 2: opening Edit and saving with no change writes nothing (${label})`, () => {
    const before = formFromProtocol(p, vial, NOW);
    const after = formFromProtocol(p, vial, NOW); // the user touched nothing
    assert.deepEqual(editPatch(before, after, freq), {}, 'no protocol field is written');
    assert.equal(rtuVialPatch(before, after), null, 'no vial is written or created');
  });
}

test('decision 2: the edit form never preselects a first dose — the saved start date is kept as is', () => {
  const f = formFromProtocol(RECON, null, NOW);
  assert.equal(f.startDate, '2026-06-01');
  assert.equal(firstDoseChoice(f.startDate, NOW), null, 'neither Today nor Tomorrow is shown chosen');
  const noDate = formFromProtocol(RTU, null, NOW);
  assert.equal(firstDoseChoice(noDate.startDate, NOW), null, 'a protocol with no start date is not shown as starting Today');
  assert.deepEqual(editPatch(noDate, { ...noDate }, freq), {}, 'and saving does not write today into start_date');
});

test('decision 2: an edit writes only the fields the user changed', () => {
  const before = formFromProtocol(RECON, null, NOW);
  assert.deepEqual(editPatch(before, { ...before, dose: '300' }, freq), { dose: 300 });
  const p2 = editPatch(before, { ...before, intervalDays: 3 }, freq);
  assert.deepEqual(p2, { interval_days: 3, frequency: 'Every 3 days' });
  assert.deepEqual(editPatch(before, { ...before, color: '#098964' }, freq), { color: '#098964' });
  const rb = formFromProtocol(RTU, RTU_VIAL, NOW);
  const ra = { ...rb, vialExpMonth: 5, vialExpYear: 2027 };
  assert.deepEqual(editPatch(rb, ra, freq), {});
  assert.deepEqual(rtuVialPatch(rb, ra), { expires_on: '2027-06-30' }, 'only the box date moves; the count stays');
});

test('decision 2: the legacy colour and the schedule total survive an edit of something else', () => {
  const before = formFromProtocol(RECON, null, NOW);
  const patch = editPatch(before, { ...before, note: 'rotate sites' }, freq);
  assert.deepEqual(patch, { note: 'rotate sites' });
  assert.ok(!('color' in patch) && !('schedule_total' in patch) && !('start_date' in patch));
});

test('decision 2: a NEW protocol starts with Today chosen in the first-dose bar', () => {
  const f = newProtocolForm(NOW);
  assert.equal(f.startDate, '2026-10-02');
  assert.equal(firstDoseChoice(f.startDate, NOW), 0, 'Today');
  assert.equal(firstDoseChoice(isoDay(NOW, 1), NOW), 1, 'Tomorrow');
  // the dates are the user's local calendar days, never a UTC date
  const late = new Date(2026, 9, 2, 23, 50);
  assert.equal(isoDay(late, 0), '2026-10-02');
  assert.equal(isoDay(late, 1), '2026-10-03');
  const pay = protocolPayload(f, freq);
  assert.equal(pay.start_date, '2026-10-02');
});

test('decision 2: the screen builds the edit save from the patch, never the whole form', () => {
  const save = fnBody(SCREEN, 'saveProtocol');
  assert.match(save, /editPatch\(editStartRef\.current, currentForm\(\), frequencyLabel\)/);
  assert.match(save, /rtuVialPatch\(editStartRef\.current, currentForm\(\)\)/);
  assert.doesNotMatch(save, /updateProtocol\(editingId, \{\s*name, compound_id/, 'the old whole-row write is gone');
  assert.match(fnBody(SCREEN, 'openEdit'), /editStartRef\.current = f;/);
  assert.match(fnBody(SCREEN, 'resetForm'), /newProtocolForm\(new Date\(\)\)/);
});

test('decision 3: Next on step 1 needs a name (prototype wnext)', () => {
  const keys = [{ key: 'lyo_bpc_157', label: 'BPC-157' }, { key: 'lyo_tb_500', label: 'TB-500' }];
  assert.deepEqual(nameOnNext('BPC-157', 'lyo_bpc_157', 'BPC-157', keys), { action: 'advance' });
  assert.deepEqual(nameOnNext('', null, '', keys), { action: 'missing' });
  assert.deepEqual(nameOnNext('   ', null, '', keys), { action: 'missing' });
  assert.deepEqual(nameOnNext('bpc-157', null, '', keys), { action: 'select', key: 'lyo_bpc_157', label: 'BPC-157' });
  assert.deepEqual(nameOnNext(' My blend ', null, '', keys), { action: 'custom', name: 'My blend' });
  const next = fnBody(SCREEN, 'goNext');
  assert.match(next, /nameOnNext\(/);
  assert.match(next, /if \(r\.action === 'missing'\) \{ showMissingName\(\); return; \}/);
  assert.match(fnBody(SCREEN, 'showMissingName'), /title: t\('protocols_missing_name'\), body: t\('protocols_missing_name_msg'\)/);
});

test('part 20: Cancel on a new protocol asks only when something was typed', () => {
  const empty = newProtocolForm(NOW);
  assert.equal(hasNewProtocolInput(empty, ''), false);
  assert.equal(hasNewProtocolInput(empty, 'BP'), true);
  assert.equal(hasNewProtocolInput({ ...empty, dose: '0.5' }, ''), true);
  assert.equal(hasNewProtocolInput({ ...empty, amount: '5' }, ''), true);
  assert.equal(hasNewProtocolInput({ ...empty, note: 'x' }, ''), true);
  const cancel = fnBody(SCREEN, 'cancelWizard');
  assert.match(cancel, /!editingId && hasNewProtocolInput\(currentForm\(\), searchQuery\)/);
  assert.match(cancel, /title: t\('protocols_discard_title'\)/);
  assert.match(cancel, /body: t\('protocols_discard_body'\)/);
  assert.match(cancel, /\{ label: t\('cancel'\), kind: 'secondary' \}/);
  assert.match(cancel, /\{ label: t\('protocols_discard'\), kind: 'danger', onPress: closeWizard \}/);
  assert.match(SCREEN, /style=\{s\.wnavSide\} onPress=\{cancelWizard\}/, 'the Cancel in the nav asks');
});

test('rtuVialFields: the RTU vial from the size and the box month (last day of that month)', () => {
  const f = formFromProtocol(RTU, RTU_VIAL, NOW);
  assert.equal(f.vialMl, '10');
  assert.equal(f.vialExpMonth, 2);
  assert.equal(f.vialExpYear, 2027);
  const v = rtuVialFields(f);
  assert.equal(v.water_ml, 10);
  assert.equal(v.total_doses, 20);
});
