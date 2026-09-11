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
  const base = url.replace(/\/$/, '');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  try {
    const [mr, ar, fr] = await Promise.all([
      fetch(`${base}/rest/v1/rpc/admin_metrics`, { method: 'POST', headers, body: '{}' }),
      fetch(`${base}/rest/v1/rpc/admin_activity`, { method: 'POST', headers, body: '{}' }),
      fetch(`${base}/rest/v1/rpc/admin_feature_adoption`, { method: 'POST', headers, body: '{}' }),
    ]);
    if (!mr.ok) return { status: 'error', message: `Supabase ${mr.status}: ${(await mr.text()).slice(0, 200)}` };
    const data = await mr.json();
    if (ar.ok) { try { data.activity_events = await ar.json(); } catch (e) { /* optional */ } }
    if (fr.ok) { try { data.feature_adoption = await fr.json(); } catch (e) { /* optional */ } }
    return { status: 'ok', data };
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

/**
 * Apple App Store downloads via the App Store Connect API "Sales Reports"
 * (gzipped TSV, ES256-JWT auth). Downloads aren't a single number — we sum the
 * last 30 daily SALES SUMMARY reports (404 = a day with no sales, skipped).
 * Units for first-install product types are downloads; type 7* are updates.
 * Revenue stays with RevenueCat (a free app reports $0 proceeds here anyway).
 */
async function fetchApple() {
  const key = (process.env.ASC_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const issuer = process.env.ASC_ISSUER_ID;
  const kid = process.env.ASC_KEY_ID;
  const vendor = process.env.ASC_VENDOR_NUMBER;
  if (!key || !issuer || !kid || !vendor) return { status: 'not_configured' };
  try {
    const zlib = require('zlib');
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' }));
    const payload = b64url(JSON.stringify({ iss: issuer, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }));
    const input = head + '.' + payload;
    const sig = crypto.sign('SHA256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' })
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const token = input + '.' + sig;
    const ymd = d => d.toISOString().slice(0, 10);
    const days = [];
    for (let b = 1; b <= 30; b++) days.push(ymd(new Date(Date.now() - b * 86400000)));
    const reports = await Promise.all(days.map(async date => {
      const url = 'https://api.appstoreconnect.apple.com/v1/salesReports?filter[frequency]=DAILY&filter[reportType]=SALES&filter[reportSubType]=SUMMARY&filter[version]=1_0&filter[vendorNumber]=' + vendor + '&filter[reportDate]=' + date;
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/a-gzip' } });
      if (r.status !== 200) return { date, tsv: null };
      try { return { date, tsv: zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8') }; }
      catch (e) { return { date, tsv: null }; }
    }));
    const perDay = [];
    for (const { date, tsv } of reports) {
      if (!tsv) continue;
      const lines = tsv.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) continue;
      const hdr = lines[0].split('\t');
      const iType = hdr.indexOf('Product Type Identifier');
      const iUnits = hdr.indexOf('Units');
      let dl = 0, up = 0;
      for (const line of lines.slice(1)) {
        const c = line.split('\t');
        const t = (c[iType] || '').trim();
        const u = parseInt((c[iUnits] || '0').trim(), 10) || 0;
        if (/^7/.test(t)) up += u;              // 7* = updates
        else if (/^(1|F1)/.test(t)) dl += u;    // 1* / F1 = first installs (downloads)
      }
      perDay.push({ date, downloads: dl, updates: up });
    }
    perDay.sort((a, b) => (a.date < b.date ? -1 : 1));
    const latest = perDay[perDay.length - 1] || null;
    return {
      status: 'ok',
      data: {
        downloads_30d: perDay.reduce((s, d) => s + d.downloads, 0),
        updates_30d: perDay.reduce((s, d) => s + d.updates, 0),
        days_with_sales: perDay.length,
        latest_day: latest ? latest.date : null,
        latest_day_downloads: latest ? latest.downloads : null,
      },
    };
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

  const [supabase, revenuecat, google_play, apple] = await Promise.all([fetchSupabase(), fetchRevenueCat(), fetchGooglePlay(), fetchApple()]);

  res.status(200).json({
    generated_at: new Date().toISOString(),
    sources: { supabase, revenuecat, google_play, apple },
  });
};
