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
//     Gate B 1: a quick network failure or a 502/503/504 while NetInfo says ONLINE is handed back
//     to auth-js, whose own quick retries (200, 400, 800 ms) recover an answer that was lost after
//     the server rotated the token (GoTrue returns the active token when its parent is reused);
//     the attempt past the 3-per-60 s budget becomes the stand-in. Offline, 429 and other 5xx: the
//     stand-in at once.
//     Gate B 7: RN Android's OkHttp has no timeouts, so a network that is up but carries nothing
//     would hold the refresh (and auth-js's lock: cold start, sync, sign-out, delete) forever. The
//     refresh POST is aborted after 10 s and answered with the stand-in at once (a retry would wait
//     another 10 s, and three of them pass auth-js's 30 s retry window = no session).
// (C) Recovery. A database "JWT expired" (clock moved back after a session was saved), an auth
//     "bad_jwt" / token expired (not on logout), a function's expired-JWT 401, or the network coming
//     back after a stand-in asks for ONE deferred refresh: never inside a request or the auth lock,
//     only while the app is in the foreground, at most once per 60 s (a recovery that itself ended
//     in a NETWORK stand-in does not count). When a stand-in turns into a real session — by a
//     recovery or by the normal auto-refresh — the "recovered" hooks run once (lib/sync: sync).

