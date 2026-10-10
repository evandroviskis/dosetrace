'use strict';
// Founder 2026-10-09: "Registrou que eu me pesei, mas ele continua mostrando a notificação que eu preciso
// me pesar" — Today's reality-check alert and the food card line looked only at the date (day > 21),
// never at the weigh-in. They must follow the check's real state (lib/realityCheckRules checkOutcome):
// due → "time to weigh in"; weighed in but the food run is missing → what is still missing;
// ready → the result is ready.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');
const { checkAlert } = require('../lib/realityCheckRules');
const T = require('../i18n/translations.js').translations || require('../i18n/translations.js');

test('the alert follows the check: running, due, weighed in (food missing), ready', () => {
  assert.deepEqual(checkAlert({ state: 'running', dueISO: '2026-10-20' }, null), { body: 'when', dueISO: '2026-10-20' });
  assert.deepEqual(checkAlert({ state: 'due', dueISO: '2026-10-08' }, null), { body: 'due' });
  assert.deepEqual(checkAlert({ state: 'needs_food', dueISO: '2026-10-08' }, { current: 1 }), { body: 'needs_food', left: 6 });
  assert.deepEqual(checkAlert({ state: 'needs_food', dueISO: '2026-10-08' }, { current: 6 }), { body: 'needs_food', left: 1 });
  assert.deepEqual(checkAlert({ state: 'needs_food', dueISO: '2026-10-08' }, null), { body: 'needs_food', left: 7 });
  assert.deepEqual(checkAlert({ state: 'ready', dueISO: '2026-10-08' }, { current: 7 }), { body: 'ready' });
  assert.equal(checkAlert({ state: 'none' }, null), null);
});

test('Today and the food card read the real state, never the date alone', () => {
  const today = read('screens/TodayScreen.js');
  assert.match(today, /readCheckNow\(\)/);
  assert.match(today, /checkAlert\(/);
  assert.match(today, /today_alert_rc_needs_food/);
  assert.match(today, /today_alert_rc_ready/);
  const hero = read('screens/components/FoodLogHero.js');
  assert.match(hero, /nutri_hero_weighed/);
  assert.match(hero, /readCheckNow\(\)/);
  assert.match(hero, /state\.checkState === 'needs_food' \|\| state\.checkState === 'ready'/);
});

test('new lines in all 6 languages (with the singular)', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['today_alert_rc_needs_food', 'today_alert_rc_needs_food_one', 'today_alert_rc_ready', 'nutri_hero_weighed']) assert.ok(T[l][k], `${l} ${k}`);
    assert.ok(T[l].today_alert_rc_needs_food.includes('{n}'), l);
  }
  assert.equal(T.pt.today_alert_rc_needs_food, 'Peso registrado — faltam {n} dias seguidos de comida para o resultado');
});
