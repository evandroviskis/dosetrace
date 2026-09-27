'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  typedDay, messageKey, dayWord, openFollowup, pendingAnswers, buildThread,
  shouldAutoClose, autoCloseBlocked, AUTO_CLOSE_MS, todayFoodHeroPolicy, todaySummary, newMessageId,
} = require('../lib/foodThread');

// Local-time ISO for "typed at" (the tests run in any TZ).
const at = (day, hh, mm = 0) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, hh, mm).toISOString(); };
const T = '2026-09-10';
const Y = '2026-09-09';
const row = (id, o) => ({ id, source: 'ai', parse_status: 'done', sync_status: 'synced', ...o });
const items = (arr) => JSON.stringify(arr);

test('buildThread: one message = one bubble; a multi-day catch-up shows one bubble with an entry card per day (FL-38)', () => {
  const msg = 'k1';
  const rows = [
    row(1, { raw_text: 'pizza monday and a salad yesterday', entry_date: '2026-09-07', created_at: at(T, 9), parsed_items: items([{ food: 'pizza', kcal: 800, msg }]) }),
    row(2, { raw_text: 'pizza monday and a salad yesterday', entry_date: Y, created_at: at(T, 9, 1), parsed_items: items([{ food: 'salad', kcal: 300, msg }]) }),
  ];
  const th = buildThread(rows, { todayISO: T });
  assert.equal(th.filter((x) => x.type === 'user').length, 1, 'not duplicated');
  assert.deepEqual(th.filter((x) => x.type === 'entry').map((x) => x.entry_date), ['2026-09-07', Y]);
  assert.equal(th.filter((x) => x.type === 'echo').length, 1);
  assert.equal(th.find((x) => x.type === 'echo').items.length, 2);
});

test('buildThread: messages in the order typed, with a day divider per typed day', () => {
  const rows = [
    row(3, { raw_text: 'lunch', entry_date: T, created_at: at(T, 13), parsed_items: items([{ food: 'rice', kcal: 300, msg: 'b' }]) }),
    row(1, { raw_text: 'dinner', entry_date: Y, created_at: at(Y, 20), parsed_items: items([{ food: 'soup', kcal: 200, msg: 'a' }]) }),
  ];
  const th = buildThread(rows, { todayISO: T, sinceISO: Y });
  assert.deepEqual(th.filter((x) => x.type === 'user' || x.type === 'divider').map((x) => x.type === 'divider' ? 'D' + x.day : x.text), ['D' + Y, 'dinner', 'D' + T, 'lunch']);
});

test('buildThread: midnight passing adds a divider for the new day (FL-40)', () => {
  const rows = [row(1, { raw_text: 'late snack', entry_date: Y, created_at: at(Y, 23, 50), parsed_items: items([{ food: 'chips', kcal: 150, msg: 'a' }]) })];
  const th = buildThread(rows, { todayISO: T, sinceISO: Y });
  assert.equal(th[th.length - 1].type, 'divider');
  assert.equal(th[th.length - 1].day, T);
});

test('buildThread: rebuilt from stored data only — pending, refused, closed, not-recorded, answered follow-ups (FL-35)', () => {
  const rows = [
    row(1, { raw_text: 'toast', entry_date: T, created_at: at(T, 8), parsed_items: items([{ food: 'toast', kcal: 90, msg: 'a', ask_done: { kind: 'amount', answer: '2 slices' } }]) }),
    row(2, { raw_text: 'eggs', entry_date: T, created_at: at(T, 9), parse_status: 'pending', parsed_items: null }),
    row(3, { raw_text: 'what should I eat?', entry_date: T, created_at: at(T, 10), parse_status: 'refused', parsed_items: null }),
    { id: 4, source: 'not_recorded', entry_date: '2026-09-05', created_at: at(T, 11), parse_status: 'done' },
    { id: 5, source: 'day_closed', entry_date: T, created_at: at(T, 21), parse_status: 'done' },
  ];
  const types = buildThread(rows, { todayISO: T }).map((x) => x.type);
  assert.deepEqual(types, ['divider', 'user', 'entry', 'echo', 'asked', 'user', 'user', 'refused', 'not_recorded', 'closed']);
  const pending = buildThread(rows, { todayISO: T }).find((x) => x.type === 'user' && x.text === 'eggs');
  assert.equal(pending.status, 'pending');
});

