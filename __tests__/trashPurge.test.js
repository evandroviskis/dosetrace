'use strict';
// Recently deleted multi-select (founder 2026-10-03, approved from the pictures,
// scratchpad/proto/trash/lixeira.html). "Delete forever" (several, or the single trash) removes the
// protocol AND its dose logs and vials — synced tombstones, so the cloud and the other devices lose
// them too — and its reminders (the screen cancels them), so the sheet's words are true.
// Restoring several = the existing restore per item (an ended one goes back to Ended).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { pushPending } = require('../lib/syncCore');
const E = require('../lib/protocolEnd');
const T = require('../lib/trashSelection');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const USER = 'u1';
async function seedSynced(db, cloud, name) {
  const p = await cloud.insert('protocols', { user_id: USER, name, active: false, deleted_at: '2026-10-01T00:00:00Z' });
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, active, deleted_at, created_at, updated_at, sync_status) VALUES (?, ?, ?, 'recon', 0, '2026-10-01T00:00:00Z', '2026-09-01T00:00:00Z', ?, 'synced')`, [p.data.id, USER, name, p.data.updated_at]);
  const pid = db.getFirstSync('SELECT id FROM protocols WHERE remote_id = ?', [p.data.id]).id;
  for (const d of ['2026-09-20', '2026-09-21']) {
    const l = await cloud.insert('dose_logs', { user_id: USER, protocol_id: p.data.id, outcome: 'Taken', logged_at: `${d}T08:00:00Z` });
    db.runSync(`INSERT INTO dose_logs (remote_id, user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, ?, 'Taken', ?, ?, 'synced')`, [l.data.id, USER, pid, p.data.id, `${d}T08:00:00Z`, l.data.updated_at]);
  }
  const v = await cloud.insert('vials', { user_id: USER, protocol_id: p.data.id, total_doses: 10 });
  db.runSync(`INSERT INTO vials (remote_id, user_id, protocol_id, protocol_remote_id, total_doses, updated_at, sync_status) VALUES (?, ?, ?, ?, 10, ?, 'synced')`, [v.data.id, USER, pid, p.data.id, v.data.updated_at]);
  // a dose logged offline, never pushed
  db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, sync_status) VALUES (?, ?, ?, 'Taken', '2026-09-22T08:00:00Z', 'pending')`, [USER, pid, p.data.id]);
  return { pid, remote: p.data.id };
}

test('Delete forever removes the protocol, its dose logs and its vials here, in the cloud and so on every device', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const a = await seedSynced(db, cloud, 'A');
  const b = await seedSynced(db, cloud, 'B');
  E.purgeProtocol(db, a.pid, '2026-10-04T10:00:00Z');
  assert.equal(db.getAllSync(E.SQL_ALL_LOGS, [USER]).filter((l) => l.protocol_id === a.pid).length, 0, 'gone from the Dose log at once');
  await pushPending(db, cloud, USER);
  assert.deepEqual(cloud.rows('protocols', USER).map((p) => p.name), ['B']);
  assert.equal(cloud.rows('dose_logs', USER).filter((l) => l.protocol_id === a.remote).length, 0);
  assert.equal(cloud.rows('vials', USER).filter((v) => v.protocol_id === a.remote).length, 0);
  assert.equal(db.getFirstSync('SELECT COUNT(*) AS n FROM dose_logs WHERE protocol_id = ?', [a.pid]).n, 0, 'local rows purged after the push');
  assert.equal(cloud.rows('dose_logs', USER).filter((l) => l.protocol_id === b.remote).length, 3, 'the other protocol keeps its doses (its offline one pushed too)');
  assert.equal(cloud.rows('vials', USER).filter((v) => v.protocol_id === b.remote).length, 1);
});

