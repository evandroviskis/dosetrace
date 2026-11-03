'use strict';
// Admin panel Phase 5 — system slowness alert (founder 2026-11-03: "coloca um alerta de lentidão lá no
// ADM … notificação no aplicativo do ADM"; limit 1 s). Rows SA1–SA6: the probe's alert rules (the REAL
// pure module the edge function imports, supabase/functions/health-probe/alerts.ts), the edge function's
// shape (static: Deno is not installed here) and the migration (tables, RLS, grants, 5-minute cron,
// 14-day retention). Dummy data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const A = require('../supabase/functions/health-probe/alerts.ts');
const FN = fs.readFileSync(path.join(ROOT, 'supabase/functions/health-probe/index.ts'), 'utf8');
const MIG = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261103010000_system_health.sql'), 'utf8');

const healthy = (ms) => ({ ok: true, ms: ms == null ? 120 : ms });
const slow = (ms) => ({ ok: true, ms: ms == null ? 2400 : ms });
const down = (ms) => ({ ok: false, ms: ms == null ? 10000 : ms });
// 2026-11-03 19:05 UTC = 14:05 in New York (EST).
const AT = new Date('2026-11-03T19:05:00Z');

// ------------------------------------------------------------------ SA1: the alert rules
test('SA1: the limit is 1 s — 1000 ms is healthy, 1001 ms is slow, any failure is down', () => {
  assert.equal(A.SLOW_MS, 1000);
  assert.equal(A.statusOf(healthy(1000)), 'healthy');
  assert.equal(A.statusOf(slow(1001)), 'slow');
  assert.equal(A.statusOf(down(5)), 'down');
  assert.equal(A.statusOf(null), 'down');
});

test('SA1: slow on 2 consecutive runs → one "slow" alert; a single slow run or slow-then-healthy → nothing', () => {
  assert.equal(A.decide([slow(), slow()], null), 'slow');
  assert.equal(A.decide([slow(), slow()], 'recovered'), 'slow');
  assert.equal(A.decide([slow()], null), null, 'one run is not enough');
  assert.equal(A.decide([slow(), healthy()], null), null);
  assert.equal(A.decide([healthy(), slow()], null), null);
  assert.equal(A.decide([], null), null);
});

test('SA1: 2 consecutive failures → "down"; a failure next to a slow run → "slow" (both over the limit)', () => {
  assert.equal(A.decide([down(), down()], null), 'down');
  assert.equal(A.decide([down(), slow()], null), 'slow');
  assert.equal(A.decide([slow(), down()], null), 'slow');
  assert.equal(A.decide([down(), healthy()], null), null);
});

test('SA1: no spam — while an episode is open nothing more is raised until 2 healthy runs, then "recovered"', () => {
  for (let i = 0; i < 10; i++) assert.equal(A.decide([slow(), slow()], 'slow'), null);
  assert.equal(A.decide([down(), down()], 'down'), null);
  assert.equal(A.decide([slow(), slow()], 'down'), null, 'no step down from down to slow');
  assert.equal(A.decide([healthy(), slow()], 'slow'), null, 'one healthy run is not a recovery');
  assert.equal(A.decide([healthy(), healthy()], 'slow'), 'recovered');
  assert.equal(A.decide([healthy(), healthy()], 'down'), 'recovered');
  assert.equal(A.decide([healthy(), healthy()], 'recovered'), null, 'healthy and already recovered → quiet');
  assert.equal(A.decide([healthy(), healthy()], null), null);
});

test('SA1: a slow episode that turns into 2 failures escalates once to "down" (then quiet)', () => {
  assert.equal(A.decide([down(), down()], 'slow'), 'down');
  assert.equal(A.decide([down(), down()], 'down'), null);
});

