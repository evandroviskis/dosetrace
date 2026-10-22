'use strict';
// Admin panel 3.2 — Premium: grant, change end date, revoke (docs/specs/admin-panel.md Phase 3 › 3.2,
// rows PR1–PR14, signed by the founder 2026-10-21). Server half: api/adm-premium.js behind the 3.1
// write gate, RevenueCat v2 mocked (no network), Supabase RPCs answered by an in-memory log that
// follows supabase/migrations/20261022120000_admin_actions_log.sql. Page half: web/adm.html.
// Dummy ids, keys and e-mails only — never a real token, key or account.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const F = require('./helpers/admAuthFake.js');

const ROOT = path.join(__dirname, '..');
const API_DIR = path.join(ROOT, 'api');
const HTML = fs.readFileSync(path.join(ROOT, 'web', 'adm.html'), 'utf8');
const SQL = fs.readFileSync(path.join(ROOT, 'supabase_admin_rpcs.sql'), 'utf8');
const MIG_PATH = path.join(ROOT, 'supabase', 'migrations', '20261022120000_admin_actions_log.sql');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';
const PREM_PATH = path.join(API_DIR, 'adm-premium.js');
const PREM_SRC = fs.existsSync(PREM_PATH) ? fs.readFileSync(PREM_PATH, 'utf8') : '';
function prem() { return require(PREM_PATH); }

const RC = 'https://api.revenuecat.com/v2';
const KEY = 'dummy-rc-write-key-PR1';
const PROJECT = 'projdummy01';
const ENT = 'entl0dummy01';
const TARGET = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';
const WL = 'cccccccc-3333-4ccc-8ccc-cccccccccccc';
const DAY = 864e5;
const RID = (n) => String(n).padStart(8, '0') + '-0000-4000-8000-' + String(n).padStart(12, '0');

function envAll() {
  F.envOn();
  process.env.REVENUECAT_WRITE_KEY = KEY;
  process.env.REVENUECAT_PROJECT_ID = PROJECT;
  process.env.REVENUECAT_ENTITLEMENT_ID = ENT;
}
function envNone() {
  F.envOff();
  delete process.env.REVENUECAT_WRITE_KEY;
  delete process.env.REVENUECAT_PROJECT_ID;
  delete process.env.REVENUECAT_ENTITLEMENT_ID;
}
function withEnv(fn) { return async () => { envAll(); try { await fn(); } finally { envNone(); } }; }

// ------------------------------------------------------------------ the fake world
// Supabase: admin_premium_target + admin_action_begin/finish (same rules as the migration).
// RevenueCat v2: customer, subscriptions, purchases, entitlement, grant_entitlement, revoke_granted_entitlement.
function world(opts) {
  const o = opts || {};
  const now = () => Date.now();
  const accounts = Object.assign({ [TARGET]: 'target@x.y', [OTHER]: 'other@x.y', [WL]: 'hello@dosetrace.io' }, o.accounts || {});
  const log = [];
  const rc = {}; // customer id -> { subs: [], purchases: [] }
  for (const id of Object.keys(accounts)) rc[id] = { subs: [], purchases: [] };
  if (o.rcMissing) for (const id of o.rcMissing) delete rc[id];
  const ent = { id: ENT, lookup_key: o.lookupKey || 'DoseTrace Pro', display_name: 'DoseTrace Pro' };
  const entRef = () => ({ object: 'list', items: [{ object: 'entitlement', id: ENT, lookup_key: ent.lookup_key, display_name: 'DoseTrace Pro', state: 'active' }] });
  const W = { log, rc, writes: [], reads: [], fail: o.fail || {}, accounts };
  W.addSub = (id, store, endMs) => rc[id].subs.push({ object: 'subscription', id: 'sub' + rc[id].subs.length, store, gives_access: endMs == null || endMs > now(), status: 'active', current_period_ends_at: endMs == null ? null : endMs, ends_at: null, entitlements: entRef() });
  W.addLifetime = (id) => rc[id].purchases.push({ object: 'purchase', id: 'pur0', store: 'app_store', status: 'owned', product_id: 'dt_lifetime', entitlements: entRef() });
  W.addPromo = (id, endMs) => rc[id].subs.push({ object: 'subscription', id: 'promo' + rc[id].subs.length, store: 'promotional', gives_access: endMs > now(), status: 'active', current_period_ends_at: endMs, ends_at: endMs, product_id: null, entitlements: entRef() });
  function active(id) {
    const c = rc[id];
    const live = c.subs.filter((s) => s.gives_access).map((s) => s.current_period_ends_at);
    if (c.purchases.some((p) => p.status === 'owned')) live.push(null);
    if (!live.length) return [];
    const exp = live.includes(null) ? null : Math.max(...live);
    return [{ object: 'customer.active_entitlement', entitlement_id: ENT, expires_at: exp }];
  }
  const json = F.json;
  function failWith(kind) {
    const f = W.fail[kind];
    if (!f) return null;
    if (f === 'timeout') { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; }
    if (typeof f === 'object' && f.once) { delete W.fail[kind]; return new Response(JSON.stringify({ type: 'rate_limit_error', message: 'x', backoff_ms: 17000 }), { status: f.status, headers: Object.assign({ 'Content-Type': 'application/json' }, f.headers || {}) }); }
    return json({ type: 'x', message: 'x' }, f);
  }
  W.data = async (u, body, init) => {
    // Supabase RPCs
    if (u === F.SB + '/rest/v1/rpc/admin_premium_target') {
      if (W.fail.target) return json({ message: 'boom' }, W.fail.target);
      const e = accounts[body.p_user_id];
      return json(e ? { user_id: body.p_user_id, email: e } : null);
    }
    if (u === F.SB + '/rest/v1/rpc/admin_action_begin') {
      if (W.fail.begin) return json({ message: 'relation "admin_actions_log" does not exist' }, W.fail.begin);
      const b = body;
      const ex = log.find((r) => r.request_id === b.p_request_id);
      if (ex) {
        if (ex.actor !== b.p_actor || ex.action !== b.p_action || ex.user_id !== b.p_user_id || (ex.expires_at || null) !== (b.p_expires_at || null)) return json({ state: 'conflict' });
        if (ex.status === 'pending') return json({ state: 'in_progress' });
        return json({ state: 'existing', http: ex.http, result: ex.result });
      }
      const t = now();
      const mine = log.filter((r) => r.actor === b.p_actor && r.at > t - 3600e3);
      if (mine.length >= (o.actorLimit || 30)) return json({ state: 'limited', scope: 'actor', retry_after: 120 });
      if (log.some((r) => r.user_id === b.p_user_id && /^premium_/.test(r.action) && r.at > t - 60e3)) return json({ state: 'limited', scope: 'account', retry_after: 42 });
      const row = { id: log.length + 1, at: t, request_id: b.p_request_id, actor: b.p_actor, action: b.p_action, user_id: b.p_user_id, expires_at: b.p_expires_at || null, reason: b.p_reason, status: 'pending', http: null, before: null, after: null, result: null };
      log.push(row);
      return json({ state: 'started', id: row.id });
    }
    if (u === F.SB + '/rest/v1/rpc/admin_action_finish') {
      const row = log.find((r) => r.id === body.p_id && r.status === 'pending');
      if (row) Object.assign(row, { status: body.p_status, http: body.p_http, before: body.p_before, after: body.p_after, result: body.p_result });
      return json(!!row);
    }
    // RevenueCat
    if (u.startsWith(RC + '/')) {
      const method = (init && init.method) || 'GET';
      const auth = (init && init.headers && (init.headers.Authorization || init.headers.authorization)) || '';
      if (auth !== 'Bearer ' + KEY) return json({ type: 'authentication_error' }, 401);
      const m = u.slice(RC.length).match(/^\/projects\/([^/]+)\/(customers|entitlements)\/([^/?]+)(\/[^?]*)?/);
      assert.ok(m, 'unexpected RevenueCat url ' + u);
      assert.equal(m[1], PROJECT);
      if (m[2] === 'entitlements') {
        W.reads.push('entitlement');
        const f = failWith('entitlement'); if (f) return f;
        return json(m[3] === ENT ? Object.assign({ object: 'entitlement', project_id: PROJECT, state: 'active' }, ent) : { type: 'resource_missing' }, m[3] === ENT ? 200 : 404);
      }
      const id = decodeURIComponent(m[3]);
      const tail = m[4] || '';
      if (method === 'POST') {
        W.writes.push({ kind: tail.split('/').pop(), id, body });
        const f = failWith(tail.endsWith('grant_entitlement') ? 'grant' : 'revoke'); if (f) return f;
        if (!rc[id]) return json({ type: 'resource_missing' }, 404);
        if (tail === '/actions/grant_entitlement') {
          assert.equal(typeof body.expires_at, 'number', 'expires_at in ms since epoch');
          if (body.entitlement_id !== ENT) return json({ type: 'parameter_error' }, 400);
          W.addPromo(id, body.expires_at);
          return json({ object: 'customer', id, active_entitlements: { object: 'list', items: active(id) } }, 201);
        }
        if (tail === '/actions/revoke_granted_entitlement') {
          if (body.entitlement_id !== ENT) return json({ type: 'parameter_error' }, 400);
          rc[id].subs = rc[id].subs.filter((s) => s.store !== 'promotional');
          return json({ object: 'customer', id, active_entitlements: { object: 'list', items: active(id) } });
        }
        throw new Error('unexpected RevenueCat POST ' + u);
      }
      W.reads.push(tail || 'customer');
      const f = failWith('read'); if (f) return f;
      if (!rc[id]) return json({ type: 'resource_missing' }, 404);
      if (!tail) return json({ object: 'customer', id, project_id: PROJECT, active_entitlements: { object: 'list', items: active(id), next_page: null } });
      if (tail === '/subscriptions') return json({ object: 'list', items: rc[id].subs, next_page: null });
      if (tail === '/purchases') return json({ object: 'list', items: rc[id].purchases, next_page: null });
      throw new Error('unexpected RevenueCat GET ' + u);
    }
    throw new Error('unexpected call ' + u);
  };
  return W;
}

