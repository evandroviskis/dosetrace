'use strict';
// A-119 wiring, as behaviour where the code runs under node (the real functions cut out of the app
// files with helpers/extractFn, their imports replaced by fakes) and as source pins where it cannot
// (App.js renders React Native).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');
const { withDeviceHeaders } = require('../lib/deviceFetch');
const { createSyncRunner } = require('../lib/syncRunner');
const { runSyncPass } = require('../lib/syncPassCore');
const { createDeviceFlow, KEYS } = require('../lib/deviceFlow');
const { makeDb, makeDeviceCloud } = require('./helpers/syncHarness');
const { phone, memKv, addProtocol, addDose, doses } = require('./helpers/devicePhone');
const { summarizeUnsent } = require('../lib/unsentSummary');
const { pendingForSignOut } = require('../lib/recoveryFlow');
const { TABLES, getPendingChanges, rebuildFromCloud } = require('../lib/syncCore');
const R = require('../lib/reminderRefresh');

const URL_ = 'https://x.supabase.co';

test('OD-7 / OD-17: data and function requests carry the device id and version; auth and other hosts do not; a failed read never stops the request', async () => {
  const seen = [];
  const base = async (input, init) => { seen.push({ u: String(input), h: init && init.headers ? Object.fromEntries(new Headers(init.headers).entries()) : {} }); return 'ok'; };
  const f = withDeviceHeaders(base, async () => ({ 'x-dt-device': 'i:abc', 'x-dt-app-version': '1.3.1' }), URL_);
  await f(`${URL_}/rest/v1/dose_logs?select=*`, { headers: { apikey: 'k', Authorization: 'Bearer t' } });
  await f(`${URL_}/rest/v1/rpc/claim_device`, { method: 'POST', headers: new Headers({ apikey: 'k' }) });
  await f(`${URL_}/functions/v1/delete-user`, {});
  await f(`${URL_}/auth/v1/token?grant_type=refresh_token`, { headers: { apikey: 'k' } });
  await f('https://exp.host/--/api/v2/push/send', {});
  assert.equal(seen[0].h['x-dt-device'], 'i:abc');
  assert.equal(seen[0].h.authorization, 'Bearer t', 'the existing headers stay');
  assert.equal(seen[1].h['x-dt-app-version'], '1.3.1');
  assert.equal(seen[2].h['x-dt-device'], 'i:abc');
  assert.equal(seen[3].h['x-dt-device'], undefined, 'auth needs none');
  assert.equal(seen[4].h['x-dt-device'], undefined, 'never to another host');
  const g = withDeviceHeaders(base, async () => { throw new Error('keychain'); }, URL_);
  assert.equal(await g(`${URL_}/rest/v1/x`, {}), 'ok');
  assert.match(read('lib/supabase.js'), /fetch: withDeviceHeaders\(\(\.\.\.a\) => fetch\(\.\.\.a\), deviceHeaders, supabaseUrl\)/);
  assert.match(read('lib/accountActions.js'), /\.\.\.devHeaders,/, 'delete-user gets them too (its own fetch)');
});

test('OD-6 / OD-9: the count on screen is the count at risk — summarizeUnsent equals the deliberate sign-out\'s count', () => {
  const db = makeDb();
  const pid = addProtocol(db, 'u1');
  addDose(db, 'u1', pid);
  addDose(db, 'u2', pid);
  db.runSync(`INSERT INTO biomarkers (remote_id, user_id, report_date, marker, value, unit, created_at, updated_at, sync_status) VALUES ('b1', 'u1', '2026-10-01', 'TSH', '2', 'x', 'a', 'a', 'deleted')`);
  db.runSync(`INSERT INTO vaccines (user_id, name, date_given, created_at, updated_at, sync_status) VALUES ('u1', 'Flu', '2026-10-03', 'a', 'a', 'synced')`);
  for (const ids of [['u1', null], ['u1', 'u2'], [null, 'u2']]) {
    const n = pendingForSignOut({ db, localOwnerId: ids[0], sessionUserId: ids[1], tables: TABLES, getPending: getPendingChanges });
    assert.equal(summarizeUnsent(db, ids).count, n, JSON.stringify(ids));
  }
  assert.throws(() => summarizeUnsent(db, [null, null]), 'no owner known: unknown, never 0');
  assert.throws(() => summarizeUnsent({ getAllSync: () => { throw new Error('locked'); } }, ['u1']));
});

