'use strict';
// Admin panel 3.1 — login (docs/specs/admin-panel.md Phase 3 › 3.1, rows AU1–AU9, signed 2026-10-21).
// Server: api/adm*.js accept only a Supabase session (aal2) of an allow-listed account; writes need
// role admin + a TOTP check in the last 15 min; a POST from another Origin is refused first.
// Page: web/adm.html signs in with e-mail + password + TOTP through Supabase Auth (anon key only),
// keeps the session in sessionStorage only, and has no token prompt any more.
// Dummy values only — never a real token, key or account.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('./helpers/admAuthFake.js');

const ROOT = path.join(__dirname, '..');
const API_DIR = path.join(ROOT, 'api');
const HTML = fs.readFileSync(path.join(ROOT, 'web', 'adm.html'), 'utf8');
const SQL = fs.readFileSync(path.join(ROOT, 'supabase_admin_rpcs.sql'), 'utf8');
const MIG_PATH = path.join(ROOT, 'supabase', 'migrations', '20261021000000_admin_users.sql');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';

// Every /api/adm* endpoint (adm.js today; adm-premium.js and adm-ai.js later) gets the same matrix.
const ENDPOINTS = fs.readdirSync(API_DIR).filter((f) => /^adm.*\.js$/.test(f));
const handlers = ENDPOINTS.map((f) => [f, require(path.join(API_DIR, f))]);
const adm = require('../api/adm.js');

function withEnv(fn) { return async () => { F.envOn(); try { await fn(); } finally { F.envOff(); } }; }

// ------------------------------------------------------------------ AU2: server refusals
test('AU2: every /api/adm* endpoint returns 401 without a JWT, before any call', withEnv(async () => {
  assert.ok(ENDPOINTS.includes('adm.js'));
  for (const [name, h] of handlers) {
    const r = await F.call(h, { headers: {} });
    assert.equal(r.code, 401, name);
    assert.equal(r.calls.length, 0, name + ': no call at all without a token');
    assert.equal(r.headers['cache-control'], 'no-store');
  }
}));

test('AU2: a JWT that Supabase does not accept → 401, no data call', withEnv(async () => {
  for (const [name, h] of handlers) {
    const r = await F.call(h, { headers: { authorization: 'Bearer not.a.session' } });
    assert.equal(r.code, 401, name);
    assert.equal(r.dataCalls.length, 0, name);
  }
}));

test('AU2: the old ADMIN_TOKEN alone → 401 (the server no longer reads it), no data call', withEnv(async () => {
  process.env.ADMIN_TOKEN = 'dummy-admin-token-0123456789';
  try {
    for (const [name, h] of handlers) {
      for (const method of ['GET', 'POST']) {
        const r = await F.call(h, { method, headers: Object.assign({ authorization: 'Bearer dummy-admin-token-0123456789' }, F.ORIGIN), body: { action: 'mark_test', emails: ['a@x.y'] } });
        assert.equal(r.code, 401, name + ' ' + method);
        assert.equal(r.dataCalls.length, 0, name + ' ' + method);
      }
    }
  } finally { delete process.env.ADMIN_TOKEN; }
}));

test('AU2: an aal1 session (password only, no TOTP yet) of an allow-listed account → 401 aal2_required, no data call', withEnv(async () => {
  for (const [name, h] of handlers) {
    const r = await F.call(h, { headers: F.bearer('admin', { aal: 'aal1' }) });
    assert.equal(r.code, 401, name);
    assert.equal(r.json.code, 'aal2_required');
    assert.equal(r.dataCalls.length, 0, name);
  }
}));

test('AU2: a signed-in account that is not in admin_users → 403 not_allowed, no data call (aal1 or aal2)', withEnv(async () => {
  for (const [name, h] of handlers) {
    for (const aal of ['aal1', 'aal2']) {
      const r = await F.call(h, { headers: F.bearer('stranger', { aal }) });
      assert.equal(r.code, 403, name + ' ' + aal);
      assert.equal(r.json.code, 'not_allowed');
      assert.equal(r.dataCalls.length, 0, name + ' ' + aal);
    }
  }
}));

test('AU2: a viewer reads (200) but a viewer write → 403, no database write', withEnv(async () => {
  const g = await F.call(adm, { headers: F.bearer('viewer') });
  assert.equal(g.code, 200);
  assert.equal(g.json.me.role, 'viewer');
  for (const [name, h] of handlers) {
    const p = await F.call(h, { method: 'POST', headers: Object.assign(F.bearer('viewer', { totpS: 5 }), F.ORIGIN), body: { action: 'mark_test', emails: ['a@x.y'] } });
    assert.equal(p.code, 403, name);
    assert.equal(p.json.code, 'role');
    assert.equal(p.dataCalls.length, 0, name);
  }
}));

