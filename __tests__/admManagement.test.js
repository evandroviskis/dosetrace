'use strict';
// Admin panel — Phase 2 Management view (docs/specs/admin-panel.md "Phase 2 — Management view").
// Definitions are tested on fixture rows shaped like the admin_accounts() RPC output:
//   { c: 'YYYY-MM-DD' (UTC created day), t: is test, apple, ev/pu/ua: platform signals,
//     e: email confirmed or ever signed in, o: onboarded, pr: >=1 protocol, d: >=1 dose, w: active week offsets }
// Dummy values only — no real ids, emails or keys.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.ADMIN_TOKEN = 'dummy-admin-token-0123456789';
const adm = require('../api/adm.js');

const ROOT = path.join(__dirname, '..');
const SQL = fs.readFileSync(path.join(ROOT, 'supabase_admin_rpcs.sql'), 'utf8');
const NOW = Date.parse('2026-09-28T16:00:00Z'); // "today" = 2026-09-28 (UTC); full days end 2026-09-28 00:00

// ---------------------------------------------------------------- test list (MV-0)
function seedEmails() {
  const block = SQL.match(/^insert into public\.admin_test_accounts[\s\S]*?;$/im); // line-anchored: skips the example in the SQL comment
  assert.ok(block, 'seed insert for admin_test_accounts exists');
  return [...block[0].matchAll(/\('([^']+)'/g)].map((m) => m[1]);
}

test('MV-0 test list: every DEVELOPER_EMAILS entry (lib/purchases.js) is in the admin_test_accounts seed', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'purchases.js'), 'utf8');
  const list = src.match(/const DEVELOPER_EMAILS = \[([\s\S]*?)\]/);
  assert.ok(list, 'DEVELOPER_EMAILS found');
  const dev = [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase());
  assert.ok(dev.length >= 1);
  const seed = seedEmails();
  for (const e of dev) assert.ok(seed.includes(e), `seed is missing ${e}`);
});

test('MV-0 test list: seed includes the test account and keeps the 3 candidates real', () => {
  const seed = seedEmails();
  assert.ok(seed.includes('evandro1985@gmail.com'));
  assert.ok(seed.every((e) => e === e.toLowerCase()), 'seed emails are lower-case');
  assert.ok(!seed.some((e) => /testreviewer|cloudtestlabaccounts|evoxbiolabs/.test(e)), 'candidates stay real until the founder decides');
});

test('MV-0 test list: admin_is_test applies the @dosetrace.io rule and the one table', () => {
  const fn = SQL.match(/create or replace function public\.admin_is_test[\s\S]*?\$\$;/i);
  assert.ok(fn, 'admin_is_test defined');
  assert.match(fn[0], /like '%@dosetrace\.io'/);
  assert.match(fn[0], /public\.admin_test_accounts/);
});

test('MV-0 SQL: every admin_ function is revoked from PUBLIC/anon/authenticated and granted to service_role only', () => {
  const names = [...SQL.matchAll(/create or replace function public\.(admin_[a-z_]+)\(([^)]*)\)/gi)].map((m) => m[1]);
  assert.ok(names.includes('admin_accounts') && names.includes('admin_match_ids') && names.includes('admin_is_test'));
  for (const n of new Set(names)) {
    assert.match(SQL, new RegExp(`revoke execute on function public\\.${n}\\([^)]*\\) from public, anon, authenticated;`, 'i'), `${n} revoke`);
    assert.match(SQL, new RegExp(`grant execute on function public\\.${n}\\([^)]*\\) to service_role;`, 'i'), `${n} grant`);
  }
  assert.match(SQL, /revoke all on table public\.admin_test_accounts from public, anon, authenticated;/i);
  assert.match(SQL, /alter table public\.admin_test_accounts enable row level security;/i);
});

// ---------------------------------------------------------------- windows (MV-0)
test('MV-0 windows: last N full UTC days end at today 00:00 UTC; previous period is the N days before', () => {
  assert.deepEqual(adm.fullDayWindow(NOW, 7), { start: '2026-09-21', end: '2026-09-28' });
  assert.deepEqual(adm.fullDayWindow(NOW, 7, 1), { start: '2026-09-14', end: '2026-09-21' });
  assert.deepEqual(adm.fullDayWindow(NOW, 30), { start: '2026-08-29', end: '2026-09-28' });
  assert.deepEqual(adm.fullDayWindow(Date.parse('2026-03-01T00:30:00Z'), 1), { start: '2026-02-28', end: '2026-03-01' });
});

