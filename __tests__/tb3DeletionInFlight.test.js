'use strict';
// DT Council, test build 3 (2026-10-17), item 4: App.js calls startSyncEngine on SIGNED_IN, and
// startSyncEngine cleared the deletion pause — a SIGNED_IN while delete-user was in flight would let
// a push run during the deletion. A separate in-flight flag, set with the pause and cleared only when
// requestAccountDeletion settles, keeps the pause through any start meanwhile.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sliceBlock, loadFn, read } = require('./helpers/extractFn');

function syncEngine() {
  const src = read('lib/sync.js');
  const fns = ['export function startSyncEngine(', 'export function stopSyncEngine(', 'export function requestSync(',
    'async function syncPass(', 'export function pauseSyncForDeletion(', 'export function resumeSyncAfterDeletion(', 'export function deletionRequestSettled('];
  const body = `let _isOnline = true; let _knownOnline = null; let _syncTimer = null; let _unsubNetInfo = null; let _unsubRecovered = null; let _deletionPaused = false; let _deletionInFlight = false;
${fns.map((h) => (src.includes(h) ? sliceBlock(src, h).replace(/^export\s+/, '') : `function ${h.match(/function (\w+)/)[1]}() {}`)).join('\n')}
function doSync() { return syncPass(); }
return { startSyncEngine, stopSyncEngine, requestSync, pauseSyncForDeletion, resumeSyncAfterDeletion, deletionRequestSettled };`;
  const counts = { pushes: 0 };
  const deps = {
    NetInfo: { addEventListener: () => () => {} }, onSessionRecovered: () => () => {}, notifyListeners: () => {}, sessionNetworkBack: () => {},
    pushPendingChanges: async () => { counts.pushes += 1; }, pullCloudChanges: async () => {},
    setTimeout: (fn) => { fn(); return 1; }, clearTimeout: () => {}, console: { warn: () => {} },
  };
  // eslint-disable-next-line no-new-func
  return { m: new Function(...Object.keys(deps), body)(...Object.values(deps)), counts };
}

test('TB3-4: a SIGNED_IN start while delete-user is in flight keeps sync paused', () => {
  const { m, counts } = syncEngine();
  m.startSyncEngine();
  m.pauseSyncForDeletion(); // requestAccountDeletion, before the POST
  m.startSyncEngine(); // App.js SIGNED_IN (e.g. a re-auth) during the request
  m.requestSync();
  assert.equal(counts.pushes, 0, 'no push during the deletion');
  m.deletionRequestSettled(); // the server answered: deleted
  m.requestSync();
  assert.equal(counts.pushes, 0, 'still paused until the teardown');
  m.stopSyncEngine(); // finishAccountDeletion
  m.startSyncEngine(); // the next sign-in (another account)
  m.requestSync();
  assert.equal(counts.pushes, 1, 'a start after the request settled is unpaused');
});

test('TB3-4: a failed deletion clears both flags (a later start syncs at once)', () => {
  const { m, counts } = syncEngine();
  m.startSyncEngine();
  m.pauseSyncForDeletion();
  m.resumeSyncAfterDeletion();
  assert.equal(counts.pushes, 1, 'resumed');
  m.startSyncEngine();
  m.requestSync();
  assert.equal(counts.pushes, 2);
});

test('TB3-4: requestAccountDeletion marks the request settled once the server deleted the account', async () => {
  const calls = [];
  const del = loadFn('lib/accountActions.js', 'export async function requestAccountDeletion(', 'requestAccountDeletion', {
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
    fetch: async () => { calls.push('post'); return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }); },
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' } },
    pauseSyncForDeletion: () => calls.push('pause'), resumeSyncAfterDeletion: () => calls.push('resume'),
    deletionRequestSettled: () => calls.push('settled'), waitForSyncIdle: async () => {},
  });
  await del();
  assert.deepEqual(calls, ['pause', 'post', 'settled']);
});
