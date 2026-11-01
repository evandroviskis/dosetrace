'use strict';
// DV-034 (DL-03, AD-85; Q8 = C of 2026-10-15; founder 2026-11-01 option C of
// docs/design/rodada1-hoje-registro.html #dv034): the streak in Today's tracker.
// Two defects: (1) it looked back only 30 days, so 40 days without a miss read "30"; (2) for someone with
// weekly protocols only, "2 days without a miss" was two WEEKS. Now: 365 days back (like lib/doseStreak
// LOOKBACK_DAYS), still counting days with a dose (a day with no dose due neither adds nor breaks), each day
// by the schedule in force that day (lib/scheduleHistory scheduleOn, DV-247); with no daily protocol the
// line says "dose days" ("2 dias de dose sem falhar"); anyone with a daily protocol keeps "dias sem falhar".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { trackerStreak, trackerStreakLine, TRACKER_LOOKBACK_DAYS } = require('../lib/trackerStreak');
const { LOOKBACK_DAYS } = require('../lib/doseStreak');
const { translations } = require('../i18n/translations');

const NOW = new Date(2026, 9, 20, 21, 0);
const daysAgo = (n, h = 12) => { const d = new Date(NOW); d.setDate(d.getDate() - n); d.setHours(h, 0, 0, 0); return d; };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const taken = (pid, n) => ({ protocol_id: pid, outcome: 'Taken', logged_at: daysAgo(n).toISOString() });
const tr = (lang) => (k) => translations[lang][k];

const daily = { id: 1, name: 'BPC-157', active: 1, interval_days: 1, doses_per_day: 1, reminder_time: '08:00', start_date: ymd(daysAgo(60)), created_at: daysAgo(60, 7).toISOString() };
const weekly = { id: 2, name: 'Testosterona', active: 1, interval_days: 7, doses_per_day: 1, reminder_time: '08:00', start_date: ymd(daysAgo(7)), created_at: daysAgo(7, 7).toISOString() };

test('DV-034: 40 complete days → 40 (the old 30-day look-back said 31)', () => {
  const logs = [];
  for (let n = 0; n < 40; n++) logs.push(taken(1, n));
  const r = trackerStreak({ protocols: [daily], takenLogs: logs, now: NOW });
  assert.equal(r.streak, 40);
  assert.equal(r.doseDays, false, 'a daily protocol keeps "days without a miss"');
  assert.equal(trackerStreakLine(r, tr('pt')), '40 dias sem falhar');
  assert.equal(trackerStreakLine(r, tr('en')), '40 days without a miss');
});

test('DV-034: the look-back is a year, like the card streak', () => {
  assert.equal(TRACKER_LOOKBACK_DAYS, LOOKBACK_DAYS);
  assert.equal(TRACKER_LOOKBACK_DAYS, 365);
});

test('DV-034: weekly-only, two weekly doses kept → 2, worded as dose days', () => {
  const r = trackerStreak({ protocols: [weekly], takenLogs: [taken(2, 7), taken(2, 0)], now: NOW });
  assert.equal(r.streak, 2);
  assert.equal(r.doseDays, true);
  assert.equal(trackerStreakLine(r, tr('pt')), '2 dias de dose sem falhar');
  assert.equal(trackerStreakLine(r, tr('en')), '2 dose days without a miss');
  assert.equal(trackerStreakLine({ ...r, streak: 1 }, tr('pt')), '1 dia de dose sem falhar');
});

test('DV-034: a daily protocol next to a weekly one keeps the plain "days" wording', () => {
  const r = trackerStreak({ protocols: [daily, weekly], takenLogs: [taken(1, 0), taken(2, 0)], now: NOW });
  assert.equal(r.doseDays, false);
  assert.equal(trackerStreakLine({ streak: 1, doseDays: false }, tr('pt')), '1 dia sem falhar');
});

test('DV-034: an ended daily protocol does not decide the wording (only protocols still running)', () => {
  const ended = { ...daily, id: 3, active: 0 };
  const r = trackerStreak({ protocols: [ended, weekly], takenLogs: [taken(2, 0)], now: NOW });
  assert.equal(r.doseDays, true);
});

