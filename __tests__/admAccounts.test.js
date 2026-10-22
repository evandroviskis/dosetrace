'use strict';
// Admin 3.3 — the Users tab (the Contas tab evolved), docs/specs/admin-panel.md Phase 3 › 3.3, rows US1–US8
// (signed 2026-10-21), plus the founder's change of 2026-10-22: no per-row "Premium" / "Mensagem" buttons;
// the founder selects an account in the Contas list, its card opens beside the list (full screen at 420 px)
// and ONE "Opções" button holds every action for that account.
// Server half: api/adm-account.js behind the 3.1 session check; the Supabase RPCs are answered by an
// in-memory database that follows supabase/migrations/20261022200000_admin_users_tab.sql, and Supabase
// Auth's resend endpoint is faked (no network, no e-mail). Page half: web/adm.html (pure block + static).
// Dummy ids and e-mails only — never a real token, key or account.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('./helpers/admAuthFake.js');
const { sqlFnIn, latestFn } = require('./helpers/sqlLatest.js');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'web', 'adm.html'), 'utf8');
const SQL = fs.readFileSync(path.join(ROOT, 'supabase_admin_rpcs.sql'), 'utf8');
const MIG_PATH = path.join(ROOT, 'supabase', 'migrations', '20261022200000_admin_users_tab.sql');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';
const API_PATH = path.join(ROOT, 'api', 'adm-account.js');
const API_SRC = fs.existsSync(API_PATH) ? fs.readFileSync(API_PATH, 'utf8') : '';
function api() { return require(API_PATH); }

const UNCONF = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa'; // e-mail sign-up, not confirmed
const CONF = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb'; // e-mail sign-up, confirmed
const GOOG = 'cccccccc-3333-4ccc-8ccc-cccccccccccc'; // Google sign-in (OAuth)
const GHOST = 'dddddddd-4444-4ddd-8ddd-dddddddddddd'; // not an account
const RID = (n) => String(n).padStart(8, '0') + '-0000-4000-8000-' + String(n).padStart(12, '0');
const RESEND = F.SB + '/auth/v1/resend';

// The only keys admin_account_card may return (US4: the only health-related one is has_active_protocol).
const CARD_KEYS = ['user_id', 'email', 'created_at', 'provider', 'email_confirmed_at', 'last_sign_in_at', 'apple', 'pu', 'ua', 'onboarded', 'test_kind',
  'has_active_protocol', 'last_seen_at', 'last_seen_measured', 'app_version', 'app_version_measured', 'history'];
const API_CARD_KEYS = ['created_at', 'provider', 'email_confirmed_at', 'last_sign_in_at', 'platform', 'onboarded', 'test_kind', 'has_active_protocol', 'last_seen', 'app_version', 'history'];

function withEnv(fn) { return async () => { F.envOn(); try { await fn(); } finally { F.envOff(); delete process.env.REVENUECAT_PROJECT_ID; } }; }

