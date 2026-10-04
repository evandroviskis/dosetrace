'use strict';
// Gate B round 2, R1 (proven by scratchpad/lateWipe.cjs): the intended-sign-out wipe waits for a
// running sync (F2). If that pass hangs past the NEXT sign-in, the old account's wipe ran after the
// new account's SIGNED_IN steps: RevenueCat logged out for the new user, seen-onboarding cleared,
// the database wiped while the new account's import ran. Now a sign-in generation (bumped inline in
// SIGNED_IN, a plain counter write) is captured before waiting; if it moved, the wipe is skipped.
// The wipe itself runs through the sync runner's exclusive slot, so it never overlaps an import.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSyncRunner } = require('../lib/syncRunner');
const S = require('../lib/signedOut');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function deps(order, runner) {
  const step = (n) => () => { order.push(n); };
  return {
    stopSyncEngine: step('stop'), waitForSyncIdle: () => runner.waitIdle(), runExclusive: (job) => runner.runExclusive(job),
    getSignInGeneration: S.signInGeneration,
    clearLocalDatabase: step('wipe:db'), cancelAllNotifications: step('wipe:cancel'), dismissAllNotifications: step('wipe:dismiss'),
    logOutPurchases: step('wipe:purchases'), clearOnboarding: step('wipe:onboarding'), removeRcStart: step('wipe:rc'),
    clearRealityDeviceFlags: step('wipe:flags'), clearSeenOnboarding: step('wipe:seen'), removeQuestions: step('wipe:q'),
    resetAllSelections: step('wipe:sel'), clearAllDrafts: step('wipe:drafts'),
  };
}

test('a stuck pass outlives the next sign-in: the old wipe is skipped', async () => {
  const order = [];
  let release;
  const runner = createSyncRunner(() => new Promise((r) => { release = r; }));
  runner.run();
  const wipe = S.afterSignedOut(true, deps(order, runner));
  await sleep(10);
  S.bumpSignInGeneration(); // B signs in (App SIGNED_IN, inline)
  const imp = runner.runExclusive(async () => { order.push('B:import'); });
  release();
  assert.equal(await wipe, 'skipped');
  await imp;
  assert.ok(!order.some((o) => o.startsWith('wipe:')), order.join(','));
  assert.ok(order.includes('B:import'));
});

test('no new sign-in: the wipe runs, alone (never overlapping an import)', async () => {
  const order = [];
  let release;
  const runner = createSyncRunner(() => new Promise((r) => { release = r; }));
  runner.run();
  const wipe = S.afterSignedOut(true, deps(order, runner));
  await sleep(5);
  release();
  assert.equal(await wipe, true);
  assert.ok(order.includes('wipe:db') && order.includes('wipe:purchases'));
  // The wipe goes through the runner's exclusive slot (an import requested meanwhile waits for it).
  let inSlot = false;
  const runner2 = createSyncRunner(async () => {});
  const d = deps([], runner2);
  d.runExclusive = (job) => runner2.runExclusive(() => { inSlot = true; job(); });
  let wiped = false;
  d.clearLocalDatabase = () => { wiped = inSlot; };
  await S.afterSignedOut(true, d);
  assert.equal(wiped, true, 'the wipe ran inside the exclusive slot');
});

test('App bumps the generation inline in SIGNED_IN and hands the runner to the wipe', () => {
  const app = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
  const i = app.indexOf("if (_event === 'SIGNED_IN' && session?.user?.id) {");
  assert.match(app.slice(i, app.indexOf('setTimeout(', i)), /bumpSignInGeneration\(\);/);
  assert.match(app, /runExclusive: runSyncExclusive,/);
  assert.match(app, /getSignInGeneration: signInGeneration,/);
  assert.match(fs.readFileSync(path.join(__dirname, '../lib/sync.js'), 'utf8'), /export function runSyncExclusive\(job\)/);
});
