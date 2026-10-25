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
  const { ran, pass } = syncSteps({ getCachedUser: async () => ({ id: 'user-b' }), getLocalDataUserId: () => 'user-a' });
  await pass();
  assert.deepEqual(ran, [], 'no push, no pull under B with A\'s data');
  const same = syncSteps({ getCachedUser: async () => ({ id: 'user-b' }), getLocalDataUserId: () => 'user-b' });
  await same.pass();
  assert.deepEqual(same.ran, ['push', 'pull'], 'B\'s own data syncs as before');
});

// lib/sync.js's real push / pull wrappers and its owner check, with syncCore's steps faked.
function syncSteps(deps) {
  const ran = [];
  const gates = []; // the A-119 device checks the pass asked for
  const events = [];
  const base = { getDB: () => ({}), cloud: {}, ownerBlocksSync: G.ownerBlocksSync, ...deps };
  const ownerBlocksThisSync = loadFn('lib/sync.js', 'function ownerBlocksThisSync(', 'ownerBlocksThisSync', base);
  // trackedCloud: A-119 (1.3.2) sends the engine calls through the refusal-tracking adapter.
  const all = { ...base, ownerBlocksThisSync, trackedCloud: {}, pushPending: async () => ran.push('push'), pullChanges: async () => ran.push('pull') };
  const push = loadFn('lib/sync.js', 'async function pushPendingChanges(', 'pushPendingChanges', all);
  const pull = loadFn('lib/sync.js', 'async function pullCloudChanges(', 'pullCloudChanges', all);
  // 1.3.2 (A-119): the pass runs through lib/syncPassCore with the real passDevice; its device check
  // is faked as "go" (the owner check runs before it).
  const passDevice = loadFn('lib/sync.js', 'function passDevice(', 'passDevice', {
    ...all, trackedCloud: { takeRefused: () => false }, summarizeUnsent: () => { throw new Error('not here'); },
    getLocalDataUserId: base.getLocalDataUserId || (() => null),
    require: () => ({ deviceGate: async (ctx) => { gates.push(ctx); return { go: true }; }, deviceFlow: () => ({ markSent: async () => {} }) }),
  });
  const syncPass = loadFn('lib/sync.js', 'async function syncPass(', 'syncPass', {
    _deletionPaused: false, _isOnline: true, notifyListeners: (e) => events.push(e.type), console: { warn() {} },
    pushPendingChanges: push, pullCloudChanges: pull, runSyncPass: require('../lib/syncPassCore').runSyncPass, passDevice,
  });
  return { ran, events, gates, pass: syncPass };
}

// Merge of 1.3.1 into 1.3.2: the owner check comes BEFORE A-119's device check in a pass — that
// check can rebuild the local copy from the cloud (Gate B M1), which would put B's rows next to A's
// unsent ones. Red before the fix in lib/sync.js passDevice (the gate ran first).
test('merge 1.3.1 + A-119: under another account\'s data the pass never runs the device check (no rebuild into it)', async () => {
  const held = syncSteps({ getCachedUser: async () => ({ id: 'user-b' }), getLocalDataUserId: () => 'user-a' });
  await held.pass();
  assert.deepEqual(held.gates, [], 'no device check');
  assert.deepEqual(held.ran, []);
  assert.ok(held.events.includes('sync_error') && !held.events.includes('sync_complete'));
  const own = syncSteps({ getCachedUser: async () => ({ id: 'user-b' }), getLocalDataUserId: () => 'user-b' });
  await own.pass();
  assert.deepEqual(own.gates, ['sync'], 'its own data: the device check runs first, as A-119 requires');
  assert.deepEqual(own.ran, ['push', 'pull']);
});

