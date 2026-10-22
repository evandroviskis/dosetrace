'use strict';
// A-163 — Messages from the DoseTrace team, the ADMIN PANEL side (dosetrace docs/specs/team-messages.md,
// signed by the founder 2026-10-22): rows TM-1..TM-10, TM-21 and the server half of TM-11/TM-12.
// Server half: api/adm-messages.js behind the 3.1 write gate; the Supabase RPCs are answered by an
// in-memory database that follows supabase/migrations/20261022180000_team_messages.sql, and the Expo
// push service is faked (no network). Page half: web/adm.html (pure block + static checks).
// Dummy ids, tokens and e-mails only — never a real token, key or account.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('./helpers/admAuthFake.js');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'web', 'adm.html'), 'utf8');
const SQL = fs.readFileSync(path.join(ROOT, 'supabase_admin_rpcs.sql'), 'utf8');
const MIG_PATH = path.join(ROOT, 'supabase', 'migrations', '20261022180000_team_messages.sql');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';
const API_PATH = path.join(ROOT, 'api', 'adm-messages.js');
const API_SRC = fs.existsSync(API_PATH) ? fs.readFileSync(API_PATH, 'utf8') : '';
function api() { return require(API_PATH); }

const EXPO = 'https://exp.host/--/api/v2/push/send';
const TARGET = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
const NODEV = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';
const QUIET = 'cccccccc-3333-4ccc-8ccc-cccccccccccc';
const GHOST = 'dddddddd-4444-4ddd-8ddd-dddddddddddd';
const RID = (n) => String(n).padStart(8, '0') + '-0000-4000-8000-' + String(n).padStart(12, '0');
const TOK = (n) => 'ExponentPushToken[dummy-' + n + ']';
const MSG = 'Seu acesso Premium foi liberado por 1 ano. Obrigado por testar o DoseTrace.';
const TITLES = {
  en: 'DoseTrace team message',
  pt: 'Mensagem da equipe DoseTrace',
  es: 'Mensaje del equipo de DoseTrace',
  fr: "Message de l'équipe DoseTrace",
  de: 'Nachricht vom DoseTrace-Team',
  it: 'Messaggio dal team di DoseTrace',
};

function withEnv(fn) { return async () => { F.envOn(); try { await fn(); } finally { F.envOff(); } }; }

// ------------------------------------------------------------------ the fake world
// Accounts (auth.users + user_metadata + push_tokens), team_messages and the shared admin_actions_log,
// with the same rules as the migration's functions. Expo answers one ticket per message.
function world(opts) {
  const o = opts || {};
  const now = () => Date.now();
  const accounts = Object.assign({
    [TARGET]: { email: 'Carla@x.y', meta: { language: 'pt' }, tokens: [{ token: TOK(1), platform: 'ios' }, { token: TOK(2), platform: 'android' }] },
    [NODEV]: { email: 'diego@x.y', meta: { language: 'pt' }, tokens: [] },
    [QUIET]: { email: 'quiet@x.y', meta: { language: 'en', silent_mode: true }, tokens: [{ token: TOK(3), platform: 'android' }] },
  }, o.accounts || {});
  const log = []; // admin_actions_log (Premium and messages share it)
  const msgs = []; // team_messages
  const pushes = []; // every message posted to Expo
  const W = { accounts, log, msgs, pushes, fail: o.fail || {} };
  let seq = 0;
  const uuid = () => { seq++; return 'eeeeeeee-0000-4000-8000-' + String(seq).padStart(12, '0'); };
  const lang = (m) => (['en', 'es', 'pt', 'fr', 'de', 'it'].includes(String((m || {}).language || '').slice(0, 2).toLowerCase()) ? String(m.language).slice(0, 2).toLowerCase() : null);
  function info(id) {
    const a = accounts[id];
    if (!a) return null;
    const history = msgs.filter((m) => m.user_id === id).sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, 50).map((m) => {
      const l = log.find((r) => r.message_id === m.id && r.action === 'message_send') || {};
      return { id: m.id, body: m.body, created_at: m.created_at, read_at: m.read_at, withdrawn_at: m.withdrawn_at, devices: l.devices == null ? null : l.devices, accepted: l.accepted == null ? null : l.accepted, failed: l.failed == null ? null : l.failed, silent: !!(l.result && l.result.body && l.result.body.silent) };
    });
    return { user_id: id, email: a.email.toLowerCase(), language: lang(a.meta), silent: !!(a.meta && a.meta.silent_mode === true), tokens: a.tokens.slice(), history };
  }
  const limitedActor = (actor) => log.filter((r) => r.actor === actor && r.at > now() - 3600e3).length >= (o.actorLimit || 30);
  W.addMsg = (id, body, extra) => { const m = Object.assign({ id: uuid(), user_id: id, body, created_at: new Date(now() - 1000 * (msgs.length + 1) * 60).toISOString(), read_at: null, withdrawn_at: null }, extra || {}); msgs.push(m); return m; };
  W.data = async (u, body, init) => {
    if (u === F.SB + '/rest/v1/rpc/admin_message_info') {
      if (W.fail.info) return F.json({ message: 'function does not exist' }, W.fail.info);
      return F.json(info(body.p_user_id));
    }
    if (u === F.SB + '/rest/v1/rpc/admin_message_begin') {
      if (W.fail.begin) return F.json({ message: 'boom' }, W.fail.begin);
      const b = body;
      const ex = log.find((r) => r.request_id === b.p_request_id);
      if (ex) {
        const m = msgs.find((x) => x.id === ex.message_id);
        if (ex.actor !== b.p_actor || ex.action !== 'message_send' || ex.user_id !== b.p_user_id || !m || m.body !== b.p_body) return F.json({ state: 'conflict' });
        if (ex.status === 'pending') return F.json({ state: 'in_progress' });
        return F.json({ state: 'existing', http: ex.http, result: ex.result });
      }
      if (limitedActor(b.p_actor)) return F.json({ state: 'limited', scope: 'actor', retry_after: 120 });
      if (log.some((r) => r.user_id === b.p_user_id && r.action === 'message_send' && r.at > now() - 60e3)) return F.json({ state: 'limited', scope: 'account', retry_after: 42 });
      if (!accounts[b.p_user_id]) return F.json({ state: 'not_found' });
      const m = { id: uuid(), user_id: b.p_user_id, body: b.p_body, created_at: new Date().toISOString(), read_at: null, withdrawn_at: null };
      msgs.push(m);
      const row = { id: log.length + 1, at: now(), request_id: b.p_request_id, actor: b.p_actor, action: 'message_send', user_id: b.p_user_id, message_id: m.id, reason: null, status: 'pending', http: null, devices: null, accepted: null, failed: null, result: null };
      log.push(row);
      return F.json({ state: 'started', id: row.id, message_id: m.id, created_at: m.created_at });
    }
    if (u === F.SB + '/rest/v1/rpc/admin_message_finish') {
      const row = log.find((r) => r.id === body.p_id && r.status === 'pending' && r.action === 'message_send');
      if (row) Object.assign(row, { status: 'ok', devices: body.p_devices, accepted: body.p_accepted, failed: body.p_failed, http: body.p_http, result: body.p_result });
      return F.json(!!row);
    }
    if (u === F.SB + '/rest/v1/rpc/admin_message_withdraw') {
      const b = body;
      const ex = log.find((r) => r.request_id === b.p_request_id);
      if (ex) {
        if (ex.actor !== b.p_actor || ex.action !== 'message_withdraw' || ex.user_id !== b.p_user_id || ex.message_id !== b.p_message_id) return F.json({ state: 'conflict' });
        return F.json({ state: 'existing', http: ex.http, result: ex.result });
      }
      if (limitedActor(b.p_actor)) return F.json({ state: 'limited', scope: 'actor', retry_after: 120 });
      const m = msgs.find((x) => x.id === b.p_message_id && x.user_id === b.p_user_id);
      let status = 'ok', http = 200, res;
      if (m && !m.withdrawn_at && !m.read_at) {
        m.withdrawn_at = new Date().toISOString();
        res = { status: 200, body: { ok: true, action: 'withdraw', request_id: b.p_request_id, message_id: m.id, withdrawn_at: m.withdrawn_at } };
      } else {
        status = 'refused'; http = 409;
        res = { status: 409, body: { ok: false, action: 'withdraw', request_id: b.p_request_id, code: !m ? 'message_not_found' : m.withdrawn_at ? 'already_withdrawn' : 'already_read' } };
      }
      log.push({ id: log.length + 1, at: now(), request_id: b.p_request_id, actor: b.p_actor, action: 'message_withdraw', user_id: b.p_user_id, message_id: m ? m.id : null, reason: null, status, http, devices: null, accepted: null, failed: null, result: res });
      return F.json({ state: 'done', http, result: res });
    }
    if (u === EXPO) {
      if (W.fail.expo === 'timeout') { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; }
      if (W.fail.expo) return F.json({ errors: [{ code: 'INTERNAL_SERVER_ERROR' }] }, W.fail.expo);
      const list = Array.isArray(body) ? body : [body];
      pushes.push(...list);
      return F.json({ data: list.map((m) => ((W.fail.tokens || []).includes(m.to) ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'ticket-' + m.to })) });
    }
    throw new Error('unexpected call ' + u);
  };
  return W;
}

