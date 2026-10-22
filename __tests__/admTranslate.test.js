'use strict';
// A-163 TM-25 — automatic translation of a team message (founder 2026-10-22, dosetrace
// docs/specs/team-messages.md row TM-25 + docs/decisions.md "message auto-translation").
// When the account's app language is known and the typed text is in another language, the panel asks the
// AI for a translation, shows "Será enviada assim (<idioma>)" with the translation in an editable box and
// the original below, and Enviar sends the shown text; the log row keeps that it was translated.
// Server half: api/adm-messages.js action 'translate' (same write gate) with the Anthropic Messages API
// MOCKED (no network, no key); the counter RPC follows supabase/migrations/20261022200000_admin_users_tab.sql.
// Dummy ids, keys and e-mails only — never a real key or account.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('./helpers/admAuthFake.js');
const { sqlFnIn, latestFn } = require('./helpers/sqlLatest.js');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'web', 'adm.html'), 'utf8');
const SQL = fs.readFileSync(path.join(ROOT, 'supabase_admin_rpcs.sql'), 'utf8');
const MIG = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '20261022200000_admin_users_tab.sql'), 'utf8');
const API_PATH = path.join(ROOT, 'api', 'adm-messages.js');
const API_SRC = fs.readFileSync(API_PATH, 'utf8');
function api() { return require(API_PATH); }

const AI = 'https://api.anthropic.com/v1/messages';
const EXPO = 'https://exp.host/--/api/v2/push/send';
const EN_ACC = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa'; // app in English
const NOLANG = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb'; // app language not reported
const RID = (n) => String(n).padStart(8, '0') + '-0000-4000-8000-' + String(n).padStart(12, '0');
const PT = 'Seu acesso Premium foi liberado por 1 ano. Obrigado por testar o DoseTrace.';
const EN = 'Your Premium access has been unlocked for 1 year. Thank you for testing DoseTrace.';
const DUMMY_KEY = 'dummy-anthropic-key-for-tests';

function withEnv(fn, key) {
  return async () => {
    F.envOn();
    if (key !== false) process.env.ANTHROPIC_API_KEY = DUMMY_KEY;
    try { await fn(); } finally { F.envOff(); delete process.env.ANTHROPIC_API_KEY; }
  };
}

// The AI answers with a JSON text block {source, text} (structured output), or whatever `ai` says.
function world(opts) {
  const o = opts || {};
  const accounts = { [EN_ACC]: { email: 'eve@x.y', language: 'en' }, [NOLANG]: { email: 'nolang@x.y', language: null } };
  const W = { log: [], msgs: [], usage: [], ai: o.ai || { source: 'pt', text: EN }, aiCalls: [], pushes: [], counterFail: o.counterFail || 0 };
  W.data = async (u, body, init) => {
    if (u === F.SB + '/rest/v1/rpc/admin_message_info') {
      const a = accounts[body.p_user_id];
      return F.json(a ? { user_id: body.p_user_id, email: a.email, language: a.language, silent: false, tokens: [{ token: 'ExponentPushToken[dummy-1]', platform: 'ios' }], history: [] } : null);
    }
    if (u === F.SB + '/rest/v1/rpc/admin_translate_take') {
      if (W.counterFail) return F.json({ message: 'function does not exist' }, W.counterFail);
      const recent = W.usage.filter((x) => x.actor === body.p_actor && x.at > Date.now() - 3600e3);
      if (recent.length >= 60) return F.json({ state: 'limited', retry_after: 900 });
      W.usage.push({ actor: body.p_actor, at: Date.now() });
      return F.json({ state: 'ok', used: recent.length + 1 });
    }
    if (u === F.SB + '/rest/v1/rpc/admin_message_begin') {
      const m = { id: 'eeeeeeee-0000-4000-8000-00000000000' + (W.msgs.length + 1), user_id: body.p_user_id, body: body.p_body };
      W.msgs.push(m);
      const row = { id: W.log.length + 1, at: Date.now(), action: 'message_send', actor: body.p_actor, user_id: body.p_user_id, message_id: m.id, translated: body.p_translated, status: 'pending' };
      W.log.push(row);
      return F.json({ state: 'started', id: row.id, message_id: m.id, created_at: new Date().toISOString() });
    }
    if (u === F.SB + '/rest/v1/rpc/admin_message_finish') return F.json(true);
    if (u === EXPO) { W.pushes.push(...body); return F.json({ data: body.map(() => ({ status: 'ok' })) }); }
    if (u === AI) {
      W.aiCalls.push({ body, headers: (init && init.headers) || {} });
      const a = W.ai;
      if (a === 'timeout') { const e = new Error('aborted'); e.name = 'TimeoutError'; throw e; }
      if (typeof a === 'number') return F.json({ type: 'error', error: { type: 'api_error', message: 'x' } }, a);
      if (a && a.stop === 'refusal') return F.json({ id: 'msg_1', type: 'message', role: 'assistant', content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: null } });
      if (a && a.raw != null) return F.json({ id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'text', text: a.raw }], stop_reason: 'end_turn' });
      return F.json({ id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: JSON.stringify(a) }], stop_reason: 'end_turn' });
    }
    throw new Error('unexpected call ' + u);
  };
  return W;
}
const H = (o) => Object.assign(F.bearer('admin', Object.assign({ totpS: 30 }, o || {})), F.ORIGIN);
function post(W, body, o) { return F.call(api(), { method: 'POST', url: '/api/adm-messages', headers: H(o), body }, { data: W.data }); }
const trBody = (o) => Object.assign({ action: 'translate', user_id: EN_ACC, text: PT }, o || {});
const aiCalls = (r) => r.calls.filter((c) => c.url === AI);

