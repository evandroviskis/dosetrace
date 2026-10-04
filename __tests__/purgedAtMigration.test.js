'use strict';
// The purged_at tombstone column (2026-10-04): additive, nullable, no data rewritten.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the purged_at migration is additive and nullable', () => {
  const dir = path.join(__dirname, '../supabase/migrations');
  const f = fs.readdirSync(dir).find((n) => /protocol_purged_at/.test(n));
  assert.ok(f, 'migration file');
  const sql = fs.readFileSync(path.join(dir, f), 'utf8').replace(/--[^\n]*/g, '');
  assert.match(sql, /alter table public\.protocols add column if not exists purged_at timestamptz;/i);
  assert.doesNotMatch(sql, /update |delete |drop |not null/i);
});
