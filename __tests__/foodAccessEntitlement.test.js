'use strict';
// Found 2026-10-01 (simulator): lib/foodLogActions.js loadFoodAccess returned
// "premium: r.premium" after the S-06 refactor, where "r" no longer exists — every call
// threw, so the food log card never showed, the food chat had no access answer, the
// reality-check form saw no free days and the 8 PM food reminder could not plan.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('food access: loadFoodAccess returns the entitlement it read (no undefined variable)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'foodLogActions.js'), 'utf8');
  const i = src.indexOf('export async function loadFoodAccess(');
  const body = src.slice(i, src.indexOf('\n}\n', i));
  assert.doesNotMatch(body, /\br\.premium\b/, 'no reference to an undefined "r"');
  assert.match(body, /premium: ent\.premium/);
});
