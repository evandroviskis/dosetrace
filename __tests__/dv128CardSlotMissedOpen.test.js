// DV-128 (parked-error sweep 2026-10-31): a tap on today's dose card opened the slot from cardSlot, which treated an
// auto-Missed row as filled, while the card's own buttons (cardPlan) treat it as open — so the tap could open a
// later slot than the one the card offers. cardSlot uses cardPlan's rule.
const test = require('node:test');
const assert = require('node:assert/strict');
const { cardSlot, cardPlan } = require('../lib/dosePageState');

test('DV-128: cardSlot opens the slot cardPlan offers (a Missed row is open)', () => {
  const now = new Date(2026, 9, 31, 22, 0).getTime();
  const p = { id: 1, interval_days: 1, doses_per_day: 2, reminder_time: '08:00,20:00', start_date: '2026-10-01', created_at: new Date(2026, 9, 1).toISOString(), active: 1 };
  const missed = { id: 7, protocol_id: 1, outcome: 'Missed', logged_at: new Date(2026, 9, 31, 8, 0).toISOString() };
  const plan = cardPlan({ protocol: p, logs: [missed], nowMs: now });
  const slot = cardSlot({ protocol: p, logs: [missed], nowMs: now });
  assert.equal(plan.next.slotMs, new Date(2026, 9, 31, 8, 0).getTime());
  assert.equal(slot.slotMs, plan.next.slotMs);
});