const H = (o) => Object.assign(F.bearer('admin', Object.assign({ totpS: 30 }, o || {})), F.ORIGIN);
function post(W, body, o) { return F.call(api(), { method: 'POST', url: '/api/adm-messages', headers: H(o), body }, { data: W.data }); }
function get(W, q, o) { return F.call(api(), { method: 'GET', url: '/api/adm-messages' + (q || ''), headers: F.bearer(o && o.who ? o.who : 'admin', o) }, { data: W.data }); }
function sendBody(o) { return Object.assign({ request_id: RID(1), action: 'send', user_id: TARGET, text: MSG }, o || {}); }
const expoCalls = (r) => r.calls.filter((c) => c.url === EXPO);

// ================================================================== server
test('TM-1/TM-8 (GET): the account behind the id with its app language, the fixed title in that language, devices with notifications (count + platforms, never the tokens), Silent mode and the history newest first', withEnv(async () => {
  const W = world();
  const old = W.addMsg(TARGET, 'older', { read_at: new Date(Date.now() - 3600e3).toISOString() });
  const recent = W.addMsg(TARGET, 'newer', { created_at: new Date().toISOString() });
  const g = await get(W, '?user_id=' + TARGET);
  assert.equal(g.code, 200, g.body);
  assert.deepEqual(g.json.user, { id: TARGET, short: TARGET.slice(0, 8), email: 'carla@x.y' });
  assert.equal(g.json.language, 'pt');
  assert.equal(g.json.title, TITLES.pt);
  assert.equal(g.json.silent, false);
  assert.deepEqual(g.json.devices, { count: 2, platforms: ['ios', 'android'] });
  assert.ok(!g.body.includes('ExponentPushToken'), 'push tokens never leave the server');
  assert.deepEqual(g.json.history.map((h) => h.id), [recent.id, old.id], 'newest first');
  assert.deepEqual(Object.keys(g.json.history[0]).sort(), ['accepted', 'body', 'created_at', 'devices', 'failed', 'id', 'read_at', 'silent', 'withdrawn_at']);
  assert.equal(g.headers['cache-control'], 'no-store');
  assert.equal(expoCalls(g).length, 0, 'reading never pushes');
  const q = await get(world(), '?user_id=' + QUIET);
  assert.equal(q.json.silent, true); assert.equal(q.json.title, TITLES.en);
  assert.deepEqual(q.json.devices, { count: 1, platforms: ['android'] });
}));

test('TM-8 (GET): an account whose app never reported its language → language null and the title in English; an unknown id → 404; a bad id → 400 with no call', withEnv(async () => {
  const W = world({ accounts: { [GHOST.replace('dddd', 'ffff')]: { email: 'nolang@x.y', meta: {}, tokens: [] } } });
  const id = GHOST.replace('dddd', 'ffff');
  const g = await get(W, '?user_id=' + id);
  assert.equal(g.json.language, null); assert.equal(g.json.title, TITLES.en);
  assert.deepEqual(g.json.devices, { count: 0, platforms: [] });
  const n = await get(W, '?user_id=' + GHOST);
  assert.equal(n.code, 404); assert.equal(n.json.code, 'not_found');
  const b = await get(W, '?user_id=nope');
  assert.equal(b.code, 400); assert.equal(b.dataCalls.length, 0);
  const viewer = await get(W, '?user_id=' + TARGET, { who: 'viewer' });
  assert.equal(viewer.code, 200, 'a viewer may read the history, never send');
}));

test('TM-3 (server): an empty, blank, over-200-character or malformed message is refused (400) before any call; 200 characters (counted as characters, not UTF-16 units) pass', withEnv(async () => {
  const bad = [
    {}, 'not json{', sendBody({ action: 'broadcast' }), sendBody({ text: '' }), sendBody({ text: '   \n ' }), sendBody({ text: 'x'.repeat(201) }), sendBody({ text: 5 }),
    sendBody({ text: 'bell\u0007' }), sendBody({ user_id: 'nope' }), sendBody({ request_id: 'abc' }), sendBody({ request_id: undefined }),
    { request_id: RID(2), action: 'withdraw', user_id: TARGET }, { request_id: RID(2), action: 'withdraw', user_id: TARGET, message_id: 'x' },
  ];
  for (const b of bad) {
    const W = world();
    const r = await post(W, b);
    assert.equal(r.code, 400, JSON.stringify(b).slice(0, 100));
    assert.equal(r.dataCalls.length, 0, 'no call for ' + JSON.stringify(b).slice(0, 80));
  }
  const V = api().validate;
  assert.ok(!V(sendBody({ text: 'x'.repeat(200) })).error);
  assert.ok(!V(sendBody({ text: '\u{1F600}'.repeat(200) })).error, '200 characters even when each is 2 UTF-16 units');
  assert.ok(V(sendBody({ text: '\u{1F600}'.repeat(201) })).error);
  const v = V(sendBody({ text: '  Linha 1\r\nLinha 2  ', user_id: TARGET.toUpperCase() }));
  assert.equal(v.text, 'Linha 1\nLinha 2', 'ends trimmed, CRLF → LF, otherwise exactly as typed');
  assert.equal(v.user_id, TARGET);
  assert.equal(api().MAX_LEN, 200);
}));

