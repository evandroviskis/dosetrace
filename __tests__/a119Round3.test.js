'use strict';
// A-119 Gate B follow-ups (round 3): each finding as the scenario that failed. seq.cjs (the
// reviewer's probe) is made permanent here.
//   1. Only the person's own changes number a row: a sync-engine write (a pull merging into a pending
//      edit, markSynced's remote_id, an import, the single-open-check stop) never does — so an old
//      unsent row never becomes "kept" by timing. And the sign-in work does not run the reality-check
//      migration while a takeover's rebuild is still queued.
//   2. The change-sequence triggers are versioned: an install that has an older trigger body gets
//      the current one.
//   3. "Use here" after an abandoned sign-in claim keeps the lower of the two keep points; screen 4
//      counts with the same rule.
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { makeDb, makeCloud, makeDeviceCloud } = require('./helpers/syncHarness');
const { phone, memKv, addProtocol } = require('./helpers/devicePhone');
const SC = require('../lib/syncCore');
const { readChangeSeq, installChangeSeq, engineDb, asEngine } = require('../lib/changeSeq');
const { createSchema, TABLE_DDL } = require('../lib/schema');
const { signInDeviceStep, startupDeviceStep } = require('../lib/signInDevice');

const U = 'u1';
const old = '2026-10-01T10:00:00.000Z';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const insProtocol = (db, sync, name, rid = null) => db.runSync(
  `INSERT INTO protocols (remote_id, user_id, name, type, color, dose, dose_unit, interval_days, doses_per_day, active, created_at, updated_at, sync_status)
   VALUES (?, ?, ?, 'recon', '#1', '1', 'mg', 1, 1, 1, ?, ?, ?)`, [rid, U, name, old, old, sync]).lastInsertRowId;
const seqOf = (db, table, id) => db.getFirstSync(`SELECT dt_seq FROM ${table} WHERE id = ?`, [id]).dt_seq;

// ── 1. Sync-engine writes never number a row ─────────────────────────────────────────────────
test('R3-1 (seq.cjs): a pull that merges the cloud row into an old pending edit does not number it — the rebuild discards it, counted', async () => {
  const db = makeDb(); const cloud = makeCloud();
  const pOld = insProtocol(db, 'pending', 'old-edit', 'P1');
  const before = seqOf(db, 'protocols', pOld);
  cloud._store.protocols.set('P1', { id: 'P1', user_id: U, name: 'cloud', type: 'recon', active: false, deleted_at: old, ended_at: old, created_at: old, updated_at: '2026-10-19T00:00:00.000Z' });
  const keep = readChangeSeq(db);
  await SC.pullTable(db, cloud, U, 'protocols');
  const row = db.getFirstSync('SELECT dt_seq, active, sync_status FROM protocols WHERE id = ?', [pOld]);
  assert.equal(row.active, 0, 'the merge did write (End / Delete wins)');
  assert.equal(row.dt_seq, before, 'but the row keeps its own number');
  assert.equal(readChangeSeq(db), keep, 'the counter did not move');
  const r = await SC.rebuildFromCloud(db, cloud, U, { keep: { seq: keep } });
  assert.equal(r.ok, true);
  assert.equal(r.discarded.count, 1, 'the old edit is discarded and named');
  assert.equal(db.getFirstSync(`SELECT COUNT(*) AS n FROM protocols WHERE name = 'old-edit'`).n, 0);
});

test('R3-1 (seq.cjs): markSynced writing the remote id on a row still pending (edited in flight) does not number it', () => {
  const db = makeDb();
  const id = insProtocol(db, 'pending', 'old-local');
  const before = seqOf(db, 'protocols', id);
  const keep = readChangeSeq(db);
  SC.markSynced(db, 'protocols', id, 'P9', '1999-01-01', null); // the flip is refused: the row was edited
  assert.equal(db.getFirstSync('SELECT remote_id, sync_status FROM protocols WHERE id = ?', [id]).sync_status, 'pending');
  assert.equal(seqOf(db, 'protocols', id), before);
  assert.equal(readChangeSeq(db), keep);
});

