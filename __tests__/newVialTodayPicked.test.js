'use strict';
// A-132 NV-3 says the window opens with "Hoje" picked. The date was set to today, but the Ontem / Hoje
// pills had no picked look on either platform (iPhone recording 2026-11-26: "o botão Hoje não aparece
// marcado"). They now take the month pills' own picked style when the chosen date is today / yesterday.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'components', 'NewVialPrompt.js'), 'utf8');

test('NV-3: the Hoje pill looks picked when the date is today, Ontem when it is yesterday', () => {
  const field = src.slice(src.indexOf('function MixDateField'), src.indexOf('function BoxExpiryField'));
  assert.match(field, /style=\{\[s\.yesterdayPill, isYesterday && s\.promptMonthPillOn\]\}/);
  assert.match(field, /style=\{\[s\.yesterdayPill, isToday && s\.promptMonthPillOn\]\}/);
  assert.match(field, /style=\{\[s\.yesterdayPillText, isToday && s\.promptMonthTextOn\]\}/);
  assert.match(field, /accessibilityState=\{\{ selected: isToday \}\}/);
});
