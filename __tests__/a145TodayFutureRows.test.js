'use strict';
// A-145 (Fold device test of test build 3, 2026-10-17): doses logged while the phone clock was
// ahead are dated tomorrow. After the clock was corrected, Today (Saturday) listed Sunday's Zinc
// and Vitmin C under Concluído and the list said 6 de 6 while the ring said 5 de 6.
// Cause: lib/database.js getTodayLogs read logged_at >= start of today with no upper bound.
// Fix: today = [start of today, start of tomorrow), local day. Runs the real query on a real
// in-memory SQLite and the real Today reader (screens/TodayScreen.js fetchTodayLogs).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const { loadFn } = require('./helpers/extractFn');
const PE = require('../lib/protocolEnd');
const { adherenceRings } = require('../lib/adherenceRings');

const USER = 'u1';
function at(daysAhead, h, m = 0) { const d = new Date(); d.setDate(d.getDate() + daysAhead); d.setHours(h, m, 0, 0); return d.toISOString(); }
function startOfTomorrow() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d.toISOString(); }

function phone() {
  const db = makeDb();
  const fromDb = (name) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB: () => db, PE });
  return { db, getTodayLogs: fromDb('getTodayLogs'), insertDoseLog: fromDb('insertDoseLog') };
}

function seed(p) {
  // Zinc (1) and Vitmin C (2): one dose a day at 08:00, both logged today AND (clock ahead) tomorrow.
  p.insertDoseLog({ user_id: USER, protocol_id: 1, outcome: 'Taken', logged_at: at(0, 8, 5) });
  p.insertDoseLog({ user_id: USER, protocol_id: 2, outcome: 'Taken', logged_at: at(0, 8, 6) });
  p.insertDoseLog({ user_id: USER, protocol_id: 1, outcome: 'Taken', logged_at: at(1, 8, 5) });
  p.insertDoseLog({ user_id: USER, protocol_id: 2, outcome: 'Taken', logged_at: at(1, 8, 6) });
  p.insertDoseLog({ user_id: USER, protocol_id: 3, outcome: 'Skipped', logged_at: startOfTomorrow() }); // exactly midnight
  p.insertDoseLog({ user_id: USER, protocol_id: 3, outcome: 'Taken', logged_at: at(0, 23, 59) });
}

test('A-145: a row logged tomorrow is not in today\'s logs; rows logged today still are', () => {
  const p = phone();
  seed(p);
  const rows = p.getTodayLogs(USER);
  const tomorrow0 = Date.parse(startOfTomorrow());
  assert.equal(rows.length, 3, 'only the three rows dated today');
  assert.ok(rows.every((r) => Date.parse(r.logged_at) < tomorrow0), 'nothing from tomorrow (midnight included)');
  assert.deepEqual(rows.map((r) => r.protocol_id).sort(), [1, 2, 3]);
  assert.ok(rows.every((r) => r.outcome === 'Taken'), "tomorrow's 00:00 Skipped row is not today's");
});

test('A-145: a row logged at the very start of today still counts', () => {
  const p = phone();
  const d = new Date(); d.setHours(0, 0, 0, 0);
  p.insertDoseLog({ user_id: USER, protocol_id: 1, outcome: 'Taken', logged_at: d.toISOString() });
  assert.equal(p.getTodayLogs(USER).length, 1);
});

// The Today reader: done counts (the "x de y" line), the Concluído list and the card rows.
function todayReader(p) {
  const out = {};
  const set = (k) => (v) => { out[k] = v; };
  const fetchTodayLogs = loadFn('screens/TodayScreen.js', 'async function fetchTodayLogs(', 'fetchTodayLogs', {
    getCachedUser: async () => ({ id: USER }),
    getTodayLogs: p.getTodayLogs,
    setTakenCounts: set('taken'), setSkippedCounts: set('skipped'), setTodayRows: set('rows'), setTodayTaken: set('done'),
    fetchRings: () => {}, fetchPageLogs: () => {},
  });
  return { fetchTodayLogs, out };
}

test('A-145: Today\'s done count and Concluído list leave tomorrow\'s doses out, and agree with the ring', async () => {
  const p = phone();
  seed(p);
  const { fetchTodayLogs, out } = todayReader(p);
  await fetchTodayLogs();
  assert.deepEqual(out.taken, { 1: 1, 2: 1, 3: 1 }, 'one dose each today, never two');
  assert.deepEqual(out.skipped, {}, "tomorrow's skip is not today's");
  assert.equal(out.done.length, 3, 'Concluído lists only today\'s three doses');
  assert.equal(out.rows.length, 3);

  // The ring reads its own window (lib/adherenceRings): with today's doses it says the same.
  const created = new Date(); created.setDate(created.getDate() - 10);
  const protocols = [1, 2].map((id) => ({ id, user_id: USER, active: 1, frequency: 'daily', reminder_time: '08:00', doses_per_day: 1, interval_days: 1, created_at: created.toISOString() }));
  const all = p.db.getAllSync('SELECT * FROM dose_logs WHERE user_id = ?', [USER]);
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const ring = adherenceRings({ protocols, logs: all, nowMs: now.getTime() });
  const listDone = protocols.reduce((s, x) => s + Math.min(out.taken[x.id] || 0, 1), 0);
  assert.equal(ring.today.taken, listDone, 'list and ring agree');
});
