'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  typedDay, messageKey, dayWord, openFollowup, pendingAnswers, buildThread,
  shouldAutoClose, autoCloseBlocked, AUTO_CLOSE_MS, todayFoodHeroPolicy, todaySummary, newMessageId,
} = require('../lib/foodThread');

// Local-time ISO for "typed at" (the tests run in any TZ).
const at = (day, hh, mm = 0, ss = 0) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, hh, mm, ss).toISOString(); };
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

// ── FL-38: legacy rows (no message id) ──
const { legacyGroups } = require('../lib/foodThread');

test('legacy rows: the same text typed again later is a NEW bubble; rows written within ~2 minutes with the same text are one message', () => {
  const morning = row(1, { raw_text: '2 built puff bars', entry_date: T, created_at: at(T, 8, 0), parsed_items: items([{ food: 'BUILT Puff', qty: 2, kcal: 280 }]) });
  const split = row(2, { raw_text: '2 built puff bars', entry_date: Y, created_at: at(T, 8, 1), parsed_items: items([{ food: 'BUILT Puff', qty: 1, kcal: 140 }]) });
  const later = row(3, { raw_text: '2 built puff bars', entry_date: T, created_at: at(T, 15, 30), parsed_items: items([{ food: 'BUILT Puff', qty: 2, kcal: 280 }]) });
  const other = row(4, { raw_text: 'coffee', entry_date: T, created_at: at(T, 8, 0, 30), parsed_items: items([{ food: 'coffee', kcal: 5 }]) });
  const g = legacyGroups([later, other, split, morning]);
  assert.equal(g.get(1), g.get(2), 'written a minute apart: one message');
  assert.notEqual(g.get(1), g.get(3), 'hours later: a new message');
  assert.notEqual(g.get(1), g.get(4), 'different text: a different message');
  const th = buildThread([morning, split, later], { todayISO: T, sinceISO: Y });
  assert.equal(th.filter((x) => x.type === 'user').length, 2, 'two bubbles, not one');
  assert.deepEqual(th.filter((x) => x.type === 'echo').map((x) => x.items.length), [2, 1], 'no combined echo');
});

test('messageKey: rows with a message id group by it; legacy rows have none', () => {
  assert.equal(messageKey(row(1, { parsed_items: items([{ food: 'a', msg: 'k' }]) })), 'm:k');
  assert.equal(messageKey(row(1, { raw_text: 'x', parsed_items: items([{ food: 'a' }]) })), null);
  assert.equal(typedDay({ created_at: '2026-09-10 12:00:00' }).length, 10, 'SQLite UTC format parses');
});

// ── FL-41: access, free days and the grace week ──
const { foodLogAccess, checkWeekEnd, weighInDay } = require('../lib/foodThread');
const start = { date: '2026-09-01' }; // day 1 = 09-01, week 1 ends 09-07, week 2 ends 09-14

test('checkWeekEnd: weeks of the check are days 1–7 / 8–14 / 15–21 from its start', () => {
  assert.equal(checkWeekEnd('2026-09-01', '2026-09-01'), '2026-09-07');
  assert.equal(checkWeekEnd('2026-09-01', '2026-09-07'), '2026-09-07');
  assert.equal(checkWeekEnd('2026-09-01', '2026-09-08'), '2026-09-14');
  assert.equal(checkWeekEnd('2026-09-01', '2026-09-21'), '2026-09-21');
  assert.equal(weighInDay('2026-09-01'), '2026-09-22');
});