const H = (o) => Object.assign(F.bearer('admin', Object.assign({ totpS: 30 }, o || {})), F.ORIGIN);
function post(W, body, o) { return F.call(prem(), { method: 'POST', url: '/api/adm-premium', headers: H(o), body }, { data: W.data }); }
function get(W, q, o) { return F.call(prem(), { method: 'GET', url: '/api/adm-premium' + (q || ''), headers: F.bearer('admin', o) }, { data: W.data }); }
const inDays = (d) => new Date(Date.now() + d * DAY).toISOString();
function grantBody(o) { return Object.assign({ request_id: RID(1), action: 'grant', user_id: TARGET, expires_at: inDays(7), reason: 'support case 12' }, o || {}); }
const rcCalls = (r) => r.calls.filter((c) => c.url.startsWith(RC));
const rcWrites = (r) => rcCalls(r).filter((c) => c.method === 'POST');

// ------------------------------------------------------------------ PR1: the write key
test('PR1: api/adm-premium.js is the only file that reads REVENUECAT_WRITE_KEY, and it has no console.*', () => {
  assert.ok(PREM_SRC, 'api/adm-premium.js exists');
  assert.match(PREM_SRC, /process\.env\.REVENUECAT_WRITE_KEY/);
  assert.equal((PREM_SRC.match(/console\./g) || []).length, 0);
  const scan = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); if (s.isDirectory()) { if (!/node_modules|\.git$/.test(p)) walk(p); } else if (/\.(js|cjs|mjs|ts|html)$/.test(f)) scan.push(p); } };
  for (const d of ['api', 'web', 'lib', 'screens', 'components', 'scripts', 'supabase/functions']) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
  for (const f of ['App.js', 'index.js']) scan.push(path.join(ROOT, f));
  const readers = scan.filter((p) => /REVENUECAT_WRITE_KEY/.test(fs.readFileSync(p, 'utf8'))).map((p) => path.relative(ROOT, p));
  assert.deepEqual(readers, ['api/adm-premium.js']);
  assert.ok(!/REVENUECAT_WRITE_KEY/.test(fs.readFileSync(path.join(API_DIR, 'adm.js'), 'utf8')), 'the read endpoint never holds write power');
});

test('PR1: the write key never appears in a response, and is sent only to RevenueCat (never to Supabase)', withEnv(async () => {
  const W = world();
  W.addPromo(TARGET, Date.now() + 3 * DAY);
  const answers = [await get(W, '?user_id=' + TARGET), await post(W, grantBody({ request_id: RID(2), expires_at: inDays(30), action: 'change_end' }))];
  for (const r of answers) {
    assert.ok(!r.body.includes(KEY), 'key not echoed');
    for (const c of r.calls) if (!c.url.startsWith(RC)) assert.ok(!JSON.stringify(c).includes(KEY), 'key not sent to ' + c.url);
  }
  assert.ok(answers[1].calls.some((c) => c.url.startsWith(RC) && c.headers.Authorization === 'Bearer ' + KEY));
}));

// ------------------------------------------------------------------ PR2: body validation
test('PR2: a malformed body → 400 and no external call (no Supabase RPC, no RevenueCat)', withEnv(async () => {
  const bad = [
    {}, 'not json{', grantBody({ action: 'delete' }), grantBody({ action: 'lifetime' }), grantBody({ user_id: 'not-a-uuid' }), grantBody({ user_id: '' }),
    grantBody({ request_id: 'abc' }), grantBody({ request_id: undefined }), grantBody({ reason: '' }), grantBody({ reason: '   ' }), grantBody({ reason: 'x'.repeat(201) }), grantBody({ reason: 5 }),
    grantBody({ expires_at: undefined }), grantBody({ expires_at: 'tomorrow' }), grantBody({ expires_at: new Date(Date.now() - 60e3).toISOString() }),
    grantBody({ expires_at: Date.now() + 7 * DAY }), grantBody({ action: 'change_end', expires_at: undefined }),
    grantBody({ action: 'revoke', expires_at: inDays(7) }), grantBody({ expires_at: '2100-01-01T00:00:00.000Z' }), grantBody({ expires_at: '2099-06-01T00:00:00.000Z' }),
  ];
  for (const b of bad) {
    const W = world();
    const r = await post(W, b);
    assert.equal(r.code, 400, JSON.stringify(b).slice(0, 120));
    assert.equal(r.dataCalls.length, 0, 'no call for ' + JSON.stringify(b).slice(0, 80));
  }
}));

test('PR2/PR13: Lifetime (2099-12-31T23:59:59Z) is refused with 400 lifetime_disabled while PR13 is open, before any call', withEnv(async () => {
  assert.equal(prem().LIFETIME_ENABLED, false, 'off until PR13 is [x]');
  assert.equal(prem().LIFETIME_ISO, '2099-12-31T23:59:59.000Z');
  const W = world();
  for (const e of ['2099-12-31T23:59:59.000Z', '2099-12-31T23:59:59Z']) {
    const r = await post(W, grantBody({ expires_at: e }));
    assert.equal(r.code, 400);
    assert.equal(r.json.code, 'lifetime_disabled');
    assert.equal(r.dataCalls.length, 0);
  }
}));

