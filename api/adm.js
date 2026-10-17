'use strict';
/**
 * DoseTrace admin metrics endpoint (Vercel serverless, dependency-free).
 *
 * Security: ALL secrets live in Vercel environment variables and never reach the
 * browser. The page authenticates with a single opaque ADMIN_TOKEN, accepted ONLY
 * from the "Authorization: Bearer <token>" header and validated in constant time.
 * A token-like query parameter (t, token, admin_token, access_token) is refused
 * with 401 even when the header is valid, so a token never lives in a URL (logs,
 * history, referrers). Cookies and the body are never read. Without ADMIN_TOKEN
 * set the endpoint fails closed (503) — it can never be left open by accident.
 * Nothing here logs; the token is never echoed.
 *
 * Sources (each degrades independently, so a missing key never breaks the page):
 *   - Supabase      : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *                     (rpc/admin_metrics, admin_activity, admin_feature_adoption;
 *                      bodies versioned in supabase_admin_rpcs.sql)
 *   - RevenueCat    : REVENUECAT_API_KEY + REVENUECAT_PROJECT_ID (v2 overview metrics)
 *   - Google Play   : GOOGLE_PLAY_SA_JSON + GOOGLE_PLAY_BUCKET (stats bucket CSVs)
 *   - Apple ASC     : ASC_PRIVATE_KEY + ASC_ISSUER_ID + ASC_KEY_ID + ASC_VENDOR_NUMBER
 *                     (Sales Reports, last 30 daily summaries)
 * Every metric the panel shows is defined in docs/specs/admin-panel.md.
 */
const crypto = require('crypto');

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Header only. There is deliberately no query/cookie/body fallback.
function presentedToken(req) {
  const auth = (req.headers && req.headers['authorization']) || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}

// A token must never travel in a URL. Any token-like query parameter is a 401,
// even alongside a valid header, so old token links stop working outright.
const TOKEN_QUERY_KEYS = ['t', 'token', 'admin_token', 'access_token'];
function tokenInQuery(req) {
  let params;
  try { params = new URL(req.url || '/', 'http://x').searchParams; } catch (e) { return true; }
  return TOKEN_QUERY_KEYS.some((k) => params.has(k));
}

