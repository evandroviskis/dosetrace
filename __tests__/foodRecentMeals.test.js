'use strict';
// docs/specs/food-log-recent-receipt.md FR-1..FR-7 and FR-12 (founder 2026-11-26, pictures
// docs/design/refeicoes-recentes.html v2 and docs/design/registro-comida-visual.html option A):
// the recent meals row is built from the food_logs rows already stored (no new table), one tap
// copies a past meal as a new entry with no AI call, and after an entry the app says a human
// goodbye that promises the next question only when that meal's reminder is really on.
const test = require('node:test');
const assert = require('node:assert/strict');
const { recentMeals, mealKey, repeatEntry, canRepeat, goodbyeFor, RECENT_DAYS, RECENT_MAX } = require('../lib/foodRecent');
const { needsEstimateFlag, rowsToReparse } = require('../lib/nutrition');
const { buildThread } = require('../lib/foodThread');

const TODAY = '2026-11-26';
const at = (day, hh, mm = 0) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, hh, mm).toISOString(); };
let nextId = 1;
function row(day, hh, items, extra = {}) {
  const kcal = items.reduce((a, it) => a + (it.kcal || 0), 0);
  return { id: nextId++, user_id: 'u1', source: 'ai', parse_status: 'done', sync_status: 'synced', raw_text: items.map((it) => it.food).join(' e '), entry_date: day, created_at: at(day, hh), parsed_items: JSON.stringify(items), kcal, carb_g: 10, protein_g: 10, fat_g: 5, ...extra };
}
const eggs = [{ food: 'ovos', qty: 2, unit: '', kcal: 155, carb_g: 1, protein_g: 13, fat_g: 10, confidence: 'high', category: 'meal', msg: 'old1' }, { food: 'bacon', qty: null, unit: '', kcal: 165, carb_g: 0, protein_g: 12, fat_g: 13, confidence: 'high', category: 'meal', msg: 'old1' }];
const shake = [{ food: 'Shake de proteína', qty: 2, unit: 'scoops', kcal: 240, carb_g: 8, protein_g: 48, fat_g: 3, confidence: 'high', category: 'drink', msg: 'old2' }];
const factor = [{ food: 'Factor 75 frango ao pesto', qty: 1, unit: '', kcal: 550, carb_g: 30, protein_g: 40, fat_g: 25, confidence: 'medium', category: 'meal', msg: 'old3' }];
const marmita = [{ food: 'Marmita de arroz, frango e brócolis', qty: 1, unit: '', kcal: 520, carb_g: 60, protein_g: 35, fat_g: 10, confidence: 'medium', category: 'meal', msg: 'old4' }];

function history() {
  nextId = 1;
  return [
    row('2026-11-25', 7, eggs), row('2026-11-25', 6, shake.map((x) => ({ ...x, msg: 'old2b' }))),
    row('2026-11-25', 12, factor), row('2026-11-24', 12, marmita),
    row('2026-11-24', 8, shake), // the same shake again, older
  ];
}

test('FR-1: up to 10 distinct meals from the last 30 days, names only, nothing before the first meal', () => {
  assert.equal(RECENT_DAYS, 30);
  assert.equal(RECENT_MAX, 10);
  assert.deepEqual(recentMeals([], { todayISO: TODAY, now: new Date(2026, 10, 26, 7, 40), language: 'pt' }), [], 'hidden until the first meal is logged');
  const list = recentMeals(history(), { todayISO: TODAY, now: new Date(2026, 10, 26, 7, 40), language: 'pt' });
  assert.equal(list.length, 4, 'the two identical shakes are one chip');
  for (const m of list) {
    assert.equal(typeof m.label, 'string');
    assert.doesNotMatch(m.label, /kcal|\d+ g /, 'the chip carries no kcal and no macros');
  }
  // 31 days old, deleted, not read, 0 kcal and markers never appear.
  nextId = 100;
  const extra = [
    row('2026-10-26', 9, [{ food: 'antigo', kcal: 100 }]),
    row('2026-11-20', 9, [{ food: 'apagado', kcal: 100 }], { sync_status: 'deleted' }),
    row('2026-11-20', 9, [{ food: 'pendente', kcal: 100 }], { parse_status: 'pending' }),
    row('2026-11-20', 9, [{ food: 'água', kcal: 0 }]),
    { id: 199, user_id: 'u1', source: 'day_closed', entry_date: '2026-11-20', created_at: at('2026-11-20', 21), parsed_items: '[]', kcal: 0 },
  ];
  const names = recentMeals(extra, { todayISO: TODAY, now: new Date(2026, 10, 26, 9), language: 'pt' }).map((m) => m.label);
  assert.deepEqual(names, [], 'old, deleted (FR-7), unread, zero-kcal and marker rows are left out');
  const inside = recentMeals([row('2026-10-28', 9, [{ food: 'dentro', kcal: 100 }])], { todayISO: TODAY, now: new Date(2026, 10, 26, 9), language: 'pt' });
  assert.equal(inside.length, 1, '29 days back is inside the 30 days');
  nextId = 300;
  const many = Array.from({ length: 14 }, (_, i) => row('2026-11-2' + (i % 6), 9, [{ food: 'prato ' + i, kcal: 100 + i }]));
  assert.equal(recentMeals(many, { todayISO: TODAY, now: new Date(2026, 10, 26, 9), language: 'pt' }).length, 10);
});

