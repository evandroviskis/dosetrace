'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCloudPayload, CLOUD_FIELDS } = require('../lib/syncMappers');

// A fully-populated local protocol row, including the fields most likely to be
// dropped when the payload and schema drift apart.
const protocolRow = {
  id: 1, remote_id: 'uuid-1', user_id: 'u1',
  name: 'BPC-157', compound_id: 'lyo_bpc_157', type: 'recon', color: '#1D9E75',
  amount: '10', unit: 'mg', water: '2', diluent: 'bacteriostatic_water',
  dose: '250', dose_unit: 'mcg', syringe_size: 100,
  concentration: null, concentration_unit: 'mg',
  frequency: 'Daily', reminder_time: '08:00',
  interval_days: 1, doses_per_day: 1,
  start_date: '2024-06-01', schedule_total: 30,
  goal: 'wt_recovery_support', notes: 'x',
  active: 1, deleted_at: null,
  sync_status: 'pending',
};

test('protocols payload includes every expected cloud field', () => {
  const payload = toCloudPayload('protocols', protocolRow);
  for (const field of CLOUD_FIELDS.protocols) {
    assert.ok(field in payload, `protocols payload is missing "${field}"`);
  }
});

test('protocols payload carries the drift-prone fields verbatim', () => {
  const payload = toCloudPayload('protocols', protocolRow);
  assert.equal(payload.compound_id, 'lyo_bpc_157');
  assert.equal(payload.diluent, 'bacteriostatic_water');
  assert.equal(payload.concentration_unit, 'mg');
  assert.equal(payload.schedule_total, 30);
  assert.equal(payload.interval_days, 1);
  assert.equal(payload.start_date, '2024-06-01');
});

test('protocols payload converts active 1/0 to a boolean and never leaks local-only columns', () => {
  const payload = toCloudPayload('protocols', protocolRow);
  assert.equal(payload.active, true);
  assert.equal(toCloudPayload('protocols', { ...protocolRow, active: 0 }).active, false);
  // Local bookkeeping must not be sent to the cloud row shape.
  for (const local of ['id', 'remote_id', 'sync_status', 'protocol_remote_id']) {
    assert.ok(!(local in payload), `payload should not contain local column "${local}"`);
  }
});

test('child tables remap the local FK to the protocol remote id', () => {
  const vial = toCloudPayload('vials', { protocol_remote_id: 'uuid-1', mixed_on: '2024-06-01', water_ml: 2, total_doses: 10, doses_taken: 3, active: 1 });
  assert.equal(vial.protocol_id, 'uuid-1');
  assert.equal(vial.active, true);
  for (const field of CLOUD_FIELDS.vials) assert.ok(field in vial, `vials payload missing "${field}"`);

  const log = toCloudPayload('dose_logs', { protocol_remote_id: 'uuid-1', outcome: 'Taken', injection_site: 'left_delt', logged_at: '2024-06-01T08:00:00' });
  assert.equal(log.protocol_id, 'uuid-1');
  assert.equal(log.injection_site, 'left_delt');
  for (const field of CLOUD_FIELDS.dose_logs) assert.ok(field in log, `dose_logs payload missing "${field}"`);
});

test('biomarkers payload includes every expected field', () => {
  const bm = toCloudPayload('biomarkers', { report_date: '2024-06-01', marker: 'TT', value: 800, unit: 'ng/dL' });
  for (const field of CLOUD_FIELDS.biomarkers) assert.ok(field in bm, `biomarkers payload missing "${field}"`);
});

test('vaccines payload includes every expected field', () => {
  const vx = toCloudPayload('vaccines', { name: 'Tetanus', date_given: '2024-06-01', next_due: '2034-06-01', notes: 'left arm' });
  for (const field of CLOUD_FIELDS.vaccines) assert.ok(field in vx, `vaccines payload missing "${field}"`);
});

test('reality_checks payload includes every expected field', () => {
  const rc = toCloudPayload('reality_checks', { entry_date: '2026-09-01', tdee: 2450, rate_per_week_kg: 0.5 });
  assert.equal(rc.entry_date, '2026-09-01');
  assert.equal(rc.tdee, 2450);
  assert.equal(rc.rate_per_week_kg, 0.5);
  for (const field of CLOUD_FIELDS.reality_checks) assert.ok(field in rc, `reality_checks payload missing "${field}"`);
});

test('calc_snapshots payload includes every expected field (incl. waist_cm)', () => {
  const cs = toCloudPayload('calc_snapshots', { entry_date: '2026-09-01', weight_kg: 82, waist_cm: 88, body_fat_pct: 18, lbm: 67, bmr: 1750, tdee: 2600 });
  assert.equal(cs.waist_cm, 88);
  assert.equal(cs.weight_kg, 82);
  for (const field of CLOUD_FIELDS.calc_snapshots) assert.ok(field in cs, `calc_snapshots payload missing "${field}"`);
});

test('calc_targets payload includes every expected field', () => {
  const ct = toCloudPayload('calc_targets', {
    entry_date: '2026-09-13', target_weight_kg: 82, target_body_fat_pct: 18, target_date: '2026-11-01',
    start_date: '2026-07-14', start_weight_kg: 95, start_body_fat_pct: 28,
  });
  assert.equal(ct.target_weight_kg, 82);
  assert.equal(ct.start_weight_kg, 95);
  assert.equal(ct.target_date, '2026-11-01');
  for (const field of CLOUD_FIELDS.calc_targets) assert.ok(field in ct, `calc_targets payload missing "${field}"`);
});
