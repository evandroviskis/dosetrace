'use strict';
// Simulator 2026-11-19 (early-dose guard): "Mais tarde hoje" rows drew the Concluir button full width under the
// text with a stray line on top, because the new style "laterRow" (legacyStyles) reused a name already in
// todayV21Styles (the Tomorrow / Next 5 days hint row): Today's sheet spreads both, so the later one silently
// won. A name may sit in both objects only as one of the deliberate v2.1 overrides listed here; no new one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'screens/TodayScreen.js'), 'utf8');
const keysOf = (head) => {
  const a = SRC.indexOf(head);
  assert.ok(a > 0, head);
  const block = SRC.slice(a, SRC.indexOf('\n});', a));
  return [...block.matchAll(/^  ([A-Za-z_$][\w$]*):\s*\{/gm)].map((m) => m[1]);
};
// The v2.1 restyle overrides these legacy names on purpose (Today v2.1).
const V21_OVERRIDES = ['container', 'date', 'doseBtnPrimaryWrap', 'doseBtn', 'doseBtnPrimary', 'doseBtnOk', 'doseBtnFill', 'doseBtnRow', 'doseBtnPrimaryText', 'emptyTitle', 'emptySub'];

test('TodayScreen: no style name repeats inside one object, and none is shared by both objects except the v2.1 overrides', () => {
  const legacy = keysOf('const legacyStyles = (c) => ({');
  const v21 = keysOf('const todayV21Styles = (c) => ({');
  for (const keys of [legacy, v21]) assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), []);
  assert.deepEqual(legacy.filter((k) => v21.includes(k) && !V21_OVERRIDES.includes(k)), []);
});

test('early-dose: a later row lays out in a row, the small Concluir on the right', () => {
  assert.match(SRC, /style=\{\[s\.earlyRow, i > 0 && s\.earlyRowSep, picked && s\.earlyRowPicked\]\}/);
  assert.match(SRC, /^  earlyRow: \{ flexDirection: 'row', alignItems: 'center'/m);
});
