'use strict';
// The Supabase client's fetch (A-137 + A-140, docs/specs/clock-skew-session-plan.md; tests:
// __tests__/clockSkewSession.test.js with the real auth-js 2.101.1 — pinned in package.json).
// Pure: the base fetch, the clocks, the stored-session reader and the timer are injected.
//
// (A) Expiry on the DEVICE clock. GoTrue sends expires_at in SERVER epoch seconds and auth-js
//     compares it with the device clock, so a phone more than ~1 h ahead sees every new token as
//     already expired and refreshes on every getSession() (the A-137 storm). For a successful auth
//     answer carrying a session, expires_at is set to device now + expires_in — what auth-js does
//     itself when the field is absent. The server still checks the token against its own clock.
// (B) Storm breaker. At most 3 refresh requests per 60 s reach the network; for 60 s after a 429
//     none do. A refresh that is held back, or that fails on the network (offline: A-140) or with a
//     429 / 5xx, is answered with the session already stored on this phone (same tokens, a short
//     life) — never a sign-out. Only when the refresh token is the stored one; otherwise the real
//     answer passes through. A 4xx (400 invalid_grant: revoked, deleted, signed out elsewhere)
//     always passes through, so revocation signs out exactly as before.
// (C) Recovery. A database "JWT expired" (clock moved back after a session was saved) or the
//     network coming back after a stand-in asks for ONE deferred refresh: never inside a request or
//     the auth lock, only while the app is in the foreground, at most once per 60 s.

const BUDGET = 3;
const WINDOW_MS = 60 * 1000;
const HOLD_MS = 60 * 1000;
const RECOVER_GAP_MS = 60 * 1000;
// Life of a stand-in session: long enough that the 30 s auto-refresh tick (refreshes under 120 s
// left) does not ask again at once, short enough that a real refresh follows within minutes.
const STAND_IN_SECONDS = 300;
// auth-js EXPIRY_MARGIN_MS: a session with less than this left is refreshed by getSession().
const EXPIRY_MARGIN_MS = 90 * 1000;

