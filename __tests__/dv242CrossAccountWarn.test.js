'use strict';
// DV-242 (S1, AD-102 = B): when another account signs in on a phone whose local data belongs to a
// previous account with rows never backed up, the app warns first and offers "Sign in as
// {previous account} first, to save" (nothing discarded) or "Discard and continue" (the discard as
// before). With nothing unsent the discard runs as before, no sheet. The new account never sees
// the old data: the UI holds and no sync pass runs while the owner is another account.
// Real SQLite (syncHarness makeDb), the real pending count (recoveryFlow + syncCore).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const { loadFn, read } = require('./helpers/extractFn');
const { TABLES, getPendingChanges } = require('../lib/syncCore');
const { unsyncedCount } = require('../lib/recoveryFlow');
const G = require('../lib/accountGuard');
const { translations } = require('../i18n/translations');

function ownerOf(db) {
  for (const t of ['protocols', 'dose_logs', 'biomarkers', 'food_logs']) {
    const r = db.getFirstSync(`SELECT user_id FROM ${t} WHERE user_id IS NOT NULL LIMIT 1`);
    if (r && r.user_id) return r.user_id;
  }
  return null;
}

function phone({ pendingRows = 0, syncedRows = 1, label = { id: 'user-a', email: 'a@example.com' } } = {}) {
  const db = makeDb();
  for (let i = 0; i < syncedRows; i++) db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, logged_at, sync_status, remote_id) VALUES ('user-a', 1, '2026-10-0${i + 1}T08:00:00Z', 'synced', 'r${i}')`);
  for (let i = 0; i < pendingRows; i++) db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, logged_at, sync_status) VALUES ('user-a', 1, '2026-10-1${i}T08:00:00Z', 'pending')`);
  const calls = [];
  let stored = label ? JSON.stringify(label) : null;
  const asked = [];
  const d = {
    getLocalOwner: () => ownerOf(db),
    countPending: (id) => unsyncedCount(db, id, TABLES, getPendingChanges),
    readOwnerLabel: async () => stored,
    rememberOwner: async (u) => { stored = JSON.stringify({ id: u.id, email: u.email || null }); calls.push('remember'); },
    forgetLocalOwner: async () => { stored = null; calls.push('forgetOwner'); },
    clearLocalDatabase: () => { for (const t of TABLES) { try { db.runSync(`DELETE FROM ${t}`); } catch { /* */ } } calls.push('clearDb'); },
    removeRcStart: async () => calls.push('rc'),
    clearRealityDeviceFlags: async () => calls.push('flags'),
    cancelAllNotifications: async () => calls.push('cancelNotifs'),
    dismissAllNotifications: async () => calls.push('dismissNotifs'),
    clearAllDrafts: () => calls.push('drafts'),
    resetAllSelections: () => calls.push('selections'),
    removeQuestions: async () => calls.push('questions'),
    clearAIConsent: async () => calls.push('consent'),
    ask: (a) => asked.push(a),
    signOutLocally: async () => { calls.push('signOutLocal'); return { signedOut: true }; },
  };
  return { db, d, calls, asked, rows: () => db.getAllSync('SELECT * FROM dose_logs') };
}

const B = { id: 'user-b', email: 'b@example.com' };

test('DV-242: 2 unsent rows of A, B signs in → the sheet names A and nothing is discarded', async () => {
  const p = phone({ pendingRows: 2 });
  assert.equal(await G.guardSignedIn(p.d, { sessionUser: B }), 'held');
  assert.equal(p.asked.length, 1, 'the sheet is asked for');
  assert.equal(p.asked[0].previous, 'a@example.com', 'it names the previous account');
  assert.equal(p.asked[0].pending, 2);
  assert.equal(p.rows().length, 3, 'nothing discarded yet');
  assert.ok(!p.calls.includes('clearDb') && !p.calls.includes('cancelNotifs') && !p.calls.includes('consent'));
});

test('DV-242: "Sign in as A first, to save" signs B out locally and keeps every row', async () => {
  const p = phone({ pendingRows: 2 });
  await G.guardSignedIn(p.d, { sessionUser: B });
  assert.equal(await G.resolveAccountAsk('save', p.d, { sessionUser: B }), 'signed_out');
  assert.deepEqual(p.calls, ['signOutLocal']);
  assert.equal(p.rows().length, 3, 'A\'s rows, unsent ones included, stay for A');
  assert.equal(p.rows().filter((r) => r.sync_status === 'pending').length, 2);
});

test('DV-242: "Discard and continue" runs the discard as before (data, reminders, drafts, consent) and B owns the phone', async () => {
  const p = phone({ pendingRows: 2 });
  await G.guardSignedIn(p.d, { sessionUser: B });
  assert.equal(await G.resolveAccountAsk('discard', p.d, { sessionUser: B }), 'continue');
  assert.equal(p.rows().length, 0);
  for (const step of ['clearDb', 'rc', 'flags', 'cancelNotifs', 'drafts', 'selections', 'questions', 'consent', 'forgetOwner', 'remember']) {
    assert.ok(p.calls.includes(step), `discard step ${step}`);
  }
});

