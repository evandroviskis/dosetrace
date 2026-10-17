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
  // Every line-anchored insert block (the first seed + later founder decisions); skips the example in the SQL comment.
  const blocks = [...SQL.matchAll(/^insert into public\.admin_test_accounts[\s\S]*?;$/gim)];
  assert.ok(blocks.length >= 1, 'seed insert for admin_test_accounts exists');
  return blocks.flatMap((b) => [...b[0].matchAll(/\('([^']+)'/g)].map((m) => m[1]));
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

test('MV-0 test list: seed includes the test account and the founder-marked test accounts (2026-10-16)', () => {
  const seed = seedEmails();
  assert.ok(seed.includes('evandro1985@gmail.com'));
  assert.ok(seed.includes('testreviewer123@gmail.com'), 'store reviewer marked test by the founder');
  assert.equal(seed.filter((e) => e.endsWith('@cloudtestlabaccounts.com')).length, 2, 'the two Play robots');
  assert.ok(seed.every((e) => e === e.toLowerCase()), 'seed emails are lower-case');
  // The company-domain account is marked test too, but its address stays out of the repo (product guardrail);
  // it lives only in the live table. The repo seed must never name that domain.
  assert.ok(!seed.some((e) => /evoxbiolabs/.test(e)));
});
test('MV-0 test list: admin_is_test also treats the Google Play robot domain as test (founder 2026-10-16)', () => {
  const fn = SQL.match(/create or replace function public\.admin_is_test[\s\S]*?\$\$;/i)[0];
  assert.match(fn, /like '%@cloudtestlabaccounts\.com'/);
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

// ---------------------------------------------------------------- activation card (Panel #009)
test('A1 activation: real accounts registered in the last 30 days (today included) with >=1 dose_logs row, one decimal', () => {
  const rows = [
    A('2026-09-28', { d: true }),            // today: inside the window
    A('2026-09-10', { d: false }),
    A('2026-08-29', { d: true }),            // exactly 30 days back: inside
    A('2026-08-28', { d: true }),            // 31 days back: outside
    A('2026-09-20', { t: true, d: true }),   // test account: excluded from both sides
  ];
  const r = adm.activationRate(rows, NOW);
  assert.deepEqual(r.window, { start: '2026-08-29', end: '2026-09-29' });
  assert.equal(r.den, 3);
  assert.equal(r.num, 2);
  assert.equal(r.rate, 66.7);
  assert.equal(r.filtered, true);
});
test('A1 activation: no registrations in the window gives rate null, never a division by zero', () => {
  const r = adm.activationRate([A('2026-07-01', { d: true })], NOW);
  assert.deepEqual({ num: r.num, den: r.den, rate: r.rate }, { num: 0, den: 0, rate: null });
});
test('A1 activation: present in the management payload', () => {
  const m = adm.buildManagement({ accounts: FIX }, { status: 'not_configured' }, NOW);
  assert.ok(m.activation && typeof m.activation.den === 'number');
});
test('A1 activation: the visible window text says 31 UTC calendar days (today included) in all 6 languages', () => {
  const html = fs.readFileSync(path.join(ROOT, 'web', 'adm.html'), 'utf8');
  const T = (0, eval)('(' + html.match(/<script>\n([\s\S]*?)<\/script>/)[1].match(/var T=(\{[\s\S]*?\n  \});/)[1] + ')');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.match(T[l].act_window, /31/, `${l} act_window names the 31 days`);
  assert.match(T.pt.act_window, /31 dias/);
});

// ---------------------------------------------------------------- step 3: test accounts never appear in any number (Panel #011)
// Management numbers are computed in JS from admin_accounts rows that carry the test flag,
// so a fixture can prove it. Details numbers are computed inside the SQL functions; for
// those the test is static (every counting CTE applies admin_is_test) and the live
// before/after proof is in the note.
const HEAVY_TEST = A('2026-09-20', { t: true, d: true, pr: true, o: true, apple: true, w: [0, 1] });
test('Step 3: a test account with many rows changes no Management number (H, W, A1, G1)', () => {
  const base = adm.buildManagement({ accounts: FIX, protocols_live: 1 }, { status: 'not_configured' }, NOW);
  const withTest = adm.buildManagement({ accounts: FIX.concat([HEAVY_TEST, HEAVY_TEST, HEAVY_TEST]), protocols_live: 1 }, { status: 'not_configured' }, NOW);
  assert.deepEqual(withTest.headline, base.headline);
  assert.deepEqual(withTest.windows['7'].funnel, base.windows['7'].funnel);
  assert.deepEqual(withTest.activation, base.activation);
  assert.deepEqual(withTest.g1, base.g1);
  assert.equal(withTest.real_all_time, base.real_all_time);
  assert.equal(withTest.test_count, base.test_count + 3, 'only the excluded-count changes');
});
function sqlFn(name) {
  const m = SQL.match(new RegExp(`create or replace function public\\.${name}\\([^)]*\\)[\\s\\S]*?\\n\\$(?:function|)\\$;`, 'i'));
  assert.ok(m, `${name} defined`);
  return m[0];
}
test('Step 3 SQL: admin_metrics counts only non-test accounts in every group (totals, adherence, funnel, audience, signups, doses, top biomarkers)', () => {
  const fn = sqlFn('admin_metrics');
  for (const cte of ['sg as', 'dl as', 'pcr as', 'udim as', 'funnel as', 'totals as', 'adherence as', 'top_biomarkers as']) {
    const idx = fn.indexOf(cte);
    assert.ok(idx > 0, `${cte} present`);
    const body = fn.slice(idx, fn.indexOf('\n  ', idx + 1) > 0 ? fn.indexOf(')\n', idx) + 1 : fn.length);
    assert.match(fn.slice(idx, idx + 1600), /real/, `${cte} uses the real-accounts set`);
  }
  assert.match(fn, /real as \(select id, email from auth\.users where not public\.admin_is_test\(email\)\)/, 'one real-accounts CTE drives every count');
  assert.ok(!/select count\(\*\) from protocols\)/.test(fn), 'no unfiltered protocols total');
  assert.ok(!/select count\(\*\) from dose_logs\)/.test(fn), 'no unfiltered dose_logs total');
  assert.ok(!/select count\(\*\) from biomarkers\)/.test(fn), 'no unfiltered biomarkers total');
});
test('Step 3 SQL: event-based account metrics are gone (analytics are anonymous since 2026-10-04): no dau, retention, searches or protocol events', () => {
  const fn = sqlFn('admin_metrics');
  for (const dead of ["'dau'", "'retention'", "'searches'", "'protocols_created_events'", 'cohort_users', 'uaw as']) assert.ok(!fn.includes(dead), `${dead} removed`);
});
test('Step 3 SQL: admin_feature_adoption counts events only, with total_users excluding test accounts', () => {
  const fn = sqlFn('admin_feature_adoption');
  assert.match(fn, /not public\.admin_is_test/);
  assert.ok(!fn.includes("'active_users_30d'") && !fn.includes("'users'"), 'no per-user event counts');
});
test('Step 3 SQL: admin_accounts protocols_live excludes test accounts', () => {
  const fn = sqlFn('admin_accounts');
  assert.match(fn, /'protocols_live', \(select count\(\*\) from public\.protocols p join auth\.users u on u\.id = p\.user_id where p\.deleted_at is null and not public\.admin_is_test\(u\.email\)\)/);
});
test('Step 3 page: removed metrics are gone from DEFS, kept ones say test accounts are excluded, RC/store rows say they include test IDs/installs', () => {
  const html = fs.readFileSync(path.join(ROOT, 'web', 'adm.html'), 'utf8');
  const ids = [...html.matchAll(/\{id:"([A-Z]+\d+)"/g)].map((m) => m[1]);
  for (const gone of ['O5', 'O6', 'O7', 'C2', 'F1', 'P1', 'P2', 'P3', 'G2']) assert.ok(!ids.includes(gone), `${gone} removed`);
  for (const kept of ['O2', 'O11', 'O12', 'O13', 'C3', 'C4', 'E1', 'E3', 'F2', 'P4', 'U1']) {
    assert.ok(ids.includes(kept), `${kept} kept`);
    const row = html.match(new RegExp(`\\{id:"${kept}",[^\\n]*`))[0];
    assert.match(row, /[Tt]est accounts excluded/, `${kept} says test accounts excluded`);
  }
  for (const ext of ['V1', 'S1', 'S4']) assert.match(html.match(new RegExp(`\\{id:"${ext}",[^\\n]*`))[0], /includes test/i, `${ext} says it includes test purchases/IDs/installs`);
  assert.match(html, /excluded_n:/, 'label for the excluded count exists');
});

// ---------------------------------------------------------------- Panel #013: honest labels, aligned funnel, Contas tab
function pageT() {
  const html = fs.readFileSync(path.join(ROOT, 'web', 'adm.html'), 'utf8');
  return { html, T: (0, eval)('(' + html.match(/<script>\n([\s\S]*?)<\/script>/)[1].match(/var T=(\{[\s\S]*?\n  \});/)[1] + ')') };
}
test('#013 labels: event-based numbers (usage events, scans per day) say they include test accounts, in 6 languages, and the label is used by the adoption card and the Compare scans row', () => {
  const { html, T } = pageT();
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(T[l].incl_test_ev, `${l} incl_test_ev`);
  assert.equal(T.pt.incl_test_ev, 'Inclui contas de teste (não dá para separar)');
  assert.ok((html.match(/t\('incl_test_ev'\)/g) || []).length >= 2, 'used at least twice (adoption card, scans row)');
});
test('#013 alignment: W4 and the funnel count only live (not deleted) protocols, like the totals', () => {
  const acc = sqlFn('admin_accounts');
  assert.match(acc, /'pr', exists \(select 1 from public\.protocols pr where pr\.user_id = u\.id and pr\.deleted_at is null\)/);
  const met = sqlFn('admin_metrics');
  assert.match(met, /count\(distinct p\.user_id\) from public\.protocols p join real r on r\.id = p\.user_id where p\.deleted_at is null\) created_protocol/);
});
test('#013 Contas SQL: admin_accounts_list returns only non-test accounts, newest first, service_role only, no analytics', () => {
  const fn = sqlFn('admin_accounts_list');
  assert.match(fn, /security definer/i);
  assert.match(fn, /not public\.admin_is_test\(u\.email\)/);
  assert.match(fn, /order by u\.created_at desc/);
  assert.ok(!/analytics_events/.test(fn), 'no event-based fields');
  assert.match(SQL, /revoke execute on function public\.admin_accounts_list\(\) from public, anon, authenticated;/i);
  assert.match(SQL, /grant execute on function public\.admin_accounts_list\(\) to service_role;/i);
});
test('#013 Contas summary: counts by sign-in method, onboarding and platform are measured from the rows; nothing is guessed', () => {
  const rows = [
    { email: 'a@x.y', created: '2026-10-10', provider: 'google', onboarded: true, apple: false, pu: ['android'], ua: ['android'], protocols_live: 2, last_sign_in: '2026-10-11' },
    { email: 'b@x.y', created: '2026-10-09', provider: 'apple', onboarded: false, apple: true, pu: [], ua: [], protocols_live: 0, last_sign_in: null },
    { email: 'c@x.y', created: '2026-10-08', provider: 'email', onboarded: false, apple: false, pu: [], ua: [], protocols_live: 0, last_sign_in: null },
  ];
  const s = adm.accountsSummary(rows);
  assert.deepEqual(s.by_provider, { google: 1, apple: 1, email: 1 });
  assert.deepEqual(s.by_onboarding, { onboarded: 1, not_onboarded: 2 });
  assert.deepEqual(s.by_platform, { ios: 1, android: 1, unknown: 1, mixed: 0 });
  assert.equal(s.total, 3);
});
test('#013 Contas tab: a third tab exists with its labels in 6 languages', () => {
  const { html, T } = pageT();
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of ['tab_accounts', 'acc_email', 'acc_created', 'acc_method', 'acc_platform', 'acc_onboarding', 'acc_protocols', 'acc_last_sign_in', 'acc_yes', 'acc_no']) assert.ok(T[l][k], `${l} ${k}`);
  assert.match(html, /\['accounts','tab_accounts'\]/);
  assert.match(html, /function secAccounts\(\)/);
});


