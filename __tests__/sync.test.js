'use strict';
// End-to-end regression tests for the real sync engine (lib/syncCore.js) running
// against a real in-memory SQLite + an in-memory fake cloud. These lock in the
// four multi-device sync bugs fixed in the pre-production pass.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  pushPending, pullChanges, fullImport,
} = require('../lib/syncCore');
const {
  makeDb, makeCloud, seedLocalProtocol, seedSyncedProtocol, editLocalProtocol,
  getProtocol, watermark,
} = require('./helpers/syncHarness');

const USER = 'user-A';

test('push then pull: a created protocol reaches the cloud and a second device imports it (incl. diluent)', async () => {
  const cloud = makeCloud();
  const dbA = makeDb();
  const localId = seedLocalProtocol(dbA, USER, { name: 'Tirzepatide', diluent: 'bacteriostatic_water', dose: '2.5' });

  await pushPending(dbA, cloud, USER);

  // Cloud now has exactly one protocol for this user, with the diluent preserved.
  const cloudRows = cloud.rows('protocols', USER);
  assert.equal(cloudRows.length, 1);
  assert.equal(cloudRows[0].diluent, 'bacteriostatic_water');
  assert.equal(cloudRows[0].name, 'Tirzepatide');

  // Device A's local row is now synced and carries the CLOUD updated_at, not a local marker.
  const a = getProtocol(dbA, localId);
  assert.equal(a.sync_status, 'synced');
  assert.equal(a.updated_at, cloudRows[0].updated_at);
  assert.ok(a.remote_id);

  // Device B (empty) imports it and sees the same data.
  const dbB = makeDb();
  await fullImport(dbB, cloud, USER);
  const b = dbB.getFirstSync(`SELECT * FROM protocols WHERE remote_id = ?`, [cloudRows[0].id]);
  assert.ok(b);
  assert.equal(b.diluent, 'bacteriostatic_water');
  assert.equal(b.sync_status, 'synced');
});

test('fix #3/#4: the pull watermark tracks CLOUD time, so a later remote edit is fetched (not missed)', async () => {
  const cloud = makeCloud();
  const dbA = makeDb();
  const dbB = makeDb();

  // A creates + pushes; B imports.
  const idA = seedLocalProtocol(dbA, USER, { name: 'orig' });
  await pushPending(dbA, cloud, USER);
  await fullImport(dbB, cloud, USER);

  // B's synced row carries the cloud stamp — that's the watermark basis.
  const remoteId = getProtocol(dbA, idA).remote_id;
  const wmBefore = watermark(dbB, 'protocols', USER);
  assert.equal(wmBefore, cloud._store.protocols.get(remoteId).updated_at);

  // A edits and pushes again → cloud stamp advances.
  editLocalProtocol(dbA, idA, { name: 'edited-on-A' });
  await pushPending(dbA, cloud, USER);
  const newCloudStamp = cloud._store.protocols.get(remoteId).updated_at;
  assert.ok(newCloudStamp > wmBefore);

  // B pulls: with a cloud-time watermark, the newer edit is fetched and applied.
  await pullChanges(dbB, cloud, USER);
  const b = dbB.getFirstSync(`SELECT * FROM protocols WHERE remote_id = ?`, [remoteId]);
  assert.equal(b.name, 'edited-on-A');
  assert.equal(b.updated_at, newCloudStamp);
});

test('fix #3: a fresh pull does not re-import rows already at the watermark (no duplicates / no churn)', async () => {
  const cloud = makeCloud();
  const dbA = makeDb();
  seedLocalProtocol(dbA, USER, { name: 'once' });
  await pushPending(dbA, cloud, USER);

  const dbB = makeDb();
  await fullImport(dbB, cloud, USER);
  const countAfterImport = dbB.getFirstSync(`SELECT COUNT(*) c FROM protocols`).c;

  // Pulling again with nothing new in the cloud must be a no-op.
  await pullChanges(dbB, cloud, USER);
  const countAfterPull = dbB.getFirstSync(`SELECT COUNT(*) c FROM protocols`).c;
  assert.equal(countAfterPull, countAfterImport);
  assert.equal(countAfterPull, 1);
});

test('fix #4: delete-vs-edit does not resurrect — a locally-edited row deleted in the cloud is removed, not re-inserted', async () => {
  const cloud = makeCloud();
  const dbA = makeDb();

  // A creates + pushes so it exists in the cloud and is synced locally.
  const idA = seedLocalProtocol(dbA, USER, { name: 'doomed' });
  await pushPending(dbA, cloud, USER);
  const remoteId = getProtocol(dbA, idA).remote_id;

  // Another device deletes it in the cloud.
  await cloud.delete('protocols', remoteId);
  assert.equal(cloud.rows('protocols', USER).length, 0);

  // A had a pending local edit to the same row, then pushes.
  editLocalProtocol(dbA, idA, { name: 'edited-after-remote-delete' });
  await pushPending(dbA, cloud, USER);

  // Deletions win: the cloud is NOT repopulated and A's local row is gone.
  assert.equal(cloud.rows('protocols', USER).length, 0, 'must not resurrect in the cloud');
  assert.equal(getProtocol(dbA, idA), null, 'local row must be removed, not left dangling');
});

