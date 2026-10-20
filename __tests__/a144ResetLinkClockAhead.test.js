'use strict';
// A-144 (Gate B review of A-137, 2026-10-17): after a password reset the app takes the link's
// session with supabase.auth.setSession (lib/recoveryLink.js saveRecoveryPassword). auth-js reads the
// access token's exp against the DEVICE clock: on a phone 1 h or more ahead the token looks expired,
// auth-js refreshes it and emits TOKEN_REFRESHED, not SIGNED_IN — and App.js runs its sign-in work
// (cross-account guard, import, purchases, reminders) only on SIGNED_IN. The rules:
//   1. the main session is taken through one helper (lib/signInWork setSessionSignedIn) that runs the
//      app's sign-in work itself when setSession signed in WITHOUT a SIGNED_IN event;
//   2. when SIGNED_IN does fire (a clock that is right), the helper does nothing more: the work runs
//      once, from App.js;
//   3. a failed setSession runs nothing;
//   4. App.js's SIGNED_IN branch and the helper run the same function (registered with
//      setSignInHandler), so the two paths can never drift.
// Real GoTrueClient from the installed @supabase/auth-js, a fake Supabase on the real clock, the
// device clock (Date.now) moved — as in clockSkewSession.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GoTrueClient } = require('@supabase/auth-js');
const { createAuthFetch } = require('../lib/authFetch');
const { setSignInHandler, setSessionSignedIn, noteSignedIn } = require('../lib/signInWork');

