#!/usr/bin/env node
// A-119 rehearsal of supabase/migrations/20261021010000_one_active_device.sql on real Postgres +
// PostgREST (Gate B M3: "make the migration test the effect on Postgres"). Uses ONLY images already on
// this machine (supabase/postgres:15.8.1.085, postgrest/postgrest:v12.2.12) — nothing is pulled.
// Starts two throw-away containers on their own network, applies the fixture and the migration,
// runs the scenarios over HTTP (and psql for the two concurrency cases), removes everything.
//
//   node scripts/a119-pg-rehearsal.cjs        → exit 0 all passed · 1 a scenario failed · 3 skipped
//   (skipped: no Docker daemon, or one of the two images is not present locally)
//
// __tests__/a119Postgres.test.js runs it when DT_PG_REHEARSAL=1 (and skips otherwise: it takes ~40 s
// and starts containers, so it is opt-in for the ordinary `npm test`).
'use strict';
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PG_IMAGE = 'supabase/postgres:15.8.1.085';
const REST_IMAGE = 'postgrest/postgrest:v12.2.12';
const SECRET = 'a119-rehearsal-jwt-secret-at-least-32-characters';
const ROOT = path.join(__dirname, '..');
const MIGRATION = process.env.A119_MIGRATION || path.join(ROOT, 'supabase/migrations/20261021010000_one_active_device.sql'); // override: rehearse another version
const SETUP = path.join(__dirname, 'a119-rehearsal/setup.sql');
const tag = `a119rh${process.pid}`;
const NET = `${tag}-net`;
const PG = `${tag}-pg`;
const REST = `${tag}-rest`;

const sh = (args, opts = {}) => new Promise((resolve) => execFile('docker', args, { maxBuffer: 1 << 24, ...opts }, (err, out, errOut) => resolve({ code: err ? (err.code || 1) : 0, out: String(out || ''), err: String(errOut || '') })));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(claims) {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims });
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
const U1 = '11111111-1111-1111-1111-111111111111';
const S = { old: 'aaaaaaaa-0000-0000-0000-000000000001', mid: 'aaaaaaaa-0000-0000-0000-000000000002', oldest: 'aaaaaaaa-0000-0000-0000-000000000003', newest: 'aaaaaaaa-0000-0000-0000-000000000004' };
const user = (sid) => jwt({ sub: U1, role: 'authenticated', session_id: sid });
const SR = jwt({ role: 'service_role' });
const A = 'i:aaaaaaaaaaaaaaaaaaaa';
const B = 'i:bbbbbbbbbbbbbbbbbbbb';
const C = 'a:cccccccccccccccc';

let base = null;
async function call(method, p, { tok, dev, ver, body, prefer } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (tok) h.Authorization = `Bearer ${tok}`;
  if (dev) h['x-dt-device'] = dev;
  if (ver) h['x-dt-app-version'] = ver;
  if (prefer) h.Prefer = prefer;
  const r = await fetch(base + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let json = null;
  try { json = JSON.parse(txt); } catch { json = txt; }
  return { status: r.status, body: json };
}
const rpc = (fn, args, o) => call('POST', `/rpc/${fn}`, { ...o, body: args });
const claim = (dev, mode, sid) => rpc('claim_device', { p_device: dev, p_platform: 'ios', p_name: 'iPhone', p_brand: 'Apple', p_app_version: '1.3.1', p_mode: mode }, { tok: user(sid), dev, ver: '1.3.1' });
// As supabase_admin (GoTrue's own role is reachable from there).
const psqlAdmin = async (sql) => { const r = await sh(['exec', '-i', '-e', 'PGPASSWORD=postgres', PG, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql]); return r.out.trim() + (r.code ? `\nERR ${r.err}` : ''); };
const psql = async (sql) => { const r = await sh(['exec', '-i', PG, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql]); return r.out.trim() + (r.code ? `\nERR ${r.err}` : ''); };

const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  ${JSON.stringify(detail).slice(0, 300)}`}`); }

async function available() {
  const v = await sh(['version', '--format', '{{.Server.Version}}']);
  if (v.code) return 'no Docker daemon';
  for (const img of [PG_IMAGE, REST_IMAGE]) { const i = await sh(['image', 'inspect', img]); if (i.code) return `image ${img} not present (nothing is pulled)`; }
  return null;
}

