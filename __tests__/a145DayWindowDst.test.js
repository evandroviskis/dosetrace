'use strict';
// A-145 follow-up (DT Council build 52, senior engineer 2026-10-17): Today's window must end at the
// next local midnight even on a day whose own midnight does not exist. In America/Santiago the
// clock jumps from Sat 24:00 to Sun 01:00 (2026-09-06), so "start of today" is 01:00; copying it
// and adding a day gave Mon 01:00, and Monday 00:00-00:59 counted as Sunday's doses.
// Fix: build both ends from the date parts (as lib/markTaken.js markTakenDay does).
process.env.TZ = 'America/Santiago';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const { loadFn } = require('./helpers/extractFn');
const PE = require('../lib/protocolEnd');

const USER = 'u1';

function phone() {
  const db = makeDb();
  const fromDb = (name) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB: () => db, PE });
  return { getTodayLogs: fromDb('getTodayLogs'), insertDoseLog: fromDb('insertDoseLog') };
}

test('A-145: on a day without a midnight, Today still ends at the next local midnight', () => {
  const p = phone();
  const sundayNoon = new Date(2026, 8, 6, 12, 0, 0, 0).getTime(); // Sun 2026-09-06, starts at 01:00
  p.insertDoseLog({ user_id: USER, protocol_id: 1, outcome: 'Taken', logged_at: new Date(2026, 8, 6, 23, 30).toISOString() });
  p.insertDoseLog({ user_id: USER, protocol_id: 2, outcome: 'Taken', logged_at: new Date(2026, 8, 7, 0, 30).toISOString() }); // Monday
  const rows = p.getTodayLogs(USER, sundayNoon);
  assert.deepEqual(rows.map((r) => r.protocol_id), [1], "Monday 00:30 is Monday's dose, not Sunday's");
});

test('A-145: an ordinary day keeps its whole span (00:00 included, next 00:00 excluded)', () => {
  const p = phone();
  const noon = new Date(2026, 9, 17, 12, 0, 0, 0).getTime();
  p.insertDoseLog({ user_id: USER, protocol_id: 1, outcome: 'Taken', logged_at: new Date(2026, 9, 17, 0, 0).toISOString() });
  p.insertDoseLog({ user_id: USER, protocol_id: 2, outcome: 'Taken', logged_at: new Date(2026, 9, 18, 0, 0).toISOString() });
  assert.deepEqual(p.getTodayLogs(USER, noon).map((r) => r.protocol_id), [1]);
});
