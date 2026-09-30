'use strict';
// A-40 (S-17), founder option 1 "Pending from yesterday" (docs/review/features.md A-40):
// after midnight, yesterday's un-logged slots stay on Today until slot + 12 h (the
// Missed scan's LATE_MS — after that the scan writes a Missed row the Dose log can
// edit). A slot counts as logged when a row of ANY outcome covers it, using the
// same matching as the Missed scan (lib/missedDoses.js), so the block and the scan
// never disagree. Display only; no schema change.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pendingFromYesterday } = require('../lib/pendingYesterday');
const { computeMissedDoses } = require('../lib/missedDoses');

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const iso = (ms) => new Date(ms).toISOString();
const created = iso(local(2026, 9, 1, 7, 0));
const daily = (over = {}) => ({ id: 1, user_id: 'u1', name: 'AOD', active: 1, start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '20:00', created_at: created, ...over });
const log = (outcome, ms, pid = 1) => ({ protocol_id: pid, outcome, logged_at: iso(ms) });
const NOW = local(2026, 9, 28, 7, 0); // yesterday = Sep 27

test('A-40: yesterday 20:00 not logged, now 07:00 → pending at yesterday\'s slot time', () => {
  const p = pendingFromYesterday({ protocols: [daily()], logs: [], nowMs: NOW });
  assert.equal(p.length, 1);
  assert.equal(p[0].protocolId, 1);
  assert.equal(p[0].dayKey, '2026-09-27');
  assert.equal(p[0].slotMs, local(2026, 9, 27, 20, 0));
});

test('A-40: at or after slot + 12 h the slot leaves the block (the Missed scan owns it from then)', () => {
  assert.equal(pendingFromYesterday({ protocols: [daily()], logs: [], nowMs: local(2026, 9, 28, 8, 0) }).length, 0);
  assert.equal(pendingFromYesterday({ protocols: [daily()], logs: [], nowMs: local(2026, 9, 28, 7, 59) }).length, 1);
});

test('A-40: never twice — a slot covered by a row of ANY outcome is not pending', () => {
  for (const outcome of ['Taken', 'Skipped', 'Missed']) {
    const p = pendingFromYesterday({ protocols: [daily()], logs: [log(outcome, local(2026, 9, 27, 20, 0))], nowMs: NOW });
    assert.equal(p.length, 0, outcome);
  }
});

test('A-40: a dose already logged just after midnight (old behaviour) covers last night\'s slot → not pending', () => {
  const p = pendingFromYesterday({ protocols: [daily()], logs: [log('Taken', local(2026, 9, 28, 0, 30))], nowMs: NOW });
  assert.equal(p.length, 0);
});

test('A-40: twice-daily — only the uncovered slot is pending', () => {
  const pr = daily({ doses_per_day: 2, reminder_time: '08:00,20:00' });
  const p = pendingFromYesterday({ protocols: [pr], logs: [log('Taken', local(2026, 9, 27, 8, 5))], nowMs: NOW });
  assert.deepEqual(p.map((x) => x.slotMs), [local(2026, 9, 27, 20, 0)]);
});

test('A-40: nothing pending for a protocol not due yesterday (every 2 days), paused, or deleted', () => {
  const every2 = daily({ interval_days: 2, start_date: '2026-09-26' }); // due 26, 28 — not 27
  assert.equal(pendingFromYesterday({ protocols: [every2], logs: [], nowMs: NOW }).length, 0);
  assert.equal(pendingFromYesterday({ protocols: [daily({ active: 0 })], logs: [], nowMs: NOW }).length, 0);
  assert.equal(pendingFromYesterday({ protocols: [daily({ deleted_at: iso(NOW) })], logs: [], nowMs: NOW }).length, 0);
});

test('A-40: no pending slot before the protocol existed (created today, or yesterday after the slot)', () => {
  const createdToday = daily({ start_date: '2026-09-20', created_at: iso(local(2026, 9, 28, 6, 0)) });
  assert.equal(pendingFromYesterday({ protocols: [createdToday], logs: [], nowMs: NOW }).length, 0);
  const createdLateYesterday = daily({ created_at: iso(local(2026, 9, 27, 22, 0)) });
  assert.equal(pendingFromYesterday({ protocols: [createdLateYesterday], logs: [], nowMs: NOW }).length, 0);
});

