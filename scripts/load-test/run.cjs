#!/usr/bin/env node
// Load test of the sync path on a LOCAL copy of production (2026-11-03, docs/review/load-test-2026-11-03.md).
// NEVER points at production: it starts its own throw-away containers from images already on this
// machine (supabase/postgres:15.8.1.085, postgrest/postgrest:v12.2.12; nothing is pulled), loads the
// production schema copy (prod-schema.sql), seeds synthetic users (seed.sql), and then:
//   1. RLS/guard snapshot BEFORE (user A against user B on every table the migration touches)
//   2. load BEFORE at each concurrency (virtual users replaying the app's sync pass over HTTP)
//   3. EXPLAIN (ANALYZE, BUFFERS) of the sync queries BEFORE
//   4. applies the migration, then the same snapshot AFTER: it must equal BEFORE, and A must still
//      not read or write B's rows; the live policies (pg_policies) must be production's text with
//      only auth.uid() wrapped; no foreign key left without a covering index
//   5. EXPLAIN and load AFTER
// Opt-in, never part of `npm test`:
//   node scripts/load-test/run.cjs
// Env: LT_USERS (5000) LT_DAYS (365) LT_VUS ("100,1000") LT_SECONDS (30) LT_WARMUP (5) LT_THINK_MS
// (1000: random pause 0..N between two sync passes) LT_POOL (10: PostgREST pool) LT_CPUS (2)
// LT_MEM (1g) LT_CPUSET ("0,1": the cores Postgres and PostgREST share) LT_MIGRATION (path) LT_OUT (results dir; default the OS temp dir) LT_KEEP=1 (leave
// the containers up) LT_SKIP_BEFORE=1 (only the after half).
// Exit: 0 everything held · 1 a check failed · 3 skipped (no Docker / image missing).
'use strict';
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const PG_IMAGE = 'supabase/postgres:15.8.1.085';
const REST_IMAGE = 'postgrest/postgrest:v12.2.12';
const SECRET = 'load-test-jwt-secret-at-least-32-characters-long';
const ROOT = path.join(__dirname, '..', '..');
const MIGRATION = process.env.LT_MIGRATION || path.join(ROOT, 'supabase/migrations/20261103120000_perf_indexes_rls.sql');
const USERS = Number(process.env.LT_USERS || 5000);
const DAYS = Number(process.env.LT_DAYS || 365);
const VUS = String(process.env.LT_VUS || '100,1000').split(',').map(Number);
const SECONDS = Number(process.env.LT_SECONDS || 30);
const WARMUP = Number(process.env.LT_WARMUP || 5);
const THINK = Number(process.env.LT_THINK_MS || 1000);
const POOL = Number(process.env.LT_POOL || 10);
const CPUS = process.env.LT_CPUS || '2';
const MEM = process.env.LT_MEM || '1g';
const CPUSET = process.env.LT_CPUSET || '0,1'; // Postgres AND PostgREST pinned to the same cores (one Micro instance)
const OUT = process.env.LT_OUT || path.join(os.tmpdir(), `dt-load-test-${Date.now()}`);
const tag = `dtlt${process.pid}`;
const NET = `${tag}-net`; const PG = `${tag}-pg`; const REST = `${tag}-rest`;
fs.mkdirSync(OUT, { recursive: true });

