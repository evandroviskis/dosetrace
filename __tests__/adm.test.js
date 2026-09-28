'use strict';
// Admin panel endpoint (api/adm.js): the admin token is accepted ONLY from the
// "Authorization: Bearer" header. A token in the URL (query) is refused with a
// generic 401 before any data fetch, even alongside a valid header. Cookies and
// the body are never read. Nothing is logged and the token is never echoed.
// Bug this guards: main's api/adm.js accepted ?t= / ?token= and fetched data.
// Dummy values only — never a real token or key.
const test = require('node:test');
const assert = require('node:assert/strict');

const DUMMY = 'dummy-admin-token-0123456789';
process.env.ADMIN_TOKEN = DUMMY;
process.env.SUPABASE_URL = 'https://dummy.supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-key';
for (const k of ['REVENUECAT_API_KEY', 'REVENUECAT_PROJECT_ID', 'GOOGLE_PLAY_SA_JSON', 'GOOGLE_PLAY_BUCKET',
  'ASC_PRIVATE_KEY', 'ASC_ISSUER_ID', 'ASC_KEY_ID', 'ASC_VENDOR_NUMBER']) delete process.env[k];

const handler = require('../api/adm.js');

// Vercel-style request: req.url keeps the query string, req.query is the parsed object.
function mkReq(url, headers) {
  const query = {};
  new URL(url, 'http://x').searchParams.forEach((v, k) => { query[k] = v; });
  return { method: 'GET', url, headers: headers || {}, query, cookies: {} };
}
function mkRes() {
  const r = { code: 0, body: '', headers: {} };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = JSON.stringify(b); return r; };
  r.send = (b) => { r.body = String(b); return r; };
  r.end = (b) => { if (b) r.body = String(b); return r; };
  return r;
}

// Runs one request with fetch and console stubbed; returns status, body, data fetches, console calls.
async function call(url, headers) {
  const realFetch = global.fetch;
  const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace'];
  const realConsole = methods.map((m) => console[m]);
  let fetches = 0, consoleCalls = 0;
  global.fetch = async () => { fetches++; return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  methods.forEach((m) => { console[m] = () => { consoleCalls++; }; });
  try {
    const res = mkRes();
    await handler(mkReq(url, headers), res);
    return { code: res.code, body: res.body, headers: res.headers, fetches, consoleCalls };
  } finally {
    global.fetch = realFetch;
    methods.forEach((m, i) => { console[m] = realConsole[i]; });
  }
}

const VALID = { authorization: `Bearer ${DUMMY}` };

function assertRefused(r) {
  assert.equal(r.code, 401);
  assert.equal(r.body, '{"error":"Unauthorized"}');
  assert.equal(r.fetches, 0, 'a 401 must return before any data fetch');
  assert.equal(r.consoleCalls, 0);
  assert.ok(!r.body.includes(DUMMY) && !JSON.stringify(r.headers).includes(DUMMY), 'token must never be echoed');
}
function assertServed(r) {
  assert.equal(r.code, 200);
  assert.equal(r.fetches, 3, 'the three Supabase admin RPCs are fetched');
  assert.equal(r.consoleCalls, 0);
  assert.ok(!r.body.includes(DUMMY), 'token must never be echoed');
}

test('adm auth: token in ?t= without a header is refused (401, no data fetch)', async () => {
  assertRefused(await call(`/api/adm?t=${DUMMY}`, {}));
});

test('adm auth: token in ?token= without a header is refused (401, no data fetch)', async () => {
  assertRefused(await call(`/api/adm?token=${DUMMY}`, {}));
});

test('adm auth: valid header plus ?t= is refused (401, no data fetch)', async () => {
  assertRefused(await call('/api/adm?t=x', VALID));
});

test('adm auth: valid header plus ?admin_token= is refused (401, no data fetch)', async () => {
  assertRefused(await call('/api/adm?admin_token=x', VALID));
});

test('adm auth: valid header plus ?access_token= is refused (401, no data fetch)', async () => {
  assertRefused(await call('/api/adm?access_token=x', VALID));
});

test('adm auth: token only in a cookie is refused (401, no data fetch)', async () => {
  assertRefused(await call('/api/adm', { cookie: `dt_adm_token=${DUMMY}; admin_token=${DUMMY}; token=${DUMMY}` }));
});

test('adm auth: wrong header is refused (401, no data fetch)', async () => {
  assertRefused(await call('/api/adm', { authorization: 'Bearer not-the-token' }));
});

test('adm auth: valid header with an unrelated query (?lang=pt) is served (200)', async () => {
  assertServed(await call('/api/adm?lang=pt', VALID));
});

test('adm auth: valid header and no query is served (200)', async () => {
  assertServed(await call('/api/adm', VALID));
});

test('adm auth: no ADMIN_TOKEN configured fails closed (503, no data fetch)', async () => {
  const saved = process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_TOKEN;
  try {
    const r = await call('/api/adm', VALID);
    assert.equal(r.code, 503);
    assert.equal(r.fetches, 0);
  } finally {
    process.env.ADMIN_TOKEN = saved;
  }
});
