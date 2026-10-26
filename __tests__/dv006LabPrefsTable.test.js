'use strict';
// DV-006, 1.3.2 part (founder 2026-10-20: "the synced table ships in 1.3.2"; spec
// docs/specs/dv006-lab-table.md LT-1..LT-12). Lab stars and test labels move from user_metadata
// into the synced table lab_prefs (local SQLite + Supabase, through lib/syncCore), with tombstones
// (removed_at) and a one-time, merge-only copy of the metadata values. Until the cloud table exists
// (the migration file is not applied yet: PGRST205 / 42P01) the app keeps the 1.3.1 path
// (user_metadata, merge-on-write, refused offline) and every other table syncs as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('./helpers/syncHarness');
const core = require('../lib/syncCore');
const { toCloudPayload, CLOUD_FIELDS } = require('../lib/syncMappers');
const LP = require('../lib/labPrefsStore');
const { read } = require('./helpers/extractFn');

const U = 'user-1';
const MISSING = { code: 'PGRST205', message: "Could not find the table 'public.lab_prefs' in the schema cache" };

// The cloud before the migration: lab_prefs answers "table not found" to every call.
function withoutLabTable(cloud, error = MISSING) {
  const view = Object.create(cloud);
  for (const m of ['insert', 'update', 'delete', 'fetchSince', 'fetchAll', 'fetchIn']) {
    view[m] = async (table, ...rest) => (table === 'lab_prefs' ? { data: null, error } : cloud[m](table, ...rest));
  }
  return view;
}

// The account's user_metadata on the server, with GoTrue's top-level key merge (as the 1.3.1 test).
function metaServer(meta = {}) {
  const s = { meta: JSON.parse(JSON.stringify(meta)), up: true, writes: [] };
  s.readFresh = async () => { if (!s.up) throw new Error('Network request failed'); return JSON.parse(JSON.stringify(s.meta)); };
  s.writeMeta = async (data) => { if (!s.up) return { error: new Error('Network request failed') }; s.writes.push(data); Object.assign(s.meta, JSON.parse(JSON.stringify(data))); return { error: null }; };
  return s;
}

let clock = 0;
const now = () => new Date(Date.parse('2026-10-26T12:00:00Z') + (++clock) * 1000).toISOString();

function phone(db, srv, { cachedMeta } = {}) {
  let syncs = 0;
  const c = LP.createLabPrefs({
    db, userId: U,
    meta: async () => JSON.parse(JSON.stringify(cachedMeta || srv.meta)),
    readFresh: srv.readFresh,
    writeMeta: srv.writeMeta,
    ready: () => core.cloudTableReady(db, 'lab_prefs', U),
    requestSync: () => { syncs += 1; },
    now,
  });
  c.syncs = () => syncs;
  return c;
}
const labRows = (db) => db.getAllSync('SELECT * FROM lab_prefs WHERE user_id = ? ORDER BY id', [U]);

test('LT-1: lab_prefs is a synced table: local schema, TABLES, change numbering, the mapper sends removed_at (a clear included)', () => {
  const db = H.makeDb();
  assert.ok(core.TABLES.includes('lab_prefs'));
  const cols = db.getAllSync('PRAGMA table_info(lab_prefs)').map((c) => c.name);
  for (const c of ['id', 'remote_id', 'user_id', 'kind', 'test_key', 'item_key', 'value', 'removed_at', 'created_at', 'updated_at', 'sync_status', 'dt_seq']) assert.ok(cols.includes(c), `lab_prefs.${c}`);
  assert.ok(require('../lib/changeSeq').TABLES.includes('lab_prefs'), 'local change numbering (A-119 rebuild keep rule)');
  assert.deepEqual(CLOUD_FIELDS.lab_prefs, ['kind', 'test_key', 'item_key', 'value', 'removed_at']);
  const p = toCloudPayload('lab_prefs', { kind: 'star', test_key: '', item_key: 'ferritin', value: 'Ferritin', removed_at: null });
  assert.deepEqual(p, { kind: 'star', test_key: '', item_key: 'ferritin', value: 'Ferritin', removed_at: null });
  assert.ok('removed_at' in p, 'a re-star sends removed_at = null so the cloud clears its tombstone');
});