test('SA1: a day of runs through plan() raises exactly slow → recovered → down → recovered, per probe', () => {
  const runs = ['h', 's', 'h', 's', 's', 's', 's', 'h', 's', 'h', 'h', 'h', 'd', 'd', 'd', 'h', 'h', 'h'];
  const mk = { h: healthy, s: slow, d: down };
  const history = [];
  let last = null;
  const raised = [];
  runs.forEach((r, i) => {
    history.unshift(mk[r]());
    const out = A.plan({ rest: history.slice(0, 2) }, { rest: last }, new Date(AT.getTime() + i * 5 * 60000));
    for (const a of out) { raised.push(a.kind); last = a.kind; assert.equal(a.probe, 'rest'); }
  });
  assert.deepEqual(raised, ['slow', 'recovered', 'down', 'recovered']);
});

// ------------------------------------------------------------------ SA2: the alert text (plain formal Portuguese)
test('SA2: titles and messages — "levou 2,4 s às 14:05 (limite 1 s)", "não respondeu", "voltou ao normal"', () => {
  assert.deepEqual(A.ALERT_TITLE, { slow: 'DoseTrace: lentidão no sistema', down: 'DoseTrace: sistema fora do ar', recovered: 'DoseTrace: sistema normalizado' });
  assert.equal(A.alertMessage('slow', 'rest', slow(2400), AT), 'A leitura de dados levou 2,4 s às 14:05 (limite 1 s).');
  assert.equal(A.alertMessage('slow', 'auth', slow(1350), AT), 'O login levou 1,4 s às 14:05 (limite 1 s).');
  assert.equal(A.alertMessage('down', 'db', down(), AT), 'O banco de dados não respondeu às 14:05. Duas verificações seguidas falharam.');
  assert.equal(A.alertMessage('slow', 'rest', down(), AT), 'A leitura de dados não respondeu às 14:05.');
  assert.equal(A.alertMessage('recovered', 'rest', healthy(300), AT), 'A leitura de dados voltou ao normal às 14:05 (0,3 s).');
  const out = A.plan({ rest: [slow(2400), slow(1800)] }, { rest: null }, AT);
  assert.deepEqual(out, [{ kind: 'slow', probe: 'rest', ms: 2400, message: 'A leitura de dados levou 2,4 s às 14:05 (limite 1 s).' }]);
  for (const m of [A.alertMessage('slow', 'rest', slow(), AT), A.alertMessage('down', 'auth', down(), AT)]) {
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(m), 'no emoji');
    assert.ok(m.length <= 300);
  }
});

test('SA2: the clock is New York time (summer and winter), 24 h, never "24:05"', () => {
  assert.equal(A.clock(new Date('2026-07-01T18:05:00Z')), '14:05');
  assert.equal(A.clock(new Date('2026-11-03T05:05:00Z')), '00:05');
  assert.equal(A.seconds(12345), '12,3');
});

// ------------------------------------------------------------------ SA3: the edge function (static; Deno is not installed here)
test('SA3: health-probe measures the three probes for real and imports the rules from alerts.ts', () => {
  assert.match(FN, /from '\.\/alerts\.ts'/);
  assert.ok(!/>\s*1000\b/.test(FN), 'the threshold lives only in alerts.ts');
  // (a) PostgREST: the app's own read shape (dose_logs by user_id, through dt_pre_request), for a user that cannot exist.
  assert.match(FN, /\/rest\/v1\/dose_logs\?select=id&user_id=eq\.00000000-0000-0000-0000-000000000000&limit=1/);
  // (b) Auth health.
  assert.match(FN, /\/auth\/v1\/health/);
  // (c) one Postgres round trip on a warm connection.
  assert.match(FN, /SUPABASE_DB_URL/);
  assert.match(FN, /select 1/);
  assert.match(FN, /performance\.now\(\)/);
  assert.match(FN, /AbortSignal\.timeout\(PROBE_TIMEOUT_MS\)/);
  for (const t of ['system_health_checks', 'system_alerts']) assert.ok(FN.includes(t), t);
  assert.match(FN, /pg_advisory_xact_lock/);
});

