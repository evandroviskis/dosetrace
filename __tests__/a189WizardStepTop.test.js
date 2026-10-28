'use strict';
// A-189 (Fold test of build 7, 2026-10-27): after scrolling Dose details, the next step (Schedule &
// reminders) opened at the same scroll, mid-page, hiding "When is your first dose?" and "When did you
// (or will you) start?" — the past start date could be missed. Each step of the protocol sheet opens
// at its top: the sheet's scroll goes to 0 whenever the step changes (Next, Back, a jump to a step).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../screens/ProtocolsScreen.js'), 'utf8');

test('A-189: the protocol sheet scrolls to its top when the step changes', () => {
  const m = src.match(/useEffect\(\(\) => \{\s*if \(modalScrollRef\.current\) modalScrollRef\.current\.scrollTo\(\{ y: 0, animated: false \}\);\s*\}, \[step\]\);/);
  assert.ok(m, 'an effect on [step] sends modalScrollRef to y 0');
});

test('A-189: the reset scrolls the sheet the form is in (the ref the editor ScrollView sets)', () => {
  assert.match(src, /const editorScrollRef = useCallback\(\(n\) => \{ modalScrollRef\.current = n;/);
  assert.match(src, /<ScrollView \{\.\.\.editorKb\.scrollProps\} ref=\{editorScrollRef\}/);
});