test('PR2: every offered duration passes validation (7 d, 1 mo, 3 mo, 1 y, a custom future date before 2099-12-31)', () => {
  const P = prem();
  const now = Date.parse('2026-10-22T15:00:00Z');
  for (const d of ['7d', '1m', '3m', '1y']) {
    const v = P.validate({ request_id: RID(1), action: 'grant', user_id: TARGET, expires_at: P.presetEnd(d, now), reason: 'r' }, now);
    assert.ok(!v.error, d + ' ' + v.error);
  }
  assert.equal(P.presetEnd('7d', now), '2026-10-29T15:00:00.000Z');
  assert.equal(P.presetEnd('1m', now), '2026-11-22T15:00:00.000Z');
  assert.equal(P.presetEnd('3m', now), '2027-01-22T15:00:00.000Z');
  assert.equal(P.presetEnd('1y', now), '2027-10-22T15:00:00.000Z');
  assert.equal(P.presetEnd('1m', Date.parse('2027-01-31T10:00:00Z')), '2027-02-28T10:00:00.000Z', 'a short month clamps to its last day');
  assert.ok(!P.validate({ request_id: RID(1), action: 'grant', user_id: TARGET, expires_at: '2030-05-01T23:59:59.000Z', reason: 'r' }, now).error);
  const v = P.validate({ request_id: RID(1), action: 'change_end', user_id: TARGET.toUpperCase(), expires_at: '2030-05-01T23:59:59Z', reason: '  trimmed  ' }, now);
  assert.equal(v.user_id, TARGET, 'ids are lower-cased');
  assert.equal(v.reason, 'trimmed');
  assert.equal(v.expires_at, '2030-05-01T23:59:59.000Z');
  assert.ok(!P.validate({ request_id: RID(1), action: 'revoke', user_id: TARGET, reason: 'r' }, now).error);
});

// ------------------------------------------------------------------ PR3: only real accounts
test('PR3: a user_id that is not in auth.users → 404 not_found, no RevenueCat call (POST and GET)', withEnv(async () => {
  const W = world();
  const ghost = 'dddddddd-4444-4ddd-8ddd-dddddddddddd';
  const p = await post(W, grantBody({ user_id: ghost }));
  assert.equal(p.code, 404); assert.equal(p.json.code, 'not_found'); assert.equal(rcCalls(p).length, 0);
  assert.equal(W.log.length, 0, 'nothing logged for a non-account');
  const g = await get(W, '?user_id=' + ghost);
  assert.equal(g.code, 404); assert.equal(rcCalls(g).length, 0);
}));

test('PR3: an $RCAnonymousID is refused (400 anonymous_id) before any call', withEnv(async () => {
  const W = world();
  const p = await post(W, grantBody({ user_id: '$RCAnonymousID:0123456789abcdef0123456789abcdef' }));
  assert.equal(p.code, 400); assert.equal(p.json.code, 'anonymous_id'); assert.equal(p.dataCalls.length, 0);
  const g = await get(W, '?user_id=' + encodeURIComponent('$RCAnonymousID:0123456789abcdef'));
  assert.equal(g.code, 400); assert.equal(g.json.code, 'anonymous_id'); assert.equal(g.dataCalls.length, 0);
}));

// ------------------------------------------------------------------ PR4: grant
test('PR4: grant calls v2 grant_entitlement with the entitlement id and expires_at in ms; the re-read shows Premium until that date', withEnv(async () => {
  const W = world();
  const end = inDays(7);
  const r = await post(W, grantBody({ expires_at: end }));
  assert.equal(r.code, 200, r.body);
  const w = rcWrites(r);
  assert.equal(w.length, 1);
  assert.equal(w[0].url, RC + '/projects/' + PROJECT + '/customers/' + TARGET + '/actions/grant_entitlement');
  assert.deepEqual(w[0].body, { entitlement_id: ENT, expires_at: Date.parse(end) });
  assert.equal(r.json.ok, true);
  assert.equal(r.json.confirmed, true);
  assert.deepEqual(r.json.before, { premium: false, source: 'free', expires_at: null });
  assert.deepEqual(r.json.after, { premium: true, source: 'promotional', expires_at: end });
  // the re-read happened after the write
  const idx = r.calls.findIndex((c) => c.method === 'POST' && c.url.startsWith(RC));
  assert.ok(r.calls.slice(idx + 1).some((c) => c.url === RC + '/projects/' + PROJECT + '/customers/' + TARGET));
}));

test('PR4: the entitlement id must still carry the lookup key "DoseTrace Pro"; a mismatch refuses the grant (no write call)', withEnv(async () => {
  const W = world({ lookupKey: 'Something Else' });
  const r = await post(W, grantBody());
  assert.equal(r.code, 500);
  assert.equal(r.json.code, 'entitlement_mismatch');
  assert.equal(rcWrites(r).length, 0);
  assert.equal(W.log[0].status, 'failed');
}));

test('PR4: the lookup key in the server equals the app entitlement (lib/purchases.js ENTITLEMENT_ID) — fails if either changes', () => {
  const lib = fs.readFileSync(path.join(ROOT, 'lib', 'purchases.js'), 'utf8').match(/const ENTITLEMENT_ID = '([^']+)'/);
  assert.ok(lib);
  assert.equal(prem().ENTITLEMENT_LOOKUP_KEY, lib[1]);
  assert.equal(lib[1], 'DoseTrace Pro');
});

test('PR4: the app whitelist in the server mirrors lib/purchases.js DEVELOPER_EMAILS exactly', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'purchases.js'), 'utf8');
  const list = src.match(/const DEVELOPER_EMAILS = \[([\s\S]*?)\]/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1).toLowerCase());
  assert.deepEqual([...prem().WHITELIST].sort(), [...list].sort());
});

test('PR4: grant to an account whose current grant already ends within 2 h of the new date → 409 covered; an earlier date → 409 shorter; no write call', withEnv(async () => {
  const W = world();
  const end = Date.now() + 7 * DAY;
  W.addPromo(TARGET, end);
  const a = await post(W, grantBody({ request_id: RID(3), expires_at: new Date(end + 3600e3).toISOString() }));
  assert.equal(a.code, 409); assert.equal(a.json.code, 'covered'); assert.equal(rcWrites(a).length, 0);
  const W2 = world(); W2.addPromo(TARGET, end);
  const b = await post(W2, grantBody({ request_id: RID(4), expires_at: new Date(end - 2 * DAY).toISOString() }));
  assert.equal(b.code, 409); assert.equal(b.json.code, 'shorter'); assert.equal(rcWrites(b).length, 0);
  const W3 = world(); W3.addPromo(TARGET, end);
  const c = await post(W3, grantBody({ request_id: RID(5), expires_at: new Date(end + 30 * DAY).toISOString() }));
  assert.equal(c.code, 200, 'extending past the 2 h window is a plain grant');
}));

// ------------------------------------------------------------------ PR5: revoke
test('PR5: revoke calls revoke_granted_entitlement when Premium comes from a panel grant', withEnv(async () => {
  const W = world();
  W.addPromo(TARGET, Date.now() + 5 * DAY);
  const r = await post(W, { request_id: RID(6), action: 'revoke', user_id: TARGET, reason: 'ended' });
  assert.equal(r.code, 200, r.body);
  const w = rcWrites(r);
  assert.equal(w.length, 1);
  assert.equal(w[0].url, RC + '/projects/' + PROJECT + '/customers/' + TARGET + '/actions/revoke_granted_entitlement');
  assert.deepEqual(w[0].body, { entitlement_id: ENT });
  assert.deepEqual(r.json.after, { premium: false, source: 'free', expires_at: null });
}));

test('PR5: revoke is refused before any write call when the only Premium source is a store subscription, a Lifetime purchase, the app whitelist, or nothing — with that reason', withEnv(async () => {
  const cases = [
    ['source_store', (W) => W.addSub(TARGET, 'app_store', Date.now() + 20 * DAY), TARGET],
    ['source_store', (W) => W.addSub(TARGET, 'play_store', Date.now() + 20 * DAY), TARGET],
    ['source_lifetime', (W) => W.addLifetime(TARGET), TARGET],
    ['source_whitelist', () => {}, WL],
    ['not_premium', () => {}, TARGET],
  ];
  let n = 10;
  for (const [code, setup, who] of cases) {
    const W = world();
    setup(W);
    const r = await post(W, { request_id: RID(n++), action: 'revoke', user_id: who, reason: 'try' });
    assert.equal(r.code, 409, code);
    assert.equal(r.json.code, code);
    assert.equal(rcWrites(r).length, 0, code + ': no write call');
    assert.equal(W.log.length, 1); assert.equal(W.log[0].status, 'refused');
  }
}));

