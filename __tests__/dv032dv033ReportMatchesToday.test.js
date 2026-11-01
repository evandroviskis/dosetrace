// DV-032 / DV-033 (DL-02, AD-07; parked-error sweep 2026-10-31): the adherence report a provider receives
// must say what the user sees on Today. Its streak is the protocol card's doseStreak (doses in a row over a
// year, a weekly protocol keeps counting), and its % is the 30-day ring's slots (scheduled doses taken ÷
// scheduled doses), over the ring's window. A-181 still holds: a dose the A-177 rule holds back is not
// counted against the person yet (it leaves the due count). The Taken / Skipped / Missed numbers stay the
// rows, labelled as such.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { adherenceStats } = require('../lib/adherenceReport');
const { adherenceRings, ringPct, monthStart } = require('../lib/adherenceRings');
const { reportStreaks } = require('../lib/doseStreak');

const at = (m, d, h = 9) => new Date(2026, m - 1, d, h, 0, 0, 0);
const NOW = at(10, 31, 20).getTime();

test('DV-032: a weekly protocol with 4 consecutive weekly doses has a report streak of 4', () => {
  const p = { id: 1, interval_days: 7, doses_per_day: 1, start_date: '2026-10-03', created_at: at(10, 3, 8).toISOString(), active: 1 };
  const logs = [3, 10, 17, 24, 31].slice(0, 5).map((d) => ({ protocol_id: 1, outcome: 'Taken', logged_at: at(10, d).toISOString() }));
  assert.equal(reportStreaks([p], logs.slice(0, 4), new Date(NOW))[1], 4); // today's dose not taken yet: never breaks it
  assert.equal(reportStreaks([p], logs, new Date(NOW))[1], 5);
});

test('DV-033: the report % equals the 30-day ring % (per protocol and overall)', () => {
  const p1 = { id: 1, interval_days: 1, doses_per_day: 1, start_date: '2026-09-01', created_at: at(9, 1, 8).toISOString(), active: 1, reminder_time: '09:00' };
  const p2 = { id: 2, interval_days: 2, doses_per_day: 1, start_date: '2026-10-10', created_at: at(10, 10, 8).toISOString(), active: 1, reminder_time: '21:00' };
  const logs = [];
  for (let d = 2; d <= 31; d++) if (d % 3) logs.push({ protocol_id: 1, outcome: 'Taken', logged_at: at(10, d, 9).toISOString() });
  for (let d = 2; d <= 31; d += 3) logs.push({ protocol_id: 1, outcome: 'Missed', logged_at: at(10, d, 9).toISOString() });
  for (let d = 10; d <= 30; d += 4) logs.push({ protocol_id: 2, outcome: 'Taken', logged_at: at(10, d, 21).toISOString() });
  const since = monthStart(NOW);
  const stats = adherenceStats({ protocols: [p1, p2], logs, sinceMs: since, nowMs: NOW });
  const ring = adherenceRings({ protocols: [p1, p2], logs, nowMs: NOW }).month;
  assert.equal(stats.overall.adherence, ringPct(ring));
  for (const p of [p1, p2]) {
    const one = adherenceRings({ protocols: [p], logs, nowMs: NOW }).month;
    assert.equal(stats.perProtocol.find((r) => r.id === p.id).adherence, ringPct(one), `protocol ${p.id}`);
  }
  // The rows stay the rows.
  assert.equal(stats.perProtocol.find((r) => r.id === 1).missed, 10);
  // A-181: a held-back dose leaves the due count.
  const held = adherenceStats({ protocols: [p1], logs, sinceMs: since, nowMs: NOW, held: { 1: 2 } });
  const r = adherenceRings({ protocols: [p1], logs, nowMs: NOW }).month;
  assert.equal(held.perProtocol[0].adherence, Math.round((100 * r.taken) / (r.due - 2)));
});

test('DV-032/033: Settings builds the report from the shared owners, and the streak line says doses (x6)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/SettingsScreen.js'), 'utf8');
  assert.match(src, /const thirtyDaysAgo = new Date\(monthStart\(now\.getTime\(\)\)\);/);
  assert.match(src, /adherenceStats\(\{ protocols, logs, sinceMs: thirtyDaysAgo\.getTime\(\), nowMs: now\.getTime\(\), held: heldIn \}\)/);
  assert.match(src, /const streaks = reportStreaks\(protocols, /);
  assert.doesNotMatch(src, /takenDays\.has\(d\.toDateString\(\)\)/);
  const today = fs.readFileSync(path.join(__dirname, '..', 'screens/TodayScreen.js'), 'utf8');
  assert.match(today, /setProtocolStreaks\(reportStreaks\(activeProtocols, logs, new Date\(\)\)\);/);
  const { translations } = require('../i18n/translations');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['report_streak_line', 'report_streak_line_one']) {
      assert.match(translations[l][k], /\{count\}/, `${l}.${k}`);
      assert.ok(translations[l][k].includes(translations[l][k.endsWith('_one') ? 'today_streak_doses_one' : 'today_streak_doses']), `${l}.${k} uses the card's words`);
    }
  }
});
