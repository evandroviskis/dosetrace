'use strict';
/**
 * DoseTrace admin panel: messages from the DoseTrace team to ONE account (Vercel serverless, dependency-free).
 * Spec: dosetrace docs/specs/team-messages.md (A-163, signed by the founder 2026-10-22), panel rows TM-1..TM-10,
 * TM-21 and the server half of TM-11 / TM-12. The app contract is at the top of
 * supabase/migrations/20261022180000_team_messages.sql.
 *
 * Every request goes through the 3.1 session check (api/_admAuth.js): GET (the account's language, devices
 * and history) needs an allow-listed aal2 session; POST (send / withdraw) also needs Origin
 * https://dosetrace.io, role admin and a TOTP check in the last 15 minutes. Nothing here logs; tokens, keys
 * and e-mails are never echoed into a log or the stored answer.
 *
 * Env (already set for 3.1/3.2, nothing new): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Push: the Expo push service (the same endpoint as the send-reminders and wake-refresh edge functions);
 * one message per push token of the account; none at all when the account is in Silent mode.
 *
 * POST send order (each step returns before the next one runs):
 *   1. validate the body → 400, no call at all (TM-3)
 *   2. configuration present → otherwise 503 not_configured, no call
 *   3. admin_message_info: the account, its app language, Silent mode and push tokens → 404 if no account
 *   4. admin_message_begin: the same request_id → the stored answer (TM-3); over a limit → 429 (TM-5);
 *      otherwise the message row + one pending admin_actions_log row (TM-7), in one transaction
 *   5. the push (skipped in Silent mode, TM-12), 6 s timeout; "accepted" = Expo tickets with status ok (TM-6)
 *   6. admin_message_finish: devices / accepted / failed / http and the answer (for a replay)
 * POST withdraw: validate → info (404) → admin_message_withdraw (replay, the 30-per-hour limit, unread
 * only, one log row either way) (TM-9).
 */
const { checkAdmin } = require('./_admAuth.js');

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_TIMEOUT_MS = 6000;
const EXPO_BATCH = 100;
const MAX_LEN = 200;
// Android: a channel every installed app version already creates (lib/notifications.js); a new channel
// would not exist on older versions and Android would drop the notification.
const CHANNEL_ID = 'checkin-reminders';
// The fixed title, in the account's app language (the app shows the same words on its sheet and list).
const TITLES = {
  en: 'DoseTrace team message',
  pt: 'Mensagem da equipe DoseTrace',
  es: 'Mensaje del equipo de DoseTrace',
  fr: "Message de l'équipe DoseTrace",
  de: 'Nachricht vom DoseTrace-Team',
  it: 'Messaggio dal team di DoseTrace',
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Control characters other than a line break are refused (they never come from a typed message).
const CTRL_RE = /[\u0000-\u0009\u000B-\u001F\u007F]/;

// ------------------------------------------------------------------ the body (TM-3)
function bad(field) { return { error: true, code: 'invalid', field }; }
const chars = (s) => Array.from(String(s)).length; // characters, as Postgres char_length counts them
function validate(body) {
  let b = body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { return bad('json'); } }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad('body');
  if (b.action !== 'send' && b.action !== 'withdraw') return bad('action');
  if (typeof b.user_id !== 'string' || !UUID_RE.test(b.user_id)) return bad('user_id');
  if (typeof b.request_id !== 'string' || !UUID_RE.test(b.request_id)) return bad('request_id');
  const out = { action: b.action, user_id: b.user_id.toLowerCase(), request_id: b.request_id.toLowerCase() };
  if (b.action === 'withdraw') {
    if (typeof b.message_id !== 'string' || !UUID_RE.test(b.message_id)) return bad('message_id');
    out.message_id = b.message_id.toLowerCase();
    return out;
  }
  if (typeof b.text !== 'string') return bad('text');
  const text = b.text.replace(/\r\n?/g, '\n').trim();
  if (!text || chars(text) > MAX_LEN || CTRL_RE.test(text)) return bad('text');
  out.text = text;
  return out;
}