const docker = (args, opts = {}) => new Promise((resolve) => execFile('docker', args, { maxBuffer: 1 << 26, ...opts }, (err, out, errOut) => resolve({ code: err ? (err.code || 1) : 0, out: String(out || ''), err: String(errOut || '') })));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
async function psql(sql, { user = 'postgres', vars = {} } = {}) {
  const v = Object.entries(vars).flatMap(([k, val]) => ['-v', `${k}=${val}`]);
  const r = await docker(['exec', '-i', '-e', 'PGPASSWORD=postgres', PG, 'psql', '-U', user, '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', ...v, '-c', sql]);
  if (r.code) throw new Error(`psql: ${r.err.slice(0, 2000)}`);
  return r.out.trim();
}
async function psqlFile(file, { user = 'postgres', vars = {} } = {}) {
  const dest = `/tmp/${path.basename(file)}`;
  await docker(['cp', file, `${PG}:${dest}`]);
  const v = Object.entries(vars).flatMap(([k, val]) => ['-v', `${k}=${val}`]);
  const r = await docker(['exec', '-e', 'PGPASSWORD=postgres', PG, 'psql', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', ...v, '-f', dest]);
  if (r.code) throw new Error(`${path.basename(file)}: ${r.err.slice(0, 2000)}`);
  return r.out;
}

// ── Identities (same formulas as seed.sql) ──────────────────────────────────
const md5uuid = (s) => { const h = crypto.createHash('md5').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
const uid = (k) => md5uuid(`u${k}`);
const pid = (k, j) => md5uuid(`p${k}-${j}`);
const vid = (k, n) => md5uuid(`v${k}-${n}`);
const dev = (k) => `i:lt${String(k).padStart(18, '0')}`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(claims) {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ exp: Math.floor(Date.now() / 1000) + 6 * 3600, iat: Math.floor(Date.now() / 1000), aud: 'authenticated', ...claims });
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
const userTok = (k) => jwt({ sub: uid(k), role: 'authenticated', session_id: md5uuid(`s${k}`), email: `lt${k}@load.test` });

// ── Containers ───────────────────────────────────────────────────────────────
async function available() {
  const v = await docker(['version', '--format', '{{.Server.Version}}']);
  if (v.code) return 'no Docker daemon';
  for (const img of [PG_IMAGE, REST_IMAGE]) { const i = await docker(['image', 'inspect', img]); if (i.code) return `image ${img} not present (nothing is pulled)`; }
  return null;
}
async function waitPg() {
  let stable = 0;
  for (let i = 0; i < 180 && stable < 3; i++) {
    const q = await docker(['exec', PG, 'psql', '-U', 'postgres', '-At', '-c', "select count(*) from pg_roles where rolname = 'authenticator'"]);
    stable = q.out.trim() === '1' ? stable + 1 : 0;
    await sleep(1000);
  }
  if (stable < 3) throw new Error('postgres did not come up');
}
let base = null;
async function up() {
  await docker(['network', 'create', NET]);
  const r = await docker(['run', '-d', '--name', PG, '--network', NET, '-e', 'POSTGRES_PASSWORD=postgres', PG_IMAGE]);
  if (r.code) throw new Error(`postgres: ${r.err}`);
  await waitPg();
  log('schema (production copy)');
  await psqlFile(path.join(__dirname, 'prod-schema.sql'), { user: 'supabase_admin' });
  log(`seed: ${USERS} users x ${DAYS} days`);
  const t0 = Date.now();
  await psqlFile(path.join(__dirname, 'seed.sql'), { user: 'supabase_admin', vars: { users: USERS, days: DAYS } });
  log(`seeded in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  // Production's compute (Micro: shared_buffers 224MB, work_mem 2184kB, 60 connections, 1 GB).
  for (const s of ["shared_buffers = '224MB'", "work_mem = '2184kB'", "effective_cache_size = '384MB'", "maintenance_work_mem = '32MB'", 'max_connections = 60', 'random_page_cost = 1.1', 'jit = off', 'max_parallel_workers_per_gather = 1', 'max_worker_processes = 6']) {
    await psql(`alter system set ${s}`, { user: 'supabase_admin' }); // one per call: ALTER SYSTEM refuses a transaction block
  }
  await docker(['update', '--cpus', CPUS, '--cpuset-cpus', CPUSET, '--memory', MEM, '--memory-swap', MEM, PG]);
  await docker(['restart', PG]);
  await waitPg();
  // Supabase runs PostgREST on the project's own instance: here it shares the same CPUs as Postgres.
  const rr = await docker(['run', '-d', '--name', REST, '--network', NET, '--cpuset-cpus', CPUSET, '-p', '127.0.0.1::3000',
    '-e', `PGRST_DB_URI=postgres://authenticator:authpass@${PG}:5432/postgres`, '-e', 'PGRST_DB_SCHEMAS=public',
    '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', `PGRST_JWT_SECRET=${SECRET}`, '-e', `PGRST_DB_POOL=${POOL}`, REST_IMAGE]);
  if (rr.code) throw new Error(`postgrest: ${rr.err}`);
  const port = (await docker(['port', REST, '3000/tcp'])).out.trim().split('\n')[0].split(':').pop();
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) { try { const r2 = await fetch(`${base}/`); if (r2.status < 500) return; } catch { /* starting */ } await sleep(500); }
  throw new Error('postgrest did not come up');
}
async function down() { if (process.env.LT_KEEP === '1') { log(`kept: ${PG} ${REST} (${base})`); return; } await docker(['rm', '-f', REST, PG]); await docker(['network', 'rm', NET]); }
async function reloadRest() { await psql("notify pgrst, 'reload schema'; notify pgrst, 'reload config';"); await sleep(1500); }

