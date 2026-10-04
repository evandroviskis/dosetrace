'use strict';
// Gate B 2026-10-03 F7: what each caller of the deliberate sign-out shows, as behaviour
// (lib/signOutCore signOutOutcome) instead of source pins. The 18+ sheet shows title/body; the
// reset link (App) shows linkFailed = link. Never "done" unless the sign-out really happened.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { signOutOutcome } = require('../lib/signOutCore');

test('signed out → done; nothing shown', () => {
  assert.deepEqual(signOutOutcome({ blocked: false }), { kind: 'done' });
});

test('could not sign out (or no answer at all) → "Couldn\'t sign out"; the reset link stays closed', () => {
  for (const r of [{ failed: true }, undefined, null]) {
    const o = signOutOutcome(r);
    assert.equal(o.kind, 'failed', String(r));
    assert.equal(o.title, 'settings_signout_failed_title');
    assert.equal(o.body, 'settings_signout_failed_body');
    assert.equal(o.link, 'offline');
  }
});

test('blocked offline → the connection words; blocked online → "could not be backed up"', () => {
  assert.deepEqual(signOutOutcome({ blocked: true, offline: true }), { kind: 'blocked', title: 'settings_signout', body: 'auth_signout_unsynced', link: 'offline' });
  assert.deepEqual(signOutOutcome({ blocked: true, offline: false }), { kind: 'blocked', title: 'settings_signout', body: 'auth_signout_notbacked', link: 'notbacked' });
  assert.equal(signOutOutcome({ blocked: true, unknown: true }).link, 'notbacked', 'a failed check is not blamed on the internet');
});

test('the 18+ sheet and the reset link show the outcome', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(read('screens/AgeConfirmScreen.js'), /const o = signOutOutcome\(await signOutIntended\(\)\.catch\(\(\) => \(\{ failed: true \}\)\)\);[\s\S]{0,700}if \(o\.kind !== 'done'\) ok\(t\(o\.title\), t\(o\.body\)\);/);
  // blocked by entries of a protocol deleted forever elsewhere: offer to discard only those (lib/orphanedPending)
  assert.match(read('screens/AgeConfirmScreen.js'), /const n = o\.kind === 'blocked' \? await orphanedPendingCount\(\) : 0;[\s\S]{0,300}discardOrphaned\(\)\.then\(\(\) => doSignOut\(\)\)/);
  assert.match(read('App.js'), /const o = signOutOutcome\(r\);\s*if \(o\.kind !== 'done'\) \{ setLinkFailed\(o\.link\); return; \}\s*setRecovery\(p\);/);
});
