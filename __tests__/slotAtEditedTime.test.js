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

// Simulator 2026-10-27 (GHK-Cu, start date before the day it was added): a dose marked right after adding
// the protocol (22:03) and corrected to 21:03 fell before C = created − 1 h, so R2 dropped it from the
// curve ("the schedule covers that time" — it did not) and from the Log counts. Its slot decides the era;
// its time decides where it is drawn.
test('an edited time before the protocol was added stays in the curve and the counts (its slot is after C)', () => {
  const S = require('../lib/serumModel');
  const { getHalfLifeEntry } = require('../lib/halfLives');
  const { outcomeCounts } = require('../lib/declared');
  const e = getHalfLifeEntry('Testosterone Cypionate');
  const created = new Date(2026, 9, 26, 22, 3, 30).getTime();
  const ymd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const p = { id: 9, type: 'rtu', name: 'Testosterone Cypionate', compound_id: 'testosterone_cypionate', dose: '100', dose_unit: 'mg', interval_days: 1, doses_per_day: 1, reminder_time: '22:00', start_date: ymd(created - 10 * 864e5), created_at: new Date(created).toISOString() };
  const at = new Date(2026, 9, 26, 21, 3).getTime();
  const row = { id: 1, protocol_id: 9, outcome: 'Taken', logged_at: new Date(at).toISOString(), slot_at: new Date(created + 30000).toISOString(), dose_amount: 300, dose_unit: 'mg', protocol_created_at: p.created_at };
  const now = created + 864e5 / 2;
  const plan = S.curvePlan(p, e, now - 5 * 864e5, now + 864e5, now, { logs: [row] });
  assert.ok(plan.doses.includes(at), 'the corrected 21:03 dose is in the curve');
  assert.equal(outcomeCounts([row]).Taken, 1, 'and in the Dose log counts');
  // without a slot (a row really from before the protocol existed) R2 stands: declared, not counted
  const { slot_at, ...old } = row; // eslint-disable-line no-unused-vars
  assert.equal(outcomeCounts([old]).Taken, 0);
  assert.ok(!S.curvePlan(p, e, now - 5 * 864e5, now + 864e5, now, { logs: [old] }).doses.includes(at));
});

// Review 2026-10-27 #5: a time-edited row that later becomes Missed keeps being judged at its slot.
test('slot_at counts for every outcome', () => {
  const { isDeclared } = require('../lib/declared');
  const created = '2026-10-26T22:03:30.000Z';
  const missed = { outcome: 'Missed', logged_at: '2026-10-26T20:00:00.000Z', slot_at: '2026-10-26T22:04:00.000Z' };
  assert.equal(isDeclared(missed, created), false);
  const m = computeMissedDoses([proto], [{ ...moved, outcome: 'Missed', slot_at: new Date('2024-06-19T08:00:00').toISOString() }], now, 0, { lookbackDays: 1 });
  assert.equal(yesterday(m).length, 0, 'its own slot is answered');
});

// Spec audit 2026-10-27 (DC-3): the Missed scan reads rows by time; a dose whose time was moved far back
// (20 days) dropped out of the read and its slot looked missed. The read also takes rows by their slot.
test('the scan\'s read takes a row by its slot too (a time moved far back still answers its slot)', () => {
  const { loadFn } = require('./helpers/extractFn');
  const db = makeDb();
  const getLogsSince = loadFn('lib/database.js', 'export function getLogsSince(', 'getLogsSince', { getDB: () => db });
  const pid = seedSyncedProtocol(db, 'u', { remote_id: 'p-1', updated_at: '1' });
  db.runSync("INSERT INTO dose_logs (user_id, protocol_id, outcome, logged_at, slot_at, updated_at, sync_status) VALUES ('u', ?, 'Taken', '2026-10-01T08:00:00.000Z', '2026-10-25T08:00:00.000Z', '1', 'synced')", [pid]);
  assert.equal(getLogsSince('u', '2026-10-20T00:00:00.000Z').length, 1);
});

// Council 2026-10-27 (pharmacometrician #1): with an estimated past, a logged dose moved to a day BEFORE the
// protocol was added counted twice — the estimated dose of that day stayed. The moved dose answers that slot.
test('a dose moved into the estimated past replaces that day\'s estimated dose (never counted twice)', () => {
  const S = require('../lib/serumModel');
  const { getHalfLifeEntry } = require('../lib/halfLives');
  const e = getHalfLifeEntry('Testosterone Cypionate');
  const created = new Date(2026, 9, 20, 12, 0).getTime();
  const ymd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const p = { id: 9, type: 'rtu', name: 'Testosterone Cypionate', compound_id: 'testosterone_cypionate', dose: '100', dose_unit: 'mg', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', start_date: ymd(created - 10 * 864e5), created_at: new Date(created).toISOString() };
  const movedTo = new Date(2026, 9, 18, 9, 0).getTime(); // two days before the protocol was added
  const row = { id: 1, protocol_id: 9, outcome: 'Taken', logged_at: new Date(movedTo).toISOString(), slot_at: new Date(2026, 9, 21, 8, 0).toISOString(), dose_amount: 100, dose_unit: 'mg' };
  const now = new Date(2026, 9, 22, 12).getTime();
  const plan = S.curvePlan(p, e, now - 9 * 864e5, now + 864e5, now, { logs: [row] });
  const onDay = plan.doses.filter((t) => ymd(t) === ymd(movedTo));
  assert.equal(onDay.length, 1, 'one dose on 18/10 — the moved one, not the estimate as well');
  assert.ok(plan.doses.includes(movedTo));
});

// Council 2026-10-27 (pharmacometrician #5): a "from" date written in SQLite form is stored as ISO.
test('"A partir de uma dose": the history moment is stored as ISO whatever the row\'s format', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../lib/database.js'), 'utf8');
  assert.match(src, /const at = mode === 'from' && fx\.from \? isoOf\(fx\.from\) : now;/);
});
