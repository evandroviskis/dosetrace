'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { dayTotals, rollingAvgKcal, groupByDay } = require('../lib/nutrition');

test('dayTotals: sums Cal/Carbs/Protein and rounds; ignores junk', () => {
  const t = dayTotals([
    { kcal: 480, protein_g: 26, carb_g: 55 },
    { kcal: 640.4, protein_g: 59, carb_g: 72 },
    { kcal: null, protein_g: 'x', carb_g: undefined },
  ]);
  assert.deepEqual(t, { kcal: 1120, protein_g: 85, carb_g: 127 });
});

test('dayTotals: empty -> zeros', () => {
  assert.deepEqual(dayTotals([]), { kcal: 0, protein_g: 0, carb_g: 0 });
  assert.deepEqual(dayTotals(null), { kcal: 0, protein_g: 0, carb_g: 0 });
});

test('rollingAvgKcal: averages over LOGGED days only, inside the window', () => {
  const entries = [
    { entry_date: '2026-09-10', kcal: 2000 },
    { entry_date: '2026-09-10', kcal: 200 },  // same day sums to 2200
    { entry_date: '2026-09-08', kcal: 1800 },
    { entry_date: '2026-09-01', kcal: 9999 }, // outside a 7-day window ending 09-10
  ];
  const r = rollingAvgKcal(entries, '2026-09-10', 7);
  // window 09-04..09-10: logged days = 09-10 (2200) and 09-08 (1800) → avg 2000
  assert.equal(r.loggedDays, 2);
  assert.equal(r.avgKcal, 2000);
});

test('rollingAvgKcal: an unlogged day is NOT counted as zero', () => {
  // Only one logged day in the window → the average is that day, not diluted by 6 zeros.
  const r = rollingAvgKcal([{ entry_date: '2026-09-10', kcal: 1800 }], '2026-09-10', 7);
  assert.equal(r.avgKcal, 1800);
  assert.equal(r.loggedDays, 1);
});

test('rollingAvgKcal: no logged days in window -> null', () => {
  assert.equal(rollingAvgKcal([{ entry_date: '2026-08-01', kcal: 2000 }], '2026-09-10', 7), null);
  assert.equal(rollingAvgKcal([], '2026-09-10', 7), null);
});

test('groupByDay: groups entries per day, newest first, with per-day totals', () => {
  const g = groupByDay([
    { entry_date: '2026-09-10', kcal: 400, carb_g: 10, protein_g: 20 },
    { entry_date: '2026-09-10', kcal: 600, carb_g: 30, protein_g: 40 },
    { entry_date: '2026-09-09', kcal: 500, carb_g: 15, protein_g: 25 },
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].date, '2026-09-10');           // newest first
  assert.equal(g[0].entries.length, 2);
  assert.deepEqual(g[0].totals, { kcal: 1000, carb_g: 40, protein_g: 60 });
  assert.equal(g[1].date, '2026-09-09');
  assert.equal(g[1].totals.kcal, 500);
});

test('groupByDay: empty -> []', () => {
  assert.deepEqual(groupByDay([]), []);
  assert.deepEqual(groupByDay(null), []);
});

// ── Reality-check window intake (founder 2026-09-24: not day by day) ──
const { entryDateFor, splitByDay } = require('../lib/nutrition');

test('entryDateFor: "3 days ago" moves the entry back; nothing said keeps the typed day', () => {
  assert.equal(entryDateFor('2026-09-06', 3), '2026-09-03');
  assert.equal(entryDateFor('2026-09-06', 0), '2026-09-06');
  assert.equal(entryDateFor('2026-09-06', null), '2026-09-06');
  assert.equal(entryDateFor('2026-03-01', 1), '2026-02-28');
  assert.equal(entryDateFor('2026-09-06', -2), '2026-09-06', 'never into the future');
  assert.equal(entryDateFor('2026-09-06', 9999), '2025-09-06', 'clamped to a year');
});

