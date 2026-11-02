'use strict';
// Founder 2026-10-26 ("não permitir mais acesso à versão antiga"): once device_policy.legacy_until has
// passed, every request without a device id (1.3.0) is refused with DT002 — also for an account that
// never opened 1.3.1 and so has no account_devices row. The first version refused only accounts with a
// row: 12 of 166 accounts on 2026-11-02, so the cutoff would have left almost every 1.3.0 install on.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../supabase/migrations');
const latest = fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()
  .filter((n) => fs.readFileSync(path.join(dir, n), 'utf8').includes('create or replace function public.dt_require_active_device('))
  .pop();

test('the newest dt_require_active_device refuses a request without a device id after the cutoff, account row or not', () => {
  const sql = fs.readFileSync(path.join(dir, latest), 'utf8').replace(/--[^\n]*/g, '');
  const i = sql.indexOf('create or replace function public.dt_require_active_device(');
  const fn = sql.slice(i, sql.indexOf('$$;', i) + 3);
  assert.match(fn, /if v_dev is null then\s+if v_legacy is not null and now\(\) >= v_legacy then raise exception using errcode = 'DT002'/);
  assert.doesNotMatch(fn, /v_found and v_legacy/);
  assert.match(fn, /errcode = 'DT001'/, 'the one-active-device rule for 1.3.1+ is unchanged');
  assert.match(fn, /errcode = 'DT003'/, 'the minimum version rule is unchanged');
});
