'use strict';
// S25 2026-11-07 (pt, test account): "Sem curva: Peptídeo #1, Peptídeo #4…" seemed to list a protocol that sits in
// "Excluídos recentemente". Every list the curve screen builds (the charted ones and the four "Sem curva" reasons)
// comes from SQL_HISTORY → curveHistoryProtocols → splitCurveProtocols; this runs that exact chain on a real
// SQLite (the sync harness) and proves a deleted (or purged) protocol reaches none of them. What does reach the
// "Sem curva" line is an ENDED run (A-83 keeps its past on the curve, PRD-PROT-80) — "Retomar" leaves it under
// the same name as the new run, so after deleting the new run the ended one read exactly like the deleted one.
// The chart already names an ended run "· encerrado" (A-83, lib/serumModel curveLabels); the "Sem curva" line
// named it bare. Now it carries the same marker, so an ended run can never be taken for a deleted or a live one.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const E = require('../lib/protocolEnd');
const { splitCurveProtocols, curveHistoryProtocols } = require('../lib/serumModel');
const { translations } = require('../i18n/translations');

const pt = (k) => (translations.pt[k] != null ? translations.pt[k] : k);
const NOW = Date.parse('2026-11-07T15:00:00Z');

function seed(db) {
  // name, type, dose, unit, active, deleted_at, ended_at, purged_at
  const rows = [
    ['Peptídeo #4', 'recon', '2.5', 'mg', 1, null, null, null], // live, no half-life data
    ['Peptídeo #1', 'recon', '2.5', 'mg', 0, '2026-11-07T14:00:00Z', null, null], // in Recently deleted
    ['Peptídeo #9', 'recon', '2.5', 'mg', 0, '2026-11-07T14:00:00Z', '2026-11-01T10:00:00Z', null], // ended, then deleted
    ['Somatropin X', 'recon', '4', 'IU', 0, '2026-11-07T14:00:00Z', null, null], // deleted, IU
    ['Sem dose', 'recon', null, null, 0, '2026-11-07T14:00:00Z', null, null], // deleted, no dose
    ['Zinco apagado', 'oral', '50', 'mg', 0, '2026-11-07T14:00:00Z', null, null], // deleted oral
    ['Peptídeo #7', 'recon', '2.5', 'mg', 0, '2026-11-01T00:00:00Z', null, '2026-11-02T00:00:00Z'], // purged
  ];
  for (const [name, type, dose, unit, active, deleted, ended, purged] of rows) {
    db.runSync(
      `INSERT INTO protocols (user_id, name, type, dose, dose_unit, active, deleted_at, ended_at, purged_at, start_date, interval_days, doses_per_day, created_at, updated_at, sync_status)
       VALUES ('u1', ?, ?, ?, ?, ?, ?, ?, ?, '2026-10-10', 7, 1, '2026-10-10T12:00:00Z', '2026-11-07T14:00:00Z', 'synced')`,
      [name, type, dose, unit, active, deleted, ended, purged],
    );
  }
}

// The curve screen's readCurveData, as it reads the protocols.
function curveLists(db) {
  const split = splitCurveProtocols(curveHistoryProtocols(db.getAllSync(E.SQL_HISTORY, ['u1']), NOW), pt);
  return split;
}

test('S25 2026-11-07: a deleted or purged protocol is in none of the lists the curve screen builds', () => {
  const db = makeDb();
  seed(db);
  const r = curveLists(db);
  const all = [...r.noData, ...r.iu, ...r.noDose, ...r.oral, ...r.active.map((p) => p.name)].join(' | ');
  for (const gone of ['Peptídeo #1', 'Peptídeo #9', 'Somatropin X', 'Sem dose', 'Zinco apagado', 'Peptídeo #7']) {
    assert.ok(!all.includes(gone), `${gone} must not reach the curve: ${all}`);
  }
  assert.deepEqual(r.noData, ['Peptídeo #4'], 'the live one stays named');
});

test('S25 2026-11-07: an ended run is named "· encerrado" on the Sem curva line, apart from a live run of the same name', () => {
  // Retomar: the ended first run and the new run share the name.
  const ended = { id: 1, type: 'recon', name: 'Peptídeo #1', dose: '2.5', dose_unit: 'mg', active: 0, deleted_at: null, ended_at: '2026-11-05T10:00:00Z' };
  const live = { id: 2, type: 'recon', name: 'Peptídeo #1', dose: '2.5', dose_unit: 'mg', active: 1, deleted_at: null };
  const both = splitCurveProtocols(curveHistoryProtocols([live, ended], NOW), pt);
  assert.deepEqual(both.noData, ['Peptídeo #1', 'Peptídeo #1 · encerrado']);
  // The new run deleted: only the ended run is left, and it says so.
  const onlyEnded = splitCurveProtocols(curveHistoryProtocols([ended], NOW), pt);
  assert.deepEqual(onlyEnded.noData, ['Peptídeo #1 · encerrado']);
  // The same marker on every reason (IU, no dose, oral).
  const iu = splitCurveProtocols([{ ...ended, name: 'Somatropin', compound_id: 'Somatropin', dose: '4', dose_unit: 'IU' }], (k) => k);
  assert.ok(iu.iu.every((n) => / · curve_ended_marker$/.test(n)), JSON.stringify(iu));
  const nd = splitCurveProtocols([{ ...ended, name: 'Semaglutide', compound_id: 'Semaglutide', dose: null }], (k) => k);
  assert.ok(nd.noDose.length === 1 && / · curve_ended_marker$/.test(nd.noDose[0]), JSON.stringify(nd));
  const oral = splitCurveProtocols([{ ...ended, type: 'oral', name: 'Zinco', dose: '50' }], (k) => k);
  assert.deepEqual(oral.oral, ['Zinco · curve_ended_marker']);
  // A live protocol keeps its plain name (DV-155, decisions.md:130 unchanged).
  assert.deepEqual(splitCurveProtocols([{ ...live, type: 'oral', name: 'Zinco', dose: '50' }], (k) => k).oral, ['Zinco']);
});