test('PR5: a promotional grant beside a store subscription can be revoked; the store subscription stays (Premium remains, source app_store)', withEnv(async () => {
  const W = world();
  W.addSub(TARGET, 'app_store', Date.now() + 20 * DAY);
  W.addPromo(TARGET, Date.now() + 40 * DAY);
  const r = await post(W, { request_id: RID(20), action: 'revoke', user_id: TARGET, reason: 'dup' });
  assert.equal(r.code, 200);
  assert.equal(r.json.after.premium, true);
  assert.equal(r.json.after.source, 'app_store');
}));

test('PR5 (GET): the current plan names each source, and says whether revoke is possible and why not', withEnv(async () => {
  const W = world();
  const g0 = await get(W, '?user_id=' + TARGET);
  assert.equal(g0.code, 200);
  assert.deepEqual(g0.json.user, { id: TARGET, short: TARGET.slice(0, 8), email: 'target@x.y' });
  assert.equal(g0.json.plan.premium, false); assert.equal(g0.json.plan.revoke, 'not_premium');
  assert.equal(g0.json.lifetime_enabled, false);
  const end = Date.now() + 9 * DAY;
  W.addPromo(TARGET, end);
  const g1 = await get(W, '?user_id=' + TARGET);
  assert.equal(g1.json.plan.premium, true); assert.equal(g1.json.plan.revoke, 'ok');
  assert.deepEqual(g1.json.plan.sources, [{ kind: 'promotional', expires_at: new Date(end).toISOString() }]);
  assert.equal(g1.json.plan.promo_expires_at, new Date(end).toISOString());
  const g2 = await get(world(), '?user_id=' + WL);
  assert.deepEqual(g2.json.plan.sources.map((s) => s.kind), ['whitelist']); assert.equal(g2.json.plan.revoke, 'source_whitelist');
  const W3 = world(); W3.addLifetime(TARGET);
  const g3 = await get(W3, '?user_id=' + TARGET);
  assert.deepEqual(g3.json.plan.sources, [{ kind: 'lifetime', expires_at: null }]); assert.equal(g3.json.plan.revoke, 'source_lifetime');
  const W4 = world(); W4.addSub(TARGET, 'play_store', end);
  const g4 = await get(W4, '?user_id=' + TARGET);
  assert.deepEqual(g4.json.plan.sources.map((s) => s.kind), ['play_store']); assert.equal(g4.json.plan.revoke, 'source_store');
  for (const g of [g0, g1, g2, g3, g4]) assert.equal(rcWrites(g).length, 0, 'GET never writes');
}));

test('PR5 (GET): a RevenueCat customer that does not exist yet reads as free; RevenueCat not configured → rc not_configured with 0 RevenueCat calls', withEnv(async () => {
  const W = world({ rcMissing: [TARGET] });
  const g = await get(W, '?user_id=' + TARGET);
  assert.equal(g.code, 200); assert.equal(g.json.plan.premium, false); assert.equal(g.json.rc, 'ok');
  delete process.env.REVENUECAT_WRITE_KEY;
  const n = await get(world(), '?user_id=' + WL);
  assert.equal(n.code, 200); assert.equal(n.json.rc, 'not_configured'); assert.equal(rcCalls(n).length, 0);
  assert.deepEqual(n.json.plan.sources.map((s) => s.kind), ['whitelist']);
}));

// ------------------------------------------------------------------ PR6: change end date
test('PR6: change end date = revoke then grant, under one request_id and one log row', withEnv(async () => {
  const W = world();
  W.addPromo(TARGET, Date.now() + 30 * DAY);
  const end = inDays(3);
  const r = await post(W, grantBody({ request_id: RID(30), action: 'change_end', expires_at: end, reason: 'shorten' }));
  assert.equal(r.code, 200, r.body);
  assert.deepEqual(rcWrites(r).map((c) => c.url.split('/').pop()), ['revoke_granted_entitlement', 'grant_entitlement']);
  assert.equal(W.log.length, 1);
  assert.equal(W.log[0].action, 'premium_change_end');
  assert.equal(W.log[0].request_id, RID(30));
  assert.equal(r.json.after.expires_at, end);
}));

test('PR6: change end date on an account without a panel grant is refused before any write call', withEnv(async () => {
  const W = world();
  W.addSub(TARGET, 'app_store', Date.now() + 20 * DAY);
  const r = await post(W, grantBody({ request_id: RID(31), action: 'change_end' }));
  assert.equal(r.code, 409); assert.equal(r.json.code, 'source_store'); assert.equal(rcWrites(r).length, 0);
}));

test('PR6: if the grant fails after the revoke, the answer says so plainly (change_partial) and the row is failed', withEnv(async () => {
  const W = world({ fail: { grant: 500 } });
  W.addPromo(TARGET, Date.now() + 30 * DAY);
  const r = await post(W, grantBody({ request_id: RID(32), action: 'change_end', expires_at: inDays(3) }));
  assert.equal(r.code, 502);
  assert.equal(r.json.code, 'change_partial');
  assert.deepEqual(r.json.after, { premium: false, source: 'free', expires_at: null });
  assert.equal(W.log[0].status, 'failed');
}));

// ------------------------------------------------------------------ PR7: idempotency
test('PR7: the same request_id sent twice → one RevenueCat write and the same answer', withEnv(async () => {
  const W = world();
  const b = grantBody({ request_id: RID(40) });
  const a = await post(W, b);
  await new Promise((r) => setTimeout(r, 5));
  const c = await post(W, b);
  assert.equal(a.code, 200);
  assert.equal(c.code, a.code);
  assert.deepEqual(c.json, a.json);
  assert.equal(W.writes.length, 1, 'one grant in total');
  assert.equal(rcCalls(c).length, 0, 'the replay makes no RevenueCat call at all');
  assert.equal(W.log.length, 1);
}));

test('PR7: a request_id still running → 409 in_progress; reused for a different change → 409 request_reused; no RevenueCat call', withEnv(async () => {
  const W = world();
  W.log.push({ id: 1, at: Date.now() - 1000, request_id: RID(41), actor: F.USERS.admin.id, action: 'premium_grant', user_id: TARGET, expires_at: null, status: 'pending' });
  const a = await post(W, grantBody({ request_id: RID(41), expires_at: undefined, action: 'revoke' }));
  assert.equal(a.code, 409); assert.equal(a.json.code, 'request_reused'); assert.equal(rcCalls(a).length, 0);
  W.log[0].action = 'premium_revoke';
  const b = await post(W, { request_id: RID(41), action: 'revoke', user_id: TARGET, reason: 'x' });
  assert.equal(b.code, 409); assert.equal(b.json.code, 'in_progress'); assert.equal(rcCalls(b).length, 0);
}));

// ------------------------------------------------------------------ PR8: the log
test('PR8: every action writes one admin_actions_log row: actor = the admin user_id, action, user_id, expires_at, reason, plan state before/after, status, http', withEnv(async () => {
  const W = world();
  const end = inDays(7);
  await post(W, grantBody({ request_id: RID(50), expires_at: end, reason: 'influencer' }));
  assert.equal(W.log.length, 1);
  const row = W.log[0];
  assert.equal(row.actor, F.USERS.admin.id);
  assert.equal(row.action, 'premium_grant');
  assert.equal(row.user_id, TARGET);
  assert.equal(row.expires_at, end);
  assert.equal(row.reason, 'influencer');
  assert.equal(row.status, 'ok');
  assert.equal(row.http, 201);
  for (const k of ['before', 'after']) assert.deepEqual(Object.keys(row[k]).sort(), ['expires_at', 'premium', 'source'], k + ' = plan state only');
  assert.ok(!JSON.stringify(row.result).includes('@'), 'no e-mail in the stored answer');
  const begin = (await post(world(), grantBody({ request_id: RID(51) }))).calls.find((c) => c.url.endsWith('/rpc/admin_action_begin'));
  assert.deepEqual(Object.keys(begin.body).sort(), ['p_action', 'p_actor', 'p_expires_at', 'p_reason', 'p_request_id', 'p_user_id']);
}));