test('TM-3 (server): the same request_id sent twice → one message, one push per device and the same answer (a double-click or a retry sends once)', withEnv(async () => {
  const W = world();
  const a = await post(W, sendBody({ request_id: RID(3) }));
  const b = await post(W, sendBody({ request_id: RID(3) }));
  assert.equal(a.code, 200, a.body);
  assert.deepEqual(b.json, a.json);
  assert.equal(b.code, a.code);
  assert.equal(W.msgs.length, 1); assert.equal(W.pushes.length, 2); assert.equal(expoCalls(b).length, 0);
  assert.equal(W.log.length, 1);
  const c = await post(W, sendBody({ request_id: RID(3), text: 'other text' }));
  assert.equal(c.code, 409); assert.equal(c.json.code, 'request_reused'); assert.equal(expoCalls(c).length, 0);
  W.log.push({ id: 99, at: Date.now(), request_id: RID(4), actor: F.USERS.admin.id, action: 'message_send', user_id: NODEV, message_id: W.addMsg(NODEV, 'pending one').id, status: 'pending' });
  const d = await post(W, sendBody({ request_id: RID(4), user_id: NODEV, text: 'pending one' }));
  assert.equal(d.code, 409); assert.equal(d.json.code, 'in_progress');
}));

test('TM-4: send and withdraw go through the 3.1 write gate (Origin, admin role, step-up within 15 min) before anything is read, stored or pushed', withEnv(async () => {
  const W = world();
  const noOrigin = await F.call(api(), { method: 'POST', url: '/api/adm-messages', headers: F.bearer('admin', { totpS: 5 }), body: sendBody() }, { data: W.data });
  assert.equal(noOrigin.code, 403); assert.equal(noOrigin.json.code, 'origin'); assert.equal(noOrigin.calls.length, 0);
  const foreign = await F.call(api(), { method: 'POST', url: '/api/adm-messages', headers: Object.assign(F.bearer('admin', { totpS: 5 }), { origin: 'https://evil.example' }), body: sendBody() }, { data: W.data });
  assert.equal(foreign.code, 403); assert.equal(foreign.calls.length, 0);
  const viewer = await F.call(api(), { method: 'POST', url: '/api/adm-messages', headers: Object.assign(F.bearer('viewer', { totpS: 5 }), F.ORIGIN), body: sendBody() }, { data: W.data });
  assert.equal(viewer.code, 403); assert.equal(viewer.json.code, 'role'); assert.equal(viewer.dataCalls.length, 0);
  const stale = await post(W, sendBody(), { totpS: 16 * 60 });
  assert.equal(stale.code, 401); assert.equal(stale.json.code, 'step_up_required'); assert.equal(stale.dataCalls.length, 0);
  const wd = await post(W, { request_id: RID(5), action: 'withdraw', user_id: TARGET, message_id: RID(6) }, { totpS: 16 * 60 });
  assert.equal(wd.code, 401); assert.equal(wd.dataCalls.length, 0);
  const put = await F.call(api(), { method: 'PUT', url: '/api/adm-messages', headers: H(), body: sendBody() }, { data: W.data });
  assert.equal(put.code, 405); assert.equal(put.dataCalls.length, 0);
  assert.equal(W.msgs.length, 0); assert.equal(W.pushes.length, 0); assert.equal(W.log.length, 0);
}));

test('TM-5: one message per account per minute and 30 writes per hour per admin, shared with Premium → 429 with its own code; nothing stored, nothing pushed', withEnv(async () => {
  const W = world();
  const first = await post(W, sendBody({ request_id: RID(7) }));
  assert.equal(first.code, 200);
  const second = await post(W, sendBody({ request_id: RID(8), text: 'again' }));
  assert.equal(second.code, 429); assert.equal(second.json.code, 'rate_account'); assert.equal(second.json.retry_after, 42);
  assert.equal(expoCalls(second).length, 0); assert.equal(W.msgs.length, 1);
  const other = await post(W, sendBody({ request_id: RID(9), user_id: NODEV }));
  assert.equal(other.code, 200, 'another account is not blocked by the per-account minute');
  // 30 Premium actions by this admin in the last hour also block a message (one shared counter)
  const P = world();
  for (let i = 0; i < 30; i++) P.log.push({ id: i + 1, at: Date.now() - 1000 * i, request_id: 'p' + i, actor: F.USERS.admin.id, action: 'premium_grant', user_id: NODEV, status: 'ok' });
  const r = await post(P, sendBody({ request_id: RID(10) }));
  assert.equal(r.code, 429); assert.equal(r.json.code, 'rate_actor'); assert.equal(r.json.retry_after, 120);
  assert.equal(P.msgs.length, 0); assert.equal(expoCalls(r).length, 0);
  const w = await post(P, { request_id: RID(11), action: 'withdraw', user_id: TARGET, message_id: RID(12) });
  assert.equal(w.code, 429); assert.equal(w.json.code, 'rate_actor', 'a withdraw counts as a write too');
}));

test('TM-6/TM-11: a send stores the message, pushes one notification per device and answers devices / accepted (tickets Apple and Google accepted) / failed', withEnv(async () => {
  const W = world({ fail: { tokens: [TOK(2)] } });
  const r = await post(W, sendBody({ request_id: RID(13) }));
  assert.equal(r.code, 200, r.body);
  assert.equal(r.json.ok, true); assert.equal(r.json.action, 'send');
  assert.equal(r.json.devices, 2); assert.equal(r.json.accepted, 1); assert.equal(r.json.failed, 1); assert.equal(r.json.silent, false);
  assert.equal(r.json.message_id, W.msgs[0].id);
  assert.equal(W.msgs[0].body, MSG);
  assert.deepEqual(W.pushes.map((p) => p.to), [TOK(1), TOK(2)]);
  const none = await post(W, sendBody({ request_id: RID(14), user_id: NODEV }));
  assert.equal(none.code, 200); assert.equal(none.json.devices, 0); assert.equal(none.json.accepted, 0);
  assert.equal(expoCalls(none).length, 0, 'no device → no push call, the message is still saved');
  assert.equal(W.msgs.length, 2);
}));

