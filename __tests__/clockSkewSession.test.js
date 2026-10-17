'use strict';
// A-137 + A-140 (docs/specs/clock-skew-session-plan.md, CS-1…CS-16). Real GoTrueClient /
// createClient from the installed @supabase packages, with a fake Supabase whose clock is the real
// one while the DEVICE clock (Date.now, what auth-js reads) is moved.
//   A-137: the server's expires_at (server epoch) read against a clock 19 h ahead makes every new
//   session look expired → each serialised getSession() refreshes again (a storm) → 429 → the 429
//   is non-retryable → _removeSession → SIGNED_OUT.
//   A-140: offline cold start with an expired token: each getSession() retries ~25 s, then answers
//   no session → the sign-in screen.
// lib/authFetch (the client's global fetch) fixes both without patching auth-js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GoTrueClient } = require('@supabase/auth-js');
const { createClient } = require('@supabase/supabase-js');
const { createAuthFetch, recoveryCall, STAND_IN_SECONDS } = require('../lib/authFetch');

const H = 3600 * 1000;
const realNow = Date.now.bind(Date);
const KEY = 'sb-x-auth-token';
const URL_ = 'https://x.supabase.co';

// The device clock: auth-js reads Date.now(); the fake server keeps the real clock.
function setDeviceSkew(ms) { Date.now = () => realNow() + ms; }
test.afterEach(() => { Date.now = realNow; });

function memStorage(seed) {
  const mem = { ...seed };
  return { mem, getItem: async (k) => mem[k] ?? null, setItem: async (k, v) => { mem[k] = v; }, removeItem: async (k) => { delete mem[k]; } };
}

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

// A session as GoTrue issues it: expires_at in SERVER epoch seconds.
function serverSession(n) {
  const s = Math.round(realNow() / 1000);
  return { access_token: `at${n}`, refresh_token: `rt${n}`, token_type: 'bearer', expires_in: 3600, expires_at: s + 3600, user: { id: 'u1', aud: 'authenticated', email: 't@x.io' } };
}