async function fetchSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { status: 'not_configured' };
  const base = url.replace(/\/$/, '');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  try {
    // admin_activity is no longer called: analytics have no user_id since 2026-10-04.
    const [mr, fr, acr, alr] = await Promise.all([
      fetch(`${base}/rest/v1/rpc/admin_metrics`, { method: 'POST', headers, body: '{}' }),
      fetch(`${base}/rest/v1/rpc/admin_feature_adoption`, { method: 'POST', headers, body: '{}' }),
      fetch(`${base}/rest/v1/rpc/admin_accounts`, { method: 'POST', headers, body: '{}' }),
      fetch(`${base}/rest/v1/rpc/admin_accounts_list`, { method: 'POST', headers, body: '{}' }),
    ]);
    if (!mr.ok) return { status: 'error', message: `Supabase ${mr.status}: ${(await mr.text()).slice(0, 200)}` };
    const data = await mr.json();
    if (fr.ok) { try { data.feature_adoption = await fr.json(); } catch (e) { /* optional */ } }
    // Management view rows (admin_accounts). Missing until the Phase 2 SQL is applied.
    if (acr && acr.ok) { try { const j = await acr.json(); data.accounts = j.accounts; data.protocols_live = j.protocols_live; } catch (e) { /* optional */ } }
    // Contas tab rows (admin_accounts_list): real accounts only, for the admin's eyes.
    if (alr && alr.ok) { try { const j = await alr.json(); if (j && Array.isArray(j.rows)) data.accounts_list = { rows: j.rows, test_excluded: j.test_excluded, summary: accountsSummary(j.rows) }; } catch (e) { /* optional */ } }
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

// ---------------------------------------------------------------------------
// Management view (docs/specs/admin-panel.md "Phase 2 — Management view").
// The pure functions below are exported for __tests__/admManagement.test.js.
// Everything is computed here, server-side: the browser gets counts, never ids.
// ---------------------------------------------------------------------------
const DAY_MS = 86400000;
const RC_ANON_PREFIX = '$RCAnonymousID';
const MV_WINDOWS = [7, 30, 90];

function utcDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
function addDaysStr(day, n) { return utcDay(Date.parse(day + 'T00:00:00Z') + n * DAY_MS); }

// MV-0: the last `days` full UTC days, ending today 00:00 UTC (today excluded).
// `back` shifts by whole periods (1 = the previous period). End is exclusive.
function fullDayWindow(nowMs, days, back = 0) {
  const end = addDaysStr(utcDay(nowMs), -days * back);
  return { start: addDaysStr(end, -days), end };
}
function inWindow(day, w) { return !!day && day >= w.start && day < w.end; }

// MV-0 platform rule: Apple sign-in is iOS always (lib/supabase.js:275-276). Otherwise
// collect event / push / session signals together: all agree -> that platform,
// disagree -> 'mixed', none -> 'unknown'. No signal outranks another.
function platformOf(a) {
  if (a && a.apple) return 'ios';
  const seen = new Set();
  for (const k of ['ev', 'pu', 'ua']) {
    for (const v of (a && a[k]) || []) {
      const p = String(v).toLowerCase();
      if (p === 'ios' || p === 'android') seen.add(p);
    }
  }
  if (seen.size === 0) return 'unknown';
  if (seen.size > 1) return 'mixed';
  return [...seen][0];
}

// Unknown always includes mixed; `mixed` is shown as a sub-count, never split out.
function splitPlatforms(rows) {
  const s = { total: rows.length, ios: 0, android: 0, unknown: 0, mixed: 0 };
  for (const r of rows) {
    const p = platformOf(r);
    if (p === 'ios') s.ios++;
    else if (p === 'android') s.android++;
    else { s.unknown++; if (p === 'mixed') s.mixed++; }
  }
  return s;
}

// H1–H4: real new customers per window vs the previous period, split by platform.
function headlineCards(accounts, nowMs) {
  const real = accounts.filter((a) => !a.t);
  return MV_WINDOWS.map((days) => {
    const window = fullDayWindow(nowMs, days);
    const previous = fullDayWindow(nowMs, days, 1);
    const cur = real.filter((a) => inWindow(a.c, window));
    const prev = real.filter((a) => inWindow(a.c, previous)).length;
    const count = cur.length;
    return {
      days, window, previous, count, prev, delta: count - prev,
      pct: prev ? Math.round(((count - prev) / prev) * 1000) / 10 : null,
      platforms: splitPlatforms(cur),
    };
  });
}

// W1–W5: one cohort (real accounts created in the window); each step counts
// accounts from that cohort that reached it at any time up to now.
const FUNNEL_STEPS = [
  ['W1', () => true],
  ['W2', (a) => !!a.e],
  ['W3', (a) => !!a.o],
  ['W4', (a) => !!a.pr],
  ['W5', (a) => !!a.d],
];
function funnel(accounts, w) {
  const cohort = accounts.filter((a) => !a.t && inWindow(a.c, w));
  return FUNNEL_STEPS.map(([id, reached]) => ({ id, ...splitPlatforms(cohort.filter(reached)) }));
}

function isAnonymousRcId(id) { return typeof id === 'string' && id.startsWith(RC_ANON_PREFIX); }

// X2–X6 for one window. RevenueCat rows only when the customers list was readable;
// an id the match step didn't classify is never guessed: it breaks the X3 check.
function reconciliation(accounts, rc, w) {
  const inW = accounts.filter((a) => inWindow(a.c, w));
  const x2 = { all: inW.length, test: inW.filter((a) => a.t).length, real: inW.filter((a) => !a.t).length };
  if (!rc || rc.status !== 'ok') return { window: w, x2, rc: { status: rc ? rc.status : 'not_configured' } };
  const ids = rc.customers.filter((c) => inWindow(c.day, w));
  let x4 = 0, real = 0, test = 0, x6 = 0, unclassified = 0;
  for (const c of ids) {
    if (isAnonymousRcId(c.id)) { x4++; continue; }
    const m = rc.match ? rc.match[c.id] : undefined;
    if (m === 'real') real++;
    else if (m === 'test') test++;
    else if (m === 'none') x6++;
    else unclassified++;
  }
  const x3 = ids.length;
  const diff = x3 - (x4 + real + test + x6);
  return {
    window: w, x2,
    rc: { status: 'ok', x3, x4, x5: { real, test }, x6, unclassified, check_ok: diff === 0, diff, real_not_in_rc: x2.real - real },
  };
}

// G1: new customers per day, last `days` full UTC days, by platform, real only.
function dailyNew(accounts, nowMs, days = 90) {
  const window = fullDayWindow(nowMs, days);
  const out = [];
  for (let d = window.start; d < window.end; d = addDaysStr(d, 1)) out.push({ d, ios: 0, android: 0, unknown: 0 });
  const idx = Object.fromEntries(out.map((r, i) => [r.d, i]));
  for (const a of accounts) {
    if (a.t || !inWindow(a.c, window)) continue;
    const p = platformOf(a);
    const r = out[idx[a.c]];
    if (p === 'ios') r.ios++; else if (p === 'android') r.android++; else r.unknown++;
  }
  return { window, days: out };
}

// G2: weekly signup cohorts (ISO weeks, Monday 00:00 UTC), real only. Cell n = members
// with >=1 analytics event in week n (a floor: there is no app-open event).
function isoWeekStart(day) {
  const ms = Date.parse(day + 'T00:00:00Z');
  return utcDay(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS);
}
function weeklyCohorts(accounts, nowMs, weeks = 8) {
  const thisWeek = isoWeekStart(utcDay(nowMs));
  const cohorts = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const week = addDaysStr(thisWeek, -7 * i);
    const members = accounts.filter((a) => !a.t && a.c && isoWeekStart(a.c) === week);
    const cells = [];
    for (let n = 0; n <= i; n++) cells.push(members.filter((a) => (a.w || []).includes(n)).length);
    cohorts.push({ week, size: members.length, cells });
  }
  return cohorts;
}

