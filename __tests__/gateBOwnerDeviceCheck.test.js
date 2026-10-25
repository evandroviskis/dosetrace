'use strict';
// Gate B (merge of 1.3.1 into 1.3.2), F1: A-119's device checks never run under another account's
// local data. Account A's rows were never backed up; session B is on the phone (DV-242 holds the UI
// behind the cross-account sheet). B was replaced on another phone. Before the fix the foreground
// check (App.js deviceGate('foreground')), the profile-write guard (lib/deviceRuntime
// metadataGuardCheck) and the Android background run asked device_status for B and stored screen 2
// with A's rows counted as B's (summarizeUnsent([A, B])); the locked verdict sheet hid the DV-242
// sheet and "Continue" wiped A's rows without "Sign in as A first". Now each returns before the
// server is asked: { go: false, reason: 'owner_check' } — also when the owner cannot be read.
// Doubt 3: the stashed onboarding answers are written after the device step of the deferred sign-in
// (App.js continueSignedIn), never before any claim, and stay on the phone when refused.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');
const { makeDb, makeDeviceCloud } = require('./helpers/syncHarness');
const { phone } = require('./helpers/devicePhone');
const { summarizeUnsent } = require('../lib/unsentSummary');
const { pendingProfilePatch } = require('../lib/pendingProfile');
const G = require('../lib/accountGuard');

const A = 'user-a';
const B = { id: 'user-b', email: 'b@example.com' };

function ownerOf(db) {
  for (const t of ['protocols', 'dose_logs', 'biomarkers', 'food_logs']) {
    const r = db.getFirstSync(`SELECT user_id FROM ${t} WHERE user_id IS NOT NULL LIMIT 1`);
    if (r && r.user_id) return r.user_id;
  }
  return null;
}

// Phone P holds 2 of A's rows never backed up; B's session is on it and B was replaced on phone Q.
async function heldPhone() {
  const cloud = makeDeviceCloud();
  cloud.addUser(B.id);
  const first = phone(cloud, 'dev-P', B.id); // B used P before (its own empty copy)
  await first.signIn();
  const db = makeDb();
  for (let i = 0; i < 2; i++) db.runSync(`INSERT INTO dose_logs (user_id, protocol_id, logged_at, sync_status) VALUES ('${A}', 1, '2026-10-1${i}T08:00:00Z', 'pending')`);
  const P = phone(cloud, 'dev-P', B.id, { kv: first.kv, db });
  // The runtime's own count (lib/deviceRuntime summarize): the local owner AND the session user.
  P.flow = require('../lib/deviceFlow').createDeviceFlow({
    rpc: (n, a) => P.view.rpc(n, a), rpcAnon: (n, a) => P.view.rpc(n, a), deviceId: async () => 'dev-P',
    deviceInfo: () => ({ platform: 'ios', name: 'iPhone' }), appVersion: '1.3.1', store: P.kv,
    secret: { get: async () => null, set: async () => {}, remove: async () => {} },
    summarize: async (uid, o) => summarizeUnsent(db, [ownerOf(db), uid], o || {}),
    stopSync: () => {}, cancelReminders: async () => {}, onChange: () => {},
  });
  const Q = phone(cloud, 'dev-Q', B.id, { session: '2026-10-15T09:00:00.000Z' });
  await Q.signIn(); // B is now active on Q: P was replaced
  const rows = () => db.getAllSync(`SELECT * FROM dose_logs WHERE user_id = '${A}'`);
  return { cloud, db, P, rows };
}

// The runtime's one owner check (absent before the fix: the checks then ran without it).
const ownerFn = (getLocalDataUserId) => {
  try { return loadFn('lib/deviceRuntime.js', 'function localOwnerBlocks(', 'localOwnerBlocks', { getLocalDataUserId, ownerBlocksSync: G.ownerBlocksSync }); } catch { return undefined; }
};
const loadGate = (P, getLocalDataUserId) => loadFn('lib/deviceRuntime.js', 'export async function deviceGate(', 'deviceGate', {
  getCachedUser: async () => B, deviceFlow: () => P.flow, localOwnerBlocks: ownerFn(getLocalDataUserId),
});
const loadMetaGuard = (P, getLocalDataUserId, explicit = false) => loadFn('lib/deviceRuntime.js', 'export async function metadataGuardCheck(', 'metadataGuardCheck', {
  getCachedUser: async () => B, deviceFlow: () => P.flow, isExplicitSignIn: () => explicit, localOwnerBlocks: ownerFn(getLocalDataUserId),
});

