'use strict';
// DV-244 (docs/product/DIVERGENCES.md, journey review 2026-10-25) and A-182 (docs/review/features.md,
// founder-approved 2026-10-25), both in the Missed scan (lib/missedDoses.js).
//
// DV-244: past slots are rebuilt from the CURRENT protocol row, so an edit of the times, the
// frequency or the start date made the scan write Missed rows for up to 14 past days that were not
// dose days under the schedule in force then (daily -> twice daily: 14 false Missed; a weekly dose
// moved Monday -> Wednesday: 2). Fix: the scan never writes a Missed for a slot before the moment
// this phone knows the current schedule took effect (opts.scheduleSince, the same per-protocol
// ledger the A-123 cleanup uses: lib/doseActions observeSchedules / noteSchedules).
//
// A-182: a weekly (any interval > 1 day) dose taken a day late showed Missed on the scheduled day
// plus Taken the next day. Founder: a late dose covers its own slot when no nearer slot claims it —
// the F1 "late same day" pass reaches, for non-daily protocols, until the next slot's own window.
// An app Missed row already written for such a slot goes once the late dose is there (A-123 cleanup,
// same certainty rules: schedule known unchanged, the scan would not write it back).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const MD = require('../lib/missedDoses');

const DAY = 86400000;
const D = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime(); // October 2026, device local
const iso = (ms) => new Date(ms).toISOString();
const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const ZONES = [null, [{ tz: deviceTz(), sinceMs: D(1, 0) - 30 * DAY }]];
const scan = (protocols, logs, now, opts = {}) => MD.computeMissedDoses(protocols, logs, now, -Infinity, { lookbackDays: 14, ...opts }).map((m) => m.scheduledAtMs);
const taken = (ms, id) => ({ id, protocol_id: 1, outcome: 'Taken', logged_at: iso(ms) });

// ── DV-244 ──────────────────────────────────────────────────────────────────────────────────────

test('DV-244: daily -> twice daily, every past dose taken -> no Missed before the edit', () => {
  const now = D(20, 12);
  const editMs = D(20, 9);
  // Under the old schedule (08:00 once a day) every dose of the last 14 days was taken.
  const logs = [];
  for (let d = 5; d <= 19; d++) logs.push(taken(D(d, 8, 5)));
  const p = { id: 1, user_id: 'u', created_at: iso(D(1, 7)), updated_at: iso(editMs), start_date: '2026-10-01', interval_days: 1, doses_per_day: 2, reminder_time: '08:00,20:00' };
  for (const zoneHistory of ZONES) {
    const o = zoneHistory ? { zoneHistory } : {};
    assert.equal(scan([p], logs, now, o).length, 14, 'the defect: without the floor every evening becomes a false Missed');
    assert.deepEqual(scan([p], logs, now, { ...o, scheduleSince: { 1: editMs } }), [], 'with the floor: none before the edit');
  }
});

test('DV-244: a weekly dose moved Monday -> Wednesday -> no Missed on the old Wednesdays', () => {
  // Weekly, taken every Monday (Oct 5, 12). On Thursday Oct 15 the start date moves to Wednesday
  // Oct 7. (The Wednesday of Oct 7 is covered by the Monday after it, A-182; Oct 14 is not.)
  assert.equal(new Date(D(5, 0)).getDay(), 1, 'Oct 5 2026 is a Monday');
  const now = D(15, 12);
  const editMs = D(15, 10);
  const logs = [taken(D(5, 9)), taken(D(12, 9))];
  const p = { id: 1, user_id: 'u', created_at: iso(D(1, 7)), updated_at: iso(editMs), start_date: '2026-10-07', interval_days: 7, doses_per_day: 1, reminder_time: '09:00' };
  for (const zoneHistory of ZONES) {
    const o = zoneHistory ? { zoneHistory } : {};
    assert.ok(scan([p], logs, now, o).includes(D(14, 9)), 'the defect: a Wednesday that was not a dose day becomes Missed');
    assert.deepEqual(scan([p], logs, now, { ...o, scheduleSince: { 1: editMs } }), [], 'with the floor: none');
  }
});

test('DV-244: slots after the edit are judged as before (a real miss under the new schedule is written)', () => {
  const now = D(20, 12);
  const editMs = D(17, 9);
  const logs = [];
  for (let d = 5; d <= 19; d++) logs.push(taken(D(d, 8, 5)));
  const p = { id: 1, user_id: 'u', created_at: iso(D(1, 7)), start_date: '2026-10-01', interval_days: 1, doses_per_day: 2, reminder_time: '08:00,20:00' };
  for (const zoneHistory of ZONES) {
    const o = zoneHistory ? { zoneHistory } : {};
    assert.deepEqual(scan([p], logs, now, { ...o, scheduleSince: { 1: editMs } }), [D(17, 20), D(18, 20), D(19, 20)], 'evenings after the edit are real misses');
  }
});