test('TM-11: the notification title is "Mensagem da equipe DoseTrace" in the account\'s app language (English when unknown), the body is the message, data = {type:"team_message", id}; nothing else in the payload', withEnv(async () => {
  assert.deepEqual(api().TITLES, TITLES);
  for (const l of Object.keys(TITLES)) {
    const W = world({ accounts: { [TARGET]: { email: 'carla@x.y', meta: { language: l }, tokens: [{ token: TOK(1), platform: 'ios' }] } } });
    const r = await post(W, sendBody({ request_id: RID(20) }));
    assert.equal(r.code, 200, r.body);
    assert.equal(W.pushes.length, 1);
    const p = W.pushes[0];
    assert.equal(p.title, TITLES[l], l);
    assert.equal(p.body, MSG);
    assert.deepEqual(p.data, { type: 'team_message', id: r.json.message_id });
    assert.deepEqual(Object.keys(p).sort(), ['body', 'channelId', 'data', 'priority', 'sound', 'title', 'to']);
    assert.equal(p.sound, 'default'); assert.equal(p.priority, 'high');
    assert.equal(p.channelId, 'checkin-reminders', 'a channel every installed app version already created (Android)');
    assert.ok(!JSON.stringify(p).includes('@'), 'no e-mail in the payload');
  }
  const W = world({ accounts: { [TARGET]: { email: 'carla@x.y', meta: {}, tokens: [{ token: TOK(1), platform: 'android' }] } } });
  await post(W, sendBody({ request_id: RID(21) }));
  assert.equal(W.pushes[0].title, TITLES.en, 'language not reported by the app → English');
  const call = (await post(world(), sendBody({ request_id: RID(22) }))).calls.find((c) => c.url === EXPO);
  assert.equal(call.method, 'POST');
  assert.ok(Array.isArray(call.body), 'always an array of messages');
  assert.match(API_SRC, /AbortSignal\.timeout\(PUSH_TIMEOUT_MS\)/);
}));

test('TM-12: Silent mode on → no push call at all; the message is still saved (and shows in the app); the answer says why', withEnv(async () => {
  const W = world();
  const r = await post(W, sendBody({ request_id: RID(23), user_id: QUIET }));
  assert.equal(r.code, 200, r.body);
  assert.equal(r.json.silent, true); assert.equal(r.json.devices, 0); assert.equal(r.json.accepted, 0);
  assert.equal(expoCalls(r).length, 0);
  assert.equal(W.pushes.length, 0);
  assert.equal(W.msgs.length, 1);
  assert.equal(W.log[0].devices, 0);
}));

test('TM-6: Expo unreachable or answering 5xx → the message stays saved, every device counts as failed, the answer is still 200 with accepted 0', withEnv(async () => {
  for (const f of ['timeout', 503]) {
    const W = world({ fail: { expo: f } });
    const r = await post(W, sendBody({ request_id: RID(24) }));
    assert.equal(r.code, 200, String(f));
    assert.equal(r.json.devices, 2); assert.equal(r.json.accepted, 0); assert.equal(r.json.failed, 2);
    assert.equal(W.msgs.length, 1);
    assert.equal(W.log[0].status, 'ok'); assert.equal(W.log[0].failed, 2);
  }
}));

test('TM-7: every send writes ONE log row: the admin user id, the account user id, the time, devices, accepted, failed; the stored answer has no e-mail', withEnv(async () => {
  const W = world({ fail: { tokens: [TOK(1)] } });
  await post(W, sendBody({ request_id: RID(25) }));
  assert.equal(W.log.length, 1);
  const row = W.log[0];
  assert.equal(row.actor, F.USERS.admin.id);
  assert.equal(row.user_id, TARGET);
  assert.equal(row.action, 'message_send');
  assert.equal(typeof row.at, 'number');
  assert.equal(row.devices, 2); assert.equal(row.accepted, 1); assert.equal(row.failed, 1);
  assert.equal(row.message_id, W.msgs[0].id);
  assert.ok(!JSON.stringify(row.result).includes('@'));
  assert.ok(!JSON.stringify(row.result).includes(MSG), 'the log keeps the outcome, not the text');
  const begin = (await post(world(), sendBody({ request_id: RID(26) }))).calls.find((c) => c.url.endsWith('/rpc/admin_message_begin'));
  assert.deepEqual(Object.keys(begin.body).sort(), ['p_actor', 'p_body', 'p_request_id', 'p_user_id']);
  // invalid or unknown → nothing logged
  const V = world();
  await post(V, sendBody({ request_id: RID(27), user_id: GHOST }));
  await post(V, sendBody({ request_id: RID(28), text: '' }));
  assert.equal(V.log.length, 0); assert.equal(V.msgs.length, 0);
}));

test('TM-9: "Retirar" removes an unread message (withdrawn), is refused for a read or already withdrawn one, and every attempt is logged', withEnv(async () => {
  const W = world();
  const unread = W.addMsg(TARGET, 'oops');
  const read = W.addMsg(TARGET, 'seen', { read_at: new Date().toISOString() });
  const a = await post(W, { request_id: RID(30), action: 'withdraw', user_id: TARGET, message_id: unread.id });
  assert.equal(a.code, 200, a.body);
  assert.equal(a.json.ok, true); assert.equal(a.json.message_id, unread.id); assert.ok(a.json.withdrawn_at);
  assert.ok(unread.withdrawn_at);
  assert.equal(expoCalls(a).length, 0, 'a withdraw never pushes');
  const again = await post(W, { request_id: RID(30), action: 'withdraw', user_id: TARGET, message_id: unread.id });
  assert.deepEqual(again.json, a.json, 'same request_id → same answer');
  const twice = await post(W, { request_id: RID(31), action: 'withdraw', user_id: TARGET, message_id: unread.id });
  assert.equal(twice.code, 409); assert.equal(twice.json.code, 'already_withdrawn');
  const r = await post(W, { request_id: RID(32), action: 'withdraw', user_id: TARGET, message_id: read.id });
  assert.equal(r.code, 409); assert.equal(r.json.code, 'already_read');
  const n = await post(W, { request_id: RID(33), action: 'withdraw', user_id: NODEV, message_id: unread.id });
  assert.equal(n.code, 409); assert.equal(n.json.code, 'message_not_found', 'a message of another account');
  assert.deepEqual(W.log.map((x) => [x.action, x.status]), [['message_withdraw', 'ok'], ['message_withdraw', 'refused'], ['message_withdraw', 'refused'], ['message_withdraw', 'refused']]);
  assert.ok(W.log.every((x) => x.actor === F.USERS.admin.id));
  const g = await get(W, '?user_id=' + TARGET);
  assert.ok(g.json.history.find((h) => h.id === unread.id).withdrawn_at, 'the panel history shows it as withdrawn');
}));

