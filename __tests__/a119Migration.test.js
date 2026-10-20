'use strict';
// A-119 server side (NOT applied: the founder's "pode aplicar"; delete-user NOT deployed: "pode
// publicar"). The migration text and the edge function as written. No Postgres runs in this test
// suite: the rules themselves are exercised by the in-memory model in helpers/syncHarness.js
// (makeDeviceCloud) through the two-device tests; this file pins that the SQL says the same thing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TABLES } = require('../lib/syncCore');

const dir = path.join(__dirname, '../supabase/migrations');
const file = fs.readdirSync(dir).find((n) => /_one_active_device\.sql$/.test(n));
const raw = file ? fs.readFileSync(path.join(dir, file), 'utf8') : '';
const sql = raw.replace(/--[^\n]*/g, '');
const fn = (name) => {
  const i = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(i >= 0, `function ${name}`);
  return sql.slice(i, sql.indexOf('$$;', i) + 3);
};

test('the file exists, says it is not applied, and carries its rollback', () => {
  assert.ok(file, 'supabase/migrations/*_one_active_device.sql');
  assert.match(raw, /NOT APPLIED/);
  assert.match(raw, /pode aplicar/);
  assert.match(raw, /-- ROLLBACK/);
  assert.match(raw, /select rolconfig from pg_roles where rolname = 'authenticator'/, 'check the existing pre-request setting first');
});

