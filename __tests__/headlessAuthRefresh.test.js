'use strict';
// Council 3 backend #1 (2026-10-07): with autoRefreshToken on, auth-js refreshes an expired session
// as soon as the client is created (initialize → _recoverAndRefresh) — also when Android starts the
// app HEADLESS for the background refresh (A-107), the daily wake-up (A-110) or a Mark-as-taken.
// A refresh cut off mid-rotation, or any non-retryable answer, removes the session: a surprise
// sign-out. Now the client never refreshes on its own; the app refreshes only in the foreground
// (startAutoRefresh while active, stopped in the background; getSession() still refreshes when the
// app itself asks). Real GoTrueClient.
const test = require('node:test');
const assert = require('node:assert/strict');
const { GoTrueClient } = require('@supabase/auth-js');
const { read } = require('./helpers/extractFn');

function expiredClient(autoRefreshToken) {
  const now = Math.floor(Date.now() / 1000);
  const mem = { k: JSON.stringify({ access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: now - 600, user: { id: 'u1', aud: 'authenticated' } }) };
  const storage = { getItem: async (k) => mem[k] ?? null, setItem: async (k, v) => { mem[k] = v; }, removeItem: async (k) => { delete mem[k]; } };
  const calls = [];
  // The server answers the refresh with a non-retryable error (e.g. a token already used).
  const fetch = async (url) => { calls.push(String(url)); return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); };
  const c = new GoTrueClient({ url: 'https://x.supabase.co/auth/v1', storageKey: 'k', storage, autoRefreshToken, persistSession: true, detectSessionInUrl: false, fetch });
  return { c, mem, calls };
}

test('auth-js with autoRefreshToken ON refreshes at creation and drops the session on a bad answer (the risk)', async () => {
  const { c, mem, calls } = expiredClient(true);
  await c.initialize();
  await c.stopAutoRefresh();
  assert.ok(calls.some((u) => /token\?grant_type=refresh_token/.test(u)), 'it called the server headless');
  assert.equal(mem.k, undefined, 'and removed the session');
});

test('with autoRefreshToken OFF (the app) creation never calls the server and keeps the session', async () => {
  const { c, mem, calls } = expiredClient(false);
  await c.initialize();
  assert.equal(calls.length, 0);
  assert.ok(mem.k, 'session kept for the next foreground open');
});

test('the app client is created without auto refresh and refreshes only in the foreground', () => {
  const s = read('lib/supabase.js');
  assert.match(s, /autoRefreshToken: false,/);
  const a = read('App.js');
  assert.match(a, /supabase\.auth\.startAutoRefresh\(\)/);
  assert.match(a, /supabase\.auth\.stopAutoRefresh\(\)/);
  assert.match(a, /AppState\.currentState === 'active'\) supabase\.auth\.startAutoRefresh\(\)/, 'a cold start in the foreground starts it at once');
});