// A1 activation (Panel #009): among real accounts registered in the last 30 days
// (today included, UTC calendar days), the share with >=1 dose_logs row of any date.
// Same window on both sides; test accounts excluded on both sides (admin_is_test).
function activationRate(accounts, nowMs) {
  const today = utcDay(nowMs);
  const window = { start: addDaysStr(today, -30), end: addDaysStr(today, 1) };
  const cohort = accounts.filter((a) => !a.t && inWindow(a.c, window));
  const num = cohort.filter((a) => !!a.d).length;
  const den = cohort.length;
  return { window, num, den, rate: den ? Math.round((num / den) * 1000) / 10 : null, filtered: true };
}

// Contas tab summary (Panel #013): counts measured from the rows; the platform uses the MV-0 rule.
function accountsSummary(rows) {
  const by_provider = {}, by_platform = { ios: 0, android: 0, unknown: 0, mixed: 0 };
  let onboarded = 0;
  for (const r of rows || []) {
    const p = String(r.provider || '(none)');
    by_provider[p] = (by_provider[p] || 0) + 1;
    if (r.onboarded) onboarded++;
    const pf = platformOf({ apple: r.apple, pu: r.pu, ua: r.ua });
    if (pf === 'ios' || pf === 'android') by_platform[pf]++; else { by_platform.unknown++; if (pf === 'mixed') by_platform.mixed++; }
  }
  const total = (rows || []).length;
  return { total, by_provider, by_onboarding: { onboarded, not_onboarded: total - onboarded }, by_platform };
}

// Panel #016: the Gmail name.number rule, mirrored from admin_is_test for the page filter only.
const TEST_RULE = /^[a-z]+\.[0-9]{5,6}@gmail\.com$/;
function matchesTestRule(email) { return TEST_RULE.test(String(email || '').trim().toLowerCase()); }

