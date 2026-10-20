'use strict';
// A-154 (Gate B review of A-144, 2026-10-20): lib/supabase.js exchangeAuthCodeFromUrl takes the
// session of an emailed link that carries tokens (the fragment shape, not the PKCE code) with a
// plain supabase.auth.setSession. On a phone 1 h or more ahead auth-js finds the token expired by
// the device clock, refreshes it and emits TOKEN_REFRESHED, not SIGNED_IN — so App.js's sign-in work
// (the intro answers written to the new account, purchases, reminders, push token) never ran.
// The rule: that shape takes the session through lib/signInWork setSessionSignedIn (A-144): the work
// runs once — from App.js when SIGNED_IN fires, from the helper when it does not.
// Runs the REAL exchangeAuthCodeFromUrl over the real GoTrueClient (auth-js 2.101.1), a fake
// Supabase on the real clock and the device clock (Date.now) moved.
const test = require('node:test');
const assert = require('node:assert/strict');
const { GoTrueClient } = require('@supabase/auth-js');
const { createAuthFetch } = require('../lib/authFetch');
const SW = require('../lib/signInWork');
const { loadFn, read } = require('./helpers/extractFn');

const H = 3600 * 1000;
const realNow = Date.now.bind(Date);
const KEY = 'sb-x-auth-token';
test.afterEach(() => { Date.now = realNow; SW.setSignInHandler(null); });

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (sub, n) => `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub, n, exp: Math.round(realNow() / 1000) + 3600, aud: 'authenticated' })}.sig`;
const user = { id: 'u9', aud: 'authenticated', email: 'new@x.io' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeServer() {
  const s = { n: 1 };
  s.fetch = async (input) => {
    const u = String(input && input.url ? input.url : input);
    if (/\/token\?grant_type=refresh_token/.test(u)) {
      s.n += 1;
      return json({ access_token: jwt('u9', s.n), refresh_token: `rt${s.n}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.round(realNow() / 1000) + 3600, user });
    }
    if (/\/auth\/v1\/user/.test(u)) return json(user);
    return json({}, 404);
  };
  return s;
}

// The main client wired as App.js wires it (SIGNED_IN -> onSignedIn, counted first).
function app() {
  const server = fakeServer();
  const mem = {};
  const st = { getItem: async (k) => mem[k] ?? null, setItem: async (k, v) => { mem[k] = v; }, removeItem: async (k) => { delete mem[k]; } };
  const af = createAuthFetch({ fetch: server.fetch, readStoredSession: () => st.getItem(KEY) });
  const c = new GoTrueClient({ url: 'https://x.supabase.co/auth/v1', storageKey: KEY, storage: st, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, fetch: af.fetch });
  const runs = [];
  const onSignedIn = (session) => { SW.noteSignedIn(); runs.push(session.user.id); };
  SW.setSignInHandler(onSignedIn);
  c.onAuthStateChange((e, session) => { if (e === 'SIGNED_IN' && session?.user?.id) onSignedIn(session); });
  const exchange = loadFn('lib/supabase.js', 'export async function exchangeAuthCodeFromUrl(', 'exchangeAuthCodeFromUrl', {
    supabase: { auth: c },
    setSessionSignedIn: SW.setSessionSignedIn,
  });
  return { exchange, runs };
}
const link = () => `dosetrace://confirm-email#access_token=${jwt('u9', 1)}&refresh_token=rt1&type=signup`;

test('A-154: a confirm link with tokens on a phone 19 h ahead runs the sign-in work once', async () => {
  const { exchange, runs } = app();
  Date.now = () => realNow() + 19 * H;
  const r = await exchange(link());
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(runs, ['u9']);
});

test('A-154: with the clock right it still runs once (SIGNED_IN, nothing added)', async () => {
  const { exchange, runs } = app();
  const r = await exchange(link());
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(runs, ['u9']);
});

test('A-154: the token shape goes through the helper; no plain setSession left in lib/supabase.js', () => {
  const src = read('lib/supabase.js');
  assert.match(src, /await setSessionSignedIn\(supabase\.auth, \{ access_token, refresh_token \}\)/);
  assert.doesNotMatch(src, /supabase\.auth\.setSession\(/);
});
