// Apple daily-report cache (founder 2026-11-02: live Apple fell to "timeout after 9 s" with 91 reports a call).
// A closed UTC day never changes: cached days are not asked again; only missing days go to Apple; what comes
// back is stored for the next call. Dummy data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const F = require('./helpers/admAuthFake');
const ROOT = path.join(__dirname, '..');
process.env.ADMIN_TOKEN = 'x';
const adm = require('../api/adm.js');

const ymd = (b) => new Date(Date.now() - b * 86400000).toISOString().slice(0, 10);
const gz = (rows) => { const tsv = ['Product Type Identifier\tUnits', ...rows.map(([t, u]) => t + '\t' + u)].join('\n'); return new Response(zlib.gzipSync(Buffer.from(tsv)), { status: 200 }); };
const reportDate = (u) => (u.match(/reportDate\]=(\d{4}-\d{2}-\d{2})/) || [])[1];
const CACHE = F.SB + '/rest/v1/admin_apple_days';

function appleEnv(fn) {
  return async () => {
    F.envOn();
    process.env.ASC_PRIVATE_KEY = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
    process.env.ASC_ISSUER_ID = 'x'; process.env.ASC_KEY_ID = 'x'; process.env.ASC_VENDOR_NUMBER = '1';
    try { await fn(); } finally { F.envOff(); for (const k of ['ASC_PRIVATE_KEY', 'ASC_ISSUER_ID', 'ASC_KEY_ID', 'ASC_VENDOR_NUMBER']) delete process.env[k]; }
  };
}

test('AC1: cached days are not asked again; only the missing days go to Apple; days with a report and no-report days at least 3 days old are stored, a fresh no-report day is not', appleEnv(async () => {
  // Cache has every day of the 91-day window except: yesterday (b=1), the day before (b=2) and one old day (b=40).
  const cached = [];
  for (let b = 3; b <= 91; b++) if (b !== 40) cached.push({ day: ymd(b), downloads: b === 10 ? 5 : 1, redownloads: 0, updates: 2, report: b !== 50 });
  const asked = []; let stored = null;
  const f = F.installFetch({ data: (u, body, init) => {
    if (u.startsWith(CACHE)) {
      if ((init.method || 'GET') === 'GET') return F.json(cached);
      stored = body; return new Response(null, { status: 201 });
    }
    if (u.includes('appstoreconnect')) {
      const d = reportDate(u); asked.push(d);
      if (d === ymd(1)) return new Response('', { status: 404 });        // Apple has not written yesterday yet
      if (d === ymd(2)) return gz([['1F', 3], ['3F', 1], ['7F', 9]]);     // report: 3 downloads, 1 redownload, 9 updates
      if (d === ymd(40)) return new Response('', { status: 404 });       // old day, no sales → no report, ever
      throw new Error('asked Apple for a cached day ' + d);
    }
    return F.json({});
  } });
  try {
    const r = await adm.fetchApple();
    assert.equal(r.status, 'ok');
    assert.deepEqual(asked.sort(), [ymd(1), ymd(2), ymd(40)].sort(), 'only the three missing days were asked');
    const days = r.data.days;
    assert.equal(days.length, 87 + 1, '87 cached days with a report (b=3..91 minus b=40 missing minus b=50 no-report) + 1 fetched day');
    assert.deepEqual(days.find((d) => d.date === ymd(2)), { date: ymd(2), downloads: 3, redownloads: 1, updates: 9 });
    assert.deepEqual(days.find((d) => d.date === ymd(10)), { date: ymd(10), downloads: 5, redownloads: 0, updates: 2 }, 'cached numbers are used as they are');
    assert.ok(!days.find((d) => d.date === ymd(50)), 'a cached no-report day is not a day with sales');
    assert.equal(r.data.downloads_30d, 3 + 27 + 5, '30-day sum uses cached + fetched: b=2 fetched 3; b=3..30 cached = 27 days of 1 and b=10 = 5');
    // stored: the fetched report (b=2) and the old no-report day (b=40, report=false); yesterday (b=1, 404) is NOT stored.
    assert.ok(Array.isArray(stored), 'one upsert POST');
    assert.deepEqual(stored.map((x) => x.day).sort(), [ymd(2), ymd(40)].sort());
    assert.deepEqual(stored.find((x) => x.day === ymd(2)), { day: ymd(2), downloads: 3, redownloads: 1, updates: 9, report: true });
    assert.deepEqual(stored.find((x) => x.day === ymd(40)), { day: ymd(40), downloads: 0, redownloads: 0, updates: 0, report: false });
    const post = f.calls.find((c) => c.url.startsWith(CACHE) && c.method === 'POST');
    assert.match(String(post.headers.Prefer || post.headers.prefer), /merge-duplicates/, 'upsert, so a re-read never fails on the primary key');
    assert.equal(post.headers.apikey || post.headers.Apikey, 'dummy-service-key');
  } finally { f.restore(); }
}));