// Panel #016: the panel's only write. Validates the body, then calls admin_mark_test (all or
// nothing, audit row per email, never touches auth.users). Returns [status, body].
const MARK_ACTIONS = { mark_test: true, unmark_test: false };
function parseMarkBody(body) {
  let b = body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { return { error: 'invalid json' }; } }
  if (!b || typeof b !== 'object' || !(b.action in MARK_ACTIONS)) return { error: 'invalid action' };
  if (!Array.isArray(b.emails) || !b.emails.length) return { error: 'emails must be a non-empty array' };
  if (b.emails.length > 200) return { error: 'max 200 emails per call' };
  const emails = [];
  for (const e of b.emails) {
    if (typeof e !== 'string') return { error: 'emails must be strings' };
    const v = e.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(v)) return { error: 'invalid email' };
    if (!emails.includes(v)) emails.push(v);
  }
  return { emails, mark: MARK_ACTIONS[b.action] };
}
async function markTests(body) {
  const parsed = parseMarkBody(body);
  if (parsed.error) return [400, { error: parsed.error }];
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [503, { error: 'Supabase not configured' }];
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/admin_mark_test`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_emails: parsed.emails, p_mark: parsed.mark }),
    });
    const text = await r.text();
    if (!r.ok) {
      let msg = text.slice(0, 300);
      try { const jj = JSON.parse(text); msg = String(jj.message || jj.error || msg); } catch (e) { /* keep text */ }
      return [r.status >= 500 ? 502 : 400, { error: msg }];
    }
    return [200, JSON.parse(text)];
  } catch (e) {
    return [502, { error: String(e && e.message || e) }];
  }
}

function buildManagement(sb, rc, nowMs) {
  const accounts = Array.isArray(sb.accounts) ? sb.accounts : [];
  const windows = {};
  for (const days of MV_WINDOWS) {
    const w = fullDayWindow(nowMs, days);
    windows[days] = { window: w, funnel: funnel(accounts, w), recon: reconciliation(accounts, rc, w) };
  }
  return {
    headline: headlineCards(accounts, nowMs),
    activation: activationRate(accounts, nowMs),
    test_count: accounts.filter((a) => a.t).length,
    real_all_time: accounts.filter((a) => !a.t).length,
    protocols_live: sb.protocols_live == null ? null : Number(sb.protocols_live),
    windows,
    g1: dailyNew(accounts, nowMs, 90),
    g2: weeklyCohorts(accounts, nowMs, 8),
    rc_status: rc ? rc.status : 'not_configured',
    rc_match_status: rc && rc.match_status ? rc.match_status : null,
  };
}

// RevenueCat v2 customers list: limit 100, follow next_page to the end (capped), keep
// only id + first-seen UTC day. 401/403 = the key lacks customers:read (no fallback).
const RC_BASE = 'https://api.revenuecat.com';
const RC_MAX_PAGES = 100;
function rcFirstSeenDay(v) {
  if (v == null) return null;
  const ms = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(ms) ? utcDay(ms) : null;
}
async function fetchRevenueCatCustomers() {
  const key = process.env.REVENUECAT_API_KEY;
  const project = process.env.REVENUECAT_PROJECT_ID;
  if (!key || !project) return { status: 'not_configured' };
  const headers = { Authorization: `Bearer ${key}`, Accept: 'application/json' };
  let url = `${RC_BASE}/v2/projects/${encodeURIComponent(project)}/customers?limit=100`;
  const customers = [];
  try {
    for (let page = 0; url; page++) {
      if (page >= RC_MAX_PAGES) return { status: 'incomplete', customers };
      const r = await fetch(url, { headers });
      if (r.status === 401 || r.status === 403) return { status: 'no_permission', http: r.status };
      if (!r.ok) return { status: 'error', http: r.status };
      const j = await r.json();
      for (const c of j.items || []) customers.push({ id: String(c.id), day: rcFirstSeenDay(c.first_seen_at) });
      const next = j.next_page;
      url = next ? (/^https?:\/\//.test(next) ? next : RC_BASE + (next.startsWith('/') ? '' : '/') + next) : null;
    }
    return { status: 'ok', customers };
  } catch (e) {
    return { status: 'error', message: String(e && e.message || e) };
  }
}

// Classify identified RevenueCat ids first seen in the last 90 full days via the
// service-role RPC admin_match_ids (exact full-id join). Ids stay server-side.
async function withRcMatch(rc, nowMs) {
  if (!rc || rc.status !== 'ok') return rc;
  const w = fullDayWindow(nowMs, 90);
  const ids = [...new Set(rc.customers.filter((c) => inWindow(c.day, w) && !isAnonymousRcId(c.id)).map((c) => c.id))];
  if (!ids.length) return { ...rc, match: {}, match_status: 'ok' };
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ...rc, match: {}, match_status: 'not_configured' };
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/admin_match_ids`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ids: ids }),
    });
    if (!r.ok) return { ...rc, match: {}, match_status: 'error' };
    return { ...rc, match: (await r.json()) || {}, match_status: 'ok' };
  } catch (e) {
    return { ...rc, match: {}, match_status: 'error' };
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
  if (tokenInQuery(req) || !timingSafeEqual(presentedToken(req), expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Panel #016: the only write. Same header-only auth as above; everything else is a GET.
  if (String(req.method || 'GET').toUpperCase() === 'POST') {
    const [code, out] = await markTests(req.body);
    res.status(code).json(out);
    return;
  }

  const [supabase, revenuecat, google_play, apple, rcCustomers] = await Promise.all([
    fetchSupabase(), fetchRevenueCat(), fetchGooglePlay(), fetchApple(), fetchRevenueCatCustomers(),
  ]);

  // Management view: built only when admin_accounts answered (Phase 2 SQL applied).
  let management = null;
  if (supabase.status === 'ok' && supabase.data && Array.isArray(supabase.data.accounts)) {
    const now = Date.now();
    management = buildManagement(supabase.data, await withRcMatch(rcCustomers, now), now);
    delete supabase.data.accounts; // per-account rows stay server-side
  }

  res.status(200).json({
    generated_at: new Date().toISOString(),
    sources: { supabase, revenuecat, google_play, apple },
    management,
  });
};

Object.assign(module.exports, {
  fullDayWindow, platformOf, splitPlatforms, headlineCards, funnel, reconciliation, activationRate, accountsSummary, matchesTestRule, parseMarkBody,
  isAnonymousRcId, dailyNew, weeklyCohorts, buildManagement, fetchRevenueCatCustomers, withRcMatch,
});