// ------------------------------------------------------------------ the fake world
function world(opts) {
  const o = opts || {};
  const now = () => Date.now();
  const users = Object.assign({
    [UNCONF]: { email: 'Nova@x.y', provider: 'email', confirmed: null, protocol: true },
    [CONF]: { email: 'ok@x.y', provider: 'email', confirmed: '2026-10-01T10:00:00.000Z', protocol: false },
    [GOOG]: { email: 'g@x.y', provider: 'google', confirmed: '2026-10-02T10:00:00.000Z', protocol: false },
  }, o.users || {});
  const log = o.log || [];
  const W = { users, log, fail: o.fail || {}, sent: [] };
  function card(id) {
    const u = users[id];
    if (!u) return null;
    const c = {
      user_id: id, email: u.email.toLowerCase(), created_at: '2026-09-30T12:00:00+00:00', provider: u.provider, email_confirmed_at: u.confirmed, last_sign_in_at: null,
      apple: u.provider === 'apple', pu: ['android'], ua: [], onboarded: true, test_kind: null, has_active_protocol: !!u.protocol,
      last_seen_at: null, last_seen_measured: false, app_version: null, app_version_measured: false,
      history: log.filter((r) => r.user_id === id).map((r) => ({ at: new Date(r.at).toISOString(), action: r.action, status: r.status })),
    };
    return Object.assign(c, o.extraKeys || {});
  }
  W.data = async (u, body) => {
    if (u === F.SB + '/rest/v1/rpc/admin_account_card') {
      if (W.fail.card) return F.json({ message: 'function does not exist' }, W.fail.card);
      return F.json(card(body.p_user_id));
    }
    if (u === F.SB + '/rest/v1/rpc/admin_resend_begin') {
      const b = body;
      const ex = log.find((r) => r.request_id === b.p_request_id);
      if (ex) {
        if (ex.actor !== b.p_actor || ex.action !== 'resend_confirmation' || ex.user_id !== b.p_user_id) return F.json({ state: 'conflict' });
        if (ex.status === 'pending') return F.json({ state: 'in_progress' });
        return F.json({ state: 'existing', http: ex.http, result: ex.result });
      }
      const usr = users[b.p_user_id];
      if (!usr) return F.json({ state: 'not_found' });
      if (usr.confirmed) return F.json({ state: 'refused', code: 'already_confirmed' });
      if (usr.provider !== 'email') return F.json({ state: 'refused', code: 'not_email_signup' });
      if (log.filter((r) => r.actor === b.p_actor && r.at > now() - 3600e3).length >= 30) return F.json({ state: 'limited', scope: 'actor', retry_after: 300 });
      const last = log.filter((r) => r.user_id === b.p_user_id && r.action === 'resend_confirmation' && (r.status === 'ok' || r.status === 'pending') && r.at > now() - 3600e3);
      if (last.length) return F.json({ state: 'limited', scope: 'account', retry_after: 3000 });
      const row = { id: log.length + 1, at: now(), request_id: b.p_request_id, actor: b.p_actor, action: 'resend_confirmation', user_id: b.p_user_id, reason: null, status: 'pending', http: null, result: null };
      log.push(row);
      return F.json({ state: 'started', id: row.id });
    }
    if (u === F.SB + '/rest/v1/rpc/admin_action_finish') {
      const row = log.find((r) => r.id === body.p_id && r.status === 'pending');
      if (row) Object.assign(row, { status: body.p_status, http: body.p_http, result: body.p_result });
      return F.json(!!row);
    }
    if (u.startsWith(RESEND)) {
      if (W.fail.resend === 'timeout') { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
      if (W.fail.resend) return F.json({ code: W.fail.resend, msg: 'refused' }, W.fail.resend);
      W.sent.push({ url: u, body });
      return F.json({});
    }
    throw new Error('unexpected call ' + u);
  };
  return W;
}

const H = (o) => Object.assign(F.bearer('admin', Object.assign({ totpS: 30 }, o || {})), F.ORIGIN);
function post(W, body, o) { return F.call(api(), { method: 'POST', url: '/api/adm-account', headers: H(o), body }, { data: W.data }); }
function get(W, q, o) { return F.call(api(), { method: 'GET', url: '/api/adm-account' + (q || ''), headers: F.bearer(o && o.who ? o.who : 'admin', o) }, { data: W.data }); }
const rsBody = (o) => Object.assign({ action: 'resend_confirmation', user_id: UNCONF, request_id: RID(1) }, o || {});

// ================================================================== server: the card (US2 / US4)
test('US2/US4 (GET): the card for one account id: e-mail, created, sign-in method, e-mail confirmed, last sign-in, platform (MV-0 rule), onboarded, test kind, has_active_protocol yes/no, panel history; nothing else', withEnv(async () => {
  const W = world({ log: [{ id: 1, at: Date.now() - 6e5, request_id: RID(9), actor: F.USERS.admin.id, action: 'premium_grant', user_id: UNCONF, status: 'ok' }] });
  const g = await get(W, '?user_id=' + UNCONF.toUpperCase());
  assert.equal(g.code, 200, g.body);
  assert.deepEqual(g.json.user, { id: UNCONF, short: UNCONF.slice(0, 8), email: 'nova@x.y' });
  assert.deepEqual(Object.keys(g.json.card).sort(), API_CARD_KEYS.slice().sort(), 'only the allowed keys reach the page');
  assert.equal(g.json.card.has_active_protocol, true);
  assert.equal(g.json.card.platform, 'android');
  assert.equal(g.json.card.provider, 'email');
  assert.equal(g.json.card.email_confirmed_at, null);
  assert.deepEqual(g.json.card.history, [{ at: g.json.card.history[0].at, action: 'premium_grant', status: 'ok' }]);
  assert.equal(g.headers['cache-control'], 'no-store');
  const n = await get(W, '?user_id=' + GHOST);
  assert.equal(n.code, 404); assert.equal(n.json.code, 'not_found');
  const b = await get(W, '?user_id=nope');
  assert.equal(b.code, 400); assert.equal(b.dataCalls.length, 0);
}));

test('US2 (GET): "Last seen" and "App version" say "not measured" (with the flag the page turns into the reason) until their migrations exist; when measured they pass through', withEnv(async () => {
  const g = await get(world(), '?user_id=' + CONF);
  assert.deepEqual(g.json.card.last_seen, { measured: false, at: null });
  assert.deepEqual(g.json.card.app_version, { measured: false, value: null });
  const m = await get(world({ extraKeys: { last_seen_measured: true, last_seen_at: '2026-10-21T08:00:00+00:00', app_version_measured: true, app_version: '1.3.1' } }), '?user_id=' + CONF);
  assert.deepEqual(m.json.card.last_seen, { measured: true, at: '2026-10-21T08:00:00+00:00' });
  assert.deepEqual(m.json.card.app_version, { measured: true, value: '1.3.1' });
}));

test('US4 (GET): an RPC answer carrying any other key (a protocol count, doses, labs, food, weight) never reaches the page; has_active_protocol is forced to a boolean', withEnv(async () => {
  const W = world({ extraKeys: { protocols_live: 4, doses: [1, 2], labs: 'x', food: 1, weight: 80, body_fat: 20, has_active_protocol: 'yes' } });
  const g = await get(W, '?user_id=' + UNCONF);
  assert.equal(g.code, 200);
  const s = JSON.stringify(g.json);
  for (const k of ['protocols_live', 'doses', 'labs', 'food', 'weight', 'body_fat']) assert.ok(!s.includes('"' + k + '"'), k + ' dropped');
  assert.equal(g.json.card.has_active_protocol, true);
  assert.deepEqual(Object.keys(g.json.card).sort(), API_CARD_KEYS.slice().sort());
}));

test('US5 (GET): dashboard links — RevenueCat by the project id (env, not a secret) and the account id; Supabase by the project ref; none when the project id is not set', withEnv(async () => {
  const a = await get(world(), '?user_id=' + CONF);
  assert.equal(a.json.links.revenuecat, null);
  assert.match(a.json.links.supabase, /^https:\/\/supabase\.com\/dashboard\/project\/[a-z0-9]+\/auth\/users$/);
  process.env.REVENUECAT_PROJECT_ID = 'proj1234';
  const b = await get(world(), '?user_id=' + CONF);
  assert.equal(b.json.links.revenuecat, 'https://app.revenuecat.com/projects/proj1234/customers/' + CONF);
  assert.ok(!JSON.stringify(b.json.links).includes('@'), 'no e-mail in a link');
}));

test('Server: GET needs an allow-listed aal2 session; not configured / migration missing → 503 not_configured', withEnv(async () => {
  const W = world();
  const s = await F.call(api(), { method: 'GET', url: '/api/adm-account?user_id=' + CONF, headers: {} }, { data: W.data });
  assert.equal(s.code, 401); assert.equal(s.dataCalls.length, 0);
  const x = await get(W, '?user_id=' + CONF, { who: 'stranger' });
  assert.equal(x.code, 403);
  const m = await get(world({ fail: { card: 404 } }), '?user_id=' + CONF);
  assert.equal(m.code, 503); assert.equal(m.json.code, 'not_configured');
}));

// ================================================================== server: resend confirmation (US8)
test('US8: resend goes through the 3.1 write gate (foreign Origin, viewer, no step-up in 15 min) before anything is read or sent', withEnv(async () => {
  const W = world();
  const o = await F.call(api(), { method: 'POST', url: '/api/adm-account', headers: Object.assign(F.bearer('admin', { totpS: 30 }), { origin: 'https://evil.example' }), body: rsBody() }, { data: W.data });
  assert.equal(o.code, 403); assert.equal(o.calls.length, 0);
  const v = await F.call(api(), { method: 'POST', url: '/api/adm-account', headers: Object.assign(F.bearer('viewer', { totpS: 30 }), F.ORIGIN), body: rsBody() }, { data: W.data });
  assert.equal(v.code, 403); assert.equal(v.dataCalls.length, 0);
  const s = await post(W, rsBody(), { totpS: 20 * 60 });
  assert.equal(s.code, 401); assert.equal(s.json.code, 'step_up_required'); assert.equal(s.dataCalls.length, 0);
  assert.equal(W.sent.length, 0); assert.equal(W.log.length, 0);
}));

test('US8: a malformed body → 400 with no call; an unknown account → 404 with no send and no log row', withEnv(async () => {
  for (const b of [{}, 'x{', rsBody({ action: 'force_sign_out' }), rsBody({ action: 'delete' }), rsBody({ user_id: 'x' }), rsBody({ request_id: 'x' }), rsBody({ request_id: undefined })]) {
    const W = world();
    const r = await post(W, b);
    assert.equal(r.code, 400, JSON.stringify(b));
    assert.equal(r.dataCalls.length, 0);
  }
  const W = world();
  const r = await post(W, rsBody({ user_id: GHOST }));
  assert.equal(r.code, 404); assert.equal(W.sent.length, 0); assert.equal(W.log.length, 0);
}));

test('US8: a confirmed account or an OAuth (Google / Apple) account → 409 before any call to Supabase Auth and before any log row', withEnv(async () => {
  const W = world();
  const a = await post(W, rsBody({ user_id: CONF }));
  assert.equal(a.code, 409); assert.equal(a.json.code, 'already_confirmed');
  const b = await post(W, rsBody({ user_id: GOOG, request_id: RID(2) }));
  assert.equal(b.code, 409); assert.equal(b.json.code, 'not_email_signup');
  assert.equal(W.sent.length, 0);
  assert.equal(W.log.length, 0);
  for (const r of [a, b]) {
    assert.ok(!r.dataCalls.some((c) => c.url.startsWith(RESEND)), 'no Supabase Auth call');
    assert.ok(!r.dataCalls.some((c) => c.url.endsWith('/rpc/admin_resend_begin')), 'refused before the log');
  }
}));

test('US8: an unconfirmed e-mail sign-up → one Supabase Auth resend (type signup, the account e-mail, the app\'s confirm-email link), one log row (actor, user_id, status ok); the answer carries no e-mail', withEnv(async () => {
  const W = world();
  const r = await post(W, rsBody());
  assert.equal(r.code, 200, r.body);
  assert.equal(r.json.ok, true); assert.equal(r.json.action, 'resend_confirmation');
  assert.ok(!r.body.includes('@'));
  assert.equal(W.sent.length, 1);
  assert.deepEqual(W.sent[0].body, { type: 'signup', email: 'nova@x.y' });
  assert.equal(W.sent[0].url, RESEND + '?redirect_to=' + encodeURIComponent('dosetrace://confirm-email'));
  const call = r.calls.find((c) => c.url.startsWith(RESEND));
  assert.equal(call.method, 'POST');
  assert.equal(W.log.length, 1);
  const row = W.log[0];
  assert.equal(row.actor, F.USERS.admin.id); assert.equal(row.user_id, UNCONF); assert.equal(row.action, 'resend_confirmation');
  assert.equal(row.status, 'ok'); assert.equal(row.http, 200); assert.equal(row.reason, null);
  assert.ok(!JSON.stringify(row.result).includes('@'), 'no e-mail in the stored answer');
}));

test('US8: at most 1 send per account per hour (429 rate_account, nothing sent); the same request_id again → the stored answer, still one e-mail', withEnv(async () => {
  const W = world();
  const a = await post(W, rsBody({ request_id: RID(11) }));
  const again = await post(W, rsBody({ request_id: RID(11) }));
  assert.equal(again.code, 200); assert.deepEqual(again.json, a.json);
  const b = await post(W, rsBody({ request_id: RID(12) }));
  assert.equal(b.code, 429); assert.equal(b.json.code, 'rate_account'); assert.ok(b.json.retry_after > 0);
  assert.equal(W.sent.length, 1); assert.equal(W.log.length, 1);
}));

test('US8: Supabase Auth refusing (429 / 4xx / 5xx / timeout) → the row ends failed with the http, the panel gets its own code, a failed send does not block a retry', withEnv(async () => {
  const cases = [[429, 429, 'auth_rate'], [400, 502, 'auth_rejected'], [500, 502, 'auth_down'], ['timeout', 504, 'auth_timeout']];
  for (const [fail, status, code] of cases) {
    const W = world({ fail: { resend: fail } });
    const r = await post(W, rsBody());
    assert.equal(r.code, status, String(fail)); assert.equal(r.json.code, code);
    assert.equal(W.log.length, 1); assert.equal(W.log[0].status, 'failed');
    assert.equal(W.log[0].http, fail === 'timeout' ? null : fail);
    W.fail.resend = null;
    const retry = await post(W, rsBody({ request_id: RID(40) }));
    assert.equal(retry.code, 200, 'a failed attempt does not count toward 1 per hour');
  }
}));

test('US5/US8 server: no force sign-out and no delete anywhere — the only write of api/adm-account.js is resend_confirmation; no admin user deletion, no logout of another account in any panel function', () => {
  assert.ok(API_SRC, 'api/adm-account.js exists');
  assert.equal((API_SRC.match(/console\./g) || []).length, 0);
  assert.match(API_SRC, /require\('\.\/_admAuth\.js'\)/);
  assert.ok(!/REVENUECAT_WRITE_KEY|ANTHROPIC_API_KEY/.test(API_SRC));
  const V = api().validate;
  for (const a of ['force_sign_out', 'sign_out', 'logout', 'delete', 'delete_user', 'ban']) assert.ok(V(rsBody({ action: a })).error, a + ' refused');
  for (const f of fs.readdirSync(path.join(ROOT, 'api'))) {
    const s = fs.readFileSync(path.join(ROOT, 'api', f), 'utf8');
    assert.ok(!/auth\/v1\/admin\/users/.test(s), f + ': no Supabase admin user endpoint (no delete / ban / sign-out)');
    assert.ok(!/\/auth\/v1\/logout/.test(s), f + ': no logout of an account');
    assert.ok(!/force_sign_out|delete_user|signOutUser/i.test(s), f);
  }
});

// ================================================================== SQL (migration + versioned mirror)
test('US4 SQL: admin_account_card returns exactly the allowed keys; the only health key is has_active_protocol = exists(a live, active protocol) — no count, no content; service_role only', () => {
  assert.ok(MIG, 'migration file exists');
  const fn = sqlFnIn(MIG, 'admin_account_card');
  const built = fn.match(/return jsonb_build_object\(([\s\S]*?)\n  \);/);
  assert.ok(built, 'one jsonb_build_object answer');
  const outKeys = [...built[1].matchAll(/^\s*'([a-z_]+)',/gm)].map((m) => m[1]);
  assert.deepEqual(outKeys.slice().sort(), CARD_KEYS.slice().sort(), 'exactly the allowed keys (static list)');
  assert.match(built[1], /'has_active_protocol', exists \(select 1 from public\.protocols p where p\.user_id = u\.id and p\.deleted_at is null and p\.active is true\)/);
  assert.ok(!/count\([^)]*\) from public\.protocols|from public\.(dose_logs|doses|labs|lab_results|food_logs|weights|body|biomarkers|reality_checks|calc_)/i.test(fn), 'no health table is read other than the exists() on protocols');
  assert.ok(!/p\.(name|dose|amount|notes|compound|concentration)/.test(fn), 'no protocol content');
  assert.match(fn, /security definer/);
  for (const src of [MIG, SQL]) {
    assert.match(src, /revoke execute on function public\.admin_account_card\(uuid\) from public, anon, authenticated;/);
    assert.match(src, /grant execute on function public\.admin_account_card\(uuid\) to service_role;/);
  }
});