test('OD-15 (no deadlock): a takeover found by a sync pass rebuilds inside that pass; outside a pass it waits for the runner', async () => {
  let runner;
  const calls = [];
  const rebuildNow = loadFn('lib/sync.js', 'export async function rebuildFromCloudNow(', 'rebuildFromCloudNow', {
    _runner: { runExclusive: (job) => runner.runExclusive(job) },
    notifyListeners: (e) => calls.push(e.type),
    notifyDataChanged: () => calls.push('data_changed'),
    rebuildFromCloud: async () => ({ ok: true }),
    getDB: () => null,
    trackedCloud: null,
  });
  const flow = createDeviceFlow({
    rpc: async (name) => (name === 'device_status' ? { data: { status: 'active', rebuild_owed: true, notice: null }, error: null } : { data: { ok: true }, error: null }),
    deviceId: async () => 'dev-B', deviceInfo: () => null, store: memKv(),
    summarize: async () => ({ count: 0, byKind: {}, from: null, to: null, refused: 0 }),
    rebuild: (uid, o) => rebuildNow(uid, o),
  });
  runner = createSyncRunner(() => runSyncPass({ gate: (ctx) => flow.gate('u1', ctx), push: async () => calls.push('push'), pull: async () => calls.push('pull') }));
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('deadlock')), 1000));
  await Promise.race([runner.run(), timeout]);
  assert.deepEqual(calls, ['import_start', 'import_complete', 'data_changed', 'push', 'pull']);
  calls.length = 0;
  await Promise.race([flow.gate('u1', 'foreground'), timeout]);
  assert.deepEqual(calls.slice(0, 2), ['import_start', 'import_complete'], 'outside a pass: through the runner');
  assert.match(read('lib/deviceRuntime.js'), /rebuild: \(uid, o\) => require\('\.\/sync'\)\.rebuildFromCloudNow\(uid, o\)/);
});

test('OD-6: nothing is discarded without a count — an unreadable database leaves the takeover\'s rebuild owed and the local rows as they are', async () => {
  const cloud = makeDeviceCloud();
  cloud.addUser('u1');
  const A = phone(cloud, 'dev-A', 'u1');
  await A.signIn();
  const db = makeDb();
  const pid = addProtocol(db, 'u1');
  addDose(db, 'u1', pid);
  let readable = false;
  const view = cloud.as('dev-B', { userId: 'u1', sessionCreatedAt: '2026-10-15T09:00:00.000Z' });
  const B = createDeviceFlow({
    rpc: (n, a) => view.rpc(n, a), deviceId: async () => 'dev-B', deviceInfo: () => null, store: memKv(),
    summarize: async (uid) => { if (!readable) throw new Error('locked'); return summarizeUnsent(db, [uid]); },
    rebuild: (uid) => rebuildFromCloud(db, view, uid),
  });
  const r = await B.afterExplicitSignIn('u1');
  assert.equal(r.go, false);
  assert.equal(r.reason, 'unreadable');
  assert.equal(doses(db, 'u1').length, 1, 'kept');
  assert.equal(cloud.device('u1', 'dev-B').rebuild_owed, true, 'the server keeps the rebuild owed');
  readable = true;
  const r2 = await B.gate('u1', 'foreground');
  assert.equal(r2.go, true);
  assert.equal(doses(db, 'u1').length, 0, 'rebuilt once it could count');
  assert.equal((await B.load()).notice.own.count, 2, 'and the count is in the notice');
});

