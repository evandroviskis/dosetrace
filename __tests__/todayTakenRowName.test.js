'use strict';
// Bug found on the open Fold 2026-11-26: in Today's "Doses concluídas", a dose with an injection site
// showed the name as "BP…" because "13:03 · Abdômen, superior direito" took the whole row (the name
// column had flex basis 0, so it got only what the time line left). The name keeps its own width (up
// to half the row) and the time · site line wraps to two lines instead of losing the name or the site
// (containment never removes information). Source test, as the other Today tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TODAY = fs.readFileSync(path.join(__dirname, '..', 'screens/TodayScreen.js'), 'utf8');
const style = (name) => {
  const m = TODAY.match(new RegExp(`\\n  ${name}: \\{([^}]*)\\}`));
  assert.ok(m, `style ${name} exists`);
  return m[1];
};

test('taken row: the name column keeps its width, capped at half the row', () => {
  const col = style('takenMainCol');
  assert.match(col, /flexShrink: 0/, 'the name column does not shrink to nothing');
  assert.match(col, /maxWidth: '50%'/, 'a long name still leaves room for the time');
  assert.doesNotMatch(col, /flex: 1\b/, 'flex: 1 (basis 0) is what let the time line take the row');
});

test('taken row: the time · site line wraps instead of cutting', () => {
  const when = style('takenWhen');
  assert.match(when, /flex: 1/, 'the time line takes the rest of the row');
  assert.match(when, /textAlign: 'right'/, 'it stays at the right edge as before');
  assert.match(TODAY, /<Text style=\{s\.takenWhen\} numberOfLines=\{2\}>/, 'two lines, so the site is not cut');
});