test('FR-2: the order follows the time of day, then most recent first', () => {
  const morning = recentMeals(history(), { todayISO: TODAY, now: new Date(2026, 10, 26, 7, 40), language: 'pt' }).map((m) => m.items[0].food);
  assert.deepEqual(morning.slice(0, 2), ['ovos', 'Shake de proteína'], 'in the morning, what was logged in the morning on earlier days comes first');
  assert.deepEqual(morning.slice(2), ['Factor 75 frango ao pesto', 'Marmita de arroz, frango e brócolis']);
  const lunch = recentMeals(history(), { todayISO: TODAY, now: new Date(2026, 10, 26, 12, 30), language: 'pt' }).map((m) => m.items[0].food);
  assert.deepEqual(lunch.slice(0, 2), ['Factor 75 frango ao pesto', 'Marmita de arroz, frango e brócolis'], 'at lunchtime the lunches come first');
  assert.deepEqual(lunch.slice(2), ['ovos', 'Shake de proteína'], 'then the rest, most recent first');
});

test('FR-3: a chip is the meal as logged (item names joined); same items and quantities = one chip', () => {
  const list = recentMeals(history(), { todayISO: TODAY, now: new Date(2026, 10, 26, 7, 40), language: 'pt' });
  assert.equal(list[0].label, '2 ovos, bacon');
  assert.equal(mealKey(eggs), mealKey(eggs.slice().reverse()), 'item order does not matter');
  assert.equal(mealKey([{ food: ' Ovos ', qty: 2, unit: '' }]), mealKey([{ food: 'ovos', qty: 2, unit: null }]), 'case and spaces do not matter');
  assert.notEqual(mealKey([{ food: 'ovos', qty: 2 }]), mealKey([{ food: 'ovos', qty: 3 }]), 'a different quantity is another meal');
  // The newest copy is the one repeated (its numbers are "the same as last time").
  nextId = 500;
  const a = row('2026-11-20', 8, [{ ...shake[0], kcal: 230 }]);
  const b = row('2026-11-22', 8, [{ ...shake[0], kcal: 240 }]);
  const one = recentMeals([a, b], { todayISO: TODAY, now: new Date(2026, 10, 26, 8), language: 'pt' });
  assert.equal(one.length, 1);
  assert.equal(one[0].items[0].kcal, 240);
});

test('FR-4: the copy is a new, already read entry on the chat day with only the item values', () => {
  const item = { ...eggs[0], ask: { kind: 'size', options: ['M'] }, ask_skipped: true, ask_pending: 'x', ask_done: { kind: 'size', answer: 'M' }, days_ago: 2, msg: 'old1', category: 'meal' };
  const meal = { label: '2 ovos', items: [item, eggs[1]] };
  const e = repeatEntry(meal, { userId: 'u1', day: '2026-11-25', msgId: 'new1' });
  assert.equal(e.user_id, 'u1');
  assert.equal(e.entry_date, '2026-11-25', 'the day open in the chat');
  assert.equal(e.parse_status, 'done', 'saved already read: never sent to the AI');
  assert.equal(e.raw_text, '2 ovos', 'the user bubble shows the meal name, never the old message text');
  const items = JSON.parse(e.parsed_items);
  assert.equal(items.length, 2);
  for (const it of items) {
    assert.equal(it.msg, 'new1', 'a new message id');
    for (const k of ['ask', 'ask_pending', 'ask_done', 'ask_skipped', 'days_ago', 'raw_text']) assert.ok(!(k in it), `no ${k}`);
    assert.equal(it.category, 'meal', 'the meal category is kept (journey review 2026-11-26)');
    assert.deepEqual(Object.keys(it).filter((k) => !['food', 'qty', 'unit', 'kcal', 'carb_g', 'protein_g', 'fat_g', 'fiber_g', 'confidence', 'category', 'asked', 'msg'].includes(k)), []);
  }
  assert.equal(e.kcal, 320);
  assert.equal(e.protein_g, 25);
  assert.equal(e.carb_g, 1);
  assert.equal(e.fat_g, 23);
  // Inserted as 'done': the offline catch-up never reads it again.
  assert.deepEqual(rowsToReparse([{ id: 9, ...e }], [], TODAY), []);
  // Shown as its own message in the thread (new msg → not merged with the original).
  nextId = 700;
  const orig = row(TODAY, 7, eggs);
  const th = buildThread([orig, { id: 701, ...e, entry_date: TODAY, created_at: at(TODAY, 9), sync_status: 'pending' }], { todayISO: TODAY });
  assert.equal(th.filter((x) => x.type === 'user').length, 2);
  assert.equal(th.filter((x) => x.type === 'entry').length, 2);
});

