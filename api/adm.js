'use strict';
/**
 * DoseTrace admin metrics endpoint (Vercel serverless, dependency-free).
 *
 * Security: ALL secrets live in Vercel environment variables and never reach the
 * browser. The page authenticates with a single opaque ADMIN_TOKEN (the "magic
 * link"), validated here in constant time. Without ADMIN_TOKEN set the endpoint
 * fails closed (503) — it can never be left open by accident.
 *
 * Sources (each degrades independently, so a missing key never breaks the page):
 *   - Supabase      : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  (calls rpc/admin_metrics)
 *   - RevenueCat    : REVENUECAT_API_KEY + REVENUECAT_PROJECT_ID (v2 overview metrics)
 *   - Google Play   : phase 2 (needs Play Developer Reporting API creds + a live test)
 *   - Apple ASC     : phase 2 (needs an App Store Connect API key + a live test)
 */
const crypto = require('crypto');

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function presentedToken(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  // Fallback for convenience; the page sends the header, not the query string.
  const q = req.query && (req.query.t || req.query.token);
  return q ? String(q) : '';
}

async function fetchSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { status: 'not_configured' };
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/admin_metrics`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) return { status: 'error', message: `Supabase ${r.status}: ${(await r.text()).slice(0, 200)}` };
    return { status: 'ok', data: await r.json() };
  } catch (e) {
    return { status: 'error', message: String(e && e.message || e) };
  }
}

async function fetchRevenueCat() {
  const key = process.env.REVENUECAT_API_KEY;
  const project = process.env.REVENUECAT_PROJECT_ID;
  if (!key || !project) return { status: 'not_configured' };
  try {
    const r = await fetch(`https://api.revenuecat.com/v2/projects/${project}/metrics/overview`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!r.ok) return { status: 'error', message: `RevenueCat ${r.status}: ${(await r.text()).slice(0, 200)}` };
    return { status: 'ok', data: await r.json() };
  } catch (e) {
    return { status: 'error', message: String(e && e.message || e) };
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');

  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    res.status(503).json({ error: 'Admin panel not configured (ADMIN_TOKEN unset).' });
    return;
  }
  if (!timingSafeEqual(presentedToken(req), expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const [supabase, revenuecat] = await Promise.all([fetchSupabase(), fetchRevenueCat()]);

  res.status(200).json({
    generated_at: new Date().toISOString(),
    sources: {
      supabase,
      revenuecat,
      google_play: { status: 'planned', message: 'Add Play Developer Reporting API credentials to activate (phase 2).' },
      apple: { status: 'planned', message: 'Add an App Store Connect API key to activate (phase 2).' },
    },
  });
};
