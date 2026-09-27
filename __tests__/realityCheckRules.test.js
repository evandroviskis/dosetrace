'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validStartDate, stepStartDate, earliestStart, weighInOn, MAX_START_BACKDATE_DAYS } = require('../lib/realityCheckRules');

const T = '2026-09-27';

test('reality check start: today or up to 7 days back, never further and never in the future (FL-44)', () => {
  assert.equal(MAX_START_BACKDATE_DAYS, 7);
  assert.equal(earliestStart(T), '2026-09-20');
  assert.equal(validStartDate(T, T), true);
  assert.equal(validStartDate('2026-09-20', T), true);
  assert.equal(validStartDate('2026-09-19', T), false);
  assert.equal(validStartDate('2026-09-28', T), false);
  assert.equal(validStartDate('2026-02-30', '2026-03-02'), false, 'not a real day');
  assert.equal(validStartDate('garbage', T), false);
});

test('stepStartDate: the date picker stays inside today … 7 days back', () => {
  assert.equal(stepStartDate(T, -1, T), '2026-09-26');
  assert.equal(stepStartDate('2026-09-20', -1, T), '2026-09-20');
  assert.equal(stepStartDate(T, 1, T), T);
  assert.equal(stepStartDate('2026-03-01', -1, '2026-03-05'), '2026-02-28');
});

test('weighInOn: a saved weigh-in on the chosen day prefills the start weight', () => {
  const snaps = [{ date: '2026-09-22', weightKg: 84.2 }, { date: '2026-09-25', weightKg: null }];
  assert.equal(weighInOn(snaps, '2026-09-22'), 84.2);
  assert.equal(weighInOn(snaps, '2026-09-25'), null);
  assert.equal(weighInOn(snaps, '2026-09-24'), null);
});
