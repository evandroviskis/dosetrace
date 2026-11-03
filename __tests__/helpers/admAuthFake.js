'use strict';
// Test double for the admin panel login (docs/specs/admin-panel.md Phase 3 › 3.1).
// A fake Supabase: /auth/v1/user accepts only tokens minted here (signature "fake-sig"),
// /rest/v1/admin_users answers from USERS, every other URL is a data call answered by
// `data(url, body)`. Dummy ids and emails only — never a real token, key or account.
const SB = 'https://dummy.supabase.test';

const USERS = {
  admin: { id: '11111111-1111-4111-8111-111111111111', email: 'boss@x.y', role: 'admin' },
  viewer: { id: '22222222-2222-4222-8222-222222222222', email: 'look@x.y', role: 'viewer' },
  stranger: { id: '33333333-3333-4333-8333-333333333333', email: 'other@x.y', role: null },
};

function b64u(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }

// opts: aal ('aal2'), ageS (seconds since the password sign-in), totpS (seconds since the last TOTP check),
// sub (override the subject), noAmr.
function token(who, opts) {
  const o = opts || {};
  const u = USERS[who] || { id: who };
  const now = Math.floor((o.nowMs || Date.now()) / 1000);
  const amr = [{ method: 'password', timestamp: now - (o.ageS == null ? 60 : o.ageS) }];
  if ((o.aal || 'aal2') === 'aal2') amr.unshift({ method: 'totp', timestamp: now - (o.totpS == null ? 60 : o.totpS) });
  const claims = { sub: o.sub || u.id, email: u.email, role: 'authenticated', aal: o.aal || 'aal2', session_id: 'sess-' + who, exp: now + 3600, iat: now };
  if (!o.noAmr) claims.amr = amr;
  return b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u(claims) + '.fake-sig';
}

// Phase 4 (DT Admin app, founder 2026-11-02): registered devices. The header is "<id>.<secret>";
// the table stores sha256(secret) as hex. Dummy ids and secrets only.
const crypto = require('crypto');
const DEVICE_SECRETS = { s25: 'dummy-device-secret-s25-0123456789abcdef', fold: 'dummy-device-secret-fold-0123456789abcdef', dead: 'dummy-device-secret-dead-0123456789abcdef', lookers: 'dummy-device-secret-viewer-0123456789abcdef' };
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const DEVICES = {
  s25: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', user: 'admin', key_hash: sha256(DEVICE_SECRETS.s25), revoked_at: null },
  fold: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', user: 'admin', key_hash: sha256(DEVICE_SECRETS.fold), revoked_at: null },
  dead: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', user: 'admin', key_hash: sha256(DEVICE_SECRETS.dead), revoked_at: '2026-11-01T00:00:00Z' },
  lookers: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', user: 'viewer', key_hash: sha256(DEVICE_SECRETS.lookers), revoked_at: null },
};
// The header value a registered device sends; `secret` overrides the real one (wrong key tests).
function deviceHeader(name, secret) { return { 'x-dt-device': DEVICES[name].id + '.' + (secret == null ? DEVICE_SECRETS[name] : secret) }; }

