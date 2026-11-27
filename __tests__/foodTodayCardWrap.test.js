'use strict';
// How-to recording 2026-11-26 (German, iPhone and S25): the "HEUTE" card on top of the food log put
// "35 g Kohlenhydrate · 7 g Protein" and "3 g Ballaststoffe" on one row with no room to wrap, so the
// fiber ran past the card's right edge (iPhone) or was cut to "Ballastst…" (S25). The row now wraps:
// the fiber goes to the next line when both do not fit; on wide screens nothing changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'FoodChatScreen.js'), 'utf8');

test('the carbs · protein / fiber row of the Today card wraps', () => {
  assert.match(src, /<View style=\{s\.gLineWrap\}>\s*<Text style=\{s\.gSub\}>\{`\$\{dayTot\.carb_g\} g/);
  const m = /gLineWrap: \{([^}]*)\}/.exec(src);
  assert.ok(m, 'gLineWrap style exists');
  assert.match(m[1], /flexWrap: 'wrap'/);
});