test('fix #5: the watermark is scoped by user_id — one account cannot hide another account\'s new rows', async () => {
  const cloud = makeCloud();
  const db = makeDb();

  // Same local DB holds synced rows for two users with very different stamps.
  seedSyncedProtocol(db, 'user-A', { remote_id: 'ra', updated_at: '000001', name: 'A-old' });
  seedSyncedProtocol(db, 'user-B', { remote_id: 'rb', updated_at: '000009', name: 'B-new' });

  // A cloud row for user-A newer than A's watermark ('000001') but older than B's ('000009').
  cloud._store.protocols.set('ra2', {
    id: 'ra2', user_id: 'user-A', name: 'A-fresh', type: 'recon',
    updated_at: '000005', created_at: '000005', active: true,
  });

  // With a per-user watermark, user-A's pull must fetch the '000005' row.
  await pullChanges(db, cloud, 'user-A');
  const fetched = db.getFirstSync(`SELECT * FROM protocols WHERE remote_id = ?`, ['ra2']);
  assert.ok(fetched, 'user-A should fetch its own newer row; a global watermark would have hidden it');
  assert.equal(fetched.name, 'A-fresh');
});

test('push respects the optimistic-concurrency guard: an edit mid-push leaves the row pending', async () => {
  const cloud = makeCloud();
  const db = makeDb();
  const id = seedLocalProtocol(db, USER, { name: 'v1' });
  await pushPending(db, cloud, USER);
  assert.equal(getProtocol(db, id).sync_status, 'synced');

  // Edit again (pending), then a normal push re-syncs it.
  editLocalProtocol(db, id, { name: 'v2' });
  assert.equal(getProtocol(db, id).sync_status, 'pending');
  await pushPending(db, cloud, USER);
  const row = getProtocol(db, id);
  assert.equal(row.sync_status, 'synced');
  assert.equal(cloud._store.protocols.get(row.remote_id).name, 'v2');
});

test('full import propagates cloud deletes: a synced local row absent from the cloud is dropped', async () => {
  const cloud = makeCloud();
  const dbA = makeDb();
  const id1 = seedLocalProtocol(dbA, USER, { name: 'keep' });
  const id2 = seedLocalProtocol(dbA, USER, { name: 'remove-in-cloud' });
  await pushPending(dbA, cloud, USER);
  const remote2 = getProtocol(dbA, id2).remote_id;

  // Cloud loses one row; re-importing should drop it locally.
  await cloud.delete('protocols', remote2);
  await fullImport(dbA, cloud, USER);

  assert.ok(getProtocol(dbA, id1), 'the surviving protocol stays');
  assert.equal(getProtocol(dbA, id2), null, 'the cloud-deleted protocol is dropped locally');
});

test('food_logs: parsed_items round-trips TEXT->JSONB->TEXT without double-encoding (the sync mapper bug guard)', async () => {
  const cloud = makeCloud();
  const dbA = makeDb();

  // Device A logs a meal locally. parsed_items is JSON TEXT in SQLite.
  const items = [
    { food: 'eggs', qty: 2, unit: 'unit', kcal: 140, protein_g: 12, carb_g: 1, fat_g: 10 },
    { food: 'toast', qty: 1, unit: 'slice', kcal: 80, protein_g: 3, carb_g: 14, fat_g: 1 },
  ];
  const itemsText = JSON.stringify(items);
  dbA.runSync(
    `INSERT INTO food_logs (user_id, entry_date, raw_text, parsed_items, kcal, protein_g, carb_g, fat_g, source, parse_status, created_at, updated_at, sync_status)
     VALUES (?, '2026-09-10', 'two eggs and toast', ?, 220, 15, 15, 11, 'ai', 'done', 'C1', 'C1', 'pending')`,
    [USER, itemsText]
  );

  await pushPending(dbA, cloud, USER);

  // In the cloud, parsed_items must be a real ARRAY (JSONB), not a JSON string —
  // sending the string would double-encode it into a JSONB string value.
  const cloudRow = cloud.rows('food_logs', USER)[0];
  assert.ok(Array.isArray(cloudRow.parsed_items), 'parsed_items reaches the cloud as an array, not a string');
  assert.equal(cloudRow.parsed_items[0].food, 'eggs');
  assert.equal(cloudRow.parsed_items.length, 2);

  // Device B imports it. Back in SQLite parsed_items must be TEXT again, and
  // JSON.parse of it must equal the original items (a clean round-trip).
  const dbB = makeDb();
  await fullImport(dbB, cloud, USER);
  const b = dbB.getFirstSync(`SELECT * FROM food_logs WHERE remote_id = ?`, [cloudRow.id]);
  assert.ok(b, 'device B imported the food log');
  assert.equal(typeof b.parsed_items, 'string', 'parsed_items is stored as TEXT locally');
  assert.deepEqual(JSON.parse(b.parsed_items), items, 'items survive the round-trip unchanged');
  assert.equal(b.kcal, 220);
  assert.equal(b.entry_date, '2026-09-10');
  assert.equal(b.sync_status, 'synced');
});

test('food_logs: a null parsed_items (offline entry not yet parsed) round-trips as null', async () => {
  const cloud = makeCloud();
  const dbA = makeDb();
  dbA.runSync(
    `INSERT INTO food_logs (user_id, entry_date, raw_text, parsed_items, source, parse_status, created_at, updated_at, sync_status)
     VALUES (?, '2026-09-10', 'rice and chicken', NULL, 'ai', 'pending', 'C1', 'C1', 'pending')`,
    [USER]
  );
  await pushPending(dbA, cloud, USER);
  const cloudRow = cloud.rows('food_logs', USER)[0];
  assert.equal(cloudRow.parsed_items, null);
  assert.equal(cloudRow.parse_status, 'pending');

  const dbB = makeDb();
  await fullImport(dbB, cloud, USER);
  const b = dbB.getFirstSync(`SELECT * FROM food_logs WHERE remote_id = ?`, [cloudRow.id]);
  assert.equal(b.parsed_items, null);
  assert.equal(b.raw_text, 'rice and chicken');
});