test('OD-7: the profile / user_metadata check — refused after the verdict or with the screen-4 question; allowed while this phone\'s own sign-in settles; unknown never blocks', async () => {
  const cloud = makeDeviceCloud();
  cloud.addUser('u1');
  const A = phone(cloud, 'dev-A', 'u1');
  await A.signIn();
  assert.equal(await A.flow.metadataAllowed('u1'), true);
  const B = phone(cloud, 'dev-B', 'u1', { session: '2026-10-15T09:00:00.000Z' });
  assert.equal(await B.flow.metadataAllowed('u1', { explicit: true }), true, 'the Apple name during the sign-in');
  await B.signIn();
  assert.equal(await A.flow.metadataAllowed('u1'), true, 'a fresh status read within 30 s is reused');
  const A2 = phone(cloud, 'dev-A', 'u1', { kv: A.kv, db: A.db });
  assert.equal(await A2.flow.metadataAllowed('u1'), false, 'replaced: refused (and the verdict stored)');
  assert.equal((await A2.state()).verdict.kind, 'replaced');
  const C = phone(cloud, 'dev-C', 'u1');
  await C.flow.gate('u1', 'startup'); // screen 4
  assert.equal(await C.flow.metadataAllowed('u1'), false);
  const D = phone(cloud, 'dev-D', 'u1');
  D.view.offline = true;
  assert.equal(await D.flow.metadataAllowed('u1'), true, 'no answer: the write itself will fail offline; never refused on a maybe');
  const s = read('lib/supabase.js');
  assert.match(s, /supabase\.auth\.updateUser = async \(attributes, options\) => \{\n\s+if \(attributes && attributes\.data && metadataGuard\)/);
  assert.match(s, /if \(allowed === false\) return \{ data: \{ user: null \}, error: \{ code: 'DT001'/);
  assert.match(read('lib/deviceRuntime.js'), /setMetadataGuard\(async \(\) => \{[\s\S]{0,300}metadataAllowed\(user\.id, \{ explicit: isExplicitSignIn\(\) \}\)/);
});

test('OD-16: the Android background run asks the server first; replaced → nothing scheduled, recorded; no answer → the usual resync', async () => {
  const run = async (device) => {
    const log = [];
    const r = await R.runReminderRefresh({
      now: () => 1, isWipePending: async () => null, ensureDb: () => {}, readStoredUser: async () => ({ id: 'u1' }),
      setBackgroundRun: () => {}, syncAllNotifications: async () => log.push('sync'), countScheduled: async () => 0,
      saveLastRun: async () => {}, deviceCheck: async () => { if (device instanceof Error) throw device; return device; },
    });
    return { r, log };
  };
  const a = await run('replaced');
  assert.equal(a.r.reason, 'replaced');
  assert.deepEqual(a.log, []);
  for (const d of ['unknown', 'active', new Error('offline')]) {
    const b = await run(d);
    assert.deepEqual(b.log, ['sync'], String(d));
  }
  assert.match(read('lib/backgroundTasks.js'), /deviceCheck: \(\) => require\('\.\/deviceRuntime'\)\.backgroundDeviceCheck\(\)/);
});

test('OD-4 / OD-16: with a verdict stored nothing is scheduled again (cold start, foreground, any caller)', async () => {
  const log = [];
  const store = new Map([[KEYS.verdict, '{"kind":"replaced"}']]);
  const now = loadFn('lib/notifications.js', 'async function syncAllNotificationsNow(', 'syncAllNotificationsNow', {
    AsyncStorage: { getItem: async (k) => store.get(k) || null },
    DEVICE_VERDICT_KEY: KEYS.verdict,
    syncNotificationCategories: async () => { log.push('categories'); throw new Error('stop here'); },
  });
  await now();
  assert.deepEqual(log, [], 'returned before scheduling');
  store.clear();
  await now().catch(() => {});
  assert.deepEqual(log, ['categories'], 'without a verdict: as before');
});

test('App: the device check comes before the import at a cold start and at a sign-in; screen 2 / 4 import and schedule nothing; the notice waits for Main', () => {
  const app = read('App.js');
  const cold = app.slice(app.indexOf("supabase.auth.getSession().then(async ({ data: { session: firstSession } }) => {"), app.indexOf('// The sign-in work, one function for both paths'));
  assert.ok(cold.indexOf("deviceGate('startup')") > 0 && cold.indexOf("deviceGate('startup')") < cold.indexOf('fullImportFromCloud()'), 'cold start: check, then import');
  assert.match(cold, /const held = !!dev && dev\.go === false && \(dev\.reason === 'verdict' \|\| dev\.reason === 'ask'\);\n\s+if \(!held\) \{/);
  const i = app.indexOf('const onSignedIn = (session) => {');
  const signin = app.slice(i, app.indexOf('setSignInHandler(onSignedIn);'));
  assert.ok(signin.indexOf("afterExplicitSignIn(session.user.id)") > signin.indexOf('Cross-account guard'), 'after the cross-account guard');
  assert.ok(signin.indexOf("afterExplicitSignIn(session.user.id)") < signin.indexOf('await fullImportFromCloud();'), 'the takeover before the first import (OD-3)');
  assert.match(signin, /explicit \? await deviceFlow\(\)\.afterExplicitSignIn\(session\.user\.id\) : await deviceGate\('signin'\)/);
  assert.match(signin, /if \(dev && dev\.go === false && \(dev\.reason === 'verdict' \|\| dev\.reason === 'ask'\)\) return;/);
  assert.match(app, /: dev\.notice && onMain && dev\.notice\.userId === session\.user\.id \? noticeSheet\(/, 'screen 1 only on Main (after the 18+ and profile steps)');
  assert.match(app, /const deviceSheet = deviceHeld \? null\s*: dev\.verdict \? verdictSheet\(/, 'screen 2 first, on any route');
  assert.match(app, /forgetDeviceState: \(\) => deviceFlow\(\)\.clearOnSignOut\(\)/);
  assert.match(read('lib/signedOut.js'), /d\.forgetDeviceState,/);
});