const H = 3600 * 1000;
const realNow = Date.now.bind(Date);
const KEY = 'sb-x-auth-token';
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
test.afterEach(() => { Date.now = realNow; setSignInHandler(null); });

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
// A token as GoTrue issues it: exp in SERVER epoch seconds (the real clock).
const jwt = (sub, n) => `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub, n, exp: Math.round(realNow() / 1000) + 3600, aud: 'authenticated' })}.sig`;
const user = { id: 'u2', aud: 'authenticated', email: 'reset@x.io' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeServer(mode = 'ok') {
  const s = { refreshPosts: 0, n: 1 };
  s.fetch = async (input) => {
    const u = String(input && input.url ? input.url : input);
    if (/\/token\?grant_type=refresh_token/.test(u)) {
      s.refreshPosts += 1;
      if (mode === 'invalid_grant') return json({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' }, 400);
      s.n += 1;
      return json({ access_token: jwt('u2', s.n), refresh_token: `rt${s.n}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.round(realNow() / 1000) + 3600, user });
    }
    if (/\/auth\/v1\/user/.test(u)) return json(user);
    return json({}, 404);
  };
  return s;
}

// The main client wired as App.js wires it: SIGNED_IN runs onSignedIn, which first notes the sign-in
// (lib/signInWork noteSignedIn); the same onSignedIn is the registered handler. runs = every run of it.
function mainClient(server, seed) {
  const mem = { ...(seed || {}) };
  const st = { getItem: async (k) => mem[k] ?? null, setItem: async (k, v) => { mem[k] = v; }, removeItem: async (k) => { delete mem[k]; } };
  const af = createAuthFetch({ fetch: server.fetch, readStoredSession: () => st.getItem(KEY) });
  const c = new GoTrueClient({ url: 'https://x.supabase.co/auth/v1', storageKey: KEY, storage: st, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, fetch: af.fetch });
  const events = [];
  const runs = [];
  const onSignedIn = (session) => { noteSignedIn(); runs.push(session.user.id); };
  setSignInHandler(onSignedIn);
  c.onAuthStateChange((e, session) => { events.push(e); if (e === 'SIGNED_IN' && session?.user?.id) onSignedIn(session); });
  return { c, events, runs, onSignedIn };
}
const tokens = () => ({ access_token: jwt('u2', 1), refresh_token: 'rt1' });

test('A-144 (cause): on a phone 19 h ahead, setSession signs in with TOKEN_REFRESHED and no SIGNED_IN', async () => {
  const server = fakeServer();
  const { c, events } = mainClient(server);
  setSignInHandler(null);
  Date.now = () => realNow() + 19 * H;
  const r = await c.setSession(tokens());
  assert.equal(r.error, null);
  assert.equal(r.data.session.user.id, 'u2', 'the reset account is signed in');
  assert.ok(events.includes('TOKEN_REFRESHED'));
  assert.ok(!events.includes('SIGNED_IN'), 'so App.js never ran its sign-in work');
});

test('A-144 (1): clock 19 h ahead -> the helper runs the sign-in work once, for the reset account', async () => {
  const server = fakeServer();
  const { c, events, runs } = mainClient(server);
  Date.now = () => realNow() + 19 * H;
  const r = await setSessionSignedIn(c, tokens());
  assert.equal(r.error, null);
  assert.ok(!events.includes('SIGNED_IN'));
  assert.deepEqual(runs, ['u2']);
  assert.equal(server.refreshPosts, 1, 'one refresh: the helper adds no listener of its own (Gate B review finding 2)');
});

test('A-144 (2): clock right -> SIGNED_IN fires (App.js runs the work); the helper adds nothing', async () => {
  const server = fakeServer();
  const { c, events, runs } = mainClient(server);
  const r = await setSessionSignedIn(c, tokens());
  assert.equal(r.error, null);
  assert.ok(events.includes('SIGNED_IN'));
  assert.deepEqual(runs, ['u2'], 'once, from the SIGNED_IN branch; no second run');
  assert.equal(server.refreshPosts, 0);
});

test('A-144 (3): a failed setSession runs nothing', async () => {
  const server = fakeServer('invalid_grant');
  const { c, runs } = mainClient(server);
  Date.now = () => realNow() + 19 * H;
  const r = await setSessionSignedIn(c, tokens());
  assert.ok(r.error);
  assert.deepEqual(runs, []);
});

test('A-144 (5): the phone already signed in to the same account, clock 19 h ahead -> the work runs once', async () => {
  const server = fakeServer();
  const stored = { access_token: jwt('u2', 0), refresh_token: 'rt0', token_type: 'bearer', expires_in: 3600, expires_at: Math.round(realNow() / 1000) + 3600, user };
  const { c, runs } = mainClient(server, { [KEY]: JSON.stringify(stored) });
  Date.now = () => realNow() + 19 * H;
  const r = await setSessionSignedIn(c, tokens());
  assert.equal(r.error, null);
  assert.deepEqual(runs, ['u2']);
});

test('A-144 (6): an error in the sign-in work never turns a saved reset into a failure', async () => {
  const server = fakeServer();
  const { c } = mainClient(server);
  setSignInHandler(() => { throw new Error('boom'); });
  Date.now = () => realNow() + 19 * H;
  const r = await setSessionSignedIn(c, tokens());
  assert.equal(r.error, null);
  assert.equal(r.data.session.user.id, 'u2');
});

test('A-144 (4): the reset takes the session through the helper; App.js registers the SIGNED_IN work as the handler', () => {
  const rl = read('lib/recoveryLink.js');
  assert.match(rl, /await setSessionSignedIn\(supabase\.auth, \{ access_token: s\.access_token, refresh_token: s\.refresh_token \}\)/);
  assert.doesNotMatch(rl, /supabase\.auth\.setSession\(/, 'no main-client setSession around the helper');
  const app = read('App.js');
  assert.match(app, /if \(_event === 'SIGNED_IN' && session\?\.user\?\.id\) onSignedIn\(session\);/);
  assert.match(app, /setSignInHandler\(onSignedIn\);/);
  assert.match(app, /const onSignedIn = \(session\) => \{\n\s+noteSignedIn\(\);/, 'the run is noted first, so the helper never runs it twice');
  assert.match(app, /setSignInHandler\(null\);/, 'cleared on unmount');
});
