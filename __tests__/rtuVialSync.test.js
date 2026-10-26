'use strict';
// Found on the Fold development client 2026-10-26 (test account): a ready-to-use vial never reaches
// the cloud. Every push is refused — POST /rest/v1/vials 400, Postgres: null value in column
// "mixed_on" of relation "vials" violates not-null constraint. A ready-to-use vial has no mix date
// by design (rtuVialFields, newVialRecords rtu, the Restart copy), so the cloud column must accept
// null. Production 2026-10-26 (read-only): 5 ready-to-use protocols with a vial size, 5 accounts,
// 0 ready-to-use vials in the cloud — since 1.3.0. The fix is server side (a nullable column), so the
// apps already installed send their pending vials at their next sync with no new build.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { rtuVialFields } = require('../lib/protocolForm');
const { newVialRecords } = require('../lib/newVial');
const { toCloudPayload } = require('../lib/syncMappers');

const dir = path.join(__dirname, '../supabase/migrations');

test('a ready-to-use vial has no mix date and sends mixed_on null', () => {
  const f = { type: 'rtu', vialMl: '10', concentration: '200', concentrationUnit: 'mg', dose: '100', doseUnit: 'mg', vialExpMonth: null, vialExpYear: null };
  const fields = rtuVialFields(f, 'en');
  assert.equal(fields.total_doses, 20);
  assert.equal('mixed_on' in fields, false);
  const { vial } = newVialRecords({ id: 5, type: 'rtu', remote_id: 'p' }, null, 'u', { oldVial: { water_ml: 10, total_doses: 20, doses_taken: 1 } });
  assert.equal(vial.mixed_on, null);
  const payload = toCloudPayload('vials', { ...vial, id: 3, active: 1, created_at: '2026-10-26T23:46:54Z', updated_at: '2026-10-26T23:46:54Z' });
  assert.equal(payload.mixed_on, null, 'the cloud must accept this');
});

test('the migration makes vials.mixed_on nullable — and changes nothing else', () => {
  const file = fs.readdirSync(dir).find((n) => /vials_mixed_on_nullable/.test(n));
  assert.ok(file, 'migration file');
  const sql = fs.readFileSync(path.join(dir, file), 'utf8').replace(/--[^\n]*/g, '').trim();
  assert.match(sql, /alter table public\.vials alter column mixed_on drop not null;/i);
  const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
  assert.equal(statements.length, 1, 'one statement');
  assert.doesNotMatch(sql, /update|delete|drop table|drop column|truncate|set not null/i);
});