test('AC2: when the cache cannot be read (or Supabase is not configured) every day is asked, as before, and the result is still ok; a failed write never fails the source', appleEnv(async () => {
  let asked = 0;
  const f = F.installFetch({ data: (u, body, init) => {
    if (u.startsWith(CACHE)) return new Response('boom', { status: 500 });
    if (u.includes('appstoreconnect')) { asked++; return reportDate(u) === ymd(2) ? gz([['1F', 2]]) : new Response('', { status: 404 }); }
    return F.json({});
  } });
  try {
    const r = await adm.fetchApple();
    assert.equal(r.status, 'ok');
    assert.equal(asked, 91, 'all 91 days asked when the cache is unreadable');
    assert.equal(r.data.downloads_30d, 2);
  } finally { f.restore(); }
}));

test('AC3: the migration creates admin_apple_days with RLS, revokes public/anon/authenticated and grants only select/insert/update to service_role (no delete)', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261102100000_admin_apple_days.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.admin_apple_days \(\s*day date primary key/);
  assert.match(sql, /report boolean not null default true/);
  assert.match(sql, /alter table public\.admin_apple_days enable row level security/);
  assert.match(sql, /revoke all on table public\.admin_apple_days from public, anon, authenticated/);
  assert.match(sql, /grant select, insert, update on table public\.admin_apple_days to service_role/);
  assert.ok(!/grant[^;]*delete/i.test(sql) && /revoke delete, truncate, references, trigger on table public\.admin_apple_days from service_role/.test(sql), 'no role but postgres may delete a cached day');
  assert.ok(!/create policy/i.test(sql), 'no policies: RLS blocks every non-bypassing role');
});

// Engineering review 2026-11-02: any non-200 (429, 401, 5xx) and any TSV without the expected columns was stored as
// "no sales, forever". AC4: only a 404 is a no-report day; AC5: a report without the columns is not stored; AC6: a
// stored no-report day younger than 14 days is asked again (Apple restates late); AC7: each batch is written as it ends.
test('AC4/AC5: a 429, 401 or 500 on an old day stores nothing; a TSV without the Units column stores nothing', appleEnv(async () => {
  const cached = []; for (let b = 1; b <= 91; b++) if (![5, 6, 7, 8].includes(b)) cached.push({ day: ymd(b), downloads: 1, redownloads: 0, updates: 0, report: true });
  let stored = [];
  const f = F.installFetch({ data: (u, body, init) => {
    if (u.startsWith(CACHE)) { if ((init.method || 'GET') === 'GET') return F.json(cached); stored = stored.concat(body); return new Response(null, { status: 201 }); }
    const d = reportDate(u);
    if (d === ymd(5)) return new Response('', { status: 429 });
    if (d === ymd(6)) return new Response('', { status: 401 });
    if (d === ymd(7)) return new Response('', { status: 500 });
    if (d === ymd(8)) return new Response(zlib.gzipSync(Buffer.from('Some Other Header\tX\nfoo\t1')), { status: 200 });
    throw new Error('asked a cached day ' + d);
  } });
  try {
    const r = await adm.fetchApple();
    assert.equal(r.status, 'ok');
    assert.deepEqual(stored, [], 'nothing stored for errors or an unreadable report');
    assert.equal(r.data.days.length, 87, 'the four days are simply absent this time');
  } finally { f.restore(); }
}));

test('AC6: a stored no-report day younger than 14 days is asked again; an older one is trusted', appleEnv(async () => {
  const cached = []; for (let b = 1; b <= 91; b++) cached.push({ day: ymd(b), downloads: 0, redownloads: 0, updates: 0, report: !(b === 5 || b === 40) });
  const asked = [];
  const f = F.installFetch({ data: (u, body, init) => {
    if (u.startsWith(CACHE)) return (init.method || 'GET') === 'GET' ? F.json(cached) : new Response(null, { status: 201 });
    asked.push(reportDate(u)); return gz([['1F', 2]]);
  } });
  try {
    const r = await adm.fetchApple();
    assert.deepEqual(asked, [ymd(5)], 'only the young no-report day is re-asked');
    assert.equal(r.data.days.find((d) => d.date === ymd(5)).downloads, 2, 'and its late report is used');
  } finally { f.restore(); }
}));

test('AC7: the cache is written once per batch, so a slow first load still keeps what it got', appleEnv(async () => {
  const writes = [];
  const f = F.installFetch({ data: (u, body, init) => {
    if (u.startsWith(CACHE)) { if ((init.method || 'GET') === 'GET') return F.json([]); writes.push(body.length); return new Response(null, { status: 201 }); }
    return gz([['1F', 1]]);
  } });
  try {
    await adm.fetchApple();
    assert.ok(writes.length >= Math.ceil(91 / adm.ASC_BATCH), 'one write per batch: ' + writes.join(','));
    assert.equal(writes.reduce((a, b) => a + b, 0), 91);
  } finally { f.restore(); }
}));