function json(o, status) { return new Response(JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json' } }); }

// The fake Supabase Auth + allow-list answer for a URL, or null when the URL is not an auth call.
function authAnswer(u, headers, o) {
  o = o || {};
  if (u === SB + '/auth/v1/user') {
    if (o.authDown) throw new Error('network down');
    const tok = String(headers.Authorization || headers.authorization || '').replace(/^Bearer /, '');
    const parts = tok.split('.');
    if (parts.length !== 3 || parts[2] !== 'fake-sig') return json({ code: 401, msg: 'invalid JWT' }, 401);
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return json({ id: o.userIdOverride || claims.sub, email: claims.email, aud: 'authenticated' });
  }
  if (u.startsWith(SB + '/rest/v1/admin_users')) {
    if (o.allowListDown) return json({ message: 'relation does not exist' }, 404);
    const m = u.match(/user_id=eq\.([0-9a-f-]+)/i);
    const hit = Object.values(USERS).find((x) => m && x.id === m[1] && x.role);
    return json(hit ? [{ role: hit.role }] : []);
  }
  if (u.startsWith(SB + '/rest/v1/admin_devices')) {
    if (o.devicesDown) return json({ message: 'relation does not exist' }, 404);
    if (o._patch) return new Response(null, { status: 204 });
    const m = u.match(/id=eq\.([0-9a-f-]+)/i);
    const hit = Object.values(DEVICES).find((d) => m && d.id === m[1]);
    return json(hit ? [{ id: hit.id, user_id: USERS[hit.user].id, key_hash: hit.key_hash, revoked_at: hit.revoked_at }] : []);
  }
  return null;
}

// Wraps a test's own fake fetch so the session checks pass through the fake Supabase Auth first;
// the wrapped fetch only sees the data calls.
function withAuth(next, o) {
  return async (url, init) => authAnswer(String(url), (init && init.headers) || {}, o) || next(url, init);
}

// Installs a fake global fetch. Returns { calls, restore, dataCalls() }.
function installFetch(opts) {
  const o = opts || {};
  const real = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    const u = String(url);
    const headers = (init && init.headers) || {};
    let body = null;
    if (init && init.body) { try { body = JSON.parse(init.body); } catch (e) { body = init.body; } }
    calls.push({ url: u, method: (init && init.method) || 'GET', headers, body });
    const method = String((init && init.method) || 'GET').toUpperCase();
    const auth = authAnswer(u, headers, Object.assign({}, o, { _patch: method === 'PATCH' && u.startsWith(SB + '/rest/v1/admin_devices') }));
    if (auth) return auth;
    if (o.data) return o.data(u, body, init || {});
    return json({});
  };
  return {
    calls,
    restore() { global.fetch = real; },
    dataCalls() { return calls.filter((c) => !(c.url === SB + '/auth/v1/user' || c.url.startsWith(SB + '/rest/v1/admin_users') || c.url.startsWith(SB + '/rest/v1/admin_devices') || c.url.startsWith(SB + '/rest/v1/admin_annotations'))); }, // admin tables are not data RPCs
    deviceCalls() { return calls.filter((c) => c.url.startsWith(SB + '/rest/v1/admin_devices')); },
  };
}

function mkRes() {
  const r = { code: 0, body: '', headers: {} };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = JSON.stringify(b); return r; };
  r.send = (b) => { r.body = String(b); return r; };
  r.end = (b) => { if (b) r.body = String(b); return r; };
  return r;
}

function envOn() {
  process.env.SUPABASE_URL = SB;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-key';
}
function envOff() {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// One request through a handler with the fake Supabase. req: { method, url, headers, body }.
async function call(handler, req, opts) {
  const f = installFetch(opts);
  const res = mkRes();
  try {
    const url = req.url || '/api/adm';
    const query = {};
    new URL(url, 'http://x').searchParams.forEach((v, k) => { query[k] = v; });
    await handler({ method: req.method || 'GET', url, headers: req.headers || {}, query, cookies: {}, body: req.body }, res);
    return { res, code: res.code, body: res.body, json: res.body ? JSON.parse(res.body) : null, headers: res.headers, calls: f.calls, dataCalls: f.dataCalls(), deviceCalls: f.deviceCalls() };
  } finally { f.restore(); }
}

const ORIGIN = { origin: 'https://dosetrace.io' };
function bearer(who, opts) { return { authorization: 'Bearer ' + token(who, opts) }; }

module.exports = { authAnswer, withAuth, SB, USERS, DEVICES, DEVICE_SECRETS, deviceHeader, sha256, token, bearer, installFetch, mkRes, envOn, envOff, call, ORIGIN, json };
