// Found on the simulator 2026-11-01 00:05 (+qa2), DV-244 / DV-246 follow-up: a protocol created at 21:35:33
// with a 21:35 dose, first seen by the schedule ledger at 21:37 — its updated_at had moved to 21:36 (the
// sync's cloud stamp) — was certified only from 21:36, so the creation day's own dose disappeared: no
// "pending from yesterday" and no Missed row. A protocol the ledger saw unchanged within a few hours of its
// creation has had that schedule since it was created (the same grace as every other slot rule: created − 1 h).
const test = require('node:test');
const assert = require('node:assert/strict');
const { noteSchedules } = require('../lib/missedDoses');
const { pendingFromYesterday } = require('../lib/pendingYesterday');

const created = Date.parse('2026-11-01T01:35:33.218Z');
const p = { id: 170, remote_id: 'b4', interval_days: 1, doses_per_day: 1, reminder_time: '21:35', start_date: '2026-09-30', created_at: '2026-11-01T01:35:33.218Z', updated_at: '2026-11-01T01:36:35.835Z', active: 1 };

test('a new protocol seen unchanged soon after creation is certified from its creation', () => {
  const firstSight = Date.parse('2026-11-01T01:37:49Z');
  const { next, sinceById } = noteSchedules(null, [p], { userId: 'u', nowMs: firstSight });
  assert.equal(sinceById[170], created - 3600000);
  // Later scans keep it.
  const later = noteSchedules(next, [p], { userId: 'u', nowMs: Date.parse('2026-11-01T04:05:00Z') });
  assert.equal(later.sinceById[170], created - 3600000);
  // The creation day's dose is asked about the next morning.
  const now = Date.parse('2026-11-01T04:05:00Z'); // 00:05 EDT
  assert.equal(pendingFromYesterday({ protocols: [p], logs: [], nowMs: now, scheduleSince: later.sinceById }).length, 1);
});

test('a protocol first seen long after its creation still needs updated_at (an edit may have come between)', () => {
  const old = { ...p, created_at: '2026-10-01T10:00:00Z' };
  const { sinceById } = noteSchedules(null, [old], { userId: 'u', nowMs: Date.parse('2026-11-01T01:37:49Z') });
  assert.equal(sinceById[170], Date.parse(old.updated_at));
});

test('a schedule change the ledger saw is never certified from the creation', () => {
  const firstSight = Date.parse('2026-11-01T01:37:49Z');
  const { next } = noteSchedules(null, [p], { userId: 'u', nowMs: firstSight });
  const edited = { ...p, reminder_time: '08:00' };
  const at = Date.parse('2026-11-01T02:00:00Z');
  assert.equal(noteSchedules(next, [edited], { userId: 'u', nowMs: at }).sinceById[170], at);
});
