'use strict';
// A-30, option C (founder 2026-09-27): history from BEFORE a protocol was added to the app is
// declared, never logged. (a) The curve keeps drawing it from the start date, marked as estimated
// with a fixed translated label. (b) Adherence, both streaks and the Log counts count only doses
// logged in the app: a row dated before the protocol existed (created_at − 1 h, the A-32 grace) is
// declared. (c) The backfill dialog that wrote such rows as real Taken doses is gone; adding a
// protocol with a past start asks "Same dose for the last N weeks?" (N ≈ 5 half-lives, never
// longer than since the start; skipped under a 1-day half-life) and writes no dose. "No" keeps
// the curve from drawing before today (protocols.history_from, an optional synced column).
// (d) The new flow never touches vials or oral units. (e) Existing backfilled rows need no tag:
// they are dated before their protocol existed, so the same rule finds every one, on every device
// once created_at syncs (it now goes in the protocols payload).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../lib/declared');
const { adherenceStats } = require('../lib/adherenceReport');
const { adherenceRings } = require('../lib/adherenceRings');
const { scheduledDoses, estimatedBeforeMs } = require('../lib/serumModel');
const { toCloudPayload, OPTIONAL_COLUMNS } = require('../lib/syncMappers');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const DAY = 86400000;
const created = '2026-10-01T15:00:00.000Z';
const p = { id: 1, user_id: 'u1', type: 'rtu', compound_id: 'tirzepatide', name: 'Tirzepatide', dose: '5', dose_unit: 'mg', start_date: '2026-09-10', interval_days: 7, doses_per_day: 1, reminder_time: '09:00', created_at: created, active: 1 };
const declaredRow = { protocol_id: 1, outcome: 'Taken', logged_at: '2026-09-24T09:00:00.000Z' };
const graceRow = { protocol_id: 1, outcome: 'Taken', logged_at: '2026-10-01T14:30:00.000Z' }; // a Missed slot minutes before creation, fixed to Taken
const realRow = { protocol_id: 1, outcome: 'Taken', logged_at: '2026-10-02T09:05:00.000Z' };

test('(b) declared = dated before the protocol existed (created_at − 1 h); the creation grace stays logged', () => {
  assert.equal(D.isDeclared(declaredRow, created), true);
  assert.equal(D.isDeclared(graceRow, created), false);
  assert.equal(D.isDeclared(realRow, created), false);
  assert.equal(D.isDeclared(declaredRow, null), false, 'no creation time → never hidden');
  assert.deepEqual(D.loggedOnly([declaredRow, graceRow, realRow], [p]), [graceRow, realRow]);
  const rows = [{ ...declaredRow, protocol_created_at: created }, { ...realRow, protocol_created_at: created }, { outcome: 'Missed', logged_at: '2026-10-03T09:00:00Z', protocol_created_at: created }];
  assert.deepEqual(D.outcomeCounts(rows), { Taken: 1, Skipped: 0, Missed: 1 });
});

test('(b) the adherence report and the rings count only logged doses and only days after the protocol was added', () => {
  const s = adherenceStats({ protocols: [p], logs: [declaredRow, realRow, { ...declaredRow, outcome: 'Skipped', logged_at: '2026-09-17T09:00:00Z' }], sinceMs: Date.parse('2026-09-03T00:00:00Z'), nowMs: Date.parse('2026-10-03T00:00:00Z') });
  assert.equal(s.overall.taken, 1);
  assert.equal(s.overall.skipped, 0);
  const r = adherenceRings({ protocols: [p], logs: [declaredRow], nowMs: Date.parse('2026-10-03T12:00:00Z') });
  assert.ok(r.month.due <= 1, `the September slots before it was added are not due (due ${r.month.due})`);
  assert.equal(r.month.taken, 0, 'a declared row never counts as taken');
  const p2 = { ...p, interval_days: 1 };
  const r2 = adherenceRings({ protocols: [p2], logs: [declaredRow, realRow], nowMs: Date.parse('2026-10-03T12:00:00Z') });
  assert.ok(r2.month.due <= 3, `only Oct 1 (after creation)…Oct 3 are due, not September (due ${r2.month.due})`);
  assert.equal(r2.month.taken, 1);
});

test('(b) the streaks, the report streak and both Log counts use the logged rows only', () => {
  const today = read('screens/TodayScreen.js');
  assert.match(today, /loggedOnly\(getLogsSince\(user\.id, thirtyDaysAgo\.toISOString\(\)\) \|\| \[\], activeProtocols\)/);
  assert.match(today, /loggedOnly\(getTakenLogsSince\(user\.id, thirtyDaysAgo\.toISOString\(\)\) \|\| \[\], activeProtocols\)/);
  assert.match(read('screens/SettingsScreen.js'), /const pLogs = loggedOnly\(logs, \[p\]\)\.filter/);
  assert.match(read('screens/ProtocolsScreen.js'), /setLogCounts\(outcomeCounts\(logs\)\)/);
  assert.match(read('screens/LogScreen.js'), /const counted = outcomeCounts\(logs\);/);
  assert.match(read('lib/protocolEnd.js'), /p\.created_at as protocol_created_at/);
});

