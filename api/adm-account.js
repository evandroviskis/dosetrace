'use strict';
/**
 * DoseTrace admin panel: the account card and "Resend confirmation e-mail" (Vercel serverless, dependency-free).
 * Spec: docs/specs/admin-panel.md Phase 3 › 3.3, rows US2, US4, US5 and US8 (signed by the founder 2026-10-21),
 * with the single "Opções" menu per selected account (founder 2026-10-22).
 *
 * Every request goes through the 3.1 session check (api/_admAuth.js): GET (the card) needs an allow-listed aal2
 * session; POST (resend) also needs Origin https://dosetrace.io, role admin and a TOTP check in the last 15
 * minutes. Nothing here logs; tokens, keys and e-mails are never echoed into a log or the stored answer.
 *
 * Env (already set, nothing new): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (admin_account_card,
 * admin_resend_begin, admin_action_finish, and Supabase Auth's /auth/v1/resend); REVENUECAT_PROJECT_ID (not a
 * secret) only to build the dashboard link. The plan itself comes from GET /api/adm-premium (3.2): this file
 * reads no RevenueCat key.
 *
 * GET ?user_id=<uuid> → { user, card, links }. The card passes ONLY the keys in CARD_KEYS (US4): whatever else
 * the database might return never reaches the page, and has_active_protocol is forced to a boolean.
 *
 * POST { action: 'resend_confirmation', user_id, request_id } (US8), each step returning before the next:
 *   1. validate → 400, no call at all (any other action — sign-out, delete — is simply not one)
 *   2. configuration present → otherwise 503 not_configured
 *   3. admin_account_card → 404 unknown; 409 already_confirmed / not_email_signup BEFORE any write or send
 *   4. admin_resend_begin: replay → the stored answer; 30 per hour per admin (shared counter) or 1 per account
 *      per hour → 429; otherwise one pending admin_actions_log row (action resend_confirmation)
 *   5. Supabase Auth POST /auth/v1/resend {type:'signup', email} with the app's confirm-email link, 6 s timeout
 *   6. admin_action_finish: ok / failed with the http and the answer (no e-mail in it)
 * No force sign-out and no delete exist here or anywhere in the panel (founder Q2 2026-10-21).
 */