test('additive: three new tables (RPC only: RLS on, no policies, no grants), push_tokens.device_id; nothing dropped or rewritten', () => {
  for (const t of ['account_devices', 'user_devices', 'device_policy']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${t} \\(`), t);
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
  }
  assert.doesNotMatch(sql, /create policy/i);
  assert.match(sql, /revoke all on table public\.account_devices, public\.user_devices, public\.device_policy from public, anon, authenticated;/);
  assert.match(sql, /user_id uuid primary key references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /user_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /alter table public\.push_tokens add column if not exists device_id text;/);
  assert.doesNotMatch(sql, /drop table|drop column|alter column|truncate/i);
  assert.doesNotMatch(sql.replace(/\$\$[\s\S]*?\$\$/g, ''), /^\s*(update|delete)\b/im, 'no top-level update/delete');
});

test('OD-7 / DL-105 / OD-17: the guard refuses with distinct codes, never an empty result; the service role and no-user requests pass', () => {
  const g = fn('dt_require_active_device');
  assert.match(g, /security definer/);
  assert.match(g, /errcode = 'DT001'/);
  assert.match(g, /errcode = 'DT002'/);
  assert.match(g, /errcode = 'DT003'/);
  assert.match(g, /if v_uid is null or coalesce\(auth\.role\(\), ''\) = 'service_role' then return; end if;/);
  assert.match(g, /if p_lock then\s+select active_device into v_active from public\.account_devices where user_id = v_uid for share;/, 'OD-3: writes wait for a takeover in progress');
  assert.match(g, /if v_dev is null then\s+if v_found and v_legacy is not null and now\(\) >= v_legacy then raise exception using errcode = 'DT002'/, 'DL-105 amended: no device id → refused only after the founder\'s cutoff');
  assert.match(sql, /legacy_until timestamptz/);
});

test('OD-7: reads AND writes of every synced table are checked before the query (PostgREST pre-request), writes again in statement triggers', () => {
  const p = fn('dt_pre_request');
  for (const t of TABLES) assert.match(p, new RegExp(`'${t}'`), t);
  assert.match(p, /perform public\.dt_require_active_device\(v_method not in \('GET', 'HEAD'\)\)/);
  assert.match(sql, /alter role authenticator set pgrst\.db_pre_request to 'public\.dt_pre_request';/);
  assert.match(sql, /notify pgrst, 'reload config';/);
  assert.match(sql, /grant execute on function public\.dt_pre_request\(\) to anon, authenticated, service_role;/, 'Gate B M3');
  assert.match(raw, /NEVER drop or rename public\.dt_pre_request while pgrst\.db_pre_request names it/);
  const arr = /foreach t in array array\[([^\]]+)\]/.exec(sql);
  assert.ok(arr, 'the trigger loop');
  for (const t of [...TABLES, 'push_tokens']) assert.match(arr[1], new RegExp(`'${t}'`), t);
  assert.match(sql, /before insert or update or delete on public\.%I for each statement execute function public\.dt_device_guard\(\)/);
});

test('OD-3 / OD-14 / DL-102 / DL-103 / DL-104 / OD-16: claim_device', () => {
  const c = fn('claim_device');
  assert.match(c, /security definer/);
  assert.match(c, /select \* into v_acc from public\.account_devices where user_id = v_uid for update;/, 'one takeover at a time; guarded writes wait');
  assert.match(c, /p_mode not in \('signin', 'use_here', 'silent'\)/);
  assert.match(c, /from auth\.sessions s where s\.id = nullif\(auth\.jwt\(\) ->> 'session_id', ''\)::uuid/, 'last sign-in wins');
  assert.match(c, /'superseded'/);
  assert.match(c, /'in_use'/, 'a silent claim never takes over another device (DL-103)');
  assert.match(c, /delete from public\.push_tokens where user_id = v_uid and device_id is distinct from p_device;/, 'OD-16');
  assert.match(c, /rebuild_owed = true, rebuild_mode = 'takeover'/);
  assert.match(c, /v_stale := v_acc\.last_device is not null and v_acc\.last_device <> p_device;/, 'Gate B M2: a stale copy owes a rebuild');
  assert.match(c, /perform set_config\('dt\.in_claim', '1', true\);/);
  assert.match(c, /extensions\.digest\(v_secret, 'sha256'\)/);
});

test('device_status (account gone, replaced, in use, none), release, mark sent, ack, the anonymous checks; grants', () => {
  const s = fn('device_status');
  assert.match(s, /if not exists \(select 1 from auth\.users where id = v_uid\) then\s+return jsonb_build_object\('status', 'account_gone'/);
  assert.match(fn('release_device'), /set active_device = null/);
  assert.match(fn('device_mark_sent'), /last_full_send_at = v_now/);
  assert.match(fn('device_ack'), /p_what = 'rebuild'/);
  assert.match(fn('device_status_by_secret'), /secret_hash = encode\(extensions\.digest\(p_secret, 'sha256'\), 'hex'\)/);
  assert.match(fn('account_exists'), /select exists \(select 1 from auth\.users where id = p_user\)/);
  assert.match(sql, /grant execute on function public\.claim_device\(text, text, text, text, text, text\), public\.device_status\(text\), public\.release_device\(text\), public\.device_mark_sent\(text\), public\.device_ack\(text, text\) to authenticated;/);
  assert.match(sql, /grant execute on function public\.device_status_by_secret\(text\), public\.account_exists\(uuid\) to anon, authenticated;/);
  assert.match(sql, /public\.device_ack\(text, text\) from anon;/, 'Gate B M3: anon revoked explicitly');
  assert.match(fn('device_status_by_secret'), /'user_id', v_me\.user_id/, 'Gate B LOW');
});

test('delete-user (not deployed): removes the device rows (DL-93 list) and refuses a phone that is no longer the account\'s (409)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../supabase/functions/delete-user/index.ts'), 'utf8');
  assert.match(src, /const deviceTables = \['user_devices', 'account_devices'\];/);
  assert.ok(src.indexOf('for (const table of deviceTables)') > src.indexOf('adminClient.auth.admin.deleteUser(user.id)'), 'Gate B LOW: the device rows go after the auth user (the guard holds until then)');
  assert.match(src, /'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dt-device, x-dt-app-version'/);
  assert.match(src, /const device = req\.headers\.get\('x-dt-device'\);/);
  assert.match(src, /JSON\.stringify\(\{ error: 'device_not_active' \}\), \{\s*status: 409/);
  assert.ok(src.indexOf("error: 'device_not_active'") < src.indexOf('for (const table of userDataTables)'), 'refused before anything is deleted');
});
