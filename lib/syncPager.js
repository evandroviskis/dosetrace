'use strict';
// DV-210 (S1): keyset paging for every paged cloud read of the sync (lib/sync.js).
//
// Offset paging (range(offset, ...)) over updated_at with no tie-break could skip a row for good:
// a row on an earlier page edited during the pull moves to the end and every later row shifts one
// place back, so the row at the page boundary is never read (and the watermark passes it); rows
// sharing one updated_at (one transaction) come back in any order per query, so a page boundary
// inside that group could skip or repeat rows. Keyset paging continues strictly after the last row
// read, on a total order — (updated_at, id) or id — so no row can fall between two pages.
//
// base() returns a FRESH query for each page with the select and the fixed filters applied
// (supabase.from(t).select('*').eq('user_id', u)); the pager adds the cursor, the order and the
// limit. Pure (no Supabase import): driven by __tests__/syncPager.test.js with a fake builder.

// PostgREST: values holding reserved characters (, . : ( )) are double-quoted inside or=(...).
const q = (v) => `"${String(v)}"`;

// Rows changed after `since` (exclusive), in (updated_at, id) order. On a failed page the rows read
// so far are returned only up to the last COMPLETE updated_at group: the caller's watermark is the
// newest updated_at it merged and the next pull asks for updated_at > watermark, so half a group
// would lose the rest of it.
async function fetchByUpdated(base, { since = null, pageSize = 500 } = {}) {
  const rows = [];
  let last = null;
  while (true) {
    let query = base();
    if (since) query = query.gt('updated_at', since);
    else query = query.not('updated_at', 'is', null); // NULLs are read by their own pass below
    if (last) query = query.or(`updated_at.gt.${q(last.updated_at)},and(updated_at.eq.${q(last.updated_at)},id.gt.${q(last.id)})`);
    let res;
    try {
      res = await query.order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(pageSize);
    } catch (e) { res = { data: null, error: e }; }
    const page = res && res.data;
    if (!res || res.error || !Array.isArray(page)) {
      const cut = rows.length ? rows[rows.length - 1].updated_at : null;
      return { data: rows.filter((r) => r.updated_at < cut), error: (res && res.error) || new Error('fetch failed') };
    }
    rows.push(...page);
    if (page.length < pageSize) break;
    const tail = page[page.length - 1];
    last = { updated_at: tail.updated_at, id: tail.id };
  }
  // Gate B 1.3.1 item 6: a full read also takes rows whose updated_at is NULL (the keyset cursor
  // cannot reach them; none exist in production today), so fullImport never takes one for deleted.
  // An incremental read cannot match NULL (gt), as before.
  if (!since) {
    const nulls = await fetchById(() => base().is('updated_at', null), { pageSize });
    if (nulls.error) return { data: rows, error: nulls.error };
    rows.push(...nulls.data);
  }
  return { data: rows, error: null };
}

// Every row of the account (fullImport), read by keyset on (updated_at, id) and handed back in
// created_at order as before (nulls last), so the import inserts in the same order.
async function fetchAllRows(base, { pageSize = 500 } = {}) {
  const { data, error } = await fetchByUpdated(base, { since: null, pageSize });
  const key = (r) => (r.created_at == null ? null : String(r.created_at));
  const sorted = data.map((r, i) => ({ r, i })).sort((a, b) => {
    const x = key(a.r); const y = key(b.r);
    if (x === y) return a.i - b.i;
    if (x == null) return 1;
    if (y == null) return -1;
    return x < y ? -1 : 1;
  }).map((e) => e.r);
  return { data: sorted, error };
}

// Rows by id order (fetchIds, fetchIn): continue after the last id read.
async function fetchById(base, { pageSize = 1000 } = {}) {
  const rows = [];
  let lastId = null;
  while (true) {
    let query = base();
    if (lastId != null) query = query.gt('id', lastId);
    let res;
    try { res = await query.order('id', { ascending: true }).limit(pageSize); } catch (e) { res = { data: null, error: e }; }
    const page = res && res.data;
    if (!res || res.error || !Array.isArray(page)) return { data: null, error: (res && res.error) || new Error('fetch failed') };
    rows.push(...page);
    if (page.length < pageSize) break;
    lastId = page[page.length - 1].id;
  }
  return { data: rows, error: null };
}

async function fetchIdsKeyset(base, opts) {
  const { data, error } = await fetchById(base, opts);
  return error ? { ids: null, error } : { ids: data.map((r) => r.id), error: null };
}

module.exports = { fetchByUpdated, fetchAllRows, fetchById, fetchIdsKeyset };