test('LT-2: a star and a label made OFFLINE are kept on the phone and reach the cloud on the next sync; a new phone imports them', async () => {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  const srv = metaServer({ lab_prefs_migrated: true });
  await core.pullChanges(db, cloud, U); // the table exists: this phone pulled it once
  assert.equal(core.cloudTableReady(db, 'lab_prefs', U), true);
  const A = phone(db, srv);
  srv.up = false; // offline: the metadata cannot be read or written
  const r1 = await A.star('Ferritin', true);
  assert.equal(r1.ok, true, 'never refused offline any more');
  assert.deepEqual(r1.favorites, ['Ferritin']);
  const r2 = await A.label('2026-09-01', 'baseline', true);
  assert.deepEqual(r2.tags, { '2026-09-01': ['baseline'] });
  assert.ok(A.syncs() >= 2, 'each change asks for a sync');
  assert.equal(labRows(db).every((r) => r.sync_status === 'pending'), true);
  await core.pushPending(db, cloud, U);
  assert.equal(labRows(db).every((r) => r.sync_status === 'synced' && r.remote_id), true);
  const up = cloud.rows('lab_prefs', U).map((r) => [r.kind, r.test_key, r.item_key, r.value, r.removed_at ?? null]).sort();
  assert.deepEqual(up, [['label', '2026-09-01', 'baseline', 'baseline', null], ['star', '', 'ferritin', 'Ferritin', null]]);
  // A new phone (fresh sign-in): the full import brings both.
  const db2 = H.makeDb();
  await core.fullImport(db2, cloud, U);
  assert.equal(core.cloudTableReady(db2, 'lab_prefs', U), true);
  const B = phone(db2, metaServer({ lab_prefs_migrated: true }));
  assert.deepEqual(await B.load(), { favorites: ['Ferritin'], tags: { '2026-09-01': ['baseline'] } });
});

test('LT-3: un-star and remove a label = tombstones (removed_at): the rows stay, sync, and a re-star clears the same row', async () => {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  const srv = metaServer({ lab_prefs_migrated: true });
  await core.pullChanges(db, cloud, U);
  const A = phone(db, srv);
  await A.star('Testosterone, Total', true);
  await A.label('2026-09-01', 'baseline', true);
  await core.pushPending(db, cloud, U);
  // The star toggled through an older name variant still matches (canonical key, as 1.3.1).
  const off = await A.star('Total Testosterone', false);
  assert.deepEqual(off.favorites, []);
  const gone = await A.label('2026-09-01', 'baseline', false);
  assert.deepEqual(gone.tags, {});
  assert.equal(labRows(db).length, 2, 'no row deleted: removal is a tombstone');
  assert.ok(labRows(db).every((r) => r.removed_at && r.sync_status === 'pending'));
  await core.pushPending(db, cloud, U);
  assert.ok(cloud.rows('lab_prefs', U).every((r) => r.removed_at), 'the tombstones reached the cloud');
  // Another phone sees them removed (a pull of a synced row takes the cloud's state).
  const db2 = H.makeDb();
  await core.fullImport(db2, cloud, U);
  assert.deepEqual(await phone(db2, metaServer({ lab_prefs_migrated: true })).load(), { favorites: [], tags: {} });
  // Re-star: the same row, removed_at cleared, sent as null.
  const again = await A.star('Testosterone, Total', true);
  assert.deepEqual(again.favorites, ['Testosterone, Total']);
  assert.equal(labRows(db).length, 2, 'no second row for the same marker');
  await core.pushPending(db, cloud, U);
  const star = cloud.rows('lab_prefs', U).find((r) => r.kind === 'star');
  assert.equal(star.removed_at, null);
  await core.pullChanges(db2, cloud, U);
  assert.deepEqual((await phone(db2, metaServer({ lab_prefs_migrated: true })).load()).favorites, ['Testosterone, Total']);
  // Dropping a report date removes only that date's labels.
  await A.label('2026-10-01', 'week 8', true);
  await A.label('2026-09-01', 'fasted', true);
  const dropped = await A.dropLabels('2026-10-01');
  assert.deepEqual(dropped.tags, { '2026-09-01': ['fasted'] });
});