test('todayFoodHeroPolicy: ONLY while a check is open; day X of 21, then "time to weigh in" with the check still open; lock / grace from access (FL-33/41/42/43)', () => {
  assert.deepEqual(todayFoodHeroPolicy({ rcStart: null, todayISO: T }), { show: false });
  assert.deepEqual(todayFoodHeroPolicy({ rcStart: { date: T }, todayISO: T, access: { mode: 'premium' } }), { show: true, locked: false, grace: false, graceUntil: null, day: 1, of: 21, weighInDue: false });
  assert.equal(todayFoodHeroPolicy({ rcStart: { date: '2026-08-21' }, todayISO: T }).day, 21);
  const late = todayFoodHeroPolicy({ rcStart: { date: '2026-08-10' }, todayISO: T });
  assert.equal(late.show, true, 'day 32, no weigh-in yet: still shown');
  assert.equal(late.weighInDue, true);
  assert.equal(todayFoodHeroPolicy({ rcStart: { date: T }, todayISO: T, access: { mode: 'locked' } }).locked, true);
  const g = todayFoodHeroPolicy({ rcStart: { date: T }, todayISO: T, access: { mode: 'grace', graceUntil: '2026-09-16' } });
  assert.equal(g.grace, true);
  assert.equal(g.graceUntil, '2026-09-16');
});

// ── FL-41: which access ended; the free-days grace flag; RevenueCat unreachable ──
const { resolveEntitlement, FREE_DAYS, sendFailureNotice } = require('../lib/foodThread');

test('resolveEntitlement: store unreachable → last known end date; none known → lenient, never locked on a hiccup', () => {
  assert.deepEqual(resolveEntitlement({ reachable: true, premium: true }), { premium: true, premiumEndedOn: null, entitlementUnknown: false, remember: null });
  assert.deepEqual(resolveEntitlement({ reachable: true, premium: false, endedOn: '2026-09-10' }), { premium: false, premiumEndedOn: '2026-09-10', entitlementUnknown: false, remember: '2026-09-10' });
  assert.deepEqual(resolveEntitlement({ reachable: false, lastKnownEndedOn: '2026-09-10' }), { premium: false, premiumEndedOn: '2026-09-10', entitlementUnknown: false, remember: undefined });
  const unknown = resolveEntitlement({ reachable: false, lastKnownEndedOn: null });
  assert.equal(unknown.entitlementUnknown, true);
  const acc = foodLogAccess({ premium: false, firstUse: '2026-08-01', rcStart: null, todayISO: '2026-09-12', entitlementUnknown: true });
  assert.equal(acc.canLog, true, 'lenient: grace, not locked');
  assert.equal(acc.reason, 'unknown');
});

test('sendFailureNotice: the offline notice only when the device is actually offline (FL-46)', () => {
  assert.equal(sendFailureNotice({ ok: true }, true), null);
  assert.equal(sendFailureNotice({ ok: false, code: 'provider_error', status: 502 }, true), 'retry', 'online failure: never "back online"');
  assert.equal(sendFailureNotice({ ok: false, code: 'network', status: null }, true), 'retry', 'a timeout while online is not "offline"');
  assert.equal(sendFailureNotice({ ok: false, code: 'network', status: null }, false), 'offline');
  assert.equal(sendFailureNotice({ ok: false, code: 'network', status: null }, null), 'offline', 'connectivity unknown + network error');
  assert.equal(sendFailureNotice({ ok: false, code: 'quota_exceeded', status: 429 }, true), 'quota');
});

// ── FL-41 (audit 3): the free days' anchor is the REAL first use ──
const { freeStartDay } = require('../lib/foodThread');

test('foodLogAccess: free users get 7 days from their REAL first use (first log or the day they tapped start) (FL-41)', () => {
  assert.equal(FREE_DAYS, 7);
  assert.equal(foodLogAccess({ premium: true, todayISO: '2026-09-10' }).mode, 'premium');
  assert.equal(foodLogAccess({ premium: false, firstUse: null, todayISO: '2026-09-10' }).mode, 'trial', 'never used: free');
  const u = { premium: false, firstUse: '2026-09-01' };
  assert.equal(foodLogAccess({ ...u, todayISO: '2026-09-07' }).mode, 'trial', 'day 7');
  const d8 = foodLogAccess({ ...u, todayISO: '2026-09-08' });
  assert.deepEqual([d8.mode, d8.reason], ['locked', 'free_days_ended'], 'day 8 → paywall');
});