async function up() {
  await sh(['network', 'create', NET]);
  const r = await sh(['run', '-d', '--name', PG, '--network', NET, '-e', 'POSTGRES_PASSWORD=postgres', PG_IMAGE]);
  if (r.code) throw new Error(`postgres: ${r.err}`);
  // The image runs its init scripts and restarts once: wait for a stable "authenticator exists".
  let stable = 0;
  for (let i = 0; i < 120 && stable < 3; i++) {
    const q = await sh(['exec', PG, 'psql', '-U', 'postgres', '-At', '-c', "select count(*) from pg_roles where rolname = 'authenticator'"]);
    stable = q.out.trim() === '1' ? stable + 1 : 0;
    await sleep(1000);
  }
  if (stable < 3) throw new Error('postgres did not come up');
  await sh(['cp', SETUP, `${PG}:/tmp/setup.sql`]);
  const s = await sh(['exec', '-e', 'PGPASSWORD=postgres', PG, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '/tmp/setup.sql']); // the auth schema belongs to supabase_admin
  if (s.code) throw new Error(`setup: ${s.err}`);
  const rr = await sh(['run', '-d', '--name', REST, '--network', NET, '-p', '127.0.0.1::3000',
    '-e', `PGRST_DB_URI=postgres://authenticator:authpass@${PG}:5432/postgres`, '-e', 'PGRST_DB_SCHEMAS=public',
    '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', `PGRST_JWT_SECRET=${SECRET}`, REST_IMAGE]);
  if (rr.code) throw new Error(`postgrest: ${rr.err}`);
  const port = (await sh(['port', REST, '3000/tcp'])).out.trim().split('\n')[0].split(':').pop();
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) { try { const r2 = await fetch(`${base}/`); if (r2.status < 500) return; } catch { /* starting */ } await sleep(500); }
  throw new Error('postgrest did not come up');
}
async function down() {
  await sh(['rm', '-f', REST, PG]);
  await sh(['network', 'rm', NET]);
}
async function applyMigration() {
  await sh(['cp', MIGRATION, `${PG}:/tmp/mig.sql`]);
  const m = await sh(['exec', PG, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '/tmp/mig.sql']);
  if (m.code) throw new Error(`migration: ${m.err}`);
  await psql("notify pgrst, 'reload schema'; notify pgrst, 'reload config';");
  for (let i = 0; i < 40; i++) { const r = await rpc('account_exists', { p_user: U1 }, {}); if (r.status === 200) break; await sleep(250); }
  await sleep(500);
}

