'use strict';
/**
 * DoseTrace admin panel: Premium grant / change end date / revoke (Vercel serverless, dependency-free).
 * Spec: docs/specs/admin-panel.md Phase 3 › 3.2, rows PR1–PR14 (signed by the founder 2026-10-21).
 *
 * Every request goes through the 3.1 session check (api/_admAuth.js): GET (read the account's plan)
 * needs an allow-listed aal2 session; POST (a change) also needs Origin https://dosetrace.io, role
 * admin and a TOTP check in the last 15 minutes. Nothing here logs; keys and tokens are never echoed.
 *
 * Secrets (Vercel env, never sent to the page):
 *   REVENUECAT_WRITE_KEY       RevenueCat v2 secret key, read ONLY by this file (PR1)
 *   REVENUECAT_PROJECT_ID      the project (shared with api/adm.js)
 *   REVENUECAT_ENTITLEMENT_ID  RevenueCat's internal id (entl…) of the entitlement whose lookup key is
 *                              "DoseTrace Pro" (lib/purchases.js ENTITLEMENT_ID); re-checked on every change
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  admin_premium_target, admin_action_begin, admin_action_finish
 *
 * RevenueCat API v2 used (https://www.revenuecat.com/docs/api-v2/customer, …/customer/resources,
 * …/entitlement, read 2026-10-22):
 *   GET  /v2/projects/{p}/customers/{id}                                   customer_information:customers:read
 *   GET  /v2/projects/{p}/customers/{id}/subscriptions                     customer_information:subscriptions:read
 *   GET  /v2/projects/{p}/customers/{id}/purchases                         customer_information:purchases:read
 *   GET  /v2/projects/{p}/entitlements/{entitlement_id}                    project_configuration:entitlements:read
 *   POST /v2/projects/{p}/customers/{id}/actions/grant_entitlement         customer_information:customers:read_write
 *        body { entitlement_id, expires_at: <ms since epoch, in the future> }   → 201 Customer
 *   POST /v2/projects/{p}/customers/{id}/actions/revoke_granted_entitlement customer_information:customers:read_write
 *        body { entitlement_id }                                                → 200 Customer
 *
 * POST order (each step returns before the next one runs):
 *   1. validate the body (PR2/PR3/PR13) → 400, no call at all
 *   2. configuration present → otherwise 503 not_configured, no call
 *   3. admin_premium_target: the user id must be a Supabase account → 404, no RevenueCat call (PR3)
 *   4. admin_action_begin: the same request_id → the stored answer (PR7); over a limit → 429 (PR14);
 *      otherwise one pending admin_actions_log row (PR8)
 *   5. the entitlement id still carries the lookup key "DoseTrace Pro" (PR4)
 *   6. read the plan before; refuse what RevenueCat cannot or should not do (PR5, PR6, 2 h duplicate)
 *   7. the write(s), 4 s timeout each; after a timeout or a 5xx the plan is re-read before reporting (PR9)
 *   8. re-read the plan after (PR4) and finish the log row (ok / failed / refused) with the answer
 */
const { checkAdmin } = require('./_admAuth.js');

const ENTITLEMENT_LOOKUP_KEY = 'DoseTrace Pro';
// PR13: Lifetime stays off until the founder's device check of the 2099 end date passes. Turning it on
// is a reviewed code change here AND in web/adm.html (PREM_LIFETIME_ON), never an env switch.
const LIFETIME_ENABLED = false;
const LIFETIME_ISO = '2099-12-31T23:59:59.000Z';
const LIFETIME_MS = Date.parse(LIFETIME_ISO);
const YEAR_2099_MS = Date.parse('2099-01-01T00:00:00.000Z');
// The app's hard-coded Premium accounts (lib/purchases.js DEVELOPER_EMAILS; a test keeps them equal).
const WHITELIST = [
  'jootaerre@gmail.com',
  'hello@dosetrace.io',
  'appreview@dosetrace.io',
  'victor.s.engenharia@gmail.com',
  'jootaerre@yahoo.com.br',
  'jeovane_m@live.com',
];
const RC_BASE = 'https://api.revenuecat.com/v2';
const RC_TIMEOUT_MS = 4000;
const DUP_WINDOW_MS = 2 * 60 * 60 * 1000; // RevenueCat ignores a grant ending within 2 h of the current one
const ACTIONS = { grant: 'premium_grant', revoke: 'premium_revoke', change_end: 'premium_change_end' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const STORE_KINDS = { app_store: 'app_store', mac_app_store: 'app_store', play_store: 'play_store' };

// ------------------------------------------------------------------ durations (the page uses the same rule)
function presetEnd(d, nowMs) {
  const n = new Date(nowMs);
  if (d === '7d') return new Date(nowMs + 7 * 864e5).toISOString();
  const months = { '1m': 1, '3m': 3, '1y': 12 }[d];
  if (!months) return null;
  const y = n.getUTCFullYear(), m = n.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(n.getUTCDate(), last), n.getUTCHours(), n.getUTCMinutes(), n.getUTCSeconds(), n.getUTCMilliseconds())).toISOString();
}

