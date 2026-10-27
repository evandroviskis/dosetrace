'use strict';
// Founder 2026-10-27 ("opção A"): the mark "corrected by hand" (dose_edited) goes to the cloud, so after a
// reinstall a later "Desde o início" / "A partir de uma dose" never rewrites an amount the person set.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud, seedSyncedProtocol } = require('./helpers/syncHarness');
const { pushPending, pullChanges } = require('../lib/syncCore');
const { toCloudPayload, OPTIONAL_COLUMNS } = require('../lib/syncMappers');

const USER = 'user-A';

test('payload: sent as 1 / 0 when known, never sent empty', () => {
  assert.ok(OPTIONAL_COLUMNS.dose_logs.includes('dose_edited'));
  const base = { outcome: 'Taken', logged_at: 'x', protocol_remote_id: 'p' };
  assert.equal(toCloudPayload('dose_logs', { ...base, dose_edited: 1 }).dose_edited, 1);
  assert.equal(toCloudPayload('dose_logs', { ...base, dose_edited: 0 }).dose_edited, 0);
  assert.ok(!('dose_edited' in toCloudPayload('dose_logs', base)));
});

test('round trip: up, a cloud NULL keeps it, a reinstall gets it back', async () => {
  const cloud = makeCloud(); const db = makeDb();
  const pid = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  db.runSync("INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, dose_amount, dose_unit, dose_edited, updated_at, sync_status) VALUES (?, ?, 'p-1', 'Taken', '2026-10-20T10:00:00Z', 120, 'mg', 1, '2026-10-20T10:00:00Z', 'pending')", [USER, pid]);
  await pushPending(db, cloud, USER);
  const remote = cloud.rows('dose_logs', USER)[0];
  assert.equal(remote.dose_edited, 1);
  await cloud.update('dose_logs', remote.id, { injection_site: 'left', dose_edited: null });
  await pullChanges(db, cloud, USER);
  assert.equal(db.getFirstSync('SELECT dose_edited FROM dose_logs').dose_edited, 1);
  await cloud.update('dose_logs', remote.id, { dose_edited: 1 });
  const fresh = makeDb(); seedSyncedProtocol(fresh, USER, { remote_id: 'p-1', updated_at: '000001' });
  await pullChanges(fresh, cloud, USER);
  assert.equal(fresh.getFirstSync('SELECT dose_edited FROM dose_logs').dose_edited, 1, 'a reinstall knows the dose was set by hand');
});
