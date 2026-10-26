'use strict';
// DV-184 / INV-06 (second review 2026-10-26; founder "aprovo a correção na 1.3.1"): createClient
// registers supabase-js's OWN auth listener (the realtime token follower), and auth-js answers every
// registration with INITIAL_SESSION through __loadSession, which REFRESHES an expired stored token
// even with autoRefreshToken off. lib/supabase loads on every Android headless start (index.js ->
// lib/backgroundTasks, lib/notificationActions), so 1.3.0 / 1.3.1 rotated the refresh token headless
// (surprise sign-out when the job is killed before the new token is saved). __tests__/headlessAuthRefresh
// used a bare GoTrueClient and could not see it. These tests load the REAL lib/supabase.js (real
// supabase-js + auth-js 2.101.1, real lib/authFetch) with only the native modules faked.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function loadAppSupabase({ expired = true } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const KEY = 'sb-x-auth-token';
  const mem = { [KEY]: JSON.stringify({ access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: expired ? now - 600 : now + 3000, user: { id: 'u1', aud: 'authenticated', email: 'sam@example.com' } }) };
  const SecureStoreAdapter = {
    getItem: async (k) => (k in mem ? mem[k] : null),
    setItem: async (k, v) => { mem[k] = v; },
    removeItem: async (k) => { delete mem[k]; },
  };
  const fakes = {
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'background', addEventListener: () => ({ remove() {} }) } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } },
    '@react-native-community/netinfo': { __esModule: true, default: { fetch: async () => ({ isConnected: true, isInternetReachable: true }) } },
    'expo-auth-session': { makeRedirectUri: () => 'dosetrace://x' },
    'expo-web-browser': { maybeCompleteAuthSession: () => {} },
    './secureStore': { SecureStoreAdapter },
    './deviceId': { deviceHeaders: async () => ({}) },
  };
  const file = path.join(ROOT, 'lib', 'supabase.js');
  const { code } = babel.transformSync(read('lib/supabase.js'), {
    filename: file, babelrc: false, configFile: false,
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const realRequire = Module.createRequire(file);
  m.require = (id) => (id in fakes ? fakes[id] : realRequire(id));
  m._compile(code, file);
  return { exports: m.exports, mem, KEY };
}

// The auth server: every request is recorded and answered "invalid_grant" (a token already used).
async function withServer(run) {
  const env = { url: process.env.EXPO_PUBLIC_SUPABASE_URL, key: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY };
  const realFetch = globalThis.fetch;
  const origError = console.error;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  };
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  console.error = () => {}; // auth-js logs a refused refresh; the assertions are what matter
  try { await run(calls); } finally {
    globalThis.fetch = realFetch;
    console.error = origError;
    if (env.url === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL; else process.env.EXPO_PUBLIC_SUPABASE_URL = env.url;
    if (env.key === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY; else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = env.key;
  }
}
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms)); // any INITIAL_SESSION runs in this window

test('DV-184: importing the app supabase client with an expired stored session makes ZERO server calls', async () => {
  await withServer(async (calls) => {
    const { exports, mem, KEY } = loadAppSupabase({ expired: true });
    await exports.supabase.auth.initializePromise;
    await settle();
    assert.deepEqual(calls, [], 'a headless start never calls the auth server');
    assert.ok(mem[KEY], 'and the stored session is kept for the next foreground open');
    assert.equal(exports.headlessInitialSkip, true, 'the INITIAL_SESSION skip is installed (an auth-js bump that renames the internals fails here)');
    assert.equal(exports.supabase.auth.stateChangeEmitters.size, 1, 'supabase-js’s own listener stays registered');
  });
});

test('DV-184: the open app’s listener (App.js) still gets INITIAL_SESSION with the stored user, no call', async () => {
  await withServer(async (calls) => {
    const { exports } = loadAppSupabase({ expired: false });
    const events = [];
    exports.supabase.auth.onAuthStateChange((e, s) => { events.push(e + ':' + (s && s.user ? s.user.id : 'null')); });
    await exports.supabase.auth.initializePromise;
    await settle();
    assert.equal(events.filter((e) => e === 'INITIAL_SESSION:u1').length, 1, events.join());
    assert.deepEqual(events.filter((e) => !/:u1$/.test(e)), [], 'never a null session');
    assert.deepEqual(calls, []);
  });
});

test('DV-184: in the open app an expired session is refreshed exactly as before (App.js listener, one request)', async () => {
  await withServer(async (calls) => {
    const { exports } = loadAppSupabase({ expired: true });
    await exports.supabase.auth.initializePromise;
    await settle(100);
    assert.deepEqual(calls, [], 'nothing at import');
    const events = [];
    exports.supabase.auth.onAuthStateChange((e) => { events.push(e); });
    await settle();
    assert.equal(calls.filter((u) => /grant_type=refresh_token/.test(u)).length, 1, 'the foreground listener asks once');
    assert.ok(events.includes('INITIAL_SESSION'));
  });
});
