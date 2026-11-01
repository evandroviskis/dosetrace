'use strict';
// DV-243 (AD-97, Q18 = B; picture docs/design/rodada1-hoje-registro.html #dv243, founder go 2026-11-01):
// a dose the app marked Missed for a slot that had no dose (a protocol that had not started, a
// time-zone slip) can be marked "Não houve dose" in the Dose log. The row stays (nothing deleted,
// synced as outcome 'NoDose'), shows a grey dot and word, is listed under "All" only, and is never
// counted: the Missed scan never writes that slot again, adherence (rings, report) drops the slot,
// the report's missed count drops by one, and streaks neither break nor grow on it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const OLD = '2020-01-01T08:00:00';
const at = (s) => new Date(s).getTime();
const proto = (o = {}) => ({ id: 1, user_id: 'u1', remote_id: null, start_date: '2024-01-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: OLD, ...o });

test('DV-243: a Missed row marked "Não houve dose" → the next scan writes no new Missed for that slot', () => {
  const { computeMissedDoses } = require('../lib/missedDoses');
  const { NO_DOSE } = require('../lib/noDose');
  assert.equal(NO_DOSE, 'NoDose');
  const now = at('2024-06-20T12:00:00');
  const slot = new Date('2024-06-19T08:00:00').toISOString();
  const before = computeMissedDoses([proto()], [], now, 0, { lookbackDays: 1 });
  assert.deepEqual(before.map((m) => m.scheduledAtMs), [at(slot)]);
  // The scan wrote it; the person marks it "no dose": same row, same time, outcome NoDose.
  const rows = [{ id: 7, protocol_id: 1, outcome: NO_DOSE, logged_at: slot }];
  assert.deepEqual(computeMissedDoses([proto()], rows, now, 0, { lookbackDays: 1 }), []);
});

test('DV-243: a "no dose" row answers its OWN slot, never an earlier one (two doses a day)', () => {
  const { computeMissedDoses } = require('../lib/missedDoses');
  const p = proto({ doses_per_day: 2, reminder_time: '08:00,20:00' });
  const now = at('2024-06-20T12:00:00');
  // Only the 20:00 slot was marked "no dose"; 08:00 has nothing. The 20:00 row is 12 h after 08:00,
  // inside 08:00's covering window — it must still answer 20:00, so the scan owes 08:00 only.
  const rows = [{ id: 8, protocol_id: 1, outcome: 'NoDose', logged_at: new Date('2024-06-19T20:00:00').toISOString() }];
  const missed = computeMissedDoses([p], rows, now, 0, { lookbackDays: 1 });
  assert.deepEqual(missed.map((m) => m.scheduledAtMs), [at('2024-06-19T08:00:00')]);
});

test('DV-243: the scan clean-ups never remove a "no dose" row (nothing deleted)', () => {
  const m = require('../lib/missedDoses');
  const p = proto();
  const now = at('2024-06-20T12:00:00');
  const nd = { id: 9, protocol_id: 1, outcome: 'NoDose', logged_at: new Date('2024-06-19T08:00:00').toISOString(), sync_status: 'synced', updated_at: '2024-06-19T21:00:00Z' };
  const taken = { id: 10, protocol_id: 1, outcome: 'Taken', logged_at: new Date('2024-06-19T09:00:00').toISOString() };
  const twin = { ...nd, id: 11 };
  assert.deepEqual(m.notYetDueMissedRows([nd], at('2024-06-19T09:00:00')), []);
  assert.deepEqual(m.duplicateMissedRows([nd, twin], [p]), []);
  assert.deepEqual(m.falseMissedRows([p], [nd, taken], now), []);
  assert.deepEqual(m.coveredMissedRows([p], [nd, taken], now, { lookbackDays: 3, scheduleSince: { 1: 0 } }), []);
});

function reportFixture(outcome) {
  const HOUR = 3600000;
  const iso = (d, h = 8) => new Date(2026, 9, d, h, 0, 0, 0).toISOString();
  const protocols = [{ id: 1, name: 'BPC-157', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: new Date(2026, 8, 1, 7).toISOString() }];
  const logs = [
    ...[20, 21, 22, 23].map((d) => ({ protocol_id: 1, outcome: 'Taken', logged_at: iso(d) })),
    { protocol_id: 1, outcome: 'Missed', logged_at: iso(24) },
    { protocol_id: 1, outcome, logged_at: iso(25) },
  ];
  const nowMs = new Date(2026, 9, 26, 12).getTime();
  return { protocols, logs, sinceMs: new Date(2026, 9, 20, 0).getTime(), nowMs, HOUR };
}

test('DV-243: the provider report counts one miss fewer, and the slot leaves the adherence %', () => {
  const { adherenceStats } = require('../lib/adherenceReport');
  const a = adherenceStats(reportFixture('Missed'));
  const b = adherenceStats(reportFixture('NoDose'));
  assert.equal(a.overall.missed, 2);
  assert.equal(b.overall.missed, 1);
  assert.equal(b.overall.total, a.overall.total - 1);
  // 4 taken of 7 scheduled (20–26 Oct) → 57 %; with one slot answered "no dose": 4 of 6 → 67 %.
  assert.equal(a.overall.adherence, 57);
  assert.equal(b.overall.adherence, 67);
});

test('DV-243: the rings (Today, the 30-day %) drop the slot answered "no dose"', () => {
  const { slotCounts } = require('../lib/adherenceRings');
  const f = reportFixture('NoDose');
  const g = reportFixture('Missed');
  const a = slotCounts(g.protocols, g.logs, g.sinceMs, g.nowMs)[1];
  const b = slotCounts(f.protocols, f.logs, f.sinceMs, f.nowMs)[1];
  assert.equal(b.due, a.due - 1);
  assert.equal(b.taken, a.taken);
});

test('DV-243: a day answered "no dose" neither breaks nor adds to the dose streak', () => {
  const { reportStreaks } = require('../lib/doseStreak');
  const p = { id: 1, start_date: '2026-10-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: new Date(2026, 9, 1, 7).toISOString() };
  const now = new Date(2026, 9, 10, 12);
  const day = (d) => new Date(2026, 9, d, 8).toISOString();
  const taken = [5, 6, 7, 9, 10].map((d) => ({ protocol_id: 1, outcome: 'Taken', logged_at: day(d) }));
  // 8 Oct has no Taken: the streak stops there (today + 9 Oct = 2 doses).
  assert.equal(reportStreaks([p], taken, now)[1], 2);
  // 8 Oct answered "no dose": it is skipped like a rest day → 10, 9, 7, 6, 5 = 5 doses.
  const withNoDose = [...taken, { protocol_id: 1, outcome: 'NoDose', logged_at: day(8) }];
  assert.equal(reportStreaks([p], withNoDose, now)[1], 5);
  // The streak readers pass the "no dose" rows to reportStreaks (Today's cards and the report).
  assert.match(read('lib/database.js'), /export function getTakenLogsSince[\s\S]{0,400}outcome IN \('Taken', 'NoDose'\)/);
});

test('DV-243: the Dose log counts never count a "no dose" row as missed', () => {
  const { outcomeCounts } = require('../lib/declared');
  const c = outcomeCounts([{ outcome: 'Missed', logged_at: OLD }, { outcome: 'NoDose', logged_at: OLD }]);
  assert.deepEqual(c, { Taken: 0, Skipped: 0, Missed: 1 });
});

test('DV-243: synced as its own outcome, without a dose amount', () => {
  const { toCloudPayload } = require('../lib/syncMappers');
  const p = toCloudPayload('dose_logs', { outcome: 'NoDose', logged_at: '2024-06-19T12:00:00.000Z', dose_amount: null, protocol_remote_id: 'p-1', user_id: 'u1' });
  assert.equal(p.outcome, 'NoDose');
  assert.equal(p.dose_amount ?? null, null);
});

test('DV-243: the curve treats a "no dose" row like the Missed row it was (it answers the slot, adds no dose)', () => {
  assert.match(read('lib/serumModel.js'), /const CLOSING = \{[^}]*NoDose: true[^}]*\}/);
});

test('DV-243: the Missed sheet offers "Não houve dose" after "Marcar como pulada", before "Cancelar"', () => {
  const src = read('screens/LogScreen.js');
  const fn = src.slice(src.indexOf('function openMissedEditor('), src.indexOf('function setMissedOutcome('));
  const i = fn.indexOf("label: t('log_mark_skipped')");
  const j = fn.indexOf("label: t('log_no_dose')");
  const k = fn.indexOf("label: t('cancel')");
  assert.ok(i > 0 && j > i && k > j, 'order: skipped, no dose, cancel');
  assert.match(fn, /label: t\('log_no_dose'\), kind: 'secondary', onPress: \(\) => setMissedOutcome\(log, NO_DOSE\)/);
  assert.match(fn, /t\('log_missed_edit_msg'\)[\s\S]*t\('log_missed_edit_no_dose'\)/);
});

test('DV-243: the row is grey (ink3), its own word, listed under "All" only', () => {
  const src = read('screens/LogScreen.js');
  assert.match(src, /if \(outcome === NO_DOSE\) return colors\.ink3;/);
  assert.match(src, /if \(outcome === NO_DOSE\) return t\('log_no_dose'\);/);
  // The filters stay Taken / Skipped / Missed: a NoDose row matches none of them, only "All".
  assert.match(src, /if \(filter === 'All'\) return true;\s*return l\.outcome === filter;/);
  assert.doesNotMatch(src, /key: NO_DOSE/);
  // No delete for it (the scan would write the Missed back): nothing deleted.
  assert.match(src, /shownSheet\.outcome !== NO_DOSE && \(\s*<TouchableOpacity style=\{s\.dangerBtn\}/);
});

test('DV-243: the words, natural in 6 languages (pt as in the picture)', () => {
  const { translations } = require('../i18n/translations.js');
  assert.equal(translations.pt.log_no_dose, 'Não houve dose');
  assert.equal(translations.pt.log_missed_edit_no_dose, 'Se não havia dose para tomar (por exemplo, o protocolo ainda não tinha começado), marque “{action}”: ela deixa de contar como perdida.');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.ok(translations[l].log_no_dose, l);
    assert.match(translations[l].log_missed_edit_no_dose, /\{action\}/, l);
  }
  const src = read('screens/LogScreen.js');
  assert.match(src, /t\('log_missed_edit_no_dose'\)\.replace\('\{action\}', t\('log_no_dose'\)\)/);
});

test('DV-243: Today\'s day streak and week dots do not owe a slot answered "no dose" (lib/trackerStreak, DV-034)', () => {
  const { trackerStreak } = require('../lib/trackerStreak');
  const now = new Date(2026, 10, 1, 21, 0);
  const day = (i, h) => { const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(h, 0, 0, 0); return d.toISOString(); };
  const p = { id: 1, active: 1, interval_days: 1, doses_per_day: 1, start_date: '2026-10-20', created_at: '2026-10-20T08:00:00.000Z' };
  const logs = [];
  for (let i = 0; i <= 5; i++) if (i !== 3) logs.push({ protocol_id: 1, outcome: 'Taken', logged_at: day(i, 8) });
  const missedDay = trackerStreak({ protocols: [p], takenLogs: logs, now });
  assert.equal(missedDay.streak, 3, 'day 3 with nothing breaks the streak');
  logs.push({ protocol_id: 1, outcome: 'NoDose', logged_at: day(3, 8), slot_at: day(3, 8) });
  const answered = trackerStreak({ protocols: [p], takenLogs: logs, now });
  assert.ok(answered.streak > 3, 'a day answered "no dose" is not owed: it neither breaks nor counts as a miss');
  assert.equal(answered.weekDots.find((d, i) => i === 3).status, 'rest');
  assert.match(read('screens/TodayScreen.js'), /trackerStreak\(\{ protocols: activeProtocols, takenLogs: logs, now \}\)/);
});
