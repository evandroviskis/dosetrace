'use strict';
// A-119 Gate B round 1 (Docker rehearsal on supabase/postgres 15.8 + PostgREST 12.2) and the spec
// auditor: each finding as the scenario that failed, on the real lib code (two-device harness).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeDeviceCloud } = require('./helpers/syncHarness');
const { phone, memKv, addProtocol, addDose, doses } = require('./helpers/devicePhone');
const { createDeviceFlow } = require('../lib/deviceFlow');
const { runSyncPass } = require('../lib/syncPassCore');
const { askSheet, verdictSheet } = require('../lib/deviceCopy');

const U = 'user-1';
const fold = { platform: 'android', name: null, brand: 'samsung' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function world() { const c = makeDeviceCloud(); c.addUser(U); return c; }
async function activeA(cloud) {
  const A = phone(cloud, 'dev-A', U, { session: '2026-10-15T08:00:00.000Z' });
  await A.signIn();
  const pid = addProtocol(A.db, U); await A.sync();
  addDose(A.db, U, pid); await A.sync();
  return A;
}
const mem = () => memKv();

// ── H2: an unknown that never ends ─────────────────────────────────────────────────────────────
test('H2 (brick.cjs): without the migration (function missing) a sign-in never leaves the app empty: the passes push and pull as before', async () => {
  const missing = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.claim_device' } };
  const flow = createDeviceFlow({ rpc: async () => missing, deviceId: async () => 'i:dev-new-phone', store: mem(), appVersion: '1.3.1', summarize: async () => ({ count: 0 }) });
  const r = await flow.afterExplicitSignIn('U');
  assert.equal(r.go, true, JSON.stringify(r));
  let pushes = 0; let pulls = 0;
  for (let i = 0; i < 3; i++) await runSyncPass({ gate: (ctx) => flow.gate('U', ctx), push: async () => { pushes++; }, pull: async () => { pulls++; } });
  assert.deepEqual({ pushes, pulls }, { pushes: 3, pulls: 3 });
});

test('H2: a claim refused by the server again and again (5xx, permission) stops holding the passes after the second time; offline keeps waiting', async () => {
  const kv = mem();
  let reply = { data: null, error: { code: '42501', message: 'permission denied for function claim_device' } };
  const flow = createDeviceFlow({ rpc: async () => reply, deviceId: async () => 'i:dev-x', store: kv, appVersion: '1.3.1', summarize: async () => ({ count: 0 }) });
  assert.equal((await flow.afterExplicitSignIn('U')).go, false, 'once: maybe passing');
  assert.equal((await flow.gate('U', 'sync')).go, true, 'twice: the guard still refuses writes; the app works');
  const kv2 = mem();
  reply = { data: null, error: { message: 'Network request failed' } };
  const f2 = createDeviceFlow({ rpc: async () => reply, deviceId: async () => 'i:dev-y', store: kv2, appVersion: '1.3.1' });
  await f2.afterExplicitSignIn('U');
  for (let i = 0; i < 4; i++) assert.equal((await f2.gate('U', 'sync')).go, false, 'offline: still pending (nothing can sync anyway)');
});

// ── H3: what the winning phone typed is never deleted ─────────────────────────────────────────
test('H3: rows typed on the phone after its own sign-in (claim still pending) are kept and pushed after the takeover; only older unsent rows are discarded and counted', async () => {
  const cloud = world();
  const A = await activeA(cloud);
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  const old = addProtocol(B.db, U, { name: 'left-over' }); // unsent from before this sign-in
  B.db.runSync(`UPDATE protocols SET updated_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`, [old]);
  B.view.offline = true;
  assert.equal((await B.signIn()).go, false, 'claim pending');
  const typed = addProtocol(B.db, U, { name: 'typed-after-sign-in' });
  B.db.runSync(`UPDATE protocols SET updated_at = ? WHERE id = ?`, [new Date(Date.now() + 1000).toISOString(), typed]);
  B.view.offline = false;
  await B.sync(); // the takeover + rebuild
  await B.sync(); // the kept row goes up
  const names = cloud.base.rows('protocols', U).map((p) => p.name).sort();
  assert.deepEqual(names, ['BPC-157', 'typed-after-sign-in'], 'the typed protocol is in the account; the left-over is not');
  assert.equal((await B.state()).notice.own.count, 1, 'the left-over is the one named');
  assert.ok(A);
});

test('H3: a row typed while the rebuild is fetching is kept (the count is taken in the same transaction as the delete)', async () => {
  const cloud = world();
  await activeA(cloud);
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  const realFetchAll = B.view.fetchAll;
  let typedDuring = null;
  B.view.fetchAll = async (...a) => {
    if (typedDuring == null) {
      const pid = addProtocol(B.db, U, { name: 'typed-during-fetch' });
      B.db.runSync(`UPDATE protocols SET updated_at = ? WHERE id = ?`, [new Date(Date.now() + 5000).toISOString(), pid]);
      typedDuring = pid;
    }
    return realFetchAll(...a);
  };
  await B.signIn();
  B.view.fetchAll = realFetchAll;
  assert.ok(B.db.getFirstSync(`SELECT id FROM protocols WHERE name = 'typed-during-fetch'`), 'kept');
  const n = (await B.state()).notice;
  assert.equal(n.own, null, 'nothing discarded, nothing counted');
});

// ── M1: one check at a time ────────────────────────────────────────────────────────────────────
test('M1 (dbl.cjs): a foreground check and a pass at the same time run one owed rebuild once', async () => {
  let owed = true; let rebuilds = 0; let claims = 0;
  const rpc = async (name) => {
    await sleep(20);
    if (name === 'device_status') return { data: { status: 'active', rebuild_owed: owed, notice: null }, error: null };
    if (name === 'device_ack') { owed = false; return { data: { ok: true }, error: null }; }
    if (name === 'claim_device') { claims++; return { data: { status: 'active', took_over: false, rebuild_owed: false, secret: `s${claims}` }, error: null }; }
    return { data: null, error: { message: 'x' } };
  };
  const passes = [];
  const flow = createDeviceFlow({ rpc, deviceId: async () => 'i:dev', store: mem(), appVersion: '1.3.1', summarize: async () => ({ count: 0 }),
    rebuild: async () => { rebuilds++; await sleep(200); return { ok: true, discarded: null }; }, requestPass: () => passes.push(1) });
  const fg = flow.gate('U', 'foreground');
  await sleep(30);
  const pass = flow.gate('U', 'sync');
  await Promise.all([fg, pass]);
  assert.equal(rebuilds, 1);
  assert.equal(passes.length, 1, 'outside a pass the rebuild is left to the pass');
});

test('M1: two checks at a cold start (startup + restored-session SIGNED_IN) claim once — the background secret is rotated once', async () => {
  let claims = 0;
  let active = false;
  const rpc = async (name) => {
    await sleep(10);
    if (name === 'device_status') return { data: { status: active ? 'active' : 'none' }, error: null };
    if (name === 'claim_device') { claims++; active = true; return { data: { status: 'active', took_over: false, rebuild_owed: false, secret: `s${claims}` }, error: null }; }
    return { data: null, error: null };
  };
  let secret = null;
  const flow = createDeviceFlow({ rpc, deviceId: async () => 'i:dev', store: mem(), appVersion: '1.3.1', secret: { set: async (v) => { secret = v; }, get: async () => secret, remove: async () => {} } });
  await Promise.all([flow.gate('U', 'startup'), flow.gate('U', 'signin')]);
  assert.equal(claims, 1);
  assert.equal(secret, 's1');
});

// ── Auditor race: a pass before the sign-in's own claim ──────────────────────────────────────
test('race: a pass that runs between the sign-in and its claim does the claim itself — never screen 4 or 2 for the phone the person just signed in on', async () => {
  const cloud = world();
  await activeA(cloud);
  const B = phone(cloud, 'dev-B', U, { info: fold, session: '2026-10-15T09:00:00.000Z' });
  B.flow.noteExplicitSignIn(U); // App, at the start of the deferred sign-in work
  await B.sync(); // a pass got there first
  assert.equal((await B.state()).ask, null);
  assert.equal(cloud.active(U), 'dev-B');
  const r = await B.flow.afterExplicitSignIn(U);
  assert.equal(r.go, true);
  assert.equal(doses(B.db, U).length, 1, 'rebuilt once');
});

// ── H1: screen 4 says what is unsent, before either choice ────────────────────────────────────
test('H1: screen 4 carries this phone\'s unsent count (kinds and dates) before either choice', async () => {
  const cloud = world();
  await activeA(cloud);
  const b = makeDb();
  const pid = addProtocol(b, U);
  addDose(b, U, pid);
  const B = phone(cloud, 'dev-B', U, { db: b, info: fold });
  await B.flow.gate(U, 'startup');
  const ask = (await B.state()).ask;
  assert.equal(ask.summary.count, 2);
  const t = (k) => ({ dev_ask_title: 'T', dev_ask_body: 'body {dev_in}', dev_ask_use: 'Use', dev_ask_signout: 'Out', dev_ask_unsent_many: '{n} unsent: {what}.', dev_kinds_range: '{kinds} from {range}', dev_kind_dose_one: '1 dose', dev_kind_protocol_one: '1 protocol change', dev_list_and: 'and', dev_named_in: 'on the {name}', dev_named_subj: 'the {name}' })[k] || k;
  const sheet = askSheet({ t, language: 'en', ask });
  assert.match(sheet.body, /2 unsent: 1 dose and 1 protocol change from Oct 12/);
});

// ── Never wipe without a count ────────────────────────────────────────────────────────────────
test('OD-6: a verdict whose count could not be read shows no wipe button until the count is read', () => {
  const t = (k) => k;
  assert.equal(verdictSheet({ t, language: 'en', verdict: { kind: 'replaced', at: '2026-10-15T09:10:00Z', summary: null, unknown: true } }), null);
  assert.ok(verdictSheet({ t, language: 'en', verdict: { kind: 'replaced', at: '2026-10-15T09:10:00Z', summary: { count: 0, byKind: {} } } }));
  assert.ok(verdictSheet({ t, language: 'en', verdict: { kind: 'gone' } }), 'the account is gone: nothing can be kept anyway');
});

// ── LOW: the background answer names its account ──────────────────────────────────────────────
test('LOW: the background check acts only when the server\'s answer names this phone\'s account', async () => {
  let s = null;
  const reply = { data: { status: 'replaced', at: '2026-10-15T09:10:00Z', user_id: 'someone-else' }, error: null };
  const flow = createDeviceFlow({ rpcAnon: async () => reply, rpc: async () => ({}), deviceId: async () => 'i:d', store: mem(), secret: { get: async () => 'x'.repeat(48), set: async (v) => { s = v; }, remove: async () => {} } });
  assert.equal(await flow.backgroundCheck('U'), 'unknown');
  assert.equal((await flow.load()).verdict, null);
  reply.data.user_id = 'U';
  assert.equal(await flow.backgroundCheck('U'), 'replaced');
  assert.ok(s === null);
});

// ── M4: deleting the account while this phone's own takeover is unconfirmed ──────────────────
const { loadFn } = require('./helpers/extractFn');
function loadDelete(replies, gateResult, calls) {
  return loadFn('lib/accountActions.js', 'export async function requestAccountDeletion(', 'requestAccountDeletion', {
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }), refreshSession: async () => ({ data: { session: null } }) } },
    fetch: async (u) => { calls.push(String(u).includes('delete-user') ? 'POST' : 'GET'); const r = replies.shift(); return { ok: r.status === 200, status: r.status, json: async () => r.body }; },
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' } },
    pauseSyncForDeletion: () => {}, resumeSyncAfterDeletion: () => calls.push('resume'), deletionRequestSettled: () => {}, waitForSyncIdle: async () => {},
    setTimeout, clearTimeout,
    require: () => ({ deviceHeaders: async () => ({ 'x-dt-device': 'i:dev' }), deviceGate: async () => { calls.push('check'); return gateResult; } }),
  });
}
const r409 = { status: 409, body: { error: 'device_not_active' } };
test('M4: a 409 while the takeover is unconfirmed is never a silent no-op: the check, one retry, then "not deleted, try again"', async () => {
  let calls = [];
  assert.deepEqual(await loadDelete([r409], { go: false, reason: 'verdict' }, calls)(), { replaced: true }, 'confirmed replaced: screen 2');
  calls = [];
  const ok = await loadDelete([r409, { status: 200, body: { success: true } }], { go: true }, calls)();
  assert.equal(ok.ok, true, 'the takeover went through: deleted on the retry');
  assert.deepEqual(calls.filter((c) => c === 'POST').length, 2);
  calls = [];
  assert.deepEqual(await loadDelete([r409, r409], { go: true }, calls)(), { deviceWait: true }, 'still refused: said, once');
  calls = [];
  assert.deepEqual(await loadDelete([r409], { go: false, reason: 'claim_pending' }, calls)(), { deviceWait: true });
  assert.ok(calls.includes('resume'), 'sync resumes');
  const fs = require('fs'); const path = require('path');
  for (const f of ['screens/SettingsScreen.js', 'screens/AgeConfirmScreen.js']) assert.match(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), /result\.deviceWait\) \{[^}]*settings_delete_device_wait/, f);
});

