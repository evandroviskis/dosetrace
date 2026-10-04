'use strict';
// Gate B F2 (MEDIUM): forceSync returned at once when a sync was already running, so a sign-out
// checked "not backed up" while the push was still under way (a false "Connect to the internet
// first" online), and "Sign out anyway" could wipe rows mid-push. lib/syncRunner: forceSync waits
// for the running pass and then runs one fresh pass; waitIdle lets the SIGNED_OUT wipe wait for any
// running sync before deleting.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSyncRunner } = require('../lib/syncRunner');

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

test('forceSync waits for the running pass, then runs a fresh one', async () => {
  const order = [];
  let n = 0;
  const runner = createSyncRunner(async () => { const k = ++n; order.push(`start${k}`); await tick(20); order.push(`end${k}`); });
  runner.run(); // a background sync is running
  await tick(2);
  await runner.forceSync();
  assert.deepEqual(order, ['start1', 'end1', 'start2', 'end2']);
});

test('a second background request while running shares the running pass (no overlap)', async () => {
  let running = 0, max = 0, n = 0;
  const runner = createSyncRunner(async () => { n++; running++; max = Math.max(max, running); await tick(10); running--; });
  const a = runner.run(); const b = runner.run();
  await Promise.all([a, b]);
  assert.equal(n, 1);
  assert.equal(max, 1);
});

test('waitIdle resolves only after the running pass (the wipe waits for the push)', async () => {
  const events = [];
  const runner = createSyncRunner(async () => { await tick(15); events.push('pushed'); });
  runner.run();
  await runner.waitIdle();
  events.push('wipe');
  assert.deepEqual(events, ['pushed', 'wipe']);
  await runner.waitIdle(); // idle → returns at once
});

test('a failing pass does not leave the runner stuck', async () => {
  let n = 0;
  const runner = createSyncRunner(async () => { n++; if (n === 1) throw new Error('net'); });
  await runner.run().catch(() => {});
  await runner.forceSync();
  assert.equal(n, 2);
  assert.equal(runner.isRunning(), false);
});

test('lib/sync uses the runner and the SIGNED_OUT wipe waits for it', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const sync = fs.readFileSync(path.join(__dirname, '../lib/sync.js'), 'utf8');
  assert.match(sync, /createSyncRunner\(/);
  assert.match(sync, /export function waitForSyncIdle\(\)/);
  const app = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
  assert.match(app, /await waitForSyncIdle\(\)/);
});

test('an exclusive job (the full import) never overlaps a pass, and waitIdle waits for it', async () => {
  const log = [];
  const runner = createSyncRunner(async () => { log.push('pass'); await tick(5); });
  runner.run();
  const imp = runner.runExclusive(async () => { log.push('import-start'); await tick(10); log.push('import-end'); });
  await tick(1);
  const shared = runner.run(); // requested during the import: shares it
  await runner.waitIdle();
  await imp; await shared;
  assert.deepEqual(log, ['pass', 'import-start', 'import-end']);
});
