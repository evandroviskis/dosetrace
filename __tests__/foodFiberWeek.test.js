'use strict';
// Food fiber + the food week on Journey (founder 2026-11-08 23:15 EST: fiber as a number only, no target, per
// day and in the week; the week's calories; the daily average of protein and carbs, informing, never
// recommending; a line pointing to the trainer / health professional. 2026-11-09 02:1x: "Pode fazer o que
// tiver que fazer para a gente contabilizar as fibras"). Picture docs/design/food-week-fiber-pace.html,
// checklist docs/specs/food-fiber-week.md (FW-*).
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');
const { itemsFiber, applyFollowup, editedItems } = require('../lib/nutrition');
const { weekSummary, buildThread } = require('../lib/foodThread');
const { translations: T } = require('../i18n/translations');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const TODAY = '2026-11-09';
const row = (entry_date, kcal, items, extra = {}) => ({
  id: Math.floor(Math.random() * 1e9), user_id: 'u1', entry_date, kcal, protein_g: extra.p ?? 0, carb_g: extra.c ?? 0,
  parse_status: 'done', source: 'ai', raw_text: 'x', parsed_items: JSON.stringify(items), created_at: entry_date + 'T12:00:00Z', ...extra.row,
});

test('FW-1: the AI returns fiber_g per item and in the totals, a number only, never negative', () => {
  const src = read('supabase/functions/parse-food/index.ts');
  assert.equal((src.match(/"fat_g":number,"fiber_g":number,"confidence"/g) || []).length, 2, 'both schemas (parse and follow-up)');
  assert.match(src, /"kcal", "protein_g", "carb_g", "fat_g", "fiber_g" are ALWAYS TOTALS/);
  assert.match(src, /ALWAYS return all five numbers \(kcal, protein_g, carb_g, fat_g, fiber_g\)/);
  assert.match(src, /fiber_g: \(\(\) => \{ const n = numOrNull\(it\.fiber_g\); return n == null \|\| n < 0 \? null : /);
  assert.match(src, /fiber_g: Math\.round\(sum\('fiber_g'\)\) \}/);
  assert.match(src, /\$\{grams\(it\.fiber_g\)\} fiber\)/, 'the follow-up sees the stored fiber');
  // still a parser: no target, no advice about fiber
  assert.doesNotMatch(src, /fiber (target|goal)|enough fiber|more fiber/i);
});

test('FW-2: an entry\'s fiber counts only the items that have it; none → null (never a false 0 g)', () => {
  assert.equal(itemsFiber([]), null);
  assert.equal(itemsFiber([{ food: 'old', kcal: 300 }]), null, 'read before fiber existed');
  assert.equal(itemsFiber([{ food: 'ovos', fiber_g: 0 }]), 0, 'a real 0 stays 0');
  assert.equal(itemsFiber([{ food: 'pão', fiber_g: 2 }, { food: 'maçã', fiber_g: 4.4 }, { food: 'old' }]), 6.4);
  assert.equal(itemsFiber([{ food: 'x', fiber_g: -3 }, { food: 'y', fiber_g: 'a' }]), null);
});

test('FW-3: a follow-up answer keeps fiber (its own number, else the stored one scaled), an edit never drops it', () => {
  const orig = [{ food: 'arroz', qty: 1, kcal: 200, protein_g: 4, carb_g: 44, fat_g: 0.5, fiber_g: 1 }];
  const given = applyFollowup(orig, 0, { food: 'arroz integral', qty: 1, kcal: 220, protein_g: 5, carb_g: 46, fat_g: 1.5, fiber_g: 3.5 });
  assert.equal(given.items[0].fiber_g, 3.5);
  const scaled = applyFollowup(orig, 0, { food: 'arroz', qty: 2, kcal: 400, protein_g: 8, carb_g: 88, fat_g: 1, fiber_g: null });
  assert.equal(scaled.items[0].fiber_g, 2, 'old app answer without fiber: scaled with the kcal');
  const none = applyFollowup([{ food: 'old', kcal: 100, protein_g: 1, carb_g: 20, fat_g: 1 }], 0, { food: 'old', kcal: 120, protein_g: 1, carb_g: 25, fat_g: 1 });
  assert.equal(none.items[0].fiber_g, null, 'unknown stays unknown');
  const ed = editedItems(orig, [{ ...orig[0], __orig: 0, kcal: '250' }]);
  assert.equal(ed[0].fiber_g, 1);
});

test('FW-4: the chat shows fiber on the entry line only when known', () => {
  const r = row(TODAY, 430, [{ food: 'ovos', kcal: 350, fiber_g: 2, msg: 'm1' }, { food: 'maçã', kcal: 80, fiber_g: 4, msg: 'm1' }]);
  const old = row(TODAY, 300, [{ food: 'old', kcal: 300, msg: 'm2' }], { row: { created_at: TODAY + 'T13:00:00Z' } });
  const th = buildThread([r, old], { todayISO: TODAY, sinceISO: TODAY });
  const entries = th.filter((x) => x.type === 'entry');
  assert.equal(entries.find((x) => x.rowId === r.id).fiber_g, 6);
  assert.equal(entries.find((x) => x.rowId === old.id).fiber_g, null);
  const chat = read('screens/FoodChatScreen.js');
  assert.match(chat, /\{x\.fiber_g != null \? ` · \$\{Math\.round\(x\.fiber_g\)\} g \$\{t\('nutri_fiber'\)\}` : ''\}/);
});

