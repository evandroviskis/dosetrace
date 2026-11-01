'use strict';
// Founder 2026-11-01 ("6- ok"): a dose marked "Não houve dose" (dose_logs.outcome 'NoDose', app 1.3.1) is not
// a missed dose and must not lower the panel's adherence: admin_metrics' adherence total leaves it out and
// reports it on its own (no_dose). The newest migration and supabase_admin_rpcs.sql carry the same body.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sqlFnIn, latestFn } = require('./helpers/sqlLatest.js');

test('admin_metrics: adherence total leaves out NoDose and counts it apart; migration = versioned SQL', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase_admin_rpcs.sql'), 'utf8');
  const fn = sqlFnIn(sql, 'admin_metrics');
  assert.match(fn, /count\(\*\) filter \(where l\.outcome = 'NoDose'\) no_dose/);
  assert.match(fn, /count\(\*\) filter \(where l\.outcome is distinct from 'NoDose'\) total/);
  assert.equal(latestFn('admin_metrics'), fn, 'the newest migration carries the same body');
});
