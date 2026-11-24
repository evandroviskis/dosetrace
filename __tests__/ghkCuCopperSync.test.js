'use strict';
// Copper this cycle — the data (docs/specs/ghk-cu-copper.md CU-11, CU-12, CU-13): protocols.copper_form and
// protocols.ghk_cu_mg in the local schema, synced as regular columns added after the cloud schema (sent
// always, NULL included; the A-121 ends_on rule), working against a cloud WITHOUT the columns until the
// migration is applied, copied by "Retomar", never carried by a Delete-forever tombstone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending, pullChanges } = require('../lib/syncCore');
const { toCloudPayload, CLEARABLE_COLUMNS } = require('../lib/syncMappers');
const { upgradeCopperColumns } = require('../lib/schema');
const E = require('../lib/protocolEnd');
const C = require('../lib/copperCycle');

const USER = 'u-cu';
const COLS = ['copper_form', 'ghk_cu_mg'];

function seed(db, over = {}) {
  const now = new Date(2026, 10, 3, 8).toISOString();
  db.runSync(`INSERT INTO protocols (user_id, name, compound_id, type, color, amount, unit, water, dose, dose_unit, interval_days, doses_per_day, start_date, active, created_at, updated_at, sync_status)
    VALUES (?, 'KLOW', 'lyo_klow', 'recon', '#185FA5', '80', 'mg', '2', '4', 'mg', 1, 1, '2026-11-03', 1, ?, ?, 'pending')`, [USER, now, now]);
  const id = db.getFirstSync('SELECT id FROM protocols ORDER BY id DESC LIMIT 1').id;
  const sets = Object.keys(over);
  if (sets.length) db.runSync(`UPDATE protocols SET ${sets.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...sets.map((k) => over[k]), id]);
  return id;
}
const row = (db, id) => db.getFirstSync('SELECT * FROM protocols WHERE id = ?', [id]);
const edit = (db, id, fields) => {
  const k = Object.keys(fields);
  db.runSync(`UPDATE protocols SET ${k.map((c) => `${c} = ?`).join(', ')}, updated_at = ?, sync_status = 'pending' WHERE id = ?`, [...k.map((c) => fields[c]), new Date().toISOString(), id]);
};

// A cloud that lacks the two columns until migrate() (PostgREST answers PGRST204 for an unknown column).
function oldCloud() {
  const cloud = makeCloud();
  let migrated = false;
  const missing = (col) => ({ data: null, error: { code: 'PGRST204', message: `Could not find the '${col}' column of 'protocols' in the schema cache` } });
  const lacking = (p) => (!migrated ? COLS.find((c) => c in p) : null);
  const ins = cloud.insert.bind(cloud);
  const upd = cloud.update.bind(cloud);
  cloud.insert = async (t, p) => { const c = t === 'protocols' && lacking(p); return c ? missing(c) : ins(t, p); };
  cloud.update = async (t, rid, p, o) => { const c = t === 'protocols' && lacking(p); return c ? missing(c) : upd(t, rid, p, o); };
  cloud.migrate = () => { migrated = true; };
  return cloud;
}

test('CU-11: both columns exist on a new install and are added to an older local schema', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'lib', 'database.js'), 'utf8'), /upgradeCopperColumns\(db\);/);
  const db = makeDb();
  const cols = db.getAllSync('PRAGMA table_info(protocols)').map((c) => c.name);
  for (const c of COLS) assert.ok(cols.includes(c), c);
  // An install from before: the table without them, then the app starts (lib/database initDatabase runs it on every launch).
  const old = makeDb();
  old.execSync('ALTER TABLE protocols DROP COLUMN copper_form; ALTER TABLE protocols DROP COLUMN ghk_cu_mg;');
  upgradeCopperColumns(old);
  upgradeCopperColumns(old); // twice: a second start finds them and does nothing
  const after = old.getAllSync('PRAGMA table_info(protocols)').map((c) => c.name);
  for (const c of COLS) assert.ok(after.includes(c), `upgrade adds ${c}`);
});

test('CU-11: the payload always carries both, NULL included; only known forms and positive amounts go up', () => {
  for (const c of COLS) assert.ok(CLEARABLE_COLUMNS.protocols.includes(c), c);
  const base = { name: 'KLOW', remote_id: 'r1' };
  assert.deepEqual([toCloudPayload('protocols', base).copper_form, toCloudPayload('protocols', base).ghk_cu_mg], [null, null]);
  assert.ok('copper_form' in toCloudPayload('protocols', base) && 'ghk_cu_mg' in toCloudPayload('protocols', base));
  const p = toCloudPayload('protocols', { ...base, copper_form: 'acetate', ghk_cu_mg: 50 });
  assert.equal(p.copper_form, 'acetate');
  assert.equal(p.ghk_cu_mg, 50);
  assert.equal(toCloudPayload('protocols', { ...base, copper_form: 'junk' }).copper_form, null);
  assert.equal(toCloudPayload('protocols', { ...base, ghk_cu_mg: 0 }).ghk_cu_mg, null);
  assert.equal(toCloudPayload('protocols', { ...base, ghk_cu_mg: '12.5' }).ghk_cu_mg, 12.5);
});

test('CU-11: set, then taken back to "Não sei", reaches the cloud; a reinstall gets the values back', async () => {
  const cloud = makeCloud();
  const db = makeDb();
  const id = seed(db, { copper_form: 'complex', ghk_cu_mg: 50 });
  await pushPending(db, cloud, USER);
  let c = cloud.rows('protocols', USER)[0];
  assert.equal(c.copper_form, 'complex');
  assert.equal(c.ghk_cu_mg, 50);
  const fresh = makeDb();
  await pullChanges(fresh, cloud, USER);
  const got = fresh.getFirstSync('SELECT * FROM protocols');
  assert.equal(got.copper_form, 'complex', 'a new phone / reinstall knows the form');
  assert.equal(got.ghk_cu_mg, 50);
  edit(db, id, { copper_form: null, ghk_cu_mg: null });
  await pushPending(db, cloud, USER);
  c = cloud.rows('protocols', USER)[0];
  assert.equal(c.copper_form, null, 'Não sei goes up as NULL');
  assert.equal(c.ghk_cu_mg, null);
  await pullChanges(fresh, cloud, USER);
  const back = fresh.getFirstSync('SELECT * FROM protocols');
  assert.equal(back.copper_form, null, 'a pulled NULL is written');
  assert.equal(back.ghk_cu_mg, null);
});

test('CU-12: against a cloud WITHOUT the columns the protocol still syncs; the value waits on the phone and goes up after the migration', async () => {
  const cloud = oldCloud();
  const db = makeDb();
  const id = seed(db, { copper_form: 'bis', ghk_cu_mg: 40 });
  await pushPending(db, cloud, USER);
  const r = row(db, id);
  assert.equal(r.sync_status, 'synced', 'the protocol itself went up');
  assert.ok(r.remote_id);
  const c = cloud.rows('protocols', USER)[0];
  assert.equal(c.name, 'KLOW');
  assert.ok(!('copper_form' in c) && !('ghk_cu_mg' in c), 'the old cloud has no such column');
  assert.equal(r.copper_form, 'bis', 'kept on the phone');
  assert.equal(r.ghk_cu_mg, 40);
  assert.match(String(r.optional_pending), /copper_form/);
  assert.match(String(r.optional_pending), /ghk_cu_mg/);
  // A pull from the old cloud (no key) never erases the phone's value.
  await pullChanges(db, cloud, USER);
  assert.equal(row(db, id).copper_form, 'bis');
  assert.equal(row(db, id).ghk_cu_mg, 40);
  // An ordinary edit before the migration still syncs.
  edit(db, id, { name: 'KLOW 80' });
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('protocols', USER)[0].name, 'KLOW 80');
  assert.equal(row(db, id).copper_form, 'bis');
  // The migration is applied: the waiting values go up on the next sync.
  cloud.migrate();
  await pushPending(db, cloud, USER);
  const m = cloud.rows('protocols', USER)[0];
  assert.equal(m.copper_form, 'bis');
  assert.equal(m.ghk_cu_mg, 40);
  assert.equal(row(db, id).optional_pending, null);
});

test('CU-12: a "Não sei" saved before the migration is never re-sent as a NULL later', async () => {
  const cloud = oldCloud();
  const db = makeDb();
  const id = seed(db);
  await pushPending(db, cloud, USER);
  assert.equal(row(db, id).sync_status, 'synced');
  assert.equal(row(db, id).optional_pending, null, 'nothing waits: the cloud had no value to clear');
});

test('CU-13: "Retomar" copies both values to the new run, which starts at zero doses', () => {
  assert.ok(E.RESTART_COPIED.includes('copper_form'));
  assert.ok(E.RESTART_COPIED.includes('ghk_cu_mg'));
  const db = makeDb();
  const id = seed(db, { copper_form: 'acetate', ghk_cu_mg: 50 });
  db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, dose_amount, dose_unit, updated_at, sync_status) VALUES (?, ?, 'Taken', ?, 4, 'mg', 'x', 'pending')`, [USER, id, new Date(2026, 10, 5, 9).toISOString()]);
  E.endProtocol(db, id, new Date(2026, 10, 20, 9).toISOString());
  const newId = E.restartAsNew(db, id, { nowIso: new Date(2026, 10, 24, 9).toISOString(), todayKey: '2026-11-24' });
  const n = row(db, newId);
  assert.equal(n.copper_form, 'acetate');
  assert.equal(n.ghk_cu_mg, 50);
  const logs = db.getAllSync('SELECT * FROM dose_logs');
  assert.equal(C.copperCycle(n, logs).count, 0, 'the new cycle starts from zero');
  assert.equal(C.copperCycle(row(db, id), logs).count, 1, 'the ended run keeps its own');
});