// ================================================================== server
test('TM-25 (server): translate goes through the same write gate (Origin, admin, step-up) before any call; a malformed body → 400 with no call', withEnv(async () => {
  const W = world();
  const o = await F.call(api(), { method: 'POST', url: '/api/adm-messages', headers: Object.assign(F.bearer('admin', { totpS: 30 }), { origin: 'https://evil.example' }), body: trBody() }, { data: W.data });
  assert.equal(o.code, 403); assert.equal(o.calls.length, 0);
  const s = await post(W, trBody(), { totpS: 16 * 60 });
  assert.equal(s.code, 401); assert.equal(s.dataCalls.length, 0);
  for (const b of [trBody({ text: '' }), trBody({ text: 'x'.repeat(201) }), trBody({ user_id: 'x' }), trBody({ text: 3 })]) {
    const r = await post(W, b);
    assert.equal(r.code, 400, JSON.stringify(b).slice(0, 60)); assert.equal(r.dataCalls.length, 0);
  }
}));

test('TM-25 (server): no ANTHROPIC_API_KEY → 503 translate_not_configured, no AI call, nothing counted', withEnv(async () => {
  const W = world();
  const r = await post(W, trBody());
  assert.equal(r.code, 503); assert.equal(r.json.code, 'translate_not_configured');
  assert.equal(aiCalls(r).length, 0); assert.equal(W.usage.length, 0);
}, false));

test('TM-25 (server): the AI call — Messages API by fetch with x-api-key and anthropic-version 2023-06-01, model claude-haiku-5-5, max_tokens 300, thinking off at low effort, JSON {source, text} structured output; ONLY the message text and the target language are sent (no e-mail, no id, no name)', withEnv(async () => {
  const W = world();
  const r = await post(W, trBody());
  assert.equal(r.code, 200, r.body);
  const c = aiCalls(r);
  assert.equal(c.length, 1);
  assert.equal(c[0].method, 'POST');
  assert.equal(c[0].headers['x-api-key'], DUMMY_KEY);
  assert.equal(c[0].headers['anthropic-version'], '2023-06-01');
  const b = c[0].body;
  assert.equal(b.model, 'claude-haiku-5-5');
  assert.equal(b.max_tokens, 300);
  assert.ok(!('temperature' in b) && !('top_p' in b) && !('top_k' in b), 'Haiku 5.5 refuses non-default sampling (400): none sent');
  assert.deepEqual(b.thinking, { type: 'disabled' });
  assert.equal(b.output_config.effort, 'low');
  assert.deepEqual(b.output_config.format.schema.required, ['source', 'text']);
  assert.equal(b.output_config.format.schema.additionalProperties, false);
  assert.equal(b.messages.length, 1); assert.equal(b.messages[0].role, 'user');
  const sent = JSON.stringify(b);
  assert.ok(!sent.includes('@') && !sent.includes(EN_ACC) && !sent.includes(EN_ACC.slice(0, 8)) && !/eve@|\beve\b/i.test(sent), 'no e-mail, id or name in the AI request');
  assert.ok(b.messages[0].content.includes(PT), 'the message text');
  assert.ok(/English/.test(b.messages[0].content), 'the target language');
  assert.equal(b.messages[0].content.replace(PT, '').replace(/English/g, '').replace(/\(en\)/g, '').replace(/<\/?message>/g, '').replace(/Target language:|Text to translate:/g, '').trim(), '', 'nothing else in the user turn');
}));