test('the single "Delete permanently" path does the same (database.permanentlyDeleteProtocol → purgeProtocol)', () => {
  assert.match(read('lib/database.js'), /export function permanentlyDeleteProtocol\(id\) \{\n\s+PE\.purgeProtocol\(getDB\(\), id\);/);
});

test('restoring several = the restore per item: an ended one goes back to Ended, another becomes active', () => {
  const db = makeDb();
  db.runSync(`INSERT INTO protocols (user_id, name, type, active, ended_at, deleted_at, created_at, updated_at, sync_status) VALUES ('u1','E','recon',0,'2026-09-20T00:00:00Z','2026-10-01T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z','synced'), ('u1','P','recon',0,NULL,'2026-10-01T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z','synced')`);
  const ids = db.getAllSync('SELECT id FROM protocols ORDER BY id').map((r) => r.id);
  const out = T.forEachSelected(ids, (id) => E.restoreDeleted(db, id, '2026-10-04T00:00:00Z'));
  assert.deepEqual(out, ['ended', 'active']);
});

test('selection: toggle, Select all / Deselect all, the bar counts and is off at 0, the sheet words by count', () => {
  let sel = T.start();
  assert.deepEqual(sel, []);
  sel = T.toggle(sel, 3); sel = T.toggle(sel, 5); sel = T.toggle(sel, 3);
  assert.deepEqual(sel, [5]);
  assert.equal(T.allLabelKey(sel, [3, 5, 7]), 'protocols_select_all');
  sel = T.toggleAll(sel, [3, 5, 7]);
  assert.deepEqual(sel, [3, 5, 7]);
  assert.equal(T.allLabelKey(sel, [3, 5, 7]), 'protocols_deselect_all');
  assert.deepEqual(T.toggleAll(sel, [3, 5, 7]), []);
  assert.deepEqual(T.prune([3, 9], [3, 5]), [3], 'a protocol that left the list leaves the selection');
  assert.deepEqual(T.bar([]), { n: 0, enabled: false });
  assert.deepEqual(T.bar([1, 2]), { n: 2, enabled: true });
  assert.deepEqual(T.confirmKeys(1), { title: 'protocols_purge_title_single', body: 'protocols_purge_body_single' });
  assert.deepEqual(T.confirmKeys(3), { title: 'protocols_purge_title_many', body: 'protocols_purge_body_many' });
});

test('the screen: Select only with items, the check, Cancel, the bar replaces the tab bar, the confirm sheet', () => {
  const s = read('screens/ProtocolsScreen.js');
  const i = s.indexOf('const deletedSection = ');
  const sec = s.slice(i, s.indexOf('\n  ) : null;', i));
  assert.match(sec, /t\('protocols_select'\)/);
  assert.match(sec, /t\(T\.allLabelKey\(trashSel, deletedIds\)\)/);
  assert.match(sec, /accessibilityRole="checkbox"/);
  assert.match(s, /navigation\.setOptions\(\{ tabBarStyle: trashSel \? \{ display: 'none' \} : tabBarStyle\(colors\) \}\)/);
  assert.match(s, /t\('protocols_restore_n'\)\.replace\('\{n\}', String\(bar\.n\)\)/);
  assert.match(s, /t\('protocols_delete_forever_n'\)\.replace\('\{n\}', String\(bar\.n\)\)/);
  assert.match(s, /disabled=\{!bar\.enabled\}/);
  assert.match(s, /function confirmPurge\(ids\)/);
  assert.match(read('App.js'), /tabBarStyle: tabBarStyle\(colors\),/);
});

test('the strings exist in six languages', () => {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    const tr = mod.exports.translations[l];
    for (const k of ['protocols_select', 'protocols_select_all', 'protocols_deselect_all', 'protocols_restore_n', 'protocols_delete_forever_n', 'protocols_purge_title_single', 'protocols_purge_title_many', 'protocols_purge_body_single', 'protocols_purge_body_many']) assert.ok(tr[k], `${l} ${k}`);
    assert.match(tr.protocols_purge_title_many, /\{n\}/, l);
  }
  assert.equal(mod.exports.translations.en.protocols_purge_title_single, 'Delete this protocol forever?');
  assert.equal(mod.exports.translations.en.protocols_purge_body_many, 'Their dose history, vials and reminders are removed from all your devices. This can’t be undone.');
});