test('(c) the question: N ≈ 5 half-lives, never longer than since the start, skipped under a 1-day half-life', () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  assert.deepEqual(D.historyQuestion({ ...p, start_date: '2026-06-01' }, now), { unit: 'weeks', n: 4 }, 'tirzepatide t½ 5 d → 25 d ≈ 4 weeks');
  assert.deepEqual(D.historyQuestion({ ...p, start_date: '2026-09-26' }, now), { unit: 'days', n: 7 }, 'started 7 days ago');
  assert.equal(D.historyQuestion({ ...p, compound_id: 'bpc157', name: 'BPC-157' }, now), null, 't½ under a day');
  assert.equal(D.historyQuestion({ ...p, start_date: '2026-10-03' }, now), null, 'starts today');
  assert.equal(D.historyQuestion({ ...p, compound_id: null, name: 'My own blend' }, now), null, 'no half-life data → no curve → no question');
  const und = D.historyQuestion({ ...p, compound_id: null, name: 'Testosterone Undecanoate', start_date: '2024-01-01' }, now);
  assert.deepEqual(und, { unit: 'weeks', n: 64 }, 'the long depot: 5 × 90 d');
});

test('(c) "No" keeps the curve from drawing before the protocol was added; "Yes" draws from the start date', () => {
  const entry = { hours: 120 };
  const now = Date.parse('2026-10-03T12:00:00Z');
  const start = now - 40 * DAY;
  const all = scheduledDoses(p, entry, start, now, now);
  const cut = scheduledDoses({ ...p, history_from: '2026-10-01' }, entry, start, now, now);
  assert.ok(all.some((d) => d < Date.parse(created)));
  assert.ok(cut.every((d) => d >= new Date(2026, 9, 1).getTime()));
});

test('(a) the curve marks the part before the protocol was added (the latest creation among the lines, inside the window)', () => {
  const winStart = Date.parse('2026-09-01T00:00:00Z');
  assert.equal(estimatedBeforeMs([p], winStart), Date.parse(created));
  assert.equal(estimatedBeforeMs([{ ...p, start_date: '2026-10-01' }], winStart), null, 'started the day it was added');
  assert.equal(estimatedBeforeMs([{ ...p, history_from: '2026-10-01' }], winStart), null, '"No": nothing drawn before');
  assert.equal(estimatedBeforeMs([p], Date.parse('2026-10-02T00:00:00Z')), null, 'outside the window');
  const s = read('screens/SerumCurveScreen.js');
  assert.match(s, /estimatedBeforeMs\(/);
  assert.match(s, /t\('curve_estimated_before'\)/);
});

test('(e) sync: created_at goes up (the device\'s own creation time), history_from is an optional column', () => {
  const row = { name: 'x', active: 1, created_at: created, history_from: '2026-10-01' };
  const pay = toCloudPayload('protocols', row);
  assert.equal(pay.created_at, created);
  assert.equal(pay.history_from, '2026-10-01');
  assert.ok(!('history_from' in toCloudPayload('protocols', { ...row, history_from: null })));
  assert.ok(OPTIONAL_COLUMNS.protocols.includes('history_from'));
  const dir = path.join(__dirname, '../supabase/migrations');
  const f = fs.readdirSync(dir).find((n) => /protocol_history_from/.test(n));
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  assert.match(sql, /alter table public\.protocols add column if not exists history_from date;/i);
  assert.doesNotMatch(sql, /update |delete |drop /i);
});

test('(c)(d) the add flow writes no dose and never touches vials; the old backfill is gone', () => {
  assert.doesNotMatch(read('lib/doseActions.js'), /backfillTakenDoses/);
  const prot = read('screens/ProtocolsScreen.js');
  assert.doesNotMatch(prot, /backfillTakenDoses|protocols_backfill_/);
  const i = prot.indexOf('const hq = historyQuestion(');
  assert.ok(i > 0, 'the add flow asks the question');
  const block = prot.slice(i, i + 1600);
  assert.match(block, /updateProtocol\(newId, \{ history_from: /);
  assert.doesNotMatch(block, /insertDoseLog|updateVial|units_taken/);
});

test('the strings exist in six languages (singular and plural), the old backfill strings are removed', () => {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    const tr = mod.exports.translations[l];
    for (const k of ['protocols_history_weeks', 'protocols_history_weeks_one', 'protocols_history_days', 'protocols_history_days_one', 'protocols_history_body', 'protocols_history_yes', 'protocols_history_no', 'curve_estimated_before']) assert.ok(tr[k], `${l} ${k}`);
    assert.match(tr.protocols_history_weeks, /\{n\}/, l);
    assert.match(tr.curve_estimated_before, /\{date\}/, l);
    assert.equal(tr.protocols_backfill_title, undefined, `${l} old string removed`);
  }
});