// ── Auditor race / weak evidence: the sign-in and cold-start device steps as behaviour ─────────
const { signInDeviceStep, startupDeviceStep } = require('../lib/signInDevice');
test('auditor race: the sync engine starts only after the sign-in\'s claim; screen 2 / 4 import nothing; a phone that owes a rebuild is not imported first', async () => {
  const log = [];
  const base = (dev) => ({
    explicit: true, userId: 'U',
    flow: { afterExplicitSignIn: async () => { log.push('claim'); return dev; } },
    gate: async () => { log.push('check'); return dev; },
    startSync: () => log.push('engine'), isLocalEmpty: () => true,
    fullImport: async () => log.push('import'), requestSync: () => log.push('sync'), reload: () => {},
  });
  await signInDeviceStep(base({ go: true, outcome: 'normal' }));
  assert.deepEqual(log, ['claim', 'engine', 'import']);
  log.length = 0;
  assert.equal((await signInDeviceStep(base({ go: false, reason: 'ask' }))).held, true);
  assert.deepEqual(log, ['claim', 'engine']);
  log.length = 0;
  await signInDeviceStep(base({ go: false, reason: 'rebuild_queued' }));
  assert.deepEqual(log, ['claim', 'engine', 'sync'], 'the pass rebuilds; no import before it');
  log.length = 0;
  await signInDeviceStep({ ...base({ go: true }), explicit: false });
  assert.deepEqual(log, ['check', 'engine', 'import'], 'any other SIGNED_IN only checks (OD-14)');
  log.length = 0;
  assert.equal((await startupDeviceStep({ gate: async () => ({ go: false, reason: 'verdict' }), userId: 'U', isLocalEmpty: () => true, fullImport: async () => log.push('import'), requestSync: () => log.push('sync') })).held, true);
  assert.deepEqual(log, [], 'a stored verdict: nothing pulled at a cold start');
  const fs = require('fs'); const path = require('path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  const i = app.indexOf('const onSignedIn = (session) => {');
  const body = app.slice(i, app.indexOf('setSignInHandler(onSignedIn);'));
  assert.doesNotMatch(body, /\n\s+startSyncEngine\(\);/, 'the engine is started by the device step, not before it');
  assert.match(body, /startSync: startSyncEngine/);
});

// ── M2: a phone that becomes active (no takeover) after another phone held the account ────────
const { pushPending, fullImport } = require('../lib/syncCore');
test('M2: a silent or released claim on a phone with a stale copy rebuilds it (a dose deleted meanwhile never comes back) and keeps its unsent rows', async () => {
  const cloud = world();
  // B held the account under 1.3.0 (no device id): its copy has the protocol and dose X.
  const b = makeDb();
  const legacy = cloud.as(null, { userId: U });
  const pid = addProtocol(b, U); await pushPending(b, legacy, U); addDose(b, U, pid); await pushPending(b, legacy, U);
  // A becomes the account's phone, deletes X, then signs out normally (releases the account).
  const a = makeDb(); await fullImport(a, legacy, U);
  const A = phone(cloud, 'dev-A', U, { db: a });
  await A.flow.gate(U, 'startup'); // silent: active
  a.runSync(`UPDATE dose_logs SET sync_status = 'deleted'`);
  await A.sync();
  assert.equal(cloud.base.rows('dose_logs', U).length, 0);
  assert.equal(await A.flow.release(U), true);
  // B updates to 1.3.1 with a new unsent dose Y.
  addDose(b, U, b.getFirstSync('SELECT id FROM protocols').id, { logged_at: '2026-10-14T12:00:00.000Z' });
  const B = phone(cloud, 'dev-B', U, { db: b, info: fold });
  const g = await B.gate('startup');
  assert.equal(g.go, true);
  assert.equal(cloud.active(U), 'dev-B');
  const left = doses(b, U);
  assert.equal(left.length, 1, 'X is gone; only Y is here (kept through the rebuild)');
  assert.equal(left[0].logged_at, '2026-10-14T12:00:00.000Z');
  assert.equal(cloud.base.rows('dose_logs', U).length, 1, 'Y reached the account; X did not come back');
  assert.equal((await B.state()).notice, null, 'no notice: the other phone signed out normally (DL-108)');
});

test('LOW: a phone that becomes the account\'s removes push tokens with no device id (1.3.0 installs) too', async () => {
  const cloud = world();
  cloud.base._store.push_tokens = new Map([
    ['t0', { id: 't0', user_id: U, expo_token: 'ExpoLegacy', device_id: null }],
    ['t9', { id: 't9', user_id: 'someone-else', expo_token: 'ExpoX', device_id: null }],
  ]);
  const A = phone(cloud, 'dev-A', U);
  await A.flow.gate(U, 'startup');
  assert.deepEqual([...cloud.base._store.push_tokens.keys()], ['t9']);
});
