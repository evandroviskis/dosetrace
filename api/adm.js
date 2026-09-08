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

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Mint a Google OAuth access token from a service-account JSON (RS256, no deps).
async function googleAccessToken(sa, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const input = header + '.' + claim;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(input), sa.private_key)
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + input + '.' + sig,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('google token: ' + (j.error_description || j.error || 'none'));
  return j.access_token;
}

/**
 * Google Play install/rating stats come from the Play statistics export — a
 * Cloud Storage bucket of monthly UTF-16 CSVs — not from an API. The service
 * account (GOOGLE_PLAY_SA_JSON) needs the Play Console "View app information and
 * download bulk reports (read-only)" permission to read the bucket.
 */
async function fetchGooglePlay() {
  const raw = process.env.GOOGLE_PLAY_SA_JSON;
  const bucket = process.env.GOOGLE_PLAY_BUCKET;
  const pkg = process.env.GOOGLE_PLAY_PACKAGE || 'io.outcom.dosetrace';
  if (!raw || !bucket) return { status: 'not_configured' };
  try {
    const sa = JSON.parse(raw);
    const at = await googleAccessToken(sa, 'https://www.googleapis.com/auth/devstorage.read_only');
    const col = (hdr, name) => hdr.findIndex(h => h.replace(/"/g, '').trim().toLowerCase() === name.toLowerCase());
    const num = v => { const n = Number(String(v == null ? '' : v).replace(/"/g, '').trim()); return isFinite(n) ? n : null; };
    async function latestCsv(prefix) {
      const listUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}`;
      const lr = await fetch(listUrl, { headers: { Authorization: 'Bearer ' + at } });
      if (!lr.ok) throw new Error('list ' + lr.status + ': ' + (await lr.text()).slice(0, 140));
      const lj = await lr.json();
      if (!lj.items || !lj.items.length) return null;
      const name = lj.items.map(i => i.name).sort().pop();
      const dr = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(name)}?alt=media`, { headers: { Authorization: 'Bearer ' + at } });
      const text = Buffer.from(await dr.arrayBuffer()).toString('utf16le').replace(/^﻿/, '');
      const rows = text.split(/\r?\n/).filter(x => x.length).map(l => l.split(','));
      return { name, header: rows[0] || [], rows: rows.slice(1) };
    }
    const data = {};
    const installs = await latestCsv('stats/installs/installs_' + pkg);
    if (installs && installs.rows.length) {
      const last = installs.rows[installs.rows.length - 1];
      const gi = n => { const i = col(installs.header, n); return i >= 0 ? num(last[i]) : null; };
      data.total_user_installs = gi('Total User Installs');
      data.active_device_installs = gi('Active Device Installs');
      const di = col(installs.header, 'Daily Device Installs');
      if (di >= 0) data.installs_this_month = installs.rows.reduce((s, r) => s + (num(r[di]) || 0), 0);
      data.month = (installs.name.match(/_(\d{6})_/) || [])[1] || null;
    }
    const ratings = await latestCsv('stats/ratings/ratings_' + pkg);
    if (ratings && ratings.rows.length) {
      const last = ratings.rows[ratings.rows.length - 1];
      const ti = col(ratings.header, 'Total Average Rating');
      if (ti >= 0) data.total_average_rating = num(last[ti]);
    }
    return { status: 'ok', data };
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

  const [supabase, revenuecat, google_play] = await Promise.all([fetchSupabase(), fetchRevenueCat(), fetchGooglePlay()]);

  res.status(200).json({
    generated_at: new Date().toISOString(),
    sources: {
      supabase,
      revenuecat,
      google_play,
      apple: { status: 'planned', message: 'Add an App Store Connect API key to activate (phase 2).' },
    },
  });
};