// ---------------------------------------------------------------- Panel #016: marking test accounts (first panel write)
async function post(body, headers, url) {
  const realFetch = global.fetch;
  const calls = [];
  global.fetch = async (u, opt) => { calls.push({ url: String(u), body: opt && opt.body ? JSON.parse(opt.body) : null }); return new Response(JSON.stringify({ ok: true, changed: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  const res = { code: 0, body: '', setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = JSON.stringify(b); return this; } };
  try {
    await adm({ method: 'POST', url: url || '/api/adm', headers: Object.assign({ 'content-type': 'application/json' }, headers || {}), query: {}, body }, res);
    return { res, calls };
  } finally { global.fetch = realFetch; }
}
const VALID = { authorization: 'Bearer dummy-admin-token-0123456789' };
function envOn() { process.env.SUPABASE_URL = 'https://dummy.supabase.test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-key'; }
function envOff() { delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; }

test('TM1 POST: token in the query string is refused even with a valid header; no database call', async () => {
  envOn(); try {
    const { res, calls } = await post({ action: 'mark_test', emails: ['a@x.y'] }, VALID, '/api/adm?t=x');
    assert.equal(res.code, 401); assert.equal(res.body, '{"error":"Unauthorized"}'); assert.equal(calls.length, 0);
  } finally { envOff(); }
});
test('TM1 POST: no header or wrong header is refused; no database call', async () => {
  envOn(); try {
    for (const h of [{}, { authorization: 'Bearer nope' }]) { const { res, calls } = await post({ action: 'mark_test', emails: ['a@x.y'] }, h); assert.equal(res.code, 401); assert.equal(calls.length, 0); }
  } finally { envOff(); }
});
test('TM2 POST: invalid bodies → 400 and no database call (bad action, not an array, empty, non-string, more than 200)', async () => {
  envOn(); try {
    const bad = [
      { action: 'delete_user', emails: ['a@x.y'] },
      { action: 'mark_test', emails: 'a@x.y' },
      { action: 'mark_test', emails: [] },
      { action: 'mark_test', emails: [42] },
      { action: 'mark_test', emails: Array.from({ length: 201 }, (_, i) => `u${i}@x.y`) },
      null,
    ];
    for (const b of bad) { const { res, calls } = await post(b, VALID); assert.equal(res.code, 400, JSON.stringify(b).slice(0, 40)); assert.equal(calls.length, 0); }
  } finally { envOff(); }
});
test('TM2 POST: a valid body calls admin_mark_test once with trimmed, lower-cased, de-duplicated emails and the mark flag', async () => {
  envOn(); try {
    const { res, calls } = await post({ action: 'unmark_test', emails: ['  A@X.Y ', 'a@x.y', 'B@x.y'] }, VALID);
    assert.equal(res.code, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/rest\/v1\/rpc\/admin_mark_test$/);
    assert.deepEqual(calls[0].body, { p_emails: ['a@x.y', 'b@x.y'], p_mark: false });
  } finally { envOff(); }
});
test('TM3 POST: when the database refuses (unknown email), the error is passed through as 400 and nothing is retried', async () => {
  envOn();
  const realFetch = global.fetch; let n = 0;
  global.fetch = async () => { n++; return new Response(JSON.stringify({ message: 'unknown email: nobody@x.y' }), { status: 400 }); };
  const res = { code: 0, body: '', setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = JSON.stringify(b); return this; } };
  try {
    await adm({ method: 'POST', url: '/api/adm', headers: Object.assign({ 'content-type': 'application/json' }, VALID), query: {}, body: { action: 'mark_test', emails: ['nobody@x.y'] } }, res);
    assert.equal(res.code, 400); assert.equal(n, 1); assert.match(res.body, /unknown email/);
  } finally { global.fetch = realFetch; envOff(); }
});
test('TM1 GET behaviour unchanged: a GET with a valid header still serves the dashboard payload', async () => {
  envOn();
  const realFetch = global.fetch;
  global.fetch = async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  const res = { code: 0, body: '', setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = JSON.stringify(b); return this; } };
  try { await adm({ method: 'GET', url: '/api/adm', headers: VALID, query: {} }, res); assert.equal(res.code, 200); assert.ok(JSON.parse(res.body).sources); }
  finally { global.fetch = realFetch; envOff(); }
});
test('TM3/TM4/TM5 SQL: admin_mark_test refuses unknown emails and >200, writes the audit row per email in the same function, never touches auth.users', () => {
  const fn = sqlFn('admin_mark_test');
  assert.match(fn, /security definer/i);
  assert.match(fn, /array_length\(p_emails, 1\) > 200/);
  assert.match(fn, /raise exception 'unknown email: %'/);
  assert.match(fn, /insert into public\.admin_audit_log \(action, email, before, after\)/);
  assert.match(fn, /insert into public\.admin_test_accounts/);
  assert.match(fn, /insert into public\.admin_test_exceptions/);
  assert.ok(!/(delete from|insert into|update) auth\.users/i.test(fn), 'never writes auth.users');
  assert.match(SQL, /revoke execute on function public\.admin_mark_test\(text\[\], boolean\) from public, anon, authenticated;/i);
  assert.match(SQL, /grant execute on function public\.admin_mark_test\(text\[\], boolean\) to service_role;/i);
});
test('TM5 SQL: admin_audit_log and admin_test_exceptions exist with RLS on and service_role-only grants', () => {
  for (const t of ['admin_audit_log', 'admin_test_exceptions']) {
    assert.match(SQL, new RegExp(`create table if not exists public\\.${t} \\(`));
    assert.match(SQL, new RegExp(`alter table public\\.${t} enable row level security;`));
    assert.match(SQL, new RegExp(`revoke all on table public\\.${t} from public, anon, authenticated;`));
    assert.match(SQL, new RegExp(`grant [a-z, ]+ on table public\\.${t} to service_role;`));
  }
  assert.match(SQL, /create table if not exists public\.admin_audit_log \([\s\S]*?at timestamptz[\s\S]*?action text[\s\S]*?email text[\s\S]*?before boolean[\s\S]*?after boolean/);
});
test('TM6 SQL: admin_is_test v3 — exception wins first, then list, then domain rules, then the Gmail name.number rule (case-insensitive)', () => {
  const fn = sqlFn('admin_is_test');
  const iEx = fn.indexOf('admin_test_exceptions'), iList = fn.indexOf('admin_test_accounts'), iRule = fn.indexOf("'^[a-z]+\\.[0-9]{5,6}@gmail\\.com$'");
  assert.ok(iEx > 0 && iList > iEx && iRule > iList, 'exception checked before list and rule');
  assert.match(fn, /case when exists \(select 1 from public\.admin_test_exceptions x where x\.email = lower\(p_email\)\) then false/);
  assert.match(fn, /lower\(p_email\) ~ '\^\[a-z\]\+\\\.\[0-9\]\{5,6\}@gmail\\\.com\$'/);
  const kind = sqlFn('admin_test_kind');
  for (const k of ["'exception'", "'list'", "'domain'", "'rule'"]) assert.ok(kind.includes(k), `kind ${k}`);
});
test('TM6 JS: the rule helper mirrors the SQL pattern (used only for the filter in the page)', () => {
  assert.equal(adm.matchesTestRule('AnnRuiz.51171@gmail.com'), true);
  assert.equal(adm.matchesTestRule('annruiz.5117@gmail.com'), false);
  assert.equal(adm.matchesTestRule('ann.ruiz.51171@gmail.com'), false);
  assert.equal(adm.matchesTestRule('annruiz.51171@hotmail.com'), false);
  assert.equal(adm.matchesTestRule('annruiz.511710@gmail.com'), true);
});
test('TM7 page: Contas tab has search, filters, checkboxes, mark/unmark, confirmation and the test view, with labels in 6 languages', () => {
  const { html, T } = pageT();
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of ['acc_search', 'f_all', 'f_not_onboarded', 'f_no_protocol', 'f_google', 'f_rule', 'btn_mark', 'btn_unmark', 'confirm_mark', 'confirm_unmark', 'btn_confirm', 'btn_cancel', 'view_real', 'view_tests', 'badge_rule', 'badge_list', 'badge_domain', 'by_rule_n', 'select_all', 'write_ok', 'write_err']) assert.ok(T[l][k], `${l} ${k}`);
  assert.equal(T.pt.btn_mark, 'Marcar como teste'); assert.equal(T.pt.btn_unmark, 'Desmarcar teste'); assert.equal(T.pt.view_tests, 'Contas de teste'); assert.equal(T.pt.badge_rule, 'teste (regra)');
  assert.match(html, /id="acc-search"/); assert.match(html, /window\.markTests=function/); assert.match(html, /method:'POST'/);
  assert.ok(!/fetch\('\/api\/adm\?/.test(html), 'no token in any request URL');
});
test('TM8: test accounts stay out of every number after marking (fixture with a heavy test account) and the Resumo shows only the count', () => {
  const base = adm.buildManagement({ accounts: FIX, protocols_live: 1 }, { status: 'not_configured' }, NOW);
  const marked = adm.buildManagement({ accounts: FIX.concat([HEAVY_TEST]), protocols_live: 1 }, { status: 'not_configured' }, NOW);
  assert.deepEqual(marked.headline, base.headline); assert.deepEqual(marked.activation, base.activation); assert.equal(marked.test_count, base.test_count + 1);
  const list = sqlFn('admin_accounts_list');
  assert.match(list, /where not public\.admin_is_test\(u\.email\)/);
  assert.match(list, /'tests'/); assert.match(list, /'by_rule'/);
});

// ---------------------------------------------------------------- Contas tab: sort + filters (founder request 2026-10-17)
// The page's pure helpers live between the markers [acc-pure-start] / [acc-pure-end] and are
// evaluated here as-is, so the test runs the same code the browser runs.
function accPure() {
  const html = fs.readFileSync(path.join(ROOT, 'web', 'adm.html'), 'utf8');
  const m = html.match(/\/\/ \[acc-pure-start\]([\s\S]*?)\/\/ \[acc-pure-end\]/);
  assert.ok(m, 'acc pure block present');
  return (0, eval)('(function(){' + m[1] + '\nreturn {accPlatform:accPlatform,accSort:accSort,accFilter:accFilter};})()');
}
const ACC_ROWS = [
  { email: 'zoe@x.y', created: '2026-10-01', provider: 'google', apple: false, pu: ['android'], ua: [], onboarded: true, confirmed: true, protocols_live: 2, last_sign_in: '2026-10-10' },
  { email: 'Adam@x.y', created: '2026-10-12', provider: 'apple', apple: true, pu: [], ua: [], onboarded: false, confirmed: true, protocols_live: 0, last_sign_in: '2026-10-12' },
  { email: 'mia@x.y', created: '2026-09-20', provider: 'email', apple: false, pu: [], ua: [], onboarded: true, confirmed: false, protocols_live: 1, last_sign_in: null },
  { email: 'annruiz.51171@gmail.com', created: '2026-10-05', provider: 'google', apple: false, pu: [], ua: ['android'], onboarded: false, confirmed: true, protocols_live: 0, last_sign_in: '2026-10-05', excepted: true },
];
test('Contas sort: every column sorts both ways (email case-insensitive, date, login, platform, onboarding, protocols, last sign-in)', () => {
  const { accSort } = accPure();
  const em = (rows) => rows.map((r) => r.email);
  assert.deepEqual(em(accSort(ACC_ROWS, 'email', 'asc')), ['Adam@x.y', 'annruiz.51171@gmail.com', 'mia@x.y', 'zoe@x.y']);
  assert.deepEqual(em(accSort(ACC_ROWS, 'email', 'desc')), ['zoe@x.y', 'mia@x.y', 'annruiz.51171@gmail.com', 'Adam@x.y']);
  assert.deepEqual(em(accSort(ACC_ROWS, 'created', 'desc')), ['Adam@x.y', 'annruiz.51171@gmail.com', 'zoe@x.y', 'mia@x.y']);
  assert.deepEqual(em(accSort(ACC_ROWS, 'created', 'asc')), ['mia@x.y', 'zoe@x.y', 'annruiz.51171@gmail.com', 'Adam@x.y']);
  assert.deepEqual(em(accSort(ACC_ROWS, 'provider', 'asc')).slice(0, 1), ['Adam@x.y']);
  assert.deepEqual(em(accSort(ACC_ROWS, 'platform', 'asc')).map((e) => e[0]), ['z', 'a', 'A', 'm'], 'android, android, ios, unknown');
  assert.deepEqual(em(accSort(ACC_ROWS, 'onboarded', 'desc')).slice(0, 2).sort(), ['mia@x.y', 'zoe@x.y']);
  assert.deepEqual(em(accSort(ACC_ROWS, 'protocols', 'desc')), ['zoe@x.y', 'mia@x.y', 'Adam@x.y', 'annruiz.51171@gmail.com']);
  assert.deepEqual(em(accSort(ACC_ROWS, 'last', 'desc'))[0], 'Adam@x.y');
  assert.equal(em(accSort(ACC_ROWS, 'last', 'asc'))[0], 'mia@x.y', 'missing last sign-in sorts first ascending');
  assert.equal(ACC_ROWS[0].email, 'zoe@x.y', 'input not mutated');
});
test('Contas filters: platform, login, onboarding, live protocols, rule and search combine with AND', () => {
  const { accFilter } = accPure();
  const em = (rows) => rows.map((r) => r.email).sort();
  const F = (o) => Object.assign({ q: '', platform: 'all', provider: 'all', onboarded: 'all', protocols: 'all', rule: false }, o);
  assert.equal(accFilter(ACC_ROWS, F({})).length, 4);
  assert.deepEqual(em(accFilter(ACC_ROWS, F({ platform: 'android' }))), ['annruiz.51171@gmail.com', 'zoe@x.y']);
  assert.deepEqual(em(accFilter(ACC_ROWS, F({ platform: 'ios' }))), ['Adam@x.y']);
  assert.deepEqual(em(accFilter(ACC_ROWS, F({ platform: 'unknown' }))), ['mia@x.y']);
  assert.deepEqual(em(accFilter(ACC_ROWS, F({ provider: 'google' }))), ['annruiz.51171@gmail.com', 'zoe@x.y']);
  assert.deepEqual(em(accFilter(ACC_ROWS, F({ onboarded: 'no' }))), ['Adam@x.y', 'annruiz.51171@gmail.com']);
  assert.deepEqual(em(accFilter(ACC_ROWS, F({ protocols: 'with' }))), ['mia@x.y', 'zoe@x.y']);
  assert.deepEqual(em(accFilter(ACC_ROWS, F({ protocols: 'without' }))), ['Adam@x.y', 'annruiz.51171@gmail.com']);
  assert.deepEqual(em(accFilter(ACC_ROWS, F({ rule: true }))), ['annruiz.51171@gmail.com']);
  assert.deepEqual(em(accFilter(ACC_ROWS, F({ q: 'ADAM' }))), ['Adam@x.y'], 'search is case-insensitive');
  assert.deepEqual(em(accFilter(ACC_ROWS, F({ provider: 'google', onboarded: 'no', platform: 'android' }))), ['annruiz.51171@gmail.com']);
});
test('Contas tab page: sortable headers, filter controls and labels in 6 languages', () => {
  const { html, T } = pageT();
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of ['sort_hint', 'fl_platform', 'fl_login', 'fl_onboarding', 'fl_protocols', 'fl_rule', 'o_all', 'o_with', 'o_without', 'o_yes', 'o_no']) assert.ok(T[l][k], `${l} ${k}`);
  assert.match(html, /onclick="setAccSort\(/);
  for (const id of ['fl-platform', 'fl-login', 'fl-onboarding', 'fl-protocols', 'fl-rule']) assert.ok(html.includes(id), `control ${id}`);
});
test('Bug (founder 2026-10-17): the "Contas de teste" view was empty live — the server must pass tests, by_rule and test_excluded from admin_accounts_list through to the page', async () => {
  process.env.SUPABASE_URL = 'https://dummy.supabase.test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-key';
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    const u = String(url); const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u.endsWith('/rpc/admin_accounts_list')) return json({ test_excluded: 87, by_rule: 76, tests: [{ email: 'a.1@gmail.com', kind: 'rule' }, { email: 'b@x.y', kind: 'list' }], rows: [{ email: 'c@x.y', created: '2026-10-01', provider: 'google', apple: false, pu: [], ua: [], onboarded: false, confirmed: true, protocols_live: 0, last_sign_in: null, excepted: false }] });
    if (u.endsWith('/rpc/admin_accounts')) return json({ accounts: FIX, protocols_live: 1 });
    return json({});
  };
  const res = { code: 0, body: '', setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = JSON.stringify(b); return this; } };
  try {
    await adm({ method: 'GET', url: '/api/adm', headers: { authorization: 'Bearer dummy-admin-token-0123456789' }, query: {} }, res);
    const al = JSON.parse(res.body).sources.supabase.data.accounts_list;
    assert.equal(al.rows.length, 1);
    assert.equal(al.test_excluded, 87);
    assert.equal(al.by_rule, 76);
    assert.deepEqual(al.tests, [{ email: 'a.1@gmail.com', kind: 'rule' }, { email: 'b@x.y', kind: 'list' }]);
  } finally { global.fetch = realFetch; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; }
});

