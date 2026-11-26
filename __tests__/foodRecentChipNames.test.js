'use strict';
// Fold 2026-11-26: the recent-meals chips read "1 × arroz, 1 × feijão, 150 g de frango grelhado,
// 1 × salada". The approved picture (docs/design/refeicoes-recentes.html v2) and FR-3 name a meal the
// way a person says it: "2 ovos, bacon, 2 torradas" — a count is a plain number before the food and a
// single item has no number; measured amounts stay as they are ("150 g de frango").
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/foodRecent');

const day = (d, h) => new Date(2026, 10, d, h, 0).getTime();
const row = (id, items, at) => ({ id, entry_date: '2026-11-25', raw_text: 'x', created_at: new Date(at).toISOString(), parse_status: 'done', kcal: 480, parsed_items: JSON.stringify(items) });

test('FR-3: counts read "2 ovos", a single item has no "1 ×", measures are kept', () => {
  const rows = [row(1, [
    { food: 'ovos', qty: 2, unit: '', kcal: 140 },
    { food: 'bacon', qty: 1, unit: '', kcal: 90 },
    { food: 'frango grelhado', qty: 150, unit: 'g', kcal: 250 },
  ], day(25, 8))];
  const list = R.recentMeals(rows, { language: 'pt', todayISO: '2026-11-26', now: day(26, 8) });
  assert.equal(list.length, 1);
  assert.equal(list[0].label, '2 ovos, bacon, 150 g de frango grelhado');
  assert.doesNotMatch(list[0].label, /×/);
});
