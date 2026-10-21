'use strict';
// 1.3.2 — the reminder (REM) defects of the 1.3.0 audit, Reminder check rules (lib/reminderHealth).
// docs/product/DIVERGENCES.md DV-042, DV-043, DV-044, DV-045, DV-098, DV-214. Each test failed on
// the code before its fix.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/reminderHealth');

const NOW = Date.UTC(2026, 9, 7, 12);
const DAY = 86400000;
const android = { os: 'android', manufacturer: 'Google', permission: 'granted', doseChannelImportance: 5, batteryOptimized: false,
  exactAlarms: true, hibernationExempt: true, remindersOn: true, silent: false, activeWithTime: 2, nowMs: NOW,
  lastRefresh: { at: NOW - 3600e3, ok: true, lastOkAt: NOW - 3600e3 }, syncedOnce: true };

// DV-042 (AD-25, DL-45, BR-4): Silent mode is never "blocked" — not even with the permission denied.
test('DV-042: Silent on + permission denied → no Blocked card on Today', () => {
  const h = { ...android, silent: true, permission: 'denied', scheduledCount: 0, dueInWindow: 10 };
  const checks = R.reminderChecks(h);
  assert.equal(R.shouldWarnToday({ ...h, checks, schedule: R.scheduleState(h) }), false);
  // Silent off, same phone: the card shows as before.
  const off = { ...h, silent: false };
  assert.equal(R.shouldWarnToday({ ...off, checks: R.reminderChecks(off), schedule: R.scheduleState(off) }), true);
});

// DV-043 (DL-46): presence per protocol, never a count.
test('DV-043: two timed protocols due in the window, only one scheduled → block', () => {
  const h = { ...android, scheduledCount: 6, dueInWindow: 12, dueProtocols: { 1: NOW + 3600e3, 2: NOW + 7200e3 }, scheduledProtocolIds: [1] };
  assert.equal(R.scheduleState(h), 'block');
  assert.equal(R.scheduleState({ ...h, scheduledProtocolIds: [1, 2] }), 'ok');
  // The iPhone floor never matters: one reminder each is enough.
  assert.equal(R.scheduleState({ ...h, scheduledCount: 2, scheduledProtocolIds: ['1', '2'] }), 'ok');
});

test('DV-043: a protocol whose first due slot lies past the iPhone cap is not missing (DV-053)', () => {
  const h = { ...android, os: 'ios', scheduledCount: 30, dueInWindow: 40, dueProtocols: { 1: NOW + 3600e3, 2: NOW + 9 * DAY }, scheduledProtocolIds: [1], capUntilMs: NOW + 5 * DAY };
  assert.equal(R.scheduleState(h), 'ok');
  assert.equal(R.scheduleState({ ...h, capUntilMs: null }), 'block');
});

test('DV-043: nothing due in the window yet, nothing scheduled → none needed; first resync not done → pending', () => {
  assert.equal(R.scheduleState({ ...android, scheduledCount: 0, dueInWindow: 0, dueProtocols: {}, scheduledProtocolIds: [] }), 'none_needed');
  assert.equal(R.scheduleState({ ...android, syncedOnce: false, scheduledCount: 1, dueInWindow: 4, dueProtocols: { 1: NOW + 1, 2: NOW + 2 }, scheduledProtocolIds: [1] }), 'pending');
});

test('DV-043: duePerProtocol names each protocol with a future due slot and its first time', () => {
  const now = new Date(2026, 9, 7, 12, 0, 0, 0);
  const todayKey = '2026-10-07';
  const ps = [
    { id: 1, reminder_time: '08:00', interval_days: 1, start_date: todayKey },
    { id: 2, reminder_time: '20:00', interval_days: 1, start_date: todayKey },
    { id: 3, reminder_time: '09:00', interval_days: 30, start_date: '2026-09-01' }, // next due outside the window
  ];
  const due = R.duePerProtocol(ps, now, 10, {});
  assert.deepEqual(Object.keys(due).sort(), ['1', '2']);
  assert.equal(due[2], new Date(2026, 9, 7, 20, 0, 0, 0).getTime());
  assert.equal(due[1], new Date(2026, 9, 8, 8, 0, 0, 0).getTime(), "today's 08:00 already passed");
});

// DV-044 (DL-46): the setup bar never reads done while nothing is scheduled.
test('DV-044: None scheduled + every row OK → the setup step is not done', () => {
  const h = { ...android, scheduledCount: 0, dueInWindow: 12, dueProtocols: { 1: NOW + 3600e3 }, scheduledProtocolIds: [] };
  const s = R.setupSteps(h);
  assert.equal(s.ready, s.total, 'every readable row is OK');
  assert.equal(s.done, false);
  assert.equal(s.scheduleBlocked, true);
  assert.equal(R.setupSteps({ ...h, scheduledCount: 4, scheduledProtocolIds: [1] }).done, true);
});

// DV-214: a permission the phone could not read is unknown, never a block.
test('DV-214: permission null → not block (open)', () => {
  const c = R.reminderChecks({ ...android, permission: null }).find((x) => x.id === 'notifications');
  assert.equal(c.state, 'open');
  assert.equal(R.reminderChecks({ ...android, permission: 'denied' }).find((x) => x.id === 'notifications').state, 'block');
});

// DV-045 (DL-47): a refresh registered long ago that never ran is late, not "pending" forever.
test('DV-045: registered 3 days ago, never ran → stale', () => {
  const h = { ...android, lastRefresh: null, refreshRegisteredAt: NOW - 3 * DAY };
  const row = R.reminderChecks(h).find((c) => c.id === 'refresh');
  assert.equal(row.state, 'warn');
  assert.equal(row.pending, false);
  assert.equal(row.days, 3);
  assert.equal(R.staleRefreshDays(h), 3);
  // Registered 1 day ago and not run yet: still pending (Android picks the moment).
  const young = R.reminderChecks({ ...h, refreshRegisteredAt: NOW - DAY }).find((c) => c.id === 'refresh');
  assert.equal(young.state, 'ok'); assert.equal(young.pending, true);
  // No registration time known (an update over 1.3.0 before the first registration): as before.
  assert.equal(R.reminderChecks({ ...h, refreshRegisteredAt: null }).find((c) => c.id === 'refresh').pending, true);
});

// DV-098 (DL-49, AD-79 item 5): the channel of every reminder kind the user has switched on.
// Logic only — the new Reminder check rows are drawn for the founder's picture before they show.
test('DV-098: food reminders on + check-in channel importance 0 → a block row', () => {
  const h = { ...android, checkinChannelImportance: 0, vialChannelImportance: 3, foodOn: true, checkinOn: false, vialOn: true };
  const rows = R.kindChannelChecks(h);
  assert.deepEqual(rows.map((r) => [r.id, r.state]), [['channel_checkin', 'block'], ['channel_vial', 'ok']]);
  // Every check-in kind off → that channel is not asked about.
  assert.deepEqual(R.kindChannelChecks({ ...h, foodOn: false }).map((r) => r.id), ['channel_vial']);
  // Unreadable (null) → no row; iPhone has no channels.
  assert.deepEqual(R.kindChannelChecks({ ...h, checkinChannelImportance: null, vialChannelImportance: null }), []);
  assert.deepEqual(R.kindChannelChecks({ ...h, os: 'ios' }), []);
  // Not yet part of the counted rows (no picture yet): the Reminder check is unchanged.
  assert.ok(!R.reminderChecks(h).some((c) => c.id.startsWith('channel_')));
});
