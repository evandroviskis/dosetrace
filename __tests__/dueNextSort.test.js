'use strict';
// Pre-build pass 2026-10-03, m12: My Protocols' "Due next" sort compared only the DAY of the next
// dose, so two protocols due today kept their stored order whatever their times. It now sorts by
// the full next-dose moment — the same nextDoseAt Today uses (a dose already complete today
// sorts by its next one).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dueNextOrder } = require('../lib/protocolSort');

const NOW = new Date(2026, 9, 3, 7, 0);
const iso = (h, m = 0) => new Date(2026, 9, 3, h, m).toISOString();
const P = (id, time, extra = {}) => ({ id, start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: time, created_at: '2026-09-01T08:00:00.000Z', ...extra });

test('two doses today: the earlier time comes first, whatever the stored order', () => {
  const list = [P(1, '20:00'), P(2, '08:00'), P(3, '12:30')];
  assert.deepEqual(dueNextOrder(list, [], NOW).map((p) => p.id), [2, 3, 1]);
});

test('a dose already complete today sorts by its next dose (tomorrow), after today\'s open ones', () => {
  const list = [P(2, '08:00'), P(1, '20:00')];
  const logs = [{ protocol_id: 2, outcome: 'Taken', logged_at: iso(8, 5) }];
  assert.deepEqual(dueNextOrder(list, logs, new Date(2026, 9, 3, 9, 0)).map((p) => p.id), [1, 2]);
});

test('a weekly protocol due tomorrow at 06:00 comes before a daily one tomorrow at 09:00 when both are done today', () => {
  const weekly = P(5, '06:00', { interval_days: 7, start_date: '2026-09-28' }); // due 2026-10-05? → 28 + 7 = Oct 5
  const daily = P(6, '09:00');
  const list = [daily, weekly];
  const logs = [{ protocol_id: 6, outcome: 'Taken', logged_at: iso(9, 1) }];
  const order = dueNextOrder(list, logs, new Date(2026, 9, 3, 10, 0)).map((p) => p.id);
  assert.deepEqual(order, [6, 5], 'daily tomorrow 09:00 before weekly on the 5th');
});

test('My Protocols uses it for "Due next"', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/ProtocolsScreen.js'), 'utf8');
  assert.match(src, /if \(sortBy === 'due'\) return dueNextOrder\(arr, todayLogs, new Date\(\)\);/);
});