test('splitByDay: a multi-day catch-up becomes one entry per day eaten', () => {
  const items = [
    { food: 'pizza', kcal: 800, protein_g: 30, carb_g: 90, fat_g: 30, days_ago: 3 },
    { food: 'salad', kcal: 300, protein_g: 10, carb_g: 20, fat_g: 15, days_ago: 2 },
    { food: 'coffee', kcal: 5, protein_g: 0, carb_g: 1, fat_g: 0, days_ago: null },
  ];
  const g = splitByDay(items, '2026-09-10', null);
  assert.deepEqual(g.map((x) => [x.entry_date, x.totals.kcal]), [['2026-09-07', 800], ['2026-09-08', 300], ['2026-09-10', 5]]);
  // message-level days_ago applies to items that don't carry their own
  assert.deepEqual(splitByDay([{ food: 'ice cream', kcal: 270 }], '2026-09-10', 3).map((x) => x.entry_date), ['2026-09-07']);
});

// ── FL-3: "not recorded" days ──
const { unloggedCheckDays, closedDays, notRecordedDays, isMarker } = require('../lib/nutrition');
const NR = (d, id) => ({ id, entry_date: d, source: 'not_recorded', kcal: 0, parse_status: 'done', raw_text: '' });

test('unloggedCheckDays: past days of the check with nothing logged, newest first, with their marks', () => {
  const e = [{ entry_date: '2026-09-01', kcal: 2000 }, NR('2026-09-03', 7), { entry_date: '2026-09-06', kcal: 300 }];
  assert.deepEqual(unloggedCheckDays(e, '2026-09-01', '2026-09-06'), [
    { date: '2026-09-05', notRecorded: false, markerIds: [] },
    { date: '2026-09-04', notRecorded: false, markerIds: [] },
    { date: '2026-09-03', notRecorded: true, markerIds: [7] },
    { date: '2026-09-02', notRecorded: false, markerIds: [] },
  ]);
  assert.deepEqual(unloggedCheckDays(e, '2026-09-06', '2026-09-06'), [], 'today is never offered');
});

test('markers: day_closed and not_recorded rows are markers, not food', () => {
  assert.equal(isMarker({ source: 'day_closed' }), true);
  assert.equal(isMarker({ source: 'not_recorded' }), true);
  assert.equal(isMarker({ source: 'ai' }), false);
  assert.deepEqual([...closedDays([{ source: 'day_closed', entry_date: '2026-09-06' }, { source: 'ai', entry_date: '2026-09-05' }])], ['2026-09-06']);
});

// ── FL-4/5/6/25: one question at a time about the rest of today ──
const { pickDayQuestion, todayCategories, isDoneText } = require('../lib/nutrition');
const row = (d, cats) => ({ entry_date: d, source: 'ai', parse_status: 'done', parsed_items: JSON.stringify(cats.map((c) => ({ food: 'x', kcal: 100, category: c }))) });
const T = '2026-09-10';
const noon = new Date('2026-09-10T12:00:00');

test('pickDayQuestion: asks about the absent categories, one at a time, then one open "anything else", then stops', () => {
  const e = [row(T, ['meal'])];
  assert.deepEqual(pickDayQuestion(e, T, [], noon, false), { id: 'snack', tense: 'neutral' });
  assert.deepEqual(pickDayQuestion(e, T, ['snack'], noon, false), { id: 'drink', tense: 'neutral' });
  assert.deepEqual(pickDayQuestion(e, T, ['snack', 'drink'], noon, false), { id: 'supplement', tense: 'neutral' });
  assert.deepEqual(pickDayQuestion(e, T, ['snack', 'drink', 'supplement'], noon, false), { id: 'more', tense: 'forward' });
  assert.equal(pickDayQuestion(e, T, ['snack', 'drink', 'supplement', 'more'], noon, false), null);
});

test('pickDayQuestion: a category already logged today is never asked', () => {
  const e = [row(T, ['drink']), row(T, ['snack', 'supplement'])];
  assert.deepEqual(pickDayQuestion(e, T, [], noon, false), { id: 'meal', tense: 'forward' });
  assert.deepEqual(pickDayQuestion(e, T, ['meal'], noon, false), { id: 'more', tense: 'forward' });
});