function sqlFnIn(src, name) {
  const m = src.match(new RegExp(`create or replace function public\\.${name}\\([^)]*\\)[\\s\\S]*?\\n\\$\\$;`, 'i'));
  assert.ok(m, name + ' defined');
  return m[0];
}
function tableIn(src) {
  const m = src.match(/create table if not exists public\.admin_actions_log \(([\s\S]*?)\n\);/);
  assert.ok(m, 'admin_actions_log table');
  return m[1];
}
test('PR8 SQL: admin_actions_log has the handoff columns, no e-mail and no health column, plan-state-only before/after, RLS on, service_role SELECT only — same in the migration and the versioned SQL', () => {
  assert.ok(MIG, 'migration file exists');
  for (const src of [MIG, SQL]) {
    const t = tableIn(src);
    const cols = t.split('\n').map((l) => l.trim().match(/^([a-z_]+) /)).filter(Boolean).map((m) => m[1]);
    assert.deepEqual(cols, ['id', 'at', 'request_id', 'actor', 'action', 'user_id', 'expires_at', 'reason', 'before', 'after', 'status', 'http', 'result']);
    assert.ok(!/email|protocol|dose|lab|biomarker|weight|food|health/i.test(t), 'no e-mail or health column');
    assert.match(t, /request_id uuid not null unique/);
    assert.match(t, /before - array\['premium', 'source', 'expires_at'\]/);
    assert.match(t, /after - array\['premium', 'source', 'expires_at'\]/);
    assert.match(t, /position\('@' in result::text\) = 0/);
    assert.match(src, /alter table public\.admin_actions_log enable row level security;/);
    assert.match(src, /revoke all on table public\.admin_actions_log from public, anon, authenticated, service_role;/);
    assert.match(src, /grant select on table public\.admin_actions_log to service_role;/);
    assert.ok(!/create policy[^;]*admin_actions_log/i.test(src), 'no policies');
  }
  assert.equal(tableIn(MIG), tableIn(SQL), 'same table in both files');
  for (const fn of ['admin_premium_target', 'admin_action_begin', 'admin_action_finish', 'admin_accounts_list']) {
    assert.equal(sqlFnIn(MIG, fn), sqlFnIn(SQL, fn), fn + ' identical in the migration and supabase_admin_rpcs.sql');
    assert.match(sqlFnIn(MIG, fn), /security definer/);
  }
  for (const sig of ['admin_premium_target\\(uuid\\)', 'admin_action_begin\\(uuid, uuid, text, uuid, timestamptz, text\\)', 'admin_action_finish\\(bigint, text, int, jsonb, jsonb, jsonb\\)']) {
    for (const src of [MIG, SQL]) {
      assert.match(src, new RegExp('revoke execute on function public\\.' + sig + ' from public, anon, authenticated;'));
      assert.match(src, new RegExp('grant execute on function public\\.' + sig + ' to service_role;'));
    }
  }
  assert.match(MIG, /^begin;$/m); assert.match(MIG, /^commit;$/m);
  assert.match(MIG, /STATUS: NOT APPLIED/);
  assert.ok(!/(alter|update|insert into|delete from)\s+auth\./i.test(MIG), 'nothing in the auth schema');
});

test('PR8 SQL: the finish step only moves a pending row to ok / failed / refused once (append-only log)', () => {
  const fin = sqlFnIn(MIG, 'admin_action_finish');
  assert.match(fin, /where id = p_id and status = 'pending'/);
  assert.match(fin, /if p_status not in \('ok', 'failed', 'refused'\)/);
  assert.ok(!/delete/i.test(fin));
});

test('PR8 refused and failed actions are logged too (one row each); a validation error or an unknown account writes none', withEnv(async () => {
  const W = world();
  await post(W, { request_id: RID(52), action: 'revoke', user_id: TARGET, reason: 'x' });
  assert.equal(W.log.length, 1); assert.equal(W.log[0].status, 'refused'); assert.equal(W.log[0].http, 409);
  await post(W, grantBody({ request_id: RID(53), user_id: 'dddddddd-4444-4ddd-8ddd-dddddddddddd' }));
  await post(W, grantBody({ request_id: RID(54), reason: '' }));
  assert.equal(W.log.length, 1);
}));

