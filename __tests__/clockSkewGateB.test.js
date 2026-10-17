'use strict';
// Gate B review of A-137 + A-140 (47b4b87), fix-first items 1-5 and 7 (docs/specs/clock-skew-session-plan.md
// CS-17…CS-23). Real GoTrueClient 2.101.1 + lib/authFetch; the real syncCore on in-memory SQLite.
const test = require('node:test');
const assert = require('node:assert/strict');
const { GoTrueClient } = require('@supabase/auth-js');
const { createAuthFetch, REFRESH_TIMEOUT_MS } = require('../lib/authFetch');
const { sliceBlock, loadFn, read } = require('./helpers/extractFn');
const H = require('./helpers/syncHarness');
const { pushPending } = require('../lib/syncCore');

const KEY = 'sb-x-auth-token';
const URL_ = 'https://x.supabase.co';
const realNow = Date.now.bind(Date);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function memStorage(seed) {
  const mem = { ...seed };
  return { mem, getItem: async (k) => mem[k] ?? null, setItem: async (k, v) => { mem[k] = v; }, removeItem: async (k) => { delete mem[k]; } };
}
function session(n, expiredH = 0) {
  const s = Math.round(realNow() / 1000);
  return { access_token: `at${n}`, refresh_token: `rt${n}`, token_type: 'bearer', expires_in: 3600, expires_at: s + 3600 - expiredH * 3600, user: { id: 'u1', aud: 'authenticated' } };
}
function monoClock() { let t = 1e6; return { now: () => t, add: (ms) => { t += ms; } }; }
const refreshReq = (rt) => [`${URL_}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }) }];

// GoTrue as it behaves: the active refresh token rotates; its PARENT reused returns the active
// session (the lost-response case); anything older → 400 Already Used.
function goTrue() {
  const g = { n: 1, active: session(1, 2), parentOf: {}, posts: 0, alreadyUsed: 0, mode: 'ok', loseNext: 0 };
  g.fetch = async (input, init) => {
    const u = String(input);
    if (!/grant_type=refresh_token/.test(u)) return json({}, 404);
    g.posts += 1;
    if (g.mode === 'throw') throw new TypeError('Network request failed');
    if (g.mode === '503') return json({ message: 'unavailable' }, 503);
    if (g.mode === '500') return json({ message: 'boom' }, 500);
    if (g.mode === '429') return json({ code: 'over_request_rate_limit' }, 429);
    if (g.mode === 'stall') return new Promise((resolve, reject) => { if (init && init.signal) init.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))); });
    const rt = JSON.parse(init.body).refresh_token;
    if (rt === g.active.refresh_token) {
      g.n += 1;
      const next = session(g.n);
      g.parentOf[next.refresh_token] = rt;
      g.active = next;
      if (g.loseNext > 0) { g.loseNext -= 1; throw new TypeError('Network request failed'); } // rotated, response lost
      return json(next);
    }
    if (g.parentOf[g.active.refresh_token] === rt) return json(g.active);
    g.alreadyUsed += 1;
    return json({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' }, 400);
  };
  return g;
}

function client(g, { offline = false, timeoutMs } = {}) {
  const st = memStorage({ [KEY]: JSON.stringify(g.active) });
  const af = createAuthFetch({ fetch: g.fetch, readStoredSession: () => st.getItem(KEY), now: monoClock().now, isOffline: async () => offline, refreshTimeoutMs: timeoutMs });
  const c = new GoTrueClient({ url: `${URL_}/auth/v1`, storageKey: KEY, storage: st, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, fetch: af.fetch });
  const events = [];
  c.onAuthStateChange((e) => events.push(e));
  return { c, st, af, events };
}

// ── 1: a rotated-but-lost response is recovered by auth-js's quick retry ──
test('CS-17 (Gate B 1): online, the server rotated but the answer was lost → the quick retry gets the new token; no SIGNED_OUT, no Already Used', async () => {
  const g = goTrue();
  g.loseNext = 1;
  const { c, st, events } = client(g, { offline: false });
  await c.initialize();
  const { data } = await c.getSession();
  assert.equal(data.session && data.session.refresh_token, 'rt2');
  assert.equal(JSON.parse(st.mem[KEY]).refresh_token, 'rt2', 'the new token is stored, not the used parent');
  assert.equal(g.posts, 2);
  assert.equal(g.alreadyUsed, 0);
  assert.ok(!events.includes('SIGNED_OUT'));
  // and the next refresh works (no "Already Used" sign-out later)
  const r = await c.refreshSession();
  assert.equal(r.error, null);
  assert.equal(g.alreadyUsed, 0);
});

test('CS-17: online, every attempt fails on the network → 3 quick tries, then the stored session (no sign-out)', async () => {
  const g = goTrue();
  g.mode = 'throw';
  const { c, events } = client(g, { offline: false });
  await c.initialize();
  const t0 = realNow();
  const { data } = await c.getSession();
  assert.ok(data.session, 'kept');
  assert.equal(g.posts, 3, 'the 4th attempt became the stand-in');
  assert.ok(realNow() - t0 < 5000);
  assert.ok(!events.includes('SIGNED_OUT'));
});

test('CS-17: online 503 → auth-js retries within the budget, then the stored session', async () => {
  const g = goTrue();
  g.mode = '503';
  const { c, events } = client(g, { offline: false });
  await c.initialize();
  assert.ok((await c.getSession()).data.session);
  assert.equal(g.posts, 3);
  assert.ok(!events.includes('SIGNED_OUT'));
});

test('CS-17: NetInfo offline → the stored session at once (CS-11 stays fast); 429 and 500 → at once even online', async () => {
  for (const [mode, offline] of [['throw', true], ['429', false], ['500', false]]) {
    const g = goTrue();
    g.mode = mode;
    const { c, events } = client(g, { offline });
    await c.initialize();
    const t0 = realNow();
    assert.ok((await c.getSession()).data.session, mode);
    assert.equal(g.posts, 1, mode);
    assert.ok(realNow() - t0 < 500, mode);
    assert.ok(!events.includes('SIGNED_OUT'), mode);
  }
});

// ── 7: a refresh on a network that carries nothing never holds the lock forever ──
test('CS-23 (Gate B 7): a refresh that never answers is aborted at the timeout → the stored session; no SIGNED_OUT', async () => {
  assert.equal(REFRESH_TIMEOUT_MS, 10000);
  const g = goTrue();
  g.mode = 'stall';
  const { c, events } = client(g, { offline: false, timeoutMs: 150 });
  await c.initialize();
  const t0 = realNow();
  const { data } = await c.getSession();
  const took = realNow() - t0;
  assert.ok(data.session && data.session.user.id === 'u1', 'cold start opens on the stored session');
  assert.ok(took < 1000, `resolved in ${took} ms (timeout 150 ms; RN OkHttp has no timeout of its own)`);
  assert.equal(g.posts, 1, 'no second 10 s wait');
  assert.ok(!events.includes('SIGNED_OUT'));
});

test('CS-23: a base fetch that ignores the abort signal is still cut off at the timeout', async () => {
  const st = memStorage({ [KEY]: JSON.stringify(session(1, 2)) });
  const af = createAuthFetch({ fetch: () => new Promise(() => {}), readStoredSession: () => st.getItem(KEY), now: monoClock().now, isOffline: async () => false, refreshTimeoutMs: 100 });
  const t0 = realNow();
  const r = await af.fetch(...refreshReq('rt1'));
  assert.equal(r.status, 200);
  assert.ok(realNow() - t0 < 1000);
  assert.equal((await r.json()).refresh_token, 'rt1');
});

// ── 2: recovery also for an expired JWT at /auth/v1 (not logout) and /functions/v1 ──
test('CS-18 (Gate B 2): auth 401/403 bad_jwt or "token is expired" and a function\'s expired-JWT 401 ask for one refresh; permission errors do not', async () => {
  const routes = {
    '/auth/v1/user': json({ code: 'bad_jwt', msg: 'invalid JWT: unable to parse or verify signature, token has invalid claims: token is expired' }, 403),
    '/auth/v1/factors': json({ code: 'insufficient_aal', msg: 'AAL2 required' }, 403),
    '/auth/v1/logout': json({ code: 'bad_jwt', msg: 'token is expired' }, 401),
    '/functions/v1/parse-food': json({ code: 401, message: 'Invalid JWT' }, 401),
    '/functions/v1/delete-user': json({ error: 'Invalid session' }, 401),
    '/functions/v1/nohdr': json({ error: 'Missing authorization header' }, 401),
    '/functions/v1/assistant': json({ error: 'Conversation not available', code: 'turn_limit' }, 403),
  };
  const base = async (u) => { for (const k of Object.keys(routes)) if (String(u).includes(k)) return routes[k].clone(); return json({}); };
  const mk = () => {
    const queued = [];
    const af = createAuthFetch({ fetch: base, readStoredSession: async () => null, now: monoClock().now, schedule: (fn) => queued.push(fn) });
    af.setRecovery({ canRecover: () => true, recover: async () => ({}) });
    return { af, queued };
  };
  const asks = async (path, method = 'GET') => { const { af, queued } = mk(); const r = await af.fetch(`${URL_}${path}`, { method }); assert.ok(r.status >= 400); return queued.length; };
  assert.equal(await asks('/auth/v1/user'), 1, 'updateUser / getUser with an expired token');
  assert.equal(await asks('/auth/v1/factors'), 0, 'not curable by a refresh');
  assert.equal(await asks('/auth/v1/logout', 'POST'), 0, 'never on sign-out');
  assert.equal(await asks('/functions/v1/parse-food', 'POST'), 1, 'gateway: expired JWT');
  assert.equal(await asks('/functions/v1/delete-user', 'POST'), 1, 'the function could not read the session');
  assert.equal(await asks('/functions/v1/nohdr', 'POST'), 0);
  assert.equal(await asks('/functions/v1/assistant', 'POST'), 0);
});

function loadDeletion(fakes) {
  return loadFn('lib/accountActions.js', 'export async function requestAccountDeletion(', 'requestAccountDeletion', {
    supabase: fakes.supabase, fetch: fakes.fetch, process: { env: { EXPO_PUBLIC_SUPABASE_URL: URL_ } },
    pauseSyncForDeletion: () => {}, resumeSyncAfterDeletion: () => {}, waitForSyncIdle: async () => {}, // clockSkewDeletion tests these
  });
}

test('CS-19 (Gate B 2): delete account after the clock moved back: a 401 refreshes once and retries with the new token', async () => {
  const sent = [];
  let refreshes = 0;
  const supabase = { auth: {
    getSession: async () => ({ data: { session: { access_token: 'old' } } }),
    refreshSession: async () => { refreshes += 1; return { data: { session: { access_token: 'new' } }, error: null }; },
  } };
  const fetch = async (u, init) => { sent.push(init.headers.Authorization); return init.headers.Authorization === 'Bearer old' ? json({ error: 'Invalid session' }, 401) : json({ ok: true }); };
  const del = loadDeletion({ supabase, fetch });
  const r = await del();
  assert.deepEqual(r, { ok: true, appleManualRevokeNeeded: false });
  assert.deepEqual(sent, ['Bearer old', 'Bearer new']);
  assert.equal(refreshes, 1);
});

test('CS-19: delete account retries once only; a 200 never refreshes; a failed refresh is offline', async () => {
  let refreshes = 0;
  const base = (sess) => ({ auth: {
    getSession: async () => ({ data: { session: { access_token: 'old' } } }),
    refreshSession: async () => { refreshes += 1; return sess; },
  } });
  let calls = 0;
  const always401 = async () => { calls += 1; return json({ error: 'Invalid session' }, 401); };
  await assert.rejects(loadDeletion({ supabase: base({ data: { session: { access_token: 'new' } }, error: null }), fetch: always401 })(), /Invalid session/);
  assert.equal(calls, 2, 'one retry');
  calls = 0;
  assert.deepEqual(await loadDeletion({ supabase: base({ data: { session: null }, error: { message: 'x' } }), fetch: always401 })(), { offline: true }, 'no new session: offline, not "deletion failed" (CS-25)');
  assert.equal(calls, 1, 'no retry without a new session');
  refreshes = 0;
  const ok = await loadDeletion({ supabase: base(null), fetch: async () => json({ ok: true, appleManualRevokeNeeded: true }) })();
  assert.deepEqual(ok, { ok: true, appleManualRevokeNeeded: true });
  assert.equal(refreshes, 0);
  const off = await loadDeletion({ supabase: base(null), fetch: async () => { throw new TypeError('offline'); } })();
  assert.deepEqual(off, { offline: true });
});

// ── 3: the recovered hook also on a normal refresh after a stand-in; no reconnect lockout ──
function standInRig({ canRecover = () => true } = {}) {
  const g = goTrue();
  const st = memStorage({ [KEY]: JSON.stringify(g.active) });
  const queued = [];
  const mono = monoClock();
  let offline = true;
  const af = createAuthFetch({ fetch: g.fetch, readStoredSession: () => st.getItem(KEY), now: mono.now, isOffline: async () => offline, schedule: (fn) => queued.push(fn) });
  let hooks = 0;
  af.onRecovered(() => { hooks += 1; });
  // A tiny "auth-js": save what a refresh answers.
  const refresh = async () => { const rt = JSON.parse(st.mem[KEY]).refresh_token; const r = await af.fetch(...refreshReq(rt)); if (r.ok) { st.mem[KEY] = JSON.stringify(await r.json()); return { data: { session: JSON.parse(st.mem[KEY]) }, error: null }; } return { data: { session: null }, error: { status: r.status } }; };
  af.setRecovery({ canRecover, recover: refresh });
  const drain = async () => { while (queued.length) await queued.shift()(); };
  return { g, st, af, queued, mono, refresh, drain, hooks: () => hooks, setOffline: (v) => { offline = v; } };
}

test('CS-20 (Gate B 3): the auto-refresh tick turns a stand-in into a real session → the recovered hook (sync) runs once', async () => {
  const r = standInRig();
  r.g.mode = 'throw';
  await r.refresh(); // offline → stand-in
  assert.equal(JSON.parse(r.st.mem[KEY]).refresh_token, 'rt1');
  r.g.mode = 'ok'; r.setOffline(false);
  await r.refresh(); // the normal tick, not a recovery
  assert.equal(JSON.parse(r.st.mem[KEY]).refresh_token, 'rt2');
  await r.drain();
  assert.equal(r.hooks(), 1, 'pending rows sync now');
  assert.equal(r.af.networkBack(), false, 'nothing stale any more');
});

test('CS-20: the hook waits for the foreground; a recovery that refreshes fires it once, not twice', async () => {
  let fg = false;
  const r = standInRig({ canRecover: () => fg });
  r.g.mode = 'throw';
  await r.refresh();
  r.g.mode = 'ok'; r.setOffline(false);
  await r.refresh();
  await r.drain();
  assert.equal(r.hooks(), 0, 'background: no sync from here');
  // Again with a recovery doing the refresh.
  fg = true;
  const q = standInRig();
  q.g.mode = 'throw';
  await q.refresh();
  q.g.mode = 'ok'; q.setOffline(false);
  assert.equal(q.af.networkBack(), true);
  await q.drain();
  assert.equal(q.hooks(), 1);
});

test('CS-21 (Gate B 3): a recovery that ended in a network stand-in does not lock the next reconnect out', async () => {
  const r = standInRig();
  r.g.mode = 'throw';
  await r.refresh(); // stand-in
  assert.equal(r.af.networkBack(), true);
  await r.drain(); // still offline (a flapping network) → network stand-in again
  assert.equal(r.af.networkBack(), true, 'the next reconnect may try at once');
  await r.drain();
  // A recovery held off by a 429 keeps the 60 s gap (no loop against the rate limit).
  const q = standInRig();
  q.g.mode = '429';
  await q.refresh();
  assert.equal(q.af.networkBack(), true);
  await q.drain();
  assert.equal(q.af.networkBack(), false);
});

// ── 4: the recovered hook does not outlive stopSyncEngine ──
test('CS-22 (Gate B 4): stopSyncEngine unsubscribes the recovered hook; a late recovery never asks for a sync', () => {
  const src = read('lib/sync.js');
  const body = `let _isOnline = true; let _knownOnline = null; let _syncTimer = null; let _unsubNetInfo = null; let _unsubRecovered = null;
${sliceBlock(src, 'export function startSyncEngine(').replace(/^export\s+/, '')}
${sliceBlock(src, 'export function stopSyncEngine(').replace(/^export\s+/, '')}
return { startSyncEngine, stopSyncEngine };`;
  const hooks = new Set();
  let syncs = 0;
  const deps = {
    NetInfo: { addEventListener: () => () => {} },
    onSessionRecovered: (fn) => { hooks.add(fn); return () => hooks.delete(fn); },
    requestSync: () => { syncs += 1; },
    notifyListeners: () => {},
    sessionNetworkBack: () => {},
  };
  // eslint-disable-next-line no-new-func
  const m = new Function(...Object.keys(deps), body)(...Object.values(deps));
  m.startSyncEngine();
  m.startSyncEngine();
  assert.equal(hooks.size, 1, 'one hook');
  m.stopSyncEngine();
  assert.equal(hooks.size, 0, 'gone after stop (account deletion stops sync, then wipes)');
  for (const fn of hooks) fn();
  assert.equal(syncs, 0);
  m.startSyncEngine();
  assert.equal(hooks.size, 1, 'back on the next start (sign-in)');
});

// ── 5: syncCore keeps rows pending through "JWT expired", then pushes once ──
test('CS-15 (Gate B 5): pushPending with 401 PGRST303 keeps insert / update / delete pending; after recovery each goes once, no duplicates', async () => {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  const uid = 'u1';
  const expiredErr = { code: 'PGRST303', message: 'JWT expired', details: null, hint: null };
  let expired = true;
  const real = { insert: cloud.insert.bind(cloud), update: cloud.update.bind(cloud), delete: cloud.delete.bind(cloud) };
  const calls = { insert: 0, update: 0, delete: 0 };
  cloud.insert = async (t, p) => { calls.insert += 1; return expired ? { data: null, error: expiredErr } : real.insert(t, p); };
  cloud.update = async (t, id, p) => { calls.update += 1; return expired ? { data: null, error: expiredErr } : real.update(t, id, p); };
  cloud.delete = async (t, id) => { calls.delete += 1; return expired ? { error: expiredErr } : real.delete(t, id); };
  cloud.sessionUserId = async () => uid;

  // insert: a new local protocol; update: a synced one edited; delete: a synced one deleted here.
  const newId = H.seedLocalProtocol(db, uid, { name: 'New' });
  await real.insert('protocols', { id: 'r-edit', user_id: uid, name: 'Edit me' });
  await real.insert('protocols', { id: 'r-del', user_id: uid, name: 'Delete me' });
  const editId = H.seedSyncedProtocol(db, uid, { remote_id: 'r-edit', updated_at: '000001' });
  H.editLocalProtocol(db, editId, { name: 'Edited' });
  const delId = H.seedSyncedProtocol(db, uid, { remote_id: 'r-del', updated_at: '000002' });
  db.runSync(`UPDATE protocols SET sync_status = 'deleted' WHERE id = ?`, [delId]);

  await pushPending(db, cloud, uid);
  assert.equal(H.getProtocol(db, newId).sync_status, 'pending');
  assert.equal(H.getProtocol(db, editId).sync_status, 'pending');
  assert.equal(H.getProtocol(db, delId).sync_status, 'deleted', 'not hard-deleted on an error');
  assert.equal(cloud.rows('protocols', uid).length, 2, 'the cloud is untouched');
  assert.equal(cloud.rows('protocols', uid).find((r) => r.id === 'r-edit').name, 'Edit me');

  expired = false; // the session was recovered (onSessionRecovered → requestSync)
  await pushPending(db, cloud, uid);
  await pushPending(db, cloud, uid); // a second pass changes nothing
  const rows = cloud.rows('protocols', uid);
  assert.equal(rows.filter((r) => r.name === 'New').length, 1, 'inserted once');
  assert.equal(rows.find((r) => r.id === 'r-edit').name, 'Edited');
  assert.ok(!rows.find((r) => r.id === 'r-del'), 'deleted in the cloud');
  assert.equal(H.getProtocol(db, newId).sync_status, 'synced');
  assert.equal(H.getProtocol(db, editId).sync_status, 'synced');
  assert.ok(!H.getProtocol(db, delId), 'the local tombstone row is gone after the cloud delete');
  assert.equal(calls.insert, 2, 'one failed + one real insert, never a duplicate');
});

// ── F3: test-only switches are not part of the module's API ──
test('F3: isStale / _markStale / the device-expiry switch are test-only', () => {
  const af = createAuthFetch({});
  assert.equal(af.isStale, undefined);
  assert.equal(af._markStale, undefined);
  assert.ok(createAuthFetch({ __test: true }).__test.markStale);
  const s = read('lib/authFetch.js');
  assert.ok(!/opts\.deviceExpiry\b/.test(s), 'the switch is named as a test hook');
});