test('TM-25 (server): the system prompt says translation only — never add, remove or rephrase meaning, never health / dose / treatment advice, keep names and numbers, answer JSON with the detected source language', () => {
  const S = api().TRANSLATE_SYSTEM;
  assert.ok(S && S.length > 200);
  for (const re of [/translat/i, /never add/i, /remove/i, /rephrase/i, /health/i, /dose/i, /treatment/i, /numbers/i, /names/i, /source/i, /ISO 639-1/i, /200 characters/i]) assert.match(S, re);
  assert.match(API_SRC, /const AI_MODEL = 'claude-haiku-5-5';/);
  assert.match(API_SRC, /const AI_URL = 'https:\/\/api\.anthropic\.com\/v1\/messages';/);
  assert.equal((API_SRC.match(/process\.env\.ANTHROPIC_API_KEY/g) || []).length, 1, 'the key is read in one place');
  assert.equal((API_SRC.match(/console\./g) || []).length, 0);
});

test('TM-25 (server): a different language → {same:false, source, target, text}; the same language → {same:true} and no text; quotes around the answer are stripped', withEnv(async () => {
  const a = await post(world(), trBody());
  assert.deepEqual(a.json, { ok: true, action: 'translate', same: false, source: 'pt', target: 'en', text: EN });
  const b = await post(world({ ai: { source: 'EN', text: 'Hello' } }), trBody({ text: 'Hello' }));
  assert.deepEqual(b.json, { ok: true, action: 'translate', same: true, source: 'en', target: 'en' });
  const q = await post(world({ ai: { source: 'pt', text: '“' + EN + '”' } }), trBody());
  assert.equal(q.json.text, EN);
  const q2 = await post(world({ ai: { source: 'pt', text: '"' + EN + '"' } }), trBody());
  assert.equal(q2.json.text, EN);
}));

test('TM-25 (server): the guard — an answer over 200 characters is refused (translate_too_long); an empty, non-JSON, wrongly shaped or max_tokens answer → translate_failed; a refusal → translate_refused; API errors and timeouts → translate_failed; nothing is stored', withEnv(async () => {
  const cases = [
    [{ source: 'pt', text: 'y'.repeat(201) }, 422, 'translate_too_long'],
    [{ source: 'pt', text: '' }, 502, 'translate_failed'],
    [{ raw: 'not json' }, 502, 'translate_failed'],
    [{ raw: JSON.stringify({ text: EN }) }, 502, 'translate_failed'],
    [{ source: 'portuguese!', text: EN }, 502, 'translate_failed'],
    [{ stop: 'refusal' }, 502, 'translate_refused'],
    [401, 502, 'translate_failed'],
    [529, 502, 'translate_failed'],
    ['timeout', 502, 'translate_failed'],
  ];
  for (const [ai, status, code] of cases) {
    const W = world({ ai });
    const r = await post(W, trBody());
    assert.equal(r.code, status, JSON.stringify(ai).slice(0, 40)); assert.equal(r.json.code, code);
    assert.equal(W.msgs.length, 0); assert.equal(W.log.length, 0);
    assert.ok(!('text' in r.json));
  }
}));

test('TM-25 (server): language not reported → 409 language_unknown with no AI call; unknown account → 404', withEnv(async () => {
  const W = world();
  const r = await post(W, trBody({ user_id: NOLANG }));
  assert.equal(r.code, 409); assert.equal(r.json.code, 'language_unknown'); assert.equal(aiCalls(r).length, 0);
  const g = await post(W, trBody({ user_id: 'dddddddd-4444-4ddd-8ddd-dddddddddddd' }));
  assert.equal(g.code, 404); assert.equal(aiCalls(g).length, 0);
}));