test('3.2 SQL: admin_accounts_list now returns the account id in rows and tests (the Premium dialog names the account by its Supabase id)', () => {
  const fn = sqlFnIn(MIG, 'admin_accounts_list');
  assert.match(fn, /jsonb_build_object\('id', u\.id, 'email', lower\(u\.email\), 'kind'/);
  assert.match(fn, /jsonb_build_object\(\n\s+'id', u\.id,\n\s+'email', u\.email,/);
  assert.match(fn, /not public\.admin_is_test\(u\.email\)/);
  assert.equal((SQL.match(/create or replace function public\.admin_accounts_list\(\)/g) || []).length, 1, 'one body in the versioned SQL');
});

// ------------------------------------------------------------------ PR9: errors
test('PR9: RevenueCat 401/403 → 502 rc_permission; 404 on the write → 502 rc_no_customer; 429 → 429 rc_rate_limited with the wait', withEnv(async () => {
  for (const s of [401, 403]) {
    const W = world({ fail: { grant: s } });
    const r = await post(W, grantBody());
    assert.equal(r.code, 502); assert.equal(r.json.code, 'rc_permission');
    assert.equal(W.log[0].status, 'failed'); assert.equal(W.log[0].http, s);
  }
  const W404 = world({ fail: { grant: 404 } });
  const n = await post(W404, grantBody());
  assert.equal(n.code, 502); assert.equal(n.json.code, 'rc_no_customer');
  const W429 = world({ fail: { grant: { status: 429, headers: { 'Retry-After': '17' }, once: true } } });
  const q = await post(W429, grantBody());
  assert.equal(q.code, 429); assert.equal(q.json.code, 'rc_rate_limited'); assert.equal(q.json.retry_after, 17);
  const Wr = world({ fail: { read: 403 } });
  const rr = await post(Wr, grantBody());
  assert.equal(rr.json.code, 'rc_permission', 'the read path names the missing permission too');
  assert.equal(rcWrites(rr).length, 0, 'no write when the state cannot be read');
}));

test('PR9: after a timeout or a 5xx the state is re-read before anything is reported (applied or not)', withEnv(async () => {
  // timeout, and the re-read shows nothing changed
  const W1 = world({ fail: { grant: 'timeout' } });
  const a = await post(W1, grantBody());
  assert.equal(a.code, 504); assert.equal(a.json.code, 'rc_timeout'); assert.equal(a.json.applied, false);
  const wIdx = a.calls.findIndex((c) => c.url.endsWith('/grant_entitlement'));
  assert.ok(a.calls.slice(wIdx + 1).some((c) => c.url === RC + '/projects/' + PROJECT + '/customers/' + TARGET), 're-read after the timeout');
  assert.deepEqual(a.json.after, { premium: false, source: 'free', expires_at: null });
  // 5xx, but the grant did land (the fake applies it, then answers 503)
  const W2 = world();
  const end = inDays(7);
  const realData = W2.data;
  W2.data = async (u, body, init) => {
    if (u.endsWith('/actions/grant_entitlement')) { await realData(u, body, init); return F.json({ type: 'server_error' }, 503); }
    return realData(u, body, init);
  };
  const b = await post(W2, grantBody({ expires_at: end }));
  assert.equal(b.code, 200, 'applied after all: reported as done');
  assert.equal(b.json.applied_late, true);
  assert.deepEqual(b.json.after, { premium: true, source: 'promotional', expires_at: end });
  // re-read impossible too → rc_unknown
  const W3 = world({ fail: { grant: 'timeout' } });
  const d3 = W3.data;
  let reads = 0;
  W3.data = async (u, body, init) => { if (u === RC + '/projects/' + PROJECT + '/customers/' + TARGET && ++reads > 1) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; } return d3(u, body, init); };
  const c = await post(W3, grantBody());
  assert.equal(c.code, 504); assert.equal(c.json.code, 'rc_unknown');
}));

test('PR9: the RevenueCat calls carry a 4 s timeout (AbortSignal)', withEnv(async () => {
  assert.equal(prem().RC_TIMEOUT_MS, 4000);
  const r = await post(world(), grantBody());
  for (const c of rcCalls(r)) assert.ok(c.headers && r.calls.length, 'call recorded');
  assert.match(PREM_SRC, /AbortSignal\.timeout\(RC_TIMEOUT_MS\)|new AbortController\(\)/);
}));

test('PR9: Supabase or RevenueCat not configured → 503 not_configured before any call; the log table missing → 503 not_configured, no RevenueCat call', withEnv(async () => {
  delete process.env.REVENUECAT_ENTITLEMENT_ID;
  const a = await post(world(), grantBody());
  assert.equal(a.code, 503); assert.equal(a.json.code, 'not_configured'); assert.equal(a.dataCalls.length, 0);
  process.env.REVENUECAT_ENTITLEMENT_ID = ENT;
  const b = await post(world({ fail: { begin: 404 } }), grantBody());
  assert.equal(b.code, 503); assert.equal(b.json.code, 'not_configured'); assert.equal(rcCalls(b).length, 0);
}));

// ------------------------------------------------------------------ PR14: rate limits
test('PR14: over 30 actions per hour for this admin → 429 rate_actor; a second Premium action on the same account within a minute → 429 rate_account; no RevenueCat call', withEnv(async () => {
  const W = world({ actorLimit: 30 });
  for (let i = 0; i < 30; i++) W.log.push({ id: i + 1, at: Date.now() - 1000 * i, request_id: 'x' + i, actor: F.USERS.admin.id, action: 'premium_grant', user_id: OTHER, status: 'ok' });
  const a = await post(W, grantBody({ request_id: RID(60) }));
  assert.equal(a.code, 429); assert.equal(a.json.code, 'rate_actor'); assert.equal(a.json.retry_after, 120); assert.equal(rcCalls(a).length, 0);
  const W2 = world();
  const first = await post(W2, grantBody({ request_id: RID(61) }));
  assert.equal(first.code, 200);
  const second = await post(W2, { request_id: RID(62), action: 'revoke', user_id: TARGET, reason: 'oops' });
  assert.equal(second.code, 429); assert.equal(second.json.code, 'rate_account'); assert.equal(second.json.retry_after, 42); assert.equal(rcCalls(second).length, 0);
}));

test('PR14 SQL: the counter RPC counts this admin\'s rows in the last hour (30) and Premium rows on the account in the last minute (1), under an advisory lock, before inserting', () => {
  const fn = sqlFnIn(MIG, 'admin_action_begin');
  assert.match(fn, /pg_advisory_xact_lock/);
  assert.match(fn, /where actor = p_actor and at > now\(\) - interval '1 hour'/);
  assert.match(fn, /if n >= 30 then/);
  assert.match(fn, /where user_id = p_user_id and action like 'premium\\_%' and at > now\(\) - interval '1 minute'/);
  const iIdem = fn.indexOf('where request_id = p_request_id');
  const iRate = fn.indexOf("interval '1 hour'");
  const iIns = fn.indexOf('insert into public.admin_actions_log');
  assert.ok(iIdem > 0 && iIdem < iRate && iRate < iIns, 'replay first, then the limits, then the pending row');
});

// ------------------------------------------------------------------ the write gate (3.1) covers the new endpoint
test('3.2 gate: adm-premium POST needs the 3.1 write gate (Origin, aal2, admin role, fresh TOTP) before anything', withEnv(async () => {
  const W = world();
  const noOrigin = await F.call(prem(), { method: 'POST', url: '/api/adm-premium', headers: F.bearer('admin', { totpS: 5 }), body: grantBody() }, { data: W.data });
  assert.equal(noOrigin.code, 403); assert.equal(noOrigin.calls.length, 0);
  const stale = await post(W, grantBody(), { totpS: 16 * 60 });
  assert.equal(stale.code, 401); assert.equal(stale.json.code, 'step_up_required'); assert.equal(stale.dataCalls.length, 0);
  const viewer = await F.call(prem(), { method: 'POST', url: '/api/adm-premium', headers: Object.assign(F.bearer('viewer', { totpS: 5 }), F.ORIGIN), body: grantBody() }, { data: W.data });
  assert.equal(viewer.code, 403); assert.equal(viewer.json.code, 'role'); assert.equal(viewer.dataCalls.length, 0);
  const put = await F.call(prem(), { method: 'PUT', url: '/api/adm-premium', headers: H(), body: grantBody() }, { data: W.data });
  assert.equal(put.code, 405); assert.equal(put.dataCalls.length, 0);
  const viewerRead = await F.call(prem(), { method: 'GET', url: '/api/adm-premium?user_id=' + TARGET, headers: F.bearer('viewer') }, { data: W.data });
  assert.equal(viewerRead.code, 200, 'a viewer may read the plan, never change it');
  assert.equal(viewerRead.headers['cache-control'], 'no-store');
}));

// =================================================================== page (web/adm.html)
function pageT() {
  const script = HTML.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  return (0, eval)('(' + script.match(/var T=(\{[\s\S]*?\n  \});/)[1] + ')');
}
function premPure(lang) {
  const m = HTML.match(/\/\/ \[prem-pure-start\]([\s\S]*?)\/\/ \[prem-pure-end\]/);
  assert.ok(m, 'premium pure block present');
  const T = pageT();
  const L = lang || 'en';
  const t = (k, v) => { let s = T[L][k] != null ? T[L][k] : T.en[k]; assert.ok(s != null, 'missing key ' + k); if (v) for (const p of Object.keys(v)) s = String(s).split('{' + p + '}').join(v[p]); return s; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = (0, eval)('(function(){' + m[1] + '\nreturn {PREM_DURS:PREM_DURS,PREM_LIFETIME_ISO:PREM_LIFETIME_ISO,PREM_LIFETIME_ON:PREM_LIFETIME_ON,premEnd:premEnd,premErrKey:premErrKey,premCanConfirm:premCanConfirm,premDialogHtml:premDialogHtml,premCopy:premCopy,premSender:premSender,premUuid:premUuid,premActions:premActions};})()');
  return { P, t, esc, T };
}
const ST = (o) => Object.assign({ phase: 'form', now: Date.parse('2026-10-22T15:00:00Z'), user: { id: TARGET, short: TARGET.slice(0, 8), email: 'target@x.y' },
  plan: { premium: false, sources: [], revoke: 'not_premium', promo_expires_at: null }, action: 'grant', dur: '7d', custom: '', reason: '', busy: false, lang: 'en' }, o || {});

test('PR10 page: the confirm dialog shows the e-mail (large), short id, current plan and source, action, end date in UTC and local time, and "store subscriptions not affected"', () => {
  const { P, t, esc } = premPure('en');
  const h = P.premDialogHtml(ST({ plan: { premium: true, sources: [{ kind: 'app_store', expires_at: '2026-11-30T00:00:00.000Z' }], revoke: 'source_store', promo_expires_at: null } }), t, esc);
  assert.match(h, /class="pm-email"[^>]*>target@x\.y</);
  assert.ok(h.includes(TARGET.slice(0, 8)));
  assert.ok(h.includes(t('pm_src_app_store')));
  assert.ok(h.includes(t('pm_act_grant')));
  assert.ok(h.includes('2026-10-29 15:00 UTC'), 'end date in UTC');
  assert.ok(h.includes(t('pm_end_local', { d: new Date(Date.parse('2026-10-29T15:00:00Z')).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }) })), 'and in local time');
  assert.ok(h.includes(t('pm_store_note')));
  assert.ok(h.includes(t('pm_reason_note')), 'never write health information here');
  assert.match(h, /id="pm-go"[^>]*disabled/, 'Confirm disabled without a reason');
  const h2 = P.premDialogHtml(ST({ reason: 'support 12' }), t, esc);
  assert.ok(!/id="pm-go"[^>]*disabled/.test(h2), 'enabled once a reason is typed');
  assert.equal(P.premCanConfirm(ST({ reason: '   ' })), false);
  assert.equal(P.premCanConfirm(ST({ reason: 'ok' })), true);
  assert.equal(P.premCanConfirm(ST({ reason: 'ok', busy: true })), false);
  assert.equal(P.premCanConfirm(ST({ reason: 'ok', dur: 'custom', custom: '' })), false, 'a custom date must be picked');
  assert.equal(P.premCanConfirm(ST({ reason: 'ok', dur: 'custom', custom: '2026-10-01' })), false, 'and lie in the future');
  assert.equal(P.premCanConfirm(ST({ reason: 'ok', dur: 'custom', custom: '2027-03-01' })), true);
  assert.equal(P.premCanConfirm(ST({ reason: 'ok', dur: 'life' })), false, 'Lifetime is off');
});