test('R3-1: the single-open-check stop after a pull and the child remote-id update are engine writes too', async () => {
  const db = makeDb(); const cloud = makeCloud();
  db.runSync(`INSERT INTO reality_check_open (remote_id, user_id, start_date, start_weight_kg, created_at, updated_at, sync_status) VALUES ('RC1', ?, '2026-09-01', 80, ?, ?, 'synced')`, [U, old, old]);
  const mine = db.getFirstSync('SELECT id FROM reality_check_open').id;
  cloud._store.reality_check_open.set('RC2', { id: 'RC2', user_id: U, start_date: '2026-10-10', start_weight_kg: 81, created_at: old, updated_at: '2026-10-11T00:00:00.000Z' });
  cloud._store.reality_check_open.set('RC1', { id: 'RC1', user_id: U, start_date: '2026-09-01', start_weight_kg: 80, created_at: old, updated_at: old });
  const keep = readChangeSeq(db);
  await SC.pullTable(db, cloud, U, 'reality_check_open');
  const r = db.getFirstSync('SELECT stopped_at, sync_status, dt_seq FROM reality_check_open WHERE id = ?', [mine]);
  assert.ok(r.stopped_at && r.sync_status === 'pending', 'the older open check was stopped by the engine');
  assert.equal(r.dt_seq, null, 'not numbered: not the person\'s change');
  const pid = insProtocol(db, 'pending', 'p');
  db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, 'Taken', ?, ?, 'pending')`, [U, pid, old, old]);
  const did = db.getFirstSync('SELECT id, dt_seq FROM dose_logs').id;
  const doseSeq = seqOf(db, 'dose_logs', did);
  const k2 = readChangeSeq(db);
  SC.updateChildRemoteIds(db, pid, 'PX');
  assert.equal(db.getFirstSync('SELECT protocol_remote_id FROM dose_logs WHERE id = ?', [did]).protocol_remote_id, 'PX');
  assert.equal(seqOf(db, 'dose_logs', did), doseSeq);
  assert.equal(readChangeSeq(db), k2);
  assert.ok(keep <= k2);
});

test('R3-1: a change the person makes WHILE a pull waits for the network is still numbered (the engine mark never spans an await)', async () => {
  const db = makeDb(); const cloud = makeCloud();
  let typed = null;
  const slow = { ...cloud, fetchSince: async (...a) => { await sleep(10); typed = insProtocol(db, 'pending', 'typed-during-pull'); return cloud.fetchSince(...a); } };
  const keep = readChangeSeq(db);
  await SC.pullChanges(db, slow, U);
  assert.ok(typed);
  assert.ok(seqOf(db, 'protocols', typed) > keep, 'the person\'s row is numbered, so a rebuild keeps it');
});

test('R3-1: a rebuild rolled back (a bad cloud row) leaves no engine mark behind — the next change the person makes is numbered', async () => {
  const db = makeDb(); const cloud = makeCloud();
  insProtocol(db, 'pending', 'old');
  cloud._store.protocols.set('PBAD', { id: 'PBAD', user_id: U, name: null, type: null, created_at: old, updated_at: old }); // NOT NULL columns → the import throws
  const keep = readChangeSeq(db);
  const r = await SC.rebuildFromCloud(db, cloud, U, { keep: { seq: keep } });
  assert.equal(r.ok, false);
  assert.equal(db.getFirstSync(`SELECT COUNT(*) AS n FROM protocols WHERE name = 'old'`).n, 1, 'rolled back: nothing lost');
  const after = insProtocol(db, 'pending', 'after');
  assert.ok(seqOf(db, 'protocols', after) > keep);
  assert.equal(db.getFirstSync('SELECT COUNT(*) AS n FROM dt_engine_write').n, 0);
});

test('R3-1: an engine write that throws clears its mark; an engine mark left by a crash is cleared when the schema is installed', () => {
  const db = makeDb();
  assert.throws(() => asEngine(db, () => { db.runSync('INSERT INTO protocols (user_id) VALUES (NULL)'); }));
  const a = insProtocol(db, 'pending', 'a');
  assert.ok(seqOf(db, 'protocols', a) != null);
  db.runSync('INSERT INTO dt_engine_write (id) VALUES (1)'); // the app was killed inside an engine write
  installChangeSeq(db); // the next open
  const b = insProtocol(db, 'pending', 'b');
  assert.ok(seqOf(db, 'protocols', b) > seqOf(db, 'protocols', a));
  assert.throws(() => asEngine(db, async () => {}), /synchronous/, 'an engine mark may never span an await');
});

test('R3-1: engineDb passes transaction statements through untouched (a ROLLBACK can never bring a mark back)', () => {
  const db = makeDb();
  const e = engineDb(db);
  assert.equal(engineDb(e), e);
  e.execSync('BEGIN');
  e.runSync(`INSERT INTO protocols (user_id, name, type, color, dose, dose_unit, interval_days, doses_per_day, active, created_at, updated_at, sync_status) VALUES (?, 'x', 'recon', '#1', '1', 'mg', 1, 1, 1, ?, ?, 'pending')`, [U, old, old]);
  e.execSync('ROLLBACK');
  assert.equal(db.getFirstSync('SELECT COUNT(*) AS n FROM dt_engine_write').n, 0);
  const id = insProtocol(db, 'pending', 'y');
  assert.ok(seqOf(db, 'protocols', id) != null);
});

test('R3-1 (the leak): a sign-in that takes over outside a pass ("rebuild queued") does not run the reality-check migration; old unsent rows merged by a pull before the rebuild are still discarded and counted', async () => {
  const cloud = makeDeviceCloud(); cloud.addUser(U);
  const A = phone(cloud, 'dev-A', U); await A.signIn();
  // A holds the open check RC1; B (the same account, kept its data through a spurious sign-out) has
  // an old unsent edit of it and an old unsent protocol from before this sign-in.
  cloud.base._store.reality_check_open.set('RC1', { id: 'RC1', user_id: U, start_date: '2026-09-01', start_weight_kg: 80, stopped_at: '2026-10-14T08:00:00.000Z', created_at: old, updated_at: '2026-10-14T08:00:00.000Z' });
  const B = phone(cloud, 'dev-B', U, { session: '2026-10-16T09:00:00.000Z' });
  B.db.runSync(`INSERT INTO reality_check_open (remote_id, user_id, start_date, start_weight_kg, created_at, updated_at, sync_status) VALUES ('RC1', ?, '2026-09-01', 82, ?, ?, 'pending')`, [U, old, old]);
  insProtocol(B.db, 'pending', 'old-local');
  let migrated = 0;
  const step = await signInDeviceStep({
    explicit: true, userId: U, flow: B.flow, gate: (ctx) => B.flow.gate(U, ctx), startSync: () => {},
    isLocalEmpty: () => false, fullImport: async () => {}, requestSync: () => {}, reload: () => {},
  });
  assert.equal(step.dev.reason, 'rebuild_queued');
  assert.equal(step.migrate, false, 'the migration waits: the rebuild comes first');
  if (step.migrate) migrated++;
  // Even if a pull of reality_check_open runs before the pass (as the migration's did): Stop wins
  // writes into the old pending edit, which must stay "old".
  await SC.pullTable(B.db, B.view, U, 'reality_check_open');
  assert.ok(B.db.getFirstSync(`SELECT stopped_at FROM reality_check_open WHERE remote_id = 'RC1' AND sync_status = 'pending'`).stopped_at);
  await B.sync(); // the pass: its device check runs the owed rebuild
  const rc = B.db.getAllSync(`SELECT start_weight_kg, sync_status FROM reality_check_open WHERE remote_id = 'RC1'`);
  assert.deepEqual(rc.map((r) => [r.start_weight_kg, r.sync_status]), [[80, 'synced']], 'the old edit is discarded; the account\'s row is there');
  assert.equal(B.db.getFirstSync(`SELECT COUNT(*) AS n FROM protocols WHERE name = 'old-local'`).n, 0);
  const own = (await B.state()).notice.own;
  assert.equal(own.count, 2, 'both old rows are named on screen 1');
  assert.equal(cloud.base._store.reality_check_open.get('RC1').start_weight_kg, 80, 'never pushed');
  assert.equal(migrated, 0);
});

test('R3-1: the device steps say when the reality-check migration may run (not held, no rebuild queued)', async () => {
  const base = (dev) => ({ explicit: true, userId: 'U', flow: { afterExplicitSignIn: async () => dev }, gate: async () => dev, startSync: () => {}, isLocalEmpty: () => false, fullImport: async () => {}, requestSync: () => {} });
  assert.equal((await signInDeviceStep(base({ go: true, outcome: 'normal' }))).migrate, true);
  assert.equal((await signInDeviceStep(base({ go: false, reason: 'rebuild_queued' }))).migrate, false);
  assert.equal((await signInDeviceStep(base({ go: false, reason: 'ask' }))).migrate, false);
  assert.equal((await signInDeviceStep(base({ go: false, reason: 'claim_pending' }))).migrate, true, 'a pending claim: the migration plans against a pull that may fail — as before');
  const st = (dev) => startupDeviceStep({ gate: async () => dev, userId: 'U', isLocalEmpty: () => false, fullImport: async () => {}, requestSync: () => {} });
  assert.equal((await st({ go: false, reason: 'rebuild_queued' })).migrate, false);
  assert.equal((await st({ go: true })).migrate, true);
  assert.equal((await st({ go: false, reason: 'verdict' })).migrate, false);
});

// ── 2. The trigger body reaches existing installs ────────────────────────────────────────────
const OLD_TRIGGERS = (t) => {
  const bump = `INSERT INTO local_meta (key, value) VALUES ('dt_change_seq', '1')
        ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT);
      UPDATE ${t} SET dt_seq = (SELECT CAST(value AS INTEGER) FROM local_meta WHERE key = 'dt_change_seq') WHERE id = NEW.id;`;
  return [
    `CREATE TRIGGER IF NOT EXISTS dt_seq_ins_${t} AFTER INSERT ON ${t} WHEN NEW.sync_status IN ('pending', 'deleted') BEGIN ${bump} END;`,
    `CREATE TRIGGER IF NOT EXISTS dt_seq_upd_${t} AFTER UPDATE ON ${t} WHEN NEW.sync_status IN ('pending', 'deleted') AND NEW.dt_seq IS OLD.dt_seq BEGIN ${bump} END;`,
  ];
};

test('R3-2: a database created with the first trigger body gets the current one at the next open (versioned triggers, the old ones dropped)', async () => {
  const raw = new Database(':memory:');
  const db = {
    execSync: (s) => raw.exec(s),
    runSync: (s, p) => { const i = raw.prepare(s).run(...(p || []).map((x) => (x === undefined ? null : x))); return { lastInsertRowId: Number(i.lastInsertRowid), changes: i.changes }; },
    getFirstSync: (s, p) => raw.prepare(s).get(...(p || [])) ?? null,
    getAllSync: (s, p) => raw.prepare(s).all(...(p || [])),
  };
  // The install as the merged A-119 left it.
  raw.exec('CREATE TABLE IF NOT EXISTS local_meta (key TEXT PRIMARY KEY, value TEXT);');
  for (const t of Object.keys(TABLE_DDL)) {
    raw.exec(TABLE_DDL[t]);
    try { raw.exec(`ALTER TABLE ${t} ADD COLUMN dt_seq INTEGER;`); } catch { /* there */ }
    for (const s of OLD_TRIGGERS(t)) raw.exec(s);
  }
  const id = insProtocol(db, 'pending', 'old-edit', 'P1');
  const before = seqOf(db, 'protocols', id);
  assert.ok(before != null);
  createSchema(db); // the app opens after the update
  createSchema(db); // and again: idempotent
  const names = raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`).all().map((r) => r.name);
  assert.equal(names.length, 22, 'one insert and one update trigger per synced table');
  assert.ok(!names.some((n) => /^dt_seq_(ins|upd)_[a-z_]+$/.test(n) && !/_v\d+_/.test(n)), `old names gone: ${names.join(', ')}`);
  const cloud = makeCloud();
  cloud._store.protocols.set('P1', { id: 'P1', user_id: U, name: 'cloud', type: 'recon', active: false, deleted_at: old, created_at: old, updated_at: '2026-10-19T00:00:00.000Z' });
  await SC.pullTable(db, cloud, U, 'protocols');
  assert.equal(seqOf(db, 'protocols', id), before, 'the new body: an engine merge does not number the row');
  const typed = insProtocol(db, 'pending', 'typed');
  assert.ok(seqOf(db, 'protocols', typed) > before, 'the person\'s change is still numbered');
});

