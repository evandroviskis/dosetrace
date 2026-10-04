'use strict';
// The purged_at tombstone migration (2026-10-04): additive, nullable, no data rewritten — plus the
// server triggers the final Gate B asked for (PASS-WITH-FIXES, part 1):
//   (a) a protocol that gets purged_at loses its dose logs and vials server side (same user only);
//   (b) a dose log or vial can never be inserted or updated onto a purged protocol (the client
//       keeps such a row pending: R-A).
// Both functions run SECURITY INVOKER (RLS still applies) with a fixed search_path.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../supabase/migrations');
const file = fs.readdirSync(dir).find((n) => /protocol_purged_at/.test(n));
const sql = fs.readFileSync(path.join(dir, file), 'utf8').replace(/--[^\n]*/g, '');
const fn = (name) => {
  const i = sql.indexOf(`create or replace function public.${name}()`);
  assert.ok(i >= 0, name);
  return sql.slice(i, sql.indexOf('$$;', i) + 3);
};

test('the purged_at column is additive and nullable; no data is rewritten', () => {
  assert.match(sql, /alter table public\.protocols add column if not exists purged_at timestamptz;/i);
  assert.doesNotMatch(sql, /not null default|drop table|drop column|alter column|truncate/i);
  assert.doesNotMatch(sql.replace(/\$\$[\s\S]*?\$\$/g, ''), /^\s*(update|delete)\b/im, 'no top-level update/delete');
});

test('(a) purged_at set → its dose logs and vials are deleted, same user only', () => {
  const f = fn('protocols_purge_children');
  assert.match(f, /security invoker/i);
  assert.match(f, /set search_path = public, pg_temp/i);
  assert.match(f, /delete from public\.dose_logs where protocol_id = new\.id and user_id = new\.user_id;/i);
  assert.match(f, /delete from public\.vials where protocol_id = new\.id and user_id = new\.user_id;/i);
  assert.match(sql, /create trigger protocols_purge_children\s+after update of purged_at on public\.protocols\s+for each row\s+when \(new\.purged_at is not null\)\s+execute function public\.protocols_purge_children\(\);/i);
  assert.match(sql, /drop trigger if exists protocols_purge_children on public\.protocols;/i);
});

test('(b) a dose log or vial onto a purged protocol is refused, insert and update', () => {
  const f = fn('refuse_child_of_purged_protocol');
  assert.match(f, /security invoker/i);
  assert.match(f, /set search_path = public, pg_temp/i);
  assert.match(f, /p\.id = new\.protocol_id and p\.user_id = new\.user_id and p\.purged_at is not null/i);
  assert.match(f, /raise exception 'protocol % was deleted forever'/i);
  for (const t of ['dose_logs', 'vials']) {
    assert.match(sql, new RegExp(`drop trigger if exists ${t}_refuse_purged_parent on public\\.${t};`, 'i'));
    assert.match(sql, new RegExp(`create trigger ${t}_refuse_purged_parent\\s+before insert or update on public\\.${t}\\s+for each row\\s+execute function public\\.refuse_child_of_purged_protocol\\(\\);`, 'i'));
  }
  assert.doesNotMatch(sql, /security definer/i);
});