test('openFollowup: the stored ask survives closing the chat; skipped / pending / answered asks are not open (FL-38)', () => {
  const ask = { kind: 'brand', options: ['BUILT', 'Quest'] };
  const r = row(7, { entry_date: T, created_at: at(T, 12), parsed_items: items([{ food: 'eggs', kcal: 140 }, { food: 'protein bar', kcal: 200, asked: true, ask }]) });
  assert.deepEqual(openFollowup([r]), { rowId: 7, entry_date: T, index: 1, count: 2, item: { food: 'protein bar', kcal: 200, asked: true, ask }, kind: 'brand', options: ['BUILT', 'Quest'] });
  const skipped = row(7, { ...r, parsed_items: items([{ food: 'protein bar', kcal: 200, ask, ask_skipped: true }]) });
  assert.equal(openFollowup([skipped]), null);
  const pend = row(7, { ...r, parsed_items: items([{ food: 'protein bar', kcal: 200, ask, ask_pending: 'BUILT' }]) });
  assert.equal(openFollowup([pend]), null);
  assert.equal(pendingAnswers([pend])[0].answer, 'BUILT');
  assert.equal(pendingAnswers([pend])[0].kind, 'brand');
  const th = buildThread([r], { todayISO: T, question: { id: 'drink', tense: 'neutral' } });
  assert.equal(th[th.length - 1].type, 'followup', 'an open follow-up comes before any day question');
  assert.equal(th.filter((x) => x.type === 'question').length, 0);
});

test('messageKey: legacy rows without a message id group by text + typed day', () => {
  const a = row(1, { raw_text: 'x', entry_date: T, created_at: at(T, 9), parsed_items: items([{ food: 'a' }]) });
  const b = row(2, { raw_text: 'x', entry_date: Y, created_at: at(T, 9, 5), parsed_items: items([{ food: 'b' }]) });
  assert.equal(messageKey(a), messageKey(b));
  assert.equal(typedDay({ created_at: '2026-09-10 12:00:00' }).length, 10, 'SQLite UTC format parses');
});

test('dayWord: today / yesterday / other — a next-morning tap on last night\'s reminder is about yesterday (FL-40)', () => {
  assert.equal(dayWord(T, T), 'today');
  assert.equal(dayWord(Y, T), 'yesterday');
  assert.equal(dayWord('2026-09-01', T), 'other');
  assert.equal(dayWord('2026-02-28', '2026-03-01'), 'yesterday');
});

test('shouldAutoClose: idle 30 s with the keyboard down closes; any guard blocks it (FL-32/36)', () => {
  const base = { idleMs: AUTO_CLOSE_MS, keyboardVisible: false, text: '', sending: false, followupBusy: false, modalOpen: false, alertOpen: false, screenReader: false };
  assert.equal(shouldAutoClose(base, 'idle'), true);
  assert.equal(shouldAutoClose({ ...base, idleMs: AUTO_CLOSE_MS - 1 }, 'idle'), false);
  assert.equal(shouldAutoClose({ ...base, keyboardVisible: true }, 'idle'), false);
  for (const k of ['text', 'sending', 'followupBusy', 'modalOpen', 'alertOpen', 'screenReader']) {
    const s = { ...base, [k]: k === 'text' ? 'two eggs' : true };
    assert.equal(shouldAutoClose(s, 'idle'), false, k);
    assert.equal(shouldAutoClose(s, 'background'), false, k + ' (background)');
    assert.equal(autoCloseBlocked(s), true, k);
  }
  assert.equal(shouldAutoClose({ ...base, text: '   ' }, 'idle'), true, 'whitespace is not text');
  assert.equal(shouldAutoClose({ ...base, keyboardVisible: true, idleMs: 0 }, 'background'), true, 'leaving the app closes it');
});

test('todayFoodHeroPolicy: shown only while a check is open; day X of 21, then weigh-in due; locked for free users past the free days (FL-33)', () => {
  assert.deepEqual(todayFoodHeroPolicy({ rcStart: null, todayISO: T, premium: true }), { show: false });
  assert.deepEqual(todayFoodHeroPolicy({ rcStart: { date: T }, todayISO: T, premium: true }), { show: true, locked: false, day: 1, of: 21, weighInDue: false });
  assert.equal(todayFoodHeroPolicy({ rcStart: { date: '2026-08-21' }, todayISO: T, premium: true }).day, 21);
  assert.equal(todayFoodHeroPolicy({ rcStart: { date: '2026-08-20' }, todayISO: T, premium: true }).weighInDue, true);
  assert.equal(todayFoodHeroPolicy({ rcStart: { date: T }, todayISO: T, premium: false, trialDaysUsed: 3 }).locked, true);
  assert.equal(todayFoodHeroPolicy({ rcStart: { date: T }, todayISO: T, premium: false, trialDaysUsed: 1 }).locked, false);
});

test('todaySummary: today\'s items and ~kcal, or day closed', () => {
  const rows = [
    row(1, { entry_date: T, kcal: 300, parsed_items: items([{ food: 'a' }, { food: 'b' }]) }),
    row(2, { entry_date: Y, kcal: 999, parsed_items: items([{ food: 'c' }]) }),
    { id: 3, source: 'day_closed', entry_date: T },
  ];
  assert.deepEqual(todaySummary(rows, T), { items: 2, kcal: 300, closed: true });
});

test('newMessageId: distinct ids for distinct messages', () => {
  assert.notEqual(newMessageId(1000, 0.1), newMessageId(1000, 0.2));
});