test('FR-4: an estimate the user never fixed keeps its estimate flag; a fixed value stays fixed', () => {
  const skipped = { food: 'iogurte', qty: 1, unit: 'pote', kcal: 100, confidence: 'medium', asked: true, ask: { kind: 'size' }, ask_skipped: true };
  const low = { food: 'torrada', qty: 2, unit: 'fatias', kcal: 160, confidence: 'low' };
  const fixed = { food: 'arroz', qty: 1, unit: '', kcal: 200, confidence: 'user', asked: true };
  const items = JSON.parse(repeatEntry({ label: 'x', items: [skipped, low, fixed] }, { userId: 'u1', day: TODAY, msgId: 'n' }).parsed_items);
  assert.equal(needsEstimateFlag(items[0]), true);
  assert.equal(needsEstimateFlag(items[1]), true);
  assert.equal(needsEstimateFlag(items[2]), false);
  assert.ok(!items[0].ask, 'no open question comes with it');
});

test('FR-7: a tap logs only while the food log is open (the same free days / Premium rule as typing)', () => {
  assert.equal(canRepeat({ canLog: true, mode: 'free_days' }), true);
  assert.equal(canRepeat({ canLog: true, mode: 'premium' }), true);
  assert.equal(canRepeat({ canLog: false, mode: 'locked' }), false);
  assert.equal(canRepeat(null), false, 'access not known yet: no tap');
});

test('FR-12: the goodbye promises the next question only when that meal reminder is on', () => {
  const meals = [{ at: '07:30', kind: 'breakfast' }, { at: '12:30', kind: 'lunch' }, { at: '19:30', kind: 'dinner' }];
  const base = { todayISO: TODAY, entryDay: TODAY, nowMs: new Date(2026, 10, 26, 15, 5).getTime(), meals, remindersOn: true, checkOpen: true, access: { canLog: true, mode: 'premium' }, entries: [] };
  const next = goodbyeFor(base);
  assert.equal(next.kind, 'dinner');
  assert.equal(next.at, '20:30', 'the time the reminder really comes (one hour after the meal, MR-5)');
  assert.equal(goodbyeFor({ ...base, remindersOn: false }), null, 'reminders off in Settings');
  assert.equal(goodbyeFor({ ...base, meals: null }), null, 'no meal times chosen: only the 20:00 question, no meal to name');
  assert.equal(goodbyeFor({ ...base, checkOpen: false }), null, 'no reminders without an open reality check');
  assert.equal(goodbyeFor({ ...base, access: { canLog: false, mode: 'locked' } }), null, 'locked: no reminders');
  assert.equal(goodbyeFor({ ...base, closed: true }), null, 'the day was closed');
  assert.equal(goodbyeFor({ ...base, entryDay: '2026-11-25' }), null, 'an entry for an earlier day promises nothing about today');
  assert.equal(goodbyeFor({ ...base, nowMs: new Date(2026, 10, 26, 21).getTime() }), null, 'no reminder left today');
  // Food logged in the lunch window silences the lunch reminder (MR-6): the next one is dinner.
  const lunchLogged = [{ id: 1, source: 'ai', parse_status: 'done', entry_date: TODAY, created_at: at(TODAY, 12, 40), kcal: 500 }];
  const g = goodbyeFor({ ...base, nowMs: new Date(2026, 10, 26, 12, 41).getTime(), entries: lunchLogged });
  assert.equal(g.kind, 'dinner');
  const custom = goodbyeFor({ ...base, meals: [{ at: '16:00', kind: 'snack' }, { at: '19:30', kind: 'dinner' }], nowMs: new Date(2026, 10, 26, 13).getTime() });
  assert.deepEqual([custom.kind, custom.at], ['snack', '17:00']);
});