// ---------------------------------------------------------------- platform rule (MV-0)
test('MV-0 platform: Apple sign-in is iOS always, even against other signals', () => {
  assert.equal(adm.platformOf({ apple: true, ev: ['android'], pu: ['android'], ua: ['android'] }), 'ios');
});
test('MV-0 platform: other signals are collected together; agreement gives the platform', () => {
  assert.equal(adm.platformOf({ ev: ['ios'], ua: ['ios'] }), 'ios');
  assert.equal(adm.platformOf({ pu: ['Android'] }), 'android');
});
test('MV-0 platform: disagreement is unknown (mixed); no signal is unknown; no signal outranks another', () => {
  assert.equal(adm.platformOf({ ev: ['ios'], pu: ['android'] }), 'mixed');
  assert.equal(adm.platformOf({ ua: ['android'], ev: ['ios'] }), 'mixed');
  assert.equal(adm.platformOf({}), 'unknown');
  assert.equal(adm.platformOf({ ev: ['web'] }), 'unknown');
});

// ---------------------------------------------------------------- fixture
const A = (c, o = {}) => ({ c, t: false, apple: false, ev: [], pu: [], ua: [], e: true, o: false, pr: false, d: false, w: [], ...o });
const FIX = [
  A('2026-09-27', { apple: true, o: true, pr: true, d: true, w: [0] }), // iOS, full funnel
  A('2026-09-25', { ev: ['android'], o: true, pr: true }),              // Android
  A('2026-09-22', { ua: ['android'] }),                                  // Android
  A('2026-09-21', { e: false }),                                         // unknown, never confirmed/signed in
  A('2026-09-23', { ev: ['ios'], pu: ['android'] }),                     // mixed -> unknown
  A('2026-09-26', { t: true, apple: true, o: true }),                    // TEST, excluded
  A('2026-09-15', { pu: ['ios'], o: true }),                             // previous 7-day period
  A('2026-09-28', { ev: ['android'] }),                                  // today: outside every full-day window
];

// ---------------------------------------------------------------- headline H1–H4
test('H1–H4: new customers per window exclude test accounts and today, with previous period and platform split', () => {
  const h = adm.headlineCards(FIX, NOW);
  const h7 = h.find((x) => x.days === 7);
  assert.equal(h7.count, 5);
  assert.equal(h7.prev, 1);
  assert.equal(h7.delta, 4);
  assert.equal(h7.pct, 400);
  assert.deepEqual(h7.platforms, { total: 5, ios: 1, android: 2, unknown: 2, mixed: 1 });
  assert.equal(h7.platforms.ios + h7.platforms.android + h7.platforms.unknown, h7.count, 'split always adds up');
  assert.deepEqual(h.map((x) => x.days), [7, 30, 90]);
});
test('H1–H4: percentage change is null (not infinite) when the previous period is 0', () => {
  const h = adm.headlineCards([A('2026-09-27')], NOW);
  assert.equal(h[0].prev, 0);
  assert.equal(h[0].pct, null);
});

// ---------------------------------------------------------------- funnel W1–W5
test('W1–W5: one cohort (real accounts created in the window), each step counted within it', () => {
  const f = adm.funnel(FIX, adm.fullDayWindow(NOW, 7));
  const byId = Object.fromEntries(f.map((s) => [s.id, s.total]));
  assert.deepEqual(byId, { W1: 5, W2: 4, W3: 2, W4: 2, W5: 1 });
  const w1 = f.find((s) => s.id === 'W1');
  assert.equal(w1.ios + w1.android + w1.unknown, w1.total);
});

