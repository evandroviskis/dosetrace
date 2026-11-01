'use strict';
// DV-243 follow-up (coordinator 2026-11-01): a row marked "Não houve dose" has a way back, so a wrong
// tap is never permanent. Tapping it opens the same DoseTrace sheet as a Missed row minus "Não houve
// dose": "Marcar como concluída" (act), "Marcar como pulada" (well), "Cancelar". Both go through the
// normal paths: Taken flips THAT row through recordDoseTaken (the vial / bottle move once, synced, the
// scan sees a Taken), Skipped is the same outcome write as a Missed row's. Still no "Excluir dose".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const { planMarkTaken, planUndoTake } = require('../lib/markTaken');

const NOW = new Date(2026, 9, 22, 12, 0).getTime();
const SLOT = new Date(2026, 9, 21, 20, 0).toISOString();
const protocol = { id: 1, user_id: 'u1', remote_id: 'p1', type: 'recon', doses_per_day: 1, start_date: '2026-10-01', interval_days: 1, reminder_time: '20:00', created_at: '2026-10-01T08:00:00Z', dose: 250, dose_unit: 'mcg' };
const vial = { id: 5, doses_taken: 3, total_doses: 10, active: 1 };
const noDoseRow = { id: 42, protocol_id: 1, outcome: 'NoDose', logged_at: SLOT };

test('DV-243 way back: "Marcar como concluída" flips the named "no dose" row itself (no second row) and moves the vial once', () => {
  const plan = planMarkTaken({ protocol, vial, todayLogs: [noDoseRow], dayKey: '2026-10-21', slotMs: Date.parse(SLOT), nowMs: NOW, flipRowId: 42 });
  assert.equal(plan.alreadyTaken, false);
  assert.equal(plan.insert, null, 'never a second row next to it');
  assert.deepEqual(plan.update, { id: 42, outcome: 'Taken' }, 'the same row, its slot time kept');
  assert.equal(plan.flippedFrom, 'NoDose');
  assert.deepEqual(plan.vialUpdate, { id: 5, doses_taken: 4 });
});

test('DV-243 way back: an undo of that take gives the row back as "no dose" (never as Missed)', () => {
  const undo = planUndoTake({ logId: 42, flipped: true, flippedFrom: 'NoDose', prevLoggedAt: SLOT });
  assert.equal(undo.restoreMissedId, 42);
  assert.equal(undo.restoreOutcome, 'NoDose');
  assert.deepEqual(undo.deleteIds, []);
  // The older outcomes keep their rule (A-78).
  assert.equal(planUndoTake({ logId: 1, flipped: true, flippedFrom: 'Skipped' }).restoreOutcome, 'Skipped');
  assert.equal(planUndoTake({ logId: 1, flipped: true, flippedFrom: 'Missed' }).restoreOutcome, 'Missed');
});

test('DV-243 way back: a "no dose" row is never flipped unless it is the row named (no guessing)', () => {
  const plan = planMarkTaken({ protocol, vial, todayLogs: [noDoseRow], dayKey: '2026-10-21', slotMs: Date.parse(SLOT), nowMs: NOW });
  assert.equal(plan.update, null);
});

test('DV-243 way back: after the flip the scan sees the slot taken (no Missed written)', () => {
  const { computeMissedDoses } = require('../lib/missedDoses');
  const rows = [{ ...noDoseRow, outcome: 'Taken' }];
  assert.deepEqual(computeMissedDoses([{ ...protocol, created_at: '2020-01-01T08:00:00' }], rows, NOW, 0, { lookbackDays: 2 }).filter((m) => m.scheduledAtMs === Date.parse(SLOT)), []);
});

test('DV-243 way back: the row opens its own sheet — complete (act), skipped (well), cancel; no "Não houve dose", no delete', () => {
  const src = read('screens/LogScreen.js');
  assert.match(src, /onPress=\{\(\) => log\.outcome === 'Missed' \? openMissedEditor\(log\) : log\.outcome === NO_DOSE \? openNoDoseEditor\(log\) : openDoseSheet\(log\)\}/);
  const fn = src.slice(src.indexOf('function openNoDoseEditor('), src.indexOf('function setMissedOutcome('));
  assert.match(fn, /title: t\('log_missed_edit_title'\)/);
  assert.match(fn, /body: t\('log_no_dose_edit_msg'\)\.replace\('\{action\}', t\('log_no_dose'\)\)/);
  const i = fn.indexOf("{ label: t('log_mark_taken'), kind: 'primary', onPress: () => setMissedOutcome(log, 'Taken') }");
  const j = fn.indexOf("{ label: t('log_mark_skipped'), kind: 'secondary', onPress: () => setMissedOutcome(log, 'Skipped') }");
  const k = fn.indexOf("{ label: t('cancel'), kind: 'secondary' }");
  assert.ok(i > 0 && j > i && k > j, 'complete, skipped, cancel');
  assert.doesNotMatch(fn, /log_no_dose'\), kind/);
  assert.doesNotMatch(fn, /log_delete_dose/);
  // Accessibility: the row says it can be updated, like a Missed row.
  assert.match(src, /accessibilityHint=\{log\.outcome === 'Missed' \|\| log\.outcome === NO_DOSE \? t\('log_missed_edit_title'\) : undefined\}/);
});

test('DV-243 way back: the sheet sentence in 6 languages (pt formal)', () => {
  const { translations } = require('../i18n/translations.js');
  assert.equal(translations.pt.log_no_dose_edit_msg, 'Esta dose está marcada como “{action}”. Se havia uma dose para tomar, atualize aqui.');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.match(translations[l].log_no_dose_edit_msg, /\{action\}/, l);
});
