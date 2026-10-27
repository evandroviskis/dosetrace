'use strict';
// Founder 2026-10-27 ("Opção A, aceito, pode seguir com tudo"; docs/design/dose-fix-or-change.html):
// a new protocol dose asks "Desde quando você usa {new}?" — A partir de agora / Desde o início / A partir
// de uma dose. The app never deduces; doses at another value or corrected by hand never change; a
// unit-only change with the same mass asks nothing; the save is one step (all or nothing).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, seedSyncedProtocol } = require('./helpers/syncHarness');
const { loadFn } = require('./helpers/extractFn');
const { nextDoseHistory, sameMass } = require('../lib/doseStamp');

const USER = 'u', DAY = 864e5;
const t = (d) => new Date(Date.now() - d * DAY).toISOString();
function app(db) {
  const f = {};
  for (const n of ['insertDoseLog', 'updateDoseLog', 'updateProtocol', 'doseEditContext']) f[n] = loadFn('lib/database.js', `export function ${n}(`, n, { getDB: () => db });
  return f;
}
function prot(db, dose = '2500', extra = {}) {
  const id = seedSyncedProtocol(db, USER, { remote_id: 'p', updated_at: '1' });
  db.runSync('UPDATE protocols SET dose = ?, dose_unit = ?, start_date = ?, created_at = ? WHERE id = ?', [dose, 'mg', extra.start || t(70).slice(0, 10), extra.created || t(70), id]);
  return id;
}
const amounts = (db, pid) => db.getAllSync('SELECT dose_amount FROM dose_logs WHERE protocol_id = ? ORDER BY logged_at', [pid]).map((r) => r.dose_amount);
const hist = (db, pid) => { const h = db.getFirstSync('SELECT dose_history FROM protocols WHERE id = ?', [pid]).dose_history; return h ? JSON.parse(h) : null; };

test('sameMass: 0,25 mg = 250 mcg; IU only equals IU', () => {
  assert.equal(sameMass('0.25', 'mg', '250', 'mcg'), true);
  assert.equal(sameMass('0,25', 'mg', '250', 'mcg'), true);
  assert.equal(sameMass('1', 'mg', '1', 'IU'), false);
  assert.equal(sameMass('10', 'IU', '10', 'iu'), true);
  assert.equal(nextDoseHistory({ dose: '0.25', dose_unit: 'mg' }, '250', 'mcg', 'x', 'now'), null, 'unit only: no history');
});

test('nextDoseHistory modes: now appends at now, from appends at the date, start replaces the current value', () => {
  const p = { dose: '2500', dose_unit: 'mg' };
  assert.deepEqual(JSON.parse(nextDoseHistory(p, '250', 'mg', '2026-10-27T00:00:00Z', 'now')).map((e) => [e.from, e.dose]), [[null, 2500], ['2026-10-27T00:00:00Z', 250]]);
  assert.deepEqual(JSON.parse(nextDoseHistory(p, '250', 'mg', '2026-10-06T08:00:00Z', 'from')).map((e) => [e.from, e.dose]), [[null, 2500], ['2026-10-06T08:00:00Z', 250]]);
  assert.equal(nextDoseHistory(p, '250', 'mg', 'x', 'start'), null, 'no history: the new dose from the very beginning');
});

test('context: the doses since the current value began, newest first, which ones are at the old value, and the estimated past', () => {
  const db = makeDb(); const a = app(db); const pid = prot(db, '2500', { start: t(100).slice(0, 10), created: t(70) });
  for (const d of [63, 56, 49]) a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: t(d) });
  const r = a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: t(42) });
  a.updateDoseLog(r, { dose_amount: 300 }); // corrected by hand
  const c = a.doseEditContext(pid);
  assert.equal(c.rows.length, 4);
  assert.ok(Date.parse(c.rows[0].logged_at) > Date.parse(c.rows[3].logged_at), 'newest first');
  assert.deepEqual(c.rows.map((x) => x.atOld), [false, true, true, true]);
  assert.equal(c.atOld, 3);
  assert.equal(c.estimated, true, 'start date before the protocol was added');
});

test('founder example: 10 doses at 2500, the last 4 were 250 → "A partir de uma dose" changes exactly those 4', () => {
  const db = makeDb(); const a = app(db); const pid = prot(db);
  const ids = [];
  for (let k = 10; k >= 1; k--) ids.push(a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: t(k * 7) }));
  const seventh = db.getFirstSync('SELECT logged_at FROM dose_logs WHERE id = ?', [ids[6]]).logged_at;
  const out = a.updateProtocol(pid, { dose: '250', __doseFix: { mode: 'from', from: seventh } });
  assert.deepEqual(amounts(db, pid), [2500, 2500, 2500, 2500, 2500, 2500, 250, 250, 250, 250]);
  assert.equal(out.fixed.length, 4);
  assert.deepEqual(hist(db, pid).map((e) => [e.from, e.dose]), [[null, 2500], [seventh, 250]], 'the curve before dose 7 is unchanged');
});

test('"Desde o início": every dose at the old value + the estimated past; a hand-corrected dose never changes', () => {
  const db = makeDb(); const a = app(db); const pid = prot(db);
  for (const d of [21, 14, 7]) a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: t(d) });
  const own = a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: t(1) });
  a.updateDoseLog(own, { dose_amount: 2500 }); // she set it herself, even to the same value
  a.updateProtocol(pid, { dose: '250', __doseFix: { mode: 'start' } });
  assert.deepEqual(amounts(db, pid), [250, 250, 250, 2500]);
  assert.equal(hist(db, pid), null, 'the wrong value is gone: 250 from the beginning');
});

test('"A partir de agora": nothing marked changes', () => {
  const db = makeDb(); const a = app(db); const pid = prot(db, '0.25');
  for (const d of [21, 14, 7]) a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: t(d) });
  a.updateProtocol(pid, { dose: '0.5', __doseFix: { mode: 'now' } });
  assert.deepEqual(amounts(db, pid), [0.25, 0.25, 0.25]);
  assert.equal(hist(db, pid).length, 2);
});

test('one step: a failure while correcting the doses leaves the protocol and every dose as they were', () => {
  const db = makeDb(); const pid = prot(db);
  const a = app(db);
  for (const d of [21, 14, 7]) a.insertDoseLog({ user_id: USER, protocol_id: pid, outcome: 'Taken', logged_at: t(d) });
  let n = 0;
  const flaky = new Proxy(db, { get(o, k) {
    if (k === 'runSync') return (sql, p) => { if (/UPDATE dose_logs SET dose_amount/.test(sql) && ++n === 2) throw new Error('disk'); return o.runSync(sql, p); };
    const v = o[k]; return typeof v === 'function' ? v.bind(o) : v;
  } });
  const up = loadFn('lib/database.js', 'export function updateProtocol(', 'updateProtocol', { getDB: () => flaky });
  assert.throws(() => up(pid, { dose: '250', __doseFix: { mode: 'start' } }), /disk/);
  assert.deepEqual(amounts(db, pid), [2500, 2500, 2500]);
  assert.equal(db.getFirstSync('SELECT dose FROM protocols WHERE id = ?', [pid]).dose, '2500');
});

test('no question needed: a typo before any dose with no estimated past replaces the value', () => {
  const db = makeDb(); const a = app(db); const pid = prot(db, '2500', { start: t(0).slice(0, 10), created: t(0) });
  assert.equal(a.doseEditContext(pid).estimated, false);
  a.updateProtocol(pid, { dose: '250' });
  assert.equal(hist(db, pid), null);
});