test('F1: the foreground device check under A\'s data → owner_check; no screen 2, A\'s rows kept, the DV-242 sheet is the one shown', async () => {
  const { db, P, rows } = await heldPhone();
  // DV-242: B's sign-in held the UI on the cross-account sheet.
  const asked = [];
  const held = await G.guardSignedIn({
    getLocalOwner: () => ownerOf(db), countPending: () => rows().length, readOwnerLabel: async () => JSON.stringify({ id: A, email: 'a@example.com' }),
    rememberOwner: async () => {}, ask: (a) => asked.push(a),
  }, { sessionUser: B });
  assert.equal(held, 'held');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].previous, 'a@example.com');
  // The app comes to the foreground: App.js asks deviceGate('foreground').
  const g = await loadGate(P, () => ownerOf(db))('foreground');
  assert.deepEqual(g, { go: false, reason: 'owner_check' });
  const st = await P.flow.load();
  assert.equal(st.verdict, null, 'no locked screen 2 over the DV-242 sheet');
  assert.equal(st.ask, null, 'no screen 4 either');
  // "Continue" has nothing to act on: it wipes nothing.
  let wiped = 0;
  const cont = loadFn('lib/deviceRuntime.js', 'export async function continueAfterVerdict(', 'continueAfterVerdict', {
    deviceFlow: () => P.flow, require: () => ({ stopSyncEngine() {} }), supabase: { auth: { getSession: async () => ({ data: { session: { user: B } } }) } },
    runRegisteredWipe: () => { wiped += 1; }, clearLocalDatabase: () => { wiped += 1; },
  });
  assert.deepEqual(await cont(), { ok: true });
  assert.equal(wiped, 0);
  assert.equal(rows().length, 2, 'A\'s two rows never backed up are still on the phone');
});

test('F1: an owner that cannot be read never runs the device check (fails closed)', async () => {
  const { P } = await heldPhone();
  const g = await loadGate(P, () => { throw new Error('database locked'); })('foreground');
  assert.deepEqual(g, { go: false, reason: 'owner_check' });
  assert.equal((await P.flow.load()).verdict, null);
});

test('F1: B\'s own data (or none yet) → the device check runs as A-119 requires (screen 2 for the replaced phone)', async () => {
  const { P } = await heldPhone();
  const g = await loadGate(P, () => null)('foreground');
  assert.equal(g.go, false);
  assert.equal(g.reason, 'verdict');
  assert.equal((await P.flow.load()).verdict.kind, 'replaced');
});

test('F1: the profile-write guard under A\'s data refuses without asking the server (no screen 2 / 4 stored); the Apple name of the sign-in being made still goes', async () => {
  const { db, P, rows } = await heldPhone();
  assert.equal(await loadMetaGuard(P, () => ownerOf(db))(), false);
  let st = await P.flow.load();
  assert.equal(st.verdict, null);
  assert.equal(st.ask, null);
  assert.equal(await loadMetaGuard(P, () => { throw new Error('locked'); })(), false, 'unreadable owner: refused');
  assert.equal(await loadMetaGuard(P, () => ownerOf(db), true)(), true, 'the sign-in the person is making: its own profile field (sent once by Apple)');
  st = await P.flow.load();
  assert.equal(st.verdict, null, 'and still nothing stored');
  assert.equal(rows().length, 2);
  // B's own data: the A-119 check as before (replaced → refused, verdict stored).
  assert.equal(await loadMetaGuard(P, () => B.id)(), false);
  assert.equal((await P.flow.load()).verdict.kind, 'replaced');
});

test('F1: the Android background run under A\'s data stores no verdict', async () => {
  const { db, P, rows } = await heldPhone();
  P.flow.backgroundCheck = async () => { throw new Error('the server must not be asked'); };
  const bg = loadFn('lib/deviceRuntime.js', 'export async function backgroundDeviceCheck(', 'backgroundDeviceCheck', {
    readStoredUser: async () => B, deviceFlow: () => P.flow, localOwnerBlocks: ownerFn(() => ownerOf(db)),
  });
  assert.equal(await bg(), 'unknown');
  assert.equal((await P.flow.load()).verdict, null);
  assert.equal(rows().length, 2);
});

