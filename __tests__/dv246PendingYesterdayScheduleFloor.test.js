// DV-246 (AD-95; the "schedule since" floor of DV-244, the register's accepted route; parked-error sweep
// 2026-10-31): after an interval or start edit, "Did you take yesterday's dose?" asked about a day that was
// not a dose day — yesterday was judged by the current schedule. Like the Missed scan, a slot from before
// this phone knew the current schedule (doseActions observeSchedules → scheduleSince) is not offered, so
// the question and the scan never disagree.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pendingFromYesterday } = require('../lib/pendingYesterday');

const now = new Date(2026, 10, 1, 7, 0).getTime(); // Sun 1 Nov, 07:00 (yesterday's 21:00 dose is still pending)
const daily = { id: 1, interval_days: 1, doses_per_day: 1, reminder_time: '21:00', start_date: '2026-10-01', created_at: '2026-10-01T10:00:00Z', active: 1 };

test('DV-246: weekly → daily edited this morning → yesterday is not asked', () => {
  const editedAt = new Date(2026, 10, 1, 6, 30).getTime();
  assert.equal(pendingFromYesterday({ protocols: [daily], logs: [], nowMs: now }).length, 1, 'ungated (as before)');
  assert.equal(pendingFromYesterday({ protocols: [daily], logs: [], nowMs: now, scheduleSince: { 1: editedAt } }).length, 0);
  // Known unchanged since before yesterday → still asked.
  assert.equal(pendingFromYesterday({ protocols: [daily], logs: [], nowMs: now, scheduleSince: { 1: new Date(2026, 9, 20).getTime() } }).length, 1);
  // Passed without an entry for the protocol → nothing known → not asked (the scan's rule).
  assert.equal(pendingFromYesterday({ protocols: [daily], logs: [], nowMs: now, scheduleSince: {} }).length, 0);
});

test('DV-246: start moved to yesterday this morning → not asked', () => {
  const moved = { ...daily, start_date: '2026-10-31' };
  assert.equal(pendingFromYesterday({ protocols: [moved], logs: [], nowMs: now, scheduleSince: { 1: new Date(2026, 10, 1, 6, 45).getTime() } }).length, 0);
});

test('DV-246: Today and Protocols pass the scan ledger', () => {
  for (const f of ['screens/TodayScreen.js', 'screens/ProtocolsScreen.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.match(src, /pendingFromYesterday\(\{[^}]*scheduleSince \}\)/, f);
  }
});