// ------------------------------------------------------------------ PR2 / PR3 / PR13: the body
function bad(code, field) { return { error: true, code, field }; }
function validate(body, nowMs) {
  let b = body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { return bad('invalid', 'json'); } }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad('invalid', 'body');
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, b.action)) return bad('invalid', 'action');
  if (typeof b.user_id === 'string' && b.user_id.startsWith('$RCAnonymousID')) return bad('anonymous_id', 'user_id');
  if (typeof b.user_id !== 'string' || !UUID_RE.test(b.user_id)) return bad('invalid', 'user_id');
  if (typeof b.request_id !== 'string' || !UUID_RE.test(b.request_id)) return bad('invalid', 'request_id');
  if (typeof b.reason !== 'string') return bad('invalid', 'reason');
  const reason = b.reason.trim();
  if (reason.length < 1 || reason.length > 200) return bad('invalid', 'reason');
  let expires = null;
  if (b.action === 'revoke') {
    if (b.expires_at != null) return bad('invalid', 'expires_at');
  } else {
    if (typeof b.expires_at !== 'string' || !ISO_RE.test(b.expires_at)) return bad('invalid', 'expires_at');
    const ms = Date.parse(b.expires_at);
    if (!Number.isFinite(ms) || ms <= nowMs) return bad('invalid', 'expires_at');
    if (ms === LIFETIME_MS) { if (!LIFETIME_ENABLED) return bad('lifetime_disabled', 'expires_at'); }
    else if (ms >= YEAR_2099_MS) {
      // A custom date must lie before 2099-12-31; while Lifetime is off, no date in 2099 is accepted.
      if (!LIFETIME_ENABLED || ms >= Date.parse('2099-12-31T00:00:00.000Z')) return bad(LIFETIME_ENABLED ? 'invalid' : 'lifetime_disabled', 'expires_at');
    }
    expires = new Date(ms).toISOString();
  }
  return { action: b.action, user_id: b.user_id.toLowerCase(), request_id: b.request_id.toLowerCase(), reason, expires_at: expires };
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

