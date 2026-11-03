'use strict';
/**
 * DoseTrace admin: the system alert feed (Vercel serverless, dependency-free). Spec: docs/specs/admin-panel.md
 * Phase 5, rows SA7–SA11 (founder 2026-11-03 "alerta de lentidão … notificação no aplicativo do ADM").
 * The health-probe edge function writes system_health_checks / system_alerts every 5 minutes; the DT Admin
 * phone app polls this endpoint every 15 minutes and turns each new alert into a notification.
 *
 * Two ways in:
 *
 *   1. Alerts-only token (the phone's background job, which cannot reach the device key: it is behind
 *      biometrics in the Android Keystore with 5 min validity). GET with "X-DT-Alerts: <device id>.<secret>"
 *      and no Authorization header. The server keeps only sha256(secret) per admin device
 *      (admin_alert_tokens); a revoked device's token stops working at once. It returns ONLY
 *      { alerts: [{id, created_at, kind, probe, ms, message}], last_id, last_check_at } — no user, account
 *      or admin data — and it can never write. ?since=<id> → alerts with a larger id (oldest first, 50 at
 *      most); no since (the first poll) → the last hour. One poll per 20 s per token (atomic stamp of
 *      last_used_at) → otherwise 429. Wrong / missing / malformed token → 401; tables missing → 503.
 *
 *   2. The full admin auth (api/_admAuth.js: password + TOTP in the browser, or the DT Admin device key):
 *      GET → { alerts (last 24 h), checks (last 24 h), last_check_at } for a panel card. The card itself
 *        is NOT built: the founder approves visuals from pictures first (TODO, Phase 5 SA16).
 *      POST { action: 'alerts_token' } → only on the device path (role admin, Origin dosetrace.io):
 *        mints a new alerts token for that device, stores its sha256 (upsert per device; the old one stops
 *        working) and returns { token } once. The page asks for it only inside the app, when the app says it
 *        has none (web/adm.html askAlertsToken).
 *
 * A credential in the URL is refused (401). Nothing here logs; tokens are never echoed except the one
 * freshly minted token in its own response. Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (already set).
 */
const crypto = require('crypto');
const { checkAdmin, isWrite, ALLOWED_ORIGIN } = require('./_admAuth.js');

const ALERTS_HEADER = 'x-dt-alerts';
const ALERT_COLS = ['id', 'created_at', 'kind', 'probe', 'ms', 'message'];
const CHECK_COLS = ['id', 'checked_at', 'probe', 'ms', 'ok', 'detail'];
const TOKEN_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{32,128})$/i;
const QUERY_KEYS = ['t', 'token', 'admin_token', 'access_token', 'device', 'dt_device', 'x-dt-device', 'alerts', 'alerts_token', 'x-dt-alerts'];
const MIN_POLL_MS = 20 * 1000;
const FIRST_POLL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE = 50;