test('pickDayQuestion: time-aware tense — from 19:00 the day is asked about in the past tense', () => {
  const e = [row(T, ['drink'])];
  assert.deepEqual(pickDayQuestion(e, T, [], new Date('2026-09-10T20:00:00'), false), { id: 'meal', tense: 'past' });
  assert.deepEqual(pickDayQuestion(e, T, [], new Date('2026-09-10T15:00:00'), false), { id: 'meal', tense: 'forward' });
});

test('pickDayQuestion: a closed day is never asked again', () => {
  assert.equal(pickDayQuestion([row(T, ['meal'])], T, [], noon, true), null);
});

test('pickDayQuestion: food dated to an earlier day never counts toward today (FL-25)', () => {
  // "pizza and a beer on Monday", typed today, lands on Monday — today still has no drink
  const e = [row('2026-09-07', ['meal', 'drink']), row(T, ['meal'])];
  assert.deepEqual([...todayCategories(e, T)], ['meal']);
  assert.deepEqual(pickDayQuestion(e, T, ['snack'], noon, false), { id: 'drink', tense: 'neutral' });
  // only a catch-up logged, nothing today → no question about today
  assert.equal(pickDayQuestion([row('2026-09-07', ['meal'])], T, [], noon, false), null);
});

test('todayCategories: items saved before categories existed count as a meal; markers ignored', () => {
  const e = [{ entry_date: T, source: 'ai', parsed_items: '[{"food":"toast","kcal":90}]' }, { entry_date: T, source: 'day_closed', parsed_items: '[]' }];
  assert.deepEqual([...todayCategories(e, T)], ['meal']);
});

test('isDoneText: "that\'s it" and equivalents close the day in all 6 languages', () => {
  const done = ["that's it", 'That’s all for today!', 'nothing else', 'no, that is all, thanks', 'done for today', 'Nothing else today',
    'eso es todo', 'nada más', 'listo por hoy', 'é isso', 'só isso por hoje', "c'est tout", 'rien d’autre', "das war's", 'nichts mehr heute', 'fertig für heute', 'è tutto', "nient'altro per oggi"];
  for (const t of done) assert.equal(isDoneText(t), true, t);
});

test('isDoneText: a real meal (even one containing a done-word) is never swallowed', () => {
  for (const t of ['2 eggs and toast', "that's it: a coffee", 'no sugar coffee', 'done: pizza', 'nada de azúcar, un café', '', '   '])
    assert.equal(isDoneText(t), false, t);
});

// ── FL-8/9: quantity shown; low-confidence flagged ──
const { itemLabel, isLowConfidence } = require('../lib/nutrition');

test('itemLabel: the quantity is always shown — "2 × BUILT Puff", "150 g rice"', () => {
  assert.equal(itemLabel({ food: 'BUILT Puff', qty: 2, unit: 'bar' }), '2 × BUILT Puff');
  assert.equal(itemLabel({ food: 'rice', qty: 150, unit: 'g' }), '150 g rice');
  assert.equal(itemLabel({ food: 'orange juice', qty: 250, unit: 'ml' }), '250 ml orange juice');
  assert.equal(itemLabel({ food: 'eggs', qty: 3, unit: 'egg' }), '3 × eggs');
  assert.equal(itemLabel({ food: 'coffee', qty: 1, unit: '' }), '1 × coffee');
  assert.equal(itemLabel({ food: 'oats', qty: 0.5, unit: 'cup' }), '0.5 cup oats');
  assert.equal(itemLabel({ food: 'soup', qty: null, unit: '' }), 'soup', 'no quantity known → the name alone');
});

test('isLowConfidence: only "low" items are flagged as estimates', () => {
  assert.equal(isLowConfidence({ confidence: 'low' }), true);
  assert.equal(isLowConfidence({ confidence: 'med' }), false);
  assert.equal(isLowConfidence({ confidence: 'user' }), false);
});