test('LT-4: the cloud table missing (migration not applied: PGRST205 / 42P01) breaks nothing: every other table syncs, a rebuild still works, the 1.3.1 metadata path is used', async () => {
  for (const err of [MISSING, { code: '42P01', message: 'relation "public.lab_prefs" does not exist' }]) {
    const db = H.makeDb();
    const base = H.makeCloud();
    const cloud = withoutLabTable(base, err);
    // A protocol pushes and pulls as before.
    H.seedLocalProtocol(db, U, { name: 'BPC-157' });
    await core.pushPending(db, cloud, U);
    assert.equal(base.rows('protocols', U).length, 1, 'the protocol reached the cloud');
    const res = await core.pullChanges(db, cloud, U);
    assert.ok(res.ok.includes('protocols') && !res.ok.includes('lab_prefs'));
    assert.equal(core.cloudTableReady(db, 'lab_prefs', U), false, 'never "ready" while the table is missing');
    // A new phone imports everything else.
    const db2 = H.makeDb();
    const imp = await core.fullImport(db2, cloud, U);
    assert.ok(imp.ok.includes('protocols'));
    assert.equal(db2.getAllSync('SELECT * FROM protocols').length, 1);
    // The A-119 rebuild (every table fetched first) still works: lab_prefs is skipped, not a failure.
    const rb = await core.rebuildFromCloud(db2, cloud, U);
    assert.equal(rb.ok, true, 'a missing lab_prefs table never blocks the takeover rebuild');
    // A network error on lab_prefs is still a failure (only "table not found" is skipped).
    const flaky = withoutLabTable(base, { message: 'Network request failed' });
    assert.equal((await core.rebuildFromCloud(db2, flaky, U)).ok, false);
    // The screen: the 1.3.1 path (fresh read, one key written, refused offline), nothing in the table.
    const srv = metaServer({ favorite_markers: ['Ferritin'], name: 'Sam' });
    const A = phone(db, srv);
    assert.deepEqual((await A.load()).favorites, ['Ferritin']);
    const r = await A.star('Vitamin D', true);
    assert.equal(r.ok, true);
    assert.deepEqual(srv.meta.favorite_markers, ['Ferritin', 'Vitamin D']);
    assert.ok(srv.writes.every((w) => Object.keys(w).length === 1 && w.favorite_markers), 'only that key is written');
    assert.equal(srv.meta.name, 'Sam');
    await A.label('2026-09-01', 'baseline', true);
    assert.deepEqual(srv.meta.report_tags, { '2026-09-01': ['baseline'] });
    assert.equal(labRows(db).length, 0, 'nothing written to a table the cloud does not have');
    srv.up = false;
    assert.equal((await A.star('Zinc', true)).ok, false, 'offline is refused visibly, as in 1.3.1');
    assert.deepEqual(srv.meta.favorite_markers, ['Ferritin', 'Vitamin D']);
  }
});

