'use strict';
// Founder 2026-10-27 (decision (4) with option A, "Migration dose_logs.slot_at approved"): a Taken dose
// whose time is corrected ("Alterar horário") keeps the slot it was marked for — dose_logs.slot_at, the
// first logged_at. The curve follows the new time; the Missed scan still counts the dose for its slot, so
// moving 08:05 to 23:00 of the evening before never leaves a false "Perdida" in the morning.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { computeMissedDoses, coveredMissedRows } = require('../lib/missedDoses');
const { timeEditFields } = require('../lib/doseEdit');
const { toCloudPayload, OPTIONAL_COLUMNS } = require('../lib/syncMappers');
const { makeDb, makeCloud, seedSyncedProtocol } = require('./helpers/syncHarness');
const { pushPending, pullChanges } = require('../lib/syncCore');

const proto = { id: 1, user_id: 'u1', remote_id: null, start_date: '2024-01-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: '2020-01-01T08:00:00' };
const now = new Date('2024-06-20T12:00:00').getTime();
const y0 = new Date('2024-06-19T00:00:00').getTime(), y1 = new Date('2024-06-20T00:00:00').getTime();
const yesterday = (list) => list.filter((m) => m.scheduledAtMs >= y0 && m.scheduledAtMs < y1);
const moved = { id: 5, protocol_id: 1, outcome: 'Taken', logged_at: new Date('2024-06-18T23:00:00').toISOString() };

test('the first time edit keeps the slot; a second edit keeps the same slot', () => {
  const log = { id: 5, outcome: 'Taken', logged_at: '2024-06-19T12:05:00.000Z', slot_at: null };
  assert.deepEqual(timeEditFields(log, '2024-06-19T03:00:00.000Z'), { logged_at: '2024-06-19T03:00:00.000Z', slot_at: '2024-06-19T12:05:00.000Z' });
  assert.deepEqual(timeEditFields({ ...log, logged_at: '2024-06-19T03:00:00.000Z', slot_at: '2024-06-19T12:05:00.000Z' }, '2024-06-19T02:00:00.000Z').slot_at, '2024-06-19T12:05:00.000Z');
});

test('the scan counts an edited dose at its slot: no false Missed', () => {
  const without = computeMissedDoses([proto], [moved], now, 0, { lookbackDays: 1 });
  assert.equal(yesterday(without).length, 1, 'the bug: moved to the evening before, the morning slot looked missed');
  const withSlot = computeMissedDoses([proto], [{ ...moved, slot_at: new Date('2024-06-19T08:05:00').toISOString() }], now, 0, { lookbackDays: 1 });
  assert.equal(yesterday(withSlot).length, 0);
});

test('a Missed row already written for that slot is cleared by the edited dose', () => {
  const missedRow = { id: 9, protocol_id: 1, outcome: 'Missed', logged_at: new Date('2024-06-19T08:00:00').toISOString() };
  const opts = { lookbackDays: 3, scheduleSince: { 1: 0 } };
  assert.deepEqual(coveredMissedRows([proto], [missedRow, moved], now, opts), []);
  const gone = coveredMissedRows([proto], [missedRow, { ...moved, slot_at: new Date('2024-06-19T08:05:00').toISOString() }], now, opts);
  assert.deepEqual(gone.map((r) => r.id), [9]);
});

test('slot_at syncs as an optional column and survives a pull', async () => {
  assert.ok(OPTIONAL_COLUMNS.dose_logs.includes('slot_at'));
  assert.equal(toCloudPayload('dose_logs', { outcome: 'Taken', logged_at: 'x', slot_at: '2024-06-19T12:05:00.000Z', protocol_remote_id: 'p' }).slot_at, '2024-06-19T12:05:00.000Z');
  assert.ok(!('slot_at' in toCloudPayload('dose_logs', { outcome: 'Taken', logged_at: 'x', protocol_remote_id: 'p' })), 'never sent empty');
  const USER = 'user-A'; const cloud = makeCloud(); const db = makeDb();
  const pid = seedSyncedProtocol(db, USER, { remote_id: 'p-1', updated_at: '000001' });
  db.runSync("INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, slot_at, updated_at, sync_status) VALUES (?, ?, 'p-1', 'Taken', '2024-06-19T03:00:00.000Z', '2024-06-19T12:05:00.000Z', '2024-06-19T03:00:00.000Z', 'pending')", [USER, pid]);
  await pushPending(db, cloud, USER);
  const remote = cloud.rows('dose_logs', USER)[0];
  assert.equal(remote.slot_at, '2024-06-19T12:05:00.000Z');
  await cloud.update('dose_logs', remote.id, { injection_site: 'left', slot_at: null });
  await pullChanges(db, cloud, USER);
  assert.equal(db.getFirstSync('SELECT slot_at FROM dose_logs').slot_at, '2024-06-19T12:05:00.000Z', 'a cloud NULL keeps it');
  const fresh = makeDb(); seedSyncedProtocol(fresh, USER, { remote_id: 'p-1', updated_at: '000001' });
  await cloud.update('dose_logs', remote.id, { slot_at: '2024-06-19T12:05:00.000Z' });
  await pullChanges(fresh, cloud, USER);
  assert.equal(fresh.getFirstSync('SELECT slot_at FROM dose_logs').slot_at, '2024-06-19T12:05:00.000Z', 'a reinstall gets it');
});

test('wired: "Alterar horário" writes the slot with the new time', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/LogScreen.js'), 'utf8');
  assert.match(src, /writeOutcome\(log\.id, timeEditFields\(log, value\)\)/);
});
