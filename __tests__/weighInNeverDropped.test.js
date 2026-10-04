'use strict';
// A-92 (progress-one-card spec audit, dt-council 2026-10-04; decided by logic: newer user input
// wins, never lose user data). Phone A deletes today's weigh-in; phone B, before it learns of the
// delete, fixes or logs today's weight on that same row. B's push finds 0 rows: B's value must be
// put back in the cloud, never thrown away on B.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending, pullChanges } = require('../lib/syncCore');

const USER = 'u1';

test('B\'s newer weigh-in survives A\'s delete of the same day\'s row', async () => {
  const cloud = makeCloud();
  await cloud.insert('calc_snapshots', { user_id: USER, entry_date: '2026-10-04', weight_kg: 90 });
  const A = makeDb(); const B = makeDb();
  await pullChanges(A, cloud, USER);
  await pullChanges(B, cloud, USER);
  const aRow = A.getFirstSync('SELECT id FROM calc_snapshots');
  const bRow = B.getFirstSync('SELECT id FROM calc_snapshots');
  // A deletes it (and pushes); B, offline, fixes it to 89.4
  A.runSync(`UPDATE calc_snapshots SET sync_status = 'deleted' WHERE id = ?`, [aRow.id]);
  await pushPending(A, cloud, USER);
  assert.equal(cloud.rows('calc_snapshots', USER).length, 0);
  B.runSync(`UPDATE calc_snapshots SET weight_kg = 89.4, updated_at = 'L9', sync_status = 'pending' WHERE id = ?`, [bRow.id]);
  await pushPending(B, cloud, USER);
  const local = B.getAllSync('SELECT weight_kg, sync_status FROM calc_snapshots');
  assert.equal(local.length, 1, 'B keeps its entry');
  assert.equal(local[0].weight_kg, 89.4);
  const c = cloud.rows('calc_snapshots', USER);
  assert.equal(c.length, 1, 'and it is back in the cloud');
  assert.equal(c[0].weight_kg, 89.4);
});