// ------------------------------------------------------------------ RevenueCat v2
function rcConf() {
  const key = process.env.REVENUECAT_WRITE_KEY;
  const project = process.env.REVENUECAT_PROJECT_ID;
  const ent = process.env.REVENUECAT_ENTITLEMENT_ID;
  return key && project && ent ? { key, project, ent } : null;
}
class RcError extends Error {
  constructor(kind, http, retryAfter) { super(kind); this.kind = kind; this.http = http == null ? null : http; this.retryAfter = retryAfter == null ? null : retryAfter; }
}
async function rcFetch(rc, method, pathname, body) {
  let r;
  try {
    r = await fetch(RC_BASE + `/projects/${encodeURIComponent(rc.project)}` + pathname, {
      method,
      headers: Object.assign({ Authorization: `Bearer ${rc.key}`, Accept: 'application/json' }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(RC_TIMEOUT_MS),
    });
  } catch (e) {
    throw new RcError('timeout', null);
  }
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  if (r.ok) return { status: r.status, j };
  if (r.status === 401 || r.status === 403) throw new RcError('permission', r.status);
  if (r.status === 404) throw new RcError('missing', r.status);
  if (r.status === 429) {
    const ra = Number(r.headers && r.headers.get ? r.headers.get('retry-after') : NaN);
    const backoff = j && Number(j.backoff_ms);
    throw new RcError('rate', 429, Number.isFinite(ra) && ra > 0 ? Math.ceil(ra) : (Number.isFinite(backoff) && backoff > 0 ? Math.ceil(backoff / 1000) : 60));
  }
  if (r.status >= 500) throw new RcError('down', r.status);
  throw new RcError('rejected', r.status);
}
const custPath = (id) => `/customers/${encodeURIComponent(id)}`;
const items = (x) => (x && Array.isArray(x.items) ? x.items : Array.isArray(x) ? x : []);

// The customer's Premium-related state, read fresh. A customer RevenueCat does not know yet reads as free.
async function readRc(rc, id) {
  let cust;
  try { cust = await rcFetch(rc, 'GET', custPath(id)); } catch (e) { if (e.kind === 'missing') return { exists: false, active: [], subs: [], purchases: [] }; throw e; }
  const [subs, purchases] = await Promise.all([
    rcFetch(rc, 'GET', custPath(id) + '/subscriptions?limit=100'),
    rcFetch(rc, 'GET', custPath(id) + '/purchases?limit=100'),
  ]);
  return { exists: true, active: items(cust.j && cust.j.active_entitlements), subs: items(subs.j), purchases: items(purchases.j) };
}

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
function grantsEnt(x, ent) {
  return items(x && x.entitlements).some((e) => e && (e.id === ent || e.lookup_key === ENTITLEMENT_LOOKUP_KEY));
}
// Plan + sources: whitelist (app list), app_store / play_store subscription, Lifetime purchase, promotional
// (a grant: RevenueCat lists it as a "promotional" subscription; an active entitlement no subscription or
// purchase explains is a grant too — the only other way to get one). PR5.
function planState(email, raw, ent, nowMs) {
  const sources = [];
  if (email && WHITELIST.includes(String(email).trim().toLowerCase())) sources.push({ kind: 'whitelist', expires_at: null });
  let promoEnd = null, explained = false;
  for (const s of (raw && raw.subs) || []) {
    if (!s || !s.gives_access || !grantsEnt(s, ent)) continue;
    const end = s.current_period_ends_at != null ? Number(s.current_period_ends_at) : (s.ends_at != null ? Number(s.ends_at) : null);
    if (end != null && end <= nowMs) continue;
    explained = true;
    if (s.store === 'promotional') { promoEnd = promoEnd == null ? end : Math.max(promoEnd, end); continue; }
    sources.push({ kind: STORE_KINDS[s.store] || 'other_store', expires_at: iso(end) });
  }
  for (const p of (raw && raw.purchases) || []) {
    if (p && p.status === 'owned' && grantsEnt(p, ent)) { explained = true; sources.push({ kind: 'lifetime', expires_at: null }); }
  }
  const act = ((raw && raw.active) || []).find((a) => a && a.entitlement_id === ent && (a.expires_at == null || Number(a.expires_at) > nowMs));
  if (promoEnd == null && act && !explained && act.expires_at != null) promoEnd = Number(act.expires_at);
  if (promoEnd != null) sources.push({ kind: 'promotional', expires_at: iso(promoEnd) });
  const order = ['app_store', 'play_store', 'other_store', 'lifetime', 'promotional', 'whitelist'];
  sources.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const premium = sources.length > 0;
  let revoke = 'ok';
  if (promoEnd == null) {
    const kinds = sources.map((s) => s.kind);
    revoke = !premium ? 'not_premium' : kinds.some((k) => /store/.test(k)) ? 'source_store' : kinds.includes('lifetime') ? 'source_lifetime' : 'source_whitelist';
  }
  // The latest end among the sources (null = no end: whitelist, Lifetime purchase, or a store row without one).
  const ends = sources.map((s) => s.expires_at);
  const expires = !premium ? null : ends.some((e) => e == null) ? null : ends.sort().pop();
  return { premium, sources, revoke, promo_expires_at: iso(promoEnd), expires_at: expires, source: premium ? sources.map((s) => s.kind).join('+') : 'free' };
}
// The log keeps the plan state only (PR8): { premium, source, expires_at }.
function logState(p) { return p ? { premium: p.premium, source: p.source, expires_at: p.expires_at } : null; }

// ------------------------------------------------------------------ answers
const ERRS = {
  timeout: [504, 'rc_timeout'], down: [502, 'rc_down'], permission: [502, 'rc_permission'], missing: [502, 'rc_no_customer'],
  rate: [429, 'rc_rate_limited'], rejected: [502, 'rc_rejected'],
};
function send(res, status, body) { res.status(status).json(body); }

async function finish(sb, rowId, status, http, before, after, answer) {
  try { await rpc(sb, 'admin_action_finish', { p_id: rowId, p_status: status, p_http: http, p_before: logState(before), p_after: logState(after), p_result: answer }); } catch (e) { /* the answer still goes out; the row stays pending */ }
}

async function handleGet(req, res) {
  let id = '';
  try { id = new URL(req.url || '/', 'http://x').searchParams.get('user_id') || ''; } catch (e) { id = ''; }
  if (id.startsWith('$RCAnonymousID')) return send(res, 400, { error: 'Bad request', code: 'anonymous_id' });
  if (!UUID_RE.test(id)) return send(res, 400, { error: 'Bad request', code: 'invalid', field: 'user_id' });
  id = id.toLowerCase();
  const sb = sbConf();
  if (!sb) return send(res, 503, { error: 'Not configured', code: 'not_configured' });
  let target;
  try { target = await rpc(sb, 'admin_premium_target', { p_user_id: id }); } catch (e) { return send(res, 503, { error: 'Supabase unavailable', code: 'not_configured' }); }
  if (!target.ok) return send(res, 503, { error: 'Not configured', code: 'not_configured' });
  if (!target.j || !target.j.user_id) return send(res, 404, { error: 'Not found', code: 'not_found' });
  const user = { id, short: id.slice(0, 8), email: target.j.email || null };
  const rc = rcConf();
  const now = Date.now();
  if (!rc) return send(res, 200, { user, plan: planState(user.email, null, null, now), rc: 'not_configured', lifetime_enabled: LIFETIME_ENABLED });
  try {
    const raw = await readRc(rc, id);
    return send(res, 200, { user, plan: planState(user.email, raw, rc.ent, now), rc: 'ok', lifetime_enabled: LIFETIME_ENABLED });
  } catch (e) {
    const [, code] = ERRS[e.kind] || [502, 'rc_down'];
    return send(res, 200, { user, plan: planState(user.email, null, null, now), rc: code, retry_after: e.retryAfter, lifetime_enabled: LIFETIME_ENABLED });
  }
}

async function handlePost(req, res, actor) {
  const now = Date.now();
  const v = validate(req.body, now);
  if (v.error) return send(res, 400, { error: 'Bad request', code: v.code, field: v.field });
  const sb = sbConf();
  const rc = rcConf();
  if (!sb || !rc) return send(res, 503, { error: 'Not configured', code: 'not_configured' });

  // PR3: only a real Supabase account (the RevenueCat app_user_id is the Supabase user id).
  let target;
  try { target = await rpc(sb, 'admin_premium_target', { p_user_id: v.user_id }); } catch (e) { return send(res, 503, { error: 'Supabase unavailable', code: 'not_configured' }); }
  if (!target.ok) return send(res, 503, { error: 'Not configured', code: 'not_configured' });
  if (!target.j || !target.j.user_id) return send(res, 404, { error: 'Not found', code: 'not_found' });
  const email = target.j.email || null;

  // PR7 + PR14 + PR8: replay, limits, then one pending row — atomically in SQL.
  let begin;
  try {
    begin = await rpc(sb, 'admin_action_begin', { p_request_id: v.request_id, p_actor: actor, p_action: ACTIONS[v.action], p_user_id: v.user_id, p_expires_at: v.expires_at, p_reason: v.reason });
  } catch (e) { return send(res, 503, { error: 'Supabase unavailable', code: 'not_configured' }); }
  if (!begin.ok || !begin.j || !begin.j.state) return send(res, 503, { error: 'Not configured', code: 'not_configured' });
  const st = begin.j.state;
  if (st === 'existing') {
    const r = begin.j.result;
    return r && r.status && r.body ? send(res, r.status, r.body) : send(res, 409, { error: 'Conflict', code: 'in_progress' });
  }
  if (st === 'in_progress') return send(res, 409, { error: 'Conflict', code: 'in_progress' });
  if (st === 'conflict') return send(res, 409, { error: 'Conflict', code: 'request_reused' });
  if (st === 'limited') return send(res, 429, { error: 'Too many requests', code: begin.j.scope === 'account' ? 'rate_account' : 'rate_actor', retry_after: begin.j.retry_after });
  if (st !== 'started') return send(res, 503, { error: 'Not configured', code: 'not_configured' });
  const rowId = begin.j.id;

  // From here on every outcome finishes the row; the answer (status + body) is stored for a replay (PR7).
  // The row's http column is RevenueCat's status of the last call when one was made, else the panel's.
  const base = { action: v.action, request_id: v.request_id };
  const done = async (status, logStatus, http, before, after, extra) => {
    const answer = Object.assign({ ok: logStatus === 'ok' }, base, extra, { before: logState(before), after: logState(after) });
    await finish(sb, rowId, logStatus, http, before, after, { status, body: answer });
    return send(res, status, answer);
  };

  let before = null;
  try {
    // PR4: the configured entitlement id must still be "DoseTrace Pro".
    let e;
    try { e = await rcFetch(rc, 'GET', `/entitlements/${encodeURIComponent(rc.ent)}`); } catch (x) { if (x.kind === 'missing') e = { status: 404, j: null }; else throw x; }
    if (!e.j || e.j.lookup_key !== ENTITLEMENT_LOOKUP_KEY) return done(500, 'failed', e.status, null, null, { code: 'entitlement_mismatch' });
    before = planState(email, await readRc(rc, v.user_id), rc.ent, now);
  } catch (err) {
    const [status, code] = ERRS[err.kind] || [502, 'rc_down'];
    return done(status, 'failed', err.http, before, null, Object.assign({ code }, err.retryAfter ? { retry_after: err.retryAfter } : {}));
  }

  // PR5 / PR6: revoke and change end only touch a panel grant; the reason is named.
  if ((v.action === 'revoke' || v.action === 'change_end') && before.revoke !== 'ok') return done(409, 'refused', 409, before, before, { code: before.revoke });
  // RevenueCat ignores a grant ending within 2 h of the current grant's end; an earlier end needs Change end date.
  if (v.action === 'grant' && before.promo_expires_at) {
    const cur = Date.parse(before.promo_expires_at), want = Date.parse(v.expires_at);
    if (Math.abs(want - cur) < DUP_WINDOW_MS) return done(409, 'refused', 409, before, before, { code: 'covered' });
    if (want < cur) return done(409, 'refused', 409, before, before, { code: 'shorter' });
  }

  const ent = rc.ent;
  const wantMs = v.expires_at ? Date.parse(v.expires_at) : null;
  const applied = (p) => (v.action === 'revoke' ? !p.promo_expires_at : !!p.promo_expires_at && Math.abs(Date.parse(p.promo_expires_at) - wantMs) < DUP_WINDOW_MS);
  let http = null;
  let step = 'revoke';
  try {
    if (v.action === 'revoke' || v.action === 'change_end') http = (await rcFetch(rc, 'POST', custPath(v.user_id) + '/actions/revoke_granted_entitlement', { entitlement_id: ent })).status;
    step = 'grant';
    if (v.action === 'grant' || v.action === 'change_end') http = (await rcFetch(rc, 'POST', custPath(v.user_id) + '/actions/grant_entitlement', { entitlement_id: ent, expires_at: wantMs })).status;
  } catch (err) {
    // PR9: never report before re-reading — a timeout or a 5xx may still have applied.
    let after = null;
    try { after = planState(email, await readRc(rc, v.user_id), ent, Date.now()); } catch (e2) { after = null; }
    if (!after) return done(504, 'failed', err.http, before, null, { code: 'rc_unknown' });
    if ((err.kind === 'timeout' || err.kind === 'down') && applied(after)) return done(200, 'ok', err.http, before, after, { confirmed: true, applied_late: true });
    if (v.action === 'change_end' && step === 'grant') return done(502, 'failed', err.http, before, after, { code: 'change_partial' });
    const [status, code] = ERRS[err.kind] || [502, 'rc_down'];
    return done(status, 'failed', err.http, before, after, Object.assign({ code, applied: false }, err.retryAfter ? { retry_after: err.retryAfter } : {}));
  }

  // PR4: re-read; "confirmed" says whether RevenueCat already shows the change.
  let after = null;
  try { after = planState(email, await readRc(rc, v.user_id), ent, Date.now()); } catch (e) { after = null; }
  return done(200, 'ok', http, before, after, { confirmed: !!after && applied(after) });
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

Object.assign(module.exports, {
  validate, presetEnd, planState, ENTITLEMENT_LOOKUP_KEY, LIFETIME_ENABLED, LIFETIME_ISO, WHITELIST, RC_TIMEOUT_MS,
});