const { checkAdmin } = require('./_admAuth.js');
const { platformOf } = require('./adm.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTH_TIMEOUT_MS = 6000;
// The link the app itself sends with a sign-up and with its own "resend" (lib/supabase.js emailConfirmRedirectUrl,
// AuthSession.makeRedirectUri({ scheme: 'dosetrace', path: 'confirm-email' }) in a store build).
const CONFIRM_REDIRECT = 'dosetrace://confirm-email';
const SUPABASE_REF = 'mqfvnqfusqyhqhowfweh';
// US4: the card fields the page may receive. The only health-related one is has_active_protocol (yes/no).
const CARD_KEYS = ['created_at', 'provider', 'email_confirmed_at', 'last_sign_in_at', 'platform', 'onboarded', 'test_kind', 'has_active_protocol', 'last_seen', 'app_version', 'history'];
const HISTORY_ACTIONS = ['premium_grant', 'premium_revoke', 'premium_change_end', 'message_send', 'message_withdraw', 'resend_confirmation', 'mark_test', 'unmark_test'];

// ------------------------------------------------------------------ the body (US8)
function bad(field) { return { error: true, code: 'invalid', field }; }
function validate(body) {
  let b = body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { return bad('json'); } }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad('body');
  if (b.action !== 'resend_confirmation') return bad('action');
  if (typeof b.user_id !== 'string' || !UUID_RE.test(b.user_id)) return bad('user_id');
  if (typeof b.request_id !== 'string' || !UUID_RE.test(b.request_id)) return bad('request_id');
  return { action: b.action, user_id: b.user_id.toLowerCase(), request_id: b.request_id.toLowerCase() };
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
async function readCard(sb, id) {
  let r;
  try { r = await rpc(sb, 'admin_account_card', { p_user_id: id }); } catch (e) { return { err: 'conf' }; }
  if (!r.ok) return { err: 'conf' };
  if (!r.j || !r.j.user_id) return { err: 'missing' };
  return { raw: r.j };
}

// The page's card: an explicit copy of the allowed fields only (US4), never the raw answer.
function cardOf(raw) {
  const iso = (v) => (v == null ? null : String(v));
  const history = (Array.isArray(raw.history) ? raw.history : [])
    .filter((h) => h && HISTORY_ACTIONS.includes(h.action))
    .slice(0, 20)
    .map((h) => ({ at: iso(h.at), action: h.action, status: ['ok', 'failed', 'refused', 'pending'].includes(h.status) ? h.status : 'ok' }));
  const card = {
    created_at: iso(raw.created_at),
    provider: typeof raw.provider === 'string' ? raw.provider : '',
    email_confirmed_at: iso(raw.email_confirmed_at),
    last_sign_in_at: iso(raw.last_sign_in_at),
    platform: platformOf({ apple: raw.apple === true, pu: Array.isArray(raw.pu) ? raw.pu : [], ua: Array.isArray(raw.ua) ? raw.ua : [] }),
    onboarded: raw.onboarded === true,
    test_kind: ['list', 'domain', 'rule', 'exception'].includes(raw.test_kind) ? raw.test_kind : null,
    has_active_protocol: !!raw.has_active_protocol,
    last_seen: { measured: raw.last_seen_measured === true, at: raw.last_seen_measured === true ? iso(raw.last_seen_at) : null },
    app_version: { measured: raw.app_version_measured === true, value: raw.app_version_measured === true && raw.app_version != null ? String(raw.app_version).slice(0, 20) : null },
    history,
  };
  const out = {};
  for (const k of CARD_KEYS) out[k] = card[k];
  return out;
}
function linksOf(id) {
  const project = (process.env.REVENUECAT_PROJECT_ID || '').trim();
  return {
    revenuecat: /^[A-Za-z0-9_-]+$/.test(project) ? `https://app.revenuecat.com/projects/${project}/customers/${id}` : null,
    supabase: `https://supabase.com/dashboard/project/${SUPABASE_REF}/auth/users`,
  };
}

// ------------------------------------------------------------------ answers
function send(res, status, body) { res.status(status).json(body); }
const notConf = (res) => send(res, 503, { error: 'Not configured', code: 'not_configured' });

async function handleGet(req, res) {
  let id = '';
  try { id = new URL(req.url || '/', 'http://x').searchParams.get('user_id') || ''; } catch (e) { id = ''; }
  if (!UUID_RE.test(id)) return send(res, 400, { error: 'Bad request', code: 'invalid', field: 'user_id' });
  id = id.toLowerCase();
  const sb = sbConf();
  if (!sb) return notConf(res);
  const x = await readCard(sb, id);
  if (x.err === 'conf') return notConf(res);
  if (x.err) return send(res, 404, { error: 'Not found', code: 'not_found' });
  return send(res, 200, { user: { id, short: id.slice(0, 8), email: x.raw.email ? String(x.raw.email).toLowerCase() : null }, card: cardOf(x.raw), links: linksOf(id) });
}

// Supabase Auth's own resend (the same call the app makes): the e-mail goes to Supabase and nowhere else.
async function resendSignup(sb, email) {
  try {
    const r = await fetch(`${sb.url}/auth/v1/resend?redirect_to=${encodeURIComponent(CONFIRM_REDIRECT)}`, {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_ANON_KEY || sb.key, Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY || sb.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'signup', email }),
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (r.ok) return { ok: true, http: r.status };
    if (r.status === 429) return { code: 'auth_rate', status: 429, http: 429 };
    if (r.status >= 500) return { code: 'auth_down', status: 502, http: r.status };
    return { code: 'auth_rejected', status: 502, http: r.status };
  } catch (e) {
    return { code: 'auth_timeout', status: 504, http: null };
  }
}

async function handlePost(req, res, actor) {
  const v = validate(req.body);
  if (v.error) return send(res, 400, { error: 'Bad request', code: v.code, field: v.field });
  const sb = sbConf();
  if (!sb) return notConf(res);
  const x = await readCard(sb, v.user_id);
  if (x.err === 'conf') return notConf(res);
  if (x.err) return send(res, 404, { error: 'Not found', code: 'not_found' });
  const base = { action: v.action, request_id: v.request_id };
  // Refused before any write or send (US8): confirmed, or not an e-mail sign-up (Google / Apple).
  if (x.raw.provider !== 'email') return send(res, 409, Object.assign({ ok: false, code: 'not_email_signup' }, base));
  if (x.raw.email_confirmed_at) return send(res, 409, Object.assign({ ok: false, code: 'already_confirmed' }, base));
  const email = String(x.raw.email || '').trim().toLowerCase();
  if (!email) return send(res, 409, Object.assign({ ok: false, code: 'not_email_signup' }, base));

  let begin;
  try { begin = await rpc(sb, 'admin_resend_begin', { p_request_id: v.request_id, p_actor: actor, p_user_id: v.user_id }); } catch (e) { return notConf(res); }
  if (!begin.ok || !begin.j || !begin.j.state) return notConf(res);
  const st = begin.j.state;
  if (st === 'existing') {
    const r = begin.j.result;
    return r && r.status && r.body ? send(res, r.status, r.body) : send(res, 409, { error: 'Conflict', code: 'in_progress' });
  }
  if (st === 'in_progress') return send(res, 409, { error: 'Conflict', code: 'in_progress' });
  if (st === 'conflict') return send(res, 409, { error: 'Conflict', code: 'request_reused' });
  if (st === 'not_found') return send(res, 404, { error: 'Not found', code: 'not_found' });
  if (st === 'refused') return send(res, 409, Object.assign({ ok: false, code: begin.j.code === 'already_confirmed' ? 'already_confirmed' : 'not_email_signup' }, base));
  if (st === 'limited') return send(res, 429, { error: 'Too many requests', code: begin.j.scope === 'account' ? 'rate_account' : 'rate_actor', retry_after: begin.j.retry_after });
  if (st !== 'started') return notConf(res);

  const out = await resendSignup(sb, email);
  const status = out.ok ? 200 : out.status;
  const answer = out.ok ? Object.assign({ ok: true, sent: true }, base) : Object.assign({ ok: false, code: out.code }, base);
  try {
    await rpc(sb, 'admin_action_finish', { p_id: begin.j.id, p_status: out.ok ? 'ok' : 'failed', p_http: out.http, p_before: null, p_after: null, p_result: { status, body: answer } });
  } catch (e) { /* the answer still goes out; the row stays pending */ }
  return send(res, status, answer);
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

Object.assign(module.exports, { validate, cardOf, linksOf, CARD_KEYS, CONFIRM_REDIRECT });