test('TM-25 (server): at most 60 translations per hour per admin (a database counter, so every Vercel instance shares it); the 61st → 429 translate_rate with no AI call; translations do not touch the 30-per-hour writes log; a missing counter → 503 translate_not_configured', withEnv(async () => {
  const W = world();
  for (let i = 0; i < 60; i++) { const r = await post(W, trBody()); assert.equal(r.code, 200); }
  const r = await post(W, trBody());
  assert.equal(r.code, 429); assert.equal(r.json.code, 'translate_rate'); assert.equal(r.json.retry_after, 900);
  assert.equal(aiCalls(r).length, 0);
  assert.equal(W.log.length, 0, 'admin_actions_log untouched');
  assert.equal(api().TRANSLATE_PER_HOUR, 60);
  const M = world({ counterFail: 404 });
  const m = await post(M, trBody());
  assert.equal(m.code, 503); assert.equal(m.json.code, 'translate_not_configured'); assert.equal(aiCalls(m).length, 0);
}));

test('TM-25 (server): send carries translated (boolean, default false) to admin_message_begin, so the log row records it; a non-boolean is refused', withEnv(async () => {
  const W = world();
  const r = await post(W, { action: 'send', request_id: RID(1), user_id: EN_ACC, text: EN, translated: true });
  assert.equal(r.code, 200, r.body);
  assert.equal(W.log[0].translated, true);
  assert.equal(r.json.translated, true);
  const begin = r.calls.find((c) => c.url.endsWith('/rpc/admin_message_begin'));
  assert.equal(begin.body.p_translated, true);
  assert.equal(W.pushes[0].body, EN, 'the shown (translated) text is what goes out');
  await post(W, { action: 'send', request_id: RID(2), user_id: EN_ACC, text: 'Hi' });
  assert.equal(W.log[1].translated, false);
  const bad = await post(W, { action: 'send', request_id: RID(3), user_id: EN_ACC, text: 'Hi', translated: 'yes' });
  assert.equal(bad.code, 400);
}));

// ================================================================== SQL
test('TM-25 SQL: admin_actions_log gains translated (boolean, message_send rows only); admin_message_begin takes p_translated (default false, the old 4-argument version dropped so the live code keeps working); the history shows it; 60-per-hour counter table keeps no text', () => {
  assert.match(MIG, /add column if not exists translated boolean/);
  assert.match(MIG, /check \(translated is null or action = 'message_send'\)/);
  assert.match(MIG, /drop function if exists public\.admin_message_begin\(uuid, uuid, uuid, text\);/);
  const b = sqlFnIn(MIG, 'admin_message_begin');
  assert.match(b, /admin_message_begin\(p_request_id uuid, p_actor uuid, p_user_id uuid, p_body text, p_translated boolean default false\)/);
  assert.match(b, /insert into public\.admin_actions_log \(request_id, actor, action, user_id, message_id, translated\)/);
  assert.match(b, /coalesce\(p_translated, false\)/);
  assert.equal(b, sqlFnIn(SQL, 'admin_message_begin'));
  assert.equal(latestFn('admin_message_info'), sqlFnIn(SQL, 'admin_message_info'));
  assert.match(sqlFnIn(MIG, 'admin_message_info'), /l\.translated/);
  const t = MIG.match(/create table if not exists public\.admin_translate_usage \(([\s\S]*?)\n\);/);
  assert.ok(t, 'counter table');
  const cols = t[1].split('\n').map((l) => l.trim().match(/^([a-z_]+) /)).filter(Boolean).map((m) => m[1]);
  assert.deepEqual(cols, ['id', 'actor', 'at'], 'no text, no account, no language');
  assert.match(MIG, /alter table public\.admin_translate_usage enable row level security;/);
  assert.match(MIG, /revoke all on table public\.admin_translate_usage from public, anon, authenticated, service_role;/);
  const k = sqlFnIn(MIG, 'admin_translate_take');
  assert.match(k, /if n >= 60 then/);
  assert.match(k, /pg_advisory_xact_lock\(hashtextextended\('admin_translate:' \|\| p_actor::text, 0\)\)/);
  assert.match(k, /security definer/);
  for (const src of [MIG, SQL]) {
    assert.match(src, /revoke execute on function public\.admin_translate_take\(uuid\) from public, anon, authenticated;/);
    assert.match(src, /grant execute on function public\.admin_translate_take\(uuid\) to service_role;/);
    assert.match(src, /grant execute on function public\.admin_message_begin\(uuid, uuid, uuid, text, boolean\) to service_role;/);
  }
});