test('F1: the cross-account sheet wins over a stored device sheet while the account is held (App.js)', () => {
  const app = read('App.js');
  assert.match(app, /const deviceSheet = deviceHeld \|\| accountHeld \? null/);
  assert.match(read('lib/deviceRuntime.js'), /setMetadataGuard\(metadataGuardCheck\);/);
});

// ── Doubt 3 ───────────────────────────────────────────────────────────────────────────────────
// The real applyPendingProfile with its storage faked; updateUser goes through the device guard
// exactly like lib/supabase's wrapper (refused → DT001, nothing written).
function stash(allow) {
  const s = { data: { display_name: 'Sam', primary_goal: 'fat_loss' }, cleared: 0, written: [] };
  const apply = loadFn('lib/onboardingStore.js', 'export async function applyPendingProfile(', 'applyPendingProfile', {
    loadOnboarding: async () => (s.data ? { ...s.data } : {}),
    clearOnboarding: async () => { s.cleared += 1; s.data = null; },
    fresh: true,
    pendingProfilePatch,
  });
  const supabase = { auth: {
    getUser: async () => ({ data: { user: { id: B.id, user_metadata: {} } } }),
    updateUser: async ({ data }) => (allow.ok ? (s.written.push(data), { data: {}, error: null }) : { data: { user: null }, error: { code: 'DT001' } }),
  } };
  return { s, apply: () => apply(supabase) };
}

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

function loadContinue(order, step, applyPendingProfile) {
  return loadFn('App.js', 'const continueSignedIn = async (s) => {', 'continueSignedIn', {
    signInDeviceStep: async () => { order.push('device'); return step; },
    deviceFlow: () => ({}), deviceGate: async () => ({ go: true }), startSyncEngine: () => {}, isLocalDBEmpty: () => false,
    fullImportFromCloud: async () => {}, requestSync: () => {}, reloadDevice: () => {},
    runRealityMigration: async () => {}, syncAllNotifications: async () => {}, registerPushToken: async () => {},
    applyPendingProfile: async () => { order.push('profile'); return applyPendingProfile(); }, supabase: {},
  });
}

test('Doubt 3: after "Discard and continue" the answers are written after the device step', async () => {
  const allow = { ok: true };
  const { s, apply } = stash(allow);
  const order = [];
  await loadContinue(order, { held: false, migrate: false }, apply)({ user: B });
  await flush(); // the write is not awaited by the sign-in work (as on SIGNED_IN)
  assert.deepEqual(order, ['device', 'profile']);
  assert.equal(s.written.length, 1);
  assert.equal(s.written[0].display_name, 'Sam');
  assert.equal(s.cleared, 1);
});

test('Doubt 3: refused by the device check (B in use elsewhere) → the answers stay on the phone for the next try', async () => {
  const allow = { ok: false };
  const { s, apply } = stash(allow);
  const order = [];
  await loadContinue(order, { held: true, migrate: false }, apply)({ user: B });
  await flush(); // the write is not awaited by the sign-in work (as on SIGNED_IN)
  assert.deepEqual(order, ['device', 'profile']);
  assert.equal(s.written.length, 0);
  assert.equal(s.cleared, 0, 'never dropped');
  assert.deepEqual(s.data, { display_name: 'Sam', primary_goal: 'fat_loss' });
});

test('Doubt 3: the held SIGNED_IN no longer writes the answers before any device claim (App.js)', () => {
  const app = read('App.js');
  assert.match(app, /if \(guard !== 'continue'\) \{\n\s+\/\/[^\n]*\n(\s+\/\/[^\n]*\n)*\s+return;\n\s+\}/);
  const cont = app.slice(app.indexOf('const continueSignedIn = async (s) => {'), app.indexOf('// DV-242: the two choices of the cross-account sheet.'));
  assert.ok(cont.indexOf('applyPendingProfile(supabase)') > cont.indexOf('await signInDeviceStep('), 'after the device step');
});