// ── HTTP ─────────────────────────────────────────────────────────────────────
const agent = new http.Agent({ keepAlive: true, maxSockets: Infinity });
function request(method, p, { k, body, prefer, object, device } = {}) {
  const u = new URL(base + p);
  const headers = { Accept: object ? 'application/vnd.pgrst.object+json' : 'application/json', 'x-client-info': 'supabase-js-react-native/2' };
  if (k != null) { headers.Authorization = `Bearer ${toks[k] || (toks[k] = userTok(k))}`; headers['x-dt-device'] = device || dev(k); headers['x-dt-app-version'] = '1.3.2'; }
  if (prefer) headers.Prefer = prefer;
  let data = null;
  if (body !== undefined) { data = Buffer.from(JSON.stringify(body)); headers['Content-Type'] = 'application/json'; headers['Content-Length'] = data.length; }
  const t0 = performance.now();
  return new Promise((resolve) => {
    const rq = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers, agent }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString();
        let json = null; try { json = JSON.parse(txt); } catch { json = txt; }
        resolve({ status: res.statusCode, ms: performance.now() - t0, body: json, t0 });
      });
    });
    rq.setTimeout(30000, () => rq.destroy(new Error('client timeout 30 s')));
    rq.on('error', (e) => resolve({ status: 0, ms: performance.now() - t0, body: { code: 'NET', message: String(e.message) }, t0 }));
    if (data) rq.write(data);
    rq.end();
  });
}
const toks = {};

// ── The app's sync pass (lib/sync.js + lib/syncPager.js + lib/deviceFlow.js) ──
const SYNC_TABLES = ['protocols', 'vials', 'dose_logs', 'biomarkers', 'vaccines', 'food_logs', 'reality_checks', 'calc_snapshots', 'calc_targets', 'reality_check_open', 'calc_inputs', 'lab_prefs'];
const enc = encodeURIComponent;
function syncPass(k, watermark, n) {
  const steps = [];
  // deviceFlow.gate: device_status before every pass.
  steps.push(['device_status', () => request('POST', '/rpc/device_status', { k, body: { p_device: dev(k) } })]);
  // pullChanges: fetchSince per table — keyset page on (updated_at, id), 500 rows.
  for (const t of SYNC_TABLES) {
    steps.push([`pull:${t}`, () => request('GET', `/${t}?select=*&user_id=eq.${uid(k)}&updated_at=gt.${enc(watermark)}&order=updated_at.asc,id.asc&limit=500`, { k })]);
  }
  // selfHealProtocols: the live protocol ids (fetchIds, keyset on id).
  steps.push(['self_heal_ids', () => request('GET', `/protocols?select=id&user_id=eq.${uid(k)}&purged_at=is.null&order=id.asc&limit=1000`, { k })]);
  // Push: a dose logged (insert ... select id, updated_at, single) and the vial's count (update by id).
  const now = new Date().toISOString();
  steps.push(['push:dose_insert', () => request('POST', '/dose_logs?select=id,updated_at', { k, prefer: 'return=representation', object: true, body: { id: crypto.randomUUID(), user_id: uid(k), protocol_id: pid(k, 1), logged_at: now, slot_at: now, outcome: 'Taken', injection_site: 'abdomen-left', dose_amount: 0.25, dose_unit: 'mg', created_at: now } })]);
  steps.push(['push:vial_update', () => request('PATCH', `/vials?id=eq.${vid(k, 1)}&select=id,updated_at`, { k, prefer: 'return=representation', body: { doses_taken: n % 20 } })]);
  return steps;
}