test('A-40: never shows a slot of TODAY (today\'s doses stay on their own cards)', () => {
  const early = daily({ reminder_time: '06:00' });
  const p = pendingFromYesterday({ protocols: [early], logs: [log('Taken', local(2026, 9, 27, 6, 0))], nowMs: NOW });
  assert.equal(p.length, 0, 'yesterday covered; today 06:00 is not "from yesterday"');
});

test('A-40: consistency with the Missed scan — a slot left pending is exactly what the scan marks Missed at slot + 12 h', () => {
  const pr = daily({ doses_per_day: 2, reminder_time: '08:00,20:00' });
  const logs = [log('Taken', local(2026, 9, 27, 8, 5))];
  const pending = pendingFromYesterday({ protocols: [pr], logs, nowMs: NOW });
  const scan = computeMissedDoses([pr], logs, local(2026, 9, 28, 8, 1), local(2026, 9, 27, 0, 0), { lookbackDays: 1 });
  assert.deepEqual(pending.map((x) => x.slotMs), scan.map((x) => x.scheduledAtMs));
});

test('A-40: DST — Nov 1 (25 h day) 20:00 slot still pending at 07:00 Nov 2', () => {
  const p = pendingFromYesterday({ protocols: [daily()], logs: [], nowMs: local(2026, 11, 2, 7, 0) });
  assert.deepEqual(p.map((x) => x.slotMs), [local(2026, 11, 1, 20, 0)]);
});

// Sim run 2026-09-28 (Tokyo): the block offered a slot that Mark taken refuses
// (the day already has doses_per_day Taken rows — calendar-day cap, A-35), so the
// button did nothing. Only slots Mark taken can actually write are offered.
// (A-43's window fix removes the underlying mismatch: an early same-day dose will
// then cover the slot in the matcher too.)
test('A-40: a day whose Taken count already reaches doses_per_day offers no pending slot (the tap could not write)', () => {
  const p = pendingFromYesterday({ protocols: [daily()], logs: [log('Taken', local(2026, 9, 27, 8, 20))], nowMs: NOW });
  assert.equal(p.length, 0);
  const twice = daily({ doses_per_day: 2, reminder_time: '08:00,20:00' });
  const q = pendingFromYesterday({ protocols: [twice], logs: [log('Taken', local(2026, 9, 27, 8, 5))], nowMs: NOW });
  assert.equal(q.length, 1, 'one of two taken → the other slot is still offered');
});

// S-18 (A-43): the block uses the SAME covering window as the Missed scan — a dose
// logged early on its own day (from that day's local midnight) covers the slot.
test('S-18: yesterday\'s 20:00 dose logged at 10:00 yesterday is not pending (same window as the scan)', () => {
  assert.equal(pendingFromYesterday({ protocols: [daily()], logs: [log('Taken', local(2026, 9, 27, 10, 0))], nowMs: NOW }).length, 0);
  assert.equal(pendingFromYesterday({ protocols: [daily()], logs: [log('Skipped', local(2026, 9, 27, 9, 0))], nowMs: NOW }).length, 0);
  const { coverStartMs } = require('../lib/missedDoses');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'pendingYesterday.js'), 'utf8');
  assert.equal(typeof coverStartMs, 'function');
  assert.match(src, /coverStartMs\(/, 'the block shares the scan\'s window helper (no private copy of the 3 h rule)');
});

// S-19 (A-49 guard, founder 2026-09-30): after a time-zone change, yesterday's slot is
// rebuilt in the NEW zone and no longer matches the dose logged in the old one. The
// block never offers a slot from before the zone change (a Taken there = a duplicate).
test('S-19: a slot from before the last time-zone change is never offered as pending', () => {
  const slot = local(2026, 9, 27, 20, 0);
  assert.equal(pendingFromYesterday({ protocols: [daily()], logs: [], nowMs: NOW, tzSinceMs: slot + 60000 }).length, 0, 'zone changed after the slot: hidden');
  assert.equal(pendingFromYesterday({ protocols: [daily()], logs: [], nowMs: NOW, tzSinceMs: slot - 60000 }).length, 1, 'zone changed before the slot: shown');
  assert.equal(pendingFromYesterday({ protocols: [daily()], logs: [], nowMs: NOW, tzSinceMs: null }).length, 1, 'no zone change known: shown (unchanged)');
});
