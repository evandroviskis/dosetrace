'use strict';
// Final Gate B: account deletion signs out with strict storage removal, like the deliberate
// sign-out (R2) — a keychain delete that fails throws instead of passing silently, so a phone with
// tokens left is reported as "Couldn't sign out" rather than wiped as signed out.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { finishDeletionCore } = require('../lib/signOutCore');

test('strict removal is on around the local sign-out and off afterwards (also when it fails)', async () => {
  const calls = [];
  let strict = false;
  const auth = {
    signOut: async () => { calls.push(`signOut:strict=${strict}`); return { error: new Error('offline') }; },
    getSession: async () => ({ data: { session: { user: { id: 'u' } } }, error: null }),
  };
  const r = await finishDeletionCore({
    auth, userId: 'u',
    intent: { mark: () => {}, consume: () => false },
    signOutGoogle: async () => {}, setWipePending: async () => {}, wipeNow: () => {},
    strictStorage: { begin: () => { strict = true; calls.push('begin'); }, end: () => { strict = false; calls.push('end'); } },
  });
  assert.deepEqual(r, { failed: true });
  assert.ok(calls.includes('signOut:strict=true'));
  assert.ok(!calls.includes('signOut:strict=false'));
  assert.equal(strict, false);
  assert.equal(calls[calls.length - 1], 'end');
});

test('accountActions hands deletion the strict storage', () => {
  const a = fs.readFileSync(path.join(__dirname, '../lib/accountActions.js'), 'utf8');
  const i = a.indexOf('return finishDeletionCore({');
  assert.match(a.slice(i, i + 700), /strictStorage: \{ begin: \(\) => setStrictRemoval\(true\), end: \(\) => setStrictRemoval\(false\) \}/);
});