test('foodLogAccess: a free user who backdates the check start 7 days still gets 7 free days from the day they tapped start (FL-41 × FL-44)', () => {
  const tapped = '2026-09-10';
  const backdated = { date: '2026-09-03' }; // start weigh-in picked 7 days back
  const x = { premium: false, firstUse: tapped, rcStart: backdated };
  assert.equal(foodLogAccess({ ...x, todayISO: '2026-09-16' }).mode, 'trial', 'day 7 from the tap');
  assert.equal(foodLogAccess({ ...x, todayISO: '2026-09-16' }).until, '2026-09-16');
  assert.equal(foodLogAccess({ ...x, todayISO: '2026-09-17' }).mode, 'locked');
});

test('freeStartDay: the anchor is durable — a later check or deleted entries never reset or extend it', () => {
  assert.deepEqual(freeStartDay({ markerDays: ['2026-09-01'], typedDays: [] }), { firstUse: '2026-09-01', persist: null }, 'all entries deleted: the marker still holds');
  assert.deepEqual(freeStartDay({ markerDays: ['2026-09-05', '2026-09-01'], typedDays: ['2026-09-20'] }), { firstUse: '2026-09-01', persist: null }, 'two devices: the earliest wins');
  assert.deepEqual(freeStartDay({ markerDays: [], typedDays: ['2026-08-20', '2026-08-21'] }), { firstUse: '2026-08-20', persist: '2026-08-20' }, 'older users: first logged day, stored now');
  assert.deepEqual(freeStartDay({ markerDays: [], typedDays: [] }), { firstUse: null, persist: null });
});

test('foodLogAccess: the last 2 free days say so — with or without a check open', () => {
  const x = { premium: false, firstUse: '2026-09-01' };
  assert.equal(foodLogAccess({ ...x, todayISO: '2026-09-05' }).reason, null);
  const d6 = foodLogAccess({ ...x, todayISO: '2026-09-06' });
  assert.deepEqual([d6.reason, d6.until, d6.freeDaysLeft, d6.freeFrom], ['free_days_ending', '2026-09-07', 2, '2026-09-01']);
  assert.equal(foodLogAccess({ ...x, rcStart: { date: '2026-09-02' }, todayISO: '2026-09-07' }).reason, 'free_days_ending');
});

test('foodLogAccess: a lapsed PAYER always gets the Premium wording — incl. Premium ending in check days 1–7', () => {
  const start = { date: '2026-09-01' };
  const payer = { premium: false, firstUse: '2026-07-01', rcStart: start };
  const w1 = foodLogAccess({ ...payer, premiumEndedOn: '2026-09-03', todayISO: '2026-09-05' });
  assert.deepEqual([w1.mode, w1.graceUntil, w1.reason], ['grace', '2026-09-07', 'premium_ended'], 'ended on check day 3 → to day 7');
  const w2 = foodLogAccess({ ...payer, premiumEndedOn: '2026-09-10', todayISO: '2026-09-12' });
  assert.deepEqual([w2.mode, w2.graceUntil, w2.reason], ['grace', '2026-09-14', 'premium_ended']);
  const after = foodLogAccess({ ...payer, premiumEndedOn: '2026-09-10', todayISO: '2026-09-15' });
  assert.deepEqual([after.mode, after.reason], ['locked', 'premium_ended'], 'never "free days" for a payer');
  const inFree = foodLogAccess({ premium: false, firstUse: '2026-09-01', premiumEndedOn: '2026-09-03', todayISO: '2026-09-05' });
  assert.deepEqual([inFree.canLog, inFree.reason, inFree.until], [true, 'premium_ended', '2026-09-07'], 'Premium ended inside the free days: still the Premium wording');
  assert.equal(foodLogAccess({ ...payer, rcStart: null, premiumEndedOn: '2026-09-10', todayISO: '2026-09-11' }).mode, 'locked', 'no check, free days long gone: locked');
});