test('SA3: health-probe refuses any call without the cron secret (Vault, checked by health_probe_secret_ok) and never logs a secret', () => {
  assert.match(FN, /health_probe_secret_ok/);
  assert.match(FN, /401/);
  for (const line of FN.split('\n').filter((l) => /console\./.test(l))) {
    assert.ok(!/\$\{(auth|bearer|serviceKey|cronSecret|dbUrl)/.test(line), 'no secret in a log: ' + line.trim());
  }
  assert.ok(!/user_id['"]?\s*:/.test(FN.replace(/user_id=eq\.0{8}-0{4}-0{4}-0{4}-0{12}/g, '')), 'reads no user data');
});

// ------------------------------------------------------------------ SA4: the migration
const norm = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').toLowerCase();
const M = norm(MIG);

test('SA4: the migration creates system_health_checks, system_alerts and admin_alert_tokens with the agreed columns', () => {
  assert.match(M, /create table if not exists public\.system_health_checks \( id bigserial primary key, checked_at timestamptz not null default now\(\), probe text not null check \(probe in \('rest', 'auth', 'db'\)\), ms integer, ok boolean not null, detail text/);
  assert.match(M, /create table if not exists public\.system_alerts \( id bigserial primary key, created_at timestamptz not null default now\(\), kind text not null check \(kind in \('slow', 'down', 'recovered'\)\), probe text not null check \(probe in \('rest', 'auth', 'db'\)\), ms integer, message text not null/);
  assert.match(M, /create table if not exists public\.admin_alert_tokens \( device_id uuid primary key references public\.admin_devices \(id\) on delete cascade, token_hash text not null unique/);
});

test('SA4: RLS on, nothing for public/anon/authenticated, no policies; service_role only what each path needs (no delete)', () => {
  for (const t of ['system_health_checks', 'system_alerts', 'admin_alert_tokens']) {
    assert.ok(M.includes(`alter table public.${t} enable row level security`), t + ' RLS');
    assert.ok(M.includes(`revoke all on table public.${t} from public, anon, authenticated`), t + ' revoke');
    assert.ok(M.includes(`revoke insert, update, delete, truncate, references, trigger on table public.${t} from service_role`), t + ' defaults taken back');
  }
  assert.ok(!/create policy/.test(M), 'no policies');
  assert.ok(!/grant [^;]* to [^;]*\b(anon|authenticated|public)\b/.test(M), 'no grant to anon/authenticated/public');
  assert.ok(M.includes('grant select, insert on table public.system_health_checks to service_role'));
  assert.ok(M.includes('grant select, insert on table public.system_alerts to service_role'));
  assert.ok(M.includes('grant select, insert, update (device_id, token_hash, created_at, last_used_at) on table public.admin_alert_tokens to service_role'));
  assert.ok(!/grant [^;]*delete[^;]* to service_role/.test(M));
});

test('SA4: pg_cron calls health-probe every 5 minutes with the Vault secret (the version-notice pattern) and deletes checks older than 14 days', () => {
  assert.match(M, /create extension if not exists pg_cron/);
  assert.match(M, /create extension if not exists pg_net with schema extensions/);
  assert.match(M, /if not exists \(select 1 from vault\.secrets where name = 'dosetrace_cron_secret'\)/);
  assert.match(M, /create or replace function public\.health_probe_secret_ok\(p_secret text\)/);
  assert.match(M, /revoke all on function public\.health_probe_secret_ok\(text\) from public, anon, authenticated/);
  assert.match(M, /grant execute on function public\.health_probe_secret_ok\(text\) to service_role/);
  assert.match(M, /cron\.unschedule\('dosetrace-health-probe'\)/);
  assert.match(M, /select cron\.schedule\( 'dosetrace-health-probe', '\*\/5 \* \* \* \*'/);
  assert.match(M, /url := 'https:\/\/mqfvnqfusqyhqhowfweh\.supabase\.co\/functions\/v1\/health-probe'/);
  assert.match(M, /'authorization', 'bearer ' \|\| \(select decrypted_secret from vault\.decrypted_secrets where name = 'dosetrace_cron_secret'\)/);
  assert.match(M, /select cron\.schedule\( 'dosetrace-health-retention', '[0-9]+ [0-9]+ \* \* \*', \$\$ delete from public\.system_health_checks where checked_at < now\(\) - interval '14 days'; \$\$ \)/);
});