test('AU2: an allow-listed admin with an aal2 session is served (the four admin RPCs), and the response says the role', withEnv(async () => {
  const r = await F.call(adm, { headers: F.bearer('admin') });
  assert.equal(r.code, 200);
  assert.equal(r.dataCalls.length, 4);
  assert.equal(r.json.me.role, 'admin');
  assert.ok(!r.body.includes('fake-sig'), 'the token is never echoed');
}));

test('AU2: the JWT subject must be the user Supabase returns; a mismatch → 401', withEnv(async () => {
  const r = await F.call(adm, { headers: F.bearer('admin') }, { userIdOverride: F.USERS.stranger.id });
  assert.equal(r.code, 401);
  assert.equal(r.dataCalls.length, 0);
}));

test('AU2: a token-like query parameter is still refused (401) even with a valid session', withEnv(async () => {
  for (const q of ['t', 'token', 'admin_token', 'access_token']) {
    const r = await F.call(adm, { url: '/api/adm?' + q + '=x', headers: F.bearer('admin') });
    assert.equal(r.code, 401, q);
    assert.equal(r.calls.length, 0, q);
  }
  const ok = await F.call(adm, { url: '/api/adm?lang=pt', headers: F.bearer('admin') });
  assert.equal(ok.code, 200);
}));

test('AU2: fail closed — Supabase not configured → 503; auth or allow-list unreachable → 503; never data', async () => {
  F.envOff();
  const a = await F.call(adm, { headers: F.bearer('admin') });
  assert.equal(a.code, 503); assert.equal(a.calls.length, 0);
  F.envOn();
  try {
    const b = await F.call(adm, { headers: F.bearer('admin') }, { authDown: true });
    assert.equal(b.code, 503); assert.equal(b.dataCalls.length, 0);
    const c = await F.call(adm, { headers: F.bearer('admin') }, { allowListDown: true });
    assert.equal(c.code, 503); assert.equal(c.dataCalls.length, 0);
  } finally { F.envOff(); }
});

// ------------------------------------------------------------------ AU8 (server half): maximum session age
test('AU8 server: a session whose password sign-in is older than 12 h → 401 session_expired, no data call', withEnv(async () => {
  const old = await F.call(adm, { headers: F.bearer('admin', { ageS: 12 * 3600 + 60 }) });
  assert.equal(old.code, 401);
  assert.equal(old.json.code, 'session_expired');
  assert.equal(old.dataCalls.length, 0);
  const young = await F.call(adm, { headers: F.bearer('admin', { ageS: 12 * 3600 - 60 }) });
  assert.equal(young.code, 200);
  const noAmr = await F.call(adm, { headers: F.bearer('admin', { noAmr: true }) });
  assert.equal(noAmr.code, 401, 'no sign-in time → refused (fail closed)');
}));

// ------------------------------------------------------------------ AU3 (server half): step-up
test('AU3 server: a write more than 15 min after the last TOTP check → 401 step_up_required, no database write', withEnv(async () => {
  const r = await F.call(adm, { method: 'POST', headers: Object.assign(F.bearer('admin', { totpS: 16 * 60 }), F.ORIGIN), body: { action: 'mark_test', emails: ['a@x.y'] } });
  assert.equal(r.code, 401);
  assert.equal(r.json.code, 'step_up_required');
  assert.equal(r.dataCalls.length, 0);
}));

test('AU3 server: a write within 15 min of the TOTP check runs admin_mark_test once, with the admin user_id as the actor', withEnv(async () => {
  const r = await F.call(adm, { method: 'POST', headers: Object.assign(F.bearer('admin', { totpS: 14 * 60 }), F.ORIGIN), body: { action: 'unmark_test', emails: [' A@X.Y ', 'a@x.y'] } },
    { data: () => F.json({ ok: true, changed: 1 }) });
  assert.equal(r.code, 200);
  assert.equal(r.dataCalls.length, 1);
  assert.match(r.dataCalls[0].url, /\/rest\/v1\/rpc\/admin_mark_test$/);
  assert.deepEqual(r.dataCalls[0].body, { p_emails: ['a@x.y'], p_mark: false, p_actor: F.USERS.admin.id });
}));

test('AU3 server: reading never asks for a fresh code (GET with an old TOTP check is served)', withEnv(async () => {
  const r = await F.call(adm, { headers: F.bearer('admin', { totpS: 3 * 3600 }) });
  assert.equal(r.code, 200);
}));