// ── FL-14: today's earlier items go along as context ──
const { recentForParse } = require('../lib/nutrition');

test('recentForParse: only today\'s parsed items, oldest first, max 12, never markers or other days', () => {
  const e = [
    { entry_date: '2026-09-09', source: 'ai', parse_status: 'done', parsed_items: '[{"food":"old","qty":1,"unit":"","kcal":100}]' },
    { entry_date: T, source: 'ai', parse_status: 'done', parsed_items: '[{"food":"BUILT Puff","qty":2,"unit":"bar","kcal":280,"protein_g":34}]' },
    { entry_date: T, source: 'ai', parse_status: 'pending', parsed_items: null, raw_text: 'x' },
    { entry_date: T, source: 'day_closed', parse_status: 'done', parsed_items: '[]' },
  ];
  assert.deepEqual(recentForParse(e, T), [{ food: 'BUILT Puff', qty: 2, unit: 'bar', kcal: 280 }]);
  const many = [{ entry_date: T, source: 'ai', parse_status: 'done', parsed_items: JSON.stringify(Array.from({ length: 15 }, (_, i) => ({ food: 'f' + i, qty: 1, unit: '', kcal: i }))) }];
  const r = recentForParse(many, T);
  assert.equal(r.length, 12);
  assert.equal(r[11].food, 'f14');
});

// ── FL-10/26/28: a follow-up changes only the asked item of the same entry ──
const { applyFollowup, followupStillValid } = require('../lib/nutrition');

test('applyFollowup: replaces only the asked item and recomputes the entry total', () => {
  const items = [
    { food: 'eggs', qty: 2, unit: 'egg', kcal: 140, protein_g: 12, carb_g: 1, fat_g: 10, confidence: 'high', category: 'meal', days_ago: null },
    { food: 'protein bar', qty: 1, unit: 'bar', kcal: 200, protein_g: 20, carb_g: 20, fat_g: 7, confidence: 'low', category: 'snack', days_ago: 2 },
  ];
  const r = applyFollowup(items, 1, { food: 'BUILT Puff', qty: 1, unit: 'bar', kcal: 140, protein_g: 17, carb_g: 18, fat_g: 3, confidence: 'high', category: 'snack', days_ago: null });
  assert.deepEqual(r.items[0], items[0], 'the clear item is untouched');
  assert.equal(r.items[1].food, 'BUILT Puff');
  assert.equal(r.items[1].days_ago, 2, 'keeps the entry date');
  assert.deepEqual(r.totals, { kcal: 280, protein_g: 29, carb_g: 19, fat_g: 13 });
  assert.equal(applyFollowup(items, 5, { food: 'x' }), null, 'bad index → nothing');
  assert.equal(applyFollowup(items, 1, null), null);
});

test('followupStillValid: an answer applies only while the entry is unchanged; edited or deleted → dropped', () => {
  const items = [{ food: 'rice', qty: 1, unit: 'cup', kcal: 200 }];
  const pending = { entry_date: '2026-09-10', count: 1, index: 0, item: { food: 'rice', qty: 1, unit: 'cup', kcal: 200 } };
  const r = { id: 4, entry_date: '2026-09-10', parsed_items: JSON.stringify(items), sync_status: 'synced', updated_at: 'cloud-restamped' };
  assert.equal(followupStillValid(r, pending), true, 'a sync re-stamp alone does not drop it');
  assert.equal(followupStillValid({ ...r, sync_status: 'deleted' }, pending), false);
  assert.equal(followupStillValid(null, pending), false);
  assert.equal(followupStillValid({ ...r, parsed_items: JSON.stringify([{ ...items[0], kcal: 250 }]) }, pending), false, 'user fixed the item');
  assert.equal(followupStillValid({ ...r, entry_date: '2026-09-09' }, pending), false, 'moved to another day');
});