// ================================================================== page
function pageT() {
  const script = HTML.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  return (0, eval)('(' + script.match(/var T=(\{[\s\S]*?\n  \});/)[1] + ')');
}
function msgPure(lang) {
  const m = HTML.match(/\/\/ \[msg-pure-start\]([\s\S]*?)\/\/ \[msg-pure-end\]/);
  const T = pageT();
  const L = lang || 'en';
  const t = (k, v) => { let s = T[L][k] != null ? T[L][k] : T.en[k]; assert.ok(s != null, 'missing key ' + k); if (v) for (const p of Object.keys(v)) s = String(s).split('{' + p + '}').join(v[p]); return s; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = (0, eval)('(function(){' + m[1] + '\nreturn {msgDialogHtml:msgDialogHtml,msgCanSend:msgCanSend,msgNeedsTr:msgNeedsTr,msgSendText:msgSendText,msgTrErrKey:msgTrErrKey,msgContentBlock:msgContentBlock};})()');
  return { P, t, esc, T };
}
const INFO = (o) => Object.assign({ language: 'en', title: 'DoseTrace team message', silent: false, devices: { count: 1, platforms: ['ios'] }, history: [] }, o || {});
const ST = (o) => Object.assign({ phase: 'form', user: { id: EN_ACC, short: EN_ACC.slice(0, 8), email: 'eve@x.y' }, info: INFO(), text: PT, busy: false, lang: 'pt', wd: null, tr: null }, o || {});

test('TM-25 page: when the app language is known, Enviar first asks for the translation; unknown language → sent as typed, no translation (and the hint says so)', () => {
  const { P, t, esc, T } = msgPure('pt');
  assert.equal(P.msgNeedsTr(ST()), true);
  assert.equal(P.msgNeedsTr(ST({ info: INFO({ language: null }) })), false);
  assert.equal(P.msgNeedsTr(ST({ tr: { phase: 'review', text: EN, source: 'pt', target: 'en' } })), false, 'already translated');
  const f = P.msgDialogHtml(ST(), t, esc);
  assert.ok(f.includes(t('ms_tr_hint', { l: 'English' })), 'known language: the panel says it translates before sending');
  const u = P.msgDialogHtml(ST({ info: INFO({ language: null }) }), t, esc);
  assert.ok(u.includes(T.pt.ms_hint_lang) && !u.includes(T.pt.ms_tr_hint.split('{')[0]));
  const fn = HTML.match(/function msgSend\(\)\{[\s\S]*?\n  \}/);
  assert.match(fn[0], /if\(msgNeedsTr\(MS\)\)\{msgTranslate\(\);return;\}/);
  const tf = HTML.match(/function msgTranslate\(\)\{[\s\S]*?\n  \}/);
  assert.ok(tf, 'msgTranslate');
  assert.match(tf[0], /action:'translate'/); assert.match(tf[0], /AUTH\.needsStepUp\(\)/); assert.match(tf[0], /path:'\/api\/adm-messages'/);
});

test('TM-25 page: the review shows "Será enviada assim (English)" with the translation in an editable box (200-character counter) and the original below; Enviar sends the shown, possibly edited, text with translated=true; Voltar returns to the text', () => {
  const { P, t, esc, T } = msgPure('pt');
  assert.equal(T.pt.ms_tr_will, 'Será enviada assim ({l})');
  const st = ST({ tr: { phase: 'review', text: EN, source: 'pt', target: 'en', orig: PT } });
  const h = P.msgDialogHtml(st, t, esc);
  assert.ok(h.includes('<label for="ms-tr">Será enviada assim (English)</label>'));
  assert.match(h, /<textarea class="linp ms-ta" id="ms-tr" maxlength="200"[^>]*>Your Premium access/);
  assert.ok(h.includes(t('ms_tr_orig', { l: 'Português' })));
  assert.ok(h.indexOf('id="ms-tr"') < h.indexOf(PT), 'the original below the translation');
  assert.ok(!/id="ms-text"/.test(h), 'the original is not editable here');
  assert.ok(h.includes('<div class="ms-npb" id="ms-npb">' + EN + '</div>'), 'the preview shows what will be sent');
  assert.ok(h.includes(T.pt.ms_tr_note));
  assert.match(h, /data-ms="tr-back"/); assert.match(h, /id="ms-go" data-ms="go"/);
  assert.equal(P.msgSendText(st), EN);
  assert.equal(P.msgSendText(ST({ tr: Object.assign({}, st.tr, { text: 'Edited by the founder.' }) })), 'Edited by the founder.');
  assert.equal(P.msgSendText(ST()), PT);
  assert.equal(P.msgCanSend(ST({ tr: Object.assign({}, st.tr, { text: 'x'.repeat(201) }) })), false, '200 characters apply to the sent text');
  assert.equal(P.msgCanSend(ST({ tr: Object.assign({}, st.tr, { text: '  ' }) })), false);
  const body = HTML.match(/MS\.body=\{request_id:MS\.rid,action:'send',user_id:MS\.user\.id,text:msgSendText\(MS\)\.trim\(\),translated:[^}]*\}/);
  assert.ok(body, 'the send body carries the shown text and the translated flag');
  const inp = HTML.match(/msgEl\(\)\.addEventListener\('input',function\(ev\)\{[\s\S]*?\n  \}\);/);
  assert.match(inp[0], /ev\.target\.id==='ms-tr'/); assert.match(inp[0], /MS\.tr\.text=ev\.target\.value;MS\.rid=null;MS\.body=null;/);
});