test('LT-4: a table that disappears answers "missing" on push: the rows stay pending, the push of other tables goes on', async () => {
  const db = H.makeDb();
  const base = H.makeCloud();
  await core.pullChanges(db, base, U);
  const A = phone(db, metaServer({ lab_prefs_migrated: true }));
  await A.star('Ferritin', true);
  H.seedLocalProtocol(db, U, { name: 'TB-500' });
  await core.pushPending(db, withoutLabTable(base), U);
  assert.equal(base.rows('protocols', U).length, 1);
  assert.equal(labRows(db)[0].sync_status, 'pending', 'kept, never dropped');
  assert.equal(core.cloudTableReady(db, 'lab_prefs', U), false);
  await core.pullChanges(db, base, U); // the table answers again
  await core.pushPending(db, base, U);
  assert.equal(labRows(db)[0].sync_status, 'synced');
});

test('LT-5: the one-time copy runs only after a successful pull, is merge-only (a key with a row, live or removed, is never copied over) and never deletes the metadata', async () => {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  const meta = { favorite_markers: ['Ferritin', 'Total Testosterone', 'Zinc'], report_tags: { '2026-09-01': ['baseline', 'fasted'], '2026-10-01': ['week 8'] }, name: 'Sam' };
  const srv = metaServer(meta);
  // Already in the cloud table (newer than the metadata): Zinc un-starred, "fasted" removed, "Ferritin" starred.
  const seed = H.makeDb();
  await core.pullChanges(seed, cloud, U);
  const S = phone(seed, metaServer({ lab_prefs_migrated: true }));
  await S.star('Zinc', true); await S.star('Zinc', false);
  await S.label('2026-09-01', 'fasted', true); await S.label('2026-09-01', 'fasted', false);
  await S.star('Ferritin', true);
  await core.pushPending(seed, cloud, U);
  const before = JSON.stringify(cloud.rows('lab_prefs', U).map((r) => [r.id, r.value, r.removed_at, r.updated_at]));

  const A = phone(db, srv);
  // Before any pull: nothing copied, the metadata is shown as it is.
  const pre = await A.load();
  assert.equal(labRows(db).length, 0, 'no copy before the cloud table was pulled');
  assert.deepEqual(pre.favorites, meta.favorite_markers);
  await core.pullChanges(db, cloud, U);
  const view = await A.load();
  assert.deepEqual(view.favorites.slice().sort(), ['Ferritin', 'Total Testosterone'], 'Zinc stays removed (the newer tombstone wins)');
  assert.deepEqual(view.tags, { '2026-09-01': ['baseline'], '2026-10-01': ['week 8'] }, '"fasted" stays removed');
  const copied = labRows(db).filter((r) => r.sync_status === 'pending').map((r) => r.value).sort();
  assert.deepEqual(copied, ['Total Testosterone', 'baseline', 'week 8'], 'only keys without a row are copied');
  assert.equal(JSON.stringify(cloud.rows('lab_prefs', U).map((r) => [r.id, r.value, r.removed_at, r.updated_at])), before, 'the table rows already there are untouched');
  assert.deepEqual(srv.meta.favorite_markers, meta.favorite_markers, 'the metadata is never deleted');
  assert.deepEqual(srv.meta.report_tags, meta.report_tags);
  assert.ok(A.syncs() >= 1, 'the copy asks for a sync');
  // Re-running copies nothing more.
  await A.load();
  assert.equal(labRows(db).length, 3 + 3, 'the 3 pulled rows + the 3 copied, no duplicates');
});