// ── FL-24: a day runs midnight to midnight in the user's time zone ──
test('local midnight: a 23:30 meal in Los Angeles is that local day, not the UTC day', () => {
  const prev = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    const { localISOForTest } = require('./helpers/localISO.cjs');
    const lateNight = new Date('2026-09-10T06:30:00Z'); // 23:30 on 09-09 in LA; already 09-10 in UTC
    assert.equal(localISOForTest(lateNight), '2026-09-09');
    assert.notEqual(lateNight.toISOString().slice(0, 10), '2026-09-09', 'the UTC date would be wrong');
    const justAfter = new Date('2026-09-10T07:05:00Z'); // 00:05 on 09-10 local
    assert.equal(localISOForTest(justAfter), '2026-09-10');
    // entries typed either side of LOCAL midnight land on separate days with separate totals
    const g = groupByDay([
      { entry_date: localISOForTest(lateNight), kcal: 500, carb_g: 0, protein_g: 0 },
      { entry_date: localISOForTest(justAfter), kcal: 200, carb_g: 0, protein_g: 0 },
    ]);
    assert.deepEqual(g.map((x) => [x.date, x.totals.kcal]), [['2026-09-10', 200], ['2026-09-09', 500]]);
  } finally {
    if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
  }
});

// ── FL-29/6: only explicit phrases close the day; a bare "no" answers the question ──
const { isNoText } = require('../lib/nutrition');

test('isDoneText: a bare "no" / "nope" / "nada" never closes the day (all 6 languages)', () => {
  for (const t of ['no', 'No.', 'nope', 'nah', 'nothing', 'not yet', 'done', 'nada', 'no gracias', 'não', 'ainda não', 'non', 'rien', 'nein', 'nichts', 'niente', 'no grazie', 'fertig', 'finito'])
    assert.equal(isDoneText(t), false, t);
});

test('isNoText: a bare "no" dismisses the question on screen (6 languages); closing phrases and meals are not a bare no', () => {
  for (const t of ['no', 'Nope!', 'no thanks', 'not yet', 'nada', 'no, gracias', 'não', 'non merci', 'nein danke', 'noch nicht', 'niente', 'no grazie'])
    assert.equal(isNoText(t), true, t);
  for (const t of ["that's it", 'nothing else today', 'no sugar coffee', '2 eggs', '', 'no, that is all'])
    assert.equal(isNoText(t), false, t);
});

// ── FL-14: "another one" with nothing logged today → the app asks, no AI call ──
const { refersToEarlier, mustAskWhichEarlier } = require('../lib/nutrition');

test('refersToEarlier: "another one" / "same as …" without a food named, in all 6 languages', () => {
  for (const t of ['another one', 'Another!', 'one more', 'same again', 'the same as breakfast', 'same as lunch',
    'otro', 'lo mismo que en el desayuno', 'outro', 'mais um', 'o mesmo do almoço', 'un autre', 'encore une', 'la même chose que ce matin',
    'noch einer', 'nochmal', 'das gleiche wie zum Frühstück', 'un altro', "un'altra", 'lo stesso di pranzo'])
    assert.equal(refersToEarlier(t), true, t);
  for (const t of ['another coffee', 'one more beer and fries', 'otro café', 'mais um pão de queijo', 'un autre croissant', 'noch ein Bier', 'un altro caffè', '2 eggs', ''])
    assert.equal(refersToEarlier(t), false, t);
});

test('mustAskWhichEarlier: asks only when nothing was logged today', () => {
  assert.equal(mustAskWhichEarlier('another one', []), true);
  assert.equal(mustAskWhichEarlier('another one', [{ food: 'BUILT Puff', qty: 1, unit: 'bar', kcal: 140 }]), false, 'something today → the parser resolves it');
  assert.equal(mustAskWhichEarlier('another coffee', []), false, 'a named food is just parsed');
});

// ── FL-27: an unanswered follow-up keeps the item flagged ──
const { needsEstimateFlag } = require('../lib/nutrition');

