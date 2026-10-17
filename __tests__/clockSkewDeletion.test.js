'use strict';
// Gate B review of cc29269 (A-137 + A-140), docs/specs/clock-skew-session-plan.md CS-24…CS-26.
// 1. The deletion window: requestAccountDeletion's 401 → refreshSession turns a stand-in into a real
//    session → the recovered hook asks for a sync → a push ran while delete-user was deleting the
//    account's tables. Sync is paused before the delete POST and stays paused until teardown; a
//    failed or offline deletion resumes it.
// 2. Offline delete: a refresh that brings no NEW token (the stored stand-in) is "offline", never
//    "deletion failed".
// 3. NetInfo → offline mapping as one pure function.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthFetch, netInfoOffline } = require('../lib/authFetch');
const { sliceBlock, loadFn, read } = require('./helpers/extractFn');

const URL_ = 'https://x.supabase.co';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const refreshReq = (rt) => [`${URL_}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }) }];

// The real sync engine functions from lib/sync.js, with timers run at once and a counting push.
function syncEngine(onSessionRecovered) {
  const src = read('lib/sync.js');
  const fns = ['export function startSyncEngine(', 'export function stopSyncEngine(', 'export function requestSync(',
    'async function syncPass(', 'export function pauseSyncForDeletion(', 'export function resumeSyncAfterDeletion(', 'export function deletionRequestSettled('];
  const body = `let _isOnline = true; let _knownOnline = null; let _syncTimer = null; let _unsubNetInfo = null; let _unsubRecovered = null; let _deletionPaused = false; let _deletionInFlight = false;
${fns.map((h) => (src.includes(h) ? sliceBlock(src, h).replace(/^export\s+/, '') : `function ${h.match(/function (\w+)/)[1]}() {}`)).join('\n')}
function doSync() { return syncPass(); }
return { startSyncEngine, stopSyncEngine, requestSync, pauseSyncForDeletion, resumeSyncAfterDeletion, deletionRequestSettled };`;
  const counts = { pushes: 0 };
  const deps = {
    NetInfo: { addEventListener: () => () => {} },
    onSessionRecovered,
    notifyListeners: () => {},
    sessionNetworkBack: () => {},
    pushPendingChanges: async () => { counts.pushes += 1; },
    pullCloudChanges: async () => {},
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    console: { warn: () => {} },
  };
  // eslint-disable-next-line no-new-func
  const m = new Function(...Object.keys(deps), body)(...Object.values(deps));
  return { m, counts };
}

// A stale (stand-in) session whose refresh succeeds: the real authFetch fires the recovered hook.
function rig({ deleteStatus = 200, refreshOk = true, sameToken = false } = {}) {
  const queued = [];
  const af = createAuthFetch({
    fetch: async () => json({ access_token: sameToken ? 'old' : 'new', refresh_token: 'rt2', token_type: 'bearer', expires_in: 3600, user: { id: 'u1' } }),
    readStoredSession: async () => null, now: () => 1e6, isOffline: async () => false,
    schedule: (fn) => queued.push(fn), __test: true,
  });
  af.setRecovery({ canRecover: () => true, recover: async () => null });
  af.__test.markStale();
  const { m, counts } = syncEngine((fn) => af.onRecovered(fn));
  m.startSyncEngine();
  const drain = async () => { while (queued.length) await queued.shift()(); };
  const posts = [];
  let pushesDuringDelete = null;
  const supabase = { auth: {
    getSession: async () => ({ data: { session: { access_token: 'old' } } }),
    refreshSession: async () => {
      if (!refreshOk) return { data: { session: null }, error: { message: 'x' } };
      const r = await af.fetch(...refreshReq('rt1')); // through the wrapper: stale → real → hook
      await drain();
      const s = await r.json();
      return { data: { session: s }, error: null };
    },
  } };
  const fetch = async (u, init) => {
    posts.push(init.headers.Authorization);
    if (init.headers.Authorization === 'Bearer old') return json({ error: 'Invalid session' }, 401);
    pushesDuringDelete = counts.pushes; // what the cloud saw while delete-user ran
    return deleteStatus === 200 ? json({ ok: true }) : json({ error: 'boom' }, deleteStatus);
  };
  const del = loadFn('lib/accountActions.js', 'export async function requestAccountDeletion(', 'requestAccountDeletion', {
    supabase, fetch, process: { env: { EXPO_PUBLIC_SUPABASE_URL: URL_ } },
    pauseSyncForDeletion: m.pauseSyncForDeletion, resumeSyncAfterDeletion: m.resumeSyncAfterDeletion, deletionRequestSettled: m.deletionRequestSettled,
    waitForSyncIdle: async () => {},
  });
  return { del, m, counts, posts, drain, during: () => pushesDuringDelete };
}

test('CS-24 (Gate B 1): a 401 on delete + a successful refresh never starts a push before teardown', async () => {
  const r = rig();
  const out = await r.del();
  assert.deepEqual(out, { ok: true, appleManualRevokeNeeded: false });
  assert.deepEqual(r.posts, ['Bearer old', 'Bearer new']);
  await r.drain();
  assert.equal(r.during(), 0, 'no push while delete-user ran');
  r.m.requestSync(); // anything else asking (a resume, a data change) before the teardown
  assert.equal(r.counts.pushes, 0, 'still paused until teardown');
  r.m.stopSyncEngine(); // finishAccountDeletion
  r.m.requestSync();
  assert.equal(r.counts.pushes, 0);
});

test('CS-24: a deletion that fails resumes the sync (and offline too)', async () => {
  const r = rig({ deleteStatus: 500 });
  await assert.rejects(r.del(), /boom/);
  assert.equal(r.during(), 0);
  assert.ok(r.counts.pushes >= 1, 'sync resumed after the failure');
  const before = r.counts.pushes;
  r.m.requestSync();
  assert.equal(r.counts.pushes, before + 1, 'and keeps working');
  const o = rig({ refreshOk: false });
  assert.deepEqual(await o.del(), { offline: true });
  o.m.requestSync();
  assert.ok(o.counts.pushes >= 1, 'offline: resumed');
});

test('CS-24: a new engine start (the next sign-in) is never left paused', () => {
  const { m, counts } = syncEngine(() => () => {});
  m.startSyncEngine();
  m.pauseSyncForDeletion();
  m.deletionRequestSettled(); // the server deleted the account (test build 3 item 4: a start while it is out keeps the pause)
  m.stopSyncEngine();
  m.startSyncEngine();
  m.requestSync();
  assert.equal(counts.pushes, 1);
});

test('CS-25 (Gate B 2): offline delete — the refresh brought the same token (the stored stand-in) → { offline: true }, one POST', async () => {
  const r = rig({ sameToken: true });
  assert.deepEqual(await r.del(), { offline: true });
  assert.deepEqual(r.posts, ['Bearer old'], 'no retry with the same token');
});

test('CS-26 (Gate B 3): NetInfo → offline mapping', () => {
  assert.equal(netInfoOffline({ isConnected: true, isInternetReachable: true }), false);
  assert.equal(netInfoOffline({ isConnected: true, isInternetReachable: null }), false, 'not yet measured counts as online (as lib/sync)');
  assert.equal(netInfoOffline({ isConnected: true, isInternetReachable: false }), true, 'Wi-Fi without internet');
  assert.equal(netInfoOffline({ isConnected: false, isInternetReachable: null }), true, 'airplane mode');
  assert.equal(netInfoOffline(null), true, 'no state');
  assert.match(read('lib/supabase.js'), /isOffline: async \(\) => netInfoOffline\(await NetInfo\.fetch\(\)\)/);
  assert.match(read('lib/authFetch.js'), /isInternetReachable null \(not measured yet\) counts as online/);
});