// Re-verification 3: a pass the owner check skipped is not a completed sync (Today's "Still going?"
// gate and the offline line read sync_complete as "the cloud's data is here").
test('Re-verify 3: a pass skipped by the owner check never emits sync_complete', async () => {
  for (const deps of [
    { getCachedUser: async () => ({ id: 'user-b' }), getLocalDataUserId: () => 'user-a' },
    { getCachedUser: async () => ({ id: 'user-b' }), getLocalDataUserId: () => { throw new Error('locked'); } },
  ]) {
    const s = syncSteps(deps);
    await s.pass();
    assert.ok(!s.events.includes('sync_complete'), s.events.join(','));
    assert.ok(s.events.includes('sync_error'), 'it settles as not done (the gate never waits forever)');
  }
  const ok = syncSteps({ getCachedUser: async () => ({ id: 'user-b' }), getLocalDataUserId: () => 'user-b' });
  await ok.pass();
  assert.deepEqual(ok.events, ['sync_start', 'sync_complete']);
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

// Re-verification 2: an owner that cannot be read may be THIS account's own unsent rows — Discard
// would wipe them. The fail-closed sheet offers Try again (and Sign out, which keeps the data),
// never Discard. DV-242 option B (founder 2026-10-20): its own title and body, not the generic
// error / error_generic; the buttons stay pw_try_again / settings_signout.
test('Re-verify 2: an owner that cannot be read holds and asks Try again / Sign out — never Discard', async () => {
  const p = phone({ pendingRows: 0 });
  p.d.getLocalOwner = () => { throw new Error('database is locked'); };
  assert.equal(await G.guardSignedIn(p.d, { sessionUser: B }), 'held');
  assert.equal(p.asked.length, 1);
  assert.equal(p.asked[0].unreadable, true);
  assert.equal(p.rows().length, 1, 'nothing discarded');
  for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    const t = (k) => translations[lang][k];
    const sheet = G.accountAskSheet(t, { unreadable: true, onRetry() {}, onSignOut() {}, onSave() {}, onDiscard() {} });
    const labels = sheet.buttons.map((b) => b.label);
    assert.ok(!labels.includes(t('account_guard_discard')), `${lang}: no Discard`);
    assert.ok(labels.includes(t('pw_try_again')) && labels.includes(t('settings_signout')), `${lang}: Try again + Sign out`);
    assert.equal(sheet.title, t('account_guard_unreadable_title'));
    assert.equal(sheet.body, t('account_guard_unreadable_msg'));
    assert.notEqual(sheet.title, t('error'), `${lang}: not the reused generic title`);
    assert.notEqual(sheet.body, t('error_generic'), `${lang}: not the reused generic line`);
    assert.equal(sheet.note, undefined, `${lang}: no error line on the first ask`);
    assert.equal(sheet.locked, true);
    assert.ok(labels.every((l) => typeof l === 'string' && l), `${lang}: every string exists`);
  }
});

// DV-242 option B, approved 2026-10-20 (docs/design/dv242-other-account-sheet.html): the words of
// the unreadable-owner sheet, in all six languages; one term per concept with the app's own
// "Try again" / "Sign out" / phone words.
const UNREADABLE = {
  en: ['Couldn\u2019t check this phone', 'The app couldn\u2019t see which account the data saved here belongs to. Nothing was deleted. Try again, or sign out and sign back in.'],
  pt: ['Não foi possível verificar os dados deste celular', 'O app não conseguiu identificar a qual conta pertencem os dados salvos neste celular. Nenhum dado foi apagado. Tente novamente ou saia da conta e entre de novo.'], // formal register, founder 2026-10-20
  es: ['No se pudo comprobar este tel\u00e9fono', 'La app no pudo ver a qu\u00e9 cuenta pertenecen los datos guardados aqu\u00ed. No se ha borrado nada. Vuelve a intentarlo, o cierra sesi\u00f3n y vuelve a iniciarla.'],
  fr: ['Impossible de v\u00e9rifier ce t\u00e9l\u00e9phone', 'L\u2019app n\u2019a pas pu savoir \u00e0 quel compte appartiennent les donn\u00e9es enregistr\u00e9es ici. Rien n\u2019a \u00e9t\u00e9 supprim\u00e9. R\u00e9essayez, ou d\u00e9connectez-vous puis reconnectez-vous.'],
  de: ['Dieses Handy konnte nicht gepr\u00fcft werden', 'Die App konnte nicht erkennen, zu welchem Konto die hier gespeicherten Daten geh\u00f6ren. Es wurde nichts gel\u00f6scht. Versuch es erneut oder melde dich ab und wieder an.'],
  it: ['Impossibile verificare questo telefono', 'L\u2019app non \u00e8 riuscita a capire a quale account appartengono i dati salvati qui. Non \u00e8 stato eliminato nulla. Riprova, oppure esci e accedi di nuovo.'],
};
test('DV-242 B: the unreadable-owner sheet has its own title and body in all six languages', () => {
  assert.deepEqual(Object.keys(translations).sort(), Object.keys(UNREADABLE).sort());
  for (const [lang, [title, body]] of Object.entries(UNREADABLE)) {
    const tr = translations[lang];
    assert.equal(tr.account_guard_unreadable_title, title, `${lang} title`);
    assert.equal(tr.account_guard_unreadable_msg, body, `${lang} body`);
    if (lang !== 'en') {
      assert.notEqual(tr.account_guard_unreadable_title, translations.en.account_guard_unreadable_title, `${lang}: translated`);
      assert.notEqual(tr.account_guard_unreadable_msg, translations.en.account_guard_unreadable_msg, `${lang}: translated`);
    }
    assert.doesNotMatch(title + body, /\p{Extended_Pictographic}/u, `${lang}: no emoji`);
  }
  // The sheet still says "Try again" / "Sign out" with the app's own buttons (one term per concept).
  const guard = read('lib/accountGuard.js');
  const fn = guard.slice(guard.indexOf('function accountAskSheet('));
  assert.match(fn, /title: t\('account_guard_unreadable_title'\)/);
  assert.match(fn, /body: t\('account_guard_unreadable_msg'\)/);
  assert.match(fn, /label: t\('settings_signout'\), kind: 'secondary', onPress: onSignOut/);
  assert.match(fn, /label: t\('pw_try_again'\), kind: 'primary', onPress: onRetry/);
});

test('Re-verify 2: Try again runs the guard once more — readable now → it continues', async () => {
  const p = phone({ pendingRows: 0, syncedRows: 0, label: null });
  let fail = true;
  const real = p.d.getLocalOwner;
  p.d.getLocalOwner = () => { if (fail) throw new Error('database is locked'); return real(); };
  assert.equal(await G.guardSignedIn(p.d, { sessionUser: B }), 'held');
  fail = false;
  assert.equal(await G.guardSignedIn(p.d, { sessionUser: B }), 'continue');
  assert.equal(p.asked.length, 1);
  const app = read('App.js');
  assert.match(app, /onRetry: onAccountRetry/);
  assert.match(app, /const onAccountRetry = async \(\) => \{[\s\S]{0,400}guardSignedIn\(guardDeps\(\)/);
});

test('Re-verify 2: getLocalDataUserId reports a read error, distinct from "no owner"; a missing table is no error', () => {
  const load = (db) => loadFn('lib/database.js', 'export function getLocalDataUserId(', 'getLocalDataUserId', { getDB: () => db });
  // fresh install: real schema, no rows → null, no throw
  assert.equal(load(makeDb())(), null);
  // a very old install without some tables → skipped
  const old = makeDb();
  old.execSync('DROP TABLE protocols');
  old.runSync(`INSERT INTO dose_logs (user_id, protocol_id, logged_at, sync_status) VALUES ('user-a', 1, '2026-10-01T08:00:00Z', 'synced')`);
  assert.equal(load(old)(), 'user-a');
  // a transient read error → throws (never "no owner")
  const broken = { getFirstSync: () => { throw new Error('database is locked'); } };
  assert.throws(() => load(broken)(), /database is locked/);
});

test('Re-verify 2: a fresh install (no owner, no error) continues without any sheet', async () => {
  const db = makeDb();
  const getLocalDataUserId = loadFn('lib/database.js', 'export function getLocalDataUserId(', 'getLocalDataUserId', { getDB: () => db });
  const p = phone({ pendingRows: 0, syncedRows: 0, label: null });
  p.d.getLocalOwner = getLocalDataUserId;
  assert.equal(await G.guardSignedIn(p.d, { sessionUser: B }), 'continue');
  assert.equal(p.asked.length, 0);
  assert.ok(!p.calls.includes('clearDb'));
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
    const { ran, pass } = syncSteps(deps);
    await pass();
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