const BUDGET = 3;
const WINDOW_MS = 60 * 1000;
const HOLD_MS = 60 * 1000;
const REFRESH_TIMEOUT_MS = 10 * 1000;
const RETRYABLE_STATUS = [502, 503, 504]; // auth-js retries these itself (lib/fetch.ts NETWORK_ERROR_CODES)
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
const isFunctionsUrl = (u) => /\/functions\/v1\//.test(u);
const isLogoutUrl = (u) => /\/auth\/v1\/logout(?:\?|#|$)/.test(u);
// GoTrue: 401/403 with code bad_jwt, or a message saying the token expired.
const authTokenExpired = (text) => /"(?:error_)?code"\s*:\s*"bad_jwt"|token is expired|jwt expired|token has expired/i.test(String(text || ''));
// The functions gateway answers "Invalid JWT" (also for an expired one); our functions answer
// "Invalid session" when they cannot read the user from the token. Not "Missing authorization header".
const functionTokenExpired = (text) => /invalid jwt|jwt expired|token is expired|invalid session/i.test(String(text || ''));

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

// NetInfo state → offline? Not connected, or connected with internet known to be unreachable
// (Wi-Fi without internet). isInternetReachable null (not measured yet) counts as online, as lib/sync
// does; no state at all counts as offline.
function netInfoOffline(state) {
  if (!state) return true;
  return !(state.isConnected && state.isInternetReachable !== false);
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
  const deviceExpiry = !opts.__testNoDeviceExpiry; // test hook only (clockSkewSession T4)
  // Is the phone offline? true → the stand-in at once; false → auth-js's quick retries. Without a
  // check (tests, the reset-link client) offline is assumed, and a check that throws counts as
  // offline. The app passes NetInfo through netInfoOffline below, where isInternetReachable null
  // (not measured yet) counts as online, as in lib/sync.
  const isOffline = opts.isOffline || (async () => true);
  const refreshTimeoutMs = opts.refreshTimeoutMs || REFRESH_TIMEOUT_MS;

  let canRecover = () => false;
  let recover = null;
  const recoveredHooks = new Set();

  const sent = []; // when each real refresh request left (mono)
  let holdStart = null; // the last 429 (mono)
  let stale = false; // a stand-in was handed out since the last real session
  let lastRecover = null;
  let lastStandIn = null; // why the last stand-in was handed out: 'network' | 'rate' | 'held' | 'server'
  let fires = 0; // how many times the recovered hooks were fired

  // "elapsed" with a clock that may run backwards: a negative gap counts as elapsed.
  const within = (since, ms, t) => since != null && t - since >= 0 && t - since < ms;

  function fireRecovered() {
    fires += 1;
    schedule(() => {
      if (!canRecover()) return; // the foreground's own resume sync covers the rest
      for (const fn of recoveredHooks) { try { fn(); } catch { /* a hook never breaks the session */ } }
    });
  }

  async function standIn(refreshToken, why) {
    if (!refreshToken) return null;
    let s;
    try { s = parseStored(await readStored()); } catch { s = null; }
    if (!s || s.refresh_token !== refreshToken || typeof s.access_token !== 'string' || !s.user) return null;
    stale = true;
    lastStandIn = why;
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
    if (stale) { stale = false; fireRecovered(); } // a real session again: pending rows can go
    if (!deviceExpiry) return res;
    return jsonResponse({ ...data, expires_at: Math.round(wall() / 1000) + data.expires_in }, res);
  }

  // The refresh POST with a timeout (Gate B 7): rejects with name 'TimeoutError' even when the base
  // fetch ignores the abort signal.
  function fetchWithTimeout(input, init) {
    const ac = typeof AbortController !== 'undefined' && !(init && init.signal) ? new AbortController() : null;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { if (ac) ac.abort(); } catch { /* ignore */ }
        reject(Object.assign(new Error('refresh timed out'), { name: 'TimeoutError' }));
      }, refreshTimeoutMs);
    });
    const req = Promise.resolve().then(() => baseFetch(input, ac ? { ...init, signal: ac.signal } : init));
    req.catch(() => {}); // a late rejection after the timeout is not unhandled
    return Promise.race([req, timeout]).finally(() => clearTimeout(timer));
  }

  async function offlineNow() {
    try { return (await isOffline()) !== false; } catch { return true; }
  }

  async function refreshFetch(input, init) {
    const t = mono();
    while (sent.length && !within(sent[0], WINDOW_MS, t)) sent.shift();
    const rt = bodyRefreshToken(init);
    if (within(holdStart, HOLD_MS, t) || sent.length >= BUDGET) {
      const r = await standIn(rt, 'held');
      if (r) return r;
    }
    sent.push(t);
    let res;
    try {
      res = await fetchWithTimeout(input, init);
    } catch (e) {
      // Stalled (timeout) or offline (A-140): keep the stored session as it is. Online and quick:
      // let auth-js retry (the answer may have been lost after the server rotated the token).
      const stalled = !!e && (e.name === 'TimeoutError' || e.name === 'AbortError');
      if (stalled || (await offlineNow())) {
        const r = await standIn(rt, 'network');
        if (r) return r;
      }
      throw e;
    }
    if (res && res.status === 429) {
      holdStart = mono();
      const r = await standIn(rt, 'rate');
      return r || res;
    }
    if (res && res.status >= 500) {
      if (RETRYABLE_STATUS.includes(res.status) && !(await offlineNow())) return res; // auth-js retries
      const r = await standIn(rt, 'server');
      return r || res;
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
        if (!recover || !canRecover()) { lastRecover = null; return; }
        const before = fires;
        const r = await recover();
        const ok = !!(r && !r.error && r.data && r.data.session) && !stale;
        // A real refresh already fired the hooks (stand-in → session); a locally valid session the
        // server refused (clock moved back) fires them here. Once either way.
        if (ok && fires === before) fireRecovered();
        // Still offline: this attempt does not lock the next reconnect out (a 429 hold still does).
        if (stale && lastStandIn === 'network') lastRecover = null;
      } catch { /* the next trigger tries again */ }
    });
    return true;
  }

  async function bodyText(res) {
    try { return await res.clone().text(); } catch { return ''; }
  }

  async function dataFetch(input, init) {
    const res = await baseFetch(input, init);
    if (res && res.status === 401 && typeof res.clone === 'function' && looksJwtExpired(await bodyText(res))) maybeRecover();
    return res;
  }

  async function functionsFetch(input, init) {
    const res = await baseFetch(input, init);
    if (res && res.status === 401 && typeof res.clone === 'function' && functionTokenExpired(await bodyText(res))) maybeRecover();
    return res;
  }

  async function authFetch(input, init, u) {
    const res = await baseFetch(input, init);
    if (res && (res.status === 401 || res.status === 403) && !isLogoutUrl(u) && typeof res.clone === 'function'
      && authTokenExpired(await bodyText(res))) maybeRecover();
    return withDeviceExpiry(res);
  }

  async function authSafeFetch(input, init) {
    const u = urlOf(input);
    if (isRefreshUrl(u) && methodOf(input, init) === 'POST') return refreshFetch(input, init);
    if (isAuthUrl(u)) return authFetch(input, init, u);
    if (isDataUrl(u)) return dataFetch(input, init);
    if (isFunctionsUrl(u)) return functionsFetch(input, init);
    return baseFetch(input, init);
  }

  const api = {
    fetch: authSafeFetch,
    setRecovery(o) {
      if (o && typeof o.canRecover === 'function') canRecover = o.canRecover;
      if (o && typeof o.recover === 'function') recover = o.recover;
    },
    onRecovered(fn) { recoveredHooks.add(fn); return () => recoveredHooks.delete(fn); },
    // The network is back: one refresh if the session in use is a stand-in.
    networkBack() { return stale ? maybeRecover() : false; },
  };
  if (opts.__test) api.__test = { markStale: () => { stale = true; }, isStale: () => stale };
  return api;
}

module.exports = { createAuthFetch, recoveryCall, netInfoOffline, STAND_IN_SECONDS, BUDGET, WINDOW_MS, HOLD_MS, REFRESH_TIMEOUT_MS };