test('CU-11: a Delete-forever tombstone carries neither value', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'syncCore.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function insertTombstone('), src.indexOf('async function insertTombstone(') + 1200);
  assert.match(fn, /delete payload\.copper_form; delete payload\.ghk_cu_mg;/);
});

test('CU-12: the migration file is additive and nullable, blanks both on a purge, and is not marked applied', () => {
  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  const f = fs.readdirSync(dir).find((n) => /_protocol_copper\.sql$/.test(n));
  assert.ok(f, 'migration file present');
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  assert.match(sql, /alter table public\.protocols add column if not exists copper_form text/i);
  assert.match(sql, /alter table public\.protocols add column if not exists ghk_cu_mg numeric/i);
  for (const line of sql.split('\n').filter((l) => /add column/i.test(l))) assert.doesNotMatch(line, /not null|default/i, 'nullable, no default');
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\bdrop (column|table)\b|\bdelete from\b|\bupdate public\.protocols set (?!name = name)/i, 'nothing destructive outside the rollback note');
  assert.match(sql, /new\.copper_form := null;/);
  assert.match(sql, /new\.ghk_cu_mg := null;/);
  assert.match(sql, /new\.unrecorded_unknown := null;/, 'keeps the previous trigger body');
  assert.match(sql, /STATUS: NOT APPLIED/);
});