test('TM-25 page: no key / AI error / too long / limit → the panel says why (6 languages) and offers "Enviar original" or Cancelar; the same language → sent as typed', () => {
  const { P, t, esc, T } = msgPure('pt');
  const codes = ['translate_not_configured', 'translate_failed', 'translate_too_long', 'translate_rate', 'translate_refused'];
  const keys = new Set(codes.map((c) => P.msgTrErrKey(c)));
  assert.equal(keys.size, codes.length);
  assert.equal(P.msgTrErrKey('whatever'), 'ms_tr_e_failed');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of [...keys, 'ms_tr_e_tail', 'ms_tr_send_orig', 'ms_tr_will', 'ms_tr_orig', 'ms_tr_hint', 'ms_tr_note', 'ms_tr_back', 'ms_tr_checking', 'ms_translated']) assert.ok(T[l][k], l + ' ' + k);
  const e = P.msgDialogHtml(ST({ tr: { phase: 'error', code: 'translate_not_configured' } }), t, esc);
  assert.ok(e.includes(T.pt.ms_tr_e_notconf) && e.includes(T.pt.ms_tr_e_tail));
  assert.match(e, /data-ms="tr-orig"/); assert.match(e, /data-ms="tr-back"/);
  assert.equal(T.pt.ms_tr_send_orig, 'Enviar o original');
  const c = P.msgDialogHtml(ST({ tr: { phase: 'checking' } }), t, esc);
  assert.ok(c.includes(T.pt.ms_tr_checking)); assert.match(c, /id="ms-go" data-ms="go" disabled/);
  const tr = HTML.match(/function msgTranslate\(\)\{[\s\S]*?\n  \}/)[0];
  assert.match(tr, /x\.j\.same\)\{MS\.tr=\{phase:'same'/, 'same language → straight to send');
});

test('TM-25 page: the history marks a translated message', () => {
  const { P, t, esc, T } = msgPure('pt');
  const h = P.msgDialogHtml(ST({ info: INFO({ history: [{ id: RID(9), body: EN, created_at: '2026-10-22T10:00:00.000Z', read_at: null, withdrawn_at: null, devices: 1, accepted: 1, failed: 0, translated: true }] }) }), t, esc);
  assert.ok(h.includes(T.pt.ms_translated));
});

// DT Council 2026-10-22: the same content rule on the AI output before it is shown (and on the input).
test('Content rule on TM-25: a translation that contains a link, an e-mail or a code is refused (422 translate_blocked) and never shown; an input with one → 400 before any AI call', withEnv(async () => {
  const W = world({ ai: { source: 'pt', text: 'Visit dosetrace.io for your plan.' } });
  const r = await post(W, trBody({ text: 'Visite o site para ver seu plano.' }));
  assert.equal(r.code, 422); assert.equal(r.json.code, 'translate_blocked'); assert.ok(!('text' in r.json));
  const W2 = world();
  const i = await post(W2, trBody({ text: 'Veja em www.loja.com' }));
  assert.equal(i.code, 400); assert.equal(i.json.code, 'blocked_link'); assert.equal(aiCalls(i).length, 0);
  const { P } = msgPure('pt');
  assert.equal(P.msgTrErrKey('translate_blocked'), 'ms_tr_e_blocked');
  const T = pageT();
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(T[l].ms_tr_e_blocked, l);
}));
