'use strict';
// A-119 DL-102 / OD-14 with the real auth-js 2.101.1: only a sign-in the person makes takes the
// account over. A session restored at start-up (auth-js may report it as SIGNED_IN), a token refresh
// and a re-auth never do; the sign-in work asks for the takeover once per sign-in. App.js reads the
// flag synchronously inside the work onAuthStateChange runs inline (never an await there).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GoTrueClient } = require('@supabase/auth-js');
const { createAuthFetch } = require('../lib/authFetch');
const X = require('../lib/explicitSignIn');

const realNow = Date.now.bind(Date);
const KEY = 'sb-x-auth-token';
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
test.afterEach(() => { Date.now = realNow; X.endExplicitSignIn(); });

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (sub, n, life = 3600) => `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub, n, exp: Math.round(realNow() / 1000) + life, aud: 'authenticated' })}.sig`;
const user = { id: 'u1', aud: 'authenticated', email: 'a@x.io' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function server() {
  let n = 1;
  return async (input) => {
    const u = String(input && input.url ? input.url : input);
    if (/grant_type=password/.test(u) || /grant_type=refresh_token/.test(u)) {
      n += 1;
      return json({ access_token: jwt('u1', n), refresh_token: `rt${n}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.round(realNow() / 1000) + 3600, user });
    }
    if (/\/auth\/v1\/user/.test(u)) return json(user);
    return json({}, 404);
  };
}
// The phone as App.js wires it: SIGNED_IN runs the sign-in work, which reads the flag first.
function phone(seed) {
  const mem = { ...(seed || {}) };
  const st = { getItem: async (k) => mem[k] ?? null, setItem: async (k, v) => { mem[k] = v; }, removeItem: async (k) => { delete mem[k]; } };
  const af = createAuthFetch({ fetch: server(), readStoredSession: () => st.getItem(KEY) });
  const c = new GoTrueClient({ url: 'https://x.supabase.co/auth/v1', storageKey: KEY, storage: st, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, fetch: af.fetch });
  const runs = [];
  c.onAuthStateChange((e, session) => { if (e === 'SIGNED_IN' && session?.user?.id) runs.push({ explicit: X.consumeExplicitSignIn() }); });
  return { c, runs };
}

test('OD-14: a session restored at start-up never takes over (even an expired one auth-js refreshes and reports)', async () => {
  const stored = { access_token: jwt('u1', 0, -10), refresh_token: 'rt0', token_type: 'bearer', expires_in: 3600, expires_at: Math.round(realNow() / 1000) - 10, user };
  const { c, runs } = phone({ [KEY]: JSON.stringify(stored) });
  await c.initialize();
  await c.getSession();
  assert.ok(runs.every((r) => r.explicit === false), JSON.stringify(runs));
});

test('DL-102: a sign-in the person makes takes over once; a refresh after it does not', async () => {
  const { c, runs } = phone();
  await c.initialize();
  X.beginExplicitSignIn();
  try {
    const r = await c.signInWithPassword({ email: 'a@x.io', password: 'pw' });
    assert.equal(r.error, null);
  } finally { X.endExplicitSignIn(); }
  await c.refreshSession();
  assert.deepEqual(runs, [{ explicit: true }]);
  assert.equal(X.isExplicitSignIn(), false);
});

test('the flag is read once per sign-in and expires; a second SIGNED_IN of the same sign-in is not a second takeover', () => {
  X.beginExplicitSignIn();
  assert.equal(X.consumeExplicitSignIn(), true);
  assert.equal(X.consumeExplicitSignIn(), false);
  assert.equal(X.isExplicitSignIn(), true, 'still settling: the Apple name may be written');
  X.endExplicitSignIn();
  X.beginExplicitSignIn();
  Date.now = () => realNow() + X.TTL_MS + 1000;
  assert.equal(X.consumeExplicitSignIn(), false, 'an abandoned sign-in expires');
});

test('wired: every sign-in the person makes arms the flag; App reads it synchronously at the top of the sign-in work', () => {
  const auth = read('screens/AuthScreen.js');
  assert.match(auth, /async function social\(fn\) \{[\s\S]{0,1400}beginExplicitSignIn\(\);[\s\S]{0,400}await fn\(\)[\s\S]{0,700}finally \{[\s\S]{0,80}endExplicitSignIn\(\);/);
  assert.match(auth, /async function doAuth\(\) \{[\s\S]{0,400}beginExplicitSignIn\(\);[\s\S]*?signInWithPassword[\s\S]*?signUp\(/);
  assert.match(auth, /async function handleAuth\(\) \{[\s\S]{0,200}finally \{ endExplicitSignIn\(\);/);
  assert.match(read('lib/recoveryLink.js'), /if \(!\(await mainHasSession\(\)\)\) beginExplicitSignIn\(\);[\s\S]{0,700}setSessionSignedIn\(supabase\.auth/);
  const app = read('App.js');
  assert.match(app, /const onSignedIn = \(session\) => \{\n\s+noteSignedIn\(\);[^\n]*\n\s+const explicit = consumeExplicitSignIn\(\);/);
  assert.match(app, /beginExplicitSignIn\(\);\s*const \{ error \} = await supabase\.auth\.exchangeCodeForSession\(p\.code\)/, 'the Android Apple return after a kill');
  // onAuthStateChange stays synchronous.
  const cb = app.slice(app.indexOf('supabase.auth.onAuthStateChange('), app.indexOf('// Sign in with Apple: if the user revokes'));
  assert.doesNotMatch(cb, /await |\.then\(|deviceFlow|supabase\.(from|rpc)/);
});
