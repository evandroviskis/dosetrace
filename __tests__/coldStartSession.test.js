'use strict';
// Final Gate B, G3: the cold start read the session, awaited completePendingWipe (which may sign
// a deleted account out locally) and then set the OLD session — the app showed a signed-in
// account that no longer had a session. lib/signedOut sessionAfterPendingWipe re-reads the session
// after the pending wipe; App uses that value for setSession and the session-user block.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sessionAfterPendingWipe } = require('../lib/signedOut');

test('the pending wipe signed the deleted account out: the fresh (null) session is used', async () => {
  let session = { user: { id: 'gone' } };
  const out = await sessionAfterPendingWipe(session, {
    completePending: async () => { session = null; return true; },
    getSession: async () => ({ data: { session } }),
  });
  assert.equal(out, null);
});

test('nothing pending: the session stays; a failing re-read falls back to no session only if the wipe ran', async () => {
  const s = { user: { id: 'u' } };
  assert.equal(await sessionAfterPendingWipe(s, { completePending: async () => false, getSession: async () => ({ data: { session: s } }) }), s);
  assert.equal(await sessionAfterPendingWipe(s, { completePending: async () => { throw new Error('x'); }, getSession: async () => ({ data: { session: s } }) }), s);
  assert.equal(await sessionAfterPendingWipe(s, { completePending: async () => true, getSession: async () => { throw new Error('x'); } }), null);
});

test('App sets the re-read session', () => {
  const app = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
  assert.match(app, /const session = await sessionAfterPendingWipe\(firstSession, \{/);
  const i = app.indexOf('const session = await sessionAfterPendingWipe(firstSession, {');
  assert.ok(app.indexOf('setSession(session);', i) > i);
});
