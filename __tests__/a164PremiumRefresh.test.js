'use strict';
// A-164 (live 2026-10-22, Galaxy Z Fold, 1.3.1 vc56): Premium revoked from the admin panel
// (RevenueCat revoke_granted_entitlement) still showed "Premium" in Settings more than 5 minutes
// later, with the app open and after a background → foreground return; only a cold start showed
// the free plan. Cause: every screen read hasPremium() once on load, nothing listened to
// RevenueCat's CustomerInfo updates, and nothing invalidated the SDK's cached CustomerInfo on
// the way back to the foreground.
// Fix: lib/premiumState.js — one shared Premium state per configured user, fed by a CustomerInfo
// update listener and by a foreground re-read (SDK cache invalidated first); the screens subscribe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel) => read(rel).split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const PREMIUM = { premium: true, known: true, source: 'live', expiresAt: null, endedOn: null };
const FREE = { premium: false, known: true, source: 'live', expiresAt: null, endedOn: null };
const UNKNOWN = { premium: false, known: false, source: 'unknown', expiresAt: null, endedOn: null };
const flush = () => new Promise((r) => setImmediate(r));

// A fake RevenueCat + AppState: listeners are recorded, the answer is whatever `answer` holds.
function harness() {
  const h = { answer: PREMIUM, listeners: [], foreground: [], invalidated: 0, reads: 0, order: [] };
  h.deps = {
    read: async () => { h.reads++; h.order.push('read'); return typeof h.answer === 'function' ? h.answer() : h.answer; },
    invalidate: async () => { h.invalidated++; h.order.push('invalidate'); },
    addListener: (fn) => { h.listeners.push(fn); return () => { h.listeners = h.listeners.filter((x) => x !== fn); }; },
    addForegroundListener: (fn) => { h.foreground.push(fn); },
  };
  h.push = () => h.listeners.forEach((fn) => fn({}));
  h.resume = () => h.foreground.forEach((fn) => fn());
  return h;
}

test('A-164 (1): one CustomerInfo listener per configured user; removed on sign-out and on a user change', () => {
  const { createPremiumState } = require('../lib/premiumState');
  const h = harness();
  const ps = createPremiumState(h.deps);
  ps.attachUser('user-a');
  ps.attachUser('user-a'); // cold start + SIGNED_IN both configure the same user
  assert.equal(h.listeners.length, 1, 'the same user is never listened to twice');
  ps.attachUser('user-b');
  assert.equal(h.listeners.length, 1, 'a user change replaces the listener, never adds a second');
  ps.detachUser();
  assert.equal(h.listeners.length, 0, 'sign-out removes the listener');
});

test('A-164 (1): a CustomerInfo update (panel revoke) reaches the subscribers without a cold start', async () => {
  const { createPremiumState } = require('../lib/premiumState');
  const h = harness();
  const ps = createPremiumState(h.deps);
  ps.attachUser('user-a');
  await ps.refresh();
  assert.equal(ps.getSnapshot().premium, true);
  const seen = [];
  const unsub = ps.subscribe((s) => seen.push(s.premium));
  h.answer = FREE; // revoked in the panel; RevenueCat pushes the new CustomerInfo
  h.push();
  await flush();
  assert.deepEqual(seen, [false], 'the subscriber hears the revoke once');
  assert.equal(ps.getSnapshot().premium, false);
  h.answer = PREMIUM; // granted again
  h.push();
  await flush();
  assert.deepEqual(seen, [false, true], 'and the grant');
  unsub();
  h.answer = FREE; h.push(); await flush();
  assert.deepEqual(seen, [false, true], 'an unsubscribed screen hears nothing');
});

test('A-164 (2): back in the foreground the SDK cache is invalidated first, then re-read', async () => {
  const { createPremiumState } = require('../lib/premiumState');
  const h = harness();
  const ps = createPremiumState(h.deps);
  ps.attachUser('user-a');
  await ps.refresh();
  const seen = [];
  ps.subscribe((s) => seen.push(s.premium));
  h.order.length = 0;
  h.answer = FREE;
  h.resume();
  await flush(); await flush();
  assert.deepEqual(h.order, ['invalidate', 'read'], 'invalidate before the re-read, so the SDK cannot answer from its 5-minute cache');
  assert.deepEqual(seen, [false]);
  assert.equal(h.foreground.length, 1, 'one foreground watch for the whole process');
  ps.attachUser('user-b'); ps.attachUser('user-c');
  assert.equal(h.foreground.length, 1, 'a user change adds no second foreground watch');
});

test('A-164 (2): signed out, a foreground return reads nothing', async () => {
  const { createPremiumState } = require('../lib/premiumState');
  const h = harness();
  const ps = createPremiumState(h.deps);
  ps.attachUser('user-a');
  ps.detachUser();
  h.reads = 0; h.invalidated = 0;
  h.resume();
  await flush();
  assert.equal(h.reads + h.invalidated, 0);
});