test('LT-6: the copy is confirmed (lab_prefs_migrated, one key) only when every copied value is in the cloud; until then the metadata is still read as fallback, after it only the table', async () => {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  const srv = metaServer({ favorite_markers: ['Ferritin'], report_tags: { '2026-09-01': ['baseline'] } });
  await core.pullChanges(db, cloud, U);
  const A = phone(db, srv);
  await A.load(); // copied locally, not pushed yet
  assert.equal(srv.meta.lab_prefs_migrated, undefined, 'not confirmed while the copy is only on the phone');
  await core.pushPending(db, cloud, U);
  await A.load();
  assert.equal(srv.meta.lab_prefs_migrated, true, 'confirmed once every copied row is in the cloud');
  assert.ok(srv.writes.every((w) => Object.keys(w).length === 1), 'only that key is written');
  assert.deepEqual(srv.meta.favorite_markers, ['Ferritin'], 'the metadata stays as it was');
  // After the confirmation the stale metadata is no longer a source: un-star here, the metadata
  // still lists Ferritin, the screen does not.
  const r = await A.star('Ferritin', false);
  assert.deepEqual(r.favorites, []);
  assert.deepEqual((await A.load()).favorites, []);
  await core.pushPending(db, cloud, U);
  // Until confirmed, a value only in the metadata still shows (fallback).
  const db2 = H.makeDb();
  await core.pullChanges(db2, cloud, U);
  const srv2 = metaServer({ favorite_markers: ['Ferritin', 'Iron'] });
  srv2.up = false; // the copy cannot read the fresh value: nothing copied, the cached metadata is shown
  const B = phone(db2, srv2, { cachedMeta: { favorite_markers: ['Ferritin', 'Iron'] } });
  assert.deepEqual((await B.load()).favorites.slice().sort(), ['Iron'], 'Ferritin removed in the table; Iron only in the metadata still shows');
});

test('LT-7: a confirmed account on a phone that has not pulled yet shows the metadata (display only) and writes go to the table, kept until the pull', async () => {
  const cloud = H.makeCloud();
  const db = H.makeDb();
  const srv = metaServer({ favorite_markers: ['Ferritin'], lab_prefs_migrated: true });
  const A = phone(db, srv);
  assert.deepEqual((await A.load()).favorites, ['Ferritin'], 'not hidden before the first pull');
  const r = await A.star('Iron', true);
  assert.equal(r.ok, true);
  assert.deepEqual(r.favorites.slice().sort(), ['Ferritin', 'Iron']);
  assert.equal(srv.writes.length, 0, 'a confirmed account never writes the metadata again');
  await core.pushPending(db, cloud, U);
  assert.equal(labRows(db)[0].sync_status, 'pending', 'waits for the first pull (the table is not known here yet)');
  await core.pullChanges(db, cloud, U);
  await core.pushPending(db, cloud, U);
  assert.equal(labRows(db)[0].sync_status, 'synced');
  assert.deepEqual((await A.load()).favorites, ['Iron'], 'after the pull only the table counts');
});

test('LT-8: un-starring a value that is only in the metadata, or deleting its report, writes a tombstone so the copy never brings it back', async () => {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  await core.pullChanges(db, cloud, U);
  const srv = metaServer({ favorite_markers: ['Ferritin'], report_tags: { '2026-09-01': ['baseline'] } });
  srv.up = false; // the copy has not run yet (fresh value unreadable)
  const A = phone(db, srv);
  assert.deepEqual(await A.load(), { favorites: ['Ferritin'], tags: { '2026-09-01': ['baseline'] } });
  const off = await A.star('Ferritin', false);
  assert.deepEqual(off.favorites, []);
  const drop = await A.dropLabels('2026-09-01');
  assert.deepEqual(drop.tags, {});
  srv.up = true; // now the copy runs
  const v = await A.load();
  assert.deepEqual(v, { favorites: [], tags: {} }, 'neither comes back');
  assert.ok(labRows(db).every((r) => r.removed_at), 'tombstones only');
});