test('DV-242: 0 unsent rows → no sheet; the discard runs at once, as today', async () => {
  const p = phone({ pendingRows: 0, syncedRows: 3 });
  assert.equal(await G.guardSignedIn(p.d, { sessionUser: B }), 'continue');
  assert.equal(p.asked.length, 0, 'no sheet');
  assert.equal(p.rows().length, 0, 'discarded (it is all in A\'s cloud)');
  assert.ok(p.calls.includes('cancelNotifs') && p.calls.includes('consent'));
});

test('DV-242: the same account signing in again, or an empty phone → nothing asked, nothing discarded', async () => {
  const same = phone({ pendingRows: 2 });
  assert.equal(await G.guardSignedIn(same.d, { sessionUser: { id: 'user-a', email: 'a@example.com' } }), 'continue');
  assert.equal(same.rows().length, 3);
  assert.equal(same.asked.length, 0);
  const empty = phone({ pendingRows: 0, syncedRows: 0, label: null });
  assert.equal(await G.guardSignedIn(empty.d, { sessionUser: B }), 'continue');
  assert.ok(!empty.calls.includes('clearDb'));
});

test('DV-242: the pending count cannot be read → asked (never discard on a maybe)', async () => {
  const p = phone({ pendingRows: 0 });
  p.d.countPending = () => { throw new Error('database disk image is malformed'); };
  assert.equal(await G.guardSignedIn(p.d, { sessionUser: B }), 'held');
  assert.equal(p.rows().length, 1);
});

test('DV-242: an update over 1.3.0 (no owner label stored) still asks, without a name', async () => {
  const p = phone({ pendingRows: 1, label: null });
  assert.equal(await G.guardSignedIn(p.d, { sessionUser: B }), 'held');
  assert.equal(p.asked[0].previous, null);
  const stale = phone({ pendingRows: 1, label: { id: 'someone-else', email: 'x@example.com' } });
  await G.guardSignedIn(stale.d, { sessionUser: B });
  assert.equal(stale.asked[0].previous, null, 'a label for another id never names the owner');
});

test('DV-242: the sheet cannot be dismissed without a choice, names the account, in all 6 languages', () => {
  for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    const t = (k) => translations[lang][k];
    const named = G.accountAskSheet(t, { previous: 'a@example.com', onSave() {}, onDiscard() {} });
    assert.equal(named.locked, true, `${lang}: locked`);
    assert.ok(named.title && named.body.includes('a@example.com'), `${lang}: names the account`);
    assert.equal(named.buttons.length, 2);
    assert.ok(named.buttons.some((b) => b.label.includes('a@example.com')), `${lang}: the save button names it`);
    assert.ok(named.buttons.every((b) => typeof b.label === 'string' && b.label && !b.label.includes('{')), `${lang}: filled`);
    const plain = G.accountAskSheet(t, { previous: null, onSave() {}, onDiscard() {} });
    assert.ok(plain.body && !plain.body.includes('{') && plain.buttons.every((b) => !b.label.includes('{')), `${lang}: no name`);
  }
});

test('DV-242: a sync pass never runs while the local data belongs to another account', async () => {
  assert.equal(G.ownerBlocksSync('user-a', 'user-b'), true);
  assert.equal(G.ownerBlocksSync('user-b', 'user-b'), false);
  assert.equal(G.ownerBlocksSync(null, 'user-b'), false);
  const ran = [];
  const syncPass = loadFn('lib/sync.js', 'async function syncPass(', 'syncPass', {
    _deletionPaused: false, _isOnline: true, notifyListeners: () => {}, console,
    getCachedUser: async () => ({ id: 'user-b' }), getLocalDataUserId: () => 'user-a', ownerBlocksSync: G.ownerBlocksSync,
    pushPendingChanges: async () => ran.push('push'), pullCloudChanges: async () => ran.push('pull'),
  });
  await syncPass();
  assert.deepEqual(ran, [], 'no push, no pull under B with A\'s data');
});

