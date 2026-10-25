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

test('OD-15 / Gate B M1 (no deadlock, once): an owed rebuild runs inside a sync pass; a check outside a pass only asks for one', async () => {
  let runner;
  const calls = [];
  let owed = true;
  const rebuildNow = loadFn('lib/sync.js', 'export async function rebuildFromCloudNow(', 'rebuildFromCloudNow', {
    _runner: { runExclusive: (job) => runner.runExclusive(job) },
    notifyListeners: (e) => calls.push(e.type),
    notifyDataChanged: () => calls.push('data_changed'),
    rebuildFromCloud: async (_db, _c, _u, o) => { calls.push(`rebuild:${JSON.stringify(o.keep)}`); return { ok: true, discarded: null }; },
    getDB: () => null,
    trackedCloud: null,
    require: () => ({ syncAllNotifications: async () => calls.push('reminders') }),
  });
  const flow = createDeviceFlow({
    rpc: async (name) => {
      if (name === 'device_status') return { data: { status: 'active', rebuild_owed: owed, notice: null }, error: null };
      if (name === 'device_ack') owed = false;
      return { data: { ok: true }, error: null };
    },
    deviceId: async () => 'dev-B', deviceInfo: () => null, store: memKv(),
    rebuild: (uid, o) => rebuildNow(uid, o),
    requestPass: () => calls.push('pass asked'),
  });
  runner = createSyncRunner(() => runSyncPass({ gate: (ctx) => flow.gate('u1', ctx), push: async () => calls.push('push'), pull: async () => calls.push('pull') }));
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('deadlock')), 1000));
  const fg = await Promise.race([flow.gate('u1', 'foreground'), timeout]);
  assert.equal(fg.reason, 'rebuild_queued');
  assert.deepEqual(calls, ['pass asked'], 'outside a pass: no rebuild');
  calls.length = 0;
  await Promise.race([runner.run(), timeout]);
  assert.deepEqual(calls, ['import_start', 'rebuild:{"seq":null}', 'import_complete', 'data_changed', 'reminders', 'push', 'pull'], 'inside the pass, then the reminders are planned again');
  calls.length = 0;
  await Promise.race([runner.run(), timeout]);
  assert.deepEqual(calls, ['push', 'pull'], 'acknowledged: never twice');
  assert.match(read('lib/deviceRuntime.js'), /rebuild: \(uid, o\) => require\('\.\/sync'\)\.rebuildFromCloudNow\(uid, o\)/);
});

test('OD-6: nothing is discarded without a count — an unreadable count inside the rebuild rolls it back; the server keeps it owed; it runs once the count can be read', async () => {
  const cloud = makeDeviceCloud();
  cloud.addUser('u1');
  const A = phone(cloud, 'dev-A', 'u1');
  await A.signIn();
  const raw = makeDb();
  const pid = addProtocol(raw, 'u1');
  addDose(raw, 'u1', pid);
  raw.runSync(`UPDATE protocols SET updated_at = '2020-01-01T00:00:00.000Z'`);
  raw.runSync(`UPDATE dose_logs SET updated_at = '2020-01-01T00:00:00.000Z'`);
  let readable = false;
  const db = { ...raw, getAllSync: (sql, p) => { if (!readable && /sync_status = 'pending' OR sync_status = 'deleted'/.test(sql)) throw new Error('locked'); return raw.getAllSync(sql, p); } };
  const B = phone(cloud, 'dev-B', 'u1', { db, session: '2026-10-15T09:00:00.000Z' });
  const r = await B.signIn();
  assert.equal(r.go, false);
  assert.equal(r.reason, 'unreadable');
  assert.equal(doses(raw, 'u1').length, 1, 'kept');
  assert.equal(cloud.device('u1', 'dev-B').rebuild_owed, true, 'the server keeps the rebuild owed');
  readable = true;
  const r2 = await B.sync();
  assert.equal(r2.ran, true);
  assert.equal(doses(raw, 'u1').length, 0, 'rebuilt once it could count');
  assert.equal((await B.state()).notice.own.count, 2, 'and the count is in the notice');
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
  // Gate B F1: a named function now (its owner check is behaviour-tested in gateBOwnerDeviceCheck).
  assert.match(read('lib/deviceRuntime.js'), /export async function metadataGuardCheck\(\) \{[\s\S]{0,300}const explicit = isExplicitSignIn\(\);[\s\S]{0,300}return deviceFlow\(\)\.metadataAllowed\(user\.id, \{ explicit \}\);\n\}\nsetMetadataGuard\(metadataGuardCheck\);/);
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

test('App wires the device steps (their behaviour: a119GateB "auditor race"): cold start and sign-in through lib/signInDevice, the sign-in after the cross-account guard; screen 2 first, screen 1 only on Main', () => {
  const app = read('App.js');
  const cold = app.slice(app.indexOf("supabase.auth.getSession().then(async ({ data: { session: firstSession } }) => {"), app.indexOf('// The sign-in work, one function for both paths'));
  assert.match(cold, /const step = await startupDeviceStep\(\{ gate: deviceGate, userId: session\.user\.id, isLocalEmpty: isLocalDBEmpty, fullImport: fullImportFromCloud, requestSync \}\);\n\s+if \(!step\.held\) \{/);
  const i = app.indexOf('const onSignedIn = (session) => {');
  const signin = app.slice(i, app.indexOf('setSignInHandler(onSignedIn);'));
  assert.ok(signin.indexOf('signInDeviceStep({') > signin.indexOf('Cross-account guard'), 'after the cross-account guard');
  assert.match(signin, /if \(step\.held\) return;/);
  assert.match(app, /: dev\.notice && onMain && dev\.notice\.userId === session\.user\.id \? noticeSheet\(/, 'screen 1 only on Main (after the 18+ and profile steps)');
  assert.match(app, /const deviceSheet = deviceHeld \|\| accountHeld \? null\s*: dev\.verdict \? verdictSheet\(/, 'screen 2 first, on any route (after the DV-242 hold: Gate B F1)');
  assert.match(app, /forgetDeviceState: \(\) => deviceFlow\(\)\.clearOnSignOut\(\)/);
  assert.match(read('lib/signedOut.js'), /d\.forgetDeviceState,/);
});