test('needsEstimateFlag: an asked item stays flagged at any confidence until answered or fixed', () => {
  assert.equal(needsEstimateFlag({ confidence: 'high', asked: true }), true, 'skipped / new meal typed instead');
  assert.equal(needsEstimateFlag({ confidence: 'low' }), true);
  assert.equal(needsEstimateFlag({ confidence: 'med' }), false);
  assert.equal(needsEstimateFlag({ confidence: 'user', asked: true }), false, 'the user fixed it');
  const answered = applyFollowup([{ food: 'bar', qty: 1, unit: 'bar', kcal: 200, confidence: 'high', asked: true }], 0, { food: 'BUILT Puff', qty: 1, unit: 'bar', kcal: 140, confidence: 'high' });
  assert.equal(needsEstimateFlag(answered.items[0]), false, 'a follow-up answer clears it');
});

// ── FL-7/8: the echo never silently drops items ──
const { echoParts } = require('../lib/nutrition');

test('echoParts: up to 3 items, then how many more', () => {
  const it = (f) => ({ food: f, qty: 1, unit: '', kcal: 10 });
  assert.deepEqual(echoParts([it('a'), it('b')]).more, 0);
  const r = echoParts([it('a'), it('b'), it('c'), it('d'), it('e')]);
  assert.deepEqual(r.shown.map((x) => x.food), ['a', 'b', 'c']);
  assert.equal(r.more, 2);
});

// ── FL-24: totals per day, per week and for the whole window ──
const { periodTotals } = require('../lib/nutrition');

test('periodTotals: today, the last 7 local days and the whole window, each with its working', () => {
  const e = [
    { entry_date: '2026-09-10', kcal: 600, protein_g: 40, carb_g: 50 },
    { entry_date: '2026-09-10', kcal: 400, protein_g: 20, carb_g: 30 },
    { entry_date: '2026-09-08', kcal: 2100, protein_g: 120, carb_g: 200 },
    { entry_date: '2026-09-02', kcal: 1800, protein_g: 90, carb_g: 150 }, // outside the 7 days
    { entry_date: '2026-09-06', source: 'not_recorded', kcal: 0 },
  ];
  assert.deepEqual(periodTotals(e, '2026-09-10', '2026-09-10'), { kcal: 1000, protein_g: 60, carb_g: 80, days: 1, loggedDays: 1, avgKcal: 1000 });
  const week = periodTotals(e, '2026-09-04', '2026-09-10');
  assert.equal(week.kcal, 3100);
  assert.equal(week.days, 6, '7 days − 1 marked not recorded');
  assert.equal(week.loggedDays, 2);
  assert.equal(week.avgKcal, 517);
  const whole = periodTotals(e, '2026-09-01', '2026-09-10');
  assert.equal(whole.kcal, 4900);
  assert.equal(whole.days, 9);
  assert.equal(periodTotals(e, '2026-09-10', '2026-09-01'), null);
});

// ── FL-19: rows typed on this device are parsed even after sync gave them a remote_id ──
const { rowsToReparse, localRowKey } = require('../lib/nutrition');

test('rowsToReparse: this device\'s pending rows are retried after upload; another device\'s are left alone', () => {
  const mine = { id: 5, created_at: '2026-09-10T08:00:00Z', remote_id: 'r-5', raw_text: 'toast', parse_status: 'pending', source: 'ai' };
  const neverSynced = { id: 6, created_at: '2026-09-10T09:00:00Z', remote_id: null, raw_text: 'eggs', parse_status: 'pending', source: 'ai' };
  const otherDevice = { id: 7, created_at: '2026-09-10T10:00:00Z', remote_id: 'r-7', raw_text: 'rice', parse_status: 'pending', source: 'ai' };
  const done = { id: 8, created_at: 'x', remote_id: 'r-8', raw_text: 'y', parse_status: 'done', source: 'ai' };
  const marker = { id: 9, created_at: 'x', remote_id: null, raw_text: 'z', parse_status: 'pending', source: 'day_closed' };
  const keys = new Set([localRowKey(mine), localRowKey(done)]);
  assert.deepEqual(rowsToReparse([mine, neverSynced, otherDevice, done, marker], keys).map((r) => r.id), [5, 6]);
  // a reused local id with a different created_at (after a re-install) is not "mine"
  assert.deepEqual(rowsToReparse([{ ...otherDevice, id: 5 }], keys).map((r) => r.id), []);
});

