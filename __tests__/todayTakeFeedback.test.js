'use strict';
// Founder 2026-10-01 (screenshot of the Today tracker):
// A-79: "2 of 5 today" ran over the filled arc — one line ≈ 79 pt inside a ring whose
//       inner opening is 76 pt (132 gauge, r 44, stroke 12). The count and "today" are
//       two lines now, both inside the opening.
// A-80: "the animation when marking a dose taken is slow": the drop took 610 ms to land
//       (lift 110 + flight 500) while the ring and numbers jumped at 380 ms, so the
//       landing felt late. The drop lands in ≤ 380 ms and the card/ring update exactly
//       when it lands.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('A-79: the tracker caption is two lines inside the ring opening', () => {
  const src = read('screens/components/TodayTracker.js');
  assert.doesNotMatch(src, /\{ofText\(rings\.today\)\} \{t\('today_section_today'\)/, 'not one long line');
  assert.match(src, /<Text style=\{s\.bigCap\}[^>]*>\{ofText\(rings\.today\)\}<\/Text>/);
  assert.match(src, /<Text style=\{s\.bigCapDay\}[^>]*>\{t\('today_section_today'\)\.toLowerCase\(\)\}<\/Text>/);
});

test('A-80: the drop lands within 380 ms and the card updates when it lands', () => {
  const src = read('screens/TodayScreen.js');
  const m = src.match(/const LIFT = (\d+), FLIGHT = (\d+);/);
  assert.ok(m, 'LIFT/FLIGHT constants');
  const land = Number(m[1]) + Number(m[2]);
  assert.ok(land <= 380, `lands at ${land} ms`);
  assert.match(src, /markTaken\(p, \{ deferUi: LIFT \+ FLIGHT,/, 'the card re-sorts exactly at the landing');
});

// A-79 follow-up (founder screenshot, 60%): with the arc reaching the bottom of the ring,
// the second caption line touched it. The whole block (number + 2 caption lines) must fit
// the 76 pt opening with room: number ≤ 32 pt, caption lines ≤ 11 pt with a 13 pt line height,
// so the block is ≤ 66 pt tall and the bottom line sits where the opening is ≥ 46 pt wide.
test('A-79: the tracker number and caption fit inside the ring opening at any fill', () => {
  const src = read('screens/components/TodayTracker.js');
  const num = Number((src.match(/bigNum: \{ fontSize: (\d+)/) || [])[1]);
  const cap = src.match(/bigCap: \{ fontSize: (\d+)[^}]*lineHeight: (\d+)/);
  const day = src.match(/bigCapDay: \{ fontSize: (\d+)[^}]*lineHeight: (\d+)/);
  assert.ok(num && num <= 32, `number ${num}`);
  assert.ok(cap && Number(cap[1]) <= 11 && Number(cap[2]) <= 13, 'count line');
  assert.ok(day && Number(day[1]) <= 11 && Number(day[2]) <= 13, 'today line');
  assert.ok(num * 1.2 + Number(cap[2]) + Number(day[2]) <= 66, "block height (76 pt opening, 10 pt margin)");
});
