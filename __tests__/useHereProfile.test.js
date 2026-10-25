'use strict';
// Gate B (wave 1): screen 4 "Use here" writes the stashed onboarding answers once the takeover
// succeeds. Scenario: B signs in while A is the active device, sits on the DV-242 sheet past the
// sign-in intent's 3 minutes, taps "Discard and continue"; the device step runs with explicit:false,
// lands on screen 4 and the profile write is refused (the answers stay on the phone). "Use here"
// then takes the account over — before the fix it never retried the write, and after a restart the
// answers were no longer fresh and were cleared unwritten (data the user typed, lost).
const test = require('node:test');
const assert = require('node:assert/strict');
const { sliceBlock, loadFn, read } = require('./helpers/extractFn');
const { makeDeviceCloud } = require('./helpers/syncHarness');
const { phone } = require('./helpers/devicePhone');
const { pendingProfilePatch } = require('../lib/pendingProfile');

const U = 'user-b';

// The real applyPendingProfile; updateUser goes through the device flow's profile guard exactly
// like lib/supabase's wrapper (refused → DT001, nothing written).
function stash(flow) {
  const s = { data: { display_name: 'Sam', primary_goal: 'fat_loss' }, cleared: 0, written: [] };
  const apply = loadFn('lib/onboardingStore.js', 'export async function applyPendingProfile(', 'applyPendingProfile', {
    loadOnboarding: async () => (s.data ? { ...s.data } : {}),
    clearOnboarding: async () => { s.cleared += 1; s.data = null; },
    fresh: true,
    pendingProfilePatch,
  });
  const supabase = { auth: {
    getUser: async () => ({ data: { user: { id: U, user_metadata: {} } } }),
    updateUser: async ({ data }) => ((await flow.metadataAllowed(U, { explicit: false }))
      ? (s.written.push(data), { data: {}, error: null })
      : { data: { user: null }, error: { code: 'DT001' } }),
  } };
  return { s, apply, supabase };
}

// The real screen-4 "Use here" handler of App.js, with its scope faked.
function loadUseHere(deps) {
  const block = sliceBlock(read('App.js'), 'onUseHere={() => {').replace(/^onUseHere=\{/, '');
  const names = Object.keys(deps);
  // eslint-disable-next-line no-new-func
  return new Function(...names, `return (${block});`)(...names.map((n) => deps[n]));
}

const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

async function screen4() {
  const cloud = makeDeviceCloud(); cloud.addUser(U);
  const A = phone(cloud, 'dev-A', U); await A.signIn(); // A is the active device
  const B = phone(cloud, 'dev-B', U, { session: '2026-10-16T09:00:00.000Z' });
  // The intent expired: the device step runs with explicit:false and lands on screen 4.
  assert.equal((await B.flow.gate(U, 'sync')).reason, 'ask', 'screen 4: the account is in use on A');
  return B;
}

function deps(B, st, held) {
  return {
    session: { user: { id: U } },
    setDeviceHeld: (v) => held.push(v),
    deviceFlow: () => B.flow,
    requestSync: () => {},
    syncAllNotifications: async () => {},
    registerPushToken: async () => {},
    reloadDevice: () => {},
    applyPendingProfile: st.apply,
    supabase: st.supabase,
  };
}

test('Use here: the refused intro answers are written once the takeover succeeds', async () => {
  const B = await screen4();
  const st = stash(B.flow);
  await st.apply(st.supabase); // the device step's write: refused on screen 4, kept on the phone
  assert.equal(st.s.written.length, 0);
  assert.equal(st.s.cleared, 0);
  const held = [];
  loadUseHere(deps(B, st, held))();
  await flush();
  assert.equal(st.s.written.length, 1, 'the answers reach this account after "Use here"');
  assert.equal(st.s.written[0].display_name, 'Sam');
  assert.equal(st.s.cleared, 1, 'cleared only after the write');
  assert.deepEqual(held, [false]);
});

test('Use here: a takeover settled at once (go) writes the answers too', async () => {
  const B = await screen4();
  const flow = { ...B.flow, useHere: async () => ({ go: true, reason: 'settled' }), metadataAllowed: async () => true };
  const st = stash(flow);
  const d = deps(B, st, []);
  d.deviceFlow = () => flow;
  loadUseHere(d)();
  await flush();
  assert.equal(st.s.written.length, 1);
  assert.equal(st.s.cleared, 1);
});

test('Use here: a takeover that did not go (offline) leaves the answers on the phone', async () => {
  const B = await screen4();
  const st = stash(B.flow);
  const flow = { ...B.flow, useHere: async () => ({ go: false, reason: 'network' }) };
  const d = deps(B, st, []);
  d.deviceFlow = () => flow;
  let applied = 0;
  d.applyPendingProfile = async (sb) => { applied += 1; return st.apply(sb); };
  loadUseHere(d)();
  await flush();
  assert.equal(applied, 0, 'no write attempt while screen 4 stays');
  assert.equal(st.s.cleared, 0, 'never dropped');
  assert.deepEqual(st.s.data, { display_name: 'Sam', primary_goal: 'fat_loss' });
});