// ---------------------------------------------------------------- MV-6 store rows (W0 / X1): founder GO 2026-10-17, test first
const crypto = require('crypto');
const zlib = require('zlib');
function fakeRes(status, body, type) {
  return new Response(body == null ? null : body, { status, headers: { 'Content-Type': type || 'application/json' } });
}
function restoreFetch(f, env) { return () => { global.fetch = f; for (const k of env) delete process.env[k]; }; }

test('MV-6 storeWindow: sums only the full UTC days of the window, lists days without a report, keeps the latest reported day, passes non-ok statuses through', () => {
  const w = adm.fullDayWindow(NOW, 7); // 2026-09-21 .. 2026-09-27
  const apple = { status: 'ok', data: { days: [
    { date: '2026-09-20', downloads: 9, redownloads: 9, updates: 9 }, // before
    { date: '2026-09-21', downloads: 2, redownloads: 1, updates: 3 },
    { date: '2026-09-24', downloads: 1, redownloads: 0, updates: 5 },
    { date: '2026-09-27', downloads: 1, redownloads: 0, updates: 0 },
    { date: '2026-09-28', downloads: 9, redownloads: 9, updates: 9 }, // today, excluded
  ] } };
  const google = { status: 'ok', data: { days: [
    { date: '2026-09-19', user_installs: 9, device_installs: 9 },
    { date: '2026-09-21', user_installs: 1, device_installs: 2 },
    { date: '2026-09-22', user_installs: 0, device_installs: 0 },
    { date: '2026-09-23', user_installs: 2, device_installs: 2 },
  ] } };
  const s = adm.storeWindow(apple, google, w);
  assert.deepEqual(s.apple, { status: 'ok', downloads: 4, redownloads: 1, updates: 8, days_reported: 3, days_total: 7, missing: ['2026-09-22', '2026-09-23', '2026-09-25', '2026-09-26'], latest: '2026-09-27' });
  assert.deepEqual(s.google, { status: 'ok', user_installs: 3, device_installs: 4, days_reported: 3, days_total: 7, missing: ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'], latest: '2026-09-23' });
  const none = adm.storeWindow({ status: 'not_configured' }, { status: 'error', message: 'list 403: x' }, w);
  assert.deepEqual(none.apple, { status: 'not_configured' });
  assert.deepEqual(none.google, { status: 'error', message: 'list 403: x' });
  const empty = adm.storeWindow({ status: 'ok', data: {} }, undefined, w);
  assert.equal(empty.apple.days_reported, 0); assert.equal(empty.apple.latest, null); assert.equal(empty.apple.missing.length, 7);
  assert.deepEqual(empty.google, { status: 'not_configured' });
});

test('MV-6 buildManagement: without stores every window says not_configured (old callers unchanged); with stores each window carries its own store sums', () => {
  const old = adm.buildManagement({ accounts: FIX }, { status: 'not_configured' }, NOW);
  for (const d of [7, 30, 90]) assert.deepEqual(old.windows[d].store, { apple: { status: 'not_configured' }, google: { status: 'not_configured' } });
  const apple = { status: 'ok', data: { days: [{ date: '2026-09-27', downloads: 1, redownloads: 0, updates: 0 }, { date: '2026-09-01', downloads: 5, redownloads: 0, updates: 0 }] } };
  const m = adm.buildManagement({ accounts: FIX }, { status: 'not_configured' }, NOW, { apple, google_play: { status: 'not_configured' } });
  assert.equal(m.windows[7].store.apple.downloads, 1);
  assert.equal(m.windows[30].store.apple.downloads, 6);
  assert.equal(m.windows[90].store.apple.downloads, 6);
  assert.deepEqual(m.windows[7].store.google, { status: 'not_configured' });
});

test('MV-6 fetchApple: asks one daily SALES SUMMARY per day for the last 91 full days (vendor number in the URL), parses 1*/F1* = downloads, 3* = redownloads, 7* = updates, treats 404 as no report, and still derives the 30-day Details fields', async () => {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  process.env.ASC_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
  process.env.ASC_ISSUER_ID = 'dummy-issuer'; process.env.ASC_KEY_ID = 'DUMMYKEY'; process.env.ASC_VENDOR_NUMBER = '12345678';
  const day = (b) => new Date(Date.now() - b * 86400000).toISOString().slice(0, 10);
  const tsv = (rows) => zlib.gzipSync('Provider\tProduct Type Identifier\tUnits\tDevice\n' + rows.map((r) => 'APPLE\t' + r[0] + '\t' + r[1] + '\tiPhone').join('\n'));
  const urls = [];
  const done = restoreFetch(global.fetch, ['ASC_PRIVATE_KEY', 'ASC_ISSUER_ID', 'ASC_KEY_ID', 'ASC_VENDOR_NUMBER']);
  global.fetch = async (u) => {
    urls.push(String(u));
    const d = (String(u).match(/reportDate\]=(\d{4}-\d{2}-\d{2})/) || [])[1];
    if (d === day(1)) return fakeRes(200, tsv([['1', 2], ['3', 1], ['7', 5], ['F1', 1]]), 'application/a-gzip');
    if (d === day(40)) return fakeRes(200, tsv([['1', 3], ['7', 2]]), 'application/a-gzip');
    return fakeRes(404, '{"errors":[]}');
  };
  try {
    const r = await adm.fetchApple();
    assert.equal(r.status, 'ok');
    assert.equal(urls.length, 91);
    assert.ok(urls.every((u) => u.includes('filter[vendorNumber]=12345678') && u.includes('filter[reportSubType]=SUMMARY')));
    const dates = new Set(urls.map((u) => (u.match(/reportDate\]=(\S+)/) || [])[1]));
    assert.equal(dates.size, 91); assert.ok(dates.has(day(1)) && dates.has(day(91)) && !dates.has(day(0)));
    assert.deepEqual(r.data.days, [{ date: day(40), downloads: 3, redownloads: 0, updates: 2 }, { date: day(1), downloads: 3, redownloads: 1, updates: 5 }]);
    assert.equal(r.data.downloads_30d, 3); assert.equal(r.data.updates_30d, 5); assert.equal(r.data.redownloads_30d, 1);
    assert.equal(r.data.days_with_sales, 1); assert.equal(r.data.latest_day, day(1)); assert.equal(r.data.latest_day_downloads, 3);
  } finally { done(); }
});