test('LT-9: sign-out wipe, account deletion, export and the unsent count cover lab_prefs', () => {
  const dbSrc = read('lib/database.js');
  const clear = dbSrc.match(/export function clearLocalDatabase\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/)[1];
  assert.match(clear, /DELETE FROM lab_prefs/);
  assert.match(clear, /DELETE FROM local_meta/, 'the "pulled once" note goes with the local copy');
  const owner = dbSrc.match(/export function getLocalDataUserId\(\)\s*\{([\s\S]*?)\n\}/)[1];
  assert.match(owner, /'lab_prefs'/);
  const del = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'delete-user', 'index.ts'), 'utf8');
  assert.match(del.match(/userDataTables\s*=\s*\[([\s\S]*?)\]/)[1], /'lab_prefs'/);
  const { exportTableNames } = require('../lib/exportTables');
  assert.ok(exportTableNames(core.TABLES).includes('lab_prefs'));
  const db = H.makeDb();
  db.runSync(`INSERT INTO lab_prefs (user_id, kind, test_key, item_key, value, sync_status) VALUES (?, 'star', '', 'ferritin', 'Ferritin', 'pending')`, [U]);
  const { summarizeUnsent } = require('../lib/unsentSummary');
  assert.deepEqual(summarizeUnsent(db, [U]).byKind, { lab: 1 });
});

test('LT-10: the Supabase migration FILE (not applied): own-row RLS, cascade on account deletion, updated_at trigger, the device guard when A-119 is there', () => {
  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  const file = fs.readdirSync(dir).find((f) => /_lab_prefs\.sql$/.test(f));
  assert.ok(file, 'supabase/migrations/*_lab_prefs.sql');
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  assert.match(sql, /NOT APPLIED/);
  assert.match(sql, /pode aplicar/);
  assert.match(sql, /create table if not exists public\.lab_prefs/);
  assert.match(sql, /references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /alter table public\.lab_prefs enable row level security/);
  for (const op of ['select', 'insert', 'update', 'delete']) assert.match(sql, new RegExp(`"lab_prefs ${op} own" on public\\.lab_prefs for ${op}`));
  assert.match(sql, /auth\.uid\(\) = user_id/);
  assert.match(sql, /lab_prefs_set_updated_at before update on public\.lab_prefs/);
  assert.match(sql, /dt_device_guard/);
  assert.match(sql, /'lab_prefs'\]\) then/, 'the pre-request guard lists lab_prefs');
  const code = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  assert.doesNotMatch(code, /\bdrop table\b/i, 'never drops a table (only the commented rollback does)');
});