async function load(vus) {
  const start = performance.now();
  const warmEnd = start + WARMUP * 1000;
  const end = warmEnd + SECONDS * 1000;
  const recs = []; const passes = [];
  const watermark = new Date(Date.now() - 2 * 86400e3).toISOString();
  async function vu(i) {
    const k = (i % VU_USERS) + 1;
    await sleep(Math.random() * 200); // all arrive within 0.2 s
    let n = 0;
    while (performance.now() < end) {
      const p0 = performance.now(); let okPass = true;
      for (const [type, fn] of syncPass(k, watermark, n++)) {
        const r = await fn();
        const ok = r.status >= 200 && r.status < 300;
        if (!ok) okPass = false;
        if (r.t0 >= warmEnd && r.t0 < end) recs.push({ type, ms: r.ms, ok, status: r.status, code: ok ? null : (r.body && r.body.code) || String(r.status) });
      }
      if (p0 >= warmEnd && p0 < end) passes.push({ ms: performance.now() - p0, ok: okPass });
      if (THINK > 0) await sleep(Math.random() * THINK);
    }
  }
  // CPU of each container while the load runs (docker stats, every ~2 s).
  const cpu = { pg: [], rest: [] };
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      const s = await docker(['stats', '--no-stream', '--format', '{{.Name}} {{.CPUPerc}}', PG, REST]);
      if (performance.now() >= warmEnd) for (const l of s.out.trim().split('\n')) { const [n, p] = l.split(' '); const v = parseFloat(p); if (!Number.isNaN(v)) (n === PG ? cpu.pg : cpu.rest).push(v); }
      await sleep(1000);
    }
  })();
  const c0 = process.cpuUsage(); const w0 = performance.now();
  await Promise.all(Array.from({ length: vus }, (_, i) => vu(i)));
  const cu = process.cpuUsage(c0); const clientPct = r1((100 * (cu.user + cu.system) / 1000) / (performance.now() - w0)); // the load generator itself (one Node thread = 100)
  sampling = false; await sampler;
  const avg = (a) => (a.length ? r1(a.reduce((x, y) => x + y, 0) / a.length) : null);
  return { ...summarize(recs, passes, SECONDS), cpuPct: { pgAvg: avg(cpu.pg), pgMax: r1(Math.max(...cpu.pg, 0)), restAvg: avg(cpu.rest), restMax: r1(Math.max(...cpu.rest, 0)), client: clientPct } };
}
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
function summarize(recs, passes, secs) {
  const lat = recs.map((r) => r.ms);
  const errs = recs.filter((r) => !r.ok);
  const codes = {}; for (const e of errs) codes[e.code] = (codes[e.code] || 0) + 1;
  const byType = {};
  for (const r of recs) (byType[r.type] = byType[r.type] || []).push(r);
  const types = Object.fromEntries(Object.entries(byType).map(([t, rs]) => [t, { n: rs.length, p50: r1(pct(rs.map((x) => x.ms), 50)), p95: r1(pct(rs.map((x) => x.ms), 95)), p99: r1(pct(rs.map((x) => x.ms), 99)), errors: rs.filter((x) => !x.ok).length }]));
  return {
    requests: recs.length, rps: r1(recs.length / secs), errors: errs.length, errorRate: recs.length ? r1((100 * errs.length) / recs.length) : null, errorCodes: codes,
    p50: r1(pct(lat, 50)), p95: r1(pct(lat, 95)), p99: r1(pct(lat, 99)), max: r1(lat.length ? Math.max(...lat) : null),
    passes: passes.length, passOk: passes.filter((p) => p.ok).length, passP50: r1(pct(passes.map((p) => p.ms), 50)), passP95: r1(pct(passes.map((p) => p.ms), 95)),
    types,
  };
}

