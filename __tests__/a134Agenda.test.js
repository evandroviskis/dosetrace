'use strict';
// A-134 (3) — both-theme render pass 2026-10-16 (appreview, Friday 16 Oct): Today showed
// "Amanhã · 1 dose" with only BPC 08:00 — the daily Magnesium 21:00 was missing — and
// "Próximos 5 dias · 1 dose". Account: BPC daily 08:00 (taken today), Magnesium daily 21:00
// (still open today), Tirzepatide weekly Fri 16:05 (open today), Testosterone weekly Sun 13:20.
//
// Cause: the lists were bucketed by each protocol's NEXT dose (nextDoseAt), so a protocol
// still open today sat only in today's cards and never appeared under Tomorrow, and each
// protocol counted once however many doses it had (DV-037). The binding prototype
// (docs/design/prototype.html, foldRow 'tom') lists under Tomorrow every dose due tomorrow,
// and DL-11 (docs/decisions.md) says the folds count doses, not protocols.
// Rule now (lib/schedule.upcomingAgenda): Tomorrow = every dose slot due tomorrow, whatever
// happens today; Next 5 days = for each protocol not in Tomorrow, the slots of its first dose
// day within days 2 to 6 (a daily protocol is not repeated five times — prototype n5);
// "N more later" = protocols with nothing in days 1 to 6 but a dose after.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { upcomingAgenda } = require('../lib/schedule');

const NOW = new Date(2026, 9, 16, 10, 30); // Friday 16 Oct 2026, 10:30
const P = {
  bpc: { id: 'bpc', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', created_at: '2026-09-01T08:00:00' },
  mag: { id: 'mag', start_date: '2026-09-01', interval_days: 1, doses_per_day: 1, reminder_time: '21:00', created_at: '2026-09-01T08:00:00' },
  tirz: { id: 'tirz', start_date: '2026-09-04', interval_days: 7, doses_per_day: 1, reminder_time: '16:05', created_at: '2026-09-04T08:00:00' }, // Fridays
  testo: { id: 'testo', start_date: '2026-09-06', interval_days: 7, doses_per_day: 1, reminder_time: '13:20', created_at: '2026-09-06T08:00:00' }, // Sundays
};
const hm = (ms) => { const d = new Date(ms); return `${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const view = (rows) => rows.map((r) => `${r.p.id} ${hm(r.at)}`);

test('A-134 (3): the appreview schedule — Tomorrow lists BPC 08:00 AND Magnesium 21:00 (2 doses)', () => {
  const a = upcomingAgenda(Object.values(P), NOW);
  assert.deepEqual(view(a.tomorrow), ['bpc 17 08:00', 'mag 17 21:00']);
  assert.deepEqual(view(a.next5), ['testo 18 13:20'], 'Testosterone Sunday; the daily ones are not repeated');
  assert.equal(a.laterCount, 1, 'Tirzepatide next Friday (day 7) is "1 more later"');
});

test('A-134 (3): Tomorrow does not depend on what is open or taken today', () => {
  const one = upcomingAgenda([P.mag], NOW);
  assert.deepEqual(view(one.tomorrow), ['mag 17 21:00']);
  const evening = upcomingAgenda([P.mag], new Date(2026, 9, 16, 22, 0));
  assert.deepEqual(view(evening.tomorrow), ['mag 17 21:00']);
});

test('A-134 (3) / DV-037: a twice-daily protocol counts 2 doses tomorrow, one row per time', () => {
  const bid = { id: 'bid', start_date: '2026-10-17', interval_days: 1, doses_per_day: 2, reminder_time: '20:00,08:00', created_at: '2026-10-16T09:00:00' };
  const a = upcomingAgenda([bid], NOW);
  assert.deepEqual(view(a.tomorrow), ['bid 17 08:00', 'bid 17 20:00']);
});

test('A-134 (3): a protocol starting in 3 days, every 2 days, and an ended one', () => {
  const later = { id: 'later', start_date: '2026-10-19', interval_days: 1, doses_per_day: 1, reminder_time: '09:00', created_at: '2026-10-16T09:00:00' };
  const eod = { id: 'eod', start_date: '2026-10-16', interval_days: 2, doses_per_day: 1, reminder_time: '07:00', created_at: '2026-10-01T09:00:00' };
  const ended = { ...P.bpc, id: 'ended', active: 0, ended_at: '2026-10-16T12:00:00' };
  const a = upcomingAgenda([later, eod, ended], NOW);
  assert.deepEqual(view(a.tomorrow), [], 'every 2 days from today: nothing tomorrow; ended: nothing');
  assert.deepEqual(view(a.next5), ['eod 18 07:00', 'later 19 09:00'], 'first dose day only');
  assert.equal(a.laterCount, 0);
});

test('A-134 (3): Today builds its Tomorrow / Next 5 days folds from upcomingAgenda (one row per dose)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'TodayScreen.js'), 'utf8');
  assert.match(src, /const agenda = upcomingAgenda\(protocols, todayDate\);/);
  assert.match(src, /const tomorrowCards = agenda\.tomorrow;/);
  assert.match(src, /const next5Cards = agenda\.next5;/);
  assert.match(src, /const laterCount = agenda\.laterCount;/);
  const fold = src.slice(src.indexOf('function foldRow('), src.indexOf('{open && extraRow}'));
  assert.match(fold, /items\.map\(\(\{ p, at \}\) =>/, 'each row carries its own dose time');
  assert.doesNotMatch(fold, /nextDoseAt\(/, 'the row time is the slot, not the protocol\'s next dose');
  assert.match(fold, /key=\{`\$\{p\.id\}-\$\{at\}`\}/);
});
