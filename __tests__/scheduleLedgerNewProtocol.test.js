// Found on the simulator 2026-11-01 00:05 (+qa2), DV-244 / DV-246 follow-up: a protocol created at 21:35:33
// with a 21:35 dose, first seen by the schedule ledger at 21:37 — its updated_at had moved to 21:36 (the
// sync's cloud stamp) — was certified only from 21:36, so the creation day's own dose disappeared: no
// "pending from yesterday" and no Missed row. A protocol whose schedule is proven unchanged since its setup
// has had that schedule since it was created (the same grace as every other slot rule: created − 1 h).
// Council (senior, 2026-11-01): proven, not assumed — at the ledger's FIRST sight, updated_at no more than
// 5 min after created_at (no edit after the setup); the decision is stored then and never re-made.
// Council (QA, 2026-11-01): times built from local dates (any time zone), the exact slot asserted, the
// retroactive path (an existing ledger entry), the 6 h boundary, and the l: → r: key switch (a protocol
// edited before its first push keeps its "changed" mark when it gets its cloud id).
const test = require('node:test');
const assert = require('node:assert/strict');
const { noteSchedules, computeMissedDoses } = require('../lib/missedDoses');
const { pendingFromYesterday } = require('../lib/pendingYesterday');

const H = 3600000;
const created = new Date(2026, 9, 31, 21, 35, 33).getTime(); // local
const slot = new Date(2026, 9, 31, 21, 35, 0).getTime();
const p = { id: 170, user_id: 'u', remote_id: 'b4', interval_days: 1, doses_per_day: 1, reminder_time: '21:35', start_date: '2026-09-30', created_at: new Date(created).toISOString(), updated_at: new Date(created + 62000).toISOString(), active: 1 };
const firstSight = created + 136000;

test('a new protocol first seen with no edit since its setup counts from its creation', () => {
  const { next, sinceById } = noteSchedules(null, [p], { userId: 'u', nowMs: firstSight });
  assert.equal(sinceById[170], created - H);
  const morning = new Date(2026, 10, 1, 7, 0).getTime();
  const later = noteSchedules(next, [p], { userId: 'u', nowMs: morning });
  assert.equal(later.sinceById[170], created - H, 'the first-sight decision is kept');
  const pend = pendingFromYesterday({ protocols: [p], logs: [], nowMs: morning, scheduleSince: later.sinceById });
  assert.deepEqual(pend.map((x) => x.slotMs), [slot]);
  const nextDay = slot + 13 * H;
  const missed = computeMissedDoses([p], [], nextDay, -Infinity, { scheduleSince: noteSchedules(next, [p], { userId: 'u', nowMs: nextDay }).sinceById });
  assert.deepEqual(missed.filter((m) => m.protocol_id === 170).map((m) => m.scheduledAtMs), [slot]);
});

test('council (senior): created at 08:00, dose time edited at 13:00, Today first opened at 13:05 → never from the creation', () => {
  const c8 = new Date(2026, 9, 31, 8, 0).getTime();
  const e13 = new Date(2026, 9, 31, 13, 0).getTime();
  // The 13:00 edit is recorded in schedule_history (DV-247), which first sight honours (2026-11-03).
  const edited = { ...p, reminder_time: '10:00', created_at: new Date(c8).toISOString(), updated_at: new Date(e13).toISOString(), schedule_history: [{ from: new Date(e13).toISOString(), reminder_time: '10:00' }] };
  assert.equal(noteSchedules(null, [edited], { userId: 'u', nowMs: e13 + 5 * 60000 }).sinceById[170], e13);
});

test('a later write (a sync stamp after 5 min) with no recorded schedule change counts from the creation (2026-11-03)', () => {
  const stamped = { ...p, updated_at: new Date(created + 6 * 60000).toISOString() };
  assert.equal(noteSchedules(null, [stamped], { userId: 'u', nowMs: created + 7 * 60000 }).sinceById[170], created - H);
});

test('an entry written before this rule keeps its own first sight', () => {
  const old = { ['u|r:b4']: { fp: noteSchedules(null, [p], { userId: 'u', nowMs: firstSight }).next['u|r:b4'].fp, sinceMs: firstSight, changed: false } };
  assert.equal(noteSchedules(old, [p], { userId: 'u', nowMs: firstSight + H }).sinceById[170], Date.parse(p.updated_at));
});

test('a schedule change the ledger saw is never certified from the creation', () => {
  const { next } = noteSchedules(null, [p], { userId: 'u', nowMs: firstSight });
  const at = firstSight + H;
  assert.equal(noteSchedules(next, [{ ...p, reminder_time: '08:00' }], { userId: 'u', nowMs: at }).sinceById[170], at);
});

test('the l: → r: key switch keeps the ledger entry (and its changed mark)', () => {
  const local = { ...p, remote_id: null };
  const a = noteSchedules(null, [local], { userId: 'u', nowMs: firstSight });
  const editedAt = firstSight + 10 * 60000;
  const b = noteSchedules(a.next, [{ ...local, reminder_time: '08:00' }], { userId: 'u', nowMs: editedAt });
  // The first push gives it its cloud id; the edit must still count.
  const c = noteSchedules(b.next, [{ ...local, remote_id: 'b4', reminder_time: '08:00' }], { userId: 'u', nowMs: editedAt + 60000 });
  assert.equal(c.sinceById[170], editedAt);
  assert.ok(Object.keys(c.next).some((k) => k.endsWith('|r:b4')));
});
