'use strict';
// Admin panel endpoint (api/adm.js): the credential is accepted ONLY from the
// "Authorization: Bearer" header. A token in the URL (query) is refused with a
// generic 401 before any call, even alongside a valid header. Cookies and the
// body are never read. Nothing is logged and the token is never echoed.
// Bug this guards (Phase 1 rule 1.1): main's api/adm.js accepted ?t= / ?token= and fetched data.
// Since 3.1 (founder 2026-10-21) the credential is the admin's own Supabase session (aal2),
// not the shared admin token; the session checks themselves are in admLogin.test.js.
// Dummy values only — never a real token or key.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./helpers/admAuthFake.js');

for (const k of ['REVENUECAT_API_KEY', 'REVENUECAT_PROJECT_ID', 'GOOGLE_PLAY_SA_JSON', 'GOOGLE_PLAY_BUCKET',
  'ASC_PRIVATE_KEY', 'ASC_ISSUER_ID', 'ASC_KEY_ID', 'ASC_VENDOR_NUMBER']) delete process.env[k];

const handler = require('../api/adm.js');

const VALID = F.bearer('admin');
const TOKEN = VALID.authorization.slice(7);

// Runs one request with fetch and console stubbed; returns status, body, calls, console calls.
async function call(url, headers) {
  const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace'];
  const realConsole = methods.map((m) => console[m]);
  let consoleCalls = 0;
  methods.forEach((m) => { console[m] = () => { consoleCalls++; }; });
  F.envOn();
  try {
    const r = await F.call(handler, { url, headers: headers || {} });
    return Object.assign(r, { consoleCalls });
  } finally {
    F.envOff();
    methods.forEach((m, i) => { console[m] = realConsole[i]; });
  }
}

function assertRefused(r) {
  assert.equal(r.code, 401);
  assert.equal(r.body, '{"error":"Unauthorized"}');
  assert.equal(r.dataCalls.length, 0, 'a 401 must return before any data fetch');
  assert.equal(r.consoleCalls, 0);
  assert.ok(!r.body.includes(TOKEN) && !JSON.stringify(r.headers).includes(TOKEN), 'token must never be echoed');
}
function assertServed(r) {
  assert.equal(r.code, 200);
  // admin_metrics, admin_feature_adoption, admin_accounts, admin_accounts_list (admin_activity dropped: analytics anonymous since 2026-10-04).
  assert.equal(r.dataCalls.length, 4, 'the four Supabase admin RPCs are fetched');
  assert.equal(r.consoleCalls, 0);
  assert.ok(!r.body.includes(TOKEN), 'token must never be echoed');
}

test('adm auth: token in ?t= without a header is refused (401, no data fetch)', async () => {
  assertRefused(await call(`/api/adm?t=${TOKEN}`, {}));
});

test('adm auth: token in ?token= without a header is refused (401, no data fetch)', async () => {
  assertRefused(await call(`/api/adm?token=${TOKEN}`, {}));
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
  assertRefused(await call('/api/adm', { cookie: `dt_adm_session=${TOKEN}; sb-access-token=${TOKEN}; token=${TOKEN}` }));
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

test('adm auth: Supabase not configured fails closed (503, no call)', async () => {
  const r = await F.call(handler, { url: '/api/adm', headers: VALID });
  assert.equal(r.code, 503);
  assert.equal(r.calls.length, 0);
});
