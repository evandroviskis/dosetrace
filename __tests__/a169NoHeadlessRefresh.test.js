'use strict';
// A-169 review (blocker, Gate B, 2026-10-26): lib/supabase registered an onAuthStateChange listener
// at module load. In @supabase/auth-js every registration emits INITIAL_SESSION through
// _useSession → __loadSession, which REFRESHES an expired stored token even with autoRefreshToken
// off. lib/supabase is imported at module load by index.js → lib/backgroundTasks (and
// lib/notificationActions), so every Android headless start (A-107 nightly refresh, A-110 wake-up,
// a notification button from a killed app) rotated the refresh token — what DV-184 / INV-06 forbid
// (__tests__/headlessAuthRefresh.test.js). Now the session user the first frame needs is written by
// App.js's own synchronous listener (noteSessionUser), which only exists while the app is open.
// Found while fixing it: createClient registers supabase-js's OWN listener too (the realtime token
// follower), with the same INITIAL_SESSION refresh — already on b7fc123, before A-169. Its
// INITIAL_SESSION (which it ignores) is skipped in lib/supabase.
//
// These tests load the REAL lib/supabase.js (real supabase-js + GoTrueClient 2.101.1, real
// lib/authFetch, lib/deviceFetch, lib/signInWork) under node with only the native modules faked,
// and a server that answers every request with invalid_grant.
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

test('A-169 / DV-184: importing the app supabase client with an expired stored session makes ZERO server calls', async () => {
  await withServer(async (calls) => {
    const { exports, mem, KEY } = loadAppSupabase({ expired: true });
    assert.equal(exports.supabase.auth.storageKey, KEY, 'the stored session is the one the client reads');
    await exports.supabase.auth.initializePromise;
    await settle();
    assert.deepEqual(calls, [], 'a headless start never calls the auth server');
    // Second review 2026-10-26: the skip relies on auth-js internals; it reports whether it is in place,
    // so an auth-js bump that renames them fails here (CI), never crashes every launch.
    assert.equal(exports.headlessInitialSkip, true, 'the INITIAL_SESSION skip is installed');
    assert.ok(mem[KEY], 'and the stored session is kept for the next foreground open');
    // supabase-js's own listener is still registered: its later events (realtime token) still arrive.
    assert.equal(exports.supabase.auth.stateChangeEmitters.size, 1);
    // The first-frame cache is a plain setter now — nothing about it touches the client.
    assert.equal(typeof exports.noteSessionUser, 'function');
    assert.equal(exports.peekCachedUser(), null, 'nothing known until App.js says so');
    exports.noteSessionUser({ id: 'u1' });
    assert.deepEqual(exports.peekCachedUser(), { id: 'u1' });
    exports.noteSessionUser(null);
    assert.equal(exports.peekCachedUser(), null, 'a sign-out clears it');
    exports.noteSessionUser(undefined);
    assert.equal(exports.peekCachedUser(), null);
    await settle(50);
    assert.deepEqual(calls, []);
  });
});

test('A-169: the open app\'s own listener (App.js) still gets INITIAL_SESSION with the stored user, no call', async () => {
  await withServer(async (calls) => {
    const { exports } = loadAppSupabase({ expired: false });
    const events = [];
    exports.supabase.auth.onAuthStateChange((e, s) => { events.push(e + ':' + (s && s.user ? s.user.id : 'null')); });
    await exports.supabase.auth.initializePromise;
    await settle();
    // (auth-js's own SIGNED_IN from initialize may come first, as it always did.)
    assert.equal(events.filter((e) => e === 'INITIAL_SESSION:u1').length, 1, events.join());
    assert.deepEqual(events.filter((e) => !/:u1$/.test(e)), [], 'never a null session');
    assert.deepEqual(calls, []);
  });
});

test('A-169: in the open app an expired session is refreshed exactly as before (App.js listener, one request)', async () => {
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

// Every file that can run headless (lib/, components/, screens/) is free of auth listeners; the one
// listener is App.js's, inside the root component, synchronous.
function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(rel));
    else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

test('A-169 / DV-184: onAuthStateChange is registered only in App.js', () => {
  const offenders = [];
  for (const dir of ['lib', 'components', 'screens']) {
    for (const f of jsFiles(dir)) if (/\.onAuthStateChange\s*\(/.test(stripComments(read(f)))) offenders.push(f);
  }
  assert.deepEqual(offenders, [], 'no auth listener outside App.js');
  const app = stripComments(read('App.js'));
  assert.equal((app.match(/\.onAuthStateChange\s*\(/g) || []).length, 1, 'exactly one, in App.js');
});

test('A-169: App.js feeds the first-frame cache from its synchronous listener and the cold-start read', () => {
  const app = read('App.js');
  assert.match(app, /import \{[^}]*\bnoteSessionUser\b[^}]*\} from '\.\/lib\/supabase';/, 'App.js imports the setter');
  const i = app.indexOf('supabase.auth.onAuthStateChange((_event, session) => {');
  assert.ok(i > 0, 'the listener');
  const head = app.slice(i, i + 400);
  assert.match(head, /setSession\(session\);[^\n]*\n\s*noteSessionUser\(\(session && session\.user\) \|\| null\);/, 'next to setSession, a plain write');
  const j = app.indexOf('supabase.auth.getSession().then(async ({ data: { session: firstSession } })');
  assert.ok(j > 0, 'the cold-start read');
  assert.match(app.slice(j, j + 900), /setSession\(session\);\s*\n\s*noteSessionUser\(\(session && session\.user\) \|\| null\);/, 'after the cold-start read');
  const s = read('lib/supabase.js');
  assert.match(s, /export function noteSessionUser\(u\) \{ knownUser_ = u \|\| null; \}/);
  assert.match(s, /export function peekCachedUser\(\) \{ return knownUser_; \}/);
});
