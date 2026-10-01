'use strict';
// S-06 / FX-16 + FX-4: ONE entitlement answer for every Premium gate. RevenueCat's live
// answer when the store is reachable (and it is cached WITH the expiration date);
// when unreachable, the cache decides: expiration in the future (or lifetime) = full
// access; expiration passed = not paying (its end date is kept for the food log);
// never known paying = free tier. Server checks for paid calls stay authoritative.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { entitlementFrom } = require('../lib/entitlement');
const NOW = Date.parse('2026-10-01T12:00:00Z');

test('S-06: reachable store → its answer, and the cache to write carries the expiration date', () => {
  const paying = entitlementFrom({ live: { reachable: true, premium: true, expiresAt: '2026-11-01T00:00:00Z' }, cache: null, now: NOW });
  assert.equal(paying.premium, true);
  assert.deepEqual(paying.writeCache, { premium: true, expiresAt: '2026-11-01T00:00:00Z', endedOn: null });
  const lifetime = entitlementFrom({ live: { reachable: true, premium: true, expiresAt: null }, cache: null, now: NOW });
  assert.deepEqual(lifetime.writeCache, { premium: true, expiresAt: null, endedOn: null });
  const lapsed = entitlementFrom({ live: { reachable: true, premium: false, expiresAt: '2026-09-10T00:00:00Z', endedOn: '2026-09-10' }, cache: null, now: NOW });
  assert.equal(lapsed.premium, false);
  assert.equal(lapsed.endedOn, '2026-09-10');
});

test('S-06: store unreachable → lifetime cache keeps access; an expired cache keeps its end date; nothing known = free tier', () => {
  assert.equal(entitlementFrom({ live: { reachable: false }, cache: { premium: true, expiresAt: null }, now: NOW }).premium, true, 'lifetime');
  const exp = entitlementFrom({ live: { reachable: false }, cache: { premium: true, expiresAt: '2026-09-20T08:00:00Z', endedOn: null }, now: NOW });
  assert.equal(exp.premium, false);
  assert.equal(exp.endedOn, '2026-09-20', 'the food log still knows when Premium ended');
  const none = entitlementFrom({ live: { reachable: false }, cache: null, now: NOW });
  assert.deepEqual([none.premium, none.known, none.writeCache], [false, false, undefined]);
});

test('S-06: the food log has no private offline guess any more — it uses the helper', () => {
  const { foodLogAccess } = require('../lib/foodThread');
  const acc = foodLogAccess({ premium: false, firstUse: '2026-08-01', rcStart: null, todayISO: '2026-09-12', entitlementUnknown: true });
  assert.equal(acc.canLog, false, 'free days over + not paying = locked, whatever the network did');
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'foodLogActions.js'), 'utf8');
  const i = src.indexOf('export async function loadFoodAccess(');
  assert.match(src.slice(i, i + 900), /getEntitlement\(/);
  assert.doesNotMatch(src, /resolveEntitlement|getEntitlementState/);
});

test('S-06: every screen asks the one helper (hasPremium / getEntitlement)', () => {
  const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  for (const f of [['screens', 'BodyScreen.js'], ['screens', 'JourneyScreen.js'], ['screens', 'LogScreen.js'], ['screens', 'PaywallScreen.js'], ['screens', 'ProtocolsScreen.js'], ['screens', 'SerumCurveScreen.js'], ['screens', 'SettingsScreen.js'], ['screens', 'components', 'CalculatorSection.js'], ['screens', 'components', 'VaccinesSection.js']]) {
    assert.match(read(...f), /from '(\.\.\/)+lib\/entitlement'/, f.join('/'));
  }
});

// Gate B review 2026-10-01: the cache key must not depend on a network call. Offline,
// getSession() can return null after a failed token refresh (and wait ~30 s), which
// keyed the cache under "anon" — a paying user offline would read nothing.
test('S-06 (Gate B): the cache is keyed by the RevenueCat user (set at sign-in), else the last user seen — never getSession()', () => {
  const { cacheUid } = require('../lib/entitlement');
  assert.equal(cacheUid({ purchasesUid: 'u1', lastUid: 'u0' }), 'u1');
  assert.equal(cacheUid({ purchasesUid: null, lastUid: 'u0' }), 'u0');
  assert.equal(cacheUid({ purchasesUid: null, lastUid: null }), null);
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'entitlement.js'), 'utf8');
  assert.doesNotMatch(src, /getCachedUser|getSession/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'lib', 'purchases.js'), 'utf8'), /export function currentPurchasesUserId\(/);
});

test('S-06 (Gate B): after a purchase or restore the paywall refreshes the helper, so the cache knows at once', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'PaywallScreen.js'), 'utf8');
  assert.equal((src.match(/await getEntitlement\(\)/g) || []).length, 2, 'purchase and restore');
  assert.doesNotMatch(src, /result\.premium \|\| \(await hasPremium\(\)\)/);
});

test('S-06 (Gate B): the food log no longer reads its old end-date key (a stale date could unlock grace)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'foodLogActions.js'), 'utf8');
  assert.doesNotMatch(src, /dosetrace_premium_ended_on|endedKey\(/);
});