// The fake Supabase. mode: 'ok' | '429' | 'invalid_grant' | 'offline' | '503'.
function fakeServer(mode = 'ok') {
  const s = { mode, refreshPosts: 0, restCalls: 0, n: 1, calls: [] };
  s.fetch = async (input, init) => {
    const u = String(input && input.url ? input.url : input);
    s.calls.push(u);
    if (s.mode === 'offline') throw new TypeError('Network request failed');
    if (/\/auth\/v1\/token\?grant_type=refresh_token/.test(u)) {
      s.refreshPosts += 1;
      if (s.mode === '429') return json({ code: 'over_request_rate_limit', message: 'Request rate limit reached' }, 429);
      if (s.mode === '503') return json({ message: 'unavailable' }, 503);
      if (s.mode === 'invalid_grant') return json({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' }, 400);
      s.n += 1;
      return json(serverSession(s.n));
    }
    if (/\/rest\/v1\//.test(u)) { s.restCalls += 1; return s.rest ? s.rest(u, init) : json([]); }
    return json({}, 404);
  };
  return s;
}

// Monotonic test clock for the breaker windows.
function monoClock() { let t = 1e6; return { now: () => t, add: (ms) => { t += ms; }, set: (v) => { t = v; } }; }

function client({ server, wrap = true, seed, af }) {
  const st = memStorage(seed === undefined ? { [KEY]: JSON.stringify(serverSession(1)) } : seed);
  const mono = monoClock();
  const auth = af || (wrap ? createAuthFetch({ fetch: server.fetch, readStoredSession: () => st.getItem(KEY), now: mono.now }) : null);
  const c = new GoTrueClient({ url: `${URL_}/auth/v1`, storageKey: KEY, storage: st, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, fetch: auth ? auth.fetch : server.fetch });
  const events = [];
  c.onAuthStateChange((e) => { events.push(e); });
  return { c, st, mono, auth, events };
}

async function burst(c, n = 30) {
  const res = await Promise.all(Array.from({ length: n }, () => c.getSession()));
  return res.filter((r) => !r.data.session).length;
}

// ── The risk, reproduced on the unwrapped client (stays as the reason this module exists) ──
test('A-137 risk: unwrapped, device +19 h → 30 getSession() = a refresh storm', async () => {
  setDeviceSkew(19 * H);
  const server = fakeServer('ok');
  const { c } = client({ server, wrap: false });
  await c.initialize();
  await burst(c);
  assert.ok(server.refreshPosts >= 10, `storm: ${server.refreshPosts} POSTs`);
});

test('A-137 risk: unwrapped, a 429 on refresh removes the session and emits SIGNED_OUT', async () => {
  setDeviceSkew(19 * H);
  const server = fakeServer('429');
  const { c, st, events } = client({ server, wrap: false });
  await c.initialize();
  await burst(c, 5);
  assert.ok(events.includes('SIGNED_OUT'));
  assert.equal(st.mem[KEY], undefined);
});

// ── T1 / CS-1: device ahead → at most one refresh ──
test('T1 CS-1: device +19 h, 30 concurrent getSession() → at most 1 refresh POST, no null session', async () => {
  setDeviceSkew(19 * H);
  const server = fakeServer('ok');
  const { c, events } = client({ server });
  await c.initialize();
  const nulls = await burst(c);
  assert.ok(server.refreshPosts <= 1, `${server.refreshPosts} POSTs`);
  assert.equal(nulls, 0);
  assert.ok(!events.includes('SIGNED_OUT'));
  // And again later in the same open: the saved session is valid on the device's clock.
  await burst(c);
  assert.ok(server.refreshPosts <= 1);
});

// ── T2 / CS-2: 429 never signs out ──
test('T2 CS-2: the server answers 429 → no SIGNED_OUT, the stored session kept, 0 null sessions', async () => {
  setDeviceSkew(19 * H);
  const server = fakeServer('429');
  const { c, st, events } = client({ server });
  await c.initialize();
  const before = JSON.parse(st.mem[KEY]);
  const nulls = await burst(c);
  assert.equal(nulls, 0);
  assert.ok(!events.includes('SIGNED_OUT'));
  const after = JSON.parse(st.mem[KEY]);
  assert.equal(after.refresh_token, before.refresh_token, 'same tokens kept');
  assert.equal(after.access_token, before.access_token);
  assert.equal(server.refreshPosts, 1, 'one POST, then off the network');
});

// ── T3 / CS-1: other skews ──
for (const [label, skew, max] of [['+2 h', 2 * H, 1], ['-2 h', -2 * H, 0], ['no skew', 0, 0], ['+24 h', 24 * H, 1], ['-24 h', -24 * H, 0]]) {
  test(`T3 CS-1: device ${label} → at most ${max} refresh POST(s)`, async () => {
    setDeviceSkew(skew);
    const server = fakeServer('ok');
    const { c } = client({ server });
    await c.initialize();
    assert.equal(await burst(c), 0);
    assert.ok(server.refreshPosts <= max, `${server.refreshPosts} POSTs`);
  });
}

test('T3 CS-10: an old stored session (build 49, server-epoch expiry, 2 h past) → one refresh, then quiet', async () => {
  const s = serverSession(1);
  s.expires_at -= 2 * 3600;
  const server = fakeServer('ok');
  const { c, events } = client({ server, seed: { [KEY]: JSON.stringify(s) } });
  await c.initialize();
  assert.equal(await burst(c), 0);
  assert.equal(server.refreshPosts, 1);
  assert.ok(!events.includes('SIGNED_OUT'));
});

// ── T4 / CS-3: the breaker ──
test('T4 CS-3: without the device-clock expiry, the breaker still caps the storm at 3 POSTs per 60 s', async () => {
  setDeviceSkew(19 * H);
  const server = fakeServer('ok');
  const st = memStorage({ [KEY]: JSON.stringify(serverSession(1)) });
  const mono = monoClock();
  const af = createAuthFetch({ fetch: server.fetch, readStoredSession: () => st.getItem(KEY), now: mono.now, deviceExpiry: false });
  const c = new GoTrueClient({ url: `${URL_}/auth/v1`, storageKey: KEY, storage: st, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, fetch: af.fetch });
  await c.initialize();
  assert.equal(await burst(c), 0);
  assert.ok(server.refreshPosts <= 3, `${server.refreshPosts} POSTs`);
});

function refreshReq(rt) {
  return [`${URL_}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }) }];
}

test('T4 CS-3: direct — 10 refreshes in a minute reach the network 3 times; after 60 s the budget is back', async () => {
  const server = fakeServer('ok');
  const stored = serverSession(1);
  const mono = monoClock();
  const af = createAuthFetch({ fetch: server.fetch, readStoredSession: async () => JSON.stringify(stored), now: mono.now });
  for (let i = 0; i < 10; i++) { const r = await af.fetch(...refreshReq('rt1')); assert.equal(r.status, 200); }
  assert.equal(server.refreshPosts, 3);
  mono.add(60 * 1000);
  await af.fetch(...refreshReq('rt1'));
  assert.equal(server.refreshPosts, 4);
});

test('T4 CS-2/3: after a 429 nothing goes to the network for 60 s; the answer is the stored session', async () => {
  const server = fakeServer('429');
  const stored = serverSession(1);
  const mono = monoClock();
  const af = createAuthFetch({ fetch: server.fetch, readStoredSession: async () => JSON.stringify(stored), now: mono.now });
  const r1 = await af.fetch(...refreshReq('rt1'));
  assert.equal(r1.status, 200);
  const body = await r1.json();
  assert.equal(body.refresh_token, 'rt1');
  assert.equal(body.access_token, 'at1');
  assert.equal(body.expires_in, STAND_IN_SECONDS);
  server.mode = 'ok';
  mono.add(59 * 1000);
  await af.fetch(...refreshReq('rt1'));
  assert.equal(server.refreshPosts, 1, 'held off the network');
  mono.add(2 * 1000);
  await af.fetch(...refreshReq('rt1'));
  assert.equal(server.refreshPosts, 2, 'back after 60 s');
});

test('T4: a clock that runs backwards never holds the breaker shut for longer than 60 s of its own time', async () => {
  const server = fakeServer('429');
  const stored = serverSession(1);
  const mono = monoClock();
  const af = createAuthFetch({ fetch: server.fetch, readStoredSession: async () => JSON.stringify(stored), now: mono.now });
  await af.fetch(...refreshReq('rt1'));
  server.mode = 'ok';
  mono.add(-2 * H); // the reference clock jumped back
  await af.fetch(...refreshReq('rt1'));
  assert.equal(server.refreshPosts, 2, 'a negative gap counts as elapsed');
});

test('T4: a refresh token that is not the stored one is never answered with the stored session', async () => {
  const server = fakeServer('429');
  const af = createAuthFetch({ fetch: server.fetch, readStoredSession: async () => JSON.stringify(serverSession(1)), now: monoClock().now });
  const r = await af.fetch(...refreshReq('someone-else'));
  assert.equal(r.status, 429, 'passed through');
  const none = createAuthFetch({ fetch: server.fetch, readStoredSession: async () => null, now: monoClock().now });
  assert.equal((await none.fetch(...refreshReq('rt1'))).status, 429);
});

// ── T5 / CS-4: revocation unchanged ──
test('T5 CS-4: a 400 invalid_grant still removes the session and emits SIGNED_OUT', async () => {
  const s = serverSession(1);
  s.expires_at -= 2 * 3600;
  const server = fakeServer('invalid_grant');
  const { c, st, events } = client({ server, seed: { [KEY]: JSON.stringify(s) } });
  await c.initialize();
  const { data } = await c.getSession();
  assert.equal(data.session, null);
  assert.ok(events.includes('SIGNED_OUT'));
  assert.equal(st.mem[KEY], undefined);
});

// ── T6: pass-through ──
test('T6: rest/functions responses and auth error responses are passed through untouched', async () => {
  const resps = {
    rest: json([{ id: 1 }]),
    fn: json({ ok: 1 }),
    authErr: json({ error: 'invalid_grant' }, 400),
    authText: new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    other: json({ a: 1 }),
  };
  const base = async (u) => {
    u = String(u);
    if (u.includes('/rest/v1/')) return resps.rest;
    if (u.includes('/functions/v1/')) return resps.fn;
    if (u.includes('/auth/v1/logout')) return resps.authText;
    if (u.includes('/auth/v1/')) return resps.authErr;
    return resps.other;
  };
  const af = createAuthFetch({ fetch: base, readStoredSession: async () => null, now: monoClock().now });
  assert.equal(await af.fetch(`${URL_}/rest/v1/doses?select=*`), resps.rest);
  assert.equal(await af.fetch(`${URL_}/functions/v1/scan`, { method: 'POST' }), resps.fn);
  assert.equal(await af.fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', body: '{}' }), resps.authErr);
  assert.equal(await af.fetch(`${URL_}/auth/v1/logout`, { method: 'POST' }), resps.authText);
  assert.equal(await af.fetch('https://example.com/x'), resps.other);
});

test('T6 CS-1: a sign-in response gets its expiry on the device clock (expires_in kept)', async () => {
  setDeviceSkew(19 * H);
  const issued = serverSession(7);
  const af = createAuthFetch({ fetch: async () => json(issued), readStoredSession: async () => null, now: monoClock().now });
  const r = await af.fetch(`${URL_}/auth/v1/token?grant_type=id_token`, { method: 'POST', body: '{}' });
  const b = await r.json();
  assert.equal(b.expires_in, 3600);
  assert.ok(Math.abs(b.expires_at - (Math.round(Date.now() / 1000) + 3600)) <= 1, 'device now + expires_in');
  assert.equal(b.access_token, 'at7');
  assert.equal(r.status, 200);
});

// ── T7 / CS-5, CS-6: JWT expired → one deferred refresh, foreground only ──
function jwtExpired() { return json({ code: 'PGRST303', message: 'JWT expired' }, 401); }

test('T7 CS-5: a database "JWT expired" asks for ONE refresh, deferred, then the recovered hook runs', async () => {
  const server = fakeServer('ok');
  server.rest = () => jwtExpired();
  const queued = [];
  let recovers = 0; let recovered = 0;
  const mono = monoClock();
  const af = createAuthFetch({
    fetch: server.fetch, readStoredSession: async () => null, now: mono.now,
    schedule: (fn) => queued.push(fn),
  });
  af.setRecovery({ canRecover: () => true, recover: async () => { recovers += 1; return { data: { session: { user: { id: 'u1' } } }, error: null }; } });
  af.onRecovered(() => { recovered += 1; });
  const r = await af.fetch(`${URL_}/rest/v1/doses?select=*`);
  assert.equal(r.status, 401, 'the 401 itself is passed through');
  assert.equal(recovers, 0, 'never inside the request');
  await af.fetch(`${URL_}/rest/v1/doses?select=*`);
  assert.equal(queued.length, 1, 'once per 60 s');
  await queued[0]();
  assert.equal(recovers, 1);
  assert.equal(recovered, 1);
  mono.add(61 * 1000);
  await af.fetch(`${URL_}/rest/v1/doses?select=*`);
  assert.equal(queued.length, 2, 'again after 60 s');
});

test('T7 CS-6: never while backgrounded / headless; other 401s do not ask', async () => {
  const queued = [];
  let fg = false;
  const af = createAuthFetch({ fetch: async (u) => (String(u).includes('perm') ? json({ code: '42501', message: 'permission denied' }, 401) : jwtExpired()), readStoredSession: async () => null, now: monoClock().now, schedule: (fn) => queued.push(fn) });
  af.setRecovery({ canRecover: () => fg, recover: async () => ({}) });
  await af.fetch(`${URL_}/rest/v1/doses`);
  assert.equal(queued.length, 0, 'background: nothing');
  fg = true;
  await af.fetch(`${URL_}/rest/v1/perm`);
  assert.equal(queued.length, 0, 'not a JWT expiry');
  await af.fetch(`${URL_}/functions/v1/delete-account`, { method: 'POST' });
  assert.equal(queued.length, 0, 'a function\'s 401 (e.g. during delete account) never asks for a refresh');
  await af.fetch(`${URL_}/rest/v1/doses`);
  assert.equal(queued.length, 1);
  fg = false; // went to the background before the deferred call ran
  let ran = 0;
  af.setRecovery({ canRecover: () => fg, recover: async () => { ran += 1; return {}; } });
  await queued[0]();
  assert.equal(ran, 0, 'checked again when it runs');
});

test('T7 CS-5 (real client): clock moved back after a +19 h session → one 401 → one refresh → sync can run', async () => {
  // A session saved while the device was 19 h ahead looks valid for 19 h once the clock is back.
  setDeviceSkew(19 * H);
  const server = fakeServer('ok');
  const st = memStorage({});
  const mono = monoClock();
  const queued = [];
  const af = createAuthFetch({ fetch: server.fetch, readStoredSession: () => st.getItem(KEY), now: mono.now, schedule: (fn) => queued.push(fn) });
  const sb = createClient(URL_, 'anon', { auth: { storage: st, storageKey: KEY, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false }, global: { fetch: af.fetch } });
  await sb.auth.initialize();
  st.mem[KEY] = JSON.stringify(serverSession(1));
  await sb.auth.getSession(); // refresh under +19 h: device-relative expiry saved
  assert.equal(server.refreshPosts, 1);
  Date.now = realNow; // back to automatic time
  let tokenExpired = true;
  server.rest = (u, init) => (tokenExpired ? jwtExpired() : json([]));
  af.setRecovery({ canRecover: () => true, recover: () => recoverWith(sb, st) });
  let syncs = 0;
  af.onRecovered(() => { syncs += 1; });
  const r = await sb.from('doses').select('*');
  assert.ok(r.error, 'first call fails (JWT expired)');
  assert.equal(queued.length, 1);
  tokenExpired = false;
  await queued[0]();
  assert.equal(server.refreshPosts, 2, 'exactly one more refresh');
  assert.equal(syncs, 1, 'the recovered hook asks for a sync');
  const r2 = await sb.from('doses').select('*');
  assert.equal(r2.error, null);
});

// The app's recover (lib/supabase.js): an expired local session refreshes through getSession (one
// POST); a locally valid one is refreshed explicitly; no session → nothing.
async function recoverWith(sb, st) {
  const how = recoveryCall(await st.getItem(KEY), Date.now());
  if (how === 'get') return sb.auth.getSession();
  if (how === 'refresh') return sb.auth.refreshSession();
  return null;
}

test('recoveryCall: no session → none; locally expired → get; valid → refresh', () => {
  const now = realNow();
  assert.equal(recoveryCall(null, now), 'none');
  assert.equal(recoveryCall('not json', now), 'none');
  assert.equal(recoveryCall(JSON.stringify({ refresh_token: 'r', expires_at: Math.round(now / 1000) + 60 }), now), 'get');
  assert.equal(recoveryCall(JSON.stringify({ refresh_token: 'r', expires_at: Math.round(now / 1000) + 3600 }), now), 'refresh');
  assert.equal(recoveryCall(JSON.stringify({ access_token: 'a' }), now), 'none');
});

// ── A-140: offline cold start with an expired token ──
function expiredStored() {
  const s = serverSession(1);
  s.expires_at = Math.round(realNow() / 1000) - 2 * 3600; // last used more than an hour ago
  return s;
}

test('CS-11 A-140: offline cold start, expired token → getSession answers the stored session at once; no SIGNED_OUT', async () => {
  const server = fakeServer('offline');
  const { c, st, events } = client({ server, seed: { [KEY]: JSON.stringify(expiredStored()) } });
  await c.initialize();
  const t0 = realNow();
  const { data, error } = await c.getSession(); // App.js cold start
  assert.ok(realNow() - t0 < 2000, `answered in ${realNow() - t0} ms (unwrapped: ~25 s of retries)`);
  assert.equal(error, null);
  assert.equal(data.session && data.session.user.id, 'u1', 'the app opens on Main, not Auth');
  assert.equal(await burst(c), 0, 'every other caller too');
  assert.ok(!events.includes('SIGNED_OUT'));
  const kept = JSON.parse(st.mem[KEY]);
  assert.equal(kept.refresh_token, 'rt1', 'nothing rotated, nothing lost');
  assert.ok(server.calls.length <= 1, `${server.calls.length} network attempt(s)`);
});

test('CS-12 A-140: the network returns → exactly one refresh; a second report does nothing', async () => {
  const server = fakeServer('offline');
  const st = memStorage({ [KEY]: JSON.stringify(expiredStored()) });
  const queued = [];
  const af = createAuthFetch({ fetch: server.fetch, readStoredSession: () => st.getItem(KEY), now: monoClock().now, schedule: (fn) => queued.push(fn) });
  const sb = createClient(URL_, 'anon', { auth: { storage: st, storageKey: KEY, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false }, global: { fetch: af.fetch } });
  await sb.auth.initialize();
  const events = [];
  sb.auth.onAuthStateChange((e) => events.push(e));
  af.setRecovery({ canRecover: () => true, recover: () => recoverWith(sb, st) });
  let syncs = 0;
  af.onRecovered(() => { syncs += 1; });
  assert.ok((await sb.auth.getSession()).data.session, 'offline: kept');
  server.mode = 'ok';
  assert.equal(af.networkBack(), true);
  assert.equal(queued.length, 1);
  await queued[0]();
  assert.equal(server.refreshPosts, 1, 'one refresh when the network came back');
  assert.equal(JSON.parse(st.mem[KEY]).refresh_token, 'rt2', 'a real session again');
  assert.equal(syncs, 1, 'and the sync runs after it');
  assert.equal(af.networkBack(), false, 'nothing stale: no second refresh');
  assert.ok(!events.includes('SIGNED_OUT'));
});

test('CS-12: the network returning while the app is in the background does not refresh', () => {
  const queued = [];
  const af = createAuthFetch({ fetch: async () => { throw new TypeError('x'); }, readStoredSession: async () => null, now: monoClock().now, schedule: (fn) => queued.push(fn) });
  af.setRecovery({ canRecover: () => false, recover: async () => ({}) });
  af._markStale();
  assert.equal(af.networkBack(), false);
  assert.equal(queued.length, 0);
});

test('CS-13: a server error (5xx) on refresh keeps the session at once (no 25 s retry stall, no sign-out)', async () => {
  const server = fakeServer('503');
  const { c, events } = client({ server, seed: { [KEY]: JSON.stringify(expiredStored()) } });
  await c.initialize();
  const t0 = realNow();
  assert.equal(await burst(c, 5), 0);
  assert.ok(realNow() - t0 < 2000);
  assert.ok(!events.includes('SIGNED_OUT'));
});

test('CS-13: a 500 on refresh (non-retryable in auth-js) never signs out either', async () => {
  const base = async () => json({ message: 'boom' }, 500);
  const st = memStorage({ [KEY]: JSON.stringify(expiredStored()) });
  const af = createAuthFetch({ fetch: base, readStoredSession: () => st.getItem(KEY), now: monoClock().now });
  const c = new GoTrueClient({ url: `${URL_}/auth/v1`, storageKey: KEY, storage: st, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, fetch: af.fetch });
  const events = [];
  c.onAuthStateChange((e) => events.push(e));
  await c.initialize();
  assert.ok((await c.getSession()).data.session);
  assert.ok(!events.includes('SIGNED_OUT'));
  assert.ok(st.mem[KEY]);
});

test('CS-14: offline with no stored session at all → no session (nothing invented)', async () => {
  const server = fakeServer('offline');
  const { c } = client({ server, seed: {} });
  await c.initialize();
  assert.equal((await c.getSession()).data.session, null);
});

// ── T8 / CS-9, CS-15: wiring and guards ──
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('T8 CS-9: lib/supabase.js gives the client the wrapper; auto refresh stays off; recovery is foreground-only', () => {
  const s = read('lib', 'supabase.js');
  assert.match(s, /import \{ createAuthFetch, recoveryCall \} from '\.\/authFetch';/);
  assert.match(s, /global: \{ fetch: authFetch\.fetch \}/);
  assert.match(s, /autoRefreshToken: false,/);
  assert.match(s, /canRecover: \(\) => AppState\.currentState === 'active' && !storedSessionOnly\(\)/);
  assert.match(s, /readStoredSession: \(\) => SecureStoreAdapter\.getItem\(supabase\.auth\.storageKey\)/);
});

test('T8: the reset-link client uses the same expiry rule', () => {
  const r = read('lib', 'recoveryLink.js');
  assert.match(r, /global: \{ fetch: createAuthFetch\(\)\.fetch \}/);
});

test('T8 CS-12: the sync engine reports the network back to the session before syncing, and syncs after a recovery', () => {
  const s = read('lib', 'sync.js');
  assert.match(s, /if \(_isOnline && wasOffline\) \{[\s\S]{0,200}sessionNetworkBack\(\);[\s\S]{0,80}requestSync\(\);/);
  assert.match(s, /onSessionRecovered\(\(\) => requestSync\(\)\)/);
});

// Strip each setTimeout(...) (deferred work) and check what runs INLINE.
function inlinePart(cb) {
  let out = '';
  let i = 0;
  while (i < cb.length) {
    const j = cb.indexOf('setTimeout(', i);
    if (j < 0) { out += cb.slice(i); break; }
    out += cb.slice(i, j);
    let depth = 0; let k = j + 'setTimeout'.length;
    for (; k < cb.length; k++) { if (cb[k] === '(') depth++; else if (cb[k] === ')') { depth--; if (depth === 0) break; } }
    i = k + 1;
  }
  return out;
}

test('T8 CS-9: onAuthStateChange stays synchronous — no await, no supabase.* inline; untouched by this item', () => {
  const app = read('App.js');
  const start = app.indexOf('supabase.auth.onAuthStateChange(');
  const cb = app.slice(start + 'supabase.auth.onAuthStateChange('.length, app.indexOf('// Sign in with Apple: if the user revokes'));
  assert.match(cb, /^\(_event, session\) => \{/, 'not async');
  const inline = inlinePart(cb);
  assert.ok(!/\bawait\b/.test(inline), 'no await inline');
  assert.ok(!/supabase\./.test(inline), 'no supabase.* inline');
  assert.ok(!/authFetch|sessionNetworkBack|refreshSession/.test(cb), 'the session fixes live outside the callback');
});

test('CS-16: the supabase packages are pinned to the installed, tested versions', () => {
  const pkg = JSON.parse(read('package.json'));
  const installed = (n) => JSON.parse(read('node_modules', '@supabase', n, 'package.json')).version;
  assert.equal(pkg.dependencies['@supabase/supabase-js'], installed('supabase-js'));
  assert.equal(pkg.dependencies['@supabase/auth-js'], installed('auth-js'));
  assert.equal(installed('auth-js'), '2.101.1', 'the wrapper was written against auth-js 2.101.1');
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'patches')) || !fs.readdirSync(path.join(__dirname, '..', 'patches')).some((f) => /supabase/.test(f)), 'no patch-package on supabase');
});

// React Native's fetch is whatwg-fetch (node_modules/react-native/Libraries/Network/fetch.js). The
// rebuilt answers (device expiry, stand-in) must work with ITS Response / Headers, not only Node's.
test('RN fetch classes (whatwg-fetch): device +19 h and offline cold start behave the same', async () => {
  const W = require('whatwg-fetch/dist/fetch.umd.js');
  const saved = { Response: global.Response, Headers: global.Headers };
  global.Response = W.Response; global.Headers = W.Headers;
  try {
    setDeviceSkew(19 * H);
    const server = fakeServer('ok');
    const { c, events } = client({ server });
    await c.initialize();
    assert.equal(await burst(c), 0);
    assert.ok(server.refreshPosts <= 1, `${server.refreshPosts} POSTs`);
    assert.ok(!events.includes('SIGNED_OUT'));
    Date.now = realNow;
    const off = fakeServer('offline');
    const o = client({ server: off, seed: { [KEY]: JSON.stringify(expiredStored()) } });
    await o.c.initialize();
    const { data } = await o.c.getSession();
    assert.equal(data.session && data.session.user.id, 'u1');
    assert.ok(!o.events.includes('SIGNED_OUT'));
  } finally {
    global.Response = saved.Response; global.Headers = saved.Headers;
  }
});
