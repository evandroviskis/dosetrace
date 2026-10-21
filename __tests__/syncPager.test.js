'use strict';
// DV-210 (S1): the sync pulls paged by OFFSET over updated_at with no id tie-break, so a row could
// be skipped for good: a row on an earlier page updated during the pull shifts every later row one
// place back (the one at the page boundary is never read, and the watermark passes it), and rows
// sharing one updated_at (one transaction) can come back in a different order per page query.
// fullImport's absence-delete fed by fetchAll could then remove a live local row. Fix: keyset
// paging on (updated_at, id) (fetchSince, fetchAll) and on id (fetchIds, fetchIn), in the pure
// lib/syncPager.js used by lib/sync.js. Driven with a fake query builder that behaves like
// PostgREST (and returns rows in an arbitrary order among equal sort keys), and the REAL
// postgrest-js builder to pin the URL PostgREST receives.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');

const pager = () => require('../lib/syncPager');

// ── Fake PostgREST over an in-memory table ──────────────────────────────────────────────────────
// Equal sort keys come back in a shuffled order on every query (Postgres guarantees no order there).
function makeTable(rows) {
  const table = { rows, queries: 0, beforeQuery: null };
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  table.query = () => {
    const filters = [];
    let orders = [];
    let lim = null;
    let from = null; let to = null;
    const unq = (v) => String(v).replace(/^"|"$/g, '');
    const cmp = (a, op, b) => (op === 'gt' ? a > b : op === 'eq' ? a === b : op === 'gte' ? a >= b : false);
    const parseOr = (s) => {
      // updated_at.gt."X",and(updated_at.eq."X",id.gt."Y")
      const m = s.match(/^(\w+)\.gt\.("[^"]*"|[^,]+),and\((\w+)\.eq\.("[^"]*"|[^,]+),(\w+)\.gt\.("[^"]*"|[^)]+)\)$/);
      if (!m) throw new Error('unexpected or: ' + s);
      const [, c1, v1, c2, v2, c3, v3] = m;
      return (r) => cmp(r[c1], 'gt', unq(v1)) || (cmp(r[c2], 'eq', unq(v2)) && cmp(r[c3], 'gt', unq(v3)));
    };
    const q = {
      select() { return q; },
      eq(c, v) { filters.push((r) => r[c] === v); return q; },
      gt(c, v) { filters.push((r) => r[c] > v); return q; },
      is(c, v) { filters.push((r) => (r[c] ?? null) === v); return q; },
      not(c, op, v) { if (op !== 'is') throw new Error('unexpected not ' + op); filters.push((r) => (r[c] ?? null) !== v); return q; },
      in(c, vs) { filters.push((r) => vs.includes(r[c])); return q; },
      or(s) { filters.push(parseOr(s)); return q; },
      order(c, o = {}) { orders.push([c, o.ascending !== false]); return q; },
      limit(n) { lim = n; return q; },
      range(a, b) { from = a; to = b; return q; },
      then(res, rej) {
        table.queries++;
        if (table.beforeQuery) table.beforeQuery(table.queries);
        let out = table.rows.filter((r) => filters.every((f) => f(r)));
        out = out.map((r) => ({ r, k: rnd() })).sort((x, y) => {
          for (const [c, asc] of orders) {
            const a = x.r[c] ?? null; const b = y.r[c] ?? null;
            if (a === null && b === null) continue;
            if (a === null || b === null) return (a === null) === asc ? 1 : -1; // Postgres: NULLS LAST ascending
            if (a < b) return asc ? -1 : 1; if (a > b) return asc ? 1 : -1;
          }
          return x.k - y.k;
        }).map((x) => ({ ...x.r }));
        if (from != null) out = out.slice(from, to + 1);
        if (lim != null) out = out.slice(0, lim);
        return Promise.resolve({ data: out, error: null }).then(res, rej);
      },
    };
    return q;
  };
  return table;
}
const ts = (n) => `2026-10-20T10:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}.000000+00:00`;
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// The old lib/sync.js fetchSince, verbatim in behaviour (offset paging, no tie-break).
async function offsetFetchSince(base, since) {
  const rows = []; let offset = 0;
  while (true) {
    let query = base();
    if (since) query = query.gt('updated_at', since);
    const { data: page } = await query.order('updated_at', { ascending: true }).range(offset, offset + 499);
    rows.push(...page);
    if (page.length < 500) break;
    offset += 500;
  }
  return rows;
}

function sixHundredWithAnEarlyEdit() {
  const t = makeTable(Array.from({ length: 600 }, (_, i) => ({ id: uid(i + 1), user_id: 'u', updated_at: ts(i + 1), v: 0 })));
  // Between page 1 and page 2 another phone edits row #10 (on page 1): it moves to the end.
  t.beforeQuery = (n) => { if (n === 2) { const r = t.rows.find((x) => x.id === uid(10)); r.updated_at = ts(9999); r.v = 1; } };
  return t;
}

test('DV-210 repro: offset paging loses the row at the page boundary when an early row is edited mid-pull', async () => {
  const t = sixHundredWithAnEarlyEdit();
  const got = await offsetFetchSince(() => t.query().select('*').eq('user_id', 'u'), null);
  const ids = new Set(got.map((r) => r.id));
  assert.equal(ids.has(uid(501)), false, 'the old pager skips row 501 (this is the defect)');
});

test('DV-210: keyset fetchSince gets every one of 600 rows when an early row is edited between page 1 and page 2', async () => {
  const t = sixHundredWithAnEarlyEdit();
  const { data, error } = await pager().fetchByUpdated(() => t.query().select('*').eq('user_id', 'u'), { since: null, pageSize: 500 });
  assert.equal(error, null);
  const ids = new Set(data.map((r) => r.id));
  for (let i = 1; i <= 600; i++) assert.ok(ids.has(uid(i)), `row ${i} arrives`);
  assert.equal(data.find((r) => r.id === uid(10) && r.v === 1) != null, true, 'the edited row arrives with its edit');
});

test('DV-210: 501 rows sharing one updated_at (one transaction) each arrive exactly once', async () => {
  const same = ts(5);
  const t = makeTable([
    { id: uid(9000), user_id: 'u', updated_at: ts(1) },
    ...Array.from({ length: 501 }, (_, i) => ({ id: uid(i + 1), user_id: 'u', updated_at: same })),
    { id: uid(9001), user_id: 'u', updated_at: ts(7) },
    { id: uid(9002), user_id: 'other', updated_at: same },
  ]);
  const { data } = await pager().fetchByUpdated(() => t.query().select('*').eq('user_id', 'u'), { since: ts(0), pageSize: 500 });
  assert.equal(data.length, 503);
  assert.equal(new Set(data.map((r) => r.id)).size, 503, 'no row twice');
  assert.ok(!data.some((r) => r.user_id !== 'u'), 'only this user');
  // The same group across a page boundary of 100 (several pages inside one timestamp).
  const small = await pager().fetchByUpdated(() => t.query().select('*').eq('user_id', 'u'), { since: null, pageSize: 100 });
  assert.equal(small.data.length, 503);
  assert.equal(new Set(small.data.map((r) => r.id)).size, 503);
});

test('DV-210: since is exclusive, and a failed page returns only rows strictly older than the group it stopped in', async () => {
  const t = makeTable(Array.from({ length: 12 }, (_, i) => ({ id: uid(i + 1), user_id: 'u', updated_at: ts(i < 6 ? 1 : 2) })));
  const ok = await pager().fetchByUpdated(() => t.query().select('*').eq('user_id', 'u'), { since: ts(1), pageSize: 4 });
  assert.equal(ok.data.length, 6, 'rows at the watermark itself are not re-read');
  // Page 2 fails: page 1 ended inside the ts(1) group, so nothing of it is returned (a partial group
  // would move the watermark to ts(1) and the rest of that group would be skipped by gt for good).
  let n = 0;
  const failing = () => { const q = t.query(); const then = q.then; q.then = (res, rej) => (++n === 2 ? Promise.resolve({ data: null, error: { message: 'timeout' } }).then(res, rej) : then(res, rej)); return q.select('*').eq('user_id', 'u'); };
  const bad = await pager().fetchByUpdated(failing, { since: null, pageSize: 4 });
  assert.ok(bad.error);
  assert.equal(bad.data.length, 0);
  n = 0;
  const bad2 = await pager().fetchByUpdated(failing, { since: null, pageSize: 7 });
  assert.ok(bad2.error);
  assert.deepEqual(bad2.data.map((r) => r.updated_at), Array(6).fill(ts(1)), 'the complete ts(1) group is kept, the cut ts(2) group dropped');
});

test('DV-210: fetchAll (keyset) returns every row in created_at order even with a row edited mid-import', async () => {
  const t = sixHundredWithAnEarlyEdit();
  for (const r of t.rows) r.created_at = r.updated_at;
  const { data, error } = await pager().fetchAllRows(() => t.query().select('*').eq('user_id', 'u'), { pageSize: 500 });
  assert.equal(error, null);
  assert.equal(new Set(data.map((r) => r.id)).size, 600);
  const created = data.map((r) => r.created_at);
  assert.deepEqual(created, [...created].sort(), 'created_at order, as the import expects');
});

test('DV-210: fetchIds pages by id with no skip when a row is deleted mid-read', async () => {
  const t = makeTable(Array.from({ length: 2500 }, (_, i) => ({ id: uid(i + 1), user_id: 'u' })));
  t.beforeQuery = (n) => { if (n === 2) t.rows.splice(t.rows.findIndex((r) => r.id === uid(5)), 1); };
  const { ids, error } = await pager().fetchIdsKeyset(() => t.query().select('id').eq('user_id', 'u'), { pageSize: 1000 });
  assert.equal(error, null);
  assert.equal(ids.length, 2500, 'every id read (the deleted one was on page 1, already read)');
  assert.equal(new Set(ids).size, 2500);
});

test('DV-210: the URL PostgREST receives (real postgrest-js): keyset filter quoted, ordered by updated_at then id, limited', async () => {
  const { PostgrestClient } = require('@supabase/postgrest-js');
  const urls = [];
  const pages = [
    Array.from({ length: 2 }, (_, i) => ({ id: uid(i + 1), updated_at: '2026-10-20T10:00:00.123456+00:00' })),
    [],
  ];
  const fetch = async (url) => { urls.push(new URL(url)); return new Response(JSON.stringify(pages.shift() || []), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  const client = new PostgrestClient('https://x.supabase.co/rest/v1', { fetch });
  const { data } = await pager().fetchByUpdated(() => client.from('dose_logs').select('*').eq('user_id', 'u'), { since: '2026-10-19T00:00:00+00:00', pageSize: 2 });
  assert.equal(data.length, 2);
  assert.equal(urls.length, 2);
  const p2 = urls[1].searchParams;
  assert.equal(p2.get('user_id'), 'eq.u');
  assert.equal(p2.get('updated_at'), 'gt.2026-10-19T00:00:00+00:00');
  assert.equal(p2.get('or'), `(updated_at.gt."2026-10-20T10:00:00.123456+00:00",and(updated_at.eq."2026-10-20T10:00:00.123456+00:00",id.gt."${uid(2)}"))`);
  assert.equal(p2.get('order'), 'updated_at.asc,id.asc');
  assert.equal(p2.get('limit'), '2');
  assert.match(urls[1].search, /%2B00%3A00/, 'the + of the time zone is encoded, never read as a space');
});

test('Gate B 6: rows with a NULL updated_at are read too by a full read (fetchAll / fetchSince(null)), once each', async () => {
  const dated = Array.from({ length: 600 }, (_, i) => ({ id: uid(i + 1), user_id: 'u', updated_at: ts(i + 1), created_at: ts(i + 1) }));
  const nulls = Array.from({ length: 5 }, (_, i) => ({ id: uid(5000 + i), user_id: 'u', updated_at: null, created_at: ts(i) }));
  const t = makeTable([...dated, ...nulls]);
  const base = () => t.query().select('*').eq('user_id', 'u');
  const all = await pager().fetchAllRows(base, { pageSize: 500 });
  assert.equal(all.error, null);
  assert.equal(all.data.length, 605, 'fullImport never treats a NULL-stamped row as gone');
  assert.equal(new Set(all.data.map((r) => r.id)).size, 605);
  // Re-verification D: the NULL pass runs only where a missing row causes a delete (fetchAllRows);
  // an ordinary full pull (fetchSince with no watermark) makes no extra request.
  const before = t.queries;
  const full = await pager().fetchByUpdated(base, { since: null, pageSize: 500 });
  assert.equal(full.data.length, 600, 'dated rows only');
  assert.equal(t.queries - before, 2, 'two keyset pages, no NULL request');
  const small = makeTable([...dated.slice(0, 10), ...nulls]);
  const one = await pager().fetchAllRows(() => small.query().select('*').eq('user_id', 'u'), { pageSize: 500 });
  assert.equal(one.data.length, 15, 'one page: no NULL row twice');
  assert.equal(new Set(one.data.map((r) => r.id)).size, 15);
  const inc = await pager().fetchByUpdated(base, { since: ts(598), pageSize: 500 });
  assert.equal(inc.data.length, 2, 'an incremental pull is unchanged (gt never matches NULL)');
});

test('Gate B 6: the full read\'s two URLs (real postgrest-js): dated rows without NULLs, then the NULL rows by id', async () => {
  const { PostgrestClient } = require('@supabase/postgrest-js');
  const urls = [];
  const fetch = async (u) => { urls.push(new URL(u).searchParams); return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  const client = new PostgrestClient('https://x.supabase.co/rest/v1', { fetch });
  await pager().fetchAllRows(() => client.from('food_logs').select('*').eq('user_id', 'u'), { pageSize: 500 });
  assert.equal(urls.length, 2);
  assert.equal(urls[0].get('updated_at'), 'not.is.null');
  assert.equal(urls[0].get('order'), 'updated_at.asc,id.asc');
  assert.equal(urls[1].get('updated_at'), 'is.null');
  assert.equal(urls[1].get('order'), 'id.asc');
});

test('DV-210: lib/sync.js pages every cloud read through the keyset pager (no offset paging left)', () => {
  const s = read('lib/sync.js');
  assert.match(s, /fetchByUpdated\(/);
  assert.match(s, /fetchAllRows\(/);
  assert.match(s, /fetchIdsKeyset\(/);
  assert.doesNotMatch(s, /\.range\(offset/);
});