test('US2 SQL: "last seen" and "app version" are read only when their table / column exists (A-119 user_devices, app_releases push_tokens.app_version); otherwise measured = false, never a guess', () => {
  const fn = sqlFnIn(MIG, 'admin_account_card');
  assert.match(fn, /to_regclass\('public\.user_devices'\) is not null/);
  assert.match(fn, /column_name = 'app_version'/);
  assert.match(fn, /v_seen_ok boolean := false/);
  assert.match(fn, /v_ver_ok boolean := false/);
});

test('US4 SQL: the Contas list (admin_accounts_list) shows has_active_protocol yes/no instead of the protocols_live count; still real accounts only, newest first, ids in rows and tests', () => {
  const fn = sqlFnIn(MIG, 'admin_accounts_list');
  assert.ok(!/protocols_live/.test(fn), 'no count any more');
  assert.match(fn, /'has_active_protocol', exists \(select 1 from public\.protocols p where p\.user_id = u\.id and p\.deleted_at is null and p\.active is true\)/);
  assert.match(fn, /from auth\.users u where not public\.admin_is_test\(u\.email\)/);
  assert.match(fn, /jsonb_build_object\('id', u\.id, 'email', lower\(u\.email\), 'kind'/);
  assert.equal(latestFn('admin_accounts_list'), sqlFnIn(SQL, 'admin_accounts_list'), 'the versioned SQL carries the newest body');
});

test('US8 SQL: admin_resend_begin refuses a confirmed / OAuth / unknown account before any row, then 30 per hour per admin (shared counter), then 1 resend per account per hour (ok or pending), then one pending row; finish = admin_action_finish', () => {
  const fn = sqlFnIn(MIG, 'admin_resend_begin');
  const iIdem = fn.indexOf('where request_id = p_request_id'), iConf = fn.indexOf("'already_confirmed'"), iOauth = fn.indexOf("'not_email_signup'"), iActor = fn.indexOf("interval '1 hour'"), iIns = fn.indexOf('insert into public.admin_actions_log');
  assert.ok(iIdem > 0 && iIdem < iConf && iConf < iOauth && iOauth < iActor && iActor < iIns, 'replay, refusals, limits, then the row');
  assert.match(fn, /email_confirmed_at is not null/);
  assert.match(fn, /coalesce\(u\.raw_app_meta_data->>'provider', ''\) <> 'email'/);
  assert.match(fn, /where actor = p_actor and at > now\(\) - interval '1 hour'/);
  assert.match(fn, /if n >= 30 then/);
  assert.match(fn, /action = 'resend_confirmation' and status in \('ok', 'pending'\) and at > now\(\) - interval '1 hour'/);
  assert.match(fn, /pg_advisory_xact_lock\(least\(hashtextextended\('admin_actions:' \|\| p_actor::text, 0\)/);
  assert.match(fn, /security definer/);
  assert.equal(fn, sqlFnIn(SQL, 'admin_resend_begin'));
});

test('US8 SQL: the log accepts resend_confirmation (new migration, check constraints found by column), reason null for it; still no e-mail column; one transaction, NOT APPLIED, nothing in auth', () => {
  assert.match(MIG, /check \(action in \('premium_grant', 'premium_revoke', 'premium_change_end', 'message_send', 'message_withdraw', 'resend_confirmation'\)\)/);
  assert.match(MIG, /\(action like 'premium\\_%' and reason is not null and char_length\(reason\) between 1 and 200\) or \(\(action like 'message\\_%' or action = 'resend_confirmation'\) and reason is null\)/);
  assert.match(MIG, /a\.attname in \('action', 'reason'\)/, 'old constraints dropped by column, not by name');
  assert.ok(!/add column[^;]*email/i.test(MIG));
  assert.match(MIG, /^begin;$/m); assert.match(MIG, /^commit;$/m);
  assert.match(MIG, /STATUS: NOT APPLIED/);
  assert.ok(!/(alter|update|insert into|delete from)\s+auth\./i.test(MIG), 'nothing in the auth schema');
  assert.ok(!/drop table/i.test(MIG.split(/^-- Rollback/m)[0]), 'drops no table');
});

// ================================================================== page (web/adm.html)
function pageT() {
  const script = HTML.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  return (0, eval)('(' + script.match(/var T=(\{[\s\S]*?\n  \});/)[1] + ')');
}
function usPure(lang) {
  const m = HTML.match(/\/\/ \[us-pure-start\]([\s\S]*?)\/\/ \[us-pure-end\]/);
  assert.ok(m, 'users pure block present');
  const pm = HTML.match(/\/\/ \[prem-pure-start\]([\s\S]*?)\/\/ \[prem-pure-end\]/);
  const T = pageT();
  const L = lang || 'en';
  const t = (k, v) => { let s = T[L][k] != null ? T[L][k] : T.en[k]; assert.ok(s != null, 'missing key ' + k); if (v) for (const p of Object.keys(v)) s = String(s).split('{' + p + '}').join(v[p]); return s; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = (0, eval)('(function(){' + pm[1] + m[1] + '\nreturn {accQueryKind:accQueryKind,accSearch:accSearch,usOptions:usOptions,usCardHtml:usCardHtml,usMenuHtml:usMenuHtml,rsDialogHtml:rsDialogHtml,rsErrKey:rsErrKey,US_OPTION_KEYS:US_OPTION_KEYS};})()');
  return { P, t, esc, T };
}
const ROWS = [
  { id: UNCONF, email: 'nova@x.y', created: '2026-10-18', provider: 'email', apple: false, pu: ['ios'], ua: [], onboarded: true, confirmed: false, has_active_protocol: true, last_sign_in: null },
  { id: CONF, email: 'ok@x.y', created: '2026-10-12', provider: 'email', apple: false, pu: [], ua: [], onboarded: true, confirmed: true, has_active_protocol: false, last_sign_in: '2026-10-20' },
];
const TESTS = [{ id: GOOG, email: 'g@x.y', kind: 'list' }];
const CARD = (o) => Object.assign({ created_at: '2026-10-18T14:02:00+00:00', provider: 'email', email_confirmed_at: null, last_sign_in_at: null, platform: 'ios', onboarded: true, test_kind: null, has_active_protocol: true,
  last_seen: { measured: false, at: null }, app_version: { measured: false, value: null }, history: [] }, o || {});
const PLAN_FREE = { premium: false, sources: [], revoke: 'not_premium', promo_expires_at: null, expires_at: null, source: 'free' };
const PE = '2027-01-10T12:00:00.000Z';
const PLAN_PROMO = { premium: true, sources: [{ kind: 'promotional', expires_at: PE }], revoke: 'ok', promo_expires_at: PE, expires_at: PE, source: 'promotional' };
const ST = (o) => Object.assign({ id: UNCONF, phase: 'ok', user: { id: UNCONF, short: UNCONF.slice(0, 8), email: 'nova@x.y' }, card: CARD(), plan: PLAN_FREE, rc: 'ok', links: { revenuecat: null, supabase: 'https://supabase.com/dashboard/project/ref/auth/users' }, menu: false, lang: 'pt', isTest: false }, o || {});

test('US1 page: the search finds by e-mail (part, any case), by exact Supabase id and by exact RevenueCat id (= the Supabase id the app logs in with) across real and test accounts; an anonymous RC id says it is not an account', () => {
  const { P } = usPure('pt');
  assert.equal(P.accQueryKind('Nova@'), 'email');
  assert.equal(P.accQueryKind(' ' + UNCONF.toUpperCase() + ' '), 'id');
  assert.equal(P.accQueryKind('$RCAnonymousID:8f2c1a0b9d3e4f5a'), 'rc_anon');
  assert.equal(P.accQueryKind(''), 'none');
  const AL = { rows: ROWS, tests: TESTS };
  const byId = P.accSearch(AL, UNCONF.toUpperCase());
  assert.equal(byId.kind, 'id'); assert.deepEqual(byId.hits.map((h) => h.row.id), [UNCONF]); assert.equal(byId.hits[0].test, false);
  const testHit = P.accSearch(AL, GOOG);
  assert.deepEqual(testHit.hits.map((h) => [h.row.email, h.test]), [['g@x.y', true]], 'a test account is found by its id too');
  assert.deepEqual(P.accSearch(AL, GHOST).hits, []);
  const anon = P.accSearch(AL, '$RCAnonymousID:8f2c1a0b9d3e4f5a');
  assert.equal(anon.kind, 'rc_anon'); assert.deepEqual(anon.hits, []);
  const T = pageT();
  assert.match(T.pt.us_rc_anon, /não é uma conta/);
  assert.match(T.pt.us_search_ph, /e-mail/); assert.match(T.pt.us_search_ph, /Supabase/); assert.match(T.pt.us_search_ph, /RevenueCat/);
  assert.match(HTML, /var hit=accSearch\(AL,ACCQ\)/, 'the Contas list uses the search');
});

test('US2/US3/US4 page: the card shows plan + source, created, sign-in method, e-mail confirmed, last sign-in, last seen and app version as "Não medido" with the reason, platform, test account, onboarding and "Protocolo ativo: Sim/Não" — and no other health field', () => {
  const { P, t, esc, T } = usPure('pt');
  const h = P.usCardHtml(ST(), t, esc);
  for (const k of ['us_f_plan', 'us_f_created', 'us_f_method', 'us_f_confirmed', 'us_f_last_sign_in', 'us_f_last_seen', 'us_f_platform', 'us_f_version', 'us_f_test', 'us_f_onboarded', 'us_f_protocol']) assert.ok(h.includes('<dt>' + T.pt[k] + '</dt>'), k);
  assert.ok(h.includes(T.pt.pm_free), 'plan from RevenueCat (3.2 reader)');
  assert.ok(h.includes(T.pt.us_nm) && h.includes(T.pt.us_nm_seen) && h.includes(T.pt.us_nm_version), 'not measured + the reasons');
  assert.ok(h.includes('<dt>' + T.pt.us_f_protocol + '</dt><dd>' + T.pt.acc_yes + '</dd>'));
  assert.ok(P.usCardHtml(ST({ card: CARD({ has_active_protocol: false }) }), t, esc).includes('<dt>' + T.pt.us_f_protocol + '</dt><dd>' + T.pt.acc_no + '</dd>'));
  assert.ok(h.includes('class="pm-email">nova@x.y<'));
  assert.ok(h.includes(UNCONF), 'the full id');
  const promo = P.usCardHtml(ST({ plan: PLAN_PROMO }), t, esc);
  assert.ok(promo.includes(T.pt.pm_src_promotional), 'promotional source named (US3)');
  const store = P.usCardHtml(ST({ plan: { premium: true, sources: [{ kind: 'play_store', expires_at: PE }], revoke: 'source_store', promo_expires_at: null, expires_at: PE, source: 'play_store' } }), t, esc);
  assert.ok(store.includes(T.pt.pm_src_play_store));
  const rcOff = P.usCardHtml(ST({ plan: null, rc: 'rc_timeout' }), t, esc);
  assert.ok(rcOff.includes(t('us_plan_err', { c: 'rc_timeout' })));
  const measured = P.usCardHtml(ST({ card: CARD({ last_seen: { measured: true, at: '2026-10-21T08:00:00+00:00' }, app_version: { measured: true, value: '1.3.1' } }) }), t, esc);
  assert.ok(measured.includes('1.3.1') && !measured.includes(T.pt.us_nm_seen));
  for (const bad of ['protocols_live', 'dose', 'lab', 'food', 'weight']) assert.ok(!new RegExp('us_f_' + bad).test(HTML), 'no ' + bad + ' field');
  const tk = P.usCardHtml(ST({ card: CARD({ test_kind: 'list' }), isTest: true }), t, esc);
  assert.ok(tk.includes(T.pt.us_test_list));
});

test('US2 page: the card history lists the panel actions on this account (newest first) with their status; empty says so', () => {
  const { P, t, esc, T } = usPure('pt');
  const hist = [{ at: '2026-10-22T05:32:05+00:00', action: 'premium_revoke', status: 'ok' }, { at: '2026-10-22T05:27:43+00:00', action: 'premium_grant', status: 'ok' }, { at: '2026-10-20T10:00:00+00:00', action: 'mark_test', status: 'ok' }];
  const h = P.usCardHtml(ST({ card: CARD({ history: hist }) }), t, esc);
  const i1 = h.indexOf(T.pt.us_h_premium_revoke), i2 = h.indexOf(T.pt.us_h_premium_grant), i3 = h.indexOf(T.pt.us_h_mark_test);
  assert.ok(i1 > 0 && i1 < i2 && i2 < i3);
  assert.ok(P.usCardHtml(ST(), t, esc).includes(T.pt.us_hist_none));
  for (const a of ['premium_grant', 'premium_revoke', 'premium_change_end', 'message_send', 'message_withdraw', 'resend_confirmation', 'mark_test', 'unmark_test']) assert.ok(T.pt['us_h_' + a], a);
});

test('Opções (founder 2026-10-22): ONE "Opções" button on the selected account\'s card; it lists only the actions that apply — Premium (grant / change end / revoke by the plan), message, copy id, RevenueCat / Supabase, test marking, resend only for an unconfirmed e-mail sign-up', () => {
  const { P, t, esc, T } = usPure('pt');
  assert.equal(T.pt.us_options, 'Opções');
  const keys = (o) => P.usOptions(ST(o)).map((x) => x.key);
  assert.deepEqual(keys({}), ['grant', 'message', 'copy', 'rc', 'sb', 'mark', 'resend']);
  assert.deepEqual(keys({ plan: PLAN_PROMO }), ['change_end', 'revoke', 'message', 'copy', 'rc', 'sb', 'mark', 'resend']);
  assert.deepEqual(keys({ card: CARD({ email_confirmed_at: '2026-10-18T15:00:00+00:00' }) }), ['grant', 'message', 'copy', 'rc', 'sb', 'mark'], 'confirmed: no resend');
  assert.deepEqual(keys({ card: CARD({ provider: 'google' }) }), ['grant', 'message', 'copy', 'rc', 'sb', 'mark'], 'OAuth: no resend');
  assert.deepEqual(keys({ card: CARD({ provider: 'apple', email_confirmed_at: null }) }), ['grant', 'message', 'copy', 'rc', 'sb', 'mark'], 'Apple without a confirmation date: still no resend');
  assert.deepEqual(keys({ isTest: true, card: CARD({ test_kind: 'list' }) }), ['grant', 'message', 'copy', 'rc', 'sb', 'unmark', 'resend'], 'a test account: unmark');
  assert.deepEqual(keys({ plan: null, rc: 'rc_timeout' }), ['premium', 'message', 'copy', 'rc', 'sb', 'mark', 'resend'], 'plan unknown: one Premium entry, the dialog explains');
  const rcOff = P.usOptions(ST()).find((x) => x.key === 'rc');
  assert.equal(rcOff.disabled, true, 'no RevenueCat project id → disabled with the reason');
  const rcOn = P.usOptions(ST({ links: { revenuecat: 'https://app.revenuecat.com/projects/p/customers/' + UNCONF, supabase: 'https://supabase.com/dashboard/project/r/auth/users' } })).find((x) => x.key === 'rc');
  assert.ok(!rcOn.disabled);
  // Never a force sign-out or a delete (US5, founder Q2).
  assert.deepEqual(P.US_OPTION_KEYS, ['grant', 'change_end', 'revoke', 'premium', 'message', 'copy', 'rc', 'sb', 'mark', 'unmark', 'resend']);
  for (const k of P.US_OPTION_KEYS) assert.ok(!/sign|logout|delete|ban/i.test(k));
  const card = P.usCardHtml(ST(), t, esc);
  assert.equal((card.match(/data-us="menu"/g) || []).length, 1, 'one Opções button');
  const menu = P.usMenuHtml(ST({ menu: true }), t, esc);
  assert.ok(menu.includes(T.pt.us_o_grant) && menu.includes(T.pt.us_o_message) && menu.includes(T.pt.us_o_resend));
  assert.ok(!/sair|excluir|apagar|deslogar/i.test(menu));
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of Object.keys(T[l]).filter((x) => /^us_o_/.test(x))) assert.ok(!/sign.?out|delete|excluir|eliminar|supprimer|löschen|elimina|abmelden|déconnect|desconectar|disconnetti/i.test(T[l][k]), l + ' ' + k);
});

test('Opções page: the menu reuses the existing dialogs unchanged — Premium opens the 3.2 dialog on the chosen action, Mensagem opens the A-163 dialog, test marking goes through the existing confirm; the per-row Premium / Mensagem buttons are gone (rebuild = replace)', () => {
  assert.ok(!/class="pm-rowbtn"/.test(HTML), 'no row buttons');
  assert.ok(!/\.pm-rowbtn\{/.test(HTML) && !/\.ms-acts\{/.test(HTML), 'their styles are gone too');
  assert.ok(!/onclick="openPremium\(/.test(HTML) && !/onclick="openMessage\(/.test(HTML), 'no inline row action');
  assert.match(HTML, /if\(k==='grant'\|\|k==='change_end'\|\|k==='revoke'\|\|k==='premium'\)\{usCloseMenu\(\);window\.openPremium\(id,k==='premium'\?null:k\);/);
  assert.match(HTML, /if\(k==='message'\)\{usCloseMenu\(\);window\.openMessage\(id\);/);
  assert.match(HTML, /if\(k==='mark'\|\|k==='unmark'\)\{usCloseMenu\(\);SEL=\{\};SEL\[US\.user\.email\]=1;window\.markTests\(k==='mark'\);/);
  assert.match(HTML, /window\.openPremium=function\(id,want\)\{/);
  assert.match(HTML, /if\(PM\.want&&premActions\(x\.j\.plan\)\[PM\.want\]\)PM\.action=PM\.want;/, 'the chosen action, only when the plan allows it');
  assert.match(HTML, /<tr class="acc-row[^"]*"[^>]*data-acc="'\+esc\(r\.id\)\+'"/, 'a row selects its account');
});

test('US8 page: the resend dialog names the e-mail it goes to, says 1 per account per hour, asks the step-up first and posts to /api/adm-account; every error has its own text in 6 languages', () => {
  const { P, t, esc, T } = usPure('pt');
  const d = P.rsDialogHtml({ phase: 'form', email: 'nova@x.y', busy: false }, t, esc);
  assert.ok(d.includes('nova@x.y'));
  assert.ok(d.includes(T.pt.rs_body) && d.includes(T.pt.rs_note));
  assert.match(T.pt.rs_note, /1 /);
  assert.match(d, /data-rs="go"/); assert.match(d, /data-rs="close"/);
  const done = P.rsDialogHtml({ phase: 'done', email: 'nova@x.y' }, t, esc);
  assert.ok(done.includes(t('rs_done', { e: 'nova@x.y' })));
  const codes = ['already_confirmed', 'not_email_signup', 'rate_account', 'rate_actor', 'auth_rate', 'auth_rejected', 'auth_down', 'auth_timeout', 'not_found', 'not_configured', 'request_reused', 'in_progress', 'invalid'];
  const keys = new Set(codes.map((c) => P.rsErrKey(409, c)));
  assert.equal(keys.size, codes.length);
  assert.equal(P.rsErrKey(403, 'role'), 'rs_e_forbidden'); assert.equal(P.rsErrKey(0), 'rs_e_conn'); assert.equal(P.rsErrKey(500, 'x'), 'rs_e_generic');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of [...keys, 'rs_e_forbidden', 'rs_e_conn', 'rs_e_generic']) assert.ok(T[l][k], l + ' ' + k);
  const fn = HTML.match(/function rsSend\(\)\{[\s\S]*?\n  \}/);
  assert.ok(fn, 'rsSend');
  assert.match(fn[0], /AUTH\.needsStepUp\(\)/); assert.match(fn[0], /openStepUp\(/); assert.match(fn[0], /path:'\/api\/adm-account'/);
  assert.match(fn[0], /action:'resend_confirmation'/);
});

test('US6: test accounts stay out of the main list and every number (TM8 unchanged); the card of a test account is reached through the Contas de teste view or an exact id', () => {
  const fn = latestFn('admin_accounts_list');
  assert.match(fn, /'rows', coalesce\(\([\s\S]*?from auth\.users u where not public\.admin_is_test\(u\.email\)\), '\[\]'::jsonb\)/);
  assert.match(fn, /'tests', coalesce\(\(select jsonb_agg/);
  assert.match(HTML, /data-acc="'\+esc\(x\.id\)\+'"/, 'test rows select their account too');
});

test('US7: every us_ and rs_ label exists in all 6 languages (parity); Portuguese formal; no emoji; the users styles use tokens only and fit 420 px (the card turns full screen)', () => {
  const T = pageT();
  for (const pre of ['us_', 'rs_']) {
    const en = Object.keys(T.en).filter((k) => k.startsWith(pre));
    assert.ok(en.length >= (pre === 'us_' ? 50 : 15), pre + ' labels present: ' + en.length);
    for (const l of ['es', 'pt', 'fr', 'de', 'it']) assert.deepEqual(Object.keys(T[l]).filter((k) => k.startsWith(pre)).sort(), en.slice().sort(), l + ' ' + pre + ' parity');
    for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of en) {
      assert.ok(String(T[l][k]).trim(), l + ' ' + k + ' empty');
      assert.ok(!/\p{Extended_Pictographic}/u.test(T[l][k]), 'no emoji ' + l + ' ' + k);
    }
    for (const k of en) assert.ok(!/\bNão deu\b|\bdá para\b|\ba gente\b|\bpra\b|\bnão dá\b/i.test(T.pt[k]), 'formal pt: ' + T.pt[k]);
  }
  const css = HTML.match(/\/\* \[users-css-start\] \*\/([\s\S]*?)\/\* \[users-css-end\] \*\//);
  assert.ok(css, 'users css block');
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\bwhite\b|\bblack\b/i.test(css[1].replace(/#(acc-card|rsd|us-menu)\b/g, '').replace(/white-space/g, '')), 'tokens only');
  assert.match(css[1], /@media\(max-width:999px\)\{[\s\S]*\.acc-card\.open\{[^}]*position:fixed;inset:0/);
  assert.match(css[1], /@media\(max-width:640px\)/);
  assert.ok(!/width:\s*[5-9]\d\dpx|width:\s*\d{4}px/.test(css[1].replace(/max-width:\s*\d+px/g, '').replace(/min-width:\s*\d+px/g, '')), 'no fixed width wider than a phone');
});

// Found by the local Postgres rehearsal (2026-10-22): since A-163 the reason check covers BOTH action and reason,
// so a loop joining pg_attribute by column returns that constraint twice and the second DROP fails, aborting the
// whole migration. The loop must take each constraint name once.
test('US8 SQL bug: the constraint loop drops each matching check constraint once (distinct names), so a constraint over action AND reason does not abort the migration', () => {
  const loop = MIG.match(/do \$\$\ndeclare c record;[\s\S]*?\n\$\$;/);
  assert.ok(loop, 'the constraint loop');
  assert.match(loop[0], /select distinct con\.conname from pg_constraint con/);
  const mirror = SQL.split('3.3 Users tab (docs/specs/admin-panel.md')[1] || '';
  assert.match(mirror, /select distinct con\.conname from pg_constraint con/, 'same in the versioned SQL');
});

// DT Council 2026-10-22: the three migrations already live in production say so in their header, so nobody
// re-applies or rolls them back by mistake. The 3.3 / TM-25 migration stays NOT APPLIED until the founder's go.
test('DT Council: migration headers — 20261021000000 APPLIED 2026-10-21, 20261022120000 APPLIED 2026-10-22, 20261022180000 APPLIED in production 2026-10-22 (founder go); 20261022200000 still NOT APPLIED', () => {
  const head = (f) => fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', f), 'utf8').split(/^begin;$/m)[0];
  assert.match(head('20261021000000_admin_users.sql'), /-- STATUS: APPLIED 2026-10-21/);
  assert.match(head('20261022120000_admin_actions_log.sql'), /-- STATUS: APPLIED 2026-10-22/);
  assert.match(head('20261022180000_team_messages.sql'), /-- STATUS: APPLIED in production 2026-10-22 \(founder go\)/);
  for (const f of ['20261021000000_admin_users.sql', '20261022120000_admin_actions_log.sql', '20261022180000_team_messages.sql']) assert.ok(!/NOT APPLIED/.test(head(f)), f);
  assert.match(head('20261022200000_admin_users_tab.sql'), /-- STATUS: NOT APPLIED/);
});
