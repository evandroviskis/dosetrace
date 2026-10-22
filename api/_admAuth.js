'use strict';
/**
 * Admin panel session check, shared by every /api/adm* function (Vercel does not route files
 * that start with "_"). Spec: docs/specs/admin-panel.md Phase 3 › 3.1, rows AU1–AU8.
 *
 * Order (each step returns before the next one runs):
 *   1. A write (any method but GET/HEAD) whose Origin is not https://dosetrace.io → 403 "origin",
 *      before anything else: no JWT check, no database call (AU4).
 *   2. A token-like query parameter → 401 (a credential never travels in a URL; Phase 1 rule 1.1).
 *   3. No "Authorization: Bearer <Supabase access token>" → 401. Cookies and the body are never read.
 *   4. Supabase not configured → 503 (fail closed).
 *   5. The token is verified by Supabase Auth itself (GET /auth/v1/user): a forged, expired or
 *      signed-out token → 401; Supabase unreachable → 503. The token's subject must be that user.
 *   6. The user must be in admin_users (service-role read) → otherwise 403 "not_allowed". This runs
 *      before the aal2 check on purpose: the page asks for TOTP (or offers TOTP setup) only to an
 *      allow-listed account, so a non-admin app account never gets an MFA factor created by the panel.
 *   7. The session must be aal2 (password + TOTP) → otherwise 401 "aal2_required".
 *   8. The password sign-in of this session must be at most 12 h old (founder 2026-10-21) → otherwise
 *      401 "session_expired". Measured from the token's amr claim, so refreshing never extends it.
 *   9. Writes: role "admin" (→ 403 "role") and a TOTP check in the last 15 min (→ 401 "step_up_required").
 *
 * No project-wide Supabase Auth setting is involved (AU7): the limits above are the panel's own.
 * Nothing here logs; tokens are never echoed.
 */

const ALLOWED_ORIGIN = 'https://dosetrace.io';
const MAX_SESSION_MS = 12 * 60 * 60 * 1000;
const STEP_UP_MS = 15 * 60 * 1000;
const TOKEN_QUERY_KEYS = ['t', 'token', 'admin_token', 'access_token'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isWrite(req) {
  const m = String((req && req.method) || 'GET').toUpperCase();
  return m !== 'GET' && m !== 'HEAD';
}

function header(req, name) {
  const h = (req && req.headers) || {};
  const v = h[name] != null ? h[name] : h[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : (v == null ? '' : String(v));
}

function bearer(req) {
  const auth = header(req, 'authorization');
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function tokenInQuery(req) {
  let params;
  try { params = new URL(req.url || '/', 'http://x').searchParams; } catch (e) { return true; }
  return TOKEN_QUERY_KEYS.some((k) => params.has(k));
}

// The payload of a JWT that Supabase Auth has already accepted (step 5); never trusted before that.
function claimsOf(jwt) {
  try { return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8')); } catch (e) { return null; }
}

// Session start = the earliest non-TOTP sign-in method of this session (password for the panel).
function sessionStartMs(claims) {
  let t = null;
  for (const a of (claims && Array.isArray(claims.amr) ? claims.amr : [])) {
    if (a && a.method !== 'totp' && typeof a.timestamp === 'number') { const ms = a.timestamp * 1000; if (t == null || ms < t) t = ms; }
  }
  return t;
}
function lastTotpMs(claims) {
  let t = null;
  for (const a of (claims && Array.isArray(claims.amr) ? claims.amr : [])) {
    if (a && a.method === 'totp' && typeof a.timestamp === 'number') { const ms = a.timestamp * 1000; if (t == null || ms > t) t = ms; }
  }
  return t;
}

const refuse = (status, error, code) => ({ ok: false, status, body: code ? { error, code } : { error } });

async function checkAdmin(req, opts) {
  const now = (opts && opts.now) || Date.now();
  const write = isWrite(req);
  if (write && header(req, 'origin') !== ALLOWED_ORIGIN) return refuse(403, 'Forbidden', 'origin');
  if (tokenInQuery(req)) return refuse(401, 'Unauthorized');
  const jwt = bearer(req);
  if (!jwt) return refuse(401, 'Unauthorized');
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return refuse(503, 'Admin panel not configured (Supabase).');

  let user;
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_ANON_KEY || key, Authorization: `Bearer ${jwt}` } });
    if (r.status >= 500) return refuse(503, 'Supabase Auth unavailable.');
    if (!r.ok) return refuse(401, 'Unauthorized');
    user = await r.json();
  } catch (e) {
    return refuse(503, 'Supabase Auth unavailable.');
  }
  const claims = claimsOf(jwt);
  if (!user || !claims || !UUID_RE.test(String(user.id)) || claims.sub !== user.id) return refuse(401, 'Unauthorized');

  let role = null;
  try {
    const r = await fetch(`${url}/rest/v1/admin_users?select=role&user_id=eq.${encodeURIComponent(user.id)}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!r.ok) return refuse(503, 'Admin allow-list unavailable.');
    const rows = await r.json();
    role = Array.isArray(rows) && rows[0] && (rows[0].role === 'admin' || rows[0].role === 'viewer') ? rows[0].role : null;
  } catch (e) {
    return refuse(503, 'Admin allow-list unavailable.');
  }
  if (!role) return refuse(403, 'Forbidden', 'not_allowed');

  if (claims.aal !== 'aal2') return refuse(401, 'Unauthorized', 'aal2_required');
  const start = sessionStartMs(claims);
  if (start == null || now - start > MAX_SESSION_MS) return refuse(401, 'Unauthorized', 'session_expired');

  if (write) {
    if (role !== 'admin') return refuse(403, 'Forbidden', 'role');
    const totp = lastTotpMs(claims);
    if (totp == null || now - totp > STEP_UP_MS) return refuse(401, 'Unauthorized', 'step_up_required');
  }
  return { ok: true, write, role, user: { id: user.id, email: user.email || null } };
}

module.exports = { checkAdmin, isWrite, sessionStartMs, lastTotpMs, ALLOWED_ORIGIN, MAX_SESSION_MS, STEP_UP_MS };
