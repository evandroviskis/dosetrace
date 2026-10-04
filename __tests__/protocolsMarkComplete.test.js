'use strict';
// A-42 (founder 2026-09-28, target 1.2.6 → 1.3.0): "Mark complete" on a My Protocols card ONLY
// when Today would show that dose as actionable — today's open slot, or the A-40 slot pending
// from yesterday; nothing for tomorrow or later (a weekly protocol not due today has none). The
// tap reuses Today's exact path: it opens Today on that dose (A-44's focus) and runs the same
// take there — the yesterday-or-today question, the site question for an injectable, the vial,
// Undo — no new rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const { protocolTakeAction } = require('../lib/protocolTake');
const { read, sliceBlock } = require('./helpers/extractFn');

const NOW = new Date(2026, 9, 3, 10, 0).getTime();
const daily = { id: 1, start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: '2026-09-01T07:00:00.000Z' };
const weekly = { id: 2, start_date: '2026-09-29', interval_days: 7, doses_per_day: 1, reminder_time: '08:00', created_at: '2026-09-01T07:00:00.000Z' }; // next 2026-10-06

test('today\'s open dose → the today action with its slot', () => {
  const a = protocolTakeAction({ protocol: daily, todayLogs: [], pending: [], nowMs: NOW });
  assert.equal(a.kind, 'today');
  assert.equal(a.focus.protocolId, 1);
  assert.equal(a.focus.dayKey, '2026-10-03');
});

test('already complete today, or not due today (weekly) → no button', () => {
  const taken = [{ id: 5, protocol_id: 1, outcome: 'Taken', logged_at: new Date(2026, 9, 3, 8, 5).toISOString() }];
  assert.equal(protocolTakeAction({ protocol: daily, todayLogs: taken, pending: [], nowMs: NOW }), null);
  assert.equal(protocolTakeAction({ protocol: weekly, todayLogs: [], pending: [], nowMs: NOW }), null);
});

test('only yesterday pending → the pending action (Today runs takePending)', () => {
  const pend = [{ protocolId: 2, dayKey: '2026-10-02', slotMs: new Date(2026, 9, 2, 8).getTime() }];
  const a = protocolTakeAction({ protocol: weekly, todayLogs: [], pending: pend, nowMs: NOW });
  assert.equal(a.kind, 'pending');
  assert.equal(a.focus.dayKey, '2026-10-02');
});

test('My Protocols shows the button only for an action and hands it to Today; Today runs its own take', () => {
  const prot = read('screens/ProtocolsScreen.js');
  assert.match(prot, /protocolTakeAction\(\{ protocol: p, todayLogs, pending: pendingYest, nowMs: Date\.now\(\) \}\)/);
  assert.match(prot, /navigation\.navigate\('Today', \{ focusDose: \{ \.\.\.take\.focus, take: true, nonce: Date\.now\(\) \} \}\)/);
  const today = read('screens/TodayScreen.js');
  assert.match(today, /notifFocus\.take/);
  assert.match(today, /handleTake\(focusCard, null, 0, \{ slot: cp\.next \}\)/);
  assert.match(today, /takePending\(item\)/);
});