test('DV-242: the App holds the UI while the owner is another account and wires both paths through the guard', () => {
  const app = read('App.js');
  assert.match(app, /guardSignedIn\(/);
  assert.match(app, /name="AccountHold"/);
  assert.doesNotMatch(app, /if \(localUid && localUid !== session\.user\.id\) \{\s*clearLocalDatabase\(\);/, 'no silent discard left');
});

// ── Gate B review (1.3.1) ─────────────────────────────────────────────

test('Gate B 5: the discard cancels and dismisses A\'s reminders BEFORE it clears the database (a kill in between never leaves them firing for B)', async () => {
  const p = phone({ pendingRows: 0, syncedRows: 2 });
  await G.guardSignedIn(p.d, { sessionUser: B });
  const at = (s) => p.calls.indexOf(s);
  assert.ok(at('cancelNotifs') >= 0 && at('dismissNotifs') >= 0 && at('clearDb') >= 0);
  assert.ok(at('cancelNotifs') < at('clearDb'), 'cancel first');
  assert.ok(at('dismissNotifs') < at('clearDb'), 'dismiss first');
  const app = read('App.js');
  const deps = app.slice(app.indexOf('const guardDeps = () => ({'), app.indexOf('});', app.indexOf('const guardDeps = () => ({')));
  assert.match(deps, /dismissAllNotifications,/);
});

test('Gate B 3: the guard fails closed — an owner that cannot be read holds and shows the sheet (Discard always there)', async () => {
  const p = phone({ pendingRows: 0 });
  p.d.getLocalOwner = () => { throw new Error('database is locked'); };
  assert.equal(await G.guardSignedIn(p.d, { sessionUser: B }), 'held');
  assert.equal(p.asked.length, 1);
  assert.equal(p.asked[0].previous, null);
  assert.equal(p.rows().length, 1, 'nothing discarded');
  const sheet = G.accountAskSheet((k) => translations.en[k], { previous: null, onSave() {}, onDiscard() {} });
  assert.ok(sheet.buttons.some((b) => b.label === translations.en.account_guard_discard), 'Discard is offered: nobody is trapped');
});

test('Gate B 3: App turns an unexpected guard error into the sheet, never into "continue"', () => {
  const app = read('App.js');
  assert.doesNotMatch(app, /catch \{ guard = 'continue'; \}/);
  assert.equal(app.split('catch { guard = failClosed(session.user); }').length - 1, 2, 'both paths');
});

test('Gate B 3: a sync pass whose owner check fails does not run (fail closed)', async () => {
  for (const deps of [
    { getCachedUser: async () => ({ id: 'user-b' }), getLocalDataUserId: () => { throw new Error('locked'); } },
    { getCachedUser: async () => { throw new Error('no session read'); }, getLocalDataUserId: () => null },
  ]) {
    const ran = [];
    const syncPass = loadFn('lib/sync.js', 'async function syncPass(', 'syncPass', {
      _deletionPaused: false, _isOnline: true, notifyListeners: () => {}, console, ownerBlocksSync: G.ownerBlocksSync,
      pushPendingChanges: async () => ran.push('push'), pullCloudChanges: async () => ran.push('pull'), ...deps,
    });
    await syncPass();
    assert.deepEqual(ran, []);
  }
});

test('Gate B 4: "Discard and continue" when the session cannot be read → the sheet comes back with an error, nothing discarded', async () => {
  const p = phone({ pendingRows: 2 });
  await G.guardSignedIn(p.d, { sessionUser: B });
  const last = p.asked[0];
  p.d.getSession = async () => { throw new Error('Network request failed'); };
  const r = await G.discardAndContinue(p.d, { lastAsk: last });
  assert.equal(r.status, 'retry');
  assert.equal(p.asked.length, 2, 'asked again');
  assert.equal(p.asked[1].previous, 'a@example.com');
  assert.equal(p.asked[1].error, true);
  assert.equal(p.rows().length, 3, 'nothing discarded');
  const sheet = G.accountAskSheet((k) => translations.pt[k], { previous: 'a@example.com', error: true, onSave() {}, onDiscard() {} });
  assert.equal(sheet.note, translations.pt.error_generic, 'an existing error line, in the app language');
  assert.equal(sheet.buttons.length, 2, 'both choices still there to retry');
  // Retry with the session back → the discard runs and B continues.
  p.d.getSession = async () => ({ user: B });
  const ok = await G.discardAndContinue(p.d, { lastAsk: last });
  assert.equal(ok.status, 'continue');
  assert.equal(ok.session.user.id, 'user-b');
  assert.equal(p.rows().length, 0);
});

test('Gate B 4: "Sign in as A first" whose local sign-out fails → the sheet comes back with an error, nothing discarded', async () => {
  const p = phone({ pendingRows: 2 });
  await G.guardSignedIn(p.d, { sessionUser: B });
  p.d.signOutLocally = async () => ({ signedOut: false });
  assert.equal(await G.resolveAccountAsk('save', p.d, { lastAsk: p.asked[0] }), 'retry');
  assert.equal(p.asked.length, 2);
  assert.equal(p.asked[1].error, true);
  assert.equal(p.rows().length, 3);
});

test('Gate B 4: App\'s Discard goes through discardAndContinue and keeps the last sheet to bring back', () => {
  const app = read('App.js');
  assert.match(app, /discardAndContinue\(guardDeps\(\), \{ lastAsk: lastAskRef\.current \}\)/);
});