test('FW-5: the week — calories, protein and carbs over the days with food, fiber over the days that have it', () => {
  const rows = [
    row('2026-11-03', 2000, [{ food: 'a', fiber_g: 10 }], { p: 100, c: 200 }),
    row('2026-11-05', 1800, [{ food: 'b', fiber_g: 14 }], { p: 80, c: 240 }),
    row('2026-11-05', 200, [{ food: 'c', fiber_g: 2 }], { p: 10, c: 20 }),
    row('2026-11-07', 2400, [{ food: 'old' }], { p: 90, c: 260 }), // before fiber: no fiber number
    row('2026-11-01', 9999, [{ food: 'out', fiber_g: 99 }], { p: 999, c: 999 }), // 8 days back
  ];
  const w = weekSummary(rows, TODAY);
  assert.equal(w.kcal, 6400);
  assert.equal(w.foodDays, 3);
  assert.equal(w.avgProtein, Math.round(280 / 3));
  assert.equal(w.avgCarb, Math.round(720 / 3));
  assert.equal(w.fiberDays, 2);
  assert.equal(w.avgFiber, Math.round((10 + 16) / 2));
  assert.equal(weekSummary([row(TODAY, 500, [{ food: 'old' }])], TODAY).avgFiber, null);
  assert.deepEqual(weekSummary([], TODAY), { kcal: 0, foodDays: 0, avgKcal: 0, avgProtein: 0, avgCarb: 0, fiberDays: 0, avgFiber: null });
});

test('FW-6: Journey\'s food card shows the week block (head, kcal, averages, wells, the professional line); Today keeps its line', () => {
  const hero = read('screens/components/FoodLogHero.js');
  assert.match(hero, /const week = variant === 'journey' && weekLine \? state\.week : null;/);
  assert.match(hero, /t\(pluralKey\('nutri_week_head', week\.foodDays, language\)\)/);
  assert.match(hero, /t\(week\.foodDays < 7 \? 'nutri_week_avg_food' : 'nutri_week_avg'\)/);
  assert.match(hero, /\.\.\.\(fiberLabel \? \[\{ k: 'f', v: week\.avgFiber, label: fiberLabel \}\] : \[\]\)/, 'no fiber number in the week: no fiber well');
  assert.match(hero, /week\.fiberDays < week\.foodDays \? t\('nutri_fiber'\) \+ ' · ' \+ t\(pluralKey\('nutri_week_days', week\.fiberDays, language\)\)/);
  assert.match(hero, /<Text style=\{s\.weekNote\}>\{t\('nutri_week_talk'\)\}<\/Text>/);
  assert.match(hero, /\{weekLine && !week \? <Text style=\{s\.check\}>\{weekLine\}<\/Text> : null\}/, 'Today: the one week line, as before');
  // theme tokens only in the new styles
  const styles = hero.slice(hero.indexOf('  week: {'), hero.indexOf('  weekNote:') + 80);
  assert.doesNotMatch(styles, /#[0-9a-fA-F]{3,8}|'white'|'black'|rgba\(/);
});

test('FW-7: texts in 6 languages, pt as approved, never "muito/pouco" or a target', () => {
  const keys = ['nutri_fiber', 'nutri_week_head', 'nutri_week_head_one', 'nutri_week_kcal', 'nutri_week_avg', 'nutri_week_avg_food', 'nutri_week_days', 'nutri_week_days_one', 'nutri_week_talk'];
  for (const l of LANGS) for (const k of keys) assert.ok(typeof T[l][k] === 'string' && T[l][k].trim(), `${l}.${k}`);
  for (const l of LANGS) {
    assert.ok(T[l].nutri_week_head.includes('{n}') && T[l].nutri_week_head_one.includes('{n}'), l);
    assert.ok(T[l].nutri_week_kcal.includes('{total}'), l);
  }
  assert.equal(T.pt.nutri_fiber, 'fibra');
  assert.equal(T.pt.nutri_week_head, 'Últimos 7 dias · comida em {n} dias');
  assert.equal(T.pt.nutri_week_avg, 'Média por dia');
  assert.equal(T.pt.nutri_week_avg_food, 'Média por dia com comida');
  assert.equal(T.pt.nutri_week_talk, 'Para mudar proteína, carboidrato ou calorias, converse com o treinador ou o profissional de saúde que acompanha você. O DoseTrace só mostra os seus números.');
  for (const l of LANGS) assert.doesNotMatch(Object.values({ a: T[l].nutri_week_avg, b: T[l].nutri_week_avg_food, c: T[l].nutri_week_talk }).join(' '), /muito|pouco|too much|too little|meta|target|goal|objetivo/i, l);
});