// ------------------------------------------------------------------ Supabase (service role, server-side only)
function sbConf() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}
async function rpc(sb, fn, args) {
  const r = await fetch(`${sb.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { ok: r.ok, status: r.status, j };
}

// ------------------------------------------------------------------ push (TM-11 / TM-12)
const titleFor = (lang) => TITLES[lang] || TITLES.en;
function pushMessages(tokens, lang, text, messageId) {
  return (tokens || []).filter((x) => x && typeof x.token === 'string' && x.token).map((x) => ({
    to: x.token,
    title: titleFor(lang),
    body: text,
    data: { type: 'team_message', id: messageId },
    sound: 'default',
    priority: 'high',
    channelId: CHANNEL_ID,
  }));
}
async function sendExpo(msgs) {
  let accepted = 0, failed = 0, http = null;
  for (let i = 0; i < msgs.length; i += EXPO_BATCH) {
    const slice = msgs.slice(i, i + EXPO_BATCH);
    let tickets = [];
    try {
      const r = await fetch(EXPO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(slice),
        signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
      });
      http = r.status;
      let j = null;
      try { j = await r.json(); } catch (e) { j = null; }
      tickets = r.ok && j && Array.isArray(j.data) ? j.data : [];
    } catch (e) {
      tickets = []; // unreachable or timed out: every device of this batch counts as failed
    }
    for (let k = 0; k < slice.length; k++) { if (tickets[k] && tickets[k].status === 'ok') accepted++; else failed++; }
  }
  return { accepted, failed, http };
}

// ------------------------------------------------------------------ answers
function send(res, status, body) { res.status(status).json(body); }
const notConf = (res) => send(res, 503, { error: 'Not configured', code: 'not_configured' });

async function readInfo(sb, id) {
  let r;
  try { r = await rpc(sb, 'admin_message_info', { p_user_id: id }); } catch (e) { return { err: 'conf' }; }
  if (!r.ok) return { err: 'conf' };
  if (!r.j || !r.j.user_id) return { err: 'missing' };
  return { info: r.j };
}

async function handleGet(req, res) {
  let id = '';
  try { id = new URL(req.url || '/', 'http://x').searchParams.get('user_id') || ''; } catch (e) { id = ''; }
  if (!UUID_RE.test(id)) return send(res, 400, { error: 'Bad request', code: 'invalid', field: 'user_id' });
  id = id.toLowerCase();
  const sb = sbConf();
  if (!sb) return notConf(res);
  const x = await readInfo(sb, id);
  if (x.err === 'conf') return notConf(res);
  if (x.err) return send(res, 404, { error: 'Not found', code: 'not_found' });
  const i = x.info;
  const tokens = Array.isArray(i.tokens) ? i.tokens : [];
  const platforms = ['ios', 'android'].filter((p) => tokens.some((t) => t && t.platform === p))
    .concat(tokens.some((t) => t && t.platform !== 'ios' && t.platform !== 'android') ? ['other'] : []);
  const history = (Array.isArray(i.history) ? i.history : []).map((h) => ({
    id: h.id, body: h.body, created_at: h.created_at, read_at: h.read_at || null, withdrawn_at: h.withdrawn_at || null,
    devices: h.devices == null ? null : h.devices, accepted: h.accepted == null ? null : h.accepted, failed: h.failed == null ? null : h.failed, silent: h.silent === true,
  }));
  return send(res, 200, {
    user: { id, short: id.slice(0, 8), email: i.email || null },
    language: i.language || null,
    title: titleFor(i.language),
    silent: i.silent === true,
    devices: { count: tokens.length, platforms },
    history,
  });
}

async function handleSend(res, v, actor, sb, info) {
  let begin;
  try { begin = await rpc(sb, 'admin_message_begin', { p_request_id: v.request_id, p_actor: actor, p_user_id: v.user_id, p_body: v.text }); } catch (e) { return notConf(res); }
  if (!begin.ok || !begin.j || !begin.j.state) return notConf(res);
  const st = begin.j.state;
  if (st === 'existing') {
    const r = begin.j.result;
    return r && r.status && r.body ? send(res, r.status, r.body) : send(res, 409, { error: 'Conflict', code: 'in_progress' });
  }
  if (st === 'in_progress') return send(res, 409, { error: 'Conflict', code: 'in_progress' });
  if (st === 'conflict') return send(res, 409, { error: 'Conflict', code: 'request_reused' });
  if (st === 'limited') return send(res, 429, { error: 'Too many requests', code: begin.j.scope === 'account' ? 'rate_account' : 'rate_actor', retry_after: begin.j.retry_after });
  if (st === 'not_found') return send(res, 404, { error: 'Not found', code: 'not_found' });
  if (st !== 'started') return notConf(res);

  const silent = info.silent === true;
  const msgs = silent ? [] : pushMessages(info.tokens, info.language, v.text, begin.j.message_id);
  const out = msgs.length ? await sendExpo(msgs) : { accepted: 0, failed: 0, http: null };
  // The stored answer holds the outcome only: no text, no e-mail, no token.
  const answer = {
    ok: true, action: 'send', request_id: v.request_id, message_id: begin.j.message_id, created_at: begin.j.created_at,
    devices: msgs.length, accepted: out.accepted, failed: out.failed, silent,
  };
  try {
    await rpc(sb, 'admin_message_finish', { p_id: begin.j.id, p_devices: msgs.length, p_accepted: out.accepted, p_failed: out.failed, p_http: out.http, p_result: { status: 200, body: answer } });
  } catch (e) { /* the message is stored and pushed; the row stays pending (a replay answers in_progress) */ }
  return send(res, 200, answer);
}

async function handleWithdraw(res, v, actor, sb) {
  let w;
  try { w = await rpc(sb, 'admin_message_withdraw', { p_request_id: v.request_id, p_actor: actor, p_user_id: v.user_id, p_message_id: v.message_id }); } catch (e) { return notConf(res); }
  if (!w.ok || !w.j || !w.j.state) return notConf(res);
  if (w.j.state === 'conflict') return send(res, 409, { error: 'Conflict', code: 'request_reused' });
  if (w.j.state === 'limited') return send(res, 429, { error: 'Too many requests', code: 'rate_actor', retry_after: w.j.retry_after });
  const r = w.j.result;
  if ((w.j.state === 'done' || w.j.state === 'existing') && r && r.status && r.body) return send(res, r.status, r.body);
  return notConf(res);
}

async function handlePost(req, res, actor) {
  const v = validate(req.body);
  if (v.error) return send(res, 400, { error: 'Bad request', code: v.code, field: v.field });
  const sb = sbConf();
  if (!sb) return notConf(res);
  const x = await readInfo(sb, v.user_id);
  if (x.err === 'conf') return notConf(res);
  if (x.err) return send(res, 404, { error: 'Not found', code: 'not_found' });
  if (v.action === 'withdraw') return handleWithdraw(res, v, actor, sb);
  return handleSend(res, v, actor, sb, x.info);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const auth = await checkAdmin(req);
  if (!auth.ok) { res.status(auth.status).json(auth.body); return; }
  const method = String(req.method || 'GET').toUpperCase();
  if (!auth.write) { await handleGet(req, res); return; }
  if (method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  await handlePost(req, res, auth.user.id);
};

Object.assign(module.exports, { validate, pushMessages, TITLES, MAX_LEN, EXPO_URL, PUSH_TIMEOUT_MS, CHANNEL_ID });