test('PR10 page: durations are 7 days, 1 month, 3 months, 1 year, custom date and Lifetime; Lifetime is disabled with the PR13 reason; ends follow the server rule', () => {
  const { P, t, esc } = premPure('pt');
  assert.deepEqual(P.PREM_DURS, ['7d', '1m', '3m', '1y', 'custom', 'life']);
  assert.equal(P.PREM_LIFETIME_ON, false);
  assert.equal(P.PREM_LIFETIME_ISO, '2099-12-31T23:59:59.000Z');
  const now = Date.parse('2026-10-22T15:00:00Z');
  const S = prem();
  for (const d of ['7d', '1m', '3m', '1y']) assert.equal(P.premEnd(d, now, ''), S.presetEnd(d, now), d + ' same end on page and server');
  assert.equal(P.premEnd('custom', now, '2027-03-01'), '2027-03-01T23:59:59.000Z');
  assert.equal(P.premEnd('custom', now, ''), null);
  const h = P.premDialogHtml(ST({ lang: 'pt' }), t, esc);
  assert.match(h, /data-dur="life"[^>]*disabled/);
  assert.ok(h.includes('Disponível após o teste no aparelho (PR13)'));
  for (const d of ['7d', '1m', '3m', '1y', 'custom']) assert.ok(!new RegExp('data-dur="' + d + '"[^>]*disabled').test(h), d + ' enabled');
});

test('PR5/PR6 page: the actions offered follow the plan: grant always; change end and revoke only with a panel grant, else revoke shows why not; change end warns about the brief drop', () => {
  const { P, t, esc } = premPure('en');
  assert.deepEqual(P.premActions({ premium: false, sources: [], revoke: 'not_premium' }), { grant: true, change_end: false, revoke: false });
  assert.deepEqual(P.premActions({ premium: true, sources: [{ kind: 'promotional' }], revoke: 'ok', promo_expires_at: '2026-11-01T00:00:00.000Z' }), { grant: false, change_end: true, revoke: true });
  const store = P.premDialogHtml(ST({ plan: { premium: true, sources: [{ kind: 'play_store', expires_at: null }], revoke: 'source_store' } }), t, esc);
  assert.ok(store.includes(t('pm_e_source_store')), 'the reason revoke is not offered');
  const ch = P.premDialogHtml(ST({ action: 'change_end', plan: { premium: true, sources: [{ kind: 'promotional', expires_at: '2026-11-01T00:00:00.000Z' }], revoke: 'ok', promo_expires_at: '2026-11-01T00:00:00.000Z' } }), t, esc);
  assert.ok(ch.includes(t('pm_warn_drop')));
  const rv = P.premDialogHtml(ST({ action: 'revoke', plan: { premium: true, sources: [{ kind: 'promotional', expires_at: '2026-11-01T00:00:00.000Z' }], revoke: 'ok', promo_expires_at: '2026-11-01T00:00:00.000Z' } }), t, esc);
  assert.ok(rv.includes(t('pm_store_note'))); assert.ok(rv.includes(t('pm_offline_note')));
  assert.ok(!/data-dur=/.test(rv), 'no duration on a revoke');
});

test('PR10 page: a double-click sends one request (one request_id per confirmed dialog; the sender ignores clicks while one is in flight)', async () => {
  const { P } = premPure();
  let n = 0; let release;
  const send = P.premSender(() => { n++; return new Promise((r) => { release = r; }); });
  const a = send({ x: 1 }); const b = send({ x: 1 });
  assert.equal(n, 1);
  release({ ok: true });
  assert.deepEqual(await a, { ok: true });
  assert.equal(await b, null, 'the second click is dropped');
  const id = P.premUuid();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(HTML, /PM\.rid=PM\.rid\|\|premUuid\(\)/, 'the request id is made once per dialog and kept for a retry (step-up)');
});

const CUST = {
  en: 'Your Premium access is active. To see it now, open DoseTrace, go to Settings › See plans and tap Restore purchases.',
  pt: 'Seu acesso Premium está ativo. Para vê-lo agora, abra o DoseTrace, vá em Ajustes › Ver planos e toque em Restaurar compras.',
  es: 'Tu acceso Premium ya está activo. Para verlo ahora, abre DoseTrace, ve a Ajustes › Ver planes y toca Restaurar compras.',
  fr: 'Votre accès Premium est actif. Pour le voir dès maintenant, ouvrez DoseTrace, allez dans Paramètres › Voir les offres, puis touchez Restaurer les achats.',
  de: 'Dein Premium-Zugang ist aktiv. Um ihn sofort zu sehen, öffne DoseTrace, geh zu Einstellungen › Pläne anzeigen und tippe auf Käufe wiederherstellen.',
  it: 'Il tuo accesso Premium è attivo. Per vederlo subito, apri DoseTrace, vai su Impostazioni › Vedi i piani e tocca Ripristina acquisti.',
};
test('PR10 page: after a successful grant the same dialog shows the customer message in the panel language with a Copy button; Copy puts that exact string on the clipboard and makes no request', async () => {
  for (const l of Object.keys(CUST)) {
    const { P, t, esc, T } = premPure(l);
    assert.equal(T[l].pm_cust_msg, CUST[l], l + ' message = the signed table');
    const h = P.premDialogHtml(ST({ lang: l, phase: 'done', result: { ok: true, action: 'grant', after: { premium: true, source: 'promotional', expires_at: '2026-10-29T15:00:00.000Z' }, confirmed: true } }), t, esc);
    assert.ok(h.includes(esc(CUST[l])), l + ' message shown');
    assert.match(h, /id="pm-copy"/);
    assert.ok(h.includes(t('pm_when')), l + ' when the app shows it');
    let fetched = 0; const saved = global.fetch; global.fetch = () => { fetched++; return Promise.resolve(); };
    let clip = null;
    try { await P.premCopy(l, { writeText: (s) => { clip = s; return Promise.resolve(); } }, T); } finally { global.fetch = saved; }
    assert.equal(clip, CUST[l]); assert.equal(fetched, 0, 'nothing is sent from the panel');
  }
  const { P, t, esc } = premPure('en');
  const rv = P.premDialogHtml(ST({ phase: 'done', result: { ok: true, action: 'revoke', after: { premium: false, source: 'free', expires_at: null }, confirmed: true } }), t, esc);
  assert.ok(!rv.includes(CUST.en), 'no customer message after a revoke');
  assert.ok(rv.includes(t('pm_offline_note')));
});

