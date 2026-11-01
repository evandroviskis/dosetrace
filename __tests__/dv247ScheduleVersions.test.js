// DV-247 (AD-95, founder 2026-10-15: every protocol change is stored with the date it took effect and the
// past uses the old values; founder 2026-10-31 "About the DV247. Do it."): the rings, the protocol card's
// streak and Today's tracker streak / week circles recomputed past days with the CURRENT schedule, so an
// edit (weekly → daily) erased a streak and dropped the 30-day ring at once.
// protocols.schedule_history (lib/scheduleHistory, like dose_history) keeps each schedule — interval,
// doses per day, dose times — with the moment it took effect; a day uses the version in force that day
// (the edit's own day already uses the new one). The start date is not versioned: moving it corrects when
// the protocol began (A-90), for the whole past.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../lib/scheduleHistory');
const { adherenceRings } = require('../lib/adherenceRings');
const { doseStreak } = require('../lib/doseStreak');

const at = (m, d, h = 9) => new Date(2026, m - 1, d, h, 0, 0, 0);
const weekly = { id: 1, interval_days: 7, doses_per_day: 1, reminder_time: '09:00', start_date: '2026-10-01', created_at: at(10, 1, 8).toISOString(), active: 1 };

test('DV-247: a schedule edit writes a version; nothing changes when the schedule does not', () => {
  assert.equal(H.nextScheduleHistory(weekly, { reminder_time: '09:00' }, at(10, 31, 8).toISOString()), null);
  const h1 = JSON.parse(H.nextScheduleHistory(weekly, { interval_days: 1 }, at(10, 31, 8).toISOString()));
  assert.deepEqual(h1, [
    { from: null, interval_days: 7, doses_per_day: 1, reminder_time: '09:00' },
    { from: at(10, 31, 8).toISOString(), interval_days: 1, doses_per_day: 1, reminder_time: '09:00' },
  ]);
  const h2 = JSON.parse(H.nextScheduleHistory({ ...weekly, interval_days: 1, schedule_history: JSON.stringify(h1) }, { reminder_time: '20:00' }, at(11, 2, 8).toISOString()));
  assert.equal(h2.length, 3);
  assert.equal(h2[2].reminder_time, '20:00');
});

test('DV-247: a day uses the version in force that day', () => {
  const p = { ...weekly, interval_days: 1, schedule_history: H.nextScheduleHistory(weekly, { interval_days: 1 }, at(10, 31, 8).toISOString()) };
  assert.equal(H.scheduleOn(p, at(10, 30)).interval_days, 7);
  assert.equal(H.scheduleOn(p, at(10, 31, 7)).interval_days, 1, 'the edit day uses the new schedule');
  assert.equal(H.scheduleOn(weekly, at(10, 30)), weekly, 'no history: the row itself');
});

test('DV-247: weekly → daily — the 30-day ring and the streak keep the days before the edit', () => {
  const p = { ...weekly, interval_days: 1, schedule_history: H.nextScheduleHistory(weekly, { interval_days: 1 }, at(10, 31, 8).toISOString()) };
  const logs = [1, 8, 15, 22, 29, 31].map((d) => ({ protocol_id: 1, outcome: 'Taken', logged_at: at(10, d, 9).toISOString() }));
  const now = at(10, 31, 20).getTime();
  const month = adherenceRings({ protocols: [p], logs, nowMs: now }).month;
  assert.deepEqual(month, { taken: 5, due: 5 }); // the ring starts 2 Oct: 8, 15, 22, 29 (weekly) + 31 (daily); the current row alone would say 5 of 30
  const counts = {};
  for (const l of logs) { const k = new Date(l.logged_at).toDateString(); counts[k] = (counts[k] || 0) + 1; }
  assert.equal(doseStreak(p, counts, new Date(now)), 6);
});

test('DV-247: the write, the sync, the restart and Today use the history', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(read('lib/database.js'), /const sh = nextScheduleHistory\(prev, safe, now\);/);
  assert.match(read('lib/syncMappers.js'), /'dose_history', 'schedule_history'\]/);
  assert.match(read('lib/syncMappers.js'), /if \(row\.schedule_history\) base\.schedule_history = row\.schedule_history;/);
  assert.match(read('lib/schema.js'), /schedule_history TEXT,/);
  assert.match(read('lib/schema.js'), /ALTER TABLE protocols ADD COLUMN schedule_history TEXT;/);
  assert.match(read('lib/protocolEnd.js'), /'schedule_history', \/\/ DV-247/);
  assert.match(read('supabase/migrations/20261101010000_protocol_schedule_history.sql'), /add column if not exists schedule_history text/);
  // DV-034 moved Today's tracker streak into lib/trackerStreak (Today calls it); the rule is the same.
  assert.match(read('screens/TodayScreen.js'), /trackerStreak\(\{ protocols: activeProtocols, takenLogs: logs, now \}\)/);
  const today = read('lib/trackerStreak.js');
  assert.match(today, /existedOn\(p, d\) && expectedDosesOn\(scheduleOn\(p, d\), d\) > 0/);
  assert.match(today, /\(dayData\[p\.id\] \|\| 0\) >= expectedDosesOn\(scheduleOn\(p, d\), d\)/);
});
