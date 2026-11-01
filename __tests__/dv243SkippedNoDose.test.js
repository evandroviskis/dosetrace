'use strict';
// DV-243 journey review F2: a Skipped row can also become "Não houve dose" (AD-97). A 1.3.0 user who
// turned false Missed rows into Skipped (the only way out then) is otherwise stuck with them. The dose
// sheet of a Skipped row offers, in this order: Mark taken (primary), the short explanation line,
// "Não houve dose", Delete. The write is the Missed sheet's own path (setMissedOutcome(log, NO_DOSE) →
// the same row's outcome; nothing deleted).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'LogScreen.js'), 'utf8');

test('F2: the Skipped sheet offers "Não houve dose" after Mark taken, before Delete, with its line', () => {
  const a = src.indexOf("{shownSheet.outcome === 'Skipped' && (");
  assert.ok(a > 0, 'the Skipped block');
  const block = src.slice(a, src.indexOf('</Pressable>', a));
  const take = block.indexOf("t('log_mark_taken')");
  const line = block.indexOf("t('log_skipped_no_dose').replace('{action}', t('log_no_dose'))");
  const nd = block.indexOf("onPress={() => noDoseFromSheet(shownSheet)}");
  const del = block.indexOf("t('log_delete_dose')");
  assert.ok(take > 0 && line > take && nd > line && del > nd, 'order: mark taken, line, no dose, delete');
  assert.match(block, /noDoseFromSheet\(shownSheet\)\}[^>]*>\s*<Text style=\{s\.noDoseBtnText\}>\{t\('log_no_dose'\)\}<\/Text>/);
});

test('F2: the write is the Missed sheet\'s path — the same row becomes NoDose, after the sheet leaves', () => {
  const fn = src.slice(src.indexOf('function noDoseFromSheet('), src.indexOf('function askDelete('));
  assert.match(fn, /leaveSheetThen\(\(\) => \{ releasePopup\(\); setMissedOutcome\(log, NO_DOSE\); \}\)/);
  const set = src.slice(src.indexOf('function setMissedOutcome('), src.indexOf('function markRowTaken('));
  assert.match(set, /writeOutcome\(log\.id, \{ outcome \}\)/);
});

test('F2: the sheet colours come from theme tokens', () => {
  assert.match(src, /noDoseBtn: \{[^}]*backgroundColor: c\.well[^}]*\}/);
  assert.match(src, /noDoseBtnText: \{[^}]*color: c\.ink[^}]*\}/);
  assert.match(src, /noDoseNote: \{[^}]*color: c\.ink2[^}]*\}/);
});

test('F2: a Skipped row turned "no dose" leaves the report\'s skipped count and the adherence %', () => {
  const { adherenceStats } = require('../lib/adherenceReport');
  const iso = (d) => new Date(2026, 9, d, 8, 0, 0, 0).toISOString();
  const protocols = [{ id: 1, start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: new Date(2026, 8, 1, 7).toISOString() }];
  const make = (outcome) => ({
    protocols,
    logs: [...[20, 21, 22, 23, 24, 26].map((d) => ({ protocol_id: 1, outcome: 'Taken', logged_at: iso(d) })), { protocol_id: 1, outcome, logged_at: iso(25) }],
    sinceMs: new Date(2026, 9, 20, 0).getTime(),
    nowMs: new Date(2026, 9, 26, 12).getTime(),
  });
  const a = adherenceStats(make('Skipped'));
  const b = adherenceStats(make('NoDose'));
  assert.equal(a.overall.skipped, 1);
  assert.equal(b.overall.skipped, 0);
  assert.equal(a.overall.adherence, 86); // 6 of 7
  assert.equal(b.overall.adherence, 100); // 6 of 6
});

test('F2: the line, natural in 6 languages', () => {
  const { translations } = require('../i18n/translations.js');
  assert.equal(translations.en.log_skipped_no_dose, 'If there was no dose to take (for example, the protocol hadn\'t started yet), mark “{action}”: it stops counting as skipped.');
  assert.equal(translations.pt.log_skipped_no_dose, 'Se não havia dose para tomar (por exemplo, o protocolo ainda não tinha começado), marque “{action}”: ela deixa de contar como pulada.');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.match(translations[l].log_skipped_no_dose || '', /\{action\}/, l);
});
