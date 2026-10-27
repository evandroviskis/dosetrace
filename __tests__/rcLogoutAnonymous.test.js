'use strict';
// Found on the Fold development client 2026-10-26 (A-119 takeover → sign-out): RevenueCat logged
// "Called logOut but the current user is anonymous" as an ERROR (red notice in the development
// build). logOutPurchases called Purchases.logOut() even when RevenueCat already had no user. The
// rule: ask isAnonymous() first and log out only a real user; any error stays silent (nothing to
// log out of). lib/purchases imports the native SDK, so the rule is read from the source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('logOutPurchases logs out only a real RevenueCat user (never an anonymous one)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/purchases.js'), 'utf8');
  const fn = src.slice(src.indexOf('export async function logOutPurchases'), src.indexOf('\n}\n', src.indexOf('export async function logOutPurchases')) + 2);
  const anon = fn.indexOf('Purchases.isAnonymous()');
  const out = fn.indexOf('Purchases.logOut()');
  assert.ok(anon > 0, 'asks isAnonymous first');
  assert.ok(out > anon, 'logOut after the check');
  assert.match(fn, /if \(await Purchases\.isAnonymous\(\)\) return;/);
  assert.match(fn, /catch \{/);
});