test('MV-6 fetchGooglePlay: reads only the monthly *_overview.csv files that overlap the last 91 days (UTF-16), builds the per-day list across months, and keeps the Details fields from the latest file', async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.GOOGLE_PLAY_SA_JSON = JSON.stringify({ client_email: 'dummy@example.test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  process.env.GOOGLE_PLAY_BUCKET = 'dummy_bucket';
  const ym = (d) => d.toISOString().slice(0, 7).replace('-', '');
  const now = new Date(); const cur = ym(now); const prev = ym(new Date(now.getTime() - 31 * 86400000)); const old = '202001';
  const pkg = 'io.outcom.dosetrace';
  const csv = (rows) => Buffer.from('﻿Date,Package name,Daily Device Installs,Daily Device Uninstalls,Daily Device Upgrades,Total User Installs,Daily User Installs,Daily User Uninstalls,Active Device Installs,Install events,Update events,Uninstall events\n' + rows.map((r) => r.join(',')).join('\n'), 'utf16le');
  const yday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dPrev = prev.slice(0, 4) + '-' + prev.slice(4) + '-15';
  const fetched = [];
  const done = restoreFetch(global.fetch, ['GOOGLE_PLAY_SA_JSON', 'GOOGLE_PLAY_BUCKET']);
  global.fetch = async (u) => {
    const s = String(u);
    if (s.startsWith('https://oauth2.googleapis.com/token')) return fakeRes(200, '{"access_token":"dummy-at"}');
    if (s.includes('/o?prefix=')) {
      const p = decodeURIComponent(s.split('prefix=')[1]);
      if (p.startsWith('stats/installs/')) return fakeRes(200, JSON.stringify({ items: [old, prev, cur].flatMap((m) => ['overview', 'country', 'device'].map((k) => ({ name: `stats/installs/installs_${pkg}_${m}_${k}.csv` }))) }));
      return fakeRes(200, '{}'); // no ratings files
    }
    if (s.includes('?alt=media')) {
      const name = decodeURIComponent(s.split('/o/')[1].split('?')[0]); fetched.push(name);
      if (name.includes(`_${cur}_overview`)) return fakeRes(200, csv([[yday, pkg, 2, 0, 0, 0, 1, 0, 18, 0, 0, 0]]), 'text/csv');
      if (name.includes(`_${prev}_overview`)) return fakeRes(200, csv([[dPrev, pkg, 3, 0, 0, 0, 3, 0, 10, 0, 0, 0]]), 'text/csv');
      return fakeRes(200, csv([['2020-01-01', pkg, 99, 0, 0, 0, 99, 0, 99, 0, 0, 0]]), 'text/csv');
    }
    return fakeRes(500, 'unexpected ' + s);
  };
  try {
    const r = await adm.fetchGooglePlay();
    assert.equal(r.status, 'ok', JSON.stringify(r));
    assert.deepEqual(fetched.sort(), [`stats/installs/installs_${pkg}_${cur}_overview.csv`, `stats/installs/installs_${pkg}_${prev}_overview.csv`].sort(), 'only overview files of the months in range');
    assert.deepEqual(r.data.days, [{ date: dPrev, user_installs: 3, device_installs: 3 }, { date: yday, user_installs: 1, device_installs: 2 }]);
    assert.equal(r.data.active_device_installs, 18); assert.equal(r.data.installs_this_month, 2); assert.equal(r.data.month, cur); assert.equal(r.data.total_user_installs, 0);
    assert.equal(r.data.total_average_rating, undefined);
  } finally { done(); }
});

test('MV-6 page: W0 and X1 render the store sums per window (no hard-coded "not measured"), label that stores include test installs, and carry the labels in 6 languages', () => {
  const { html, T } = pageT();
  assert.ok(!/id">W0<\/td>[^\n]*nmCell\(t\('nm_stores'\)\)/.test(html), 'W0 is no longer always not-measured');
  assert.ok(!/id">X1<\/td>[^\n]*nmCell\(t\('nm_stores'\)\)/.test(html), 'X1 is no longer always not-measured');
  assert.match(html, /W\.store/);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of ['st_apple', 'st_google', 'st_redl', 'st_dev', 'st_days', 'st_nodays', 'nm_apple', 'nm_google', 'st_err', 'st_test']) assert.ok(T[l][k], `${l} ${k}`);
  assert.equal(T.pt.st_test, 'As lojas incluem instalações de teste');
  assert.match(html, /function storeNote\([^\n]*\n[\s\S]*?t\('st_test'\)/, 'the note helper carries the test-install label');
  assert.match(html, /id">W0<\/td>[^\n]*storeNote\(/, 'W0 uses it'); assert.match(html, /id">X1<\/td>[^\n]*storeNote\(/, 'X1 uses it');
  const defs = html.match(/var DEFS=\[([\s\S]*?)\];/)[1];
  assert.ok(!/id:"W0"[^\n]*Not measured yet/.test(defs) && !/id:"X1"[^\n]*Not measured yet/.test(defs), 'DEFS W0/X1 describe the measurement');
});