// ── 3. "Use here" after an abandoned sign-in claim ───────────────────────────────────────────
test('R3-3: "Use here" after a sign-in claim the server never confirmed (claim_unavailable) keeps what was typed since that sign-in; screen 4 counts only the older rows', async () => {
  const cloud = makeDeviceCloud(); cloud.addUser(U);
  const A = phone(cloud, 'dev-A', U); await A.signIn();
  const B = phone(cloud, 'dev-B', U, { session: '2026-10-16T09:00:00.000Z' });
  addProtocol(B.db, U, { name: 'before-signin' });
  const real = B.view.rpc.bind(B.view);
  B.view.rpc = async (name, args) => (name === 'claim_device' ? { data: null, error: { code: 'XX000', message: 'internal error' } } : real(name, args));
  assert.equal((await B.flow.afterExplicitSignIn(U)).reason, 'claim_pending');
  assert.equal((await B.flow.gate(U, 'sync')).reason, 'claim_unavailable', 'two server errors: the claim is dropped');
  addProtocol(B.db, U, { name: 'typed-after-signin' }); // the passes run again; the person keeps typing
  B.view.rpc = real;
  assert.equal((await B.flow.gate(U, 'sync')).reason, 'ask', 'screen 4: the account is in use on A');
  const ask = (await B.state()).ask;
  assert.equal(ask.summary.count, 1, 'screen 4 names only the row from before the sign-in');
  await B.flow.refreshVerdict(U);
  assert.equal((await B.state()).ask.summary.count, 1, 'the refreshed count uses the same rule');
  await B.useHere();
  const names = B.db.getAllSync('SELECT name FROM protocols ORDER BY id').map((r) => r.name);
  assert.deepEqual(names, ['typed-after-signin'], 'kept and to be re-sent; the older row removed, as screen 4 said');
  assert.equal((await B.state()).notice.own.count, 1);
});

