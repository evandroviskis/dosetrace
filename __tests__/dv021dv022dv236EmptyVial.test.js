// Parked-error sweep 2026-10-31 (DIVERGENCES DV-021 / DV-022 / DV-236, DL-20 "an empty vial is never reopened";
// DL-88 the end wins). Undo of a dose reopened any inactive vial (also one the End closed); a same-day Restore
// set the newest vial active even when its doses were used up or it was deleted; Restart with "the same
// vial" made a used-up vial active. Each now reopens only what it closed / what still has doses.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { planUndoTake } = require('../lib/markTaken');
const { vialToReopen } = require('../lib/deleteDose');

test('DV-021: Undo reopens only the vial this dose finished', () => {
  const closedByEnd = planUndoTake({ logId: 1, vialId: 7, vialFinished: false }, { vialNow: { id: 7, doses_taken: 3, active: 0 } });
  assert.deepEqual(closedByEnd.vialRestore, { id: 7, doses_taken: 2 });
  const finishedByThis = planUndoTake({ logId: 1, vialId: 7, vialFinished: true }, { vialNow: { id: 7, doses_taken: 10, active: 0 } });
  assert.deepEqual(finishedByThis.vialRestore, { id: 7, doses_taken: 9, active: 1 });
  const older = planUndoTake({ logId: 1, vialId: 7, prevDosesTaken: 2, vialFinished: false });
  assert.equal(older.vialRestore.active, undefined);
});

test('DV-022 / DV-236: vialToReopen — never an empty or deleted vial', () => {
  const p = { amount: 10, unit: 'mg', dose: 1, dose_unit: 'mg' };
  assert.equal(vialToReopen({ id: 1, total_doses: 10, doses_taken: 4, sync_status: 'synced' }, p), true);
  assert.equal(vialToReopen({ id: 1, total_doses: 10, doses_taken: 10, sync_status: 'synced' }, p), false);
  assert.equal(vialToReopen({ id: 1, total_doses: 10, doses_taken: 4, sync_status: 'deleted' }, p), false);
  assert.equal(vialToReopen(null, p), false);
});

test('DV-022: Restore reopens the newest vial only through vialToReopen; the query skips tombstones', () => {
  const ps = fs.readFileSync(path.join(__dirname, '..', 'screens/ProtocolsScreen.js'), 'utf8');
  assert.match(ps, /if \(newestVial && vialToReopen\(newestVial, getProtocolById\(id\)\)\) updateVial\(newestVial\.id, \{ active: 1 \}\);/);
  const db = fs.readFileSync(path.join(__dirname, '..', 'lib/database.js'), 'utf8');
  const q = db.slice(db.indexOf('export function getNewestVialForProtocol('), db.indexOf('export function getNewestVialForProtocol(') + 300);
  assert.match(q, /SELECT \* FROM vials WHERE protocol_id = \? AND sync_status != 'deleted' ORDER BY created_at DESC LIMIT 1/);
});

test('DV-236: Restart with the same vial keeps a used-up vial closed (and a vial with doses left open)', () => {
  const PE = require('../lib/protocolEnd');
  const mk = (taken) => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE protocols (id INTEGER PRIMARY KEY, user_id TEXT, name TEXT, type TEXT, amount REAL, unit TEXT, dose REAL, dose_unit TEXT, start_date TEXT, active INTEGER, created_at TEXT, updated_at TEXT, sync_status TEXT, units_taken REAL, ended_at TEXT);
      CREATE TABLE vials (id INTEGER PRIMARY KEY, user_id TEXT, protocol_id INTEGER, protocol_remote_id TEXT, mixed_on TEXT, water_ml REAL, total_doses INTEGER, doses_taken INTEGER, expires_on TEXT, active INTEGER, created_at TEXT, updated_at TEXT, sync_status TEXT);
      INSERT INTO protocols VALUES (1,'u','BPC','recon',10,'mg',1,'mg','2026-10-01',0,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','synced',0,'2026-10-20T00:00:00Z');`);
    db.prepare(`INSERT INTO vials VALUES (1,'u',1,NULL,'2026-10-01',2,10,?,NULL,0,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','synced')`).run(taken);
    const shim = { getFirstSync: (s, a = []) => db.prepare(s).get(...a), getAllSync: (s, a = []) => db.prepare(s).all(...a), runSync: (s, a = []) => { const r = db.prepare(s).run(...a); return { lastInsertRowId: Number(r.lastInsertRowid), changes: r.changes }; }, execSync: (s) => db.exec(s) };
    const newId = PE.restartAsNew(shim, 1, { nowIso: '2026-10-31T12:00:00Z', todayKey: '2026-10-31', sameContainer: true });
    return db.prepare('SELECT protocol_id, active FROM vials WHERE id = 1').get().active + ':' + (db.prepare('SELECT protocol_id FROM vials WHERE id = 1').get().protocol_id === newId);
  };
  assert.equal(mk(10), '0:true', 'used up: moved, stays closed');
  assert.equal(mk(4), '1:true', 'doses left: moved and in use');
});
