'use strict';
// Runs App.js's real routeTap and its cold-start launch block (getLastNotificationResponseAsync)
// under plain node with fakes for AsyncStorage, the navigation flush and expo-notifications, so a
// test sees exactly where a tap lands (A-168, A-171). Cut out of App.js by sliceBlock: the test
// runs the shipped code, not a copy.
const { sliceBlock, read } = require('./extractFn');
const NP = require('../../lib/notificationPlan');

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    store,
    getItem: async (k) => (k in store ? store[k] : null),
    setItem: async (k, v) => { store[k] = v; },
  };
}

// One app process: a routeTap with its own in-memory set, sharing `storage` (the device's disk)
// across processes when the test passes the same one.
function makeApp({ storage = fakeStorage() } = {}) {
  const app = read('App.js');
  const at = app.indexOf('const routeTap = useCallback(');
  if (at < 0) throw new Error('routeTap not found in App.js');
  const fnSrc = sliceBlock(app.slice(at), 'async (response');
  const navs = [];
  const pendingNavRef = { current: null };
  const deps = {
    notifTapTarget: NP.notifTapTarget,
    responseKey: NP.responseKey,
    routedRef: { current: new Set() },
    AsyncStorage: storage,
    isUpdateTap: () => false,
    requestForcedInvite: () => {},
    pendingNavRef,
    flushPendingNav: () => { if (pendingNavRef.current) { navs.push(pendingNavRef.current); pendingNavRef.current = null; } },
  };
  const names = Object.keys(deps);
  // eslint-disable-next-line no-new-func
  const routeTap = new Function(...names, `return (${fnSrc});`)(...names.map((n) => deps[n]));

  // The listener path: App.js's own call inside addNotificationResponseReceivedListener.
  const lAt = app.indexOf('notifResponseSub = N.addNotificationResponseReceivedListener(response =>');
  const listenerSrc = sliceBlock(app.slice(lAt), 'response => {');
  // eslint-disable-next-line no-new-func
  const listener = new Function('routeTap', `return (${listenerSrc});`)(routeTap);

  // The launch path: App.js's own block that reads the tap that launched the app.
  const launchSrc = sliceBlock(app, 'if (N.getLastNotificationResponseAsync) {');
  const launch = async (last) => {
    let p = null;
    const N = { getLastNotificationResponseAsync: () => { p = Promise.resolve(last); return p; } };
    // eslint-disable-next-line no-new-func
    new Function('N', 'routeTap', launchSrc)(N, routeTap);
    await p;
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); // routeTap's awaits
  };
  const background = async (resp) => {
    listener(resp);
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  };
  return { navs, storage, routeTap, launch, background };
}

module.exports = { makeApp, fakeStorage };