test('R3-3: screen 4 counts a dose typed after the sign-in on a local-only protocol from before it (the rebuild discards it with its protocol)', async () => {
  const cloud = makeDeviceCloud(); cloud.addUser(U);
  const A = phone(cloud, 'dev-A', U); await A.signIn();
  const kv = memKv();
  const B = phone(cloud, 'dev-B', U, { kv, session: '2026-10-16T09:00:00.000Z' });
  const pid = addProtocol(B.db, U, { name: 'local-only' });
  await kv.setItem('dosetrace_device_takeover', JSON.stringify({ userId: U, seq: readChangeSeq(B.db) }));
  B.db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, 'Taken', ?, ?, 'pending')`, [U, pid, old, old]);
  await B.flow.gate(U, 'startup');
  assert.equal((await B.state()).ask.summary.count, 2);
  await B.useHere();
  assert.equal((await B.state()).notice.own.count, 2);
});

test('R3-1 (wiring): App runs the reality-check migration only when the device step allows it, on the cold start and after a sign-in', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'App.js'), 'utf8');
  const calls = src.match(/^.*runRealityMigration\(\).*$/gm) || [];
  // Cold start, SIGNED_IN, and (DV-242, 1.3.1) after the cross-account sheet (Try again / Discard).
  assert.equal(calls.length, 3);
  for (const line of calls) assert.match(line, /if \(step\.migrate\) await runRealityMigration\(\)/);
});