// ── FL-2/45: food from more than 7 days ago is not logged ──
const { withinCatchUp } = require('../lib/nutrition');

test('withinCatchUp: items up to 7 days back are kept, older ones are dropped (the rest of the message still saves)', () => {
  const items = [
    { food: 'pizza', days_ago: 7 },
    { food: 'cake', days_ago: 8 },
    { food: 'coffee', days_ago: null },
  ];
  const r = withinCatchUp(items, null);
  assert.deepEqual(r.keep.map((x) => x.food), ['pizza', 'coffee']);
  assert.deepEqual(r.dropped.map((x) => x.food), ['cake']);
  // a message-level "two weeks ago" drops the items that don't say otherwise
  const top = withinCatchUp([{ food: 'steak' }, { food: 'tea', days_ago: 1 }], 14);
  assert.deepEqual(top.keep.map((x) => x.food), ['tea']);
  assert.deepEqual(top.dropped.map((x) => x.food), ['steak']);
});

const { catchUpOutcome } = require('../lib/nutrition');

test('catchUpOutcome: when only SOME items are too old, the recent part saves and the full typed text goes back in the box (nothing lost)', () => {
  const raw = 'pizza 2 weeks ago and a coffee today';
  const some = catchUpOutcome([{ food: 'pizza', days_ago: 14 }, { food: 'coffee', days_ago: null }], null, raw);
  assert.deepEqual(some.save.map((x) => x.food), ['coffee']);
  assert.deepEqual(some.dropped.map((x) => x.food), ['pizza']);
  assert.equal(some.putBack, raw);
  assert.equal(some.notice, 'too_old_some');
  const all = catchUpOutcome([{ food: 'pizza', days_ago: 14 }], null, 'pizza 2 weeks ago');
  assert.equal(all.save.length, 0);
  assert.equal(all.putBack, 'pizza 2 weeks ago');
  assert.equal(all.notice, 'too_old');
  const none = catchUpOutcome([{ food: 'coffee', days_ago: 2 }], null, 'coffee 2 days ago');
  assert.deepEqual({ putBack: none.putBack, notice: none.notice }, { putBack: null, notice: null });
});

// ── FL-3 (revised): intake only from ≥ 7 CONSECUTIVE complete days ──
const { intakeRun } = require('../lib/nutrition');
const F = (d, k) => ({ entry_date: d, kcal: k, parse_status: 'done', source: 'ai' });
const CL = (d) => ({ entry_date: d, source: 'day_closed', kcal: 0, parse_status: 'done' });
const D = (n) => '2026-09-' + (n < 10 ? '0' + n : '' + n);

test('intakeRun: 7 consecutive complete days → the intake is their average', () => {
  const e = []; for (let i = 1; i <= 7; i++) e.push(F(D(i), 2000 + i * 10));
  const r = intakeRun(e, D(1), D(8));
  assert.equal(r.ok, true);
  assert.equal(r.days, 7);
  assert.equal(r.totalKcal, 14280);
  assert.equal(r.avgKcal, 2040);
  assert.deepEqual([r.fromISO, r.toISO], [D(1), D(7)]);
});

test('intakeRun: a gap or a "not recorded" day breaks the run — no intake until 7 in a row, with progress', () => {
  const e = [F(D(1), 2000), F(D(2), 2000), F(D(3), 2000), /* gap on 4 */ F(D(5), 2000), F(D(6), 2000), F(D(7), 2000), F(D(8), 2000)];
  const r = intakeRun(e, D(1), D(9));
  assert.deepEqual(r, { ok: false, current: 4, needed: 7 }, '4 of 7 so far');
  const marked = [...e, { entry_date: D(4), source: 'not_recorded', kcal: 0 }];
  assert.deepEqual(intakeRun(marked, D(1), D(9)), { ok: false, current: 4, needed: 7 }, 'marked not recorded → the run is broken');
  const caughtUp = [...marked, F(D(4), 2000)];
  assert.equal(intakeRun(caughtUp, D(1), D(9)).days, 8, 'food logged later for that day: the day is complete again');
});