function send(res, status, body) { res.status(status).json(body); }
function header(req, name) {
  const h = (req && req.headers) || {};
  const v = h[name] != null ? h[name] : h[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : (v == null ? '' : String(v));
}
function params(req) { try { return new URL(req.url || '/', 'http://x').searchParams; } catch (e) { return null; } }
const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
function hashesEqual(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8'), y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
const pick = (row, cols) => { const o = {}; for (const k of cols) o[k] = row && row[k] !== undefined ? row[k] : null; return o; };

function sb() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return (path, init) => fetch(`${url}/rest/v1/${path}`, Object.assign({}, init, {
    headers: Object.assign({ apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' }, (init && init.headers) || {}),
  }));
}
async function rows(r) { const j = await r.json().catch(() => null); return Array.isArray(j) ? j : []; }

// "since": a non-negative integer, or absent. Anything else → undefined (400).
function sinceOf(p) {
  if (!p || !p.has('since')) return null;
  const v = p.get('since');
  return /^[0-9]{1,15}$/.test(v) ? Number(v) : undefined;
}

// The alert feed (both paths). Throws 'missing' when the tables are not there yet.
async function readFeed(call, since, nowMs, withChecks) {
  const filter = since != null ? `id=gt.${since}` : `created_at=gte.${encodeURIComponent(new Date(nowMs - (withChecks ? DAY_MS : FIRST_POLL_MS)).toISOString())}`;
  const reqs = [
    call(`system_alerts?select=${ALERT_COLS.join(',')}&${filter}&order=id.asc&limit=${withChecks ? 200 : PAGE}`),
    call('system_alerts?select=id&order=id.desc&limit=1'),
    call('system_health_checks?select=checked_at&order=checked_at.desc&limit=1'),
  ];
  if (withChecks) reqs.push(call(`system_health_checks?select=${CHECK_COLS.join(',')}&checked_at=gte.${encodeURIComponent(new Date(nowMs - DAY_MS).toISOString())}&order=checked_at.asc&limit=1000`));
  const out = await Promise.all(reqs);
  if (out.some((r) => !r.ok)) throw new Error('missing');
  const [alerts, lastId, lastCheck, checks] = await Promise.all(out.map(rows));
  const body = {
    alerts: alerts.map((a) => pick(a, ALERT_COLS)),
    last_id: lastId[0] && lastId[0].id != null ? Number(lastId[0].id) : 0,
    last_check_at: lastCheck[0] ? lastCheck[0].checked_at || null : null,
  };
  if (withChecks) body.checks = checks.map((c) => pick(c, CHECK_COLS));
  return body;
}

async function alertsOnly(req, res, nowMs) {
  const m = TOKEN_RE.exec(header(req, ALERTS_HEADER).trim());
  if (!m) return send(res, 401, { error: 'Unauthorized' });
  const since = sinceOf(params(req));
  if (since === undefined) return send(res, 400, { error: 'Bad since' });
  const call = sb();
  if (!call) return send(res, 503, { error: 'Not configured' });
  const deviceId = m[1].toLowerCase();
  try {
    const t = await call(`admin_alert_tokens?select=device_id,token_hash&device_id=eq.${deviceId}`);
    if (!t.ok) return send(res, 503, { error: 'Alerts unavailable' });
    const row = (await rows(t))[0];
    if (!row || !hashesEqual(row.token_hash, sha256(m[2]))) return send(res, 401, { error: 'Unauthorized' });
    const d = await call(`admin_devices?select=id,revoked_at&id=eq.${deviceId}`);
    if (!d.ok) return send(res, 503, { error: 'Alerts unavailable' });
    const dev = (await rows(d))[0];
    if (!dev || dev.revoked_at) return send(res, 401, { error: 'Unauthorized' });
    // Rate limit: stamp last_used_at only when the previous poll is at least 20 s old (one statement).
    const cutoff = new Date(nowMs - MIN_POLL_MS).toISOString();
    const p = await call(`admin_alert_tokens?device_id=eq.${deviceId}&or=${encodeURIComponent(`(last_used_at.is.null,last_used_at.lt."${cutoff}")`)}&select=device_id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ last_used_at: new Date(nowMs).toISOString() }),
    });
    if (p.ok && (await rows(p)).length === 0) return send(res, 429, { error: 'Too many requests', code: 'rate', retry_after: MIN_POLL_MS / 1000 });
    return send(res, 200, await readFeed(call, since, nowMs, false));
  } catch (e) {
    return send(res, 503, { error: 'Alerts unavailable' });
  }
}

async function mintToken(res, auth, nowMs) {
  if (!auth.device || !auth.device.id) return send(res, 403, { error: 'Forbidden', code: 'device_required' });
  const call = sb();
  if (!call) return send(res, 503, { error: 'Not configured' });
  const secret = crypto.randomBytes(32).toString('base64url');
  try {
    const r = await call('admin_alert_tokens?on_conflict=device_id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ device_id: auth.device.id, token_hash: sha256(secret), created_at: new Date(nowMs).toISOString(), last_used_at: null }),
    });
    if (!r.ok) return send(res, 503, { error: 'Alerts unavailable' });
  } catch (e) {
    return send(res, 503, { error: 'Alerts unavailable' });
  }
  return send(res, 200, { token: `${auth.device.id}.${secret}` });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const nowMs = Date.now();
  const method = String(req.method || 'GET').toUpperCase();
  // A write from a foreign Origin → 403 before anything (same rule and body as _admAuth, AU4).
  if (isWrite(req) && header(req, 'origin') !== ALLOWED_ORIGIN) return send(res, 403, { error: 'Forbidden', code: 'origin' });
  const p = params(req);
  if (!p || QUERY_KEYS.some((k) => p.has(k))) return send(res, 401, { error: 'Unauthorized' });

  if (method === 'GET' && header(req, ALERTS_HEADER) && !header(req, 'authorization')) return alertsOnly(req, res, nowMs);

  const auth = await checkAdmin(req, { now: nowMs });
  if (!auth.ok) return send(res, auth.status, auth.body);
  if (method === 'GET') {
    const since = sinceOf(p);
    if (since === undefined) return send(res, 400, { error: 'Bad since' });
    const call = sb();
    try {
      return send(res, 200, await readFeed(call, since, nowMs, true));
    } catch (e) {
      return send(res, 200, { status: 'not_configured', alerts: [], checks: [], last_id: 0, last_check_at: null });
    }
  }
  if (method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (body.action === 'alerts_token') return mintToken(res, auth, nowMs);
    return send(res, 400, { error: 'Unknown action' });
  }
  return send(res, 405, { error: 'Method not allowed' });
};

Object.assign(module.exports, { TOKEN_RE, ALERT_COLS, CHECK_COLS, MIN_POLL_MS, sinceOf });