async function scenarios() {
  // H2 (brick.cjs): before the migration the device RPC answers "function not found" — the code the
  // app treats as "no device rules here".
  const pre = await claim(A, 'signin', S.mid);
  check('H2: without the migration claim_device answers 404 PGRST202', pre.status === 404 && pre.body && pre.body.code === 'PGRST202', pre);
  await applyMigration();

  const g0 = await call('GET', '/protocols?select=id', { tok: user(S.mid) });
  check('S0: 1.3.0 (no device id) reads before any device registers', g0.status === 200, g0);
  const w0 = await call('POST', '/protocols', { tok: user(S.mid), body: { user_id: U1, val: 'from130' } });
  check('S0: 1.3.0 writes before any device registers', w0.status === 201, w0);
  const an = await call('POST', '/analytics', { body: { ev: 'open' } });
  check('S0: a table outside the guard is untouched (anon analytics insert)', an.status === 201, an);

  const cA = await claim(A, 'signin', S.mid);
  check('S1: devA claim (signin) → active', cA.status === 200 && cA.body.status === 'active', cA);
  const secretA = cA.body && cA.body.secret;
  const wA = await call('POST', '/protocols', { tok: user(S.mid), dev: A, ver: '1.3.1', body: { user_id: U1, val: 'fromA' } });
  check('S1: devA writes', wA.status === 201, wA);
  const legacy = await call('POST', '/protocols', { tok: user(S.mid), body: { user_id: U1, val: 'from130-after' } });
  check('DL-105 amended: 1.3.0 still writes after a device registered (no cutoff yet)', legacy.status === 201, legacy);
  await psql("update public.device_policy set legacy_until = now() - interval '1 minute'");
  const legacyAfter = await call('POST', '/protocols', { tok: user(S.mid), body: { user_id: U1, val: 'after-cutoff' } });
  check('DL-105 amended: after the founder\'s cutoff 1.3.0 gets DT002 (never an empty answer)', legacyAfter.status >= 400 && legacyAfter.body.code === 'DT002', legacyAfter);
  const legacyRead = await call('GET', '/protocols?select=id', { tok: user(S.mid) });
  check('DL-105 amended: after the cutoff 1.3.0 reads get DT002 too', legacyRead.body && legacyRead.body.code === 'DT002', legacyRead);
  await psql('update public.device_policy set legacy_until = null');

  await call('POST', '/push_tokens', { tok: SR, body: { user_id: U1, expo_token: 'Tlegacy' } });
  await call('POST', '/push_tokens', { tok: user(S.mid), dev: A, ver: '1.3.1', body: { user_id: U1, expo_token: 'TA', device_id: A } });

  const silentB = await claim(B, 'silent', S.mid);
  check('DL-103: devB silent claim while A is active → in_use (never a silent takeover)', silentB.body.status === 'in_use', silentB);
  const oldB = await claim(B, 'signin', S.oldest);
  check('last sign-in wins: devB claim from an OLDER session → superseded', oldB.body.status === 'superseded', oldB);
  await psql(`update public.user_devices set replaced_at = null, replaced_by = null where device_id = '${B}'`);

  const takeB = await claim(B, 'signin', S.newest);
  check('S3: devB takeover → active, rebuild owed (takeover), notice names devA', takeB.body.status === 'active' && takeB.body.took_over === true && takeB.body.rebuild_mode === 'takeover' && takeB.body.notice && takeB.body.notice.name === 'iPhone', takeB);
  const toks = await call('GET', '/push_tokens?select=expo_token', { tok: SR });
  check('OD-16 / LOW: the takeover removed devA\'s token and the 1.3.0 token', Array.isArray(toks.body) && toks.body.length === 0, toks);
  const rA = await call('GET', '/protocols?select=id', { tok: user(S.mid), dev: A, ver: '1.3.1' });
  check('OD-7: replaced devA read → DT001 (not an empty list)', rA.body && rA.body.code === 'DT001', rA);
  const pA = await call('PATCH', '/protocols?val=eq.fromA', { tok: user(S.mid), dev: A, ver: '1.3.1', body: { val: 'late' } });
  check('OD-7: replaced devA update → DT001 (not 0 rows)', pA.body && pA.body.code === 'DT001', pA);
  const dA = await call('DELETE', '/protocols?val=eq.fromA', { tok: user(S.mid), dev: A, ver: '1.3.1' });
  check('OD-7: replaced devA delete → DT001', dA.body && dA.body.code === 'DT001', dA);
  const stA = await rpc('device_status', { p_device: A }, { tok: user(S.mid), dev: A });
  check('OD-4: devA device_status → replaced with the time', stA.body.status === 'replaced' && !!stA.body.at, stA);
  const coldA = await claim(A, 'silent', S.mid);
  check('OD-14: devA cold start (silent claim) never takes the account back', coldA.body.status === 'replaced', coldA);
  const bySecret = await rpc('device_status_by_secret', { p_secret: secretA }, {});
  check('OD-16 / LOW: anon by-secret check → replaced, naming the account', bySecret.body.status === 'replaced' && bySecret.body.user_id === U1, bySecret);
  const relA = await rpc('release_device', { p_device: A }, { tok: user(S.mid), dev: A });
  check('a replaced device cannot release the account', relA.body.released === false, relA);
  const gB = await call('GET', '/protocols?select=val', { tok: user(S.newest), dev: B, ver: '1.3.1' });
  check('S3: devB reads the account', gB.status === 200 && gB.body.length >= 3, gB);
  const ackB = await rpc('device_ack', { p_device: B, p_what: 'rebuild' }, { tok: user(S.newest), dev: B });
  const stB = await rpc('device_status', { p_device: B }, { tok: user(S.newest), dev: B });
  check('ack clears the owed rebuild', ackB.body.ok === true && stB.body.rebuild_owed === false, { ackB, stB });

  // OD-3 races: a write in flight vs the takeover (psql holds a transaction; HTTP waits on the lock).
  await psql(`update public.account_devices set active_device = '${A}', session_created_at = now() - interval '1 hour' where user_id = '${U1}'; update public.user_devices set replaced_at = null, replaced_by = null where device_id = '${A}'`);
  const writeSql = `begin; select set_config('request.jwt.claims', '{"sub":"${U1}","role":"authenticated","session_id":"${S.mid}"}', true); select set_config('request.headers', '{"x-dt-device":"${A}","x-dt-app-version":"1.3.1"}', true); select set_config('request.path', '/protocols', true); select set_config('request.method', 'POST', true); set local role authenticated; select public.dt_pre_request(); insert into public.protocols (user_id, val) values ('${U1}', 'inflight-A'); select pg_sleep(2); commit;`;
  const inflight = psql(writeSql);
  await sleep(600);
  const t0 = Date.now();
  const raceClaim = await claim(B, 'signin', S.newest);
  const waited = Date.now() - t0;
  await inflight;
  const seen = await call('GET', '/protocols?select=val&val=eq.inflight-A', { tok: user(S.newest), dev: B, ver: '1.3.1' });
  check('OD-3: a takeover waits for a write in flight; that write is in the new phone\'s import', raceClaim.body.status === 'active' && waited > 800 && Array.isArray(seen.body) && seen.body.length === 1, { waited, raceClaim: raceClaim.body.status, seen: seen.body });
  await psql(`update public.account_devices set active_device = '${B}' where user_id = '${U1}'`);
  const claimSql = `begin; select set_config('request.jwt.claims', '{"sub":"${U1}","role":"authenticated","session_id":"${S.newest}"}', true); select set_config('request.headers', '{"x-dt-device":"${C}"}', true); set local role authenticated; select public.claim_device('${C}','android',null,'samsung','1.3.1','signin'); select pg_sleep(2); commit;`;
  const pendingClaim = psql(claimSql);
  await sleep(600);
  const lateB = await call('POST', '/protocols', { tok: user(S.newest), dev: B, ver: '1.3.1', body: { user_id: U1, val: 'late-B' } });
  await pendingClaim;
  check('OD-3: a write that arrives during a takeover waits and is refused (DT001), never lost silently', lateB.body && lateB.body.code === 'DT001', lateB);

  // M2: released, then another device becomes active: its copy is stale → rebuild owed, unsent kept.
  await rpc('device_ack', { p_device: C, p_what: 'rebuild' }, { tok: user(S.newest), dev: C });
  const relC = await rpc('release_device', { p_device: C }, { tok: user(S.newest), dev: C });
  check('DL-108: the active device releases the account', relC.body.released === true, relC);
  const dev2 = 'i:dddddddddddddddddddd';
  const silentD = await claim(dev2, 'silent', S.newest);
  check('M2: a different device that becomes active after a release owes a stale rebuild', silentD.body.status === 'active' && silentD.body.rebuild_owed === true && silentD.body.rebuild_mode === 'stale', silentD);
  const relD = await rpc('release_device', { p_device: dev2 }, { tok: user(S.newest), dev: dev2 });
  const again = await claim(dev2, 'silent', S.newest);
  check('M2: a rebuild still owed (not done before a release) stays owed when the same device comes back', relD.body.released === true && again.body.rebuild_owed === true && again.body.rebuild_mode === 'stale', { relD: relD.body, again: again.body });

  // DT003: the minimum version.
  await psql("update public.device_policy set min_app_version = '1.3.2'");
  const old = await call('GET', '/protocols?select=id', { tok: user(S.newest), dev: dev2, ver: '1.3.1' });
  check('OD-17: below the minimum version → DT003', old.body && old.body.code === 'DT003', old);
  await psql('update public.device_policy set min_app_version = null');

  // M3: grants.
  const anonClaim = await rpc('claim_device', { p_device: B, p_platform: null, p_name: null, p_brand: null, p_app_version: null, p_mode: 'signin' }, {});
  check('M3: anon cannot run claim_device', anonClaim.status === 401 || (anonClaim.body && anonClaim.body.code === '42501'), anonClaim);
  const anonStatus = await rpc('device_status', { p_device: B }, {});
  check('M3: anon cannot run device_status', anonStatus.status === 401 || (anonStatus.body && anonStatus.body.code === '42501'), anonStatus);
  const exists = await rpc('account_exists', { p_user: U1 }, {});
  check('anon account_exists works (after a session ended on its own)', exists.status === 200 && exists.body === true, exists);
  const srGet = await call('GET', '/protocols?select=id', { tok: SR });
  check('M3: the service role passes the pre-request (account deletion, server senders)', srGet.status === 200, srGet);
  const tables = await call('GET', '/account_devices', { tok: user(S.newest) });
  check('the device tables are not readable by the app', tables.status >= 400, tables);

  // OD-10: the auth user deleted (GoTrue's admin delete): everything cascades; the JWT still valid
  // answers "account gone".
  const del = await psqlAdmin(`set role supabase_auth_admin; delete from auth.users where id = '${U1}'; reset role; select count(*) from public.user_devices where user_id = '${U1}'; select count(*) from public.account_devices where user_id = '${U1}';`);
  check('OD-10: deleting the auth user removes the device rows too', /\b0\n0$/.test(del), del);
  const gone = await rpc('device_status', { p_device: dev2 }, { tok: user(S.newest), dev: dev2 });
  check('OD-10: a phone of a deleted account hears "account_gone"', gone.body.status === 'account_gone', gone);
  const goneAnon = await rpc('account_exists', { p_user: U1 }, {});
  check('OD-10: account_exists says false', goneAnon.body === false, goneAnon);

  // Gate B round 2 (M3 warning): dt_pre_request dropped while pgrst.db_pre_request still names it →
  // EVERY call fails (any table, any app version). Then the ROLLBACK steps exactly as the migration
  // header writes them: everything works again, as before the migration.
  const U2tok = jwt({ sub: '22222222-2222-2222-2222-222222222222', role: 'authenticated' });
  await psql("drop function public.dt_pre_request(); notify pgrst, 'reload schema';");
  await sleep(1500);
  const broken = await call('GET', '/protocols?select=id', { tok: U2tok });
  const brokenAnon = await call('POST', '/analytics', { body: { ev: 'x' } });
  check('M3: with dt_pre_request missing every call fails (the never-drop warning is real)', broken.status >= 400 && brokenAnon.status >= 400, { broken, brokenAnon });
  const raw = fs.readFileSync(MIGRATION, 'utf8').split('\n');
  const at = raw.findIndex((l) => /^-- ROLLBACK \(run in this order\):/.test(l));
  const steps = [];
  for (let i = at + 1; i < raw.length && /^--   /.test(raw[i]); i++) steps.push(raw[i].replace(/^--   /, ''));
  const rollbackSql = steps.filter((l) => !/^\(/.test(l.trim())).join('\n');
  fs.writeFileSync(path.join(require('node:os').tmpdir(), `${tag}-rb.sql`), rollbackSql);
  await sh(['cp', path.join(require('node:os').tmpdir(), `${tag}-rb.sql`), `${PG}:/tmp/rb.sql`]);
  const rb = await sh(['exec', PG, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '/tmp/rb.sql']);
  await psql("notify pgrst, 'reload schema'; notify pgrst, 'reload config';");
  await sleep(1500);
  const after = await call('POST', '/protocols', { tok: U2tok, body: { user_id: '22222222-2222-2222-2222-222222222222', val: 'after-rollback' } });
  const afterRpc = await rpc('claim_device', { p_device: A, p_platform: null, p_name: null, p_brand: null, p_app_version: null, p_mode: 'signin' }, { tok: U2tok });
  check('ROLLBACK as written in the migration header: it runs, and the project works as before (writes OK; the device RPC is gone: PGRST202)', rb.code === 0 && after.status === 201 && afterRpc.body && afterRpc.body.code === 'PGRST202', { rb: rb.err, after, afterRpc });
}

(async () => {
  const why = await available();
  if (why) { console.log(`SKIP: ${why}`); process.exit(3); }
  let failed = false;
  try {
    await up();
    await scenarios();
  } catch (e) {
    failed = true;
    console.log(`FAIL setup: ${e && e.message}`);
  } finally {
    await down();
  }
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} scenarios passed`);
  if (failed || bad.length) process.exit(1);
  process.exit(0);
})();