// FL-47 (founder 2026-09-27, recommended option): a day closed with NO food logged
// breaks the run unless the user confirmed "I ate nothing" — only then it is a 0-kcal day.
const AN = (d) => ({ entry_date: d, source: 'ate_nothing', kcal: 0, parse_status: 'done' });
test('intakeRun: a day with food counts once closed; a day closed with NO food breaks the run unless "I ate nothing" was confirmed (FL-47)', () => {
  const e = [F(D(1), 1800), CL(D(2)), F(D(3), 2100), F(D(4), 2000), F(D(5), 1900), F(D(6), 2000), F(D(7), 2200), CL(D(7))];
  assert.deepEqual(intakeRun(e, D(1), D(7)), { ok: false, current: 5, needed: 7 }, 'day 2 closed but empty → the run restarts on day 3');
  const confirmed = [...e, AN(D(2))];
  const r = intakeRun(confirmed, D(1), D(7));
  assert.equal(r.ok, true, '"I ate nothing" confirmed → a 0-kcal day that counts');
  assert.equal(r.days, 7);
  assert.equal(r.totalKcal, 1800 + 0 + 2100 + 2000 + 1900 + 2000 + 2200);
  const notYet = intakeRun(confirmed.filter((x) => !(x.source === 'day_closed' && x.entry_date === D(7))), D(1), D(7));
  assert.deepEqual(notYet, { ok: false, current: 6, needed: 7 }, 'today (day 7) not closed yet → not counted');
});

test('FL-47: "ate_nothing" is a marker (never food), and the chat asks before closing an empty day', () => {
  const { isMarker } = require('../lib/nutrition');
  assert.equal(isMarker(AN(D(2))), true);
  const fs = require('fs'); const path = require('path');
  const db = fs.readFileSync(path.join(__dirname, '..', 'lib', 'database.js'), 'utf8');
  assert.match(db, /['not_recorded', 'day_closed', 'free_start', 'ate_nothing']/);
  const chat = fs.readFileSync(path.join(__dirname, '..', 'screens', 'FoodChatScreen.js'), 'utf8');
  const i = chat.indexOf('async function closeDay(');
  for (const k of ['nutri_close_empty_title', 'nutri_close_ate_nothing', 'nutri_close_just_close']) assert.ok(chat.slice(i, i + 1600).includes(k), k);
  assert.match(chat.slice(i, i + 1600), /ate_nothing/);
});

test('intakeRun: the MOST RECENT run of 7+ is used; days before the check start never count', () => {
  const e = [];
  for (let i = 1; i <= 8; i++) e.push(F(D(i), 1000));   // run A: 1–8 (8 days)
  for (let i = 10; i <= 16; i++) e.push(F(D(i), 3000)); // run B: 10–16 (7 days) — gap on 9
  e.push(F('2026-08-30', 9999));                          // before the start
  const r = intakeRun(e, D(1), D(17));
  assert.deepEqual([r.fromISO, r.toISO, r.days, r.avgKcal], [D(10), D(16), 7, 3000]);
  assert.equal(intakeRun(e, D(2), D(9)).fromISO, D(2), 'window starts at the check start');
});

test('intakeRun: offline-pending entries do not make a day complete', () => {
  const e = []; for (let i = 1; i <= 6; i++) e.push(F(D(i), 2000));
  e.push({ entry_date: D(7), kcal: null, parse_status: 'pending', source: 'ai', raw_text: 'x' });
  assert.equal(intakeRun(e, D(1), D(8)).ok, false);
});
