'use strict';
/**
 * RevenueCat webhook → ledger rc_events (spec docs/specs/creators.md §6; founder P2 2026-11-20 "pode ligar o webhook").
 * - POST only. The Authorization header must equal RC_WEBHOOK_AUTH exactly (the value pasted in RevenueCat's
 *   webhook settings), compared in constant time → otherwise 401. Not configured → 503 (fail closed).
 * - Stores only the fields of C.ledgerRow (creator_code / creator_source are the only subscriber attributes kept;
 *   never an e-mail, phone or name). Idempotent by event id (on conflict do nothing).
 * - TEST events (RevenueCat's "send test event") answer 200 without writing.
 * - A failed insert answers 500 so RevenueCat retries. Nothing is logged.
 * Implemented as a Vercel function next to the other panel functions (same tests, same deploy) instead of a
 * Supabase edge function: a deviation recorded in the spec.
 */
const C = require('./_creators.js');

function header(req, name) { const v = (req.headers || {})[name]; return Array.isArray(v) ? v[0] : (v == null ? '' : String(v)); }
function json(res, status, o) { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(o)); }

async function readBody(req) {
  if (req.body != null) return typeof req.body === 'string' ? safeParse(req.body) : req.body;
  return new Promise((resolve) => {
    let s = ''; let big = false;
    req.on('data', (c) => { s += c; if (s.length > 256 * 1024) { big = true; } });
    req.on('end', () => resolve(big ? null : safeParse(s)));
    req.on('error', () => resolve(null));
  });
}
function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

async function handler(req, res) {
  if (String(req.method || '').toUpperCase() !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'method' }); }
  const expected = process.env.RC_WEBHOOK_AUTH || '';
  if (!expected) return json(res, 503, { error: 'not_configured' });
  if (!C.safeEqual(header(req, 'authorization'), expected)) return json(res, 401, { error: 'unauthorized' });
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, ''), key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(res, 503, { error: 'not_configured' });
  const body = await readBody(req);
  const ev = body && body.event;
  if (!ev || typeof ev !== 'object') return json(res, 400, { error: 'invalid' });
  if (ev.type === 'TEST') return json(res, 200, { ok: true, test: true });
  const row = C.ledgerRow(ev, Date.now());
  if (!row) return json(res, 400, { error: 'invalid' });
  try {
    const r = await fetch(`${url}/rest/v1/rc_events?on_conflict=id`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
    if (!r.ok) return json(res, 500, { error: 'store' });
  } catch (e) { return json(res, 500, { error: 'store' }); }
  return json(res, 200, { ok: true });
}

module.exports = handler;
