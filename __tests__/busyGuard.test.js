'use strict';
// Gate B F4: Settings' sign-out had no busy guard — a second tap (or the sheet's button pressed
// again while the first push was still running) started a second sign-out. lib/busyGuard: one run
// at a time; taps while running are ignored; the state drives the spinner; a failing run frees it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBusyGuard } = require('../lib/busyGuard');

test('a second call while the first runs is ignored', async () => {
  const states = [];
  const g = createBusyGuard((busy) => states.push(busy));
  let runs = 0;
  const job = () => new Promise((r) => { runs++; setTimeout(r, 10); });
  const a = g.run(job);
  const b = g.run(job);
  assert.equal(await b, undefined, 'ignored');
  await a;
  assert.equal(runs, 1);
  assert.deepEqual(states, [true, false]);
  assert.equal(g.isBusy(), false);
});

test('a failing run frees the guard and passes the error on', async () => {
  const g = createBusyGuard(() => {});
  await assert.rejects(g.run(async () => { throw new Error('x'); }));
  assert.equal(g.isBusy(), false);
  assert.equal(await g.run(async () => 7), 7);
});

test('Settings runs both sign-out buttons through the guard and shows a spinner while busy', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../screens/SettingsScreen.js'), 'utf8');
  assert.match(src, /signOutGuard\.run\(\(\) => signOutIntended\(\)\)/);
  assert.match(src, /signOutGuard\.run\(\(\) => signOutIntended\(\{ force: true \}\)\)/);
  assert.match(src, /signingOut \? <ActivityIndicator/);
});