test('A-164 (3): a user switch isolates the state — no answer of one account ever lands on another', async () => {
  const { createPremiumState } = require('../lib/premiumState');
  const h = harness();
  const ps = createPremiumState(h.deps);
  ps.attachUser('user-a');
  await ps.refresh();
  assert.equal(ps.getSnapshot().premium, true);
  const seen = [];
  ps.subscribe((s) => seen.push([s.uid, s.premium, s.known]));

  // A slow read for user A is still running when B signs in.
  let release;
  h.answer = () => new Promise((r) => { release = () => r(PREMIUM); });
  const slow = ps.refresh();
  ps.detachUser();
  ps.attachUser('user-b');
  assert.deepEqual(ps.getSnapshot(), { ...ps.getSnapshot(), uid: 'user-b', premium: false, known: false }, 'B starts unknown, never with A\'s Premium');
  release();
  await slow;
  assert.equal(ps.getSnapshot().premium, false, 'A\'s late answer is dropped');
  assert.equal(ps.getSnapshot().uid, 'user-b');

  // An answer read for A (e.g. a getEntitlement for the old cache user) is ignored while B is attached.
  ps.note('user-a', PREMIUM);
  assert.equal(ps.getSnapshot().premium, false);
  // B's own answer lands.
  ps.note('user-b', FREE);
  assert.deepEqual(ps.getSnapshot(), { ...ps.getSnapshot(), uid: 'user-b', premium: false, known: true });
  assert.ok(!seen.some(([uid, premium]) => uid === 'user-b' && premium === true), 'B never saw Premium');
});

test('A-164 (3): a listener left over from the previous user cannot trigger a read for the next one', async () => {
  const { createPremiumState } = require('../lib/premiumState');
  const h = harness();
  const ps = createPremiumState(h.deps);
  ps.attachUser('user-a');
  const stale = h.listeners[0];
  ps.attachUser('user-b');
  h.reads = 0;
  stale({});
  await flush();
  assert.equal(h.reads, 0);
});

test('A-164 offline: a still-valid cached Premium is never downgraded because the network failed', async () => {
  const { createPremiumState } = require('../lib/premiumState');
  const { entitlementFrom } = require('../lib/entitlement');
  const h = harness();
  const ps = createPremiumState(h.deps);
  ps.attachUser('user-a');
  await ps.refresh(); // live Premium
  const future = new Date(Date.now() + 20 * 86400000).toISOString();
  // Offline after the invalidation: the store is unreachable, the per-user cache decides (entitlementFrom).
  h.answer = () => entitlementFrom({ live: { reachable: false }, cache: { premium: true, expiresAt: future } });
  h.resume();
  await flush(); await flush();
  assert.equal(ps.getSnapshot().premium, true, 'cache still valid → Premium kept');
  // Unreachable and no cache at all (unknown) never replaces a known answer for the same user.
  h.answer = UNKNOWN;
  h.resume();
  await flush(); await flush();
  assert.equal(ps.getSnapshot().premium, true);
  assert.equal(ps.getSnapshot().known, true);
  // A read that throws changes nothing either.
  h.answer = () => { throw new Error('offline'); };
  h.resume();
  await flush(); await flush();
  assert.equal(ps.getSnapshot().premium, true);
});

test('A-164 wiring: purchases.js attaches the shared state per configured user, listens to CustomerInfo and invalidates the SDK cache', () => {
  const src = code('lib/purchases.js');
  const init = src.slice(src.indexOf('export async function initPurchases'), src.indexOf('export async function readLiveEntitlement'));
  assert.match(init, /attachPremiumUser\(\s*userId/, 'initPurchases attaches the shared Premium state to the configured user');
  const out = src.slice(src.indexOf('export async function logOutPurchases'));
  assert.match(out.slice(0, out.indexOf('\n}\n')), /detachPremiumUser\(/, 'logOutPurchases detaches it');
  assert.match(src, /Purchases\.addCustomerInfoUpdateListener\(/);
  assert.match(src, /Purchases\.removeCustomerInfoUpdateListener\(/);
  assert.match(src, /Purchases\.invalidateCustomerInfoCache\(/);
});

test('A-164 guard: Settings, Journey, Body and the Calculator follow the shared Premium state', () => {
  for (const rel of ['screens/SettingsScreen.js', 'screens/JourneyScreen.js', 'screens/BodyScreen.js', 'screens/components/CalculatorSection.js']) {
    const src = code(rel);
    assert.match(src, /import \{[^}]*\busePremiumUpdates\b[^}]*\} from '(\.\.\/)+lib\/usePremium'/, `${rel} imports the shared state hook`);
    assert.match(src, /\busePremiumUpdates\(/, `${rel} subscribes to it`);
  }
});
