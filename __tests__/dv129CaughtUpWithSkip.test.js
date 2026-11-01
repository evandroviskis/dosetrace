'use strict';
// DV-129 (DL-12, AD-79 item 12; founder 2026-11-01 option A of docs/design/rodada1-hoje-registro.html #dv129):
// a skipped dose counts as resolved. When no open slot is left today (every slot Taken or Skipped), Today
// shows the "Tudo em dia por hoje" card, and the skipped dose's line sits INSIDE that card — the protocol
// name + "Pulada — você ainda pode registrá-la" + the "Concluir" pill that still logs it. Before the fix the
// caught-up rule read nextDoseAt (Taken only), so a skipped dose kept its card open all day and the day
// never closed. The header count stays truthful ("1 de 2 concluídas": a skip is not a dose taken).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { caughtUpPlan } = require('../lib/dosePageState');

const NOW = new Date(2026, 10, 1, 21, 0).getTime();
const at = (h, m = 0) => new Date(2026, 10, 1, h, m).toISOString();
const bpc = { id: 1, name: 'BPC-157', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', start_date: '2026-10-01', created_at: new Date(2026, 9, 1).toISOString(), active: 1 };
const testo = { id: 2, name: 'Testosterona', interval_days: 7, doses_per_day: 1, reminder_time: '20:00', start_date: '2026-10-11', created_at: new Date(2026, 9, 11).toISOString(), active: 1 };
const twice = { id: 3, name: 'Vit D', interval_days: 1, doses_per_day: 2, reminder_time: '08:00,20:00', start_date: '2026-10-01', created_at: new Date(2026, 9, 1).toISOString(), active: 1 };

test('DV-129: BPC taken, Testosterona skipped → no open card; the skipped line goes inside the caught-up card', () => {
  const logs = [
    { id: 10, protocol_id: 1, outcome: 'Taken', logged_at: at(8, 0) },
    { id: 11, protocol_id: 2, outcome: 'Skipped', logged_at: at(20, 2) },
  ];
  // Today lists Testosterona (nextDoseAt counts Taken only); BPC already advanced to tomorrow.
  const plan = caughtUpPlan({ cards: [testo], logs, nowMs: NOW });
  assert.deepEqual(plan.open, [], 'nothing left to do today: the caught-up card shows');
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].protocol, testo);
  assert.equal(plan.skipped[0].slot.flipRowId, 11, 'its Concluir logs exactly that skipped row');
  assert.equal(plan.skipped[0].slot.canTake, true);
});

test('DV-129: a dose still open keeps its card (no caught-up card)', () => {
  const plan = caughtUpPlan({ cards: [testo], logs: [], nowMs: NOW });
  assert.deepEqual(plan.open, [testo]);
  assert.deepEqual(plan.skipped, []);
});

test('DV-129: twice a day with one slot skipped and one open → the card stays, its skipped line stays on it', () => {
  const logs = [{ id: 20, protocol_id: 3, outcome: 'Skipped', logged_at: at(8, 5) }];
  const plan = caughtUpPlan({ cards: [twice], logs, nowMs: NOW });
  assert.deepEqual(plan.open, [twice]);
  assert.deepEqual(plan.skipped, []);
});

test('DV-129: twice a day, 08:00 taken and 20:00 skipped → caught up, one skipped line', () => {
  const logs = [
    { id: 30, protocol_id: 3, outcome: 'Taken', logged_at: at(8, 1) },
    { id: 31, protocol_id: 3, outcome: 'Skipped', logged_at: at(20, 1) },
  ];
  const plan = caughtUpPlan({ cards: [twice], logs, nowMs: NOW });
  assert.deepEqual(plan.open, []);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].slot.flipRowId, 31);
});

// ── Today wiring ───────────────────────────────────────────────────
const TODAY = fs.readFileSync(path.join(__dirname, '../screens/TodayScreen.js'), 'utf8');

test('DV-129: Today builds its open cards and the caught-up rule from caughtUpPlan (not nextDoseAt alone)', () => {
  assert.match(TODAY, /caughtUpPlan\(\{ cards: dailyOrder\.filter\(p => bucketDay\(p\) <= 0\), logs: todayRows, nowMs: Date\.now\(\) \}\)/);
  assert.match(TODAY, /const todayCards = caught\.open;/);
  assert.match(TODAY, /const allDoneToday = todayCards\.length === 0 && totalCount > 0;/);
});

test('DV-129: the caught-up card holds each skipped line: name, "skipped" text and Mark taken on that row', () => {
  const i = TODAY.indexOf('<View style={s.doneCard}>');
  assert.ok(i > 0);
  const card = TODAY.slice(i, TODAY.indexOf('{takenNames.length > 0', i));
  assert.match(card, /t\('today_all_done'\)/);
  assert.match(card, /caughtSkipped\.map\(/);
  assert.match(card, /t\('today_skipped_today'\)/);
  assert.match(card, /handleTake\(sp\.protocol, null, 0, \{ slot: sp\.slot \}\)/);
  assert.match(card, /t\('today_mark_taken'\)/);
  assert.match(card, /sp\.slot\.canTake/);
});

test('DV-129: the header count still counts Taken doses only', () => {
  assert.match(TODAY, /const doneDoses = dueProtocols\.reduce\(\(sum, p\) => sum \+ Math\.min\(takenCounts\[p\.id\] \|\| 0, expectedDosesOn\(p, todayDate\)\), 0\);/);
});

test('DV-129: the caught-up card styles use theme tokens only (column card, row for the check)', () => {
  const style = (name) => { const m = new RegExp(`\\b${name}: \\{([^}]*)\\}`).exec(TODAY); return m ? m[1] : ''; };
  assert.match(style('doneCard'), /backgroundColor: c\.raised/);
  assert.match(style('doneRow'), /flexDirection: 'row'/);
  assert.match(style('doneSkip'), /borderTopColor: c\.line/);
  for (const n of ['doneCard', 'doneRow', 'doneSkip', 'doneSkipText', 'doneSkipName']) {
    assert.doesNotMatch(style(n), /#[0-9a-fA-F]{3,8}|'white'|'black'|rgba\(/, `${n} has no raw colour`);
  }
});