test('Server: not configured / migration missing → 503 not_configured; nothing pushed', withEnv(async () => {
  const W = world({ fail: { info: 404 } });
  const r = await post(W, sendBody());
  assert.equal(r.code, 503); assert.equal(r.json.code, 'not_configured'); assert.equal(expoCalls(r).length, 0);
  const g = await get(W, '?user_id=' + TARGET);
  assert.equal(g.code, 503);
  F.envOff();
  const n = await F.call(api(), { method: 'GET', url: '/api/adm-messages?user_id=' + TARGET, headers: F.bearer('admin') }, { data: W.data });
  assert.equal(n.code, 503);
}));

test('Server: api/adm-messages.js logs nothing, reads no RevenueCat key, and sends push only to Expo', () => {
  assert.ok(API_SRC, 'api/adm-messages.js exists');
  assert.equal((API_SRC.match(/console\./g) || []).length, 0);
  assert.ok(!/REVENUECAT/.test(API_SRC));
  assert.match(API_SRC, /require\('\.\/_admAuth\.js'\)/);
  assert.match(API_SRC, /const EXPO_URL = 'https:\/\/exp\.host\/--\/api\/v2\/push\/send';/);
});

// ================================================================== SQL (migration + versioned mirror)
function sqlFnIn(src, name) {
  const m = src.match(new RegExp(`create or replace function public\\.${name}\\([^)]*\\)[\\s\\S]*?\\n\\$\\$;`, 'i'));
  assert.ok(m, name + ' defined');
  return m[0];
}
const FNS = ['admin_message_info', 'admin_message_begin', 'admin_message_finish', 'admin_message_withdraw', 'team_message_mark_read'];

test('TM-21 SQL: team_messages is RLS-protected: a signed-in user selects only their own, non-withdrawn messages; no insert/update/delete for app users; anon gets nothing', () => {
  assert.ok(MIG, 'migration file exists');
  const t = MIG.match(/create table if not exists public\.team_messages \(([\s\S]*?)\n\);/);
  assert.ok(t, 'team_messages table');
  const cols = t[1].split('\n').map((l) => l.trim().match(/^([a-z_]+) /)).filter(Boolean).map((m) => m[1]).filter((c) => c !== 'constraint');
  assert.deepEqual(cols, ['id', 'user_id', 'body', 'created_at', 'read_at', 'withdrawn_at']);
  assert.match(t[1], /user_id uuid not null references auth\.users \(id\) on delete cascade/, 'deleted with the account');
  assert.match(t[1], /char_length\(body\) between 1 and 200/);
  assert.match(t[1], /read_at is null or withdrawn_at is null/, 'a read message is never withdrawn');
  assert.ok(!/email|dose|protocol|health/i.test(t[1]));
  assert.match(MIG, /alter table public\.team_messages enable row level security;/);
  assert.match(MIG, /revoke all on table public\.team_messages from public, anon, authenticated, service_role;/);
  assert.match(MIG, /grant select on table public\.team_messages to authenticated, service_role;/);
  const pols = MIG.match(/create policy [^;]*on public\.team_messages[^;]*;/g) || [];
  assert.equal(pols.length, 1, 'one policy only');
  assert.match(pols[0], /for select to authenticated using \(auth\.uid\(\) = user_id and withdrawn_at is null\)/);
  assert.ok(!/grant (insert|update|delete|all)[^;]*team_messages[^;]*(authenticated|anon)/i.test(MIG), 'app users never write the table directly');
});

test('TM-21 SQL: marking read is one definer function: only the signed-in owner, only read_at, never un-read, never a withdrawn message; the time is clamped to [sent, now]', () => {
  const f = sqlFnIn(MIG, 'team_message_mark_read');
  assert.match(f, /team_message_mark_read\(p_id uuid, p_at timestamptz default null\)/);
  assert.match(f, /security definer/);
  assert.match(f, /auth\.uid\(\) is null/);
  assert.match(f, /set read_at = least\(now\(\), greatest\(created_at, coalesce\(p_at, now\(\)\)\)\)/);
  assert.match(f, /where id = p_id and user_id = auth\.uid\(\) and withdrawn_at is null and read_at is null/);
  assert.ok(!/body\s*=|withdrawn_at\s*=|delete/i.test(f.replace(/withdrawn_at is null/g, '')), 'touches read_at only');
  assert.match(MIG, /revoke execute on function public\.team_message_mark_read\(uuid, timestamptz\) from public, anon;/);
  assert.match(MIG, /grant execute on function public\.team_message_mark_read\(uuid, timestamptz\) to authenticated;/);
});

test('TM-5/TM-7 SQL: the send counter shares admin_actions_log with Premium (30 per hour per admin, any action), one message_send per account per minute, under the same advisory locks, before inserting', () => {
  const b = sqlFnIn(MIG, 'admin_message_begin');
  assert.match(b, /pg_advisory_xact_lock\(least\(hashtextextended\('admin_actions:' \|\| p_actor::text, 0\), hashtextextended\('admin_actions:' \|\| p_user_id::text, 0\)\)\)/);
  assert.match(b, /where actor = p_actor and at > now\(\) - interval '1 hour'/);
  assert.match(b, /if n >= 30 then/);
  assert.match(b, /where user_id = p_user_id and action = 'message_send' and at > now\(\) - interval '1 minute'/);
  const iIdem = b.indexOf('where request_id = p_request_id'), iRate = b.indexOf("interval '1 hour'"), iIns = b.indexOf('insert into public.team_messages');
  assert.ok(iIdem > 0 && iIdem < iRate && iRate < iIns, 'replay first, then the limits, then the message');
  const w = sqlFnIn(MIG, 'admin_message_withdraw');
  assert.match(w, /where actor = p_actor and at > now\(\) - interval '1 hour'/);
  assert.match(w, /and withdrawn_at is null and read_at is null/);
  const fin = sqlFnIn(MIG, 'admin_message_finish');
  assert.match(fin, /where id = p_id and status = 'pending' and action = 'message_send'/);
  // The Premium begin already counts every row of the admin (no action filter) — shared both ways.
  const prem = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '20261022120000_admin_actions_log.sql'), 'utf8');
  assert.match(sqlFnIn(prem, 'admin_action_begin'), /from public\.admin_actions_log where actor = p_actor and at > now\(\) - interval '1 hour';/);
});

test('TM-7 SQL: admin_actions_log gains message_send / message_withdraw, message_id, devices, accepted, failed; reason stays required for Premium only; still no e-mail column', () => {
  assert.match(MIG, /'premium_grant', 'premium_revoke', 'premium_change_end', 'message_send', 'message_withdraw'/);
  assert.match(MIG, /add column if not exists message_id uuid references public\.team_messages \(id\) on delete set null/);
  for (const c of ['devices', 'accepted', 'failed']) assert.match(MIG, new RegExp('add column if not exists ' + c + ' int check \\(' + c + ' >= 0\\)'));
  assert.match(MIG, /\(action like 'premium\\_%' and reason is not null and char_length\(reason\) between 1 and 200\) or \(action like 'message\\_%' and reason is null\)/);
  assert.ok(!/add column[^;]*email/i.test(MIG));
});

