'use strict';
// AD-95 B migration: additive only (nullable columns, a stamp of today's Taken rows, a trigger for the
// apps that send no dose). Never drops, deletes or truncates; leaves updated_at as it is during the stamp.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261027020000_dose_amount_per_dose.sql'), 'utf8').replace(/--[^\n]*/g, '');

test('the AD-95 migration only adds, stamps Taken rows without a dose, and re-enables updated_at', () => {
  assert.match(sql, /add column if not exists dose_amount numeric/);
  assert.match(sql, /add column if not exists dose_unit text/);
  assert.match(sql, /alter table public\.protocols add column if not exists dose_history text/);
  assert.doesNotMatch(sql, /\bdelete\b|drop table|drop column|truncate|set not null/i);
  assert.match(sql, /outcome = 'Taken' and d\.dose_amount is null/);
  const off = sql.indexOf('disable trigger set_updated_at'), on = sql.indexOf('enable trigger set_updated_at');
  assert.ok(off > 0 && on > off, 'updated_at trigger disabled only around the stamp');
  assert.match(sql, /new\.outcome = 'Taken' and new\.dose_amount is null/, 'the trigger never overwrites a dose');
  assert.match(sql, /p\.user_id = new\.user_id/, 'only the row owner\'s protocol');
});
