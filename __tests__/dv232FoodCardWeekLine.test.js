'use strict';
// DV-232 (AD-107, option A; founder go 2026-11-01, picture docs/design/rodada1-hoje-registro.html #dv232):
// the week's total disappeared from the food card when the "Totals" section was removed. One short line now
// sits under the day's total: "Últimos 7 dias: ~{total} kcal · ≈ {avg}/dia", the average taken over the days
// that have food (a day with nothing logged does not pull it down). The card read rows only from today (or
// the check / free-days start), so it now reads 6 days back as well.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');
const { weekSummary, todaySummary, shiftDay } = require('../lib/foodThread');
const { translations: T } = require('../i18n/translations');

const TODAY = '2026-11-01';
const food = (entry_date, kcal, extra = {}) => ({ id: Math.random(), user_id: 'u1', entry_date, kcal, parse_status: 'done', source: 'ai', raw_text: 'x', ...extra });

test('three days of food this week: the total is their sum, the average is per day with food', () => {
  const rows = [
    food('2026-10-27', 2000), food('2026-10-27', 300), // two entries on one day
    food('2026-10-29', 1800),
    food('2026-11-01', 1840),
    food('2026-10-25', 5000), // 7 days back: outside the last 7 days (Oct 26 … Nov 1)
    food('2026-10-30', 900, { parse_status: 'pending' }), // not read yet: no number to add
    { id: 9, user_id: 'u1', entry_date: '2026-10-30', source: 'day_closed', parse_status: 'done', kcal: 0 }, // a marker, not food
  ];
  const w = weekSummary(rows, TODAY);
  assert.equal(w.kcal, 2000 + 300 + 1800 + 1840);
  assert.equal(w.foodDays, 3);
  assert.equal(w.avgKcal, Math.round((2000 + 300 + 1800 + 1840) / 3));
  assert.deepEqual(weekSummary([], TODAY), { kcal: 0, foodDays: 0, avgKcal: 0, avgProtein: 0, avgCarb: 0, fiberDays: 0, avgFiber: null }); // + the food week (foodFiberWeek.test.js)
});

test('the card reads 6 days back and shows the week line under the day total', async () => {
  const db = [food('2026-10-27', 2300), food('2026-10-29', 1800), food('2026-11-01', 1840), food('2026-10-20', 999)];
  const readFoodCard = loadFn('screens/components/FoodLogHero.js', 'async function readFoodCard(', 'readFoodCard', {
    getCachedUser: async () => ({ id: 'u1' }),
    localISO: () => TODAY,
    // a check started today: before this change the card read today only
    loadFoodAccess: async () => ({ access: { canLog: true, freeFrom: null, reason: null }, rcStart: { date: TODAY } }),
    getFoodLogsSince: (uid, since) => db.filter((r) => r.user_id === uid && r.entry_date >= since),
    readCheckNow: async () => null,
    todaySummary, weekSummary, shiftDay,
  });
  const { state } = await readFoodCard();
  assert.equal(state.sum.kcal, 1840, 'the day total is still today only');
  assert.equal(state.week.kcal, 2300 + 1800 + 1840, 'the week total is the sum of the three days');
  assert.equal(state.week.foodDays, 3);

  const hero = read('screens/components/FoodLogHero.js');
  // Today keeps this line; Journey shows the food week block in its place (foodFiberWeek.test.js FW-6).
  const line = hero.indexOf('{weekLine && !week ? <Text style={s.check}>{weekLine}</Text> : null}');
  assert.ok(line > 0, 'the week line is drawn');
  assert.ok(line > hero.indexOf('<Text style={s.line}>'), 'under the day total');
  assert.ok(line < hero.indexOf('{checkLine && <Text style={s.check}>'), 'above the check line');
  // The day total is written the language's way too ("~1.840 kcal" in pt, as in the picture; it was "1840").
  assert.match(hero, /replace\('\{kcal\}', formatInt\(kcal, language\)\) : t\('nutri_hero_empty'\)/);
  assert.match(hero, /const weekLine = !locked && state\.week && state\.week\.kcal > 0/);
  assert.match(hero, /t\('nutri_hero_week'\)\.replace\('\{total\}', formatInt\(state\.week\.kcal, language\)\)\.replace\('\{avg\}', formatInt\(state\.week\.avgKcal, language\)\)/);
});

test('the line in 6 languages (pt as approved)', () => {
  assert.equal(T.pt.nutri_hero_week, 'Últimos 7 dias: ~{total} kcal · ≈ {avg}/dia');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.ok(T[l].nutri_hero_week.includes('{total}') && T[l].nutri_hero_week.includes('{avg}'), l);
  }
  const s = T.pt.nutri_hero_week.replace('{total}', '12.600').replace('{avg}', '2.100');
  assert.equal(s, 'Últimos 7 dias: ~12.600 kcal · ≈ 2.100/dia');
});