// ---------------------------------------------------------------- reconciliation X2–X6
const RC = {
  status: 'ok',
  customers: [
    { id: '$RCAnonymousID:aaaa0001', day: '2026-09-22' },
    { id: '$RCAnonymousID:aaaa0002', day: '2026-09-27' },
    { id: 'user-real-1', day: '2026-09-27' },
    { id: 'user-real-2', day: '2026-09-25' },
    { id: 'user-test-1', day: '2026-09-26' },
    { id: 'user-gone-1', day: '2026-09-24' },
    { id: 'user-real-3', day: '2026-09-10' }, // outside the 7-day window
  ],
  match: { 'user-real-1': 'real', 'user-real-2': 'real', 'user-test-1': 'test', 'user-gone-1': 'none', 'user-real-3': 'real' },
};
test('X2–X6: accounts vs RevenueCat IDs for the same window; X3 = X4 + X5 + X6', () => {
  const r = adm.reconciliation(FIX, RC, adm.fullDayWindow(NOW, 7));
  assert.deepEqual(r.x2, { all: 6, test: 1, real: 5 });
  assert.equal(r.rc.status, 'ok');
  assert.equal(r.rc.x3, 6);
  assert.equal(r.rc.x4, 2);
  assert.deepEqual(r.rc.x5, { real: 2, test: 1 });
  assert.equal(r.rc.x6, 1);
  assert.equal(r.rc.check_ok, true);
  assert.equal(r.rc.diff, 0);
});
test('X2–X6: an id the match step could not classify breaks the check instead of being guessed', () => {
  const rc = { ...RC, match: { ...RC.match } };
  delete rc.match['user-gone-1'];
  const r = adm.reconciliation(FIX, rc, adm.fullDayWindow(NOW, 7));
  assert.equal(r.rc.check_ok, false);
  assert.equal(r.rc.diff, 1);
});
test('X3–X6: without customers:read the RevenueCat rows are "not measured", X2 still shown', () => {
  const r = adm.reconciliation(FIX, { status: 'no_permission' }, adm.fullDayWindow(NOW, 7));
  assert.equal(r.rc.status, 'no_permission');
  assert.equal(r.rc.x3, undefined);
  assert.equal(r.x2.real, 5);
});
test('X4: anonymous = id starts with $RCAnonymousID', () => {
  assert.equal(adm.isAnonymousRcId('$RCAnonymousID:1234'), true);
  assert.equal(adm.isAnonymousRcId('0a1b2c3d-real'), false);
  assert.equal(adm.isAnonymousRcId(null), false);
});

// ---------------------------------------------------------------- RevenueCat customers fetch
test('RC customers: limit=100, follows next_page to the end, keeps id + first-seen UTC day only', async () => {
  process.env.REVENUECAT_API_KEY = 'dummy-rc-key';
  process.env.REVENUECAT_PROJECT_ID = 'proj123';
  const urls = [];
  const real = global.fetch;
  global.fetch = async (url) => {
    urls.push(String(url));
    const page = urls.length === 1
      ? { object: 'list', items: [{ id: 'u1', first_seen_at: Date.parse('2026-09-27T23:30:00Z') }], next_page: '/v2/projects/proj123/customers?starting_after=u1&limit=100' }
      : { object: 'list', items: [{ id: '$RCAnonymousID:x', first_seen_at: '2026-09-20T01:00:00Z' }], next_page: null };
    return new Response(JSON.stringify(page), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const r = await adm.fetchRevenueCatCustomers();
    assert.equal(r.status, 'ok');
    assert.match(urls[0], /^https:\/\/api\.revenuecat\.com\/v2\/projects\/proj123\/customers\?limit=100$/);
    assert.equal(urls[1], 'https://api.revenuecat.com/v2/projects/proj123/customers?starting_after=u1&limit=100');
    assert.deepEqual(r.customers, [{ id: 'u1', day: '2026-09-27' }, { id: '$RCAnonymousID:x', day: '2026-09-20' }]);
  } finally {
    global.fetch = real;
    delete process.env.REVENUECAT_API_KEY; delete process.env.REVENUECAT_PROJECT_ID;
  }
});
test('RC customers: 401/403 means the key lacks customers:read (no fallback); no key means not configured and no request', async () => {
  const real = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return new Response('{"type":"authorization_error"}', { status: 403 }); };
  try {
    assert.equal((await adm.fetchRevenueCatCustomers()).status, 'not_configured');
    assert.equal(calls, 0);
    process.env.REVENUECAT_API_KEY = 'dummy-rc-key'; process.env.REVENUECAT_PROJECT_ID = 'proj123';
    const r = await adm.fetchRevenueCatCustomers();
    assert.equal(r.status, 'no_permission');
    assert.equal(calls, 1);
  } finally {
    global.fetch = real;
    delete process.env.REVENUECAT_API_KEY; delete process.env.REVENUECAT_PROJECT_ID;
  }
});