test('DV-244: scheduleSince passed but nothing known for the protocol -> no new Missed row', () => {
  const p = { id: 1, user_id: 'u', created_at: iso(D(1, 7)), start_date: '2026-10-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00' };
  assert.ok(scan([p], [], D(20, 12)).length > 0, 'left out (other callers): as before');
  assert.deepEqual(scan([p], [], D(20, 12), { scheduleSince: {} }), []);
});

test('DV-244: scanMissedDoses passes the schedule ledger to the scan', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/doseActions.js'), 'utf8');
  const body = src.slice(src.indexOf('export async function scanMissedDoses'));
  const call = body.slice(body.indexOf('computeMissedDoses(protocols, kept'));
  assert.match(call.slice(0, call.indexOf(';')), /scheduleSince/);
  assert.ok(body.indexOf('const scheduleSince = await observeSchedules(') < body.indexOf('computeMissedDoses(protocols, kept'), 'the ledger is read first');
});

// ── A-182 ───────────────────────────────────────────────────────────────────────────────────────

const WEEKLY = { id: 1, user_id: 'u', created_at: iso(D(1, 7)), start_date: '2026-10-05', interval_days: 7, doses_per_day: 1, reminder_time: '08:00' };

test('A-182: a weekly dose taken a day late covers its slot (no Missed next to the Taken)', () => {
  const p = { ...WEEKLY, start_date: '2026-10-12' };
  for (const zoneHistory of ZONES) {
    const o = zoneHistory ? { zoneHistory } : {};
    assert.deepEqual(scan([p], [taken(D(13, 10))], D(15, 12), o), [], 'Mon 12 08:00 taken Tue 13 10:00');
    assert.deepEqual(scan([p], [taken(D(18, 21))], D(19, 6), o), [], 'six days late, before the next dose day: still its own');
    assert.deepEqual(scan([p], [], D(15, 12), o), [D(12, 8)], 'nothing logged: Missed');
    assert.deepEqual(scan([WEEKLY], [taken(D(13, 10))], D(15, 12), o), [D(5, 8)], 'the dose covers its own week only');
  }
});

test('A-182: a log a nearer slot claims is not taken from it (next dose day, past or today)', () => {
  for (const zoneHistory of ZONES) {
    const o = zoneHistory ? { zoneHistory } : {};
    // Next Monday is past: its own early log (07:00 that day) is its dose; the Monday before stays Missed.
    assert.deepEqual(scan([WEEKLY], [taken(D(12, 7))], D(13, 12), o), [D(5, 8)]);
    // Next Monday is today: the 07:00 log today is today's dose, never last week's.
    assert.deepEqual(scan([WEEKLY], [taken(D(12, 7))], D(12, 12), o), [D(5, 8)]);
  }
});

test('A-182: every 2 days, twice a day -> the next-day log covers the evening dose, not the morning one', () => {
  const p = { ...WEEKLY, interval_days: 2, doses_per_day: 2, reminder_time: '08:00,20:00', start_date: '2026-10-11' };
  for (const zoneHistory of ZONES) {
    const o = zoneHistory ? { zoneHistory } : {};
    assert.deepEqual(scan([p], [taken(D(12, 10))], D(13, 7), o), [D(11, 8)]);
  }
});

test('A-182: daily protocols are unchanged (a log after midnight is the next day\'s dose)', () => {
  const p = { ...WEEKLY, interval_days: 1, start_date: '2026-10-01' };
  assert.deepEqual(scan([p], [taken(D(11, 1)), taken(D(12, 8))], D(13, 12), { lookbackDays: 3 }), [D(10, 8)]);
});

test('A-182: an app Missed row already written goes once the late weekly dose is there', () => {
  const now = D(15, 12);
  const missed = { id: 'M', protocol_id: 1, outcome: 'Missed', logged_at: iso(D(12, 8)) };
  const logs = [missed, taken(D(13, 10), 'T')];
  const p = { ...WEEKLY, updated_at: iso(D(1, 7)) };
  for (const zoneHistory of ZONES) {
    const o = { lookbackDays: 14, ...(zoneHistory ? { zoneHistory } : {}) };
    assert.deepEqual(MD.coveredMissedRows([p], logs, now, { ...o, scheduleSince: { 1: D(1, 7) } }).map((r) => r.id), ['M']);
    // The schedule was edited after that day: nothing certain, the row stays.
    assert.deepEqual(MD.coveredMissedRows([p], logs, now, { ...o, scheduleSince: { 1: D(14, 9) } }), []);
    // The dose belongs to the next slot (its own day, before it): the earlier Missed row stays.
    const claimed = [{ ...missed, logged_at: iso(D(5, 8)) }, taken(D(12, 7), 'T')];
    assert.deepEqual(MD.coveredMissedRows([p], claimed, D(13, 12), { ...o, scheduleSince: { 1: D(1, 7) } }), []);
    // A daily protocol keeps the A-123 same-day rule: a dose the next morning removes nothing.
    const daily = { ...p, interval_days: 1, start_date: '2026-10-01' };
    assert.deepEqual(MD.coveredMissedRows([daily], [missed, taken(D(13, 1), 'T')], D(13, 12), { ...o, scheduleSince: { 1: D(1, 7) } }), []);
  }
});
