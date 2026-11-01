// Parked-error sweep 2026-10-31 — "Ainda em andamento?" (DIVERGENCES DV-026 / DV-248; DL-21 logged Taken
// rows only, DL-87 the inactivity end at the last logged dose).
// DV-248: a protocol added Oct 1 to start Oct 20 was asked "Still going?" on its very first day (the
//   reference fell back to created_at), and "Sim, terminou" on a never-taken one dated the end at
//   created_at — before its start.
// DV-026: a declared (pre-creation) Taken row could date the reference and the end before the protocol
//   existed in the app.
const test = require('node:test');
const assert = require('node:assert/strict');
const PE = require('../lib/protocolEnd');

const base = { id: 1, interval_days: 1, doses_per_day: 1, reminder_time: '09:00', active: 1 };

test('DV-248: never asked on a future start\'s first day (reference = latest of last dose, added, start)', () => {
  const p = { ...base, created_at: new Date(2026, 9, 1, 10).toISOString(), start_date: '2026-10-20' };
  assert.equal(PE.inactivityDue(p, { now: new Date(2026, 9, 20, 12) }), false);
  assert.equal(PE.inactivityDue(p, { now: new Date(2026, 9, 28, 12) }), true, 'a week after the start with no dose');
});

test('DV-026: a declared dose (before the protocol was added) never moves the reference back', () => {
  const p = { ...base, created_at: new Date(2026, 9, 28, 10).toISOString(), start_date: '2026-09-01' };
  const declared = new Date(2026, 8, 10, 9).toISOString();
  assert.equal(PE.inactivityDue(p, { lastTakenIso: declared, now: new Date(2026, 9, 31, 12) }), false, 'added 3 days ago');
});

test('DV-026 / DV-248: the inactivity end is the last LOGGED dose, never before the start or the add', () => {
  const created = new Date(2026, 9, 1, 10).toISOString();
  assert.equal(PE.lastDoseEnd({ createdAt: created, startDate: '2026-10-20', lastLoggedTakenIso: null }), new Date(2026, 9, 20).toISOString());
  const dose = new Date(2026, 9, 22, 9).toISOString();
  assert.equal(PE.lastDoseEnd({ createdAt: created, startDate: '2026-10-20', lastLoggedTakenIso: dose }), dose);
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'lib/protocolEnd.js'), 'utf8');
  const fn = src.slice(src.indexOf('function endAtLastDose('), src.indexOf('function dropMissedAfter('));
  assert.match(fn, /ms < created - CREATION_GRACE_MS\) \) continue; \/\/ declared|ms < created - CREATION_GRACE_MS/, 'declared rows (before the add) are not the last dose');
  assert.match(fn, /lastDoseEnd\(/);
});