function appWords() {
  let src = null;
  try { src = execFileSync('git', ['-C', ROOT, 'show', 'release/1.3.1:i18n/translations.js'], { encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (e) { /* fall back */ }
  if (!src) src = fs.readFileSync('/Users/evandrosantos/Desktop/dosetrace-1.3.1/i18n/translations.js', 'utf8');
  const out = {};
  const starts = ['en', 'es', 'pt', 'fr', 'de', 'it'].map((l) => [l, src.indexOf("\n  '" + l + "': {")]);
  for (let i = 0; i < starts.length; i++) {
    const [l, a] = starts[i];
    assert.ok(a > 0, 'language block ' + l);
    const block = src.slice(a, i + 1 < starts.length ? starts[i + 1][1] : src.length);
    const get = (k) => { const m = block.match(new RegExp('\\n\\s+' + k + ": '((?:[^'\\\\]|\\\\.)*)'")); assert.ok(m, l + ' ' + k); return m[1].replace(/\\'/g, "'"); };
    out[l] = { settings: get('tab_settings'), plans: get('settings_premium_btn'), restore: get('paywall_restore') };
  }
  return out;
}
test('PR11 static: the customer message uses the app\'s exact button words (release/1.3.1 i18n: tab_settings › settings_premium_btn, paywall_restore) in all 6 languages', () => {
  const W = appWords();
  const T = pageT();
  for (const l of Object.keys(CUST)) {
    const m = T[l].pm_cust_msg;
    assert.ok(m.includes(W[l].settings + ' › ' + W[l].plans), l + ': ' + W[l].settings + ' › ' + W[l].plans);
    assert.ok(m.includes(W[l].restore), l + ': ' + W[l].restore);
  }
});

// A-164 (2026-10-22, live run): the app only shows a Premium change after a cold start, so the panel no
// longer promises "about 5 minutes with the app open" (founder: "Execute sua recomendação").
test('PR11 page: after success the panel says when the app shows it (next open after closing it / at once with Restore purchases), in 6 languages, and a re-read that does not show it yet says so', () => {
  const T = pageT();
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.doesNotMatch(T[l].pm_when, /5/, l + ' no 5-minute promise (A-164)');
    assert.ok(T[l].pm_when.includes(appWords()[l].restore), l + ' names the restore button');
  }
  assert.equal(T.pt.pm_when, 'Quando o app mostra: na próxima vez que a pessoa abrir o app depois de fechá-lo por completo, ou na hora, ao tocar em Restaurar compras.');
  const { P, t, esc } = premPure('en');
  const h = P.premDialogHtml(ST({ phase: 'done', result: { ok: true, action: 'grant', after: { premium: false, source: 'free', expires_at: null }, confirmed: false } }), t, esc);
  assert.ok(h.includes(t('pm_unconfirmed')));
});

const ERR_CODES = ['invalid', 'anonymous_id', 'lifetime_disabled', 'not_found', 'not_configured', 'request_reused', 'in_progress', 'rate_actor', 'rate_account', 'source_store', 'source_lifetime',
  'source_whitelist', 'not_premium', 'covered', 'shorter', 'entitlement_mismatch', 'rc_permission', 'rc_no_customer', 'rc_rate_limited', 'rc_timeout', 'rc_down', 'rc_unknown', 'change_partial'];
test('PR9 page: every error state maps to its own message, present in all 6 languages; 401/403/connection have theirs; Portuguese is formal', () => {
  const { P } = premPure();
  const T = pageT();
  const keys = new Set();
  for (const c of ERR_CODES) {
    const k = P.premErrKey(409, c);
    assert.notEqual(k, 'pm_e_generic', c + ' has its own message');
    keys.add(k);
  }
  assert.equal(P.premErrKey(403, 'role'), 'pm_e_forbidden');
  assert.equal(P.premErrKey(403, 'origin'), 'pm_e_forbidden');
  assert.equal(P.premErrKey(0, null), 'pm_e_conn');
  assert.equal(P.premErrKey(500, 'weird'), 'pm_e_generic');
  keys.add('pm_e_forbidden'); keys.add('pm_e_conn'); keys.add('pm_e_generic'); keys.add('pm_e_rc_down_applied');
  assert.ok(keys.size >= ERR_CODES.length, 'distinct messages');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of keys) assert.ok(T[l][k], l + ' ' + k);
  const ptAll = Object.keys(T.pt).filter((k) => /^pm_/.test(k)).map((k) => T.pt[k]);
  for (const v of ptAll) assert.ok(!/\bNão deu\b|\bdá para\b|\ba gente\b|\bpra\b/.test(v), 'formal pt: ' + v);
  assert.equal(T.pt.pm_e_rc_timeout, 'Não foi possível falar com o RevenueCat. O estado foi lido de novo: nada mudou.');
  assert.match(T.pt.pm_e_rate_account, /\{s\}/);
});

test('PR9 page: a timeout is never reported before the state is re-read (the dialog shows the re-read plan with the message)', () => {
  const { P, t, esc } = premPure('en');
  const h = P.premDialogHtml(ST({ phase: 'error', err: { status: 504, code: 'rc_timeout', after: { premium: false, source: 'free', expires_at: null } } }), t, esc);
  assert.ok(h.includes(t('pm_e_rc_timeout')));
  assert.ok(h.includes(t('pm_after_reread', { p: t('pm_free') })));
});

test('3.2 page labels: every pm_ key exists in all 6 languages (parity)', () => {
  const T = pageT();
  const en = Object.keys(T.en).filter((k) => /^pm_/.test(k));
  assert.ok(en.length >= 60, 'premium labels present: ' + en.length);
  for (const l of ['es', 'pt', 'fr', 'de', 'it']) {
    const ks = Object.keys(T[l]).filter((k) => /^pm_/.test(k));
    assert.deepEqual(ks.sort(), en.slice().sort(), l + ' parity');
  }
});

test('3.2 page: the Premium styles use the panel tokens only (no raw colours, both themes), and the dialog fits 420 px', () => {
  const css = HTML.match(/\/\* \[premium-css-start\] \*\/([\s\S]*?)\/\* \[premium-css-end\] \*\//);
  assert.ok(css, 'premium css block');
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\bwhite\b|\bblack\b/i.test(css[1]), 'tokens only');
  assert.match(css[1], /#prem \.pdlg\{[^}]*max-width:520px[^}]*width:100%/);
  assert.match(css[1], /overflow-wrap:anywhere/, 'long e-mails wrap instead of scrolling');
  assert.match(HTML, /id="prem"/);
});

test('3.2 page: the Contas rows and the test-accounts view have a Premium button that opens the dialog by account id; the write goes to /api/adm-premium with the step-up first', () => {
  assert.match(HTML, /onclick="openPremium\(\\''\+esc\(r\.id\)\+'\\'\)"/);
  assert.match(HTML, /onclick="openPremium\(\\''\+esc\(x\.id\)\+'\\'\)"/);
  const m = HTML.match(/function premSend\(\)\{[\s\S]*?\n  \}/);
  assert.ok(m, 'premSend');
  assert.match(m[0], /AUTH\.needsStepUp\(\)/);
  assert.match(m[0], /openStepUp\(/);
  assert.match(m[0], /'\/api\/adm-premium'/);
  assert.match(HTML, /AUTH\.api\('GET',null,'\/api\/adm-premium\?user_id='\+encodeURIComponent\(id\)\)/);
  assert.match(HTML, /api:function\(method,body,path\)/, 'the session helper takes the endpoint path');
});

// ------------------------------------------------------------------ the informal panel string (founder rule 2026-10-20)
test('Formal Portuguese: the panel strings no longer say "não dá para" (incl_test_ev, incl_test, fa_note); other languages keep their meaning', () => {
  const T = pageT();
  assert.equal(T.pt.incl_test_ev, 'Inclui contas de teste (não é possível separá-las)');
  assert.equal(T.pt.incl_test, 'inclui compras, IDs e instalações de teste (não é possível filtrar por conta)');
  assert.equal(T.pt.fa_note, 'Usos = eventos registrados, não pessoas. O analytics é anônimo, portanto não é possível contar usuários nem alcance.');
  for (const k of Object.keys(T.pt)) assert.ok(!/\bnão dá\b|\bNão dá\b|\bdá para\b|\bNão deu\b|\ba gente\b/.test(T.pt[k]), 'formal pt ' + k + ': ' + T.pt[k]);
  assert.equal(T.en.incl_test_ev, 'Includes test accounts (cannot be separated)');
  assert.equal(T.es.incl_test_ev, 'Incluye cuentas de prueba (no se pueden separar)');
});