test('TM-21 SQL: the panel functions run as definer for service_role only (never anon / authenticated); the migration is one transaction, NOT APPLIED, touches nothing in auth; bodies identical in supabase_admin_rpcs.sql', () => {
  for (const sig of ['admin_message_info\\(uuid\\)', 'admin_message_begin\\(uuid, uuid, uuid, text\\)', 'admin_message_finish\\(bigint, int, int, int, int, jsonb\\)', 'admin_message_withdraw\\(uuid, uuid, uuid, uuid\\)']) {
    for (const src of [MIG, SQL]) {
      assert.match(src, new RegExp('revoke execute on function public\\.' + sig + ' from public, anon, authenticated;'));
      assert.match(src, new RegExp('grant execute on function public\\.' + sig + ' to service_role;'));
    }
  }
  for (const fn of FNS) {
    assert.match(sqlFnIn(MIG, fn), /security definer/);
    assert.equal(sqlFnIn(MIG, fn), sqlFnIn(SQL, fn), fn + ' identical in the migration and supabase_admin_rpcs.sql');
  }
  assert.match(MIG, /^begin;$/m); assert.match(MIG, /^commit;$/m);
  assert.match(MIG, /STATUS: NOT APPLIED/);
  assert.ok(!/(alter|update|insert into|delete from)\s+auth\./i.test(MIG), 'nothing in the auth schema');
  const info = sqlFnIn(MIG, 'admin_message_info');
  assert.match(info, /raw_user_meta_data->>'silent_mode'/, 'Silent mode = user_metadata.silent_mode (lib/notifications.js)');
  assert.match(info, /raw_user_meta_data->>'language'/);
  assert.match(info, /from public\.push_tokens p where p\.user_id = u\.id/);
  assert.match(info, /order by m\.created_at desc limit 50/);
});

test('App contract: the migration header documents what the app reads and calls (list own, mark read, data.type team_message, language + silent_mode in user_metadata, the title in 6 languages)', () => {
  const head = MIG.split(/^begin;$/m)[0];
  for (const s of ["select('id, body, created_at, read_at')", 'team_message_mark_read', "type: 'team_message'", 'user_metadata.language', 'user_metadata.silent_mode', 'checkin-reminders', 'on delete cascade']) assert.ok(head.includes(s), 'contract mentions ' + s);
  for (const l of Object.keys(TITLES)) assert.ok(head.includes(TITLES[l]), 'title ' + l);
});