// ---------------------------------------------------------------- charts G1–G2
test('G1: new customers per day for the last 90 full days, by platform, real only; sums equal the 90-day card', () => {
  const g = adm.dailyNew(FIX, NOW, 90);
  assert.equal(g.days.length, 90);
  assert.equal(g.days[89].d, '2026-09-27');
  const sum = g.days.reduce((s, r) => s + r.ios + r.android + r.unknown, 0);
  assert.equal(sum, adm.headlineCards(FIX, NOW).find((x) => x.days === 90).count);
  assert.deepEqual(g.days[89], { d: '2026-09-27', ios: 1, android: 0, unknown: 0 });
});
test('G2: weekly signup cohorts (ISO weeks, Monday UTC), real only, cell n = active in week n', () => {
  const rows = [
    A('2026-09-21', { w: [0, 1] }), A('2026-09-22', { w: [0] }), A('2026-09-23', { t: true, w: [0, 1] }),
    A('2026-09-28', { w: [0] }),
  ];
  const g = adm.weeklyCohorts(rows, NOW, 8);
  assert.equal(g.length, 8);
  const last = g[g.length - 1];
  assert.equal(last.week, '2026-09-28');
  assert.deepEqual(last.cells, [1]);
  const prev = g[g.length - 2];
  assert.equal(prev.week, '2026-09-21');
  assert.equal(prev.size, 2);
  assert.deepEqual(prev.cells, [2, 1]);
});

// ---------------------------------------------------------------- server: counts only, never RC ids
test('Management payload: built server-side; the response carries counts, never RevenueCat or Supabase ids', async () => {
  process.env.SUPABASE_URL = 'https://dummy.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-key';
  process.env.REVENUECAT_API_KEY = 'dummy-rc-key'; process.env.REVENUECAT_PROJECT_ID = 'proj123';
  const real = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u.endsWith('/rpc/admin_accounts')) return json({ accounts: FIX, protocols_live: 3 });
    if (u.endsWith('/rpc/admin_match_ids')) return json({ 'secret-user-id-1': 'real' });
    if (u.includes('/customers')) return json({ object: 'list', items: [{ id: 'secret-user-id-1', first_seen_at: Date.now() - 2 * 864e5 }, { id: '$RCAnonymousID:secretanon', first_seen_at: Date.now() - 2 * 864e5 }], next_page: null });
    return json({});
  };
  const res = { code: 0, body: '', setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = JSON.stringify(b); return this; } };
  try {
    await adm({ method: 'GET', url: '/api/adm', headers: { authorization: 'Bearer dummy-admin-token-0123456789' }, query: {} }, res);
    assert.equal(res.code, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.management, 'management block present');
    assert.equal(body.management.windows['7'].recon.rc.x3, 2);
    assert.ok(!res.body.includes('secret-user-id-1') && !res.body.includes('secretanon'), 'no ids in the response');
  } finally {
    global.fetch = real;
    for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'REVENUECAT_API_KEY', 'REVENUECAT_PROJECT_ID']) delete process.env[k];
  }
});

// ---------------------------------------------------------------- page i18n parity
test('Page: the 6 languages of web/adm.html have exactly the same keys, including the management labels', () => {
  const html = fs.readFileSync(path.join(ROOT, 'web', 'adm.html'), 'utf8');
  const script = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  const tm = script.match(/var T=(\{[\s\S]*?\n  \});/);
  const T = (0, eval)('(' + tm[1] + ')');
  const langs = Object.keys(T);
  assert.deepEqual(langs, ['en', 'es', 'pt', 'fr', 'de', 'it']);
  const en = Object.keys(T.en).sort();
  for (const l of langs) assert.deepEqual(Object.keys(T[l]).sort(), en, `${l} key parity`);
  for (const k of ['tab_mgmt', 'tab_details', 'x3', 'nm_stores', 'nm_premium', 'nm_rc_perm', 'g1_q', 'g2_q', 'rule_rcids']) assert.ok(T.en[k], `en has ${k}`);
});
