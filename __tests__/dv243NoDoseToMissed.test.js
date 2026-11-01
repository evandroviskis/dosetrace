'use strict';
// DV-243 way back, part 2 (founder 2026-11-01, "4 ok"): a row marked "Não houve dose" can go back to
// "Perdida". The "no dose" sheet offers, in this order: "Marcar como concluída" (primary), "Marcar como
// pulada" (well), "Marcar como perdida" (well), "Cancelar". The write is the same outcome path as the
// other changes (setMissedOutcome → writeOutcome on the SAME row id): nothing deleted, synced. Back as
// Missed, the scan sees an existing Missed row (no duplicate written) and the report / adherence / streak
// count the slot as missed again.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'LogScreen.js'), 'utf8');

test('NoDose → Missed: the "no dose" sheet order is concluída (primary), pulada, perdida (well), Cancelar', () => {
  const fn = src.slice(src.indexOf('function openNoDoseEditor('), src.indexOf('function setMissedOutcome('));
  const i = fn.indexOf("{ label: t('log_mark_taken'), kind: 'primary', onPress: () => setMissedOutcome(log, 'Taken') }");
  const j = fn.indexOf("{ label: t('log_mark_skipped'), kind: 'secondary', onPress: () => setMissedOutcome(log, 'Skipped') }");
  const m = fn.indexOf("{ label: t('log_mark_missed'), kind: 'secondary', onPress: () => setMissedOutcome(log, 'Missed') }");
  const k = fn.indexOf("{ label: t('cancel'), kind: 'secondary' }");
  assert.ok(i > 0 && j > i && m > j && k > m, 'order: complete, skipped, missed, cancel');
  assert.doesNotMatch(fn, /log_delete_dose/, 'still no delete');
  // The Missed sheet itself never offers "mark as missed".
  const missed = src.slice(src.indexOf('function openMissedEditor('), src.indexOf('function openNoDoseEditor('));
  assert.doesNotMatch(missed, /log_mark_missed/);
});

test('NoDose → Missed: the write is the outcome change on the same row id (nothing deleted, synced)', () => {
  const set = src.slice(src.indexOf('function setMissedOutcome('), src.indexOf('function markRowTaken('));
  // 'Missed' is neither Taken branch: it falls through to the plain outcome write of log.id.
  assert.match(set, /if \(outcome === 'Taken'\) \{ markRowTaken\(log, null\); return; \}\s*writeOutcome\(log\.id, \{ outcome \}\);/);
  const w = src.slice(src.indexOf('function writeOutcome('), src.indexOf('const gate = embedded'));
  assert.match(w, /updateDoseLog\(logId, fields\);/);
  assert.match(w, /requestSync\(\);/);
  assert.doesNotMatch(w, /deleteDoseLog|insertDoseLog/);
});

function reportFixture(outcome) {
  const iso = (d, h = 8) => new Date(2026, 9, d, h, 0, 0, 0).toISOString();
  const protocols = [{ id: 1, name: 'BPC-157', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: new Date(2026, 8, 1, 7).toISOString() }];
  const logs = [
    ...[20, 21, 22, 23].map((d) => ({ id: d, protocol_id: 1, outcome: 'Taken', logged_at: iso(d) })),
    { id: 24, protocol_id: 1, outcome: 'Missed', logged_at: iso(24) },
    { id: 25, protocol_id: 1, outcome, logged_at: iso(25) },
  ];
  return { protocols, logs, sinceMs: new Date(2026, 9, 20, 0).getTime(), nowMs: new Date(2026, 9, 26, 12).getTime() };
}

test('NoDose → Missed: the report miss count goes back up by one and the slot returns to the adherence %', () => {
  const { adherenceStats } = require('../lib/adherenceReport');
  const before = adherenceStats(reportFixture('NoDose'));
  const after = adherenceStats(reportFixture('Missed'));
  assert.equal(after.overall.missed, before.overall.missed + 1);
  assert.equal(after.overall.total, before.overall.total + 1);
  const { slotCounts } = require('../lib/adherenceRings');
  const a = reportFixture('NoDose');
  const b = reportFixture('Missed');
  assert.equal(slotCounts(b.protocols, b.logs, b.sinceMs, b.nowMs)[1].due, slotCounts(a.protocols, a.logs, a.sinceMs, a.nowMs)[1].due + 1);
  const { outcomeCounts } = require('../lib/declared');
  assert.equal(outcomeCounts(b.logs).Missed, outcomeCounts(a.logs).Missed + 1);
});

test('NoDose → Missed: the next scan writes no second Missed for that slot, and the clean-ups keep the row', () => {
  const m = require('../lib/missedDoses');
  const p = { id: 1, user_id: 'u1', remote_id: null, start_date: '2024-01-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: '2020-01-01T08:00:00' };
  const now = new Date('2024-06-20T12:00:00').getTime();
  const slot = new Date('2024-06-19T08:00:00').toISOString();
  const back = { id: 7, protocol_id: 1, outcome: 'Missed', logged_at: slot, sync_status: 'pending', updated_at: '2024-06-20T11:00:00Z' };
  assert.deepEqual(m.computeMissedDoses([p], [back], now, 0, { lookbackDays: 1 }), []);
  assert.deepEqual(m.duplicateMissedRows([back], [p]), []);
  assert.deepEqual(m.falseMissedRows([p], [back], now), []);
});

test('NoDose → Missed: the day breaks the dose streak again', () => {
  const { reportStreaks } = require('../lib/doseStreak');
  const p = { id: 1, start_date: '2026-10-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: new Date(2026, 9, 1, 7).toISOString() };
  const now = new Date(2026, 9, 10, 12);
  const day = (d) => new Date(2026, 9, d, 8).toISOString();
  const taken = [5, 6, 7, 9, 10].map((d) => ({ protocol_id: 1, outcome: 'Taken', logged_at: day(d) }));
  assert.equal(reportStreaks([p], [...taken, { protocol_id: 1, outcome: 'NoDose', logged_at: day(8) }], now)[1], 5);
  assert.equal(reportStreaks([p], [...taken, { protocol_id: 1, outcome: 'Missed', logged_at: day(8) }], now)[1], 2);
});

test('NoDose → Missed: "Marcar como perdida" in 6 languages, next to the sibling buttons', () => {
  const { translations } = require('../i18n/translations.js');
  const want = {
    en: 'Mark as missed',
    es: 'Marcar como perdida',
    pt: 'Marcar como perdida',
    fr: 'Marquer comme manquée',
    de: 'Als verpasst markieren',
    it: 'Segna come mancata',
  };
  for (const [l, v] of Object.entries(want)) assert.equal(translations[l].log_mark_missed, v, l);
});
