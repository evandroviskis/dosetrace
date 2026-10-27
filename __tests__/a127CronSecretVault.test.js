'use strict';
// A-127 UN-6 server setup (founder 2026-10-26 "Sim, pode publicar a version-notice e criar o
// segredo"). The hourly call needs a shared secret. The reviewed plan pasted the same value into the
// Vault and into the function's CRON_SECRET by hand — a person (or Claude) handling the secret. Here
// the secret is generated INSIDE the database (Vault, random bytes, never a literal) and the function
// checks it through a service-role-only RPC: nobody ever sees or types it. CRON_SECRET and the
// service-role key keep working.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../supabase/migrations');
const file = fs.readdirSync(dir).find((n) => /version_notice_cron/.test(n));
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the migration creates the Vault secret from random bytes, only when missing, never a literal', () => {
  assert.ok(file, 'migration file');
  const sql = fs.readFileSync(path.join(dir, file), 'utf8').replace(/--[^\n]*/g, '');
  assert.match(sql, /vault\.create_secret\(\s*encode\(\s*extensions\.gen_random_bytes\(32\)\s*,\s*'hex'\s*\)\s*,\s*'dosetrace_cron_secret'/);
  assert.match(sql, /if not exists \(select 1 from vault\.secrets where name = 'dosetrace_cron_secret'\)/i);
  assert.doesNotMatch(sql, /create_secret\(\s*'/, 'no literal secret value');
});

test('the check is a service-role-only RPC that compares with the Vault secret', () => {
  const sql = fs.readFileSync(path.join(dir, file), 'utf8').replace(/--[^\n]*/g, '');
  const fn = sql.slice(sql.indexOf('create or replace function public.version_notice_secret_ok'), sql.indexOf('$$;', sql.indexOf('create or replace function public.version_notice_secret_ok')) + 3);
  assert.match(fn, /security definer/i);
  assert.match(fn, /vault\.decrypted_secrets where name = 'dosetrace_cron_secret'/);
  assert.match(fn, /char_length\(p_secret\) >= 32/);
  assert.match(sql, /revoke all on function public\.version_notice_secret_ok\(text\) from public, anon, authenticated;/i);
  assert.match(sql, /grant execute on function public\.version_notice_secret_ok\(text\) to service_role;/i);
});

test('the hourly job is (re)scheduled once, with the header built from the Vault secret', () => {
  const sql = fs.readFileSync(path.join(dir, file), 'utf8').replace(/--[^\n]*/g, '');
  assert.match(sql, /cron\.unschedule\('dosetrace-version-notice'\)/);
  assert.match(sql, /cron\.schedule\(\s*'dosetrace-version-notice',\s*'5 \* \* \* \*'/);
  assert.match(sql, /select decrypted_secret from vault\.decrypted_secrets where name = 'dosetrace_cron_secret'/);
});

test('version-notice accepts the Vault secret through the RPC, never logging it', () => {
  const ts = read('supabase/functions/version-notice/index.ts');
  assert.match(ts, /rpc\('version_notice_secret_ok', \{ p_secret: /);
  assert.match(ts, /CRON_SECRET/, 'the env secret still works');
  assert.doesNotMatch(ts, /console\.[a-z]+\([^)]*(cronSecret|serviceKey|bearer|auth\b)/, 'never the secret or the header in a log');
});