// ================================================================== page (web/adm.html)
function pageT() {
  const script = HTML.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  return (0, eval)('(' + script.match(/var T=(\{[\s\S]*?\n  \});/)[1] + ')');
}
function msgPure(lang) {
  const m = HTML.match(/\/\/ \[msg-pure-start\]([\s\S]*?)\/\/ \[msg-pure-end\]/);
  assert.ok(m, 'messages pure block present');
  const T = pageT();
  const L = lang || 'en';
  const t = (k, v) => { let s = T[L][k] != null ? T[L][k] : T.en[k]; assert.ok(s != null, 'missing key ' + k); if (v) for (const p of Object.keys(v)) s = String(s).split('{' + p + '}').join(v[p]); return s; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = (0, eval)('(function(){' + m[1] + '\nreturn {MSG_MAX:MSG_MAX,msgLen:msgLen,msgCanSend:msgCanSend,msgDialogHtml:msgDialogHtml,msgErrKey:msgErrKey,msgSender:msgSender,msgDoneKey:msgDoneKey,msgDevLabel:msgDevLabel,msgPreviewBody:msgPreviewBody};})()');
  return { P, t, esc, T };
}
const INFO = (o) => Object.assign({ language: 'pt', title: TITLES.pt, silent: false, devices: { count: 2, platforms: ['ios', 'android'] }, history: [] }, o || {});
const ST = (o) => Object.assign({ phase: 'form', user: { id: TARGET, short: TARGET.slice(0, 8), email: 'carla.mendes@exemplo.com' }, info: INFO(), text: '', busy: false, lang: 'pt', wd: null }, o || {});
const H_OLD = { id: RID(90), body: MSG.replace('1 ano', '6 meses'), created_at: '2026-10-03T16:40:00.000Z', read_at: '2026-10-03T18:02:00.000Z', withdrawn_at: null, devices: 2, accepted: 2, failed: 0 };
const H_NEW = { id: RID(91), body: MSG, created_at: '2026-10-22T10:14:00.000Z', read_at: null, withdrawn_at: null, devices: 2, accepted: 2, failed: 0 };
const H_WD = { id: RID(92), body: 'enviada por engano', created_at: '2026-10-21T09:00:00.000Z', read_at: null, withdrawn_at: '2026-10-21T09:01:00.000Z', devices: 0, accepted: 0, failed: 0 };

test('TM-1 page: every Contas row and every test account has a "Mensagem" button next to "Premium" that opens the send dialog for that account id', () => {
  assert.match(HTML, /'<div class="ms-acts"><button class="pm-rowbtn" onclick="openPremium\(\\''\+esc\(r\.id\)\+'\\'\)">'\+esc\(t\('pm_btn'\)\)\+'<\/button><button class="pm-rowbtn" onclick="openMessage\(\\''\+esc\(r\.id\)\+'\\'\)">'\+esc\(t\('ms_btn'\)\)\+'<\/button><\/div>'/);
  assert.match(HTML, /'<div class="ms-acts"><button class="pm-rowbtn" onclick="openPremium\(\\''\+esc\(x\.id\)\+'\\'\)">'\+esc\(t\('pm_btn'\)\)\+'<\/button><button class="pm-rowbtn" onclick="openMessage\(\\''\+esc\(x\.id\)\+'\\'\)">'\+esc\(t\('ms_btn'\)\)\+'<\/button><\/div>'/);
  assert.match(HTML, /window\.openMessage=function\(id\)\{/);
  assert.match(HTML, /<div id="msg" role="dialog" aria-modal="true" aria-labelledby="ms-t"><div class="pdlg" id="msg-box"><\/div><\/div>/);
  assert.match(HTML, /AUTH\.api\('GET',null,'\/api\/adm-messages\?user_id='\+encodeURIComponent\(id\)\)/);
  const { P, t, esc } = msgPure('pt');
  const h = P.msgDialogHtml(ST(), t, esc);
  assert.match(h, /<h4 id="ms-t">Mensagem<\/h4>/);
  assert.match(h, /class="pm-email">carla\.mendes@exemplo\.com</);
  assert.ok(h.includes('<code>' + TARGET.slice(0, 8) + '</code>'), 'short id');
});

test('TM-2 page: the dialog shows the app language, the devices with notifications, the rule text, the fixed title, a 200-character box with a counter and a live notification preview', () => {
  const { P, t, esc, T } = msgPure('pt');
  const h = P.msgDialogHtml(ST(), t, esc);
  assert.ok(h.includes('<dt>Idioma do app</dt><dd>Português</dd>'));
  assert.ok(h.includes('<dt>Aparelhos com notificações</dt><dd>2 (iPhone, Android)</dd>'));
  assert.equal(T.pt.ms_rule, 'Somente avisos de conta e suporte. Nunca escreva orientação de saúde, dose ou tratamento.');
  assert.ok(h.includes('<p class="pm-note warn">' + T.pt.ms_rule + '</p>'), 'the rule, as signed');
  assert.ok(h.includes(TITLES.pt) && h.includes(T.pt.ms_title_fixed));
  assert.match(h, /<textarea class="linp ms-ta" id="ms-text" maxlength="200"/);
  assert.ok(h.includes('<span class="ms-num" id="ms-num">0 / 200</span>'));
  assert.ok(h.includes(T.pt.ms_hint_lang));
  assert.ok(h.includes(T.pt.ms_preview) && h.includes(T.pt.ms_preview_empty) && h.includes(T.pt.ms_preview_note));
  assert.match(h, /<img src="\/assets\/app-icon-120\.png" alt="" width="30" height="30">/);
  assert.ok(fs.existsSync(path.join(ROOT, 'web', 'assets', 'app-icon-120.png')), 'the app icon asset');
  const f = P.msgDialogHtml(ST({ text: MSG }), t, esc);
  assert.ok(f.includes('>' + MSG + '</textarea>'));
  assert.ok(f.includes('<span class="ms-num" id="ms-num">' + MSG.length + ' / 200</span>'));
  assert.ok(f.includes('<div class="ms-npb" id="ms-npb">' + MSG + '</div>'), 'preview = the text');
  assert.equal(P.msgPreviewBody('<b>x</b>', t, esc), '&lt;b&gt;x&lt;/b&gt;', 'the preview is escaped');
  // Language not reported / no devices / Silent mode
  const u = P.msgDialogHtml(ST({ info: INFO({ language: null, title: TITLES.en, devices: { count: 0, platforms: [] } }) }), t, esc);
  assert.ok(u.includes('<dd>' + T.pt.ms_lang_unknown + '</dd>') && u.includes('<dd>' + T.pt.ms_dev_none + '</dd>'));
  const s = P.msgDialogHtml(ST({ info: INFO({ silent: true }) }), t, esc);
  assert.ok(s.includes(T.pt.ms_silent_note));
  assert.equal(P.msgDevLabel({ count: 1, platforms: ['android'] }, t), '1 (Android)');
});

test('TM-3 page: "Enviar" stays disabled until text is typed; over 200 characters cannot be sent; a double-click sends one request; one request_id per typed text, kept for the step-up retry', async () => {
  const { P, t, esc } = msgPure('pt');
  assert.equal(P.MSG_MAX, 200);
  assert.match(P.msgDialogHtml(ST(), t, esc), /id="ms-go" data-ms="go" disabled/);
  assert.ok(!/id="ms-go" data-ms="go" disabled/.test(P.msgDialogHtml(ST({ text: 'ok' }), t, esc)));
  assert.equal(P.msgCanSend(ST({ text: '   ' })), false);
  assert.equal(P.msgCanSend(ST({ text: 'x'.repeat(200) })), true);
  assert.equal(P.msgCanSend(ST({ text: 'x'.repeat(201) })), false);
  assert.equal(P.msgLen('\u{1F600}'.repeat(3)), 3, 'characters, like the server');
  assert.equal(P.msgCanSend(ST({ text: 'ok', busy: true })), false);
  assert.equal(P.msgCanSend(ST({ text: 'ok', phase: 'done' })), false);
  assert.match(P.msgDialogHtml(ST({ text: 'x'.repeat(201) }), t, esc), /class="ms-num over"/);
  let n = 0; let release;
  const send = P.msgSender(() => { n++; return new Promise((r) => { release = r; }); });
  const a = send({}); const b = send({});
  assert.equal(n, 1);
  release({ ok: true });
  assert.deepEqual(await a, { ok: true });
  assert.equal(await b, null, 'the second click is dropped');
  assert.match(HTML, /MS\.rid=MS\.rid\|\|premUuid\(\)/);
  const inp = HTML.match(/msgEl\(\)\.addEventListener\('input',function\(ev\)\{[\s\S]*?\n  \}\);/);
  assert.ok(inp && /MS\.rid=null/.test(inp[0]), 'changing the text makes a new request');
});

test('TM-4 page: the send and the withdraw ask for the step-up code first (3.1) and go to /api/adm-messages', () => {
  for (const fn of ['msgSend', 'msgWithdraw']) {
    const m = HTML.match(new RegExp('function ' + fn + '\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}'));
    assert.ok(m, fn);
    assert.match(m[0], /AUTH\.needsStepUp\(\)/);
    assert.match(m[0], /openStepUp\(/);
    assert.match(m[0], /path:'\/api\/adm-messages'/);
  }
  const { P, t, esc, T } = msgPure('pt');
  assert.ok(P.msgDialogHtml(ST({ text: MSG }), t, esc).includes(T.pt.ms_step_note), 'the step-up note under the filled form');
});

test('TM-6 page: after sending, "Mensagem enviada para N aparelhos" (N = accepted) or the saved-with-no-device text; Silent mode and all-refused have their own text', () => {
  const { P, t, esc, T } = msgPure('pt');
  assert.equal(T.pt.ms_sent, 'Mensagem enviada para {n} aparelhos.');
  assert.equal(T.pt.ms_saved_nodev, 'Mensagem salva. Nenhum aparelho desta conta está com as notificações ativadas: a pessoa verá a mensagem ao abrir o app.');
  const done = (r) => P.msgDialogHtml(ST({ phase: 'done', result: Object.assign({ ok: true, action: 'send', devices: 2, accepted: 2, failed: 0, silent: false }, r), info: INFO({ history: [H_NEW, H_OLD] }) }), t, esc);
  const sent = done({});
  assert.ok(sent.includes('<p class="pm-ok" role="status">Mensagem enviada para 2 aparelhos.</p>'));
  assert.ok(sent.includes(T.pt.ms_sent_note));
  assert.ok(done({ devices: 2, accepted: 1, failed: 1 }).includes('Mensagem enviada para 1 aparelho.'));
  assert.ok(done({ devices: 2, accepted: 1, failed: 1 }).includes(t('ms_some_failed', { f: 1, d: 2 })));
  assert.ok(done({ devices: 0, accepted: 0 }).includes('<p class="pm-ok ms-none" role="status">' + T.pt.ms_saved_nodev + '</p>'));
  assert.ok(done({ devices: 0, accepted: 0, silent: true }).includes(T.pt.ms_saved_silent));
  assert.ok(done({ devices: 2, accepted: 0, failed: 2 }).includes(T.pt.ms_saved_failed));
  assert.equal(P.msgDoneKey({ devices: 3, accepted: 3 }), 'ms_sent');
  assert.match(sent, /data-ms="close"/);
  assert.ok(!/id="ms-text"/.test(sent), 'no second send from the same dialog');
});

test('TM-8 page: the history shows the account\'s messages newest first with Lida (and when) / Não lida / Retirada and the devices', () => {
  const { P, t, esc, T } = msgPure('pt');
  const h = P.msgDialogHtml(ST({ info: INFO({ history: [H_NEW, H_WD, H_OLD] }) }), t, esc);
  assert.ok(h.includes(T.pt.ms_hist));
  const iNew = h.indexOf(MSG), iWd = h.indexOf('enviada por engano'), iOld = h.indexOf(H_OLD.body);
  assert.ok(iNew > 0 && iNew < iWd && iWd < iOld, 'in the server order (newest first)');
  assert.ok(h.includes('<span class="pill ok">Lida</span>'));
  assert.ok(h.includes('<span class="pill off">Não lida</span>'));
  assert.ok(h.includes('<span class="pill off">' + T.pt.ms_withdrawn + '</span>'));
  const readAt = new Date(H_OLD.read_at).toLocaleString('pt', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  assert.ok(h.includes(t('ms_read_at', { d: readAt })), 'the read time');
  assert.ok(h.includes('2 aparelhos'));
  const e = P.msgDialogHtml(ST(), t, esc);
  assert.ok(e.includes(T.pt.ms_hist_none));
});

test('TM-9 page: "Retirar" only on an unread, not withdrawn message; it asks first, saying a notification already on the phone cannot be taken back; the result says so too', () => {
  const { P, t, esc, T } = msgPure('pt');
  const h = P.msgDialogHtml(ST({ info: INFO({ history: [H_NEW, H_WD, H_OLD] }) }), t, esc);
  const wd = h.match(/data-wd="[^"]+"/g) || [];
  assert.deepEqual(wd, ['data-wd="' + H_NEW.id + '"'], 'only the unread one');
  assert.equal(T.pt.ms_wd_btn, 'Retirar');
  const q = P.msgDialogHtml(ST({ wd: { id: H_NEW.id, busy: false }, info: INFO({ history: [H_NEW, H_OLD] }) }), t, esc);
  assert.ok(q.includes(T.pt.ms_wd_q));
  assert.match(T.pt.ms_wd_q, /não pode ser desfeita/);
  assert.match(q, /data-ms="wd-go"/); assert.match(q, /data-ms="wd-cancel"/);
  const d = P.msgDialogHtml(ST({ wdDone: true, info: INFO({ history: [Object.assign({}, H_NEW, { withdrawn_at: '2026-10-22T10:20:00.000Z' }), H_OLD] }) }), t, esc);
  assert.ok(d.includes(T.pt.ms_wd_done));
  assert.match(T.pt.ms_wd_done, /não pode ser desfeita/);
});

const ERR = ['invalid', 'not_found', 'not_configured', 'request_reused', 'in_progress', 'rate_actor', 'rate_account', 'already_read', 'already_withdrawn', 'message_not_found'];
test('TM-5/TM-10 page: every error has its own message in 6 languages; the limits name themselves (30 per hour shared with Premium, 1 per account per minute)', () => {
  const { P } = msgPure();
  const T = pageT();
  const keys = new Set();
  for (const c of ERR) { const k = P.msgErrKey(409, c); assert.notEqual(k, 'ms_e_generic', c); keys.add(k); }
  assert.equal(P.msgErrKey(403, 'role'), 'ms_e_forbidden');
  assert.equal(P.msgErrKey(0, null), 'ms_e_conn');
  assert.equal(P.msgErrKey(500, 'x'), 'ms_e_generic');
  assert.equal(keys.size, ERR.length);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of [...keys, 'ms_e_forbidden', 'ms_e_conn', 'ms_e_generic']) assert.ok(T[l][k], l + ' ' + k);
  assert.equal(T.pt.ms_e_rate_account, 'Somente uma mensagem por conta por minuto. Tente novamente em {s} s.');
  assert.match(T.pt.ms_e_rate_actor, /30/); assert.match(T.pt.ms_e_rate_actor, /Premium/);
});

test('TM-10: every ms_ label exists in all 6 languages (parity); Portuguese is formal; no emoji', () => {
  const T = pageT();
  const en = Object.keys(T.en).filter((k) => /^ms_/.test(k));
  assert.ok(en.length >= 45, 'message labels present: ' + en.length);
  for (const l of ['es', 'pt', 'fr', 'de', 'it']) assert.deepEqual(Object.keys(T[l]).filter((k) => /^ms_/.test(k)).sort(), en.slice().sort(), l + ' parity');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of en) {
    assert.ok(String(T[l][k]).trim(), l + ' ' + k + ' empty');
    assert.ok(!/\p{Extended_Pictographic}/u.test(T[l][k]), 'no emoji ' + l + ' ' + k);
  }
  for (const k of en) assert.ok(!/\bNão deu\b|\bdá para\b|\ba gente\b|\bpra\b|\bnão dá\b/i.test(T.pt[k]), 'formal pt: ' + T.pt[k]);
  assert.equal(T.pt.ms_btn, 'Mensagem'); assert.equal(T.pt.ms_send, 'Enviar'); assert.equal(T.pt.ms_read, 'Lida'); assert.equal(T.pt.ms_unread, 'Não lida');
});

test('TM-10: the message styles use the panel tokens only (both themes), the dialog fits 420 px (wraps, no fixed widths), and the row buttons sit side by side', () => {
  const css = HTML.match(/\/\* \[messages-css-start\] \*\/([\s\S]*?)\/\* \[messages-css-end\] \*\//);
  assert.ok(css, 'messages css block');
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\bwhite\b|\bblack\b/i.test(css[1].replace(/#msg\b/g, '').replace(/#ms-[a-z]+/g, '').replace(/white-space/g, '')), 'tokens only');
  assert.match(css[1], /#msg \.pdlg\{[^}]*max-width:520px[^}]*width:100%/);
  assert.match(css[1], /overflow-wrap:anywhere/);
  assert.match(css[1], /@media\(max-width:480px\)/);
  assert.match(css[1], /\.ms-acts\{display:flex;gap:6px;justify-content:flex-end/);
  assert.ok(!/width:\s*[5-9]\d\dpx|width:\s*\d{4}px/.test(css[1].replace(/max-width:\s*\d+px/g, '')), 'no fixed width wider than a phone');
});