test('LT-11: BodyScreen reads and writes stars and labels only through lib/labPrefs; a failed save undoes that change and says so', () => {
  const src = read('screens/BodyScreen.js');
  assert.match(src, /from '\.\.\/lib\/labPrefs'/);
  assert.match(src, /await loadLabPrefs\(\)/);
  assert.match(src, /saveLabStar\(marker, on\)/);
  // One label write for every label change (add, remove, a deleted report's date, AD-100's move).
  assert.match(src, /async function saveReportTagOp\(apply, undo, quiet = false\)/);
  assert.match(src, /await saveLabTags\(apply\)/);
  assert.match(src, /saveReportTagOp\(\(tags\) => setReportTag\(tags, date, tag, true\), \(tags\) => setReportTag\(tags, date, tag, false\)\)/);
  assert.match(src, /saveReportTagOp\(\(tags\) => dropReportDate\(tags, date\), null, true\)/);
  assert.doesNotMatch(src, /user_metadata\?\.(favorite_markers|report_tags)/, 'the screen no longer reads the metadata itself');
  assert.doesNotMatch(src, /saveBodyPref\(/, 'the 1.3.1 path lives inside lib/labPrefsStore (fallback)');
  assert.match(src, /t\('error_save_failed'\)/);
  assert.match(src, /isFav: isFavorite\(favorites, display\)/);
  const rt = read('lib/labPrefs.js');
  assert.match(rt, /cloudTableReady\(getDB\(\), 'lab_prefs', user\.id\)/);
  assert.match(rt, /supabase\.auth\.getUser\(\)/);
  assert.match(rt, /supabase\.auth\.updateUser\(\{ data \}\)/);
});

// AD-100 (item/ad99-ad100-wave3) moves a test's labels to its new date with a pure operation on the
// labels object passed to the same label write. A copy of that operation's rule (labels join the new
// date, case-insensitive, the old date keeps them only while another test is on it):
function moveTags(tags, from, to, keepFrom) {
  const src = tags && typeof tags === 'object' ? tags : {};
  const moving = Array.isArray(src[from]) ? src[from] : [];
  if (!moving.length || from === to) return src;
  const out = { ...src };
  const merged = Array.isArray(out[to]) ? out[to].slice() : [];
  for (const tag of moving) if (!merged.some((x) => String(x).toLowerCase() === String(tag).toLowerCase())) merged.push(tag);
  if (!keepFrom) delete out[from];
  out[to] = merged;
  return out;
}

test('LT-13: every label change goes through ONE write, tags(apply): a move to another date (AD-100) is one transaction in the table, and the fresh-metadata path before the table exists', async () => {
  // Table path.
  const db = H.makeDb();
  const cloud = H.makeCloud();
  await core.pullChanges(db, cloud, U);
  const A = phone(db, metaServer({ lab_prefs_migrated: true }));
  await A.label('2026-09-01', 'baseline', true);
  await A.label('2026-09-01', 'fasted', true);
  await A.label('2026-09-08', 'Fasted', true);
  await core.pushPending(db, cloud, U);
  const r = await A.tags((t) => moveTags(t, '2026-09-01', '2026-09-08', false));
  assert.equal(r.ok, true);
  assert.deepEqual(r.tags, { '2026-09-08': ['Fasted', 'baseline'] }, 'joined the new date, no case duplicate, old date empty');
  await core.pushPending(db, cloud, U);
  const db2 = H.makeDb();
  await core.fullImport(db2, cloud, U);
  assert.deepEqual((await phone(db2, metaServer({ lab_prefs_migrated: true })).load()).tags, r.tags, 'another phone reads the same labels');
  // A failing operation writes nothing.
  const before = labRows(db).map((x) => [x.id, x.removed_at]);
  assert.equal((await A.tags(() => { throw new Error('bad'); })).ok, false);
  assert.deepEqual(labRows(db).map((x) => [x.id, x.removed_at]), before);
  // Metadata path (cloud table missing): applied to the FRESH report_tags, only that key written.
  const dbm = H.makeDb();
  const srv = metaServer({ report_tags: { '2026-09-01': ['baseline'], '2026-10-01': ['week 8'] }, name: 'Sam' });
  const B = phone(dbm, srv, { cachedMeta: { report_tags: {} } }); // a stale cached copy never counts
  const m = await B.tags((t) => moveTags(t, '2026-09-01', '2026-10-01', false));
  assert.equal(m.ok, true);
  assert.deepEqual(srv.meta.report_tags, { '2026-10-01': ['week 8', 'baseline'] });
  assert.ok(srv.writes.every((w) => Object.keys(w).length === 1 && w.report_tags));
  assert.equal(srv.meta.name, 'Sam');
  assert.equal(labRows(dbm).length, 0);
});

// Review 2026-10-26 (risk 2): a rebuild with the cloud table missing keeps this phone's lab rows (the
// table is not rebuilt), so they must not be counted as "discarded" in the takeover summary.
test('LT-4 (review): a rebuild with lab_prefs missing never reports the kept lab rows as discarded', async () => {
  const db = H.makeDb();
  const base = H.makeCloud();
  await core.pullChanges(db, base, U);
  db.runSync(`INSERT INTO lab_prefs (user_id, kind, test_key, item_key, value, updated_at, sync_status) VALUES (?, 'star', '', 'Ferritin', '1', 'L1', 'pending')`, [U]);
  const rb = await core.rebuildFromCloud(db, withoutLabTable(base), U);
  assert.equal(rb.ok, true);
  assert.equal(labRows(db).length, 1, 'the lab row is kept');
  const d = rb.discarded || { count: 0, byKind: {} };
  assert.equal(d.count, 0, 'nothing discarded: the kept row is not counted');
  assert.equal((d.byKind || {}).lab, undefined);
});