function urlOf(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url;
  return String(input);
}
function methodOf(input, init) {
  return String((init && init.method) || (input && typeof input === 'object' && input.method) || 'GET').toUpperCase();
}
const isAuthUrl = (u) => /\/auth\/v1\//.test(u);
const isRefreshUrl = (u) => /\/auth\/v1\/token\?(?:[^#]*&)?grant_type=refresh_token(?:&|#|$)/.test(u);
// Only the database's own "JWT expired" (PostgREST PGRST303, older PGRST301 with that message) —
// not an "Invalid JWT" from a function or a permission error, which a refresh would not cure.
const isDataUrl = (u) => /\/rest\/v1\//.test(u);
const looksJwtExpired = (text) => /jwt expired|PGRST303/i.test(String(text || ''));

function bodyRefreshToken(init) {
  try {
    const b = init && init.body;
    if (typeof b !== 'string') return null;
    const j = JSON.parse(b);
    return j && typeof j.refresh_token === 'string' ? j.refresh_token : null;
  } catch { return null; }
}

function parseStored(raw) {
  try {
    const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return s && typeof s === 'object' ? s : null;
  } catch { return null; }
}

// How the app should recover the session now: 'none' (nothing stored), 'get' (locally expired:
// getSession() refreshes it once), 'refresh' (locally valid but the server refused it).
function recoveryCall(raw, wallNowMs) {
  const s = parseStored(raw);
  if (!s || typeof s.refresh_token !== 'string' || !s.refresh_token) return 'none';
  const exp = Number(s.expires_at);
  if (!isFinite(exp) || exp * 1000 - wallNowMs < EXPIRY_MARGIN_MS) return 'get';
  return 'refresh';
}

function jsonResponse(obj, from) {
  const headers = new Headers(from ? from.headers : { 'Content-Type': 'application/json' });
  headers.delete('content-length');
  if (!headers.has('content-type')) headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(obj), { status: from ? from.status : 200, statusText: from ? from.statusText : '', headers });
}

function createAuthFetch(opts = {}) {
  const baseFetch = opts.fetch || ((...a) => fetch(...a));
  // Breaker windows on a monotonic clock where there is one (immune to the user moving the time).
  const mono = opts.now || (() => (typeof performance !== 'undefined' && performance && typeof performance.now === 'function' ? performance.now() : Date.now()));
  const wall = () => Date.now(); // what auth-js compares expires_at with
  const readStored = opts.readStoredSession || (async () => null);
  const schedule = opts.schedule || ((fn) => setTimeout(fn, 0));
  const deviceExpiry = opts.deviceExpiry !== false;

  let canRecover = () => false;
  let recover = null;
  const recoveredHooks = new Set();

  const sent = []; // when each real refresh request left (mono)
  let holdStart = null; // the last 429 (mono)
  let stale = false; // a stand-in was handed out since the last real session
  let lastRecover = null;

  // "elapsed" with a clock that may run backwards: a negative gap counts as elapsed.
  const within = (since, ms, t) => since != null && t - since >= 0 && t - since < ms;

  async function standIn(refreshToken) {
    if (!refreshToken) return null;
    let s;
    try { s = parseStored(await readStored()); } catch { s = null; }
    if (!s || s.refresh_token !== refreshToken || typeof s.access_token !== 'string' || !s.user) return null;
    stale = true;
    return jsonResponse({ ...s, expires_in: STAND_IN_SECONDS, expires_at: Math.round(wall() / 1000) + STAND_IN_SECONDS });
  }

  // (A): a successful JSON auth answer that carries a session gets a device-relative expiry.
  async function withDeviceExpiry(res) {
    if (!res || !res.ok || !res.headers || typeof res.clone !== 'function') return res;
    const ct = (res.headers.get && res.headers.get('content-type')) || '';
    if (!/json/i.test(ct)) return res;
    let data;
    try { data = JSON.parse(await res.clone().text()); } catch { return res; }
    if (!data || typeof data !== 'object' || typeof data.access_token !== 'string' || typeof data.expires_in !== 'number' || !isFinite(data.expires_in)) return res;
    stale = false; // a real session from the server
    if (!deviceExpiry) return res;
    return jsonResponse({ ...data, expires_at: Math.round(wall() / 1000) + data.expires_in }, res);
  }

  async function refreshFetch(input, init) {
    const t = mono();
    while (sent.length && !within(sent[0], WINDOW_MS, t)) sent.shift();
    const rt = bodyRefreshToken(init);
    if (within(holdStart, HOLD_MS, t) || sent.length >= BUDGET) {
      const r = await standIn(rt);
      if (r) return r;
    }
    sent.push(t);
    let res;
    try {
      res = await baseFetch(input, init);
    } catch (e) {
      // Offline / connection dropped (A-140): keep the stored session as it is.
      const r = await standIn(rt);
      if (r) return r;
      throw e;
    }
    if (res && (res.status === 429 || res.status >= 500)) {
      if (res.status === 429) holdStart = mono();
      const r = await standIn(rt);
      if (r) return r;
      return res;
    }
    return withDeviceExpiry(res);
  }

  function maybeRecover() {
    if (!recover || !canRecover()) return false;
    const t = mono();
    if (within(lastRecover, RECOVER_GAP_MS, t)) return false;
    lastRecover = t;
    schedule(async () => {
      try {
        if (!recover || !canRecover()) return;
        const r = await recover();
        const ok = !!(r && !r.error && r.data && r.data.session) && !stale;
        if (ok) for (const fn of recoveredHooks) { try { fn(); } catch { /* a hook never breaks the session */ } }
      } catch { /* the next trigger tries again */ }
    });
    return true;
  }

  async function dataFetch(input, init) {
    const res = await baseFetch(input, init);
    if (res && res.status === 401 && typeof res.clone === 'function') {
      let text = '';
      try { text = await res.clone().text(); } catch { text = ''; }
      if (looksJwtExpired(text)) maybeRecover();
    }
    return res;
  }

  async function authSafeFetch(input, init) {
    const u = urlOf(input);
    if (isRefreshUrl(u) && methodOf(input, init) === 'POST') return refreshFetch(input, init);
    if (isAuthUrl(u)) return withDeviceExpiry(await baseFetch(input, init));
    if (isDataUrl(u)) return dataFetch(input, init);
    return baseFetch(input, init);
  }

  return {
    fetch: authSafeFetch,
    setRecovery(o) {
      if (o && typeof o.canRecover === 'function') canRecover = o.canRecover;
      if (o && typeof o.recover === 'function') recover = o.recover;
    },
    onRecovered(fn) { recoveredHooks.add(fn); return () => recoveredHooks.delete(fn); },
    // The network is back: one refresh if the session in use is a stand-in.
    networkBack() { return stale ? maybeRecover() : false; },
    isStale() { return stale; },
    _markStale() { stale = true; },
  };
}

module.exports = { createAuthFetch, recoveryCall, STAND_IN_SECONDS, BUDGET, WINDOW_MS, HOLD_MS };