// ------------------------------------------------------------------ AU4: Origin
test('AU4: a POST with a foreign or missing Origin → 403 before anything (no JWT check, no database call)', withEnv(async () => {
  for (const [name, h] of handlers) {
    for (const origin of ['https://evil.example', 'http://dosetrace.io', 'https://dosetrace.io.evil.example', null]) {
      const headers = F.bearer('admin', { totpS: 5 });
      if (origin) headers.origin = origin;
      const r = await F.call(h, { method: 'POST', headers, body: { action: 'mark_test', emails: ['a@x.y'] } });
      assert.equal(r.code, 403, name + ' ' + origin);
      assert.equal(r.json.code, 'origin');
      assert.equal(r.calls.length, 0, name + ' ' + origin + ': not even the JWT check');
      assert.equal(r.headers['cache-control'], 'no-store');
    }
  }
}));

// ------------------------------------------------------------------ AU5: admin_users table (SQL)
function sqlNorm(s) { return s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function fnBody(src, name) {
  const m = src.match(new RegExp('create or replace function public\\.' + name + '\\([\\s\\S]*?\\n\\$\\$;', 'i'));
  assert.ok(m, name + ' present');
  return m[0];
}
test('AU5 SQL: admin_users (user_id uuid pk, role viewer|admin, added_at) with RLS on, no policies, service_role only — in the migration and the versioned panel SQL', () => {
  assert.ok(MIG, 'migration supabase/migrations/20261021000000_admin_users.sql exists');
  for (const [label, src] of [['migration', MIG], ['supabase_admin_rpcs.sql', SQL]]) {
    assert.match(src, /create table if not exists public\.admin_users \(\s*user_id uuid primary key[^,]*,\s*role text not null check \(role in \('viewer', 'admin'\)\),\s*added_at timestamptz not null default now\(\)\s*\);/i, label);
    assert.match(src, /alter table public\.admin_users enable row level security;/i, label);
    assert.match(src, /revoke all on table public\.admin_users from public, anon, authenticated;/i, label);
    assert.match(src, /grant select on table public\.admin_users to service_role;/i, label);
    assert.ok(!/create policy[^;]*admin_users/i.test(src), label + ': no policies');
    assert.ok(!/grant [^;]*on table public\.admin_users to (anon|authenticated|public)/i.test(src), label);
  }
});

test('AU5 SQL: the migration adds the actor to admin_audit_log and admin_mark_test(p_emails, p_mark, p_actor) — the same body as the versioned SQL — granted to service_role only', () => {
  assert.match(MIG, /^begin;/im);
  assert.match(MIG, /^commit;/im);
  assert.match(MIG, /alter table public\.admin_audit_log add column if not exists actor uuid;/i);
  assert.match(MIG, /drop function if exists public\.admin_mark_test\(text\[\], boolean\);/i);
  const mig = fnBody(MIG, 'admin_mark_test');
  assert.equal(sqlNorm(mig), sqlNorm(fnBody(SQL, 'admin_mark_test')), 'one body in both files');
  assert.match(mig, /admin_mark_test\(p_emails text\[\], p_mark boolean, p_actor uuid\)/);
  assert.match(mig, /if p_actor is null then raise exception 'actor required'; end if;/);
  assert.match(mig, /insert into public\.admin_audit_log \(action, email, before, after, actor\) values \([^;]*p_actor\);/);
  for (const src of [MIG, SQL]) {
    assert.match(src, /revoke execute on function public\.admin_mark_test\(text\[\], boolean, uuid\) from public, anon, authenticated;/i);
    assert.match(src, /grant execute on function public\.admin_mark_test\(text\[\], boolean, uuid\) to service_role;/i);
  }
  // Adding the founder's account is a separate step with its own go: present only as a comment.
  assert.ok(!/^\s*insert into public\.admin_users/im.test(MIG), 'no live insert into admin_users in the migration');
  assert.match(MIG, /^-- insert into public\.admin_users \(user_id, role\) select id, 'admin' from auth\.users where lower\(email\) = 'hello@dosetrace\.io';/im);
});

// ------------------------------------------------------------------ AU6: the old door is gone
test('AU6: web/adm.html has no prompt( and no dt_adm_token; api/ no longer reads ADMIN_TOKEN; the token-prompt texts are gone', () => {
  assert.ok(!HTML.includes('prompt('), 'no prompt(');
  assert.ok(!HTML.includes('dt_adm_token'), 'no dt_adm_token');
  for (const f of fs.readdirSync(API_DIR).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(API_DIR, f), 'utf8');
    assert.ok(!src.includes('ADMIN_TOKEN'), f + ' must not read ADMIN_TOKEN');
  }
  for (const k of ['need_link', 'err_unauth']) assert.ok(!new RegExp('\\b' + k + ':').test(HTML), k + ' removed');
  assert.ok(!/admin token|token de administra|jeton d'administration|Admin-Token|token di amministrazione/i.test(HTML), 'no token wording left on the page');
});

test('AU6/AU4: no console.* anywhere in api/', () => {
  for (const f of fs.readdirSync(API_DIR).filter((x) => x.endsWith('.js'))) {
    assert.ok(!/console\./.test(fs.readFileSync(path.join(API_DIR, f), 'utf8')), f);
  }
});

// ------------------------------------------------------------------ page: the pure auth block, run as-is
function authPure() {
  const m = HTML.match(/\/\/ \[auth-pure-start\]([\s\S]*?)\/\/ \[auth-pure-end\]/);
  assert.ok(m, 'auth pure block present');
  return (0, eval)('(function(){' + m[1] + '\nreturn {makeAuth:makeAuth,jwtClaims:jwtClaims,sessionStartMs:sessionStartMs,lastTotpMs:lastTotpMs,sessionExpired:sessionExpired,needsStepUp:needsStepUp,authErrKey:authErrKey,ADM_SESSION_KEY:ADM_SESSION_KEY,ADM_MAX_AGE_MS:ADM_MAX_AGE_MS,ADM_STEP_UP_MS:ADM_STEP_UP_MS};})()');
}
const NOW = Date.parse('2026-10-21T12:00:00Z');
// A fake browser: sessionStorage, Supabase Auth (GoTrue REST) and /api/adm. Counts every request.
function pageEnv(o) {
  o = o || {};
  const P = authPure();
  const mem = new Map();
  if (o.saved) mem.set(P.ADM_SESSION_KEY, JSON.stringify(o.saved));
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const who = o.who || 'admin';
  const calls = [];
  const env = { now: o.now || NOW };
  const json = (b, s) => new Response(b == null ? null : JSON.stringify(b), { status: s || 200, headers: { 'Content-Type': 'application/json' } });
  const user = () => ({ id: F.USERS[who].id, email: F.USERS[who].email, factors: o.factors || [] });
  async function fetch(url, init) {
    const u = String(url);
    const method = (init && init.method) || 'GET';
    const headers = (init && init.headers) || {};
    calls.push({ url: u, method, headers, body: init && init.body ? JSON.parse(init.body) : null });
    if (o.offline) throw new TypeError('Failed to fetch');
    const A = F.SB + '/auth/v1';
    if (u === A + '/token?grant_type=password') {
      if (o.passwordStatus) return json({ error_code: 'x' }, o.passwordStatus);
      return json({ access_token: F.token(who, { aal: 'aal1', nowMs: env.now }), refresh_token: 'r1', expires_in: 3600, user: user() });
    }
    if (u === A + '/token?grant_type=refresh_token') {
      if (o.refreshStatus) return json({ error_code: 'refresh_token_not_found' }, o.refreshStatus);
      return json({ access_token: F.token(who, { nowMs: env.now, ageS: o.refreshAgeS || 600, totpS: o.refreshTotpS || 600 }), refresh_token: 'r3', expires_in: 3600, user: user() });
    }
    if (u === A + '/factors' && method === 'POST') return json({ id: 'f-new', type: 'totp', totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', secret: 'ABCDEFGHIJKLMNOP', uri: 'otpauth://totp/x' } });
    if (/\/factors\/[^/]+\/challenge$/.test(u)) return json({ id: 'ch-1', expires_at: Math.floor(env.now / 1000) + 300 });
    if (/\/factors\/[^/]+\/verify$/.test(u)) {
      if (o.verifyStatus) return json({ error_code: 'x' }, o.verifyStatus);
      const body = JSON.parse(init.body);
      if (body.code !== '123456') return json({ error_code: 'mfa_verification_failed' }, 422);
      return json({ access_token: F.token(who, { nowMs: env.now, totpS: 0, ageS: o.signInAgeS || 30 }), refresh_token: 'r2', expires_in: 3600, user: user() });
    }
    if (/\/factors\/[^/]+$/.test(u) && method === 'DELETE') return json({ id: u.split('/').pop() });
    if (u.startsWith(A + '/logout')) return json(null, 204);
    if (u === '/api/adm') {
      const tok = String(headers.Authorization || '').replace(/^Bearer /, '');
      const c = P.jwtClaims(tok);
      if (!F.USERS[who].role) return json({ error: 'Forbidden', code: 'not_allowed' }, 403);
      if (!c || c.aal !== 'aal2') return json({ error: 'Unauthorized', code: 'aal2_required' }, 401);
      if (o.api) return o.api(method, c, json);
      return json({ sources: {}, me: { role: F.USERS[who].role } });
    }
    return json({ error: 'unexpected ' + u }, 599);
  }
  const auth = P.makeAuth({ fetch, store, now: () => env.now, sbUrl: F.SB, anon: 'anon-key', api: '/api/adm' });
  return { P, auth, calls, mem, env, apiCalls: () => calls.filter((c) => c.url === '/api/adm') };
}
function savedSession(who, opts) {
  const o = opts || {};
  return { access_token: F.token(who, Object.assign({ nowMs: NOW }, o)), refresh_token: 'r0', expires_at: Math.floor(NOW / 1000) + (o.expiresIn == null ? 3000 : o.expiresIn), user: { id: F.USERS[who].id, email: F.USERS[who].email }, factor_id: 'f-1' };
}
const VERIFIED = [{ id: 'f-1', factor_type: 'totp', status: 'verified' }];

// ------------------------------------------------------------------ AU1: sign-in → code → panel; not authorised gets nothing
test('AU1 page: e-mail + password, then the TOTP code (aal2) — only then the panel; the session holds aal2', async () => {
  const e = pageEnv({ factors: VERIFIED });
  assert.deepEqual(await e.auth.start(), { screen: 'signin' });
  const s1 = await e.auth.signIn(' boss@x.y ', 'pw');
  assert.equal(s1.screen, 'code');
  assert.deepEqual(e.calls[0].body, { email: 'boss@x.y', password: 'pw' });
  assert.equal(e.calls[0].headers.apikey, 'anon-key', 'only the public anon key');
  assert.equal(e.mem.size, 0, 'the password-only (aal1) session is never stored');
  const bad = await e.auth.verify('000000');
  assert.equal(bad.error, 'li_err_code');
  const ok = await e.auth.verify('123 456');
  assert.equal(ok.screen, 'panel');
  const saved = JSON.parse(e.mem.get(e.P.ADM_SESSION_KEY));
  assert.equal(e.P.jwtClaims(saved.access_token).aal, 'aal2');
  assert.equal(saved.factor_id, 'f-1');
  const r = await e.auth.api('GET');
  assert.equal(r.status, 200);
});

test('AU1 page: an account not in admin_users sees "not authorised" right after the password step, is never offered TOTP setup, and makes 0 data requests after the refusal', async () => {
  const e = pageEnv({ who: 'stranger', factors: [] });
  const s = await e.auth.signIn('other@x.y', 'pw');
  assert.equal(s.screen, 'noauth');
  assert.equal(e.auth.email(), 'other@x.y');
  const after = e.calls.length;
  assert.equal(e.apiCalls().length, 1, 'one refused allow-list check');
  assert.ok(!e.calls.some((c) => /\/factors/.test(c.url)), 'no MFA enrolment on a non-admin account');
  assert.equal(e.mem.size, 0, 'nothing stored');
  const r = await e.auth.api('GET');
  assert.ok(r.expired, 'no session → no request');
  assert.equal(e.calls.length, after, '0 requests after the refusal');
  await e.auth.signOut();
  assert.ok(e.calls[e.calls.length - 1].url.startsWith(F.SB + '/auth/v1/logout'));
});

test('AU1 page: an allow-listed account that later loses access gets "not authorised" from the panel load (403) and no data', async () => {
  const e = pageEnv({ saved: savedSession('admin'), api: (m, c, json) => json({ error: 'Forbidden', code: 'not_allowed' }, 403) });
  assert.equal((await e.auth.start()).screen, 'panel');
  const r = await e.auth.api('GET');
  assert.ok(r.noauth);
});

test('AU1 page (first-time setup): an allow-listed account with no TOTP factor gets the setup screen (QR + manual key) after the password; leftover unfinished factors are removed first', async () => {
  const e = pageEnv({ factors: [{ id: 'f-old', factor_type: 'totp', status: 'unverified' }] });
  const s = await e.auth.signIn('boss@x.y', 'pw');
  assert.equal(s.screen, 'enrol');
  const en = await e.auth.enrol();
  assert.equal(en.screen, 'enrol');
  assert.equal(en.secret, 'ABCDEFGHIJKLMNOP');
  assert.match(en.qr, /^<svg/);
  const i = e.calls.findIndex((c) => c.method === 'DELETE' && c.url.endsWith('/factors/f-old'));
  const j = e.calls.findIndex((c) => c.method === 'POST' && c.url.endsWith('/auth/v1/factors'));
  assert.ok(i >= 0 && j > i, 'unfinished factor removed, then one new TOTP factor');
  assert.equal(e.calls[j].body.factor_type, 'totp');
  const ok = await e.auth.verify('123456');
  assert.equal(ok.screen, 'panel');
  assert.equal(JSON.parse(e.mem.get(e.P.ADM_SESSION_KEY)).factor_id, 'f-new');
});

test('AU1 page: an account with a verified factor never sees the setup screen again', async () => {
  const e = pageEnv({ factors: VERIFIED.concat([{ id: 'f-x', factor_type: 'totp', status: 'unverified' }]) });
  assert.equal((await e.auth.signIn('boss@x.y', 'pw')).screen, 'code');
  assert.ok(!e.calls.some((c) => c.method === 'POST' && c.url.endsWith('/auth/v1/factors')));
});

test('AU9 errors: wrong e-mail or password, wrong or expired code, too many attempts, no connection map to their own messages', async () => {
  assert.equal((await pageEnv({ passwordStatus: 400 }).auth.signIn('a', 'b')).error, 'li_err_creds');
  assert.equal((await pageEnv({ passwordStatus: 429 }).auth.signIn('a', 'b')).error, 'li_err_many');
  assert.equal((await pageEnv({ offline: true }).auth.signIn('a', 'b')).error, 'li_err_conn');
  const e = pageEnv({ factors: VERIFIED, verifyStatus: 429 });
  await e.auth.signIn('a', 'b');
  assert.equal((await e.auth.verify('123456')).error, 'li_err_many');
  const e2 = pageEnv({ factors: VERIFIED });
  await e2.auth.signIn('a', 'b');
  assert.equal((await e2.auth.verify('12')).error, 'li_err_code', 'not 6 digits: refused without a request');
  assert.ok(!e2.calls.some((c) => /verify$/.test(c.url)));
});

// ------------------------------------------------------------------ AU8: session storage and age (page)
test('AU8 page: a stored session older than 12 h → "session expired" with 0 requests, and the stored session is removed', async () => {
  const e = pageEnv({ saved: savedSession('admin', { ageS: 12 * 3600 + 30 }) });
  assert.deepEqual(await e.auth.start(), { screen: 'expired' });
  assert.equal(e.calls.length, 0);
  assert.equal(e.mem.size, 0);
});

test('AU8 page: passing 12 h while the panel is open → the next load is "expired" without a request', async () => {
  const e = pageEnv({ saved: savedSession('admin', { ageS: 11 * 3600 }) });
  assert.equal((await e.auth.start()).screen, 'panel');
  assert.equal(e.auth.expiredNow(), false);
  e.env.now += 2 * 3600 * 1000;
  assert.equal(e.auth.expiredNow(), true);
  const r = await e.auth.api('GET');
  assert.ok(r.expired);
  assert.equal(e.apiCalls().length, 0);
  assert.equal(e.mem.size, 0);
});

test('AU8 page: a refused refresh → "session expired"; a network blip does not throw the session away', async () => {
  const e = pageEnv({ saved: savedSession('admin', { expiresIn: 10 }), refreshStatus: 400 });
  await e.auth.start();
  const r = await e.auth.api('GET');
  assert.ok(r.expired);
  assert.equal(e.apiCalls().length, 0);
  assert.equal(e.mem.size, 0);
  const e2 = pageEnv({ saved: savedSession('admin', { expiresIn: 10 }), offline: true });
  await e2.auth.start();
  const r2 = await e2.auth.api('GET');
  assert.equal(r2.status, 0);
  assert.equal(e2.mem.size, 1, 'kept');
});

test('AU8 page: a 401 from the server (expired or revoked) clears the session and shows "expired"', async () => {
  const e = pageEnv({ saved: savedSession('admin'), api: (m, c, json) => json({ error: 'Unauthorized', code: 'session_expired' }, 401) });
  await e.auth.start();
  const r = await e.auth.api('GET');
  assert.ok(r.expired);
  assert.equal(e.mem.size, 0);
});

test('AU8 page: sign-out removes the stored session and ends it at Supabase', async () => {
  const e = pageEnv({ saved: savedSession('admin') });
  await e.auth.start();
  await e.auth.signOut();
  assert.equal(e.mem.size, 0);
  const last = e.calls[e.calls.length - 1];
  assert.ok(last.url.startsWith(F.SB + '/auth/v1/logout'));
  assert.match(last.headers.Authorization, /^Bearer /);
});

test('AU8 static: the session lives in sessionStorage only — localStorage holds only language, theme and tab; nothing in the URL', () => {
  assert.match(HTML, /ADM_STORE=window\.sessionStorage;/);
  assert.match(HTML, /var AUTH=makeAuth\(\{[^\n]*store:ADM_STORE[^\n]*\}\);/);
  const lsKeys = [...HTML.matchAll(/localStorage\.setItem\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(lsKeys)].sort(), ['dt_adm_lang', 'dt_adm_tab', 'dt_adm_theme']);
  assert.ok(!/localStorage[^;]*(session|token)/i.test(HTML.replace(/sessionStorage/g, '')), 'no session in localStorage');
  assert.match(HTML, /history\.replaceState\(null,'',location\.pathname\)/, 'query and hash are stripped');
  assert.ok(!/[?&](access_token|refresh_token)=/.test(HTML));
  assert.match(HTML, /setInterval\(function\(\)\{if\(AUTH\.expiredNow\(\)\)/, 'an open panel turns into "expired" at 12 h');
});

// ------------------------------------------------------------------ AU3: step-up (page)
test('AU3 page: after 15 min since the last code a write needs the step-up; the step-up verifies the stored factor and refreshes the session', async () => {
  const e = pageEnv({ saved: savedSession('admin', { totpS: 16 * 60 }) });
  await e.auth.start();
  assert.equal(e.auth.needsStepUp(), true);
  const bad = await e.auth.stepUp('111111');
  assert.equal(bad.error, 'li_err_code');
  const ok = await e.auth.stepUp('123456');
  assert.ok(ok.ok);
  assert.ok(e.calls.some((c) => c.url.endsWith('/factors/f-1/challenge')));
  assert.equal(e.auth.needsStepUp(), false);
  const fresh = pageEnv({ saved: savedSession('admin', { totpS: 14 * 60 }) });
  await fresh.auth.start();
  assert.equal(fresh.auth.needsStepUp(), false);
});

test('AU3 page: when the server answers 401 step_up_required the page asks for the code and keeps the session', async () => {
  const e = pageEnv({ saved: savedSession('admin'), api: (m, c, json) => json({ error: 'Unauthorized', code: 'step_up_required' }, 401) });
  await e.auth.start();
  const r = await e.auth.api('POST', { action: 'mark_test', emails: ['a@x.y'] });
  assert.ok(r.stepUp);
  assert.equal(e.mem.size, 1);
});

test('AU3 static: the test-marking write checks the step-up first, opens the step-up dialog, and retries once after a fresh code', () => {
  const m = HTML.match(/window\.markTests=function[\s\S]*?\n  \};/);
  assert.ok(m);
  assert.match(m[0], /AUTH\.needsStepUp\(\)/);
  assert.match(m[0], /openStepUp\(/);
  assert.match(m[0], /\.stepUp/);
  assert.match(HTML, /id="stepup"/);
});

// ------------------------------------------------------------------ AU7: no project-wide Auth change
test('AU7 static: the panel calls only the user-level Supabase Auth endpoints (sign-in, refresh, MFA factors, sign-out) — no admin or project settings API anywhere', () => {
  const pure = HTML.match(/\/\/ \[auth-pure-start\]([\s\S]*?)\/\/ \[auth-pure-end\]/)[1];
  const paths = [...pure.matchAll(/gt\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(paths.length >= 5);
  for (const p of paths) assert.ok(['/factors', '/factors/', '/logout?scope=local', '/token?grant_type=password', '/token?grant_type=refresh_token'].includes(p), 'unexpected auth path ' + p);
  const all = [HTML, MIG].concat(fs.readdirSync(API_DIR).filter((x) => x.endsWith('.js')).map((f) => fs.readFileSync(path.join(API_DIR, f), 'utf8'))).join('\n');
  assert.ok(!/api\.supabase\.com/.test(all), 'no Management API');
  assert.ok(!/\/auth\/v1\/admin/.test(all), 'no GoTrue admin API');
  assert.ok(!/(alter|update|insert into|delete from)\s+auth\./i.test(MIG), 'the migration does not change the auth schema');
});

// ------------------------------------------------------------------ page config: public anon key only
test('3.1 design: the page uses only the public anon key (the same one the app ships), never a service key', () => {
  const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));
  const prod = eas.build.production.env;
  const url = HTML.match(/var SB_URL='([^']+)'/);
  const key = HTML.match(/var SB_ANON='([^']+)'/);
  assert.ok(url && key);
  assert.equal(url[1], prod.EXPO_PUBLIC_SUPABASE_URL);
  assert.equal(key[1], prod.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  for (const jwt of HTML.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []) {
    assert.equal(JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')).role, 'anon');
  }
});

test('3.1 design: /adm is served with a Content-Security-Policy, no-store, no framing and no referrer', () => {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const host = HTML.match(/var SB_URL='([^']+)'/)[1];
  for (const src of ['/adm', '/adm.html']) {
    const h = v.headers.find((x) => x.source === src);
    assert.ok(h, src);
    const get = (k) => (h.headers.find((x) => x.key === k) || {}).value || '';
    assert.match(get('Cache-Control'), /no-store/);
    const csp = get('Content-Security-Policy');
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, new RegExp("connect-src 'self' " + host.replace(/\./g, '\\.') + '(;|$)'));
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/cdnjs\.cloudflare\.com(;|$)/);
    assert.match(csp, /img-src 'self' data:/);
    assert.equal(get('Referrer-Policy'), 'no-referrer');
    assert.equal(get('X-Frame-Options'), 'DENY');
  }
});

// ------------------------------------------------------------------ AU9: labels (6 languages), tokens only
function pageT() {
  const script = HTML.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  const tm = script.match(/var T=(\{[\s\S]*?\n  \});/);
  return (0, eval)('(' + tm[1] + ')');
}
const LOGIN_KEYS = ['li_signin_title', 'li_signin_sub', 'li_email', 'li_email_ph', 'li_password', 'li_continue', 'li_fine', 'li_code_title', 'li_code_sub', 'li_code', 'li_verify', 'li_back',
  'li_enrol_title', 'li_enrol_sub', 'li_enrol_key', 'li_enrol_on', 'li_qr_alt', 'li_err_creds', 'li_err_code', 'li_err_many', 'li_err_conn', 'li_noauth_title', 'li_noauth_sub', 'li_signed_as',
  'li_signout', 'li_exp_title', 'li_exp_sub', 'li_exp_again', 'li_step_title', 'li_step_sub', 'btn_confirm', 'btn_cancel', 'err_notconf'];
test('AU9: every login label exists in all 6 languages (parity), and Portuguese is the approved, formal copy of the picture', () => {
  const T = pageT();
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of LOGIN_KEYS) assert.ok(T[l][k], l + ' ' + k);
  const PT = {
    li_signin_title: 'Entrar', li_signin_sub: 'Acesso restrito a contas autorizadas.', li_email: 'E-mail', li_password: 'Senha', li_continue: 'Continuar',
    li_fine: 'A sessão termina ao fechar a aba ou após 12 horas.', li_code_title: 'Código de verificação', li_code_sub: 'Digite o código de 6 dígitos do seu aplicativo autenticador.',
    li_code: 'Código', li_verify: 'Verificar', li_back: 'Voltar', li_enrol_title: 'Ative a verificação em duas etapas',
    li_enrol_sub: 'Leia o código QR com o aplicativo autenticador e digite o código de 6 dígitos.', li_enrol_key: 'Não consegue ler? Digite esta chave:', li_enrol_on: 'Ativar',
    li_err_creds: 'E-mail ou senha incorretos.', li_err_code: 'Código incorreto ou expirado. Tente novamente.', li_err_many: 'Muitas tentativas. Aguarde 5 minutos e tente novamente.',
    li_err_conn: 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.', li_noauth_title: 'Esta conta não tem acesso ao painel',
    li_noauth_sub: 'Nenhum dado foi carregado. Entre com uma conta autorizada.', li_signed_as: 'Conectado como', li_signout: 'Sair', li_exp_title: 'Sua sessão expirou',
    li_exp_sub: 'Por segurança, entre novamente. Nada foi alterado.', li_exp_again: 'Entrar novamente', li_step_title: 'Confirme o código para continuar',
    li_step_sub: 'Alterações pedem um código novo quando a última verificação tem mais de 15 minutos.', btn_confirm: 'Confirmar', btn_cancel: 'Cancelar',
  };
  for (const k of Object.keys(PT)) assert.equal(T.pt[k], PT[k], 'pt ' + k);
  const EN = { li_signin_title: 'Sign in', li_err_creds: 'Incorrect email or password.', li_exp_title: 'Your session has expired', li_step_title: 'Confirm your code to continue' };
  for (const k of Object.keys(EN)) assert.equal(T.en[k], EN[k], 'en ' + k);
  assert.equal(T.de.li_err_many, 'Zu viele Versuche. Bitte warten Sie 5 Minuten und versuchen Sie es erneut.');
  assert.equal(T.fr.li_noauth_title, "Ce compte n'a pas accès au panneau");
  assert.equal(T.es.li_exp_again, 'Iniciar sesión de nuevo');
  assert.equal(T.it.li_code_sub, 'Inserisci il codice a 6 cifre della tua app di autenticazione.');
  for (const v of LOGIN_KEYS.map((k) => T.pt[k])) assert.ok(!/\bNão deu\b|\bdá para\b|\ba gente\b/.test(v), 'formal pt: ' + v);
});

test('AU9: the login styles use the panel tokens only (no raw colours); the QR backing is a token defined in both themes', () => {
  const css = HTML.match(/\/\* \[login-css-start\] \*\/([\s\S]*?)\/\* \[login-css-end\] \*\//);
  assert.ok(css, 'login css block');
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|\bwhite\b|\bblack\b/i.test(css[1]), 'tokens only');
  const roots = HTML.match(/:root\{[\s\S]*?\}\s*:root\[data-theme="light"\]\{[\s\S]*?\}/)[0];
  assert.equal((roots.match(/--qrbg:/g) || []).length, 2, '--qrbg in dark and light');
  for (const id of ['li-email', 'li-password', 'li-code', 'stepup']) assert.ok(HTML.includes('id="' + id + '"') || HTML.includes("id=\"" + id + "\""), id);
});