function parsePlan(txt) { const i = txt.search(/^\[/m); const j = txt.lastIndexOf(']'); try { return JSON.parse(txt.slice(i, j + 1))[0]; } catch { return null; } }
// ── EXPLAIN (ANALYZE, BUFFERS) as the app's role, with its claims and headers ──
async function explainAll(label) {
  const k = Math.min(1234, USERS - 1);
  const claims = JSON.stringify({ sub: uid(k), role: 'authenticated' });
  const hdrs = JSON.stringify({ 'x-dt-device': dev(k), 'x-dt-app-version': '1.3.2' });
  const W = new Date(Date.now() - 2 * 86400e3).toISOString();
  const pre = `set local role authenticated; select set_config('request.jwt.claims', '${claims}', true); select set_config('request.headers', '${hdrs}', true); select set_config('request.path', '/protocols', true); select set_config('request.method', 'PATCH', true);`;
  const qs = {
    'pull dose_logs (since 2 days)': `select * from public.dose_logs where user_id = '${uid(k)}' and updated_at > '${W}' order by updated_at, id limit 500`,
    'full import dose_logs (first page)': `select * from public.dose_logs where user_id = '${uid(k)}' and updated_at is not null order by updated_at, id limit 500`,
    'pull protocols': `select * from public.protocols where user_id = '${uid(k)}' and updated_at > '${W}' order by updated_at, id limit 500`,
    'self-heal protocol ids': `select id from public.protocols where user_id = '${uid(k)}' and purged_at is null order by id limit 1000`,
    'pull vials': `select * from public.vials where user_id = '${uid(k)}' and updated_at > '${W}' order by updated_at, id limit 500`,
    'pull biomarkers': `select * from public.biomarkers where user_id = '${uid(k)}' and updated_at > '${W}' order by updated_at, id limit 500`,
    'pull food_logs': `select * from public.food_logs where user_id = '${uid(k)}' and updated_at > '${W}' order by updated_at, id limit 500`,
    'pull calc_snapshots': `select * from public.calc_snapshots where user_id = '${uid(k)}' and updated_at > '${W}' order by updated_at, id limit 500`,
    'pull vaccines': `select * from public.vaccines where user_id = '${uid(k)}' and updated_at > '${W}' order by updated_at, id limit 500`,
    'pull reality_checks': `select * from public.reality_checks where user_id = '${uid(k)}' and updated_at > '${W}' order by updated_at, id limit 500`,
    'insert dose_log': `insert into public.dose_logs (user_id, protocol_id, outcome, dose_amount, dose_unit) values ('${uid(k)}', '${pid(k, 1)}', 'Taken', 0.25, 'mg') returning id, updated_at`,
    'pre-request guard (write)': 'select public.dt_pre_request()',
    'purge a protocol (cascades to its dose logs and vials)': `update public.protocols set purged_at = now() where id = '${pid(k, 2)}'`,
  };
  const out = {};
  for (const [name, q] of Object.entries(qs)) {
    const txt = await psql(`begin; ${pre} explain (analyze, buffers, format json) ${q}; rollback;`);
    const plan = parsePlan(txt);
    if (!plan) { out[name] = { error: txt.slice(0, 500) }; continue; }
    const nodes = []; let removed = 0; const walk = (n) => { removed += n['Rows Removed by Filter'] || 0; nodes.push(`${n['Node Type']}${n['Index Name'] ? ` (${n['Index Name']})` : ''}${n['Relation Name'] ? ` on ${n['Relation Name']}` : ''}`); (n.Plans || []).forEach(walk); };
    walk(plan.Plan);
    const triggers = (plan.Triggers || []).map((t) => `${t['Trigger Name']}${t.Relation ? ` on ${t.Relation}` : ''}: ${r1(t.Time)} ms`);
    out[name] = { ms: r1(plan['Execution Time']), planning: r1(plan['Planning Time']), sharedHit: plan.Plan['Shared Hit Blocks'], sharedRead: plan.Plan['Shared Read Blocks'], rowsRemovedByFilter: removed, nodes, triggers };
  }
  // Account deletion (GoTrue deletes auth.users; every table cascades on user_id).
  const del = await psql(`begin; explain (analyze, buffers, format json) delete from auth.users where id = '${uid(k + 1)}'; rollback;`, { user: 'supabase_admin' });
  try {
    const plan = parsePlan(del);
    out['delete an account (auth.users cascade)'] = { ms: r1(plan['Execution Time']), triggers: (plan.Triggers || []).filter((t) => t.Time > 1).map((t) => `${t['Constraint Name'] || t['Trigger Name']}${t.Relation ? ` on ${t.Relation}` : ''}: ${r1(t.Time)} ms`) };
  } catch { out['delete an account (auth.users cascade)'] = { error: del.slice(0, 500) }; }
  fs.writeFileSync(path.join(OUT, `explain-${label}.json`), JSON.stringify(out, null, 2));
  return out;
}

// ── RLS + guard snapshot: user A (k=10) against user B (k=20) on every table touched ──
// A is a multiple of 10 (its protocol 3 is in the bin, seed.sql) and outside the virtual users' range.
const A = USERS - 10 - (USERS % 10); const B = A - 10;
const VU_USERS = Math.max(1, B - 1); // virtual users are accounts 1..VU_USERS: never A or B
const OWNER_COL = { profiles: 'id', referrals: 'referrer_id' };
const PATCH_BODY = { protocols: { notes: 'x' }, dose_logs: { notes: 'x' }, vials: { water_ml: 2 }, biomarkers: { unit: 'x' }, vaccines: { notes: 'x' }, food_logs: { raw_text: 'x' }, reality_checks: { tdee: 1 }, calc_snapshots: { tdee: 1 }, calc_targets: { target_weight_kg: 1 }, reality_check_open: { start_weight_kg: 1 }, calc_inputs: { payload: {} }, lab_prefs: { value: 'x' }, push_tokens: { timezone: 'UTC' }, reminders: { snooze_minutes: 5 }, profiles: { name: 'x' }, referral_codes: { times_used: 2 }, referrals: { code: 'x' }, analytics_events: { event: 'x' }, team_messages: { read_at: '2026-11-03T00:00:00Z' } };
function insertBody(t, k) {
  const u = uid(k);
  return ({
    protocols: { user_id: u, name: 'n', type: 'peptide', color: '#000000' }, dose_logs: { user_id: u, protocol_id: pid(k, 1), outcome: 'Taken', dose_amount: 1, dose_unit: 'mg' },
    vials: { user_id: u, protocol_id: pid(k, 1) }, biomarkers: { user_id: u, report_date: '2026-11-01', marker: 'm', value: 1 }, vaccines: { user_id: u, name: 'v' },
    food_logs: { user_id: u, entry_date: '2026-11-01' }, reality_checks: { user_id: u, entry_date: '2026-11-01' }, calc_snapshots: { user_id: u, entry_date: '2026-11-01' },
    calc_targets: { user_id: u }, reality_check_open: { user_id: u }, calc_inputs: { user_id: u, payload: {} }, lab_prefs: { user_id: u, kind: 'star', item_key: 'i', value: 'v' },
    push_tokens: { user_id: u, expo_token: `T-${crypto.randomUUID()}` }, reminders: { user_id: u, protocol_id: pid(k, 1), time: '09:00', frequency: 'daily' },
    profiles: { id: u, name: 'x' }, referral_codes: { user_id: u, code: `C-${crypto.randomUUID()}` }, referrals: { referrer_id: uid(A), referred_id: u, code: 'x' },
    analytics_events: { user_id: u, event: 'x' }, team_messages: { user_id: u, body: 'x' },
  })[t];
}
const RLS_TABLES = [...SYNC_TABLES, 'push_tokens', 'reminders', 'profiles', 'referral_codes', 'referrals', 'analytics_events', 'team_messages'];
const shape = (r) => ({ status: r.status, rows: Array.isArray(r.body) ? r.body.length : null, code: !Array.isArray(r.body) && r.body && typeof r.body === 'object' ? (r.body.code || null) : null });
async function rlsSnapshot() {
  const snap = {};
  for (const t of RLS_TABLES) {
    const col = OWNER_COL[t] || 'user_id';
    snap[`${t}: A reads B`] = shape(await request('GET', `/${t}?select=*&${col}=eq.${uid(B)}`, { k: A }));
    snap[`${t}: A reads own`] = shape(await request('GET', `/${t}?select=*&${col}=eq.${uid(A)}&limit=50`, { k: A }));
    snap[`${t}: A inserts as B`] = shape(await request('POST', `/${t}`, { k: A, body: insertBody(t, B), prefer: 'return=minimal' }));
    snap[`${t}: A updates B`] = shape(await request('PATCH', `/${t}?${col}=eq.${uid(B)}`, { k: A, body: PATCH_BODY[t], prefer: 'return=representation' }));
    snap[`${t}: A deletes B`] = shape(await request('DELETE', `/${t}?${col}=eq.${uid(B)}`, { k: A, prefer: 'return=representation' }));
    snap[`${t}: A updates own`] = shape(await request('PATCH', `/${t}?${col}=eq.${uid(A)}`, { k: A, body: PATCH_BODY[t], prefer: 'return=representation' }));
  }
  // referrals: both halves of the SELECT rule (A referred by 9, A referred 11).
  snap['referrals: A sees as referrer'] = shape(await request('GET', `/referrals?select=*&referrer_id=eq.${uid(A)}`, { k: A }));
  snap['referrals: A sees as referred'] = shape(await request('GET', `/referrals?select=*&referred_id=eq.${uid(A)}`, { k: A }));
  snap['referrals: A sees all it may'] = shape(await request('GET', '/referrals?select=*', { k: A }));
  // vials DELETE rule: a vial of a protocol in the bin (deleted, not purged) cannot be deleted; a live one can.
  snap['vials: A deletes a vial of a binned protocol'] = shape(await request('DELETE', `/vials?id=eq.${vid(A, 5)}`, { k: A, prefer: 'return=representation' }));
  const mine = crypto.randomUUID();
  snap['vials: A inserts own'] = shape(await request('POST', '/vials', { k: A, body: { id: mine, user_id: uid(A), protocol_id: pid(A, 1) }, prefer: 'return=minimal' }));
  snap['vials: A deletes own live vial'] = shape(await request('DELETE', `/vials?id=eq.${mine}`, { k: A, prefer: 'return=representation' }));
  // The guard: another device of A is refused (DT001), the service role passes.
  snap['guard: A from another device'] = shape(await request('GET', `/protocols?select=id&user_id=eq.${uid(A)}`, { k: A, device: 'i:not-the-active-one' }));
  snap['anon reads dose_logs'] = shape(await request('GET', '/dose_logs?select=id&limit=5', {}));
  return snap;
}
function rlsExpectations(snap) {
  const bad = [];
  for (const t of RLS_TABLES) {
    const rd = snap[`${t}: A reads B`]; if (!(rd.status === 200 && rd.rows === 0) && !(t === 'team_messages' && rd.rows === 0)) bad.push(`${t}: A read B's rows ${JSON.stringify(rd)}`);
    const ins = snap[`${t}: A inserts as B`]; if (ins.status >= 200 && ins.status < 300 && t !== 'analytics_events') bad.push(`${t}: A inserted as B ${JSON.stringify(ins)}`);
    const up = snap[`${t}: A updates B`]; if (up.rows) bad.push(`${t}: A updated B ${JSON.stringify(up)}`);
    const de = snap[`${t}: A deletes B`]; if (de.rows) bad.push(`${t}: A deleted B ${JSON.stringify(de)}`);
    const own = snap[`${t}: A reads own`]; if (t !== 'analytics_events' && t !== 'referrals' && !(own.rows > 0)) bad.push(`${t}: A cannot read its own rows ${JSON.stringify(own)}`);
  }
  if (snap['vials: A deletes a vial of a binned protocol'].rows !== 0) bad.push('vials: a binned protocol\'s vial was deleted');
  if (snap['vials: A deletes own live vial'].rows !== 1) bad.push('vials: own live vial not deletable');
  if (snap['referrals: A sees all it may'].rows !== 2) bad.push(`referrals: A should see exactly 2 (made 1, received 1): ${JSON.stringify(snap['referrals: A sees all it may'])}`);
  if (snap['guard: A from another device'].code !== 'DT001') bad.push('guard: another device was not refused with DT001');
  return bad;
}
async function analyticsLeak() {
  // analytics_events: the anonymizing trigger stores any insert with user_id null, so "A inserts as
  // B" is accepted but must never be stored under B.
  return Number(await psql(`select count(*) from public.analytics_events where user_id = '${uid(B)}' and event = 'x'`));
}

// ── Live policies vs production (after the migration) ──
async function policyCheck() {
  const fixture = require(path.join(ROOT, '__tests__/fixtures/prodPolicies-2026-11-03.json')).policies;
  const rows = JSON.parse(await psql("select coalesce(json_agg(json_build_object('tablename', tablename, 'policyname', policyname, 'permissive', permissive, 'roles', roles::text, 'cmd', cmd, 'qual', qual, 'with_check', with_check)), '[]') from pg_policies where schemaname = 'public'"));
  const unwrap = (s) => (s == null ? null : s.replace(/\( SELECT auth\.uid\(\) AS uid\)/g, 'auth.uid()'));
  const live = new Map(rows.map((r) => [`${r.tablename}|${r.policyname}`, r]));
  const bad = [];
  for (const p of fixture) {
    if (p.tablename === 'referrals' && p.cmd === 'SELECT') continue;
    const l = live.get(`${p.tablename}|${p.policyname}`);
    if (!l) { bad.push(`missing ${p.tablename}: ${p.policyname}`); continue; }
    for (const f of ['permissive', 'roles', 'cmd']) if (l[f] !== p[f]) bad.push(`${p.policyname}: ${f} ${l[f]} != ${p[f]}`);
    if (unwrap(l.qual) !== p.qual) bad.push(`${p.policyname}: USING ${l.qual} != ${p.qual}`);
    if (unwrap(l.with_check) !== p.with_check) bad.push(`${p.policyname}: WITH CHECK ${l.with_check} != ${p.with_check}`);
  }
  const refSel = rows.filter((r) => r.tablename === 'referrals' && r.cmd === 'SELECT');
  if (refSel.length !== 1 || unwrap(refSel[0].qual) !== '((auth.uid() = referrer_id) OR (auth.uid() = referred_id))' || refSel[0].roles !== '{public}') bad.push(`referrals SELECT merge: ${JSON.stringify(refSel)}`);
  const bare = rows.filter((r) => /auth\.uid\(\)/.test(String(r.qual || '').replace(/\( SELECT auth\.uid\(\) AS uid\)/g, '') + String(r.with_check || '').replace(/\( SELECT auth\.uid\(\) AS uid\)/g, '')));
  if (bare.length) bad.push(`bare auth.uid() left: ${bare.map((r) => r.policyname).join(', ')}`);
  if (rows.length !== fixture.length - 1) bad.push(`policy count ${rows.length}, expected ${fixture.length - 1}`);
  return { bad, live: rows.length };
}
async function unindexedFks() {
  return psql(`select string_agg(c.conrelid::regclass || '(' || a.attname || ')', ', ') from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])`);
}

(async () => {
  const why = await available();
  if (why) { console.log(`SKIP: ${why}`); process.exit(3); }
  const result = { rig: { users: USERS, days: DAYS, seconds: SECONDS, warmup: WARMUP, thinkMs: THINK, pool: POOL, cpus: CPUS, cpuset: CPUSET, mem: MEM, pg: PG_IMAGE, rest: REST_IMAGE }, before: {}, after: {}, checks: {} };
  let failed = false;
  try {
    await up();
    await psql(`insert into public.team_messages (user_id, body, withdrawn_at) values ('${uid(A)}', 'withdrawn-probe', now())`, { user: 'postgres' });
    result.rig.rows = Object.fromEntries((await psql("select c.relname || '=' || c.reltuples::bigint from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.reltuples > 0 order by c.reltuples desc")).split('\n').map((l) => l.split('=')).map(([a, b]) => [a, Number(b)]));
    result.rig.dbSize = await psql("select pg_size_pretty(pg_database_size('postgres'))");
    log('rows', JSON.stringify(result.rig.rows), result.rig.dbSize);
    result.checks.unindexedBefore = await unindexedFks();
    const rlsBefore = await rlsSnapshot();
    result.checks.rlsBefore = rlsExpectations(rlsBefore);
    if (process.env.LT_SKIP_BEFORE !== '1') {
      result.before.explain = await explainAll('before');
      for (const v of VUS) { log(`load BEFORE ${v} VUs`); result.before[v] = await load(v); log(JSON.stringify({ ...result.before[v], types: undefined })); await sleep(3000); }
    }
    log(`migration ${path.relative(ROOT, MIGRATION)}`);
    const t0 = Date.now();
    await psqlFile(MIGRATION, { user: 'postgres' });
    result.checks.migrationSeconds = (Date.now() - t0) / 1000;
    await psql('analyze');
    await reloadRest();
    const rlsAfter = await rlsSnapshot();
    result.checks.rlsAfter = rlsExpectations(rlsAfter);
    const diff = Object.keys(rlsBefore).filter((k) => JSON.stringify(rlsBefore[k]) !== JSON.stringify(rlsAfter[k])).map((k) => `${k}: ${JSON.stringify(rlsBefore[k])} -> ${JSON.stringify(rlsAfter[k])}`);
    result.checks.rlsSameBeforeAfter = diff;
    result.checks.rlsCases = Object.keys(rlsAfter).length;
    result.checks.analyticsStoredAsB = await analyticsLeak();
    result.checks.policies = await policyCheck();
    result.checks.unindexedAfter = await unindexedFks();
    fs.writeFileSync(path.join(OUT, 'rls-snapshot.json'), JSON.stringify({ before: rlsBefore, after: rlsAfter }, null, 2));
    result.after.explain = await explainAll('after');
    for (const v of VUS) { log(`load AFTER ${v} VUs`); result.after[v] = await load(v); log(JSON.stringify({ ...result.after[v], types: undefined })); await sleep(3000); }
    const c = result.checks;
    const problems = [...c.rlsBefore, ...c.rlsAfter, ...c.rlsSameBeforeAfter, ...c.policies.bad, ...(c.unindexedAfter ? [`unindexed FKs after: ${c.unindexedAfter}`] : []), ...(c.analyticsStoredAsB ? ['analytics stored under B'] : [])];
    c.problems = problems;
    for (const p of problems) console.log(`FAIL ${p}`);
    if (problems.length) failed = true;
    console.log(`checks: ${c.rlsCases} RLS/guard cases equal before/after: ${c.rlsSameBeforeAfter.length === 0}; live policies = production text with the call wrapped: ${c.policies.bad.length === 0}; unindexed FKs before: ${c.unindexedBefore || 'none'}; after: ${c.unindexedAfter || 'none'}`);
  } catch (e) {
    failed = true;
    console.log(`FAIL setup: ${e && e.stack}`);
  } finally {
    fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
    console.log(`results: ${path.join(OUT, 'result.json')}`);
    await down();
  }
  process.exit(failed ? 1 : 0);
})();