test('DV-034: a missed due day breaks it; rest days neither add nor break; today counts once complete', () => {
  // weekly: due at 14, 7 and 0 days ago; 14 ago missed → 2.
  const w = { ...weekly, start_date: ymd(daysAgo(14)), created_at: daysAgo(14, 7).toISOString() };
  assert.equal(trackerStreak({ protocols: [w], takenLogs: [taken(2, 7), taken(2, 0)], now: NOW }).streak, 2);
  // today not yet taken: yesterday's run still counts, today adds nothing.
  const logs = [taken(1, 1), taken(1, 2), taken(1, 3)];
  assert.equal(trackerStreak({ protocols: [daily], takenLogs: logs, now: NOW }).streak, 3);
});

test('DV-034: each past day follows the schedule in force that day (DV-247)', () => {
  // Weekly until 5 days ago, daily since: the weekly rest days before the change are not misses.
  const changed = {
    ...weekly, id: 4, interval_days: 1, start_date: ymd(daysAgo(14)), created_at: daysAgo(14, 7).toISOString(),
    schedule_history: JSON.stringify([
      { from: null, interval_days: 7, doses_per_day: 1, reminder_time: '08:00' },
      { from: daysAgo(5, 6).toISOString(), interval_days: 1, doses_per_day: 1, reminder_time: '08:00' },
    ]),
  };
  const logs = [taken(4, 14), taken(4, 7), taken(4, 5), taken(4, 4), taken(4, 3), taken(4, 2), taken(4, 1), taken(4, 0)];
  const r = trackerStreak({ protocols: [changed], takenLogs: logs, now: NOW });
  assert.equal(r.streak, 8);
  assert.equal(r.doseDays, false, 'daily now');
});

test('DV-034: the week dots stay as before (7 days, oldest first, today last)', () => {
  const r = trackerStreak({ protocols: [daily], takenLogs: [taken(1, 0), taken(1, 2)], now: NOW });
  assert.equal(r.weekDots.length, 7);
  assert.equal(r.weekDots[6].isToday, true);
  assert.equal(r.weekDots[6].status, 'complete');
  assert.equal(r.weekDots[5].status, 'missed');
  assert.equal(r.weekDots[4].status, 'complete');
});

test('DV-034: new strings in six languages (singular and plural)', () => {
  for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.ok(translations[lang].today_streak_dose_day, `${lang}.today_streak_dose_day`);
    assert.ok(translations[lang].today_streak_dose_days, `${lang}.today_streak_dose_days`);
  }
  assert.equal(translations.pt.today_streak_dose_day, 'dia de dose sem falhar');
  assert.equal(translations.pt.today_streak_dose_days, 'dias de dose sem falhar');
});

// ── wiring ─────────────────────────────────────────────────────────
const TODAY = fs.readFileSync(path.join(__dirname, '../screens/TodayScreen.js'), 'utf8');
const TRACKER = fs.readFileSync(path.join(__dirname, '../screens/components/TodayTracker.js'), 'utf8');

test('DV-034: Today reads a year of logs and takes the streak from lib/trackerStreak', () => {
  const i = TODAY.indexOf('async function fetchStreakData()');
  const fn = TODAY.slice(i, TODAY.indexOf('\n  }\n', i));
  assert.match(fn, /setDate\(since\.getDate\(\) - TRACKER_LOOKBACK_DAYS\)/);
  assert.match(fn, /trackerStreak\(\{ protocols: activeProtocols, takenLogs: logs, now \}\)/);
  assert.doesNotMatch(fn, /i <= 30/);
  assert.match(TODAY, /const streakProps = \{ streak, streakDoseDays \};/);
  assert.match(TODAY, /<TodayTracker [^>]*\{\.\.\.streakProps\}/);
});

test('DV-034: the tracker line is trackerStreakLine (the wording follows doseDays)', () => {
  assert.match(TRACKER, /trackerStreakLine\(\{ streak, doseDays: streakDoseDays \}, t\)/);
});
